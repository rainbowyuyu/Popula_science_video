"""Promote the un-stretched ``测血压`` take into a frame-aligned V9 master.

The previous take used the homograph ``量``.  The new Rainbow Qwen take is
6.8 s at its natural speed.  We give it the existing 0.2 s tail buffer and
move the following measurement clips by 12 frames.  No speech is time
compressed; the final 0.4 s is carried by the camera/timeline extension.
"""
from __future__ import annotations

import hashlib
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[2]
PUB = ROOT / "public/hypertension"
SRC_TL = ROOT / "src/hypertension/timeline.json"
PUB_TL = PUB / "timeline.json"
REPORT = ROOT / "research/hypertension"
SR = 48_000
FPS = 30
SHIFT = 12
OLD_TAIL_FRAME = 8755  # h048 start in V8
OLD_DURATION = 9671
NEW_DURATION = OLD_DURATION + SHIFT
FFMPEG = "C:/ffmpeg/bin/ffmpeg.exe"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def run(args: list[str]) -> None:
    subprocess.run([FFMPEG, "-hide_banner", "-nostats", "-v", "error", "-y", *map(str, args)], check=True)


def loudnorm(src: Path, dst: Path) -> dict:
    probe = subprocess.run(
        [FFMPEG, "-hide_banner", "-nostats", "-i", str(src), "-af",
         "loudnorm=I=-15.8:TP=-1.7:LRA=9:print_format=json", "-f", "null", "NUL"],
        capture_output=True, text=True, encoding="utf8", check=True)
    blocks = re.findall(r'\{\s*"input_i"[\s\S]*?\}', probe.stderr)
    if not blocks:
        raise RuntimeError("loudnorm measurement missing")
    met = json.loads(blocks[-1])
    filt = "loudnorm=I=-15.8:TP=-1.7:LRA=9:linear=true:" + ":".join(
        f"{key}={met[src_key]}" for key, src_key in [
            ("measured_I", "input_i"), ("measured_TP", "input_tp"),
            ("measured_LRA", "input_lra"), ("measured_thresh", "input_thresh"),
            ("offset", "target_offset")])
    run(["-i", src, "-af", filt, "-ar", SR, "-ac", 2, "-c:a", "pcm_s24le", dst])
    return met


def timeline_v9() -> dict:
    d = json.loads(SRC_TL.read_text(encoding="utf8"))
    if d["duration"] != OLD_DURATION:
        raise RuntimeError(f"Unexpected timeline duration {d['duration']}")
    for clip in d["clips"]:
        if clip["id"] == "h047":
            clip.update({
                "text": "测血压前，先安静坐五分钟。背靠椅背，双脚平放，手臂与心脏同高。",
                "spoken": "测血压前，先安静坐五分钟。背靠椅背，双脚平放，手臂与心脏同高。",
                "end": clip["end"] + SHIFT, "duration": clip["duration"] + SHIFT,
                "audioSeconds": 7.0, "rawSeconds": 6.8})
        elif clip["start"] >= OLD_TAIL_FRAME:
            clip["start"] += SHIFT
            clip["end"] += SHIFT
    for cap in d["captions"]:
        if cap["clip"] == "h047":
            if cap["start"] == 8564:
                cap["text"] = "测血压前，先安静坐五分钟。背靠椅背"
            elif cap["start"] == 8665:
                cap["text"] = "双脚平放，手臂与心脏同高"
                cap["end"] += SHIFT
        elif cap["start"] >= OLD_TAIL_FRAME:
            cap["start"] += SHIFT
            cap["end"] += SHIFT
    for scene in d["scenes"]:
        if scene["start"] >= OLD_TAIL_FRAME:
            scene["start"] += SHIFT
            scene["end"] += SHIFT
        elif scene["end"] >= OLD_TAIL_FRAME:
            scene["end"] += SHIFT
    d["duration"] = NEW_DURATION
    # Keep audio duration and the source timeline self-describing.
    d["audioTimingPolicy"] = "Full mastered WAV durations drive camera time; h047 natural 6.8 s take uses a 0.2 s tail buffer; no time stretching."
    return d


def update_subtitles() -> None:
    """Shift SRT rows after h047 and replace its two lines."""
    src = PUB / "subtitles.srt"
    text = src.read_text(encoding="utf8")
    blocks = re.split(r"\n\s*\n", text.strip())

    def to_frames(ts: str) -> int:
        h, m, s, ms = map(int, re.split(r"[:,]", ts))
        return h * 108000 + m * 1800 + s * 30 + round(ms * 30 / 1000)

    def from_frames(f: int) -> str:
        ms = round((f % 30) * 1000 / 30); total = f // 30
        ss = total % 60; total //= 60; mm = total % 60; hh = total // 60
        return f"{hh:02d}:{mm:02d}:{ss:02d},{ms:03d}"

    out = []
    for block in blocks:
        lines = block.splitlines()
        if len(lines) < 3 or " --> " not in lines[1]:
            continue
        a, b = lines[1].split(" --> ")
        af, bf = to_frames(a), to_frames(b)
        if af >= OLD_TAIL_FRAME:
            af += SHIFT; bf += SHIFT
        elif af == 8564:
            lines[2] = "测血压前，先安静坐五分钟。背靠椅背"
        elif af == 8665:
            lines[2] = "双脚平放，手臂与心脏同高"; bf += SHIFT
        lines[1] = f"{from_frames(af)} --> {from_frames(bf)}"
        out.append("\n".join(lines))
    src.write_text("\n\n".join(out) + "\n", encoding="utf8")


