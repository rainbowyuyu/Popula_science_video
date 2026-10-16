"""Read-only technical QA of the final v19 MP4; writes a machine-readable report.

The input MP4 is never changed.  This check does not claim subjective listening
or continuous visual review.  Run after render_launch_v19.mjs has muxed the AAC.
"passed" means objective technical checks only, never aesthetic approval.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys


ROOT = Path(__file__).resolve().parents[1]
STORY = json.loads((ROOT / "src/launch-v19-story.json").read_text("utf-8-sig"))
assert STORY["fps"] == 60 and 3600 <= STORY["duration"] < 7200
EXPECTED = {"width": 1920, "height": 1080, "fps": 60, "frames": STORY["duration"], "seconds": STORY["duration"] / STORY["fps"]}
BLACK_FILTER = "blackdetect=d=0:pix_th=0.02:pic_th=0.995"
LOUDNESS_FILTER = "loudnorm=I=-16:TP=-1.8:LRA=8:print_format=json"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def run(args: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, capture_output=True, text=True, encoding="utf8", errors="replace")


def number(value: object) -> float | None:
    try:
        result = float(str(value))
        return result if math.isfinite(result) else None
    except (ValueError, TypeError):
        return None


def srt_ms(timecode: str) -> int:
    h, m, s, ms = (int(v) for v in re.split(r"[:,.]", timecode))
    return ((h * 60 + m) * 60 + s) * 1000 + ms


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, default=ROOT / "output/ai_engineer_launch_v19_1080p60.mp4")
    parser.add_argument("--captions", type=Path, default=ROOT / "src/launch-v19-captions.json")
    parser.add_argument("--srt", type=Path, default=ROOT / "delivery/AI-Engineer-Launch-v19.zh.srt")
    parser.add_argument("--report", type=Path, default=ROOT / "research/qa/launch-v19-delivery.json")
    args = parser.parse_args()
    report_path = args.report.resolve()
    if not report_path.is_relative_to(ROOT) or not re.search(r'(?:^|[\\/_-])v19(?:[\\/_.-]|$)', str(report_path), re.I):
        raise ValueError('v19 QA report must name v19 within this project')
    if re.search(r'(?:^|[\\/_-])v(?:[1-9]|1[0-8])(?:[\\/_.-]|$)', str(report_path), re.I):
        raise ValueError("v19 QA report must not overwrite an earlier version's QA artifact")
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report: dict = {
        "schema": "launch-v19-technical-delivery-v1",
        "checkedAt": datetime.now(timezone.utc).isoformat(),
        "file": str(args.video.resolve()),
        "expected": EXPECTED,
        "checks": {},
        "errors": [],
        "fullDecodePassed": False,
        "subjectiveListeningChecked": False,
        "fullRealTimeViewingChecked": False,
        "technicalChecksOnly": True,
        "aestheticAccepted": None,
        "deliveryApproval": "Not decided by this technical QA script.",
        "visualReview": "Technical checks only; review the v19 scene and transition contact sheets separately.",
    }

    def check(name: str, passed: bool, actual: object = None) -> None:
        report["checks"][name] = {"passed": bool(passed), "actual": actual}

    try:
        if not args.video.is_file():
            raise FileNotFoundError(f"Final v19 video not found: {args.video}")
        report["sha256"] = sha256(args.video)
        report["sizeBytes"] = args.video.stat().st_size
        probe_result = run(["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(args.video)])
        if probe_result.returncode:
            raise RuntimeError("ffprobe failed: " + probe_result.stderr[-4000:])
        probe = json.loads(probe_result.stdout)
        video = next((s for s in probe["streams"] if s.get("codec_type") == "video"), None)
        audio = next((s for s in probe["streams"] if s.get("codec_type") == "audio"), None)
        if not video or not audio:
            raise ValueError("Final MP4 must contain both video and audio streams")
        frame_rate = float(Fraction(video.get("avg_frame_rate", "0/1")))
        nominal_rate = float(Fraction(video.get("r_frame_rate", "0/1")))
        video_seconds = number(video.get("duration"))
        audio_seconds = number(audio.get("duration"))
        format_seconds = number(probe.get("format", {}).get("duration"))
        encoded_frames = int(video["nb_frames"]) if str(video.get("nb_frames", "")).isdigit() else None
        report["media"] = {
            "width": video.get("width"), "height": video.get("height"),
            "avgFps": frame_rate, "nominalFps": nominal_rate, "frames": encoded_frames,
            "videoSeconds": video_seconds, "audioSeconds": audio_seconds, "containerSeconds": format_seconds,
            "videoCodec": video.get("codec_name"), "audioCodec": audio.get("codec_name"),
            "pixelFormat": video.get("pix_fmt"), "audioSampleRate": audio.get("sample_rate"),
            "audioChannels": audio.get("channels"), "colorSpace": video.get("color_space"),
        }
        check("resolution", (video.get("width"), video.get("height")) == (1920, 1080), [video.get("width"), video.get("height")])
        check("frameRate", abs(frame_rate - 60) < 1e-8 and abs(nominal_rate - 60) < 1e-8, [frame_rate, nominal_rate])
        check("videoDuration", video_seconds is not None and abs(video_seconds - EXPECTED["seconds"]) <= 1 / 60, video_seconds)
        check("containerDuration", format_seconds is not None and abs(format_seconds - EXPECTED["seconds"]) <= .06, format_seconds)
        check("audioVideoAlignment", video_seconds is not None and audio_seconds is not None and abs(video_seconds - audio_seconds) <= .06, {"video": video_seconds, "audio": audio_seconds})
        check("audioCodec", audio.get("codec_name") == "aac", audio.get("codec_name"))
        check("audioSampleRate", audio.get("sample_rate") == "48000", audio.get("sample_rate"))

        # -xerror turns corrupted packets / decoder errors into a failing exit.
        # Progress frame count independently validates metadata's nb_frames.
        decode = run(["ffmpeg", "-hide_banner", "-nostdin", "-nostats", "-v", "warning", "-xerror", "-err_detect", "explode", "-i", str(args.video), "-map", "0:v:0", "-map", "0:a:0", "-progress", "pipe:1", "-f", "null", "-"])
        decode_log = report_path.parent / f"{report_path.stem}-decode.log"
        decode_log.write_text(decode.stderr, encoding="utf8")
        frame_counts = [int(v) for v in re.findall(r"(?m)^frame=(\d+)\s*$", decode.stdout)]
        decoded_frames = frame_counts[-1] if frame_counts else None
        report["fullDecodePassed"] = decode.returncode == 0 and "progress=end" in decode.stdout
        report["decodedFrames"] = decoded_frames
        report["decodeLog"] = str(decode_log)
        report["decodeWarnings"] = decode.stderr.strip()
        check("fullDecode", report["fullDecodePassed"], {"returnCode": decode.returncode, "decodedFrames": decoded_frames})
        check("frameCount", decoded_frames == EXPECTED["frames"] and (encoded_frames is None or encoded_frames == EXPECTED["frames"]), {"metadata": encoded_frames, "decoded": decoded_frames})

        # Analyze the FINAL AAC stream, not the WAV premaster.  loudnorm's
        # input_* values are measurements before its null-output normalization.
        analysis = run(["ffmpeg", "-hide_banner", "-nostdin", "-nostats", "-i", str(args.video), "-map", "0:v:0", "-map", "0:a:0", "-vf", BLACK_FILTER, "-af", LOUDNESS_FILTER, "-f", "null", "-"])
        analysis_log = report_path.parent / f"{report_path.stem}-technical-analysis.log"
        analysis_log.write_text(analysis.stderr, encoding="utf8")
        report["analysisLog"] = str(analysis_log)
        if analysis.returncode:
            raise RuntimeError("FFmpeg technical analysis failed: " + analysis.stderr[-4000:])
        blocks = re.findall(r'\{\s*"input_i"[\s\S]*?\}', analysis.stderr)
        if not blocks:
            raise RuntimeError("No final AAC loudnorm measurement found")
        stats = json.loads(blocks[-1])
        final_aac = {"integratedLUFS": number(stats["input_i"]), "truePeakDBTP": number(stats["input_tp"]), "LRA": number(stats["input_lra"])}
        report["finalAAC"] = final_aac
        check("integratedLoudness", final_aac["integratedLUFS"] is not None and -17 <= final_aac["integratedLUFS"] <= -15, final_aac["integratedLUFS"])
        check("AACTruePeak", final_aac["truePeakDBTP"] is not None and final_aac["truePeakDBTP"] < -1.8, final_aac["truePeakDBTP"])
        black = [{"start": float(start), "end": float(end), "duration": float(duration)} for start, end, duration in re.findall(r"black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)", analysis.stderr)]
        report["blackDetection"] = {"filter": BLACK_FILTER, "minimumDurationSeconds": 0, "minimumBlackPixelFraction": .995, "pixelLuminanceThreshold": .02, "segments": black}
        check("noFullBlackFrame", not black, black)

        silence = run(["ffmpeg", "-hide_banner", "-nostdin", "-i", str(args.video), "-vn", "-af", "silencedetect=n=-50dB:d=1.0", "-f", "null", "-"])
        silent_spans = [{"start": float(a), "end": float(b), "duration": float(d)} for a, b, d in re.findall(r"silence_start: ([\d.]+)[\s\S]*?silence_end: ([\d.]+) \| silence_duration: ([\d.]+)", silence.stderr)]
        check("noUnintendedLongSilence", silence.returncode == 0 and not [s for s in silent_spans if s["start"] < EXPECTED["seconds"] - 1], silent_spans)

        captions = json.loads(args.captions.read_text(encoding="utf-8-sig"))
        if not isinstance(captions, list) or not captions:
            raise ValueError("Caption JSON must be a nonempty list")
        bounds = [(int(c["startMs"]), int(c["endMs"])) for c in captions]
        invalid = [i for i, (start, end) in enumerate(bounds) if start < 0 or end <= start]
        overlaps = [i for i in range(1, len(bounds)) if bounds[i][0] < bounds[i - 1][1]]
        final_caption_ms = max(end for _, end in bounds)
        check("captionBounds", not invalid and final_caption_ms <= EXPECTED["seconds"] * 1000, {"invalidIndices": invalid, "lastEndMs": final_caption_ms})
        check("captionOrderAndOverlap", not overlaps, overlaps)
        srt_text = args.srt.read_text(encoding="utf-8-sig")
        srt_bounds = [(srt_ms(a), srt_ms(b)) for a, b in re.findall(r"(\d\d:\d\d:\d\d[,\.]\d\d\d)\s*-->\s*(\d\d:\d\d:\d\d[,\.]\d\d\d)", srt_text)]
        final_srt_ms = max((end for _, end in srt_bounds), default=None)
        check("srtBoundsAndMatchesCaptions", bool(srt_bounds) and srt_bounds == bounds and final_srt_ms <= EXPECTED["seconds"] * 1000, {"count": len(srt_bounds), "lastEndMs": final_srt_ms})
        normalized_srt = srt_text.replace("\r\n", "\n").strip()
        srt_blocks = re.split(r"\n\s*\n", normalized_srt)
        srt_texts = []
        for block in srt_blocks:
            lines = block.splitlines()
            timestamp_index = next((i for i, line in enumerate(lines) if "-->" in line), None)
            if timestamp_index is not None:
                srt_texts.append(re.sub(r"\s+", "", "\n".join(lines[timestamp_index + 1:])))
        caption_texts = [re.sub(r"\s+", "", str(c.get("text", ""))) for c in captions]
        check("srtTextMatchesCaptions", srt_texts == caption_texts and all(caption_texts), {"srtCount": len(srt_texts), "captionCount": len(caption_texts)})
        report["captions"] = {"file": str(args.captions.resolve()), "sha256": sha256(args.captions), "count": len(captions), "lastEndMs": final_caption_ms, "srtFile": str(args.srt.resolve()), "srtSHA256": sha256(args.srt), "srtLastEndMs": final_srt_ms}
    except Exception as error:
        report["errors"].append(f"{type(error).__name__}: {error}")
    report["passed"] = bool(report["checks"]) and not report["errors"] and all(check["passed"] for check in report["checks"].values())
    report["technicalPassed"] = report["passed"]
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"technicalPassed": report["passed"], "aestheticAccepted": None, "report": str(report_path), "failedChecks": [name for name, check in report["checks"].items() if not check["passed"]], "errors": report["errors"]}, ensure_ascii=False))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())


