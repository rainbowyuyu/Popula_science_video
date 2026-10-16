// Resumeable visual-only export from the exact frozen v8 bundle.
// Keep completed segments outside OS temporary directories. No source edits,
// no changes to machine-wide environment, and no automatic delivery approval.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {configureRenderer,restoreRendererSelection} from './renderer-options.mjs';

const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const verify=process.argv.includes('--verify');
const out=path.join(root,verify?'tmp/v8-final4-codec-check':'tmp/v8-final4-segments');
const scratch=path.join(out,'scratch');
const serveUrl='C:/Users/zju/.codex/visualizations/2026/10/08/01a11ae1-4ffb-79e2-b2fc-3add8874f339/shanghai-render-runs/v8-label-right-check-8264-1791535894715/bundle';
fs.mkdirSync(scratch,{recursive:true});
// Only this Node process and its children use this project-owned scratch path.
process.env.TEMP=scratch;process.env.TMP=scratch;
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const lock=JSON.parse(fs.readFileSync(path.join(root,'research/visual/v8-production-lock4.json'),'utf8'));
for(const [relative,digest] of Object.entries(lock.files)){
 if(sha(path.join(root,relative))!==digest)throw new Error('Changed production input: '+relative);
 if(relative.startsWith('public/')&&sha(path.join(serveUrl,relative))!==digest)throw new Error('Frozen bundle public mismatch: '+relative);
}
const bundleFiles={};
for(const name of fs.readdirSync(serveUrl).sort())if(fs.statSync(path.join(serveUrl,name)).isFile())bundleFiles[name]=sha(path.join(serveUrl,name));
const bundleFingerprint=crypto.createHash('sha256').update(JSON.stringify(bundleFiles)).digest('hex');
const tl=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
if(tl.duration!==15712||tl.fps!==30)throw new Error('Unexpected locked timeline');
const manifestFile=path.join(out,'segments.json');
const manifest=fs.existsSync(manifestFile)?JSON.parse(fs.readFileSync(manifestFile,'utf8')):{
 tag:'v8-final4',status:'rendering',startedAt:new Date().toISOString(),
 productionLock:'research/visual/v8-production-lock4.json',bundle:serveUrl,
 bundleFingerprint,bundleFiles,timelineSHA256:sha(path.join(root,'src/timeline.json')),
 masterSHA256:sha(path.join(root,'public/master.wav')),totalFrames:tl.duration,fps:30,
 settings:{crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',jpegQuality:95,concurrency:1,gopSize:60,audio:false},segments:[]
};
if(manifest.bundleFingerprint!==bundleFingerprint||manifest.timelineSHA256!==sha(path.join(root,'src/timeline.json')))throw new Error('Resume inputs differ');
const save=()=>{fs.writeFileSync(manifestFile+'.tmp',JSON.stringify(manifest,null,2));fs.renameSync(manifestFile+'.tmp',manifestFile)};
const inspect=(file,start,end)=>{
 const data=JSON.parse(execFileSync('C:/ffmpeg/bin/ffprobe.exe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',windowsHide:true}));
 const v=data.streams.find(s=>s.codec_type==='video');
 if(data.streams.length!==1||!v||v.codec_name!=='h264'||v.width!==1920||v.height!==1080||v.avg_frame_rate!=='30/1'||Number(v.nb_frames)!==end-start+1||v.pix_fmt!=='yuv420p'||v.color_space!=='bt709'||v.color_transfer!=='bt709'||v.color_primaries!=='bt709')throw new Error('Invalid segment '+file);
 return {start,end,outputLocation:file,sha256:sha(file),frames:Number(v.nb_frames),width:v.width,height:v.height,fps:30,stream:v};
};
for(const s of manifest.segments){if(sha(s.outputLocation)!==s.sha256)throw new Error('Completed segment changed');inspect(s.outputLocation,s.start,s.end)}
save();
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe');
const chromiumOptions=configureRenderer({preferHighPerformanceGpu:true});
const {openBrowser,renderMedia,selectComposition}=require('@remotion/renderer');
const opts={serveUrl,browserExecutable,chromiumOptions,inputProps:{audio:false,clean:false}};
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
try{
 const composition=await selectComposition({...opts,pupeteerInstance:browser,id:'ShanghaiTower'});
 if(composition.durationInFrames!==tl.duration||composition.fps!==30)throw new Error('Bundle timeline mismatch');
 const ranges=verify?[[1770,1799],[1800,1830]]:Array.from({length:Math.ceil(tl.duration/1800)},(_,i)=>[i*1800,Math.min(tl.duration-1,(i+1)*1800-1)]);
 const count=ranges.length;
 for(let i=0;i<count;i++){
  const [start,end]=ranges[i];
  if(manifest.segments.some(s=>s.start===start&&s.end===end)){console.log(`Already saved segment ${i+1}/${count}`);continue;}
  const file=path.join(out,`visual-${String(i+1).padStart(2,'0')}-${start}-${end}.mp4`);
  let last=-1;
  await renderMedia({...opts,pupeteerInstance:browser,composition,codec:'h264',outputLocation:file,
   crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',imageFormat:'jpeg',jpegQuality:95,
   concurrency:1,gopSize:60,muted:true,enforceAudioTrack:false,timeoutInMilliseconds:120000,
   ffmpegOverride:({args,type})=>type==='pre-stitcher'?[...args.slice(0,-1),'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-x264-params','colorprim=bt709:transfer=bt709:colormatrix=bt709',args.at(-1)]:args,
   frameRange:[start,end],onProgress:p=>{const step=Math.floor(p.progress*10);if(step!==last){last=step;console.log(`Segment ${i+1}/${count}: ${step*10}% | frames ${start}-${end}`)}}
  });
  manifest.segments.push({...inspect(file,start,end),finishedAt:new Date().toISOString(),originTag:'v8-final4',originProductionLock:manifest.productionLock,originBundleFingerprint:bundleFingerprint,reused:false});
  manifest.segments.sort((a,b)=>a.start-b.start);save();
  console.log(`SAVED ${i+1}/${count} | ${manifest.segments.reduce((n,s)=>n+s.frames,0)}/${tl.duration} verified frames`);
 }
 for(const [relative,digest] of Object.entries(lock.files))if(sha(path.join(root,relative))!==digest)throw new Error('Production input changed during segmented render');
 manifest.status='silent-complete';manifest.finishedAt=new Date().toISOString();save();
 console.log('All silent segments saved and verified. Final mux and QA remain required.');
}catch(error){manifest.status='failed-resumeable';manifest.lastError=String(error);save();throw error}
finally{await browser.close({silent:true});restoreRendererSelection();}
