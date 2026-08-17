"""韵书 + 词谱 seed：从 scripts/*.json 幂等入库（首次启动时执行）。"""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from . import models

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"


def store_rhyme_dict(db: Session) -> int:
    """韵书字表入库（rhyme_seed.json，幂等：已有数据则跳过）。"""
    path = SCRIPTS_DIR / "rhyme_seed.json"
    if not path.exists():
        return 0
    if db.query(models.RhymeDict).count() > 0:
        return 0
    data = json.loads(path.read_text(encoding="utf-8"))
    for e in data:
        db.add(
            models.RhymeDict(
                book=e.get("book", ""),
                tone=e.get("tone", ""),
                rhyme_name=e.get("rhyme_name", ""),
                chars=e.get("chars", ""),
            )
        )
    db.commit()
    return len(data)


def store_tunes(db: Session) -> int:
    """搜韵完整词谱灌入 templates 表（幂等：按词牌名去重）。"""
    path = SCRIPTS_DIR / "tunes_seed.json"
    if not path.exists():
        return 0
    existing = {t.name for t in db.query(models.Template).all()}
    data = json.loads(path.read_text(encoding="utf-8"))
    added = 0
    for e in data:
        name = (e.get("name") or "").strip()
        if not name or name in existing:
            continue
        pattern = e.get("pattern") or []
        db.add(
            models.Template(
                name=name,
                kind="ci",
                aliases=e.get("aliases") or [],
                total_chars=sum(len(s) for s in pattern),
                line_count=len(pattern),
                pattern=pattern,
                rhyme=e.get("rhyme") or "",
                example="",
                editable=True,
            )
        )
        existing.add(name)
        added += 1
    db.commit()
    return added
