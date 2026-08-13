"""Agent 模式：DeepSeek function calling + 人工在环（每步执行前确认）。"""

import json
import uuid

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_

from .. import models
from ..config import DEEPSEEK_API_KEY, MODELS
from ..database import SessionLocal
from ..deepseek import chat_complete

router = APIRouter()

SYSTEM_PROMPT = (
    "你是一位诗词管理助手，可以通过调用工具帮助用户查找、创建、修改诗词或格律模板。"
    "每次只调用一个工具，并用一句话清晰说明你要做什么。完成后用中文简要总结结果。"
)

TOOLS = [
    {"type": "function", "function": {"name": "search_poems", "description": "按关键词或分类搜索诗词", "parameters": {"type": "object", "properties": {"q": {"type": "string"}, "category": {"type": "string"}}, "required": []}}},
    {"type": "function", "function": {"name": "get_poem", "description": "获取某首诗词的完整内容", "parameters": {"type": "object", "properties": {"poem_id": {"type": "integer"}}, "required": ["poem_id"]}}},
    {"type": "function", "function": {"name": "create_poem", "description": "新建一首诗词并保存", "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}, "created_date": {"type": "string"}}, "required": ["content"]}}},
    {"type": "function", "function": {"name": "update_poem", "description": "修改已保存的诗词", "parameters": {"type": "object", "properties": {"poem_id": {"type": "integer"}, "title": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}}, "required": ["poem_id"]}}},
    {"type": "function", "function": {"name": "delete_poem", "description": "删除一首诗词", "parameters": {"type": "object", "properties": {"poem_id": {"type": "integer"}}, "required": ["poem_id"]}}},
    {"type": "function", "function": {"name": "toggle_favorite", "description": "收藏或取消收藏一首诗词", "parameters": {"type": "object", "properties": {"poem_id": {"type": "integer"}}, "required": ["poem_id"]}}},
    {"type": "function", "function": {"name": "list_templates", "description": "列出格律模板（词牌/诗体）", "parameters": {"type": "object", "properties": {"kind": {"type": "string", "description": "ci 或 shi"}}, "required": []}}},
    {"type": "function", "function": {"name": "get_template", "description": "获取某格律模板的平仄与押韵", "parameters": {"type": "object", "properties": {"template_id": {"type": "integer"}}, "required": ["template_id"]}}},
    {"type": "function", "function": {"name": "create_template", "description": "新建格律模板", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "kind": {"type": "string"}, "pattern": {"type": "array", "items": {"type": "string"}}, "rhyme": {"type": "string"}}, "required": ["name"]}}},
]


def _execute_tool(name: str, args: dict) -> str:
    db = SessionLocal()
    try:
        if name == "search_poems":
            q = args.get("q", "")
            category = args.get("category", "")
            query = db.query(models.Poem)
            if category:
                query = query.filter(models.Poem.category == category)
            if q:
                like = f"%{q}%"
                query = query.filter(
                    or_(models.Poem.title.ilike(like), models.Poem.content.ilike(like))
                )
            rows = query.limit(20).all()
            return json.dumps(
                [{"id": p.id, "title": p.title, "category": p.category} for p in rows],
                ensure_ascii=False,
            )
        if name == "get_poem":
            p = db.get(models.Poem, args.get("poem_id"))
            if not p:
                return "未找到该诗词"
            return json.dumps(
                {"id": p.id, "title": p.title, "category": p.category, "content": p.content},
                ensure_ascii=False,
            )
        if name == "create_poem":
            p = models.Poem(
                title=args.get("title", ""),
                content=args.get("content", ""),
                category=args.get("category", ""),
                source="agent",
            )
            db.add(p)
            db.commit()
            db.refresh(p)
            return f"已创建诗词 id={p.id}"
        if name == "update_poem":
            p = db.get(models.Poem, args.get("poem_id"))
            if not p:
                return "未找到该诗词"
            for k in ("title", "content", "category"):
                if k in args:
                    setattr(p, k, args[k])
            db.commit()
            return f"已更新诗词 id={p.id}"
        if name == "delete_poem":
            p = db.get(models.Poem, args.get("poem_id"))
            if not p:
                return "未找到该诗词"
            db.delete(p)
            db.commit()
            return f"已删除诗词 id={p.id}"
        if name == "toggle_favorite":
            p = db.get(models.Poem, args.get("poem_id"))
            if not p:
                return "未找到该诗词"
            p.is_favorite = not p.is_favorite
            db.commit()
            return f"收藏状态已切换为 {p.is_favorite}"
        if name == "list_templates":
            kind = args.get("kind", "")
            query = db.query(models.Template)
            if kind in ("ci", "shi"):
                query = query.filter(models.Template.kind == kind)
            rows = query.all()
            return json.dumps(
                [{"id": t.id, "name": t.name, "kind": t.kind} for t in rows],
                ensure_ascii=False,
            )
        if name == "get_template":
            t = db.get(models.Template, args.get("template_id"))
            if not t:
                return "未找到该模板"
            return json.dumps(
                {"id": t.id, "name": t.name, "kind": t.kind, "pattern": t.pattern, "rhyme": t.rhyme},
                ensure_ascii=False,
            )
        if name == "create_template":
            pattern = args.get("pattern") or []
            t = models.Template(
                name=args.get("name", ""),
                kind=args.get("kind", "ci"),
                pattern=pattern,
                rhyme=args.get("rhyme", ""),
                example=args.get("example", ""),
            )
            t.line_count = len(pattern)
            db.add(t)
            db.commit()
            db.refresh(t)
            return f"已创建格律模板 id={t.id}"
        return f"未知工具 {name}"
    finally:
        db.close()


