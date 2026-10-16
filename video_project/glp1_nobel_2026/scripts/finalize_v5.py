"""Finalize the V6 production under stable V5 delivery names after bound QA.

Never writes src, public, audio, the frozen story, the MP4, or review decisions.
Run only after research/qa/final-v5/{automatic-report,visual-review}.json exist.
"""
from __future__ import annotations

from datetime import datetime, timezone
from fractions import Fraction
import hashlib
import json
import math
import os
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
DELIVERY = ROOT / "delivery"
QA = ROOT / "research/qa/final-v5"
VIDEO = DELIVERY / "GLP1_V5_1080p.mp4"
TITLE = "如何科学减肥？从一顿饭看懂血糖、血压和血脂"
FROZEN_STORY_SHA = "39c22eb5847bb74690c1f0941f25fcfa41cc5eb32383e77e0b9fa15719bb2d1a"
SOURCE_LOCK = "research/revision-v6/final-source-lock.json"
RENDERER = "scripts/render_full_guarded_v6.mjs"
RENDER_MODE = "single-complete-silent-remotion-render-with-locked-master-aac-mux"
AUDIO_REPORT = "research/revision-v5/lemon-audio-repair/audio-report.json"
PATCH_MODE = "c9-full-base-with-idr-local-patches-video-stream-copy"


def validate_patch_provenance(marker, video_sha, timeline_sha, master_sha):
    """Validate the composite separately; retain the full-render origin intact."""
    require(marker.get("success") is True and marker.get("singlePassRender") is False,
            "Expected completed, explicitly composite picture")
    require(marker.get("frames") == [0, 25620] and marker.get("videoSHA256") == video_sha
            and marker.get("timelineSHA256") == timeline_sha and marker.get("masterSHA256") == master_sha,
            "Composite marker belongs to other media")
    require(Path(marker.get("outputLocation", "")).resolve() == VIDEO.resolve(), "Composite output differs")
    inputs = {"tmp/final-render.json": sha(ROOT / "tmp/final-render.json")}

    def bind(path, expected):
        require(isinstance(expected, str) and re.fullmatch(r"[a-f0-9]{64}", expected), "Invalid evidence hash")
        require(sha(local_path(path)) == expected, f"Composite evidence changed: {path}")
        require(path not in inputs or inputs[path] == expected, f"Conflicting evidence: {path}")
        inputs[path] = expected

    base = marker["baseRender"]
    require(base["videoSHA256"] == "c9f90b7b6c2f79a9238d38e82c752394c4faf1419eed40b36b30e4e2b164e8a4",
            "Unexpected complete baseline")
    for path_key, hash_key in (("video", "videoSHA256"), ("markerPath", "markerSHA256"),
                               ("sourceLock", "sourceLockSHA256"), ("validation", "validationSHA256"),
                               ("manifest", "manifestSHA256")):
        bind(base[path_key], base[hash_key])
    original = read(local_path(base["markerPath"]))
    require(original == base["marker"] and original.get("singlePassRender") is True
            and original.get("renderMode") == RENDER_MODE and original.get("videoSHA256") == base["videoSHA256"],
            "Original complete render was altered")
    bind(SOURCE_LOCK, original["sourceLockSHA256"])
    bind(RENDERER, original["runnerSHA256"])
    base_lock = read(local_path(base["sourceLock"]))
    old = {}
    for row in base_lock["files"]:
        require(row["path"] not in old, "Duplicate baseline input")
        old[row["path"]] = row["sha256"]
        bind(row["snapshot"], row["sha256"])
    require(old == original["sourceHashes"], "Baseline snapshot inventory differs")
    bind(marker["sourceLock"], marker["sourceLockSHA256"])
    lock = read(local_path(marker["sourceLock"]))
    current = {}
    for row in lock["files"]:
        require(row["path"] not in current, "Duplicate patched input")
        current[row["path"]] = row["sha256"]
        bind(row["path"], row["sha256"])
        bind(row["snapshot"], row["sha256"])
    require(len(current) == 268 and current.keys() == old.keys() and current == marker["sourceHashes"],
            "Patch source inventory differs")
    require({key for key in current if current[key] != old[key]} == {"src/V5World.ts", "src/V5HandoffContext.ts"},
            "Unexpected changed source")
    for directory in ("src", "public"):
        require({p.relative_to(ROOT).as_posix() for p in (ROOT / directory).rglob("*") if p.is_file()}
                == {p for p in current if p.startswith(directory + "/")}, "Current input inventory differs")
    comp = marker["composition"]
    for path_key, hash_key in (("planPath", "planSHA256"), ("composer", "composerSHA256"),
                               ("verifier", "verifierSHA256"), ("validation", "validationSHA256")):
        bind(comp[path_key], comp[hash_key])
    require(comp["sourceLock"] == marker["sourceLock"] and comp["sourceLockSHA256"] == marker["sourceLockSHA256"],
            "Composer source lock differs")
    require([(p["start"], p["end"]) for p in marker["patches"]] == [(12000, 12249), (20250, 20749)],
            "Unexpected patch ranges")
    for patch in marker["patches"]:
        bind(patch["video"], patch["videoSHA256"])
        bind(patch["marker"], patch["markerSHA256"])
        record = read(local_path(patch["marker"]))
        require(record == patch["markerData"] and record["sourceHashes"] == current
                and record["silent"] is True and record["audioIncluded"] is False
                and record["frames"] == [patch["start"], patch["end"]], "Patch marker differs")
        bind(record["runner"], record["runnerSHA256"])
    bind(marker["validation"], marker["validationSHA256"])
    validation = read(local_path(marker["validation"]))
    require(validation.get("automaticChecksPass") is True and validation.get("fullDecodeSuccess") is True
            and validation.get("decodedFrames") == 25621 and validation.get("videoSHA256") == video_sha,
            "Composite validation incomplete")
    matched = validation["frameCorrespondence"]
    require(matched["allFramesMatched"] is True and matched["PTSExact"] is True
            and matched["baseFramesMatched"] == 24871 and matched["patchFramesMatched"] == 750,
            "Decoded frame correspondence failed")
    def bind_hash_reports(value):
        if isinstance(value, dict):
            if "path" in value and "sha256" in value:
                bind(value["path"], value["sha256"])
            else:
                for item in value.values(): bind_hash_reports(item)
        elif isinstance(value, list):
            for item in value: bind_hash_reports(item)
    bind_hash_reports(matched["hashReports"])
    if validation.get("validationPipeline") == "authenticated-base-frame-cache-and-final-full-decode-v2":
        cache = matched["baseCache"]
        require(cache["cacheAuthenticated"] is True and cache["originalVideoSHA256"] == base["videoSHA256"],
                "Cached baseline identity differs")
        bind(cache["path"], cache["sha256"])
        bind(cache["proof"], cache["proofSHA256"])
        copy_evidence = validation["videoCopyEvidence"]
        require(copy_evidence["packetCount"] == 25621 and copy_evidence["allPayloadsAndPTSAndDTSMatched"] is True
                and copy_evidence["codecConfigMatched"] is True, "Copied picture payload differs")
        bind_hash_reports(copy_evidence["reports"])
        for normalized in validation.get("patchTimebaseNormalization", []):
            require(normalized["reencoded"] is False and normalized["allPayloadsAndPTSAndDTSMatched"] is True,
                    "Patch timebase normalization changed encoded picture")
            bind(normalized["video"], normalized["sha256"])
            bind_hash_reports(normalized["reports"])
    mux = validation["audioMux"]
    require(mux == comp["audioMux"] and mux["masterSHA256"] == master_sha and mux["videoCodec"] == "copy"
            and all(mux[key] is False for key in ("trimmed", "padded", "timeStretched")), "Composite audio changed")
    comparison = validation["audioComparison"]
    require(comparison["masterSHA256"] == master_sha and comparison["zeroLagVerified"] is True
            and comparison["correlation"] >= .995, "Composite audio alignment failed")
    return marker, validation, inputs


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def require(condition, message):
    if not condition:
        raise ValueError(message)


