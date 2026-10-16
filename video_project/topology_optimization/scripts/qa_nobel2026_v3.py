"""Generate a reproducible QA record for the final V3 Nobel film assets."""
from __future__ import annotations

import hashlib
import json
import re
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ffprobe(path: Path) -> dict:
    raw = subprocess.run(
        ["ffprobe", "-v", "error", "-show_format", "-show_streams", "-of", "json", str(path)],
        check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    return json.loads(raw.stdout)


def main() -> None:
    timeline = json.loads((ROOT / "src/nobel2026/timeline-v3.json").read_text(encoding="utf-8"))
    manifest = json.loads((ROOT / "public/nobel2026/audio-manifest-v3.json").read_text(encoding="utf-8"))
    alignment = json.loads((ROOT / "research/nobel2026/asr-alignment-v3.json").read_text(encoding="utf-8"))
    voice_ledger = json.loads((ROOT / "research/nobel2026/voice-generation-v3.json").read_text(encoding="utf-8"))
    master = ROOT / "public/nobel2026/master-v4.wav"
    voice = ROOT / "public/nobel2026/master-v3-voice.wav"
    bgm = ROOT / "public/nobel2026/nobel-v2-bgm.wav"
    output = ROOT / "delivery/nobel2026_v3/一束蓝光能叫醒一颗神经元_v3_1080p.mp4"

    # The narration dictionary is the single source of truth.  Keep this
    # check here so a future edit cannot silently update generated audio while
    # leaving the on-screen captions on an older wording revision.
    from build_nobel2026_v3_timeline import NARRATION
    builder_mismatches = [
        c["id"] for c in timeline["clips"]
        if c.get("subtitle") != NARRATION.get(c["id"])
    ]

    caption_mismatches = [
        c["id"] for c in timeline["clips"]
        if "".join(p["text"] for p in c.get("subtitleParts", [])) != c["subtitle"]
    ]
    alignment_by_id = {row["id"]: row for row in alignment.get("clips", [])}
    source_errors = []
    timing_errors = []
    reviewed_partials = 0
    for clip in timeline["clips"]:
        cid = clip["id"]
        raw = ROOT / "public/nobel2026/voice-v3-raw" / f"{cid}.wav"
        evidence = alignment_by_id.get(cid)
        ledger = voice_ledger.get(cid, {})
        if not raw.exists() or not evidence or evidence.get("sourceSha256") != sha(raw):
            source_errors.append(f"{cid}: ASR source WAV missing or changed")
        if ledger.get("text") != NARRATION.get(cid) or ledger.get("sha256") != sha(raw):
            source_errors.append(f"{cid}: TTS generation ledger differs from narration or WAV")
        if evidence and evidence.get("expected") != clip["spoken"]:
            source_errors.append(f"{cid}: ASR report uses older narration")
        clip_seconds = (clip["end"] - clip["start"]) / timeline["fps"]
        for part in clip.get("subtitleParts", []):
            start, end = part.get("start"), part.get("end")
            if start is None or end is None or not (0 <= float(start) < float(end) <= clip_seconds + 0.02):
                timing_errors.append(f"{cid}: untimed or out-of-range caption")
            if part.get("status") == "partial":
                reviewed_partials += 1
                if part.get("reviewStatus") != "homophonic-asr-reviewed":
                    timing_errors.append(f"{cid}: unreviewed partial caption")
            elif part.get("status") != "exact":
                timing_errors.append(f"{cid}: caption not aligned")
    timeline_seconds = timeline["duration"] / timeline["fps"]
    voice_seconds = float(ffprobe(voice)["format"]["duration"])
    master_seconds = float(ffprobe(master)["format"]["duration"])
    if abs(voice_seconds - timeline_seconds) > 1 / timeline["fps"]:
        timing_errors.append("voice master duration differs from timeline")
    if abs(master_seconds - timeline_seconds) > 1 / timeline["fps"]:
        timing_errors.append("mixed master duration differs from timeline")
    silence_raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(master),
         "-af", "silencedetect=noise=-42dB:d=0.75", "-f", "null", "NUL"],
        check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
    ).stderr
    silence_events = re.findall(r"silence_(?:start|end):[^\r\n]+", silence_raw)
    loud_raw = subprocess.run(
        ["ffmpeg", "-hide_banner", "-nostats", "-i", str(master),
         "-af", "loudnorm=print_format=json", "-f", "null", "NUL"],
        check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
    ).stderr
    loud_matches = re.findall(r"\{\s*\"input_i\"[\s\S]*?\}", loud_raw)
    loudness = json.loads(loud_matches[-1]) if loud_matches else {}

    alignment_rows = alignment.get("clips", [])
    low_similarity = [
        {"id": row.get("id"), "similarity": row.get("similarity"), "asr": row.get("asr", "")}
        for row in alignment_rows if float(row.get("similarity", 0)) < 0.90
    ]
    speech_tails = [
        {"id": row.get("id"), "audioSeconds": row.get("audioSeconds"), "speechEndSeconds": row.get("speechEndSeconds"),
         "tailSeconds": round(float(row.get("audioSeconds", 0)) - float(row.get("speechEndSeconds", 0)), 3)}
        for row in alignment_rows
        if float(row.get("audioSeconds", 0)) - float(row.get("speechEndSeconds", 0)) > 0.65
    ]

    report = {
        "version": "nobel2026-v3-final-qa",
        "timeline": {
            "file": "src/nobel2026/timeline-v3.json",
            "fps": timeline["fps"],
            "frames": timeline["duration"],
            "seconds": timeline["seconds"],
            "scenes": len(timeline["scenes"]),
            "clips": len(timeline["clips"]),
            "referencesCodaSeconds": 12.0,
        },
        "audio": {
            "voice": {"file": str(voice.relative_to(ROOT)), "seconds": ffprobe(voice)["format"]["duration"], "sha256": sha(voice)},
            "master": {"file": str(master.relative_to(ROOT)), "seconds": ffprobe(master)["format"]["duration"], "sha256": sha(master)},
            "bgm": {"file": str(bgm.relative_to(ROOT)), "seconds": ffprobe(bgm)["format"]["duration"], "sha256": sha(bgm)},
            "loudnorm": loudness,
            "silencedetectNoiseDb": -42,
            "silencedetectMinSeconds": 0.75,
            "silenceEvents": silence_events,
            "voicePolicy": manifest.get("noForcedAtTempo"),
            "noClipTrim": manifest.get("noClipTrim"),
        },
        "alignment": {
            "report": "research/nobel2026/asr-alignment-v3.json",
            "captionMismatches": caption_mismatches,
            "clipsWithAsr": len(alignment.get("clips", [])),
            "minSimilarity": min((x.get("similarity", 0) for x in alignment.get("clips", [])), default=0),
            "meanSimilarity": sum(x.get("similarity", 0) for x in alignment.get("clips", [])) / max(1, len(alignment.get("clips", []))),
            "builderNarrationMismatches": builder_mismatches,
            "lowSimilarityBelow0.90": low_similarity,
            "speechTailsOver0.65s": speech_tails,
            "reviewedHomophonicAsrParts": reviewed_partials,
            "sourceErrors": source_errors,
            "timingErrors": timing_errors,
        },
        "render": {
            "file": str(output.relative_to(ROOT)),
            "exists": output.exists(),
            "fullDecode": None,
        },
    }
    if output.exists():
        info = ffprobe(output)
        report["render"]["durationSeconds"] = float(info["format"]["duration"])
        report["render"]["streams"] = [
            {k: s.get(k) for k in ("codec_type", "codec_name", "width", "height", "r_frame_rate", "sample_rate", "channels") if k in s}
            for s in info["streams"]
        ]
        decode = subprocess.run(["ffmpeg", "-v", "error", "-i", str(output), "-f", "null", "NUL"], capture_output=True, text=True)
        report["render"]["fullDecode"] = not decode.stderr.strip()
        render_silence_raw = subprocess.run(
            ["ffmpeg", "-hide_banner", "-nostats", "-i", str(output),
             "-af", "silencedetect=noise=-42dB:d=0.75", "-f", "null", "NUL"],
            check=True, capture_output=True, text=True, encoding="utf-8", errors="replace",
        ).stderr
        report["render"]["silenceEvents"] = re.findall(r"silence_(?:start|end):[^\r\n]+", render_silence_raw)
        report["render"]["sha256"] = sha(output)
        if abs(float(info["format"]["duration"]) - timeline_seconds) > 0.15:
            timing_errors.append("render duration differs from timeline")
        if output.stat().st_mtime < max(master.stat().st_mtime, (ROOT / "src/nobel2026/timeline-v3.json").stat().st_mtime):
            timing_errors.append("render predates final audio or timeline")

    failures = []
    if builder_mismatches or caption_mismatches:
        failures.append("narration/caption text mismatch")
    if len(alignment_by_id) != len(timeline["clips"]):
        failures.append("missing ASR coverage")
    failures.extend(source_errors + timing_errors)
    if speech_tails:
        failures.append("long speech tail")
    if silence_events or report["render"].get("silenceEvents"):
        failures.append("long audio silence")
    if not report["render"].get("fullDecode"):
        failures.append("render missing or failed full decode")
    report["passed"] = not failures
    report["failures"] = failures

    out = ROOT / "delivery/nobel2026_v3/qa-report.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    md = ROOT / "delivery/nobel2026_v3/qa-report.md"
    md.write_text(
        "# Nobel 2026 V3 QA\n\n"
        f"- Timeline: `{timeline['duration']} frames / {timeline['seconds']:.3f}s`, {len(timeline['clips'])} clips, 12s references coda.\n"
        f"- Caption text mismatches: **{len(caption_mismatches)}**.\n"
        f"- Builder/timeline narration mismatches: **{len(builder_mismatches)}**; ASR alignment clips: **{len(alignment.get('clips', []))}**, mean similarity `{report['alignment']['meanSimilarity']:.3f}`.\n"
        f"- ASR review flags below 0.90: **{len(low_similarity)}**; speech tails over 0.65s: **{len(speech_tails)}**.\n"
        f"- Reviewed homophonic ASR parts: **{reviewed_partials}**; source/timing errors: **{len(source_errors)}/{len(timing_errors)}**.\n"
        f"- Master WAV: `{report['audio']['master']['seconds']}s`; silencedetect events at -42 dB / 0.75s: **{len(silence_events)}**.\n"
        f"- BGM: `{report['audio']['bgm']['file']}`; coda harmonic floor follows the timeline's references scene.\n"
        f"- Final MP4 exists: **{output.exists()}**; full decode: **{report['render']['fullDecode']}**; AAC silencedetect events: **{len(report['render'].get('silenceEvents', []))}**.\n"
        f"- Overall QA: **{'PASS' if report['passed'] else 'FAIL'}**.\n",
        encoding="utf-8",
    )
    print(out)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if failures:
        raise SystemExit("QA failed: " + "; ".join(failures))


if __name__ == "__main__":
    main()
