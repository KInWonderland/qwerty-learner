const fs = require('node:fs')
const path = require('node:path')
const Database = require('better-sqlite3')

const DB_PATH = process.env.SQLITE_PATH || path.join(__dirname, '..', 'data', 'qwerty-learner.db')

// 浏览器端 IndexedDB 表名 -> SQLite 表名与列映射
// 记录表的数据由前端按原样同步, 这里保留完整字段, 便于后续查询分析
const RECORD_TABLES = {
  wordRecords: {
    table: 'word_records',
    columns: ['id', 'word', 'timeStamp', 'dict', 'chapter', 'timing', 'wrongCount', 'mistakes'],
  },
  chapterRecords: {
    table: 'chapter_records',
    columns: [
      'id',
      'dict',
      'chapter',
      'timeStamp',
      'time',
      'correctCount',
      'wrongCount',
      'wordCount',
      'correctWordIndexes',
      'wordNumber',
      'wordRecordIds',
    ],
  },
  reviewRecords: {
    table: 'review_records',
    columns: ['id', 'dict', 'index', 'createTime', 'isFinished', 'words'],
  },
  revisionDictRecords: {
    table: 'revision_dict_records',
    columns: ['id', 'dict', 'revisionIndex', 'createdTime'],
  },
  revisionWordRecords: {
    table: 'revision_word_records',
    columns: ['id', 'word', 'timeStamp', 'dict', 'errorCount'],
  },
}

let db = null

function openDatabase() {
  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
  db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  initSchema()
  return db
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key TEXT NOT NULL,
      value TEXT,
      UNIQUE(user_id, key)
    );

    CREATE TABLE IF NOT EXISTS word_records (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      time_stamp INTEGER NOT NULL,
      dict TEXT NOT NULL,
      chapter INTEGER,
      timing TEXT NOT NULL DEFAULT '[]',
      wrong_count INTEGER NOT NULL DEFAULT 0,
      mistakes TEXT NOT NULL DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS chapter_records (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dict TEXT NOT NULL,
      chapter INTEGER,
      time_stamp INTEGER NOT NULL,
      time INTEGER NOT NULL DEFAULT 0,
      correct_count INTEGER NOT NULL DEFAULT 0,
      wrong_count INTEGER NOT NULL DEFAULT 0,
      word_count INTEGER NOT NULL DEFAULT 0,
      correct_word_indexes TEXT NOT NULL DEFAULT '[]',
      word_number INTEGER NOT NULL DEFAULT 0,
      word_record_ids TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS review_records (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dict TEXT NOT NULL,
      record_index INTEGER NOT NULL DEFAULT 0,
      create_time INTEGER NOT NULL,
      is_finished INTEGER NOT NULL DEFAULT 0,
      words TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS revision_dict_records (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      dict TEXT NOT NULL,
      revision_index INTEGER NOT NULL DEFAULT 0,
      created_time INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS revision_word_records (
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      word TEXT NOT NULL,
      time_stamp INTEGER NOT NULL,
      dict TEXT NOT NULL,
      error_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_settings_user ON settings(user_id);
    CREATE INDEX IF NOT EXISTS idx_word_records_user ON word_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_chapter_records_user ON chapter_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_review_records_user ON review_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_revision_dict_records_user ON revision_dict_records(user_id);
    CREATE INDEX IF NOT EXISTS idx_revision_word_records_user ON revision_word_records(user_id);
  `)
}

// 将前端 camelCase 行转为数据库可写入的格式
function toDbRow(definition, row) {
  const out = { id: row.id }
  const jsonColumns = new Set(['timing', 'mistakes', 'correctWordIndexes', 'wordRecordIds', 'words'])
  const booleanColumns = new Set(['isFinished'])
  for (const column of definition.columns) {
    if (column === 'id') continue
    let value = row[column]
    if (jsonColumns.has(column) && typeof value !== 'string') {
      value = JSON.stringify(value ?? (column === 'words' || column === 'correct_word_indexes' || column === 'word_record_ids' || column === 'timing' ? [] : {}))
    }
    if (booleanColumns.has(column) && typeof value === 'boolean') {
      value = value ? 1 : 0
    }
    out[camelToSnake(column)] = value
  }
  return out
}

// 将数据库行转回前端 camelCase 格式
function toApiRow(definition, row) {
  const out = { id: row.id }
  const jsonColumns = new Set(['timing', 'mistakes', 'correctWordIndexes', 'wordRecordIds', 'words'])
  const booleanColumns = new Set(['isFinished'])
  for (const column of definition.columns) {
    if (column === 'id') continue
    let value = row[camelToSnake(column)]
    if (jsonColumns.has(column) && typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch {
        value = undefined
      }
    }
    if (booleanColumns.has(column)) {
      value = Boolean(value)
    }
    out[column] = value
  }
  return out
}

function camelToSnake(str) {
  if (str === 'index') return 'record_index'
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function getSettings(userId) {
  const rows = db.prepare('SELECT key, value FROM settings WHERE user_id = ?').all(userId)
  return rows.map((row) => ({ key: row.key, value: row.value }))
}

// 按 key 合并设置, 不清除服务器上已有但本地缺失的键, 避免同步竞争时丢失数据
function mergeSettings(userId, settings) {
  const upsertStmt = db.prepare(
    'INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value',
  )
  for (const item of settings || []) {
    if (item && typeof item.key === 'string') {
      upsertStmt.run(userId, item.key, item.value == null ? null : String(item.value))
    }
  }
}

function getRecords(userId) {
  const result = {}
  for (const [name, definition] of Object.entries(RECORD_TABLES)) {
    const rows = db.prepare(`SELECT * FROM ${definition.table} WHERE user_id = ?`).all(userId)
    result[name] = rows.map((row) => toApiRow(definition, row))
  }
  return result
}

// 按记录 id 合并写入, 不清除服务器已有记录
function mergeRecords(userId, records) {
  const merge = db.transaction((data) => {
    for (const [name, definition] of Object.entries(RECORD_TABLES)) {
      const rows = data?.[name]
      if (!Array.isArray(rows) || rows.length === 0) continue
      const snakeColumns = definition.columns.map(camelToSnake)
      const insertStmt = db.prepare(
        `INSERT OR REPLACE INTO ${definition.table} (${snakeColumns.join(', ')}, user_id)
         VALUES (${snakeColumns.map(() => '?').join(', ')}, ?)`,
      )
      for (const row of rows) {
        const dbRow = toDbRow(definition, row)
        insertStmt.run(...snakeColumns.map((column) => dbRow[column]), userId)
      }
    }
  })

  merge(records || {})
}

// 清空该用户的全部数据(导入备份时使用)
function clearUserData(userId) {
  const clear = db.transaction(() => {
    db.prepare('DELETE FROM settings WHERE user_id = ?').run(userId)
    for (const definition of Object.values(RECORD_TABLES)) {
      db.prepare(`DELETE FROM ${definition.table} WHERE user_id = ?`).run(userId)
    }
  })
  clear()
}

function getDatabase() {
  return db
}

module.exports = {
  DB_PATH,
  RECORD_TABLES,
  openDatabase,
  getDatabase,
  getSettings,
  mergeSettings,
  getRecords,
  mergeRecords,
  clearUserData,
}
