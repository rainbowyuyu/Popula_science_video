import soundfile as sf, numpy as np
for fn in ['narration','music','master']:
 x,sr=sf.read(f'audio/v06/{fn}.wav',always_2d=True)
 # mono
 x=x.mean(1)
 n=int(sr*.5); db=[]
 for i in range(0,len(x)-n+1,n): db.append(20*np.log10(max(np.sqrt(np.mean(x[i:i+n]**2)),1e-12)))
 print(fn,'0.5s median,p10,p90,max',*[round(float(v),2) for v in np.percentile(db,[50,10,90,99,100])])
# classify narration activity and report music/master levels by same windows
xn,sr=sf.read('audio/v06/narration.wav',always_2d=True); xm,_=sf.read('audio/v06/music.wav',always_2d=True); xz,_=sf.read('audio/v06/master.wav',always_2d=True)
xn=xn.mean(1); xm=xm.mean(1); xz=xz.mean(1); n=int(sr*.5)
rows=[]
for i in range(0,min(len(xn),len(xm),len(xz))-n+1,n):
 d=[]
 for x in [xn,xm,xz]: d.append(20*np.log10(max(np.sqrt(np.mean(x[i:i+n]**2)),1e-12)))
 rows.append(d)
rows=np.array(rows); active=rows[:,0]>-38
for label,mask in [('speech',active),('pause',~active)]:
 print(label,'N',mask.sum(),'narr/music/master median',np.median(rows[mask],axis=0),'p10/p90',np.percentile(rows[mask],[10,90],axis=0))
# estimate delta music before/after mixing, normalized because master includes speech
print('music standalone median speech windows vs pause',np.median(rows[active,1]),np.median(rows[~active,1]))
