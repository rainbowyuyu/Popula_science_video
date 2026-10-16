"""User-selected local piano, long musical phrases and fixed-timeline narration.

Every output stays under this candidate folder; installed files remain untouched.
No pitch shifting, artificial percussion, speech time stretching, or cue hard cuts.
"""
from pathlib import Path
import json,hashlib,subprocess,sys,math
from datetime import datetime,timezone
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d

OUT=Path(__file__).resolve().parent
ROOT=OUT.parents[2]
sys.path.insert(0,str(ROOT/'scripts'))
from mix_v5 import measure
SR=48000;BLOCK=SR*20
def read(p):return json.loads(Path(p).read_text(encoding='utf-8-sig'))
def sha(p):
    h=hashlib.sha256()
    with Path(p).open('rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''):h.update(b)
    return h.hexdigest()
def save(p,x):Path(p).write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
def cmd(x):subprocess.run(x,check=True)
def main():
    tl=read(OUT/'timeline.json');analysis=read(OUT/'music-analysis.json')
    n=tl['durationFrames']*1600;duration=n/SR
    source=Path(analysis['source']);assert sha(source)==analysis['sourceSHA256']
    filtered=OUT/'source-piano-filtered.wav'
    filters='highpass=f=45,equalizer=f=2700:t=q:w=0.7:g=-2.2,lowpass=f=13000'
    cmd(['ffmpeg','-v','error','-y','-i',str(source),'-af',filters,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(filtered)])
    piano,_=sf.read(filtered,dtype='float32',always_2d=True)
    beat=np.array(analysis['beatTimes']);loop_start=float(beat[24])
    loop_ends=[328,216,328,216,328,216,328]
    # Weighted overlap is unity-sum to avoid level bump on correlated piano.
    score=np.memmap(OUT/'score-work.f32',dtype='float32',mode='w+',shape=(n,2));score[:]=0
    segments=[];global_start=0.;source_start=0.;global_beats=[]
    for index,endpoint in enumerate(loop_ends):
        source_end=float(beat[endpoint]);xfade=float(beat[endpoint+8]-beat[endpoint])
        boundary=global_start+source_end-source_start
        end=boundary+xfade
        a=round(global_start*SR);b=min(n,round(end*SR));s=round(source_start*SR)
        material=piano[s:s+b-a].copy()
        if index:
            width=min(len(material),round(segments[-1]['crossfadeSeconds']*SR))
            w=(.5-.5*np.cos(np.linspace(0,np.pi,width))).astype(np.float32)
            score[a:a+width]*=(1-w)[:,None];material[:width]*=w[:,None]
            score[a:a+width]+=material[:width];score[a+width:b]=material[width:]
        else:score[a:b]=material
        segments.append(dict(outputStartSeconds=global_start,sourceStartSeconds=source_start,
            sourceTransitionSeconds=source_end,transitionOutputSeconds=boundary,crossfadeSeconds=xfade,
            repeatedBodyBeats=endpoint-24 if index else endpoint,
            nextSourceSeconds=loop_start,method='same 4-beat phase; 8-beat raised-cosine unity-sum crossfade'))
        global_beats.extend((global_start+beat[(beat>=source_start)&(beat<source_end)]-source_start).tolist())
        global_start=boundary;source_start=loop_start
    # Continue the normal phrase loop until the matched final natural coda.
    a=round(global_start*SR);s=round(source_start*SR);count=n-a
    if s+count>len(piano):raise ValueError('Insufficient piano for final segment')
    material=piano[s:s+count].copy();width=round(segments[-1]['crossfadeSeconds']*SR)
    w=(.5-.5*np.cos(np.linspace(0,np.pi,width))).astype(np.float32)
    score[a:a+width]*=(1-w)[:,None];material[:width]*=w[:,None]
    score[a:a+width]+=material[:width];score[a+width:]=material[width:]
    global_beats.extend((global_start+beat[(beat>=source_start)&(beat<source_start+count/SR)]-source_start).tolist())
    # Choose a harmonically compatible end bridge; original tail remains unpitched.
    arrays=np.load(OUT/'music-analysis-arrays.npz');chroma=arrays['chroma'];grid=np.arange(chroma.shape[1])*256/22050
    candidates=[]
    for i,original_time in enumerate(beat):
        final_start=global_start+original_time-source_start
        if not max(global_start+8,duration-52)<final_start<duration-18:continue
        for j,tail_time in enumerate(beat):
            if (j-i)%4 or tail_time<145:continue
            tail_end=final_start+len(piano)/SR-tail_time
            if not duration-1.8<=tail_end<=duration:continue
            q=np.linspace(0,3.4,80)
            ca=np.stack([np.interp(original_time+q,grid,c) for c in chroma]);cb=np.stack([np.interp(tail_time+q,grid,c) for c in chroma])
            ca/=np.maximum(np.linalg.norm(ca,axis=0),1e-6);cb/=np.maximum(np.linalg.norm(cb,axis=0),1e-6)
            harmonic=float(np.mean(np.sum(ca*cb,axis=0)))
            candidates.append(dict(outputStartSeconds=float(final_start),sourceStartSeconds=float(tail_time),
                chromaCosine=harmonic,phaseErrorBeats=0,fromBeatIndex=i,toBeatIndex=j,
                naturalCodaEndSeconds=float(tail_end),terminalSilenceSeconds=duration-tail_end,
                score=harmonic-.01*(duration-tail_end)))
    coda=max(candidates,key=lambda x:x['score']);a=round(coda['outputStartSeconds']*SR);s=round(coda['sourceStartSeconds']*SR)
    width=round(3.4*SR);w=(.5-.5*np.cos(np.linspace(0,np.pi,width))).astype(np.float32)
    score[a:a+width]*=(1-w)[:,None];score[a:a+width]+=piano[s:s+width]*w[:,None]
    last=a+len(piano)-s
    score[a+width:last]=piano[s+width:]
    score[last:]=0
    # Original natural coda plus a short terminal tail fade; no chopped piano note.
    fade=round(2.2*SR);score[-fade:]*=(.5+.5*np.cos(np.linspace(0,np.pi,fade))).astype(np.float32)[:,None]
    fadein=round(.18*SR);score[:fadein]*=np.linspace(0,1,fadein,dtype=np.float32)[:,None]
    score.flush()
    # Reconstruct unique dry narration from unchanged locked master stem and new h001 only.
    narration=OUT/'narration.wav'
    with sf.SoundFile(ROOT/'public/narration.wav') as reader,sf.SoundFile(narration,'w',samplerate=SR,channels=1,subtype='PCM_24') as writer:
        opening,rate=sf.read(OUT/'opening/c/h001.wav',dtype='float32');assert rate==SR
        start=12*1600;slot_end=297*1600
        for offset in range(0,n,BLOCK):
            data=reader.read(min(BLOCK,n-offset),dtype='float32');assert data.ndim==1
            left=max(offset,start);right=min(offset+len(data),slot_end)
            if right>left:
                data[left-offset:right-offset]=0
                right=min(right,start+len(opening))
                if right>left:data[left-offset:right-offset]=opening[left-start:right-start]
            writer.write(data)
    voice,_=sf.read(narration,dtype='float32');hop=480
    rms=np.sqrt(np.mean(voice[:n//hop*hop].reshape(-1,hop)**2,axis=1));threshold=max(.002,float(rms.max())*.06)
    active=rms>threshold;vrms=float(np.sqrt(np.mean(rms[active]**2)))
    mrms=float(np.sqrt(np.mean(np.asarray(score[::40],dtype='float64')**2)))
    # Slow content arcs stay on the same performance and gently change piano prominence.
    # Knots snap to the nearest measured output beat (not claimed precise score downbeats).
    cue_db={'warm':18.5,'mechanism':20.,'action':17.8,'evidence':20.5,'reflect':19.5,'resolve':17.8}
    times=np.arange(math.ceil(n/hop)+1)/100
    control=np.full(len(times),10**(-15.8/20),dtype=np.float64)
    for c in tl['clips']:
        duck=10**(-cue_db[c.get('musicCue','mechanism')]/20)
        start=c['startSeconds']-.12;end=c['voiceEndSeconds']+.30
        lo=max(0,math.floor(start*100));hi=min(len(times),math.ceil((end+1.25)*100));tt=times[lo:hi]
        recover=np.clip((tt-end)/1.25,0,1)
        envelope=duck+(10**(-15.8/20)-duck)*(.5-.5*np.cos(np.pi*recover))
        control[lo:hi]=np.minimum(control[lo:hi],envelope)
    control=gaussian_filter1d(control,5)*vrms/mrms
    macro_inputs=[('h001',0.),('h014',-.7),('h033',-.3),('h045',-.6),('h069',-1.0),('h078',.5),('h089',0.)]
    knots=[]
    for sid,db in macro_inputs:
        t=next(c['startSeconds'] for c in tl['clips'] if c['id']==sid)
        nearby=min(global_beats,key=lambda b:abs(b-t))
        knots.append(dict(id=sid,desiredTime=t,beatAlignedTime=nearby,gainDb=db))
    macro=np.zeros(len(times))
    for j,k in enumerate(knots):
        next_time=knots[j+1]['beatAlignedTime'] if j+1<len(knots) else duration
        select=(times>=k['beatAlignedTime'])&(times<next_time);macro[select]=k['gainDb']
    macro=gaussian_filter1d(macro,240);control*=10**(macro/20)
    music=OUT/'music.wav';pre=OUT/'premaster.wav';ve=me=0.;bycue={k:[0.,0.,0] for k in cue_db}
    with sf.SoundFile(music,'w',samplerate=SR,channels=2,subtype='PCM_24') as mb,sf.SoundFile(pre,'w',samplerate=SR,channels=2,subtype='FLOAT') as pm:
        for offset in range(0,n,BLOCK):
            count=min(BLOCK,n-offset);g=np.interp(np.arange(offset,offset+count)/hop,np.arange(len(control)),control).astype(np.float32)
            m=np.asarray(score[offset:offset+count])*g[:,None];v=voice[offset:offset+count]
            mb.write(m);pm.write(m+v[:,None])
            rows=len(v)//hop;venergy=np.mean(v[:rows*hop].reshape(-1,hop).astype(np.float64)**2,axis=1)
            menergy=np.mean(m[:rows*hop].reshape(-1,hop,2).astype(np.float64)**2,axis=(1,2));act=np.sqrt(venergy)>threshold
            ve+=float(venergy[act].sum());me+=float(menergy[act].sum());wt=(offset+np.arange(rows)*hop)/SR
            for c in tl['clips']:
                selected=act&(wt>=c['startSeconds'])&(wt<c['voiceEndSeconds'])
                if selected.any():
                    e=bycue[c.get('musicCue','mechanism')];e[0]+=float(venergy[selected].sum());e[1]+=float(menergy[selected].sum());e[2]+=int(selected.sum())
    measured=measure(pre);master=OUT/'master.wav'
    filt=(f"loudnorm=I=-15:TP=-2:LRA=11:measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:"
          f"measured_LRA={measured['input_lra']}:measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:"
          f'linear=true:print_format=none,aresample={SR},apad=whole_len={n},atrim=end_sample={n}')
    cmd(['ffmpeg','-v','error','-y','-i',str(pre),'-af',filt,'-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(master)])
    measurement=measure(master);aac=OUT/'master-aac-check.m4a'
    cmd(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','320k',str(aac)])
    aac_measurement=measure(aac)
    extracts=[]
    for label,start,span in [('opening',0,25),('glp1',220,22),('lipids',346,22),('pressure',477,22),('clot',645,22),('actions',730,22),('ending',829,duration-829)]:
        p=OUT/f'check-{label}.m4a';cmd(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(master),'-t',str(span),'-c:a','aac','-b:a','256k',str(p)])
        extracts.append(dict(path=str(p),sha256=sha(p),startSeconds=start,durationSeconds=span,subjectiveListeningChecked=False))
    # All original narration after h001 is sample-identical, including prior polyphone repairs.
    same=True
    with sf.SoundFile(ROOT/'public/narration.wav') as old,sf.SoundFile(narration) as new:
        old.seek(slot_end);new.seek(slot_end)
        while True:
            a=old.read(BLOCK,dtype='int32');b=new.read(BLOCK,dtype='int32')
            if not len(a):break
            if not np.array_equal(a,b):same=False;break
    if not same:raise ValueError('Later narration changed')
    provenance=dict(createdAtUTC=datetime.now(timezone.utc).isoformat(),sourcePath=str(source),sourceSHA256=sha(source),
        sourceType='User-selected local piano recording; local editing requested; distribution license not independently verified',
        musicTitle='幽蓝键 - Lemon Tree (柠檬树) - 钢琴曲',estimatedBpm=analysis['estimatedBpm'],
        tempoPolicy='Original performance timing retained; no pitch shift, no added percussion; estimator BPM is approximate',
        phraseSegments=segments,coda=coda,codaCrossfadeSeconds=3.4,contentKnots=knots,eq=filters,
        totalFrames=tl['durationFrames'],durationSeconds=duration,totalSamples=n,sampleRate=SR,voiceSpeedFactor=1,
        h002AndLaterNarrationSampleIdentical=True,openingReplacementOnly=True,
        ducking='120 ms anticipation, 300 ms hold, 1.25 s recovery; minimum across nearby takes; 50 ms smoothing',
        targetVoiceOverMusicDBByCue=cue_db,voiceOverMusicActiveDB=10*math.log10(ve/me),
        measuredVoiceOverMusicDBByCue={k:10*math.log10(a/b) for k,(a,b,c) in bycue.items() if c},
        masterMeasurement=measurement,aacMeasurement=aac_measurement,premasterMeasurement=measured,
        hashes={name:sha(OUT/name) for name in ['master.wav','narration.wav','music.wav','timeline.json','story-v5.json','GLP1-v5-subtitles.srt','master-aac-check.m4a']},
        originalNarrationSHA256=sha(ROOT/'public/narration.wav'),extracts=extracts,
        subjectiveListeningChecked=False,limitations=['BPM and chord-boundary choice use numerical audio analysis, not manual score transcription.','No full subjective listening completed.'],
        scriptSHA256=sha(__file__))
    save(OUT/'audio-report.json',provenance)
    del score
    # Reproducible temporary PCM buffer only, after successful finished WAV/report.
    (OUT/'score-work.f32').unlink()
    print(json.dumps({k:provenance[k] for k in ['masterMeasurement','aacMeasurement','voiceOverMusicActiveDB','measuredVoiceOverMusicDBByCue','h002AndLaterNarrationSampleIdentical','coda']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
