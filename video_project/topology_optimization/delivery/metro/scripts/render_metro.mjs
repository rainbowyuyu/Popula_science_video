import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';import path from 'node:path';import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');process.chdir(root);
const out=path.join(root,'output/metro');fs.mkdirSync(out,{recursive:true});fs.mkdirSync(path.join(root,'tmp/metro'),{recursive:true});
const tl=JSON.parse(fs.readFileSync('public/metro/timeline.json','utf8'));
const minimal=path.join(root,'tmp/metro/public');fs.mkdirSync(minimal,{recursive:true});fs.cpSync(path.join(root,'public/metro'),path.join(minimal,'metro'),{recursive:true});
const url=await bundle({entryPoint:path.join(root,'src/index-metro.tsx'),publicDir:minimal,outDir:path.join(root,'tmp/metro/bundle')});
const chrome=process.env.METRO_BROWSER||path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions:{gl:'angle'}});
const args={serveUrl:url,browserExecutable:chrome,chromiumOptions:{gl:'angle'},pupeteerInstance:browser,inputProps:{audio:!process.argv.includes('stills'),clean:process.argv.includes('--clean')}};
try{const comp=await selectComposition({...args,id:'MetroSafety'});
 if(process.argv.includes('stills')){const f=process.argv.find(s=>s.startsWith('--frames='));const frames=f?f.split('=')[1].split(',').map(Number):tl.scenes.map(s=>Math.round(s.start+(s.end-s.start)*.58));for(const frame of frames){await renderStill({...args,composition:comp,frame,output:path.join(out,`${process.argv.includes('--clean')?'clean':'frame'}-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:95});console.log('Still',frame)}}
 else{const arg=process.argv.find(s=>s.startsWith('--frames='));const range=arg?arg.split('=')[1].split('-').map(Number):null;let tick=-1;await renderMedia({...args,composition:comp,codec:'h264',outputLocation:path.join(out,range?'segment-'+range.join('-')+'.mp4':'metro_safety_1080p.mp4'),crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:94,concurrency:Number(process.env.METRO_CONCURRENCY||1),timeoutInMilliseconds:120000,...(range?{frameRange:range}:{}),onProgress:p=>{const n=Math.floor(p.progress*100);if(n!==tick){tick=n;console.log('Render',n+'%')}}});}
}finally{await browser.close({silent:true})}

