import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {finalizeAudioV15} from './finalize-audio-v15.mjs';

// Dedicated entry, delivery and scratch: neither the V19 nor V20 renderer is modified.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const arg=(n,d)=>process.argv.find(s=>s.startsWith(n+'='))?.slice(n.length+1)??d;
const resolve=p=>path.isAbsolute(p)?p:path.join(root,p);
const version='V19Repair',still=process.argv.includes('stills'),silent=process.argv.includes('--silent');
const clean=process.argv.includes('--clean'),plate=process.argv.includes('--plate');
const range=arg('--frames','').split(',').filter(Boolean).map(Number);
const full=!still&&!range.length&&!silent&&!clean&&!plate;
const preview=!full;
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
if(timeline.notFinal&&!still&&!process.argv.includes('--preview'))throw new Error('Provisional voice timeline; only --preview or stills are allowed.');
if(range.length&&(range.length!==2||range.some(f=>!Number.isInteger(f))||range[0]<0||range[1]<range[0]||range[1]>=timeline.duration))throw new Error('Use --frames=FIRST,LAST (inclusive valid frame range).');
const concurrency=Number(arg('--concurrency','2'));
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw new Error('Concurrency must be an integer in 1..8.');
const outputRoot=resolve(JSON.parse(fs.readFileSync(path.join(root,'work/output-root-v19-repair.json'),'utf8')).outputRoot);
const runId=new Date().toISOString().replace(/[^0-9]/g,'')+'-'+crypto.randomBytes(3).toString('hex');
const scratchBase=process.env.RAINBOW_V19_REPAIR_RENDER_TEMP||path.join(os.tmpdir(),'rainbow-v19-repair');
const runRoot=path.join(scratchBase,runId),renderTemp=path.join(runRoot,'frames');
const bundleDir=path.join(runRoot,'bundle'),emptyPublic=path.join(runRoot,'empty-public');
const qaRoot=path.join(root,'research/qa-v19-repair'),recordDir=path.join(qaRoot,'runs',runId);
for(const p of [renderTemp,emptyPublic,recordDir,outputRoot])fs.mkdirSync(p,{recursive:true});
process.env.TEMP=renderTemp;process.env.TMP=renderTemp;
const free=p=>{const s=fs.statfsSync(p);return s.bavail*s.bsize;};
const freeScratch=free(runRoot),freeDelivery=free(outputRoot),scratchMinimum=(full?14:still?.35:2)*1024**3,deliveryMinimum=(full?1.5:0.1)*1024**3;
if(freeScratch<scratchMinimum)throw new Error(`Insufficient scratch disk: ${(freeScratch/1024**3).toFixed(2)} GiB; need ${scratchMinimum/1024**3} GiB at ${runRoot}`);
if(freeDelivery<deliveryMinimum)throw new Error(`Insufficient delivery disk: ${(freeDelivery/1024**3).toFixed(2)} GiB; need ${deliveryMinimum/1024**3} GiB at ${outputRoot}`);
const hashFile=p=>{const fd=fs.openSync(p,'r'),h=crypto.createHash('sha256'),b=Buffer.allocUnsafe(8*1024*1024);try{let n;while((n=fs.readSync(fd,b,0,b.length,null)))h.update(b.subarray(0,n));}finally{fs.closeSync(fd);}return h.digest('hex');};
const assertBindings=rows=>{for(const r of rows)if(!fs.existsSync(resolve(r.file))||hashFile(resolve(r.file))!==r.sha256)throw new Error('Audited input has changed or disappeared: '+r.file);};
const inputProps={audio:!silent,clean,plate};
const installed=resolve(arg('--browser',path.resolve(root,'work','render-browser-v10','chrome-headless-shell.exe')));
if(!fs.existsSync(installed))throw new Error('Render browser missing: '+installed);
const auditPath=path.join(qaRoot,'audit-v19-repair.json');
let sourceAudit;
if(full){
 sourceAudit=JSON.parse(fs.readFileSync(auditPath,'utf8'));
 if(sourceAudit.version!==version||!sourceAudit.passed||!sourceAudit.sourceHashes?.length)throw new Error('Run node scripts/audit-v19-repair.mjs before a full render.');
 assertBindings(sourceAudit.sourceHashes);
 fs.copyFileSync(auditPath,path.join(recordDir,'audit.snapshot.json'),fs.constants.COPYFILE_EXCL);
}
const record={version,runId,status:'bundling',startedUTC:new Date().toISOString(),scope:full?'full delivery':'preview/stills',preview,inputProps,concurrency,runRoot,bundleDir,browser:installed,
 diskPreflight:{scratchFreeBytes:freeScratch,deliveryFreeBytes:freeDelivery,scratchMinimumBytes:scratchMinimum,deliveryMinimumBytes:deliveryMinimum},
 sourceAudit:full?path.join(recordDir,'audit.snapshot.json'):null,sourceAuditSHA256:full?hashFile(path.join(recordDir,'audit.snapshot.json')):null,sourceHashes:sourceAudit?.sourceHashes??[]};
