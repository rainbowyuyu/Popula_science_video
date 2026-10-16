"""Create a private, recoverable V06 project ZIP after final QA approval.

Preparation is read-only by default: ``python scripts/package_v06.py --dry-run``.
Actual packaging requires ``--create --qa-approved``. This tool never cleans or
deletes source files. Commercial water code and personal voice takes make this
a LOCAL USER PROJECT, not a publicly redistributable open-source asset bundle.
Only Python's standard library is needed to run the packager.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import pathlib
import re
import stat
import sys
import zipfile
import zlib
from dataclasses import dataclass

ROOT = pathlib.Path(__file__).resolve().parents[1]
USED_QWEN = ("street", "droplet", "waterfall", "circle", "fountain")
STEMS = ("master.wav", "premaster.wav", "narration.wav", "score.wav", "sfx.wav", "bed.wav")
BLOCKED_DIRS = {"node_modules", ".git", ".claude", ".codex", ".agents", "__pycache__",
                "tmp", "temp", "logs", "log", "cache", ".cache", "bundle", "bundles"}
BLOCKED_SUFFIXES = {".log", ".pyc", ".pyo", ".blend1", ".tmp", ".bak", ".pem", ".key"}
BLOCKED_BASENAMES = {".npmrc", ".netrc", "auth.json", "credentials.json", "settings.json"}
TEXT_SUFFIXES = {".json", ".md", ".txt", ".py", ".ts", ".tsx", ".js", ".mjs", ".cjs",
                 ".css", ".html", ".svg", ".ps1", ".yml", ".yaml", ".toml", ".xml"}
CHUNK = 4 * 1024 * 1024
CARRY = 32 * 1024

# Patterns contain no real credential. Findings never print matched values.
SECRET_BYTES = [
    ("provider_api_key", re.compile(rb"(?<![A-Za-z0-9])sk-(?:sp-)?[A-Za-z0-9_.-]{24,}")),
    ("anthropic_api_key", re.compile(rb"sk-ant-[A-Za-z0-9_-]{20,}")),
    ("github_token", re.compile(rb"(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{30,})")),
    ("aws_access_key", re.compile(rb"(?:AKIA|ASIA)[A-Z0-9]{16}")),
    ("private_key", re.compile(b"-----BEGIN " + rb"(?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("jwt", re.compile(rb"eyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{24,}")),
    ("authorization_bearer", re.compile(rb"\bBearer[ \t]+[A-Za-z0-9_.+/=-]{24,}")),
    ("signed_download_credential", re.compile(rb"[?&](?:X-Amz-Signature|OSSAccessKeyId|Signature|access_token|api_key|token)=[A-Za-z0-9%_.+/=-]{12,}", re.I)),
]
SECRET_ASSIGNMENT = re.compile(
    rb"(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|password)"
    rb"[\"']?[ \t]*[:=][ \t]*[\"']([^\"'\r\n]{8,})[\"']", re.I)
PLACEHOLDERS = {b"redacted", b"your_api_key", b"your-api-key", b"replace_me", b"placeholder", b"undefined", b"not provided", b"not configured"}


class PackageError(RuntimeError):
    pass


@dataclass(frozen=True)
class Entry:
    source: pathlib.Path
    archive_path: str
    role: str
    external_source: bool = False


def jd(value: object) -> bytes:
    return (json.dumps(value, ensure_ascii=False, indent=2) + "\n").encode("utf-8")


def load_json(relative: str) -> dict:
    return json.loads((ROOT / relative).read_text(encoding="utf-8"))


def is_reparse(path: pathlib.Path) -> bool:
    info = path.lstat()
    return stat.S_ISLNK(info.st_mode) or bool(getattr(info, "st_file_attributes", 0) & 0x400)


def prohibited_name(path: pathlib.Path) -> bool:
    name = path.name.casefold()
    return (name in BLOCKED_DIRS or name in BLOCKED_BASENAMES or name.startswith(".env")
            or path.suffix.casefold() in BLOCKED_SUFFIXES)


def safe_project_path(path: pathlib.Path) -> pathlib.Path:
    """Check lexical parents before resolving, so junctions are never followed."""
    path = pathlib.Path(os.path.abspath(path))
    try:
        relative = path.relative_to(ROOT)
    except ValueError as exc:
        raise PackageError("Project selection escaped the episode root") from exc
    current = ROOT
    if is_reparse(current):
        raise PackageError("Project root itself is a reparse point")
    for part in relative.parts:
        current = current / part
        if prohibited_name(current):
            raise PackageError(f"Forbidden selected path: {relative.as_posix()}")
        if current.exists() and is_reparse(current):
            raise PackageError(f"Refusing selected junction/symlink: {relative.as_posix()}")
    return path


def walk_safe(directory: pathlib.Path):
    if not directory.exists():
        return
    safe_project_path(directory)
    for path in sorted(directory.iterdir(), key=lambda p: p.name.casefold()):
        if prohibited_name(path):
            continue
        if is_reparse(path):
            raise PackageError(f"Refusing junction/symlink under selected directory: {path.relative_to(ROOT).as_posix()}")
        if path.is_dir():
            yield from walk_safe(path)
        elif path.is_file():
            yield path


def choose_entries(args) -> tuple[list[Entry], list[dict], dict]:
    selected: dict[str, Entry] = {}
    omitted: list[dict] = []

    def add(relative: str | pathlib.Path, role: str, required: bool = True):
        path = safe_project_path(ROOT / relative)
        if not path.is_file():
            if required:
                raise PackageError(f"Missing required file: {path.relative_to(ROOT).as_posix()}")
            return
        key = path.relative_to(ROOT).as_posix()
        selected.setdefault(key, Entry(path, key, role))

    def tree(relative: str, role: str, predicate=None, required: bool = True):
        folder = safe_project_path(ROOT / relative)
        if not folder.is_dir():
            if required:
                raise PackageError(f"Missing required directory: {relative}")
            return
        for path in walk_safe(folder):
            if predicate is None or predicate(path):
                add(path.relative_to(ROOT), role)

    for relative in ("package.json", "package-lock.json", "tsconfig.json", "src/index.tsx"):
        add(relative, "entry/dependency-lock")
    entry_source = (ROOT / "src/index.tsx").read_text(encoding="utf-8")
    if "V06RainbowArcFilm" not in entry_source or "registerRoot" not in entry_source:
        raise PackageError("src/index.tsx does not register the accepted V06 composition")
    package = load_json("package.json")
    if not package.get("private"):
        raise PackageError("This commercial/personal project must have package.private=true")
    tree("src", "source")
    tree("scripts", "scripts", lambda p: p.suffix.casefold() in TEXT_SUFFIXES)
    tree("docs", "documentation-and-provenance")
    for relative in ("README.md", "README_V06.md", "AGENTS.md", "requirements.txt", "remotion.config.ts"):
        add(relative, "root-documentation", required=False)
    tree("public/brand", "user-brand")
    tree("public/fonts", "runtime-font")
    tree("public/sources", "formula-and-paper-runtime")
    for relative in ("research/story.json", "research/story-research-v06.md", "research/story-research-v05.md"):
        add(relative, "story-and-research", required=False)
    tree("research/story-source-v06", "story-source-material")
    tree("research/sources", "source-license-and-original-paper")
    tree("research/formulas", "latex-formulas")
    tree("research/physics", "physics-source-and-verification")
    tree("research/qa", "qa-numerical-and-contact-sheet",
         lambda p: p.suffix.casefold() in {".json", ".md", ".mjs", ".ts", ".txt"}
         or (p.suffix.casefold() in {".png", ".jpg"} and ("contact" in p.name.casefold() or p.parent == ROOT / "research/qa")))

    timeline = load_json("src/timeline.json")
    audio = load_json("public/audio/audio-manifest.json")
    clips = timeline.get("clips", [])
    ids = [c["id"] for c in clips]
    if len(ids) != 39 or len(set(ids)) != 39:
        raise PackageError("Expected the accepted 39-clip V06 narration edit")
    audio_by_id = {c["id"]: c for c in audio.get("clips", [])}
    if set(audio_by_id) != set(ids):
        raise PackageError("Current timeline and audio manifest clips do not match")
    add("public/audio/audio-manifest.json", "voice-manifest")
    for clip_id in ids:
        row = audio_by_id[clip_id]
        for relative, role in ((row["raw"], "personal-voice-raw"), (row["audio"], "personal-voice-clean")):
            add(relative.replace("\\", "/"), role)
        add(f"research/audio/raw/{clip_id}-protected.wav", "personal-voice-tail-protected", required=False)
        add(f"research/audio/takes/{clip_id}.json", "voice-take-record", required=False)
        add(f"research/audio/takes/{clip_id}-master.json", "voice-processing-record", required=False)
        add(f"research/audio/asr-v06/{clip_id}.json", "subtitle-word-alignment", required=False)
    for name in STEMS:
        add(f"public/audio/{name}", "accepted-audio-stem")
    tree("research/audio", "audio-qa-and-runtime-record",
         lambda p: p.parent == ROOT / "research/audio" and p.suffix.casefold() in {".json", ".md"})
    for name in ("alignment-report.json", "progress.json"):
        add(f"research/audio/asr-v06/{name}", "alignment-record", required=False)
    tree("research/music", "music-arrangement-and-CC0-samples")
    for relative in ("delivery/彩虹为什么是弧形_V06.srt", "delivery/彩虹为什么是弧形_V06_口播与声音说明.md",
                     "delivery/发布文案V06.md", "delivery/素材清单V06.json", "delivery/清理候选计划V06.json", "delivery/清理候选计划V06.md"):
        add(relative, "delivery-documentation")
    tree("delivery/covers_v06", "four-ratio-covers-and-editable-plates")

    add("public/assets_v06/README.md", "asset-interfaces")
    tree("public/assets_v06/vendor-water", "commercial-water-local-use")
    add("public/assets_v06/vendor-water/LICENSE.md", "commercial-water-license")
    add("public/assets_v06/vendor-water/waterpro-adapter.min.js", "commercial-water-runtime")
    tree("public/assets_v06/lux3d", "current-gaussian-splat-data")
    for relative in ("public/assets/lux3d/lux3d-delivery.json", "public/assets/lux3d/extracted/mesh/tex_mesh.glb"):
        add(relative, "Lux3D-original-task-and-mesh")
    ply = "public/assets/lux3d/extracted/3dgs/gaussian.ply"
    if args.external_ply:
        omitted.append({"path": ply, "absolute_locator": str(safe_project_path(ROOT / ply)),
                        "role": "retained-external-Lux3D-original-ply", "required_for_render": False,
                        "reason": "Current rendering reads included splats-v06.json; original PLY stays at this local location with verified SHA256."})
    else:
        add(ply, "Lux3D-original-ply")
    lux_zip = "public/assets/lux3d/lux3d.zip"
    if args.include_lux_zip:
        add(lux_zip, "Lux3D-original-provider-archive")
    else:
        omitted.append({"path": lux_zip, "absolute_locator": str(safe_project_path(ROOT / lux_zip)),
                        "role": "retained-external-Lux3D-original-archive", "required_for_render": False,
                        "reason": "Avoid duplicate PLY/GLB payload; original provider ZIP remains retained locally."})
    gqb = [p for p in walk_safe(ROOT / "public/assets/lux3d") if p.suffix.casefold() == ".gqb"]
    for path in gqb:
        add(path.relative_to(ROOT), "Lux3D-original-gqb")

    blender_names = ("spherical_raindrop_v06.blend", "spherical_raindrop_v06.glb", "raindrop_hero_v06.png",
                     "rain_garden_studio_environment.jpg", "manifest.json", "quality-audit.json",
                     "cover_glass_sphere_v06.blend", "cover_glass_highlights_v06.png", "cover_pale_sky_environment.jpg",
                     "cover-render-provenance.json", "micro_orbit_preview.mp4", "micro_orbit_contact.jpg")
    for name in blender_names:
        add(f"public/assets_v06/blender/{name}", "Blender-model-and-accepted-beauty-source")
    tree("public/assets_v06/blender/micro_orbit_clean", "native-Blender-micro-sequence", lambda p: p.suffix.casefold() == ".png")
    if len(list((ROOT / "public/assets_v06/blender/micro_orbit_clean").glob("drop_*.png"))) != 120:
        raise PackageError("Accepted native Blender micro sequence is incomplete")

    qwen_tasks = []
    for slug in USED_QWEN:
        base = f"public/assets_v06/qwen/generated/{slug}"
        provenance = load_json(f"{base}/provenance.json")
        if provenance.get("provider_status") != "SUCCEEDED":
            raise PackageError(f"Qwen task is not successful: {slug}")
        for name in ("provider.mp4", "provenance.json", "quality-audit.json", "contact.jpg"):
            add(f"{base}/{name}", f"Qwen-{slug}-provider-and-provenance")
        for i in range(1, 151):
            add(f"{base}/frames/frame_{i:04d}.jpg", f"Qwen-{slug}-actual-video-frame")
        if args.include_cfr:
            add(f"{base}/cfr_allintra.mp4", "Qwen-recreatable-CFR-backup")
        else:
            omitted.append({"path": f"{base}/cfr_allintra.mp4", "role": "recreatable-CFR-backup",
                            "required_for_render": False, "reason": "All actual runtime frames and provider original are included; prepare-only recreates the CFR backup without credentials."})
        qwen_tasks.append({"slug": slug, "task_id": provenance["task_id"], "model": provenance["model"], "frames": 150})
    add("public/assets_v06/qwen/manifest.json", "Qwen-batch-record")
    add("public/assets_v06/qwen/generated/garden/provenance.json", "unused-Qwen-task-record")
    add("public/assets_v06/qwen/generated/garden/quality-audit.json", "unused-Qwen-quality-decision")
    omitted.append({"path": "public/assets_v06/qwen/generated/garden/provider.mp4", "role": "retained-unused-Qwen-provider-original",
                    "absolute_locator": str(ROOT / "public/assets_v06/qwen/generated/garden/provider.mp4"),
                    "required_for_render": False, "reason": "Garden excluded due to forward sun; retain original locally, no paid resubmission needed."})

    # Rebuild helpers/prompts/reports are included; logs and temporary bundles are not.
    for path in (ROOT / "work").iterdir():
        if path.is_file() and not prohibited_name(path) and path.suffix.casefold() in {".py", ".ts", ".mjs", ".md", ".json"}:
            add(path.relative_to(ROOT), "asset-build-helper-and-bounded-prompt")
    tree("work/opus-runs", "Opus-response-and-completion-record",
         lambda p: p.name in {"response.md", "response.partial.md", "report.json", "prompt.md", "task.md"}, required=False)

    # Runtime has its own WOFF2. This optional full CJK font supports cover re-layout.
    font = pathlib.Path("C:/Windows/Fonts/NotoSansSC-VF.ttf")
    if font.is_file():
        if is_reparse(font):
            raise PackageError("Refusing external font reparse point")
        key = "recovery-support/fonts/NotoSansSC-VF.ttf"
        selected[key] = Entry(font, key, "OFL1.1-full-cover-font", external_source=True)
    else:
        omitted.append({"path": "recovery-support/fonts/NotoSansSC-VF.ttf", "role": "optional-full-cover-font",
                        "required_for_render": False, "reason": "Installed full font not found; included unified.woff2 still supports the accepted film."})
    facts = {"entry": "src/index.tsx", "composition": "RainbowArc", "video_version": "V06", "fps": 30,
             "duration_frames": timeline["duration"], "personal_voice_clips": ids,
             "qwen_used_tasks": qwen_tasks, "qwen_unused": ["garden"], "gqb_files_found": len(gqb),
             "gqb_note": "No standalone GQB exists in this project." if not gqb else "Original GQB files included.",
             "commercial_water": "public/assets_v06/vendor-water/LICENSE.md",
             "tts_reference_included": False, "tts_reference_reason": "Accepted raw/clean narration is included; private reference audio and model weights remain in the user's existing local TTS installation."}
    return sorted(selected.values(), key=lambda e: e.archive_path), omitted, facts


def placeholder(value: bytes) -> bool:
    value = value.strip()
    low = value.lower()
    return (low in PLACEHOLDERS or value.startswith((b"${", b"<", b"{", b"process.env.", b"os.environ"))
            or (low.startswith(b"bearer ") and placeholder(value[7:])))


def scan_file(entry: Entry) -> dict:
    before = entry.source.stat()
    digest = hashlib.sha256()
    crc = 0
    carry = b""
    offset = 0
    findings = []
    text = entry.source.suffix.casefold() in TEXT_SUFFIXES
    with entry.source.open("rb") as handle:
        while True:
            block = handle.read(CHUNK)
            if not block:
                break
            digest.update(block)
            crc = zlib.crc32(block, crc)
            data = carry + block
            for name, pattern in SECRET_BYTES:
                match = pattern.search(data)
                if match:
                    findings.append({"file": entry.archive_path, "rule": name, "byte_offset": max(0, offset - len(carry) + match.start())})
            if text:
                for match in SECRET_ASSIGNMENT.finditer(data):
                    if not placeholder(match.group(1)):
                        findings.append({"file": entry.archive_path, "rule": "literal_sensitive_assignment", "byte_offset": max(0, offset - len(carry) + match.start())})
                        break
            carry = data[-CARRY:]
            offset += len(block)
    after = entry.source.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise PackageError(f"File changed during preflight: {entry.archive_path}")
    if findings:
        # Print only locations and rule names, never a secret value or source line.
        raise PackageError("Sensitive content rejected: " + json.dumps(findings[:8], ensure_ascii=False))
    return {"path": entry.archive_path, "bytes": before.st_size, "sha256": digest.hexdigest(),
            "crc32": f"{crc & 0xffffffff:08x}", "role": entry.role, "mtime_ns": before.st_mtime_ns,
            "source_external_to_project": entry.external_source, "sensitive_scan": "passed"}


def validate_voice_hashes(rows: list[dict]):
    by_path = {r["path"]: r for r in rows}
    audio = load_json("public/audio/audio-manifest.json")
    for clip in audio["clips"]:
        for field, hash_field in (("audio", "sha256"), ("raw", "rawSHA256")):
            path = clip[field].replace("\\", "/")
            if by_path[path]["sha256"] != clip[hash_field]:
                raise PackageError(f"Accepted voice hash mismatch: {clip['id']} {field}")


def support_files(facts: dict) -> dict[str, bytes]:
    readme = f"""# V06 本地用户工程 / 非公开开源素材包

