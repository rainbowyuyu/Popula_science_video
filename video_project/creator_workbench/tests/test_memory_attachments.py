import json
import tempfile
from pathlib import Path
import unittest
from urllib.parse import urlencode

from tests import test_memory_integration as integration
from tests.test_project_memory import msg


class MemoryAttachmentTests(unittest.TestCase):
    setUp = integration.MemoryIntegrationTests.setUp
    tearDown = integration.MemoryIntegrationTests.tearDown
    call = integration.MemoryIntegrationTests.call

    def seed_image(self, path, **overrides):
        self.memory.import_thread({'id':'images','title':'用户截图','cwd':self.project['path']},
                                  [msg('请修复图一字幕遮挡',attachments=[{'kind':'image','path':str(path),**overrides}])])
        return self.memory.page(self.pid)['records'][0]['id']

    def test_authenticated_preview_uses_record_attachment_and_never_arbitrary_path(self):
        image = self.root/'attached.png'
        image.write_bytes(b'\x89PNG\r\n\x1a\n' + b'fixture')
        rid = self.seed_image(image)
        uri = '/api/project-memory/attachment?' + urlencode({'projectId':self.pid,'id':rid,'index':0})
        self.assertEqual(self.call('GET',uri,authenticated=False)[0],401)
        status,headers,raw = self.call('GET',uri)
        self.assertEqual(status,200)
        self.assertEqual(raw,image.read_bytes())
        wrong = '/api/project-memory/attachment?' + urlencode({'projectId':self.other['id'],'id':rid,'index':0})
        self.assertEqual(self.call('GET',wrong)[0],400)
        with self.assertRaises(ValueError):self.memory.attachment(self.pid,rid,-1)
        self.app.providers.complete.assert_not_called()

    def test_missing_and_disguised_images_are_rejected(self):
        path = self.root/'missing.png'
        rid = self.seed_image(path)
        with self.assertRaisesRegex(ValueError,'不存在'):self.memory.attachment(self.pid,rid,0)
        path.write_text('private text masquerading as an image',encoding='utf8')
        with self.assertRaisesRegex(ValueError,'有效图片'):self.memory.attachment(self.pid,rid,0)

    def test_ignored_attachment_is_hidden_from_model_but_still_available_to_user(self):
        image=self.root/'ignored.png'
        image.write_bytes(b'\x89PNG\r\n\x1a\n'+b'fixture')
        rid=self.seed_image(image)
        self.memory.action({'action':'memory.annotate','projectId':self.pid,'recordId':rid,'kind':'ignore'})
        with self.assertRaisesRegex(ValueError,'忽略'):
            self.memory.attachment(self.pid,rid,0,for_model=True)
        self.assertEqual(self.memory.attachment(self.pid,rid,0),image)
        uri='/api/project-memory/attachment?'+urlencode({'projectId':self.pid,'id':rid,'index':0})
        self.assertEqual(self.call('GET',uri)[0],200)
        self.memory.action({'action':'memory.annotate','projectId':self.pid,'recordId':rid,'kind':'reference'})
        self.assertEqual(self.memory.attachment(self.pid,rid,0,for_model=True),image)

    def test_model_series_attachment_uses_same_optin_and_ignore_policy(self):
        for pid in (self.pid,self.other['id']):
            self.app.studio.project_configure(pid,{'seriesId':'rainbow-science','useSeriesStyle':True})
        image=self.root/'shared.png'
        image.write_bytes(b'\x89PNG\r\n\x1a\n'+b'fixture')
        rid=self.seed_image(image)
        self.memory.action({'action':'memory.annotate','projectId':self.pid,'recordId':rid,'kind':'rule','scope':'series'})
        self.assertEqual(self.memory.attachment(self.other['id'],rid,0,for_model=True),image)
        with self.assertRaises(ValueError):
            self.memory.attachment(self.other['id'],rid,0,for_model=True,use_series=False)
        self.app.studio.project_configure(self.other['id'],{'useSeriesStyle':False})
        with self.assertRaises(ValueError):
            self.memory.attachment(self.other['id'],rid,0,for_model=True)
        self.assertEqual(self.memory.attachment(self.other['id'],rid,0,for_model=True,use_series=True),image)
        with self.assertRaises(ValueError):
            self.memory.attachment(self.other['id'],rid,0)


if __name__ == '__main__':unittest.main()
