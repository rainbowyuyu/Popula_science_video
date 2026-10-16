"""Inspect the encoded opening and its IDR splice in a compact contact sheet."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import subprocess
import json
import hashlib
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/revision-v20/visual-qa'
OUT.mkdir(parents=True, exist_ok=True)
VIDEO = ROOT / 'publish/video/一顿饭后_身体在忙什么_V20_1080p.mp4'
FRAMES = [0, 12, 30, 72, 150, 210, 270, 296, 297, 310, 480, 498, 499, 500, 501, 510]

def one(frame):
    path = OUT / f'frame-{frame:05d}.jpg'
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-ss',f'{frame/30:.9f}',
                    '-i',str(VIDEO),'-frames:v','1','-q:v','2',str(path)], check=True)
    return path

with ThreadPoolExecutor(max_workers=4) as pool:
    images = list(pool.map(one,FRAMES))
sheet = Image.new('RGB',(1920,1208),'#ece9e1')
draw = ImageDraw.Draw(sheet)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf',22)
for i,(frame,path) in enumerate(zip(FRAMES,images)):
    im = Image.open(path).resize((480,270),Image.Resampling.LANCZOS)
    x,y=(i%4)*480,(i//4)*302
    sheet.paste(im,(x,y+32))
    draw.text((x+10,y+4),f'F{frame}  {frame/30:.3f}s',fill='#233c38',font=font)
sheet.save(OUT/'opening-and-join.jpg',quality=95)

subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(VIDEO),'-t','20',
                '-map','0:v:0','-map','0:a:0','-c:v','libx264','-crf','18','-preset','fast',
                '-c:a','aac','-b:a','256k','-movflags','+faststart',str(OUT/'opening-review-20s.mp4')],check=True)
(OUT/'sample-manifest.json').write_text(json.dumps({
    'video':str(VIDEO.relative_to(ROOT)),
    'sha256':hashlib.sha256(VIDEO.read_bytes()).hexdigest(),
    'frames':FRAMES,
    'purpose':'Opening text and caption layout; F296/297 heading handoff; F499/500 video splice.',
    'fullPlaybackPerformed':False,
},ensure_ascii=False,indent=2),encoding='utf8')
print('Encoded opening and join samples ready.')
