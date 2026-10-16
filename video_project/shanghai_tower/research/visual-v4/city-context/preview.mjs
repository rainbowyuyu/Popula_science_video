import {bundle} from '@remotion/bundler';
import {renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
const root=process.cwd(),dir=path.join(root,'research/visual-v4/city-context'),run=path.join(root,'tmp/render-runs',`city-context-${process.pid}-${Date.now()}`);
const bundled=await bundle({entryPoint:path.join(dir,'Preview.tsx'),publicDir:path.join(root,'public'),outDir:path.join(run,'bundle')});
const installed=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const opts={serveUrl:bundled,browserExecutable:installed,chromiumOptions:{gl:'angle'},inputProps:{audio:false,clean:true}};
const browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:{gl:'angle'}});
try{const composition=await selectComposition({...opts,pupeteerInstance:browser,id:'ShanghaiCityContextPreview'});for(const frame of [430,6000,10400]){await renderStill({...opts,pupeteerInstance:browser,composition,frame,output:path.join(dir,`context-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:95,timeoutInMilliseconds:120000});console.log('context',frame);}}finally{await browser.close({silent:true});}
