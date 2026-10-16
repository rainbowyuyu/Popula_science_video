"""Stable EXE bootstrap for versioned, external Python source (no stale bytecode)."""
from __future__ import annotations

import hashlib
import importlib
import importlib.abc
import importlib.util
from http.server import BaseHTTPRequestHandler
from pathlib import Path
import sys
import threading
import uuid


REQUIRED = ('app/server.py', 'app/harness.py', 'app/library.py', 'app/providers.py', 'web/index.html')


def resource_root(video_root: Path, bundled_root: Path) -> tuple[Path, str]:
    external = video_root.resolve() / 'creator_workbench'
    if all((external / name).is_file() for name in REQUIRED):
        return external, 'external'
    return bundled_root.resolve(), 'bundled'


def read_snapshot(root: Path):
    source = {}
    digest = hashlib.sha256()
    for path in sorted((root / 'app').rglob('*.py')):
        relative = path.relative_to(root / 'app').as_posix()
        if '__pycache__' in path.parts:
            continue
        data = path.read_bytes()
        # Validate all changed files before importing any new runtime.
        compile(data, str(path), 'exec')
        source[relative] = data
        digest.update(relative.encode('utf8') + b'\0' + data + b'\0')
    if 'server.py' not in source:
        raise RuntimeError('外部工作台缺少 app/server.py')
    return digest.hexdigest(), source


class SnapshotModules(importlib.abc.MetaPathFinder, importlib.abc.Loader):
    def __init__(self, root, revision, files):
        self.root, self.files = root, files
        self.prefix = '_rainbow_runtime_' + revision[:16] + '_' + uuid.uuid4().hex[:12]

    def locate(self, fullname):
        if fullname == self.prefix:
            return '__init__.py', True
        if not fullname.startswith(self.prefix + '.'):
            return None
        relative = fullname[len(self.prefix) + 1:].replace('.', '/')
        if relative + '/__init__.py' in self.files:
            return relative + '/__init__.py', True
        if relative + '.py' in self.files:
            return relative + '.py', False
        return None

    def find_spec(self, fullname, path=None, target=None):
        found = self.locate(fullname)
        if found is None:
            return None
        relative, package = found
        spec = importlib.util.spec_from_loader(fullname, self, is_package=package)
        spec.origin = str(self.root / 'app' / relative)
        spec.has_location = True
        if package:
            spec.submodule_search_locations = [str((self.root / 'app' / relative).parent)]
        return spec

    def create_module(self, spec):
        return None

    def exec_module(self, module):
        relative, _ = self.locate(module.__name__)
        exec(compile(self.files.get(relative, b''), module.__file__, 'exec'), module.__dict__)

    def load(self):
        sys.meta_path.insert(0, self)
        try:
            return importlib.import_module(self.prefix + '.server')
        except Exception:
            self.dispose()
            raise

    def dispose(self):
        if self in sys.meta_path:
            sys.meta_path.remove(self)
        for name in list(sys.modules):
            if name == self.prefix or name.startswith(self.prefix + '.'):
                sys.modules.pop(name, None)


class ReloadController:
    def __init__(self, video_root, state_root, resource, mode):
        self.video_root, self.state_root, self.resource = video_root, state_root, resource
        self.mode = mode
        self.lock = threading.RLock()
        self.loader = None
        self.revision = 'bundled'
        if mode == 'external':
            self.revision, files = read_snapshot(resource)
            self.loader = SnapshotModules(resource, self.revision, files)
            self.module = self.loader.load()
        else:
            # Explicit imports also preserve the complete offline fallback in PyInstaller.
            from app import server
            self.module = server
        self.app = self.module.Workbench(video_root, state_root, resource)
        self.server = None
        self.app.runtime_status = self.status('ready')

    def status(self, status, message=None):
        return {'mode': self.mode, 'status': status, 'revision': self.revision,
                'message': message or ('已加载外部工作台；刷新即可更新' if self.mode == 'external' else '使用内置备用版本')}

    def bind(self, port):
        self.server = self.module.create_server(self.app, port)
        self.server.lifecycle_lock = self.lock
        self.server.reload_callback = self.reload
        return self.server

    def reload(self):
        with self.lock:
            if self.mode != 'external':
                return self.status('ready')
            candidate = None
            try:
                revision, files = read_snapshot(self.resource)
                if revision == self.revision:
                    result = self.status('ready')
                    self.app.runtime_status = result
                    return result
                with self.app.runs.lock:
                    active = any(run['status'] in {'queued', 'running', 'cancelling'} for run in self.app.runs.runs.values())
                checking = any(lock.locked() for lock in self.app.check_locks.values())
                if active or checking:
                    result = self.status('deferred', '代码已更新；当前任务完成后刷新即可加载，任务不会中断')
                    self.app.runtime_status = result
                    return result
                candidate = SnapshotModules(self.resource, revision, files)
                module = candidate.load()
                handler = module.Handler
                if not isinstance(handler, type) or not issubclass(handler, BaseHTTPRequestHandler):
                    raise TypeError('Handler must be an HTTP request handler')
                app = module.Workbench(self.video_root, self.state_root, self.resource)
                app.token, app.csrf = self.app.token, self.app.csrf
                app.checks = self.app.checks.copy()
                previous = self.loader
                self.module, self.app, self.loader, self.revision = module, app, candidate, revision
                self.server.app = app
                self.server.RequestHandlerClass = handler
                result = self.status('updated', '已加载最新工作台代码，无需重编译 EXE')
                app.runtime_status = result
                if previous:
                    previous.dispose()
                return result
            except Exception as error:
                if candidate:
                    candidate.dispose()
                # Never replace a working service with incomplete edits.
                detail = str(error) if isinstance(error, SyntaxError) else type(error).__name__
                result = self.status('error', '更新尚未完成，继续使用上一版：' + detail[:300])
                self.app.runtime_status = result
                return result
