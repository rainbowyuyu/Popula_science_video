"""One authorized Qwen image-edit request, immutable source and safe provenance.

Default validates/prepares only. --submit sends exactly one synchronous request.
An interrupted POST is not automatically repeated. Credentials/signed URLs only
exist in process memory. This is a generated style plate, never filmed evidence.
"""
from __future__ import annotations
import argparse,base64,importlib.util,json,shutil,sys
from pathlib import Path
from urllib.parse import urlparse
import requests
from PIL import Image

sys.dont_write_bytecode=True
module=importlib.util.spec_from_file_location('v10wan',Path(__file__).with_name('generate-qwen-v10.py'))
wan=importlib.util.module_from_spec(module);module.loader.exec_module(wan)
OUT=wan.WORK/'fountain-repaint'
MODEL='qwen-image-2.0-pro-2026-06-22'
PROMPT='''输入图一是唯一的编辑目标。本图用于同一摄影机视角的无缝转场。严格保留全部几何与构图：圆盆的外轮廓和椭圆角度、盆沿边界、中央喷管、所有喷流水弧与水面位置、石材平台边界、地平线高度、草地布局，以及彩虹鱼的身体轮廓、鳍、尾巴、位置、大小、姿态与颜色。摄影机不移动、不变焦，不新增物件，不改变任何物体比例或位置。只升级表面质感和光照，成为雨后精致纪录片摄影质感：湿润石材细颗粒与真实接缝、细腻浅水反射与自然圈状波纹、透明喷流和细微散焦飞溅水滴、柔和水雾、真实草地纹理与湿润植物，远方景深克制。保持原来的青绿与暖阳，天空自然、阴影柔和、材质有层次。鱼仍是原有的精致彩虹色三维角色，保留造型与剪影，只改善材质和自然环境照明，不能变成真实动物或人物。已有虹色保持位置与弧线，不新增更大的彩虹或光学射线。画面无文字、无标志、无字幕、无箭头、无科学数据。输出16:9。'''

def record(row):
    wan.atomic_json(OUT/'provenance.json',row)
    print(json.dumps({k:row.get(k) for k in ['id','model','status','httpStatus','requestId','errorCode','width','height']},ensure_ascii=False),flush=True)

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--input',required=True);ap.add_argument('--submit',action='store_true');args=ap.parse_args()
    path,reference,mime=wan.input_file(args.input)
    if path.stat().st_size>10*1024*1024:raise RuntimeError('Image edit reference exceeds official10MB input limit')
    OUT.mkdir(parents=True,exist_ok=True);provenance=OUT/'provenance.json'
    if provenance.exists():
        row=json.loads(provenance.read_text('utf8'))
        if row['reference']['sha256']!=reference['sha256']:raise RuntimeError('Changed source requires a separate repaint ID')
        if row['status']=='submitting':row.update(status='submission_unknown',errorCode='InterruptedPOSTNeverAutoRetried');record(row)
    else:
        row={'id':'fountain_repaint','model':MODEL,'status':'planned','createdUTC':wan.utc(),'reference':reference,'prompt':PROMPT,
             'parameters':{'n':1,'size':'1920*1080','prompt_extend':False,'watermark':False,'seed':10109},
             'submissionCount':0,'sourceType':'generated photographic style repaint of V10 geometry; not real filmed evidence',
             'apiDocumentation':'https://help.aliyun.com/zh/model-studio/qwen-image-edit-api','credentialsPersisted':False,'signedURLsPersisted':False,'costVerified':False}
        shutil.copyfile(path,OUT/'reference.png');record(row)
    if not args.submit or row['status']!='planned':return 0
    session=requests.Session();key,field=wan.credential(session)
    payload={'model':MODEL,'input':{'messages':[{'role':'user','content':[{'image':'data:'+mime+';base64,'+base64.b64encode(path.read_bytes()).decode('ascii')},{'text':PROMPT}]}]},'parameters':row['parameters']}
    row.update(status='submitting',submissionCount=1,submittedUTC=wan.utc(),credentialField=field);record(row)
    try:
        response=session.post(wan.HOST+'/api/v1/services/aigc/multimodal-generation/generation',headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'},json=payload,timeout=(30,300))
        try:data=response.json()
        except ValueError:data={}
        row['httpStatus']=response.status_code;row['requestId']=wan.safe_id(data.get('request_id'))
        if response.status_code!=200:
            row.update(status='rejected',errorCode=wan.safe_code(data.get('code')) or 'HTTP_'+str(response.status_code));record(row);return 2
        choices=data.get('output',{}).get('choices',[])
        urls=[item['image'] for choice in choices for item in choice.get('message',{}).get('content',[]) if isinstance(item,dict) and 'image' in item]
        if len(urls)!=1:row.update(status='submission_unknown',errorCode='ExpectedExactlyOneGeneratedImage');record(row);return 2
        row.update(status='generated',usage={k:v for k,v in data.get('usage',{}).items() if k in {'image_count','width','height'}},finishReasons=[c.get('finish_reason') for c in choices]);record(row)
        url=urls[0];u=urlparse(url)
        if u.scheme!='https' or not (u.hostname or '').endswith('.aliyuncs.com'):raise RuntimeError('Generated image must use an official HTTPS download URL')
        target=OUT/'provider.png';part=OUT/'provider.png.part'
        if target.exists() or part.exists():raise RuntimeError('Existing/partial generated image requires inspection')
        with session.get(url,timeout=(30,180),stream=True) as download:
            download.raise_for_status()
            with part.open('xb') as f:
                for block in download.iter_content(1024*1024):f.write(block)
        part.replace(target)
        with Image.open(target) as im:
            row['providerDimensions']=list(im.size)
            # Image API rounds to multiples of16; this documented derivative
            # scales the entire raster rather than cropping/moving geometry.
            im.convert('RGB').resize((1920,1080),Image.Resampling.LANCZOS).save(OUT/'fountain-repaint-1920x1080.png')
        row.update(status='processed',providerSHA256=wan.sha(target),derivativeSHA256=wan.sha(OUT/'fountain-repaint-1920x1080.png'),
                   width=1920,height=1080,normalization='Full-frame resize only, no crop/reframe',visualReview='pending matching-geometry inspection',completedUTC=wan.utc());record(row);return 0
    except requests.RequestException as exc:
        row.update(status='submission_unknown' if row['status']=='submitting' else 'download_blocked',errorCode=type(exc).__name__);record(row);return 2

if __name__=='__main__':
    try:raise SystemExit(main())
    except (RuntimeError,OSError,ValueError,KeyError) as exc:
        print(json.dumps({'errorType':type(exc).__name__,'detail':str(exc) if isinstance(exc,RuntimeError) else 'Local processing failed'},ensure_ascii=False),file=sys.stderr);raise SystemExit(2)
