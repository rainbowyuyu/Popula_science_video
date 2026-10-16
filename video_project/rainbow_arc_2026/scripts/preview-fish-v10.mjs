import {bundle} from '@remotion/bundler';
import {renderStill,renderMedia,selectComposition,openBrowser} from '@remotion/renderer';
import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),out='C:/Users/zju/.codex/visualizations/2026/10/02/01a0fc88-2a0a-7d81-86a9-bfe4cdd86204/rainbow_arc_v10/work/fish-review';
fs.mkdirSync(out,{recursive:true});const previewPublic=path.join(out,'public'),relative='assets_v10/characters/rainbow_fish.glb';
fs.mkdirSync(path.dirname(path.join(previewPublic,relative)),{recursive:true});fs.copyFileSync(path.join(root,'public',relative),path.join(previewPublic,relative));
const serveUrl=await bundle({entryPoint:path.join(root,'work/fish-preview-entry-v10.tsx'),publicDir:previewPublic,outDir:path.join(out,'isolated-bundle')});
const browserExecutable=path.join(root,'work/render-browser-v10/chrome-headless-shell.exe');
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
try{
 const opts={serveUrl,browserExecutable,chromiumOptions:{gl:'angle'},puppeteerInstance:browser};
 const comp=await selectComposition({...opts,id:'FishBeautyV10'});
 if(!process.argv.includes('--clones-only'))for(const frame of [0,60,120,239]){await renderStill({...opts,composition:comp,frame,output:path.join(out,`fish-three-${frame}.png`),imageFormat:'png'});console.log('fish still',frame);}
 const clones=await selectComposition({...opts,id:'FishClonesV10'});
 await renderStill({...opts,composition:clones,frame:120,output:path.join(out,'fish-three-clones.png'),imageFormat:'png'});
 if(!process.argv.includes('--clones-only'))await renderMedia({...opts,composition:comp,codec:'h264',outputLocation:path.join(out,'fish-motion-v10.mp4'),crf:20,concurrency:2});
 console.log('fish motion preview',path.join(out,'fish-motion-v10.mp4'));
}finally{await browser.close({silent:true});}
