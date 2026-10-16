"""Six bounded endpoint-conditioned WAN shots, auditable and credential-free.

Keys come only from the existing environment. Unknown submissions are never
automatically repeated. Official CN price checked 2026-10-11: 1080P 1 CNY/s,
6 clips x 5s + 3 rejected-ocean replacements = 45 CNY maximum nominal
generation charge for this revision, bill unreconciled.
"""
from pathlib import Path
import base64,datetime,hashlib,json,os,sys
import requests
R=Path(__file__).resolve().parents[1]
OUT=R/'public/generated/v4';REC=R/'research/generation/qwen-v4-tasks.json'
SPECS=R/'research/generation/qwen-v4-specs.json'
BASE='https://dashscope.aliyuncs.com';MODEL='wan2.7-i2v-2026-04-25'
sys.stdout.reconfigure(encoding='utf8')
def now():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def state():return json.loads(REC.read_text('utf8')) if REC.exists() else {}
def save(s):REC.write_text(json.dumps(s,ensure_ascii=False,indent=2),'utf8')
def credentials():
    seen=set()
    for n in ['QWEN_API_KEY_PRIMARY','DASHSCOPE_API_KEY','QWEN_API_KEY','QWEN_API_KEY_BACKUP']:
        k=os.environ.get(n,'').strip()
        if k and k not in seen:seen.add(k);yield n,k
def auth():
    for n,k in credentials():
        r=requests.get(BASE+'/api/v1/tasks/00000000-0000-0000-0000-000000000000',headers={'Authorization':'Bearer '+k},timeout=30)
        if r.status_code not in (401,403):return n,k
    raise RuntimeError('No authenticated Qwen media key in existing runtime')
def frame(p):return 'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()
def submit(name):
    specs=json.loads(SPECS.read_text('utf8'));spec=specs[name];s=state();old=s.get(name,{})
    if old.get('status') in ['submitting','submission_unconfirmed','PENDING','RUNNING','SUCCEEDED']:raise RuntimeError(name+' has a task; resume rather than duplicate')
    n,k=auth();inputs=[OUT/spec['first'],OUT/spec['last']]
    for p in inputs:
        if not p.exists():raise FileNotFoundError(p)
    params={'resolution':'1080P','duration':5,'prompt_extend':False,'watermark':False,'seed':202610112}
    d={'provider':'Alibaba Cloud Model Studio / WAN','model':MODEL,'credentialSource':n,'status':'submitting','submittedAt':now(),'purpose':'Editorial conceptual transition only. No numerical, solver, stress, displacement, engineering-success or product-execution claim.','estimatedMaxCostCNY':5,'actualCostCNY':None,'pricingSource':'https://help.aliyun.com/zh/model-studio/model-pricing','pricingCheckedAt':'2026-10-11','parameters':params,'prompt':spec['prompt'],'sourceFrameHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in inputs}}
    s[name]=d;save(s)
    payload={'model':MODEL,'input':{'prompt':spec['prompt'],'media':[{'type':'first_frame','url':frame(inputs[0])},{'type':'last_frame','url':frame(inputs[1])}]},'parameters':params}
    try:r=requests.post(BASE+'/api/v1/services/aigc/video-generation/video-synthesis',headers={'Authorization':'Bearer '+k,'Content-Type':'application/json','X-DashScope-Async':'enable'},json=payload,timeout=180)
    except requests.RequestException as e:
        d.update(status='submission_unconfirmed',error=type(e).__name__);s[name]=d;save(s);raise RuntimeError('Submission unknown; must reconcile, never automatically retry') from None
    try:j=r.json()
    except ValueError:j={}
    d.update(http=r.status_code,requestId=j.get('request_id'))
    if not r.ok or not j.get('output',{}).get('task_id'):
        d.update(status='FAILED_BEFORE_TASK',error=j.get('code','HTTP_ERROR'));s[name]=d;save(s);print(name,d['status'],d.get('error'));return
    d.update(taskId=j['output']['task_id'],status=j['output'].get('task_status','PENDING'));s[name]=d;save(s);print(name,d['status'],d['taskId'])
def poll(name):
    s=state();d=s[name]
    if d.get('status')=='SUCCEEDED' and d.get('asset') and (R/d['asset']).exists():print(name,'SUCCEEDED','cached');return
    if not d.get('taskId'):raise RuntimeError('No confirmed task for '+name)
    k=os.environ.get(d['credentialSource'],'').strip()
    if not k:raise RuntimeError('Original credential source absent from runtime')
    r=requests.get(BASE+'/api/v1/tasks/'+d['taskId'],headers={'Authorization':'Bearer '+k},timeout=45)
    j=r.json();o=j.get('output',{})
    d.update(status=o.get('task_status','UNKNOWN'),lastPolledAt=now(),usage=j.get('usage'),error=o.get('code',j.get('code')))
    if d['status']=='SUCCEEDED':
        u=o.get('video_url') or next((x.get('url') for x in o.get('results',[]) if x.get('url')),None)
        if not u:raise RuntimeError('Successful job has no recognized output URL')
        dest=OUT/(name+'.mp4')
        if not dest.exists():
            b=requests.get(u,timeout=240);b.raise_for_status();dest.write_bytes(b.content)
        d.update(asset=str(dest.relative_to(R)).replace('\\','/'),sha256=hashlib.sha256(dest.read_bytes()).hexdigest(),completedAt=now())
    s[name]=d;save(s);print(name,d['status'],d.get('asset',''),d.get('error',''))
if __name__=='__main__':
    if len(sys.argv)!=3 or sys.argv[1] not in ['submit','poll']:raise SystemExit('usage: submit|poll NAME')
    (submit if sys.argv[1]=='submit' else poll)(sys.argv[2])
