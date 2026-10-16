from pathlib import Path
import json,hashlib,shutil,os
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
manifest=ROOT/'research/revision-v5/lemon-audio-repair/candidate-install-manifest.json'
m=json.loads(manifest.read_text('utf8'))
assert m['readyForParentInstallation'] and m['frames']==25621
old=json.loads((ROOT/'src/timeline.json').read_text('utf8'));new=json.loads((ROOT/'research/revision-v5/lemon-audio-repair/timeline.json').read_text('utf8'))
assert old['duration']==new['duration']==25621
assert old['clips'][1:]==new['clips'][1:]
assert [c for c in old['captions'] if c['clipId']!='h001']==[c for c in new['captions'] if c['clipId']!='h001']
for row in m['files']:
 p=(ROOT/row['source']).resolve();assert p.is_relative_to(ROOT) and sha(p)==row['sha256']
for row in m['files']:
 p=(ROOT/row['source']).resolve();dest=(ROOT/row['destination']).resolve();assert dest.is_relative_to(ROOT)
 backup=ROOT/'research/revision-v6/audio-before'/row['destination']
 if dest.exists():
  backup.parent.mkdir(parents=True,exist_ok=True)
  if backup.exists():assert sha(backup)==sha(dest)
  else:shutil.copy2(dest,backup)
 stage=dest.with_name(dest.name+'.v6-install');shutil.copy2(p,stage);assert sha(stage)==row['sha256'];os.replace(stage,dest)
for row in m['files']:assert sha(ROOT/row['destination'])==row['sha256']
out={**m,'installed':True,'installedUTC':datetime.now(timezone.utc).isoformat(),'candidateManifestSHA256':sha(manifest),'backups':'research/revision-v6/audio-before','reviewScope':'Narrative read and exact timing / ASR / sound-level measurements reviewed; no claim of full subjective listening.'}
(ROOT/'research/revision-v6/audio-installation.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),'utf8')
print('Installed 8 verified audio/story/timeline/subtitle files; all h002+ timing and caption objects preserved.')
