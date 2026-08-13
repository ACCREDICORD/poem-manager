"""导入：粘贴/上传文本 → agent 识别哪些是诗词 → 确认后归档。"""

import json
import re
from datetime import date

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..config import DEEPSEEK_API_KEY, MODELS
from ..database import get_db
from ..deepseek import chat_complete

router = APIRouter()


def split_blocks(text: str) -> list[str]:
    """按空行切成候选块。"""
    return [b.strip() for b in re.split(r"\n\s*\n", text.strip()) if b.strip()]


def extract_json_array(text: str) -> list:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```[a-zA-Z]*\s*", "", text)
        text = re.sub(r"\s*```$", "", text).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("["), text.rfind("]")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
        raise


def _parse_date(s: str) -> date | None:
    if not s:
        return None
    try:
        return date.fromisoformat(s)
    except ValueError:
        return None


class AnalyzeRequest(BaseModel):
    text: str
    model: str = "pro"
    reasoning: str = "high"


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=400, detail="未配置 DeepSeek API key")
    blocks = split_blocks(req.text)
    if not blocks:
        return {"candidates": []}

    numbered = "\n\n".join(f"【{i}】\n{b}" for i, b in enumerate(blocks))
    prompt = (
        "下面有若干段文字，请逐段判断是否为诗词（词牌名/标题/正文）。"
        "对每一段输出：是否诗词、标题猜测、类型（词牌名如临江仙，或诗体如七律/七绝/五律/五绝/排律/古体/杂言等）。"
        "若某段不是诗词，is_poem=false。\n\n"
        f"{numbered}\n\n"
        '请只输出 JSON 数组，每个元素：{"index": <序号>, "is_poem": <true/false>, "title": "<标题>", "category": "<类型>"}'
    )
    model = MODELS.get(req.model, MODELS["pro"])
    resp = await chat_complete([{"role": "user", "content": prompt}], model=model, reasoning=req.reasoning)
    content = resp["choices"][0]["message"]["content"]
    result = extract_json_array(content)

    candidates = []
    for item in result:
        idx = item.get("index")
        if idx is None or idx >= len(blocks):
            continue
        candidates.append(
            {
                "index": idx,
                "content": blocks[idx],
                "is_poem": bool(item.get("is_poem", False)),
                "title": item.get("title") or "",
                "category": item.get("category") or "",
            }
        )
    return {"candidates": candidates}


class ImportItem(BaseModel):
    title: str = ""
    content: str = ""
    category: str = ""
    created_date: str | None = None


class SaveRequest(BaseModel):
    items: list[ImportItem]


@router.post("/save")
def save(req: SaveRequest, db: Session = Depends(get_db)):
    saved = 0
    for it in req.items:
        if not it.content.strip():
            continue
        db.add(
            models.Poem(
                title=it.title.strip(),
                content=it.content,
                category=it.category.strip(),
                created_date=_parse_date(it.created_date),
                source="import",
            )
        )
        saved += 1
    db.commit()
    return {"saved": saved}
