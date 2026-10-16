import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

// Direct Three.js audit. Run from the project directory:
// node scripts/audit_episode3_world.mjs
// node scripts/audit_episode3_world.mjs --frames=2762,2763,2784,2805 --out=tmp/lap-audit
// --modes=direct,sequential,shuffled controls order checks. --dense makes the
// sequential pass render every intervening frame. The default uses ascending
// audit frames for quick feedback, and records this scope in the JSON report.
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const [k,...v]=x.replace(/^--/,'').split('=');return [k,v.length?v.join('='):true]}));
const project=process.cwd(),out=path.resolve(project,String(args.out??'tmp/episode3-world-audit'));
const width=Number(args.width??1920),height=Number(args.height??1080);
const timeline=JSON.parse(await fs.readFile(path.join(project,'src/episode3v2/timeline.json'),'utf8'));
const modes=String(args.modes??'direct,sequential,shuffled').split(',');
const offsets=[-1,0,1,21,42];
const boundaries=timeline.scenes.map(s=>({scene:s.id,start:s.start,frames:offsets.map(d=>Math.max(0,Math.min(timeline.duration-1,s.start+d)))}));
const selected=args.frames?String(args.frames).split(',').map(Number):boundaries.flatMap(b=>b.frames);
const frames=[...new Set(selected)].filter(n=>Number.isInteger(n)&&n>=0&&n<timeline.duration).sort((a,b)=>a-b);
if(!frames.length)throw Error('No valid audit frames');
await fs.mkdir(out,{recursive:true});
const hashes={};
for(const file of ['src/episode3v2/World.ts','src/episode3v2/Film.tsx','src/episode3v2/timeline.json'])hashes[file]=createHash('sha256').update(await fs.readFile(path.join(project,file))).digest('hex');
const bundle=path.join(out,'audit-entry.js');
const source=`
import {JoineryWorld} from ${JSON.stringify(path.join(project,'src/episode3v2/World.ts').replaceAll('\\','/'))};
import {stateAt} from ${JSON.stringify(path.join(project,'src/episode3v2/Film.tsx').replaceAll('\\','/'))};
import * as T from 'three';
let canvas=document.querySelector('canvas'),world;
const rounded=x=>Number(x.toFixed(9));
const arr=x=>x.toArray().map(rounded);
function visible(o){for(let p=o;p;p=p.parent)if(!p.visible)return false;return true}
function matrix(o){return o?{name:o.name,type:o.type,visible:o.visible,effectivelyVisible:visible(o),position:arr(o.position),quaternion:arr(o.quaternion),scale:arr(o.scale),local:arr(o.matrix),world:arr(o.matrixWorld)}:null}
function projectedBounds(root){let min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity],meshCount=0;const intersecting=[];root.traverse(o=>{if(!o.isMesh||!visible(o))return;const mats=Array.isArray(o.material)?o.material:[o.material];if(mats.every(m=>!m.visible||m.opacity<.005))return;o.geometry.computeBoundingBox();const bb=o.geometry.boundingBox;if(!bb)return;meshCount++;const mn=[Infinity,Infinity,Infinity],mx=[-Infinity,-Infinity,-Infinity];for(const x of [bb.min.x,bb.max.x])for(const y of [bb.min.y,bb.max.y])for(const z of [bb.min.z,bb.max.z]){const p=new T.Vector3(x,y,z).applyMatrix4(o.matrixWorld).project(world.camera);[p.x,p.y,p.z].forEach((v,i)=>{mn[i]=Math.min(mn[i],v);mx[i]=Math.max(mx[i],v);min[i]=Math.min(min[i],v);max[i]=Math.max(max[i],v)})}if(mn[0]<=1&&mx[0]>=-1&&mn[1]<=1&&mx[1]>=-1&&mn[2]<=1&&mx[2]>=-1)intersecting.push({name:o.name,min:mn.map(rounded),max:mx.map(rounded)})});return {meshCount,min:meshCount?min.map(rounded):null,max:meshCount?max.map(rounded):null,intersecting}}
function rootInfo(key){const root=world[key];if(!root)return null;let meshes=0,effectiveMeshes=0;const materials=[];root.traverse(o=>{if(o.isMesh){meshes++;if(visible(o)){effectiveMeshes++;for(const m of Array.isArray(o.material)?o.material:[o.material])materials.push({opacity:rounded(m.opacity),transparent:m.transparent,visible:m.visible})}}});return {key,...matrix(root),meshes,effectiveMeshes,materialSample:materials.slice(0,8),projectedBounds:projectedBounds(root)}}
async function reset(){if(world){world.dispose();const next=document.createElement('canvas');canvas.replaceWith(next);canvas=next;}world=new JoineryWorld(canvas,'/episode3v2/models/');await world.ready;world.renderer.setSize(${width},${height},false);world.camera.aspect=${width/height};world.camera.updateProjectionMatrix();return true}
function heatStats(){const meshes=[];world.windHeatModel?.traverse(o=>{if(!o.isMesh)return;const colors=o.geometry.attributes.color,min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];if(colors)for(let i=0;i<colors.count;i++){const v=[colors.getX(i),colors.getY(i),colors.getZ(i)];for(let j=0;j<3;j++){min[j]=Math.min(min[j],v[j]);max[j]=Math.max(max[j],v[j])}}meshes.push({name:o.name,isFoundation:Boolean(o.userData.isFoundation),effectivelyVisible:visible(o),vertexColorCount:colors?.count??0,min:colors?min.map(rounded):null,max:colors?max.map(rounded):null,materials:(Array.isArray(o.material)?o.material:[o.material]).map(m=>({vertexColors:m.vertexColors,opacity:rounded(m.opacity),color:m.color?.getHexString()}))})});return meshes}
function summary(frame){const state=stateAt(frame);world.render(state);world.scene.updateMatrixWorld(true);const keys=['pavilion','joint','dovetail','lap','peg','stress','moisture','forces','wind','windResponse','supports','sampleRoot','wetJoint','dryOutline'];const roots=keys.map(rootInfo);const moving={};for(const key of ['tenon','mortise','doveMoving','lapMoving','pegMoving','pegPin','wetTenon']){const o=world[key];moving[key]={...matrix(o),children:o?.children.map(matrix)}}const c=document.createElement('canvas');c.width=160;c.height=90;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvas,0,0,160,90);const pixels=Array.from(ctx.getImageData(0,0,160,90).data);return {frame,state,camera:{position:arr(world.camera.position),quaternion:arr(world.camera.quaternion),projection:arr(world.camera.projectionMatrix)},visibleRoots:roots.filter(r=>r?.effectivelyVisible).map(r=>r.key),roots,moving,windHeat:heatStats(),pixels}}
window.audit={reset,render:summary,png:()=>canvas.toDataURL('image/png').split(',')[1]};
window.auditReady=true;
`;
await build({stdin:{contents:source,resolveDir:project,loader:'ts',sourcefile:'episode3-world-audit-entry.ts'},bundle:true,format:'iife',platform:'browser',outfile:bundle,logLevel:'silent'});
const html=`<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#eee7d8}canvas{display:block;width:${width}px;height:${height}px}</style><canvas width="${width}" height="${height}"></canvas><script src="/audit-entry.js"></script>`;
const types={'.glb':'model/gltf-binary','.json':'application/json','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg'};
const server=createServer(async(req,res)=>{try{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(pathname==='/'){res.writeHead(200,{'Content-Type':'text/html'});res.end(html);return}const target=pathname==='/audit-entry.js'?bundle:path.resolve(project,'public','.'+pathname);if(target!==bundle&&!target.startsWith(path.join(project,'public')+path.sep)){res.writeHead(403);res.end();return}const data=await fs.readFile(target);res.writeHead(200,{'Content-Type':types[path.extname(target)]??'application/octet-stream','Cache-Control':'no-cache'});res.end(data)}catch(e){res.writeHead(404);res.end(String(e))}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const port=server.address().port,errors=[];
const exe=path.join(project,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
let browser;
const report={createdAt:new Date().toISOString(),sourceHashes:hashes,resolution:[width,height],pixelProbeResolution:[160,90],frames,boundaries,modes,sequentialScope:args.dense?'all intervening frames':'ascending selected audit frames',errors,runs:{},comparisons:[],boundaryDeltas:[]};
const stableData=r=>({camera:r.camera,roots:r.roots,moving:r.moving});
const visibleData=r=>({camera:r.camera,roots:r.roots.filter(x=>x?.effectivelyVisible),moving:Object.fromEntries(Object.entries(r.moving).filter(([,x])=>x.effectivelyVisible))});
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const pixelDifference=(a,b)=>{let sum=0,max=0,count=0;for(let i=0;i<a.length;i+=4)for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);sum+=d;max=Math.max(max,d);if(d>2)count++}return {meanAbsolute:sum/(a.length*.75),max,channelsOver2:count}};
const shuffle=input=>{const a=[...input];let x=3012026;for(let i=a.length-1;i>0;i--){x=(Math.imul(x,1664525)+1013904223)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]]}return a};
try{
 browser=await openBrowser('chrome',{browserExecutable:exe,chromiumOptions:{gl:'angle'}});
 const page=await browser.newPage({context:()=>null,logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
 page.on('error',e=>errors.push(String(e)));
 await page.setViewport({width,height,deviceScaleFactor:1});
 await page.goto({url:'http://127.0.0.1:'+port,timeout:60000});
 for(let i=0;i<100;i++){if(await page.evaluate(()=>Boolean(window.auditReady)))break;await new Promise(r=>setTimeout(r,100))}
 if(!await page.evaluate(()=>Boolean(window.auditReady)))throw Error('Audit entry did not initialize');
 const baselinePixels=new Map();
 for(const mode of modes){
  const run=report.runs[mode]={order:mode==='shuffled'?shuffle(frames):frames,frames:[]};
  await fs.mkdir(path.join(out,mode),{recursive:true});
  if(mode!=='direct')await page.evaluate(()=>window.audit.reset());
  let prior=-1;
  for(const frame of run.order){
   if(mode==='direct')await page.evaluate(()=>window.audit.reset());
   if(mode==='sequential'&&args.dense){for(let start=prior+1;start<frame;start+=30){const end=Math.min(frame,start+30);await page.evaluate(({start,end})=>{for(let f=start;f<end;f++)window.audit.render(f)}, {start,end})}}
   const data=await page.evaluate(frame=>window.audit.render(frame),frame);
   const pixels=data.pixels;delete data.pixels;data.pixelHash=hash(pixels);data.matrixHash=hash(stableData(data));data.visibleMatrixHash=hash(visibleData(data));
   if(mode===modes[0])baselinePixels.set(frame,pixels);
   const baseline=report.runs[modes[0]].frames.find(x=>x.frame===frame);
   if(mode!==modes[0])report.comparisons.push({mode,frame,samePixels:data.pixelHash===baseline.pixelHash,sameMatrices:data.matrixHash===baseline.matrixHash,sameVisibleMatrices:data.visibleMatrixHash===baseline.visibleMatrixHash,pixelDifference:pixelDifference(pixels,baselinePixels.get(frame))});
   if(mode===modes[0]||data.pixelHash!==baseline?.pixelHash){const png=await page.evaluate(()=>window.audit.png());await fs.writeFile(path.join(out,mode,'frame-'+String(frame).padStart(5,'0')+'.png'),Buffer.from(png,'base64'))}
   run.frames.push(data);prior=frame;
   console.log(mode+' frame '+frame+' '+data.state.scene+' visible='+data.visibleRoots.join(','));
  }
 }
 for(const boundary of boundaries){const a=baselinePixels.get(boundary.start-1),b=baselinePixels.get(boundary.start);if(a&&b)report.boundaryDeltas.push({scene:boundary.scene,frames:[boundary.start-1,boundary.start],...pixelDifference(a,b)})}
 report.summary={frameCount:frames.length,renderedSamples:Object.values(report.runs).reduce((n,r)=>n+r.frames.length,0),pixelMismatches:report.comparisons.filter(x=>!x.samePixels).length,matrixMismatches:report.comparisons.filter(x=>!x.sameMatrices).length,visibleMatrixMismatches:report.comparisons.filter(x=>!x.sameVisibleMatrices).length};
}catch(e){errors.push(e.stack??String(e));process.exitCode=1}finally{if(browser)await browser.close({silent:true});await new Promise(resolve=>server.close(resolve));await fs.writeFile(path.join(out,'audit.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({report:path.join(out,'audit.json'),summary:report.summary,errors}));}
