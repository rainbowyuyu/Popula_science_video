"""Remove only the retired GLP-1 outputs after V3 final acceptance.

Run only once rendering, cover creation, packaging and documentation are idle:
    python scripts/cleanup_final.py --execute

Without --execute this entry makes no changes. Deletion is Python-native; no
shell deletion, recursive rmtree, dependency traversal or report-gate override.
The final QA report and V3 motion QA must explicitly approve the exact
delivered MP4. The V2 source backup and shared dependencies are never cleanup
candidates.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import sys


ROOT = Path(os.path.abspath(__file__)).parents[1]
VIDEO = ROOT / "delivery/GLP1_1080p.mp4"
QA = ROOT / "research/qa/final/automatic-report.json"
MOTION_QA = ROOT / "research/qa/final-motion-v3/motion-manifest.json"
MARKER = ROOT / "tmp/final-render.json"
AUDIT = ROOT / "research/qa/cleanup-final"
ALLOWLIST = {
    "tmp/bundle": "directory",
    "tmp/GLP1-before-refinement.mp4": "file",
    "tmp/GLP1-before-surface-fix.mp4": "file",
    "tmp/GLP1-before-v2.mp4": "file",
    "tmp/segment-4700-5050.mp4": "file",
    "tmp/montage-v1.jpg": "file",
    "tmp/transition-refined.jpg": "file",
    "research/qa/prelock-20261008": "directory",
    "research/qa/before-surface-fix": "directory",
    "research/qa/before-v2": "directory",
}
FRAME_NAME = re.compile(r"frame-[0-9]+\.jpg")
REQUIRED_CHECKS = {
    "width1920", "height1080", "fps30", "framesMatchTimeline", "videoDurationMatchesTimeline",
    "fullDecodeSuccess", "decodedFramesMatchTimeline", "audioAAC", "noDetectedBlackSegments",
    "aacTruePeakBelow0dBTP", "allRepresentativeClipsExtracted", "allPlannedFramesExist",
}
REPARSE_POINT = getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)


def now():
    return datetime.now(timezone.utc).isoformat()


def relative(path):
    return path.relative_to(ROOT).as_posix()


def check_node(path):
    info = path.lstat()
    if stat.S_ISLNK(info.st_mode) or getattr(info, "st_file_attributes", 0) & REPARSE_POINT:
        raise RuntimeError(f"Refusing symlink, junction or reparse point: {path}")
    if not (stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode)):
        raise RuntimeError(f"Refusing non-regular filesystem object: {path}")
    return info


def safe_path(path, missing_ok=False):
    """Check lexical containment, every ancestor, and resolved containment."""
    path = Path(os.path.abspath(path))
    if path == ROOT or not path.is_relative_to(ROOT):
        raise RuntimeError(f"Refusing path outside or equal to project root: {path}")
    parts = path.relative_to(ROOT).parts
    if any(part.lower() in {".git", "node_modules"} for part in parts):
        raise RuntimeError(f"Refusing repository or dependencies: {path}")
    cursor = ROOT
    for part in parts:
        cursor /= part
        try:
            check_node(cursor)
        except FileNotFoundError:
            if missing_ok:
                return path
            raise
    resolved = path.resolve(strict=True)
    if resolved != path or not resolved.is_relative_to(ROOT):
        raise RuntimeError(f"Resolved path escaped its project location: {path}")
    return path


def identity(info):
    return {"device": info.st_dev, "inode": info.st_ino,
            "bytes": info.st_size, "modifiedNs": info.st_mtime_ns}


def fingerprint(path):
    safe_path(path)
    before = identity(check_node(path))
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(chunk)
    safe_path(path)
    after = identity(check_node(path))
    if before != after:
        raise RuntimeError(f"File changed during hashing; stop active work first: {path}")
    return {**after, "sha256": digest.hexdigest()}


def read_json(path):
    safe_path(path)
    return json.loads(path.read_text(encoding="utf-8-sig"))


def acceptance_gate():
    report = read_json(QA)
    checks = report.get("checks")
    if (report.get("automaticChecksPass") is not True or not isinstance(checks, dict)
            or not REQUIRED_CHECKS.issubset(checks) or any(value is not True for value in checks.values())):
        raise RuntimeError("Final automatic QA checks are missing or not all explicitly true.")
    if report.get("finalArtAcceptance") is not True:
        raise RuntimeError("Final automatic-report.json must explicitly set finalArtAcceptance=true.")
    if Path(report.get("video", "")) != VIDEO:
        raise RuntimeError("Final QA video path does not identify the fixed delivery MP4.")
    video = fingerprint(VIDEO)
    if report.get("videoSHA256") != video["sha256"] or report.get("videoBytes") != video["bytes"]:
        raise RuntimeError("Final QA SHA256 or byte size does not match the delivered MP4.")
    timeline = fingerprint(ROOT / "src/timeline.json")
    if report.get("timelineSHA256") != timeline["sha256"]:
        raise RuntimeError("Timeline differs from the final QA report.")
    marker = read_json(MARKER)
    motion = read_json(MOTION_QA)
    if (motion.get("status") != "ready-for-visual-review"
            or motion.get("automaticExtractionChecksPass") is not True
            or motion.get("manualVisualReviewCompleted") is not True
            or motion.get("finalMotionAcceptance") is not True):
        raise RuntimeError(
            "V3 motion QA must explicitly set automaticExtractionChecksPass, "
            "manualVisualReviewCompleted and finalMotionAcceptance=true.")
    if motion.get("videoSHA256") != video["sha256"] or motion.get("timelineSHA256") != timeline["sha256"]:
        raise RuntimeError("V3 motion QA hashes do not match the delivered MP4 and current timeline.")
    if (marker.get("success") is not True or Path(marker.get("outputLocation", "")) != VIDEO
            or marker.get("frames") != [0, read_json(ROOT / "src/timeline.json")['duration']-1]
            or marker.get("videoSHA256") != video["sha256"]
            or marker.get("timelineSHA256") != timeline["sha256"]):
        raise RuntimeError("Final render marker does not describe a successful full delivery.")
    keep_stills = report.get("keepStills")
    if (not isinstance(keep_stills, list) or not keep_stills
            or any(not isinstance(name, str) or FRAME_NAME.fullmatch(name) is None for name in keep_stills)):
        raise RuntimeError("Final QA must explicitly choose non-empty tmp/stills frame filenames in keepStills.")
    return {"videoSHA256": video["sha256"], "videoBytes": video["bytes"],
            "timelineSHA256": timeline["sha256"], "report": fingerprint(QA),
            "renderMarker": fingerprint(MARKER), "motionQA": fingerprint(MOTION_QA),
            "keepStills": sorted(set(keep_stills))}


def compile_entry():
    node = shutil.which("node")
    compiler = ROOT / "node_modules/typescript/bin/tsc"
    if not node or not compiler.is_file():
        raise RuntimeError("Node.js and the existing TypeScript compiler are required; nothing is installed.")
    command = [node, str(compiler), "--noEmit", "--incremental", "false"]
    process = subprocess.run(command, cwd=ROOT, capture_output=True, text=True,
                             encoding="utf-8", errors="replace", timeout=180)
    result = {"command": command, "exitCode": process.returncode,
              "stdout": process.stdout, "stderr": process.stderr}
    if process.returncode:
        raise RuntimeError(f"Render entry typecheck failed: {result}")
    return result


def scan_candidate(path):
    """Enumerate every object without following links, with stable file hashes."""
    safe_path(path)
    entries = {}

    def visit(current):
        safe_path(current)
        info = check_node(current)
        if stat.S_ISREG(info.st_mode):
            entries[relative(current)] = {"kind": "file", **fingerprint(current)}
        else:
            entries[relative(current)] = {"kind": "directory", **identity(info)}
            with os.scandir(current) as children:
                paths = sorted((Path(item.path) for item in children), key=lambda item: item.name.lower())
            for child in paths:
                visit(child)
    visit(path)
    return entries


def build_plan(keep_stills):
    candidates = dict(ALLOWLIST)
    stills = ROOT / "tmp/stills"
    safe_path(stills, missing_ok=True)
    if stills.exists():
        with os.scandir(stills) as entries:
            for item in entries:
                if FRAME_NAME.fullmatch(item.name) and item.name not in keep_stills:
                    candidates[f"tmp/stills/{item.name}"] = "file"
    plan = []
    for name, expected_kind in sorted(candidates.items()):
        path = safe_path(ROOT / name, missing_ok=True)
        if not path.exists():
            plan.append({"path": name, "status": "absent", "bytes": 0, "entries": {}})
            continue
        entries = scan_candidate(path)
        if entries[name]["kind"] != expected_kind:
            raise RuntimeError(f"Unexpected type for allowlisted candidate: {path}")
        plan.append({"path": name, "status": "planned",
                     "bytes": sum(row["bytes"] for row in entries.values() if row["kind"] == "file"),
                     "entries": entries})
    return plan


def dependency_snapshot(candidate_names):
    """Hash all retained project files, including every voice take and source."""
    files, excluded_dependencies = {}, {}

    def visit(path):
        name = relative(path)
        if name in candidate_names or path == AUDIT:
            return
        if path.name.lower() == "node_modules":
            info = path.lstat()
            excluded_dependencies[name] = {**identity(info), "mode": info.st_mode,
                "attributes": getattr(info, "st_file_attributes", 0),
                "linkTarget": os.readlink(path) if path.is_symlink() or
                    getattr(info, "st_file_attributes", 0) & REPARSE_POINT else None,
                "policy": "Preserved; dependency contents never traversed or removed."}
            return
        safe_path(path)
        if path.is_file():
            files[name] = fingerprint(path)
            return
        with os.scandir(path) as entries:
            children = sorted((Path(item.path) for item in entries), key=lambda item: item.name.lower())
        for child in children:
            visit(child)

    with os.scandir(ROOT) as entries:
        children = sorted((Path(item.path) for item in entries), key=lambda item: item.name.lower())
    for child in children:
        visit(child)
    return {"files": files, "preservedNodeModules": excluded_dependencies}


def write_audit(path, payload):
    safe_path(path, missing_ok=True)
    # Audit files are outside every cleanup candidate, and excluded from the
    # before/after dependency snapshot because this process must update them.
    with path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())


def remove_candidate(item, audit, report_path):
    path = ROOT / item["path"]
    if scan_candidate(path) != item["entries"]:
        raise RuntimeError(f"Candidate changed since plan; no deletion for: {path}")
    entries = sorted(item["entries"].items(), key=lambda row: (-len(Path(row[0]).parts), row[0]))
    item["status"] = "deleting"
    for name, expected in entries:
        current = safe_path(ROOT / name)
        info = check_node(current)
        if expected["kind"] == "file":
            if {"kind": "file", **fingerprint(current)} != expected:
                raise RuntimeError(f"Candidate file changed immediately before deletion: {current}")
            current.unlink()
            audit["deletedFiles"].append({"path": name, "bytes": expected["bytes"],
                                         "sha256": expected["sha256"]})
            audit["deletedBytes"] += expected["bytes"]
        else:
            # Child removal changes directory mtime, so compare its identity.
            if info.st_dev != expected["device"] or info.st_ino != expected["inode"]:
                raise RuntimeError(f"Directory identity changed: {current}")
            current.rmdir()  # Refuses any unplanned/new child instead of deleting it.
            audit["deletedDirectories"].append(name)
        write_audit(report_path, audit)
    if os.path.lexists(path):
        raise RuntimeError(f"Candidate unexpectedly still exists: {path}")
    item["status"] = "deleted"
    write_audit(report_path, audit)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--execute", action="store_true", help="Execute only after rendering and editing are idle.")
    args = parser.parse_args()
    if not args.execute:
        print("No files changed. Finalized cleanup requires explicit --execute.")
        return 0
    # Check the root's entire physical ancestry before any read/write/delete.
    for ancestor in reversed([ROOT, *ROOT.parents]):
        check_node(ancestor)
    safe_path(Path(os.path.abspath(__file__)))
    gate = acceptance_gate()
    compile_before = compile_entry()
    keep_stills = gate["keepStills"]
    for name in keep_stills:
        preserved = safe_path(ROOT / "tmp/stills" / name)
        if not preserved.is_file():
            raise RuntimeError(f"Required linked screenshot or cover source is missing: {preserved}")
    plan = build_plan(keep_stills)  # All hazardous candidates are refused before deletion.
    candidate_names = {item["path"] for item in plan}
    before = dependency_snapshot(candidate_names)
    safe_path(AUDIT, missing_ok=True)
    if AUDIT.exists():
        scan_candidate(AUDIT)  # Old audit output must not contain links or .git.
    AUDIT.mkdir(parents=True, exist_ok=True)
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S.%fZ")
    report_path = AUDIT / f"{run_id}-cleanup.json"
    before_path = AUDIT / f"{run_id}-dependencies-before.json"
    after_path = AUDIT / f"{run_id}-dependencies-after.json"
    audit = {"startedAtUTC": now(), "projectRoot": str(ROOT), "status": "preflight",
             "acceptanceGate": gate, "compileBefore": compile_before, "allowlist": ALLOWLIST,
             "preservedStills": sorted(keep_stills), "v3MotionQA": str(MOTION_QA), "candidates": plan,
             "dependenciesBefore": relative(before_path), "dependenciesAfter": relative(after_path),
             "deletedFiles": [], "deletedDirectories": [], "deletedBytes": 0,
             "dependenciesUnchanged": None, "finalVideoUnchanged": None}
    write_audit(before_path, before)
    write_audit(report_path, audit)
    try:
        if acceptance_gate() != gate or dependency_snapshot(candidate_names) != before:
            raise RuntimeError("Final acceptance or dependencies changed during preflight; stop active work first.")
        for item in plan:
            if item["status"] == "planned":
                # Recheck the gate before each candidate group, not just once.
                if acceptance_gate() != gate:
                    raise RuntimeError("Final acceptance changed during cleanup.")
                remove_candidate(item, audit, report_path)
        audit["compileAfter"] = compile_entry()
        reappeared = [name for name in candidate_names if os.path.lexists(ROOT / name)]
        if reappeared:
            raise RuntimeError(f"Retired paths appeared during cleanup; active work may still be running: {reappeared}")
        audit["allRetiredCandidatesAbsent"] = True
        after = dependency_snapshot(candidate_names)
        write_audit(after_path, after)
        audit["dependenciesUnchanged"] = before == after
        audit["finalVideoUnchanged"] = acceptance_gate() == gate
        if not audit["dependenciesUnchanged"] or not audit["finalVideoUnchanged"]:
            raise RuntimeError("Post-cleanup dependency or final-video verification failed.")
        audit["status"] = "complete"
        audit["finishedAtUTC"] = now()
        write_audit(report_path, audit)
    except Exception as error:
        audit["status"] = "stopped_on_error"
        audit["error"] = f"{type(error).__name__}: {error}"
        audit["finishedAtUTC"] = now()
        try:
            after = dependency_snapshot(candidate_names)
            write_audit(after_path, after)
            audit["dependenciesUnchanged"] = before == after
            audit["finalVideoUnchanged"] = acceptance_gate() == gate
        except Exception as verification_error:
            audit["verificationError"] = f"{type(verification_error).__name__}: {verification_error}"
        write_audit(report_path, audit)
        raise
    print(json.dumps({"report": str(report_path), "deletedFiles": len(audit["deletedFiles"]),
        "deletedBytes": audit["deletedBytes"], "dependenciesUnchanged": True,
        "finalVideoSHA256": gate["videoSHA256"]}, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, RuntimeError, ValueError, subprocess.SubprocessError) as error:
        print(f"CLEANUP REFUSED/STOPPED: {error}", file=sys.stderr)
        raise SystemExit(2)
