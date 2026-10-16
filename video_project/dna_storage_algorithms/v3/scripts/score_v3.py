"""Original Memory in a Drop score: 80 BPM, 4/4, real CC0 acoustic samples.

No earlier film composition or mix is reused. Seeded water/data accents are
illustrative sound design, not recordings of a laboratory experiment.
"""
from pathlib import Path
import hashlib,json
import numpy as np
import soundfile as sf
from scipy.signal import butter,sosfilt
from acoustic_bank import AcousticBank
V3=Path(__file__).resolve().parents[1]
SR=48000;DURATION=300;SEED=202610113;BPM=80;BEAT=60/BPM
CHORDS=[(40,[55,59,62,66]),(36,[55,59,64,67]),(43,[55,59,62,64]),(38,[57,62,64,69]),(45,[55,60,64,67]),(36,[55,59,62,67]),(47,[57,62,66,69]),(38,[57,60,64,66])]
MELODY=[[(.5,71,1.4),(2.5,76,1)],[(1.,78,1.2),(2.5,79,1.)],[(0.,76,1.6),(2.5,74,1)],[(.5,71,2.7)],[(.5,72,1),(2.,76,1.6)],[(1.,74,1),(2.5,71,1)],[(.5,69,2),(3.,66,.7)],[(.5,67,3.2)]]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
 out=V3/'public/music';out.mkdir(parents=True,exist_ok=True)
 rng=np.random.default_rng(SEED);bank=AcousticBank()
 score=np.zeros((DURATION*SR,2),np.float32);fx=np.zeros_like(score);events=[]
 def note(inst,midi,t,seconds,vel,pan=0):
  if t<0 or t>=DURATION:return
  x=bank.note(inst,midi,seconds,vel,int(rng.integers(0,2)))
  x[:,0]*=np.sqrt((1-pan)/2)*1.4142;x[:,1]*=np.sqrt((1+pan)/2)*1.4142
  a=round(t*SR);b=min(len(score),a+len(x));score[a:b]+=x[:b-a]
  events.append({'instrument':inst,'midi':midi,'start':round(t,4),'duration':round(seconds,4),'velocity':round(vel,4)})
 for bar in range(100):
  t=bar*4*BEAT;root,chord=CHORDS[bar%8]
  # Three spacious textures; melody comes forward at the question and return.
  dense=75<=t<118 or 160<=t<262
  close=t>=264
  melody_gain=.19 if dense else .43 if close or t<18 else .28
  pulse_gain=.36 if 18<=t<160 else .21
  if t>=288:root,chord=(43,[55,59,62,67]);melody_gain=.25;pulse_gain=.12
  note('cello',root,t,3.7,.40,-.18)
  if bar%2==0:
   for j,n in enumerate(chord[1:]):note('viola',n,t+j*.07,5.9,.12,.28)
  for k in range(4):
   n=chord[[0,2,1,3][k]]
   note('piano',n,t+k*BEAT+(.018 if k%2 else 0),1.65,pulse_gain*(.82 if k%2 else 1),-.22)
  if 18<=t<160 or 264<=t<286:
   for k in [1,3,5,7]:note('harp',chord[(k//2)%4]+12,t+k*BEAT*.5,1.25,.14,.32)
  if bar%16<8 or close or t<18:
   for onset,n,d in MELODY[bar%8]:note('piano',n,t+onset*BEAT,d*BEAT+.5,melody_gain,-.05)
  if 75<=t<157 or 219<=t<261:
   for k in [0,2]:note('tap',60,t+k*BEAT,.23,.20,0)
  if bar==98:note('piano',79,t+.5,3.7,.30,.15)
 # Sparse stereo early reflections keep the acoustic space coherent.
 dry=score.copy()
 for delay,gain in [(0.083,.11),(.137,.07),(.241,.045)]:
  n=round(delay*SR);score[n:,0]+=dry[:-n,1]*gain;score[n:,1]+=dry[:-n,0]*gain
 del dry
 for at in [17.3,43.3,74.3,117.3,159.3,215.3,261.3,289.3]:
  n=round(1.35*SR);tt=np.arange(n,dtype=np.float32)/SR
  noise=rng.normal(0,1,n).astype(np.float32)
  noise=sosfilt(butter(2,[250,2100],fs=SR,btype='bandpass',output='sos'),noise)
  env=np.sin(np.pi*np.clip(tt/1.35,0,1))**2
  tone=np.sin(2*np.pi*(180*tt+110*tt*tt))*np.exp(-tt*2.5)
  x=(noise*.007+tone*.0025)*env
  a=round(at*SR);b=min(len(fx),a+n);fx[a:b,0]+=x[:b-a]*.8;fx[a:b,1]+=x[:b-a]
 env=np.ones(len(score),np.float32);n=2*SR;env[:n]=np.linspace(0,1,n)**.7
 n=4*SR;env[-n:]=np.linspace(1,0,n)**1.4
 score*=env[:,None];fx*=env[:,None]
 score=sosfilt(butter(2,6500,fs=SR,output='sos'),score,axis=0).astype(np.float32)
 for name,x in [('memory_in_a_drop.wav',score),('transitions.wav',fx)]:
  sf.write(out/name,x,SR,subtype='PCM_24')
 manifest={'title':'一滴里的记忆 / Memory in a Drop','originalArrangement':True,'sameFilm':'DNA storage V3','sourceSamples':'https://github.com/sgossner/VSCO-2-CE','sampleLicense':'CC0-1.0','sampleManifest':'public/music/samples/manifest.json','seed':SEED,'bpm':BPM,'meter':'4/4','key':'E minor / G major','seconds':300,'instrumentation':['upright piano','harp','cello','viola','quiet conga taps'],'timeStretch':False,'subjectiveListeningChecked':False,'files':[{'path':f'public/music/{n}','sha256':sha(out/n)}for n in ['memory_in_a_drop.wav','transitions.wav']],'events':events}
 (V3/'research/music-composition.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
 print('Original music written, note events:',len(events),flush=True)
if __name__=='__main__':main()
