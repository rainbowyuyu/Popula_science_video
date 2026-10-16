from __future__ import annotations

import argparse
import hashlib
import json
import math
import shutil
import subprocess
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

# Two bounded full-frame replacements. Everything else is decoded from the
# already delivered V19Repair base; the final video is re-encoded once.
ROOT = Path(__file__).resolve().parents[1]
RANGES = [(5044, 5263), (9028, 9780)]  # inclusive
TOTAL_FRAMES, FPS = 10702, 30


def fail_unless(ok, message):
    if not ok:
        raise RuntimeError(message)


def digest(path):
    h = hashlib.sha256()
    with Path(path).open("rb") as f:
        for chunk in iter(lambda: f.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def resolve(path):
    p = Path(path)
    return (p if p.is_absolute() else ROOT / p).resolve()


def read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def new_json(path, value):
    with Path(path).open("x", encoding="utf-8", newline="\n") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write("\n")


def copy_exclusive(source, destination):
    with Path(source).open("rb") as src, Path(destination).open("xb") as dst:
        shutil.copyfileobj(src, dst, 8 * 1024 * 1024)


def tool(name):
    p = shutil.which(name) or str(Path("C:/ffmpeg/bin") / (name + ".exe"))
    fail_unless(Path(p).is_file(), name + " is unavailable")
    return p


def run(argv, timeout=7200):
    result = subprocess.run(argv, cwd=ROOT, capture_output=True, text=True,
                            encoding="utf-8", errors="replace", timeout=timeout)
    fail_unless(result.returncode == 0, Path(argv[0]).name + " failed: " + result.stderr[-5000:])
    return result


def probe(path):
    return json.loads(run([tool("ffprobe"), "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)], 180).stdout)


def check_video(path, frames, audio_required=False):
    metadata = probe(path)
    video = next((s for s in metadata.get("streams", []) if s.get("codec_type") == "video"), {})
    audio = next((s for s in metadata.get("streams", []) if s.get("codec_type") == "audio"), None)
    fail_unless((video.get("width"), video.get("height")) == (1920, 1080), "Unexpected frame dimensions: " + str(path))
    fail_unless(Fraction(video.get("avg_frame_rate", "0/1")) == FPS
                and Fraction(video.get("r_frame_rate", "0/1")) == FPS, "Unexpected frame rate: " + str(path))
    fail_unless(int(video.get("nb_frames", 0)) == frames, "Unexpected frame count: " + str(path))
    duration = float(video.get("duration", "nan"))
    fail_unless(math.isfinite(duration) and abs(duration - frames / FPS) <= 1 / FPS + .002, "Unexpected video duration: " + str(path))
    if audio_required:
        fail_unless(audio is not None, "Base/final audio missing")
        fail_unless(audio.get("codec_name") == "aac" and int(audio.get("sample_rate", 0)) == 48000
                    and int(audio.get("channels", 0)) == 2, "Unexpected base/final audio format")
        fail_unless(abs(float(audio.get("duration", "nan")) - duration) <= 2 / FPS, "Audio/video duration drift")
    else:
        fail_unless(audio is None, "Patch must be a silent native render")
    return metadata


def audio_stream_hash(path):
    return run([tool("ffmpeg"), "-hide_banner", "-nostdin", "-v", "error", "-i", str(path),
                "-map", "0:a:0", "-c:a", "copy", "-vn", "-f", "streamhash", "-hash", "sha256", "-"]).stdout.strip()


def stamp(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def main():
    ap = argparse.ArgumentParser(description="Copy original AAC and replace exact inclusive frame intervals with native caption patches. No inputs are overwritten.")
    for name in ("base-video", "base-record", "source-audit", "patch-one-video", "patch-one-record", "output"):
        ap.add_argument("--" + name, type=Path, required=True)
    ap.add_argument("--patch-two-video", type=Path)
    ap.add_argument("--patch-two-record", type=Path)
    ap.add_argument("--first-patch-only", action="store_true", help="Replace only frames 5044..5263; preserve all other frames from the supplied base")
    ap.add_argument("--patch-command-record", type=Path, help="Defaults to patch-render-commands.json beside --source-audit")
    ap.add_argument("--crf", type=int, choices=[16, 18], default=16)
    ap.add_argument("--execute", action="store_true", help="Without this flag, performs read-only validation")
    args = ap.parse_args()
    base, base_record_path, audit_path, output = map(resolve, [args.base_video, args.base_record, args.source_audit, args.output])
    ranges = RANGES[:1] if args.first_patch_only else RANGES
    patch_paths = [resolve(args.patch_one_video)]
    patch_record_paths = [resolve(args.patch_one_record)]
    if args.first_patch_only:
        fail_unless(args.patch_two_video is None and args.patch_two_record is None, "Do not pass second-patch inputs in --first-patch-only mode")
    else:
        fail_unless(args.patch_two_video is not None and args.patch_two_record is not None, "Both second-patch inputs are required without --first-patch-only")
        patch_paths.append(resolve(args.patch_two_video))
        patch_record_paths.append(resolve(args.patch_two_record))
    fail_unless(output.suffix.lower() == ".mp4" and output.parent.is_dir(), "Output must be an MP4 in an existing persistent directory")
    fail_unless(not output.exists() and output not in [base, *patch_paths], "Output already exists or equals an input; overwrite forbidden")
    base_record = read(base_record_path)
    base_hash = digest(base)
    fail_unless(base_record.get("version") == "V19Repair" and base_record.get("status") == "completed", "Base delivery/recovery record must be completed V19Repair")
    fail_unless(resolve(base_record.get("output", "")) == base and base_record.get("videoSHA256") == base_hash, "Base record path/hash mismatch")
    base_audit_path = resolve(base_record["sourceAudit"])
    fail_unless(digest(base_audit_path) == base_record.get("sourceAuditSHA256"), "Base audit binding mismatch")
    base_audit = read(base_audit_path)
    fail_unless(base_audit.get("version") == "V19Repair" and base_audit.get("passed") is True, "Base immutable audit must have passed")
    base_meta = check_video(base, TOTAL_FRAMES, True)
    audit = read(audit_path)
    audit_hash = digest(audit_path)
    fail_unless(audit.get("version") == "V19Repair" and audit.get("passed") is True, "Caption-source audit must have passed")
    bindings = audit.get("sourceHashes", [])
    fail_unless(bindings, "Caption audit has no source bindings")
    old_bindings = {r["file"]: r["sha256"] for r in base_audit.get("sourceHashes", [])}
    new_bindings = {r["file"]: r["sha256"] for r in bindings}
    fail_unless(old_bindings.keys() == new_bindings.keys(), "Caption audit source inventory differs from base")
    changed_sources = [p for p in new_bindings if new_bindings[p] != old_bindings[p]]
    fail_unless(changed_sources == ["src/EditorialOverlayV19Repair.tsx"], "Changes exceed the one authorized caption overlay: " + ", ".join(changed_sources))
    for row in bindings:
        p = resolve(row["file"])
        fail_unless(p.is_file() and digest(p) == row["sha256"], "Caption input changed: " + row["file"])

    command_record_path = resolve(args.patch_command_record) if args.patch_command_record else audit_path.parent / "patch-render-commands.json"
    command_record = read(command_record_path)
    fail_unless(command_record.get("sourceAuditSHA256") == audit_hash
                and resolve(command_record.get("sourceAudit", "")) == audit_path, "Patch command sidecar audit binding mismatch")
    fail_unless([c.get("rangeInclusive") for c in command_record.get("commands", [])] == [list(r) for r in ranges], "Patch command sidecar frame ranges mismatch")
    for c, bounds in zip(command_record["commands"], ranges):
        fail_unless(f"--frames={bounds[0]},{bounds[1]}" in c.get("command", ""), "Sidecar command lacks the expected frame selection")
    patches, immutable_inputs = [], [base, base_record_path, base_audit_path, audit_path, command_record_path]
    for i, (video, record_path, bounds) in enumerate(zip(patch_paths, patch_record_paths, ranges), 1):
        record = read(record_path)
        fail_unless(record.get("version") == "V19Repair" and record.get("status") == "completed", f"Patch {i} is not a completed V19Repair render")
        fail_unless(record.get("preview") is True and record.get("inputProps") == {"audio": False, "clean": False, "plate": False}, f"Patch {i} must be a silent full-frame preview")
        vh = digest(video)
        fail_unless(resolve(record.get("output", "")) == video and record.get("videoSHA256") == vh, f"Patch {i} record path/hash mismatch")
        fail_unless(stamp(audit["createdUTC"]) <= stamp(record["startedUTC"]), f"Caption source audit was created after patch {i} started")
        bundle = resolve(record["bundleDir"]) / "bundle.js"
        fail_unless(digest(bundle) == record.get("bundleEntrySHA256"), f"Patch {i} bundle hash mismatch")
        metadata = check_video(video, bounds[1] - bounds[0] + 1)
        patches.append({"rangeInclusive": list(bounds), "frameCount": bounds[1] - bounds[0] + 1,
                        "sourceVideo": str(video), "videoSHA256": vh, "renderRecord": str(record_path),
                        "renderRecordSHA256": digest(record_path), "renderRunId": record["runId"],
                        "bundleEntrySHA256": record["bundleEntrySHA256"], "metadata": metadata,
                        "renderStartedUTC": record["startedUTC"],
                        "renderCompletedUTC": record["completedUTC"],
                        "auditBindingEvidence": "Shared immutable caption-source audit predates all selected patch renders; current bound inputs and each exact bundle hash are checked. Absolute ranges come from a command sidecar recorded before the first render finished, not from native preview records. The sidecar documents the actual issued commands but is not a cryptographic receipt of their execution."})
        immutable_inputs.extend([video, record_path, bundle])
    if len(patches) > 1:
        fail_unless(patches[0]["bundleEntrySHA256"] == patches[1]["bundleEntrySHA256"], "Patch bundles differ; require one frozen caption-only source build")
    # Source mtimes are supplementary evidence, not a replacement for hashes.
    first_patch_started = min(stamp(p["renderStartedUTC"]) for p in patches).timestamp()
    command_recorded = stamp(command_record["timeUTC"]).timestamp()
    first_patch_completed = stamp(patches[0]["renderCompletedUTC"]).timestamp()
    fail_unless(command_recorded <= first_patch_completed, "Patch command sidecar was only recorded after the first patch finished")
    command_chronology = {
        "recordedUTC": command_record["timeUTC"],
        "firstPatchStartedUTC": patches[0]["renderStartedUTC"],
        "firstPatchCompletedUTC": patches[0]["renderCompletedUTC"],
        "secondsAfterFirstPatchStarted": command_recorded - stamp(patches[0]["renderStartedUTC"]).timestamp(),
        "secondsBeforeFirstPatchCompleted": first_patch_completed - command_recorded,
        "recordedDuringFirstRender": stamp(patches[0]["renderStartedUTC"]).timestamp() <= command_recorded <= first_patch_completed,
        "auditPredatesAllSelectedPatchRenders": True,
        "evidenceLimit": "The command sidecar documents actual commands and frame ranges after the first launch. It is not claimed to predate that launch, and preview render records do not natively bind absolute frame ranges. Input hashes, audit chronology, bundle hashes, exact patch frame counts and boundary review provide complementary evidence.",
    }
    changed_after_start = [r["file"] for r in bindings if resolve(r["file"]).stat().st_mtime > first_patch_started + 1]
    fail_unless(not changed_after_start, "Source timestamps changed after patch start: " + ", ".join(changed_after_start[:8]))
    bound_hashes = {str(p): digest(p) for p in immutable_inputs}
    fail_unless(shutil.disk_usage(output.parent).free >= base.stat().st_size * 2 + 512 * 1024**2, "Output drive lacks safe capacity")
    audio_before = audio_stream_hash(base)
    summary = {"mode": "composite" if args.execute else "read-only preflight", "output": str(output),
               "rangesInclusive": ranges, "baseSHA256": base_hash, "sourceAuditSHA256": audit_hash,
               "patchMode": "single-first-patch" if args.first_patch_only else "two-patches",
               "validatedSourceInputs": len(bindings), "audioStreamHashBefore": audio_before,
               "changedSourcesFromBase": changed_sources, "patchCommandRecord": str(command_record_path),
               "commandChronology": command_chronology,
               "sourceRecordsWillRemainUnchanged": True, "fullRerenderPerformed": False}
    if not args.execute:
        print(json.dumps(summary, ensure_ascii=True, indent=2))
        return

    now = datetime.now(timezone.utc)
    run_id = "caption-composite-" + now.strftime("%Y%m%dT%H%M%S%fZ")
    evidence = output.parent / run_id
    evidence.mkdir(exist_ok=False)
    record_copies = [(base_record_path, "base-render-record.json"), (base_audit_path, "base-audit.snapshot.json"),
                    (audit_path, "audit.snapshot.json"), (patch_record_paths[0], "patch-one-render.json"),
                    (command_record_path, "patch-render-commands.json")]
    if len(patch_record_paths) > 1:
        record_copies.append((patch_record_paths[1], "patch-two-render.json"))
    for source, filename in record_copies:
        copy_exclusive(source, evidence / filename)
    # Independent base decoders avoid split/concat backpressure retaining long
    # queues of full-resolution decoded frames while later segments wait.
    # Exact frame trims deliberately avoid fractional input seeking.
    if args.first_patch_only:
        filter_graph = (
            "[0:v]trim=start_frame=0:end_frame=5044,setpts=PTS-STARTPTS[v0];"
            "[1:v]trim=start_frame=0:end_frame=220,setpts=PTS-STARTPTS[v1];"
            "[2:v]trim=start_frame=5264:end_frame=10702,setpts=PTS-STARTPTS[v2];"
            "[v0][v1][v2]concat=n=3:v=1:a=0,format=yuv420p[outv]"
        )
        video_inputs = [base, patch_paths[0], base]
    else:
        filter_graph = (
            "[0:v]trim=start_frame=0:end_frame=5044,setpts=PTS-STARTPTS[v0];"
            "[1:v]trim=start_frame=0:end_frame=220,setpts=PTS-STARTPTS[v1];"
            "[2:v]trim=start_frame=5264:end_frame=9028,setpts=PTS-STARTPTS[v2];"
            "[3:v]trim=start_frame=0:end_frame=753,setpts=PTS-STARTPTS[v3];"
            "[4:v]trim=start_frame=9781:end_frame=10702,setpts=PTS-STARTPTS[v4];"
            "[v0][v1][v2][v3][v4]concat=n=5:v=1:a=0,format=yuv420p[outv]"
        )
        video_inputs = [base, patch_paths[0], base, patch_paths[1], base]
    command = [tool("ffmpeg"), "-hide_banner", "-nostdin", "-n"]
    for video_input in video_inputs:
        command.extend(["-i", str(video_input)])
    command.extend(["-filter_complex", filter_graph,
               "-map", "[outv]", "-map", "0:a:0", "-c:v", "libx264", "-preset", "medium", "-crf", str(args.crf),
               "-r", "30", "-fps_mode", "cfr", "-pix_fmt", "yuv420p", "-c:a", "copy",
               "-color_primaries", "bt709", "-color_trc", "bt709", "-colorspace", "bt709",
               "-movflags", "+faststart", "-use_editlist", "1", "-avoid_negative_ts", "disabled", str(output)])
    new_json(evidence / "composition-inputs.json", {**summary, "patches": patches,
             "inputHashes": bound_hashes, "filterGraph": filter_graph, "command": command,
             "pixelScope": "Outside the selected intervals, decoded base video frames are retained in order. The complete image stream is re-encoded with libx264, so compressed bytes and lossy pixel values may differ. Audio AAC packets are copied unchanged.",
             "createdUTC": now.isoformat()})
    try:
        result = run(command)
        (evidence / "ffmpeg.stderr.txt").write_text(result.stderr, encoding="utf-8")
        final_meta = check_video(output, TOTAL_FRAMES, True)
        audio_after = audio_stream_hash(output)
        fail_unless(audio_before == audio_after, "Audio packet stream changed during composition")
        for p, expected_hash in bound_hashes.items():
            fail_unless(digest(Path(p)) == expected_hash, "Input mutated during composition: " + p)
        for row in bindings:
            fail_unless(digest(resolve(row["file"])) == row["sha256"], "Audited source mutated during composition: " + row["file"])
        new_json(evidence / "ffprobe-final.json", final_meta)
        new_json(evidence / "audio-stream-verification.json", {"before": audio_before, "after": audio_after, "unchanged": True})
        record = {"version": "V19Repair", "schema": "rainbow.v19-repair.bounded-caption-composite/1",
                  "runId": run_id, "status": "completed", "scope": "composite full delivery from audited base plus " + str(len(ranges)) + " caption-only native frame patch(es)",
                  "patchMode": "single-first-patch" if args.first_patch_only else "two-patches",
                  "preview": False, "startedUTC": now.isoformat(), "completedUTC": datetime.now(timezone.utc).isoformat(),
                  "operation": "Decoded base segments and " + str(len(ranges)) + " exact native patch interval(s) were concatenated and re-encoded. Original AAC packet stream was copied. This is not a full scene re-render.",
                  "fullRerenderPerformed": False, "composition": {"id": "RainbowArcV19Repair", "width": 1920, "height": 1080, "fps": FPS, "durationInFrames": TOTAL_FRAMES},
                  "output": str(output), "videoSHA256": digest(output), "bytes": output.stat().st_size,
                  "sourceAudit": str(evidence / "audit.snapshot.json"), "sourceAuditSHA256": audit_hash, "sourceHashes": bindings,
                  "base": {"video": str(base), "videoSHA256": base_hash, "renderRecord": str(base_record_path),
                           "renderRecordSHA256": bound_hashes[str(base_record_path)], "audit": str(base_audit_path),
                           "auditSHA256": bound_hashes[str(base_audit_path)], "renderRunId": base_record["runId"]},
                  "patches": patches, "patchRangesInclusive": [list(r) for r in ranges],
                  "changedSourcesFromBase": changed_sources, "patchCommandRecord": str(evidence / "patch-render-commands.json"),
                  "patchCommandRecordSHA256": bound_hashes[str(command_record_path)],
                  "commandChronology": command_chronology,
                  "audioStreamHashBefore": audio_before, "audioStreamHashAfter": audio_after, "audioCopiedUnchanged": True,
                  "compositionInputs": str(evidence / "composition-inputs.json"), "helperSHA256": digest(Path(__file__)),
                  "encodeQARequired": True, "humanNormalSpeedPlayback": False, "humanListening": False}
        record_path = evidence / "render-composite.json"
        new_json(record_path, record)
        print(json.dumps({**summary, "renderRecord": str(record_path), "videoSHA256": record["videoSHA256"],
                          "nextStep": "Run qa-delivery-v19-repair.py with explicit --video and --render-record. Inspect all selected patch boundaries and adjusted subtitle cues."}, ensure_ascii=True, indent=2))
    except Exception as exc:
        new_json(evidence / "composite-failure.json", {"status": "failed", "error": str(exc), "output": str(output),
                 "createdUTC": datetime.now(timezone.utc).isoformat(), "inputsPreserved": True, "outputRetainedForInspection": output.exists()})
        raise


if __name__ == "__main__":
    main()
