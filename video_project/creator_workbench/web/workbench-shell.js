(() => {
  'use strict';
  const wb=window.Workbench;
  const workspace=document.querySelector('.workspace');
  if(!wb||!workspace)return;
  const compact=matchMedia('(max-width:1100px)');
  const key=()=>`rainbow-workbench:view:v3:${compact.matches?'compact':'desktop'}`;
  const node=(tag,cls,label)=>{const n=document.createElement(tag);n.className=cls;if(label)n.textContent=label;return n;};
  const toolbar=node('div','workspace-tools');
  const library=node('button','workspace-library-toggle','作品与资源');
  library.type='button';library.setAttribute('aria-expanded','false');
  const views=node('div','workspace-views');views.setAttribute('role','group');views.setAttribute('aria-label','工作区视图');
  const hint=node('span','workspace-view-hint','同一工程 · 统一创作');
  const reset=node('button','workspace-reset','还原布局');reset.type='button';
  const briefButton=node('button','workspace-brief-button','制作简报');briefButton.type='button';
  toolbar.append(library,views,hint,briefButton,reset);
  workspace.before(toolbar);
  function read(){let mode;try{mode=localStorage.getItem(key());}catch{}return ['create','balanced','preview'].includes(mode)?mode:compact.matches?'create':'balanced';}
  function setView(mode,persist=true){
    if(!['create','balanced','preview'].includes(mode))return;
    if(compact.matches&&mode==='balanced')mode='create';
    document.body.dataset.workspaceView=mode;
    for(const b of views.children){b.setAttribute('aria-pressed',String(b.dataset.view===mode));b.classList.toggle('active',b.dataset.view===mode);}
    if(persist)try{localStorage.setItem(key(),mode);}catch{}
    window.dispatchEvent(new Event('resize'));
    window.StudioTimeline?.refreshMarkers?.();
  }
  function setLibrary(open){document.body.classList.toggle('library-drawer-open',open);library.setAttribute('aria-expanded',String(open));if(open)document.querySelector('#library-search')?.focus({preventScroll:true});}
  for(const [mode,label]of [['create','工作台'],['balanced','双栏协作'],['preview','成片预览']]){
    const b=node('button','',label);b.type='button';b.dataset.view=mode;b.onclick=()=>setView(mode);views.append(b);
  }
  library.onclick=()=>setLibrary(!document.body.classList.contains('library-drawer-open'));
  document.getElementById('mobile-resources-button')?.addEventListener('click',()=>setLibrary(true));
  document.addEventListener('keydown',e=>{if(e.key==='Escape')setLibrary(false);});
  document.addEventListener('pointerdown',e=>{if(compact.matches&&!e.target.closest('.library,.workspace-library-toggle,#mobile-resources-button'))setLibrary(false);});
  window.addEventListener('workbench:project',()=>setLibrary(false));
  window.addEventListener('studio:module',()=>{if(compact.matches)setView('create');});
  window.addEventListener('studio:agent-open',()=>{if(document.body.dataset.workspaceView==='preview')setView('create');});
  window.addEventListener('workbench:preview-request',event=>{if(event.detail?.projectId!==wb.getProject()?.id)return;if(document.body.dataset.workspaceView==='create')setView(compact.matches?'preview':'balanced');});
  reset.onclick=()=>{window.WorkspaceInteractions?.resetLayout();setView(compact.matches?'create':'balanced');wb.toast('已还原工作区布局，草稿与播放位置保留');};
  compact.addEventListener('change',()=>{setLibrary(false);setView(read(),false);});
  const briefFields=[['question','这期要讲清什么','用一句话说明观众看完能理解的问题。',600],['audience','讲给谁听','例如：大众、初学者；哪些知识需要先解释。',300],['story','故事主线','从什么现象开始，遇到什么问题，怎样一步步揭开答案。',1800],['visual','画面与声音方向','主体、运镜、材质、配音和音乐的具体偏好。',1400],['keep','保留与避免','已有哪部分要保留，哪些历史问题这次不能再出现。',1400]];
  const draftKey=pid=>'rainbow-workbench:production-brief:'+pid;
  async function openBrief(){
    const project=wb.getProject();if(!project){wb.toast('请先选择工程');return;}
    briefButton.disabled=true;
    try{
      const data=await wb.api('/api/studio/action',{method:'POST',body:{action:'production.read',projectId:project.id}});
      if(wb.getProject()?.id!==project.id)return;
      let draft;try{draft=JSON.parse(localStorage.getItem(draftKey(project.id))||'null');}catch{}
      const saved=data.brief||{},values=draft?.values||saved;
      const dialog=node('dialog','production-brief-dialog'),form=node('form',''),head=node('div','dialog-heading'),title=node('h2','','这一期的制作简报'),close=node('button','icon-button','×');close.type='button';close.setAttribute('aria-label','关闭制作简报');close.onclick=()=>dialog.close();head.append(title,close);
      const description=node('p','brief-description',`${project.displayName||project.title||project.name} · 后续任务自动参考，当前运行任务的目标保持不变。`);
      const status=node('p','brief-status',draft?'已恢复本工程未保存的简报。':'留空的部分由当前任务补充，不强制套用固定路线。');status.setAttribute('role','status');
      const inputs={};
      form.append(head,description,status);
      for(const [id,label,placeholder,max]of briefFields){const wrap=node('label','brief-field',label),input=node(id==='audience'?'input':'textarea','');input.value=values[id]||'';input.placeholder=placeholder;input.maxLength=max;if(input.tagName==='TEXTAREA')input.rows=id==='story'?3:2;inputs[id]=input;wrap.append(input);form.append(wrap);}
      const durationLabel=node('label','brief-field','目标时长（秒，可留空）'),duration=node('input','');duration.type='number';duration.min='1';duration.max='86400';duration.value=values.durationSec??'';duration.placeholder='随内容调整，例如 300';inputs.durationSec=duration;durationLabel.append(duration);form.append(durationLabel);
      const buttons=node('div','dialog-actions'),cancel=node('button','secondary-button','稍后继续'),submit=node('button','primary-button','保存制作简报');cancel.type='button';cancel.onclick=()=>dialog.close();submit.type='submit';buttons.append(cancel,submit);form.append(buttons);dialog.append(form);document.body.append(dialog);
      const gather=()=>Object.fromEntries(Object.entries(inputs).map(([id,input])=>[id,id==='durationSec'?(input.value===''?null:Number(input.value)):input.value]));
      let revision=draft?.revision??saved.revision;
      form.addEventListener('input',()=>{try{localStorage.setItem(draftKey(project.id),JSON.stringify({revision,values:gather()}));}catch{}status.textContent='简报草稿已保留，保存后用于后续任务。';});
      form.addEventListener('submit',async e=>{e.preventDefault();submit.disabled=true;try{const result=await wb.api('/api/studio/action',{method:'POST',body:{action:'production.save',projectId:project.id,brief:gather(),revision}});try{localStorage.removeItem(draftKey(project.id));}catch{}dialog.close();wb.toast(result.message||'制作简报已保存');}catch(error){status.textContent=error.message;status.classList.add('error');if(!form.querySelector('.brief-reload')){const reload=node('button','secondary-button brief-reload','读取最新简报并合并');reload.type='button';reload.onclick=async()=>{try{const latest=await wb.api('/api/studio/action',{method:'POST',body:{action:'production.read',projectId:project.id}});revision=latest.brief.revision;try{localStorage.setItem(draftKey(project.id),JSON.stringify({revision,values:gather()}));}catch{}let details=form.querySelector('.brief-latest');if(!details){details=node('details','brief-latest');details.append(node('summary','','另一窗口的最新内容'),node('pre',''));form.insertBefore(details,buttons);}details.querySelector('pre').textContent=briefFields.map(([id,label])=>label+'：'+(latest.brief[id]||'')).join('\n\n');details.open=true;status.textContent='你的输入保留在上方；请对照最新内容后保存。';}catch(e){status.textContent=e.message;}};buttons.prepend(reload);}}finally{submit.disabled=false;}});
      dialog.onclose=()=>dialog.remove();dialog.showModal();inputs.question.focus();
    }catch(error){wb.toast(error.message);}finally{briefButton.disabled=false;}
  }
  briefButton.onclick=openBrief;
  window.WorkbenchShell={setView};
  setView(read(),false);
})();
