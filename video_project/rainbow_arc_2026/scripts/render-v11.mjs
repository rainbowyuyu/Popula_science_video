import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputRoot=JSON.parse(fs.readFileSync(path.join(root,'work/output-root-v11.json'),'utf8')).outputRoot;const tmp=path.join(outputRoot,'work');fs.mkdirSync(tmp,{recursive:true});
const bundled=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:path.join(tmp,'bundle')});
const installed=path.resolve(root,'work','render-browser-v10','chrome-headless-shell.exe');
const still=process.argv.includes('stills');const noAudio=process.argv.includes('--silent');
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
if(timeline.notFinal&&!still&&!process.argv.includes('--preview'))throw new Error('The voice timeline is provisional. Only marked previews or stills may be rendered.');
const arg=(name,fallback)=>process.argv.find(s=>s.startsWith(name+'='))?.slice(name.length+1)??fallback;
const defaultShots=timeline.scenes.map(s=>Math.round((s.start+Math.min(3,(s.end-s.start)/2))*30));
const shots=arg('--stills',defaultShots.join(',')).split(',').map(Number);
const browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:{gl:'angle'}});
try{
 const opts={serveUrl:bundled,browserExecutable:installed,chromiumOptions:{gl:'angle'},inputProps:{audio:!noAudio,clean:process.argv.includes('--clean'),plate:process.argv.includes('--plate')},puppeteerInstance:browser};
 const composition=await selectComposition({...opts,id:'RainbowArc'});
 if(still){const folderArg=arg('--folder',path.join(outputRoot,'work/stills'));const folder=path.isAbsolute(folderArg)?folderArg:path.join(root,folderArg);fs.mkdirSync(folder,{recursive:true});const png=process.argv.includes('--png');for(const frame of shots){await renderStill({...opts,composition,frame,output:path.join(folder,`frame-${String(frame).padStart(5,'0')}.${png?'png':'jpg'}`),imageFormat:png?'png':'jpeg',...(!png?{jpegQuality:96}:{})});console.log('still',frame)}}
 else {const outputArg=arg('--output',path.join(outputRoot,'delivery/彩虹为什么是弧形_V11_1080p.mp4'));const out=path.isAbsolute(outputArg)?outputArg:path.join(root,outputArg);fs.mkdirSync(path.dirname(out),{recursive:true});let last=-1;const range=arg('--frames','').split(',').filter(Boolean).map(Number);await renderMedia({...opts,composition,codec:'h264',audioBitrate:'192k',outputLocation:out,crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:94,concurrency:Number(arg('--concurrency','2')),...(range.length===2?{frameRange:range}:{}),onProgress:p=>{const k=Math.floor(p.progress*100);if(k>last){last=k;console.log(`${k}%  rendered ${p.renderedFrames} / encoded ${p.encodedFrames}`)}}});console.log(out)}
}finally{await browser.close({silent:true})}
