"""Freeze dining-return supplement sources/plans; never render or compose."""
from pathlib import Path
from datetime import datetime, timezone
import copy
import hashlib
import importlib.util
import json
import shutil

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
OLD_PLAN = ROOT / 'research/revision-v5/patches/patch-plan.json'
LIVE_LOCK = ROOT / 'research/revision-v5/render-motion-source-lock.json'
SOURCE_ROOT = HERE / 'source'
RENDER_PLAN = HERE / 'render-plan.json'
MIXED_PLAN = HERE / 'mixed-plan.candidate.json'
AUDIT = ROOT / 'research/revision-v5/seated-meal-entry/impact.json'
RANGES = [(2542,3097),(7908,8469),(11311,11865),(14474,14647)]
OLD_RANGES = [(2542,3097),(7908,8469),(11311,11865),(14474,14628)]
CLIPS = ['h012','h030','h040','h052']

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(4*1024*1024), b''):
            h.update(block)
    return h.hexdigest()

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def rel(path):
    return path.relative_to(ROOT).as_posix()

def write_new(path, value):
    assert not path.exists(), f'Refusing overwrite: {path}'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')

old = read(OLD_PLAN)
old_lock = read(LIVE_LOCK)
audit = read(AUDIT)
old_plan_sha, old_lock_sha = sha(OLD_PLAN), sha(LIVE_LOCK)
marker_path = ROOT/'tmp/final-render.json'
marker_sha = sha(marker_path)
assert audit['sourceStableDuringAudit'] is True
assert sha(ROOT/'src/V5World.ts') == audit['candidateSHA256'] == 'bfa78bab5ada8921929e83e462f6bf9b55b1bacdc4f5f05ca81d83b52b0b5cd3'
assert sha(ROOT/'src/timeline.json') == old['timelineSHA256']
assert sha(ROOT/'public/master.wav') == old['masterSHA256']
assert read(marker_path) == read(ROOT/old['baseMarkerSnapshot'])
assert read(marker_path)['videoSHA256'] == old['baseVideoSHA256']
assert not SOURCE_ROOT.exists()
for p in [RENDER_PLAN,MIXED_PLAN,HERE/'previous-render-motion-source-lock.json',HERE/'first-batch-plan.json',HERE/'source-lock.json',HERE/'preparation.json']:
    assert not p.exists(), f'Output exists: {p}'

old_rows = {(p['start'],p['end']):p for p in old['patches']}
assert len(old_rows) == 27
assert all(r in old_rows for r in OLD_RANGES)
for new,prior in zip(RANGES,OLD_RANGES):
    overlaps = [r for r in old_rows if r[1]>=new[0] and r[0]<=new[1]]
    assert overlaps == [prior], f'Unexpected overlap: {new}: {overlaps}'
support = audit['unionSupportInclusive']
assert support == [[2945,3001],[8310,8379],[11371,11406],[14534,14587]]
for a,b in support:
    assert sum(s<=a and b<=e for s,e in RANGES) == 1
for start,end in RANGES:
    for p in [ROOT/f'tmp/dining-return-patches/segment-{start}-{end}.mp4',ROOT/f'tmp/dining-return-patches/segment-{start}-{end}.log',HERE/f'segment-{start}-{end}-render.json']:
        assert not p.exists(), f'Output exists: {p}'

# Retain the exact original lock/plan; do not alter the first render batch.
shutil.copyfile(OLD_PLAN,HERE/'first-batch-plan.json')
shutil.copyfile(LIVE_LOCK,HERE/'previous-render-motion-source-lock.json')
assert sha(HERE/'first-batch-plan.json') == old_plan_sha
assert sha(HERE/'previous-render-motion-source-lock.json') == old_lock_sha

