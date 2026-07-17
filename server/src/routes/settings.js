const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'yl-blog-secret-key-2026';

function authMiddleware(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ error: '未登录' });
  try {
    const token = auth.split(' ')[1];
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: '登录已过期' });
  }
}

// Get all settings (public)
router.get('/', (req, res) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

// Update settings (protected)
router.put('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { key, value } = req.body;
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
  res.json({ message: '保存成功' });
});

// POST /api/settings/rebuild-embeddings — regenerate all post embeddings
router.post('/rebuild-embeddings', authMiddleware, async (req, res) => {
  try {
    const { rebuildAllEmbeddings } = require('../rag');
    const result = await rebuildAllEmbeddings();
    res.json(result);
  } catch (err) {
    console.error('[rag] rebuild error:', err);
    res.status(500).json({ error: '重建嵌入向量失败: ' + err.message });
  }
});

// GET /api/settings/rag-search — test RAG semantic search (admin only)
router.get('/rag-search', authMiddleware, async (req, res) => {
  try {
    const { q, k } = req.query;
    if (!q || !q.trim()) {
      return res.status(400).json({ error: '请输入搜索关键词' });
    }
    const topK = Math.min(Math.max(parseInt(k) || 3, 1), 10);
    const { searchSimilarPosts } = require('../rag');
    const results = await searchSimilarPosts(q.trim(), topK);
    res.json({
      query: q.trim(),
      results: results.map(p => ({
        id: p.id,
        title: p.title,
        slug: p.slug,
        excerpt: p.excerpt,
        tags: p.tags,
        similarity: p.similarity ? Math.round(p.similarity * 10000) / 10000 : 0,
        created_at: p.created_at
      }))
    });
  } catch (err) {
    console.error('[rag] search error:', err);
    res.status(500).json({ error: '搜索失败: ' + err.message });
  }
});

// GET /api/settings/rag-stats — embedding statistics (admin only)
router.get('/rag-stats', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const totalPosts = db.prepare('SELECT COUNT(*) as cnt FROM posts WHERE published = 1').get().cnt;
    const withEmbeddings = db.prepare(
      'SELECT COUNT(*) as cnt FROM post_embeddings pe JOIN posts p ON pe.post_id = p.id WHERE p.published = 1'
    ).get().cnt;
    const withoutEmbeddings = totalPosts - withEmbeddings;
    const model = db.prepare('SELECT DISTINCT embedding_model FROM post_embeddings LIMIT 1').get();
    const dims = db.prepare('SELECT embedding FROM post_embeddings LIMIT 1').get();
    let vectorDims = 0;
    if (dims) {
      try { vectorDims = new Float32Array(dims.embedding.buffer).length; } catch {}
    }
    res.json({
      totalPosts,
      withEmbeddings,
      withoutEmbeddings,
      embeddingModel: model?.embedding_model || null,
      vectorDimensions: vectorDims
    });
  } catch (err) {
    console.error('[rag] stats error:', err);
    res.status(500).json({ error: '读取统计信息失败' });
  }
});

// POST /api/settings/rag-feed — manually feed raw text for embedding (admin only)
router.post('/rag-feed', authMiddleware, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: '请输入文本' });
    }
    const { generateEmbedding } = require('../rag');
    const embedding = await generateEmbedding(text.trim(), false);
    if (!embedding) {
      return res.status(500).json({ error: '嵌入向量生成失败' });
    }
    const vec = Array.from(embedding).slice(0, 5).map(v => Math.round(v * 10000) / 10000);
    res.json({
      dimensions: embedding.length,
      preview: vec,
      model: 'Xenova/bge-m3'
    });
  } catch (err) {
    console.error('[rag] feed error:', err);
    res.status(500).json({ error: '生成嵌入向量失败: ' + err.message });
  }
});

module.exports = router;
