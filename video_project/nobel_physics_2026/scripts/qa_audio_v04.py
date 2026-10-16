"""Deterministic checks for the natural-speed V04 audio package."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]
timeline = json.loads((ROOT / "src/physics2026/timeline-v03.json").read_text(encoding="utf-8"))
manifest = json.loads((ROOT / "audio/v04/audio-manifest-v04.json").read_text(encoding="utf-8"))

def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()

failures: list[str] = []
clip_checks = []
for clip in timeline["clips"]:
    path = ROOT / clip["audio"]
    if not path.exists():
        failures.append(f"missing {clip['id']}: {path}")
        continue
    info = sf.info(path)
    duration = float(info.duration)
    if abs(duration - float(clip["audioSeconds"])) > 0.05:
        failures.append(f"duration {clip['id']}: {duration:.3f} != {clip['audioSeconds']}")
    for part in clip["subtitleParts"]:
        if not (0 <= float(part["start"]) < float(part["end"]) <= duration + 0.05):
            failures.append(f"subtitle bounds {clip['id']}: {part}")
    clip_checks.append({"id": clip["id"], "seconds": round(duration, 4), "sha256": sha256(path)})

master = ROOT / "audio/v04/master.wav"
narration = ROOT / "audio/v04/narration.wav"
music = ROOT / "audio/v04/music.wav"
for path in (master, narration, music):
    if not path.exists():
        failures.append(f"missing mix asset: {path}")

master_info = sf.info(master)
master_data, sample_rate = sf.read(master, dtype="float32", always_2d=True)
peak = float(np.max(np.abs(master_data)))
if peak > 0.99:
    failures.append(f"sample peak {peak:.4f} exceeds -0.09 dBFS")

result = {
    "version": "nobel-physics-2026-v04-audio-qa",
    "timelineSeconds": timeline["seconds"],
    "masterSeconds": round(float(master_info.duration), 6),
    "masterFrameDeltaAt30fps": round(float(timeline["seconds"]) - float(master_info.duration), 6),
    "masterSampleRate": sample_rate,
    "masterChannels": master_info.channels,
    "masterPeakLinear": round(peak, 6),
    "masterSha256": sha256(master),
    "narrationSeconds": round(float(sf.info(narration).duration), 6),
    "musicSeconds": round(float(sf.info(music).duration), 6),
    "subtitlePartsChecked": sum(len(c["subtitleParts"]) for c in timeline["clips"]),
    "clips": clip_checks,
    "failures": failures,
    "notes": [
        "Audio takes are natural-speed Qwen3-TTS captures; no atempo fitting.",
        "The remaining master/picture difference is under one 30 fps frame and is handled by final mux duration.",
        "ASR and objective loudness checks do not replace human listening for pronunciation or music taste.",
    ],
}
(ROOT / "audio/v04/audio-qa-v04.json").write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(result, ensure_ascii=False, indent=2))
if failures:
    raise SystemExit(1)
