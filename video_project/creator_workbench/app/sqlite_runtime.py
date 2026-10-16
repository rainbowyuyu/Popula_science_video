"""Load SQLite from the external runtime when an older stable EXE omits it."""
from pathlib import Path
import importlib
import os
import sys


def load_sqlite():
    try:
        return importlib.import_module('sqlite3')
    except ModuleNotFoundError as exc:
        if exc.name not in {'sqlite3', '_sqlite3'}:
            raise
    root = Path(__file__).resolve().parents[1] / 'runtime_deps' / ('py' + str(sys.version_info.major) + str(sys.version_info.minor))
    if not (root / 'sqlite3' / '__init__.py').is_file():
        raise RuntimeError('本地SQLite运行库缺失，请运行 scripts/prepare_sqlite_runtime.py；无需重编译EXE')
    # Only the narrowly scoped, local dependency directory is added. No user
    # configuration, credentials or other project's packages are imported.
    if hasattr(os, 'add_dll_directory'):
        _DLL_HANDLES.append(os.add_dll_directory(str(root)))
    sys.path.insert(0, str(root))
    try:
        for name in ('sqlite3', 'sqlite3.dbapi2'):
            sys.modules.pop(name, None)
        return importlib.import_module('sqlite3')
    finally:
        sys.path.remove(str(root))


_DLL_HANDLES = []
sqlite3 = load_sqlite()
