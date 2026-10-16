"""V16: edit complete source sentences, never time-stretch the narrator.

All source audio/captions stay immutable. Internal edits use manually reviewed
semantic boundaries and low-energy gaps, followed by an 8 ms microfade.
This is an objective waveform audit; it does not claim human listening approval.
"""
from pathlib import Path
import argparse, copy, hashlib, json, math, re, subprocess, sys
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d

ROOT=Path(__file__).resolve().parents[3]
WORK=ROOT/'work/v16/audio'; OUT=ROOT/'public/v16/audio'
SR=48000; FPS=30; SPF=1600
def read(p):return json.loads(Path(p).read_text('utf-8-sig'))
def save(p,x):
    p=Path(p);p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n','utf-8')
def sha(p):return hashlib.sha256(Path(p).read_bytes()).hexdigest()
OLD=read(ROOT/'src/timeline.json'); V15=read(ROOT/'src/timeline-v15.json')
BYID={x['id']:x for x in OLD['clips']}

# Internal selections end/start in measured quiet intervals, never within words.
# The first clip removes the redundant discussion of where labels are printed.
EXCERPTS={
 's001':('s001',0,9.58,[1,2,3,4]),
 's030':('s030',0,18.30,list(range(1,12))),
 's037':('s037',0,3.16,[1]),
 'v004':('s004',0,6.42,[1,2,3,4]),
 'v018a':('s018',0,2.76,[1,2]),
 'v018b':('s018',13.40,21.60,[9,10,11]),
 'v029':('s029',4.58,None,list(range(4,11))),
 'v034':('s034',0,4.10,[1,2]),
 'v047':('s047',5.15,None,[4,5]),
}
MAIN={
 'hook':['s001','s002','s003','s004'],
 'foundation':['s005','s006','s008','s009'],
 'core':['s010','s012','s013'],
 'frame':['s015','s016','s018','s019'],
 'skin':['s022','s024','s025','s027'],
 'wind':['s029','s030','s033','s034'],
 'damper':['s035','s036','s037'],
 'assembly':['s040','s041','s044'],
 'return':['s047','s048'],
}
VERTICAL=['s001','v004','s006','v018a','v018b','v029','v034','s035','s036','v047']

