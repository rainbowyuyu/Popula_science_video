"""V20 sequential watercolor keyframes, one immutable official image request per ID.

Default prepares. --submit submits selected planned images. B edits A and C edits B.
Credentials live in process memory only. Unknown POST status is never auto-retried.
"""
from __future__ import annotations
import argparse, base64, datetime as dt, hashlib, json, os, re, shutil, sys
from types import SimpleNamespace
from pathlib import Path
from urllib.parse import urlparse
import requests
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(json.loads((ROOT/'work/output-root-V20.json').read_text('utf8'))['outputRoot'])
WORK=OUTPUT/'work/qwen-art-V20'
SPEC=ROOT/'research/qwen-V20-art-specs.json'
MODEL='qwen-image-2.0-pro'
if hasattr(sys.stdout,'reconfigure'):sys.stdout.reconfigure(encoding='utf8')

HOST=os.environ.get('DASHSCOPE_API_HOST','https://dashscope.aliyuncs.com').rstrip('/')
def utc():return dt.datetime.now(dt.timezone.utc).isoformat()
def sha(path):
    h=hashlib.sha256()
    with Path(path).open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()
def atomic_json(path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists() and path.stat().st_nlink!=1:raise RuntimeError('Refusing shared provenance mutation')
    tmp=path.with_suffix(path.suffix+'.pending')
    if tmp.exists():raise RuntimeError('Pending provenance requires inspection')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),'utf8');tmp.replace(path)
def safe_code(x):return x if isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,80}',x) else None
def safe_id(x):return x if isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_-]{16,128}',x) else None
def credential(session):
    u=urlparse(HOST)
    if u.scheme!='https' or u.username or u.password or u.path or u.query or u.fragment or (u.hostname not in {'dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com'} and not re.fullmatch(r'[A-Za-z0-9-]+\.(cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com',u.hostname or '')):raise RuntimeError('Only official HTTPS API host is allowed')
    seen=[];probes=[]
    for field in ['QWEN_API_KEY_PRIMARY','QWEN_API_KEY_BACKUP']:
        key=os.environ.get(field)
        if not key or key in seen:continue
        seen.append(key)
        try:
            r=session.get(HOST+'/compatible-mode/v1/models',headers={'Authorization':'Bearer '+key},timeout=30)
            try:d=r.json()
            except ValueError:d={}
            probes.append({'field':field,'httpStatus':r.status_code,'errorCode':safe_code(d.get('code') or d.get('error',{}).get('code')),'readOnly':True,'timeUTC':utc()})
            if r.status_code==200:atomic_json(WORK/'credential-probe-latest.json',{'credentialsPersisted':False,'probes':probes,'selectedField':field});return key,field
            if r.status_code!=401:break
        except requests.RequestException as e:probes.append({'field':field,'errorType':type(e).__name__,'readOnly':True,'timeUTC':utc()});break
    atomic_json(WORK/'credential-probe-latest.json',{'credentialsPersisted':False,'probes':probes,'selectedField':None});raise RuntimeError('Runtime credentials unavailable; inspect safe probe')
def input_file(name):
    p=Path(name).absolute()
    for q in [p,*p.parents]:
        if q.exists() and (q.is_symlink() or getattr(q,'is_junction',lambda:False)() or bool(getattr(q.lstat(),'st_file_attributes',0)&0x400)):raise RuntimeError('Input may not traverse reparse points')
    p=p.resolve()
    if not p.is_relative_to(OUTPUT.resolve()) or not p.is_file():raise RuntimeError('Input must be an actual output image')
    with Image.open(p) as im:
        if im.mode!='RGB' or im.size!=(1920,1080):raise RuntimeError('Input must be clean RGB 1920x1080')
    return p,{'file':str(p),'sha256':sha(p),'bytes':p.stat().st_size,'width':1920,'height':1080,'mode':'RGB'},'image/png'
wan=SimpleNamespace(HOST=HOST,sha=sha,utc=utc,atomic_json=atomic_json,safe_code=safe_code,safe_id=safe_id,credential=credential,input_file=input_file)

def record(row):
    wan.atomic_json(WORK/'generated'/row['id']/'provenance.json',row)
    print(json.dumps({k:row.get(k) for k in ['id','model','status','requestId','httpStatus','errorCode','width','height']},ensure_ascii=False),flush=True)

def prepare(shot):
    out=WORK/'generated'/shot['id'];out.mkdir(parents=True,exist_ok=True);p=out/'provenance.json'
    expected=hashlib.sha256(shot['prompt'].encode('utf8')).hexdigest()
    if p.exists():
        row=json.loads(p.read_text('utf8'))
        if row['promptSHA256']!=expected:raise RuntimeError('Changed image request requires a new ID')
        if row['status']=='submitting':row.update(status='submission_unknown',errorCode='InterruptedPOSTNeverAutoRetried');record(row)
        return row
    row={'version':'V20','id':shot['id'],'model':MODEL,'status':'planned','purpose':shot['purpose'],
         'prompt':shot['prompt'],'promptSHA256':expected,'seed':shot['seed'],'referenceIds':shot.get('references',[]),
         'parameters':{'n':1,'size':'1920*1080','prompt_extend':False,'watermark':False,'seed':shot['seed']},
         'createdUTC':wan.utc(),'submissionCount':0,'credentialsPersisted':False,'signedURLsPersisted':False,
         'costVerified':False,'scientificDataGenerated':False,'sourceType':'Qwen generated watercolor story-world; illustration, not documentary evidence',
         'apiDocumentation':['https://help.aliyun.com/zh/model-studio/qwen-image-api','https://help.aliyun.com/zh/model-studio/qwen-image-edit-api']}
    record(row);return row

