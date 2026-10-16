"""Build deterministic local Noto subsets including this film's actual glyphs."""
from pathlib import Path
import hashlib
import json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/fonts';OUT.mkdir(parents=True,exist_ok=True)
# Only text that can appear in the film belongs in the font subset. QA reports
# and asset hashes must not invalidate fonts after an otherwise identical render.
files=[p for p in (ROOT/'src').rglob('*') if p.is_file() and p.suffix in {'.ts','.tsx','.json'}]
narration=ROOT/'docs/v01/narration-v01.json'
if narration.exists():files.append(narration)
text=''.join(p.read_text(encoding='utf-8-sig') for p in files)
text+=''.join(chr(n) for n in range(32,256))+'→←↑↓≈×−·＋⁺₂ⅠⅡαβμθ₀₁₃₄₅₆₇₈₉±∝∑∆λσ%'
text=''.join(sorted(set(text)))
digest=hashlib.sha256(text.encode('utf8')).hexdigest()
manifest=OUT/'fonts-v01.json'
old=json.loads(manifest.read_text('utf8')) if manifest.exists() else {}
if old.get('textSHA256')==digest and all((OUT/f'{n}.woff2').exists() for n in ['sans','serif']):
    print('Chemistry fonts unchanged')
else:
    records=[]
    for name,filename,weight in [('sans','NotoSansSC-VF.ttf',550),('serif','NotoSerifSC-VF.ttf',700)]:
        source=Path('C:/Windows/Fonts')/filename
        if not source.exists():raise FileNotFoundError(source)
        font=TTFont(source)
        required={ord(c) for c in text if '\u4e00'<=c<='\u9fff' or 32<=ord(c)<127}
        missing=sorted(required-set(font.getBestCmap()))
        if missing:raise RuntimeError(f'Missing required source glyphs: {missing}')
        opts=subset.Options();opts.flavor='woff2';sub=subset.Subsetter(options=opts);sub.populate(text=text);sub.subset(font)
        font=instantiateVariableFont(font,{'wght':weight},inplace=True);font.flavor='woff2'
        target=OUT/f'{name}.woff2';font.save(target)
        after=set(TTFont(target).getBestCmap())
        if required-after:raise RuntimeError('Subset dropped required glyphs')
        records.append({'family':name,'source':str(source),'weight':weight,'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'requiredGlyphs':len(required),'missingRequiredGlyphs':[]})
        print(name,target.stat().st_size)
    manifest.write_text(json.dumps({'textSHA256':digest,'fonts':records,'note':'Personal local rendering subset. Keep original font license with any redistribution.'},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
