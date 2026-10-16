"""Project-scoped history import, curation and retrieval without model calls."""
import copy
import json
from pathlib import Path
import tempfile
import threading
from types import SimpleNamespace
import unittest

from app.codex_history import CodexHistory
from app.project_memory import ProjectMemory


class Library:
    def __init__(self,root):self.root=root;self.rows={}
    def add(self,ident,folder):
        path=self.root/folder;path.mkdir(parents=True,exist_ok=True)
        self.rows[ident]={'id':ident,'name':folder,'path':str(path)}
        return self.rows[ident]
    def project(self,ident):return copy.deepcopy(self.rows[ident])
    def snapshot(self,**kwargs):return {'projects':copy.deepcopy(list(self.rows.values()))}


class Reader:
    def __init__(self,threads=None,messages=None):self.threads=threads or [];self.messages=messages or {};self.calls=[]
    def discover(self):return copy.deepcopy(self.threads)
    def iter_messages(self,ident):
        self.calls.append(ident)
        yield from copy.deepcopy(self.messages.get(ident,[]))


def msg(text,number=1,role='user',thread='thread-one',**overrides):
    return {'id':f'codex-{thread}-{number}','threadId':thread,'role':role,'channel':'user' if role=='user' else 'final',
            'time':f'2026-10-16T10:{number//60:02}:{number%60:02}+00:00','text':text,'attachments':[],
            'sourceFile':f'C:/fake/.codex/sessions/{thread}.jsonl','line':number+1,**overrides}


class ProjectMemoryTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name)
        self.video_root=self.root/'video_project';self.video_root.mkdir()
        self.library=Library(self.video_root)
        self.library.add('dna','dna_storage_algorithms');self.library.add('crypto','cryptography_key_exchange');self.library.add('pointers','c_pointers')
        self.configs={'dna':{'seriesId':'science'},'crypto':{'seriesId':'science'},'pointers':{'seriesId':'coding'}}
        self.app=SimpleNamespace(state_root=self.root/'state',video_root=self.video_root,library=self.library,
                                 studio=SimpleNamespace(config=lambda pid:copy.deepcopy(self.configs.get(pid,{}))),
                                 runs=SimpleNamespace(lock=threading.RLock(),runs={}))
        self.reader=Reader();self.memory=ProjectMemory(self.app,self.reader)

    def tearDown(self):self.tmp.cleanup()
    def thread(self,ident='thread-one',**extra):
        return {'id':ident,'threadId':ident,'title':'视频创作','cwd':str(self.root),'sourceFiles':[f'C:/fake/{ident}.jsonl'],
                'fileCount':1,'totalBytes':2000,'updatedAt':'2026-10-16T12:00:00+00:00',**extra}
    def import_messages(self,messages,**thread):return self.memory.import_thread(self.thread(**thread),messages)
    def all_records(self,pid):return self.memory.page(pid,limit=50)['records']
    def find(self,pid,text):return next(r for r in self.all_records(pid) if r['text']==text)
    def annotate(self,pid,rid,**values):
        return self.memory.action({'action':'memory.annotate','projectId':pid,'recordId':rid,**values})

    def test_real_codex_adapter_schema_preserves_time_and_line_provenance(self):
        codex=self.root/'codex';(codex/'sessions').mkdir(parents=True)
        path=codex/'sessions/rollout.jsonl'
        rows=[{'type':'session_meta','timestamp':'2026-10-16T10:00:00Z','payload':{'id':'real-thread','cwd':str(self.root)}},
              {'type':'response_item','timestamp':'2026-10-16T10:00:01Z','payload':{'type':'message','id':'u1','role':'user','content':[{'type':'text','text':'请制作DNA存储视频'}]}},
              {'type':'response_item','timestamp':'2026-10-16T10:00:02Z','payload':{'type':'message','id':'a1','role':'assistant','phase':'final_answer','content':[{'type':'text','text':'已生成预览，尚需检查画面'}]}}]
        path.write_text('\n'.join(json.dumps(r,ensure_ascii=False) for r in rows)+'\n',encoding='utf8')
        self.memory.reader=CodexHistory(codex)
        self.assertEqual(self.memory.sync_now()['status'],'completed')
        record=self.find('dna','请制作DNA存储视频')
        self.assertEqual(record['timestamp'],'2026-10-16T10:00:01+00:00')
        self.assertEqual(record['source'].get('sourceFile') or record['source'].get('file'),str(path))
        self.assertEqual(record['source']['line'],2)
        self.assertEqual(record['source']['threadId'],'real-thread')

    def test_mixed_thread_tracks_user_topic_changes_and_excludes_editor_tasks(self):
        self.import_messages([msg('帮我做一期DNA存储',1),msg('镜头向液滴推进',2,'assistant'),msg('优化字幕和光照',3),
            msg('改做密码学这一期',4),msg('钥匙纸张更自然',5),msg('工作台增加上下文旋钮和exe启动器',6),
            msg('右边面板宽一点',7),msg('帮我制作一期C语言指针',8),msg('指针的内存地址要连贯',9)])
        self.assertEqual({r['text'] for r in self.all_records('dna')},{'帮我做一期DNA存储','镜头向液滴推进','优化字幕和光照'})
        self.assertEqual({r['text'] for r in self.all_records('crypto')},{'改做密码学这一期','钥匙纸张更自然'})
        self.assertEqual({r['text'] for r in self.all_records('pointers')},{'帮我制作一期C语言指针','指针的内存地址要连贯'})

    def test_unknown_new_episode_is_not_inherited_by_previous_project(self):
        self.import_messages([msg('做DNA存储',1),msg('帮我做一期量子纠错视频',2),msg('介绍量子位纠错',3)])
        self.assertEqual({r['text'] for r in self.all_records('dna')},{'做DNA存储'})
        self.assertEqual(self.memory.page('dna',kind='unassigned')['total'],2)

    def test_ambiguous_explicit_topic_switch_does_not_pollute_previous_project(self):
        self.import_messages([msg('先做DNA存储',1),msg('换个主题，做密码学，DNA存储先放下',2),msg('讲两个人怎么交换钥匙',3)])
        self.assertEqual({r['text'] for r in self.all_records('dna')},{'先做DNA存储'})

    def test_idempotent_import_preserves_same_sentence_at_distinct_times(self):
        messages=[msg('做DNA存储',1),msg('继续优化运镜',2),msg('继续优化运镜',3)]
        self.import_messages(messages);self.import_messages(messages)
        self.assertEqual(self.memory.overview('dna')['records'],3)
        repeats=[r for r in self.all_records('dna') if r['text']=='继续优化运镜']
        self.assertEqual(len({r['id'] for r in repeats}),2)

    def test_import_defensively_excludes_assistant_analysis(self):
        self.import_messages([msg('做DNA存储',1),msg('PRIVATE CHAIN OF THOUGHT',2,'assistant',channel='analysis'),
                              msg('可见结论',3,'assistant',channel='final')])
        self.assertNotIn('PRIVATE CHAIN OF THOUGHT',json.dumps(self.all_records('dna')))

    def test_all_import_surfaces_and_native_runs_redact_credentials(self):
        secret='sk-secret-12345 password="privatePass" token=privateToken https://host.test/a.png?api_key=LOCAL_CREDENTIAL_REQUIRED'
        self.import_messages([msg('DNA存储 '+secret,1,attachments=[{'kind':'image','url':'https://host.test/a.png?token=LOCAL_CREDENTIAL_REQUIRED'}],
                                  source={'location':'https://host.test/log?access_token=LOCAL_CREDENTIAL_REQUIRED'})],title='标题 sk-titleSecret')
        self.memory.capture_run({'id':'run-one','projectId':'dna','status':'completed','createdAt':'2026-10-16T12:00:00Z',
                                 'prompt':'检查 '+secret,'response':'完成 '+secret,'phases':[]})
        exported=json.dumps(self.all_records('dna'),ensure_ascii=False)
        for private in ('sk-secret-12345','privatePass','privateToken','privateQuery','attachmentSecret','sourceSecret','sk-titleSecret'):
            self.assertNotIn(private,exported)

    def test_notes_reject_credentials_before_curating(self):
        self.import_messages([msg('做DNA存储',1)]);record=self.find('dna','做DNA存储')
        with self.assertRaises(ValueError):self.annotate('dna',record['id'],kind='rule',note='password=privateNote')

    def test_optout_stops_automatic_reuse_but_keeps_history_searchable(self):
        self.import_messages([msg('做DNA存储，字幕大一点',1)])
        self.assertTrue(self.memory.brief('dna','字幕')['evidence'])
        self.memory.action({'action':'memory.configure','projectId':'dna','enabled':False})
        brief=self.memory.brief('dna','字幕')
        self.assertFalse(brief['enabled']);self.assertEqual(brief['evidence'],[])
        self.assertEqual(self.memory.page('dna')['total'],1)
        manifest=json.loads((Path(self.library.project('dna')['path'])/'.studio/codex-memory.json').read_text(encoding='utf8'))
        self.assertFalse(manifest['overview']['enabled'])

    def test_project_isolation_and_explicit_series_rules(self):
        self.import_messages([msg('DNA存储所有字幕统一48px',1),msg('密码学纸张需要粗纤维',2),msg('C语言指针内容',3)])
        dna=self.find('dna','DNA存储所有字幕统一48px')
        with self.assertRaises(ValueError):self.memory.tool('crypto',{'recordId':dna['id']})
        self.assertFalse(any(r['projectId']=='dna' for r in self.memory.brief('crypto')['evidence']))
        self.annotate('dna',dna['id'],kind='rule',scope='series',note='统一系列字幕')
        self.assertTrue(any(r['projectId']=='dna' for r in self.memory.brief('crypto')['evidence']))
        self.assertFalse(any(r['projectId']=='dna' for r in self.memory.brief('crypto',use_series=False)['evidence']))
        self.assertFalse(any(r['projectId']=='dna' for r in self.memory.brief('pointers')['evidence']))

    def test_manual_reassignment_survives_rescan_and_ignore_does_not_enter_brief(self):
        messages=[msg('DNA存储封面布局',1)]
        self.import_messages(messages);record=self.find('dna','DNA存储封面布局')
        self.annotate('dna',record['id'],targetProjectId='crypto',kind='rule',note='用户明确修正关联')
        self.import_messages(messages)
        self.assertEqual(self.memory.record('dna',record['id'])['kind'],'ignore')
        self.assertEqual(self.memory.record('crypto',record['id'])['kind'],'rule')
        self.assertNotIn(record['id'],{r['id'] for r in self.memory.brief('dna')['evidence']})
        self.assertIn(record['id'],{r['id'] for r in self.memory.brief('crypto')['evidence']})

    def test_curated_rules_and_new_corrections_outrank_assistant_claims(self):
        self.import_messages([msg('DNA存储镜头路径需平滑',1),msg('模型说镜头已全部检查通过',2,'assistant'),
                              msg('仍然穿模，先修遮挡',3)])
        record=self.find('dna','DNA存储镜头路径需平滑')
        self.annotate('dna',record['id'],kind='rule',note='保留连续数据粒子')
        brief=self.memory.brief('dna','运镜遮挡')
        self.assertEqual(brief['evidence'][0]['id'],record['id'])
        self.assertIn('当前用户要求优先',brief['policy'])
        assistants=[r for r in brief['evidence'] if r['role']=='assistant']
        self.assertTrue(all('未独立验收' in r['attribution'] for r in assistants))

    def test_search_paging_and_full_record_retrieval_stay_project_scoped(self):
        self.import_messages([msg('DNA存储字幕第'+str(i)+'次修改',i) for i in range(1,58)]+[msg('密码学封面',59)])
        first=self.memory.page('dna',q='字幕',offset=0,limit=20)
        second=self.memory.page('dna',q='字幕',offset=20,limit=20)
        self.assertEqual(first['total'],57);self.assertTrue(first['hasMore'])
        self.assertFalse({r['id'] for r in first['records']} & {r['id'] for r in second['records']})
        self.assertEqual(self.memory.page('crypto',q='字幕')['total'],0)
        self.import_messages([msg('DNA存储 '+'正文'*900,61)])
        row=next(r for r in self.all_records('dna') if r['textLength']>1000)
        self.assertEqual(len(row['text']),680)
        part=self.memory.tool('dna',{'recordId':row['id'],'offset':500,'limit':200})
        self.assertEqual(len(part['text']),200);self.assertEqual(part['nextOffset'],700)

    def test_incremental_sync_skips_unchanged_files_and_preserves_curated_state(self):
        self.reader.threads=[self.thread()];self.reader.messages={'thread-one':[msg('DNA存储渲染',1)]}
        self.assertEqual(self.memory.sync_now()['status'],'completed')
        row=self.find('dna','DNA存储渲染');self.annotate('dna',row['id'],kind='avoid',note='避免字幕遮挡')
        self.assertEqual(self.memory.sync_now()['skipped'],1);self.assertEqual(len(self.reader.calls),1)
        self.reader.threads[0]['totalBytes']+=50;self.reader.messages['thread-one'].append(msg('光照再柔和',2))
        self.assertEqual(self.memory.sync_now()['status'],'completed');self.assertEqual(len(self.reader.calls),2)
        self.assertEqual(self.memory.overview('dna')['records'],2);self.assertEqual(self.memory.record('dna',row['id'])['kind'],'avoid')

    def test_embedded_assignment_secrets_do_not_corrupt_source_or_attachment_json(self):
        self.import_messages([msg('DNA存储入口',1,source={'location':'file password=privateEnd'},
                                  attachments=[{'kind':'file','path':'C:/assets/token=privateTail'}])])
        result=self.find('dna','DNA存储入口')
        self.assertIsInstance(result['source'],dict);self.assertIsInstance(result['artifacts'],list)
        self.assertNotIn('privateEnd',json.dumps(result));self.assertNotIn('privateTail',json.dumps(result))

    def test_structured_secret_fields_are_redacted_before_database_storage(self):
        self.import_messages([msg('DNA存储测试',1,source={'threadId':'thread-one','token':'rawSourceToken','nested':{'password':'rawPassword'}},
                                  attachments=[{'path':'C:/frame.png','api_key':'rawAttachmentKey'}])])
        result=self.find('dna','DNA存储测试')
        for private in ('rawSourceToken','rawPassword','rawAttachmentKey'):
            self.assertNotIn(private,json.dumps(result))

    def test_manual_reassignment_refreshes_both_project_manifests(self):
        self.import_messages([msg('DNA存储历史镜头规则',1)])
        record=self.find('dna','DNA存储历史镜头规则')
        self.annotate('dna',record['id'],kind='rule',note='保证连续')
        self.annotate('dna',record['id'],targetProjectId='crypto',kind='reference')
        path=Path(self.library.project('dna')['path'])/'.studio/codex-memory.json'
        source_manifest=json.loads(path.read_text(encoding='utf8'))
        self.assertEqual(next(r for r in source_manifest['curated'] if r['recordId']==record['id'])['kind'],'ignore')

    def test_series_rule_can_be_expanded_using_its_evidence_id(self):
        self.import_messages([msg('DNA存储全系列统一字幕',1)])
        record=self.find('dna','DNA存储全系列统一字幕')
        self.annotate('dna',record['id'],kind='rule',scope='series')
        evidence=next(r for r in self.memory.brief('crypto')['evidence'] if r['id']==record['id'])
        full=self.memory.tool('crypto',{'recordId':evidence['id']})
        self.assertEqual(full['text'],'DNA存储全系列统一字幕')
        with self.assertRaises(ValueError):self.memory.tool('pointers',{'recordId':evidence['id']})

    def test_ignored_records_are_hidden_from_model_search_and_expansion_but_remain_in_ui(self):
        self.import_messages([msg('DNA存储旧字幕黄色',1),msg('字幕最终用白色',2)])
        old=self.find('dna','DNA存储旧字幕黄色')
        self.annotate('dna',old['id'],kind='ignore')
        self.assertEqual(self.memory.tool('dna',{'query':'旧字幕'})['total'],0)
        self.assertNotIn(old['id'],{r['id'] for r in self.memory.tool('dna',{})['records']})
        with self.assertRaisesRegex(ValueError,'忽略'):
            self.memory.tool('dna',{'recordId':old['id']})
        self.assertEqual(self.memory.record('dna',old['id'])['text'],'DNA存储旧字幕黄色')
        self.assertEqual(self.memory.page('dna',kind='ignored')['total'],1)
        self.annotate('dna',old['id'],kind='reference')
        self.assertEqual(self.memory.tool('dna',{'recordId':old['id']})['id'],old['id'])

    def test_ignored_local_tombstone_cannot_fall_back_to_shared_series_rule(self):
        self.import_messages([msg('DNA存储曾经错误关联的字幕规则',1)])
        old=self.find('dna','DNA存储曾经错误关联的字幕规则')
        self.annotate('dna',old['id'],targetProjectId='crypto',kind='rule',scope='series')
        with self.assertRaisesRegex(ValueError,'忽略'):
            self.memory.tool('dna',{'recordId':old['id']})
        self.assertNotIn(old['id'],{r['id'] for r in self.memory.brief('dna')['evidence']})
        self.assertEqual(self.memory.tool('crypto',{'recordId':old['id']})['id'],old['id'])

    def test_shared_record_tool_obeys_project_and_run_series_optout(self):
        self.import_messages([msg('DNA存储全系列统一字幕',1)])
        row=self.find('dna','DNA存储全系列统一字幕')
        self.annotate('dna',row['id'],kind='rule',scope='series')
        with self.assertRaises(ValueError):
            self.memory.tool('crypto',{'recordId':row['id'],'_useSeriesStyle':False})
        self.configs['crypto']['useSeriesStyle']=False
        with self.assertRaises(ValueError):
            self.memory.tool('crypto',{'recordId':row['id']})
        self.assertEqual(self.memory.tool('crypto',{'recordId':row['id'],'_useSeriesStyle':True})['id'],row['id'])
        self.assertEqual(self.memory.tool('dna',{'recordId':row['id'],'_useSeriesStyle':False})['id'],row['id'])

    def test_newer_human_revision_is_selected_before_older_same_concern(self):
        self.import_messages([msg('DNA存储字幕用黄色',1),msg('字幕改成白色，保持统一',2),
                              msg('字幕最终用深青色，旧黄色白色都不采用',3),msg('已修正全部字幕',4,'assistant')])
        evidence=self.memory.brief('dna','字幕')['evidence']
        human=[r for r in evidence if r['role']=='user']
        self.assertTrue(human[0]['excerpt'].startswith('字幕最终用深青色'))
        self.assertNotIn('DNA存储字幕用黄色',{r['excerpt'] for r in evidence})

    def test_new_project_catalog_reclassifies_previously_unassigned_history(self):
        self.reader.threads=[self.thread()];self.reader.messages={'thread-one':[msg('请制作榫卯结构视频',1)]}
        self.memory.sync_now();self.assertEqual(self.memory.page('dna',kind='unassigned')['total'],1)
        self.library.add('joinery','episode3');self.configs['joinery']={'seriesId':'science'}
        self.memory.sync_now()
        self.assertEqual(self.memory.overview('joinery')['records'],1)

    def test_capture_run_is_idempotent_updates_result_and_preserves_curation(self):
        run={'id':'one','projectId':'dna','createdAt':'2026-10-16T10:00:00Z','status':'paused','prompt':'优化运镜',
             'phases':[{'id':'model','summary':'生成了scene.ts，尚未检查'}],'response':'网络中断，文件保留'}
        self.memory.capture_run(run);self.memory.capture_run(run)
        self.assertEqual(self.memory.overview('dna')['records'],3)
        item=self.find('dna','生成了scene.ts，尚未检查');self.annotate('dna',item['id'],kind='reference')
        run.update(status='completed',response='完成但等待用户验收');self.memory.capture_run(run)
        self.assertEqual(self.memory.overview('dna')['records'],3)
        self.assertEqual(self.memory.record('dna',item['id'])['kind'],'reference')
        result=self.find('dna','完成但等待用户验收')
        self.assertEqual(result['source']['runId'],'one');self.assertIn('尚未',result['source']['verification'])
        self.assertEqual(self.memory.page('crypto')['total'],0)

    def test_running_capture_is_not_saved_as_completed_history(self):
        self.memory.capture_run({'id':'active','projectId':'dna','status':'running','createdAt':'2026-10-16T10:00:00Z',
                                 'prompt':'做当前工程','response':'尚在执行','phases':[]})
        self.assertEqual(self.memory.overview('dna')['records'],0)

    def test_related_import_excludes_subagent_even_without_parent_thread_id(self):
        self.reader.threads=[self.thread('user-thread'),self.thread('agent-thread',source='subagent',threadSource='subagent'),
                             self.thread('parent-agent',parentThreadId='user-thread')]
        self.reader.messages={ident:[msg('DNA存储 '+ident,1,thread=ident)] for ident in ('user-thread','agent-thread','parent-agent')}
        self.memory.sync_now()
        self.assertEqual(self.reader.calls,['user-thread'])

    def test_related_import_does_not_pull_other_repository_from_common_parent(self):
        self.reader.threads=[self.thread('valid',cwd=str(self.library.project('dna')['path'])),
                             self.thread('foreign',cwd=str(self.root/'unrelated-research'),title='私人研究记录')]
        self.reader.messages={'valid':[msg('DNA存储修正',1,thread='valid')],
                              'foreign':[msg('私人研究讨论',1,thread='foreign')]}
        self.memory.sync_now()
        self.assertEqual(self.reader.calls,['valid'])

    def test_forked_history_is_not_reused_twice_but_new_fork_edits_are_kept(self):
        original=[msg('DNA存储字幕放大',1,thread='parent'),msg('完成字幕布局',2,'assistant',thread='parent')]
        self.memory.import_thread(self.thread('parent'),original)
        inherited=[{**m,'threadId':'child'} for m in original]
        child=inherited+[msg('继续修改运镜节奏',3,thread='child')]
        self.memory.import_thread(self.thread('child',forkedFromId='parent'),child)
        evidence=self.memory.brief('dna','字幕和运镜')['evidence']
        excerpts=[r['excerpt'] for r in evidence]
        self.assertEqual(excerpts.count('DNA存储字幕放大'),1)
        self.assertIn('继续修改运镜节奏',excerpts)


if __name__=='__main__':unittest.main()
