"""Compare narration processing chains without changing delivery assets."""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy.signal import correlate, correlation_lags, resample_poly

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "research/nobel2026/audio-latency-probe"
OUT.mkdir(parents=True, exist_ok=True)

FILTERS = {
    "current": "highpass=f=70,afftdn=nf=-50:nr=1.1:tn=1,acompressor=threshold=0.18:ratio=1.6:attack=16:release=120:makeup=1.03",
    "no_denoise": "highpass=f=70,acompressor=threshold=0.18:ratio=1.6:attack=16:release=120:makeup=1.03",
    "highpass_only": "highpass=f=70",
}


def rms(x: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(x, dtype=np.float64))))


def lag_ms(reference: np.ndarray, candidate: np.ndarray, sr: int) -> float:
    # Speech-only center excerpt avoids matching long silence at clip ends.
    n = min(len(reference), len(candidate), sr * 5)
    a, b = reference[:n], candidate[:n]
    a = a - np.mean(a)
    b = b - np.mean(b)
    max_lag = int(.08 * sr)
    corr = correlate(b, a, mode="full", method="fft")
    lags = correlation_lags(len(b), len(a), mode="full")
    sel = np.abs(lags) <= max_lag
    return float(lags[sel][np.argmax(corr[sel])] / sr * 1000)


def main() -> None:
    report: dict[str, object] = {"sampleRate": 48000, "filters": FILTERS, "clips": []}
    for rid in ("000", "008", "021"):
        src = ROOT / f"public/nobel2026/voice-v3-raw/{rid}.wav"
        raw, raw_sr = sf.read(src, dtype="float32")
        ref = resample_poly(raw, 2, 1)
        clip: dict[str, object] = {
            "id": rid,
            "sourceSeconds": len(raw) / raw_sr,
            "rawTailRms120ms": rms(raw[-int(.12 * raw_sr):]),
            "candidates": {},
        }
        for name, filt in FILTERS.items():
            dst = OUT / f"{rid}-{name}.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", str(src), "-af", filt,
                            "-ar", "48000", "-ac", "1", "-c:a", "pcm_s24le", str(dst)], check=True)
            y, sr = sf.read(dst, dtype="float32")
            lag = lag_ms(ref, y, sr)
            clip["candidates"][name] = {
                "seconds": len(y) / sr,
                "lagMs": lag,
                "tailRms120ms": rms(y[-int(.12 * sr):]),
                "tailRms25ms": rms(y[-int(.025 * sr):]),
                "peak": float(np.max(np.abs(y))),
                "speechRms": rms(y[int(.5 * sr):int(4.5 * sr)]),
            }
        report["clips"].append(clip)
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
