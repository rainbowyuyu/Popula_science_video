"""向云生长 — original architectural score; CC0 sampled acoustic instruments."""
from pathlib import Path
import json
import numpy as np
from scipy.signal import butter,sosfilt,oaconvolve
from acoustic_bank import AcousticBank
ROOT=Path(__file__).resolve().parents[1]
TITLE='向云生长';BPM=88.;SEED=2026100817;SR=48000
HARMONY={
 'F':(41,[53,57,60,64,67]),'C':(36,[52,55,60,62,67]),
 'Am':(45,[52,55,60,64,69]),'Bb':(34,[53,57,62,65,69]),
 'Gm':(43,[53,57,62,65,67]),'Dm':(38,[53,57,60,64,69]),
 'Cs':(36,[53,55,60,62,67]),'Fe':(40,[53,57,60,65,69]),
}
PROGRESSIONS=[
 ['F','C','Am','Bb','Gm','Dm','Bb','Cs'],
 ['Dm','Am','Bb','F','Gm','Dm','Bb','C'],
 ['Bb','C','F','Fe','Dm','Gm','Cs','F'],
]
MOTIFS=[
 [(0.10,0,1.1),(1.50,2,1.25),(3.10,4,.7)],
 [(.40,3,1.45),(2.30,2,1.5)],
 [(0.05,1,1.4),(2.00,4,1.65)],
 [(.70,3,1.1),(2.50,2,1.2)],
 [(.08,2,1.2),(1.70,3,1.0),(3.00,1,.8)],
 [(.45,4,1.7),(2.70,2,1.1)],
 [(.10,3,1.3),(2.20,1,1.5)],
 [(.12,0,2.8)],
]
def smooth(x): x=np.clip(x,0,1);return x*x*(3-2*x)
def compose(seconds,sr=SR):
    n=round(seconds*sr);rng=np.random.default_rng(SEED);bank=AcousticBank(sr)
    dry=np.zeros((n,2),np.float32);send=np.zeros_like(dry);events=[]
    def add(inst,note,at,dur,vel,pan=0,room=.22,var=0):
        if at>=seconds or at+dur<=0 or vel<.001:return
        w=bank.note(inst,note,dur,vel,var);mid=w.mean(axis=1);side=(w[:,0]-w[:,1])*.26
        angle=(pan+1)*np.pi/4
        st=np.stack([mid*np.cos(angle)*1.414+side,mid*np.sin(angle)*1.414-side],axis=1)
        start=round(at*sr);skip=max(0,-start);start=max(0,start);count=min(len(w)-skip,n-start)
        if count<=0:return
        dry[start:start+count]+=st[skip:skip+count];send[start:start+count]+=st[skip:skip+count]*room
        events.append(dict(instrument=inst,midi=note,at=round(at,5),seconds=round(dur,5),velocity=round(vel,5)))
    beat=60/BPM;t=.2;bar=0
    while t<seconds-7:
        p=t/seconds;pos=bar%8;phrase=bar//8
        build=float(smooth((p-.12)/.12)*(1-smooth((p-.67)/.12)))
        lift=float(smooth((p-.68)/.14));intro=1-float(smooth(p/.10))
        prog=PROGRESSIONS[2 if lift>.6 else 1 if build>.7 else 0]
        bass,chord=HARMONY[prog[pos]];b=beat*(1.018 if pos==7 else .997);dur=4*b
        energy=.65+.17*build+.18*lift-.12*intro
        jitter=lambda:float(rng.uniform(-.006,.008))
        add('piano',bass+12,t+jitter(),dur+1.3,.28*energy,-.18,.23,bar)
        # A four-beat building figure with asymmetric spacing and breath.
        figures=[(.75,0),(1.65,1),(2.55,2),(3.45,3)] if pos%2==0 else [(1.15,1),(2.70,2)]
        for off,ix in figures:
            if intro>.5 and ix>1:continue
            add('piano',chord[ix],t+off*b+jitter(),2.4,.15*energy,-.14+ix*.06,.26,bar+ix)
        melody=MOTIFS[(pos+2*(phrase%3))%8]
        for k,(off,ix,held) in enumerate(melody):
            if intro>.5 and k>1:continue
            note=chord[ix]+12
            if phrase%4==2 and k==0:note-=12
            add('piano',note,t+off*b+jitter(),max(2.,held*b+.7),.32*energy,.12,.29,bar+k)
        flow=float(smooth((p-.045)/.11)*(1-smooth((p-.91)/.05)))
        for k,off in enumerate([.05,2.05]):
            add('pizz',bass+12+(7 if k else 0),t+off*b+jitter(),1.2,.21*energy*flow,-.1+k*.15,.12,bar+k)
        if pos in (0,2,4,6):
            add('harp',chord[3]+12,t+3.28*b+jitter(),2.5,.16*energy*flow,.31,.27,bar)
        if pos in (1,5) and build>.3:
            add('tap',60,t+1.97*b,.25,.095*energy,-.08,.08,bar)
            add('tap',60,t+3.46*b,.22,.047*energy,.07,.08,bar+1)
        strings=float(smooth((p-.10)/.18))*(1-.45*float(smooth((p-.92)/.05)))
        if bar%2==0:
            add('cello',bass+12,t-.11,2*dur+.25,.12*energy*strings,-.24,.33,bar)
            add('viola',chord[1],t-.14,2*dur+.20,.09*energy*strings,.23,.38,bar)
            if lift>.35:add('viola',chord[3],t+.10,2*dur,.065*energy*strings,-.14,.36,bar+1)
        t+=dur;bar+=1
    cadence=max(0,seconds-6.7)
    for k,note in enumerate([41,53,57,60,65,67,72]):
        add('piano',note,cadence+.09*k,6.6,.16 if k<4 else .21,-.12+.045*k,.29,k)
    irn=round(1.45*sr);tt=np.arange(irn)/sr
    ir=rng.normal(0,1,(irn,2)).astype(np.float32)*np.exp(-tt[:,None]/.29)
    ir[:round(.025*sr)]=0
    ir=sosfilt(butter(2,3500,fs=sr,output='sos'),ir,axis=0).astype(np.float32)
    ir/=max(1e-8,float(np.sqrt(np.sum(ir**2,axis=0)).max()));ir*=.22
    for delay,g in [(.032,.10),(.055,.065),(.089,.035)]:
        ir[round(delay*sr),0]+=g;ir[round((delay+.009)*sr),1]+=g*.85
    out=dry.copy()
    for c in range(2):out[:,c]+=oaconvolve(send[:,c],ir[:,c],mode='full')[:n]
    out=sosfilt(butter(2,43,fs=sr,btype='highpass',output='sos'),out,axis=0).astype(np.float32)
    band=sosfilt(butter(2,[2000,4200],fs=sr,btype='bandpass',output='sos'),out,axis=0)
    out-=band.astype(np.float32)*.26
    fadein=np.minimum(np.arange(n,dtype=np.float32)/(sr*.9),1)
    fadeout=np.minimum((n-1-np.arange(n,dtype=np.float32))/(sr*3.7),1)
    out*=np.sin(fadein[:,None]*np.pi/2)**2*np.sin(np.maximum(0,fadeout[:,None])*np.pi/2)**2
    out*=.64/max(float(abs(out).max()),1e-9)
    report=dict(title=TITLE,seed=SEED,tempoBpm=BPM,meter='4/4',tonality='F major / D minor',barCount=bar,
      durationSeconds=n/sr,noteCount=len(events),instrumentCounts={i:sum(e['instrument']==i for e in events) for i in bank.files},
      source='Original notes, melody and arrangement for Shanghai Tower; CC0 isolated instrument samples',events=events,
      reusedPreviousComposition=False,subjectiveListeningChecked=False)
    (ROOT/'research/audio-composition.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
    return out
