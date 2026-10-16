"""Subset the actual film copy, preserving Noto variable weights and OFL."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
import json,hashlib
root=Path(__file__).resolve().parents[1]
source=Path('C:/Windows/Fonts/NotoSansSC-VF.ttf')
parts=[(root/'src/story.json').read_text(encoding='utf8'),(root/'src/EpisodeFilm.tsx').read_text(encoding='utf8'),(root/'data/series36.json').read_text(encoding='utf8')]
text=''.join(parts)+''.join(chr(i) for i in range(32,127))
font=TTFont(source)
opts=subset.Options();opts.flavor='woff2';opts.layout_features=['*']
sub=subset.Subsetter(options=opts);sub.populate(text=text);sub.subset(font)
font.flavor='woff2';destination=root/'public/fonts/unified.woff2';font.save(destination)
actual=TTFont(destination).getBestCmap()
visible=''.join(c['text'] for c in json.loads(parts[0])['captions'])+'浙江大学·海洋新能源第一期海洋风电总览×'
missing=sorted(set(c for c in visible if not c.isspace() and ord(c) not in actual))
if missing:raise RuntimeError('Missing caption glyphs: '+''.join(missing))
report={'source':str(source),'sourceSHA256':hashlib.sha256(source.read_bytes()).hexdigest(),'destination':'public/fonts/unified.woff2','sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'glyphs':len(actual),'missing':missing,'license':'SIL Open Font License 1.1'}
(root/'work/v7/caption-font.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
