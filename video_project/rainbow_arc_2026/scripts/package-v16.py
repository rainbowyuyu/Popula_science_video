"""V16 incremental recovery, explicitly dependent on the verified V15 ZIP.

Default: inventory and hash checks only. --create needs the completed encoded
checks and a separate actual-video visual review. No inherited junction tree is
copied. --restore-delta verifies both archives and restores into an empty V16
directory, linking inherited public folders to a separate restored V15 base.
This script never cleans existing projects, modifies globals, or bundles keys.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import zipfile
import zlib
from pathlib import Path, PurePosixPath

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT / 'research/iterations/v16/recovery'
BASE_NAME = 'rainbow_arc_V15_recovery_20261012-224601.zip'
BASE_SHA = '65a51970c96d88c21d25ad23d5be982991a3cbc81d3e221d18a9440ab0737676'
DEFAULT_BASE = ROOT.parent / 'rainbow_arc_2026_v15/output-v15/delivery' / BASE_NAME
CHUNK = 4 * 1024 * 1024
RESERVE = 1024 * 1024 * 1024
BLOCK = {'.git', '.claude', '.codex', '.agents', 'node_modules', '__pycache__', 'cache', '.cache', 'bundle'}
BAD_SUFFIX = {'.pyc', '.pyo', '.blend1', '.tmp', '.bak', '.key', '.pem', '.log'}
TEXT = {'.json', '.md', '.txt', '.csv', '.py', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.css', '.html', '.svg', '.ps1', '.tex', '.srt', '.vtt', '.yaml', '.yml', '.jsonl'}
SECRET = [
    ('provider-key', re.compile(rb'(?<![A-Za-z0-9])sk-(?:sp-)?[A-Za-z0-9_.-]{24,}')),
    ('github-token', re.compile(rb'(?:gh[pousr]_[A-Za-z0-9]{24,}|github_pat_[A-Za-z0-9_]{30,})')),
    ('private-key', re.compile(rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----')),
    ('literal-bearer', re.compile(rb'\bBearer[ \t]+[A-Za-z0-9_.+/=-]{24,}')),
    ('signed-url', re.compile(rb'[?&](?:X-Amz-Signature|OSSAccessKeyId|Signature|access_token|api_key|token)=[A-Za-z0-9%_.+/=-]{12,}', re.I)),
]


def jd(value):
    return (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf8')


def load(path):
    return json.loads(Path(path).read_text('utf8'))


def safe_member(value):
    value = str(value).replace('\\', '/')
    p = PurePosixPath(value)
    if not value or p.is_absolute() or '..' in p.parts or ':' in value or value != p.as_posix():
        raise RuntimeError('Unsafe archive path: ' + value)
    if any(x.casefold() in BLOCK or x.casefold().startswith('.env') for x in p.parts):
        raise RuntimeError('Blocked archive path: ' + value)
    if p.suffix.casefold() in BAD_SUFFIX:
        raise RuntimeError('Blocked archive suffix: ' + value)
    return value


def scan(name, payload):
    for rule, pattern in SECRET:
        if pattern.search(payload):
            raise RuntimeError('Sensitive content rejected in ' + name + ' [' + rule + ']; matched value not logged')
    if Path(name).suffix.casefold() == '.json':
        def walk(value):
            if isinstance(value, dict):
                for k, v in value.items():
                    if re.fullmatch(r'(?:api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|secret[_-]?key|password|authorization|credential)', k, re.I) and isinstance(v, str) and v.strip() and v.lower() not in {'redacted', 'placeholder', 'undefined'}:
                        raise RuntimeError('Sensitive JSON field rejected in ' + name + '; value not logged')
                    walk(v)
            elif isinstance(value, list):
                for v in value:
                    walk(v)
        walk(json.loads(payload))


def digest_stream(stream):
    h = hashlib.sha256(); crc = 0; size = 0
    for chunk in iter(lambda: stream.read(CHUNK), b''):
        h.update(chunk); crc = zlib.crc32(chunk, crc); size += len(chunk)
    return h.hexdigest(), f'{crc & 0xffffffff:08x}', size


def digest(path):
    path = Path(path); before = path.stat()
    with path.open('rb') as f:
        result = digest_stream(f)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError('Source changed during hashing: ' + path.name)
    return result


def reparse(path):
    return bool(getattr(Path(path).lstat(), 'st_file_attributes', 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT) or Path(path).is_symlink()


def ordinary_files(directory):
    if not directory.is_dir():
        return
    if reparse(directory):
        raise RuntimeError('Refusing to walk an inherited/reparse tree: ' + str(directory))
    for item in sorted(directory.iterdir()):
        if item.name.casefold() in BLOCK or item.name.casefold().startswith('.env') or reparse(item):
            continue
        if item.is_dir():
            yield from ordinary_files(item)
        elif item.is_file() and item.suffix.casefold() not in BAD_SUFFIX:
            yield item


def output_root():
    locator = ROOT / 'work/output-root-v16.json'
    value = Path(load(locator)['outputRoot']) if locator.is_file() else Path('output-v16')
    return value if value.is_absolute() else ROOT / value


def base_archive(path):
    path = Path(path).resolve(strict=True)
    sha, crc, size = digest(path)
    if sha != BASE_SHA:
        raise RuntimeError('V15 dependency archive SHA256 differs from the verified base')
    with zipfile.ZipFile(path) as z:
        if len(z.namelist()) != len(set(z.namelist())):
            raise RuntimeError('Duplicate V15 archive member')
        manifest = json.loads(z.read('manifest-v15.json'))
        if manifest.get('version') != 'V15' or manifest.get('status') != 'QA-approved-recovery-manifest':
            raise RuntimeError('V15 dependency archive is not the accepted recovery package')
        entries = {safe_member(x['member']): x for x in manifest['entries']}
        for name in z.namelist():
            safe_member(name)
    return {'file': str(path), 'filename': path.name, 'sha256': sha, 'bytes': size,
            'status': manifest['status'], 'archiveMemberCount': len(entries) + 1}, entries


def inventory(base_path):
    base, base_entries = base_archive(base_path)
    audit_path = ROOT / 'research/qa-v16/audit-v16.json'
    audit = load(audit_path)
    selected = {}; inherited = []; mappings = {}; inherited_original = []

    def add(path, role, member=None, expected=None):
        path = Path(path)
        if not path.is_file():
            raise RuntimeError('Required recovery input missing: ' + str(path))
        member = safe_member(member or path.relative_to(ROOT).as_posix())
        sha, crc, size = digest(path)
        if expected and sha != expected:
            raise RuntimeError('Expected recovery hash mismatch: ' + member)
        if path.suffix.casefold() in TEXT:
            scan(member, path.read_bytes())
        old = selected.get(member)
        if old and old['sha256'] != sha:
            raise RuntimeError('Conflicting recovery member: ' + member)
        selected[member] = {'member': member, 'source': str(path), 'sha256': sha, 'crc32': crc, 'bytes': size, 'role': role}

    for item in (ROOT / 'public').iterdir():
        if item.is_dir() and reparse(item):
            inherited_original.append({'folder': item.name, 'originalResolvedTarget': str(item.resolve()), 'access': 'read-only'})
    for row in audit.get('sourceHashes', []):
        rel = safe_member(row['file'])
        p = ROOT / rel
        if rel.startswith('public/') and not rel.startswith('public/assets_v16/'):
            pieces = PurePosixPath(rel).parts
            if len(pieces) < 3 or not reparse(ROOT / 'public' / pieces[1]):
                raise RuntimeError('Unexpected inherited asset mapping: ' + rel)
            sha, crc, size = digest(p)
            if sha != row['sha256']:
                raise RuntimeError('Current audit input is stale: ' + rel)
            mappings[pieces[1]] = {'folder': pieces[1], 'restoredBaseRelative': 'public/' + pieces[1],
                                    'originalResolvedTarget': str((ROOT / 'public' / pieces[1]).resolve())}
            original = base_entries.get(rel)
            if original and original['sha256'] == sha and original['bytes'] == size:
                dependency = {'file': rel, 'sha256': sha, 'crc32': crc, 'bytes': size, 'origin': 'V15-base-archive', 'baseMember': rel}
            elif original:
                raise RuntimeError('V15 base contains a different inherited dependency: ' + rel)
            else:
                # A tiny exact inherited helper absent from the V15 portable
                # closure is stored once as an explicit supplemental file.
                fallback = 'recovery/inherited-fallback/' + rel
                add(p, 'Exact-required-inherited-file-absent-from-V15-base', fallback, sha)
                dependency = {'file': rel, 'sha256': sha, 'crc32': crc, 'bytes': size, 'origin': 'V16-supplement', 'deltaMember': fallback}
            inherited.append(dependency)
        else:
            add(p, 'Exact-current-render-gate-input', expected=row['sha256'])
    if not inherited:
        raise RuntimeError('No inherited closure found; an incremental package cannot silently become self-contained')
    for name in ['package.json', 'package-lock.json', 'tsconfig.json']:
        add(ROOT / name, 'V16-package-config')
    for folder in ['src', 'public/assets_v16', 'research/iterations/v16', 'research/physics/v16', 'research/qa-v16']:
        for p in ordinary_files(ROOT / folder):
            if p.is_relative_to(RESEARCH):
                continue
            add(p, 'V16-new-source-assets-or-original-evidence')
    for p in (ROOT / 'research').glob('*v16*'):
        if p.is_file() and not reparse(p):
            add(p, 'Original-V16-generation-or-research-specification')
    for p in ordinary_files(ROOT / 'scripts'):
        if 'v16' in p.name.lower() or p.name in {'finalize-audio-v15.mjs', 'build_formulas.py'}:
            add(p, 'V16-authoring-render-validation-tool')
    for p in ordinary_files(output_root() / 'delivery'):
        if p.suffix.casefold() in {'.mp4', '.srt', '.md', '.jpg', '.json', '.png'} and 'recovery' not in p.name.lower():
            add(p, 'Actual-current-delivery', 'output-v16/delivery/' + p.relative_to(output_root() / 'delivery').as_posix())
    # Provider originals and submitted images remain evidence even if rejected;
    # raw decoded caches and browser/bundle work are deliberately not selected.
    generated = output_root() / 'work/qwen-v16/generated'
    if generated.is_dir():
        for task in sorted(generated.iterdir()):
            if not task.is_dir() or reparse(task):
                continue
            for name in ['provenance.json', 'provider.mp4', 'reference-first.png', 'reference-last.png',
                         'visual-acceptance.json', 'contact.jpg', 'dense-contact.jpg', 'inspection-contact.jpg', 'inspection-evidence.json']:
                p = task / name
                if p.is_file():
                    add(p, 'Original-V16-Qwen-attempt-evidence-not-implied-acceptance',
                        'output-v16/work/qwen-v16/generated/' + task.name + '/' + name)
    for name in ['batch-latest.json', 'credential-probe-latest.json', 'integration-fragment.json']:
        p = output_root() / 'work/qwen-v16' / name
        if p.is_file():
            add(p, 'Original-safe-V16-provider-batch-record', 'output-v16/work/qwen-v16/' + name)
    for p in ordinary_files(output_root() / 'work/qwen-v16/inputs'):
        if p.suffix.casefold() in {'.png', '.jpg', '.jpeg'}:
            add(p, 'Exact-original-submitted-V16-endpoint', 'output-v16/work/qwen-v16/inputs/' + p.name)
    rows = sorted(selected.values(), key=lambda x: x['member'])
    return {'version': 'V16', 'schema': 'rainbow.v16.incremental-recovery/1', 'status': 'candidate-inventory',
            'createdUTC': dt.datetime.now(dt.timezone.utc).isoformat(), 'selfContained': False,
            'baseDependency': base, 'sourceAuditSnapshot': {'sha256': digest(audit_path)[0], 'passed': audit.get('passed'), 'version': audit.get('version')},
            'inheritedMappings': sorted(mappings.values(), key=lambda x: x['folder']), 'originalJunctions': inherited_original,
            'inheritedRequiredFiles': inherited, 'entries': rows, 'fileCount': len(rows),
            'sourceBytes': sum(x['bytes'] for x in rows), 'inheritedBytesNotDuplicated': sum(x['bytes'] for x in inherited if x['origin'] == 'V15-base-archive'),
            'estimatedZipUpperBoundBytes': sum(x['bytes'] for x in rows) + len(rows) * 2048 + 4 * CHUNK,
            'privateRecoveryOnly': True, 'mutatesOriginalSources': False, 'cleansAnything': False,
            'limits': ['Requires the exact verified V15 archive or an exact restored V15 dependency tree.',
                       'No node_modules, browser executable, Blender installation, global TTS installation, credentials or unrelated library samples.',
                       'Still/CPU checks never imply full normal-speed video or audio review. Original evidence scope and failed attempts are preserved.']}


def gate(qa_path, visual_path, inv):
    qa = load(qa_path); visual = load(visual_path)
    audit_path = ROOT / 'research/qa-v16/audit-v16.json'; audit = load(audit_path)
    render_path = ROOT / 'research/qa-v16/render-start-v16.json'; render = load(render_path)
    if audit.get('version') != 'V16' or audit.get('passed') is not True or audit.get('errors') != []:
        raise RuntimeError('Current V16 source audit has not passed')
    audit_sha = digest(audit_path)[0]
    for row in audit['sourceHashes']:
        if digest(ROOT / safe_member(row['file']))[0] != row['sha256']:
            raise RuntimeError('Source changed after V16 audit: ' + row['file'])
    if qa.get('version') != 'V16' or qa.get('passed') is not True or qa.get('errors') != [] or qa.get('encodedFullDecodePassed') is not True or qa.get('completeDecode', {}).get('passed') is not True:
        raise RuntimeError('Completed V16 encoded/decode checks have not passed')
    video = Path(qa['video']).resolve(strict=True); movie_sha, crc, size = digest(video)
    if qa.get('videoSHA256') != movie_sha or qa.get('sourceAudit', {}).get('sha256') != audit_sha:
        raise RuntimeError('Encoded QA does not bind the current movie/source audit')
    if render.get('version') != 'V16' or render.get('status') != 'completed' or render.get('videoSHA256') != movie_sha or render.get('sourceAuditSHA256') != audit_sha or Path(render.get('output', '')).resolve() != video:
        raise RuntimeError('Completed render record does not bind the actual movie/source audit')
    visual_sha = visual.get('videoSHA256') or visual.get('video', {}).get('sha256') or visual.get('finalVideo', {}).get('sha256')
    if visual.get('version') != 'V16' or visual_sha != movie_sha or visual.get('visualReviewApproved') is not True or visual.get('status') != 'pass' or visual.get('errors', []) != []:
        raise RuntimeError('Separate actual-video visual review is incomplete or binds another movie')
    if visual.get('sourceAuditSHA256') is not None and visual['sourceAuditSHA256'] != audit_sha:
        raise RuntimeError('Visual review source audit binding is stale')
    if not any(x['sha256'] == movie_sha for x in inv['entries']):
        raise RuntimeError('Accepted movie is absent from the delta selection')
    return {'video': str(video), 'sha256': movie_sha, 'bytes': size, 'crc32': crc,
            'sourceAuditSHA256': audit_sha, 'encodedQA': {'file': str(Path(qa_path)), 'sha256': digest(qa_path)[0]},
            'visualReview': {'file': str(Path(visual_path)), 'sha256': digest(visual_path)[0]},
            'scope': visual.get('scope'), 'normalSpeedPlayback': visual.get('normalSpeedPlayback', visual.get('humanNormalSpeedPlayback', False)),
            'audioListening': visual.get('audioListening', visual.get('humanListening', False))}


def check_space(folder, needed):
    folder.mkdir(parents=True, exist_ok=True)
    available = shutil.disk_usage(folder).free
    if available < needed + RESERVE:
        raise RuntimeError(f'Insufficient free space: {available} bytes, need {needed} plus {RESERVE} reserve')
    return available


def verify_zip(path, records):
    expected = {x['member']: x for x in records}
    with zipfile.ZipFile(path) as z:
        if len(z.namelist()) != len(expected) or set(z.namelist()) != set(expected):
            raise RuntimeError('ZIP member set differs from the recovery manifest')
        for item in z.infolist():
            safe_member(item.filename)
            with z.open(item) as stream:
                sha, crc, size = digest_stream(stream)
            row = expected[item.filename]
            if (sha, crc, size) != (row['sha256'], row['crc32'], row['bytes']) or item.CRC != int(crc, 16):
                raise RuntimeError('ZIP member SHA/CRC failure: ' + item.filename)
    return {'allMemberSHA256Passed': True, 'allMemberCRC32Passed': True, 'memberCount': len(expected)}


def create(inv, qa_path, visual_path):
    accepted = gate(qa_path, visual_path, inv)
    generated = {'work/output-root-v16.json': jd({'version': 'V16', 'outputRoot': 'output-v16'})}
    renderer = (ROOT / 'scripts/render-v16.mjs').read_text('utf8')
    old = "const installed=path.resolve(root,'..','rainbow_arc_2026_v10','work','render-browser-v10','chrome-headless-shell.exe');"
    if renderer.count(old) != 1:
        raise RuntimeError('Production browser locator changed; portable adaptation needs review')
    generated['scripts/render-v16-portable.mjs'] = renderer.replace(old, 'const installed=process.env.RAINBOW_BROWSER_EXECUTABLE||undefined;').encode('utf8')
    guide = ROOT / 'research/iterations/v16/RESTORE_V16_DELTA.md'
    generated['RESTORE_V16_DELTA.md'] = guide.read_bytes()
    records = list(inv['entries'])
    for member, payload in generated.items():
        scan(member, payload)
        records.append({'member': member, 'sha256': hashlib.sha256(payload).hexdigest(), 'crc32': f'{zlib.crc32(payload) & 0xffffffff:08x}', 'bytes': len(payload), 'role': 'Generated-explicit-portable-restoration-support'})
    manifest = {**inv, 'status': 'verified-dependencies-and-QA-approved-incremental-recovery', 'acceptedVideo': accepted,
                'entries': records, 'portableRenderer': 'scripts/render-v16-portable.mjs',
                'portableAdaptation': 'Separate portable renderer changes only browser discovery; exact production renderer is preserved unchanged.'}
    payload = jd(manifest); scan('manifest-v16-delta.json', payload)
    manifest_record = {'member': 'manifest-v16-delta.json', 'sha256': hashlib.sha256(payload).hexdigest(), 'crc32': f'{zlib.crc32(payload) & 0xffffffff:08x}', 'bytes': len(payload)}
    delivery = output_root() / 'delivery'; check_space(delivery, inv['estimatedZipUpperBoundBytes'] + len(payload))
    timestamp = dt.datetime.now().strftime('%Y%m%d-%H%M%S')
    final = delivery / ('rainbow_arc_V16_delta_recovery_' + timestamp + '.zip')
    partial = final.with_suffix('.zip.partial')
    if partial.exists() or final.exists():
        raise RuntimeError('Recovery output already exists; refusing to overwrite')
    with zipfile.ZipFile(partial, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=5, allowZip64=True) as z:
        for row in inv['entries']:
            source = Path(row['source']); h = hashlib.sha256(); crc = 0; size = 0
            with source.open('rb') as stream, z.open(row['member'], 'w', force_zip64=True) as dest:
                for chunk in iter(lambda: stream.read(CHUNK), b''):
                    dest.write(chunk); h.update(chunk); crc = zlib.crc32(chunk, crc); size += len(chunk)
            if (h.hexdigest(), f'{crc & 0xffffffff:08x}', size) != (row['sha256'], row['crc32'], row['bytes']):
                raise RuntimeError('Source changed during ZIP creation: ' + row['member'])
        for member, data in generated.items():
            z.writestr(member, data)
        z.writestr('manifest-v16-delta.json', payload)
    verification = verify_zip(partial, records + [manifest_record])
    partial.rename(final)
    result = {'version': 'V16', 'status': 'verified-incremental-recovery', 'selfContained': False,
              'archive': str(final), 'sha256': digest(final)[0], 'bytes': final.stat().st_size,
              'requiredBaseSHA256': BASE_SHA, 'verification': verification, 'deletedFiles': 0}
    (RESEARCH / 'package-result-v16.json').write_bytes(jd(result))
    return result


def safe_extract(z, target):
    target = target.resolve()
    for info in z.infolist():
        name = safe_member(info.filename); destination = target / name
        if not destination.resolve().is_relative_to(target):
            raise RuntimeError('Extraction escapes destination: ' + name)
        if info.is_dir() or (info.external_attr >> 16) & 0o170000 == 0o120000:
            raise RuntimeError('Unexpected ZIP directory/symlink: ' + name)
        if destination.exists():
            raise RuntimeError('Refusing to overwrite existing restore member: ' + name)
    for info in z.infolist():
        destination = target / safe_member(info.filename); destination.parent.mkdir(parents=True, exist_ok=True)
        with z.open(info) as source, destination.open('xb') as out:
            shutil.copyfileobj(source, out, CHUNK)


def restore(delta, base_path, destination, base_directory):
    destination = Path(destination).resolve(); base_directory = Path(base_directory).resolve()
    if destination == base_directory or destination.is_relative_to(base_directory) or base_directory.is_relative_to(destination):
        raise RuntimeError('V16 destination and V15 base must be separate sibling directories')
    if destination.exists() and any(destination.iterdir()):
        raise RuntimeError('V16 restore destination must be absent or empty')
    base, _ = base_archive(base_path)
    with zipfile.ZipFile(delta) as dz:
        manifest = json.loads(dz.read('manifest-v16-delta.json'))
        if manifest.get('version') != 'V16' or manifest.get('selfContained') is not False or manifest.get('baseDependency', {}).get('sha256') != BASE_SHA or manifest.get('status') != 'verified-dependencies-and-QA-approved-incremental-recovery':
            raise RuntimeError('Delta dependency identity/status is invalid')
        mp = dz.read('manifest-v16-delta.json')
        record = {'member': 'manifest-v16-delta.json', 'sha256': hashlib.sha256(mp).hexdigest(), 'crc32': f'{zlib.crc32(mp) & 0xffffffff:08x}', 'bytes': len(mp)}
    verify_zip(delta, manifest['entries'] + [record])
    fresh_base = not base_directory.exists() or not any(base_directory.iterdir())
    if fresh_base:
        with zipfile.ZipFile(base['file']) as bz:
            check_space(base_directory, sum(x.file_size for x in bz.infolist()))
            safe_extract(bz, base_directory)
    for row in manifest['inheritedRequiredFiles']:
        p = base_directory / safe_member(row['file'])
        if row['origin'] == 'V16-supplement' and not p.exists():
            if not fresh_base:
                raise RuntimeError('Existing V15 base lacks the V16 supplement; restore the base to a new empty folder. No existing base was modified.')
            p.parent.mkdir(parents=True, exist_ok=True)
            with zipfile.ZipFile(delta) as dz, dz.open(safe_member(row['deltaMember'])) as source, p.open('xb') as out:
                shutil.copyfileobj(source, out, CHUNK)
        if not p.is_file() or digest(p)[0] != row['sha256']:
            raise RuntimeError('Restored V15 dependency missing/different: ' + row['file'])
    check_space(destination, sum(x['bytes'] for x in manifest['entries']))
    with zipfile.ZipFile(delta) as dz:
        safe_extract(dz, destination)
    (destination / 'public').mkdir(parents=True, exist_ok=True)
    for row in manifest['inheritedMappings']:
        folder = row['folder']; link = destination / 'public' / folder
        if not re.fullmatch(r'[A-Za-z0-9_-]+', folder) or row['restoredBaseRelative'] != 'public/' + folder:
            raise RuntimeError('Unsafe inherited folder mapping')
        target = base_directory / safe_member(row['restoredBaseRelative'])
        if not target.is_dir() or link.exists():
            raise RuntimeError('Unsafe/conflicting restored junction: ' + folder)
        if os.name == 'nt':
            # Fixed validated paths and one native PowerShell filesystem API;
            # no cmd/batch composition, recursive move or deletion.
            ps = "New-Item -ItemType Junction -Path '" + str(link).replace("'", "''") + "' -Target '" + str(target).replace("'", "''") + "' | Out-Null"
            subprocess.run(['powershell.exe', '-NoProfile', '-Command', ps], check=True, capture_output=True)
        else:
            link.symlink_to(target, target_is_directory=True)
    for row in manifest['inheritedRequiredFiles']:
        if digest(destination / row['file'])[0] != row['sha256']:
            raise RuntimeError('Restored inherited hash check failed: ' + row['file'])
    return {'version': 'V16', 'status': 'restored-with-explicit-V15-dependency', 'destination': str(destination), 'baseDirectory': str(base_directory), 'dependenciesChecked': len(manifest['inheritedRequiredFiles']), 'selfContained': False, 'next': 'Run npm ci in restored V16; provide browser/Blender tools separately. Original production paths/QA provenance remain historical.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-archive', type=Path, default=DEFAULT_BASE)
    parser.add_argument('--create', action='store_true')
    parser.add_argument('--qa', type=Path, default=ROOT / 'research/qa-v16/delivery-qa-v16.json')
    parser.add_argument('--visual-review', type=Path, default=ROOT / 'research/qa-v16/final-visual-review-v16.json')
    parser.add_argument('--restore-delta', type=Path)
    parser.add_argument('--destination', type=Path)
    parser.add_argument('--base-directory', type=Path)
    args = parser.parse_args()
    if args.restore_delta:
        if args.create or not args.destination or not args.base_directory:
            parser.error('--restore-delta needs --destination and --base-directory, without --create')
        result = restore(args.restore_delta, args.base_archive, args.destination, args.base_directory)
    else:
        RESEARCH.mkdir(parents=True, exist_ok=True)
        inv = inventory(args.base_archive)
        (RESEARCH / 'candidate-inventory-v16.json').write_bytes(jd(inv))
        result = create(inv, args.qa, args.visual_review) if args.create else {k: inv[k] for k in ['version', 'status', 'selfContained', 'fileCount', 'sourceBytes', 'inheritedBytesNotDuplicated', 'estimatedZipUpperBoundBytes', 'mutatesOriginalSources', 'cleansAnything']}
        if not args.create:
            result.update({'inheritedRequiredFiles': len(inv['inheritedRequiredFiles']), 'supplementalInheritedFiles': [x['file'] for x in inv['inheritedRequiredFiles'] if x['origin'] == 'V16-supplement'], 'inventory': str(RESEARCH / 'candidate-inventory-v16.json'), 'creationQAReady': False})
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('PACKAGE_V16_REJECTED: ' + str(error), file=sys.stderr)
        sys.exit(1)