def local_path(relative: str) -> Path:
    path = (ROOT / relative).resolve(strict=True)
    require(path.is_relative_to(ROOT.resolve()) and path.is_file(), f"Invalid project file: {relative}")
    return path


def milliseconds(frame: int, fps: int) -> int:
    return round(Fraction(frame * 1000, fps))


def timecode(frame: int, fps: int, srt=False) -> str:
    ms = milliseconds(frame, fps)
    hours, rest = divmod(ms, 3_600_000)
    minutes, rest = divmod(rest, 60_000)
    seconds, rem = divmod(rest, 1000)
    if srt:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d},{rem:03d}"
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}" if hours else f"{minutes:02d}:{seconds:02d}"


def duration_text(frames: int, fps: int) -> str:
    ms = milliseconds(frames, fps)
    minutes, rem = divmod(ms, 60_000)
    return f"{minutes}分{rem / 1000:06.3f}秒"


def update_source_duration(prefix: str, clips: int, duration: str, coda_seconds: float) -> str:
    """Refresh the owned summary line both before and after an earlier finalization."""
    summary = f"口播为{clips}句；本集实际时长{duration}，含{coda_seconds:g}秒参考资料尾段。"
    updated, count = re.subn(
        r"(?m)^口播为\d+句；(?:本集实际时长|最终片长)[^\r\n]*",
        lambda _: summary,
        prefix,
    )
    require(count == 1, "Expected exactly one V5 narration/duration summary line")
    return updated


