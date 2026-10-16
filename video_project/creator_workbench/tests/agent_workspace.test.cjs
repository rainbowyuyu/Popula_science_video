/* Local DOM and transport fixtures; no browser sessions, media writes, or model calls. */
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');

class Element {
  constructor(tag,doc){this.tagName=tag.toUpperCase();this.ownerDocument=doc;this.children=[];this.dataset={};this.style={};this.attributes={};this.listeners={};this.className='';this._text='';this.open=false;this.hidden=false;this.scrollTop=0;this.scrollHeight=300;this.clientHeight=200;}
  append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;this.children.push(n);}}
  remove(){if(this.parentElement){const p=this.parentElement;p.children=p.children.filter(n=>n!==this);this.parentElement=null;}}
  replaceChildren(...nodes){for(const n of this.children)n.parentElement=null;this.children=[];this._text='';this.append(...nodes);}
  get childElementCount(){return this.children.length;}
  set textContent(value){this.replaceChildren();this._text=String(value);}
  get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}
  setAttribute(key,value){this.attributes[key]=String(value);}
  getAttribute(key){return this.attributes[key];}
  addEventListener(type,handler){(this.listeners[type]??=[]).push(handler);}
  dispatchEvent(event){for(const fn of this.listeners[event.type]||[])fn(event);}
  click(){this.dispatchEvent({type:'click',target:this});}
  contains(n){return n===this||this.children.some(c=>c.contains(n));}
  get isConnected(){return this.ownerDocument.body.contains(this);}
  focus(){this.ownerDocument.activeElement=this;}
  matches(selector){
    if(selector.startsWith('.'))return this.className.split(' ').includes(selector.slice(1));
    const match=selector.match(/^([a-z]+)?(?:\[data-([a-z-]+)\])?$/i);
    if(!match)return false;
    const key=match[2]?.replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
    return (!match[1]||this.tagName===match[1].toUpperCase())&&(!key||key in this.dataset);
  }
  querySelectorAll(selector){const result=[];for(const c of this.children){if(c.matches(selector))result.push(c);result.push(...c.querySelectorAll(selector));}return result;}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const doc={createElement(tag){return new Element(tag,this);},activeElement:null};doc.body=new Element('body',doc);
