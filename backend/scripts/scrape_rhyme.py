"""搜韵数据抓取：四部韵书 + 词谱 → JSON seed 文件。

用法：
    cd backend
    python scripts/scrape_rhyme.py            # 全部（约 10-20 分钟，礼貌限速）
    python scripts/scrape_rhyme.py --rhyme-only
    python scripts/scrape_rhyme.py --tunes-only

产出：
    scripts/rhyme_seed.json   韵书（book/tone/rhyme_name/chars）
    scripts/tunes_seed.json   词谱（name/kind/pattern/rhyme/aliases）

注意：只抓取公有领域的事实数据（韵部字表、词牌格律），不抓站点编辑署名内容。
"""

import argparse
import html as html_lib
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import httpx

BASE = "https://sou-yun.cn"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
DELAY = 0.5

OUT_DIR = Path(__file__).resolve().parent
RHYME_OUT = OUT_DIR / "rhyme_seed.json"
TUNES_OUT = OUT_DIR / "tunes_seed.json"

CJK_RE = re.compile(r"^[\u4e00-\u9fff]{1}$")


def get(client: httpx.Client, url: str, retries: int = 3) -> str:
    for attempt in range(retries):
        try:
            resp = client.get(url, headers={"User-Agent": UA, "Referer": BASE + "/"})
            resp.raise_for_status()
            time.sleep(DELAY)
            return resp.text
        except Exception as exc:  # noqa: BLE001
            if attempt == retries - 1:
                raise
            print(f"  retry {url} ({exc})")
            time.sleep(2 + attempt * 2)
    return ""


def parse_char_blocks(html_text: str) -> list[dict]:
    """解析 <div class="char"> 韵部块：韵目、声调、字表。"""
    out = []
    for m in re.finditer(r'<div class="char">(.*?)</div>', html_text, re.S):
        block = m.group(1)
        name_m = re.search(r'<span class="rhymeName">([^<]+)</span>', block)
        comment_m = re.search(r'<span class="comment">([^<]+)</span>', block)
        if not name_m:
            continue
        chars = "".join(
            t.strip()
            for t in re.findall(r"<a [^>]*>([^<]+)</a>", block)
            if CJK_RE.match(t.strip())
        )
        if not chars:
            continue
        out.append(
            {
                "rhyme_name": html_lib.unescape(name_m.group(1)).strip(),
                "comment": html_lib.unescape(comment_m.group(1)).strip() if comment_m else "",
                "chars": unicodedata.normalize("NFC", chars),
            }
        )
    return out


def parse_tabpage_blocks(html_text: str) -> list[dict]:
    """解析 <div class="tab-page"> 块（词林正韵/中原音韵）：tab 标题 + 字表。"""
    out = []
    for m in re.finditer(r"""<div class=['"]tab-page['"]>(.*?)</div>""", html_text, re.S):
        block = m.group(1)
        tab_m = re.search(r"""<span class=['"]tab['"]>(.*?)</span>""", block, re.S)
        tab_text = ""
        if tab_m:
            tab_text = re.sub(r"<[^>]+>", "", tab_m.group(1))
            tab_text = html_lib.unescape(tab_text).strip()
        chars = "".join(
            t.strip()
            for t in re.findall(r"<a [^>]*>([^<]+)</a>", block)
            if CJK_RE.match(t.strip())
        )
        if not chars:
            continue
        labels = [
            html_lib.unescape(x).strip()
            for x in re.findall(r"""<span class=['"]label['"]>([^<]+)</span>""", block)
        ]
        out.append(
            {
                "tab": tab_text,
                "labels": labels,
                "chars": unicodedata.normalize("NFC", chars),
                "raw": block,
            }
        )
    return out


def normalize_tone(comment: str) -> str:
    c = comment.replace(" ", "")
    if "入" in c:
        return "入"
    if "上" in c:
        return "上"
    if "去" in c:
        return "去"
    if "阴" in c or "陽" in c:
        return "平阴"
    if "阳" in c or "陽" in c:
        return "平阳"
    if "平" in c:
        return "平"
    return c or "平"


