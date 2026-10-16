"""Plan only by default. --delete is gated by the actual V10 film and recovery.

Allow only named production task caches and ordinary single-link files. Before
any unlink: exact MP4/source/visual QA, fresh decompression and CRC/SHA of the
completed recovery ZIP, original GPU registry preference restored, task browser
idle, and immutable per-candidate hash/size/mtime. Never follows a junction,
touches original assets or credentials, or invokes shell recursive deletion.
"""
from __future__ import annotations
import argparse
import datetime as dt
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import uuid
import zipfile

sys.dont_write_bytecode = True
from package_v10 import (
    ROOT, PackageError, output_root, safe_output_path, no_reparse_ancestors,
    choose_entries, validate_final_qa, digest, jd,
)
from package_v08 import verify_zip

EXPECTED_OUTPUT = Path('C:/Users/zju/.codex/visualizations/2026/10/02/'
                       '01a0fc88-2a0a-7d81-86a9-bfe4cdd86204/rainbow_arc_v10')
EXPECTED_PROJECT = Path('D:/python_project/manim_extend_rainbow/video_project/rainbow_arc_2026_v10')
QA = ROOT / 'research/qa'
CACHE_DIRS = ('work/bundle', 'runtime-public')
STILL_DIRS = ('work/anchors-initial', 'work/anchors-plate-v10', 'work/design-repair-v10',
              'work/design-review-v10', 'work/spectrum-fix-v10', 'work/seams-v10')
BROWSER_DIR = 'work/render-browser-v10'
FORBIDDEN_PARTS = {'node_modules', '.git', '.claude', '.codex', '.agents'}
FRAME_NAME = re.compile(r'(?:frame|shot)-[0-9]+\.(?:png|jpe?g)$', re.I)
EVIDENCE_NAME = re.compile(r'(?:^|[-_.])(?:contact|review|acceptance|audit|qa)(?:[-_.]|$)', re.I)


def reparse(path):
    s = path.lstat()
    return stat.S_ISLNK(s.st_mode) or bool(getattr(s, 'st_file_attributes', 0) & 0x400)


def production_roots():
    out = output_root()
    if out != EXPECTED_OUTPUT or ROOT != EXPECTED_PROJECT:
        raise PackageError('Cleanup is limited to the exact original V10 production project/output')
    no_reparse_ancestors(ROOT)
    return out


def checked(path, boundary):
    """Validate absolute lexical/resolved boundaries before any file operation."""
    path, boundary = Path(os.path.abspath(path)), Path(os.path.abspath(boundary))
    try:
        relative = path.relative_to(boundary)
    except ValueError as exc:
        raise PackageError('Cleanup target escaped its named absolute boundary') from exc
    if not relative.parts or any(p.casefold() in FORBIDDEN_PARTS for p in relative.parts):
        raise PackageError('Empty/protected cleanup target')
    no_reparse_ancestors(boundary)
    current = boundary
    for part in relative.parts:
        current /= part
        try:
            info = current.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 0x400:
            raise PackageError('Refusing cleanup reparse point/junction: ' + str(path))
    if path.resolve(strict=False) != path or not path.is_relative_to(boundary):
        raise PackageError('Cleanup target resolves outside its checked location')
    return path


def allowed(path, out=None):
    out = production_roots() if out is None else out
    path = Path(os.path.abspath(path))
    if path.is_relative_to(out):
        rel = path.relative_to(out).as_posix()
        if any(rel == root or rel.startswith(root + '/') for root in CACHE_DIRS):
            return checked(path, out), 'C-rebuildable-runtime-cache'
        if path.parent == out / 'work' and path.name.startswith('preview') and path.suffix.casefold() == '.mp4':
            return checked(path, out), 'C-continuous-preview'
        for folder in STILL_DIRS:
            if rel == folder or (path.parent == out / folder and FRAME_NAME.fullmatch(path.name)):
                return checked(path, out), 'C-independent-review-frame'
        raise PackageError('C: cleanup target is outside the explicit V10 cache allowlist')
    if path.is_relative_to(ROOT):
        rel = path.relative_to(ROOT).as_posix()
        if rel == BROWSER_DIR or rel.startswith(BROWSER_DIR + '/'):
            return checked(path, ROOT), 'D-private-task-browser'
        raise PackageError('D: cleanup target is outside the private V10 browser allowlist')
    raise PackageError('Cleanup target is outside both named V10 task boundaries')


