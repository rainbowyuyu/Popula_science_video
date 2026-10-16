from pathlib import Path
import subprocess,json
from PIL import Image,ImageDraw
from concurrent.futures import ThreadPoolExecutor

ROOT=Path(__file__).resolve().parents[2]
OUT=Path(__file__).resolve().parent
VIDEO=ROOT/'output-v16/delivery/彩虹为什么是弧形_V17_fish-pool_1080p.mp4'
OUT.mkdir(parents=True,exist_ok=True)
groups={
 'overview':[i*10 for i in range(36)]+[353,355],
 'gaussian':[10,11,12,13,14,14.97,15,15.1,16,18,20,22,24,25,26,27],
 'macro':[37,40,50,60,70,80,90,100,110,120,130,140,150,160,165,172],
 'world':[174,185,200,215,230,245,255,260,265,266.8,270,275,280,285],
 'return':[302,308,315,320,326,332,337,342,346,350,352,354],
}
bridges=[('painted',10,15),('garden_drop',27,37),('drop_world',4990/30,5140/30),('world_secondary',286,291),('secondary_world',8900/30,9050/30),('fountain_painted',10402/30,10552/30)]
for name,start,end in bridges:
 groups[name]=[start-.1,start-1/30,start,start+.1,start+.5,start+1,(start+end)/2,end-1,end-.5,end-.1,end-1/30,end,end+.1,end+.5,end+1]

def frame(t):
 path=OUT/f't{t:08.3f}.jpg'
 if not path.exists():
  subprocess.run(['ffmpeg','-v','error','-ss',str(t),'-i',str(VIDEO),'-frames:v','1','-q:v','2','-y',str(path)],check=True)
 return path
times=sorted(set(round(t,4) for seq in groups.values() for t in seq))
with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(frame,times))
for name,times in groups.items():
 cols=4;cw=480;ch=292
 img=Image.new('RGB',(cols*cw,((len(times)+cols-1)//cols)*ch),'#e8eeee')
 draw=ImageDraw.Draw(img)
 for i,t in enumerate(times):
  x=(i%cols)*cw;y=(i//cols)*ch
  tile=Image.open(frame(round(t,4)));tile.thumbnail((cw,270))
  img.paste(tile,(x,y+22));draw.text((x+8,y+4),f'{name} | {t:.3f}s',fill='#18333a')
 img.save(OUT/f'contact-{name}.jpg',quality=93)
(OUT/'frame-groups.json').write_text(json.dumps(groups,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'groups':list(groups),'uniqueFrames':len(times),'output':str(OUT)},ensure_ascii=False))
