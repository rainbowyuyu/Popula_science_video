import {bundle} from '@remotion/bundler';
import {renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import path from 'node:path';import fs from 'node:fs';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const out=path.join(root,'output/metro/cover-artwork');fs.mkdirSync(out,{recursive:true});
const minimal=path.join(root,'tmp/metro-cover/public');fs.mkdirSync(path.join(minimal,'metro'),{recursive:true});
fs.cpSync('public/metro/physics',path.join(minimal,'metro/physics'),{recursive:true});
const url=await bundle({entryPoint:path.join(root,'src/index-metro-cover.tsx'),publicDir:minimal,outDir:path.join(root,'tmp/metro-cover/bundle')});
const chrome=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions:{gl:'angle'}});
try{
 for(const ratio of (process.argv[2]?process.argv[2].split(','):['16x9','4x3','3x4','9x16'])){
  const opts={serveUrl:url,browserExecutable:chrome,chromiumOptions:{gl:'angle'},puppeteerInstance:browser,inputProps:{ratio}};
  const composition=await selectComposition({...opts,id:'Cover-'+ratio});
  await renderStill({...opts,composition,frame:0,output:path.join(out,'metro-light-'+ratio+'.png'),imageFormat:'png',timeoutInMilliseconds:120000,onBrowserLog:log=>{
   if(log.text.startsWith('COVER_AUDIT '))fs.writeFileSync(path.join(out,'audit-'+ratio+'.json'),JSON.stringify(JSON.parse(log.text.slice(12)),null,2));
   if(log.type==='error')console.error(log.text);
  }});
  console.log('Rendered',ratio);
 }
}finally{await browser.close({silent:true});}
