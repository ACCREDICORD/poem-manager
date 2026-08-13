import { useEffect, useState } from 'react'
import { templatesApi } from '../api.js'

const KINDS = [
  ['', '全部'],
  ['shi', '诗'],
  ['ci', '词'],
]

export default function TemplatePicker({ onSelect, onClose }) {
  const [templates, setTemplates] = useState([])
  const [kind, setKind] = useState('')
  const [q, setQ] = useState('')

  useEffect(() => {
    templatesApi.list({ kind: kind || undefined, q: q || undefined }).then(setTemplates)
  }, [kind, q])

  return (
    <div className="fixed inset-0 z-20 flex items-end justify-center bg-slate-900/40 sm:items-center">
      <div className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 className="font-semibold text-slate-800">选择格律模板</h2>
          <button onClick={onClose} className="text-slate-400 active:text-slate-600">
            ✕
          </button>
        </div>

        <div className="border-b border-slate-100 p-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索词牌 / 诗体…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
          <div className="mt-2 flex gap-2">
            {KINDS.map(([v, label]) => (
              <button
                key={v}
                onClick={() => setKind(v)}
                className={`rounded-full px-3 py-1 text-sm ${
                  kind === v
                    ? 'bg-teal-600 text-white'
                    : 'border border-slate-200 bg-white text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <ul className="flex-1 overflow-y-auto p-3">
          {templates.map((t) => (
            <li key={t.id}>
              <button
                onClick={() => onSelect(t)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
              >
                <span className="text-sm text-slate-700">{t.name}</span>
                <span className="text-xs text-slate-400">
                  {t.kind === 'ci' ? '词' : '诗'} · {t.total_chars} 字
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
