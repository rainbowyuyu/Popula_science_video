import http.client
import json
from pathlib import Path
import shutil
import tempfile
import threading
import unittest

from runtime_loader import ReloadController, resource_root

SOURCE = Path(__file__).resolve().parents[1]


class RefreshRuntimeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.video = self.root / 'video_project'
        self.external = self.video / 'creator_workbench'
        shutil.copytree(SOURCE / 'app', self.external / 'app', ignore=shutil.ignore_patterns('__pycache__'))
        (self.external / 'web').mkdir()
        (self.external / 'web/index.html').write_text('<html>VERSION_ONE</html>', encoding='utf8')
        self.controller = ReloadController(self.video, self.external / 'work', self.external, 'external')
        self.server = self.controller.bind(0)
        self.worker = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.worker.start()
        self.token = self.controller.app.token
        self.csrf = self.controller.app.csrf

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.worker.join(2)
        self.controller.loader.dispose()
        self.tmp.cleanup()

    def request(self, method='GET', path='/', body=None):
        connection = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=10)
        headers = {'Cookie': 'rainbow_session=' + self.token, 'X-CSRF-Token': self.csrf}
        if body is not None:
            headers['Content-Type'] = 'application/json'
        connection.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = connection.getresponse()
        data = response.read()
        connection.close()
        self.assertEqual(response.status, 200, data.decode())
        return data

    def edit_server(self, suffix):
        path = self.external / 'app/server.py'
        path.write_text(path.read_text(encoding='utf8') + '\n' + suffix + '\n', encoding='utf8')

    def test_refresh_swaps_real_python_handler_preserves_session_and_serves_new_html(self):
        previous = self.server.app
        revision = self.controller.revision
        self.edit_server("VERSION='external-refresh-test'")
        (self.external / 'web/index.html').write_text('<html>VERSION_TWO</html>')
        self.assertIn(b'VERSION_TWO', self.request())
        self.assertIsNot(previous, self.server.app)
        self.assertNotEqual(revision, self.controller.revision)
        self.assertEqual(self.server.app.token, self.token)
        self.assertEqual(self.server.app.csrf, self.csrf)
        self.assertEqual(self.controller.module.VERSION, 'external-refresh-test')
        data = json.loads(self.request('POST', '/api/refresh', {}))
        self.assertEqual(data['version'], 'external-refresh-test')

    def test_incomplete_edit_keeps_old_runtime_and_recovers_on_next_refresh(self):
        previous = self.server.app
        path = self.external / 'app/server.py'
        original = path.read_bytes()
        self.edit_server('def broken(:')
        self.assertIn(b'VERSION_ONE', self.request())
        self.assertIs(self.server.app, previous)
        self.assertEqual(previous.runtime_status['status'], 'error')
        path.write_bytes(original + b"\nVERSION='recovered'\n")
        self.request()
        self.assertEqual(self.controller.module.VERSION, 'recovered')

    def test_refresh_waits_for_active_job_then_loads_without_interrupting(self):
        previous = self.server.app
        previous.runs.runs['active'] = {'id': 'active', 'status': 'running'}
        self.edit_server("VERSION='after-job'")
        self.request()
        self.assertIs(self.server.app, previous)
        self.assertEqual(previous.runtime_status['status'], 'deferred')
        previous.runs.runs.clear()
        self.request()
        self.assertIsNot(self.server.app, previous)
        self.assertEqual(self.controller.module.VERSION, 'after-job')

    def test_missing_candidate_handler_does_not_partially_replace_runtime(self):
        previous = self.server.app
        revision = self.controller.revision
        self.edit_server('del Handler')
        self.assertIn(b'VERSION_ONE', self.request())
        self.assertIs(self.server.app, previous)
        self.assertIs(self.controller.app, previous)
        self.assertEqual(self.controller.revision, revision)
        self.assertEqual(previous.runtime_status['status'], 'error')

    def test_source_selection_prefers_complete_external_folder(self):
        self.assertEqual(resource_root(self.video, SOURCE), (self.external.resolve(), 'external'))
        (self.external / 'app/server.py').unlink()
        self.assertEqual(resource_root(self.video, SOURCE), (SOURCE.resolve(), 'bundled'))


if __name__ == '__main__':
    unittest.main()
