import http.client
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest import mock

from app.library import Library
from app.server import Handler, Workbench, create_server


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.videos = self.root / "video_project"
        project = self.videos / "episode"
        (project / "output").mkdir(parents=True)
        (project / "package.json").write_text("{}")
        self.media = project / "output/episode_v1_final.mp4"
        self.media.write_bytes(b"0123456789")
        self.resources = self.root / "resources"
        (self.resources / "web").mkdir(parents=True)
        (self.resources / "web/index.html").write_text("<html>Workbench</html>")
        (self.resources / "private.txt").write_text("outside-web-private")
        with mock.patch("app.server.Library", side_effect=lambda root: Library(root, [])):
            self.app = Workbench(self.videos, self.root / "state", self.resources)
        self.app.providers = mock.Mock()
        self.app.providers.public_status.return_value = [{"id": "openai", "name": "OpenAI", "model": "mock", "configured": True, "endpointDisplay": "https://example.com", "source": "CC Switch", "wireApi": "responses", "reason": ""}]
        self.app.providers.complete.side_effect = AssertionError("No live provider call allowed in server tests")
        self.app.runs.providers = self.app.providers
        self.server = create_server(self.app)
        self.port = self.server.server_port
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.project = self.app.library.snapshot()["projects"][0]
        self.media_id = self.app.media(self.project["id"])[0]["id"]

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)
        self.tmp.cleanup()

    def call(self, method, path, body=None, *, authenticated=True, csrf=False, headers=None):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=4)
        request_headers = {}
        if authenticated:
            request_headers["Cookie"] = "rainbow_session=" + self.app.token
        if csrf:
            request_headers["X-CSRF-Token"] = self.app.csrf
        if body is not None:
            body = json.dumps(body).encode()
            request_headers["Content-Type"] = "application/json"
        request_headers.update(headers or {})
        try:
            conn.request(method, path, body, request_headers)
            result = conn.getresponse()
            return result.status, dict(result.getheaders()), result.read()
        finally:
            conn.close()

    def test_launch_exchanges_token_for_httponly_cookie(self):
        status, headers, body = self.call("GET", "/?launch=" + self.app.token, authenticated=False)
        self.assertEqual(status, 303)
        self.assertEqual(headers["Location"], "/")
        self.assertIn("HttpOnly", headers["Set-Cookie"])
        self.assertIn("SameSite=Strict", headers["Set-Cookie"])
        self.assertEqual(body, b"")
        self.assertEqual(self.call("GET", "/api/bootstrap", authenticated=False)[0], 401)

    def test_bootstrap_public_metadata_only(self):
        status, headers, body = self.call("GET", "/api/bootstrap")
        self.assertEqual(status, 200)
        parsed = json.loads(body)
        self.assertEqual(parsed["csrfToken"], self.app.csrf)
        self.assertNotIn(self.app.token, body.decode())
        self.assertNotIn("apiKey", body.decode())
        self.assertEqual(headers["Cache-Control"], "no-store")
        self.app.providers.complete.assert_not_called()

    def test_host_cross_site_and_missing_csrf_rejected(self):
        self.assertEqual(self.call("GET", "/api/bootstrap", headers={"Host": "attacker.example"})[0], 403)
        self.assertEqual(self.call("POST", "/api/refresh", {}, csrf=True, headers={"Origin": "https://attacker.example"})[0], 403)
        self.assertEqual(self.call("POST", "/api/refresh", {})[0], 403)
        self.assertEqual(self.call("POST", "/api/refresh", {}, csrf=True, headers={"Origin": f"http://127.0.0.1:{self.port}"})[0], 200)

    def test_normal_and_suffix_ranges(self):
        for value, expected, content_range in [("bytes=2-4", b"234", "bytes 2-4/10"), ("bytes=-3", b"789", "bytes 7-9/10"), ("bytes=7-", b"789", "bytes 7-9/10"), ("bytes=-99", b"0123456789", "bytes 0-9/10")]:
            with self.subTest(value=value):
                status, headers, body = self.call("GET", "/api/media/" + self.media_id, headers={"Range": value})
                self.assertEqual(status, 206)
                self.assertEqual(body, expected)
                self.assertEqual(headers["Content-Range"], content_range)
                self.assertEqual(int(headers["Content-Length"]), len(body))

    def test_unsatisfiable_and_multiple_ranges(self):
        for value in ("bytes=10-", "bytes=8-2", "bytes=-0", "bytes=", "bytes=0-2,4-6"):
            with self.subTest(value=value):
                status, headers, body = self.call("GET", "/api/media/" + self.media_id, headers={"Range": value})
                self.assertEqual(status, 416)
                self.assertEqual(headers["Content-Range"], "bytes */10")
                self.assertEqual(body, b"")

    def test_head_range_reports_length_without_body(self):
        status, headers, body = self.call("HEAD", "/api/media/" + self.media_id, headers={"Range": "bytes=-3"})
        self.assertEqual(status, 206)
        self.assertEqual(headers["Content-Length"], "3")
        self.assertEqual(body, b"")

    def test_web_traversal_and_forged_media_outside_project_rejected(self):
        self.assertEqual(self.call("GET", "/%2e%2e/private.txt")[0], 404)
        outside = self.root / "outside.mp4"
        outside.write_bytes(b"not-project")
        self.app.media_index["forged"] = {"id": "forged", "projectId": self.project["id"], "path": str(outside)}
        status, _, body = self.call("GET", "/api/media/forged")
        self.assertEqual(status, 400)
        self.assertNotIn(b"not-project", body)

    def test_create_project_returns_discoverable_project(self):
        status, _, body = self.call("POST", "/api/projects", {"name": "新作品"}, csrf=True)
        self.assertEqual(status, 201, body.decode())
        result = json.loads(body)
        self.assertEqual(result["name"], "新作品")
        self.assertEqual(self.app.library.project(result["id"])["name"], "新作品")

    def test_invalid_project_name_no_mutation(self):
        original = set(self.videos.iterdir())
        for name in ("../escape", ".hidden", "NUL", "bad/name"):
            self.assertEqual(self.call("POST", "/api/projects", {"name": name}, csrf=True)[0], 400)
        self.assertEqual(set(self.videos.iterdir()), original)

    def test_static_assets_never_use_stale_browser_cache(self):
        asset = self.resources / "web/app.js"
        asset.write_text("const version = 1;")
        status, headers, body = self.call("GET", "/app.js")
        self.assertEqual(status, 200)
        self.assertEqual(headers["Cache-Control"], "no-store")
        asset.write_text("const version = 2;")
        _, second_headers, second_body = self.call("GET", "/app.js")
        self.assertEqual(second_headers["Cache-Control"], "no-store")
        self.assertIn(b"version = 2", second_body)
        self.assertNotEqual(body, second_body)
        self.assertEqual(self.call("GET", "/")[1]["Cache-Control"], "no-store")

    def test_same_path_media_replacement_changes_url_from_actual_stat(self):
        endpoint = "/api/projects/" + self.project["id"] + "/media"
        first = json.loads(self.call("GET", endpoint)[2])["items"][0]
        old_stat = self.media.stat()
        self.media.write_bytes(b"abcdefghij")  # Same size intentionally.
        os.utime(self.media, ns=(old_stat.st_atime_ns, old_stat.st_mtime_ns + 2_000_000_000))
        second = json.loads(self.call("GET", endpoint)[2])["items"][0]
        self.assertEqual(first["id"], second["id"])
        self.assertNotEqual(first["url"], second["url"])
        self.assertTrue(second["url"].endswith(str(self.media.stat().st_mtime_ns) + "-10"))
        status, _, actual = self.call("GET", second["url"], headers={"Range": "bytes=-3"})
        self.assertEqual(status, 206)
        self.assertEqual(actual, b"hij")

    def test_refresh_discovers_new_media_without_cache_expiry(self):
        endpoint = "/api/projects/" + self.project["id"] + "/media"
        self.call("GET", endpoint)
        (self.media.parent / "episode_v2_final.mp4").write_bytes(b"new-render")
        refreshed = json.loads(self.call("GET", endpoint + "?refresh=1")[2])
        self.assertEqual({i["name"] for i in refreshed["items"]}, {"episode_v2_final.mp4"})
        history=json.loads(self.call("GET",endpoint+"?scope=history")[2])
        self.assertEqual({i["name"] for i in history["items"]}, {"episode_v1_final.mp4"})
        (self.media.parent / "episode_v3_final.mp4").write_bytes(b"latest-render")
        bootstrap = json.loads(self.call("GET", "/api/bootstrap")[2])
        self.assertEqual(bootstrap["projects"][0]["latestVideo"]["name"], "episode_v3_final.mp4")

    def test_refresh_callback_hands_request_to_new_handler_once(self):
        visited = []
        class UpdatedHandler(Handler):
            def do_GET(self):
                visited.append(self.path)
                return super().do_GET()
        def reload():
            self.server.RequestHandlerClass = UpdatedHandler
            return {"status": "updated", "revision": "source-revision-2"}
        callback = mock.Mock(side_effect=reload)
        self.server.reload_callback = callback
        status, _, body = self.call("GET", "/api/bootstrap")
        self.assertEqual(status, 200)
        self.assertEqual(visited, ["/api/bootstrap"])
        callback.assert_called_once_with()
        self.assertEqual(json.loads(body)["runtime"]["reload"]["revision"], "source-revision-2")
        self.assertIs(self.server.RequestHandlerClass, UpdatedHandler)

    def test_post_reload_authenticates_then_hands_body_once(self):
        handed = []
        class UpdatedHandler(Handler):
            def get_body(self):
                value = super().get_body()
                handed.append(value)
                return value
        def reload():
            self.server.RequestHandlerClass = UpdatedHandler
            return {"status": "updated", "revision": "post-v2"}
        callback = mock.Mock(side_effect=reload)
        self.server.reload_callback = callback
        self.assertEqual(self.call("POST", "/api/refresh", {"proof": 1})[0], 403)
        callback.assert_not_called()
        status, _, body = self.call("POST", "/api/refresh", {"proof": 2}, csrf=True)
        self.assertEqual(status, 200)
        callback.assert_called_once_with()
        self.assertEqual(handed, [{"proof": 2}])
        self.assertEqual(json.loads(body)["runtime"]["reload"]["revision"], "post-v2")

    def test_reload_failure_keeps_previous_app_and_reports_error(self):
        previous_app = self.app
        class UnusableHandler(Handler):
            pass
        def broken():
            self.server.app = object()
            self.server.RequestHandlerClass = UnusableHandler
            raise ValueError("bad updated module")
        self.server.reload_callback = broken
        status, _, body = self.call("GET", "/api/bootstrap")
        self.assertEqual(status, 200)
        self.assertIs(self.server.app, previous_app)
        self.assertIs(self.server.RequestHandlerClass, Handler)
        self.assertEqual(json.loads(body)["runtime"]["reload"]["status"], "error")
        self.assertIn("bad updated module", json.loads(body)["runtime"]["reload"]["error"])

    def test_keepalive_reloads_on_each_new_request_not_only_first(self):
        callback = mock.Mock(return_value={"status": "unchanged", "revision": "same"})
        self.server.reload_callback = callback
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=4)
        try:
            for _ in range(2):
                conn.request("GET", "/api/bootstrap", headers={"Cookie": "rainbow_session=" + self.app.token})
                response = conn.getresponse()
                self.assertEqual(response.status, 200)
                response.read()
        finally:
            conn.close()
        self.assertEqual(callback.call_count, 2)

    def test_start_is_guarded_by_lifecycle_lock(self):
        class LockProbe:
            entered = False
            def __enter__(probe):
                probe.entered = True
            def __exit__(probe, *_):
                probe.entered = False
        guard = LockProbe()
        self.server.lifecycle_lock = guard
        def start(body):
            self.assertTrue(guard.entered)
            return {"id": "local-test"}
        self.app.runs.start = mock.Mock(side_effect=start)
        status, _, body = self.call("POST", "/api/runs", {"projectId": self.project["id"], "prompt": "test"}, csrf=True)
        self.assertEqual(status, 202)
        self.assertEqual(json.loads(body)["id"], "local-test")
        self.assertFalse(guard.entered)

    def test_provider_probe_reserves_under_lifecycle_but_releases_before_network(self):
        class LockProbe:
            entered = False
            def __enter__(probe):
                probe.entered = True
            def __exit__(probe, *_):
                probe.entered = False
        guard = LockProbe()
        self.server.lifecycle_lock = guard
        def complete(*args, **kwargs):
            self.assertFalse(guard.entered)
            self.assertTrue(self.app.check_locks["openai"].locked())
            return {"text": "WORKBENCH_OK", "model": "mock", "usage": {}}
        self.app.providers.complete.side_effect = complete
        status, _, body = self.call("POST", "/api/providers/openai/check", {}, csrf=True)
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["ok"])
        self.assertFalse(self.app.check_locks["openai"].locked())


if __name__ == "__main__":
    unittest.main()
