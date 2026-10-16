import {bundle} from '@remotion/bundler';
import {renderStill,renderMedia,selectComposition,openBrowser} from '@remotion/renderer';
import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),out=path.join(root,'research/v15/environment/review'),scratch=path.join(root,'work/gaussian-preview-v15');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(scratch,{recursive:true});const empty=path.join(scratch,'empty');fs.mkdirSync(empty,{recursive:true});
const bundleDir=path.join(scratch,'bundle-'+new Date().toISOString().replace(/[^0-9]/g,''));
const serveUrl=await bundle({entryPoint:path.join(root,'work/gaussian-preview-entry-v15.tsx'),publicDir:empty,outDir:bundleDir});
const publicDir=path.join(bundleDir,'public');if(fs.existsSync(publicDir))fs.rmdirSync(publicDir);fs.symlinkSync(path.join(root,'public'),publicDir,'junction');
const browserExecutable=path.resolve(root,'work/render-browser-v10/chrome-headless-shell.exe');
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
try{
 const mesh=process.argv.includes('--mesh'),prefix=mesh?'mesh-garden':'gaussian-garden';
 const opts={serveUrl,browserExecutable,chromiumOptions:{gl:'angle'},puppeteerInstance:browser,timeoutInMilliseconds:120000};const composition=await selectComposition({...opts,id:mesh?'GardenMeshBeautyV15':'GaussianBeautyV15'});
 for(const frame of [0,60,120,180,240]){await renderStill({...opts,composition,frame,output:path.join(out,`${prefix}-${String(frame).padStart(3,'0')}.png`),imageFormat:'png'});console.log(prefix,frame);}
 if(process.argv.includes('--motion'))await renderMedia({...opts,composition,codec:'h264',outputLocation:path.join(out,'gaussian-garden-motion-v15.mp4'),crf:19,concurrency:2});
}finally{await browser.close({silent:true});}
