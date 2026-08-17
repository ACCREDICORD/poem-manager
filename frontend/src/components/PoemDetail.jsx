import { useEffect, useRef, useState } from 'react'
import { poemsApi, referencesApi, mediaUrl, rhymeApi } from '../api.js'
import { db } from '../db.js'
import { generateAppreciationLocal } from '../directAi.js'
import ChatPanel from './ChatPanel.jsx'

export default function PoemDetail({ id, onBack, onEdit, onDeleted }) {
  const [poem, setPoem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showChat, setShowChat] = useState(false)
  const [rating, setRating] = useState(false)
  const [rateMode, setRateMode] = useState('quick')
  const [appr, setAppr] = useState(false)
  const [apprMode, setApprMode] = useState('deep')
  const [rhymeReport, setRhymeReport] = useState(null)
  const [rhymeLoading, setRhymeLoading] = useState(false)
  const pollRef = useRef(null)
  const apprPollRef = useRef(null)

  const stopPolling = () => {
    if (pollRef.current) {
      clearTimeout(pollRef.current)
      pollRef.current = null
    }
  }

  const stopApprPolling = () => {
    if (apprPollRef.current) {
      clearTimeout(apprPollRef.current)
      apprPollRef.current = null
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
          const updated = await poemsApi.refreshFromServer(poemId)
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

  const apprPollUntilDone = (poemId) => {
    stopApprPolling()
    const check = async () => {
      try {
        const res = await poemsApi.appreciateStatus(poemId)
        if (res.status === 'done') {
          setAppr(false)
          const updated = await poemsApi.refreshFromServer(poemId)
          setPoem(updated)
          return
        }
        if (res.status === 'error') {
          setAppr(false)
          alert('赏析生成失败，请重试')
          return
        }
        apprPollRef.current = setTimeout(check, 3000)
      } catch (e) {
        setAppr(false)
      }
    }
    check()
  }

  useEffect(() => {
    let active = true
    setLoading(true)
    poemsApi
      .refreshFromServer(id)
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
    // 若正在生成赏析则继续轮询
    poemsApi
      .appreciateStatus(id)
      .then((res) => {
        if (res.status === 'running') {
          setAppr(true)
          apprPollUntilDone(id)
        }
      })
      .catch(() => {})
    return () => {
      active = false
      stopPolling()
      stopApprPolling()
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
      const msg =
        e instanceof TypeError || /服务器不可达|Failed to fetch/i.test(e.message || '')
          ? '评分需要连接服务器（断联暂不支持评分）'
          : e.message || '评分失败'
      alert(msg)
    }
  }

  const appreciate = async () => {
    setAppr(true)
    const opts =
      apprMode === 'quick'
        ? { model: 'flash', reasoning: 'low' }
        : { model: 'pro', reasoning: 'high' }
    const isNetwork = (e) => e instanceof TypeError || /服务器不可达|Failed to fetch|NetworkError/i.test(e.message || '')
    try {
      await poemsApi.appreciate(poem.id, opts)
      apprPollUntilDone(poem.id)
    } catch (e) {
      if (isNetwork(e)) {
        // 与服务器断联：本机直连 DeepSeek 生成赏析，结果入同步队列
        try {
          let kind = 'ci'
          const tpl = await db.templates.where('name').equals(poem.category || '').first()
          if (tpl) kind = tpl.kind
          const article = await generateAppreciationLocal({
            title: poem.title,
            content: poem.content,
            category: poem.category,
            kind,
            model: apprMode === 'quick' ? 'flash' : 'pro',
            reasoning: apprMode === 'quick' ? 'low' : 'high',
          })
          const updated = await poemsApi.update(poem.id, { appreciation: article })
          setPoem(updated)
          setAppr(false)
        } catch (e2) {
          setAppr(false)
          alert(e2.message || '生成失败')
        }
      } else {
        setAppr(false)
        alert(e.message || '生成失败')
      }
    }
  }

  const checkRhyme = async () => {
    setRhymeLoading(true)
    setRhymeReport(null)
    try {
      const report = await rhymeApi.check({ content: poem.content, category: poem.category })
      setRhymeReport(report)
    } catch (e) {
      alert(e.message || '校验失败')
    } finally {
      setRhymeLoading(false)
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
          <button
            onClick={checkRhyme}
            disabled={rhymeLoading || !poem.category}
            title="基于韵书数据库的逐字平仄/押韵校验"
            className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm text-indigo-700 disabled:opacity-50"
          >
            {rhymeLoading ? '校验中…' : '格律校验'}
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

        {/* 评分解读（评分理由阐述，保留） */}
        {poem.agent_report && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">评分解读</h2>
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

        {/* 赏析（鉴赏辞典风格文章） */}
        <div className="mt-5 border-t border-slate-100 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-500">赏析</h2>
            <div className="flex items-center gap-2">
              <div className="flex overflow-hidden rounded-lg border border-slate-200">
                <button
                  onClick={() => setApprMode('quick')}
                  className={`px-2 py-0.5 text-xs ${
                    apprMode === 'quick' ? 'bg-teal-600 text-white' : 'text-slate-500'
                  }`}
                >
                  快速
                </button>
                <button
                  onClick={() => setApprMode('deep')}
                  className={`px-2 py-0.5 text-xs ${
                    apprMode === 'deep' ? 'bg-teal-600 text-white' : 'text-slate-500'
                  }`}
                >
                  深度
                </button>
              </div>
              <button
                onClick={appreciate}
                disabled={appr}
                className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 text-sm text-teal-700 disabled:opacity-50"
              >
                {appr ? '生成中…' : poem.appreciation ? '重新生成赏析' : '生成赏析'}
              </button>
            </div>
          </div>
          {poem.appreciation ? (
            <div className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-[15px] leading-7 text-slate-700">
              {poem.appreciation}
            </div>
          ) : (
            !appr && (
              <p className="rounded-xl border border-dashed border-slate-200 p-4 text-center text-xs text-slate-400">
                按《唐诗鉴赏辞典》《毛泽东诗词鉴赏》等书籍的笔法，生成一篇真正的赏析文章（知人论世、逐句细读、不涉及评分）。
              </p>
            )
          )}
        </div>

        {/* 格律校验报告（韵书数据库确定性校验） */}
        {rhymeReport && (
          <div className="mt-5 border-t border-slate-100 pt-4">
            <h2 className="mb-2 text-sm font-semibold text-slate-500">
              格律校验（{rhymeReport.book}）
            </h2>
            <div className="space-y-2 text-sm">
              <p className="text-xs text-slate-400">
                词谱《{rhymeReport.template}》：实际 {rhymeReport.actual_lines} 句 / 词谱{' '}
                {rhymeReport.expected_lines} 句；韵脚{rhymeReport.same_rhyme ? '同部' : '分属多部'}
              </p>
              {rhymeReport.issues.length === 0 ? (
                <p className="rounded-lg bg-emerald-50 p-3 text-emerald-700">✅ 字数与平仄全部合律</p>
              ) : (
                rhymeReport.issues.map((it, i) => (
                  <div key={i} className="rounded-lg bg-red-50 p-2.5">
                    <p className="text-xs font-medium text-red-600">
                      第{it.line}句：{it.text}（{it.problem}）
                    </p>
                    {it.detail && it.detail.length > 0 && (
                      <ul className="mt-1 space-y-0.5 text-xs text-red-500">
                        {it.detail.map((d, j) => (
                          <li key={j}>
                            第{d.pos}字「{d.char}」
                            {d.problem === '平仄不合' ? `实为${d.actual}，应${d.expected}` : d.problem}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))
              )}
              {rhymeReport.rhyme_check?.length > 0 && (
                <details className="text-xs text-slate-500">
                  <summary>韵脚分组（词林正韵）</summary>
                  <div className="mt-1 space-y-1">
                    {rhymeReport.rhyme_check.map((g, i) => (
                      <p key={i}>
                        {g.group}：{g.chars.join(' ')}
                      </p>
                    ))}
                  </div>
                </details>
              )}
            </div>
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
