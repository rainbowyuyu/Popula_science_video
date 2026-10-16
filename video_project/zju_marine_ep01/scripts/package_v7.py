"""V7 private recovery packaging, with the paid WaterPro runtime isolated.

Validate only: python scripts/package_v7.py --dry-run --list
Final packaging is explicit and requires the matching final-encoding report.
No cache, fallback, source asset, or previous delivery is deleted by this script.
"""
from __future__ import annotations
from pathlib import Path, PurePosixPath
from datetime import datetime, timezone
from urllib.parse import unquote, urlsplit
import argparse
import hashlib
import json
import re
import shutil
import struct
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'output' / 'rainbow-marine-ep01-v7'
VENDOR = ROOT / 'work/waterpro-v4/vendor-valid/threejs-water-pro'
DENY_PARTS = {'.git', 'node_modules', '__pycache__', '.venv', '.cache', 'bundle', 'qa-bundle', 'prior'}
DENY_NAMES = {'auth.json', 'credentials.json', 'secrets.json', 'settings.json', 'known_hosts', 'config.toml'}
DENY_SUFFIX = {'.pem', '.key', '.p12', '.pfx', '.cer', '.crt', '.der', '.ppk', '.pyc', '.pyo', '.7z', '.zip', '.tmp', '.blend1', '.blend2'}
TEXT = {'.py', '.js', '.mjs', '.ts', '.tsx', '.json', '.md', '.txt', '.svg', '.html', '.css', '.toml', '.yaml', '.yml', '.csv', '.log'}
SECRETS = [re.compile(rb'sk-[A-Za-z0-9_.\-]{24,}'), re.compile(rb'AKIA[0-9A-Z]{16}'),
           re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'),
           re.compile(rb'(?i:Bearer)\s+[A-Za-z0-9_.\-]{24,}')]


def sha(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda: f.read(1024*1024), b''):
            h.update(b)
    return h.hexdigest()


def local(path):
    p = Path(path)
    return (p if p.is_absolute() else ROOT / p).resolve()


def archive_name(name):
    s = str(name).replace('\\', '/')
    p = PurePosixPath(s)
    if p.is_absolute() or '..' in p.parts or ':' in s:
        raise ValueError('Unsafe archive entry')
    return p.as_posix()


def permitted(path):
    return (not any(p.lower() in DENY_PARTS or p.lower().startswith(('bundle-', 'qa-bundle-')) for p in path.parts)
            and path.name.lower() not in DENY_NAMES and not path.name.lower().startswith('.env')
            and path.suffix.lower() not in DENY_SUFFIX
            and not re.search(r'(?i)(?:^|[-_])(credential|secret|private[-_]?key)(?:[-_.]|$)', path.name))


