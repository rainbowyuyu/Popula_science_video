"""Open Circuit: a new, deterministic 4/4 release-film composition.

Original notes/arrangement, CC0 VSCO acoustic samples and locally synthesized
pulse/percussion. This does not reuse launch-105-music or its note events.
"""
from pathlib import Path
import hashlib,json
import numpy as np
import soundfile as sf
from scipy.signal import butter,sosfilt,oaconvolve
from acoustic_bank import AcousticBank

R=Path(__file__).resolve().parents[1]
SR=48000;BPM=112;SEED=202610111904
PROGRESSION=[(38,[50,54,57,61,64]),(35,[47,50,54,57,61]),
             (43,[50,55,59,62,66]),(45,[49,52,57,59,64])]
THEME=[[(.5,78),(2,76),(3,74)],[(.5,73),(2.5,74)],
       [(0,74),(1.5,78),(3,81)],[(.5,76),(2,73),(3,69)]]

def smooth(v):
    v=np.clip(v,0,1);return v*v*(3-2*v)

def compose(seconds=105):
    rng=np.random.default_rng(SEED);n=round(seconds*SR)
    acoustic=np.zeros((n,2),np.float32);electronic=np.zeros_like(acoustic)
    send=np.zeros_like(acoustic);bank=AcousticBank(SR);events=[]
    def put(track,x,at,pan=0,wet=.12):
        if at>=seconds:return
        a=max(0,round(at*SR));count=min(len(x),n-a)
        if count<=0:return
        if x.ndim==2:x=x.mean(axis=1)
        angle=(pan+1)*np.pi/4
        stereo=np.stack([x*np.cos(angle),x*np.sin(angle)],axis=1)*np.sqrt(2)
        track[a:a+count]+=stereo[:count]
        send[a:a+count]+=stereo[:count]*wet
    def note(inst,midi,at,duration,velocity,pan=0):
        put(acoustic,bank.note(inst,midi,duration,velocity,int(at*7)%8),at,pan)
        events.append(dict(instrument=inst,midi=midi,start=round(at,4),duration=duration,velocity=velocity))
    def synth(kind,midi,at,duration,velocity,pan=0):
        t=np.arange(round(duration*SR))/SR;f=440*2**((midi-69)/12)
        if kind=='pulse':
            x=(np.sin(2*np.pi*f*t)+.24*np.sin(2*np.pi*2*f*t)+.08*np.sin(2*np.pi*3*f*t))
            x*=np.sin(np.minimum(t/.012,1)*np.pi/2)**2*np.exp(-t/1.2)*smooth((duration-t)/.15)
        elif kind=='pad':
            x=sum(np.sin(2*np.pi*f*2**(cents/1200)*t+phase)*gain for cents,phase,gain in [(-5,0,.40),(5,.6,.40),(0,1.7,.20)])
            x*=smooth(t/.8)*smooth((duration-t)/1.3)
        elif kind=='kick':
            phase=2*np.pi*(48*t+35*.024*(1-np.exp(-t/.024)))
            x=np.sin(phase)*np.exp(-t/.14)*smooth(t/.003)*smooth((duration-t)/.06)
        else:
            x=rng.normal(size=len(t));x=sosfilt(butter(2,5000,fs=SR,btype='highpass',output='sos'),x)
            x*=np.exp(-t/.027)*smooth(t/.001)*smooth((duration-t)/.02)
        put(electronic,x.astype(np.float32)*velocity,at,pan,.07)
        events.append(dict(instrument=kind,midi=midi,start=round(at,4),duration=duration,velocity=velocity))
    beat=60/BPM;barlength=4*beat
    # Shared pulse and phase throughout; scene changes only alter orchestration.
    for bar in range(int(seconds/barlength)+1):
        at=bar*barlength+.08;root,chord=PROGRESSION[(bar//2)%4]
        density=.6 if at<7 else .88 if at<34 else 1 if at<52 else .55 if at<65 else .95 if at<78 else .7 if at<94 else .8
        if at>96:break
        note('piano',root,at,3.8,.42*density,-.3)
        note('piano',chord[2],at+2*beat,3,.18*density,.05)
        # Sparse rolling arpeggio creates flow without fighting narration.
        offsets=[.5,1.5,2.5,3.5] if at>=19 and at<78 else [.75,2.75]
        for k,off in enumerate(offsets):
            note('harp' if bar%4==2 else 'piano',chord[(k+bar)%5]+12,
                 at+off*beat,2.4,.20*density,-.12+.08*k)
        if bar%2==0:
            for m,p in [(chord[0],-.48),(chord[2],.48)]:synth('pad',m,at,barlength*2+.25,.010*density,p)
        if 7<=at<96:
            for off in [0,2]:
                synth('pulse',root+12,at+off*beat,.95,.012*density,-.05)
            if not 52<=at<65:
                for off in [0,2]:synth('kick',36,at+off*beat,.32,.016*density)
                for k,off in enumerate([.5,1.5,2.5,3.5]):synth('hat',0,at+off*beat,.15,.0029*density,(-1 if k%2 else 1)*.26)
        if (34<=at<52 or 65<=at<94) and bar%2==0:
            note('cello',root+12,at,barlength*2+.1,.21*density,-.32)
            note('viola',chord[2],at+.1,barlength*2,.16*density,.35)
        # One restrained recurring theme, only when picture has room to breathe.
        if at<7 or 19<=at<34 or 78<=at<96:
            for off,midi in THEME[bar%4]:note('piano',midi,at+off*beat,3,.21*density,.24)
    # End in a spacious D major add9 voicing, no hard restart at the close.
    for k,m in enumerate([38,50,57,61,64,74,78]):note('piano',m,95.65+.085*k,9.1,.25,-.2+k*.065)
    for m,p in [(50,-.4),(57,.4),(64,.1)]:synth('pad',m,94.8,9.8,.011,p)
    irlen=round(1.8*SR);tt=np.arange(irlen)/SR
    ir=rng.normal(size=(irlen,2))*np.exp(-tt[:,None]/.41)
    ir[:round(.03*SR)]=0;ir=sosfilt(butter(2,5200,fs=SR,output='sos'),ir,axis=0)
    ir/=max(np.sqrt((ir**2).sum(axis=0)))
    reverb=np.stack([oaconvolve(send[:,c],ir[:,c],mode='full')[:n] for c in range(2)],axis=1)*.32
    mix=acoustic+electronic+reverb
    presence=sosfilt(butter(2,[1500,4300],fs=SR,btype='bandpass',output='sos'),mix,axis=0)
    mix-=presence.astype(np.float32)*.28
    mix=sosfilt(butter(2,40,fs=SR,btype='highpass',output='sos'),mix,axis=0).astype(np.float32)
    t=np.arange(n)/SR;envelope=smooth(t/1.2)*smooth((seconds-t)/3.5)
    mix*=envelope[:,None]
    mix*=.030/max(float(np.sqrt(np.mean(mix**2))),1e-9)
    out=R/'public/audio/launch-v4-score-original.wav';sf.write(out,mix,SR,subtype='PCM_24')
    manifest=dict(title='开放回路',titleEn='Open Circuit',tempoBPM=BPM,meter='4/4',seed=SEED,
        source='Original deterministic composition; VSCO-2-CE CC0 instrument samples + local synthesis',
        sourceURL='https://github.com/sgossner/VSCO-2-CE',license='CC0-1.0 instrument samples; original arrangement',
        reuseOfPreviousScore=False,events=events,output=out.relative_to(R).as_posix(),
        sha256=hashlib.sha256(out.read_bytes()).hexdigest(),subjectiveListeningChecked=False,
        orchestration='Soft piano/harp theme, sampled strings, restrained electronic bass/pulse; shared phase, no transition impact effects')
    (R/'research/qa/launch-v4-music-composition.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n','utf8')
    return mix

if __name__=='__main__':
    score=compose();print('NEW_SCORE',len(score)/SR,'s',float(np.max(np.abs(score))))
