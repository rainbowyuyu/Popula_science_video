"""Prepare verified local-repair plan/source locks only; never render or compose."""
from pathlib import Path
import copy
from datetime import datetime, timezone
import hashlib
import importlib.util
import json
import shutil

ROOT = Path(__file__).resolve().parents[3]
HERE = ROOT / 'research/revision-v5/h005-fix'
BASE = ROOT / 'research/revision-v5/final-motion-source'
CURRENT = HERE / 'current-source'
PLAN = ROOT / 'research/revision-v5/patches/patch-plan.json'
LOCK = ROOT / 'research/revision-v5/render-motion-source-lock.json'

def read(path):
    return json.loads(path.read_text(encoding='utf-8-sig'))

def sha(path):
    value = hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda: stream.read(4 * 1024 * 1024), b''):
            value.update(block)
    return value.hexdigest()

def rel(path):
    return path.relative_to(ROOT).as_posix()

def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

audit = read(HERE / 'expanded-impact.json')
base_lock = read(HERE / 'base-render-motion-source-lock.json')
base_marker = read(HERE / 'base-final-render.json')
live_marker = read(ROOT / 'tmp/final-render.json')
assert audit['sourceStableDuringAudit'] is True
assert base_marker == live_marker, 'Live marker no longer describes preserved base.'
assert base_marker['success'] and base_marker['frames'] == [0, 25620]
assert base_marker['videoSHA256'] == '96a10931c12cfd2f6606d5137f1a2adef59fb93dacbbe24c0a2b5bcc65ae03cc'
assert sha(ROOT / 'delivery/GLP1_V5_1080p.mp4') == base_marker['videoSHA256']
for source, expected in audit['sourceSHA256'].items():
    assert sha(ROOT / source) == expected, f'Source changed since CPU audit: {source}'
assert '1-.999*smooth(visiblePerson/.06)' in (ROOT / 'src/V5World.ts').read_text('utf-8')
assert not PLAN.exists(), 'Refusing to replace an existing approved patch plan.'
assert not CURRENT.exists(), 'Refusing to overwrite current-source snapshots.'

base_hashes, base_snapshots, current_hashes, current_snapshots = {}, {}, {}, {}
all_frozen, auxiliary, changed = [], [], []
source_suffixes = {'.ts', '.tsx', '.js', '.mjs', '.json', '.css'}
for row in base_lock['files']:
    if not row.get('snapshotCopy', True):
        continue
    source = row['path']
    base_snapshot = BASE / source
    assert sha(base_snapshot) == row['sha256'], f'Base snapshot mismatch: {source}'
    current_hash = sha(ROOT / source)
    if current_hash != row['sha256']:
        changed.append(source)
    all_frozen.append({'path': source, 'baseSHA256': row['sha256'],
                       'baseSnapshot': rel(base_snapshot), 'currentSHA256': current_hash,
                       'currentSnapshot': rel(CURRENT / source)})
    if Path(source).suffix.lower() not in source_suffixes:
        auxiliary.append(all_frozen[-1])
        continue
    base_hashes[source] = row['sha256']
    base_snapshots[source] = rel(base_snapshot)
    current_hashes[source] = current_hash
    current_snapshots[source] = rel(CURRENT / source)
assert sorted(changed) == ['src/V5CameraPath.ts', 'src/V5World.ts'], changed

ranges = audit['recommendedRenderRangesInclusive']
assert sum(end-start+1 for start,end in ranges) == audit['recommendedTotalFrames']
assert all(end < ranges[i+1][0] for i,(_,end) in enumerate(ranges[:-1]))
assert not [s for s in audit['seamChecks'] if s['differences'] and not s['expectedChangedFilmEdge']]
for start, end in ranges:
    for output in [ROOT / f'tmp/segment-{start}-{end}.mp4',
                   ROOT / f'tmp/segment-{start}-{end}.log',
                   ROOT / f'research/revision-v5/patches/segment-{start}-{end}-render.json']:
        assert not output.exists(), f'Output exists: {output}'

for record in all_frozen:
    target = ROOT / record['currentSnapshot']
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(ROOT / record['path'], target)
    assert sha(target) == record['currentSHA256']

