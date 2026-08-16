// 本地优先 API 层：
// - 诗词（poemsApi）：完全本地读写 + 待同步队列（断联可用）
// - 模板/参考/范文：服务器优先、本地镜像回退（断联可看，编辑需联网）
// - AI/图片/评分等：服务器路径（AI 断联直连兜底在 directAi.js，由组件层触发）

import { db, enqueue, meta, tempId } from './db.js'
import { getToken, setToken, clearToken, mediaUrl, request, server } from './server.js'
import { scheduleSync } from './sync.js'

export { getToken, setToken, clearToken, mediaUrl }

function nowIso() {
  return new Date().toISOString()
}

export const authApi = {
  login(username, password) {
    return request('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) })
  },
}

export const poemsApi = {
  async list(params = {}) {
    let rows = await db.poems.toArray()
    if (params.q) {
      const q = params.q.toLowerCase()
      rows = rows.filter(
        (p) =>
          (p.title || '').toLowerCase().includes(q) || (p.content || '').toLowerCase().includes(q),
      )
    }
    if (params.category) rows = rows.filter((p) => p.category === params.category)
    if (params.favorite !== undefined) rows = rows.filter((p) => !!p.is_favorite === !!params.favorite)
    if (params.date_from) rows = rows.filter((p) => p.created_date && p.created_date >= params.date_from)
    if (params.date_to) rows = rows.filter((p) => p.created_date && p.created_date <= params.date_to)
    const sortBy = params.sort_by || 'created_at'
    const desc = params.sort_order !== 'asc'
    rows.sort((a, b) => {
      const va = a[sortBy] ?? ''
      const vb = b[sortBy] ?? ''
      if (typeof va === 'number' && typeof vb === 'number') return desc ? vb - va : va - vb
      return desc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb))
    })
    return rows
  },

  async get(id) {
    return db.poems.get(Number(id))
  },

  // 尝试从服务器拉最新（成功后更新镜像）；失败则用本地
  async refreshFromServer(id) {
    try {
      const fresh = await server.poems.get(id)
      if (fresh) await db.poems.put({ ...fresh, syncState: 'synced' })
      return fresh
    } catch {
      return db.poems.get(Number(id))
    }
  },

  async categories() {
    const all = await db.poems.toArray()
    return [...new Set(all.map((p) => p.category).filter(Boolean))].sort()
  },

  async create(data) {
    const id = tempId()
    const row = {
      id,
      title: data.title || '',
      content: data.content || '',
      category: data.category || '',
      tags: data.tags || [],
      created_date: data.created_date || null,
      is_favorite: !!data.is_favorite,
      annotations: data.annotations || [],
      user_score: data.user_score ?? null,
      source: data.source || 'manual',
      images: [],
      agent_scores: [],
      agent_report: null,
      appreciation: '',
      created_at: nowIso(),
      updated_at: nowIso(),
      syncState: 'pending',
    }
    await db.poems.put(row)
    await enqueue({
      type: 'create',
      payload: {
        title: row.title,
        content: row.content,
        category: row.category,
        tags: row.tags,
        created_date: row.created_date,
        is_favorite: row.is_favorite,
        annotations: row.annotations,
        source: row.source,
      },
      tempId: id,
    })
    scheduleSync()
    return row
  },

  async update(id, data) {
    const numId = Number(id)
    const row = await db.poems.get(numId)
    if (!row) throw new Error('本地未找到该诗词')
    Object.assign(row, data, { updated_at: nowIso(), syncState: 'pending' })
    await db.poems.put(row)
    const payload = { ...data }
    delete payload.syncState
    delete payload.updated_at
    await enqueue({ type: 'update', payload, id: numId })
    scheduleSync()
    return row
  },

  async remove(id) {
    const numId = Number(id)
    await db.poems.delete(numId)
    await enqueue({ type: 'delete', payload: {}, id: numId })
    scheduleSync()
    return null
  },

  async toggleFavorite(id, favorite) {
    const row = await db.poems.get(Number(id))
    if (!row) throw new Error('本地未找到该诗词')
    const next = favorite === undefined ? !row.is_favorite : !!favorite
    return this.update(id, { is_favorite: next })
  },

  rate(id, opts = {}) {
    return request(`/poems/${id}/rate`, { method: 'POST', body: JSON.stringify(opts) })
  },
  rateStatus(id) {
    return request(`/poems/${id}/rate/status`)
  },
  appreciate(id, opts = {}) {
    return request(`/poems/${id}/appreciate`, { method: 'POST', body: JSON.stringify(opts) })
  },
  appreciateStatus(id) {
    return request(`/poems/${id}/appreciate/status`)
  },
}

