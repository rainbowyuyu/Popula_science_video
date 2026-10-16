"""Create a private, recoverable V07 project ZIP after final QA approval.

Preparation is read-only by default: ``python scripts/package_v07.py --dry-run``.
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


def checked_episode_source(path: pathlib.Path, episode: pathlib.Path) -> pathlib.Path:
    """Allow only a named episode root, checking lexical parents for reparse points."""
    path = pathlib.Path(os.path.abspath(path))
    episode = pathlib.Path(os.path.abspath(episode))
    try:
        relative = path.relative_to(episode)
    except ValueError as exc:
        raise PackageError("Named episode source selection escaped its root") from exc
    current = episode
    if not current.is_dir() or is_reparse(current):
        raise PackageError("Missing or reparse-point episode source root")
    for part in relative.parts:
        current = current / part
        if prohibited_name(current):
            raise PackageError(f"Forbidden selected path: {relative.as_posix()}")
        if current.exists() and is_reparse(current):
            raise PackageError(f"Refusing selected junction/symlink: {relative.as_posix()}")
    return path


FALLBACK_ROOT = ROOT.parent / "rainbow_arc_2026_v06"


def safe_source_path(path: pathlib.Path) -> pathlib.Path:
    candidate = pathlib.Path(os.path.abspath(path))
    if candidate.is_relative_to(ROOT):
        return safe_project_path(candidate)
    if candidate.is_relative_to(FALLBACK_ROOT):
        return checked_episode_source(candidate, FALLBACK_ROOT)
    raise PackageError("Source escaped V07 and the explicitly named V06 fallback")


def choose_entries(args) -> tuple[list[Entry], list[dict], dict]:
    selected: dict[str, Entry] = {}
    omitted: list[dict] = []
    fallback_files = []

    def add(relative: str | pathlib.Path, role: str, required=True, fallback=False):
        relative = pathlib.Path(relative)
        path = safe_project_path(ROOT / relative)
        external = False
        if not path.is_file() and fallback:
            path = checked_episode_source(FALLBACK_ROOT / relative, FALLBACK_ROOT)
            external = True
        if not path.is_file():
            if required:
                raise PackageError(f"Missing required file: {relative.as_posix()}")
            return
        key = relative.as_posix()
        if key in selected:
            return
        selected[key] = Entry(path, key, role, external_source=external)
        if external:
            fallback_files.append({"archive_path": key, "source": str(path)})

    def tree(relative: str, role: str, predicate=None, required=True, fallback=False):
        directory = safe_project_path(ROOT / relative)
        episode = ROOT
        if not directory.is_dir() and fallback:
            episode = FALLBACK_ROOT
            directory = checked_episode_source(episode / relative, episode)
        if not directory.is_dir():
            if required:
                raise PackageError(f"Missing required directory: {relative}")
            return
        def walk(folder):
            for path in sorted(folder.iterdir(), key=lambda p: p.name.casefold()):
                if prohibited_name(path):
                    continue
                checked_episode_source(path, episode)
                if path.is_dir():
                    yield from walk(path)
                elif path.is_file():
                    yield path
        for path in walk(directory):
            if predicate is None or predicate(path):
                add(path.relative_to(episode), role, fallback=episode != ROOT)

    for relative in ("package.json", "package-lock.json", "tsconfig.json", "src/index.tsx"):
        add(relative, "entry/dependency-lock")
    entry = (ROOT / "src/index.tsx").read_text(encoding="utf8")
    if "V07RainbowArcFilm" not in entry or "registerRoot" not in entry:
        raise PackageError("src/index.tsx does not register the V07 composition")
    if not load_json("package.json").get("private"):
        raise PackageError("This commercial/personal project must have package.private=true")
    tree("src", "V07-source-and-retained-interfaces")
    tree("scripts", "scripts", lambda p: p.suffix.casefold() in TEXT_SUFFIXES)
    tree("docs", "documentation-and-provenance")
    for relative in ("README.md", "README_V07.md", "README_V06.md", "AGENTS.md", "requirements.txt", "remotion.config.ts"):
        add(relative, "root-documentation", required=False)
    tree("public/brand", "user-brand")
    tree("public/fonts", "runtime-font")
    tree("public/sources", "formula-paper-photo-runtime")
    for relative in ("research/story.json", "research/story-research-v06.md", "research/story-research-v05.md"):
        add(relative, "accepted-story-and-research", required=False, fallback=True)
    tree("research/story-source-v06", "retained-story-source-material", fallback=True)
    tree("research/sources", "source-license-and-original-paper", fallback=True)
    tree("research/formulas", "latex-formula-source", lambda p: p.suffix.casefold() == ".tex", fallback=True)
    tree("research/physics", "physics-source-and-verification",
         lambda p: not p.name.endswith('.bundle.mjs'))
    tree("research/qa", "V07-QA-records-and-contact-sheets",
         lambda p: (p.suffix.casefold() in {".json", ".md", ".mjs", ".ts", ".txt"}
                    and not p.name.endswith('.bundle.mjs'))
         or (p.suffix.casefold() in {".png", ".jpg"} and ("contact" in p.name.casefold() or p.parent == ROOT / "research/qa")))
    add("research/hdri-v07.json", "HDRI-source-and-license")

    timeline = load_json("src/timeline.json")
    audio = load_json("public/audio/audio-manifest.json")
    ids = [row["id"] for row in timeline.get("clips", [])]
    if len(ids) != 39 or len(set(ids)) != 39:
        raise PackageError("Expected the unchanged accepted 39-clip V07 narration edit")
    audio_by_id = {row["id"]: row for row in audio.get("clips", [])}
    if set(audio_by_id) != set(ids):
        raise PackageError("Timeline and accepted audio manifest do not match")
    add("public/audio/audio-manifest.json", "voice-manifest")
    for clip_id in ids:
        row = audio_by_id[clip_id]
        for relative, role in ((row["raw"], "personal-voice-raw"), (row["audio"], "personal-voice-clean")):
            add(relative.replace("\\", "/"), role, fallback=True)
        for relative, role in ((f"research/audio/raw/{clip_id}-protected.wav", "personal-voice-tail-protected"),
                               (f"research/audio/takes/{clip_id}.json", "voice-take-record"),
                               (f"research/audio/takes/{clip_id}-master.json", "voice-processing-record"),
                               (f"research/audio/asr-v06/{clip_id}.json", "retained-word-alignment")):
            add(relative, role, required=False, fallback=True)
    for name in STEMS:
        add(f"public/audio/{name}", "unchanged-accepted-source-audio-stem")
    for name in ("master-v07.wav", "premaster-v07.wav", "sfx-motion-v07.wav"):
        add(f"public/audio/{name}", "V07-audio-output")
    tree("research/audio", "V07-audio-QA-and-processing",
         lambda p: p.parent == ROOT / "research/audio" and p.suffix.casefold() in {".json", ".md"})
    for name in ("accepted-edit-v06.json", "event-contract-v06.json", "mix-report-v06.json", "runtime-v06.json", "timeline-audio.json"):
        add(f"research/audio/{name}", "accepted-voice-and-mix-source-record", fallback=True)
    for name in ("alignment-report.json", "progress.json"):
        add(f"research/audio/asr-v06/{name}", "retained-alignment-record", required=False, fallback=True)
    tree("research/music", "episode-music-and-CC0-samples", fallback=True)
    for relative in ("delivery/彩虹为什么是弧形_V07.srt", "delivery/彩虹为什么是弧形_V07_口播与声音说明.md",
                     "delivery/发布文案V07.md", "delivery/制作说明V07.md"):
        add(relative, "V07-delivery-documentation")
    for relative in ("delivery/素材清单V07.json", "delivery/清理候选计划V07.json", "delivery/清理候选计划V07.md"):
        add(relative, "V07-inventory-and-cleanup-plan", required=False)
    tree("delivery/covers_v07", "V07-four-ratio-covers-and-editable-plates")

    add("public/assets_v06/README.md", "retained-asset-interfaces")
    tree("public/assets_v06/vendor-water", "commercial-water-local-use")
    add("public/assets_v06/vendor-water/LICENSE.md", "commercial-water-license")
    add("public/assets_v06/vendor-water/waterpro-adapter.min.js", "commercial-water-runtime")
    tree("public/assets_v06/lux3d", "retained-runtime-Gaussian-data")
    for relative in ("public/assets/lux3d/lux3d-delivery.json", "public/assets/lux3d/extracted/mesh/tex_mesh.glb"):
        add(relative, "Lux3D-original-task-and-mesh")
    ply = "public/assets/lux3d/extracted/3dgs/gaussian.ply"
    if args.external_ply:
        omitted.append({"path": ply, "absolute_locator": str(safe_project_path(ROOT / ply)),
                        "role": "retained-external-Lux3D-original-ply", "required_for_render": False,
                        "reason": "Renderer reads included splats-v06.json; original PLY stays retained with verified SHA256."})
    else:
        add(ply, "Lux3D-original-ply")
    lux_zip = "public/assets/lux3d/lux3d.zip"
    if args.include_lux_zip:
        add(lux_zip, "Lux3D-original-provider-archive")
    else:
        omitted.append({"path": lux_zip, "absolute_locator": str(safe_project_path(ROOT / lux_zip)),
                        "role": "retained-external-Lux3D-original-archive", "required_for_render": False,
                        "reason": "Original provider ZIP retained locally; PLY and GLB are included separately to avoid duplication."})
    gqb = [p for p in walk_safe(ROOT / "public/assets/lux3d") if p.suffix.casefold() == ".gqb"]
    for path in gqb:
        add(path.relative_to(ROOT), "Lux3D-original-gqb")
    tree("public/assets_v07", "V07-Blender-environment-observer-HDRI-and-provenance")
    for name in ("spherical_raindrop_v06.blend", "spherical_raindrop_v06.glb", "raindrop_hero_v06.png",
                 "rain_garden_studio_environment.jpg", "manifest.json", "quality-audit.json",
                 "cover_glass_sphere_v06.blend", "cover_glass_highlights_v06.png", "cover_pale_sky_environment.jpg",
                 "cover-render-provenance.json"):
        add(f"public/assets_v06/blender/{name}", "retained-Blender-model-and-cover-source")
    # V07 does not play the retired V06 micro-video; GLB and .blend source suffice.
    omitted.append({"path": "public/assets_v06/blender/micro_orbit_clean", "role": "retired-V06-micro-sequence",
                    "required_for_render": False, "reason": "V07 uses its live Three.js droplet with retained original GLB; retired preview frames are not required."})

    qwen_tasks = []
    for slug in USED_QWEN:
        base = f"public/assets_v06/qwen/generated/{slug}"
        provenance = load_json(f"{base}/provenance.json")
        if provenance.get("provider_status") != "SUCCEEDED":
            raise PackageError(f"Qwen task did not succeed: {slug}")
        for name in ("provider.mp4", "provenance.json", "quality-audit.json", "contact.jpg"):
            add(f"{base}/{name}", f"retained-Qwen-{slug}-original-and-provenance")
        for index in range(1, 151):
            add(f"{base}/frames/frame_{index:04d}.jpg", f"Qwen-{slug}-actual-runtime-frame")
        if args.include_cfr:
            add(f"{base}/cfr_allintra.mp4", "Qwen-recreatable-CFR-backup")
        else:
            omitted.append({"path": f"{base}/cfr_allintra.mp4", "role": "recreatable-CFR-backup",
                            "required_for_render": False, "reason": "Original video and all runtime frames included; no paid regeneration is required."})
        qwen_tasks.append({"slug": slug, "task_id": provenance["task_id"], "model": provenance["model"], "frames": 150})
    add("public/assets_v06/qwen/manifest.json", "retained-Qwen-batch-record")
    add("public/assets_v06/qwen/generated/garden/provenance.json", "unused-Qwen-task-record")
    add("public/assets_v06/qwen/generated/garden/quality-audit.json", "unused-Qwen-quality-decision")
    omitted.append({"path": "public/assets_v06/qwen/generated/garden/provider.mp4",
                    "role": "retained-unused-Qwen-provider-original", "required_for_render": False,
                    "absolute_locator": str(ROOT / "public/assets_v06/qwen/generated/garden/provider.mp4"),
                    "reason": "Excluded because sun is forward; retained original remains local."})

    for path in (ROOT / "work").iterdir():
        if path.is_file() and not prohibited_name(path) and path.suffix.casefold() in TEXT_SUFFIXES:
            add(path.relative_to(ROOT), "V07-asset-build-helper-and-bounded-prompt")
    tree("work/blender-v07", "V07-Blender-build-script", lambda p: p.suffix.casefold() in TEXT_SUFFIXES, required=False)
    tree("work/opus-runs", "V07-Opus-failure-record-and-local-component-tests",
         lambda p: p.suffix.casefold() in TEXT_SUFFIXES and not p.name.endswith('.bundle.mjs'), required=False)
    for relative in ("work/build_blender_assets_v06.py", "work/build_cover_glass_v06.py", "work/generate_qwen_batch_v06.py"):
        add(relative, "retained-asset-rebuild-helper", required=False, fallback=True)
    font = pathlib.Path("C:/Windows/Fonts/NotoSansSC-VF.ttf")
    if font.is_file():
        if is_reparse(font):
            raise PackageError("Refusing external font reparse point")
        selected["recovery-support/fonts/NotoSansSC-VF.ttf"] = Entry(font, "recovery-support/fonts/NotoSansSC-VF.ttf", "OFL1.1-full-cover-font", external_source=True)
    else:
        omitted.append({"path": "recovery-support/fonts/NotoSansSC-VF.ttf", "role": "optional-full-cover-font",
                        "required_for_render": False, "reason": "Runtime unified.woff2 included; full font not found."})
    facts = {"entry": "src/index.tsx", "composition": "RainbowArc", "video_version": "V07", "width": 1920, "height": 1080, "fps": 30,
             "duration_frames": timeline["duration"], "personal_voice_clips": ids,
             "narration_reused_from": "V06", "music_title": "雨后追光", "new_paid_generation_tasks": 0,
             "qwen_used_tasks": qwen_tasks, "qwen_unused": ["garden"], "gqb_files_found": len(gqb),
             "gqb_note": "No standalone GQB exists in this project." if not gqb else "Original GQB files included.",
             "commercial_water": "public/assets_v06/vendor-water/LICENSE.md",
             "opus_status": "One V07 native request total_timeout; no external code integrated; failure records included.",
             "preserved_runtime_prefixes": ["public/assets_v06", "public/assets_v07", "public/assets/lux3d"],
             "V06_source_fallback_root": str(FALLBACK_ROOT), "V06_files_included_at_original_relative_paths": fallback_files,
             "tts_reference_included": False, "tts_reference_reason": "Accepted raw/clean voice included; private reference and model weights stay in the existing local TTS installation."}
    return sorted(selected.values(), key=lambda item: item.archive_path), omitted, facts


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
    readme = f"""# V07 本地用户恢复工程

