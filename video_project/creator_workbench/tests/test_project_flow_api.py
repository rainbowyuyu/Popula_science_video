"""Project isolation and interruption behavior; local fixtures, no model calls."""
import concurrent.futures
import json
import threading
import unittest
from unittest import mock
from tests import test_server as fixture
from app.harness import ProjectBusy


class ProjectFlowAPI(unittest.TestCase):
    setUp = fixture.ServerTests.setUp
    tearDown = fixture.ServerTests.tearDown
    call = fixture.ServerTests.call

    def test_project_busy_has_actionable_conflict_status(self):
        with mock.patch.object(self.app.runs, 'start', side_effect=ProjectBusy('当前工程忙')):
            status, _, raw = self.call('POST', '/api/runs', {'projectId': self.project['id']}, csrf=True)
        self.assertEqual(status, 409)
        self.assertEqual(json.loads(raw)['code'], 'project_busy')

    def test_long_studio_action_does_not_block_other_project_or_reload_reservation(self):
        entered, release = threading.Event(), threading.Event()
        def studio(body):
            if body['action'] == 'cover.preview':
                self.assertFalse(self.server.lifecycle_lock._is_owned())
                self.assertTrue(self.app.request_activity.locked())
                entered.set()
                self.assertTrue(release.wait(5))
            return {'ok': True}
        with mock.patch.object(self.app, 'studio_action', side_effect=studio):
            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
                future = pool.submit(self.call, 'POST', '/api/studio/action', {'action': 'cover.preview'}, csrf=True)
                try:
                    self.assertTrue(entered.wait(3))
                    other = pool.submit(self.call, 'POST', '/api/studio/action', {'action': 'review.save'}, csrf=True)
                    self.assertEqual(other.result(timeout=2)[0], 200)
                finally:
                    release.set()
                self.assertEqual(future.result(timeout=3)[0], 200)
        self.assertFalse(self.app.request_activity.locked())

    def test_studio_exception_releases_runtime_reservation(self):
        with mock.patch.object(self.app, 'studio_action', side_effect=ValueError('invalid')):
            self.assertEqual(self.call('POST', '/api/studio/action', {'action': 'fixture'}, csrf=True)[0], 400)
        self.assertFalse(self.app.request_activity.locked())

    def test_artifact_write_refuses_active_project_but_review_remains_editable(self):
        pid=self.project['id']
        with mock.patch.object(self.app.runs,'assert_available',side_effect=ProjectBusy('当前工程忙')):
            with mock.patch.object(self.app,'_studio_action',return_value={'ok':True}) as operation:
                status,_,_=self.call('POST','/api/studio/action',{'action':'subtitles.save','projectId':pid},csrf=True)
                self.assertEqual(status,409)
                operation.assert_not_called()
                status,_,_=self.call('POST','/api/studio/action',{'action':'review.save','projectId':pid},csrf=True)
                self.assertEqual(status,200)

    def test_model_owned_project_lock_is_reentrant(self):
        pid=self.project['id']
        with self.app.runs.project_operation(pid):
            with mock.patch.object(self.app.runs,'assert_available',side_effect=AssertionError('worker is already owner')):
                with mock.patch.object(self.app,'_studio_action',return_value={'ok':True}):
                    self.assertTrue(self.app.studio_action({'action':'camera.save','projectId':pid})['ok'])

    def test_review_submission_retry_reuses_task_after_draft_and_media_change(self):
        source={'projectId':self.project['id'],'mediaId':self.media_id}
        note={'id':'fixture-note','kind':'note','startSec':1,'endSec':4,'text':'第一次意见'}
        with mock.patch.object(self.app,'media_probe',return_value={'duration':12.5}),mock.patch.object(self.app.runs,'launch') as launch:
            base=self.app.video_review.read(source)
            saved=self.app.video_review.save({**source,'sourceVersion':base['sourceVersion'],
                                              'expectedRevision':0,'notes':[note]})
            request={'projectId':self.project['id'],'provider':'openai','prompt':'本地夹具，不执行模型',
                     'clientRequestId':'review-retry-123456','context':{
                         'taskType':'video-review','mediaId':self.media_id,
                         'sourceVersion':saved['sourceVersion'],'reviewRevision':saved['revision']}}
            status,_,raw=self.call('POST','/api/runs',request,csrf=True)
            self.assertEqual(status,202)
            first=json.loads(raw)
            self.app.video_review.save({**source,'sourceVersion':saved['sourceVersion'],
                                       'expectedRevision':saved['revision'],
                                       'notes':[{**note,'text':'继续编辑后的意见'}]})
            # A lost HTTP response must be recoverable even if mutable context has changed.
            for replace_media in (False,True):
                if replace_media:self.media.write_bytes(b'new-video-after-request-was-accepted')
                with self.subTest(replaced=replace_media),mock.patch.object(self.app.studio,'context',side_effect=AssertionError('accepted retry must not re-snapshot context')):
                    status,_,raw=self.call('POST','/api/runs',request,csrf=True)
                    self.assertEqual(status,202)
                    retried=json.loads(raw)
                    self.assertEqual(retried['id'],first['id'])
                    self.assertTrue(retried['reused'])
            self.assertEqual(len(self.app.runs.runs),1)
            launch.assert_called_once()
            self.app.providers.complete.assert_not_called()

    def test_bootstrap_includes_old_active_and_recoverable_requests(self):
        recent = [dict(id=str(i), projectId=self.project['id'], status='completed', createdAt=str(100-i)) for i in range(16)]
        active = dict(id='old-active', projectId=self.project['id'], status='running', clientRequestId='request-1')
        paused = dict(id='old-paused', projectId=self.project['id'], status='paused', canResume=True)
        with mock.patch.object(self.app.runs, 'summary', return_value=recent+[active,paused]):
            status, _, raw = self.call('GET', '/api/bootstrap')
        self.assertEqual(status, 200)
        runs = {r['id']: r for r in json.loads(raw)['runs']}
        self.assertIn('old-active', runs)
        self.assertIn('old-paused', runs)
        self.assertEqual(runs['old-active']['clientRequestId'], 'request-1')
        self.assertLess(len(runs), len(recent)+2)
        self.app.providers.complete.assert_not_called()
