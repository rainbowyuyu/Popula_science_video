import path from 'node:path';
import fs from 'node:fs';
import {openBrowser,selectComposition,renderMedia,renderStill} from '@remotion/renderer';
import {configureRenderer} from './renderer-options.mjs';
const root=process.cwd(),story=JSON.parse(fs.readFileSync('src/beso-story.json','utf8'));
const runtimeTemp=path.join(root,'tmp','render-runtime');fs.mkdirSync(runtimeTemp,{recursive:true});process.env.TEMP=runtimeTemp;process.env.TMP=runtimeTemp;
const bundles=fs.readdirSync(path.join(root,'tmp')).filter(n=>n.startsWith('beso-bundle-')).map(n=>({n,t:fs.statSync(path.join(root,'tmp',n)).mtimeMs})).sort((a,b)=>b.t-a.t);
const serveUrl=path.join(root,'tmp',bundles[0].n);
const browserExecutable='D:/python_project/manim_extend_rainbow/video_project/topology_optimization/node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe';
const chromiumOptions=configureRenderer(), browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
try{
 const opts={serveUrl,browserExecutable,pupeteerInstance:browser,chromiumOptions,inputProps:{audio:false,overlay:false},timeoutInMilliseconds:120000};
 const composition=await selectComposition({...opts,id:'BesoAIResearchZH'});
 for(const [id,fraction,name] of (process.argv.includes('--only-benchmark')?[]:[['hook',.15,'native'],['beso',.95,'beso']])){
  const s=story.scenes.find(s=>s.id===id);
  await renderStill({...opts,composition,frame:s.start+Math.floor(s.duration*fraction),output:path.join(root,'output',`cover-source-${name}.png`),imageFormat:'png'});
 }
 const scene=story.scenes.find(s=>s.id==='zwind');const start=scene.start+60*17;
 const began=Date.now();
 const frames=Number(process.argv.find(v=>v.startsWith('--frames='))?.split('=')[1]??60),concurrency=Number(process.argv.find(v=>v.startsWith('--concurrency='))?.split('=')[1]??3);
 await renderMedia({...opts,inputProps:{audio:false,overlay:true},composition,frameRange:[start,start+frames-1],codec:'h264',crf:17,pixelFormat:'yuv420p',videoImageFormat:'jpeg',jpegQuality:96,concurrency,outputLocation:path.join(root,'output',`benchmark-${frames}frames-c${concurrency}.mp4`)});
 const elapsed=(Date.now()-began)/1000;fs.writeFileSync(path.join(root,'research',`render-benchmark-${concurrency}.json`),JSON.stringify({frames,elapsedS:elapsed,effectiveFps:frames/elapsed,estimatedFullHours:story.duration/frames*elapsed/3600,concurrency,bundle:serveUrl},null,2));console.log('BENCHMARK',elapsed,frames/elapsed);
}finally{await browser.close({silent:true})}
