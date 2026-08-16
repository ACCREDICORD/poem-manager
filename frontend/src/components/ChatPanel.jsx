import { useEffect, useRef, useState } from 'react'
import { agentApi, chatApi } from '../api.js'

const WORKSPACE_LABELS = {
  poems: '诗词库',
  templates: '格律库',
  references: '参考基准库',
  general: '全局',
}

export default function ChatPanel({ poemId, workspace, onClose }) {
  const isPoem = !!poemId
  const sessionId = isPoem ? `poem_${poemId}` : workspace || 'general'
  const workspaceLabel = isPoem ? '单首诗词' : WORKSPACE_LABELS[workspace || 'general'] || '全局'
  const [mode, setMode] = useState('chat') // chat | agent
  const [chatMsgs, setChatMsgs] = useState([])
  const [agentMsgs, setAgentMsgs] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [agentThinking, setAgentThinking] = useState(false)
  const [model, setModel] = useState('flash')
  const [reasoning, setReasoning] = useState('high')
  const bottomRef = useRef(null)

  const messages = mode === 'chat' ? chatMsgs : agentMsgs
  const setMessages = mode === 'chat' ? setChatMsgs : setAgentMsgs

  useEffect(() => {
    // 两个模式的会话相互独立，各自从数据库恢复历史
    chatApi
      .history(sessionId)
      .then((h) => setChatMsgs(h.map((m) => ({ role: m.role, content: m.content }))))
      .catch(() => {})
    agentApi
      .history(sessionId)
      .then((h) => setAgentMsgs(h.map((m) => ({ role: m.role, content: m.content }))))
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, agentThinking])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setBusy(true)

    if (mode === 'chat') {
      setMessages((prev) => [...prev, { role: 'assistant', content: '', thinking: '' }])
      try {
        await chatApi.stream(
          { message: text, poem_id: poemId, session_id: sessionId, model, reasoning },
          (delta) => {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last && last.role === 'assistant') last.content += delta
              return next
            })
          },
          (reasoningDelta) => {
            setMessages((prev) => {
              const next = [...prev]
              const last = next[next.length - 1]
              if (last && last.role === 'assistant') last.thinking = (last.thinking || '') + reasoningDelta
              return next
            })
          },
        )
      } catch (e) {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') last.content = `（出错了：${e.message}）`
          return next
        })
      }
    } else {
      setAgentThinking(true)
      try {
        const res = await agentApi.message({ message: text, session_id: sessionId, model, reasoning })
        applyAgentResult(res)
      } catch (e) {
        setMessages((prev) => [...prev, { role: 'assistant', content: `（出错了：${e.message}）` }])
      }
      setAgentThinking(false)
    }
    setBusy(false)
  }

  const applyAgentResult = (res) => {
    if (res.type === 'text') {
      setAgentMsgs((prev) => [...prev, { role: 'assistant', content: res.content }])
    } else if (res.type === 'step') {
      setAgentMsgs((prev) => [...prev, { type: 'step', step: res.step, status: 'pending' }])
    }
  }

  const actStep = async (index, action) => {
    if (busy) return
    setBusy(true)
    setAgentThinking(true)
    setAgentMsgs((prev) =>
      prev.map((m, i) =>
        i === index ? { ...m, status: action === 'confirm' ? 'done' : action === 'skip' ? 'skipped' : m.status } : m,
      ),
    )
    try {
      const res = await agentApi.step(sessionId, action)
      applyAgentResult(res)
    } catch (e) {
      setAgentMsgs((prev) => [...prev, { role: 'assistant', content: `（出错了：${e.message}）` }])
    }
    setAgentThinking(false)
    setBusy(false)
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-slate-900/40">
      <div className="mx-auto flex max-h-[88vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white">
        <header className="border-b border-slate-200 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">
              AI 辅助
              <span className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-xs font-normal text-teal-700">
                工作区：{workspaceLabel}
              </span>
            </h2>
            <button onClick={onClose} className="text-slate-400 active:text-slate-600">
              ✕
            </button>
          </div>
          <div className="mb-2 flex gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setMode('chat')}
              className={`flex-1 rounded-md py-1 text-sm ${
                mode === 'chat' ? 'bg-white font-medium text-teal-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              对话
            </button>
            <button
              onClick={() => setMode('agent')}
              className={`flex-1 rounded-md py-1 text-sm ${
                mode === 'agent' ? 'bg-white font-medium text-teal-700 shadow-sm' : 'text-slate-500'
              }`}
            >
              Agent
            </button>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex shrink-0 overflow-hidden rounded-full border border-slate-200">
              <button
                onClick={() => setModel('flash')}
                className={`px-3 py-1 text-xs ${
                  model === 'flash' ? 'bg-teal-600 text-white' : 'text-slate-500'
                }`}
              >
                Flash
              </button>
              <button
                onClick={() => setModel('pro')}
                className={`px-3 py-1 text-xs ${
                  model === 'pro' ? 'bg-teal-600 text-white' : 'text-slate-500'
                }`}
              >
                Pro
              </button>
            </div>
            <select
              value={reasoning}
              onChange={(e) => setReasoning(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600"
            >
              <option value="none">推理：关闭</option>
              <option value="low">推理：低</option>
              <option value="high">推理：高</option>
              <option value="max">推理：最大</option>
            </select>
          </div>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && !agentThinking && (
            <p className="py-8 text-center text-sm text-slate-400">
              {mode === 'chat'
                ? '可以问我：改字、对平仄、凑韵、点评赏析…'
                : '切到 Agent 后，可以让我直接帮你查找、新建、修改诗词或格律模板（每步都会先问你确认）。'}
            </p>
          )}
          {messages.map((m, i) => {
            if (m.type === 'step') {
              const step = m.step || {}
              return (
                <div
                  key={i}
                  className={`rounded-xl border p-3 ${
                    step.escalation ? 'border-amber-300 bg-amber-50' : 'border-teal-200 bg-teal-50'
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${step.escalation ? 'text-amber-800' : 'text-teal-800'}`}
                  >
                    {step.escalation ? '⚠️ 越权申请：' : '🔧 即将执行：'}
                    {step.preview}
                  </div>
                  {step.escalation && step.scope_reason && (
                    <div className="mt-1 text-xs text-amber-600">{step.scope_reason}（需你批准后才会执行）</div>
                  )}
                  {m.status === 'pending' ? (
                    <div className="mt-2 flex gap-2">
                      <button
                        onClick={() => actStep(i, 'confirm')}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium text-white ${
                          step.escalation ? 'bg-amber-600' : 'bg-teal-600'
                        }`}
                      >
                        {step.escalation ? '✅ 批准' : '✅ 确认'}
                      </button>
                      <button
                        onClick={() => actStep(i, 'skip')}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-600"
                      >
                        ⏭ 跳过
                      </button>
                      <button
                        onClick={() => actStep(i, 'abort')}
                        className="rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs text-red-500"
                      >
                        ⛔ 中止
                      </button>
                    </div>
                  ) : (
                    <div className="mt-1 text-xs text-slate-400">
                      {m.status === 'done' ? '✅ 已执行' : m.status === 'skipped' ? '⏭ 已跳过' : ''}
                    </div>
                  )}
                </div>
              )
            }
            if (m.role === 'assistant') {
              const thinkingActive = !!(m.thinking && !m.content)
              return (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[82%]">
                    {!!m.thinking && (
                      <details
                        open={thinkingActive}
                        className="mb-1.5 rounded-xl border border-amber-200 bg-amber-50/90 px-3 py-2"
                      >
                        <summary className="cursor-pointer select-none text-xs font-medium text-amber-700">
                          💭 {thinkingActive ? '思考中…' : '思考过程'}
                        </summary>
                        <div className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap text-xs leading-5 text-amber-800/80">
                          {m.thinking}
                        </div>
                      </details>
                    )}
                    <div className="whitespace-pre-wrap rounded-2xl bg-slate-100 px-3 py-2 text-sm leading-6 text-slate-700">
                      {m.content || (busy && !m.thinking ? '💭 思考中…' : '')}
                    </div>
                  </div>
                </div>
              )
            }
            return (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 ${
                    m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            )
          })}
          {mode === 'agent' && agentThinking && (
            <div className="flex justify-start">
              <div className="rounded-2xl bg-slate-100 px-3 py-2 text-sm text-slate-500">
                🤖 Agent 思考中…
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <footer className="flex gap-2 border-t border-slate-200 p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={mode === 'chat' ? '输入问题…' : '描述要做的操作，如「新建一首临江仙」'}
            className="min-w-0 flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm focus:border-teal-500 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={busy || !input.trim()}
            className="rounded-full bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            发送
          </button>
        </footer>
      </div>
    </div>
  )
}
