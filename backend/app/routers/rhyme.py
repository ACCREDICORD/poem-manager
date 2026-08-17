"""格律校验接口：查字 + 整首校验。"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models
from ..database import get_db
from ..rhyme import (
    _split_clauses,
    available_books,
    char_entries,
    char_pingze,
    check_poem_pingze,
    check_rhyme,
    format_report_text,
)

router = APIRouter()


class CheckRequest(BaseModel):
    content: str
    category: str = ""  # 按分类名匹配词谱（诗词的 category 与词牌同名）
    template_id: int | None = None
    book: str = "平水韵"  # 平仄校验用韵书


@router.get("/books")
def list_books():
    return {"books": available_books()}


@router.get("/lookup")
def lookup(char: str, book: str = "平水韵"):
    ch = char[:1]
    entries = char_entries(ch, book)
    return {
        "char": ch,
        "book": book,
        "pingze": char_pingze(ch, book),
        "entries": [{"tone": t, "rhyme_name": r} for t, r in entries],
    }


@router.post("/check")
def check(req: CheckRequest, db: Session = Depends(get_db)):
    tpl = None
    if req.template_id:
        tpl = db.get(models.Template, req.template_id)
    elif req.category:
        tpl = (
            db.query(models.Template)
            .filter(models.Template.name == req.category)
            .first()
        )
    if tpl is None:
        raise HTTPException(
            status_code=404,
            detail=f"未找到格律模板「{req.category or req.template_id}」。请确认诗词分类与词谱名一致（诗词/格律页面可查）。",
        )

    report = check_poem_pingze(req.content, tpl, req.book)

    # 韵脚同部检查（词林正韵）：取每个小句末字（与校验的分句口径一致）
    clauses = _split_clauses(req.content)
    last_chars = [c[-1] for c in clauses if c]
    groups = check_rhyme(last_chars, "词林正韵")
    report["rhyme_check"] = [
        {"group": g, "chars": chars} for g, chars in groups.items()
    ]
    report["same_rhyme"] = len(groups) <= 1
    report["report_text"] = format_report_text(report)
    return report
