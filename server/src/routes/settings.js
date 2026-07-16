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

module.exports = router;