global.window={document:doc,dispatchEvent(){},Event:class{constructor(type){this.type=type;}}};
const workspace=require('../web/agent-workspace.js');
function setup(){const container=doc.createElement('div'),welcome=doc.createElement('section');container.append(welcome);doc.body.append(container);return {container,welcome,projectId:'project-a',callbacks:{}};}
function run(overrides={}){return {id:'r1',projectId:'project-a',createdAt:'2026-10-16T09:00:00',status:'running',prompt:'把开场改得更有故事性',provider:'dual',events:[],phases:[],...overrides};}
function open(d){d.open=true;d.dispatchEvent({type:'toggle'});}
function findDisclosure(container,id){return container.querySelectorAll('details[data-disclosure]').find(d=>d.dataset.disclosure===id);}
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('old phases remain useful and never invent completed work',()=>{
  const model=workspace.normalize(run({phase:'animate',phases:[{id:'plan',title:'联合规划',status:'completed'},{id:'animate',title:'运镜和画面',status:'running'},{id:'qa',title:'复核',status:'pending'}]}));
  assert.equal(model.complete,1);assert.equal(model.total,3);assert.equal(model.current.id,'animate');assert.equal(model.steps[2].status,'pending');
  assert.equal(workspace.normalize(run({phases:[{id:'waiting',status:'pending'}]})).current,undefined);
});
test('a claimed pass requires actual evidence, and listening remains unverified',()=>{
  for(const entry of [{status:'passed'},{status:'passed',source:'tool_evidence',evidenceIds:[]},{status:'passed',source:'model_report',evidenceIds:['x']},{status:'passed',kind:'listening',source:'tool_evidence',evidenceIds:['x']}])assert.equal(workspace.checkState(entry),'unverified');
  assert.equal(workspace.checkState({status:'passed',source:'tool_evidence',evidenceIds:['probe'],kind:'automatic'}),'passed');
  assert.equal(workspace.checkState({status:'passed',source:'model_review',evidenceIds:['actual-frame'],kind:'sampled_frames'}),'passed');
});
test('main card folds full prompt, replies and raw tools while retaining access',()=>{
  const fixture=setup();workspace.render({...fixture,runs:[run({response:'LONG_MODEL_REPLY_UNIQUE',events:[{type:'tool',message:'调用 inspect_frame',arguments:'FULL_RAW_TOOL_UNIQUE'}]})]});
  assert.equal(fixture.container.querySelectorAll('.aw-task').length,1);
  assert.ok(!fixture.container.textContent.includes('LONG_MODEL_REPLY_UNIQUE'));
  assert.ok(!fixture.container.textContent.includes('FULL_RAW_TOOL_UNIQUE'));
  open(findDisclosure(fixture.container,'reply'));open(findDisclosure(fixture.container,'logs'));
  assert.ok(fixture.container.textContent.includes('LONG_MODEL_REPLY_UNIQUE'));
  assert.ok(fixture.container.textContent.includes('FULL_RAW_TOOL_UNIQUE'));
});
test('foreign and unscoped runs do not leak into the selected project',()=>{
  const fixture=setup();workspace.render({...fixture,runs:[run(),run({id:'foreign',projectId:'project-b',prompt:'OTHER_PROJECT'}),run({id:'unscoped',projectId:undefined,prompt:'UNSCOPED'})]});
  assert.equal(fixture.container.querySelectorAll('.aw-task').length,1);assert.ok(!fixture.container.textContent.includes('OTHER_PROJECT'));assert.ok(!fixture.container.textContent.includes('UNSCOPED'));
});
test('older history loads full data only when the user expands that task',async()=>{
  const fixture=setup(),loaded=[];fixture.callbacks.load=async id=>loaded.push(id);
  workspace.render({...fixture,runs:[run({id:'old',status:'completed',summaryOnly:true}),run({id:'new',createdAt:'2026-10-16T10:00:00'})]});
  assert.equal(loaded.length,0);const history=fixture.container.querySelector('.aw-history');assert.equal(history.open,false);assert.equal(fixture.container.querySelectorAll('.aw-task').length,1);
  open(history);assert.equal(loaded.length,0);open(fixture.container.querySelector('.aw-history-item'));await tick();assert.deepEqual(loaded,['old']);
});
test('continued polling retains expanded records, earlier events, scroll and keyboard focus',()=>{
  const fixture=setup();const events=Array.from({length:250},(_,i)=>({type:'tool',message:'event '+i}));const task=run({events});workspace.render({...fixture,runs:[task]});
  open(findDisclosure(fixture.container,'logs'));fixture.container.querySelector('.aw-log-more').click();
  const logs=findDisclosure(fixture.container,'logs');logs.querySelector('.aw-scroll').scrollTop=97;logs.querySelector('summary').focus();
  workspace.render({...fixture,runs:[{...task,events:[...events,{type:'status',message:'下一步'}]}]});
  const updated=findDisclosure(fixture.container,'logs');assert.equal(updated.open,true);assert.equal(updated.dataset.eventCount,'240');assert.equal(updated.querySelector('.aw-scroll').scrollTop,97);assert.equal(doc.activeElement,updated.querySelector('summary'));assert.equal(updated.querySelectorAll('.aw-log-row').length,240);
});
test('candidate selection, resume, stop and preview remain explicit user actions',async()=>{
  const fixture=setup(),actions=[];fixture.callbacks={selectCandidate:async(r,c)=>actions.push('candidate:'+c.id),resume:async id=>actions.push('resume:'+id),stop:async id=>actions.push('stop:'+id),canPreview:()=>true,preview:async()=>actions.push('preview')};
  workspace.render({...fixture,runs:[run({status:'awaiting_selection',candidates:[{id:'a',title:'电影开场'}]})]});
  assert.deepEqual(actions,[]);fixture.container.querySelector('.aw-button-primary').click();await tick();assert.deepEqual(actions,['candidate:a']);
  workspace.render({...fixture,runs:[run({status:'paused',canResume:true})]});fixture.container.querySelector('.aw-button-primary').click();await tick();assert.equal(actions.at(-1),'resume:r1');
  workspace.render({...fixture,runs:[run({creativeWork:{artifacts:[{id:'v',path:'output/master.mp4',kind:'video',title:'视频',exists:true}]}})]});
  const buttons=fixture.container.querySelectorAll('button');buttons.find(b=>b.textContent==='预览').click();await tick();assert.equal(actions.at(-1),'preview');buttons.find(b=>b.textContent==='停止任务').click();await tick();assert.equal(actions.at(-1),'stop:r1');
});
test('frame checks visibly retain scope and do not claim whole-film acceptance',()=>{
  const fixture=setup();workspace.render({...fixture,runs:[run({status:'completed',creativeWork:{checks:[{id:'c',title:'字幕避让',kind:'sampled_frames',status:'passed',source:'model_review',evidenceIds:['f'],scope:'开场第 80 帧',reviewLimit:'仅检查已抽取的画面，不代表整片验收'}]}})]});
  assert.ok(fixture.container.textContent.includes('抽帧评审通过'));assert.ok(fixture.container.textContent.includes('开场第 80 帧'));assert.ok(fixture.container.textContent.includes('不代表整片验收'));
});

