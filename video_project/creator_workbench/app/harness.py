from __future__ import annotations
import base64, copy, datetime as dt, difflib, hashlib, json, os, re, shutil, stat, subprocess, threading, time, uuid
from pathlib import Path
from contextlib import contextmanager
from .collaboration import READ_ONLY_TOOLS, normalize_context, parse_candidates, phase_specs, roles_from
from .context_budget import validate_budget
from .providers import ProviderError, validate_model_efforts
from .output_budget import BASE_OUTPUT_TOKENS, LENGTH_REASONS, OUTPUT_GUIDANCE, effort_allowance, prepare_output_context, usage_tokens
from .local_paths import TTS_ROOT, BLENDER_PATH, python_executable
from .creative_work import ensure_work, public_work, update_plan, report_artifact, record_check, observe_tool

EXCLUDED={'.git','node_modules','.venv','venv','__pycache__','.ssh','.codex','.claude','credentials','secrets'}
SECRET_NAME=re.compile(r'(^\.env($|\.)|(?:api[-_]?keys?|credentials?|secrets?|auth)\.(?:json|toml|ya?ml)$|id_(?:rsa|ed25519)|\.pem$)',re.I)
TEXT_EXT={'.py','.js','.mjs','.cjs','.ts','.tsx','.jsx','.json','.md','.txt','.html','.css','.srt','.vtt','.toml','.yaml','.yml','.c','.h','.glsl','.vert','.frag','.svg','.xml','.csv','.tex','.bat','.ps1'}
def now():return dt.datetime.now(dt.timezone.utc).isoformat()
def redact(value):
 s=str(value)
 s=re.sub(r'\bsk-(?:sp-)?[A-Za-z0-9_.-]{12,}','[REDACTED]',s)
 s=re.sub(r'(?i)(bearer\s+)[A-Za-z0-9._~+/=-]+',r'\1[REDACTED]',s)
 s=re.sub(r'(?i)(authorization|api[_-]?key|auth[_-]?token)([\s\"\x27:=]+)[^\s\"\x27,}]+',r'\1\2[REDACTED]',s)
 return s
def junction(p):
 s=p.lstat();return stat.S_ISLNK(s.st_mode) or bool(getattr(s,'st_file_attributes',0)&0x400)
def safe_path(root:Path,name:str,*,write=False):
 if not isinstance(name,str) or not name or '\x00' in name:raise ValueError('文件路径无效')
 raw=Path(name)
 if raw.is_absolute() or raw.drive or '..' in raw.parts:raise ValueError('只允许选定工程内的相对路径')
 for part in raw.parts:
  if part.endswith((' ','.')) or ':' in part or re.match(r'^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)',part,re.I):raise ValueError('不接受Windows设备名、备用数据流或会被系统归一化的路径')
 if any(x.lower() in EXCLUDED or SECRET_NAME.search(x) for x in raw.parts):raise ValueError('该位置不属于可编辑的工程素材')
 target=root/raw;current=root
 for part in raw.parts:
  current/=part
  if current.exists() and junction(current):raise ValueError('不跟随链接或目录联接')
 if not target.resolve().is_relative_to(root.resolve()):raise ValueError('路径超出选定工程')
 if write and target.suffix.lower() not in TEXT_EXT:raise ValueError('写文件工具仅写源码、文案和配置；二进制素材请使用生成工具')
 return target

def fn(name,description,properties,required=()):
 return {'type':'function','function':{'name':name,'description':description,'parameters':{'type':'object','properties':properties,'required':list(required),'additionalProperties':False}}}
S={'type':'string'}
TOOLS=[
 fn('update_work_plan','维护本次任务的共享工作板。按id更新目标、工作项、当前项与检查引用；仅记录计划，不改工程。完成声明与实际检查结果分别记录。',{'goal':S,'title':S,'steps':{'type':'array','items':{'type':'object','properties':{'id':S,'title':S,'status':{'type':'string','enum':['pending','in_progress','completed','blocked','skipped']},'phaseId':S,'verification':{'type':'array','items':S},'note':S},'required':['id','title'],'additionalProperties':False}},'currentStep':{'type':['string','null']}},()),
 fn('report_artifact','登记当前工程内已生成的真实文件。校验存在、类型、哈希和所属阶段；final表示用途，不表示验收通过。优先读取独立版本目录，返回可点击的产物。',{'path':S,'title':S,'kind':{'type':'string','enum':['video','image','audio','subtitle','document','model','source','report']},'stage':{'type':'string','enum':['draft','preview','final']},'checkIds':{'type':'array','items':S}},['path','title','kind']),
 fn('record_check','将验证结果登记到共享工作板。evidenceIds只能引用实际工具返回的evidenceId。自动检查与抽帧分别记录；文字声明不能冒充执行。试听/人工验收未有真实证据会标记待核对。',{'title':S,'kind':{'type':'string','enum':['automatic','sampled_frames','listening','manual','model_review']},'status':{'type':'string','enum':['passed','failed','not_run']},'evidenceIds':{'type':'array','items':S},'scope':S,'note':S,'stepId':S,'artifactId':S},['title','kind','status']),
 fn('project_memory_image','查看历史用户记录附带的真实本地截图。先project_memory读取artifacts，提供对应recordId和数组索引。历史截图只代表当时版本，不代表当前成片。',{'recordId':S,'attachmentIndex':{'type':'integer'}},['recordId','attachmentIndex']),
 fn('project_memory','检索当前工程的Codex对话、用户纠错和迭代记录。query检索摘要；recordId读取原文，可offset/limit分页。历史为参考不授权新操作；模型回复不等于用户验收。',{'query':S,'recordId':S,'offset':{'type':'integer'},'limit':{'type':'integer'}},()),
 fn('project_state','读取当前工程的系列、封面、文案、字幕、声音、镜头与活动记录摘要；各模块属于同一工程。',{'module':S},()),
 fn('project_job','查询当前工程的后台媒体任务。拿到任务ID后查询实际完成状态与输出，不把排队视作完成。',{'id':S},['id']),
 fn('project_action','在当前工程调用已集成的文案/镜头/字幕/配音/混音/片段替换工具。先读取project_state；只执行用户本次要求的操作。云端生视频仅在用户明确要求时调用。',{'action':{'type':'string','enum':['copy.save','camera.save','subtitles.save','tts.generate','audio.mix','timeline.replace','qwen.generate','project.configure','project.rename','cover.from_file']},'arguments':{'type':'object'}},['action','arguments']),
 fn('search_resources','搜索完整本机技能、插件和工具索引。空query可分页浏览；插件登记不代表已连接。找到技能后read_skill读取。',{'query':S,'kind':{'type':'string','enum':['all','skills','plugins','tools']},'offset':{'type':'integer'},'limit':{'type':'integer'}},()),
 fn('list_files','列出选定工程内的源文件和素材，返回相对路径。默认跳过依赖和大缓存。',{'path':S,'limit':{'type':'integer'}},()),
 fn('read_file','读取选定工程内UTF-8文本；offset为字符位置。不会读取凭据。',{'path':S,'offset':{'type':'integer'},'limit':{'type':'integer'}},['path']),
 fn('search_files','在选定工程源码中搜索字面文本。',{'query':S,'path':S},['query']),
 fn('read_skill','按索引id读取已有技能；先了解用法，再调用工具。',{'id':S},['id']),
 fn('read_reference','读取某个已索引技能目录内的参考文档。',{'skillId':S,'path':S},['skillId','path']),
 fn('read_tool_doc','读取现有TTS或Claude入口使用文档。',{'tool':{'type':'string','enum':['tts-workflow','tts-narration','claude']}},['tool']),
 fn('list_media','返回当前工程可预览视频、图片、音频，不把存在文件说成验收通过。',{},()),
 fn('inspect_frame','读取当前工程视频指定秒数的真实帧，或图片。不限制检查张数，按需分批查看；不能把抽帧当完整观看。path为工程相对路径。',{'path':S,'timeSec':{'type':'number'}},['path']),
 fn('write_file','在选定工程写入完整UTF-8文件；覆盖前自动保存备份并记录diff。创造模式可用。',{'path':S,'content':S},['path','content']),
 fn('replace_text','精确替换文件中的唯一文本片段，自动备份。创造模式可用。',{'path':S,'old':S,'new':S},['path','old','new']),
 fn('run_process','运行本机视频工具直到退出或用户停止，无默认运行时长限制。程序仅可选python/node/npm/blender/ffmpeg/ffprobe；args为参数数组，cwd为工程相对目录。无shell解释。运行前读入口文档，禁止删除历史项目/读凭据/发布/全局配置。',{'program':{'type':'string','enum':['python','node','npm','blender','ffmpeg','ffprobe']},'args':{'type':'array','items':S},'cwd':S},['program','args']),
]

