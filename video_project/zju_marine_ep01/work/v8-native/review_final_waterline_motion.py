"""Read-only final encoded clips. Saves frames and reports; never edits input."""
import hashlib,json,subprocess
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont

video=Path('C:/Users/zju/Videos/rainbow-marine-ep01-v8/release/marine_energy_episode01_v8_final.mp4')
out=video.parent/'qa-final-review';out.mkdir(parents=True,exist_ok=True)
font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',20)
groups=[('entry-1',424,432,428),('exit-1',707,715,711),('entry-2',8422,8430,8426),('exit-2',9067,9075,9071),('browser-drop-check',7343,7348,None)]
rows=[]
for name,start,end,center in groups:
 folder=out/name;folder.mkdir(exist_ok=True)
 base=start//30;lo=start-base*30;hi=end-base*30
 # Integer-second accurate input seek, then select by decoded frame offset.
 # showinfo provides original post-seek PTS so the output indices are checked.
 cmd=['ffmpeg','-hide_banner','-nostdin','-y','-ss',str(base),'-i',str(video),'-an','-vf',f'select=between(n\\,{lo}\\,{hi}),showinfo','-frames:v',str(end-start+1),'-fps_mode','passthrough',str(folder/'frame-%02d.png')]
 p=subprocess.run(cmd,capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
 (folder/'decode.log').write_text(p.stderr,encoding='utf8')
 import re
 pts=[float(x) for x in re.findall(r'\bn:\s*\d+.*?\bpts_time:([\d.e+-]+)',p.stderr)]
 files=sorted(folder.glob('frame-*.png'))
 if len(files)!=end-start+1 or len(pts)!=len(files):raise ValueError((name,len(files),pts))
 expected=[f/30 for f in range(start,end+1)];actual=[base+t for t in pts]
 errors=[abs(a-b) for a,b in zip(actual,expected)]
 if max(errors)>1e-4:raise ValueError(('PTS/seek mismatch',name,actual,expected))
 board=Image.new('RGB',(1920,390*((len(files)+2)//3)),'#e6eeef');draw=ImageDraw.Draw(board)
 frames=[];prev=None
 for i,file in enumerate(files):
  im=Image.open(file).convert('RGB');pixels=np.asarray(im);roi=pixels[150:930,20:1900];digest=hashlib.sha256(roi.tobytes()).hexdigest()
  delta=None if prev is None else float(np.abs(roi.astype(np.float32)-prev.astype(np.float32)).mean())
  x=(i%3)*640;y=(i//3)*390;board.paste(im.resize((640,360)),(x,y));draw.text((x+10,y+365),f'{name} | frame {start+i} | {expected[i]:.6f}s',font=font,fill='#173c4b')
  frames.append({'frame':start+i,'ptsSeconds':actual[i],'expectedSeconds':expected[i],'ptsErrorSeconds':errors[i],'file':str(file),'fileSHA256':hashlib.sha256(file.read_bytes()).hexdigest(),'mainImageSHA256':digest,'adjacentMeanAbsoluteDifference':delta})
  prev=roi
 sheet=out/(name+'.jpg');board.save(sheet,quality=95)
 duplicates=[frames[i]['frame'] for i in range(1,len(frames)) if frames[i]['mainImageSHA256']==frames[i-1]['mainImageSHA256']]
 returns=[{'frame':f['frame'],'returnedTo':q['frame']} for i,f in enumerate(frames) for q in frames[:max(0,i-1)] if f['mainImageSHA256']==q['mainImageSHA256']]
 rows.append({'group':name,'startFrame':start,'endFrame':end,'crossingFrame':center,'contactsheet':str(sheet),'frames':frames,'ptsUniformWithinTolerance':max(errors)<1e-4,'exactDuplicateFrames':duplicates,'exactReturns':returns,'visualReviewed':False})
report={'schema':'marine-waterline-motion-final-review-v8','video':str(video),'videoBytes':video.stat().st_size,'videoSHA256':hashlib.sha256(video.read_bytes()).hexdigest(),'groups':rows,'browserPlaybackIssue':{'startSeconds':244.8,'endSeconds':244.9,'reportedDroppedFrames':2,'retained':True,'note':'Browser playback reported two dropped frames during concurrent CPU decoding. This report checks file frames separately and does not erase or reinterpret that browser result.'},'limitations':['Read-only decoded frame/contactsheet analysis, not continuous normal-speed playback.','No full-film audit was rerun; only five requested intervals were decoded.','Visual review must be recorded after opening all contactsheets.']}
(out/'waterline-motion-review.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps({'report':str(out/'waterline-motion-review.json'),'sheets':[r['contactsheet'] for r in rows],'allPtsPass':all(r['ptsUniformWithinTolerance'] for r in rows),'duplicates':sum(len(r['exactDuplicateFrames']) for r in rows)},indent=2))
