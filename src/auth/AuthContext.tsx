import Loading from '@/components/Loading'
import { type User, api, getToken, setToken } from '@/api/client'
import { applyRemoteData, collectLocalData } from '@/utils/sync'
import type React from 'react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

type AuthContextValue = {
  user: User | null
  loading: boolean
  syncing: boolean
  login: (username: string, password: string) => Promise<void>
  register: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

const AUTO_SYNC_INTERVAL = 30 * 1000

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const syncInFlight = useRef(false)

  // 将浏览器端全部数据保存到 SQLite, 再拉取 SQLite 数据回浏览器端, 保证两边一致
  const syncAll = useCallback(async (): Promise<void> => {
    if (syncInFlight.current) return
    syncInFlight.current = true
    setSyncing(true)
    try {
      const localData = await collectLocalData()
      await api.putData(localData)
      const remoteData = await api.getData()
      await applyRemoteData(remoteData)
    } finally {
      syncInFlight.current = false
      setSyncing(false)
    }
  }, [])

  const restoreSession = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const { user: currentUser } = await api.me()
      setUser(currentUser)
      await syncAll()
    } catch {
      setToken(null)
    } finally {
      setLoading(false)
    }
  }, [syncAll])

  useEffect(() => {
    restoreSession()
  }, [restoreSession])

  // 登录后自动把浏览器数据同步进 SQLite
  useEffect(() => {
    if (!user) return

    const pushLocal = () => {
      if (syncInFlight.current) return
      syncInFlight.current = true
      collectLocalData()
        .then((data) => api.putData(data))
        .catch(() => {
          // 网络异常时静默, 下个周期或下次打开页面会重试
        })
        .finally(() => {
          syncInFlight.current = false
        })
    }

    const interval = window.setInterval(pushLocal, AUTO_SYNC_INTERVAL)
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') pushLocal()
    }
    const onBeforeUnload = () => pushLocal()
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('beforeunload', onBeforeUnload)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [user])

  const login = useCallback(
    async (username: string, password: string) => {
      const { token, user: loggedInUser } = await api.login(username, password)
      setToken(token)
      setUser(loggedInUser)
      await syncAll()
    },
    [syncAll],
  )

  const register = useCallback(
    async (username: string, password: string) => {
      const { token, user: newUser } = await api.register(username, password)
      setToken(token)
      setUser(newUser)
      await syncAll()
    },
    [syncAll],
  )

  const logout = useCallback(async () => {
    try {
      await api.logout()
    } catch {
      // 即使服务器不可达也要清掉本地登录状态
    }
    setToken(null)
    setUser(null)
  }, [])

  return <AuthContext.Provider value={{ user, loading, syncing, login, register, logout }}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用')
  }
  return context
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return <Loading />
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <>{children}</>
}
