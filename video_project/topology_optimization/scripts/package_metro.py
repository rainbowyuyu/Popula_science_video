"""Package this film after QA; --refresh-manifest incorporates later cleanup evidence.

The public voice-raw folder contains synthesized narration sentences, not the
private reference recording. Original reference audio, model weights, credentials,
research/raw, and the NC-ND research manuscript are never copied.
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
import zipfile


ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "delivery/metro"
FILM_REL = Path("output/metro/metro_safety_1080p.mp4")
DELIVERED_FILM = "地铁进站为什么要站在安全线后_1080p.mp4"
QA_REL = Path("research/metro/final-media-qa.json")
REFERENCE_ASSETS = (
    "baker-fundamentals-2014.pdf", "baker-fundamentals-2014-page1.jpg",
    "baker-applications-2014.pdf", "baker-applications-2014-page1.jpg",
    "drag-formula.png", "drag-formula.latex", "drag-formula.json",
)
# Keep the reproducibility reports, without sweeping arbitrary future private
# files or the internal raw-source directory into a shareable package.
RESEARCH_ASSETS = {
    "PRODUCTION.md", "PHYSICS-README.md", "audio-production.md", "publish.md",
    "story.json", "script.md", "sources.json", "research-note.md", "research-check.json",
    "subtitles.srt", "voice-mastering.json", "voice-lines.json", "voice-generation.json",
    "visual-state-audit.json", "timing-summary.json", "model-export-audit.json",
    "caption-alignment.json", "audio-manifest.json", "asr-check.json", "audio-qa.json",
    "physics-overview.png", "physics-audit.json", "physics-render-integration-audit.json",
    "render-benchmark.json", "render-benchmark2.json", "final-media-qa.json",
    "visual-review.json", "visual-review.md", "transition-filmstrips.json", "listening-review.json", "cleanup-report.json",
    "speed-hud-patch.json", "speed-ratio-audit.json",
}
EXCLUDES = [
    "private reference voice", "model weights", "credentials", "node_modules",
    "research/metro/raw", "NC-ND research manuscript", "transition-excerpts intermediates",
    "rebuildable caches",
]


def sha(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(8 * 1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8-sig"))


def write_json(path: Path, value: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def excluded(relative: Path) -> bool:
    parts = [part.lower() for part in relative.parts]
    name = relative.name.lower()
    return (
        "transition-excerpts" in parts or "__pycache__" in parts or "node_modules" in parts
        or "raw" in parts or ".git" in parts or name.startswith(".env")
        or name == "baker-slipstreams-author-manuscript.pdf"
        or name == "baker-slipstreams-2014.pdf"
        or any(word in name for word in ("credentials", "password", "secret", "private-reference"))
    )


def copy_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def cp(source: str | Path, relative: str | Path | None = None) -> None:
    src = ROOT / source
    target = Path(relative) if relative is not None else Path(source)
    if not src.exists():
        raise FileNotFoundError(src)
    if excluded(target):
        raise RuntimeError(f"Excluded asset requested for delivery: {target}")
    if src.is_dir():
        for item in sorted(src.rglob("*")):
            local = item.relative_to(src)
            if item.is_file() and not excluded(target / local):
                copy_file(item, DEST / target / local)
    else:
        copy_file(src, DEST / target)


def scan_credentials(extra_env_names: list[str]) -> dict:
    """Inspect only candidate text. Findings contain locations, never matched values."""
    candidates: set[Path] = set()
    text_suffixes = {".ts", ".tsx", ".py", ".mjs", ".json", ".md", ".srt", ".latex", ".txt", ".log"}
    for folder in ("src/metro", "public/metro/models", "public/metro/physics",
                   "output/metro/covers", "output/metro/qa-final"):
        for path in (ROOT / folder).rglob("*"):
            if path.is_file() and path.suffix in text_suffixes and not excluded(path.relative_to(ROOT)):
                candidates.add(path)
    for name in ("src/index-metro.tsx", "package.json", "package-lock.json", "tsconfig.json", "public/metro/timeline.json"):
        candidates.add(ROOT / name)
    audit = ROOT / "tmp/metro-audit-final/audit.json"
    if audit.is_file():
        candidates.add(audit)
    candidates.update(p for p in (ROOT / "scripts").glob("*metro*") if p.is_file() and p.suffix in {".py", ".mjs"})
    candidates.update(ROOT / "research/metro" / name for name in RESEARCH_ASSETS
                      if (ROOT / "research/metro" / name).is_file() and Path(name).suffix in text_suffixes)
    candidates.update(ROOT / "public/metro/references" / name for name in REFERENCE_ASSETS
                      if Path(name).suffix in text_suffixes)
    helper = Path("D:/python_project/tts/broadcast_voice.py")
    if helper.is_file():
        candidates.add(helper)
    env_names = {"DASHSCOPE_API_KEY", "QWEN_API_KEY", "FUSION_SSH_PASSWORD", "METRO_REMOTE_PASSWORD", *extra_env_names}
    known_values = [os.environ[n] for n in sorted(env_names) if os.environ.get(n)]
    token = re.compile(r"(?<![A-Za-z0-9])sk-[A-Za-z0-9_.-]{16,}")
    assignment = re.compile(r'''(?i)(?:password|passwd|api[_-]?key|密码|口令)\s*[:=]\s*["']([^"'\r\n]{6,})["']''')
    markers = re.compile(r"(?i)sk-|password|passwd|api[_-]?key|密码|口令|credential")
    # Alphanumeric password-like words are review markers, not proof of a secret.
    password_like = re.compile(r"(?<![A-Za-z0-9_])[A-Za-z]{6,}[0-9]{4,}(?![A-Za-z0-9_])")
    critical, review = [], []
    for path in sorted(candidates):
        if not path.is_file():
            raise FileNotFoundError(path)
        display = path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT) else "external-helper/broadcast_voice.py"
        for line_number, line in enumerate(path.read_text(encoding="utf-8-sig", errors="replace").splitlines(), 1):
            location = {"file": display, "line": line_number}
            if token.search(line) or assignment.search(line) or any(value in line for value in known_values):
                critical.append(location)
            elif markers.search(line) or password_like.search(line):
                review.append(location)
    result = {"candidateTextFiles": len(candidates), "credentialLiteralHits": critical,
              "keywordLocationsForReview": review, "knownSecretEnvironmentValuesChecked": len(known_values),
              "valuesIncludedInReport": False}
    if critical:
        raise RuntimeError("Potential literal credentials in candidate text: " + json.dumps(critical, ensure_ascii=False))
    return result


def write_delivery_package_json() -> None:
    package = read_json(ROOT / "package.json")
    package["scripts"] = {
        "check": "tsc --noEmit",
        "render": "node scripts/render_metro.mjs",
        "stills": "node scripts/render_metro.mjs stills",
        "qa": "python scripts/qa_metro_final.py",
        "cleanup": "python scripts/cleanup_metro.py",
    }
    # Preserve name/version/dependencies so the copied lockfile remains valid.
    write_json(DEST / "package.json", package)


def verified_film() -> tuple[Path, str]:
    report = read_json(ROOT / QA_REL)
    if report.get("automatedChecksPassed") is not True:
        raise RuntimeError("Final media QA has not passed")
    expected = report.get("videoSha256", "")
    if len(expected) != 64 or any(c not in "0123456789abcdef" for c in expected.lower()):
        raise RuntimeError("Final media QA has no valid videoSha256")
    film = ROOT / FILM_REL
    if not film.is_file() or film.stat().st_size < 1_000_000:
        raise RuntimeError("Complete film is missing")
    actual = sha(film)
    if actual != expected.lower():
        raise RuntimeError("Current MP4 does not match the videoSha256 verified by final media QA")
    return film, actual


def package_files() -> list[Path]:
    files = sorted(p for p in DEST.rglob("*") if p.is_file() and p.name != "manifest.json")
    for path in files:
        if excluded(path.relative_to(DEST)):
            # Do not silently distribute leftovers from an older package build.
            raise RuntimeError(f"Existing delivery contains excluded material: {path.relative_to(DEST)}")
    return files


def source_snapshot() -> None:
    target = DEST / "source-snapshot.zip"
    with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(DEST.rglob("*")):
            if not path.is_file():
                continue
            relative = path.relative_to(DEST)
            if excluded(relative) or relative.name == "manifest.json":
                continue
            if (relative.parts[0] in {"src", "scripts", "research", "public"}
                    and path.suffix in {".ts", ".tsx", ".py", ".mjs", ".json", ".md", ".srt", ".latex"}
                    or relative.as_posix() in {"package.json", "package-lock.json", "tsconfig.json"}):
                archive.write(path, relative.as_posix())


def refresh_manifest(film: Path, expected_sha: str) -> dict:
    delivered = DEST / DELIVERED_FILM
    if not delivered.is_file() or sha(delivered) != expected_sha:
        raise RuntimeError("Delivered MP4 differs from the current QA-verified MP4")
    packaged_qa = read_json(DEST / QA_REL)
    if (packaged_qa.get("automatedChecksPassed") is not True
            or str(packaged_qa.get("videoSha256", "")).lower() != expected_sha):
        raise RuntimeError("Packaged final-media-qa report does not match the delivered film")
    snapshot = DEST / "source-snapshot.zip"
    if not snapshot.is_file():
        raise RuntimeError("Source snapshot must be created before the manifest")
    cleanup = ROOT / "research/metro/cleanup-report.json"
    if cleanup.is_file():
        data = read_json(cleanup)
        if str(data.get("verifiedVideoSHA256", "")).lower() != expected_sha:
            raise RuntimeError("Cleanup report belongs to a different verified video")
        cp(cleanup.relative_to(ROOT))
    files = package_files()
    manifest = {
        "generatedUTC": datetime.now(timezone.utc).isoformat(),
        "filmSha256": expected_sha,
        "finalQaVideoSha256": packaged_qa["videoSha256"],
        "sourceSnapshotSha256": sha(snapshot),
        "cleanupReportIncluded": (DEST / "research/metro/cleanup-report.json").is_file(),
        "files": [{"path": p.relative_to(DEST).as_posix(), "bytes": p.stat().st_size, "sha256": sha(p)}
                  for p in files],
        "excludes": EXCLUDES,
    }
    if sha(film) != expected_sha:
        raise RuntimeError("Source movie changed while packaging; no new manifest written")
    write_json(DEST / "manifest.json", manifest)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh-manifest", action="store_true",
                        help="After cleanup, copy the matching cleanup report and rehash the existing delivery only")
    parser.add_argument("--secret-env", action="append", default=[], metavar="ENV_NAME",
                        help="Also compare candidates with a secret already held in this environment variable; values never logged")
    args = parser.parse_args()
    film, film_sha = verified_film()  # Always verify hash before copying or updating delivery.
    if args.refresh_manifest:
        manifest = refresh_manifest(film, film_sha)
    else:
        credential_scan = scan_credentials(args.secret_env)
        DEST.mkdir(parents=True, exist_ok=True)
        package_files()  # Refuse stale excluded material before copying anything.
        cp(FILM_REL, DELIVERED_FILM)
        cp("output/metro/covers", "封面")
        cp("research/metro/publish.md", "发布文案.md")
        cp("research/metro/PRODUCTION.md", "README.md")
        cp("research/metro/subtitles.srt", "字幕.srt")
        cp("src/metro")
        cp("src/index-metro.tsx")
        for name in ("package.json", "package-lock.json", "tsconfig.json"):
            cp(name)
        write_delivery_package_json()
        for path in sorted((ROOT / "scripts").glob("*metro*")):
            if path.is_file() and path.suffix in {".py", ".mjs"}:
                cp(path.relative_to(ROOT))
        for name in ("models", "physics", "voice", "voice-raw", "previews", "logo.png",
                     "master.wav", "music.wav", "narration.wav", "timeline.json"):
            cp("public/metro/" + name)
        for name in REFERENCE_ASSETS:
            cp("public/metro/references/" + name)
        for name in sorted(RESEARCH_ASSETS):
            path = ROOT / "research/metro" / name
            if path.is_file():
                cp(path.relative_to(ROOT))
        cp("output/metro/clean-1090.jpg")
        audit = ROOT / "tmp/metro-audit-final/audit.json"
        if audit.is_file():
            cp(audit.relative_to(ROOT), "research/metro/visual-determinism-audit.json")
        evidence = ROOT / "output/metro/qa-final"
        if evidence.is_dir():
            cp(evidence.relative_to(ROOT), "检查预览")  # cp excludes transition-excerpts recursively.
        local_voice = Path("D:/python_project/tts/broadcast_voice.py")
        if local_voice.is_file():
            copy_file(local_voice, DEST / "scripts/broadcast_voice.py")
        write_json(DEST / "research/metro/credential-scan.json", credential_scan)
        source_snapshot()  # The manifest below includes the finished archive and its hash.
        manifest = refresh_manifest(film, film_sha)
    print(json.dumps({"delivery": str(DEST), "files": len(manifest["files"]),
                      "filmSha256": film_sha, "refreshedOnly": args.refresh_manifest,
                      "cleanupReportIncluded": manifest["cleanupReportIncluded"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
