"""Build v4 from its own plan; preserve all camera/visual/title metadata.

Measured take lengths, no time stretching, fresh original music and conservative
AAC headroom. ASR is evidence, not a claim of subjective listening.
"""
from pathlib import Path
import hashlib,json,subprocess,math,difflib
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from qc import caption_parts,chars,map_times

R=Path(__file__).resolve().parents[1];SR=48000;FPS=60;SECONDS=105
def read(p):return json.loads(p.read_text('utf-8-sig'))
def write(p,d):
    p.parent.mkdir(parents=True,exist_ok=True)
    tmp=p.with_suffix(p.suffix+'.tmp');tmp.write_text(json.dumps(d,ensure_ascii=False,indent=2)+'\n','utf8');tmp.replace(p)
def run(a):return subprocess.run(a,capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def stamp(ms):
    h,ms=divmod(round(ms),3600000);m,ms=divmod(ms,60000);s,ms=divmod(ms,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'
def loudness(path):
    x=run(['ffmpeg','-hide_banner','-nostats','-i',str(path),'-af','loudnorm=I=-16:TP=-2.4:LRA=8:print_format=json','-f','null','-'])
    return json.loads(x.stderr[x.stderr.rfind('{'):x.stderr.rfind('}')+1])

plan=read(R/'research/launch-v4-voice-plan.json')
story=read(R/'src/launch-story.json')
story['revision']='launch-105-product-film-v4';story['audio']='audio/launch-v4-master.wav'
n=SR*SECONDS;voice=np.zeros((n,2),np.float32);activity=np.zeros(n,np.float32)
placements=[];captions=[];asr_review=[]
for scene in story['scenes']:
    rows=[x for x in plan['shots'] if x['scene']==scene['id']]
    loaded=[]
    for row in rows:
        p=R/'public/voice'/f"{row['id']}.wav"
        x,sr=sf.read(p,always_2d=True,dtype='float32')
        if sr!=SR:raise ValueError(f'{p.name}: {sr}')
        loaded.append((row,p,x))
    total=sum(len(x)/SR for _,_,x in loaded)+.18*max(0,len(loaded)-1)
    window=scene['duration']/FPS
    if total>window-.40:raise RuntimeError(f"VOICE DOES NOT FIT {scene['id']}: {total:.2f}s / {window}s")
    local=min(.55,max(.22,(window-total)/3));scene['clips']=[]
    for row,p,x in loaded:
        mono=x.mean(axis=1);blocks=mono[:len(mono)//960*960].reshape(-1,960)
        rms=np.sqrt(np.mean(blocks**2,axis=1));mask=np.repeat(rms>max(.002,float(rms.max())*.06),960)
        active=mono[:len(mask)][mask]
        gain=min(.105/max(float(np.sqrt(np.mean(active**2))),1e-8),.58/max(float(np.abs(mono).max()),1e-8))
        x=np.repeat(mono[:,None],2,axis=1)*gain
        at=round((scene['start']/FPS+local)*SR);voice[at:at+len(x)]+=x
        activity[max(0,at-round(.13*SR)):min(n,at+len(x)+round(.26*SR))]=1
        seconds=len(x)/SR;offset=(scene['start']/FPS+local)*1000
        asr=read(R/'audio/asr'/f"{row['id']}.json")
        if asr.get('sourceSHA256')!=sha(p):raise RuntimeError('Stale ASR '+row['id'])
        target,mapping,ratio=map_times(row['text'],asr['words'],seconds)
        literal_ratio=difflib.SequenceMatcher(None,chars(row['text']),chars(asr['heard']),autojunk=False).ratio()
        parts=caption_parts(row['text'],20);partcaps=[];pos=0
        for i,part in enumerate(parts):
            units=len(chars(part));a=mapping[pos][0];b=mapping[pos+units-1][1];pos+=units
            partcaps.append(dict(id=f"{row['id']}-{i}",sourceClip=row['id'],text=part,
                startMs=round(offset+a*1000),endMs=round(offset+min(seconds,b+.10)*1000)))
        # Expand a short fragment into adjacent silence without crossing another subtitle.
        for i,c in enumerate(partcaps):
            left=partcaps[i-1]['endMs'] if i else round(offset)
            right=partcaps[i+1]['startMs'] if i+1<len(partcaps) else round(offset+seconds*1000)
            if c['endMs']-c['startMs']<600:
                c['endMs']=min(right,max(c['endMs'],c['startMs']+600))
                c['startMs']=max(left,min(c['startMs'],c['endMs']-600))
            if c['endMs']<=c['startMs']:raise RuntimeError('Collapsed caption '+c['id'])
        captions.extend(partcaps)
        clip=dict(id=row['id'],**{'from':round(local*FPS)},frames=math.ceil(seconds*FPS),
                  file='voice/'+p.name,text=row['text'],ttsText=row['ttsText'],audioSHA256=sha(p))
        scene['clips'].append(clip)
        placements.append(dict(scene=scene['id'],id=row['id'],start=at/SR,duration=seconds,
            sourceSHA256=sha(p),gain=gain,asrRatio=literal_ratio,alignmentRatio=ratio))
        qwen_path=R/'audio/asr-qwen-v4'/f"{row['id']}.json"
        independent=read(qwen_path) if qwen_path.exists() else None
        if independent and independent['sourceSHA256']!=sha(p):raise RuntimeError('Stale independent ASR '+row['id'])
        asr_review.append(dict(id=row['id'],rawASRRatio=literal_ratio,heard=asr['heard'],expected=row['text'],ttsInput=row['ttsText'],
            independentASR=independent,
            raw=read(R/'audio/takes'/f"{row['id']}.json")['raw'],processed=p.relative_to(R).as_posix(),
            sha256=sha(p),flags=asr.get('flags',[]),subjectiveListeningChecked=False,pronunciationListeningVerified=False))
        local+=seconds+.18
    scene['voice']=''.join(x['text'] for x in rows)
for a,b in zip(captions,captions[1:]):a['endMs']=min(a['endMs'],b['startMs'])
if any(c['endMs']<=c['startMs'] for c in captions):raise RuntimeError('Caption order')
out=R/'public/audio';out.mkdir(exist_ok=True)
sf.write(out/'launch-v4-narration.wav',voice,SR,subtype='PCM_24')
score,sr=sf.read(out/'launch-v4-score-original.wav',always_2d=True,dtype='float32')
if sr!=SR or len(score)!=n:raise RuntimeError('Score specification mismatch')
# About 17 dB below speech during activity, with a calm continuous release.
score*=.78
envelope=gaussian_filter1d(activity[::480],sigma=26)
envelope=np.interp(np.arange(n),np.arange(len(envelope))*480,envelope)
music=score*np.power(10,(-5.8*envelope)/20)[:,None]
sf.write(out/'launch-v4-music.wav',music,SR,subtype='PCM_24')
premaster=out/'launch-v4-premaster.wav';sf.write(premaster,voice+music,SR,subtype='FLOAT')
stats=loudness(premaster)
filt=f"loudnorm=I=-16:TP=-2.4:LRA=8:measured_I={stats['input_i']}:measured_TP={stats['input_tp']}:measured_LRA={stats['input_lra']}:measured_thresh={stats['input_thresh']}:offset={stats['target_offset']}:linear=true"
master=out/'launch-v4-master.wav'
run(['ffmpeg','-v','error','-y','-i',str(premaster),'-af',filt,'-ar',str(SR),'-c:a','pcm_s24le',str(master)])
# Test the actual AAC codec before the expensive video render.
aac=R/'work/audio-v4/aac-check.m4a';aac.parent.mkdir(parents=True,exist_ok=True)
run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','320k',str(aac)])
aacstats=loudness(aac)
if float(aacstats['input_tp'])>=-1.8:
    attenuation=-1.95-float(aacstats['input_tp'])
    replacement=master.with_name('launch-v4-master-headroom.wav')
    run(['ffmpeg','-v','error','-y','-i',str(master),'-af',f'volume={attenuation}dB','-c:a','pcm_s24le',str(replacement)])
    replacement.replace(master)
    run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','320k',str(aac)])
    aacstats=loudness(aac)
if float(aacstats['input_tp'])>=-1.8:raise RuntimeError('AAC true peak does not pass')
story['narrationNote']='V4 measured Qwen3-TTS-flash-realtime / Ethan public-voice narration; all 16 lines share one voice. Camera and design fields preserved; new original 4/4 score. CPU Whisper alignment and independent Qwen ASR. Subjective listening remains unverified.'
write(R/'src/launch-story.json',story);write(R/'src/launch-captions.json',captions)
write(R/'research/launch-v4-story-frozen.json',story)
(R/'delivery/AI-Engineer-Launch-v4.zh.srt').write_text('\n\n'.join(f"{i+1}\n{stamp(c['startMs'])} --> {stamp(c['endMs'])}\n{c['text']}" for i,c in enumerate(captions))+'\n','utf8')
active=activity>.5
report=dict(seconds=SECONDS,frames=6300,sampleRate=SR,placements=placements,masterSHA256=sha(master),
    subjectiveListeningChecked=False,pronunciationListeningVerified=False,
    speechOverMusicDb=float(20*np.log10(np.sqrt(np.mean(voice[active]**2))/np.sqrt(np.mean(music[active]**2)))),
    loudnessFirstPass=stats,aacTest=dict(path=aac.relative_to(R).as_posix(),sha256=sha(aac),loudness=aacstats,
        truePeakTarget='strictly below -1.8 dBTP',passed=True),minimumCaptionMs=min(c['endMs']-c['startMs'] for c in captions))
write(R/'research/qa/launch-v4-audio.json',report)
write(R/'research/qa/launch-v4-voice-selection.json',dict(takes=asr_review,
    rawASRTarget=.95,belowTarget=[x['id'] for x in asr_review if x['rawASRRatio']<.95],
    independentBelowTarget=[x['id'] for x in asr_review if not x['independentASR'] or x['independentASR']['ratio']<.95],
    averageRawASRRatio=sum(x['rawASRRatio'] for x in asr_review)/len(asr_review),
    normalization='Only punctuation, simplified/traditional orthography, Arabic numeral spelling. Homophones are not normalized into a pass.',
    subjectiveListeningChecked=False,manualListeningStatus='pending',
    limitation='No callable listening evaluation tool is available. ASR, waveform and codec checks do not certify subjective voice pleasantness.'))
print(json.dumps(dict(seconds=SECONDS,clips=len(placements),captions=len(captions),speechOverMusicDb=report['speechOverMusicDb'],aacMeasuredI=aacstats['input_i'],aacTruePeak=aacstats['input_tp']),ensure_ascii=False))
