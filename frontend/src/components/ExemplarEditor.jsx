import { useEffect, useState } from 'react'
import { referencesApi } from '../api.js'

export default function ExemplarEditor({ id, onSaved, onCancel }) {
  const [form, setForm] = useState({ title: '', author: '', kind: 'ci', content: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) {
      referencesApi.exemplars().then((list) => {
        const found = list.find((x) => x.id === id)
        if (found) setForm({ title: found.title, author: found.author, kind: found.kind, content: found.content })
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
      if (id) await referencesApi.updateExemplar(id, payload)
      else await referencesApi.createExemplar(payload)
      onSaved()
    } catch (e) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4">
        <header className="mb-3 flex items-center justify-between">
          <button onClick={onCancel} className="text-slate-500 active:text-slate-700">
            ✕
          </button>
          <h1 className="text-lg font-bold text-slate-800">{id ? '编辑赏析范文' : '新增赏析范文'}</h1>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-teal-600 px-4 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? '保存中…' : '保存'}
          </button>
        </header>

        {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-500">{error}</p>}

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="grid grid-cols-2 gap-3">
            <Field label="标题（作品名）">
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
          <Field label="范文正文（鉴赏辞典风格赏析文章）">
            <textarea
              value={form.content}
              onChange={(e) => set('content', e.target.value)}
              rows={16}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-7 focus:border-teal-500 focus:outline-none"
            />
          </Field>
        </div>
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
