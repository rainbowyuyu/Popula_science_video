"""Sample final encoded v19 MP4 at actual storyboard scenes and transitions.

Contact sheets and frame groups are review evidence, not automatic aesthetic
approval or a claim that a human watched/listened to the full film.
"""
from pathlib import Path
from PIL import Image, ImageDraw
import argparse
import hashlib
import json
import subprocess

ROOT=Path(__file__).resolve().parents[1]
ap=argparse.ArgumentParser(description=__doc__)
ap.add_argument('--video',type=Path,default=ROOT/'output/ai_engineer_launch_v19_1080p60.mp4')
ap.add_argument('--story',type=Path,default=ROOT/'src/launch-v19-story.json')
ap.add_argument('--out',type=Path,default=ROOT/'research/qa/v19-final-visual')
ap.add_argument('--frames',default='',help='Comma-separated additional exact frame numbers; a separate custom group is rendered.')
ap.add_argument('--extra-frames',default='',help='Additional exact frame numbers for implementation-specific events.')
ap.add_argument('--transition-seconds',default='',help='Actual camera/material transition centers in seconds, sampled at ±24, ±12, -1, 0 frames.')
args=ap.parse_args()
story=json.loads(args.story.read_text('utf-8-sig'))
assert story['fps']==60 and 3600 <= story['duration'] < 7200
lastFrame=story['duration']-1
seconds=story['duration']/story['fps']
out=args.out.resolve()
if not out.is_relative_to(ROOT) or not any('v19' in s for s in out.parts):
    raise ValueError('Review output must be a v19 directory within this project')
if any(__import__('re').search(r'(?:^|[_-])v(?:[1-9]|1[0-8])(?:[_-]|$)',s) for s in out.parts):
    raise ValueError('Earlier version review artifacts are protected')
out.mkdir(parents=True,exist_ok=True)
scenes=[0,lastFrame]
for scene in story['scenes']:
    start=scene['start'];duration=scene['duration']
    scenes.extend([start+min(90,duration-1),start+duration//2,start+duration-1])
transitions=[max(0,min(lastFrame,s['start']+offset)) for s in story['scenes'][1:] for offset in [-24,-12,-1,0,12,24]]
if args.transition_seconds:
    centers=[float(s) for s in args.transition_seconds.split(',')]
    if not all(__import__('math').isfinite(s) and 0<=s<seconds for s in centers):
        raise ValueError(f'Transition seconds must be finite within [0, {seconds})')
    transitions.extend(max(0,min(lastFrame,round(s*60)+offset)) for s in centers for offset in [-24,-12,-1,0,12,24])
groups={'scenes':sorted(set(scenes)),'transitions':sorted(set(transitions))}
custom=[]
for raw in (args.frames,args.extra_frames):
    if not raw:continue
    if not __import__('re').fullmatch(r'\d+(?:,\d+)*',raw):
        raise ValueError('Frame lists must be comma-separated nonnegative integers')
    custom.extend(int(v) for v in raw.split(','))
if any(f<0 or f>=story['duration'] for f in custom):raise ValueError('Custom frame out of bounds')
if custom:groups['custom']=sorted(set(custom))
for kind,frames in groups.items():
    dest=out/kind;dest.mkdir(exist_ok=True)
    pictures=[]
    for frame in frames:
        p=dest/f'frame-{frame:06d}.jpg'
        subprocess.run(['ffmpeg','-v','error','-y','-ss',f'{frame/60:.6f}','-i',str(args.video),'-frames:v','1','-q:v','2',str(p)],check=True)
        pictures.append((p,frame))
    for page in range((len(pictures)+11)//12):
        rows=pictures[page*12:(page+1)*12]
        sheet=Image.new('RGB',(1920,1544),'#173c49');draw=ImageDraw.Draw(sheet)
        for i,(p,frame) in enumerate(rows):
            im=Image.open(p).convert('RGB').resize((640,360),Image.Resampling.LANCZOS)
            x=(i%3)*640;y=(i//3)*386;sheet.paste(im,(x,y))
            draw.text((x+12,y+365),f'{frame/60:.3f}s / frame {frame}',fill='white')
        sheet.save(out/f'{kind}-contact-{page+1}.jpg',quality=93)
record={'schema':'v19-final-frame-sampling-v1','video':str(args.video.resolve()),
        'sha256':hashlib.sha256(args.video.read_bytes()).hexdigest(),'storySHA256':hashlib.sha256(args.story.read_bytes()).hexdigest(),
        'frameGroups':groups,'method':'Decoded final MP4 frames selected from actual v19 story; separate visual review required.',
        'actualTransitionSeconds':args.transition_seconds,'contactSheetImageSize':[640,360],
        'normalSpeedFullWatch':False,'humanListening':False,'aestheticAccepted':None}
(out/'sampling.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({'frames':sum(map(len,groups.values())),'out':str(out)}))
