import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..config import DEEPSEEK_API_KEY, MODELS
from ..database import SessionLocal, get_db
from ..deepseek import stream_chat

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    poem_id: int | None = None
    template_id: int | None = None
    session_id: str = "general"
    model: str = "flash"  # flash | pro（两者上下文均为 1M tokens）
    reasoning: str = "high"  # none | low | high | max（推理强度）


def build_system_prompt(db: Session, poem_id: int | None, template_id: int | None) -> str:
    parts = [
        "你是一位精通中国古典诗词创作的助手，擅长修改字句、校对平仄格律、押韵、点评与赏析。"
        "请用中文回答，简洁准确，直接给出修改建议或诗词内容。"
        "判断平仄、押韵时请遵循《平水韵》《词林正韵》等韵书规范（系统内置韵书数据库可精确校验），不要凭记忆猜测。"
    ]
    poem = None
    if poem_id:
        poem = db.get(models.Poem, poem_id)
    if poem:
        ctx = [f"【当前诗词】标题：{poem.title or '（无题）'}；类型：{poem.category or '（未分类）'}"]
        if poem.content:
            ctx.append(f"正文：\n{poem.content}")
        parts.append("\n".join(ctx))
        # 若类型与某词牌/诗体同名，自动带入其格律
        if not template_id and poem.category:
            tpl = db.query(models.Template).filter(models.Template.name == poem.category).first()
            if tpl:
                template_id = tpl.id
    if template_id:
        tpl = db.get(models.Template, template_id)
        if tpl:
            lines = [f"【格律模板】《{tpl.name}》（{tpl.total_chars}字，{tpl.line_count}句）"]
            if tpl.pattern:
                lines.append("平仄：" + "、".join(tpl.pattern))
            if tpl.rhyme:
                lines.append("押韵：" + tpl.rhyme)
            parts.append("\n".join(lines))
    return "\n\n".join(parts)


@router.post("")
async def chat(req: ChatRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=400, detail="未配置 DeepSeek API key")

    db = SessionLocal()
    try:
        system_content = build_system_prompt(db, req.poem_id, req.template_id)
        history = (
            db.query(models.Message)
            .filter(models.Message.session_id == req.session_id)
            .order_by(models.Message.id.asc())
            .all()
        )
        messages = [{"role": "system", "content": system_content}]
        # 1M 上下文，历史最多带最近 50 条（可再放宽）
        for m in history[-50:]:
            messages.append({"role": m.role, "content": m.content})
        messages.append({"role": "user", "content": req.message})

        db.add(
            models.Message(
                session_id=req.session_id, role="user", content=req.message, mode="chat"
            )
        )
        db.commit()
    finally:
        db.close()

    model_name = MODELS.get(req.model, MODELS["flash"])

    async def gen():
        buffer: list[str] = []
        try:
            async for kind, text in stream_chat(messages, model=model_name, reasoning=req.reasoning):
                if kind == "reasoning":
                    # 思考过程：实时透传，但不写入历史
                    yield f"data: {json.dumps({'reasoning_delta': text}, ensure_ascii=False)}\n\n"
                else:
                    buffer.append(text)
                    yield f"data: {json.dumps({'delta': text}, ensure_ascii=False)}\n\n"
        except Exception as exc:  # noqa: BLE001
            yield f"data: {json.dumps({'error': str(exc)}, ensure_ascii=False)}\n\n"
        finally:
            full = "".join(buffer)
            if full:
                db2 = SessionLocal()
                try:
                    db2.add(
                        models.Message(
                            session_id=req.session_id,
                            role="assistant",
                            content=full,
                            mode="chat",
                        )
                    )
                    db2.commit()
                finally:
                    db2.close()
        yield "data: [DONE]\n\n"

    return StreamingResponse(gen(), media_type="text/event-stream")


@router.get("/history")
def history(session_id: str = "general", db: Session = Depends(get_db)):
    rows = (
        db.query(models.Message)
        .filter(models.Message.session_id == session_id, models.Message.mode == "chat")
        .order_by(models.Message.id.asc())
        .all()
    )
    return [
        {"id": m.id, "role": m.role, "content": m.content, "created_at": m.created_at}
        for m in rows
    ]
