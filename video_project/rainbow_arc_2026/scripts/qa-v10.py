"""Checks the actual final V10 encode. Does not claim human playback/listening."""
from pathlib import Path
import json,subprocess,re,hashlib
from v10_inventory import runtime_files,immutable_record
from v10_review_windows import review_frame_plan
ROOT=Path(__file__).resolve().parents[1]
QA=ROOT/'research/qa';QA.mkdir(exist_ok=True,parents=True)
OUTPUT=Path(json.loads((ROOT/'work/output-root-v10.json').read_text('utf8'))['outputRoot'])
VIDEO=OUTPUT/'delivery/彩虹为什么是弧形_V10_1080p.mp4'
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
(QA/'encoded-av-analysis-v10.log').write_text(analysis,'utf8')
loud=json.loads(re.findall(r'\{\s*"input_i"[\s\S]*?\}',analysis)[-1])
black=re.findall(r'black_start:([^\n]+)',analysis);silence=re.findall(r'silence_(?:start|end):[^\n]+',analysis)
lock=json.loads((QA/'render-source-lock-v10.json').read_text('utf8'))
assert lock.get('version')=='V10' and lock.get('schema')=='rainbow.v10.render-source-lock/1','Actual V10 source lock required'
missing=[rel for rel in lock['files'] if not (ROOT/rel).is_file()]
changed=[rel for rel,m in lock['files'].items() if (ROOT/rel).is_file() and sha(ROOT/rel)!=m['sha256']]
inventoryMatches=set(lock['files'])==set(runtime_files())
physicsSourceChanges=[]
for reportName in ['verification-v10.json','world-geometry-check-v10.json']:
    pr=json.loads((ROOT/'research/physics'/reportName).read_text('utf8'))
    assert pr.get('version')=='V10' and pr.get('passed'),'Actual V10 physics report failed or missing'
    assert pr.get('sourceHashes'),'V10 physics report lacks source provenance'
    for rel,expected in pr['sourceHashes'].items():
        if not (ROOT/rel).is_file() or sha(ROOT/rel)!=expected:physicsSourceChanges.append(rel)
physicsHashesMatch=not physicsSourceChanges
report={'version':'V10','video':str(VIDEO),'durationSeconds':seconds,'frames':int(v['nb_frames']),'resolution':[1920,1080],'fps':'30/1','codec':v['codec_name'],'pixelFormat':v['pix_fmt'],'audioCodec':a['codec_name'],'audioSampleRate':a['sample_rate'],'fullDecodePassed':True,'integratedLUFS':float(loud['input_i']),'truePeakDbTP':float(loud['input_tp']),'loudnessRangeLU':float(loud['input_lra']),'blackSegments':black,'silenceSegmentsOver1_5s':silence,'sourceLockUnchanged':not changed and not missing and inventoryMatches,'changedSourceFiles':changed,'missingSourceFiles':missing,'runtimeInventoryMatchesLock':inventoryMatches,'renderSourceLockSHA256':sha(QA/'render-source-lock-v10.json'),'physicsSourceHashesMatch':physicsHashesMatch,'physicsSourceChanges':sorted(set(physicsSourceChanges)),'sha256':sha(VIDEO),'bytes':VIDEO.stat().st_size,'fullSubjectivePlaybackClaimed':False,'fullHumanListeningClaimed':False}
report['qaStatus']='pass' if not black and not silence and not changed and not missing and inventoryMatches and physicsHashesMatch and -17.5<=report['integratedLUFS']<=-14 and report['truePeakDbTP']<=-1.5 else 'failed'
(QA/'delivery-qa-v10.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8');print(json.dumps(report,ensure_ascii=False,indent=2))
assert report['qaStatus']=='pass', 'Actual V10 final encode QA failed'
assert not black and not changed
assert -17.5<=report['integratedLUFS']<=-14
assert report['truePeakDbTP']<=-1.5
assert not silence
# Actual source-driven windows, caption events and the new explanation clips.
# No inherited V09 frame numbers or assumed six 150-frame Qwen windows.
labelAudit=json.loads((QA/'v10-label-transition-audit.json').read_text('utf8'))
bridgeManifest=json.loads((ROOT/'src/transitions-v10.json').read_text('utf8'))
plan=review_frame_plan(TL,bridgeManifest,labelAudit)
plan['sourceHashes']={rel:sha(ROOT/rel) for rel in ['src/timeline.json','src/transitions-v10.json','src/RealityBridgeV10.tsx','src/V10RainbowArcFilm.tsx','scripts/v10_review_windows.py','scripts/qa-v10.py','research/qa/v10-label-transition-audit.json']}
frames=plan['frames'];folder=OUTPUT/'work/encoded-frames-v10';folder.mkdir(exist_ok=True,parents=True)
selection='+'.join(f'eq(n,{f})' for f in frames)
run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(VIDEO),'-vf',f"select='{selection}',scale=1280:720",'-fps_mode','vfr','-q:v','2',str(folder/'shot-%03d.jpg')])
missingFrameNumbers=[]
for i,f in enumerate(frames,1):
    p=folder/f'shot-{i:03}.jpg'
    if p.exists():p.replace(folder/f'frame-{f:05}.jpg')
    else:missingFrameNumbers.append(f)
assert not missingFrameNumbers, 'Actual encoded extraction omitted planned frames'
assert sha(VIDEO)==report['sha256'], 'Final video changed during frame extraction'
plan.update(extracted=True,sourceVideoSHA256=report['sha256'],sourceVideo=str(VIDEO),folder=str(folder),missingFrameNumbers=missingFrameNumbers)
(QA/'encoded-frame-contract-v10.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n','utf8')
