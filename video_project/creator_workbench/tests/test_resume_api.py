"""Resume HTTP lifecycle and workflow integration, without paid model requests."""
import concurrent.futures
import json
import threading
import time
import unittest
from unittest import mock

from tests import test_server as server_fixture


class ResumeAPITests(unittest.TestCase):
    setUp = server_fixture.ServerTests.setUp
    tearDown = server_fixture.ServerTests.tearDown
    call = server_fixture.ServerTests.call

    def test_resume_route_uses_existing_run_and_lifecycle_lock(self):
        def resume(ident):
            self.assertTrue(self.server.lifecycle_lock._is_owned())
            self.assertEqual(ident, 'saved-run')
            return {'id': ident, 'status': 'queued'}

        with mock.patch.object(self.app.runs, 'resume', side_effect=resume, create=True) as operation:
            status, _, raw = self.call('POST', '/api/runs/saved-run/resume', {}, csrf=True)
        self.assertEqual(status, 202, raw)
        self.assertEqual(json.loads(raw), {'id': 'saved-run', 'status': 'queued'})
        operation.assert_called_once_with('saved-run')
        self.app.providers.complete.assert_not_called()

    def test_resume_requires_session_csrf_and_same_origin(self):
        with mock.patch.object(self.app.runs, 'resume', create=True) as operation:
            self.assertEqual(self.call('POST', '/api/runs/saved-run/resume', {}, authenticated=False, csrf=True)[0], 401)
            self.assertEqual(self.call('POST', '/api/runs/saved-run/resume', {})[0], 403)
            self.assertEqual(self.call('POST', '/api/runs/saved-run/resume', {}, csrf=True,
                                       headers={'Origin': 'https://example.invalid'})[0], 403)
            self.assertEqual(self.call('POST', '/api/runs/saved-run/extra/resume', {}, csrf=True)[0], 404)
        operation.assert_not_called()

    def test_duplicate_resume_requests_serialize_and_return_validation_error(self):
        accepted = []

        def resume(ident):
            self.assertTrue(self.server.lifecycle_lock._is_owned())
            if accepted:
                raise ValueError('任务已经运行，请勿重复继续')
            time.sleep(.04)
            accepted.append(ident)
            return {'id': ident, 'status': 'queued'}

        with mock.patch.object(self.app.runs, 'resume', side_effect=resume, create=True):
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(lambda _: self.call('POST', '/api/runs/saved-run/resume', {}, csrf=True), range(2)))
        self.assertEqual(sorted(row[0] for row in results), [202, 400])
        self.assertEqual(accepted, ['saved-run'])
        self.app.providers.complete.assert_not_called()

    def test_unknown_resume_is_validation_error_not_new_task(self):
        with mock.patch.object(self.app.runs, 'resume', side_effect=KeyError('未找到任务'), create=True), \
             mock.patch.object(self.app.runs, 'start') as start:
            status, _, _ = self.call('POST', '/api/runs/missing/resume', {}, csrf=True)
        self.assertEqual(status, 400)
        start.assert_not_called()

    def test_bootstrap_exposes_resume_controls_without_checkpoint_content(self):
        run = {'id': 'saved-run', 'projectId': self.project['id'], 'status': 'paused',
               'createdAt': '2026-10-16T00:00:00Z', 'canResume': True, 'pauseReason': 'budget',
               'resumeCount': 2, 'checkpointPath': 'private/checkpoint.json', 'messages': ['private checkpoint'],
               'providerFailure': {'kind': 'timeout', 'httpStatus': 524, 'provider': 'openai',
                   'model': 'fixture-model', 'retryable': True, 'occurredAt': '2026-10-16T00:00:00Z',
                   'body': 'private upstream response', 'authorization': 'private auth', 'nested': {'secret': 'private'}}}
        with mock.patch.object(self.app.runs, 'summary', return_value=[run]):
            status, _, raw = self.call('GET', '/api/bootstrap')
        self.assertEqual(status, 200)
        data = json.loads(raw)
        from app.server import VERSION
        self.assertEqual(data['version'], VERSION)
        row = data['runs'][0]
        self.assertEqual((row['canResume'], row['pauseReason'], row['resumeCount']), (True, 'budget', 2))
        self.assertNotIn('checkpointPath', row)
        self.assertNotIn('messages', row)
        self.assertEqual(row['providerFailure'], {'kind': 'timeout', 'httpStatus': 524, 'provider': 'openai',
            'model': 'fixture-model', 'retryable': True, 'occurredAt': '2026-10-16T00:00:00Z'})
        self.assertNotIn('private upstream response', raw.decode('utf8'))
        self.assertNotIn('private auth', raw.decode('utf8'))
        self.app.providers.complete.assert_not_called()

    def test_bootstrap_output_limit_metadata_is_safe_and_keeps_context_separate(self):
        expected = {'provider': 'openai', 'model': 'fixture-model', 'stopReason': 'max_output_tokens',
                    'requestedTokens': 24000, 'nextTokens': 48000, 'attempts': 2,
                    'outputTokens': 24000, 'reasoningTokens': 16000}
        run = {'id': 'truncated-run', 'projectId': self.project['id'], 'status': 'paused',
               'createdAt': '2026-10-16T00:00:00Z', 'canResume': True, 'pauseReason': 'output_limit',
               'contextBudgetTokens': 1000000, 'outputLimit': {**expected,
                   'body': 'private partial reply', 'toolCalls': ['private unfinished tool'], 'authorization': 'private auth'}}
        with mock.patch.object(self.app.runs, 'summary', return_value=[run]):
            status, _, raw = self.call('GET', '/api/bootstrap')
        self.assertEqual(status, 200)
        row = json.loads(raw)['runs'][0]
        self.assertEqual(row['outputLimit'], expected)
        self.assertEqual(row['pauseReason'], 'output_limit')
        self.assertEqual(row['contextBudgetTokens'], 1000000)
        self.assertTrue(row['canResume'])
        self.assertNotIn('private partial reply', raw.decode('utf8'))
        self.assertNotIn('private unfinished tool', raw.decode('utf8'))
        self.assertNotIn('private auth', raw.decode('utf8'))
        self.app.providers.complete.assert_not_called()

    def test_output_limit_public_values_reject_wrong_types_and_negative_numbers(self):
        from app.server import public_output_limit
        self.assertIsNone(public_output_limit([]))
        self.assertEqual(public_output_limit({'provider': {}, 'model': [], 'stopReason': 'length',
            'requestedTokens': True, 'nextTokens': -1, 'attempts': '2',
            'outputTokens': 1.5, 'reasoningTokens': 0}), {'stopReason': 'length', 'reasoningTokens': 0})

    def test_bootstrap_continuous_policy_has_nullable_limits_without_internal_fields(self):
        run = {'id': 'continuous-run', 'projectId': self.project['id'], 'status': 'running',
               'createdAt': '2026-10-16T00:00:00Z', 'executionPolicy': 'continuous',
               'limits': {'maxSteps': None, 'maxRunSeconds': None, 'modelTokensPerStep': 8192,
                          'internalState': 'private limit metadata'}}
        with mock.patch.object(self.app.runs, 'summary', return_value=[run]):
            status, _, raw = self.call('GET', '/api/bootstrap')
        self.assertEqual(status, 200)
        row = json.loads(raw)['runs'][0]
        self.assertEqual(row['executionPolicy'], 'continuous')
        self.assertEqual(row['limits'], {'maxSteps': None, 'maxRunSeconds': None, 'modelTokensPerStep': 8192})
        self.assertNotIn('private limit metadata', raw.decode('utf8'))
        self.app.providers.complete.assert_not_called()

    def test_execution_limit_summary_rejects_wrong_types_and_unknown_policy(self):
        from app.server import public_execution_limits
        self.assertIsNone(public_execution_limits([]))
        self.assertIsNone(public_execution_limits({'maxSteps': True, 'maxRunSeconds': -1, 'modelTokensPerStep': '8192'}))
        run = {'id': 'invalid-policy', 'projectId': self.project['id'], 'executionPolicy': {'private': 'data'}}
        with mock.patch.object(self.app.runs, 'summary', return_value=[run]):
            _, _, raw = self.call('GET', '/api/bootstrap')
        self.assertNotIn('executionPolicy', json.loads(raw)['runs'][0])

    def test_workflow_exits_on_paused_run_without_wait_or_automatic_resume(self):
        workflow = self.app.workflows
        job = {'id': 'resume-workflow', 'projectId': self.project['id'], 'projectIds': [self.project['id']],
               'kind': 'learn', 'status': 'running', 'request': {}, 'createdAt': 1,
               'runIds': [], 'results': [], 'events': []}
        workflow.jobs[job['id']] = job
        workflow.cancel[job['id']] = threading.Event()
        paused = {'id': 'saved-run', 'status': 'paused', 'canResume': True,
                  'response': '本轮调用预算已用完，进度已保存'}
        with mock.patch.object(self.app.runs, 'start', return_value={'id': 'saved-run'}) as start, \
             mock.patch.object(self.app.runs, 'summary', return_value=[]), \
             mock.patch.object(self.app.runs, 'get', return_value=paused), \
             mock.patch.object(self.app.runs, 'resume', create=True) as resume, \
             mock.patch.object(self.app.runs, 'stop') as stop, \
             mock.patch.object(workflow.cancel[job['id']], 'wait') as wait:
            with self.assertRaisesRegex(RuntimeError, '模型阶段未完成.*主智能体任务记录中继续'):
                workflow._run_agent(job, self.project['id'], '参考观察', '检查画面')
        self.assertEqual(job['runIds'], ['saved-run'])
        start.assert_called_once()
        wait.assert_not_called()
        resume.assert_not_called()
        stop.assert_not_called()
        self.app.providers.complete.assert_not_called()
        job['status'] = 'failed'


if __name__ == '__main__':
    unittest.main()
