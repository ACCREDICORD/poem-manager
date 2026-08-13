import { useEffect, useState } from 'react'
import { templatesApi } from '../api.js'
import ToneLine from './ToneLine.jsx'

export default function TemplateDetail({ id, onBack, onEdit, onDeleted }) {
  const [tpl, setTpl] = useState(null)

  useEffect(() => {
    let active = true
    templatesApi.get(id).then((d) => {
      if (active) setTpl(d)
    })
    return () => {
      active = false
    }
  }, [id])

  if (!tpl) {
    return <p className="py-12 text-center text-slate-400">加载中…</p>
  }

  const remove = async () => {
    if (!confirm(`确定删除「${tpl.name}」格律模板吗？`)) return
    await templatesApi.remove(tpl.id)
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
            onClick={() => onEdit(tpl.id)}
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
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-800">{tpl.name}</h1>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs ${
              tpl.kind === 'ci' ? 'bg-teal-50 text-teal-700' : 'bg-indigo-50 text-indigo-700'
            }`}
          >
            {tpl.kind === 'ci' ? '词' : '诗'}
          </span>
        </div>

        {tpl.aliases?.length > 0 && (
          <div className="mt-2 text-xs text-slate-400">{tpl.aliases.join(' · ')}</div>
        )}

        <div className="mt-3 flex gap-3 text-sm text-slate-500">
          <span>{tpl.total_chars} 字</span>
          <span>{tpl.line_count} 句</span>
        </div>

        <hr className="my-4 border-slate-100" />

        <h2 className="mb-2 text-sm font-semibold text-slate-500">格律（平仄）</h2>
        <ol className="space-y-1.5">
          {tpl.pattern.map((line, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="w-8 shrink-0 text-right text-xs text-slate-400">{i + 1}</span>
              <ToneLine text={line} />
              <span className="text-xs text-slate-300">{line.length}字</span>
            </li>
          ))}
        </ol>

        {tpl.rhyme && (
          <div className="mt-4 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
            <span className="mr-1 text-xs font-medium text-slate-400">押韵：</span>
            {tpl.rhyme}
          </div>
        )}

        {tpl.example && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">范例</h2>
            <div className="poem-content text-sm text-slate-600">{tpl.example}</div>
          </div>
        )}
      </div>
    </div>
  )
}
