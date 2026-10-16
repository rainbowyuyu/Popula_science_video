from pathlib import Path
import numpy as np, soundfile as sf, json, subprocess, re,hashlib
from scipy.signal import lfilter
R=Path(__file__).resolve().parents[1];P=R/'public/episode3';Q=R/'research/episode3'
y,sr=sf.read(P/'narration.wav',dtype='float32');N=len(y);dur=N/sr
rng=np.random.default_rng(31004);music=np.zeros((N,2),np.float32)
notes=np.array([146.832,164.814,184.997,220.,246.942,293.665,329.628,369.994])
# Original pentatonic chamber sketch: relaxed plucks, breathing rests, low harmonic bed.
phrases=[[0,3,4,3,1,0],[2,4,5,4,3,1],[0,1,3,4,6,4],[3,2,1,0,3,0]]
beat=60/76
for bar,t0 in enumerate(np.arange(.6,dur-3,beat*8)):
 phrase=phrases[bar%4]
 for j,idx in enumerate(phrase):
  start=int((t0+j*beat*(1.15 if j<4 else 1.3))*sr);ln=min(int(3.1*sr),N-start)
  if ln<=0:continue
  t=np.arange(ln)/sr;f=notes[idx];env=(1-np.exp(-t/.005))*np.exp(-t/1.15);tone=np.zeros(ln)
  for h in range(1,7):tone+=np.sin(2*np.pi*f*h*t+.07*h)*np.exp(-t*h*.18)/(h**1.9)
  wave=tone*env*.13*(.8+.2*np.sin(bar*.7+j));pan=.45+.2*np.sin(j+bar)
  music[start:start+ln,0]+=wave*np.sqrt(1-pan);music[start:start+ln,1]+=wave*np.sqrt(pan)
for phrase,t0 in enumerate(np.arange(0,dur,12.63)):
 start=int(t0*sr);ln=min(int(14*sr),N-start);t=np.arange(ln)/sr;en=np.minimum(1,t/2)*np.minimum(1,(14-t)/3)*.009
 for n in ([0,3,5] if phrase%2==0 else [1,4,6]):
  v=np.sin(2*np.pi*notes[n]*.5*t)*en;music[start:start+ln]+=v[:,None]
for sec,g in [(.19,.21),(.37,.14),(.61,.08)]:
 offset=int(sr*sec);music[offset:]+=music[:-offset,::-1].copy()*g
active=np.max(np.abs(y),axis=1)>.012
vr=float(np.sqrt(np.mean(y[active]**2)));mr=float(np.sqrt(np.mean(music[active]**2)))
music*=vr/(max(mr,1e-9)*10**(18/20))
# Very slow duck release so short pauses do not pump.
mask=np.maximum.reduceat(np.max(np.abs(y),axis=1),np.arange(0,N,480))>.015
slow=lfilter([.04],[1,-.96],mask.astype(float));duck=np.repeat(1-.22*slow,480)[:N]
music*=duck[:,None];fade=np.minimum(1,np.arange(N)/sr/2)*np.minimum(1,(N-1-np.arange(N))/sr/4);music*=fade[:,None]
sf.write(P/'music/mortise-teahouse.wav',music,sr,subtype='PCM_24');sf.write(P/'premaster.wav',y+music,sr,subtype='PCM_24')
res=subprocess.run(['ffmpeg','-hide_banner','-i',str(P/'premaster.wav'),'-af','loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json','-f','null','-'],capture_output=True,text=True)
a=json.JSONDecoder().raw_decode(res.stderr[res.stderr.rfind('{'):])[0];f='loudnorm=I=-16:TP=-1.5:LRA=9:linear=true:'+':'.join(f'{k}={a[v]}' for k,v in [('measured_I','input_i'),('measured_TP','input_tp'),('measured_LRA','input_lra'),('measured_thresh','input_thresh'),('offset','target_offset')])
subprocess.run(['ffmpeg','-y','-v','error','-i',str(P/'premaster.wav'),'-af',f,'-ar','48000','-c:a','pcm_s24le',str(P/'master.wav')],check=True)
(Q/'audio-manifest.json').write_text(json.dumps({'title':'檐下听木','composer':'Original procedural arrangement for episode 3','musicReused':False,'seed':31004,'targetLufs':-16,'targetTruePeak':-1.5,'voiceMusicRmsDbBeforeDucking':18,'premasterMeasurement':a,'musicSha256':hashlib.sha256((P/'music/mortise-teahouse.wav').read_bytes()).hexdigest(),'subjectiveListeningChecked':False},ensure_ascii=False,indent=2),encoding='utf8')
print('Score and two-pass mix complete',round(dur,2))
