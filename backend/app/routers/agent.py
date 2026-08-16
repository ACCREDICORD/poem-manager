"""Agent 模式：DeepSeek function calling + 人工在环（每步执行前确认）+ 工作区权限。

工作区体系（session_id 即工作区标识）：
- general         全局工作区（可使用全部工具）
- poems           诗词库工作区（父级：可操作任意诗词）
- templates       格律库工作区（父级：可操作任意格律模板）
- references      参考基准库工作区（父级：可操作任意参考作品）
- poem_{id}       单首诗词工作区（子级：只能操作该诗；库级操作标记为越权申请）

同级工作区互相独立（工具集隔离）；子工作区不能直接操作父工作区，
但可以提出申请——越权步骤仍会展示给用户，由用户确认后执行。
"""

import asyncio
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session

from .. import models
from ..config import DEEPSEEK_API_KEY, MODELS
from ..database import SessionLocal, get_db
from ..deepseek import chat_complete
from ..reference_seed import evaluate_reference

router = APIRouter()

BASE_SYSTEM_PROMPT = (
    "你是一位诗词管理助手，可以通过调用工具帮助用户查找、创建、修改诗词、格律模板或参考作品。"
    "每次只调用一个工具，并用一句话清晰说明你要做什么。完成后用中文简要总结结果。"
    "当用户的需求明确需要某个操作时，直接调用对应工具（即使超出当前工作区权限也要调用——"
    "系统会自动把该步骤标记为越权申请，交由用户决定是否批准）；不要因为权限问题只做文字解释而拒绝行动。"
)

WORKSPACE_LABELS = {
    "poems": "诗词库",
    "templates": "格律库",
    "references": "参考基准库",
    "general": "全局",
}

# 各工作区可见的工具（同级隔离：诗词/格律/参考互不可见）
SCOPE_TOOLS = {
    "general": {
        "search_poems", "get_poem", "create_poem", "update_poem", "delete_poem", "toggle_favorite",
        "list_templates", "get_template", "create_template", "update_template", "delete_template",
        "search_references", "get_reference", "create_reference", "update_reference",
        "delete_reference", "init_reference",
    },
    "poems": {"search_poems", "get_poem", "create_poem", "update_poem", "delete_poem", "toggle_favorite"},
    "poem": {"search_poems", "get_poem", "create_poem", "update_poem", "delete_poem", "toggle_favorite"},
    "templates": {"list_templates", "get_template", "create_template", "update_template", "delete_template"},
    "references": {
        "search_references", "get_reference", "create_reference", "update_reference",
        "delete_reference", "init_reference",
    },
}

