#!/usr/bin/env python3
"""Inspect and recover manifest-listed media without overwriting project files.

Examples (run from the repository root):
  python tools/assets.py list --project c_pointers
  python tools/assets.py check --project c_pointers
  python tools/assets.py download --project c_pointers
  python tools/assets.py restore --source-root D:/old-repository --project c_pointers

Downloads use GitHub CLI authentication. Run ``gh auth login`` if needed. An
explicit --use-git-credentials switch can use Git's configured credential helper;
the returned credential exists only in memory and the gh child environment.
Commercial local dependencies are never downloaded by this tool.
"""

from __future__ import annotations

import argparse
import errno
import hashlib
import json
import ntpath
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
LICENSED_REASON = "licensed-local-dependency"


class AssetError(ValueError):
    """A manifest entry, source file, or destination is unsafe or invalid."""


def relative_path(value: Any) -> Path:
    """Accept a portable relative path; reject Windows paths even on POSIX."""
    if not isinstance(value, str) or not value or any(ord(c) < 32 for c in value):
        raise AssetError("Asset path must be a nonempty printable relative path.")
    if ntpath.isabs(value) or ntpath.splitdrive(value)[0] or ":" in value:
        raise AssetError("Absolute, drive-qualified, and alternate-stream paths are forbidden.")
    normalized = value.replace("\\", "/")
    parts = normalized.split("/")
    if any(part in {"", ".", ".."} for part in parts):
        raise AssetError("Empty, dot, and parent path components are forbidden.")
    # These spellings alias other Windows names and must not bypass confinement.
    for part in parts:
        stem = part.split(".", 1)[0].upper()
        if part.endswith((" ", ".")) or stem in {"CON", "PRN", "AUX", "NUL"} or re.fullmatch(r"(?:COM|LPT)[1-9]", stem):
            raise AssetError("Reserved or ambiguous Windows path component.")
    return Path(*PurePosixPath(normalized).parts)


def confined(base: Path, value: str | Path) -> Path:
    """Resolve links before permitting access, including not-yet-created paths."""
    rel = relative_path(str(value))
    base = base.resolve()
    candidate = base / rel
    try:
        candidate.resolve().relative_to(base)
    except (ValueError, OSError, RuntimeError) as exc:
        raise AssetError("Asset path escapes its project through a link or parent.") from exc
    return candidate


def project_directory(repo: Path, project: str) -> Path:
    rel = relative_path(project)
    if len(rel.parts) != 1:
        raise AssetError("Project ID must be one directory name.")
    video_root = repo.resolve() / "video_project"
    try:
        video_root.resolve().relative_to(repo.resolve())
    except (ValueError, OSError, RuntimeError) as exc:
        raise AssetError("video_project escapes the selected repository through a link.") from exc
    path = confined(video_root, project)
    if not path.is_dir():
        raise AssetError(f"Project directory does not exist: {project}")
    return path


def validate_asset(asset: Any) -> dict[str, Any]:
    if not isinstance(asset, dict):
        raise AssetError("Manifest asset must be an object.")
    relative_path(asset.get("path"))
    size = asset.get("bytes")
    if type(size) is not int or size < 0:
        raise AssetError("Asset bytes must be a nonnegative integer.")
    digest = asset.get("sha256")
    if digest is not None and (not isinstance(digest, str) or not re.fullmatch(r"[0-9a-fA-F]{64}", digest)):
        raise AssetError("Asset sha256 must be null or 64 hexadecimal characters.")
    if asset.get("availability") not in {"local-only", "release"}:
        raise AssetError("Unknown asset availability.")
    if asset["availability"] == "release":
        release = asset.get("release")
        if not isinstance(release, dict):
            raise AssetError("Release asset requires repository, tag, and name.")
        if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", str(release.get("repo", ""))):
            raise AssetError("Invalid GitHub owner/repository.")
        tag = release.get("tag")
        if not isinstance(tag, str) or not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_./-]*", tag):
            raise AssetError("Invalid release tag.")
        name = release.get("name")
        name_path = relative_path(name)
        if len(name_path.parts) != 1 or any(c in name for c in "*?[]") or name.startswith("-"):
            raise AssetError("Release filename must be a literal filename, not a pattern.")
    return asset


