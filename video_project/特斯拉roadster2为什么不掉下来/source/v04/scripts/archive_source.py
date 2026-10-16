"""Create a verified, recoverable source archive after final automatic QA passes.

Does not follow symbolic links/junctions or package shared dependencies. Does not
include the final MP4, renders, caches, credentials or voice-clone references.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[1]
DEFAULT_OUTPUT = PROJECT / "output/v04/Roadster_v04_可恢复源码.zip"
TEXT_EXT = {".py", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".md", ".txt", ".html", ".css", ".srt", ".vtt", ".yaml", ".yml", ".toml", ".csv", ".svg"}
SKIP_DIRS = {"node_modules", "bundle", "render-temp", "__pycache__", ".git", ".cache", "ab-previews", "processing", "prior", "protected"}
SECRET_PATTERNS = [
    re.compile(r"\bsk-(?:sp-)?[A-Za-z0-9_.\-]{20,}"),
    re.compile(r"\bAKIA[0-9A-Z]{16}\b"),
    re.compile(r"\b(?:ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{20,}"),
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    re.compile(r"(?i)[\"'](?:api[_-]?key|authorization|access[_-]?token|secret[_-]?key|password)[\"']\s*:\s*[\"'](?![\"']|\$|<|\{|YOUR_|REDACTED|REPLACE|EXAMPLE|PLACEHOLDER)[A-Za-z0-9_./+\-=]{18,}[\"']"),
]


def digest_bytes(data):
    return hashlib.sha256(data).hexdigest()


def digest_file(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def reparse(path):
    info = path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


def walk_safe(directory, skipped):
    if not directory.exists():
        return
    if reparse(directory):
        skipped.append({"path": str(directory.relative_to(PROJECT)), "reason": "junction-or-symlink"})
        return
    with os.scandir(directory) as scan:
        entries = sorted(scan, key=lambda e: e.name.casefold())
    for entry in entries:
        path = Path(entry.path)
        if reparse(path):
            skipped.append({"path": str(path.relative_to(PROJECT)), "reason": "junction-or-symlink"})
        elif entry.is_dir(follow_symlinks=False):
            if entry.name.casefold() not in SKIP_DIRS:
                yield from walk_safe(path, skipped)
        elif entry.is_file(follow_symlinks=False):
            yield path


def permitted_file(path):
    name = path.name.casefold()
    if path.suffix.casefold() in {".mp4", ".pyc", ".pyo", ".pem", ".key", ".pfx", ".p12"}:
        return False
    if name.startswith(".env") or name in {"auth.json", "credentials.json", "secrets.json", "runtime.json", "id_rsa", "id_ed25519"}:
        return False
    # Generated narration is included. Source voice-clone samples/metadata are not.
    if any(x in name for x in ("clone-reference", "clone_reference", "voice-reference", "voice_reference", "reference-voice", "reference_voice", "speaker-reference", "speaker_reference", "reference-audio", "reference_audio")):
        return False
    if path.suffix.casefold() in {".wav", ".mp3", ".flac", ".m4a", ".ogg"} and ("reference" in name or "参考" in name or "音色" in name):
        return False
    return True


def recovery_text():
    return """# Roadster v04 可恢复源码

本包保留最终视频所需的源码、字幕、生成的音频、渲染素材和来源台账。
最终 MP4 单独交付；不打包 node_modules、bundle、render-temp 或历史预览。

## 恢复与渲染

1. 解压后进入 source/v04。
2. 安装 Node.js、Python 和 FFmpeg，将 ffmpeg、ffprobe 放入 PATH。
3. 执行 npm ci，按锁文件安装项目依赖。原工程 node_modules 可能通过 junction
   使用共享依赖；归档不跟随该链接，恢复后使用独立的本地依赖。
4. 执行 npm run check、npm run stills 验证源码与代表帧。
5. 执行 npm run render 生成带音轨成片，再执行 npm run qa。

