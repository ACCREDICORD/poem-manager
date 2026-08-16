import { useEffect, useState } from 'react'
import { referencesApi } from '../api.js'
import ChatPanel from './ChatPanel.jsx'
import ExemplarEditor from './ExemplarEditor.jsx'

export default function ReferenceList({ onSelect, onNew }) {
  const [refs, setRefs] = useState([])
  const [seeding, setSeeding] = useState(false)
  const [seedMode, setSeedMode] = useState('deep')
  const [initializing, setInitializing] = useState({})
  const [showAi, setShowAi] = useState(false)
  const [exemplars, setExemplars] = useState([])
  const [showExemplarEditor, setShowExemplarEditor] = useState(false)
  const [editingExemplarId, setEditingExemplarId] = useState(null)

  const load = () => {
    referencesApi.list().then(setRefs)
    referencesApi.exemplars().then(setExemplars).catch(() => {})
  }

  useEffect(() => {
    load()
  }, [])

  const initOpts = () =>
    seedMode === 'quick'
      ? { model: 'flash', reasoning: 'low' }
      : { model: 'pro', reasoning: 'high' }

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
        '批量初始化会对所有「待初始化」的参考作品逐首跑完整评审（快速约 4 分钟 / 深度约 25 分钟）。确定开始？',
      )
    )
      return
    setSeeding(true)
    try {
      await referencesApi.seed(initOpts())
      pollSeed()
    } catch (e) {
      alert(e.message || '初始化失败')
      setSeeding(false)
    }
  }

  const pollInit = (refId) => {
    const t = setInterval(async () => {
      try {
        const s = await referencesApi.initStatus(refId)
        if (s.status === 'done' || s.status === 'error') {
          clearInterval(t)
          setInitializing((m) => ({ ...m, [refId]: false }))
          load()
          if (s.status === 'error') alert('初始化失败，请重试')
        }
      } catch {
        clearInterval(t)
        setInitializing((m) => ({ ...m, [refId]: false }))
      }
    }, 3000)
  }

  const initOne = async (refId) => {
    setInitializing((m) => ({ ...m, [refId]: true }))
    try {
      await referencesApi.init(refId, initOpts())
      pollInit(refId)
    } catch (e) {
      alert(e.message || '初始化失败')
      setInitializing((m) => ({ ...m, [refId]: false }))
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-24 pt-4">
      <header className="mb-3 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-teal-800">参考基准库</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAi(true)}
            className="rounded-full bg-teal-50 px-3 py-1.5 text-sm font-medium text-teal-700"
          >
            ✨ AI 辅助
          </button>
          <button
            onClick={onNew}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            + 新建
          </button>
        </div>
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
          {seeding ? '初始化中…' : '批量初始化'}
        </button>
      </div>

      <p className="mb-3 text-xs text-slate-400">
        {refs.length} 首参考作品，作为 agents 评分的 5.0 分基准。
      </p>

      <ul className="space-y-2">
        {refs.map((r) => (
          <li key={r.id}>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
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
              {r.article && (
                <details className="mt-2 rounded-lg bg-slate-50 p-2">
                  <summary className="cursor-pointer text-xs font-medium text-teal-700">
                    📖 基准评分解析
                  </summary>
                  <div className="mt-2 space-y-2 text-xs leading-5 text-slate-600">
                    <div>
                      <span className="font-medium text-amber-600">神：</span>
                      <span className="whitespace-pre-wrap">{r.spirit_analysis}</span>
                    </div>
                    <div>
                      <span className="font-medium text-sky-600">形：</span>
                      <span className="whitespace-pre-wrap">{r.form_analysis}</span>
                    </div>
                    <div>
                      <span className="font-medium text-slate-700">解析文章：</span>
                      <span className="whitespace-pre-wrap">{r.article}</span>
                    </div>
                  </div>
                </details>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => onSelect(r.id)}
                  className="rounded-lg border border-slate-200 px-3 py-1 text-xs text-slate-600"
                >
                  编辑
                </button>
                {!r.article && (
                  <button
                    onClick={() => initOne(r.id)}
                    disabled={initializing[r.id]}
                    className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1 text-xs text-teal-700 disabled:opacity-50"
                  >
                    {initializing[r.id] ? '初始化中…' : '初始化'}
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      {/* 赏析范文库 */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-teal-800">
            赏析范文库
            <span className="ml-2 text-xs font-normal text-slate-400">
              {exemplars.length} 篇，供「生成赏析」作风格参照
            </span>
          </h2>
          <button
            onClick={() => {
              setEditingExemplarId(null)
              setShowExemplarEditor(true)
            }}
            className="rounded-lg bg-teal-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            + 新增范文
          </button>
        </div>
        {exemplars.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
            暂无范文
          </p>
        ) : (
          <ul className="space-y-2">
            {exemplars.map((x) => (
              <li key={x.id}>
                <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">《{x.title}》</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">
                        {x.kind === 'ci' ? '词' : '诗'} · {x.author}
                      </span>
                      <button
                        onClick={() => {
                          setEditingExemplarId(x.id)
                          setShowExemplarEditor(true)
                        }}
                        className="rounded-lg border border-slate-200 px-2 py-0.5 text-xs text-slate-600"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`删除范文《${x.title}》？`)) {
                            referencesApi
                              .removeExemplar(x.id)
                              .then(load)
                              .catch((e) => alert(e.message || '删除失败'))
                          }
                        }}
                        className="rounded-lg border border-red-200 px-2 py-0.5 text-xs text-red-500"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-xs text-slate-400">查看范文</summary>
                    <p className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-sm leading-7 text-slate-600">
                      {x.content}
                    </p>
                  </details>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {showAi && (
        <ChatPanel
          workspace="references"
          onClose={() => {
            setShowAi(false)
            load()
          }}
        />
      )}
      {showExemplarEditor && (
        <ExemplarEditor
          id={editingExemplarId}
          onSaved={() => {
            setShowExemplarEditor(false)
            setEditingExemplarId(null)
            load()
          }}
          onCancel={() => {
            setShowExemplarEditor(false)
            setEditingExemplarId(null)
          }}
        />
      )}
    </div>
  )
}