def update_source_audio(prefix: str, audio_report: dict) -> str:
    """Replace the owned music row/paragraph, leaving scientific licenses intact."""
    row = ("| 配乐音源 | 用户指定本地文件《幽蓝键 - Lemon Tree (柠檬树) - 钢琴曲》；"
           "本版作乐句衔接、均衡及旁白闪避，保留原曲速度和音高。"
           "曲目权利属于相应权利人，不适用原版器乐采样的CC0许可。 |")
    prefix, count = re.subn(r"(?m)^\| 配乐音源 \|[^\r\n]*$", lambda _: row, prefix)
    require(count == 1, "Expected exactly one owned music attribution row")
    audio_text = ("本轮V6保留实测时间线和本系列授权参考音色，只重新合成开头h001；"
                  "新句自然语速8.08秒，未变速，h002以后的独立旁白逐采样保持一致，保留既有多音字修复。"
                  "配乐使用用户指定的Lemon Tree钢琴录音，长乐句交叠、内容渐变与旁白闪避均在同一原曲上完成；"
                  "没有另加鼓点或任意变调。"
                  f"自动节拍估计约{audio_report['estimatedBpm']:.2f} BPM，不等于人工核谱。"
                  "片尾接回原曲自然结尾。音乐来源、实际处理、母带及检查片段记录在 "
                  f"`{AUDIO_REPORT}`。具体响度以最终编码测量为准。"
                  "ASR和波形检查用于筛查漏词、截断和读音疑点，不等于主观听审，也不证明“广播级”音质。")
    prefix, count = re.subn(r"(## 声音与真实论文页)[\t ]*\n+[\s\S]*?(?=\n\n片尾当前采用)",
                            lambda m: m[1] + "\n\n" + audio_text, prefix, count=1)
    require(count == 1, "Cannot identify the owned sound paragraph without changing paper text")
    require("餐后晴光" not in prefix and "VSCO 2" not in prefix and "94 BPM" not in prefix,
            "An obsolete music description remains in current source document")
    return prefix


def validate_render_provenance(video_sha: str, timeline_sha: str, master_sha: str):
    """Bind final delivery to the current full silent render, source and mux evidence."""
    marker_path = local_path("tmp/final-render.json")
    marker = read(marker_path)
    if marker.get("renderMode") == PATCH_MODE:
        return validate_patch_provenance(marker, video_sha, timeline_sha, master_sha)
    require(marker.get("success") is True and marker.get("renderMode") == RENDER_MODE
            and marker.get("singlePassRender") is True, "Expected the completed V6 full silent render")
    require(marker.get("frames") == [0, 25620], "Renderer marker does not cover the full film")
    require(marker.get("videoSHA256") == video_sha and marker.get("timelineSHA256") == timeline_sha
            and marker.get("masterSHA256") == master_sha, "Renderer marker belongs to different media")
    require(Path(marker.get("outputLocation", "")).resolve() == VIDEO.resolve(), "Marker targets another delivery")
    require(marker.get("sourceLock") == SOURCE_LOCK and marker.get("runner") == RENDERER,
            "Renderer marker uses a previous production pipeline")
    lock_path, runner_path = local_path(SOURCE_LOCK), local_path(RENDERER)
    require(marker.get("sourceLockSHA256") == sha(lock_path)
            and marker.get("runnerSHA256") == sha(runner_path), "Current source lock or renderer changed")
    lock = read(lock_path)
    require(isinstance(lock.get("files"), list) and bool(lock["files"]), "Missing source-lock inventory")
    expected, inputs = {}, {"tmp/final-render.json": sha(marker_path), SOURCE_LOCK: sha(lock_path), RENDERER: sha(runner_path)}
    for item in lock["files"]:
        key, digest = item["path"], item["sha256"]
        require(key not in expected and bool(re.fullmatch(r"[a-f0-9]{64}", digest)), "Duplicate/invalid locked input")
        require(sha(local_path(key)) == digest, f"Locked input changed after render: {key}")
        snapshot = item["snapshot"]
        require(local_path(snapshot) != local_path(key) and sha(local_path(snapshot)) == digest,
                f"Frozen source snapshot differs: {key}")
        expected[key] = digest
        inputs[key], inputs[snapshot] = digest, digest
    require(marker.get("sourceHashes") == expected, "Renderer did not use the complete current source lock")
    for directory in ("src", "public"):
        current = {p.relative_to(ROOT).as_posix() for p in (ROOT / directory).rglob("*") if p.is_file()}
        locked = {p for p in expected if p.startswith(directory + "/")}
        require(current == locked, f"Current {directory} inventory differs from full-render inputs")
    for path in ("docs/story-v5.json", "src/timeline.json", "public/master.wav", "package.json", "package-lock.json"):
        require(path in expected, f"Required input is absent from source lock: {path}")
    require(marker.get("publicAssetHashes") == {k: v for k, v in expected.items() if k.startswith("public/")},
            "Renderer public asset inventory differs from frozen inputs")
    validation_key = marker.get("validation", "")
    require(validation_key == "tmp/v6-full-final/validation.json", "Unexpected renderer validation path")
    validation_path = local_path(validation_key)
    require(sha(validation_path) == marker.get("validationSHA256"), "Renderer validation changed")
    validation = read(validation_path)
    require(validation.get("automaticChecksPass") is True and validation.get("fullDecodeSuccess") is True
            and validation.get("decodedFrames") == 25621, "Full renderer validation did not pass")
    mux = validation.get("audioMux", {})
    require(mux == marker.get("audioMux") and mux.get("masterSHA256") == master_sha,
            "Renderer and validation disagree about locked audio mux")
    require(mux.get("remotionMuted") is True and mux.get("remotionInputProps", {}).get("audio") is False
            and mux.get("videoCodec") == "copy" and mux.get("videoPayloadUnchanged") is True,
            "Delivery was not made from silent picture plus copied video payload")
    require(all(mux.get(key) is False for key in ("trimmed", "padded", "timeStretched")),
            "Locked full audio was trimmed, padded or time stretched")
    comparison = validation.get("audioComparison", {})
    require(comparison.get("masterSHA256") == master_sha and comparison.get("zeroLagVerified") is True
            and comparison.get("correlation", 0) >= .995, "Final AAC/master zero-lag correspondence is unverified")
    inputs[validation_key] = sha(validation_path)
    return marker, validation, inputs


