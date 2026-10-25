# index.html を組み立てる: page.html に core.js を埋め込み、core.js の '/*MUNI*/' に市区町村の一覧（muni.txt）を入れる
# 実行: python source/build.py
from pathlib import Path

here = Path(__file__).resolve().parent
muni = (here / 'muni.txt').read_text(encoding='utf-8').strip()
assert "'" not in muni and '\\' not in muni and '\n' not in muni, '一覧に埋め込めない文字がある'
core = (here / 'core.js').read_text(encoding='utf-8').replace('/*MUNI*/', muni, 1)
page = (here / 'page.html').read_text(encoding='utf-8')
assert page.count('/*CORE*/') == 1
out = page.replace('/*CORE*/', core.strip())
(here.parent / 'index.html').write_text(out, encoding='utf-8', newline='\n')
print('index.html', len(out.encode('utf-8')), 'bytes')
