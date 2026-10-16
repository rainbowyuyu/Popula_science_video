"""One authorized environment asset. Keys remain in user configuration/environment."""
import sys, json, os, hashlib
from pathlib import Path
from datetime import datetime, timezone

HERE=Path(__file__).resolve().parent
ROOT=HERE.parents[2]
SKILL=Path('C:/Users/zju/.codex/plugins/cache/lux3d/aholo-lux3d/0.1.1/skills/lux3d')
sys.path.insert(0,str(SKILL/'core/runtime'))
import lux3d_client as client
cfgpath=Path.home()/'.config/lux3d/credentials.json'
region='cn'
if cfgpath.exists():
    cfg=json.loads(cfgpath.read_text(encoding='utf-8-sig'));region=cfg['region']
    os.environ[{'cn':'LUX3D_CN_API_KEY','international':'LUX3D_GLOBAL_API_KEY'}[region]]=cfg['apiKeys'][region]
statepath=HERE/'lux3d-attempt.json'
now=lambda:datetime.now(timezone.utc).isoformat()
save=lambda data:statepath.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
operation=sys.argv[1]
if operation=='submit':
    if statepath.exists():raise SystemExit('Attempt already exists; use query, do not duplicate submission.')
    quote=json.loads((HERE/'lux3d-quote.json').read_text(encoding='utf-8-sig'))
    req=json.loads((HERE/'lux3d-request.json').read_text())['1']['parameters']['body']
    expiry=datetime.fromisoformat(quote['quote']['expiresAt'])
    if datetime.now(timezone.utc)>expiry:raise SystemExit('Quote expired')
    state={'itemId':'riverfront-railing','attemptId':'riverfront-railing-v16-a1','region':region,'operation':'text-to-3d','parameters':req,'quoteId':quote['quote']['quoteId'],'estimatedCredits':quote['quote']['estimatedCreditsTotal'],'accountRef':quote['account']['accountRef'],'authorization':'User authorized Qwen/Lux3D automatic execution under available balance in approved cinematic plan; reaffirmed current request. Single environment detail asset, no tower replacement.','retryCount':0,'createdAt':now(),'status':'submission_started'}
    save(state)
    try:state['taskId']=client.create_text_to_3d_task(**req,region=region);state['status']='submitted';state['updatedAt']=now();save(state)
    except Exception as exc:state.update(status='submission_unknown',errorType=type(exc).__name__);save(state);raise SystemExit(type(exc).__name__)
    print(json.dumps({'taskId':state['taskId'],'status':state['status'],'estimatedCredits':state['estimatedCredits']}))
elif operation=='query':
    state=json.loads(statepath.read_text());data=client.get_task(state['taskId'],region=state['region'])
    state.update(lastKnownProviderStatus=data['status'],updatedAt=now())
    state['status']={0:'initialized',1:'running',3:'generated',4:'failed',6:'cancelled'}[data['status']]
    if data['status']==3 and not state.get('downloadedArtifacts'):
        formats=client.generation_result_formats(state['parameters']['version'],state['parameters']['outputFormat'])
        outputs=client.parse_task_outputs(data)
        target=HERE/'originals/riverfront-railing.glb';target.parent.mkdir(parents=True,exist_ok=True)
        downloaded=client.download_requested_models(outputs,str(target),formats)
        state['expectedFormats']=formats
        state['downloadedArtifacts']=[{'path':str(p),'format':'glb','bytes':n,'sha256':hashlib.sha256(Path(p).read_bytes()).hexdigest()} for p,n in downloaded]
        state['status']='downloaded';state['localCompletedAt']=now()
    save(state)
    print(json.dumps({k:state[k] for k in ['taskId','status','lastKnownProviderStatus','downloadedArtifacts'] if k in state},ensure_ascii=False))
