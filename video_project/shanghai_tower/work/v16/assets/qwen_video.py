"""Generate/resume one Alibaba Cloud Wan atmosphere shot; never logs credentials/URLs."""
import sys, os, json, hashlib
from pathlib import Path
from datetime import datetime, timezone
import requests

HERE=Path(__file__).resolve().parent;ROOT=HERE.parents[2]
STATE=HERE/'qwen-video-task.json'
BASE='https://dashscope.aliyuncs.com/api/v1'
now=lambda:datetime.now(timezone.utc).isoformat()
def save(s):STATE.write_text(json.dumps(s,ensure_ascii=False,indent=2),encoding='utf8')
prompt='''生成单镜头视频，5秒，电影级中国上海建筑纪录片环境空镜，连续一镜到底，无切镜无转场。清晨蓝调与柔和暖金色天光，摄影机从黄浦江近处微波纹水面的真实银蓝色反光开始，以贴近水面的极低机位缓慢向前推进并丝滑抬升俯仰，水波与高楼细长倒影从镜头下方滑过，远方陆家嘴上海中心、环球金融中心和金茂大厦天际线逐渐从上沿进入，最后停在江面占画面下方四分之一、天空与城市占其余的中远景。真实建筑摄影，湿润空气，薄薄晨雾，细密水面反射，物理一致的反射与小波浪，高端建筑纪录片质感，克制高光，曝光稳定，绝对稳定无人机云台运镜，没有人，没有船只从镜头前穿过。画面用于工程纪录片的环境示意，地标仅作远景气氛，不能出现夸张弯曲或融化。画面干净、安静、清晰、自然，高级的冷暖层次，镜头运动有平滑的起步和停稳，轻微景深但城市轮廓可辨。无文字，无logo，无水印，无图表，无分屏。无音乐，无旁白。'''
payload={'model':'wan2.7-t2v-2026-06-12','input':{'prompt':prompt,'negative_prompt':'跳切，剪辑，变焦跳跃，镜头抖动，闪烁，建筑融化，扭曲地标，烟花，科幻光束，文字，水印，字幕，人脸，过曝，强烈炫光，饱和颜色，卡通，低清晰度'},'parameters':{'resolution':'1080P','ratio':'16:9','duration':5,'prompt_extend':False,'watermark':False,'seed':160011}}
operation=sys.argv[1]
if operation=='submit':
    if STATE.exists():raise SystemExit('Task record exists; query original task instead.')
    state={'provider':'Alibaba Cloud DashScope / Wan (Qwen ecosystem)','model':payload['model'],'endpoint':BASE+'/services/aigc/video-generation/video-synthesis','referenceDocs':'https://help.aliyun.com/zh/model-studio/text-to-video-api-reference','intendedUse':'5-second atmospheric water-to-city transition; illustrative, never solver evidence.','createdAt':now(),'request':payload,'attempts':[],'status':'submission_started'}
    save(state)
    for name in ['QWEN_API_KEY_PRIMARY','QWEN_API_KEY_BACKUP']:
        key=os.environ.get(name)
        if not key:
            state['attempts'].append({'credentialSlot':name,'status':'missing'});save(state);continue
        try:r=requests.post(state['endpoint'],json=payload,headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','X-DashScope-Async':'enable'},timeout=90)
        except requests.RequestException as exc:
            state.update(status='submission_unknown',errorType=type(exc).__name__);save(state);raise SystemExit('Uncertain submission; no automatic retry: '+type(exc).__name__)
        try:result=r.json()
        except ValueError:result={}
        output=result.get('output',{})
        attempt={'credentialSlot':name,'httpStatus':r.status_code,'requestId':result.get('request_id'),'errorCode':result.get('code'),'createdAt':now()}
        state['attempts'].append(attempt)
        if output.get('task_id'):
            state.update(status=output.get('task_status','PENDING'),taskId=output['task_id'],credentialSlot=name);save(state);print(json.dumps({'status':state['status'],'taskId':state['taskId'],'model':state['model']}));break
        attempt['status']='rejected';state['status']='rejected';save(state)
        print(json.dumps(attempt))
        if r.status_code>=500:raise SystemExit('Uncertain server result; no retry')
    else:raise SystemExit('Qwen submission rejected for available credentials; evidence saved')
elif operation=='query':
    state=json.loads(STATE.read_text());task=state.get('taskId')
    if not task:raise SystemExit('No task to query')
    key=os.environ[state['credentialSlot']]
    r=requests.get(BASE+'/tasks/'+task,headers={'Authorization':'Bearer '+key},timeout=45)
    if not r.ok:raise SystemExit('Query HTTP '+str(r.status_code))
    result=r.json();output=result.get('output',{})
    state.update(status=output.get('task_status','UNKNOWN'),updatedAt=now(),usage=result.get('usage'),lastRequestId=result.get('request_id'))
    if state['status']=='SUCCEEDED' and not state.get('output'):
        video=requests.get(output['video_url'],timeout=180);video.raise_for_status()
        target=ROOT/'public/v16/qwen-river-rise.mp4';target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(video.content)
        state['output']={'path':str(target.relative_to(ROOT)),'bytes':target.stat().st_size,'sha256':hashlib.sha256(video.content).hexdigest()}
        state['localCompletedAt']=now()
    elif state['status']=='FAILED':state['errorCode']=output.get('code');state['errorMessage']=output.get('message')
    save(state);print(json.dumps({k:state[k] for k in ['status','taskId','usage','output','errorCode','errorMessage'] if k in state},ensure_ascii=False))