def _preview(name: str, args: dict) -> str:
    a = args or {}
    if name == "create_poem":
        return f"新建诗词《{a.get('title') or '无题'}》（{a.get('category') or '未分类'}）"
    if name == "update_poem":
        return f"修改诗词 #{a.get('poem_id')}"
    if name == "delete_poem":
        return f"删除诗词 #{a.get('poem_id')}"
    if name == "toggle_favorite":
        return f"切换收藏 诗词 #{a.get('poem_id')}"
    if name == "search_poems":
        return f"搜索诗词（{a.get('q') or a.get('category') or '全部'}）"
    if name == "get_poem":
        return f"查看诗词 #{a.get('poem_id')}"
    if name == "list_templates":
        return "列出格律模板"
    if name == "get_template":
        return f"查看格律模板 #{a.get('template_id')}"
    if name == "create_template":
        return f"新建格律模板《{a.get('name')}》"
    return f"调用工具 {name}"


# 会话内存态（单用户；重启后重置）
_sessions: dict[str, dict] = {}


def _sess(session_id: str, model: str, reasoning: str) -> dict:
    s = _sessions.get(session_id)
    if s is None:
        s = {"messages": [{"role": "system", "content": SYSTEM_PROMPT}], "current": None}
        _sessions[session_id] = s
    s["model"] = model
    s["reasoning"] = reasoning
    return s


async def _next(s: dict, model: str, reasoning: str):
    """跑一轮 LLM，返回 {"type":"text"|"step", ...}。"""
    resp = await chat_complete(s["messages"], model=model, reasoning=reasoning, tools=TOOLS)
    msg = resp["choices"][0]["message"]
    calls = msg.get("tool_calls")
    if calls:
        s["messages"].append(msg)
        call = calls[0]
        s["current"] = call
        try:
            args = json.loads(call["function"]["arguments"] or "{}")
        except json.JSONDecodeError:
            args = {}
        return {
            "type": "step",
            "step": {
                "id": str(uuid.uuid4()),
                "tool": call["function"]["name"],
                "args": args,
                "preview": _preview(call["function"]["name"], args),
            },
        }
    content = msg.get("content") or ""
    s["messages"].append({"role": "assistant", "content": content})
    return {"type": "text", "content": content}


class AgentMessageRequest(BaseModel):
    message: str
    session_id: str = "agent"
    model: str = "flash"
    reasoning: str = "high"


class StepRequest(BaseModel):
    action: str = "confirm"  # confirm | skip | abort


@router.post("/message")
async def agent_message(req: AgentMessageRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=400, detail="未配置 DeepSeek API key")
    model = MODELS.get(req.model, MODELS["flash"])
    s = _sess(req.session_id, model, req.reasoning)
    s["messages"].append({"role": "user", "content": req.message})
    return await _next(s, model, req.reasoning)


@router.post("/step")
async def agent_step(req: StepRequest, session_id: str = "agent"):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=400, detail="未配置 DeepSeek API key")
    s = _sessions.get(session_id)
    if s is None or s.get("current") is None:
        return {"type": "text", "content": "没有待确认的步骤。"}
    model = s.get("model", MODELS["flash"])
    reasoning = s.get("reasoning", "high")
    call = s["current"]
    s["current"] = None

    if req.action == "abort":
        return {"type": "text", "content": "已中止，未执行该步骤。"}

    try:
        args = json.loads(call["function"]["arguments"] or "{}")
    except json.JSONDecodeError:
        args = {}
    if req.action == "confirm":
        result = _execute_tool(call["function"]["name"], args)
    else:  # skip
        result = "用户跳过了这一步（未执行）。"

    s["messages"].append(
        {"role": "tool", "tool_call_id": call.get("id"), "content": result}
    )
    return await _next(s, model, reasoning)
