"""Mix the rainbow鱼 narration with a restrained, original ambient bed.

The voice remains the anchor.  A side-chain compressor ducks the bed whenever
speech is present, then a final loudness pass keeps the delivery consistent
without the pumping or hard gate that made earlier versions feel synthetic.
"""
from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[1])
    parser.add_argument("--voice", type=str, default="public/nobel2026/master-v2.wav")
    parser.add_argument("--bed", type=str, default="public/nobel2026/nobel-v2-bgm.wav")
    parser.add_argument("--out", type=str, default="public/nobel2026/master-v3.wav")
    args = parser.parse_args()
    root = args.root
    voice, bed, out = (root / x for x in (args.voice, args.bed, args.out))
    out.parent.mkdir(parents=True, exist_ok=True)
    if not voice.exists() or not bed.exists():
        raise FileNotFoundError(f"missing audio input: {voice} / {bed}")

    # The bed is intentionally quiet before ducking.  Side-chain compression
    # uses the voice itself as the detector and has a gentle release so pauses
    # breathe without abrupt musical pumping.
    filt = (
        # The clean harmonic bed is intentionally a little more present than
        # V2's hiss-like score.  0.55 keeps it below speech after ducking while
        # leaving a quiet musical floor under the 12-second reference coda.
        "[1:a]volume=0.55,highpass=f=70,lowpass=f=9500[bed];"
        "[bed][0:a]sidechaincompress=threshold=0.025:ratio=7:attack=22:release=360:makeup=1[ducked];"
        "[0:a][ducked]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mix];"
        "[mix]loudnorm=I=-18:LRA=5:TP=-1.5:dual_mono=true[out]"
    )
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(voice), "-i", str(bed),
         "-filter_complex", filt, "-map", "[out]", "-ar", "48000", "-ac", "2",
         "-c:a", "pcm_s24le", str(out)], check=True,
    )
    manifest = root / "research/nobel2026/audio-mix-v2.json"
    manifest.parent.mkdir(parents=True, exist_ok=True)
    manifest.write_text(json.dumps({
        "version": "v2-mix", "voice": str(voice.relative_to(root)),
        "bed": str(bed.relative_to(root)), "output": str(out.relative_to(root)),
        "voiceVolume": 1.0, "bedVolumeBeforeDucking": 0.55,
        "sidechain": {"threshold": 0.025, "ratio": 7, "attackMs": 22, "releaseMs": 360},
        "loudnorm": {"integratedLUFS": -18, "truePeakDb": -1.5, "lra": 5},
    }, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
