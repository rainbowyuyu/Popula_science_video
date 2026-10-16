"""Freeze RGB Qwen anchor copies and readable endpoint contact sheets.

This is format/layout processing only: no generative edit or numeric overlay.
"""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[1]
DEST=ROOT/'public/generated/v7/qwen-anchors-final'
DEST.mkdir(parents=True,exist_ok=True)
PAIR_DEFS=[
 ('ocean',0,300,'native-anchors-r2','native-anchors-r2'),
 ('drawing',660,960,'blueprint-anchors-r3','native-anchors-r2'),
 ('beso',1500,1800,'native-anchors-r2','native-anchors-r2'),
 ('underwater',2640,2940,'native-anchors-r7','native-anchors-r7'),
 ('connection',3900,4200,'blueprint-anchors-r3','native-anchors-r2'),
 ('closing',5760,6060,'blueprint-anchors-r3','native-anchors-r2'),
]
try:FONT=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',23)
except OSError:FONT=ImageFont.load_default()
records=[]
for name,first,last,adir,bdir in PAIR_DEFS:
    sources=[ROOT/f'public/generated/v7/{folder}/frame-{frame:06}.png' for frame,folder in [(first,adir),(last,bdir)]]
    if not all(p.is_file() for p in sources):continue
    converted=[]
    sheet=Image.new('RGB',(1600,480),'#eef1f0')
    draw=ImageDraw.Draw(sheet)
    for i,(file,frame) in enumerate(zip(sources,[first,last])):
        with Image.open(file) as img:
            # Alpha is composited onto the existing light film background.
            rgba=img.convert('RGBA');base=Image.new('RGBA',rgba.size,'#e7eff1');base.alpha_composite(rgba);rgb=base.convert('RGB')
            dest=DEST/f'{name}-{["first","last"][i]}.png';rgb.save(dest)
            sheet.paste(rgb.resize((800,450),Image.Resampling.LANCZOS),(800*i,0))
        draw.text((800*i+14,451),f'{name} / {frame/60:.2f} s / frame {frame}',fill='#163a49',font=FONT)
        converted.append({'source':file.relative_to(ROOT).as_posix(),'file':dest.relative_to(ROOT).as_posix(),'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'sourceSha256':hashlib.sha256(file.read_bytes()).hexdigest(),'mode':'RGB','size':[1920,1080],'frame':frame})
    sheet_path=ROOT/f'work/v7-{name}-endpoints.jpg';sheet_path.parent.mkdir(parents=True,exist_ok=True);sheet.save(sheet_path,quality=95)
    records.append({'id':name,'firstFrame':first,'lastFrame':last,'anchors':converted,'sheet':sheet_path.relative_to(ROOT).as_posix()})
report=ROOT/'research/generation/qwen-v7-anchor-freeze.json';report.parent.mkdir(parents=True,exist_ok=True)
report.write_text(json.dumps({'schema':'qwen-v7-anchor-freeze-v1','pairs':records,'note':'RGB conversion and contact sheets only. First/last source images retain the actual camera and geometry. BESO pair uses saved state 000 at both ends; generated intermediate footage is concept camera imagery only.'},ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'frozenPairs':[r['id'] for r in records],'directory':str(DEST),'manifest':str(report)},ensure_ascii=False))
