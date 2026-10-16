"""Bind the delivered v4 movie, captions, source and checked evidence together."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative):
    return json.loads((ROOT / relative).read_text("utf-8-sig"))


def record(relative):
    path = ROOT / relative
    with path.open("rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    return {"file": relative, "bytes": path.stat().st_size, "sha256": digest}


technical = read("research/qa/launch-v4-delivery.json")
visual = read("research/qa/launch-v4-independent-review.json")
contacts = read("research/qa/launch-v4-final-frames/manifest.json")
reuse = read("research/qa/launch-v4-segment-reuse.json")
render = read(f"output/launch-v4-render-{reuse['to']}/render-manifest.json")
video = record("output/ai_engineer_launch_v4_1080p60.mp4")
audio = record("public/audio/launch-v4-master.wav")
assert technical["passed"] and technical["fullDecodePassed"] and not technical["errors"]
assert video["sha256"] == technical["sha256"] == contacts["videoSHA256"]
assert visual["passed"] and visual["videoSHA256"] == video["sha256"]
assert contacts["reviewed"] and render["finished"] and render["durationInFrames"] == 6300
assert render["audioSHA256"] == audio["sha256"]
assert reuse["passed"] and reuse["applied"] and render["revision"] == reuse["to"]
baseline = read(reuse["baseline"])
inputs_digest = hashlib.sha256()
for item in baseline["oldState"]["records"]:
    inputs_digest.update(item["file"].encode("utf8"))
    inputs_digest.update((ROOT / item["file"]).read_bytes())
assert inputs_digest.hexdigest() == reuse["newInputsSHA256"], "Render inputs changed after freeze"
cleanup = read("research/qa/launch-v4-cleanup-executed.json")
assert cleanup["finalSHA256"] == video["sha256"]

qa_files = [
    "research/qa/launch-v4-delivery.json",
    "research/qa/launch-v4-independent-review.json",
    "research/qa/launch-v4-final-frames/manifest.json",
    "research/qa/launch-v4-camera.json",
    "research/qa/launch-v4-evidence.json",
    "research/qa/launch-v4-native-binding.json",
    "research/qa/launch-v4-proof-layout.json",
    "research/qa/launch-v4-native-close-layout.json",
    "research/qa/launch-v4-audio-frozen.json",
    "research/qa/launch-v4-segment-reuse.json",
    "research/qa/launch-v4-cleanup-executed.json",
]
asset_files = list(dict.fromkeys(render["assets"]))
manifest = {
    "schema": "ai-engineer-launch-v4-delivery-v1",
    "completedUTC": datetime.now(timezone.utc).isoformat(),
    "passed": True,
    "renderRevision": render["revision"],
    "renderInputsSHA256": inputs_digest.hexdigest(),
    "spec": {"seconds": 105, "width": 1920, "height": 1080, "fps": 60, "frames": 6300},
    "deliverables": [video, record("delivery/AI-Engineer-Launch-v4.zh.srt"),
                     record("delivery/AI-Engineer-Launch-v4-production.md")],
    "audioMaster": audio,
    "actualAAC": technical["finalAAC"],
    "selectedConceptBridges": 6,
    "generationRecord": record("research/generation/qwen-v4-tasks.json"),
    "QA": [record(path) for path in qa_files],
    "runtimeAssets": [record(path) for path in asset_files],
    "sourceFiles": [record(path.relative_to(ROOT).as_posix()) for path in sorted((ROOT / "src").rglob("*"))
                    if path.is_file() and path.suffix in {".ts", ".tsx", ".json", ".css"}],
    "cleanupNetRecoveredBytes": cleanup["estimatedNetRecoveredBytes"],
    "limits": [
        "Visual review sampled decoded final movie frames and transition joins; it was not continuous human playback.",
        "Speech checked by independent ASR; no human A/B listening claimed.",
        "Engineering response is saved original data replay; the ocean is illustrative.",
        "Claude calls returned incomplete; no returned code was integrated.",
        "Existing Lux3D mesh was an appearance reference, not the final engineering skeleton.",
    ],
}
target = ROOT / "delivery/AI-Engineer-Launch-v4-manifest.json"
target.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", "utf8")
print(json.dumps({"passed": True, "manifest": str(target), "videoSHA256": video["sha256"],
                  "runtimeAssets": len(asset_files), "revision": render["revision"]}))
