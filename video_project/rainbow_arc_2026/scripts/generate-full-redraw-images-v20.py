"""Generate the V20 full-redraw endpoint plates with Qwen image editing.

The script is intentionally separate from the existing V20 bridge manifest:
it creates auditable endpoint plates under output-v20/work/qwen-full-art and
never mutates public runtime assets or the old bridge tasks.
"""
from __future__ import annotations
import argparse, base64, datetime as dt, hashlib, json, os, re
from pathlib import Path
from urllib.parse import urlparse
import requests
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
OUTPUT=Path(json.loads((ROOT/'work/output-root-v20.json').read_text('utf8'))['outputRoot'])
SPEC=ROOT/'research/qwen-v20-full-art-image-specs.json'
WORK=OUTPUT/'work/qwen-full-art'
MODEL='qwen-image-2.0-pro'
HOST=os.environ.get('DASHSCOPE_API_HOST','https://dashscope.aliyuncs.com').rstrip('/')
if hasattr(__import__('sys').stdout,'reconfigure'): __import__('sys').stdout.reconfigure(encoding='utf8')

def utc(): return dt.datetime.now(dt.timezone.utc).isoformat()
def sha(p:Path):
    h=hashlib.sha256()
    with p.open('rb') as f:
        for block in iter(lambda:f.read(4*1024*1024),b''): h.update(block)
    return h.hexdigest()
def atomic(path:Path,data):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_suffix(path.suffix+'.pending')
    if tmp.exists(): raise RuntimeError(f'pending provenance requires inspection: {tmp}')
    tmp.write_text(json.dumps(data,ensure_ascii=False,indent=2),'utf8'); tmp.replace(path)
def safe_code(x): return x if isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,80}',x) else None
def safe_id(x): return x if isinstance(x,str) and re.fullmatch(r'[A-Za-z0-9_-]{16,128}',x) else None

def credential(s):
    u=urlparse(HOST)
    if u.scheme!='https' or u.username or u.password or u.path or u.query or u.fragment or u.hostname not in {'dashscope.aliyuncs.com','dashscope-intl.aliyuncs.com'}:
        raise RuntimeError('Only official HTTPS DashScope host is allowed')
    probes=[]
    for field in ('QWEN_API_KEY_PRIMARY','QWEN_API_KEY_BACKUP'):
        key=os.environ.get(field)
        if not key: continue
        try:
            r=s.get(HOST+'/compatible-mode/v1/models',headers={'Authorization':'Bearer '+key},timeout=30)
            try:d=r.json()
            except ValueError:d={}
            probes.append({'field':field,'httpStatus':r.status_code,'errorCode':safe_code(d.get('code') or d.get('error',{}).get('code')),'readOnly':True,'timeUTC':utc()})
            if r.status_code==200:
                atomic(WORK/'credential-probe-full-art.json',{'credentialsPersisted':False,'probes':probes,'selectedField':field}); return key,field
            if r.status_code!=401: break
        except requests.RequestException as e:
            probes.append({'field':field,'errorType':type(e).__name__,'readOnly':True,'timeUTC':utc()}); break
    atomic(WORK/'credential-probe-full-art.json',{'credentialsPersisted':False,'probes':probes,'selectedField':None})
    raise RuntimeError('Qwen credentials unavailable; inspect safe probe record')

def validate_ref(p:Path):
    p=(ROOT/p).resolve() if not p.is_absolute() else p.resolve()
    if not p.is_relative_to(OUTPUT.resolve()) or not p.is_file(): raise RuntimeError(f'Endpoint reference outside output root: {p}')
    with Image.open(p) as im:
        if im.mode!='RGB' or im.size!=(1920,1080): raise RuntimeError(f'Endpoint reference must be RGB 1920x1080: {p}')
        mime='image/png' if im.format=='PNG' else 'image/jpeg'
    return p,mime,{'file':str(p),'sha256':sha(p),'bytes':p.stat().st_size,'width':1920,'height':1080,'mode':'RGB'}