本包用于 rainbow鱼 当前用户恢复《彩虹为什么是弧形？》V07；含商业水面运行代码及许可、个人旁白和生成资产，不作为公开开源素材库发布。

1. 解压到新的普通目录。本包没有node_modules、junction、全局账号配置或API密钥。
2. 安装兼容Node.js/npm，运行 `npm ci`、`npm run check`。
3. 渲染 `npm run render`，入口src/index.tsx，Composition为RainbowArc。
4. 物理检查：`node research/physics/check-optics.mjs`、`node research/physics/check-world-v07.mjs`。
5. 镜头检查：`node scripts/audit-camera-film-v07.mjs`、`node scripts/audit-motion-v07.mjs`。

尺寸1920×1080，30fps，{facts['duration_frames']}帧。V07源模型、HDRI、Blender源文件、当前母带与字幕已包含。
仍在使用的assets_v06路径保持原样，没有改名。5种Qwen素材包含provider原片、750张运行帧和provenance；V07没有新生成任务。
原始Lux3D PLY默认包含，原GLB和task4040282记录保留；provider ZIP默认留在原工程并记录定位和哈希。如需再随包，添加--include-lux-zip。
{facts['gqb_note']}

39段旁白的raw/clean、字尾保护、处理记录与词级时间映射已包含。V07沿用V06旁白和音乐《雨后追光》，新增运镜声音另存master-v07.wav。
V06中的仍需研究/音频素材按原相对路径纳入本包，恢复后不必拥有V06目录。商业水面许可：{facts['commercial_water']}。
TTS参考音频及模型权重没有复制；恢复渲染无需重合成。要重新克隆音色，使用用户自己的D:/python_project/tts安装。
Blender入口D:/blender/blender.exe。若换机器，调整资产脚本的工具路径；Python重制资产常用numpy/scipy/soundfile/Pillow/fontTools。
封面全字体（若可用）在recovery-support/fonts/NotoSansSC-VF.ttf；cover脚本必要时将FONT指向该备份。

