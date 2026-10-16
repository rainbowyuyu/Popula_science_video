from pathlib import Path
p=Path('scripts/build_audio_measured.py')
s=p.read_text(encoding='utf8').replace('v01','v02').replace('chemistry2026/timeline','chemistry2026v02/timeline')
s=s.replace("def spoken(t):return t.replace('Henri B. Kagan','Henri B Kagan')", "def spoken(t):return t\ndef reading(row):return row.get('ttsText',row['spoken'])")
s=s.replace("'text':spoken(row['spoken'])", "'text':reading(row)")
s=s.replace("spoken(r['spoken'])", "reading(r)")
s=s.replace("params={'temperature':.42,", "params={'temperature':row.get('ttsTemperature',.42),")
s=s.replace("'parameters':params}\n return spec", "'parameters':params}\n return spec")
s=s.replace("if not args.skip_generate:generate(rows", "carry_unchanged(rows)\n if not args.skip_generate:generate(rows")
p=Path('scripts/build_audio_v02.py');p.write_text(s,encoding='utf8')
# Skeleton is not generated until research and pronunciation choices are locked.
import json,re
src=json.loads(Path('docs/v01/narration-v01.json').read_text('utf8'));src['version']='nobel-chemistry-2026-v02-draft';src['pauseSeconds']=.5
for r in src['clips']:
 r['displayText']=r['spoken'];r['ttsText']=r['spoken'];r['sourceVersion']='V01';r['ttsPronunciationMap']=[]
Path('docs/v02').mkdir(parents=True,exist_ok=True);Path('docs/v02/narration-v02.json').write_text(json.dumps(src,ensure_ascii=False,indent=2),encoding='utf8')
