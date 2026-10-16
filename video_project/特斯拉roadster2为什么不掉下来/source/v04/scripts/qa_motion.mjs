import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {build} from 'esbuild';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),out=path.join(root,'work/motion-qa');
await fs.mkdir(out,{recursive:true});
const source=`import * as T from 'three';
import {World} from ${JSON.stringify(path.join(root,'src/World.ts').replaceAll('\\','/'))};
import {timeline,sections} from ${JSON.stringify(path.join(root,'src/Timeline.ts').replaceAll('\\','/'))};
import captions from ${JSON.stringify(path.join(root,'src/captions-data.json').replaceAll('\\','/'))};
const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,540);document.body.appendChild(renderer.domElement);
const scene=new T.Scene(),camera=new T.PerspectiveCamera(38,16/9,.05,160),world=new World(scene,camera,renderer);
window.sample=(t)=>{world.update(t);return world.telemetry;};
window.draw=(t)=>{world.update(t);renderer.render(scene,camera);return world.telemetry;};
window.timeline=timeline;window.sections=sections;window.captions=captions;window.ready=true;`;
await build({stdin:{contents:source,resolveDir:root,sourcefile:'motion-qa.ts',loader:'ts'},bundle:true,format:'iife',outfile:path.join(out,'qa.js')});
await fs.writeFile(path.join(out,'index.html'),'<!doctype html><html><body style="margin:0"><script src="/qa.js"></script></body></html>');
const server=createServer(async(req,res)=>{const p=req.url==='/qa.js'?'qa.js':'index.html';res.setHeader('Content-Type',p.endsWith('.js')?'application/javascript':'text/html');res.end(await fs.readFile(path.join(out,p)));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
const req=createRequire(import.meta.url);const {chromium}=req('C:/Users/zju/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({channel:'msedge',headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>window.ready,{timeout:60000});
 const report=await page.evaluate(()=>{
  const distance=(a,b)=>Math.sqrt(a.reduce((s,x,i)=>s+(x-b[i])**2,0)),finite=o=>JSON.stringify(o).includes('null')===false;
  const total=Math.ceil(window.timeline.durationSec*30),bad=[],contacts=[],boundaries=[];let previous,maxCameraStep=0,maxCarStep=0,maxTargetStep=0,maxThetaStep=0,minRollEnvelope=Infinity;const samples=[];
  for(let frame=0;frame<total;frame++){const t=frame/30,s=window.sample(t);if(!finite(s))bad.push({frame,type:'nonfinite'});if(previous){const dc=distance(s.camera,previous.camera),dp=distance(s.position,previous.position),dt=distance(s.target,previous.target),dr=Math.abs(Math.atan2(Math.sin(s.rotation-previous.rotation),Math.cos(s.rotation-previous.rotation)));maxCameraStep=Math.max(dc,maxCameraStep);maxCarStep=Math.max(dp,maxCarStep);maxTargetStep=Math.max(dt,maxTargetStep);maxThetaStep=Math.max(dr,maxThetaStep);if(dp>.20||dc>1.2||dr>.15)bad.push({frame,dc,dp,dr});}
   if(['hook','ceiling'].includes(s.section))contacts.push(distance(s.plateContactTop,s.tireContact));
   if(['roll','control'].includes(s.section)){const envelope=s.position[1]-.65*Math.abs(Math.cos(s.rotation))-.98*Math.abs(Math.sin(s.rotation));minRollEnvelope=Math.min(minRollEnvelope,envelope);if(envelope<-.002)bad.push({frame,type:'floor_penetration',envelope});}
   for(const prop of s.props){const c=window.timeline.cues.find(c=>c.id===prop.cue);if(prop.visible&&(t<c.startSec||t>c.endSec))bad.push({frame,type:'prop_visible_outside_cue',prop:prop.cue});}
   samples.push(s);previous=s;
  }
  for(const s of window.sections.slice(1)){const a=window.sample(s.start-1e-5),b=window.sample(s.start+1e-5);boundaries.push({section:s.id,carGap:distance(a.position,b.position),cameraGap:distance(a.camera,b.camera),targetGap:distance(a.target,b.target),rotationGap:Math.abs(Math.atan2(Math.sin(a.rotation-b.rotation),Math.cos(a.rotation-b.rotation)))});}
  const deterministic=[];for(const f of[0,150,1000,2500,4000,6000,7500,total-1]){const a=window.sample(f/30);window.sample(89.23);const b=window.sample(f/30);deterministic.push({frame:f,identical:JSON.stringify(a)===JSON.stringify(b)});}
  const cues=window.timeline.cues,cue=id=>cues.find(c=>c.id===id),rollChecks=[];
  for(const id of['s19','s20','s21','s22']){const c=cue(id);for(const u of[.25,.5,.75]){const t=c.startSec+(c.endSec-c.startSec)*u,h=.02,a=window.sample(t-h),b=window.sample(t),d=window.sample(t+h),acc=(d.rotation-2*b.rotation+a.rotation)/(h*h),torque=b.jets.frontRight+b.jets.rearRight-b.jets.frontLeft-b.jets.rearLeft;rollChecks.push({id,t,acc,torque,sameSign:Math.abs(acc)<1e-6&&Math.abs(torque)<1e-6||acc*torque>0});}}
  const c17=cue('s17'),fall=[.05,.25,.5,.75,.99].map(u=>{const t=c17.startSec+(c17.endSec-c17.startSec)*u,s=window.sample(t);return {t,height:s.position[1],jets:Object.values(s.jets).reduce((a,b)=>a+b,0)};});
  const s09=cue('s09'),s16=cue('s16'),s23=cue('s23'),hoverStart=window.captions.cues.find(c=>c.id==='s16-3').startFrame/30,hoverEnd=window.captions.cues.find(c=>c.id==='s16-5').startFrame/30,inverted=window.sample((s09.startSec+s09.endSec)/2),hover=window.sample(hoverStart+.4),hover2=window.sample(hoverEnd-.4),review=window.sample((s23.startSec+s23.endSec)/2);
  const narrativeChecks={s09Inverted:Math.abs(inverted.rotation-Math.PI)<1e-8,s16HoverDelta:Math.abs(hover.position[1]-hover2.position[1]),s16HasContinuedGas:Object.values(hover.jets).every(v=>v>0),s23NozzlePointsUp:review.nozzleExhaustDirection[1]>.99,s23NoFakeGas:Object.values(review.jets).every(v=>v===0)};
  return {type:'kinematic illustration QA, not CFD or vehicle feasibility',framesChecked:total,bad,maxCameraStep,maxCarStep,maxTargetStep,maxThetaStep,minRollEnvelope,maxTirePlaneError:Math.max(...contacts),boundaries,deterministic,rollChecks,thrustShutdownFall:fall,narrativeChecks};
 });
 const timeline=await page.evaluate(()=>window.timeline);for(const id of['s04','s05','s14','s17','s18','s20','s22','s25']){const c=timeline.cues.find(c=>c.id===id),t=(c.startSec+c.endSec)/2;await page.evaluate(t=>window.draw(t),t);await page.screenshot({path:path.join(out,`${id}.png`)});}
 report.browserErrors=errors;report.passed=report.bad.length===0&&report.browserErrors.length===0&&report.maxTirePlaneError<1e-8&&report.boundaries.every(b=>b.carGap<.001&&b.cameraGap<.005)&&report.deterministic.every(d=>d.identical)&&report.rollChecks.every(r=>r.sameSign)&&report.thrustShutdownFall.every(r=>r.jets===0)&&report.narrativeChecks.s09Inverted&&report.narrativeChecks.s16HoverDelta<1e-8&&report.narrativeChecks.s16HasContinuedGas&&report.narrativeChecks.s23NozzlePointsUp&&report.narrativeChecks.s23NoFakeGas;
 await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
}finally{await browser.close();await new Promise(r=>server.close(r));}
