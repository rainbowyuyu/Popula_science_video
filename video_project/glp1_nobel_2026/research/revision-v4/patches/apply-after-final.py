"""Apply only after the locked, complete V4 baseline has finished rendering.

Default is read-only verification. Pass --apply after the parent authorizes
the bounded post-render correction. Timeline, camera, and audio stay frozen.
"""
from pathlib import Path
import argparse
import hashlib
import json
from datetime import datetime, timezone

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
def read_json(path): return json.loads(path.read_text(encoding='utf-8-sig'))
def sha(path):
    digest=hashlib.sha256()
    with path.open('rb') as stream:
        for block in iter(lambda:stream.read(8*1024*1024),b''):digest.update(block)
    return digest.hexdigest()

args=argparse.ArgumentParser()
args.add_argument('--apply',action='store_true')
options=args.parse_args()
lock=read_json(HERE/'baseline-source-lock.json')
plan=read_json(HERE/'patch-plan.json')
for relative,expected in lock['sourceHashes'].items():
    if sha(ROOT/relative)!=expected:raise SystemExit('Frozen source changed: '+relative)
for relative,key in [('src/timeline.json','timelineSHA256'),('public/master.wav','masterSHA256')]:
    if sha(ROOT/relative)!=lock[key]:raise SystemExit('Locked input changed: '+relative)
marker=read_json(ROOT/'tmp/final-render.json')
timeline=read_json(ROOT/'src/timeline.json')
if marker.get('success') is not True:raise SystemExit('Full render has not succeeded')
if marker.get('frames')!=[0,timeline['duration']-1]:raise SystemExit('Full render frame range does not match')
for key in ['timelineSHA256','masterSHA256']:
    if marker.get(key)!=lock[key]:raise SystemExit('Final-render marker is stale: '+key)
baseline=ROOT/'delivery/GLP1_1080p.mp4'
if Path(marker['outputLocation']).resolve()!=baseline.resolve():raise SystemExit('Unexpected baseline output location')
base_sha=sha(baseline)
if marker.get('videoSHA256')!=base_sha:raise SystemExit('Baseline video differs from final-render marker')
staged={'src/V4World.ts':HERE/'V4World.after.ts','src/V4HandoffContext.ts':HERE/'V4HandoffContext.ts'}
source_hashes={relative:sha(path) for relative,path in staged.items()}
for patch in plan['patches']:
    if patch['sourceHashes']!=source_hashes:raise SystemExit('Staged source hash differs from patch plan')
print(json.dumps({'verified':True,'apply':options.apply,'baselineVideoSHA256':base_sha,'sourceHashes':source_hashes},indent=2))
if options.apply:
    for relative,path in staged.items():(ROOT/relative).write_bytes(path.read_bytes())
    plan['baseVideoSHA256']=base_sha
    plan['baseRenderMarker']='tmp/final-render.json'
    plan['appliedAt']=datetime.now(timezone.utc).isoformat()
    (HERE/'patch-plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (HERE/'application.json').write_text(json.dumps({'appliedAt':plan['appliedAt'],'baseVideoSHA256':base_sha,'sourceHashes':source_hashes,'timelineSHA256':lock['timelineSHA256'],'masterSHA256':lock['masterSHA256']},indent=2)+'\n',encoding='utf-8')
