import {bundle} from '@remotion/bundler';
import {ensureBrowser,openBrowser,renderMedia,renderStill,selectComposition} from '@remotion/renderer';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(n,d)=>process.argv.find(a=>a.startsWith('--'+n+'='))?.split('=').slice(1).join('=')??d;
const temp=path.join(root,'work/render-temp');fs.mkdirSync(temp,{recursive:true});process.env.TEMP=temp;process.env.TMP=temp;
const dest=path.resolve(arg('bundle-dir',path.join(root,'work/bundle')));
const serveUrl=process.argv.includes('--reuse-bundle')?dest:await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:dest,enableCaching:false});
let chrome=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');if(!fs.existsSync(chrome)){const installed=await ensureBrowser();if(!('path' in installed))throw new Error('Browser unavailable');chrome=installed.path;}
const chromiumOptions={gl:arg('gl','angle')};const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions});
const options={serveUrl,browserExecutable:chrome,chromiumOptions,puppeteerInstance:browser,onBrowserLog:log=>{if(['warn','error'].includes(log.type))console.log('BROWSER',log.text);}};
try{const composition=await selectComposition({...options,id:'Roadster'});console.log(JSON.stringify({frames:composition.durationInFrames,width:1920,height:1080,fps:30}));
 if(process.argv.includes('--stills')||arg('stillframes',null)){
  const n=JSON.parse(fs.readFileSync(path.join(root,'src/narration.json'),'utf8'));
  const frames=arg('stillframes',n.cues.filter((c,i)=>[0,2,5,9,13,15,18,21,24,26,28,30,33].includes(i)).map(c=>Math.round((c.startFrame+c.endFrame)/2)).join(',')).split(',').map(Number);
  const out=path.resolve(arg('stills-dir',path.join(root,'work/stills')));fs.mkdirSync(out,{recursive:true});
  for(const frame of frames){await renderStill({...options,composition,frame,output:path.join(out,`frame-${String(frame).padStart(5,'0')}.jpg`),imageFormat:'jpeg',jpegQuality:96,scale:Number(arg('scale','1')),timeoutInMilliseconds:120000});console.log('still',frame);}
 }else{const range=arg('frames',null);if(range&&!arg('output',null))throw new Error('Partial output must be named');const output=path.resolve(arg('output',path.resolve(root,'../../output/v04/Roadster_倒挂与飞行翻滚_1080p.mp4')));fs.mkdirSync(path.dirname(output),{recursive:true});let last=-1;const start=Date.now();
  await renderMedia({...options,composition,codec:'h264',outputLocation:output,crf:17,videoImageFormat:'jpeg',jpegQuality:95,concurrency:Number(arg('concurrency','3')),timeoutInMilliseconds:120000,scale:Number(arg('scale','1')),...(range?{frameRange:range.split('-').map(Number)}:{}),onProgress:p=>{const q=Math.floor(p.progress*100);if(q!==last){last=q;console.log('render',q+'%',Math.round((Date.now()-start)/1000)+'s');}}});
  if(process.argv.includes('--audio')&&!range){const mixed=path.join(root,'work/master-mux.mp4');const r=spawnSync('ffmpeg',['-v','error','-y','-i',output,'-i',path.join(root,'public/audio/master.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-ac','2','-t',String(composition.durationInFrames/30),'-movflags','+faststart',mixed],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);fs.renameSync(mixed,output);}console.log('OUTPUT',output);
 }
}finally{await browser.close({silent:true});}
