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

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: authHeaders({ 'Content-Type': 'application/json', ...(options.headers || {}) }),
    ...options,
  })
  if (res.status === 401) {
    handleUnauthorized()
    throw new Error('未登录或登录已过期')
  }
  if (res.status === 204) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export const authApi = {
  login(username, password) {
    return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  },
}

export const poemsApi = {
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
  rate(id, opts = {}) {
    return request(`/poems/${id}/rate`, { method: 'POST', body: JSON.stringify(opts) })
  },
  rateStatus(id) {
    return request(`/poems/${id}/rate/status`)
  },
  categories() {
    return request('/poems/categories')
  },
}

export const templatesApi = {
  list(params = {}) {
    const qs = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null && v !== '') qs.set(k, v)
    })
    const s = qs.toString()
    return request(`/templates${s ? '?' + s : ''}`)
  },
  get(id) {
    return request(`/templates/${id}`)
  },
  create(data) {
    return request('/templates', { method: 'POST', body: JSON.stringify(data) })
  },
  update(id, data) {
    return request(`/templates/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },
  remove(id) {
    return request(`/templates/${id}`, { method: 'DELETE' })
  },
}

export const imagesApi = {
  upload(poemId, file) {
    const form = new FormData()
    form.append('file', file)
    return fetch(`${BASE}/poems/${poemId}/images`, {
      method: 'POST',
      headers: authHeaders(),
      body: form,
    }).then((res) => {
      if (res.status === 401) handleUnauthorized()
      if (!res.ok) throw new Error('图片上传失败')
      return res.json()
    })
  },
  remove(imageId) {
    return request(`/poems/images/${imageId}`, { method: 'DELETE' })
  },
}

export const chatApi = {
  async stream(payload, onDelta) {
    const res = await fetch(`${BASE}/chat`, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(payload),
    })
    if (!res.ok || !res.body) {
      if (res.status === 401) handleUnauthorized()
      const err = await res.json().catch(() => ({ detail: 'AI 请求失败' }))
      throw new Error(err.detail || 'AI 请求失败')
    }
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx
      while ((idx = buf.indexOf('\n\n')) >= 0) {
        const part = buf.slice(0, idx).trim()
        buf = buf.slice(idx + 2)
        if (!part.startsWith('data:')) continue
        const data = part.slice(5).trim()
        if (data === '[DONE]') return
        let obj
        try {
          obj = JSON.parse(data)
        } catch {
          continue
        }
        if (obj.error) throw new Error(obj.error)
        if (obj.delta) onDelta(obj.delta)
      }
    }
  },
  history(sessionId) {
    return request(`/chat/history?session_id=${encodeURIComponent(sessionId)}`)
  },
}

export const agentApi = {
  message(payload) {
    return request('/agent/message', { method: 'POST', body: JSON.stringify(payload) })
  },
  step(sessionId, action) {
    return request(`/agent/step?session_id=${encodeURIComponent(sessionId)}`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    })
  },
}

export const importApi = {
  analyze(text) {
    return request('/import/analyze', { method: 'POST', body: JSON.stringify({ text }) })
  },
  save(items) {
    return request('/import/save', { method: 'POST', body: JSON.stringify({ items }) })
  },
}

export const referencesApi = {
  list() {
    return request('/references')
  },
  addFromPoem(poemId) {
    return request(`/references/from-poem/${poemId}`, { method: 'POST' })
  },
  seed(opts = {}) {
    return request('/references/seed', { method: 'POST', body: JSON.stringify(opts) })
  },
  seedStatus() {
    return request('/references/seed/status')
  },
  update(id, data) {
    return request(`/references/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },
  remove(id) {
    return request(`/references/${id}`, { method: 'DELETE' })
  },
}
