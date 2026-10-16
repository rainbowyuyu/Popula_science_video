"""Create the private, recoverable V4 delivery after rendering and QA.

Dry-run performs selection and credential checks without writing a package:
    python scripts/package_v4.py --dry-run
Final example:
    python scripts/package_v4.py --qa-report work/qa-v4/summary.json
Optional --include-manifest appends a reviewed WaterPro/runtime file list.
This script never deletes old deliveries, caches, source assets, or the V3 fallback.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import zipfile
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUT = ROOT / 'output' / 'rainbow-marine-ep01-v4'
EXCLUDED_PARTS = {'node_modules', '__pycache__', '.git', '.venv', 'prior',
                  'qa-bundle', 'bundle', '.cache', '.pytest_cache'}
EXCLUDED_NAMES = {'.env', '.env.local', '.env.production', 'auth.json',
                  'credentials.json', 'secrets.json', 'settings.json', '.request.lock'}
TEXT_SUFFIXES = {'.py', '.mjs', '.js', '.ts', '.tsx', '.json', '.md', '.txt',
                 '.svg', '.html', '.css', '.toml', '.yaml', '.yml', '.map', '.csv', '.log'}
SECRET_PATTERNS = [
    re.compile(rb'sk-[A-Za-z0-9_.\-]{24,}'),
    re.compile(rb'AKIA[0-9A-Z]{16}'),
    re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    re.compile(rb'(?i:Bearer)\s+[A-Za-z0-9_.\-]{24,}'),
]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def local(path: str | Path) -> Path:
    p = Path(path)
    return (p if p.is_absolute() else ROOT / p).resolve()


def allowed_name(path: Path) -> bool:
    return (not any(part in EXCLUDED_PARTS for part in path.parts)
            and path.name.lower() not in EXCLUDED_NAMES
            and not path.name.lower().startswith('.env')
            and path.suffix.lower() not in {'.pyc', '.pyo', '.blend1', '.blend2', '.tmp', '.mp4', '.7z'}
            and not re.search(r'(?i)(?:^|[-_])(credential|secret|private[-_]?key)(?:[-_.]|$)', path.name))


def safe_archive_name(value: str) -> str:
    p = Path(value.replace('\\', '/'))
    if p.is_absolute() or '..' in p.parts or ':' in value:
        raise ValueError(f'Unsafe ZIP entry: {value}')
    return p.as_posix()


def collect(extra_manifest: Path | None, qa_paths: list[Path]):
    selected: dict[str, Path] = {}
    missing: list[str] = []
    excluded: list[str] = []

    def add(path: str | Path, archive: str | None = None, required=False):
        source = local(path)
        if archive is None:
            try:
                archive = source.relative_to(ROOT).as_posix()
            except ValueError:
                raise ValueError('External files require an explicit archive path')
        archive = safe_archive_name(archive)
        if not source.is_file():
            if required:
                missing.append(archive)
            return
        if not allowed_name(Path(archive)) or not allowed_name(source):
            excluded.append(archive)
            if required:
                missing.append(f'{archive} (excluded by packaging policy)')
            return
        if source.is_symlink() and not source.resolve().is_relative_to(ROOT):
            raise ValueError(f'External symlink requires explicit file selection: {archive}')
        if archive in selected and selected[archive] != source:
            raise ValueError(f'Conflicting archive destination: {archive}')
        selected[archive] = source

    def tree(rel: str, predicate=None):
        folder = ROOT / rel
        if not folder.exists():
            return
        for p in sorted(folder.rglob('*')):
            if p.is_file() and (predicate is None or predicate(p)):
                add(p)

    for rel in ('src', 'scripts', 'data'):
        tree(rel)
    for name in ('package.json', 'package-lock.json', 'tsconfig.json'):
        add(name, required=True)
    for p in ROOT.glob('remotion.config.*'):
        add(p)
    # A rules snapshot was present in V3 and is useful for future revisions.
    add(Path('C:/Users/zju/.codex/skills/science-video/SKILL.md'), 'skills/science-video/SKILL.md')

    # Runtime public references include literal staticFile/mask paths, imported
    # typefaces, and cue audio paths declared in story.json. Dynamic additions
    # must be placed in the reviewed include manifest, never inferred remotely.
    public_refs = set()
    for p in (ROOT / 'src').rglob('*'):
        if p.suffix not in {'.ts', '.tsx', '.js', '.json'}:
            continue
        source = p.read_text(encoding='utf-8-sig')
        public_refs.update(re.findall(r"(?:staticFile|mask)\(\s*['\"]([^'\"]+)['\"]\s*(?=[,)])", source))
        public_refs.update(re.findall(r"['\"](?:\.\./)?public/([^'\"]+)['\"]", source))
    water_source = (ROOT / 'src/WaterProMarine.ts').read_text(encoding='utf-8-sig')
    for texture in re.findall(r"['\"](foam[0-9]+\.(?:jpg|png|webp))['\"]", water_source):
        public_refs.add('vendor/waterpro/' + texture)
    # Current runtime + regeneration sources that cannot be derived from imports.
    public_refs.update({
        'audio/narration.wav', 'audio/narration-immersive-v4.wav',
        'audio/water-crossings-v4.wav', 'audio/episode01-xijian-bgm.wav',
        'audio/xijian-source.mp3', 'audio/subtitles.srt',
        'models/turbine.glb', 'models/turbine_lod.glb', 'models/studio.hdr',
        'fonts/unified.woff2', 'fonts/marine-display.typeface.json', 'fonts/Noto-OFL.txt',
        'brand/logo.png', 'brand/zju-emblem.svg',
        'vendor/waterpro/LICENSE.md', 'vendor/waterpro/provenance.json',
    })
    for name in sorted(public_refs):
        add('public/' + name, required=True)
    # Include legal/provenance companions, but not unused commercial declarations.
    for folder in ('public/vendor/waterpro', 'public/brand', 'public/fonts', 'public/models'):
        tree(folder, lambda p: any(s in p.name.lower() for s in ('license', 'provenance', 'copyright', 'ofl', 'source')))

    # Raw and clean sentence files permit local reassembly without TTS weights.
    for folder in ('work/audio/raw', 'work/audio/clean'):
        tree(folder)
    for name in ('assembly-report.json', 'asr-alignment.json', 'voice-ledger.json',
                 'voice-run.json', 'xijian-provenance.json', 'subtitles.srt'):
        add('work/audio/' + name, required=True)
    tree('work/audio-v4', lambda p: p.suffix in {'.json', '.md', '.py'} and not p.name.startswith('crossing-review-'))
    for name in ('immersion-timeline.json', 'immersive-audio-report.json'):
        add('work/audio-v4/' + name, required=True)

    add('work/model-qa/turbine.blend', required=True)
    for name in ('model-manifest.json', 'packaging-v4.json', 'foundations-v4-qa.json', 'INTEGRATION-V4.md'):
        add('work/model-qa/' + name, required=True)
    # Preserve finite evidence, not the scratch render bundle or obsolete build.
    for name in ('scene-qa.json', 'nacelle_assembled_v4.png', 'nacelle_interior.png',
                 'foundation-jacket-v4.png', 'foundation-land-v4.png', 'foundation-semisub-v4.png'):
        add('work/model-qa/' + name)
    tree('work/model-qa/references-v4', lambda p: not p.name.endswith('-search.txt') and p.suffix.lower() != '.html')
    tree('work/waterpro', lambda p: p.suffix in {'.md', '.json'} and 'threejs-water-pro' not in p.parts)
    tree('work/opus-runs', lambda p: p.name in {'report.json', 'response.md', 'response.partial.md'} and p.stat().st_size > 0)
    tree('research/iterations/v4')
    tree('research/iterations/v4-typography', lambda p: p.suffix in {'.md', '.json', '.txt', '.png', '.jpg'})
    for p in qa_paths:
        if p.is_dir():
            for child in sorted(p.rglob('*')):
                if child.is_file():
                    add(child, 'qa/' + p.name + '/' + child.relative_to(p).as_posix())
        else:
            add(p, 'qa/' + p.name, required=True)

    extra_meta = {}
    if extra_manifest:
        document = json.loads(extra_manifest.read_text(encoding='utf-8-sig'))
        extra_meta = document.get('waterpro', {})
        for item in document.get('files', []):
            # Each external commercial asset is deliberate and reviewable.
            # No recursive external directory traversal or credentials allowed.
            add(item['source'], item.get('archive'), required=item.get('required', True))
        add(extra_manifest, 'delivery/extra-files-manifest.json', required=True)
    return selected, missing, excluded, extra_meta


def scan_credentials(files: dict[str, Path]):
    problems = []
    for archive, path in files.items():
        if path.suffix.lower() not in TEXT_SUFFIXES:
            continue
        data = path.read_bytes()
        if any(pattern.search(data) for pattern in SECRET_PATTERNS):
            # Never echo the matched value into a terminal, manifest or log.
            problems.append(archive)
    return problems


def probe_video(path: Path):
    command = ['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)]
    result = subprocess.run(command, check=True, capture_output=True, text=True, encoding='utf8')
    return json.loads(result.stdout)


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--video', default='output/marine_energy_episode01_v4.mp4')
    p.add_argument('--fallback', default='output/marine_energy_episode01_v3.mp4')
    p.add_argument('--output', '--outdir', dest='output', default=str(DEFAULT_OUT), help='Absolute or project-relative delivery directory; defaults to C: to avoid the full D: drive')
    p.add_argument('--qa-report', action='append', default=[], help='Existing QA JSON/text/file/directory; repeat as needed')
    p.add_argument('--include-manifest', help='Reviewed JSON {files:[{source,archive,required}],waterpro:{...}}')
    p.add_argument('--dry-run', action='store_true', help='Validate selection without writing any output')
    p.add_argument('--list', action='store_true', help='Print selected archive paths, never file contents')
    p.add_argument('--overwrite', action='store_true', help='Replace this V4 package only; does not delete old sources or V3')
    return p.parse_args()


def main():
    args = parse_args()
    out, video, fallback = local(args.output), local(args.video), local(args.fallback)
    extra = local(args.include_manifest) if args.include_manifest else None
    qa_paths = [local(p) for p in args.qa_report]
    files, missing, excluded, extra_meta = collect(extra, qa_paths)
    problems = scan_credentials(files)
    if problems:
        raise ValueError('Credential-like content found; packaging blocked (values not printed): ' + ', '.join(problems))
    summary = {'mode': 'dry-run' if args.dry_run else 'package', 'files': len(files),
               'sourceBytes': sum(p.stat().st_size for p in files.values()),
               'missingRequired': missing, 'excludedCount': len(excluded),
               'videoExists': video.is_file(), 'fallbackExists': fallback.is_file(),
               'output': str(out), 'commercialExtraManifest': bool(extra)}
    if args.list:
        summary['archivePaths'] = sorted(files)
    if args.dry_run:
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0 if not missing else 2
    if missing:
        raise ValueError('Required archive files missing: ' + ', '.join(missing))
    if not video.is_file():
        raise FileNotFoundError(video)
    if not qa_paths:
        raise ValueError('Final package needs --qa-report with the actual V4 verification evidence. Use --dry-run to inspect selection.')
    if any((out / name).exists() for name in ('source-v4.zip', 'delivery-manifest.json')) and not args.overwrite:
        raise FileExistsError(f'V4 package already exists; use --overwrite to replace this package: {out}')
    if out == Path(out.anchor) or out == ROOT or ROOT.is_relative_to(out):
        raise ValueError('Choose a dedicated delivery subdirectory, not a filesystem root or project parent')

    # Hash and video inspection happen before creating the output package.
    entries = [{'path': name, 'bytes': path.stat().st_size, 'sha256': sha256(path)} for name, path in sorted(files.items())]
    ffprobe = probe_video(video)
    final_video_sha = sha256(video)
    manifest = {
        'schema': 'rainbow-science-video-delivery-v4', 'version': 'v4',
        'created': datetime.now(timezone(timedelta(hours=8))).isoformat(),
        'title': '浙江大学·海洋新能源', 'episode': '第一期 海洋风电总览',
        'video': {'file': video.name, 'sha256': final_video_sha, 'ffprobe': ffprobe},
        'qa': {'evidence': ['qa/' + p.name for p in qa_paths],
               'note': 'Evidence is supplied by the final reviewer; packaging itself does not certify subjective visual or audio quality.'},
        'fallback': {'path': str(fallback), 'exists': fallback.is_file(),
                     'sha256': sha256(fallback) if fallback.is_file() else None,
                     'policy': 'Retained at original location; not copied into V4 delivery or source ZIP.'},
        'sources': {'zip': 'source-v4.zip', 'files': entries},
        'waterpro': {'provenance': 'public/vendor/waterpro/provenance.json',
                     'license': 'public/vendor/waterpro/LICENSE.md',
                     'commercialRuntimeExtraFiles': extra_meta,
                     'note': 'Only inspected runtime dependencies are archived. Do not infer full commercial FFT/SSR/WebGPU from adapter use.'},
        'scientificBoundary': 'Original educational turbine/campus/foundation geometry; not official Zhejiang University CAD, site design, CFD, FEM or engineering certification.',
        'rights': 'Private user recovery archive. Music, branding and licensed vendor assets retain their original rights; archive inclusion is not permission for public redistribution.',
        'externalTools': {'Blender': 'D:/blender/blender.exe', 'TTS': 'D:/python_project/tts',
                          'browser': 'Set CHROME_PATH for scripts/render.mjs on another workstation',
                          'npm': 'Run npm ci using the included package-lock.json; node_modules omitted'},
    }
    out.mkdir(parents=True, exist_ok=True)
    archive_tmp = out / 'source-v4.zip.tmp'
    with zipfile.ZipFile(archive_tmp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
        for name, path in sorted(files.items()):
            archive.write(path, name)
        archive.writestr('delivery/source-file-hashes.json', json.dumps(entries, ensure_ascii=False, indent=2))
    with zipfile.ZipFile(archive_tmp) as archive:
        error = archive.testzip()
        if error:
            raise ValueError(f'ZIP CRC verification failed: {error}')
    archive_tmp.replace(out / 'source-v4.zip')
    manifest['sources']['zipSha256'] = sha256(out / 'source-v4.zip')
    if video.resolve() != (out / video.name).resolve():
        shutil.copy2(video, out / video.name)
    shutil.copy2(ROOT / 'public/audio/subtitles.srt', out / 'subtitles.srt')
    draft = ROOT / 'research/iterations/v4/交付说明草稿.md'
    if draft.exists():
        shutil.copy2(draft, out / '交付说明.md')
    (out / 'delivery-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps({**summary, 'videoSha256': final_video_sha, 'zipSha256': manifest['sources']['zipSha256'],
                      'zipCRC': 'passed', 'fallbackCopied': False}, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    try:
        raise SystemExit(main())
    except (ValueError, FileNotFoundError, FileExistsError, subprocess.CalledProcessError) as error:
        print(f'PACKAGE_ERROR: {error}', file=sys.stderr)
        raise SystemExit(1)
