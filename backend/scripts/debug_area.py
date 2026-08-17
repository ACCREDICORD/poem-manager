import re

text = open(r"D:/poem-manager/tools/souyun-tune1.html", encoding="utf-8").read()

m_area = re.search(
    r"""<div id=["']ResultArea["']>(.*?)<div class=['"]tab-page['"]><span class=['"]tab['"]>龙谱""",
    text,
    re.S,
)
print("area matched:", bool(m_area))
if m_area:
    area = m_area.group(1)
    print("area len:", len(area))
    print("ciTuneFormat in area:", len(re.findall(r"""<div class=['"]ciTuneFormat['"]>""", area)))
    blocks = re.findall(r"""<div class=['"]ciTuneFormat['"]>(.*?)</div>""", area, re.S)
    print("block regex matches:", len(blocks))
    if blocks:
        b = blocks[0]
        print("block[0] head:", b[:200])
        print("  tuneFormatDesc:", re.search(r"""<span class=['"]tuneFormatDesc['"]>([^<]*)</span>""", b).group(1) if re.search(r"""<span class=['"]tuneFormatDesc['"]>([^<]*)</span>""", b) else None)
