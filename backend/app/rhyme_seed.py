"""韵书 + 词谱 seed：从 scripts/*.json 幂等入库（每次启动执行，天然幂等）。"""

import json
from pathlib import Path

from sqlalchemy.orm import Session

from . import models
from .seed_data import PRESET_TEMPLATES

SCRIPTS_DIR = Path(__file__).resolve().parent.parent / "scripts"

# 预置词牌（ci）：首次入库时按搜韵正格更新；用户改过则跳过
_PRESET_CI = {t["name"]: t for t in PRESET_TEMPLATES if t["kind"] == "ci"}


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
    """搜韵完整词谱灌入 templates 表。

    - 新词牌：插入；
    - 预置的 15 个词牌：若其 pattern 仍是预置原版（未被用户改过），按搜韵正格更新；
      已更新过或用户改过的保持不动（幂等）。
    - 诗体（五绝/七律等）不在搜韵数据内，保持预置不变。
    """
    path = SCRIPTS_DIR / "tunes_seed.json"
    if not path.exists():
        return 0
    existing = {t.name for t in db.query(models.Template).all()}
    data = json.loads(path.read_text(encoding="utf-8"))
    added = 0
    updated = 0
    for e in data:
        name = (e.get("name") or "").strip()
        if not name:
            continue
        if name in existing:
            preset = _PRESET_CI.get(name)
            if preset is None:
                continue
            row = db.query(models.Template).filter(models.Template.name == name).first()
            if row is None or row.pattern != preset["pattern"]:
                continue  # 已更新过或用户改过：不动
            pattern = e.get("pattern") or []
            row.pattern = pattern
            row.total_chars = sum(len(s) for s in pattern)
            row.line_count = len(pattern)
            row.rhyme = e.get("rhyme") or row.rhyme
            aliases = list(row.aliases or [])
            for a in e.get("aliases") or []:
                if a not in aliases:
                    aliases.append(a)
            row.aliases = aliases
            updated += 1
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
    return added + updated


def store_famous_tunes(db: Session) -> int:
    """20 个知名词牌：正格 + 两个变格（含韵脚标记与匹配例词）入库/同步。

    - 正格存为词牌名本身，变格存为「词牌名·又一体1/2」；
    - 同步保护：只有当行未被动过时才更新——判定为 editable=False（系统行）、
      或 pattern 仍与 819 词谱库原版一致（store_tunes 插入的原始行）、
      或预置词牌例词仍是预置原版；
    - 用户手动改过的行（pattern 已变）不动。
    """
    path = SCRIPTS_DIR / "famous_tunes_seed.json"
    if not path.exists():
        return 0
    # 819 词谱库原版 pattern（用于识别"未动过的库行"）
    lib_patterns = {}
    lib_path = SCRIPTS_DIR / "tunes_seed.json"
    if lib_path.exists():
        for e in json.loads(lib_path.read_text(encoding="utf-8")):
            lib_patterns[(e.get("name") or "").strip()] = e.get("pattern") or []

    data = json.loads(path.read_text(encoding="utf-8"))
    touched = 0
    for tune in data.get("tunes", []):
        name = tune.get("name") or ""
        preset = _PRESET_CI.get(name)
        for e in tune.get("entries", []):
            label = e.get("label") or ""
            tpl_name = name if label == "正格" else f"{name}·{label.replace('①', '1').replace('②', '2')}"
            pattern = e.get("pattern") or []
            row = db.query(models.Template).filter(models.Template.name == tpl_name).first()
            if row is not None:
                is_preset_untouched = bool(preset and row.example == preset.get("example"))
                is_lib_untouched = bool(
                    label == "正格" and row.pattern == lib_patterns.get(name)
                )
                if row.editable and not is_preset_untouched and not is_lib_untouched:
                    continue  # 用户改过：不动
            else:
                row = models.Template(name=tpl_name, kind="ci")
                db.add(row)
            row.kind = "ci"
            row.pattern = pattern
            row.rhyme_flags = list(e.get("rhyme_flags") or [])
            row.total_chars = sum(len(s) for s in pattern)
            row.line_count = len(pattern)
            row.rhyme = e.get("format_desc") or ""
            row.example = e.get("example") or ""
            row.editable = False
            touched += 1
    db.commit()
    return touched
