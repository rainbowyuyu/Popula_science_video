"""Create a private, recoverable V08 project ZIP after final QA approval.

Preparation is read-only by default: ``python scripts/package_v08.py --dry-run``.
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
    raise PackageError("Source escaped V08 and the explicitly named V06 fallback")


def choose_entries(args) -> tuple[list[Entry], list[dict], dict]:
    from v08_inventory import runtime_files, qwen_slugs, source_files
    selected: dict[str, Entry] = {}
    omitted: list[dict] = []
    fallback_files = []
    if args.external_ply:
        raise PackageError('V08 local recovery requires the original Lux PLY inside its package')

    def add(relative,role,required=True,fallback=False):
        relative=pathlib.Path(relative);path=safe_project_path(ROOT/relative);external=False
        if not path.is_file() and fallback:
            path=checked_episode_source(FALLBACK_ROOT/relative,FALLBACK_ROOT);external=True
        if not path.is_file():
            if required:raise PackageError('Missing required V08 recovery file: '+relative.as_posix())
            return
        key=relative.as_posix()
        if key in selected:return
        selected[key]=Entry(path,key,role,external_source=external)
        if external:fallback_files.append({'archive_path':key,'source':str(path)})

    def tree(relative,role,predicate=None,required=False,fallback=False):
        episode=ROOT;directory=safe_project_path(ROOT/relative)
        if not directory.is_dir() and fallback:
            episode=FALLBACK_ROOT;directory=checked_episode_source(episode/relative,episode)
        if not directory.is_dir():
            if required:raise PackageError('Missing V08 recovery directory: '+relative)
            return
        def walk(folder):
            for path in sorted(folder.iterdir(),key=lambda p:p.name.casefold()):
                if prohibited_name(path):continue
                checked_episode_source(path,episode)
                if path.is_dir():yield from walk(path)
                elif path.is_file():yield path
        for path in walk(directory):
            if predicate is None or predicate(path):add(path.relative_to(episode),role,fallback=episode!=ROOT)

    entry=(ROOT/'src/index.tsx').read_text('utf8')
    if 'V08RainbowArcFilm' not in entry or 'registerRoot' not in entry:raise PackageError('Entry does not register the actual V08 film')
    if not load_json('package.json').get('private'):raise PackageError('Private local package must retain package.private=true')
    runtime=runtime_files()
    for rel in runtime:add(rel,'V08-actual-render-dependency')
    for rel in ['scripts/v08_inventory.py','scripts/package_v08.py','scripts/qa-v08.py','scripts/lock-render-v08.py','scripts/final-contact-v08.py','scripts/audit-macro-v08.mjs','scripts/build_macro_assets_v08.py','scripts/build-environment-v08.py','scripts/check-environment-v08.py','scripts/fetch-environment-v08.py','scripts/generate-qwen-v08.py','scripts/preview-macro-v08.mjs','scripts/render-cover-glass-v08.py']:
        add(rel,'V08-build-and-verification-tool',required=False)
    for path in walk_safe(ROOT/'scripts'):
        if 'v08' in path.name.casefold() and path.suffix.casefold() in TEXT_SUFFIXES:add(path.relative_to(ROOT),'V08-tool')
    add('work/macro-preview-entry-v08.tsx','V08-isolated-macro-review-entry')
    add('work/opus-macro-task-v08.md','V08-bounded-Opus-prompt')
    tree('work/opus-runs','V08-real-Opus-run-record',lambda p:p.suffix.casefold() in TEXT_SUFFIXES and not p.name.endswith('.bundle.mjs'))
    tree('public/assets_v08/qwen','V08-failed-Qwen-provenance-only',lambda p:p.suffix.casefold()=='.json')

    for rel in ['public/assets_v08/environment/rain_after_terrace_v08.blend','public/assets_v08/environment/provenance.json','public/assets_v08/environment/landscape-provenance.json','public/assets_v08/environment/README.md','public/assets_v08/macro/macro_leaf_raindrop_v08.blend','public/assets_v08/macro/provenance-v08.json','public/assets_v08/macro/macro_leaf_blender_review_v08.png']:
        add(rel,'V08-accepted-Blender-source-and-license')
    tree('public/assets_v08/environment/textures','V08-accepted-Blender-material-source',required=True)
    tree('public/assets_v08/covers','V08-cover-Blender-source',required=False)
    for rel in ['public/assets_v07/vendor-water/LICENSE.md','public/assets_v07/vendor-water/provenance.json']:
        add(rel,'accepted-commercial-water-license')
    for rel in ['public/assets/lux3d/lux3d-delivery.json','public/assets/lux3d/extracted/mesh/tex_mesh.glb','public/assets/lux3d/extracted/3dgs/gaussian.ply']:
        add(rel,'original-Lux-task4040282-recoverable-source')
    lux_zip='public/assets/lux3d/lux3d.zip'
    if args.include_lux_zip:add(lux_zip,'original-Lux-provider-archive')
    elif (ROOT/lux_zip).is_file():omitted.append({'path':lux_zip,'absolute_locator':str(safe_project_path(ROOT/lux_zip)),'role':'retained-original-Lux-provider-zip','required_for_render':False,'reason':'Original PLY, GLB and task record are included; duplicate provider ZIP stays in original project'})
    gqb=[p for p in walk_safe(ROOT/'public/assets/lux3d') if p.suffix.casefold()=='.gqb']
    for path in gqb:add(path.relative_to(ROOT),'original-Lux-gqb')

    tasks=[]
    for slug in qwen_slugs():
        base=f'public/assets_v06/qwen/generated/{slug}';prov=load_json(base+'/provenance.json')
        if prov.get('provider_status')!='SUCCEEDED':raise PackageError('Actual Qwen source did not succeed: '+slug)
        for name in ['provider.mp4','provenance.json','quality-audit.json']:add(base+'/'+name,'accepted-Qwen-'+slug+'-original-provenance')
        if args.include_cfr:add(base+'/cfr_allintra.mp4','optional-Qwen-CFR-copy')
        tasks.append({'slug':slug,'task_id':prov['task_id'],'model':prov['model'],'frames':150})
    omitted.extend([{'path':'public/assets_v06/qwen/generated/circle','required_for_render':False,'reason':'Removed from V08 actual windows; omitted, no asset deletion'}, {'path':'public/assets_v08/environment/*_preview.jpg','required_for_render':False,'reason':'Unselected landscape candidates omitted; selected hilly_terrain_01 HDRI/provenance included'}, {'path':'public/assets_v07/environment','required_for_render':False,'reason':'Retired V07 observer/HDRI replaced by accepted V08 assets'}])

    timeline=load_json('src/timeline.json');audio=load_json('public/audio/audio-manifest.json')
    ids=[r['id'] for r in timeline['clips']];audio_rows={r['id']:r for r in audio['clips']}
    if len(ids)!=39 or set(audio_rows)!=set(ids):raise PackageError('Accepted 39-clip narration manifest mismatch')
    add('public/audio/audio-manifest.json','accepted-personal-voice-manifest')
    for clip_id in ids:
        row=audio_rows[clip_id]
        for field in ['raw','audio']:add(row[field].replace('\\','/'),'accepted-personal-voice-'+field,fallback=True)
        for rel in [f'research/audio/raw/{clip_id}-protected.wav',f'research/audio/takes/{clip_id}.json',f'research/audio/takes/{clip_id}-master.json',f'research/audio/asr-v06/{clip_id}.json']:
            add(rel,'accepted-voice-processing-and-alignment-source',required=False,fallback=True)
    for name in ['narration.wav','score.wav','sfx.wav','sfx-motion-v07.wav']:
        add('public/audio/'+name,'current-episode-audio-stem')
    for name in ['accepted-edit-v06.json','event-contract-v06.json','runtime-v06.json','timeline-audio.json']:
        add('research/audio/'+name,'retained-narration-event-source',required=False,fallback=True)
    for name in ['alignment-report.json','progress.json']:add('research/audio/asr-v06/'+name,'accepted-word-alignment-record',required=False,fallback=True)
    add('research/audio/v07-motion-mix-report.json','actual-retained-audio-provenance')
    tree('research/music','accepted-score-license-and-source',lambda p:p.name not in ['music-history-before-v06.json','repo-tree.json'],fallback=True)

    for rel in ['research/sources/GMD_Rainbows_and_climate_change_2023.pdf','research/sources/metadata.json','research/sources/案例检索记录.md','research/sources/commons-complete-double-rainbow-api.json','research/sources/commons-circular-rainbow-api.json','research/story-research-v06.md','research/formulas/formula-snell.tex','research/formulas/formula-angle.tex']:
        add(rel,'actual-paper-formula-story-source',required=False,fallback=True)
    for rel in ['research/physics/check-optics-v08.mjs','research/physics/check-world-v08.mjs','research/physics/verification-v08.json','research/physics/world-geometry-check-v08.json']:
        add(rel,'V08-actual-physics-validation',required=args.create)
    tree('research/qa','V08-only-QA-records',lambda p:('v08' in p.name.casefold() and p.suffix.casefold() in {'.json','.md','.mjs','.ts','.txt'} and not p.name.endswith('.bundle.mjs')) or ('v08' in p.parent.name.casefold() and p.name.startswith('contact-') and p.suffix.casefold()=='.jpg'))
    for path in walk_safe(ROOT/'docs'):
        if 'v08' in path.name.casefold():add(path.relative_to(ROOT),'V08-current-documentation')
    for rel in ['README_V08.md','AGENTS.md']:
        add(rel,'V08-recovery-root-documentation',required=False)
    for rel in ['delivery/制作说明V08.md','delivery/说明_v08.md','delivery/发布文案V08.md','delivery/彩虹为什么是弧形_V08.srt','delivery/彩虹为什么是弧形_V08_口播与声音说明.md']:
        add(rel,'V08-current-delivery-documentation',required=args.create)
    tree('delivery/covers_v08','V08-current-four-ratio-covers',required=args.create)
    font=pathlib.Path('C:/Windows/Fonts/NotoSansSC-VF.ttf')
    if font.is_file() and not is_reparse(font):selected['recovery-support/fonts/NotoSansSC-VF.ttf']=Entry(font,'recovery-support/fonts/NotoSansSC-VF.ttf','OFL-cover-font',external_source=True)
    facts={'entry':'src/index.tsx','composition':'RainbowArc','video_version':'V08','width':1920,'height':1080,'fps':30,'duration_frames':timeline['duration'],'personal_voice_clips':ids,'narration_reused_from':'V06','actualMasterAudio':'public/audio/master-v07.wav','music_title':'雨后追光','qwen_used_tasks':tasks,'qwen_used_frame_count':len(tasks)*150,'qwen_new_generation':'opening/fountain requests rejected401 InvalidApiKey; no new generated videos adopted','qwen_unused':['circle','garden'],'gqb_files_found':len(gqb),'gqb_note':'No standalone GQB exists' if not gqb else 'Original GQB included','commercial_water':'public/assets_v07/vendor-water/LICENSE.md','opus_status':'One native request failed cli_exit_error; truncated18506-char partial retained; no returned code integrated','preserved_runtime_prefixes':['public/assets_v06','public/assets_v07/vendor-water','public/assets_v08','public/assets/lux3d'],'V06_source_fallback_root':str(FALLBACK_ROOT),'V06_files_included_at_original_relative_paths':fallback_files,'actual_source_files':source_files(),'tts_reference_included':False,'node_modules_included':False,'hard_links_modified':False}
    return sorted(selected.values(),key=lambda e:e.archive_path),omitted,facts


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


def support_files(facts:dict)->dict[str,bytes]:
    readme=f'''# V08 本地私用恢复工程

本包恢复 rainbow鱼《彩虹为什么是弧形》V08，包含商业水面运行代码、个人旁白和生成资产，仅供当前用户本地恢复，不作为公开素材库发布。

解压到新的普通目录，执行 npm ci、node scripts/ensure-browser-v08.mjs、npm run check，再运行 npm run render。入口 src/index.tsx，Composition=RainbowArc，1920×1080／30fps／{facts['duration_frames']} 帧。包内没有 node_modules 或任何目录连接。

物理检查：node research/physics/check-optics-v08.mjs 与 node research/physics/check-world-v08.mjs。微距检查：node scripts/audit-macro-v08.mjs。V08检查针对本次 WorldV08，未把旧World或旧QA报告当作本次验收。

包内是实际入口的源码依赖图、实际调用的V08模型、HDRI、GLB、Blender源和材质、原Lux task4040282 PLY/GLB及运行数据。未选中的山景预览、旧V07模型及已弃用Qwen circle不纳入。仍在使用的 assets_v06 与 assets_v07/vendor-water 保持原相对路径。

{len(facts['qwen_used_tasks'])} 类已成功的Qwen素材原片、{facts['qwen_used_frame_count']}张运行帧与provenance已包含。本轮Qwen请求返回401／InvalidApiKey，没有新视频可用；沿用已归档成功素材，不需要再次付费即可恢复渲染。

39对rainbow鱼 raw/clean句源、字尾保护、时间映射、当前音乐／旁白／运镜音效分轨与实际使用 master-v07.wav 已包含。本轮保留既有声音剪辑，没有声称重新TTS。私人的TTS参考和模型权重留在 D:/python_project/tts，恢复正片无需重合成。

本轮一次Opus native调用返回 cli_exit_error，虽然有正文但在代码中途截断，没有可用完整组件；保留prompt、report和partial，无外部返回代码被整合。所采用的精修组件为本地Three.js／Blender实现，不把尝试过的工具说成成功产出。

Blender使用 D:/blender/blender.exe。重新制作资产时按源脚本调整本地工具位置；用于生成的依赖不复制全局账号、密钥、模型权重或Claude偏好。水面许可见 {facts['commercial_water']}。素材许可、论文与LaTeX、四比例封面／发布文案／字幕见 delivery 和 docs。

原Lux provider ZIP留在原工程并记录定位与哈希，已包含原PLY／GLB避免重复；若需provider ZIP用--include-lux-zip。{facts['gqb_note']}。

完整成员集合、SHA256和CRC32见PACKAGE_MANIFEST.json及外部crc-report.json。主片MP4单独交付，不重复塞入工程包。本工具只读源文件并创建新ZIP，未执行任何删除或修改硬链接。
'''
    powershell='''$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    node scripts/ensure-browser-v08.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Render browser setup failed' }
    npm run check
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed' }
    node research/physics/check-optics-v08.mjs
    if ($LASTEXITCODE -ne 0) { throw 'V08 optics check failed' }
    node research/physics/check-world-v08.mjs
    if ($LASTEXITCODE -ne 0) { throw 'V08 world check failed' }
    Write-Host 'V08 restored. Render with npm run render.'
} finally { Pop-Location }
'''
    return {'LOCAL_USER_PROJECT_README.md':readme.encode('utf8'),'RESTORE_V08.ps1':powershell.encode('utf-8-sig')}

def validate_final_v08_qa():
    from v08_inventory import runtime_files,immutable_record
    qa=load_json('research/qa/delivery-qa-v08.json');lock=load_json('research/qa/render-source-lock-v08.json')
    if qa.get('version')!='V08' or lock.get('version')!='V08':raise PackageError('Final V08 QA and V08 lock required')
    if qa.get('qaStatus')!='pass' or not qa.get('fullDecodePassed') or not qa.get('sourceLockUnchanged'):raise PackageError('Actual V08 final encode has not passed QA')
    if qa.get('blackSegments') or qa.get('silenceSegmentsOver1_5s'):raise PackageError('Final encode contains black or long silence segments')
    if not qa.get('physicsSourceHashesMatch'):raise PackageError('V08 physics validation must match current source hashes')
    if set(lock['files'])!=set(runtime_files()):raise PackageError('Final lock is not the complete current V08 runtime inventory')
    for rel,row in lock['files'].items():
        if immutable_record(rel)['sha256']!=row['sha256']:raise PackageError('Source changed after final render lock: '+rel)
    video=safe_project_path(ROOT/qa['video'])
    if scan_file(Entry(video,qa['video'],'final-video-QA-hash-check'))['sha256']!=qa['sha256']:raise PackageError('Final MP4 differs from actual V08 QA')


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
    return {"schema": "rainbow.v08.zip-crc-report/1", "zip": path.name, "bytes": path.stat().st_size,
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
    if args.create:
        validate_final_v08_qa()
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
    manifest = {"schema": "rainbow.v08.local-user-project-package/1", "created_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
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
    plan = {"dry_run": not args.create, "selected_files": len(entries), "used_qwen_frame_count": facts["qwen_used_frame_count"],
            "voice_raw_and_clean_clips": len(facts["personal_voice_clips"]), "standalone_gqb_found": facts["gqb_files_found"],
            "V06_fallback_files": len(facts["V06_files_included_at_original_relative_paths"]),
            "uncompressed_mib": round(sum(r["bytes"] for r in rows) / 1024 / 1024, 2),
            "sensitive_scan": "passed", "commercial_water": "private local-user-project only", "source_deletions": 0}
    print(json.dumps(plan, ensure_ascii=False, indent=2), flush=True)
    if not args.create:
        return 0
    output = pathlib.Path(args.output) if args.output else ROOT / "delivery/彩虹为什么是弧形_V08_本地可恢复工程.zip"
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
