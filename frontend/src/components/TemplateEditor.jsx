import { useEffect, useState } from 'react'
import { templatesApi } from '../api.js'

export default function TemplateEditor({ id, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: '',
    kind: 'ci',
    aliases: [],
    total_chars: 0,
    pattern: '',
    rhyme: '',
    example: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (id) {
      templatesApi.get(id).then((t) => {
        setForm({
          name: t.name || '',
          kind: t.kind || 'ci',
          aliases: t.aliases || [],
          total_chars: t.total_chars || 0,
          pattern: (t.pattern || []).join('\n'),
          rhyme: t.rhyme || '',
          example: t.example || '',
        })
      })
    }
  }, [id])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    setSaving(true)
    setError('')
    const payload = {
      name: form.name.trim(),
      kind: form.kind,
      aliases: form.aliases,
      total_chars: Number(form.total_chars) || 0,
      pattern: form.pattern
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      rhyme: form.rhyme,
      example: form.example,
    }
    if (!payload.name) {
      setError('请填写名称')
      setSaving(false)
      return
    }
    try {
      if (id) await templatesApi.update(id, payload)
      else await templatesApi.create(payload)
      onSaved()
    } catch (e) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const updateAliases = (raw) => {
    set(
      'aliases',
      raw
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
    )
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={onCancel} className="text-slate-500 active:text-slate-700">
          ← 取消
        </button>
        <h1 className="text-lg font-bold text-slate-800">
          {id ? '编辑格律模板' : '新建格律模板'}
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
          <Field label="名称">
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="如：临江仙"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </Field>
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
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="总字数">
            <input
              type="number"
              value={form.total_chars}
              onChange={(e) => set('total_chars', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </Field>
          <Field label="别名（逗号分隔）">
            <input
              value={(form.aliases || []).join(', ')}
              onChange={(e) => updateAliases(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </Field>
        </div>

        <Field label="格律（每句一行，用「平/仄/中」）">
          <textarea
            value={form.pattern}
            onChange={(e) => set('pattern', e.target.value)}
            rows={8}
            placeholder={'中仄中平平仄仄\n中平中仄平平\n…'}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm leading-6 focus:border-teal-500 focus:outline-none"
          />
        </Field>

        <Field label="押韵说明">
          <textarea
            value={form.rhyme}
            onChange={(e) => set('rhyme', e.target.value)}
            rows={2}
            placeholder="如：上下阕各五句三平韵…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
        </Field>

        <Field label="范例">
          <textarea
            value={form.example}
            onChange={(e) => set('example', e.target.value)}
            rows={5}
            placeholder="典范作品全文…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-6 focus:border-teal-500 focus:outline-none"
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
