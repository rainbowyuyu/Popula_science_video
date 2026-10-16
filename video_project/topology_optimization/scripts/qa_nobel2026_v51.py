"""Reproducible V5.1 media QA. Default: manifest only; never claims listening QA.

Run with the personal TTS Python (numpy/scipy/Pillow are already installed):
  python scripts/qa_nobel2026_v51.py --mode manifest
  python scripts/qa_nobel2026_v51.py FINAL.mp4 --mode full

`samples` extracts exact decoded frames and contact sheets; `full` additionally
counts/decodes every frame, measures AAC, checks source audio and scans cuts.
Missing media always leaves an honest manifest-only report, not a false PASS.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TIMELINE = ROOT / "src/nobel2026/timeline-v51.json"
DEFAULT_MASTER = ROOT / "public/nobel2026/audio-v51/master.wav"
DEFAULT_MOVIE = ROOT / "delivery/nobel2026_v5_1/一束蓝光能叫醒一颗神经元_v5_1_完整预览1080p.mp4"
DEFAULT_OUT = ROOT / "delivery/nobel2026_v5_1/qa"
SOURCE_FILES = ["research/nobel2026/v5/source-audit.md",
                "research/nobel2026/research-note.md",
                "research/nobel2026/opus-scientific-visual-audit-20261006/official-popular-extract.txt"]
MANUAL_GATES = [
    "Listen to every sentence: words, English names, polyphonic words and intact endings.",
    "Watch all joins at normal speed; stills cannot prove smooth motion or AV sync.",
    "Inspect every clause sample for readable labels, genuine figure crops and occlusion.",
    "Check 015 whisker / 016 sleep-wake / 017 fear-recall visuals and team names separately.",
    "Judge music and narration balance on speakers and headphones; loudness is not taste.",
]


def sha(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def rel(path: Path) -> str:
    try:
        return path.resolve().relative_to(ROOT).as_posix()
    except ValueError:
        return str(path.resolve())


def save(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def executable(name: str) -> str:
    found = shutil.which(name)
    fallback = Path("C:/ffmpeg/bin") / (name + ".exe")
    if found:
        return found
    if fallback.is_file():
        return str(fallback)
    raise FileNotFoundError(f"Required executable unavailable: {name}")


def run(command: list[str], log: Path | None = None, check: bool = True) -> subprocess.CompletedProcess:
    result = subprocess.run(command, capture_output=True, text=True, encoding="utf-8", errors="replace")
    if log:
        log.write_text(result.stdout + "\n" + result.stderr, encoding="utf-8")
    if check and result.returncode:
        raise RuntimeError(f"{Path(command[0]).name} failed ({result.returncode}): {result.stderr[-1800:]}")
    return result


def probe(path: Path, count: bool = False) -> dict:
    command = [executable("ffprobe"), "-v", "error"]
    if count:
        command += ["-count_frames"]
    command += ["-show_streams", "-show_format", "-of", "json", str(path)]
    return json.loads(run(command).stdout)


def frame_entry(timeline: dict, frame: int, label: str, group: str, **extra) -> dict:
    frame = max(0, min(int(timeline["duration"]) - 1, int(frame)))
    clip = next((c for c in timeline["clips"] if c["start"] <= frame < c["end"]), None)
    scene = next((s for s in timeline["scenes"] if s["start"] <= frame < s["end"]), {})
    return {"frame": frame, "seconds": round(frame / timeline["fps"], 4), "label": label,
            "group": group, "scene": scene.get("id"), "clip": clip and clip["id"], **extra}


def make_manifest(timeline: dict) -> dict:
    fps = timeline["fps"]
    clauses = []
    for clip in timeline["clips"]:
        for index, part in enumerate(clip.get("subtitleParts", [])):
            start = clip["start"] + round(float(part["start"]) * fps)
            end = clip["start"] + round(float(part["end"]) * fps)
            clauses.append(frame_entry(timeline, (start + end) // 2, part.get("source", f"{clip['id']}-{index:02d}"),
                                       "clause", text=part["text"], speechFrames=[start, end]))
    # 51 overview frames are a stable subset, while all 81+ clauses remain mandatory.
    count = min(51, len(clauses))
    overview = [clauses[round(i * (len(clauses) - 1) / max(1, count - 1))] for i in range(count)]
    coda = next((s for s in timeline["scenes"] if s["id"] == "references"), None)
    content = clauses[:]
    if coda:
        for offset, label in ((.12, "coda-enter"), (.55, "coda-read"), (.95, "coda-tail")):
            content.append(frame_entry(timeline, coda["start"] + int((coda["end"] - coda["start"]) * offset), label, "coda"))
    boundary_map = {s["start"]: f"scene-{s['id']}" for s in timeline["scenes"][1:]}
    # Explicitly cover the three experiments easily confused by scene-wide state.
    for cid in ("008", "016", "017"):
        c = next((c for c in timeline["clips"] if c["id"] == cid), None)
        if c:
            boundary_map.setdefault(c["start"], f"clip-{cid}")
    for c in timeline["clips"][1:]:
        if len(boundary_map) >= 10:
            break
        boundary_map.setdefault(c["start"], f"clip-{c['id']}")
    seams = []
    for frame, label in sorted(boundary_map.items())[:10]:
        for delta in (-round(.5 * fps), 0, round(.5 * fps)):
            seams.append(frame_entry(timeline, frame + delta, f"{label}:{delta:+d}", "seam",
                                     boundaryFrame=frame, offsetFrames=delta))
    joins = []
    for clip in timeline["clips"][1:]:
        f = clip["start"]
        joins.append({"frame": f, "clip": clip["id"], "reviewRangeFrames": [max(0, f - 15), min(timeline["duration"] - 1, f + 15)]})
    return {"version": "nobel2026-v5.1-qa-samples", "fps": fps, "durationFrames": timeline["duration"],
            "overview51": overview, "contentAllClausesAndCoda": content, "seams30": seams,
            "allClipJoins": joins, "counts": {"overview": len(overview), "clauses": len(clauses),
              "contentWithCoda": len(content), "seams": len(seams), "clipJoins": len(joins)},
            "selection": "Exact decoded frame index, one midpoint per measured subtitle clause; 10 joins at -0.5/0/+0.5 s.",
            "manualReviewRequired": MANUAL_GATES}


def static_checks(timeline: dict, master: Path) -> dict:
    errors, warnings = [], []
    clips = timeline["clips"]
    for i, clip in enumerate(clips):
        if i and clip["start"] != clips[i - 1]["end"]:
            errors.append(f"Timeline gap/overlap before {clip['id']}")
        parts = clip.get("subtitleParts", [])
        normal = lambda s: re.sub(r"\s+", "", s)
        if normal("".join(p["text"] for p in parts)) != normal(clip["spoken"]):
            errors.append(f"Caption/spoken text mismatch: {clip['id']}")
        limit = (clip["end"] - clip["start"]) / timeline["fps"]
        for j, part in enumerate(parts):
            if not 0 <= part["start"] < part["end"] <= limit + .05:
                errors.append(f"Caption interval out of clip: {part.get('source')}")
            if j and part["start"] < parts[j - 1]["end"]:
                errors.append(f"Caption overlap: {part.get('source')}")
            if len(part["text"]) > 24:
                warnings.append(f"Caption longer than 24 characters: {part.get('source')}")
    by_id = {c["id"]: c for c in clips}
    expected = {
        "015": {"experiment": "2007 motor cortex / whisker movement", "team": "Aravanis et al.", "keywords": ["胡须", "运动皮层"]},
        "016": {"experiment": "2007 hypocretin / sleep-to-wake transition", "team": "Adamantidis et al.; de Lecea", "keywords": ["醒"]},
        "017": {"experiment": "2012 hippocampal engram / induced fear recall", "team": "Liu, Ramirez, Tonegawa et al.", "keywords": ["恐惧", "激活"]},
    }
    science = []
    for cid, exp in expected.items():
        clip = by_id.get(cid, {})
        text = clip.get("spoken", "")
        if not all(k in text for k in exp["keywords"]):
            warnings.append(f"Scientific clip {cid} wording changed: inspect expected experiment manually")
        science.append({"clip": cid, "scene": clip.get("scene"), "lineInScene": [c['id'] for c in clips if c['scene'] == clip.get('scene')].index(cid) if clip else None,
                        "startSeconds": clip.get("start", 0) / timeline["fps"], "spoken": text, **exp})
    if "光只碰到" in by_id.get("016", {}).get("spoken", ""):
        errors.append("016-02: light is not cell-type selective; opsin expression confers responsiveness. Re-record the sentence.")
    if "尾部两根" in by_id.get("004", {}).get("spoken", ""):
        errors.append("004-03: Chlamydomonas has anterior flagella; remove the incorrect tail-location claim.")
    if "第一次能直接追问" in by_id.get("021", {}).get("spoken", ""):
        errors.append("021-02: optogenetics improved causal precision; it was not the first causal intervention in neuroscience.")
    memory = by_id.get("017", {}).get("spoken", "")
    if "必要" in memory or "只有这些" in memory:
        errors.append("017: activation-induced fear recall is sufficiency evidence; do not claim necessity from stimulation alone.")
    film = ROOT / "src/nobel2026/FilmV51.tsx"
    source = film.read_text(encoding="utf-8")
    tag = source  # V51 uses ResearchCredit plus its adjacent clip-keyed data.
    if "Adamantidis" not in tag and "de Lecea" not in tag:
        warnings.append("ResearchTeamTag has no sleep/awakening team; inspect clip 016 attribution.")
    if "state.line" not in tag and "clipId" not in tag and "clip" not in tag:
        warnings.append("ResearchTeamTag is scene-wide; 015/016/017 require separate team mappings.")
    audio_paths = sorted(set(re.findall(r"<Audio\b[^>]*src=\{staticFile\(['\"]([^'\"]+)", source)))
    expected_asset = rel(master)
    expected_asset = expected_asset[len("public/"):] if expected_asset.startswith("public/") else expected_asset
    if audio_paths != [expected_asset]:
        errors.append(f"Film audio sources {audio_paths} differ from expected master {expected_asset}")
    return {"errors": errors, "warnings": warnings, "scienceClips": science,
            "audioSource": {"film": rel(film), "literalUniqueAudioPaths": audio_paths,
                            "audioElementCount": len(re.findall(r"<Audio\b", source)),
                            "note": "Literal source and rendered waveform are both checked. Element count alone cannot prove whether an older layer is already inside a mixed master."},
            "sourceEvidence": [{"file": f, "sha256": sha(ROOT / f)} for f in SOURCE_FILES if (ROOT / f).exists()],
            "manualScienceReviewComplete": False}


def extract_frames(movie: Path, manifest: dict, out: Path) -> dict[int, Path]:
    frames = sorted({r["frame"] for key in ("overview51", "contentAllClausesAndCoda", "seams30") for r in manifest[key]})
    folder = out / "frames"
    folder.mkdir(parents=True, exist_ok=True)
    expr = "+".join(f"eq(n\\,{n})" for n in frames)
    command = [executable("ffmpeg"), "-hide_banner", "-loglevel", "error", "-y", "-i", str(movie),
               "-map", "0:v:0", "-vf", f"select={expr},scale=640:-2", "-fps_mode", "vfr", "-start_number", "0", str(folder / "sample-%04d.jpg")]
    run(command, out / "frame-extraction.log")
    mapping = {frame: folder / f"sample-{i:04d}.jpg" for i, frame in enumerate(frames)}
    missing = [str(p) for p in mapping.values() if not p.exists()]
    if missing:
        raise RuntimeError(f"Exact-frame extraction missing {len(missing)} images")
    save(out / "frame-file-index.json", [{"frame": n, "file": rel(p)} for n, p in mapping.items()])
    return mapping


def contact_sheets(manifest: dict, mapping: dict[int, Path], out: Path) -> list[str]:
    from PIL import Image, ImageDraw, ImageFont
    font_path = Path("C:/Windows/Fonts/msyh.ttc")
    font = ImageFont.truetype(str(font_path), 17) if font_path.exists() else ImageFont.load_default()
    files = []
    for key, prefix, cols, per_page in (("overview51", "overview-51", 3, 18),
                                       ("contentAllClausesAndCoda", "all-clauses", 3, 18),
                                       ("seams30", "seams-30", 3, 15)):
        items = manifest[key]
        cell_w, picture_h, cell_h = 480, 270, 320
        for page, offset in enumerate(range(0, len(items), per_page), 1):
            chunk = items[offset:offset + per_page]
            sheet = Image.new("RGB", (cols * cell_w, math.ceil(len(chunk) / cols) * cell_h), "#eeeadd")
            draw = ImageDraw.Draw(sheet)
            for i, row in enumerate(chunk):
                x, y = (i % cols) * cell_w, (i // cols) * cell_h
                with Image.open(mapping[row["frame"]]) as image:
                    image = image.convert("RGB")
                    image.thumbnail((cell_w, picture_h))
                    sheet.paste(image, (x + (cell_w - image.width) // 2, y))
                draw.text((x + 8, y + picture_h + 3), f"{row['label']}  f{row['frame']}  {row['seconds']:.2f}s", font=font, fill="#183746")
                caption = row.get("text", row.get("scene", ""))
                draw.text((x + 8, y + picture_h + 25), caption[:29], font=font, fill="#183746")
            path = out / f"{prefix}-{page:02d}.jpg"
            sheet.save(path, quality=92)
            files.append(rel(path))
    return files


def compare_audio(movie: Path, master: Path, out: Path) -> dict:
    import numpy as np
    from scipy.signal import correlate
    sample_rate = 8000
    def pcm(path):
        p = subprocess.run([executable("ffmpeg"), "-v", "error", "-i", str(path), "-map", "0:a:0", "-vn",
                            "-ac", "1", "-ar", str(sample_rate), "-f", "f32le", "pipe:1"], capture_output=True, check=True)
        return np.frombuffer(p.stdout, dtype="<f4").astype(np.float64)
    final, reference = pcm(movie), pcm(master)
    # Estimate bounded codec delay, then compare all aligned samples and 10 s windows.
    corr = correlate(final, reference, mode="full", method="fft")
    zero, bound = len(reference) - 1, round(.25 * sample_rate)
    lag = int(np.argmax(corr[zero-bound:zero+bound+1])) - bound
    a0, b0 = max(lag, 0), max(-lag, 0)
    length = min(len(final) - a0, len(reference) - b0)
    a, b = final[a0:a0+length], reference[b0:b0+length]
    def metrics(x, y):
        gain = float(np.dot(x, y) / max(1e-15, np.dot(y, y)))
        residual = x - gain * y
        snr = 10 * math.log10(max(1e-15, float(np.mean((gain * y) ** 2))) / max(1e-15, float(np.mean(residual ** 2))))
        return {"correlation": float(np.corrcoef(x, y)[0, 1]), "gain": gain, "residualSNRdB": snr}
    total = metrics(a, b)
    windows = []
    for start in range(0, length - sample_rate, 10 * sample_rate):
        stop = min(length, start + 10 * sample_rate)
        if float(np.mean(b[start:stop] ** 2)) < 1e-7:
            continue
        windows.append({"startSeconds": start / sample_rate, **metrics(a[start:stop], b[start:stop])})
    matches = total["correlation"] >= .995 and total["residualSNRdB"] >= 25
    return {"master": rel(master), "masterSHA256": sha(master), "lagSamplesAt8k": lag, "lagSeconds": lag/sample_rate,
            "finalDurationSeconds": len(final)/sample_rate, "masterDurationSeconds": len(reference)/sample_rate,
            **total, "windows10Seconds": windows, "waveformMatchesSoleMaster": matches,
            "limitations": "Lossy AAC prevents hash equality. A matching residual supports the specified master; it is not a proof of every inaudible component or of correct pronunciation."}


def scan_motion(movie: Path, timeline: dict) -> dict:
    import numpy as np
    width, height = 160, 90
    command = [executable("ffmpeg"), "-v", "error", "-i", str(movie), "-map", "0:v:0", "-an",
               "-vf", f"scale={width}:{height},format=gray", "-fps_mode", "passthrough", "-pix_fmt", "gray", "-f", "rawvideo", "pipe:1"]
    process = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    previous, differences, luminance, frame = None, [], [], 0
    size = width * height
    while True:
        block = process.stdout.read(size)
        if not block:
            break
        if len(block) != size:
            raise RuntimeError("Partial rawvideo frame during continuity scan")
        current = np.frombuffer(block, np.uint8).astype(np.float32)
        if previous is not None:
            differences.append(float(np.mean(np.abs(current - previous))) / 255)
            luminance.append(float(current.mean() - previous.mean()) / 255)
        previous = current
        frame += 1
    stderr = process.stderr.read().decode("utf-8", "replace")
    if process.wait() != 0:
        raise RuntimeError("Continuity scan decode failed: " + stderr[-1200:])
    known = sorted({c['start'] for c in timeline['clips'][1:]} | {s['start'] for s in timeline['scenes'][1:]})
    events = []
    for i, value in enumerate(differences):
        n = i + 1
        if value >= .12 or abs(luminance[i]) >= .10:
            events.append({"frame": n, "seconds": n/timeline['fps'], "meanAbsoluteDelta": round(value, 6),
                           "luminanceDelta": round(luminance[i], 6), "nearestKnownJoinDistanceFrames": min((abs(n-k) for k in known), default=None)})
    frozen = []
    start = None
    for i, value in enumerate(differences + [1]):
        if value <= .00005 and start is None:
            start = i
        elif value > .00005 and start is not None:
            if i - start >= 2 * timeline['fps']:
                frozen.append({"startFrame": start, "endFrame": i, "seconds": (i-start)/timeline['fps']})
            start = None
    joins = [{"frame": n, "previousDelta": differences[n-1] if 0<n<=len(differences) else None,
              "followingDelta": differences[n] if n<len(differences) else None} for n in known]
    return {"decodedFrames": frame, "resolution": [width, height], "cutCandidates": events, "allJoinAdjacentMetrics": joins,
            "nearIdenticalRunsOver2Seconds": frozen,
            "limitations": "Thresholds flag candidates, not errors. Low-resolution frame differences cannot judge geometry, natural movement, pronunciation or scientific accuracy."}


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("movie", nargs="?", type=Path, default=DEFAULT_MOVIE)
    parser.add_argument("--mode", choices=("manifest", "samples", "full"), default="manifest")
    parser.add_argument("--timeline", type=Path, default=DEFAULT_TIMELINE)
    parser.add_argument("--master", type=Path, default=DEFAULT_MASTER)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUT)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    timeline = json.loads(args.timeline.read_text(encoding="utf-8-sig"))
    manifest = make_manifest(timeline)
    save(args.output / "sample-manifest.json", manifest)
    static = static_checks(timeline, args.master)
    report = {"version": "nobel2026-v5.1", "createdUTC": datetime.now(timezone.utc).isoformat(),
              "requestedMode": args.mode, "effectiveMode": "manifest", "movie": rel(args.movie), "movieExists": args.movie.is_file(),
              "timeline": rel(args.timeline), "timelineSHA256": sha(args.timeline), "expectedFrames": timeline['duration'],
              "sampleCounts": manifest['counts'], "static": static, "manualReviewRequired": MANUAL_GATES,
              "subjectiveListeningChecked": False, "normalSpeedVisualReviewComplete": False,
              "technicalChecksComplete": False, "qaComplete": False}
    errors = list(static['errors'])
    if args.mode != "manifest" and args.movie.is_file():
        info = probe(args.movie, count=args.mode == "full")
        report["probe"] = info
        videos = [s for s in info['streams'] if s['codec_type'] == 'video']
        audios = [s for s in info['streams'] if s['codec_type'] == 'audio']
        if len(videos) != 1 or len(audios) != 1:
            errors.append("Expected exactly one video stream and one audio stream")
        if videos:
            v = videos[0]
            if (v.get('width'), v.get('height')) != (1920, 1080):
                errors.append("Final resolution is not 1920x1080")
            if abs(float(Fraction(v['avg_frame_rate'])) - timeline['fps']) > .001:
                errors.append("Final FPS differs from timeline")
            if args.mode == 'full' and int(v.get('nb_read_frames', -1)) != timeline['duration']:
                errors.append("Decoded video frame count differs from timeline")
        if abs(float(info['format']['duration']) - timeline['duration']/timeline['fps']) > .15:
            errors.append("Final duration differs from timeline by over 150 ms")
        mapping = extract_frames(args.movie, manifest, args.output)
        report['contactSheets'] = contact_sheets(manifest, mapping, args.output)
        report['effectiveMode'] = 'samples'
        if args.mode == 'full':
            ff = executable('ffmpeg')
            result = run([ff, '-hide_banner', '-nostats', '-v', 'error', '-xerror', '-i', str(args.movie), '-map', '0:v:0', '-map', '0:a:0', '-f', 'null', os.devnull], args.output/'full-decode.log', check=False)
            report['fullDecode'] = {'returnCode': result.returncode, 'stderr': result.stderr.strip(), 'passed': result.returncode == 0 and not result.stderr.strip()}
            if not report['fullDecode']['passed']:
                errors.append('Final media failed full decode')
            log = run([ff, '-hide_banner', '-nostats', '-i', str(args.movie), '-vn', '-af', 'loudnorm=print_format=json', '-f', 'null', os.devnull], args.output/'aac-loudness.log').stderr
            matches = re.findall(r'\{\s*"input_i"[\s\S]*?\}', log)
            loud = json.loads(matches[-1]) if matches else {}
            report['finalAACLoudness'] = loud
            if not loud or not -17 <= float(loud['input_i']) <= -13 or float(loud['input_tp']) > -1:
                errors.append('Final AAC loudness/true peak outside -17..-13 LUFS / <=-1 dBTP')
            log = run([ff, '-hide_banner', '-nostats', '-i', str(args.movie), '-an', '-vf', 'blackdetect=d=0.1:pix_th=0.04:pic_th=0.97', '-f', 'null', os.devnull], args.output/'blackdetect.log').stderr
            report['blackFrameCandidates'] = re.findall(r'black_start:[^\r\n]+', log)
            if report['blackFrameCandidates']:
                errors.append('Black-frame intervals need review')
            report['continuity'] = scan_motion(args.movie, timeline)
            if args.master.is_file() and audios:
                report['audioSourceComparison'] = compare_audio(args.movie, args.master, args.output)
                if not report['audioSourceComparison']['waveformMatchesSoleMaster']:
                    errors.append('AAC does not match the expected V5 master within codec tolerance')
            else:
                errors.append('Expected audio master missing, or no final audio stream')
            report['movieSHA256'] = sha(args.movie)
            report['effectiveMode'] = 'full'
            report['technicalChecksComplete'] = True
    report['technicalPassed'] = report['technicalChecksComplete'] and not errors
    report['errors'] = errors
    save(args.output/'qa-report.json', report)
    print(f"mode={report['effectiveMode']} content={manifest['counts']['contentWithCoda']} overview={manifest['counts']['overview']} seams={manifest['counts']['seams']}")
    print(f"technical_complete={report['technicalChecksComplete']} technical_passed={report['technicalPassed']} errors={len(errors)}; human listening/watch review is still required")
    print(args.output/'qa-report.json')
    if args.mode == 'full' and args.movie.is_file() and errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
