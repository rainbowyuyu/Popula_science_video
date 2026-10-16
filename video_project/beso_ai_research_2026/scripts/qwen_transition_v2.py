"""Submit and retrieve auditable Qwen/WAN concept transitions for LaunchFilm v2.

The clips are editorial bridges only. They never carry numerical, solver, or
physical-evidence claims. API credentials are read from the environment and
never written to the task record.
"""
from pathlib import Path
import base64, hashlib, json, os, sys, time
import requests

R=Path(__file__).resolve().parents[1]
GEN=R/'public/generated'; GEN.mkdir(parents=True,exist_ok=True)
REC=R/'research/generation/qwen-v2-tasks.json'
BASE='https://dashscope.aliyuncs.com'
MODEL='wan2.7-i2v-2026-04-25'

TASKS={
  'paper-to-platform': {
    'first':'bridge-first.png','last':'bridge-last.png','duration':5,
    'prompt':('高级科学纪录片式连续转场：首帧是一张象牙白工程蓝图，蓝色线稿沿纸面法线缓慢抬升，'
      '纸张逐渐成为无影摄影棚地面，三支臂浮式风电基础从图纸中长出，完成为同一比例的浅蓝金属实体。'
      '保持三支臂、中心塔筒、三座浮筒和连接撑杆的数量、轮廓、孔洞与尾帧一致。摄影机先掠过纸面再低位绕行，'
      '镜头运动连续、材质柔和、景深克制、阴影真实。禁止跳切、爆炸、液化、额外支臂、文字、数字、logo、水印和人物。'
      '这是二维到三维的概念转场，不表达求解结果。')
  },
  'model-to-wave': {
    'first':'bridge-last.png','last':'lux3d-preview.png','duration':5,
    'prompt':('高级工程宣传片连续镜头：从完整的三支臂浮式风电基础实体开始，摄影机沿一根撑杆滑行，'
      '浅蓝金属表面逐渐反射出深蓝海面，水线从画面下方自然升起，柔和浪流绕过浮筒和系泊，'
      '最后稳定到尾帧同一平台的近景模型。保持三支臂、中心塔筒、三座浮筒、连接撑杆和叶片数量一致，'
      '比例与位置连续，风机结构真实克制，水面有细小泡沫和反射但不遮挡主体。摄影机一镜到底，'
      '无跳切、无粒子爆炸、无熔化、无文字、无数字、无logo、无水印、无人手。这是视觉融合转场，不是CFD或计算结果。')
  }
}

def save(d): REC.write_text(json.dumps(d,ensure_ascii=False,indent=2),'utf8')
def creds():
  for n in ['QWEN_API_KEY_PRIMARY','DASHSCOPE_API_KEY','QWEN_API_KEY','QWEN_API_KEY_BACKUP']:
    k=os.environ.get(n,'').strip()
    if k: yield n,k
def auth():
  for n,k in creds():
    r=requests.get(BASE+'/api/v1/tasks/00000000-0000-0000-0000-000000000000',headers={'Authorization':'Bearer '+k},timeout=30)
    try:j=r.json()
    except Exception:j={}
    if r.status_code not in (401,403): return n,k
  raise RuntimeError('No authenticated Qwen media key in environment')
def data_url(p): return 'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()
def source_path(name):
  return (R/'public/assets'/name) if name=='lux3d-preview.png' else (GEN/name)
def state():
  if REC.exists(): return json.loads(REC.read_text('utf8'))
  return {}
def submit(name):
  spec=TASKS[name]; allstate=state(); old=allstate.get(name,{})
  if old.get('status') in ('PENDING','RUNNING','SUCCEEDED','submitting','submission_unconfirmed'): raise RuntimeError(f'{name} already has unresolved task')
  source=[source_path(spec['first']),source_path(spec['last'])]
  for p in source:
    if not p.exists(): raise FileNotFoundError(p)
  cred,key=auth()
  params={'resolution':'1080P','duration':spec['duration'],'prompt_extend':False,'watermark':False,'seed':20261011}
  payload={'model':MODEL,'input':{'prompt':spec['prompt'],'media':[{'type':'first_frame','url':data_url(source[0])},{'type':'last_frame','url':data_url(source[1])}]},'parameters':params}
  rec={'provider':'Alibaba Cloud Model Studio / WAN','model':MODEL,'credentialSource':cred,'status':'submitting','purpose':'Editorial concept transition only; no numerical or physical evidence','parameters':params,'prompt':spec['prompt'],'sourceFrameHashes':{p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in source}}
  allstate[name]=rec;save(allstate)
  try:
    r=requests.post(BASE+'/api/v1/services/aigc/video-generation/video-synthesis',headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','X-DashScope-Async':'enable'},json=payload,timeout=180)
  except requests.RequestException as err:
    rec.update(status='submission_unconfirmed',error=type(err).__name__);allstate[name]=rec;save(allstate)
    raise RuntimeError('Submission status uncertain; do not retry until reconciled') from None
  try:j=r.json()
  except Exception:j={}
  rec.update(http=r.status_code,requestId=j.get('request_id'))
  if not r.ok or not j.get('output',{}).get('task_id'):
    rec.update(status='FAILED_BEFORE_TASK',error=j.get('code','HTTP_ERROR'));allstate[name]=rec;save(allstate);raise RuntimeError(rec['error'])
  rec.update(taskId=j['output']['task_id'],status=j.get('output',{}).get('task_status','PENDING'));allstate[name]=rec;save(allstate)
  print(name,rec['status'],rec['taskId'])
def poll(name):
  allstate=state(); rec=allstate.get(name)
  if not rec or not rec.get('taskId'): raise RuntimeError(f'No task for {name}')
  key=os.environ.get(rec['credentialSource'],'').strip()
  if not key: raise RuntimeError('Credential source is not available in environment')
  r=requests.get(BASE+'/api/v1/tasks/'+rec['taskId'],headers={'Authorization':'Bearer '+key},timeout=45);j=r.json();out=j.get('output',{})
  rec.update(status=out.get('task_status','UNKNOWN'),usage=j.get('usage'),error=out.get('code',j.get('code')))
  if rec['status']=='SUCCEEDED':
    url=out.get('video_url') or next((x.get('url') for x in out.get('results',[]) if x.get('url')),None)
    if not url: raise RuntimeError('Successful task has no video URL')
    dest=GEN/(name+'.mp4')
    if not dest.exists():
      b=requests.get(url,timeout=240);b.raise_for_status();dest.write_bytes(b.content)
    rec.update(asset='public/generated/'+dest.name,sha256=hashlib.sha256(dest.read_bytes()).hexdigest())
  allstate[name]=rec;save(allstate);print(name,rec['status'],rec.get('asset'),rec.get('error'))
if __name__=='__main__':
  extra=R/'research/generation/qwen-v2-matched-specs.json'
  if extra.exists(): TASKS.update(json.loads(extra.read_text('utf8')))
  if len(sys.argv)<3 or sys.argv[1] not in ('submit','poll') or sys.argv[2] not in TASKS: raise SystemExit('usage: submit|poll paper-to-platform|model-to-wave')
  (submit if sys.argv[1]=='submit' else poll)(sys.argv[2])
