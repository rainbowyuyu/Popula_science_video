"""Audit the completed V16 MP4 and produce frame-exact visual review sheets.

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
import wave
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / "research" / "qa-v16"
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


def tool_path(name: str) -> str | None:
    configured = shutil.which(name)
    if configured:
        return configured
    fallback = Path("C:/ffmpeg/bin") / (name + ".exe")
    return str(fallback) if fallback.is_file() else None


def resolve_media(value: str | Path) -> Path:
    """Resolve actual project/public media without assuming old cue locations.

    The first existing candidate wins. No unrelated version directory is
    searched and no file is copied into a missing authored location.
    """
    p = Path(str(value).replace("\\", "/"))
    if p.is_absolute():
        return p.resolve()
    candidates = [ROOT / p]
    if p.parts and p.parts[0].lower() == "public":
        candidates.append(ROOT / "public" / Path(*p.parts[1:]))
    else:
        candidates.append(ROOT / "public" / p)
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    return candidates[0].resolve()


def normalize_hash_rows(rows: list[dict]) -> list[dict]:
    normalized = []
    for row in rows:
        file, digest = row.get("file", row.get("path")), row.get("sha256")
        if not file or not isinstance(digest, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", digest):
            raise ValueError("Malformed dependency hash row in current V16 provenance")
        normalized.append({"file": str(file).replace("\\", "/"), "sha256": digest.lower()})
    if len({x["file"] for x in normalized}) != len(normalized):
        raise ValueError("Duplicate dependency paths in provenance hash snapshot")
    return normalized


def manifest_range(definition: dict, timeline: dict) -> tuple[int, int]:
    """Actual zero-based film range from the current transition manifest."""
    if "sourceRange" in definition:
        first, last = map(int, definition["sourceRange"])
    elif "startFrame" in definition:
        first = int(definition["startFrame"])
        last = int(definition["endFrame"]) if "endFrame" in definition else first + int(definition["frames"]) - 1
    else:
        anchor = definition.get("anchor", {})
        kind = anchor.get("kind", "frame")
        if kind == "frame":
            first = int(anchor.get("offsetFrames", definition.get("fromFrame", 0)))
        elif kind in ("scene", "clip"):
            collection = timeline["scenes" if kind == "scene" else "clips"]
            key = anchor.get("id", anchor.get("scene", anchor.get("clip")))
            item = next(x for x in collection if x["id"] == key)
            first = math.floor(float(item["start"]) * timeline["fps"] + .5) + int(anchor.get("offsetFrames", 0))
        else:
            raise ValueError("Unsupported current manifest anchor: " + str(kind))
        last = first + int(definition["frames"]) - 1
    if not 0 <= first <= last < EXPECTED["frames"]:
        raise ValueError("Transition source range is outside the final film: " + str(definition.get("id")))
    return first, last


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    config_path = ROOT / "work/output-root-v16.json"
    configured = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {"outputRoot": str(ROOT / "output-v16")}
    parser.add_argument("--source-audit", type=Path, default=QA / "audit-v16.json")
    parser.add_argument("--render-record", type=Path, default=QA / "render-start-v16.json")
    parser.add_argument("--manifest", type=Path, default=ROOT / "src/transitions-v11.json")
    parser.add_argument("--master", type=Path, help="Optional exact master; must agree with active Audio element")
    parser.add_argument("--video", type=Path,
                        default=Path(configured["outputRoot"]) / "delivery/彩虹为什么是弧形_V16_1080p.mp4")
    args = parser.parse_args()
    video = args.video.resolve()
    if not video.is_file():
        raise FileNotFoundError(f"Completed V16 delivery does not exist: {video}")
    QA.mkdir(parents=True, exist_ok=True)
    ffmpeg, ffprobe = tool_path("ffmpeg"), tool_path("ffprobe")
    if not ffmpeg or not ffprobe:
        raise RuntimeError("ffmpeg and ffprobe must be available on PATH")
    errors, warnings = [], []

    def check(condition: bool, message: str) -> bool:
        if not condition:
            errors.append(message)
        return bool(condition)

    source_path = args.source_audit.resolve()
    if not source_path.exists():
        raise FileNotFoundError("Run node scripts/audit-v16.mjs against the final source first")
    source = json.loads(source_path.read_text(encoding="utf-8"))
    source["sourceHashes"] = normalize_hash_rows(source.get("sourceHashes", []))
    check(bool(source["sourceHashes"]), "Current source audit has no dependency hashes")
    check(source.get("version") == "V16" and source.get("passed") is True,
          "Current V16 source audit has not passed")
    check(source.get("diagnosticOnly") is not True,
          "A diagnostic source report cannot authorize a final delivery")
    source_changed = [x["file"] for x in source["sourceHashes"]
                      if not (ROOT / x["file"]).is_file()
                      or sha256(ROOT / x["file"]) != x["sha256"]]
    check(not source_changed, "Source audit snapshot is stale: " + ", ".join(source_changed))
    input_hashes = normalize_hash_rows(source.get("assets", {}).get("staticAssetHashes", []))
    if not input_hashes:
        warnings.append("Source audit has no separate staticAssetHashes array; actual input coverage depends on sourceHashes. No old asset schema was assumed.")
    inputs_changed = [x["file"] for x in input_hashes
                      if not (ROOT / x["file"]).is_file()
                      or sha256(ROOT / x["file"]) != x["sha256"]]
    check(not inputs_changed, "Source audit input snapshot is stale: " + ", ".join(inputs_changed))
    initial_source_audit_hash = sha256(source_path)
    initial_video_hash = sha256(video)
    render_record_path = args.render_record.resolve()
    if not render_record_path.is_file():
        raise FileNotFoundError("Completed V16 render-start provenance is required")
    render_record_bytes = render_record_path.read_bytes()
    render_record = json.loads(render_record_bytes)
    if render_record.get("status") != "completed":
        raise RuntimeError("V16 render is not completed; final encoded checks are prohibited until completion")
    check(render_record.get("version") == "V16" and render_record.get("status") == "completed",
          "V16 render-start record has not completed")
    check(Path(render_record.get("output", "")).resolve() == video,
          "Delivery video differs from the completed render's output")
    check(render_record.get("videoSHA256") == initial_video_hash,
          "Delivery bytes differ from the completed render's video hash")
    check(render_record.get("sourceAuditSHA256") == initial_source_audit_hash,
          "Delivery source audit differs from the frozen render-start audit")
    check({x["file"]: x["sha256"] for x in normalize_hash_rows(render_record.get("sourceHashes", []))}
          == {x["file"]: x["sha256"] for x in source["sourceHashes"]},
          "Completed render and current source audit have different dependency snapshots")
    timeline = json.loads((ROOT / "src/timeline.json").read_text(encoding="utf-8"))
    check(timeline["duration"] == EXPECTED["frames"] and timeline["fps"] == EXPECTED["fps"],
          "V16 source duration/fps differs from requested delivery")
    # Source schemas grow independently. Hash identity and passed/version are
    # mandatory; old V15 character/garden field names are not V16 contracts.
    editorial = source.get("editorial", {})
    gaussian = source.get("gaussian", {})
    character = source.get("character", {})
    references_start = math.floor(next(x["start"] for x in timeline["scenes"]
                                      if x["id"] == "references") * timeline["fps"] + .5)
    expected_seconds = EXPECTED["frames"] / EXPECTED["fps"]
    narration_contracts = []
    for cue in timeline["clips"]:
        cue_path = resolve_media(cue["audio"])
        with wave.open(str(cue_path), "rb") as source_wave:
            sample_rate, samples = source_wave.getframerate(), source_wave.getnframes()
        if cue.get("audioSHA256"):
            check(sha256(cue_path) == cue["audioSHA256"], "Narration cue hash differs from the authored timeline: " + cue["id"])
        check(sample_rate == 48000 and samples == cue.get("samples"),
              "Narration source duration differs from the authored complete cue: " + cue["id"])
        end_sample = int(cue["startSample"]) + samples
        check(abs(float(cue["start"]) * 48000 - int(cue["startSample"])) < .51
              and abs(float(cue["end"]) * 48000 - end_sample) < .51,
              "Narration cue timing loses samples at start/end: " + cue["id"])
        check(end_sample <= EXPECTED["frames"] * 1600,
              "Narration cue extends beyond final master: " + cue["id"])
        narration_contracts.append({"id": cue["id"], "file": str(cue_path), "samples": samples,
                                    "sampleRate": sample_rate, "startSample": int(cue["startSample"]),
                                    "endSampleExclusive": end_sample})

    metadata_result = run([ffprobe, "-v", "error", "-show_streams", "-show_format",
                           "-of", "json", str(video)])
    metadata = json.loads(metadata_result.stdout)
    (QA / "ffprobe-delivery-v16.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    v = next(x for x in metadata["streams"] if x["codec_type"] == "video")
    a = next(x for x in metadata["streams"] if x["codec_type"] == "audio")
    fps = float(Fraction(v["avg_frame_rate"]))
    video_seconds, audio_seconds = float(v["duration"]), float(a["duration"])
    video_start, audio_start = float(v.get("start_time", 0)), float(a.get("start_time", 0))
    nb_frames = int(v.get("nb_frames", 0))
    first_packet_probe = run([ffprobe, "-v", "error", "-select_streams", "a:0",
                              "-read_intervals", "%+#12", "-show_packets", "-of", "json", str(video)])
    first_audio_packets = json.loads(first_packet_probe.stdout).get("packets", [])[:4]
    first_packet = first_audio_packets[0] if first_audio_packets else {}
    skip_entries = [x for x in first_packet.get("side_data_list", [])
                    if x.get("side_data_type") == "Skip Samples"]
    priming_samples = int(skip_entries[0].get("skip_samples", 0)) if skip_entries else 0
    first_audio_pts = float(first_packet.get("pts_time", "nan"))
    check(a.get("codec_name") == "aac", "Final audio codec is not AAC")
    check(priming_samples == 1024, "Final AAC has no declared 1024-sample encoder priming")
    check(math.isfinite(first_audio_pts)
          and abs(first_audio_pts + priming_samples / EXPECTED["audioSampleRate"]) <= 1 / 48000 + 1e-6,
          "AAC first packet timestamp is inconsistent with declared priming")
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
    (QA / "decode-black-silence-loudness-v16.log").write_text(decode.stderr, encoding="utf-8")
    (QA / "decode-progress-v16.log").write_text(decode.stdout, encoding="utf-8")
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

    tail_raw = subprocess.run([ffmpeg, "-v", "error", "-ss", f"{expected_seconds - .25:.9f}",
                               "-i", str(video), "-t", "0.25", "-vn", "-ac", "1", "-ar", "48000",
                               "-f", "f32le", "pipe:1"], capture_output=True, check=True).stdout
    tail_pcm = np.frombuffer(tail_raw, dtype="<f4").astype(np.float64)
    check(tail_pcm.size >= 2352, "Decoded final AAC window is missing its terminal 49ms")
    terminal = tail_pcm[-2400:]
    terminal_peak = float(np.max(np.abs(terminal))) if terminal.size else float("inf")
    terminal_rms = float(np.sqrt(np.mean(terminal * terminal))) if terminal.size else float("inf")
    terminal_edge = float(abs(tail_pcm[-1])) if tail_pcm.size else float("inf")
    check(terminal_peak <= .04 and terminal_rms <= .01 and terminal_edge <= .01,
          "Final decoded AAC has a loud terminal edge; inspect the ending for an abrupt cut")
    tail_metrics = {"windowStartSeconds": expected_seconds - .25, "decodedSamples": int(tail_pcm.size),
                    "terminalWindowSamples": int(terminal.size), "terminalPeak": terminal_peak,
                    "terminalRMS": terminal_rms, "lastSampleToSilenceEdge": terminal_edge,
                    "scope": "Numeric terminal-edge and complete cue-duration checks only; not human listening or semantic speech completeness."}
    last_five_raw = subprocess.run([ffmpeg, "-v", "error", "-ss", f"{expected_seconds-5:.9f}",
                                   "-i", str(video), "-t", "5", "-vn", "-ac", "1", "-ar", "48000",
                                   "-f", "f32le", "pipe:1"], capture_output=True, check=True).stdout
    last_five = np.frombuffer(last_five_raw, dtype="<f4").astype(np.float64)
    check(last_five.size >= 5 * 48000 - 1024,
          "Final five-second decoded AAC window is truncated beyond one codec frame")
    last_five_envelope = []
    for first in range(0, len(last_five), 12000):
        chunk = last_five[first:first + 12000]
        last_five_envelope.append({"startSeconds": expected_seconds-5+first/48000,
                                   "samples": int(len(chunk)), "peak": float(np.max(np.abs(chunk))),
                                   "rms": float(np.sqrt(np.mean(chunk*chunk)))})
    tail_metrics["lastFiveSeconds"] = {"startSeconds": expected_seconds-5,
                                      "decodedSamples": int(len(last_five)), "quarterSecondEnvelope": last_five_envelope,
                                      "humanListeningPerformed": False}

    # Compare AAC to the actual Audio element's master in six short windows.
    # This catches global delay/drift; matching stream duration alone cannot.
    film = (ROOT / "src/V11RainbowArcFilm.tsx").read_text(encoding="utf-8")
    master_match = re.search(r"<Audio\b[^>]*staticFile\(['\"]([^'\"]+)", film)
    authored_master = timeline.get("audio", {}).get("master")
    master_value = str(args.master) if args.master else authored_master or (master_match.group(1) if master_match else None)
    check(master_value is not None, "Cannot determine the actual master from timeline.audio.master or active Audio element")
    sync_windows, master_info = [], None
    if master_value:
        master = resolve_media(master_value)
        check(master.exists(), "Active audio master does not exist")
        if master_match:
            check(resolve_media(master_match.group(1)) == master, "Timeline master and actual Audio element differ")
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
            for start in [0, 60, 120, 240, 340, expected_seconds - 5, expected_seconds - 4.25]:
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
                check(n >= 48000 * 3.9, f"Decoded/source audio comparison window is incomplete at {start:.3f}s")
                if n < 48000:
                    continue
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
    transitions_path = args.manifest.resolve()
    transitions = json.loads(transitions_path.read_text(encoding="utf-8"))
    transition_hash = sha256(transitions_path)
    definitions = {c["id"]: c for c in transitions["clips"]}
    groups: dict[str, list[int]] = {}

    def frame_range(start: int, end: int, step: int = 6) -> list[int]:
        return sorted({max(0, min(EXPECTED["frames"] - 1, x)) for x in range(start, end + 1, step)})

    for definition in transitions["clips"]:
        first, last = manifest_range(definition, timeline)
        safe_id = re.sub(r"[^A-Za-z0-9_-]", "_", definition["id"])
        groups[f'{safe_id}_entry_every_frame'] = frame_range(first - 6, first + 6, 1)
        groups[f'{safe_id}_exit_every_frame'] = frame_range(last - 6, last + 6, 1)
        groups[f'{safe_id}_native_span'] = sorted(set(frame_range(first, last, 12) + [first, last]))
    sec_to_frame = lambda t: math.floor(float(t) * EXPECTED["fps"] + .5)
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
    for chapter in timeline["scenes"]:
        first, last = sec_to_frame(chapter["start"]), min(EXPECTED["frames"]-1, sec_to_frame(chapter["end"])-1)
        groups[f'scene_key_{chapter["id"]}'] = sorted(set([min(last,first+12), (first+last)//2, max(first,last-12)]))
    # Review every scene relay, not only the Qwen interfaces. Optical models,
    # projected labels and paper surface must agree across each rail join.
    for scene in timeline["scenes"][1:]:
        edge = sec_to_frame(scene["start"])
        groups[f'scene_relay_{scene["id"]}'] = frame_range(edge - 24, edge + 30)
    groups["editorial_keyframes"] = [56, 110, 150, 200, 1247, 1450, 2316, 2484, 2668,
                                     3162, 3568, 3795, 5000, 6004, 7030, 8005, 9124]
    for focus in [610, 3570, 3900, 8005, 8830, 10150]:
        groups[f'v16_requested_focus_{focus:05d}'] = frame_range(focus-6, focus+6, 1)
    caption_frames = sorted(set(sec_to_frame((cue["start"]+cue["end"])/2) for cue in timeline["captions"]))
    for i in range(0, len(caption_frames), 20):
        groups[f'caption_midpoints_page_{i//20:02d}'] = caption_frames[i:i+20]
    for metric in ["translationPeakFrame", "rotationPeakFrame"]:
        edge = int(source.get("camera", {}).get(metric, 0))
        groups[f'camera_{metric}'] = frame_range(edge - 18, edge + 18, 3)
    for metric in ["bonePeakFrame", "figurePeakFrame", "skinPeakFrame"]:
        if metric in character:
            edge = int(character[metric])
            groups[f'character_{metric}'] = frame_range(edge - 18, edge + 18, 3)
    groups["coda_cover_endpoint"] = [max(0, min(EXPECTED["frames"] - 1, ref_start + n))
                                      for n in [-2, -1, 0, 1, 23, 24, 25, 26]]
    groups["coda_full_sequence"] = sorted(set(frame_range(ref_start, EXPECTED["frames"] - 1, 6)
                                               + [EXPECTED["frames"] - 1]))
    groups["last_five_seconds"] = sorted(set(frame_range(EXPECTED["frames"]-150, EXPECTED["frames"]-1, 6) + [EXPECTED["frames"]-1]))
    groups = {name: sorted({max(0,min(EXPECTED["frames"]-1,int(f))) for f in frames})
              for name,frames in groups.items() if frames}
    selected = sorted(set(f for frames in groups.values() for f in frames))
    stills = QA / "delivery-stills-v16" / (initial_video_hash[:16] + "-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ"))
    stills.mkdir(parents=True, exist_ok=True)
    select = "select=" + "+".join(f"eq(n\\,{f})" for f in selected)
    run([ffmpeg, "-v", "error", "-y", "-i", str(video), "-an", "-vf", select,
         "-fps_mode", "passthrough", "-frames:v", str(len(selected)), "-q:v", "2", str(stills / "sequence-%06d.jpg")])
    sequence_files = sorted(stills.glob("sequence-*.jpg"))
    if len(sequence_files) != len(selected):
        raise RuntimeError(f"Exact decoded extraction yielded {len(sequence_files)} files for {len(selected)} planned frame indices")
    for number, frame in enumerate(selected, 1):
        (stills / f"sequence-{number:06d}.jpg").replace(stills / f"frame-{frame:05d}.jpg")
    font_file = Path("C:/Windows/Fonts/msyh.ttc")
    font = ImageFont.truetype(str(font_file), 19) if font_file.exists() else ImageFont.load_default()
    sheets, samples, changes = [], {}, []
    for frame in selected:
        with Image.open(stills / f"frame-{frame:05d}.jpg") as im:
            image = np.asarray(im.convert("RGB"), dtype=np.uint8)
            samples[frame] = {"frame": frame, "indexZeroBased": frame, "seconds": frame / 30,
                              "file": str(stills / f"frame-{frame:05d}.jpg"), "sha256": sha256(stills / f"frame-{frame:05d}.jpg"),
                              "actuallyViewed": False, "meanRGB": float(image.mean()),
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
        destination = stills / f"contact-v16-{group}.jpg"
        sheet.save(destination, quality=93, subsampling=0)
        sheets.append({"group": group, "frames": frames, "file": str(destination), "sha256": sha256(destination), "actuallyViewed": False})
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
    crop_destination = stills / "contact-v16-central-9x16-subjects.jpg"
    crop_sheet.save(crop_destination, quality=93, subsampling=0)
    crop_preview = {"file": str(crop_destination), "sha256": sha256(crop_destination), "frames": crop_frames,
                    "crop": {"left": crop_left, "width": crop_width, "height": EXPECTED["height"]},
                    "scope": "Central subject preview only. Subtitle, brand and reference-page layout require deliberate 9:16 reflow for a separate vertical delivery."}
    check(sha256(video) == initial_video_hash, "Delivery file changed while it was being audited")
    check(sha256(source_path) == initial_source_audit_hash, "Source audit changed while delivery checks ran")
    check(render_record_path.read_bytes() == render_record_bytes, "Completed render-start record changed during delivery checks")
    check(sha256(transitions_path) == transition_hash, "Current transition manifest changed during delivery checks")
    source_changed_after = [x["file"] for x in source["sourceHashes"]
                            if not (ROOT / x["file"]).is_file()
                            or sha256(ROOT / x["file"]) != x["sha256"]]
    check(not source_changed_after, "Source changed while delivery checks ran")
    inputs_changed_after = [x["file"] for x in input_hashes
                            if not (ROOT / x["file"]).is_file()
                            or sha256(ROOT / x["file"]) != x["sha256"]]
    check(not inputs_changed_after, "Static inputs changed while delivery checks ran")
    report = {"version": "V16", "createdUTC": datetime.now(timezone.utc).isoformat(), "passed": not errors,
              "status": "automatic-checks-pass-visual-review-pending" if not errors else "automatic-checks-fail",
              "encodedFullDecodePassed": complete and bool(decoded_frames) and decoded_frames[-1] == EXPECTED["frames"],
              "visualReviewApproved": False,
              "video": str(video), "videoSHA256": initial_video_hash, "videoBytes": video.stat().st_size,
              "expected": EXPECTED, "actual": {"width": int(v["width"]), "height": int(v["height"]),
              "fps": fps, "metadataFrames": nb_frames, "decodedFrames": decoded_frames[-1] if decoded_frames else None,
              "videoSeconds": video_seconds, "audioSeconds": audio_seconds, "startTimestampDeltaSeconds": audio_start - video_start,
              "durationDeltaSeconds": audio_seconds - video_seconds, "sampleRate": int(a["sample_rate"]), "channels": int(a["channels"])},
              "completeDecode": {"passed": complete, "exitCode": decode.returncode}, "blackRuns": black,
              "silenceRuns": silence, "decodedAACInputLoudness": loudness, "audioMaster": master_info,
              "decodedAACTail": tail_metrics, "narrationSourceContracts": narration_contracts,
              "firstAACPackets": first_audio_packets,
              "AACPriming": {"declaredSkipSamples": priming_samples, "firstPacketPTSSeconds": first_audio_pts,
                              "rate": EXPECTED["audioSampleRate"], "metadataValidated": priming_samples == 1024
                              and math.isfinite(first_audio_pts) and abs(first_audio_pts+1024/48000) <= 1/48000+1e-6},
              "masterAACSyncWindows": sync_windows, "sourceAudit": {"file": str(source_path), "sha256": initial_source_audit_hash,
              "createdUTC": source.get("createdUTC"), "sourceHashes": source["sourceHashes"]},
              "staticInputHashes": input_hashes,
              "renderRecord": {"file": str(render_record_path), "sha256": hashlib.sha256(render_record_bytes).hexdigest(),
                               "status": render_record.get("status"), "completedUTC": render_record.get("completedUTC")},
              "auditScriptSHA256": sha256(Path(__file__)), "contactSheets": sheets, "sampleFrames": list(samples.values()),
              "transitionManifest": {"file": str(transitions_path), "sha256": transition_hash,
                                     "version": transitions.get("version"), "clips": list(definitions)},
              "exactFrameExtraction": {"indexBase": 0, "method": "Sorted eq(n,index) select over decoded video, passthrough; no rounded-time seeking",
                                       "selectedFrames": selected, "extractedCount": len(sequence_files), "actuallyViewed": False},
              "centralCropPreview": crop_preview, "editorialSourceContract": editorial,
              "codaEndpointSourceContract": source.get("codaEndpoint"),
              "environmentSourceContract": source.get("environment"),
              "gaussianSourceContract": gaussian,
              "luxDropletSourceContract": source.get("luxDroplet"),
              "brandSourceContract": source.get("brand"),
              "characterSourceContract": character,
              "largeThumbnailChangesForReview": changes, "errors": errors, "warnings": warnings,
              "humanListeningChecked": False, "humanFullVisualReviewChecked": False,
              "scope": "Complete automatic decoding/black/silence/loudness scan, stream synchronization, sampled AAC-to-master correlation, and frame-exact contact sheets. Contact generation is not full manual watching/listening. Source hashes identify the audited current source snapshot; render-start provenance must be preserved separately."}
    (QA / "delivery-qa-v16.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    note = (f"# V16 completed-delivery checks\n\nStatus: {'PASS' if report['passed'] else 'FAIL'}\n\n"
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
    (QA / "delivery-qa-v16.md").write_text(note, encoding="utf-8")
    print(json.dumps({"passed": report["passed"], "errors": errors, "warnings": warnings,
                      "actual": report["actual"], "completeDecode": report["completeDecode"],
                      "blackRuns": len(black), "silenceRuns": len(silence), "loudness": loudness,
                      "syncWindows": sync_windows, "contactGroups": len(sheets), "sampleFrames": len(selected),
                      "videoSHA256": initial_video_hash, "report": str(QA / "delivery-qa-v16.json")},
                     ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
