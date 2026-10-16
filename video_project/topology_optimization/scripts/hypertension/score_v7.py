"""循光 / Circulating Light: original sampled chamber score for hypertension V7.

All notes and the arrangement are original. Acoustic sample sources are the
CC0 VSCO 2 Community Edition; no music recording or previously used melody is
imported. See research/hypertension/music-v7-samples/manifest.json and LICENSE.
Read-only input: current episode timeline. Does not synthesize narration.
"""
from __future__ import annotations

from pathlib import Path
from functools import lru_cache
from fractions import Fraction
import argparse, hashlib, json, math, re
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly, oaconvolve

ROOT=Path(__file__).resolve().parents[2]
SAMPLES=ROOT/'research/hypertension/music-v7-samples'
REPORTS=ROOT/'research/hypertension'
SR=48000
SEED=202610177
TITLE='循光·室内乐版'
BPM=78.0

# Eb major / C minor: close, voice-led voicings, with no repeated audio loops.
CHORDS={
 'Eb':([39,51],[55,58,62,65]), 'BbD':([38,50],[53,58,60,65]),
 'Cm':([36,48],[55,58,62,63]), 'Ab':([44,51],[56,60,63,67]),
 'Fm':([41,48],[56,60,63,67]), 'Bb':([34,46],[53,58,60,62]),
 'Gm':([43,50],[55,58,62,65]), 'Ebg':([43,51],[55,58,62,65]),
}
PROGRESSIONS=[
 ['Eb','Eb','BbD','BbD','Cm','Cm','Ab','Bb'],
 ['Eb','BbD','Cm','Cm','Ab','Ab','Fm','Bb'],
 ['Eb','Ebg','Ab','Ab','Fm','Bb','Eb','Eb'],
 ['Cm','Cm','Ab','Ab','Eb','BbD','Fm','Bb'],
 ['Ab','Eb','Fm','Fm','Cm','Ab','Bb','Bb'],
 ['Eb','Eb','Ab','Ab','Fm','Bb','Eb','Eb'],
]
# Original phrases: (beat offset, absolute MIDI, held beats). They vary in
# density and cadence, including rests; this is a melodic line, not an arp loop.
MELODY_A=[
 [(0.18,67,1.3),(1.85,70,1.1),(3.12,72,.7)],
 [(0.12,74,2.1),(2.65,72,1.0)],
 [(0.38,70,1.5),(2.20,65,1.2)],
 [(0.12,67,2.8)],
 [(0.18,67,1.15),(1.68,70,1.0),(3.10,72,.65)],
 [(0.26,75,1.7),(2.45,74,1.15)],
 [(0.14,72,1.5),(2.15,70,1.25)],
 [(0.18,65,2.0),(2.80,62,.65)],
]
MELODY_B=[
 [(0.30,70,1.65),(2.25,67,1.05)],
 [(0.10,65,1.1),(1.72,67,.8),(3.05,70,.6)],
 [(0.26,72,2.0),(2.80,70,.65)],
 [(0.16,67,2.5)],
 [(0.26,68,1.5),(2.40,72,1.15)],
 [(0.18,75,1.2),(1.88,74,1.55)],
 [(0.12,72,1.1),(1.60,70,1.3),(3.20,65,.45)],
 [(0.10,63,2.5)],
]
MELODY_C=[
 [(0.2,67,2.3)],[(1.3,65,1.9)],
 [(0.3,63,1.7),(2.45,67,.9)],[(0.1,70,2.4)],
 [(0.2,68,2.0)],[(1.15,67,1.8)],
 [(0.2,65,1.6),(2.5,62,.9)],[(0.15,63,2.8)],
]

def sha(path):return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def smooth(x):x=float(np.clip(x,0,1));return x*x*(3-2*x)
def midi(note,offset=1):
    m=re.fullmatch(r'([A-G])(#?)(\d)',note)
    return (int(m[3])+offset)*12+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[m[1]]+bool(m[2])

