from pathlib import Path
import argparse,json,subprocess,hashlib
from PIL import Image,ImageDraw,ImageFont
ap=argparse.ArgumentParser();ap.add_argument('video',type=Path);ap.add_argument('--out',type=Path,required=True);a=ap.parse_args();a.out.mkdir(parents=True,exist_ok=True)
centers=[1020,1951,4700,7641,9360,10771,1075,1206,1341,1475,1608,1741,1890,4853,6150,10200,10560]
frames=sorted(set(f for c in centers for f in [c-1,c,c+1]));select='+'.join('eq(n\\,%s)'%f for f in frames)
subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-nostdin','-y','-i',str(a.video),'-an','-vf','select='+select+',scale=640:360','-fps_mode','passthrough','-q:v','2',str(a.out/'frame-%03d.jpg')],check=True)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',18);records=[]
for idx,f in enumerate(frames):records.append({'frame':f,'time':f/30,'file':'frame-%03d.jpg'%(idx+1)})
for p in range((len(records)+8)//9):
    board=Image.new('RGB',(1920,1170),'#eaf0ef');d=ImageDraw.Draw(board)
    for j,r in enumerate(records[p*9:p*9+9]):
        x=(j%3)*640;y=(j//3)*390;board.paste(Image.open(a.out/r['file']),(x,y));d.text((x+10,y+363),f"frame {r['frame']} / {r['time']:.3f}s",font=font,fill='#163b48')
    board.save(a.out/('seam-contact-%02d.jpg'%(p+1)),quality=92)
(a.out/'manifest.json').write_text(json.dumps({'video':str(a.video),'samples':records,'scope':'Actual decoded adjacent frames, requires visual inspection.'},indent=2),encoding='utf8')
print(len(records),'frames',len(centers),'key locations')
