import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {bundle} from '@remotion/bundler';

const root=process.cwd(), out=path.join(root,'tmp/v18-glp-patches-final');
const plan=JSON.parse(fs.readFileSync(path.join(out,'plan.json'),'utf8'));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const rel=p=>path.relative(root,p).replaceAll(path.sep,'/');
const write=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2),'utf8');
const walk=p=>fs.readdirSync(p,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(path.join(p,d.name)):[path.join(p,d.name)]).sort();
const files=[...walk(path.join(root,'src')),...walk(path.join(root,'public')),path.join(root,'scripts/render_v18_patches.mjs')];
const hashes=Object.fromEntries(files.map(p=>[rel(p),sha(p)]));
const check=()=>{for(const [p,h] of Object.entries(hashes))if(sha(path.join(root,p))!==h)throw Error('Render input changed: '+p);};
const lock=path.join(out,'source-lock.json');
if(fs.existsSync(lock)){
 const previous=JSON.parse(fs.readFileSync(lock,'utf8'));
 if(JSON.stringify(previous.hashes)!==JSON.stringify(hashes))throw Error('Inputs differ from saved patch source lock');
}else{
 for(const p of files.filter(p=>!rel(p).startsWith('public/'))){const dest=path.join(out,'frozen',rel(p));fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(p,dest);}
 write(lock,{createdUTC:new Date().toISOString(),hashes});
}
const served=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:path.join(out,'bundle')});
check();
const require=createRequire(import.meta.url);
const launcher=require(path.join(path.dirname(require.resolve('@remotion/renderer')),'browser/Launcher.js'));
const old=launcher.launchChrome;
launcher.launchChrome=o=>old({...o,args:[...(o.args??[]).filter(a=>!a.startsWith('--use-angle=')),'--use-angle=d3d11','--force_high_performance_gpu','--enable-gpu']});
const {openBrowser,selectComposition,renderMedia}=require('@remotion/renderer');
const browser=await openBrowser('chrome',{chromiumOptions:{gl:'angle'},logLevel:'error'});
try{
 write(path.join(out,'gpu.json'),await browser.connection.send('SystemInfo.getInfo'));
 const opts={serveUrl:served,puppeteerInstance:browser,chromiumOptions:{gl:'angle'},inputProps:{audio:false,clean:false},timeoutInMilliseconds:180000};
 const composition=await selectComposition({...opts,id:'GLP1'});
 if(composition.durationInFrames!==26738||composition.fps!==30||composition.width!==1920||composition.height!==1080)throw Error('Composition mismatch');
 for(const patch of plan.patches){
  const dest=path.resolve(root,patch.path),marker=dest.replace(/\.mp4$/,'.json');
  if(!dest.startsWith(out+path.sep))throw Error('Patch output outside expected directory');
  if(fs.existsSync(marker)){
   const saved=JSON.parse(fs.readFileSync(marker,'utf8'));
   if(saved.sha256!==sha(dest)||saved.sourceLockSHA256!==sha(lock))throw Error('Existing patch differs');
   console.log('Reusing verified patch '+patch.start+'-'+patch.end);continue;
  }
  check();fs.mkdirSync(path.dirname(dest),{recursive:true});
  console.log('Starting patch '+patch.start+'-'+patch.end);let last=-1;const start=Date.now();
  await renderMedia({...opts,composition,frameRange:[patch.start,patch.end],outputLocation:dest,codec:'h264',crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',muted:true,concurrency:3,videoImageFormat:'jpeg',jpegQuality:95,onProgress:p=>{const n=Math.floor(p.progress*10);if(n!==last){console.log('Patch '+patch.start+' '+n*10+'%');last=n;}}});
  check();write(marker,{start:patch.start,end:patch.end,path:patch.path,runner:'scripts/render_v18_glp.mjs',runnerSHA256:sha(path.join(root,'scripts/render_v18_glp.mjs')),sha256:sha(dest),sourceLockSHA256:sha(lock),seconds:(Date.now()-start)/1000});
 }
 check();write(path.join(out,'result.json'),{completedUTC:new Date().toISOString(),patches:plan.patches,sourceLockSHA256:sha(lock),complete:true});
 console.log('All V18 patches completed');
}finally{await browser.close({silent:true});}
