/**
 * RAG (Retrieval-Augmented Generation) module for blog AI chat.
 *
 * Uses @xenova/transformers with all-MiniLM-L6-v2 to generate 384-dim
 * semantic vectors locally (no API calls, fully offline after first download).
 * Vectors are stored as Float32 BLOBs in SQLite, and cosine-similarity
 * search is performed at query time to find the most relevant posts.
 *
 * Falls back to keyword matching when:
 *   - The local model hasn't been downloaded yet
 *   - The model fails for any reason
 *   - No embeddings exist yet in the database
 */

const { getDb } = require('./db');

// ---- config ----
const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';
const VECTOR_DIMS = 384;
const MAX_EMBEDDING_CHARS = 2000; // all-MiniLM-L6-v2 works best up to ~128 tokens (~500 chars); cap conservatively

// ---- proxy-aware fetch for model download ----
const { ProxyAgent } = require('undici');
const proxyUrl = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || process.env.http_proxy || process.env.https_proxy;
const dispatcher = proxyUrl
  ? new ProxyAgent({ uri: proxyUrl, requestTls: { rejectUnauthorized: false } })
  : undefined;

// Patch global fetch so @xenova can download model files through proxy
if (dispatcher) {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (url, opts) => origFetch(url, { ...opts, dispatcher });
}

// ---- lazy model singleton ----
let _embeddingModel = null;
let _modelLoading = false;
let _modelLoadPromise = null;

async function getEmbeddingModel() {
  if (_embeddingModel) return _embeddingModel;
  if (_modelLoading) return _modelLoadPromise;

  _modelLoading = true;
  _modelLoadPromise = (async () => {
    const { pipeline } = require('@xenova/transformers');
    console.log('[rag] Loading local embedding model:', MODEL_NAME);
    const t0 = Date.now();
    _embeddingModel = await pipeline('feature-extraction', MODEL_NAME);
    console.log('[rag] Model loaded in', Date.now() - t0, 'ms');
    return _embeddingModel;
  })();

  return _modelLoadPromise;
}

// ---- helpers ----

function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// ---- embedding ----

/**
 * Generate an embedding vector for a text string using the local model.
 * Returns a Float32Array (384-dim) or null on any failure.
 */
async function generateEmbedding(text) {
  if (!text) return null;

  const input = text.slice(0, MAX_EMBEDDING_CHARS);

  try {
    const model = await getEmbeddingModel();
    const output = await model(input, { pooling: 'mean', normalize: true });
    return new Float32Array(output.data);
  } catch (err) {
    console.error('[rag] embedding generation error:', err.message);
    return null;
  }
}

// ---- storage ----

/**
 * Build the embedding text for a post. Concatenates title, tags, excerpt,
 * and content into one string.
 */
function buildPostText(post) {
  let tags = [];
  try { tags = JSON.parse(post.tags || '[]'); } catch {}
  const tagStr = tags.length > 0 ? tags.join(', ') : '';
  return `${post.title}\n${tagStr}\n${post.excerpt || ''}\n${post.content || ''}`;
}

/**
 * Generate and store an embedding for a single post.
 * Fire-and-forget — callers should .catch() the returned promise.
 * Returns true on success, false on failure.
 */
async function storeEmbedding(postId) {
  const db = getDb();
  const post = db.prepare(
    'SELECT title, excerpt, content, tags FROM posts WHERE id = ?'
  ).get(postId);
  if (!post) return false;

  const text = buildPostText(post);
  const embedding = await generateEmbedding(text);
  if (!embedding) return false;

  const buf = Buffer.from(embedding.buffer);
  db.prepare(
    'INSERT OR REPLACE INTO post_embeddings (post_id, embedding, embedding_model) VALUES (?, ?, ?)'
  ).run(postId, buf, MODEL_NAME);

  return true;
}

// ---- fallback: keyword search ----

/**
 * Simple keyword-based post search.
 * Scores posts by how many query terms appear in title + tags + excerpt + content.
 */