def validate_timeline(tl, story):
    require(tl.get("revision", "").lower() == "v5" and tl.get("draft") is False,
            "A measured, non-draft V5 timeline is required")
    require(tl.get("storySHA256") == FROZEN_STORY_SHA, "Timeline points to a different story")
    require(tl.get("voiceSpeedFactor") == 1, "Unexpected narration time stretching")
    fps, frames = tl["fps"], tl["duration"]
    require(isinstance(fps, int) and fps > 0 and isinstance(frames, int) and frames > 0,
            "Timeline frame units must be positive integers")
    require(tl.get("durationFrames", frames) == frames, "Conflicting frame counts")
    require(abs(tl.get("durationSeconds", frames / fps) - frames / fps) < 1e-6,
            "Conflicting timeline duration")
    clips = tl["clips"]
    require([c["id"] for c in clips] == [c["id"] for c in story["shots"]], "Frozen shot order changed")
    previous_end = 0
    for clip, original in zip(clips, story["shots"]):
        require(clip["text"] == original["text"] and clip["ttsText"] == original["ttsText"],
                f"Frozen narration changed: {clip['id']}")
        require(isinstance(clip["start"], int) and isinstance(clip["end"], int)
                and previous_end <= clip["start"] < clip["end"] <= frames,
                f"Invalid clip timing: {clip['id']}")
        require(clip["duration"] == clip["end"] - clip["start"], "Clip duration mismatch")
        previous_end = clip["end"]
    lookup = {c["id"]: c for c in clips}
    previous_end = 0
    require(bool(tl["captions"]), "Missing timed captions")
    for caption in tl["captions"]:
        start, end = caption["start"], caption["end"]
        require(isinstance(start, int) and isinstance(end, int)
                and previous_end <= start < end <= frames and caption["text"].strip(), "Invalid caption")
        clip = lookup[caption["clipId"]]
        require(clip["start"] <= start < end <= clip["end"], "Caption falls outside its narration clip")
        previous_end = end


def subtitle_text(tl) -> str:
    return "\n\n".join(f"{index}\n{timecode(c['start'], tl['fps'], True)} --> "
                       f"{timecode(c['end'], tl['fps'], True)}\n{c['text']}"
                       for index, c in enumerate(tl["captions"], 1)) + "\n"


def chapters_from_timeline(tl):
    chapters = []
    for clip in tl["clips"]:
        title = clip.get("chapter", "").strip()
        require(bool(title), f"Missing measured chapter metadata: {clip['id']}")
        if not chapters or title != chapters[-1]["title"]:
            chapters.append({"title": title, "startFrame": clip["start"], "clipId": clip["id"]})
    coda = tl["clips"][-1]["end"]
    if coda < tl["duration"]:
        chapters.append({"title": "参考论文与资料", "startFrame": coda, "clipId": None})
    for index, chapter in enumerate(chapters):
        chapter["endFrame"] = chapters[index + 1]["startFrame"] if index + 1 < len(chapters) else tl["duration"]
        chapter["startMilliseconds"] = milliseconds(chapter["startFrame"], tl["fps"])
        chapter["endMilliseconds"] = milliseconds(chapter["endFrame"], tl["fps"])
        chapter["displayTime"] = timecode(chapter["startFrame"], tl["fps"])
    return chapters


