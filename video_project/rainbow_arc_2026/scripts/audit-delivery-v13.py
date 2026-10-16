"""Audit the completed V13 MP4 and produce frame-exact visual review sheets.

The report binds the delivered bytes to the current source-audit snapshot. It
does not claim that generated contact sheets are a full manual review, nor that
objective checks prove subjective quality. Run only after rendering completes.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
import shutil
import subprocess
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "research" / "qa-v13"
EXPECTED = {"width": 1920, "height": 1080, "fps": 30, "frames": 10702,
            "audioSampleRate": 48000, "audioChannels": 2}


def sha256(file: Path) -> str:
    h = hashlib.sha256()
    with file.open("rb") as stream:
        for chunk in iter(lambda: stream.read(8 * 1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(args: list[str], check: bool = True) -> subprocess.CompletedProcess:
    p = subprocess.run(args, capture_output=True, encoding="utf-8", errors="replace")
    if check and p.returncode:
        raise RuntimeError(f"{Path(args[0]).name} exited {p.returncode}: {p.stderr[-4000:]}")
    return p


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    configured = json.loads((ROOT / "work/output-root-v13.json").read_text(encoding="utf-8"))
    parser.add_argument("--video", type=Path,
                        default=Path(configured["outputRoot"]) / "delivery/彩虹为什么是弧形_V13_1080p.mp4")
    args = parser.parse_args()
    video = args.video.resolve()
    if not video.is_file():
        raise FileNotFoundError(f"Completed V13 delivery does not exist: {video}")
    QA.mkdir(parents=True, exist_ok=True)
    ffmpeg, ffprobe = shutil.which("ffmpeg"), shutil.which("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("ffmpeg and ffprobe must be available on PATH")
    errors, warnings = [], []

    def check(condition: bool, message: str) -> bool:
        if not condition:
            errors.append(message)
        return bool(condition)

    source_path = QA / "audit-v13.json"
    if not source_path.exists():
        raise FileNotFoundError("Run node scripts/audit-v13.mjs against the final source first")
    source = json.loads(source_path.read_text(encoding="utf-8"))
    check(source.get("version") == "V13" and source.get("passed") is True,
          "Current V13 source audit has not passed")
    source_changed = [x["file"] for x in source["sourceHashes"]
                      if not (ROOT / x["file"]).is_file()
                      or sha256(ROOT / x["file"]) != x["sha256"]]
    check(not source_changed, "Source audit snapshot is stale: " + ", ".join(source_changed))
    input_hashes = source.get("assets", {}).get("staticAssetHashes", [])
    check(bool(input_hashes), "Source audit has no hashes for the actual static inputs")
    inputs_changed = [x["file"] for x in input_hashes
                      if not (ROOT / x["file"]).is_file()
                      or sha256(ROOT / x["file"]) != x["sha256"]]
    check(not inputs_changed, "Source audit input snapshot is stale: " + ", ".join(inputs_changed))
    initial_source_audit_hash = sha256(source_path)
    initial_video_hash = sha256(video)
    timeline = json.loads((ROOT / "src/timeline.json").read_text(encoding="utf-8"))
    check(timeline["duration"] == EXPECTED["frames"] and timeline["fps"] == EXPECTED["fps"],
          "V13 source duration/fps differs from requested delivery")
    editorial = source.get("editorial", {})
    check(editorial.get("captions") == len(timeline["captions"])
          and editorial.get("fontSize") == 48 and editorial.get("maxGlyphs", 99) <= 22,
          "V13 subtitle contract is missing or stale in the source audit")
    check(editorial.get("labelBoundsFailures") == 0,
          "V13 projected-label source layout has unresolved bounds errors")
    check(source.get("environment", {}).get("file") == "public/assets_v13/environment/rain_garden_v13.glb",
          "Source audit did not validate the active V13 Blender garden")
    expected_seconds = EXPECTED["frames"] / EXPECTED["fps"]

    metadata_result = run([ffprobe, "-v", "error", "-show_streams", "-show_format",
                           "-of", "json", str(video)])
    metadata = json.loads(metadata_result.stdout)
    (QA / "ffprobe-delivery-v13.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    v = next(x for x in metadata["streams"] if x["codec_type"] == "video")
    a = next(x for x in metadata["streams"] if x["codec_type"] == "audio")
    fps = float(Fraction(v["avg_frame_rate"]))
    video_seconds, audio_seconds = float(v["duration"]), float(a["duration"])
    video_start, audio_start = float(v.get("start_time", 0)), float(a.get("start_time", 0))
    nb_frames = int(v.get("nb_frames", 0))
    first_packet_probe = run([ffprobe, "-v", "error", "-select_streams", "a:0",
                              "-read_intervals", "%+#12", "-show_packets", "-of", "json", str(video)])
    first_audio_packets = json.loads(first_packet_probe.stdout).get("packets", [])[:4]
    check((int(v["width"]), int(v["height"])) == (1920, 1080), "Video is not 1920x1080")
    check(abs(fps - 30) < 1e-9, "Video average frame rate is not 30 fps")
    check(float(Fraction(v["r_frame_rate"])) == 30, "Video nominal frame rate is not 30 fps")
    check(nb_frames == EXPECTED["frames"], "MP4 frame count differs from 10702")
    check(abs(video_seconds - expected_seconds) <= 1 / 30 + .001, "Video duration differs from frame timeline")
    check(int(a["sample_rate"]) == 48000 and int(a["channels"]) == 2, "Audio is not 48 kHz stereo")
    check(abs(audio_start - video_start) <= 1 / 30, "Audio/video starting timestamps are out of sync")
    check(abs(audio_seconds - video_seconds) <= 2 / 30, "Audio/video stream duration drift exceeds two frames")

    # One complete, strict decoding pass scans every video and audio frame.
    # loudnorm's input_tp measures decoded AAC true peak with oversampling.
    decode = run([ffmpeg, "-hide_banner", "-nostdin", "-xerror", "-progress", "pipe:1", "-nostats",
                  "-i", str(video), "-map", "0:v:0", "-map", "0:a:0",
                  "-vf", "blackdetect=d=0.10:pix_th=0.02:pic_th=0.985",
                  "-af", "silencedetect=noise=-50dB:d=1.20,loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json",
                  "-f", "null", "-"], check=False)
    (QA / "decode-black-silence-loudness-v13.log").write_text(decode.stderr, encoding="utf-8")
    (QA / "decode-progress-v13.log").write_text(decode.stdout, encoding="utf-8")
    decoded_frames = [int(x) for x in re.findall(r"^frame=(\d+)\s*$", decode.stdout, re.M)]
    complete = decode.returncode == 0 and "progress=end" in decode.stdout
    check(complete, "Complete strict audio/video decode did not finish successfully")
    check(bool(decoded_frames) and decoded_frames[-1] == EXPECTED["frames"], "Complete decoding did not output 10702 frames")
    black = [{"startSeconds": float(s), "endSeconds": float(e), "durationSeconds": float(d)}
             for s, e, d in re.findall(r"black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)", decode.stderr)]
    check(not black, "Full scan found nearly black runs of at least 0.10 seconds")
    silence, open_silence = [], None
    for line in decode.stderr.splitlines():
        start = re.search(r"silence_start:\s*([\d.]+)", line)
        end = re.search(r"silence_end:\s*([\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)", line)
        if start:
            open_silence = float(start.group(1))
        if end:
            end_time, duration = map(float, end.groups())
            silence.append({"startSeconds": open_silence if open_silence is not None else end_time - duration,
                            "endSeconds": end_time, "durationSeconds": duration})
            open_silence = None
    if open_silence is not None:
        silence.append({"startSeconds": open_silence, "endSeconds": audio_seconds,
                        "durationSeconds": audio_seconds - open_silence})
    interior_silence = [s for s in silence if s["startSeconds"] > .20 and s["endSeconds"] < audio_seconds - .20]
    check(not interior_silence, "Full mix has unexpected interior silence longer than 1.20 seconds")
    loud_blocks = re.findall(r'\{\s*"input_i"\s*:.*?\}', decode.stderr, re.S)
    loudness = json.loads(loud_blocks[-1]) if loud_blocks else {}
    check(bool(loudness), "Decoded AAC loudness/true-peak measurement is missing")
    if loudness:
        integrated, true_peak = float(loudness["input_i"]), float(loudness["input_tp"])
        check(math.isfinite(integrated) and -25 <= integrated <= -10, "Integrated loudness is outside -25 to -10 LUFS")
        check(math.isfinite(true_peak) and true_peak <= -.5, "Decoded AAC true peak exceeds -0.5 dBTP")
        if true_peak > -1:
            warnings.append("Decoded AAC true peak is above -1 dBTP; consider extra output headroom.")

    # Compare AAC to the actual Audio element's master in six short windows.
    # This catches global delay/drift; matching stream duration alone cannot.
    film = (ROOT / "src/V11RainbowArcFilm.tsx").read_text(encoding="utf-8")
    master_match = re.search(r"<Audio\b[^>]*staticFile\(['\"]([^'\"]+)", film)
    check(master_match is not None, "Cannot determine the actual narration master from the active film")
    sync_windows, master_info = [], None
    if master_match:
        master = ROOT / "public" / master_match.group(1)
        check(master.exists(), "Active audio master does not exist")
        if master.exists():
            pcm_metadata = json.loads(run([ffprobe, "-v", "error", "-select_streams", "a:0",
                                           "-show_streams", "-of", "json", str(master)]).stdout)["streams"][0]
            master_rate, master_channels = int(pcm_metadata["sample_rate"]), int(pcm_metadata["channels"])
            master_duration = Fraction(int(pcm_metadata["duration_ts"])) * Fraction(pcm_metadata["time_base"])
            master_samples = master_duration * master_rate
            check(master_samples.denominator == 1, "Source master duration does not contain an exact whole sample count")
            master_info = {"file": str(master), "sha256": sha256(master), "sampleRate": master_rate,
                           "channels": master_channels, "samples": int(master_samples), "seconds": float(master_duration)}
            check(int(master_samples) == EXPECTED["frames"] * 1600 and master_channels == 2,
                  "Source master length/channels differ from the final 30fps frame timeline")
            for start in [0, 60, 120, 240, 340, expected_seconds - 4.25]:
                segment = subprocess.run([ffmpeg, "-v", "error", "-ss", f"{start:.6f}", "-i", str(video),
                                          "-t", "4", "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"],
                                         capture_output=True, check=True).stdout
                decoded = np.frombuffer(segment, dtype="<f4").astype(np.float64)
                reference_bytes = subprocess.run([ffmpeg, "-v", "error", "-ss", f"{start:.6f}", "-i", str(master),
                                                   "-t", "4", "-vn", "-ac", "1", "-ar", "48000", "-f", "f32le", "pipe:1"],
                                                  capture_output=True, check=True).stdout
                reference = np.frombuffer(reference_bytes, dtype="<f4").astype(np.float64)
                check(master_rate == 48000, "Source master sample rate differs from AAC")
                n = min(len(decoded), len(reference))
                x, y = decoded[:n:8], reference[:n:8]
                x, y = x - x.mean(), y - y.mean()
                size = 1 << (len(x) + len(y) - 1).bit_length()
                corr = np.fft.irfft(np.fft.rfft(x, size) * np.fft.rfft(y[::-1], size), size)
                middle, search = len(y) - 1, 1200  # +/-200 ms at 6 kHz
                peak = middle - search + int(np.argmax(corr[middle - search:middle + search + 1]))
                lag_samples = peak - middle
                coefficient = float(corr[peak] / max(1e-12, np.linalg.norm(x) * np.linalg.norm(y)))
                lag_ms = lag_samples / 6000 * 1000
                sync_windows.append({"startSeconds": start, "lengthSeconds": n / 48000,
                                     "lagMilliseconds": lag_ms, "correlation": coefficient})
                check(abs(lag_ms) <= 1000 / 30 and coefficient > .85,
                      f"AAC/source-master sync mismatch in the window at {start:.3f}s")

    # Sample entry, middle and exit of each registered transition every six
    # frames, plus optical lesson beats and the references landing sequence.
    transitions = json.loads((ROOT / "src/transitions-v11.json").read_text(encoding="utf-8"))
    definitions = {c["id"]: c for c in transitions["clips"]}
    groups: dict[str, list[int]] = {}

    def frame_range(start: int, end: int, step: int = 6) -> list[int]:
        return sorted({max(0, min(EXPECTED["frames"] - 1, x)) for x in range(start, end + 1, step)})

    for clip in source["qwen"]:
        first, last = clip["sourceRange"]
        tr = definitions[clip["id"]]["transition"]
        groups[f'{clip["id"]}_entry'] = frame_range(first - 12, first + tr["enterFrames"] + 12)
        groups[f'{clip["id"]}_exit'] = frame_range(last - tr["exitFrames"] - 12, last + 12)
        groups[f'{clip["id"]}_complete_source'] = frame_range(first, last)
    sec_to_frame = lambda t: round(t * EXPECTED["fps"])
    for clip_id in ["r006", "r008", "r010", "r011", "r013", "r014", "r042", "r043"]:
        c = next((c for c in timeline["clips"] if c["id"] == clip_id), None)
        if c:
            first, last = sec_to_frame(c["start"]), sec_to_frame(c["end"])
            groups[clip_id] = [first + 12, (first + last) // 2, max(first, last - 12)]
    for cue in source.get("world", {}).get("contactChecks", []):
        frame = cue["arrivalFrame"]
        groups[f'interface_contact_{cue["pointIndex"]}'] = frame_range(frame - 12, frame + 30)
    ref = next(s for s in timeline["scenes"] if s["id"] == "references")
    ref_start = sec_to_frame(ref["start"])
    groups["references_landing"] = sorted(set(frame_range(ref_start, min(ref_start + 60, EXPECTED["frames"] - 1), 12)
                                                + [(ref_start + EXPECTED["frames"] - 1) // 2, EXPECTED["frames"] - 1]))
    groups["whole_film_chapters"] = sorted(set(sec_to_frame((s["start"] + s["end"]) / 2) for s in timeline["scenes"]))
    # Review every scene relay, not only the Qwen interfaces. Optical models,
    # projected labels and paper surface must agree across each rail join.
    for scene in timeline["scenes"][1:]:
        edge = sec_to_frame(scene["start"])
        groups[f'scene_relay_{scene["id"]}'] = frame_range(edge - 24, edge + 30)
    groups["editorial_keyframes"] = [56, 110, 150, 200, 1247, 1450, 2316, 2484, 2668,
                                     3162, 3568, 3795, 5000, 6004, 7030, 8005, 9124]
    for metric in ["translationPeakFrame", "rotationPeakFrame"]:
        edge = int(source.get("camera", {}).get(metric, 0))
        groups[f'camera_{metric}'] = frame_range(edge - 18, edge + 18, 3)
    groups["coda_full_sequence"] = sorted(set(frame_range(ref_start, EXPECTED["frames"] - 1, 6)
                                               + [EXPECTED["frames"] - 1]))
    selected = sorted(set(f for frames in groups.values() for f in frames))
    stills = QA / "delivery-stills-v13"
    stills.mkdir(exist_ok=True)
    select = "select=" + "+".join(f"eq(n\\,{f})" for f in selected)
    run([ffmpeg, "-v", "error", "-y", "-i", str(video), "-an", "-vf", select,
         "-fps_mode", "passthrough", "-frames:v", str(len(selected)), "-q:v", "2", str(stills / "sequence-%06d.jpg")])
    for number, frame in enumerate(selected, 1):
        (stills / f"sequence-{number:06d}.jpg").replace(stills / f"frame-{frame:05d}.jpg")
    font_file = Path("C:/Windows/Fonts/msyh.ttc")
    font = ImageFont.truetype(str(font_file), 19) if font_file.exists() else ImageFont.load_default()
    sheets, samples, changes = [], {}, []
    for frame in selected:
        with Image.open(stills / f"frame-{frame:05d}.jpg") as im:
            image = np.asarray(im.convert("RGB"), dtype=np.uint8)
            samples[frame] = {"frame": frame, "seconds": frame / 30, "meanRGB": float(image.mean()),
                              "nearlyBlackPixelFraction": float((image.mean(axis=2) < 5).mean())}
    for group, frames in groups.items():
        columns, width, height, label = 4, 480, 270, 32
        sheet = Image.new("RGB", (columns * width, math.ceil(len(frames) / columns) * (height + label)), "#eaf1ed")
        draw, previous = ImageDraw.Draw(sheet), None
        for i, frame in enumerate(frames):
            with Image.open(stills / f"frame-{frame:05d}.jpg") as im:
                thumb = im.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
                small = np.asarray(im.convert("RGB").resize((320, 180)), dtype=np.int16)
            x, y = (i % columns) * width, (i // columns) * (height + label)
            sheet.paste(thumb, (x, y))
            draw.text((x + 10, y + height + 4), f"{group}  F{frame:05d}  {frame / 30:.2f}s", fill="#203d45", font=font)
            if previous is not None:
                delta = float(np.abs(small - previous[1]).mean())
                if frame - previous[0] <= 12 and delta > 18:
                    changes.append({"group": group, "fromFrame": previous[0], "toFrame": frame,
                                    "thumbnailMeanAbsoluteRGBChange": delta})
            previous = (frame, small)
        destination = QA / f"contact-v13-{group}.jpg"
        sheet.save(destination, quality=93, subsampling=0)
        sheets.append({"group": group, "frames": frames, "file": str(destination), "sha256": sha256(destination)})
    if changes:
        warnings.append("Some six-frame contact samples have large image changes; inspect the listed sheets for spatial continuity.")
    check(all(s["nearlyBlackPixelFraction"] < .985 for s in samples.values()), "Contact samples include a nearly black frame")
    # A central 9:16 subject preview is a visual aid, not an automatic safe
    # crop verdict. The 16:9 narration subtitles deliberately need reflow.
    crop_frames = groups["whole_film_chapters"]
    crop_width = round(EXPECTED["height"] * 9 / 16)
    crop_left = (EXPECTED["width"] - crop_width) // 2
    thumb_width, thumb_height, columns, label = 304, 540, 4, 34
    crop_sheet = Image.new("RGB", (columns * thumb_width,
                            math.ceil(len(crop_frames) / columns) * (thumb_height + label)), "#eaf1ed")
    crop_draw = ImageDraw.Draw(crop_sheet)
    for i, frame in enumerate(crop_frames):
        with Image.open(stills / f"frame-{frame:05d}.jpg") as im:
            crop = im.convert("RGB").crop((crop_left, 0, crop_left + crop_width, EXPECTED["height"]))
            crop = crop.resize((thumb_width, thumb_height), Image.Resampling.LANCZOS)
        x, y = (i % columns) * thumb_width, (i // columns) * (thumb_height + label)
        crop_sheet.paste(crop, (x, y))
        crop_draw.text((x + 8, y + thumb_height + 5), f"F{frame:05d}  {frame / 30:.2f}s", fill="#203d45", font=font)
    crop_destination = QA / "contact-v13-central-9x16-subjects.jpg"
    crop_sheet.save(crop_destination, quality=93, subsampling=0)
    crop_preview = {"file": str(crop_destination), "sha256": sha256(crop_destination), "frames": crop_frames,
                    "crop": {"left": crop_left, "width": crop_width, "height": EXPECTED["height"]},
                    "scope": "Central subject preview only. Subtitle, brand and reference-page layout require deliberate 9:16 reflow for a separate vertical delivery."}
    check(sha256(video) == initial_video_hash, "Delivery file changed while it was being audited")
    check(sha256(source_path) == initial_source_audit_hash, "Source audit changed while delivery checks ran")
    source_changed_after = [x["file"] for x in source["sourceHashes"]
                            if not (ROOT / x["file"]).is_file()
                            or sha256(ROOT / x["file"]) != x["sha256"]]
    check(not source_changed_after, "Source changed while delivery checks ran")
    inputs_changed_after = [x["file"] for x in input_hashes
                            if not (ROOT / x["file"]).is_file()
                            or sha256(ROOT / x["file"]) != x["sha256"]]
    check(not inputs_changed_after, "Static inputs changed while delivery checks ran")
    report = {"version": "V13", "createdUTC": datetime.now(timezone.utc).isoformat(), "passed": not errors,
              "status": "pass" if not errors else "fail",
              "encodedFullDecodePassed": complete and bool(decoded_frames) and decoded_frames[-1] == EXPECTED["frames"],
              "visualReviewApproved": False,
              "video": str(video), "videoSHA256": initial_video_hash, "videoBytes": video.stat().st_size,
              "expected": EXPECTED, "actual": {"width": int(v["width"]), "height": int(v["height"]),
              "fps": fps, "metadataFrames": nb_frames, "decodedFrames": decoded_frames[-1] if decoded_frames else None,
              "videoSeconds": video_seconds, "audioSeconds": audio_seconds, "startTimestampDeltaSeconds": audio_start - video_start,
              "durationDeltaSeconds": audio_seconds - video_seconds, "sampleRate": int(a["sample_rate"]), "channels": int(a["channels"])},
              "completeDecode": {"passed": complete, "exitCode": decode.returncode}, "blackRuns": black,
              "silenceRuns": silence, "decodedAACInputLoudness": loudness, "audioMaster": master_info,
              "firstAACPackets": first_audio_packets,
              "masterAACSyncWindows": sync_windows, "sourceAudit": {"file": str(source_path), "sha256": initial_source_audit_hash,
              "createdUTC": source["createdUTC"], "sourceHashes": source["sourceHashes"]},
              "staticInputHashes": input_hashes,
              "auditScriptSHA256": sha256(Path(__file__)), "contactSheets": sheets, "sampleFrames": list(samples.values()),
              "centralCropPreview": crop_preview, "editorialSourceContract": editorial,
              "environmentSourceContract": source.get("environment"),
              "largeThumbnailChangesForReview": changes, "errors": errors, "warnings": warnings,
              "humanListeningChecked": False, "humanFullVisualReviewChecked": False,
              "scope": "Complete automatic decoding/black/silence/loudness scan, stream synchronization, sampled AAC-to-master correlation, and frame-exact contact sheets. Contact generation is not full manual watching/listening. Source hashes identify the audited current source snapshot; render-start provenance must be preserved separately."}
    (QA / "delivery-qa-v13.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    note = (f"# V13 completed-delivery checks\n\nStatus: {'PASS' if report['passed'] else 'FAIL'}\n\n"
            f"Video SHA256: `{initial_video_hash}`\n\n"
            f"{v['width']}×{v['height']}, {fps:g} fps, {nb_frames} metadata frames / "
            f"{report['actual']['decodedFrames']} completely decoded frames. Audio: {a['sample_rate']} Hz, {a['channels']} channels.\n\n"
            f"AAC input loudness: {loudness.get('input_i', 'unavailable')} LUFS; true peak: {loudness.get('input_tp', 'unavailable')} dBTP.\n\n"
            f"Contact sheets: {len(sheets)} groups / {len(selected)} unique frames.\n\n"
            f"{report['scope']}\n\n")
    if errors:
        note += "Errors:\n\n" + "\n".join("- " + x for x in errors) + "\n\n"
    if warnings:
        note += "Review notes:\n\n" + "\n".join("- " + x for x in warnings) + "\n\n"
    (QA / "delivery-qa-v13.md").write_text(note, encoding="utf-8")
    print(json.dumps({"passed": report["passed"], "errors": errors, "warnings": warnings,
                      "actual": report["actual"], "completeDecode": report["completeDecode"],
                      "blackRuns": len(black), "silenceRuns": len(silence), "loudness": loudness,
                      "syncWindows": sync_windows, "contactGroups": len(sheets), "sampleFrames": len(selected),
                      "videoSHA256": initial_video_hash, "report": str(QA / "delivery-qa-v13.json")},
                     ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
