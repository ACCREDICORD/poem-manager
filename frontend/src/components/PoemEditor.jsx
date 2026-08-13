import { useEffect, useState } from 'react'
import { poemsApi } from '../api.js'

export default function PoemEditor({ id, onSaved, onCancel, refresh }) {
  const [form, setForm] = useState({
    title: '',
    content: '',
    category: '',
    tags: [],
    created_date: '',
    user_score: '',
    is_favorite: false,
  })
  const [categories, setCategories] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    poemsApi.categories().then(setCategories).catch(() => {})
    if (id) {
      poemsApi.get(id).then((p) => {
        setForm({
          title: p.title || '',
          content: p.content || '',
          category: p.category || '',
          tags: p.tags || [],
          created_date: p.created_date || '',
          user_score: p.user_score ?? '',
          is_favorite: p.is_favorite || false,
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
      content: form.content,
      category: form.category.trim(),
      tags: form.tags,
      created_date: form.created_date || null,
      user_score: form.user_score === '' ? null : Number(form.user_score),
      is_favorite: form.is_favorite,
    }
    try {
      if (id) {
        await poemsApi.update(id, payload)
      } else {
        await poemsApi.create(payload)
      }
      refresh()
      onSaved()
    } catch (e) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const updateTags = (raw) => {
    const tags = raw
      .split(/[,，]/)
      .map((t) => t.trim())
      .filter(Boolean)
    set('tags', tags)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={onCancel} className="text-slate-500 active:text-slate-700">
          ← 取消
        </button>
        <h1 className="text-lg font-bold text-slate-800">{id ? '编辑诗词' : '新建诗词'}</h1>
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
        <Field label="标题">
          <input
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            placeholder="如：临江仙·秋思（可留空）"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="类型 / 词牌">
            <input
              value={form.category}
              onChange={(e) => set('category', e.target.value)}
              list="category-list"
              placeholder="如：七律、临江仙"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
            <datalist id="category-list">
              {categories.map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
          </Field>
          <Field label="创作日期">
            <input
              type="date"
              value={form.created_date}
              onChange={(e) => set('created_date', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
            />
          </Field>
        </div>

        <Field label="自评分（0–100，可留空）">
          <input
            type="number"
            min="0"
            max="100"
            value={form.user_score}
            onChange={(e) => set('user_score', e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
        </Field>

        <Field label="标签（逗号分隔）">
          <input
            value={(form.tags || []).join(', ')}
            onChange={(e) => updateTags(e.target.value)}
            placeholder="如：秋天, 思乡"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
        </Field>

        <Field label="正文">
          <textarea
            value={form.content}
            onChange={(e) => set('content', e.target.value)}
            rows={10}
            placeholder="在此输入诗词正文，每句一行…"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-7 focus:border-teal-500 focus:outline-none"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.is_favorite}
            onChange={(e) => set('is_favorite', e.target.checked)}
          />
          加入收藏
        </label>
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
