"""One billed POST per immutable Roadster bridge attempt; GET-only resumption.

Credentials are loaded freshly from current Windows user environment. No key,
image data URL or signed download URL is persisted or printed.
"""
from __future__ import annotations
import argparse
import base64
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
import time
import winreg
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import urlparse

import requests
from PIL import Image, ImageDraw

HERE = Path(__file__).resolve().parent
PROJECT = HERE.parents[2]
HOST = 'https://dashscope.aliyuncs.com'
ROUTE = '/api/v1/services/aigc/video-generation/video-synthesis'
MODEL = 'wan2.7-i2v-2026-04-25'
PARAMETERS = {'resolution': '1080P', 'duration': 5, 'prompt_extend': False,
              'watermark': False, 'seed': 1016006}
NEGATIVE = '文字，字幕，水印，logo，额外车辆，重复车辆，车辆身份改变，车身拉伸，轮胎增加，零件脱落，液体融化，烟雾遮满画面，黑场，闪切，叠化，突然改变运动方向，突然变焦，强烈曝光闪烁'

def now(): return dt.datetime.now(dt.timezone.utc).isoformat()
def sha(path): return hashlib.sha256(Path(path).read_bytes()).hexdigest()
def safe(value):
    return value if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_.:-]{1,160}', value) and not value.startswith('sk-') else None

