import { useEffect, useState } from 'react'
import { referencesApi } from '../api.js'

export default function ReferenceEditor({ id, onSaved, onCancel }) {
  const [form, setForm] = useState({ title: '', author: '', kind: 'ci', content: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    referencesApi.list().then((refs) => {
      const r = refs.find((x) => x.id === id)
      if (r) {
        setForm({ title: r.title, author: r.author, kind: r.kind, content: r.content })
      }
    })
  }, [id])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    setError('')
    try {
      await referencesApi.update(id, {
        title: form.title.trim(),
        author: form.author.trim(),
        kind: form.kind,
        content: form.content,
      })
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
        <h1 className="text-lg font-bold text-slate-800">编辑参考作品</h1>
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
