from pathlib import Path
import argparse,json,subprocess,math
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
a=argparse.ArgumentParser();a.add_argument('video');a.add_argument('--outdir',required=True);args=a.parse_args()
out=Path(args.outdir);out.mkdir(parents=True,exist_ok=True)
s=json.loads((ROOT/'src/story.json').read_text(encoding='utf-8'));imm=json.loads((ROOT/'work/webgpu-v7/immersion-timeline-native.json').read_text(encoding='utf-8'))
marks=set(range(0,math.floor(s['audio']['actualDuration']),12))
marks.update([7.7,9,10.5,12,14,15,16,17,18,19,20,36.8,40.8,45.5,49.8,54.5,59.5,63.5,69,253.8,267.7,304,311,319,360.6,362.1,366.5])
for e in imm['crossings']:
 for d in [-.4,-.133,0,.133,.4]:marks.add(e['time']+d)
for c in s['scenes'][1:]:
 for d in [-.1,.1]:marks.add(c['start']+d)
rows=[];font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18)
for i,t in enumerate(sorted(marks)):
 p=out/f'frame-{round(t*30):05d}.jpg'
 subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-ss',str(t),'-i',args.video,'-frames:v','1','-vf','scale=640:360','-q:v','2',str(p)],check=True)
 rows.append({'time':round(t,4),'frame':round(t*30),'path':p.name})
for page in range(math.ceil(len(rows)/9)):
 subset=rows[page*9:page*9+9];board=Image.new('RGB',(1920,1170),'#eaf0ef');d=ImageDraw.Draw(board)
 for j,row in enumerate(subset):
  x=(j%3)*640;y=(j//3)*390;im=Image.open(out/row['path']);board.paste(im,(x,y));d.text((x+10,y+365),f"{row['time']:.3f}s  /  frame {row['frame']}",font=font,fill='#123c4b')
 board.save(out/f'contact-{page+1:02d}.jpg',quality=92)
(out/'sample-manifest.json').write_text(json.dumps({'video':args.video,'samples':rows,'normalSpeedViewing':False},indent=2),encoding='utf-8')
print('Extracted',len(rows),'frames /',math.ceil(len(rows)/9),'contact pages')
