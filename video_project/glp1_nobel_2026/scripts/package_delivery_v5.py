"""Package eight current V6 publishing files under compatible V5 filenames.

No MP4, raw voice, models, source changes, deletion or cover generation.
"""
from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DELIVERY = ROOT / "delivery"
OUTPUT = DELIVERY / "科学减重与三高-封面文案.zip"
MEMBERS = [
    "covers/cardiometabolic-cover-16x9.jpg",
    "covers/cardiometabolic-cover-4x3.jpg",
    "covers/cardiometabolic-cover-3x4.jpg",
    "covers/cardiometabolic-cover-9x16.jpg",
    "发布文案-v5.md",
    "解说稿-v5.md",
    "制作与来源-v5.md",
    "GLP1_V5.srt",
]
COVER_REPORT = ROOT / "research/revision-v6/covers/layout-report.json"


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def verify_cover_report():
    """Bind recorded cover reviews to actual JPEGs without approving pending work."""
    if not COVER_REPORT.is_file():
        return {"available": False, "visualReviewCompleted": False}
    report = json.loads(COVER_REPORT.read_text(encoding="utf-8-sig"))
    formats = report.get("formats", {})
    require(set(formats) == {"16x9", "4x3", "3x4", "9x16"}, "Cover report must identify four formats")
    require(not report.get("blockingIssues", []), "Unresolved cover layout blockers")
    reviewed = []
    for format_name, entry in formats.items():
        path = DELIVERY / f"covers/cardiometabolic-cover-{format_name}.jpg"
        require(path.is_file() and sha(path) == entry.get("sha256"), f"Cover/report hash mismatch: {format_name}")
        status = entry.get("visualReview")
        completed = (status is True or status in ("pass", "passed", "reviewed", "approved", "complete", "completed")) if not isinstance(status, dict) else (
            status.get("completed") is True and not status.get("blockingIssues", []))
        require(not entry.get("blockingIssues", []), f"Unresolved cover blocker: {format_name}")
        reviewed.append({"format": format_name, "sha256": entry["sha256"], "visualReviewCompleted": completed})
    return {"available": True, "path": COVER_REPORT.relative_to(ROOT).as_posix(), "sha256": sha(COVER_REPORT),
            "visualReviewCompleted": all(row["visualReviewCompleted"] for row in reviewed), "formats": reviewed}


def main():
    final_path = ROOT / "research/revision-v5/finalization.json"
    require(final_path.is_file(), "Run finalize_v5.py after final QA before packaging")
    final = json.loads(final_path.read_text(encoding="utf-8-sig"))
    finalization_sha = sha(final_path)
    require(final.get("revision") == "v5" and final.get("productionRevision") == "v6"
            and final.get("sampledVisualReviewCompleted") is True, "Missing current V6 finalization record")
    require(sha(ROOT / "src/timeline.json") == final["timelineSHA256"], "Timeline changed after finalization")
    require(sha(DELIVERY / "GLP1_V5_1080p.mp4") == final["videoSHA256"], "Video changed after finalization")
    for relative, expected in final["inputsSHA256"].items():
        bound = (ROOT / relative).resolve(strict=True)
        require(bound.is_relative_to(ROOT.resolve()) and bound.is_file(), f"Invalid finalized input: {relative}")
        require(sha(bound) == expected, f"Finalized production input changed: {relative}")
    cover_review = verify_cover_report()
    snapshots = []
    for member in MEMBERS:
        path = (DELIVERY / member).resolve(strict=True)
        require(path.is_relative_to(DELIVERY.resolve()) and path.is_file(), f"Invalid package input: {member}")
        data = path.read_bytes()
        require(bool(data), f"Empty package input: {member}")
        source_sha = digest(data)
        if path.suffix.lower() == ".jpg":
            require(data[:2] == b"\xff\xd8" and data[-2:] == b"\xff\xd9", f"Not a complete JPEG: {member}")
        else:
            expected = final["outputsSHA256"].get("delivery/" + member)
            require(source_sha == expected, f"Finalized document changed; rerun finalization: {member}")
            require("[待最终检查回填]" not in data.decode("utf-8-sig"), f"Unfilled delivery metadata: {member}")
        snapshots.append((path, member, data, source_sha))
    temporary = OUTPUT.with_name(OUTPUT.name + ".tmp")
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for _, member, data, _ in snapshots:
            info = zipfile.ZipInfo(member, date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100644 & 0xFFFF) << 16
            archive.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    members = []
    with zipfile.ZipFile(temporary, "r") as archive:
        require(archive.namelist() == MEMBERS, "Unexpected archive membership/order")
        require(archive.testzip() is None, "ZIP CRC verification failed")
        for path, member, data, source_sha in snapshots:
            require(digest(archive.read(member)) == source_sha, f"Archived hash mismatch: {member}")
            require(sha(path) == source_sha, f"Input changed during packaging: {member}")
            members.append({"path": member, "bytes": len(data), "sha256": source_sha,
                            "crc32": f"{archive.getinfo(member).CRC:08x}"})
    require(sha(final_path) == finalization_sha, "Finalization record changed during packaging")
    if cover_review["available"]:
        require(sha(COVER_REPORT) == cover_review["sha256"], "Cover report changed during packaging")
    os.replace(temporary, OUTPUT)
    package_sha = sha(OUTPUT)
    report = {"revision": "v5", "productionRevision": "v6", "createdUTC": datetime.now(timezone.utc).isoformat(),
              "packagePath": OUTPUT.relative_to(ROOT).as_posix(), "packageSHA256": package_sha,
              "files": [{"source": "delivery/" + row["path"], "member": row["path"], "sha256": row["sha256"]} for row in members],
              "output": OUTPUT.relative_to(ROOT).as_posix(), "bytes": OUTPUT.stat().st_size,
              "sha256": package_sha, "memberCount": len(members), "members": members,
              "crcCheckPass": True, "memberHashesPass": True,
              "includesVideo": False, "includesRawVoiceOrModels": False,
              "deterministicTimestamps": "1980-01-01T00:00:00",
              "finalizationSHA256": finalization_sha, "finalVideoSHA256": final["videoSHA256"],
              "coverLayoutReview": cover_review,
              "scope": "Snapshot of eight finalized publishing files. Rebuild after any cover/document change."}
    report_path = ROOT / "research/revision-v5/publishing-package.json"
    staging = report_path.with_name(report_path.name + ".tmp")
    staging.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(staging, report_path)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
