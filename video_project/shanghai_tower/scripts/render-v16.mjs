import {bundle} from '@remotion/bundler';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {configureRenderer,restoreRendererSelection} from './renderer-options.mjs';
import {tagV16Color} from './tag-v16-color.mjs';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'delivery'); fs.mkdirSync(output,{recursive:true});
const tmp=path.join(root,'tmp','v16'); fs.mkdirSync(tmp,{recursive:true});
const vertical=process.argv.includes('--vertical');
const id=vertical?'ShanghaiTowerV16Vertical':'ShanghaiTowerV16';
const entry=path.join(root,'src','indexV16.tsx');
const tag=process.argv.find(s=>s.startsWith('--tag='))?.slice(6)??(vertical?'vertical':'main');
const renderCacheRoot=process.env.RAINBOW_RENDER_CACHE_ROOT?path.resolve(process.env.RAINBOW_RENDER_CACHE_ROOT):path.join(tmp,'render-runs');
const runDir=path.join(renderCacheRoot,`${tag}-${process.pid}-${Date.now()}`); fs.mkdirSync(runDir,{recursive:true});
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src',vertical?'v16/audio-timeline-vertical.json':'v16/audio-timeline.json'),'utf8'));
const existingBundle=process.argv.find(s=>s.startsWith('--bundle='))?.slice(9);
const bundled=existingBundle??await bundle({entryPoint:entry,publicDir:path.join(root,'public'),outDir:path.join(runDir,'bundle')});
console.log('Bundle',bundled);fs.writeFileSync(path.join(tmp,'last-bundle.txt'),bundled);
const installed=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const still=process.argv.includes('stills')||process.argv.includes('--stills')||process.argv.some(s=>s.startsWith('--stills=')||s.startsWith('--cues='));
const clean=process.argv.includes('--clean');
const concurrency=Number(process.argv.find(s=>s.startsWith('--concurrency='))?.split('=')[1]??2);
const renderer=configureRenderer({preferHighPerformanceGpu:process.env.RAINBOW_HIGH_PERFORMANCE_GPU!=='0'});
const {renderMedia,renderStill,renderFrames,selectComposition,openBrowser}=require('@remotion/renderer');
const opts={serveUrl:bundled,browserExecutable:installed,chromiumOptions:renderer,inputProps:{audio:!still&&!process.argv.includes('--silent'),clean,aspect:vertical?'9:16':'16:9'}};
const browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:renderer});
try{
 const composition=await selectComposition({...opts,pupeteerInstance:browser,id});
 const stillDir=path.join(tmp,tag+'-stills');
 if(still){
  fs.mkdirSync(stillDir,{recursive:true});
  const custom=process.argv.find(s=>s.startsWith('--stills='));
  const shots=custom?custom.slice(9).split(',').map(Number):[0,Math.floor(timeline.duration*.08),Math.floor(timeline.duration*.18),Math.floor(timeline.duration*.35),Math.floor(timeline.duration*.52),Math.floor(timeline.duration*.70),Math.floor(timeline.duration*.86),timeline.duration-1];
  await renderFrames({...opts,pupeteerInstance:browser,composition,frames:shots,outputDir:null,imageFormat:'jpeg',jpegQuality:92,concurrency:1,timeoutInMilliseconds:180000,onStart:()=>console.log('Batch frames',shots.length),onFrameUpdate:(count,index,ms)=>console.log('QA frame',index,count,Math.round(ms)+'ms'),onFrameBuffer:async(buffer,frame)=>{fs.writeFileSync(path.join(stillDir,`frame-${frame}.jpg`),buffer);}});
  fs.writeFileSync(path.join(stillDir,'stills.json'),JSON.stringify({id,vertical,tag,durationFrames:timeline.duration,shots},null,2));
 }else{
  const a=process.argv.find(s=>s.startsWith('--frames=')); const range=a?a.slice(9).split('-').map(Number):null;
  const requested=process.argv.find(s=>s.startsWith('--output='))?.slice(9);
  const name=requested??(vertical?'ShanghaiTower_1080x1920_v16.mp4':'ShanghaiTower_1080p_v16.mp4');
  if(path.basename(name)!==name||!name.endsWith('.mp4'))throw new Error('Output must be a plain .mp4 filename');
  const outputLocation=path.join(range?tmp:output,range?`segment-${range.join('-')}-${tag}.mp4`:name);
  let last=-1; const start=Date.now();
  await renderMedia({...opts,pupeteerInstance:browser,composition,codec:'h264',outputLocation,crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:94,concurrency,timeoutInMilliseconds:120000,...(range?{frameRange:range}:{}),onProgress:p=>{const n=Math.floor(p.progress*100);if(n!==last){last=n;console.log('Render',n+'%');}}});
  const colorTag=tagV16Color(outputLocation);
  const manifest={finished:new Date().toISOString(),composition:id,frames:range??[0,timeline.duration-1],seconds:(Date.now()-start)/1000,outputLocation,runDir,tag,colorTag,success:true};
  fs.writeFileSync(path.join(runDir,'render.json'),JSON.stringify(manifest,null,2)); fs.writeFileSync(path.join(tmp,vertical?'v16-vertical-render.json':'v16-main-render.json'),JSON.stringify(manifest,null,2));
 }
}finally{await browser.close({silent:true});restoreRendererSelection();}

