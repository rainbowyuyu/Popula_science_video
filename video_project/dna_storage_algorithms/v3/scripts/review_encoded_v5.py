"""Extract reproducible transition evidence from the encoded V5 master."""
from pathlib import Path
import subprocess,json
from PIL import Image,ImageDraw

root=Path(__file__).resolve().parents[1]
movie=root/'delivery/DNA存储_连续数据之旅_V5_1080p.mp4'
out=root/'work/encoded-v5-review';out.mkdir(parents=True,exist_ok=True)
narr=json.loads((root/'src/narration-v5.json').read_text(encoding='utf8'))
boundaries=[round(g['startSec']*30) for g in narr['groups'][1:]]+[round(narr['coda']['startSec']*30)]
offsets=[-90,-60,-30,0,30,60,90]
heroIds=['n01','n04','n06','n14','n19','n21','n24','n25','n27','n32','n35']
heroes=[round((c['startSec']+c['endSec'])/2*30) for cid in heroIds for c in narr['cues'] if c['id']==cid]+[narr['durationFrames']-45]
frames=sorted(set([b+o for b in boundaries for o in offsets]+heroes))
select='+'.join(f'eq(n,{f})' for f in frames)
subprocess.run(['ffmpeg','-v','error','-y','-i',str(movie),'-vf',f"select='{select}'",
    '-fps_mode','vfr','-q:v','2',str(out/'selected-%03d.jpg')],check=True)
for i,f in enumerate(frames,1):(out/f'selected-{i:03d}.jpg').replace(out/f'frame-{f:05d}.jpg')
for batch in range(4):
    sheet=Image.new('RGB',(2240,474),'#edf1ea');d=ImageDraw.Draw(sheet)
    for row,b in enumerate(boundaries[batch*2:batch*2+2]):
        for col,delta in enumerate(offsets):
            f=b+delta;im=Image.open(out/f'frame-{f:05d}.jpg').resize((320,180))
            x=320*col;y=237*row;sheet.paste(im,(x,y+34));d.text((x+8,y+12),f'{f/30:.2f}s  |  {f}',fill='#173e48')
    sheet.save(out/f'transitions-{batch+1}.jpg',quality=94)
sheet=Image.new('RGB',(1920,1544),'#edf1ea');d=ImageDraw.Draw(sheet)
for i,f in enumerate(heroes):
    x=i%3*640;y=i//3*386
    sheet.paste(Image.open(out/f'frame-{f:05d}.jpg').resize((640,360)),(x,y+26))
    d.text((x+10,y+8),f'{f/30:.2f}s  |  {f}',fill='#173e48')
sheet.save(out/'hero-contact.jpg',quality=94)
(out/'selection.json').write_text(json.dumps({'video':str(movie),'frames':frames,'boundaries':boundaries,'offsets':offsets,'heroFrames':heroes},indent=2),encoding='utf8')
print(f'Extracted {len(frames)} encoded frames, eight transitions and twelve hero views.')
