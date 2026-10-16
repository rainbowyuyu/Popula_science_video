import path from 'node:path';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';
import {selectComposition,renderStill,renderMedia} from '@remotion/renderer';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const root=path.resolve(here,'../..');
const mode=process.argv[2]||'stills';
const output=path.join(root,'output/v01');fs.mkdirSync(output,{recursive:true});
const checks=path.join(root,'work/v01/checks');fs.mkdirSync(checks,{recursive:true});
const browserOptions={gl:'angle'};
const serveUrl=await bundle({entryPoint:path.join(here,'src/index.ts'),publicDir:path.join(root,'assets/v01'),outDir:path.join(root,'work/v01/bundle'),webpackOverride:(config)=>({...config,cache:false})});
const composition=await selectComposition({serveUrl,id:'MechanismPreview',chromiumOptions:browserOptions});
fs.writeFileSync(path.join(checks,'composition.json'),JSON.stringify(composition,null,2));
if(mode==='stills'){
 for(const frame of [60,270,400,640,710]){
  const outputLocation=path.join(output,`preview-frame-r6-${frame}.png`);
  if(fs.existsSync(outputLocation)){console.log('EXISTS',outputLocation);continue;}
  await renderStill({serveUrl,composition,frame,output:outputLocation,imageFormat:'png',chromiumOptions:browserOptions});console.log('STILL',frame);
 }
}else if(mode==='preview'){
 const outputLocation=path.join(output,`roadster-mechanism-preview-v02${process.env.OUTPUT_SUFFIX??''}.mp4`);
 if(fs.existsSync(outputLocation))throw Error('Output already exists; choose a new version, do not overwrite.');
 let progress=-1;
 await renderMedia({serveUrl,composition,codec:'h264',crf:19,pixelFormat:'yuv420p',audioCodec:'aac',audioBitrate:'192k',outputLocation,concurrency:2,chromiumOptions:browserOptions,onProgress:p=>{const v=Math.floor(p.progress*10);if(v!==progress){progress=v;console.log('RENDER',v*10+'%')}}});
 console.log('PREVIEW',outputLocation);
}else throw Error('Unknown mode');
