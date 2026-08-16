import { useEffect, useState } from 'react'
import { referencesApi } from '../api.js'

export default function ReferenceEditor({ id, onSaved, onCancel }) {
  const [form, setForm] = useState({ title: '', author: '', kind: 'ci', content: '' })
  const [analysis, setAnalysis] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) {
      referencesApi.get(id).then((r) => {
        setForm({ title: r.title, author: r.author, kind: r.kind, content: r.content })
        setAnalysis({
          spirit_analysis: r.spirit_analysis,
          form_analysis: r.form_analysis,
          article: r.article,
        })
      })
    }
  }, [id])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    setError('')
    const payload = {
      title: form.title.trim(),
      author: form.author.trim(),
      kind: form.kind,
      content: form.content,
    }
    try {
      if (id) await referencesApi.update(id, payload)
      else await referencesApi.create(payload)
      onSaved()
    } catch (e) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={onCancel} className="text-slate-500 active:text-slate-700">
          ← 返回
        </button>
        <h1 className="text-lg font-bold text-slate-800">
          {id ? '编辑参考作品' : '新建参考作品'}
        </h1>
        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
      </header>

      {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-500">{error}</p>}

      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-2 gap-3">
          <Field label="标题">
            <input
              value={form.title}
              onChange={(e) => set('title', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </Field>
          <Field label="作者">
            <input
              value={form.author}
              onChange={(e) => set('author', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </Field>
        </div>

        <Field label="类型">
          <select
            value={form.kind}
            onChange={(e) => set('kind', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          >
            <option value="ci">词</option>
            <option value="shi">诗</option>
          </select>
        </Field>

        <Field label="原文">
          <textarea
            value={form.content}
            onChange={(e) => set('content', e.target.value)}
            rows={14}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-7 focus:border-teal-500 focus:outline-none"
          />
        </Field>

        {/* 基准评分解析（只读，初始化生成；重新初始化会覆盖） */}
        {analysis && analysis.article && (
          <div className="space-y-3 rounded-xl border border-teal-100 bg-teal-50/60 p-4">
            <h3 className="text-xs font-semibold text-teal-800">📖 基准评分解析（已初始化）</h3>
            {analysis.spirit_analysis && (
              <div>
                <p className="mb-1 text-xs font-medium text-amber-700">神维度分析</p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {analysis.spirit_analysis}
                </p>
              </div>
            )}
            {analysis.form_analysis && (
              <div>
                <p className="mb-1 text-xs font-medium text-sky-700">形维度分析</p>
                <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">
                  {analysis.form_analysis}
                </p>
              </div>
            )}
            <div>
              <p className="mb-1 text-xs font-medium text-slate-700">综合解析文章</p>
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {analysis.article}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      {children}
    </label>
  )
}