def submit(session,key,field,row):
    if row['status']!='planned':return
    content=[];refs=[]
    for reference_id in row['referenceIds']:
        source=WORK/'generated'/reference_id/'keyframe-1920x1080.png'
        if not source.is_file():raise RuntimeError('Generate referenced keyframe first: '+reference_id)
        _,entry,mime=wan.input_file(source)
        if source.stat().st_size>10*1024*1024:raise RuntimeError('Image edit reference exceeds 10MB')
        refs.append(entry);content.append({'image':'data:'+mime+';base64,'+base64.b64encode(source.read_bytes()).decode('ascii')})
    content.append({'text':row['prompt']})
    payload={'model':MODEL,'input':{'messages':[{'role':'user','content':content}]},'parameters':row['parameters']}
    row.update(status='submitting',submissionCount=1,references=refs,credentialField=field,submittedUTC=wan.utc());record(row)
    try:
        response=session.post(wan.HOST+'/api/v1/services/aigc/multimodal-generation/generation',headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},json=payload,timeout=(30,300))
        try:data=response.json()
        except ValueError:data={}
        row.update(httpStatus=response.status_code,requestId=wan.safe_id(data.get('request_id')))
        if response.status_code!=200:row.update(status='rejected',errorCode=wan.safe_code(data.get('code')) or 'HTTP_'+str(response.status_code));record(row);return
        choices=data.get('output',{}).get('choices',[])
        urls=[v['image'] for c in choices for v in c.get('message',{}).get('content',[]) if isinstance(v,dict) and 'image' in v]
        if len(urls)!=1:row.update(status='submission_unknown',errorCode='ExpectedExactlyOneGeneratedImage');record(row);return
        row.update(status='generated',usage={k:v for k,v in data.get('usage',{}).items() if k in {'image_count','width','height'}});record(row)
        u=urlparse(urls[0]);out=WORK/'generated'/row['id'];target=out/'provider.png';part=out/'provider.png.part'
        if u.scheme!='https' or not (u.hostname or '').endswith('.aliyuncs.com'):raise RuntimeError('Expected official generated media HTTPS host')
        if target.exists() or part.exists():raise RuntimeError('Existing source download requires inspection')
        with session.get(urls[0],timeout=(30,180),stream=True) as download:
            download.raise_for_status()
            with part.open('xb') as f:
                for block in download.iter_content(1024*1024):f.write(block)
        part.replace(target)
        with Image.open(target) as im:
            row['providerDimensions']=list(im.size);im.convert('RGB').resize((1920,1080),Image.Resampling.LANCZOS).save(out/'keyframe-1920x1080.png')
        row.update(status='processed',providerSHA256=wan.sha(target),derivativeSHA256=wan.sha(out/'keyframe-1920x1080.png'),width=1920,height=1080,
                   normalization='Full-raster Lanczos resize only; no crop or local retouch',visualReview='pending-actual-image-inspection',completedUTC=wan.utc());record(row)
    except requests.RequestException as exc:
        row.update(status='submission_unknown' if row['status']=='submitting' else 'download_blocked',errorCode=type(exc).__name__);record(row)

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--only',default='');ap.add_argument('--submit',action='store_true');a=ap.parse_args()
    s=json.loads(SPEC.read_text('utf8'));shots=s['shots'];ids=set(a.only.split(',')) if a.only else {x['id'] for x in shots};shots=[x for x in shots if x['id'] in ids]
    if not shots or ids!={x['id'] for x in shots}:raise RuntimeError('Unknown art ID')
    rows=[prepare(x) for x in shots]
    if not a.submit:return 0
    session=requests.Session();key,field=wan.credential(session)
    for row in rows:submit(session,key,field,row)
    wan.atomic_json(WORK/'batch-latest.json',{'version':'V20','shots':[{k:r.get(k) for k in ['id','model','status','requestId','derivativeSHA256']} for r in rows],'credentialsPersisted':False,'signedURLsPersisted':False})
    return 0 if all(r['status']=='processed' for r in rows) else 2

if __name__=='__main__':
    try:raise SystemExit(main())
    except (RuntimeError,OSError,ValueError,KeyError) as exc:
        print(json.dumps({'errorType':type(exc).__name__,'detail':str(exc) if isinstance(exc,RuntimeError) else 'Local image processing failed'},ensure_ascii=False),file=sys.stderr);raise SystemExit(2)

