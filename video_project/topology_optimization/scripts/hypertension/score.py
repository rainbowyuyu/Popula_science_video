"""Procedural original score for the hypertension episode.

Title: Pulse in Motion / 脉流之间
Composed 2026-10-07 for the continuous anatomy-camera revision. The stem is
fully synthesized (no samples, downloaded loops, or music from another
episode). Its form is one uninterrupted circulation: a quiet cuff/heartbeat
opening, a gradually brighter blood-flow close-up, a restrained LDL/thrombus
tension, then a warm return to measurement. All transitions are crossfaded in
the synthesis envelope so the camera can travel between organs without a music
cut.

The function returns a stereo float32 music stem. It is intentionally mixed
quietly and must be ducked below narration by ``prepare_audio.py``. Generate
the complete final duration in one call; the short preview is only for review.
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
from scipy.signal import butter, sosfilt


SEED = 20261007
BPM = 88.0

# A gently modal, mostly pentatonic vocabulary leaves room for speech and
# gives the score a Chinese-adjacent timbre without pretending to be a
# traditional ensemble.
HARMONY = (
    (38, (50, 57, 62, 65, 69), (62, 65, 69, 74)),  # Dm(add9)
    (34, (50, 57, 62, 65, 69), (62, 65, 70, 74)),  # Bbmaj7
    (41, (53, 57, 60, 65, 69), (65, 69, 72, 76)),  # F(add2)
    (36, (48, 55, 60, 64, 67), (64, 67, 72, 76)),  # C(sus2)
    (43, (50, 55, 58, 62, 69), (62, 67, 70, 74)),  # Gm9 colour
    (34, (50, 57, 62, 65, 69), (62, 65, 70, 74)),
    (36, (48, 55, 60, 64, 67), (64, 67, 72, 76)),
    (38, (50, 57, 62, 65, 69), (62, 65, 69, 74)),
)

# Notes used for a restrained recurring “flow” figure. The motif repeats with
# small omissions and register changes rather than restarting at each scene.
PENTA = (62, 65, 67, 69, 72, 74, 77)


def _frequency(midi: float) -> float:
    return 440.0 * 2.0 ** ((float(midi) - 69.0) / 12.0)


def _clock(duration: float, sr: int) -> np.ndarray:
    return np.arange(max(1, int(np.ceil(float(duration) * sr))), dtype=np.float32) / sr


def _smoothstep(x: float) -> float:
    x = float(np.clip(x, 0.0, 1.0))
    return x * x * (3.0 - 2.0 * x)


def _pluck(midi: int, duration: float, velocity: float, sr: int,
           rng: np.random.Generator) -> np.ndarray:
    """Soft wood/string pluck with a short felt transient."""
    t = _clock(duration, sr)
    f = _frequency(midi)
    y = (np.sin(2.0 * np.pi * f * t)
         + 0.28 * np.sin(2.0 * np.pi * f * 2.01 * t + 0.12)
         + 0.105 * np.sin(2.0 * np.pi * f * 3.02 * t + 0.29))
    y *= np.exp(-t / max(0.24, duration * 0.43))
    y *= (1.0 - np.exp(-t / 0.004))
    y *= np.clip((duration - t) / 0.08, 0.0, 1.0)
    click = rng.standard_normal(len(t)).astype(np.float32)
    click = sosfilt(butter(1, min(1800.0, sr * 0.18), fs=sr, output="sos"), click)
    y += 0.018 * click * np.exp(-t / 0.012)
    return (y * float(velocity) * 0.095).astype(np.float32)


def _pad(midi: int, duration: float, sr: int, phase: float, amount: float) -> np.ndarray:
    t = _clock(duration, sr)
    f = _frequency(midi)
    attack = np.minimum(1.0, t / 1.0)
    attack = attack * attack * (3.0 - 2.0 * attack)
    release = np.clip((duration - t) / 1.45, 0.0, 1.0)
    release = release * release * (3.0 - 2.0 * release)
    wobble = 0.92 + 0.08 * np.sin(2.0 * np.pi * 0.075 * t + phase)
    y = (np.sin(2.0 * np.pi * f * 0.9990 * t + phase)
         + 0.54 * np.sin(2.0 * np.pi * f * 1.0013 * t + phase + 0.37)
         + 0.13 * np.sin(2.0 * np.pi * f * 2.0005 * t + phase * 0.71))
    return (y * attack * release * wobble * float(amount) * 0.010).astype(np.float32)


def _bass(midi: int, duration: float, sr: int, velocity: float) -> np.ndarray:
    t = _clock(duration, sr)
    f = _frequency(midi)
    env = (1.0 - np.exp(-t / 0.015)) * np.exp(-t / 0.95)
    env *= np.clip((duration - t) / 0.10, 0.0, 1.0)
    y = np.sin(2.0 * np.pi * f * t) + 0.20 * np.sin(2.0 * np.pi * 2.0 * f * t)
    return (y * env * float(velocity) * 0.064).astype(np.float32)


def _heartbeat(sr: int, second: bool = False) -> np.ndarray:
    """A soft lub/dub pulse, deliberately not a cinematic kick."""
    dur = 0.30 if not second else 0.22
    t = _clock(dur, sr)
    f0, f1 = (66.0, 48.0) if not second else (58.0, 43.0)
    sweep = f0 + (f1 - f0) * np.minimum(1.0, t / 0.13)
    phase = 2.0 * np.pi * np.cumsum(sweep) / sr
    env = np.exp(-t / (0.11 if not second else 0.08)) * (1.0 - np.exp(-t / 0.006))
    body = np.sin(phase) + 0.17 * np.sin(phase * 2.01)
    return (body * env * (0.068 if not second else 0.046)).astype(np.float32)


def _air(sr: int, rng: np.random.Generator) -> np.ndarray:
    t = _clock(0.18, sr)
    noise = rng.standard_normal(len(t)).astype(np.float32)
    high = min(7200.0, sr * 0.42)
    low = min(2600.0, high * 0.46)
    noise = sosfilt(butter(2, (low, high), btype="bandpass", fs=sr, output="sos"), noise)
    return (noise * (1.0 - np.exp(-t / 0.015)) * np.exp(-t / 0.026) * 0.007).astype(np.float32)


def circulation_score(seconds: float, sr: int = 48000) -> np.ndarray:
    """Return the complete original stereo score as contiguous float32."""
    seconds = float(seconds)
    sr = int(sr)
    if not np.isfinite(seconds) or seconds < 0:
        raise ValueError("seconds must be finite and non-negative")
    if sr < 12000:
        raise ValueError("sr must be at least 12000 Hz")
    n = int(round(seconds * sr))
    if n == 0:
        return np.zeros((0, 2), dtype=np.float32)

    rng = np.random.default_rng(SEED)
    dry = np.zeros((n, 2), dtype=np.float32)
    room_send = np.zeros_like(dry)
    beat = 60.0 / BPM
    bar_duration = 4.0 * beat
    total_bars = max(1, int(np.ceil(seconds / bar_duration)))

    def add(note: np.ndarray, at: float, pan: float = 0.0, room: float = 0.16) -> None:
        start = max(0, int(round(float(at) * sr)))
        length = min(len(note), n - start)
        if length <= 0:
            return
        angle = (float(np.clip(pan, -1.0, 1.0)) + 1.0) * np.pi / 4.0
        stereo = note[:length, None] * np.array([np.cos(angle), np.sin(angle)], dtype=np.float32)
        dry[start:start + length] += stereo
        room_send[start:start + length] += stereo * float(room)

    def amount(progress: float, start: float, end: float, fade: float = 0.055) -> float:
        return _smoothstep((progress - start) / fade) * (1.0 - _smoothstep((progress - end) / fade))

    for bar in range(total_bars):
        at = bar * bar_duration
        progress = min(1.0, (bar + 0.35) / total_bars)
        intro = 1.0 - _smoothstep((progress - 0.055) / 0.055)
        flow = amount(progress, 0.025, 0.43, 0.075)
        close = amount(progress, 0.20, 0.68, 0.075)
        tension = amount(progress, 0.43, 0.72, 0.075)
        warm = amount(progress, 0.63, 0.94, 0.085)
        coda = _smoothstep((progress - 0.875) / 0.125)
        body = min(1.0, 0.30 + 0.50 * flow + 0.35 * close + 0.22 * warm)
        root, pad_notes, piano_notes = HARMONY[(bar // 2) % len(HARMONY)]
        phrase = bar % 8

        if bar % 2 == 0:
            pad_level = 0.70 * (0.42 + 0.34 * body + 0.20 * warm) * (1.0 - 0.32 * coda)
            for i, note in enumerate(pad_notes):
                add(_pad(note, 2.0 * bar_duration + 1.4, sr,
                         float(rng.uniform(-np.pi, np.pi)), pad_level),
                    at, pan=-0.68 + i * 0.32, room=0.39)

        heart_level = 0.46 * (0.36 * intro + 0.17 * flow + 0.11 * tension + 0.28 * warm + 0.48 * coda)
        if heart_level > 0.008:
            add(_heartbeat(sr, False) * heart_level, at + 0.015, pan=-0.08, room=0.045)
            add(_heartbeat(sr, True) * heart_level * 0.72,
                at + 0.19 * beat, pan=0.09, room=0.045)

        bass_level = 0.30 * body * (1.0 - 0.35 * coda)
        add(_bass(root, 1.65 * beat, sr, bass_level), at + 0.02, pan=-0.03, room=0.025)
        if phrase in (1, 3, 5) and bass_level > 0.01:
            add(_bass(root + 12, 0.78 * beat, sr, bass_level * 0.43),
                at + 2.55 * beat, pan=0.03, room=0.025)

        if bar % 2 == 0 and (flow + warm + intro) > 0.08:
            for k, note in enumerate(piano_notes[:3]):
                level = 0.11 * (0.55 + 0.70 * body) * (1.0 - 0.52 * coda)
                add(_pluck(note, 1.75, level, sr, rng),
                    at + (0.11 + 0.21 * k) * beat,
                    pan=-0.34 + 0.24 * k, room=0.25)

        flow_level = 0.075 + 0.15 * flow + 0.20 * close + 0.10 * warm
        density = 2 if progress < 0.12 else (4 if progress < 0.35 else 6)
        if tension > 0.35:
            density = max(density, 5)
        for j in range(density):
            if phrase == 7 and j >= density - 1:
                continue
            offset = (0.34 + j * (3.15 / max(1, density - 1))) * beat
            midi = PENTA[(j + bar + (1 if tension > 0.42 else 0)) % len(PENTA)]
            if tension > 0.45 and j % 3 == 1:
                midi -= 12
            if warm > 0.55 and j % 4 == 0:
                midi += 12
            add(_pluck(midi, 0.58 if density >= 5 else 0.72,
                       flow_level * (0.76 + 0.13 * np.sin(j + bar)), sr, rng),
                at + offset, pan=0.18 * np.sin(0.7 * bar + j), room=0.22)

        shimmer_level = 0.045 * (0.2 * flow + 0.85 * close + 0.45 * warm) * (1.0 - 0.65 * coda)
        if shimmer_level > 0.004:
            for offset in ((0.75, 2.75) if phrase % 2 == 0 else (1.25, 3.25)):
                add(_air(sr, rng) * shimmer_level, at + offset * beat,
                    pan=0.50 * np.sin(offset + bar), room=0.10)

    wet = np.zeros_like(dry)
    for delay, gain, cross in ((0.031, 0.27, False), (0.057, 0.21, True),
                               (0.103, 0.16, False), (0.167, 0.13, True),
                               (0.271, 0.095, False), (0.401, 0.065, True),
                               (0.623, 0.040, False)):
        shift = int(round(delay * sr))
        if shift < n:
            source = room_send[:-shift, ::-1] if cross else room_send[:-shift]
            wet[shift:] += source * gain
    wet = sosfilt(butter(2, min(4200.0, sr * 0.3), fs=sr, output="sos"), wet, axis=0).astype(np.float32)
    out = dry + wet
    out = sosfilt(butter(2, 28.0, btype="highpass", fs=sr, output="sos"), out, axis=0).astype(np.float32)
    out = np.tanh(out * 1.17).astype(np.float32)
    fade_in_n = min(n, int(1.35 * sr))
    fade_out_n = min(n, int(min(5.0, max(1.0, seconds * 0.18)) * sr))
    if fade_in_n:
        out[:fade_in_n] *= np.sin(np.linspace(0, np.pi / 2, fade_in_n, dtype=np.float32))[:, None] ** 2
    if fade_out_n:
        out[-fade_out_n:] *= np.sin(np.linspace(np.pi / 2, 0, fade_out_n, dtype=np.float32))[:, None] ** 2
    peak = float(np.max(np.abs(out))) if len(out) else 0.0
    if peak > 1e-10:
        out *= 0.68 / peak
    return np.ascontiguousarray(out, dtype=np.float32)


if __name__ == "__main__":
    import soundfile as sf

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seconds", type=float, default=30.0)
    parser.add_argument("--sr", type=int, default=48000)
    parser.add_argument("--out", type=Path,
                        default=Path("research/hypertension/music-preview-v2.wav"))
    args = parser.parse_args()
    audio = circulation_score(args.seconds, args.sr)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    sf.write(args.out, audio, args.sr, subtype="PCM_24")
    peak = float(np.max(np.abs(audio))) if len(audio) else 0.0
    rms = float(np.sqrt(np.mean(audio.astype(np.float64) ** 2))) if len(audio) else 0.0
    print(f"Original score: Pulse in Motion / 脉流之间; seed={SEED}; tempo={BPM:g} BPM")
    print(f"Output: {args.out.resolve()}")
    print(f"Shape={audio.shape}, dtype={audio.dtype}, sr={args.sr}; "
          f"peak={peak:.5f} ({20*np.log10(max(peak,1e-12)):.2f} dBFS); "
          f"RMS={rms:.5f} ({20*np.log10(max(rms,1e-12)):.2f} dBFS)")
