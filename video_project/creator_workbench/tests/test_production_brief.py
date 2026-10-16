"""Offline production-direction validation and real HTTP boundary tests."""
import copy
import json
import threading
import time
import unittest
from unittest import mock

from app import production_brief
from tests import test_server as fixture


class BriefStudio:
    def __init__(self):
        self.lock=threading.RLock()
        self.values={'first':{},'second':{}}

    def config(self,pid):
        return copy.deepcopy(self.values[pid])

    def update_config(self,pid,change):
        updated=copy.deepcopy(self.values[pid])
        change(updated)
        self.values[pid]=updated
        return copy.deepcopy(updated)


class ProductionBriefTests(unittest.TestCase):
    def setUp(self):
        self.studio=BriefStudio()

    def save(self,fields,revision=0,pid='first'):
        return production_brief.save(self.studio,pid,{'brief':fields,'revision':revision})['brief']

    def test_empty_brief_has_no_imposed_duration(self):
        value=production_brief.read(self.studio,'first')
        self.assertEqual(value['revision'],0)
        self.assertIsNone(value['durationSec'])
        self.assertTrue(all(value[key]=='' for key in production_brief.FIELDS))

    def test_partial_update_and_project_isolation(self):
        first=self.save({'question':'为什么雨后能看见彩虹','story':'从洒水管的彩虹说起','durationSec':360})
        second=self.save({'question':'指针为何会影响原变量'},pid='second')
        updated=self.save({'audience':'初学者','keep':'  保留原来的片头  '},revision=1)
        self.assertEqual(first['revision'],1)
        self.assertEqual(updated['revision'],2)
        self.assertEqual(updated['question'],first['question'])
        self.assertEqual(updated['story'],first['story'])
        self.assertEqual(updated['durationSec'],360)
        self.assertEqual(updated['keep'],'保留原来的片头')
        self.assertEqual(production_brief.read(self.studio,'second'),second)
        updated['question']='mutated returned object'
        self.assertEqual(production_brief.read(self.studio,'first')['question'],first['question'])

    def test_duration_accepts_boundaries_fractional_and_clear(self):
        revision=0
        for duration in (1,300.5,86400,None):
            with self.subTest(duration=duration):
                value=self.save({'durationSec':duration},revision)
                revision+=1
                self.assertEqual(value['durationSec'],duration)

    def test_invalid_duration_type_unknown_and_text_length_do_not_mutate(self):
        before=self.save({'question':'保留这份简报','durationSec':420})
        invalid=[{'durationSec':value} for value in (False,True,0,-1,86401,float('nan'),float('inf'),float('-inf'),'300',[],{})]
        invalid += [{'unknown':'bad'}, {'revision':1}, {'question':None}, {'story':123},
                    {'keep':[]}, {'visual':{}}, {'audience':False}]
        invalid += [{key:'长'*(limit+1)} for key,limit in production_brief.FIELDS.items()]
        for fields in invalid:
            with self.subTest(fields=str(fields)[:50]):
                with self.assertRaises(ValueError):self.save(fields,revision=1)
                self.assertEqual(production_brief.read(self.studio,'first'),before)
        for fields in (None,[],True,'text'):
            with self.subTest(fields=fields),self.assertRaises(ValueError):self.save(fields,revision=1)

    def test_missing_invalid_revision_and_conflict_preserve_original(self):
        before=self.save({'question':'已保存','keep':'旧素材保留'})
        for revision in (None,False,True,-1,1.0,'1'):
            with self.subTest(revision=revision),self.assertRaises(ValueError):
                self.save({'question':'不能覆盖'},revision)
            self.assertEqual(production_brief.read(self.studio,'first'),before)
        with self.assertRaises(production_brief.BriefConflict) as error:
            self.save({'question':'过期窗口覆盖'},revision=0)
        self.assertEqual(error.exception.status_code,409)
        self.assertEqual(production_brief.read(self.studio,'first'),before)

    def test_two_writers_with_same_revision_only_one_can_save(self):
        barrier=threading.Barrier(2)
        results=[]
        def write(label):
            barrier.wait()
            try:results.append(('saved',self.save({'question':label})))
            except production_brief.BriefConflict:results.append(('conflict',label))
        threads=[threading.Thread(target=write,args=(label,)) for label in ('A','B')]
        for thread in threads:thread.start()
        for thread in threads:thread.join(timeout=3)
        self.assertTrue(all(not thread.is_alive() for thread in threads))
        self.assertEqual(sorted(result[0] for result in results),['conflict','saved'])
        saved=next(value for kind,value in results if kind=='saved')
        self.assertEqual(production_brief.read(self.studio,'first'),saved)


