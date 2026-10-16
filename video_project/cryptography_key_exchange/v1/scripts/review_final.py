import json,subprocess
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];video=ROOT/'delivery/密码学_公开的传话_1080p.mp4';out=ROOT/'work/qa/encoded-frames';out.mkdir(parents=True,exist_ok=True)
d=json.loads((ROOT/'src/timeline-data.json').read_text(encoding='utf8'))
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',23)
def extract(frame):
 p=out/f'frame-{frame:05d}.jpg'
 r=subprocess.run(['ffmpeg','-v','error','-y','-ss',str(frame/30),'-i',str(video),'-frames:v','1','-vf','scale=640:360','-q:v','2',str(p)],capture_output=True)
 assert r.returncode==0,r.stderr
 return p
records=[]
for g in d['groups'][1:]:
 center=round(g['start']*30);frames=[center+k for k in [-90,-60,-30,0,30,60,90]]
 sheet=Image.new('RGB',(1280,4*396),'#e8ece3');draw=ImageDraw.Draw(sheet)
 for i,f in enumerate(frames):
  p=extract(f);im=Image.open(p);x=(i%2)*640;y=(i//2)*396;sheet.paste(im,(x,y));draw.text((x+15,y+364),f'{g["id"]} · {f/30:.2f}s · f{f}',font=font,fill='#173e43')
 dest=out/f'transition-{g["id"]}.jpg';sheet.save(dest,quality=92);records.append({'scene':g['id'],'frames':frames,'contactSheet':str(dest)})
frames=[round((c['startSec']+c['endSec'])*15) for c in d['cues']]
for page in range(3):
 subset=frames[page*12:(page+1)*12];sheet=Image.new('RGB',(1920,4*396),'#e8ece3');draw=ImageDraw.Draw(sheet)
 for i,f in enumerate(subset):
  p=extract(f);im=Image.open(p);x=(i%3)*640;y=(i//3)*396;sheet.paste(im,(x,y));draw.text((x+15,y+364),f'{d["cues"][page*12+i]["id"]} · {f/30:.2f}s',font=font,fill='#173e43')
 sheet.save(out/f'overview-{page+1}.jpg',quality=93)
(out/'frames.json').write_text(json.dumps(records,ensure_ascii=False,indent=2),encoding='utf8')
print('Encoded video: 7 boundary contact sheets and 3 narration overview sheets created')
