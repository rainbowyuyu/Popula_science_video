"""Freeze the installed render inputs; refuses different previous snapshots."""
from pathlib import Path
from datetime import datetime,timezone
import json,hashlib,shutil
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'research/revision-v6'
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def freeze():
 lock=OUT/'final-source-lock.json';assert not lock.exists(),'Final source lock already exists; do not silently revise a running render'
 timeline=json.loads((ROOT/'src/timeline.json').read_text('utf8'))
 assert timeline['duration']==25621 and timeline['fps']==30
 paths=sorted(list((ROOT/'src').rglob('*'))+list((ROOT/'public').rglob('*'))+[ROOT/'package.json',ROOT/'package-lock.json',ROOT/'docs/story-v5.json'])
 rows=[]
 for p in paths:
  if not p.is_file():continue
  assert not p.is_symlink() and p.resolve().is_relative_to(ROOT)
  rel=p.relative_to(ROOT);digest=sha(p);snapshot=OUT/'frozen-source'/rel;snapshot.parent.mkdir(parents=True,exist_ok=True)
  if snapshot.exists():assert sha(snapshot)==digest,rel
  else:shutil.copy2(p,snapshot)
  assert sha(p)==sha(snapshot)==digest
  rows.append({'path':rel.as_posix(),'sha256':digest,'snapshot':snapshot.relative_to(ROOT).as_posix(),'snapshotSHA256':digest})
 report={'revision':'v6','createdUTC':datetime.now(timezone.utc).isoformat(),'frames':25621,'fps':30,'timelineSHA256':sha(ROOT/'src/timeline.json'),'masterSHA256':sha(ROOT/'public/master.wav'),'storySHA256':sha(ROOT/'docs/story-v5.json'),'files':rows,'scope':'Complete installed src/public inventory and package locks plus measured story; cover/promo exports do not mutate render inputs.'}
 lock.write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
 print(json.dumps({'files':len(rows),'sourceLock':str(lock),'sha256':sha(lock)}))
if __name__=='__main__':freeze()
