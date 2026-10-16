"""Safely remove V08-local retired caches after final QA and recovery verification.

Default: inspect and print a dry-run plan, with no deletion. --apply requires the
actual V08 encode, current source lock and a freshly verified V08 recovery ZIP.
No public assets, hardlinks, junctions, node_modules or sibling episodes are deleted.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import stat
import sys
import zipfile

from package_v08 import PackageError, validate_final_v08_qa, verify_zip

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf8')

ROOT = Path(__file__).resolve().parents[1]
QA = ROOT / 'research/qa'
PROTECTED = ('src', 'public', 'delivery', 'docs', 'node_modules', 'work/opus-runs',
             'research/physics')
ACCEPTED_STILLS = ('research/qa/v08-lock-stills', 'research/qa/v08-final-art-stills',
                   'research/qa/v08-water-final-still', 'research/qa/encoded-frames-v08',
                   'research/qa/encoded-contacts-v08')
BLOCKED_PARTS = {'node_modules', '.git', '.claude', '.codex', '.agents'}
CHUNK = 8 * 1024 * 1024


def digest(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(CHUNK), b''):
            h.update(block)
    return h.hexdigest()


def reparse(path: Path) -> bool:
    s = path.lstat()
    return stat.S_ISLNK(s.st_mode) or bool(getattr(s, 'st_file_attributes', 0) & 0x400)


def safe(relative: str) -> Path:
    rel = Path(relative)
    if rel.is_absolute() or '..' in rel.parts or not rel.parts:
        raise PackageError('Unsafe cleanup relative path')
    if any(part.casefold() in BLOCKED_PARTS for part in rel.parts):
        raise PackageError('Protected directory in cleanup path: ' + rel.as_posix())
    path = Path(os.path.abspath(ROOT / rel))
    if not path.is_relative_to(ROOT) or path == ROOT:
        raise PackageError('Cleanup target escaped episode root')
    current = ROOT
    if reparse(ROOT):
        raise PackageError('Episode root is a reparse point')
    for part in path.relative_to(ROOT).parts:
        current /= part
        if current.exists() and reparse(current):
            raise PackageError('Refusing cleanup junction/symlink: ' + relative)
    if path.exists() and path.resolve() != path:
        raise PackageError('Cleanup target resolved elsewhere: ' + relative)
    return path


def children(path: Path):
    safe(path.relative_to(ROOT).as_posix())
    if path.is_dir():
        if (path / '.git').exists():
            raise PackageError('Refusing cleanup embedded repository')
        for child in sorted(path.iterdir()):
            yield from children(child)
    elif path.is_file():
        yield path


def protected(relative: str) -> bool:
    return any(relative == p or relative.startswith(p + '/')
               for p in PROTECTED + ACCEPTED_STILLS)


def verify_gates() -> tuple[bool, list[str], set[str], dict]:
    missing = []
    expected = ('research/qa/delivery-qa-v08.json',
                'research/qa/render-source-lock-v08.json',
                'delivery/彩虹为什么是弧形_V08_本地可恢复工程.crc-report.json',
                'delivery/彩虹为什么是弧形_V08_本地可恢复工程.manifest.json')
    for rel in expected:
        if not safe(rel).is_file():
            missing.append(rel)
    lock_path = safe('research/qa/render-source-lock-v08.json')
    locked = set(json.loads(lock_path.read_text('utf8')).get('files', {})) if lock_path.is_file() else set()
    if missing:
        return False, missing, locked, {}
    validate_final_v08_qa()
    qa = json.loads(safe(expected[0]).read_text('utf8'))
    report_path = safe(expected[2])
    report = json.loads(report_path.read_text('utf8'))
    manifest_path = safe(expected[3])
    manifest_data = manifest_path.read_bytes()
    manifest = json.loads(manifest_data)
    if report.get('schema') != 'rainbow.v08.zip-crc-report/1':
        raise PackageError('Current V08 CRC report required')
    if not report.get('all_crc_passed') or not report.get('all_sha256_passed'):
        raise PackageError('Recovery CRC/SHA did not pass')
    name = report.get('zip', '')
    if Path(name).name != name or not name.endswith('.zip'):
        raise PackageError('Unsafe recovery ZIP report path')
    package = safe('delivery/' + name)
    if not package.is_file() or digest(package) != report['sha256']:
        raise PackageError('Recovery ZIP changed after CRC verification')
    members = report.get('members', [])
    if len(members) != report.get('member_count') or len({m['path'] for m in members}) != len(members):
        raise PackageError('Recovery CRC member inventory invalid')
    expected_members = {m['path']: {'sha256': m['sha256']} for m in members}
    if expected_members.get('PACKAGE_MANIFEST.json', {}).get('sha256') != hashlib.sha256(manifest_data).hexdigest():
        raise PackageError('Recovery manifest sidecar differs from verified ZIP')
    for rel in expected[:2]:
        if expected_members.get(rel, {}).get('sha256') != digest(safe(rel)):
            raise PackageError('Recovery ZIP contains a different final QA/source lock')
    if manifest.get('schema') != 'rainbow.v08.local-user-project-package/1' or manifest.get('facts', {}).get('video_version') != 'V08':
        raise PackageError('Actual V08 recovery manifest required')
    # Reopen and decompress every member now, rather than trusting old flags.
    fresh = verify_zip(package, expected_members)
    if fresh['sha256'] != report['sha256']:
        raise PackageError('Recovery ZIP mutated during revalidation')
    protected_files = locked | {m['path'] for m in members}
    return True, [], protected_files, {
        'videoSHA256': qa['sha256'], 'renderSourceLockSHA256': digest(lock_path),
        'zipSHA256': fresh['sha256'], 'verifiedZipMembers': fresh['member_count'],
        'allCRCAndSHARechecked': True}


def candidates() -> list[str]:
    result = ['tmp', 'work/v08-preview-droplet.mp4', 'work/macro-review-v08',
              'research/qa/v08-first-integration-stills',
              'research/qa/v08-second-integration-stills',
              'research/qa/v08-third-integration-stills']
    # Only copied historical QA inside V08, never the sibling V07/V06 project.
    for path in sorted(QA.iterdir()):
        name = path.name.casefold()
        if 'v07' in name or 'v06' in name or name.endswith('.bundle.mjs'):
            result.append(path.relative_to(ROOT).as_posix())
    for rel in ('work/camera-film-audit-v08', 'work/macro-audit-v08'):
        folder = safe(rel)
        if folder.is_dir():
            for path in sorted(folder.iterdir()):
                if path.is_file() and path.name.endswith('.bundle.mjs'):
                    result.append(path.relative_to(ROOT).as_posix())
    for path in sorted((ROOT / 'work').glob('*.bundle.mjs')):
        result.append(path.relative_to(ROOT).as_posix())
    return sorted(set(result))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Delete eligible files only after final QA and fresh ZIP checks')
    parser.add_argument('--report', help='Optional new JSON report inside research/qa; never overwrite')
    args = parser.parse_args()
    report_output = None
    if args.report:
        report_output = safe(args.report)
        if report_output.parent != QA or report_output.suffix != '.json' or report_output.exists():
            raise PackageError('Cleanup report must be a new JSON directly inside research/qa')
    gates, pending, protect_set, gate_evidence = verify_gates()
    eligible, preserved, roots = [], [], []
    for rel in candidates():
        path = safe(rel)
        if not path.exists():
            continue
        roots.append(path)
        for file in children(path):
            relative = file.relative_to(ROOT).as_posix()
            s = file.stat()
            reason = 'runtime-or-packaged-source' if relative in protect_set else (
                'protected-final-artifact' if protected(relative) else (
                'shared-hardlink' if s.st_nlink > 1 else ''))
            row = {'path': relative, 'bytes': s.st_size, 'mtimeNs': s.st_mtime_ns,
                   'hardLinkCount': s.st_nlink}
            if reason:
                preserved.append(dict(row, reason=reason))
            else:
                eligible.append(row)
    report = {'schema': 'rainbow.v08.cleanup-plan/1', 'version': 'V08',
              'createdUTC': dt.datetime.now(dt.timezone.utc).isoformat(),
              'dryRun': not args.apply, 'readyToApply': gates, 'pendingGates': pending,
              'gateEvidence': gate_evidence, 'eligibleFiles': eligible,
              'eligibleBytes': sum(row['bytes'] for row in eligible),
              'preservedFiles': preserved, 'preservedPrefixes': list(PROTECTED + ACCEPTED_STILLS),
              'deletedFiles': 0}
    if args.apply:
        if not gates:
            raise PackageError('Cleanup remains dry-run: final QA/recovery gates pending')
        # Validate every path again immediately before unlinking, never rmtree.
        for row in eligible:
            p = safe(row['path']); s = p.stat()
            if s.st_nlink != 1 or (s.st_size, s.st_mtime_ns) != (row['bytes'], row['mtimeNs']):
                raise PackageError('Cleanup candidate changed since inspection: ' + row['path'])
        for row in eligible:
            safe(row['path']).unlink()
            report['deletedFiles'] += 1
        for root in roots:
            if root.is_dir():
                directories = [p for p in children_directories(root)]
                for folder in reversed(directories):
                    try:
                        safe(folder.relative_to(ROOT).as_posix()).rmdir()
                    except OSError:
                        pass  # Kept hardlinks, reports or packaged files keep it alive.
        validate_final_v08_qa()
        report['runtimeHashesUnchangedAfterCleanup'] = True
    if report_output:
        with report_output.open('x', encoding='utf8') as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in report.items() if k not in ('eligibleFiles', 'preservedFiles')}, ensure_ascii=False, indent=2))
    print(f"Eligible files: {len(eligible)}; retained files: {len(preserved)}")
    return 0


def children_directories(path: Path):
    safe(path.relative_to(ROOT).as_posix())
    if path.is_dir():
        yield path
        for child in sorted(path.iterdir()):
            if child.is_dir():
                yield from children_directories(child)


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (PackageError, OSError, ValueError, zipfile.BadZipFile) as exc:
        print('CLEANUP REFUSED: ' + str(exc), file=sys.stderr)
        sys.exit(2)
