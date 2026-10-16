"""Save exact local render dependencies, never traverse the shared node_modules."""
from pathlib import Path
import hashlib,json
R=Path(__file__).resolve().parents[1]
paths=sorted([p for folder in ['src','public'] for p in (R/folder).rglob('*') if p.is_file()]+[R/'package-lock.json',R/'package.json',R/'tsconfig.json',R/'scripts/render.mjs'])
rows=[{'path':p.relative_to(R).as_posix(),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in paths]
(R/'work/qa').mkdir(parents=True,exist_ok=True)
(R/'work/qa/render-inputs.json').write_text(json.dumps({'version':'v05','inputs':rows},indent=2),encoding='utf8')
print('Frozen',len(rows),'render inputs.')
