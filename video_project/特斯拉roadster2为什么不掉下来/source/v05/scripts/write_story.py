"""Story is curated in src/story.json; do not overwrite it with a legacy template."""
from pathlib import Path
import json
p=Path(__file__).resolve().parents[1]/'src/story.json'
d=json.loads(p.read_text(encoding='utf8'))
assert len(d['cues'])==30
print('Validated curated V05 story:',len(d['cues']),'cues')
