"""One authorized, resumable 5-second Wan atmosphere bridge. Never logs tokens/URLs."""
import os, sys, json, hashlib, uuid
from pathlib import Path
from datetime import datetime,timezone
import requests
ROOT=Path(__file__).resolve().parents[1]
STATE=ROOT/'research/tool-wan-task.json'
BASE='https://dashscope.aliyuncs.com/api/v1'
MODEL='wan2.6-i2v';SLOT='QWEN_API_KEY_BACKUP'
SOURCE=ROOT/'public/3d/wan-bridge-source.png';TARGET=ROOT/'public/bridges/wan-lab-macro.mp4'
def now():return datetime.now(timezone.utc).isoformat()
def save(state):STATE.write_text(json.dumps(state,ensure_ascii=False,indent=2),encoding='utf8')
def key():return os.environ[SLOT]
def headers():return {'Authorization':'Bearer '+key()}
PROMPT='A premium cinematic science documentary macro shot in a pearl white laboratory. Preserve exactly these delicate aqua glass microfluidic channels, champagne metal ports and translucent sample vial. One uninterrupted camera move: an extremely smooth slow low dolly forward and slightly left, following the subtle serpentine aqua channel on the left chip. Gently rack focus from the foreground glass rim onto the clear fluid channel. Beautiful shallow depth of field, soft diffused studio light, realistic subtle refractions and tiny restrained glints; light fluid flows inside the channel. Stable exposure, stable rigid objects, no morphing, no scene change, no cuts, no added objects, no smoke. The vial remains soft in the background; generous soft ivory negative space in the upper left. Silent footage. No text, no letters, no numbers, no logos, no watermark, no UI.'
if sys.argv[1]=='submit':
    if STATE.exists():raise SystemExit('State exists: query original task; no resubmission.')
    r=requests.get(BASE+'/uploads',params={'action':'getPolicy','model':MODEL},headers=headers(),timeout=40);r.raise_for_status();p=r.json()['data']
    fields={'OSSAccessKeyId':p['oss_access_key_id'],'Signature':p['signature'],'policy':p['policy'],'key':p['upload_dir']+'/'+uuid.uuid4().hex+'-'+SOURCE.name,'x-oss-object-acl':p['x_oss_object_acl'],'x-oss-forbid-overwrite':p['x_oss_forbid_overwrite'],'success_action_status':'200','x-oss-content-type':'image/png'}
    with SOURCE.open('rb') as f:
        r=requests.post(p['upload_host'],data=fields,files={'file':f},timeout=180);r.raise_for_status()
    payload={'model':MODEL,'input':{'img_url':'oss://'+fields['key'],'prompt':PROMPT},'parameters':{'resolution':'1080P','duration':5,'audio':False,'prompt_extend':False,'seed':261011,'watermark':False}}
    state={'provider':'Alibaba Cloud DashScope Wan','model':MODEL,'credentialSlot':SLOT,'createdAt':now(),'status':'submission_started','source':str(SOURCE.relative_to(ROOT)).replace('\\','/'),'sourceSha256':hashlib.sha256(SOURCE.read_bytes()).hexdigest(),'prompt':PROMPT,'parameters':payload['parameters'],'intendedUse':'Non-evidentiary atmospheric bridge only, no numeric/algorithm claims.'};save(state)
    try:r=requests.post(BASE+'/services/aigc/video-generation/video-synthesis',json=payload,headers={**headers(),'Content-Type':'application/json','X-DashScope-Async':'enable','X-DashScope-OssResourceResolve':'enable'},timeout=120)
    except requests.RequestException as e:
        state.update(status='submission_unknown',errorType=type(e).__name__);save(state);raise SystemExit('Submission uncertain. Never retry automatically.')
    data=r.json();out=data.get('output',{});state.update(httpStatus=r.status_code,requestId=data.get('request_id'),status=out.get('task_status','rejected'),taskId=out.get('task_id'),errorCode=data.get('code'),errorMessage=data.get('message'));save(state)
    print(json.dumps({k:state[k] for k in ('status','taskId','httpStatus','errorCode')},ensure_ascii=False))
elif sys.argv[1]=='query':
    state=json.loads(STATE.read_text(encoding='utf8'))
    if not state.get('taskId'):raise SystemExit('No task ID: do not resubmit.')
    r=requests.get(BASE+'/tasks/'+state['taskId'],headers=headers(),timeout=60);r.raise_for_status();data=r.json();out=data.get('output',{})
    state.update(status=out.get('task_status','UNKNOWN'),updatedAt=now(),usage=data.get('usage'),lastRequestId=data.get('request_id'))
    if state['status']=='SUCCEEDED' and not state.get('output'):
        r=requests.get(out['video_url'],timeout=180);r.raise_for_status();TARGET.parent.mkdir(parents=True,exist_ok=True);TARGET.write_bytes(r.content)
        state.update(output={'path':str(TARGET.relative_to(ROOT)).replace('\\','/'),'sha256':hashlib.sha256(r.content).hexdigest(),'bytes':len(r.content)},localCompletedAt=now())
    if state['status']=='FAILED':state.update(errorCode=out.get('code'),errorMessage=out.get('message'))
    save(state);print(json.dumps({k:state[k] for k in ['status','taskId','output','errorCode','errorMessage'] if k in state},ensure_ascii=False))
