"""Exercise real series persistence and the shared cover pixel pipeline in temporary projects."""
import base64
import hashlib
import io
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest import mock
from PIL import Image, ImageDraw

from app.library import Library
from app.server import Workbench
from app.studio import Studio, RATIOS
from app.series_catalog import project_features


class SeriesCoverEditorTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.videos=self.root/'video_project'
        for name in ('alpha','beta'):
            project=self.videos/name;(project/'assets').mkdir(parents=True);(project/'project.json').write_text('{}')
            picture=Image.new('RGB',(1200,800),'#286e84');draw=ImageDraw.Draw(picture);draw.rectangle((600,0,1200,800),fill='#cc6b43');draw.ellipse((650,200,950,500),fill='#e4cd73');picture.save(project/'assets/source.png')
        self.resources=self.root/'resources';(self.resources/'web/assets').mkdir(parents=True)
        Image.new('RGBA',(80,80),'#ef476f').save(self.resources/'web/assets/logo.png')
        with mock.patch('app.server.Library',side_effect=lambda root:Library(root,[root/'shared/skills'])):
            self.app=Workbench(self.videos,self.root/'state',self.resources)
        self.app.providers=mock.Mock();self.app.providers.complete.side_effect=AssertionError('Paid requests forbidden')
        self.app.media_studio.tts_status=mock.Mock(return_value={})
        projects=self.app.library.snapshot()['projects'];self.pid=projects[0]['id'];self.other=projects[1]['id'];self.project=Path(projects[0]['path']);self.studio=self.app.studio
        self.studio.project_configure(self.pid,{'title':'文件藏进 DNA'})
    def tearDown(self):self.tmp.cleanup()
    def call(self,action,**kwargs):return self.studio.action({'action':action,'projectId':self.pid,**kwargs})
    def test_series_lifecycle_and_assignment_preserve_sources(self):
        before=hashlib.sha256((self.project/'assets/source.png').read_bytes()).hexdigest()
        series=self.call('series.save',name='生活中的科学');sid=series['id']
        renamed=self.call('series.rename',id=sid,name='每周科学');self.assertEqual(renamed['coverSpec']['badgeText'],'每周科学')
        result=self.call('series.assign',id=sid,projectIds=[self.pid,self.other]);self.assertEqual(len(result['projects']),2)
        self.call('series.archive',id=sid)
        with self.assertRaises(ValueError):self.call('series.assign',id=sid,projectIds=[self.pid])
        self.call('project.configure',seriesId=sid,features={'audio':False})
        self.call('project.configure',seriesId='independent')
        with self.assertRaises(ValueError):self.call('project.configure',seriesId=sid)
        self.call('series.restore',id=sid)
        self.call('series.assign',id=sid,projectIds=[self.pid])
        reload=Studio(self.app);self.assertEqual(reload.selected_style(self.pid)['name'],'每周科学')
        self.assertFalse(reload.selected_style(self.pid)['archived']);self.assertEqual(before,hashlib.sha256((self.project/'assets/source.png').read_bytes()).hexdigest())
    def test_features_persist_and_validate(self):
        result=self.call('project.configure',features={'covers':False,'audio':False,'subtitles':True})
        self.assertFalse(result['project']['features']['covers']);self.assertTrue(result['features']['creative'])
        self.assertFalse(Studio(self.app).config(self.pid)['features']['audio'])
        for bad in ({'creative':False},{'covers':1},{'wrong':True}):
            with self.assertRaises(ValueError):self.call('project.configure',features=bad)
        self.assertEqual(set(project_features({'bad':True})),{'creative','covers','audio','camera','subtitles'})
    def test_shared_preview_exports_all_ratios_with_locked_anchors_and_reopen(self):
        series=self.call('series.save',name='每天5分钟科普');self.call('series.bind',seriesId=series['id'])
        body={'sourcePath':'assets/source.png','title':'文件藏进 DNA','badge':'不得覆盖系列名','templateId':'rainbow-clean','useSeriesStyle':True,'subject':{r:{'x':.7,'y':.5,'zoom':1.2} for r in ('16:9','3:4','4:3','9:16')}}
        source=(self.project/'assets/source.png').read_bytes();config_before=self.studio.config(self.pid)
        preview=self.call('cover.preview',**body);self.assertEqual(len(preview['items']),4)
        self.assertEqual(config_before,self.studio.config(self.pid));self.assertEqual(list((self.project/'work/covers').iterdir()),[])
        records=[]
        for fmt in ('jpg','png'):
            exported=self.call('cover.render',**body,format=fmt);records.extend(exported['items']);self.assertEqual(len(exported['items']),4)
            for row in exported['items']:
                path=self.project/row['path'];self.assertTrue(path.is_file())
                with Image.open(path) as image:self.assertEqual(image.size,RATIOS[row['ratio']]);self.assertEqual(image.format,'JPEG' if fmt=='jpg' else 'PNG')
                rule=series['coverSpec']['ratios'][row['ratio']];layout=row['layout']
                self.assertEqual(layout['subtitle'],'每天5分钟科普');self.assertEqual(layout['positions']['title'],{k:rule['titleAnchor'][k] for k in ('x','y')});self.assertEqual(layout['fontSizes']['title'],rule['titleAnchor']['fontSize'])
                self.assertEqual(row['sourcePath'],'assets/source.png');self.assertIn('layout',row['templateSpec']);self.assertEqual(row['sha256'],hashlib.sha256(path.read_bytes()).hexdigest())
        self.assertEqual(source,(self.project/'assets/source.png').read_bytes())
        reopened=self.call('cover.load',id=records[-1]['id']);self.assertEqual(reopened['layout']['subject']['zoom'],1.2)
        for p in preview['items']:
            thumb=Image.open(io.BytesIO(base64.b64decode(p['dataUrl'].split(',')[1])));self.assertLessEqual(max(thumb.size),640)
    def test_invalid_sources_crops_and_format_are_rejected(self):
        foreign=self.app.library.register_media(Path(self.app.library.project(self.other)['path'])/'assets/source.png',self.other)
        for values in ({'sourcePath':'../beta/assets/source.png'},{'mediaId':foreign['id']},{'sourcePath':'assets/source.png','subject':{'16:9':{'zoom':0}}},{'sourcePath':'assets/source.png','timeSec':float('nan')},{'sourcePath':'assets/source.png','format':'svg'}):
            with self.assertRaises((ValueError,PermissionError)):self.call('cover.preview',title='试验',**values)
    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'FFmpeg required')
    def test_video_frame_at_selected_time_and_subtitle_discovery(self):
        movie=self.project/'assets/clip.mp4';done=subprocess.run([shutil.which('ffmpeg'),'-v','error','-f','lavfi','-i','color=c=blue:s=640x360:d=2','-c:v','libx264',str(movie)],capture_output=True,timeout=20);self.assertEqual(done.returncode,0)
        preview=self.call('cover.preview',sourcePath='assets/clip.mp4',timeSec=.8,title='观察画面',ratios=['16:9']);self.assertEqual(preview['timeSec'],.8)
        with self.assertRaises(ValueError):self.call('cover.preview',sourcePath='assets/clip.mp4',timeSec=2.1,title='观察画面',ratios=['16:9'])
        (self.project/'subtitles').mkdir();(self.project/'subtitles/main.srt').write_text('1\n00:00:00,000 --> 00:00:01,000\n测试字幕\n',encoding='utf8')
        self.assertEqual(self.studio.snapshot(self.pid,'audio')['subtitlePaths'],['subtitles/main.srt'])

if __name__=='__main__':unittest.main()
