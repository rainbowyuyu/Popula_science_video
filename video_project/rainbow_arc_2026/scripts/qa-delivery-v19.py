from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
import sys
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VIDEO = ROOT / "output-v16" / "delivery" / "彩虹为什么是弧形_V19_optimized_1080p.mp4"
SOURCE_AUDIT = ROOT / "research" / "qa-v19" / "audit-v19.json"
RENDER_RECORD = ROOT / "research" / "qa-v19" / "render-start-v19.json"
QA_DIR = ROOT / "research" / "qa-v19"
WORK_DIR = ROOT / "work" / "qa-v19-delivery"
EXPECTED = {"width": 1920, "height": 1080, "fps": 30, "frames": 10702,
            "duration": 10702 / 30, "sample_rate": 48000, "channels": 2}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def tool(name: str) -> str:
    value = shutil.which(name)
    if value:
        return value
    fallback = Path("C:/ffmpeg/bin") / f"{name}.exe"
    if fallback.is_file():
        return str(fallback)
    raise FileNotFoundError(f"{name} is not available on PATH or C:/ffmpeg/bin")


def run(cmd: list[str], timeout: int = 2400, check: bool = False) -> subprocess.CompletedProcess[str]:
    p = subprocess.run(cmd, cwd=ROOT, text=True, encoding="utf-8", errors="replace",
                       capture_output=True, timeout=timeout)
    if check and p.returncode:
        raise RuntimeError(f"{Path(cmd[0]).name} failed ({p.returncode}): {p.stderr[-4000:]}")
    return p


def parse_rate(value: str) -> float:
    try:
        return float(Fraction(value))
    except Exception:
        return float("nan")


def parse_spans(text: str, kind: str) -> list[dict]:
    if kind == "black":
        pattern = re.compile(
            r"black_start:(?P<start>-?\d+(?:\.\d+)?)\s+"
            r"black_end:(?P<end>-?\d+(?:\.\d+)?)\s+"
            r"black_duration:(?P<duration>-?\d+(?:\.\d+)?)")
        return [{k: float(m.group(k)) for k in ("start", "end", "duration")}
                for m in pattern.finditer(text)]
    pattern = re.compile(r"silence_start:\s*(?P<start>-?\d+(?:\.\d+)?)|"
                         r"silence_end:\s*(?P<end>-?\d+(?:\.\d+)?)")
    spans, open_start = [], None
    for m in pattern.finditer(text):
        if m.group("start") is not None:
            open_start = float(m.group("start"))
        elif m.group("end") is not None and open_start is not None:
            end = float(m.group("end"))
            spans.append({"start": open_start, "end": end, "duration": end - open_start})
            open_start = None
    if open_start is not None:
        spans.append({"start": open_start, "end": None, "duration": None})
    return spans


