"""Extract the planned semantic transitions from the final encoded movie."""
from pathlib import Path
import json, subprocess, argparse
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser()
p.add_argument('--video',type=Path,default=ROOT/'output/C语言指针_从地址找到原件_1080p.mp4')
p.add_argument('--out',type=Path,default=ROOT/'work/transition-review')
a=p.parse_args();a.out.mkdir(parents=True,exist_ok=True)
plan=json.loads((ROOT/'work/qa/transition-plan.json').read_text(encoding='utf8'))
frames=plan['frames'];select='+'.join(f'eq(n\\,{f})' for f in frames)
subprocess.run(['ffmpeg','-v','error','-y','-threads','2','-filter_threads','2','-i',str(a.video),
 '-vf',f'select={select},scale=960:540','-fps_mode','vfr','-q:v','2',str(a.out/'sample-%04d.jpg')],check=True)
files=sorted(a.out.glob('sample-*.jpg'))
assert len(files)==len(frames),(len(files),len(frames))
for source,frame in zip(files,frames):source.rename(a.out/f'frame-{frame:05}.jpg')
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',22)
groups=plan['groups']
for offset in range(0,len(groups),4):
 canvas=Image.new('RGB',(1920,1280),'#eef0eb');draw=ImageDraw.Draw(canvas)
 for row,g in enumerate(groups[offset:offset+4]):
  y=row*320
  draw.text((10,y+2),g['id']+' '+g['name'],fill='#233447',font=font)
  for col,sample in enumerate(g['samples']):
   frame=sample['frame'];x=col*480
   im=Image.open(a.out/f'frame-{frame:05}.jpg');im.thumbnail((480,270));canvas.paste(im,(x,y+30))
   draw.text((x+8,y+297),f'{frame/30:.2f}s / f{frame}',fill='#233447',font=font)
 canvas.save(a.out/f'sheet-{offset//4+1:02}.jpg',quality=94)
(a.out/'index.json').write_text(json.dumps({'frames':frames,'count':len(frames),'groups':len(groups),'video':str(a.video)},ensure_ascii=False,indent=2),encoding='utf8')
print('Transition frames:',len(frames))
