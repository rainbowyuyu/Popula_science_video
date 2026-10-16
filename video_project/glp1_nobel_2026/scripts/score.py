"""微光信使 / Messengers of Light. Original GLP-1 score, 2026-10-08.

Original D major / B minor theme, 3/4, 76 BPM, arranged to this film's measured
revision length. Uses CC0 single-note acoustic samples; no other film's music.
"""
from pathlib import Path
import json
import numpy as np
from scipy.signal import butter,sosfilt,oaconvolve
from acoustic_bank import AcousticBank
ROOT=Path(__file__).resolve().parents[1]
TITLE='微光信使';BPM=76.;SEED=202610088;SR=48000

# Explicit new voicings, including warm suspended resolutions.
HARMONY={
 'D':(38,[54,57,62,64]), 'A':(45,[52,57,61,64]),
 'Bm':(47,[54,59,62,66]),'G':(43,[55,59,62,66]),
 'Em':(40,[55,59,64,66]),'Fsm':(42,[54,57,61,66]),
 'Gs':(43,[55,57,62,67]),'Ds':(38,[54,57,62,66]),
}
PROGRESSIONS=[
 ['D','A','Bm','G','D','Em','G','A'],
 ['Bm','Fsm','G','D','Em','Bm','G','A'],
 ['G','D','Em','A','Bm','G','A','Ds'],
]
# Independent three-beat phrases: (beat offset, MIDI, length in beats).
PHRASES=[
 [(0.15,66,1.2),(1.70,69,.8)],
 [(0.10,68,1.1),(1.62,64,1.1)],
 [(0.15,66,1.8)],
 [(0.72,67,.9),(1.88,66,.8)],
 [(0.14,69,1.1),(1.65,66,1.0)],
 [(0.50,67,1.3),(2.20,64,.5)],
 [(0.20,62,1.3),(1.90,66,.8)],
 [(0.10,64,1.8)],
]
ANSWERS=[
 [(0.28,74,1.7)],[(1.12,73,1.2)],
 [(0.35,71,1.0),(1.8,69,.9)],[(.45,67,1.9)],
 [(0.15,69,1.9)],[(1.05,71,1.1)],
 [(.35,69,.9),(1.62,67,.9)],[(.20,66,2.1)],
]

def smooth(x): x=np.clip(x,0,1);return x*x*(3-2*x)

