"""Freeze and summarize selected v16 media without changing any prior generation."""
from pathlib import Path
import datetime as dt
import hashlib
import json

ROOT=Path(__file__).resolve().parents[1]
AUDIT=ROOT/'research/generation'
def read(p): return json.loads(p.read_text('utf8'))
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()
ledger=read(AUDIT/'v16-qwen-tasks.json')
specs=read(AUDIT/'v16-qwen-specs.json')
manifest=read(AUDIT/'launch-v16-bridges.json')
if any(t['status'] in ('PENDING','RUNNING','submitting','submission_unconfirmed') for t in ledger['tasks'].values()):
 raise RuntimeError('Unresolved provider task; cannot freeze or claim completion')
selected=[]
for b in manifest['bridges']:
 p=ROOT/'public'/b['asset']
 if not p.is_file() or sha(p)!=b['sha256']:raise RuntimeError('Missing or changed selected media')
 task=ledger['tasks'][b['id']]
 qa=read(ROOT/task['qa'])
 if task['status']!='SUCCEEDED' or task['editorialSelection']!='selected':raise RuntimeError('Unreviewed media')
 selected.append({'id':b['id'],'taskId':task['taskId'],'asset':b['asset'],'fromSeconds':b['fromFrame']/60,'toSeconds':b['fromFrame']/60+b['sourceDurationSeconds'],'sourceSeconds':b['sourceDurationSeconds'],'sourceFps':b['sourceFps'],'sha256':b['sha256'],'qa':task['qa'],'sampledFrames':len(qa['sampleSeconds']),'fullDecode':qa['technicalChecks']['fullVideoDecodePassed']})
result={'version':16,'createdAt':dt.datetime.now(dt.timezone.utc).isoformat(),'provider':'Alibaba Cloud Model Studio / WAN','model':specs['model'],'selectedCount':len(selected),'selectedSeconds':sum(s['sourceSeconds'] for s in selected),'submittedTaskCount':len(ledger['tasks']),'nominalReservedCNY':sum(t['estimatedMaxCostCNY'] for t in ledger['tasks'].values() if t['status']!='FAILED_BEFORE_TASK'),'actualBillCNY':None,'freeQuotaKnown':False,'selected':selected,'reviewScope':'Full video-stream decode, 21 chronological sampled frames per clip, exact native endpoint comparison; not a claim of real-time playback viewing.','provenanceDisclosure':'External delivery documentation, no AI transition label in picture at user request.','scope':'Appearance/camera concepts only. UI, physics values, BESO states and saved Zwind evidence rendered separately.','priorGenerationPreserved':True,'manifestSHA256':sha(AUDIT/'launch-v16-bridges.json')}
(AUDIT/'v16-qwen-final-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),'utf8')
specs['generationClosed']=True
(AUDIT/'v16-qwen-specs.json').write_text(json.dumps(specs,ensure_ascii=False,indent=2),'utf8')
print('FROZEN',len(selected),'selected clips;',result['selectedSeconds'],'seconds')
