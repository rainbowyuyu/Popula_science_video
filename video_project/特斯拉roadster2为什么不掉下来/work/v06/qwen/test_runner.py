"""No-network regression checks for one-time billing semantics."""
import contextlib
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
import requests
import bridge_runner as runner

class Response:
    status_code=200
    def json(self): return {'request_id':'mock-request-id','output':{'task_id':'mock-task-id-00000000001'}}

class BillingTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(dir=runner.HERE)
        self.folder=Path(self.temp.name)
        self.original_project=runner.PROJECT;runner.PROJECT=self.folder
        self.original_key=runner.credential;runner.credential=lambda field:'test-placeholder-never-transmitted'
        (self.folder/'input.png').write_bytes(b'local fake png for mocked payload only')
        ref={'path':'input.png','mime':'image/png','sha256':runner.sha(self.folder/'input.png')}
        self.row={'id':'test','status':'planned','submissionCount':0,'taskId':None,'first':ref,'last':ref,
                  'credentialField':'QWEN_API_KEY_BACKUP','model':runner.MODEL,'parameters':runner.PARAMETERS,
                  'prompt':'mock','negativePrompt':'mock'}
        self.calls=0
    def tearDown(self):
        runner.PROJECT=self.original_project;runner.credential=self.original_key;self.temp.cleanup()
    def post(self,*args,**kwargs):
        self.calls+=1
        self.assertFalse(kwargs['allow_redirects'])
        self.assertEqual(kwargs['json']['input']['media'][0]['type'],'first_frame')
        self.assertEqual(kwargs['json']['input']['media'][1]['type'],'last_frame')
        return Response()
    def invoke(self,post):
        with contextlib.redirect_stdout(io.StringIO()):runner.submit(self.folder,self.row,post=post)
    def test_success_then_resubmit_is_one_post(self):
        self.invoke(self.post);self.invoke(self.post)
        self.assertEqual(self.calls,1);self.assertEqual(self.row['status'],'running')
    def test_timeout_is_unknown_and_never_retried(self):
        def timeout(*a,**k):self.calls+=1;raise requests.Timeout('fake signed or credential detail must not be logged')
        self.invoke(timeout);self.invoke(self.post)
        self.assertEqual(self.calls,1);self.assertEqual(self.row['status'],'submission_unknown')
        self.assertNotIn('fake signed',(self.folder/'attempt.json').read_text())
    def test_crashed_submitting_is_never_reposted(self):
        self.row.update(status='submitting',submissionCount=1)
        self.invoke(self.post)
        self.assertEqual(self.calls,0);self.assertEqual(self.row['status'],'submission_unknown')
    def test_empty_success_is_unknown_and_never_retried(self):
        class Empty(Response):
            def json(self):return {}
        def empty(*a,**k):self.calls+=1;return Empty()
        self.invoke(empty);self.invoke(self.post)
        self.assertEqual(self.calls,1);self.assertEqual(self.row['status'],'submission_unknown')
    def test_changed_image_blocks_before_post(self):
        (self.folder/'input.png').write_bytes(b'changed')
        with self.assertRaises(RuntimeError):self.invoke(self.post)
        self.assertEqual(self.calls,0)
    def test_operation_lock_is_exclusive(self):
        with runner.attempt_lock(self.folder):
            with self.assertRaises(RuntimeError):
                with runner.attempt_lock(self.folder):pass

if __name__=='__main__':unittest.main()
