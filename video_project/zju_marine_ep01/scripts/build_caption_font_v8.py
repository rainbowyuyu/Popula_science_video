"""Subset current V8 copy, retaining variable weights and OFL provenance."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
import hashlib,json

ROOT=Path(__file__).resolve().parents[1]
SOURCE=Path('C:/Windows/Fonts/NotoSansSC-VF.ttf')
INPUTS=['src/story.json','src/EpisodeFilm.tsx','src/WorldTypography.ts','work/audio-v8/research-headlines-v8.json']
parts=[(ROOT/p).read_text(encoding='utf8') for p in INPUTS]
text=''.join(parts)+''.join(chr(i) for i in range(32,127))+'rainbow鱼浙江大学·海洋新能源第一期海洋风电总览×'
font=TTFont(SOURCE)
opts=subset.Options();opts.flavor='woff2';opts.layout_features=['*']
sub=subset.Subsetter(options=opts);sub.populate(text=text);sub.subset(font)
font.flavor='woff2';destination=ROOT/'public/fonts/unified.woff2';font.save(destination)
output=TTFont(destination);actual=output.getBestCmap()
story=json.loads(parts[0]);visible=''.join(c['text'] for c in story['captions'])+'浙江大学·海洋新能源第一期海洋风电总览×rainbow鱼'
missing=sorted(set(c for c in visible if not c.isspace() and ord(c) not in actual))
if missing:raise RuntimeError('Missing caption glyphs: '+''.join(missing))
if 'fvar' not in output:raise RuntimeError('Variable weight axis was lost')
report={'schema':'v8-caption-font','source':str(SOURCE),'sourceSHA256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),
    'inputs':[{'path':p,'sha256':hashlib.sha256((ROOT/p).read_bytes()).hexdigest()} for p in INPUTS],
    'destination':'public/fonts/unified.woff2','sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),
    'bytes':destination.stat().st_size,'glyphs':len(actual),'requiredVisibleCharacters':len(set(visible)),
    'variableAxes':[{'tag':a.axisTag,'min':a.minValue,'max':a.maxValue} for a in output['fvar'].axes],
    'missing':missing,'license':'SIL Open Font License 1.1','licenseFile':'public/fonts/Noto-OFL.txt'}
out=ROOT/'work/v8';out.mkdir(parents=True,exist_ok=True)
(out/'caption-font.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False))