def managed_block(text: str, name: str, body: str) -> str:
    start, end = f"<!-- {name}:START -->", f"<!-- {name}:END -->"
    block = f"{start}\n{body.strip()}\n{end}"
    if start in text or end in text:
        require(text.count(start) == text.count(end) == 1, f"Malformed generated block: {name}")
        return re.sub(re.escape(start) + r"[\s\S]*?" + re.escape(end), lambda _: block, text)
    return text.rstrip() + "\n\n" + block + "\n"


def atomic_text(path: Path, text: str):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".finalize.tmp")
    temporary.write_text(text.rstrip() + "\n", encoding="utf-8")
    os.replace(temporary, path)


def validate_reports(qa, review, tl, video_sha, timeline_sha):
    require(qa.get("automaticChecksPass") is True and bool(qa.get("checks"))
            and all(value is True for value in qa["checks"].values()), "Automatic final-video checks have not passed")
    require(review.get("sampledVisualReviewCompleted") is True, "Recorded sampled visual review is not complete")
    for key in ("blockingIssues", "openBlockingFindings"):
        require(not review.get(key, []), f"Unresolved visual blockers: {key}")
    require(qa.get("videoSHA256") == review.get("videoSHA256") == video_sha, "Video hash differs from reviewed file")
    require(qa.get("timelineSHA256") == review.get("timelineSHA256") == timeline_sha, "Timeline hash differs from QA")
    measured = qa["measured"]
    require(measured["decodedFrames"] == measured["metadataFrames"] == tl["duration"], "Encoded frame count mismatch")
    require(abs(float(measured["fps"]) - tl["fps"]) < .0001, "Encoded FPS mismatch")
    require(abs(measured["videoDurationSeconds"] - tl["duration"] / tl["fps"]) <= 1 / tl["fps"], "Encoded duration mismatch")
    for key in ("aacIntegratedLUFS", "aacTruePeakDBTP", "aacLoudnessRangeLU"):
        require(math.isfinite(float(measured[key])), f"Non-finite AAC measurement: {key}")


