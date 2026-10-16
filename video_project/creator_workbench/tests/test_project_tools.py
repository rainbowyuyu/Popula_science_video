import copy
import json
from pathlib import Path
import tempfile
import time
import unittest
from unittest import mock

from app.library import Library
from app.server import Workbench


def response(text='完成当前阶段',calls=None):
    return {'text':text,'tool_calls':calls or [],'model':'offline-fixture','usage':{},'stop_reason':'completed'}


class OfflineProvider:
    def __init__(self,replies):self.replies=iter(replies);self.calls=[]
    def public_status(self):return [{'id':name,'configured':True,'model':'fixture'} for name in ('openai','claude')]
    def complete(self,provider,messages,**kwargs):
        self.calls.append({'provider':provider,'messages':copy.deepcopy(messages),'tools':copy.deepcopy(kwargs['tools'])})
        return next(self.replies)


class ProjectToolTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.video=self.root/'videos'
        for name in ('first','other'):
            folder=self.video/name;folder.mkdir(parents=True);(folder/'project.json').write_text('{}')
        self.resources=self.root/'resources';self.resources.mkdir()
        with mock.patch('app.server.Library',side_effect=lambda root:Library(root,[root/'shared/skills'])):
            self.app=Workbench(self.video,self.root/'state',self.resources)
        projects=self.app.library.snapshot(lightweight=True)['projects']
        self.project=next(p for p in projects if Path(p['path']).name=='first')
        self.other=next(p for p in projects if Path(p['path']).name=='other')
        self.path=Path(self.project['path']);self.other_path=Path(self.other['path'])
    def tearDown(self):self.tmp.cleanup()
    def run_agent(self,replies,**values):
        provider=OfflineProvider(replies);self.app.runs.providers=provider
        run=self.app.runs.start({'projectId':self.project['id'],'prompt':'整理当前工程的发布文案','provider':'openai',**values})
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            row=self.app.runs.get(run['id'])
            if row['status'] not in {'queued','running','cancelling'}:
                self.assertEqual(row['status'],'completed',row.get('response'))
                # execute persists and releases the queue in its finally block.
                self.assertTrue(self.app.runs.semaphore.acquire(timeout=2));self.app.runs.semaphore.release()
                return self.app.runs.get(run['id']),provider
            time.sleep(.015)
        self.fail('Offline agent did not complete')
    def action_call(self,**overrides):
        return {'id':'save-copy','name':'project_action','arguments':{'action':'copy.save','arguments':{'platform':'douyin','title':'指针与地址','body':'一段可读的说明。','tags':['C语言'],**overrides}}}
    def test_background_job_query_is_scoped_to_current_project(self):
        self.app.media_studio.get_job=mock.Mock(return_value={'id':'job','projectId':self.project['id'],'status':'completed','output':{'relativePath':'audio/voice.wav'}})
        result=self.app.project_tool(self.project['id'],'project_job',{'id':'job'})
        self.assertEqual(result['output']['relativePath'],'audio/voice.wav')
        with self.assertRaises(ValueError):self.app.project_tool(self.other['id'],'project_job',{'id':'job'})
        self.app.media_studio.get_job.return_value={'id':'job','projectId':self.project['id'],'kind':'qwen-video','taskId':'existing','status':'submitted'}
        self.app.media_studio.poll_video=mock.Mock(return_value={'status':'polling'})
        self.assertEqual(self.app.project_tool(self.project['id'],'project_job',{'id':'job'})['status'],'polling')
        self.app.media_studio.poll_video.assert_called_once_with('job')
    def test_review_exposes_state_and_rejects_module_write(self):
        calls=[{'id':'read-state','name':'project_state','arguments':{'module':'copy','projectId':self.other['id']}},self.action_call()]
        row,provider=self.run_agent([response('',calls),response()],mode='review')
        offered={tool['function']['name'] for tool in provider.calls[0]['tools']}
        self.assertIn('project_state',offered);self.assertNotIn('project_action',offered)
        self.assertFalse((self.path/'source/publish/douyin.json').exists())
        reads=[json.loads(event['message']) for event in row['events'] if event['type']=='tool_result' and event.get('tool')=='project_state']
        self.assertEqual(reads[0]['project']['id'],self.project['id'])
        self.assertTrue(any(event['type']=='tool_error' and event.get('tool')=='project_action' for event in row['events']))
    def test_nested_project_and_action_cannot_override_selected_project(self):
        call=self.action_call(projectId=self.other['id'],action='project.rename')
        row,_=self.run_agent([response('',[call]),response()])
        actual=self.path/'source/publish/douyin.json'
        self.assertTrue(actual.is_file())
        self.assertEqual(json.loads(actual.read_text(encoding='utf8'))['title'],'指针与地址')
        self.assertFalse((self.other_path/'source/publish/douyin.json').exists())
        self.assertFalse((self.other_path/'.studio/project.json').exists())
        self.assertFalse(any(event['type']=='tool_error' for event in row['events']))
    def test_segment_module_write_rejected_but_state_remains_readable(self):
        original=self.path/'original.mp4';original.write_bytes(b'original-video')
        calls=[{'id':'read','name':'project_state','arguments':{'module':'copy'}},self.action_call()]
        row,_=self.run_agent([response('',calls),response()],context={'timeRange':{'startSec':0,'endSec':1,'sourcePath':'original.mp4'}})
        self.assertTrue(Path(row['versionWorkspace']).is_dir())
        self.assertEqual(original.read_bytes(),b'original-video')
        self.assertFalse((self.path/'source/publish/douyin.json').exists())
        errors=[e['message'] for e in row['events'] if e['type']=='tool_error' and e.get('tool')=='project_action']
        self.assertTrue(any('独立版本' in error for error in errors))
        self.assertTrue(any(e['type']=='tool_result' and e.get('tool')=='project_state' for e in row['events']))
    def test_module_callback_rejects_workflow_recursion(self):
        with mock.patch.object(self.app.workflows,'start') as start:
            with self.assertRaises(ValueError):
                self.app.project_tool(self.project['id'],'project_action',{'action':'workflow.start','arguments':{'kind':'batch-copy','projectIds':[self.other['id']]}})
            start.assert_not_called()


if __name__=='__main__':unittest.main()
