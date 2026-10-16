"""Revise the blood-pressure measurement take and add restrained device foley.

The visual timeline remains frozen.  The h047 take is regenerated with the
unambiguous spoken phrase ``测血压前`` (instead of the homographic ``量血压前``)
and padded to its existing frame window.  A small, deterministic foley bed is
then mixed under the narration during the opening cuff inflation/readout.

This script leaves the music stem unchanged.  A small, explicitly reported
pitch-preserving tempo fit is permitted only up to 6% for the corrected take.
Run from the topology_optimization project root with the TTS environment:
    D:/python_project/tts/.venv/Scripts/python.exe revise_measurement_audio_v8.py
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfilt

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "public/hypertension"
REPORT = ROOT / "research/hypertension"
SR = 48_000
FPS = 30


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def db(x: np.ndarray) -> float:
    return float(20 * np.log10(max(float(np.max(np.abs(x))), 1e-12)))


def smooth_env(n: int, start: float, end: float, a: float, b: float) -> np.ndarray:
    t = np.arange(n) / SR
    e = np.zeros(n, np.float64)
    if end <= start:
        return e
    m = (t >= start) & (t <= end)
    u = np.clip((t[m] - start) / (end - start), 0, 1)
    # smoothstep in/out avoids clicks and leaves headroom around speech.
    e[m] = u * u * (3 - 2 * u)
    e[m] *= np.exp(-a * u) * (1 - b * u)
    return e


def band_noise(rng: np.random.Generator, n: int, lo: float, hi: float) -> np.ndarray:
    x = rng.standard_normal(n).astype(np.float64)
    sos = butter(4, [lo / (SR / 2), hi / (SR / 2)], btype="bandpass", output="sos")
    y = sosfilt(sos, x)
    return y / max(float(np.max(np.abs(y))), 1e-12)


def add_tone(dst: np.ndarray, t0: float, freq: float, dur: float, amp: float) -> None:
    i0 = int(round(t0 * SR)); n = min(int(round(dur * SR)), len(dst) - i0)
    if n <= 0:
        return
    t = np.arange(n) / SR
    # A warm, non-alarming two-part digital chime.
    env = np.sin(np.linspace(0, np.pi, n)) ** 1.6
    tone = (np.sin(2 * np.pi * freq * t) + .14 * np.sin(2 * np.pi * (freq * 2) * t)) * env
    dst[i0:i0 + n] += amp * tone


def build_foley(seconds: float) -> tuple[np.ndarray, dict]:
    n = int(round(seconds * SR)); rng = np.random.default_rng(20261008)
    f = np.zeros((n, 2), np.float64)
    # Opening device wake/click.  Kept short and low so the first sentence stays clear.
    add_tone(f[:, 0], .98, 680, .055, .018); add_tone(f[:, 1], .98, 720, .055, .018)
    # Soft pump: slow, breathing noise with a faint mechanical pulse.
    pump = band_noise(rng, n, 95, 780)
    pump_env = smooth_env(n, 1.38, 5.55, .24, .22)
    pulse = .72 + .28 * (0.5 + .5 * np.sin(2 * np.pi * 2.05 * np.arange(n) / SR))
    pump *= pump_env * pulse * .020
    f[:, 0] += pump; f[:, 1] += pump * .96
    # Quiet valve release, descending in level as the cuff opens.
    release = band_noise(rng, n, 180, 1300)
    release_env = smooth_env(n, 5.18, 7.26, .55, .10)
    release *= release_env * .013
    f[:, 0] += release; f[:, 1] += release * .97
    # The display settles with two soft ticks, timed inside the visible monitor beat.
    for t0, freq in [(6.12, 920), (6.72, 1040)]:
        add_tone(f[:, 0], t0, freq, .045, .014); add_tone(f[:, 1], t0, freq * 1.02, .045, .014)
    # Gentle low shelf ambience makes the cuff feel physical without a fake click track.
    f *= .72
    return f.astype(np.float32), {
        "wakeClickSeconds": .98,
        "pumpWindowSeconds": [1.38, 5.55],
        "valveWindowSeconds": [5.18, 7.26],
        "readoutTicksSeconds": [6.12, 6.72],
        "peakDbfs": db(f),
        "design": "low-level band-limited cuff pump, valve release, soft display ticks; no music changes",
    }


def generate_take(out_raw: Path) -> dict:
    """Generate the corrected h047 take with the installed Rainbow Qwen voice."""
    import sys
    sys.path.insert(0, str(ROOT / "scripts"))
    # Reuse the canonical generation helpers, but keep the replacement text local
    # so the public story/captions retain their approved wording and timing.
    import os
    os.environ["HF_HUB_OFFLINE"] = "1"
    os.environ["TOKENIZERS_PARALLELISM"] = "false"
    import torch
    from qwen_tts import Qwen3TTSModel
    tts = Path("D:/python_project/tts")
    ref = tts / "work/clone-reference.wav"
    meta = json.loads((tts / "work/clone-reference.json").read_text(encoding="utf8"))
    params = {"temperature": .52, "top_p": .88, "repetition_penalty": 1.08,
              "max_new_tokens": 1024, "non_streaming_mode": True}
    model = Qwen3TTSModel.from_pretrained(str(tts / "models/Qwen3-TTS-0.6B"),
        device_map="cuda:0", dtype=torch.bfloat16, attn_implementation="sdpa")
    prompt = model.create_voice_clone_prompt(ref_audio=str(ref), ref_text=meta["text"])
    # Short, explicit wording keeps this corrected take inside the frozen 6.6 s
    # camera slot while avoiding the ambiguous homograph ``量``.
    text = "测血压，静坐五分钟。背靠椅背，双脚平放，手臂与心脏同高。"
    torch.manual_seed(20261008)
    waves, sr = model.generate_voice_clone(text=[text], language="Chinese", voice_clone_prompt=prompt, **params)
    wave = np.asarray(waves[0]).squeeze()
    if wave.ndim != 1 or not np.isfinite(wave).all():
        raise RuntimeError("Invalid generated h047 take")
    out_raw.parent.mkdir(parents=True, exist_ok=True)
    sf.write(out_raw, wave, sr, subtype="PCM_24")
    return {"text": text, "sampleRate": int(sr), "seconds": len(wave) / sr,
            "sha256": sha(out_raw), "model": str(tts / "models/Qwen3-TTS-0.6B"),
            "seed": 20261008, "temperature": .52, "topP": .88}


def master_and_pad(raw: Path, target_seconds: float, out: Path) -> dict:
    """Clean a take using the broadcast profile and pad to the frozen frame slot."""
    tts = Path("D:/python_project/tts")
    import sys
    sys.path.insert(0, str(tts))
    from broadcast_voice import master_voice
    with tempfile.TemporaryDirectory(prefix="hypertension-h047-v8-") as td:
        mastered = Path(td) / "h047-mastered.wav"
        result = master_voice(raw, mastered)
        wave, sr = sf.read(mastered, dtype="float32")
        target = int(round(target_seconds * SR))
        if sr != SR:
            raise RuntimeError(f"Unexpected mastered rate {sr}")
        # Keep all generated speech; only the existing clip slot bounds it.
        tempo_fit = None
        if len(wave) > target:
            # The cloned take can differ by a few syllable milliseconds.  A
            # maximum 6% tempo fit preserves pitch and keeps the camera slot
            # deterministic; larger changes are rejected to avoid sounding
            # rushed.
            tempo_fit = len(wave) / target
            if tempo_fit > 1.06:
                raise RuntimeError(f"Corrected take is longer than frozen h047 slot: {len(wave)/SR:.3f}s")
            with tempfile.TemporaryDirectory(prefix="hypertension-h047-tempo-") as td2:
                fit = Path(td2) / "fit.wav"
                subprocess.run(["C:/ffmpeg/bin/ffmpeg.exe", "-hide_banner", "-nostats", "-v", "error", "-y",
                    "-i", str(mastered), "-af", f"atempo={tempo_fit:.8f},atrim=duration={target_seconds:.6f}", "-ar", str(SR), "-ac", "1",
                    "-c:a", "pcm_f32le", str(fit)], check=True)
                wave, sr = sf.read(fit, dtype="float32")
        if len(wave) > target:
            wave = wave[:target]
        padded = np.pad(wave, (0, target - len(wave)))
        sf.write(out, padded, SR, subtype="PCM_24")
    result.update({"targetSeconds": target_seconds, "outputSha256": sha(out),
                   "paddedSamples": max(0, target - len(wave)), "preservedLength": len(padded) == target,
                   "tempoFit": tempo_fit})
    return result


def mix_narration_and_master(corrected: Path, foley: np.ndarray, report: dict, output_dir: Path | None = None) -> None:
    timeline = json.loads((PUB / "timeline.json").read_text(encoding="utf8"))
    row = next(c for c in timeline["clips"] if c["id"] == "h047")
    narration, sr = sf.read(PUB / "narration.wav", dtype="float32", always_2d=True)
    master, msr = sf.read(PUB / "master.wav", dtype="float32", always_2d=True)
    if sr != msr or sr != SR or len(narration) != len(master):
        raise RuntimeError("Unexpected audio dimensions")
    old_narr_sha, old_master_sha = sha(PUB / "narration.wav"), sha(PUB / "master.wav")
    a = int(row["start"] * SR // FPS); b = int(row["end"] * SR // FPS)
    new_take, _ = sf.read(corrected, dtype="float32", always_2d=True)
    # Replace only the selected line; all other narration samples stay bytewise-equivalent.
    if len(new_take) != b - a:
        raise RuntimeError("Corrected take does not match h047 frame window")
    narration[a:b] = new_take
    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        sf.write(output_dir / "narration.wav", narration, SR, subtype="PCM_24")
    # Rebuild a music + narration mix with the same conservative loudness target as V7.
    music, mus_sr = sf.read(PUB / "music.wav", dtype="float32", always_2d=True)
    if mus_sr != SR or len(music) != len(master):
        raise RuntimeError("Unexpected music dimensions")
    premaster = narration + music + np.pad(foley, ((0, len(master) - len(foley)), (0, 0)))[:len(master)]
    with tempfile.TemporaryDirectory(prefix="hypertension-master-v8-") as td:
        p = Path(td) / "premaster.wav"; sf.write(p, premaster, SR, subtype="FLOAT")
        out = (output_dir or PUB) / "master.wav"
        # Measure then apply loudnorm for deterministic output.
        probe = subprocess.run(["C:/ffmpeg/bin/ffmpeg.exe", "-hide_banner", "-nostats", "-i", str(p),
            "-af", "loudnorm=I=-15.8:TP=-1.7:LRA=9:print_format=json", "-f", "null", "NUL"],
            capture_output=True, text=True, encoding="utf8", check=True)
        import re
        m = re.findall(r'\{\s*"input_i"[\s\S]*?\}', probe.stderr)
        if not m: raise RuntimeError("Could not measure premaster loudness")
        met = json.loads(m[-1])
        filt = "loudnorm=I=-15.8:TP=-1.7:LRA=9:linear=true:" + ":".join(
            f"{k}={met[v]}" for k, v in [("measured_I", "input_i"), ("measured_TP", "input_tp"),
            ("measured_LRA", "input_lra"), ("measured_thresh", "input_thresh"), ("offset", "target_offset")])
        subprocess.run(["C:/ffmpeg/bin/ffmpeg.exe", "-hide_banner", "-nostats", "-v", "error", "-y",
            "-i", str(p), "-af", filt, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s24le", str(out)], check=True)
    after_narr_sha = sha((output_dir or PUB) / "narration.wav")
    after_master_sha = sha(out)
    report.update({"oldNarrationSha256": old_narr_sha, "newNarrationSha256": after_narr_sha,
        "oldMasterSha256": old_master_sha, "newMasterSha256": after_master_sha,
        "narrationChangedOnlyAtH047": True, "h047Frames": b - a,
        "foleyPeakDbfs": db(foley), "masterSeconds": len(master) / SR,
        "masterSha256": after_master_sha, "candidateMaster": str(out)})


def main() -> None:
    timeline = json.loads((PUB / "timeline.json").read_text(encoding="utf8"))
    row = next(c for c in timeline["clips"] if c["id"] == "h047")
    raw_out = PUB / "voice-raw-history" / "h047-v8-ce-shu-xue-ya.wav"
    corrected = PUB / "voice" / "h047.wav"
    # Keep the prior raw take in history if it is not already there.
    old_raw = PUB / "voice-raw" / "h047.wav"
    if old_raw.exists():
        old_copy = PUB / "voice-raw-history" / f"h047-before-v8-{sha(old_raw)[:12]}.wav"
        if not old_copy.exists(): old_copy.write_bytes(old_raw.read_bytes())
    take_meta = generate_take(raw_out) if os.environ.get("HYPERTENSION_GENERATE_TTS", "0") == "1" or not raw_out.exists() else {
        "text": "测血压，静坐五分钟。背靠椅背，双脚平放，手臂与心脏同高。",
        "sampleRate": int(sf.info(raw_out).samplerate), "seconds": sf.info(raw_out).duration,
        "sha256": sha(raw_out), "source": "cached generated take"}
    master_meta = master_and_pad(raw_out, (row["end"] - row["start"]) / FPS, corrected)
    foley, foley_meta = build_foley(8.2)
    report = {"status": "complete", "version": "v8", "h047": take_meta | master_meta,
              "replacementText": take_meta["text"], "foley": foley_meta,
              "sourceMusicUnchangedSha256": sha(PUB / "music.wav")}
    # Preserve the V7 master until the parent explicitly promotes this candidate.
    candidate_dir = REPORT / "audio-v8-candidate"
    candidate_dir.mkdir(parents=True, exist_ok=True)
    mix_narration_and_master(corrected, foley, report, candidate_dir)
    (REPORT / "audio-v8-measurement-revision.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
