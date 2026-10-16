from pathlib import Path
from datetime import datetime, timezone
import argparse, json, hashlib, subprocess, shutil
import numpy as np
from PIL import Image, ImageDraw, ImageFont

root=Path(__file__).resolve().parents[3]
parser=argparse.ArgumentParser();parser.add_argument('kind',choices=['main','vertical']);args=parser.parse_args()
vertical=args.kind=='vertical'
base=root/'work/v16/finishing'/args.kind
plan=json.loads((base/'plan.json').read_text(encoding='utf-8-sig'))
proof=json.loads((base/'assembly-proof.json').read_text(encoding='utf-8-sig'))
assert proof['passed']
video=Path(proof['output']);baseline=Path(plan['baseline'])
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
assert sha(video)==proof['outputSHA256']
frames=sorted(set(f for a,b in plan['envelopes'] for f in [a-1,a,b,b+1] if 0<=f<plan['durationFrames']))
out=root/'research/qa/v16'/f'{args.kind}-patch-boundaries';out.mkdir(parents=True,exist_ok=True)
filter='select='+ '+'.join(f'eq(n\\,{f})' for f in frames)
for name,path in [('final',video),('baseline',baseline)]:
    folder=out/name;folder.mkdir(exist_ok=True)
    command=['ffmpeg','-hide_banner','-nostats','-v','error','-y','-i',str(path),'-map','0:v:0','-an','-vf',filter,'-fps_mode','vfr','-start_number','0',str(folder/'selected-%03d.png')]
    result=subprocess.run(command,capture_output=True,text=True)
    assert result.returncode==0,result.stderr
    (out/f'{name}-extract.command.json').write_text(json.dumps(command,indent=2),encoding='utf-8')
    for i,f in enumerate(frames):
        (folder/f'selected-{i:03d}.png').replace(folder/f'frame-{f:05d}.png')
W,H=(270,480) if vertical else (640,360)
font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',18)
contacts=[]
for page in range(0,len(frames),8):
    group=frames[page:page+8];cols=4 if vertical else 2;rows=(len(group)+cols-1)//cols
    sheet=Image.new('RGB',(cols*W,rows*(H+30)),'#172229');draw=ImageDraw.Draw(sheet)
    for i,f in enumerate(group):
        image=Image.open(out/'final'/f'frame-{f:05d}.png').convert('RGB').resize((W,H),Image.Resampling.LANCZOS)
        x,y=(i%cols)*W,(i//cols)*(H+30);sheet.paste(image,(x,y));draw.text((x+8,y+H+5),f'FINAL F{f}',font=font,fill='white')
    path=out/f'contact-{page//8+1:02d}.jpg';sheet.save(path,quality=94)
    contacts.append({'path':str(path),'sha256':sha(path),'frames':group})
comparisons=[]
for f in frames:
    final=np.asarray(Image.open(out/'final'/f'frame-{f:05d}.png')).astype(np.int16)
    old=np.asarray(Image.open(out/'baseline'/f'frame-{f:05d}.png')).astype(np.int16)
    delta=np.abs(final-old)
    comparisons.append({'frame':f,'meanAbsRGB_0_255':float(delta.mean()),'p99AbsRGB':float(np.percentile(delta,99)),'fractionChannelsDifferenceAbove16':float((delta>16).mean()),'finalFrameSHA256':sha(out/'final'/f'frame-{f:05d}.png')})
report={'schema':'rainbow.patch-boundary-inspection/1','generatedUTC':datetime.now(timezone.utc).isoformat(),'kind':args.kind,'video':str(video),'videoSHA256':proof['outputSHA256'],'baselineSHA256':plan['baselineSHA256'],'envelopesInclusive':plan['envelopes'],'frames':frames,'comparisonsToSameBaselineFrames':comparisons,'contacts':contacts,'manuallyViewed':False,'scope':'Same-frame decoded RGB comparison locates first-seek differences near patch boundaries; figures are descriptive, not an automatic aesthetic or motion acceptance.'}
(out/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
print(json.dumps({'out':str(out),'contacts':contacts,'comparisons':comparisons},indent=2))
