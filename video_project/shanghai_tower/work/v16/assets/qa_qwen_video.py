"""Decode all atmosphere frames, detect discontinuities and preserve provider provenance."""
import json, subprocess, hashlib, re
from pathlib import Path
import numpy as np
HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
VIDEO=ROOT/'public/v16/qwen-river-rise.mp4'
probe=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(VIDEO)]))
run=subprocess.run(['ffmpeg','-hide_banner','-i',str(VIDEO),'-vf','blackdetect=d=0.033:pix_th=.04:pic_th=.98','-an','-f','null','-'],capture_output=True,text=True)
raw=subprocess.check_output(['ffmpeg','-v','error','-i',str(VIDEO),'-vf','scale=160:90,format=gray','-f','rawvideo','-'])
frames=np.frombuffer(raw,dtype=np.uint8).reshape(-1,90,160).astype(np.float32)
diff=np.abs(np.diff(frames,axis=0)).mean(axis=(1,2));luma=frames.mean(axis=(1,2))
report={'asset':str(VIDEO.relative_to(ROOT)),'decodedFrames':len(frames),'dimensions':[probe['streams'][0]['width'],probe['streams'][0]['height']],'fps':probe['streams'][0]['r_frame_rate'],'duration':float(probe['format']['duration']),'decodeExitCode':run.returncode,'blackIntervals':re.findall(r'black_start:[^\r\n]+',run.stderr),'frameDifference':{'mean':float(diff.mean()),'p99':float(np.percentile(diff,99)),'max':float(diff.max()),'maxAtFrame':int(diff.argmax())+1},'luma':{'min':float(luma.min()),'max':float(luma.max())},'audioRemoved':not any(s['codec_type']=='audio' for s in probe['streams']),'visualReview':{'contactFrames':[0,30,60,90,120],'result':'Accepted as illustrative atmosphere only','observations':['Continuous smooth upward camera tilt with river ripples/reflections; no cuts or abrupt object pops in inspected frames.','Generated skyline proportions are approximate, especially Shanghai Tower crown; do not present as surveyed geometry or factual opening alignment.','Use lower half river texture or a short water-to-city transition, label illustrative when visible.']},'sha256':hashlib.sha256(VIDEO.read_bytes()).hexdigest()}
(HERE/'qwen-media-acceptance.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
state=json.loads((HERE/'qwen-video-task.json').read_text())
state['originalOutput']=state['output'];state['originalOutput']['path']='work/v16/assets/originals/qwen-river-rise-original.mp4'
state['output']={'path':str(VIDEO.relative_to(ROOT)),'bytes':VIDEO.stat().st_size,'sha256':report['sha256'],'processing':'Lossless H264 stream copy, muted and exactly 5.000 seconds; original 5.038s/AAC source preserved.'}
state['acceptance']='work/v16/assets/qwen-media-acceptance.json'
(HERE/'qwen-video-task.json').write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
