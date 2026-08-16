import { useEffect, useRef, useState } from 'react'
import { poemsApi, referencesApi, mediaUrl } from '../api.js'
import ChatPanel from './ChatPanel.jsx'

export default function PoemDetail({ id, onBack, onEdit, onDeleted }) {
  const [poem, setPoem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showChat, setShowChat] = useState(false)
  const [rating, setRating] = useState(false)
  const [rateMode, setRateMode] = useState('quick')
  const pollRef = useRef(null)

  const stopPolling = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }

  const askAddReference = (p) => {
    if (confirm(`这首诗 AI 综合分 ${p.agent_score}（>4.5），是否加入参考基准库？`)) {
      referencesApi
        .addFromPoem(p.id)
        .then(() => alert('已加入参考基准库'))
        .catch((e) => alert(e.message || '加入失败'))
    }
  }

  const pollUntilDone = (poemId) => {
    stopPolling()
    const check = async () => {
      try {
        const res = await poemsApi.rateStatus(poemId)
        if (res.status === 'done') {
          setRating(false)
          const updated = await poemsApi.get(poemId)
          setPoem(updated)
          if (updated.agent_score != null && updated.agent_score > 4.5) {
            askAddReference(updated)
          }
          return
        }
        if (res.status === 'error') {
          setRating(false)
          alert('评分失败，请重试')
          return
        }
        pollRef.current = setTimeout(check, 3000)
      } catch (e) {
        setRating(false)
      }
    }
    check()
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    poemsApi
      .get(id)
      .then((d) => {
        if (active) setPoem(d)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    // 切走再回来时，若正在评分则继续轮询
    poemsApi
      .rateStatus(id)
      .then((res) => {
        if (res.status === 'running') {
          setRating(true)
          pollUntilDone(id)
        }
      })
      .catch(() => {})
    return () => {
      active = false
      stopPolling()
    }
  }, [id])

  if (loading || !poem) {
    return <p className="py-12 text-center text-slate-400">加载中…</p>
  }

  const toggleFav = async () => {
    const updated = await poemsApi.toggleFavorite(poem.id)
    setPoem(updated)
  }

  const remove = async () => {
    if (!confirm('确定删除这首诗吗？此操作不可撤销。')) return
    await poemsApi.remove(poem.id)
    onDeleted()
  }

  const rate = async () => {
    setRating(true)
    try {
      const opts =
        rateMode === 'quick'
          ? { model: 'flash', reasoning: 'low' }
          : { model: 'pro', reasoning: 'high' }
      await poemsApi.rate(poem.id, opts)
      pollUntilDone(poem.id)
    } catch (e) {
      setRating(false)
      alert(e.message || '评分失败')
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-4">
      <header className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="text-slate-500 active:text-slate-700">
          ← 返回
        </button>
        <div className="flex gap-2">
          <button
            onClick={() => setShowChat(true)}
            className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm text-teal-700"
          >
            AI 辅助
          </button>
          <button
            onClick={() => onEdit(poem.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-600"
          >
            编辑
          </button>
          <button
            onClick={remove}
            className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-sm text-red-500"
          >
            删除
          </button>
        </div>
      </header>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <h1 className="text-2xl font-bold text-slate-800">{poem.title || '（无题）'}</h1>
          <button onClick={toggleFav} className="text-2xl" aria-label="收藏">
            {poem.is_favorite ? '⭐' : '☆'}
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-500">
          {poem.category && (
            <span className="rounded-full bg-teal-50 px-2.5 py-0.5 text-teal-700">
              {poem.category}
            </span>
          )}
          {poem.created_date && <span>创作于 {poem.created_date}</span>}
          {poem.source === 'import' && <span className="text-slate-400">（导入）</span>}
        </div>

        {/* Scores (5 分制) */}
        {(poem.user_score != null ||
          poem.agent_score != null ||
          poem.comprehensive_score != null) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {poem.user_score != null && (
              <ScoreBadge label="自评" value={poem.user_score} />
            )}
            {poem.agent_score != null && (
              <ScoreBadge label="AI 综合" value={poem.agent_score} />
            )}
            {poem.agent_spirit_score != null && (
              <ScoreBadge label="神" value={poem.agent_spirit_score} />
            )}
            {poem.agent_form_score != null && (
              <ScoreBadge label="形" value={poem.agent_form_score} />
            )}
            {poem.comprehensive_score != null && (
              <ScoreBadge label="综合" value={poem.comprehensive_score} highlight />
            )}
          </div>
        )}

        <div className="mt-3 flex items-center gap-2">
          <div className="flex overflow-hidden rounded-lg border border-slate-200">
            <button
              onClick={() => setRateMode('quick')}
              className={`px-2.5 py-1 text-xs ${
                rateMode === 'quick' ? 'bg-teal-600 text-white' : 'text-slate-500'
              }`}
            >
              快速
            </button>
            <button
              onClick={() => setRateMode('deep')}
              className={`px-2.5 py-1 text-xs ${
                rateMode === 'deep' ? 'bg-teal-600 text-white' : 'text-slate-500'
              }`}
            >
              深度
            </button>
          </div>
          <button
            onClick={rate}
            disabled={rating}
            className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm text-teal-700 disabled:opacity-50"
          >
            {rating ? '评分中…' : poem.agent_score != null ? '重新评分' : '让 agents 评分'}
          </button>
        </div>

        {poem.tags?.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {poem.tags.map((t) => (
              <span
                key={t}
                className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500"
              >
                #{t}
              </span>
            ))}
          </div>
        )}

        <hr className="my-4 border-slate-100" />

        {poem.content ? (
          <div className="poem-content text-base text-slate-700">{poem.content}</div>
        ) : (
          <p className="text-slate-400">（无正文）</p>
        )}

        {/* AI 赏析报告 */}
        {poem.agent_report && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">AI 赏析报告</h2>
            {poem.agent_report.article && (
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-600">
                {poem.agent_report.article}
              </p>
            )}
            {poem.agent_scores?.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-xs text-slate-400">
                  4 位评委明细（神×2、形×2）
                </summary>
                <div className="mt-2 space-y-1.5">
                  {poem.agent_scores.map((s, i) => (
                    <div key={i} className="rounded bg-slate-50 p-2 text-xs text-slate-600">
                      <span className="font-medium">
                        {s.dimension}：{s.score} 分
                      </span>{' '}
                      {s.reason}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}

        {/* Annotations */}
        {poem.annotations?.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">批注</h2>
            {poem.annotations.map((a, i) => (
              <div key={i} className="mb-2 rounded-lg bg-amber-50 p-3 text-sm text-slate-600">
                {a.line != null && (
                  <span className="mr-1 text-xs text-amber-600">第{a.line}句</span>
                )}
                {a.text}
              </div>
            ))}
          </div>
        )}

        {/* Images */}
        {poem.images?.length > 0 && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">图片</h2>
            <div className="grid grid-cols-3 gap-2">
              {poem.images.map((img) => (
                <a key={img.id} href={mediaUrl(img.url)} target="_blank" rel="noreferrer">
                  <img
                    src={mediaUrl(img.url)}
                    alt={img.filename}
                    className="h-24 w-full rounded-lg object-cover"
                  />
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {showChat && <ChatPanel poemId={poem.id} onClose={() => setShowChat(false)} />}
    </div>
  )
}

function ScoreBadge({ label, value, highlight }) {
  return (
    <span
      className={`rounded-lg px-2.5 py-1 text-sm font-medium ${
        highlight ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-600'
      }`}
    >
      {label} {value}
    </span>
  )
}
