import sys
from types import SimpleNamespace

sys.path.insert(0, r"D:\poem-manager\py-deps")
sys.path.insert(0, r"D:\poem-manager\poem-manager-main\backend")

from app.rhyme import check_poem_pingze, char_pingze, _derive_shi_pattern  # noqa: E402

denggao = "风急天高猿啸哀，渚清沙白鸟飞回。\n无边落木萧萧下，不尽长江滚滚来。\n万里悲秋常作客，百年多病独登台。\n艰难苦恨繁霜鬓，潦倒新停浊酒杯。"

tpl = SimpleNamespace(name="七律", kind="shi", pattern=["平平仄仄仄平平"] * 8)
report = check_poem_pingze(denggao, tpl)
print("kind:", report["kind"])
print("derived pattern:", report["pattern"])
print("violations:", report["total_violations"])
for it in report["issues"]:
    print(" ", it)

print("char check: 急=", char_pingze("急"), "哀=", char_pingze("哀"), "风=", char_pingze("风"))
