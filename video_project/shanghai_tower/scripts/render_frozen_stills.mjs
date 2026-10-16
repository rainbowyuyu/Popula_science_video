// Inspect the exact existing bundle without rebuilding or touching render inputs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {configureRenderer,restoreRendererSelection} from './renderer-options.mjs';
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const option=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const frames=option('frames','').split(',').filter(Boolean).map(Number);
if(!frames.length||frames.some(f=>!Number.isInteger(f)||f<0))throw new Error('Provide --frames=1,2,...');
const serveUrl=path.resolve(root,option('bundle','tmp/bundle'));
if(!fs.existsSync(path.join(serveUrl,'index.html')))throw new Error('Existing bundle is missing');
const out=path.resolve(root,option('out','research/visual-v3/frozen-threshold-stills'));
fs.mkdirSync(out,{recursive:true});
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const renderer=configureRenderer({preferHighPerformanceGpu:process.env.RAINBOW_HIGH_PERFORMANCE_GPU!=='0'});
const {openBrowser,renderStill,selectComposition}=require('@remotion/renderer');
const opts={serveUrl,browserExecutable,chromiumOptions:renderer,inputProps:{audio:false,clean:false}};
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:renderer});
try{
 const composition=await selectComposition({...opts,pupeteerInstance:browser,id:'ShanghaiTower'});
 for(const frame of frames){
  if(frame>=composition.durationInFrames)throw new Error('Frame outside composition');
  const output=path.join(out,`frame-${String(frame).padStart(6,'0')}.jpg`);
  if(fs.existsSync(output))throw new Error('Refusing to overwrite '+output);
  await renderStill({...opts,pupeteerInstance:browser,composition,frame,output,imageFormat:'jpeg',jpegQuality:95,timeoutInMilliseconds:120000});
  console.log('Frozen-bundle still',frame);
 }
}finally{await browser.close({silent:true});restoreRendererSelection();}
