import re
import html as html_lib

text = open(r'D:/poem-manager/tools/souyun-cilin0.html', encoding='utf-8').read()

# 修复版正则：引号风格兼容
pat = re.compile(r'''<div class=["']char["']>(.*?)</div>''', re.S)
blocks = pat.findall(text)
print('cilin0 blocks:', len(blocks))
for b in blocks[:2]:
    name = re.search(r'''<span class=["']rhymeName["']>([^<]+)</span>''', b)
    comment = re.search(r'''<span class=["']comment["']>([^<]+)</span>''', b)
    chars = [html_lib.unescape(t) for t in re.findall(r'<a [^>]*>([^<]+)</a>', b)]
    print(' name:', name.group(1) if name else None, '| comment:', comment.group(1) if comment else None, '| chars前5:', chars[:5], '| 总数:', len(chars))
