"""Generate one selected Chinese woodwork bed plus three short alternatives.
The master contains exactly one score plus rainbow鱼 narration; previews are
kept separate so they cannot accidentally be mixed into the film."""
from pathlib import Path
import hashlib,json,subprocess
import numpy as np,soundfile as sf
from scipy.signal import lfilter
R=Path(__file__).resolve().parents[1]; P=R/'public/episode3v2'; Q=R/'research/episode3v2'; O=P/'music'; O.mkdir(exist_ok=True)
voice,sr=sf.read(P/'narration.wav',dtype='float32',always_2d=True); N=len(voice); dur=N/sr
notes=np.array([146.832,164.814,196.0,220.0,261.626,293.665,329.628,392.0])
def pluck(t,f,gain,decay):
    env=(1-np.exp(-t/.008))*np.exp(-t/decay)
    return gain*env*(np.sin(2*np.pi*f*t)+.28*np.sin(4*np.pi*f*t)+.08*np.sin(6*np.pi*f*t))
def make(kind,bpm):
    beat=60/bpm; score=np.zeros((N,2),np.float32)
    if kind=='bamboo-dawn': phrase=[0,2,4,5,7,5,4,2]; step=1; gain=.10; decay=1.15
    elif kind=='ink-rain': phrase=[0,1,3,4,6,4]; step=1.33; gain=.075; decay=2.0
    else: phrase=[0,2,3,5,7,5,3,2]; step=.92; gain=.065; decay=.48
    for bar,t0 in enumerate(np.arange(.6,dur-1,beat*8)):
        for j,idx in enumerate(phrase):
            st=int((t0+j*beat*step)*sr); ln=min(int((2.0 if kind!='ink-rain' else 3.6)*sr),N-st)
            if ln<=0: continue
            t=np.arange(ln)/sr; f=notes[(idx+bar)%len(notes)]*(2 if kind=='courtyard-spark' and j in [0,4] else 1)
            w=pluck(t,f,gain,decay); pan=.3+.4*((j+bar)%2)
            score[st:st+ln,0]+=w*np.sqrt(1-pan); score[st:st+ln,1]+=w*np.sqrt(pan)
    for k,t0 in enumerate(np.arange(2,dur,18 if kind=='ink-rain' else 14)):
        st=int(t0*sr); ln=min(int((10 if kind=='ink-rain' else 7)*sr),N-st)
        if ln<=0: continue
        t=np.arange(ln)/sr; f=notes[(k+2)%len(notes)]/2; env=np.minimum(1,t/1.4)*np.minimum(1,(ln/sr-t)/1.6)
        score[st:st+ln]+=(.014*env*np.sin(2*np.pi*f*t))[:,None]
    for sec in [0,44,77,109,132,161,188,216,253,286]:
        st=int(sec*sr); ln=min(int(.32*sr),N-st); t=np.arange(ln)/sr
        score[st:st+ln]+=(.04*np.exp(-t*13)*np.sin(2*np.pi*92*t))[:,None]
    active=np.max(np.abs(voice),axis=1)>.012; vr=np.sqrt(np.mean(voice[active]**2)); mr=np.sqrt(np.mean(score[active]**2)); score*=vr/(max(mr,1e-9)*10**(20/20))
    speech=(np.max(np.abs(voice),axis=1)>.015).astype(np.float32); duck=lfilter([.035],[1,-.965],speech); score*=np.repeat(1-.32*duck,1)[:,None]
    fade=np.minimum(1,np.arange(N)/sr/2)*np.minimum(1,(N-1-np.arange(N))/sr/4); return score*fade[:,None]
choices=[('bamboo-dawn','竹影行',94),('ink-rain','墨雨听檐',78),('courtyard-spark','院中轻响',100)]
alt=[]
for kind,title,bpm in choices:
    y=make(kind,bpm); sf.write(O/f'{kind}-preview.wav',y[:int(24*sr)],sr,subtype='PCM_16')
    alt.append({'style':kind,'title':title,'tempoBpm':bpm,'preview':f'music/{kind}-preview.wav','sha256':hashlib.sha256((O/f'{kind}-preview.wav').read_bytes()).hexdigest()})
selected=O/'bamboo-dawn.wav'; y=make('bamboo-dawn',94); sf.write(selected,y,sr,subtype='PCM_24')
sf.write(P/'premaster.wav',voice+y,sr,subtype='PCM_24')
probe=subprocess.run(['ffmpeg','-hide_banner','-i',str(P/'premaster.wav'),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True)
a=json.JSONDecoder().raw_decode(probe.stderr[probe.stderr.rfind('{'):])[0]
flt='loudnorm=I=-16:TP=-1.5:LRA=9:linear=true:'+':'.join(f'{k}={a[v]}' for k,v in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
subprocess.run(['ffmpeg','-y','-v','error','-i',str(P/'premaster.wav'),'-af',flt,'-ar','48000','-c:a','pcm_s24le',str(P/'master.wav')],check=True)
manifest={'selected':{'title':'竹影行','style':'bamboo-dawn','tempoBpm':94,'file':'music/bamboo-dawn.wav','sha256':hashlib.sha256(selected.read_bytes()).hexdigest()},'alternatives':alt,'musicReused':False,'singleBedMix':True,'composer':'rainbow鱼 original guqin-xiao-yangqin procedural score','targetLufs':-16,'targetTruePeak':-1.5,'premasterMeasurement':a,'subjectiveListeningChecked':False}
(Q/'audio-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8'); print('music options ready')