本包用于 rainbow鱼 当前用户在本机恢复《彩虹为什么是弧形？》V06。
包含商业水面运行代码及其完整许可、个人配音与生成素材；不能把本包作为公共开源素材库发布。
商业水面许可：{facts['commercial_water']}。来源、字体OFL、采样CC0及论文许可保留在docs/research/delivery中。

## 恢复与渲染

1. 解压到普通本地目录，避免覆盖正在工作的工程。包内没有node_modules或junction。
2. 安装兼容Node.js/npm，运行 `npm ci`、`npm run check`。
3. 从 `src/index.tsx` 的 `RainbowArc` Composition渲染：`npm run render`。
4. 光学验证：`node research/physics/check-optics.mjs`、`node research/physics/check-world-v06.mjs`。
5. 镜头检查：`node scripts/audit-camera-film-v06.mjs`、`node scripts/audit-motion.mjs`。

主片尺寸1920×1080，30fps，当前{facts['duration_frames']}帧。以包内timeline.json为准。
所有实际使用的5种Qwen素材均包含原provider视频、750张实际解码帧和任务provenance；渲染不需要API凭据。
未纳入本片的garden原视频保留在原工程位置，定位和哈希记录在PACKAGE_MANIFEST.json。
省略的CFR副本可用 `python work/generate_qwen_batch_v06.py --prepare-only` 重建。
原始PLY默认随包；若创建时选择--external-ply，包内保留其本地定位及SHA256，当前渲染仍使用已包含的splats-v06.json。
{facts['gqb_note']}

