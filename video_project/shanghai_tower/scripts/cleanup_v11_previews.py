"""Retire exactly the two V11 layout-preview bundles after delivery acceptance."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research/qa/v11-cleanup'
TAGS = ['v11-layout1', 'v11-layout2']

def read(p):
    return json.loads(p.read_text('utf-8-sig'))

def sha(p):
    with p.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()

def save(name, value):
    (OUT/name).write_text(json.dumps(value, ensure_ascii=False, indent=2), 'utf-8')

def main():
    auto = read(ROOT/'research/qa/v11-final/automatic-report.json')
    visual = read(ROOT/'research/qa/v11-final/visual-review.json')
    delivery = read(ROOT/'delivery/交付校验_V11.json')
    assert auto['automaticChecksPass'] and visual['sampledVisualReviewPass']
    assert delivery['automaticChecksPass'] and delivery['sampledVisualReviewPass']
    assert auto['videoSHA256'] == visual['videoSHA256'] == delivery['videoSHA256']
    OUT.mkdir(parents=True, exist_ok=True)
    assert not (OUT/'apply-started.json').exists(), 'Cleanup already started; inspect its record.'
    protected = {}
    def protect(p, expected=None):
        assert p.is_file()
        value = sha(p)
        if expected is not None:
            assert value == expected, str(p)
        protected[str(p)] = value
    for tag in ['v10-final', 'v11-final']:
        lock_path = ROOT/f'research/visual/{tag}-lock.json'
        lock = read(lock_path)
        protect(lock_path)
        bundle = Path(lock['bundle'])
        for name, digest in lock['bundleFiles'].items():
            protect(bundle/name, digest)
        for name, digest in lock['files'].items():
            if name.startswith('public/'):
                protect(bundle/name, digest)
            if tag == 'v11-final':
                protect(ROOT/name, digest)
    for name in ['ShanghaiTower_1080p_v6.mp4', 'ShanghaiTower_1080p_v7.mp4',
                 'ShanghaiTower_1080p_v10.mp4', 'ShanghaiTower_1080p_v11.mp4']:
        protect(ROOT/'delivery'/name)
    protect(Path(auto['video']), auto['videoSHA256'])
    candidates = []
    for tag in TAGS:
        record = read(ROOT/f'tmp/stills-{tag}/stills.json')
        target = Path(record['runDir'])
        assert target.resolve() == target and target.parent == ROOT/'tmp/render-runs'
        assert target.name.startswith(tag+'-') and record['tag'] == tag
        assert target.is_dir() and not target.is_symlink() and not target.is_junction()
        files = []
        for folder, dirs, names in os.walk(target, followlinks=False):
            for name in dirs+names:
                p = Path(folder)/name
                assert name != '.git' and not p.is_symlink() and not p.is_junction()
                assert p.resolve().is_relative_to(target)
            for name in names:
                p = Path(folder)/name
                assert str(p) not in protected and os.lstat(p).st_nlink == 1
                files.append({'path':str(p), 'bytes':p.stat().st_size, 'sha256':sha(p)})
        candidates.append({'tag':tag, 'path':str(target), 'bytes':sum(p['bytes'] for p in files), 'files':files})
    save('plan.json', {'createdAtUTC':datetime.now(timezone.utc).isoformat(),
        'candidates':candidates, 'protectedSHA256':protected,
        'retained':'All production bundles, original accepted videos, source, calculations, review frames and source manifests.'})
    with zipfile.ZipFile(OUT/'preview-source-variants.zip', 'x', zipfile.ZIP_DEFLATED) as archive:
        for item in candidates:
            source_map = read(Path(item['path'])/'bundle/bundle.js.map')
            for name, content in zip(source_map['sources'], source_map['sourcesContent']):
                if content is not None and '/src/' in name:
                    short = name.split('/src/', 1)[1]
                    if '..' not in Path(short).parts:
                        archive.writestr(item['tag']+'/src/'+short, content)
    save('apply-started.json', {'timeUTC':datetime.now(timezone.utc).isoformat()})
    removed = []
    for item in candidates:
        target = Path(item['path'])
        for file in item['files']:
            p = Path(file['path'])
            assert sha(p) == file['sha256'] and p.resolve().is_relative_to(target)
        shutil.rmtree(target)
        assert not target.exists()
        removed.append({k:item[k] for k in ['tag','path','bytes']})
        save('progress.json', {'removed':removed})
    assert all(Path(p).is_file() and sha(Path(p)) == value for p,value in protected.items())
    report = {'completedAtUTC':datetime.now(timezone.utc).isoformat(), 'removed':removed,
        'releasedBytes':sum(x['bytes'] for x in removed), 'allProtectedHashesUnchanged':True,
        'protectedFiles':len(protected), 'videoSHA256':auto['videoSHA256']}
    save('result.json', report)
    print(json.dumps(report))

if __name__ == '__main__':
    main()