Opus native请求失败，completionReceived=false，正文为空；没有采用外部返回代码。原失败报告、提示词、空残稿与本地组件测试一并保留。
所有实际工具、许可和视觉示意范围见delivery/制作说明V07.md；SRT和口播说明同目录。
片尾两页来自同一篇Gettelman2023论文，CC BY4.0。研究用NC教材保留为私有研究资料，没有放入公开正片。
完整SHA256/CRC32见PACKAGE_MANIFEST.json；ZIP完成后逐项解码复核，外部crc-report.json记录结果。
主片MP4不放入源码恢复ZIP以避免重复大文件。本包没有执行删除。数字检查与抽帧不冒称全片每帧人工审看。
"""
    powershell = """# Restore only in a newly extracted LOCAL USER PROJECT folder.
$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    npm run check
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed' }
    node research/physics/check-optics.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Optics check failed' }
    node research/physics/check-world-v07.mjs
    if ($LASTEXITCODE -ne 0) { throw 'World check failed' }
    Write-Host 'V07 restored. Render with: npm run render'
} finally { Pop-Location }
"""
    return {"LOCAL_USER_PROJECT_README.md": readme.encode("utf8"), "RESTORE_V07.ps1": powershell.encode("utf-8-sig")}


def verify_zip(path: pathlib.Path, expected: dict[str, dict]) -> dict:
    checked = []
    with zipfile.ZipFile(path, "r") as archive:
        if len(archive.namelist()) != len(set(archive.namelist())):
            raise PackageError("Duplicate ZIP member names")
        if set(archive.namelist()) != set(expected):
            raise PackageError("ZIP member inventory differs from the preflight manifest")
        for index, info in enumerate(archive.infolist(), 1):
            if (info.filename.startswith("/") or ".." in pathlib.PurePosixPath(info.filename).parts
                    or "\\" in info.filename or ":" in info.filename):
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
    return {"schema": "rainbow.v07.zip-crc-report/1", "zip": path.name, "bytes": path.stat().st_size,
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
            path = safe_source_path(pathlib.Path(locator))
            if not path.is_file():
                raise PackageError(f"Missing retained external original: {record['path']}")
            checked = scan_file(Entry(path, record["path"], record["role"]))
            record.update(bytes=checked["bytes"], sha256=checked["sha256"], crc32=checked["crc32"], sensitive_scan="passed")
    generated = support_files(facts)
    generated_rows = [{"path": name, "bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
                       "crc32": f"{zlib.crc32(data) & 0xffffffff:08x}", "role": "generated-recovery-support", "sensitive_scan": "credential-free template"}
                      for name, data in generated.items()]
    manifest = {"schema": "rainbow.v07.local-user-project-package/1", "created_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
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
            "V06_fallback_files": len(facts["V06_files_included_at_original_relative_paths"]),
            "uncompressed_mib": round(sum(r["bytes"] for r in rows) / 1024 / 1024, 2),
            "sensitive_scan": "passed", "commercial_water": "private local-user-project only", "source_deletions": 0}
    print(json.dumps(plan, ensure_ascii=False, indent=2), flush=True)
    if not args.create:
        return 0
    output = pathlib.Path(args.output) if args.output else ROOT / "delivery/彩虹为什么是弧形_V07_本地可恢复工程.zip"
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