def scrape_pingshui(client: httpx.Client) -> list[dict]:
    print("== 平水韵 ==")
    entries = []
    for tone in (1, 2, 3, 4):
        html_text = get(client, f"{BASE}/QR.aspx?tone={tone}")
        blocks = parse_char_blocks(html_text)
        for b in blocks:
            entries.append(
                {
                    "book": "平水韵",
                    "tone": normalize_tone(b["comment"]),
                    "rhyme_name": b["rhyme_name"],
                    "chars": b["chars"],
                }
            )
        print(f"  tone={tone}: {len(blocks)} 韵部")
    return entries


def scrape_cilin(client: httpx.Client) -> list[dict]:
    print("== 词林正韵 ==")
    entries = []
    # 站点布局：ci=0..27 为平/上去页（第1~14部，每部2页）；ci=28..32 为入声页（第15~19部）
    for ci in range(33):
        html_text = get(client, f"{BASE}/QR.aspx?ci={ci}&qtype=Category")
        blocks = parse_tabpage_blocks(html_text)
        if not blocks:
            print(f"  ci={ci}: 无内容，跳过")
            continue
        if ci <= 27:
            bu = ci // 2 + 1
            tone = "平" if ci % 2 == 0 else "仄"
        else:
            bu = ci - 13  # 28→15 … 32→19
            tone = "入"
        for b in blocks:
            label = b["tab"] or f"第{bu}部"
            entries.append(
                {
                    "book": "词林正韵",
                    "tone": tone,
                    "rhyme_name": f"第{bu}部·{label}",
                    "chars": b["chars"],
                }
            )
        print(f"  ci={ci}: 第{bu}部 {tone} {len(blocks)} 块")
    return entries


def scrape_zhongyuan(client: httpx.Client) -> list[dict]:
    print("== 中原音韵 ==")
    html_text = get(client, f"{BASE}/zyqr.aspx")
    cats = re.findall(r"ZYQR\.aspx\?ct=([^'\"&]+)", html_text)
    cats = [c for c in dict.fromkeys(cats) if re.fullmatch(r"[\u4e00-\u9fff]{1,4}", c)]
    entries = []
    for cat in cats:
        page = get(client, f"{BASE}/ZYQR.aspx?ct={cat}")
        blocks = parse_tabpage_blocks(page)
        for b in blocks:
            if len(b["labels"]) >= 2:
                # 平声块：按 阴平/阳平 label 位置切分字表
                positions = []
                for lab in b["labels"]:
                    pos = b["raw"].find(f"class='label'>{lab}</span>")
                    if pos < 0:
                        pos = b["raw"].find(f'class="label">{lab}</span>')
                    positions.append(pos)
                seg_chars = []
                for i, pos in enumerate(positions):
                    seg = b["raw"][pos:]
                    if i + 1 < len(positions):
                        seg = b["raw"][pos : positions[i + 1]]
                    chars = "".join(
                        t.strip()
                        for t in re.findall(r"<a [^>]*>([^<]+)</a>", seg)
                        if CJK_RE.match(t.strip())
                    )
                    seg_chars.append(chars)
                for i, lab in enumerate(b["labels"]):
                    if seg_chars[i]:
                        entries.append(
                            {
                                "book": "中原音韵",
                                "tone": normalize_tone(lab),
                                "rhyme_name": f"{cat}·{lab}",
                                "chars": seg_chars[i],
                            }
                        )
            else:
                tone_src = b["tab"] or (b["labels"][0] if b["labels"] else "")
                tone = normalize_tone(tone_src)
                entries.append(
                    {
                        "book": "中原音韵",
                        "tone": tone,
                        "rhyme_name": f"{cat}·{(b['tab'] or '')}",
                        "chars": b["chars"],
                    }
                )
        print(f"  {cat}: {len(blocks)} 块")
    return entries


def scrape_tongyun(client: httpx.Client) -> list[dict]:
    print("== 中华通韵 ==")
    html_text = get(client, f"{BASE}/mqr.aspx")
    cats = re.findall(r"MQR\.aspx\?ct=([^'\"&]+)", html_text)
    cats = list(dict.fromkeys(cats))
    entries = []
    for cat in cats:
        page = get(client, f"{BASE}/MQR.aspx?ct={cat}")
        blocks = parse_char_blocks(page)
        for b in blocks:
            entries.append(
                {
                    "book": "中华通韵",
                    "tone": normalize_tone(b["comment"]),
                    "rhyme_name": b["rhyme_name"] or cat,
                    "chars": b["chars"],
                }
            )
        print(f"  ct={cat}: {len(blocks)} 块")
    return entries


