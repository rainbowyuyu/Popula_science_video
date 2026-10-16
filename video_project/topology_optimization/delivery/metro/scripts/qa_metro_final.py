"""Read-only QA of the finished metro MP4, plus final-video review artifacts.

Run after render_metro.mjs exits successfully. This script never writes the
source MP4, narration, music, timeline, World, Film, or rendering code. All
derived pictures, logs and excerpts go to output/metro/qa-final. The report
distinguishes automated technical checks from pending visual/listening review.
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

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
FPS = 30
TIMELINE_SOURCE = ROOT / "public/metro/timeline.json"
_timeline_for_expectations = json.loads(TIMELINE_SOURCE.read_text(encoding="utf8"))
EXPECTED_FRAMES = int(_timeline_for_expectations["duration"])
EXPECTED_SECONDS = float(_timeline_for_expectations["seconds"])
EXPECTED_SCENES = ["arrival", "line", "piston", "nose", "side", "wake",
                   "balance", "distance", "speed", "doors", "habit", "return", "references"]
# Include the requested before/after one-second frames, the precise seam, and
# later frames so a 2–3-second move can be assessed in the contact sheets.
BOUNDARY_OFFSETS = [-30, -1, 0, 1, 30, 60, 89]


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf8")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def relative(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def run_logged(command: list[str], log: Path, *, check: bool = True) -> int:
    with log.open("w", encoding="utf8") as handle:
        completed = subprocess.run(command, stdout=handle, stderr=subprocess.STDOUT,
                                   text=True, encoding="utf8", errors="replace", check=False)
    if check and completed.returncode:
        raise RuntimeError(f"Command exited {completed.returncode}: {log}")
    return completed.returncode


def probe(ffprobe: str, movie: Path) -> dict:
    result = subprocess.run([ffprobe, "-v", "error", "-show_format", "-show_streams",
                             "-of", "json", str(movie)], capture_output=True, text=True,
                            encoding="utf8", errors="replace", check=True)
    return json.loads(result.stdout)


def font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for candidate in ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf"]:
        if Path(candidate).exists():
            return ImageFont.truetype(candidate, size)
    return ImageFont.load_default()


def paste_frame(sheet: Image.Image, path: Path, x: int, y: int, size: tuple[int, int]) -> None:
    with Image.open(path) as source:
        sheet.paste(source.convert("RGB").resize(size, Image.Resampling.LANCZOS), (x, y))


def make_contacts(out: Path, midpoints: list[dict], boundaries: list[dict]) -> dict:
    bg, fg, muted = "#101e2c", "#edf2f3", "#9bacbc"
    cw, ih, ch, gap, cols = 480, 270, 308, 12, 4
    rows = math.ceil(len(midpoints) / cols)
    sheet = Image.new("RGB", (cols * cw + (cols + 1) * gap,
                              rows * ch + (rows + 1) * gap), bg)
    draw = ImageDraw.Draw(sheet)
    for i, entry in enumerate(midpoints):
        x, y = gap + i % cols * (cw + gap), gap + i // cols * (ch + gap)
        paste_frame(sheet, out / f"frame-{entry['frame']:05}.jpg", x, y, (cw, ih))
        draw.text((x + 6, y + ih + 7), f"{entry['scene']} | f{entry['frame']} | {entry['frame']/FPS:.2f}s",
                  font=font(20), fill=fg)
    midpoint_sheet = out / "chapter-midpoints.jpg"
    sheet.save(midpoint_sheet, quality=94, subsampling=0)
    transition_sheets = []
    cw, ih, ch, gap = 320, 180, 224, 8
    for offset in range(0, len(boundaries), 4):
        batch = boundaries[offset:offset+4]
        sheet = Image.new("RGB", (len(BOUNDARY_OFFSETS)*cw + (len(BOUNDARY_OFFSETS)+1)*gap,
                                  len(batch)*ch + (len(batch)+1)*gap), bg)
        draw = ImageDraw.Draw(sheet)
        for row, entry in enumerate(batch):
            for col, sample in enumerate(entry["samples"]):
                x, y = gap+col*(cw+gap), gap+row*(ch+gap)
                paste_frame(sheet, out / f"frame-{sample['frame']:05}.jpg", x, y, (cw, ih))
                draw.text((x+5, y+ih+3), f"{entry['previousScene']} > {entry['nextScene']}",
                          font=font(15), fill=fg)
                draw.text((x+5, y+ih+23), f"f{sample['frame']}  ({sample['offsetFrames']:+}f)",
                          font=font(15), fill=muted)
        target = out / f"transition-contact-{offset//4+1}.jpg"
        sheet.save(target, quality=94, subsampling=0)
        transition_sheets.append(relative(target))
    return {"chapterMidpoints": relative(midpoint_sheet), "transitions": transition_sheets}


def make_reel(ffmpeg: str, ffprobe: str, movie: Path, out: Path,
              boundaries: list[dict], threads: int) -> dict:
    clips_dir = out / "transition-excerpts"
    clips_dir.mkdir(exist_ok=True)
    entries, clips = [], []
    for i, boundary in enumerate(boundaries):
        first = boundary["boundaryFrame"] - FPS
        end = boundary["boundaryFrame"] + FPS*3
        assert 0 <= first < end <= EXPECTED_FRAMES
        destination = clips_dir / f"{i+1:02}-{boundary['nextScene']}.mkv"
        # Accurate input seeking discards pre-roll before transcoding. PCM in
        # intermediate clips avoids accumulating AAC encoder padding at joins.
        run_logged([ffmpeg, "-hide_banner", "-nostdin", "-y", "-v", "warning",
                    "-threads", str(threads), "-ss", f"{first/FPS:.9f}", "-i", str(movie),
                    "-t", "4", "-map", "0:v:0", "-map", "0:a:0",
                    "-vf", "scale=1280:720", "-filter_threads", str(threads),
                    "-frames:v", "120", "-c:v", "libx264", "-preset", "fast", "-crf", "20",
                    "-threads", str(threads), "-pix_fmt", "yuv420p", "-r", "30",
                    "-c:a", "pcm_s16le", "-ar", "48000", "-ac", "2", str(destination)],
                   clips_dir / f"{i+1:02}.log")
        clips.append(destination)
        entries.append({"previousScene": boundary["previousScene"], "nextScene": boundary["nextScene"],
                        "boundaryFrame": boundary["boundaryFrame"], "sourceFirstFrame": first,
                        "sourceEndFrameExclusive": end, "sourceStartSeconds": first/FPS,
                        "sourceEndSeconds": end/FPS, "reelStartSeconds": i*4,
                        "file": relative(destination)})
        print(f"Transition excerpt {i+1}/{len(boundaries)}", flush=True)
    playlist = clips_dir / "concat.txt"
    playlist.write_text("\n".join(f"file '{p.name}'" for p in clips)+"\n", encoding="utf8")
    reel = out / "transition-review.mp4"
    run_logged([ffmpeg, "-hide_banner", "-nostdin", "-y", "-v", "warning",
                "-f", "concat", "-safe", "0", "-i", str(playlist),
                "-map", "0:v:0", "-map", "0:a:0", "-t", "48",
                "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
                "-movflags", "+faststart", str(reel)], out / "reel-concat.log")
    reel_probe = probe(ffprobe, reel)
    write_json(out / "transition-review-probe.json", reel_probe)
    rv = next(s for s in reel_probe["streams"] if s["codec_type"]=="video")
    return {"file": relative(reel), "sha256": sha256(reel), "segments": entries,
            "seconds": float(reel_probe["format"]["duration"]),
            "videoFrames": int(rv["nb_frames"]) if rv.get("nb_frames", "N/A")!="N/A" else None,
            "source": "Time-seeked final MP4 excerpts: 1 second before and 3 seconds after every boundary.",
            "audio": "Matching source audio retained; PCM intermediates, AAC encoded once in final review reel.",
            "note": "Hard cuts BETWEEN excerpts belong only to the review reel, not to the original video."}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--video", type=Path, default=ROOT/"output/metro/metro_safety_1080p.mp4")
    parser.add_argument("--ffmpeg-dir", type=Path, default=Path("C:/ffmpeg/bin"))
    parser.add_argument("--threads", type=int, default=2)
    args = parser.parse_args()
    movie = args.video.resolve()
    out = (ROOT/"output/metro/qa-final").resolve()
    report_path = ROOT/"research/metro/final-media-qa.json"
    if movie.is_relative_to(out):
        parser.error("Input movie must be outside the derived QA artifact directory.")
    if not movie.is_file():
        parser.error(f"Finished movie does not exist: {movie}")
    out.mkdir(parents=True, exist_ok=True)
    ffmpeg = str(args.ffmpeg_dir/"ffmpeg.exe")
    ffprobe = str(args.ffmpeg_dir/"ffprobe.exe")
    threads = max(1, min(args.threads, 4))
    before = movie.stat()
    report = {"createdUTC": datetime.now(timezone.utc).isoformat(), "video": str(movie),
              "expected": {"width":1920,"height":1080,"fps":FPS,"frames":EXPECTED_FRAMES,
                           "seconds":EXPECTED_SECONDS,"audioCodec":"aac","audioSampleRate":48000,
                           "audioChannels":2,"maximumTruePeakDbTP":-1},
              "reviewScope": {"fullMediaDecode":True,"fullBlackDetectionMinimumSeconds":.1,
                              "blackPixelThreshold":.10,"blackPictureRatioThreshold":.98,
                              "fullFrameIntervalScan":"vfrdet; no timestamp regeneration",
                              "chapterMidpoints":13,"allChapterBoundaries":12,
                              "boundaryFrameOffsets":BOUNDARY_OFFSETS,"transitionReelSeconds":48},
              "subjectiveListeningChecked":False,"humanFullPlaybackChecked":False,
              "sampledVisualReview":{"status":"pending","note":"Contact sheets and review reel are evidence for subsequent inspection, not an automatic aesthetic approval."},
              "checks":{}}
    checks = report["checks"]
    try:
        original_video_sha = sha256(movie)
        report["videoSha256"] = original_video_sha
        report["fileBytes"] = before.st_size
        timeline_path = ROOT/"public/metro/timeline.json"
        timeline = json.loads(timeline_path.read_text(encoding="utf8"))
        scenes = timeline["scenes"]
        checks["timelineFrames"] = timeline["duration"]==EXPECTED_FRAMES and timeline["fps"]==FPS
        checks["timelineSeconds"] = abs(timeline["seconds"]-EXPECTED_SECONDS)<1e-8
        checks["sceneIdsAndCount"] = [s["id"] for s in scenes]==EXPECTED_SCENES
        checks["contiguousScenes"] = scenes[0]["start"]==0 and scenes[-1]["end"]==EXPECTED_FRAMES and all(a["end"]==b["start"] for a,b in zip(scenes,scenes[1:]))
        checks["eightSecondCoda"] = scenes[-1]["end"]-scenes[-1]["start"]==240
        checks["sourcePublicTimelineIdentical"] = timeline_path.read_bytes()==(ROOT/"src/metro/timeline.json").read_bytes()
        if not all(checks.values()):
            raise RuntimeError("The expected current timeline is inconsistent; see report checks.")
        report["sourceFingerprintCapturedAtQA"] = {}
        for name in ["src/metro/World.ts", "src/metro/Film.tsx", "src/metro/timeline.json",
                     "public/metro/timeline.json", "public/metro/master.wav", "research/metro/story.json",
                     "scripts/render_metro.mjs"]:
            path = ROOT/name
            if path.exists():
                st=path.stat()
                report["sourceFingerprintCapturedAtQA"][name]={"sha256":sha256(path),"bytes":st.st_size,"mtimeNs":st.st_mtime_ns}
        print("Probe final MP4", flush=True)
        info = probe(ffprobe,movie)
        write_json(out/"ffprobe.json",info)
        checks["singleVideoAndAudioStream"] = (sum(s["codec_type"]=="video" for s in info["streams"])==1
                                                and sum(s["codec_type"]=="audio" for s in info["streams"])==1)
        v = next(s for s in info["streams"] if s["codec_type"]=="video")
        a = next(s for s in info["streams"] if s["codec_type"]=="audio")
        meta = {"width":v["width"],"height":v["height"],"fps":float(Fraction(v["avg_frame_rate"])),
                "containerFrames":int(v["nb_frames"]) if v.get("nb_frames","N/A")!="N/A" else None,
                "videoSeconds":float(v["duration"]),"audioSeconds":float(a["duration"]),
                "containerSeconds":float(info["format"]["duration"]),
                "audioCodec":a["codec_name"],"audioSampleRate":int(a["sample_rate"]),"audioChannels":a["channels"]}
        report["metadata"]=meta
        checks["dimensions"] = (v["width"],v["height"])==(1920,1080)
        checks["fps"] = Fraction(v["avg_frame_rate"])==FPS
        checks["nominalFrameRate"] = Fraction(v["r_frame_rate"])==FPS
        checks["videoDuration"] = abs(meta["videoSeconds"]-EXPECTED_SECONDS)<.001
        checks["audioDuration"] = abs(meta["audioSeconds"]-EXPECTED_SECONDS)<.15
        checks["containerDuration"] = abs(meta["containerSeconds"]-EXPECTED_SECONDS)<.15
        checks["AACAudio"] = a["codec_name"]=="aac"
        checks["audio48kStereo"] = int(a["sample_rate"])==48000 and a["channels"]==2
        if meta["containerFrames"] is not None:
            checks["containerFrameCount"] = meta["containerFrames"]==EXPECTED_FRAMES
        print("Full decode, blackdetect >= 100 ms and original AAC loudness", flush=True)
        log = out/"decode-black-loudness.log"
        progress = out/"decode-progress.txt"
        exit_code = run_logged([ffmpeg,"-hide_banner","-nostdin","-nostats","-y","-xerror",
            "-err_detect","explode","-threads",str(threads),"-i",str(movie),
            "-map","0:v:0","-map","0:a:0","-filter_threads",str(threads),
            "-vf","blackdetect=d=0.1:pic_th=0.98:pix_th=0.10,vfrdet",
            "-af","loudnorm=I=-16:TP=-1.5:LRA=9:print_format=json",
            "-fps_mode","passthrough","-progress",str(progress),"-f","null","NUL"],log,check=False)
        text = log.read_text(encoding="utf8",errors="replace")
        prog = progress.read_text(encoding="utf8",errors="replace") if progress.exists() else ""
        decoded = re.findall(r"^frame=\s*(\d+)\s*$",prog,re.MULTILINE)
        report["decodedFrames"] = int(decoded[-1]) if decoded else None
        checks["completeDecode"] = exit_code==0
        checks["decodeReachedEnd"] = "progress=end" in prog
        checks["decodedFrameCount"] = report["decodedFrames"]==EXPECTED_FRAMES
        cadence=re.findall(r"VFR:([\d.]+)\s+\((\d+)/(\d+)\)",text)
        checks["constantFrameIntervals"] = False
        if cadence:
            ratio,variable,constant=cadence[-1]
            report["frameIntervalScan"]={"variableRatio":float(ratio),"variableIntervals":int(variable),
                                         "constantIntervals":int(constant)}
            checks["constantFrameIntervals"] = int(variable)==0 and int(constant)>0
        black = [{"startSeconds":float(s),"endSeconds":float(e),"durationSeconds":float(d)}
                 for s,e,d in re.findall(r"black_start:([\d.]+)\s+black_end:([\d.]+)\s+black_duration:([\d.]+)",text)]
        report["blackSegmentsAtLeast100ms"] = black
        checks["noBlackSegmentsAtLeast100ms"] = not black
        loud_blocks = re.findall(r'\{\s*"input_i"[\s\S]*?\}',text)
        checks["loudnessMeasured"] = False
        if loud_blocks:
            loud=json.loads(loud_blocks[-1]); report["loudnormFullOutput"]=loud
            measured={"integratedLUFS":float(loud["input_i"]),"truePeakDbTP":float(loud["input_tp"]),
                      "loudnessRangeLU":float(loud["input_lra"]),"thresholdLUFS":float(loud["input_thresh"])}
            report["originalAACMeasurement"]={**measured,"note":"INPUT values measure the decoded final AAC. output_* values are hypothetical normalized audio and are not the delivered audio."}
            checks["loudnessMeasured"] = all(math.isfinite(measured[k]) for k in measured)
            checks["truePeakAtMostMinus1dBTP"] = measured["truePeakDbTP"]<=-1
            checks["integratedLoudnessTarget"] = -16.5<=measured["integratedLUFS"]<=-13.5
        write_json(report_path,report)
        if exit_code:
            raise RuntimeError("Full MP4 decode failed; inspect decode-black-loudness.log")
        midpoints=[{"scene":s["id"],"frame":s["start"]+(s["end"]-s["start"]-1)//2} for s in scenes]
        boundaries=[]
        for previous,current in zip(scenes,scenes[1:]):
            boundaries.append({"previousScene":previous["id"],"nextScene":current["id"],
                "boundaryFrame":current["start"],"samples":[{"offsetFrames":d,"frame":current["start"]+d} for d in BOUNDARY_OFFSETS]})
        frames=sorted({0,EXPECTED_FRAMES-1,*[m["frame"] for m in midpoints],
                       *[s["frame"] for b in boundaries for s in b["samples"]]})
        assert all(0<=f<EXPECTED_FRAMES for f in frames)
        print(f"Extract {len(frames)} numbered frames from the final export",flush=True)
        selection="+".join(f"eq(n\\,{f})" for f in frames)
        run_logged([ffmpeg,"-hide_banner","-nostdin","-y","-v","warning","-threads",str(threads),
                    "-i",str(movie),"-an","-vf","select="+selection,"-filter_threads",str(threads),
                    "-fps_mode","vfr","-q:v","2","-frames:v",str(len(frames)),
                    str(out/"selected-%03d.jpg")],out/"frame-extract.log")
        for i,f in enumerate(frames,1):
            (out/f"selected-{i:03}.jpg").replace(out/f"frame-{f:05}.jpg")
        report["exactSampleFrames"]=frames
        report["chapterMidpoints"]=midpoints
        report["boundarySamples"]=boundaries
        checks["allRequestedSampleFramesExtracted"] = all((out/f"frame-{f:05}.jpg").is_file() for f in frames)
        report["contactSheets"]=make_contacts(out,midpoints,boundaries)
        report["transitionReel"]=make_reel(ffmpeg,ffprobe,movie,out,boundaries,threads)
        checks["twelveTransitionExcerpts"] = len(report["transitionReel"]["segments"])==12
        checks["transitionReelDuration"] = abs(report["transitionReel"]["seconds"]-48)<.15
        checks["transitionReelFrameCount"] = report["transitionReel"]["videoFrames"]==1440
        after=movie.stat()
        final_video_sha=sha256(movie)
        after_hash=movie.stat()
        checks["sourceMP4StableDuringQA"] = ((before.st_size,before.st_mtime_ns)==(after.st_size,after.st_mtime_ns)
                                              ==(after_hash.st_size,after_hash.st_mtime_ns)
                                              and original_video_sha==final_video_sha)
        report["videoSha256"]=final_video_sha
        report["fileBytes"]=after.st_size
        report["videoModifiedUTC"]=datetime.fromtimestamp(after.st_mtime,timezone.utc).isoformat()
        report["automatedChecksPassed"]=all(checks.values())
        report["finishedUTC"]=datetime.now(timezone.utc).isoformat()
        write_json(report_path,report)
        print(json.dumps({"report":relative(report_path),"automatedChecksPassed":report["automatedChecksPassed"],
                          "checks":checks,"originalAACMeasurement":report.get("originalAACMeasurement"),
                          "evidenceDirectory":relative(out)},ensure_ascii=False,indent=2),flush=True)
        return 0 if report["automatedChecksPassed"] else 1
    except Exception as exc:
        report["automatedChecksPassed"]=False
        report["error"]=f"{type(exc).__name__}: {exc}"
        report["finishedUTC"]=datetime.now(timezone.utc).isoformat()
        write_json(report_path,report)
        print(f"QA failed: {exc}\nReport: {report_path}",file=sys.stderr,flush=True)
        return 1


if __name__=="__main__":
    raise SystemExit(main())
