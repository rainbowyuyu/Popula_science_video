"""Remove only this film's retired copies/caches after verified final delivery."""
from pathlib import Path
import json,hashlib,shutil,stat,zipfile
R=Path(__file__).resolve().parents[1];qa=R/'delivery/technical-qa.json'
d=json.loads(qa.read_text('utf8'));movie=Path(d['file'])
assert d['fullDecodePassed'] and not d['blackSegments']
assert hashlib.sha256(movie.read_bytes()).hexdigest()==d['sha256']
assert (R/'public/audio/master.wav').exists() and (R/'src/index-beso.tsx').exists()
def safe(p):
    absolute=p.absolute();resolved=p.resolve()
    assert resolved.is_relative_to(R.resolve()) and resolved!=R.resolve(),absolute
    q=absolute
    while q!=R:
        if q.exists():assert not (q.lstat().st_file_attributes&stat.FILE_ATTRIBUTE_REPARSE_POINT),'reparse: '+str(q)
        q=q.parent
    if p.is_dir():
        for f in p.rglob('*'):
            assert f.name!='.git' and not (f.lstat().st_file_attributes&stat.FILE_ATTRIBUTE_REPARSE_POINT),str(f)
    return p
# Keep a small recovery copy of old copied registrations before retiring them.
old=R/'research/qa/legacy-entry-recovery.zip'
if not old.exists():
    with zipfile.ZipFile(old,'w',zipfile.ZIP_DEFLATED) as z:
        for name in ['src/Root.tsx','src/index.ts']:
            p=R/name
            if p.exists():z.write(p,name)
(R/'src/Root.tsx').write_text("import React from 'react';\nimport {Composition} from 'remotion';\nimport {BesoFilm} from './beso/BesoFilm';\nimport story from './beso-story.json';\nexport const Root=()=> <Composition id=\"BesoAIResearchZH\" component={BesoFilm} width={1920} height={1080} fps={story.fps} durationInFrames={story.duration}/>;\n",'utf8')
plan=json.loads((R/'research/qa/cleanup-candidates.json').read_text('utf8'))
targets=[]
for c in plan['candidates']:
    if c.get('files'):
        targets.extend(R/f for f in c['files'])
    else:targets.append(Path(c['path']))
# Bundles and staging contain copies of the same protected source assets.
for p in (R/'tmp').iterdir():
    if p.is_dir() and (p.name.startswith('beso-bundle-') or p.name.startswith('active-public-')):targets.append(p)
records=[]
for p in targets:
    if not p.exists():continue
    safe(p)
    n=sum(f.stat().st_size for f in p.rglob('*') if f.is_file()) if p.is_dir() else p.stat().st_size
    if p.is_dir():shutil.rmtree(p)
    else:p.unlink()
    records.append(dict(path=str(p.relative_to(R)),bytes=n))
report=dict(deleted=records,totalBytes=sum(r['bytes'] for r in records),originalRepositoryTouched=False,sharedDependenciesTouched=False,finalSHA256=d['sha256'])
(R/'research/qa/cleanup-executed.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),'utf8')
assert hashlib.sha256(movie.read_bytes()).hexdigest()==d['sha256']
print('Freed',round(report['totalBytes']/2**30,3),'GiB; delivered movie unchanged.')
