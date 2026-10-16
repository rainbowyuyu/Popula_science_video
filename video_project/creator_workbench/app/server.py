from __future__ import annotations
import base64, hashlib, hmac, json, math, mimetypes, os, re, secrets, shutil, subprocess, threading, time, uuid
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit, parse_qs, unquote
from .harness import RunManager, ProjectBusy, redact, junction, safe_path
from .library import Library
from .providers import ProviderManager, DEFAULT_MODEL_EFFORTS
from .context_budget import DEFAULT_BUDGET
from .media_studio import MediaStudio
from .studio import Studio, probe
from .project_cleanup import CleanupManager
from .workflows import Workflows
from .library import _id
from .video_review import VideoReview
from .project_structure import ProjectStructure
from .learning_workspace import LearningWorkspace
from .project_memory import ProjectMemory

VERSION='2.8.1'
def public_execution_limits(value):
 if not isinstance(value,dict):return None
 result={}
 for key in ('maxSteps','maxRunSeconds','modelTokensPerStep'):
  if key not in value:continue
  item=value[key]
  if item is None or (isinstance(item,int) and not isinstance(item,bool) and item>=0):result[key]=item
 return result or None
def public_output_limit(value):
 if not isinstance(value,dict):return None
 result={}
 for key,maximum in (('provider',40),('model',160),('stopReason',60)):
  item=value.get(key)
  if isinstance(item,str):result[key]=redact(item)[:maximum]
 for key in ('requestedTokens','nextTokens','attempts','outputTokens','reasoningTokens'):
  item=value.get(key)
  if isinstance(item,int) and not isinstance(item,bool) and item>=0:result[key]=item
 return result or None
def public_provider_failure(value):
 if not isinstance(value,dict):return None
 result={}
 for key,maximum in (('code',40),('kind',40),('provider',40),('model',160),('occurredAt',60)):
  item=value.get(key)
  if isinstance(item,(str,int)) and not isinstance(item,bool):result[key]=redact(item)[:maximum]
 if isinstance(value.get('httpStatus'),int) and not isinstance(value['httpStatus'],bool):result['httpStatus']=value['httpStatus']
 if isinstance(value.get('retryable'),bool):result['retryable']=value['retryable']
 return result or None
class ActivityGuard:
 def __init__(self,check):self.check=check
 def locked(self):return self.check()
class RequestActivity:
 def __init__(self):self.count=0;self.guard=threading.Lock()
 def begin(self):
  with self.guard:self.count+=1
 def end(self):
  with self.guard:self.count-=1
 def locked(self):
  with self.guard:return self.count>0