def load_manifest(repo: Path, project: str) -> tuple[Path, list[dict[str, Any]]]:
    directory = project_directory(repo, project)
    manifest_path = confined(directory, "assets.manifest.json")
    try:
        data = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as exc:
        raise AssetError(f"Cannot read assets.manifest.json for {project}.") from exc
    if not isinstance(data, dict) or data.get("schemaVersion") != 1 or data.get("project") != project:
        raise AssetError("Manifest schema or project does not match the selected directory.")
    assets = data.get("assets")
    if not isinstance(assets, list):
        raise AssetError("Manifest assets must be a list.")
    seen: set[str] = set()
    for asset in assets:
        validate_asset(asset)
        normalized = str(relative_path(asset["path"])).replace("\\", "/").casefold()
        if normalized in seen:
            raise AssetError("Duplicate or case-aliased asset path in manifest.")
        seen.add(normalized)
        confined(directory, asset["path"])
    return directory, assets


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def verify(path: Path, asset: dict[str, Any]) -> str:
    if not path.is_file():
        raise AssetError("Asset is missing or is not a regular file.")
    if path.stat().st_size != asset["bytes"]:
        raise AssetError("Asset size does not match the manifest.")
    expected = asset.get("sha256")
    if expected:
        if sha256(path).lower() != expected.lower():
            raise AssetError("Asset SHA-256 does not match the manifest.")
        return "SHA-256 verified"
    return "WARNING: size-only verification; manifest has no SHA-256"


def present_status(directory: Path, asset: dict[str, Any]) -> str | None:
    destination = confined(directory, asset["path"])
    if not os.path.lexists(destination):
        return None
    # A dangling link must not be treated as an absent destination.
    return "already present; " + verify(destination, asset)


