"""Extract actual encoded patch frames, with marker/hash checks before review."""
from pathlib import Path
import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
import subprocess
from PIL import Image,ImageDraw,ImageFont

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def sha(file):
    h=hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda:stream.read(8*1024*1024),b''):h.update(chunk)
    return h.hexdigest()
def read(file):return json.loads(file.read_text(encoding='utf-8-sig'))
parser=argparse.ArgumentParser()
parser.add_argument('--index',type=int,required=True)
args=parser.parse_args()
plan=read(HERE/'patch-plan.json')
if not 1<=args.index<=len(plan['patches']):raise SystemExit('Index outside patch plan')
patch=plan['patches'][args.index-1]
video=ROOT/patch['video'];marker=read(ROOT/patch['marker'])
for key in ['timelineSHA256','masterSHA256']:
    if marker.get(key)!=plan[key]:raise SystemExit('Marker input mismatch: '+key)
if marker.get('frames')!=[patch['start'],patch['end']]:raise SystemExit('Marker frame range mismatch')
if not marker.get('success'):raise SystemExit('Patch is not marked successful')
video_hash=sha(video)
if video_hash!=marker.get('videoSHA256'):raise SystemExit('Video checksum mismatch')
out=HERE/'encoded-review'/f'revision{plan["revision"]}-patch-{args.index}-{patch["start"]}-{patch["end"]}'
out.mkdir(parents=True,exist_ok=True)
frames=set(range(patch['start'],patch['end']+1,15))
for frame in [patch['start'],patch['end'],*patch['supportFrames']]:
    for offset in [-1,0,1]:
        if patch['start']<=frame+offset<=patch['end']:frames.add(frame+offset)
for frame in [4150,4151,4152,4153,4154,4155,5746,5747,5748,5749,5750,5751,6799,6800,6801,7788,7789,7790,6866,6975,7000,7020,7050,8023,8073,8110,11842,11887,11929,11972,12020,12090,12120,12165,12250,12363,12364,12365,12388,12418,12424,12448,12480,12519,16776,16896,16911,16942]:
    if patch['start']<=frame<=patch['end']:frames.add(frame)
frames=sorted(frames)
select='+'.join(f'eq(n\\,{frame-patch["start"]})' for frame in frames)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(video),'-vf',f'select={select}',
                '-vsync','0','-q:v','2',str(out/'encoded-%04d.jpg')],check=True)
files=sorted(out.glob('encoded-*.jpg'))
if len(files)!=len(frames):raise SystemExit('Decoded frame count mismatch')
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
contacts=[]
for page in range(math.ceil(len(frames)/12)):
    subset=list(zip(frames,files))[page*12:(page+1)*12]
    canvas=Image.new('RGB',(1920,math.ceil(len(subset)/3)*390),'#f2eee7');draw=ImageDraw.Draw(canvas)
    for i,(frame,file) in enumerate(subset):
        x=i%3*640;y=i//3*390
        with Image.open(file) as image:canvas.paste(image.resize((640,360),Image.Resampling.LANCZOS),(x,y))
        draw.text((x+10,y+364),f'F{frame} | {frame/30:.3f}s | encoded patch {args.index}',font=font,fill='#29484a')
    target=out/f'contact-{page+1}.jpg';canvas.save(target,quality=94,subsampling=0);contacts.append(str(target.relative_to(ROOT)))
report={'reviewCreatedAt':datetime.now(timezone.utc).isoformat(),'video':str(video.relative_to(ROOT)),
        'videoSHA256':video_hash,'frames':frames,'contacts':contacts,'status':'extracted-awaiting-visual-review'}
(out/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,indent=2))
