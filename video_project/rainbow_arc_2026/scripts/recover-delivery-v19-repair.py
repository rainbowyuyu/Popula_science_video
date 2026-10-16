from __future__ import annotations

"""Copy-only recovery after a completed V19Repair encode exhausts D: delivery space.

No render input, failed run record, pointer, temporary file, or old delivery is
modified or removed. The default is a read-only preflight. --execute copies the
verified final encode to a persistent directory and writes a distinct recovery
record, which can be passed explicitly to qa-delivery-v19-repair.py.
"""

import argparse
import hashlib
import json
import math
import shutil
import subprocess
from datetime import datetime, timezone
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT_NAME = "彩虹为什么是弧形_V19_场景修复_1080p.mp4"
EXPECTED = {"id": "RainbowArcV19Repair", "width": 1920, "height": 1080,
            "fps": 30, "durationInFrames": 10702}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as src:
        for block in iter(lambda: src.read(8 * 1024 * 1024), b""):
            h.update(block)
    return h.hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def absolute(path) -> Path:
    p = Path(path)
    return (p if p.is_absolute() else ROOT / p).resolve()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def write_new_json(path: Path, content):
    with path.open("x", encoding="utf-8", newline="\n") as f:
        json.dump(content, f, ensure_ascii=False, indent=2)
        f.write("\n")


