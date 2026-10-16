import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'output/hypertension');fs.mkdirSync(output,{recursive:true});
const tl=JSON.parse(fs.readFileSync(path.join(root,'src/hypertension/timeline.json'),'utf8'));
const tmp=path.join(root,'tmp'),pub=path.join(tmp,'hypertension-public');fs.mkdirSync(pub,{recursive:true});
fs.cpSync(path.join(root,'public/hypertension'),path.join(pub,'hypertension'),{recursive:true,filter:p=>!['voice-raw','voice','voice-raw-history','music.wav','narration.wav','asr'].includes(path.basename(p))});
const bundled=await bundle({entryPoint:path.join(root,'src/index-hypertension.tsx'),publicDir:pub,outDir:path.join(tmp,'hypertension-bundle')});
const installed=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const still=process.argv.includes('stills');
const clean=process.argv.includes('--cover');
const concurrency=Number(process.argv.find(s=>s.startsWith('--concurrency='))?.split('=')[1]??2);
const opts={serveUrl:bundled,browserExecutable:installed,chromiumOptions:{gl:'angle'},inputProps:{audio:!still&&!process.argv.includes('--silent'),clean}};
const browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:{gl:'angle'}});
try{
 const composition=await selectComposition({...opts,pupeteerInstance:browser,id:'Hypertension'});
 if(still){
  const custom=process.argv.find(s=>s.startsWith('--stills='));
  const shots=custom?custom.slice(9).split(',').map(Number):tl.scenes.flatMap(s=>[Math.floor(s.start+(s.end-s.start)*.3),Math.floor(s.start+(s.end-s.start)*.7)]);
  for(const frame of shots){await renderStill({...opts,pupeteerInstance:browser,composition,frame,output:path.join(output,`frame-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:95});console.log('Rendered frame',frame);}
 }else{
  const a=process.argv.find(s=>s.startsWith('--frames='));const range=a?a.slice(9).split('-').map(Number):null;
  if(tl.draft&&!process.argv.includes('--silent'))throw Error('Draft timeline cannot be delivered with narration');
  const start=Date.now();let last=-1;
  await renderMedia({...opts,pupeteerInstance:browser,composition,codec:'h264',outputLocation:path.join(output,range?`segment-${range.join('-')}.mp4`:'hypertension_1080p.mp4'),crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:95,concurrency,timeoutInMilliseconds:120000,...(range?{frameRange:range}:{}),onProgress:p=>{const n=Math.floor(p.progress*100);if(n!==last){console.log('Render',n+'%');last=n}}});
  fs.writeFileSync(path.join(root,'research/hypertension',range?'segment-render.json':'final-render.json'),JSON.stringify({finished:new Date().toISOString(),frames:range??[0,tl.duration-1],seconds:(Date.now()-start)/1000,success:true},null,2));
 }
}finally{await browser.close({silent:true});}
