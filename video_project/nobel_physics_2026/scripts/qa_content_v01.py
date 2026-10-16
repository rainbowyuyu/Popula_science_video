"""Fast static QA for the 2026 Physics Award V01 content contract.

This check does not render video.  It catches timeline/subtitle drift and common
scientific overclaims before a Remotion render is started.
"""
from __future__ import annotations

import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TIMELINE = ROOT / "src/physics2026/timeline-v01.json"

FORBIDDEN = {
    "共同得主": "IceCube 合作组不是诺贝尔奖共同得主",
    "直接拍摄中微子": "探测的是相互作用产生的 Cherenkov 光",
    "已证明所有": "候选源/方向关联不能扩大为全部来源",
}


def ffprobe_seconds(path: Path) -> float | None:
    try:
        out = subprocess.check_output(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(path)], text=True,
        )
        return float(out.strip())
    except (OSError, subprocess.CalledProcessError, ValueError):
        return None


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []
    if not TIMELINE.exists():
        print("ERROR timeline missing:", TIMELINE)
        return 2
    data = json.loads(TIMELINE.read_text(encoding="utf-8"))
    fps = float(data.get("fps", 0))
    clips = data.get("clips", [])
    if fps <= 0 or not clips:
        errors.append("timeline fps/clips missing")

    previous_end = 0
    all_text = []
    for i, clip in enumerate(clips):
        cid = str(clip.get("id", i))
        start, end = int(clip.get("start", -1)), int(clip.get("end", -1))
        if start != previous_end:
            errors.append(f"clip {cid}: start {start} != previous end {previous_end}")
        if end <= start:
            errors.append(f"clip {cid}: non-positive frame interval")
        audio_seconds = float(clip.get("audioSeconds", 0))
        if (end - start) / fps + 1e-6 < audio_seconds:
            errors.append(f"clip {cid}: visual interval shorter than audio ({audio_seconds:.3f}s)")
        previous_end = end
        audio_path = ROOT / str(clip.get("audio", "")).replace("/", "\\")
        if not audio_path.exists():
            errors.append(f"clip {cid}: audio missing {audio_path}")
        elif ffprobe_seconds(audio_path) is None:
            warnings.append(f"clip {cid}: ffprobe could not read {audio_path.name}")

        parts = clip.get("subtitleParts") or []
        last = -1.0
        for part in parts:
            ps, pe = float(part.get("start", -1)), float(part.get("end", -1))
            if pe <= ps:
                errors.append(f"clip {cid}: invalid subtitle interval {ps}..{pe}")
            if ps < last - 1e-6:
                errors.append(f"clip {cid}: subtitle intervals overlap/out of order")
            if pe > audio_seconds + 0.15:
                warnings.append(f"clip {cid}: subtitle extends past audio by {pe-audio_seconds:.2f}s")
            if pe - ps > 5.5:
                warnings.append(f"clip {cid}: long subtitle {pe-ps:.2f}s; split into phrases")
            last = pe
            all_text.append(str(part.get("text", "")))

    text = "\n".join(all_text)
    for phrase, reason in FORBIDDEN.items():
        if phrase in text:
            errors.append(f"forbidden overclaim phrase {phrase!r}: {reason}")
    if re.search(r"一拍电子伏特", text):
        warnings.append("replace '一拍电子伏特' with exact 1.04/1.14 PeV wording")
    if "TXS 0506+056" in text and "候选" not in text and "关联" not in text:
        warnings.append("TXS 0506+056 should be labelled candidate/association")
    if "NGC 1068" in text and "候选" not in text and "关联" not in text:
        warnings.append("NGC 1068 should be labelled candidate/association")

    report = {
        "timeline": str(TIMELINE.relative_to(ROOT)),
        "clips": len(clips),
        "fps": fps,
        "durationFrames": data.get("duration"),
        "errors": errors,
        "warnings": warnings,
    }
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
