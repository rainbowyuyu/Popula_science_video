"""Auditable timing and integrity checks for the Nobel V3 narration master."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import correlate, correlation_lags, resample_poly

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "research/nobel2026/voice-processing-qa-v3.json"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64))))


def estimate_lag_ms(raw: np.ndarray, processed: np.ndarray, sr: int = 48000) -> float:
    ref = resample_poly(raw[: 5 * 24000], 2, 1)
    y = processed[:len(ref)]
    ref = ref - ref.mean()
    y = y - y.mean()
    corr = correlate(y, ref, mode="full", method="fft")
    lags = correlation_lags(len(y), len(ref), mode="full")
    valid = np.abs(lags) <= int(.08 * sr)
    return float(lags[valid][np.argmax(corr[valid])] / sr * 1000)


def main() -> None:
    from build_nobel2026_v3_timeline import NARRATION

    timeline = json.loads((ROOT / "src/nobel2026/timeline-v3.json").read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "public/nobel2026/audio-manifest-v3.json").read_text(encoding="utf-8"))
    generation = json.loads((ROOT / "research/nobel2026/voice-generation-v3.json").read_text(encoding="utf-8"))
    asr = json.loads((ROOT / "research/nobel2026/asr-alignment-v3.json").read_text(encoding="utf-8"))
    by_id = {row["id"]: row for row in asr["clips"]}
    by_manifest = {row["id"]: row for row in manifest["clips"]}
    master_path = ROOT / "public/nobel2026/master-v3-voice.wav"
    master, sr = sf.read(master_path, dtype="float32", always_2d=True)
    problems: list[str] = []
    if sr != 48000 or len(master) != round(timeline["duration"] * sr / timeline["fps"]):
        problems.append("master sample count or rate differs from the timeline")
    rows = []
    for clip in timeline["clips"]:
        rid = clip["id"]
        raw_path = ROOT / f"public/nobel2026/voice-v3-raw/{rid}.wav"
        processed_path = ROOT / f"public/nobel2026/voice-v3/{rid}.wav"
        raw, raw_sr = sf.read(raw_path, dtype="float32")
        proc, proc_sr = sf.read(processed_path, dtype="float32", always_2d=True)
        if raw_sr != 24000 or proc_sr != 48000 or proc.shape[1] != 2:
            problems.append(f"{rid}: unexpected channel count or sample rate")
            continue
        if clip["spoken"] != NARRATION[rid] or clip["subtitle"] != NARRATION[rid]:
            problems.append(f"{rid}: spoken/caption text differs from TTS source text")
        if generation[rid]["text"] != NARRATION[rid]:
            problems.append(f"{rid}: TTS generation text differs from current narration")
        if sha(raw_path) != generation[rid]["sha256"] or sha(raw_path) != by_id[rid]["sourceSha256"]:
            problems.append(f"{rid}: raw WAV differs from generation/ASR provenance")
        if sha(processed_path) != by_manifest[rid]["processedSha256"]:
            problems.append(f"{rid}: processed WAV differs from assembly manifest")
        if abs(len(proc) / proc_sr - len(raw) / raw_sr) > .0001:
            problems.append(f"{rid}: processed duration differs from raw duration")
        left_right_max = float(np.max(np.abs(proc[:, 0] - proc[:, 1])))
        if left_right_max > 1e-5:
            problems.append(f"{rid}: unexpected stereo difference")
        lag_ms = estimate_lag_ms(raw, proc[:, 0])
        if abs(lag_ms) > 1:
            problems.append(f"{rid}: processing latency is {lag_ms:.3f} ms")
        start_sample = round(clip["start"] * sr / timeline["fps"])
        end_sample = start_sample + len(proc)
        window_end = round(clip["end"] * sr / timeline["fps"])
        if end_sample > window_end or end_sample > len(master):
            problems.append(f"{rid}: narration runs beyond its clip window")
        elif np.max(np.abs(master[start_sample:end_sample] - proc)) > 1e-5:
            problems.append(f"{rid}: master segment differs from processed WAV")
        final25 = int(.025 * raw_sr)
        final25_proc = int(.025 * proc_sr)
        raw_tail = rms(raw[-final25:])
        proc_tail = rms(proc[-final25_proc:])
        # Only compare genuinely voiced tails. Silent source tails can have a
        # large ratio from tiny quantization/resampling differences.
        if raw_tail > .005 and not (.60 <= proc_tail / raw_tail <= 1.4):
            problems.append(f"{rid}: voiced tail changed unexpectedly")
        rows.append({
            "id": rid,
            "lagMs": round(lag_ms, 4),
            "rawSeconds": round(len(raw) / raw_sr, 6),
            "processedSeconds": round(len(proc) / proc_sr, 6),
            "rawTailRms25ms": round(raw_tail, 7),
            "processedTailRms25ms": round(proc_tail, 7),
            "voicedTail": raw_tail > .005,
            "processedPeak": round(float(np.max(np.abs(proc))), 6),
            "asrSimilarity": by_id[rid]["similarity"],
            "asrAlignmentComplete": by_id[rid]["alignmentComplete"],
            "captionPartCount": len(clip.get("subtitleParts", [])),
        })
    if sha(master_path) != json.loads((ROOT / "research/nobel2026/audio-cleaning-root-cause-v3.json").read_text(encoding="utf-8"))["master"]["sha256"]:
        problems.append("master hash differs from audio-cleaning evidence")
    report = {
        "version": "nobel2026-v3-voice-processing-qa",
        "scope": "Objective waveform, timing, hash, caption-source and ASR-record checks; no claim of human listening.",
        "status": "pass" if not problems else "fail",
        "master": str(master_path.relative_to(ROOT)),
        "masterSha256": sha(master_path),
        "durationSeconds": round(len(master) / sr, 6),
        "clipCount": len(rows),
        "maxAbsLagMs": round(max(abs(x["lagMs"]) for x in rows), 4),
        "maxProcessedPeak": max(x["processedPeak"] for x in rows),
        "voicedTailClips": [x["id"] for x in rows if x["voicedTail"]],
        "englishScientistNamesSpoken": any(name in text for text in NARRATION.values() for name in ("Karl", "Peter", "Georg", "Deisseroth", "Hegemann", "Nagel")),
        "potentialGanPolyphonicCharacterSpoken": any("干" in text for text in NARRATION.values()),
        "asrExactClipCount": sum(x["asrSimilarity"] == 1 for x in rows),
        "problems": problems,
        "clips": rows,
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("status", "durationSeconds", "clipCount", "maxAbsLagMs", "voicedTailClips", "asrExactClipCount", "problems")}, ensure_ascii=False, indent=2))
    if problems:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
