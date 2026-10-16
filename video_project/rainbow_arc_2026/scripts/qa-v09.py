"""Checks the actual final V09 encode. Does not claim human playback/listening."""
from pathlib import Path
import json,subprocess,re,hashlib
from v09_inventory import runtime_files,immutable_record
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'research/qa';QA.mkdir(exist_ok=True,parents=True)
OUTPUT=Path(json.loads((ROOT/'work/output-root-v09.json').read_text('utf8'))['outputRoot'])
VIDEO=OUTPUT/'delivery/彩虹为什么是弧形_V09_1080p.mp4'
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
(QA/'encoded-av-analysis-v09.log').write_text(analysis,'utf8')
loud=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',analysis)[-1])
black=re.findall(r'black_start:([^\n]+)',analysis);silence=re.findall(r'silence_(?:start|end):[^\n]+',analysis)
lock=json.loads((QA/'render-source-lock-v09.json').read_text('utf8'))
assert lock.get('version')=='V09' and lock.get('schema')=='rainbow.v09.render-source-lock/1','Actual V09 source lock required'
missing=[rel for rel in lock['files'] if not (ROOT/rel).is_file()]
changed=[rel for rel,m in lock['files'].items() if (ROOT/rel).is_file() and sha(ROOT/rel)!=m['sha256']]
inventoryMatches=set(lock['files'])==set(runtime_files())
physicsSourceChanges=[]
for reportName in ['verification-v09.json','world-geometry-check-v09.json']:
    pr=json.loads((ROOT/'research/physics'/reportName).read_text('utf8'))
    assert pr.get('version')=='V09' and pr.get('passed'),'Actual V09 physics report failed or missing'
    assert pr.get('sourceHashes'),'V09 physics report lacks source provenance'
    for rel,expected in pr['sourceHashes'].items():
        if not (ROOT/rel).is_file() or sha(ROOT/rel)!=expected:physicsSourceChanges.append(rel)
physicsHashesMatch=not physicsSourceChanges
report={'version':'V09','video':str(VIDEO),'durationSeconds':seconds,'frames':int(v['nb_frames']),'resolution':[1920,1080],'fps':'30/1','codec':v['codec_name'],'pixelFormat':v['pix_fmt'],'audioCodec':a['codec_name'],'audioSampleRate':a['sample_rate'],'fullDecodePassed':True,'integratedLUFS':float(loud['input_i']),'truePeakDbTP':float(loud['input_tp']),'loudnessRangeLU':float(loud['input_lra']),'blackSegments':black,'silenceSegmentsOver1_5s':silence,'sourceLockUnchanged':not changed and not missing and inventoryMatches,'changedSourceFiles':changed,'missingSourceFiles':missing,'runtimeInventoryMatchesLock':inventoryMatches,'renderSourceLockSHA256':sha(QA/'render-source-lock-v09.json'),'physicsSourceHashesMatch':physicsHashesMatch,'physicsSourceChanges':sorted(set(physicsSourceChanges)),'sha256':sha(VIDEO),'bytes':VIDEO.stat().st_size,'fullSubjectivePlaybackClaimed':False,'fullHumanListeningClaimed':False}
report['qaStatus']='pass' if not black and not silence and not changed and not missing and inventoryMatches and physicsHashesMatch and -17.5<=report['integratedLUFS']<=-14 and report['truePeakDbTP']<=-1.5 else 'failed'
(QA/'delivery-qa-v09.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8');print(json.dumps(report,ensure_ascii=False,indent=2))
assert report['qaStatus']=='pass', 'Actual V09 final encode QA failed'
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
frames.update([0,80,120,2280,3120,3180,3224,3240,3820,4650,6330,6495,6513,7800,7980,7996,8980,9140,TL['duration']-149,TL['duration']-75,TL['duration']-1])
# Preserve the actual final V09 repairs in the encoded review, including the
# one-frame physical appearance/hide boundaries, not only narrative midpoints.
frames.update([160,370,700,1760,2340,4100,4200,4270,4327,4328,4339,4340,4780,6400,
               6574,6575,6700,6814,6815,6980,7050,7160,7773,7774,8080,8909,9130,
               9248,9249,9397,9437,9469,9485,9486])
labelAudit=json.loads((QA/'v09-label-transition-audit.json').read_text('utf8'))
for change in labelAudit['changes']:
    for dt in [-4,0,4]:frames.add(max(0,min(TL['duration']-1,change['frame']+dt)))
scene_start={s['id']:round(s['start']*30) for s in TL['scenes']}
clip_start={c['id']:round(c['start']*30) for c in TL['clips']}
reality_starts=[0,scene_start['drop']-65,scene_start['cone']-75,clip_start['r027']+36,scene_start['return']+25,clip_start['r041']+25]
for start in reality_starts:
    for dt in [0,10,21,40,80,116,128,140,149,150]:
        frames.add(max(0,min(TL['duration']-1,start+dt)))
for dt in [55,70,90,120,150]:frames.add(scene_start['drop']+dt)
frames=sorted(frames);folder=OUTPUT/'work/encoded-frames-v09';folder.mkdir(exist_ok=True)
selection='+'.join(f'eq(n,{f})' for f in frames)
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(VIDEO),'-vf',f"select='{selection}',scale=1280:720",'-fps_mode','vfr','-q:v','2',str(folder/'shot-%03d.jpg')])
for i,f in enumerate(frames,1):
    p=folder/f'shot-{i:03}.jpg'
    if p.exists():p.replace(folder/f'frame-{f:05}.jpg')
(QA/'encoded-frame-contract-v09.json').write_text(json.dumps({'frames':frames,'sourceVideoSHA256':report['sha256']},indent=2),'utf8')
