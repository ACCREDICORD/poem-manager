import json
from collections import Counter

data = json.load(open('scripts/rhyme_seed.json', encoding='utf-8'))
print('总条数:', len(data))
by_book = Counter(e['book'] for e in data)
for book, n in by_book.items():
    print(f'  {book}: {n} 条')

# 平水韵韵部数
ps = [e for e in data if e['book'] == '平水韵']
print('平水韵韵部数:', len({e['rhyme_name'] for e in ps}), '(期望 106)')
cl = [e for e in data if e['book'] == '词林正韵']
print('词林正韵块数:', len(cl))
zy = [e for e in data if e['book'] == '中原音韵']
print('中原音韵部数:', len({e['rhyme_name'] for e in zy}), '(期望 19)')
ty = [e for e in data if e['book'] == '中华通韵']
print('中华通韵韵部数:', len({e['rhyme_name'] for e in ty}))

# 抽查：东平、董上、冻去、屋入
def find(char):
    for e in data:
        if char in e['chars']:
            return e['book'], e['tone'], e['rhyme_name']
    return None

for ch in ['东', '董', '冻', '屋', '江', '雪', '花', '春']:
    print(f'  {ch} →', find(ch))

# 字表规模
total_chars = sum(len(e['chars']) for e in data)
print('总字表字符数:', total_chars)
