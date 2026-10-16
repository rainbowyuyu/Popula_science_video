"""Build v7 from complete WAV takes: delay-compensated mastering, real-time timeline.

No tempo/rubberband/atrim, no old clip durations, no voiced sample truncation.
The camera timeline is derived from the mastered audio lengths rounded UP to frames.
Use --self-check for a synthetic terminal-syllable preservation check.
"""
from pathlib import Path
import argparse, difflib, hashlib, json, math, re, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from scipy.signal import resample_poly
from voice_episode3v7 import ROOT, TTS, PUBLIC, REPORTS, read_rows, spoken_text, audio_metrics, clean, dump, sha

sys.path.insert(0,str(TTS))
from broadcast_voice import master_voice

SR=48000

def full_take_master(raw, dest, head_seconds=.02, tail_seconds=.18):
    """Place protective silence outside the take; compensate only measured filter delay."""
    raw,dest=Path(raw),Path(dest)
    if raw.resolve()==dest.resolve():raise ValueError('Never overwrite raw audio')
    original,sr=sf.read(raw,dtype='float64',always_2d=True);mono=original.mean(axis=1)
    gcd=math.gcd(sr,SR);wave=resample_poly(mono,SR//gcd,sr//gcd)
    head=round(head_seconds*SR);tail=round(tail_seconds*SR)
    protected=np.pad(wave,(head,tail))
    with tempfile.TemporaryDirectory(prefix='rainbow-v7-protect-') as temp:
        padded=Path(temp)/'protected.wav';sf.write(padded,protected,SR,subtype='FLOAT')
        result=master_voice(padded,dest)
    actual=sf.info(dest)
    if actual.frames!=len(protected) or actual.samplerate!=SR:raise AssertionError('Master changed take duration')
    result.update({'rawSha256':sha(raw),'rawFrames':len(mono),'rawSampleRate':sr,
        'rawSeconds':len(mono)/sr,'resampledRawFrames':len(wave),
        'headGuardSamples':head,'tailGuardSamples':tail,'protectedFrames':len(protected),
        'rawContentNotTrimmed':True,'timeStretch':False,'pitchShift':False,
        'timelineUsesActualMasteredFrames':True,'originalFilePreserved':True})
    return result

def split_caption(text,max_chars=18):
    parts=re.findall(r'[^，。？！：；、]+[，。？！：；、]?',text);out=[];buf=''
    for part in parts:
        if len(clean(buf+part))>max_chars and buf:out.append(buf.rstrip('，。？！：；、'));buf=''
        if len(clean(part))>max_chars:
            if buf:out.append(buf.rstrip('，。？！：；、'));buf=''
            # Prefer ordinary phrase punctuation upstream; this is only an overflow fallback.
            while len(part)>max_chars:
                out.append(part[:max_chars]);part=part[max_chars:]
        buf+=part
    if buf:out.append(buf.rstrip('，。？！：；、'))
    return out or [text]

def caption_times(row,raw_metrics,asr_entry,fps,head_seconds,max_chars):
    parts=split_caption(row['text'],max_chars);reference=clean(row['text']);total=len(reference)
    active_start=raw_metrics['activeStartSeconds'] or 0
    active_end=raw_metrics['activeEndSeconds'] or raw_metrics['seconds']
    xs=[0.0,float(total)];ts=[active_start,active_end];method='duration-proportion-fallback';coverage=0.0
    if asr_entry:
        chars=[];times=[]
        for segment in asr_entry.get('segments',[]):
            for word in segment.get('words',[]):
                norm=clean(word['word']);n=len(norm)
                for j,char in enumerate(norm):
                    chars.append(char);times.append(word['start']+(word['end']-word['start'])*(j+.5)/max(1,n))
        matcher=difflib.SequenceMatcher(None,reference,''.join(chars),autojunk=False)
        blocks=matcher.get_matching_blocks();matched=sum(b.size for b in blocks);coverage=matched/max(1,total)
        if coverage>=.60 and matched>=2:
            anchors=[(i+.5,times[j]) for b in blocks for i,j in zip(range(b.a,b.a+b.size),range(b.b,b.b+b.size))]
            # Some ASR words have overlapping timestamps; preserve monotonic caption motion.
            anchors=[(x,float(np.clip(t,active_start,active_end))) for x,t in anchors]
            xs=[0.0]+[x for x,t in anchors]+[float(total)]
            ts=list(np.maximum.accumulate([active_start]+[t for x,t in anchors]+[active_end]))
            method='asr-character-anchors'
    boundaries=np.cumsum([0]+[len(clean(p)) for p in parts]);out=[]
    for index,part in enumerate(parts):
        a=float(np.interp(boundaries[index],xs,ts))+head_seconds
        b=float(np.interp(boundaries[index+1],xs,ts))+head_seconds
        start=row['start']+math.floor(a*fps);end=row['start']+math.ceil(b*fps)
        end=min(row['end'],max(start+1,end))
        if out:out[-1]['end']=min(out[-1]['end'],start)
        out.append({'text':part,'start':start,'end':end,'clip':row['id']})
    return out,{'id':row['id'],'method':method,'matchedDisplayCharacterCoverage':coverage,
                'captionParts':parts,'humanAlignmentChecked':False}

def prepare(args):
    source,rows=read_rows(args.story);pub=Path(args.public_root);reports=Path(args.report_dir)
    pub.mkdir(parents=True,exist_ok=True);(pub/'voice').mkdir(exist_ok=True)
    fps=args.fps
    if SR%fps:raise ValueError('FPS must divide 48000 so every frame maps to whole samples')
    cachefile=reports/'audio-asr-cache.json';cache=json.loads(cachefile.read_text('utf8')) if cachefile.exists() else {}
    ledgerfile=reports/'audio-generation.json'
    if not ledgerfile.exists():raise FileNotFoundError('Missing generation manifest; audio cannot be paired with unverified story text')
    ledger=json.loads(ledgerfile.read_text('utf8'))
    frame=math.ceil(args.intro_seconds*fps);clips=[];takes=[];masters=[];rawmetrics=[]
    for i,row in enumerate(rows):
        raw=pub/'voice-raw'/f"{row['id']}.wav";dest=pub/'voice'/f"{row['id']}.wav"
        if not raw.exists():raise FileNotFoundError(f'Missing complete raw take {raw}')
        expected_spoken,_=spoken_text(row);entry=ledger.get(row['id'],{})
        if entry.get('text')!=expected_spoken or entry.get('sha256')!=sha(raw):
            raise ValueError(f'Story/audio mismatch for {row["id"]}; regenerate changed sentence before preparing timeline')
        originalhash=sha(raw);result=full_take_master(raw,dest,args.head_guard,args.tail_guard)
        if sha(raw)!=originalhash:raise AssertionError('Raw changed during mastering')
        w,sr=sf.read(dest,dtype='float32');nf=math.ceil(len(w)*fps/sr)
        # Padding only: the full protected mastered take is always within its clip.
        padded=np.pad(w,(0,nf*SR//fps-len(w)))
        spoken,_=spoken_text(row)
        clip={**row,'spoken':spoken,'start':frame,'end':frame+nf,'duration':nf,
              'audioSeconds':len(w)/sr,'rawSeconds':result['rawSeconds'],'line':sum(c['scene']==row['scene'] for c in clips)}
        clips.append(clip);takes.append((frame*SR//fps,padded));masters.append({'id':row['id'],**result})
        rawmetrics.append(audio_metrics(raw));frame+=nf
        gap=float(row.get('pauseAfterSeconds',args.sentence_gap))
        if i<len(rows)-1 and row['scene']!=rows[i+1]['scene']:gap+=args.scene_gap
        if gap<0:raise ValueError('Negative gap could overlap narration')
        frame+=math.ceil(gap*fps)
    ref_start=frame;frame+=math.ceil(args.coda_seconds*fps)
    full=np.zeros(frame*SR//fps,dtype=np.float32)
    for start,w in takes:
        if start+len(w)>len(full):raise AssertionError('Timeline would truncate narration')
        full[start:start+len(w)]+=w
    sf.write(pub/'narration.wav',np.column_stack([full,full]),SR,subtype='PCM_24')
    scenes=[];ordered=list(dict.fromkeys(c['scene'] for c in clips))
    for scene in ordered:
        cs=[c for c in clips if c['scene']==scene]
        if [clips.index(c) for c in cs]!=list(range(clips.index(cs[0]),clips.index(cs[-1])+1)):raise ValueError('Scene clips must be contiguous')
        scenes.append({'id':scene,'title':cs[0].get('title',scene),'start':max(0,cs[0]['start']-round(args.scene_lead*fps)),'end':cs[-1]['end']})
    scenes[0]['start']=0
    for i in range(len(scenes)-1):scenes[i]['end']=scenes[i+1]['start']
    scenes[-1]['end']=ref_start
    scenes.append({'id':'references','title':'图纸、模型与工况','start':ref_start,'end':frame})
    captions=[];alignment=[]
    for clip,metric in zip(clips,rawmetrics):
        cap,report=caption_times(clip,metric,cache.get(metric['sha256']),fps,args.head_guard,args.caption_chars)
        captions+=cap;alignment.append(report)
    timeline={'fps':fps,'duration':frame,'seconds':frame/fps,'clips':clips,'captions':captions,'scenes':scenes,
              'audioTimingPolicy':'Full mastered WAV durations drive camera time. No stretching or truncation.'}
    dump(pub/'timeline.json',timeline)
    if args.src_timeline:dump(args.src_timeline,timeline)
    def stamp(f):
        ms=round(f/fps*1000);return f'{ms//3600000:02}:{ms//60000%60:02}:{ms//1000%60:02},{ms%1000:03}'
    (pub/'subtitles.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['start'])} --> {stamp(c['end'])}\n{c['text']}" for i,c in enumerate(captions)),encoding='utf8')
    dump(reports/'audio-mastering.json',masters);dump(reports/'audio-caption-alignment.json',alignment)
    summary={'seconds':frame/fps,'rawSpeechSeconds':sum(m['rawSeconds'] for m in masters),'clipCount':len(clips),
        'protectedSeconds':sum((m['headGuardSamples']+m['tailGuardSamples'])/SR for m in masters),
        'allRawFramesPreserved':all(m['rawContentNotTrimmed'] for m in masters),'timeStretch':False,
        'captionCounts':len(captions),'durationTargetSeconds':args.target_seconds,
        'durationDeltaSeconds':frame/fps-args.target_seconds,'durationReviewSuggested':frame/fps>args.target_seconds+45,
        'durationPolicy':'Approximate five-minute brief permits natural five-minutes-plus; shorten prose only when requested, never trim speech.',
        'subjectiveListeningChecked':False,'narrationSha256':sha(pub/'narration.wav'),
        'timelineSha256':sha(pub/'timeline.json'),'humanPronunciationReview':False}
    dump(reports/'audio-timing-summary.json',summary)
    print(json.dumps(summary,ensure_ascii=False,indent=2))

def self_check():
    with tempfile.TemporaryDirectory(prefix='rainbow-v7-selfcheck-') as temp:
        a=Path(temp)/'raw.wav';b=Path(temp)/'master.wav'
        sr=24000;n=int(1.37*sr);t=np.arange(n)/sr
        # There is an audible terminal burst extending to the very final raw sample.
        envelope=np.where((t>.05)&(t<.8),.15,np.where(t>1.15,.12,0))
        w=(np.sin(2*np.pi*(180*t+170*t*t))+.2*np.sin(2*np.pi*1600*t))*envelope
        sf.write(a,w,sr,subtype='PCM_24');h=sha(a);report=full_take_master(a,b)
        cleanwave,s=sf.read(b);tail=cleanwave[round(1.2*SR):round(1.39*SR)]
        assert sha(a)==h and len(cleanwave)==round((1.37+.02+.18)*SR)
        assert np.sqrt(np.mean(tail**2))>.02,'Terminal syllable lost'
        assert report['timeStretch'] is False and report['rawContentNotTrimmed']
        return {'status':'passed','rawFrames':n,'masteredFrames':len(cleanwave),'rawShaUnchanged':True,
            'terminalBurstRms':float(np.sqrt(np.mean(tail**2))),'measuredLatencySamples':report['measuredLatencySamples'],
            'verification':'Synthetic terminal sound survives mastering; this does not replace real-voice listening.'}

def measure_loudness(path):
    proc=subprocess.run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af',
        'loudnorm=I=-15.5:TP=-1.5:LRA=9:print_format=json','-f','null','NUL'],capture_output=True,text=True,encoding='utf8',check=True)
    matches=re.findall(r'\{\s*"input_i"[\s\S]*?\}',proc.stderr)
    if not matches:raise RuntimeError('No ffmpeg loudness result')
    return json.loads(matches[-1])

def woodwork_score(seconds,sr=SR):
    """Original pentatonic arrangement; synthesized timbres, not acoustic recordings."""
    from scipy.signal import butter,sosfilt
    n=round(seconds*sr);score=np.zeros((n,2),np.float32);rng=np.random.default_rng(202610057)
    beat=60/100;bar_seconds=beat*4
    # D gong pentatonic: no randomized chromatic pitch drift between phrases.
    pitches=np.array([50,52,54,57,59,62,64,66,69,71])
    motifs=[[0,2,3,4,3,2,1,0],[2,3,5,4,3,2,1,2],[0,1,2,4,5,4,3,2],[3,2,1,0,2,1,0,0]]
    durations=[.5,.5,1,.5,.5,.5,.5,0] # next bar supplies the cadence, with air between notes
    def add(w,start,pan):
        a=round(start*sr);b=min(n,a+len(w))
        if a<0 or b<=a:return
        angle=(pan+1)*math.pi/4;score[a:b,0]+=w[:b-a]*math.cos(angle);score[a:b,1]+=w[:b-a]*math.sin(angle)
    def string(midi,velocity=1,decay=1.0):
        f=440*2**((midi-69)/12);length=round(3.0*sr);t=np.arange(length)/sr
        y=np.zeros(length,np.float64)
        for h in range(1,9):
            # Stiff-string upper partials decay faster; slight pitch glide softens attacks.
            phase=2*np.pi*f*h*np.sqrt(1+.000055*h*h)*t+.006*np.exp(-t/.065)
            y+=np.sin(phase+rng.uniform(-.10,.10))*np.exp(-t/(decay/(1+.22*h)))/(h**1.45)
        y*=(1-np.exp(-t/.0045))*.095*velocity
        return y.astype(np.float32)
    for bar in range(math.ceil(seconds/bar_seconds)):
        phrase=(bar//4)%4;motif=motifs[phrase];offset=0.0
        # Phrase-end bars thin out. Medium tempo feels light without crowding speech.
        for j,index in enumerate(motif):
            if j==7:continue
            if bar%4==3 and j not in (0,2,5):continue
            start=.30+bar*bar_seconds+offset*beat+rng.uniform(-.010,.010)
            add(string(int(pitches[index]),.55+(.10 if j in (0,3) else 0),1.0),start,-.22 if j%2 else .22)
            offset+=durations[j]
        root=[38,45,42,38][(bar//2)%4]
        add(string(root,.30,1.5),.30+bar*bar_seconds,-.08)
        if bar%2==0:
            t=np.arange(round(2.3*sr))/sr;f=440*2**((int(pitches[motifs[phrase][2]])+12-69)/12)
            phase=2*np.pi*f*t+.06*np.sin(2*np.pi*4.7*t)
            env=np.minimum(t/.32,1)*np.clip((2.3-t)/.9,0,1)
            flute=.009*env*(np.sin(phase)+.12*np.sin(2*phase))
            add(flute.astype(np.float32),.35+bar*bar_seconds+.5*beat,.35)
        if bar%4 in (1,2):
            for pulse in (1.0,3.0):
                t=np.arange(round(.14*sr))/sr
                click=.008*np.exp(-t/.028)*(np.sin(2*np.pi*310*t)+.23*np.sin(2*np.pi*860*t))
                add(click.astype(np.float32),.30+bar*bar_seconds+pulse*beat,-.30)
    # Short shared room reflections keep the parts in one space, with no reverb on voice.
    for delay,gain in ((.083,.10),(.149,.07),(.271,.035)):
        k=round(delay*sr);score[k:]+=score[:-k,::-1]*gain
    score=sosfilt(butter(2,9500,fs=sr,output='sos'),score,axis=0).astype(np.float32)
    timeaxis=np.arange(n)/sr;fade=np.minimum(timeaxis/1.8,1)*np.minimum((seconds-timeaxis)/3.5,1)
    return score*np.clip(fade,0,1)[:,None]

def mix_and_check(args):
    pub=Path(args.public_root);reports=Path(args.report_dir)
    timeline=json.loads((pub/'timeline.json').read_text('utf8'));fps=timeline['fps']
    narration,sr=sf.read(pub/'narration.wav',dtype='float32',always_2d=True)
    if sr!=SR or len(narration)!=timeline['duration']*SR//fps:raise ValueError('Narration and timeline length disagree')
    music=woodwork_score(len(narration)/SR)
    # Reduce the speech presence band of music, without coloring the reference voice.
    with tempfile.TemporaryDirectory(prefix='rainbow-v7-mix-') as temp:
        temp=Path(temp);m=temp/'score.wav';eq=temp/'score-eq.wav';pre=temp/'premaster.wav'
        sf.write(m,music,SR,subtype='FLOAT')
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(m),'-af','highpass=f=50,equalizer=f=2800:t=q:w=0.65:g=-3',
            '-c:a','pcm_f32le',str(eq)],check=True)
        music,_=sf.read(eq,dtype='float32',always_2d=True)
        control_sr=100;controls=math.ceil(len(narration)/SR*control_sr);gain=np.ones(controls,np.float32)
        active=np.zeros(len(narration),bool)
        for c in timeline['clips']:
            a=max(0,math.floor((c['start']/fps-.12)*control_sr));b=min(controls,math.ceil((c['end']/fps+.22)*control_sr));gain[a:b]=.55
            active[c['start']*SR//fps:c['end']*SR//fps]=True
        for i in range(1,controls):gain[i]=min(gain[i],gain[i-1]+1/(1.1*control_sr))
        for i in range(controls-2,-1,-1):gain[i]=min(gain[i],gain[i+1]+1/(.16*control_sr))
        music*=np.interp(np.arange(len(narration))/SR,np.arange(controls)/control_sr,gain)[:,None]
        rms=lambda x:float(np.sqrt(np.mean(x.astype(np.float64)**2)))
        music*=rms(narration[active])/max(rms(music[active]),1e-12)/10**(18/20)
        sf.write(pub/'music.wav',music,SR,subtype='PCM_24');sf.write(pre,narration+music,SR,subtype='FLOAT')
        measured=measure_loudness(pre)
        filt='loudnorm=I=-15.5:TP=-1.5:LRA=9:linear=true:'+':'.join(f'{k}={measured[v]}' for k,v in
            [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(pre),'-af',filt,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(pub/'master.wav')],check=True)
        aac=temp/'verification.m4a';subprocess.run(['ffmpeg','-v','error','-y','-i',str(pub/'master.wav'),'-c:a','aac','-b:a','320k',str(aac)],check=True)
        master_metrics=measure_loudness(pub/'master.wav');aac_metrics=measure_loudness(aac)
        if float(aac_metrics['input_tp'])> -1:raise AssertionError('AAC true peak exceeds -1 dBTP')
        if not -16.5<=float(master_metrics['input_i'])<=-14:raise AssertionError('Master loudness outside target band')
        info=sf.info(pub/'master.wav')
        if abs(info.frames-len(narration))>2:raise AssertionError('Mastering changed timeline duration')
        # A matched-loudness before/after preview, plus the beginning with music.
        first=timeline['clips'][0];rawpath=pub/'voice-raw'/f"{first['id']}.wav"
        raw,s=sf.read(rawpath,dtype='float32');g=math.gcd(s,SR);raw=resample_poly(raw,SR//g,s//g)
        processed,_=sf.read(pub/'voice'/f"{first['id']}.wav",dtype='float32')
        raw*=min(4,rms(processed)/max(rms(raw),1e-9));silence=np.zeros(round(.7*SR),np.float32)
        sf.write(pub/'voice-AB-preview.wav',np.concatenate([raw,silence,processed]),SR,subtype='PCM_24')
        final,_=sf.read(pub/'master.wav',dtype='float32',always_2d=True)
        sf.write(pub/'mix-preview.wav',final[:min(len(final),round(24*SR))],SR,subtype='PCM_24')
    report={'trackTitle':'木作回响·亭下新编','sameEpisodeRearrangement':True,'tempoBpm':100,
        'source':'Original deterministic pentatonic arrangement / synthesized plucked strings, bamboo-like line, soft wood pulse',
        'acousticRecordings':False,'foreignMusicSamples':False,'narrationAboveMusicActiveRmsDb':18,
        'duckAttackSeconds':.16,'duckLookaheadSeconds':.12,'duckReleaseSeconds':1.1,
        'musicSha256':sha(pub/'music.wav'),'masterSha256':sha(pub/'master.wav'),'masterFrames':info.frames,
        'masterMeasurement':master_metrics,'aacVerificationMeasurement':aac_metrics,
        'sourceNarrationUnchanged':True,'subjectiveListeningChecked':False,
        'previews':['voice-AB-preview.wav','mix-preview.wav']}
    dump(reports/'audio-mix.json',report);print(json.dumps(report,ensure_ascii=False,indent=2))

def final_qa(args):
    pub=Path(args.public_root);reports=Path(args.report_dir);_,rows=read_rows(args.story)
    timeline=json.loads((pub/'timeline.json').read_text('utf8'));fps=timeline['fps'];ledger=json.loads((reports/'audio-generation.json').read_text('utf8'))
    masters=json.loads((reports/'audio-mastering.json').read_text('utf8'));mix=json.loads((reports/'audio-mix.json').read_text('utf8'))
    rawcheck=json.loads((reports/'audio-raw-check.json').read_text('utf8'));checks=[]
    for row,clip,master in zip(rows,timeline['clips'],masters):
        assert row['id']==clip['id']==master['id']
        raw=pub/'voice-raw'/f"{row['id']}.wav";processed=pub/'voice'/f"{row['id']}.wav"
        spoken,_=spoken_text(row);info=sf.info(processed)
        assert ledger[row['id']]['text']==spoken and ledger[row['id']]['sha256']==sha(raw)
        assert master['rawSha256']==sha(raw) and master['outputSha256']==sha(processed)
        assert info.frames==master['resampledRawFrames']+master['headGuardSamples']+master['tailGuardSamples']
        assert clip['duration']*SR//fps>=info.frames and clip['end']==clip['start']+clip['duration']
        caps=[c for c in timeline['captions'] if c['clip']==row['id']]
        assert ''.join(clean(c['text']) for c in caps)==clean(row['text']),f'Caption coverage differs: {row["id"]}'
        assert all(len(clean(c['text']))<=24 and c['end']>c['start'] for c in caps)
        checks.append({'id':row['id'],'rawFrames':sf.info(raw).frames,'protectedMasterFrames':info.frames,
                       'clipFrames':clip['duration'],'fullTakePreserved':True,'displayTextFullyCaptioned':True})
    assert len(checks)==len(rows)==len(timeline['clips'])==len(masters)
    assert rawcheck['status']=='complete' and len(rawcheck['clips'])==len(rows)
    assert all(a['end']<=b['start'] for a,b in zip(timeline['clips'],timeline['clips'][1:]))
    coda=timeline['scenes'][-1];assert coda['id']=='references' and (coda['end']-coda['start'])/fps>=12
    expected=timeline['duration']*SR//fps
    assert sf.info(pub/'narration.wav').frames==expected and sf.info(pub/'master.wav').frames==expected
    assert mix['masterSha256']==sha(pub/'master.wav') and float(mix['aacVerificationMeasurement']['input_tp'])<=-1
    result={'status':'passed','totalSeconds':timeline['duration']/fps,'rawClips':len(rows),'asrReviewedClips':len(rawcheck['clips']),
        'maxCaptionCharacters':max(len(clean(c['text'])) for c in timeline['captions']),
        'fullTakeSamplePreservation':True,'timeStretch':False,'codaSeconds':(coda['end']-coda['start'])/fps,
        'masterLufs':float(mix['masterMeasurement']['input_i']),'aacTruePeakDbtp':float(mix['aacVerificationMeasurement']['input_tp']),
        'masterSha256':sha(pub/'master.wav'),'timelineSha256':sha(pub/'timeline.json'),
        'asrReviewIds':rawcheck['reviewIds'],'asrMeanCharacterCoverage':rawcheck['meanCharacterCoverage'],
        'subjectiveListeningChecked':False,'humanPronunciationReview':False,'clips':checks}
    dump(reports/'audio-final-qa.json',result);print(json.dumps({k:v for k,v in result.items() if k!='clips'},ensure_ascii=False,indent=2))

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--self-check',action='store_true');p.add_argument('--mix-only',action='store_true');p.add_argument('--qa-only',action='store_true')
    p.add_argument('--story',type=Path,default=REPORTS/'story.json');p.add_argument('--public-root',type=Path,default=PUBLIC)
    p.add_argument('--report-dir',type=Path,default=REPORTS);p.add_argument('--src-timeline',type=Path)
    p.add_argument('--fps',type=int,default=30);p.add_argument('--intro-seconds',type=float,default=.6)
    p.add_argument('--head-guard',type=float,default=.02);p.add_argument('--tail-guard',type=float,default=.18)
    p.add_argument('--sentence-gap',type=float,default=.12);p.add_argument('--scene-gap',type=float,default=.25)
    p.add_argument('--scene-lead',type=float,default=.30);p.add_argument('--coda-seconds',type=float,default=12)
    p.add_argument('--caption-chars',type=int,default=18);p.add_argument('--target-seconds',type=float,default=300)
    args=p.parse_args()
    if args.self_check:
        result=self_check();dump(Path(args.report_dir)/'audio-tool-selfcheck.json',result);print(json.dumps(result,indent=2))
    elif args.mix_only:mix_and_check(args)
    elif args.qa_only:final_qa(args)
    else:prepare(args)

if __name__=='__main__':main()