def walk(directory, out):
    directory, _ = allowed(directory, out)
    try:
        info = directory.lstat()
    except FileNotFoundError:
        return
    if stat.S_ISDIR(info.st_mode):
        if (directory / '.git').exists():
            raise PackageError('Refusing cleanup embedded repository')
        for child in sorted(directory.iterdir(), key=lambda p: p.name.casefold()):
            yield from walk(child, out)
    elif stat.S_ISREG(info.st_mode):
        yield directory
    else:
        raise PackageError('Cleanup candidate is not a regular file/directory')


def browser_idle():
    if os.name != 'nt':
        raise PackageError('Browser/GPU cleanup gates require the original Windows task environment')
    exe = str(ROOT / BROWSER_DIR / 'chrome-headless-shell.exe')
    # A trusted, literal command receives the filename through stdin; no argv
    # interpolation, provider credential lookup, or process command-line echo.
    code = ("$target=[Console]::In.ReadToEnd(); "
            "$rows=@(Get-CimInstance Win32_Process -ErrorAction Stop | "
            "Where-Object { $_.ExecutablePath -eq $target }); Write-Output $rows.Count")
    result = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command', code],
                            input=exe, capture_output=True, text=True, timeout=30)
    if result.returncode or result.stdout.strip() != '0':
        raise PackageError('Private V10 browser is running or idle status could not be verified')


def gpu_restored():
    if os.name != 'nt':
        raise PackageError('Registry restoration must be verified on original Windows host')
    path = checked(QA / 'gpu-preference-restored-v10.json', ROOT)
    report = json.loads(path.read_text('utf-8-sig'))
    if not all(report.get(k) is True for k in ['restored', 'previousValueRestored', 'changedOnlyEpisodeBrowser']):
        raise PackageError('V10 GPU registry restoration report has not passed')
    snap = json.loads(checked(ROOT / 'work/gpu-preference-before-v10.json', ROOT).read_text('utf8'))
    exe = ROOT / BROWSER_DIR / 'chrome-headless-shell.exe'
    if snap.get('onlyTaskExe') is not True or Path(snap['exe']) != exe:
        raise PackageError('GPU restoration snapshot points outside the private V10 browser')
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
        raise PackageError('Current V10 browser GPU registry value differs from the original snapshot')
    browser_idle()
    return {'gpuPreferenceMatchesOriginalSnapshot': True, 'privateBrowserIdle': True,
            'gpuRestoreReportSHA256': digest(path)}


def pending_gate_files(out, archive):
    required = [QA / 'delivery-qa-v10.json', QA / 'render-source-lock-v10.json',
                QA / 'final-visual-acceptance-v10.json', QA / 'gpu-preference-restored-v10.json',
                ROOT / 'research/physics/verification-v10.json',
                ROOT / 'research/physics/world-geometry-check-v10.json',
                archive, archive.with_suffix('.manifest.json'), archive.with_suffix('.crc-report.json')]
    return [str(path) for path in required if not path.is_file()]


