import { useEffect, useState } from 'react'
import { poemsApi } from '../api.js'
import TemplatePicker from './TemplatePicker.jsx'
import ToneLine from './ToneLine.jsx'

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
  const [showPicker, setShowPicker] = useState(false)
  const [selectedTemplate, setSelectedTemplate] = useState(null)

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

  const pickTemplate = (tpl) => {
    setSelectedTemplate(tpl)
    setShowPicker(false)
    // 若未填类型，自动带入词牌/诗体名
    if (!form.category.trim()) {
      set('category', tpl.name)
    }
  }

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

        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-slate-500">正文</span>
          <button
            onClick={() => setShowPicker(true)}
            className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-xs font-medium text-teal-700"
          >
            📖 选格律模板
          </button>
        </div>
        <textarea
          value={form.content}
          onChange={(e) => set('content', e.target.value)}
          rows={10}
          placeholder="在此输入诗词正文，每句一行…"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-7 focus:border-teal-500 focus:outline-none"
        />

        {/* 所选格律参考 */}
        {selectedTemplate && (
          <div className="rounded-xl border border-teal-100 bg-teal-50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-teal-800">
                {selectedTemplate.name}（{selectedTemplate.kind === 'ci' ? '词' : '诗'} ·{' '}
                {selectedTemplate.total_chars} 字）
              </span>
              <button
                onClick={() => setSelectedTemplate(null)}
                className="text-xs text-slate-400"
              >
                移除
              </button>
            </div>
            <ol className="space-y-1">
              {selectedTemplate.pattern.map((line, i) => (
                <li key={i} className="flex items-baseline gap-2">
                  <span className="w-5 shrink-0 text-right text-xs text-slate-400">{i + 1}</span>
                  <ToneLine text={line} />
                </li>
              ))}
            </ol>
            {selectedTemplate.rhyme && (
              <p className="mt-2 text-xs text-slate-500">{selectedTemplate.rhyme}</p>
            )}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={form.is_favorite}
            onChange={(e) => set('is_favorite', e.target.checked)}
          />
          加入收藏
        </label>
      </div>

      {showPicker && (
        <TemplatePicker onSelect={pickTemplate} onClose={() => setShowPicker(false)} />
      )}
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
