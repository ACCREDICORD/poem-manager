import { useEffect, useRef, useState } from 'react'
import { importApi, poemsApi } from '../api.js'
import { analyzeImportLocal } from '../directAi.js'

export default function ImportPanel({ onClose, onImported }) {
  const [text, setText] = useState('')
  const [candidates, setCandidates] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [])

  const applyCandidates = (list) => {
    setCandidates((list || []).map((c) => ({ ...c, selected: c.is_poem })))
  }

  const startPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current)
    pollRef.current = setInterval(async () => {
      try {
        const s = await importApi.analyzeStatus()
        if (s.status === 'done') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setAnalyzing(false)
          applyCandidates(s.candidates)
          return
        }
        if (s.status === 'error') {
          clearInterval(pollRef.current)
          pollRef.current = null
          setAnalyzing(false)
          setError(s.error || '识别失败，请重试')
        }
      } catch {
        // 单次轮询失败不终止（移动网络抖动），下个周期继续
      }
    }, 2500)
  }

  const analyze = async () => {
    if (!text.trim() || analyzing) return
    setAnalyzing(true)
    setError('')
    const isNetwork = (e) => e instanceof TypeError || /服务器不可达|Failed to fetch|NetworkError/i.test(e.message || '')
    try {
      const res = await importApi.analyze(text)
      if (res.status === 'done') {
        setAnalyzing(false)
        applyCandidates(res.candidates)
        return
      }
      if (res.status === 'busy') {
        setAnalyzing(false)
        setError(res.detail || '已有识别任务进行中，请稍候')
        return
      }
      // running：进入轮询
      startPolling()
    } catch (e) {
      if (isNetwork(e)) {
        // 与服务器断联：本机直连 DeepSeek 识别
        try {
          const cands = await analyzeImportLocal({ text })
          setAnalyzing(false)
          applyCandidates(cands)
        } catch (e2) {
          setAnalyzing(false)
          setError(e2.message || '识别失败')
        }
      } else {
        setAnalyzing(false)
        setError(e.message || '识别失败')
      }
    }
  }

  const updateCandidate = (i, key, val) =>
    setCandidates((prev) => prev.map((c, idx) => (idx === i ? { ...c, [key]: val } : c)))

  const save = async () => {
    const items = candidates.filter((c) => c.selected)
    if (!items.length) return
    setSaving(true)
    try {
      // 本地优先入库：断联时进同步队列，联网时自动上传
      for (const it of items) {
        await poemsApi.create({
          title: it.title,
          content: it.content,
          category: it.category,
          source: 'import',
        })
      }
      onImported()
      onClose()
    } catch (e) {
      setError(e.message || '导入失败')
    } finally {
      setSaving(false)
    }
  }

  const handleFile = (e) => {
    const f = e.target.files[0]
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => setText(reader.result || '')
    reader.readAsText(f)
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-slate-900/40">
      <div className="mx-auto flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h2 className="font-semibold text-slate-800">导入诗词</h2>
          <button onClick={onClose} className="text-slate-400 active:text-slate-600">
            ✕
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-500">{error}</p>}

          {!candidates ? (
            <>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={10}
                placeholder="粘贴诗词文本（多首用空行分隔），或上传 txt/md 文件…"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm leading-7 focus:border-teal-500 focus:outline-none"
              />
              <div className="mt-2">
                <input
                  type="file"
                  accept=".txt,.md,.markdown,text/plain"
                  onChange={handleFile}
                  className="text-sm text-slate-500 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-teal-700"
                />
              </div>
              <button
                onClick={analyze}
                disabled={analyzing || !text.trim()}
                className="mt-3 w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {analyzing ? '识别中…' : '识别诗词'}
              </button>
            </>
          ) : (
            <>
              <p className="mb-2 text-sm text-slate-500">
                识别出 {candidates.length} 段，请勾选「是诗词」并确认标题/类型：
              </p>
              <ul className="space-y-2">
                {candidates.map((c, i) => (
                  <li
                    key={i}
                    className={`rounded-xl border p-3 ${
                      c.selected ? 'border-teal-300 bg-teal-50/50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={(e) => updateCandidate(i, 'selected', e.target.checked)}
                      />
                      <span className="text-xs text-slate-500">是诗词</span>
                    </label>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <input
                        value={c.title}
                        onChange={(e) => updateCandidate(i, 'title', e.target.value)}
                        placeholder="标题"
                        className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                      />
                      <input
                        value={c.category}
                        onChange={(e) => updateCandidate(i, 'category', e.target.value)}
                        placeholder="类型（如七律）"
                        className="rounded border border-slate-200 px-2 py-1.5 text-sm"
                      />
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-line text-xs text-slate-500">
                      {c.content}
                    </p>
                  </li>
                ))}
              </ul>
              <button
                onClick={save}
                disabled={saving || !candidates.some((c) => c.selected)}
                className="mt-3 w-full rounded-lg bg-teal-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? '导入中…' : `导入 ${candidates.filter((c) => c.selected).length} 首`}
              </button>
              <button
                onClick={() => setCandidates(null)}
                className="mt-2 w-full rounded-lg border border-slate-200 py-2 text-sm text-slate-500"
              >
                返回重贴
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
