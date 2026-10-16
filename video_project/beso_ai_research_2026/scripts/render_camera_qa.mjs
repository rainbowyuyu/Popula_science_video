import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {configureRenderer,getBrowserExecutable} from './renderer-options.mjs';

const root=process.cwd(),stamp=Date.now().toString(),out=path.join(root,'work','camera-qa',stamp);
fs.mkdirSync(out,{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index-launch-film.tsx'),publicDir:path.join(root,'public'),outDir:path.join(root,'tmp','camera-qa-'+stamp)});
const browserExecutable=getBrowserExecutable(),chromiumOptions=configureRenderer();
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
const common={serveUrl,browserExecutable,pupeteerInstance:browser,chromiumOptions,inputProps:{audio:false,overlay:true},timeoutInMilliseconds:120000};
try{
 const composition=await selectComposition({...common,id:'AIEngineerLaunchFilm'});
 const frames=(process.argv[2]??'3900,3960,4050,4190,4380,4590').split(',').map(Number);
 for(const frame of frames){await renderStill({...common,composition,frame,output:path.join(out,`frame-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:92});console.log('STILL',frame);}
 console.log('OUTPUT',out);
}finally{await browser.close({silent:true});}
