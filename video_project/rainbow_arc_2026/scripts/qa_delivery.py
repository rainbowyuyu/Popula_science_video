"""Validate the encoded delivery; reports only checks actually performed."""
from pathlib import Path
import json, subprocess, hashlib, re

ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'research/qa'; QA.mkdir(exist_ok=True,parents=True)
VIDEO=ROOT/'delivery/雨后的一道弧_彩虹为什么是弧形_V05_1080p.mp4'
TIMELINE=json.loads((ROOT/'src/timeline.json').read_text(encoding='utf8'))
def run(args):
    p=subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace')
    if p.returncode: raise RuntimeError(p.stderr[-5000:])
    return p

probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(VIDEO)]).stdout)
v=next(s for s in probe['streams'] if s['codec_type']=='video')
a=next(s for s in probe['streams'] if s['codec_type']=='audio')
expected=TIMELINE['duration']/TIMELINE['fps']
assert v['width']==1920 and v['height']==1080
assert v['r_frame_rate']=='30/1' and int(v['nb_frames'])==TIMELINE['duration']
assert abs(float(probe['format']['duration'])-expected)<.08
run(['ffmpeg','-hide_banner','-v','error','-xerror','-i',str(VIDEO),'-f','null','-'])
analysis=run(['ffmpeg','-hide_banner','-i',str(VIDEO),'-vf','blackdetect=d=0.08:pic_th=0.98:pix_th=0.03','-af','silencedetect=n=-50dB:d=1.5,loudnorm=I=-15:TP=-1:LRA=9:print_format=json','-f','null','-']).stderr
(QA/'encoded-av-analysis.log').write_text(analysis,encoding='utf8')
loud=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',analysis)[-1])
black=re.findall(r'black_start:([^\n]+)',analysis)
silence=re.findall(r'silence_(?:start|end):[^\n]+',analysis)
changed=[]
lock=json.loads((QA/'render-source-lock-v05.json').read_text(encoding='utf8'))
for rel,meta in lock['files'].items():
 if hashlib.sha256((ROOT/rel).read_bytes()).hexdigest()!=meta['sha256']:changed.append(rel)
assert not changed, changed
report={'video':str(VIDEO.relative_to(ROOT)),'durationSeconds':float(probe['format']['duration']),'expectedSeconds':expected,'frames':int(v['nb_frames']),'resolution':[v['width'],v['height']],'fps':v['r_frame_rate'],'codec':v['codec_name'],'pixelFormat':v['pix_fmt'],'audioCodec':a['codec_name'],'audioSampleRate':a['sample_rate'],'audioChannels':a['channels'],'fullDecodePassed':True,'integratedLUFS':float(loud['input_i']),'truePeakDbTP':float(loud['input_tp']),'loudnessRangeLU':float(loud['input_lra']),'blackSegments':black,'silenceSegmentsOver1_5s':silence,'sourceLockUnchanged':not changed,'sha256':hashlib.sha256(VIDEO.read_bytes()).hexdigest(),'bytes':VIDEO.stat().st_size,'fullSubjectivePlaybackClaimed':False}
(QA/'delivery-qa.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
print(json.dumps(report,ensure_ascii=False,indent=2))
assert not black, black
assert -17<=report['integratedLUFS']<=-13
assert report['truePeakDbTP']<=-1.0

# Extract final encoded frames: every narration beat plus all scene seams.
frames={max(0,min(TIMELINE['duration']-1,round((c['start']+c['duration']*.55)*30))) for c in TIMELINE['clips']}
for s in TIMELINE['scenes']:
 for dt in [-.35,0,.35,1.5]:frames.add(max(0,min(TIMELINE['duration']-1,round((s['start']+dt)*30))))
for clip in TIMELINE['clips']:
 if clip['id'] in ['r007','r019','r032','r034','r039','r041']:
  for step in range(-3,9):frames.add(max(0,min(TIMELINE['duration']-1,round((clip['start']+step*.5)*30))))
frames.update([0,TIMELINE['duration']-1])
frames=sorted(frames);folder=QA/'encoded-frames';folder.mkdir(exist_ok=True)
selection='+'.join(f'eq(n,{f})' for f in frames)
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(VIDEO),'-vf',f"select='{selection}',scale=1280:720",'-fps_mode','vfr','-q:v','2',str(folder/'shot-%03d.jpg')])
for i,f in enumerate(frames,1):
 p=folder/f'shot-{i:03}.jpg'
 if p.exists():p.replace(folder/f'frame-{f:05}.jpg')
(QA/'encoded-frames.json').write_text(json.dumps({'frames':frames,'sourceVideoSHA256':report['sha256']},indent=2),encoding='utf8')