def build_audio(d: dict) -> dict:
    old_narr, sr = sf.read(PUB / "narration.wav", dtype="float32", always_2d=True)
    old_music, msr = sf.read(PUB / "music.wav", dtype="float32", always_2d=True)
    if sr != msr or sr != SR or len(old_narr) != OLD_DURATION * SR // FPS:
        raise RuntimeError("Unexpected canonical audio dimensions")
    old_h047 = PUB / "voice-raw-history/h047-v8-ce-shu-xue-ya.wav"
    if sha(old_h047) != "18d65fe8ee9a0a634e0f2a1ad4c920c79a72aa941e08c2f5f52a6fa2b8ce713c":
        raise RuntimeError("Unexpected h047 raw take")
    tts = Path("D:/python_project/tts")
    import sys
    sys.path.insert(0, str(tts))
    from broadcast_voice import master_voice
    with tempfile.TemporaryDirectory(prefix="hypertension-v9-voice-") as td:
        mastered = Path(td) / "h047.wav"
        meta = master_voice(old_h047, mastered)
        take, take_sr = sf.read(mastered, dtype="float32", always_2d=True)
    if take_sr != SR or len(take) > round(6.8 * SR) + 32:
        raise RuntimeError("Unexpected mastered h047 length")
    # Keep the per-line Rainbow voice source in sync with the promoted take;
    # the old source is snapshotted by main() before this write.
    sf.write(PUB / "voice/h047.wav", take, SR, subtype="PCM_24")
    old_start = round(8554 * SR / FPS); old_tail = round(OLD_TAIL_FRAME * SR / FPS)
    target = round(NEW_DURATION * SR / FPS); h047_target = round(7.0 * SR)
    new_narr = np.zeros((target, 2), np.float32)
    new_narr[:old_start] = old_narr[:old_start]
    take_stereo = np.repeat(take, 2, axis=1) if take.shape[1] == 1 else take
    h047_start = round(8554 * SR / FPS)
    new_narr[h047_start:h047_start + len(take_stereo)] = take_stereo
    # The rest of the take slot is intentional breathing room before h048.
    new_narr[old_tail + SHIFT * SR // FPS:] = old_narr[old_tail:]
    new_music = np.zeros((target, 2), np.float32)
    new_music[:len(old_music)] = old_music
    with tempfile.TemporaryDirectory(prefix="hypertension-v9-mix-") as td:
        td = Path(td); narr_tmp = td / "narration.wav"; pre = td / "premaster.wav"
        sf.write(narr_tmp, new_narr, SR, subtype="PCM_24")
        sf.write(PUB / "narration.wav", new_narr, SR, subtype="PCM_24")
        sf.write(PUB / "music.wav", new_music, SR, subtype="PCM_24")
        sf.write(pre, new_narr + new_music, SR, subtype="FLOAT")
        metrics = loudnorm(pre, PUB / "master.wav")
    report = {
        "status": "passed", "version": "v9", "timelineShiftFrames": SHIFT,
        "replacementText": "测血压前，先安静坐五分钟。背靠椅背，双脚平放，手臂与心脏同高。",
        "rawTake": str(old_h047), "rawTakeSha256": sha(old_h047), "rawSeconds": 6.8,
        "naturalSpeed": True, "timeStretch": False, "tailBufferSeconds": .2,
        "narrationFrames": target, "masterFrames": target, "masterSeconds": target / SR,
        "masterSha256": sha(PUB / "master.wav"), "musicSha256": sha(PUB / "music.wav"),
        "loudnormInput": metrics, "canonicalNarrationSha256": sha(PUB / "narration.wav"),
        "audioTimingPolicy": "h047 uses the natural 6.8 s Rainbow Qwen take plus a 0.2 s tail buffer; later clips move +12 frames.",
    }
    (REPORT / "audio-v9-measurement-revision.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
    return report


def main() -> None:
    # Keep recoverable snapshots of the three mutable delivery inputs.
    history = PUB / "voice-raw-history/v9-before-promote"
    history.mkdir(parents=True, exist_ok=True)
    for name in ["narration.wav", "music.wav", "master.wav", "timeline.json", "subtitles.srt", "voice/h047.wav"]:
        src = PUB / name
        dst = history / name
        dst.parent.mkdir(parents=True, exist_ok=True)
        if not dst.exists(): shutil.copy2(src, dst)
    d = timeline_v9()
    for path in [SRC_TL, PUB_TL]:
        path.write_text(json.dumps(d, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    update_subtitles()
    report = build_audio(d)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
