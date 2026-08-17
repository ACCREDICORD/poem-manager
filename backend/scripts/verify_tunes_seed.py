import json

tunes = json.load(open('scripts/tunes_seed.json', encoding='utf-8'))
print('词谱总数:', len(tunes))
print('样例:')
for name in ['归字谣', '忆秦娥', '临江仙', '如梦令', '念奴娇', '水调歌头', '沁园春']:
    found = [t for t in tunes if t['name'] == name]
    if found:
        t = found[0]
        print(f"  《{t['name']}》 kind={t['kind']} 句数={len(t['pattern'])} 别名={t['aliases']}")
        print('    句式:', ' / '.join(t['pattern'][:6]), '…' if len(t['pattern']) > 6 else '')
        print('    押韵:', t['rhyme'][:50])
    else:
        print(f"  《{name}》 未找到")
# 统计
no_pattern = [t['name'] for t in tunes if not t['pattern']]
print('无句式词谱:', len(no_pattern), no_pattern[:10])