const appSource=fs.readFileSync(path.join(__dirname,'../web/app.js'),'utf8');
function sourceFunction(name,next){const a=appSource.indexOf(name),b=appSource.indexOf(next,a+name.length);assert.ok(a>=0&&b>a);return appSource.slice(a,b);}
test('finished tasks refresh media without reloading video, image, or audio preview',async()=>{
  const body=sourceFunction('async function loadMedia(','\nfunction updateMediaCaption');
  for(const kind of ['video','image','audio']){
    const selected={id:'watched',kind,url:'/api/media/watched'},state={projectId:'project-a',preview:{id:'watched',kind,projectId:'project-a'},selectedMedia:selected,mediaRequest:0,latestCache:new Map(),media:[],mediaScope:'latest'};
    let swaps=0,clears=0,renders=0;const context={state,AbortController,URLSearchParams,api:async()=>({items:[{id:'new',kind:'video'}]}),array:v=>v,mediaKind:m=>m.kind,$:()=>({}),renderMedia:()=>renders++,selectMedia:()=>swaps++,clearPreview:()=>clears++,valueId:v=>v.id};vm.createContext(context);vm.runInContext(body,context);await context.loadMedia({refresh:true,updatePreview:false});
    assert.equal(swaps,0);assert.equal(clears,0);assert.equal(renders,1);assert.equal(state.selectedMedia,selected);assert.equal(state.media[0].id,'new');
  }
  assert.ok(appSource.includes("loadMedia({scope:'latest',refresh:true,preserve:true,updatePreview:false})"));
});
test('submission merges active module context then explicit pending marks and body overrides',async()=>{
  const body=sourceFunction('async function startTask(body)','\nasync function trackRun');let payload;
  const state={projectId:'project-a',pendingSubmissions:new Map(),submitting:new Set(),skillIds:new Set(),module:'creative',pendingContext:{startSec:12,marker:'explicit'},media:[],runs:new Map()};
  const context={state,crypto:{randomUUID:()=> 'fixture-id'},window:{StudioUI:{getContext:()=>({module:'motion',startSec:3,motion:{shot:'orbit'}})}},$:id=>({value:id==='prompt'?'test':'',checked:true}),providerId:()=> 'dual',roleAssignments:()=>({}),getEditingContext:()=>({mediaId:'watched'}),api:async(p,o)=>{payload=o.body;return {id:'r'};},activeForProject:()=>null,persistPending(){},syncRunUI(){},showError(){},bumpRun(){},renderPromptContext(){},saveDraft(){},renderConversation(){},renderLibrary(){},remember(){},pollRun(){},isTerminal:()=>false,CustomEvent:class{}};
  context.window.dispatchEvent=()=>{};vm.createContext(context);vm.runInContext(body,context);await context.startTask({projectId:'project-a',prompt:'test',context:{explicitBody:true}});
  assert.equal(payload.context.module,'motion');assert.equal(payload.context.startSec,12);assert.equal(payload.context.motion.shot,'orbit');assert.equal(payload.context.marker,'explicit');assert.equal(payload.context.explicitBody,true);assert.equal(payload.context.projectId,'project-a');
});

