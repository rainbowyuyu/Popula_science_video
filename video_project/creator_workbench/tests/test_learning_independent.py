"""Independent learning storage/contracts. Every provider stays mocked."""
import copy
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

from app.library import Library
from app.learning_workspace import LearningWorkspace
from app.server import Workbench


class IndependentLearningTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.videos = self.root / 'videos'
        self.videos.mkdir()
        with mock.patch('app.server.Library', side_effect=lambda root: Library(root, [])):
            self.app = Workbench(self.videos, self.root / 'state', Path(__file__).resolve().parents[1])
        self.app.providers = mock.Mock()
        self.app.providers.public_status.return_value = [{'id': p, 'configured': True} for p in ('openai', 'claude')]
        self.app.providers.complete.side_effect = AssertionError('No paid requests')
        self.app.runs.providers = self.app.providers
        self.ws = self.app.learning

    def tearDown(self):
        self.temp.cleanup()

    def quick(self, **args):
        with mock.patch('app.learning_workspace.threading.Thread'):
            return self.ws.action({'action': 'learning.quick_start', 'source': 'https://example.com/video', **args})

    def test_create_without_video_project_is_hidden_and_has_no_series(self):
        created = self.ws.action({'action': 'learning.create', 'name': '微距运动'})
        self.assertTrue(created['independent'])
        self.assertIsNone(created['projectId'])
        root = Path(self.app.library.project(created['workspaceId'])['path'])
        self.assertTrue(root.is_dir())
        config = self.app.studio.config(created['workspaceId'])
        self.assertFalse(config['useSeriesStyle'])
        self.assertIsNone(config['seriesId'])
        self.assertEqual(self.app.library.snapshot(refresh=True, lightweight=True)['projects'], [])
        self.app.providers.complete.assert_not_called()

    def test_quick_start_registers_reference_and_queues_independent_workspace(self):
        result = self.quick(name='浅色微距', notes='光照与连续推进', startSec=2, endSec=8)
        collection, task = result['collection'], result['tasks'][0]
        self.assertEqual(task['projectId'], collection['workspaceId'])
        self.assertIsNone(task['targetProjectId'])
        self.assertTrue(task['request']['independentLearning'])
        self.assertEqual(task['request']['url'], 'https://example.com/video')
        self.assertEqual(task['request']['prompt'], '光照与连续推进')
        self.assertEqual(len(collection['references']), 1)
        self.assertEqual(task['status'], 'queued')

    def test_existing_independent_collection_is_reused(self):
        created = self.ws.action({'action': 'learning.create', 'name': '我的参考'})
        result = self.quick(collectionId=created['id'])
        self.assertEqual(result['collection']['id'], created['id'])
        self.assertEqual(len(self.ws.snapshot()['collections']), 1)
        self.assertEqual(result['tasks'][0]['request']['startSec'], 0)
        self.assertEqual(result['tasks'][0]['request']['endSec'], 15)

    def test_quick_start_request_id_reuses_task_and_rejects_changed_content(self):
        first = self.quick(clientRequestId='same-request-1234', name='不重复学习')
        second = self.quick(clientRequestId='same-request-1234', name='不重复学习')
        self.assertTrue(second['reused'])
        self.assertEqual(second['collection']['id'], first['collection']['id'])
        self.assertEqual(second['reference']['id'], first['reference']['id'])
        self.assertEqual(second['tasks'][0]['id'], first['tasks'][0]['id'])
        self.assertEqual(len(self.ws.snapshot()['collections']), 1)
        self.assertEqual(len(self.ws.snapshot()['tasks']), 1)
        with self.assertRaisesRegex(ValueError, '内容已变化'):
            self.quick(clientRequestId='same-request-1234', name='另一个要求')
        with self.assertRaisesRegex(ValueError, '内容已变化'):
            self.quick(clientRequestId='same-request-1234', name='不重复学习', source='https://example.com/other')
        self.app.providers.complete.assert_not_called()

    def test_request_id_survives_restart_and_replay_does_not_requeue(self):
        first = self.quick(clientRequestId='restart-request-1234')
        self.app.library = Library(self.videos, [])
        self.ws = LearningWorkspace(self.app)
        # An existing request remains inspectable if configuration later becomes unavailable.
        self.app.providers.public_status.return_value = []
        with mock.patch('app.learning_workspace.threading.Thread') as thread:
            second = self.quick(clientRequestId='restart-request-1234')
        thread.assert_not_called()
        self.assertTrue(second['reused'])
        self.assertEqual(second['tasks'][0]['id'], first['tasks'][0]['id'])
        self.assertEqual(second['tasks'][0]['status'], 'interrupted')
        self.assertEqual(len(self.ws.snapshot()['tasks']), 1)

    def test_missing_configuration_with_request_id_never_persists_submission(self):
        self.app.providers.public_status.return_value = []
        with self.assertRaisesRegex(ValueError, 'CC Switch'):
            self.quick(clientRequestId='unconfigured-1234')
        self.assertFalse(self.ws.path.exists())
        self.assertEqual(self.ws.snapshot()['tasks'], [])
        self.app.providers.public_status.return_value = [{'id': p, 'configured': True} for p in ('openai', 'claude')]
        first = self.quick(clientRequestId='unconfigured-1234')
        self.assertNotIn('reused', first)
        self.assertEqual(len(first['tasks']), 1)

    def test_missing_model_configuration_fails_before_creating_rows(self):
        self.app.providers.public_status.return_value = [{'id': 'openai', 'configured': True}]
        with self.assertRaisesRegex(ValueError, 'CC Switch'):
            self.quick()
        self.assertEqual(self.ws.snapshot()['collections'], [])
        self.assertEqual(self.ws.snapshot()['tasks'], [])
        saved = self.ws.action({'action': 'learning.create', 'name': '先保存参考'})
        ref = self.ws.action({'action': 'learning.reference.add', 'collectionId': saved['id'], 'source': 'https://example.com/video'})
        with self.assertRaisesRegex(ValueError, 'CC Switch'):
            self.ws.action({'action': 'learning.enqueue', 'collectionId': saved['id'], 'referenceIds': [ref['id']]})
        self.assertEqual(self.ws.snapshot()['tasks'], [])

    def test_invalid_quick_settings_do_not_create_collections(self):
        for args in ({'source': ''}, {'endSec': -1}, {'source': 'https://user:password@example.com'},
                     {'modelEfforts': {'claude': 'invalid'}}, {'contextBudgetTokens': '1000000'}):
            with self.subTest(args=args), self.assertRaises(ValueError):
                self.quick(**args)
        self.assertEqual(self.ws.snapshot()['collections'], [])

    def test_internal_ids_cannot_choose_paths_or_bind_as_video(self):
        for ident in ('../escape', 'learning_' + 'a' * 32, str(self.root / 'outside')):
            with self.assertRaises(ValueError):
                self.app.library.register_learning_project(ident, 'invalid')
        created = self.ws.action({'action': 'learning.create', 'name': '独立'})
        with self.assertRaises(ValueError):
            self.ws.action({'action': 'learning.create', 'name': '非法绑定', 'projectId': created['workspaceId']})
        with self.assertRaises(KeyError):
            self.app.library.project('learning_' + 'b' * 32)
        with self.assertRaises(ValueError):
            self.ws.action({'action': 'learning.import', 'collectionId': created['id']})

    def test_library_refresh_and_workspace_restart_preserve_media(self):
        result = self.quick()
        created = result['collection']
        root = Path(self.app.library.project(created['workspaceId'])['path'])
        preview = root / 'output' / 'preview.mp4'
        preview.parent.mkdir()
        preview.write_bytes(b'preview fixture')
        media = self.app.library.register_media(preview, created['workspaceId'])
        self.app.library.snapshot(refresh=True, lightweight=True)
        self.assertEqual(self.app.library.media_lookup(media['id'])['projectId'], created['workspaceId'])
        self.app.library = Library(self.videos, [])
        restored = LearningWorkspace(self.app)
        self.assertEqual(restored.snapshot()['tasks'][0]['status'], 'interrupted')
        self.assertEqual(self.app.library.media_lookup(media['id'])['projectId'], created['workspaceId'])
        self.assertEqual(self.app.library.media_page(created['workspaceId'])['items'][0]['id'], media['id'])
        self.assertEqual(self.app.library.snapshot(lightweight=True)['projects'], [])

    def test_local_learning_result_never_changes_global_series_or_shared_skills(self):
        result = self.quick()
        pid = result['collection']['workspaceId']
        before = copy.deepcopy(self.app.studio.store)
        job = {'id': 'fixture', 'projectId': pid, 'runIds': ['observed', 'rendered', 'reviewed']}
        learned = self.app.workflows._save_learning_result(job, {'id': 'ref'},
            {'styleName': '柔光微距', 'summary': '实际抽帧比较', 'rules': ['用柔和侧光保持主体轮廓。']})
        self.assertFalse(learned['automaticallyApplied'])
        self.assertEqual(learned['scope'], 'workspace-only')
        self.assertEqual(self.app.studio.store, before)
        self.assertFalse((self.videos / 'shared/skills').exists())
        root = Path(self.app.library.project(pid)['path'])
        self.assertIn('实际抽帧比较', (root / learned['projectSkill']).read_text(encoding='utf8'))

    def test_old_linked_collections_keep_project_identity(self):
        episode = self.videos / 'episode'
        episode.mkdir()
        (episode / 'project.json').write_text('{}')
        pid = self.app.library.snapshot(lightweight=True)['projects'][0]['id']
        created = self.ws.action({'action': 'learning.create', 'name': '旧关联', 'projectId': pid})
        result = self.quick(collectionId=created['id'])
        task = result['tasks'][0]
        self.assertFalse(task['independent'])
        self.assertEqual(task['projectId'], pid)
        self.assertEqual(task['targetProjectId'], pid)
        self.assertFalse(task['request']['independentLearning'])

    def test_internal_learning_runs_do_not_appear_in_video_bootstrap(self):
        created = self.ws.action({'action': 'learning.create', 'name': '后台学习'})
        self.app.runs.runs['learning-run'] = {'id': 'learning-run', 'projectId': created['workspaceId'],
            'status': 'running', 'createdAt': '2026-10-16', 'provider': 'dual', 'prompt': 'learning', 'events': []}
        self.assertEqual(self.app.bootstrap()['runs'], [])
        self.assertEqual(self.app.runs.get('learning-run')['projectId'], created['workspaceId'])


if __name__ == '__main__':
    unittest.main()
