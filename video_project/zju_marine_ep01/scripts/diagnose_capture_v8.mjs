/** Bounded diagnostic: inspect the application canvas at Remotion's actual screenshot boundary.
 * Patches are process-local wrappers around the pinned 4.0.526 renderer, never package edits.
 * --order enables same-page nonmonotonic seeks; outputs are diagnostic images, not a film.
 */
import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
import {createRequire} from 'node:module';import {execFileSync} from 'node:child_process';
const req=createRequire(import.meta.url),dist=path.dirname(req.resolve('@remotion/renderer'));
// Use the CJS entry deliberately: its internal modules are the exact objects
// wrapped below. The ESM entry is a bundled copy and cannot share these hooks.
const {renderFrames,selectComposition,openBrowser}=req('@remotion/renderer');
const args=Object.fromEntries(process.argv.slice(2).map(x=>{const i=x.indexOf('=');return [x.slice(2,i),x.slice(i+1)]}));
const root=args.root||'/home/fusion/marine-energy-v7-20261014';
const out=path.resolve(root,args.out||'out-v8-baseline-capture'),bundle=path.resolve(root,args.bundle||'bundle-v71-patch-final');
const order=(args.order||'418,419,420,421,422,4800,4801,418,419,420').split(',').map(Number);
if(order.length>180||order.some(x=>!Number.isInteger(x)||x<0||x>11014))throw Error('Diagnostic limited to 180 valid frames');
if(!fs.existsSync(bundle+'-ready'))throw Error('Missing completed bundle marker');
fs.mkdirSync(out,{recursive:true});
const expectedGPU='GPU-bb237d96-f75f-846d-2c75-8a02fafe8cda';
const report={started:new Date().toISOString(),bundle,order,expectedGPU,captures:[],frames:[],gpu:[],errors:[],limitations:['Before-screenshot instrumentation adds a browser round trip; a clean result does not prove an uninstrumented passive-effect race impossible.']};
const save=()=>fs.writeFileSync(path.join(out,'capture-report.json'),JSON.stringify(report,null,2));
const expected=new WeakMap();const seekModule=req(path.join(dist,'seek-to-frame.js'));const oldSeek=seekModule.seekToFrame;
seekModule.seekToFrame=async opts=>{const frame=order[opts.frame];expected.set(opts.page,{index:opts.frame,frame});return oldSeek({...opts,frame});};
const takeModule=req(path.join(dist,'take-frame.js')),oldTake=takeModule.takeFrame;
const readState=page=>page.evaluate(()=>{
 const canvases=[...document.querySelectorAll('canvas')];const canvas=canvases.find(c=>c.dataset.marineDisplay==='true')||canvases.at(-1);
 let hash=2166136261;let alpha0=0;let pixels=0;
 if(canvas){const ctx=canvas.getContext('2d');if(ctx){const a=ctx.getImageData(0,0,canvas.width,canvas.height).data;for(let y=8;y<canvas.height;y+=24)for(let x=8;x<canvas.width;x+=24){const i=(y*canvas.width+x)*4;for(let c=0;c<4;c++){hash^=a[i+c];hash=Math.imul(hash,16777619);}alpha0+=a[i+3]===0?1:0;pixels++;}}}
 return {state:window.__marineV7?.state,provenance:window.__marineFrameV8||null,canvasHash:(hash>>>0).toString(16),alpha0,pixels,ready:window.remotion_renderReady};
});
takeModule.takeFrame=async opts=>{
 const request=expected.get(opts.freePage);if(!request||opts.imageFormat==='none')return oldTake(opts);
 const before=await readState(opts.freePage);const buffer=await oldTake(opts);const after=await readState(opts.freePage);
 const row={...request,before,after};report.captures.push(row);save();
 if(before.state?.tick!==request.frame*2||after.state?.tick!==request.frame*2)report.errors.push({kind:'water-time-mismatch',...row});
 if(before.canvasHash!==after.canvasHash)report.errors.push({kind:'canvas-changed-during-screenshot',...row});
 if(args.strict==='true'&&(before.provenance?.frame!==request.frame||after.provenance?.frame!==request.frame))report.errors.push({kind:'presented-frame-mismatch',...row});
 return buffer;
};
const chrome=path.join(root,'browsers/chromium-1243/chrome-linux64/chrome');
const browser=await openBrowser('chrome',{browserExecutable:chrome,chromeMode:'chrome-for-testing',chromiumOptions:{gl:'vulkan',enableMultiProcessOnLinux:true},logLevel:'warn'});
async function gpuGuard(){
 const sys=await browser.connection.send('SystemInfo.getProcessInfo');const pids=new Set(sys.value.processInfo.filter(x=>/gpu/i.test(x.type)).map(x=>String(x.id)));
 const xml=execFileSync('nvidia-smi',['-q','-x'],{encoding:'utf8'});const devices=[];
 for(const block of xml.split('<gpu id=').slice(1)){const uuid=block.match(/<uuid>([^<]+)</)?.[1];for(const proc of (block.match(/<processes>([\s\S]*?)<\/processes>/)?.[1]||'').split('<process_info>').slice(1)){const pid=proc.match(/<pid>([^<]+)</)?.[1];if(pids.has(pid))devices.push({uuid,pid});}}
 report.gpu.push({at:new Date().toISOString(),devices});save();if(devices.some(x=>x.uuid!==expectedGPU))throw Error('Browser GPU outside authorized GPU0');
}
let timer;try{
 const opts={serveUrl:bundle,browserExecutable:chrome,chromeMode:'chrome-for-testing',chromiumOptions:{gl:'vulkan'},timeoutInMilliseconds:240000,inputProps:{audio:false},puppeteerInstance:browser,logLevel:'warn'};
 const composition=await selectComposition({...opts,id:'MarineEnergyEpisode01'});await gpuGuard();
 timer=setInterval(()=>gpuGuard().catch(e=>{report.errors.push({kind:'gpu',message:String(e)});browser.close({silent:true}).catch(()=>{});}),10000);
 await renderFrames({...opts,composition,imageFormat:'png',frames:order.map((_,i)=>i),concurrency:1,onFrameBuffer:async(buffer,index)=>{const frame=order[index],name=`${String(index).padStart(3,'0')}-frame-${frame}.png`;fs.writeFileSync(path.join(out,name),buffer);report.frames.push({index,frame,name,sha256:crypto.createHash('sha256').update(buffer).digest('hex')});save();console.log(JSON.stringify({index,frame,errors:report.errors.length}));}});
 const seen=new Map();for(const f of report.frames){if(seen.has(f.frame)&&seen.get(f.frame)!==f.sha256)report.errors.push({kind:'repeat-seek-pixels-differ',frame:f.frame,first:seen.get(f.frame),second:f.sha256});seen.set(f.frame,f.sha256);}
 if(report.captures.length!==order.length)report.errors.push({kind:'instrumentation-missing',expected:order.length,actual:report.captures.length});
 report.completed=new Date().toISOString();report.passed=report.errors.length===0;
}catch(e){report.errors.push({kind:'exception',message:String(e?.stack||e)});process.exitCode=1;}
finally{clearInterval(timer);await browser.close({silent:true});seekModule.seekToFrame=oldSeek;takeModule.takeFrame=oldTake;save();}
if(report.errors.length)process.exitCode=1;