Blender源文件和实际GLB已包含。用户安装入口为 `D:\\blender\\blender.exe`；恢复到其他机器时调整工具路径。
39段个人旁白raw/clean、字幕时间和narration/score/sfx/bed/premaster/master分轨已包含，音画不依赖重新合成。
重新克隆音色需要用户自己的TTS模型和参考音频，它们没有复制到本包；外部模型/参考定位和哈希见research/audio/runtime-v06.json。
重做音乐/封面等Python资产通常需要numpy、scipy、soundfile、Pillow、fontTools等依赖。
影片使用已包含的public/fonts/unified.woff2；封面全字库备份（若本机存在）在recovery-support/fonts/NotoSansSC-VF.ttf。
封面脚本保留本机字体路径，必要时把其FONT变量指向该备份，不改变字体家族。

完整文件SHA256和CRC32：PACKAGE_MANIFEST.json。ZIP创建后会逐项解码核验CRC和SHA256，旁边的crc-report.json记录结果。
没有API密钥、账号配置、登录日志或全局Claude设置；生成工具凭据需用户在自己的运行环境提供。
包内清理计划仅为记录，没有在归档时执行删除。最终MP4与监听预览不放入源码包，避免重复大文件。
"""
    powershell = """# Local restoration helper: dependency installation and checks only.
