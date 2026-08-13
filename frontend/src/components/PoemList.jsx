import { useEffect, useState } from 'react'
import { poemsApi } from '../api.js'
import ImportPanel from './ImportPanel.jsx'

const SORT_OPTIONS = [
  { value: 'created_at', label: '最新创建' },
  { value: 'created_date', label: '创作时间' },
  { value: 'user_score', label: '用户评分' },
  { value: 'comprehensive_score', label: '综合评分' },
  { value: 'title', label: '标题' },
]

export default function PoemList({ refreshKey, onSelect, onNew }) {
  const [poems, setPoems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)

  const [q, setQ] = useState('')
  const [category, setCategory] = useState('') // '' 全部 | 'favorites' 收藏 | 具体分类
  const [sortBy, setSortBy] = useState('created_at')
  const [sortOrder, setSortOrder] = useState('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [importTick, setImportTick] = useState(0)

  useEffect(() => {
    poemsApi.categories().then(setCategories).catch(() => {})
  }, [refreshKey])

  useEffect(() => {
    let active = true
    setLoading(true)
    const params = {
      q,
      sort_by: sortBy,
      sort_order: sortOrder,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }
    if (category === 'favorites') {
      params.favorite = true
    } else if (category) {
      params.category = category
    }
    poemsApi
      .list(params)
      .then((data) => {
        if (active) setPoems(data)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [refreshKey, importTick, q, category, sortBy, sortOrder, dateFrom, dateTo])

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-teal-800">诗词管理</h1>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowImport(true)} className="text-sm font-medium text-teal-600">
            导入
          </button>
          <span className="text-sm text-slate-400">共 {poems.length} 首</span>
        </div>
      </header>

      {/* Search */}
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索标题 / 正文…"
        className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-teal-500 focus:outline-none"
      />

      {/* Category chips */}
      <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
        <Chip active={category === ''} onClick={() => setCategory('')}>
          全部
        </Chip>
        <Chip active={category === 'favorites'} onClick={() => setCategory('favorites')}>
          ⭐ 收藏
        </Chip>
        {categories.map((c) => (
          <Chip key={c} active={category === c} onClick={() => setCategory(c)}>
            {c}
          </Chip>
        ))}
      </div>

      {/* Sort + date range */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm"
        >
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-600"
        >
          {sortOrder === 'desc' ? '↓ 降序' : '↑ 升序'}
        </button>
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="w-[7.5rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
          />
          <span className="text-slate-400">–</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="w-[7.5rem] rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs"
          />
        </div>
      </div>

      {/* List */}
      {loading ? (
        <p className="py-12 text-center text-slate-400">加载中…</p>
      ) : poems.length === 0 ? (
        <p className="py-12 text-center text-slate-400">还没有诗词，点右下角 + 新建</p>
      ) : (
        <ul className="space-y-2">
          {poems.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => onSelect(p.id)}
                className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-300"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-slate-800">{p.title || '（无题）'}</span>
                  {p.is_favorite && <span className="text-amber-400">⭐</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                  {p.category && (
                    <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">
                      {p.category}
                    </span>
                  )}
                  {p.created_date && <span>{p.created_date}</span>}
                  {p.user_score != null && <span>自评 {p.user_score}</span>}
                  {p.comprehensive_score != null && (
                    <span className="text-teal-600">综合 {p.comprehensive_score}</span>
                  )}
                </div>
                {p.content && (
                  <p className="mt-2 line-clamp-2 whitespace-pre-line text-sm text-slate-500">
                    {p.content}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* FAB */}
      <button
        onClick={onNew}
        className="fixed bottom-20 right-6 flex h-14 w-14 items-center justify-center rounded-full bg-teal-600 text-3xl text-white shadow-lg transition active:scale-95"
        aria-label="新建诗词"
      >
        +
      </button>

      {showImport && (
        <ImportPanel
          onClose={() => setShowImport(false)}
          onImported={() => setImportTick((t) => t + 1)}
        />
      )}
    </div>
  )
}

function Chip({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm transition ${
        active ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 border border-slate-200'
      }`}
    >
      {children}
    </button>
  )
}