hashes,snapshots,all_frozen = {},{},[]
for record in old['allFrozenFiles']:
    source = record['path']
    previous_snapshot = ROOT/record['currentSnapshot']
    assert sha(previous_snapshot) == record['currentSHA256']
    current_hash = sha(ROOT/source)
    if source != 'src/V5World.ts':
        assert current_hash == record['currentSHA256'], f'Unexpected source change: {source}'
    target = SOURCE_ROOT/source
    target.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(ROOT/source,target)
    assert sha(target) == current_hash
    row = copy.deepcopy(record)
    row.update(previousSHA256=record['currentSHA256'],previousSnapshot=record['currentSnapshot'],currentSHA256=current_hash,currentSnapshot=rel(target))
    all_frozen.append(row)
    if source in old['sourceHashes']:
        hashes[source],snapshots[source] = current_hash,rel(target)
assert len(hashes) == 40 and len(all_frozen) == 42
production = {rel(p) for p in (ROOT/'src').rglob('*') if p.is_file() and p.suffix.lower() in {'.ts','.tsx','.js','.mjs','.json','.css'}}
assert production <= hashes.keys()

now = datetime.now(timezone.utc).isoformat()
plan = copy.deepcopy(old)
plan.update(createdUTC=now,status='source-frozen-preview-review-pending',totalPatchFrames=sum(e-s+1 for s,e in RANGES),sourceHashes=hashes,sourceSnapshots=snapshots,allFrozenFiles=all_frozen,
    auxiliaryBackupSnapshots=[r for r in all_frozen if r['path'] not in hashes],changedSources=['src/V5World.ts'],
    previousPlanSnapshot=rel(HERE/'first-batch-plan.json'),previousPlanSnapshotSHA256=old_plan_sha,
    previousSourceLockSnapshot=rel(HERE/'previous-render-motion-source-lock.json'),previousSourceLockSnapshotSHA256=old_lock_sha,
    impactAudit=rel(AUDIT),impactAuditSHA256=sha(AUDIT),paddingFrames=60,
    sourcePreviewStatus='13-frame GPU source preview is owned by root; aesthetic approval and final rendered seam QA remain pending.',
    scope='Delay exterior seated-person opacity until broad framing on h012/h030/h040/h052; retain existing camera paths and fully formed seated scenes.',
    mergeRationale='Replace four complete first-batch rows, extending h052 by 19 frames to retain 60-frame support padding; all other existing segment artifacts and source records remain intact.',patches=[])
for i,((start,end),prior,clip) in enumerate(zip(RANGES,OLD_RANGES,CLIPS)):
    prior_row=old_rows[prior]
    incremental=[list(r) for r in support if start<=r[0] and r[1]<=end]
    row=copy.deepcopy(prior_row)
    row.update(id=f'v5-dining-return-{clip}',start=start,end=end,frameRange=[start,end],frameCount=end-start+1,
        supportFrames=[incremental[0][0],incremental[-1][1]],supportRanges=incremental,
        previousRenderRange=list(prior),previousPatchId=prior_row['id'],
        video=f'tmp/dining-return-patches/segment-{start}-{end}.mp4',marker=rel(HERE/f'segment-{start}-{end}-render.json'),
        log=f'tmp/dining-return-patches/segment-{start}-{end}.log',sourceHashes=hashes,sourceSnapshots=snapshots,
        reason='Whole-row replacement preserves prior optical repairs and delays the seated exterior until broad framing; incremental opacity support has at least 60-frame context.')
    plan['patches'].append(row)
write_new(RENDER_PLAN,plan)

replacement_by_start={r['start']:r for r in plan['patches']}
mixed=copy.deepcopy(old)
mixed.update(createdUTC=now,status='mixed-plan-candidate-preview-and-supplement-pending',
    sourceHashes=hashes,sourceSnapshots=snapshots,allFrozenFiles=all_frozen,
    auxiliaryBackupSnapshots=plan['auxiliaryBackupSnapshots'],
    changedSources=['src/V5CameraPath.ts','src/V5World.ts'],
    previousPlanSnapshot=rel(HERE/'first-batch-plan.json'),previousPlanSnapshotSHA256=old_plan_sha,
    supplementalRenderPlan=rel(RENDER_PLAN),supplementalRenderPlanSHA256=sha(RENDER_PLAN),
    supplementalImpactAudit=rel(AUDIT),supplementalImpactAuditSHA256=sha(AUDIT),
    sourcePreviewStatus=plan['sourcePreviewStatus'],scope=old['scope']+' '+plan['scope'],
    mergeRationale=plan['mergeRationale'])