TOOLS = [
    {"type": "function", "function": {"name": "search_poems", "description": "按关键词或分类搜索诗词", "parameters": {"type": "object", "properties": {"q": {"type": "string"}, "category": {"type": "string"}}, "required": []}}},
    {"type": "function", "function": {"name": "get_poem", "description": "获取某首诗词的完整内容", "parameters": {"type": "object", "properties": {"poem_id": {"type": "integer"}}, "required": ["poem_id"]}}},
    {"type": "function", "function": {"name": "create_poem", "description": "新建一首诗词并保存", "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}, "created_date": {"type": "string"}}, "required": ["content"]}}},
    {"type": "function", "function": {"name": "update_poem", "description": "修改已保存的诗词", "parameters": {"type": "object", "properties": {"poem_id": {"type": "integer"}, "title": {"type": "string"}, "content": {"type": "string"}, "category": {"type": "string"}}, "required": ["poem_id"]}}},
    {"type": "function", "function": {"name": "delete_poem", "description": "删除一首诗词", "parameters": {"type": "object", "properties": {"poem_id": {"type": "integer"}}, "required": ["poem_id"]}}},
    {"type": "function", "function": {"name": "toggle_favorite", "description": "收藏或取消收藏一首诗词", "parameters": {"type": "object", "properties": {"poem_id": {"type": "integer"}}, "required": ["poem_id"]}}},
    {"type": "function", "function": {"name": "list_templates", "description": "列出格律模板（词牌/诗体）", "parameters": {"type": "object", "properties": {"kind": {"type": "string", "description": "ci 或 shi"}}, "required": []}}},
    {"type": "function", "function": {"name": "get_template", "description": "获取某格律模板的平仄与押韵", "parameters": {"type": "object", "properties": {"template_id": {"type": "integer"}}, "required": ["template_id"]}}},
    {"type": "function", "function": {"name": "create_template", "description": "新建格律模板", "parameters": {"type": "object", "properties": {"name": {"type": "string"}, "kind": {"type": "string", "description": "ci 词 / shi 诗"}, "pattern": {"type": "array", "items": {"type": "string"}}, "rhyme": {"type": "string"}, "example": {"type": "string"}}, "required": ["name"]}}},
    {"type": "function", "function": {"name": "update_template", "description": "修改格律模板", "parameters": {"type": "object", "properties": {"template_id": {"type": "integer"}, "name": {"type": "string"}, "kind": {"type": "string"}, "pattern": {"type": "array", "items": {"type": "string"}}, "rhyme": {"type": "string"}, "example": {"type": "string"}}, "required": ["template_id"]}}},
    {"type": "function", "function": {"name": "delete_template", "description": "删除格律模板", "parameters": {"type": "object", "properties": {"template_id": {"type": "integer"}}, "required": ["template_id"]}}},
    {"type": "function", "function": {"name": "search_references", "description": "按关键词搜索参考作品", "parameters": {"type": "object", "properties": {"q": {"type": "string"}}, "required": []}}},
    {"type": "function", "function": {"name": "get_reference", "description": "获取某参考作品的完整内容与分析", "parameters": {"type": "object", "properties": {"reference_id": {"type": "integer"}}, "required": ["reference_id"]}}},
    {"type": "function", "function": {"name": "create_reference", "description": "新建一首参考作品", "parameters": {"type": "object", "properties": {"title": {"type": "string"}, "author": {"type": "string"}, "kind": {"type": "string", "description": "ci 词 / shi 诗"}, "content": {"type": "string"}}, "required": ["title", "content"]}}},
    {"type": "function", "function": {"name": "update_reference", "description": "修改参考作品", "parameters": {"type": "object", "properties": {"reference_id": {"type": "integer"}, "title": {"type": "string"}, "author": {"type": "string"}, "kind": {"type": "string"}, "content": {"type": "string"}}, "required": ["reference_id"]}}},
    {"type": "function", "function": {"name": "delete_reference", "description": "删除参考作品", "parameters": {"type": "object", "properties": {"reference_id": {"type": "integer"}}, "required": ["reference_id"]}}},
    {"type": "function", "function": {"name": "init_reference", "description": "对某参考作品执行 AI 评审（初始化分析，后台运行）", "parameters": {"type": "object", "properties": {"reference_id": {"type": "integer"}}, "required": ["reference_id"]}}},
]


def parse_scope(session_id: str) -> dict:
    """由 session_id 解析工作区。"""
    sid = (session_id or "").strip() or "general"
    if sid == "agent":  # 兼容旧默认值
        sid = "general"
    if sid.startswith("poem_"):
        try:
            pid = int(sid.split("_", 1)[1])
            return {"kind": "poem", "poem_id": pid, "label": f"单首诗词 #{pid}"}
        except ValueError:
            pass
    if sid in WORKSPACE_LABELS:
        return {"kind": sid, "label": WORKSPACE_LABELS[sid]}
    return {"kind": "general", "label": "全局"}


def build_system_prompt(scope: dict) -> str:
    kind = scope["kind"]
    if kind == "poem":
        pid = scope["poem_id"]
        db = SessionLocal()
        try:
            p = db.get(models.Poem, pid)
            title = (p.title or "（无题）") if p else "（未找到）"
            content = (p.content or "")[:2000] if p else ""
        finally:
            db.close()
        ctx = f"你当前处于「单首诗词」工作区，对象是诗词 #{pid}《{title}》。\n正文：\n{content}".strip()
        rules = (
            "你只能查看、修改这首诗词本身。新建诗词、删除诗词、搜索诗词库、操作其他诗词都属于"
            "诗词库（父工作区）的权限；如果用户的需求明确需要这些操作，请直接调用对应工具提出申请"
            "（系统会将其标记为越权申请，由用户决定是否批准），不要自行拒绝。"
            "不要操作格律模板或参考作品（属于其他同级工作区）。"
        )
    elif kind == "poems":
        ctx = "你当前处于「诗词库」工作区，可以查找、新建、修改、删除、收藏任意诗词。"
        rules = "格律模板、参考作品属于其他同级工作区，你没有权限操作。"
    elif kind == "templates":
        ctx = "你当前处于「格律库」工作区，可以列出、查看、新建、修改、删除格律模板（词牌/诗体）。"
        rules = "诗词、参考作品属于其他同级工作区，你没有权限操作。"
    elif kind == "references":
        ctx = (
            "你当前处于「参考基准库」工作区，可以搜索、查看、新建、修改、删除参考作品，"
            "或对某首参考作品触发 AI 评审（初始化分析，后台运行）。"
        )
        rules = "诗词、格律模板属于其他同级工作区，你没有权限操作。"
    else:
        ctx = "你当前处于全局工作区，可以使用全部工具。"
        rules = ""
    parts = [BASE_SYSTEM_PROMPT, ctx]
    if rules:
        parts.append(rules)
    return "\n\n".join(parts)


def check_tool_scope(scope: dict, name: str, args: dict) -> tuple[bool, str]:
    """返回 (是否越权, 原因)。越权步骤仍需用户批准后才能执行。"""
    kind = scope["kind"]
    allowed = SCOPE_TOOLS.get(kind, SCOPE_TOOLS["general"])
    if name not in allowed:
        return True, f"工具 {name} 不在当前工作区可用"
    if kind == "poem":
        own = scope.get("poem_id")
        if name in ("create_poem", "search_poems"):
            return True, "该操作作用于整个诗词库（父工作区），超出当前单首诗词工作区"
        if name == "delete_poem":
            return True, "删除诗词属于诗词库（父工作区）操作，超出当前单首诗词工作区"
        if args.get("poem_id") != own:
            return True, "该操作针对其他诗词，超出当前单首诗词工作区"
    return False, ""


def _save_message(session_id: str, role: str, content: str) -> None:
    db = SessionLocal()
    try:
        db.add(models.Message(session_id=session_id, role=role, content=content, mode="agent"))
        db.commit()
    finally:
        db.close()


async def _execute_tool(name: str, args: dict, model: str, reasoning: str) -> str:
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
        if name == "update_template":
            t = db.get(models.Template, args.get("template_id"))
            if not t:
                return "未找到该模板"
            if "name" in args:
                t.name = args["name"]
            if "kind" in args:
                t.kind = args["kind"]
            if "pattern" in args:
                t.pattern = args["pattern"]
                t.line_count = len(args["pattern"])
            if "rhyme" in args:
                t.rhyme = args["rhyme"]
            if "example" in args:
                t.example = args["example"]
            db.commit()
            return f"已更新格律模板 id={t.id}"
        if name == "delete_template":
            t = db.get(models.Template, args.get("template_id"))
            if not t:
                return "未找到该模板"
            db.delete(t)
            db.commit()
            return f"已删除格律模板 id={t.id}"
        if name == "search_references":
            q = args.get("q", "")
            query = db.query(models.ReferenceArticle)
            if q:
                like = f"%{q}%"
                query = query.filter(
                    or_(
                        models.ReferenceArticle.title.ilike(like),
                        models.ReferenceArticle.author.ilike(like),
                    )
                )
            rows = query.limit(20).all()
            return json.dumps(
                [
                    {"id": r.id, "title": r.title, "author": r.author, "kind": r.kind,
                     "initialized": bool(r.article)}
                    for r in rows
                ],
                ensure_ascii=False,
            )
        if name == "get_reference":
            r = db.get(models.ReferenceArticle, args.get("reference_id"))
            if not r:
                return "未找到该参考作品"
            return json.dumps(
                {"id": r.id, "title": r.title, "author": r.author, "kind": r.kind,
                 "content": r.content, "article": r.article},
                ensure_ascii=False,
            )
        if name == "create_reference":
            r = models.ReferenceArticle(
                title=args.get("title", ""),
                author=args.get("author", ""),
                kind=args.get("kind", "ci"),
                content=args.get("content", ""),
            )
            db.add(r)
            db.commit()
            db.refresh(r)
            return f"已创建参考作品 id={r.id}"
        if name == "update_reference":
            r = db.get(models.ReferenceArticle, args.get("reference_id"))
            if not r:
                return "未找到该参考作品"
            for k in ("title", "author", "kind", "content"):
                if k in args:
                    setattr(r, k, args[k])
            db.commit()
            return f"已更新参考作品 id={r.id}"
        if name == "delete_reference":
            r = db.get(models.ReferenceArticle, args.get("reference_id"))
            if not r:
                return "未找到该参考作品"
            db.delete(r)
            db.commit()
            return f"已删除参考作品 id={r.id}"
        if name == "init_reference":
            rid = args.get("reference_id")
            if not db.get(models.ReferenceArticle, rid):
                return "未找到该参考作品"
            asyncio.create_task(_background_init(rid, model, reasoning))
            return f"已在后台开始评审参考作品 id={rid}，完成后自动写入分析，稍后可在参考库查看"
        return f"未知工具 {name}"
    finally:
        db.close()


async def _background_init(reference_id: int, model: str, reasoning: str) -> None:
    db = SessionLocal()
    try:
        r = db.get(models.ReferenceArticle, reference_id)
        if r is not None:
            await evaluate_reference(r, model, reasoning)
            db.commit()
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
    if name == "update_template":
        return f"修改格律模板 #{a.get('template_id')}"
    if name == "delete_template":
        return f"删除格律模板 #{a.get('template_id')}"
    if name == "search_references":
        return f"搜索参考作品（{a.get('q') or '全部'}）"
    if name == "get_reference":
        return f"查看参考作品 #{a.get('reference_id')}"
    if name == "create_reference":
        return f"新建参考作品《{a.get('title') or '无题'}》"
    if name == "update_reference":
        return f"修改参考作品 #{a.get('reference_id')}"
    if name == "delete_reference":
        return f"删除参考作品 #{a.get('reference_id')}"
    if name == "init_reference":
        return f"AI 评审参考作品 #{a.get('reference_id')}"
    return f"调用工具 {name}"


# 会话内存态（重启后从数据库恢复对话文本）
_sessions: dict[str, dict] = {}


def _sess(session_id: str, model: str, reasoning: str) -> dict:
    s = _sessions.get(session_id)
    if s is None:
        scope = parse_scope(session_id)
        s = {
            "session_id": session_id,
            "scope": scope,
            "messages": [{"role": "system", "content": build_system_prompt(scope)}],
            "current": None,
        }
        db = SessionLocal()
        try:
            rows = (
                db.query(models.Message)
                .filter(models.Message.session_id == session_id, models.Message.mode == "agent")
                .order_by(models.Message.id.asc())
                .all()
            )
            for m in rows[-50:]:
                s["messages"].append({"role": m.role, "content": m.content})
        finally:
            db.close()
        _sessions[session_id] = s
    s["model"] = model
    s["reasoning"] = reasoning
    return s


async def _next(s: dict, model: str, reasoning: str):
    """跑一轮 LLM，返回 {"type":"text"|"step", ...}。"""
    scope = s["scope"]
    allowed = SCOPE_TOOLS.get(scope["kind"], SCOPE_TOOLS["general"])
    tools = [t for t in TOOLS if t["function"]["name"] in allowed]
    resp = await chat_complete(s["messages"], model=model, reasoning=reasoning, tools=tools)
    msg = resp["choices"][0]["message"]
    calls = msg.get("tool_calls")
    if calls:
        s["messages"].append(msg)
        call = calls[0]
        name = call["function"]["name"]
        try:
            args = json.loads(call["function"]["arguments"] or "{}")
        except json.JSONDecodeError:
            args = {}
        escalate, reason = check_tool_scope(scope, name, args)
        step = {
            "id": str(uuid.uuid4()),
            "tool": name,
            "args": args,
            "preview": _preview(name, args),
            "escalation": escalate,
            "scope_reason": reason,
        }
        s["current"] = {**call, "step": step}
        return {"type": "step", "step": step}
    content = msg.get("content") or ""
    s["messages"].append({"role": "assistant", "content": content})
    if content:
        _save_message(s["session_id"], "assistant", content)
    return {"type": "text", "content": content}


class AgentMessageRequest(BaseModel):
    message: str
    session_id: str = "general"
    model: str = "flash"
    reasoning: str = "high"


class StepRequest(BaseModel):
    action: str = "confirm"  # confirm | skip | abort


@router.post("/message")
async def agent_message(req: AgentMessageRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=400, detail="未配置 DeepSeek API key")
    model = MODELS.get(req.model, MODELS["flash"])
    try:
        s = _sess(req.session_id, model, req.reasoning)
        s["messages"].append({"role": "user", "content": req.message})
        _save_message(req.session_id, "user", req.message)
        return await _next(s, model, req.reasoning)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"AI 调用失败：{exc}")


@router.post("/step")
async def agent_step(req: StepRequest, session_id: str = "general"):
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
        try:
            result = await _execute_tool(call["function"]["name"], args, model, reasoning)
        except Exception as exc:  # noqa: BLE001
            result = f"执行失败：{exc}"
    else:  # skip
        result = "用户跳过了这一步（未执行）。"

    s["messages"].append(
        {"role": "tool", "tool_call_id": call.get("id"), "content": result}
    )
    try:
        return await _next(s, model, reasoning)
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"AI 调用失败：{exc}")


@router.get("/history")
def agent_history(session_id: str = "general", db: Session = Depends(get_db)):
    rows = (
        db.query(models.Message)
        .filter(models.Message.session_id == session_id, models.Message.mode == "agent")
        .order_by(models.Message.id.asc())
        .all()
    )
    return [
        {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at}
        for m in rows
    ]
