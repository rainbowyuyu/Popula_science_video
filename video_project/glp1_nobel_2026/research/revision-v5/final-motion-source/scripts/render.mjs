import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
const sha=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const output=path.join(root,'delivery');fs.mkdirSync(output,{recursive:true});
const tmp=path.join(root,'tmp');fs.mkdirSync(tmp,{recursive:true});
const tl=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
const inputTimelineSHA=sha(path.join(root,'src/timeline.json'));
const inputMasterSHA=sha(path.join(root,'public/master.wav'));
const bundled=await bundle({entryPoint:path.join(root,'src/index.tsx'),publicDir:path.join(root,'public'),outDir:path.join(tmp,'bundle')});
const installed=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const still=process.argv.includes('stills'),clean=process.argv.includes('--clean');
const concurrency=Number(process.argv.find(s=>s.startsWith('--concurrency='))?.split('=')[1]??2);
const opts={serveUrl:bundled,browserExecutable:installed,chromiumOptions:{gl:'angle'},inputProps:{audio:!still&&!process.argv.includes('--silent'),clean}};
const browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:{gl:'angle'}});
try{
 const composition=await selectComposition({...opts,puppeteerInstance:browser,id:'GLP1'});
 if(still){
  fs.mkdirSync(path.join(tmp,'stills'),{recursive:true});const custom=process.argv.find(s=>s.startsWith('--stills='));
  const shots=custom?custom.slice(9).split(',').map(Number):tl.clips.filter((_,i)=>process.argv.includes('--all')||i%3===0).map(s=>Math.floor(s.start+s.duration*.7));
  for(const frame of shots){await renderStill({...opts,puppeteerInstance:browser,composition,frame,output:path.join(tmp,'stills',`${clean?'clean':'frame'}-${frame}.jpg`),imageFormat:'jpeg',jpegQuality:95,timeoutInMilliseconds:120000});console.log('Rendered frame',frame);}
 }else{
  const a=process.argv.find(s=>s.startsWith('--frames='));const range=a?a.slice(9).split('-').map(Number):null;
  const start=Date.now();let last=-1;const outputName=process.argv.find(s=>s.startsWith('--output='))?.slice(9)??'GLP1_1080p.mp4';
  if(path.basename(outputName)!==outputName)throw new Error('Output must be a filename within delivery.');
  const outputLocation=path.join(range?tmp:output,range?`segment-${range.join('-')}.mp4`:outputName);
  await renderMedia({...opts,puppeteerInstance:browser,composition,codec:'h264',outputLocation,crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:95,concurrency,timeoutInMilliseconds:120000,...(range?{frameRange:range}:{}),onProgress:p=>{const n=Math.floor(p.progress*100);if(n!==last){console.log('Render',n+'%');last=n}}});
  const probe=()=>{const p=spawnSync('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=color_space,color_transfer,color_primaries','-of','json',outputLocation],{encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);return JSON.parse(p.stdout).streams[0];};
  const color=probe();
  if(['color_space','color_transfer','color_primaries'].some(k=>color[k]!=='bt709')){
   const corrected=outputLocation.replace(/\.mp4$/,'.color.mp4');
   const fix=spawnSync('ffmpeg',['-hide_banner','-nostdin','-v','error','-y','-i',outputLocation,'-map','0','-c','copy','-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-bsf:v','h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1','-movflags','+faststart+write_colr',corrected],{encoding:'utf8'});
   if(fix.status!==0)throw Error(fix.stderr);fs.renameSync(corrected,outputLocation);
   if(['color_space','color_transfer','color_primaries'].some(k=>probe()[k]!=='bt709'))throw Error('BT709 metadata verification failed');
  }
  if(inputTimelineSHA!==sha(path.join(root,'src/timeline.json'))||inputMasterSHA!==sha(path.join(root,'public/master.wav')))throw new Error('Locked timeline or audio changed during render; output cannot be marked final.');
  fs.writeFileSync(path.join(tmp,range?'segment-render.json':'final-render.json'),JSON.stringify({finished:new Date().toISOString(),frames:range??[0,tl.duration-1],seconds:(Date.now()-start)/1000,outputLocation,success:true,timelineSHA256:inputTimelineSHA,masterSHA256:inputMasterSHA,videoSHA256:sha(outputLocation)},null,2));
 }
}finally{await browser.close({silent:true});}
