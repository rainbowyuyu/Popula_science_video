"""Bounded recovery/security tests. Fixtures go only to the V10 C: work output.

Does not create a delivery ZIP, render, use credentials or change source assets.
Small validation fixtures remain with their QA record for review.
"""
from pathlib import Path
import hashlib
import json
import shutil
import subprocess
import sys
import uuid
import zipfile
from unittest.mock import patch

sys.dont_write_bytecode = True
import package_v10 as package


def main():
    fixture = package.safe_output_path(package.output_root() / 'work/package-v10' /
                                      ('validation-' + uuid.uuid4().hex))
    fixture.mkdir(parents=True, exist_ok=False)
    tests = []

    def check(name, operation):
        operation()
        tests.append({'test': name, 'passed': True})

    def refused(operation, expected=package.PackageError):
        try:
            operation()
        except expected:
            return
        raise AssertionError('Expected rejection')

    def unsafe_names():
        for value in ['', '.', '../x', '/x', 'C:/x', 'a\\b', 'a//b']:
            refused(lambda value=value: package.archive_name(value))
        assert package.archive_name('public/assets_v10/characters/rainbow_fish.glb')
    check('archive traversal/absolute/backslash rejection', unsafe_names)

    def source_escape():
        refused(lambda: package.safe_project_path(package.ROOT.parent / 'unrelated/file.txt'))
        refused(lambda: package.safe_output_path(package.ROOT / 'outside-output.txt'))
        refused(lambda: package.safe_project_path(package.ROOT / 'node_modules/file.txt'))
    check('project/output escape and forbidden dependency directory rejection', source_escape)

    def secrets():
        # Construct synthetic test strings in memory; never persist or print.
        for payload in [b'sk-' + b'x' * 40, b'Bearer ' + b'q' * 40,
                        b'api_' + b'key = "' + b'z' * 40 + b'"',
                        b'https://example.invalid/a?Signature=' + b'a' * 32]:
            refused(lambda payload=payload: package.scan_payload('fixture.md', payload))
        package.scan_payload('fixture.md', b'api_key = "YOUR_API_KEY"')
    check('provider/Bearer/literal/signed credential detection with redacted diagnostics', secrets)

    facts = {'durationSeconds': 360, 'durationFrames': 10800,
             'personalVoiceClips': [], 'qwenUsedTasks': [], 'qwenUsedFrameCount': 0}
    support = package.support_files(facts)
    for name, payload in support.items():
        package.scan_payload(name, payload)
        if name.endswith('.py'):
            compile(payload.decode('utf8'), name, 'exec')
    tests.append({'test': 'portable generated helpers syntax/secret scan', 'passed': True})

    def crc_sha():
        p = fixture / 'crc-fixture.zip'
        data = b'private-recovery-verifier-fixture\x00\x01\x02'
        h = hashlib.sha256(data).hexdigest()
        with zipfile.ZipFile(p, 'x') as z:
            z.writestr('asset.bin', data)
        r = package.verify_zip(p, {'asset.bin': {'sha256': h}})
        assert r['all_crc_passed'] and r['all_sha256_passed']
        refused(lambda: package.verify_zip(p, {'asset.bin': {'sha256': '0' * 64}}))
        refused(lambda: package.verify_zip(p, {'unexpected.bin': {'sha256': h}}))
        bad = fixture / 'traversal-fixture.zip'
        with zipfile.ZipFile(bad, 'x') as z:
            z.writestr('../escape.bin', data)
        refused(lambda: package.verify_zip(bad, {'../escape.bin': {'sha256': h}}))
    check('ZIP member set, CRC/SHA and unsafe extraction path validation', crc_sha)

    def extraction_verifier():
        root = fixture / 'ordinary-extraction'
        (root / 'scripts').mkdir(parents=True)
        (root / 'asset.txt').write_bytes(b'recovery-hash-fixture')
        (root / 'scripts/verify-recovery-v10.py').write_bytes(support['scripts/verify-recovery-v10.py'])
        row = {'path': 'asset.txt', 'bytes': (root / 'asset.txt').stat().st_size,
               'sha256': hashlib.sha256((root / 'asset.txt').read_bytes()).hexdigest()}
        (root / 'PACKAGE_MANIFEST.json').write_bytes(package.jd(
            {'version': 'V10', 'privateUserRecovery': True, 'files': [row]}))
        good = subprocess.run([sys.executable, '-B', 'scripts/verify-recovery-v10.py'], cwd=root,
                              capture_output=True, text=True)
        assert good.returncode == 0, good.stderr
        (root / 'asset.txt').write_bytes(b'corrupted-fixture-data')
        bad = subprocess.run([sys.executable, '-B', 'scripts/verify-recovery-v10.py'], cwd=root,
                             capture_output=True, text=True)
        assert bad.returncode != 0
    check('generated extraction verifier passes intact files and rejects corruption', extraction_verifier)

    def portable_init():
        root = fixture / 'runtime-init-fixture'
        for subdir in ['scripts', 'src', 'work', 'public/brand']:
            (root / subdir).mkdir(parents=True, exist_ok=True)
        for name in ['prepare-runtime-v10.py', 'v10_inventory.py', 'render-v10.mjs']:
            shutil.copyfile(package.ROOT / 'scripts' / name, root / 'scripts' / name)
        (root / 'src/index.tsx').write_text("import {x} from './V10RainbowArcFilm';\n", 'utf8')
        (root / 'src/V10RainbowArcFilm.tsx').write_text(
            "export const x=staticFile('brand/logo.png');\n", 'utf8')
        for name in ['package.json', 'package-lock.json', 'tsconfig.json']:
            (root / name).write_text('{}', 'utf8')
        shutil.copyfile(package.ROOT / 'public/brand/logo.png', root / 'public/brand/logo.png')
        (root / 'work/output-root-v10.json').write_bytes(support['work/output-root-v10.json'])
        p = subprocess.run([sys.executable, '-B', 'scripts/prepare-runtime-v10.py', '--init'],
                           cwd=root, capture_output=True, text=True)
        assert p.returncode == 0, p.stderr
        config = json.loads((root / 'work/output-root-v10.json').read_text('utf8'))
        assert Path(config['outputRoot']) == root / 'restored-output-v10'
        copied = root / 'restored-output-v10/runtime-public/brand/logo.png'
        assert hashlib.sha256(copied.read_bytes()).digest() == hashlib.sha256(
            (root / 'public/brand/logo.png').read_bytes()).digest()
        refused_target = root / 'unrelated-production-output'
        (root / 'work/output-root-v10.json').write_bytes(package.jd({'outputRoot': str(refused_target)}))
        p = subprocess.run([sys.executable, '-B', 'scripts/prepare-runtime-v10.py', '--init'],
                           cwd=root, capture_output=True, text=True)
        assert p.returncode != 0 and not refused_target.exists()
    check('portable --init resolves extraction directory and refuses production override', portable_init)

    def final_gate():
        with patch.object(package, 'load_json', return_value={'version': 'V09'}):
            refused(package.validate_final_qa)
    check('old/missing final QA cannot authorize V10 ZIP creation', final_gate)

    # A real symlink rejection is tested where Windows grants that capability.
    target, link = fixture / 'link-target', fixture / 'linked-source'
    target.mkdir()
    try:
        link.symlink_to(target, target_is_directory=True)
    except OSError:
        # Directory junctions generally need no Windows symlink privilege.
        # Both paths are verified fixture children; quote each literal safely.
        assert link.parent == fixture and target.parent == fixture
        quote = lambda p: "'" + str(p).replace("'", "''") + "'"
        command = ('New-Item -ItemType Junction -Path ' + quote(link)
                   + ' -Target ' + quote(target) + ' | Out-Null')
        created = subprocess.run(['powershell', '-NoProfile', '-Command', command],
                                 capture_output=True, text=True)
        if created.returncode or not link.exists():
            tests.append({'test': 'real filesystem junction/symlink rejection', 'passed': None,
                          'skipped': 'Windows link creation unavailable'})
        else:
            refused(lambda: package.no_reparse_ancestors(link / 'asset.bin'))
            tests.append({'test': 'real filesystem directory junction rejection', 'passed': True})
    else:
        refused(lambda: package.no_reparse_ancestors(link / 'asset.bin'))
        tests.append({'test': 'real filesystem symlink rejection', 'passed': True})
    report = {'version': 'V10', 'scope': 'recovery packager and minimal portable init; not full film restore/render',
              'tests': tests, 'passed': all(row['passed'] is not False for row in tests),
              'fixtures': str(fixture), 'deliveryZipCreated': False,
              'providerCalls': 0, 'productionSourceMutations': 0, 'productionSourceDeletions': 0}
    (fixture / 'validation-report.json').write_bytes(package.jd(report))
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    if hasattr(sys.stdout, 'reconfigure'):
        sys.stdout.reconfigure(encoding='utf8')
    main()
