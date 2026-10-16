"""Musical phrase loops, anticipatory narration ducking and measured final master."""
import json,subprocess,shutil
import numpy as np
import soundfile as sf
from scipy.ndimage import gaussian_filter1d
from scipy.signal import butter,sosfilt
from audio_common import ROOT,OUT,MUSIC,SR,sha,save,measure

def arrange_music(narr):
    source=OUT/'music-source.wav'
    analysis=json.loads((OUT/'music-analysis.json').read_text(encoding='utf8'))
    if sha(MUSIC)!=analysis['sourceSha256']:raise RuntimeError('Source music changed; rerun audio_music_analyze.py')
    if not source.exists():
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(MUSIC),'-ar',str(SR),'-ac','2','-c:a','pcm_f32le',str(source)],check=True)
    x,sr=sf.read(source,dtype='float32',always_2d=True);assert sr==SR
    # Keep almost the entire original first pass, then return to a matching phrase.
    # Both boundaries are detected beat positions 48 bars apart (96.53 seconds).
    # Beat 232 is before the outro, where tracker intervals become unstable.
    loop=next(c for c in analysis['phraseCandidates'] if c['startBeat']==40 and c['endBeat']==232)
    a=round(loop['startSec']*SR);b=round(loop['endSec']*SR);period=b-a
    n=round(narr['durationSec']*SR);y=np.zeros((n,2),np.float32)
    first=min(n,b);y[:first]=x[:first];joins=[];segments=[{'timelineStartSec':0,'sourceStartSec':0,'sourceEndSec':first/SR}]
    cross=round((analysis['beatTimesSec'][40]-analysis['beatTimesSec'][36])*SR)
    at=b
    while at<n:
        # Raised-cosine complementary gains preserve amplitude at correlated beats.
        # A short common-level blend avoids the +3 dB swelling of equal-power fades.
        fade=(.5-.5*np.cos(np.linspace(0,np.pi,cross))).astype(np.float32)
        y[at-cross:at]=y[at-cross:at]*(1-fade[:,None])+x[a-cross:a]*fade[:,None]
        count=min(period,n-at);y[at:at+count]=x[a:a+count]
        joins.append({'atSec':at/SR,'crossfadeStartSec':(at-cross)/SR,'crossfadeSeconds':cross/SR,
                      'sourceReturnSec':a/SR,'sourceDepartureSec':b/SR,'beatAligned':True})
        segments.append({'timelineStartSec':at/SR,'sourceStartSec':a/SR,'sourceEndSec':(a+count)/SR})
        at+=period
    # A quiet entry makes room for the cold-open line, and the complete coda resolves softly.
    entry=min(round(1.3*SR),n);y[:entry]*=np.sin(np.linspace(0,np.pi/2,entry))[:,None]**2
    tail=min(round(5.5*SR),n);y[-tail:]*=np.cos(np.linspace(0,np.pi/2,tail))[:,None]**2
    beats=[]
    for seg in segments:
        for t in analysis['beatTimesSec']:
            if seg['sourceStartSec']<=t<seg['sourceEndSec']:
                beats.append(seg['timelineStartSec']+t-seg['sourceStartSec'])
    # Keep decoded MP3 overshoots in float until the deliberate level reduction.
    path=OUT/'score.wav';sf.write(path,y,SR,subtype='FLOAT')
    manifest={'title':MUSIC.stem,'sourcePath':str(MUSIC),'sourceSha256':sha(MUSIC),'arrangedSha256':sha(path),
       'estimatedBpm':analysis['estimatedBpm'],'loop':loop,'joins':joins,'segments':segments,'beatTimesSec':beats,
       'timeStretch':False,'pitchShift':False,'stereoPreserved':True,'subjectiveListeningChecked':False,
       'loopMethod':'Keep original opening; matched bar-phase repeat with 1-bar raised cosine complementary crossfade; final 5.5s musical release'}
    save(OUT/'music-arrangement.json',manifest)
    return path,manifest

