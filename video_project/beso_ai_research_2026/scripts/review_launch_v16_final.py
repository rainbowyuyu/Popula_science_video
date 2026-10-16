"""Sample actual encoded delivery; records frame selections, not human playback."""
from pathlib import Path
from PIL import Image, ImageDraw
import subprocess,json,hashlib
ROOT=Path(__file__).resolve().parents[1]
VIDEO=ROOT/'output/ai_engineer_launch_v16_1080p60.mp4'
OUT=ROOT/'research/qa/v16-final-visual'
OUT.mkdir(parents=True,exist_ok=True)
scenes=[2,5,8,12.5,15.8,17,18.5,20.6,23.8,26.5,30.8,34,37.5,40.5,43.5,46,48,50.5,54,57.7,61,64,67,70.5,74.5,78,81,85.9,89.5,94,97,101,104]
cuts=[7,11,16.5,17,21,23,31.6,40,45.3,48.8,53,57.1,61.3,65,73.4,79,85.7,95]
groups={'scenes':scenes,'transitions':[round(t+offset,4) for t in cuts for offset in [-.25,0,.25]]}
for kind,times in groups.items():
    dest=OUT/kind;dest.mkdir(exist_ok=True)
    pictures=[]
    for t in times:
        frame=round(t*60);p=dest/f'frame-{frame:06d}.jpg'
        subprocess.run(['ffmpeg','-v','error','-y','-ss',f'{frame/60:.6f}','-i',str(VIDEO),'-frames:v','1','-q:v','2',str(p)],check=True)
        pictures.append((p,frame))
    for page in range((len(pictures)+11)//12):
        rows=pictures[page*12:(page+1)*12]
        sheet=Image.new('RGB',(1920,4*296),'#092c39');d=ImageDraw.Draw(sheet)
        for i,(p,frame) in enumerate(rows):
            im=Image.open(p).convert('RGB').resize((640,270),Image.Resampling.LANCZOS)
            x=(i%3)*640;y=(i//3)*296;sheet.paste(im,(x,y));d.text((x+12,y+275),f'{frame/60:.3f}s / frame {frame}',fill='white')
        sheet.save(OUT/f'{kind}-contact-{page+1}.jpg',quality=92)
record={'video':str(VIDEO),'sha256':hashlib.sha256(VIDEO.read_bytes()).hexdigest(),'frameGroups':groups,'method':'Decoded frames from final MP4, plus transition neighbours; contact sheets require separate visual inspection.','normalSpeedFullWatch':False,'humanListening':False}
(OUT/'sampling.json').write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({'frames':sum(map(len,groups.values())),'out':str(OUT)}))
