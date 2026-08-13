from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db

router = APIRouter()


@router.get("", response_model=list[schemas.TemplateOut])
def list_templates(
    kind: str | None = None,
    q: str | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(models.Template)
    if kind in ("ci", "shi"):
        query = query.filter(models.Template.kind == kind)
    if q:
        query = query.filter(models.Template.name.ilike(f"%{q}%"))
    return query.order_by(models.Template.kind, models.Template.id).all()


@router.post("", response_model=schemas.TemplateOut, status_code=201)
def create_template(payload: schemas.TemplateCreate, db: Session = Depends(get_db)):
    data = payload.model_dump()
    data["line_count"] = len(data["pattern"])
    tpl = models.Template(**data)
    db.add(tpl)
    db.commit()
    db.refresh(tpl)
    return tpl


@router.get("/{tpl_id}", response_model=schemas.TemplateOut)
def get_template(tpl_id: int, db: Session = Depends(get_db)):
    tpl = db.get(models.Template, tpl_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    return tpl


@router.put("/{tpl_id}", response_model=schemas.TemplateOut)
def update_template(
    tpl_id: int, payload: schemas.TemplateUpdate, db: Session = Depends(get_db)
):
    tpl = db.get(models.Template, tpl_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(tpl, key, value)
    tpl.line_count = len(tpl.pattern or [])
    db.commit()
    db.refresh(tpl)
    return tpl


@router.delete("/{tpl_id}", status_code=204)
def delete_template(tpl_id: int, db: Session = Depends(get_db)):
    tpl = db.get(models.Template, tpl_id)
    if tpl is None:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tpl)
    db.commit()
