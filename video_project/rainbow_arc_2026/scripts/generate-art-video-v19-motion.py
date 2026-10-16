"""V19Motion hand-painted continuity tasks, exact first/last endpoints; no unanchored T2V.

Default prepares only. --submit sends each planned shot once; --poll resumes by
task ID, never repeats an ambiguous POST. Credentials and signed URLs exist only
in memory. Sources/decoded images go to this task's configured output. --publish copies
accepted derivatives only to new public/assets_v19_motion/qwen, never inherited files.
"""
from __future__ import annotations
import argparse, base64, datetime as dt, hashlib, json, os, re, shutil, subprocess, sys, time
from pathlib import Path
from urllib.parse import urlparse
import requests
from PIL import Image, ImageDraw
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(json.loads((ROOT/'work/output-root-v19-motion.json').read_text('utf8'))['outputRoot'])
WORK = OUTPUT/'work/qwen-v19-motion'
SPEC = ROOT/'research/qwen-v19-motion-video-specs.json'
HOST = os.environ.get('DASHSCOPE_API_HOST', 'https://dashscope.aliyuncs.com').rstrip('/')
OFFICIAL_API = {'dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com'}
FIELD_PRIORITY = ['QWEN_API_KEY_PRIMARY', 'QWEN_API_KEY_BACKUP']
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf8')

def utc(): return dt.datetime.now(dt.timezone.utc).isoformat()

def sha(path):
    h=hashlib.sha256()
    with path.open('rb') as f:
        for b in iter(lambda:f.read(4*1024*1024),b''):h.update(b)
    return h.hexdigest()

def atomic_json(path, data):
    path.parent.mkdir(parents=True,exist_ok=True)
    if path.exists() and path.stat().st_nlink!=1:raise RuntimeError('Refusing shared provenance mutation')
    temp=path.with_suffix(path.suffix+'.pending')
    if temp.exists():raise RuntimeError('Pending provenance write requires inspection')
    temp.write_text(json.dumps(data,ensure_ascii=False,indent=2),'utf8');temp.replace(path)

def safe_code(value):
    return value if isinstance(value,str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,80}',value) else None

def safe_id(value):
    return value if isinstance(value,str) and re.fullmatch(r'[A-Za-z0-9_-]{16,128}',value) else None

def summary(row):
    fields=['id','model','status','taskId','requestId','httpStatus','providerStatus','errorCode','nativeFrames','frameCount']
    print(json.dumps({k:row[k] for k in fields if k in row},ensure_ascii=False),flush=True)

def folder(row): return WORK/'generated'/row['id']

def save(row): atomic_json(folder(row)/'provenance.json',row);summary(row)

def official_host():
    u=urlparse(HOST)
    if u.scheme!='https' or u.username or u.password or u.path or u.query or u.fragment:
        raise RuntimeError('Official HTTPS API host required; no credentials in URL')
    if u.hostname not in OFFICIAL_API and not re.fullmatch(r'[A-Za-z0-9-]+\.(cn-beijing|ap-southeast-1)\.maas\.aliyuncs\.com',u.hostname or ''):
        raise RuntimeError('Refusing to send Qwen credentials to a non-official API host')

def is_linkish(path):
    # The bundled Python can predate Path.is_junction. Windows junctions are
    # reparse points and must be rejected even when is_symlink() is false.
    return path.is_symlink() or getattr(path,'is_junction',lambda:False)() or bool(getattr(path.lstat(),'st_file_attributes',0)&0x400)

def credential(session):
    official_host();seen=[];probes=[]
    for field in FIELD_PRIORITY:
        key=os.environ.get(field)
        if not key or key in seen:continue
        seen.append(key)
        try:
            response=session.get(HOST+'/compatible-mode/v1/models',headers={'Authorization':'Bearer '+key},timeout=30)
            try:data=response.json()
            except ValueError:data={}
            code=safe_code(data.get('code') or data.get('error',{}).get('code'))
            probes.append({'field':field,'httpStatus':response.status_code,'errorCode':code,'readOnly':True,'timeUTC':utc()})
            if response.status_code==200:
                atomic_json(WORK/'credential-probe-latest.json',{'credentialsPersisted':False,'probes':probes,'selectedField':field})
                return key,field
            if response.status_code!=401:break
        except requests.RequestException as exc:
            probes.append({'field':field,'errorType':type(exc).__name__,'readOnly':True,'timeUTC':utc()});break
    atomic_json(WORK/'credential-probe-latest.json',{'credentialsPersisted':False,'probes':probes,'selectedField':None})
    raise RuntimeError('Runtime credential authentication unavailable; inspect safe probe record')

