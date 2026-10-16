(function(root){
  'use strict';
  const terminal=new Set(['completed','complete','succeeded','success','failed','error','cancelled','canceled','interrupted','paused']);
  const success=new Set(['completed','complete','succeeded','success']);
  const statusLabels={queued:'等待开始',pending:'等待开始',starting:'准备工程',running:'创作中',awaiting_selection:'等待你选择',cancelling:'正在停止',completed:'制作完成',complete:'制作完成',succeeded:'制作完成',success:'制作完成',failed:'需要处理',error:'需要处理',cancelled:'已停止',canceled:'已停止',interrupted:'已中断',paused:'进度已保存'};
  const stepLabels={pending:'待进行',in_progress:'进行中',completed:'已完成',blocked:'待处理',skipped:'已跳过'};
  const kindLabels={video:'视频',image:'图片',audio:'声音',subtitle:'字幕',document:'文档',model:'模型',source:'源文件',report:'报告'};
  const stageLabels={draft:'草稿',preview:'预览',final:'交付'};
  const views=new WeakMap();
  function items(value){return Array.isArray(value)?value:[];}
  function text(value){return typeof value==='string'?value:value==null?'':JSON.stringify(value,null,2);}
  function short(value,max=110){const s=text(value).replace(/\s+/g,' ').trim();return s.length>max?s.slice(0,max-1)+'…':s;}
  function checkState(check){
    if(check.status==='failed')return 'failed';
    if(check.status==='passed'&&items(check.evidenceIds).length&&!['manual','listening'].includes(check.kind)&&(['tool_evidence','model_review'].includes(check.source)))return 'passed';
    return check.status==='not_run'?'not_run':'unverified';
  }
  function stepState(status){return ({running:'in_progress',starting:'in_progress',failed:'blocked',error:'blocked',paused:'blocked',interrupted:'blocked',cancelled:'blocked',canceled:'blocked'})[status]||(['pending','in_progress','completed','blocked','skipped'].includes(status)?status:'pending');}
  function lastProgress(run){
    const event=items(run.events).slice().reverse().find(e=>['status','phase','continuation','handoff','collaboration_request','collaboration_return','tool','error','output_limit'].includes(e.type));
    if(!event)return '';
    if(event.type==='tool')return short(event.message||('正在使用 '+(event.tool||event.toolName||'工程工具')),100);
    return short(event.message||event.text||event.content,140);
  }
  function normalize(run){
    const work=run.creativeWork||{},checks=items(work.checks).map(c=>({...c,displayStatus:checkState(c)}));
    const steps=(items(work.steps).length?work.steps:items(run.phases)).map((s,i)=>({...s,id:String(s.id||'step-'+i),title:short(s.title||s.name||'制作步骤',90),status:stepState(s.status)}));
    const current=steps.find(s=>work.currentStep&&s.id===work.currentStep)||steps.find(s=>run.phase&&(s.phaseId===run.phase||s.id===run.phase))||steps.find(s=>s.status==='in_progress')||steps.find(s=>s.status==='blocked');
    const complete=steps.filter(s=>s.status==='completed').length;
    const remaining=steps.filter(s=>['pending','in_progress','blocked'].includes(s.status));
    const hasUnfinished=success.has(run.status)&&work.planSource==='model'&&remaining.length>0;
    const isDone=terminal.has(run.status),hasResponse=Boolean(run.response||run.output||items(run.events).some(e=>e.type==='assistant'&&(e.message||e.text||e.content)));
    const artifacts=items(work.artifacts).map(a=>({...a,title:text(a.title||a.path||'制作成果'),verified:items(a.checkIds).some(id=>checks.some(c=>c.id===id&&c.displayStatus==='passed'))}));
    const title=short(work.title||work.goal||run.prompt||'创作任务',72),goal=short(work.goal||run.prompt||title,180);
    let progress=current?.note?short(current.note,150):lastProgress(run);
    if(run.status==='awaiting_selection')progress='比较下面的方向，选定后接着制作。';
    else if(hasUnfinished)progress=`还有 ${remaining.length} 项待办：${remaining.slice(0,2).map(s=>s.title).join('、')}${remaining.length>2?'等':''}。`;
    else if(success.has(run.status))progress=artifacts.length?`${artifacts.length} 项成果已整理，可选择预览。`:'已保存本次制作结果，展开回复查看说明。';
    else if(isDone)progress=short(run.error||run.recovery?.message||progress||'工作进度已保留。',160);
    return {id:String(run.id),projectId:run.projectId,title,goal,status:run.status||'pending',statusLabel:hasUnfinished?'本轮结束 · 仍有待办':statusLabels[run.status]||'准备中',terminal:isDone,steps,current,complete,total:steps.length,remaining,hasUnfinished,progress:progress||'正在读取工程，梳理接下来的制作步骤。',artifacts,checks,hasResponse,hasFailures:checks.some(c=>c.displayStatus==='failed'),hasEvidence:checks.some(c=>c.displayStatus==='passed'),summaryOnly:Boolean(run.summaryOnly)};
  }
  function progressText(run){const model=normalize(run);return [model.current?.title,model.progress].filter(Boolean).join(' · ');}
  function node(tag,cls,value){const n=root.document.createElement(tag);if(cls)n.className=cls;if(value!==undefined)n.textContent=text(value);return n;}
  function button(label,callback,cls='aw-button'){const b=node('button',cls,label);b.type='button';b.dataset.awAction=label;b.addEventListener('click',callback);return b;}
  function label(value,cls=''){return node('span','aw-badge '+cls,value);}
  function group(title){const n=node('section','aw-section');n.append(node('h4','aw-section-title',title));return n;}
  function disclosure(key,title,content){const d=node('details','aw-disclosure');d.dataset.disclosure=key;const s=node('summary','',title);d.append(s);let built=false;d.addEventListener('toggle',()=>{if(d.open&&!built){built=true;content(d);}});d.build=()=>{if(!built){built=true;content(d);}};return d;}
  function detailState(host){return new Map([...host.querySelectorAll('details[data-disclosure]')].map(d=>[d.dataset.disclosure,{open:d.open,scroll:d.querySelector('.aw-scroll')?.scrollTop||0,count:d.dataset.eventCount}]));}
  function restoreDetails(host,saved){for(const d of host.querySelectorAll('details[data-disclosure]')){const prior=saved.get(d.dataset.disclosure);if(prior?.open){if(prior.count)d.dataset.eventCount=prior.count;d.open=true;d.build?.();const scroll=d.querySelector('.aw-scroll');if(scroll)scroll.scrollTop=prior.scroll;}}}
  function asyncAction(b,action,onError){b.disabled=true;Promise.resolve().then(action).catch(e=>onError?.(e)).finally(()=>{if(b.isConnected)b.disabled=false;});}
  function fullReply(run){return text(run.response||run.output)||items(run.events).filter(e=>e.type==='assistant').map(e=>text(e.message||e.text||e.content)).join('\n\n');}
  function buildSteps(model){
    const section=group('制作步骤'),progress=node('div','aw-progress'),bar=node('span');
    bar.style.width=(model.total?model.complete/model.total*100:0)+'%';progress.append(bar);progress.setAttribute('role','progressbar');progress.setAttribute('aria-label','制作步骤');progress.setAttribute('aria-valuemin','0');progress.setAttribute('aria-valuemax',String(model.total));progress.setAttribute('aria-valuenow',String(model.complete));
    section.append(label(`${model.complete} / ${model.total}`),progress);
    const list=node('ol','aw-steps');for(const step of model.steps){const li=node('li','aw-step is-'+step.status);if(model.current?.id===step.id)li.setAttribute('aria-current','step');const mark=node('span','aw-step-mark',step.status==='completed'?'✓':step.status==='blocked'?'!':step.status==='in_progress'?'•':'');const copy=node('div');copy.append(node('span','aw-step-title',step.title));const state=node('span','aw-step-state',stepLabels[step.status]);li.append(mark,copy,state);list.append(li);}section.append(list);return section;
  }
  function buildChecks(model){
    const section=group('核验'),list=node('div','aw-check-list');
    for(const check of model.checks){const row=node('div','aw-check is-'+check.displayStatus);const name=node('span','',check.title||check.scope||'检查');const status=check.displayStatus==='passed'&&check.source==='model_review'?'抽帧评审通过':{passed:'有证据 · 通过',failed:'发现问题',not_run:'尚未执行',unverified:'待实际核验'}[check.displayStatus];row.append(name,label(status));const scope=[check.scope,check.reviewLimit,check.note].filter(Boolean).map(text).join(' · ');if(scope)row.append(node('small','aw-check-scope',scope));list.append(row);}section.append(list);
    if(!model.checks.length)section.append(node('p','aw-hint','尚未记录实际核验证据。完成制作与核验通过会分别显示。'));
    return section;
  }
  function buildArtifacts(model,run,callbacks){
    const section=group('本次成果'),grid=node('div','aw-artifacts');
    for(const artifact of model.artifacts){const item=node('div','aw-artifact');const copy=node('div','aw-artifact-copy');copy.append(node('strong','',artifact.title),node('span','',[kindLabels[artifact.kind]||'文件',stageLabels[artifact.stage]||'',artifact.verified?'有关联检查':'待核验'].filter(Boolean).join(' · ')));copy.title=text(artifact.path);item.append(copy);const actions=node('div','aw-artifact-actions');if(callbacks.canPreview?.(artifact,run)){const b=button('预览',()=>asyncAction(b,()=>callbacks.preview(artifact,run),callbacks.error));actions.append(b);}if(artifact.path){const b=button('路径',()=>asyncAction(b,()=>callbacks.copyPath(artifact,run),callbacks.error),'aw-button aw-button-subtle');b.title=text(artifact.path);actions.append(b);}item.append(actions);grid.append(item);}section.append(grid);return section;
  }
  function buildCandidates(run,callbacks){
    const section=group('选择制作方向'),list=node('div','aw-candidates');
    for(const candidate of items(run.candidates||run.plans)){const card=node('div','aw-candidate');card.append(node('strong','',candidate.title||candidate.name||'制作方案'),node('p','',candidate.summary||candidate.description||candidate.approach||''));if(candidate.tradeoffs)card.append(node('p','aw-hint',candidate.tradeoffs));const b=button('用这个方向 →',()=>asyncAction(b,()=>callbacks.selectCandidate(run,candidate),callbacks.error),'aw-button aw-button-primary');b.disabled=Boolean(callbacks.busy?.(run));card.append(b);list.append(card);}section.append(list);return section;
  }
  function buildLogs(run){
    const events=items(run.events);const d=disclosure('logs','执行记录 · '+events.length+' 条',container=>{
      const list=node('div','aw-log-list aw-scroll');let count=Number(container.dataset.eventCount)||80;
      const more=button('加载更早记录',()=>{count+=160;draw();},'aw-button aw-log-more');
      function draw(){container.dataset.eventCount=String(count);list.replaceChildren();const start=Math.max(0,events.length-count);more.hidden=start===0;more.textContent=`加载更早记录（还有 ${start} 条）`;for(const event of events.slice(start)){const row=node('div','aw-log-row');const time=event.time||event.timestamp||'';row.append(node('small','',String(time).replace('T',' ').slice(0,19)),node('span','',event.type||'记录'),node('pre','',text(event.message||event.text||event.content||event.tool||event.toolName||event.name)));const extras=Object.fromEntries(Object.entries(event).filter(([key])=>!['time','timestamp','type','message','text','content'].includes(key)));if(Object.keys(extras).length)row.append(node('pre','aw-event-data',text(extras)));list.append(row);}}
      container.append(more,list);draw();
    });return d;
  }
  function buildCard(run,callbacks){
    const model=normalize(run),card=node('article','aw-task is-'+model.status);card.dataset.runId=model.id;
    const top=node('div','aw-card-top');top.append(node('span','aw-kicker',run.provider==='dual'?'双模型 · 连续协作':run.provider==='claude'?'Claude · 创作任务':'ChatGPT · 创作任务'),label(model.hasUnfinished?model.statusLabel:callbacks.statusLabel?.(run)||model.statusLabel,'aw-state'));card.append(top,node('h3','aw-goal',model.title));
    if(model.goal!==model.title&&model.goal.length>model.title.length)card.append(node('p','aw-goal-context',model.goal));
    const progress=node('div','aw-current');progress.append(node('span','aw-current-dot'),node('p','',model.progress));card.append(progress);
    if(model.hasUnfinished)card.append(node('p','aw-hint','当前成果已保留。可在主输入框补充要求，继续完成这些步骤。'));
    if(model.steps.length)card.append(buildSteps(model));
    if(run.status==='awaiting_selection')card.append(buildCandidates(run,callbacks));
    if(model.artifacts.length)card.append(buildArtifacts(model,run,callbacks));
    if(model.checks.length||success.has(model.status))card.append(buildChecks(model));
    if(run.error){const error=node('div','aw-error');error.append(node('strong','','需要处理'),node('p','',short(run.error,260)));card.append(error);}
    const actions=node('div','aw-task-actions');
    if(run.canResume&&model.terminal){const b=button('继续制作',()=>asyncAction(b,()=>callbacks.resume(model.id),callbacks.error),'aw-button aw-button-primary');b.disabled=Boolean(callbacks.busy?.(run)||callbacks.hasActive?.(run.projectId));actions.append(b);if(callbacks.resumeHint)card.append(node('p','aw-hint',callbacks.resumeHint(run)));}
    if(!model.terminal&&run.status!=='cancelling'){const b=button('停止任务',()=>asyncAction(b,()=>callbacks.stop(model.id),callbacks.error));b.disabled=Boolean(callbacks.busy?.(run));actions.append(b);}
    if(actions.childElementCount)card.append(actions);
    const records=node('div','aw-records');
    if(run.prompt)records.append(disclosure('prompt','原始要求',d=>d.append(node('pre','aw-full-text aw-scroll',run.prompt))));
    if(model.summaryOnly){const b=button('读取完整制作记录',()=>asyncAction(b,()=>callbacks.load(model.id),callbacks.error),'aw-button aw-button-subtle');records.append(b);}
    else{
      if(model.hasResponse)records.append(disclosure('reply',model.terminal?'完整回复':'当前思路与完整回复',d=>d.append(node('pre','aw-full-text aw-scroll',fullReply(run)))));
      if(items(run.events).length)records.append(buildLogs(run));
      if(items(run.changedFiles).length)records.append(disclosure('files',`修改文件 · ${run.changedFiles.length} 项`,d=>{const list=node('div','aw-files aw-scroll');for(const f of run.changedFiles)list.append(node('code','',typeof f==='string'?f:f.path||f.name||f.relativePath));d.append(list);}));
    }
    card.append(records);return card;
  }
  function render({container,welcome,runs,projectId,callbacks={}}){
    let view=views.get(container);const ordered=items(runs).filter(r=>r.projectId===projectId).slice().sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
    const nearEnd=container.scrollHeight-container.scrollTop-container.clientHeight<90,scroll=container.scrollTop;
    if(!view||view.projectId!==projectId){for(const child of [...container.children])if(child!==welcome)child.remove();const stage=node('div','aw-current-tasks');const history=node('details','aw-history');const historySummary=node('summary'),historyList=node('div','aw-history-list');history.append(historySummary,historyList);container.append(stage,history);view={projectId,stage,history,historySummary,historyList,cards:new Map()};views.set(container,view);}
    welcome.hidden=ordered.length>0;
    const visibleIds=new Set(ordered.filter(r=>!terminal.has(r.status)||r.canResume).map(r=>String(r.id)));if(ordered.length)visibleIds.add(String(ordered.at(-1).id));
    const older=ordered.filter(r=>!visibleIds.has(String(r.id)));view.history.hidden=!older.length;view.historySummary.textContent=`过往创作 · ${older.length} 次`;
    const present=new Set();
    for(const run of ordered){const id=String(run.id),isHistory=!visibleIds.has(id);present.add(id);const signature=JSON.stringify([run,Boolean(callbacks.busy?.(run)),Boolean(callbacks.hasActive?.(run.projectId)),callbacks.mediaRevision?.()]);let entry=view.cards.get(id);
      if(entry&&entry.isHistory!==isHistory){entry.host.remove();view.cards.delete(id);entry=null;}
      if(!entry){const host=isHistory?node('details','aw-history-item'):node('div','aw-live-item');host.dataset.runId=id;entry={host,isHistory,signature:null};view.cards.set(id,entry);if(isHistory){const s=node('summary');entry.summary=s;entry.body=node('div','aw-history-body');host.append(s,entry.body);host.addEventListener('toggle',()=>{if(host.open){const latest=entry.run;entry.body.replaceChildren(buildCard(latest,entry.callbacks));if(latest.summaryOnly&&!entry.loading){entry.loading=true;Promise.resolve(callbacks.load?.(id)).catch(callbacks.error).finally(()=>entry.loading=false);}}});}}
      entry.run=run;entry.callbacks=callbacks;
      if(signature!==entry.signature){const target=isHistory?entry.body:entry.host;const saved=detailState(target),focused=target.contains(root.document.activeElement)?root.document.activeElement:null;const focusKey=focused?.dataset.awAction,focusDisclosure=focused?.tagName==='SUMMARY'?focused.parentElement?.dataset.disclosure:null;if(isHistory){const m=normalize(run);entry.summary.replaceChildren(node('span','',m.title),node('small','',m.hasUnfinished?m.statusLabel:callbacks.statusLabel?.(run)||m.statusLabel));}
        if(!isHistory||entry.host.open){target.replaceChildren(buildCard(run,callbacks));restoreDetails(target,saved);if(focusKey)[...target.querySelectorAll('[data-aw-action]')].find(b=>b.dataset.awAction===focusKey)?.focus({preventScroll:true});else if(focusDisclosure)[...target.querySelectorAll('details[data-disclosure]')].find(d=>d.dataset.disclosure===focusDisclosure)?.querySelector('summary')?.focus({preventScroll:true});}entry.signature=signature;
      }
      const destination=isHistory?view.historyList:view.stage;if(entry.host.parentElement!==destination)destination.append(entry.host);
    }
    for(const[id,entry]of view.cards)if(!present.has(id)){entry.host.remove();view.cards.delete(id);}
    container.scrollTop=nearEnd?container.scrollHeight:scroll;
  }
  const api={normalize,progressText,checkState,render};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(root.document){root.AgentWorkspace=api;root.dispatchEvent?.(new root.Event('agent-workspace:ready'));}
})(typeof window!=='undefined'?window:globalThis);
