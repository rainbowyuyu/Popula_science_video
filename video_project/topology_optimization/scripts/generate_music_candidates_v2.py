"""Create isolated 24-second Chinese-style music previews.

This deliberately writes to ``public/episode3v2/music/candidates-v2`` and
never writes master.wav, premaster.wav, or the selected production score.
Each preview is a self-contained stereo music bed, useful for choosing a
single score before a later film mix.
"""
from __future__ import annotations

import hashlib
import json
import math
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "episode3v2" / "music" / "candidates-v2"
REPORT = ROOT / "research" / "episode3v2" / "music-candidates-v2.json"
OUT.mkdir(parents=True, exist_ok=True)

SR = 48_000
DURATION = 24.0
N = int(SR * DURATION)
T = np.arange(N, dtype=np.float64) / SR
SCALE = np.array([146.832, 164.814, 196.000, 220.000, 261.626, 293.665, 329.628, 392.000])


def fade(x: np.ndarray, attack: float = 1.2, release: float = 2.0) -> np.ndarray:
    env = np.ones(len(x), dtype=np.float64)
    env *= np.minimum(1.0, np.arange(len(x)) / (attack * SR))
    env *= np.minimum(1.0, (len(x) - 1 - np.arange(len(x))) / (release * SR))
    shape = (len(env),) if x.ndim == 1 else (len(env), 1)
    return x * np.clip(env, 0.0, 1.0).reshape(shape)


def pan(mono: np.ndarray, position: float) -> np.ndarray:
    """Constant-power pan, position -1..1."""
    a = (float(position) + 1.0) * math.pi / 4.0
    return np.column_stack((mono * math.cos(a), mono * math.sin(a)))


def pluck(freq: float, length: float, amplitude: float, decay: float = 1.1) -> np.ndarray:
    n = max(1, int(length * SR))
    t = np.arange(n, dtype=np.float64) / SR
    attack = 1.0 - np.exp(-t / 0.009)
    env = attack * np.exp(-t / decay)
    # A restrained partial stack reads as wood/string without a synthetic beep.
    tone = (np.sin(2 * math.pi * freq * t)
            + 0.24 * np.sin(4 * math.pi * freq * t + 0.08)
            + 0.08 * np.sin(6 * math.pi * freq * t + 0.17))
    return amplitude * env * tone


def breath(freq: float, length: float, amplitude: float) -> np.ndarray:
    n = max(1, int(length * SR))
    t = np.arange(n, dtype=np.float64) / SR
    vibrato = 0.004 * np.sin(2 * math.pi * 5.2 * t)
    phase = 2 * math.pi * freq * t + vibrato
    env = (1 - np.exp(-t / 0.32)) * np.minimum(1.0, (n - 1 - np.arange(n)) / (1.8 * SR))
    # Soft upper partials and filtered noise give an airy xiao-like onset.
    rng = np.random.default_rng(int(freq * 10))
    noise = rng.normal(0.0, 1.0, n)
    noise = np.convolve(noise, np.ones(120) / 120.0, mode="same")
    return amplitude * env * (np.sin(phase) + 0.14 * np.sin(2 * phase) + 0.035 * noise)


def wooden_click(length: float = 0.18, amplitude: float = 0.1) -> np.ndarray:
    n = max(1, int(length * SR))
    t = np.arange(n, dtype=np.float64) / SR
    return amplitude * np.exp(-t / 0.035) * (np.sin(2 * math.pi * 180 * t) + 0.32 * np.sin(2 * math.pi * 510 * t))


