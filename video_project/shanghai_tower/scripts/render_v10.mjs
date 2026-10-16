// Render resumable silent segments exclusively from an immutable production bundle.
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
import {configureRenderer,restoreRendererSelection} from './renderer-options.mjs';
const require=createRequire(import.meta.url),root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const tag=process.argv.find(a=>a.startsWith('--tag='))?.slice(6)??'v10-final';
if(!/^[a-zA-Z0-9_-]+$/.test(tag))throw new Error('Invalid tag');
const lockPath=`research/visual/${tag}-lock.json`,lock=JSON.parse(fs.readFileSync(path.join(root,lockPath),'utf8')),serveUrl=lock.bundle;
const subset=process.argv.find(a=>a.startsWith('--ranges='))?.slice(9);
const ranges=subset?subset.split(',').map(r=>r.split('-').map(Number)):Array.from({length:Math.ceil(lock.frames/1800)},(_,i)=>[i*1800,Math.min(lock.frames-1,(i+1)*1800-1)]);
if(ranges.some(r=>r.length!==2||r.some(x=>!Number.isInteger(x))||r[0]<0||r[1]<r[0]||r[1]>=lock.frames))throw new Error('Invalid ranges');
const out=path.join(root,'tmp',tag+(subset?'-review':'-segments')),scratch=path.join(out,'scratch');fs.mkdirSync(scratch,{recursive:true});process.env.TEMP=scratch;process.env.TMP=scratch;
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const verify=()=>{for(const [name,digest]of Object.entries(lock.bundleFiles))if(sha(path.join(serveUrl,name))!==digest)throw new Error('Frozen bundle changed: '+name);for(const [rel,digest]of Object.entries(lock.files))if(rel.startsWith('public/')&&sha(path.join(serveUrl,rel))!==digest)throw new Error('Frozen asset changed: '+rel);};verify();
const manifestPath=path.join(out,'segments.json'),manifest=fs.existsSync(manifestPath)?JSON.parse(fs.readFileSync(manifestPath,'utf8')):{tag,status:'rendering',startedAt:new Date().toISOString(),productionLock:lockPath,productionLockSHA256:sha(path.join(root,lockPath)),bundle:serveUrl,bundleFingerprint:lock.bundleFingerprint,timelineSHA256:lock.files['src/timeline.json'],masterSHA256:lock.files['public/master.wav'],totalFrames:lock.frames,fps:lock.fps,ranges,settings:{concurrency:1,crf:18,dpr:4,MSAA:4,colorSpace:'bt709',muted:true},segments:[]};
if(manifest.bundleFingerprint!==lock.bundleFingerprint||JSON.stringify(manifest.ranges)!==JSON.stringify(ranges))throw new Error('Resume state mismatch');
const save=()=>{fs.writeFileSync(manifestPath+'.tmp',JSON.stringify(manifest,null,2));fs.renameSync(manifestPath+'.tmp',manifestPath);};
const inspect=(file,start,end)=>{const d=JSON.parse(execFileSync('C:/ffmpeg/bin/ffprobe.exe',['-v','error','-show_streams','-of','json',file],{encoding:'utf8',windowsHide:true})),v=d.streams[0];if(d.streams.length!==1||v.codec_name!=='h264'||v.width!==1920||v.height!==1080||v.avg_frame_rate!=='30/1'||Number(v.nb_frames)!==end-start+1||v.pix_fmt!=='yuv420p'||v.color_space!=='bt709'||v.color_transfer!=='bt709'||v.color_primaries!=='bt709')throw new Error('Invalid video segment');return {start,end,outputLocation:file,sha256:sha(file),frames:Number(v.nb_frames),stream:v};};
for(const s of manifest.segments){if(sha(s.outputLocation)!==s.sha256)throw new Error('Completed segment bytes changed');inspect(s.outputLocation,s.start,s.end);}save();
const browserExecutable=path.join(root,'node_modules/.remotion/chrome-headless-shell/win64/chrome-headless-shell-win64/chrome-headless-shell.exe'),chromiumOptions=configureRenderer({preferHighPerformanceGpu:true});
const {openBrowser,renderMedia,selectComposition}=require('@remotion/renderer'),opts={serveUrl,browserExecutable,chromiumOptions,inputProps:{audio:false,clean:false}};
const browser=await openBrowser('chrome',{browserExecutable,chromiumOptions});
try{
 const composition=await selectComposition({...opts,pupeteerInstance:browser,id:'ShanghaiTower'});if(composition.durationInFrames!==lock.frames||composition.fps!==lock.fps)throw new Error('Bundle timeline differs');
 for(let i=0;i<ranges.length;i++){
  const [start,end]=ranges[i];if(manifest.segments.some(s=>s.start===start&&s.end===end))continue;
  const file=path.join(out,`visual-${String(i+1).padStart(2,'0')}-${start}-${end}.mp4`);let last=-1;
  await renderMedia({...opts,pupeteerInstance:browser,composition,codec:'h264',outputLocation:file,crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',imageFormat:'jpeg',jpegQuality:95,concurrency:1,gopSize:60,muted:true,enforceAudioTrack:false,timeoutInMilliseconds:120000,
   ffmpegOverride:({args,type})=>type==='pre-stitcher'?[...args.slice(0,-1),'-color_primaries','bt709','-color_trc','bt709','-colorspace','bt709','-x264-params','colorprim=bt709:transfer=bt709:colormatrix=bt709',args.at(-1)]:args,
   frameRange:[start,end],onProgress:p=>{const n=Math.floor(p.progress*10);if(n!==last){last=n;console.log(`Segment ${i+1}/${ranges.length}: ${n*10}% | ${start}-${end}`);}}});
  manifest.segments.push({...inspect(file,start,end),finishedAt:new Date().toISOString()});save();console.log('Saved verified frames:',manifest.segments.reduce((n,s)=>n+s.frames,0));
 }
 verify();manifest.status=subset?'review-complete':'silent-complete';manifest.finishedAt=new Date().toISOString();save();
}catch(e){manifest.status='failed-resumeable';manifest.lastError=String(e);save();throw e;}finally{await browser.close({silent:true});restoreRendererSelection();}
