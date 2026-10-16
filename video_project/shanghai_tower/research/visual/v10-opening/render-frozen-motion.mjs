import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {configureRenderer,restoreRendererSelection} from '../../../scripts/renderer-options.mjs';
const require=createRequire(import.meta.url),root=process.cwd();
const option=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const manifest=JSON.parse(fs.readFileSync(option('manifest','tmp/stills-v10-opening-handover/stills.json'),'utf8'));
const serveUrl=path.join(manifest.runDir,'bundle'),out=path.resolve(option('out','research/qa/v10-opening'));
if(!fs.existsSync(path.join(serveUrl,'index.html')))throw new Error('Frozen review bundle missing');
fs.mkdirSync(out,{recursive:true});
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const renderer=configureRenderer({preferHighPerformanceGpu:true});
const {openBrowser,selectComposition,renderMedia}=require('@remotion/renderer');
const opts={serveUrl,browserExecutable,chromiumOptions:renderer,inputProps:{audio:true,clean:false}};
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:renderer});
const windows=[{id:'column-to-truss',frames:[850,945]},{id:'columns-to-core',frames:[1395,1470]}],results=[];
try{
 const composition=await selectComposition({...opts,pupeteerInstance:browser,id:'ShanghaiTower'});
 for(const window of windows){
  const outputLocation=path.join(out,window.id+'.mp4');if(fs.existsSync(outputLocation))throw new Error('Review clip already exists '+outputLocation);
  let last=-1;const started=Date.now();
  await renderMedia({...opts,pupeteerInstance:browser,composition,frameRange:window.frames,outputLocation,codec:'h264',crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:95,concurrency:1,scale:.75,timeoutInMilliseconds:120000,onProgress:p=>{const q=Math.floor(p.progress*10)*10;if(q!==last){console.log(window.id,q+'%');last=q;}}});
  results.push({...window,outputLocation,renderSeconds:(Date.now()-started)/1000,sha256:createHash('sha256').update(fs.readFileSync(outputLocation)).digest('hex')});
  fs.writeFileSync(path.join(out,'motion-render.json'),JSON.stringify({bundle:serveUrl,sourceStillManifest:option('manifest','tmp/stills-v10-opening-handover/stills.json'),scope:'Two short motion-review exports from the identical frozen still bundle; not the final film.',scale:.75,results},null,2));
 }
}finally{await browser.close({silent:true});restoreRendererSelection();}
