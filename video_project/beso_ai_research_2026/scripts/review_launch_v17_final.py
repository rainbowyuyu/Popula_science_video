"""Sample final encoded v17 MP4 at actual storyboard scenes and transitions.

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
ap.add_argument('--video',type=Path,default=ROOT/'output/ai_engineer_launch_v17_1080p60.mp4')
ap.add_argument('--story',type=Path,default=ROOT/'src/launch-v17-story.json')
ap.add_argument('--out',type=Path,default=ROOT/'research/qa/v17-final-visual')
args=ap.parse_args()
story=json.loads(args.story.read_text('utf-8-sig'))
assert story['fps']==60 and story['duration']==6300
out=args.out.resolve()
if not out.is_relative_to(ROOT) or not any('v17' in s for s in out.parts):
    raise ValueError('Review output must be a v17 directory within this project')
out.mkdir(parents=True,exist_ok=True)
scenes=[]
for scene in story['scenes']:
    start=scene['start'];duration=scene['duration']
    scenes.extend([start+min(90,duration-1),start+duration//2,start+duration-1])
transitions=[max(0,min(6299,s['start']+offset)) for s in story['scenes'][1:] for offset in [-24,-12,-1,0,12,24]]
groups={'scenes':sorted(set(scenes)),'transitions':sorted(set(transitions))}
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
record={'schema':'v17-final-frame-sampling-v1','video':str(args.video.resolve()),
        'sha256':hashlib.sha256(args.video.read_bytes()).hexdigest(),'storySHA256':hashlib.sha256(args.story.read_bytes()).hexdigest(),
        'frameGroups':groups,'method':'Decoded final MP4 frames selected from actual v17 story; separate visual review required.',
        'normalSpeedFullWatch':False,'humanListening':False,'aestheticAccepted':None}
(out/'sampling.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({'frames':sum(map(len,groups.values())),'out':str(out)}))
