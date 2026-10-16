"""Deepwater Circuit: original 6/8 chamber/electronic score, CC0 isolated notes."""
from pathlib import Path
import json
import numpy as np
from scipy.signal import butter,sosfilt,oaconvolve
from acoustic_bank import AcousticBank
R=Path(__file__).resolve().parents[1]
SR=48000;BPM=106;SEED=2026101016
CHORDS=[(43,[55,58,62,65]),(39,[55,58,63,67]),(46,[53,58,62,65]),(41,[53,57,60,67]),
        (43,[55,58,62,69]),(48,[55,60,63,67]),(39,[55,58,63,70]),(50,[54,57,62,69])]
MELODY=[[(0,2),(2.5,3),(4,1)],[(1,2),(4,0)],[(0,3),(3.5,2)],[(.5,1),(3,3)],
        [(0,0),(2,2),(4.5,3)],[(1,3),(4,1)],[(0,2),(3,1)],[(.5,0)]]
def compose(seconds):
    rng=np.random.default_rng(SEED);n=round(seconds*SR);mix=np.zeros((n,2),np.float32);send=np.zeros_like(mix)
    bank=AcousticBank(SR);events=[]
    def note(inst,midi,at,duration,vel,pan=0):
        if at>=seconds:return
        x=bank.note(inst,midi,duration,vel,int(at*13)%8);mono=x.mean(axis=1)
        p=(pan+1)*np.pi/4;x=np.stack([mono*np.cos(p),mono*np.sin(p)],axis=1)*1.414
        start=max(0,round(at*SR));count=min(len(x),n-start)
        if count>0:mix[start:start+count]+=x[:count];send[start:start+count]+=x[:count]*.19
        events.append([inst,midi,round(at,3),duration,vel])
    beat=60/BPM;bar=0;t=.12
    while t<seconds-9:
        stage=t/seconds;root,chord=CHORDS[bar%8];v=.67 if stage<.1 else .88 if stage<.65 else .72
        if stage>.8:root+=12
        note('piano',root,t,4.5,.23*v,-.22)
        note('piano',root+7,t+3*beat,3.1,.12*v,-.2)
        for k,off in enumerate([1,2,4,5]):
            if stage<.055 and k>1:continue
            note('piano',chord[(k+bar//8)%4],t+off*beat+float(rng.uniform(-.012,.012)),3,.13*v,-.1+k*.07)
        for off,j in MELODY[bar%8]:
            note('harp' if bar%4==3 else 'piano',chord[j]+12,t+off*beat,3.6,.22*v,.28)
        if stage>.06 and stage<.93:
            for off in [0,3]:note('pizz',root+12,t+off*beat,1.2,.20*v,-.08)
        if .12<stage<.68:
            for off in [2.9,5.8]:note('tap',60,t+off*beat,.23,.08,-.2)
        if bar%2==0 and stage>.07:
            note('cello',root+12,t,11.8*beat,.095*v,-.25)
            note('viola',chord[1],t+.08,11.8*beat,.073*v,.23)
        t+=6*beat;bar+=1
    for k,m in enumerate([43,55,58,62,67,74]):note('piano',m,seconds-8+.10*k,7.8,.14+.014*k,-.2+.08*k)
    irlen=int(1.4*SR);tt=np.arange(irlen)/SR
    ir=rng.normal(size=(irlen,2))*np.exp(-tt[:,None]/.34);ir[:int(.032*SR)]=0
    ir=sosfilt(butter(2,3800,fs=SR,output='sos'),ir,axis=0);ir/=max(np.sqrt((ir**2).sum(axis=0)))
    for c in range(2):mix[:,c]+=oaconvolve(send[:,c],ir[:,c],mode='full')[:n]*.25
    # Narration gets the presence band; music retains its low pulse and air.
    presence=sosfilt(butter(2,[1700,4500],fs=SR,btype='bandpass',output='sos'),mix,axis=0)
    mix-=presence.astype(np.float32)*.3
    ts=np.arange(n,dtype=np.float32)/SR
    env=np.sin(np.clip(ts/2,0,1)*np.pi/2)**2*np.sin(np.clip((seconds-ts)/5,0,1)*np.pi/2)**2
    mix*=env[:,None];mix*=.52/max(np.abs(mix).max(),1e-9)
    (R/'research/qa/music-composition.json').write_text(json.dumps(dict(title='深海回路',titleEn='Deepwater Circuit',tempoBPM=BPM,meter='6/8',seed=SEED,events=events,sampleLicense='VSCO 2 Community Edition / CC0-1.0',sampleSource='https://github.com/sgossner/VSCO-2-CE',reusesEarlierScore=False,subjectiveListeningChecked=False),ensure_ascii=False,indent=2),'utf8')
    return mix
