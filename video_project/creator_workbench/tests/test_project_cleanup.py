import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import threading
import time
from types import SimpleNamespace
import unittest
from unittest import mock

from app.project_cleanup import CleanupManager, _fingerprint


class CleanupTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.base=Path(self.tmp.name);self.project=self.base/'project';self.project.mkdir()
        library=SimpleNamespace(project=lambda ident:{'id':'p','path':str(self.project)})
        self.runs=SimpleNamespace(lock=threading.RLock(),runs={})
        self.studio=SimpleNamespace(has_active=lambda project_id:False)
        self.app=SimpleNamespace(library=library,runs=self.runs,media_studio=self.studio,state_root=self.base/'state')
        self.manager=CleanupManager(self.app)
        self.future=time.time()+3*86400
    def tearDown(self):self.tmp.cleanup()
    def write(self,name,content=b'fixture'):
        path=self.project/name;path.parent.mkdir(parents=True,exist_ok=True);path.write_bytes(content);return path
    def scan(self):
        with mock.patch('app.project_cleanup.time.time',return_value=self.future):return self.manager.scan('p')
    def apply(self,scan,ids=None):
        with mock.patch('app.project_cleanup.time.time',return_value=self.future):return self.manager.apply('p',scan['id'],ids if ids is not None else [x['id'] for x in scan['candidates']])
    def approve_fake(self,name='output/Film_v2.mp4',deps=None):
        self.write(name,b'valid-current')
        with mock.patch('app.project_cleanup._probe_video',return_value={'duration':3,'width':1920,'height':1080,'codec':'h264','fullDecodeChecked':True}):
            return self.manager.approve('p',name,deps)
    def test_only_aged_explicit_regenerable_cache_selected(self):
        old=self.write('work/scene-qa/frame-001.png')
        self.write('work/unknown/render.mp4');self.write('work/qa/analysis.py');self.write('public/qa/frame.png');self.write('audio/music.wav');self.write('history/Film_v1.mp4')
        recent=self.manager.scan('p');self.assertEqual(recent['candidates'],[])
        scan=self.scan();self.assertEqual([x['path'] for x in scan['candidates']],['work/scene-qa/frame-001.png'])
        self.assertEqual(scan['candidates'][0]['fingerprint'],_fingerprint(old))
        report=self.apply(scan)
        self.assertFalse(old.exists());self.assertEqual(report['deletedBytes'],7)
        self.assertTrue((self.project/'work/unknown/render.mp4').exists())
        self.assertTrue((self.project/'public/qa/frame.png').exists())
        self.assertIn('diskFreeDeltaBytes',report)
    def test_source_reference_preserves_cache(self):
        self.write('work/frames/needed.png')
        self.write('src/scene.ts',b'const source = "work/frames/needed.png";')
        scan=self.scan();self.assertEqual(scan['candidates'],[])
        self.assertTrue(any('src/scene.ts' in p['reason'] for p in scan['protected']))
    def test_approve_records_hashes_and_preserves_current_and_dependencies(self):
        source=self.write('src/scene.ts',b'export const a=1')
        asset=self.write('assets/model.glb',b'geometry')
        audio=self.write('audio/master.wav',b'audio')
        lock=self.write('package-lock.json',b'{}')
        self.write('work/qa/needed.png',b'dependency')
        release=self.approve_fake(deps=['work/qa/needed.png'])
        manifest=json.loads((self.project/'.studio/current-release.json').read_text(encoding='utf8'))
        self.assertEqual(release,manifest)
        deps={d['path']:d['fingerprint'] for d in manifest['dependencies']}
        for path in (source,asset,audio,lock):self.assertEqual(deps[path.relative_to(self.project).as_posix()],_fingerprint(path))
        self.assertEqual(self.scan()['candidates'],[])
    def test_duplicate_requires_approved_current_and_matching_bytes(self):
        self.write('output/Film_v2.mp4',b'valid-current');duplicate=self.write('output/duplicate.mp4',b'valid-current');different=self.write('output/different.mp4',b'other-current')
        self.assertEqual(self.scan()['candidates'],[])
        self.approve_fake()
        scan=self.scan();self.assertEqual([x['path'] for x in scan['candidates']],['output/duplicate.mp4'])
        self.apply(scan);self.assertFalse(duplicate.exists());self.assertTrue(different.exists());self.assertTrue((self.project/'output/Film_v2.mp4').exists())
    def test_only_explicit_same_family_old_version_eligible(self):
        self.approve_fake()
        self.write('output/Film_v1.mp4',b'older-content');self.write('output/Other_v1.mp4',b'other-content');self.write('delivery/Film_v1.mp4',b'other-directory');self.write('output/Film_v1_9x16.mp4',b'other-ratio')
        with mock.patch('app.project_cleanup._probe_video',return_value={'duration':3,'width':1920,'height':1080}):scan=self.scan()
        self.assertEqual([x['path'] for x in scan['candidates']],['output/Film_v1.mp4'])
        with mock.patch('app.project_cleanup._probe_video',return_value={'duration':3,'width':1920,'height':1080}):self.apply(scan)
        self.assertTrue((self.project/'output/Other_v1.mp4').exists())
    def test_changed_file_and_changed_current_are_skipped(self):
        self.approve_fake();target=self.write('output/copy.mp4',b'valid-current')
        scan=self.scan();self.write('output/Film_v2.mp4',b'new-current')
        result=self.apply(scan);self.assertEqual(result['deleted'],[]);self.assertTrue(target.exists())
        cache=self.write('work/qa/frame.jpg',b'before');scan=self.scan();cache.write_bytes(b'changed')
        result=self.apply(scan);self.assertEqual(result['deleted'],[]);self.assertTrue(cache.exists())
    def test_new_source_reference_after_scan_prevents_deletion(self):
        target=self.write('work/cache/needed.png')
        scan=self.scan();self.write('src/new.ts',b'const required="work/cache/needed.png"')
        result=self.apply(scan);self.assertEqual(result['deleted'],[]);self.assertTrue(target.exists())
    def test_active_harness_and_media_jobs_protected(self):
        cache=self.write('work/qa/frame.jpg');scan=self.scan()
        self.runs.runs['run']={'projectId':'p','status':'running'}
        self.assertTrue(self.scan()['summary']['active']);self.assertEqual(self.apply(scan)['deleted'],[])
        self.runs.runs.clear();self.studio.has_active=lambda ident:True
        self.assertTrue(self.scan()['summary']['active']);self.assertEqual(self.apply(scan)['deleted'],[]);self.assertTrue(cache.exists())
        with self.assertRaises(ValueError):self.manager.approve('p','work/qa/frame.jpg')
    def test_selected_manifest_only_no_unlisted_or_cross_project(self):
        self.write('work/qa/a.png');self.write('work/qa/b.png');scan=self.scan()
        with self.assertRaises(ValueError):self.manager.apply('p',scan['id'],['unknown'])
        chosen=scan['candidates'][0];result=self.apply(scan,[chosen['id']]);self.assertEqual(len(result['deleted']),1)
        retained=next(x for x in scan['candidates'] if x['id']!=chosen['id']);self.assertTrue((self.project/retained['path']).exists())
    def test_background_approval_ignores_only_its_own_job(self):
        self.studio.jobs={'approval':{'id':'approval','projectId':'p','status':'running'}}
        self.studio.lock=threading.RLock()
        self.studio.has_active=lambda:True
        self.write('output/current.mp4',b'valid-current')
        metadata={'duration':3,'width':1920,'height':1080,'fullDecodeChecked':True}
        with mock.patch('app.project_cleanup._probe_video',return_value=metadata):
            result=self.manager.approve('p','output/current.mp4',ignore_job_id='approval')
            self.assertEqual(result['path'],'output/current.mp4')
            self.studio.jobs['render']={'id':'render','projectId':'p','status':'queued'}
            with self.assertRaisesRegex(ValueError,'正在执行'):
                self.manager.approve('p','output/current.mp4',ignore_job_id='approval')
            self.studio.jobs.pop('render')
            self.runs.runs['agent']={'projectId':'p','status':'running'}
            with self.assertRaisesRegex(ValueError,'正在执行'):
                self.manager.approve('p','output/current.mp4',ignore_job_id='approval')
            self.runs.runs.clear()
        before=(self.project/'.studio/current-release.json').read_bytes()
        def start_render(*args,**kwargs):
            self.studio.jobs['render']={'id':'render','projectId':'p','status':'running'}
            return metadata
        with mock.patch('app.project_cleanup._probe_video',side_effect=start_render):
            with self.assertRaisesRegex(ValueError,'已启动'):
                self.manager.approve('p','output/current.mp4',ignore_job_id='approval')
        self.assertEqual((self.project/'.studio/current-release.json').read_bytes(),before)
    def test_failed_decode_preserves_previous_release(self):
        self.approve_fake();manifest=self.project/'.studio/current-release.json';before=manifest.read_bytes();self.write('output/Film_v3.mp4',b'broken')
        with mock.patch('app.project_cleanup._probe_video',side_effect=ValueError('decode failure')):
            with self.assertRaises(ValueError):self.manager.approve('p','output/Film_v3.mp4')
        self.assertEqual(manifest.read_bytes(),before)
    @unittest.skipUnless(os.name=='nt','Windows junction verification')
    def test_real_junction_target_not_scanned_or_deleted(self):
        outside=self.base/'outside';outside.mkdir();target=outside/'frame.png';target.write_bytes(b'protected')
        parent=self.project/'work';parent.mkdir();link=parent/'qa'
        result=subprocess.run(['cmd','/c','mklink','/J',str(link),str(outside)],capture_output=True)
        if result.returncode:self.skipTest('Cannot make junction')
        try:
            scan=self.scan();self.assertEqual(scan['candidates'],[]);self.assertTrue(target.exists())
            self.assertTrue(any('链接' in p['reason'] for p in scan['protected']))
        finally:os.rmdir(link)
    @unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'FFmpeg required')
    def test_real_video_decode_approval(self):
        output=self.project/'output';output.mkdir();video=output/'test_v1.mp4'
        result=subprocess.run([shutil.which('ffmpeg'),'-v','error','-f','lavfi','-i','color=blue:s=64x64:r=2','-t','1','-c:v','libx264',str(video)],capture_output=True,timeout=15,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        self.assertEqual(result.returncode,0)
        manifest=self.manager.approve('p','output/test_v1.mp4')
        self.assertTrue(manifest['probe']['fullDecodeChecked']);self.assertGreater(manifest['probe']['duration'],0)


if __name__=='__main__':unittest.main()
