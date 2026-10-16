"""Promote accepted V10 results while retaining exact prior production inputs."""
from pathlib import Path
import hashlib,json,shutil
ROOT=Path(__file__).resolve().parents[2];BASE=ROOT/'research/physics-v10';EXPORT=BASE/'export';PUBLIC=ROOT/'public/physics'
def read(p):return json.loads(Path(p).read_text('utf-8-sig'))
def sha(p):
    with Path(p).open('rb') as f:return hashlib.file_digest(f,'sha256').hexdigest()
def save(p,d):Path(p).write_text(json.dumps(d,ensure_ascii=False,separators=(',',':'))+'\n','utf8')
summary=read(EXPORT/'run-summary.json');assert summary['modelVersion']==10
assert summary['validation']['dynamicConvergence']['failedSteps']==0 and summary['validation']['dynamicForceBalanceMaximum']<1e-6
assert summary['tmdValidation']['sameCaseWithinNumericalTolerance'] and summary['tmdValidation']['maxResidual_N']<1
assert read(ROOT/'research/qa/v10-playback/audit.json')['passed']
names=['response.json','structural-graph.json','cinematic-response.json','cinematic-response.f32','shell-response.json','shell-response.f32','environment-response.json','environment-summary.json','engineering-readouts.json','run-summary.json']
for name in names:assert (EXPORT/name).is_file()
for name in ['cinematic-response','shell-response']:
    meta=read(EXPORT/(name+'.json'));assert meta['sha256']==sha(EXPORT/(name+'.f32'))
backup=BASE/'previous-production';backup.mkdir(exist_ok=True)
old={};new={}
for name in names+['environment-qa.json']:
    target=PUBLIC/name
    if target.exists():
        destination=backup/name
        if destination.exists():assert sha(destination)==sha(target),'Production already changed; do not overwrite rollback'
        else:shutil.copy2(target,destination)
        old[name]=sha(target)
manifestpath=ROOT/'public/models/shanghai-tower-manifest.json';manifestbackup=backup/'shanghai-tower-manifest.json'
if manifestbackup.exists():assert sha(manifestbackup)==sha(manifestpath)
else:shutil.copy2(manifestpath,manifestbackup)
for name in names:
    shutil.copy2(EXPORT/name,PUBLIC/name);assert sha(EXPORT/name)==sha(PUBLIC/name);new[name]=sha(PUBLIC/name)
response=read(EXPORT/'response.json');manifest=read(manifestpath);mapping=[]
for p in manifest['parts']:
    lines=[m for m in response['members'] if p['id'] in m['meshIds']];walls=[m for m in response['walls'] if p['id'] in m['meshIds']]
    p['structuralMemberIds']=[m['id'] for m in lines];p['structuralWallIds']=[m['id'] for m in walls]
    if lines or walls:mapping.append(dict(partId=p['id'],memberIds=p['structuralMemberIds'],wallIds=p['structuralWallIds'],nodeIds=sorted(set(n for m in lines+walls for n in m['nodeIds'])),mapping='nearest rectangular wall-shell midsurface candidates; four-node interpolation' if walls else 'original beam/truss axis',role=p['role']))
manifest['structuralMapping']=dict(graph='physics/structural-graph.json',graphSha256=new['structural-graph.json'],modelVersion=10,coordinateSystem='metres/Y-up',parts=mapping,scope='Independent published-source wall-shell reconstruction. Candidate geometry registration is not an as-built identity or local stress validation. Nonstructural surfaces follow actual diaphragm motion.')
save(manifestpath,manifest)
environmentqa=dict(modelVersion=10,allPassed=True,environmentResponseSHA256=new['environment-response.json'],tmd=summary['tmdValidation'],dynamicForceBalanceMaximum=summary['validation']['dynamicForceBalanceMaximum'],scope='New full wall-shell tower and matching TMD trace; reused single-pile submodel remains independent. Final rendered QA is separate.')
save(PUBLIC/'environment-qa.json',environmentqa);new['environment-qa.json']=sha(PUBLIC/'environment-qa.json')
save(BASE/'production-promotion.json',dict(previous=old,promoted=new,previousManifestSHA256=sha(manifestbackup),manifestSHA256=sha(manifestpath),backup=str(backup),solverScope=summary['scope'],status='data-promoted; final video acceptance pending'))
print(json.dumps(dict(promoted=len(new),wallGroups=sum(bool(p['structuralWallIds']) for p in manifest['parts']),backup=str(backup)),ensure_ascii=False))