class AcousticBank:
    def __init__(self,sr=SR):
        self.sr=sr;self.files={k:[] for k in ['piano','harp','cello','viola','pizz','tap']}
        for p in SAMPLES.rglob('*.wav'):
            s=p.as_posix();n=p.name
            if 'Upright Nr1' in s:
                note=re.search(r'UR1_([^_]+)_',n)[1];group='piano';root=midi(note)
            elif '/Harp/' in s:group='harp';root=midi(re.search(r'KSHarp_([^_]+)_',n)[1])
            elif '/Cello Section/susvib/' in s:group='cello';root=midi(re.search(r'susvib_([^_]+)_',n)[1],2)
            elif '/Viola Section/susvib/' in s:group='viola';root=midi(re.search(r'susvib_([^_]+)_',n)[1],2)
            elif '/pizzT/' in s:group='pizz';root=midi(re.search(r'pizzT_([^_]+)_',n)[1],2)
            elif 'Conga-Tap' in s:group='tap';root=60
            else:continue
            self.files[group].append((root,p))
        if any(not x for x in self.files.values()):raise RuntimeError('Run fetch_music_v7_samples.py first')

    @lru_cache(maxsize=100)
    def source(self,path):
        x,sr=sf.read(path,dtype='float32',always_2d=True)
        if x.shape[1]==1:x=np.repeat(x,2,axis=1)
        if sr!=self.sr:
            ratio=Fraction(self.sr,sr);x=resample_poly(x,ratio.numerator,ratio.denominator,axis=0).astype(np.float32)
        # Remove actual sample pre-roll only (these are instrument samples, not
        # narration); retain 8 ms ahead of the detected acoustic attack.
        block=max(1,self.sr//200);pad=(-len(x))%block
        energy=np.sqrt(np.mean(np.pad(x,((0,pad),(0,0))).reshape(-1,block,2)**2,axis=(1,2)))
        hits=np.flatnonzero(energy>max(1e-6,energy.max()*.035))
        if len(hits):x=x[max(0,hits[0]*block-int(.008*self.sr)):]
        x=sosfilt(butter(2,45,fs=self.sr,btype='highpass',output='sos'),x,axis=0).astype(np.float32)
        return x

    @lru_cache(maxsize=240)
    def pitched(self,instrument,note,variation=0):
        candidates=sorted(self.files[instrument],key=lambda a:(abs(a[0]-note),a[1].name))
        nearest=[c for c in candidates if abs(c[0]-note)==abs(candidates[0][0]-note)]
        root,path=nearest[variation%len(nearest)]
        x=self.source(str(path));rate=2**((note-root)/12)
        q=Fraction(1/rate).limit_denominator(6000)
        if note!=root:x=resample_poly(x,q.numerator,q.denominator,axis=0).astype(np.float32)
        else:x=x.copy()
        # Keep real soft dynamics within each timbre; relative normalization
        # removes accidental microphone-gain differences between instruments.
        a=min(len(x),int(.08*self.sr));b=min(len(x),int(1.1*self.sr))
        rms=float(np.sqrt(np.mean(x[a:b].astype(np.float64)**2)))
        target={'piano':.040,'harp':.029,'cello':.040,'viola':.034,'pizz':.026,'tap':.013}[instrument]
        x*=target/max(rms,1e-6)
        cutoff={'piano':4100,'harp':4800,'cello':2800,'viola':3300,'pizz':2400,'tap':2100}[instrument]
        x=sosfilt(butter(2,cutoff,fs=self.sr,output='sos'),x,axis=0).astype(np.float32)
        return x

    def note(self,instrument,note,duration,velocity,variation=0):
        x=self.pitched(instrument,int(note),int(variation));n=round(duration*self.sr)
        out=np.zeros((n,2),np.float32);nn=min(len(x),n);out[:nn]=x[:nn]
        t=np.arange(n,dtype=np.float32)/self.sr
        if instrument in ('cello','viola'):
            attack=.40 if instrument=='cello' else .62
            release=.75
            env=np.minimum(t/attack,1)**1.3*np.clip((duration-t)/release,0,1)**1.2
            # A slow bow breath, not a synthetic periodic tremolo.
            env*=.86+.14*np.sin(np.pi*np.clip(t/duration,0,1))
        else:
            attack=.008 if instrument=='piano' else .012
            release=.40 if instrument in ('piano','harp') else .18
            env=np.minimum(t/attack,1)*np.clip((duration-t)/release,0,1)
        out*=env[:,None]*float(velocity)
        return out

def compose(seconds,sr=SR):
    """Original score as exact-length stereo; deterministic acoustic sample bank."""
    n=round(seconds*sr);bank=AcousticBank(sr);rng=np.random.default_rng(SEED)
    dry=np.zeros((n,2),np.float32);send=np.zeros_like(dry);events=[]
    timeline=json.loads((ROOT/'public/hypertension/timeline.json').read_text('utf8'))
    scenes=timeline['scenes'];fps=timeline['fps']
    def scene_at(t):
        return next((s['id'] for s in scenes if s['start']/fps<=t<s['end']/fps),'references')
    def add(inst,note,at,dur,vel,pan=0,room=.24,var=0):
        if at>=seconds or at+dur<=0:return
        w=bank.note(inst,note,dur,vel,var)
        # Mid/side preserves acoustic room width. No hard left/right bouncing.
        mid=w.mean(axis=1);side=(w[:,0]-w[:,1])*.32
        angle=(pan+1)*np.pi/4
        stereo=np.stack([mid*np.cos(angle)*1.414+side,mid*np.sin(angle)*1.414-side],axis=1)
        start=round(at*sr);skip=max(0,-start);start=max(0,start);count=min(len(w)-skip,n-start)
        if count<=0:return
        dry[start:start+count]+=stereo[skip:skip+count]
        send[start:start+count]+=stereo[skip:skip+count]*room
        events.append({'instrument':inst,'midi':note,'at':round(at,5),'seconds':round(dur,5),'velocity':round(vel,4),'pan':pan})

    time=.72;bar=0
    reference_start=scenes[-1]['start']/fps
    while time<seconds-2.0:
        phrase=bar//8;pos=bar%8;scene=scene_at(time)
        # Small phrase-shaped rubato: every cadence relaxes by 2–3%, with
        # deterministic 5–12 ms onset variation on instrumental notes.
        tempo=BPM+(1.0 if scene in ('pump','resistance') else -1.2 if scene=='measure' else 0)
        beat=60/tempo*(1.026 if pos==7 else .993 if pos in (2,3) else 1)
        barsecs=4*beat
        if scene=='references': prog=PROGRESSIONS[5]
        elif scene=='remodel':prog=PROGRESSIONS[3 if phrase%2 else 4]
        else:prog=PROGRESSIONS[phrase%3]
        key=prog[pos];bass,chord=CHORDS[key]
        scene_level={'intro':.62,'anatomy':.72,'pump':.88,'resistance':.83,'kidney':.68,'control':.76,'remodel':.72,'measure':.76,'references':.67}.get(scene,.7)
        # Continuous fades over four bars build/drop instrumentation; nothing
        # is switched to silence at a scene boundary.
        energy=(.78+.13*np.sin((pos/8)*np.pi))*scene_level
        jitter=lambda:float(rng.uniform(-.008,.011))
        # Piano left hand: varied inversions, missing cadential beats, never a
        # four-note loop replayed as a file.
        add('piano',bass[1],time+jitter(),barsecs+0.8,.34*energy,-.12,.25,bar)
        pattern=([(.58,0),(1.75,1),(2.62,2)] if pos%3==0 else
                 [(.44,1),(1.57,2),(2.82,0)] if pos%3==1 else
                 [(.72,0),(2.15,2)])
        if scene=='intro' and time<16:pattern=pattern[:1]
        if time>reference_start:pattern=pattern[:2]
        for offset,idx in pattern:
            add('piano',chord[idx],time+offset*beat+jitter(),2.9,.23*energy,-.04+idx*.04,.30,bar+idx)

        # Eight-bar original melody, with explicit space between phrases.
        line=MELODY_C if scene in ('intro','remodel') else MELODY_B if phrase%3==1 else MELODY_A
        melody_level=.62*energy
        for k,(onset,note,held) in enumerate(line[pos]):
            if scene=='intro' and time<9 and k>0:continue
            if phrase%4==2 and pos in (1,5) and k==1:continue
            # Harmonic adjustment is gentle and intentional: avoid Ab/Bb chord
            # collision while keeping the line recognizable.
            if key=='Ab' and note==67:note=68
            if key=='Fm' and note==67:note=68
            if key=='Bb' and note==63:note=62
            if scene=='references':note=63 if pos in (6,7) else note
            vel=melody_level*(.95+.10*np.sin(pos*.65+k*.4))
            add('piano',note,time+onset*beat+jitter(),max(2.0,held*beat+.95),vel,.10,.33,bar+k)
        # Harp answers, not an endless high arpeggiator. It provides gentle
        # forward movement only where the biological mechanism is in motion.
        hlevel=smooth((time-18)/28)*(1-smooth((time-reference_start)/8))
        harp_pattern=[(.85,chord[0]+12),(2.4,chord[2]+12)] if pos%2==0 else [(1.5,chord[1]+12)]
        if pos==7:harp_pattern=[]
        for offset,note in harp_pattern:
            add('harp',note,time+offset*beat+jitter(),2.7,.22*energy*hlevel,.24,.32,bar)

        # Warm real strings in four-bar breath groups. The bow attacks overlap
        # old releases so chamber space persists under each camera move.
        string_fade=smooth((time-22)/25)*(1-.25*smooth((time-reference_start)/8))
        if bar%2==0:
            swell=.50 if scene=='intro' else .78 if scene in ('kidney','measure') else .65
            sd=barsecs*2+.50
            for i,note in enumerate([chord[0],chord[2]]):
                add('viola',note,time-.24+i*.085,sd,.23*energy*string_fade*swell,-.20+i*.37,.52,bar)
            add('cello',bass[1],time-.16,sd,.24*energy*string_fade,-.13,.46,bar)
        # Soft pizzicato bass gives life without a synthetic heart/kick motif.
        pluckfade=smooth((time-36)/24)*(1-smooth((time-reference_start+7)/13))
        if pos not in (3,7):
            add('pizz',bass[0]+12,time+.025,1.7,.20*energy*pluckfade,-.10,.23,bar)
            if scene in ('pump','resistance','control'):
                add('pizz',bass[1],time+2.45*beat,1.35,.105*energy*pluckfade,.04,.23,bar+1)
        if scene in ('pump','resistance') and pos%2==1:
            add('tap',60,time+2*beat,0.22,.052*energy,-.05,.15,bar)

        time+=barsecs;bar+=1

    # A deliberate final Eb cadence, timed to the reference-page hold.
    cadence=max(0,seconds-7.3)
    for i,note in enumerate([51,58,63,67,70]):add('piano',note,cadence+.09*i,6.8,.24 if i<2 else .30,-.12+i*.055,.38,i)
    # Dense band-limited room impulse, low level and one shared acoustic space.
    irn=round(1.8*sr);tt=np.arange(irn)/sr
    ir=rng.normal(0,1,(irn,2)).astype(np.float32)
    ir*=np.exp(-tt[:,None]/.39);ir[:round(.023*sr)]=0
    ir=sosfilt(butter(2,3800,fs=sr,output='sos'),ir,axis=0).astype(np.float32)
    ir/=max(1e-8,float(np.sqrt(np.sum(ir**2,axis=0)).max()))
    ir*=.29
    for delay,g in [(.031,.13),(.047,.10),(.079,.07),(.113,.045)]:
        ir[round(delay*sr),0]+=g;ir[round((delay+.011)*sr),1]+=g*.93
    wet=np.empty_like(dry)
    for c in range(2):wet[:,c]=oaconvolve(send[:,c],ir[:,c],mode='full')[:n]
    out=dry+wet
    out=sosfilt(butter(2,42,fs=sr,btype='highpass',output='sos'),out,axis=0).astype(np.float32)
    fadein=np.minimum(np.arange(n,dtype=np.float32)/(sr*1.5),1)
    fadeout=np.minimum((n-1-np.arange(n,dtype=np.float32))/(sr*3.6),1)
    out*=np.sin(fadein[:,None]*np.pi/2)**2*np.sin(np.maximum(0,fadeout[:,None])*np.pi/2)**2
    peak=float(abs(out).max());out*=.66/max(peak,1e-9)
    report={'title':TITLE,'seed':SEED,'nominalBpm':BPM,'barCount':bar,'noteCount':len(events),'durationSeconds':n/sr,
            'instrumentCounts':{inst:sum(e['instrument']==inst for e in events) for inst in bank.files},
            'sampleBank':'VSCO 2 CE / CC0-1.0','synthOscillatorUsed':False,'events':events}
    (REPORTS/'music-v7-events.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
    return out

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--seconds',type=float);p.add_argument('--out',type=Path,default=REPORTS/'music-v7-unducked.wav');a=p.parse_args()
    t=json.loads((ROOT/'public/hypertension/timeline.json').read_text('utf8'));seconds=a.seconds or t['duration']/t['fps']
    audio=compose(seconds);sf.write(a.out,audio,SR,subtype='PCM_24');print(TITLE,len(audio)/SR,sha(a.out),flush=True)
