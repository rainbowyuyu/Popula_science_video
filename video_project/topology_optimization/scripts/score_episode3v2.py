from pathlib import Path
import numpy as np, soundfile as sf, json, subprocess, hashlib
from scipy.signal import lfilter

R=Path.cwd(); P=R/'public/episode3v2'; Q=R/'research/episode3v2'
y,sr=sf.read(P/'narration.wav',dtype='float32')
if y.ndim>1: y=y.mean(axis=1)
N=len(y); dur=N/sr; music=np.zeros((N,2),np.float32)
notes=np.array([146.832,164.814,184.997,220.,246.942,293.665,329.628,369.994,440.])
phrases=[[0,2,4,7,4,2],[1,3,5,7,5,3],[2,4,6,8,6,4],[0,3,4,6,4,1]]; beat=60/92
for bar,t0 in enumerate(np.arange(.7,dur-2,beat*8)):
    for j,idx in enumerate(phrases[bar%4]):
        st=int((t0+j*beat*(1.15 if j<4 else 1.32))*sr); ln=min(int(3.8*sr),N-st)
        if ln<=0: continue
        t=np.arange(ln)/sr; f=notes[idx]; env=(1-np.exp(-t/.012))*np.exp(-t/1.8)
        tone=np.sin(2*np.pi*f*t)+.48*np.sin(2*np.pi*f*2*t)+.18*np.sin(2*np.pi*f*3*t)
        wave=tone*env*.15; pan=.35+.3*np.sin(j*.8+bar)
        music[st:st+ln,0]+=wave*np.sqrt(1-pan); music[st:st+ln,1]+=wave*np.sqrt(pan)
# Light yangqin-like plucks add motion while leaving narration space.
for bar,t0 in enumerate(np.arange(1.2,dur-1,beat*8)):
    for j,idx in enumerate([0,2,4,2,1,3,5,3]):
        st=int((t0+j*beat)*sr); ln=min(int(0.75*sr),N-st)
        if ln<=0: continue
        t=np.arange(ln)/sr; f=notes[(idx+bar)%len(notes)]*2
        env=np.exp(-t/0.22)*(1-np.exp(-t/.003))
        p=(np.sin(2*np.pi*f*t)+.32*np.sin(2*np.pi*f*2*t)+.12*np.sin(2*np.pi*f*3*t))*env*.035
        music[st:st+ln,0]+=p*.9; music[st:st+ln,1]+=p
for bar,t0 in enumerate(np.arange(5,dur,18.5)):
    st=int(t0*sr); ln=min(int(10*sr),N-st); t=np.arange(ln)/sr; f=notes[(bar*2+3)%len(notes)]/2
    env=np.minimum(1,t/1.5)*np.minimum(1,(ln/sr-t)/2); air=(np.sin(2*np.pi*f*t)+.2*np.sin(2*np.pi*f*2*t))*env*.012
    music[st:st+ln]+=air[:,None]
for sec in [0,44,77,109,132,161,188,216,253,286]:
    st=int(sec*sr); ln=min(int(.35*sr),N-st); t=np.arange(ln)/sr
    music[st:st+ln]+= (np.sin(2*np.pi*92*t)*np.exp(-t*11)*.08)[:,None]
active=np.abs(y)>.012; vr=float(np.sqrt(np.mean(y[active]**2))); mr=float(np.sqrt(np.mean(music[active]**2))); music*=vr/(max(mr,1e-9)*10**(18/20))
mask=np.maximum.reduceat(np.abs(y),np.arange(0,N,480))>.015; slow=lfilter([.04],[1,-.96],mask.astype(float)); music*=np.repeat(1-.25*slow,480)[:N,None]
fade=np.minimum(1,np.arange(N)/sr/2)*np.minimum(1,(N-1-np.arange(N))/sr/4); music*=fade[:,None]
sf.write(P/'music/woodwind-courtyard.wav',music,sr,subtype='PCM_24'); sf.write(P/'premaster.wav',np.column_stack([y,y])+music,sr,subtype='PCM_24')
r=subprocess.run(['ffmpeg','-hide_banner','-i',str(P/'premaster.wav'),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True)
a=json.JSONDecoder().raw_decode(r.stderr[r.stderr.rfind('{'):])[0]
flt='loudnorm=I=-16:TP=-1.5:LRA=9:linear=true:'+':'.join(f'{k}={a[v]}' for k,v in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
subprocess.run(['ffmpeg','-y','-v','error','-i',str(P/'premaster.wav'),'-af',flt,'-ar','48000','-c:a','pcm_s24le',str(P/'master.wav')],check=True)
(Q/'audio-manifest.json').write_text(json.dumps({'title':'檐下新声','composer':'rainbow鱼 original guqin-xiao-yangqin procedural score','musicReused':False,'seed':20261004,'tempoBpm':92,'targetLufs':-16,'targetTruePeak':-1.5,'premasterMeasurement':a,'musicSha256':hashlib.sha256((P/'music/woodwind-courtyard.wav').read_bytes()).hexdigest(),'subjectiveListeningChecked':False},ensure_ascii=False,indent=2),encoding='utf8')
print('v2 music complete',round(dur,2))
