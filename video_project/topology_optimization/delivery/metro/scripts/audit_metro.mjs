import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';

// Independent Three.js audit, with no writes to the render_metro bundle/cache.
// node scripts/audit_metro.mjs --build-only
// node scripts/audit_metro.mjs
// --frames=0,500 --modes=direct,sequential,shuffled --out=tmp/metro-audit
// --dense renders all intervening frames for the sequential mode.
// --endpoint-step=30 checks flow-loop endpoints every 30 frames throughout
// nose/side/wake, in addition to every selected audit frame.
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [key,...v]=a.replace(/^--/,'').split('=');return [key,v.length?v.join('='):true]}));
const project=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.resolve(project,String(args.out??'tmp/metro-audit'));
const width=Number(args.width??1920),height=Number(args.height??1080);
const timeline=JSON.parse(await fs.readFile(path.join(project,'src/metro/timeline.json'),'utf8'));
const modes=String(args.modes??'direct,sequential,shuffled').split(',');
if(modes.some(m=>!['direct','sequential','shuffled'].includes(m)))throw Error('Unsupported audit mode');
const offsets=[-1,0,1,42,84];
const boundaries=timeline.scenes.map(s=>({scene:s.id,start:s.start,frames:offsets.map(d=>Math.max(0,Math.min(timeline.duration-1,s.start+d)))}));
const keyframes=timeline.scenes.flatMap(s=>[Math.round((s.start+s.end-1)/2),s.end-1]);
const selected=args.frames?String(args.frames).split(',').map(Number):[...boundaries.flatMap(b=>b.frames),...keyframes];
const frames=[...new Set(selected)].filter(f=>Number.isInteger(f)&&f>=0&&f<timeline.duration).sort((a,b)=>a-b);
if(!frames.length)throw Error('No valid audit frames');
await fs.mkdir(out,{recursive:true});
const sourceFiles=['src/metro/World.ts','src/metro/Film.tsx','src/metro/timeline.json','public/metro/physics/flow.json','public/metro/physics/streamlines.json','public/metro/physics/balance.json'];
const hash=v=>createHash('sha256').update(typeof v==='string'||Buffer.isBuffer(v)?v:JSON.stringify(v)).digest('hex');
const hashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,hash(await fs.readFile(path.join(project,f)))])));
const bundle=path.join(out,'audit-entry.js');
const source=`
import {MetroWorld} from ${JSON.stringify(path.join(project,'src/metro/World.ts').replaceAll('\\','/'))};
import {stateAt} from ${JSON.stringify(path.join(project,'src/metro/Film.tsx').replaceAll('\\','/'))};
import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
const canvas=document.querySelector('canvas');
const gl=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true,powerPreference:'high-performance'});
gl.setSize(${width},${height},false);gl.setPixelRatio(1);gl.toneMapping=T.ACESFilmicToneMapping;gl.toneMappingExposure=1.27;gl.outputColorSpace=T.SRGBColorSpace;gl.shadowMap.enabled=true;gl.shadowMap.type=T.PCFSoftShadowMap;
const scene=new T.Scene(),camera=new T.PerspectiveCamera(39,${width/height},.04,180),night=0x0d1d2c;
scene.background=new T.Color(night);scene.fog=new T.Fog(night,32,110);
const pm=new T.PMREMGenerator(gl),env=pm.fromScene(new RoomEnvironment(),.04);scene.environment=env.texture;scene.environmentIntensity=.52;pm.dispose();
scene.add(new T.HemisphereLight(0xc6e8ff,0x293042,1.8));
const key=new T.DirectionalLight(0xe8f2ff,3.1);key.position.set(-6,12,8);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-25,right:25,top:18,bottom:-18,near:.5,far:70});key.shadow.normalBias=.02;key.shadow.bias=-.0002;scene.add(key);
const fill=new T.DirectionalLight(0x65b9d0,2.4);fill.position.set(8,8,-7);scene.add(fill);
const edge=new T.DirectionalLight(0xffb864,.7);edge.position.set(-10,3,4);scene.add(edge);
const ground=new T.Mesh(new T.PlaneGeometry(250,250),new T.MeshStandardMaterial({color:0x102131,roughness:.78}));ground.rotation.x=-Math.PI/2;ground.position.y=-.96;ground.receiveShadow=true;scene.add(ground);
let world;
const rounded=n=>Number(n.toFixed(9)),array=v=>v.toArray().map(rounded);
const visible=o=>{for(let p=o;p;p=p.parent)if(!p.visible)return false;return true};
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value instanceof Uint8Array?value:new TextEncoder().encode(JSON.stringify(value))))).map(x=>x.toString(16).padStart(2,'0')).join('');
const matrix=o=>({name:o.name,type:o.type,visible:o.visible,effectivelyVisible:visible(o),position:array(o.position),quaternion:array(o.quaternion),scale:array(o.scale),local:array(o.matrix),world:array(o.matrixWorld)});
const rootKeys=['station','train','tunnel','screen','flowGroup','heatGroup','forceGroup','pistonGroup','distanceGroup','balanceGroup','propsGroup','balanceArrow','gravityArrow','com','feetArea','scarf'];
function roots(){const result={};for(const key of rootKeys)if(world[key])result[key]=matrix(world[key]);for(const key of ['cars','humans','doors','screenDoors'])if(world[key])world[key].forEach((o,i)=>result[key+'['+i+']']=matrix(o));for(const key of ['balanceArrow','gravityArrow'])for(const part of ['line','cone'])if(world[key]?.[part])result[key+'.'+part]=matrix(world[key][part]);return result}
function fullState(){const nodes=[],visibleNodes=[];function visit(o,treePath){const state={path:treePath,...matrix(o)};if(o.material)state.materials=(Array.isArray(o.material)?o.material:[o.material]).map(m=>({visible:m.visible,opacity:rounded(m.opacity),transparent:m.transparent,color:m.color?.getHexString()}));nodes.push(state);if(state.effectivelyVisible)visibleNodes.push(state);o.children.forEach((child,i)=>visit(child,treePath+'/'+i));}visit(world.root,'root');const dynamic={};for(const [i,line]of(world.flowTrails??[]).entries())dynamic['flowTrail'+i]=Array.from(line.geometry.attributes.position.array,rounded);if(world.balanceLine)dynamic.balanceLine=Array.from(world.balanceLine.geometry.attributes.position.array,rounded);return {nodes,visibleNodes,dynamic}}
function endpointInfo(state){
 const enabled=['nose','side','wake'].includes(state.scene),frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
 const endpoints=[];for(const [i,line]of(world.flowPaths??[]).entries())for(const [end,p]of[['inlet',line.points[0]],['outlet',line.points[line.points.length-1]]]){
  const location=new T.Vector3(p[0],.94,p[1]).applyMatrix4(world.flowGroup.matrixWorld),ndc=location.clone().project(camera),sphere=new T.Sphere(location,.06);
  endpoints.push({path:i,seedZ:line.seedZ,end,world:array(location),ndc:array(ndc),insidePoint:Math.abs(ndc.x)<=1&&Math.abs(ndc.y)<=1&&ndc.z>=-1&&ndc.z<=1,intersectsParticleSphere:frustum.intersectsSphere(sphere)});
 }
 return {applicable:enabled,groupEffectivelyVisible:visible(world.flowGroup),endpoints,visibleLoopEndpoints:enabled?endpoints.filter(e=>e.intersectsParticleSphere):[]};
}
async function reset(){if(world){scene.remove(world.root);world.dispose();}world=new MetroWorld('/metro/');await world.ready;scene.add(world.root);return true}
function update(frame){const state=stateAt(frame);world.update(state,camera);scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);gl.render(scene,camera);window.__metro={world,state,camera,scene,gl};return state}
const probe=document.createElement('canvas');probe.width=320;probe.height=180;const probeContext=probe.getContext('2d',{willReadFrequently:true});const fullPixels=new Uint8Array(${width*height*4});
async function render(frame){const state=update(frame),all=fullState(),cameraState={position:array(camera.position),quaternion:array(camera.quaternion),projection:array(camera.projectionMatrix)};const context=gl.getContext();context.readPixels(0,0,${width},${height},context.RGBA,context.UNSIGNED_BYTE,fullPixels);probeContext.drawImage(canvas,0,0,320,180);const pixels=Array.from(probeContext.getImageData(0,0,320,180).data);return {frame,state,camera:cameraState,roots:roots(),allNodeCount:all.nodes.length,visibleNodeCount:all.visibleNodes.length,matrixHash:await digest({camera:cameraState,nodes:all.nodes,dynamic:all.dynamic}),visibleMatrixHash:await digest({camera:cameraState,nodes:all.visibleNodes,dynamic:all.dynamic}),fullPixelHash:await digest(fullPixels),pixelProbe:pixels,flowEndpoints:endpointInfo(state)}}
function endpoints(frame){const state=update(frame);return {frame,state,camera:{position:array(camera.position),quaternion:array(camera.quaternion)},...endpointInfo(state)}}
window.audit={reset,render,endpoints,advance:(start,end)=>{for(let f=start;f<end;f++)update(f)},png:()=>canvas.toDataURL('image/png').split(',')[1]};window.auditReady=true;
`;
await build({stdin:{contents:source,resolveDir:project,loader:'ts',sourcefile:'metro-audit-entry.ts'},bundle:true,format:'iife',platform:'browser',outfile:bundle,logLevel:'silent'});
const manifest={createdAt:new Date().toISOString(),sourceHashes:hashes,resolution:[width,height],frames,boundaries,modes,entry:bundle};
await fs.writeFile(path.join(out,'entry-manifest.json'),JSON.stringify(manifest,null,2));
if(args['build-only']){console.log(JSON.stringify({built:bundle,frameCount:frames.length,renderExecuted:false}));process.exit(0)}

