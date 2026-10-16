import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import {finalizeAudioV15} from './finalize-audio-v15.mjs';
import {root,outputRoot,qaRoot,resolveInput,hashFile,assertBindings,collectSourceBindings,mountPublicIntoBundle} from './source-bindings-v19-motion.mjs';

const arg=(n,d)=>process.argv.find(s=>s.startsWith(n+'='))?.slice(n.length+1)??d;
const resolve=p=>path.isAbsolute(p)?p:path.join(root,p);
const version='V19Motion',still=process.argv.includes('stills'),silent=process.argv.includes('--silent');
const clean=process.argv.includes('--clean'),plate=process.argv.includes('--plate');
const range=arg('--frames','').split(',').filter(Boolean).map(Number);
const explicitPreview=process.argv.includes('--preview');
const full=!still&&!range.length&&!silent&&!clean&&!plate&&!explicitPreview;
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
if(timeline.notFinal&&!still&&!explicitPreview)throw new Error('Provisional narration supports previews only');
if(timeline.duration!==10702||timeline.fps!==30)throw new Error('V19Motion requires the accepted 10702-frame / 30fps timeline');
if(range.length&&(range.length!==2||range.some(f=>!Number.isInteger(f))||range[0]<0||range[1]<range[0]||range[1]>=timeline.duration))throw new Error('Use --frames=FIRST,LAST, inclusive');
if(still&&range.length)throw new Error('Use --stills=F1,F2 for stills, not --frames');
const concurrency=Number(arg('--concurrency','2'));
if(!Number.isInteger(concurrency)||concurrency<1||concurrency>8)throw new Error('Concurrency must be an integer in 1..8');
// timeline.json scene fields are seconds. Convert once to the same rounded
// frame boundaries as Timeline.ts, then place the still within those bounds.
const frameScenes=timeline.scenes.map((s,i,a)=>({id:s.id,start:Math.round(s.start*timeline.fps),end:i<a.length-1?Math.round(a[i+1].start*timeline.fps):timeline.duration}));
const defaults=frameScenes.map(s=>Math.min(s.end-1,s.start+Math.min(3*timeline.fps,Math.floor((s.end-s.start)/2))));
const shots=still?arg('--stills',defaults.join(',')).split(',').map(Number):[];
if(shots.some(f=>!Number.isInteger(f)||f<0||f>=timeline.duration))throw new Error('Invalid still frame number');
const runId=new Date().toISOString().replace(/[^0-9]/g,'')+'-'+crypto.randomBytes(3).toString('hex');
const scratchBase=process.env.RAINBOW_V19_MOTION_RENDER_TEMP||path.join(os.tmpdir(),'rainbow-v19-motion');
if(process.platform==='win32'&&path.parse(path.resolve(scratchBase)).root.toLowerCase()!=='c:\\')throw new Error('V19Motion render scratch must stay on C:');
const runRoot=path.join(scratchBase,runId),renderTemp=path.join(runRoot,'frames'),bundleDir=path.join(runRoot,'bundle'),emptyPublic=path.join(runRoot,'empty-public');
const recordDir=path.join(qaRoot,'runs',runId);
for(const p of [renderTemp,emptyPublic,recordDir,outputRoot])fs.mkdirSync(p,{recursive:true});
process.env.TEMP=renderTemp;process.env.TMP=renderTemp;
const free=p=>{const s=fs.statfsSync(p);return s.bavail*s.bsize;};
const freeScratch=free(runRoot),freeDelivery=free(outputRoot),scratchMinimum=(full?14:still?.35:2)*1024**3,deliveryMinimum=(full?1.5:.1)*1024**3;
const installed=resolve(arg('--browser',path.resolve(root,'work/render-browser-v10/chrome-headless-shell.exe')));
const inputProps={audio:!silent,clean,plate};
const outputRange=still?null:range.length?range:[0,timeline.duration-1];
const record={version,schema:'rainbow.v19-motion.render/1',runId,status:'preflight',startedUTC:new Date().toISOString(),scope:full?'full delivery':still?'stills':'video preview',preview:!full,inputProps,
 command:{executable:process.execPath,argv:process.argv.slice(1),cwd:process.cwd()},
 selection:{kind:still?'stills':range.length?'inclusive-frame-range':'complete-timeline',requestedRangeInclusive:range.length?range:null,outputRangeInclusive:outputRange,outputFrameCount:still?shots.length:outputRange[1]-outputRange[0]+1,stillFrames:shots,sourceTimelineFrames:timeline.duration,fps:30},
 concurrency,runRoot,bundleDir,browser:installed,sourceAudit:null,sourceAuditSHA256:null,sourceHashes:[],
 diskPreflight:{scratchFreeBytes:freeScratch,deliveryFreeBytes:freeDelivery,scratchMinimumBytes:scratchMinimum,deliveryMinimumBytes:deliveryMinimum}};
