/** Deterministic numeric camera audit. No browser, renderer, or shared bundle. */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import crypto from 'node:crypto';
import ts from 'typescript';
import * as THREE from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const qaDir=path.join(root,'work/qa');
const compileDir=path.join(qaDir,'motion-compiled');
fs.mkdirSync(compileDir,{recursive:true});
const sources=['src/Camera.ts','src/Timeline.ts','src/timeline-data.json'];
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,rootDir:path.join(root,'src'),outDir:compileDir,strict:true,esModuleInterop:true,resolveJsonModule:true,skipLibCheck:true,noEmitOnError:true};
const program=ts.createProgram([path.join(root,'src/Camera.ts')],options);
const diagnostics=ts.getPreEmitDiagnostics(program);
const errors=diagnostics.filter(d=>d.category===ts.DiagnosticCategory.Error);
if(errors.length){
  const message=ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'});
  fs.writeFileSync(path.join(qaDir,'motion-compile-errors.txt'),message);
  throw new Error(`Camera TypeScript compilation failed (${errors.length} errors): ${message}`);
}
const emit=program.emit();
if(emit.emitSkipped)throw new Error('Camera compiler skipped emission.');
fs.writeFileSync(path.join(compileDir,'package.json'),JSON.stringify({type:'commonjs'}));
const require=createRequire(import.meta.url);
const {sampleCamera,cameraKeys}=require(path.join(compileDir,'Camera.js'));
const {timeline,FPS}=require(path.join(compileDir,'Timeline.js'));
const frames=timeline.durationFrames;
const thresholds={positionStepHard:2,targetStepHard:2,angularSpeedHardDegSec:90,positionSpeedWarning:15,targetSpeedWarning:20,angularSpeedWarningDegSec:45,boundaryValueTolerance:.01,boundaryVelocityTolerance:.02,minFocusDistance:.10,minFov:5,maxFov:150};
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const sub=(a,b,s=1)=>a.map((v,i)=>(v-b[i])/s);
const norm=v=>Math.hypot(...v);
const finitePose=p=>[...p.position,...p.target,p.fov,p.roll].every(Number.isFinite);
const round=(x,n=6)=>Number(x.toFixed(n));
const quaternion=new THREE.Quaternion();
const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),target=new THREE.Vector3(),up=new THREE.Vector3();
const orientation=p=>{position.set(...p.position);target.set(...p.target);up.set(Math.sin(p.roll),Math.cos(p.roll),0);matrix.lookAt(position,target,up);return quaternion.setFromRotationMatrix(matrix).clone();};
const violations=[],warnings=[],samples=[];
let previous=null,previousQ=null;
const maxima={positionSpeed:{value:0,frame:0},targetSpeed:{value:0,frame:0},angularSpeedDegSec:{value:0,frame:0},positionStep:{value:0,frame:0},targetStep:{value:0,frame:0},fovSpeedDegSec:{value:0,frame:0},rollSpeedDegSec:{value:0,frame:0}};
let minFocus=Infinity,minFov=Infinity,maxFov=-Infinity;
for(let frame=0;frame<frames;frame++){
  const t=frame/FPS,p=sampleCamera(t);
  if(!finitePose(p)){violations.push({type:'non-finite-pose',frame,t});continue;}
  const focus=distance(p.position,p.target),q=orientation(p);
  minFocus=Math.min(minFocus,focus);minFov=Math.min(minFov,p.fov);maxFov=Math.max(maxFov,p.fov);
  if(focus<thresholds.minFocusDistance)violations.push({type:'degenerate-look-at',frame,t,focus});
  if(p.fov<thresholds.minFov||p.fov>thresholds.maxFov)violations.push({type:'invalid-fov',frame,t,fov:p.fov});
  const metrics={positionStep:previous?distance(previous.position,p.position):0,targetStep:previous?distance(previous.target,p.target):0,angularSpeedDegSec:previousQ?2*Math.acos(Math.min(1,Math.abs(previousQ.dot(q))))*180/Math.PI*FPS:0,fovSpeedDegSec:previous?Math.abs(p.fov-previous.fov)*FPS:0,rollSpeedDegSec:previous?Math.abs(p.roll-previous.roll)*FPS*180/Math.PI:0};
  metrics.positionSpeed=metrics.positionStep*FPS;metrics.targetSpeed=metrics.targetStep*FPS;
  for(const name of Object.keys(maxima))if(metrics[name]>maxima[name].value)maxima[name]={value:metrics[name],frame,t};
  for(const [name,limit]of[['positionStep',thresholds.positionStepHard],['targetStep',thresholds.targetStepHard],['angularSpeedDegSec',thresholds.angularSpeedHardDegSec]])if(metrics[name]>limit)violations.push({type:name,frame,t,value:metrics[name],limit});
  samples.push({frame,t:round(t),position:p.position.map(x=>round(x)),target:p.target.map(x=>round(x)),fov:round(p.fov),roll:round(p.roll),positionSpeed:round(metrics.positionSpeed),targetSpeed:round(metrics.targetSpeed),angularSpeedDegSec:round(metrics.angularSpeedDegSec)});
  previous=p;previousQ=q;
}
const boundaries=[];
for(let i=1;i<cameraKeys.length-1;i++){
  const key=cameraKeys[i],eps=1e-4;
  if(key.t<=0||key.t>=frames/FPS)continue;
  const a=sampleCamera(key.t-eps),b=sampleCamera(key.t),c=sampleCamera(key.t+eps);
  const positionJump=distance(a.position,c.position),targetJump=distance(a.target,c.target);
  const positionVelocityMismatch=norm(sub(sub(b.position,a.position,eps),sub(c.position,b.position,eps)));
  const targetVelocityMismatch=norm(sub(sub(b.target,a.target,eps),sub(c.target,b.target,eps)));
  const sameTime=cameraKeys[i-1].t>=key.t||cameraKeys[i+1].t<=key.t;
  const item={keyIndex:i,t:round(key.t),frame:Math.round(key.t*FPS),positionSpanAtEpsilon:round(positionJump,9),targetSpanAtEpsilon:round(targetJump,9),positionVelocityMismatch:round(positionVelocityMismatch,9),targetVelocityMismatch:round(targetVelocityMismatch,9),duplicateTime:sameTime};
  boundaries.push(item);
  if(sameTime||positionJump>thresholds.boundaryValueTolerance||targetJump>thresholds.boundaryValueTolerance||positionVelocityMismatch>thresholds.boundaryVelocityTolerance||targetVelocityMismatch>thresholds.boundaryVelocityTolerance)violations.push({type:'camera-key-continuity',...item});
}
for(const [name,limit]of[['positionSpeed',thresholds.positionSpeedWarning],['targetSpeed',thresholds.targetSpeedWarning],['angularSpeedDegSec',thresholds.angularSpeedWarningDegSec]]){
  const m=maxima[name];if(m.value>limit)warnings.push({type:name,...m,limit,note:'Numeric review flag; inspect the shot before treating this as a visible defect.'});
}
const groupStats=timeline.groups.map(g=>{
  const subset=samples.filter(s=>s.t>=g.start&&s.t<g.end);
  return{id:g.id,start:g.start,end:g.end,frames:subset.length,maxPositionSpeed:Math.max(0,...subset.map(s=>s.positionSpeed)),maxTargetSpeed:Math.max(0,...subset.map(s=>s.targetSpeed)),maxAngularSpeedDegSec:Math.max(0,...subset.map(s=>s.angularSpeedDegSec))};
});
const report={status:violations.length?'FAIL':warnings.length?'PASS_WITH_REVIEW_FLAGS':'PASS',method:'TypeScript compiler API emits Camera/Timeline into an isolated CommonJS directory; sampleCamera is then evaluated at every delivered frame. Orientation includes lookAt and roll. Symmetric epsilon checks verify C0/C1 continuity at internal camera keys.',limits:'Numeric trajectory validation does not prove object visibility, collision-free framing, narration alignment, or aesthetic quality. Those require representative frames and motion review.',fps:FPS,expectedFrames:9129,sampledFrames:samples.length,declaredFrames:frames,frameCountMatchesRequested:frames===9129,durationSeconds:frames/FPS,sourceSha256:Object.fromEntries(sources.map(f=>[f,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,f))).digest('hex')])),thresholds,keyCount:cameraKeys.length,focusDistanceMin:minFocus,fovRange:[minFov,maxFov],maxima,violations,warnings,boundaries,groups:groupStats,largestAngularSteps:[...samples].sort((a,b)=>b.angularSpeedDegSec-a.angularSpeedDegSec).slice(0,12),samplesFile:'motion-samples.json'};
if(frames!==9129){report.status='FAIL';report.violations.push({type:'unexpected-delivery-frame-count',expected:9129,actual:frames});}
fs.writeFileSync(path.join(qaDir,'motion-samples.json'),JSON.stringify(samples));
fs.writeFileSync(path.join(qaDir,'motion.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,sampledFrames:samples.length,maxPositionSpeed:maxima.positionSpeed,maxTargetSpeed:maxima.targetSpeed,maxAngularSpeedDegSec:maxima.angularSpeedDegSec,violations:violations.length,warnings:warnings.length,report:path.join(qaDir,'motion.json')},null,2));
if(report.status==='FAIL')process.exitCode=1;
