import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../../..');
const baseline=process.argv.includes('--baseline'),name=baseline?'islet-before':'islet-after',out=path.join(here,name);fs.mkdirSync(out,{recursive:true});
const frames=[4091,4130,4131,4151,4152,4153,4154,4170,4200,4304,4400,4481,4482,4521,5688,5727,5728,5747,5748,5749,5750,5753,5754,5793];
const entry=`
import * as T from 'three';import {V4World} from './src/V4World';import {stateAt} from './src/visual';import tl from './src/timeline.json';
const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,16/9,.001,12),renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(1920,1080);document.body.appendChild(renderer.domElement);
const world=new V4World(scene,camera,renderer,'/public/',tl);await world.ready;
window.frame=f=>{const s=stateAt(f,tl);world.update(s);renderer.render(scene,camera);const cells=world.islet.root.children.filter(o=>o instanceof T.InstancedMesh&&o.name.startsWith('mixed-islet-cell-type'));return {frame:f,view:s.clip.view,distance:world.cameraPath.sample(f).distance,isletWeight:world.weights.islet,cells:cells.map(o=>({name:o.name,count:o.count,visible:o.visible,opacity:o.material.opacity,depthWrite:o.material.depthWrite,transparent:o.material.transparent})),labels:world.labels(s).map(l=>({text:l.text,weight:l.weight}))};};
window.scan=()=>{const rows=[];for(let f=3990;f<=5900;f++){world.update(stateAt(f,tl));rows.push([f,world.weights.islet]);}return rows;};window.ready=true;
`;
const plugins=baseline?[{name:'revision3-world',setup(b){b.onLoad({filter:/[\\/]V4World\.ts$/},()=>({contents:fs.readFileSync(path.join(here,'revision3-rendered-source/V4World.ts'),'utf8'),loader:'ts',resolveDir:path.join(root,'src')}));}}]:[];
await build({stdin:{contents:entry,resolveDir:root,sourcefile:'islet-revision4-preview.ts',loader:'ts'},bundle:true,format:'esm',platform:'browser',plugins,outfile:path.join(out,'runner.js')});
fs.writeFileSync(path.join(out,'runner.html'),`<meta charset="utf-8"><style>body{margin:0}</style><script type="module" src="/research/revision-v4/patches/${name}/runner.js"></script>`);
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(root+path.sep)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.writeHead(200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.glb')?'model/gltf-binary':'text/html'});fs.createReadStream(file).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'},logLevel:'error'});
try{const page=await browser.newPage({context:{sourceMap:null},logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});await page.setViewport({width:1920,height:1080,deviceScaleFactor:1});await page.goto({url:`http://127.0.0.1:${server.address().port}/research/revision-v4/patches/${name}/runner.html`,timeout:120000});await page.evaluate(async()=>{const start=performance.now();while(!window.ready){if(performance.now()-start>110000)throw Error('world timeout');await new Promise(r=>setTimeout(r,100));}});
const report=[];for(const f of frames){report.push(await page.evaluate(f=>window.frame(f),f));const {value:shot}=await page._client().send('Page.captureScreenshot',{format:'jpeg',quality:95});fs.writeFileSync(path.join(out,`world-${f}.jpg`),Buffer.from(shot.data,'base64'));console.log(name,f);}fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));if(baseline&&!fs.existsSync(path.join(out,'scan.json')))fs.writeFileSync(path.join(out,'scan.json'),JSON.stringify(await page.evaluate(()=>window.scan())));
}finally{await browser.close({silent:true});server.close();}
