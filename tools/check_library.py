"""Validate the curated Git index without rendering or making model calls."""
from pathlib import Path
import json
import re
import subprocess
import sys
from urllib.parse import unquote

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from assets import load_manifest


def main():
    result = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, capture_output=True, check=True)
    names = result.stdout.decode('utf-8').strip('\0').split('\0')
    errors = []
    projects = sorted((ROOT / 'video_project').glob('*/project.json'))
    for file in projects:
        try:
            meta = json.loads(file.read_text(encoding='utf-8-sig'))
            if meta['id'] != file.parent.name: errors.append(f'{file.parent.name}: id mismatch')
            if not (file.parent/'README.md').is_file(): errors.append(f'{file.parent.name}: missing guide')
            for entry in meta['entrypoints']:
                if not (file.parent / entry).is_file(): errors.append(f'{meta["id"]}: missing entry {entry}')
            load_manifest(ROOT, meta['id'])
        except (ValueError, KeyError, OSError) as exc:
            errors.append(f'{file.relative_to(ROOT)}: invalid metadata ({type(exc).__name__})')
    secret = re.compile(r'\b(?:sk-[A-Za-z0-9_.-]{24,}|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,})')
    max_size = 0
    for name in filter(None, names):
        p = ROOT / name
        parts = Path(name).parts
        if any(part in {'.studio', 'node_modules', '__pycache__', '.git'} for part in parts): errors.append(f'{name}: runtime/cache in Git')
        if name.startswith(('video_project/ai_evolution', 'video_project/ai_revolution', 'video_project/publication_2026-09-23')): errors.append(f'{name}: excluded series')
        if p.suffix.lower() in {'.mp4','.wav','.mp3','.exe','.pem','.key','.db','.sqlite'}: errors.append(f'{name}: payload/credential in Git')
        if not p.is_file(): continue
        size = p.stat().st_size; max_size = max(max_size, size)
        if size > 50*1024**2: errors.append(f'{name}: larger than repository policy')
        try: text = p.read_text(encoding='utf-8-sig')
        except (UnicodeError, OSError): continue
        matches = secret.findall(text)
        if any(not any(tag in m.lower() for tag in ['sk-test-', 'sk-example-', 'sk-dummy-', 'sk-placeholder-']) for m in matches): errors.append(f'{name}: credential-like content')
    guides = [ROOT/'README.md', *[ROOT/'docs'/x for x in ['QUICKSTART.md','PROJECTS.md','PROJECT_STRUCTURE.md','ASSETS.md','CONTRIBUTING.md','PORTABILITY.md','RIGHTS.md','VALIDATION.md']]]
    for doc in guides:
        if not doc.exists(): errors.append(f'{doc.relative_to(ROOT)}: missing guide'); continue
        text = doc.read_text(encoding='utf-8')
        if text.count('```') % 2: errors.append(f'{doc.relative_to(ROOT)}: unclosed code fence')
        for target in re.findall(r'\]\(([^)]+)\)', text):
            target = unquote(target.split('#')[0])
            if not target or re.match(r'(?:https?:|mailto:)', target): continue
            if not (doc.parent/target).exists(): errors.append(f'{doc.relative_to(ROOT)}: broken link {target}')
    summary = {'projects':len(projects),'trackedFiles':len([n for n in names if n]),'largestFileMiB':round(max_size/1048576,2),'errors':errors}
    print(json.dumps(summary,ensure_ascii=False,indent=2))
    return int(bool(errors))


if __name__ == '__main__': raise SystemExit(main())
