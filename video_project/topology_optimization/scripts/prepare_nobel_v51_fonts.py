"""Freeze a small font subset for deterministic frames and portable re-rendering."""
from pathlib import Path
import hashlib
import json
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools import subset

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'public/nobel2026/fonts'
OUT.mkdir(parents=True,exist_ok=True)
text=''.join(p.read_text(encoding='utf-8-sig') for p in (ROOT/'src/nobel2026').glob('*') if p.suffix in {'.ts','.tsx','.json'})
text+=''.join(chr(n) for n in range(32,256))+'→←↑↓≈×−·＋⁺₂ⅠⅡαβμθ'
text=''.join(sorted(set(text)))
digest=hashlib.sha256(text.encode('utf8')).hexdigest()
manifest=OUT/'fonts-v51.json'
existing=json.loads(manifest.read_text('utf8')) if manifest.exists() else {}
if existing.get('text_sha256')==digest and all((OUT/n).exists() for n in ('serif.woff2','sans.woff2')):
    print('V5.1 fonts unchanged')
else:
    records=[]
    for name,source,weight in [('sans','NotoSansSC-VF.ttf',550),('serif','NotoSerifSC-VF.ttf',700)]:
        source=Path('C:/Windows/Fonts')/source
        if not source.exists():
            if (OUT/f'{name}.woff2').exists():
                continue
            raise FileNotFoundError(source)
        font=TTFont(source)
        options=subset.Options()
        options.flavor='woff2'
        sub=subset.Subsetter(options=options)
        sub.populate(text=text)
        sub.subset(font)
        font=instantiateVariableFont(font,{'wght':weight},inplace=True)
        font.flavor='woff2'
        target=OUT/f'{name}.woff2'
        font.save(target)
        records.append({'family':name,'source':source.name,'weight':weight,'sha256':hashlib.sha256(target.read_bytes()).hexdigest(),'bytes':target.stat().st_size})
        print(name,target.stat().st_size)
    manifest.write_text(json.dumps({'text_sha256':digest,'fonts':records},indent=2),encoding='utf8')