def submit(s,key,field,shot,retry_rejected=False):
    out=WORK/'generated'/shot['id']; out.mkdir(parents=True,exist_ok=True); prov=out/'provenance.json'
    prompt_hash=hashlib.sha256(shot['prompt'].encode('utf8')).hexdigest()
    if prov.exists():
        row=json.loads(prov.read_text('utf8'))
        if row.get('promptSHA256')!=prompt_hash: raise RuntimeError(f'Changed submitted image requires a new ID: {shot["id"]}')
        # A 429 never created a provider job, so retrying the same immutable
        # request is safe after the quota cools down. Other provider errors
        # remain terminal and require a new ID for auditability.
        if retry_rejected and row.get('status')=='rejected' and row.get('errorCode')=='Throttling.RateQuota':
            row.update(status='planned',submissionCount=0,errorCode=None,retryAfterUTC=utc())
            atomic(prov,row)
        else:
            return row
    refs=[];content=[]
    for f in shot['referenceFiles']:
        p,mime,rec=validate_ref(Path(f)); refs.append(rec)
        content.append({'image':'data:'+mime+';base64,'+base64.b64encode(p.read_bytes()).decode('ascii')})
    content.append({'text':shot['prompt']})
    row={'version':'V20-full-art','id':shot['id'],'model':MODEL,'status':'submitting','purpose':shot['purpose'],
         'segment':shot['segment'],'side':shot['side'],'frame':shot['frame'],'seed':shot['seed'],'prompt':shot['prompt'],
         'promptSHA256':prompt_hash,'references':refs,'parameters':{'n':1,'size':'1920*1080','prompt_extend':False,'watermark':False,'seed':shot['seed']},
         'createdUTC':utc(),'submittedUTC':utc(),'submissionCount':1,'credentialsPersisted':False,'signedURLsPersisted':False,
         'scientificDataGenerated':False,'sourceType':'Qwen watercolor endpoint plate; illustrative appearance only','credentialField':field}
    atomic(prov,row)
    try:
        r=s.post(HOST+'/api/v1/services/aigc/multimodal-generation/generation',headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},json={'model':MODEL,'input':{'messages':[{'role':'user','content':content}]},'parameters':row['parameters']},timeout=(30,300))
        try:d=r.json()
        except ValueError:d={}
        row['httpStatus']=r.status_code;row['requestId']=safe_id(d.get('request_id'))
        if r.status_code!=200:
            row.update(status='rejected',errorCode=safe_code(d.get('code')) or 'HTTP_'+str(r.status_code)); atomic(prov,row); return row
        urls=[v['image'] for c in d.get('output',{}).get('choices',[]) for v in c.get('message',{}).get('content',[]) if isinstance(v,dict) and 'image' in v]
        if len(urls)!=1: row.update(status='submission_unknown',errorCode='ExpectedExactlyOneGeneratedImage');atomic(prov,row);return row
        u=urlparse(urls[0])
        if u.scheme!='https' or not (u.hostname or '').endswith('.aliyuncs.com'): raise RuntimeError('Unexpected Qwen media host')
        target=out/'provider.png'; part=out/'provider.png.part'
        with s.get(urls[0],timeout=(30,180),stream=True) as dl:
            dl.raise_for_status()
            with part.open('xb') as f:
                for block in dl.iter_content(1024*1024): f.write(block)
        part.replace(target)
        with Image.open(target) as im:
            row['providerDimensions']=list(im.size); im.convert('RGB').resize((1920,1080),Image.Resampling.LANCZOS).save(out/'keyframe-1920x1080.png')
        row.update(status='processed',providerSHA256=sha(target),derivativeSHA256=sha(out/'keyframe-1920x1080.png'),width=1920,height=1080,completedUTC=utc(),visualReview='pending-actual-image-inspection')
    except requests.RequestException as e:
        row.update(status='submission_unknown',errorCode=type(e).__name__)
    atomic(prov,row)
    print(json.dumps({'id':row['id'],'status':row['status'],'httpStatus':row.get('httpStatus'),'errorCode':row.get('errorCode')},ensure_ascii=False),flush=True)
    return row

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--only',default='');ap.add_argument('--submit',action='store_true');ap.add_argument('--retry-rejected',action='store_true');a=ap.parse_args()
    data=json.loads(SPEC.read_text('utf8')); shots=data['shots']; ids=set(a.only.split(',')) if a.only else {x['id'] for x in shots}; shots=[x for x in shots if x['id'] in ids]
    if not shots or ids!={x['id'] for x in shots}: raise RuntimeError('Unknown image shot ID')
    if not a.submit: print(json.dumps({'planned':len(shots),'ids':[x['id'] for x in shots]},ensure_ascii=False)); return 0
    s=requests.Session();key,field=credential(s)
    rows=[submit(s,key,field,x,a.retry_rejected) for x in shots]
    atomic(WORK/'image-batch-latest.json',{'version':'V20-full-art','updatedUTC':utc(),'credentialsPersisted':False,'shots':[{k:r.get(k) for k in ('id','segment','side','frame','status','providerSHA256','derivativeSHA256')} for r in rows]})
    return 0 if all(r.get('status')=='processed' for r in rows) else 2
if __name__=='__main__':
    try: raise SystemExit(main())
    except (RuntimeError,OSError,ValueError,KeyError) as e:
        print(json.dumps({'errorType':type(e).__name__,'detail':str(e)},ensure_ascii=False)); raise SystemExit(2)
