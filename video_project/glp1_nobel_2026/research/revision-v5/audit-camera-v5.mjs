import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=path.join(root,'research/revision-v5/camera-audit');fs.mkdirSync(out,{recursive:true});
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const inputHashes=Object.fromEntries(['src/timeline.json','src/V5CameraPath.ts','src/V5World.ts','src/V5HandoffContext.ts','src/V5Mechanisms.ts'].map(p=>[p,hash(p)]));
const entry=`
import * as T from 'three';import {V5World} from './src/V5World';import {stateAt} from './src/visual';import {viewOf} from './src/V5CameraPath';import tl from './src/timeline.json';
const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,16/9,.001,12),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1600,900);document.body.appendChild(renderer.domElement);const w=new V5World(scene,camera,renderer,'/public/',tl);await w.ready;
const cameraRows=[],errors=[],segmentRows=[];let previous;
for(let f=0;f<tl.duration;f++){
 const p=w.cameraPath.sample(f),s=stateAt(f,tl),direction=p.target.clone().sub(p.position).normalize();
 if(![...p.position.toArray(),...p.target.toArray(),p.distance].every(Number.isFinite)||p.distance<=0)errors.push({f,type:'nonfinite'});
 if(previous){const opticalSpeed=Math.abs(Math.log10(p.distance/previous.distance))*tl.fps,relativeTravel=p.position.distanceTo(previous.position)/Math.sqrt(p.distance*previous.distance)*tl.fps,focusTravel=p.focus.distanceTo(previous.focus)/Math.sqrt(p.distance*previous.distance)*tl.fps,angularSpeed=direction.angleTo(previous.direction)*tl.fps*180/Math.PI;
 cameraRows.push({f,id:s.clip.id,view:viewOf(s.clip),distance:p.distance,opticalSpeed,relativeTravel,focusTravel,angularSpeed});}
 previous={...p,direction};
}
for(let i=1;i<w.cameraPath.knots.length;i++){const a=w.cameraPath.knots[i-1],b=w.cameraPath.knots[i];segmentRows.push({start:a.frame,end:b.frame,seconds:(b.frame-a.frame)/tl.fps,decades:Math.abs(Math.log10(b.distance/a.distance)),shift:a.focus.distanceTo(b.focus),aDistance:a.distance,bDistance:b.distance});}
const clipRows=tl.clips.map(c=>{const rows=cameraRows.filter(r=>r.f>=c.start&&r.f<c.end),top=key=>rows.reduce((a,b)=>a[key]>b[key]?a:b);return{id:c.id,view:viewOf(c),start:c.start,end:c.end,mechanism:c.mechanism,maxOpticalSpeed:top('opticalSpeed'),maxRelativeTravel:top('relativeTravel'),maxFocusTravel:top('focusTravel'),maxAngularSpeed:top('angularSpeed')};});
window.audit={duration:tl.duration,fps:tl.fps,errors,anchors:Object.fromEntries(Object.entries(w.anchors).map(([k,v])=>[k,v.toArray()])),knots:w.cameraPath.knots,segments:segmentRows,clips:clipRows,topOptical:[...cameraRows].sort((a,b)=>b.opticalSpeed-a.opticalSpeed).slice(0,40),topAngular:[...cameraRows].sort((a,b)=>b.angularSpeed-a.angularSpeed).slice(0,20),topFocus:[...cameraRows].sort((a,b)=>b.focusTravel-a.focusTravel).slice(0,20)};
window.frame=f=>{const s=stateAt(f,tl);w.update(s);renderer.render(scene,camera);const materialAlpha=root=>{const arr=[];root?.traverse(o=>{if(o.isMesh&&!o.userData.skinDepth){const m=Array.isArray(o.material)?o.material[0]:o.material;arr.push(m.opacity)}});return arr.length?Math.max(...arr):0;};return{f,id:s.clip.id,view:viewOf(s.clip),distance:w.cameraPath.sample(f).distance,labels:w.labels(s),weights:w.weights,organOpacity:Object.fromEntries(Object.entries(w.organs).map(([k,v])=>[k,materialAlpha(v)])),regulationWeight:w.regulation.weight};};window.ready=true;`;
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'v5-camera-audit.ts',loader:'ts'},bundle:true,format:'esm',platform:'browser',outfile:path.join(out,'runner.js')});
fs.writeFileSync(path.join(out,'index.html'),'<meta charset="utf-8"><style>body{margin:0}</style><script type="module" src="/research/revision-v5/camera-audit/runner.js"></script>');
const server=http.createServer((req,res)=>{const p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!p.startsWith(root+path.sep)||!fs.existsSync(p)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',p.endsWith('.js')?'text/javascript':p.endsWith('.json')?'application/json':p.endsWith('.glb')?'model/gltf-binary':'text/html');fs.createReadStream(p).pipe(res)});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'},logLevel:'error'});
try{
 const page=await browser.newPage({context:{sourceMap:null},logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});await page.setViewport({width:1600,height:900,deviceScaleFactor:1});await page.goto({url:'http://127.0.0.1:'+server.address().port+'/research/revision-v5/camera-audit/index.html',timeout:120000});await page.evaluate(async()=>{let t=performance.now();while(!window.ready){if(performance.now()-t>110000)throw Error('timeout');await new Promise(r=>setTimeout(r,100));}});
 const result=await page.evaluate(()=>window.audit);result.inputHashes=inputHashes;fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2));
 const frames=process.argv.slice(2).map(Number).filter(Number.isFinite);const selected=frames.length?frames:[result.topOptical[0].f,...result.clips.filter(c=>['h008','h014','h020','h021','h022','h023','h026','h035','h037','h038','h042','h054','h063','h074'].includes(c.id)).map(c=>Math.round(c.start+(c.end-c.start)*.5))];
 const renders=[];for(const f of selected){renders.push(await page.evaluate(f=>window.frame(f),f));const {value:s}=await page._client().send('Page.captureScreenshot',{format:'jpeg',quality:91});fs.writeFileSync(path.join(out,'frame-'+f+'.jpg'),Buffer.from(s.data,'base64'));console.log('frame',f);}fs.writeFileSync(path.join(out,'rendered-frames.json'),JSON.stringify(renders,null,2));
 console.log(JSON.stringify({inputHashes,duration:result.duration,errors:result.errors,topOptical:result.topOptical.slice(0,3),topAngular:result.topAngular.slice(0,3),shortestSegments:[...result.segments].sort((a,b)=>a.seconds-b.seconds).slice(0,6)},null,2));
}finally{await browser.close({silent:true});server.close();}