def collect(qa_paths):
    source, runtime, missing, excluded = {}, {}, [], []

    def add(path, name=None, required=False, private=False):
        p = local(path)
        if name is None:
            name = p.relative_to(ROOT).as_posix()
        name = archive_name(name)
        if not p.is_file():
            if required:
                missing.append(name)
            return
        if not permitted(p) or not permitted(Path(name)):
            excluded.append(name)
            if required:
                missing.append(name + ' (explicitly excluded)')
            return
        if p.is_symlink():
            raise ValueError('Package inputs must be ordinary files: ' + name)
        target = runtime if private else source
        if name in target and target[name] != p:
            raise ValueError('Conflicting archive entry: ' + name)
        target[name] = p

    def tree(folder, accept=lambda p: True, private=False):
        base = ROOT / folder
        if base.exists():
            for p in sorted(base.rglob('*')):
                if p.is_file() and accept(p):
                    add(p, private=private)

    def gltf_dependencies(path, allowed_root, private=False):
        """Preserve external geometry/images for both JSON glTF and GLB assets."""
        if path.suffix.lower() in {'.gltf', '.glb'} and path.exists():
            if path.suffix.lower() == '.gltf':
                doc = json.loads(path.read_text(encoding='utf-8-sig'))
            else:
                with path.open('rb') as handle:
                    header = handle.read(20)
                    if len(header) != 20:
                        raise ValueError('Truncated GLB: ' + str(path))
                    magic, version, total, length, kind = struct.unpack('<5I', header)
                    if magic != 0x46546C67 or version != 2 or kind != 0x4E4F534A or total != path.stat().st_size:
                        raise ValueError('Invalid GLB: ' + str(path))
                    doc = json.loads(handle.read(length).decode('utf-8').rstrip(' \x00'))
            for item in doc.get('buffers', []) + doc.get('images', []):
                uri = item.get('uri', '')
                if not uri or uri.startswith('data:'):
                    continue
                parsed = urlsplit(uri)
                if parsed.scheme or parsed.netloc:
                    raise ValueError('glTF contains unarchived remote dependency: ' + str(path))
                dep = (path.parent / unquote(parsed.path)).resolve()
                if not dep.is_relative_to(allowed_root.resolve()):
                    raise ValueError('glTF dependency escapes its asset root')
                add(dep, required=True, private=private)

    def asset(name):
        name = archive_name(name)
        path = ROOT / 'public' / name
        commercial = name.startswith('vendor/waterpro/') or name.startswith('audio/episode01-xijian') or name == 'audio/xijian-source.mp3'
        add(path, required=True, private=commercial)
        gltf_dependencies(path, ROOT / 'public', private=commercial)

    for folder in ['src', 'scripts', 'data']:
        tree(folder)
    for name in ['package.json', 'package-lock.json', 'tsconfig.json']:
        add(name, required=True)
    for p in ROOT.glob('remotion.config.*'):
        add(p)
    refs = set()
    for p in (ROOT / 'src').rglob('*'):
        if p.suffix.lower() not in {'.ts', '.tsx', '.js', '.json'}:
            continue
        text = p.read_text(encoding='utf-8-sig')
        refs.update(re.findall(r"(?:staticFile|mask)\(\s*['\"]([^'\"]+)['\"]\s*(?=[,)])", text))
        refs.update(re.findall(r"['\"]((?:models|fonts|brand|vendor)/[^'\"]+\.(?:gltf|glb|hdr|exr|png|jpg|jpeg|webp|ktx2|woff2|svg|js|json))['\"]", text))
    refs.update({'audio/narration.wav', 'audio/narration-immersive-v7.wav', 'audio/water-crossings-v7.wav',
                 'audio/episode01-mix-v7.wav', 'audio/episode01-xijian-v7.wav', 'audio/xijian-source.mp3',
                 'audio/subtitles.srt', 'models/turbine.glb', 'models/turbine_lod.glb',
                 'fonts/unified.woff2', 'fonts/marine-display.typeface.json', 'fonts/Noto-OFL.txt',
                 'models/polyhaven/fir_sapling/fir_sapling_1k.gltf',
                 'models/polyhaven/fir_sapling_lod/lod-report.json',
                 'models/v7-city/tree_small_02_lod/lod-report.json',
                 'brand/logo.png', 'brand/zju-emblem.svg', 'vendor/waterpro/foam2.jpg',
                 'vendor/waterpro/foam4.jpg', 'vendor/waterpro/LICENSE.md', 'vendor/waterpro/provenance.json'})
    # Dynamic template URLs are not discoverable as staticFile string literals.
    for material in ['asphalt_02', 'brick_wall_001', 'concrete_layers_02']:
        for channel in ['diff', 'normal', 'rough']:
            refs.add(f'models/v7-city/{material}/{channel}.jpg')
    for name in sorted(refs):
        asset(name)
    # The production GLB is sufficient for playback, but not for an honest
    # editable-model recovery claim. Retain its exact Blender file and inputs.
    for name in ['work/v7-city/tree_small_02_lod.blend', 'work/v7-city/tree-source/tree_small_02.gltf']:
        path = ROOT / name
        add(path, required=True)
        gltf_dependencies(path, ROOT / 'work/v7-city/tree-source')
    # Current subset/typeface is enough for the existing episode. Keep the OFL
    # source too, so future text changes can rebuild without a Windows install.
    add(Path('C:/Windows/Fonts/NotoSansSC-VF.ttf'), 'work/source-font/NotoSansSC-VF.ttf', required=True)
    # Public end-product mix embeds user music: store it with the private runtime.
    mixed = 'public/audio/episode01-mix-v7.wav'
    if mixed in source:
        runtime[mixed] = source.pop(mixed)
    for folder in ['public/brand', 'public/fonts', 'public/models']:
        tree(folder, lambda p: any(x in p.name.lower() for x in ['license', 'provenance', 'copyright', 'ofl', 'source']))

    # Deliberate narrow vendor selection. Never recurse demo, src, docs, hidden
    # files or certificates. The bundled JS embeds its own paid foam images.
    for name in ['build/index.js', 'build/index.d.ts', 'LICENSE.md', 'package.json']:
        add(VENDOR / name, required=True, private=True)
    for p in sorted((VENDOR / 'build').rglob('*.d.ts')):
        add(p, required=True, private=True)
    bundle = VENDOR / 'build/index.js'
    if bundle.exists():
        bundle_source = bundle.read_text(encoding='utf8')
        if '\x00' in bundle_source or not bundle_source.lstrip().startswith('import '):
            raise ValueError('WaterPro runtime is not a valid extracted ESM build')
        imports = re.findall(r'(?m)^\s*import\s+(?:[^;\n]*?\s+from\s+)?[\'\"]([^\'\"]+)[\'\"]', bundle_source)
        if any(not x.startswith('three') for x in imports):
            raise ValueError('Vendor JS has new dependencies; inspect explicit runtime selection')

    for folder in ['work/audio/raw', 'work/audio/clean']:
        tree(folder, lambda p: p.suffix.lower() in {'.wav', '.json', '.md', '.srt'})
    for name in ['assembly-report.json', 'asr-alignment.json', 'voice-ledger.json', 'voice-run.json', 'xijian-provenance.json']:
        add('work/audio/' + name, required=True)
    obsolete_analytic = {'immersion-timeline.json', 'crossings.json', 'CameraRail.mjs', 'WaterSurfaceState.mjs', 'export-immersion-v7.mjs'}
    tree('work/audio-v7', lambda p: p.suffix.lower() in {'.json', '.md', '.txt', '.mjs', '.mp3'} and 'decoded' not in p.name
         and not p.name.startswith('package-') and p.name not in obsolete_analytic)
    for name in ['705058.html', '852167.html']:
        add('work/audio-v7/references/' + name, required=True)
    for name in ['work/audio-v7/audio-v7-report.json', 'work/webgpu-v7/immersion-timeline-native.json',
                 'work/audio-v7/references/sources-v7.json', 'work/model-qa/turbine.blend']:
        add(name, required=True)
    tree('work/model-qa', lambda p: p.suffix.lower() in {'.json', '.md'} and 'references-v4' not in p.parts)
    for folder in ['work/v7', 'work/v7-city', 'work/webgpu-v7', 'research/iterations/v7',
                   'work/v71-series', 'work/v71-gpu1', 'work/v71-source-freeze']:
        tree(folder, lambda p: p.suffix.lower() in {'.json', '.md', '.txt', '.mjs', '.py', '.ts', '.tsx', '.html', '.css'} and 'bundle' not in p.parts)
    tree('work/v71-preview', lambda p: p.suffix.lower() in {'.json', '.md', '.txt', '.png', '.jpg', '.jpeg'} and 'bundle' not in p.parts)
    # A later corrective render must carry its own freeze record. Old V7
    # freezes remain historical evidence, never a claim about patched src.
    for name in ['work/v71-source-freeze.json', 'work/v7/v71-source-freeze.json']:
        add(name)
    add('work/waterpro-v4/verified-vendor-integrity.json', private=True)
    skill_root = Path('C:/Users/zju/.codex/skills/science-video')
    for name in ['SKILL.md', 'references/ocean-scene-rendering.md', 'references/qa-delivery.md']:
        add(skill_root / name, 'skills/science-video/' + name, required=True)
    for p in qa_paths:
        if not p.exists():
            missing.append('qa/' + p.name)
        elif p.is_dir():
            for child in sorted(p.rglob('*')):
                if child.is_file() and child.suffix.lower() in TEXT | {'.png', '.jpg', '.jpeg'}:
                    add(child, 'qa/' + p.name + '/' + child.relative_to(p).as_posix())
        else:
            add(p, 'qa/' + p.name, required=True)
    for name in source:
        if name in runtime:
            raise ValueError('Runtime/source overlap: ' + name)
    return source, runtime, missing, excluded


