import {bundle} from '@remotion/bundler';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {configureRenderer,restoreRendererSelection} from './renderer-options.mjs';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'delivery');fs.mkdirSync(output,{recursive:true});
const tmp=path.join(root,'tmp');fs.mkdirSync(tmp,{recursive:true});
const tag=process.argv.find(s=>s.startsWith('--tag='))?.slice(6)??'';
if(tag&&!/^[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Render tag must use letters, numbers, hyphens or underscores');
// A user-scoped cache volume can hold immutable bundles when the project's
// drive is under pressure. Delivery and review pictures remain in the project.
const renderCacheRoot=process.env.RAINBOW_RENDER_CACHE_ROOT?path.resolve(process.env.RAINBOW_RENDER_CACHE_ROOT):path.join(tmp,'render-runs');
const runDir=path.join(renderCacheRoot,`${tag||'render'}-${process.pid}-${Date.now()}`);fs.mkdirSync(runDir,{recursive:true});
const stillDir=path.join(tmp,tag?`stills-${tag}`:'stills');
const tl=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
const bundled=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:path.join(runDir,'bundle')});
const installed=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const still=process.argv.includes('stills')||process.argv.includes('--stills')||process.argv.some(s=>s.startsWith('--stills=')||s.startsWith('--cues=')),clean=process.argv.includes('--clean');
const concurrency=Number(process.argv.find(s=>s.startsWith('--concurrency='))?.split('=')[1]??2);
const renderer=configureRenderer({preferHighPerformanceGpu:process.env.RAINBOW_HIGH_PERFORMANCE_GPU!=='0'});
// Load the CommonJS renderer entry after the process-local launcher hook is
// installed; ESM interop can otherwise retain an unpatched launcher namespace.
const {renderMedia,renderStill,selectComposition,openBrowser}=require('@remotion/renderer');
const opts={serveUrl:bundled,browserExecutable:installed,chromiumOptions:renderer,inputProps:{audio:!still&&!process.argv.includes('--silent'),clean}};
const browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:renderer});
try{
 const composition=await selectComposition({...opts,pupeteerInstance:browser,id:'ShanghaiTower'});
 if(still){
  fs.mkdirSync(stillDir,{recursive:true});const custom=process.argv.find(s=>s.startsWith('--stills='));
  const cueArg=process.argv.find(s=>s.startsWith('--cues='));
  const cues=cueArg?cueArg.slice(7).split(',').map(Number):[];
  const cueFrames=cues.map(u=>{const c=tl.clips.find(x=>Number(x.id.slice(1))===Math.floor(u));if(!Number.isFinite(u)||!c)throw new Error('Unknown narrative cue '+u);return Math.min(c.end-1,Math.round(c.start+(u-Math.floor(u))*(c.end-c.start)));});
  const shots=cueArg?cueFrames:custom?custom.slice(9).split(',').map(Number):tl.clips.filter((_,i)=>process.argv.includes('--all')||i%3===0).map(s=>Math.floor(s.start+s.duration*.7));
  if(shots.some(f=>!Number.isInteger(f)||f<0||f>=tl.duration))throw new Error('Still frame outside composition');
  for(const frame of shots){await renderStill({...opts,pupeteerInstance:browser,composition,frame,output:path.join(stillDir,`${clean?'clean':'frame'}-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:95,timeoutInMilliseconds:120000});console.log('Rendered frame',frame);}
  fs.writeFileSync(path.join(stillDir,'stills.json'),JSON.stringify({runDir,tag,durationFrames:tl.duration,shots:shots.map((frame,i)=>({frame,...(cueArg?{cue:cues[i]}:{}),file:`${clean?'clean':'frame'}-${frame}.jpg`}))},null,2));
 }else{
  const a=process.argv.find(s=>s.startsWith('--frames='));const range=a?a.slice(9).split('-').map(Number):null;
  const name=process.argv.find(s=>s.startsWith('--output='))?.slice(9)??'ShanghaiTower_1080p.mp4';
  if(path.basename(name)!==name||!name.endsWith('.mp4'))throw new Error('Output must be a plain .mp4 filename');
  const start=Date.now();let last=-1;const outputLocation=path.join(range?tmp:output,range?`segment-${range.join('-')}${tag?`-${tag}`:''}.mp4`:name);
  await renderMedia({...opts,pupeteerInstance:browser,composition,codec:'h264',outputLocation,crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:95,concurrency,timeoutInMilliseconds:120000,...(range?{frameRange:range}:{}),onProgress:p=>{const n=Math.floor(p.progress*100);if(n!==last){console.log('Render',n+'%');last=n}}});
  const manifest={finished:new Date().toISOString(),frames:range??[0,tl.duration-1],seconds:(Date.now()-start)/1000,outputLocation,runDir,tag,success:true};
  fs.writeFileSync(path.join(runDir,'render.json'),JSON.stringify(manifest,null,2));
  fs.writeFileSync(path.join(tmp,range?`segment-render${tag?`-${tag}`:''}.json`:'final-render.json'),JSON.stringify(manifest,null,2));
 }
}finally{await browser.close({silent:true});restoreRendererSelection();}
