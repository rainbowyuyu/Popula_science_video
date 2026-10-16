"""Make time-ordered 10-fps filmstrips from the final transition review reel."""
from pathlib import Path
import json,subprocess
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/metro/qa-final'
TMP=ROOT/'tmp/metro/transition-grid'
TMP.mkdir(parents=True,exist_ok=True)
subprocess.run(['C:/ffmpeg/bin/ffmpeg.exe','-hide_banner','-v','error','-nostdin','-y','-threads','2','-i',str(OUT/'transition-review.mp4'),'-an','-vf','select=not(mod(n\\,3)),scale=320:180','-filter_threads','2','-fps_mode','vfr','-q:v','3',str(TMP/'%04d.jpg')],check=True)
qa=json.loads((ROOT/'research/metro/final-media-qa.json').read_text('utf-8'))
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',19)
files=[]
for i,seg in enumerate(qa['transitionReel']['segments']):
    canvas=Image.new('RGB',(2560,1070),'#102231');draw=ImageDraw.Draw(canvas)
    draw.text((12,10),seg['previousScene']+' -> '+seg['nextScene']+' | 0.1-second steps, left to right',font=font,fill='white')
    for j in range(40):
        x=(j%8)*320;y=45+(j//8)*205
        with Image.open(TMP/f'{i*40+j+1:04d}.jpg') as im:canvas.paste(im,(x,y))
        frame=seg['sourceFirstFrame']+j*3
        draw.text((x+5,y+182),f'{frame}  / {frame/30:.2f}s',font=font,fill='#b4cbd1')
    p=OUT/f'transition-filmstrip-{i+1:02d}.jpg';canvas.save(p,quality=92,subsampling=0);files.append(p.relative_to(ROOT).as_posix())
(ROOT/'research/metro/transition-filmstrips.json').write_text(json.dumps({'source':'output/metro/qa-final/transition-review.mp4','sampleStepFrames':3,'sampleFrames':480,'sheets':files,'scope':'Time-ordered samples; not a claim of complete subjective playback or listening.'},indent=2),encoding='utf-8')
print(json.dumps({'sheets':len(files),'sampleFrames':480}))
