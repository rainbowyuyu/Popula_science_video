"""Build the production master with exactly one new music bed.

The old master is copied by the caller before this script runs. This script
only touches the selected wooden-pulse files, premaster, master, and audio
manifest; it does not access any video source or timeline.
"""
from __future__ import annotations

import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import lfilter

ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "public" / "episode3v2"
OUT = PUBLIC / "music" / "candidates-v2"
REPORT = ROOT / "research" / "episode3v2" / "music-candidates-v2.json"
MANIFEST = ROOT / "research" / "episode3v2" / "audio-manifest.json"
SR = 48_000


def measured_loudnorm(path: Path) -> dict:
    p = subprocess.run([
        "ffmpeg", "-hide_banner", "-i", str(path),
        "-af", "loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json",
        "-f", "null", "-",
    ], capture_output=True, text=True, check=True)
    tail = p.stderr[p.stderr.rfind("{"):]
    return json.loads(tail[:tail.rfind("}") + 1])


def main() -> None:
    import sys
    sys.path.insert(0, str(ROOT / "scripts"))
    import generate_music_candidates_v2 as gen

    voice, voice_sr = sf.read(PUBLIC / "narration.wav", dtype="float32", always_2d=True)
    if voice_sr != SR:
        raise RuntimeError(f"narration sample rate is {voice_sr}, expected {SR}")
    n = len(voice)
    # The generator uses these globals for its deterministic procedural bed.
    gen.N = n
    gen.T = np.arange(n, dtype=np.float64) / SR
    _, _, _, music = gen.ambience("wooden-pulse")
    music = gen.fade(music, 1.5, 2.5)
    peak = float(np.max(np.abs(music)))
    music *= min(1.0, 0.72 / max(peak, 1e-9))

    active = np.max(np.abs(voice), axis=1) > 0.012
    vr = float(np.sqrt(np.mean(voice[active] ** 2)))
    mr = float(np.sqrt(np.mean(music[active] ** 2)))
    # Keep the bed present but below speech, then gently duck it during speech.
    music *= vr / max(mr * 10.0, 1e-9)
    speech = (np.max(np.abs(voice), axis=1) > 0.015).astype(np.float32)
    duck = lfilter([0.035], [1, -0.965], speech)
    music *= np.clip(1.0 - 0.32 * duck, 0.48, 1.0)[:, None]

    music_path = OUT / "wooden-pulse.wav"
    premaster_path = OUT / "wooden-pulse-premaster.wav"
    sf.write(music_path, music.astype(np.float32), SR, subtype="PCM_24")
    sf.write(premaster_path, (voice + music).astype(np.float32), SR, subtype="PCM_24")
    first_pass = measured_loudnorm(premaster_path)
    norm_filter = "loudnorm=I=-16:TP=-1.5:LRA=9:linear=true:" + ":".join([
        f"measured_I={first_pass['input_i']}",
        f"measured_TP={first_pass['input_tp']}",
        f"measured_LRA={first_pass['input_lra']}",
        f"measured_thresh={first_pass['input_thresh']}",
        f"offset={first_pass['target_offset']}",
    ])
    subprocess.run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(premaster_path), "-af", norm_filter,
        "-ar", str(SR), "-c:a", "pcm_s24le", str(PUBLIC / "master.wav"),
    ], check=True)
    final_master = PUBLIC / "master.wav"

    # Carry forward all four isolated previews, replacing only the selected
    # production score fields and adding auditable hashes/measurements.
    candidates = json.loads(REPORT.read_text(encoding="utf-8"))["candidates"]
    manifest = {
        "selected": {
            "title": "木作回响",
            "style": "wooden-pulse",
            "tempoBpm": 104,
            "file": "music/candidates-v2/wooden-pulse.wav",
            "sha256": hashlib.sha256(music_path.read_bytes()).hexdigest(),
            "durationSeconds": round(n / SR, 6),
        },
        "alternatives": candidates,
        "musicReused": False,
        "singleBedMix": True,
        "musicTrackCount": 1,
        "narrationTrackCount": 1,
        "composer": "rainbow鱼 original procedural wooden-pulse score",
        "targetLufs": -16,
        "targetTruePeak": -1.5,
        "premasterMeasurement": first_pass,
        "finalMasterMeasurement": measured_loudnorm(final_master),
        "masterSha256": hashlib.sha256(final_master.read_bytes()).hexdigest(),
        "previousMasterSha256": hashlib.sha256((OUT / "previous-master.wav").read_bytes()).hexdigest(),
        "subjectiveListeningChecked": False,
    }
    MANIFEST.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "master": str(final_master),
        "masterSha256": manifest["masterSha256"],
        "music": str(music_path),
        "durationSeconds": manifest["selected"]["durationSeconds"],
        "premasterInputI": first_pass["input_i"],
        "premasterInputTP": first_pass["input_tp"],
        "finalOutputI": manifest["finalMasterMeasurement"]["output_i"],
        "finalOutputTP": manifest["finalMasterMeasurement"]["output_tp"],
    }, ensure_ascii=False))


if __name__ == "__main__":
    main()
