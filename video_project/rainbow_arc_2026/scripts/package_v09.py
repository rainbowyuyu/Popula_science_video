"""Prepare or create the private V09 recovery ZIP; never clean source files.

Default/--dry-run reads, selects, hashes and scans only. Actual creation requires
--create --qa-approved and the current V09 final-video/source-lock QA report.
The explicitly configured C: output root is allowed; arbitrary external paths,
directory junctions, credentials, node_modules and caches are never selected.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import sys
import zipfile
import zlib

# Reuse the independently checked scanner, CRC verifier and no-junction guards.
# The inherited V08 selection/main are never called by this V09 entry point.
from package_v08 import (
    ROOT, FALLBACK_ROOT, PackageError, Entry, TEXT_SUFFIXES, CHUNK, jd, load_json,
    is_reparse, prohibited_name, safe_project_path, checked_episode_source,
    walk_safe, safe_source_path, scan_file, validate_voice_hashes, verify_zip,
)
from v09_inventory import runtime_files, qwen_slugs, source_files, immutable_record


def output_root() -> Path:
    path = Path(load_json('work/output-root-v09.json')['outputRoot'])
    if not path.is_absolute():
        path = ROOT / path
    path = Path(os.path.abspath(path))
    if not path.is_dir() or is_reparse(path):
        raise PackageError('Configured V09 output root is missing or a reparse point')
    return path


def safe_output_path(path: Path) -> Path:
    root = output_root()
    path = Path(os.path.abspath(path))
    try:
        relative = path.relative_to(root)
    except ValueError as exc:
        raise PackageError('Selection escaped the configured V09 output root') from exc
    current = root
    for part in relative.parts:
        current /= part
        if prohibited_name(current):
            raise PackageError('Forbidden output selection: ' + relative.as_posix())
        if current.exists() and is_reparse(current):
            raise PackageError('Refusing output junction/symlink: ' + relative.as_posix())
    return path


def choose_entries(args):
    selected = {}
    omitted = []
    fallback_files = []
    if args.external_ply:
        raise PackageError('V09 private recovery must include the original Lux PLY')

    def add(relative, role, required=True, fallback=False):
        relative = Path(relative)
        path = safe_project_path(ROOT / relative)
        external = False
        if not path.is_file() and fallback:
            path = checked_episode_source(FALLBACK_ROOT / relative, FALLBACK_ROOT)
            external = True
        if not path.is_file():
            if required:
                raise PackageError('Missing required V09 recovery file: ' + relative.as_posix())
            return
        key = relative.as_posix()
        if key in selected:
            return
        selected[key] = Entry(path, key, role, external_source=external)
        if external:
            fallback_files.append({'archive_path': key, 'source': str(path)})

    def external(source, archive, role, required=True):
        path = safe_output_path(Path(source))
        if not path.is_file():
            if required:
                raise PackageError('Missing required V09 external delivery/source: ' + archive)
            return
        member = PurePosixPath(archive)
        if member.is_absolute() or '..' in member.parts or ':' in archive or '\\' in archive:
            raise PackageError('Unsafe external archive path')
        if archive not in selected:
            selected[archive] = Entry(path, archive, role, external_source=True)

    def tree(relative, role, predicate=None, required=False, fallback=False):
        episode = ROOT
        directory = safe_project_path(ROOT / relative)
        if not directory.is_dir() and fallback:
            episode = FALLBACK_ROOT
            directory = checked_episode_source(episode / relative, episode)
        if not directory.is_dir():
            if required:
                raise PackageError('Missing recovery directory: ' + relative)
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

    entry = (ROOT / 'src/index.tsx').read_text('utf8')
    if 'V09RainbowArcFilm' not in entry or 'registerRoot' not in entry:
        raise PackageError('Actual V09 entry required')
    if not load_json('package.json').get('private'):
        raise PackageError('Private package.private=true required')
    for rel in runtime_files():
        add(rel, 'V09-actual-render-dependency')
    for path in walk_safe(ROOT / 'scripts'):
        if 'v09' in path.name.casefold() and path.suffix.casefold() in TEXT_SUFFIXES:
            add(path.relative_to(ROOT), 'V09-build-restore-and-verification-tool')
    for rel in ['scripts/package_v08.py', 'scripts/build_macro_assets_v08.py',
                'scripts/build-environment-v08.py', 'scripts/check-environment-v08.py',
                'scripts/fetch-environment-v08.py']:
        add(rel, 'retained-scanner-or-V08-source-build-tool', required=False)
    for rel in ['work/observer-preview-entry-v09.tsx', 'work/rainbow-preview-entry-v09.tsx',
                'work/verify-rainbow-component-v09.mjs', 'work/opus-task-rainbow-v09.md']:
        add(rel, 'V09-component-review-source', required=False)
    add('work/gpu-preference-before-v09.json', 'V09-task-browser-GPU-original-snapshot', required=False)
    tree('work/opus-runs/rainbow-v09-20261011-214928-98d1b906',
         'V09-actual-failed-Opus-record', lambda p: p.suffix.casefold() in {'.md', '.json', '.txt'})

    tree('public/assets_v09/characters', 'CC0-rigged-character-original-license-and-provenance', required=True)
    tree('public/assets_v09/environment', 'V09-Blender-environment-and-CC0-sources', required=True)
    environment = load_json('public/assets_v09/environment/provenance-v09.json')
    blend = output_root() / 'work/env-review/rain_after_terrace_v09.blend'
    if Path(environment['blenderSourceLocator']) != blend:
        raise PackageError('Blender source differs from the explicitly allowed V09 C: source')
    external(blend, 'public/assets_v09/environment/rain_after_terrace_v09.blend',
             'V09-editable-Blender-source')
    for rel in ['public/assets_v08/environment/rain_after_terrace_v08.blend',
                'public/assets_v08/environment/rain_after_terrace_v08.glb',
                'public/assets_v08/environment/provenance.json',
                'public/assets_v08/environment/landscape-provenance.json',
                'public/assets_v08/environment/README.md',
                'public/assets_v08/macro/macro_leaf_raindrop_v08.blend',
                'public/assets_v08/macro/provenance-v08.json']:
        add(rel, 'reused-V08-Blender-source-material-or-license')
    tree('public/assets_v08/environment/textures', 'reused-Blender-material-source', required=True)
    tree('public/assets_v08/covers', 'unchanged-V08-cover-Blender-source')
    for rel in ['public/assets_v07/vendor-water/LICENSE.md', 'public/assets_v07/vendor-water/provenance.json']:
        add(rel, 'commercial-water-license')
    for rel in ['public/assets/lux3d/lux3d-delivery.json',
                'public/assets/lux3d/extracted/mesh/tex_mesh.glb',
                'public/assets/lux3d/extracted/3dgs/gaussian.ply']:
        add(rel, 'original-Lux-task4040282-recoverable-source')
    lux_zip = 'public/assets/lux3d/lux3d.zip'
    if args.include_lux_zip:
        add(lux_zip, 'original-Lux-provider-archive')
    elif (ROOT / lux_zip).is_file():
        omitted.append({'path': lux_zip, 'absolute_locator': str(safe_project_path(ROOT / lux_zip)),
                        'role': 'retained-original-Lux-provider-zip', 'required_for_render': False,
                        'reason': 'Original PLY/GLB/task record included; duplicate ZIP remains untouched'})
    gqb = [p for p in walk_safe(ROOT / 'public/assets/lux3d') if p.suffix.casefold() == '.gqb']
    for path in gqb:
        add(path.relative_to(ROOT), 'original-Lux-gqb')
    tasks = []
    for slug in qwen_slugs():
        base = f'public/assets_v06/qwen/generated/{slug}'
        prov = load_json(base + '/provenance.json')
        if prov.get('provider_status') != 'SUCCEEDED':
            raise PackageError('Actual Qwen source failed: ' + slug)
        for name in ['provider.mp4', 'provenance.json', 'quality-audit.json']:
            add(base + '/' + name, 'accepted-Qwen-original-' + slug)
        if args.include_cfr:
            add(base + '/cfr_allintra.mp4', 'optional-Qwen-CFR-copy')
        tasks.append({'slug': slug, 'task_id': prov['task_id'], 'model': prov['model'], 'frames': 150})
    omitted.extend([
        {'path': 'public/assets_v06/qwen/generated/circle', 'required_for_render': False,
         'reason': 'Unused retired clip omitted, not deleted'},
        {'path': 'node_modules', 'required_for_render': False,
         'reason': 'Shared dependency junction omitted; restore with npm ci'},
    ])

    timeline = load_json('src/timeline.json')
    audio = load_json('public/audio/audio-manifest.json')
    ids = [r['id'] for r in timeline['clips']]
    audio_rows = {r['id']: r for r in audio['clips']}
    if len(ids) != 39 or set(audio_rows) != set(ids):
        raise PackageError('Accepted narration manifest mismatch')
    add('public/audio/audio-manifest.json', 'accepted-personal-voice-manifest')
    for clip_id in ids:
        row = audio_rows[clip_id]
        for field in ['raw', 'audio']:
            add(row[field].replace('\\', '/'), 'accepted-personal-voice-' + field, fallback=True)
        for rel in [f'research/audio/raw/{clip_id}-protected.wav', f'research/audio/takes/{clip_id}.json',
                    f'research/audio/takes/{clip_id}-master.json', f'research/audio/asr-v06/{clip_id}.json']:
            add(rel, 'accepted-voice-processing-and-alignment-source', required=False, fallback=True)
    for name in ['narration.wav', 'score.wav', 'sfx.wav', 'sfx-motion-v07.wav']:
        add('public/audio/' + name, 'actual-reused-audio-stem')
    for name in ['accepted-edit-v06.json', 'event-contract-v06.json', 'runtime-v06.json', 'timeline-audio.json']:
        add('research/audio/' + name, 'retained-narration-event-source', required=False, fallback=True)
    for name in ['alignment-report.json', 'progress.json']:
        add('research/audio/asr-v06/' + name, 'accepted-word-alignment-record', required=False, fallback=True)
    add('research/audio/v07-motion-mix-report.json', 'actual-reused-audio-provenance')
    tree('research/music', 'score-license-and-source',
         lambda p: p.name not in ['music-history-before-v06.json', 'repo-tree.json'], fallback=True)
    for rel in ['research/sources/GMD_Rainbows_and_climate_change_2023.pdf', 'research/sources/metadata.json',
                'research/sources/案例检索记录.md', 'research/sources/commons-complete-double-rainbow-api.json',
                'research/sources/commons-circular-rainbow-api.json', 'research/story-research-v06.md',
                'research/formulas/formula-snell.tex', 'research/formulas/formula-angle.tex']:
        add(rel, 'actual-paper-formula-story-source', required=False, fallback=True)
    tree('research/sources/fonts-v09', 'existing-font-OFL-license-and-metadata', required=True)
    for rel in ['research/physics/check-optics-v09.mjs', 'research/physics/check-world-v09.mjs',
                'research/physics/verification-v09.json', 'research/physics/world-geometry-check-v09.json']:
        add(rel, 'V09-actual-physics-validation', required=args.create)
    tree('research/qa', 'V09-QA-and-review-history', lambda p:
         p.stat().st_size > 0 and (('v09' in p.name.casefold() and p.suffix.casefold() in {'.json', '.md', '.mjs', '.ts', '.txt', '.py'}
          and not p.name.endswith('.bundle.mjs'))
         or ('v09' in p.parent.name.casefold() and p.name.startswith('contact-') and p.suffix.casefold() == '.jpg')))
    for rel in ['research/qa/delivery-qa-v09.json', 'research/qa/render-source-lock-v09.json',
                'research/qa/encoded-frame-contract-v09.json', 'research/qa/visual-contact-contract-v09.json',
                'research/qa/final-visual-acceptance-v09.json']:
        add(rel, 'V09-required-final-encode-and-review-contract', required=args.create)
    frame_contract_path = ROOT / 'research/qa/encoded-frame-contract-v09.json'
    contact_contract_path = ROOT / 'research/qa/visual-contact-contract-v09.json'
    if frame_contract_path.is_file() and contact_contract_path.is_file():
        frame_contract = load_json('research/qa/encoded-frame-contract-v09.json')
        contact_contract = load_json('research/qa/visual-contact-contract-v09.json')
        if args.create:
            final_qa = load_json('research/qa/delivery-qa-v09.json')
            if frame_contract['sourceVideoSHA256'] != final_qa['sha256'] or contact_contract['sourceVideoSHA256'] != final_qa['sha256']:
                raise PackageError('Final review contracts refer to a different MP4')
        frame_hashes = {tile['frame']: tile['sha256']
                        for page in contact_contract['contactSheets'] for tile in page['tiles']}
        if args.create and set(frame_hashes) != set(frame_contract['frames']):
            raise PackageError('Final contact contract does not contain every sampled frame')
        for frame in frame_contract['frames']:
            name = f'frame-{frame:05}.jpg'
            source = output_root() / 'work/encoded-frames-v09' / name
            if args.create and scan_file(Entry(source, 'research/qa/encoded-frames-v09/' + name, 'final-frame'))['sha256'] != frame_hashes[frame]:
                raise PackageError('Final encoded frame differs from contact contract: ' + name)
            external(source,
                     'research/qa/encoded-frames-v09/' + name, 'V09-actual-final-encode-frame-evidence', required=args.create)
        for page in contact_contract['contactSheets']:
            name = f"contact-{page['page']:02}.jpg"
            source = output_root() / 'work/encoded-contacts-v09' / name
            if args.create and scan_file(Entry(source, 'research/qa/encoded-contacts-v09/' + name, 'final-review-page'))['sha256'] != page['sha256']:
                raise PackageError('Final contact sheet differs from contract: ' + name)
            external(source, 'research/qa/encoded-contacts-v09/' + name,
                     'V09-final-encode-contact-sheet-evidence', required=args.create)
        central_crop = output_root() / 'work/center-crop-v09-contact.jpg'
        if args.create and scan_file(Entry(central_crop, 'research/qa/center-crop-v09-contact.jpg', 'final-crop'))['sha256'] != contact_contract['centerCropSHA256']:
            raise PackageError('Central crop inspection differs from final contract')
        external(central_crop,
                 'research/qa/center-crop-v09-contact.jpg', 'V09-inspection-only-central-crop', required=args.create)
    for path in walk_safe(ROOT / 'docs'):
        if 'v09' in path.name.casefold():
            add(path.relative_to(ROOT), 'V09-current-source-documentation')
    add('README_V09.md', 'V09-recovery-root-documentation', required=False)
    add('AGENTS.md', 'local-project-instructions', required=False)
    for name in ['制作说明V09.md', '说明_v09.md', '发布文案V09.md', '彩虹为什么是弧形_V09.srt',
                 '彩虹为什么是弧形_V09_口播与声音说明.md', '来源摘要_v09.md']:
        external(output_root() / 'delivery' / name, 'delivery/' + name,
                 'V09-current-delivery-documentation', required=args.create)
    cover_root = output_root() / 'delivery/covers_v08'
    if args.create and not cover_root.is_dir():
        raise PackageError('Reused V08 covers absent from V09 delivery')
    if cover_root.is_dir():
        for path in sorted(cover_root.iterdir()):
            if path.is_file() and path.suffix.lower() in {'.jpg', '.json', '.md'}:
                external(path, 'delivery/covers_v08/' + path.name, 'unchanged-reused-V08-four-ratio-cover')
    font = Path('C:/Windows/Fonts/NotoSansSC-VF.ttf')
    if font.is_file() and not is_reparse(font):
        selected['recovery-support/fonts/NotoSansSC-VF.ttf'] = Entry(
            font, 'recovery-support/fonts/NotoSansSC-VF.ttf', 'OFL-cover-font', external_source=True)
    facts = {
        'entry': 'src/index.tsx', 'composition': 'RainbowArc', 'video_version': 'V09',
        'width': 1920, 'height': 1080, 'fps': 30, 'duration_frames': timeline['duration'],
        'personal_voice_clips': ids, 'narration_reused_from': 'V06',
        'actualMasterAudio': 'public/audio/master-v07.wav', 'music_title': '雨后追光', 'audio_reused': True,
        'qwen_used_tasks': tasks, 'qwen_used_frame_count': len(tasks) * 150,
        'qwen_new_generation': 'No new request in V09; four successful archived tasks reused',
        'qwen_unused': ['circle', 'garden'], 'lux_task': '4040282', 'lux_new_generation': False,
        'gqb_files_found': len(gqb), 'gqb_note': 'No standalone GQB exists' if not gqb else 'Original GQB included',
        'commercial_water': 'public/assets_v07/vendor-water/LICENSE.md',
        'opus_status': 'One native request failed total_timeout; completionReceived=false, returnedModel=null; 38-char partial not integrated',
        'new_character': 'CC0 RobotExpressive; three independent cloned skeletons and original Idle/Walking clips',
        'new_environment': 'V09 Blender terrace with CC0 fern_02/grass_medium_01/grass_ground sources',
        'rainbow_method': 'Same-angle multilayer thin-medium artistic approximation, not full weather/volume solve',
        'cover_status': 'V08 four-ratio covers reused unchanged, not remade',
        'output_root_at_production': str(output_root()), 'external_Blender_source': str(blend),
        'V06_source_fallback_root': str(FALLBACK_ROOT),
        'V06_files_included_at_original_relative_paths': fallback_files, 'actual_source_files': source_files(),
        'tts_reference_included': False, 'node_modules_included': False, 'hard_links_modified': False,
        'review_record_policy': 'Retain historical review records; final approval only comes from final-visual-acceptance-v09.json matching the delivered MP4 hash',
    }
    return sorted(selected.values(), key=lambda e: e.archive_path), omitted, facts


def support_files(facts):
    readme = f'''# V09 本地私用恢复工程

本包恢复 rainbow鱼《彩虹为什么是弧形》V09，1920×1080、30fps、{facts['duration_frames']}帧。
商业水面代码与个人旁白只供当前用户本地恢复，不作为公开素材库。

解压到新的普通目录，运行 RESTORE_V09.ps1：安装npm依赖，创建本目录的 restored-output-v09
与最小runtime-public，准备Remotion浏览器，执行TypeScript及两条V09物理检查。然后 npm run render。
不依赖旧D盘工程或C盘绝对输出位置，不包含node_modules或目录连接。

原Lux任务4040282 PLY/GLB/记录、四类成功Qwen原片/provenance及600运行帧、39对rainbow鱼原/处理
句源、当前分轨和master-v07.wav、新CC0骨骼角色、V09环境GLB、Blender源与CC0原始植被纹理均保存。
V08微距源、环境建模基线与四比例封面沿用；封面本轮未重做。TTS参考与权重留用户工程。

V09原生环境归档为 public/assets_v09/environment/rain_after_terrace_v09.blend。现有GLB可直接
渲染；重新生成环境前请按当前恢复位置调整 build-environment-v09.py 的 REVIEW 输出路径，或直接
编辑 .blend。provenance内绝对路径是生产快照，不是恢复依赖。Blender使用 D:/blender/blender.exe。

本轮Opus native请求total_timeout，completionReceived=false，returnedModel=null；只有38字符
残稿，没有外部代码被采用。Qwen没有新请求；Lux没有新任务。彩虹深度层为保观察角的艺术化薄介质
近似，不声称完整天气或辐射强度仿真。许可、公式、论文和工具状态见 delivery/来源摘要_v09.md。

source lock与最终MP4 QA属于生产快照，不能当成恢复渲染的新验收。原Lux provider ZIP留原工程
并记录hash，原PLY/GLB已入包。{facts['gqb_note']}。成员SHA256/CRC32见PACKAGE_MANIFEST.json和
外部crc-report.json。主片MP4单独交付。本工具不清理、不覆盖、不修改硬链接。
'''
    restore = '''$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    python scripts/prepare-runtime-v09.py --init
    if ($LASTEXITCODE -ne 0) { throw 'V09 runtime preparation failed' }
    node scripts/ensure-browser-v09.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Render browser setup failed' }
    npm run check
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed' }
    node research/physics/check-optics-v09.mjs
    if ($LASTEXITCODE -ne 0) { throw 'V09 optics check failed' }
    node research/physics/check-world-v09.mjs
    if ($LASTEXITCODE -ne 0) { throw 'V09 world check failed' }
    Write-Host 'V09 restored. Render with npm run render.'
} finally { Pop-Location }
'''
    config = jd({'outputRoot': 'restored-output-v09',
                 'reason': 'Portable recovery default; RESTORE_V09.ps1 resolves the extraction root'})
    return {'LOCAL_USER_PROJECT_README.md': readme.encode('utf8'),
            'RESTORE_V09.ps1': restore.encode('utf-8-sig'), 'work/output-root-v09.json': config}


def validate_visual_acceptance(qa):
    """Require independently authored visual acceptance for this exact encode."""
    acceptance = load_json('research/qa/final-visual-acceptance-v09.json')
    if (acceptance.get('version') != 'V09' or acceptance.get('status') != 'pass'
            or acceptance.get('sourceVideoSHA256') != qa['sha256']):
        raise PackageError('Final visual acceptance must pass for the current V09 MP4 hash')
    reports = acceptance.get('reviewReports')
    if not isinstance(reports, list) or not reports or not acceptance.get('scope'):
        raise PackageError('Final visual acceptance lacks named review evidence and scope')
    for row in reports:
        rel = row if isinstance(row, str) else row.get('path') if isinstance(row, dict) else None
        if not isinstance(rel, str) or not rel:
            raise PackageError('Invalid final visual review report reference')
        path = safe_project_path(ROOT / rel)
        if not path.is_file() or qa['sha256'] not in path.read_text('utf-8-sig'):
            raise PackageError('Visual review report does not identify the current MP4: ' + rel)
        if isinstance(row, dict) and row.get('sha256') and immutable_record(rel)['sha256'] != row['sha256']:
            raise PackageError('Visual review report changed after acceptance: ' + rel)
    return acceptance


def validate_final_v09_qa():
    qa = load_json('research/qa/delivery-qa-v09.json')
    lock = load_json('research/qa/render-source-lock-v09.json')
    if (qa.get('version') != 'V09' or lock.get('version') != 'V09'
            or lock.get('schema') != 'rainbow.v09.render-source-lock/1'):
        raise PackageError('Final V09 QA and V09 lock required')
    if qa.get('qaStatus') != 'pass' or not qa.get('fullDecodePassed') or not qa.get('sourceLockUnchanged'):
        raise PackageError('Actual V09 final encode has not passed QA')
    lock_hash = immutable_record('research/qa/render-source-lock-v09.json')['sha256']
    if qa.get('renderSourceLockSHA256') != lock_hash:
        raise PackageError('Final QA refers to an earlier V09 render source lock')
    if qa.get('blackSegments') or qa.get('silenceSegmentsOver1_5s'):
        raise PackageError('Final encode contains black or long silence segments')
    if not qa.get('physicsSourceHashesMatch'):
        raise PackageError('V09 physics source hashes must match')
    for name in ['verification-v09.json', 'world-geometry-check-v09.json']:
        physics = load_json('research/physics/' + name)
        if physics.get('version') != 'V09' or physics.get('passed') is not True or not physics.get('sourceHashes'):
            raise PackageError('Current V09 physics evidence has not passed: ' + name)
        for rel, expected in physics['sourceHashes'].items():
            if immutable_record(rel)['sha256'] != expected:
                raise PackageError('Physics source changed after verification: ' + rel)
    if set(lock['files']) != set(runtime_files()):
        raise PackageError('Final lock differs from current V09 runtime inventory')
    for rel, row in lock['files'].items():
        if immutable_record(rel)['sha256'] != row['sha256']:
            raise PackageError('Source changed after final render lock: ' + rel)
    raw = Path(qa['video'])
    video = safe_output_path(raw if raw.is_absolute() else output_root() / raw)
    if scan_file(Entry(video, 'delivery/' + video.name, 'final-video-QA-hash-check'))['sha256'] != qa['sha256']:
        raise PackageError('Final MP4 differs from actual V09 QA')
    if immutable_record('research/qa/render-source-lock-v09.json')['sha256'] != lock_hash:
        raise PackageError('V09 render source lock changed during final QA validation')
    validate_visual_acceptance(qa)
    return qa


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--dry-run', action='store_true')
    modes.add_argument('--create', action='store_true')
    parser.add_argument('--qa-approved', action='store_true')
    parser.add_argument('--output', help='New ZIP inside the configured V09 output root')
    parser.add_argument('--external-ply', action='store_true')
    parser.add_argument('--include-lux-zip', action='store_true')
    parser.add_argument('--include-cfr', action='store_true')
    parser.add_argument('--compression', type=int, choices=range(1, 10), default=3)
    args = parser.parse_args()
    if args.create:
        if not args.qa_approved:
            raise PackageError('Actual packaging requires Root final-QA confirmation and --qa-approved')
        validate_final_v09_qa()
    entries, omitted, facts = choose_entries(args)
    rows = []
    for index, entry in enumerate(entries, 1):
        rows.append(scan_file(entry))
        if index % 100 == 0:
            print(f'Sensitive scan/hash {index}/{len(entries)}', flush=True)
    validate_voice_hashes(rows)
    for record in omitted:
        if record.get('absolute_locator'):
            source = safe_source_path(Path(record['absolute_locator']))
            checked = scan_file(Entry(source, record['path'], record['role']))
            for key in ['bytes', 'sha256', 'crc32', 'sensitive_scan']:
                record[key] = checked[key]
    generated = support_files(facts)
    generated_rows = [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest(),
                       'crc32': f'{zlib.crc32(data) & 0xffffffff:08x}', 'role': 'generated-portable-recovery-support',
                       'sensitive_scan': 'credential-free template'} for name, data in generated.items()]
    manifest = {'schema': 'rainbow.v09.local-user-project-package/1',
                'created_utc': dt.datetime.now(dt.timezone.utc).isoformat(),
                'distribution': 'LOCAL USER PROJECT / NOT A PUBLIC OPEN-SOURCE ASSET BUNDLE',
                'facts': facts, 'files': rows + generated_rows, 'retained_external_or_recreatable': omitted,
                'exclusions': ['node_modules/junctions', 'bundles/caches/logs', 'credentials/global settings',
                               'private TTS reference/model weights', 'unused takes', 'final MP4/duplicate previews'],
                'original_qwen_retained': True, 'original_lux_ply_included': True,
                'commercial_water_license_included': True, 'cleanup_executed': False,
                'manifest_self_hash': 'In external crc-report.json to avoid a self-referential hash'}
    data = jd(manifest)
    generated['PACKAGE_MANIFEST.json'] = data
    expected = {r['path']: r for r in rows + generated_rows}
    expected['PACKAGE_MANIFEST.json'] = {'sha256': hashlib.sha256(data).hexdigest()}
    print(json.dumps({'dry_run': not args.create, 'selected_files': len(entries),
                      'used_qwen_frame_count': facts['qwen_used_frame_count'],
                      'voice_raw_and_clean_clips': len(facts['personal_voice_clips']),
                      'standalone_gqb_found': facts['gqb_files_found'],
                      'V06_fallback_files': len(facts['V06_files_included_at_original_relative_paths']),
                      'uncompressed_mib': round(sum(r['bytes'] for r in rows) / 1024**2, 2),
                      'sensitive_scan': 'passed', 'source_deletions': 0}, ensure_ascii=False, indent=2), flush=True)
    if not args.create:
        return 0
    output = Path(args.output) if args.output else output_root() / 'delivery/彩虹为什么是弧形_V09_本地可恢复工程.zip'
    if not output.is_absolute():
        output = output_root() / output
    output = safe_output_path(output)
    if output.suffix.casefold() != '.zip':
        raise PackageError('Output must be a .zip path')
    side_manifest, side_crc = output.with_suffix('.manifest.json'), output.with_suffix('.crc-report.json')
    temporary = output.with_name(output.name + '.incomplete')
    if any(p.exists() for p in [output, side_manifest, side_crc, temporary]):
        raise PackageError('Output/sidecar already exists; choose a new output path')
    output.parent.mkdir(parents=True, exist_ok=True)
    by_path = {r['path']: r for r in rows}
    with zipfile.ZipFile(temporary, 'x', compression=zipfile.ZIP_DEFLATED,
                         compresslevel=args.compression, allowZip64=True) as archive:
        archive.comment = b'LOCAL USER PROJECT; commercial water and personal voice assets'
        for index, entry in enumerate(entries, 1):
            before = by_path[entry.archive_path]
            now = entry.source.stat()
            if (now.st_size, now.st_mtime_ns) != (before['bytes'], before['mtime_ns']):
                raise PackageError('Source changed after preflight: ' + entry.archive_path)
            kind = zipfile.ZIP_STORED if entry.source.suffix.casefold() in {'.jpg', '.jpeg', '.png', '.mp4', '.m4a', '.woff2', '.zip'} else zipfile.ZIP_DEFLATED
            archive.write(entry.source, entry.archive_path, compress_type=kind,
                          compresslevel=args.compression if kind == zipfile.ZIP_DEFLATED else None)
            if index % 100 == 0:
                print(f'ZIP wrote {index}/{len(entries)}', flush=True)
        for name, payload in generated.items():
            archive.writestr(name, payload, compress_type=zipfile.ZIP_DEFLATED, compresslevel=args.compression)
    report = verify_zip(temporary, expected)
    report['schema'] = 'rainbow.v09.zip-crc-report/1'
    report['zip'] = output.name
    if output.exists():
        raise PackageError('Target appeared during packaging; incomplete archive retained')
    temporary.rename(output)
    with side_manifest.open('xb') as handle:
        handle.write(data)
    with side_crc.open('xb') as handle:
        handle.write(jd(report))
    print(json.dumps({'zip': str(output), 'mib': round(output.stat().st_size / 1024**2, 2),
                      'manifest': str(side_manifest), 'crc_report': str(side_crc),
                      'all_crc_and_sha256_passed': True, 'source_deletions': 0}, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (PackageError, OSError, ValueError, zipfile.BadZipFile) as exc:
        print('PACKAGE REFUSED: ' + str(exc), file=sys.stderr)
        sys.exit(2)
