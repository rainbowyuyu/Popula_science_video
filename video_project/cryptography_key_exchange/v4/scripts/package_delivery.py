"""Allowlisted, QA-gated recovery ZIP; stdlib only. Default is a read-only plan.

No cleanup and no credential discovery outside this project. A recovery render
uses public/audio/master.wav and never needs the private voice reference.
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
import sys
import subprocess
import shutil
import uuid
import zipfile
import zlib

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE_ROOT = '密码学_没约过密码消息怎么保密_V4_工程'
TEXT_EXT = {'.ts', '.tsx', '.json', '.mjs', '.py', '.md', '.txt', '.srt', '.html', '.csv'}
TREE_RULES = {
    'src': {'.ts', '.tsx', '.json'},
    'scripts': {'.mjs', '.py'},
    'docs': {'.md', '.json'},
    'research': {'.md', '.json', '.txt', '.html', '.pdf', '.png', '.py'},
    'public/models': {'.glb'},
    'public/brand': {'.png', '.svg'},
    'public/textures': {'.png', '.jpg', '.jpeg', '.webp'},
    'public/papers': {'.png', '.jpg', '.jpeg'},
    'public/fonts': {'.woff2', '.txt'},
    'work/audio/processing': {'.json'},
    'work/models': {'.blend'},
}
AUDIO_METADATA = [
    'asr-review.json', 'audio-qa.json', 'beats.json', 'captions.json',
    'delivery-manifest.json', 'environment.json', 'music-analysis.json',
    'music-arrangement.json', 'narration.json', 'pause-audit.json',
    'pronunciation-decisions.json', 'seed-overrides.json', 'source-qa.json',
    'speech-overrides.json', 'story-used.json', 'v4-change-report.json',
    'voice-generation.json', 'word-events.json',
]
EXCLUDED_HISTORY = {'research/story-candidate.json'}
REQUIRED = [
    'package.json', 'package-lock.json', 'tsconfig.json',
    'src/index.tsx', 'src/Film.tsx', 'src/Camera.ts', 'src/World.ts',
    'src/timeline-data.json', 'src/captions-data.json', 'src/narration.json',
    'src/captions.json', 'src/story.json',
    'public/audio/master.wav', 'public/audio/narration.wav',
    'public/models/phone.glb', 'public/models/cup.glb', 'public/models/cake.glb',
    'public/models/router.glb', 'public/models/server.glb', 'public/models/table.glb',
    'public/models/cafebackground.glb', 'public/brand/logo.png',
    'public/papers/diffie-hellman-1976.png',
    'work/models/cryptography_product_assets.blend', 'work/models/birthday_cake.blend',
    'work/audio/voice-generation.json',
    'work/audio/source-qa.json', 'work/audio/audio-qa.json',
    'work/audio/music-arrangement.json', 'docs/audio-production.md',
    'docs/models-manifest.json', 'docs/models-textures.json',
    'work/audio/subtitles.srt', 'work/audio/narration.json', 'work/audio/captions.json',
    'src/word-events.json', 'src/beats.json', 'src/PigmentCup.ts', 'src/Mixing.ts',
    'src/Paper.ts', 'src/DocumentPrint.ts',
    'public/fonts/NotoSansSC.woff2', 'public/fonts/NotoSerifSC.woff2', 'public/fonts/OFL.txt',
    'work/audio/pronunciation-evidence/evidence.json', 'work/audio/ab-previews/manifest.json',
    'work/audio/v4-change-report.json', 'work/audio/pause-audit.json',
    'docs/audio-v4-changes.md', 'docs/audio-interface.md',
    'delivery/字幕_没约过密码消息怎么保密.srt',
    'delivery/解说稿_没约过密码消息怎么保密.md',
    'scripts/render.mjs', 'scripts/package_delivery.py',
]
GATE_FILES = ['work/qa/encoded-final.json', 'work/qa/av-sync.json', 'work/qa/motion.json']
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf-8',errors='replace')
CREDENTIAL_PATTERNS = [
    ('provider-api-key', re.compile(r'\bsk-(?:sp-)?[A-Za-z0-9_.-]{16,}')),
    ('aws-access-key', re.compile(r'\bAKIA[0-9A-Z]{16}\b')),
    ('private-key-pem', re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----')),
    ('credential-url', re.compile(r'https?://[^\s/:@]+:[^\s/@]+@')),
    ('literal-token-assignment', re.compile(r'''(?i)(?:api[_-]?key|access[_-]?token|authorization|auth[_-]?token)["']?\s*[:=]\s*["']([A-Za-z0-9+/_=.-]{24,})["']''')),
]

def sha(p: Path) -> str:
    h = hashlib.sha256()
    with p.open('rb') as f:
        for b in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(b)
    return h.hexdigest()

def load(relative: str):
    return json.loads((ROOT / relative).read_text(encoding='utf-8-sig'))

def reparse(p: Path) -> bool:
    s = p.lstat()
    return stat.S_ISLNK(s.st_mode) or bool(getattr(s, 'st_file_attributes', 0) & 0x400)

def safe_local(p: Path) -> Path:
    """Reject junctions/symlinks, including any parent inside the project."""
    relative = p.absolute().relative_to(ROOT.absolute())
    current = ROOT
    for part in relative.parts:
        current = current / part
        if reparse(current):
            raise RuntimeError(f'Reparse point is excluded: {relative.as_posix()}')
    if not p.resolve().is_relative_to(ROOT.resolve()):
        raise RuntimeError('Resolved package input escapes project')
    return p

def walk_allowed(relative: str, extensions: set[str]):
    base = ROOT / relative
    if not base.exists():
        return
    safe_local(base)
    for directory, dirs, names in os.walk(base, followlinks=False):
        parent = Path(directory)
        dirs[:] = [n for n in dirs if n not in {'__pycache__', '.git', 'node_modules'} and not reparse(parent / n)]
        for name in names:
            p = parent / name
            if p.suffix.lower() in extensions:
                yield safe_local(p)

def collect():
    selected = set()
    for relative, extensions in TREE_RULES.items():
        selected.update(walk_allowed(relative, extensions) or [])
    for relative in ['package.json', 'package-lock.json', 'tsconfig.json', 'public/audio/master.wav', 'public/audio/narration.wav', 'work/audio/subtitles.srt']:
        p = ROOT / relative
        if p.is_file():
            selected.add(safe_local(p))
    for directory in ['work/audio/raw', 'work/audio/clean']:
        for p in walk_allowed(directory, {'.wav'}) or []:
            if re.fullmatch(r's\d{2}\.wav', p.name):
                selected.add(p)
    for name in AUDIO_METADATA:
        p = ROOT / 'work/audio' / name
        if p.is_file():
            selected.add(safe_local(p))
    # Include only evidence named by current manifests, not stale preview takes.
    for relative, array_key, path_key, hash_key in [
        ('work/audio/ab-previews/manifest.json', 'files', 'output', 'outputSha256'),
        ('work/audio/pronunciation-evidence/evidence.json', 'clips', 'excerpt', 'excerptSha256'),
    ]:
        manifest_path = ROOT / relative
        selected.add(safe_local(manifest_path))
        for entry in load(relative)[array_key]:
            p = ROOT / entry[path_key]
            if p.parent != manifest_path.parent or p.suffix.lower() != '.wav':
                raise RuntimeError('Audio evidence must be a WAV beside its manifest')
            safe_local(p)
            if sha(p) != entry[hash_key]:
                raise RuntimeError('Audio evidence hash changed: ' + entry[path_key])
            source_key = 'source' if path_key == 'output' else 'wholeSource'
            source_hash_key = 'sourceSha256' if path_key == 'output' else 'wholeSourceSha256'
            source = safe_local(ROOT / entry[source_key])
            if source not in selected or sha(source) != entry[source_hash_key]:
                raise RuntimeError('Audio evidence refers to a non-current source: ' + entry[source_key])
            selected.add(p)
    review = ROOT / 'work/audio/readback-review.md'
    if review.is_file():
        selected.add(safe_local(review))
    # Only machine-readable QA, never preview videos or verbose service logs.
    for p in (ROOT / 'work/qa').glob('*.json'):
        selected.add(safe_local(p))
    for p in (ROOT / 'delivery').iterdir():
        if p.is_file() and p.suffix.lower() in {'.md', '.txt', '.srt', '.json'}:
            if p.name.startswith(('工程恢复包_', '恢复包_')):
                continue
            selected.add(safe_local(p))
    selected = {p for p in selected if p.relative_to(ROOT).as_posix() not in EXCLUDED_HISTORY}
    # No dotfiles/settings, secret stores, binary dependencies or source voices.
    for p in selected:
        parts = p.relative_to(ROOT).parts
        if any(x.startswith('.') or x.lower() in {'credentials', 'secrets', 'node_modules', 'bundle', 'opus-runs', 'privatevoice', 'private-voice', 'clone-reference', 'prior'} for x in parts) or p.name == 'story-before-v4.json':
            raise RuntimeError(f'Forbidden input selected: {p.relative_to(ROOT)}')
    missing = [f for f in REQUIRED if ROOT / f not in selected]
    cue_ids=[c['id'] for c in load('src/story.json')['cues']]
    for stage in ('raw', 'clean'):
        missing += [f'work/audio/{stage}/{cue_id}.wav' for cue_id in cue_ids if ROOT / f'work/audio/{stage}/{cue_id}.wav' not in selected]
    if missing:
        raise RuntimeError('Required recovery files missing: ' + ', '.join(missing))
    return sorted(selected, key=lambda p: p.relative_to(ROOT).as_posix())

def scan_credentials(paths):
    findings = []
    for p in paths:
        if p.suffix.lower() not in TEXT_EXT:
            continue
        text = p.read_text(encoding='utf-8', errors='replace')
        for name, pattern in CREDENTIAL_PATTERNS:
            if pattern.search(text):
                findings.append({'file': p.relative_to(ROOT).as_posix(), 'pattern': name})
    if findings:
        # Never print matching text or the suspected credential.
        raise RuntimeError('Credential-like data blocks packaging: ' + json.dumps(findings, ensure_ascii=False))
    return {'scannedTextFiles': sum(p.suffix.lower() in TEXT_EXT for p in paths), 'findings': 0, 'scope': 'Allowlisted project text only; private references, external settings and scratch provider runs excluded.'}

def estimate(p: Path) -> int:
    size = p.stat().st_size
    if size <= 196608:
        return len(zlib.compress(p.read_bytes(), 6)) + 180
    with p.open('rb') as f:
        chunks = []
        for at in (0, (size - 65536) // 2, size - 65536):
            f.seek(at)
            chunks.append(f.read(65536))
    sample = b''.join(chunks)
    ratio = len(zlib.compress(sample, 6)) / len(sample)
    return int(size * ratio) + 180

def check_final_qa():
    missing = [p for p in GATE_FILES if not (ROOT / p).is_file()]
    if missing:
        raise RuntimeError('Final QA is incomplete: ' + ', '.join(missing))
    encoded, sync, motion = [load(p) for p in GATE_FILES]
    if encoded.get('passed') is not True or sync.get('passed') is not True or motion.get('violations'):
        raise RuntimeError('Encoded, sync or motion QA has not passed')
    if motion.get('status') not in {'PASS', 'PASS_WITH_REVIEW_FLAGS'}:
        raise RuntimeError('Motion QA status is not accepted')
    video = Path(encoded['video'])
    if not video.resolve().is_relative_to(ROOT.resolve()):
        raise RuntimeError('Final video must belong to V4')
    if not video.is_file() or video.resolve() != Path(sync['video']).resolve():
        raise RuntimeError('QA reports do not refer to the same existing final video')
    stat_now = video.stat()
    if stat_now.st_size != encoded['bytes'] or stat_now.st_size != sync['fileBytes'] or stat_now.st_mtime_ns != sync['fileMtimeNs']:
        raise RuntimeError('Final video changed after QA')
    if sha(video) != encoded['sha256']:
        raise RuntimeError('Final video hash differs from passed decode QA')
    if sha(ROOT / 'public/audio/master.wav') != sync['masterSha256']:
        raise RuntimeError('Master changed after final sync QA')
    if sha(ROOT / 'src/narration.json') != encoded['sourceNarrationSha256']:
        raise RuntimeError('Narration changed after final QA')
    for relative, digest in motion.get('sourceSha256', {}).items():
        if sha(ROOT / relative) != digest:
            raise RuntimeError('Motion source changed after QA: ' + relative)
    visual_file=ROOT/'work/qa/visual-final.json'
    if not visual_file.exists():raise RuntimeError('Final representative visual review is missing')
    visual=load('work/qa/visual-final.json')
    if visual.get('representativeEncodedReviewCompleted') is not True or visual.get('videoSha256')!=encoded['sha256']:
        raise RuntimeError('Visual review is not complete or refers to another video')
    return {'passed': True, 'finalVideoSha256': encoded['sha256'], 'finalVideoBytes': stat_now.st_size, 'reports': GATE_FILES+['work/qa/visual-final.json'], 'motionStatus': motion['status'], 'limits': 'QA gate covers encoded format/full decode, bounded audio sync, numeric camera motion and recorded representative visual review. It does not assert complete subjective listening.'}

def verify_extracted_source(archive: Path):
    """Extract into a unique project-owned directory, typecheck, then remove only it."""
    node=shutil.which('node')
    tsc=ROOT/'node_modules/typescript/bin/tsc'
    if not node or not tsc.is_file():raise RuntimeError('Existing Node/TypeScript is needed for recovery verification')
    parent=ROOT/'work/recovery-checks';parent.mkdir(exist_ok=True)
    safe_local(parent)
    check=parent/('package-'+uuid.uuid4().hex)
    check.mkdir();safe_local(check)
    with zipfile.ZipFile(archive,'r') as z:
        for member in z.infolist():
            rel=Path(member.filename)
            if rel.is_absolute() or '..' in rel.parts or not rel.parts or rel.parts[0]!=ARCHIVE_ROOT:
                raise RuntimeError('Unsafe archive member path')
            if stat.S_ISLNK(member.external_attr>>16):raise RuntimeError('Symlink archive entry is forbidden')
            destination=(check/rel).resolve()
            if not destination.is_relative_to(check.resolve()):raise RuntimeError('Archive member escaped recovery directory')
        z.extractall(check)
    project=check/ARCHIVE_ROOT
    r=subprocess.run([node,str(tsc),'--noEmit','-p',str(project/'tsconfig.json')],cwd=ROOT,
                     capture_output=True,text=True,encoding='utf8',errors='replace',timeout=180)
    report={'passed':r.returncode==0,'command':'node existing/typescript/bin/tsc --noEmit -p extracted/tsconfig.json',
            'exitCode':r.returncode,'stdout':r.stdout,'stderr':r.stderr,
            'dependencyScope':'Existing project lock-compatible dependency tree resolved from ancestor; not a fresh npm install',
            'extractedFiles':sum(1 for p in check.rglob('*') if p.is_file()),'temporaryExtraction':str(check)}
    if r.returncode:
        (ROOT/'work/qa/recovery-source-failure.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf8')
        raise RuntimeError('Extracted source typecheck failed; preserved scoped extraction: '+str(check))
    # Only this freshly-created, verified path is removed; no junction traversal.
    resolved=check.resolve()
    if not resolved.is_relative_to(parent.resolve()) or resolved==parent.resolve():raise RuntimeError('Unsafe recovery cleanup target')
    safe_local(check)
    for directory,dirs,names in os.walk(check,followlinks=False):
        for name in dirs+names:
            if reparse(Path(directory)/name):raise RuntimeError('Unexpected reparse point in extraction')
    shutil.rmtree(check)
    report['temporaryExtractionRemoved']=not check.exists()
    return report

def build(output: Path, paths, security, gate):
    if not output.resolve().is_relative_to((ROOT/'delivery').resolve()):
        raise RuntimeError('Recovery package must be written in V4 delivery')
    if output.suffix.lower()!='.zip':raise RuntimeError('Recovery package must use .zip extension')
    if output.exists() or output.with_suffix('.zip.partial').exists():
        raise RuntimeError('Output already exists; choose a new --output, no overwrite')
    output.parent.mkdir(parents=True, exist_ok=True)
    inventory = []
    for p in paths:
        s = p.stat()
        inventory.append({'path': p.relative_to(ROOT).as_posix(), 'bytes': s.st_size, 'mtimeNs': s.st_mtime_ns, 'sha256': sha(p)})
    manifest = {'format': 1, 'createdAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'rootFolder': ARCHIVE_ROOT, 'qaGate': gate, 'securityScan': security, 'fileCount': len(inventory), 'uncompressedBytes': sum(x['bytes'] for x in inventory), 'entries': inventory, 'excluded': ['node_modules and junctions', 'work/bundle', 'video previews and audio previews not named by the current A/B or pronunciation manifests', 'old audio takes, prior directories, story-before-v4.json and superseded story candidate', 'private reference voice/model weights', 'credentials and provider scratch runs', 'duplicate work/audio master/narration/score/premaster/music-source WAV', 'original copyrighted BGM recording'], 'recovery': 'npm ci; npm run check; npm run render. Existing public/audio/master.wav supplies voice and music. External TTS/reference/BGM source is unnecessary for unchanged rendering.'}
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    partial = output.with_suffix('.zip.partial')
    with zipfile.ZipFile(partial, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as z:
        for p, entry in zip(paths, inventory):
            z.write(p, f'{ARCHIVE_ROOT}/{entry["path"]}')
            s = p.stat()
            if s.st_size != entry['bytes'] or s.st_mtime_ns != entry['mtimeNs']:
                raise RuntimeError('Input changed during packaging: ' + entry['path'])
        z.writestr(f'{ARCHIVE_ROOT}/恢复清单.json', manifest_bytes)
    # Full streamed read exercises ZIP CRC and independently verifies all SHA-256.
    with zipfile.ZipFile(partial, 'r') as z:
        expected = {f'{ARCHIVE_ROOT}/{e["path"]}': e for e in inventory}
        if len(z.namelist()) != len(expected) + 1 or len(z.namelist()) != len(set(z.namelist())):
            raise RuntimeError('Unexpected ZIP entries or duplicate names')
        for name, entry in expected.items():
            h = hashlib.sha256()
            length = 0
            with z.open(name) as f:
                for chunk in iter(lambda: f.read(4 * 1024 * 1024), b''):
                    h.update(chunk)
                    length += len(chunk)
            if h.hexdigest() != entry['sha256'] or length != entry['bytes']:
                raise RuntimeError('Archived content hash mismatch: ' + entry['path'])
        if z.read(f'{ARCHIVE_ROOT}/恢复清单.json') != manifest_bytes:
            raise RuntimeError('Archive inventory mismatch')
    recovery=verify_extracted_source(partial)
    partial.rename(output)
    digest = sha(output)
    report = {'archive': str(output), 'sha256': digest, 'bytes': output.stat().st_size, 'fileCountIncludingInventory': len(inventory) + 1, 'uncompressedBytes': manifest['uncompressedBytes'], 'allEntryCRCAndSHA256Verified': True, 'securityScan': security, 'qaGate': gate,'recoverySourceCompile':recovery}
    output.with_suffix('.sha256').write_text(f'{digest}  {output.name}\n', encoding='utf-8')
    output.with_suffix('.inventory.json').write_text(manifest_bytes.decode('utf-8'), encoding='utf-8')
    output.with_suffix('.verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    return report

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group()
    action.add_argument('--plan', action='store_true', help='Read-only inventory/security/size estimate (default)')
    action.add_argument('--create', action='store_true', help='Build only after all final QA gates pass')
    parser.add_argument('--output', type=Path, default=ROOT / 'delivery/工程恢复包_没约过密码消息怎么保密_V4.zip')
    args = parser.parse_args()
    paths = collect()
    security = scan_credentials(paths)
    if not args.create:
        byte_count = sum(p.stat().st_size for p in paths)
        print(json.dumps({'mode': 'plan-only; no archive written', 'files': len(paths), 'uncompressedBytes': byte_count, 'estimatedZipBytes': sum(estimate(p) for p in paths), 'estimateMethod': 'Deflate samples from start/middle/end; approximate only', 'security': security, 'finalQAPresent': {p: (ROOT / p).is_file() for p in GATE_FILES}, 'output': str(args.output)}, ensure_ascii=False, indent=2))
        return
    gate = check_final_qa()
    print(json.dumps(build(args.output.resolve(), paths, security, gate), ensure_ascii=False, indent=2))

if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, ValueError, zipfile.BadZipFile) as exc:
        print(str(exc), file=sys.stderr)
        raise SystemExit(1)
