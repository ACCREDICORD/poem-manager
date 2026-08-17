import re
import html as html_lib

text = open(r"D:/poem-manager/tools/souyun-niannujiao.html", encoding="utf-8").read()
m = re.search(r"""<div id=["']ResultArea["']>(.*?)<div class=['"]tab-page['"]><span class=['"]tab['"]>龙谱""", text, re.S)
area = m.group(1) if m else text

blocks = re.findall(r"""<div class=['"]ciTuneFormat['"]>(.*?)</div>""", area, re.S)
print("钦谱 blocks:", len(blocks))
for i, b in enumerate(blocks[:4]):
    desc = re.search(r"""<span class=['"]tuneFormatDesc['"]>([^<]*)</span>""", b)
    author = re.search(r"""<span class=['"]indentLabel['"]>([^<]*)</span>""", b)
    example = re.search(r"""<p class=['"]mSize['"]>(.*?)</p>""", b, re.S)
    ex_text = ""
    if example:
        ex_text = re.sub(r"<[^>]+>", "", example.group(1)).replace("\u3000", "").strip()[:30]
    print(f"块{i}: desc={desc.group(1) if desc else None} | 作者={author.group(1) if author else None} | 例词={html_lib.unescape(ex_text)}")
