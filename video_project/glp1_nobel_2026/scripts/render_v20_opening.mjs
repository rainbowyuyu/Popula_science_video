/**
 * Render V20 person/arm repair patches only. No delivery replacement occurs here.
 * GPU path is explicitly D3D11; every patch is muted and IDR-aligned according
 * to tmp/v20-opening-patches/plan.json. Run again with a new --out directory for
 * an iteration, or --fresh-lock after the source freeze changes.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {bundle} from '@remotion/bundler';
const root=process.cwd();
const arg=(name, fallback)=>{const i=process.argv.indexOf(name);return i>=0&&process.argv[i+1]?process.argv[i+1]:fallback;};
const out=path.resolve(root,arg('--out','tmp/v20-opening-patches'));
const planPath=path.resolve(root,arg('--plan',path.join(path.relative(root,out),'plan.json')));
const fresh=process.argv.includes('--fresh-lock');
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rel=p=>path.relative(root,p).replaceAll(path.sep,'/');
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2),'utf8');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(p,d.name)):[path.join(p,d.name)]).sort();
if(!fs.existsSync(planPath))throw new Error('Missing V20 plan: '+planPath);
fs.mkdirSync(out,{recursive:true});
const plan=JSON.parse(fs.readFileSync(planPath,'utf8'));
const files=[...walk(path.join(root,'src')),...walk(path.join(root,'public')),path.resolve(root,'scripts/render_v20_opening.mjs')];
const hashes=Object.fromEntries(files.map(p=>[rel(p),sha(p)]));
const lock=path.join(out,'source-lock.json');
if(fs.existsSync(lock)&&!fresh){const old=JSON.parse(fs.readFileSync(lock,'utf8'));if(JSON.stringify(old.hashes)!==JSON.stringify(hashes))throw new Error('V20 source lock differs; choose a new --out or use --fresh-lock');}
else{for(const p of files.filter(p=>!rel(p).startsWith('public/'))){const d=path.join(out,'frozen',rel(p));fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(p,d);}write(lock,{createdUTC:new Date().toISOString(),version:'v20-opening-source-lock',hashes});}
const check=()=>{const now=Object.fromEntries(files.map(p=>[rel(p),sha(p)]));if(JSON.stringify(now)!==JSON.stringify(hashes))throw new Error('Render input changed during V20 run');};
const served=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:path.join(out,'bundle')});
check();
const require=createRequire(import.meta.url);const launcher=require(path.join(path.dirname(require.resolve('@remotion/renderer')),'browser/Launcher.js'));const old=launcher.launchChrome;launcher.launchChrome=o=>old({...o,args:[...(o.args??[]).filter(a=>!a.startsWith('--use-angle=')),'--use-angle=d3d11','--force_high_performance_gpu','--enable-gpu']});
const {openBrowser,selectComposition,renderMedia}=require('@remotion/renderer');
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'},logLevel:'error'});
try{
 write(path.join(out,'gpu.json'),await browser.connection.send('SystemInfo.getInfo'));
 const opts={serveUrl:served,puppeteerInstance:browser,chromiumOptions:{gl:'angle'},inputProps:{audio:false,clean:false},timeoutInMilliseconds:180000};
 const composition=await selectComposition({...opts,id:'GLP1'});
 if(composition.durationInFrames!==26738||composition.fps!==30||composition.width!==1920||composition.height!==1080)throw new Error('Composition mismatch');
 const rendered=[];
 for(const patch of plan.patches){
  if(!Number.isInteger(patch.start)||!Number.isInteger(patch.end)||patch.start<0||patch.end<patch.start||patch.end>=26738)throw new Error('Invalid patch range');
  const dest=path.resolve(root,patch.path),marker=dest.replace(/\.mp4$/i,'.json');
  if(!dest.startsWith(out+path.sep))throw new Error('Patch output outside V20 directory: '+dest);
  if(fs.existsSync(marker)){
   const saved=JSON.parse(fs.readFileSync(marker,'utf8'));if(saved.sha256!==sha(dest)||saved.sourceLockSHA256!==sha(lock))throw new Error('Existing V20 patch marker/hash mismatch: '+dest);rendered.push(saved);continue;
  }
  check();fs.mkdirSync(path.dirname(dest),{recursive:true});console.log('Starting V20 patch '+patch.start+'-'+patch.end);let last=-1;const started=Date.now();
  await renderMedia({...opts,composition,frameRange:[patch.start,patch.end],outputLocation:dest,codec:'h264',crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',muted:true,concurrency:3,videoImageFormat:'jpeg',jpegQuality:95,onProgress:p=>{const n=Math.floor(p.progress*10);if(n!==last){last=n;console.log('Patch '+patch.start+' '+n*10+'%');}}});
  check();const markerData={start:patch.start,end:patch.end,path:patch.path,reason:patch.reason??'',renderer:'scripts/render_v20_opening.mjs',rendererSHA256:sha(path.resolve(root,'scripts/render_v20_opening.mjs')),sha256:sha(dest),sourceLock:rel(lock),sourceLockSHA256:sha(lock),gpu:'d3d11',seconds:(Date.now()-started)/1000};write(marker,markerData);rendered.push(markerData);
 }
 check();write(path.join(out,'result.json'),{completedUTC:new Date().toISOString(),version:'v20-opening-render',plan:rel(planPath),sourceLockSHA256:sha(lock),patches:rendered,complete:true});console.log(JSON.stringify({complete:true,patches:rendered.length,sourceLockSHA256:sha(lock)}));
}finally{await browser.close({silent:true});}

