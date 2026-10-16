import fs from 'node:fs';
import path from 'node:path';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {configureRenderer,getBrowserExecutable} from './renderer-options.mjs';
const root=process.cwd(),out=path.join(root,'output/launch-qa');fs.mkdirSync(out,{recursive:true});
const chromiumOptions=configureRenderer(),browserExecutable=getBrowserExecutable();
const serveUrl=await bundle({entryPoint:path.join(root,'src/index-launch-film.tsx'),publicDir:path.join(root,'public'),outDir:path.join(root,'tmp/launch-qa-bundle')});
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
const common={serveUrl,browserExecutable,chromiumOptions,pupeteerInstance:browser,inputProps:{audio:false,overlay:true},timeoutInMilliseconds:120000};
try{const composition=await selectComposition({...common,id:'AIEngineerLaunchFilm'});for(const seconds of [0,2,6,10,22,31,40,48,56,70,84,100]){await renderStill({...common,composition,frame:seconds*60,scale:.5,imageFormat:'jpeg',jpegQuality:94,output:path.join(out,`frame-${String(seconds).padStart(3,'0')}.jpg`)});console.log('STILL',seconds)}}finally{await browser.close({silent:true})}
