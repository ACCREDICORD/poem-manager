import re
import sys

sys.path.insert(0, "scripts")
from scrape_famous_tunes import parse_formats  # noqa: E402

for label, path in [
    ("归字谣", r"D:/poem-manager/tools/souyun-tune1.html"),
    ("念奴娇", r"D:/poem-manager/tools/souyun-niannujiao.html"),
]:
    text = open(path, encoding="utf-8").read()
    print(f"=== {label}: ciTuneFormat count =", len(re.findall(r"""<div class=['"]ciTuneFormat['"]>""", text)))
    m = re.search(r"""<div id=["']ResultArea["']>""", text)
    print("  ResultArea found:", bool(m))
    m2 = re.search(r"""<div class=['"]tab-page['"]><span class=['"]tab['"]>龙谱""", text)
    print("  龙谱 marker found:", bool(m2))
    fmts = parse_formats(text)
    print("  parsed formats:", len(fmts))
    for f in fmts[:3]:
        print("   -", f["format_desc"][:30], "|", len(f["pattern"]), "句 | flags:", f["rhyme_flags"])
