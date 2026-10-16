/** Numeric V3 camera/timeline audit. Actual duration is read from frozen narration. */
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
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8').replace(/^\uFEFF/,''));
const digest=file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex');
const sources=['src/Camera.ts','src/Timeline.ts','src/timeline-data.json','src/narration.json','src/word-events.json'];
const beforeHashes=Object.fromEntries(sources.map(file=>[file,digest(file)]));
const options={target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,moduleResolution:ts.ModuleResolutionKind.Node10,rootDir:path.join(root,'src'),outDir:compileDir,strict:true,esModuleInterop:true,resolveJsonModule:true,skipLibCheck:true,noEmitOnError:true};
const program=ts.createProgram([path.join(root,'src/Camera.ts')],options);
const errors=ts.getPreEmitDiagnostics(program).filter(d=>d.category===ts.DiagnosticCategory.Error);
if(errors.length){
  const message=ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'});
  fs.writeFileSync(path.join(qaDir,'motion-compile-errors.txt'),message);
  throw new Error(`Camera TypeScript compilation failed: ${message}`);
}
if(program.emit().emitSkipped)throw new Error('Camera compilation skipped emission');
fs.writeFileSync(path.join(compileDir,'package.json'),JSON.stringify({type:'commonjs'}));
const require=createRequire(import.meta.url);
const camera=require(path.join(compileDir,'Camera.js'));
const {sampleCamera}=camera;
const keys=typeof camera.cameraKeys==='function'?camera.cameraKeys():camera.cameraKeys;
const {timeline,FPS}=require(path.join(compileDir,'Timeline.js'));
const narration=read('src/narration.json');
const audio=read('work/audio/audio-qa.json');
const captions=read('src/captions-data.json').cues;
const frames=timeline.durationFrames,expectedFrames=narration.durationFrames;
const duration=narration.durationSec;
const thresholds={positionStepHard:2,targetStepHard:2,angularSpeedHardDegSec:90,positionSpeedWarning:15,targetSpeedWarning:20,angularSpeedWarningDegSec:45,boundaryValueTolerance:.01,boundaryVelocityTolerance:.02,minFocusDistance:.10,minFov:5,maxFov:150};
const violations=[],warnings=[],samples=[];
const assert=(condition,type,detail={})=>{if(!condition)violations.push({type,...detail});};
assert(FPS===narration.fps&&FPS===30,'fps-mismatch',{camera:FPS,narration:narration.fps});
assert(Number.isInteger(frames)&&frames>0&&frames===expectedFrames,'frame-count-mismatch',{frames,expectedFrames});
assert(Math.abs(frames/FPS-duration)<1e-8&&Math.abs(timeline.durationSec-duration)<1e-8,'duration-mismatch',{duration,timelineDuration:timeline.durationSec});
assert(audio.samples===Math.round(duration*audio.sampleRate)&&audio.samples===frames*audio.sampleRate/FPS,'audio-sample-contract');
assert(Array.isArray(keys)&&keys.length>=2,'invalid-camera-keys');
assert(Array.isArray(timeline.cues)&&timeline.cues.length===narration.cues.length,'cue-count-mismatch');
assert(new Set(timeline.cues.map(c=>c.id)).size===timeline.cues.length,'duplicate-cue-id');
for(let i=0;i<timeline.cues.length;i++){
  const c=timeline.cues[i],n=narration.cues.find(n=>n.id===c.id),previous=timeline.cues[i-1];
  assert(n&&c.startFrame===n.startFrame&&c.endFrame===n.endFrame,'cue-time-mismatch',{id:c.id});
  assert(c.startFrame>=0&&c.endFrame<=frames&&c.endFrame>c.startFrame,'cue-outside-timeline',{id:c.id});
  assert(!previous||previous.endFrame<=c.startFrame,'overlapping-cues',{id:c.id});
}
for(let i=0;i<captions.length;i++){
  const c=captions[i],previous=captions[i-1];
  assert(c.startFrame>=0&&c.endFrame<=frames&&c.endFrame>c.startFrame,'invalid-caption-time',{id:c.id});
  assert(!previous||previous.endFrame<=c.startFrame,'overlapping-captions',{id:c.id});
  assert(c.text.length<=24,'caption-too-long',{id:c.id,characters:c.text.length});
}
const distance=(a,b)=>Math.hypot(...a.map((n,i)=>n-b[i]));
const sub=(a,b,s=1)=>a.map((v,i)=>(v-b[i])/s);
const norm=v=>Math.hypot(...v);
const finitePose=p=>p&&Array.isArray(p.position)&&p.position.length===3&&Array.isArray(p.target)&&p.target.length===3&&[...p.position,...p.target,p.fov,p.roll??0].every(Number.isFinite);
const round=(x,n=6)=>Number(x.toFixed(n));
const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),target=new THREE.Vector3(),up=new THREE.Vector3();
const orientation=p=>{position.set(...p.position);target.set(...p.target);const roll=p.roll??0;up.set(Math.sin(roll),Math.cos(roll),0);matrix.lookAt(position,target,up);return new THREE.Quaternion().setFromRotationMatrix(matrix);};
const names=['positionSpeed','targetSpeed','angularSpeedDegSec','positionStep','targetStep','fovSpeedDegSec','positionAcceleration','targetAcceleration'];
const maxima=Object.fromEntries(names.map(n=>[n,{value:0,frame:0,t:0}]));
let previous=null,previousQ=null,previousV=null,previousTV=null,minFocus=Infinity,minFov=Infinity,maxFov=-Infinity;
for(let frame=0;frame<frames;frame++){
  const t=frame/FPS,p=sampleCamera(t);
  if(!finitePose(p)){violations.push({type:'non-finite-pose',frame,t});continue;}
  const again=sampleCamera(t);
  assert(JSON.stringify(p)===JSON.stringify(again),'nondeterministic-camera',{frame,t});
  const focus=distance(p.position,p.target),q=orientation(p);
  minFocus=Math.min(minFocus,focus);minFov=Math.min(minFov,p.fov);maxFov=Math.max(maxFov,p.fov);
  assert(focus>=thresholds.minFocusDistance,'degenerate-look-at',{frame,t,focus});
  assert(p.fov>=thresholds.minFov&&p.fov<=thresholds.maxFov,'invalid-fov',{frame,t,fov:p.fov});
  const velocity=previous?sub(p.position,previous.position,1/FPS):null;
  const targetVelocity=previous?sub(p.target,previous.target,1/FPS):null;
  const metrics={positionStep:previous?distance(previous.position,p.position):0,targetStep:previous?distance(previous.target,p.target):0,
    angularSpeedDegSec:previousQ?2*Math.acos(Math.min(1,Math.abs(previousQ.dot(q))))*180/Math.PI*FPS:0,
    fovSpeedDegSec:previous?Math.abs(p.fov-previous.fov)*FPS:0,
    positionAcceleration:previousV&&velocity?norm(sub(velocity,previousV,1/FPS)):0,
    targetAcceleration:previousTV&&targetVelocity?norm(sub(targetVelocity,previousTV,1/FPS)):0};
  metrics.positionSpeed=metrics.positionStep*FPS;metrics.targetSpeed=metrics.targetStep*FPS;
  for(const name of names)if(metrics[name]>maxima[name].value)maxima[name]={value:metrics[name],frame,t};
  for(const [name,limit]of[['positionStep',thresholds.positionStepHard],['targetStep',thresholds.targetStepHard],['angularSpeedDegSec',thresholds.angularSpeedHardDegSec]])assert(metrics[name]<=limit,name,{frame,t,value:metrics[name],limit});
  samples.push({frame,t:round(t),position:p.position.map(x=>round(x)),target:p.target.map(x=>round(x)),fov:round(p.fov),roll:round(p.roll??0),positionSpeed:round(metrics.positionSpeed),targetSpeed:round(metrics.targetSpeed),angularSpeedDegSec:round(metrics.angularSpeedDegSec)});
  previous=p;previousQ=q;previousV=velocity;previousTV=targetVelocity;
}
const boundaries=[];
assert(keys[0].t<=0&&keys.at(-1).t>=duration,'camera-key-range',{first:keys[0].t,last:keys.at(-1).t,duration});
for(let i=0;i<keys.length;i++){
  const key=keys[i];assert(Number.isFinite(key.t)&&finitePose(key),'invalid-camera-key',{keyIndex:i});
  if(i>0)assert(key.t>keys[i-1].t,'duplicate-or-reversed-camera-time',{keyIndex:i,t:key.t});
  if(i===0||i===keys.length-1||key.t<=0||key.t>=duration)continue;
  const eps=1e-4,a=sampleCamera(key.t-eps),b=sampleCamera(key.t),c=sampleCamera(key.t+eps);
  const item={keyIndex:i,t:round(key.t),frame:Math.round(key.t*FPS),
    positionSpanAtEpsilon:distance(a.position,c.position),targetSpanAtEpsilon:distance(a.target,c.target),
    positionVelocityMismatch:norm(sub(sub(b.position,a.position,eps),sub(c.position,b.position,eps))),
    targetVelocityMismatch:norm(sub(sub(b.target,a.target,eps),sub(c.target,b.target,eps))),
    fovVelocityMismatch:Math.abs((b.fov-a.fov)/eps-(c.fov-b.fov)/eps)};
  boundaries.push(item);
  assert(item.positionSpanAtEpsilon<=thresholds.boundaryValueTolerance&&item.targetSpanAtEpsilon<=thresholds.boundaryValueTolerance&&item.positionVelocityMismatch<=thresholds.boundaryVelocityTolerance&&item.targetVelocityMismatch<=thresholds.boundaryVelocityTolerance&&item.fovVelocityMismatch<=thresholds.boundaryVelocityTolerance,'camera-key-continuity',item);
}
assert(finitePose(sampleCamera(duration)),'non-finite-endpoint');
for(const [name,limit]of[['positionSpeed',thresholds.positionSpeedWarning],['targetSpeed',thresholds.targetSpeedWarning],['angularSpeedDegSec',thresholds.angularSpeedWarningDegSec]]){
  if(maxima[name].value>limit)warnings.push({type:name,...maxima[name],limit,note:'Review the rendered shot; numeric flag alone is not a visible defect.'});
}
const groups=timeline.groups.map(g=>{
  const start=g.start??g.startSec,end=g.end??g.endSec,subset=samples.filter(s=>s.t>=start&&s.t<end);
  return{id:g.id,start,end,frames:subset.length,maxPositionSpeed:Math.max(0,...subset.map(s=>s.positionSpeed)),maxTargetSpeed:Math.max(0,...subset.map(s=>s.targetSpeed)),maxAngularSpeedDegSec:Math.max(0,...subset.map(s=>s.angularSpeedDegSec))};
});
const afterHashes=Object.fromEntries(sources.map(file=>[file,digest(file)]));
assert(JSON.stringify(beforeHashes)===JSON.stringify(afterHashes),'source-changed-during-check');
const report={status:violations.length?'FAIL':warnings.length?'PASS_WITH_REVIEW_FLAGS':'PASS',
  method:'Isolated TypeScript compilation; sampleCamera evaluated twice at every delivered frame. Look-at orientation includes optional roll. Symmetric epsilon checks verify position/target/FOV value and velocity continuity at all internal keys.',
  limits:'Numeric trajectories cannot establish visibility, lack of occlusion, semantic alignment, or aesthetic quality. Rendered representative frames and playback checks are separate.',
  fps:FPS,expectedFrames,sampledFrames:samples.length,declaredFrames:frames,frameCountMatchesRequested:frames===expectedFrames,durationSeconds:duration,
  sourceSha256:afterHashes,sourceStable:JSON.stringify(beforeHashes)===JSON.stringify(afterHashes),thresholds,keyCount:keys.length,
  focusDistanceMin:minFocus,fovRange:[minFov,maxFov],maxima,violations,warnings,boundaries,groups,
  narrationCues:timeline.cues.length,subtitleCount:captions.length,
  largestAngularSteps:[...samples].sort((a,b)=>b.angularSpeedDegSec-a.angularSpeedDegSec).slice(0,12),samplesFile:'motion-samples.json'};
fs.writeFileSync(path.join(qaDir,'motion-samples.json'),JSON.stringify(samples));
fs.writeFileSync(path.join(qaDir,'motion.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,sampledFrames:samples.length,maxPositionSpeed:maxima.positionSpeed,maxTargetSpeed:maxima.targetSpeed,maxAngularSpeedDegSec:maxima.angularSpeedDegSec,violations:violations.length,warnings:warnings.length,report:path.join(qaDir,'motion.json')},null,2));
if(report.status==='FAIL')process.exitCode=1;
