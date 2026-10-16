import json
from pathlib import Path
import tempfile
import unittest
from app.export_metadata import exported_defaults

class ExportMetadataTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
    def tearDown(self): self.temp.cleanup()
    def load(self, metadata):
        (self.root/'project.json').write_text(json.dumps(metadata),encoding='utf8')
        return exported_defaults(self.root)
    def test_public_labels_import_without_private_state(self):
        result = self.load({'workbench':{'title':'DNA 存储','episode':5,'seriesId':'rainbow-science','token':'private','covers':[{'path':'private.png'}],'references':['private']}})
        self.assertEqual(result['displayName'],'E05 · DNA 存储')
        self.assertEqual(result['covers'],[])
        self.assertEqual(result['references'],[])
        self.assertNotIn('token',result)
    def test_invalid_metadata_keeps_defaults(self):
        for item in ({'title':'A','seriesId':'unknown'},{'title':'A','seriesId':'independent','episode':True},None,[]):
            self.assertNotIn('metadataVersion', self.load({'workbench':item}))
    def test_absent_and_nonobject_manifest_are_supported(self):
        self.assertNotIn('metadataVersion', exported_defaults(self.root))
        self.assertNotIn('metadataVersion', self.load([]))
    def test_independent_project_remains_unstyled(self):
        result=self.load({'workbench':{'title':'科研演示','seriesId':'independent'}})
        self.assertEqual(result['displayName'],'科研演示')
        self.assertFalse(result['useSeriesStyle'])
