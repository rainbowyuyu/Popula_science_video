"""Project-local retirement after final MP4 QA and review; no linked paths."""
from pathlib import Path
import os,json,hashlib,shutil,sys,datetime
R=Path(__file__).resolve().parents[1];D=R/'delivery/v3'
def sha(p):
 with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
qa=json.loads((D/'qa.json').read_text('utf8'));review=json.loads((D/'review.json').read_text('utf8'));movie=R/qa['movie']
assert qa['fullDecode'] and review['passed'] and qa['sha256']==review['sha256']==sha(movie)
assert not (R/'tmp/render-v3-active.lock').exists(),'Current render still active'
retire=['src/v2','src/index-v2.tsx','public/v2','output/v2','delivery/v2','research/v2',
 'scripts/assets_v2.py','scripts/story_v2.py','scripts/prepare_v2.py','scripts/research_v2.py','scripts/render_v2.mjs','scripts/build_web.mjs','scripts/check_web.mjs','scripts/verify_voice_v2.py','scripts/delivery_v2.py','scripts/qa_v2.py','scripts/cleanup_v2.py',
 'tmp/v3-bundle','node_modules/.cache/webpack','tmp/music-normalized.wav','tmp/premaster-v3.wav','tmp/ab-raw.wav','tmp/ab-clean.wav',
 'output/v3/checks','output/v3/qa','output/v3/motion-check.mp4','output/v3/style-check.jpg','output/v3/joins-0.jpg','output/v3/joins-1.jpg','output/v3/joins-2.jpg']
retire += ['output/v3/'+s+'.jpg' for s in ['room','solid','strip','grid','load','density','penalty','optimize','lab','compare','caveat','manufacture','return','references']]
retire += ['tmp/upgrade-rollback','tmp/attachment-check','output/v3/previous-validated.mp4','output/v3/coda-first.jpg']
def candidate(p):return any(p.is_relative_to(R/x) for x in retire)
def safe(p):
 assert p.resolve().is_relative_to(R.resolve()) and p.resolve()!=R.resolve()
 for x in [p,*p.parents]:
  if x==R:break
  assert not x.is_symlink() and not x.is_junction(),'Linked path'
 if p.is_dir():
  for root,dirs,files in os.walk(p,followlinks=False):
   assert '.git' not in dirs,'Nested repository'
   for name in dirs+files:
    q=Path(root)/name;assert not q.is_symlink() and not q.is_junction(),'Linked descendant'
protected=[]
for folder in ['src','public/v3','scripts','research/v3','delivery/v3']:
 for p in (R/folder).rglob('*'):
  if p.is_file() and not candidate(p) and p.name not in ['cleanup-plan.json','cleanup-result.json','dependency-manifest.json'] and '__pycache__' not in p.parts:protected.append({'path':p.relative_to(R).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size})
for p in [movie,R/'README.md',R/'package.json',R/'package-lock.json',R/'tsconfig.json']:protected.append({'path':p.relative_to(R).as_posix(),'sha256':sha(p),'bytes':p.stat().st_size})
(D/'dependency-manifest.json').write_text(json.dumps(protected,ensure_ascii=False,indent=2),encoding='utf8')
plan=[]
for rel in retire:
 p=R/rel
 if not p.exists():continue
 safe(p);assert not any((R/x['path']).is_relative_to(p) for x in protected)
 plan.append({'path':rel,'bytes':p.stat().st_size if p.is_file() else sum(x.stat().st_size for x in p.rglob('*') if x.is_file())})
(D/'cleanup-plan.json').write_text(json.dumps({'root':str(R),'finalSha256':qa['sha256'],'candidates':plan,'totalBytes':sum(x['bytes'] for x in plan)},ensure_ascii=False,indent=2),encoding='utf8')
if '--apply' not in sys.argv:print('Plan bytes',sum(x['bytes'] for x in plan));raise SystemExit
for row in plan:
 p=R/row['path'];safe(p)
 if p.is_dir():shutil.rmtree(p)
 else:p.unlink()
for row in protected:assert (R/row['path']).exists() and sha(R/row['path'])==row['sha256'],'Current dependency changed'
(D/'cleanup-result.json').write_text(json.dumps({'time':datetime.datetime.now().isoformat(),'freedBytes':sum(x['bytes'] for x in plan),'deleted':plan,'protectedFilesVerified':len(protected),'finalSha256':sha(movie),'scope':'This topology_optimization project only; no shared TTS models or other projects deleted'},ensure_ascii=False,indent=2),encoding='utf8')
print('Freed bytes',sum(x['bytes'] for x in plan),'protected',len(protected))
