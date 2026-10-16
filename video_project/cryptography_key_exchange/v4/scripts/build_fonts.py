"""Subset installed OFL Noto fonts to this film's actual visible characters."""
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
import hashlib,json,urllib.request

ROOT=Path(__file__).resolve().parents[1]
out=ROOT/'public/fonts';out.mkdir(exist_ok=True)
text=''.join(p.read_text(encoding='utf8') for p in (ROOT/'src').glob('*') if p.suffix in {'.ts','.tsx','.json'})
text+=''.join(chr(n) for n in range(32,127))+'✓○×①②③④⑤⑥→＋／，。？！：；（）·–—'
manifest=[]
for name in ['NotoSerifSC','NotoSansSC']:
    source=Path('C:/Windows/Fonts')/(name+'-VF.ttf')
    font=TTFont(source);options=subset.Options();options.flavor='woff2';options.layout_features=['*']
    options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*']
    task=subset.Subsetter(options=options);task.populate(text=text);task.subset(font)
    font.flavor='woff2';dest=out/(name+'.woff2');font.save(dest)
    manifest.append({'file':str(dest.relative_to(ROOT)),'source':str(source),'sourceSha256':hashlib.sha256(source.read_bytes()).hexdigest(),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'license':'SIL Open Font License 1.1','characters':len(set(text))})
license_url='https://raw.githubusercontent.com/google/fonts/main/ofl/notoserifsc/OFL.txt'
license_path=out/'OFL.txt'
if not license_path.exists():
    license_path.write_bytes(urllib.request.urlopen(license_url,timeout=30).read())
(ROOT/'docs/fonts.json').write_text(json.dumps({'fonts':manifest,'licenseSource':license_url},indent=2,ensure_ascii=False),encoding='utf8')
print(json.dumps(manifest,ensure_ascii=False,indent=2))
