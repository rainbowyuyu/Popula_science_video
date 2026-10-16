from pathlib import Path
import json,subprocess,argparse
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output-dir',type=Path,default=ROOT/'work/encoded-review');p.add_argument('--video',type=Path,default=ROOT/'delivery/密码学_没约过密码消息怎么保密_V3_1080p.mp4');a=p.parse_args()
out=a.output_dir;out.mkdir(exist_ok=True)
t=json.loads((ROOT/'src/timeline-data.json').read_text(encoding='utf8'))
frames=set([0,150,825,1130,1353,1565,1880,3850,4140,4510,4660,5250,6335,6370,6500,7300,7510,7630,8210,8640,8900,9014])
frames.update(round((c['startFrame']+c['endFrame'])/2) for c in t['cues'])
for g in t['groups'][1:]:
 f=round(g['start']*30);frames.update(f+d for d in [-30,-15,0,15,30,60] if 0<=f+d<9015)
frames.update([6099,6100,6101,6320,6350,6380,7155,7163,7170,7190,7215,7903,7933,7963,8040,8041,8042,8459,8460,8467,8475,8490,8510,8545,8546,8547])
frames=sorted(frames)
select='+'.join(f'eq(n\\,{f})' for f in frames)
subprocess.run(['ffmpeg','-v','error','-y','-threads','2','-i',str(a.video),'-vf',f'select={select},scale=960:540','-fps_mode','vfr','-q:v','2',str(out/'sample-%04d.jpg')],check=True)
# Commas within each select function are escaped for FFmpeg filter parsing.
files=sorted(out.glob('sample-*.jpg'))
if len(files)!=len(frames):raise RuntimeError(f'Expected {len(frames)} samples, received {len(files)}')
for src,f in zip(files,frames):src.rename(out/f'frame-{f:05}.jpg')
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',22)
for off in range(0,len(frames),12):
 canvas=Image.new('RGB',(1440,4*294),(239,237,229));draw=ImageDraw.Draw(canvas)
 for j,f in enumerate(frames[off:off+12]):
  x=j%3*480;y=j//3*294
  im=Image.open(out/f'frame-{f:05}.jpg');im.thumbnail((480,270));canvas.paste(im,(x,y));draw.text((x+8,y+271),f'{f/30:.2f}s  /  {f}',fill=(20,50,60),font=font)
 canvas.save(out/f'sheet-{off//12+1:02}.jpg',quality=93)
(out/'index.json').write_text(json.dumps({'frames':frames,'video':str(a.video),'notes':'Actual encoded representative and section-boundary frames; not a claim of all-frame human review.'},indent=2),encoding='utf8')
print(json.dumps({'samples':len(frames),'sheets':(len(frames)+11)//12}))
