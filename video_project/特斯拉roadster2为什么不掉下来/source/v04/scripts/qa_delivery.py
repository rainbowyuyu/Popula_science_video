"""Validate the actual encoded Roadster master. No model/API calls.

Checks metadata, decoded frames, black frames, silence, AAC loudness/true peak,
and subtitle coverage. These objective checks cannot replace visual/listening QA.
Exit 0=automatic checks passed, 1=failed, 2=missing input/tool or execution error.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[1]
DEFAULT_VIDEO = PROJECT / "output/v04/Roadster_倒挂与飞行翻滚_1080p.mp4"
EXPECTED_FRAMES, FPS, SR = 10081, 30, 48000


def run_log(command: list[str], log: Path, timeout: int = 1800):
    with log.open("w", encoding="utf8", newline="\n") as out:
        try:
            result = subprocess.run(command, stdout=out, stderr=subprocess.STDOUT,
                                    timeout=timeout, check=False)
            return result.returncode, log.read_text(encoding="utf8", errors="replace")
        except subprocess.TimeoutExpired:
            out.write("\nQA subprocess timed out.\n")
            return 124, "QA subprocess timed out."


def probe(path: Path, log: Path, count_frames=False):
    cmd = ["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json"]
    if count_frames:
        cmd += ["-count_frames"]
    code, text = run_log(cmd + [str(path)], log)
    if code:
        raise RuntimeError(f"ffprobe failed ({code}), see {log.name}")
    return json.loads(text)


def seconds(value, default=0.0):
    try:
        return float(value)
    except (ValueError, TypeError):
        return default


def silences(text: str, duration: float):
    spans, start = [], None
    pattern = r"silence_(start|end):\s*([-+\d.e]+)(?:\s*\|\s*silence_duration:\s*([-+\d.e]+))?"
    for m in re.finditer(pattern, text):
        if m[1] == "start":
            start = float(m[2])
        else:
            end = float(m[2])
            begin = start if start is not None else max(0, end - float(m[3] or 0))
            spans.append({"start": begin, "end": end, "duration": end - begin})
            start = None
    if start is not None:
        spans.append({"start": start, "end": duration, "duration": max(0, duration - start)})
    return spans


def intersection(a, b):
    return max(0.0, min(a[1], b[1]) - max(a[0], b[0]))


def union_length(intervals):
    total, end = 0.0, float("-inf")
    for a, b in sorted(intervals):
        if b > end:
            total += b - max(a, end)
            end = b
    return total


def sha256(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, default=DEFAULT_VIDEO)
    parser.add_argument("--report", type=Path, default=ROOT / "work/qa/final-video.json")
    parser.add_argument("--timeout", type=int, default=1800, help="Per ffmpeg/ffprobe timeout in seconds")
    args = parser.parse_args()
    args.report.parent.mkdir(parents=True, exist_ok=True)
    logs = args.report.parent
    report = {"generatedAt": datetime.now(timezone.utc).isoformat(), "video": str(args.video),
              "expected": {"width": 1920, "height": 1080, "fps": FPS, "frames": EXPECTED_FRAMES,
                           "sampleRate": SR, "channels": 2}, "checks": [], "warnings": [],
              "limitations": ["Automatic checks cannot replace listening for pronunciation, edits, music transitions or narration clarity.",
                              "Black-frame detection does not prove composition, unobscured labels, anatomical/physical accuracy or smooth camera motion.",
                              "Subtitle time coverage does not verify every spoken word or semantic alignment."],
              "subjectiveListeningChecked": False, "completeVisualReviewChecked": False}

    def check(name, passed, detail=None):
        report["checks"].append({"name": name, "passed": bool(passed), "detail": detail})

    def finish(exit_code=None):
        passed = all(c["passed"] for c in report["checks"]) and not report.get("executionError")
        report["automaticChecksPassed"] = passed
        report["overallStatus"] = "automatic-checks-passed-manual-review-required" if passed else "failed"
        if exit_code == 2:
            report["overallStatus"] = "not-completed"
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf8")
        failed = [c["name"] for c in report["checks"] if not c["passed"]]
        print(json.dumps({"status": report["overallStatus"], "checks": len(report["checks"]),
                          "failed": failed, "warnings": len(report["warnings"]),
                          "report": str(args.report)}, ensure_ascii=False))
        return exit_code if exit_code is not None else (0 if passed else 1)

    try:
        for tool in ("ffmpeg", "ffprobe"):
            if not shutil.which(tool):
                raise FileNotFoundError(f"Required tool unavailable: {tool}")
        if not args.video.is_file():
            raise FileNotFoundError(f"Final video does not exist yet: {args.video}")
        narration = json.loads((ROOT / "src/narration.json").read_text(encoding="utf8"))
        caption_data = json.loads((ROOT / "src/captions-data.json").read_text(encoding="utf8"))
        captions = caption_data["cues"]
        duration = EXPECTED_FRAMES / FPS
        metadata = probe(args.video, logs / "ffprobe-video.json", count_frames=True)
        video = next((s for s in metadata["streams"] if s["codec_type"] == "video"), {})
        audio = next((s for s in metadata["streams"] if s["codec_type"] == "audio"), {})
        report["media"] = {"video": video, "audio": audio, "format": metadata.get("format", {})}
        check("dimensions", (video.get("width"), video.get("height")) == (1920, 1080))
        check("frame-rate", Fraction(video.get("avg_frame_rate", "0/1")) == FPS,
              video.get("avg_frame_rate"))
        frame_count = int(video.get("nb_read_frames", video.get("nb_frames", -1)))
        check("decoded-frame-count", frame_count == EXPECTED_FRAMES, frame_count)
        check("timeline-frame-count", narration.get("durationFrames") == EXPECTED_FRAMES)
        check("timeline-caption-fps", narration.get("fps") == caption_data.get("fps") == FPS)
        video_duration = seconds(video.get("duration"), seconds(metadata.get("format", {}).get("duration")))
        check("video-narration-duration", abs(video_duration - narration["durationSec"]) <= 1 / FPS + 1e-6,
              {"videoSec": video_duration, "timelineSec": narration["durationSec"]})
        check("audio-format", audio.get("codec_name") == "aac" and int(audio.get("sample_rate", 0)) == SR and audio.get("channels") == 2,
              {"codec": audio.get("codec_name"), "sampleRate": audio.get("sample_rate"), "channels": audio.get("channels")})
        check("audio-video-duration", abs(seconds(audio.get("duration")) - video_duration) <= 1 / FPS + 1e-6,
              {"audioSec": audio.get("duration"), "videoSec": video_duration})
        for filename in ("narration.wav", "master.wav"):
            wav_info = probe(ROOT / "public/audio" / filename, logs / f"ffprobe-{filename}.json")
            wav_stream = wav_info["streams"][0]
            wav_duration = seconds(wav_stream.get("duration"), seconds(wav_info["format"].get("duration")))
            check(f"{filename}-duration", abs(wav_duration - video_duration) <= 1 / FPS + 1e-6, wav_duration)

        # Full decoded AAC+video scan. ebur128 peak=true oversamples for true peak.
        command = ["ffmpeg", "-hide_banner", "-nostats", "-xerror", "-err_detect", "explode",
                   "-i", str(args.video), "-map", "0:v:0", "-map", "0:a:0",
                   "-vf", "blackdetect=d=0.15:pix_th=0.10:pic_th=0.98",
                   "-af", "silencedetect=noise=-50dB:d=1.2,ebur128=peak=true", "-f", "null", "-"]
        code, decoded = run_log(command, logs / "decode-black-silence-loudness.log", args.timeout)
        check("full-decode", code == 0, {"exitCode": code, "log": "decode-black-silence-loudness.log"})
        black = [{"start": float(a), "end": float(b), "duration": float(d)} for a, b, d in
                 re.findall(r"black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)", decoded)]
        report["blackIntervals"] = black
        check("no-black-intervals", not black, black)
        summary = decoded.rsplit("Summary:", 1)[-1]
        integrated = re.search(r"Integrated loudness:\s*I:\s*(-?[\d.]+)\s*LUFS", summary)
        true_peak = re.search(r"True peak:\s*Peak:\s*(-?[\d.]+)\s*dBFS", summary)
        lra = re.search(r"Loudness range:\s*LRA:\s*([\d.]+)\s*LU", summary)
        loudness = {"integratedLUFS": float(integrated[1]) if integrated else None,
                    "truePeakDBTP": float(true_peak[1]) if true_peak else None,
                    "loudnessRangeLU": float(lra[1]) if lra else None,
                    "method": "FFmpeg ebur128 peak=true over final encoded AAC"}
        report["aacLoudness"] = loudness
        check("aac-integrated-loudness", integrated is not None and -18 <= float(integrated[1]) <= -14, loudness)
        check("aac-true-peak", true_peak is not None and float(true_peak[1]) <= -1.0, loudness)

        code, voice_log = run_log(["ffmpeg", "-hide_banner", "-nostats", "-i", str(ROOT / "public/audio/narration.wav"),
                                  "-af", "silencedetect=noise=-50dB:d=1.2", "-f", "null", "-"], logs / "source-narration-silence.log", args.timeout)
        check("narration-source-scan", code == 0)
        source_silences = silences(voice_log, duration)
        final_silences = silences(decoded, duration)
        cues = narration["cues"]
        cue_spans = [(c["startFrame"] / FPS, c["endFrame"] / FPS) for c in cues]
        unexpected = []
        for silence in final_silences:
            a, b = silence["start"], silence["end"]
            speech_overlap = sum(intersection((a, b), x) for x in cue_spans)
            expected_source = union_length([(max(a, x["start"]), min(b, x["end"])) for x in source_silences if intersection((a, b), (x["start"], x["end"])) > 0])
            missing_voice = max(0, speech_overlap - expected_source)
            if a >= narration["coda"]["startSec"]:
                silence["classification"] = "ending-music-silence"
                report["warnings"].append("Final mix has >=1.2s silence during ending music; check intended fade.")
            elif missing_voice > .35:
                silence["classification"] = "unexpected-during-source-speech"
                unexpected.append(silence)
            else:
                silence["classification"] = "source-narration-pause-or-opening"
                report["warnings"].append("Final mix silence matches a narration pause; listen for music continuity.")
        report["silence"] = {"thresholdDB": -50, "minimumSec": 1.2, "finalMix": final_silences,
                             "sourceNarration": source_silences, "comparison": "Cue occupancy and original voice silence distinguish edits from intentional pauses."}
        check("no-unexpected-mix-silence-during-speech", not unexpected, unexpected)
        long_source = [s for s in source_silences if s["duration"] > 2 and s["start"] < narration["coda"]["startSec"] and any(intersection((s["start"], s["end"]), c) > 2 for c in cue_spans)]
        if long_source:
            report["warnings"].append({"sourceVoicePauseOver2SecondsInsideCue": long_source})

        invalid, overlaps, coverage, unknown = [], [], [], []
        cue_ids = {c["id"] for c in cues}
        ordered = sorted(captions, key=lambda c: c["startFrame"])
        for caption in ordered:
            if not (0 <= caption["startFrame"] < caption["endFrame"] <= EXPECTED_FRAMES) or not str(caption.get("text", "")).strip():
                invalid.append(caption.get("id"))
            if caption.get("cueId") not in cue_ids:
                unknown.append(caption.get("id"))
        for a, b in zip(ordered, ordered[1:]):
            if a["endFrame"] > b["startFrame"]:
                overlaps.append([a.get("id"), b.get("id")])
        outside = []
        for cue in cues:
            relevant = [c for c in captions if c.get("cueId") == cue["id"]]
            spans = [(max(cue["startFrame"], c["startFrame"]), min(cue["endFrame"], c["endFrame"])) for c in relevant if intersection((cue["startFrame"], cue["endFrame"]), (c["startFrame"], c["endFrame"])) > 0]
            ratio = union_length(spans) / (cue["endFrame"] - cue["startFrame"])
            coverage.append({"cueId": cue["id"], "coverage": ratio, "captionCount": len(relevant)})
            outside.extend(c["id"] for c in relevant if c["startFrame"] < cue["startFrame"] or c["endFrame"] > cue["endFrame"])
        check("caption-valid-bounds", not invalid, invalid)
        check("caption-no-overlap", not overlaps, overlaps)
        check("caption-known-cues", not unknown, unknown)
        check("caption-contained-in-cues", not outside, outside)
        check("caption-cue-coverage-at-least95pct", all(c["coverage"] >= .95 for c in coverage), coverage)
        check("caption-max22-characters", all(len(c["text"]) <= 22 for c in captions), max(map(lambda c: len(c["text"]), captions), default=0))
        report["subtitles"] = {"count": len(captions), "cueCoverage": coverage}
        report["videoSha256"] = sha256(args.video)
        return finish()
    except (OSError, ValueError, KeyError, RuntimeError, StopIteration) as exc:
        report["executionError"] = f"{type(exc).__name__}: {exc}"
        return finish(2)


if __name__ == "__main__":
    sys.exit(main())