def verify_gates(out, archive, entries, expectations):
    pending = pending_gate_files(out, archive)
    if pending:
        return False, pending, {}
    # Registry restoration is mandatory before cleanup verification/deletion;
    # this script never restores or alters registry values automatically.
    gpu = gpu_restored()
    qa = validate_final_qa()
    manifest_path, crc_path = archive.with_suffix('.manifest.json'), archive.with_suffix('.crc-report.json')
    manifest_data = safe_output_path(manifest_path).read_bytes()
    manifest, crc = json.loads(manifest_data), json.loads(safe_output_path(crc_path).read_text('utf8'))
    if (manifest.get('version') != 'V10' or manifest.get('schema') != 'rainbow.v10.private-recovery-manifest/1'
            or manifest.get('privateUserRecovery') is not True
            or manifest.get('finalVideoQA', {}).get('sha256') != qa['sha256']):
        raise PackageError('Completed private recovery package must contain exact final V10 MP4 QA')
    if (crc.get('schema') != 'rainbow.v10.zip-crc-report/1' or crc.get('zip') != archive.name
            or not crc.get('all_crc_passed') or not crc.get('all_sha256_passed')
            or archive.stat().st_size != crc.get('bytes') or digest(archive) != crc.get('sha256')):
        raise PackageError('Completed V10 ZIP differs from its actual CRC/SHA report')
    members = crc.get('members', [])
    if len(members) != crc.get('member_count') or len({r['path'] for r in members}) != len(members):
        raise PackageError('Invalid completed recovery ZIP member set')
    expected = {row['path']: {'sha256': row['sha256']} for row in members}
    if expected.get('PACKAGE_MANIFEST.json', {}).get('sha256') != hashlib.sha256(manifest_data).hexdigest():
        raise PackageError('Manifest sidecar differs from the verified completed ZIP')
    declared = {row['path']: row for row in manifest['files']}
    if set(expected) != set(declared) | {'PACKAGE_MANIFEST.json'}:
        raise PackageError('Recovery manifest member set differs from CRC report')
    for rel, row in declared.items():
        if expected[rel]['sha256'] != row['sha256']:
            raise PackageError('Recovery manifest hash differs from CRC report: ' + rel)
    # Sources/voice/provider originals must still equal their packaged hashes.
    # Newly authored post-package operational QA is allowed, but final film QA,
    # source lock and visual acceptance are checked explicitly below.
    for entry in entries:
        rel = entry.archive_path
        if rel.startswith('research/qa/'):
            continue
        if rel not in expected or digest(entry.source) != expected[rel]['sha256']:
            raise PackageError('Recoverable V10 source missing/stale in completed ZIP: ' + rel)
    for rel, sha in expectations.items():
        if expected.get(rel, {}).get('sha256') != sha:
            raise PackageError('Completed ZIP does not preserve accepted original SHA: ' + rel)
    for rel in ['research/qa/delivery-qa-v10.json', 'research/qa/render-source-lock-v10.json',
                'research/qa/final-visual-acceptance-v10.json',
                'research/physics/verification-v10.json', 'research/physics/world-geometry-check-v10.json']:
        if expected.get(rel, {}).get('sha256') != digest(checked(ROOT / rel, ROOT)):
            raise PackageError('Completed ZIP lacks exact final QA/physics evidence: ' + rel)
    # Re-decompress every member and recompute CRC/SHA now; old flags alone do
    # not authorize deletion of even one cache file.
    fresh = verify_zip(archive, expected)
    if fresh['sha256'] != crc['sha256']:
        raise PackageError('Completed ZIP changed during fresh recovery verification')
    return True, [], {'videoSHA256': qa['sha256'], 'zipSHA256': fresh['sha256'],
                      'verifiedZipMembers': fresh['member_count'], 'allCRCAndSHARechecked': True, **gpu}


def referenced_evidence(out):
    """Protect directly named review files; contacts are independently retained."""
    protected = set()
    def visit(value):
        if isinstance(value, dict):
            for child in value.values():
                visit(child)
        elif isinstance(value, list):
            for child in value:
                visit(child)
        elif isinstance(value, str):
            path = Path(value)
            if path.is_absolute():
                path = Path(os.path.abspath(path))
                if path.is_relative_to(out):
                    no_reparse_ancestors(path)
                    if path.is_file():
                        protected.add(str(path).casefold())
    for path in sorted(QA.glob('*v10*.json')):
        checked(path, ROOT)
        try:
            visit(json.loads(path.read_text('utf-8-sig')))
        except json.JSONDecodeError as exc:
            raise PackageError('Malformed V10 QA evidence JSON: ' + path.name) from exc
    return protected


def evidence_name(path):
    return bool(EVIDENCE_NAME.search(path.name)) or any(
        part.startswith('all-frame-qa-') for part in path.parts)


