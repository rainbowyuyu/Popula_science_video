"""Assemble the unpadded V3 Nobel narration voice master.

Each V3 clip is used at its generated duration.  A short, explicit breath is
inserted between clips because it is represented in ``timeline-v3.json``.  No
``atrim`` or forced ``atempo`` is applied, so a final syllable cannot be cut
off and a fixed-window silence tail cannot be mistaken for missing speech.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf


def clean_clip(src: Path, dst: Path) -> None:
    """Preserve the TTS timing and timbre without a look-ahead denoiser.

    The old chain put a 12 kHz low-pass in front of the denoiser while the
    source was 24 kHz.  That cutoff sat on the Nyquist boundary; the filter
    became unstable after resampling and produced a loud, artificial tail on
    otherwise silent endings.  A second probe showed that ``afftdn`` itself
    delays the speech by ~25 ms while ffmpeg still writes only the original
    clip duration.  On clips with a spoken last 25 ms this loses the true
    ending.  The TTS source has a low noise floor, so skip ``afftdn`` and use
    only a 70 Hz rumble filter plus very gentle dynamics control.  No fade,
    trim, time stretch, or generated silence is applied inside the clip.
    """
    filt = (
        "highpass=f=70,"
        "acompressor=threshold=0.18:ratio=1.6:attack=16:release=120:makeup=1.03"
    )
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", filt,
         "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", str(dst)],
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    root = args.root
    timeline = json.loads((root / "src/nobel2026/timeline-v3.json").read_text(encoding="utf-8"))
    raw_dir = root / "public/nobel2026/voice-v3-raw"
    clean_dir = root / "public/nobel2026/voice-v3"
    clean_dir.mkdir(parents=True, exist_ok=True)
    sr = 48_000
    # Place every clip by the timeline's frame start.  Concatenating measured
    # WAVs accumulates fractional-frame rounding and slowly drifts subtitles.
    # ``seconds`` is rounded to three decimals in the JSON.  Use the exact
    # frame count so the master has precisely duration/fps samples.
    target = int(round(int(timeline["duration"]) * sr / timeline["fps"]))
    voice = np.zeros((target, 2), dtype=np.float32)
    manifest = []
    occupied: list[tuple[int, int, str]] = []
    for clip in timeline["clips"]:
        rid = clip["id"]
        src = raw_dir / f"{rid}.wav"
        dst = clean_dir / f"{rid}.wav"
        if not src.exists():
            raise FileNotFoundError(src)
        clean_clip(src, dst)
        arr, read_sr = sf.read(dst, dtype="float32", always_2d=True)
        if read_sr != sr:
            raise RuntimeError(f"unexpected sample rate in {dst}: {read_sr}")
        start_frame = int(clip["start"])
        start_sample = int(round(start_frame * sr / timeline["fps"]))
        end_sample = start_sample + len(arr)
        window_end_sample = int(round(int(clip["end"]) * sr / timeline["fps"]))
        if start_sample < 0 or end_sample > target:
            raise RuntimeError(f"clip {rid} exceeds timeline buffer: {start_sample}:{end_sample}/{target}")
        if end_sample > window_end_sample:
            raise RuntimeError(
                f"clip {rid} audio overruns its timeline window: {end_sample}>{window_end_sample}"
            )
        for prev_start, prev_end, prev_id in occupied:
            if start_sample < prev_end and end_sample > prev_start:
                raise RuntimeError(f"overlap between clips {prev_id} and {rid}")
        voice[start_sample:end_sample] = arr
        occupied.append((start_sample, end_sample, rid))
        raw_arr, raw_sr = sf.read(src, dtype="float32", always_2d=True)
        tail_n_raw = max(1, int(round(raw_sr * 0.12)))
        tail_n_proc = max(1, int(round(sr * 0.12)))
        manifest.append({
            "id": rid,
            "source": str(src.relative_to(root)),
            "processed": str(dst.relative_to(root)),
            "sourceSeconds": round(sf.info(src).duration, 4),
            "processedSeconds": round(len(arr) / sr, 4),
            "breathSecondsInTimeline": round(float(clip.get("breathSeconds", 0.0)), 4),
            "startFrame": start_frame,
            "startSample": start_sample,
            "endSampleExclusive": end_sample,
            "windowEndFrame": int(clip["end"]),
            "windowEndSampleExclusive": window_end_sample,
            "placementSeconds": round(start_sample / sr, 6),
            "rawTailRms120ms": round(float(np.sqrt(np.mean(raw_arr[-tail_n_raw:] ** 2))), 8),
            "processedTailRms120ms": round(float(np.sqrt(np.mean(arr[-tail_n_proc:] ** 2))), 8),
            "sourceSha256": hashlib.sha256(src.read_bytes()).hexdigest(),
            "processedSha256": hashlib.sha256(dst.read_bytes()).hexdigest(),
        })
    out = root / "public/nobel2026/master-v3-voice.wav"
    sf.write(out, voice, sr, subtype="PCM_24")
    manifest_path = root / "public/nobel2026/audio-manifest-v3.json"
    manifest_path.write_text(json.dumps({
        "version": "v3-real-voice-timing",
        "timeline": "src/nobel2026/timeline-v3.json",
        "durationSeconds": round(len(voice) / sr, 4),
        "sampleRate": sr,
        "channels": 2,
        "noForcedAtTempo": True,
        "noClipTrim": True,
        "filter": "highpass70 + gentle compressor; no afftdn/lowpass/afade/atrim/atempo",
        "placement": "sample=startFrame*48000/fps; overlap checked; end samples retained",
        "clips": manifest,
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    evidence = {
        "version": "audio-cleaning-root-cause-v3",
        "rootCause": "The former lowpass=f=12000 at the 24 kHz source Nyquist boundary produced an artificial elevated tail. Even after removing it, afftdn delayed speech ~25 ms and truncated the true final ~25 ms when output was constrained to original duration. Both filters are removed.",
        "oldFilter": "highpass70,lowpass12000,afftdn,equalizer,acompressor,afade",
        "intermediateFilter": "highpass70,afftdn,acompressor; measured ~25 ms latency",
        "newFilter": "highpass70,acompressor; no afftdn, lowpass, equalizer, afade, atrim, or atempo",
        "latencyProbe": "research/nobel2026/audio-latency-probe/report.json",
        "placement": "Each processed clip is written at startFrame*48000/fps into a zero buffer; overlap and window overrun checks are enforced.",
        "clips": manifest,
        "master": {
            "durationSeconds": round(len(voice) / sr, 6),
            "sampleCount": len(voice),
            "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
            "rms": float(np.sqrt(np.mean(voice * voice))),
            "peak": float(np.max(np.abs(voice))),
        },
    }
    evidence_path = root / "research/nobel2026/audio-cleaning-root-cause-v3.json"
    evidence_path.parent.mkdir(parents=True, exist_ok=True)
    evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    # A compact waveform artifact makes the tail diagnosis reviewable without
    # opening the full five-minute master. Plotting is optional for headless
    # rebuilds; the numeric evidence above is authoritative.
    try:
        import matplotlib.pyplot as plt
        fig, axes = plt.subplots(2, 2, figsize=(12, 6), sharex=False)
        for ax, rid in zip(axes.flat, ["000", "002", "006", "021"]):
            raw_path = raw_dir / f"{rid}.wav"
            clean_path = clean_dir / f"{rid}.wav"
            raw, raw_sr = sf.read(raw_path, dtype="float32", always_2d=True)
            clean, clean_sr = sf.read(clean_path, dtype="float32", always_2d=True)
            raw = raw.mean(axis=1); clean = clean.mean(axis=1)
            span = 0.5
            ax.plot(np.arange(len(raw))[-int(raw_sr * span):] / raw_sr - len(raw) / raw_sr, raw[-int(raw_sr * span):], lw=.65, label="raw")
            ax.plot(np.arange(len(clean))[-int(clean_sr * span):] / clean_sr - len(clean) / clean_sr, clean[-int(clean_sr * span):], lw=.65, label="processed")
            ax.set_title(f"clip {rid} · final 0.5 s"); ax.grid(alpha=.2)
        axes[0, 0].legend(loc="upper left", fontsize=8)
        fig.tight_layout()
        fig.savefig(root / "research/nobel2026/audio-cleaning-tail-evidence.png", dpi=150)
        plt.close(fig)
    except Exception as exc:
        evidence["waveformPlotWarning"] = str(exc)
        evidence_path.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(out)
    print(manifest_path)
    print(evidence_path)


if __name__ == "__main__":
    main()
