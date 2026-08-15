import asyncio
import uuid
from datetime import date
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from pydantic import BaseModel
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import DEEPSEEK_API_KEY, MODELS, UPLOAD_DIR
from ..database import SessionLocal, get_db
from ..scoring import score_poem

router = APIRouter()

_SORTABLE = {
    "created_at",
    "updated_at",
    "created_date",
    "title",
    "user_score",
    "agent_score",
    "comprehensive_score",
}
_SCORE_FIELDS = {"user_score", "agent_score", "comprehensive_score"}


def recompute_comprehensive(poem: models.Poem) -> None:
    """综合评分 = user_score 与 agent_score 各占 50% 加权平均；一方缺失取另一方。"""
    u, a = poem.user_score, poem.agent_score
    if u is not None and a is not None:
        poem.comprehensive_score = round(0.5 * u + 0.5 * a)
    elif u is not None:
        poem.comprehensive_score = u
    elif a is not None:
        poem.comprehensive_score = a
    else:
        poem.comprehensive_score = None


@router.get("", response_model=list[schemas.PoemOut])
def list_poems(
    category: str | None = None,
    favorite: bool | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    q: str | None = None,
    sort_by: str = "created_at",
    sort_order: str = "desc",
    score_field: str | None = None,
    score_min: int | None = None,
    score_max: int | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Poem)

    if category:
        query = query.filter(models.Poem.category == category)
    if favorite is not None:
        query = query.filter(models.Poem.is_favorite == favorite)
    if date_from:
        query = query.filter(models.Poem.created_date >= date_from)
    if date_to:
        query = query.filter(models.Poem.created_date <= date_to)
    if q:
        like = f"%{q}%"
        query = query.filter(
            or_(models.Poem.title.ilike(like), models.Poem.content.ilike(like))
        )
    if score_field in _SCORE_FIELDS:
        col = getattr(models.Poem, score_field)
        if score_min is not None:
            query = query.filter(col >= score_min)
        if score_max is not None:
            query = query.filter(col <= score_max)

    sort_col = getattr(models.Poem, sort_by, None)
    if sort_col is None or sort_by not in _SORTABLE:
        sort_col = models.Poem.created_at
    if sort_order == "asc":
        query = query.order_by(sort_col.asc(), models.Poem.id.desc())
    else:
        query = query.order_by(sort_col.desc(), models.Poem.id.desc())

    return query.all()


@router.get("/categories", response_model=list[str])
def list_categories(db: Session = Depends(get_db)):
    rows = db.query(models.Poem.category).distinct().all()
    return sorted({r[0] for r in rows if r[0]})


@router.post("", response_model=schemas.PoemOut, status_code=201)
def create_poem(payload: schemas.PoemCreate, db: Session = Depends(get_db)):
    poem = models.Poem(**payload.model_dump())
    recompute_comprehensive(poem)
    db.add(poem)
    db.commit()
    db.refresh(poem)
    return poem


@router.get("/{poem_id}", response_model=schemas.PoemOut)
def get_poem(poem_id: int, db: Session = Depends(get_db)):
    poem = db.get(models.Poem, poem_id)
    if poem is None:
        raise HTTPException(status_code=404, detail="Poem not found")
    return poem


