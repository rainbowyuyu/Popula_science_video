import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
import {bundle} from '@remotion/bundler';import {selectComposition,renderStill,renderMedia} from '@remotion/renderer';
const here=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),root=path.resolve(here,'../..');
const mode=process.argv[2]??'stills',out=path.join(root,'output/v03'),work=path.join(root,'work/v03');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(work,{recursive:true});
const chromiumOptions={gl:'angle'};
const serveUrl=await bundle({entryPoint:path.join(here,'src/index.ts'),publicDir:path.join(root,'assets/v01'),outDir:path.join(work,'bundle'),webpackOverride:c=>({...c,cache:false})});
const composition=await selectComposition({serveUrl,id:'MechanismPreview',chromiumOptions});
fs.writeFileSync(path.join(work,'composition.json'),JSON.stringify(composition,null,2));
if(mode==='stills'){
 for(const frame of [60,375,380,400,497,538,650,672,715]){
  const output=path.join(out,`crosscheck-frame-${frame}.png`);if(fs.existsSync(output)){console.log('EXISTS',frame);continue;}
  await renderStill({serveUrl,composition,frame,output,imageFormat:'png',chromiumOptions});console.log('STILL',frame);
 }
}else if(mode==='preview'){
 const outputLocation=path.join(work,'picture-only.mp4');if(fs.existsSync(outputLocation))throw Error('Already rendered; do not overwrite');
 let last=-1;await renderMedia({serveUrl,composition,codec:'h264',crf:19,pixelFormat:'yuv420p',muted:true,outputLocation,concurrency:2,chromiumOptions,onProgress:p=>{const n=Math.floor(p.progress*10);if(n!==last){last=n;console.log('RENDER',n*10+'%')}}});console.log('PICTURE_OK',outputLocation);
}else throw Error('Unknown mode');
