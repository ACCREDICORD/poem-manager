import { useEffect, useState } from 'react'
import { poemsApi } from '../api.js'

export default function PoemDetail({ id, onBack, onEdit, onDeleted }) {
  const [poem, setPoem] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    setLoading(true)
    poemsApi
      .get(id)
      .then((d) => {
        if (active) setPoem(d)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id])

  if (loading || !poem) {
    return <p className="py-12 text-center text-slate-400">加载中…</p>
  }

  const toggleFav = async () => {
    const updated = await poemsApi.toggleFavorite(poem.id)
    setPoem(updated)
  }

  const remove = async () => {
    if (!confirm('确定删除这首诗吗？此操作不可撤销。')) return
    await poemsApi.remove(poem.id)
    onDeleted()
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="text-slate-500 active:text-slate-700">
          ← 返回
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => onEdit(poem.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600"
          >
            编辑
          </button>
          <button
            onClick={remove}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-500"
          >
            删除
          </button>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-slate-800">{poem.title || '（无题）'}</h1>
          <button onClick={toggleFav} className="text-2xl" aria-label="收藏">
            {poem.is_favorite ? '⭐' : '☆'}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {poem.category && (
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-teal-700">
              {poem.category}
            </span>
          )}
          {poem.created_date && <span>创作于 {poem.created_date}</span>}
          {poem.source === 'import' && <span className="text-slate-400">（导入）</span>}
        </div>

        {/* Scores */}
        {(poem.user_score != null ||
          poem.agent_score != null ||
          poem.comprehensive_score != null) && (
          <div className="mt-3 flex gap-2">
            {poem.user_score != null && (
              <ScoreBadge label="自评" value={poem.user_score} />
            )}
            {poem.agent_score != null && (
              <ScoreBadge label="AI 评分" value={poem.agent_score} />
            )}
            {poem.comprehensive_score != null && (
              <ScoreBadge label="综合" value={poem.comprehensive_score} highlight />
            )}
          </div>
        )}

        {poem.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {poem.tags.map((t) => (
              <span
                key={t}
                className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        <hr className="my-4 border-slate-100" />

        {poem.content ? (
          <div className="poem-content text-base text-slate-700">{poem.content}</div>
        ) : (
          <p className="text-slate-400">（无正文）</p>
        )}

        {/* Annotations (M3 will add editing) */}
        {poem.annotations?.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">批注</h2>
            {poem.annotations.map((a, i) => (
              <div key={i} className="mb-2 rounded-lg bg-amber-50 p-3 text-sm text-slate-600">
                {a.line != null && (
                  <span className="mr-1 text-xs text-amber-600">第{a.line}句</span>
                )}
                {a.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function ScoreBadge({ label, value, highlight }) {
  return (
    <span
      className={`rounded-lg px-2.5 py-1 text-sm font-medium ${
        highlight ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {label} {value}
    </span>
  )
}