class RunPaused(Exception):
 def __init__(self,reason,message):super().__init__(message);self.reason=reason

class ProjectBusy(ValueError):
 status_code=409
 code='project_busy'

class WorkerBarrier:
 """Compatibility idle barrier; workers never acquire it to execute."""
 def __init__(self):self.condition=threading.Condition();self.count=0
 def begin(self):
  with self.condition:self.count+=1
 def end(self):
  with self.condition:self.count-=1;self.condition.notify_all()
 def acquire(self,blocking=True,timeout=None):
  with self.condition:
   if not blocking:return self.count==0
   return self.condition.wait_for(lambda:self.count==0,timeout)
 def release(self):pass

def durable_json(path,data,*,backup=True):
 """Replace a complete snapshot only after fsync, keeping the last valid JSON."""
 path.parent.mkdir(parents=True,exist_ok=True)
 def replace(target,content):
  temporary=target.with_name(target.name+'.tmp')
  with temporary.open('wb') as stream:stream.write(content);stream.flush();os.fsync(stream.fileno())
  os.replace(temporary,target)
 if backup and path.exists():
  try:
   prior=path.read_bytes();json.loads(prior)
   replace(path.with_suffix(path.suffix+'.bak'),prior)
  except (OSError,ValueError):pass
 replace(path,json.dumps(data,ensure_ascii=False,indent=2).encode('utf8'))

