from pathlib import Path
import hashlib,json,re,shutil,sys,stat

R=Path(__file__).resolve().parents[1]
D=R/'delivery/episode3';Q=D/'qa';Q.mkdir(exist_ok=True)
E=R.parent/'episode3'
def sha(p):
    with p.open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def save(p,x):p.write_text(json.dumps(x,ensure_ascii=False,indent=2),encoding='utf8')
t=json.loads((R/'public/episode3/timeline.json').read_text('utf8'))
probe=json.loads((Q/'probe.json').read_text('utf8'))
v=next(x for x in probe['streams'] if x['codec_type']=='video')
assert (v['width'],v['height'],v['nb_frames'],v['avg_frame_rate'])==(1920,1080,'9541','30/1')
assert v['pix_fmt']=='yuv420p' and v['color_space']=='bt709'
assert len(probe['chapters'])==6
assert t['scenes'][-1]['end']-t['scenes'][-1]['start']==150
assert all(a['end']==b['start'] for a,b in zip(t['scenes'],t['scenes'][1:]))
assert all(a['end']<=b['start'] for a,b in zip(t['captions'],t['captions'][1:]))
assert all(c['end']<t['scenes'][-1]['start'] for c in t['clips'])
assert (R/'src/episode3/timeline.json').read_bytes()==(R/'public/episode3/timeline.json').read_bytes()
for c in t['clips']:
    for kind in ['voice','voice-raw']:assert (R/f"public/episode3/{kind}/{c['id']}.wav").exists()
for paper in ['sha2.pdf','tenon-biores.pdf']:
    assert (R/'research/episode3'/paper).read_bytes().startswith(b'%PDF')
log=(R/'output/episode3/delivery-av-check.log').read_text('utf8',errors='replace')
audio=json.loads(re.search(r'\{\s*"input_i"[\s\S]*?\}',log).group())
assert -17<float(audio['input_i'])<-15 and float(audio['input_tp'])<=-1
assert 'black_start:' not in log and 'silence_start:' not in log
assert 'frame= 9541' in log and 'Lsize=' in log
video=D/'榫卯_木头怎样咬住木头_1080p.mp4'
qa={'status':'passed automated checks and sampled visual review',
    'videoSha256':sha(video),'durationVideoSeconds':float(v['duration']),
    'frames':9541,'resolution':[1920,1080],'fps':30,'colorSpace':'BT.709 limited / yuv420p',
    'chapters':6,'voiceClipsUsed':len(t['clips']),'captionCount':len(t['captions']),
    'codaFrames':150,'audioMeasuredAAC':audio,
    'fullDecodeExitCode':0,'blackSegmentsDetected':0,'silenceOver2sBelowMinus50dB':0,
    'reviewedOriginalFrames':[0,90,150,235,550,1400,1831,2708,3532,4157,5299,5587,6228,7006,7869,8779,9436,9500],
    'reviewedDeliveryFrames':[90,550,1831,2864,5299,6228,7869,9396,9500],
    'introSecondBySecondSampled':True,'continuousHumanFullPlayback':False,
    'subjectiveListeningChecked':False,'asrAudit':'research/episode3/asr-check.json',
    'interactiveModelCheck':'interactive-qa.json','limitations':['Educational geometry, not construction drawings or historical reconstruction','Force paths and deformations are schematic, not FEA','Douyin narration could not be retrieved']}
save(Q/'final-qa.json',qa)
shutil.copy2(R/'output/episode3/delivery-av-check.log',Q/'decode-audio.log')
music=json.loads((R/'research/episode3/audio-manifest.json').read_text('utf8'))
history=Path('C:/Users/zju/.codex/skills/rainbow-science-short/references/music-history.json')
h=json.loads(history.read_text('utf8'))
if not any(x.get('sha256')==music['musicSha256'] for x in h['records']):
    h['records'].append({'video':'rainbow episode 3 joinery','title':music['title'],'artist':'rainbow鱼 original procedural arrangement','sha256':music['musicSha256'],'source':'scripts/score_episode3.py / seed 31004','status':'delivered','videoSha256':qa['videoSha256']});save(history,h)

