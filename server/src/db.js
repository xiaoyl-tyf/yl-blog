const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'blog.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initTables();
  }
  return db;
}

function initTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      excerpt TEXT DEFAULT '',
      content TEXT NOT NULL,
      cover_image TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      published INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      color TEXT DEFAULT '#6B6B6B'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id, created_at);
  `);

  // Insert default settings
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  );
  insertSetting.run('site_title', 'YL');
  insertSetting.run('site_subtitle', '记录思考，分享见闻');
  insertSetting.run('about_content', '## 关于我\n\n这里是我的个人博客。');
  insertSetting.run('ai_enabled', 'false');
  insertSetting.run('ai_api_key', '');
  insertSetting.run('ai_model', 'claude-opus-4-8');
  insertSetting.run('ai_system_prompt', '你是这个个人博客的AI助手。你可以根据提供的文章列表回答访客关于博客内容的问题。请用中文回答，保持友好、简洁的风格。如果访客问的问题与博客内容无关，礼貌地说明你主要帮助解答博客相关的问题。');
}

// Delete chat messages older than `keepDays` days. Returns count of deleted rows.
function cleanOldMessages(keepDays = 30) {
  if (!db) return 0;
  const result = db.prepare(
    "DELETE FROM chat_messages WHERE created_at < datetime('now', ?)"
  ).run(`-${keepDays} days`);
  if (result.changes > 0) {
    console.log(`[db] cleaned ${result.changes} old chat messages`);
  }
  return result.changes;
}

module.exports = { getDb, cleanOldMessages };