def parse_tune_page(html_text: str, name: str) -> dict | None:
    # 一页可能含正格 + 若干变格（以 tuneFormatDesc 起始）；只取第一格（正格）
    fmt_positions = [m.start() for m in re.finditer(r"<span class='tuneFormatDesc'>", html_text)]
    if fmt_positions:
        section = (
            html_text[fmt_positions[0] : fmt_positions[1]]
            if len(fmt_positions) > 1
            else html_text[fmt_positions[0] :]
        )
    else:
        section = html_text

    fmt_m = re.search(r"<span class='tuneFormatDesc'>([^<]+)</span>", section)
    rhyme_desc = html_lib.unescape(fmt_m.group(1)).strip() if fmt_m else ""

    # 平仄句式：正格内累积全部句式块（长调上片/下片分段），韵/句标记分隔每句
    pattern = []
    for m in re.finditer(r"<span class='comment'>([^<]*(?:<span class='rhythm'>[^<]*</span>[^<]*)*)</span>", section):
        raw = m.group(1)
        if "平" not in raw and "仄" not in raw:
            continue
        # 噪声过滤：纯句式段的平仄中韵句字符占比应很高；说明文字会被跳过
        plain = re.sub(r"<[^>]+>", "", raw).replace(" ", "").replace("\u3000", "")
        if not plain:
            continue
        pz_ratio = sum(1 for ch in plain if ch in "平仄中韵句") / len(plain)
        if pz_ratio < 0.6:
            continue
        marked = re.sub(r"<span class='rhythm'>([^<]+)</span>", r"\1", raw)
        marked = html_lib.unescape(marked)
        for s in re.split(r"[韵句]", marked):
            s2 = "".join(ch for ch in s if ch in "平仄中")
            if s2:
                pattern.append(s2)
    if not pattern:
        return None

    aliases = []
    alias_m = re.search(r"又名《([^》]+)》", html_lib.unescape(re.sub(r"<[^>]+>", "", section)))
    if alias_m:
        aliases = [a.strip() for a in alias_m.group(1).split("、") if a.strip()]

    return {
        "name": name,
        "kind": "ci",
        "pattern": pattern,
        "rhyme": rhyme_desc,
        "aliases": aliases,
    }


def scrape_tunes(client: httpx.Client) -> list[dict]:
    print("== 词谱 ==")
    list_html = get(client, f"{BASE}/QueryCiTune.aspx")
    links = re.findall(r"QueryCiTune\.aspx\?id=(\d+)[^>]*>([^<]+)</a>", list_html)
    seen = {}
    for tid, tname in links:
        seen[int(tid)] = html_lib.unescape(tname).strip()
    print(f"  词牌链接 {len(seen)} 个")
    tunes = []
    for tid in sorted(seen):
        page = get(client, f"{BASE}/QueryCiTune.aspx?id={tid}")
        t = parse_tune_page(page, seen[tid])
        if t:
            tunes.append(t)
        if len(tunes) % 50 == 0:
            print(f"  已解析 {len(tunes)} 个词谱")
    return tunes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rhyme-only", action="store_true")
    parser.add_argument("--tunes-only", action="store_true")
    args = parser.parse_args()

    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        if not args.tunes_only:
            entries = []
            entries += scrape_pingshui(client)
            entries += scrape_cilin(client)
            entries += scrape_zhongyuan(client)
            entries += scrape_tongyun(client)
            RHYME_OUT.write_text(
                json.dumps(entries, ensure_ascii=False, indent=1), encoding="utf-8"
            )
            print(f"韵书完成：{len(entries)} 条 → {RHYME_OUT}")
        if not args.rhyme_only:
            tunes = scrape_tunes(client)
            TUNES_OUT.write_text(
                json.dumps(tunes, ensure_ascii=False, indent=1), encoding="utf-8"
            )
            print(f"词谱完成：{len(tunes)} 个 → {TUNES_OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
