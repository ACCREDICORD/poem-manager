"""格律校验接口：查字 + 整首校验（自动比对正格与全部变格，可手动指定某格）。"""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import or_
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
    template_id: int | None = None  # 指定某一格（正格或变格）
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


def _finish_report(content: str, tpl: models.Template, book: str) -> dict:
    report = check_poem_pingze(content, tpl, book)
    clauses = _split_clauses(content)
    last_chars = [c[-1] for c in clauses if c]
    groups = check_rhyme(last_chars, "词林正韵")
    report["rhyme_check"] = [{"group": g, "chars": chars} for g, chars in groups.items()]
    report["same_rhyme"] = len(groups) <= 1
    report["report_text"] = format_report_text(report)
    report["template_id"] = tpl.id
    # 贴合度惩罚分：不合字数 + 超出句数（小者更贴合）
    report["penalty"] = report["total_violations"] + max(
        0, report["actual_lines"] - report["expected_lines"]
    ) * 3
    return report


def _label(name: str, category: str) -> str:
    if name == category:
        return "正格"
    suffix = name[len(category):]
    if suffix.startswith("·"):
        suffix = suffix[1:]
    return suffix or "变格"


@router.post("/check")
def check(req: CheckRequest, db: Session = Depends(get_db)):
    tpls: list[models.Template] = []
    if req.template_id:
        t = db.get(models.Template, req.template_id)
        if t is not None:
            tpls = [t]
    elif req.category:
        tpls = (
            db.query(models.Template)
            .filter(
                or_(
                    models.Template.name == req.category,
                    models.Template.name.like(req.category + "·%"),
                )
            )
            .order_by(models.Template.id)
            .all()
        )
    if not tpls:
        raise HTTPException(
            status_code=404,
            detail=f"未找到格律模板「{req.category or req.template_id}」。请确认诗词分类与词谱名一致（诗词/格律页面可查）。",
        )

    # 逐格校验，自动选最贴合的一格
    summaries = []
    reports = {}
    best = None
    for t in tpls:
        rep = _finish_report(req.content, t, req.book)
        reports[t.id] = rep
        summaries.append(
            {
                "id": t.id,
                "name": t.name,
                "label": _label(t.name, req.category) if req.category else t.name,
                "violations": rep["total_violations"],
                "penalty": rep["penalty"],
            }
        )
        if best is None or rep["penalty"] < best["penalty"]:
            best = rep

    if req.template_id:
        # 指定某格：只返回该格报告
        return {"templates": summaries, "best_id": req.template_id, "report": best}

    return {"templates": summaries, "best_id": best["template_id"], "report": best}
