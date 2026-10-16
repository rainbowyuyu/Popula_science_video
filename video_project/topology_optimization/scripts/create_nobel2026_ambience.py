"""Create a quiet, non-musical lab ambience for narration gaps.

The bed is deliberately below the narration and has no melody, so it keeps
visual holds connected without competing with the Qwen3-TTS voice.
"""
from pathlib import Path
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/nobel2026/ambience-bed.wav"
SR = 48_000
DURATION = 300
rng = np.random.default_rng(20261005)
n = SR * DURATION
t = np.arange(n, dtype=np.float64) / SR

# A slow, smooth noise floor plus two very quiet moving partials. The output
# is intentionally around -42 dBFS RMS before final loudness normalization.
white = rng.normal(0.0, 1.0, n)
pink = np.empty(n, dtype=np.float64)
state = 0.0
for i, x in enumerate(white):
    state = 0.996 * state + 0.004 * x
    pink[i] = state
pink /= max(np.std(pink), 1e-9)
phase = 0.15 * np.sin(2 * np.pi * 0.009 * t)
partials = (
    0.55 * np.sin(2 * np.pi * 196.0 * t + phase)
    + 0.35 * np.sin(2 * np.pi * 293.664 * t - 0.7 * phase)
)
partials /= max(np.std(partials), 1e-9)
mono = 0.0060 * pink + 0.0018 * partials

# Gentle entry/exit and a tiny stereo decorrelation.
fade = np.ones(n)
fade_len = SR * 3
fade[:fade_len] = np.linspace(0, 1, fade_len)
fade[-fade_len:] = np.linspace(1, 0, fade_len)
mono *= fade
right = mono * 0.94 + rng.normal(0.0, 0.00018, n)
stereo = np.column_stack([mono, right]).astype(np.float32)
OUT.parent.mkdir(parents=True, exist_ok=True)
sf.write(OUT, stereo, SR, subtype="PCM_24")
print(OUT)
