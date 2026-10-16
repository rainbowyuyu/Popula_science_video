"""Import visible Codex conversations without starting model workers or providers."""
import json
from pathlib import Path
import sys
import threading
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from app.library import Library
from app.project_memory import ProjectMemory
from app.studio import Studio


def main():
    app = SimpleNamespace(video_root=ROOT.parent, state_root=ROOT / 'work')
    app.library = Library(app.video_root)
    app.studio = Studio(app)
    # Load only already-finished user-visible runs. Do not instantiate RunManager
    # or modify live task state/checkpoints while a legacy server is still active.
    runs = {}
    for path in (app.state_root / 'runs').glob('*/run.json'):
        try:
            value = json.loads(path.read_text(encoding='utf8'))
            if value.get('status') not in {'queued', 'running', 'cancelling'}:
                runs[value['id']] = {k: value.get(k) for k in ('id','projectId','status','prompt','response','phases','createdAt')}
        except (OSError, ValueError, KeyError):
            pass
    app.runs = SimpleNamespace(lock=threading.RLock(), runs=runs)
    memory = ProjectMemory(app)
    print('Reading local visible Codex records in background; no provider calls.', flush=True)
    result = memory.sync_now()
    projects = [{'project': Path(p['path']).name, 'projectId': p['id'], **memory.overview(p['id'])} for p in memory.projects()]
    report = {'sync': result, 'projects': projects, 'database': str(memory.path)}
    target = ROOT / 'output' / 'codex-memory-import.json'
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(report, ensure_ascii=True), flush=True)
    if result['status'] != 'completed':
        raise SystemExit(1)


if __name__ == '__main__':
    main()
