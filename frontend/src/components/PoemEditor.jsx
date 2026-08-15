import { useEffect, useState } from 'react'
import { imagesApi, poemsApi } from '../api.js'
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
    annotations: [],
  })
  const [images, setImages] = useState([])
  const [categories, setCategories] = useState([])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
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
          annotations: (p.annotations || []).map((a) => ({
            line: a.line ?? '',
            text: a.text || '',
          })),
        })
        setImages(p.images || [])
      })
    }
  }, [id])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const pickTemplate = (tpl) => {
    setSelectedTemplate(tpl)
    setShowPicker(false)
    if (!form.category.trim()) set('category', tpl.name)
  }

  // ---- annotations ----
  const addAnnotation = () =>
    set('annotations', [...form.annotations, { line: '', text: '' }])
  const updateAnnotation = (i, key, val) =>
    set(
      'annotations',
      form.annotations.map((a, idx) => (idx === i ? { ...a, [key]: val } : a)),
    )
  const removeAnnotation = (i) =>
    set(
      'annotations',
      form.annotations.filter((_, idx) => idx !== i),
    )

  // ---- images ----
  const handleUpload = async (e) => {
    const files = e.target.files
    if (!files || files.length === 0 || !id) return
    setUploading(true)
    setError('')
    try {
      for (const f of files) {
        const img = await imagesApi.upload(id, f)
        setImages((prev) => [...prev, img])
      }
    } catch (err) {
      setError(err.message || '图片上传失败')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }
  const removeImage = async (imageId) => {
    await imagesApi.remove(imageId)
    setImages((prev) => prev.filter((im) => im.id !== imageId))
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
      annotations: form.annotations
        .map((a) => ({
          line: a.line === '' || a.line == null ? null : Number(a.line),
          text: a.text.trim(),
        }))
        .filter((a) => a.text),
    }
    try {
      if (id) await poemsApi.update(id, payload)
      else await poemsApi.create(payload)
      refresh()
      onSaved()
    } catch (e) {
      setError(e.message || '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const updateTags = (raw) => {
    set(
      'tags',
      raw
        .split(/[,，]/)
        .map((t) => t.trim())
        .filter(Boolean),
    )
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

        <Field label="自评分（0–5，可留空）">
          <input
            type="number"
            min="0"
            max="5"
            step="0.1"
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

        {/* 批注 */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500">批注</span>
            <button
              onClick={addAnnotation}
              className="text-xs font-medium text-teal-700"
            >
              + 加一条
            </button>
          </div>
          {form.annotations.length === 0 ? (
            <p className="text-xs text-slate-400">暂无批注（可针对某一句，或写整首总批注）</p>
          ) : (
            form.annotations.map((a, i) => (
              <div key={i} className="mb-2 flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  value={a.line}
                  onChange={(e) => updateAnnotation(i, 'line', e.target.value)}
                  placeholder="句号"
                  className="w-16 shrink-0 rounded-lg border border-slate-200 px-2 py-2 text-xs focus:border-teal-500 focus:outline-none"
                />
                <input
                  value={a.text}
                  onChange={(e) => updateAnnotation(i, 'text', e.target.value)}
                  placeholder="批注内容"
                  className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-teal-500 focus:outline-none"
                />
                <button
                  onClick={() => removeAnnotation(i)}
                  className="shrink-0 text-slate-400 active:text-red-500"
                  aria-label="删除批注"
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

        {/* 图片（需先保存后才能上传） */}
        {id ? (
          <div>
            <span className="mb-2 block text-xs font-medium text-slate-500">图片</span>
            {images.length > 0 && (
              <div className="mb-2 grid grid-cols-3 gap-2">
                {images.map((img) => (
                  <div key={img.id} className="relative">
                    <img
                      src={img.url}
                      alt={img.filename}
                      className="h-20 w-full rounded-lg object-cover"
                    />
                    <button
                      onClick={() => removeImage(img.id)}
                      className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-xs text-white"
                      aria-label="删除图片"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={handleUpload}
              disabled={uploading}
              className="block w-full text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-teal-700"
            />
            {uploading && <span className="text-xs text-slate-400">上传中…</span>}
          </div>
        ) : (
          <p className="text-xs text-slate-400">保存后可上传图片。</p>
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
