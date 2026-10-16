"""One auditable 1080p WAN 2.7 endpoint-conditioned bridge on Alibaba DashScope.
No key is saved or printed. An uncertain submission is never silently retried.
"""
from pathlib import Path
import os,json,sys,requests,base64,hashlib
sys.stdout.reconfigure(encoding='utf8')
R=Path(__file__).resolve().parents[1];O=R/'research/generation';O.mkdir(parents=True,exist_ok=True)
M=R/'public/generated';M.mkdir(parents=True,exist_ok=True)
STATE=O/'bridge-task.json';BASE='https://dashscope.aliyuncs.com'
def save(d):STATE.write_text(json.dumps(d,ensure_ascii=False,indent=2),'utf8')
def credentials():
    seen=set()
    for name in ['QWEN_API_KEY_PRIMARY','DASHSCOPE_API_KEY','QWEN_API_KEY','QWEN_API_KEY_BACKUP']:
        k=os.environ.get(name,'').strip()
        if k and k not in seen:seen.add(k);yield name,k
def probe():
    report=[]
    for name,key in credentials():
        r=requests.get(BASE+'/api/v1/tasks/00000000-0000-0000-0000-000000000000',headers={'Authorization':'Bearer '+key},timeout=30)
        try:d=r.json()
        except ValueError:d={}
        code=d.get('code');s=d.get('output',{}).get('task_status')
        report.append(dict(credentialSource=name,http=r.status_code,code=code,status=s))
        if r.status_code not in [401,403] and (code in ['InvalidTaskId','TaskNotFound','TaskNotExist','TaskNotExists'] or s=='UNKNOWN'):
            (O/'credential-probe.json').write_text(json.dumps(report,indent=2),'utf8')
            print('Authenticated native media key from',name)
            return name,key
    (O/'credential-probe.json').write_text(json.dumps(report,indent=2),'utf8')
    raise RuntimeError('No native media credential authenticated; details omit secret values')
def frame(name):
    p=M/name
    return 'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode()
def main():
    mode=sys.argv[1] if len(sys.argv)>1 else 'probe'
    if mode=='probe':probe();return
    d=json.loads(STATE.read_text('utf8')) if STATE.exists() else {}
    if mode=='submit':
        if d.get('status') in ['submitting','submission_unconfirmed','PENDING','RUNNING','SUCCEEDED']:raise RuntimeError('Existing submission must be resolved, not duplicated')
        name,key=probe()
        prompt='''一个连续、精密、优雅的科学纪录片过渡。严格保持首尾图片里同一座三支臂浮式风电基础的外轮廓、孔洞、比例和位置。首帧是纸面蓝图，摄影机缓慢降到有透视的观察角，蓝色轮廓线沿纸面法线有秩序地抬升成同一个浅蓝金属三维实体；纸张平面自然成为白色无影摄影棚地面。没有跳切，没有粒子爆炸，没有熔化，也不添加第四条支臂。接近末尾时稳定到尾帧的精确相机位置、结构尺寸、青蓝色材质与柔和阴影。象牙白和浙江大学蓝，高级干净的建筑模型摄影。景深轻柔，整体始终可读。没有文字、logo、数字、图表、品牌、水印、人员和手。这只是视觉上的二维转三维概念衔接，不表达求解计算或物理结论。'''
        payload={'model':'wan2.7-i2v-2026-04-25','input':{'prompt':prompt,'media':[{'type':'first_frame','url':frame('bridge-first.png')},{'type':'last_frame','url':frame('bridge-last.png')}]},'parameters':{'resolution':'1080P','duration':5,'prompt_extend':False,'watermark':False,'seed':202610101}}
        d={'provider':'Alibaba Cloud Model Studio / WAN','model':payload['model'],'credentialSource':name,'status':'submitting','purpose':'Conceptual 2D blueprint to 3D geometry bridge; no numerical evidence','parameters':payload['parameters'],'prompt':prompt,'costCNY':None,'billing':'Provider bill not yet reconciled','sourceFrameHashes':{x:hashlib.sha256((M/x).read_bytes()).hexdigest() for x in ['bridge-first.png','bridge-last.png']}}
        save(d)
        try:
            r=requests.post(BASE+'/api/v1/services/aigc/video-generation/video-synthesis',headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','X-DashScope-Async':'enable'},json=payload,timeout=180)
            j=r.json();d.update(http=r.status_code,requestId=j.get('request_id'))
            if r.ok and j.get('output',{}).get('task_id'):d.update(taskId=j['output']['task_id'],status=j['output']['task_status'])
            else:d.update(status='FAILED_BEFORE_TASK',error=j.get('code'))
        except Exception as e:d.update(status='submission_unconfirmed',error=type(e).__name__)
        save(d);print(d['status'],d.get('taskId'),d.get('error'));return
    if not d.get('taskId'):raise RuntimeError('No submitted task')
    key=os.environ.get(d['credentialSource'],'').strip()
    r=requests.get(BASE+'/api/v1/tasks/'+d['taskId'],headers={'Authorization':'Bearer '+key},timeout=45);j=r.json();out=j.get('output',{})
    d['status']=out.get('task_status','UNKNOWN');d['usage']=j.get('usage');d['error']=out.get('code',j.get('code'));save(d)
    if d['status']=='SUCCEEDED':
        url=out.get('video_url')
        if not url:
            for x in out.get('results',[]):
                if x.get('url'):url=x['url'];break
        if not url:raise RuntimeError('Successful task lacks recognized video URL; inspect field names')
        dest=M/'bridge.mp4'
        if not dest.exists():
            data=requests.get(url,timeout=180);data.raise_for_status();dest.write_bytes(data.content)
        d['asset']='public/generated/bridge.mp4';d['sha256']=hashlib.sha256(dest.read_bytes()).hexdigest();save(d)
    print(d['status'],d.get('asset'),d.get('error'))
if __name__=='__main__':main()
