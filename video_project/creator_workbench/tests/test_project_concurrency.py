"""Offline synchronization tests: separate projects overlap, one project serializes."""
import copy
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest
from types import SimpleNamespace

from app.harness import ProjectBusy, RunManager
from app.media_studio import MediaStudio
from app.providers import ProviderError
from app.workflows import Workflows


def reply(text='完成', calls=None):
    return {'text': text, 'tool_calls': calls or [], 'model': 'offline', 'usage': {}, 'stop_reason': 'completed'}


class Library:
    def __init__(self, root):
        self.rows = {}
        for ident in ('one', 'two'):
            path = root / ident
            path.mkdir()
            self.rows[ident] = {'id': ident, 'name': ident, 'path': str(path)}

    def project(self, ident): return dict(self.rows[ident])
    def snapshot(self, **kwargs): return {'projects': list(self.rows.values()), 'skills': [], 'tools': [], 'plugins': []}


class Providers:
    def __init__(self, handler):
        self.handler = handler
        self.calls = []
        self.lock = threading.Lock()

    def public_status(self):
        return [{'id': who, 'configured': True, 'model': 'offline'} for who in ('openai', 'claude')]

    def complete(self, provider, messages, **kwargs):
        with self.lock:
            self.calls.append({'provider': provider, 'messages': copy.deepcopy(messages)})
        return self.handler(provider, messages, kwargs)


class ProjectConcurrencyTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.library = Library(self.root)
        self.managers = []

    def tearDown(self):
        for manager in self.managers:
            for row in manager.summary():
                if row['status'] in {'queued', 'running', 'cancelling'}: manager.stop(row['id'])
            self.assertTrue(manager.semaphore.acquire(timeout=5), 'fixture workers did not stop')
        self.tmp.cleanup()

    def manager(self, handler):
        manager = RunManager(self.library, Providers(handler), self.root / 'state', self.root)
        self.managers.append(manager)
        return manager

    def start(self, manager, pid='one', **extra):
        return manager.start({'projectId': pid, 'provider': 'openai', 'prompt': '核对工程', **extra})['id']

    def wait(self, manager, ident):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            row = manager.get(ident)
            if row['status'] not in {'queued', 'running', 'cancelling'} and ident not in manager.workers: return row
            time.sleep(.01)
        self.fail('run did not finish')

    def test_two_projects_enter_provider_before_either_returns(self):
        rendezvous = threading.Barrier(2)
        def complete(*args):
            rendezvous.wait(3)
            return reply()
        manager = self.manager(complete)
        first = self.start(manager)
        second = self.start(manager, 'two')
        self.assertEqual(self.wait(manager, first)['status'], 'completed')
        self.assertEqual(self.wait(manager, second)['status'], 'completed')
        self.assertEqual(len(manager.providers.calls), 2)

    def test_same_project_start_is_atomic_and_client_retry_is_idempotent(self):
        entered = threading.Event()
        release = threading.Event()
        def complete(provider, messages, kwargs):
            entered.set(); release.wait(3)
            return reply()
        manager = self.manager(complete)
        first = self.start(manager, clientRequestId='submit-123456')
        try:
            self.assertTrue(entered.wait(2))
            with self.assertRaises(ProjectBusy): self.start(manager)
            self.assertEqual(self.start(manager, clientRequestId='submit-123456'), first)
            self.assertEqual(len(manager.providers.calls), 1)
        finally: release.set()
        self.assertEqual(self.wait(manager, first)['status'], 'completed')
        self.assertEqual(self.start(manager, clientRequestId='submit-123456'), first)
        restored = RunManager(self.library, manager.providers, self.root / 'state', self.root)
        self.assertEqual(self.start(restored, clientRequestId='submit-123456'), first)
        self.assertEqual(len(manager.providers.calls), 1)

    def test_concurrent_duplicate_submissions_have_one_worker(self):
        entered = threading.Event(); release = threading.Event(); start = threading.Barrier(3)
        manager = self.manager(lambda *args: (entered.set(), release.wait(3), reply())[-1])
        ids = []; errors = []
        def submit():
            start.wait()
            try: ids.append(self.start(manager, clientRequestId='same-12345678'))
            except Exception as error: errors.append(error)
        workers = [threading.Thread(target=submit) for _ in range(2)]
        for worker in workers: worker.start()
        start.wait()
        try:
            for worker in workers: worker.join(3)
            self.assertFalse(errors)
            self.assertEqual(len(ids), 2)
            self.assertEqual(ids[0], ids[1])
        finally: release.set()
        self.assertEqual(self.wait(manager, ids[0])['status'], 'completed')
        self.assertEqual(len(manager.providers.calls), 1)

    def test_resume_is_not_blocked_by_another_project(self):
        active = threading.Event(); release = threading.Event(); failed = [False]
        def complete(provider, messages, kwargs):
            if '"id": "two"' in messages[0]['content']:
                active.set(); release.wait(4); return reply()
            if not failed[0]:
                failed[0] = True
                raise ProviderError('offline network interruption', kind='network', retryable=True)
            return reply()
        manager = self.manager(complete)
        first = self.start(manager)
        self.assertEqual(self.wait(manager, first)['status'], 'paused')
        second = self.start(manager, 'two')
        try:
            self.assertTrue(active.wait(2))
            manager.resume(first)
            self.assertEqual(self.wait(manager, first)['status'], 'completed')
            self.assertEqual(manager.get(second)['status'], 'running')
        finally: release.set()
        self.wait(manager, second)

    def test_local_project_operation_waits_for_same_project_only(self):
        release = threading.Event(); entered = threading.Event(); same = threading.Event()
        responses = iter([reply('', [{'id':'read', 'name':'list_files', 'arguments':{}}]), reply()])
        manager = self.manager(lambda *args: next(responses))
        original = manager.tool
        def slow_tool(*args):
            entered.set(); release.wait(3)
            return original(*args)
        manager.tool = slow_tool
        first = self.start(manager)
        self.assertTrue(entered.wait(2))
        def operation():
            with manager.project_operation('one'): same.set()
        worker = threading.Thread(target=operation)
        worker.start()
        try:
            with manager.project_operation('two'): self.assertFalse(same.is_set())
            self.assertFalse(same.wait(.1))
        finally: release.set()
        worker.join(3)
        self.assertTrue(same.is_set())
        self.wait(manager, first)

    def test_candidate_selection_is_atomic_with_other_same_project_run(self):
        candidates = json.dumps({'candidates': [{'id': name, 'title': name, 'approach': '路线', 'tradeoffs': '权衡'} for name in 'ABC']})
        manager = self.manager(lambda *args: reply(candidates))
        ident = self.start(manager, candidates=True)
        self.assertEqual(self.wait(manager, ident)['status'], 'awaiting_selection')
        other = copy.deepcopy(manager.runs[ident])
        other.update(id='other', status='running', candidateMode=False)
        manager.runs['other'] = other
        try:
            with self.assertRaises(ProjectBusy): manager.select_candidate(ident, 'A')
            self.assertIsNone(manager.get(ident)['selectedCandidateId'])
            self.assertEqual(len(manager.get(ident)['phases']), 2)
        finally: manager.runs.pop('other')
        manager.stop(ident)

    def test_resume_is_blocked_by_another_same_project_run(self):
        manager = self.manager(lambda *args: (_ for _ in ()).throw(ProviderError('offline', kind='network', retryable=True)))
        ident = self.start(manager)
        self.assertEqual(self.wait(manager, ident)['status'], 'paused')
        other = copy.deepcopy(manager.runs[ident]); other.update(id='other', status='running')
        manager.runs['other'] = other
        try:
            with self.assertRaises(ProjectBusy): manager.resume(ident)
            self.assertEqual(manager.get(ident)['status'], 'paused')
        finally: manager.runs.pop('other')

    def test_summary_keeps_old_active_and_recoverable_runs(self):
        manager = self.manager(lambda *args: reply())
        ident = self.start(manager); self.wait(manager, ident)
        base = manager.get(ident)
        manager.runs.clear()
        for number in range(35):
            row = copy.deepcopy(base); row.update(id=str(number), createdAt=f'2026-10-{number+1:02}', status='completed')
            manager.runs[row['id']] = row
        manager.runs['0']['status'] = 'running'
        manager.runs['1']['status'] = 'paused'
        rows = {r['id'] for r in manager.summary()}
        self.assertIn('0', rows); self.assertIn('1', rows)
        self.assertNotIn('2', rows)
        manager.runs['0']['status'] = 'completed'

    def wait_media(self, studio, ident):
        end = time.monotonic() + 5
        while time.monotonic() < end:
            row = studio.get_job(ident)
            if row['status'] not in {'queued', 'running'}:return row
            time.sleep(.01)
        self.fail('media job did not finish')

    def test_media_jobs_from_different_projects_run_concurrently(self):
        manager = self.manager(lambda *args: reply())
        studio = MediaStudio(self.root, self.root / 'state', self.library, coordinator=manager)
        rendezvous = threading.Barrier(2)
        def render(job): rendezvous.wait(3); return {'checked':True}
        first = studio.submit_external('offline-render', 'one', render)
        second = studio.submit_external('offline-render', 'two', render)
        self.assertEqual(self.wait_media(studio, first['id'])['status'], 'completed')
        self.assertEqual(self.wait_media(studio, second['id'])['status'], 'completed')

    def test_media_queued_same_project_can_cancel_without_running(self):
        manager = self.manager(lambda *args: reply())
        studio = MediaStudio(self.root, self.root / 'state', self.library, coordinator=manager)
        entered = threading.Event(); release = threading.Event(); second_ran = threading.Event()
        first = studio.submit_external('offline-render', 'one', lambda job:(entered.set(), release.wait(4), {})[-1])
        self.assertTrue(entered.wait(2))
        second = studio.submit_external('offline-render', 'one', lambda job:(second_ran.set(), {})[-1])
        try:
            studio.cancel_job(second['id'])
            self.assertEqual(self.wait_media(studio, second['id'])['status'], 'cancelled')
            self.assertTrue(studio.has_active('one'))
            self.assertFalse(studio.has_active('two'))
            self.assertFalse(second_ran.is_set())
        finally:release.set();self.wait_media(studio, first['id'])

    def test_model_can_submit_media_then_query_without_project_lock_deadlock(self):
        finished = threading.Event(); counter = [0]; job_id = [None]
        def complete(provider, messages, kwargs):
            counter[0] += 1
            if counter[0] == 1:
                return reply('', [{'id':'submit', 'name':'project_action', 'arguments':{'action':'audio.mix', 'arguments':{}}}])
            if counter[0] == 2:
                self.assertTrue(finished.wait(2), 'media child blocked behind its parent run')
                return reply('', [{'id':'inspect', 'name':'project_job', 'arguments':{'id':job_id[0]}}])
            return reply('实际任务完成')
        manager = self.manager(complete)
        studio = MediaStudio(self.root, self.root / 'state', self.library, coordinator=manager)
        def callback(pid, name, args):
            if name == 'project_action':
                value = studio.submit_external('offline-mix', pid, lambda job:(finished.set(), {'verified':True})[-1])
                job_id[0] = value['id'];return value
            return studio.get_job(args['id'])
        manager.project_callback = callback
        result = self.wait(manager, self.start(manager))
        self.assertEqual(result['status'], 'completed', result.get('response'))
        self.assertEqual(studio.get_job(job_id[0])['status'], 'completed')
        self.assertEqual(len(manager.providers.calls), 3)

    def test_workflow_stage_ignores_another_project_run(self):
        active = threading.Event(); release = threading.Event()
        def complete(provider, messages, kwargs):
            if '"id": "two"' in messages[0]['content']:
                active.set(); release.wait(4)
            return reply()
        manager = self.manager(complete)
        app = SimpleNamespace(runs=manager, state_root=self.root / 'state', library=self.library,
                              studio=SimpleNamespace(context=lambda pid, value:value, config=lambda pid:{}))
        workflow = Workflows(app)
        job = {'id': 'fixture', 'kind': 'learn', 'projectId': 'one', 'projectIds': ['one'],
               'status': 'running', 'request': {}, 'createdAt': time.time(), 'runIds': [], 'events': []}
        workflow.jobs[job['id']] = job; workflow.cancel[job['id']] = threading.Event()
        other = self.start(manager, 'two')
        try:
            self.assertTrue(active.wait(2))
            result = workflow._run_agent(job, 'one', '复核', '核对当前工程')
            self.assertEqual(result['status'], 'completed')
            self.assertEqual(manager.get(other)['status'], 'running')
        finally: release.set()
        self.wait(manager, other)


if __name__ == '__main__': unittest.main()
