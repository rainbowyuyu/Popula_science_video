"""Make a clean, original Chinese-inspired score for the Nobel film.

The bed uses a warm pentatonic pad, soft guzheng-like plucks and restrained
wooden pulse tones. Every sound is synthesized from smooth harmonic partials;
there is no white-noise layer, hard gate, or broadband texture for the voice
ducking stage to expose during pauses.
"""
from pathlib import Path
import json
import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public/nobel2026/nobel-v2-bgm.wav"
SR = 48_000
SECONDS = 300
N = SR * SECONDS
T = np.arange(N, dtype=np.float64) / SR

# Keep the harmonic coda attached to the actual V3 timeline.  The narration
# was shortened during pronunciation cleanup, so a fixed 240 s start could
# leave a quiet hole before the paper cards.  Fall back to the historical
# value when this score is generated before a timeline exists.
timeline_path = ROOT / "src/nobel2026/timeline-v3.json"
CODA_START = 240.0
if timeline_path.exists():
    try:
        timeline = json.loads(timeline_path.read_text(encoding="utf-8"))
        ref_scene = next((s for s in timeline.get("scenes", []) if s.get("id") == "references"), None)
        if ref_scene:
            CODA_START = float(ref_scene["start"]) / float(timeline.get("fps", 30))
    except (OSError, ValueError, KeyError, TypeError, StopIteration):
        pass

# D-major pentatonic, centred low enough to stay behind a Chinese voice.
SCALE = np.array([146.832, 164.814, 196.000, 220.000, 246.942, 293.665])

# Warm drone with very slow movement; all components remain below 600 Hz.
drone = (
    0.015 * np.sin(2 * np.pi * 73.416 * T)
    + 0.010 * np.sin(2 * np.pi * 110.000 * T + 0.08 * np.sin(2 * np.pi * T / 31.0))
    + 0.006 * np.sin(2 * np.pi * 146.832 * T + 0.12 * np.sin(2 * np.pi * T / 47.0))
)
drone *= 0.66 + 0.34 * (0.5 + 0.5 * np.sin(2 * np.pi * T / 38.0))

bed = drone.copy()

def add_pad(start: float, length: float, notes: list[float], amp: float = 0.008) -> None:
    """Add a slowly crossfaded chord so the score has a musical floor."""
    i = int(start * SR)
    if i >= N:
        return
    count = min(int(length * SR), N - i)
    d = np.arange(count, dtype=np.float64) / SR
    attack = np.clip(d / 2.6, 0.0, 1.0)
    release = np.clip((length - d) / 3.4, 0.0, 1.0)
    env = (attack * release) ** 0.72
    local = np.zeros(count, dtype=np.float64)
    for j, freq in enumerate(notes):
        phase = 2 * np.pi * freq * d + 0.04 * np.sin(2 * np.pi * d / (8.0 + j))
        local += (1.0 - j * 0.08) * np.sin(phase)
        local += 0.18 * np.sin(phase * 2.0 + 0.17 * j)
    local /= max(1.0, len(notes) * 1.12)
    local *= env * (0.84 + 0.16 * np.sin(2 * np.pi * d / 19.0 + start))
    bed[i:i + count] += amp * local

def add_pluck(start: float, freq: float, amp: float, length: float = 2.8) -> None:
    """Add a soft, rounded guzheng-like pluck with harmonic decay."""
    i = int(start * SR)
    if i >= N:
        return
    count = min(int(length * SR), N - i)
    d = np.arange(count, dtype=np.float64) / SR
    attack = 1.0 - np.exp(-d / 0.032)
    env = attack * np.exp(-d / 1.35) * (0.78 + 0.22 * np.exp(-d / 0.22))
    bend = 0.012 * np.sin(2 * np.pi * 4.2 * d)
    phase = 2 * np.pi * freq * d + bend
    # Inharmonic high partials keep the pluck organic without adding noise.
    tone = (
        0.82 * np.sin(phase)
        + 0.27 * np.sin(phase * 2.01 + 0.10)
        + 0.13 * np.sin(phase * 3.02 + 0.22)
        + 0.055 * np.sin(phase * 4.07 + 0.31)
    )
    bed[i:i + count] += amp * env * tone

def add_wood_pulse(start: float, freq: float, amp: float = 0.0045) -> None:
    """Add a quiet, rounded pulse that marks the phrase without a click."""
    i = int(start * SR)
    count = min(int(0.32 * SR), N - i)
    if i >= N or count <= 0:
        return
    d = np.arange(count, dtype=np.float64) / SR
    env = (1.0 - np.exp(-d / 0.009)) * np.exp(-d / 0.095)
    tone = 0.72 * np.sin(2 * np.pi * freq * d) + 0.18 * np.sin(2 * np.pi * freq * 2.02 * d)
    bed[i:i + count] += amp * env * tone

# Four slow, open chords give the narration a gentle arc instead of isolated
# test tones. The 24-second cycle is deliberately longer than a platform loop.
CHORDS = [
    [146.832, 220.000, 293.665],
    [164.814, 246.942, 329.628],
    [196.000, 293.665, 392.000],
    [220.000, 329.628, 440.000],
]
for chord_index, start in enumerate(np.arange(0.0, SECONDS, 24.0)):
    add_pad(float(start), min(26.0, SECONDS - float(start)), CHORDS[chord_index % len(CHORDS)], 0.010)

# Six-beat phrases; rotate the starting degree every 32 seconds to avoid a
# loop that feels mechanical while keeping a stable sonic identity.
phrase = [0, 2, 4, 3, 1, 2, 5, 3]
for k, start in enumerate(np.arange(2.2, SECONDS - 1.0, 3.2)):
    degree = phrase[k % len(phrase)] + (k // 16) % 2
    freq = SCALE[degree % len(SCALE)]
    octave = 2.0 if (k % 13 == 7) else 1.0
    add_pluck(float(start), float(freq * octave), 0.024 if octave == 1.0 else 0.016)
    if k % 2 == 0:
        add_wood_pulse(float(start), float(freq * 2.0), 0.0038)

# The references coda has no narration.  Keep a barely moving harmonic floor
# there so the paper cards never arrive over an accidental dead-air hole.  A
# two-second crossfade avoids introducing a new onset at the coda boundary.
# Start two seconds before the paper scene so the AAC encode never exposes a
# quiet hole at the exact visual cut.  The slightly stronger floor remains
# well below narration and is audible only during the no-voice coda.
CODA_PAD_START = max(0.0, CODA_START - 2.0)
coda_env = np.clip((T - CODA_PAD_START) / 2.0, 0.0, 1.0)
bed += coda_env * (
    0.040 * np.sin(2 * np.pi * 73.416 * T)
    + 0.026 * np.sin(2 * np.pi * 110.000 * T)
    + 0.015 * np.sin(2 * np.pi * 146.832 * T)
)

# Fade the score in/out so the first and last frames never begin with a click.
fade_in = np.clip(T / 3.0, 0.0, 1.0)
fade_out = np.clip((SECONDS - T) / 5.0, 0.0, 1.0)
bed *= fade_in * fade_out

# Keep plentiful headroom for side-chain ducking and final loudness pass.
peak = float(np.max(np.abs(bed)))
if peak > 0:
    bed *= min(1.0, 0.20 / peak)

# Slight decorrelation without chorus or broadband noise.
right = bed * 0.965 + 0.002 * np.sin(2 * np.pi * 0.11 * T)
stereo = np.column_stack((bed, right)).astype(np.float32)
sf.write(OUT, stereo, SR, subtype="PCM_24")
print(OUT)
