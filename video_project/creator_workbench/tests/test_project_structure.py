import hashlib
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from app.project_structure import ProjectStructure, DIRECTORIES, MANIFEST, GUIDE, _safe


class ProjectStructureTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name) / 'video'
        self.root.mkdir()
        self.project = {'id': 'project', 'name': 'fixture', 'path': str(self.root), 'sourceRoots': [str(self.root / 'v4')]}
        self.manager = ProjectStructure(SimpleNamespace(project=lambda pid: self.project))

    def tearDown(self):
        self.tmp.cleanup()

    def write(self, relative, text='fixture'):
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding='utf8')
        return path

    def test_existing_engines_assets_and_delivery_stay_in_place(self):
        files = [self.write('v4/package.json', '{"scripts":{"render":"node scripts/render.mjs"}}'),
                 self.write('v4/scripts/render.mjs', "import '../src/main.js'"),
                 self.write('v4/src/main.js', "const a='../public/model.glb';"),
                 self.write('v4/public/model.glb'), self.write('v4/delivery/Film_v5.mp4'),
                 self.write('v4/covers/Film_16x9.jpg'), self.write('tmp_inspect.py')]
        self.project['latestVideo'] = {'path': str(files[4]), 'relativePath': 'v4/delivery/Film_v5.mp4', 'kind': 'video'}
        hashes = {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in files}
        result = self.manager.apply('project')
        self.assertTrue(result['applied'])
        self.assertEqual(result['movedFiles'], [])
        self.assertEqual(result['deletedFiles'], [])
        self.assertEqual(hashes, {p: hashlib.sha256(p.read_bytes()).hexdigest() for p in files})
        self.assertIn('v4/src', result['routes']['source']['existing'])
        self.assertIn('v4/public', result['routes']['assets']['existing'])
        self.assertIn('v4/delivery', result['routes']['output']['existing'])
        self.assertEqual(result['currentMedia'][0]['path'], 'v4/delivery/Film_v5.mp4')
        self.assertTrue(all((self.root / name).is_dir() for name in DIRECTORIES))
        self.assertEqual(result['protectedBuildFiles'][0]['sha256'], hashes[files[0]])

    def test_repeated_apply_is_idempotent(self):
        self.write('v4/package.json', '{}')
        self.manager.apply('project')
        before = [(self.root / p).read_bytes() for p in (MANIFEST, GUIDE)]
        result = self.manager.apply('project')
        self.assertEqual(result['createdDirectories'], [])
        self.assertEqual(result['writtenFiles'], [])
        self.assertEqual(before, [(self.root / p).read_bytes() for p in (MANIFEST, GUIDE)])

    def test_scan_does_not_create_directories(self):
        self.write('v4/package.json', '{}')
        before = sorted(str(p.relative_to(self.root)) for p in self.root.rglob('*'))
        result = self.manager.scan('project')
        self.assertEqual(before, sorted(str(p.relative_to(self.root)) for p in self.root.rglob('*')))
        self.assertIn('.studio', result['missingDirectories'])

    def test_directory_conflict_aborts_before_any_creation(self):
        self.write('covers', 'existing user file')
        self.assertEqual(self.manager.scan('project')['summary']['conflicts'], 1)
        with self.assertRaises(ValueError):
            self.manager.apply('project')
        self.assertFalse((self.root / '.studio').exists())
        self.assertEqual((self.root / 'covers').read_text(), 'existing user file')

    def test_user_owned_manifest_preserved(self):
        self.write(MANIFEST, '{"owner":"user"}')
        with self.assertRaisesRegex(ValueError, '同名用户文件'):
            self.manager.apply('project')
        self.assertEqual(json.loads((self.root / MANIFEST).read_text()), {'owner': 'user'})
        self.assertFalse((self.root / 'source').exists())

    def test_legacy_v1_metadata_and_project_settings_untouched(self):
        self.write('.studio/structure.json', '{"version":1}')
        self.write('.studio/project.json', '{"displayName":"Mine","contextBudgetTokens":64000}')
        self.manager.apply('project')
        self.assertEqual((self.root / '.studio/structure.json').read_text(), '{"version":1}')
        self.assertEqual(json.loads((self.root / '.studio/project.json').read_text())['displayName'], 'Mine')

    def test_bounded_scan_reports_limit(self):
        for index in range(30):
            self.write(f'file{index}.txt')
        manager = ProjectStructure(self.manager.library, max_entries=10)
        result = manager.scan('project')
        self.assertTrue(result['scan']['truncated'])
        self.assertEqual(result['scan']['limit'], 10)

    def test_reject_escape_and_windows_special_names(self):
        for name in ('../escape', 'C:/outside', 'source/a:stream', 'source/CON.txt', 'source/end.'):
            with self.assertRaises(ValueError, msg=name):
                _safe(self.root, name)

    def test_dependency_directory_contents_not_read(self):
        self.write('node_modules/private/package.json', '{invalid')
        self.write('.venv312/private.py')
        result = self.manager.scan('project')
        self.assertEqual(result['engineRoots'], [])
        self.assertIn('node_modules', [row['path'] for row in result['skipped']])
        self.assertIn('.venv312', [row['path'] for row in result['skipped']])

    def test_symlink_roots_or_canonical_routes_rejected(self):
        outside = Path(self.tmp.name) / 'outside'
        outside.mkdir()
        try:
            os.symlink(outside, self.root / 'assets', target_is_directory=True)
        except OSError:
            self.skipTest('Windows requires symlink privilege')
        result = self.manager.scan('project')
        self.assertEqual(result['summary']['conflicts'], 1)
        with self.assertRaises(ValueError):
            self.manager.apply('project')
        self.assertEqual(list(outside.iterdir()), [])

    def test_compact_context_includes_actual_routes(self):
        self.write('v4/package.json', '{}')
        self.write('v4/src/main.ts', 'export {}')
        self.manager.apply('project')
        context = self.manager.context('project')
        self.assertEqual(context['manifestPath'], MANIFEST)
        self.assertIn('v4/src', context['routes']['source'])
        self.assertIn('v4', context['engineRoots'])

    def test_external_source_root_is_not_scanned(self):
        outside = Path(self.tmp.name) / 'outside'
        outside.mkdir()
        (outside / 'package.json').write_text('{}')
        self.project['sourceRoots'].append(str(outside))
        result = self.manager.scan('project')
        self.assertEqual(result['protectedBuildFiles'], [])
        self.assertTrue(any('外部' in row['reason'] for row in result['skipped']))


if __name__ == '__main__':
    unittest.main()
