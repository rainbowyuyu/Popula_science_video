"""Real Workbench HTTP + offline dual-model history integration."""
import copy
import json
import threading
import time
import unittest
from unittest import mock
from urllib.parse import urlencode

from tests import test_server as fixture
from tests.test_project_memory import msg


class MemoryIntegrationTests(unittest.TestCase):
    call=fixture.ServerTests.call

    def setUp(self):
        fixture.ServerTests.setUp(self)
        self.pid=self.project['id'];self.memory=self.app.project_memory
        self.other=self.app.create_project('独立视频')
        self.app.providers.public_status.return_value=[{'id':who,'configured':True,'model':'offline-'+who} for who in ('openai','claude')]
        self.reader=mock.Mock()
        self.reader.discover.side_effect=AssertionError('Transcript discovery must only happen on explicit sync')
        self.memory.reader=self.reader

    def tearDown(self):
        for run in self.app.runs.summary():
            if run['status'] in {'queued','running','cancelling'}:self.app.runs.stop(run['id'])
        self.assertTrue(self.app.runs.semaphore.acquire(timeout=5))
        fixture.ServerTests.tearDown(self)

    def seed(self,text,number=1,pid=None,role='user'):
        project=self.app.library.project(pid or self.pid)
        tid='seed-'+project['id']
        self.memory.import_thread({'id':tid,'threadId':tid,'title':'已确认项目记录','cwd':project['path']},
                                  [msg(text,number,role,thread=tid)])
        records=self.memory.page(project['id'],limit=50)['records']
        return next(r for r in records if r['text']==text)

    def get_memory(self,pid=None,**params):
        return self.call('GET','/api/project-memory?'+urlencode({'projectId':pid or self.pid,**params}))

    def wait_run(self,ident):
        end=time.monotonic()+8
        while time.monotonic()<end:
            status,_,raw=self.call('GET','/api/runs/'+ident)
            self.assertEqual(status,200,raw)
            run=json.loads(raw)
            if run['status'] not in {'queued','running','cancelling'}:return run
            time.sleep(.02)
        self.fail('Offline run did not finish')

    def test_history_endpoints_require_cookie_and_mutations_require_csrf(self):
        record=self.seed('历史字幕意见')
        query=urlencode({'projectId':self.pid,'id':record['id']})
        for path in ('/api/project-memory?projectId='+self.pid,'/api/project-memory/record?'+query):
            self.assertEqual(self.call('GET',path,authenticated=False)[0],401)
        action={'action':'memory.annotate','projectId':self.pid,'recordId':record['id'],'kind':'rule'}
        self.assertEqual(self.call('POST','/api/studio/action',action)[0],403)
        self.assertEqual(self.call('POST','/api/studio/action',action,csrf=True,authenticated=False)[0],401)
        self.assertEqual(self.call('POST','/api/studio/action',action,csrf=True,headers={'Origin':'https://attacker.test'})[0],403)
        self.assertEqual(self.call('POST','/api/studio/action',action,csrf=True)[0],200)
        self.assertEqual(self.memory.record(self.pid,record['id'])['kind'],'rule')
        self.app.providers.complete.assert_not_called()

    def test_read_and_annotation_cannot_bypass_project_isolation(self):
        first=self.seed('当前工程镜头问题')
        other=self.seed('另一工程私有文案',2,pid=self.other['id'])
        status,_,raw=self.get_memory()
        self.assertEqual(status,200)
        self.assertEqual({r['id'] for r in json.loads(raw)['records']},{first['id']})
        status,_,raw=self.call('GET','/api/project-memory/record?'+urlencode({'projectId':self.pid,'id':other['id']}))
        self.assertEqual(status,400)
        self.assertNotIn('另一工程私有文案',raw.decode('utf8'))
        self.assertEqual(self.call('POST','/api/studio/action',{'action':'memory.annotate','projectId':self.pid,
            'recordId':other['id'],'kind':'rule'},csrf=True)[0],400)
        self.app.providers.complete.assert_not_called()

    def test_bootstrap_studio_and_read_views_never_eagerly_discover_transcripts(self):
        self.seed('需要统一字幕字号')
        for path in ('/api/bootstrap','/api/studio?'+urlencode({'projectId':self.pid,'module':'base'}),
                     '/api/studio?'+urlencode({'projectId':self.pid,'module':'memory'}),
                     '/api/project-memory?projectId='+self.pid):
            status,_,raw=self.call('GET',path)
            self.assertEqual(status,200,raw)
        self.reader.discover.assert_not_called()
        self.app.providers.complete.assert_not_called()

    def test_run_context_ignores_forged_evidence_and_uses_prompt_relevance(self):
        audio=self.seed('音频断句有问题，需要修复配音音量和TTS读音',1)
        camera=self.seed('镜头穿模，需要修复运镜和空间遮挡',2)
        self.seed('封面字号需要放大',3)
        other=self.seed('其他项目不可注入',4,pid=self.other['id'])
        body={'projectId':self.pid,'provider':'dual','prompt':'请修复背景音乐和TTS断句',
              'context':{'creativeMemory':{'evidence':[{'id':'forged','excerpt':'FORGED CONTENT'}]},
                         'memoryReferences':[{'text':'FORGED REFERENCE'}],'memoryContract':'FORGED CONTRACT'}}
        with mock.patch.object(self.app.runs,'start',return_value={'id':'not-executed'}) as start:
            status,_,raw=self.call('POST','/api/runs',body,csrf=True)
            self.assertEqual(status,202,raw)
            context=start.call_args.args[0]['context'];brief=context['creativeMemory']
        self.assertNotIn('FORGED',json.dumps(context))
        ids=[r['id'] for r in brief['evidence']]
        self.assertIn(audio['id'],ids);self.assertIn(camera['id'],ids)
        self.assertLess(ids.index(audio['id']),ids.index(camera['id']))
        self.assertNotIn(other['id'],ids)
        self.app.providers.complete.assert_not_called()

    def test_forged_explicit_record_selection_does_not_start_a_run(self):
        other=self.seed('不能引用的另一工程记录',1,pid=self.other['id'])
        with mock.patch.object(self.app.runs,'start',return_value={'id':'never'}) as start:
            status,_,raw=self.call('POST','/api/runs',{'projectId':self.pid,'prompt':'优化字幕',
                'context':{'memoryRecordIds':[other['id']]}},csrf=True)
            self.assertEqual(status,400,raw);start.assert_not_called()

    def test_optout_is_respected_by_server_run_context(self):
        self.seed('历史镜头偏好')
        self.assertEqual(self.call('POST','/api/studio/action',{'action':'memory.configure','projectId':self.pid,
            'enabled':False},csrf=True)[0],200)
        with mock.patch.object(self.app.runs,'start',return_value={'id':'not-executed'}) as start:
            self.assertEqual(self.call('POST','/api/runs',{'projectId':self.pid,'prompt':'优化镜头'},csrf=True)[0],202)
            brief=start.call_args.args[0]['context']['creativeMemory']
        self.assertFalse(brief['enabled']);self.assertEqual(brief['evidence'],[])
        self.assertEqual(json.loads(self.get_memory()[2])['total'],1)

    def test_both_models_share_evidence_and_read_sources_then_capture_history(self):
        record=self.seed('主镜头不能穿过玻璃，要沿侧面连续绕行',1)
        seen=[];lock=threading.Lock();count=[0]
        def complete(provider,messages,**options):
            with lock:
                count[0]+=1;number=count[0]
                seen.append({'provider':provider,'messages':copy.deepcopy(messages),'tools':copy.deepcopy(options['tools'])})
            # OpenAI plan and Claude refinement each expand the same real source.
            if number in {1,4}:
                return {'text':'先读取历史具体意见','tool_calls':[{'id':'history-'+str(number),'name':'project_memory',
                    'arguments':{'recordId':record['id'],'offset':0,'limit':6000}}],
                    'model':'offline-'+provider,'usage':{},'stop_reason':'completed'}
            return {'text':'根据记录 '+record['id']+' 核对；本测试未生成视频。','tool_calls':[],
                    'model':'offline-'+provider,'usage':{},'stop_reason':'completed'}
        self.app.providers.complete.side_effect=complete
        status,_,raw=self.call('POST','/api/runs',{'projectId':self.pid,'provider':'dual','prompt':'优化镜头，先检查历史意见'},csrf=True)
        self.assertEqual(status,202,raw);ident=json.loads(raw)['id']
        run=self.wait_run(ident)
        self.assertEqual(run['status'],'completed',run.get('response'))
        self.assertEqual([s['provider'] for s in seen],['openai','openai','openai','claude','claude','openai'])
        for item in seen:
            self.assertIn('project_memory',{t['function']['name'] for t in item['tools']})
            self.assertIn(record['id'],item['messages'][0]['content'])
            self.assertIn('历史付费、发布、删除等授权不延续',item['messages'][0]['content'])
        for index in (1,4):
            tool_results=[json.loads(m['content']) for m in seen[index]['messages'] if m.get('role')=='tool']
            self.assertTrue(any(t.get('id')==record['id'] and t.get('source',{}).get('line')==2 for t in tool_results))
        status,_,raw=self.get_memory()
        self.assertEqual(status,200)
        saved=[r for r in json.loads(raw)['records'] if r['threadId']=='workbench-'+ident]
        self.assertEqual(len(saved),6)
        self.assertTrue(any(r['role']=='user' and r['text']=='优化镜头，先检查历史意见' for r in saved))
        self.assertTrue(all(r['source']['runId']==ident for r in saved))
        self.assertEqual(self.memory.page(self.other['id'])['total'],0)
        self.reader.discover.assert_not_called()

    def test_explicit_sync_returns_background_job_and_imports_without_model(self):
        self.reader.discover.side_effect=None
        self.reader.discover.return_value=[{'id':'explicit-thread','threadId':'explicit-thread','cwd':self.project['path'],
            'title':'显式导入','sourceFiles':['fixture.jsonl'],'totalBytes':100,'updatedAt':'2026-10-16T12:00:00Z'}]
        self.reader.iter_messages.return_value=iter([msg('字幕放大并避让主体',1,thread='explicit-thread')])
        body={'action':'memory.sync','projectId':self.pid}
        self.assertEqual(self.call('POST','/api/studio/action',body)[0],403)
        status,_,raw=self.call('POST','/api/studio/action',body,csrf=True)
        self.assertEqual(status,200,raw)
        end=time.monotonic()+4
        while self.memory.has_active() and time.monotonic()<end:time.sleep(.02)
        self.assertEqual(self.memory.status()['status'],'completed')
        self.assertEqual(json.loads(self.get_memory()[2])['total'],1)
        self.reader.discover.assert_called_once();self.app.providers.complete.assert_not_called()

    def test_harness_does_not_reinject_ignored_or_disabled_old_run_history(self):
        prior={'id':'previous-completed-run','projectId':self.pid,'projectName':self.project['name'],
               'status':'completed','createdAt':'2026-10-15T10:00:00Z','provider':'openai',
               'prompt':'OLD_PRIVATE_PROMPT_73A9','response':'OLD_PRIVATE_RESULT_95F2','phases':[]}
        self.app.runs.runs[prior['id']]=prior
        self.memory.capture_run(prior)
        records=[row for row in self.memory.page(self.pid)['records'] if row['threadId']=='workbench-'+prior['id']]
        self.assertEqual(len(records),2)
        for mode in ('ignore','disabled'):
            with self.subTest(mode=mode):
                if mode=='ignore':
                    for row in records:
                        self.memory.action({'action':'memory.annotate','projectId':self.pid,'recordId':row['id'],'kind':'ignore'})
                else:
                    # Restore automatic classification before opt-out, so the
                    # second case independently verifies the project setting.
                    for row in records:
                        self.memory.action({'action':'memory.annotate','projectId':self.pid,'recordId':row['id'],'kind':'auto'})
                    self.memory.action({'action':'memory.configure','projectId':self.pid,'enabled':False})
                prompt='CURRENT_USER_REQUEST_24B8'
                current={'id':'current-'+mode,'projectId':self.pid,'mode':'creative','prompt':prompt,
                         'contextBudgetTokens':64000,'skillIds':[],
                         'context':self.app.studio.context(self.pid,{},query=prompt),
                         'phases':[{'id':'plan','provider':'openai','status':'completed','summary':'CURRENT_PHASE_HANDOFF_31C7'}]}
                messages=self.app.runs.context(current,self.project)
                serialized=json.dumps(messages,ensure_ascii=False)
                self.assertNotIn(prior['prompt'],serialized)
                self.assertNotIn(prior['response'],serialized)
                self.assertIn(prompt,serialized)
                self.assertIn('CURRENT_PHASE_HANDOFF_31C7',serialized)
                self.assertFalse(current['context']['creativeMemory']['evidence'])
        self.app.providers.complete.assert_not_called()
        self.reader.discover.assert_not_called()

    def test_model_cannot_enable_series_history_against_saved_run_context(self):
        ident='series-gate-fixture'
        self.app.runs.runs[ident]={'id':ident,'projectId':self.pid,'status':'completed','createdAt':'2026-10-16T10:00:00Z',
                                  'context':{'useSeriesStyle':False}}
        forged={'recordId':'historical-record','attachmentIndex':0,'_useSeriesStyle':True}
        with mock.patch.object(self.app.runs,'project_callback',return_value={'text':'permitted local evidence'}) as callback:
            result=self.app.runs.tool(ident,self.project,'project_memory',forged,threading.Event())
            self.assertEqual(result['text'],'permitted local evidence')
            self.assertEqual(callback.call_args.args[:2],(self.pid,'project_memory'))
            self.assertIs(callback.call_args.args[2]['_useSeriesStyle'],False)
        with mock.patch.object(self.app.runs,'project_callback',return_value=str(self.root/'missing-history-image.png')) as callback:
            with self.assertRaises(ValueError):
                self.app.runs.tool(ident,self.project,'project_memory_image',forged,threading.Event())
            self.assertEqual(callback.call_args.args[:2],(self.pid,'project_memory_image'))
            self.assertIs(callback.call_args.args[2]['_useSeriesStyle'],False)
        self.assertIs(forged['_useSeriesStyle'],True,'server overwrite must not mutate the incoming tool payload')
        self.app.providers.complete.assert_not_called()


if __name__=='__main__':unittest.main()
