"""Freeze actual render inputs and reject an export whose inputs changed."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]


def digest(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def inputs():
    files = [ROOT / 'package.json', ROOT / 'scripts/render.mjs']
    for folder in ['src', 'public']:
        files.extend(p for p in (ROOT / folder).rglob('*') if p.is_file())
    return {p.relative_to(ROOT).as_posix(): digest(p) for p in sorted(files)}


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--record', action='store_true')
    p.add_argument('--manifest', default='research/visual-v3/render-inputs.json')
    args = p.parse_args()
    path = ROOT / args.manifest
    actual = inputs()
    if args.record:
        assert not path.exists(), 'Choose a new manifest or explicitly archive the prior render record.'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps({'recordedAtUTC': datetime.now(timezone.utc).isoformat(),
                                    'files': actual}, indent=2), encoding='utf-8')
        print(json.dumps({'recorded': len(actual), 'manifest': str(path)}))
    else:
        expected = json.loads(path.read_text(encoding='utf-8'))['files']
        changed = sorted(k for k in set(actual) | set(expected) if actual.get(k) != expected.get(k))
        print(json.dumps({'unchanged': not changed, 'files': len(actual), 'changed': changed}))
        if changed:
            raise SystemExit(1)


if __name__ == '__main__':
    main()
