// 断联兜底：浏览器直连 DeepSeek API（CORS 已验证可用）。
// key 仅保存在本机 localStorage，不进代码库、不上传服务器。
// 提示词构建所需数据（诗词/模板/范文）全部来自本地 IndexedDB 镜像。

import { db } from './db.js'

const KEY_STORE = 'deepseek_local_key'
const API = 'https://api.deepseek.com/chat/completions'

export const localKey = {
  get() {
    return localStorage.getItem(KEY_STORE) || ''
  },
  set(k) {
    localStorage.setItem(KEY_STORE, k.trim())
  },
  clear() {
    localStorage.removeItem(KEY_STORE)
  },
}

// 前端模型代号 → DeepSeek 模型名
const MODEL_MAP = {
  flash: 'deepseek-v4-flash',
  pro: 'deepseek-v4-pro',
}

function buildPayload(messages, model, reasoning, stream, tools) {
  const payload = {
    model: MODEL_MAP[model] || MODEL_MAP.pro,
    messages,
    stream,
  }
  if (tools) payload.tools = tools
  if (reasoning === 'none') {
    payload.thinking = { type: 'disabled' }
  } else if (['low', 'high', 'max'].includes(reasoning)) {
    payload.reasoning_effort = reasoning
    payload.thinking = { type: 'enabled' }
  }
  return payload
}

async function ensureKey() {
  const key = localKey.get()
  if (!key) throw new Error('未设置本机 DeepSeek key（点右上角 ⚙️ 设置后即可断联使用 AI）')
  return key
}

/** 流式对话：onReasoning(文本增量) / onDelta(正文增量) */
export async function directChatStream({ messages, model = 'pro', reasoning = 'high', onReasoning, onDelta }) {
  const key = await ensureKey()
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(buildPayload(messages, model, reasoning, true)),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `DeepSeek HTTP ${res.status}`)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buf.indexOf('\n\n')) >= 0) {
      const part = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 2)
      if (!part.startsWith('data:')) continue
      const data = part.slice(5).trim()
      if (data === '[DONE]') return
      let obj
      try {
        obj = JSON.parse(data)
      } catch {
        continue
      }
      if (obj.error) throw new Error(obj.error.message || 'DeepSeek 流错误')
      const delta = obj.choices?.[0]?.delta || {}
      const rc = delta.reasoning_content || delta.reasoning
      if (rc && onReasoning) onReasoning(rc)
      if (delta.content && onDelta) onDelta(delta.content)
    }
  }
}

/** 非流式调用，返回完整文本（赏析/导入识别用） */
export async function directChatComplete({ messages, model = 'pro', reasoning = 'high' }) {
  const key = await ensureKey()
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(buildPayload(messages, model, reasoning, false)),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `DeepSeek HTTP ${res.status}`)
  }
  const j = await res.json()
  return j.choices?.[0]?.message?.content || ''
}

// ---------- 提示词本地重建（与后端 build_system_prompt 对齐） ----------

const CHAT_BASE =
  '你是一位精通中国古典诗词创作的助手，擅长修改字句、校对平仄格律、押韵、点评与赏析。' +
  '请用中文回答，简洁准确，直接给出修改建议或诗词内容。'

export async function buildLocalChatMessages({ sessionId, poemId, templateId, history, userText }) {
  const parts = [CHAT_BASE]
  let tplId = templateId
  if (poemId) {
    const poem = await db.poems.get(Number(poemId))
    if (poem) {
      const ctx = [`【当前诗词】标题：${poem.title || '（无题）'}；类型：${poem.category || '（未分类）'}`]
      if (poem.content) ctx.push(`正文：\n${poem.content}`)
      parts.push(ctx.join('\n'))
      if (!tplId && poem.category) {
        const tpl = await db.templates.filter((t) => t.name === poem.category).first()
        if (tpl) tplId = tpl.id
      }
    }
  }
  if (tplId) {
    const tpl = await db.templates.get(Number(tplId))
    if (tpl) {
      const lines = [`【格律模板】《${tpl.name}》（${tpl.total_chars}字，${tpl.line_count}句）`]
      if (tpl.pattern && tpl.pattern.length) lines.push('平仄：' + tpl.pattern.join('、'))
      if (tpl.rhyme) lines.push('押韵：' + tpl.rhyme)
      parts.push(lines.join('\n'))
    }
  }
  const messages = [{ role: 'system', content: parts.join('\n\n') }]
  for (const m of history || []) {
    if (m.role === 'user' || m.role === 'assistant') messages.push({ role: m.role, content: m.content })
  }
  messages.push({ role: 'user', content: userText })
  return messages
}

