from pathlib import Path
p=Path('scripts/generate_audio.py');s=p.read_text(encoding='utf8').replace("tl={'fps':fps", "tl={'timeUnit':'seconds','fps':fps");p.write_text(s,encoding='utf8')
for p in [Path('src/timeline.json'),Path('research/audio/timeline-audio.json')]:
 import json
 d=json.loads(p.read_text(encoding='utf8'));d['timeUnit']='seconds';p.write_text(json.dumps(d,ensure_ascii=False,indent=2),encoding='utf8')
