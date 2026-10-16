"""Audit explicitly selected delivery files; never substitutes a previous render.

Example (run from v3):
  python scripts/qa_delivery_v6.py --narration work/audio-v6/narration.json \
    --captions work/audio-v6/captions.json --master work/audio-v6/master.wav \
    --narration-wav work/audio-v6/narration.wav --asset-root . \
    --cue-file-key workingAudioFile --raw-dir work/audio-v6/raw \
    --processing-dir work/audio-v6/processing --video delivery/example-v6.mp4

Dependencies: numpy, soundfile and ffprobe. Exit 1 includes missing inputs and
failed checks; the report is still written. No TTS or source file is modified.
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

import numpy as np
import soundfile as sf

ROOT = Path(__file__).resolve().parents[1]


def sha256(path):
    digest = hashlib.sha256()
    with Path(path).open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def json_read(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def wav_metadata(path):
    info = sf.info(path)
    return {"path": str(path), "sha256": sha256(path), "sampleRate": info.samplerate,
            "channels": info.channels, "frames": info.frames,
            "durationSec": info.frames / info.samplerate, "format": info.format,
            "subtype": info.subtype}


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for name in ("narration", "captions", "master", "video"):
        parser.add_argument("--" + name, type=Path, required=True)
    parser.add_argument("--narration-wav", type=Path, help="Defaults only to narration.wav beside the selected master.")
    parser.add_argument("--asset-root", type=Path, default=ROOT / "public")
    parser.add_argument("--cue-file-key", default="audioFile", help="Use workingAudioFile for unpublished V6 work assets.")
    parser.add_argument("--raw-dir", type=Path, help="Original clips {cueId}.wav; required to prove pre-processing length.")
    parser.add_argument("--processing-dir", type=Path, help="Processing records {cueId}.json with raw/output hashes and guards.")
    parser.add_argument("--source-manifest", type=Path, help="Optional {files:[{path,sha256}]} manifest; paths relative to manifest-root.")
    parser.add_argument("--manifest-root", type=Path, default=ROOT)
    parser.add_argument("--output", type=Path, default=ROOT / "research/delivery-qa-v6.json")
    parser.add_argument("--expected-version", type=int, default=5)
    parser.add_argument("--label", default="v6-delivery")
    parser.add_argument("--ffprobe", default="ffprobe")
    args = parser.parse_args()
    for key, value in vars(args).items():
        if isinstance(value, Path):
            setattr(args, key, value.resolve())
    args.narration_wav = args.narration_wav or args.master.with_name("narration.wav")
    return args


def audit(args):
    checks, assets, cue_rows = [], {}, []
    report = {"schema": "rainbow.dna.delivery-qa/v6", "checkedAt": datetime.now(timezone.utc).isoformat(),
              "label": args.label, "expectedVersion": args.expected_version,
              "inputs": {key: str(value) for key, value in vars(args).items() if isinstance(value, Path)},
              "cueFileKey": args.cue_file_key, "assets": assets, "cues": cue_rows, "checks": checks,
              "subjectiveListeningChecked": False, "renderedCaptionReadabilityChecked": False,
              "v6DeliveryVerified": False,
              "limits": ["RMS activity measures audible coverage, not word recognition or pronunciation.",
                         "Raw duration, processing provenance and exact clean-WAV insertion establish stored-clip preservation; they do not establish that TTS spoke every requested word.",
                         "Hashes fingerprint the actual selected assets. A supplied manifest is checked; hashes alone do not prove artistic provenance.",
                         "ffprobe verifies encoded stream layout and duration, not visual quality or whether the video contains the selected master waveform."]}

    def check(name, passed, detail=None):
        checks.append({"id": name, "pass": bool(passed), "detail": detail})

    def asset(path, role):
        path = Path(path)
        if not path.is_file():
            check(role + "-present", False, str(path))
            return False
        assets[str(path)] = {"roles": sorted(set(assets.get(str(path), {}).get("roles", []) + [role])),
                             "bytes": path.stat().st_size, "sha256": sha256(path)}
        return True

    asset(Path(__file__), "audit-script")
    present = {name: asset(getattr(args, name), name) for name in
               ("narration", "captions", "master", "video", "narration_wav")}
    narr = json_read(args.narration) if present["narration"] else {}
    cap_data = json_read(args.captions) if present["captions"] else []
    caps = cap_data if isinstance(cap_data, list) else cap_data.get("captions", [])
    cues = narr.get("cues", [])
    fps, duration = narr.get("fps", 30), narr.get("durationSec", 0)
    total_frames = round(duration * fps)
    report.update(actualNarrationVersion=narr.get("version"), fps=fps, durationSec=duration,
                  totalFrames=total_frames, cueCount=len(cues), captionCount=len(caps))
    check("selected-narration-version", narr.get("version") == args.expected_version, narr.get("version"))
    check("narration-layout", fps == 30 and duration > 0 and bool(cues) and abs(duration * fps - total_frames) < 1e-4,
          {"fps": fps, "durationSec": duration, "totalFrames": total_frames})
    check("declared-no-stretch", narr.get("timeStretch") is False, narr.get("timeStretch"))
    check("declared-no-truncation", narr.get("truncation") is not True, narr.get("truncation"))
    check("caption-list-nonempty", bool(caps), len(caps))
    check("cue-ids-unique", len({c.get("id") for c in cues}) == len(cues))
    check("caption-ids-unique", len({c.get("id") for c in caps}) == len(caps))
    cue_ids = {c.get("id") for c in cues}
    previous_end, maximum_chars = 0, 0
    caps_by_cue = {cue_id: [] for cue_id in cue_ids}
    for index, caption in enumerate(caps):
        key = str(caption.get("id", index))
        start, end, text = caption.get("startFrame"), caption.get("endFrame"), caption.get("text", "")
        valid_bounds = type(start) is int and type(end) is int
        check("caption-" + key + "-bounds", valid_bounds and 0 <= start < end <= total_frames,
              {"startFrame": start, "endFrame": end, "totalFrames": total_frames})
        check("caption-" + key + "-ordered-no-overlap", valid_bounds and start >= previous_end,
              {"previousEndFrame": previous_end, "startFrame": start})
        if valid_bounds:
            previous_end = end
        maximum_chars = max(maximum_chars, len(text))
        check("caption-" + key + "-length", bool(text.strip()) and len(text) <= 24,
              {"charactersIncludingPunctuation": len(text), "maximum": 24})
        cue_id = caption.get("cueId")
        check("caption-" + key + "-known-cue", cue_id in cue_ids, cue_id)
        if cue_id in caps_by_cue and valid_bounds:
            caps_by_cue[cue_id].append(caption)
    report["maximumCaptionCharacters"] = maximum_chars

    wave_data, wave_meta = None, None
    for role in ("master", "narration_wav"):
        if not present[role]:
            continue
        path = getattr(args, role)
        meta = wav_metadata(path)
        report[role] = meta
        check(role + "-wav-layout", meta["format"] in ("WAV", "WAVEX", "RF64") and
              meta["sampleRate"] == 48000 and meta["channels"] == 2, meta)
        check(role + "-sample-duration", meta["frames"] == round(duration * meta["sampleRate"]),
              {"actualFrames": meta["frames"], "expectedFrames": round(duration * meta["sampleRate"])})
        if role == "narration_wav":
            wave_data, _ = sf.read(path, dtype="float32", always_2d=True)
            wave_meta = meta

    active_seconds, covered_seconds, previous_cue_end = 0.0, 0.0, 0.0
    check("source-length-evidence-selected", args.raw_dir is not None and args.processing_dir is not None,
          "Use --raw-dir and --processing-dir for original-duration, guard and provenance checks.")
    for cue in cues:
        cue_id = str(cue["id"])
        start, end = float(cue["startSec"]), float(cue["endSec"])
        row = {"id": cue_id, "startSec": start, "endSec": end}
        cue_rows.append(row)
        check(cue_id + "-ordered-no-overlap", 0 <= previous_cue_end <= start < end <= duration,
              {"previousEndSec": previous_cue_end, "startSec": start, "endSec": end})
        previous_cue_end = end
        check(cue_id + "-cue-file-key", bool(cue.get(args.cue_file_key)), args.cue_file_key)
        if not cue.get(args.cue_file_key):
            continue
        path = (args.asset_root / cue[args.cue_file_key]).resolve()
        if not asset(path, cue_id + "-clean"):
            continue
        meta = wav_metadata(path)
        row["clean"] = meta
        clip, sr = sf.read(path, dtype="float32", always_2d=True)
        tolerance_sec = 1 / sr + 1e-6
        check(cue_id + "-clean-sample-rate", sr == 48000, sr)
        check(cue_id + "-window-preserves-full-clip", abs(end - start - meta["durationSec"]) <= tolerance_sec,
              {"clipDurationSec": meta["durationSec"], "windowDurationSec": end - start})
        check(cue_id + "-declared-measured-length", abs(float(cue.get("actualDuration", -1)) - meta["durationSec"]) <= tolerance_sec,
              {"declared": cue.get("actualDuration"), "measured": meta["durationSec"]})
        if wave_data is not None and wave_meta["sampleRate"] == sr:
            sample_start = round(start * sr)
            sample_end = sample_start + len(clip)
            fits = 0 <= sample_start < sample_end <= len(wave_data)
            check(cue_id + "-full-clip-fits-narration", fits, {"startSample": sample_start, "endSample": sample_end})
            difference = None
            channels_match = clip.shape[1] in (1, wave_data.shape[1])
            if fits and channels_match:
                difference = float(np.max(np.abs(wave_data[sample_start:sample_end] - clip)))
            # PCM24 decoding/rewriting can differ by one LSB; never fit away gain or a time shift.
            check(cue_id + "-exact-full-clip-in-narration", difference is not None and difference <= 2 / 8388608,
                  {"maxSampleDifference": difference, "tolerance": 2 / 8388608,
                   "comparedFrames": len(clip), "comparedChannels": wave_data.shape[1]})
            row["narrationMaxSampleDifference"] = difference
        else:
            check(cue_id + "-exact-full-clip-in-narration", False, "Missing narration WAV or sample-rate mismatch")

        cue_caps = caps_by_cue.get(cue_id, [])
        check(cue_id + "-captions-inside-cue", bool(cue_caps) and all(
            cap["startFrame"] / fps >= start - 1 / fps and cap["endFrame"] / fps <= end + 1 / fps
            for cap in cue_caps), {"cueStartSec": start, "cueEndSec": end,
                                 "captionFrames": [[cap["startFrame"], cap["endFrame"]] for cap in cue_caps]})
        check(cue_id + "-caption-source-text-complete", "".join(c["text"] for c in cue_caps) == cue.get("text", ""),
              {"sourceText": cue.get("text"), "captionText": "".join(c["text"] for c in cue_caps)})
        mono = clip.mean(axis=1)
        block = max(1, round(sr * .01))
        starts = np.arange(0, len(mono), block)
        lengths = np.minimum(block, len(mono) - starts)
        energy = np.sqrt(np.add.reduceat(mono.astype(np.float64) ** 2, starts) / lengths)
        threshold = max(.002, float(energy.max()) * .07)
        active = energy > threshold
        midpoints = start + (starts + lengths / 2) / sr
        shown = np.zeros(len(energy), dtype=bool)
        for caption in cue_caps:
            shown |= (midpoints >= caption["startFrame"] / fps) & (midpoints < caption["endFrame"] / fps)
        voiced_sec = float(lengths[active].sum() / sr)
        shown_sec = float(lengths[active & shown].sum() / sr)
        coverage = shown_sec / voiced_sec if voiced_sec else 0.0
        active_seconds += voiced_sec
        covered_seconds += shown_sec
        row.update(activeSeconds=voiced_sec, captionedActiveSeconds=shown_sec, activeCoverage=coverage,
                   activityThresholdRms=threshold, firstActiveSec=float(midpoints[active][0]) if active.any() else None,
                   lastActiveSec=float(midpoints[active][-1]) if active.any() else None)
        check(cue_id + "-active-caption-coverage", voiced_sec > 0 and coverage >= .95,
              {"coverage": coverage, "minimum": .95, "activeSeconds": voiced_sec})

        if args.raw_dir and args.processing_dir:
            raw_path, processing_path = args.raw_dir / (cue_id + ".wav"), args.processing_dir / (cue_id + ".json")
            raw_exists = asset(raw_path, cue_id + "-original")
            proc_exists = asset(processing_path, cue_id + "-processing")
            if raw_exists and proc_exists:
                raw, processing = wav_metadata(raw_path), json_read(processing_path)
                row["original"] = raw
                pre, post = processing.get("preGuardSec", 0), processing.get("postGuardSec", 0)
                expected = raw["durationSec"] + pre + post
                check(cue_id + "-original-plus-guards-length", abs(meta["durationSec"] - expected) <= max(1 / raw["sampleRate"], 1 / sr) + 1e-6,
                      {"originalSec": raw["durationSec"], "preGuardSec": pre, "postGuardSec": post,
                       "expectedSec": expected, "cleanSec": meta["durationSec"]})
                check(cue_id + "-raw-declared-length", abs(float(cue.get("rawDuration", -1)) - raw["durationSec"]) <= 1 / raw["sampleRate"] + 1e-6,
                      {"declared": cue.get("rawDuration"), "measured": raw["durationSec"]})
                check(cue_id + "-processing-no-stretch", processing.get("profile", {}).get("timeStretch") is False and
                      processing.get("preservedLengthSamples") is True,
                      {"timeStretch": processing.get("profile", {}).get("timeStretch"),
                       "preservedLengthSamples": processing.get("preservedLengthSamples")})
                check(cue_id + "-raw-hash-provenance", processing.get("originalRawSha256") == raw["sha256"],
                      {"expected": processing.get("originalRawSha256"), "actual": raw["sha256"]})
                check(cue_id + "-clean-hash-provenance", processing.get("outputSha256") == meta["sha256"],
                      {"expected": processing.get("outputSha256"), "actual": meta["sha256"]})

    aggregate = covered_seconds / active_seconds if active_seconds else 0.0
    report["coverage"] = {"aggregate": aggregate, "minimumPerCue": min((r["activeCoverage"] for r in cue_rows if "activeCoverage" in r), default=0),
                          "activeSeconds": active_seconds, "captionedActiveSeconds": covered_seconds,
                          "method": "10ms RMS bins above max(0.002, 7% peak clip RMS); weighted by bin sample count; active midpoint must fall in a caption for that cue. No endpoint or breath exemption."}
    check("aggregate-active-caption-coverage", active_seconds > 0 and aggregate >= .95, report["coverage"])

    if args.source_manifest and asset(args.source_manifest, "source-manifest"):
        manifest = json_read(args.source_manifest)
        entries = manifest.get("files", [])
        check("source-manifest-nonempty", bool(entries), len(entries))
        for index, entry in enumerate(entries):
            path = (args.manifest_root / entry["path"]).resolve()
            if asset(path, "manifest-" + str(index)):
                check("manifest-hash-" + str(index), assets[str(path)]["sha256"] == entry.get("sha256"),
                      {"path": str(path), "expected": entry.get("sha256"), "actual": assets[str(path)]["sha256"]})

    if present["video"]:
        command = [args.ffprobe, "-v", "error", "-show_entries",
                   "stream=index,codec_type,codec_name,width,height,r_frame_rate,avg_frame_rate,nb_frames,duration,start_time,sample_rate,channels:format=duration",
                   "-of", "json", str(args.video)]
        result = subprocess.run(command, capture_output=True, text=True, encoding="utf8", errors="replace", timeout=120)
        check("encoded-video-probe", result.returncode == 0, {"returnCode": result.returncode, "stderr": result.stderr[-3000:]})
        if result.returncode == 0:
            probe = json.loads(result.stdout)
            report["videoProbe"] = probe
            videos = [s for s in probe.get("streams", []) if s.get("codec_type") == "video"]
            audios = [s for s in probe.get("streams", []) if s.get("codec_type") == "audio"]
            check("encoded-stream-count", len(videos) == 1 and len(audios) == 1, {"video": len(videos), "audio": len(audios)})
            if videos and audios:
                video, audio = videos[0], audios[0]
                rate = float(Fraction(video.get("r_frame_rate", "0/1")))
                avg_rate = float(Fraction(video.get("avg_frame_rate", "0/1")))
                vd, ad = float(video.get("duration", -1)), float(audio.get("duration", -1))
                vs, aus = float(video.get("start_time", 0)), float(audio.get("start_time", 0))
                frame_tolerance = 1 / 30 + 1e-6
                check("encoded-video-1080p30", video.get("width") == 1920 and video.get("height") == 1080 and rate == 30 and avg_rate == 30, video)
                check("encoded-video-frame-count", int(video.get("nb_frames", -1)) == total_frames, {"actual": video.get("nb_frames"), "expected": total_frames})
                check("encoded-audio-layout", str(audio.get("sample_rate")) == "48000" and audio.get("channels") == 2, audio)
                check("encoded-av-duration-within-one-frame", vd > 0 and ad > 0 and abs(vd - ad) <= frame_tolerance and
                      abs(vs - aus) <= frame_tolerance and abs((vs + vd) - (aus + ad)) <= frame_tolerance,
                      {"videoSec": vd, "audioSec": ad, "differenceSec": abs(vd - ad), "videoStartSec": vs,
                       "audioStartSec": aus, "endDifferenceSec": abs((vs + vd) - (aus + ad)), "toleranceSec": 1 / 30})
                check("encoded-duration-matches-selected-timeline", abs(vd - duration) <= frame_tolerance and abs(ad - duration) <= frame_tolerance,
                      {"expectedSec": duration, "videoSec": vd, "audioSec": ad})
    return report


def main():
    args = parse_args()
    try:
        report = audit(args)
    except Exception as exc:
        report = {"schema": "rainbow.dna.delivery-qa/v6", "label": args.label,
                  "checkedAt": datetime.now(timezone.utc).isoformat(), "v6DeliveryVerified": False,
                  "inputs": {key: str(value) for key, value in vars(args).items() if isinstance(value, Path)},
                  "checks": [{"id": "audit-exception", "pass": False, "detail": type(exc).__name__ + ": " + str(exc)}]}
    failures = [check for check in report["checks"] if not check["pass"]]
    report["failedCheckIds"] = [check["id"] for check in failures]
    report["status"] = "failed" if failures else "automated-checks-pass"
    report["v6DeliveryVerified"] = not failures and report.get("actualNarrationVersion") == 5 and args.expected_version == 5
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf8")
    print(json.dumps({"status": report["status"], "label": args.label,
                      "actualNarrationVersion": report.get("actualNarrationVersion"),
                      "v6DeliveryVerified": report["v6DeliveryVerified"], "checks": len(report["checks"]),
                      "failedCheckIds": report["failedCheckIds"], "coverage": report.get("coverage"),
                      "report": str(args.output)}, ensure_ascii=False, indent=2))
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