def plan(out, protected):
    candidates, preserved, seen = [], [], set()
    roots = [out / name for name in CACHE_DIRS] + [ROOT / BROWSER_DIR]
    files = []
    for root in roots:
        files.extend(walk(root, out))
    work = checked(out / 'work', out)
    for path in sorted(work.iterdir(), key=lambda p: p.name.casefold()):
        if path.name.startswith('preview') and path.suffix.casefold() == '.mp4':
            files.append(allowed(path, out)[0])
    for name in STILL_DIRS:
        folder, _ = allowed(out / name, out)
        if not folder.exists():
            continue
        for child in sorted(folder.iterdir(), key=lambda p: p.name.casefold()):
            if reparse(child):
                raise PackageError('Refusing linked entry in named review-frame directory')
            if FRAME_NAME.fullmatch(child.name):
                files.append(allowed(child, out)[0])
    for path in files:
        key = str(path).casefold()
        if key in seen:
            continue
        seen.add(key)
        path, scope = allowed(path, out)
        info = path.lstat()
        if not stat.S_ISREG(info.st_mode):
            raise PackageError('Cleanup leaf is not an ordinary regular file')
        row = {'path': str(path), 'scope': scope, 'bytes': info.st_size,
               'mtimeNs': info.st_mtime_ns, 'hardLinkCount': info.st_nlink}
        reason = ('packaged-source-or-direct-QA-evidence' if key in protected else
                  'shared-hardlink' if info.st_nlink != 1 else
                  'QA-contact-or-review-evidence' if evidence_name(path) else '')
        if reason:
            preserved.append({**row, 'reason': reason})
        else:
            row['sha256'] = digest(path)
            candidates.append(row)
            if len(candidates) % 250 == 0:
                print(f'Cleanup plan hashed {len(candidates)} cache files', flush=True)
    return candidates, preserved


def validate_candidate(row, out):
    path, scope = allowed(Path(row['path']), out)
    info = path.lstat()
    if (not stat.S_ISREG(info.st_mode) or info.st_nlink != 1
            or (info.st_size, info.st_mtime_ns, info.st_nlink)
            != (row['bytes'], row['mtimeNs'], row['hardLinkCount'])
            or digest(path) != row['sha256']):
        raise PackageError('Candidate changed/shared since plan: ' + row['path'])
    return path


def remove_empty(directory, out):
    """Checked empty-only directory removal; never rmtree or shell deletion."""
    path, _ = allowed(directory, out)
    try:
        info = path.lstat()
    except FileNotFoundError:
        return 0
    if not stat.S_ISDIR(info.st_mode) or reparse(path):
        raise PackageError('Empty-directory target became non-directory or linked')
    removed = 0
    for child in sorted(path.iterdir(), key=lambda p: p.name.casefold()):
        if reparse(child):
            raise PackageError('Reparse point appeared during empty-directory cleanup')
        if stat.S_ISDIR(child.lstat().st_mode):
            # A review directory's unexpected nested children are preserved.
            try:
                allowed(child, out)
            except PackageError:
                continue
            removed += remove_empty(child, out)
    if any(path.iterdir()):
        return removed
    path, _ = allowed(path, out)
    if reparse(path):
        raise PackageError('Directory linked immediately before empty-only removal')
    path.rmdir()  # Atomic empty-only removal; fails if an entry appeared.
    return removed + 1


