"""Plan explicit retired V4/cache cleanup; deletion requires --execute and V5 gates.

Default invocation only writes a plan. The author did not execute deletion.
All path inspection and deletion stay in this Python process; no rmtree, shell
deletion, wildcard expansion, shared dependency traversal, or gate bypass.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import stat
import subprocess
import sys
import zipfile

ROOT = Path(os.path.abspath(__file__)).parents[1]
OUT = ROOT/'research/qa/cleanup-v5'
VIDEO = ROOT/'delivery/GLP1_V5_1080p.mp4'
QA = ROOT/'research/qa/final-v5/automatic-report.json'
VISUAL = ROOT/'research/qa/final-v5/visual-review.json'
MARKER = ROOT/'tmp/final-render.json'
PACKAGE = ROOT/'delivery/科学减重与三高-封面文案.zip'
PACKAGE_MANIFEST = ROOT/'research/revision-v5/publishing-package.json'
DEPENDENCY_REVIEW = OUT/'dependency-review.json'
REPARSE = getattr(stat, 'FILE_ATTRIBUTE_REPARSE_POINT', 0x400)

# Literal roots only. No glob or "all old assets" discovery is used for deletion.
# public, src, scripts, docs, V5 audio, sources, models, licenses and QA are protected.
ALLOWLIST = {
    'delivery/GLP1_1080p.mp4': ('file', 'Retired V4 final; exact V4 QA hash required'),
    'delivery/发布文案.md': ('file', 'Retired V4 publishing copy; V5 replacement and ZIP must be current'),
    'delivery/制作与来源.md': ('file', 'Retired V4 source notes; baseline metadata retained'),
    'delivery/解说稿.md': ('file', 'Retired V4 narration document; baseline metadata retained'),
    'delivery/GLP1.srt': ('file', 'Retired V4 subtitles; V5 named installation files are protected'),
    'delivery/GLP1-subtitles.srt': ('file', 'Retired V4 subtitle alias'),
    'delivery/封面与发布文案.zip': ('file', 'Retired V4 publishing ZIP; new V5 ZIP and current members are verified'),
    'research/revision-v5/baseline-v4/master.wav': ('file', 'V4 duplicate master; baseline hash required'),
    'audio/selected-prior': ('directory', 'Retired pre-V5 alternate selected takes; V5 folder is separate'),
    'audio/premaster.wav': ('file', 'Rebuildable V4 premaster'),
    'audio/music-original.wav': ('file', 'Retired V4 full score; source score/samples retained'),
    'audio/master-aac-check.m4a': ('file', 'Retired V4 AAC test'),
    'audio/music-preview.wav': ('file', 'Retired V4 music preview'),
    'audio/preview-with-music.wav': ('file', 'Retired V4 mixed preview'),
    'audio/AB-raw.wav': ('file', 'Retired V4 A/B copy; original raw sources retained'),
    'audio/AB-processed.wav': ('file', 'Retired V4 A/B copy; original take records retained'),
    'tmp/bundle': ('directory', 'Rebuildable film bundle; only after render and QA are idle'),
    'tmp/stills': ('directory', 'Rebuildable source preview stills; final encoded QA frames stay in research'),
    'tmp/cover-anatomy-v5-bundle': ('directory', 'Rebuildable cover bundle; current cover sources retained'),
    'tmp/covers-v4': ('directory', 'Retired V4 cover intermediate stills'),
    'tmp/qa-cardio-v4': ('directory', 'Rebuildable V4 isolated component transpilation'),
    'tmp/v5-precolor-tags.mp4': ('file', 'V5 before verified lossless BT709 tag repair; exact original repair hash required'),
    'tmp/preview-v5-bundle': ('directory', 'Explicit optional V5 preview bundle, if present'),
    'research/qa/preview-v5/bundle': ('directory', 'Explicit optional bundle only; preview reports/images retained'),
}
REQUIRED_CHECKS = {
    'width1920', 'height1080', 'fps30', 'framesMatchTimeline',
    'videoDurationMatchesTimeline', 'fullDecodeSuccess', 'decodedFramesMatchTimeline',
    'audioAAC', 'colorBT709', 'noDetectedBlackSegments', 'aacTruePeakBelow0dBTP',
    'allRepresentativeClipsExtracted', 'allPlannedFramesExist',
}
PROTECTED_ROOTS = ('src', 'public', 'scripts', 'docs', 'audio/revision-v5',
                   'audio/raw', 'audio/takes', 'audio/asr', 'audio/asr-glossary',
                   'research/music/samples', 'research/structures')


def now():
    return datetime.now(timezone.utc).isoformat()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def present(path):
    return os.path.lexists(path)


def node_info(path):
    info = path.lstat()
    require(not stat.S_ISLNK(info.st_mode) and not getattr(info, 'st_file_attributes', 0) & REPARSE,
            f'Refusing symlink, junction or reparse point: {path}')
    require(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode), f'Refusing special object: {path}')
    return info


def safe_path(path, missing_ok=False):
    path = Path(os.path.abspath(path))
    require(path != ROOT and path.is_relative_to(ROOT), f'Path outside/equal to project root: {path}')
    parts = path.relative_to(ROOT).parts
    require(not any(part.lower() in {'.git', 'node_modules'} for part in parts), f'Protected repository/dependency: {path}')
    node_info(ROOT)
    current = ROOT
    for part in parts:
        current /= part
        if not present(current):
            require(missing_ok, f'Missing required path: {current}')
            return path
        info = node_info(current)
        if stat.S_ISDIR(info.st_mode):
            require(not present(current/'.git'), f'Nested repository: {current}')
    require(path.resolve(strict=True) == path and path.resolve().is_relative_to(ROOT), f'Resolved path changed: {path}')
    return path


def identity(path):
    info = node_info(safe_path(path))
    return {'bytes':info.st_size, 'mtimeNS':info.st_mtime_ns, 'device':info.st_dev, 'inode':info.st_ino}


def sha(path):
    before = identity(path)
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(4*1024*1024), b''):
            digest.update(chunk)
    require(before == identity(path), f'File changed while hashing: {path}')
    return digest.hexdigest()


def read(path):
    return json.loads(safe_path(path).read_text(encoding='utf-8-sig'))


def write(path, data):
    safe_path(path, missing_ok=True)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')


def tree(path):
    safe_path(path)
    yield path
    if path.is_dir():
        for child in sorted(path.iterdir(), key=lambda p:p.name.casefold()):
            yield from tree(child)


def candidate_plan(hash_files=False):
    files, directories, missing = [], [], []
    for rel, (kind, reason) in ALLOWLIST.items():
        base = safe_path(ROOT/rel, missing_ok=True)
        if not present(base):
            missing.append(rel)
            continue
        require(base.is_dir() == (kind == 'directory'), f'Allowlist object type changed: {rel}')
        for path in tree(base):
            if path.is_dir():
                directories.append(path.relative_to(ROOT).as_posix())
            else:
                row = {'path':path.relative_to(ROOT).as_posix(), 'allowlistRoot':rel,
                       'reason':reason, **identity(path)}
                if hash_files:
                    row['sha256'] = sha(path)
                files.append(row)
    require(len({f['path'] for f in files}) == len(files), 'Overlapping allowlist entries')
    require(not any((ROOT/f['path']).is_relative_to(ROOT/p) for f in files for p in PROTECTED_ROOTS),
            'Candidate overlaps protected source/current asset roots')
    return {'createdAtUTC':now(), 'root':str(ROOT), 'scriptSHA256':sha(Path(__file__)),
            'executed':False, 'gateStatus':'Not evaluated by inventory; --execute must pass every gate',
            'allowlist':{key:{'kind':v[0],'reason':v[1]} for key,v in ALLOWLIST.items()},
            'files':files, 'directories':directories, 'missingRoots':missing,
            'plannedBytes':sum(row['bytes'] for row in files), 'plannedFileCount':len(files),
            'protectedPolicy':'All public, src, scripts, docs, V5 audio and research/QA/source assets retained except two explicitly named retired/preview paths. Shared node_modules is never traversed.'}


def current_processes():
    if os.name != 'nt':
        raise RuntimeError('This guarded cleanup is designed for the current Windows host')
    result = subprocess.run(['powershell', '-NoProfile', '-NonInteractive', '-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'],
        check=True, capture_output=True, text=True, encoding='utf-8', errors='replace', timeout=30)
    return json.loads(result.stdout)


def require_idle():
    busy = []
    root_name = str(ROOT).replace('\\','/').casefold()
    processes = current_processes()
    by_id = {row['ProcessId']:row for row in processes}
    own_chain = {os.getpid()}
    current = os.getpid()
    while current in by_id:
        parent = by_id[current]['ParentProcessId']
        if parent in own_chain:
            break
        own_chain.add(parent)
        current = parent
    relative_scripts = {'scripts/'+p.name.casefold() for p in (ROOT/'scripts').iterdir()
                        if p.suffix.casefold() in {'.py','.mjs','.js','.ps1'}}
    for row in processes:
        if row['ProcessId'] in own_chain or row['Name'].casefold() not in {'node.exe','ffmpeg.exe','python.exe','pythonw.exe','cmd.exe','powershell.exe','pwsh.exe'}:
            continue
        command = (row.get('CommandLine') or '').replace('\\','/').casefold()
        if 'cleanup_v5.py' in command:
            busy.append({'pid':row['ProcessId'],'name':row['Name'],'commandLine':row.get('CommandLine')})
            continue
        # Relative renderer commands do not expose their CWD through Win32_Process.
        # Conservatively decline when another renderer with that signature is live.
        # A bare `scripts/render.mjs` command does not reveal its working
        # directory.  Matching it globally would block this film's cleanup
        # whenever another project is rendering in the shared workspace.
        # Only treat commands as ours when they carry this project's absolute
        # root or its V5-specific evidence paths.
        project_job = (root_name in command
                       or 'research/revision-v5/' in command
                       or 'research/qa/final-v5/' in command)
        if project_job:
            busy.append({'pid':row['ProcessId'],'name':row['Name'],'commandLine':row.get('CommandLine')})
    require(not busy, f'Project rendering, audio, preview or QA process is still active: {busy}')


def check_package(package_path, manifest_path):
    package_path, manifest_path = safe_path(package_path), safe_path(manifest_path)
    require(package_path.is_relative_to(ROOT/'delivery') and package_path.suffix.lower() == '.zip', 'Package must be an existing delivery ZIP')
    manifest = read(manifest_path)
    require(safe_path(ROOT/manifest['packagePath']) == package_path and manifest['packageSHA256'] == sha(package_path),
            'Publishing package manifest points to another or stale ZIP')
    entries = manifest.get('files', [])
    require(bool(entries), 'Publishing ZIP requires explicit source/member/SHA entries')
    members = [entry['member'] for entry in entries]
    require(len(set(members)) == len(members), 'Duplicate ZIP members in manifest')
    with zipfile.ZipFile(package_path) as archive:
        require(set(archive.namelist()) == set(members) and len(archive.namelist()) == len(members), 'ZIP member set differs from manifest')
        require(archive.testzip() is None, 'Publishing ZIP CRC failure')
        for entry in entries:
            member = PurePosixPath(entry['member'])
            require(not member.is_absolute() and '..' not in member.parts and '\\' not in entry['member'], 'Unsafe ZIP member path')
            source = safe_path(ROOT/entry['source'])
            require(source.is_relative_to(ROOT/'delivery') and source.suffix.lower() in {'.jpg','.jpeg','.png','.md','.srt','.txt'},
                    f'Unexpected publishing source: {source}')
            require(sha(source) == entry['sha256'] == hashlib.sha256(archive.read(entry['member'])).hexdigest(),
                    f'ZIP is stale relative to current publishing source: {entry["source"]}')
    return {'packagePath':package_path.relative_to(ROOT).as_posix(), 'packageSHA256':sha(package_path),
            'manifestSHA256':sha(manifest_path), 'crcPassed':True, 'memberCount':len(members)}


def acceptance_gate(package_path, manifest_path):
    qa, visual, marker = read(QA), read(VISUAL), read(MARKER)
    checks = qa.get('checks', {})
    require(qa.get('automaticChecksPass') is True and REQUIRED_CHECKS.issubset(checks) and all(value is True for value in checks.values()),
            'Current V5 automatic report has missing/failed checks')
    require(visual.get('sampledVisualReviewCompleted') is True and visual.get('openBlockingFindings') == [],
            'Current V5 sampled visual review is unfinished or has blocking findings')
    require(safe_path(Path(qa['video'])) == VIDEO and marker.get('success') is True and safe_path(Path(marker['outputLocation'])) == VIDEO,
            'QA/render marker does not describe the V5 delivery')
    video_sha, timeline_sha, master_sha = sha(VIDEO), sha(ROOT/'src/timeline.json'), sha(ROOT/'public/master.wav')
    require(video_sha == qa.get('videoSHA256') == visual.get('videoSHA256') == marker.get('videoSHA256'), 'V5 video hash differs among QA, review, marker and file')
    require(timeline_sha == qa.get('timelineSHA256') == visual.get('timelineSHA256') == marker.get('timelineSHA256') == sha(ROOT/'public/timeline.json'),
            'V5 timeline hash differs among installed files and acceptance evidence')
    require(master_sha == visual.get('masterSHA256') == marker.get('masterSHA256'), 'Current master differs from reviewed/rendered V5 audio')
    timeline = read(ROOT/'src/timeline.json')
    require(marker.get('frames') == [0, timeline['durationFrames']-1] and qa.get('videoBytes') == VIDEO.stat().st_size,
            'Render is partial or video size changed')
    require(-16 <= qa['measured']['aacIntegratedLUFS'] <= -14 and qa['measured']['aacTruePeakDBTP'] <= -1,
            'Delivered AAC loudness/true peak has not passed V5 audio thresholds')
    entry = (ROOT/'src/index.tsx').read_text(encoding='utf-8')
    require("from './V5Film'" in entry and 'component={V5Film}' in entry, 'Current rerender entry does not use V5Film')
    installed = read(ROOT/'research/revision-v5/audio-installation.json')
    require(installed.get('installed') is True and installed.get('timelineSHA256') == timeline_sha and installed.get('masterSHA256') == master_sha,
            'Current V5 audio installation is not recorded or differs')
    for record in installed['files']:
        require(sha(safe_path(ROOT/record['destination'])) == record['sha256'], 'Installed V5 artifact differs: '+record['destination'])
    review = read(DEPENDENCY_REVIEW)
    require(review.get('passed') is True and review.get('missingDependencies') == [] and review.get('sharedDependenciesExcluded') is True,
            'Independent dynamic asset/dependency audit is incomplete')
    for group in ['sourceFilesSHA256','publicAssetsSHA256']:
        require(bool(review.get(group)), 'Dependency review missing '+group)
        for rel, digest in review[group].items():
            require(sha(safe_path(ROOT/rel)) == digest, 'Dependency changed since independent audit: '+rel)
    if present(ROOT/'delivery/GLP1_1080p.mp4'):
        require(sha(ROOT/'delivery/GLP1_1080p.mp4') == read(ROOT/'research/qa/final-v4/automatic-report.json')['videoSHA256'],
                'Retired output no longer matches V4 QA; refusing to infer it is disposable')
    if present(ROOT/'research/revision-v5/baseline-v4/master.wav'):
        prior = read(ROOT/'research/revision-v5/v4-protected-inputs.json')['files']['public/master.wav']
        require(sha(ROOT/'research/revision-v5/baseline-v4/master.wav') == prior, 'V4 duplicate master hash differs from protected baseline')
    color_repair_sha = None
    if present(ROOT/'tmp/v5-precolor-tags.mp4'):
        color_repair_path = ROOT/'research/revision-v5/color-tag-repair.json'
        color_repair = read(color_repair_path)
        require(color_repair.get('sourceRenderCompleted') is True and color_repair.get('sameEncodedPacketHashes') is True and
                color_repair.get('correctedSHA256') == video_sha,
                'BT709 repair does not confirm a lossless replacement by the current accepted V5 video')
        require(sha(ROOT/'tmp/v5-precolor-tags.mp4') == color_repair.get('originalSHA256'),
                'Pre-repair V5 video differs from the recorded original; refusing cleanup')
        color_repair_sha = sha(color_repair_path)
    package = check_package(package_path, manifest_path)
    package_record = read(manifest_path)
    finalization_path = ROOT/'research/revision-v5/finalization.json'
    finalization = read(finalization_path)
    require(package_record.get('revision') == 'v5' and package_record.get('finalVideoSHA256') == video_sha and
            package_record.get('finalizationSHA256') == sha(finalization_path),
            'Publishing ZIP is not bound to the current V5 video/finalization')
    require(finalization.get('revision') == 'v5' and finalization.get('sampledVisualReviewCompleted') is True and
            finalization.get('videoSHA256') == video_sha and finalization.get('timelineSHA256') == timeline_sha,
            'Current publishing finalization refers to another or incomplete V5')
    require(bool(finalization.get('outputsSHA256')) and bool(finalization.get('inputsSHA256')),
            'Publishing finalization lacks input/output provenance')
    for group in ['inputsSHA256','outputsSHA256']:
        for rel,digest in finalization[group].items():
            require(sha(safe_path(ROOT/rel)) == digest, 'Publishing finalization is stale: '+rel)
    return {'videoSHA256':video_sha,'timelineSHA256':timeline_sha,'masterSHA256':master_sha,
            'automaticReportSHA256':sha(QA),'visualReviewSHA256':sha(VISUAL),'renderMarkerSHA256':sha(MARKER),
            'dependencyReviewSHA256':sha(DEPENDENCY_REVIEW),'finalizationSHA256':sha(finalization_path),
            'colorTagRepairSHA256':color_repair_sha,'package':package}


def reject_current_artifact_overlap(plan, manifest_path):
    """Installation and ZIP contracts take precedence over any retired filename."""
    protected = set()
    installed = read(ROOT/'research/revision-v5/audio-installation.json')
    for row in installed['files']:
        protected.update([row['source'],row['destination']])
    publishing = read(manifest_path)
    protected.add(publishing['packagePath'])
    protected.update(row['source'] for row in publishing['files'])
    candidates = {row['path'] for row in plan['files']}
    require(not candidates.intersection(protected), 'Allowlist overlaps an installed V5 or current ZIP input: '+str(sorted(candidates.intersection(protected))))
    # Final sampled review evidence may occasionally live in a temp directory.
    # Refuse those entries instead of deleting evidence merely because of its name.
    candidate_lookup = {}
    for rel in candidates | set(plan['directories']):
        candidate_lookup[os.path.normcase(os.path.abspath(ROOT/rel))] = rel
    def values(value):
        if isinstance(value,str):
            yield value
        elif isinstance(value,dict):
            for child in value.values():
                yield from values(child)
        elif isinstance(value,list):
            for child in value:
                yield from values(child)
    hits = set()
    for report_path in [QA,VISUAL]:
        for value in values(read(report_path)):
            # Lexical normalization only: never open an untrusted report path.
            normalized = os.path.normcase(os.path.abspath(ROOT/Path(value.replace('\\','/'))))
            if normalized in candidate_lookup:
                hits.add(candidate_lookup[normalized])
    require(not hits, 'Final QA/review still references a cleanup candidate; preserve/migrate evidence first: '+str(sorted(hits)))


def retained_snapshot(retiring):
    output = []
    # Keep all non-candidate project files. This explicitly protects old-named
    # World dependencies, glTF sidecars, source archives, samples and all QA.
    def visit(path):
        rel = path.relative_to(ROOT).as_posix()
        if path.name in {'node_modules','.git'} or path.is_relative_to(OUT) or rel in retiring:
            return
        safe_path(path)
        if path.is_dir():
            for child in path.iterdir():
                visit(child)
        elif path.is_file():
            output.append({'path':rel,'sha256':sha(path),'bytes':path.stat().st_size})
    for path in ROOT.iterdir():
        visit(path)
    return output


def typecheck():
    node = shutil.which('node')
    compiler = ROOT/'node_modules/typescript/bin/tsc'
    require(bool(node) and compiler.is_file(), 'Existing Node/TypeScript compiler required; nothing will be installed')
    result = subprocess.run([node,str(compiler),'--noEmit','--incremental','false'],cwd=ROOT,
                            capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=180)
    require(result.returncode == 0, 'V5 entry typecheck failed: '+result.stdout+result.stderr)
    return {'exitCode':result.returncode,'command':[node,str(compiler),'--noEmit','--incremental','false']}


def save_recovery_sources():
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    archive = OUT/f'source-before-cleanup-v5-{stamp}.zip'
    safe_path(archive,missing_ok=True)
    created = not archive.exists()
    sources = []
    for rel in ['src','scripts','docs']:
        sources += [path for path in tree(ROOT/rel) if path.is_file() and '__pycache__' not in path.parts]
    sources += [ROOT/name for name in ['package.json','package-lock.json','tsconfig.json','README.md']]
    baseline = ROOT/'research/revision-v5/baseline-v4'
    if present(baseline):
        sources += [path for path in tree(baseline) if path.is_file() and path.suffix.lower() in {'.json','.md','.txt'}]
    prior = ROOT/'audio/selected-prior'
    if present(prior):
        # Historical selected-prior is not an audio-only directory: it contains
        # unique Python sources and SRTs. Preserve every non-audio item exactly.
        sources += [path for path in tree(prior) if path.is_file() and path.suffix.lower() not in {'.wav','.m4a','.mp3','.flac','.aac'}]
    sources += [ROOT/rel for rel in ALLOWLIST if rel.startswith('delivery/') and
                Path(rel).suffix.lower() in {'.md','.srt','.zip'} and present(ROOT/rel)]
    if not archive.exists():
        with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as output:
            for path in sorted(set(sources)):
                output.write(safe_path(path),path.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(archive) as output:
        require(output.testzip() is None, 'Recovery source archive CRC failure')
        for path in sources:
            require(hashlib.sha256(output.read(path.relative_to(ROOT).as_posix())).hexdigest() == sha(path),
                    'Recovery source archive is stale: '+str(path))
    return {'path':archive.relative_to(ROOT).as_posix(),'sha256':sha(archive),'bytes':archive.stat().st_size,'createdThisRun':created}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--execute',action='store_true',help='Delete only after every current V5 gate passes')
    parser.add_argument('--package',type=Path,default=PACKAGE)
    parser.add_argument('--package-manifest',type=Path,default=PACKAGE_MANIFEST)
    args = parser.parse_args()
    safe_path(OUT,missing_ok=True)
    OUT.mkdir(parents=True,exist_ok=True)
    plan = candidate_plan(hash_files=args.execute)
    write(OUT/'plan.json',plan)
    if not args.execute:
        print(json.dumps({'executed':False,'plannedBytes':plan['plannedBytes'],'fileCount':plan['plannedFileCount'],
                          'gateStatus':plan['gateStatus']},ensure_ascii=False))
        return
    require_idle()
    gate = acceptance_gate(args.package,args.package_manifest)
    reject_current_artifact_overlap(plan,args.package_manifest)
    precheck = typecheck()
    recovery = save_recovery_sources()
    retiring = {row['path'] for row in plan['files']} | set(plan['directories'])
    retained = retained_snapshot(retiring)
    write(OUT/'dependencies-before.json',retained)
    require_idle()
    require(acceptance_gate(args.package,args.package_manifest) == gate, 'Acceptance evidence changed during preflight')
    latest = candidate_plan(hash_files=True)
    require(latest['files'] == plan['files'] and latest['directories'] == plan['directories'], 'Cleanup candidates changed during preflight')
    result = {**plan,'gate':gate,'recoveryArchive':recovery,'typecheckBefore':precheck,'deletedFiles':[],'deletedBytes':0,'executed':True,'complete':False}
    try:
        for row in plan['files']:
            path = safe_path(ROOT/row['path'])
            require(identity(path) == {key:row[key] for key in ['bytes','mtimeNS','device','inode']} and sha(path) == row['sha256'],
                    'Candidate changed immediately before deletion: '+row['path'])
            path.unlink()
            result['deletedFiles'].append(row['path'])
            result['deletedBytes'] += row['bytes']
        for rel in sorted(plan['directories'],key=lambda x:len(PurePosixPath(x).parts),reverse=True):
            safe_path(ROOT/rel).rmdir()
        for row in retained:
            require(sha(safe_path(ROOT/row['path'])) == row['sha256'], 'Protected dependency changed after cleanup: '+row['path'])
        require(sha(VIDEO) == gate['videoSHA256'], 'Current final MP4 changed after cleanup')
        require(sha(DEPENDENCY_REVIEW) == gate['dependencyReviewSHA256'] and sha(ROOT/recovery['path']) == recovery['sha256'],
                'Dependency audit or recovery archive changed during cleanup')
        result.update(complete=True,dependencyHashesPreserved=True,typecheckAfter=typecheck(),finishedAtUTC=now(),
                      netFreedBytes=result['deletedBytes']-(recovery['bytes'] if recovery['createdThisRun'] else 0))
    except BaseException as exc:
        result['error'] = repr(exc)
        raise
    finally:
        write(OUT/'result.json',result)
    print(json.dumps({'executed':True,'complete':result['complete'],'deletedBytes':result['deletedBytes'],'files':len(result['deletedFiles'])},ensure_ascii=False))


if __name__ == '__main__':
    main()
