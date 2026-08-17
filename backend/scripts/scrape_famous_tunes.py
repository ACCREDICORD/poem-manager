"""抓取 20 个知名词牌的 正格 + 2 变格（按搜韵格式：句式含韵/句标记、每格带对应例词）。"""

import html as html_lib
import json
import re
import sys
import time
import unicodedata
from pathlib import Path

import httpx

if sys.stdout and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

BASE = "https://sou-yun.cn"
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0 Safari/537.36"
)
DELAY = 0.5
OUT = Path(__file__).resolve().parent / "famous_tunes_seed.json"

FAMOUS = [
    "念奴娇", "水调歌头", "满江红", "沁园春", "临江仙",
    "蝶恋花", "浣溪沙", "鹧鸪天", "菩萨蛮", "卜算子",
    "清平乐", "西江月", "如梦令", "虞美人", "忆江南",
    "长相思", "江城子", "声声慢", "雨霖铃", "浪淘沙令",
]

CJK_RE = re.compile(r"^[\u4e00-\u9fff]{1}$")


def get(client: httpx.Client, url: str) -> str:
    for attempt in range(3):
        try:
            resp = client.get(url, headers={"User-Agent": UA, "Referer": BASE + "/"})
            resp.raise_for_status()
            time.sleep(DELAY)
            return resp.text
        except Exception as exc:  # noqa: BLE001
            if attempt == 2:
                raise
            time.sleep(2 + attempt * 2)
    return ""


def parse_formats(html_text: str) -> list[dict]:
    """解析钦谱 tab 内所有格；不足时补充龙谱 tab 的格。"""
    formats = []
    m = re.search(
        r"""<div id=["']ResultArea["']>(.*?)<div class=['"]tab-page['"]><span class=['"]tab['"]>龙谱""",
        html_text,
        re.S,
    )
    if m:
        formats += _parse_area(m.group(1))
    m2 = re.search(
        r"""<span class=['"]tab['"]>龙谱.*?<div class=['"]tab-page['"]><span class=['"]tab['"]>历代作品""",
        html_text,
        re.S,
    )
    if m2:
        formats += _parse_area(m2.group(0))
    return formats


def _parse_area(area: str) -> list[dict]:
    formats = []
    for m in re.finditer(r"""<div class=['"]ciTuneFormat['"]>(.*?)</div>""", area, re.S):
        block = m.group(1)
        desc_m = re.search(r"""<span class=['"]tuneFormatDesc['"]>([^<]*)</span>""", block)
        author_m = re.search(r"""<span class=['"]indentLabel['"]>([^<]*)</span>""", block)
        example_m = re.search(r"""<p class=['"]mSize['"]>(.*?)</p>""", block, re.S)
        example = ""
        if example_m:
            example = re.sub(r"<[^>]+>", "", example_m.group(1))
            example = example.replace("\u3000", "").replace("&nbsp;", "").strip()
            example = html_lib.unescape(example)
            # 部分词牌页面把平仄谱混进例词 <p>：剔除纯平仄标注行
            example = "\n".join(
                l
                for l in example.splitlines()
                if not re.fullmatch(r"[\s平仄中韵句叠叶]+", l)
            ).strip()

        pattern, flags = [], []
        for cm in re.finditer(
            r"""<span class=['"]comment['"]>(.*?)</span></p>""", block, re.S
        ):
            raw = cm.group(1)
            if "平" not in raw and "仄" not in raw:
                continue
            plain = re.sub(r"<[^>]+>", "", raw).replace(" ", "").replace("\u3000", "")
            if not plain:
                continue
            ratio = sum(1 for ch in plain if ch in "平仄中韵句叠叶") / len(plain)
            if ratio < 0.6:
                continue
            # 韵/句/叠/叶 标记属于其前面的句子：遇标记即收句
            parts = re.split(r"""(<span class=['"]rhythm['"]>[^<]*</span>)""", raw)
            buf = ""
            for p in parts:
                if not p:
                    continue
                mm = re.match(r"""<span class=['"]rhythm['"]>([^<]*)</span>""", p)
                if mm:
                    sentence = "".join(ch for ch in html_lib.unescape(buf) if ch in "平仄中")
                    if sentence:
                        pattern.append(sentence)
                        flags.append(mm.group(1) in ("韵", "叠", "叶"))
                    buf = ""
                    continue
                buf += p
            # 结尾无标记残留
            sentence = "".join(ch for ch in html_lib.unescape(buf) if ch in "平仄中")
            if sentence:
                pattern.append(sentence)
                flags.append(False)
        if not pattern:
            continue
        formats.append(
            {
                "format_desc": html_lib.unescape(desc_m.group(1)).strip() if desc_m else "",
                "author": html_lib.unescape(author_m.group(1)).strip() if author_m else "",
                "example": example,
                "pattern": pattern,
                "rhyme_flags": flags,
            }
        )
    return formats


def scrape() -> dict:
    with httpx.Client(timeout=30.0, follow_redirects=True) as client:
        list_html = get(client, f"{BASE}/QueryCiTune.aspx")
        links = re.findall(r"QueryCiTune\.aspx\?id=(\d+)[^>]*>([^<]+)</a>", list_html)
        id_map = {html_lib.unescape(n).strip(): int(tid) for tid, n in links}

        result = []
        for name in FAMOUS:
            tid = id_map.get(name)
            if tid is None:
                print(f"  ✗ {name}: 列表中未找到")
                continue
            page = get(client, f"{BASE}/QueryCiTune.aspx?id={tid}")
            formats = parse_formats(page)
            # 正格 + 前两个变格
            picks = formats[:3]
            labels = ["正格", "又一体①", "又一体②"]
            entries = []
            for i, f in enumerate(picks):
                entries.append({"label": labels[i], **f})
            result.append({"name": name, "entries": entries})
            print(f"  ✓ {name}: {len(formats)} 个格，取 {len(entries)} 个")
            for e in entries:
                print(f"      {e['label']}: {e['format_desc']} | {len(e['pattern'])}句 | 例词作者 {e['author']}")
        return {"tunes": result}


if __name__ == "__main__":
    data = scrape()
    OUT.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"完成 → {OUT}")
    sys.exit(0)
