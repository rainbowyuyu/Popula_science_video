from pathlib import Path
import numpy as np, soundfile as sf, math
R=Path(__file__).resolve().parents[1]; out=R/'public/episode2/rainbow_arc_ambient.wav'; sr=48000; sec=330
t=np.arange(int(sr*sec),dtype=np.float32)/sr
rng=np.random.default_rng(20261003)
music=np.zeros_like(t)
# Original ambient score: slow glassy pad + gentle marimba-like pulses, no reused track.
for f,a in [(110,.08),(164.81,.045),(220,.035),(329.63,.022)]:
    music += a*np.sin(2*np.pi*f*t + .17*np.sin(2*np.pi*.07*t))
for start in np.arange(0,sec,4):
    k=(t>=start)&(t<start+2.7); u=t[k]-start; env=np.sin(np.pi*np.clip(u/2.7,0,1))**2
    for f in [440,554.37,659.25]: music[k]+=0.018*env*np.sin(2*np.pi*f*u)*np.exp(-u/1.6)
noise=rng.normal(0,1,len(t)).astype(np.float32)
music += .0025*noise
fade=np.minimum(1,t/3)*np.minimum(1,(sec-t)/5); music*=fade
# Keep the authored score below narration headroom.  The previous expression
# divided by (peak * .24), which amplified quiet material and caused clipping.
music/=max(1e-6,np.max(np.abs(music)))
music*=.24
st=np.column_stack([music,music]); sf.write(out,st,sr,subtype='PCM_24'); print(out)
