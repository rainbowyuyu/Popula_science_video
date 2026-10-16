"""Actual encoded preview samples. Creating sheets does not confer approval."""
from pathlib import Path
import json,subprocess,hashlib
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(json.loads((ROOT/'work/output-root-v10.json').read_text('utf8'))['outputRoot'])
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',19)
records=[]
for name,start,end in [('spectrum',2250,3500),('many',4130,4550)]:
    movie=OUT/f'work/preview-{name}-v10.mp4'
    folder=OUT/f'work/review-{name}-preview-v10';folder.mkdir(exist_ok=True)
    frames=list(range(0,end-start+1,30))
    if frames[-1]!=end-start:frames.append(end-start)
    selection='+'.join(f'eq(n,{f})' for f in frames)
    subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(movie),'-vf',f"select='{selection}',scale=640:360",'-fps_mode','vfr','-q:v','2',str(folder/'frame-%03d.jpg')],check=True)
    files=[folder/f'frame-{i+1:03d}.jpg' for i in range(len(frames))]
    pages=[]
    for offset in range(0,len(files),9):
        group=files[offset:offset+9];sheet=Image.new('RGB',(1920,395*((len(group)+2)//3)),'#e8eeeb');draw=ImageDraw.Draw(sheet)
        for j,p in enumerate(group):
            with Image.open(p) as im:sheet.paste(im,(j%3*640,j//3*395))
            frame=start+frames[offset+j];draw.text((j%3*640+12,j//3*395+365),f'{name} / global {frame} / {frame/30:.3f}s',font=font,fill='#193c43')
        path=folder/f'contact-{offset//9+1:02d}.jpg';sheet.save(path,quality=96);pages.append(str(path))
    records.append({'movie':str(movie),'sha256':hashlib.sha256(movie.read_bytes()).hexdigest(),'globalStart':start,'globalEndInclusive':end,'sampledGlobalFrames':[start+f for f in frames],'pages':pages})
(ROOT/'research/qa-v10/new-spectrum-preview-contract-v10.json').write_text(json.dumps({'version':'V10','scope':'Every one second of actual continuous rendered preview, including endpoints; not subjective playback.','clips':records},ensure_ascii=False,indent=2),'utf8')
print(json.dumps(records,ensure_ascii=False))
