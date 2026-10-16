"""Compare actual encoded Film04 motion samples against accepted pre-encode renders.
A numerical correspondence check, not an automatic aesthetic/collision approval.
"""
from pathlib import Path
import json,subprocess,argparse,hashlib
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
p=argparse.ArgumentParser();p.add_argument('--video',required=True);p.add_argument('--out',required=True);args=p.parse_args()
video=(ROOT/args.video).resolve();out=(ROOT/args.out).resolve();assert video.is_file() and out.is_relative_to(ROOT)
out.mkdir(parents=True,exist_ok=True)
preview=ROOT/'tmp/v7-motion-04'
source=json.loads((preview/'result.json').read_text('utf8'))
final=json.loads((ROOT/'tmp/v7-full-final/result.json').read_text('utf8'))
assert source['hashes']==final['hashes'],'Candidate and final source identities must match before image comparison'
frames=sorted(set(source['frames']))
fd=out/'frames';fd.mkdir(exist_ok=True);assert not list(fd.iterdir())
filt=out/'select.txt';filt.write_text("select='"+'+'.join(f'eq(n,{f})' for f in frames)+"'",'utf8')
subprocess.run(['ffmpeg','-hide_banner','-nostdin','-v','error','-xerror','-i',str(video),'-filter_script:v',str(filt),'-fps_mode','vfr',str(fd/'extract-%05d.png')],check=True)
files=sorted(fd.glob('extract-*.png'));assert len(files)==len(frames)
rows=[]
for frame,path in zip(frames,files):
 target=fd/f'element-{frame:05d}.png';path.rename(target)
 ref=preview/'frames'/f'element-{frame:05d}.jpeg'
 a=np.asarray(Image.open(ref).convert('RGB')).astype(np.int16)
 b=np.asarray(Image.open(target).convert('RGB')).astype(np.int16)
 assert a.shape==b.shape==(1080,1920,3)
 d=np.abs(a-b);rows.append({'frame':frame,'seconds':frame/30,'meanAbsoluteRGBDifference':round(float(d.mean()),5),'fractionOfPixelsWithChannelDifferenceOver24':round(float((d.max(axis=2)>24).mean()),6)})
rows.sort(key=lambda x:x['meanAbsoluteRGBDifference'],reverse=True)
r={'scope':'Encoded image correspondence to accepted Film04 candidate, not whole-film manual visual approval','videoSHA256':final['videoSHA256'],'sourceIdentityMatch':True,'sampleCount':len(rows),'worstMeanAbsoluteRGBDifference':rows[0]['meanAbsoluteRGBDifference'],'rows':rows}
(out/'comparison.json').write_text(json.dumps(r,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({k:v for k,v in r.items() if k!='rows'},ensure_ascii=False));print(json.dumps(rows[:10],indent=2))
