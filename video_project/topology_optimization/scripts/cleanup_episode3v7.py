"""Remove only reviewed, unchanged episode-3 cache/duplicate files after final QA.

Canonical assets, source recordings, solver evidence and unrelated projects are
never candidates. A changed file is preserved. Default is a fresh dry run.
"""
from pathlib import Path
import argparse
import hashlib
import json
import stat
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
REPORTS = ROOT / 'research/episode3v7'


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def safe_file(path):
    path = Path(path)
    resolved = path.resolve(strict=True)
    if not resolved.is_relative_to(ROOT) or resolved == ROOT:
        raise ValueError('Outside this film project')
    for item in [path, *path.parents]:
        if item == ROOT.parent:
            break
        info = item.lstat()
        if stat.S_ISLNK(info.st_mode) or getattr(info, 'st_file_attributes', 0) & 1024:
            raise ValueError('Symlink or reparse point')
    if not resolved.is_file():
        raise ValueError('Not a regular file')
    return resolved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    plan = json.loads((REPORTS/'cleanup-plan.json').read_text(encoding='utf-8'))
    audit_path = REPORTS/'visual-qa/final/final-media-audit.json'
    video_hash = None
    if args.execute:
        audit = json.loads(audit_path.read_text(encoding='utf-8'))
        if not audit.get('machine_checks_pass'):
            raise RuntimeError('Final media checks have not passed')
        review = json.loads((REPORTS/'final-visual-review.json').read_text(encoding='utf-8'))
        if not review.get('assistant_sample_review_pass'):
            raise RuntimeError('Final sampled visual review has not passed')
        video = safe_file(audit['video'])
        video_hash = digest(video)
        if video_hash != audit['video_sha256'] or video_hash != review['video_sha256']:
            raise RuntimeError('Final video changed after verification')
    accepted, skipped = [], []
    for group in plan['candidates']:
        for item in group['files']:
            try:
                target = safe_file(item['path'])
                # Even a valid plan cannot remove anything from canonical trees.
                if target.is_relative_to(ROOT/'public') or target.is_relative_to(ROOT/'src') or target.is_relative_to(ROOT/'research'):
                    raise ValueError('Canonical asset/source/evidence tree')
                if digest(target) != item['sha256']:
                    raise ValueError('Changed since reviewed inventory')
                if item.get('retained_canonical'):
                    original = safe_file(item['retained_canonical'])
                    if original == target or digest(original) != item['retained_sha256']:
                        raise ValueError('Retained canonical copy does not match')
                accepted.append({'path': str(target), 'bytes': target.stat().st_size,
                                 'sha256': item['sha256'], 'group': group['id']})
            except (OSError, ValueError) as error:
                skipped.append({'path': item['path'], 'reason': str(error)})
    # Validate all candidates before the first mutation, then delete exact files.
    deleted = []
    if args.execute:
        for item in accepted:
            target = safe_file(item['path'])
            if digest(target) != item['sha256']:
                skipped.append({'path': str(target), 'reason': 'Changed during cleanup'})
                continue
            target.unlink()
            deleted.append(item)
    result = {'created_utc': datetime.now(timezone.utc).isoformat(),
              'executed': args.execute, 'video_sha256': video_hash,
              'method': 'Exact reviewed files only; unchanged hashes; retained duplicates rehashed; no recursive deletion.',
              'candidate_bytes_now': sum(x['bytes'] for x in accepted),
              'deleted_bytes': sum(x['bytes'] for x in deleted),
              'accepted': accepted, 'deleted': deleted, 'skipped': skipped}
    name = 'cleanup-execution.json' if args.execute else 'cleanup-dry-run.json'
    (REPORTS/name).write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps({k: result[k] for k in ['executed', 'candidate_bytes_now', 'deleted_bytes']}))
    print(f'files accepted={len(accepted)}, deleted={len(deleted)}, preserved/skipped={len(skipped)}')


if __name__ == '__main__':
    main()
