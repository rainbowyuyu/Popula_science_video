from pathlib import Path
import json,subprocess,math,hashlib
import numpy as np,soundfile as sf
from scipy.signal import resample_poly, butter, sosfilt
R=Path(__file__).resolve().parents[1]; A=R/'public/audio'; M=R/'public/music/Dream-Culture-Kevin-MacLeod.mp3'; Q=R/'research/audio';sr=48000
subprocess.run(['ffmpeg','-v','error','-y','-i',str(M),'-ar',str(sr),'-ac','2','-c:a','pcm_f32le',str(Q/'music-decoded.wav')],check=True)
x,_=sf.read(Q/'music-decoded.wav',dtype='float64',always_2d=True)
timeline=json.loads((R/'src/timeline.json').read_text(encoding='utf8'));duration=math.ceil(timeline['seconds']*30)/30;N=round(duration*sr)
# 70 BPM, four-beat bars, repeat a 32-bar middle phrase at a aligned bar boundary.
bar=4*60/70; repeat_bars=32;phrase=bar*repeat_bars;cut=bar*48
# Keep the opening intact. Equal-power xfade spans two beats, centered at same phase.
xf=60/70*2; start=cut-phrase; a=round(cut*sr);b=round(start*sr);L=round(xf*sr)
def splice(A,B,L):
 out=np.concatenate([A[:-L],np.zeros((L,2)),B[L:]])
 u=np.linspace(0,math.pi/2,L)[:,None];out[len(A)-L:len(A)]=A[-L:]*np.cos(u)+B[:L]*np.sin(u);return out
# Repeat phase is bar-aligned; overlap uses a same-phase continuation beginning two beats before the repeat entry.
b2=max(0,b-L);music=splice(x[:a],x[b2:],L)
if len(music)<N:raise RuntimeError('Extended track too short')
music=music[:N]
# Smooth end over last eight bars; gentle opening ramp preserves the first transient.
fade=min(round(8*bar*sr),N);music[-fade:]*=(np.cos(np.linspace(0,math.pi/2,fade))**2)[:,None]
intro=round(.8*sr);music[:intro]*=(np.sin(np.linspace(0,math.pi/2,intro))**2)[:,None]
voice,vsr=sf.read(A/'narration.wav',dtype='float64');assert vsr==sr;voice=np.pad(voice,(0,N-len(voice)))
# Program-aware, short-lookahead voice envelope: 60ms attack, 550ms release.
block=round(sr*.02);m=math.ceil(N/block);rms=np.array([np.sqrt(np.mean(voice[k*block:min(N,(k+1)*block)]**2)+1e-12) for k in range(m)]);active=np.clip((rms-.008)/.045,0,1)
# Smoothed foreground control, including a 120ms lookahead.
active=np.maximum.reduce([np.roll(active,-i) for i in range(7)]);env=np.empty_like(active);state=0
for i,v in enumerate(active):
 rate=.02/(.06 if v>state else .55);state+=min(1,rate)*(v-state);env[i]=state
control=np.interp(np.arange(N)/block,np.arange(m),env)
base=.20;duck=10**((-5*control)/20);musicbed=music*base*duck[:,None]
sf.write(A/'music-bed.wav',musicbed,sr,subtype='PCM_24')
premaster=voice[:,None]+musicbed;sf.write(A/'premaster.wav',premaster,sr,subtype='FLOAT')
cmd=['ffmpeg','-hide_banner','-i',str(A/'premaster.wav'),'-af','loudnorm=I=-15.0:TP=-1.5:LRA=9:print_format=json','-f','null','-'];p=subprocess.run(cmd,stderr=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf8',errors='replace');j=p.stderr[p.stderr.rfind('{'):p.stderr.rfind('}')+1];meas=json.loads(j)
f=f"loudnorm=I=-15.0:TP=-1.5:LRA=9:measured_I={meas['input_i']}:measured_LRA={meas['input_lra']}:measured_TP={meas['input_tp']}:measured_thresh={meas['input_thresh']}:offset={meas['target_offset']}:linear=true:print_format=json"
p2=subprocess.run(['ffmpeg','-hide_banner','-y','-i',str(A/'premaster.wav'),'-af',f,'-ar',str(sr),'-c:a','pcm_s24le',str(A/'rainbow-arc-master.wav')],stderr=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf8',errors='replace',check=True)
final=p2.stderr[p2.stderr.rfind('{'):p2.stderr.rfind('}')+1];final=json.loads(final)
report={'source':str(M),'sourceSHA256':hashlib.sha256(M.read_bytes()).hexdigest(),'bpm':70,'barSeconds':bar,'phraseBars':repeat_bars,'repeatEntrySeconds':start,'cutSeconds':cut,'crossfadeSeconds':xf,'seconds':duration,'samples':N,'narrationSeconds':len(sf.read(A/'narration.wav')[0])/sr,'voiceGapSeconds':.10,'sidechain':'20ms RMS / 120ms lookahead / 60ms attack / 550ms release / 5dB maximum music duck','musicBaseLinearGain':base,'measurement':meas,'masterLoudnorm':final,'subjectiveListeningChecked':False,'fullDecodeCheck':False}
(Q/'mix-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8');print(json.dumps(report,ensure_ascii=False,indent=2))
