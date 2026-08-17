import sys

sys.path.insert(0, "scripts")
from scrape_rhyme import parse_tune_page  # noqa: E402

for label, path, name in [
    ("归字谣", r"D:/poem-manager/tools/souyun-tune1.html", "归字谣"),
    ("念奴娇", r"D:/poem-manager/tools/souyun-niannujiao.html", "念奴娇"),
]:
    text = open(path, encoding="utf-8").read()
    t = parse_tune_page(text, name)
    if t:
        print(f"《{t['name']}》 句数={len(t['pattern'])}")
        print("  句式:", " / ".join(t["pattern"]))
        print("  押韵:", t["rhyme"][:60])
        print("  别名:", t["aliases"])
    else:
        print(f"《{name}》 解析失败")
