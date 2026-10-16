"""Offline adapter/phase checks; no configured services are contacted."""
import copy
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock

from app.context_budget import compact_context
from app.harness import RunManager
from app.providers import ProviderError, ProviderManager, validate_model_efforts, effort_options
from tests.test_collaboration import FakeLibrary, response
from tests import test_providers as provider_fixture


class EffortWireTests(unittest.TestCase):
    setUp = provider_fixture.ProvidersTest.setUp
    tearDown = provider_fixture.ProvidersTest.tearDown
    openai_config = provider_fixture.ProvidersTest.openai_config
    claude_config = provider_fixture.ProvidersTest.claude_config
    invoke = provider_fixture.ProvidersTest.invoke

    def test_responses_effort_and_effective_report(self):
        result, request = self.invoke({'output_text': 'ok'}, effort='xhigh')
        self.assertEqual(request['body']['reasoning'], {'effort': 'xhigh'})
        self.assertEqual(result['effectiveEffort'], 'xhigh')
        self.assertEqual(result['effortSource'], 'run-override')

    def test_chat_completion_effort_has_correct_wire_name(self):
        self.openai_config(wire='chat')
        _, request = self.invoke({'choices': [{'message': {'content': 'ok'}}]}, effort='medium')
        self.assertEqual(request['body']['reasoning_effort'], 'medium')
        self.assertNotIn('reasoning', request['body'])

    def test_claude_effort_uses_adaptive_thinking_and_no_temperature(self):
        self.claude_config({'ANTHROPIC_MODEL': 'claude-opus-5-5', 'ANTHROPIC_API_KEY': 'fixture'})
        result, request = self.invoke({'content': [{'type': 'text', 'text': 'ok'}]}, provider='claude', effort='max')
        self.assertEqual(request['body']['output_config'], {'effort': 'max'})
        self.assertEqual(request['body']['thinking'], {'type': 'adaptive'})
        self.assertNotIn('temperature', request['body'])
        self.assertEqual(result['effectiveEffort'], 'max')

    def test_default_uses_fresh_cc_switch_effort_without_writing_settings(self):
        path = self.home / '.codex/config.toml'
        path.write_text('model_reasoning_effort = "medium"\n' + path.read_text(), encoding='utf8')
        original = path.read_bytes()
        result, request = self.invoke({'output_text': 'ok'})
        self.assertEqual(request['body']['reasoning']['effort'], 'medium')
        self.assertEqual(result['effortSource'], 'cc-switch')
        self.assertEqual(path.read_bytes(), original)
        path.write_bytes(original.replace(b'"medium"', b'"high"'))
        _, request = self.invoke({'output_text': 'ok'})
        self.assertEqual(request['body']['reasoning']['effort'], 'high')
        self.claude_config({'ANTHROPIC_MODEL': 'claude-opus-4-6', 'ANTHROPIC_API_KEY': 'fixture', 'CLAUDE_CODE_EFFORT_LEVEL': 'low'})
        _, request = self.invoke({'content': [{'type': 'text', 'text': 'ok'}]}, provider='claude')
        self.assertEqual(request['body']['output_config']['effort'], 'low')

    def test_unknown_alias_or_unsupported_effort_fails_before_network(self):
        for provider, model, effort in [('openai', 'gpt-4.1', 'high'), ('claude', 'claude-sonnet-4-6', 'max'),
                                        ('claude', 'unknown-opus-alias', 'high'), ('openai', 'gpt-5', 'xhigh')]:
            with self.subTest(model=model), mock.patch.object(self.manager, '_request') as request:
                with self.assertRaises(ProviderError):
                    self.manager.complete(provider, [{'role': 'user', 'content': 'hello'}], model=model, effort=effort)
                request.assert_not_called()

    def test_default_unknown_model_does_not_inject_reasoning(self):
        result, request = self.invoke({'output_text': 'ok'}, model='custom-alias')
        self.assertNotIn('reasoning', request['body'])
        self.assertEqual(result['effectiveEffort'], 'default')

    def test_public_status_contains_safe_capabilities(self):
        self.claude_config({'ANTHROPIC_MODEL': 'claude-opus-5-5', 'ANTHROPIC_API_KEY': 'fixture'})
        statuses = {p['id']: p for p in self.manager.public_status()}
        self.assertIn('xhigh', statuses['openai']['effortOptions'])
        self.assertIn('max', statuses['claude']['effortOptions'])
        self.assertNotIn('fixture', json.dumps(statuses))
        self.assertEqual(effort_options('claude', 'claude-haiku-4-5'), ('default',))

    def test_bad_effort_objects_are_rejected_strictly(self):
        self.assertEqual(validate_model_efforts({'claude': 'max'}), {'claude': 'max', 'openai': 'xhigh'})
        for value in (True, 'high', [], {'other': 'low'}, {'openai': 'max'}, {'claude': 'xhigh'}, {'openai': None}):
            with self.subTest(value=value), self.assertRaises(ValueError):
                validate_model_efforts(value)


