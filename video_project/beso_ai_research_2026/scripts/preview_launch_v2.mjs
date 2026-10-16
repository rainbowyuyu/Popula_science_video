import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill,renderMedia} from '@remotion/renderer';
import {configureRenderer,getBrowserExecutable} from './renderer-options.mjs';
const root=process.cwd();
const flag=(name,fallback)=>process.argv.find(a=>a.startsWith(name+'='))?.slice(name.length+1)??fallback;
const frames=flag('--frames','120,600,1500,2500,3400,4260,5200,5900').split(',').map(Number);
const out=path.resolve(root,flag('--out','output/v2-design-review'));fs.mkdirSync(out,{recursive:true});
const staging=path.join(root,'tmp/v2-preview-public');fs.mkdirSync(staging,{recursive:true});
for(const folder of ['beso-research','screens','generated','brand','assets','audio','environment']){
 fs.cpSync(path.join(root,'public',folder),path.join(staging,folder),{recursive:true,force:true,filter:f=>!(/\.blend\d?$/.test(f))});
}
const serveUrl=await bundle({entryPoint:path.join(root,'src/index-launch-film.tsx'),publicDir:staging,outDir:path.join(root,'tmp/v2-preview-bundle')});
const chromiumOptions=configureRenderer(),browserExecutable=getBrowserExecutable();
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
const common={serveUrl,browserExecutable,chromiumOptions,pupeteerInstance:browser,inputProps:{audio:false,overlay:!process.argv.includes('--clean')},timeoutInMilliseconds:120000};
try{
 const composition=await selectComposition({...common,id:'AIEngineerLaunchFilm'});
 if(process.argv.includes('--video')){
  await renderMedia({...common,composition,frameRange:frames.slice(0,2),outputLocation:path.join(out,'motion.mp4'),codec:'h264',crf:20,scale:Number(flag('--scale','.5')),concurrency:1,onProgress:p=>{if(Math.round(p.progress*100)%20===0)process.stdout.write('.')}});
 }else for(const frame of frames){
  const output=path.join(out,`frame-${String(frame).padStart(6,'0')}.png`);
  await renderStill({...common,composition,frame,output,imageFormat:'png',scale:Number(flag('--scale','.5'))});
  console.log('STILL',frame,output);
 }
}finally{await browser.close({silent:true})}
