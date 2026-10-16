"""Resumable single Lux3D asset, charged against explicit 100-credit budget."""
import sys,json,subprocess,hashlib
from pathlib import Path
from datetime import datetime,timezone
ROOT=Path(__file__).resolve().parents[1]
SKILL=Path('C:/Users/zju/.codex/plugins/cache/lux3d/aholo-lux3d/0.1.1/skills/lux3d')
sys.path.insert(0,str(SKILL/'core/runtime'));import lux3d_client as api
STATE=ROOT/'research/tool-lux-attempt.json';LEDGER=ROOT/'research/tool-lux-budget.json';QUOTE=ROOT/'research/tool-lux-quote-current.json'
ITEM='vial-holder-v3-attempt-1'
def now():return datetime.now(timezone.utc).isoformat()
def save(path,data):path.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
if sys.argv[1]=='submit':
    if STATE.exists():raise SystemExit('Attempt exists: query original task; never resubmit.')
    if not LEDGER.exists():
        save(LEDGER,{'schema':'agent-managed-lux-budget/v1','mode':'automatic','authorizedCredits':100,'authorization':'User explicit answer in current parent conversation: 自动执行，累计预算100 credits。 Root delegated sole ledger ownership to providers_assets_v3. Covers current and later requests/retries from this decision onward.','createdAt':now(),'committedCredits':0,'reservedCredits':20,'remainingCredits':80,'entries':{ITEM:{'status':'reserved','quotedCredits':20,'region':'cn'}}})
    ledger=json.loads(LEDGER.read_text(encoding='utf8'))
    result=subprocess.run([sys.executable,str(SKILL/'scripts/commerce.py'),'quote','--region','cn','--items',str(ROOT/'research/tool-lux-quote-items.json')],capture_output=True,text=True)
    if result.returncode:
        save(ROOT/'research/tool-lux-quote-error.json',{'status':'quote-failed','at':now(),'error':result.stderr});raise SystemExit('Quote failed; no create call.')
    quote=json.loads(result.stdout);save(QUOTE,quote)
    cost=quote['quote']['estimatedCreditsTotal']
    if cost>ledger['remainingCredits']+ledger['reservedCredits']:raise SystemExit('Budget exceeded; no create call.')
    params=json.loads((ROOT/'research/tool-lux-quote-items.json').read_text())['1']['parameters']['body']
    state={'schema':'lux3d.workflow-state/v2','itemId':'vial-holder-v3','attemptId':ITEM,'region':'cn','accountRef':quote['account']['accountRef'],'quoteId':quote['quote']['quoteId'],'createdAt':now(),'updatedAt':now(),'status':'submitting','request':{'operation':'text-to-3d','region':'cn',**params},'expectedFormats':api.generation_result_formats(params['version'],params['outputFormat']),'downloadedArtifacts':[],'retryCount':0}
    save(STATE,state)
    ledger['committedCredits']+=cost;ledger['reservedCredits']=0;ledger['remainingCredits']=ledger['authorizedCredits']-ledger['committedCredits'];ledger['entries'][ITEM].update(status='submission-started',quotedCredits=cost,quoteId=state['quoteId'],submittedAt=now());save(LEDGER,ledger)
    try:task=api.create_text_to_3d_task(region='cn',**params)
    except Exception as e:
        state.update(status='submission_unknown',errorType=type(e).__name__,updatedAt=now());save(STATE,state);raise SystemExit('Uncertain submission. No automatic retry: '+type(e).__name__)
    state.update(status='queued',taskId=task,updatedAt=now());save(STATE,state)
    ledger['entries'][ITEM].update(status='submitted',taskId=task);save(LEDGER,ledger)
    print(json.dumps({'status':'submitted','taskId':task,'quotedCredits':cost,'remainingCredits':ledger['remainingCredits']}))
elif sys.argv[1]=='query':
    state=json.loads(STATE.read_text(encoding='utf8'))
    if not state.get('taskId'):raise SystemExit('No ID. Reconcile original call; never resubmit.')
    task=api.get_task(state['taskId'],region='cn');provider=task['status'];state.update(lastKnownProviderStatus=provider,updatedAt=now())
    statusmap={0:'queued',1:'running',3:'succeeded',4:'failed',6:'canceled'}
    state['status']=statusmap[provider]
    if provider==3 and not state['downloadedArtifacts']:
        out=ROOT/'public/3d/lux-vial-holder-source';out.mkdir(parents=True,exist_ok=True)
        outputs=api.parse_task_outputs(task)
        files=api.download_requested_models(outputs,str(out/'vial-holder'),state['expectedFormats'])
        state['downloadedArtifacts']=[{'path':str(Path(p).resolve()),'format':f,'bytes':n,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()} for (p,n),f in zip(files,state['expectedFormats'])]
        state['localCompletedAt']=now()
    save(STATE,state)
    print(json.dumps({k:state[k] for k in ['status','taskId','lastKnownProviderStatus','downloadedArtifacts']}))
