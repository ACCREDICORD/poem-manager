import { useEffect, useState } from 'react'
import { referencesApi } from '../api.js'

export default function ReferenceList({ onSelect }) {
  const [refs, setRefs] = useState([])
  const [seeding, setSeeding] = useState(false)
  const [seedMode, setSeedMode] = useState('deep')

  const load = () => referencesApi.list().then(setRefs)

  useEffect(() => {
    load()
  }, [])

  const pollSeed = () => {
    const t = setInterval(async () => {
      try {
        const s = await referencesApi.seedStatus()
        if (s.status === 'done' || s.status === 'error') {
          clearInterval(t)
          setSeeding(false)
          load()
          if (s.status === 'error') alert('初始化失败，请重试')
        }
      } catch {
        clearInterval(t)
        setSeeding(false)
      }
    }, 3000)
  }

  const startSeed = async () => {
    if (
      !confirm(
        '初始化会对尚未评审的参考作品逐首跑完整评审，生成参考文章（快速约 4 分钟 / 深度约 25 分钟）。确定开始？',
      )
    )
      return
    setSeeding(true)
    try {
      const opts =
        seedMode === 'quick'
          ? { model: 'flash', reasoning: 'low' }
          : { model: 'pro', reasoning: 'high' }
      await referencesApi.seed(opts)
      pollSeed()
    } catch (e) {
      alert(e.message || '初始化失败')
      setSeeding(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-teal-800">参考基准库</h1>
      </header>

      <div className="mb-3 flex items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-slate-200">
          <button
            onClick={() => setSeedMode('quick')}
            className={`px-2.5 py-1 text-xs ${
              seedMode === 'quick' ? 'bg-teal-600 text-white' : 'text-slate-500'
            }`}
          >
            快速
          </button>
          <button
            onClick={() => setSeedMode('deep')}
            className={`px-2.5 py-1 text-xs ${
              seedMode === 'deep' ? 'bg-teal-600 text-white' : 'text-slate-500'
            }`}
          >
            深度
          </button>
        </div>
        <button
          onClick={startSeed}
          disabled={seeding}
          className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {seeding ? '初始化中…' : '初始化参考库'}
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-400">
        {refs.length} 首满分基准作品，作为 agents 评分的 5.0 标准。点击可检查/编辑原文。
      </p>

      <ul className="space-y-2">
        {refs.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => onSelect(r.id)}
              className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-teal-300"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-slate-800">{r.title}</span>
                <span className="text-xs text-slate-400">
                  {r.kind === 'ci' ? '词' : '诗'} · {r.author} ·{' '}
                  {r.article ? '✅ 已初始化' : '⏳ 待初始化'}
                </span>
              </div>
              <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-500">
                {r.content}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
