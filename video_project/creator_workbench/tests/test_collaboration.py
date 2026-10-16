import copy
import json
from pathlib import Path
import tempfile
import threading
import time
import unittest

from app.harness import RunManager
from app.providers import ProviderError


def response(text="阶段完成", calls=None):
    return {"text":text,"tool_calls":calls or [],"model":"actual-reported-model","usage":{"output_tokens":12},"stop_reason":"completed"}


def candidates():
    return json.dumps({"candidates":[{"id":name,"title":"方案"+name,"approach":"具体模型和故事路线"+name,"tradeoffs":"优点与成本"+name} for name in "ABC"]},ensure_ascii=False)


class FakeLibrary:
    def __init__(self,path):self.row={"id":"project","name":"测试","path":str(path)}
    def project(self,ident):
        if ident!="project":raise KeyError(ident)
        return dict(self.row)
    def snapshot(self,**kwargs):return {"projects":[self.row],"skills":[],"tools":[],"plugins":[]}
    def media(self,ident):return []


class FakeProviders:
    def __init__(self,replies):self.replies=iter(replies);self.calls=[]
    def public_status(self):return [{"id":p,"configured":True,"model":p+"-configured"} for p in ("openai","claude")]
    def complete(self,provider,messages,**kwargs):
        self.calls.append({"provider":provider,"messages":copy.deepcopy(messages),"tools":kwargs["tools"]})
        item=next(self.replies)
        if isinstance(item,Exception):raise item
        return item(kwargs) if callable(item) else item


class CollaborationTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.project=self.root/"project";self.project.mkdir();self.state=self.root/"state";self.resources=self.root/"resources";self.resources.mkdir()
        self.library=FakeLibrary(self.project)
    def tearDown(self):self.tmp.cleanup()
    def manager(self,replies):
        provider=FakeProviders(replies)
        return RunManager(self.library,provider,self.state,self.resources),provider
    def start(self,manager,**body):return manager.start({"projectId":"project","prompt":"做丝滑科学视频","provider":"dual",**body})["id"]
    def wait(self,manager,ident,status=None):
        deadline=time.monotonic()+5
        while time.monotonic()<deadline:
            row=manager.get(ident)
            if row['status'] not in {'queued','running','cancelling'}:
                time.sleep(.04)
                if status:self.assertEqual(row['status'],status,row.get('response'))
                return manager.get(ident)
            time.sleep(.015)
        self.fail('Mock task timeout')
    def test_dual_actual_providers_rotate_and_file_facts_handoff(self):
        write={'id':'model_write','name':'write_file','arguments':{'path':'model.ts','content':'export const geometry = 1;'}}
        read={'id':'motion_read','name':'read_file','arguments':{'path':'model.ts'}}
        manager,provider=self.manager([response('计划完成'),response('',[write]),response('模型文件model.ts已写入'),response('',[read]),response('动效已检查模型'),response('整合完成')])
        ident=self.start(manager);row=self.wait(manager,ident,'completed')
        self.assertEqual([x['provider'] for x in provider.calls],['openai','openai','openai','claude','claude','openai'])
        self.assertEqual([p['id'] for p in row['phases']],['plan','model','motion','integrate'])
        self.assertTrue(all(p['status']=='completed' for p in row['phases']))
        self.assertEqual((self.project/'model.ts').read_text(),'export const geometry = 1;')
        self.assertIn('model.ts',json.dumps(provider.calls[3]['messages']))
        self.assertEqual(row['usage'][3]['provider'],'claude')
        self.assertEqual(row['usage'][3]['model'],'actual-reported-model')
        self.assertEqual(len([e for e in row['events'] if e['type']=='handoff']),4)
        plan_names={t['function']['name'] for t in provider.calls[0]['tools']}
        self.assertNotIn('write_file',plan_names)
        self.assertIn('write_file',{t['function']['name'] for t in provider.calls[1]['tools']})
    def test_failure_stops_handoff_does_not_fake_completion(self):
        manager,provider=self.manager([response('计划'),ProviderError('API不可用')])
        row=self.wait(manager,self.start(manager),'failed')
        self.assertEqual(len(provider.calls),2)
        self.assertEqual(row['phases'][0]['status'],'completed')
        self.assertEqual(row['phases'][1]['status'],'failed')
        self.assertEqual(row['phases'][2]['status'],'pending')
    def test_candidates_are_readonly_until_explicit_selection_and_restart(self):
        forbidden={'id':'forbidden','name':'write_file','arguments':{'path':'early.txt','content':'no'}}
        manager,provider=self.manager([response('',[forbidden]),response(candidates()),response(candidates())])
        ident=self.start(manager,candidates=True)
        row=self.wait(manager,ident,'awaiting_selection')
        self.assertEqual([p['provider'] for p in row['phases']],['openai','claude'])
        self.assertEqual(len(row['candidates']),3)
        self.assertFalse((self.project/'early.txt').exists())
        self.assertEqual(list(self.project.iterdir()),[])
        for call in provider.calls:
            self.assertNotIn('write_file',{t['function']['name'] for t in call['tools']})
        fresh,provider2=self.manager([response('采用B计划'),response('',[{'id':'writeB','name':'write_file','arguments':{'path':'chosen.txt','content':'B'}}]),response('建模完成'),response('动效完成'),response('QA完成')])
        self.assertEqual(fresh.get(ident)['status'],'awaiting_selection')
        with self.assertRaises(ValueError):fresh.select_candidate(ident,'unknown')
        self.assertEqual(fresh.select_candidate(ident,'B')['status'],'queued')
        final=self.wait(fresh,ident,'completed')
        self.assertEqual(final['selectedCandidateId'],'B')
        self.assertEqual((self.project/'chosen.txt').read_text(),'B')
        self.assertIn('方案B',json.dumps(provider2.calls[0]['messages'],ensure_ascii=False))
        with self.assertRaises(ValueError):fresh.select_candidate(ident,'A')
    def test_invalid_candidate_json_fails_without_writes(self):
        manager,_=self.manager([response('draft'),response('这不是JSON')])
        row=self.wait(manager,self.start(manager,candidates=True),'failed')
        self.assertEqual(row['candidates'],[])
        self.assertEqual(list(self.project.iterdir()),[])
    def test_candidate_waiting_cancel_survives_restart_without_execution(self):
        manager,_=self.manager([response(candidates()),response(candidates())])
        ident=self.start(manager,candidates=True);self.wait(manager,ident,'awaiting_selection')
        fresh,_=self.manager([])
        self.assertEqual(fresh.stop(ident)['status'],'cancelled')
        with self.assertRaises(ValueError):fresh.select_candidate(ident,'A')
    def test_cancel_between_phases_prevents_second_provider(self):
        entered,release=threading.Event(),threading.Event()
        def block(kwargs):
            entered.set();release.wait(2)
            if kwargs['cancel_event'].is_set():raise ProviderError('已取消')
            return response()
        manager,provider=self.manager([response('plan'),block])
        ident=self.start(manager);self.assertTrue(entered.wait(1));manager.stop(ident);release.set()
        row=self.wait(manager,ident,'cancelled')
        self.assertEqual([c['provider'] for c in provider.calls],['openai','openai'])
        self.assertEqual(row['phases'][2]['status'],'pending')
    def test_time_range_writes_new_version_and_preserves_original(self):
        (self.project/'original.mp4').write_bytes(b'original-video')
        (self.project/'scene.ts').write_text('original source')
        write={'id':'new','name':'write_file','arguments':{'path':'scene.ts','content':'new source'}}
        read={'id':'readnew','name':'read_file','arguments':{'path':'scene.ts'}}
        context={'timeRange':{'startSec':10,'endSec':15,'sourcePath':'original.mp4'},'style':{'palette':'暖白'},'taskType':'segment'}
        manager,provider=self.manager([response('',[write,read]),response('新版本完成')])
        ident=self.start(manager,provider='openai',context=context);row=self.wait(manager,ident,'completed')
        self.assertEqual((self.project/'original.mp4').read_bytes(),b'original-video')
        self.assertEqual((self.project/'scene.ts').read_text(),'original source')
        self.assertEqual((Path(row['versionWorkspace'])/'scene.ts').read_text(),'new source')
        self.assertEqual(row['context'],context)
        self.assertIn('new source',provider.calls[1]['messages'][-1]['content'])
        self.assertIn('时间段修改保护',provider.calls[0]['messages'][0]['content'])
    def test_candidate_time_range_does_not_create_workspace_before_selection(self):
        (self.project/'source.mp4').write_bytes(b'original')
        manager,_=self.manager([response(candidates()),response(candidates())])
        ident=self.start(manager,candidates=True,context={'timeRange':{'startSec':1,'endSec':2,'sourcePath':'source.mp4'}})
        row=self.wait(manager,ident,'awaiting_selection')
        self.assertNotIn('versionWorkspace',row)
        self.assertFalse((self.project/'output').exists())
    def test_roles_and_context_validation(self):
        manager,_=self.manager([])
        for context in ({'timeRange':{'startSec':5,'endSec':4}},{'x':'x'*24001},{'timeRange':{'startSec':1,'endSec':2,'sourcePath':'../source.mp4'}}):
            with self.subTest(context=str(context)[:80]),self.assertRaises(ValueError):self.start(manager,context=context)
        with self.assertRaises(ValueError):self.start(manager,roles={'model':'deepseek'})
    def test_override_roles_uses_only_explicit_two_interfaces(self):
        manager,provider=self.manager([response(),response(),response(),response()])
        self.wait(manager,self.start(manager,roles={'plan':'claude','model':'claude','motion':'openai','integrate':'claude'}),'completed')
        self.assertEqual([x['provider'] for x in provider.calls],['claude','claude','openai','claude'])


if __name__=='__main__':unittest.main()