// ---------- 赏析（断联直连）：风格指南 + 本地范文 ----------

const APPRECIATION_STYLE =
  '你是一位诗词鉴赏文章的写作者。请学习《唐诗鉴赏辞典》《宋词鉴赏辞典》《毛泽东诗词鉴赏》' +
  '等经典鉴赏书籍的笔法撰写赏析文章，要求：\n' +
  '1. 开篇知人论世：用一两句交代创作背景或作者心境，再以一句话立起全篇主旨。\n' +
  '2. 逐片（词）或逐联（诗）细读：摘引原句，扣住炼字、意象、声情、色彩逐层展开。\n' +
  '3. 点明章法与手法：起承转合、上下片分工、过片承转；比兴、用典、虚实、以景结情等，点到即说清作用。\n' +
  '4. 文末由篇及人、及时代收束，留下余味。\n' +
  '5. 语言文学化、有感染力；可适当引用前贤评语作印证。\n' +
  '6. 严格禁止出现：评分、得分、扣分、评委、维度、优劣等级等评审用语。\n' +
  '7. 篇幅 800～1200 字，简体中文。只输出文章正文，不要任何标题、小标题或说明文字。'

export async function generateAppreciationLocal({ title, content, category, kind, model = 'pro', reasoning = 'high' }) {
  const exemplars = await db.exemplars.toArray()
  const sameKind = exemplars.filter((x) => x.kind === kind)
  const picks = (sameKind.length ? sameKind : exemplars).slice(0, 2)
  const examples = picks
    .map((r, i) => `【范文${i + 1}】《${r.title}》（${r.author}）\n${r.content}`)
    .join('\n\n')
  const prompt = [
    APPRECIATION_STYLE,
    `【参考范文】（学习其笔法与气息，不要抄袭内容）\n${examples || '（暂无范文）'}`,
    `【待赏析作品】《${title || '无题'}》（${category || '未分类'}）\n${content}`,
    '请为上面的作品撰写一篇赏析文章。',
  ].join('\n\n')
  return directChatComplete({ messages: [{ role: 'user', content: prompt }], model, reasoning })
}

// ---------- 导入识别（断联直连） ----------

function splitBlocks(text) {
  return (text || '')
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean)
}

function extractJsonArray(text) {
  let t = (text || '').trim()
  if (t.startsWith('```')) {
    t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '').trim()
  }
  try {
    return JSON.parse(t)
  } catch {
    const start = t.indexOf('[')
    const end = t.lastIndexOf(']')
    if (start >= 0 && end > start) return JSON.parse(t.slice(start, end + 1))
    throw new Error('识别结果解析失败')
  }
}

export async function analyzeImportLocal({ text, model = 'pro', reasoning = 'high' }) {
  const blocks = splitBlocks(text)
  if (!blocks.length) return []
  const numbered = blocks.map((b, i) => `【${i}】\n${b}`).join('\n\n')
  const prompt = [
    '下面有若干段文字，请逐段判断是否为诗词（词牌名/标题/正文）。'
      + '对每一段输出：是否诗词、标题猜测、类型（词牌名如临江仙，或诗体如七律/七绝/五律/五绝/排律/古体/杂言等）。'
      + '若某段不是诗词，is_poem=false。',
    numbered,
    '请只输出 JSON 数组，每个元素：{"index": <序号>, "is_poem": <true/false>, "title": "<标题>", "category": "<类型>"}',
  ].join('\n\n')
  const raw = await directChatComplete({ messages: [{ role: 'user', content: prompt }], model, reasoning })
  const result = extractJsonArray(raw)
  const candidates = []
  for (const item of result) {
    const idx = item.index
    if (idx == null || idx >= blocks.length) continue
    candidates.push({
      index: idx,
      content: blocks[idx],
      is_poem: !!item.is_poem,
      title: item.title || '',
      category: item.category || '',
    })
  }
  return candidates
}
