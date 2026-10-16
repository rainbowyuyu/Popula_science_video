"""Read/check-only cleanup validation; fixture additions stay in C task work.

Never runs --delete, unlink, rmdir or registry writes. No production deletion.
"""
from pathlib import Path
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import uuid
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('cleanup_v10', Path(__file__).with_name('cleanup-v10.py'))
c = importlib.util.module_from_spec(spec)
spec.loader.exec_module(c)


def main():
    out = c.production_roots()
    folder = c.safe_output_path(out / 'work/cleanup-v10' / ('validation-' + uuid.uuid4().hex))
    folder.mkdir(parents=True, exist_ok=False)
    tests = []
    def refusal(operation):
        try:
            operation()
        except c.PackageError:
            return
        raise AssertionError('Expected cleanup refusal')

    for target in [out, c.ROOT, out.parent / 'rainbow_arc_v09/work/bundle',
                   c.ROOT.parent / 'rainbow_arc_2026_v09/work/render-browser-v09',
                   c.ROOT / 'node_modules', c.ROOT / 'public/audio_v10/master-v10.wav',
                   out / 'work/qwen-v10/generated/opening_mist/provider.mp4',
                   out / 'work/audio-v10/narration-v10.wav', out / 'delivery/any.mp4',
                   out / 'work/seams-v10/contact-0.png',
                   out / 'work/encoded-frames-v10/frame-00000.jpg']:
        refusal(lambda target=target: c.allowed(target, out))
    tests.append({'test': 'project/V09/node_modules/source/Qwen/audio/delivery/contact/final-frame allowlist rejection', 'passed': True})
    for target in [out / 'work/bundle/replaceable.js', out / 'runtime-public/fonts/unified.woff2',
                   out / 'work/preview-known-v10.mp4', out / 'work/seams-v10/frame-00000.jpg',
                   c.ROOT / 'work/render-browser-v10/browser-copy.bin']:
        c.allowed(target, out)
    tests.append({'test': 'only named task cache/preview/frame/browser paths accepted', 'passed': True})
    assert c.evidence_name(out / 'work/design-review-v10/contact-01.jpg')
    assert c.evidence_name(out / 'work/bundle/public/a/visual-acceptance.json')
    assert not c.evidence_name(out / 'work/design-review-v10/frame-00000.jpg')
    tests.append({'test': 'contacts/review records retained while standalone review frames remain eligible', 'passed': True})
    with patch.object(c, 'pending_gate_files', return_value=['actual final proof pending']):
        ready, pending, evidence = c.verify_gates(out, out / 'delivery/not-created.zip', [], {})
        assert not ready and pending and not evidence
    tests.append({'test': 'missing final proof returns no deletion authorization without querying or changing registry', 'passed': True})

    # Add bounded ordinary test data and hardlinks only. No test removal occurs.
    file = folder / 'mutable-fixture.bin'
    file.write_bytes(b'cleanup-file-state-fixture')
    info = file.stat()
    row = {'path': str(file), 'bytes': info.st_size, 'mtimeNs': info.st_mtime_ns,
           'hardLinkCount': info.st_nlink, 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()}
    fixture_scope = folder.relative_to(out).as_posix()
    with patch.object(c, 'CACHE_DIRS', (fixture_scope,)):
        c.validate_candidate(row, out)
        file.write_bytes(b'changed-file-state-fixture')
        refusal(lambda: c.validate_candidate(row, out))
        info = file.stat()
        row.update(bytes=info.st_size, mtimeNs=info.st_mtime_ns,
                   sha256=hashlib.sha256(file.read_bytes()).hexdigest())
        os.link(file, folder / 'hardlink-fixture.bin')
        refusal(lambda: c.validate_candidate(row, out))
    tests.append({'test': 'candidate content/mtime changes and shared hardlinks block deletion', 'passed': True})
    target, link = folder / 'junction-target', folder / 'junction-entry'
    target.mkdir()
    quote = lambda p: "'" + str(p).replace("'", "''") + "'"
    command = 'New-Item -ItemType Junction -Path ' + quote(link) + ' -Target ' + quote(target) + ' | Out-Null'
    p = subprocess.run(['powershell', '-NoProfile', '-Command', command], capture_output=True, text=True)
    assert p.returncode == 0 and link.exists(), 'Cannot create bounded directory-junction fixture'
    refusal(lambda: c.checked(link / 'must-not-follow.bin', out))
    tests.append({'test': 'real NTFS junction rejected before traversing its target', 'passed': True})
    report = {'version': 'V10', 'scope': 'cleanup allowlist and immutable-candidate gates; no deletion test',
              'passed': True, 'tests': tests, 'fixtures': str(folder), 'deleteCommandRun': False,
              'filesDeleted': 0, 'directoriesRemoved': 0, 'registryWrites': 0, 'productionAssetChanges': 0}
    (folder / 'validation-report.json').write_bytes(c.jd(report))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf8')
    main()
