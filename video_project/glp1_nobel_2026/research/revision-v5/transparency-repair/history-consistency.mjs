/** Actual-world GPU regression. Does not alter production or render locks. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {openBrowser} from '@remotion/renderer';

const script=fileURLToPath(import.meta.url);
const root=path.resolve(path.dirname(script),'../../..');
const args=process.argv.slice(2);
const execute=args.includes('--execute');
if(execute===args.includes('--validate-only'))throw Error('Choose exactly one of --execute or --validate-only');
const runArg=args.find(x=>x.startsWith('--run-id='));
const runID=runArg?.slice('--run-id='.length);
for(const a of args)if(!['--execute','--validate-only'].includes(a)&&!a.startsWith('--run-id='))throw Error('Unknown argument '+a);
if(execute&&(!runID||!/^[a-z0-9][a-z0-9-]{0,63}$/.test(runID)))throw Error('Execution requires a safe --run-id=name');
const relative=p=>path.relative(root,p).replaceAll(path.sep,'/');
const shaBuffer=b=>crypto.createHash('sha256').update(b).digest('hex');
const sha=p=>shaBuffer(fs.readFileSync(p));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const tl=read(path.join(root,'src/timeline.json'));
const targets=[3470,3541,4260,14352,14499,18435,20753,24045];
const extra={3470:[3135,3230,3317,3380,3450],3541:[3135,3317,3420,3470,3535],4260:[3135,3430,3570,3710,4110,4230],14352:[13000,14070,14160,14230,14315,14345],14499:[14070,14160,14310,14352,14400,14480],18435:[17590,17780,17920,17970,18100,18390,18430],20753:[19180,19600,20200,20520,20640,20720,20752],24045:[18490,18900,21900,23500,23870,23960,24044]};
const macroViews=new Set(['meal','action_meal','torso','homecheck','muscle','kidney','pressure','brainheart','pancreas','liver','stomach','gut']);
const cases=targets.map(target=>({target,history:[...new Set([0,...tl.clips.filter(c=>macroViews.has(c.view)&&c.start<target).map(c=>Math.floor((c.start+c.end)/2)),...extra[target],target-30,target-10,target-1])].filter(f=>f>=0&&f<target).sort((a,b)=>a-b)}));
const width=1280,height=720;
const entry=`import * as T from 'three';
import {V5World} from './src/V5World';
import {stateAt} from './src/visual';
import timeline from './src/timeline.json';
const renderer=new T.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance',preserveDrawingBuffer:true});
renderer.setPixelRatio(1);renderer.setSize(${width},${height});document.body.appendChild(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(34,16/9,.00001,12);
const world=new V5World(scene,camera,renderer,'/public/',timeline);
await world.ready;
window.auditRender=(frame,capture=false)=>{
 const state=stateAt(frame,timeline);world.update(state);
 // Required: real draw calls compile shader programs. update() alone is not a regression.
 renderer.render(scene,camera);renderer.getContext().finish();
 const gl=renderer.getContext(),mats=[],seen=new Set();
 scene.traverseVisible(object=>{if(!object.material)return;for(const material of Array.isArray(object.material)?object.material:[object.material]){
  if(seen.has(material))continue;seen.add(material);const program=renderer.properties.get(material).currentProgram;
  const shader=program?.fragmentShader?gl.getShaderSource(program.fragmentShader):'';
  const opaqueDefine=/^#define OPAQUE\\s*$/m.test(shader??'');
  if(opaqueDefine&&material.transparent&&material.opacity<.9999&&material.colorWrite!==false)mats.push({object:object.name,material:material.type,opacity:material.opacity,version:material.version,transparent:material.transparent,depthWrite:material.depthWrite,opaqueDefine});
 }});
 return {frame,clip:state.clip.id,view:state.clip.view,distance:world.cameraPath.sample(frame).distance,camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),near:camera.near,far:camera.far},opaqueAlphaMismatches:mats,renderCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,...(capture?{png:renderer.domElement.toDataURL('image/png')}:{} )};
};
window.comparePNG=async(a,b)=>{
 const decode=async url=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement('canvas');c.width=${width};c.height=${height};const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height);};
 const p=await decode(a),q=await decode(b),canvas=document.createElement('canvas');canvas.width=${width};canvas.height=${height};const ctx=canvas.getContext('2d'),out=ctx.createImageData(canvas.width,canvas.height);
 let changedPixels=0,over2Pixels=0,maxDifference=0,absoluteSum=0,squareSum=0;
 const region={x:${Math.floor(width*.38)},y:0,width:${width-Math.floor(width*.38)},height:${height}};let regionChanged=0,regionOver2=0;
 for(let i=0;i<p.data.length;i+=4){let m=0;for(let c=0;c<3;c++){const d=Math.abs(p.data[i+c]-q.data[i+c]);absoluteSum+=d;squareSum+=d*d;m=Math.max(m,d);out.data[i+c]=Math.min(255,d*8);}out.data[i+3]=255;maxDifference=Math.max(maxDifference,m);if(m>0)changedPixels++;if(m>2)over2Pixels++;if((i/4)%${width}>=region.x){if(m>0)regionChanged++;if(m>2)regionOver2++;}}
 const n=${width*height};return {width:${width},height:${height},changedPixels,changedFraction:changedPixels/n,over2Pixels,over2Fraction:over2Pixels/n,maxDifference,meanAbsoluteRGB:absoluteSum/(n*3),rootMeanSquareRGB:Math.sqrt(squareSum/(n*3)),region:{...region,changedPixels:regionChanged,over2Pixels:regionOver2},exactPixelMatch:changedPixels===0,png:(ctx.putImageData(out,0,0),canvas.toDataURL('image/png'))};
};
window.auditReady={threeRevision:T.REVISION,renderer:renderer.capabilities.isWebGL2?'WebGL2':'WebGL',gpu:renderer.getContext().getParameter(renderer.getContext().RENDERER)};`;

// Compile to memory before any execution: dependency closure is the production scene.
const built=await build({stdin:{contents:entry,resolveDir:root,sourcefile:'history-regression.ts',loader:'ts'},bundle:true,format:'esm',platform:'browser',write:false,metafile:true,logLevel:'error'});
const sourceFiles=Object.keys(built.metafile.inputs).filter(p=>!p.startsWith('<')&&p!=='history-regression.ts').map(p=>path.resolve(root,p));
for(const f of [script,path.join(root,'package.json'),path.join(root,'package-lock.json')])if(!sourceFiles.includes(f))sourceFiles.push(f);
const sourceHashes=Object.fromEntries(sourceFiles.sort().map(p=>[relative(p),sha(p)]));
const planned={targets,cases,width,height,world:'Actual production V5World',timelineSHA256:sha(path.join(root,'src/timeline.json')),dependencyInputCount:sourceFiles.length,sourceHashes,bundleSHA256:shaBuffer(built.outputFiles[0].contents),policy:'Separate fresh WebGLRenderer/V5World instances for direct and history paths. History renders all preceding macro clip midpoints plus explicit transition anchors and target neighbors. Each step invokes actual renderer.render and gl.finish. Raw world-only PNG pixels are compared exactly; no subtitle overlay can hide scene differences.'};
if(!execute){console.log(JSON.stringify({mode:'validate-only',gpuStarted:false,filesystemWrites:false,...planned},null,2));process.exit(0);}
const out=path.join(root,'research/revision-v5/transparency-repair/history-consistency',runID);
if(fs.existsSync(out))throw Error('Refusing to overwrite an existing run: '+out);
fs.mkdirSync(out,{recursive:true});
const put=(name,value)=>fs.writeFileSync(path.join(out,name),typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');
put('plan.json',{createdAtUTC:new Date().toISOString(),command:process.argv,preparedAgainstSource:planned});
put('runner.js',built.outputFiles[0].text);
put('index.html','<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#f2eee7}canvas{display:block}</style><script type="module" src="runner.js"></script>');
const assets=new Map(),requests=[];
const server=http.createServer((req,res)=>{
 let p;try{p=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));}catch{res.writeHead(400);res.end();return;}
 if(!p.startsWith(root+path.sep)||!fs.existsSync(p)||!fs.statSync(p).isFile()){res.writeHead(404);res.end();return;}
 // Asset reads are locked once and rechecked at completion. Avoid rehashing multi-MB atlases per reload.
 if(p.startsWith(path.join(root,'public')+path.sep)&&!assets.has(p))assets.set(p,sha(p));
 requests.push(relative(p));
 const ext=path.extname(p).toLowerCase();res.setHeader('Content-Type',({'.js':'text/javascript','.json':'application/json','.glb':'model/gltf-binary','.gltf':'model/gltf+json','.bin':'application/octet-stream','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png'})[ext]??'text/html');
 fs.createReadStream(p).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'},logLevel:'error'});
const page=await browser.newPage({context:{sourceMap:null},logLevel:'error',indent:false,pageIndex:0,onBrowserLog:null,onLog:()=>{}});
const logs=[];page.on('pageerror',error=>logs.push(String(error)));
await page.setViewport({width,height,deviceScaleFactor:1});
const url=`http://127.0.0.1:${server.address().port}/${relative(path.join(out,'index.html'))}`;
const reset=async()=>{await page.goto({url:url+'?instance='+crypto.randomUUID(),timeout:180000});return await page.evaluate(async()=>{const start=performance.now();while(!window.auditReady){if(performance.now()-start>170000)throw Error('World load timed out');await new Promise(r=>setTimeout(r,50));}return window.auditReady;});};
const savePNG=(name,data)=>{const p=path.join(out,name);fs.writeFileSync(p,Buffer.from(data.split(',')[1],'base64'));return{path:relative(p),sha256:sha(p)};};
const rows=[];let browserInfo=null;
try{
 for(const item of cases){
  browserInfo=await reset();
  const direct=await page.evaluate(f=>window.auditRender(f,true),item.target);
  const directPNG=direct.png;delete direct.png;
  const directFile=savePNG(`frame-${item.target}-direct.png`,directPNG);
  await reset();
  const history=[];for(const f of item.history)history.push(await page.evaluate(n=>window.auditRender(n,false),f));
  const historic=await page.evaluate(f=>window.auditRender(f,true),item.target);
  const historicPNG=historic.png;delete historic.png;
  const historyFile=savePNG(`frame-${item.target}-history.png`,historicPNG);
  const difference=await page.evaluate((a,b)=>window.comparePNG(a,b),directPNG,historicPNG);
  const diffFile=savePNG(`frame-${item.target}-difference-x8.png`,difference.png);delete difference.png;
  const row={target:item.target,direct,historic,history,difference,images:{direct:directFile,history:historyFile,difference:diffFile},pass:difference.exactPixelMatch&&direct.opaqueAlphaMismatches.length===0&&historic.opaqueAlphaMismatches.length===0};
  rows.push(row);put(`frame-${item.target}-report.json`,row);
  console.log(JSON.stringify({frame:item.target,historyRenders:history.length,changedPixels:difference.changedPixels,maxDifference:difference.maxDifference,opaqueAlphaMismatches:historic.opaqueAlphaMismatches.length,pass:row.pass}));
 }
 const changedSources=Object.entries(sourceHashes).filter(([p,h])=>sha(path.join(root,p))!==h).map(([p])=>p);
 const changedAssets=[...assets].filter(([p,h])=>sha(p)!==h).map(([p])=>relative(p));
 const report={completedAtUTC:new Date().toISOString(),mode:'actual-world-gpu-history-regression',planned,browserInfo,sourceUnchanged:changedSources.length===0,changedSources,assetsUnchanged:changedAssets.length===0,changedAssets,assetHashes:Object.fromEntries([...assets].map(([p,h])=>[relative(p),h])),browserErrors:logs,cases:rows,allCasesPass:rows.every(r=>r.pass)&&!changedSources.length&&!changedAssets.length&&!logs.length,continuousPlaybackReviewed:false,visualAestheticsReviewed:false,limitations:'Exact frame-history independence on the listed tested paths, not a full-film frame-by-frame visual approval. No production source or video writes. Shader and pixel checks require an additional human review of the output PNG pairs.'};
 put('report.json',report);put('http-requests.json',requests);
 console.log(JSON.stringify({report:path.join(out,'report.json'),sha256:sha(path.join(out,'report.json')),allCasesPass:report.allCasesPass}));
 if(!report.allCasesPass)process.exitCode=2;
}catch(error){put('failed.json',{atUTC:new Date().toISOString(),error:String(error),casesCompleted:rows.length});throw error;}
finally{await browser.close({silent:true});await new Promise(r=>server.close(r));}
