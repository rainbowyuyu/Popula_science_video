"""Create a deterministic, original boom-bap science-rap bed.

The old bed was a sparse half-time pulse. This version keeps the calm
cinematic palette but adds kick/snare backbeat, swung 16th hats, short 808
notes, and four/eight-bar variations. It contains no external sample.
"""
from pathlib import Path
import numpy as np
import soundfile as sf
from scipy.signal import butter, lfilter

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'audio/v04/rap-beat.wav'
SR = 48_000
BPM = 104
BEAT = 60.0 / BPM
STEP = BEAT / 4.0
BAR = BEAT * 4.0
DURATION = 360.0
N = int(SR * DURATION)
rng = np.random.default_rng(20261008)
mix = np.zeros(N, dtype=np.float32)

def add(pos, sig, gain=1.0):
    i = int(round(pos * SR))
    if i >= N:
        return
    i = max(0, i)
    end = min(N, i + len(sig))
    mix[i:end] += sig[:end-i] * gain

def kick():
    n = int(.30 * SR)
    x = np.arange(n, dtype=np.float32) / SR
    phase = 2*np.pi*(48*x + 24*(1-np.exp(-x*30)))
    body = np.sin(phase) * np.exp(-x*15)
    click = rng.normal(0, 1, n).astype(np.float32) * np.exp(-x*120)
    return (body*.95 + click*.035).astype(np.float32)

def snare():
    n = int(.24 * SR)
    x = np.arange(n, dtype=np.float32) / SR
    noise = rng.normal(0, 1, n).astype(np.float32)
    b, a = butter(2, [1400/(SR/2), 9000/(SR/2)], btype='band')
    bright = lfilter(b, a, noise).astype(np.float32)
    body = np.sin(2*np.pi*185*x) * np.exp(-x*23)
    clap = (np.sin(2*np.pi*520*x) + .35*np.sin(2*np.pi*760*x)) * np.exp(-x*34)
    return (bright*.36 + body*.30 + clap*.14) * np.exp(-x*13)

def hat(open_hat=False):
    dur = .20 if open_hat else .045
    n = int(dur * SR)
    x = np.arange(n, dtype=np.float32) / SR
    noise = rng.normal(0, 1, n).astype(np.float32)
    b, a = butter(2, 5600/(SR/2), btype='high')
    airy = lfilter(b, a, noise).astype(np.float32)
    env = np.exp(-x*(18 if open_hat else 70))
    return airy * env * (.14 if open_hat else .105)

def rim():
    n = int(.075 * SR)
    x = np.arange(n, dtype=np.float32) / SR
    return (np.sin(2*np.pi*1600*x) + .25*np.sin(2*np.pi*2400*x)) * np.exp(-x*55) * .16

def bass(freq, dur=.42):
    n = int(dur * SR)
    x = np.arange(n, dtype=np.float32) / SR
    f = freq * (1.0 - .10*np.exp(-x*18))
    phase = 2*np.pi*np.cumsum(f) / SR
    env = np.minimum(1, x*45) * np.exp(-x*3.9)
    return (np.sin(phase) + .18*np.sin(2*phase)) * env * .30

def pad(freq, dur=BAR*2):
    n = int(dur * SR)
    x = np.arange(n, dtype=np.float32) / SR
    env = np.minimum(1, x*.8) * np.minimum(1, (dur-x)*.55)
    env = np.maximum(env, 0)
    return (np.sin(2*np.pi*freq*x) + .22*np.sin(2*np.pi*freq*1.004*x)) * env * .035

roots = [55.0, 65.41, 73.42, 49.0]
bars = int(np.ceil(DURATION / BAR))
for bar in range(bars):
    base = bar * BAR
    root = roots[bar % len(roots)]
    section = (bar // 8) % 3
    variation = bar % 4
    if bar % 2 == 0:
        add(base, pad(root*2, BAR*1.9), 1.0)
        add(base, pad(root*2.5, BAR*1.9), .62)
    kick_steps = {0, 8, 6 if variation in (1, 3) else 10}
    if section == 1 and variation == 3:
        kick_steps.add(14)
    for step in sorted(kick_steps):
        add(base + step*STEP, kick(), .82 if step in (0, 8) else .55)
    for step in (4, 12):
        add(base + step*STEP, snare(), .64)
    if variation == 3:
        add(base + 11*STEP, snare(), .18)
    if section == 0 and variation == 0:
        add(base + 15*STEP, rim(), .55)
    for step in range(16):
        swing = .028 if step % 2 else 0.0
        if step % 2 == 0 or (section == 0 and step in (3, 7, 11, 15)):
            add(base + step*STEP + swing, hat(step in (7, 15) and variation == 3), .72 if step % 4 == 0 else .48)
    add(base, bass(root, .55), .82)
    if variation in (1, 3):
        add(base + 2.5*BEAT, bass(root*1.5, .30), .42)
    if section == 0 and variation == 2:
        add(base + 3.5*BEAT, bass(root*.75, .26), .30)

mix = np.tanh(mix * 1.35).astype(np.float32)
peak = float(np.max(np.abs(mix))) or 1.0
mix = mix * min(0.92, .92/peak)
stereo = np.stack([mix, mix*.965], axis=1)
OUT.parent.mkdir(parents=True, exist_ok=True)
sf.write(OUT, stereo, SR, subtype='PCM_24')
print(OUT, sf.info(OUT))