public/audio/master.wav、narration.wav、score.wav 已保留；重新渲染无需调用
TTS、图像生成或其他付费 API。原始/清理后逐句音频和 JSON 参数台账位于
source/v04/work/audio。Car.ts 是教学示意模型的可再生源。

若需要重新合成旁白，tts_generate.py 依赖用户现有 D:/python_project/tts
环境、本地 Qwen3 模型和用户音色参考。这些私有模型、音色样本与凭据不在
本包中，必须由用户自行配置；不要从历史脚本复制密钥。
其他音频处理脚本可能需要 numpy、scipy、soundfile 等 Python 包。
字体、Logo、论文和参考素材仍受各自来源许可约束，随包仅用于恢复该工程。

ARCHIVE_MANIFEST.json 列出每个归档文件的 SHA-256 和字节数，记录被排除的
链接和重复 GLB。manifest 自身不自引用哈希；ZIP 的 SHA-256 在旁边的
.zip.sha256 文件中。脚本写入前检查最终 QA 与对应 MP4 哈希；归档随后通过
完整 ZIP CRC、条目数及逐文件 SHA-256 检验。

自动技术检查不等于人工听审/视觉验收，最终字幕、镜头和事实仍应结合成片复核。
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--qa-report", type=Path, default=ROOT / "work/qa/final-video.json")
    parser.add_argument("--list-only", action="store_true", help="Inspect the allowlisted file inventory without building an archive; no QA gate needed")
    args = parser.parse_args()
    skipped, candidates = [], set()
    for folder in [ROOT / "src", ROOT / "scripts", ROOT / "public", PROJECT / "research", PROJECT / "subtitles/v04"]:
        candidates.update(walk_safe(folder, skipped))
    for name in ("package.json", "package-lock.json", "tsconfig.json"):
        path = ROOT / name
        if path.is_file() and not reparse(path):
            candidates.add(path)
    audio = ROOT / "work/audio"
    if audio.is_dir() and not reparse(audio):
        for entry in audio.iterdir():
            if entry.is_file() and entry.suffix.casefold() == ".json" and not reparse(entry):
                candidates.add(entry)
        for folder in (audio / "raw", audio / "clean"):
            candidates.update(walk_safe(folder, skipped))
    # Prefer assets/v04 canonical GLBs; fall back to the authored model export.
    models = list(walk_safe(PROJECT / "assets/v04", skipped))
    models = [p for p in models if p.suffix.casefold() == ".glb"]
    fallback = ROOT / "work/car-review/roadster_teaching.glb"
    if fallback.is_file() and not reparse(fallback):
        models.append(fallback)
    model_hashes = {}
    for path in models:
        digest = digest_file(path)
        if digest in model_hashes:
            skipped.append({"path": path.relative_to(PROJECT).as_posix(), "reason": "duplicate-model-content", "retained": model_hashes[digest]})
        else:
            candidates.add(path)
            model_hashes[digest] = path.relative_to(PROJECT).as_posix()
    entries = []
    for path in sorted(candidates, key=lambda p: str(p).casefold()):
        relative = path.relative_to(PROJECT).as_posix()
        if reparse(path) or not path.resolve().is_relative_to(PROJECT.resolve()):
            raise ValueError(f"Unsafe archive source: {relative}")
        if not permitted_file(path):
            skipped.append({"path": relative, "reason": "excluded-private-or-generated-file"})
            continue
        if path.suffix.casefold() in TEXT_EXT:
            text = path.read_text(encoding="utf8", errors="replace")
            if any(pattern.search(text) for pattern in SECRET_PATTERNS):
                raise ValueError(f"Potential credential detected; archive refused: {relative}")
        entries.append({"path": relative, "bytes": path.stat().st_size, "sha256": digest_file(path)})
    if not entries:
        raise ValueError("No recoverable source files found")
    if args.list_only:
        print(json.dumps({"status": "inventory-only", "files": len(entries), "bytes": sum(e["bytes"] for e in entries),
                          "uniqueModels": len(model_hashes), "excluded": len(skipped), "qaChecked": False}, ensure_ascii=False))
        return 0
    qa = json.loads(args.qa_report.read_text(encoding="utf8"))
    if not qa.get("automaticChecksPassed") or qa.get("executionError"):
        raise ValueError("Final automatic QA has not passed; no archive created")
    if not qa.get("checks") or any(not c.get("passed") for c in qa["checks"]):
        raise ValueError("QA report is incomplete or contains failed checks")
    video = Path(qa["video"])
    if not video.is_file() or digest_file(video) != qa.get("videoSha256"):
        raise ValueError("QA report does not match the current final MP4")
    output = args.output.resolve()
    if not output.is_relative_to((PROJECT / "output/v04").resolve()):
        raise ValueError("Archive output must remain inside project output/v04")
    if output.is_symlink() or (output.exists() and reparse(output)):
        raise ValueError("Archive target is a reparse point")
    output.parent.mkdir(parents=True, exist_ok=True)
    readme = recovery_text().encode("utf8")
    entries.append({"path": "RECOVERY.md", "bytes": len(readme), "sha256": digest_bytes(readme), "generated": True})
    manifest = {"version": 1, "createdAt": datetime.now(timezone.utc).isoformat(),
                "project": PROJECT.name, "sourceVersion": "v04", "files": entries,
                "fileCountExcludingManifest": len(entries), "manifestSelfHashExcluded": True,
                "finalVideoSha256": qa["videoSha256"], "qaReportSha256": digest_file(args.qa_report),
                "automaticChecksPassed": True, "manualListeningVerified": qa.get("subjectiveListeningChecked", False),
                "followedJunctions": False, "privateVoiceReferenceIncluded": False,
                "dependencies": "npm ci using included package-lock.json; shared node_modules not included",
                "excluded": skipped}
    pending = output.with_suffix(".zip.partial")
    if pending.exists() and reparse(pending):
        raise ValueError("Temporary archive target is a reparse point")
    try:
        with zipfile.ZipFile(pending, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=2, allowZip64=True) as archive:
            for entry in entries:
                if entry.get("generated"):
                    archive.writestr(entry["path"], readme)
                else:
                    path = PROJECT / entry["path"]
                    if reparse(path) or digest_file(path) != entry["sha256"]:
                        raise ValueError(f"Source changed while archiving: {entry['path']}")
                    archive.write(path, entry["path"])
            archive.writestr("ARCHIVE_MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf8"))
        with zipfile.ZipFile(pending) as archive:
            bad = archive.testzip()
            if bad:
                raise ValueError(f"ZIP CRC failure: {bad}")
            if len(archive.infolist()) != len(entries) + 1 or len(set(archive.namelist())) != len(entries) + 1:
                raise ValueError("ZIP item count mismatch or duplicate names")
            for entry in entries:
                h = hashlib.sha256()
                count = 0
                with archive.open(entry["path"]) as content:
                    for chunk in iter(lambda: content.read(1024 * 1024), b""):
                        h.update(chunk)
                        count += len(chunk)
                if count != entry["bytes"] or h.hexdigest() != entry["sha256"]:
                    raise ValueError(f"Archive payload mismatch: {entry['path']}")
        os.replace(pending, output)
        checksum = digest_file(output)
        output.with_suffix(".zip.sha256").write_text(f"{checksum}  {output.name}\n", encoding="utf8")
        output.with_suffix(".manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf8")
        print(json.dumps({"status": "verified", "archive": str(output), "files": len(entries) + 1,
                          "bytes": output.stat().st_size, "sha256": checksum, "crcChecked": True,
                          "payloadHashesChecked": True}, ensure_ascii=False))
        return 0
    except Exception:
        if pending.exists() and pending.resolve().is_relative_to((PROJECT / "output/v04").resolve()) and not reparse(pending):
            pending.unlink()
        raise


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, KeyError, zipfile.BadZipFile) as exc:
        print(json.dumps({"status": "not-created", "error": str(exc)}, ensure_ascii=False))
        sys.exit(2)
