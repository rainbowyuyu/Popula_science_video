import copy
import json
from pathlib import Path
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest import mock

from app.learning_workspace import LearningWorkspace
from app.workflows import Workflows


class LearningWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.project = self.root / 'episode'
        self.project.mkdir()
        self.library = mock.Mock()
        self.library.project.side_effect = lambda pid: {'id': 'episode', 'path': str(self.project)} if pid == 'episode' else (_ for _ in ()).throw(KeyError(pid))
        self.config = {'contextBudgetTokens': 128000, 'modelEfforts': {'openai': 'high', 'claude': 'medium'}}
        self.studio = mock.Mock()
        self.studio.config.side_effect = lambda pid: copy.deepcopy(self.config)
        self.runs = mock.Mock()
        self.runs.has_active.return_value = False
        self.runs.summary.return_value = []
        self.workflows = mock.Mock()
        self.workflows.has_active.return_value = False
        self.workflows.start.return_value = {'workflowId': 'wf-1'}
        self.app = SimpleNamespace(state_root=self.root / 'state', library=self.library, studio=self.studio,
                                   runs=self.runs, workflows=self.workflows)
        self.app.providers = mock.Mock()
        self.app.providers.public_status.return_value = [{'id': p, 'configured': True} for p in ('openai', 'claude')]
        self.ws = LearningWorkspace(self.app)
        self.collection = self.ws.action({'action': 'learning.create', 'name': '连续运镜', 'projectId': 'episode'})
        self.reference = self.ws.action({'action': 'learning.reference.add', 'collectionId': self.collection['id'],
                                        'name': '微距下潜', 'source': 'https://example.com/video',
                                        'startSec': 1, 'endSec': 12, 'notes': '学习遮挡转场'})

    def tearDown(self):
        self.temp.cleanup()

    def enqueue(self, **kwargs):
        with mock.patch('app.learning_workspace.threading.Thread'):
            result = self.ws.action({'action': 'learning.enqueue', 'collectionId': self.collection['id'],
                                    'referenceIds': [self.reference['id']], **kwargs})
        return self.ws._task(result['tasks'][0]['id'])

    def test_collection_and_reference_are_durable_without_generation(self):
        self.workflows.start.assert_not_called()
        self.assertEqual(len(self.ws.snapshot()['collections']), 1)
        restored = LearningWorkspace(self.app)
        self.assertEqual(restored.snapshot()['collections'][0]['references'][0]['notes'], '学习遮挡转场')
        self.assertFalse(restored.has_active())
        self.assertTrue(self.ws.path.is_file())

    def test_collection_name_and_reference_validation(self):
        for value in ['', 'x' * 81]:
            with self.assertRaises(ValueError):
                self.ws.action({'action': 'learning.rename', 'collectionId': self.collection['id'], 'name': value})
        for start, end in [(5, 4), (True, 12), (1, '12'), (0, float('nan')), (0, float('inf'))]:
            with self.assertRaises(ValueError):
                self.ws.action({'action': 'learning.reference.add', 'collectionId': self.collection['id'],
                                'source': 'https://example.com/a', 'startSec': start, 'endSec': end})
        with self.assertRaises(ValueError):
            self.ws.action({'action': 'learning.reference.add', 'collectionId': self.collection['id'],
                            'source': 'https://user:pass@example.com/video'})

    def test_queue_inherits_project_model_configuration(self):
        task = self.enqueue()
        self.assertEqual(task['request']['contextBudgetTokens'], 128000)
        self.assertEqual(task['request']['modelEfforts'], self.config['modelEfforts'])
        self.assertIsNone(task['request']['iterations'])
        self.assertEqual(task['executionPolicy'], 'continuous')
        self.assertEqual(task['request']['executionPolicy'], 'continuous')
        self.assertIsNone(self.ws.snapshot()['iterationLimit'])
        self.assertEqual(task['request']['prompt'], '学习遮挡转场')
        self.workflows.start.assert_not_called()
        self.ws._tick(task)
        self.assertEqual(task['workflowId'], 'wf-1')
        self.workflows.start.assert_called_once_with(task['request'])

    def test_queue_waits_for_foreground_and_other_workflow(self):
        task = self.enqueue()
        self.runs.summary.return_value = [{'status': 'running'}]
        self.ws._tick(task)
        self.assertEqual(task['status'], 'waiting')
        self.workflows.start.assert_not_called()
        self.runs.summary.return_value = []
        self.workflows.has_active.return_value = True
        self.ws._tick(task)
        self.workflows.start.assert_not_called()
        self.workflows.has_active.return_value = False
        self.ws._tick(task)
        self.workflows.start.assert_called_once()

    def test_queue_status_uses_real_workflow_results(self):
        task = self.enqueue()
        self.ws._tick(task)
        self.workflows.get.return_value = {'id': 'wf-1', 'status': 'needs_review', 'message': '遮挡仍需修复',
                                          'results': [{'attempt': 2, 'verdict': {'pass': False}}],
                                          'previewPath': 'output/learning/wf-1/preview.mp4', 'runIds': ['run1']}
        self.ws._tick(task)
        self.assertEqual(task['status'], 'needs_review')
        self.assertIsNone(task['learned'])
        self.assertFalse(self.ws.has_active())
        persisted = json.loads(self.ws.path.read_text(encoding='utf8'))['tasks'][0]
        self.assertEqual(persisted['runIds'], ['run1'])

    def test_cancel_queued_never_submits_model_and_running_stops_workflow(self):
        task = self.enqueue()
        self.ws.action({'action': 'learning.cancel', 'id': task['id']})
        self.ws._tick(task)
        self.assertEqual(task['status'], 'cancelled')
        self.workflows.start.assert_not_called()
        second = self.enqueue()
        self.ws._tick(second)
        self.ws.action({'action': 'learning.cancel', 'id': second['id']})
        self.assertEqual(second['status'], 'cancelling')
        self.workflows.stop.assert_called_once_with('wf-1')

    def test_restart_does_not_replay_paid_jobs(self):
        self.enqueue()
        with mock.patch('app.learning_workspace.threading.Thread') as thread:
            restored = LearningWorkspace(self.app)
        self.assertEqual(restored.snapshot()['tasks'][0]['status'], 'interrupted')
        thread.assert_not_called()
        self.workflows.start.assert_not_called()
        self.assertFalse(restored.has_active())

    def test_duplicate_and_queue_limits_and_invalid_configuration(self):
        self.enqueue()
        with self.assertRaises(ValueError): self.enqueue()
        task = self.ws.data['tasks'][0]
        task['status'] = 'completed'
        for kwargs in [{'iterations': True}, {'iterations': 0}, {'iterations': -1}, {'iterations': '2'}, {'iterations': 2.0}, {'contextBudgetTokens': '1000000'},
                       {'modelEfforts': {'claude': 'bogus'}}, {'referenceIds': ['unknown']}]:
            with self.assertRaises(ValueError): self.enqueue(**kwargs)
        self.ws.data['tasks'] = [{**copy.deepcopy(task), 'id': str(i), 'referenceId': str(i), 'status': 'waiting'} for i in range(20)]
        with self.assertRaises(ValueError): self.enqueue()

    def test_legacy_iteration_counts_do_not_bound_learning(self):
        for value in (None, 1, 2, 3, 10000):
            with self.subTest(value=value):
                task = self.enqueue(iterations=value)
                self.assertIsNone(task['request']['iterations'])
                self.assertEqual(task['request']['executionPolicy'], 'continuous')
                task['status'] = 'completed'
        self.workflows.start.assert_not_called()

    def test_import_existing_project_references_is_idempotent(self):
        self.config['references'] = [{'id': 'old', 'name': '项目已有参考', 'url': 'https://example.org/a',
                                      'startSec': 0, 'endSec': 15}]
        args = {'action': 'learning.import', 'collectionId': self.collection['id']}
        self.assertEqual(self.ws.action(args)['imported'], 1)
        self.assertEqual(self.ws.action(args)['imported'], 0)
        self.assertEqual(self.ws.snapshot()['collections'][0]['references'][-1]['request'], {'referenceId': 'old'})

    def test_remove_running_reference_is_rejected(self):
        self.enqueue()
        with self.assertRaises(ValueError):
            self.ws.action({'action': 'learning.remove', 'collectionId': self.collection['id'], 'referenceId': self.reference['id']})

    def test_preview_requires_real_project_file(self):
        task = self.enqueue()
        with self.assertRaises(ValueError): self.ws.action({'action': 'learning.preview', 'id': task['id']})
        task['previewPath'] = '../escape.mp4'
        with self.assertRaises(ValueError): self.ws.action({'action': 'learning.preview', 'id': task['id']})
        task['previewPath'] = 'output/learning/preview.mp4'
        p = self.project / task['previewPath']; p.parent.mkdir(parents=True); p.write_bytes(b'video fixture')
        self.library.register_media.return_value = {'id': 'media-1'}
        self.assertEqual(self.ws.action({'action': 'learning.preview', 'id': task['id']})['url'], '/api/media/media-1')

    def test_worker_continues_without_browser_polling(self):
        self.workflows.get.return_value = {'status': 'completed', 'message': '验证完成', 'results': [], 'runIds': []}
        result = self.ws.action({'action': 'learning.enqueue', 'collectionId': self.collection['id'], 'referenceIds': [self.reference['id']]})
        ident = result['tasks'][0]['id']
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline and self.ws._task(ident)['status'] != 'completed':
            time.sleep(.02)
        self.assertEqual(self.ws._task(ident)['status'], 'completed')
        self.ws.worker.join(timeout=2)

    def test_workflow_propagates_efforts_and_budget(self):
        self.app.providers = mock.Mock()
        self.app.providers.public_status.return_value = [{'id': p, 'configured': True} for p in ('openai', 'claude')]
        self.studio.context.return_value = {'module': 'learning'}
        self.runs.start.return_value = {'id': 'run1'}
        self.runs.get.return_value = {'status': 'completed'}
        workflows = Workflows(self.app)
        job = {'id': 'fixture', 'projectId': 'episode', 'projectIds': ['episode'], 'kind': 'learn', 'status': 'running',
               'createdAt': time.time(), 'request': {'contextBudgetTokens': 1000000, 'modelEfforts': {'openai': 'xhigh', 'claude': 'max'}},
               'runIds': [], 'events': []}
        workflows.jobs['fixture'] = job; workflows.cancel['fixture'] = threading.Event()
        workflows._run_agent(job, 'episode', '观察参考', '查看参考')
        body = self.runs.start.call_args.args[0]
        self.assertEqual(body['contextBudgetTokens'], 1000000)
        self.assertEqual(body['modelEfforts'], {'openai': 'xhigh', 'claude': 'max'})


if __name__ == '__main__':
    unittest.main()
