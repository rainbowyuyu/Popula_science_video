"""Install the portable V8 dependency lock after extracting both recovery ZIPs.

Original package files are preserved under work/v8/recovery/original-package*.
No scene, media, voice or credentials are modified. Uses npm ci with lifecycle
scripts disabled; full rendering still needs FFmpeg and a WebGPU browser/GPU.
"""
from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RECOVERY = ROOT / 'work/v8/recovery'


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--prepare-only', action='store_true')
    args = ap.parse_args()
    report = json.loads((RECOVERY / 'recovery-validation.json').read_text(encoding='utf8'))
    for name in ['package.json', 'package-lock.json']:
        portable, current = RECOVERY / name, ROOT / name
        expected = report['portableFiles'][name]
        if sha(portable) != expected:
            raise ValueError('Portable dependency file changed: ' + name)
        if sha(current) not in [report['originalFiles'][name], expected]:
            raise ValueError('Root dependency file has unrelated changes: ' + name)
        saved = RECOVERY / ('original-' + name)
        if not saved.exists():
            shutil.copy2(current, saved)
        elif sha(saved) != report['originalFiles'][name]:
            raise ValueError('Original-file backup does not match production snapshot')
        shutil.copy2(portable, current)
    if not args.prepare_only:
        if os.name == 'nt':
            # Fixed commands only; no user text or paths interpolated into cmd.
            subprocess.run([os.environ.get('ComSpec', 'cmd.exe'), '/d', '/s', '/c',
                            'npm ci --ignore-scripts --no-audit --no-fund'], cwd=ROOT, check=True)
            subprocess.run([os.environ.get('ComSpec', 'cmd.exe'), '/d', '/s', '/c',
                            'npm run check'], cwd=ROOT, check=True)
        else:
            subprocess.run(['npm', 'ci', '--ignore-scripts', '--no-audit', '--no-fund'], cwd=ROOT, check=True)
            subprocess.run(['npm', 'run', 'check'], cwd=ROOT, check=True)
    print(json.dumps({'portableLockInstalled': True, 'npmAndTypescriptChecked': not args.prepare_only,
                      'fullFreshMachineRenderTested': False}))


if __name__ == '__main__':
    main()
