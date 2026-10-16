from pathlib import Path
import json, math, subprocess, re
import numpy as np, soundfile as sf
R=Path(__file__).resolve().parents[1]; P=R/'public/episode2'; Q=R/'research/episode2'; sr=48000
tl=json.loads((P/'timeline.json').read_text('utf8')); narr,_=sf.read(P/'narration.wav',dtype='float32',always_2d=True); music,_=sf.read(P/'rainbow_arc_ambient.wav',dtype='float32',always_2d=True)
N=len(narr); score=np.tile(music,(math.ceil(N/len(music)),1))[:N].copy(); gain=np.ones(N,np.float32)*.42
for c in tl['clips']:
    a=max(0,int((c['start']/30-.18)*sr)); b=min(N,int((c['end']/30+.35)*sr)); gain[a:b]=.12
fade=int(.55*sr)
for i in range(1,N): gain[i]=min(gain[i],gain[i-1]+1/fade)
for i in range(N-2,-1,-1): gain[i]=min(gain[i],gain[i+1]+1/fade)
score*=gain[:,None]
rms=lambda x: float(np.sqrt(np.mean(x*x)))
score*=10**((-29)/20)/max(1e-9,rms(score))
mix=narr+score
# Leave a true-peak safety margin; final AAC is checked after encoding.
peak=max(1e-8,float(np.max(np.abs(mix)))); mix*=min(1,.89/peak)
sf.write(P/'master.wav',mix,sr,subtype='PCM_24')
(Q/'mix.json').write_text(json.dumps({'track':'rainbow_arc_ambient.wav','original':'Original procedural ambient score','musicReuse':False,'narrationDuck':0.12,'peakLinear':peak,'subjectiveListeningChecked':False},ensure_ascii=False,indent=2),encoding='utf8')
print('Mixed',round(N/sr,2),'seconds')
