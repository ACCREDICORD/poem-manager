// 纯服务器 HTTP 层：token 管理 + 基础请求 + 原始端点封装。
// 供本地优先层（api.js）与同步引擎（sync.js）共同使用。

const BASE = '/api'
const TOKEN_KEY = 'poem_token'

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export function mediaUrl(path) {
  if (!path) return ''
  const token = getToken()
  if (!token) return path
  const sep = path.includes('?') ? '&' : '?'
  return `${path}${sep}token=${encodeURIComponent(token)}`
}

function authHeaders(extra = {}) {
  const headers = { ...extra }
  const token = getToken()
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function handleUnauthorized() {
  clearToken()
  window.dispatchEvent(new Event('auth:unauthorized'))
}

export async function request(path, options = {}) {
  let res
  try {
    res = await fetch(BASE + path, {
      headers: authHeaders({ 'Content-Type': 'application/json', ...(options.headers || {}) }),
      ...options,
    })
  } catch (e) {
    // 网络层失败（断联/DNS/超时）：统一包装，便于上层判断
    const err = new Error('服务器不可达')
    err.network = true
    err.cause = e
    throw err
  }
  if (res.status === 401) {
    handleUnauthorized()
    throw new Error('未登录或登录已过期')
  }
  if (res.status === 204) return null
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(errBody.detail || res.statusText)
  }
  return res.json()
}

export const server = {
  health: async () => {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const res = await fetch(`${BASE}/health`, { signal: ctrl.signal })
      return res.ok
    } catch {
      return false
    } finally {
      clearTimeout(t)
    }
  },
  poems: {
    list(params = {}) {
      const qs = new URLSearchParams()
      Object.entries(params).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== '') qs.set(k, v)
      })
      const s = qs.toString()
      return request(`/poems${s ? '?' + s : ''}`)
    },
    get(id) {
      return request(`/poems/${id}`)
    },
    create(data) {
      return request('/poems', { method: 'POST', body: JSON.stringify(data) })
    },
    update(id, data) {
      return request(`/poems/${id}`, { method: 'PUT', body: JSON.stringify(data) })
    },
    remove(id) {
      return request(`/poems/${id}`, { method: 'DELETE' })
    },
    toggleFavorite(id, favorite) {
      const qs = favorite === undefined ? '' : `?favorite=${favorite}`
      return request(`/poems/${id}/favorite${qs}`, { method: 'PATCH' })
    },
  },
  templates: {
    list() {
      return request('/templates')
    },
    get(id) {
      return request(`/templates/${id}`)
    },
  },
  references: {
    list() {
      return request('/references')
    },
    get(id) {
      return request(`/references/${id}`)
    },
    exemplars() {
      return request('/references/exemplars')
    },
  },
}