def copy_new(source: Path, destination: Path):
    # Exclusive destination creation: never replaces an existing file.
    with source.open("rb") as src, destination.open("xb") as dst:
        shutil.copyfileobj(src, dst, 8 * 1024 * 1024)


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--render-record", type=Path, required=True)
    ap.add_argument("--destination-directory", type=Path, required=True)
    ap.add_argument("--execute", action="store_true", help="Copy only; no source deletion or pointer changes")
    args = ap.parse_args()

    original_path = absolute(args.render_record)
    original_hash = sha256(original_path)
    original = read_json(original_path)
    require(original.get("version") == "V19Repair", "Source is not a V19Repair run")
    require(original.get("status") == "failed", "Recovery is only allowed after the renderer has failed; an active render is untouched")
    require("Delivery drive does not have capacity for completed render." in original.get("error", ""),
            "Run did not fail at the recognized post-encode delivery-capacity check")
    require(original.get("scope") == "full delivery" and original.get("preview") is False, "Source must be a full delivery run")
    require(original.get("composition") == EXPECTED, "Unexpected composition metadata")
    require(original.get("inputProps") == {"audio": True, "clean": False, "plate": False}, "Unexpected source input properties")

    audit_path = absolute(original["sourceAudit"])
    audit_hash = sha256(audit_path)
    require(audit_hash == original.get("sourceAuditSHA256"), "Immutable source audit hash mismatch")
    audit = read_json(audit_path)
    require(audit.get("version") == "V19Repair" and audit.get("passed") is True, "Immutable source audit did not pass")
    bindings = audit.get("sourceHashes", [])
    require(bindings and bindings == original.get("sourceHashes"), "Original run does not bind the audit input list")
    for row in bindings:
        p = absolute(row["file"])
        require(p.is_file() and sha256(p) == row["sha256"], "Audited input changed or is missing: " + row["file"])

    run_root = absolute(original["runRoot"])
    staged = run_root / "audio-finalized.mp4"
    raw = run_root / "render.mp4"
    bundle = absolute(original["bundleDir"]) / "bundle.js"
    require(sha256(bundle) == original.get("bundleEntrySHA256"), "Rendered bundle hash mismatch")
    audio_path = original_path.parent / "audio-finalization.json"
    audio = read_json(audio_path)
    require(audio.get("videoStreamUnchanged") is True, "Audio finalization did not establish unchanged video")
    require(audio.get("videoStreamHashBefore") == audio.get("videoStreamHashAfter"), "Audio-finalization video stream hashes differ")
    staged_hash = sha256(staged)
    require(staged_hash == audio.get("outputVideoSHA256"), "Final staged video hash does not match successful audio finalization")
    require(sha256(raw) == audio.get("inputVideoSHA256"), "Original staged render hash mismatch")
    master = ROOT / "public/audio_v18/master-v18.wav"
    require(sha256(master) == audio.get("masterSHA256"), "Finalized audio master hash mismatch")
    require(abs(float(audio.get("durationSeconds", 0)) - 10702 / 30) < .001, "Audio finalization has an unexpected duration")

    ffprobe = shutil.which("ffprobe") or "C:/ffmpeg/bin/ffprobe.exe"
    probe = subprocess.run([ffprobe, "-v", "error", "-show_streams", "-show_format", "-of", "json", str(staged)],
                           check=True, capture_output=True, text=True, encoding="utf-8", timeout=120)
    metadata = json.loads(probe.stdout)
    video = next((s for s in metadata.get("streams", []) if s.get("codec_type") == "video"), {})
    sound = next((s for s in metadata.get("streams", []) if s.get("codec_type") == "audio"), {})
    require(int(video.get("width", 0)) == 1920 and int(video.get("height", 0)) == 1080, "Finalized frame size mismatch")
    require(float(Fraction(video.get("avg_frame_rate", "0/1"))) == 30, "Finalized frame rate mismatch")
    require(int(video.get("nb_frames", 0)) == 10702, "Finalized frame count mismatch")
    vd, ad = float(video.get("duration", "nan")), float(sound.get("duration", "nan"))
    require(math.isfinite(vd) and abs(vd - 10702 / 30) < .034, "Finalized video duration mismatch")
    require(math.isfinite(ad) and abs(ad - vd) <= 2 / 30, "Finalized audio/video duration mismatch")
    require(sound.get("codec_name") == "aac" and int(sound.get("sample_rate", 0)) == 48000
            and int(sound.get("channels", 0)) == 2, "Finalized AAC stream metadata mismatch")

    destination_dir = absolute(args.destination_directory)
    require(destination_dir.is_dir(), "Persistent destination directory must already exist")
    output = destination_dir / OUTPUT_NAME
    require(output.resolve() != staged.resolve(), "Recovery destination must differ from temporary source")
    output_exists = output.exists()
    if output_exists:
        require(output.is_file() and sha256(output) == staged_hash, "Destination already exists with different content; no overwrite permitted")
    bytes_needed = staged.stat().st_size
    free = shutil.disk_usage(destination_dir).free
    require(free >= (0 if output_exists else bytes_needed) + 128 * 1024**2, "Persistent destination lacks capacity")
    summary = {"mode": "copy-only recovery" if args.execute else "read-only preflight",
               "sourceRunId": original["runId"], "sourceRunStatus": original["status"],
               "sourceRecord": str(original_path), "sourceRecordSHA256": original_hash,
               "stagedVideo": str(staged), "output": str(output), "videoSHA256": staged_hash,
               "bytes": bytes_needed, "validatedBindings": len(bindings), "freeBytes": free,
               "originalRunRecordWillRemainUnchanged": True, "deletionPerformed": False,
               "visualPlaybackClaimed": False, "listeningClaimed": False}
    if not args.execute:
        print(json.dumps(summary, ensure_ascii=True, indent=2))
        return

    # The renderer must be finished and its record must remain byte-identical.
    require(sha256(original_path) == original_hash, "Original run changed during recovery validation")
    now = datetime.now(timezone.utc)
    recovery_id = original["runId"] + "-delivery-recovery-" + now.strftime("%Y%m%dT%H%M%S%fZ")
    evidence_dir = destination_dir / recovery_id
    evidence_dir.mkdir(exist_ok=False)
    copy_new(original_path, evidence_dir / "original-failed-render.json")
    copy_new(audit_path, evidence_dir / "audit.snapshot.json")
    copy_new(audio_path, evidence_dir / "audio-finalization.json")
    if not output_exists:
        copy_new(staged, output)
    require(sha256(output) == staged_hash, "Persistent copy hash mismatch; retained for investigation")
    require(sha256(original_path) == original_hash, "Original run changed during recovery copy")
    require(sha256(evidence_dir / "audit.snapshot.json") == audit_hash, "Copied audit hash mismatch")
    write_new_json(evidence_dir / "ffprobe-staged.json", metadata)
    summary.update(recoveryId=recovery_id, copiedUTC=now.isoformat(),
                   existingIdenticalDeliveryReused=output_exists, recoveryHelperSHA256=sha256(Path(__file__)))
    write_new_json(evidence_dir / "recovery-provenance.json", summary)
    recovered = {
        "version": "V19Repair", "schema": "rainbow.v19-repair.copy-only-delivery-recovery/1",
        "runId": recovery_id, "status": "completed", "scope": "recovered full delivery",
        "operation": "Copied an already finalized encode after the original renderer failed at the D: capacity check. No re-render was performed.",
        "completedUTC": datetime.now(timezone.utc).isoformat(), "preview": False,
        "composition": original["composition"], "inputProps": original["inputProps"],
        "sourceAudit": str(evidence_dir / "audit.snapshot.json"), "sourceAuditSHA256": audit_hash,
        "sourceHashes": bindings, "bundleEntrySHA256": original["bundleEntrySHA256"],
        "output": str(output), "videoSHA256": staged_hash, "bytes": bytes_needed,
        "originalRenderRunId": original["runId"], "originalRenderStatus": "failed",
        "originalRenderRecord": str(original_path), "originalRenderRecordSHA256": original_hash,
        "recoveryProvenance": str(evidence_dir / "recovery-provenance.json"),
        "encodeQARequired": True, "humanNormalSpeedPlayback": False, "humanListening": False,
    }
    record_path = evidence_dir / "render-recovery.json"
    write_new_json(record_path, recovered)
    summary.update(renderRecord=str(record_path), sourceAudit=recovered["sourceAudit"],
                   nextStep="Run scripts/qa-delivery-v19-repair.py with explicit --video and --render-record; do not change the original failed run or its pointer.")
    print(json.dumps(summary, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
