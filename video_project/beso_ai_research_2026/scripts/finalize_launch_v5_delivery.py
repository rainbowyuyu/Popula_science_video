"""Bind the checked v5 video, personal voice, sources and evidence into delivery."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REVISION = "bd1dd83d6aad"


def read(relative):
    return json.loads((ROOT / relative).read_text("utf-8-sig"))


def record(relative):
    path = ROOT / relative
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    return {"file": relative, "bytes": path.stat().st_size, "sha256": digest}


technical = read("research/qa/launch-v5-delivery.json")
visual = read("research/qa/launch-v5-independent-review.json")
contacts = read("research/qa/launch-v5-final-frames/manifest.json")
evidence = read("research/qa/launch-v5-independent-evidence-review.json")
render = read(f"output/launch-v5-render-{REVISION}/render-manifest.json")
camera = read("research/qa/launch-v5-camera.json")
geometry = read("research/qa/launch-v5-native-geometry.json")
audio_report = read("research/qa/audio-v5-delivery-manifest.json")
transition = read("research/qa/launch-v5-final-transition-review.json")
root_review = read("research/qa/launch-v5-root-visual-review.json")
video = record("output/ai_engineer_launch_v5_1080p60.mp4")
audio = record("public/audio/launch-v5-master.wav")
assert technical["passed"] and technical["fullDecodePassed"] and not technical["errors"]
assert video["sha256"] == technical["sha256"] == contacts["videoSHA256"] == visual["videoSHA256"]
assert visual["passed"] and contacts["reviewed"]
assert transition["passed"] and root_review["passed"]
assert transition["videoSHA256"] == root_review["videoSHA256"] == video["sha256"]
assert camera["pass"] and geometry["pass"] and not render.get("browserErrors")
assert render["finished"] and render["durationInFrames"] == 6300 and render["revision"] == REVISION
assert render["audioSHA256"] == audio["sha256"] == audio_report["masterSHA256"]
assert evidence["passedWithinScope"] and not evidence["blockingFindings"]
for item in evidence["sourceRecords"]:
    if item["file"].startswith(("src/", "public/", "delivery/")) or item["file"] == "research/launch-v5-design.json":
        assert record(item["file"])["sha256"] == item["sha256"], f'Frozen input changed: {item["file"]}'
cleanup_path = ROOT / "research/qa/launch-v5-cleanup-executed.json"
cleanup = read(cleanup_path.relative_to(ROOT)) if cleanup_path.is_file() else None
if cleanup:
    assert cleanup["finalSHA256"] == video["sha256"]
    after_cleanup = read("research/qa/launch-v5-post-cleanup.json")
    assert after_cleanup["passed"] and after_cleanup["videoSHA256"] == video["sha256"]

qa_files = ["research/qa/launch-v5-delivery.json", "research/qa/launch-v5-independent-review.json",
            "research/qa/launch-v5-independent-evidence-review.json",
            "research/qa/launch-v5-independent-preview-review.json",
            "research/qa/launch-v5-root-visual-review.json",
            "research/qa/launch-v5-final-transition-review.json",
            "research/qa/launch-v5-final-frames/manifest.json", "research/qa/launch-v5-camera.json",
            "research/qa/launch-v5-native-geometry.json", "research/qa/audio-v5-delivery-manifest.json",
            "research/qa/audio-v5-master.json", "research/qa/audio-v5-master-asr.json",
            "research/qa/audio-v5-personal-voice-provenance.json", "research/qa/audio-v5-score.json",
            "work/v5-release-review/final-audio-caption-check.json"]
if cleanup:
    qa_files.append("research/qa/launch-v5-cleanup-executed.json")
    qa_files.append("research/qa/launch-v5-post-cleanup.json")
story = read("src/launch-v5-story.json")
manifest = {
    "schema": "ai-engineer-launch-v5-delivery-v1",
    "completedUTC": datetime.now(timezone.utc).isoformat(), "passed": True,
    "renderRevision": REVISION,
    "spec": {"seconds": 105, "width": 1920, "height": 1080, "fps": 60, "frames": 6300},
    "deliverables": [video, record("delivery/AI-Engineer-Launch-v5.zh.srt"),
                     record("delivery/AI-Engineer-Launch-v5-production.md")],
    "audioMaster": audio, "actualAAC": technical["finalAAC"],
    "audioComponents": [record(f"public/audio/launch-v5-{name}.wav")
                        for name in ("narration", "music", "score-original")],
    "selectedVoiceSources": [record("public/" + clip["file"])
                             for scene in story["scenes"] for clip in scene.get("clips", [])],
    "personalVoice": record("research/qa/audio-v5-personal-voice-provenance.json"),
    "selectedFullScreenGeneratedBridges": 0,
    "priorGenerationRecords": [record("research/generation/qwen-v4-tasks.json")],
    "QA": [record(path) for path in qa_files],
    "bundledRuntimeAssets": [record(path) for path in dict.fromkeys(render["assets"])],
    "sourceFiles": [record(path.relative_to(ROOT).as_posix()) for path in sorted((ROOT / "src").rglob("*"))
                    if path.is_file() and path.suffix in {".ts", ".tsx", ".json", ".css"}],
    "fabricationSources": [record("public/assets/v5/native-fabrication-source.blend"),
                           record("public/assets/v5/blender-geometry-provenance.json")],
    "renderAndQAEntrypoints": [record("scripts/render_launch_v5.mjs"), record("scripts/verify_launch_v5.py"),
                              record("scripts/qa_launch_v5_final_frames.py"), record("scripts/cleanup_launch_v5.ps1")],
    "rollbackVideo": record("output/ai_engineer_launch_v4_1080p60.mp4"),
    "cleanupStatus": "complete" if cleanup else "pending authorized cache cleanup",
    "cleanupNetRecoveredBytes": cleanup["estimatedNetRecoveredBytes"] if cleanup else 0,
    "limits": ["Visual review sampled decoded final movie frames and dense transition strips; no continuous human playback claimed.",
               "Personal-reference voice confirmed through local provenance and independent ASR; no human A/B listening claimed.",
               "Engineering response is saved source playback; the ocean and fabrication skins are illustrative.",
               "BESO evidence and published platform comparison remain independent data chains.",
               "No new Qwen/Lux3D paid visual task or successful Claude code integration claimed for v5."],
}
target = ROOT / "delivery/AI-Engineer-Launch-v5-manifest.json"
target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf8")
print(json.dumps({"passed": True, "manifest": str(target), "videoSHA256": video["sha256"],
                  "assets": len(manifest["bundledRuntimeAssets"]), "cleanup": manifest["cleanupStatus"]}))
