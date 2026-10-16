"""Prepare the self-contained Episode 3 handoff; dry-run unless --apply is given.

Only writes delivery/episode3v5. Never edits render input/cache or removes unknown
delivery files. Final media QA and a matching video SHA256 are required to apply.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import shutil


ROOT = Path(__file__).resolve().parents[1]
DELIVERY = (ROOT / 'delivery/episode3v5').resolve()
MODEL_SOURCE = ROOT.parent / 'episode3'
VIDEO = ROOT / 'output/episode3/joinery_v5_1080p.mp4'


def sha(path: Path) -> str:
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def safe_target(relative: str) -> Path:
    target = DELIVERY / relative
    resolved = target.resolve()
    if not resolved.is_relative_to(DELIVERY) or resolved == DELIVERY:
        raise ValueError(f'Out-of-delivery path: {relative}')
    for parent in [target, *target.parents]:
        if parent == DELIVERY.parent:
            break
        if parent.is_symlink():
            raise ValueError(f'Symlink destination is not allowed: {relative}')
    return target


def read_json(path: Path):
    return json.loads(path.read_text(encoding='utf-8-sig'))


def write_json(relative: str, data) -> None:
    target = safe_target(relative)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf8')


def expected_video_hash(qa: dict) -> str:
    # Accept the explicit media QA hash only, never a source/cache hash.
    for key in ('videoSha256', 'video_sha256', 'sha256'):
        value = qa.get(key)
        if isinstance(value, str) and len(value) == 64:
            return value.lower()
    if isinstance(qa.get('video'), dict):
        return expected_video_hash(qa['video'])
    raise ValueError('Final media QA needs an explicit videoSha256 field.')


def srt_time(frame: int, fps: int) -> str:
    ms = round(frame / fps * 1000)
    sec, ms = divmod(ms, 1000)
    minutes, sec = divmod(sec, 60)
    hours, minutes = divmod(minutes, 60)
    return f'{hours:02}:{minutes:02}:{sec:02},{ms:03}'


def build_plan(qa_path: Path):
    plan: dict[str, Path] = {}

    def add(source: Path, target: str):
        safe_target(target)
        if not source.is_file():
            raise FileNotFoundError(source)
        plan[target] = source.resolve()

    for name in ['package.json', 'package-lock.json', 'tsconfig.json', 'src/index-episode3v2.tsx']:
        add(ROOT / name, name)
    for file in (ROOT / 'src/episode3v2').glob('*'):
        if file.is_file():
            add(file, 'src/episode3v2/' + file.name)
    for name in ['render_episode3v2.mjs', 'audit_episode3_world.mjs',
                 'physics_episode3v2.py', 'score_episode3v2_options.py']:
        add(ROOT / 'scripts' / name, 'scripts/' + name)
    for name in ['timeline.json', 'logo.png', 'master.wav', 'narration.wav']:
        add(ROOT / 'public/episode3v2' / name, 'public/episode3v2/' + name)
    for directory in ['models', 'physics', 'references', 'music', 'voice', 'voice-raw']:
        for file in (ROOT / 'public/episode3v2' / directory).rglob('*'):
            if file.is_file():
                add(file, file.relative_to(ROOT).as_posix())
    for name in ['story.json', 'physics-audit.json', 'audio-manifest.json',
                 'timing-summary.json', 'web-sources.json', 'music-web-research.json',
                 'voice-mastering.json']:
        add(ROOT / 'research/episode3v2' / name, 'research/episode3v2/' + name)
    for name in ['paper-sources.json', 'sha2.pdf', 'tenon-biores.pdf']:
        add(ROOT / 'research/episode3' / name, 'research/episode3/' + name)
    for name in ['build_crafted_scene.py', 'build_joinery_v2.py']:
        add(MODEL_SOURCE / name, 'blender/original-scripts/' + name)
    for name in ['joinery_pavilion_crafted.blend', 'joinery_variants_v2.blend',
                 'construction-audit.json', 'variants-audit.json']:
        add(MODEL_SOURCE / 'blender' / name, 'blender/' + name)
    for name in ['pavilion_glb.glb', 'joint_glb.glb']:
        add(MODEL_SOURCE / 'lux3d' / name, 'blender/lux3d/' + name)
    evidence = {
        'tmp/geometry-audit.json': 'qa/geometry-audit.json',
        'tmp/geometry-audit.mjs': 'qa/geometry-audit.mjs',
        'tmp/episode3-world-audit-final/audit.json': 'qa/world-audit-before-wind-fix.json',
        'tmp/episode3-world-audit-wind-final/audit.json': 'qa/wind-audit-after-fix.json',
        'tmp/episode3-world-audit-exits/audit.json': 'qa/frustum-exits.json',
        'tmp/episode3-world-audit-final/boundaries-1.jpg': 'qa/boundaries-1.jpg',
        'tmp/episode3-world-audit-final/boundaries-2.jpg': 'qa/boundaries-2.jpg',
    }
    for source, target in evidence.items():
        add(ROOT / source, target)
    # Preserve the final MP4 contact sheets and the 12-cut review reel beside
    # the JSON report; these are sampled evidence, not replacement footage.
    review_dir = ROOT / 'output/episode3/qa-final'
    for name in ['contact-1.jpg', 'contact-2.jpg', 'transition-contact-1.jpg',
                 'transition-contact-2.jpg', 'transition-contact-3.jpg',
                 'transition-contact-4.jpg', 'all-transitions-720p.mp4']:
        add(review_dir / name, 'qa/video-review/' + name)
    if VIDEO.is_file():
        add(VIDEO, VIDEO.name)
    if qa_path.is_file():
        add(qa_path, 'qa/final-media-qa.json')
    return plan


def relocate_known_flat_files(plan: dict[str, Path]):
    # These are known paths from this project's previous delivery only. A move
    # avoids duplicating large WAV/GLB assets while upgrading the flat layout.
    fixed = {
        'Film.tsx': 'src/episode3v2/Film.tsx',
        'World.ts': 'src/episode3v2/World.ts',
        'timeline.json': 'public/episode3v2/timeline.json',
        'master.wav': 'public/episode3v2/master.wav',
        'narration.wav': 'public/episode3v2/narration.wav',
        'logo.png': 'public/episode3v2/logo.png',
        'story.json': 'research/episode3v2/story.json',
        'audio-manifest.json': 'research/episode3v2/audio-manifest.json',
        'physics-audit.json': 'research/episode3v2/physics-audit.json',
        'render_episode3v2.mjs': 'scripts/render_episode3v2.mjs',
        'score_episode3v2_options.py': 'scripts/score_episode3v2_options.py',
        'joinery_variants_v2.blend': 'blender/joinery_variants_v2.blend',
    }
    for target in plan:
        for folder in ['models', 'music', 'physics', 'references']:
            prefix = f'public/episode3v2/{folder}/'
            if target.startswith(prefix):
                fixed[f'{folder}/' + target[len(prefix):]] = target
    moved = []
    for old, new in fixed.items():
        src, dst = safe_target(old), safe_target(new)
        if src.is_file():
            dst.parent.mkdir(parents=True, exist_ok=True)
            os.replace(src, dst)
            moved.append({'from': old, 'to': new})
    # Only empty known directories can be removed. Unknown files remain.
    for folder in ['models', 'music', 'physics', 'references']:
        path = safe_target(folder)
        if path.is_dir() and not any(path.iterdir()):
            path.rmdir()
    return moved


def portable_script_copies():
    # The render source used for the finished movie is archived unchanged.
    # The working copy only adds browser installation for a fresh npm ci.
    original = (ROOT / 'scripts/render_episode3v2.mjs').read_text(encoding='utf8')
    safe_target('research/render-script-used.mjs').write_text(original, encoding='utf8')
    portable = original.replace('selectComposition,openBrowser}', 'selectComposition,openBrowser,ensureBrowser}')
    old = "const chrome=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');"
    new = "const installed=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');\nconst browserStatus=fs.existsSync(installed)?{path:installed}:await ensureBrowser();\nif(!('path' in browserStatus))throw Error('Remotion browser could not be installed');\nconst chrome=browserStatus.path;"
    if old not in portable:
        raise ValueError('Renderer browser line changed; inspect before packaging.')
    safe_target('scripts/render_episode3v2.mjs').write_text(portable.replace(old, new), encoding='utf8')

    # Keep originals above and supply path-only adaptations beside the blend files.
    crafted = (MODEL_SOURCE / 'build_crafted_scene.py').read_text(encoding='utf8')
    crafted = crafted.replace("O=R.parent/'topology_optimization/public/episode3/models'", "O=R.parent/'public/episode3v2/models'")
    crafted = crafted.replace("R/'blender/", "R/'")
    safe_target('blender/build_crafted_scene.py').write_text(crafted, encoding='utf8')
    variants = (MODEL_SOURCE / 'build_joinery_v2.py').read_text(encoding='utf8')
    variants = variants.replace("R=Path(r'D:/python_project/manim_extend_rainbow/video_project/episode3')", "R=Path(__file__).resolve().parent")
    variants = variants.replace("R.parent/'topology_optimization/public/episode3v2/models'", "R.parent/'public/episode3v2/models'")
    variants = variants.replace("R.parent/'topology_optimization/public/episode3/models'", "R.parent/'public/episode3v2/models'")
    variants = variants.replace("R/'blender/", "R/'")
    safe_target('blender/build_joinery_v2.py').write_text(variants, encoding='utf8')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--qa', type=Path, default=ROOT / 'tmp/final-media-qa.json')
    args = parser.parse_args()
    qa_path = args.qa.resolve()
    plan = build_plan(qa_path)
    timeline = read_json(ROOT / 'public/episode3v2/timeline.json')
    assert (ROOT / 'public/episode3v2/timeline.json').read_bytes() == (ROOT / 'src/episode3v2/timeline.json').read_bytes()
    assert timeline['duration'] == 8840 and timeline['fps'] == 30
    assert timeline['scenes'][-1]['end'] - timeline['scenes'][-1]['start'] == 240
    if not args.apply:
        print(json.dumps({'mode': 'dry-run', 'destination': str(DELIVERY), 'files': len(plan),
                          'sourceBytes': sum(p.stat().st_size for p in plan.values()),
                          'qaExists': qa_path.is_file(), 'plan': {k: str(v) for k, v in plan.items()}}, ensure_ascii=False, indent=2))
        return
    qa = read_json(qa_path)
    video_hash = sha(VIDEO)
    if video_hash != expected_video_hash(qa):
        raise ValueError('Final-media QA belongs to a different video. Packaging stopped.')
    if 'joinery_v5_1080p.mp4' not in plan or 'qa/final-media-qa.json' not in plan:
        raise ValueError('Final video and media QA must both be present.')
    DELIVERY.mkdir(parents=True, exist_ok=True)
    moved = relocate_known_flat_files(plan)
    copied = []
    for relative, source in plan.items():
        target = safe_target(relative)
        target.parent.mkdir(parents=True, exist_ok=True)
        source_hash = sha(source)
        if not target.is_file() or sha(target) != source_hash:
            shutil.copy2(source, target)
        if sha(target) != source_hash:
            raise IOError(f'Copy verification failed: {relative}')
        copied.append({'path': relative, 'bytes': target.stat().st_size, 'sha256': source_hash})
    portable_script_copies()
    package = read_json(safe_target('package.json'))
    package['scripts'] = {'check': 'tsc --noEmit', 'render': 'node scripts/render_episode3v2.mjs',
                          'stills': 'node scripts/render_episode3v2.mjs stills',
                          'audit': 'node scripts/audit_episode3_world.mjs'}
    write_json('package.json', package)
    # Original metadata preserves provenance. A package-local copy fixes only paths.
    papers = read_json(ROOT / 'research/episode3/paper-sources.json')
    write_json('research/episode3/paper-sources-original.json', papers)
    for paper in papers['verifiedSources']:
        paper['pageImage'] = paper['pageImage'].replace('public/episode3/', 'public/episode3v2/')
    write_json('research/episode3/paper-sources.json', papers)
    captions = '\n\n'.join(f"{i+1}\n{srt_time(c['start'], timeline['fps'])} --> {srt_time(c['end'], timeline['fps'])}\n{c['text']}"
                            for i, c in enumerate(timeline['captions'])) + '\n'
    safe_target('subtitles.srt').write_text(captions, encoding='utf-8-sig')
    source_hashes = {p: sha(ROOT / p) for p in ['src/episode3v2/World.ts', 'src/episode3v2/Film.tsx',
                     'src/episode3v2/timeline.json', 'scripts/render_episode3v2.mjs',
                     'public/episode3v2/master.wav']}
    report = {
        'packagedAtUtc': datetime.now(timezone.utc).isoformat(),
        'video': VIDEO.name, 'videoSha256': video_hash,
        'durationVideoSeconds': timeline['duration'] / timeline['fps'],
        'frames': timeline['duration'], 'fps': timeline['fps'], 'resolution': [1920, 1080],
        'codaFrames': 240, 'codaSeconds': 8, 'captionCount': len(timeline['captions']),
        'sourceHashes': source_hashes, 'mediaQa': qa,
        'transitionEvidence': {
            'beforeWindFix': 'qa/world-audit-before-wind-fix.json',
            'afterWindFix': 'qa/wind-audit-after-fix.json', 'offscreenExit': 'qa/frustum-exits.json',
            'scope': 'Selected frame order tests with 160x90 pixel probes of 1920x1080 rendering; not exhaustive all-frame pixel equality.'},
        'continuousHumanFullPlayback': False, 'subjectiveListeningChecked': False,
        'modelScope': {
            'beam': 'Solved 2D orthotropic plane-stress triangular FEM; displayed displacement magnified.',
            'loadPaths': 'Illustrative pavilion/joint force paths; no full pavilion contact FEA.',
            'wind': 'Solved 2D D2Q9 pressure field; pavilion sway is illustrative, not structural stress.',
            'moisture': '2D anisotropic Fick diffusion with illustrative coefficients/time and magnified swelling.',
            'geometry': 'Sampled seated-geometry checks; not a continuous collision solver.'},
        'rebuild': {'command': 'npm ci && node scripts/render_episode3v2.mjs',
                    'browser': 'Downloaded by ensureBrowser when absent; internet needed for first install.',
                    'portableChanges': 'Package render script adds browser discovery; Blender scripts change only output/input paths.',
                    'cleanInstallRebuildExecuted': False},
    }
    write_json('qa-report.json', report)
    readme = f'''# 榫卯：木头怎样咬住木头

成片：`joinery_v5_1080p.mp4`。1920×1080、30 fps，8840 帧，约 4 分 55 秒（294.667 秒）。片尾论文与公式停留 8 秒。

## 本次修订

- 所有章节以相机和模型移动衔接，旧结构越过相机边界后才隐藏；共享亭子保持同一模型。
- 燕尾、半搭接和插销按独立父节点装配；保留建模时的局部坐标，避免穿模与错位。
- 力传导依次经过屋面、椽梁、柱、柱础，镜头跟随承力部位；梁弯曲、局部承压、风压和吸湿过程增加动态可视化。
- 文字放大、减少堆叠；标题移出画面，论文原页占满卡片，作者与年份放在下面。
- 旁白使用 rainbow鱼参考音色，歧义句改为“等它干燥”；配乐为原创程序配乐《竹影行》94 BPM，成片只有一条音乐床。

## 文件与复现

- `src/`：Three.js 场景、Remotion 合成与时间轴。
- `public/episode3v2/`：完整模型、仿真数据、论文页、母带、旁白、逐句原始/处理音频和配乐。备选配乐是独立试听。
- `blender/`：两份实际 Blender 源工程、Lux3D 原始 GLB、路径适配后的构建脚本；`original-scripts/` 保留原脚本。
- `research/`：论文 PDF、来源、音频/物理记录；`qa/`：最终媒体检测、转场/几何证据和 `video-review/` 抽样拼图/转场连片。
- `subtitles.srt`：与当前时间轴一致的 101 条字幕。

在本目录执行 `npm ci`，再执行 `node scripts/render_episode3v2.mjs`。首次运行会按需下载 Remotion Chrome；不包含 node_modules。`npm run check` 检查 TypeScript。最终重建输出为 `output/episode3/joinery_v5_1080p.mp4`。Windows 的 Microsoft YaHei / SimSun 字体用于原始成片，在其他平台可能有字体差异。

重算物理数据运行 `python scripts/physics_episode3v2.py`；重新混音运行 `python scripts/score_episode3v2_options.py`，需 NumPy、SciPy、SoundFile 与 FFmpeg。Blender 中先运行 `blender/build_crafted_scene.py`，再运行 `blender/build_joinery_v2.py` 可重建教学几何（会更新包内模型）；成片直接使用随包提供的已核验 GLB。无需重新调用生图、Lux3D 或 TTS API。

## 核查记录

以 `qa-report.json` 内嵌的最终媒体报告和 `qa/final-media-qa.json` 为准。视频 SHA256：`{video_hash}`。

64 帧全场转场报告是风线修复前记录，包含 10 个像素探针差异；后续 10 帧 × 3 顺序风场复验为 0 差异，离屏报告覆盖 12 次退出。像素探针为 160×90，渲染为 1920×1080；不将这些抽样称为逐帧全片人工观看或听音。原渲染脚本保存在 `research/render-script-used.mjs`。打包脚本只核验复制完整性；未宣称在全新安装环境中完整重渲染。

## 仿真范围

梁采用正交各向异性平面应力三角形有限元，637 节点 / 1152 单元 / 3000 N，显示形变放大。亭子和接头力线用于说明受力传递，不是全亭接触有限元结果。风是 D2Q9 BGK 二维压力场（200×110 格点），白模摆动是响应示意，不能称作结构应力；湿度是二维各向异性 Fick 扩散，时间和胀缩经过演示性放大。几何是教学模型，不能直接用作施工图。实际调用没有 Zwind，技术页按 Blender、Three.js、D2Q9、扩散模型与 Remotion 标注。

论文来源：Sha、Wang、Li（2019），DOI `10.3390/app9163429`；Huan 等（2024），DOI `10.15376/biores.19.1.478-499`。
'''
    safe_target('README.md').write_text(readme, encoding='utf8')
    # Manifest describes the packaged bytes, including deliberate portable edits.
    manifest_files = []
    for path in sorted(DELIVERY.rglob('*')):
        if path.is_file() and path.name != 'package-manifest.json':
            safe_target(path.relative_to(DELIVERY).as_posix())
            manifest_files.append({'path': path.relative_to(DELIVERY).as_posix(),
                                   'bytes': path.stat().st_size, 'sha256': sha(path)})
    write_json('package-manifest.json', {'createdAtUtc': datetime.now(timezone.utc).isoformat(),
               'sourceHashes': source_hashes, 'relocatedKnownFiles': moved,
               'unknownFilesPreserved': True, 'files': manifest_files})
    assert sha(VIDEO) == sha(safe_target(VIDEO.name)) == video_hash
    print(json.dumps({'packaged': str(DELIVERY), 'videoSha256': video_hash,
                      'files': len(manifest_files), 'bytes': sum(x['bytes'] for x in manifest_files)}, ensure_ascii=False))


if __name__ == '__main__':
    main()
