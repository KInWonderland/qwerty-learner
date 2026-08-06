import type { SyncData } from '@/utils/sync'

const TOKEN_KEY = 'qwerty.learner.token'

export type User = {
  id: number
  username: string
  createdAt: number
}

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getToken(): string | null {
  return window.localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) {
    window.localStorage.setItem(TOKEN_KEY, token)
  } else {
    window.localStorage.removeItem(TOKEN_KEY)
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  let response: Response
  try {
    response = await fetch(path, { ...options, headers })
  } catch {
    throw new ApiError('无法连接服务器, 请确认后端已启动', 0)
  }

  if (response.status === 204) {
    return undefined as T
  }

  let body: unknown = null
  try {
    body = await response.json()
  } catch {
    // ignore invalid json body
  }

  if (!response.ok) {
    const message = body && typeof body === 'object' && 'error' in body ? String((body as { error: string }).error) : `请求失败 (${response.status})`
    throw new ApiError(message, response.status)
  }

  return body as T
}

export const api = {
  register(username: string, password: string): Promise<{ token: string; user: User }> {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  login(username: string, password: string): Promise<{ token: string; user: User }> {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    })
  },

  logout(): Promise<void> {
    return request('/api/auth/logout', { method: 'POST' })
  },

  me(): Promise<{ user: User }> {
    return request('/api/me')
  },

  getData(): Promise<SyncData> {
    return request('/api/data')
  },

  putData(data: SyncData, replace = false): Promise<void> {
    return request('/api/data', {
      method: 'PUT',
      body: JSON.stringify({ ...data, replace }),
    })
  },
}