def write_journal(path, report):
    """Keep operational progress outside every deletion allowlist."""
    path = safe_output_path(path)
    if not path.is_relative_to(output_root() / 'work/cleanup-v10'):
        raise PackageError('Cleanup journal escaped its protected operational directory')
    if path.exists() and (reparse(path) or path.stat().st_nlink != 1):
        raise PackageError('Refusing shared/linked cleanup journal')
    pending = path.with_name(path.name + '.pending')
    if pending.exists():
        raise PackageError('Pending cleanup journal exists; inspect it before resuming')
    path.parent.mkdir(parents=True, exist_ok=True)
    with pending.open('xb') as stream:
        stream.write(jd(report))
    pending.replace(path)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--delete', action='store_true', help='Root confirms final MP4, recovery ZIP and registry restoration completed')
    parser.add_argument('--zip', help='Completed recovery ZIP directly inside the named V10 delivery directory')
    parser.add_argument('--report', help='New JSON within C output work/cleanup-v10; never overwrites')
    args = parser.parse_args()
    out = production_roots()
    archive = Path(args.zip) if args.zip else out / 'delivery/彩虹为什么是弧形_V10_本地可恢复工程.zip'
    archive = safe_output_path(archive if archive.is_absolute() else out / archive)
    if archive.parent != out / 'delivery' or archive.suffix.casefold() != '.zip':
        raise PackageError('Completed ZIP must be directly inside original V10 delivery directory')
    report_path = None
    if args.report:
        report_path = Path(args.report)
        report_path = safe_output_path(report_path if report_path.is_absolute() else out / report_path)
        if (not report_path.is_relative_to(out / 'work/cleanup-v10')
                or report_path.suffix.casefold() != '.json' or report_path.exists()):
            raise PackageError('Cleanup report must be a new JSON inside C output work/cleanup-v10')
    entries, expectations, _, _ = choose_entries()
    protected = {str(e.source).casefold() for e in entries} | referenced_evidence(out)
    ready, pending, gate_evidence = verify_gates(out, archive, entries, expectations)
    if args.delete and not ready:
        raise PackageError('Deletion refused: actual final V10 MP4/visual QA, completed CRC/SHA ZIP and registry restore are pending')
    eligible, preserved = plan(out, protected)
    report = {'schema': 'rainbow.v10.cleanup-plan/1', 'version': 'V10',
              'createdUTC': dt.datetime.now(dt.timezone.utc).isoformat(), 'dryRun': not args.delete,
              'readyToDelete': ready, 'pendingGates': pending, 'gateEvidence': gate_evidence,
              'eligibleFiles': eligible, 'eligibleBytes': sum(r['bytes'] for r in eligible),
              'estimatedReleasedBytes': sum(r['bytes'] for r in eligible), 'preservedFiles': preserved,
              'allowedCacheRoots': list(CACHE_DIRS), 'allowedStandaloneFrames': list(STILL_DIRS),
              'allowedPreviewFiles': 'C work root only: preview*.mp4', 'allowedPrivateBrowserRoot': BROWSER_DIR,
              'preserved': ['all V09 projects/output', 'shared node_modules/junction', 'all src/public/docs/source audio',
                            'original Qwen inputs/generated/rejected records and all provenance',
                            'all fish/Blender/Lux editable or original assets', 'final MP4/recovery ZIP/sidecars',
                            'QA contacts, directly referenced evidence and final encoded frames', 'all shared hardlinks'],
              'providerCalls': 0, 'registryModifiedByCleanup': False, 'deletedFiles': 0,
              'removedEmptyDirectories': 0, 'sourceAssetsModified': 0, 'sourceAssetsDeleted': 0}
    if args.delete:
        # Complete immutable preflight of every candidate before first unlink.
        for row in eligible:
            validate_candidate(row, out)
        validate_final_qa()
        if digest(archive) != gate_evidence['zipSHA256']:
            raise PackageError('Completed recovery ZIP changed before the first unlink')
        gpu_restored()
        journal = out / 'work/cleanup-v10' / ('delete-journal-' + uuid.uuid4().hex + '.json')
        report.update(deleteStatus='running', journal=str(journal), deletedFilePaths=[])
        write_journal(journal, report)
        try:
            for row in eligible:
                path = validate_candidate(row, out)
                path.unlink()  # This verified ordinary task file only; no shell/rmtree.
                report['deletedFiles'] += 1
                report['deletedFilePaths'].append(str(path))
                if report['deletedFiles'] % 250 == 0:
                    write_journal(journal, report)
                    print(f'Unlinked {report["deletedFiles"]}/{len(eligible)} verified cache files', flush=True)
            for directory in [out / n for n in CACHE_DIRS + STILL_DIRS] + [ROOT / BROWSER_DIR]:
                report['removedEmptyDirectories'] += remove_empty(directory, out)
            validate_final_qa()
            gpu_restored()
            if digest(archive) != gate_evidence['zipSHA256']:
                raise PackageError('Completed recovery ZIP changed after cleanup')
            report.update(finalFilmAndRuntimeSourceHashesUnchangedAfterCleanup=True, deleteStatus='complete')
        except Exception:
            report['deleteStatus'] = 'partial-failed'
            raise
        finally:
            write_journal(journal, report)
    if report_path:
        report_path.parent.mkdir(parents=True, exist_ok=True)
        with report_path.open('xb') as stream:
            stream.write(jd(report))
    summary = {key: value for key, value in report.items() if key not in {'eligibleFiles', 'preservedFiles'}}
    summary.update(eligibleFileCount=len(eligible), preservedCandidateCount=len(preserved),
                   releasableMiB=round(report['estimatedReleasedBytes'] / 1024**2, 2))
    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)
    return 0


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf8')
    try:
        raise SystemExit(main())
    except (PackageError, OSError, ValueError, KeyError, zipfile.BadZipFile, subprocess.SubprocessError) as exc:
        print('CLEANUP REFUSED: ' + str(exc), file=sys.stderr)
        raise SystemExit(2)