def main() -> int:
    ap = argparse.ArgumentParser(description="V19 final encoded delivery QA.")
    ap.add_argument("--video", type=Path, default=DEFAULT_VIDEO)
    ap.add_argument("--source-audit", type=Path, default=SOURCE_AUDIT)
    ap.add_argument("--render-record", type=Path, default=RENDER_RECORD)
    args = ap.parse_args()
    video = args.video if args.video.is_absolute() else ROOT / args.video
    source_path = args.source_audit if args.source_audit.is_absolute() else ROOT / args.source_audit
    render_path = args.render_record if args.render_record.is_absolute() else ROOT / args.render_record
    QA_DIR.mkdir(parents=True, exist_ok=True)
    WORK_DIR.mkdir(parents=True, exist_ok=True)
    errors, warnings, checks = [], [], {}

    def check(ok: bool, message: str) -> None:
        checks[message] = bool(ok)
        if not ok:
            errors.append(message)

    source = json.loads(source_path.read_text(encoding="utf-8"))
    render = json.loads(render_path.read_text(encoding="utf-8"))
    check(source.get("version") == "V19" and source.get("passed") is True,
          "V19 source audit passed")
    check(render.get("version") == "V19" and render.get("status") == "completed",
          "render-start-v19 status completed")
    if not video.is_file():
        raise FileNotFoundError(f"completed delivery does not exist: {video}")
    video_hash = sha256(video)
    check(Path(render.get("output", "")).resolve() == video.resolve(),
          "delivery path matches render record")
    check(render.get("videoSHA256") == video_hash, "delivery SHA256 matches render record")
    check(render.get("sourceAuditSHA256") == sha256(source_path),
          "render source audit hash matches current audit")

    master = ROOT / "public/audio_v18/master-v18.wav"
    mix_path = ROOT / "research/qa-v18/mix-report-v18-painting-summer.json"
    provenance_path = ROOT / "research/qa-v18/audio-v18-painting-summer.json"
    check(master.is_file(), "V19 master WAV exists")
    master_hash = sha256(master) if master.is_file() else None
    mix = json.loads(mix_path.read_text(encoding="utf-8")) if mix_path.is_file() else {}
    provenance = json.loads(provenance_path.read_text(encoding="utf-8")) if provenance_path.is_file() else {}
    check(mix.get("master") == "public/audio_v18/master-v18.wav"
          and mix.get("masterSHA256") == master_hash, "mix report binds V19 master WAV")
    check(provenance.get("outputs", {}).get("public/audio_v18/master-v18.wav", {}).get("sha256") == master_hash,
          "audio provenance binds V19 master WAV")
    bound = next((r for r in source.get("sourceHashes", [])
                  if r.get("file") == "public/audio_v18/master-v18.wav"), None)
    check(bound is not None and bound.get("sha256") == master_hash,
          "source audit binds V19 master WAV")

    ffmpeg, ffprobe = tool("ffmpeg"), tool("ffprobe")
    metadata_p = run([ffprobe, "-v", "error", "-show_streams", "-show_format",
                      "-of", "json", str(video)], check=True)
    metadata = json.loads(metadata_p.stdout)
    (QA_DIR / "ffprobe-delivery-v19.json").write_text(
        json.dumps(metadata, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (WORK_DIR / "ffprobe.stderr.txt").write_text(metadata_p.stderr, encoding="utf-8")
    streams = metadata.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), None)
    a = next((s for s in streams if s.get("codec_type") == "audio"), None)
    check(v is not None and a is not None, "video and audio streams exist")
    if v and a:
        fps, nominal = parse_rate(v.get("avg_frame_rate", "nan")), parse_rate(v.get("r_frame_rate", "nan"))
        duration = float(v.get("duration", metadata.get("format", {}).get("duration", "nan")))
        audio_duration = float(a.get("duration", "nan"))
        nb_frames = int(v.get("nb_frames") or 0)
        if not nb_frames:
            count_p = run([ffprobe, "-v", "error", "-select_streams", "v:0", "-count_frames",
                           "-show_entries", "stream=nb_read_frames", "-of", "default=nw=1:nk=1", str(video)],
                          check=True)
            try:
                nb_frames = int(count_p.stdout.strip())
            except ValueError:
                nb_frames = 0
        checks.update({"videoWidth": int(v.get("width", 0)), "videoHeight": int(v.get("height", 0)),
                       "avgFPS": fps, "nominalFPS": nominal, "frameCount": nb_frames,
                       "videoSeconds": duration, "audioSeconds": audio_duration})
        check((int(v.get("width", 0)), int(v.get("height", 0))) == (1920, 1080), "video is 1920x1080")
        check(abs(fps - 30) < 1e-9 and abs(nominal - 30) < 1e-9, "video is 30 fps")
        check(nb_frames == 10702, "video frame count is 10702")
        check(abs(duration - EXPECTED["duration"]) <= 1 / 30 + .002,
              "video duration matches 10702 frames")
        check(a.get("codec_name") == "aac", "audio codec is AAC")
        check(int(a.get("sample_rate", 0)) == 48000 and int(a.get("channels", 0)) == 2,
              "audio is 48 kHz stereo")
        check(math.isfinite(audio_duration) and abs(audio_duration - duration) <= 2 / 30,
              "audio/video duration drift is within two frames")

    decode = run([ffmpeg, "-hide_banner", "-nostdin", "-v", "error", "-xerror",
                  "-i", str(video), "-map", "0:v:0", "-map", "0:a:0", "-f", "null", "-"])
    (WORK_DIR / "strict-decode.stderr.txt").write_text(decode.stderr, encoding="utf-8")
    check(decode.returncode == 0, "strict ffmpeg audio/video decode passes")

    black = run([ffmpeg, "-hide_banner", "-nostdin", "-v", "info", "-i", str(video),
                 "-vf", "blackdetect=d=0.5:pix_th=0.001:pic_th=0.98", "-an", "-f", "null", "-"])
    (WORK_DIR / "blackdetect.stderr.txt").write_text(black.stderr, encoding="utf-8")
    black_spans = parse_spans(black.stderr, "black")
    long_black = [x for x in black_spans if x["duration"] >= 0.5]
    if long_black:
        warnings.append("Blackdetect found authored dark spans; review macro/reference design.")

    silence = run([ffmpeg, "-hide_banner", "-nostdin", "-v", "info", "-i", str(video),
                   "-map", "0:a:0", "-af", "silencedetect=n=-60dB:d=1", "-f", "null", "-"])
    (WORK_DIR / "silencedetect.stderr.txt").write_text(silence.stderr, encoding="utf-8")
    silence_spans = parse_spans(silence.stderr, "silence")
    long_silence = [x for x in silence_spans if x.get("duration") is not None and x["duration"] >= 1]
    if long_silence:
        warnings.append("Audio silence spans at or below -60 dBFS were found; tail fade may be authored.")

    loud = run([ffmpeg, "-hide_banner", "-nostdin", "-v", "info", "-i", str(video),
                "-map", "0:a:0", "-af", "loudnorm=I=-16:TP=-1.0:LRA=11:print_format=json",
                "-f", "null", "-"])
    (WORK_DIR / "loudnorm.stderr.txt").write_text(loud.stderr, encoding="utf-8")
    loudness = None
    for match in re.finditer(r'\{\s*"input_i".*?\}', loud.stderr, re.S):
        try:
            loudness = json.loads(match.group(0))
        except json.JSONDecodeError:
            pass
    if not loudness:
        warnings.append("Could not parse loudnorm JSON; audio decode still completed.")
    checks["decodedAACLoudnorm"] = loudness

    report = {
        "version": "V19", "schema": "rainbow.v19.delivery-encode-qa/1",
        "createdUTC": datetime.now(timezone.utc).isoformat(),
        "video": str(video), "videoSHA256": video_hash,
        "sourceAudit": str(source_path), "renderRecord": str(render_path),
        "renderStatus": render.get("status"), "expected": EXPECTED,
        "checks": checks, "errors": errors, "warnings": warnings, "passed": not errors,
        "scope": ("ffprobe metadata, complete strict ffmpeg decode, blackdetect and silencedetect "
                  "interval reports, decoded AAC loudness/true-peak measurement, and byte/provenance "
                  "checks. No normal-speed visual playback, subjective visual approval, or human "
                  "listening is claimed. Blackdetect dark intervals are reported because macro/reference "
                  "scenes intentionally use dark backgrounds."),
        "audio": {"master": "public/audio_v18/master-v18.wav", "masterSHA256": master_hash,
                  "mixReport": str(mix_path), "provenance": str(provenance_path),
                  "decodedAACLoudnorm": loudness, "subjectiveListeningChecked": False},
        "blackDetect": {"filter": "blackdetect=d=0.5:pix_th=0.001:pic_th=0.98",
                        "spans": black_spans, "longSpans": long_black,
                        "automaticPassPolicy": "reported-only; macro/reference dark backgrounds require visual context"},
        "silenceDetect": {"filter": "silencedetect=n=-60dB:d=1",
                          "spans": silence_spans, "longSpans": long_silence,
                          "automaticPassPolicy": "reported-only; tail fade may be authored"},
    }
    output = QA_DIR / "qa-delivery-v19.json"
    output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"version": "V19", "passed": report["passed"], "errors": errors,
                      "warnings": warnings, "videoSHA256": video_hash, "output": str(output)},
                     ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"qa-delivery-v19 failed: {exc}", file=sys.stderr)
        raise



