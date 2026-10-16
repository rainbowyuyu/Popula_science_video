"""Offline crash/cancellation recovery without replaying side effects."""
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch

from app.harness import RunManager
from app.providers import ProviderError
from tests.test_project_concurrency import Library, Providers, reply


def write_call(ident, path, content):
    return {'id': ident, 'name': 'write_file', 'arguments': {'path': path, 'content': content}}


class RecoveryLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        self.library = Library(self.root); self.state = self.root / 'state'; self.managers = []

    def tearDown(self):
        for manager in self.managers:
            for row in manager.summary():
                if row['status'] in {'queued', 'running', 'cancelling'}: manager.stop(row['id'])
            self.assertTrue(manager.semaphore.acquire(timeout=5))
        self.tmp.cleanup()

    def manager(self, handler):
        manager = RunManager(self.library, Providers(handler), self.state, self.root)
        self.managers.append(manager)
        return manager

    def start(self, manager):
        return manager.start({'projectId': 'one', 'provider': 'openai', 'prompt': '修复当前工程'})['id']

    def wait(self, manager, ident):
        end = time.monotonic() + 5
        while time.monotonic() < end:
            row = manager.get(ident)
            if row['status'] not in {'queued', 'running', 'cancelling'} and ident not in manager.workers: return row
            time.sleep(.01)
        self.fail('run did not finish')

    def test_cancel_partial_tool_batch_reconciles_without_replay(self):
        responses = iter([reply('', [write_call('a', 'first.txt', 'saved'), write_call('b', 'second.txt', 'never')]), reply()])
        manager = self.manager(lambda *args: next(responses))
        original = manager.tool
        def stop_after_write(ident, project, name, args, cancel):
            result = original(ident, project, name, args, cancel)
            if name == 'write_file': manager.stop(ident)
            return result
        with patch.object(manager, 'tool', side_effect=stop_after_write):
            ident = self.start(manager)
            cancelled = self.wait(manager, ident)
        self.assertEqual(cancelled['status'], 'cancelled')
        self.assertTrue(cancelled['canResume'])
        self.assertEqual(cancelled['recovery']['mode'], 'reconcile')
        self.assertEqual(cancelled['recovery']['completedTools'], 1)
        self.assertEqual((self.root / 'one/first.txt').read_text(), 'saved')
        self.assertFalse((self.root / 'one/second.txt').exists())
        manager.resume(ident)
        completed = self.wait(manager, ident)
        self.assertEqual(completed['status'], 'completed')
        self.assertEqual(len(completed['changedFiles']), 1)
        resumed = manager.providers.calls[-1]['messages']
        self.assertFalse(any(m.get('tool_calls') for m in resumed))
        self.assertTrue(any('不是可重放' in str(m.get('content')) for m in resumed))

    def test_queued_cancel_has_resume_without_provider_call(self):
        manager = self.manager(lambda *args: reply())
        with manager.project_operation('one'):
            ident = self.start(manager)
            manager.stop(ident)
            row = self.wait(manager, ident)
            self.assertEqual(row['status'], 'cancelled')
            self.assertTrue(row['canResume'])
            self.assertEqual(manager.providers.calls, [])
        manager.resume(ident)
        self.assertEqual(self.wait(manager, ident)['status'], 'completed')
        self.assertEqual(len(manager.providers.calls), 1)

    def test_corrupt_checkpoint_uses_backup_but_never_replays_tools(self):
        calls = [0]
        def complete(*args):
            calls[0] += 1
            if calls[0] == 1:return reply('', [write_call('a', 'first.txt', 'saved')])
            raise ProviderError('timeout', kind='timeout', retryable=True)
        manager = self.manager(complete)
        ident = self.start(manager)
        self.assertEqual(self.wait(manager, ident)['status'], 'paused')
        checkpoint = self.state / 'runs' / ident / 'checkpoint.json'
        self.assertTrue(checkpoint.with_suffix('.json.bak').is_file())
        checkpoint.write_text('{broken', encoding='utf8')
        restored = self.manager(lambda *args: reply())
        saved = restored.read_checkpoint(restored.get(ident))
        self.assertTrue(saved['_fromBackup'])
        self.assertFalse(saved['safe'])
        self.assertEqual(restored.get(ident)['recovery']['mode'], 'reconcile')
        restored.resume(ident)
        result = self.wait(restored, ident)
        self.assertEqual(result['status'], 'completed')
        self.assertEqual(len(result['changedFiles']), 1)
        self.assertEqual((self.root / 'one/first.txt').read_text(), 'saved')
        self.assertFalse(any(m.get('tool_calls') for m in restored.providers.calls[0]['messages']))

    def test_checkpoint_and_run_are_fsynced_and_run_backup_survives_corruption(self):
        manager = self.manager(lambda *args: (_ for _ in ()).throw(ProviderError('offline', kind='network', retryable=True)))
        with patch('app.harness.os.fsync', wraps=os.fsync) as fsync:
            ident = self.start(manager)
            row = self.wait(manager, ident)
            self.assertGreater(fsync.call_count, 3)
        self.assertEqual(row['status'], 'paused')
        manager.persist(ident)
        (self.state / 'runs' / ident / 'run.json').write_text('invalid', encoding='utf8')
        restored = self.manager(lambda *args: reply())
        self.assertEqual(restored.get(ident)['status'], 'paused')
        self.assertTrue(restored.get(ident)['canResume'])
        self.assertEqual(restored.providers.calls, [])

    def test_restart_marks_running_interrupted_without_resubmitting(self):
        manager = self.manager(lambda *args: reply())
        ident = self.start(manager); self.wait(manager, ident)
        row = manager.runs[ident]
        row['status'] = 'running'; row['phase'] = row['phases'][0]['id']; row['phases'][0]['status'] = 'running'
        manager.persist(ident)
        restored = self.manager(lambda *args: reply())
        result = restored.get(ident)
        self.assertEqual(result['status'], 'interrupted')
        self.assertEqual(result['phases'][0]['status'], 'interrupted')
        self.assertTrue(result['canResume'])
        self.assertEqual(restored.providers.calls, [])
        self.assertNotIn('messages', result['recovery'])

    def test_abrupt_worker_exit_is_interrupted_and_resumable(self):
        def abrupt(*args): raise SystemExit('simulated worker exit')
        manager = self.manager(abrupt)
        row = self.wait(manager, self.start(manager))
        self.assertEqual(row['status'], 'interrupted')
        self.assertTrue(row['canResume'])
        self.assertEqual(row['recovery']['mode'], 'exact')

    def test_final_snapshot_is_hidden_until_worker_finishes_persistence(self):
        for candidate_mode,expected in ((False,'completed'),(True,'awaiting_selection')):
            with self.subTest(candidate_mode=candidate_mode):
                text = json.dumps({'candidates':[{'id':name,'title':name,'approach':'路线','tradeoffs':'权衡'} for name in 'ABC']}) if candidate_mode else '完成'
                manager = self.manager(lambda *args:reply(text))
                saving = threading.Event(); release = threading.Event()
                original = manager.persist
                def held_persist(ident):
                    if manager.runs[ident]['status'] == expected and ident in manager.workers:
                        saving.set();release.wait(5)
                    return original(ident)
                with patch.object(manager,'persist',side_effect=held_persist):
                    ident = manager.start({'projectId':'one','provider':'openai','prompt':'完成工程','candidates':candidate_mode})['id']
                    try:
                        self.assertTrue(saving.wait(3))
                        snapshot = manager.get(ident)
                        self.assertEqual(snapshot['status'],'running')
                        self.assertTrue(snapshot['finalizing'])
                        self.assertFalse(snapshot['canResume'])
                        self.assertEqual(next(r for r in manager.summary() if r['id']==ident)['status'],'running')
                        self.assertEqual(manager.runs[ident]['status'],expected,'public masking must not alter checkpoint state')
                    finally:release.set()
                    final = self.wait(manager,ident)
                self.assertEqual(final['status'],expected)
                self.assertNotIn('finalizing',final)
                if candidate_mode:manager.stop(ident)


if __name__ == '__main__': unittest.main()
