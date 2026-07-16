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

// Generate slug from title
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'post';
}

// Get published posts (public)
router.get('/published', (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 10;
  const offset = (page - 1) * limit;
  const tag = req.query.tag;

  let countSql = 'SELECT COUNT(*) as total FROM posts WHERE published = 1';
  let sql = 'SELECT id, title, slug, excerpt, cover_image, tags, created_at, updated_at FROM posts WHERE published = 1';
  const params = [];

  if (tag) {
    countSql += ' AND tags LIKE ?';
    sql += ' AND tags LIKE ?';
    params.push(`%"${tag}"%`);
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const total = db.prepare(countSql).get(...params).total;
  const posts = db.prepare(sql).all(...params, limit, offset);

  res.json({
    posts: posts.map(p => ({
      ...p,
      tags: JSON.parse(p.tags || '[]')
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
});

// Get single post by slug (public)
router.get('/slug/:slug', (req, res) => {
  const db = getDb();
  const post = db.prepare(
    'SELECT * FROM posts WHERE slug = ? AND published = 1'
  ).get(req.params.slug);

  if (!post) {
    return res.status(404).json({ error: '文章不存在' });
  }

  post.tags = JSON.parse(post.tags || '[]');
  res.json(post);
});

// Get single post by id (public)
router.get('/:id', (req, res) => {
  const db = getDb();
  const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(req.params.id);

  if (!post) {
    return res.status(404).json({ error: '文章不存在' });
  }

  post.tags = JSON.parse(post.tags || '[]');
  res.json(post);
});

// CRUD (protected)
router.get('/', authMiddleware, (req, res) => {
  const db = getDb();
  const page = parseInt(req.query.page) || 1;
  const limit = 20;
  const offset = (page - 1) * limit;
  const all = req.query.all === 'true';

  let countSql = 'SELECT COUNT(*) as total FROM posts';
  let sql = 'SELECT id, title, slug, excerpt, cover_image, tags, published, created_at, updated_at FROM posts';

  if (!all) {
    countSql += ' WHERE published = 1';
    sql += ' WHERE published = 1';
  }

  sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';

  const total = db.prepare(countSql).get().total;
  const posts = db.prepare(sql).all(limit, offset);

  res.json({
    posts: posts.map(p => ({
      ...p,
      tags: JSON.parse(p.tags || '[]')
    })),
    total,
    page,
    totalPages: Math.ceil(total / limit)
  });
});

router.post('/', authMiddleware, (req, res) => {
  const db = getDb();
  const { title, content, excerpt, tags, cover_image, published } = req.body;
  let slug = req.body.slug || slugify(title);

  // Ensure unique slug
  let existing = db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
  let counter = 1;
  while (existing) {
    slug = `${slugify(title)}-${counter}`;
    existing = db.prepare('SELECT id FROM posts WHERE slug = ?').get(slug);
    counter++;
  }

  const result = db.prepare(`
    INSERT INTO posts (title, slug, excerpt, content, tags, cover_image, published)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(title, slug, excerpt || '', content, JSON.stringify(tags || []), cover_image || '', published ? 1 : 0);

  res.json({ id: result.lastInsertRowid, slug });

  // Fire-and-forget: generate embedding for semantic search
  const { storeEmbedding } = require('../rag');
  storeEmbedding(result.lastInsertRowid).catch(err => {
    console.error(`[rag] Failed to generate embedding for post ${result.lastInsertRowid}:`, err.message);
  });
});

router.put('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  const { title, content, excerpt, tags, cover_image, published, slug } = req.body;

  db.prepare(`
    UPDATE posts SET title=?, content=?, excerpt=?, tags=?, cover_image=?, published=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    title, content, excerpt || '', JSON.stringify(tags || []), cover_image || '', published ? 1 : 0,
    req.params.id
  );

  res.json({ message: '保存成功' });

  // Fire-and-forget: regenerate embedding on update
  const { storeEmbedding } = require('../rag');
  storeEmbedding(req.params.id).catch(err => {
    console.error(`[rag] Failed to generate embedding for post ${req.params.id}:`, err.message);
  });
});

router.delete('/:id', authMiddleware, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM posts WHERE id = ?').run(req.params.id);
  res.json({ message: '删除成功' });
});

module.exports = router;