def compose(seconds,sr=SR):
    n=round(seconds*sr);bank=AcousticBank(sr);rng=np.random.default_rng(SEED)
    dry=np.zeros((n,2),np.float32);send=np.zeros_like(dry);events=[]
    def add(inst,note,at,dur,vel,pan=0,room=.20,var=0):
        if at>=seconds or at+dur<=0:return
        w=bank.note(inst,note,dur,vel,var);mid=w.mean(axis=1);side=(w[:,0]-w[:,1])*.28
        angle=(pan+1)*np.pi/4
        st=np.stack([mid*np.cos(angle)*1.414+side,mid*np.sin(angle)*1.414-side],axis=1)
        start=round(at*sr);skip=max(0,-start);start=max(0,start);count=min(len(w)-skip,n-start)
        if count<=0:return
        dry[start:start+count]+=st[skip:skip+count];send[start:start+count]+=st[skip:skip+count]*room
        events.append(dict(instrument=inst,midi=note,at=round(at,5),seconds=round(dur,5),velocity=round(vel,5)))
    t=.25;bar=0;beat=60/BPM
    while t<seconds-5:
        p=t/seconds;phrase=bar//8;pos=bar%8
        investigation=float(smooth((p-.20)/.12)*(1-smooth((p-.67)/.12)))
        resolution=float(smooth((p-.70)/.12));opening=1-float(smooth(p/.10))
        prog=PROGRESSIONS[1 if investigation>.6 else 2 if resolution>.6 else 0]
        key=prog[pos];bass,chord=HARMONY[key]
        b=beat*(1.025 if pos==7 else .993 if pos==3 else 1)
        dur=3*b;energy=.60+.21*investigation+.12*resolution-.13*opening
        jitter=lambda:float(rng.uniform(-.006,.009))
        add('piano',bass+12,t+jitter(),dur+1.35,.34*energy,-.17,.23,bar)
        # An asymmetric lilting figure leaves breathing room for narration.
        for off,ix in ([(.82,0),(2.1,2)] if pos%2==0 else [(1.28,1)]):
            if opening>.6 and ix==2:continue
            add('piano',chord[ix],t+off*b+jitter(),2.5,.20*energy,-.07+ix*.08,.29,bar+ix)
        line=ANSWERS if phrase%3==2 and p>.12 else PHRASES
        for k,(off,note,held) in enumerate(line[pos]):
            if opening>.7 and k>0:continue
            # G chords retain natural G; A major requires C sharp.
            if key in ['G','Gs','Em'] and note==68:note=67
            if key=='A' and note==62:note=61
            if key=='Bm' and note==68:note=66
            add('piano',note,t+off*b+jitter(),max(2.0,held*b+.6),.48*energy,.13,.34,bar+k)
        flow=float(smooth((p-.06)/.13)*(1-smooth((p-.91)/.06)))
        if pos in (1,3,4,6):
            add('harp',chord[1]+12,t+1.65*b+jitter(),2.7,.17*energy*flow,.28,.30,bar)
        if pos==6 and investigation>.35:
            add('harp',chord[3]+12,t+2.42*b,2.2,.11*energy*flow,.21,.32,bar+1)
        # Slow two-bar bows and warm cello build a continuous biological journey.
        strings=float(smooth((p-.13)/.13))*(1-.38*float(smooth((p-.93)/.04)))
        if bar%2==0:
            add('cello',bass+12,t-.12,2*dur+.35,.17*energy*strings,-.16,.38,bar)
            for k,note in enumerate([chord[0],chord[2]]):
                add('viola',note,t-.14+.07*k,2*dur+.4,.12*energy*strings,-.22+.42*k,.44,bar+k)
        pulse=float(smooth((p-.15)/.12)*(1-smooth((p-.88)/.08)))
        if pos not in (3,7):
            add('pizz',bass+12,t+.03,1.6,.20*energy*pulse,-.05,.16,bar)
            if investigation>.4:add('pizz',bass+19,t+1.5*b,1.25,.095*energy*pulse,.06,.17,bar+1)
        if pos in (1,5) and investigation>.6:
            add('tap',60,t+2*b,.26,.035*energy,-.03,.08,bar)
        t+=dur;bar+=1
    # Final warm D(add9) cadence under the reference hold.
    cadence=max(0,seconds-6.5)
    for k,note in enumerate([50,57,62,66,69,76]):
        add('piano',note,cadence+.085*k,6.4,.22 if k<3 else .26,-.1+.045*k,.35,k)
    irn=round(1.65*sr);tt=np.arange(irn)/sr
    ir=rng.normal(0,1,(irn,2)).astype(np.float32)*np.exp(-tt[:,None]/.34)
    ir[:round(.021*sr)]=0
    ir=sosfilt(butter(2,3400,fs=sr,output='sos'),ir,axis=0).astype(np.float32)
    ir/=max(1e-8,float(np.sqrt(np.sum(ir**2,axis=0)).max()));ir*=.25
    for delay,g in [(.029,.12),(.051,.08),(.087,.045)]:
        ir[round(delay*sr),0]+=g;ir[round((delay+.009)*sr),1]+=g*.9
    out=dry.copy()
    for c in range(2):out[:,c]+=oaconvolve(send[:,c],ir[:,c],mode='full')[:n]
    out=sosfilt(butter(2,45,fs=sr,btype='highpass',output='sos'),out,axis=0).astype(np.float32)
    # Mild voice-space reduction without dulling the full acoustic score.
    band=sosfilt(butter(2,[2000,4200],fs=sr,btype='bandpass',output='sos'),out,axis=0)
    out-=band.astype(np.float32)*.23
    fadein=np.minimum(np.arange(n,dtype=np.float32)/(sr*1.25),1)
    fadeout=np.minimum((n-1-np.arange(n,dtype=np.float32))/(sr*3.5),1)
    out*=np.sin(fadein[:,None]*np.pi/2)**2*np.sin(np.maximum(0,fadeout[:,None])*np.pi/2)**2
    out*=.65/max(float(abs(out).max()),1e-9)
    report=dict(title=TITLE,seed=SEED,tempoBpm=BPM,meter='3/4',tonality='D major / B minor',barCount=bar,
        durationSeconds=n/sr,noteCount=len(events),instrumentCounts={inst:sum(e['instrument']==inst for e in events) for inst in bank.files},
        source='Same-film GLP-1 original theme arranged to the current measured duration; CC0 isolated instrument samples',events=events,
        sameFilmRevisionOf='微光信使 / GLP-1',reusedOtherFilmComposition=False,subjectiveListeningChecked=False)
    (ROOT/'research/music/composition.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
    return out