test('explicit preview emits a view request even for the already selected asset; automatic loading does not',()=>{
  const body=sourceFunction('function selectMedia(','\nasync function loadMediaProbe');const events=[];
  const item={id:'video-a',kind:'video',url:'/api/media/video-a'};
  const state={projectId:'project-a',preview:{projectId:'project-a',id:'video-a',kind:'video',url:item.url,fingerprint:'v1'}};
  const context={state,valueId:i=>i.id,mediaKind:i=>i.kind,safeMediaUrl:i=>i.url,mediaFingerprint:()=> 'v1',updateMediaCaption(){},renderMedia(){},window:{dispatchEvent:e=>events.push(e)},CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}}};
  vm.createContext(context);vm.runInContext(body,context);context.selectMedia(item);assert.equal(events.length,0);context.selectMedia(item,{reveal:true});assert.equal(events.length,1);assert.equal(events[0].type,'workbench:preview-request');assert.equal(events[0].detail.projectId,'project-a');assert.equal(events[0].detail.mediaId,'video-a');
  assert.ok(appSource.includes('selectMedia:(item,options={})=>selectMedia(item,{reveal:true,...options})'));
});

test('deferred asset order and ready bridge cover app loading before the task card component',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../web/index.html'),'utf8');
  const scripts=[...html.matchAll(/<script src="([^"]+)" defer>/g)].map(m=>m[1]);
  assert.ok(scripts.indexOf('/app.js')<scripts.indexOf('/agent-workspace.js'));
  assert.ok(scripts.indexOf('/module-feedback.js')<scripts.indexOf('/studio.js'));
  assert.equal(scripts.at(-1),'/workbench-shell.js');
  const handler=appSource.match(/window\.addEventListener\('agent-workspace:ready',[^\n]+/)[0];let draw=0,sync=0,ready;
  const context={window:{addEventListener:(name,fn)=>ready=fn},renderConversation:()=>draw++,syncRunUI:()=>sync++};vm.createContext(context);vm.runInContext(handler,context);ready();assert.equal(draw,1);assert.equal(sync,1);
  assert.ok(appSource.includes('if(!window.AgentWorkspace)return;'));
});

test('module feedback updates keep a playing media node and its connected parent unchanged',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../web/module-feedback.js'),'utf8');const context={window:{},document:doc,location:{origin:'http://127.0.0.1:8765'},URL};vm.createContext(context);vm.runInContext(source,context);
  const host=doc.createElement('div');doc.body.append(host);const result={status:'running',output:{url:'/api/media/a',kind:'video',path:'output/master.mp4'}};
  context.window.ModuleFeedback.render(host,result,{action:'job.get'});
  const card=host.querySelector('.module-result-card'),media=host.querySelector('.studio-job-preview'),parent=media.parentElement;media.currentTime=17;media.paused=false;
  host.replaceChildren=()=>{throw new Error('feedback detached its connected media card');};media.remove=()=>{throw new Error('feedback detached the active media element');};
  context.window.ModuleFeedback.render(host,{...result,status:'completed',message:'检查结束'},{action:'job.get'});
  assert.equal(host.querySelector('.module-result-card'),card);assert.equal(host.querySelector('.studio-job-preview'),media);assert.equal(media.parentElement,parent);assert.equal(media.currentTime,17);assert.equal(media.paused,false);assert.ok(host.textContent.includes('检查结束'));
});

