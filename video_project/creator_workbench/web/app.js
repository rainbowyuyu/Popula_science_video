'use strict';

const $ = (id) => document.getElementById(id);
const state = {data:null, projectId:null, draftProjectId:null, tab:'projects', search:'', media:[], mediaFilter:'video', mediaId:null, preview:null, mediaRestoreAbort:null, skillIds:new Set(), skillDetail:null, runs:new Map(), pollTimers:new Map(),polling:new Set(),pollFailures:new Map(),runEpochs:new Map(),submitting:new Set(),editingContexts:new Map(),pendingSubmissions:new Map(),mediaRequest:0,mediaController:null,projectRequest:0,latestCache:new Map(),mediaScope:'latest',historyOffset:0,historyMore:false,resourcesPromise:null,module:'creative',pendingContext:null,seriesOpen:new Map(),selectedMedia:null,probeController:null,probeCache:new Map(),checkResults:new Map()};
Object.defineProperties(state,{
  activeRun:{get:()=>activeForProject(state.projectId)?.id||null},
  busy:{get:()=>state.submitting.has(state.projectId)}
});
const terminalStatuses = new Set(['completed','complete','succeeded','success','failed','error','cancelled','canceled','interrupted','paused']);
const kindNames = {video:'视频', image:'封面', audio:'音频'};
const statusNames = {queued:'等待执行',pending:'等待执行',starting:'正在启动',running:'正在创作',awaiting_selection:'请选择制作方案',cancelling:'正在停止',completed:'已完成',complete:'已完成',succeeded:'已完成',success:'已完成',failed:'执行失败',error:'执行失败',cancelled:'已停止',canceled:'已停止',interrupted:'已中断',paused:'进度已保存'};