const recordPath=path.join(recordDir,'render.json'),save=()=>fs.writeFileSync(recordPath,JSON.stringify(record,null,2)+'\n');save();
fs.writeFileSync(path.join(qaRoot,full?'latest-full-render.json':'latest-preview-render.json'),JSON.stringify({version,runId,renderRecord:recordPath,sourceAudit:record.sourceAudit},null,2)+'\n');
const defaultName=full?'彩虹为什么是弧形_V19_场景修复_1080p.mp4':`preview-${range.join('-')||'all'}-${runId}.mp4`;
const out=resolve(arg('--output',path.join(outputRoot,full?'delivery':'work',defaultName)));
const staged=path.join(runRoot,'render.mp4');
let browser;
try{
 if(!still&&fs.existsSync(out)&&!process.argv.includes('--overwrite'))throw new Error('Output already exists; choose --output or explicitly --overwrite: '+out);
 const bundled=await bundle({entryPoint:path.join(root,'src/index-v19-repair.tsx'),publicDir:emptyPublic,outDir:bundleDir});
 const bundlePublic=path.join(bundleDir,'public');if(fs.existsSync(bundlePublic))fs.rmdirSync(bundlePublic);fs.symlinkSync(path.join(root,'public'),bundlePublic,'junction');
 record.bundleEntrySHA256=hashFile(path.join(bundleDir,'bundle.js'));record.status='rendering';save();
 if(full)assertBindings(record.sourceHashes);
 browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:{gl:'angle'}});
 const opts={serveUrl:bundled,browserExecutable:installed,chromiumOptions:{gl:'angle'},timeoutInMilliseconds:180000,inputProps,puppeteerInstance:browser};
 const composition=await selectComposition({...opts,id:'RainbowArcV19Repair'});record.composition={id:composition.id,width:composition.width,height:composition.height,fps:composition.fps,durationInFrames:composition.durationInFrames};save();
 if(still){
  const defaults=timeline.scenes.map(s=>Math.min(timeline.duration-1,Math.round((s.start+Math.min(3,(s.end-s.start)/2))*30)));
  const shots=arg('--stills',defaults.join(',')).split(',').map(Number);
  if(shots.some(f=>!Number.isInteger(f)||f<0||f>=timeline.duration))throw new Error('Invalid still frame number.');
  const folder=resolve(arg('--folder',path.join(outputRoot,'work','stills-'+runId)));fs.mkdirSync(folder,{recursive:true});const png=process.argv.includes('--png');
  for(const frame of shots){await renderStill({...opts,composition,frame,output:path.join(folder,`frame-${String(frame).padStart(5,'0')}.${png?'png':'jpg'}`),imageFormat:png?'png':'jpeg',...(!png?{jpegQuality:96}:{})});console.log('still',frame);}
  record.stillFolder=folder;record.stillFrames=shots;
 }else{
  let last=-1;await renderMedia({...opts,composition,codec:'h264',audioBitrate:'192k',outputLocation:staged,crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:94,concurrency,...(range.length?{frameRange:range}:{}),onProgress:p=>{const k=Math.floor(p.progress*100);if(k>last){last=k;console.log(`${k}% rendered ${p.renderedFrames} / encoded ${p.encodedFrames}`);}}});
  let accepted=staged;
  if(full){accepted=path.join(runRoot,'audio-finalized.mp4');finalizeAudioV15(staged,path.join(root,'public/audio_v18/master-v18.wav'),accepted,path.join(recordDir,'audio-finalization.json'));assertBindings(record.sourceHashes);}
  fs.mkdirSync(path.dirname(out),{recursive:true});const bytes=fs.statSync(accepted).size;if(free(path.dirname(out))<bytes+128*1024**2)throw new Error('Delivery drive does not have capacity for completed render.');
  fs.copyFileSync(accepted,out,process.argv.includes('--overwrite')?0:fs.constants.COPYFILE_EXCL);
  record.output=out;record.videoSHA256=hashFile(out);record.bytes=bytes;console.log(out);
 }
 record.status='completed';record.completedUTC=new Date().toISOString();save();
 console.log('Render record:',recordPath);
}catch(e){record.status='failed';record.error=String(e?.stack??e);record.failedUTC=new Date().toISOString();save();throw e;}
finally{if(browser)await browser.close({silent:true});}
// Scratch is deliberately retained. Its manifest never authorizes deleting the
// public junction target; cleanup must unlink that junction before any recursion.
fs.writeFileSync(path.join(recordDir,'scratch-manifest.json'),JSON.stringify({runRoot,bundlePublicJunction:path.join(bundleDir,'public'),junctionTarget:path.join(root,'public'),completed:record.status==='completed',deletionPerformed:false},null,2)+'\n');
