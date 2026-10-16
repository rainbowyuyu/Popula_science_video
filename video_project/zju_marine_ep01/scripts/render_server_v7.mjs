/** Server-only benchmark, consumes a completed bundle. Never bundles or renders the full film. */
import {renderMedia,selectComposition,openBrowser,renderStill} from '@remotion/renderer';
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {performance} from 'node:perf_hooks';
const args=Object.fromEntries(process.argv.slice(2).filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i).replace(/^--/,''),x.slice(i+1)]}));
const root=args.root||'/home/fusion/marine-energy-v7-20261014';const out=path.join(root,args.out||'out-d');const bundle=path.join(root,args.bundle||'bundle-d');const marker=path.join(root,args.marker||'bundle-d-ready');
if(!fs.existsSync(marker)||!fs.existsSync(path.join(bundle,'index.html')))throw Error('Completed bundle marker missing; refusing half-upload');
fs.mkdirSync(out,{recursive:true});
const expectedGPU='GPU-bb237d96-f75f-846d-2c75-8a02fafe8cda';
const report={started:new Date().toISOString(),expectedGPU,concurrency:1,browserCount:1,stills:[],range:null,gpuSamples:[],browser:null,error:null};
const save=()=>fs.writeFileSync(path.join(out,'performance-report.json'),JSON.stringify(report,null,2));
const chrome=path.join(root,'browsers/chromium-1243/chrome-linux64/chrome');
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromeMode:'chrome-for-testing',chromiumOptions:{gl:'vulkan',enableMultiProcessOnLinux:true},logLevel:'warn'});
async function gpuSnapshot(stage){
 const sys=await browser.connection.send('SystemInfo.getProcessInfo');const pids=new Set(sys.value.processInfo.filter(x=>/gpu/i.test(x.type)).map(x=>String(x.id)));
 const xml=execFileSync('nvidia-smi',['-q','-x'],{encoding:'utf8'});const devices=[];
 for(const block of xml.split('<gpu id=').slice(1)){const uuid=block.match(/<uuid>([^<]+)</)?.[1];const pci=block.match(/<pci_bus_id>([^<]+)</)?.[1];const processSection=block.match(/<processes>([\s\S]*?)<\/processes>/)?.[1]||'';const selected=[];
 for(const proc of processSection.split('<process_info>').slice(1)){const pid=proc.match(/<pid>([^<]+)</)?.[1];if(pids.has(pid))selected.push({pid,memory:proc.match(/<used_memory>([^<]+)</)?.[1],name:proc.match(/<process_name>([^<]+)</)?.[1]});}
 if(selected.length)devices.push({uuid,pci,processes:selected});}
 const state={stage,time:new Date().toISOString(),gpuPids:[...pids],devices};report.gpuSamples.push(state);save();
 if(devices.some(d=>d.uuid!==expectedGPU))throw Error('Chrome GPU process mapped to non-authorized busy GPU; aborting benchmark: '+JSON.stringify(state));return state;
}
let timer;try{
 report.browser=(await browser.connection.send('SystemInfo.getInfo')).value;save();
 const opts={serveUrl:bundle,browserExecutable:chrome,chromeMode:'chrome-for-testing',chromiumOptions:{gl:'vulkan'},timeoutInMilliseconds:240000,inputProps:{audio:false},puppeteerInstance:browser,logLevel:'warn'};
 const comp=await selectComposition({...opts,id:'MarineEnergyEpisode01'});report.composition={id:comp.id,width:comp.width,height:comp.height,fps:comp.fps,durationInFrames:comp.durationInFrames};save();
 const frames=(args.frames||'120,470,4800,10350').split(',').map(Number);
 for(const frame of frames){const start=performance.now();await renderStill({...opts,composition:comp,frame,output:path.join(out,`frame-${frame}.png`),imageFormat:'png'});report.stills.push({frame,seconds:(performance.now()-start)/1000});await gpuSnapshot(`still-${frame}`);save();console.log(JSON.stringify(report.stills.at(-1)));}
 const range=(args.range||'360-660').split('-').map(Number);if(range[1]-range[0]>600)throw Error('Benchmark frame cap 601');
 const start=performance.now();let last=0;let sampleAt=0;let gpuFailure;
 timer=setInterval(()=>{gpuSnapshot('range-running').catch(e=>{gpuFailure=e;browser.close({silent:true}).catch(()=>{});});},10000);
 await renderMedia({...opts,composition:comp,codec:'h264',audioBitrate:'128k',outputLocation:path.join(out,`range-${range.join('-')}.mp4`),crf:18,pixelFormat:'yuv420p',colorSpace:'bt709',videoImageFormat:'jpeg',jpegQuality:92,concurrency:1,frameRange:range,onProgress:({renderedFrames,encodedFrames,progress})=>{if(renderedFrames-last>=30){last=renderedFrames;console.log(JSON.stringify({renderedFrames,encodedFrames,progress,wallSeconds:(performance.now()-start)/1000}));}}});
 clearInterval(timer);if(gpuFailure)throw gpuFailure;const seconds=(performance.now()-start)/1000;report.range={frames:range,frameCount:range[1]-range[0]+1,seconds,renderFps:(range[1]-range[0]+1)/seconds,output:`range-${range.join('-')}.mp4`};await gpuSnapshot('range-complete');report.completed=new Date().toISOString();save();console.log(JSON.stringify(report.range));
}catch(e){report.error=String(e?.stack||e);save();console.error(report.error);process.exitCode=1;}finally{clearInterval(timer);await browser.close({silent:true});save();}
