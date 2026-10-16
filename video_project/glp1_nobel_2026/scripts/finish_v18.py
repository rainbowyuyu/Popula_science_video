"""Continue the frozen V18 export after the hand render finishes."""
from pathlib import Path
import json, subprocess, sys, time
ROOT=Path(__file__).resolve().parents[1]
done=ROOT/'tmp/v18-hand-patches/result.json'
deadline=time.monotonic()+1800
while not done.exists():
 if time.monotonic()>deadline:raise RuntimeError('Hand render did not finish within 30 minutes')
 time.sleep(3)
assert json.loads(done.read_text('utf8'))['complete']
subprocess.run([sys.executable,'scripts/normalize_v18_patches.py','--plan','tmp/v18-hand-patches/plan.json','--out-plan','tmp/v18-hand-patches/plan-bt709.json'],cwd=ROOT,check=True)
old=json.loads((ROOT/'tmp/v18-hand-patches/retained-patches.json').read_text('utf8'))
new=json.loads((ROOT/'tmp/v18-hand-patches/plan-bt709.json').read_text('utf8'))
for row in old:row['sourceLock']='tmp/v18-patches/source-lock.json'
for row in new['patches']:row['sourceLock']='tmp/v18-hand-patches/source-lock.json'
final={**new,'sourceLock':'tmp/v18-hand-patches/source-lock.json','patches':sorted(old+new['patches'],key=lambda x:x['start'])}
for a,b in zip(final['patches'],final['patches'][1:]):assert a['end']<b['start']
plan=ROOT/'tmp/v18-final-plan.json';plan.write_text(json.dumps(final,ensure_ascii=False,indent=2),'utf8')
reviewplan=ROOT/'tmp/v18-final-review-plan.json';frames=set(json.loads(reviewplan.read_text('utf8'))['frames'])
for p in final['patches']:
 for n in [p['start'],p['end']+1]:frames.update(f for f in [n-2,n-1,n,n+1,n+2] if 0<=f<26738)
reviewplan.write_text(json.dumps({'frames':sorted(frames)},indent=2),'utf8')
print('All final patches ready; starting complete composition and media verification.',flush=True)
subprocess.run([sys.executable,'scripts/compose_v18.py','--plan','tmp/v18-final-plan.json','--compose'],cwd=ROOT,check=True)
