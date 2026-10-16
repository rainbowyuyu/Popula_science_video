from pathlib import Path
import argparse,json,subprocess
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--video',type=Path,default=ROOT/'output/C语言指针_从地址找到原件_1080p.mp4');p.add_argument('--out',type=Path,default=ROOT/'work/encoded-review');a=p.parse_args();a.out.mkdir(exist_ok=True,parents=True)
n=json.loads((ROOT/'src/narration.json').read_text(encoding='utf8'));frames={0,30,n['durationFrames']-1,n['durationFrames']-130}
for c in n['cues']:
 frames.update([c['startFrame']+12,round((c['startFrame']+c['endFrame'])/2),c['endFrame']-10])
frames=sorted(f for f in frames if 0<=f<n['durationFrames']);select='+'.join(f'eq(n\\,{f})' for f in frames)
subprocess.run(['ffmpeg','-v','error','-y','-threads','2','-i',str(a.video),'-vf',f'select={select},scale=960:540','-fps_mode','vfr','-q:v','2',str(a.out/'sample-%04d.jpg')],check=True)
files=sorted(a.out.glob('sample-*.jpg'));assert len(files)==len(frames),(len(files),len(frames))
for src,f in zip(files,frames):src.rename(a.out/f'frame-{f:05}.jpg')
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',22)
for off in range(0,len(frames),12):
 canvas=Image.new('RGB',(1440,1176),'#eef0eb');d=ImageDraw.Draw(canvas)
 for i,f in enumerate(frames[off:off+12]):
  x=i%3*480;y=i//3*294;im=Image.open(a.out/f'frame-{f:05}.jpg');im.thumbnail((480,270));canvas.paste(im,(x,y));d.text((x+8,y+270),f'{f/30:.2f}s / f{f}',fill='#233447',font=font)
 canvas.save(a.out/f'sheet-{off//12+1:02}.jpg',quality=93)
(a.out/'index.json').write_text(json.dumps({'frames':frames,'count':len(frames),'video':str(a.video)},ensure_ascii=False,indent=2),encoding='utf8');print('Frames:',len(frames))
