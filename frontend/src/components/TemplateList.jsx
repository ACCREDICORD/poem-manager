import { useEffect, useState } from 'react'
import { templatesApi } from '../api.js'

const KINDS = [
  ['', '全部'],
  ['shi', '诗'],
  ['ci', '词'],
]

export default function TemplateList({ onSelect, onNew }) {
  const [templates, setTemplates] = useState([])
  const [kind, setKind] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    let active = true
    templatesApi
      .list({ kind: kind || undefined, q: q || undefined })
      .then((d) => {
        if (active) setTemplates(d)
      })
    return () => {
      active = false
    }
  }, [kind, q])

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-teal-800">格律模板</h1>
        <button
          onClick={onNew}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          + 新建
        </button>
      </header>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="搜索词牌 / 诗体…"
        className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm shadow-sm focus:border-teal-500 focus:outline-none"
      />

      <div className="mb-3 flex gap-2">
        {KINDS.map(([v, label]) => (
          <button
            key={v}
            onClick={() => setKind(v)}
            className={`rounded-full px-3 py-1.5 text-sm transition ${
              kind === v
                ? 'bg-teal-600 text-white'
                : 'border border-slate-200 bg-white text-slate-600'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {templates.map((t) => (
          <li key={t.id}>
            <button
              onClick={() => onSelect(t.id)}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-300"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{t.name}</span>
                <span className="text-xs text-slate-400">
                  {t.kind === 'ci' ? '词' : '诗'} · {t.total_chars} 字 · {t.line_count} 句
                </span>
              </div>
              {t.aliases?.length > 0 && (
                <div className="mt-1 text-xs text-slate-400">{t.aliases.join(' · ')}</div>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