mixed['patches']=[copy.deepcopy(replacement_by_start.get(r['start'],r)) for r in old['patches']]
mixed['totalPatchFrames']=sum(r['end']-r['start']+1 for r in mixed['patches'])
assert len(mixed['patches']) == 27 and mixed['totalPatchFrames']==12785
assert all(a['end']<b['start'] for a,b in zip(mixed['patches'],mixed['patches'][1:]))
write_new(MIXED_PLAN,mixed)

lock=copy.deepcopy(old_lock)
lock.update(frozenUTC=now,phase='dining-return-source-frozen',sourceSnapshotRoot=rel(SOURCE_ROOT),
    reason='Freeze supplement production source; previous batch source lock and artifacts remain available. Four row replacements are pending source-preview approval and rendering.',
    previousSourceLockSnapshot=rel(HERE/'previous-render-motion-source-lock.json'),previousSourceLockSnapshotSHA256=old_lock_sha,
    patchPlan=rel(RENDER_PLAN),patchPlanSHA256=sha(RENDER_PLAN),mixedPlanCandidate=rel(MIXED_PLAN),mixedPlanCandidateSHA256=sha(MIXED_PLAN),
    impactAudit=rel(AUDIT),impactAuditSHA256=sha(AUDIT),patchRangesInclusive=[list(r) for r in RANGES],patchFrames=1847,
    changedSources=['src/V5World.ts'],visualStatus='Root source preview and final rendered QA pending.')
for row in lock['files']:
    row['sha256']=sha(ROOT/row['path'])
    if row.get('snapshotCopy',True):
        row['snapshot']=rel(SOURCE_ROOT/row['path'])
write_new(HERE/'source-lock.json',lock)

# Composer source verification is CPU/read-only; no preflight video decode or render.
spec=importlib.util.spec_from_file_location('compose_source_check',ROOT/'scripts/compose_v5_patches.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
watched={}
module.source_records(mixed['baseSourceHashes'],mixed['baseSourceSnapshots'],'base',watched,require_snapshots=True)
for row in mixed['patches']:
    module.source_records(row['sourceHashes'],row['sourceSnapshots'],row['id'],watched,require_snapshots=True)
assert sha(OLD_PLAN)==old_plan_sha and sha(LIVE_LOCK)==old_lock_sha and sha(marker_path)==marker_sha
for source,expected in hashes.items():
    assert sha(ROOT/source)==expected
# Parent authorized latest live lock; original is byte-preserved above.
shutil.copyfile(HERE/'source-lock.json',LIVE_LOCK)
receipt=dict(preparedUTC=now,renderPlan=rel(RENDER_PLAN),renderPlanSHA256=sha(RENDER_PLAN),
    mixedPlanCandidate=rel(MIXED_PLAN),mixedPlanCandidateSHA256=sha(MIXED_PLAN),
    sourceLock=rel(HERE/'source-lock.json'),sourceLockSHA256=sha(HERE/'source-lock.json'),
    previousPlanUnchanged=sha(OLD_PLAN)==old_plan_sha,previousSourceLockPreserved=True,baseMarkerUnchanged=sha(marker_path)==marker_sha,
    frozenSourceRecords=len(hashes),allFrozenFiles=len(all_frozen),sourceDifferencesFromPriorBatch=['src/V5World.ts'],
    supplementRangesInclusive=[list(r) for r in RANGES],supplementFrames=1847,mixedPatchCount=27,mixedFrames=12785,
    incrementalSupportInclusive=support,otherPatchOverlaps=[],sourceSnapshotValidation='passed',renderStarted=False,compositionStarted=False,
    renderCommand='node scripts/render_patch_supplement_v5.mjs --plan=research/revision-v5/dining-return-patches/render-plan.json --output-dir=tmp/dining-return-patches --silent --concurrency=2',
    composeReadOnlyPreflightCommand='python -X utf8 scripts/compose_v5_patches.py --plan research/revision-v5/dining-return-patches/mixed-plan.candidate.json')
write_new(HERE/'preparation.json',receipt)
print(json.dumps(receipt,ensure_ascii=False,indent=2))
