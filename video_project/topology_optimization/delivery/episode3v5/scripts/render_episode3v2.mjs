import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser,ensureBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';import path from 'node:path';import fs from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); process.chdir(root);
const output=path.join(root,'output/episode3'); fs.mkdirSync(output,{recursive:true}); fs.mkdirSync(path.join(root,'tmp'),{recursive:true});
const timeline=JSON.parse(fs.readFileSync(path.join(root,'public/episode3v2/timeline.json'),'utf8'));
let progressTick=-1;
const minimalPublic=path.join(root,'tmp/episode3-public');fs.mkdirSync(minimalPublic,{recursive:true});fs.cpSync(path.join(root,'public/episode3v2'),path.join(minimalPublic,'episode3v2'),{recursive:true});
const bundled=await bundle({entryPoint:path.join(root,'src/index-episode3v2.tsx'),publicDir:minimalPublic,outDir:path.join(root,'tmp/episode3-bundle')});
const installed=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const browserStatus=fs.existsSync(installed)?{path:installed}:await ensureBrowser();
if(!('path' in browserStatus))throw Error('Remotion browser could not be installed');
const chrome=browserStatus.path;
const options={serveUrl:bundled,browserExecutable:chrome,chromiumOptions:{gl:'angle'},inputProps:{audio:!process.argv.includes('stills')}};
// Keep one Chrome page for this scene-heavy episode. Four concurrent WebGL
// pages exceed the headless GPU memory budget on the production machine.
const renderConcurrency=Number(process.env.RENDER_CONCURRENCY||1);
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromiumOptions:{gl:'angle'}});
const comp=await selectComposition({...options,pupeteerInstance:browser,id:'JoineryEpisode3V2'});
if(process.argv.includes('stills')){const custom=process.argv.find(x=>x.startsWith('--stills='));const shots=custom?custom.split('=')[1].split(',').map(f=>({id:'frame-'+f,start:Number(f),end:Number(f)})):timeline.scenes;for(const s of shots){const frame=Math.floor(s.start+(s.end-s.start)*.58);await renderStill({...options,pupeteerInstance:browser,composition:comp,frame,output:path.join(output,s.id+'.jpg'),imageFormat:'jpeg',jpegQuality:95});console.log('still',s.id,frame)}}
else {const rangeArg=process.argv.find(x=>x.startsWith('--frames='));const range=rangeArg?rangeArg.split('=')[1].split('-').map(Number):null;const out=path.join(output,range?'segment-'+range.join('-')+'.mp4':'joinery_v5_1080p.mp4');await renderMedia({...options,pupeteerInstance:browser,composition:comp,codec:'h264',outputLocation:out,crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:94,concurrency:renderConcurrency,timeoutInMilliseconds:90000,...(range?{frameRange:range}:{}),onProgress:p=>{const tick=Math.floor(p.progress*20);if(tick!==progressTick){progressTick=tick;console.log('Render',Math.floor(p.progress*100)+'%')}}});console.log(out)}
await browser.close({silent:true});
