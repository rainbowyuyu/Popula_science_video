"""Generate optional V02 environmental plates with Qwen/Wan.
Credentials are read only from DASHSCOPE_API_KEY or QWEN_API_KEY.
No scientific labels or numerical evidence are generated here; plates are
background bridges and are composited under deterministic Canvas overlays.
"""
from __future__ import annotations
import base64, json, os, pathlib, time, uuid, requests
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'public/generated-v02'; OUT.mkdir(parents=True,exist_ok=True)
HOST=os.environ.get('DASHSCOPE_API_HOST','https://dashscope.aliyuncs.com').rstrip('/')
KEY=os.environ.get('DASHSCOPE_API_KEY') or os.environ.get('QWEN_API_KEY')
PROXY={'https':os.environ.get('TRAILER_HTTPS_PROXY','http://127.0.0.1:7897')}
if not KEY: raise SystemExit('DASHSCOPE_API_KEY or QWEN_API_KEY is required')
STYLE='cinematic documentary environment, dark graphite-blue palette, restrained cyan Cherenkov glow and warm ivory highlights, realistic physically coherent materials, volumetric depth, smooth continuous camera, no text, no labels, no logos, no UI, no watermark, no split screen, no morphing.'
SHOTS={
 'deep-ice': 'A continuous underwater-like descent through clear Antarctic blue ice, sparse optical modules embedded at different depths, a single cyan particle pulse travels through the ice and creates a soft conical blue flash, the camera glides downward with stable geometry, educational science film atmosphere. '+STYLE,
 'cosmic-messenger': 'A wide deep-space scene with a distant active galaxy at the upper left and three physically distinct messengers crossing the frame: a charged cosmic ray bends gently in a magnetic field, a gamma ray fades through a translucent dust veil, a neutrino travels as a clean cyan line toward Earth. Smooth camera drift, rich star field, coherent parallax. '+STYLE,
 'icecube-night': 'Aerial night view of a quiet Antarctic ice field with a subtle grid of detector strings beneath the translucent surface, faint cyan pulses rising from deep ice into a single elegant light cone, camera makes a slow low orbit, cinematic and calm, no futuristic city or interface. '+STYLE,
}
def post(path,payload,headers=None):
 r=requests.post(HOST+path,headers=headers or {'Authorization':'Bearer '+KEY,'Content-Type':'application/json'},json=payload,proxies=PROXY,timeout=240); r.raise_for_status(); return r.json()
def get(path):
 r=requests.get(HOST+path,headers={'Authorization':'Bearer '+KEY},proxies=PROXY,timeout=240); r.raise_for_status(); return r.json()
def upload(path,model):
 r=requests.get(HOST+'/api/v1/uploads',params={'action':'getPolicy','model':model},headers={'Authorization':'Bearer '+KEY},proxies=PROXY,timeout=40); r.raise_for_status(); d=r.json().get('data',r.json().get('output',{}))
 p=pathlib.Path(path); fields={'OSSAccessKeyId':d['oss_access_key_id'],'Signature':d['signature'],'policy':d['policy'],'key':d['upload_dir']+'/'+uuid.uuid4().hex+'-'+p.name,'x-oss-object-acl':d['x_oss_object_acl'],'x-oss-forbid-overwrite':d['x_oss_forbid_overwrite'],'success_action_status':'200','x-oss-content-type':'image/png'}
 with p.open('rb') as f: q=requests.post(d['upload_host'],data=fields,files={'file':f},proxies=PROXY,timeout=180)
 q.raise_for_status(); return 'oss://'+fields['key']
def main():
 manifest={'modelImage':'qwen-image-2.0-pro-2026-06-22','modelVideo':'wan2.6-i2v','shots':{},'created':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
 for name,prompt in SHOTS.items():
  image=OUT/f'{name}.png'; video=OUT/f'{name}.mp4'
  if not image.exists():
   payload={'model':'qwen-image-2.0-pro-2026-06-22','input':{'messages':[{'role':'user','content':[{'text':prompt}]}]},'parameters':{'size':'1664*936','n':1,'watermark':False,'prompt_extend':False,'seed':8100+list(SHOTS).index(name)}}
   o=post('/api/v1/services/aigc/multimodal-generation/generation',payload); u=o['output']['choices'][0]['message']['content'][0]['image']; image.write_bytes(requests.get(u,proxies=PROXY,timeout=240).content)
  if not video.exists():
   ref=upload(image,'wan2.6-i2v'); payload={'model':'wan2.6-i2v','input':{'img_url':ref,'prompt':'One uninterrupted 5-second cinematic camera movement. Preserve all rigid geometry and subject identity from the keyframe. Subtle physically coherent particles and light pulses, smooth parallax, no cuts, no text, no morphing.'},'parameters':{'resolution':'1080P','duration':5,'audio':False,'prompt_extend':False,'seed':9100+list(SHOTS).index(name)}}
   o=post('/api/v1/services/aigc/video-generation/video-synthesis',payload,{'Authorization':'Bearer '+KEY,'Content-Type':'application/json','X-DashScope-Async':'enable','X-DashScope-OssResourceResolve':'enable'}); task=o['output']['task_id']
   for _ in range(120):
    s=get('/api/v1/tasks/'+task); st=s['output']['task_status']
    if st=='SUCCEEDED': video.write_bytes(requests.get(s['output']['video_url'],proxies=PROXY,timeout=240).content); break
    if st in ('FAILED','CANCELED','UNKNOWN'): raise RuntimeError(f'{name} {st}: '+json.dumps(s.get('output',{}),ensure_ascii=False))
    time.sleep(15)
   else: raise TimeoutError(name)
  manifest['shots'][name]={'image':str(image.relative_to(ROOT)).replace('\\','/'),'video':str(video.relative_to(ROOT)).replace('\\','/'),'prompt':SHOTS[name],'sha256':__import__('hashlib').sha256(video.read_bytes()).hexdigest()}
  (OUT/'generation-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
  print(name,'ready',video)
if __name__=='__main__':main()
