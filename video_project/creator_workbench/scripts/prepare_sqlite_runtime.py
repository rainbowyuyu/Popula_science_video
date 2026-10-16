"""Copy the installed Python's SQLite runtime alongside the refreshable app."""
from pathlib import Path
import hashlib
import json
import shutil
import sqlite3
import _sqlite3
import sys

root = Path(__file__).resolve().parents[1]
target = root / 'runtime_deps' / f'py{sys.version_info.major}{sys.version_info.minor}'
package = Path(sqlite3.__file__).parent
extension = Path(_sqlite3.__file__)
target.mkdir(parents=True, exist_ok=True)
(target / 'sqlite3').mkdir(exist_ok=True)
sources = [(source, target / 'sqlite3' / source.name) for source in package.glob('*.py')]
sources.append((extension, target / extension.name))
dll = extension.parent / 'sqlite3.dll'
if dll.exists():
    sources.append((dll, target / dll.name))
license_file = Path(sys.base_prefix) / 'LICENSE.txt'
if license_file.exists():
    sources.append((license_file, target / 'PYTHON-LICENSE.txt'))
records = []
for source, dest in sources:
    shutil.copy2(source, dest)
    records.append({'file': dest.relative_to(target).as_posix(), 'source': str(source), 'sha256': hashlib.sha256(dest.read_bytes()).hexdigest()})
(target / 'manifest.json').write_text(json.dumps({'python': sys.version, 'sqlite': sqlite3.sqlite_version, 'files': records}, ensure_ascii=False, indent=2), encoding='utf8')
print('Prepared external SQLite runtime:', str(target))
