import path from 'node:path';
import fs from 'node:fs';
import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {configureRenderer,getBrowserExecutable} from './renderer-options.mjs';

const root=process.cwd();
const story=JSON.parse(fs.readFileSync('src/beso-story.json','utf8'));
const scene=story.scenes.find(s=>s.id==='beso');
const output=path.join(root,'public/generated/bridge-last.png');
fs.mkdirSync(path.dirname(output),{recursive:true});
const serveUrl=await bundle({entryPoint:path.join(root,'src/index-beso.tsx'),publicDir:path.join(root,'public'),outDir:path.join(root,'tmp/bridge-frame-bundle')});
const chrome=getBrowserExecutable();
const chromiumOptions=configureRenderer();
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions});
try{
 const options={serveUrl,browserExecutable:chrome,pupeteerInstance:browser,chromiumOptions,inputProps:{audio:false,overlay:false},timeoutInMilliseconds:120000};
 const composition=await selectComposition({...options,id:'BesoAIResearchZH'});
 const frame=scene.start+Math.floor(scene.duration*.95);
 await renderStill({...options,composition,frame,output,imageFormat:'png'});
 fs.writeFileSync(path.join(root,'research/bridge-frame-source.json'),JSON.stringify({frame,scene:'beso',normalizedProgress:.95,sourceGeometry:'beso-research/geometry/state-043.json',overlay:false,output},null,2));
 console.log(output);
}finally{await browser.close({silent:true})}
