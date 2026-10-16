import {bundle} from '@remotion/bundler';
import {renderMedia,renderStill,selectComposition,openBrowser} from '@remotion/renderer';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {finalizeAudioV15} from './finalize-audio-v15.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const outputRoot=JSON.parse(fs.readFileSync(path.join(root,'work/output-root-v20.json'),'utf8')).outputRoot;const tmp=path.join(outputRoot,'work');fs.mkdirSync(tmp,{recursive:true});
// Keep Chromium frame scratch on C: so the V20 render cannot exhaust the
// project's D: volume (the delivery file itself remains under output-v20).
// These variables affect this process and its children, not global settings.
const renderTemp=process.env.RAINBOW_V20_RENDER_TEMP||path.join('C:\\Users\\zju\\AppData\\Local\\Temp','rainbow-arc-V20-render-temp');fs.mkdirSync(renderTemp,{recursive:true});
process.env.TEMP=renderTemp;process.env.TMP=renderTemp;
const bundleDir=path.join(tmp,'bundle-'+new Date().toISOString().replace(/[^0-9]/g,''));
const emptyPublic=path.join(root,'work/empty-public');fs.mkdirSync(emptyPublic,{recursive:true});
const bundled=await bundle({entryPoint:path.join(root,'src/index-v20.tsx'),publicDir:emptyPublic,outDir:bundleDir});
const bundlePublic=path.join(bundleDir,'public');if(fs.existsSync(bundlePublic))fs.rmdirSync(bundlePublic);
fs.symlinkSync(path.join(root,'public'),bundlePublic,'junction');

const installed=path.resolve(root,'work','render-browser-v10','chrome-headless-shell.exe');
const still=process.argv.includes('stills');const noAudio=process.argv.includes('--silent');
const timeline=JSON.parse(fs.readFileSync(path.join(root,'src/timeline.json'),'utf8'));
if(timeline.notFinal&&!still&&!process.argv.includes('--preview'))throw new Error('The voice timeline is provisional. Only marked previews or stills may be rendered.');
const arg=(name,fallback)=>process.argv.find(s=>s.startsWith(name+'='))?.slice(name.length+1)??fallback;
const full=!still&&!noAudio&&!arg('--frames','');
const hashFile=p=>{const fd=fs.openSync(p,'r'),hash=crypto.createHash('sha256'),chunk=Buffer.allocUnsafe(8*1024*1024);try{let n;while((n=fs.readSync(fd,chunk,0,chunk.length,null)))hash.update(chunk.subarray(0,n));}finally{fs.closeSync(fd);}return hash.digest('hex');};
const auditPath=path.join(root,'research/qa-v20/audit-v20.json');
let renderRecord;
if(full){
 const audit=JSON.parse(fs.readFileSync(auditPath,'utf8'));
 if(!audit.passed||audit.version!=='V20'||!Array.isArray(audit.sourceHashes)||audit.sourceHashes.length===0)throw new Error('Current V20 source audit with real source/resource hash bindings must pass before a full render');
 for(const row of audit.sourceHashes)if(hashFile(path.join(root,row.file))!==row.sha256)throw new Error('Source audit is stale: '+row.file);
 renderRecord={version:'V20',status:'rendering',startedUTC:new Date().toISOString(),bundleDir,bundleEntrySHA256:hashFile(path.join(bundleDir,'bundle.js')),sourceAuditSHA256:hashFile(auditPath),sourceHashes:audit.sourceHashes,inputProps:{audio:true,clean:false,plate:false},concurrency:Number(arg('--concurrency','2')),browser:installed};
 fs.writeFileSync(path.join(root,'research/qa-v20/render-start-v20.json'),JSON.stringify(renderRecord,null,2));
}
const defaultShots=timeline.scenes.map(s=>Math.round((s.start+Math.min(3,(s.end-s.start)/2))*30));
const shots=arg('--stills',defaultShots.join(',')).split(',').map(Number);
const browser=await openBrowser('chrome',{browserExecutable:installed,chromiumOptions:{gl:'angle'}});
try{
 const opts={serveUrl:bundled,browserExecutable:installed,chromiumOptions:{gl:'angle'},timeoutInMilliseconds:120000,inputProps:{audio:!noAudio,clean:process.argv.includes('--clean'),plate:process.argv.includes('--plate')},puppeteerInstance:browser};
 const composition=await selectComposition({...opts,id:'RainbowArcV20'});
 if(still){const folderArg=arg('--folder',path.join(outputRoot,'work/stills'));const folder=path.isAbsolute(folderArg)?folderArg:path.join(root,folderArg);fs.mkdirSync(folder,{recursive:true});const png=process.argv.includes('--png');for(const frame of shots){await renderStill({...opts,composition,frame,output:path.join(folder,`frame-${String(frame).padStart(5,'0')}.${png?'png':'jpg'}`),imageFormat:png?'png':'jpeg',...(!png?{jpegQuality:96}:{})});console.log('still',frame)}}
 else {const outputArg=arg('--output',path.join(outputRoot,'delivery/彩虹为什么是弧形_V20_optimized_1080p.mp4'));const out=path.isAbsolute(outputArg)?outputArg:path.join(root,outputArg);fs.mkdirSync(path.dirname(out),{recursive:true});let last=-1;const range=arg('--frames','').split(',').filter(Boolean).map(Number);await renderMedia({...opts,composition,codec:'h264',audioBitrate:'192k',outputLocation:out,crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:94,concurrency:Number(arg('--concurrency','2')),...(range.length===2?{frameRange:range}:{}),onProgress:p=>{const k=Math.floor(p.progress*100);if(k>last){last=k;console.log(`${k}%  rendered ${p.renderedFrames} / encoded ${p.encodedFrames}`)}}});console.log(out)}
}finally{await browser.close({silent:true})}

if(!still&&!noAudio&&!arg('--frames','')){
 const outputArg=arg('--output',path.join(outputRoot,'delivery/彩虹为什么是弧形_V20_optimized_1080p.mp4'));
 const out=path.isAbsolute(outputArg)?outputArg:path.join(root,outputArg);
 const synced=out.replace(/\.mp4$/i,'.audio-finalized.mp4');
 if(synced===out)throw new Error('Full video output must end with .mp4');
 finalizeAudioV15(out,path.join(root,'public/audio_v18/master-v18.wav'),synced,path.join(root,'research/qa-v20/audio-finalization-v20.json'));
 fs.renameSync(synced,out);
 console.log('Audio priming finalized:',out);
 for(const row of renderRecord.sourceHashes)if(hashFile(path.join(root,row.file))!==row.sha256)throw new Error('Source changed during full render: '+row.file);
 if(hashFile(auditPath)!==renderRecord.sourceAuditSHA256)throw new Error('Source audit changed during full render');
 renderRecord.status='completed';renderRecord.completedUTC=new Date().toISOString();renderRecord.output=out;renderRecord.videoSHA256=hashFile(out);
 fs.writeFileSync(path.join(root,'research/qa-v20/render-start-v20.json'),JSON.stringify(renderRecord,null,2));
}






