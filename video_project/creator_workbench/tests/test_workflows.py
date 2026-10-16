import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
import unittest
from unittest import mock

from app.library import Library
from app.server import Workbench
from app.workflows import Workflows, inspections, normalize_learning_iterations

SOURCE = Path(__file__).resolve().parents[1]


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg required')
class WorkflowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixture = tempfile.TemporaryDirectory()
        cls.video = Path(cls.fixture.name) / 'sample.mp4'
        subprocess.run([shutil.which('ffmpeg'), '-v', 'error', '-f', 'lavfi', '-i',
                        'testsrc2=size=480x270:rate=24', '-t', '4', '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p', str(cls.video)], check=True, capture_output=True, timeout=20)

    @classmethod
    def tearDownClass(cls): cls.fixture.cleanup()

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        self.project = self.root / 'videos' / 'episode'; (self.project / 'output').mkdir(parents=True)
        (self.project / 'project.json').write_text('{}')
        shutil.copy2(self.video, self.project / 'output/episode_v1_final.mp4')
        with mock.patch('app.server.Library', side_effect=lambda root: Library(root, [])):
            self.app = Workbench(self.project.parent, self.root / 'state', SOURCE)
        self.app.providers = mock.Mock()
        self.app.providers.public_status.return_value = [{'id': p, 'configured': True} for p in ('openai', 'claude')]
        self.app.providers.complete.side_effect = AssertionError('No paid calls in fixtures')
        self.app.runs.providers = self.app.providers
        self.pid = self.app.library.snapshot(lightweight=True)['projects'][0]['id']
        self.app.studio.project_configure(self.pid, {'title': '文件怎样保密', 'seriesId': 'rainbow-science', 'useSeriesStyle': True})
        self.w = self.app.workflows

    def tearDown(self):
        for job in self.w.summary():
            if job['status'] in {'queued', 'running', 'cancelling'}: self.w.stop(job['id'])
        self.tmp.cleanup()

    def wait(self, ident):
        deadline = time.monotonic() + 30
        while time.monotonic() < deadline:
            job = self.w.get(ident)
            if job['status'] not in {'queued', 'running', 'cancelling'}: return job
            time.sleep(.03)
        self.fail('Workflow timed out')

    def manual_job(self, kind='batch-copy'):
        job = {'id': 'fixture', 'projectId': self.pid, 'projectIds': [self.pid], 'kind': kind,
               'status': 'running', 'createdAt': time.time(), 'request': {}, 'runIds': [], 'results': [], 'events': []}
        self.w.jobs[job['id']] = job; self.w.cancel[job['id']] = threading.Event()
        return job

    def test_batch_covers_real_four_ratios_and_durable_editable_subject(self):
        result = self.w.start({'kind': 'batch-covers', 'projectIds': [self.pid]})
        job = self.wait(result['workflowId']); self.assertEqual(job['status'], 'completed', job)
        records = job['results'][0]['covers']; self.assertEqual(len(records), 4)
        restored = Library(self.project.parent, [])
        for item in records:
            self.assertTrue((self.project / item['path']).is_file())
            layout = self.app.studio.cover_load(self.pid, {'id': item['id']})['layout']
            self.assertEqual(layout['backgroundOverlay'], 0)
            media = restored.media_lookup(layout['backgroundImage'].rsplit('/', 1)[1])
            self.assertTrue(Path(media['path']).is_file())
            self.assertEqual(media['projectId'], self.pid)
            self.assertEqual(layout['coverSpecVersion'], 1)
        self.assertEqual(len(self.app.library.media_page(self.pid)['items']), 5)
        self.app.providers.complete.assert_not_called()

    def test_capture_survives_reload_and_probe_uses_actual_fps(self):
        media = self.app.library.media_page(self.pid)['items'][0]
        details = self.app.media_probe(media['id']); self.assertAlmostEqual(details['fps'], 24)
        with mock.patch('app.server.probe', side_effect=AssertionError('Must cache')):
            self.assertEqual(self.app.media_probe(media['id']), details)
        frame = self.app.frame_capture({'projectId': self.pid, 'mediaId': media['id'], 'timeSec': 1.25})
        self.app.media_index.clear(); self.app.library = Library(self.project.parent, [])
        self.assertTrue(self.app.media_path(frame['id']).is_file())
        self.assertEqual(frame['sourcePath'], 'output/episode_v1_final.mp4')
        with self.assertRaises(ValueError): self.app.frame_capture({'projectId': self.pid, 'mediaId': media['id'], 'timeSec': 50})

    def test_copy_only_allows_content_fields_and_validates_before_writing(self):
        platforms = {p: {'title': '标题', 'body': '内容', 'tags': [], 'action': 'project.rename', 'projectId': 'evil', 'platform': 'evil'}
                     for p in ('douyin', 'xiaohongshu', 'bilibili', 'wechat')}
        job = self.manual_job()
        with mock.patch.object(self.w, '_run_agent', return_value={'id': 'run', 'response': json.dumps({'platforms': platforms})}):
            result = self.w._copy(job, self.pid)
        self.assertEqual(len(result['copies']), 4)
        self.assertEqual(self.app.studio.config(self.pid)['title'], '文件怎样保密')
        old = (self.project / 'source/publish/douyin.json').read_bytes()
        platforms['wechat']['title'] = '超' * 151
        with mock.patch.object(self.w, '_run_agent', return_value={'id': 'run', 'response': json.dumps({'platforms': platforms})}):
            with self.assertRaises(ValueError): self.w._copy(job, self.pid)
        self.assertEqual((self.project / 'source/publish/douyin.json').read_bytes(), old)
        job['status'] = 'completed'

    def test_cancel_overlap_and_restart_do_not_resubmit(self):
        entered = threading.Event()
        def pending(job, pid):
            entered.set(); self.w.cancel[job['id']].wait(5); self.w._check(job)
        with mock.patch.object(self.w, '_redraw', side_effect=pending):
            ident = self.w.start({'kind': 'batch-covers', 'projectIds': [self.pid]})['workflowId']
            self.assertTrue(entered.wait(2))
            with self.assertRaises(ValueError): self.w.start({'kind': 'batch-covers', 'projectIds': [self.pid]})
            restored = Workflows(self.app)
            self.assertEqual(restored.get(ident)['status'], 'interrupted')
            self.w.stop(ident); self.assertEqual(self.wait(ident)['status'], 'cancelled')

    def test_partial_batch_records_each_project(self):
        other = self.app.create_project('另一集')['id']
        def render(job, pid):
            if pid == self.pid: raise ValueError('No subject')
            return {'covers': []}
        with mock.patch.object(self.w, '_redraw', side_effect=render):
            job = self.wait(self.w.start({'kind': 'batch-covers', 'projectIds': [self.pid, other]})['workflowId'])
        self.assertEqual(job['status'], 'needs_review')
        self.assertEqual([r['status'] for r in job['results']], ['failed', 'completed'])

    def test_other_project_workflow_runs_and_cancels_independently(self):
        other = self.app.create_project('并行集')['id']; entered=threading.Event();second_entered=threading.Event();release=threading.Event()
        def render(job,pid):
            if pid == self.pid:entered.set();release.wait(5)
            else:second_entered.set();self.w.cancel[job['id']].wait(5);self.w._check(job)
            return {'covers':[]}
        with mock.patch.object(self.w,'_redraw',side_effect=render):
            first=self.w.start({'kind':'batch-covers','projectIds':[self.pid]})['workflowId']
            self.assertTrue(entered.wait(2))
            queued=self.w.start({'kind':'batch-covers','projectIds':[other]})['workflowId']
            try:
                self.assertTrue(second_entered.wait(2), 'unrelated project must run concurrently')
                self.w.stop(queued);self.assertEqual(self.wait(queued)['status'],'cancelled')
                self.assertEqual(self.w.get(first)['status'],'running')
            finally:release.set();self.wait(first)

    def learn_fixture(self, *, missing_frames=False, reject_rounds=0, always_reject=False, cancel_after=None):
        runs = {}; attempts = [0]
        def agent(job, pid, phase, prompt, mode='creative', context=None):
            ident = 'run' + str(len(runs)); job['runIds'].append(ident)
            reference = context['reference']['path']; events = []
            def seen(path, times):
                for t in times:
                    events.append({'type': 'tool_result', 'tool': 'inspect_frame', 'message': json.dumps({'path': path, 'timeSec': t, 'imageAttached': True})})
            response = '观察到了具体构图与主体运动'
            if phase == '观察参考':
                if not missing_frames: seen(reference, [0, 1.5, 2.85])
            elif phase.startswith('试做'):
                target = self.project / context['expectedOutput']; target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(self.video, target)
            elif phase.startswith('对照复核'):
                attempts[0] += 1; seen(reference, [0, 1.5]); seen(context['previewPath'], [.5, 2])
                response = json.dumps({'pass': not always_reject and attempts[0] > reject_rounds, 'summary': '实际样片抽帧对照', 'improvements': ['改善主体留白'], 'styleName': '清晰演示', 'rules': ['主体保留足够空间']})
                if cancel_after is not None and attempts[0] >= cancel_after:self.w.stop(job['id'])
            row = {'id': ident, 'status': 'completed', 'response': response, 'events': events}; runs[ident] = row
            return row
        with mock.patch.object(self.w, '_run_agent', side_effect=agent), mock.patch.object(self.app.runs, 'get', side_effect=lambda i: runs[i]):
            ident = self.w.start({'kind': 'learn', 'projectId': self.pid, 'path': str(self.video), 'startSec': 0, 'endSec': 3, 'iterations': 2})['workflowId']
            return self.wait(ident), attempts[0]

    def test_learning_requires_actual_inspection_events(self):
        job, _ = self.learn_fixture(missing_frames=True)
        self.assertEqual(job['status'], 'failed')
        self.assertNotIn('learned', job)
        self.assertFalse((self.project / 'source/skills').exists())

    def test_learning_continues_past_two_rounds_until_real_pass_and_saves_skill(self):
        job, attempts = self.learn_fixture(reject_rounds=3)
        self.assertEqual(job['status'], 'completed', job); self.assertEqual(attempts, 4)
        self.assertIsNone(job['request']['iterations'])
        self.assertEqual(job['executionPolicy'], 'continuous')
        self.assertEqual([item['verdict']['pass'] for item in job['results']], [False, False, False, True])
        self.assertTrue((self.project / job['previewPath']).is_file())
        self.assertTrue(list((self.project / 'source/skills').glob('*/SKILL.md')))
        saved = json.loads((self.project / '.studio/learning' / job['id'] / 'result.json').read_text(encoding='utf8'))
        self.assertEqual(saved['reviewScope'], 'sampled-real-frames-and-full-decode')

    def test_learning_keeps_failed_verdicts_until_user_cancels_without_false_skill(self):
        job, attempts = self.learn_fixture(always_reject=True, cancel_after=3)
        self.assertEqual(job['status'], 'cancelled'); self.assertEqual(attempts, 3)
        self.assertEqual([item['verdict']['pass'] for item in job['results']], [False, False, False])
        self.assertNotIn('learned', job)
        self.assertFalse((self.project / 'source/skills').exists())

    def test_learning_legacy_iteration_values_normalize_to_continuous(self):
        for value in (None, 1, 2, 3, 10000):
            self.assertIsNone(normalize_learning_iterations(value))
            with mock.patch('app.workflows.threading.Thread') as thread:
                ident = self.w.start({'kind': 'learn', 'projectId': self.pid, 'path': str(self.video), 'iterations': value})['workflowId']
            self.assertIsNone(self.w.get(ident)['request']['iterations'])
            self.assertEqual(self.w.get(ident)['request']['executionPolicy'], 'continuous')
            self.app.providers.complete.assert_not_called()
            self.w.jobs[ident]['status'] = 'cancelled'
        for value in (True, False, -1, 0, '2', 2.0):
            with self.subTest(value=value), self.assertRaises(ValueError):
                self.w.start({'kind': 'learn', 'projectId': self.pid, 'path': str(self.video), 'iterations': value})


if __name__ == '__main__': unittest.main()
