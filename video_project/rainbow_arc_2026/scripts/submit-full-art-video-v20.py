"""Submit selected V20 full-art first/last-frame Wan bridges.

This is intentionally a small auditable runner for the new full-art spec. It
never touches the existing V20 bridge manifest and writes task records under
output-v20/work/qwen-full-art-video.
"""
from __future__ import annotations
import argparse,base64,datetime as dt,hashlib,json,os,re,time
from pathlib import Path
from urllib.parse import urlparse
import requests
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];OUTPUT=Path(json.loads((ROOT/'work/output-root-v20.json').read_text('utf8'))['outputRoot']);WORK=OUTPUT/'work/qwen-full-art-video';SPEC=ROOT/'research/qwen-v20-full-art-video-specs.json';HOST=os.environ.get('DASHSCOPE_API_HOST','https://dashscope.aliyuncs.com').rstrip('/')
def utc():return dt.datetime.now(dt.timezone.utc).isoformat()
def sha(p):
 h=hashlib.sha256();
 with p.open('rb') as f:
  for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
 return h.hexdigest()
def atomic(p,d):p.parent.mkdir(parents=True,exist_ok=True);t=p.with_suffix('.pending');t.write_text(json.dumps(d,ensure_ascii=False,indent=2),'utf8');t.replace(p)
def safe(x):return x if isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}',x) else None
def key(s):
 for field in ('QWEN_API_KEY_PRIMARY','QWEN_API_KEY_BACKUP'):
  k=os.environ.get(field)
  if not k:continue
  r=s.get(HOST+'/compatible-mode/v1/models',headers={'Authorization':'Bearer '+k},timeout=30)
  if r.status_code==200:return k,field
 raise RuntimeError('Qwen credential probe failed')
def ref(path):
 p=(ROOT/path).resolve();
 if not p.is_relative_to(OUTPUT.resolve()) or not p.is_file():raise RuntimeError(f'Invalid endpoint {p}')
 with Image.open(p) as im:
  if im.size!=(1920,1080):raise RuntimeError(f'Endpoint not 1920x1080 {p}')
 return p,'image/png'
def main():
 ap=argparse.ArgumentParser();ap.add_argument('--only',default='full_a01_bridge,full_a03_bridge,full_a04_bridge,full_d01_bridge,full_d06_bridge,full_d11_bridge,full_f03_bridge');ap.add_argument('--submit',action='store_true');ap.add_argument('--poll',action='store_true');a=ap.parse_args();spec=json.loads(SPEC.read_text('utf8'));shots=[x for x in spec['shots'] if x['id'] in set(a.only.split(','))];
 if not shots:raise RuntimeError('No selected clips')
 if not (a.submit or a.poll):print('planned',*[x['id'] for x in shots]);return 0
 s=requests.Session();k,field=key(s);WORK.mkdir(parents=True,exist_ok=True)
 for shot in shots:
  out=WORK/'generated'/shot['id'];out.mkdir(parents=True,exist_ok=True);p=out/'provenance.json';existing=json.loads(p.read_text('utf8')) if p.exists() else None
  if existing and not a.poll: continue
  if a.poll and existing and existing.get('status') in {'running','succeeded'}:
   r=s.get(HOST+'/api/v1/tasks/'+existing['taskId'],headers={'Authorization':'Bearer '+k},timeout=40);data=r.json().get('output',{});state=data.get('task_status');existing['providerStatus']=state;existing['lastQueryUTC']=utc()
   if state=='SUCCEEDED':
    url=data.get('video_url',''); u=urlparse(url)
    if u.scheme!='https' or not (u.hostname or '').endswith('.aliyuncs.com'): existing.update(status='succeeded',errorCode='UnexpectedProviderHost')
    else:
     target=out/'provider.mp4';part=out/'provider.mp4.part'
     if not target.exists():
      with s.get(url,timeout=(30,300),stream=True) as dl:
       dl.raise_for_status()
       with part.open('xb') as f:
        for block in dl.iter_content(1024*1024):f.write(block)
      part.replace(target)
     existing.update(status='succeeded',providerSHA256=sha(target),nativeVideo=str(target),videoURLAvailable=False,downloadHost=u.hostname)
   elif state in {'FAILED','CANCELED'}:existing.update(status=state.lower(),errorCode=safe(data.get('code')))
   atomic(p,existing);print(shot['id'],existing['status']);continue
  if not a.submit:continue
  fs,_=ref(Path('output-v20/work/qwen-full-art/generated')/shot['references']['firstImage']/'keyframe-1920x1080.png');ls,_=ref(Path('output-v20/work/qwen-full-art/generated')/shot['references']['lastImage']/'keyframe-1920x1080.png')
  content={'model':spec['model'],'input':{'prompt':shot['prompt'],'media':[{'type':'first_frame','url':'data:image/png;base64,'+base64.b64encode(fs.read_bytes()).decode()},{'type':'last_frame','url':'data:image/png;base64,'+base64.b64encode(ls.read_bytes()).decode()}]},'parameters':{'resolution':'1080P','duration':shot['duration'],'prompt_extend':False,'watermark':False}}
  row={'version':'V20-full-art-video','id':shot['id'],'status':'submitting','model':spec['model'],'segment':shot['segment'],'plannedTimeline':shot['plannedTimeline'],'prompt':shot['prompt'],'firstSHA256':sha(fs),'lastSHA256':sha(ls),'submittedUTC':utc(),'credentialField':field,'credentialsPersisted':False}
  atomic(p,row)
  r=s.post(HOST+'/api/v1/services/aigc/video-generation/video-synthesis',headers={'Authorization':'Bearer '+k,'Content-Type':'application/json','X-DashScope-Async':'enable'},json=content,timeout=(30,120));
  try:data=r.json()
  except ValueError:data={}
  task=safe(data.get('output',{}).get('task_id'));row.update(httpStatus=r.status_code,requestId=safe(data.get('request_id')))
  if task:row.update(status='running',taskId=task)
  else:row.update(status='rejected',errorCode=safe(data.get('code')) or 'HTTP_'+str(r.status_code))
  atomic(p,row);print(json.dumps({'id':shot['id'],'status':row['status'],'taskId':row.get('taskId')},ensure_ascii=False))
 return 0
if __name__=='__main__':
 try:raise SystemExit(main())
 except Exception as e:print(type(e).__name__,str(e));raise SystemExit(2)
