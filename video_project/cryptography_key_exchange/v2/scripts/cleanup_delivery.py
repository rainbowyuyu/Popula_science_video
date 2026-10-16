"""QA-gated cleanup of exact V2-owned temporary paths. Default: plan only.

No shell commands, no glob deletion, no links/junctions, no root-repo cleanup.
All gates and selected trees are checked again immediately before execution.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
import stat
import sys
import zipfile

ROOT = Path(__file__).absolute().parents[1]
ALLOWLIST = (
    'work/render-temp', 'work/bundle', 'work/master-mux.mp4',
    'work/full-preview.mp4', 'work/opening-pilot.mp4',
    'work/delivery-repaired.mp4', 'work/delivery-repaired-audio.mp4',
    'work/final-sidepass.mp4', 'work/final-flyback.mp4',
    'work/render-before-route-fix.mp4', 'work/recovery-check',
    'work/audio/score.wav', 'work/audio/premaster.wav',
    'work/audio/ducked.wav', 'work/audio/score-ducked.wav', 'work/audio/music-source.wav',
)
DIRECTORIES = {'work/render-temp', 'work/bundle', 'work/recovery-check'}
REPORT = ROOT / 'work/qa/cleanup.json'


def is_reparse(s):
    return stat.S_ISLNK(s.st_mode) or bool(getattr(s, 'st_file_attributes', 0) & 0x400)


def safe_path(p, allow_missing=False):
    p = Path(p).absolute()
    if ROOT.name != 'v2' or ROOT.parent.name != 'cryptography_key_exchange':
        raise RuntimeError('This script is restricted to cryptography_key_exchange/v2')
    try:
        relative = p.relative_to(ROOT)
    except ValueError:
        raise RuntimeError('Path escapes V2') from None
    current = ROOT
    if is_reparse(current.lstat()):
        raise RuntimeError('V2 root is a symlink/junction')
    for component in relative.parts:
        current = current / component
        try:
            s = current.lstat()
        except FileNotFoundError:
            if allow_missing:
                break
            raise RuntimeError('Required path is missing: ' + relative.as_posix()) from None
        if is_reparse(s):
            raise RuntimeError('Symlink/junction rejected: ' + current.relative_to(ROOT).as_posix())
    if not p.resolve(strict=False).is_relative_to(ROOT.resolve(strict=True)):
        raise RuntimeError('Resolved path escapes V2: ' + relative.as_posix())
    return p


def sha(p):
    p = safe_path(p)
    h = hashlib.sha256()
    with p.open('rb') as f:
        for chunk in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def read_json(relative):
    p = safe_path(ROOT / relative)
    if not p.is_file():
        raise RuntimeError('Expected JSON file: ' + relative)
    return json.loads(p.read_text(encoding='utf-8-sig'))


def fingerprint(p):
    s = safe_path(p).lstat()
    return {'size': s.st_size, 'mtimeNs': s.st_mtime_ns, 'device': s.st_dev, 'inode': s.st_ino}


def validated_tree(p):
    """Visit every child with lstat before descent; never follow a reparse point."""
    p = safe_path(p)
    s = p.lstat()
    if stat.S_ISREG(s.st_mode):
        return [p], []
    if not stat.S_ISDIR(s.st_mode):
        raise RuntimeError('Non-file/directory input rejected: ' + str(p))
    files, dirs = [], [p]
    for child in sorted(p.iterdir(), key=lambda x: x.name):
        f, d = validated_tree(child)
        files.extend(f)
        dirs.extend(d)
    return files, dirs


def gates():
    encoded = read_json('work/qa/encoded-final.json')
    sync = read_json('work/qa/av-sync.json')
    visual = read_json('work/qa/visual-final.json')
    if encoded.get('passed') is not True or sync.get('passed') is not True:
        raise RuntimeError('Encoded and A/V sync QA must both pass')
    if visual.get('representativeEncodedReviewCompleted') is not True:
        raise RuntimeError('Representative encoded visual review is incomplete')
    video = safe_path(ROOT / 'delivery/密码学_让小偷送秘密_1080p.mp4')
    for label, report in [('encoded', encoded), ('sync', sync)]:
        reported = Path(report.get('video', ''))
        if not reported.is_absolute():
            reported = ROOT / reported
        if safe_path(reported).resolve() != video.resolve():
            raise RuntimeError(label + ' QA refers to a different video')
    before = fingerprint(video)
    digest = sha(video)
    visual_digest = visual.get('sha256') or visual.get('videoSha256')
    if digest != encoded.get('sha256') or digest != visual_digest:
        raise RuntimeError('Current final video SHA does not match encoded and visual QA')
    if before['size'] != encoded.get('bytes') or before['size'] != sync.get('fileBytes'):
        raise RuntimeError('Current final video size differs from QA')
    if before['mtimeNs'] != sync.get('fileMtimeNs'):
        raise RuntimeError('Final video changed after sync QA')
    if sha(ROOT / 'public/audio/master.wav') != sync.get('masterSha256'):
        raise RuntimeError('Frozen audio master changed after sync QA')
    delivery = safe_path(ROOT / 'delivery')
    archives = [p for p in delivery.iterdir() if p.name.startswith('工程恢复包_') and p.suffix.lower() == '.zip']
    if len(archives) != 1:
        raise RuntimeError('Exactly one delivery/工程恢复包_*.zip is required; found ' + str(len(archives)))
    archive = safe_path(archives[0])
    verify_path = archive.with_suffix('.verification.json')
    verification = read_json(verify_path.relative_to(ROOT).as_posix())
    if verification.get('allEntryCRCAndSHA256Verified') is not True:
        raise RuntimeError('Recovery ZIP lacks successful CRC/SHA verification')
    archive_before = fingerprint(archive)
    archive_sha = sha(archive)
    if archive_sha != verification.get('sha256') or archive_before['size'] != verification.get('bytes'):
        raise RuntimeError('Recovery ZIP changed after its verified build')
    if verification.get('qaGate', {}).get('finalVideoSha256') != digest:
        raise RuntimeError('Recovery ZIP was not built for the current verified final video')
    with zipfile.ZipFile(archive) as z:
        if z.testzip() is not None:
            raise RuntimeError('Recovery ZIP CRC verification failed')
        names = z.namelist()
        if len(names) != len(set(names)):
            raise RuntimeError('Recovery ZIP contains duplicate entries')
        manifests = [n for n in names if n.endswith('/恢复清单.json')]
        if len(manifests) != 1:
            raise RuntimeError('Recovery ZIP must contain exactly one recovery inventory')
        manifest = json.loads(z.read(manifests[0]))
        if manifest.get('qaGate', {}).get('finalVideoSha256') != digest:
            raise RuntimeError('Recovery inventory refers to a different final video')
    if fingerprint(archive) != archive_before or fingerprint(video) != before:
        raise RuntimeError('Protected final video or recovery ZIP changed during gate checks')
    return {'passed': True, 'video': str(video), 'videoSha256': digest, 'videoFingerprint': before,
            'recoveryZip': str(archive), 'recoveryZipSha256': archive_sha, 'recoveryZipFingerprint': archive_before,
            'crcVerifiedNow': True, 'representativeEncodedReviewCompleted': True}


def plan(final_digest=None):
    rows, all_files, all_dirs = [], {}, set()
    for relative in ALLOWLIST:
        p = safe_path(ROOT / relative, allow_missing=True)
        try:
            s = p.lstat()
        except FileNotFoundError:
            rows.append({'path': relative, 'status': 'absent', 'bytes': 0, 'files': 0})
            continue
        if (relative in DIRECTORIES) != stat.S_ISDIR(s.st_mode):
            raise RuntimeError('Allowlisted path has unexpected type: ' + relative)
        files, dirs = validated_tree(p)
        size = sum(f.stat().st_size for f in files)
        status = 'eligible'
        if relative == 'work/master-mux.mp4':
            if not final_digest:
                status = 'preserved-until-final-sha-verified'
            elif sha(p) != final_digest:
                status = 'preserved-sha-differs-from-final'
        rows.append({'path': relative, 'absolutePath': str(p), 'status': status, 'bytes': size, 'files': len(files)})
        if status == 'eligible':
            all_files.update({f: fingerprint(f) for f in files})
            all_dirs.update(dirs)
    return rows, all_files, all_dirs


def write_report(report):
    safe_path(REPORT.parent)
    safe_path(REPORT, allow_missing=True)
    temporary = REPORT.with_suffix('.json.tmp')
    safe_path(temporary, allow_missing=True)
    temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(REPORT)


def execute():
    gate = gates()
    rows, files, dirs = plan(gate['videoSha256'])
    # Fresh full gates and tree inventory immediately before the first unlink.
    fresh_gate = gates()
    fresh_rows, fresh_files, fresh_dirs = plan(fresh_gate['videoSha256'])
    if gate != fresh_gate or rows != fresh_rows or files != fresh_files or dirs != fresh_dirs:
        raise RuntimeError('Protected inputs or cleanup tree changed during recheck')
    report = {'startedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'mode': 'execute', 'root': str(ROOT),
              'gates': gate, 'allowlist': list(ALLOWLIST), 'plan': rows, 'deletedFiles': [], 'removedDirectories': [],
              'actualDeletedBytes': 0, 'completed': False, 'errors': []}
    try:
        for p in sorted(files, key=lambda x: x.as_posix()):
            if fingerprint(p) != files[p]:
                raise RuntimeError('File changed before deletion: ' + p.relative_to(ROOT).as_posix())
            size = p.stat().st_size
            p.unlink()
            report['deletedFiles'].append({'path': p.relative_to(ROOT).as_posix(), 'bytes': size})
            report['actualDeletedBytes'] += size
        for p in sorted(dirs, key=lambda x: len(x.parts), reverse=True):
            safe_path(p)
            p.rmdir()  # Fails instead of deleting any file created after the scan.
            report['removedDirectories'].append(p.relative_to(ROOT).as_posix())
        report['completed'] = True
    except (OSError, RuntimeError, ValueError) as exc:
        report['errors'].append(str(exc))
        raise
    finally:
        report['finishedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
        write_report(report)
        print(json.dumps({'completed': report['completed'], 'actualDeletedBytes': report['actualDeletedBytes'],
                          'deletedFiles': len(report['deletedFiles']), 'removedDirectories': len(report['removedDirectories']),
                          'report': str(REPORT), 'errors': report['errors']}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--plan', action='store_true', help='Read-only plan (default)')
    action.add_argument('--execute', action='store_true', help='Recheck all gates and delete exact allowlist')
    args = parser.parse_args()
    if args.execute:
        execute()
        return
    try:
        gate = gates()
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as exc:
        gate = {'passed': False, 'reason': str(exc)}
    rows, files, _ = plan(gate.get('videoSha256'))
    print(json.dumps({'mode': 'plan-only; no deletion or report write', 'gates': gate, 'paths': rows,
                      'eligibleFiles': len(files), 'eligibleBytes': sum(f['size'] for f in files.values()),
                      'executionAllowed': gate['passed'], 'preservation': 'All unlisted paths, source, models, QA, raw/clean/master/narration, v1 and other projects are retained.'}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
