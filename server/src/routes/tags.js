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

// Get all tags with post count
router.get('/', (req, res) => {
  const db = getDb();
  const tags = db.prepare(`
    SELECT DISTINCT json_each.value as name
    FROM posts, json_each(posts.tags)
    WHERE posts.published = 1
    ORDER BY name
  `).all();

  // Count posts per tag
  const tagCounts = {};
  tags.forEach(t => {
    tagCounts[t.name] = (tagCounts[t.name] || 0) + 1;
  });

  const result = Object.entries(tagCounts).map(([name, count]) => ({ name, count }));
  res.json(result);
});

module.exports = router;