function el(tag, className, text) { const node=document.createElement(tag); if(className)node.className=className; if(text!==undefined)node.textContent=String(text); return node; }
function array(value) { if(Array.isArray(value))return value; if(value&&typeof value==='object')return Object.entries(value).map(([id,item])=>typeof item==='object'?{id,...item}:{id,name:id,value:item}); return []; }
function valueName(item) { return typeof item==='string'?item:(item.displayName||item.title||item.name||item.label||item.id||'未命名'); }
function valueId(item) { return String(typeof item==='string'?item:(item.id||item.path||item.name||'')); }
function project() { return array(state.data?.projects).find(p=>valueId(p)===state.projectId); }
function providerId() { return $('provider-select').value; }
function roleAssignments() { return Object.fromEntries(['plan','model','motion','integrate'].map(role=>[role,$(`role-${role}`).value])); }
function provider() { if(providerId()==='dual'){const ps=array(state.data?.providers);return {id:'dual',configured:['openai','claude'].every(id=>isConfigured(ps.find(p=>p.id===id))),model:'ChatGPT × Claude'};}return array(state.data?.providers).find(p=>p.id===providerId()||p.key===providerId()||(providerId()==='openai'&&(p.id==='chatgpt'||p.id==='codex'))); }
function isConfigured(p) { return Boolean(p&&(p.configured===true||p.available===true||p.status==='configured'||p.status==='connected')); }
function projectFlowReady(){const [major=0,minor=0]=String(state.data?.version||'0').split('.').map(Number);return major>2||major===2&&minor>=5;}
function mediaKind(item) { const kind=String(item.kind||item.type||item.mediaType||'').toLowerCase(); if(kind.startsWith('video'))return 'video';if(kind.startsWith('image')||kind==='cover')return 'image';if(kind.startsWith('audio'))return 'audio';const name=String(item.name||item.path||item.relativePath||item.url||'').toLowerCase();return /\.(mp4|webm|mov|mkv|m4v)$/.test(name)?'video':/\.(png|jpe?g|webp|gif|avif|svg)$/.test(name)?'image':/\.(wav|mp3|m4a|aac|ogg|flac)$/.test(name)?'audio':null; }
function mediaRank(item) { const kind=mediaKind(item);const path=String(item.relativePath||item.path||item.name||'');let rank=kind==='video'?0:kind==='image'?100:200;if(/output|delivery/i.test(path))rank-=20;if(/封面.*(?:16x9|4x3|3x4|9x16)|cover.*(?:16x9|4x3|3x4|9x16)/i.test(item.name||''))rank-=15;if(/thumb|缩略|检查|preview|预览|contact|poster-check|qa/i.test(path))rank+=80;if(/\bwork\b|\bpublic\b|\bassets\b/i.test(path))rank+=40;return rank; }
function safeMediaUrl(item) { const url=item.url||`/api/media/${encodeURIComponent(valueId(item))}`; try{const parsed=new URL(url,location.origin);if(parsed.origin===location.origin&&parsed.pathname.startsWith('/api/media/'))return parsed.href;}catch{}return `/api/media/${encodeURIComponent(valueId(item))}`; }
function formatBytes(n) { if(!Number.isFinite(Number(n))||!Number(n))return '';const size=Number(n);return size<1024*1024?`${Math.round(size/1024)} KB`:size<1024**3?`${(size/1024**2).toFixed(1)} MB`:`${(size/1024**3).toFixed(2)} GB`; }
function formatTime(seconds) { if(!Number.isFinite(Number(seconds)))return '';const s=Math.max(0,Math.floor(Number(seconds)));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function eventTime(value) { if(!value)return '';const d=new Date(value);return Number.isNaN(d.getTime())?'':d.toLocaleTimeString('zh-CN',{hour12:false,hour:'2-digit',minute:'2-digit',second:'2-digit'}); }
function remember(key,value) { try{localStorage.setItem(`rainbow-workbench:${key}`,value);}catch{} }
function recalled(key) { try{return localStorage.getItem(`rainbow-workbench:${key}`);}catch{return null;} }
function draftKey(id){return `rainbow-workbench:draft:${id}`;}
function readDraft(id){try{return JSON.parse(localStorage.getItem(draftKey(id))||sessionStorage.getItem(draftKey(id))||'null');}catch{return null;}}
function storeDraft(id,draft){try{localStorage.setItem(draftKey(id),JSON.stringify(draft));sessionStorage.setItem(draftKey(id),JSON.stringify(draft));}catch{}}
function saveDraft() {
  if(!state.projectId||state.draftProjectId!==state.projectId)return;
  const draft={...readDraft(state.projectId),prompt:$('prompt').value,provider:providerId(),mode:$('mode-select').value,candidates:$('candidate-toggle').checked,skillIds:[...state.skillIds],roles:roleAssignments(),context:state.pendingContext};
  storeDraft(state.projectId,draft);
}
function restoreDraft(projectId) {
  const draft=readDraft(projectId);
  state.draftProjectId=projectId;$('prompt').value=typeof draft?.prompt==='string'?draft.prompt:'';
  if(['openai','claude','dual'].includes(draft?.provider))$('provider-select').value=draft.provider;
  if(['creative','review'].includes(draft?.mode))$('mode-select').value=draft.mode;
  $('candidate-toggle').checked=draft?.candidates!==false;
  for(const role of ['plan','model','motion','integrate'])$(`role-${role}`).value=['openai','claude'].includes(draft?.roles?.[role])?draft.roles[role]:(role==='motion'?'claude':'openai');
  const available=new Set(array(state.data?.skills).map(valueId));state.skillIds=new Set(Array.isArray(draft?.skillIds)?draft.skillIds.filter(id=>!state.data?.resourcesLoaded||available.has(id)):[]);
  state.pendingContext=draft?.context&&typeof draft.context==='object'?draft.context:null;$('restore-previous-draft').hidden=!draft?.previousPrompt;renderPromptContext();renderSelectedSkills();
}
function errorText(error) { return error?.message||String(error)||'操作未完成，请重试'; }
function toast(message) { $('toast').textContent=message;$('toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('toast').hidden=true,4500); }
function showError(message) { $('global-error').textContent=message;$('global-error').hidden=!message; }

function bumpRun(id){state.runEpochs.set(id,(state.runEpochs.get(id)||0)+1);}
function activeForProject(pid){return [...state.runs.values()].find(r=>r.projectId===pid&&!isTerminal(r));}
function projectLabel(pid){return valueName(array(state.data?.projects).find(p=>valueId(p)===pid)||{name:'工程'});}
function persistPending(){remember('pendingSubmissions',JSON.stringify([...state.pendingSubmissions]));}
function mediaFingerprint(media){return media?`${media.id}|${safeMediaUrl(media)}|${media.modified||media.version||''}`:null;}
function getEditingContext(){
  const pid=state.projectId,media=state.selectedMedia;
  const selected=state.editingContexts.get(pid);
  if(selected)return structuredClone(selected);
  if(!media)return {projectId:pid};
  return {projectId:pid,mediaId:media.id,sourcePath:media.relativePath||media.path,sourceVersion:media.modified||media.version||null,mediaFingerprint:mediaFingerprint(media),timeSec:mediaKind(media)==='video'?$('video-preview').currentTime:0};
}
function setEditingContext(context){
  if(!context||context.projectId&&context.projectId!==state.projectId)return false;
  state.editingContexts.set(state.projectId,{...context,projectId:state.projectId,mediaFingerprint:mediaFingerprint(state.selectedMedia)});
  renderEditingContext();window.dispatchEvent(new CustomEvent('workbench:editing-context',{detail:getEditingContext()}));return true;
}
function renderEditingContext(){
  const box=$('editing-context-bar');if(!box)return;
  const context=state.editingContexts.get(state.projectId);box.hidden=!context;
  if(context){const range=context.timeRange;box.querySelector('span').textContent=`联动选段 · ${range?formatTime(range.startSec)+'—'+formatTime(range.endSec):formatTime(context.timeSec||0)} · ${String(context.sourcePath||'当前成片').split(/[\\/]/).at(-1)}`;}
}
function queuePrompt(prompt,context={}){
  if(context.projectId&&context.projectId!==state.projectId){toast('该修改属于另一个工程，请切换回对应作品后再整理。');return false;}
  const current=readDraft(state.projectId)||{};
  if($('prompt').value.trim()&&$('prompt').value.trim()!==prompt){
    storeDraft(state.projectId,{...current,previousPrompt:$('prompt').value,previousContext:state.pendingContext});
    $('restore-previous-draft').hidden=false;
  }
  state.pendingContext={...getEditingContext(),...context,projectId:state.projectId};if(context.mediaId&&!context.mediaFingerprint){const source=state.media.find(m=>m.id===context.mediaId);if(source)state.pendingContext.mediaFingerprint=mediaFingerprint(source);}renderPromptContext();
  $('prompt').value=prompt;saveDraft();updateComposer();window.dispatchEvent(new Event('studio:agent-open'));$('prompt').focus();return true;
}
function renderTaskCenter(){
  const list=$('task-center-list');if(!list)return;
  const runs=[...state.runs.values()].filter(r=>!isTerminal(r)||r.canResume);
  const active=runs.filter(r=>!isTerminal(r)).length;
  $('task-center-count').textContent=active?`${active} 个进行中`:runs.length?'有待继续':'任务';
  const signature=JSON.stringify([runs.map(r=>[r.id,r.status,r.canResume]),[...state.pendingSubmissions.keys()],[...state.submitting]]);
  if(list.dataset.signature===signature)return;list.dataset.signature=signature;list.replaceChildren();
  for(const run of runs){
    const row=el('div','task-center-row');row.dataset.runId=run.id;
    const open=el('button','task-open');open.append(el('strong','',projectLabel(run.projectId)),el('span','',runStatusLabel(run)));open.onclick=()=>{selectProject(run.projectId);$('task-center').open=false;};
    const action=el('button','text-button',isTerminal(run)?'继续':'停止');
    action.disabled=state.submitting.has(run.projectId)||Boolean(isTerminal(run)&&activeForProject(run.projectId));
    action.onclick=async()=>{action.disabled=true;try{if(isTerminal(run))await resumeRun(run.id);else await cancelRun(run.id);}finally{list.dataset.signature='';renderTaskCenter();}};
    row.append(open,action);list.append(row);
  }
  for(const [pid,payload] of state.pendingSubmissions){
    const row=el('div','task-center-row');const label=el('span','',`${projectLabel(pid)} · 发送状态待核对`),retry=el('button','text-button','核对并重试');
    retry.onclick=async()=>{retry.disabled=true;try{await startTask(payload);toast('任务已确认，已连接执行进度。');}catch(e){toast(errorText(e));}finally{retry.disabled=false;}};
    row.append(label,retry);list.append(row);
  }
  if(!list.childElementCount)list.append(el('p','', '暂时没有待处理任务。不同工程可以同时创作。'));
}
function syncRunUI(){
  const active=activeForProject(state.projectId),latest=[...state.runs.values()].filter(runForProject).sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')))[0];
  $('project-status').textContent=active?runStatusLabel(active):latest?runStatusLabel(latest):'就绪';
  $('project-status').classList.toggle('running',Boolean(active));
  if(active){const event=array(active.events).at(-1);$('run-activity-text').textContent=state.pollFailures.get(active.id)?'连接暂时中断，正在核对后台任务；工程草稿已保留。':window.AgentWorkspace?.progressText(active)||(event?String(summarizeEvent(event)).slice(0,150):runStatusLabel(active));}
  updateComposer();renderTaskCenter();
}

async function api(path, options={}) {
  if(state.data?.version&&!projectFlowReady()&&options.method==='POST'){
    const reads=new Set(['review.read','copy.read','project.state','template.read','cover.load','series.overview','job.get','workflow.get','subtitles.read','qwen.status']);
    if(path==='/api/runs'||/\/api\/runs\/[^/]+\/(resume|select)$/.test(path)||path==='/api/studio/action'&&!reads.has(options.body?.action)){
      const error=new Error('新版正在等待后台任务结束。草稿保留，任务完成后刷新网页再保存或创作。');error.status=409;throw error;
    }
  }
  const headers={Accept:'application/json',...options.headers};
  if(options.body!==undefined){headers['Content-Type']='application/json';options.body=JSON.stringify(options.body);}
  if(options.method&&options.method!=='GET')headers['X-CSRF-Token']=state.data?.csrfToken||'';
  // This bounds a lost local transport, never the model or rendering runtime.
  if(!options.method||options.method==='GET'||path==='/api/runs'){
    const timeout=AbortSignal.timeout(20000);options.signal=options.signal?AbortSignal.any([options.signal,timeout]):timeout;
  }
  const response=await fetch(path,{...options,headers,credentials:'same-origin'});
  const payload=await response.json().catch(()=>({error:`本地服务返回了无法读取的响应（${response.status}）`}));
  if(!response.ok){const error=new Error(typeof payload.error==='string'?payload.error:payload.error?.message||payload.message||`请求失败（${response.status}）`);error.status=response.status;error.code=payload.code;throw error;}
  return payload;
}

function thumbnailUrl(item){const raw=item.thumbnailUrl||array(item.latestCovers)[0]?.url;if(!raw)return null;try{const url=new URL(raw,location.origin);return url.origin===location.origin?url.href:null;}catch{return null;}}
function renderLibrary() {
  const list=$('library-list');list.replaceChildren();const query=state.search.trim().toLowerCase(),projects=array(state.data?.projects),skills=array(state.data?.skills);$('project-count').textContent=projects.length;$('skill-count').textContent=state.data?.resourcesLoaded?skills.length:'按需';
  const compactSelect=$('mobile-project-select');compactSelect.replaceChildren();for(const item of projects){const option=el('option','',valueName(item));option.value=valueId(item);option.selected=option.value===state.projectId;compactSelect.append(option);}compactSelect.disabled=false;
  document.querySelectorAll('[data-library]').forEach(b=>{const active=b.dataset.library===state.tab;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));});
  let visible=0;
  if(state.tab==='projects'){
    const groups=new Map();for(const item of projects){const id=item.seriesId||'independent';if(!groups.has(id))groups.set(id,{name:item.seriesName||'独立作品',items:[]});groups.get(id).items.push(item);}
    const ordered=[...groups].sort((a,b)=>Number(b[1].items.some(p=>valueId(p)===state.projectId))-Number(a[1].items.some(p=>valueId(p)===state.projectId)));for(const [id,group] of ordered){const items=group.items.filter(item=>`${valueName(item)} ${group.name}`.toLowerCase().includes(query));if(!items.length)continue;const section=el('details','project-series');section.dataset.seriesId=id;section.open=Boolean(query)||items.some(p=>valueId(p)===state.projectId)||Boolean(state.seriesOpen.get(id))||groups.size===1;section.addEventListener('toggle',()=>state.seriesOpen.set(id,section.open));const summary=el('summary');summary.append(el('span','',group.name),el('small','',items.length));section.append(summary);const grid=el('div','project-card-grid');for(const item of items){visible++;const row=el('button','project-card');row.type='button';row.dataset.projectId=valueId(item);row.classList.toggle('active',valueId(item)===state.projectId);const thumb=el('div','project-card-thumb'),src=thumbnailUrl(item);if(src){const image=el('img');image.src=src;image.alt='';image.loading='lazy';thumb.append(image);}else thumb.append(el('span','','✦'));row.append(thumb);const copy=el('div','project-card-copy');copy.append(el('strong','',valueName(item)));if(item.episode)copy.append(el('span','',`第 ${item.episode} 期`));const task=activeForProject(valueId(item));if(task)copy.append(el('span','project-task-state',runStatusLabel(task)));row.append(copy);row.addEventListener('click',()=>selectProject(valueId(item)));grid.append(row);}section.append(grid);list.append(section);}
  }else{
    const groups=state.tab==='skills'?[['',skills]]:[['本地工具',array(state.data?.tools)],['插件',array(state.data?.plugins)]];
    for(const [heading,items] of groups){const matched=items.filter(item=>`${valueName(item)} ${item.description||''} ${item.category||''}`.toLowerCase().includes(query));if(matched.length&&heading)list.append(el('div','list-section-label',heading));for(const item of matched){visible++;const row=el('button','resource-card');row.classList.toggle('active',state.skillIds.has(valueId(item)));row.append(el('span','resource-icon',state.tab==='skills'?'✦':'⌘'));const copy=el('span','resource-text');copy.append(el('span','resource-name',valueName(item)),el('span','resource-note',item.description||item.version||'本地创作能力'));row.append(copy);row.addEventListener('click',()=>state.tab==='skills'?openSkill(item):openTool(item,heading));list.append(row);}}
  }
  if(!visible)list.append(el('div','empty-state',query?'没有匹配作品或资源。':state.tab==='projects'?'点击 ＋ 开始一个新故事。':state.data?.resourcesLoaded?'暂无可用资源。':'正在按需读取资源…'));
  $('resource-summary').textContent=`${projects.length} 个作品${state.data?.resourcesLoaded?` · ${skills.length} 项技能`:''}`;$('version-label').textContent=state.data?.version?`v${String(state.data.version).replace(/^v/,'')}`:'';
}
async function loadResources(){if(state.data?.resourcesLoaded)return;if(!state.resourcesPromise)state.resourcesPromise=api('/api/resources').then(data=>{Object.assign(state.data,data,{resourcesLoaded:true});renderSelectedSkills();}).finally(()=>state.resourcesPromise=null);await state.resourcesPromise;}
async function setLibrary(tab){state.tab=tab;state.search='';$('library-search').value='';renderLibrary();if(tab!=='projects'){try{await loadResources();renderLibrary();}catch(error){toast(errorText(error));}}if(innerWidth<801)$('library-list').closest('.library').scrollIntoView({behavior:'smooth',block:'start'});}

function updateComposer() {
  const p=provider(),configured=isConfigured(p);const active=Boolean(state.activeRun);
  $('send-button').disabled=!projectFlowReady()||state.busy||active||state.pendingSubmissions.has(state.projectId)||!state.projectId||!configured||!$('prompt').value.trim();
  $('provider-select').disabled=active;$('mode-select').disabled=active;
  $('new-project-button').disabled=false;
  $('mobile-project-select').disabled=false;
  const option=$('provider-select').selectedOptions[0];
  const providerName=option?.textContent||'模型';
  const checked=state.checkResults.get(providerId());
  let help=configured?`${providerName} · 已读取 CC Switch 当前配置`:`${providerName} 尚未配置，请先在 CC Switch 中选择服务`;
  if(p?.model&&configured)help+=` · ${p.model}`;
  if(checked?.ok===true)help=`${providerName} · 连接检查通过${checked.model?` · ${checked.model}`:''}`;
  else if(checked?.ok===false)help=`${providerName} · ${checked.message||checked.error||'连接检查未通过'}`;
  $('provider-help').firstElementChild.textContent=help;
  $('check-provider').disabled=!configured||active||state.busy||providerId()==='dual';
  $('mode-help').textContent=$('mode-select').value==='creative'?'在选定工程内读取素材、生成与修改文件':'只读检查工程，给出建议，不修改工程文件';
  $('run-activity').hidden=!active;
  let policy=$('execution-policy-note');
  if(!policy){policy=el('small','','持续完成 · 可随时停止');policy.id='execution-policy-note';policy.style.cssText='display:block;margin:7px 0 0 3px;font-size:10px;line-height:1.5;color:#718a98';document.querySelector('.composer-toolbar')?.after(policy);}
  policy.title='持续接续工作并保存进度，保留所选模型与 effort；上游接口仍有实际容量与可用性限制。';
}

function renderPromptContext(){const box=$('prompt-context');box.replaceChildren();const context=state.pendingContext;box.hidden=!context;if(!context)return;if(context.frame?.url){try{const url=new URL(context.frame.url,location.origin);if(url.origin===location.origin){const image=el('img');image.src=url.href;image.alt='附加的当前视频帧';image.loading='lazy';box.append(image);}}catch{}}const label=context.frame?`当前帧 · ${formatTime(context.timeSec)}`:context.timeRange?`选段 · ${formatTime(context.timeRange.startSec)}—${formatTime(context.timeRange.endSec)}`:context.platform?`发布文案 · ${context.platform}`:`当前模块 · ${state.module}`;box.append(el('span','',label));const remove=el('button','','×');remove.setAttribute('aria-label','移除附加上下文');remove.addEventListener('click',()=>{state.pendingContext=null;renderPromptContext();saveDraft();});box.append(remove);}
function renderSelectedSkills() {
  const container=$('selected-skills');container.replaceChildren();container.hidden=state.skillIds.size===0;
  for(const id of state.skillIds){const skill=array(state.data?.skills).find(s=>valueId(s)===id);const chip=el('span','skill-chip');chip.append(el('span','',skill?valueName(skill):id));const remove=el('button','','×');remove.type='button';remove.setAttribute('aria-label',`移除技能 ${skill?valueName(skill):id}`);remove.addEventListener('click',()=>{state.skillIds.delete(id);saveDraft();renderSelectedSkills();renderLibrary();});chip.append(remove);container.append(chip);}
}

async function openSkill(skill) {
  state.skillDetail=skill;$('skill-title').textContent=valueName(skill);$('skill-description').textContent=skill.description||skill.path||'';$('skill-content').textContent='正在读取技能文档…';$('attach-skill').hidden=false;$('attach-skill').textContent=state.skillIds.has(valueId(skill))?'已添加 · 点击移除':'用于这次创作';$('skill-dialog').showModal();
  try{const data=await api(`/api/skills/${encodeURIComponent(valueId(skill))}`);if(state.skillDetail===skill)$('skill-content').textContent=typeof data==='string'?data:data.content||data.text||'这项技能没有可显示的正文。';}catch(error){if(state.skillDetail===skill)$('skill-content').textContent=`读取失败：${errorText(error)}`;}
}
function openTool(item, heading) { state.skillDetail=null;const statusText={available:'本地可执行文件已找到',configured:'本地配置已找到，需在调用时验证',unverified:'已发现资源，连接尚未验证',registered:'已纳入资源索引'};$('skill-title').textContent=valueName(item);$('skill-description').textContent=heading;$('skill-content').textContent=[item.description||'',item.path?`路径：${item.path}`:'',item.version?`版本：${item.version}`:'',item.status?`状态：${statusText[item.status]||item.status}`:'',item.statusDetail||'',item.available!==undefined?`可用状态：${item.available?'已发现':'未找到'}`:'',item.command?`入口：${item.command}`:''].filter(Boolean).join('\n\n')||'此能力已纳入工作台资源目录。';$('attach-skill').hidden=true;$('skill-dialog').showModal(); }

async function selectProject(id,{restore=false}={}) {
  if(!array(state.data?.projects).some(p=>valueId(p)===id))return;const request=++state.projectRequest;
  if(state.projectId!==id){saveDraft();state.mediaController?.abort();state.mediaRequest++;clearPreview();state.mediaId=null;state.media=[];state.mediaScope='latest';state.historyOffset=0;state.pendingContext=null;renderPromptContext();renderMedia();}
  state.projectId=id;remember('project',id);const item=project();$('project-name').textContent=valueName(item);$('project-context').textContent=[item.seriesName,item.episode?`第 ${item.episode} 期`:'', '当前工程'].filter(Boolean).join(' · ');$('project-location').textContent=item.relativePath||item.path||'素材、脚本与输出均位于当前工程';$('use-series-style').checked=item.useSeriesStyle!==false;
  if(state.draftProjectId!==id)restoreDraft(id);renderLibrary();renderConversation();syncRunUI();renderEditingContext();document.querySelector('.global-learn').href='/learning.html';window.dispatchEvent(new CustomEvent('workbench:project',{detail:item}));await loadMedia({restore,refresh:false});if(request!==state.projectRequest)return;
}

function capturePlayback() {
  const preview=state.preview;if(!preview||!['video','audio'].includes(preview.kind))return null;
  const media=$(preview.kind==='video'?'video-preview':'audio-preview');
  if(media.readyState<1||!Number.isFinite(media.currentTime))return null;
  return {time:media.currentTime,paused:media.paused||media.ended,rate:media.playbackRate,volume:media.volume,muted:media.muted};
}
function savePlayback() {
  const playback=capturePlayback();if(!playback||!state.preview)return;
  try{sessionStorage.setItem(`rainbow-workbench:playback:${state.preview.projectId}:${state.preview.id}`,JSON.stringify(playback));}catch{}
}
function recalledPlayback(projectId,id) {
  try{const value=JSON.parse(sessionStorage.getItem(`rainbow-workbench:playback:${projectId}:${id}`));return value&&Number.isFinite(value.time)&&value.time>=0?{...value,paused:true}:null;}catch{return null;}
}
function clearPreview() {
  savePlayback();state.probeController?.abort();state.probeController=null;state.mediaRestoreAbort?.abort();state.mediaRestoreAbort=null;state.preview=null;state.selectedMedia=null;
  for(const id of ['video-preview','audio-preview']){$(id).pause();$(id).removeAttribute('src');$(id).load();}
  $('image-preview').removeAttribute('src');$('video-preview').hidden=true;$('image-preview').hidden=true;$('audio-wrap').hidden=true;$('preview-empty').hidden=false;$('open-media').hidden=true;$('preview-stage').classList.remove('has-image');$('media-title').textContent='尚未选择素材';$('media-detail').textContent='支持视频 / 封面 / 音频';
}
async function loadMedia({restore=false,preserve=true,refresh=false,scope=state.mediaScope,append=false,updatePreview=true}={}) {
  if(!state.projectId)return;state.mediaController?.abort();const controller=new AbortController();state.mediaController=controller;const request=++state.mediaRequest,pid=state.projectId;state.mediaScope=scope;$('reload-media').disabled=true;
  try{let data;if(scope==='latest'&&!refresh&&state.latestCache.has(pid))data=state.latestCache.get(pid);else{const params=new URLSearchParams({scope,offset:String(append?state.historyOffset:0),limit:'30'});if(refresh)params.set('refresh','1');data=await api(`/api/projects/${encodeURIComponent(pid)}/media?${params}`,{cache:'no-store',signal:controller.signal});if(scope==='latest')state.latestCache.set(pid,data);}if(request!==state.mediaRequest||pid!==state.projectId)return;
    const incoming=array(data.items||data.media||data).filter(item=>mediaKind(item));state.media=append?[...state.media,...incoming.filter(m=>!state.media.some(old=>valueId(old)===valueId(m)))]:incoming;state.historyMore=Boolean(data.hasMore);state.historyOffset=data.nextOffset??state.media.length;
    if(!updatePreview){renderMedia();return;}
    const current=preserve&&state.preview?.projectId===pid?(state.media.find(m=>valueId(m)===state.preview.id)||state.selectedMedia):null,remembered=restore?state.media.find(m=>valueId(m)===recalled(`media:${pid}`)):null;
    const preferred=(current&&mediaKind(current)==='video'?current:null)||(remembered&&mediaKind(remembered)==='video'?remembered:null)||state.media.find(m=>mediaKind(m)==='video');if(preferred){const unchanged=current&&state.preview.kind===mediaKind(preferred)&&state.preview.url===safeMediaUrl(preferred)&&state.preview.fingerprint===mediaFingerprint(preferred);if(!unchanged)selectMedia(preferred,{preservePlayback:Boolean(current),restorePosition:restore&&Boolean(remembered)});else updateMediaCaption(preferred);}else{state.mediaId=null;clearPreview();}renderMedia();
  }catch(error){if(error.name!=='AbortError'&&request===state.mediaRequest){$('media-list').replaceChildren(el('div','empty-state',`读取失败：${errorText(error)}`));toast(errorText(error));}}finally{if(request===state.mediaRequest)$('reload-media').disabled=false;}
}

function updateMediaCaption(item) {
  const kind=mediaKind(item);$('media-title').textContent=valueName(item);$('media-title').title=item.relativePath||item.path||valueName(item);
  const video=$('video-preview');const loadedVideo=kind==='video'&&video.readyState>=1;
  const dimensions=loadedVideo?`${video.videoWidth} × ${video.videoHeight}`:item.width&&item.height?`${item.width} × ${item.height}`:'';
  const duration=loadedVideo?formatTime(video.duration):item.duration?formatTime(item.duration):'';
  $('media-detail').textContent=[kindNames[kind],dimensions,duration,formatBytes(item.size||item.bytes)].filter(Boolean).join(' · ');
  $('open-media').href=safeMediaUrl(item);$('open-media').hidden=false;
}
function selectMedia(item,{preservePlayback=false,restorePosition=false,reveal=false}={}) {
  const id=valueId(item),kind=mediaKind(item),url=safeMediaUrl(item);
  const sameAsset=state.preview?.projectId===state.projectId&&state.preview.id===id&&state.preview.kind===kind&&state.preview.fingerprint===mediaFingerprint(item);
  if(sameAsset&&state.preview.url===url){updateMediaCaption(item);renderMedia();if(reveal)requestPreviewView(item);return;}
  const playback=preservePlayback&&sameAsset?capturePlayback():restorePosition?recalledPlayback(state.projectId,id):null;
  const link=state.editingContexts.get(state.projectId);if(link?.mediaId&&(link.mediaId!==id||link.mediaFingerprint&&link.mediaFingerprint!==mediaFingerprint(item)))state.editingContexts.delete(state.projectId);renderEditingContext();
  const pending=state.pendingContext;if(pending?.mediaId===id&&pending.mediaFingerprint&&pending.mediaFingerprint!==mediaFingerprint(item)){
    storeDraft(state.projectId,{...readDraft(state.projectId),staleContext:pending});state.pendingContext=null;saveDraft();renderPromptContext();toast('成片已更新，旧选段关联已解除；修改文案保留，请重新确认位置。');
  }
  clearPreview();state.mediaId=id;state.selectedMedia=item;state.preview={projectId:state.projectId,id,kind,url,fingerprint:mediaFingerprint(item)};remember(`media:${state.projectId}`,id);$('preview-empty').hidden=true;
  const media=kind==='video'?$('video-preview'):kind==='audio'?$('audio-preview'):$('image-preview');
  if(playback&&kind!=='image'){
    const controller=new AbortController();state.mediaRestoreAbort=controller;
    media.addEventListener('loadedmetadata',()=>{
      if(controller.signal.aborted||state.preview?.url!==url||state.preview?.id!==id)return;
      media.playbackRate=Number.isFinite(playback.rate)&&playback.rate>0?playback.rate:1;
      media.volume=Number.isFinite(playback.volume)?Math.max(0,Math.min(1,playback.volume)):1;media.muted=Boolean(playback.muted);
      const end=Number.isFinite(media.duration)?Math.max(0,media.duration-.05):playback.time;
      media.currentTime=Math.min(playback.time,end);
      if(!playback.paused)media.play().catch(()=>{});
    },{once:true,signal:controller.signal});
  }
  media.src=url;if(kind!=='image')media.load();
  if(kind==='audio')$('audio-wrap').hidden=false;else media.hidden=false;
  $('preview-stage').classList.toggle('has-image',kind==='image');updateMediaCaption(item);renderMedia();if(kind==='video')loadMediaProbe(item,url);if(reveal)requestPreviewView(item);
}
function requestPreviewView(item){window.dispatchEvent(new CustomEvent('workbench:preview-request',{detail:{projectId:state.projectId,mediaId:valueId(item),kind:mediaKind(item)}}));}
async function loadMediaProbe(item,url){const pid=state.projectId,id=valueId(item),controller=new AbortController();state.probeController?.abort();state.probeController=controller;try{const data=state.probeCache.get(url)||await api(`/api/media/${encodeURIComponent(id)}/probe`,{signal:controller.signal});if(controller.signal.aborted||pid!==state.projectId||state.preview?.id!==id||state.preview?.url!==url)return;state.probeCache.set(url,data);Object.assign(item,data);state.selectedMedia=item;updateMediaCaption(item);window.dispatchEvent(new CustomEvent('workbench:probe',{detail:{projectId:pid,mediaId:id,...data}}));}catch(error){if(error.name!=='AbortError'&&pid===state.projectId&&state.preview?.id===id)window.dispatchEvent(new CustomEvent('workbench:probe',{detail:{projectId:pid,mediaId:id,error:error.message}}));}}
function renderMedia() {
  $('show-history').textContent=state.mediaScope==='history'?'回到最新成果':'查看历史版本';$('history-more').hidden=state.mediaScope!=='history'||!state.historyMore;$('history-status').textContent=state.mediaScope==='history'?`已加载 ${state.media.length} 项`:'';
  $('media-count').textContent=state.media.filter(m=>mediaKind(m)==='video').length;const list=$('media-list');list.replaceChildren();
  document.querySelectorAll('[data-media]').forEach(b=>b.classList.toggle('active',b.dataset.media===state.mediaFilter));
  const items=state.media.filter(m=>mediaKind(m)==='video');
  for(const item of items){const kind=mediaKind(item),row=el('button','media-row');row.type='button';row.dataset.mediaId=valueId(item);row.classList.toggle('active',valueId(item)===state.mediaId);row.title=item.relativePath||item.path||valueName(item);
    const thumb=el('span','media-thumb');if(kind==='image'){const image=el('img');image.src=safeMediaUrl(item);image.alt='';image.loading='lazy';thumb.append(image);}else thumb.textContent=kind==='video'?'▷':'♫';row.append(thumb);
    const info=el('span','media-info');info.append(el('span','media-name',valueName(item)));info.append(el('span','media-meta',[kindNames[kind],formatBytes(item.size||item.bytes),item.duration?formatTime(item.duration):''].filter(Boolean).join(' · ')));row.append(info);if(valueId(item)===state.mediaId)row.append(el('span','resource-check','●'));row.addEventListener('click',()=>selectMedia(item,{reveal:true}));list.append(row);
  }
  if(!items.length)list.append(el('div','empty-state',state.media.length?'没有这一类型的素材。':'工程还没有视频、封面或音频。生成后点击刷新即可预览。'));
  renderWelcome();window.dispatchEvent(new CustomEvent('workbench:media',{detail:{items:state.media,selected:state.mediaId}}));
}

function renderWelcome(){const welcome=$('welcome'),item=state.selectedMedia;if(!state.projectId)return;const key=`${state.projectId}:${item?.id||''}`;if(welcome.dataset.context===key)return;welcome.dataset.context=key;welcome.replaceChildren();welcome.classList.add('project-welcome');welcome.append(el('span','welcome-mark','✦'),el('h2','',item?.kind==='video'?'从这一段，继续做好。':'把想法变成下一期作品。'),el('p','',item?.kind==='video'?'在右侧播放成片，圈选一段或标记一帧。主智能体会带着位置、画面和你的要求继续制作。':'选择系列风格，描述这一期要讲清的问题。已有素材会随工程一起参与创作。'));if(item?.kind==='video'){const summary=el('div','editing-context');summary.append(el('span','','正在查看'),el('strong','',project()?.title||valueName(project())),el('small','',item.name||''));welcome.append(summary);const buttons=el('div','prompt-suggestions project-actions');for(const[label,action]of[['标记当前帧','frame'],['检查选中区间','check'],['整理修改清单','review']]){const button=el('button','',label);button.append(el('span','','↗'));button.addEventListener('click',()=>{if(action==='frame'){$('frame-capture')?.click();return;}if(action==='review'){window.VideoReview?.send();return;}const start=+$('segment-start').value||0,end=+$('segment-end').value||15;state.pendingContext={taskType:'segment',module:'creative',mediaId:item.id,sourcePath:item.relativePath,startSec:start,endSec:end,timeRange:{startSec:start,endSec:end,sourcePath:item.relativePath},markers:window.StudioTimeline?.getMarkers()||[]};renderPromptContext();$('mode-select').value=action==='check'?'review':'creative';$('prompt').value=`${action==='check'?'检查':'优化'} ${formatTime(start)}—${formatTime(end)} 这一段的音画对应、字幕避让和运镜连贯性。${action==='edit'?'请结合当前工程进行修改。':'请先列出具体问题和时间点。'}`;saveDraft();updateComposer();$('prompt').focus();});buttons.append(button);}welcome.append(buttons);}else{const button=el('button','primary-button','描述这一期想法 ↗');button.addEventListener('click',()=>$('prompt').focus());welcome.append(button);}}
function isTerminal(run) { return terminalStatuses.has(String(run?.status||'').toLowerCase()); }
function providerPause(run){return ({provider_timeout:'上游响应超时',provider_unavailable:'上游服务暂不可用',rate_limit:'上游请求限流',network:'连接暂时中断',provider_stream:'上游回复未接收完整',output_limit:'单次输出已达上限'})[run.pauseReason]||'';}
function runStatusLabel(run){const work=window.AgentWorkspace?.normalize(run);if(work?.hasUnfinished)return work.statusLabel;const issue=providerPause(run);return run.status==='paused'&&issue?`${issue} · 进度已保存`:statusNames[run.status]||run.status||'准备中';}
function resumeHint(run){
  if(['budget','time','output_limit'].includes(run.pauseReason))return '继续后进入持续完成，按需接续与分段生成，可随时停止。保留原模型和 effort；单次输出与 1M 上下文容量分别计算。';
  const issue=providerPause(run);
  if(issue){const failure=run.providerFailure||{},who=failure.provider==='claude'?'Claude':failure.provider==='openai'?'GPT':'',status=failure.httpStatus||failure.code,code=status?`HTTP ${status}`:'';const details=[who,code].filter(Boolean).join(' · ');return `${issue}${details?`（${details}）`:''}。${run.pauseReason==='rate_limit'?'稍后可继续':'可从已保存进度继续'}，保留原模型和 effort 设置。`;}
  return '从已保存进度继续，进入持续完成，可随时停止；沿用此任务的模型与设置。';
}
function runForProject(run) { return run.projectId===state.projectId; }
function summarizeEvent(event) { return event.message||event.text||event.content||({output_limit:'本轮回复达到单次输出上限，正在保存已收到的内容。',continuation:'正在衔接未完成内容，保留当前模型与推理强度。'})[event.type]||event.toolName||event.name||event.type||''; }
function artifactMedia(artifact,run){
  if(run.projectId!==state.projectId||artifact.projectId&&artifact.projectId!==run.projectId)return null;
  const path=String(artifact.path||'').replaceAll('\\','/');
  const registered=artifact.media;
  if(registered&&registered.id===artifact.mediaId&&['video','image','audio'].includes(registered.kind)&&artifact.exists===true){
    try{const url=new URL(registered.url,location.origin);if(url.origin===location.origin&&url.pathname===`/api/media/${encodeURIComponent(registered.id)}`)return {...registered,name:artifact.title||registered.name||path.split('/').at(-1),relativePath:path};}catch{}
  }
  const known=state.media.find(m=>m.id===artifact.mediaId||(m.relativePath||m.path||'').replaceAll('\\','/')===path);
  if(known)return known;
  // The backend registers verified local files; model prose never supplies a preview URL.
  if(!artifact.mediaId||!['video','image','audio'].includes(artifact.kind)||artifact.exists!==true)return null;
  const expected=`/api/media/${encodeURIComponent(artifact.mediaId)}`;
  if(artifact.url!==expected)return null;
  return {id:artifact.mediaId,name:artifact.title||path.split('/').at(-1),relativePath:path,kind:artifact.kind,url:artifact.url,size:artifact.bytes,version:artifact.sha256};
}
async function selectCandidate(run,candidate){
  if(state.submitting.has(run.projectId))return;
  state.submitting.add(run.projectId);bumpRun(run.id);renderConversation();syncRunUI();
  try{const result=await api(`/api/runs/${encodeURIComponent(run.id)}/select`,{method:'POST',body:{candidateId:candidate.id||candidate.candidateId}});bumpRun(run.id);state.runs.set(run.id,{...run,...result,status:result.status||'queued'});await trackRun(run.id);}
  catch(error){toast(errorText(error));}
  finally{state.submitting.delete(run.projectId);renderConversation();syncRunUI();}
}
function renderConversation() {
  const container=$('conversation'),welcome=$('welcome');renderWelcome();
  if(!window.AgentWorkspace)return;
  window.AgentWorkspace.render({container,welcome,projectId:state.projectId,runs:[...state.runs.values()],callbacks:{
    statusLabel:runStatusLabel,resumeHint,resume:resumeRun,stop:cancelRun,selectCandidate,
    busy:run=>state.submitting.has(run.projectId),hasActive:pid=>Boolean(activeForProject(pid)),
    load:trackRun,error:error=>toast(errorText(error)),
    canPreview:(artifact,run)=>Boolean(artifactMedia(artifact,run)),
    preview:(artifact,run)=>{const media=artifactMedia(artifact,run);if(!media)throw new Error('此成果不在当前工程，或尚未登记预览。');selectMedia(media,{reveal:true});},
    copyPath:async artifact=>{await navigator.clipboard.writeText(artifact.path);toast('成果路径已复制');},
    mediaRevision:()=>state.media.map(m=>m.id).join('|')
  }});
}

async function submitPrompt(event) {
  event.preventDefault();updateComposer();if($('send-button').disabled)return;
  const pid=state.projectId,prompt=$('prompt').value.trim(),contextSnapshot=JSON.stringify(state.pendingContext);showError('');
  try{const accepted=await startTask({projectId:pid,provider:providerId(),mode:$('mode-select').value,prompt,candidates:$('candidate-toggle').checked,skillIds:[...state.skillIds]});
    if(state.projectId===pid&&accepted.draftUnchanged&&$('prompt').value.trim()===prompt){$('prompt').value='';saveDraft();}
    else {const draft=readDraft(pid);if(draft?.prompt?.trim()===prompt&&JSON.stringify(draft.context)===contextSnapshot)storeDraft(pid,{...draft,prompt:'',context:null});}
  }catch(error){showError(errorText(error));toast(errorText(error));}
}
async function startTask(body) {
  const pid=body.projectId||state.projectId;
  if(!pid)throw new Error('请先选择工程。');
  if(state.pendingSubmissions.has(pid)&&state.pendingSubmissions.get(pid).clientRequestId!==body.clientRequestId)throw new Error('此工程有发送状态未确认的任务，请先到任务中心核对并重试。');
  if(state.submitting.has(pid))throw new Error('此工程正在提交，请稍候。');
  if(activeForProject(pid)&&!body.clientRequestId)throw new Error('此工程正在创作，可以先整理修改清单，或切换其他工程继续编辑。');
  if(body.context?.projectId&&body.context.projectId!==pid)throw new Error('修改上下文与目标工程不一致，请重新选择。');
  const sameProject=pid===state.projectId,pendingContextSnapshot=JSON.stringify(state.pendingContext),promptSnapshot=$('prompt').value;
  const payload=body.clientRequestId?body:{projectId:pid,provider:providerId(),mode:'creative',skillIds:[...state.skillIds],roles:roleAssignments(),contextBudgetTokens:window.ContextControl?.getBudget()||1000000,modelEfforts:window.ContextControl?.getEfforts()||{},...body,clientRequestId:crypto.randomUUID(),context:{...(sameProject?getEditingContext():{}),module:state.module,useSeriesStyle:$('use-series-style').checked,...(sameProject?window.StudioUI?.getContext?.():{}),...(sameProject?state.pendingContext:{}),...body.context,projectId:pid}};
  const source=sameProject&&state.media.find(m=>m.id===payload.context?.mediaId);if(source&&payload.context.mediaFingerprint&&payload.context.mediaFingerprint!==mediaFingerprint(source)&&!body.clientRequestId)throw new Error('成片已更新，请重新选择要修改的帧或区间。');
  state.submitting.add(pid);state.pendingSubmissions.set(pid,payload);persistPending();syncRunUI();
  try{
    const result=await api('/api/runs',{method:'POST',body:payload});const id=String(result.id||result.runId||'');if(!id)throw new Error('服务没有返回任务编号，请核对任务后重试。');
    state.pendingSubmissions.delete(pid);persistPending();showError('');bumpRun(id);
    state.runs.set(id,{...payload,id,status:'queued',createdAt:new Date().toISOString(),events:[],...state.runs.get(id),...result});
    const draftUnchanged=pid===state.projectId&&$('prompt').value===promptSnapshot&&promptSnapshot.trim()===payload.prompt?.trim()&&JSON.stringify(state.pendingContext)===pendingContextSnapshot;
    if(pid===state.projectId){if(draftUnchanged)state.pendingContext=null;renderPromptContext();saveDraft();renderConversation();}renderLibrary();
    remember('activeRuns',JSON.stringify([...state.runs.values()].filter(r=>!isTerminal(r)).map(r=>r.id)));
    pollRun(id);window.dispatchEvent(new CustomEvent('workbench:run',{detail:{...payload,...result,id,userInitiated:true}}));return {id,draftUnchanged};
  }catch(error){
    if(error.status>=400&&error.status<500){state.pendingSubmissions.delete(pid);persistPending();}
    else error.message+='；发送记录已保存，可在任务中心核对并重试，同一请求不会重复创建。';
    throw error;
  }finally{state.submitting.delete(pid);syncRunUI();}
}
async function trackRun(id){
  const epoch=state.runEpochs.get(id)||0,run=await api(`/api/runs/${encodeURIComponent(id)}`);if(epoch!==(state.runEpochs.get(id)||0))return state.runs.get(id);state.runs.set(String(run.id),{...run,summaryOnly:false});
  if(!isTerminal(run))pollRun(String(run.id));
  if(run.projectId===state.projectId)renderConversation();syncRunUI();window.dispatchEvent(new CustomEvent('workbench:run',{detail:run}));return run;
}
async function resumeRun(id){
  const prior=state.runs.get(String(id)),pid=prior?.projectId;if(!prior)return;
  if(state.submitting.has(pid)||activeForProject(pid)){toast('此工程已有任务进行中，其他工程仍可继续编辑。');return;}
  state.submitting.add(pid);bumpRun(String(id));renderConversation();syncRunUI();
  try{
    const result=await api(`/api/runs/${encodeURIComponent(id)}/resume`,{method:'POST',body:{}});
    bumpRun(String(id));state.runs.set(String(id),{...prior,...result,status:result.status||'queued',canResume:false,response:''});
    const resumed=await trackRun(String(id));window.dispatchEvent(new CustomEvent('workbench:run',{detail:{...resumed,userInitiated:true}}));toast(`${projectLabel(pid)}：已继续任务，将接续保存的进度。`);
  }catch(error){toast(errorText(error));try{await trackRun(String(id));}catch{}}
  finally{state.submitting.delete(pid);renderConversation();syncRunUI();}
}
async function pollRun(id) {
  if(state.polling.has(id))return;
  const prior=state.runs.get(id);if(prior&&isTerminal(prior))return;
  clearTimeout(state.pollTimers.get(id));state.pollTimers.delete(id);state.polling.add(id);const epoch=state.runEpochs.get(id)||0;
  try{
    const run=await api(`/api/runs/${encodeURIComponent(id)}`);if(epoch!==(state.runEpochs.get(id)||0)){state.pollTimers.set(id,setTimeout(()=>pollRun(id),250));return;}state.pollFailures.delete(id);
    state.runs.set(id,{...state.runs.get(id),...run,summaryOnly:false});const merged=state.runs.get(id);
    window.dispatchEvent(new CustomEvent('workbench:context',{detail:merged}));
    if(merged.projectId===state.projectId)renderConversation();syncRunUI();
    if(prior?.status!==merged.status)renderLibrary();
    if(isTerminal(merged)){
      remember('activeRuns',JSON.stringify([...state.runs.values()].filter(r=>!isTerminal(r)).map(r=>r.id)));state.latestCache.delete(merged.projectId);
      if(merged.projectId===state.projectId)loadMedia({scope:'latest',refresh:true,preserve:true,updatePreview:false});
      const notice=merged.canResume?'进度已保存，可在任务中心继续':merged.status==='completed'?runStatusLabel(merged):merged.status==='cancelled'?'任务已停止':runStatusLabel(merged);
      toast(`${projectLabel(merged.projectId)}：${notice}`);window.dispatchEvent(new CustomEvent('workbench:run',{detail:merged}));return;
    }
  }catch(error){state.pollFailures.set(id,(state.pollFailures.get(id)||0)+1);syncRunUI();}
  finally{state.polling.delete(id);}
  if(!isTerminal(state.runs.get(id)||{}))state.pollTimers.set(id,setTimeout(()=>pollRun(id),Math.min(15000,1000*2**Math.min(4,state.pollFailures.get(id)||0))));
}
async function cancelRun(id=state.activeRun) {
  if(!id)return;const run=state.runs.get(id);bumpRun(id);$('cancel-run').disabled=true;
  try{const result=await api(`/api/runs/${encodeURIComponent(id)}/cancel`,{method:'POST',body:{}});bumpRun(id);state.runs.set(id,{...run,...result,status:result.status||'cancelling'});syncRunUI();renderLibrary();if(!isTerminal(state.runs.get(id)))pollRun(id);else {renderConversation();toast(`${projectLabel(run.projectId)}：任务已停止`);}}
  catch(error){toast(errorText(error));}finally{$('cancel-run').disabled=false;}
}

async function boot({refresh=false}={}) {
  $('refresh-button').disabled=true;const epochs=new Map(state.runEpochs);
  try{const data=await api(refresh?'/api/refresh':'/api/bootstrap',refresh?{method:'POST',body:{}}:{});state.data=data;showError('');$('connection-label').textContent='本地工作台已连接';
    const reloadNotice=data.runtime?.reload;const reloadIssue=reloadNotice&&['error','deferred'].includes(reloadNotice.status);
    if(reloadIssue){const detail=reloadNotice.message||(reloadNotice.status==='deferred'?'当前任务结束后再刷新即可应用更新。':'本次更新未能载入，工作台继续使用上一可用版本。');const message=`${reloadNotice.status==='deferred'?'工作台更新暂缓':'工作台更新未完成'}：${detail}`;showError(message);toast(message);}
    state.checkResults.clear();for(const item of array(data.providers))if(item.lastCheck)state.checkResults.set(item.id,item.lastCheck);
    for(const run of array(data.runs)){const existing=state.runs.get(String(run.id));if((epochs.get(run.id)||0)!==(state.runEpochs.get(run.id)||0))continue;state.runs.set(String(run.id),{...existing,...run,events:existing?.events||run.events,summaryOnly:existing?.summaryOnly!==false});}
    const configuredProviders=array(data.providers).filter(isConfigured);if(!isConfigured(provider())&&configuredProviders.length){const first=configuredProviders[0].id; if(first==='openai'||first==='claude')$('provider-select').value=first;}
    const projects=array(data.projects);let preferred=state.projectId||new URLSearchParams(location.search).get('projectId')||recalled('project')||data.selectedProjectId; if(!projects.some(p=>valueId(p)===preferred))preferred=data.selectedProjectId||valueId(projects[0]||'');renderLibrary();renderSelectedSkills();updateComposer();
    if(preferred)await selectProject(preferred,{restore:true});
    for(const run of state.runs.values()){
      if(run.clientRequestId&&state.pendingSubmissions.get(run.projectId)?.clientRequestId===run.clientRequestId)state.pendingSubmissions.delete(run.projectId);
      if(!isTerminal(run))pollRun(String(run.id));
    }
    persistPending();syncRunUI();
    renderConversation();updateComposer();if(refresh&&!reloadIssue)toast('工程、技能与素材已重新扫描');
  }catch(error){$('connection-label').textContent='本地服务连接失败';showError(`无法读取工作台：${errorText(error)}。请检查启动器是否仍在运行，然后点击右上角刷新。`);}finally{$('refresh-button').disabled=false;}
}

document.querySelectorAll('[data-library]').forEach(b=>b.addEventListener('click',()=>setLibrary(b.dataset.library)));
document.querySelectorAll('[data-media]').forEach(b=>b.addEventListener('click',()=>{state.mediaFilter=b.dataset.media;renderMedia();}));
document.querySelectorAll('[data-prompt]').forEach(b=>b.addEventListener('click',()=>{$('prompt').value=b.dataset.prompt;saveDraft();updateComposer();$('prompt').focus();}));
document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('click',event=>{if(event.target===dialog){const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();}}));
$('library-search').addEventListener('input',event=>{state.search=event.target.value;renderLibrary();});
$('prompt').addEventListener('input',()=>{saveDraft();updateComposer();});
$('prompt').addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();$('prompt-form').requestSubmit();}});
$('prompt-form').addEventListener('submit',submitPrompt);
$('provider-select').addEventListener('change',()=>{remember('provider',providerId());saveDraft();updateComposer();});
$('mode-select').addEventListener('change',()=>{saveDraft();updateComposer();});
$('candidate-toggle').addEventListener('change',saveDraft);
for(const role of ['plan','model','motion','integrate'])$(`role-${role}`).addEventListener('change',saveDraft);
$('skills-button').addEventListener('click',()=>{setLibrary('skills');$('library-search').focus();});
$('mobile-project-select').addEventListener('change',event=>selectProject(event.target.value));
$('mobile-resources-button').addEventListener('click',()=>document.querySelector('.library').scrollIntoView({behavior:'smooth',block:'start'}));
$('refresh-button').addEventListener('click',()=>{saveDraft();savePlayback();location.reload();});
$('shutdown-button').addEventListener('click',async()=>{if([...state.runs.values()].some(r=>!isTerminal(r))){toast('仍有后台任务，请在任务中心停止或等待完成后关闭。');return;}$('shutdown-button').disabled=true;try{await api('/api/shutdown',{method:'POST',body:{}});for(const timer of state.pollTimers.values())clearTimeout(timer);$('connection-label').textContent='工作台服务已停止';showError('本地工作台已关闭。再次双击 EXE 启动器即可继续创作。');for(const id of ['send-button','check-provider','new-project-button','refresh-button','reload-media'])$(id).disabled=true;$('prompt').disabled=true;toast('工作台已关闭，已有工程与输出保留');}catch(error){toast(errorText(error));$('shutdown-button').disabled=false;}});
$('reload-media').addEventListener('click',()=>loadMedia({refresh:true}));
$('show-history').addEventListener('click',()=>loadMedia({scope:state.mediaScope==='history'?'latest':'history'}));
$('history-more').addEventListener('click',()=>loadMedia({scope:'history',append:true}));
window.addEventListener('studio:module',event=>{state.module=event.detail.module;});
$('cancel-run').addEventListener('click',()=>cancelRun());
$('attach-skill').addEventListener('click',()=>{if(!state.skillDetail)return;const id=valueId(state.skillDetail);if(state.skillIds.has(id))state.skillIds.delete(id);else state.skillIds.add(id);saveDraft();renderSelectedSkills();renderLibrary();$('skill-dialog').close();if(innerWidth<801)document.querySelector('.composer-section').scrollIntoView({behavior:'smooth',block:'center'});});
$('check-provider').addEventListener('click',async()=>{const id=providerId();$('check-provider').disabled=true;$('check-provider').textContent='检查中…';try{const result=await api(`/api/providers/${encodeURIComponent(id)}/check`,{method:'POST',body:{}});state.checkResults.set(id,result);toast(result.ok?'连接检查通过':result.message||result.error||'连接检查未通过');}catch(error){state.checkResults.set(id,{ok:false,message:errorText(error)});toast(errorText(error));}finally{$('check-provider').textContent='检查连接';updateComposer();}});
$('new-project-button').addEventListener('click',()=>{$('new-project-error').textContent='';$('project-dialog').showModal();$('new-project-name').focus();});
$('new-project-form').addEventListener('submit',async event=>{event.preventDefault();const name=$('new-project-name').value.trim();if(!name)return;$('create-project-submit').disabled=true;$('new-project-error').textContent='';try{const result=await api('/api/projects',{method:'POST',body:{name}});$('project-dialog').close();$('new-project-name').value='';saveDraft();const fresh=await api('/api/bootstrap');state.data.projects=fresh.projects;state.data.series=fresh.series;await selectProject(String(result.id||result.project?.id||''));toast('新工程已创建');}catch(error){$('new-project-error').textContent=errorText(error);}finally{$('create-project-submit').disabled=false;}});
for(const id of ['video-preview','audio-preview']){
  $(id).addEventListener('error',()=>{if($(id).hasAttribute('src'))toast('该媒体暂时无法播放，可以使用右上角 ↗ 独立打开，或重新刷新素材。');});
  $(id).addEventListener('pause',savePlayback);
  let lastSavedSecond=-1;$(id).addEventListener('timeupdate',()=>{const second=Math.floor($(id).currentTime);if(second!==lastSavedSecond){lastSavedSecond=second;savePlayback();}});
}
window.addEventListener('pagehide',()=>{saveDraft();savePlayback();});
$('image-preview').addEventListener('error',()=>{if($('image-preview').hasAttribute('src'))toast('图片读取失败，请刷新素材后重试。');});
$('video-preview').addEventListener('loadedmetadata',()=>{const video=$('video-preview');const item=state.media.find(m=>valueId(m)===state.mediaId);if(item&&mediaKind(item)==='video')$('media-detail').textContent=['视频',`${video.videoWidth} × ${video.videoHeight}`,formatTime(video.duration),formatBytes(item.size||item.bytes)].filter(Boolean).join(' · ');});
const savedProvider=recalled('provider');if(['openai','claude','dual'].includes(savedProvider))$('provider-select').value=savedProvider;
window.Workbench={api,getProject:()=>project(),getMedia:()=>state.media,getLatestMedia:()=>state.latestCache.get(state.projectId)?.items||state.media,getData:()=>state.data,getSelectedMedia:()=>state.selectedMedia||state.media.find(m=>valueId(m)===state.mediaId),startTask,trackRun,selectProject,refreshProjects:async()=>{const data=await api('/api/bootstrap');state.data.projects=data.projects;state.data.series=data.series;renderLibrary();const p=project();if(p){$('project-name').textContent=valueName(p);$('project-context').textContent=[p.seriesName,p.episode?`第 ${p.episode} 期`:'','当前工程'].filter(Boolean).join(' · ');}},refresh:()=>loadMedia({refresh:true}),selectMedia:(item,options={})=>selectMedia(item,{reveal:true,...options}),toast,queuePrompt,getEditingContext,setEditingContext,updateProject:patch=>{const p=project();if(p)Object.assign(p,patch);renderLibrary();},getModule:()=>state.module};
try{for(const [pid,payload] of JSON.parse(recalled('pendingSubmissions')||'[]'))if(payload?.clientRequestId)state.pendingSubmissions.set(pid,payload);}catch{}
$('series-manage-button').onclick=()=>window.StudioUI?.openSeriesManager?.();
$('project-features-button').onclick=()=>window.StudioUI?.openProjectSettings?.();
$('clear-editing-context').onclick=()=>{state.editingContexts.delete(state.projectId);renderEditingContext();window.dispatchEvent(new CustomEvent('workbench:editing-context',{detail:getEditingContext()}));};
$('restore-previous-draft').onclick=()=>{const draft=readDraft(state.projectId);if(!draft?.previousPrompt)return;$('prompt').value=draft.previousPrompt;state.pendingContext=draft.previousContext||null;storeDraft(state.projectId,{...draft,previousPrompt:null,previousContext:null});saveDraft();renderPromptContext();updateComposer();$('restore-previous-draft').hidden=true;};
window.addEventListener('workbench:module-request',async event=>{
  const context=event.detail;if(context.projectId!==state.projectId){toast('请先切换回标记所属工程。');return;}
  const media=state.selectedMedia;if(context.mediaId&&media?.id!==context.mediaId){toast('成片版本已切换，请在对应版本中打开标记。');return;}
  const reviewContext=window.VideoReview?.getContext?.();if(context.sourceVersion&&reviewContext?.sourceVersion&&context.sourceVersion!==reviewContext.sourceVersion){toast('此标记属于旧成片版本，请重新确认位置。');return;}
  setEditingContext(context);const section={camera:'motion',subtitles:'audio'}[context.module]||context.module;
  window.StudioUI?.openSection(section);window.dispatchEvent(new CustomEvent('workbench:module-context',{detail:context}));
});
window.addEventListener('online',()=>{for(const run of state.runs.values())if(!isTerminal(run))pollRun(run.id);$('connection-label').textContent='正在重新连接本地工作台';});
window.addEventListener('offline',()=>{$('connection-label').textContent='连接中断 · 草稿已保留';saveDraft();});
document.addEventListener('pointerdown',event=>{if(!$('task-center').contains(event.target))$('task-center').open=false;});
document.addEventListener('keydown',event=>{if(event.key==='Escape')$('task-center').open=false;});
window.addEventListener('agent-workspace:ready',()=>{renderConversation();syncRunUI();});
window.addEventListener('workbench:artifact-ready',event=>{
  const pid=event.detail?.projectId;if(!pid)return;state.latestCache.delete(pid);
  if(pid===state.projectId)loadMedia({scope:'latest',refresh:true,preserve:true,updatePreview:false});
});

boot();
