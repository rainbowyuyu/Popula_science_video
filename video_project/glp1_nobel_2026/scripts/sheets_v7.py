from pathlib import Path
import json,sys
from PIL import Image,ImageDraw,ImageFont
root=Path(__file__).resolve().parents[1]
directory=root/(sys.argv[1] if len(sys.argv)>1 else 'tmp/v7-preview-01')
tl=json.loads((root/'src/timeline.json').read_text('utf8'))
out=directory/'sheets';out.mkdir(exist_ok=True)
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',21)
images={int(p.stem.split('-')[-1]):p for p in (directory/'frames').glob('*.jpeg')}
images.update({int(p.stem.split('-')[-1]):p for p in (directory/'frames').glob('*.jpg')})
index=[]
for k in range(0,len(tl['clips']),2):
 clips=tl['clips'][k:k+2];sheet=Image.new('RGB',(1920,800*len(clips)//2),(242,238,231));d=ImageDraw.Draw(sheet)
 rows=[]
 for j,c in enumerate(clips):
  frames=[int(c['start']+c['duration']*u) for u in [.18,.53,.85]]
  for i,f in enumerate(frames):
   if f not in images:continue
   im=Image.open(images[f]);im.thumbnail((640,360));sheet.paste(im,(i*640,j*400+40));d.text((i*640+10,j*400+7),f"{c['id']}  {f/30:.2f}s  frame {f}",fill='#234c4a',font=font)
  rows.append({'id':c['id'],'text':c['text'],'frames':frames})
 path=out/f"{clips[0]['id']}-{clips[-1]['id']}.jpg";sheet.save(path,quality=93);index.append({'sheet':str(path),'clips':rows})
(out/'index.json').write_text(json.dumps(index,ensure_ascii=False,indent=2),'utf8')
print(f'{len(index)} sheets; {len(images)} frames; {out}')
