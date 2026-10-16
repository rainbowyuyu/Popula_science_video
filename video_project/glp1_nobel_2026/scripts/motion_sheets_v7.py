"""Make time-ordered inspection sheets from actual Film output.

The plan records the sampling cadence. This never marks visual QA passed.
"""
from pathlib import Path
import json,sys
from PIL import Image,ImageDraw,ImageFont

root=Path(__file__).resolve().parents[1]
directory=root/sys.argv[1]
plan=json.loads((root/sys.argv[2]).read_text('utf8'))
out=directory/'motion-sheets';out.mkdir(exist_ok=True)
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',18)
images={int(p.stem.split('-')[-1]):p for p in (directory/'frames').glob('*.jpeg')}
index=[]
for span in plan['spans']:
 frames=list(range(span['start'],span['end']+1,span['step']))
 for page,k in enumerate(range(0,len(frames),12)):
  subset=frames[k:k+12]
  sheet=Image.new('RGB',(1920,3*294),(243,239,233));d=ImageDraw.Draw(sheet)
  for j,f in enumerate(subset):
   if f not in images:raise RuntimeError(f'missing {f}')
   im=Image.open(images[f]);im.thumbnail((480,270));x=j%4*480;y=j//4*294
   sheet.paste(im,(x,y+24));d.text((x+8,y+2),f"{span['name']} / {f} / {f/30:.2f}s",fill='#234c4a',font=font)
  file=out/f"{span['name']}-{page:02d}.jpg";sheet.save(file,quality=93)
  index.append({'file':str(file),'frames':subset,'cadenceFrames':span['step'],'span':span['name']})
(out/'index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2),'utf8')
print(f'{len(index)} sheets saved to {out}')
