"""Local version-scoped review persistence; media timing is probed server-side.

Fixture movies are inert bytes. The probe is mocked with a real-duration result;
neither providers nor media generation services are invoked.
"""
import copy
import json
from pathlib import Path
import threading
import unittest
from unittest import mock

from app.video_review import VideoReview, ReviewConflict
from tests import test_server as server_fixture


class VideoReviewTests(unittest.TestCase):
    tearDown = server_fixture.ServerTests.tearDown

    def setUp(self):
        server_fixture.ServerTests.setUp(self)
        self.review = VideoReview(self.app)
        self.probe = mock.patch.object(self.app, 'media_probe', return_value={'duration': 12.5, 'fps': 30}).start()
        self.addCleanup(mock.patch.stopall)
        self.source = {'projectId': self.project['id'], 'mediaId': self.media_id}
        self.note = {'id': 'note-one', 'kind': 'note', 'startSec': 1, 'endSec': 4,
                     'text': '字幕移动到左下方', 'x': .3, 'y': .8, 'enabled': True}

    def read(self):
        return self.review.action({'action': 'review.read', **self.source})

    def save(self, notes=None, base=None, **overrides):
        body = {**(base or self.read()), 'action': 'review.save',
                'notes': copy.deepcopy(notes if notes is not None else [self.note]), **overrides}
        return self.review.action(body)

    def test_read_is_lazy_and_does_not_create_revision_files(self):
        result = self.read()
        self.assertEqual(result['notes'], [])
        self.assertEqual(result['revision'], 0)
        self.assertEqual(result['sourcePath'], 'output/episode_v1_final.mp4')
        self.assertFalse((Path(self.project['path']) / result['path']).exists())
        self.probe.assert_not_called()
        self.app.providers.complete.assert_not_called()

    def test_save_persists_normalized_review_without_changing_movie(self):
        original = self.media.read_bytes()
        notes = [{**self.note, 'id': 'n-' + kind, 'kind': kind, 'value': 1.2}
                 for kind in ('note', 'text', 'blur', 'brightness', 'zoom')]
        saved = self.save(notes)
        self.assertEqual(saved['revision'], 1)
        self.assertEqual(saved['status'], 'draft')
        self.assertTrue(saved['previewOnly'])
        self.assertEqual(saved['notes'][0]['width'], .25)
        self.assertEqual(saved['notes'][0]['height'], .15)
        stored = json.loads((Path(self.project['path']) / saved['path']).read_text(encoding='utf8'))
        self.assertEqual(stored['notes'], saved['notes'])
        self.assertEqual(VideoReview(self.app).read(self.source)['revision'], 1)
        self.assertEqual(self.media.read_bytes(), original)
        self.probe.assert_called_once_with(self.media_id)
        self.app.providers.complete.assert_not_called()

    def test_two_tabs_cannot_overwrite_newer_saved_revision(self):
        first = self.read()
        second = copy.deepcopy(first)
        saved = self.save(base=first)
        with self.assertRaisesRegex(ValueError, '另一页面'):
            self.save([{**self.note, 'text': '过期页面的内容'}], base=second)
        self.assertEqual(self.read()['notes'], saved['notes'])
        self.assertEqual(self.read()['revision'], 1)

    def test_expected_revision_contract_and_http_conflict_metadata(self):
        initial=self.read()
        saved=self.review.save({**self.source,'sourceVersion':initial['sourceVersion'],
                               'expectedRevision':0,'notes':[self.note]})
        self.assertEqual(saved['revision'],1)
        with self.assertRaises(ReviewConflict) as caught:
            self.review.save({**self.source,'sourceVersion':initial['sourceVersion'],
                              'expectedRevision':0,'notes':[]})
        self.assertEqual(caught.exception.status_code,409)
        self.assertEqual(caught.exception.code,'review_conflict')
        with self.assertRaisesRegex(ValueError,'参数不一致'):
            self.save(base=saved,revision=1,expectedRevision=0)
        self.assertEqual(self.read()['notes'],saved['notes'])

    def test_module_defaults_and_valid_explicit_targets(self):
        notes=[{**self.note,'id':'kind-'+kind,'kind':kind} for kind in ('note','text','zoom','brightness','blur')]
        saved=self.save(notes)
        self.assertEqual([n['targetModule'] for n in saved['notes']],
                         ['creative','subtitles','camera','camera','creative'])
        notes=[{**self.note,'id':'module-'+module,'targetModule':module}
               for module in ('creative','covers','audio','camera','subtitles')]
        saved=self.save(notes,base=saved)
        self.assertEqual([n['targetModule'] for n in saved['notes']],
                         ['creative','covers','audio','camera','subtitles'])
        with self.assertRaisesRegex(ValueError,'所属模块'):
            self.save([{**self.note,'targetModule':'outside'}],base=saved)

    def test_deletion_and_undo_persist_across_review_instances(self):
        first=self.save([self.note,{**self.note,'id':'note-two','text':'运镜'}])
        deleted=self.save([first['notes'][1]],base=first)
        self.assertEqual([n['id'] for n in VideoReview(self.app).read(self.source)['notes']],['note-two'])
        cleared=self.save([],base=deleted)
        self.assertEqual(VideoReview(self.app).read(self.source)['notes'],[])
        restored=self.save(first['notes'],base=cleared)
        self.assertEqual(VideoReview(self.app).read(self.source)['notes'],first['notes'])
        self.assertEqual(restored['revision'],4)

    def test_preparation_and_submission_preserve_notes_and_revision(self):
        saved=self.save()
        prepared=self.review.action({'action':'review.prepare',**self.source,
                    'sourceVersion':saved['sourceVersion'],'expectedRevision':saved['revision']})
        self.assertEqual(prepared['status'],'prepared')
        self.assertEqual(prepared['preparedRevision'],1)
        self.assertEqual(prepared['revision'],1)
        self.assertEqual(prepared['notes'],saved['notes'])
        snapshot=self.submit(prepared)
        self.assertEqual(self.read()['status'],'submitted')
        self.assertEqual(self.read()['submittedRevision'],1)
        self.assertEqual(self.read()['notes'],saved['notes'])
        edited=self.save([],base=prepared)
        self.assertEqual(edited['status'],'draft')
        self.assertEqual(edited['preparedRevision'],1)
        self.assertEqual(edited['submittedRevision'],1)
        self.assertEqual(json.loads((Path(self.project['path'])/snapshot['path']).read_text(encoding='utf8'))['notes'],saved['notes'])
        self.app.providers.complete.assert_not_called()

    def test_preparation_rejects_empty_disabled_stale_or_replaced_video(self):
        first=self.save([{**self.note,'enabled':False}])
        request={'action':'review.prepare',**self.source,'sourceVersion':first['sourceVersion'],'expectedRevision':1}
        with self.assertRaisesRegex(ValueError,'至少采用'):
            self.review.action(request)
        latest=self.save(base=first)
        with self.assertRaises(ReviewConflict):self.review.action(request)
        request['expectedRevision']=latest['revision']
        self.media.write_bytes(b'replacement-preparation-media')
        with self.assertRaises(ReviewConflict):self.review.action(request)

    def test_latest_video_gets_new_review_version_and_keeps_old_notes(self):
        old = self.save()
        old_path = Path(self.project['path']) / old['path']
        old_contents = old_path.read_bytes()
        self.media.write_bytes(b'new-movie-with-new-length')
        latest = self.read()
        self.assertNotEqual(latest['sourceVersion'], old['sourceVersion'])
        self.assertEqual(latest['revision'], 0)
        self.assertEqual(latest['notes'], [])
        with self.assertRaisesRegex(ValueError, '成片已更新'):
            self.save(base=old)
        self.save([{**self.note, 'text': '新版意见'}], base=latest)
        self.assertEqual(old_path.read_bytes(), old_contents)
        self.assertEqual(len(list(old_path.parent.glob('*.json'))), 2)

    def test_real_probe_duration_overrules_browser_supplied_duration(self):
        base = self.read()
        with self.assertRaisesRegex(ValueError, '超出范围'):
            self.save([{**self.note, 'endSec': 12.6}], base=base, duration=100000)
        self.probe.assert_called_once_with(self.media_id)
        saved = self.save([{**self.note, 'endSec': 12.5}], base=base, duration=1)
        self.assertEqual(saved['notes'][0]['endSec'], 12.5)

    def test_media_from_other_project_is_rejected_for_read_and_save(self):
        other = self.app.create_project('其他工程')
        for method in (self.review.read, self.review.save):
            with self.subTest(method=method.__name__), self.assertRaisesRegex(ValueError, '当前工程'):
                method({**self.source, 'projectId': other['id'], 'revision': 0, 'notes': [self.note]})
        self.assertFalse((Path(other['path']) / '.studio/reviews').exists())

    def test_client_cannot_select_write_path_or_replace_source(self):
        saved = self.save(sourcePath='../../private.mp4', path='../../escaped.json')
        self.assertEqual(saved['sourcePath'], 'output/episode_v1_final.mp4')
        self.assertTrue(saved['path'].startswith('.studio/reviews/'))
        self.assertFalse((self.root / 'escaped.json').exists())
        with self.assertRaises(KeyError):
            self.review.read({**self.source, 'mediaId': '../../private.mp4'})

    def test_non_video_asset_cannot_receive_video_annotations(self):
        image = self.media.parent / 'cover.png'
        image.write_bytes(b'image-fixture')
        with mock.patch.object(self.app, 'media_path', return_value=image):
            with self.assertRaisesRegex(ValueError, '视频'):
                self.review.read(self.source)

    def test_invalid_notes_do_not_overwrite_prior_saved_review(self):
        saved = self.save()
        bad = [None, {}, [self.note, self.note], [{**self.note, 'id': ''}],
               [{**self.note, 'kind': 'script'}], [{**self.note, 'startSec': -1}],
               [{**self.note, 'endSec': 1}], [{**self.note, 'x': True}],
               [{**self.note, 'x': float('nan')}], [{**self.note, 'x': 1.1}],
               [{**self.note, 'value': float('inf')}], [{**self.note, 'enabled': 'yes'}],
               [{**self.note, 'width': .001}], [{**self.note, 'height': 2}],
               [{**self.note, 'id': str(i)} for i in range(201)]]
        for notes in bad:
            with self.subTest(notes=str(notes)[:120]), self.assertRaises(ValueError):
                self.review.save({**saved, 'notes': notes})
            self.assertEqual(self.read()['revision'], 1)
        self.assertEqual(self.read()['notes'], saved['notes'])

    def test_revision_rejects_boolean_string_and_float(self):
        for revision in (True, '0', 0.0, -1):
            with self.subTest(revision=revision), self.assertRaises(ValueError):
                self.save(revision=revision)
        self.assertEqual(self.read()['revision'], 0)

    def test_concurrent_saves_one_wins_and_other_reports_conflict(self):
        base = self.read()
        start = threading.Barrier(3)
        results = []
        def writer(label):
            start.wait(timeout=2)
            try:
                results.append(('saved', self.save([{**self.note, 'text': label}], base=base)))
            except ValueError as exc:
                results.append(('conflict', str(exc)))
        threads = [threading.Thread(target=writer, args=(label,)) for label in ('第一条', '第二条')]
        for thread in threads:
            thread.start()
        start.wait(timeout=2)
        for thread in threads:
            thread.join(timeout=2)
        self.assertEqual(sorted(result[0] for result in results), ['conflict', 'saved'])
        self.assertEqual(self.read()['revision'], 1)

    def submit(self, saved, **overrides):
        return self.review.snapshot({**self.source, 'sourceVersion': saved['sourceVersion'],
                                     'reviewRevision': saved['revision'], **overrides})

    def test_submission_rejects_stale_revision_without_creating_snapshot(self):
        first = self.save()
        self.save([{**self.note, 'text': '第二次修改'}], base=first)
        with self.assertRaisesRegex(ValueError, '修改清单已更新'):
            self.submit(first)
        self.assertFalse((Path(self.project['path']) / '.studio/reviews/submissions').exists())

    def test_submission_file_is_immutable_when_draft_changes_later(self):
        first = self.save()
        submitted = self.submit(first)
        submitted_path = Path(self.project['path']) / submitted['path']
        original = submitted_path.read_bytes()
        self.assertEqual(submitted['notes'], first['notes'])
        self.assertIn('/submissions/', submitted['path'])
        self.assertNotEqual(submitted['path'], first['path'])
        repeated = self.submit(first)
        self.assertEqual(repeated['path'], submitted['path'])
        self.assertEqual(submitted_path.read_bytes(), original)
        second = self.save([{**self.note, 'text': '另一个意见', 'x': .8}], base=first)
        second_submit = self.submit(second)
        self.assertNotEqual(second_submit['path'], submitted['path'])
        self.assertEqual(submitted_path.read_bytes(), original)
        self.assertEqual(json.loads(original)['revision'], 1)
        self.assertEqual(second_submit['revision'], 2)

    def test_submission_rejects_updated_source(self):
        first = self.save()
        self.media.write_bytes(b'replaced-video-source-after-saving')
        with self.assertRaisesRegex(ValueError, '修改清单已更新'):
            self.submit(first)
        self.assertFalse((Path(self.project['path']) / '.studio/reviews/submissions').exists())

    def test_submission_revision_requires_strict_integer(self):
        saved = self.save()
        for revision in (True, False, '1', 1.0):
            with self.subTest(revision=revision), self.assertRaises(ValueError):
                self.submit(saved, reviewRevision=revision)
        self.assertFalse((Path(self.project['path']) / '.studio/reviews/submissions').exists())
        self.assertEqual(self.read()['revision'], 1)

    def test_submission_rechecks_source_after_read_before_writing(self):
        saved = self.save()
        original_source = self.review.source
        calls = 0
        def replace_before_second_source(body):
            nonlocal calls
            calls += 1
            if calls == 2:
                self.media.write_bytes(b'render-replaced-video-between-snapshot-read-and-write')
            return original_source(body)
        with mock.patch.object(self.review, 'source', side_effect=replace_before_second_source):
            with self.assertRaises(ValueError):
                self.submit(saved)
        self.assertEqual(calls, 2)
        self.assertFalse((Path(self.project['path']) / '.studio/reviews/submissions').exists())
        self.assertTrue((Path(self.project['path']) / saved['path']).is_file())

    def test_empty_draft_still_requires_valid_probed_duration(self):
        base = self.read()
        for duration in (float('nan'), float('inf'), 0, -1):
            self.probe.return_value = {'duration': duration, 'fps': 30}
            with self.subTest(duration=duration), self.assertRaisesRegex(ValueError, '视频时长无效'):
                self.save([], base=base)
            self.assertFalse((Path(self.project['path']) / base['path']).exists())

    def test_movie_replacement_during_probe_rejects_save(self):
        base = self.read()
        def replace_during_probe(_):
            self.media.write_bytes(b'a-new-movie-produced-while-probe-running')
            return {'duration': 12.5, 'fps': 30}
        self.probe.side_effect = replace_during_probe
        with self.assertRaisesRegex(ValueError, '成片已更新'):
            self.save(base=base)
        self.assertFalse((Path(self.project['path']) / base['path']).exists())

    def test_studio_context_normalizes_review_source_snapshot_and_count(self):
        saved = self.save([self.note, {**self.note, 'id':'disabled-note', 'enabled':False}])
        data = self.app.studio.context(self.project['id'], {
            'taskType': 'video-review', 'mediaId': self.media_id, 'sourceVersion': saved['sourceVersion'],
            'reviewRevision': saved['revision'], 'reviewPath': '../../untrusted.json',
            'sourcePath': '../../untrusted.mp4', 'reviewCount': 999,
        })
        self.assertEqual(data['sourcePath'], 'output/episode_v1_final.mp4')
        self.assertEqual(data['reviewRevision'], 1)
        self.assertEqual(data['reviewCount'], 1)
        self.assertIn('enabled=false', data['reviewContract'])
        self.assertIn('不执行', data['reviewContract'])
        self.assertTrue(data['reviewPath'].startswith('.studio/reviews/submissions/'))
        self.assertEqual(json.loads((Path(self.project['path']) / data['reviewPath']).read_text(encoding='utf8'))['notes'], saved['notes'])

    def test_studio_context_rejects_cross_project_review_before_start(self):
        saved = self.save()
        other = self.app.create_project('不属于此处的片子')
        with self.assertRaisesRegex(ValueError, '当前工程'):
            self.app.studio.context(other['id'], {'taskType': 'video-review', 'mediaId': self.media_id,
                'sourceVersion': saved['sourceVersion'], 'reviewRevision': saved['revision']})
        self.app.providers.complete.assert_not_called()


if __name__ == '__main__':
    unittest.main()