def commit_staged(stage: Path, stage_root: Path, directory: Path, asset: dict[str, Any]) -> str:
    """Validate a downloaded/copied file, then install without clobbering files."""
    try:
        stage.resolve().relative_to(stage_root.resolve())
    except (ValueError, OSError, RuntimeError) as exc:
        raise AssetError("Staged asset escapes its staging directory.") from exc
    if stage.is_symlink() or getattr(stage, "is_junction", lambda: False)():
        raise AssetError("Staged assets must not be symbolic links or junctions.")
    result = verify(stage, asset)
    destination = confined(directory, asset["path"])
    if os.path.lexists(destination):
        raise AssetError("Destination already exists; refusing to overwrite it.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination = confined(directory, asset["path"])
    try:
        # An atomic no-replace operation on the same filesystem (the usual case).
        os.link(stage, destination)
    except FileExistsError as exc:
        raise AssetError("Destination appeared during recovery; left unchanged.") from exc
    except OSError as exc:
        if exc.errno not in {errno.EXDEV, errno.EPERM, errno.ENOTSUP, errno.EACCES}:
            raise
        created = False
        try:
            with destination.open("xb") as out:
                created = True
                with stage.open("rb") as source:
                    shutil.copyfileobj(source, out, 1024 * 1024)
                out.flush()
                os.fsync(out.fileno())
        except BaseException:
            if created:
                destination.unlink(missing_ok=True)
            raise
    return "restored; " + result


def restore_asset(directory: Path, source_directory: Path, asset: dict[str, Any]) -> str:
    validate_asset(asset)
    already = present_status(directory, asset)
    if already:
        return already
    source = confined(source_directory, asset["path"])
    verify(source, asset)
    with tempfile.TemporaryDirectory(prefix=".asset-stage-", dir=directory) as scratch:
        stage_root = Path(scratch)
        stage = stage_root / "asset.tmp"
        shutil.copyfile(source, stage)
        return commit_staged(stage, stage_root, directory, asset)


def gh_environment(use_git_credentials: bool = False) -> dict[str, str]:
    env = os.environ.copy()
    env["GH_PROMPT_DISABLED"] = "1"
    if not use_git_credentials:
        return env
    if not shutil.which("git"):
        raise AssetError("Git is unavailable; use gh auth login instead.")
    credential_env = env.copy()
    credential_env["GIT_TERMINAL_PROMPT"] = "0"
    credential_env["GCM_INTERACTIVE"] = "Never"
    try:
        result = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            text=True, capture_output=True, timeout=30, env=credential_env,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        raise AssetError("Git credential helper could not be queried; use gh auth login.") from exc
    values = dict(line.split("=", 1) for line in result.stdout.splitlines() if "=" in line)
    token = values.get("password") if result.returncode == 0 else None
    if not token:
        raise AssetError("No GitHub credential available from Git; run gh auth login.")
    # Do not print or persist the token. It is scoped to a child environment.
    env["GH_TOKEN"] = token
    return env


def download_asset(directory: Path, asset: dict[str, Any], env: dict[str, str] | None = None) -> str:
    validate_asset(asset)
    if asset.get("reason") == LICENSED_REASON:
        raise AssetError("Commercial dependencies must be supplied locally by a licensed user.")
    if asset["availability"] != "release":
        return "local-only; use restore --source-root <old-repository>"
    already = present_status(directory, asset)
    if already:
        return already
    executable = shutil.which("gh")
    if not executable:
        raise AssetError("GitHub CLI is missing. Install gh, then run gh auth login.")
    release = asset["release"]
    with tempfile.TemporaryDirectory(prefix=".asset-stage-", dir=directory) as scratch:
        stage_root = Path(scratch)
        try:
            completed = subprocess.run(
                [executable, "release", "download", release["tag"], "--repo", release["repo"],
                 "--pattern", release["name"], "--dir", str(stage_root)],
                env=env or gh_environment(), capture_output=True, text=True,
            )
        except OSError as exc:
            raise AssetError("Could not start GitHub CLI.") from exc
        if completed.returncode:
            raise AssetError("Download failed. Check gh auth status, private-repository access, and release availability; retry explicitly.")
        stage = confined(stage_root, release["name"])
        return commit_staged(stage, stage_root, directory, asset)


def main(argv: list[str] | None = None, *, repo_root: Path | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("command", nargs="?", choices=["list", "check", "download", "restore"], default="list")
    parser.add_argument("--project", help="Project directory ID; omitted means all manifest-bearing projects")
    parser.add_argument("--source-root", type=Path, help="Old repository root containing video_project/")
    parser.add_argument("--include-licensed", action="store_true", help="Restore licensed local dependencies you already have permission to use")
    parser.add_argument("--use-git-credentials", action="store_true", help="Use Git's configured GitHub credential helper for this download process only")
    args = parser.parse_args(argv)
    if args.command == "restore" and args.source_root is None:
        parser.error("restore requires --source-root <old-repository>")
    root = (repo_root or REPO_ROOT).resolve()
    try:
        if args.project:
            projects = [args.project]
        else:
            projects = sorted(p.parent.name for p in (root / "video_project").glob("*/assets.manifest.json"))
        if not projects:
            print("No asset manifests found.")
            return 0
        failed = 0
        child_env = None
        for project in projects:
            directory, assets = load_manifest(root, project)
            print(f"[{project}] {len(assets)} manifest assets")
            source_dir = project_directory(args.source_root, project) if args.command == "restore" else None
            for asset in assets:
                rel = asset["path"]
                licensed = asset.get("reason") == LICENSED_REASON
                try:
                    if args.command == "list":
                        state = "present" if confined(directory, rel).is_file() else "missing"
                        message = f"{state}; {asset['availability']}; {asset['bytes']} bytes"
                        if licensed:
                            message += "; licensed local dependency"
                    elif licensed and (args.command == "download" or not args.include_licensed):
                        message = "skipped licensed dependency; restore locally with --include-licensed only if licensed"
                    elif args.command == "check":
                        message = verify(confined(directory, rel), asset)
                    elif args.command == "restore":
                        message = restore_asset(directory, source_dir, asset)
                    else:
                        if child_env is None and asset["availability"] == "release":
                            child_env = gh_environment(args.use_git_credentials)
                        message = download_asset(directory, asset, child_env)
                    print(f"  {rel}: {message}")
                except (AssetError, OSError) as exc:
                    failed += 1
                    print(f"  {rel}: ERROR: {exc}", file=sys.stderr)
        return 1 if failed else 0
    except (AssetError, OSError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("Interrupted. Completed assets are retained; rerun to continue. Existing files are never overwritten.", file=sys.stderr)
        raise SystemExit(130)
