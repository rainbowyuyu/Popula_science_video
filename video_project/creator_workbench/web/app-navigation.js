/* Normal same-tab navigation keeps native history, draft persistence and accessibility. */
(()=>{
 'use strict';
 const root=document.documentElement,key='rainbow-workbench:navigation';
 const surface=url=>new URL(url,location.href).pathname==='/learning.html'?'learn':'create';
 const direction=(from,to)=>surface(from)===surface(to)?null:surface(to)==='learn'?'forward':'back';
 const remember=url=>{const value=direction(location.href,url);if(!value)return;root.dataset.navDirection=value;try{sessionStorage.setItem(key,JSON.stringify({to:surface(url),direction:value,at:Date.now()}));}catch{}};
 const go=url=>{const next=new URL(url,location.href);if(next.origin!==location.origin)return;remember(next.href);location.assign(next.href);};
 const bindLinks=()=>document.querySelectorAll('.app-navigation a,.app-header .brand').forEach(link=>link.addEventListener('click',event=>{
  if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
  if(surface(link.href)===surface(location.href)){event.preventDefault();return;}
  remember(link.href);
 }));
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bindLinks,{once:true});else bindLinks();
 let pending=null,revealed=false,entering=false;
 const motionAllowed=()=>!matchMedia('(prefers-reduced-motion: reduce)').matches;
 const enter=()=>{if(entering||!root.dataset.navDirection||!motionAllowed())return;entering=true;root.classList.add('app-navigation-enter');};
 document.addEventListener('animationend',event=>{if(event.animationName!=='app-surface-in')return;root.classList.remove('app-navigation-enter');entering=false;});
 document.addEventListener('animationcancel',event=>{if(event.animationName!=='app-surface-in')return;root.classList.remove('app-navigation-enter');entering=false;});
 try{pending=JSON.parse(sessionStorage.getItem(key)||'null');sessionStorage.removeItem(key);}catch{}
 if(pending&&pending.to===surface(location.href)&&Date.now()-pending.at<15000){root.dataset.navDirection=pending.direction;if(!('onpagereveal' in window))enter();}
 window.addEventListener('pageswap',event=>{
  const target=event.activation?.entry?.url;if(target){const value=direction(location.href,target);if(value)root.dataset.navDirection=value;}
  // Chromium may skip a transition during history restoration or viewport changes.
  // Its promises reject in that case; navigation and the saved drafts remain valid.
  event.viewTransition?.ready.catch(()=>{});event.viewTransition?.finished.catch(()=>{});event.viewTransition?.updateCallbackDone?.catch(()=>{});
 });
 window.addEventListener('pagereveal',event=>{
  revealed=true;const from=window.navigation?.activation?.from?.url;if(from){const value=direction(from,location.href);if(value)root.dataset.navDirection=value;}
  if(event.viewTransition){event.viewTransition.ready.catch(enter);event.viewTransition.finished.catch(()=>{});event.viewTransition.updateCallbackDone?.catch(()=>{});}else enter();
 });
 window.addEventListener('pageshow',event=>{if(!revealed||event.persisted)enter();});
 window.addEventListener('pagehide',()=>{root.classList.remove('app-navigation-enter');entering=false;revealed=false;});
 window.WorkbenchNavigation={go};
})();
