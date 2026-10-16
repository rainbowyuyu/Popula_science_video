"""Plan deletion of explicitly named V09 build caches; never run by default.

--apply requires current final encode/source QA, a freshly decompressed CRC/SHA
verified private recovery ZIP, and restored GPU preference plus no running task
browser. It unlinks checked task files individually and removes only emptied
D: task-browser directories with checked Path.rmdir; no rmtree, shell deletion,
directory junction traversal, or deletion of original assets/review evidence.
The previously refused D: failed-preview directories are deliberately excluded.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import zipfile

from package_v09 import (PackageError, output_root, safe_output_path,
                         validate_final_v09_qa, choose_entries)
from package_v08 import verify_zip
from v09_inventory import ROOT

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf8')

EXPECTED_OUTPUT = Path('C:/Users/zju/.codex/visualizations/2026/10/02/01a0fc88-2a0a-7d81-86a9-bfe4cdd86204/rainbow_arc_v09')
QA = ROOT / 'research/qa'
CACHE_DIRS = ('work/bundle', 'work/observer-review/bundle', 'work/render-temp-v09')
TEMP_FILES = ('work/render-media-v09.tmp.mp4', 'work/render-media-v09.tmp.wav')
BROWSER_DIR = 'work/render-browser-v09'
FORBIDDEN_PARTS = {'node_modules', '.git', '.claude', '.agents'}
CHUNK = 8 * 1024 * 1024


def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(CHUNK), b''):
            h.update(block)
    return h.hexdigest()


def reparse(path):
    value = path.lstat()
    return stat.S_ISLNK(value.st_mode) or bool(getattr(value, 'st_file_attributes', 0) & 0x400)


def checked(path, boundary):
    """Check lexical parents before resolve, so links are never traversed."""
    path = Path(os.path.abspath(path))
    boundary = Path(os.path.abspath(boundary))
    try:
        rel = path.relative_to(boundary)
    except ValueError as exc:
        raise PackageError('Cleanup target escaped its named boundary') from exc
    if not rel.parts or '..' in rel.parts or any(p.casefold() in FORBIDDEN_PARTS for p in rel.parts):
        raise PackageError('Protected or empty cleanup path')
    if not boundary.is_dir() or reparse(boundary):
        raise PackageError('Cleanup boundary missing or linked')
    current = boundary
    for part in rel.parts:
        current /= part
        if current.exists() and reparse(current):
            raise PackageError('Refusing cleanup junction/symlink: ' + str(path))
    if path.resolve(strict=False) != path:
        raise PackageError('Cleanup path resolves elsewhere: ' + str(path))
    return path


def allowed(path):
    output = output_root()
    if output != EXPECTED_OUTPUT:
        raise PackageError('Cleanup is limited to the original named V09 production output root')
    path = Path(os.path.abspath(path))
    if path.is_relative_to(output):
        rel = path.relative_to(output).as_posix()
        if not any(rel == r or rel.startswith(r + '/') for r in CACHE_DIRS) and rel not in TEMP_FILES:
            raise PackageError('C: target is outside the exact cache allowlist')
        return checked(path, output), 'C-cache'
    if path.is_relative_to(ROOT):
        rel = path.relative_to(ROOT).as_posix()
        if rel != BROWSER_DIR and not rel.startswith(BROWSER_DIR + '/'):
            raise PackageError('D: target is outside the task browser allowlist')
        return checked(path, ROOT), 'D-task-browser-copy'
    raise PackageError('Cleanup target outside both V09 allowlists')


def walk(directory):
    path, _ = allowed(directory)
    if not path.exists():
        return
    if path.is_dir():
        if (path / '.git').exists():
            raise PackageError('Refusing cleanup embedded repository')
        for child in sorted(path.iterdir(), key=lambda p: p.name.casefold()):
            yield from walk(child)
    elif path.is_file():
        yield path
    else:
        raise PackageError('Cleanup target is not a regular file/directory')


def remove_empty_browser_directories(directory):
    """Remove only empty D: browser directories after verified file unlinks."""
    path, scope = allowed(directory)
    task_browser = ROOT / BROWSER_DIR
    if scope != 'D-task-browser-copy' or not path.is_relative_to(task_browser):
        raise PackageError('Empty-directory removal escaped the exact D: task-browser allowlist')
    try:
        info = path.lstat()
    except FileNotFoundError:
        return 0
    if reparse(path) or not stat.S_ISDIR(info.st_mode):
        raise PackageError('Refusing linked or non-directory browser cleanup target')
    if (path / '.git').exists():
        raise PackageError('Refusing empty-directory cleanup of an embedded repository')
    removed = 0
    for child in sorted(path.iterdir(), key=lambda p: p.name.casefold()):
        child, child_scope = allowed(child)
        if child_scope != 'D-task-browser-copy' or reparse(child):
            raise PackageError('Refusing linked or out-of-scope browser directory entry')
        if stat.S_ISDIR(child.lstat().st_mode):
            removed += remove_empty_browser_directories(child)
    if any(path.iterdir()):
        return removed  # Retained files/subdirectories continue to protect their parents.
    # Recheck each directory immediately before atomic empty-only removal.
    path, scope = allowed(path)
    if scope != 'D-task-browser-copy' or reparse(path):
        raise PackageError('Browser directory changed before empty-only removal')
    path.rmdir()  # Fails safely if a new entry appeared; never removes file contents.
    return removed + 1


def browser_idle():
    if os.name != 'nt':
        raise PackageError('GPU/browser gate requires the original Windows environment')
    private_exe = str(ROOT / BROWSER_DIR / 'chrome-headless-shell.exe')
    code = "$target=[Console]::In.ReadToEnd(); $rows=@(Get-CimInstance Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath -eq $target }); Write-Output $rows.Count"
    result = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', code],
                            input=private_exe, capture_output=True, text=True, timeout=30)
    if result.returncode or result.stdout.strip() != '0':
        raise PackageError('Private browser still running or idle status could not be checked')


def gpu_restored():
    path = checked(QA / 'gpu-preference-restored-v09.json', ROOT)
    report = json.loads(path.read_text('utf-8-sig'))
    if not all(report.get(k) is True for k in ['restored', 'previousValueRestored', 'changedOnlyEpisodeBrowser']):
        raise PackageError('GPU preference restore report has not passed')
    snap = json.loads((ROOT / 'work/gpu-preference-before-v09.json').read_text('utf8'))
    exe = ROOT / BROWSER_DIR / 'chrome-headless-shell.exe'
    if Path(snap['exe']) != exe:
        raise PackageError('GPU snapshot points outside the V09 private browser')
    import winreg
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, r'Software\Microsoft\DirectX\UserGpuPreferences') as key:
            try:
                actual = winreg.QueryValueEx(key, str(exe))[0]
            except FileNotFoundError:
                actual = None
    except FileNotFoundError:
        actual = None
    if actual != snap.get('oldValue'):
        raise PackageError('Current private-browser GPU preference differs from original snapshot')
    browser_idle()
    return {'gpuRestoreReportSHA256': sha(path), 'privateBrowserIdle': True,
            'gpuPreferenceMatchesOriginalSnapshot': True}


def verify_gates():
    output = output_root()
    expected = [QA / 'delivery-qa-v09.json', QA / 'render-source-lock-v09.json',
                QA / 'gpu-preference-restored-v09.json',
                output / 'delivery/彩虹为什么是弧形_V09_本地可恢复工程.crc-report.json',
                output / 'delivery/彩虹为什么是弧形_V09_本地可恢复工程.manifest.json']
    pending = [str(p) for p in expected if not p.is_file()]
    protected = set()
    lock_path = QA / 'render-source-lock-v09.json'
    if lock_path.is_file():
        protected.update(str(ROOT / r) for r in json.loads(lock_path.read_text('utf8')).get('files', {}))
    if pending:
        return False, pending, protected, {}
    validate_final_v09_qa()
    gpu = gpu_restored()
    report = json.loads(expected[3].read_text('utf8'))
    manifest_data = expected[4].read_bytes()
    manifest = json.loads(manifest_data)
    if report.get('schema') != 'rainbow.v09.zip-crc-report/1' or not report.get('all_crc_passed') or not report.get('all_sha256_passed'):
        raise PackageError('Current V09 ZIP CRC/SHA verification required')
    name = report.get('zip', '')
    if Path(name).name != name or not name.endswith('.zip'):
        raise PackageError('Unsafe recovery ZIP report path')
    archive = safe_output_path(output / 'delivery' / name)
    if not archive.is_file() or sha(archive) != report['sha256']:
        raise PackageError('Recovery ZIP changed after verification')
    members = report.get('members', [])
    if len(members) != report.get('member_count') or len({m['path'] for m in members}) != len(members):
        raise PackageError('Recovery member inventory invalid')
    expected_members = {m['path']: {'sha256': m['sha256']} for m in members}
    if expected_members.get('PACKAGE_MANIFEST.json', {}).get('sha256') != hashlib.sha256(manifest_data).hexdigest():
        raise PackageError('Recovery manifest sidecar differs from verified ZIP')
    if manifest.get('schema') != 'rainbow.v09.local-user-project-package/1' or manifest.get('facts', {}).get('video_version') != 'V09':
        raise PackageError('Actual V09 recovery manifest required')
    for path in expected[:2]:
        rel = path.relative_to(ROOT).as_posix()
        if expected_members.get(rel, {}).get('sha256') != sha(path):
            raise PackageError('Recovery ZIP omits or contains stale final QA evidence: ' + rel)
    # Do not trust old pass flags: decompress and independently rehash every member now.
    fresh = verify_zip(archive, expected_members)
    if fresh['sha256'] != report['sha256']:
        raise PackageError('ZIP changed during fresh verification')
    selected, _, _ = choose_entries(argparse.Namespace(create=False, external_ply=False,
                                                      include_lux_zip=False, include_cfr=False))
    protected.update(str(e.source) for e in selected)
    qa = json.loads(expected[0].read_text('utf8'))
    protected.add(qa['video'])
    return True, [], protected, {'videoSHA256': qa['sha256'], 'zipSHA256': fresh['sha256'],
                                'allCRCAndSHARechecked': True, 'verifiedZipMembers': fresh['member_count'], **gpu}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true')
    parser.add_argument('--report', help='New JSON directly in research/qa; never overwrite')
    args = parser.parse_args()
    report_path = checked(ROOT / args.report, ROOT) if args.report else None
    if report_path and (report_path.parent != QA or report_path.suffix != '.json' or report_path.exists()):
        raise PackageError('Report must be a new JSON directly inside research/qa')
    gates, pending, protected, evidence = verify_gates()
    output = output_root()
    roots = [output / r for r in CACHE_DIRS + TEMP_FILES] + [ROOT / BROWSER_DIR]
    eligible, preserved = [], []
    for root in roots:
        for path in walk(root):
            checked_path, scope = allowed(path)
            info = checked_path.stat()
            row = {'path': str(path), 'scope': scope, 'bytes': info.st_size,
                   'mtimeNs': info.st_mtime_ns, 'hardLinkCount': info.st_nlink, 'sha256': sha(path)}
            reason = 'runtime-or-packaged-source' if str(path) in protected else (
                'shared-hardlink-outside-browser-exception' if info.st_nlink > 1 and scope != 'D-task-browser-copy' else '')
            if reason:
                preserved.append({**row, 'reason': reason})
            else:
                eligible.append(row)
    report = {'schema': 'rainbow.v09.cleanup-plan/1', 'version': 'V09',
              'createdUTC': dt.datetime.now(dt.timezone.utc).isoformat(),
              'dryRun': not args.apply, 'readyToApply': gates, 'pendingGates': pending, 'gateEvidence': evidence,
              'eligibleFiles': eligible, 'eligibleBytes': sum(r['bytes'] for r in eligible),
              'estimatedReleasedBytes': sum(r['bytes'] for r in eligible if r['hardLinkCount'] == 1),
              'hardlinkNote': 'Unlinking a task browser hardlink preserves peer data and may release no content bytes',
              'preservedFiles': preserved, 'allowedCCacheRoots': list(CACHE_DIRS),
              'allowedCTemporaryFiles': list(TEMP_FILES), 'allowedDBrowserRoot': BROWSER_DIR,
              'protected': ['all src/public/docs/delivery', 'all V08 files', 'runtime-public', 'all original Lux/Qwen',
                            'Blender sources/env-review', 'Opus records', 'all final QA/review evidence',
                            'all previously refused D: failed-preview directories',
                            'work/observer-original-bundle preserved after the earlier rejection',
                            'node_modules and all links'],
              'deletedFiles': 0, 'removedEmptyBrowserDirectories': 0}
    if args.apply:
        if not gates:
            raise PackageError('Deletion refused: final encode, verified recovery ZIP and GPU restore gates pending')
        # One complete preflight before the first unlink, then recheck per file.
        for row in eligible:
            path, scope = allowed(Path(row['path']))
            current = path.stat()
            if (current.st_size, current.st_mtime_ns, current.st_nlink) != (row['bytes'], row['mtimeNs'], row['hardLinkCount']) or sha(path) != row['sha256']:
                raise PackageError('Cleanup candidate changed since plan: ' + row['path'])
            if scope == 'C-cache' and current.st_nlink != 1:
                raise PackageError('A C: cache became a shared hardlink')
        browser_idle()
        for row in eligible:
            path, _ = allowed(Path(row['path']))
            now = path.stat()
            if (now.st_size, now.st_mtime_ns, now.st_nlink) != (row['bytes'], row['mtimeNs'], row['hardLinkCount']):
                raise PackageError('Cleanup file changed immediately before unlink: ' + row['path'])
            path.unlink()  # Only this named task link; never edits target contents.
            report['deletedFiles'] += 1
        # ensure-browser requires the task path absent before reconstruction.
        # Remove only individually checked empty D: browser directories, not C: caches.
        report['removedEmptyBrowserDirectories'] = remove_empty_browser_directories(ROOT / BROWSER_DIR)
        validate_final_v09_qa()
        gpu_restored()
        report['runtimeAndVideoHashesUnchangedAfterCleanup'] = True
    if report_path:
        with report_path.open('x', encoding='utf8') as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
    print(json.dumps({k: v for k, v in report.items() if k not in {'eligibleFiles', 'preservedFiles'}}, ensure_ascii=False, indent=2))
    print(f'Eligible files: {len(eligible)}; retained files: {len(preserved)}')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (PackageError, OSError, ValueError, zipfile.BadZipFile, subprocess.SubprocessError) as exc:
        print('CLEANUP REFUSED: ' + str(exc), file=sys.stderr)
        sys.exit(2)