test('module feedback rejects external URLs and deceptive local endpoint prefixes',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../web/module-feedback.js'),'utf8');const context={window:{},document:doc,location:{origin:'http://127.0.0.1:8765'},URL};vm.createContext(context);vm.runInContext(source,context);
  for(const url of ['https://other.example/video.mp4','/api/mediaevil/video.mp4']){const host=doc.createElement('div');doc.body.append(host);context.window.ModuleFeedback.render(host,{output:{url,kind:'video'}});assert.equal(host.querySelector('.studio-job-preview'),null);}
});

test('registered artifact preview preserves the same backend version as media lists',()=>{
  const body=sourceFunction('function artifactMedia(','\nasync function selectCandidate');const registered={id:'media-x',url:'/api/media/media-x?v=1792137600123456700-400',modified:1792137600.1234567,kind:'video',size:400};
  const context={state:{projectId:'project-a',media:[]},location:{origin:'http://127.0.0.1:8765'},URL};vm.createContext(context);vm.runInContext(body,context);
  const artifact={mediaId:'media-x',kind:'video',exists:true,title:'最终视频',path:'output/versions/v2/master.mp4',media:registered};
  const preview=context.artifactMedia(artifact,{projectId:'project-a'});assert.equal(preview.url,registered.url);assert.equal(preview.modified,registered.modified);assert.equal(preview.relativePath,artifact.path);
  assert.equal(context.artifactMedia({...artifact,media:{...registered,url:'https://evil.example/api/media/media-x'}},{projectId:'project-a'}),null);
  assert.equal(context.artifactMedia(artifact,{projectId:'project-b'}),null);
});

test('a finished model round with unfinished creative steps retains truthful pending work',()=>{
  const fixture=setup();fixture.callbacks.statusLabel=()=> '已完成';let actions=0;fixture.callbacks.resume=()=>actions++;
  const task=run({status:'completed',creativeWork:{planSource:'model',steps:[{id:'a',title:'故事结构',status:'completed'},{id:'b',title:'开场运镜',status:'in_progress'},{id:'c',title:'音乐衔接',status:'pending'},{id:'d',title:'全片检查',status:'blocked'}],artifacts:[{id:'v',title:'开场预览',path:'output/preview.mp4',kind:'video'}]}});
  const model=workspace.normalize(task);assert.equal(model.hasUnfinished,true);assert.equal(model.status,'completed');assert.equal(model.remaining.length,3);assert.equal(model.steps[1].status,'in_progress');assert.equal(model.steps[2].status,'pending');assert.equal(model.steps[3].status,'blocked');
  workspace.render({...fixture,runs:[task]});assert.equal(fixture.container.querySelector('.aw-state').textContent,'本轮结束 · 仍有待办');assert.ok(fixture.container.textContent.includes('还有 3 项待办：开场运镜、音乐衔接等。'));assert.ok(fixture.container.textContent.includes('可在主输入框补充要求'));assert.equal(actions,0);assert.equal(task.status,'completed');
  assert.equal(workspace.normalize(run({status:'completed',creativeWork:{planSource:'model',steps:[{id:'done',status:'completed'},{id:'skip',status:'skipped'}]}})).hasUnfinished,false);
  assert.equal(workspace.normalize(run({status:'completed',creativeWork:{planSource:'phases',steps:[{id:'legacy',status:'pending'}]}})).hasUnfinished,false);
});