def write_json(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.pending')
    temporary.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf8')
    os.replace(temporary, path)

def summary(row):
    print(json.dumps({k:row.get(k) for k in ['id','status','taskId','httpStatus','errorCode','outputFile','nativeFrames','nativeFPS'] if k in row}, ensure_ascii=False), flush=True)

@contextmanager
def attempt_lock(directory):
    directory.mkdir(parents=True, exist_ok=True)
    path = directory/'operation.lock'
    try: fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError: raise RuntimeError('Attempt operation.lock exists; inspect owner before removing. No automatic retry.')
    try:
        os.write(fd, json.dumps({'pid':os.getpid(),'utc':now()}).encode());os.close(fd)
        yield
    finally:
        path.unlink(missing_ok=True)

def credential(field):
    if field not in ['QWEN_API_KEY_PRIMARY','QWEN_API_KEY_BACKUP']:
        raise RuntimeError('Unrecognized credential field')
    try:
        with winreg.OpenKey(winreg.HKEY_CURRENT_USER, 'Environment') as key:
            token = str(winreg.QueryValueEx(key, field)[0]).strip()
    except OSError: token = os.environ.get(field, '').strip()
    if not token: raise RuntimeError('Verified current credential field is unavailable')
    return token

def verified_field():
    probe = json.loads((HERE/'probe/authentication.json').read_text(encoding='utf8'))
    if probe.get('endpoint') != HOST or probe.get('selectedField') != 'QWEN_API_KEY_BACKUP':
        raise RuntimeError('Expected recorded primary rejection then authorized backup success')
    rows = {p['field']:p for p in probe['probes']}
    if not rows.get('QWEN_API_KEY_BACKUP',{}).get('authenticated'):
        raise RuntimeError('Backup probe not verified')
    return probe['selectedField']

def image_info(value):
    path = Path(value).resolve()
    if not path.is_relative_to(PROJECT.resolve()) or not path.is_file():
        raise RuntimeError('Endpoint input must be an existing file inside this project')
    if path.stat().st_size > 20*1024*1024: raise RuntimeError('Image exceeds official 20MB limit')
    with Image.open(path) as im:
        if im.format not in ['PNG','JPEG'] or im.mode != 'RGB' or im.size != (1920,1080):
            raise RuntimeError('Expected clean RGB 1920x1080 PNG/JPEG endpoint; no alpha')
        mime = 'image/png' if im.format == 'PNG' else 'image/jpeg'
    return {'path':str(path.relative_to(PROJECT)).replace('\\','/'),'sha256':sha(path),
            'bytes':path.stat().st_size,'width':1920,'height':1080,'mode':'RGB','mime':mime}

def make_plan(args):
    if not args.first or not args.last: raise RuntimeError('--first and --last are required to prepare or submit')
    prompt_path = Path(args.prompt).resolve()
    if not prompt_path.is_relative_to(HERE.resolve()): raise RuntimeError('Prompt must stay in V06 Qwen work directory')
    prompt = prompt_path.read_text(encoding='utf8').strip()
    if not prompt or len(prompt)>5000: raise RuntimeError('Prompt length outside official limit')
    return {'id':args.attempt,'status':'planned','createdUTC':now(),'model':MODEL,
            'endpoint':HOST,'route':ROUTE,'region':'cn-beijing','protocol':'media-first-last',
            'parameters':PARAMETERS,'first':image_info(args.first),'last':image_info(args.last),
            'prompt':prompt,'promptSHA256':hashlib.sha256(prompt.encode()).hexdigest(),'negativePrompt':NEGATIVE,
            'credentialField':verified_field(),'submissionCount':0,'taskId':None,
            'estimatedPriceCNY':5.0,'actualBilledPriceCNY':None,
            'credentialsPersisted':False,'signedURLsPersisted':False,'scientificEvidence':False,
            'purpose':'Illustrative visual bridge from actual Tesla footage to controlled teaching model; not actual vehicle demonstration'}

def same_request(a,b):
    return all(a.get(k)==b.get(k) for k in ['id','model','endpoint','parameters','first','last','promptSHA256','negativePrompt'])

def save(folder,row): write_json(folder/'attempt.json',row);summary(row)

def submit(folder,row,post=requests.post):
    if row['status'] != 'planned' or row.get('submissionCount',0) != 0 or row.get('taskId'):
        if row['status']=='submitting':
            row.update(status='submission_unknown',errorCode='InterruptedAfterPreSubmitRecord');save(folder,row)
        summary(row);return
    media=[]
    for kind in ['first','last']:
        info=row[kind];file=PROJECT/info['path']
        if sha(file)!=info['sha256']: raise RuntimeError('Endpoint changed after freeze; refuse submit')
        media.append({'type':kind+'_frame','url':'data:'+info['mime']+';base64,'+base64.b64encode(file.read_bytes()).decode('ascii')})
    token=credential(row['credentialField'])
    payload={'model':row['model'],'input':{'prompt':row['prompt'],'negative_prompt':row['negativePrompt'],'media':media},'parameters':row['parameters']}
    row.update(status='submitting',submissionCount=1,submittedUTC=now());save(folder,row)
    try:
        response=post(HOST+ROUTE,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json','X-DashScope-Async':'enable'},json=payload,timeout=(20,180),allow_redirects=False)
        try: data=response.json()
        except ValueError: data={}
        task=safe(data.get('output',{}).get('task_id'))
        row.update(httpStatus=response.status_code,requestId=safe(data.get('request_id')))
        if task: row.update(taskId=task,status='running')
        elif 400 <= response.status_code < 500: row.update(status='rejected',errorCode=safe(data.get('code')) or 'HTTP_'+str(response.status_code))
        else: row.update(status='submission_unknown',errorCode=safe(data.get('code')) or 'NoConfirmedTaskId')
    except requests.RequestException as error:
        row.update(status='submission_unknown',errorCode=type(error).__name__)
    save(folder,row)

def poll_once(folder,row):
    if not row.get('taskId'):
        if row.get('status')=='submitting':row.update(status='submission_unknown',errorCode='InterruptedAfterPreSubmitRecord');save(folder,row)
        summary(row);return
    if row['status'] in ['downloaded','inspected','failed','canceled','rejected']:
        summary(row);return
    try:
        response=requests.get(HOST+'/api/v1/tasks/'+row['taskId'],headers={'Authorization':'Bearer '+credential(row['credentialField'])},timeout=(15,45),allow_redirects=False)
        row.update(lastQueryUTC=now(),lastQueryHTTP=response.status_code)
        if response.status_code!=200:
            save(folder,row);return
        data=response.json();output=data.get('output',{});state=output.get('task_status','UNKNOWN')
        row['providerStatus']=safe(state)
        if state=='SUCCEEDED':
            url=output.get('video_url','');parsed=urlparse(url)
            if parsed.scheme!='https' or not (parsed.hostname or '').endswith('.aliyuncs.com'):
                row.update(status='download_blocked',errorCode='UnexpectedDownloadHost');save(folder,row);return
            target=folder/'provider.mp4';partial=folder/'provider.mp4.part'
            if partial.exists():
                row.update(status='download_incomplete',errorCode='PartialDownloadRequiresInspection');save(folder,row);return
            if not target.exists():
                # Separate request: never pass provider Authorization to OSS.
                with requests.get(url,stream=True,timeout=(20,180),allow_redirects=False) as download:
                    download.raise_for_status()
                    with partial.open('xb') as handle:
                        for chunk in download.iter_content(1024*1024):handle.write(chunk)
                os.replace(partial,target)
            usage=data.get('usage',{})
            row.update(status='downloaded',completedUTC=now(),outputFile=str(target.relative_to(PROJECT)).replace('\\','/'),
                       providerSHA256=sha(target),downloadHost=parsed.hostname,
                       usage={k:v for k,v in usage.items() if isinstance(v,(int,float,bool))})
        elif state in ['FAILED','CANCELED']:
            row.update(status=state.lower(),errorCode=safe(output.get('code') or data.get('code')))
        elif state=='UNKNOWN':row.update(status='task_unknown',errorCode='TaskNotAvailableNoAutomaticResubmit')
        save(folder,row)
    except requests.RequestException as error:
        row.update(lastQueryErrorType=type(error).__name__);save(folder,row)

def inspect(folder,row):
    source=folder/'provider.mp4'
    if not source.exists():raise RuntimeError('Provider MP4 not downloaded')
    def run(cmd):return subprocess.run(cmd,check=True,capture_output=True).stdout
    info=json.loads(run(['ffprobe','-v','error','-count_frames','-show_streams','-show_format','-of','json',str(source)]))
    video=next(x for x in info['streams'] if x['codec_type']=='video');frames=int(video.get('nb_read_frames') or video.get('nb_frames') or 0)
    # Decode every frame to detect broken bitstreams before visual sampling.
    run(['ffmpeg','-v','error','-xerror','-i',str(source),'-an','-f','null','-'])
    indices=sorted(set([0,1,2,round(frames*.1),round(frames*.2),round(frames*.3),round(frames*.4),round(frames*.5),round(frames*.6),round(frames*.7),round(frames*.8),round(frames*.9),frames-3,frames-2,frames-1]))
    review=folder/'review';review.mkdir(exist_ok=True)
    for i in indices:
        target=review/f'frame-{i:04}.png'
        if not target.exists():run(['ffmpeg','-v','error','-i',str(source),'-vf',f'select=eq(n\\,{i})','-frames:v','1',str(target)])
    sheet=Image.new('RGB',(1920,5*290),'#eeeae1');draw=ImageDraw.Draw(sheet)
    for j,i in enumerate(indices):
        im=Image.open(review/f'frame-{i:04}.png').convert('RGB');im.thumbnail((640,270));x=(j%3)*640;y=(j//3)*290;sheet.paste(im,(x,y));draw.text((x+8,y+271),f'frame {i}/{frames-1}',fill='#263f48')
    sheet.save(review/'contact.jpg',quality=93)
    row.update(status='inspected',nativeFrames=frames,nativeFPS=video['avg_frame_rate'],nativeWidth=video['width'],nativeHeight=video['height'],
               nativeDuration=float(video.get('duration') or info['format']['duration']),hasProviderAudio=any(s['codec_type']=='audio' for s in info['streams']),
               audioUsed=False,fullDecodePassed=True,sampledFrames=indices,visualReview='pending-manual-review',providerSHA256=sha(source))
    write_json(review/'ffprobe.json',info);save(folder,row)

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('mode',choices=['prepare','submit','poll','inspect']);p.add_argument('--first');p.add_argument('--last')
    p.add_argument('--prompt',default=str(HERE/'prompt.txt'));p.add_argument('--attempt',default='official-to-teaching-001');p.add_argument('--wait-seconds',type=int,default=0)
    args=p.parse_args()
    if not re.fullmatch(r'[a-z0-9][a-z0-9_-]{1,80}',args.attempt):raise RuntimeError('Invalid attempt ID')
    folder=HERE/'attempts'/args.attempt
    with attempt_lock(folder):
        ledger=folder/'attempt.json';row=json.loads(ledger.read_text(encoding='utf8')) if ledger.exists() else None
        if args.mode in ['prepare','submit']:
            proposed=make_plan(args)
            if row and not same_request(row,proposed):raise RuntimeError('Attempt request changed; preserve existing attempt and use a new reviewed ID')
            if not row:row=proposed;save(folder,row)
            if args.mode=='submit':submit(folder,row)
        elif not row:raise RuntimeError('Attempt ledger not found')
        elif args.mode=='inspect':inspect(folder,row)
        else:
            deadline=time.monotonic()+max(0,args.wait_seconds)
            while True:
                poll_once(folder,row)
                if row['status'] not in ['running'] or time.monotonic()>=deadline:break
                time.sleep(min(15,max(0,deadline-time.monotonic())))

if __name__=='__main__':
    try: main()
    except Exception as error:
        # Custom errors contain only local metadata. HTTP exception strings may
        # carry signed URLs, so emit type only for anything not our own message.
        message=str(error) if isinstance(error,RuntimeError) else type(error).__name__
        print('BRIDGE_ERROR '+message,file=sys.stderr);sys.exit(1)
