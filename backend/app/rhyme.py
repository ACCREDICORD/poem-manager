"""确定性格律校验（补 LLM 平仄/押韵短板）。

数据来源：rhyme_dict 表（搜韵四部韵书），内存索引按 book → char → [(tone, rhyme_name)]。
- char_pingze：查字平仄（多音/未收录返回 None）
- check_poem_pingze：逐句对比实际平仄 vs 词谱模板
- check_rhyme：韵脚字是否同韵部
"""

import re

from . import models
from .database import SessionLocal

_index: dict[str, dict[str, list[tuple[str, str]]]] = {}


def ensure_index() -> None:
    if _index:
        return
    db = SessionLocal()
    try:
        rows = db.query(models.RhymeDict).all()
        for r in rows:
            book_map = _index.setdefault(r.book, {})
            for ch in r.chars:
                book_map.setdefault(ch, []).append((r.tone, r.rhyme_name))
    finally:
        db.close()


def reload_index() -> None:
    _index.clear()
    ensure_index()


def available_books() -> list[str]:
    ensure_index()
    return sorted(_index.keys())


def char_entries(char: str, book: str = "平水韵") -> list[tuple[str, str]]:
    ensure_index()
    return _index.get(book, {}).get(char, [])


def char_pingze(char: str, book: str = "平水韵") -> str | None:
    """返回 '平' / '仄'；多音字（平仄两读）或未收录返回 None。"""
    entries = char_entries(char, book)
    tones = {t for t, _ in entries}
    if not tones:
        return None
    ping_tones = {"平", "平阴", "平阳"}
    if tones <= ping_tones:
        return "平"
    if tones & ping_tones:
        return None  # 平仄两读
    return "仄"


def rhyme_group_key(rhyme_name: str, book: str) -> str:
    if book == "平水韵":
        return rhyme_name
    if book == "词林正韵":
        return rhyme_name.split("·")[0]
    return rhyme_name


def check_rhyme(chars: list[str], book: str = "词林正韵") -> dict[str, list[str]]:
    """韵脚字分组：{韵部: [字...]}。全部落在同一组 = 同韵。"""
    groups: dict[str, list[str]] = {}
    for ch in chars:
        for tone, rname in char_entries(ch, book):
            key = rhyme_group_key(rname, book)
            if ch not in groups.setdefault(key, []):
                groups[key].append(ch)
    return groups


def _cjk_only(line: str) -> str:
    return "".join(ch for ch in line if "\u4e00" <= ch <= "\u9fff")


_PUNCT = "，。、！？；：,;"

# 近体诗句式（A 平起仄收 / B 平起平收 / C 仄起仄收 / D 仄起平收）
_SHI7 = {"A": "平平仄仄平平仄", "B": "平平仄仄仄平平", "C": "仄仄平平平仄仄", "D": "仄仄平平仄仄平"}
_SHI5 = {"A": "平平平仄仄", "B": "仄仄仄平平", "C": "仄仄平平仄", "D": "平平仄仄平"}

# 按黏对规则推导的律诗句序（字母序）
_SHI_SEQ = {
    ("平", "平"): ["B", "D", "C", "B", "A", "D", "C", "B"],
    ("平", "仄"): ["A", "D", "C", "B", "A", "D", "C", "B"],
    ("仄", "平"): ["D", "B", "A", "D", "C", "B", "A", "D"],
    ("仄", "仄"): ["C", "B", "A", "D", "C", "B", "A", "D"],
}


def _derive_shi_pattern(lines: list[str]) -> list[str]:
    """按首句第2字（起）与末字（收）推导全诗平仄句式。"""
    if not lines:
        return []
    first = lines[0]
    if len(first) < 2:
        return []
    qi = char_pingze(first[1], "平水韵")
    shou = char_pingze(first[-1], "平水韵")
    if qi is None or shou is None:
        qi = "平" if qi is None else qi
        shou = "平" if shou is None else shou
    base = _SHI7 if len(first) == 7 else _SHI5
    seq = _SHI_SEQ.get((qi, shou), _SHI_SEQ[("平", "平")])
    return [base[k] for k in seq[: len(lines)]]


