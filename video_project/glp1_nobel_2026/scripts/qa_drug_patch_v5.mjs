import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition, openBrowser} from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'research/revision-v5/patches/drug-preview');
fs.mkdirSync(out,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:path.join(out,'bundle')});
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const opts={serveUrl,browserExecutable,chromiumOptions:{gl:'angle'},inputProps:{audio:false,clean:false}};
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions:{gl:'angle'}});
try{
 const composition=await selectComposition({...opts,puppeteerInstance:browser,id:'GLP1'});
 const frames=[7097,7235,7320,7393,7465,7495,7525,7560,7605,7690,7737,7800];
 for(const frame of frames){
  await renderStill({...opts,puppeteerInstance:browser,composition,frame,output:path.join(out,`frame-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:95,timeoutInMilliseconds:120000});
  console.log('Drug preview',frame);
 }
}finally{await browser.close({silent:true});}
