"""Maximum new-task defaults, with all paid model execution disabled."""
import json
import unittest
from unittest import mock

from app.context_budget import validate_budget
from app.providers import validate_model_efforts
from tests import test_learning_independent as learning_fixture
from tests import test_server as server_fixture


MAX_EFFORTS = {'openai': 'xhigh', 'claude': 'max'}


class MaximumDefaultValidationTests(unittest.TestCase):
    def test_missing_budget_uses_full_capacity_and_keeps_explicit_lower_budget(self):
        self.assertEqual(validate_budget(None), 1_000_000)
        self.assertEqual(validate_budget(64_000), 64_000)
        self.assertEqual(validate_budget(256_000), 256_000)

    def test_missing_and_empty_efforts_use_maximum(self):
        self.assertEqual(validate_model_efforts(None), MAX_EFFORTS)
        self.assertEqual(validate_model_efforts({}), MAX_EFFORTS)
        self.assertEqual(validate_model_efforts({'claude': 'low'}),
                         {'openai': 'xhigh', 'claude': 'low'})

    def test_explicit_lower_and_follow_interface_efforts_are_preserved(self):
        for efforts in ({'openai': 'low', 'claude': 'medium'},
                        {'openai': 'default', 'claude': 'default'}):
            with self.subTest(efforts=efforts):
                self.assertEqual(validate_model_efforts(efforts), efforts)


class MaximumDefaultAPITests(unittest.TestCase):
    setUp = server_fixture.ServerTests.setUp
    tearDown = server_fixture.ServerTests.tearDown
    call = server_fixture.ServerTests.call

    def test_bootstrap_exposes_maximum_for_project_with_no_saved_controls(self):
        status, _, raw = self.call('GET', '/api/bootstrap')
        self.assertEqual(status, 200, raw)
        project = next(p for p in json.loads(raw)['projects'] if p['id'] == self.project['id'])
        self.assertEqual(project['contextBudgetTokens'], 1_000_000)
        self.assertEqual(project['modelEfforts'], MAX_EFFORTS)
        self.app.providers.complete.assert_not_called()

    def test_run_endpoint_resolves_maximum_before_dispatch(self):
        with mock.patch.object(self.app.runs, 'start', return_value={'id': 'offline-fixture'}) as start:
            status, _, raw = self.call('POST', '/api/runs', {
                'projectId': self.project['id'], 'provider': 'openai', 'prompt': '检查当前镜头'}, csrf=True)
        self.assertEqual(status, 202, raw)
        self.assertEqual(start.call_args.args[0]['contextBudgetTokens'], 1_000_000)
        self.assertEqual(start.call_args.args[0]['modelEfforts'], MAX_EFFORTS)
        self.app.providers.complete.assert_not_called()

    def test_explicit_project_settings_survive_new_defaults(self):
        settings = {'contextBudgetTokens': 256_000,
                    'modelEfforts': {'openai': 'default', 'claude': 'low'}}
        status, _, raw = self.call('POST', '/api/studio/action', {
            'action': 'context.configure', 'projectId': self.project['id'], **settings}, csrf=True)
        self.assertEqual(status, 200, raw)
        project = next(p for p in json.loads(self.call('GET', '/api/bootstrap')[2])['projects']
                       if p['id'] == self.project['id'])
        with mock.patch.object(self.app.runs, 'start', return_value={'id': 'offline-fixture'}) as start:
            status, _, raw = self.call('POST', '/api/runs', {
                'projectId': self.project['id'], 'provider': 'openai', 'prompt': '检查当前镜头'}, csrf=True)
        self.assertEqual(status, 202, raw)
        for key, expected in settings.items():
            self.assertEqual(project[key], expected)
            self.assertEqual(start.call_args.args[0][key], expected)
        self.app.providers.complete.assert_not_called()

    def test_direct_run_creation_records_maximum_without_starting_worker(self):
        with mock.patch.object(self.app.runs, 'launch') as launch:
            result = self.app.runs.start({'projectId': self.project['id'],
                                          'provider': 'openai', 'prompt': '只登记离线测试任务'})
        launch.assert_called_once()
        run = self.app.runs.get(result['id'])
        self.assertEqual(run['contextBudgetTokens'], 1_000_000)
        self.assertEqual(run['modelEfforts'], MAX_EFFORTS)
        self.app.providers.complete.assert_not_called()


class MaximumIndependentLearningTests(unittest.TestCase):
    setUp = learning_fixture.IndependentLearningTests.setUp
    tearDown = learning_fixture.IndependentLearningTests.tearDown
    quick = learning_fixture.IndependentLearningTests.quick

    def assert_maximum_request(self, task):
        self.assertEqual(task['request']['contextBudgetTokens'], 1_000_000)
        self.assertEqual(task['request']['modelEfforts'], MAX_EFFORTS)
        self.assertEqual(task['status'], 'queued')
        self.app.providers.complete.assert_not_called()

    def test_quick_start_without_project_queues_maximum_controls(self):
        with mock.patch.object(self.app.workflows, 'start') as start:
            result = self.quick()
        self.assertTrue(result['collection']['independent'])
        self.assert_maximum_request(result['tasks'][0])
        start.assert_not_called()

    def test_saved_independent_reference_enqueue_uses_maximum_controls(self):
        created = self.ws.action({'action': 'learning.create', 'name': '独立参考'})
        reference = self.ws.action({'action': 'learning.reference.add', 'collectionId': created['id'],
                                   'source': 'https://example.com/reference.mp4'})
        with mock.patch('app.learning_workspace.threading.Thread'), \
             mock.patch.object(self.app.workflows, 'start') as start:
            result = self.ws.action({'action': 'learning.enqueue', 'collectionId': created['id'],
                                    'referenceIds': [reference['id']]})
        self.assert_maximum_request(result['tasks'][0])
        start.assert_not_called()

    def test_explicit_learning_controls_are_not_promoted_to_maximum(self):
        efforts = {'openai': 'high', 'claude': 'default'}
        result = self.quick(contextBudgetTokens=128_000, modelEfforts=efforts)
        request = result['tasks'][0]['request']
        self.assertEqual(request['contextBudgetTokens'], 128_000)
        self.assertEqual(request['modelEfforts'], efforts)
        self.app.providers.complete.assert_not_called()


if __name__ == '__main__':
    unittest.main()
