import soundfile as sf, numpy as np
from pathlib import Path
for p in ['master','narration','music','premaster']:
    x,sr=sf.read(Path('audio/v06')/(p+'.wav'), always_2d=True)
    rms=np.sqrt(np.mean(x*x,axis=1))
    # chunk 1s / 0.5s
    n=int(sr*1.0); vals=np.array([np.sqrt(np.mean(x[i:i+n]**2)) for i in range(0,len(x)-n+1,n)])
    db=20*np.log10(np.maximum(vals,1e-12))
    print(p, 'sr',sr,'dur',len(x)/sr,'RMS median/mean/max dBFS',np.median(db),20*np.log10(np.sqrt(np.mean(x*x))),db.max(),'min active',np.percentile(db,[1,5,95,99]))
    # RMS overall per channels
    print('channel rms dB',20*np.log10(np.sqrt(np.mean(x*x,axis=0))))
# Noise estimate on near-silence 0.5s windows of narration and master
for p in ['narration','master']:
 x,sr=sf.read(Path('audio/v06')/(p+'.wav'), always_2d=True); n=int(sr*0.5)
 vals=np.array([np.sqrt(np.mean(x[i:i+n]**2)) for i in range(0,len(x)-n+1,n)])
 db=20*np.log10(np.maximum(vals,1e-12)); print(p,'lowest chunks',np.sort(db)[:10], 'p1',np.percentile(db,1),'p5',np.percentile(db,5))
# correlation music-master outside narration maybe estimate ducking with low narration windows
xn,sr=sf.read('audio/v06/narration.wav', always_2d=True); xm,_=sf.read('audio/v06/music.wav', always_2d=True); xz,_=sf.read('audio/v06/master.wav', always_2d=True)
n=int(sr*1)
print('windows: t, narr, music, master dB')
for i in range(0,len(xz)-n+1,n*15):
 vals=[]
 for x in [xn,xm,xz]: vals.append(20*np.log10(max(np.sqrt(np.mean(x[i:i+n]**2)),1e-12)))
 print(round(i/sr,1), *(round(v,1) for v in vals))
