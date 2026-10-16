"""Checks the actual final V06 encode. Does not claim human playback/listening."""
from pathlib import Path
import json,subprocess,re,hashlib
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'research/qa';QA.mkdir(exist_ok=True,parents=True)
VIDEO=ROOT/'delivery/彩虹为什么是弧形_V06_1080p.mp4'
TL=json.loads((ROOT/'src/timeline.json').read_text('utf8'))
assert not TL.get('notFinal'), 'Do not validate estimated preview timing as final.'
def run(args):
    p=subprocess.run(args,capture_output=True,text=True,encoding='utf8',errors='replace')
    if p.returncode:raise RuntimeError(p.stderr[-5000:])
    return p
def sha(p):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda:f.read(8*1024*1024),b''):h.update(b)
    return h.hexdigest()
probe=json.loads(run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(VIDEO)]).stdout)
v=next(s for s in probe['streams'] if s['codec_type']=='video');a=next(s for s in probe['streams'] if s['codec_type']=='audio')
assert (v['width'],v['height'])==(1920,1080)
assert v['r_frame_rate']=='30/1' and int(v['nb_frames'])==TL['duration']
seconds=TL['duration']/30
assert abs(float(probe['format']['duration'])-seconds)<.08
assert abs(float(a.get('duration',seconds))-seconds)<.08
analysis=run(['ffmpeg','-hide_banner','-xerror','-i',str(VIDEO),'-vf','blackdetect=d=0.08:pic_th=0.98:pix_th=0.03','-af','silencedetect=n=-50dB:d=1.5,loudnorm=I=-16:TP=-1.5:LRA=7:print_format=json','-f','null','-']).stderr
(QA/'encoded-av-analysis-v06.log').write_text(analysis,'utf8')
loud=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',analysis)[-1])
black=re.findall(r'black_start:([^\n]+)',analysis);silence=re.findall(r'silence_(?:start|end):[^\n]+',analysis)
lock=json.loads((QA/'render-source-lock-v06.json').read_text('utf8'))
changed=[rel for rel,m in lock['files'].items() if sha(ROOT/rel)!=m['sha256']]
report={'version':'V06','video':str(VIDEO.relative_to(ROOT)),'durationSeconds':seconds,'frames':int(v['nb_frames']),'resolution':[1920,1080],'fps':'30/1','codec':v['codec_name'],'pixelFormat':v['pix_fmt'],'audioCodec':a['codec_name'],'audioSampleRate':a['sample_rate'],'fullDecodePassed':True,'integratedLUFS':float(loud['input_i']),'truePeakDbTP':float(loud['input_tp']),'loudnessRangeLU':float(loud['input_lra']),'blackSegments':black,'silenceSegmentsOver1_5s':silence,'sourceLockUnchanged':not changed,'changedSourceFiles':changed,'sha256':sha(VIDEO),'bytes':VIDEO.stat().st_size,'fullSubjectivePlaybackClaimed':False,'fullHumanListeningClaimed':False}
(QA/'delivery-qa-v06.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8');print(json.dumps(report,ensure_ascii=False,indent=2))
assert not black and not changed
assert -17.5<=report['integratedLUFS']<=-14
assert report['truePeakDbTP']<=-1.5
assert not silence
# Every narrative sentence, every camera handoff and the beginning/middle/end
# of the source coda. Samples supplement, rather than replace, full decode.
frames={max(0,min(TL['duration']-1,round((c['start']+c['duration']*.55)*30))) for c in TL['clips']}
for s in TL['scenes']:
    for dt in [-.6,-.2,0,.2,.6,1.4]:frames.add(max(0,min(TL['duration']-1,round((s['start']+dt)*30))))
for c in TL['clips']:
    if c['id'] in ['r007','r013','r018','r023','r026','r027','r028','r031','r034','r035','r038','r041']:
        for q in [.15,.35,.75,.9]:frames.add(round((c['start']+c['duration']*q)*30))
frames.update([0,80,120,TL['duration']-149,TL['duration']-75,TL['duration']-1])
scene_start={s['id']:round(s['start']*30) for s in TL['scenes']}
clip_start={c['id']:round(c['start']*30) for c in TL['clips']}
reality_starts=[0,scene_start['drop']-65,scene_start['cone']-75,clip_start['r027']+36,scene_start['return']+25,clip_start['r041']+25]
for start in reality_starts:
    for dt in [0,10,21,40,80,116,128,140,149,150]:
        frames.add(max(0,min(TL['duration']-1,start+dt)))
for dt in [55,70,90,120,150]:frames.add(scene_start['drop']+dt)
frames=sorted(frames);folder=QA/'encoded-frames-v06';folder.mkdir(exist_ok=True)
selection='+'.join(f'eq(n,{f})' for f in frames)
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(VIDEO),'-vf',f"select='{selection}',scale=1280:720",'-fps_mode','vfr','-q:v','2',str(folder/'shot-%03d.jpg')])
for i,f in enumerate(frames,1):
    p=folder/f'shot-{i:03}.jpg'
    if p.exists():p.replace(folder/f'frame-{f:05}.jpg')
(QA/'encoded-frame-contract-v06.json').write_text(json.dumps({'frames':frames,'sourceVideoSHA256':report['sha256']},indent=2),'utf8')
