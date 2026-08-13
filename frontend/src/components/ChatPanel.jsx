import { useEffect, useRef, useState } from 'react'
import { chatApi } from '../api.js'

export default function ChatPanel({ poemId, onClose }) {
  const sessionId = poemId ? `poem_${poemId}` : 'general'
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [model, setModel] = useState('flash')
  const [reasoning, setReasoning] = useState('high')
  const bottomRef = useRef(null)

  useEffect(() => {
    chatApi
      .history(sessionId)
      .then((h) => setMessages(h.map((m) => ({ role: m.role, content: m.content }))))
      .catch(() => {})
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async () => {
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    setMessages((prev) => [...prev, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setBusy(true)
    try {
      await chatApi.stream({ message: text, poem_id: poemId, session_id: sessionId, model, reasoning }, (delta) => {
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last && last.role === 'assistant') last.content += delta
          return next
        })
      })
    } catch (e) {
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') last.content = `（出错了：${e.message}）`
        return next
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex flex-col justify-end bg-slate-900/40">
      <div className="mx-auto flex max-h-[85vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white">
        <header className="border-b border-slate-200 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">AI 辅助</h2>
            <button onClick={onClose} className="text-slate-400 active:text-slate-600">
              ✕
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
          {messages.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400">
              可以问我：改字、对平仄、凑韵、点评赏析…
            </p>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 ${
                  m.role === 'user' ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-700'
                }`}
              >
                {m.content || (busy && m.role === 'assistant' ? '…' : '')}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        <footer className="flex gap-2 border-t border-slate-200 p-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="输入问题…"
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
