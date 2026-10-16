"""Reusable sampler only; no earlier melody, progression, or score. CC0 bank."""
from pathlib import Path
from functools import lru_cache
from fractions import Fraction
import re
import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly
ROOT=Path(__file__).resolve().parents[1]
SAMPLES=ROOT/'public/music/samples'
SR=48000
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

