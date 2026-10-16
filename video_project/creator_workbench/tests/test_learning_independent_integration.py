"""HTTP learning flow with real video import/frames/decode; no live model or download."""
import contextlib
import json
from pathlib import Path
import shutil
import socket
import subprocess
import threading
import time
import unittest
import uuid
from unittest import mock

from app.learning_workspace import LearningWorkspace
from app.library import Library
from tests import test_server as fixture


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
class IndependentLearningIntegration(unittest.TestCase):
    call = fixture.ServerTests.call

    @classmethod
    def setUpClass(cls):
        import tempfile
        cls.sample_dir = tempfile.TemporaryDirectory()
        cls.sample = Path(cls.sample_dir.name) / 'reference.mp4'
        subprocess.run([shutil.which('ffmpeg'), '-v', 'error', '-f', 'lavfi', '-i',
                        'testsrc2=size=320x180:rate=12', '-t', '4', '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p', str(cls.sample)], check=True, capture_output=True, timeout=20)

    @classmethod
    def tearDownClass(cls):
        cls.sample_dir.cleanup()

    def setUp(self):
        fixture.ServerTests.setUp(self)
        self.app.providers.public_status.return_value = [
            {'id': p, 'configured': True, 'name': p, 'model': 'fixture'} for p in ('openai', 'claude')]
        self.original_config = self.app.studio.config(self.project['id'])
        self.original_media = self.media.read_bytes()

    def tearDown(self):
        for task in self.app.learning.snapshot()['tasks']:
            if task['status'] in {'queued', 'waiting', 'running', 'cancelling'}:
                self.app.learning.action({'action': 'learning.cancel', 'id': task['id']})
        worker = self.app.learning.worker
        if worker:
            worker.join(timeout=4)
        fixture.ServerTests.tearDown(self)

    def action(self, action, **values):
        status, _, raw = self.call('POST', '/api/studio/action', {'action': action, **values}, csrf=True)
        self.assertEqual(status, 200, raw.decode())
        return json.loads(raw)

    def wait_task(self, task_id):
        deadline = time.monotonic() + 35
        while time.monotonic() < deadline:
            task = next(t for t in self.action('learning.list')['tasks'] if t['id'] == task_id)
            if task['status'] not in {'queued', 'waiting', 'running', 'cancelling'}:
                return task
            time.sleep(.05)
        self.fail('learning fixture did not finish')

    @contextlib.contextmanager
    def simulated_models(self, *, observe=True):
        """Replace only model decisions; execute the real inspect_frame tool and render validation."""
        phases = []
        def run_agent(job, pid, phase, prompt, mode='creative', context=None):
            phases.append(phase)
            project = self.app.library.project(pid)
            prepared = self.app.studio.context(pid, {'module': 'learning', **(context or {})})
            self.assertFalse(prepared['useSeriesStyle'], prepared)
            ident = 'learning-test-' + uuid.uuid4().hex
            row = {'id': ident, 'projectId': pid, 'createdAt': '2026-10-16T10:00:00',
                   'status': 'completed', 'mode': mode, 'provider': 'dual', 'prompt': prompt,
                   'events': [], 'phases': [], 'phase': 'fixture', 'changedFiles': [],
                   'response': '观察到了主体比例和光照关系。'}
            self.app.runs.runs[ident] = row
            (self.app.state_root / 'runs' / ident).mkdir(parents=True)
            job['runIds'].append(ident)
            reference = context['reference']
            def inspect(path, times):
                for at in times:
                    evidence = self.app.runs.tool(ident, project, 'inspect_frame', {'path': path, 'timeSec': at}, threading.Event())
                    self.assertTrue(evidence['imageAttached'])
                    row['events'].append({'type': 'tool_result', 'tool': 'inspect_frame',
                                          'message': json.dumps(evidence), 'phase': 'fixture'})
            if phase == '观察参考':
                if observe:
                    start, end = reference['startSec'], reference['endSec']
                    inspect(reference['path'], [start, (start + end) / 2, max(start, end - .15)])
            elif phase.startswith('试做'):
                target = Path(project['path']) / context['expectedOutput']
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(self.sample, target)
            elif phase.startswith('对照复核'):
                inspect(reference['path'], [0, 1.5])
                inspect(context['previewPath'], [.5, 2])
                row['response'] = json.dumps({'pass': True, 'summary': '仅对真实抽帧的主体比例和光照完成对照；未试听。',
                                              'improvements': [], 'styleName': '清晰短镜头',
                                              'rules': ['主体留有呼吸空间', '保持相邻构图中主体位置一致']}, ensure_ascii=False)
            return self.app.runs.get(ident)
        with mock.patch.object(self.app.workflows, '_run_agent', side_effect=run_agent):
            yield phases

    def test_http_quick_start_imports_video_inspects_renders_checks_and_keeps_work_private(self):
        with self.simulated_models() as phases:
            result = self.action('learning.quick_start', source=str(self.sample), name='独立运镜练习', endSec=3)
            collection = result['collection']
            self.assertTrue(collection['independent'])
            self.assertIsNone(collection['projectId'])
            task = self.wait_task(result['tasks'][0]['id'])
        self.assertEqual(task['status'], 'completed', task)
        self.assertEqual(phases, ['观察参考', '试做1', '对照复核1'])
        workspace_id = collection['workspaceId']
        root = Path(self.app.library.project(workspace_id)['path'])
        self.assertTrue((root / task['previewPath']).is_file())
        self.assertGreaterEqual(len(list((self.app.state_root / 'runs').glob('learning-test-*/inspected-*.jpg'))), 7)
        self.assertTrue(list((root / 'source/skills').glob('*/SKILL.md')), 'validated private skill must exist')
        self.assertEqual(self.app.studio.config(self.project['id']), self.original_config)
        self.assertEqual(self.media.read_bytes(), self.original_media)
        self.assertFalse((self.videos / 'shared/skills').exists(), 'learning must not publish a global skill automatically')
        self.app.providers.complete.assert_not_called()
        preview = self.action('learning.preview', id=task['id'])
        status, _, raw = self.call('GET', preview['url'])
        self.assertEqual(status, 200)
        self.assertGreater(len(raw), 1000)
        self.app.library.snapshot(refresh=True, lightweight=True)
        self.assertEqual(self.app.library.project(workspace_id)['id'], workspace_id)
        bootstrap = json.loads(self.call('GET', '/api/bootstrap')[2])
        self.assertNotIn(workspace_id, [p['id'] for p in bootstrap['projects']])
        self.app.library = Library(self.videos, [])
        self.app.runs.library = self.app.library
        self.app.media_studio.library = self.app.library
        self.app.learning = LearningWorkspace(self.app)
        self.app.media_index.clear()
        restored = self.action('learning.preview', id=task['id'])
        self.assertEqual(self.call('GET', restored['url'])[0], 200)
        self.assertEqual(self.app.library.project(workspace_id)['id'], workspace_id)

    def test_missing_real_observation_fails_without_creating_skill(self):
        with self.simulated_models(observe=False) as phases:
            result = self.action('learning.quick_start', source=str(self.sample), name='缺少证据练习', endSec=3)
            task = self.wait_task(result['tasks'][0]['id'])
        self.assertEqual(task['status'], 'failed', task)
        self.assertEqual(phases, ['观察参考'])
        root = Path(self.app.library.project(result['collection']['workspaceId'])['path'])
        self.assertFalse(list(root.glob('source/skills/*/SKILL.md')))
        self.app.providers.complete.assert_not_called()

    def test_https_source_uses_real_download_pipeline_then_actual_frame_validation(self):
        commands = []
        def local_download(job, command, **kwargs):
            commands.append(command)
            self.assertEqual(command[1:3], ['-m', 'yt_dlp'])
            self.assertIn('--ignore-config', command)
            self.assertIn('--no-cookies', command)
            self.assertIn('--download-sections', command)
            destination = Path(command[command.index('-o') + 1])
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(self.sample, destination)
        original_dns = socket.getaddrinfo
        resolve = lambda host, port, *a, **kw: [(2, 1, 6, '', ('93.184.216.34', 443))] if host == 'example.com' else original_dns(host, port, *a, **kw)
        with self.simulated_models() as phases, mock.patch('socket.getaddrinfo', side_effect=resolve), \
                mock.patch.object(self.app.media_studio, '_run', side_effect=local_download):
            result = self.action('learning.quick_start', source='https://example.com/watch/reference', name='链接学习', startSec=1, endSec=3)
            task = self.wait_task(result['tasks'][0]['id'])
        self.assertEqual(task['status'], 'completed', task)
        self.assertEqual(len(commands), 1)
        self.assertIn('*1.0-3.0', commands[0])
        self.assertEqual(phases, ['观察参考', '试做1', '对照复核1'])
        reference = self.app.studio.config(task['projectId'])['references'][0]
        self.assertEqual(reference['sourceRange'], {'startSec': 1.0, 'endSec': 3.0})
        self.assertEqual(reference['startSec'], 0)
        self.assertGreater(reference['duration'], 3)
        self.app.providers.complete.assert_not_called()

    def test_private_url_is_blocked_before_download_or_model_execution(self):
        original_dns = socket.getaddrinfo
        resolve = lambda host, port, *a, **kw: [(2, 1, 6, '', ('127.0.0.1', 443))] if host == 'private.example' else original_dns(host, port, *a, **kw)
        with mock.patch('socket.getaddrinfo', side_effect=resolve), \
                mock.patch.object(self.app.media_studio, '_run', side_effect=AssertionError('no downloader expected')) as downloader, \
                mock.patch.object(self.app.workflows, '_run_agent', side_effect=AssertionError('no model expected')) as agent:
            result = self.action('learning.quick_start', source='https://private.example/video', name='拒绝私网')
            task = self.wait_task(result['tasks'][0]['id'])
        self.assertEqual(task['status'], 'failed', task)
        self.assertIn('公开站点', task['message'])
        downloader.assert_not_called()
        agent.assert_not_called()

    def test_learning_preview_cannot_escape_its_workspace(self):
        collection = self.action('learning.create', name='安全预览')
        self.app.learning.data['tasks'].append({'id': 'escaped', 'collectionId': collection['id'],
            'projectId': collection['workspaceId'], 'status': 'completed', 'previewPath': '../../episode/output/episode_v1_final.mp4'})
        status, _, body = self.call('POST', '/api/studio/action', {'action': 'learning.preview', 'id': 'escaped'}, csrf=True)
        self.assertEqual(status, 400, body.decode())
        self.assertNotIn(self.original_media, body)

    def test_independent_learning_does_not_require_any_existing_video_project(self):
        import tempfile
        from app.server import Workbench
        with tempfile.TemporaryDirectory() as temp:
            base = Path(temp)
            videos = base / 'videos'; videos.mkdir()
            with mock.patch('app.server.Library', side_effect=lambda root: Library(root, [])):
                empty = Workbench(videos, base / 'state', self.resources)
            result = empty.learning.action({'action': 'learning.create', 'name': '从参考开始'})
            self.assertTrue(result['independent'])
            self.assertIsNone(result['projectId'])
            self.assertTrue(Path(empty.library.project(result['workspaceId'])['path']).is_dir())
            self.assertEqual(empty.library.snapshot(lightweight=True)['projects'], [])


if __name__ == '__main__':
    unittest.main()
