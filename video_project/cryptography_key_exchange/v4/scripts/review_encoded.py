from pathlib import Path
import json,subprocess,argparse
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--output-dir',type=Path,default=ROOT/'work/encoded-review');p.add_argument('--video',type=Path,default=ROOT/'delivery/密码学_没约过密码消息怎么保密_V4_1080p.mp4');a=p.parse_args()
out=a.output_dir;out.mkdir(exist_ok=True,parents=True)
t=json.loads((ROOT/'src/timeline-data.json').read_text(encoding='utf8'))
duration=t['durationFrames']
frames=set([0,150,duration-1,t['coda']['startFrame']+55,5529,5559,5589,5619,5649,5700,8047])
frames.update(round((c['startFrame']+c['endFrame'])/2) for c in t['cues'])
for g in t['groups'][1:]:
 f=round(g['start']*30);frames.update(f+d for d in [-45,-15,0,15,45,75] if 0<=f+d<duration)
events=json.loads((ROOT/'src/word-events.json').read_text(encoding='utf8'))['events']
for e in events:
 if (e['cueId'],e['phrase']) in [('s06','杂乱'),('s17','交换'),('s22','两端'),('s26','拿不到'),('s30','拒收')]:
  f=round(e['startSec']*30);frames.update(f+d for d in [-1,0,15,40,70,100])
for cue in t['cues']:
 if cue['id'] in ['s11','s24','s32','s34']:
  frames.update(cue['startFrame']+d for d in [15,45,75,105,135])
frames=sorted(f for f in frames if 0<=f<duration)
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