candidates=[R/'tmp/episode3-bundle',R/'tmp/episode3-public',R/'public/episode3/premaster.wav',
    R/'output/episode3/榫卯为什么越用越稳_1080p.mp4',R/'output/episode3/榫卯_木头怎样咬住木头_1080p.mp4',
    R/'output/episode3/segment-9391-9540.mp4',
    R/'public/episode3/references/formula-joinery.jpg',R/'public/episode3/references/paper-mortise-2018.jpg',R/'public/episode3/references/paper-timber-2021.jpg',
    E/'blender/joinery_pavilion_crafted.blend1',E/'blender/榫卯亭子_assembly.blend',E/'blender/榫卯亭子_assembly.blend1',E/'blender/joinery_pavilion_assembly.blend',E/'blender/îͤ_assembly.blend']
for name in ['sha-2019.pdf','sha.pdf','tenon-2014.pdf']:
    p=R/'research/episode3'/name
    if p.exists() and not p.read_bytes().startswith(b'%PDF'):candidates.append(p)
for kind in ['voice','voice-raw']:candidates.extend((R/f'public/episode3/{kind}').glob('x*.wav'))
for name in ['joint_glb.glb','pavilion_glb.glb']:
    p=R/'public/episode3/models'/name
    assert (E/'lux3d'/name).exists()
    if p.exists():
        assert sha(p)==sha(E/'lux3d'/name)
        candidates.append(p)
candidates=[p for p in candidates if p.exists()]
allowed=[R/'tmp',R/'output/episode3',R/'public/episode3',R/'research/episode3',E/'blender']
def safe(p):
    resolved=p.resolve(strict=True)
    assert any(resolved.is_relative_to(a.resolve()) and resolved!=a.resolve() for a in allowed),str(p)
    for part in [p,*p.parents]:
        if part==R.parent:break
        assert not part.is_symlink() and not (part.stat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT),str(part)
    if p.is_dir():
        for child in p.rglob('*'):
            assert child.name!='.git' and not child.is_symlink()
            assert not (child.stat().st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT)
    return resolved
def size(p):return sum(x.stat().st_size for x in p.rglob('*') if x.is_file()) if p.is_dir() else p.stat().st_size
plan=[{'path':str(safe(p)),'bytes':size(p)} for p in candidates]
save(Q/'cleanup-plan.json',{'items':plan,'totalBytes':sum(x['bytes'] for x in plan),'reason':'Obsolete episode 3 assets and rebuildable render copies; current originals and dependencies preserved'})
excluded={p.resolve() for p in candidates}
dependencies=[]
for folder in [R/'src/episode3',R/'public/episode3',D,E/'lux3d']:
    dependencies.extend(p for p in folder.rglob('*') if p.is_file() and p.resolve() not in excluded and 'qa' not in p.relative_to(folder).parts)
dependencies += [R/'src/index-episode3.tsx',R/'package.json',R/'package-lock.json',E/'build_crafted_scene.py',E/'blender/joinery_pavilion_crafted.blend']
dependencies += list((R/'scripts').glob('*episode3*'))
dependencies += [R/'research/episode3'/n for n in ['story.json','paper-sources.json','sha2.pdf','tenon-biores.pdf','reference-workflow.md','audio-manifest.json']]
entries=[{'path':str(p.resolve()),'bytes':p.stat().st_size,'sha256':sha(p)} for p in sorted(set(dependencies))]
save(Q/'dependencies.json',entries)
if '--clean' in sys.argv:
    for p in candidates:
        safe(p)
        if p.is_dir():shutil.rmtree(p)
        else:p.unlink()
    for item in entries:assert sha(Path(item['path']))==item['sha256'],item['path']
    save(Q/'cleanup-result.json',{'deletedItems':plan,'freedBytes':sum(x['bytes'] for x in plan),'dependencyHashesVerifiedAfterCleanup':True,'preserved':'Final video, voice sources, selected assets, current Blender project, original Lux3D ZIP/GLB, scripts, papers and shared dependencies'})
print(json.dumps({'passed':True,'dependencies':len(entries),'cleanupCandidates':len(plan),'cleanupBytes':sum(x['bytes'] for x in plan),'cleaned':'--clean' in sys.argv}))