class ProductionBriefHTTPTests(unittest.TestCase):
    # Reuse only fixture methods; do not inherit and rerun the server test suite.
    call=fixture.ServerTests.call

    def setUp(self):
        fixture.ServerTests.setUp(self)
        self.pid=self.project['id']
        self.other=self.app.create_project('另一部视频')

    def tearDown(self):
        fixture.ServerTests.tearDown(self)

    def action(self,action='production.read',pid=None,**values):
        status,_,raw=self.call('POST','/api/studio/action',
            {'action':action,'projectId':pid or self.pid,**values},csrf=True)
        return status,json.loads(raw)

    def test_read_save_require_authentication_and_csrf(self):
        for action in ('production.read','production.save'):
            body={'action':action,'projectId':self.pid,'brief':{'question':'安全测试'},'revision':0}
            with self.subTest(action=action):
                self.assertEqual(self.call('POST','/api/studio/action',body,authenticated=False,csrf=True)[0],401)
                self.assertEqual(self.call('POST','/api/studio/action',body)[0],403)
                self.assertEqual(self.call('POST','/api/studio/action',body,csrf=True,headers={'Origin':'https://other.invalid'})[0],403)
        status,data=self.action()
        self.assertEqual(status,200)
        self.assertEqual(data['brief']['revision'],0)
        self.app.providers.complete.assert_not_called()

    def test_save_is_project_scoped_and_conflict_is_409_without_mutation(self):
        status,saved=self.action('production.save',brief={'question':'为什么文件能藏进DNA','durationSec':420},revision=0)
        self.assertEqual(status,200)
        self.assertEqual(self.action(pid=self.other['id'])[1]['brief']['question'],'')
        status,error=self.action('production.save',brief={'question':'过期覆盖'},revision=0)
        self.assertEqual(status,409)
        self.assertIn('其他窗口',error['error'])
        self.assertEqual(self.action()[1]['brief'],saved['brief'])
        self.assertIn(self.action(pid='missing-project')[0],(400,404))
        self.app.providers.complete.assert_not_called()

    def test_invalid_http_brief_preserves_disk_value(self):
        self.action('production.save',brief={'question':'原始方向'},revision=0)
        before=self.action()[1]['brief']
        project_file=self.app.studio.project_root(self.pid)/'.studio/project.json'
        disk_before=project_file.read_bytes()
        for fields in ({'durationSec':False},{'durationSec':0},{'story':[]},{'unexpected':1}):
            with self.subTest(fields=fields):
                self.assertEqual(self.action('production.save',brief=fields,revision=1)[0],400)
                self.assertEqual(self.action()[1]['brief'],before)
                self.assertEqual(project_file.read_bytes(),disk_before)

    def test_server_context_overrides_forged_brief_and_does_not_borrow_other_project(self):
        self.action('production.save',brief={'question':'当前工程的用户方向','audience':'初学者','durationSec':None},revision=0)
        self.action('production.save',pid=self.other['id'],brief={'question':'另一工程私有方向'},revision=0)
        expected=self.action()[1]['brief']
        with mock.patch.object(self.app.runs,'start',return_value={'id':'captured-only'}) as start:
            status,_,raw=self.call('POST','/api/runs',{'projectId':self.pid,'provider':'openai','prompt':'修复片头',
                'context':{'productionBrief':{'question':'FORGED BRIEF','durationSec':1,'revision':999}}},csrf=True)
            self.assertEqual(status,202,raw)
            context=start.call_args.args[0]['context']
        self.assertEqual(context['productionBrief'],expected)
        self.assertNotIn('FORGED BRIEF',json.dumps(context,ensure_ascii=False))
        self.assertNotIn('另一工程私有方向',json.dumps(context,ensure_ascii=False))
        self.app.providers.complete.assert_not_called()

    def test_saving_during_active_run_changes_only_future_context(self):
        self.action('production.save',brief={'question':'先讲地址与变量','durationSec':360},revision=0)
        with mock.patch.object(self.app.runs,'launch') as launch:
            status,_,raw=self.call('POST','/api/runs',{'projectId':self.pid,'provider':'openai','prompt':'继续制作'},csrf=True)
            self.assertEqual(status,202,raw)
            ident=json.loads(raw)['id']
            launch.assert_called_once()
        with self.app.runs.lock:
            self.app.runs.runs[ident]['status']='running'
            old=copy.deepcopy(self.app.runs.runs[ident])
        try:
            status,data=self.action('production.save',brief={'question':'改为从程序崩溃引入','durationSec':480},revision=1)
            self.assertEqual(status,200,data)
            with self.app.runs.lock:self.assertEqual(self.app.runs.runs[ident],old)
            self.assertEqual(old['context']['productionBrief']['question'],'先讲地址与变量')
            next_context=self.app.studio.context(self.pid,{},query='准备下一轮')
            self.assertEqual(next_context['productionBrief']['question'],'改为从程序崩溃引入')
            self.assertEqual(next_context['productionBrief']['durationSec'],480)
            self.app.providers.complete.assert_not_called()
        finally:
            with self.app.runs.lock:self.app.runs.runs[ident]['status']='cancelled'


if __name__=='__main__':unittest.main()