def _split_clauses(text: str) -> list[str]:
    """按中文标点切成短句（词的正文明按逗号分句，对齐词谱句式）。"""
    out = []
    for raw_line in text.split("\n"):
        line = raw_line.strip()
        if not line:
            continue
        for clause in re.split(f"[{re.escape(_PUNCT)}]+", line):
            c = _cjk_only(clause)
            if c:
                out.append(c)
    return out


def check_poem_pingze(content: str, template, book: str = "平水韵") -> dict:
    """逐句对比实际平仄与词谱/诗律。返回报告（issues 含位置/字/实平仄/应平仄）。"""
    ensure_index()
    kind = getattr(template, "kind", "ci")

    raw_lines = [l.strip() for l in content.split("\n") if l.strip()]
    # 跳过标题行（如「念奴娇.川西线」）
    start = 0
    if raw_lines and (
        "." in raw_lines[0]
        or "·" in raw_lines[0]
        or raw_lines[0].startswith("《")
        or "—" in raw_lines[0]
    ):
        start = 1

    if kind == "shi":
        # 近体诗：按标点分句（一句=一联内的小句），按黏对规则推导起收式
        lines = _split_clauses("\n".join(raw_lines[start:]))
        pattern = _derive_shi_pattern(lines)
    else:
        # 词：按逗号分句，对齐词谱
        lines = _split_clauses("\n".join(raw_lines[start:]))
        pattern = list(template.pattern or [])

    issues = []
    for i, chars in enumerate(lines):
        if i >= len(pattern):
            issues.append({"line": i + 1, "text": chars, "problem": "词谱无此句（句子数超出）"})
            continue
        expected = pattern[i]
        detail = []
        for j, ch in enumerate(chars):
            if j >= len(expected):
                detail.append(
                    {"pos": j + 1, "char": ch, "actual": None, "expected": None, "problem": "超出词谱字数"}
                )
                continue
            exp = expected[j]
            if exp == "中":
                continue
            # 近体诗「一三五不论」：只严查二四六
            if kind == "shi":
                pos = j + 1
                if len(expected) == 7 and pos in (1, 3, 5):
                    continue
                if len(expected) == 5 and pos in (1, 3):
                    continue
            actual = char_pingze(ch, book)
            if actual is None:
                detail.append(
                    {"pos": j + 1, "char": ch, "actual": None, "expected": exp,
                     "problem": "多音字或未收录，需人工判断"}
                )
            elif actual != exp:
                detail.append(
                    {"pos": j + 1, "char": ch, "actual": actual, "expected": exp, "problem": "平仄不合"}
                )
        if len(chars) != len(expected):
            issues.append(
                {
                    "line": i + 1,
                    "text": chars,
                    "problem": f"字数不符（词谱 {len(expected)} 字 / 实际 {len(chars)} 字）",
                    "detail": detail,
                }
            )
        elif detail:
            issues.append({"line": i + 1, "text": chars, "problem": "平仄不合", "detail": detail})

    return {
        "template": getattr(template, "name", ""),
        "kind": kind,
        "book": book,
        "expected_lines": len(pattern),
        "actual_lines": len(lines),
        "pattern": pattern,
        "issues": issues,
        "total_violations": sum(len(i.get("detail", [])) for i in issues),
    }


def format_report_text(report: dict) -> str:
    """把校验报告压成紧凑文本，供提示词注入。"""
    if not report.get("issues"):
        return "全部句子字数、平仄与词谱一致，无不合律处。"
    lines = []
    for it in report["issues"]:
        line = f"第{it['line']}句（{it['text'][:16]}）：{it['problem']}"
        for d in it.get("detail", [])[:8]:
            if d["problem"] == "平仄不合":
                line += f" 第{d['pos']}字「{d['char']}」实为{d['actual']}、应{d['expected']}"
            elif d["problem"] == "超出词谱字数":
                line += f" 第{d['pos']}字「{d['char']}」超出词谱"
            else:
                line += f" 第{d['pos']}字「{d['char']}」{d['problem']}"
        lines.append(line)
    return "\n".join(lines)