def make_source(key):
    sid,a,b,capids=EXCERPTS.get(key,(key,0,None,None))
    source=BYID[sid];path=ROOT/'public'/source['audio']
    w,sr=sf.read(path,dtype='float32');assert sr==SR and w.ndim==1
    if b is None:b=len(w)/sr
    i,j=round(a*sr),round(b*sr);cut=w[i:j].copy()
    cropped=(i>0 or j<len(w));edges={}
    # Record actual edge energy. Cropped boundaries must be quiet enough that
    # the microfade cannot remove a consonant or a voiced tail.
    for name,q in [('head',cut[:480]),('tail',cut[-480:])]:
        edges[name+'20msDBFS']=20*math.log10(max(1e-12,float(np.sqrt(np.mean(q*q)))))
    if i>0:assert edges['head20msDBFS']<-48,(key,edges)
    if j<len(w):assert edges['tail20msDBFS']<-48,(key,edges)
    if cropped:
        nf=round(.008*sr);f=np.sin(np.linspace(0,np.pi/2,nf))**2
        if i>0:cut[:nf]*=f
        if j<len(w):cut[-nf:]*=f[::-1]
    # Moderate per-take gain correction only; the sources are already cleaned.
    h=480;v=cut[:len(cut)//h*h].reshape(-1,h);power=np.mean(v*v,axis=1)
    active=power>max(1e-5,float(power.max())*.003)
    rms=float(np.sqrt(np.mean(v[active].astype(np.float64)**2)))
    gain=float(np.clip(.080/max(rms,1e-9),10**(-2/20),10**(2/20)))
    cut*=gain
    dest=OUT/'voice'/f'{key}.wav';dest.parent.mkdir(parents=True,exist_ok=True)
    sf.write(dest,cut,sr,subtype='PCM_24')
    caps=[copy.deepcopy(c) for c in OLD['captions'] if c.get('clipId')==sid]
    if capids is not None:caps=[c for c in caps if int(c['id'].rsplit('c',1)[1]) in capids]
    text=''.join(c['text'] for c in caps)
    return dict(id=key,sourceClipId=sid,section=source['section'],sourceIds=source.get('sourceIds',[]),
        text=text,caption=text,focus=source.get('focus',''),audio=dest.relative_to(ROOT/'public').as_posix(),
        samples=len(cut),seconds=len(cut)/SR,voiceDurationFrames=math.ceil(len(cut)/SPF),
        voiceDurationSeconds=len(cut)/SR,sourceStart=source['start']+round(a*FPS),
        sourceEnd=source['start']+round(b*FPS),sourceOffsetSeconds=a,sourceAudio=source['audio'],
        sourceSHA256=sha(path),audioSHA256=sha(dest),gainDB=20*math.log10(gain),
        excerptSeconds=[a,b],sourceCaptionIds=[c['id'] for c in caps],captions=caps,
        waveformBoundaryAudit=edges,internalExcerpt=cropped)

def timeline(kind,sources):
    vertical=kind=='vertical';duration=2700 if vertical else 10800
    groups=[dict(id='story',start=9,end=2550,keys=VERTICAL)] if vertical else [
        dict(**s,keys=MAIN[s['id']]) for s in V15['sections'] if s['id'] in MAIN]
    clips=[];caps=[];segments=[];sectionrows=[];narration=np.zeros(duration*SPF,np.float32)
    for group in groups:
        keys=group['keys'];a=group['start'];b=group['end'];rows=[sources[k] for k in keys]
        voiced=sum(r['voiceDurationFrames'] for r in rows)
        available=b-a-voiced
        assert available>=15*len(rows),(kind,group['id'],available,voiced)
        # At least half a second after each complete take; surplus is an
        # explicit visual observation beat, not fake speech duration.
        gaps=np.full(len(rows),15,dtype=int);slack=available-15*len(rows)
        if not vertical:
            sequence=[k for g in groups for k in g['keys']]
            priorities=[]
            for ix,r in enumerate(rows):
                pos=sequence.index(r['id']);following=sequence[pos+1] if pos+1<len(sequence) else None
                skip=sources[following]['sourceStart']-r['sourceEnd'] if following else 0
                priorities.append((skip,ix))
            for skip,ix in sorted(priorities,reverse=True):
                if skip<120:continue
                extra=min(60,slack);gaps[ix]+=extra;slack-=extra
        extra=np.full(len(rows),slack//len(rows),dtype=int);extra[-1]+=slack-int(extra.sum())
        gaps+=extra;cursor=a
        for r,gap in zip(rows,gaps):
            row={k:copy.deepcopy(v) for k,v in r.items() if k not in ('captions','samples','seconds')}
            row.update(start=cursor,voiceEnd=cursor+r['voiceDurationFrames'],end=cursor+r['voiceDurationFrames']+int(gap))
            row.update(duration=row['end']-row['start'],startSeconds=cursor/FPS,endSeconds=row['end']/FPS,
                voiceEndSeconds=cursor/FPS+r['seconds'],observationFrames=int(gap))
            w,sr=sf.read(ROOT/'public'/r['audio'],dtype='float32');offset=cursor*SPF
            narration[offset:offset+len(w)]=w
            delta=cursor-r['sourceStart']
            for c in r['captions']:
                cc=copy.deepcopy(c);cc['id']=r['id']+'-'+c['id'];cc['clipId']=r['id']
                cc['start']=max(cursor,c['start']+delta);cc['end']=min(row['voiceEnd'],c['end']+delta)
                assert cc['end']>cc['start'],(r['id'],cc)
                cc['timingSource']='Original source Whisper alignment, translated by integer frames; no rate change'
                caps.append(cc)
            clips.append(row)
            segments.append(dict(id=r['id'],start=cursor,end=row['end'],voiceEnd=row['voiceEnd'],
                sourceStart=r['sourceStart'],sourceEnd=r['sourceEnd'],sourceClipId=r['sourceClipId'],
                section=r['section'],observationFrames=int(gap),mapping='unit-rate speech then hold sourceEnd during observation'))
            cursor=row['end']
        assert cursor==b
        sectionrows.append(dict(id=group['id'],start=a,end=b))
    outro=2550 if vertical else 10625
    if vertical:
        sectionrows=[]
        for c in clips:
            sid=c['section']
            if sectionrows and sectionrows[-1]['id']==sid:sectionrows[-1]['end']=c['end']
            else:sectionrows.append(dict(id=sid,start=c['start'],end=c['end']))
    sectionrows.append(dict(id='references',start=outro,end=duration))
    tl=dict(version='v16',kind=kind,fps=FPS,duration=duration,durationFrames=duration,
        durationSeconds=duration/FPS,clips=clips,captions=caps,sections=sectionrows,sceneSegments=segments,
        draft=False,voiceSpeedFactor=1,narrationStatus='edited immutable per-sentence sources; no time stretch',
        outro=dict(start=outro,end=duration,duration=duration-outro),
        sourceTimeline='src/timeline.json',sourceTimelineSHA256=sha(ROOT/'src/timeline.json'),
        mappingFormula='sourceFrame = min(sourceEnd, sourceStart + max(0, frame-start)); observe until segment.end',
        audio=('v16/audio/vertical-master.wav' if vertical else 'v16/audio/master.wav'),
        subjectiveListeningChecked=False)
    suffix='-vertical' if vertical else ''
    save(ROOT/f'src/v16/audio-timeline{suffix}.json',tl)
    sf.write(OUT/('vertical-narration.wav' if vertical else 'narration.wav'),narration,SR,subtype='PCM_24')
    save(WORK/f'placements{suffix}.json',dict(voiceSamples=int(sum(sources[k]['samples'] for g in groups for k in g['keys'])),
        voiceSeconds=sum(sources[k]['seconds'] for g in groups for k in g['keys']),duration=duration/FPS,
        sources=[{k:v for k,v in sources[key].items() if k!='captions'} for g in groups for key in g['keys']],
        allZeroRateChange=True,explicitObservationSeconds=(duration/FPS-sum(sources[k]['seconds'] for g in groups for k in g['keys']))))
    # SubRip uses exactly the same new frame positions as Remotion.
    def stamp(frame):
        ms=round(frame/FPS*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    (OUT/f'ShanghaiTower_V16{suffix}.srt').write_text('\n\n'.join(
        f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(caps))+'\n',encoding='utf8')
    (WORK/f'narration{suffix}.md').write_text('\n\n'.join(f"{c['start']/30:.2f}s · {c['id']}\n\n{c['text']}" for c in clips),encoding='utf8')
    print(kind,'seconds',duration/FPS,'spoken',sum(c['voiceDurationSeconds'] for c in clips),'takes',len(clips),flush=True)
    return tl

def measure(path):
    cmd=['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-15:TP=-1.5:LRA=11:print_format=json','-f','null','-']
    p=subprocess.run(cmd,capture_output=True,text=True,check=True)
    return json.loads(re.search(r'\{\s*"input_i"[\s\S]*?\}',p.stderr).group())

def mix(kind):
    vertical=kind=='vertical';prefix='vertical-' if vertical else ''
    tl=read(ROOT/f"src/v16/audio-timeline{'-vertical' if vertical else ''}.json")
    voice,sr=sf.read(OUT/(prefix+'narration.wav'),dtype='float32');assert sr==SR
    music,sr=sf.read(WORK/(prefix+'score-original.wav'),dtype='float32',always_2d=True)
    assert len(music)==len(voice) and sr==SR
    n=len(voice);hop=480;v=voice[:n//hop*hop].reshape(-1,hop)
    active=np.sqrt(np.mean(v*v,axis=1))>.007
    vrms=float(np.sqrt(np.mean(v[active].astype(np.float64)**2)))
    mrms=float(np.sqrt(np.mean(music.astype(np.float64)**2)))
    music*=vrms*10**(-17/20)/mrms
    ctrl=np.full(math.ceil(n/hop),1.7,np.float32)
    for c in tl['clips']:
        a=max(0,round((c['start']/FPS-.12)*SR/hop));b=min(len(ctrl),math.ceil((c['voiceEndSeconds']+.7)*SR/hop))
        ctrl[a:b]=1
    ctrl=gaussian_filter1d(ctrl,35,mode='nearest')
    music*=np.interp(np.arange(n)/hop,np.arange(len(ctrl)),ctrl)[:,None].astype(np.float32)
    sf.write(OUT/(prefix+'music.wav'),music,SR,subtype='PCM_24')
    premaster=WORK/(prefix+'premaster.wav');sf.write(premaster,voice[:,None]+music,SR,subtype='FLOAT')
    m=measure(premaster);master=OUT/(prefix+'master.wav')
    filt=(f"loudnorm=I=-15:TP=-1.8:LRA=11:measured_I={m['input_i']}:measured_TP={m['input_tp']}:measured_LRA={m['input_lra']}:measured_thresh={m['input_thresh']}:offset={m['target_offset']}:linear=true,aresample={SR},apad=whole_len={n},atrim=end_sample={n}")
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(premaster),'-af',filt,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(master)],check=True)
    aac=WORK/(prefix+'aac-check.m4a')
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','320k',str(aac)],check=True)
    wm=measure(master);am=measure(aac)
    assert -16<=float(am['input_i'])<=-14 and float(am['input_tp'])<=-1,(kind,am)
    assert sf.info(master).frames==n
    measuredmrms=float(np.sqrt(np.mean(music[:len(active)*hop].reshape(-1,hop,2)[active].astype(np.float64)**2)))
    report=dict(kind=kind,passed=True,masterMeasurement=wm,aacMeasurement=am,expectedSamples=n,
        voiceOverMusicActiveDB=20*np.log10(vrms/measuredmrms),voiceSpeedFactor=1,voicePitchChange=0,
        repeatedDenoising=False,subjectiveListeningChecked=False,pronunciationListeningVerified=False,
        scope='Objective source excerpts, caption remap, exact-duration stems, AAC loudness/true peak; no claim of completed subjective listening.',
        hashes={f:sha(OUT/(prefix+f)) for f in ['master.wav','music.wav','narration.wav']},
        timelineSHA256=sha(ROOT/f"src/v16/audio-timeline{'-vertical' if vertical else ''}.json"),
        scoreSourceSHA256=sha(WORK/(prefix+'score-original.wav')))
    save(WORK/(prefix+'audio-report.json'),report)
    print(kind,'AAC',am,'speech/music dB',report['voiceOverMusicActiveDB'],flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['timeline','mix','all'],default='all',nargs='?');args=parser.parse_args()
    if args.mode in ['timeline','all']:
        keys=set(k for v in MAIN.values() for k in v)|set(VERTICAL)
        sources={k:make_source(k) for k in sorted(keys)}
        save(WORK/'source-edit-manifest.json',{k:{kk:vv for kk,vv in v.items() if kk!='captions'} for k,v in sources.items()})
        for k in ['main','vertical']:timeline(k,sources)
    if args.mode in ['mix','all']:
        for k in ['main','vertical']:mix(k)
