/* Version-scoped, reversible preview edits. The main agent renders approved changes. */
(() => {
 'use strict';
 const wb=window.Workbench,$=id=>document.getElementById(id),video=$('video-preview'),stage=$('preview-stage');
 if(!wb||!video||!stage)return;
 let current=null,selected=null,raf=0,drag=null,renderKey='',enabled=true,rangeOpen=false;
 const cache=new Map(),names={note:'位置意见',text:'文字预演',blur:'遮挡预演',brightness:'亮度预演',zoom:'构图预演'};
 const modules={creative:'综合修改',covers:'封面',audio:'声音',camera:'运镜',subtitles:'字幕'};
 const time=t=>`${Math.floor(t/60)}:${(t%60).toFixed(1).padStart(4,'0')}`;
 const make=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;if(tag==='button')e.type='button';return e;};
 const clone=value=>structuredClone(value),same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const defaultModule=kind=>({text:'subtitles',zoom:'camera',brightness:'camera'}[kind]||'creative');
 const api=(action,args)=>wb.api('/api/studio/action',{method:'POST',body:{action,...args}});

 // Native controls stay off the transformed video surface to avoid Chromium blank frames.
 video.controls=false;
 const toolbar=make('div','review-toolbar');
 toolbar.innerHTML='<div class="review-tools"><button type="button" id="review-add-note" aria-label="标记当前画面">⌖ 标记</button><select id="review-add-kind" aria-label="添加画面预演"><option value="">画面预演…</option value="text">文字</option><option value="blur">遮挡</option><option value="brightness">亮度</option><option value="zoom">构图</option></select><select id="review-module-action" aria-label="将当前帧或选中区间交给工作台"><option value="">联动工作台…</option value="subtitles">字幕</option><option value="audio">声音</option><option value="camera">运镜</option><option value="covers">封面</option></select></div><label><input id="review-preview-toggle" type="checkbox" checked>预演</label>';
 stage.before(toolbar);
 const layer=make('div','review-overlay');layer.id='review-overlay';stage.append(layer);
 const scrub=make('div','review-scrub');
 scrub.innerHTML='<button type="button" id="review-play-toggle" aria-label="播放或暂停">▷</button><span id="review-time">0:00.0</span><div class="review-scrub-track"><input id="review-playhead" type="range" min="0" max="1" step="0.01" value="0" aria-label="视频播放位置"><div id="review-time-pins"></div></div><span id="review-duration">0:00</span><button type="button" id="review-mute" aria-label="静音或恢复声音">♪</button>';
 stage.after(scrub);
 const pane=make('section','review-pane');pane.tabIndex=-1;
 pane.innerHTML='<div class="review-pane-heading"><strong>修改清单 <span id="review-count">0</span></strong><div class="review-list-tools"><button type="button" id="review-undo" aria-label="撤销上一次删除" disabled>↶ 撤销</button><select id="review-list-action" aria-label="修改清单批量操作"><option value="">清单操作…</option><option value="enable">全部采用</option><option value="disable">全部停用</option><option value="clear">清空（可撤销）</option></select></div></div><div class="review-save-line"><span id="review-save-state" role="status" aria-live="polite">正在读取…</span><button type="button" id="review-save-retry" hidden>重试保存</button></div><div id="review-inspector" hidden></div><div id="review-notes"></div><button type="button" id="review-to-agent" class="studio-button primary" disabled>整理意见，交给主智能体 ↗</button><p class="review-caption">修改自动保存，可撤销删除。先在画面预演，再统一提交生成新成片。</p>';
 $('timeline-editor').after(pane);
 $('timeline-editor').classList.add('review-range-controls');
 const expand=make('button','review-range-toggle','区间与逐帧工具 ⌄');expand.setAttribute('aria-expanded','false');
 $('timeline-editor').before(expand);$('timeline-editor').hidden=true;
 expand.onclick=()=>{rangeOpen=!rangeOpen;expand.setAttribute('aria-expanded',String(rangeOpen));$('timeline-editor').hidden=!rangeOpen;};

 function syncStatus(record){
  if(current!==record)return;
  let label=record.loading?'正在读取…':record.pending?'保存中…':record.error?(record.prepareError?'未整理 · ':'未保存 · ')+record.error:record.dirty?'待保存…':record.status==='prepared'?'已整理到主智能体 · 意见保留':record.status==='submitted'?'已提交的意见已保留':'已自动保存';
  if(record.readFailed)label='读取失败 · '+record.error;
  $('review-save-state').textContent=label;
  $('review-save-state').classList.toggle('error',Boolean(record.error));
  const retry=$('review-save-retry');retry.hidden=!record.error;
  retry.disabled=Boolean(record.pending||record.loading);
  retry.textContent=record.readFailed?'重新读取':record.conflict?'合并最新并重试':record.prepareError?'重新整理':'重试保存';
  $('review-to-agent').disabled=Boolean(record.loading||record.readFailed||record.sending||!record.notes.some(n=>n.enabled));
 }
 function undoKey(record){return `rainbow-review-undo:${record.pid}:${record.sourceVersion}`;}
 function storeUndo(record){try{sessionStorage.setItem(undoKey(record),JSON.stringify(record.undo));}catch{}}
 function pushUndo(record,label){record.undo.push({notes:clone(record.notes),selected,label});if(record.undo.length>10)record.undo.shift();storeUndo(record);}
 function changed(record=current){
  if(!record||record.loading||record.readFailed)return;
  record.editVersion++;record.dirty=true;record.status='draft';clearTimeout(record.timer);
  record.timer=setTimeout(()=>save(record).catch(()=>{}),450);
  if(record===current){renderKey='';renderList();draw();}syncStatus(record);
 }
 async function save(record){
  if(!record)return null;
  clearTimeout(record.timer);record.timer=null;
  if(record.loading||record.readFailed)throw new Error('修改清单尚未读取完成');
  if(record.inflight){await record.inflight;return record.dirty?save(record):record;}
  if(!record.dirty)return record;
  if(record.conflict)throw new Error(record.error||'请先合并最新记录');
  const notes=clone(record.notes),stamp=record.editVersion,revision=record.revision;
  record.pending=true;syncStatus(record);
  const request=(async()=>{
   try{
    const data=await api('review.save',{projectId:record.pid,mediaId:record.media.id,sourceVersion:record.sourceVersion,expectedRevision:revision,notes});
    record.revision=data.revision;record.path=data.path;record.baseNotes=clone(data.notes);record.savedVersion=stamp;record.dirty=record.editVersion!==stamp;
    record.error=null;record.conflict=false;record.prepareError=false;record.lastSaved=Date.now();record.status=data.status||'draft';
    // Preserve the selected inspector's object reference while it is being edited.
    if(!record.dirty)for(const normalized of data.notes){const live=record.notes.find(n=>n.id===normalized.id);if(live)Object.assign(live,normalized);}
    if(current===record){renderKey='';renderList();draw();}
    return data;
   }catch(e){record.error=e.message;record.conflict=e.status===409||e.code==='review_conflict'||/另一页面|成片已更新/.test(e.message);throw e;}
   finally{record.pending=false;record.inflight=null;syncStatus(record);}
  })();
  record.inflight=request;return request;
 }
 async function flush(record=current){if(!record)return null;do{await save(record);}while(record.dirty);return record;}
 function detach(){
  const prior=current;
  if(prior?.dirty&&!prior.loading&&!prior.readFailed)save(prior).catch(()=>{});
  current=null;selected=null;drag=null;renderKey='';layer.replaceChildren();video.style.filter='';video.style.transform='';video.style.transformOrigin='';
 }
 async function fetchRecord(record){
  record.loading=true;record.readFailed=false;syncStatus(record);
  try{
   const data=await api('review.read',{projectId:record.pid,mediaId:record.media.id});
   Object.assign(record,data,{loading:false,error:null,readFailed:false,conflict:false,baseNotes:clone(data.notes),notes:clone(data.notes)});
   try{record.undo=JSON.parse(sessionStorage.getItem(undoKey(record))||'[]');if(!Array.isArray(record.undo))record.undo=[];}catch{record.undo=[];}
   if(current===record){renderKey='';renderList();inspector();draw();}syncStatus(record);
  }catch(e){record.loading=false;record.readFailed=true;record.error=e.message;syncStatus(record);}
 }
 async function load(){
  const media=wb.getSelectedMedia(),pid=wb.getProject()?.id,good=Boolean(pid&&media?.kind==='video');
  toolbar.hidden=scrub.hidden=pane.hidden=expand.hidden=!good;
  if(!good){detach();$('timeline-editor').hidden=true;return;}
  const key=`${pid}:${media.id}:${media.url}`;
  if(current?.key===key)return;
  detach();
  const record=cache.get(key)||{key,pid,media:clone(media),notes:[],baseNotes:[],undo:[],revision:0,editVersion:0,savedVersion:0,pending:false,dirty:false,loading:true};
  current=record;cache.set(key,record);renderList();inspector();draw();
  if(record.sourceVersion){syncStatus(record);return;}
  await fetchRecord(record);
 }
 async function retry(){
  const record=current;if(!record||record.pending||record.loading)return;
  if(record.readFailed)return fetchRecord(record);
  if(record.prepareError&&!record.conflict){record.error=null;record.prepareError=false;return send();}
  try{
   if(record.conflict){
    const remote=await api('review.read',{projectId:record.pid,mediaId:record.media.id});
    if(remote.sourceVersion!==record.sourceVersion)throw new Error('成片已更新；当前意见已保留，请重新打开视频新版本');
    const bases=new Map(record.baseNotes.map(n=>[n.id,n])),locals=new Map(record.notes.map(n=>[n.id,n])),remotes=new Map(remote.notes.map(n=>[n.id,n])),merged=[];
    for(const id of new Set([...bases.keys(),...locals.keys(),...remotes.keys()])){
     const base=bases.get(id),local=locals.get(id),other=remotes.get(id);
     if(same(local,base)){if(other)merged.push(other);}
     else if(same(other,base)||same(local,other)){if(local)merged.push(local);}
     else{if(other)merged.push(other);if(local)merged.push({...local,id:crypto.randomUUID(),text:('本页待核对：'+local.text).slice(0,1600)});}
    }
    if(merged.length>200)throw new Error('合并后超过200条，当前修改已保留；请先精简清单');
    record.notes=merged;record.baseNotes=clone(remote.notes);record.revision=remote.revision;record.conflict=false;record.error=null;record.prepareError=false;record.undo=[];storeUndo(record);changed(record);
    if(record===current){if(!record.notes.some(n=>n.id===selected))selected=null;inspector();renderList();}
   }
   await flush(record);
  }catch(e){record.error=e.message;syncStatus(record);wb.toast(e.message);}
 }

 const selectedNote=()=>current?.notes.find(n=>n.id===selected);
 function add(kind='note'){
  if(!current||current.loading||current.readFailed||!Number.isFinite(video.duration)||video.readyState<1){wb.toast('等待成片加载完成后标记');return;}
  if(!names[kind]||current.notes.length>=200){wb.toast('每版最多200条意见');return;}
  video.pause();const start=Math.min(video.currentTime,Math.max(0,video.duration-.1)),end=Math.min(video.duration,start+4);
  const n={id:crypto.randomUUID(),kind,targetModule:defaultModule(kind),startSec:start,endSec:end,text:kind==='text'?'在这里放置文字':'',x:.5,y:kind==='text'?.76:.5,width:.28,height:.16,value:kind==='brightness'?1.15:kind==='zoom'?1.2:1,enabled:true};
  current.notes.push(n);selected=n.id;inspector();changed();$('review-note-text').focus();
 }
 function removeNote(id){
  const record=current;if(!record||!record.notes.some(n=>n.id===id))return;
  pushUndo(record,'删除意见');record.notes=record.notes.filter(n=>n.id!==id);
  if(selected===id){selected=null;inspector();}changed(record);
 }
 function undo(){
  const record=current,snapshot=record?.undo.pop();if(!snapshot||record.loading||record.readFailed)return;
  // Restore deleted entries only; later typing and newly added notes must survive undo.
  const existing=new Set(record.notes.map(n=>n.id));
  const restored=snapshot.notes.filter(n=>!existing.has(n.id));
  if(record.notes.length+restored.length>200){record.undo.push(snapshot);wb.toast('恢复后超过200条，请先精简清单');return;}
  record.notes.push(...clone(restored));selected=snapshot.selected;storeUndo(record);changed(record);inspector();wb.toast('已撤销'+snapshot.label);
 }
 function inspector(){
  const box=$('review-inspector'),n=selectedNote(),record=current;box.replaceChildren();box.hidden=!n;if(!n)return;
  const head=make('div','review-inspector-head');head.append(make('strong','',names[n.kind]),make('span','','拖动画面调整位置'));
  const close=make('button','','×');close.setAttribute('aria-label','收起此条编辑');close.onclick=()=>{selected=null;inspector();renderList();renderKey='';draw();};head.append(close);box.append(head);
  const input=make('textarea');input.id='review-note-text';input.maxLength=1600;input.setAttribute('aria-label','修改意见');input.placeholder=n.kind==='text'?'输入预演文字':'这里想改什么？例如字幕上移、镜头慢一点、修正模型';input.value=n.text;input.oninput=()=>{n.text=input.value;changed(record);};box.append(input);
  const fields=make('div','review-note-fields');
  for(const [key,label] of [['startSec','起点'],['endSec','终点']]){
   const l=make('label','',label),e=make('input');e.type='number';e.min=0;e.max=video.duration;e.step='.1';e.value=n[key].toFixed(1);e.setAttribute('aria-label',label+'秒');
   e.onchange=()=>{const value=+e.value;if(!Number.isFinite(value)||value<0||value>video.duration||(key==='startSec'?value>=n.endSec:value<=n.startSec)){e.value=n[key].toFixed(1);return;}n[key]=value;changed(record);};l.append(e);fields.append(l);
  }
  const module=make('select');module.setAttribute('aria-label','意见所属模块');
  for(const [value,label] of Object.entries(modules)){const o=make('option','',label);o.value=value;module.append(o);}module.value=n.targetModule||defaultModule(n.kind);module.onchange=()=>{n.targetModule=module.value;changed(record);};fields.append(module);box.append(fields);
  if(['brightness','zoom','blur'].includes(n.kind)){
   const key=n.kind==='blur'?'width':'value',l=make('label','review-adjust',n.kind==='blur'?'区域宽度':n.kind==='zoom'?'放大倍率':'亮度'),e=make('input');e.type='range';e.min=n.kind==='blur'?'.05':n.kind==='zoom'?'1':'.5';e.max=n.kind==='blur'?'.8':'2';e.step='.01';e.value=n[key];e.setAttribute('aria-label',l.textContent);e.oninput=()=>{n[key]=+e.value;changed(record);};l.append(e);box.append(l);
   if(n.kind==='blur'){const l2=make('label','review-adjust','区域高度'),e2=make('input');e2.type='range';e2.min='.03';e2.max='.8';e2.step='.01';e2.value=n.height;e2.setAttribute('aria-label','区域高度');e2.oninput=()=>{n.height=+e2.value;changed(record);};l2.append(e2);box.append(l2);}
  }
 }
 function renderList(){
  const list=$('review-notes'),pins=$('review-time-pins'),record=current;list.replaceChildren();pins.replaceChildren();
  const notes=[...(record?.notes||[])].sort((a,b)=>a.startSec-b.startSec);$('review-count').textContent=notes.length;$('review-undo').disabled=!record?.undo.length||record.loading||record.readFailed;
  $('review-list-action').disabled=!notes.length||record.loading||record.readFailed;
  if(record)syncStatus(record);
  for(const n of notes){
   const row=make('div','review-note-row');row.dataset.noteId=n.id;row.classList.toggle('selected',n.id===selected);row.classList.toggle('disabled',!n.enabled);
   const check=make('input','review-note-enabled');check.type='checkbox';check.checked=n.enabled;check.setAttribute('aria-label',`采用 ${time(n.startSec)} 的意见`);check.onchange=()=>{n.enabled=check.checked;changed(record);};
   const b=make('button','review-note-jump');b.setAttribute('aria-label',`编辑 ${time(n.startSec)} ${n.text||names[n.kind]}`);b.append(make('span','review-note-time',time(n.startSec)),make('span','',n.text||names[n.kind]));
   b.onclick=()=>{selected=n.id;video.pause();video.currentTime=n.startSec;inspector();renderList();renderKey='';draw();pane.focus({preventScroll:true});};
   const del=make('button','review-note-remove','×');del.setAttribute('aria-label',`删除 ${time(n.startSec)} 的意见`);del.title='删除，可撤销';del.onclick=()=>removeNote(n.id);row.append(check,b,del);list.append(row);
   const pin=make('button','review-time-pin');pin.title=`${time(n.startSec)} ${n.text||names[n.kind]}`;pin.setAttribute('aria-label',pin.title);pin.classList.toggle('disabled',!n.enabled);pin.style.left=`${n.startSec/(video.duration||1)*100}%`;pin.onclick=b.onclick;pins.append(pin);
  }
  if(!notes.length)list.append(make('div','review-note-empty',record?.loading?'正在读取这版成片的修改清单…':'播放时点「标记」，在画面中拖动定位。意见按时间整理。'));
 }
 function draw(){
  if(!current||!video.videoWidth||video.hidden){layer.replaceChildren();return;}
  const record=current,vw=video.clientWidth,vh=video.clientHeight,scale=Math.min(vw/video.videoWidth,vh/video.videoHeight),width=video.videoWidth*scale,height=video.videoHeight*scale;
  Object.assign(layer.style,{left:`${video.offsetLeft+(vw-width)/2}px`,top:`${video.offsetTop+(vh-height)/2}px`,width:`${width}px`,height:`${height}px`});
  const t=video.currentTime,active=record.notes.filter(n=>n.enabled&&t>=n.startSec&&t<n.endSec),key=active.map(n=>n.id).join()+'|'+selected+'|'+enabled;
  const bright=active.filter(n=>n.kind==='brightness').at(-1),zoom=active.filter(n=>n.kind==='zoom').at(-1);
  video.style.filter=enabled&&bright?`brightness(${bright.value})`:'';video.style.transform=enabled&&zoom?`scale(${zoom.value})`:'';video.style.transformOrigin=zoom?`${zoom.x*100}% ${zoom.y*100}%`:'';
  if(key!==renderKey&&!drag){
   renderKey=key;layer.replaceChildren();
   for(const n of active){
    if(!enabled&&n.kind!=='note')continue;
    const m=make('button',`review-object review-object-${n.kind}`);m.dataset.noteId=n.id;m.classList.toggle('selected',selected===n.id);m.title=n.text||names[n.kind];m.setAttribute('aria-label','编辑画面中的'+(n.text||names[n.kind]));m.textContent=n.kind==='text'?n.text:n.kind==='blur'?'':n.kind==='note'?'＋':n.kind==='brightness'?'☼':'⌗';
    m.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();e.stopPropagation();video.pause();selected=n.id;inspector();renderList();drag={record,n,pointer:e.pointerId,rect:layer.getBoundingClientRect()};m.setPointerCapture(e.pointerId);};
    m.onpointermove=e=>{if(drag?.pointer!==e.pointerId||drag.n!==n||current!==record)return;const r=drag.rect;n.x=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));n.y=Math.max(0,Math.min(1,(e.clientY-r.top)/r.height));m.style.left=n.x*100+'%';m.style.top=n.y*100+'%';changed(record);};
    const finish=e=>{if(drag?.pointer===e.pointerId&&drag.record===record){drag=null;changed(record);}};
    m.onpointerup=finish;m.onpointercancel=finish;m.onlostpointercapture=finish;layer.append(m);
   }
  }
  for(const m of layer.children){const n=active.find(x=>x.id===m.dataset.noteId);if(!n)continue;m.style.left=n.x*100+'%';m.style.top=n.y*100+'%';if(n.kind==='text'){m.textContent=n.text;m.style.fontSize=`${Math.max(14,width*.035)}px`;}if(n.kind==='blur'){m.style.width=n.width*100+'%';m.style.height=n.height*100+'%';}}
  $('review-play-toggle').textContent=video.paused?'▷':'Ⅱ';$('review-time').textContent=time(t);$('review-duration').textContent=time(video.duration||0);$('review-playhead').max=video.duration||1;$('review-playhead').value=t;
 }
 function getContext(module='creative'){
  const record=current;if(!record||record.loading||record.readFailed)return null;
  const note=selectedNote(),duration=Number.isFinite(video.duration)?video.duration:0,at=Math.max(0,Math.min(duration,video.currentTime||0));
  let start=note?note.startSec:at,end=note?note.endSec:Math.min(duration,at+4);
  if(!note&&rangeOpen){const a=Number($('segment-start')?.value),b=Number($('segment-end')?.value);if(Number.isFinite(a)&&Number.isFinite(b)&&a>=0&&b>a&&b<=duration){start=a;end=b;}}
  return {module,projectId:record.pid,mediaId:record.media.id,sourcePath:record.sourcePath,sourceVersion:record.sourceVersion,timeSec:at,timeRange:{startSec:start,endSec:end,sourcePath:record.sourcePath},reviewNoteIds:note?[note.id]:[]};
 }
 async function moduleAction(module){
  const record=current,context=getContext(module);if(!context||!modules[module])return;
  try{const note=selectedNote();if(note){note.targetModule=module;changed(record);}await flush(record);if(current!==record)return;window.dispatchEvent(new CustomEvent('workbench:module-request',{detail:context}));}
  catch(e){wb.toast(e.message);}
 }
 async function send(){
  const record=current;if(!record||record.sending)return;
  record.sending=true;syncStatus(record);
  try{
   await flush(record);if(record!==current)return;
   const notes=clone(record.notes.filter(n=>n.enabled)).sort((a,b)=>a.startSec-b.startSec),stamp=record.editVersion;if(!notes.length)throw new Error('请至少采用一条修改意见');
   const prepared=await api('review.prepare',{projectId:record.pid,mediaId:record.media.id,sourceVersion:record.sourceVersion,expectedRevision:record.revision});
   if(record.editVersion!==stamp||record.revision!==prepared.revision){record.status='draft';throw new Error('意见刚有改动，已继续自动保存；请再次整理最新清单');}
   record.status=prepared.status;record.preparedRevision=prepared.preparedRevision;
   if(record!==current)return;
   const summary=notes.map((n,i)=>`${i+1}. ${time(n.startSec)}–${time(n.endSec)} ${modules[n.targetModule]||modules[defaultModule(n.kind)]} / ${names[n.kind]}：${n.text||'采用预演参数'}${['brightness','zoom'].includes(n.kind)?`（${n.value}）`:''}`).join('\n');
   wb.queuePrompt(`请根据这份看片修改清单，统一优化「${record.media.name}」。\n${summary.slice(0,12000)}\n完整意见与归一化坐标保存在 ${record.path}。先读取全部意见，按所属模块逐条落实；检查字幕、镜头和音画对应，另存新成片。`,{taskType:'video-review',module:'creative',projectId:record.pid,mediaId:record.media.id,sourcePath:record.sourcePath,sourceVersion:record.sourceVersion,reviewPath:record.path,reviewRevision:record.revision,reviewCount:notes.length,reviewNoteIds:notes.map(n=>n.id)});
   wb.toast(`已整理 ${notes.length} 条意见到主智能体，发送后统一修改；原标记已保留`);
  }catch(e){wb.toast(e.message);record.error=e.message;record.prepareError=!record.dirty;if(e.status===409||e.code==='review_conflict')record.conflict=true;}
  finally{record.sending=false;syncStatus(record);}
 }

 function frame(){draw();if(!video.paused)raf=requestAnimationFrame(frame);}
 $('review-add-note').onclick=()=>add();
 $('review-add-kind').onchange=e=>{if(e.target.value)add(e.target.value);e.target.value='';};
 $('review-module-action').onchange=e=>{if(e.target.value)moduleAction(e.target.value);e.target.value='';};
 $('review-preview-toggle').onchange=e=>{enabled=e.target.checked;renderKey='';draw();};
 $('review-playhead').oninput=e=>{video.pause();video.currentTime=+e.target.value;draw();};
 $('review-mute').onclick=()=>{video.muted=!video.muted;$('review-mute').textContent=video.muted?'×♪':'♪';};
 $('review-play-toggle').onclick=()=>video.paused?video.play().catch(()=>{}):video.pause();
 $('review-save-retry').onclick=retry;$('review-undo').onclick=undo;$('review-to-agent').onclick=send;
 $('review-list-action').onchange=e=>{const action=e.target.value,record=current;e.target.value='';if(!record||!record.notes.length)return;if(action==='clear'){pushUndo(record,'清空');record.notes=[];selected=null;inspector();}else if(['enable','disable'].includes(action)){for(const n of record.notes)n.enabled=action==='enable';}else return;changed(record);};
 document.addEventListener('keydown',e=>{if(!current||e.defaultPrevented)return;const target=e.target;if(target.closest('input,textarea,select,[contenteditable="true"],[role="textbox"]')||!(pane.contains(target)||stage.contains(target)))return;if(e.key==='Delete'&&selected){e.preventDefault();removeNote(selected);}else if((e.ctrlKey||e.metaKey)&&!e.shiftKey&&e.key.toLowerCase()==='z'&&current.undo.length){e.preventDefault();undo();}});
 video.addEventListener('play',()=>{cancelAnimationFrame(raf);frame();});
 for(const event of ['timeupdate','seeked','loadedmetadata','pause'])video.addEventListener(event,()=>{draw();if(event==='loadedmetadata')renderList();});
 new ResizeObserver(()=>{renderKey='';draw();}).observe(stage);
 window.addEventListener('workbench:project',()=>{detach();toolbar.hidden=scrub.hidden=pane.hidden=expand.hidden=true;$('timeline-editor').hidden=true;});
 window.addEventListener('workbench:media',()=>{load();if(!rangeOpen)$('timeline-editor').hidden=true;});
 window.addEventListener('beforeunload',e=>{if([...cache.values()].some(r=>r.timer||r.pending||r.dirty)){e.preventDefault();e.returnValue='';}});
 window.VideoReview={add,remove:removeNote,undo,getContext,isRangeOpen:()=>rangeOpen,getNotes:()=>clone(current?.notes||[]),send,flush:()=>flush(current)};
 load();
})();
