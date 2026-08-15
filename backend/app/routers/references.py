"""参考基准（参考文章）管理。"""

import asyncio

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import MODELS
from ..database import SessionLocal, get_db
from ..reference_seed import seed_reference_articles

router = APIRouter()

_seed_status: dict = {"status": "none"}  # none | running | done | error


class SeedRequest(BaseModel):
    model: str = "pro"
    reasoning: str = "high"


class ReferenceUpdate(BaseModel):
    title: str | None = None
    author: str | None = None
    kind: str | None = None
    content: str | None = None


async def _run_seed(model_name: str, reasoning: str) -> None:
    try:
        db = SessionLocal()
        try:
            added = await seed_reference_articles(db, model_name, reasoning)
        finally:
            db.close()
        _seed_status["status"] = "done"
        _seed_status["added"] = added
    except Exception:
        _seed_status["status"] = "error"


@router.get("", response_model=list[schemas.ReferenceOut])
def list_references(db: Session = Depends(get_db)):
    return db.query(models.ReferenceArticle).order_by(models.ReferenceArticle.id).all()


@router.post("/seed")
async def seed(req: SeedRequest):
    if _seed_status.get("status") == "running":
        return {"status": "running"}
    model_name = MODELS.get(req.model, MODELS["pro"])
    _seed_status["status"] = "running"
    asyncio.create_task(_run_seed(model_name, req.reasoning))
    return {"status": "running"}


@router.get("/seed/status")
def seed_status():
    return _seed_status


@router.post("/from-poem/{poem_id}", response_model=schemas.ReferenceOut)
def add_from_poem(poem_id: int, db: Session = Depends(get_db)):
    poem = db.get(models.Poem, poem_id)
    if poem is None:
        raise HTTPException(status_code=404, detail="Poem not found")
    if not poem.agent_report:
        raise HTTPException(status_code=400, detail="该诗还没有 agents 评分")
    tpl = (
        db.query(models.Template).filter(models.Template.name == poem.category).first()
    )
    kind = tpl.kind if tpl else "shi"
    spirit = "\n".join(
        f"{r['score']}分：{r['reason']}"
        for r in (poem.agent_scores or [])
        if r.get("dimension") == "神"
    )
    form = "\n".join(
        f"{r['score']}分：{r['reason']}"
        for r in (poem.agent_scores or [])
        if r.get("dimension") == "形"
    )
    ref = models.ReferenceArticle(
        title=poem.title or "（无题）",
        author="用户",
        kind=kind,
        content=poem.content,
        spirit_analysis=spirit,
        form_analysis=form,
        score=poem.agent_score or 5.0,
        article=poem.agent_report.get("article", ""),
    )
    db.add(ref)
    db.commit()
    db.refresh(ref)
    return ref


@router.put("/{ref_id}", response_model=schemas.ReferenceOut)
def update_reference(ref_id: int, payload: ReferenceUpdate, db: Session = Depends(get_db)):
    ref = db.get(models.ReferenceArticle, ref_id)
    if ref is None:
        raise HTTPException(status_code=404, detail="Reference not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(ref, key, value)
    db.commit()
    db.refresh(ref)
    return ref


@router.delete("/{ref_id}", status_code=204)
def delete_reference(ref_id: int, db: Session = Depends(get_db)):
    ref = db.get(models.ReferenceArticle, ref_id)
    if ref is None:
        raise HTTPException(status_code=404, detail="Reference not found")
    db.delete(ref)
    db.commit()