def main():
    narr=json.loads((OUT/'narration.json').read_text(encoding='utf8'));duration=narr['durationSec']
    voice,sr=sf.read(OUT/'narration.wav',dtype='float32',always_2d=True)
    assert sr==SR and len(voice)==round(duration*SR)
    musicpath,arr=arrange_music(narr);music,ms=sf.read(musicpath,dtype='float32',always_2d=True)
    stats=measure(musicpath);music*=10**((-25.0-float(stats['input_i']))/20)
    # Gentle speech-band room without making the piano/synths disappear.
    band=sosfilt(butter(2,[1700,4200],btype='bandpass',fs=SR,output='sos'),music,axis=0)
    music=(music-.28*band).astype(np.float32)
    activity=np.zeros(int(np.ceil(duration*100)),np.float32)
    for c in narr['cues']:
        a=max(0,round((c['startSec']-.18)*100));b=min(len(activity),round((c['endSec']+.26)*100));activity[a:b]=1
    smooth=gaussian_filter1d(activity,22)
    envelope=np.interp(np.arange(len(voice))/SR,np.arange(len(smooth))/100,smooth).astype(np.float32)
    music*=10**((-4.4*envelope[:,None])/20)
    # Sparse evidence/counting moments breathe without abrupt score replacement.
    points=[]
    for g in narr['groups']:
        strength=float(g.get('musicDb',-.8 if g['id'] in ('exchange','identity','verification') else 0))
        points.append(((g['startSec']+g['endSec'])/2,strength))
    if points:
        curve=np.interp(np.arange(len(music))/SR,[p[0] for p in points],[p[1] for p in points])
        music*=10**(curve[:,None]/20)
    premaster=OUT/'premaster.wav';sf.write(premaster,voice+music,SR,subtype='PCM_24');sf.write(OUT/'score-ducked.wav',music,SR,subtype='PCM_24')
    v=measure(premaster)
    filt=(f"loudnorm=I=-16:TP=-1.5:LRA=9:measured_I={v['input_i']}:measured_TP={v['input_tp']}:"
          f"measured_LRA={v['input_lra']}:measured_thresh={v['input_thresh']}:offset={v['target_offset']}:linear=true")
    master=OUT/'master.wav'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(premaster),'-af',f'apad=pad_len={SR//2},{filt},aresample={SR},atrim=end_sample={len(voice)}',
                    '-ar',str(SR),'-ac','2','-c:a','pcm_s24le',str(master)],check=True)
    aac=OUT/'master-preview.m4a'
    subprocess.run(['ffmpeg','-v','error','-y','-i',str(master),'-c:a','aac','-b:a','256k','-t',str(duration),str(aac)],check=True)
    final=measure(master);aacstats=measure(aac);info=sf.info(master)
    assert info.frames==len(voice) and info.channels==2 and info.samplerate==SR
    assert -17<=float(final['input_i'])<=-14
    assert float(aacstats['input_tp'])<=-1
    silence=subprocess.run(['ffmpeg','-hide_banner','-i',str(master),'-af','silencedetect=noise=-50dB:d=1','-f','null','-'],capture_output=True,text=True,encoding='utf8',errors='replace',check=True)
    previews=[('preview-opening.mp3',0,30)]
    for i,j in enumerate(arr['joins']):previews.append((f'preview-loop-{i+1}.mp3',j['atSec']-6,12))
    for name,start,length in previews:
        subprocess.run(['ffmpeg','-v','error','-y','-ss',str(start),'-i',str(master),'-t',str(length),'-c:a','libmp3lame','-b:a','192k',str(OUT/name)],check=True)
    public=ROOT/'public/audio';public.mkdir(parents=True,exist_ok=True);shutil.copy2(master,public/'master.wav')
    shutil.copy2(OUT/'narration.wav',public/'narration.wav')
    active=envelope>.8
    difference=20*np.log10(max(float(np.sqrt(np.mean(voice[active]**2))),1e-9)/max(float(np.sqrt(np.mean(music[active]**2))),1e-9))
    report={'durationSec':duration,'sampleRate':SR,'channels':2,'samples':info.frames,'exactDuration':True,
        'voiceSource':'user local Qwen3-TTS-0.6B and existing personal rainbow fish clone reference',
        'narrationCueCount':len(narr['cues']),'timeStretch':False,'voiceTruncation':False,
        'musicTitle':MUSIC.stem,'sourceMusicSha256':sha(MUSIC),'musicNormalizationBeforeDuckLUFS':-25,
        'duckDb':4.4,'voiceMusicRmsDifferenceDb':float(difference),'musicLoopJoins':arr['joins'],
        'masterWav':final,'encodedAAC':aacstats,'subjectiveListeningChecked':False,
        'silenceDetect':[x.strip() for x in silence.stderr.splitlines() if 'silence_start:' in x or 'silence_end:' in x],
        'files':[{'path':p.relative_to(ROOT).as_posix(),'sha256':sha(p)} for p in (master,public/'master.wav',OUT/'narration.wav',musicpath,aac)]}
    save(OUT/'audio-qa.json',report)
    print(json.dumps({k:v for k,v in report.items() if k!='files'},ensure_ascii=False,indent=2),flush=True)

if __name__=='__main__':main()
