import base64
import hashlib
import http.client
import json
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import unittest
from unittest import mock
import xml.etree.ElementTree as ET

from app.library import Library
from app.server import Workbench,create_server
from app.studio import RATIOS,Studio
from app.series_catalog import PROJECT_NAMES
from runtime_loader import ReloadController


class StudioIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.fixtures=tempfile.TemporaryDirectory();cls.fixture_root=Path(cls.fixtures.name)
        cls.jpeg={}
        ffmpeg=shutil.which('ffmpeg')
        if ffmpeg:
            for ratio,(width,height) in RATIOS.items():
                if ratio=='1:1':continue
                out=cls.fixture_root/(ratio.replace(':','x')+'.jpg')
                run=subprocess.run([ffmpeg,'-v','error','-f','lavfi','-i',f'color=c=white:s={width}x{height}','-frames:v','1',str(out)],capture_output=True,timeout=15)
                if run.returncode:raise RuntimeError('JPEG fixture failed')
                cls.jpeg[ratio]=out.read_bytes()
    @classmethod
    def tearDownClass(cls):cls.fixtures.cleanup()
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.videos=self.root/'video_project';self.project=self.videos/'episode'
        (self.project/'output').mkdir(parents=True);(self.project/'project.json').write_text('{}')
        self.source=self.project/'output/A & B.mp4';self.source.write_bytes(b'original-video-fixture')
        self.resource=self.root/'resources';(self.resource/'web').mkdir(parents=True);(self.resource/'web/index.html').write_text('<html/>')
        (self.resource/'tools/minipaint').mkdir(parents=True);(self.resource/'tools/minipaint/index.html').write_text('<html>EDITOR</html>')
        with mock.patch('app.server.Library',side_effect=lambda root:Library(root,[root/'shared/skills'])):
            self.app=Workbench(self.videos,self.root/'state',self.resource)
        self.app.providers=mock.Mock();self.app.providers.complete.side_effect=AssertionError('No API generation allowed')
        self.app.providers.public_status.return_value=[{'id':'openai','configured':True,'model':'mock'},{'id':'claude','configured':True,'model':'mock'}]
        self.app.runs.providers=self.app.providers
        self.app.media_studio.tts_status=mock.Mock(return_value={'status':'fixture'})
        self.app.media_studio.qwen_status=mock.Mock(return_value={'status':'fixture'})
        self.pid=self.app.library.snapshot()['projects'][0]['id'];self.mid=self.app.media(self.pid)[0]['id']
        self.server=create_server(self.app);self.worker=threading.Thread(target=self.server.serve_forever,daemon=True);self.worker.start()
    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.worker.join(2);self.tmp.cleanup()
    def call(self,method,path,body=None,csrf=True,authenticated=True,headers=None):
        connection=http.client.HTTPConnection('127.0.0.1',self.server.server_port,timeout=10)
        h={}
        if authenticated:h['Cookie']='rainbow_session='+self.app.token
        if csrf:h['X-CSRF-Token']=self.app.csrf
        if body is not None:h['Content-Type']='application/json'
        h.update(headers or {})
        try:
            connection.request(method,path,json.dumps(body,ensure_ascii=False).encode() if body is not None else None,h)
            response=connection.getresponse();return response.status,dict(response.getheaders()),response.read()
        finally:connection.close()
    def action(self,action_name,**values):
        status,_,body=self.call('POST','/api/studio/action',{'action':action_name,'projectId':self.pid,**values})
        self.assertEqual(status,200,body.decode());return json.loads(body)
    def test_series_template_binding_persists_and_injects_run_context(self):
        template=self.action('template.save',template={'id':'my-layout','name':'我的布局','layout':{'title':{'x':.12,'y':.3}},'style':{'accent':'#123456'}})
        series=self.action('series.save',name='算法的故事',style={'accent':'#345678','rules':'用连续镜头讲清机制'})
        config=self.action('series.bind',seriesId=series['id'],templateId=template['id'])
        self.assertEqual(config['templateId'],'my-layout')
        reloaded=Studio(self.app);self.assertEqual(reloaded.selected_style(self.pid)['name'],'算法的故事')
        self.app.runs.start=mock.Mock(return_value={'id':'mock-run'})
        with mock.patch('app.studio.probe',return_value={'format':{'duration':'5'},'streams':[{'codec_type':'video'}]}):
            status,_,_=self.call('POST','/api/runs',{'projectId':self.pid,'provider':'dual','prompt':'优化镜头','context':{'taskType':'segment','mediaId':self.mid,'startSec':1,'endSec':3}})
        self.assertEqual(status,202)
        context=self.app.runs.start.call_args.args[0]['context']
        self.assertEqual(context['series'],'算法的故事');self.assertEqual(context['style']['accent'],'#345678')
        self.assertEqual(context['timeRange'],{'startSec':1.0,'endSec':3.0,'sourcePath':'output/A & B.mp4'})
        self.assertEqual(context['template']['id'],'my-layout')
        self.assertEqual(context['template']['layout']['title']['x'],.12)
    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'FFmpeg required')
    def test_all_four_cover_ratios_are_real_jpg_and_editable_layout_saved(self):
        records=[]
        for ratio,raw in self.jpeg.items():
            result=self.action('cover.save',ratio=ratio,dataUrl='data:image/jpeg;base64,'+base64.b64encode(raw).decode(),layout={'title':{'x':.08,'y':.2}},templateId='rainbow-clean',editorProject={'type':'minipaint','json':{'layers':[{'name':'Title'}]}})
            actual=self.project/result['path'];self.assertEqual(actual.read_bytes(),raw)
            self.assertEqual(result['sha256'],hashlib.sha256(raw).hexdigest())
            self.assertTrue((self.project/result['editableProject']).is_file());records.append(result)
            loaded=self.action('cover.load',id=result['id'])
            self.assertEqual(loaded['layout'],result['layout'])
            self.assertEqual(json.loads(loaded['editorProject']['json']),{'layers':[{'name':'Title'}]})
            layout_file=json.loads((actual.parent/'layout.json').read_text(encoding='utf8'))
            self.assertEqual(layout_file['editableProject'],result['editableProject'])
        self.assertEqual(len(self.app.studio.config(self.pid)['covers']),4)
        first=self.project/records[0]['path'];before=first.read_bytes()
        wrong=self.jpeg['16:9']
        status,_,body=self.call('POST','/api/studio/action',{'action':'cover.save','projectId':self.pid,'ratio':'9:16','dataUrl':'data:image/jpeg;base64,'+base64.b64encode(wrong).decode()})
        self.assertEqual(status,400,body.decode());self.assertEqual(first.read_bytes(),before)
    def test_studio_route_accepts_canvas_payload_larger_than_generic_one_mb(self):
        self.app.studio.cover_save=mock.Mock(return_value={'saved':True})
        self.assertEqual(self.action('cover.save',dataUrl='data:image/jpeg;base64,'+'A'*1_200_000),{'saved':True})
        self.assertGreater(len(self.app.studio.cover_save.call_args.args[1]['dataUrl']),1_000_000)
    def test_display_names_migrate_once_and_never_rename_paths(self):
        before=self.source.read_bytes()
        for folder in ('ai_evolution_ch01_vision_choice','topology_optimization','math_demos'):
            path=self.videos/folder;path.mkdir();(path/'project.json').write_text('{}')
        projects=self.app.library.snapshot(refresh=True)['projects']
        decorated=self.app.studio.decorate_projects(projects)
        rows={Path(p['path']).name:p for p in decorated}
        self.assertEqual(rows['ai_evolution_ch01_vision_choice']['displayName'],'E01 · 视觉与选择')
        self.assertEqual(rows['topology_optimization']['seriesId'],'rainbow-science')
        self.assertEqual(rows['math_demos']['seriesId'],'independent')
        self.assertFalse(rows['math_demos']['useSeriesStyle'])
        target=self.project/'.studio/project.json';stamp=target.stat().st_mtime_ns
        self.app.studio.decorate_projects(projects);self.assertEqual(target.stat().st_mtime_ns,stamp)
        changed=self.action('project.rename',title='只改显示名称')
        self.assertEqual(changed['title'],'只改显示名称');self.assertEqual(self.source.read_bytes(),before)
        self.assertEqual(Path(changed['project']['path']),self.project)
        self.assertEqual(len(PROJECT_NAMES),24)
    def test_copy_platform_roundtrip_and_module_context_are_real_compact_files(self):
        for platform in ('douyin','xiaohongshu','bilibili','wechat'):
            saved=self.action('copy.save',platform=platform,title='地址里藏着什么',body='同一块内存，为什么可以换一种方式找到它？',tags=['C语言','#指针'])
            self.assertTrue((self.project/saved['path']).is_file())
            self.assertEqual(saved['tags'],['C语言','指针'])
        read=self.action('copy.read');self.assertEqual(set(read['platforms']),{'douyin','xiaohongshu','bilibili','wechat'})
        state=self.action('project.state',module='copy')
        self.assertEqual(len(state['copies']),4)
        self.assertTrue(all((self.project/item['path']).is_file() for item in state['files']))
        rows=[json.loads(line) for line in (self.project/'.studio/activity.jsonl').read_text(encoding='utf8').splitlines()]
        self.assertEqual(sum(r['action']=='copy.save' for r in rows),4)
        context=self.app.studio.context(self.pid,{'module':'copy'})
        self.assertIn('projectState',context);self.assertLess(len(json.dumps(context,ensure_ascii=False)),24000)
        self.action('project.configure',useSeriesStyle=False)
        independent=self.app.studio.context(self.pid,{'module':'cover'})
        for key in ('style','template','coverSpec','styleContract'):self.assertNotIn(key,independent)
    def test_module_snapshot_does_not_probe_unopened_audio_or_motion(self):
        media=self.app.media_studio
        with mock.patch.object(media,'snapshot',side_effect=AssertionError('Do not load whole media studio')),mock.patch.object(media,'list_jobs',return_value=[]) as jobs:
            base=self.app.studio.snapshot(self.pid,module='creative')
            self.assertEqual(base['module'],'creative');self.assertEqual(base['audioLibrary'],[])
            self.assertNotIn('layout',base['templates'][0]);self.assertNotIn('covers',base['projectConfig'])
            media.tts_status.assert_not_called();media.qwen_status.assert_not_called();jobs.assert_not_called()
            covers=self.app.studio.snapshot(self.pid,module='covers')
            self.assertIn('layout',covers['templates'][0]);self.assertIn('covers',covers['projectConfig'])
            media.tts_status.assert_not_called();media.qwen_status.assert_not_called();jobs.assert_not_called()
            self.app.studio.snapshot(self.pid,module='audio')
            media.tts_status.assert_called_once();media.qwen_status.assert_not_called();jobs.assert_called_once()
            self.app.studio.snapshot(self.pid,module='motion')
            media.qwen_status.assert_called_once()
    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'FFmpeg required')
    def test_strict_series_cover_contract_and_unpaid_batch_plan(self):
        self.action('project.configure',seriesId='rainbow-science',episode=12,useSeriesStyle=True)
        spec=self.app.studio.selected_style(self.pid)['coverSpec']
        for ratio,raw in self.jpeg.items():
            target=spec['ratios'][ratio]
            layout={'font':spec['font'],'coverSpecVersion':1,'subtitle':spec['badgeText'],
                'positions':{'logo':target['logo'],'subtitle':target['badge'],'title':target['titleAnchor']},
                'fontSizes':{'title':target['titleAnchor']['fontSize'],'badge':target['badge']['fontSize'],'brand':target['brand']['fontSize']}}
            saved=self.action('cover.save',ratio=ratio,dataUrl='data:image/jpeg;base64,'+base64.b64encode(raw).decode(),layout=layout)
            self.assertEqual(saved['coverSpecVersion'],1)
            wrong=copy_json(layout);wrong['positions']['title']['x']+=.03
            status,_,_=self.call('POST','/api/studio/action',{'action':'cover.save','projectId':self.pid,'ratio':ratio,'dataUrl':'data:image/jpeg;base64,'+base64.b64encode(raw).decode(),'layout':wrong})
            self.assertEqual(status,400)
        overview=self.action('series.overview',seriesId='rainbow-science')
        self.assertEqual(overview['projects'][0]['latestCover']['ratio'],'9:16')
        plan=self.action('series.batch.plan',seriesId='rainbow-science',projectIds=[self.pid],taskType='cover-copy')
        self.assertEqual(plan['status'],'planned');self.assertEqual(plan['paidCalls'],0)
        self.assertEqual(plan['projectIds'],[self.pid]);self.assertTrue(Path(plan['path']).is_file())
        self.app.providers.complete.assert_not_called()
    def test_strict_series_cover_rejects_missing_or_changed_badge_text(self):
        self.action('project.configure',seriesId='rainbow-science',useSeriesStyle=True)
        spec=self.app.studio.selected_style(self.pid)['coverSpec'];target=spec['ratios']['16:9']
        layout={'font':spec['font'],'coverSpecVersion':spec['version'],
            'positions':{'logo':target['logo'],'subtitle':target['badge'],'title':target['titleAnchor']},
            'fontSizes':{'title':target['titleAnchor']['fontSize'],'badge':target['badge']['fontSize'],'brand':target['brand']['fontSize']}}
        for subtitle in (None,'另一系列',spec['badgeText']+' '):
            with self.subTest(subtitle=subtitle):
                candidate=copy_json(layout)
                if subtitle is not None:candidate['subtitle']=subtitle
                status,_,body=self.call('POST','/api/studio/action',{'action':'cover.save','projectId':self.pid,'layout':candidate})
                self.assertEqual(status,400,body.decode())
                self.assertIn('系列栏文字',body.decode())
        self.assertEqual(self.app.studio.config(self.pid).get('covers',[]),[])
        self.assertFalse((self.project/'covers').exists())
    def test_segment_rejects_missing_video_out_of_duration_and_other_project(self):
        self.app.runs.start=mock.Mock(return_value={'id':'should-not-start'})
        other=self.app.create_project('另一工程')
        other_path=Path(other['path'])/'output/other.mp4';other_path.write_bytes(b'fixture')
        other_mid=self.app.media(other['id'],refresh=True)[0]['id']
        cases=[{'startSec':0,'endSec':2},
               {'mediaId':self.mid,'startSec':0,'endSec':6},
               {'mediaId':self.mid,'startSec':0,'endSec':float('inf')},
               {'mediaId':self.mid,'startSec':0,'endSec':2,'markers':[{'x':1.2,'y':.5,'timeSec':1}]},
               {'mediaId':other_mid,'startSec':0,'endSec':2},
               {'sourcePath':'../escape.mp4','startSec':0,'endSec':2}]
        with mock.patch('app.studio.probe',return_value={'format':{'duration':'5'},'streams':[{'codec_type':'video'}]}):
            for context in cases:
                with self.subTest(context=context):
                    status,_,body=self.call('POST','/api/runs',{'projectId':self.pid,'prompt':'只修这一段','context':{'taskType':'segment',**context}})
                    self.assertEqual(status,400,body.decode())
        self.app.runs.start.assert_not_called()
        with mock.patch('app.studio.probe',return_value={'format':{'duration':'5'},'streams':[{'codec_type':'video'}]}):
            status,_,body=self.call('POST','/api/runs',{'projectId':self.pid,'prompt':'修正已选区域','context':{'taskType':'segment','mediaId':self.mid,'startSec':1,'endSec':3,'markers':[{'x':.5,'y':.6,'timeSec':2},{'x':.4,'y':.2,'timeSec':4}]}})
        self.assertEqual(status,202,body.decode())
        context=self.app.runs.start.call_args.args[0]['context']
        self.assertEqual(context['sourceDuration'],5)
        self.assertEqual(context['markers'],[{'x':.5,'y':.6,'timeSec':2}])
    def test_reference_registration_and_style_learning_preserve_originals(self):
        external=self.root/'external-reference.mp4';external.write_bytes(b'original-external-reference')
        meta={'format':{'duration':'12'},'streams':[{'codec_type':'video','width':640,'height':360}]}
        with mock.patch('app.studio.probe',return_value=meta):record=self.action('reference.add',path=str(external),name='运镜样例',startSec=2,endSec=7,notes='关注主体接力')
        self.assertEqual((self.project/record['path']).read_bytes(),external.read_bytes())
        self.assertEqual(external.read_bytes(),b'original-external-reference')
        default=copy_json(self.app.studio.store['series'][0])
        learned=self.action('style.learn',id=record['id'],name='暖白微距',summary='柔和材质与接力运镜',rules=['主体保留视觉锚点','淡化次要结构'])
        skill=Path(learned['skill']);self.assertTrue(skill.is_relative_to(self.videos/'shared/skills'))
        self.assertIn('主体保留视觉锚点',skill.read_text(encoding='utf8'))
        local_skill=self.project/learned['projectSkill'];self.assertTrue(local_skill.is_file())
        self.assertEqual(local_skill.read_text(encoding='utf8'),skill.read_text(encoding='utf8'))
        self.assertEqual(self.app.studio.config(self.pid)['learnedSkills'][0]['path'],learned['projectSkill'])
        self.assertEqual(self.app.studio.store['series'][0],default)
        self.assertEqual(external.read_bytes(),b'original-external-reference')
        skills=self.app.library.snapshot(refresh=True)['skills'];self.assertTrue(any(s['path']==str(skill) for s in skills))
        self.app.runs.start=mock.Mock(return_value={'id':'analysis-run'})
        run=self.action('reference.analyze',id=record['id'])
        self.assertEqual(run['runId'],'analysis-run')
        payload=self.app.runs.start.call_args.args[0];self.assertEqual(payload['mode'],'review');self.assertEqual(payload['provider'],'dual')
    def test_organize_does_not_move_existing_source(self):
        legacy=self.project/'legacy.ts';legacy.write_text('legacy source')
        self.action('project.organize')
        for name in ('source','assets','audio','subtitles','covers','output','work','references'):self.assertTrue((self.project/name).is_dir())
        self.assertEqual(legacy.read_text(),'legacy source');self.assertTrue((self.project/'.studio/structure.json').is_file())
    def test_editor_mlt_xml_escapes_real_media_path_and_preserves_original(self):
        original=self.source.read_bytes()
        meta={'format':{'duration':'5'},'streams':[{'codec_type':'video','width':1280,'height':720}]}
        with mock.patch('app.studio.probe',return_value=meta):result=self.action('editor.export',sourcePath='output/A & B.mp4')
        xml=Path(result['absolutePath']).read_text(encoding='utf8')
        root=ET.fromstring(xml);resource=root.find("./producer/property[@name='resource']")
        self.assertEqual(resource.text,str(self.source));self.assertIn('&amp;',xml);self.assertEqual(self.source.read_bytes(),original)
        self.assertEqual(root.find('./profile').attrib['width'],'1280')
        self.assertEqual(self.call('GET','/editors/minipaint/%2e%2e/%2e%2e/private.txt')[0],404)
        self.assertIn(b'EDITOR',self.call('GET','/editors/minipaint/index.html')[2])
    def test_music_range_auth_and_studio_csrf(self):
        music_root=self.root/'music';music_root.mkdir();music=music_root/'test.mp3';music.write_bytes(b'0123456789')
        self.app.media_studio.music['m1']={'id':'m1','path':str(music),'root':str(music_root)}
        status,headers,data=self.call('GET','/api/music/m1',headers={'Range':'bytes=-4'})
        self.assertEqual(status,206);self.assertEqual(data,b'6789');self.assertEqual(headers['Content-Range'],'bytes 6-9/10')
        self.assertEqual(self.call('GET','/api/music/m1',authenticated=False)[0],401)
        self.assertEqual(self.call('POST','/api/studio/action',{'action':'series.save','name':'blocked'},csrf=False)[0],403)
        self.assertEqual(self.call('POST','/api/studio/action',{'action':'series.save','name':'blocked'},headers={'Origin':'https://other.example'})[0],403)
    def test_dual_start_and_select_routes_keep_lifecycle_lock(self):
        class Probe:
            held=False
            def __enter__(me):me.held=True
            def __exit__(me,*_):me.held=False
        guard=Probe();self.server.lifecycle_lock=guard
        def start(body):
            self.assertTrue(guard.held);self.assertEqual(body['provider'],'dual');self.assertTrue(body['candidates']);return {'id':'dual-run'}
        def choose(ident,candidate):
            self.assertTrue(guard.held);self.assertEqual((ident,candidate),('dual-run','B'));return {'id':ident,'status':'queued'}
        self.app.runs.start=mock.Mock(side_effect=start);self.app.runs.select_candidate=mock.Mock(side_effect=choose)
        self.assertEqual(self.call('POST','/api/runs',{'projectId':self.pid,'provider':'dual','candidates':True,'prompt':'三种方案'})[0],202)
        self.assertEqual(self.call('POST','/api/runs/dual-run/select',{'candidateId':'B'})[0],202)
        self.assertEqual(self.call('POST','/api/runs/dual-run/select',{'candidateId':'A'},csrf=False)[0],403)
        self.assertEqual(self.app.runs.select_candidate.call_count,1)
    def test_media_activity_guard_has_old_loader_lock_contract(self):
        self.assertFalse(self.app.check_locks['media'].locked())
        with self.app.media_studio.lock:self.app.media_studio.jobs['fake']={'id':'fake','status':'running'}
        self.assertTrue(self.app.check_locks['media'].locked())
        self.assertEqual(self.call('POST','/api/shutdown',{})[0],409)
        self.app.media_studio.jobs.clear()

    def test_approval_decodes_in_background_while_http_remains_responsive(self):
        entered=threading.Event();release=threading.Event()
        def decoder(*args,**kwargs):
            entered.set()
            if not release.wait(4):raise ValueError('Fixture decoder was not released')
            return {'duration':3,'width':640,'height':360,'fullDecodeChecked':True}
        with mock.patch('app.project_cleanup._probe_video',side_effect=decoder):
            try:
                result=self.action('project.approve',sourcePath='output/A & B.mp4')
                self.assertTrue(entered.wait(2))
                status,_,raw=self.call('GET','/api/bootstrap')
                self.assertEqual(status,200,raw.decode())
                self.assertEqual(self.app.media_studio.get_job(result['jobId'])['status'],'running')
                self.assertEqual(self.call('POST','/api/shutdown',{})[0],409)
            finally:release.set()
            end=time.monotonic()+3
            while time.monotonic()<end:
                row=self.app.media_studio.get_job(result['jobId'])
                if row['status'] not in {'queued','running'}:break
                time.sleep(.02)
            self.assertEqual(row['status'],'completed',row)
            self.assertEqual(row['release']['path'],'output/A & B.mp4')
            self.assertTrue((self.project/'.studio/current-release.json').is_file())

    def test_reference_download_uses_real_background_contract_without_network(self):
        record=self.action('reference.add',url='https://example.com/video',name='参考片段',startSec=4,endSec=9)
        def fake_download(job,argv,timeout):
            self.assertEqual(timeout,420)
            self.assertIn('--download-sections',argv);self.assertIn('*4.0-9.0',argv)
            self.assertIn('--no-cookies',argv);self.assertIn('--no-overwrites',argv)
            destination=Path(argv[argv.index('-o')+1]);destination.write_bytes(b'local-reference-fixture')
            return 'fixture saved'
        def wait_job(ident):
            end=time.monotonic()+3
            while time.monotonic()<end:
                row=self.app.media_studio.get_job(ident)
                if row['status'] not in {'queued','running'}:return row
                time.sleep(.02)
            self.fail('Reference worker did not finish')
        real_dns=socket.getaddrinfo
        def dns(host,*args,**kwargs):
            return [(2,1,6,'',('8.8.8.8',443))] if host=='example.com' else real_dns(host,*args,**kwargs)
        with mock.patch('socket.getaddrinfo',side_effect=dns),mock.patch.object(self.app.media_studio,'_run',side_effect=fake_download) as run,mock.patch('app.studio.probe',return_value={'format':{'duration':'5'}}),mock.patch('app.media_studio._probe',return_value={'duration':5}):
            result=self.action('reference.download',id=record['id']);job=wait_job(result['jobId'])
            self.assertEqual(job['status'],'completed',job)
            self.assertEqual(job['kind'],'reference-download')
            saved=self.app.studio.config(self.pid)['references'][0]
            self.assertEqual(saved['sourceRange'],{'startSec':4.0,'endSec':9.0})
            self.assertEqual((saved['startSec'],saved['endSec']),(0,5))
            output=self.project/saved['path'];self.assertEqual(output.read_bytes(),b'local-reference-fixture')
            self.assertEqual(job['output']['relativePath'],saved['path'])
            repeat=self.action('reference.download',id=record['id']);failed=wait_job(repeat['jobId'])
            self.assertEqual(failed['status'],'failed');self.assertEqual(run.call_count,1)
            self.assertEqual(output.read_bytes(),b'local-reference-fixture')

    def test_real_candidate_http_flow_waits_then_selects_with_mock_apis(self):
        options=json.dumps({'candidates':[{'id':x,'title':'方案'+x,'approach':'具体布局'+x,'tradeoffs':'取舍'+x} for x in 'ABC']},ensure_ascii=False)
        def result(text):return {'text':text,'tool_calls':[],'model':'mock-reported','usage':{},'stop_reason':'completed'}
        self.app.providers.complete.side_effect=[result(options),result(options),result('计划'),result('模型'),result('动效'),result('整合')]
        status,_,data=self.call('POST','/api/runs',{'projectId':self.pid,'provider':'dual','candidates':True,'prompt':'生成三种方案'})
        self.assertEqual(status,202);ident=json.loads(data)['id']
        def wait_run(target):
            end=time.monotonic()+4
            while time.monotonic()<end:
                row=self.app.runs.get(ident)
                if row['status']==target:return row
                if row['status'] in {'failed','cancelled'}:self.fail(row['response'])
                time.sleep(.02)
            self.fail('Candidate route did not reach '+target)
        pending=wait_run('awaiting_selection')
        self.assertEqual(len(pending['candidates']),3);self.assertEqual(pending['changedFiles'],[])
        self.assertEqual(self.app.providers.complete.call_count,2)
        self.assertEqual(self.call('POST',f'/api/runs/{ident}/select',{'candidateId':'B'})[0],202)
        finished=wait_run('completed');self.assertEqual(finished['selectedCandidateId'],'B')
        self.assertEqual([c.args[0] for c in self.app.providers.complete.call_args_list],['openai','claude','openai','openai','claude','openai'])
        self.assertEqual(self.call('POST',f'/api/runs/{ident}/select',{'candidateId':'A'})[0],400)

    def test_reference_completion_keeps_concurrent_series_binding(self):
        series=self.action('series.save',name='保留我的系列')
        record=self.action('reference.add',url='https://example.com/reference',startSec=1,endSec=4)
        captured=threading.Event();resume=threading.Event();binding_done=threading.Event();binding_started=threading.Event()
        original_config=self.app.studio.config;real_dns=socket.getaddrinfo;responses=[]
        def read_config(*args,**kwargs):
            value=original_config(*args,**kwargs)
            if threading.current_thread().name.startswith('media-'):
                captured.set()
                if not resume.wait(3):raise ValueError('Fixture config update timed out')
            return value
        def dns(host,*args,**kwargs):
            return [(2,1,6,'',('8.8.8.8',443))] if host=='example.com' else real_dns(host,*args,**kwargs)
        def download(job,argv,timeout):Path(argv[argv.index('-o')+1]).write_bytes(b'reference')
        def bind():
            binding_started.set()
            try:responses.append(self.call('POST','/api/studio/action',{'action':'series.bind','projectId':self.pid,'seriesId':series['id']}))
            finally:binding_done.set()
        with mock.patch.object(self.app.studio,'config',side_effect=read_config),mock.patch('socket.getaddrinfo',side_effect=dns),mock.patch.object(self.app.media_studio,'_run',side_effect=download),mock.patch('app.studio.probe',return_value={'format':{'duration':'3'}}),mock.patch('app.media_studio._probe',return_value={'duration':3}):
            task=self.action('reference.download',id=record['id'])
            try:
                self.assertTrue(captured.wait(2))
                binder=threading.Thread(target=bind,daemon=True);binder.start()
                self.assertTrue(binding_started.wait(1))
                binding_done.wait(.2)
            finally:resume.set()
            binder.join(3);self.assertTrue(binding_done.is_set());self.assertEqual(responses[0][0],200,responses)
            end=time.monotonic()+3
            while time.monotonic()<end:
                job=self.app.media_studio.get_job(task['jobId'])
                if job['status'] not in {'queued','running'}:break
                time.sleep(.02)
            self.assertEqual(job['status'],'completed',job)
        config=self.app.studio.config(self.pid)
        self.assertEqual(config['seriesId'],series['id'])
        self.assertEqual(config['references'][0]['status'],'local-ready')

    def test_stable_loader_defers_for_media_job_and_preserves_session(self):
        external=self.root/'loader-video/creator_workbench'
        shutil.copytree(Path(__file__).resolve().parents[1]/'app',external/'app',ignore=shutil.ignore_patterns('__pycache__'))
        (external/'web').mkdir();(external/'web/index.html').write_text('<html/>')
        controller=ReloadController(external.parent,external/'work',external,'external');server=controller.bind(0)
        try:
            previous=controller.app;token=previous.token;csrf=previous.csrf
            with previous.media_studio.lock:previous.media_studio.jobs['active']={'id':'active','status':'running'}
            source=external/'app/server.py';source.write_text(source.read_text(encoding='utf8')+'\nVERSION="after-media"\n',encoding='utf8')
            self.assertEqual(controller.reload()['status'],'deferred');self.assertIs(controller.app,previous)
            previous.media_studio.jobs.clear()
            self.assertEqual(controller.reload()['status'],'updated');self.assertIsNot(controller.app,previous)
            self.assertEqual((controller.app.token,controller.app.csrf),(token,csrf))
        finally:
            server.server_close();controller.loader.dispose()


def copy_json(value):return json.loads(json.dumps(value))


if __name__=='__main__':unittest.main()