# Extract this LOCAL USER PROJECT to a fresh folder before running.
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    npm run check
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed' }
    node research/physics/check-optics.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Optics check failed' }
    node research/physics/check-world-v06.mjs
    if ($LASTEXITCODE -ne 0) { throw 'World check failed' }
    Write-Host 'V06 restored. Render with: npm run render'
} finally { Pop-Location }
"""
    return {"LOCAL_USER_PROJECT_README.md": readme.encode("utf-8"), "RESTORE_V06.ps1": powershell.encode("utf-8-sig")}


def verify_zip(path: pathlib.Path, expected: dict[str, dict]) -> dict:
    checked = []
    with zipfile.ZipFile(path, "r") as archive:
        if len(archive.namelist()) != len(set(archive.namelist())):
            raise PackageError("Duplicate ZIP member names")
        for index, info in enumerate(archive.infolist(), 1):
            if info.filename.startswith("/") or ".." in pathlib.PurePosixPath(info.filename).parts:
                raise PackageError("Unsafe ZIP member path")
            digest = hashlib.sha256()
            crc = 0
            size = 0
            # ZipExtFile verifies the embedded CRC at EOF; independent CRC/SHA below.
            with archive.open(info, "r") as handle:
                for block in iter(lambda: handle.read(CHUNK), b""):
                    digest.update(block)
                    crc = zlib.crc32(block, crc)
                    size += len(block)
            if size != info.file_size or (crc & 0xffffffff) != info.CRC:
                raise PackageError(f"ZIP CRC/size failure: {info.filename}")
            if info.filename in expected and digest.hexdigest() != expected[info.filename]["sha256"]:
                raise PackageError(f"ZIP SHA256 failure: {info.filename}")
            checked.append({"path": info.filename, "bytes": size, "crc32": f"{crc & 0xffffffff:08x}",
                            "sha256": digest.hexdigest(), "crc_ok": True, "sha256_ok": True})
            if index % 100 == 0:
                print(f"CRC/SHA verified {index}/{len(archive.infolist())}", flush=True)
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(CHUNK), b""):
            digest.update(block)
    return {"schema": "rainbow.v06.zip-crc-report/1", "zip": path.name, "bytes": path.stat().st_size,
            "sha256": digest.hexdigest(), "all_crc_passed": True, "all_sha256_passed": True,
            "member_count": len(checked), "members": checked}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Read/select/scan/hash files and print a plan; writes nothing (default)")
    mode.add_argument("--create", action="store_true", help="Actually write the recoverable private ZIP and verification sidecars")
    parser.add_argument("--qa-approved", action="store_true", help="Root has explicitly confirmed final QA passed; required with --create")
    parser.add_argument("--output", help="New ZIP path inside this project; existing files are never overwritten")
    parser.add_argument("--external-ply", action="store_true", help="Keep original PLY outside ZIP with local locator/hash; included sample remains runnable")
    parser.add_argument("--include-lux-zip", action="store_true", help="Also include retained original Lux3D ZIP, duplicating included PLY/GLB")
    parser.add_argument("--include-cfr", action="store_true", help="Also include recreatable CFR backup videos; originals and all used frames are always included")
    parser.add_argument("--compression", type=int, choices=range(1, 10), default=9, metavar="1..9")
    args = parser.parse_args()
    if args.create and not args.qa_approved:
        raise PackageError("Actual packaging requires explicit Root final-QA approval and --qa-approved")
    entries, omitted, facts = choose_entries(args)
    rows = []
    for index, entry in enumerate(entries, 1):
        rows.append(scan_file(entry))
        if index % 100 == 0:
            print(f"Sensitive scan/hash {index}/{len(entries)}", flush=True)
    validate_voice_hashes(rows)
    for record in omitted:
        locator = record.get("absolute_locator")
        if locator:
            path = safe_project_path(pathlib.Path(locator))
            if not path.is_file():
                raise PackageError(f"Missing retained external original: {record['path']}")
            checked = scan_file(Entry(path, record["path"], record["role"]))
            record.update(bytes=checked["bytes"], sha256=checked["sha256"], crc32=checked["crc32"], sensitive_scan="passed")
    generated = support_files(facts)
    generated_rows = [{"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                       "crc32": f"{zlib.crc32(data) & 0xffffffff:08x}", "role": "generated-recovery-support", "sensitive_scan": "credential-free template"}
                      for name, data in generated.items()]
    manifest = {"schema": "rainbow.v06.local-user-project-package/1", "created_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
                "distribution": "LOCAL USER PROJECT / NOT A PUBLIC OPEN-SOURCE ASSET BUNDLE",
                "facts": facts, "files": rows + generated_rows, "retained_external_or_recreatable": omitted,
                "exclusions": ["node_modules and all junctions", "temporary bundles/caches", "logs and credentials/config files",
                               "private TTS reference and model weights", "unused old audio/visual takes", "final MP4 and duplicate previews"],
                "original_qwen_retained": True, "original_lux_ply_included": not args.external_ply,
                "commercial_water_license_included": True, "cleanup_executed": False,
                "manifest_self_hash": "Stored in adjacent crc-report.json to avoid a self-referential hash."}
    data = jd(manifest)
    generated["PACKAGE_MANIFEST.json"] = data
    expected = {r["path"]: r for r in rows + generated_rows}
    expected["PACKAGE_MANIFEST.json"] = {"sha256": hashlib.sha256(data).hexdigest()}
    plan = {"dry_run": not args.create, "selected_files": len(entries), "used_qwen_frame_count": 750,
            "voice_raw_and_clean_clips": len(facts["personal_voice_clips"]), "standalone_gqb_found": facts["gqb_files_found"],
            "uncompressed_mib": round(sum(r["bytes"] for r in rows) / 1024 / 1024, 2),
            "sensitive_scan": "passed", "commercial_water": "private local-user-project only", "source_deletions": 0}
    print(json.dumps(plan, ensure_ascii=False, indent=2), flush=True)
    if not args.create:
        return 0
    output = pathlib.Path(args.output) if args.output else ROOT / "delivery/彩虹为什么是弧形_V06_本地可恢复工程.zip"
    if not output.is_absolute():
        output = ROOT / output
    output = safe_project_path(output)
    if output.suffix.casefold() != ".zip":
        raise PackageError("Output must be a .zip path")
    side_manifest = output.with_suffix(".manifest.json")
    side_crc = output.with_suffix(".crc-report.json")
    temporary = output.with_name(output.name + ".incomplete")
    if any(p.exists() for p in (output, side_manifest, side_crc, temporary)):
        raise PackageError("Output/sidecar already exists; choose a new output path")
    output.parent.mkdir(parents=True, exist_ok=True)
    by_path = {r["path"]: r for r in rows}
    # Incomplete ZIP stays clearly labelled if a failure occurs. No source cleanup.
    with zipfile.ZipFile(temporary, "x", compression=zipfile.ZIP_DEFLATED, compresslevel=args.compression, allowZip64=True) as archive:
        archive.comment = b"LOCAL USER PROJECT - NOT PUBLIC OPEN SOURCE; commercial water and personal voice assets"
        for index, entry in enumerate(entries, 1):
            row = by_path[entry.archive_path]
            current = entry.source.stat()
            if (current.st_size, current.st_mtime_ns) != (row["bytes"], row["mtime_ns"]):
                raise PackageError(f"Source changed after preflight: {entry.archive_path}")
            # Already-compressed files are stored, avoiding ineffective recompression.
            kind = zipfile.ZIP_STORED if entry.source.suffix.casefold() in {".jpg", ".jpeg", ".png", ".mp4", ".m4a", ".woff2", ".zip"} else zipfile.ZIP_DEFLATED
            archive.write(entry.source, entry.archive_path, compress_type=kind, compresslevel=args.compression if kind == zipfile.ZIP_DEFLATED else None)
            if index % 100 == 0:
                print(f"ZIP wrote {index}/{len(entries)}", flush=True)
        for name, payload in generated.items():
            archive.writestr(name, payload, compress_type=zipfile.ZIP_DEFLATED, compresslevel=args.compression)
    report = verify_zip(temporary, expected)
    report["zip"] = output.name
    if output.exists():
        raise PackageError("Target appeared during packaging; incomplete archive retained")
    temporary.rename(output)
    with side_manifest.open("xb") as handle:
        handle.write(data)
    with side_crc.open("xb") as handle:
        handle.write(jd(report))
    print(json.dumps({"zip": str(output), "mib": round(output.stat().st_size / 1024 / 1024, 2),
                      "manifest": str(side_manifest), "crc_report": str(side_crc), "all_crc_and_sha256_passed": True,
                      "source_deletions": 0}, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (PackageError, OSError, zipfile.BadZipFile, ValueError) as exc:
        # Errors expose paths/rule names only. The scanner never includes matches.
        print(f"PACKAGE REFUSED: {exc}", file=sys.stderr)
        sys.exit(2)
