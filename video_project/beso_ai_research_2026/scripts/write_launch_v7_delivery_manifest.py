"""Bind the delivered film, retained inputs and honest review limits to SHA-256."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(relative):
    return json.loads((ROOT / relative).read_text(encoding="utf-8-sig"))


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def main():
    qa = read("research/qa/launch-v7-delivery.json")
    film = ROOT / "output/ai_engineer_launch_v7_1080p60.mp4"
    actual = digest(film)
    if not (qa.get("technicalPassed") and qa.get("fullDecodePassed")
            and qa.get("decodedFrames") == 6300 and qa.get("sha256") == actual):
        raise RuntimeError("Verified complete v7 delivery required; no cleanup gate written")
    candidates = [p for p in (ROOT / "output").glob("launch-v7-render-*/render-manifest.json")
                  if json.loads(p.read_text("utf8")).get("finalSHA256") == actual]
    if len(candidates) != 1:
        raise RuntimeError("Exactly one frozen render manifest must match the final film")
    render = json.loads(candidates[0].read_text("utf8"))
    bridges = read("research/generation/launch-v7-bridges.json")
    frames = read("research/qa/launch-v7-final-frames/manifest.json")
    if frames.get("videoSHA256") != actual:
        raise RuntimeError("Visual extraction report must match the final encode")
    inputs = {r["file"] for r in render["sourceAssets"]}
    inputs.update({"package.json", "package-lock.json", "tsconfig.json",
                   "public/beso-research/web-live/v7/visual-data.json",
                   "public/beso-research/web-live/v7/replan-visual.json",
                   "public/beso-research/web-live/v7/capture-manifest.json",
                   "research/v7-product-evidence.json",
                   "delivery/AI-Engineer-Launch-v7.zh.srt",
                   "delivery/AI-Engineer-Launch-v7.md",
                   "delivery/AI-Engineer-Launch-v7-audio-notes.md",
                   "delivery/AI-Engineer-Launch-v7-qwen-notes.md",
                   "research/qa/launch-v7-final-frames/manifest.json",
                   "scripts/render_launch_v7.mjs",
                   "scripts/renderer-options.mjs",
                   "scripts/verify_launch_v7.py",
                   "scripts/qa_launch_v7_final_frames.py",
                   "scripts/qa_launch_v7_camera.mjs",
                   "scripts/reuse_launch_v7_final_patch_segments.py",
                   "scripts/reuse_launch_v7_opaque_ink_segments.py",
                   "research/generation/qwen-v7-tasks.json",
                   "research/generation/qwen-v7-final-freeze.json"})
    for bridge in bridges["bridges"]:
        if bridge.get("selection") == "selected":
            inputs.update({"public/" + bridge["asset"], bridge["firstAnchor"], bridge["lastAnchor"]})
    for folder in ("public/voice/v7-rainbow", "work/v7-audio", "research/qa"):
        for p in (ROOT / folder).rglob("*"):
            if p.is_file() and (folder != "research/qa" or "v7" in p.name):
                inputs.add(p.relative_to(ROOT).as_posix())
    records = []
    expected = {r["file"]: r["sha256"] for r in render["sourceAssets"]}
    for relative in sorted(inputs):
        path = ROOT / relative
        if not path.is_file():
            raise FileNotFoundError(relative)
        file_sha = digest(path)
        if relative in expected and file_sha != expected[relative]:
            raise RuntimeError("Render source changed after freeze: " + relative)
        records.append({"file": relative, "sha256": file_sha, "sizeBytes": path.stat().st_size})
    manifest = {"schema": "launch-v7-delivery-inputs-v1",
                "createdUTC": datetime.now(timezone.utc).isoformat(),
                "film": film.relative_to(ROOT).as_posix(), "filmSHA256": actual,
                "filmSizeBytes": film.stat().st_size, "spec": qa["media"],
                "finalAAC": qa["finalAAC"], "technicalPassed": True,
                "renderManifest": candidates[0].relative_to(ROOT).as_posix(),
                "renderRevision": render["revision"],
                "selectedBridges": [b["id"] for b in bridges["bridges"] if b.get("selection") == "selected"],
                "sourceAndAssetRecords": records,
                "reviewLimits": {"fullRealTimeHumanViewing": False, "humanListening": False,
                                 "visualMethod": "SHA-bound content, detail and seam frame sampling plus camera numerical QA"},
                "provenance": "Saved BESO, saved Z-wind and manuscript-case numbers are distinct evidence. WAN footage is conceptual."}
    destination = ROOT / "delivery/AI-Engineer-Launch-v7-manifest.json"
    destination.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    gate = {"schema": "launch-v7-cleanup-gate-adapter-v1", "errors": [],
            "checks": {"fullDecode": "passed", "finalSHA256": actual},
            "sourceTechnicalReport": "research/qa/launch-v7-delivery.json",
            "sourceReportSHA256": digest(ROOT / "research/qa/launch-v7-delivery.json"),
            "decodedFrames": 6300, "technicalPassed": True,
            "notAnAestheticApproval": True}
    (ROOT / "research/qa/launch-v7-cleanup-gate.json").write_text(json.dumps(gate, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    print(json.dumps({"manifest": str(destination), "filmSHA256": actual, "inputFiles": len(records)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
