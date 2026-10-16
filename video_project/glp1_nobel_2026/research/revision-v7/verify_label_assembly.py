"""Verify exact-frame patch boundaries and unchanged sampled content after assembly."""
from pathlib import Path
import json,subprocess
import numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[2]
out=ROOT/'tmp/v7-corrected-qa';video=ROOT/'tmp/v7-final-corrected/GLP1_V7_1080p.mp4'
base=ROOT/'tmp/v7-encoded-qa/frames';frames=out/'frames'
result=json.loads((ROOT/'tmp/v7-final-corrected/result.json').read_text('utf8'))
rows=[]
for p in sorted(frames.glob('element-*.jpeg')):
 f=int(p.stem.split('-')[-1]);old=base/p.name
 a=np.asarray(Image.open(old)).astype(np.int16);b=np.asarray(Image.open(p)).astype(np.int16)
 d=np.abs(a-b);rows.append({'frame':f,'localRepairInterval':15115<=f<=15404,'meanAbsoluteRGBDifference':float(d.mean()),'fractionPixelsOver24':float((d.max(axis=2)>24).mean())})
unchanged=[x for x in rows if not x['localRepairInterval']]
assert len(rows)==269 and len(unchanged)==266
assert all(x['meanAbsoluteRGBDifference']<1.5 for x in unchanged),'Unexpected change outside local repair'
(out/'sample-correspondence.json').write_text(json.dumps({'videoSHA256':result['videoSHA256'],'baseVideoSHA256':result['assembly']['baseVideoSHA256'],'scope':'Same-frame image correspondence after local replacement; not a new whole-video aesthetic approval','unchangedSampleCount':len(unchanged),'maxUnchangedMeanAbsoluteRGBDifference':max(x['meanAbsoluteRGBDifference'] for x in unchanged),'rows':rows},ensure_ascii=False,indent=2),'utf8')
checks=[15112,15114,15115,15116,15118,15140,15200,15268,15360,15402,15404,15405,15406,15408]
bd=out/'boundaries';bd.mkdir(exist_ok=True)
for f in checks:
 p=bd/f'element-{f:05d}.png'
 subprocess.run(['ffmpeg','-hide_banner','-v','error','-ss',str(f/30),'-i',str(video),'-frames:v','1','-y',str(p)],check=True)
font=ImageFont.truetype('C:/Windows/Fonts/msyh.ttc',19)
for k in range(0,len(checks),6):
 ids=checks[k:k+6];sheet=Image.new('RGB',(1920,400*((len(ids)+2)//3)),'#f2eee7');d=ImageDraw.Draw(sheet)
 for j,f in enumerate(ids):
  im=Image.open(bd/f'element-{f:05d}.png').resize((640,360));sheet.paste(im,((j%3)*640,(j//3)*400+40));d.text(((j%3)*640+12,(j//3)*400+8),f'Frame {f} / {f/30:.3f}s',font=font,fill='#234c4a')
 sheet.save(bd/f'sheet-{k//6:02d}.jpg',quality=95)
print(json.dumps({'samples':len(rows),'unchangedSamples':len(unchanged),'maxDifference':max(x['meanAbsoluteRGBDifference'] for x in unchanged),'boundaries':checks},ensure_ascii=False))
