import {bundle} from '@remotion/bundler';
import {openBrowser,renderMedia,renderStill,selectComposition} from '@remotion/renderer';
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');const project=path.resolve(root,'..');
const arg=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.split('=').slice(1).join('=')??fallback;
fs.mkdirSync(path.join(root,'delivery'),{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:path.join(root,'tmp-bundle')});
const chrome=path.join(project,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const chromiumOptions={gl:arg('gl','angle')};const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions});
const options={serveUrl,browserExecutable:chrome,chromiumOptions,inputProps:{audio:process.argv.includes('--audio')},puppeteerInstance:browser};
try{
 const composition=await selectComposition({...options,id:'DNAStorageV3'});
 if(process.argv.includes('--stills')||arg('stillframes',null)){
  const frames=arg('stillframes','180,930,1740,2910,4350,5640,7140,8310,8925').split(',').map(Number);
  for(const frame of frames){await renderStill({...options,composition,frame,output:path.join(root,'delivery',`frame-${String(frame).padStart(5,'0')}.jpg`),imageFormat:'jpeg',jpegQuality:95,timeoutInMilliseconds:120000,scale:Number(arg('scale','1'))});console.log(`frame ${frame} complete`);}
 }else{
  const range=arg('frames',null);const frameRange=range?range.split('-').map(Number):undefined;
  if(range&&!arg('output',null))throw new Error('Partial previews require --output=unique.mp4; master is protected.');
  const output=arg('output',path.join(root,'delivery/DNA存储_连续数据之旅_V3_1080p.mp4'));
  let reported=-1;await renderMedia({...options,composition,codec:'h264',outputLocation:path.resolve(output),crf:18,videoImageFormat:'jpeg',jpegQuality:94,concurrency:Number(arg('concurrency','2')),timeoutInMilliseconds:120000,scale:Number(arg('scale','1')),...(frameRange?{frameRange}:{}),onProgress:p=>{const q=Math.floor(p.progress*20);if(q!==reported){reported=q;console.log(`render ${q*5}%`);}}});console.log(output);
 }
}finally{await browser.close({silent:true});}
