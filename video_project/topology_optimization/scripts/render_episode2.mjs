import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';import path from 'node:path';import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); process.chdir(root);
const output=path.join(root,'output/episode2'); fs.mkdirSync(output,{recursive:true}); fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
const timeline=JSON.parse(fs.readFileSync(path.join(root,'public/episode2/timeline.json'),'utf8'));
const bundled=await bundle({entryPoint:path.join(root,'src/index-episode2.tsx'),publicDir:path.join(root,'public'),outDir:path.join(root,'tmp/episode2-bundle')});
const chrome=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const options={serveUrl:bundled,browserExecutable:chrome,chromiumOptions:{gl:'angle'},inputProps:{audio:!process.argv.includes('stills')}};
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions:{gl:'angle'}});
const comp=await selectComposition({...options,pupeteerInstance:browser,id:'RainbowArcEpisode2'});
if(process.argv.includes('stills')){for(const s of timeline.scenes){const frame=Math.floor(s.start+(s.end-s.start)*.58);await renderStill({...options,pupeteerInstance:browser,composition:comp,frame,output:path.join(output,s.id+'.jpg'),imageFormat:'jpeg',jpegQuality:95});console.log('still',s.id,frame)}}
else {const rangeArg=process.argv.find(x=>x.startsWith('--frames='));const range=rangeArg?rangeArg.split('=')[1].split('-').map(Number):null;const out=path.join(output,range?'references-segment.mp4':'彩虹为什么是弧形_1080p.mp4'); await renderMedia({...options,pupeteerInstance:browser,composition:comp,codec:'h264',outputLocation:out,crf:18,videoImageFormat:'jpeg',jpegQuality:94,concurrency:4,timeoutInMilliseconds:90000,...(range?{frameRange:range}:{}),onProgress:p=>{if(Math.floor(p.progress*20)!==Math.floor((p.progress-.0001)*20))console.log('Render',Math.floor(p.progress*100)+'%')}});console.log(out)}
await browser.close({silent:true});
