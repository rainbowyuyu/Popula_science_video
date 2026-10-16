"""Assemble two v6 replacements around the SHA-verified v5 encoded baseline.

The five inclusive timeline intervals are 0-419, 420-1199, 1200-2939,
2940-3899, 3900-6299. All five receive the same H.264 High / CRF17 / 60fps /
90000-timescale encode before concatenation. Audio is remuxed from the existing
rainbow personal-voice master, rather than from the patch or baseline AAC.

Usage:
  python scripts/assemble_launch_v6_patches.py --patch-brief PATH --patch-interaction PATH
The input videos and v5 delivery are never modified. Run final decode/audio QA
and visual review separately; successful assembly is not aesthetic acceptance.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
BASELINE_SHA = "7cf5894b368a2f07f334527c143dd481a92ee653d001b53ef084ee68d2bb8c23"
FPS, FRAMES = 60, 6300
ENCODER = {"codec": "libx264", "profile": "high", "crf": 17, "preset": "medium",
           "fps": 60, "pixelFormat": "yuv420p", "videoTrackTimescale": 90000,
           "colorSpace": "bt709"}


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


def resolve(value: str | Path) -> Path:
    path = Path(value)
    return path.resolve() if path.is_absolute() else (ROOT / path).resolve()


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def relative(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def source(path: Path) -> dict:
    if not path.is_file():
        raise FileNotFoundError(path)
    return {"file": relative(path), "sha256": sha(path), "sizeBytes": path.stat().st_size}


def capture(args: list[str]) -> str:
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf8", errors="replace")
    if result.returncode:
        raise RuntimeError(f"{args[0]} failed: {result.stderr[-5000:]}")
    return result.stdout


def probe_video(path: Path, expected_frames: int, count_frames=True) -> dict:
    args = ["ffprobe", "-v", "error"]
    if count_frames:
        args.append("-count_frames")
    args += ["-select_streams", "v:0", "-show_streams", "-of", "json", str(path)]
    streams = json.loads(capture(args))["streams"]
    if not streams:
        raise ValueError(f"No video stream in {path}")
    stream = streams[0]
    actual = {"width": stream.get("width"), "height": stream.get("height"),
              "avgFps": float(Fraction(stream.get("avg_frame_rate", "0/1"))),
              "nominalFps": float(Fraction(stream.get("r_frame_rate", "0/1"))),
              "metadataFrames": int(stream["nb_frames"]) if str(stream.get("nb_frames", "")).isdigit() else None,
              "decodedFrames": int(stream["nb_read_frames"]) if str(stream.get("nb_read_frames", "")).isdigit() else None,
              "durationSeconds": float(stream.get("duration", 0)), "timeBase": stream.get("time_base"),
              "codec": stream.get("codec_name"), "profile": stream.get("profile"), "pixelFormat": stream.get("pix_fmt")}
    counted = actual["decodedFrames"] if count_frames else actual["metadataFrames"]
    if (actual["width"], actual["height"]) != (1920, 1080) or actual["avgFps"] != FPS or actual["nominalFps"] != FPS:
        raise ValueError(f"Source must be 1920x1080 / 60fps: {path}: {actual}")
    if counted != expected_frames or (actual["metadataFrames"] is not None and actual["metadataFrames"] != expected_frames):
        raise ValueError(f"Exact source length mismatch ({expected_frames} expected): {path}: {actual}")
    if abs(actual["durationSeconds"] - expected_frames / FPS) > 1 / FPS:
        raise ValueError(f"Source duration disagrees with frame count: {path}: {actual}")
    return actual


def encode(args: list[str], log: Path) -> None:
    with log.open("w", encoding="utf8") as stream:
        result = subprocess.run(args, stdout=subprocess.DEVNULL, stderr=stream, text=True,
                                encoding="utf8", errors="replace")
    if result.returncode:
        raise RuntimeError(f"ffmpeg failed; see {log}: {log.read_text('utf8')[-4000:]}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", default="output/ai_engineer_launch_v5_1080p60.mp4")
    parser.add_argument("--baseline-sha256", default=BASELINE_SHA)
    parser.add_argument("--patch-brief", required=True, help="exact 780-frame replacement for 420-1199")
    parser.add_argument("--patch-interaction", required=True, help="exact 960-frame replacement for 2940-3899")
    parser.add_argument("--audio", default="public/audio/launch-v5-master.wav")
    parser.add_argument("--output", default="output/ai_engineer_launch_v6_1080p60.mp4")
    parser.add_argument("--manifest", default="delivery/AI-Engineer-Launch-v6-patch-assembly.json")
    parser.add_argument("--work-dir", default=None)
    parser.add_argument("--threads", type=int, default=8)
    parser.add_argument("--plan-only", action="store_true", help="validate inputs and write plan; do not encode")
    args = parser.parse_args()
    if args.threads < 1:
        raise ValueError("--threads must be positive")
    baseline, brief, interaction, audio, output, manifest_path = map(resolve,
        (args.baseline, args.patch_brief, args.patch_interaction, args.audio, args.output, args.manifest))
    if output in (baseline, brief, interaction, audio) or output.name.lower() == "ai_engineer_launch_v5_1080p60.mp4":
        raise ValueError("Assembly output must not overwrite an input or preserved v5 delivery")
    sources = {"baseline": source(baseline), "patchBrief": source(brief),
               "patchInteraction": source(interaction), "audioMaster": source(audio)}
    if sources["baseline"]["sha256"] != args.baseline_sha256.lower():
        raise ValueError("Baseline SHA-256 mismatch; do not assemble from an unverified v5 source")
    media = {"baseline": probe_video(baseline, FRAMES), "patchBrief": probe_video(brief, 780),
             "patchInteraction": probe_video(interaction, 960)}
    audio_probe = json.loads(capture(["ffprobe", "-v", "error", "-select_streams", "a:0",
                                      "-show_streams", "-of", "json", str(audio)]))["streams"]
    if not audio_probe:
        raise ValueError("Rainbow master has no audio stream")
    a = audio_probe[0]
    media["audioMaster"] = {"sampleRate": a.get("sample_rate"), "channels": a.get("channels"),
                            "durationSeconds": float(a.get("duration", 0)), "codec": a.get("codec_name")}
    if a.get("sample_rate") != "48000" or abs(media["audioMaster"]["durationSeconds"] - 105) > .06:
        raise ValueError("Assembly must use the 105-second / 48kHz rainbow master")
    timeline_files = [ROOT / "src/launch-v5-story.json", ROOT / "src/launch-v5-captions.json",
                      ROOT / "research/generation/launch-v6-bridges.json", ROOT / "research/generation/qwen-v5-specs.json",
                      ROOT / "research/generation/qwen-v5-tasks.json", Path(__file__).resolve()]
    for patch in (brief, interaction):
        sibling_manifest = patch.parent / "render-manifest.json"
        if sibling_manifest.is_file() and sibling_manifest not in timeline_files:
            timeline_files.append(sibling_manifest)
    timeline_sources = [source(path) for path in timeline_files if path.is_file()]
    film_source_files = sorted(path for path in (ROOT / "src").rglob("*") if path.is_file() and path.suffix in (".ts", ".tsx", ".json", ".css"))
    film_sources = [source(path) for path in film_source_files]
    revision = hashlib.sha256(json.dumps({"sources": sources, "timeline": timeline_sources,
        "filmSources": film_sources, "encoder": ENCODER}, sort_keys=True).encode()).hexdigest()[:12]
    work = resolve(args.work_dir) if args.work_dir else ROOT / "output" / f"launch-v6-patch-assembly-{revision}"
    work.mkdir(parents=True, exist_ok=True)
    segments = [
        {"index": 0, "kind": "preserved-v5", "sourceKey": "baseline", "sourceFromFrame": 0, "sourceEndFrameExclusive": 420, "startFrame": 0, "endFrameExclusive": 420},
        {"index": 1, "kind": "v6-replacement", "sourceKey": "patchBrief", "sourceFromFrame": 0, "sourceEndFrameExclusive": 780, "startFrame": 420, "endFrameExclusive": 1200},
        {"index": 2, "kind": "preserved-v5", "sourceKey": "baseline", "sourceFromFrame": 1200, "sourceEndFrameExclusive": 2940, "startFrame": 1200, "endFrameExclusive": 2940},
        {"index": 3, "kind": "v6-replacement", "sourceKey": "patchInteraction", "sourceFromFrame": 0, "sourceEndFrameExclusive": 960, "startFrame": 2940, "endFrameExclusive": 3900},
        {"index": 4, "kind": "preserved-v5", "sourceKey": "baseline", "sourceFromFrame": 3900, "sourceEndFrameExclusive": 6300, "startFrame": 3900, "endFrameExclusive": 6300},
    ]
    for segment in segments:
        segment["frames"] = segment["endFrameExclusive"] - segment["startFrame"]
        segment["file"] = relative(work / f'segment-{segment["index"]:02d}.mp4')
    if sum(segment["frames"] for segment in segments) != FRAMES:
        raise ValueError("Patch assembly timeline does not contain exactly 6300 frames")
    manifest = {"schema": "launch-v6-patch-assembly-v1", "revision": revision, "startedUTC": now(),
                "expected": {"frames": FRAMES, "fps": FPS, "seconds": 105, "width": 1920, "height": 1080},
                "baselineExpectedSHA256": args.baseline_sha256.lower(), "sources": sources, "sourceMedia": media,
                "timelineSources": timeline_sources, "filmSourceHashes": film_sources, "encoder": ENCODER,
                "segments": segments, "output": relative(output), "outputAudio": {"codec": "aac", "sampleRate": 48000, "bitrate": "256k"},
                "sourceContentPreserved": "Unchanged intervals are decoded from the SHA-verified v5 film and reencoded uniformly; original AAC is discarded.",
                "fullDecodePassed": False, "subjectiveVisualReviewPassed": False,
                "acceptance": "Assembly only; run verify_launch_v6.py and final-frame visual review before delivery."}

    def save() -> None:
        text = json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
        (work / "assembly-manifest.json").write_text(text, "utf8")
        manifest_path.parent.mkdir(parents=True, exist_ok=True)
        manifest_path.write_text(text, "utf8")

    save()
    if args.plan_only:
        print(json.dumps({"plan": str(work / "assembly-manifest.json"), "revision": revision,
                          "validatedInputFrames": {key: value.get("decodedFrames") for key, value in media.items()}}, ensure_ascii=False))
        return 0
    manifest["ffmpegVersion"] = capture(["ffmpeg", "-version"]).splitlines()[0]
    inputs = {"baseline": baseline, "patchBrief": brief, "patchInteraction": interaction}
    try:
        for segment in segments:
            index, frames = segment["index"], segment["frames"]
            destination = work / f"segment-{index:02d}.mp4"
            sidecar = destination.with_suffix(".mp4.json")
            cached = False
            if destination.is_file() and sidecar.is_file():
                try:
                    cached_data = json.loads(sidecar.read_text("utf8"))
                    cached = cached_data.get("revision") == revision and cached_data.get("sha256") == sha(destination)
                except (ValueError, OSError):
                    pass
            if cached:
                print(f"RESUME segment {index}", flush=True)
            else:
                print(f"ENCODE segment {index}: {segment['startFrame']}-{segment['endFrameExclusive'] - 1} ({frames} frames)", flush=True)
                start, end = segment["sourceFromFrame"], segment["sourceEndFrameExclusive"]
                filter_graph = f"trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS,fps={FPS}"
                encode(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-i", str(inputs[segment["sourceKey"]]),
                        "-map", "0:v:0", "-vf", filter_graph, "-an", "-c:v", "libx264", "-profile:v", "high",
                        "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-r", str(FPS), "-fps_mode", "cfr",
                        "-threads", str(args.threads), "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
                        "-video_track_timescale", "90000", "-frames:v", str(frames), "-movflags", "+faststart", str(destination)],
                       work / f"segment-{index:02d}-encode.log")
                check = probe_video(destination, frames)
                if check["timeBase"] != "1/90000" or check["profile"] != "High" or check["pixelFormat"] != "yuv420p":
                    raise ValueError(f"Segment {index} does not match the unified encoding contract: {check}")
                sidecar.write_text(json.dumps({"revision": revision, "sha256": sha(destination), "frames": frames,
                                               "media": check, "finishedUTC": now()}, indent=2) + "\n", "utf8")
            segment.update(sha256=sha(destination), sizeBytes=destination.stat().st_size)
            save()
        concat_path = work / "concat.txt"
        concat_path.write_text("\n".join("file '" + (work / f"segment-{segment['index']:02d}.mp4").as_posix().replace("'", "'\\''") + "'" for segment in segments) + "\n", "utf8")
        temporary = work / "ai_engineer_launch_v6-muxed.tmp.mp4"
        print("MUX 6300 frames with frozen rainbow master", flush=True)
        encode(["ffmpeg", "-hide_banner", "-nostdin", "-y", "-f", "concat", "-safe", "0", "-i", str(concat_path),
                "-i", str(audio), "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k",
                "-ar", "48000", "-video_track_timescale", "90000", "-frames:v", str(FRAMES), "-t", "105",
                "-movflags", "+faststart", str(temporary)], work / "final-mux.log")
        final_media = probe_video(temporary, FRAMES)
        if final_media["timeBase"] != "1/90000":
            raise ValueError("Final video does not preserve 90000 track timescale")
        output.parent.mkdir(parents=True, exist_ok=True)
        temporary.replace(output)
        manifest.update(finishedUTC=now(), finalSHA256=sha(output), finalSizeBytes=output.stat().st_size,
                        finalMedia=final_media, assembled=True)
        save()
        print(json.dumps({"final": str(output), "sha256": manifest["finalSHA256"], "frames": FRAMES,
                          "manifest": str(manifest_path), "qaStillRequired": True}, ensure_ascii=False))
    except Exception as error:
        manifest["error"] = f"{type(error).__name__}: {error}"
        save()
        raise
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as error:
        print(f"ASSEMBLY_FAILED {type(error).__name__}: {error}", file=sys.stderr)
        raise SystemExit(1)