export const templatesApi = {
  async list(params = {}) {
    try {
      const rows = await server.templates.list()
      await db.templates.bulkPut(rows)
      return rows
        .filter((t) => !params.kind || t.kind === params.kind)
        .filter((t) => !params.q || (t.name || '').includes(params.q))
    } catch {
      const rows = await db.templates.toArray()
      return rows
        .filter((t) => !params.kind || t.kind === params.kind)
        .filter((t) => !params.q || (t.name || '').includes(params.q))
    }
  },
  async get(id) {
    try {
      const t = await server.templates.get(id)
      if (t) await db.templates.put(t)
      return t
    } catch {
      return db.templates.get(Number(id))
    }
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
    return fetch(`/api/poems/${poemId}/images`, {
      method: 'POST',
      headers: (() => {
        const token = getToken()
        return token ? { Authorization: `Bearer ${token}` } : {}
      })(),
      body: form,
    }).then((res) => {
      if (res.status === 401) {
        clearToken()
        window.dispatchEvent(new Event('auth:unauthorized'))
      }
      if (!res.ok) throw new Error('图片上传失败（需联网）')
      return res.json()
    })
  },
  remove(imageId) {
    return request(`/poems/images/${imageId}`, { method: 'DELETE' })
  },
}

export const chatApi = {
  async stream(payload, onDelta, onReasoning) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: (() => {
        const h = { 'Content-Type': 'application/json' }
        const token = getToken()
        if (token) h.Authorization = `Bearer ${token}`
        return h
      })(),
      body: JSON.stringify(payload),
    })
    if (!res.ok || !res.body) {
      if (res.status === 401) {
        clearToken()
        window.dispatchEvent(new Event('auth:unauthorized'))
      }
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
        if (obj.reasoning_delta) onReasoning && onReasoning(obj.reasoning_delta)
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
  history(sessionId) {
    return request(`/agent/history?session_id=${encodeURIComponent(sessionId)}`)
  },
}

export const importApi = {
  analyze(text) {
    return request('/import/analyze', { method: 'POST', body: JSON.stringify({ text }) })
  },
  analyzeStatus() {
    return request('/import/analyze/status')
  },
  save(items) {
    return request('/import/save', { method: 'POST', body: JSON.stringify({ items }) })
  },
}

export const referencesApi = {
  async list() {
    try {
      const rows = await server.references.list()
      await db.references.bulkPut(rows)
      return rows
    } catch {
      return db.references.toArray()
    }
  },
  async get(id) {
    try {
      const r = await server.references.get(id)
      if (r) await db.references.put(r)
      return r
    } catch {
      return db.references.get(Number(id))
    }
  },
  async exemplars() {
    try {
      const rows = await server.references.exemplars()
      await db.exemplars.bulkPut(rows)
      return rows
    } catch {
      return db.exemplars.toArray()
    }
  },
  create(data) {
    return request('/references', { method: 'POST', body: JSON.stringify(data) })
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
  init(id, opts = {}) {
    return request(`/references/${id}/init`, { method: 'POST', body: JSON.stringify(opts) })
  },
  initStatus(id) {
    return request(`/references/${id}/init/status`)
  },
  update(id, data) {
    return request(`/references/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },
  remove(id) {
    return request(`/references/${id}`, { method: 'DELETE' })
  },
  createExemplar(data) {
    return request('/references/exemplars', { method: 'POST', body: JSON.stringify(data) })
  },
  updateExemplar(id, data) {
    return request(`/references/exemplars/${id}`, { method: 'PUT', body: JSON.stringify(data) })
  },
  removeExemplar(id) {
    return request(`/references/exemplars/${id}`, { method: 'DELETE' })
  },
}
