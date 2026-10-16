import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';

const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const qa=path.join(here,'preview-liver');fs.mkdirSync(qa,{recursive:true});
const entry=`
import * as T from 'three';
import {V4World} from './src/V4World';
import {stateAt} from './src/visual';
import tl from './src/timeline.json';
const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,16/9,.001,12),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
renderer.setSize(1920,1080);document.body.appendChild(renderer.domElement);
const world=new V4World(scene,camera,renderer,'/public/',tl);await world.ready;
window.frame=f=>{
 const state=stateAt(f,tl);world.update(state);renderer.render(scene,camera);
 return {frame:f,view:state.clip.view,distance:world.cameraPath.sample(f).distance,weights:world.weights,handoff:{blood:world.handoff.bloodWeight,wall:world.handoff.wallWeight,platelets:world.handoff.plateletWeight,plasmaCue:world.handoff.plasmaCueWeight,wallCue:world.handoff.wallCueWeight},labels:world.labels(state).map(l=>{const p=l.point.clone().project(camera);return{text:l.text,x:(p.x+1)*960,y:(1-p.y)*540,weight:l.weight}})};
};window.ready=true;
`;
const plugins=[{name:'staged-handoff-overlay',setup(build){
 build.onLoad({filter:/[\\/]V4World\.ts$/},()=>({contents:fs.readFileSync(path.join(here,'repatch-liver/V4World.after.ts'),'utf8'),loader:'ts',resolveDir:path.join(root,'src')}));
 build.onResolve({filter:/^\.\/V4HandoffContext$/},()=>({path:path.join(root,'src/V4HandoffContext.ts'),namespace:'staged'}));
 build.onLoad({filter:/.*/,namespace:'staged'},()=>({contents:fs.readFileSync(path.join(here,'repatch-liver/V4HandoffContext.ts'),'utf8'),loader:'ts',resolveDir:path.join(root,'src')}));
}}];
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'v4-staged-handoff.ts',loader:'ts'},bundle:true,format:'esm',platform:'browser',plugins,outfile:path.join(qa,'runner.js')});
fs.writeFileSync(path.join(qa,'runner.html'),'<meta charset="utf-8"><style>body{margin:0}</style><script type="module" src="/research/revision-v4/patches/preview-liver/runner.js"></script>');
const server=http.createServer((req,res)=>{
 const pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.resolve(root,'.'+pathname);
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.glb')?'model/gltf-binary':'text/html'});fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'},logLevel:'error'});
try{
 const page=await browser.newPage({context:{sourceMap:null},logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
 await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});
 await page.goto({url:`http://127.0.0.1:${server.address().port}/research/revision-v4/patches/preview-liver/runner.html`,timeout:120000});
 await page.evaluate(async()=>{const start=performance.now();while(!window.ready){if(performance.now()-start>110000)throw new Error('world load timeout');await new Promise(r=>setTimeout(r,100));}});
 const frames=[6753,6770,6785,6799,6800,6801,6815,6830,6866,7680,7700,7720,7750,7780,7788,7789,7790,7800,7820,7840,7870,7884,7923,7953],rows=[];
 for(const frame of frames){
  rows.push(await page.evaluate(f=>window.frame(f),frame));
  const {value:screenshot}=await page._client().send('Page.captureScreenshot',{format:'jpeg',quality:94});
  fs.writeFileSync(path.join(qa,`world-${frame}.jpg`),Buffer.from(screenshot.data,'base64'));console.log('Staged geometry',frame);
 }
 fs.writeFileSync(path.join(qa,'report.json'),JSON.stringify(rows,null,2));
}finally{await browser.close({silent:true});server.close();}
