import {bundle} from '@remotion/bundler';
import {renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs/promises';
const root=process.cwd(),dir=path.join(root,'research/visual-v4'),run=path.join(root,'tmp/render-runs',`pressure-qa-${process.pid}-${Date.now()}`);
await fs.mkdir(path.join(run,'empty-public'),{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(dir,'PressureShaderPreview.tsx'),publicDir:path.join(run,'empty-public'),outDir:path.join(run,'bundle')});
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const chromiumOptions={gl:'angle'},browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
const opts={serveUrl,browserExecutable,chromiumOptions,pupeteerInstance:browser};
try{const composition=await selectComposition({...opts,id:'PressureShaderQA'});await renderStill({...opts,composition,frame:30,output:path.join(dir,'pressure-shader-qa.jpg'),imageFormat:'jpeg',jpegQuality:95,timeoutInMilliseconds:60000,onBrowserLog:log=>{if(log.type==='error')console.error(log.text);}});console.log('Wrote isolated pressure-shader-qa.jpg');}finally{await browser.close({silent:true});}
