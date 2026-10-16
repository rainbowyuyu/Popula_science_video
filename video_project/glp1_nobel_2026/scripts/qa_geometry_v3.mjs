import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const qa=path.join(root,'research/revision-v3/geometry');fs.mkdirSync(qa,{recursive:true});
const entry=`
import * as T from 'three';
import {World} from './src/World';
import {stateAt,V} from './src/visual';
import {SCALE} from './src/Scale';
import tl from './src/timeline.json';
const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,16/9,.001,12),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1920,1080);document.body.appendChild(renderer.domElement);
const w=new World(scene,camera,renderer,'/public/',tl);await w.ready;
window.audit=()=>{
 const failures=[],rows=[];let previous=null,maxRelative={value:0},maxLogDistance={value:0};
 const cellRadius=SCALE.betaUnit*1.25,isletRadius=SCALE.isletRadius;
 const receptorOffset=w.anchors.receptor.distanceTo(w.anchors.beta);
 if(Math.abs(cellRadius-7.5e-6)>1e-12)failures.push('beta diameter');
 if(w.anchors.beta.distanceTo(w.anchors.islet)+cellRadius>isletRadius)failures.push('cell outside islet');
 if(Math.abs(receptorOffset-cellRadius)>cellRadius*.03)failures.push('receptor off cell membrane');
 for(const [name,organ] of Object.entries(w.organs))if(organ.scale.distanceTo(V(1,1,1))>1e-10||organ.position.length()>1e-10)failures.push('organ transformed '+name);
 for(let f=0;f<tl.duration;f++){
  const pose=w.cameraPath.sample(f);
  if(!Number.isFinite(pose.distance)||pose.distance<=0)failures.push('bad pose '+f);
  if(previous){const step=pose.position.distanceTo(previous.position)/pose.distance,dl=Math.abs(Math.log(pose.distance/previous.distance));if(step>maxRelative.value)maxRelative={frame:f,value:step};if(dl>maxLogDistance.value)maxLogDistance={frame:f,value:dl};}
  previous=pose;
  if(f%15!==0)continue;
  const state=stateAt(f,tl);w.update(state);const ls=w.labels(state).filter(l=>(l.weight??1)>.15).map(l=>{const p=l.point.clone().project(camera);return {text:l.text,x:(p.x+1)*960,y:(1-p.y)*540,z:p.z};});
  rows.push({frame:f,clip:state.clip.id,distance:pose.distance,near:camera.near,weights:w.layerWeights,labels:ls});
 }
 return {failures,physical:{isletDiameterM:2*isletRadius,betaDiameterM:2*cellRadius,receptorPositionErrorM:Math.abs(receptorOffset-cellRadius),angstromPerSceneUnit:1/SCALE.receptorUnit*1e-10},maxRelative,maxLogDistance,stomachSafeRegion:w.root.userData.gastricSafeRegion,rows};
};
window.frame=f=>{w.update(stateAt(f,tl));renderer.render(scene,camera);};
window.ready=true;
`;
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'v3-geometry.ts',loader:'ts'},bundle:true,format:'esm',platform:'browser',outfile:path.join(qa,'runner.js')});
fs.writeFileSync(path.join(qa,'runner.html'),'<meta charset="utf-8"><style>body{margin:0}</style><script type="module" src="/research/revision-v3/geometry/runner.js"></script>');
const server=http.createServer((req,res)=>{const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.glb')?'model/gltf-binary':'text/html'});fs.createReadStream(file).pipe(res)});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'},logLevel:'error'});
try{
 const page=await browser.newPage({context:{sourceMap:null},logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
 await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
 await page.goto({url:`http://127.0.0.1:${server.address().port}/research/revision-v3/geometry/runner.html`,timeout:120000});
 await page.evaluate(async()=>{const t=performance.now();while(!window.ready){if(performance.now()-t>110000)throw new Error('world load timeout');await new Promise(r=>setTimeout(r,100));}});
 const result=await page.evaluate(()=>window.audit());fs.writeFileSync(path.join(qa,'report.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({failures:result.failures,physical:result.physical,maxRelative:result.maxRelative,maxLogDistance:result.maxLogDistance}));
 const tl=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
 const selected=process.argv.includes('--capture')?[8,9,12,13,14,16,20,22,23,25,26,28,30]:[];
 for(const n of selected){const c=tl.clips[n-1];for(const u of n===12||n===13?[.25,.5,.75,.95]:[.65]){const frame=Math.round(c.start+c.duration*u);await page.evaluate(f=>window.frame(f),frame);const {value:screenshot}=await page._client().send('Page.captureScreenshot',{format:'jpeg',quality:90});fs.writeFileSync(path.join(qa,`world-${frame}.jpg`),Buffer.from(screenshot.data,'base64'));}}
 if(result.failures.length)process.exitCode=1;
}finally{await browser.close({silent:true});server.close();}
