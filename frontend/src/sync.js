// 同步引擎：待同步队列回放 + 全量拉取镜像。
// 状态机：disconnected(黄) / connected(绿) / syncing(百分比) / ok(✓) / error(✗+原因)
// 应用场景为"几乎常断联、偶尔连通"，因此：打开即同步 + 网络恢复即同步 + 每分钟轻量探测。

import { db, meta } from './db.js'
import { server } from './server.js'

const state = { status: 'disconnected', progress: 0, total: 1, detail: '', syncing: false }
const listeners = new Set()

export function subscribeSync(fn) {
  listeners.add(fn)
  fn({ ...state })
  return () => listeners.delete(fn)
}

function notify(patch) {
  Object.assign(state, patch)
  const snapshot = { ...state }
  listeners.forEach((f) => f(snapshot))
}

let scheduleTimer = null
export function scheduleSync() {
  if (scheduleTimer) clearTimeout(scheduleTimer)
  scheduleTimer = setTimeout(() => syncNow(), 800)
}

let probeTimer = null

export function startSyncEngine() {
  syncNow()
  window.addEventListener('online', () => syncNow())
  // 机会型同步：每分钟探测一次可达性，抓住"连上了"的瞬间
  probeTimer = setInterval(async () => {
    if (!navigator.onLine) return
    if (state.syncing || state.status !== 'disconnected') return
    const ok = await server.health()
    if (ok) syncNow()
  }, 60000)
}

export function stopSyncEngine() {
  if (probeTimer) clearInterval(probeTimer)
  probeTimer = null
  if (scheduleTimer) clearTimeout(scheduleTimer)
  scheduleTimer = null
}

async function applyOp(op, idMap) {
  if (op.type === 'create') {
    const created = await server.poems.create(op.payload)
    if (op.tempId) {
      await db.poems.delete(op.tempId)
      idMap[op.tempId] = created.id
    }
    await db.poems.put({ ...created, syncState: 'synced' })
  } else if (op.type === 'update') {
    const pid = idMap[op.id] ?? op.id
    const updated = await server.poems.update(pid, op.payload)
    await db.poems.put({ ...updated, syncState: 'synced' })
  } else if (op.type === 'delete') {
    const pid = idMap[op.id] ?? op.id
    await server.poems.remove(pid)
    await db.poems.delete(op.id)
  }
}

async function pullAll() {
  // 诗词：全量拉取 + 本地对账（覆盖服务器端的新增/修改/删除）
  const serverPoems = await server.poems.list({})
  const serverIds = new Set(serverPoems.map((p) => p.id))
  await db.transaction('rw', db.poems, async () => {
    const local = await db.poems.toArray()
    for (const p of local) {
      if (typeof p.id === 'number' && p.id < 0) continue // 防御：未同步的临时行
      if (!serverIds.has(p.id)) await db.poems.delete(p.id)
    }
    await db.poems.bulkPut(serverPoems.map((p) => ({ ...p, syncState: 'synced' })))
  })

  // 模板/参考库/赏析范文：只读镜像
  const [templates, references, exemplars] = await Promise.all([
    server.templates.list(),
    server.references.list(),
    server.references.exemplars(),
  ])
  await db.templates.clear()
  await db.templates.bulkPut(templates)
  await db.references.clear()
  await db.references.bulkPut(references)
  await db.exemplars.clear()
  await db.exemplars.bulkPut(exemplars)

  await meta.set('lastSyncAt', new Date().toISOString())
}

export async function syncNow() {
  if (state.syncing) return
  state.syncing = true
  const queue = await db.queue.orderBy('id').toArray()
  const steps = queue.length + 1 // 1 次全量拉取
  let done = 0
  notify({ status: 'syncing', progress: 0, total: Math.max(steps, 1), detail: '' })

  const fail = (err) => {
    notify({ status: 'disconnected', detail: err && err.message ? err.message : String(err) })
    state.syncing = false
  }
  const succeed = () => {
    done += 1
    notify({ status: 'ok', progress: done })
    state.syncing = false
    setTimeout(() => {
      if (state.status === 'ok') notify({ status: 'connected' })
    }, 2500)
  }

  // 1) 回放待同步队列（顺序执行，create 先行以建立 tempId → 真实 id 映射）
  const idMap = {}
  for (const op of queue) {
    try {
      await applyOp(op, idMap)
      await db.queue.delete(op.id)
      done += 1
      notify({ progress: done })
    } catch (err) {
      fail(err)
      return
    }
  }

  // 2) 全量拉取镜像
  try {
    await pullAll()
    succeed()
  } catch (err) {
    fail(err)
  }
}

export function getSyncState() {
  return { ...state }
}
