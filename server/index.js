const crypto = require('node:crypto')
const fs = require('node:fs')
const path = require('node:path')
const express = require('express')
const { openDatabase, DB_PATH, getSettings, mergeSettings, getRecords, mergeRecords, clearUserData } = require('./db')

const app = express()
const PORT = Number(process.env.PORT) || 3001

openDatabase()

app.use(express.json({ limit: '50mb' }))

function hashPassword(password, salt) {
  return crypto.scryptSync(String(password), salt, 64).toString('hex')
}

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  const db = require('./db').getDatabase()
  db.prepare('INSERT INTO sessions (token, user_id, created_at) VALUES (?, ?, ?)').run(
    token,
    userId,
    Date.now(),
  )
  return token
}

function publicUser(user) {
  return { id: user.id, username: user.username, createdAt: user.created_at }
}

function findUserByToken(req) {
  const authHeader = req.headers.authorization || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null
  if (!token) return null
  const db = require('./db').getDatabase()
  const session = db
    .prepare(
      `SELECT sessions.token, sessions.user_id, users.id, users.username, users.created_at
       FROM sessions JOIN users ON users.id = sessions.user_id
       WHERE sessions.token = ?`,
    )
    .get(token)
  return session || null
}

function requireAuth(req, res, next) {
  const session = findUserByToken(req)
  if (!session) {
    return res.status(401).json({ error: '未登录或登录已过期' })
  }
  req.user = { id: session.user_id, username: session.username, createdAt: session.created_at }
  req.token = session.token
  next()
}

function validateCredentials(username, password) {
  if (typeof username !== 'string' || username.trim().length === 0) {
    return '用户名不能为空'
  }
  // 密码不做复杂度限制: 任意非空内容均可, 包括纯数字
  if (typeof password !== 'string' || password.length === 0) {
    return '密码不能为空'
  }
  return null
}

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body || {}
  const error = validateCredentials(username, password)
  if (error) {
    return res.status(400).json({ error })
  }

  const name = username.trim()
  const db = require('./db').getDatabase()
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(name)
  if (existing) {
    return res.status(409).json({ error: '该用户名已被注册' })
  }

  const salt = crypto.randomBytes(16).toString('hex')
  const passwordHash = hashPassword(password, salt)
  const result = db
    .prepare('INSERT INTO users (username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?)')
    .run(name, passwordHash, salt, Date.now())

  const token = createSession(result.lastInsertRowid)
  res.status(201).json({
    token,
    user: { id: result.lastInsertRowid, username: name, createdAt: Date.now() },
  })
})

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {}
  const error = validateCredentials(username, password)
  if (error) {
    return res.status(400).json({ error })
  }

  const db = require('./db').getDatabase()
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim())
  if (!user) {
    return res.status(401).json({ error: '用户名或密码错误' })
  }

  const passwordHash = hashPassword(password, user.password_salt)
  if (passwordHash !== user.password_hash) {
    return res.status(401).json({ error: '用户名或密码错误' })
  }

  const token = createSession(user.id)
  res.json({ token, user: publicUser(user) })
})

app.post('/api/auth/logout', requireAuth, (req, res) => {
  const db = require('./db').getDatabase()
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token)
  res.status(204).end()
})

app.get('/api/me', requireAuth, (req, res) => {
  res.json({ user: req.user })
})

// 拉取该用户所有数据(设置 + 全部练习记录)
app.get('/api/data', requireAuth, (req, res) => {
  res.json({
    settings: getSettings(req.user.id),
    records: getRecords(req.user.id),
  })
})

// 将浏览器端全部数据(设置 + 练习记录)保存到 SQLite, 按 key/id 合并
app.put('/api/data', requireAuth, (req, res) => {
  const { settings, records, replace } = req.body || {}
  const db = require('./db').getDatabase()
  const save = db.transaction(() => {
    if (replace === true) {
      // 导入备份等场景: 先清空再写入
      clearUserData(req.user.id)
    }
    mergeSettings(req.user.id, settings)
    mergeRecords(req.user.id, records)
  })
  save()
  res.status(204).end()
})

app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

// 生产环境: 托管前端构建产物
const buildDir = path.join(__dirname, '..', 'build')
if (fs.existsSync(buildDir)) {
  app.use(express.static(buildDir))
  app.get(/^\/(?!api).*/, (req, res) => {
    res.sendFile(path.join(buildDir, 'index.html'))
  })
}

app.listen(PORT, () => {
  console.log(`[qwerty-learner] SQLite: ${DB_PATH}`)
  console.log(`[qwerty-learner] Server listening on http://localhost:${PORT}`)
})
