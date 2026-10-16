from pathlib import Path
import json,hashlib
R=Path(__file__).resolve().parents[1]
assert (R/'delivery/technical-qa.json').exists()
p=Path('C:/Users/zju/.codex/skills/rainbow-science-short/references/music-history.json')
d=json.loads(p.read_text('utf8'))
title='深海回路 / Deepwater Circuit'
row=dict(video='AI Engineer / BESO research introduction 2026-10',title=title,artist='Original arrangement for this film; VSCO 2 CE CC0 instrument samples',sha256=hashlib.sha256((R/'public/audio/music.wav').read_bytes()).hexdigest(),status='used in delivered film',source='https://github.com/sgossner/VSCO-2-CE',license='CC0-1.0 samples; new arrangement',composition='106 BPM / 6-8 / seed 2026101016',project=str(R))
d['records']=[r for r in d['records'] if not(r.get('title')==title and r.get('video')==row['video'])]+[row]
p.write_text(json.dumps(d,ensure_ascii=False,indent=2),'utf8')
print('Music registered for this film only.')
