import { useEffect, useState } from 'react'
import { subscribeSync } from '../sync.js'

// 服务器连接状态：🟡断联 / 🟢联机 / 同步中(百分比) / ✅成功 / ❌失败(原因)
export default function StatusIndicator() {
  const [st, setSt] = useState({ status: 'disconnected', progress: 0, total: 1, detail: '' })
  useEffect(() => subscribeSync(setSt), [])

  const { status, progress, total, detail } = st
  let content = '🟡'
  let title = '与服务器断联：数据保存在本机，连通后自动同步'
  let cls = 'border-amber-300 bg-amber-50/95 text-amber-600'
  if (status === 'connected') {
    content = '🟢'
    title = '已连接服务器'
    cls = 'border-emerald-300 bg-emerald-50/95 text-emerald-600'
  } else if (status === 'syncing') {
    const pct = Math.min(100, Math.round((progress / Math.max(total, 1)) * 100))
    content = `${pct}%`
    title = '正在同步…'
    cls = 'border-sky-300 bg-sky-50/95 text-sky-600'
  } else if (status === 'ok') {
    content = '✅'
    title = '同步成功'
    cls = 'border-emerald-300 bg-emerald-50/95 text-emerald-600'
  } else if (status === 'error') {
    content = '❌'
    title = `同步失败：${detail || '未知原因'}`
    cls = 'border-red-300 bg-red-50/95 text-red-600'
  }

  return (
    <button
      title={title}
      onClick={() => alert(title)}
      className={`fixed right-3 top-3 z-30 flex h-8 min-w-8 items-center justify-center rounded-full border px-2 text-xs font-medium shadow-sm ${cls}`}
    >
      {content}
    </button>
  )
}