function keywordSearch(query, topK = 3) {
  const db = getDb();
  const posts = db.prepare(
    'SELECT id, title, slug, content, excerpt, tags, created_at FROM posts WHERE published = 1'
  ).all();

  // Split into Chinese/English tokens
  const terms = query
    .toLowerCase()
    .split(/[\s,，。！？、]+/)
    .filter(t => t.length > 0);

  if (terms.length === 0 || posts.length === 0) {
    return posts.slice(0, topK).map(p => ({
      ...p, tags: JSON.parse(p.tags || '[]'), similarity: 0
    }));
  }

  const scored = posts.map(post => {
    const haystack = `${post.title} ${post.excerpt || ''} ${post.tags || ''} ${post.content || ''}`.toLowerCase();
    let score = 0;
    for (const term of terms) {
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const matches = haystack.match(new RegExp(escaped, 'gi'));
      if (matches) score += matches.length;
    }
    return { post, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(s => ({
    ...s.post,
    tags: JSON.parse(s.post.tags || '[]'),
    similarity: s.score / Math.max(1, terms.length)
  }));
}

// ---- search ----

/**
 * Search for posts semantically similar to the query.
 * Returns array of post objects with an added `similarity` field.
 *
 * Tries embedding-based search first; falls back to keyword search if:
 *   - The local model fails for any reason
 *   - No embeddings exist in the database
 */
async function searchSimilarPosts(query, topK = 3) {
  if (!query) return keywordSearch(query, topK);

  const db = getDb();

  // Attempt embedding-based search
  const queryEmbedding = await generateEmbedding(query);
  if (!queryEmbedding) return keywordSearch(query, topK);

  // Load all stored embeddings for published posts
  const embedRows = db.prepare(
    'SELECT pe.post_id, pe.embedding FROM post_embeddings pe ' +
    'JOIN posts p ON pe.post_id = p.id WHERE p.published = 1'
  ).all();

  if (embedRows.length === 0) return keywordSearch(query, topK);

  // Compute cosine similarity against every stored vector
  const scored = [];
  for (const row of embedRows) {
    try {
      const storedVec = new Float32Array(row.embedding.buffer);
      const sim = cosineSimilarity(queryEmbedding, storedVec);
      scored.push({ postId: row.post_id, similarity: sim });
    } catch {
      // Corrupt BLOB — skip
    }
  }

  scored.sort((a, b) => b.similarity - a.similarity);
  const topIds = scored.slice(0, topK).map(s => s.postId);

  if (topIds.length === 0) return [];

  // Fetch full post data for top matches
  const placeholders = topIds.map(() => '?').join(',');
  const posts = db.prepare(
    `SELECT id, title, slug, content, excerpt, tags, created_at
     FROM posts WHERE id IN (${placeholders})`
  ).all(...topIds);

  // Attach similarity scores and preserve ranking order
  const scoreMap = new Map(scored.map(s => [s.postId, s.similarity]));
  const result = posts.map(p => ({
    ...p,
    tags: JSON.parse(p.tags || '[]'),
    similarity: scoreMap.get(p.id)
  }));
  result.sort((a, b) => (b.similarity || 0) - (a.similarity || 0));

  return result;
}

// ---- rebuild ----

/**
 * Rebuild embeddings for all published posts.
 * Returns { success, failed } counts.
 */
async function rebuildAllEmbeddings() {
  const db = getDb();
  const posts = db.prepare('SELECT id FROM posts WHERE published = 1').all();

  let success = 0;
  let failed = 0;

  for (const post of posts) {
    const ok = await storeEmbedding(post.id);
    if (ok) success++;
    else failed++;
  }

  return { success, failed };
}

module.exports = {
  generateEmbedding,
  storeEmbedding,
  searchSimilarPosts,
  rebuildAllEmbeddings,
  // Exported for testing
  cosineSimilarity,
  keywordSearch
};
