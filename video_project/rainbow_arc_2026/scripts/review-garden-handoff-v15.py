from pathlib import Path
import subprocess,json,hashlib
import numpy as np
from PIL import Image,ImageDraw,ImageFont
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'research/v15/environment/review';video=OUT/'garden-handoff-film-420-830-v15.mp4';decoded=OUT/'handoff-decoded'
frames=sorted(decoded.glob('frame-*.jpg'));font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',20)
for part in range((len(frames)+11)//12):
    c=Image.new('RGB',(1920,1540),'#ebefea');d=ImageDraw.Draw(c)
    for i,p in enumerate(frames[part*12:(part+1)*12]):
        index=int(p.stem.split('-')[-1])-1;film=420+index*5;x=(i%3)*640;y=(i//3)*385
        c.paste(Image.open(p).resize((640,360)),(x,y));d.text((x+8,y+362),f'Film frame {film}',font=font,fill='#17353d')
    c.save(OUT/f'handoff-contact-{part+1:02d}.jpg',quality=95)
raw=subprocess.check_output(['C:/ffmpeg/bin/ffmpeg.exe','-v','error','-i',str(video),'-vf','scale=160:90','-f','rawvideo','-pix_fmt','rgb24','pipe:1'])
a=np.frombuffer(raw,dtype=np.uint8).reshape(-1,90,160,3).astype(np.float32);diff=np.mean(np.abs(np.diff(a,axis=0)),axis=(1,2,3))/255
lum=np.mean(a,axis=(1,2,3))/255;median=float(np.median(diff));peak=np.argsort(diff)[-12:][::-1]
report={'version':'V15','scope':'Decoded actual 420-830 film preview; low-resolution consecutive-frame metrics plus 83 full-resolution every5frame JPEG samples. No full-film or audio approval.','videoSHA256':hashlib.sha256(video.read_bytes()).hexdigest(),'framesDecoded':len(a),'durationSeconds':len(a)/30,'blackFrames':int(np.sum(lum<.02)),'identicalConsecutiveFrames':int(np.sum(diff==0)),'medianMAD':median,'maxMAD':float(diff.max()),'largestDifferences':[{'filmFrame':int(i)+421,'MAD':float(diff[i])} for i in peak],'fullResolutionSamples':len(frames),'contactSheets':7,'visualReviewPending':True}
(OUT/'garden-handoff-decoded-review-v15.json').write_text(json.dumps(report,indent=2),encoding='utf-8');print(json.dumps(report))
