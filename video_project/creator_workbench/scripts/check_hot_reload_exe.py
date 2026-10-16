"""Exercise the shipped EXE against an isolated external-source fixture.

No model requests are made. The normal workbench and its runtime state are never
touched. Only a unique work fixture and the public verification report are written.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import http.client
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time
import uuid


ROOT = Path(__file__).resolve().parents[1]


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--exe", type=Path, default=ROOT / "output/RainbowVideoWorkbench.exe")
    args = parser.parse_args()
    executable = args.exe.resolve()
    if not executable.is_file():
        raise SystemExit("Build the workbench EXE before running this verification.")
    suffix = dt.datetime.now().strftime("%Y%m%d-%H%M%S") + "-" + uuid.uuid4().hex[:6]
    fixture = ROOT / "work" / ("hot-reload-fixture-" + suffix)
    video_root = fixture / "video_project"
    external = video_root / "creator_workbench"
    external.mkdir(parents=True)
    for name in ("app", "web", "skills"):
        shutil.copytree(ROOT / name, external / name, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))
    episode = video_root / "verification-episode"
    episode.mkdir()
    (episode / "project.json").write_text('{"name":"Hot reload fixture"}', encoding="utf-8")
    state_file = external / "work/runtime.json"
    report = {"ok": False, "fixture": str(fixture), "executable": str(executable),
              "exeSha256Before": digest(executable), "checks": {}, "apiGenerationCalls": 0,
              "startedAt": dt.datetime.now(dt.timezone.utc).isoformat()}
    process = None
    connection = None
    cookie = ""
    csrf = ""
    shutdown_ok = False

    def call(method, path, body=None):
        headers = {"Cookie": cookie}
        encoded = None
        if body is not None:
            encoded = json.dumps(body).encode()
            headers.update({"Content-Type": "application/json", "X-CSRF-Token": csrf})
        connection.request(method, path, body=encoded, headers=headers)
        response = connection.getresponse()
        return response.status, dict(response.getheaders()), response.read()

    def bootstrap():
        status, _, data = call("GET", "/api/bootstrap")
        if status != 200:
            raise AssertionError("Fixture bootstrap returned HTTP " + str(status))
        return json.loads(data)

    def require(condition, name):
        report["checks"][name] = bool(condition)
        if not condition:
            raise AssertionError("Verification failed: " + name)

    def set_version(source: str, version: str) -> str:
        updated, count = re.subn(r"(?m)^VERSION\s*=\s*(['\"])[^'\"]+\1\s*$", "VERSION=" + repr(version), source, count=1)
        if count != 1:
            raise AssertionError("Fixture server VERSION assignment was not found")
        return updated

    try:
        process = subprocess.Popen([str(executable), "--video-root", str(video_root), "--no-reuse", "--port", "0", "--no-browser"],
                                   cwd=fixture, creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
                                   stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        deadline = time.monotonic() + 40
        saved = None
        while time.monotonic() < deadline:
            if process.poll() is not None:
                raise AssertionError("Fixture EXE exited before its runtime became ready")
            try:
                saved = json.loads(state_file.read_text(encoding="utf-8"))
                break
            except (OSError, ValueError):
                time.sleep(0.15)
        if saved is None:
            raise AssertionError("Fixture startup timed out")
        original_pid, original_token = saved["pid"], saved["token"]
        report["fixtureServerPid"] = original_pid
        report["fixturePort"] = int(saved["port"])
        require(saved.get("sourceMode") == "external", "external_source_selected")
        connection = http.client.HTTPConnection("127.0.0.1", saved["port"], timeout=25)
        status, headers, _ = call("GET", "/?launch=" + original_token)
        require(status == 303 and "HttpOnly" in headers.get("Set-Cookie", ""), "launch_cookie_authenticated")
        cookie = headers["Set-Cookie"].split(";", 1)[0]
        initial = bootstrap()
        csrf = initial["csrfToken"]
        initial_revision = initial["runtime"]["reload"]["revision"]
        require(initial["runtime"]["reload"]["mode"] == "external", "bootstrap_external_runtime")

        html_path = external / "web/index.html"
        marker = "hot-reload-html-" + suffix
        html_path.write_text(html_path.read_text(encoding="utf-8") + "\n<!-- " + marker + " -->\n", encoding="utf-8")
        status, headers, html = call("GET", "/")
        require(status == 200 and marker.encode() in html, "html_changes_without_rebuild")
        require(headers.get("Cache-Control") == "no-store", "html_cache_disabled")

        server_path = external / "app/server.py"
        original_source = server_path.read_text(encoding="utf-8")
        first_version = "hot-reload-proof-1"
        valid_source = set_version(original_source, first_version)
        server_path.write_text(valid_source, encoding="utf-8")
        updated = bootstrap()
        require(updated["version"] == first_version, "python_changes_without_rebuild")
        require(updated["runtime"]["reload"]["revision"] != initial_revision, "source_revision_changed")
        require(updated["csrfToken"] == csrf, "csrf_survives_handler_replacement")
        report["firstUpdatedRevision"] = updated["runtime"]["reload"]["revision"]

        server_path.write_text(valid_source + "\ndef hot_reload_broken(:\n", encoding="utf-8")
        failed = bootstrap()
        require(failed["runtime"]["reload"]["status"] == "error", "syntax_error_reported")
        require(failed["version"] == first_version, "syntax_error_preserves_previous_runtime")
        require(failed["csrfToken"] == csrf, "syntax_error_preserves_session")

        second_version = "hot-reload-proof-2"
        server_path.write_text(set_version(original_source, second_version), encoding="utf-8")
        status, _, data = call("POST", "/api/refresh", {})
        recovered = json.loads(data)
        require(status == 200 and recovered.get("version") == second_version, "fixed_source_recovers_through_refresh")
        require(recovered["runtime"]["reload"]["status"] != "error", "recovery_clears_reload_error")
        current_state = json.loads(state_file.read_text(encoding="utf-8"))
        require(current_state["pid"] == original_pid, "server_pid_unchanged")
        require(current_state["token"] == original_token, "session_token_unchanged")
        require(process.poll() is None, "same_exe_process_still_running")
        report["exeSha256After"] = digest(executable)
        require(report["exeSha256Before"] == report["exeSha256After"], "executable_unchanged")
        report["ok"] = True
    except Exception as exc:
        # Do not serialize runtime.json, response bodies, launch URLs or cookies.
        report["error"] = type(exc).__name__ + ": " + str(exc)[:350]
    finally:
        if connection is not None and csrf:
            try:
                status, _, _ = call("POST", "/api/shutdown", {})
                shutdown_ok = status == 200
            except Exception:
                pass
        if connection is not None:
            connection.close()
        if process is not None:
            try:
                process.wait(timeout=12)
            except subprocess.TimeoutExpired:
                # The PID is the isolated fixture we just created, never the
                # user's normal workbench process or its configured port.
                if os.name == "nt":
                    subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True,
                                   creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
                else:
                    process.terminate()
                process.wait(timeout=10)
        report["fixtureShutdownAccepted"] = shutdown_ok
        report["fixtureStopped"] = process is None or process.poll() is not None
        report["completedAt"] = dt.datetime.now(dt.timezone.utc).isoformat()
        output = ROOT / "output/hot-reload-verification.json"
        output.parent.mkdir(exist_ok=True)
        output.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"ok": report["ok"], "checks": report["checks"], "report": str(output),
                          "fixtureStopped": report["fixtureStopped"], "error": report.get("error")}, ensure_ascii=True))
    return 0 if report["ok"] and report["fixtureStopped"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
