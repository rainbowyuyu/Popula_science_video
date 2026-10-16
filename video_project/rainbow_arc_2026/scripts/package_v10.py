"""Read-only V10 recovery preflight; ZIP creation requires exact final QA.

Default/--dry-run selects actual runtime dependencies, hashes and secret-scans
them. --create --qa-approved also requires current encode/source/visual QA.
Never overwrites shared source files, cleans a project, or calls a provider.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sys
import zipfile
import zlib

sys.dont_write_bytecode = True

# Selection and restoration are V10-specific. Only the audited scanner, CRC
# verifier and lexical path guards are inherited; old selection/main never run.
from package_v08 import (
    ROOT, FALLBACK_ROOT, PackageError, Entry, TEXT_SUFFIXES, CHUNK, jd, load_json,
    is_reparse, prohibited_name, safe_project_path, checked_episode_source,
    walk_safe, scan_file, verify_zip, SECRET_BYTES, SECRET_ASSIGNMENT, placeholder,
)
from v10_inventory import runtime_files, qwen_slugs, immutable_record

TEXT_SUFFIXES.update({'.tex', '.srt', '.vtt'})
EXTERNAL_ENVIRONMENT = Path(
    'C:/Users/zju/.codex/visualizations/2026/10/02/'
    '01a0fc88-2a0a-7d81-86a9-bfe4cdd86204/rainbow_arc_v09/'
    'work/env-review/rain_after_terrace_v09.blend')
ENVIRONMENT_SHA = 'e2737c89d54f92d9c122b9f17b6e643f6a79b64a937cd4eaf7a6df60fac88239'
ENVIRONMENT_MEMBER = 'public/assets_v09/environment/rain_after_terrace_v09.blend'


def archive_name(value):
    value = str(value)
    member = PurePosixPath(value)
    if (not value or member.is_absolute() or '..' in member.parts or '.' == value
            or ':' in value or '\\' in value or value != member.as_posix()):
        raise PackageError('Unsafe archive member path')
    return value


def no_reparse_ancestors(path):
    """Check lexical parents before reading a explicitly allowed external file."""
    path = Path(os.path.abspath(path))
    for part in [*reversed(path.parents), path]:
        if part.exists() and is_reparse(part):
            raise PackageError('External/output path traverses a junction or symlink')
    return path


def output_root():
    root = Path(load_json('work/output-root-v10.json')['outputRoot'])
    if not root.is_absolute():
        root = ROOT / root
    root = no_reparse_ancestors(root)
    if not root.is_dir():
        raise PackageError('Configured V10 output directory is missing')
    return root


def safe_output_path(path):
    root = output_root()
    path = no_reparse_ancestors(path)
    try:
        relative = path.relative_to(root)
    except ValueError as exc:
        raise PackageError('External/output selection escaped the V10 output root') from exc
    current = root
    for part in relative.parts:
        current /= part
        if prohibited_name(current):
            raise PackageError('Forbidden output selection: ' + relative.as_posix())
    return path


def digest(path):
    before = path.stat()
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(CHUNK), b''):
            h.update(block)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise PackageError('Source changed while hashing: ' + path.name)
    return h.hexdigest()


def scan_payload(name, payload):
    """Apply identical secret rules to generated documents without temp files."""
    findings = []
    for rule, pattern in SECRET_BYTES:
        match = pattern.search(payload)
        if match:
            findings.append({'file': name, 'rule': rule, 'byte_offset': match.start()})
    for match in SECRET_ASSIGNMENT.finditer(payload):
        if not placeholder(match.group(1)):
            findings.append({'file': name, 'rule': 'literal_sensitive_assignment',
                             'byte_offset': match.start()})
    if findings:
        raise PackageError('Sensitive generated content rejected: ' + json.dumps(findings[:8]))
    return {'path': archive_name(name), 'bytes': len(payload),
            'sha256': hashlib.sha256(payload).hexdigest(),
            'crc32': f'{zlib.crc32(payload) & 0xffffffff:08x}',
            'role': 'portable-restoration-support', 'sensitive_scan': 'passed'}


def choose_entries():
    selected, fallback_files, expectations, voice_map, qwen_map = {}, [], {}, [], []

    def expect(member, sha):
        if not isinstance(sha, str) or not re.fullmatch('[0-9a-f]{64}', sha):
            raise PackageError('Missing/invalid provenance SHA: ' + member)
        old = expectations.get(member)
        if old and old != sha:
            raise PackageError('Contradictory provenance SHA: ' + member)
        expectations[member] = sha

    def add(relative, role, required=True, fallback=False, sha=None):
        member = archive_name(Path(relative).as_posix())
        source = safe_project_path(ROOT / member)
        external = False
        if not source.is_file() and fallback:
            source = checked_episode_source(FALLBACK_ROOT / member, FALLBACK_ROOT)
            external = True
        if not source.is_file():
            if required:
                raise PackageError('Missing V10 recovery file: ' + member)
            return None
        if member not in selected:
            selected[member] = Entry(source, member, role, external)
            if external:
                fallback_files.append({'archive_path': member, 'source': str(source)})
        elif selected[member].source != source:
            raise PackageError('One archive member has conflicting sources: ' + member)
        if sha:
            expect(member, sha)
        return member

    def external(source, member, role, sha):
        member = archive_name(member)
        source = safe_output_path(source)
        if not source.is_file():
            raise PackageError('Missing accepted external V10 asset: ' + member)
        if member in selected and selected[member].source != source:
            # A published ordinary copy is allowed only when proven identical.
            if digest(selected[member].source) != sha:
                raise PackageError('Published asset differs from original: ' + member)
        else:
            selected[member] = Entry(source, member, role, True)
        expect(member, sha)

    def tree(relative, role, required=False, fallback=False, predicate=None):
        episode, directory = ROOT, safe_project_path(ROOT / relative)
        if not directory.is_dir() and fallback:
            episode = FALLBACK_ROOT
            directory = checked_episode_source(episode / relative, episode)
        if not directory.is_dir():
            if required:
                raise PackageError('Missing V10 recovery directory: ' + relative)
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

    if not load_json('package.json').get('private'):
        raise PackageError('Recovery is a private user project; package.private must be true')
    actual_runtime = runtime_files()
    for rel in actual_runtime:
        add(rel, 'V10-actual-runtime-dependency')

    scripts = [
        'package_v10.py', 'package_v08.py', 'v10_inventory.py', 'cleanup-v10.py',
        'prepare-runtime-v10.py', 'ensure-browser-v10.mjs', 'render-v10.mjs',
        'lock-render-v10.py', 'qa-v10.py', 'final-contact-v10.py',
        'audit-motion-v10.mjs', 'audit-motion-v10.ts', 'audit-fish-v10.mjs',
        'audit-fish-v10.ts', 'build-fish-v10.py', 'inspect-fish-v10.mjs',
        'preview-fish-v10.mjs', 'contact-fish-v10.py', 'provenance-fish-v10.py',
        'audit-qwen-v10.py', 'generate-qwen-v10.py', 'repaint-qwen-v10-fountain.py',
        'build-environment-v09.py', 'fetch-environment-v09.py',
        'build-environment-v08.py', 'fetch-environment-v08.py', 'check-environment-v08.py',
        'build_macro_assets_v08.py', 'sample_gaussian_ply.py', 'build_formulas.py',
        'build-font-v06.py', 'score_mix_v06.py', 'acoustic_bank.py',
        'diagnose-gpu-v10.mjs', 'restore-gpu-v10.ps1',
    ]
    for name in scripts:
        add('scripts/' + name, 'source-build-audit-or-restoration-tool')
    # Retain later bounded V10 additions without pulling old cleanup scripts or
    # a directory junction into the package. The actual runtime graph remains
    # the authority for scene code and public assets.
    for path in walk_safe(ROOT / 'scripts'):
        if ('v10' in path.name.casefold() and 'cleanup' not in path.name.casefold()
                and path.suffix.casefold() in TEXT_SUFFIXES):
            add(path.relative_to(ROOT), 'V10-additional-production-or-review-tool')
    for rel in ['research/physics/check-optics.mjs', 'research/physics/check-world-v10.mjs']:
        add(rel, 'deterministic-V10-physics-verification')
    add('research/physics/check-optics-v10.mjs', 'deterministic-V10-physics-verification', False)
    for path in walk_safe(ROOT / 'research/qa'):
        if 'v10' in path.name.casefold() and path.suffix.casefold() in {'.json', '.md', '.txt'}:
            add(path.relative_to(ROOT), 'V10-source-or-encoded-QA-evidence')
    tree('docs', 'V10-delivery-and-source-notes', predicate=lambda p:
         'v10' in p.name.casefold() and p.suffix.casefold() in TEXT_SUFFIXES)
    for name in ['verification-v10.json', 'world-geometry-check-v10.json']:
        add('research/physics/' + name, 'V10-physics-evidence', False)
    for rel in ['work/v10-base.json', 'work/gpu-preference-before-v10.json',
                'work/fish-preview-entry-v10.tsx', 'work/opus-fish-motion-task-v10.md']:
        add(rel, 'V10-production-and-review-record', False)
    tree('work/opus-runs/fish-motion-f544594a0597423f9c77f084168294e3',
         'failed-native-Opus-attempt-no-code-integrated', True,
         predicate=lambda p: p.suffix.casefold() in {'.json', '.md', '.txt'})

    for rel in ['public/assets_v10/characters/rainbow_fish/rainbow-fish-source-v10.blend',
                'public/assets_v10/characters/rainbow_fish/rig-build-v10.json',
                'public/assets_v10/characters/rainbow_fish/provenance.json',
                'public/assets_v10/characters/rainbow_fish/LICENSE.txt']:
        add(rel, 'V10-original-editable-fish-and-license')
    tree('public/assets_v09/environment', 'reused-environment-CC0-originals-and-provenance', True)
    environment = load_json('public/assets_v09/environment/provenance-v09.json')
    if Path(environment['blenderSourceLocator']) != EXTERNAL_ENVIRONMENT:
        raise PackageError('Reused Blender locator differs from explicitly allowed V09 source')
    blend_records = [r for r in environment['files'] if r['file'] == 'rain_after_terrace_v09.blend']
    if len(blend_records) != 1 or blend_records[0]['sha256'] != ENVIRONMENT_SHA:
        raise PackageError('Reused environment Blender provenance differs from accepted source')
    local_blend = safe_project_path(ROOT / ENVIRONMENT_MEMBER)
    if local_blend.is_file():
        add(ENVIRONMENT_MEMBER, 'portable-reused-editable-Blender-source', sha=ENVIRONMENT_SHA)
    else:
        blend = no_reparse_ancestors(EXTERNAL_ENVIRONMENT)
        if not blend.is_file():
            raise PackageError('Missing readonly V09 environment Blender source')
        selected[ENVIRONMENT_MEMBER] = Entry(blend, ENVIRONMENT_MEMBER,
                                              'explicit-readonly-V09-Blender-source', True)
        expect(ENVIRONMENT_MEMBER, ENVIRONMENT_SHA)
    for rel in ['public/assets_v08/environment/rain_after_terrace_v08.blend',
                'public/assets_v08/environment/provenance.json',
                'public/assets_v08/environment/landscape-provenance.json',
                'public/assets_v08/environment/README.md',
                'public/assets_v08/macro/macro_leaf_raindrop_v08.blend',
                'public/assets_v08/macro/provenance-v08.json']:
        add(rel, 'reused-Blender-model-source-and-provenance')
    tree('public/assets_v08/environment/textures', 'CC0-HDR-and-rebuild-material-sources', True)
    for rel in ['public/assets/lux3d/lux3d-delivery.json',
                'public/assets/lux3d/extracted/3dgs/gaussian.ply',
                'public/assets/lux3d/extracted/mesh/tex_mesh.glb',
                'public/assets/lux3d/extracted/3dgs/gaussian-sampled.json',
                'public/assets_v07/vendor-water/LICENSE.md',
                'public/assets_v07/vendor-water/provenance.json']:
        add(rel, 'original-Lux4040282-or-commercial-WaterPro-license')
    if str(load_json('public/assets/lux3d/lux3d-delivery.json').get('taskId')) != '4040282':
        raise PackageError('Original accepted Lux task record required')

    tree('research/sources/fonts-v09', 'font-OFL-license-and-provenance', True)
    for rel in ['research/sources/GMD_Rainbows_and_climate_change_2023.pdf',
                'research/sources/UBC_Practical_Meteorology_Ch22-Optics-v102.pdf',
                'research/sources/metadata.json', 'research/sources/hashes.json']:
        add(rel, 'actual-paper-or-textbook-and-source-record', fallback=True)
    for rel in ['research/formulas/formula-snell.tex', 'research/formulas/formula-angle.tex']:
        add(rel, 'editable-LaTeX-formula-source', fallback=True)

    # 38 accepted source pairs plus 4 V10 takes (6 raw/clean parts). A logical
    # clip may contain several raw parts; the generated mapping records each.
    accepted = load_json('research/audio-v10/accepted-source-provenance-v10.json')
    identity = load_json('research/audio-v10/source-identity-report.json')
    audio = load_json('public/audio_v10/audio-manifest-v10.json')
    inherited = {r['id']: r for r in accepted['sources']}
    new = {r['id']: r for r in identity['newTakes']}
    if len(inherited) != 38 or len(new) != 4 or len(audio['clips']) != 42:
        raise PackageError('Expected 42 accepted narration sources: 38 inherited + 4 V10')
    audio_ids = [row['id'] for row in audio['clips']]
    if len(set(audio_ids)) != 42 or set(audio_ids) != set(inherited) | set(new):
        raise PackageError('Narration manifest has duplicate or omitted accepted clips')
    for clip in audio['clips']:
        cid, parts = clip['id'], []
        if cid in new:
            row = new[cid]
            clean = add(row['audio'], 'new-V10-clean-clip', sha=row['audioSHA256'])
            if clip['sourceUnchanged'] or clip['audioSHA256'] != row['audioSHA256']:
                raise PackageError('V10 new voice identity mismatch: ' + cid)
            for part in row['parts']:
                resolved = {}
                for field, hfield in [('rawNative', 'rawNativeSHA256'), ('rawFull48k', 'rawFull48kSHA256'),
                                      ('protected', 'protectedSHA256'), ('clean', 'cleanSHA256')]:
                    resolved[field] = add(part[field], 'new-V10-raw-protected-or-clean-part', sha=part[hfield])
                add(part['masterReport'], 'new-voice-mastering-report')
                parts.append(resolved)
            add('research/audio-v10/takes/' + cid + '-a.json', 'new-voice-take-provenance')
        elif cid in inherited:
            row = inherited[cid]
            raw = add(row['raw'], 'accepted-inherited-original-raw-voice', fallback=True,
                      sha=row['originalRawSHA256'])
            clean = add(row['runtimeAudio'], 'accepted-inherited-clean-voice', fallback=True,
                        sha=row['runtimeAudioSHA256'])
            if not clip['sourceUnchanged'] or clip['audioSHA256'] != row['runtimeAudioSHA256']:
                raise PackageError('Inherited voice identity mismatch: ' + cid)
            parts.append({'rawFull48k': raw, 'clean': clean})
        else:
            raise PackageError('Unmapped accepted voice source: ' + cid)
        if not clip.get('allCleanSamplesPreserved'):
            raise PackageError('Narration contains modified accepted clean samples: ' + cid)
        voice_map.append({'id': cid, 'clean': clean, 'parts': parts,
                          'startSample': clip['startSample'], 'samples': clip['sampleCount'],
                          'audioSHA256': clip['audioSHA256']})
    for name in ['audio-manifest-v10.json', 'narration-v10.wav', 'score-v10.wav',
                 'sfx-v10.wav', 'bed-v10.wav', 'premaster-v10.wav', 'master-v10.wav']:
        add('public/audio_v10/' + name, 'current-V10-audio-manifest-or-production-stem')
    expect('public/audio_v10/narration-v10.wav', audio['narrationSHA256'])
    mix = load_json('research/audio-v10/mix-report-v10.json')
    expect('public/audio_v10/master-v10.wav', mix['masterSHA256'])
    expect('public/audio_v10/score-v10.wav', mix['scoreSHA256'])
    tree('research/audio-v10', 'V10-narration-story-source-alignment-and-mix-record', True,
         predicate=lambda p: p.suffix.casefold() in TEXT_SUFFIXES
         and 'v09' not in p.name.casefold() and p.stat().st_size > 0)
    add('research/audio-v10/timeline-v09-base.json', 'accepted-base-timeline-for-V10-audio-rebuild')
    tree('research/music/samples', 'CC0-acoustic-original-sample-bank', True, fallback=True)
    for rel in ['research/music/composition-v06.json', 'research/music/license-v10.json']:
        add(rel, 'score-event-source-and-license-record', False, fallback=True)

    # Only new accepted runtime shots. Original MP4s stay under C output in
    # production; archive them portably beside their published derivatives.
    transitions = load_json('src/transitions-v10.json')
    if transitions.get('version') != 'V10':
        raise PackageError('V10 transition manifest required')
    for shot in transitions['clips']:
        sid = shot['id']
        if not re.fullmatch('[a-z0-9_]+', sid):
            raise PackageError('Unsafe Qwen shot ID')
        base = 'public/assets_v10/qwen/' + sid
        provenance = load_json(base + '/provenance.json')
        approval = load_json(base + '/visual-acceptance.json')
        if (provenance.get('version') != 'V10' or provenance.get('status') != 'processed'
                or provenance.get('id') != sid or provenance.get('frameCount') != shot['frames']
                or provenance.get('frameCount') != 150 or approval.get('status') != 'pass'
                or len(provenance.get('frameHashes', [])) != 150
                or approval.get('providerSHA256') != provenance.get('providerSHA256')
                or provenance.get('credentialsPersisted') is not False
                or provenance.get('signedURLsPersisted') is not False):
            raise PackageError('Qwen runtime shot lacks matching acceptance/provenance: ' + sid)
        if shot.get('taskId') != provenance.get('taskId'):
            raise PackageError('Qwen task differs from runtime manifest: ' + sid)
        for name in ['provenance.json', 'visual-acceptance.json']:
            add(base + '/' + name, 'accepted-new-V10-Qwen-record')
        for which in ['first', 'last']:
            add(base + '/reference-' + which + '.png', 'actual-Qwen-endpoint-reference',
                sha=provenance[which + 'Reference']['sha256'])
        if shot['framePath'] != base.removeprefix('public/') + '/frames':
            raise PackageError('Unexpected Qwen runtime frame location: ' + sid)
        for index, sha in enumerate(provenance['frameHashes'], 1):
            add(base + f'/frames/frame_{index:04d}.jpg', 'actual-accepted-Qwen-native-frame', sha=sha)
        provider_member = base + '/provider.mp4'
        local = safe_project_path(ROOT / provider_member)
        if local.is_file():
            add(provider_member, 'original-accepted-Qwen-provider-video', sha=provenance['providerSHA256'])
        else:
            external(output_root() / 'work/qwen-v10/generated' / sid / 'provider.mp4',
                     provider_member, 'original-accepted-Qwen-provider-video', provenance['providerSHA256'])
        qwen_map.append({'id': sid, 'taskId': provenance['taskId'], 'model': provenance['model'],
                         'provider': provider_member, 'providerSHA256': provenance['providerSHA256'],
                         'actualFrames': 150, 'allFramesIncluded': True})
    for rel in ['research/qwen-v10-shot-specs.json', 'research/qa/qwen-v10-visual-review.md']:
        add(rel, 'new-Qwen-authored-specification-or-review', False)
    repaint_dir = output_root() / 'work/qwen-v10/fountain-repaint'
    repaint_local = ROOT / 'public/assets_v10/qwen/fountain-repaint-source/provenance.json'
    repaint_provenance = (repaint_local if repaint_local.is_file() else
                         safe_output_path(repaint_dir / 'provenance.json'))
    if repaint_provenance.is_file():
        repaint = json.loads(repaint_provenance.read_text('utf8'))
        if (any(row['id'].startswith('fountain_') for row in qwen_map)
                and repaint.get('status') != 'processed'):
            raise PackageError('Accepted fountain transitions require processed image-edit originals')
        if repaint.get('status') == 'processed':
            repaint_members = [('reference.png', repaint['reference']['sha256']),
                               ('provider.png', repaint['providerSHA256']),
                               ('fountain-repaint-1920x1080.png', repaint['derivativeSHA256']),
                               ('provenance.json', digest(repaint_provenance))]
            for name, sha in repaint_members:
                member = 'public/assets_v10/qwen/fountain-repaint-source/' + name
                if (ROOT / member).is_file():
                    add(member, 'Qwen-image-edit-immutable-original-and-provenance', sha=sha)
                else:
                    external(repaint_dir / name, member,
                             'Qwen-image-edit-immutable-original-and-provenance', sha)
    if qwen_map and not repaint_provenance.is_file():
        raise PackageError('Accepted V10 Qwen shots require their image-edit source record')

    timeline = load_json('src/timeline.json')
    omitted = [{'path': 'public/assets/lux3d/lux3d.zip', 'reason': 'Original PLY/GLB/task included; duplicate provider ZIP remains untouched',
                'sha256': digest(safe_project_path(ROOT / 'public/assets/lux3d/lux3d.zip'))}]
    facts = {'version': 'V10', 'durationFrames': timeline['duration'], 'fps': timeline['fps'],
             'durationSeconds': timeline['duration'] / timeline['fps'], 'composition': 'RainbowArc',
             'runtimeFiles': actual_runtime, 'personalVoiceClips': voice_map,
             'inheritedClipCount': len(inherited), 'newTakeCount': len(new),
             'newRawPartCount': sum(len(x['parts']) for x in new.values()),
             'qwenUsedTasks': qwen_map, 'qwenUsedFrameCount': sum(x['actualFrames'] for x in qwen_map),
             'fallbackSources': fallback_files, 'externalEnvironmentSource': str(EXTERNAL_ENVIRONMENT),
             'externalEnvironmentArchivePath': ENVIRONMENT_MEMBER,
             'commercialWater': 'public/assets_v07/vendor-water/LICENSE.md',
             'privateReferenceAndWeightsExcluded': True, 'oldRobotAndOldQwenExcluded': True,
             'opusCompleted': False, 'opusCodeIntegrated': False, 'cleanupExecuted': False}
    return sorted(selected.values(), key=lambda e: e.archive_path), expectations, omitted, facts


def support_files(facts):
    seconds = facts['durationSeconds']
    readme = f'''# 《彩虹为什么是弧形》V10 本地恢复工程

这是当前用户的私用恢复包，含个人旁白与商业 WaterPro 运行素材，不作为公开素材库或开源资产包发布。主片 MP4 单独交付，包内保留可恢复源码及实际制作来源。

## 恢复成片

解压到一个新的普通目录（禁止放入符号链接、目录连接或覆盖旧工程）。需要 Node.js/npm、Python 与 FFmpeg/FFprobe；Python 检查器本身只用标准库。PowerShell 执行 `./RESTORE_V10.ps1`：先检验包内每一项 SHA256，再安装 package-lock 中的依赖，用 `prepare-runtime-v10.py --init` 建立当前解压目录内的输出目录，安装私有渲染浏览器并检查 TypeScript、几何光学和世界坐标。

入口 `src/index.tsx`，Composition `RainbowArc`，1920×1080，30 fps，{facts['durationFrames']} 帧，约 {seconds / 60:.2f} 分钟。恢复完成后执行 `npm run render`，输出到当前解压目录的 `restored-output-v10/delivery/`。恢复过程无需 Claude、Qwen、Lux3D 或 TTS 账号，也不需要重新付费生成素材。

## 保留的制作来源

实际运行依赖由 V10 import graph 和 `staticFile` 引用选出。包含彩虹鱼 GLB 和可编辑 Blender 源、V09 环境 Blender 源及 CC0 植物和材质、微距水滴 Blender 源、原 Lux3D task 4040282 的 PLY/GLB/任务记录、字体及 OFL、真实论文 PDF/截页、LaTeX 源及公式 SVG、确定性 Three.js 光学/水面代码与来源记录。原环境 source locator 保留为生产历史，包内可编辑副本位于 `{ENVIRONMENT_MEMBER}`。

42 个旁白 clip 的全部实际来源已保留：38 个接受过的继承 raw/clean 对，4 个 V10 takes 的 6 个 native/48k/protected/clean 分句，以及合成时间映射和 narration/score/sfx/bed/premaster/master 分轨。完整对应关系见 `RECOVERY_AUDIO_SOURCES_V10.json`；私人参考音色和模型权重保留在原 TTS 项目，不在包中。渲染现有成片不需要重新合成。

包含 {len(facts['qwenUsedTasks'])} 个已接受的新 V10 Qwen 视频原片、{facts['qwenUsedFrameCount']} 张实际原生运行帧、首尾参考图和 provenance/视觉验收，以及喷泉 image-edit 原图与生成原图。Qwen 负责氛围转换，折射角和光路来自几何计算。生成风格图并非现场拍摄或实验数据。

本轮 Claude Opus 5.5 native 调用超时，未收到完整完成信号，没有整合其截断代码。原 prompt/report/partial 已保留；鱼的运行运动由本地解析实现。打包不会把尝试过的工具记成成功产出。

## 编辑和重新制作

Blender 原安装为 `D:/blender/blender.exe`，可直接打开包内 .blend；新机器自行设置本地 Blender 路径。重合成旁白仍需要用户私有 TTS 项目和参考，源码记录了实际设置。重新编排配乐可运行 `python scripts/remix-restored-v10.py`，它在内存中将旧样本库定位替换为包内 `research/music/samples`，不改历史制作脚本；该命令会重写此解压副本的音频，执行前保留自己的备份。原乐器样本及 CC0 许可均已包含。

恢复脚本只验证并准备本地渲染，不调用生成 API、不更改全局 Claude/CC Switch、不包含凭据、node_modules、旧机器人、退役 Qwen、浏览器缓存或 TTS 权重。生产 QA 是本次成片的历史快照；任何重渲染需重新产生新的源锁与最终 QA，不能沿用其通过结论。

完整成员、SHA256/CRC32 见 `PACKAGE_MANIFEST.json` 与 ZIP 外的 manifest/crc-report。`python scripts/verify-recovery-v10.py` 可再次验证解压内容。打包和恢复准备均未删除原工程或修改继承硬链接。论文、许可证和个人声音的使用范围请依据各自来源记录。
'''
    restore = '''$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
    python scripts/verify-recovery-v10.py
    if ($LASTEXITCODE -ne 0) { throw 'Recovery member SHA256 check failed' }
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' }
    python scripts/prepare-runtime-v10.py --init
    if ($LASTEXITCODE -ne 0) { throw 'Portable runtime preparation failed' }
    node scripts/ensure-browser-v10.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Render browser setup failed' }
    npm run check
    if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed' }
    node research/physics/check-optics.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Geometric optics check failed' }
    node research/physics/check-world-v10.mjs
    if ($LASTEXITCODE -ne 0) { throw 'V10 world check failed' }
    Write-Host 'V10 ready. Render with npm run render. Output: restored-output-v10/delivery.'
} finally { Pop-Location }
'''
    verify = '''"""Verify package SHA256 in an ordinary extraction directory before npm ci."""
from pathlib import Path, PurePosixPath
import hashlib,json,os,stat
ROOT=Path(__file__).resolve().parents[1]
def regular(p):
    s=p.lstat()
    return not stat.S_ISLNK(s.st_mode) and not bool(getattr(s,'st_file_attributes',0)&0x400)
assert all(regular(p) for p in [ROOT,*ROOT.parents]), 'Extraction root traverses a link'
m=json.loads((ROOT/'PACKAGE_MANIFEST.json').read_text('utf8'))
assert m['version']=='V10' and m['privateUserRecovery'], 'Wrong recovery manifest'
paths=set()
for row in m['files']:
    value=row['path'];p=PurePosixPath(value)
    assert not p.is_absolute() and '..' not in p.parts and ':' not in value and '\\\\' not in value
    assert value not in paths, 'Duplicate member';paths.add(value)
    f=ROOT/Path(value)
    assert f.is_file() and all(regular(q) for q in [f,*list(f.parents)[:len(p.parts)]]), 'Missing/linked member: '+value
    assert f.stat().st_size==row['bytes'], 'Member size differs: '+value
    h=hashlib.sha256()
    with f.open('rb') as s:
        for b in iter(lambda:s.read(4*1024*1024),b''):h.update(b)
    assert h.hexdigest()==row['sha256'], 'Member SHA256 differs: '+value
print(json.dumps({'version':'V10','membersVerified':len(paths),'allSHA256Passed':True,'sourceMutations':0}))
'''
    remix = '''"""Optional local remix; execute only in a fresh recovery copy."""
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
source=ROOT/'research/audio-v10/mix_v10.py'
text=source.read_text('utf8')
old="ROOT.parent/'rainbow_arc_2026_v06/research/music/samples'"
assert text.count(old)==1, 'Unknown original sample locator; inspect before remix'
assert (ROOT/'research/music/samples/LICENSE').is_file(), 'Bundled acoustic license missing'
text=text.replace(old,"ROOT/'research/music/samples'")
exec(compile(text,str(source),'exec'),{'__file__':str(source),'__name__':'__main__'})
'''
    return {'LOCAL_USER_PROJECT_README.md': readme.encode('utf8'),
            'RESTORE_V10.ps1': restore.encode('utf-8-sig'),
            'scripts/verify-recovery-v10.py': verify.encode('utf8'),
            'scripts/remix-restored-v10.py': remix.encode('utf8'),
            'work/output-root-v10.json': jd({'outputRoot': 'restored-output-v10', 'version': 'V10',
                                           'reason': 'Portable extraction-relative recovery output'}),
            'RECOVERY_AUDIO_SOURCES_V10.json': jd({'version': 'V10', 'sampleRate': 48000,
                                                  'clips': facts['personalVoiceClips']})}


def validate_final_qa():
    qa = load_json('research/qa/delivery-qa-v10.json')
    lock = load_json('research/qa/render-source-lock-v10.json')
    if (qa.get('version') != 'V10' or lock.get('version') != 'V10'
            or lock.get('schema') != 'rainbow.v10.render-source-lock/1'
            or qa.get('qaStatus') != 'pass' or not qa.get('fullDecodePassed')
            or not qa.get('sourceLockUnchanged') or not qa.get('physicsSourceHashesMatch')):
        raise PackageError('Actual V10 encoded video/source/physics QA has not passed')
    lock_hash = immutable_record('research/qa/render-source-lock-v10.json')['sha256']
    if qa.get('renderSourceLockSHA256') != lock_hash:
        raise PackageError('Final QA refers to an earlier V10 source lock')
    if (qa.get('blackSegments') or qa.get('silenceSegmentsOver1_5s')
            or not -17.5 <= qa.get('integratedLUFS', 0) <= -14
            or qa.get('truePeakDbTP', 0) > -1.5):
        raise PackageError('V10 black/silence/loudness final checks failed')
    if set(lock['files']) != set(runtime_files()) or lock.get('actualQwenSlugs') != qwen_slugs():
        raise PackageError('Current runtime dependencies differ from encoded V10 source lock')
    for rel, row in lock['files'].items():
        if immutable_record(rel)['sha256'] != row['sha256']:
            raise PackageError('Runtime source changed after final lock: ' + rel)
    for name in ['verification-v10.json', 'world-geometry-check-v10.json']:
        physics = load_json('research/physics/' + name)
        if physics.get('version') != 'V10' or physics.get('passed') is not True or not physics.get('sourceHashes'):
            raise PackageError('Actual V10 physics evidence missing/failed: ' + name)
        for rel, sha in physics['sourceHashes'].items():
            if immutable_record(rel)['sha256'] != sha:
                raise PackageError('Physics source differs from final checks: ' + rel)
    video = Path(qa['video'])
    video = safe_output_path(video if video.is_absolute() else output_root() / video)
    if digest(video) != qa['sha256']:
        raise PackageError('Delivered V10 MP4 differs from actual final QA')
    acceptance = load_json('research/qa/final-visual-acceptance-v10.json')
    if (acceptance.get('version') != 'V10' or acceptance.get('status') != 'pass'
            or acceptance.get('sourceVideoSHA256') != qa['sha256']
            or not acceptance.get('scope') or not acceptance.get('reviewReports')):
        raise PackageError('Documented visual acceptance for this exact V10 MP4 required')
    for row in acceptance['reviewReports']:
        rel = row if isinstance(row, str) else row.get('path') if isinstance(row, dict) else None
        if not isinstance(rel, str) or not rel:
            raise PackageError('Invalid final visual review report reference')
        path = safe_project_path(ROOT / rel)
        if not path.is_file() or qa['sha256'] not in path.read_text('utf-8-sig'):
            raise PackageError('Visual review does not identify the actual V10 MP4: ' + rel)
        if isinstance(row, dict) and row.get('sha256') and digest(path) != row['sha256']:
            raise PackageError('Visual review changed after acceptance: ' + rel)
    if immutable_record('research/qa/render-source-lock-v10.json')['sha256'] != lock_hash:
        raise PackageError('Render source lock changed during QA validation')
    return qa


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument('--dry-run', action='store_true')
    mode.add_argument('--create', action='store_true')
    parser.add_argument('--qa-approved', action='store_true', help='Root confirmed exact final MP4 QA and visual review')
    parser.add_argument('--output')
    parser.add_argument('--report', help='Optional new JSON preflight record inside configured V10 output')
    parser.add_argument('--compression', type=int, choices=range(0, 10), default=6)
    args = parser.parse_args()
    if args.create and not args.qa_approved:
        raise PackageError('ZIP creation requires Root final MP4 QA/visual confirmation and --qa-approved')
    qa = validate_final_qa() if args.create else None
    entries, expectations, omitted, facts = choose_entries()
    if args.create and not facts['qwenUsedTasks']:
        raise PackageError('No accepted new V10 Qwen runtime shots; cannot create final source package')
    rows = []
    for index, entry in enumerate(entries, 1):
        rows.append(scan_file(entry))
        if index % 100 == 0:
            print(f'Preflight hashed/scanned {index}/{len(entries)}', flush=True)
    by_path = {r['path']: r for r in rows}
    for member, sha in expectations.items():
        if by_path[member]['sha256'] != sha:
            raise PackageError('Accepted-source SHA mismatch: ' + member)
    generated = support_files(facts)
    for name, payload in generated.items():
        if name.endswith('.py'):
            compile(payload.decode('utf8'), name, 'exec')
    generated_rows = [scan_payload(name, data) for name, data in generated.items()]
    overlap = set(generated) & set(by_path)
    if overlap:
        raise PackageError('Generated support overlaps selected original members: ' + ', '.join(sorted(overlap)))
    manifest = {'schema': 'rainbow.v10.private-recovery-manifest/1', 'version': 'V10',
                'createdUTC': dt.datetime.now(dt.timezone.utc).isoformat(), 'privateUserRecovery': True,
                'finalVideoQA': qa, 'facts': facts, 'files': rows + generated_rows,
                'retainedOutsidePackage': omitted, 'sourceMutations': 0, 'sourceDeletions': 0,
                'exclusions': ['credentials/global preferences', 'node_modules/junctions', 'caches/logs/bundles',
                               'private TTS reference/weights', 'retired robot/old Qwen', 'duplicate final MP4/previews'],
                'manifestSelfHash': 'Recorded in external ZIP CRC report to avoid a self-referential hash'}
    data = jd(manifest)
    scan_payload('PACKAGE_MANIFEST.json', data)
    generated['PACKAGE_MANIFEST.json'] = data
    expected = {r['path']: r for r in rows + generated_rows}
    expected['PACKAGE_MANIFEST.json'] = {'sha256': hashlib.sha256(data).hexdigest()}
    summary = {'dryRun': not args.create, 'version': 'V10', 'selectedFiles': len(entries),
               'generatedSupportFiles': len(generated), 'logicalVoiceClips': 42,
               'inheritedRawCleanPairs': facts['inheritedClipCount'], 'newTakes': facts['newTakeCount'],
               'newRawParts': facts['newRawPartCount'], 'usedQwenTasks': len(facts['qwenUsedTasks']),
               'usedQwenFrames': facts['qwenUsedFrameCount'], 'V06FallbackFiles': len(facts['fallbackSources']),
               'uncompressedMiB': round(sum(r['bytes'] for r in rows + generated_rows) / 1024**2, 2),
               'secretScan': 'passed', 'provenanceHashes': 'passed', 'sourceMutations': 0, 'sourceDeletions': 0}
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
    if args.report:
        report = Path(args.report)
        report = safe_output_path(report if report.is_absolute() else output_root() / report)
        if report.suffix.casefold() != '.json' or report.exists():
            raise PackageError('Preflight report needs a new .json path; never overwrites')
        report.parent.mkdir(parents=True, exist_ok=True)
        with report.open('xb') as stream:
            stream.write(jd({'summary': summary, 'manifest': manifest}))
    if not args.create:
        return 0
    output = Path(args.output) if args.output else output_root() / 'delivery/彩虹为什么是弧形_V10_本地可恢复工程.zip'
    output = safe_output_path(output if output.is_absolute() else output_root() / output)
    if output.suffix.casefold() != '.zip':
        raise PackageError('Output must be a .zip path')
    temporary = output.with_name(output.name + '.incomplete')
    side_manifest, side_crc = output.with_suffix('.manifest.json'), output.with_suffix('.crc-report.json')
    if any(p.exists() for p in [output, temporary, side_manifest, side_crc]):
        raise PackageError('ZIP/incomplete/sidecar exists; choose a new output path')
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(temporary, 'x', compression=zipfile.ZIP_DEFLATED,
                         compresslevel=args.compression, allowZip64=True) as archive:
        archive.comment = b'LOCAL USER RECOVERY; commercial water and personal narration assets'
        for index, entry in enumerate(entries, 1):
            before, current = by_path[entry.archive_path], entry.source.stat()
            if (current.st_size, current.st_mtime_ns) != (before['bytes'], before['mtime_ns']):
                raise PackageError('Source changed after preflight: ' + entry.archive_path)
            kind = zipfile.ZIP_STORED if entry.source.suffix.casefold() in {'.jpg', '.jpeg', '.png', '.mp4', '.m4a', '.woff2', '.zip'} else zipfile.ZIP_DEFLATED
            archive.write(entry.source, entry.archive_path, compress_type=kind,
                          compresslevel=args.compression if kind == zipfile.ZIP_DEFLATED else None)
            if index % 100 == 0:
                print(f'ZIP wrote {index}/{len(entries)}', flush=True)
        for name, payload in generated.items():
            archive.writestr(name, payload, compress_type=zipfile.ZIP_DEFLATED, compresslevel=args.compression)
    report = verify_zip(temporary, expected)
    report.update(schema='rainbow.v10.zip-crc-report/1', zip=output.name)
    validate_final_qa()
    if output.exists():
        raise PackageError('Target appeared during packaging; incomplete ZIP retained')
    temporary.rename(output)
    with side_manifest.open('xb') as stream:
        stream.write(data)
    with side_crc.open('xb') as stream:
        stream.write(jd(report))
    print(json.dumps({'zip': str(output), 'manifest': str(side_manifest), 'crcReport': str(side_crc),
                      'allCRCAndSHA256Passed': True, 'sourceMutations': 0, 'sourceDeletions': 0},
                     ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == '__main__':
    sys.dont_write_bytecode = True
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf8')
    try:
        raise SystemExit(main())
    except (PackageError, OSError, ValueError, KeyError, zipfile.BadZipFile, RuntimeError) as exc:
        print('PACKAGE REFUSED: ' + str(exc), file=sys.stderr)
        raise SystemExit(2)