def scan_credentials(files):
    found = []
    for name, p in files.items():
        if p.suffix.lower() in TEXT:
            data = p.read_bytes()
            if any(pat.search(data) for pat in SECRETS):
                found.append(name)
    if found:
        raise ValueError('Credential-like content: ' + ', '.join(found) + ' (values withheld)')


def entries(files):
    return [{'path': n, 'bytes': p.stat().st_size, 'sha256': sha(p)} for n, p in sorted(files.items())]


def write_zip(path, files, listing, instructions):
    tmp = path.with_suffix('.zip.tmp')
    with zipfile.ZipFile(tmp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
        for name, p in sorted(files.items()):
            z.write(p, name)
        # No archive hash or delivery manifest is embedded; avoids self-hash loops.
        z.writestr('delivery/' + path.stem + '-file-hashes.json', json.dumps(listing, ensure_ascii=False, indent=2))
        z.writestr('delivery/' + path.stem + '-README.md', instructions)
    with zipfile.ZipFile(tmp) as z:
        invalid = z.testzip()
        if invalid:
            raise ValueError('Archive CRC failed: ' + invalid)
        actual = set(z.namelist())
        if any(x.endswith(('.pem', '.key', '.p12', '.pfx')) for x in actual):
            raise ValueError('Forbidden certificate/key in ZIP')
    tmp.replace(path)
    return {'file': path.name, 'sha256': sha(path), 'bytes': path.stat().st_size, 'crc': 'passed', 'files': listing}


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--video', type=Path, default=OUT/'marine_energy_episode01_v7_master.mp4')
    ap.add_argument('--output', '--outdir', dest='output', type=Path, default=OUT)
    ap.add_argument('--encoding-report', type=Path, default=OUT/'qa-final/final-encoding-report.json')
    ap.add_argument('--qa-report', type=Path, action='append', default=[])
    ap.add_argument('--fallback', type=Path, default=ROOT / 'output/rainbow-marine-ep01-v6-final/marine_energy_episode01_v6_master.mp4')
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--list', action='store_true')
    ap.add_argument('--overwrite', action='store_true')
    args = ap.parse_args()
    out, video, fallback = local(args.output), local(args.video), local(args.fallback)
    qa_paths = [local(p) for p in args.qa_report]
    encoding_path = local(args.encoding_report)
    if encoding_path.exists():
        qa_paths.append(encoding_path.parent)
    source, runtime, missing, excluded = collect(qa_paths)
    scan_credentials(source)
    scan_credentials(runtime)
    summary = {'schema': 'rainbow-science-video-package-selection-v7', 'version': 'v7',
               'mode': 'dry-run' if args.dry_run else 'package', 'sourceFiles': len(source), 'runtimeFiles': len(runtime),
               'sourceBytes': sum(p.stat().st_size for p in source.values()), 'runtimeBytes': sum(p.stat().st_size for p in runtime.values()),
               'missingRequired': missing, 'excludedCount': len(excluded), 'videoExists': video.is_file(),
               'encodingReportExists': encoding_path.is_file(), 'output': str(out)}
    if args.list:
        summary['sourceArchivePaths'] = sorted(source)
        summary['privateRuntimeArchivePaths'] = sorted(runtime)
    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0 if not missing else 2
    if missing:
        raise ValueError('Required files missing: ' + ', '.join(missing))
    if not video.is_file() or not encoding_path.is_file():
        raise FileNotFoundError('Final video and V7 encoding report required')
    if out == Path(out.anchor) or out == ROOT or ROOT.is_relative_to(out):
        raise ValueError('Output must be a dedicated delivery directory')
    if out == fallback.parent or out.is_relative_to(fallback.parent):
        raise ValueError('Do not write inside V6 fallback directory')
    names = ['source-v7.zip', 'private-runtime-v7.zip', 'delivery-manifest-v7.json']
    if any((out/n).exists() for n in names) and not args.overwrite:
        raise FileExistsError('V7 package exists; --overwrite applies only to named V7 files')
    video_hash = sha(video)
    encoding = json.loads(encoding_path.read_text(encoding='utf-8-sig'))
    if encoding.get('version') != 'v7' or not encoding.get('encodingPassed') or encoding.get('sha256') != video_hash:
        raise ValueError('Encoding report must certify this exact V7 video hash')
    probe = json.loads(subprocess.run(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(video)],
                                     capture_output=True, text=True, check=True).stdout)
    instructions = ('# V7 私有恢复包\n\n仅供原授权用户本地恢复，不是公开源码/商用素材再分发包。\n'
                    '将 source-v7.zip 与 private-runtime-v7.zip 解压到同一个空目录；运行 npm ci，再运行 npm run check。\n'
                    '最终生产渲染使用支持 WebGPU 的 Chromium；具体有效运行参数以 work/v7 的记录为准。\n'
                    '树木包含生产 GLTF/GLB、外部纹理、阔叶树 Blender 源和输入 glTF；源模型为 Poly Haven CC0，校园其余结构由 src 代码生成。\n'
                    '本片字幕 WOFF2、三维字形 JSON、字幕停留覆盖表均已保留。需要增加新字时，work/source-font 保存 OFL 原始字体。\n'
                    '旧建模/字体生成脚本含本机绝对路径；换机编辑前需将其项目根目录、Blender 路径及字体路径指向解压位置。\n'
                    'src 是打包时的当前源码，准确内容以本包 SHA256 表为准；work/v7/source-freeze.json 是原 V7 历史冻结。V7.1 修复、预览、最新冻结与分段合成报告另行保留，不能将旧冻结当作新源码验证。\n'
                    'WaterPro build/index.js 为已购 3.1.1 运行库，构建中内嵌泡沫纹理。保留 LICENSE；不含 demo、证书、私钥。\n'
                    '品牌、配乐与授权改编代码保留原权利；压缩包内不包含 API 凭据或第三方服务授权。\n'
                    '本包文件哈希表不包含自身或 ZIP 哈希；ZIP 哈希仅在外部 delivery-manifest-v7.json。\n')
    source_entries, runtime_entries = entries(source), entries(runtime)
    out.mkdir(parents=True, exist_ok=True)
    source_zip = write_zip(out/names[0], source, source_entries, instructions)
    runtime_zip = write_zip(out/names[1], runtime, runtime_entries, instructions)
    if video != out/video.name:
        shutil.copy2(video, out/video.name)
    shutil.copy2(ROOT/'public/audio/subtitles.srt', out/'subtitles-v7.srt')
    manifest = {'schema': 'rainbow-science-video-delivery-v7', 'version':'v7', 'created':datetime.now(timezone.utc).isoformat(),
                'title':'浙江大学·海洋新能源', 'episode':'第一期 海洋风电总览',
                'video':{'file':video.name,'sha256':video_hash,'ffprobe':probe},
                'archives':{'source':source_zip,'privateRuntime':runtime_zip},
                'sourceProvenance':{'currentSource':'src/ files are the current packaged snapshot, verified by archive file hashes.',
                                    'historicalFreeze':'work/v7/source-freeze.json describes original V7, not necessarily patched sources.',
                                    'patchEvidence':'work/v71-series, work/v71-gpu1, work/v71-preview, work/v71-source-freeze and explicit qa-report paths; latest freeze included when supplied.',
                                    'freshRerenderTested':False},
                'runtimePolicy':'Private original-license-holder recovery only; no vendor demo/source trees, certificates or credentials.',
                'waterpro':{'version':'3.1.1','runtimePath':'work/waterpro-v4/vendor-valid/threejs-water-pro/build/index.js',
                            'claimScope':'Native WebGPU use is established by scene/render QA, not by merely including the library.'},
                'qa':{'encoding':str(encoding_path),'evidence':[str(p) for p in qa_paths],
                      'fullSpeedViewing':encoding.get('actualFullNormalSpeedViewing',False),
                      'subjectiveListening':encoding.get('subjectiveListeningChecked',False),
                      'scope':'Packaging certifies hashes, dependencies and CRC; visual/listening evidence remains separately scoped.'},
                'fallback':{'path':str(fallback),'exists':fallback.is_file(),'sha256':sha(fallback) if fallback.is_file() else None,'copied':False},
                'scientificBoundary':'Educational engineering visualization, not official university CAD, site design, CFD/FEM certification.',
                'rights':'Both archives are private. User-provided music, branding and licensed software retain original rights.',
                'externalTools':{'Blender':'D:/blender/blender.exe','TTS':'D:/python_project/tts','Node':'npm ci from included lockfile'}}
    (out/names[2]).write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    (out/'恢复说明-v7.md').write_text(instructions,encoding='utf8')
    print(json.dumps({**summary,'videoSHA256':video_hash,'sourceZIP':source_zip['sha256'],
                      'privateRuntimeZIP':runtime_zip['sha256'],'crc':'passed','fallbackCopied':False},ensure_ascii=False,indent=2))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError,FileNotFoundError,FileExistsError,subprocess.CalledProcessError) as e:
        print(f'PACKAGE_V7_ERROR: {e}',file=sys.stderr)
        raise SystemExit(1)
