"""Remove only the explicitly inventoried, retired V7 caches after final delivery.
Does not target source, public, frozen, node_modules, accepted audio or QA images.
"""
from pathlib import Path
from datetime import datetime, timezone
import json,hashlib,os,stat,shutil
ROOT=Path(__file__).resolve().parents[2]
def load(p):return json.loads(p.read_text('utf8'))
def sha(p):
 h=hashlib.sha256()
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
plan=load(ROOT/'research/revision-v7/cleanup-candidates.json')
release=load(ROOT/'research/revision-v7/release-qa.json')
manifest=load(ROOT/'delivery/latest-v7.json')
render_path=Path(manifest['renderResult']);render=load(render_path)
assert release['releaseApproved'] and release['audioVerified'] and release['sourceStable']
assert manifest['videoSHA256']==release['videoSHA256']==render['videoSHA256']
assert sha(Path(manifest['video']))==manifest['videoSHA256']
protected={ROOT/p:h for p,h in render['hashes'].items()}
protected.update({render_path.parent/'frozen'/p:h for p,h in render['hashes'].items()})
protected[Path(manifest['video'])]=manifest['videoSHA256']
protected[ROOT/'delivery/GLP1_V5_1080p.mp4']='2d6b8de1da3ac344ee95adfb255ac86d2b94daddc06b86bd70a74507c1300e11'
protected[ROOT/'tmp/final-render.json']='63041061accd9028dfe80f42283aad52b837b5602d28411df2a34f4806d6c03b'
protected[ROOT/'research/revision-v6/continuity-repair/label-stability/final-source-lock.json']='b292d0569580d6dc2b0539746c3acdff3565e384a2cb24008b40b0bc8c03f59b'
for p,h in protected.items():assert p.is_file() and sha(p)==h,str(p)
allowed_dirs={ROOT/'tmp'/d/'bundle' for d in ['v7-preview-01','v7-preview-02','v7-motion-03','v7-motion-04']}
allowed_files={ROOT/'research/revision-v7/audio'/f for f in ['master.wav','music.wav','premaster.wav','score-work.f32','master-aac-check.m4a','source-piano-filtered.wav']}
# Exact audio file allowlist is additionally constrained by pre-audited plan hashes.
def safe(p):
 assert p.is_relative_to(ROOT) and p!=ROOT
 for part in [p,*list(p.parents)[:len(p.parents)-len(ROOT.parents)]]:
  st=part.lstat();assert not part.is_symlink() and not (getattr(st,'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT),str(part)
 if p.is_dir():
  for d,dirs,files in os.walk(p,followlinks=False):
   assert '.git' not in dirs and '.git' not in files
   for n in dirs+files:
    q=Path(d)/n;s=q.lstat();assert not q.is_symlink() and not(getattr(s,'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT),str(q)
selected=[]
for item in plan['candidates']:
 p=Path(item['path']);assert p.absolute()==p.resolve() and p.is_relative_to(ROOT)
 assert p in (allowed_dirs|allowed_files),f'Outside explicit allowlist: {p}'
 safe(p)
 assert not any(q==p or q.is_relative_to(p) for q in protected)
 files=[q for q in p.rglob('*') if q.is_file()] if p.is_dir() else [p]
 size=sum(q.stat().st_size for q in files)
 assert size==item['bytes'] and len(files)==item['fileCount'],f'Inventory changed: {p}'
 if p.is_file():assert sha(p)==item['sha256']
 selected.append((p,size,len(files)))
record={'createdUTC':datetime.now(timezone.utc).isoformat(),'phase':'validated-before-delete','projectRoot':str(ROOT),'videoSHA256':manifest['videoSHA256'],'protectedDependencies':{str(p):h for p,h in protected.items()},'deleted':[],'totalFreedBytes':0}
report=ROOT/'research/revision-v7/cleanup-result.json'
assert not report.exists()
report.write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf8')
for p,size,count in selected:
 if p.is_dir():shutil.rmtree(p)
 else:p.unlink()
 assert not p.exists()
 record['deleted'].append({'path':str(p),'bytes':size,'fileCount':count});record['totalFreedBytes']+=size
 report.write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf8')
for p,h in protected.items():assert p.is_file() and sha(p)==h,str(p)
record['phase']='complete';record['protectedDependenciesReverified']=True
report.write_text(json.dumps(record,ensure_ascii=False,indent=2),'utf8')
print(json.dumps({'deletedItems':len(selected),'freedBytes':record['totalFreedBytes'],'freedGiB':record['totalFreedBytes']/2**30,'protectedFiles':len(protected)},ensure_ascii=False))