class Workbench:
 def __init__(self,video_root:Path,state_root:Path,resource_root:Path):
  self.video_root=video_root.resolve();self.state_root=state_root.resolve();self.resource_root=resource_root.resolve()
  self.state_root.mkdir(parents=True,exist_ok=True);self.token=secrets.token_urlsafe(32);self.csrf=secrets.token_urlsafe(32)
  self.library=Library(self.video_root);self.providers=ProviderManager();self.runs=RunManager(self.library,self.providers,self.state_root,self.resource_root)
  self.media_index={};self.lock=threading.RLock();self.checks={};self.check_locks={p:threading.Lock() for p in ('openai','claude')}
  self.media_studio=MediaStudio(self.video_root,self.state_root,self.library,coordinator=self.runs)
  self.studio=Studio(self);self.cleanup=CleanupManager(self)
  self.video_review=VideoReview(self);self.structure=ProjectStructure(self.library)
  self.workflows=Workflows(self);self.learning=LearningWorkspace(self);self.runs.project_callback=self.project_tool
  self.project_memory=ProjectMemory(self)
  self.runs.memory_callback=self.project_memory.capture_run
  self.thumbnail_guard=threading.Semaphore(2);self.probe_cache={}
  # The stable launcher already defers reload while any activity guard is held.
  self.check_locks['media']=ActivityGuard(self.media_studio.has_active)
  self.check_locks['workflows']=ActivityGuard(self.workflows.has_active)
  self.check_locks['learning']=ActivityGuard(self.learning.has_active)
  self.request_activity=RequestActivity();self.check_locks['studio-requests']=self.request_activity
  self.check_locks['model-workers']=ActivityGuard(self.model_workers_active)
  self.check_locks['history-import']=ActivityGuard(self.project_memory.has_active)
 def model_workers_active(self):
  with self.runs.lock:return bool(self.runs.workers)
 def bootstrap(self,refresh=False):
  d=self.library.snapshot(refresh=refresh,lightweight=True);statuses=self.providers.public_status()
  d['projects']=self.studio.decorate_projects(d['projects'])
  for project in d['projects']:
   settings=self.studio.config(project['id']);project['contextBudgetTokens']=settings.get('contextBudgetTokens',DEFAULT_BUDGET);project['modelEfforts']=settings.get('modelEfforts',dict(DEFAULT_MODEL_EFFORTS))
  d['series']=[{k:s.get(k) for k in ('id','name','archived')} for s in self.studio.store['series']]
  for project in d['projects']:
   covers=project.get('latestCovers',[])
   if isinstance(covers,dict):covers=list(covers.values())
   hero=next((c for c in covers if c.get('ratio')=='16:9'),None) or (covers[0] if covers else None)
   hero=hero or project.get('latestVideo')
   if hero:project['thumbnailUrl']='/api/thumbnail/'+hero['id']+'?v='+str(hero.get('modified',0))
  for p in statuses:
   prior=self.checks.get(p['id'])
   if prior and prior['configFingerprint']==self.fingerprint(p):p['lastCheck']=prior
  all_runs=[r for r in self.runs.summary() if not self.library.is_learning_project(r.get('projectId'))]
  run_rows=[r for i,r in enumerate(all_runs) if i<12 or r.get('canResume') or r.get('status') in {'queued','running','cancelling','awaiting_selection'}]
  d.update({'providers':statuses,'csrfToken':self.csrf,'runs':[{k:r.get(k) for k in ('id','projectId','projectName','status','createdAt','provider','phase','prompt','response','selectedCandidateId','contextBudgetTokens','contextStats','modelEfforts','canResume','pauseReason','resumeCount','executionPolicy','clientRequestId','recovery','creativeWork')} for r in run_rows],'version':VERSION,'selectedProjectId':next((p['id'] for p in d['projects'] if 'c_pointers' in p['path']),d['projects'][0]['id'] if d['projects'] else None),'runtime':{'localOnly':True,'creativeExecution':'本机工具在当前用户权限运行；文件编辑自动备份。','videoRoot':str(self.video_root),'reload':dict(getattr(self,'runtime_status',{}) or {})}})
  for run in d['runs']:
   run['prompt']=str(run.get('prompt') or '')[:300];run['response']=str(run.get('response') or '')[:1000];run['summaryOnly']=True
  failures={r['id']:public_provider_failure(r.get('providerFailure')) for r in run_rows}
  output_limits={r['id']:public_output_limit(r.get('outputLimit')) for r in run_rows}
  execution_limits={r['id']:public_execution_limits(r.get('limits')) for r in run_rows}
  for run in d['runs']:
   if failures.get(run['id']):run['providerFailure']=failures[run['id']]
   if output_limits.get(run['id']):run['outputLimit']=output_limits[run['id']]
   if execution_limits.get(run['id']):run['limits']=execution_limits[run['id']]
   if run.get('executionPolicy')!='continuous':run.pop('executionPolicy',None)
  return d
 @staticmethod
 def fingerprint(p):return hashlib.sha256(json.dumps({k:p.get(k) for k in ('id','model','endpointDisplay','source','configured')},sort_keys=True).encode()).hexdigest()
 def media(self,project_id,refresh=False):
  return self.media_page(project_id,scope='all',refresh=refresh,limit=4000)['items']
 def media_page(self,project_id,scope='latest',offset=0,limit=40,refresh=False):
  page=self.library.media_page(project_id,scope=scope,offset=offset,limit=limit,refresh=refresh)
  items=[]
  for item in page['items']:
   try:current=Path(item['path']).stat()
   except OSError:continue
   items.append({**item,'size':current.st_size,'modified':current.st_mtime,'url':'/api/media/'+item['id']+'?v='+str(current.st_mtime_ns)+'-'+str(current.st_size)})
  with self.lock:
   if refresh:
    self.media_index={ident:entry for ident,entry in self.media_index.items() if entry['projectId']!=project_id}
   for item in items:self.media_index[item['id']]={**item,'projectId':project_id}
  return {**page,'items':items,'scope':scope}
 def media_path(self,ident):
  with self.lock:item=self.media_index.get(ident)
  if not item:
   item=self.library.media_lookup(ident)
  if not item:raise KeyError('媒体不存在，请刷新素材')
  root=Path(self.library.project(item['projectId'])['path']).resolve();p=Path(item['path'])
  if not p.resolve().is_relative_to(root):raise ValueError('媒体路径超出工程')
  current=p
  while current!=root:
   if junction(current):raise ValueError('媒体不可通过目录链接访问')
   current=current.parent
  if not p.is_file() or p.suffix.lower() not in {'.mp4','.webm','.mov','.m4v','.jpg','.jpeg','.png','.gif','.webp','.wav','.mp3','.m4a','.ogg','.flac'}:raise ValueError('不可预览该文件')
  return p
 def resources(self):
  data=self.library.snapshot(lightweight=False)
  return {k:data.get(k) for k in ('skills','plugins','tools','totals','counts')}
 def studio_snapshot(self,pid,module='all'):
  return {**self.studio.snapshot(pid,module=module),'workflows':self.workflows.summary(pid)}
 def project_tool(self,pid,tool,args):
  if tool=='project_memory_image':return self.project_memory.attachment(pid,args.get('recordId'),args.get('attachmentIndex',0),for_model=True,use_series=args.get('_useSeriesStyle'))
  if tool=='project_memory':return self.project_memory.tool(pid,args)
  if tool=='project_state':return {**self.studio.project_state(pid,args.get('module')),'creativeMemory':{**self.project_memory.overview(pid),'retrieveTool':'project_memory','manifestPath':'.studio/codex-memory.json'}}
  if tool=='project_job':
   job=self.media_studio.get_job(args.get('id',''))
   if job.get('projectId')!=pid:raise ValueError('此后台任务不属于当前工程')
   if job.get('kind')=='qwen-video' and job.get('taskId') and job.get('status')=='submitted':return self.media_studio.poll_video(job['id'])
   return job
  allowed={'copy.save','camera.save','subtitles.save','tts.generate','audio.mix','timeline.replace','qwen.generate','project.configure','project.rename','cover.from_file'}
  action=args.get('action');values=args.get('arguments',{})
  if action not in allowed or not isinstance(values,dict):raise ValueError('此模块操作不可用')
  return self.studio_action({**values,'action':action,'projectId':pid})
 def studio_action(self,body):
  # Review notes and settings remain editable while a render runs. Operations
  # that replace project artifacts share the model worker's project lock.
  protected={'copy.save','cover.save','cover.from_file','cover.render','camera.save','subtitles.save','project.organize','structure.apply','cleanup.apply','editor.export','style.learn'}
  pid=str(body.get('projectId',''))
  if pid and body.get('action') in protected:
   with self.runs.lock:
    lock=self.runs.project_lock(pid)
    if not lock._is_owned():self.runs.assert_available(pid)
    if not lock.acquire(blocking=False):raise ProjectBusy('此工程正在写入素材，请稍后保存；修改草稿已保留。')
   try:return self._studio_action(body)
   finally:lock.release()
  return self._studio_action(body)
 def _studio_action(self,body):
  action=body.get('action')
  if action in {'production.read','production.save'}:
   from . import production_brief
   pid=str(body.get('projectId',''));self.library.project(pid)
   return {'brief':production_brief.read(self.studio,pid)} if action=='production.read' else production_brief.save(self.studio,pid,body)
  if isinstance(action,str) and action.startswith('memory.'):return self.project_memory.action(body)
  if isinstance(action,str) and action.startswith('learning.'):return self.learning.action(body)
  if action in {'structure.scan','structure.apply'}:
   pid=str(body.get('projectId',''))
   if action=='structure.apply' and self.cleanup._active(pid):raise ValueError('当前工程有任务运行，完成后再整理目录')
   return self.structure.apply(pid) if action=='structure.apply' else self.structure.scan(pid)
  if isinstance(action,str) and action.startswith('review.'):return self.video_review.action(body)
  if action=='context.configure':
   from .context_budget import validate_budget
   pid=str(body.get('projectId',''));self.library.project(pid);budget=validate_budget(body.get('contextBudgetTokens'))
   from .providers import validate_model_efforts
   settings={'contextBudgetTokens':budget}
   if 'modelEfforts' in body:settings['modelEfforts']=validate_model_efforts(body['modelEfforts'])
   self.studio.update_config(pid,lambda config:config.update(settings))
   return {'projectId':pid,**settings}
  if action=='file.reveal':return self.reveal_file(body)
  if action=='workflow.start':return self.workflows.start(body)
  if action=='workflow.get':return self.workflows.get(body.get('id'))
  if action=='workflow.cancel':return self.workflows.stop(body.get('id'))
  if action=='frame.capture':return self.frame_capture(body)
  if action in {'cleanup.scan','cleanup.apply','project.approve'} and self.workflows.has_active(str(body.get('projectId',''))):raise ValueError('此工程有学习或批量任务运行，完成后再核验或清理')
  if action=='cover.from_file':
   root=Path(self.library.project(str(body.get('projectId')))['path']);source=safe_path(root,body.get('path',''))
   if not source.is_file() or source.suffix.lower() not in {'.jpg','.jpeg'} or source.stat().st_size>15_000_000:raise ValueError('封面需为工程内JPG且小于15MB')
   return self.studio.action({**body,'action':'cover.save','dataUrl':'data:image/jpeg;base64,'+base64.b64encode(source.read_bytes()).decode()})
  return self.studio.action(body)
 def reveal_file(self,body):
  root=Path(self.library.project(str(body.get('projectId','')))['path']).resolve()
  target=safe_path(root,body.get('path') or '.')
  if not target.exists():raise ValueError('文件已移动或不存在，请刷新工程')
  explorer=Path(os.environ.get('SystemRoot','C:/Windows'))/'explorer.exe'
  if not explorer.is_file():raise ValueError('此系统没有Windows资源管理器')
  args=[str(explorer),str(target)] if target.is_dir() else [str(explorer),'/select,',str(target)]
  subprocess.Popen(args,close_fds=True,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  return {'opened':True,'path':target.relative_to(root).as_posix()}
 def frame_capture(self,body):
  pid=str(body.get('projectId',''));root=Path(self.library.project(pid)['path']);source=self.media_path(body['mediaId']) if body.get('mediaId') else safe_path(root,body.get('sourcePath',''))
  if not source.resolve().is_relative_to(root.resolve()):raise ValueError('媒体不在当前工程')
  if source.suffix.lower() not in {'.mp4','.mov','.webm','.m4v'}:raise ValueError('请选择视频')
  at=float(body.get('timeSec',0));duration=float(probe(source).get('format',{}).get('duration') or 0)
  if not math.isfinite(at) or not 0<=at<duration:raise ValueError('帧时间超出视频时长')
  target=safe_path(root,'references/frames/'+uuid.uuid4().hex+'.jpg');target.parent.mkdir(parents=True,exist_ok=True)
  command=[shutil.which('ffmpeg') or 'ffmpeg','-v','error','-ss',str(at),'-i',str(source),'-frames:v','1','-vf','scale=1280:1280:force_original_aspect_ratio=decrease','-q:v','2',str(target)]
  done=subprocess.run(command,capture_output=True,timeout=25,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
  if done.returncode or not target.is_file():raise ValueError('无法提取此帧')
  registered=self.library.register_media(target,pid)
  ident=registered['id'];relative=target.relative_to(root).as_posix()
  with self.lock:self.media_index[ident]=registered
  metadata={'id':ident,'path':relative,'absolutePath':str(target),'url':'/api/media/'+ident,'timeSec':at,'sourcePath':source.relative_to(root).as_posix(),'kind':'image'}
  (target.with_suffix('.json')).write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf8')
  self.studio.activity(pid,'frame.capture',{k:v for k,v in metadata.items() if k not in {'absolutePath','url'}})
  return metadata
 def media_probe(self,ident):
  source=self.media_path(ident);st=source.stat();key=(str(source),st.st_mtime_ns,st.st_size)
  with self.lock:cached=self.probe_cache.get(key)
  if cached:return cached
  details=probe(source);video=next((s for s in details.get('streams',[]) if s.get('codec_type')=='video'),{})
  rate=video.get('avg_frame_rate') or video.get('r_frame_rate') or '0/1'
  try:
   n,d=rate.split('/');fps=float(n)/float(d)
  except (ValueError,ZeroDivisionError):fps=0
  value={'duration':float(details.get('format',{}).get('duration') or 0),'fps':fps,'width':video.get('width',0),'height':video.get('height',0),'audio':any(s.get('codec_type')=='audio' for s in details.get('streams',[]))}
  with self.lock:
   if len(self.probe_cache)>128:self.probe_cache.clear()
   self.probe_cache[key]=value
  return value
 def thumbnail(self,ident):
  source=self.media_path(ident);st=source.stat();fingerprint=hashlib.sha256((str(source)+str(st.st_size)+str(st.st_mtime_ns)).encode()).hexdigest()
  target=self.state_root/'thumbnails'/(fingerprint+'.jpg')
  if target.is_file():return target
  with self.thumbnail_guard:
   if target.is_file():return target
   target.parent.mkdir(parents=True,exist_ok=True);temporary=target.with_name(fingerprint+'-'+uuid.uuid4().hex[:6]+'.jpg')
   command=[shutil.which('ffmpeg') or 'ffmpeg','-v','error','-threads','1','-i',str(source),'-frames:v','1','-vf','scale=320:240:force_original_aspect_ratio=decrease','-q:v','4',str(temporary)]
   done=subprocess.run(command,capture_output=True,timeout=25,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
   if done.returncode or not temporary.is_file():raise ValueError('缩略图暂不可用')
   os.replace(temporary,target)
  return target
 def create_project(self,name):
  name=str(name).strip()
  if not re.fullmatch(r'[\w\-\u4e00-\u9fff ]{1,70}',name) or name.startswith(('.', '_')) or name.casefold() in {'con','prn','aux','nul','com1','lpt1'}:raise ValueError('名称仅使用中文、字母、数字、空格或短横线')
  p=self.video_root/name
  if p.exists():raise ValueError('同名工程已存在')
  p.mkdir()
  for directory in ('source','assets','audio','subtitles','covers','output','work','references'):(p/directory).mkdir()
  (p/'README.md').write_text(f'# {name}\n\n由 rainbow鱼 创作工作台建立。源码、文案在本目录，成片在 output/，临时素材在 work/。\n',encoding='utf8')
  (p/'project.json').write_text(json.dumps({'name':name,'createdBy':'rainbow-workbench','version':1},ensure_ascii=False),encoding='utf8')
  snap=self.library.snapshot(refresh=True,lightweight=True)
  return next(x for x in snap['projects'] if Path(x['path'])==p)
 def check_provider(self,ident,reserved=False):
  if ident not in {'openai','claude'}:raise ValueError('未知接口')
  if not reserved and not self.check_locks[ident].acquire(blocking=False):raise ValueError('此接口正在检查')
  try:
   public=next(p for p in self.providers.public_status() if p['id']==ident)
   start=time.monotonic();reply=self.providers.complete(ident,[{'role':'user','content':'Reply with exactly WORKBENCH_OK. Do not use tools.'}],max_tokens=256,temperature=.1,timeout=60)
   ok=reply.get('text','').strip()=='WORKBENCH_OK'
   result={'ok':ok,'model':reply.get('model'),'elapsedSeconds':round(time.monotonic()-start,2),'checkedAt':time.time(),'usage':reply.get('usage',{}),'message':'接口已返回正确检查结果' if ok else '接口返回内容未匹配检查文本','configFingerprint':self.fingerprint(public)}
   self.checks[ident]=result;return result
  finally:self.check_locks[ident].release()

class Handler(BaseHTTPRequestHandler):
 server_version='RainbowWorkbench/1.0';protocol_version='HTTP/1.1'
 def log_message(self,fmt,*args):pass # Never log launch tokens or request content.
 def handle_one_request(self):
  # BaseHTTPRequestHandler reuses this instance for HTTP keep-alive requests.
  self._reload_checked=False
  return super().handle_one_request()
 @property
 def app(self):return self.server.app
 def headers_common(self):
  self.send_header('X-Content-Type-Options','nosniff');self.send_header('Referrer-Policy','no-referrer');self.send_header('X-Frame-Options','SAMEORIGIN')
  self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'")
 def send_json(self,value,status=200):
  data=json.dumps(value,ensure_ascii=False).encode('utf8');self.send_response(status);self.headers_common();self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers()
  if self.command!='HEAD':self.wfile.write(data)
 def valid_host(self):return self.headers.get('Host','') in {f'127.0.0.1:{self.server.server_port}',f'localhost:{self.server.server_port}'}
 def authenticated(self):
  cookie=SimpleCookie()
  try:cookie.load(self.headers.get('Cookie',''));value=cookie.get('rainbow_session');token=value.value if value else ''
  except Exception:token=''
  return hmac.compare_digest(token,self.app.token)
 def authorize(self,mutation=False):
  if not self.valid_host():self.send_json({'error':'仅接受本机工作台访问'},403);return False
  if not self.authenticated():self.send_json({'error':'请从工作台启动器重新打开此页面'},401);return False
  if mutation:
   origin=self.headers.get('Origin')
   if origin and origin not in {f'http://127.0.0.1:{self.server.server_port}',f'http://localhost:{self.server.server_port}'}:self.send_json({'error':'跨站请求被拒绝'},403);return False
   if not hmac.compare_digest(self.headers.get('X-CSRF-Token',''),self.app.csrf):self.send_json({'error':'页面会话已过期，请刷新工作台'},403);return False
  return True
 def get_body(self):
  if self.headers.get('Transfer-Encoding'):raise ValueError('不支持分块请求体')
  size=int(self.headers.get('Content-Length','0'))
  limit=30_000_000 if urlsplit(self.path).path=='/api/studio/action' else 1_000_000
  if size<0 or size>limit:raise ValueError('请求内容过大')
  if self.headers.get_content_type()!='application/json':raise ValueError('请使用JSON请求')
  data=json.loads(self.rfile.read(size) or b'{}')
  if not isinstance(data,dict):raise ValueError('请求格式无效')
  return data
 def reload_runtime(self,method):
  if getattr(self,'_reload_checked',False):return False
  self._reload_checked=True;callback=getattr(self.server,'reload_callback',None)
  if not callback:return False
  previous_app=self.server.app;previous_handler=self.server.RequestHandlerClass
  try:
   result=callback()
   if isinstance(result,dict):
    self.server.app.runtime_status={k:redact(v) if isinstance(v,str) else v for k,v in result.items()}
  except Exception as error:
   # Keep the last working application if source reload cannot be completed.
   self.server.app=previous_app;self.server.RequestHandlerClass=previous_handler
   self.server.app.runtime_status={'status':'error','error':redact(error),'message':'更新未能应用，继续使用上一版运行时。'}
  current_handler=self.server.RequestHandlerClass
  if current_handler is not type(self):
   self.__class__=current_handler
   getattr(self,method)()
   return True
  return False
 def do_HEAD(self):self.do_GET()
 def do_GET(self):
  try:
   url=urlsplit(self.path);path=unquote(url.path);q=parse_qs(url.query)
   if not self.valid_host():return self.send_json({'error':'Host不匹配'},403)
   if path=='/health':return self.send_json({'app':'rainbow-creator-workbench','version':VERSION})
   if path in {'/','/api/bootstrap'} and self.reload_runtime('do_GET'):return
   launch=parse_qs(url.query).get('launch',[''])[0]
   if path=='/' and launch and hmac.compare_digest(launch,self.app.token):
    self.send_response(303);self.send_header('Set-Cookie',f'rainbow_session={self.app.token}; HttpOnly; SameSite=Strict; Path=/');self.send_header('Location','/');self.send_header('Referrer-Policy','no-referrer');self.send_header('Content-Length','0');self.end_headers();return
   if not self.authorize():return
   if path=='/api/studio':
    query=parse_qs(url.query)
    return self.send_json(self.app.studio_snapshot(query.get('projectId',[''])[0],query.get('module',['base'])[0]))
   if path=='/api/project-memory':return self.send_json(self.app.project_memory.page(q.get('projectId',[''])[0],q.get('q',[''])[0],q.get('offset',[0])[0],q.get('kind',['all'])[0]))
   if path=='/api/project-memory/record':return self.send_json(self.app.project_memory.record(q.get('projectId',[''])[0],q.get('id',[''])[0]))
   if path=='/api/project-memory/attachment':return self.serve_file(self.app.project_memory.attachment(q.get('projectId',[''])[0],q.get('id',[''])[0],q.get('index',[0])[0]))
   if path=='/api/learning':return self.send_json(self.app.learning.snapshot())
   if path=='/api/resources':return self.send_json(self.app.resources())
   if path.startswith('/api/thumbnail/'):return self.serve_file(self.app.thumbnail(path.split('/')[3]),thumbnail=True)
   if path.startswith('/api/music/'):return self.serve_file(self.app.media_studio.music_path(path.split('/')[3]),media=True)
   if path=='/api/bootstrap':return self.send_json(self.app.bootstrap())
   if path.startswith('/api/projects/') and path.endswith('/media'):
    query=parse_qs(url.query)
    return self.send_json(self.app.media_page(path.split('/')[3],scope=query.get('scope',['latest'])[0],offset=int(query.get('offset',['0'])[0]),limit=int(query.get('limit',['40'])[0]),refresh=query.get('refresh',[''])[0]=='1'))
   if path.startswith('/api/skills/'):return self.send_json(self.app.library.skill(path.split('/')[3]))
   if path.startswith('/api/runs/'):return self.send_json(self.app.runs.get(path.split('/')[3]))
   if path.startswith('/api/media/') and path.endswith('/probe'):return self.send_json(self.app.media_probe(path.split('/')[3]))
   if path.startswith('/api/media/'):return self.serve_file(self.app.media_path(path.split('/')[3]),media=True)
   if path.startswith('/api/'):return self.send_json({'error':'接口不存在'},404)
   if path.startswith('/editors/minipaint/'):
    root=(self.app.resource_root/'tools/minipaint').resolve();relative=path[len('/editors/minipaint/'):] or 'index.html';file=root/relative
    if not file.resolve().is_relative_to(root) or not file.is_file() or file.suffix.lower() not in {'.html','.js','.css','.json','.png','.jpg','.jpeg','.svg','.gif','.woff','.woff2','.ttf','.txt'}:return self.send_json({'error':'编辑器文件不存在'},404)
    return self.serve_file(file)
   file=self.app.resource_root/'web'/('index.html' if path=='/' else path.lstrip('/'))
   if not file.resolve().is_relative_to((self.app.resource_root/'web').resolve()) or not file.is_file():return self.send_json({'error':'页面不存在'},404)
   return self.serve_file(file)
  except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
  except KeyError as e:self.send_json({'error':redact(e)},404)
  except ValueError as e:self.send_json({'error':redact(e),'code':getattr(e,'code',None)},getattr(e,'status_code',400))
  except Exception as e:self.send_json({'error':redact(e)},500)
 def do_POST(self):
  try:
   if not self.authorize(mutation=True):return
   path=urlsplit(self.path).path
   # Authenticate first and hand off before reading the request body; the new
   # handler consumes it exactly once and retains the same token/CSRF session.
   if path=='/api/refresh' and self.reload_runtime('do_POST'):return
   body=self.get_body()
   if path=='/api/studio/action':
    # Reserve the runtime before releasing its reload lock. Long media actions
    # must not block another project's marks, cancel button, or task creation.
    with self.server.lifecycle_lock:
     app=self.app;app.request_activity.begin()
    try:result=app.studio_action(body)
    finally:app.request_activity.end()
    return self.send_json(result)
   if path=='/api/runs':
    with self.server.lifecycle_lock:
     # Resolve a previously accepted request before rebuilding its review
     # snapshot. The user may have edited marks since losing the response.
     with self.app.runs.lock:
      replay=bool(body.get('clientRequestId')) and any(r.get('projectId')==body.get('projectId') and r.get('clientRequestId')==body['clientRequestId'] for r in self.app.runs.runs.values())
     if replay:return self.send_json(self.app.runs.start(body),202)
     if 'contextBudgetTokens' not in body:body['contextBudgetTokens']=self.app.studio.config(str(body.get('projectId',''))).get('contextBudgetTokens',DEFAULT_BUDGET)
     if 'modelEfforts' not in body:body['modelEfforts']=self.app.studio.config(str(body.get('projectId',''))).get('modelEfforts',dict(DEFAULT_MODEL_EFFORTS))
     body['context']=self.app.studio.context(str(body.get('projectId','')),body.get('context'),query=body.get('prompt',''))
     result=self.app.runs.start(body)
    return self.send_json(result,202)
   if path.startswith('/api/runs/') and path.endswith('/select'):
    with self.server.lifecycle_lock:result=self.app.runs.select_candidate(path.split('/')[3],body.get('candidateId'))
    return self.send_json(result,202)
   if re.fullmatch(r'/api/runs/[^/]+/resume',path):
    with self.server.lifecycle_lock:result=self.app.runs.resume(path.split('/')[3])
    return self.send_json(result,202)
   if path=='/api/refresh':return self.send_json(self.app.bootstrap(refresh=True))
   if path=='/api/projects':return self.send_json(self.app.create_project(body.get('name','')),201)
   if path.startswith('/api/runs/') and path.endswith('/cancel'):return self.send_json(self.app.runs.stop(path.split('/')[3]))
   if path.startswith('/api/providers/') and path.endswith('/check'):
    # Select the current app and reserve its probe under the same lock used by
    # reload. Release it before HTTP I/O so refresh can report "busy" immediately.
    with self.server.lifecycle_lock:
     app=self.app;ident=path.split('/')[3]
     if ident not in {'openai','claude'}:raise ValueError('未知接口')
     if not app.check_locks[ident].acquire(blocking=False):raise ValueError('此接口正在检查')
    return self.send_json(app.check_provider(ident,reserved=True))
   if path=='/api/shutdown':
    if self.app.learning.has_active():return self.send_json({'error':'学习队列仍在运行，请先暂停或取消任务'},409)
    if self.app.workflows.has_active():return self.send_json({'error':'有学习或批量任务运行，请先停止'},409)
    if self.app.media_studio.has_active():return self.send_json({'error':'有媒体任务运行，请先停止或等待完成'},409)
    if any(r['status'] in {'queued','running','cancelling'} for r in self.app.runs.summary()):return self.send_json({'error':'仍有任务运行，请先停止任务'},409)
    self.send_json({'ok':True});threading.Thread(target=self.server.shutdown,daemon=True).start();return
   self.send_json({'error':'接口不存在'},404)
  except (BrokenPipeError,ConnectionResetError,ConnectionAbortedError):pass
  except (ValueError,KeyError) as e:self.send_json({'error':redact(e),'code':getattr(e,'code',None)},getattr(e,'status_code',400))
  except Exception as e:self.send_json({'error':redact(e)},500)
 def serve_file(self,p,media=False,thumbnail=False):
  total=p.stat().st_size;start=0;end=total-1;status=200
  range_header=self.headers.get('Range') if media else None
  if range_header:
   match=re.fullmatch(r'bytes=(\d*)-(\d*)',range_header.strip())
   if not match or not any(match.groups()):return self.range_error(total)
   left,right=match.groups()
   if left:start=int(left);end=min(int(right),total-1) if right else total-1
   else:
    length=int(right)
    if length<=0:return self.range_error(total)
    start=max(0,total-length)
   if start>=total or start>end:return self.range_error(total)
   status=206
  self.send_response(status);self.headers_common();self.send_header('Content-Type',mimetypes.guess_type(p.name)[0] or 'application/octet-stream');self.send_header('Content-Length',str(max(0,end-start+1)))
  self.send_header('Accept-Ranges','bytes');self.send_header('Cache-Control','private, max-age=86400' if thumbnail else 'private, max-age=0, must-revalidate' if media else 'no-store')
  if status==206:self.send_header('Content-Range',f'bytes {start}-{end}/{total}')
  self.end_headers()
  if self.command=='HEAD':return
  with p.open('rb') as stream:
   stream.seek(start);remaining=end-start+1
   while remaining>0:
    chunk=stream.read(min(1024*1024,remaining))
    if not chunk:break
    self.wfile.write(chunk);remaining-=len(chunk)
 def range_error(self,total):
  self.send_response(416);self.send_header('Content-Range',f'bytes */{total}');self.send_header('Content-Length','0');self.end_headers()

def create_server(app,port=0):
 server=ThreadingHTTPServer(('127.0.0.1',port),Handler);server.daemon_threads=True;server.app=app;server.lifecycle_lock=threading.RLock();return server
