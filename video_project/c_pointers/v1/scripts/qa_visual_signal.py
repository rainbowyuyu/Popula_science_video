"""Low-resolution every-frame image-signal review; no claim of semantic QA."""
from pathlib import Path
import json, subprocess, argparse
import numpy as np
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--video',type=Path,default=ROOT/'output/C语言指针_从地址找到原件_1080p.mp4');a=p.parse_args()
q=subprocess.Popen(['ffmpeg','-v','error','-threads','2','-filter_threads','2','-i',str(a.video),'-an','-vf','scale=160:90','-pix_fmt','gray','-f','rawvideo','pipe:1'],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
size=160*90;prev=None;changes=[];means=[];deviations=[]
while True:
 b=q.stdout.read(size)
 if not b:break
 if len(b)!=size:raise RuntimeError('Incomplete frame')
 im=np.frombuffer(b,dtype=np.uint8).astype(np.float32);means.append(float(im.mean()));deviations.append(float(im.std()))
 if prev is not None:changes.append(float(np.mean(np.abs(im-prev))))
 prev=im
error=q.stderr.read().decode('utf8',errors='replace');code=q.wait()
n=json.loads((ROOT/'src/narration.json').read_text(encoding='utf8'));issues=[]
if code or len(means)!=n['durationFrames']:issues.append('decode/frame count')
blank=[i for i,(m,s) in enumerate(zip(means,deviations)) if m<4 or (m>245 and s<1)]
if blank:issues.append('possible blank frames')
order=np.argsort(changes)[::-1][:24]
report={'passed':not issues,'frames':len(means),'blankFrameCandidates':blank,'topFrameChanges':[{'frame':int(i+1),'timeSec':float((i+1)/30),'meanAbsoluteGrayDifference':changes[i]} for i in order], 'maximumDifference':max(changes),'medianDifference':float(np.median(changes)),'issues':issues,'decodeError':error,'limits':'160x90 grayscale signals. Outliers are review candidates, not proof of a cut or artifact; semantic and typography review is separate.'}
out=ROOT/'work/qa/visual-signal.json';out.write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({k:report[k] for k in ['passed','frames','maximumDifference','medianDifference','blankFrameCandidates','issues']}));assert not issues,issues