class RunManager:
 def __init__(self,library,providers,state_root:Path,resource_root:Path):
  self.library=library;self.providers=providers;self.state_root=state_root;self.resource_root=resource_root
  self.runs={};self.cancel={};self.lock=threading.RLock();self.semaphore=WorkerBarrier();self.project_locks={};self.workers=set()
  (state_root/'runs').mkdir(parents=True,exist_ok=True)
  for p in sorted((state_root/'runs').glob('*/run.json'),key=lambda p:p.stat().st_mtime,reverse=True):
   try:
    d=None
    for snapshot in (p,p.with_suffix('.json.bak')):
     try:
      candidate=json.loads(snapshot.read_text(encoding='utf8'))
      if not isinstance(candidate,dict) or not all(isinstance(candidate.get(key),str) for key in ('id','projectId','createdAt','status','provider')):continue
      if candidate['id']!=p.parent.name or not isinstance(candidate.get('phases',[]),list) or not isinstance(candidate.get('events',[]),list):continue
      d=candidate;break
     except (OSError,ValueError):continue
    if d is None:continue
    if d.get('status') in {'queued','running','cancelling'}:
     d['status']='interrupted';d['response']='上次工作台关闭中断了任务，已保留文件和日志。'
     for phase in d.get('phases',[]):
      if phase.get('status')=='running':phase['status']='interrupted'
    self.restore_provider_failure(d)
    self.restore_output_failure(d)
    self.continuous_policy(d)
    d['canResume']=self.resumable(d)
    self.runs[d['id']]=d
    self.update_recovery(d)
   except (OSError,ValueError,KeyError,TypeError,AttributeError):pass
 def summary(self):
  with self.lock:
   rows=sorted(self.runs.values(),key=lambda r:r['createdAt'],reverse=True)
   return [self.public_snapshot(r,events=False) for index,r in enumerate(rows)
           if index<30 or r.get('status') in {'queued','running','cancelling','awaiting_selection'} or self.resumable(r)]
 def public_snapshot(self,r,*,events=True):
  result={k:copy.deepcopy(v) for k,v in r.items() if (events or k!='events') and k not in {'creativeWork','_creativeEvidence','_creativeEvidenceImported'}}
  result['creativeWork']=public_work(r)
  # Publishing a final/choice state is a promise that its worker has released
  # ownership. A slow final fsync must not expose buttons that still get 409.
  if r['id'] in self.workers and r.get('status') in {'completed','failed','cancelled','paused','interrupted','awaiting_selection'}:
   result.update(status='cancelling' if self.cancel.get(r['id'],threading.Event()).is_set() else 'running',
                 canResume=False,response='正在保存最后进度，请稍候。',finalizing=True)
   result.pop('recovery',None)
   result.pop('finishedAt',None)
   result['creativeWork']['status']=result['status']
  return result
 def continuous_policy(self,r):
  r['executionPolicy']='continuous'
  r.setdefault('limits',{}).update(maxSteps=None,maxRunSeconds=None)
  r['limits']['modelTokensPerStep']=BASE_OUTPUT_TOKENS
 def get(self,ident):
  with self.lock:
   if ident not in self.runs:raise KeyError('未找到任务')
   return self.public_snapshot(self.runs[ident])
 def persist(self,ident):
  with self.lock:
   p=self.state_root/'runs'/ident/'run.json';p.parent.mkdir(parents=True,exist_ok=True)
   ensure_work(self.runs[ident])
   durable_json(p,self.runs[ident])
 def has_active(self,project_id=None,exclude=None):
  with self.lock:return any(r['id']!=exclude and (project_id is None or r['projectId']==project_id) and (r.get('status') in {'queued','running','cancelling','awaiting_selection'} or r['id'] in self.workers) for r in self.runs.values())
 def assert_available(self,project_id,exclude=None):
  if self.has_active(project_id,exclude):raise ProjectBusy('此工程已有正在执行或等待选择的任务，请完成或停止后再继续')
 def project_lock(self,project_id):
  with self.lock:return self.project_locks.setdefault(project_id,threading.RLock())
 @contextmanager
 def project_operation(self,project_id,cancel_event=None,on_wait=None):
  lock=self.project_lock(project_id);waiting=False
  while not lock.acquire(timeout=.1):
   if cancel_event and cancel_event.is_set():raise InterruptedError('排队任务已停止，已有进度保留')
   if not waiting and on_wait:on_wait()
   waiting=True
  try:
   if cancel_event and cancel_event.is_set():raise InterruptedError('任务已停止，已有进度保留')
   yield
  finally:lock.release()
 def launch(self,ident,project):
  with self.lock:self.workers.add(ident)
  self.semaphore.begin()
  try:threading.Thread(target=self.execute,args=(ident,project),daemon=True,name='run-'+ident[:8]).start()
  except BaseException:
   with self.lock:self.workers.discard(ident)
   self.semaphore.end();raise
 def event(self,ident,kind,message,**data):
  with self.lock:self.runs[ident]['events'].append({'type':kind,'message':redact(message),'time':now(),**data})
  self.persist(ident)
 def start(self,body):
  prompt=str(body.get('prompt','')).strip()
  if not prompt:raise ValueError('请输入任务')
  context_budget=validate_budget(body.get('contextBudgetTokens'))
  model_efforts=validate_model_efforts(body.get('modelEfforts'))
  project=self.library.project(str(body.get('projectId','')))
  client_request=body.get('clientRequestId')
  if client_request is not None:
   if not isinstance(client_request,str) or not re.fullmatch(r'[A-Za-z0-9_-]{8,128}',client_request):raise ValueError('提交标识无效')
   with self.lock:
    previous=next((r for r in self.runs.values() if r['projectId']==project['id'] and r.get('clientRequestId')==client_request),None)
    if previous:return {'id':previous['id'],'status':self.public_snapshot(previous,events=False)['status'],'reused':True}
  mode=body.get('mode','creative');provider=body.get('provider','openai');candidates=body.get('candidates') is True
  dual=provider=='dual' or body.get('collaboration') is True or candidates
  if mode not in {'creative','review'} or provider not in {'openai','claude','dual'}:raise ValueError('模式或模型接口无效')
  roles=roles_from(body);context=normalize_context(body.get('context'),redact)
  source=context.get('timeRange',{}).get('sourcePath')
  if source:
   original=safe_path(Path(project['path']),source)
   if not original.is_file() or original.suffix.lower() not in {'.mp4','.webm','.mov','.m4v'}:raise ValueError('时间段修改需要工程内已有视频')
  statuses={p['id']:p for p in self.providers.public_status()}
  needed={'openai','claude'} if dual else {provider}
  for who in needed:
   ps=statuses.get(who)
   if not ps or not ps['configured']:raise ValueError((ps or {}).get('reason') or '请先在CC Switch配置'+who+' API')
  ident=uuid.uuid4().hex;model='' if dual else str(body.get('model') or statuses[provider].get('model') or '')
  selected=body.get('skillIds',[])
  if not isinstance(selected,list) or any(not isinstance(s,str) for s in selected):raise ValueError('技能选择必须为有效的技能ID列表')
  r={'id':ident,'projectId':project['id'],'projectName':project['name'],'provider':'dual' if dual else provider,'mode':mode,'model':model,'prompt':redact(prompt),'createdAt':now(),'status':'queued','events':[],'response':'','changedFiles':[],'skillIds':selected,'usage':[],'collaboration':dual,'roles':roles,'context':context,'candidateMode':candidates,'candidates':[],'selectedCandidateId':None,'phases':phase_specs(roles,dual=dual,provider=provider,mode=mode,candidates=candidates),'phase':None,'limits':{'maxSteps':None,'modelTokensPerStep':BASE_OUTPUT_TOKENS,'maxRunSeconds':None}}
  r['contextBudgetTokens']=context_budget;r['limits']['contextBudgetTokens']=context_budget;r['contextStats']=None
  r['modelEfforts']=model_efforts;r['canResume']=False;r['resumeCount']=0;r['collaborationCount']=0
  if client_request is not None:r['clientRequestId']=client_request
  self.continuous_policy(r)
  ensure_work(r)
  for phase in r['phases']:phase['requestedEffort']=model_efforts[phase['provider']]
  with self.lock:
   previous=next((old for old in self.runs.values() if client_request is not None and old['projectId']==project['id'] and old.get('clientRequestId')==client_request),None)
   if previous:return {'id':previous['id'],'status':self.public_snapshot(previous,events=False)['status'],'reused':True}
   self.assert_available(project['id']);self.runs[ident]=r;self.cancel[ident]=threading.Event()
  self.persist(ident);self.launch(ident,project);return {'id':ident}
 def stop(self,ident):
  with self.lock:
   r=self.runs.get(ident)
   if not r:raise KeyError('未找到任务')
   e=self.cancel.get(ident)
   if e:e.set()
   if r['status'] in {'queued','running'}:r['status']='cancelling'
   elif r['status']=='awaiting_selection':r['status']='cancelled';r['response']='候选选择已取消，未修改工程。';r['finishedAt']=now()
   r['canResume']=self.resumable(r);self.update_recovery(r)
  self.persist(ident);snapshot=self.get(ident)
  return {'id':ident,'status':snapshot['status'],'canResume':snapshot.get('canResume',False),'recovery':snapshot.get('recovery')}
 def select_candidate(self,ident,candidate_id):
  with self.lock:
   r=self.runs.get(ident)
   if not r:raise KeyError('未找到任务')
   if r['status']!='awaiting_selection':raise ValueError('此任务当前不等待选择')
   if ident in self.workers:raise ProjectBusy('候选结果正在保存，请稍后选择')
   self.assert_available(r['projectId'],ident)
   candidate=next((c for c in r.get('candidates',[]) if c['id']==candidate_id),None)
   if not candidate:raise ValueError('候选方案不存在')
   project=self.library.project(r['projectId'])
   statuses={p['id']:p for p in self.providers.public_status()}
   for who in ('openai','claude') if r['collaboration'] else (r['provider'],):
    if not statuses.get(who,{}).get('configured'):raise ValueError('请先在CC Switch配置'+who+' API')
   r['selectedCandidateId']=candidate_id;r['selectedCandidate']=copy.deepcopy(candidate);r['status']='queued';r['response']='';r.pop('finishedAt',None)
   r['phases'].extend(phase_specs(r['roles'],dual=r['collaboration'],provider=r['provider'],mode=r['mode']))
   self.continuous_policy(r);r['canResume']=False;r.pop('resumeMode',None)
   self.cancel[ident]=threading.Event();self.persist(ident)
  self.event(ident,'selection','已选择方案：'+candidate['title'],candidateId=candidate_id)
  self.launch(ident,project);return {'id':ident,'status':'queued'}
 def provider_failure(self,r,exc,provider=None):
  phase=next((p for p in r.get('phases',[]) if p['id']==r.get('phase')), {})
  who=provider or phase.get('activeProvider') or phase.get('provider') or r.get('provider')
  used=next((u for u in reversed(r.get('usage',[])) if u.get('provider')==who),{})
  model=used.get('model') or (r.get('model') if not r.get('collaboration') else '') or ''
  return {'kind':exc.kind,'httpStatus':exc.status_code,'provider':who,'model':model,
          'retryable':exc.retryable,'occurredAt':now()}
 def pause_provider(self,r,exc,provider=None):
  r['providerFailure']=self.provider_failure(r,exc,provider)
  reason={'timeout':'provider_timeout','upstream':'provider_unavailable','stream_incomplete':'provider_stream'}.get(exc.kind,exc.kind)
  r.update(status='paused',pauseReason=reason,canResume=True,
           response=redact(exc)+' 已完成的文件与工具结果已保存；点击“继续任务”接续。')
 def restore_provider_failure(self,r):
  # Older versions classified a gateway timeout as configuration failure. Only
  # known transient errors are migrated; no provider call is made while loading.
  if r.get('status')!='failed':return
  text=r.get('response','');match=re.search(r'HTTP (\d{3})',text)
  code=int(match[1]) if match else None
  kind=None
  if code in {408,504,524}:kind='timeout';message=f'上游响应超时（HTTP {code}）。'
  elif code==429:kind='rate_limit';message='接口暂时限流（HTTP 429），请稍后继续。'
  elif code is not None and 500<=code<=599:kind='upstream';message=f'上游服务暂时不可用（HTTP {code}）。'
  elif 'API 请求超时' in text or 'API 连接失败或超时' in text:kind='timeout';message='API 响应超时。'
  if not kind:return
  self.pause_provider(r,ProviderError(message,kind=kind,status_code=code,retryable=True))
  for phase in r.get('phases',[]):
   if phase['id']==r.get('phase') and phase.get('status')=='failed':phase['status']='paused'
 def output_tokens(self,r,provider,effort_default='default'):
  effort=r.get('modelEfforts',{}).get(provider,'default')
  if effort=='default':
   status=next((s for s in self.providers.public_status() if s['id']==provider),{})
   effort=status.get('effortDefault',effort_default)
  return max(effort_allowance(effort),r.get('outputBudgets',{}).get(provider,0))
 def output_limit(self,r,provider,result,requested,attempts):
  output,reasoning=usage_tokens(result.get('usage') or {})
  target=min(validate_budget(r.get('contextBudgetTokens'))-1,max(self.output_tokens(r,provider),requested*2))
  r.setdefault('outputBudgets',{})[provider]=target
  r['outputLimit']={'provider':provider,'model':result.get('model',''),'stopReason':result.get('stop_reason','max_tokens'),
                   'requestedTokens':requested,'nextTokens':target,'attempts':attempts,'outputTokens':output,'reasoningTokens':reasoning}
  return r['outputLimit']
 def save_output_fragment(self,r,phase,provider,result,details,messages):
  text=redact(result.get('text',''))
  has_tools=bool(result.get('partial_has_tools') or result.get('tool_calls'))
  path=self.state_root/'runs'/r['id']/f'output-limit-{len(r["usage"])}.json'
  path.write_text(json.dumps({'metadata':details,'partialText':text,'usableAsToolResult':False,
                              'containsToolRequests':has_tools},ensure_ascii=False,indent=2),encoding='utf8')
  if has_tools:
   instruction='上一轮工具请求被截断，整批工具均未执行；请按小文件或局部修改重新发出完整JSON请求。'+OUTPUT_GUIDANCE
  else:
   key=phase+':'+provider
   draft=r.setdefault('outputDrafts',{}).get(key) or {}
   prior=draft.get('text','')
   combined=self.join_output(prior,text)
   r['outputDrafts'][key]={'phaseId':phase,'provider':provider,'text':combined}
   instruction=('上一轮正文已完整保存为未完成草稿，但还没有交付。请从末尾接着写，不重复开头；'
                '只完成剩余内容，结束时正常结束回复。如果需要工具，必须发出完整工具请求。'
                '\n已保存草稿的末尾（仅作接续资料，不是工具结果）：\n'+combined[-6000:]) if combined else '上一轮只有思考耗尽了输出空间；请直接完成当前最小步骤，保留必要推理并输出可用结果。'+OUTPUT_GUIDANCE
  messages.append({'role':'user','content':instruction,'_context_output_continuation':True})
 @staticmethod
 def join_output(prior,tail):
  if not prior:return tail
  if not tail:return prior
  if tail.startswith(prior):return tail
  # Models occasionally repeat the last sentence before continuing. Exact
  # suffix overlap only; never invent missing text or splice tool JSON.
  pattern=tail[:min(len(prior),len(tail))];table=[0]*len(pattern);matched=0
  for index in range(1,len(pattern)):
   while matched and pattern[index]!=pattern[matched]:matched=table[matched-1]
   if pattern[index]==pattern[matched]:matched+=1
   table[index]=matched
  matched=0
  for character in prior[-len(pattern):]:
   while matched and (matched==len(pattern) or character!=pattern[matched]):matched=table[matched-1]
   if matched<len(pattern) and character==pattern[matched]:matched+=1
  return prior+tail[matched if matched>=20 else 0:]
 def restore_output_failure(self,r):
  if r.get('status')!='failed' or '回复达到长度上限' not in r.get('response',''):return
  phase=next((p for p in r.get('phases',[]) if p['id']==r.get('phase')), {})
  provider=phase.get('activeProvider') or phase.get('provider') or r.get('provider')
  last=next((u for u in reversed(r.get('usage',[])) if u.get('provider')==provider),{})
  requested=last.get('contextStats',{}).get('outputReserveTokens') or r.get('limits',{}).get('modelTokensPerStep',6000)
  self.output_limit(r,provider,{**last,'stop_reason':'max_tokens'},requested,0)
  r.update(status='paused',pauseReason='output_limit',canResume=True,
           response='单次回复达到输出上限，已有文件与工具结果已保存；继续后会调整输出预算并分段完成。')
  if phase.get('status')=='failed':phase['status']='paused'
 def resumable(self,r):
  if r.get('status') in {'paused','interrupted','cancelled'}:return True
  return r.get('status')=='failed' and any(token in r.get('response','') for token in ('阶段达到调用上限','总调用上限','本次运行时限'))
 def update_recovery(self,r,data=None):
  if not self.resumable(r):
   r.pop('recovery',None);return
  data=self.read_checkpoint(r) if data is None else data
  exact=bool(data and data.get('safe') and not data.get('_fromBackup') and data.get('selectedCandidateId')==r.get('selectedCandidateId')
             and [p.get('id') for p in data['phases']]==[p.get('id') for p in r.get('phases',[])])
  count=sum(e.get('type')=='tool_result' for e in r.get('events',[]))
  r['recovery']={'mode':'exact' if exact else 'reconcile','phase':(data or {}).get('phaseId') or r.get('phase'),
                 'checkpointAt':(data or {}).get('savedAt'),'completedTools':count,
                 'message':'已保存完整交接，可从此处继续。' if exact else '先核对实际文件和后台任务，再继续；不会重放中断前的工具批次。'}
 def checkpoint(self,r,messages,phase_id=None,collaborator=None,*,safe=True):
  # Never resume by replaying a partially executed batch. Mark unsafe before any
  # side effects; recovery then re-reads actual files/jobs rather than replaying it.
  path=self.state_root/'runs'/r['id']/'checkpoint.json'
  data={'schema':1,'runId':r['id'],'projectId':r['projectId'],'savedAt':now(),'safe':safe,
        'phaseId':phase_id,'collaborator':collaborator,'messages':messages,'phases':r['phases'],
        'selectedCandidateId':r.get('selectedCandidateId'),'outputDrafts':r.get('outputDrafts',{})}
  marker=path.with_name('checkpoint-unsafe.json')
  if not safe:durable_json(marker,{'runId':r['id'],'phaseId':phase_id,'startedAt':data['savedAt']},backup=False)
  durable_json(path,data)
  if safe:marker.unlink(missing_ok=True)
 def read_checkpoint(self,r):
  path=self.state_root/'runs'/r['id']/'checkpoint.json'
  for candidate in (path,path.with_suffix('.json.bak')):
   try:
    data=json.loads(candidate.read_text(encoding='utf8'))
    if data.get('schema')!=1 or data.get('runId')!=r['id'] or data.get('projectId')!=r['projectId']:continue
    if not isinstance(data.get('messages'),list) or not isinstance(data.get('phases'),list):continue
    if candidate!=path:data['_fromBackup']=True;data['safe']=False
    if path.with_name('checkpoint-unsafe.json').exists():data['safe']=False
    return data
   except (OSError,ValueError,AttributeError):continue
  return None
 def resume(self,ident):
  with self.lock:
   r=self.runs.get(ident)
   if not r:raise KeyError('未找到任务')
   if not self.resumable(r):raise ValueError('此任务当前不能继续；正在执行或已完成的任务不会重复启动')
   if ident in self.workers:raise ProjectBusy('任务正在保存最后进度，请稍后继续')
   self.assert_available(r['projectId'],ident)
   project=self.library.project(r['projectId']);statuses={p['id']:p for p in self.providers.public_status()}
   for provider in ('openai','claude') if r.get('collaboration') else (r['provider'],):
    if not statuses.get(provider,{}).get('configured'):raise ValueError('请先在CC Switch配置'+provider+' API')
   data=self.read_checkpoint(r)
   exact=bool(data and data.get('safe') and data.get('selectedCandidateId')==r.get('selectedCandidateId')
              and [p.get('id') for p in data['phases']]==[p.get('id') for p in r['phases']])
   if exact:r['phases']=data['phases']
   else:
    specs=phase_specs(r.get('roles',roles_from({})),dual=r.get('collaboration',False),provider=r['provider'],mode=r['mode'],candidates=bool(r.get('candidateMode') and not r.get('selectedCandidateId')))
    by_id={p['id']:p for p in specs}
    for phase in r['phases']:
     if phase['status']!='completed' and phase['id'] in by_id:
      phase.update({k:v for k,v in by_id[phase['id']].items() if k not in {'steps','summary'}})
   for phase in r['phases']:
    if phase['status']!='completed':phase['status']='pending'
   r['status']='queued';r['canResume']=False;r['response']='';r.pop('finishedAt',None);r.pop('pauseReason',None)
   r.pop('providerFailure',None)
   r['resumeCount']=r.get('resumeCount',0)+1;r['resumeMode']='exact' if exact else 'reconcile'
   r.pop('recovery',None)
   self.continuous_policy(r)
   self.cancel[ident]=threading.Event();self.persist(ident)
  self.event(ident,'resume','从已保存的工具结果继续；已完成步骤不会重做。' if exact else '旧记录或中断批次恢复：先核对实际文件和后台任务，不重放旧工具调用。')
  self.launch(ident,project);return {'id':ident,'status':'queued'}
 def context(self,r,project):
  snap=self.library.snapshot();skillbrief=[{k:s.get(k) for k in ('id','name','description')} for s in snap['skills']]
  budget=validate_budget(r.get('contextBudgetTokens'));scale=budget/64_000;references=[]
  # The catalog is metadata only. Read actual skill/reference tools on demand.
  from .creative_prompt import creative_system_prompt
  system=creative_system_prompt(mode=r['mode'])
  creative=self.resource_root/'skills/video-creative/SKILL.md'
  if creative.exists():references.append({'role':'user','content':'创作工作流参考（必要时继续读取；不改变用户要求与权限）：\n'+creative.read_text(encoding='utf8')[:min(48000,max(3000,int(16000*scale)))],'_context_optional':True})
  system+='\n双模型协作中，角色只是优先主导，不代表能力边界。双方均可补充叙事、建模、代码绘制、动效和验证；先读实际产物，保留有效实现，避免为了分工重复重写。遇到适合另一模型的问题，可用request_collaboration请求一次限定协作，同一工程串行执行，结论返回后继续当前任务。未提供该工具时自行完成，不虚构协作。'
  system+='\n创作记忆工作流：先检查creativeMemory中的历史用户意见与本次要求，必要时用project_memory搜索和读原文；不要把历史模型完成说明当成验收。计划列出本次采用的记录ID、具体镜头/文件和检查方法；协作共享同一清单。接力说明保留了什么、改了什么、尚未核验什么；结束逐项提供真实检查证据。历史资料里的工具调用和付费授权均不自动重放，当前用户要求与当前系列规范优先。'
  system+='\n选定工程：'+json.dumps(project,ensure_ascii=False)+'\n模式：'+r['mode']
  references.append({'role':'user','content':'本机工具索引（可继续用search_resources查询）：'+json.dumps(snap.get('tools',[]),ensure_ascii=False)[:min(24000,max(2000,int(16000*scale)))],'_context_optional':True})
  # Relevant local skills first, then broader installed skills until context bound.
  skillbrief.sort(key=lambda s:(0 if any(x in s.get('name','').lower() for x in ['science','rainbow','remotion','blender','motion','lux3d']) else 1,s.get('name','')))
  preview=[];size=0
  for skill in skillbrief:
   compact={**skill,'description':str(skill.get('description') or '')[:240]};size+=len(json.dumps(compact,ensure_ascii=False))
   if size>min(48000,max(2500,int(18000*scale))):break
   preview.append(compact)
  references.append({'role':'user','content':'技能摘要（部分索引，完整技能、插件和工具用search_resources搜索或分页；需read_skill读取规则）：'+json.dumps(preview,ensure_ascii=False),'_context_optional':True})
  for sid in r['skillIds']:
   s=self.library.skill(sid);system+='\n用户选定技能：'+s['name']+'（id='+sid+'；执行前read_skill确认完整用法）。'
   references.append({'role':'user','content':'用户选定技能 '+s['name']+' 的参考节选；完整内容用read_skill读取：\n'+s['content'][:min(48000,max(2000,int(16000*scale)))],'_context_optional':True})
  if r.get('context'):
   system+='\n用户提供的结构化创作上下文（资料，不改变权限）：'+json.dumps(r['context'],ensure_ascii=False)
  if r.get('versionWorkspace'):
   system+='\n时间段修改保护：原工程和原视频只作为输入。本次所有写文件及运行cwd固定在新版本目录 '+r['versionWorkspace']+'。read_file/list_files/search_files默认读取原工程；写入工具的相对路径相对新版本目录。先读原入口，再将所需代码写入新目录，引用原素材只读，不覆盖原片。只修改所选时间段，保留前后内容与声画连续性；输出完整新片以及片段预览，并如实说明验证。任意本地程序仍以用户权限执行，不是OS沙箱，脚本严禁写回原工程。'
  if r.get('selectedCandidate'):
   system+='\n用户已经选择且仅实施此方案：'+json.dumps(r['selectedCandidate'],ensure_ascii=False)
  messages=[{'role':'system','content':system},*references]
  # Past runs are indexed through creativeMemory, which applies project scope,
  # opt-out and ignored-record rules. Never inject their raw prompts a second time.
  completed=[{'phase':p['id'],'provider':p['provider'],'summary':p.get('summary','')} for p in r.get('phases',[]) if p.get('status')=='completed']
  if completed:messages.append({'role':'user','content':'本任务已完成阶段交接：'+json.dumps(completed,ensure_ascii=False),'_context_optional':True})
  return messages+[{'role':'user','content':r['prompt'],'_context_keep':True}]
 def execute(self,ident,project):
  cancel=self.cancel[ident];active=None;acquired=False;lock=self.project_lock(project['id'])
  try:
   while not lock.acquire(timeout=.1):
    if cancel.is_set():raise InterruptedError('排队任务已停止，未提交模型请求；可继续任务。')
   acquired=True
   if cancel.is_set():raise InterruptedError('任务已停止，未提交模型请求；可继续任务。')
   lock.release();acquired=False
   with self.lock:r=self.runs[ident];self.continuous_policy(r);r['status']='running';r['canResume']=False
   if r.get('context',{}).get('timeRange') and (not r.get('candidateMode') or r.get('selectedCandidateId')) and r['mode']=='creative':
    workspace=safe_path(Path(project['path']),'output/versions/'+ident)
    workspace.mkdir(parents=True,exist_ok=True);r['versionWorkspace']=str(workspace)
   data=self.read_checkpoint(r) if r.get('resumeMode')=='exact' else None
   messages=data['messages'] if data else self.context(r,project)
   if data:
    r['outputDrafts']=copy.deepcopy(data.get('outputDrafts',{}))
   collaborator=data.get('collaborator') if data else None
   restored_phase=data.get('phaseId') if data else None
   if r.get('resumeMode'):
    recovery='从保存进度继续。用户可能修改过工程，写入前核对实际文件与现存后台任务；已成功的生成或写入不要重做。'
    if not data:
     recovery+='旧记录只有节选，不是可重放的工具对话。以下是历史事实线索，需实际读取核对：'+json.dumps({'files':[{k:f.get(k) for k in ('path','sha256')} for f in r.get('changedFiles',[])][-30:], 'events':[e for e in r.get('events',[]) if e['type'] in {'tool_result','tool_error','handoff'}][-20:]},ensure_ascii=False)[:24000]
    messages.append({'role':'user','content':recovery})
   messages.append({'role':'user','content':OUTPUT_GUIDANCE,'_context_optional':True})
   if r.get('outputLimit') and not r.get('outputDrafts'):
    messages.append({'role':'user','content':'上次单次回复达到输出上限；其中的工具没有执行，也未放入有效对话。请从最后成功工具结果继续。'+OUTPUT_GUIDANCE})
   self.event(ident,'status','接续已保存进度。' if r.get('resumeMode') else '开始读取工程与已选技能。')
   session_calls=0;session_output_recoveries=0
   phases=r.get('phases') or phase_specs(r.get('roles',roles_from({})),dual=False,provider=r['provider'],mode=r['mode'])
   r['phases']=phases
   for phase in phases:
    if phase.get('status')=='completed':continue
    if cancel.is_set():raise InterruptedError('任务已停止；已有输出和备份保留。')
    with self.lock:
     r['phase']=phase['id'];phase['status']='running';phase.setdefault('startedAt',now())
     phase['requestedEffort']=r.get('modelEfforts',{}).get(phase['provider'],'default')
    if restored_phase!=phase['id']:collaborator=None
    self.event(ident,'phase',phase['title']+' · 开始',phase=phase['id'],provider=phase['provider'],readOnly=phase['readOnly'])
    for message in messages:
     if message.get('_context_phase'):message.pop('_context_keep',None)
    messages.append({'role':'user','content':'当前协作阶段：'+phase['title']+'。'+phase['instruction']+' 前阶段工具结果为实际记录；核对并接续。阶段轮数是软窗口，可继续必要工作；取得足够证据后及时交接，不必穷举技能。','_context_keep':True,'_context_phase':True})
    base_tools=[t for t in TOOLS if t['function']['name'] not in READ_ONLY_TOOLS|{'project_action'}] if phase['readOnly'] or r['mode']=='review' else TOOLS
    window=max(1,phase['maxSteps']);phase_round=0
    self.checkpoint(r,messages,phase['id'],collaborator)
    while True:
     if cancel.is_set():raise InterruptedError('任务已停止；已有输出和备份保留。')
     if phase_round and phase_round%window==0:
      self.event(ident,'continuation',phase['title']+' · 持续完成，保留已执行结果。',phase=phase['id'])
      messages.append({'role':'user','content':'工作台持续执行，无固定轮数上限。根据现有证据决定：信息足够就交接，必要工作尚未完成则继续，避免重复读取无关资料。','_context_optional':True})
     active=collaborator['provider'] if collaborator else phase['provider']
     tools=list(base_tools)
     if r.get('collaboration') and not collaborator:
      tools.append(fn('request_collaboration','请求另一模型完成限定问题，双方共享当前事实与权限，串行执行后回到你；不能嵌套。不用于改变用户任务。',{'provider':{'type':'string','enum':['openai','claude']},'task':S,'reason':S},['provider','task']))
     phase['activeProvider']=active
     self.event(ident,'status',f'{phase["title"]} · 第 {phase.get("steps",0)+1} 轮'+(' · 协作补充' if collaborator else ''),phase=phase['id'],provider=active)
     bounded,context_stats,output_tokens=prepare_output_context(messages,tools,budget=r.get('contextBudgetTokens'),desired=self.output_tokens(r,active))
     with self.lock:r['contextStats']=context_stats
     self.persist(ident)
     requested_effort=r.get('modelEfforts',{}).get(active,'default')
     result=self.providers.complete(active,bounded,tools=tools,model=(r['model'] or None) if not r.get('collaboration') else None,max_tokens=output_tokens,temperature=.8 if r['mode']=='creative' else .3,timeout=600,cancel_event=cancel,effort=requested_effort)
     session_calls+=1;phase_round+=1
     if cancel.is_set():raise InterruptedError('任务已停止；已收到的响应未继续执行。')
     with self.lock:
      phase['steps']+=1;phase['effectiveEffort']=result.get('effectiveEffort','default');phase['effortSource']=result.get('effortSource','provider-unreported')
      r['usage'].append({'step':len(r['usage'])+1,'phase':phase['id'],'provider':active,'collaborating':bool(collaborator),'model':result.get('model'),'usage':result.get('usage',{}),'contextStats':context_stats,'requestedEffort':requested_effort,'effectiveEffort':phase['effectiveEffort'],'effortSource':phase['effortSource'],'requestedOutputTokens':output_tokens,'stopReason':result.get('stop_reason','')})
     if result.get('output_truncated') or result.get('stop_reason') in LENGTH_REASONS:
      session_output_recoveries+=1
      details=self.output_limit(r,active,result,output_tokens,session_output_recoveries)
      self.save_output_fragment(r,phase['id'],active,result,details,messages)
      self.checkpoint(r,messages,phase['id'],collaborator)
      self.event(ident,'output_limit','本段已保存，正在持续接续未完成内容；原模型与思考强度保持不变。',phase=phase['id'],provider=active,outputLimit=copy.deepcopy(details))
      continue
     if result.get('stop_reason')=='content_filter':
      raise ProviderError('上游未返回完整可用内容，当前工具未执行。',kind='content_filter')
     if result.get('output_incomplete') or result.get('stop_reason')=='incomplete':
      raise ProviderError('模型回复未完整结束；当前工具未执行，已保留前轮进度。',kind='stream_incomplete',retryable=True)
     r.pop('outputLimit',None)
     text=redact(result.get('text',''));calls=result.get('tool_calls') or []
     draft_key=phase['id']+':'+active
     draft=r.get('outputDrafts',{}).get(draft_key)
     if draft and not calls:
      text=self.join_output(draft.get('text',''),text)
      r['outputDrafts'].pop(draft_key,None)
      result={**result,'text':text};result.pop('assistant_blocks',None)
     if text:self.event(ident,'assistant',text,phase=phase['id'],provider=active)
     msg={'role':'assistant','content':text}
     if active=='claude' and result.get('assistant_blocks'):
      msg['_provider']='claude';msg['assistant_blocks']=copy.deepcopy(result['assistant_blocks'])
      for block in msg['assistant_blocks']:
       if block.get('type')=='text':block['text']=redact(block['text'])
     if calls:msg['tool_calls']=calls
     messages.append(msg)
     if not calls:
      if not text:raise RuntimeError('模型未返回可用正文或工具请求')
      if collaborator:
       self.event(ident,'collaboration_return','协作结论已返回，原主导继续核对与实现。',phase=phase['id'],provider=active)
       collaborator=None
       for message in messages:
        if message.get('_context_collaboration'):message.pop('_context_keep',None)
       messages.append({'role':'user','content':'限定协作已结束，现在由原主导继续当前阶段。核对对方实际文件、结论和未完成项，吸收有效内容；协作结论不等于整个阶段完成。'})
       self.checkpoint(r,messages,phase['id']);continue
      with self.lock:phase['summary']=text;phase['status']='completed';phase['finishedAt']=now();phase.pop('activeProvider',None)
      self.checkpoint(r,messages,phase['id'])
      self.event(ident,'handoff',phase['title']+' · 阶段交接完成',phase=phase['id'],provider=active,summary=text)
      break
     self.checkpoint(r,messages,phase['id'],collaborator,safe=False)
     requested_collaboration=None
     for call in calls:
      if cancel.is_set():raise InterruptedError('任务已停止')
      name=call.get('name','');args=call.get('arguments',{})
      self.event(ident,'tool',f'调用 {name}',tool=name,phase=phase['id'],provider=active,arguments=redact(json.dumps({k:v for k,v in args.items() if k not in {'content','new','old'}},ensure_ascii=False))[:1200])
      try:
       if name not in {t['function']['name'] for t in tools}:raise ValueError('此模式或阶段不提供该工具')
       if name=='request_collaboration':
        target=args.get('provider');task=args.get('task');reason=args.get('reason','')
        if target not in {'openai','claude'} or target==active or not isinstance(task,str) or not task.strip() or not isinstance(reason,str):raise ValueError('协作需指定另一模型及具体任务')
        if requested_collaboration:raise ValueError('每轮只交接一个协作问题')
        if not next((p for p in self.providers.public_status() if p['id']==target),{}).get('configured'):raise ValueError('协作接口尚未配置')
        requested_collaboration={'provider':target,'task':redact(task),'reason':redact(reason),'steps':0}
        value={'accepted':True,'provider':target,'mode':'串行共享上下文','returnsTo':active}
       else:
        with self.project_operation(project['id'],cancel):value=self.tool(ident,project,name,args,cancel)
       with self.lock:value=observe_tool(r,name,args,value,clean=redact)
       content=redact(json.dumps(value,ensure_ascii=False))
       self.event(ident,'tool_result',content,tool=name,phase=phase['id'],provider=active)
      except InterruptedError:raise
      except Exception as e:
       content=json.dumps({'error':redact(e)},ensure_ascii=False);self.event(ident,'tool_error',content,tool=name,phase=phase['id'],provider=active)
      messages.append({'role':'tool','tool_call_id':call['id'],'content':content})
     image_paths=self.runs[ident].pop('_pendingImages',[])
     if image_paths:
      image_content=[{'type':'text','text':'以下是inspect_frame刚提取的实际画面；只对这些帧做视觉判断，不声称完整观看。'}]
      for path in image_paths:image_content.append({'type':'image_url','image_url':{'url':'data:image/jpeg;base64,'+base64.b64encode(Path(path).read_bytes()).decode('ascii')}})
      # Chunk transport messages, never the number of frames a task may inspect.
      for offset in range(1,len(image_content),8):messages.append({'role':'user','content':[image_content[0],*image_content[offset:offset+8]]})
     if collaborator:
      collaborator['steps']+=1
     if requested_collaboration:
      collaborator=requested_collaboration;r['collaborationCount']=r.get('collaborationCount',0)+1
      messages.append({'role':'user','content':'你现在作为协作模型接手一个限定问题。当前阶段权限不变，请使用上文真实工具结果；不嵌套请求协作。问题：'+collaborator['task']+'。原因：'+collaborator['reason']+'。完成后用文字交代实际改动、验证与未完成项，系统会回到原主导。','_context_keep':True,'_context_collaboration':True})
      self.event(ident,'collaboration','请另一模型补充：'+collaborator['task'][:300],phase=phase['id'],provider=collaborator['provider'],fromProvider=active)
     self.checkpoint(r,messages,phase['id'],collaborator)
   if r.get('candidateMode') and not r.get('selectedCandidateId'):
    candidates=parse_candidates(phases[-1]['summary'])
    with self.lock:r['candidates']=candidates;r['status']='awaiting_selection';r['phase']=None;r['response']='已完成双模型只读规划，请选择一个方案后继续实际制作。'
    self.event(ident,'candidates',r['response'],candidates=candidates)
   else:
    with self.lock:r['response']=phases[-1]['summary'];r['status']='completed';r['phase']=None
    self.event(ident,'status','任务完成，素材列表可刷新查看。')
  except RunPaused as e:
   with self.lock:r=self.runs[ident];r['status']='paused';r['pauseReason']=e.reason;r['response']=str(e);r['canResume']=True
   self.event(ident,'paused',str(e))
  except InterruptedError as e:
   with self.lock:self.runs[ident]['status']='cancelled';self.runs[ident]['response']=str(e)
   self.event(ident,'status',str(e))
  except ProviderError as e:
   with self.lock:
    r=self.runs[ident]
    if cancel.is_set():r['status']='cancelled';r['response']='任务已停止；已保存已有文件与日志。'
    elif e.retryable:self.pause_provider(r,e,active)
    else:r['status']='failed';r['response']=redact(e);r['providerFailure']=self.provider_failure(r,e,active)
   self.event(ident,'status' if cancel.is_set() else 'paused' if e.retryable else 'error',r['response'],provider=active)
  except Exception as e:
   with self.lock:self.runs[ident]['status']='cancelled' if cancel.is_set() else 'failed';self.runs[ident]['response']=redact(e)
   self.event(ident,'status' if cancel.is_set() else 'error',redact(e))
  except BaseException:
   with self.lock:self.runs[ident]['status']='interrupted';self.runs[ident]['response']='执行线程中断，已保留实际文件和检查点；请继续任务。'
  finally:
   with self.lock:
    r=self.runs[ident]
    for phase in r.get('phases',[]):
     if phase['status']=='running':phase['status']=r['status'] if r['status'] in {'paused','cancelled','interrupted'} else 'failed'
    if r['status'] in {'completed','failed','cancelled','paused','interrupted'}:r['finishedAt']=now()
    r['canResume']=self.resumable(r)
    self.update_recovery(r)
   try:
    self.persist(ident)
    callback=getattr(self,'memory_callback',None)
    if callback:
     try:callback(copy.deepcopy(r))
     except Exception:pass # History failure must not change a completed render's state.
   finally:
    if acquired:lock.release()
    with self.lock:self.workers.discard(ident)
    self.semaphore.end()
 def list_files(self,root,path='',limit=180):
  base=safe_path(root,path or '.');items=[]
  if not base.is_dir():raise ValueError('目录不存在')
  for directory,dirs,files in os.walk(base,followlinks=False):
   dirs[:]=sorted(d for d in dirs if d.lower() not in EXCLUDED|{'bundle','render-temp','builddeps','.cache'} and not junction(Path(directory)/d))
   for name in sorted(files):
    p=Path(directory)/name
    if junction(p) or SECRET_NAME.search(name):continue
    items.append({'path':p.relative_to(root).as_posix(),'bytes':p.stat().st_size})
    if len(items)>=min(max(limit,1),600):return {'files':items,'truncated':True}
  return {'files':items,'truncated':False}
 def frame_counts(self,r):
  if isinstance(r.get('inspectedFramesByPhase'),dict):return r['inspectedFramesByPhase']
  counts={}
  # Old records kept only a global counter. Attribute actual successful frame
  # observations to their phase; failed attempts must not consume a quota.
  for e in r.get('events',[]):
   if e.get('type')!='tool_result' or e.get('tool')!='inspect_frame':continue
   try:value=json.loads(e.get('message',''))
   except (ValueError,TypeError):continue
   if isinstance(value,dict) and value.get('imageAttached'):
    key=e.get('phase') or 'execute';counts[key]=counts.get(key,0)+1
  r['inspectedFramesByPhase']=counts
  return counts
 def write(self,ident,root,path,content):
  if not isinstance(content,str) or len(content.encode('utf8'))>2_000_000:raise ValueError('单文件写入上限2MB')
  if redact(content)!=content:raise ValueError('内容包含疑似凭据，不写入工程')
  p=safe_path(root,path,write=True)
  if p.exists() and p.stat().st_size>2_000_000:raise ValueError('现有文本过大，请分拆任务')
  old=p.read_text(encoding='utf-8-sig') if p.exists() else ''
  runroot=self.state_root/'runs'/ident;backup=None
  if p.exists():
   backup=runroot/'backups'/f'{len(self.runs[ident]["changedFiles"]):03d}'/path;backup.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(p,backup)
  p.parent.mkdir(parents=True,exist_ok=True);p.write_text(content,encoding='utf8')
  change={'path':path,'operation':'modified' if backup else 'created','backup':str(backup) if backup else None,'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'diff':redact(''.join(difflib.unified_diff(old.splitlines(True),content.splitlines(True),fromfile=path,tofile=path)))[:14000]}
  if self.runs[ident].get('versionWorkspace'):change['workspace']=str(root);change['versionPath']=str(p)
  with self.lock:self.runs[ident]['changedFiles'].append(change)
  self.persist(ident);return {'written':path,'bytes':p.stat().st_size,'sha256':change['sha256'],'backup':str(backup) if backup else None}
 def tool(self,ident,project,name,args,cancel):
  root=Path(project['path']).resolve()
  if name=='report_artifact':
   # Hashing a large movie must not freeze polling or another project's worker.
   with self.lock:
    row=self.runs[ident]
    working={k:copy.deepcopy(row[k]) for k in ('id','projectId','prompt','createdAt','status','phase','phases','creativeWork','versionWorkspace','_creativeEvidence') if k in row}
   value=report_artifact(working,root,args,safe_path,clean=redact)
   artifact=next(a for a in working['creativeWork']['artifacts'] if a['id']==value['artifact']['id'])
   register=getattr(self.library,'register_media',None)
   if artifact['kind'] in {'video','image','audio'} and callable(register):
    try:
     media=register(root/artifact['path'],project['id'])
     media_stat=(root/artifact['path']).stat()
     version_url='/api/media/'+media['id']+'?v='+str(media_stat.st_mtime_ns)+'-'+str(media_stat.st_size)
     artifact.update(mediaId=media['id'],url=version_url,modified=media_stat.st_mtime,
                     media={**{k:media[k] for k in ('id','name','kind','relativePath') if k in media},'url':version_url,'modified':media_stat.st_mtime,'size':media_stat.st_size,'projectId':project['id']})
    except (ValueError,OSError):artifact['previewUnavailable']=True
   with self.lock:
    row['creativeWork']=working['creativeWork'];ensure_work(row)
    value={'artifact':copy.deepcopy(artifact),'creativeWork':public_work(row)}
   self.persist(ident)
   return value
  if name in {'update_work_plan','record_check'}:
   with self.lock:
    row=self.runs[ident]
    if name=='update_work_plan':value=update_plan(row,args,clean=redact)
    else:value=record_check(row,args,clean=redact)
   self.persist(ident)
   return value
  if name in {'project_memory','project_memory_image'}:
   args={**args,'_useSeriesStyle':(self.runs.get(ident,{}).get('context') or {}).get('useSeriesStyle')}
  workspace=self.runs.get(ident,{}).get('versionWorkspace')
  if workspace and name in {'write_file','replace_text','run_process'}:root=Path(workspace)
  elif workspace and name in {'read_file','inspect_frame'} and args.get('path'):
   staged=safe_path(Path(workspace),args['path'])
   if staged.is_file():root=Path(workspace)
  if name in {'project_state','project_job','project_action','project_memory'}:
   callback=getattr(self,'project_callback',None)
   if not callback:raise ValueError('工程模块未连接')
   if name=='project_action' and workspace:
    raise ValueError('区间任务请先在独立版本目录制作并验证；模块写回由用户选定新版后执行')
   return callback(project['id'],name,args)
  if name=='search_resources':
   query=str(args.get('query','')).casefold();kind=args.get('kind','all');offset=max(0,int(args.get('offset',0)));limit=min(max(int(args.get('limit',25)),1),40)
   if kind not in {'all','skills','plugins','tools'} or len(query)>300:raise ValueError('资源搜索参数无效')
   snap=self.library.snapshot();items=[]
   for category in ('skills','plugins','tools') if kind=='all' else (kind,):
    for entry in snap.get(category,[]):
     if query and query not in ' '.join(str(entry.get(k,'')) for k in ('name','description','category','path')).casefold():continue
     row={k:entry.get(k) for k in ('id','name','description','status','path')};row['description']=str(row['description'] or '')[:240];row['kind']=category;items.append(row)
   return {'items':items[offset:offset+limit],'total':len(items),'nextOffset':offset+limit if offset+limit<len(items) else None}
  if name=='list_files':return self.list_files(root,args.get('path',''),int(args.get('limit',180)))
  if name=='read_file':
   p=safe_path(root,args['path']);limit=min(max(int(args.get('limit',20000)),1),48000);offset=max(0,int(args.get('offset',0)))
   if p.stat().st_size>8_000_000:raise ValueError('文件过大，请使用分析脚本或定位较小文件')
   text=p.read_text(encoding='utf-8-sig');return {'path':args['path'],'content':redact(text[offset:offset+limit]),'totalChars':len(text),'nextOffset':offset+limit if offset+limit<len(text) else None}
  if name=='search_files':
   query=str(args['query']);results=[]
   if not query or len(query)>300:raise ValueError('搜索词长度无效')
   listing=self.list_files(root,args.get('path',''),600)
   for entry in listing['files']:
    p=root/entry['path']
    if p.suffix.lower() not in TEXT_EXT or entry['bytes']>500000:continue
    for i,line in enumerate(p.read_text(encoding='utf8',errors='replace').splitlines(),1):
     if query.casefold() in line.casefold():results.append({'path':entry['path'],'line':i,'text':redact(line[:700])})
     if len(results)>=60:return {'matches':results,'truncated':True}
   return {'matches':results,'truncated':listing['truncated']}
  if name=='read_skill':return self.library.skill(args['id'])
  if name=='read_reference':
   skill=self.library.skill(args['skillId']);p=safe_path(Path(skill['path']).parent,args['path'])
   if p.stat().st_size>200000:raise ValueError('参考文件过大')
   return {'content':redact(p.read_text(encoding='utf8'))[:35000]}
  if name=='read_tool_doc':
   paths={'tts-workflow':TTS_ROOT/'RAINBOW_AUDIO_WORKFLOW.md','tts-narration':TTS_ROOT/'BROADCAST_NARRATION.md','claude':Path.home()/'.codex/tools/claude/README.md'}
   if args['tool'] not in paths:raise ValueError('未知文档')
   p=paths[args['tool']];return {'path':str(p),'content':redact(p.read_text(encoding='utf8'))[:35000]}
  if name=='list_media':return {'items':self.library.media(project['id'])}
  if name in {'inspect_frame','project_memory_image'}:
   if name=='project_memory_image':
    callback=getattr(self,'project_callback',None)
    if not callback:raise ValueError('工程记忆未连接')
    p=Path(callback(project['id'],name,args));at=0
   else:p=safe_path(root,args['path']);at=float(args.get('timeSec',0))
   if p.suffix.lower() not in {'.mp4','.webm','.mov','.m4v','.png','.jpg','.jpeg','.webp'} or not p.is_file():raise ValueError('请选择工程中的视频或图片')
   count=self.runs[ident].get('inspectedFrames',0)
   row=self.runs[ident];phase_id=row.get('phase') or 'execute';counts=self.frame_counts(row)
   if not 0<=at<86400:raise ValueError('秒数无效')
   ffmpeg=shutil.which('ffmpeg')
   if not ffmpeg:raise ValueError('未找到ffmpeg')
   out=self.state_root/'runs'/ident/f'inspected-{count+1}.jpg'
   source_stat=p.stat()
   cmd=[ffmpeg,'-v','error','-y']+(['-ss',str(at)] if p.suffix.lower() in {'.mp4','.webm','.mov','.m4v'} else [])+['-i',str(p),'-frames:v','1','-vf','scale=960:960:force_original_aspect_ratio=decrease','-q:v','3',str(out)]
   done=subprocess.run(cmd,capture_output=True,timeout=30,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
   if done.returncode or not out.is_file():raise ValueError('无法提取该时间点的画面：'+redact(done.stderr.decode('utf8',errors='replace')[-700:]))
   after_stat=p.stat()
   if (source_stat.st_size,source_stat.st_mtime_ns)!=(after_stat.st_size,after_stat.st_mtime_ns):raise ValueError('源文件在抽帧时发生变化，请生成完成后重新检查')
   with self.lock:
    row['inspectedFrames']=count+1;counts[phase_id]=counts.get(phase_id,0)+1;row.setdefault('_pendingImages',[]).append(str(out))
   result={'path':args.get('path'),'recordId':args.get('recordId'),'timeSec':at,'imageAttached':True,'reviewLimit':'历史截图只代表当时版本' if name=='project_memory_image' else '仅为指定帧，不代表完整播放'}
   if name=='inspect_frame':
    result.update(projectPath=p.relative_to(Path(project['path']).resolve()).as_posix(),sourceFingerprint={'bytes':source_stat.st_size,'mtimeNs':source_stat.st_mtime_ns})
   return result
  if name=='write_file':return self.write(ident,root,args['path'],args['content'])
  if name=='replace_text':
   p=safe_path(root,args['path'],write=True);old=p.read_text(encoding='utf8');needle=args['old']
   if not needle or old.count(needle)!=1:raise ValueError('旧文本必须在文件中恰好出现一次')
   return self.write(ident,root,args['path'],old.replace(needle,args['new'],1))
  if name=='run_process':return self.process(ident,root,args,cancel)
  raise ValueError('未知工具')
 def process(self,ident,root,args,cancel):
  name=args['program'];argv=args.get('args',[])
  if not isinstance(argv,list) or not all(isinstance(a,str) and '\x00' not in a and len(a)<12000 for a in argv) or len(argv)>100:raise ValueError('命令参数无效')
  if name not in {'python','node','npm','blender','ffmpeg','ffprobe'}:raise ValueError('未注册的工具')
  if any(redact(a)!=a for a in argv):raise ValueError('不允许在命令参数中传入凭据')
  workdir=safe_path(root,args.get('cwd') or '.')
  if not workdir.is_dir():raise ValueError('工作目录不存在')
  executable=python_executable() if name=='python' else BLENDER_PATH if name=='blender' else shutil.which(name)
  if not executable or not Path(executable).exists():raise ValueError(f'未找到{name}工具')
  if name=='npm':
   # npm.cmd is a batch wrapper; invoke its JS entry directly to avoid shell quoting.
   node=shutil.which('node');cli=Path(executable).parent/'node_modules/npm/bin/npm-cli.js'
   if not cli.exists():raise ValueError('未找到npm-cli.js')
   command=[node,str(cli),*argv]
  else:command=[executable,*argv]
  env=os.environ.copy()
  for key in list(env):
   if any(s in key.upper() for s in ('API_KEY','AUTH_TOKEN','ACCESS_TOKEN','BEARER','SECRET')):env.pop(key,None)
  log=self.state_root/'runs'/ident/f'process-{uuid.uuid4().hex[:8]}.log'
  start=time.monotonic();flags=getattr(subprocess,'CREATE_NO_WINDOW',0)
  with log.open('wb') as stream:
   process=subprocess.Popen(command,cwd=workdir,env=env,stdout=stream,stderr=subprocess.STDOUT,creationflags=flags,shell=False)
   while process.poll() is None:
    if cancel.is_set():
     if os.name=='nt':subprocess.run(['taskkill','/PID',str(process.pid),'/T','/F'],capture_output=True,creationflags=flags)
     else:process.terminate()
     process.wait(timeout=10)
     raise InterruptedError('已停止本次工具进程')
    time.sleep(.15)
  raw=log.read_bytes();text=redact(raw[-24000:].decode('utf8',errors='replace'));log.write_text(redact(raw.decode('utf8',errors='replace')),encoding='utf8')
  return {'exitCode':process.returncode,'elapsedSeconds':round(time.monotonic()-start,2),'output':text,'log':str(log.relative_to(self.state_root)),'truncated':len(raw)>24000}