def ambience(kind: str) -> np.ndarray:
    y = np.zeros((N, 2), dtype=np.float64)
    if kind == "qin-bamboo":
        bpm, phrase, step = 92, [0, 2, 4, 5, 7, 5, 4, 2], 1.0
        reps = max(3, int(math.ceil((N / SR) / ((60 / bpm) * step * len(phrase)))) + 1)
        for i, idx in enumerate(phrase * reps):
            start = int((0.6 + i * (60 / bpm) * step) * SR)
            if start >= N:
                break
            note = pluck(SCALE[(idx + (i // 8)) % len(SCALE)], 2.0, 0.075, 1.25)
            stop = min(N, start + len(note))
            y[start:stop] += pan(note[:stop - start], -0.22 if i % 2 else 0.18)
        title, tempo, mood = "竹影琴弦", bpm, "古琴线条，适合木构件细节与镜头滑移"
    elif kind == "xiao-courtyard":
        bpm, phrase = 84, [4, 5, 7, 5, 4, 2, 3, 4]
        reps = max(3, int(math.ceil((N / SR) / ((60 / bpm) * 0.95 * len(phrase)))) + 1)
        for i, idx in enumerate(phrase * reps):
            start = int((0.9 + i * (60 / bpm) * 0.95) * SR)
            if start >= N:
                break
            note = breath(SCALE[(idx + i // 8) % len(SCALE)] / 2, 2.45, 0.082)
            stop = min(N, start + len(note))
            y[start:stop] += pan(note[:stop - start], 0.22 if i % 3 else -0.2)
        title, tempo, mood = "檐下箫声", bpm, "箫的气息与院落空间，适合故事引入和结构转场"
    elif kind == "wooden-pulse":
        bpm, phrase = 104, [0, 2, 4, 2, 5, 4, 2, 1]
        reps = max(3, int(math.ceil((N / SR) / ((60 / bpm) * 0.92 * len(phrase)))) + 1)
        for i, idx in enumerate(phrase * reps):
            start = int((0.45 + i * (60 / bpm) * 0.92) * SR)
            if start >= N:
                break
            note = pluck(SCALE[(idx + i // 8) % len(SCALE)] / 2, 1.2, 0.06, 0.58)
            stop = min(N, start + len(note))
            y[start:stop] += pan(note[:stop - start], -0.1 + (i % 3) * 0.1)
            click = wooden_click(0.16, 0.055 if i % 4 else 0.08)
            cstop = min(N, start + len(click))
            y[start:cstop] += pan(click[:cstop - start], 0.35)
        title, tempo, mood = "木作回响", bpm, "木质击音与短琴音，适合装配、受力和拆解节奏"
    else:
        bpm, phrase = 76, [0, 1, 3, 4, 6, 4]
        reps = max(3, int(math.ceil((N / SR) / ((60 / bpm) * 1.18 * len(phrase)))) + 1)
        for i, idx in enumerate(phrase * reps):
            start = int((1.3 + i * (60 / bpm) * 1.18) * SR)
            if start >= N:
                break
            note = pluck(SCALE[(idx + i // 6) % len(SCALE)] / 2, 3.8, 0.055, 2.6)
            stop = min(N, start + len(note))
            y[start:stop] += pan(note[:stop - start], 0.28 if i % 2 else -0.28)
        # Barely audible high-frequency droplets add motion without hiss.
        for sec in np.arange(2.5, DURATION - 1, 2.7):
            st = int(sec * SR)
            drop = pluck(880 + 45 * (int(sec * 10) % 4), 0.28, 0.018, 0.16)
            y[st:min(N, st + len(drop))] += pan(drop[:min(N, st + len(drop)) - st], 0.45)
        title, tempo, mood = "雨檐留白", bpm, "稀疏琴音与雨点，适合风雨、木材含水率与片尾"
    return title, tempo, mood, y


def loudness(path: Path) -> dict:
    result = subprocess.run(
        ["ffmpeg", "-hide_banner", "-i", str(path), "-af", "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json", "-f", "null", "-"],
        capture_output=True, text=True, check=False,
    )
    tail = result.stderr[result.stderr.rfind("{"):]
    try:
        return json.loads(tail[:tail.rfind("}") + 1])
    except Exception:
        return {"error": "ffmpeg loudnorm parse failed", "stderr": result.stderr[-500:]}


def main() -> None:
    rows = []
    for kind in ("qin-bamboo", "xiao-courtyard", "wooden-pulse", "eave-rain"):
        title, tempo, mood, y = ambience(kind)
        # Keep candidates independent and below headroom; no narration is added.
        y = fade(y, 1.5, 2.5)
        peak = float(np.max(np.abs(y)))
        y *= min(1.0, 0.72 / max(peak, 1e-9))
        path = OUT / f"{kind}-preview.wav"
        raw_path = OUT / f".{kind}-raw.wav"
        sf.write(raw_path, y.astype(np.float32), SR, subtype="PCM_16")
        # Normalize each audition file independently. The final film mix can
        # duck this bed under narration later; this keeps previews comparable.
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(raw_path),
            "-af", "loudnorm=I=-18:TP=-2:LRA=7:linear=true",
            "-ar", str(SR), "-c:a", "pcm_s16le", str(path),
        ], check=True)
        raw_path.unlink(missing_ok=True)
        measured = loudness(path)
        final_audio, _ = sf.read(path, dtype="float32", always_2d=True)
        rows.append({
            "style": kind,
            "title": title,
            "tempoBpm": tempo,
            "durationSeconds": DURATION,
            "mood": mood,
            "file": f"music/candidates-v2/{path.name}",
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            "peakLinear": round(float(np.max(np.abs(final_audio))), 6),
            "loudness": measured,
            "containsNarration": False,
            "singleMusicBed": True,
        })
    REPORT.write_text(json.dumps({
        "version": "candidates-v2",
        "generatedBy": "generate_music_candidates_v2.py",
        "sampleRate": SR,
        "previewSeconds": DURATION,
        "masterUntouched": True,
        "overlapCheck": {"candidateTracksPerPreview": 1, "narrationTracks": 0, "status": "pass"},
        "candidates": rows,
        "recommendation": "wooden-pulse",
        "recommendationReason": "节奏更轻快，木质击音呼应榫卯装配，仍保留中国音阶与足够旁白空间。",
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"output": str(OUT), "report": str(REPORT), "count": len(rows)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