def main():
    # Read both reports before any writes or media hashing. Absence is a hard
    # stop, not permission to manufacture a review or reuse a prior revision.
    qa_path, review_path = QA / "automatic-report.json", QA / "visual-review.json"
    require(qa_path.is_file() and review_path.is_file(), "Both final-v5 automatic-report.json and visual-review.json are required")
    qa, review = read(qa_path), read(review_path)
    story_path, tl_path = ROOT / "docs/story-v5.json", ROOT / "src/timeline.json"
    story, tl = read(story_path), read(tl_path)
    require(sha(story_path) == FROZEN_STORY_SHA, "Frozen source narration changed")
    validate_timeline(tl, story)
    video_sha, timeline_sha = sha(VIDEO), sha(tl_path)
    validate_reports(qa, review, tl, video_sha, timeline_sha)
    inputs = {"docs/story-v5.json": FROZEN_STORY_SHA, "src/timeline.json": timeline_sha,
              "delivery/GLP1_V5_1080p.mp4": video_sha,
              "research/qa/final-v5/automatic-report.json": sha(qa_path),
              "research/qa/final-v5/visual-review.json": sha(review_path)}
    installation_path = ROOT / "research/revision-v6/audio-installation.json"
    installation = read(installation_path)
    require(installation.get("installed") is True and installation.get("storySHA256") == FROZEN_STORY_SHA,
            "V6 audio installation is not locked to this narration")
    require(installation.get("timelineSHA256") == timeline_sha, "Installed audio timeline differs")
    require(isinstance(installation.get("files"), list) and bool(installation["files"]), "Missing installation file list")
    installed_destinations = set()
    for item in installation["files"]:
        require(item["destination"] not in installed_destinations, "Duplicate installed destination")
        installed_destinations.add(item["destination"])
        require(sha(local_path(item["destination"])) == item["sha256"], f"Installed file changed: {item['destination']}")
        inputs[item["destination"]] = item["sha256"]
    require({"docs/story-v5.json", "src/timeline.json", "public/timeline.json", "public/master.wav",
             "public/narration.wav", "public/music.wav", "public/voice/h001.wav"} <= installed_destinations,
            "Installation omits a required current narration/timeline/music asset")
    master_sha = sha(ROOT / "public/master.wav")
    require(master_sha == installation["masterSHA256"], "Installed master audio changed")
    if "masterSHA256" in review:
        require(review["masterSHA256"] == master_sha, "Review refers to a different master")
    inputs["research/revision-v6/audio-installation.json"] = sha(installation_path)
    inputs["public/master.wav"] = master_sha
    marker, render_validation, render_inputs = validate_render_provenance(video_sha, timeline_sha, master_sha)
    inputs.update(render_inputs)
    audio_report_path = local_path(AUDIO_REPORT)
    audio_report = read(audio_report_path)
    require(audio_report.get("hashes", {}).get("master.wav") == master_sha
            and audio_report.get("hashes", {}).get("timeline.json") == timeline_sha,
            "Current soundtrack report refers to another master or timeline")
    inputs[AUDIO_REPORT] = sha(audio_report_path)
    frames, fps = tl["duration"], tl["fps"]
    duration = duration_text(frames, fps)
    chapters = chapters_from_timeline(tl)
    bookmarks = "\n".join(f"{c['displayTime']} {c['title']}" for c in chapters)
    measured = qa["measured"]
    coda_seconds = (frames - tl["clips"][-1]["end"]) / fps
    listening = review.get("fullDurationSubjectiveAudioListeningCompleted") is True or review.get("subjectiveFullListeningCompleted") is True
    full_viewing = review.get("fullDurationSubjectivePlaybackCompleted") is True or review.get("fullDurationAudiovisualReviewCompleted") is True
    review_scope = ("已完成记录范围内的最终编码画面抽样检查；实际打开文件、帧段、判断及局限见"
                    " `research/qa/final-v5/visual-review.json`。提取图像数量不等于人工看过的数量。")
    audiovisual_scope = (f"全片主观观看：{'报告明确记录已完成' if full_viewing else '未记录完成'}；"
                        f"全长主观听审：{'报告明确记录已完成' if listening else '未记录完成，不作通过声明'}。")
    paper_names = re.findall(r"file:'([^']+)'", (ROOT / "src/V5Film.tsx").read_text(encoding="utf-8-sig"))
    require(len(paper_names) == 3 and len(set(paper_names)) == 3, "Expected three explicit V5 coda paper images")
    papers = {"public/papers/" + name: sha(local_path("public/papers/" + name)) for name in paper_names}
    inputs.update(papers)
    source_path = DELIVERY / "制作与来源-v5.md"
    source = source_path.read_text(encoding="utf-8-sig")
    prefix, separator, _ = source.partition("## 最终检查记录")
    require(bool(separator), "Cannot locate existing V5 final-check section")
    prefix = update_source_duration(prefix, len(tl["clips"]), duration, coda_seconds)
    prefix = update_source_audio(prefix, audio_report)
    prefix = re.sub(r"\A# [^\r\n]+", lambda _: "# " + TITLE, prefix, count=1)
    prefix = prefix.replace("特别篇｜V5 制作与来源", "特别篇｜本轮V6 制作与来源（文件名沿用V5）")
    prefix = prefix.replace("最终实际展示文件和哈希待成片核对后回填。", "最终实际展示文件和哈希见文末检查记录。")
    composite = marker.get("renderMode") == PATCH_MODE
    production_note = ("V6完整渲染后，对两处透明层交接重新渲染750帧，按IDR边界替换；"
                       "其余24871帧与完整基线解码像素逐帧一致。补片内750帧与各自渲染片段逐帧一致，"
                       "全片PTS与锁定母带零偏移核验通过。" if composite else
                       f"本轮全部{frames}帧由V6静音完整渲染产生，视频流直接复制并合入锁定母带；渲染标记、源锁和零偏移音轨验证一致。")
    final_section = f'''## 最终检查记录

- 最终视频：`delivery/GLP1_V5_1080p.mp4`。
- 时长：{duration}（{frames / fps:.9f}秒）；{measured['width']}×{measured['height']}，{fps} fps，{frames}帧。
- 旁白：{len(tl['clips'])}句；字幕：{len(tl['captions'])}条；参考资料尾段：{coda_seconds:g}秒。
- 视频SHA-256：`{video_sha}`。
- 冻结口播SHA-256：`{FROZEN_STORY_SHA}`。
- 时间线SHA-256：`{timeline_sha}`；母带SHA-256：`{master_sha}`。
- {production_note}
- 自动整片检查通过：完整解码、帧数、时长、BT.709、AAC、黑场与计划取样；报告为 `research/qa/final-v5/automatic-report.json`。
- 最终AAC：{measured['aacIntegratedLUFS']:.2f} LUFS，真峰值{measured['aacTruePeakDBTP']:.2f} dBTP，LRA {measured['aacLoudnessRangeLU']:.2f} LU。
- {review_scope}
- {audiovisual_scope}

ASR、数值检查和抽样检查均不能替代完整主观听审。医学与模型边界仍以本文件和 `research/revision-v5/medical-visual-audit.md` 为准。

### 章节书签

{bookmarks}

章节从实际时间线的chapter字段与片尾起点生成，显示时间向下取整至秒；精确毫秒书签另见 `GLP1_V5-chapters.ffmetadata`。

### 片尾文件校验

''' + "\n".join(f"- `{name}`：`{digest}`。" for name, digest in papers.items()) + '''

### 复现

入口为 `src/index.tsx` → `V5Film.tsx`，镜头与场景分别在 `V5CameraPath.ts`、`V5World.ts`。使用已安装音频和实测时间线；不要用草稿重新估时覆盖它们。完整命令和输入校验见 `delivery/交付复现-v5.md`。
'''
    source = prefix.rstrip() + "\n\n" + final_section
    narration = [f"# {TITLE}", "", f"rainbow鱼 · 每天5分钟科普 · 特别篇｜本轮V6（文件名沿用V5）｜{duration}", "",
                 f"{len(tl['clips'])}句原口播；按最终时间线标记，不改写冻结文案。", ""]
    previous = None
    for clip in tl["clips"]:
        if clip["chapter"] != previous:
            narration.extend([f"## {timecode(clip['start'], fps)} {clip['chapter']}", ""])
            previous = clip["chapter"]
        narration.extend([f"**{clip['id']} · {timecode(clip['start'], fps, True).replace(',', '.')}**", "", clip["text"], ""])
    promo_path = DELIVERY / "发布文案-v5.md"
    promo = promo_path.read_text(encoding="utf-8-sig")
    # Candidate-stage production notes remain in research, not publishable copy.
    promo, removed_notes = re.subn(
        r"(?m)^## 内部交付备注（不随正文发布）[\t ]*\n[\s\S]*?(?=^## |^<!-- V5_|\Z)",
        "", promo,
    )
    require(removed_notes <= 1, "Duplicate internal delivery-note sections")
    duration_body = f"本集实际时长：**{duration}**，含{coda_seconds:g}秒参考资料。系列为“每天5分钟科普 · 特别篇”，本集按完整内容展开。"
    if "<!-- V5_MEASURED_DURATION:START -->" not in promo and "rainbow鱼 · 每天5分钟科普特别篇" in promo:
        promo = promo.replace("rainbow鱼 · 每天5分钟科普特别篇",
                              "rainbow鱼 · 每天5分钟科普特别篇\n\n" + managed_block("", "V5_MEASURED_DURATION", duration_body).strip(), 1)
    else:
        promo = managed_block(promo, "V5_MEASURED_DURATION", duration_body)
    promo = managed_block(promo, "V5_MEASURED_CHAPTERS", "## B站／长视频章节书签\n\n" + bookmarks)
    ffmetadata = [";FFMETADATA1", "title=" + TITLE]
    for c in chapters:
        escaped = re.sub(r"([\\=;#])", r"\\\1", c["title"]).replace("\n", "\\\n")
        ffmetadata.extend(["[CHAPTER]", "TIMEBASE=1/1000", f"START={c['startMilliseconds']}",
                           f"END={c['endMilliseconds']}", "title=" + escaped])
    repro = f'''# 本轮V6交付复现（文件名沿用V5）

标题：{TITLE}

使用当前安装的{len(installation['files'])}项文件、冻结口播、实测时间线与配乐。交付：{duration}，{frames}帧，{fps} fps，{len(tl['captions'])}条字幕。

本轮生产使用以下入口；它绑定当次源锁与回退基线。完成后再次运行会拒绝覆盖已改变的交付，需先为新的运行建立独立输出目录、源锁和回退基线，不能删除校验绕过保护。

```powershell
npm run check
node scripts/run_full_v6.mjs --validate-only
node scripts/run_full_v6.mjs
python scripts/qa_final.py --revision v5
```

随后实际检查最终编码画面及连续片段，将真实范围、发现、视频与时间线SHA写入 `research/qa/final-v5/visual-review.json`。该人工／模型视觉步骤没有自动“通过”命令；更换视频后必须重新验证报告绑定。

`scripts/run_full_v6.mjs` 将渲染子进程的TEMP/TMP定位到工程D盘的 `tmp/v6-render-temp/`，并调用 `{RENDERER}`；不修改系统环境变量。本轮一次输出全部{frames}帧静音画面，源锁为 `{SOURCE_LOCK}`，独显记录、静音视频和最终验证保存在 `tmp/v6-full-final/`。Remotion层显式禁用音频，随后从零时刻编码完整锁定母带为AAC，视频包直接复制，未截断、补齐或变速母带。`audio-mux.json` 与 `validation.json` 保存视频包SHA、全长解码以及AAC对母带的零偏移相关检查；`tmp/final-render.json` 绑定当前成片、源码、依赖、时间线、母带及执行器哈希。仅自动核验完成后才安装成片，随后另做当前编码画面审查。

历史V5的补片版只作为本轮回退基线保留在 `research/revision-v6/base/`，不属于本轮画面的生成方式。

仅在两份最终报告齐全且通过后执行：

```powershell
python scripts/finalize_v5.py
python scripts/package_delivery_v5.py
```

文档收尾脚本不改src、public、声音或视频，也不重跑TTS。ZIP仅收四张封面与四份文字／字幕文件，沿用V5文件名，不含MP4、模型和原始声音。可将 `GLP1_V5-chapters.ffmetadata` 用于另行制作带章节的视频副本；文档收尾不重封装已验收MP4。

{audiovisual_scope}

## 本次输入校验

''' + "\n".join(f"- `{name}`：`{digest}`" for name, digest in inputs.items()) + "\n"
    if composite:
        repro = f'''# 本轮V6交付复现（文件名沿用V5）

标题：{TITLE}。交付：{duration}，{frames}帧，{fps} fps。

{production_note}

完整c9基线、原渲染标记、268项冻结输入及解码验证保留在 `research/revision-v6/continuity-repair/base/`。原完整渲染使用 `scripts/run_full_v6.mjs`；本次补片只修改V5World.ts与V5HandoffContext.ts的两段光学交接，时间线、配音、模型尺寸和镜头轨迹不变。补片来源锁为 `{marker['sourceLock']}`，记录独立快照，不覆盖原完整源锁。

本次执行过的生产入口如下。它们绑定当前c9基线，交付安装后再次运行会拒绝覆盖；复现须在独立输出目录中恢复对应基线并保留全部校验，不能删除保护强行重跑。

```powershell
node scripts/render_continuity_patch_v6.mjs --render --source-lock={marker['sourceLock']} --output-dir={Path(marker['patches'][0]['video']).parent.as_posix()}
python {marker['composition']['composer']} --plan={marker['composition']['planPath']} --output-dir={Path(marker['candidate']).parent.as_posix()} --candidate
python {marker['composition']['composer']} --plan={marker['composition']['planPath']} --output-dir={Path(marker['candidate']).parent.as_posix()} --install
python scripts/qa_final.py --revision v5
```

补片[12000,12249]、[20250,20749]在原片真IDR边界衔接。视频流复制拼接，完整master.wav从零时刻一次编码为AAC；音轨没有裁剪、拼段、补齐或变速。完整25621帧以原始YUV逐帧核验，补片外对原片、补片内对独立渲染片；帧号与PTS一致，所有验证材料及哈希列在 `tmp/final-render.json` 的baseRender、patches和composition字段。该标记明确singlePassRender=false。

随后进行真实编码图像抽查，记录在 `research/qa/final-v5/visual-review.json`。只有自动检查与实际抽样审查都完成、没有未解决阻塞项后，才执行 `python scripts/finalize_v5.py` 与 `python scripts/package_delivery_v5.py`。文档收尾不更改声音、模型或视频；ZIP含四张封面、文案、解说、来源说明与SRT，不含MP4。

{audiovisual_scope}

## 本次输入校验

''' + "\n".join(f"- `{name}`：`{digest}`" for name, digest in inputs.items()) + "\n"
    outputs = {
        source_path: source, DELIVERY / "解说稿-v5.md": "\n".join(narration),
        DELIVERY / "GLP1_V5.srt": subtitle_text(tl), promo_path: promo,
        DELIVERY / "章节-v5.txt": bookmarks, DELIVERY / "GLP1_V5-chapters.ffmetadata": "\n".join(ffmetadata),
        DELIVERY / "交付复现-v5.md": repro,
    }
    # Recheck all bound documents before committing. Frozen inputs are only read.
    for relative, digest in inputs.items():
        require(sha(local_path(relative)) == digest, f"Input changed during finalization: {relative}")
    for path, text in outputs.items():
        atomic_text(path, text)
    report = {"revision": "v5", "productionRevision": "v6", "createdUTC": datetime.now(timezone.utc).isoformat(),
              "title": TITLE, "videoSHA256": video_sha, "timelineSHA256": timeline_sha,
              "durationFrames": frames, "durationSeconds": frames / fps,
              "captionCount": len(tl["captions"]), "shotCount": len(tl["clips"]),
              "installedFilesVerified": len(installation["files"]), "inputsSHA256": inputs,
              "masterSHA256": master_sha, "renderMode": marker["renderMode"],
              "sourceLockSHA256": marker["sourceLockSHA256"],
              "rendererSHA256": marker["composition"]["composerSHA256"] if composite else marker["runnerSHA256"],
              "singlePassRender": not composite,
              "renderMarkerSHA256": inputs["tmp/final-render.json"],
              "chapters": chapters, "outputsSHA256": {p.relative_to(ROOT).as_posix(): sha(p) for p in outputs},
              "sampledVisualReviewCompleted": True, "fullDurationSubjectivePlaybackCompleted": full_viewing,
              "fullDurationSubjectiveAudioListeningCompleted": listening,
              "scope": "Documents reflect existing hash-matched QA; this script does not perform or invent viewing/listening."}
    atomic_text(ROOT / "research/revision-v5/finalization.json", json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({"revision": "v5", "duration": duration, "filesWritten": len(outputs),
                      "chapters": len(chapters), "captions": len(tl["captions"]), "videoSHA256": video_sha}, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