def input_file(path):
    unresolved=Path(path).absolute()
    # Resolve only after inspecting every ancestor; endpoint inputs must not
    # traverse a junction/symlink into a different task or credential folder.
    for component in [unresolved,*unresolved.parents]:
        if component.exists() and is_linkish(component):
            raise RuntimeError('Reference must not traverse a symlink or junction')
    path=unresolved.resolve()
    if not path.is_relative_to(OUTPUT.resolve()) or not path.is_file() or path.stat().st_size>20*1024*1024:
        raise RuntimeError('Reference must be a bounded file in this task output root')
    with Image.open(path) as im:
        if im.mode!='RGB' or im.size!=(1920,1080) or im.format not in {'PNG','JPEG'}:
            raise RuntimeError('Reference must be clean RGB 1920x1080 PNG/JPEG: '+path.name)
        mime='image/png' if im.format=='PNG' else 'image/jpeg'
    return path,{'file':str(path),'sha256':sha(path),'bytes':path.stat().st_size,'width':1920,'height':1080,'mode':'RGB'},mime

def initial(shot,spec):
    path=WORK/'generated'/shot['id']/'provenance.json'
    if path.exists():
        row=json.loads(path.read_text('utf8'))
        expected_prompt=hashlib.sha256(shot['prompt'].encode()).hexdigest()
        changed=(row['promptSHA256']!=expected_prompt or row['model']!=spec['model'] or row['seed']!=shot['seed']
                 or row.get('parameters',{}).get('duration')!=shot.get('duration',5)
                 or row['firstReferenceName']!=shot['firstFile'] or row['lastReferenceName']!=shot['lastFile'])
        if changed:
            if row['status']!='planned' or row.get('submissionCount',0)!=0 or row.get('taskId'):
                raise RuntimeError('Changed submitted request requires a new shot ID, not a duplicate submission')
            row.setdefault('preSubmitRevisions',[]).append({'oldPromptSHA256':row['promptSHA256'],'oldModel':row['model'],
                                                           'oldSeed':row['seed'],'timeUTC':utc()})
            row.update(prompt=shot['prompt'],promptSHA256=expected_prompt,model=spec['model'],seed=shot['seed'],
                       firstReferenceName=shot['firstFile'],lastReferenceName=shot['lastFile'],purpose=shot['purpose'])
            row['parameters']['seed']=shot['seed']
            row['parameters']['duration']=shot.get('duration',5)
        return row
    return {'version':'V19Motion','id':shot['id'],'model':spec['model'],'protocol':spec['apiProtocol'],
            'status':'planned','prompt':shot['prompt'],'promptSHA256':hashlib.sha256(shot['prompt'].encode()).hexdigest(),
            'seed':shot['seed'],'parameters':{'resolution':'1080P','duration':shot.get('duration',5),'prompt_extend':False,'watermark':False,'seed':shot['seed']},
            'purpose':shot['purpose'],'scientificDataGenerated':False,'submissionCount':0,'costVerified':False,
            'source':'Alibaba Cloud official DashScope first/last frame API','credentialsPersisted':False,'signedURLsPersisted':False,
            'firstReferenceName':shot['firstFile'],'lastReferenceName':shot['lastFile'],'createdUTC':utc()}

def prepare_inputs(row,shot):
    prepared=[]
    for which in ['first','last']:
        path,record,mime=input_file(WORK/'inputs'/shot[which+'File'])
        existing=row.get(which+'Reference')
        if existing and existing['sha256']!=record['sha256']:raise RuntimeError('References changed; use a new shot ID')
        row[which+'Reference']=record;prepared.append((which,path,mime))
    return prepared