@router.put("/{poem_id}", response_model=schemas.PoemOut)
def update_poem(poem_id: int, payload: schemas.PoemUpdate, db: Session = Depends(get_db)):
    poem = db.get(models.Poem, poem_id)
    if poem is None:
        raise HTTPException(status_code=404, detail="Poem not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(poem, key, value)
    recompute_comprehensive(poem)
    db.commit()
    db.refresh(poem)
    return poem


@router.patch("/{poem_id}/favorite", response_model=schemas.PoemOut)
def toggle_favorite(
    poem_id: int, favorite: bool | None = None, db: Session = Depends(get_db)
):
    poem = db.get(models.Poem, poem_id)
    if poem is None:
        raise HTTPException(status_code=404, detail="Poem not found")
    poem.is_favorite = (not poem.is_favorite) if favorite is None else favorite
    db.commit()
    db.refresh(poem)
    return poem


@router.delete("/{poem_id}", status_code=204)
def delete_poem(poem_id: int, db: Session = Depends(get_db)):
    poem = db.get(models.Poem, poem_id)
    if poem is None:
        raise HTTPException(status_code=404, detail="Poem not found")
    db.delete(poem)
    db.commit()


@router.post("/{poem_id}/images", response_model=schemas.ImageOut, status_code=201)
async def upload_image(
    poem_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    poem = db.get(models.Poem, poem_id)
    if poem is None:
        raise HTTPException(status_code=404, detail="Poem not found")
    if not (file.content_type or "").startswith("image/"):
        raise HTTPException(status_code=400, detail="只支持图片文件")

    ext = Path(file.filename or "image").suffix.lower() or ".jpg"
    if ext not in {".jpg", ".jpeg", ".png", ".gif", ".webp"}:
        ext = ".jpg"
    name = f"{uuid.uuid4().hex}{ext}"
    rel_dir = f"poems/{poem_id}"
    abs_dir = UPLOAD_DIR / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)
    rel_path = f"{rel_dir}/{name}"
    abs_path = UPLOAD_DIR / rel_path

    size = 0
    with open(abs_path, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)
            size += len(chunk)

    max_order = (
        db.query(func.max(models.Image.sort_order))
        .filter(models.Image.poem_id == poem_id)
        .scalar()
        or 0
    )
    img = models.Image(
        poem_id=poem_id,
        filename=file.filename or name,
        stored_path=rel_path,
        mime=file.content_type or "image/*",
        size=size,
        sort_order=max_order + 1,
    )
    db.add(img)
    db.commit()
    db.refresh(img)
    return img


@router.delete("/images/{image_id}", status_code=204)
def delete_image(image_id: int, db: Session = Depends(get_db)):
    img = db.get(models.Image, image_id)
    if img is None:
        raise HTTPException(status_code=404, detail="Image not found")
    try:
        (UPLOAD_DIR / img.stored_path).unlink(missing_ok=True)
    except OSError:
        pass
    db.delete(img)
    db.commit()


class RateRequest(BaseModel):
    model: str = "pro"  # flash | pro
    reasoning: str = "high"  # none | low | high | max


# 评分状态：poem_id -> running | done | error（内存态，重启后重置）
_rating_status: dict[int, str] = {}


async def _run_scoring(poem_id: int, model_name: str, reasoning: str) -> None:
    """后台执行评分，结束后标记状态。"""
    db = SessionLocal()
    try:
        poem = db.get(models.Poem, poem_id)
        if poem is None:
            _rating_status[poem_id] = "error"
            return
        template = None
        if poem.category:
            template = (
                db.query(models.Template)
                .filter(models.Template.name == poem.category)
                .first()
            )
        results, report = await score_poem(
            poem, template=template, model=model_name, reasoning=reasoning
        )
        poem.agent_scores = results
        poem.agent_report = report
        poem.agent_score = int(report.get("total", 0))
        recompute_comprehensive(poem)
        db.commit()
        _rating_status[poem_id] = "done"
    except Exception:
        _rating_status[poem_id] = "error"
    finally:
        db.close()


@router.post("/{poem_id}/rate")
async def rate_poem(poem_id: int, req: RateRequest):
    if not DEEPSEEK_API_KEY:
        raise HTTPException(status_code=400, detail="未配置 DeepSeek API key")

    db = SessionLocal()
    try:
        if db.get(models.Poem, poem_id) is None:
            raise HTTPException(status_code=404, detail="Poem not found")
    finally:
        db.close()

    if _rating_status.get(poem_id) == "running":
        return {"status": "running"}

    model_name = MODELS.get(req.model, MODELS["pro"])
    _rating_status[poem_id] = "running"
    asyncio.create_task(_run_scoring(poem_id, model_name, req.reasoning))
    return {"status": "running"}


@router.get("/{poem_id}/rate/status")
def rate_status(poem_id: int):
    return {"status": _rating_status.get(poem_id, "none")}
