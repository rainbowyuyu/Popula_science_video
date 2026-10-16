"""Decode current master frames at semantic cues/boundaries; make review sheets.

Extraction only. Contact sheets must be opened and reviewed; no beauty verdict.
"""
from pathlib import Path
import argparse,json,subprocess,math
from PIL import Image,ImageDraw
R=Path(__file__).resolve().parents[1]
P=R.parents[1]
p=argparse.ArgumentParser()
p.add_argument('--video',type=Path,default=P/'output/v05/Roadster_倒挂与飞行翻滚_1080p.mp4')
p.add_argument('--out',type=Path,default=R/'work/qa/decoded-frames')
a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
n=json.loads((R/'src/narration.json').read_text(encoding='utf8'))
frames={0,n['durationFrames']-1};labels={}
for c in n['cues']:
 for q in [.12,.5,.88]:
  f=round(c['startFrame']+(c['endFrame']-c['startFrame'])*q)
  frames.add(f);labels[f]=f"{c['id']} / {q:.0%}"
for g in n['groups'][1:]+[n['coda']]:
 for delta in [-45,-15,0,15,45]:
  f=g['startFrame']+delta
  if 0<=f<n['durationFrames']:frames.add(f);labels[f]='boundary '+str(delta)
frames=sorted(frames)
select='+'.join(f'eq(n,{f})' for f in frames)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(a.video),'-vf',f"select='{select}',scale=960:540",'-fps_mode','vfr','-q:v','2',str(a.out/'sample-%04d.jpg')],check=True)
manifest=[]
for i,f in enumerate(frames,1):
 file=a.out/f'sample-{i:04d}.jpg'
 if not file.exists():raise RuntimeError('Missing extracted frame '+str(f))
 manifest.append({'file':file.name,'frame':f,'seconds':f/30,'label':labels.get(f,'endpoint')})
for page in range(math.ceil(len(manifest)/9)):
 sheet=Image.new('RGB',(1440,900),'#eceae4');d=ImageDraw.Draw(sheet)
 for j,row in enumerate(manifest[page*9:page*9+9]):
  im=Image.open(a.out/row['file']);im.thumbnail((480,270));x=j%3*480;y=j//3*300;sheet.paste(im,(x,y));d.text((x+10,y+275),f"{row['seconds']:.2f}s  {row['label']}  f{row['frame']}",fill='#1b3034')
 sheet.save(a.out/f'sheet-{page+1:02d}.jpg',quality=93)
(a.out/'frames.json').write_text(json.dumps(manifest,indent=2),encoding='utf8')
print('Extracted',len(manifest),'current encoded frames; visual review required.')
