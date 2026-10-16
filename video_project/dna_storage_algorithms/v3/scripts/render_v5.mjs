import {bundle} from '@remotion/bundler';
import {openBrowser,renderMedia,renderStill,selectComposition} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const project=path.resolve(root,'..');
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.split('=').slice(1).join('=')??fallback;
const bundleDir=path.join(root,'work/bundle-v5');
const serveUrl=process.argv.includes('--reuse-bundle')?bundleDir:await bundle({entryPoint:path.join(root,'src/indexV5.tsx'),publicDir:path.join(root,'public'),outDir:bundleDir});
const chrome=path.join(project,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const chromiumOptions={gl:arg('gl','vulkan')};
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions});
// For a full master, mux the validated WAV directly after the visual render.
// Remotion's concatenated audio path added two AAC blocks of offset locally.
const options={serveUrl,browserExecutable:chrome,chromiumOptions,inputProps:{audio:process.argv.includes('--audio')&&Boolean(arg('frames',null))},puppeteerInstance:browser};
const started=Date.now();
try{
 const composition=await selectComposition({...options,id:'DNAStorageV5'});
 console.log(JSON.stringify({composition:composition.id,frames:composition.durationInFrames,fps:composition.fps,width:composition.width,height:composition.height,gl:chromiumOptions.gl}));
 if(process.argv.includes('--stills')||arg('stillframes',null)){
  const out=path.resolve(arg('stills-dir',path.join(root,'work/visual-v5')));fs.mkdirSync(out,{recursive:true});
  const frames=arg('stillframes','180,870,1740,3270,4290,5910,7170,8280,8925').split(',').map(Number);
  for(const frame of frames){
   if(!Number.isInteger(frame)||frame<0||frame>=composition.durationInFrames)throw new Error(`Invalid still frame ${frame}`);
   await renderStill({...options,composition,frame,output:path.join(out,`frame-${String(frame).padStart(5,'0')}.jpg`),imageFormat:'jpeg',jpegQuality:95,timeoutInMilliseconds:120000,scale:Number(arg('scale','1'))});
   console.log(`frame ${frame} complete`);
  }
 }else{
  const range=arg('frames',null);const frameRange=range?range.split('-').map(Number):undefined;
  if(range&&!arg('output',null))throw new Error('Partial previews require --output=unique.mp4; master is protected.');
  const output=path.resolve(arg('output',path.join(root,'delivery/DNA存储_连续数据之旅_V5_1080p.mp4')));
  if(output.includes('V3_1080p'))throw new Error('V3 rollback master is protected.');
  fs.mkdirSync(path.dirname(output),{recursive:true});
  let reported=-1;await renderMedia({...options,composition,codec:'h264',outputLocation:output,crf:18,videoImageFormat:'jpeg',jpegQuality:94,concurrency:Number(arg('concurrency','3')),timeoutInMilliseconds:120000,scale:Number(arg('scale','1')),...(frameRange?{frameRange}:{}),onProgress:p=>{
   const q=Math.floor(p.progress*100);if(q!==reported){reported=q;console.log(`render ${q}% | ${((Date.now()-started)/1000).toFixed(0)}s elapsed`);}
  }});
  if(process.argv.includes('--audio')&&!range){
   const muxed=path.join(root,'work',path.basename(output)+'.mux.mp4');
   const mixed=spawnSync('ffmpeg',['-v','error','-y','-i',output,'-i',path.join(root,'public/audio/v5/master.wav'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','256k','-ar','48000','-ac','2','-t',String(composition.durationInFrames/composition.fps),'-movflags','+faststart',muxed],{encoding:'utf8'});
   if(mixed.status!==0)throw new Error(`Final master audio mux failed: ${mixed.stderr}`);
   fs.copyFileSync(muxed,output);
   console.log('Verified-duration WAV mux completed; video stream copied.');
  }
  console.log(output);
 }
 console.log(`finished in ${((Date.now()-started)/1000).toFixed(1)} seconds`);
}finally{await browser.close({silent:true});}