now = datetime.now(timezone.utc).isoformat()
plan = {
    'version': 'v5-local-patches', 'createdUTC': now,
    'status': 'source-frozen-render-pending', 'fps': 30, 'width': 1920, 'height': 1080,
    'totalFrames': 25621, 'totalPatchFrames': audit['recommendedTotalFrames'],
    'timelineSHA256': base_marker['timelineSHA256'], 'masterSHA256': base_marker['masterSHA256'],
    'baseVideo': 'delivery/GLP1_V5_1080p.mp4', 'baseVideoSHA256': base_marker['videoSHA256'],
    'baseMarkerSnapshot': rel(HERE / 'base-final-render.json'),
    'baseMarkerSnapshotSHA256': sha(HERE / 'base-final-render.json'),
    'baseLiveMarkerSHA256': sha(ROOT / 'tmp/final-render.json'),
    'baseSourceLockSnapshot': rel(HERE / 'base-render-motion-source-lock.json'),
    'baseSourceLockSnapshotSHA256': sha(HERE / 'base-render-motion-source-lock.json'),
    'baseSourceHashes': base_hashes, 'baseSourceSnapshots': base_snapshots,
    'sourceHashes': current_hashes, 'sourceSnapshots': current_snapshots,
    'allFrozenFiles': all_frozen, 'auxiliaryBackupSnapshots': auxiliary,
    'changedSources': changed,
    'impactAudit': rel(HERE / 'expanded-impact.json'),
    'impactAuditSHA256': sha(HERE / 'expanded-impact.json'),
    'paddingFrames': 60, 'mergeGapAfterPaddingFrames': 90,
    'sourcePreviewStatus': 'Root visually approved current small-intestine, garment, drug-entry and measurement previews; final rendered patches and seams remain pending.',
    'scope': 'Correct h005 small-intestine routing; retire clothing with exterior; synchronize stationary-organ suppression with posed exterior; reveal measurement at a broad view; reveal existing drug plasma during optical approach.',
    'mergeRationale': 'Keep 27 conservative ranges. Batch shares one bundle/browser. Merging longer unaffected gaps adds more frames without avoiding another browser launch.',
    'patches': []
}
for index, (start,end) in enumerate(ranges):
    support = [(max(start,a), min(end,b)) for a,b in audit['unionSupportInclusive'] if b>=start and a<=end]
    assert support
    plan['patches'].append({
        'id': f'v5-optical-repair-{index+1:02d}', 'start': start, 'end': end,
        'frameRange': [start,end], 'frameCount': end-start+1,
        'supportFrames': [support[0][0], support[-1][1]],
        'supportRanges': [list(s) for s in support],
        'video': f'tmp/segment-{start}-{end}.mp4',
        'marker': f'research/revision-v5/patches/segment-{start}-{end}-render.json',
        'log': f'tmp/segment-{start}-{end}.log',
        'sourceHashes': current_hashes, 'sourceSnapshots': current_snapshots,
        'reason': 'Conservative frozen-to-current opacity/camera/optical-gate support, retaining potential offscreen shadow effects, with 60-frame context on either side where available.'
    })
write(PLAN, plan)

new_lock = copy.deepcopy(base_lock)
new_lock.update({
    'frozenUTC': now, 'phase': 'local-optical-repair-source-frozen',
    'reason': 'Current production source for conservative local repair after completed 25621-frame base. Base source/video provenance is separately preserved; patch render and final visual QA are pending.',
    'sourceSnapshotRoot': rel(CURRENT),
    'baseFrozenUTC': base_lock['frozenUTC'],
    'baseSourceSnapshotRoot': rel(BASE),
    'baseSourceLockSnapshot': rel(HERE / 'base-render-motion-source-lock.json'),
    'baseSourceLockSnapshotSHA256': sha(HERE / 'base-render-motion-source-lock.json'),
    'baseRenderMarkerSnapshot': rel(HERE / 'base-final-render.json'),
    'baseRenderMarkerSnapshotSHA256': sha(HERE / 'base-final-render.json'),
    'baseVideoSHA256': base_marker['videoSHA256'],
    'patchPlan': rel(PLAN), 'patchPlanSHA256': sha(PLAN),
    'impactAudit': rel(HERE / 'expanded-impact.json'), 'impactAuditSHA256': sha(HERE / 'expanded-impact.json'),
    'patchRangesInclusive': ranges, 'patchFrames': audit['recommendedTotalFrames'],
    'changedSources': changed, 'visualStatus': 'Source previews approved by root; patched movie and edit seam QA pending.'
})
for row in new_lock['files']:
    source = row['path']
    row['sha256'] = sha(ROOT / source)
    if row.get('snapshotCopy', True):
        row['snapshot'] = rel(CURRENT / source)
        row['baseSnapshot'] = rel(BASE / source)
write(LOCK, new_lock)

# Invoke only the composer's read-only source/path validation helpers. No
# preflight video decode, renderer, or composition function is called.
spec = importlib.util.spec_from_file_location('compose_source_check', ROOT / 'scripts/compose_v5_patches.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
watched = {}
base_records = module.source_records(plan['baseSourceHashes'], plan['baseSourceSnapshots'], 'base render', watched, require_snapshots=True)
for patch in plan['patches']:
    module.source_records(patch['sourceHashes'], patch['sourceSnapshots'], patch['id'], watched)
for row in new_lock['files']:
    assert sha(ROOT / row['path']) == row['sha256']
assert read(ROOT / 'tmp/final-render.json') == base_marker
receipt = {
    'preparedUTC': now, 'plan': rel(PLAN), 'planSHA256': sha(PLAN),
    'lock': rel(LOCK), 'lockSHA256': sha(LOCK),
    'baseSourceRecordsVerified': len(base_records), 'allFrozenSnapshotsVerified': len(all_frozen),
    'auxiliaryBackupsRetained': len(auxiliary), 'patchCount': len(ranges),
    'patchFrames': audit['recommendedTotalFrames'], 'rangesInclusive': ranges,
    'changedProductionSources': changed, 'productionSourceFilesWrittenByThisScript': [],
    'renderStarted': False, 'compositionStarted': False,
    'renderCommand': 'node scripts/render_patch_batch_v5.mjs --silent --concurrency=2',
    'composeReadOnlyPreflightCommand': 'python -X utf8 scripts/compose_v5_patches.py --plan research/revision-v5/patches/patch-plan.json'
}
write(HERE / 'patch-plan-preparation.json', receipt)
print(json.dumps(receipt, ensure_ascii=False, indent=2))
