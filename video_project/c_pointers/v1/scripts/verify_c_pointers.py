"""Compile and run the film's teaching examples without undefined behavior."""
from pathlib import Path
import hashlib
import json
import os
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'research' / 'c-proof'
OUT.mkdir(parents=True, exist_ok=True)
SRC = ROOT / 'scripts' / 'verify_c_pointers.c'
VCVARS = Path(r'D:\visual studio\VC\Auxiliary\Build\vcvars64.bat')
COMPILER = Path(r'D:\visual studio\VC\Tools\MSVC\14.50.35717\bin\Hostx64\x64\cl.exe')
EXE = OUT / 'pointers.exe'
OBJ = OUT / 'pointers.obj'

command = f'call "{VCVARS}" >nul && "{COMPILER}" /nologo /std:c17 /W4 /WX /O2 /Fe:"{EXE}" /Fo:"{OBJ}" "{SRC}"'
compiled = subprocess.run(command, shell=True, executable=os.environ.get('COMSPEC', 'cmd.exe'), cwd=ROOT, capture_output=True)
compile_text = (compiled.stdout + compiled.stderr).decode('utf-8', errors='replace')
(OUT / 'compile.log').write_text(compile_text, encoding='utf-8')
if compiled.returncode:
    raise SystemExit(compile_text)
run = subprocess.run([str(EXE)], cwd=ROOT, capture_output=True, text=True, check=True)
(OUT / 'run.json').write_text(run.stdout, encoding='utf-8')
result = json.loads(run.stdout)
assert result['all_assertions_passed'] is True
assert result['unsafe_dereferences_executed'] is False
metadata = {
    'dateLocal': time.strftime('%Y-%m-%d'),
    'compiler': str(COMPILER),
    'languageMode': 'C17',
    'compileFlags': ['/std:c17', '/W4', '/WX', '/O2'],
    'compileReturnCode': compiled.returncode,
    'runReturnCode': run.returncode,
    'sourceSha256': hashlib.sha256(SRC.read_bytes()).hexdigest(),
    'executableSha256': hashlib.sha256(EXE.read_bytes()).hexdigest(),
    'runSha256': hashlib.sha256(run.stdout.encode()).hexdigest(),
    'results': result,
    'limits': [
        'Memory addresses are a measured example from one process and may change on every run.',
        'sizeof(int) is implementation-dependent; measured 4 bytes is not a C-language universal guarantee.',
        'Film addresses such as 0x1000 are explicitly illustrative and are never dereferenced by this program.',
        'No null, expired-lifetime, or out-of-range pointer is dereferenced; the one-past pointer is used only for a valid distance check.'
    ]
}
(OUT / 'evidence.json').write_text(json.dumps(metadata, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print(json.dumps(result, indent=2))