const recordPath=path.join(recordDir,'render.json'),save=()=>fs.writeFileSync(recordPath,JSON.stringify(record,null,2)+'\n');save();
const defaultName=full?'彩虹为什么是弧形_V19_动作与转场优化_1080p.mp4':`preview-${range.join('-')||'all'}-${runId}.mp4`;
const out=resolve(arg('--output',path.join(outputRoot,full?'delivery':'work',defaultName)));
let browser,publicMappings=[];
try{
 if(freeScratch<scratchMinimum||freeDelivery<deliveryMinimum)throw new Error('Insufficient C: space for scratch/delivery');
 if(!fs.existsSync(installed))throw new Error('Missing render browser: '+installed);
 if(!still&&fs.existsSync(out))throw new Error('Refusing existing output: '+out);
 const snapshot=await collectSourceBindings();
 const snapshotPath=path.join(recordDir,'inputs.snapshot.json');fs.writeFileSync(snapshotPath,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx'});
 record.sourceSnapshot=snapshotPath;record.sourceSnapshotSHA256=hashFile(snapshotPath);record.sourceHashes=snapshot.sourceHashes;
 const auditPath=path.join(qaRoot,'audit-v19-motion.json');
 if(full){
  const audit=JSON.parse(fs.readFileSync(auditPath,'utf8'));
  if(audit.version!==version||!audit.passed||!audit.sourceHashes?.length)throw new Error('Full delivery requires a passed V19Motion audit');
  assertBindings(audit.sourceHashes);
  const union=new Map([...record.sourceHashes,...audit.sourceHashes].map(r=>[r.file,r]));record.sourceHashes=[...union.values()].sort((a,b)=>a.file.localeCompare(b.file));
  record.sourceAudit=path.join(recordDir,'audit.snapshot.json');fs.copyFileSync(auditPath,record.sourceAudit,fs.constants.COPYFILE_EXCL);record.sourceAuditSHA256=hashFile(record.sourceAudit);
 }
 record.integrityGate={sourceSnapshotComplete:true,passedAuditRequired:full,passedAuditAvailable:full,scope:'Preview integrity snapshot does not claim complete scientific/visual checks; full render requires passed immutable audit.'};
 assertBindings(record.sourceHashes);record.status='bundling';save();
 fs.writeFileSync(path.join(qaRoot,full?'latest-full-render.json':'latest-preview-render.json'),JSON.stringify({version,runId,renderRecord:recordPath,sourceAudit:record.sourceAudit,sourceSnapshot:record.sourceSnapshot},null,2)+'\n');
 const serveUrl=await bundle({entryPoint:path.join(root,'src/index-v19-motion.tsx'),publicDir:emptyPublic,outDir:bundleDir});
 publicMappings=mountPublicIntoBundle(bundleDir);record.publicMappings=publicMappings;
 record.bundleEntrySHA256=hashFile(path.join(bundleDir,'bundle.js'));assertBindings(record.sourceHashes);record.status='rendering';save();
 browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:{gl:'angle'}});
 const opts={serveUrl,browserExecutable:installed,chromiumOptions:{gl:'angle'},timeoutInMilliseconds:180000,inputProps,puppeteerInstance:browser};
 const composition=await selectComposition({...opts,id:'RainbowArcV19Motion'});record.composition={id:composition.id,width:composition.width,height:composition.height,fps:composition.fps,durationInFrames:composition.durationInFrames};
 if(composition.width!==1920||composition.height!==1080||composition.fps!==30||composition.durationInFrames!==10702)throw new Error('Unexpected V19Motion composition');save();
 if(still){
  const folder=resolve(arg('--folder',path.join(outputRoot,'work','stills-'+runId)));fs.mkdirSync(folder,{recursive:true});const png=process.argv.includes('--png');record.stillFolder=folder;record.stillFrames=shots;record.stills=[];
  for(const frame of shots){const target=path.join(folder,`frame-${String(frame).padStart(5,'0')}.${png?'png':'jpg'}`);if(fs.existsSync(target))throw new Error('Refusing existing still: '+target);await renderStill({...opts,composition,frame,output:target,imageFormat:png?'png':'jpeg',...(!png?{jpegQuality:96}:{})});record.stills.push({frame,file:target,sha256:hashFile(target)});save();console.log('still',frame);}
 }else{
  const staged=path.join(runRoot,'render.mp4');let last=-1;await renderMedia({...opts,composition,codec:'h264',audioBitrate:'192k',outputLocation:staged,crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:94,concurrency,...(range.length?{frameRange:range}:{}),onProgress:p=>{const k=Math.floor(p.progress*100);if(k>last){last=k;console.log(`${k}% rendered ${p.renderedFrames} / encoded ${p.encodedFrames}`);}}});
  let accepted=staged;
  if(full){accepted=path.join(runRoot,'audio-finalized.mp4');finalizeAudioV15(staged,resolveInput('public/audio_v18/master-v18.wav'),accepted,path.join(recordDir,'audio-finalization.json'));}
  assertBindings(record.sourceHashes);record.stagedOutput={file:accepted,bytes:fs.statSync(accepted).size,sha256:hashFile(accepted)};record.status='copying';save();
  fs.mkdirSync(path.dirname(out),{recursive:true});if(free(path.dirname(out))<record.stagedOutput.bytes+128*1024**2)throw new Error('Delivery drive does not have capacity for completed render.');
  fs.copyFileSync(accepted,out,fs.constants.COPYFILE_EXCL);record.output=out;record.videoSHA256=hashFile(out);record.bytes=fs.statSync(out).size;if(record.videoSHA256!==record.stagedOutput.sha256)throw new Error('Delivery copy hash mismatch');console.log(out);
 }
 assertBindings(record.sourceHashes);record.status='completed';record.completedUTC=new Date().toISOString();save();console.log('Render record:',recordPath);
}catch(e){record.status='failed';record.error=String(e?.stack??e);record.failedUTC=new Date().toISOString();save();throw e;}
finally{
 if(browser)await browser.close({silent:true});
 fs.writeFileSync(path.join(recordDir,'scratch-manifest.json'),JSON.stringify({runRoot,publicMappings,completed:record.status==='completed',deletionPerformed:false,cleanupRule:'Do not recurse through temporary public junctions. Only their exact junction entries may be unlinked after verifying targets; all source assets remain untouched.'},null,2)+'\n');
}
