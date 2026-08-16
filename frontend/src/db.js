// 本地数据层（IndexedDB，基于 Dexie）：
// poems     诗词全量镜像（离线读写，syncState 标记待同步）
// templates 格律模板只读缓存
// references 参考库只读缓存（含解析文章）
// exemplars 赏析范文只读缓存
// messages  对话/Agent 历史镜像（断联时 AI 对话可用）
// queue     待同步操作队列（写后置：先落本地再回放服务器）
// meta      key-value（lastSyncAt 等）

import Dexie from 'dexie'

export const db = new Dexie('poem-offline')
db.version(1).stores({
  poems: 'id, updated_at, is_favorite, category',
  templates: 'id',
  references: 'id',
  exemplars: 'id',
  messages: 'id, session_id, mode, created_at',
  queue: '++id, tempId',
  meta: 'key',
})

export const meta = {
  async get(key, fallback = null) {
    const row = await db.meta.get(key)
    return row ? row.value : fallback
  },
  async set(key, value) {
    await db.meta.put({ key, value })
  },
}

export const tempId = () => -Math.floor(Date.now() / 1000) * 1000 - Math.floor(Math.random() * 1000)

export async function enqueue(op) {
  await db.queue.add({ ...op, createdAt: Date.now() })
}