class PhaseControlTests(unittest.TestCase):
    def test_each_dual_phase_receives_its_own_effort_with_one_million_budget(self):
        class Recorder:
            def __init__(self): self.calls = []
            def public_status(self):
                return [{'id': p, 'configured': True, 'model': 'fixture'} for p in ('openai', 'claude')]
            def complete(self, provider, messages, **kwargs):
                self.calls.append((provider, copy.deepcopy({k: v for k, v in kwargs.items() if k != 'cancel_event'})))
                return {**response(), 'effectiveEffort': kwargs['effort'], 'effortSource': 'run-override'}

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / 'project'
            project.mkdir()
            recorder = Recorder()
            manager = RunManager(FakeLibrary(project), recorder, root / 'state', root / 'resources')
            ident = manager.start({'projectId': 'project', 'provider': 'dual', 'prompt': '检查此工程',
                'contextBudgetTokens': 1000000, 'modelEfforts': {'openai': 'xhigh', 'claude': 'low'}})['id']
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and not manager.get(ident).get('finishedAt'):
                time.sleep(.02)
            row = manager.get(ident)
            self.assertEqual(row['status'], 'completed', row.get('response'))
            self.assertEqual(len(recorder.calls), 4)
            for provider, args in recorder.calls:
                self.assertEqual(args['effort'], 'xhigh' if provider == 'openai' else 'low')
            self.assertEqual(row['contextBudgetTokens'], 1000000)
            for usage in row['usage']:
                self.assertEqual(usage['contextStats']['budgetTokens'], 1000000)
                self.assertEqual(usage['requestedEffort'], 'xhigh' if usage['provider'] == 'openai' else 'low')
                self.assertEqual(usage['effectiveEffort'], usage['requestedEffort'])
            saved = json.loads((root / 'state/runs' / ident / 'run.json').read_text(encoding='utf8'))
            self.assertEqual(saved['modelEfforts'], {'openai': 'xhigh', 'claude': 'low'})

    def test_one_million_retains_more_real_history_than_256k(self):
        messages = [{'role': 'system', 'content': 'system'}]
        messages.extend({'role': 'user', 'content': 'history ' * 8000, '_context_history': True} for _ in range(30))
        messages.append({'role': 'user', 'content': 'current task', '_context_keep': True})
        low, low_stats = compact_context(messages, budget=256000)
        high, high_stats = compact_context(messages, budget=1000000)
        self.assertGreater(len(high), len(low))
        self.assertGreater(high_stats['estimatedInputTokens'], low_stats['estimatedInputTokens'])
        self.assertLessEqual(high_stats['estimatedInputTokens'], 964000)
        self.assertEqual(high[-1]['content'], 'current task')


if __name__ == '__main__':
    unittest.main()
