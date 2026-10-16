"""Remove only rebuildable caches created by this V20 revision, after delivery."""
from pathlib import Path
import json
import shutil
import stat
import hashlib

ROOT=Path(__file__).resolve().parents[1].resolve()
report_dir=ROOT/'research/revision-v20'
manifest_path=ROOT/'delivery/latest-v20.json'
manifest=json.loads(manifest_path.read_text(encoding='utf8'))
assert manifest['technicalValidationPassed']
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
protected=[manifest['video'],manifest['master'],manifest['sourceLock'],manifest['timeline'],*manifest['covers']]
for item in protected:assert sha(ROOT/item['path'])==item['sha256']

targets=[ROOT/'tmp/v20-opening-patches/bundle',ROOT/'tmp/v20-opening-patches-r2/bundle']
for name in ['v20-compose','v20-compose-r2']:
    work=ROOT/'tmp'/name
    for pattern in ['base-*.mp4','silent-spliced.mp4','patch-*.timescale90000.mp4','superseded-title-cut.mp4']:
        targets.extend(work.glob(pattern))

plan=[]
for p in targets:
    if not p.exists():continue
    resolved=p.resolve(strict=True)
    assert resolved.is_relative_to(ROOT/'tmp') and resolved!=ROOT/'tmp'
    parts=[resolved,*list(resolved.parents)[:len(resolved.relative_to(ROOT).parts)-1]]
    for part in parts:
        info=part.lstat()
        assert not part.is_symlink() and not (getattr(info,'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT)
    members=[resolved]+list(resolved.rglob('*')) if resolved.is_dir() else [resolved]
    for member in members:
        info=member.lstat()
        assert not member.is_symlink() and not (getattr(info,'st_file_attributes',0)&stat.FILE_ATTRIBUTE_REPARSE_POINT)
        assert member.name!='.git'
    size=sum(member.stat().st_size for member in members if member.is_file())
    plan.append({'path':str(resolved),'bytes':size,'reason':'Rebuildable V20 bundle or redundant composition stream; validated output and source assets retained.'})
(report_dir/'cleanup-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2),encoding='utf8')
for row in plan:
    p=Path(row['path'])
    if p.is_dir():shutil.rmtree(p)
    else:p.unlink()
for item in protected:assert sha(ROOT/item['path'])==item['sha256']
result={'deleted':plan,'freedBytes':sum(r['bytes'] for r in plan),'protectedHashesUnchanged':True,'baselineV19Preserved':True}
(report_dir/'cleanup-result.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
manifest['cleanup']={'report':'research/revision-v20/cleanup-result.json','freedBytes':result['freedBytes'],'protectedHashesUnchanged':True}
manifest_path.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
print(json.dumps({'deletedItems':len(plan),'freedBytes':result['freedBytes'],'protectedHashesUnchanged':True}))
