const BASE = '/api'

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  })
  if (res.status === 204) return null
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
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
  categories() {
    return request('/poems/categories')
  },
}
