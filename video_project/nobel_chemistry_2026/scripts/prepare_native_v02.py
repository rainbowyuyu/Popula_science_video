from pathlib import Path
p=Path('scripts/pronunciation_candidates_v02.py');s=p.read_text('utf8');a=s.index('items=[');b=s.index('\nmodel=',a)
s=s[:a]+'''items=[
 ('soai-japanese-native','けんそう そあい。この研究について説明します。','Japanese'),
 ('kagan-french-native','Henri Kagan. Nous allons expliquer cette recherche.','French'),
 ('pasteur-french-native','Louis Pasteur. Nous allons expliquer cette recherche.','French'),
 ('frank-english-native','Charles Frank. Let us explore the research.','English'),
]'''+s[b:];p=Path('scripts/pronunciation_native_v02.py');p.write_text(s,encoding='utf8')
