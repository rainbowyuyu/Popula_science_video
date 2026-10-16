import {bundle} from '@remotion/bundler';
import {renderStill,renderMedia,selectComposition,openBrowser} from '@remotion/renderer';
import fs from 'node:fs';import path from 'node:path';
const root=process.cwd(),out='C:/Users/zju/.codex/visualizations/2026/10/02/01a0fc88-2a0a-7d81-86a9-bfe4cdd86204/rainbow_arc_v09/work/observer-review';fs.mkdirSync(out,{recursive:true});
const previewPublic=path.join(out,'public'),assetRelative='assets_v09/characters/robot_expressive/RobotExpressive-original.glb';
fs.mkdirSync(path.dirname(path.join(previewPublic,assetRelative)),{recursive:true});fs.copyFileSync(path.join(root,'public',assetRelative),path.join(previewPublic,assetRelative));
const serveUrl=await bundle({entryPoint:path.join(root,'work/observer-preview-entry-v09.tsx'),publicDir:previewPublic,outDir:path.join(out,'bundle')});
const browserExecutable=path.join(root,'work/render-browser-v09/chrome-headless-shell.exe');
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
try{const opts={serveUrl,browserExecutable,chromiumOptions:{gl:'angle'},puppeteerInstance:browser};const composition=await selectComposition({...opts,id:'ObserverReviewV09'});for(const frame of [0,30,60]){await renderStill({...opts,composition,frame,output:path.join(out,`robot-finished-${frame}.png`),imageFormat:'png'});console.log('observer preview',frame);}
  const motion=await selectComposition({...opts,id:'ObserverMotionV09'});
  await renderMedia({...opts,composition:motion,codec:'h264',outputLocation:path.join(out,'robot-walking-v09.mp4'),crf:20,concurrency:2});
  console.log('observer motion preview rendered',path.join(out,'robot-walking-v09.mp4'));
}finally{await browser.close({silent:true});}
