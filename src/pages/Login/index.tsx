import { useAuth } from '@/auth/AuthContext'
import logo from '@/assets/logo.svg'
import { ApiError } from '@/api/client'
import type React from 'react'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'

type Mode = 'login' | 'register'

const LoginPage: React.FC = () => {
  const { user, syncing, login, register } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<Mode>('login')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (user) {
    return <Navigate to="/" replace />
  }

  const switchMode = (next: Mode) => {
    setMode(next)
    setError('')
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!username.trim()) {
      setError('请输入用户名')
      return
    }
    if (!password) {
      setError('请输入密码')
      return
    }

    setSubmitting(true)
    setError('')
    try {
      if (mode === 'login') {
        await login(username.trim(), password)
      } else {
        await register(username.trim(), password)
      }
      navigate('/', { replace: true })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '操作失败, 请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-gray-800 shadow-sm outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-200 dark:border-slate-600 dark:bg-slate-800 dark:text-gray-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-900'

  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-[#faf9ff] px-4 transition-colors duration-300 dark:bg-gray-900">
      <div className="my-card w-full max-w-md rounded-2xl bg-white p-8 transition-colors duration-300 dark:bg-gray-800">
        <div className="mb-6 flex flex-col items-center">
          <img src={logo} className="mb-3 h-16 w-16" alt="Qwerty Learner Logo" />
          <h1 className="text-2xl font-bold text-indigo-500">Qwerty Learner</h1>
          <p className="mt-1 text-sm text-gray-400">为键盘工作者设计的单词与肌肉记忆训练软件</p>
        </div>

        <div className="mb-6 grid grid-cols-2 rounded-lg bg-gray-100 p-1 dark:bg-slate-700">
          <button
            type="button"
            onClick={() => switchMode('login')}
            className={`rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'login' ? 'bg-white text-indigo-500 shadow-sm dark:bg-slate-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'
            }`}
          >
            登录
          </button>
          <button
            type="button"
            onClick={() => switchMode('register')}
            className={`rounded-md py-2 text-sm font-medium transition-colors ${
              mode === 'register' ? 'bg-white text-indigo-500 shadow-sm dark:bg-slate-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'
            }`}
          >
            注册
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
              用户名
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              autoComplete="username"
              className={inputClass}
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-gray-600 dark:text-gray-300">
              密码
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              className={inputClass}
            />
            {mode === 'register' && <p className="mt-1 text-xs text-gray-400">密码不限复杂度, 纯数字也可以</p>}
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-500 dark:bg-red-950/40">{error}</p>}
          {(submitting || syncing) && <p className="text-center text-sm text-gray-400">{syncing ? '正在将浏览器数据保存到 SQLite...' : '提交中...'}</p>}

          <button
            type="submit"
            disabled={submitting}
            className="my-btn-primary w-full py-2.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {mode === 'login' ? '登录' : '注册并登录'}
          </button>
        </form>
      </div>
    </main>
  )
}

export default LoginPage
