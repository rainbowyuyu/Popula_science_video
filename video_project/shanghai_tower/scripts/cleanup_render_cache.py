"""Remove only this film's verified, reproducible render caches after final QA."""
from pathlib import Path
from datetime import datetime, timezone
import hashlib
import json
import os
import shutil
import argparse

ROOT = Path(__file__).resolve().parents[1]
# Every render-runs directory is a disposable Remotion bundle. The encoded
# delivery, QA reports and source inputs are recorded separately, so keeping
# these bundles after final QA only consumes several gigabytes.
TARGETS = ['tmp/bundle', 'tmp/patch-bundle', 'tmp/patches', 'tmp/stills', 'tmp/render-runs']


def load(path):
    return json.loads(path.read_text('utf-8-sig'))


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--qa-dir', required=True)
    args = parser.parse_args()
    QA = (ROOT / args.qa_dir).resolve()
    assert QA.is_relative_to(ROOT / 'research/qa')
    delivery = load(ROOT / 'delivery/交付校验.json')
    automatic = load(QA / 'automatic-report.json')
    visual = load(QA / 'visual-review.json')
    assert delivery['automaticChecksPass'] and delivery['sampledVisualReviewPass']
    assert automatic['automaticChecksPass'] and visual['sampledVisualReviewPass']
    assert automatic['videoSHA256'] == visual['videoSHA256']
    assert (ROOT / delivery['qaReport']).resolve() == QA / 'automatic-report.json'
    video = Path(automatic['video'])
    assert video.is_relative_to(ROOT) and sha(video) == automatic['videoSHA256']
    assert any(x['sha256'] == automatic['videoSHA256'] for x in delivery['files'])
    candidates = []
    segment_names = [p.relative_to(ROOT).as_posix() for p in (ROOT / 'tmp').glob('segment-*-*.mp4')]
    for name in TARGETS + segment_names:
        target = ROOT / name
        if not target.exists():
            continue
        resolved = target.resolve()
        assert resolved == target and resolved.is_relative_to(ROOT / 'tmp')
        assert not target.is_symlink() and not target.is_junction()
        files = [target] if target.is_file() else []
        for folder, dirs, names in os.walk(target, followlinks=False):
            for entry in dirs + names:
                p = Path(folder) / entry
                assert not p.is_symlink() and not p.is_junction(), str(p)
                assert p.name != '.git', str(p)
            files.extend(Path(folder) / n for n in names)
        candidates.append({'path': name, 'bytes': sum(p.stat().st_size for p in files), 'files': len(files)})
    protected = {}
    for directory in ['audio', 'delivery', 'docs', 'model', 'public', 'scripts', 'src', 'viewer']:
        for path in (ROOT / directory).rglob('*'):
            if path.is_file() and '__pycache__' not in path.parts:
                protected[path.relative_to(ROOT).as_posix()] = sha(path)
    for name in ['package.json', 'package-lock.json', 'tmp/final-render.json']:
        path = ROOT / name
        if path.is_file():
            protected[name] = sha(path)
    plan = {'createdAtUTC': datetime.now(timezone.utc).isoformat(), 'candidates': candidates,
            'protectedSHA256': protected,
            'retained': ['Old complete video and source backup retained while requested music is pending.',
                         'Research, solver evidence, all source assets and other projects are untouched.']}
    (QA / 'cleanup-plan.json').write_text(json.dumps(plan, ensure_ascii=False, indent=2), 'utf-8')
    for item in candidates:
        target = ROOT / item['path']
        if target.is_dir():
            shutil.rmtree(target)
        else:
            target.unlink()
    unchanged = all((ROOT / name).is_file() and sha(ROOT / name) == digest for name, digest in protected.items())
    report = {'finishedAtUTC': datetime.now(timezone.utc).isoformat(), 'removed': candidates,
              'releasedBytes': sum(p['bytes'] for p in candidates), 'protectedFiles': len(protected),
              'allProtectedHashesUnchanged': unchanged, 'videoSHA256': sha(video)}
    (QA / 'cleanup-result.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), 'utf-8')
    assert unchanged
    print(json.dumps(report, ensure_ascii=False))


if __name__ == '__main__':
    main()
