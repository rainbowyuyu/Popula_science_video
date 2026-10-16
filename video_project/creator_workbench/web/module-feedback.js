(() => {
  'use strict';
  const labels={queued:'已排队',pending:'等待执行',running:'正在处理',submitted:'已提交',completed:'已完成',succeeded:'已完成',failed:'需要处理',error:'需要处理',cancelled:'已停止',interrupted:'已中断',submission_unknown:'提交状态待核对',detached:'等待重新连接',needs_review:'待检查'};
  const titles={'tts.generate':'配音任务','audio.mix':'混音任务','subtitles.save':'字幕已保存','copy.save':'文案已保存','camera.save':'镜头预设已保存','qwen.generate':'视频素材任务','timeline.replace':'片段替换','structure.scan':'目录检查','structure.apply':'目录导航已建立','cleanup.scan':'清理候选','cleanup.apply':'文件整理','cover.from_file':'封面已登记','job.get':'媒体任务'};
  const el=(tag,cls,text)=>{const n=document.createElement(tag);n.className=cls||'';if(text!==undefined)n.textContent=String(text);return n;};
  const local=url=>{if(typeof url!=='string')return null;try{const u=new URL(url,location.origin);return u.origin===location.origin&&/^\/api\/(media|music|studio)(\/|$)/.test(u.pathname)?u.href:null;}catch{return null;}};
  function render(host,value,{action='',error=false,onCancel,onRetry}={}){
    if(!host)return;
    const result=value&&typeof value==='object'?value:{};
    const raw=JSON.stringify(value,null,2);
    const failed=error||['failed','error','submission_unknown'].includes(result.status)||Boolean(result.error);
    const stamp=JSON.stringify([raw,action,error,Boolean(onCancel),Boolean(onRetry)]);
    if(host._moduleFeedback===stamp)return;
    host._moduleFeedback=stamp;
    // Keep the card, media node and their connection to the document stable.
    // Moving the same <video> into a newly built card can still pause playback.
    let card=host.querySelector('.module-result-card');
    if(!card){card=el('section','module-result-card');card.append(el('div','module-result-content'),el('div','module-result-media'),el('div','module-result-details'),el('div','module-result-actions'));host.replaceChildren(card);}
    card.className=`module-result-card${failed?' failed':''}`;
    const content=card.querySelector('.module-result-content'),mediaHost=card.querySelector('.module-result-media'),detailHost=card.querySelector('.module-result-details'),actionHost=card.querySelector('.module-result-actions');
    const opened=detailHost.querySelector('details')?.open,detailScroll=detailHost.querySelector('pre')?.scrollTop||0;
    const oldMedia=mediaHost.querySelector('.studio-job-preview');
    const top=el('div','module-result-top');
    const title=failed?'这一步需要处理':titles[action]||result.name||'操作反馈';
    top.append(el('strong','',title),el('span','',labels[result.status]||(error?'未完成':result.jobId||result.taskId?'等待结果':'已返回')));
    content.replaceChildren(top);
    const message=typeof value==='string'?value:result.error||result.message||result.summary;
    if(message)content.append(el('p','module-result-message',typeof message==='string'?message:JSON.stringify(message)));
    else if(result.jobId||result.taskId)content.append(el('p','module-result-message','进度保存在当前工程，完成后可查看实际产物。'));
    const path=result.output?.relativePath||result.output?.path||result.relativePath||result.path;
    if(path)content.append(el('code','module-result-path',path));
    const url=local(result.output?.url);
    if(url){
      const type=result.output?.kind||result.output?.type||result.kind||'';
      const ext=String(path||url).split('?')[0];
      const tag=/image|cover/.test(type)||/\.(png|jpe?g|webp)$/i.test(ext)?'img':/video|replace/.test(type)||/\.(mp4|webm|mov)$/i.test(ext)?'video':'audio';
      const media=oldMedia?.src===url&&oldMedia.tagName.toLowerCase()===tag?oldMedia:el(tag,'studio-job-preview');
      if(media!==oldMedia){media.src=url;if(tag==='img'){media.alt='本次操作产物';media.loading='lazy';}else{media.controls=true;media.preload='metadata';}mediaHost.replaceChildren(media);}
    }else if(oldMedia)mediaHost.replaceChildren();
    detailHost.replaceChildren();
    if(typeof value==='object'&&value!==null){const details=el('details',''),summary=el('summary','','查看文件与技术详情'),pre=el('pre','',raw);details.open=Boolean(opened);details.append(summary,pre);detailHost.append(details);pre.scrollTop=detailScroll;}
    actionHost.replaceChildren();
    if(onCancel||onRetry){const actions=el('div','studio-actions');for(const [label,fn]of [['停止任务',onCancel],['重新连接进度',onRetry]])if(fn){const b=el('button','studio-button soft',label);b.type='button';b.onclick=fn;actions.append(b);}actionHost.append(actions);}
  }
  window.ModuleFeedback={render};
})();