def submit(session,key,field,row,prepared):
    if row['status']!='planned':return
    media=[{'type':which+'_frame','url':'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode('ascii')} for which,path,mime in prepared]
    payload={'model':row['model'],'input':{'prompt':row['prompt'],'media':media},'parameters':row['parameters']}
    row.update(status='submitting',submissionCount=row['submissionCount']+1,submittedUTC=utc(),credentialField=field);save(row)
    try:
        response=session.post(HOST+'/api/v1/services/aigc/video-generation/video-synthesis',
                              headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','X-DashScope-Async':'enable'},
                              json=payload,timeout=(30,120))
        try:data=response.json()
        except ValueError:data={}
        row['httpStatus']=response.status_code;row['requestId']=safe_id(data.get('request_id'))
        task=safe_id(data.get('output',{}).get('task_id'))
        if task:row.update(taskId=task,status='running')
        elif response.status_code>=400:row.update(status='rejected',errorCode=safe_code(data.get('code')) or 'HTTP_'+str(response.status_code))
        else:row.update(status='submission_unknown',errorCode='ResponseWithoutTaskID')
    except requests.RequestException as exc:row.update(status='submission_unknown',errorCode=type(exc).__name__)
    save(row)

def run_local(args):
    return subprocess.run(args,check=True,capture_output=True,text=True,encoding='utf8',errors='replace')

def process_video(row):
    out=folder(row);source=out/'provider.mp4';probe=json.loads(run_local(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(source)]).stdout)
    video=next(s for s in probe['streams'] if s['codec_type']=='video');fps_num,fps_den=map(int,video['avg_frame_rate'].split('/'))
    # nb_frames can be absent in a valid provider MP4. nb_read_frames counts
    # actual decoded frames without manufacturing frames or trusting metadata.
    frames=int(video.get('nb_read_frames') or video.get('nb_frames') or 0);seconds=float(video.get('duration') or probe['format']['duration'])
    expected_seconds=int(row['parameters']['duration']);expected_frames=expected_seconds*30
    if abs(fps_num/fps_den-30)>.01 or frames!=expected_frames or abs(seconds-expected_seconds)>.05:
        row.update(status='quality_blocked',errorCode='NativeVideoMustMatchDurationAt30fps',nativeFrames=frames,nativeFPS=video['avg_frame_rate'],nativeSeconds=seconds);save(row);return
    frames_dir=out/'frames';frames_dir.mkdir(exist_ok=True)
    existing=list(frames_dir.glob('frame_*.jpg'))
    if existing and len(existing)!=expected_frames:raise RuntimeError('Partial decode cache requires inspection; no overwriting')
    if not existing:
        run_local(['ffmpeg','-hide_banner','-loglevel','error','-xerror','-i',str(source),'-an','-vf','scale=1920:1080:flags=lanczos',
                   '-fps_mode','passthrough','-q:v','2',str(frames_dir/'frame_%04d.jpg')])
    files=sorted(frames_dir.glob('frame_*.jpg'))
    if len(files)!=expected_frames:raise RuntimeError('Expected every actual provider frame')
    hashes=[sha(p) for p in files];contact=Image.new('RGB',(1920,1140),'#edf4f1');draw=ImageDraw.Draw(contact)
    contact_indices=sorted(set([0,1,expected_frames//5,2*expected_frames//5,3*expected_frames//5,4*expected_frames//5,max(0,expected_frames-2),expected_frames-1])); contact_indices=[k for k in contact_indices if 0 <= k < len(files)]
    for n,index in enumerate(contact_indices):
        with Image.open(files[index]) as im:im=im.resize((640,360));contact.paste(im,((n%3)*640,(n//3)*380))
        draw.text(((n%3)*640+12,(n//3)*380+362),f"{row['id']} frame {index+1}/{expected_frames}",fill='#123b42')
    contact.save(out/'contact.jpg',quality=94)
    errors=[]
    for which,index in [('first',0),('last',expected_frames-1)]:
        ref=Path(row[which+'Reference']['file']);target=out/('reference-'+which+'.png')
        if not target.exists():shutil.copyfile(ref,target)
        with Image.open(ref) as a,Image.open(files[index]) as b:
            aa=np.asarray(a.resize((480,270)),dtype=np.float32);bb=np.asarray(b.resize((480,270)),dtype=np.float32)
        errors.append({'endpoint':which,'meanAbsoluteRGBError':float(np.abs(aa-bb).mean()),'referenceSHA256':row[which+'Reference']['sha256'],'frameSHA256':hashes[index]})
    row.update(status='processed',providerSHA256=sha(source),nativeFrames=frames,nativeFPS=video['avg_frame_rate'],nativeSeconds=seconds,nativeWidth=video['width'],nativeHeight=video['height'],
               frameCount=expected_frames,fps=30,width=1920,height=1080,frameHashes=hashes,identicalAdjacentFramePairs=sum(a==b for a,b in zip(hashes,hashes[1:])),
               endpointError=errors,audioUsed=False,decodeStrategy='All actual native 30fps provider frames in sequence; no held, repeated or optical-flow-invented frames',
               visualReview='pending-contact-and-endpoint-acceptance',processedUTC=utc());save(row)

def query(session,key,row):
    if row['status']=='downloaded':process_video(row);return
    if row['status']!='running':return
    try:
        response=session.get(HOST+'/api/v1/tasks/'+row['taskId'],headers={'Authorization':'Bearer '+key},timeout=40)
        row['lastQueryHTTP']=response.status_code;row['lastQueryUTC']=utc()
        if response.status_code!=200:save(row);return
        output=response.json().get('output',{});state=output.get('task_status','UNKNOWN');row['providerStatus']=state
        if state=='SUCCEEDED':
            url=output.get('video_url');u=urlparse(url or '')
            if u.scheme!='https' or not (u.hostname or '').endswith('.aliyuncs.com'):
                row['errorCode']='ExpectedOfficialProviderDownloadURL';save(row);return
            source=folder(row)/'provider.mp4'
            if not source.exists():
                part=source.with_suffix('.mp4.part')
                if part.exists():raise RuntimeError('Partial source download requires inspection')
                with session.get(url,timeout=(30,180),stream=True) as download:
                    download.raise_for_status()
                    with part.open('xb') as f:
                        for block in download.iter_content(1024*1024):f.write(block)
                part.replace(source)
            row.update(status='downloaded',completedUTC=utc(),downloadHost=u.hostname);save(row);process_video(row)
        elif state in {'FAILED','CANCELED'}:row.update(status=state.lower(),errorCode=safe_code(output.get('code')));save(row)
        else:save(row)
    except requests.RequestException as exc:row['lastQueryErrorType']=type(exc).__name__;save(row)

def runtime_root():
    target=OUTPUT/'public/assets_v19_motion/qwen'
    for component in [target,*target.parents]:
        if component.exists() and is_linkish(component):
            raise RuntimeError('V19Motion runtime output must not traverse a symlink or junction')
    if not target.absolute().is_relative_to((OUTPUT/'public/assets_v19_motion').absolute()):
        raise RuntimeError('V19Motion runtime output escaped assets_v19_motion')
    target.mkdir(parents=True,exist_ok=True)
    return target

def safe_destination(path):
    for component in [path,*path.parents]:
        if component.exists() and is_linkish(component):
            raise RuntimeError('V19Motion runtime child must not traverse a symlink or junction')
    if path.exists() and path.is_file() and path.stat().st_nlink!=1:
        raise RuntimeError('Refusing shared runtime file mutation')

def publish(row):
    if row['status']!='processed':raise RuntimeError('Only a processed actual video can be published')
    review=folder(row)/'visual-acceptance.json'
    approval=json.loads(review.read_text('utf8')) if review.exists() else {}
    if approval.get('status')!='pass' or approval.get('providerSHA256')!=row['providerSHA256']:
        raise RuntimeError('Matching documented visual acceptance required before runtime publishing')
    if sha(folder(row)/'provider.mp4')!=row['providerSHA256']:
        raise RuntimeError('Actual provider source changed after visual inspection')
    frames=sorted((folder(row)/'frames').glob('frame_*.jpg'))
    if len(frames)!=row['frameCount'] or [sha(p) for p in frames]!=row['frameHashes']:
        raise RuntimeError('Decoded frames changed after visual inspection')
    for which in ['first','last']:
        if sha(folder(row)/('reference-'+which+'.png'))!=row[which+'Reference']['sha256']:
            raise RuntimeError('Matched reference changed after submission')
    target=runtime_root()/row['id'];safe_destination(target);target.mkdir(parents=True,exist_ok=True)
    for source in [folder(row)/'provenance.json',folder(row)/'reference-first.png',folder(row)/'reference-last.png',review,*sorted((folder(row)/'frames').glob('*.jpg'))]:
        destination=target/('frames' if source.parent.name=='frames' else '')/source.name;safe_destination(destination);destination.parent.mkdir(exist_ok=True)
        if destination.exists():
            if sha(destination)!=sha(source):raise RuntimeError('Do not overwrite a changed new runtime asset')
        else:shutil.copyfile(source,destination)
    return {'id':row['id'],'frames':row['frameCount'],'framePath':'assets_v19_motion/qwen/'+row['id']+'/frames',
            'firstFile':'assets_v19_motion/qwen/'+row['id']+'/reference-first.png','lastFile':'assets_v19_motion/qwen/'+row['id']+'/reference-last.png','taskId':row['taskId']}

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--only',default='');parser.add_argument('--submit',action='store_true')
    parser.add_argument('--poll',action='store_true');parser.add_argument('--publish',action='store_true');parser.add_argument('--validate-inputs',action='store_true');parser.add_argument('--timeout-minutes',type=float,default=20)
    args=parser.parse_args();WORK.mkdir(parents=True,exist_ok=True);spec=json.loads(SPEC.read_text('utf8'))
    if spec.get('version')!='V19Motion' or spec.get('apiProtocol')!='wan27-first-last-media':
        raise RuntimeError('Expected V19Motion approved first/last spec')
    for shot in spec.get('shots',[]):
        if not re.fullmatch(r'[a-z][a-z0-9_]{1,60}',shot.get('id','')):
            raise RuntimeError('Unsafe shot ID')
        for field in ['firstFile','lastFile']:
            name=shot.get(field,'')
            if not isinstance(name,str) or Path(name).name!=name or not re.fullmatch(r'[a-zA-Z0-9_.-]+\.(png|jpg|jpeg)',name):
                raise RuntimeError('Reference must be a simple image filename')
    if len({s['id'] for s in spec.get('shots',[])})!=len(spec.get('shots',[])):
        raise RuntimeError('Duplicate shot ID in spec')
    ids=set(args.only.split(',')) if args.only else {s['id'] for s in spec['shots']}
    shots=[s for s in spec['shots'] if s['id'] in ids]
    if not shots or ids!={s['id'] for s in shots}:raise RuntimeError('Unknown shot ID')
    rows=[initial(shot,spec) for shot in shots]
    for row in rows:
        if row['status']=='submitting':row.update(status='submission_unknown',errorCode='InterruptedPOSTNeverAutoRetried')
        save(row)
    if args.validate_inputs:
        for row,shot in zip(rows,shots):
            prepare_inputs(row,shot);save(row)
        if not (args.submit or args.poll or args.publish):return 0
    if not (args.submit or args.poll or args.publish):return 0
    if args.publish:
        published=[publish(row) for row in rows];atomic_json(WORK/'integration-fragment.json',{'version':'V19Motion','clips':published,'rootMustSupplyActualTimelineAnchors':True});return 0
    # Validate ALL new inputs before even the read-only credential probe.
    prepared={}
    if args.submit:
        prepared={row['id']:prepare_inputs(row,shot) for row,shot in zip(rows,shots) if row['status']=='planned'}
    session=requests.Session();key,field=credential(session)
    if args.submit:
        # Validate every selected input before sending the first paid request.
        # prepared was validated before probing credentials.
        for row in rows:
            if row['status']=='planned':submit(session,key,field,row,prepared[row['id']])
    if args.poll:
        deadline=time.monotonic()+min(max(args.timeout_minutes,0),20)*60
        while any(r['status'] in {'running','downloaded'} for r in rows) and time.monotonic()<deadline:
            for row in rows:query(session,key,row)
            if any(r['status'] in {'running','downloaded'} for r in rows):time.sleep(12)
    atomic_json(WORK/'batch-latest.json',{'version':'V19Motion','updatedUTC':utc(),'credentialsPersisted':False,'signedURLsPersisted':False,
                                         'shots':[{k:r.get(k) for k in ['id','model','status','taskId','providerStatus','frameCount']} for r in rows]})
    return 0 if all(r['status']=='processed' for r in rows) else 2

if __name__=='__main__':
    try:raise SystemExit(main())
    except (RuntimeError,OSError,ValueError,KeyError,subprocess.SubprocessError) as exc:
        # Runtime errors contain only authored safe diagnostics; provider responses/URLs are never echoed.
        print(json.dumps({'errorType':type(exc).__name__,'detail':str(exc) if isinstance(exc,RuntimeError) else 'Local processing failed; inspect task records'},ensure_ascii=False),file=sys.stderr)
        raise SystemExit(2)




