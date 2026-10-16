"""Remove only explicit V8 rebuildable caches after verified delivery exists."""
from pathlib import Path
import argparse, hashlib, json, shutil, stat

ROOT = Path(__file__).resolve().parents[2]

def sha(p):
    h = hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda: f.read(4 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()

def read(p):
    return json.loads(p.read_text('utf8'))

def check_tree(p):
    resolved = p.resolve()
    assert resolved.is_relative_to(ROOT) and resolved != ROOT
    entries = [p, *p.rglob('*')]
    for entry in entries:
        attributes = getattr(entry.lstat(), 'st_file_attributes', 0)
        assert not entry.is_symlink() and not attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT, entry
        assert entry.name != '.git', entry
        assert entry.resolve().is_relative_to(ROOT), entry
    return sum(entry.stat().st_size for entry in entries if entry.is_file())

ap = argparse.ArgumentParser()
ap.add_argument('--apply', action='store_true')
args = ap.parse_args()
manifest = read(ROOT / 'delivery/latest-v8.json')
qa = read(Path(manifest['qa']))
video = Path(manifest['video'])
assert qa['releaseApproved'] and qa['audioVerified'] and qa['sourceStable']
assert sha(video) == manifest['videoSHA256'] == qa['videoSHA256']
render = read(Path(manifest['renderResult']))
protected = {str((ROOT / p).resolve()): h for p, h in render['hashes'].items()}
for p, digest in protected.items():
    assert sha(Path(p)) == digest

names = ['v8-drug-cutaway', 'v8-mechanism-first', 'v8-mechanism-second',
         'v8-protein-smooth', 'v8-whole-preview', 'v8-final-preview',
         'v8-risefix-film', 'v8-full-final', 'v8-full-corrected']
targets = [ROOT / 'tmp' / name / 'bundle' for name in names]
targets += [ROOT / 'tmp/v8-full-final/frozen', ROOT / 'tmp/v8-full-final/silent.mp4',
            ROOT / 'tmp/v8-full-corrected/silent.mp4']
rows = []
for target in targets:
    if not target.exists():
        continue
    size = check_tree(target)
    assert not any(Path(p).is_relative_to(target.resolve()) for p in protected)
    rows.append({'path': str(target.resolve()), 'bytes': size,
                 'reason': 'Superseded preview bundle, aborted render copy, or duplicate silent video'})

log = ROOT / 'research/revision-v8/cleanup-result.json'
assert not log.exists(), 'Do not overwrite an earlier cleanup receipt'
free_before = shutil.disk_usage(ROOT).free
if args.apply:
    for row in rows:
        p = Path(row['path'])
        assert check_tree(p) == row['bytes']
        if p.is_dir():
            shutil.rmtree(p)
        else:
            p.unlink()
        row['removed'] = not p.exists()
    for p, digest in protected.items():
        assert sha(Path(p)) == digest
    assert sha(video) == manifest['videoSHA256']
report = {'applied': args.apply, 'bytes': sum(r['bytes'] for r in rows),
          'observedVolumeFreeBytesBefore': free_before,
          'observedVolumeFreeBytesAfter': shutil.disk_usage(ROOT).free,
          'paths': rows, 'protectedSourceFiles': len(protected),
          'preserved': ['Final MP4 and source snapshot', 'V7 fallback', 'Selected voice sources',
                        'Research inputs', 'QA frames/contact sheets', 'All src/public files']}
if args.apply:
    log.write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf8')
print(json.dumps(report, ensure_ascii=False, indent=2))
