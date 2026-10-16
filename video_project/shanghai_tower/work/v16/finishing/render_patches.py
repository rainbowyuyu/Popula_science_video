"""Render declared V16 finishing envelopes from one reviewed bundle."""
from pathlib import Path
import argparse
import hashlib
import json
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[3]


def digest(path):
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--kind', choices=['main', 'vertical'], required=True)
    parser.add_argument('--bundle', required=True)
    parser.add_argument('--concurrency', type=int, default=2)
    args = parser.parse_args()
    case = ROOT / 'work/v16/finishing' / args.kind
    plan = json.loads((case / 'plan.json').read_text(encoding='utf-8-sig'))
    freeze = ROOT / 'research/qa/v16/source-freeze.json'
    source = {'bundle': str(Path(args.bundle).resolve()), 'sourceFreezeSHA256': digest(freeze),
              'changedSources': {p: digest(ROOT / p) for p in ['src/FilmV16.tsx', 'src/v16/V16CameraRig.ts']}}
    (case / 'patch-source.json').write_text(json.dumps(source, indent=2), encoding='utf-8')
    for item in plan['segments']:
        if not item['replace']:
            continue
        a, b = item['frames']
        command = ['node', 'scripts/render-v16.mjs', '--bundle=' + args.bundle,
                   f'--frames={a}-{b}', '--tag=' + item['tag'], '--silent',
                   '--concurrency=' + str(args.concurrency)]
        if args.kind == 'vertical':
            command.append('--vertical')
        print(f"Rendering {item['patchId']}: frames {a}–{b}", flush=True)
        subprocess.run(command, cwd=ROOT, check=True)
        marker = ROOT / f'tmp/v16/v16-{args.kind}-render.json'
        record = json.loads(marker.read_text(encoding='utf-8-sig'))
        assert record['success'] and record['frames'] == [a, b]
        assert Path(record['outputLocation']).resolve() == Path(item['expectedFile']).resolve()
        shutil.copy2(marker, item['expectedRenderMarker'])
    print(f"All {args.kind} replacement segments completed", flush=True)


if __name__ == '__main__':
    main()
