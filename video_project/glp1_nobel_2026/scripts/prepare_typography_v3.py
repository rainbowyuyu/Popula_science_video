from pathlib import Path
from fontTools import subset
import hashlib,json,argparse
ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser();parser.add_argument('--revision',choices=['v3','v4'],default='v3');args=parser.parse_args()
chars=set(chr(n) for n in range(32,127))
for folder in ['src','docs']:
    for p in (ROOT/folder).rglob('*'):
        if p.suffix in {'.ts','.tsx','.json','.md'}:
            chars.update(p.read_text(encoding='utf-8-sig'))
chars.update('μµβÅ×−→≈≥≤·胰岛细胞膜受体毫米微米纳米放大研究示意尺度')
opt=subset.Options();opt.flavor='woff2';opt.layout_features=['*'];opt.name_IDs=['*'];opt.name_legacy=True
font=subset.load_font('C:/Windows/Fonts/NotoSansSC-VF.ttf',opt)
ss=subset.Subsetter(options=opt);ss.populate(text=''.join(sorted(chars)));ss.subset(font)
out=ROOT/'public/fonts/unified.woff2';subset.save_font(font,str(out),opt)
(ROOT/f'research/revision-{args.revision}/typography.json').write_text(json.dumps({'family':'Rainbow Sans','source':'NotoSansSC-VF.ttf','weights':'100 900','glyph_input_count':len(chars),'sha256':hashlib.sha256(out.read_bytes()).hexdigest(),'rule':'All authored text and numerals use this family. Original paper scans retain their original typography.'},ensure_ascii=False,indent=2),encoding='utf-8')
print(out,len(out.read_bytes()))