const html='<!doctype html><meta charset="utf-8"><style>html,body{margin:0;overflow:hidden;background:#0d1d2c}canvas{display:block}</style><canvas></canvas><script src="/audit-entry.js"></script>';
const publicRoot=path.join(project,'public');
const types={'.json':'application/json','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary'};
const server=createServer(async(req,res)=>{try{const url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(url==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return}const target=url==='/audit-entry.js'?bundle:path.resolve(publicRoot,'.'+url);if(target!==bundle&&!target.startsWith(publicRoot+path.sep)){res.writeHead(403);res.end();return}res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream','Cache-Control':'no-cache'});res.end(await fs.readFile(target))}catch(e){res.writeHead(404);res.end(String(e))}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,errors=[];
const report={...manifest,scope:'Independent Three.js world with Film stateAt and matched lights. Excludes React text/captions/coda and audio. Exact full-resolution RGBA hashes plus 320x180 pixel difference probes; this is not complete subjective video review.',pixelProbeResolution:[320,180],sequentialScope:args.dense?'all intervening frames':'ascending selected audit frames',errors,runs:{},comparisons:[],boundaryDeltas:[],endpointSweep:[]};
const exe=path.join(project,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const shuffle=input=>{const arr=[...input];let seed=4102026;for(let i=arr.length-1;i>0;i--){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const j=seed%(i+1);[arr[i],arr[j]]=[arr[j],arr[i]]}return arr};
const pixelDiff=(a,b)=>{let sum=0,max=0,count=0;for(let i=0;i<a.length;i+=4)for(let k=0;k<3;k++){const d=Math.abs(a[i+k]-b[i+k]);sum+=d;max=Math.max(max,d);if(d>2)count++}return {meanAbsolute:sum/(a.length*.75),max,channelsOver2:count}};
const norm=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
let browser;
try{
 browser=await openBrowser('chrome',{browserExecutable:exe,chromiumOptions:{gl:'angle'}});
 const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
 page.on('error',e=>errors.push(String(e)));
 await page.setViewport({width,height,deviceScaleFactor:1});
 await page.goto({url:'http://127.0.0.1:'+port,timeout:60000});
 for(let i=0;i<100;i++){if(await page.evaluate(()=>Boolean(window.auditReady)))break;await new Promise(r=>setTimeout(r,100))}
 if(!await page.evaluate(()=>Boolean(window.auditReady)))throw Error('Audit page did not initialize');
 const baselinePixels=new Map(),baselineRecords=new Map();
 for(const mode of modes){
  const run=report.runs[mode]={order:mode==='shuffled'?shuffle(frames):frames,frames:[]};await fs.mkdir(path.join(out,mode),{recursive:true});
  if(mode!=='direct')await page.evaluate(()=>window.audit.reset());let prior=-1;
  for(const frame of run.order){
   if(mode==='direct')await page.evaluate(()=>window.audit.reset());
   if(mode==='sequential'&&args.dense)for(let start=prior+1;start<frame;start+=30){const end=Math.min(frame,start+30);await page.evaluate(({start,end})=>window.audit.advance(start,end),{start,end})}
   const data=await page.evaluate(frame=>window.audit.render(frame),frame),pixels=data.pixelProbe;delete data.pixelProbe;data.probePixelHash=hash(pixels);
   if(mode===modes[0]){baselinePixels.set(frame,pixels);baselineRecords.set(frame,data)}
   const baseline=baselineRecords.get(frame);
   if(mode!==modes[0])report.comparisons.push({mode,frame,samePixels:data.fullPixelHash===baseline.fullPixelHash,sameMatrices:data.matrixHash===baseline.matrixHash,sameVisibleMatrices:data.visibleMatrixHash===baseline.visibleMatrixHash,pixelProbeDifference:pixelDiff(pixels,baselinePixels.get(frame))});
   if(mode===modes[0]||data.fullPixelHash!==baseline?.fullPixelHash){const png=await page.evaluate(()=>window.audit.png());await fs.writeFile(path.join(out,mode,'frame-'+String(frame).padStart(5,'0')+'.png'),Buffer.from(png,'base64'))}
   run.frames.push(data);prior=frame;console.log(mode+' frame '+frame+' '+data.state.scene+' loopEndpointsInView='+data.flowEndpoints.visibleLoopEndpoints.length);
  }
 }
 for(const boundary of boundaries){
  const a=baselineRecords.get(boundary.start-1),b=baselineRecords.get(boundary.start);if(!a||!b)continue;
  const roots=Object.entries(b.roots).filter(([key])=>a.roots[key]).map(([key,r])=>({key,positionDelta:norm(a.roots[key].position,r.position),scaleDelta:norm(a.roots[key].scale,r.scale),quaternionComponentDelta:norm(a.roots[key].quaternion,r.quaternion),visibilityChanged:a.roots[key].effectivelyVisible!==r.effectivelyVisible}));
  const qa=a.camera.quaternion,qb=b.camera.quaternion;const dot=Math.min(1,Math.abs(qa.reduce((sum,v,i)=>sum+v*qb[i],0))/(Math.hypot(...qa)*Math.hypot(...qb)));
  const cameraPositionDelta=norm(a.camera.position,b.camera.position),cameraAngleDeltaRadians=2*Math.acos(dot);
  report.boundaryDeltas.push({scene:boundary.scene,frames:[boundary.start-1,boundary.start],cameraPositionDelta,cameraAngleDeltaRadians,rootDeltas:roots,pixels:pixelDiff(baselinePixels.get(boundary.start-1),baselinePixels.get(boundary.start)),needsReview:cameraPositionDelta>.12||cameraAngleDeltaRadians>.015||roots.some(r=>r.positionDelta>.08||r.scaleDelta>.02||r.visibilityChanged)});
 }
 const step=Number(args['endpoint-step']??30);
 if(step>0){
  await page.evaluate(()=>window.audit.reset());
  for(const scene of timeline.scenes.filter(s=>['nose','side','wake'].includes(s.id))){
   const selected=new Set([scene.start,scene.end-1]);for(let f=scene.start;f<scene.end;f+=step)selected.add(f);
   for(const frame of [...selected].sort((a,b)=>a-b)){const data=await page.evaluate(frame=>window.audit.endpoints(frame),frame);report.endpointSweep.push(data);if(data.visibleLoopEndpoints.length)console.log('Endpoint review frame '+frame+' '+scene.id+' count='+data.visibleLoopEndpoints.length)}
  }
 }
 const finalHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,hash(await fs.readFile(path.join(project,f)))])));
 report.sourceChangedDuringRun=Object.entries(finalHashes).filter(([f,h])=>h!==hashes[f]).map(([f])=>f);
 report.summary={frameCount:frames.length,renderedSamples:Object.values(report.runs).reduce((n,r)=>n+r.frames.length,0),pixelMismatches:report.comparisons.filter(x=>!x.samePixels).length,matrixMismatches:report.comparisons.filter(x=>!x.sameMatrices).length,visibleMatrixMismatches:report.comparisons.filter(x=>!x.sameVisibleMatrices).length,boundariesChecked:report.boundaryDeltas.length,boundariesNeedingReview:report.boundaryDeltas.filter(x=>x.needsReview).length,endpointSweepSamples:report.endpointSweep.length,endpointFramesNeedingReview:report.endpointSweep.filter(x=>x.visibleLoopEndpoints.length).length};
 report.determinismPass=report.comparisons.length>0&&report.summary.pixelMismatches===0&&report.summary.matrixMismatches===0&&report.sourceChangedDuringRun.length===0;
 report.loopEndpointsOutsideSampledViews=report.endpointSweep.length>0&&report.summary.endpointFramesNeedingReview===0;
}catch(e){errors.push(e.stack??String(e));process.exitCode=1}finally{
 if(browser)await browser.close({silent:true});await new Promise(resolve=>server.close(resolve));
 await fs.writeFile(path.join(out,'audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({report:path.join(out,'audit.json'),summary:report.summary,errors}));
}
