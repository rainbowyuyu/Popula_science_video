"""Deterministic original ambient score for episode 01.
Oceanic pads and a slow four-chord cycle leave speech space; no external track is reused.
"""
from pathlib import Path
import numpy as np, soundfile as sf, json, hashlib

ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'public/audio/episode01-bgm.wav'; OUT.parent.mkdir(parents=True,exist_ok=True)
SR=48000; DUR=360; N=SR*DUR; rng=np.random.default_rng(20261013)
chords=[[146.83,174.61,220.00,261.63],[174.61,220.00,261.63,329.63],[130.81,164.81,196.00,246.94],[146.83,185.00,220.00,277.18]]
out=np.zeros((N,2),np.float32); block=SR*6
for start in range(0,N,block):
    end=min(N,start+block); n=end-start; t=(np.arange(n)+start)/SR; ci=(t.astype(np.int64)//32)%4; y=np.zeros(n,np.float64)
    for k in range(4):
        fs=np.array([chords[i][k] for i in ci]); ph=2*np.pi*fs*t
        env=.18*(.65+.35*np.sin(2*np.pi*t/96+k*.7)); y+=env*np.sin(ph+0.12*np.sin(2*np.pi*t/21+k))
    roots=np.array([chords[i][0]/2 for i in ci]); y+=.055*np.sin(2*np.pi*roots*t)
    beat=t%4; hit=np.exp(-beat*7.5); note=np.array([chords[i][int((t[j]//4)%4)] for j,i in enumerate(ci)]); y+=.045*hit*np.sin(2*np.pi*note*t)*np.exp(-beat*2.2)
    noise=rng.normal(0,1,n); roll=np.convolve(noise,np.ones(120)/120,mode='same'); y+=.010*roll+.003*np.sin(2*np.pi*0.12*t)
    y=np.tanh(y*1.15); pan=.018*np.sin(2*np.pi*t/23); out[start:end,0]=y*(.93-pan); out[start:end,1]=y*(.93+pan)
peak=np.max(np.abs(out)); out*=.55/max(peak,1e-6)
sf.write(OUT,out,SR,subtype='PCM_16')
meta={'file':str(OUT),'durationSec':DUR,'sampleRate':SR,'seed':20261013,'type':'original_deterministic_ambient','sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'externalLicense':None}
(ROOT/'work/audio/bgm-provenance.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(meta,ensure_ascii=False))
