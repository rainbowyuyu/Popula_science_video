/** Read-only launch v4 camera QA. No WebGL context, model loads, or scene edits. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const storyPath=path.join(root,'src/launch-story.json');
const sourcePath=path.join(root,'src/beso/CinematicWorld.ts');
const storyBytes=await fs.readFile(storyPath),sourceBytes=await fs.readFile(sourcePath);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const story=JSON.parse(storyBytes.toString('utf8'));
const aliases={hero:'hook',brief:'brief',topology:'beso',physics:'zwind',interaction:'brief',toolchain:'rebuild',proof:'compare',close:'close'};
const tmp=path.join(root,'tmp/launch-v4-camera-qa');await fs.mkdir(tmp,{recursive:true});
const bundle=path.join(tmp,'cinematic-world-for-qa.mjs');
await build({entryPoints:[sourcePath],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',logLevel:'silent'});
const {CinematicWorld}=await import(pathToFileURL(bundle).href+'?audit='+Date.now());
const world=Object.create(CinematicWorld.prototype);
world.launchMode=true;
world.launchTimings=story.scenes.map(s=>({id:aliases[s.id],start:s.start,duration:s.duration}));
world.launchFps=story.fps;world.timings=world.launchTimings;world.fps=story.fps;
const fps=story.fps,frameCount=story.duration;
const stateAtTime=(time,forceIndex)=>{
 const index=forceIndex??Math.max(0,story.scenes.findLastIndex(s=>s.start<=time*fps));
 const scene=story.scenes[index];
 return{id:aliases[scene.id],index,local:time-scene.start/fps,progress:Math.max(0,Math.min(1,(time*fps-scene.start)/scene.duration)),time,duration:scene.duration/fps,sceneStart:scene.start/fps};
};
const poseAt=(time,forceIndex)=>world.cameraPose(stateAtTime(time,forceIndex));
const vecReport=p=>({position:p.position.toArray(),target:p.target.toArray()});
const failures=[];
const limits={minimumCameraTargetDistanceM:1,maxSingleFramePositionOrTargetStepM:20,boundarySameTimePoseResidualM:1e-8,boundaryOneSidedVelocityDifferenceMPerS:.05,derivativeProbeSeconds:1e-4};
let previous,previousDelta,previousTargetDelta;
let maxPositionStep={value:0,frame:0},maxTargetStep={value:0,frame:0},maxPositionAcceleration={value:0,frame:0},maxTargetAcceleration={value:0,frame:0},maxLookDirectionStepDegrees={value:0,frame:0};
let minimumDistance={value:Infinity,frame:0},maximumDistance={value:0,frame:0};
const samples=[];
const maxRecord=(record,value,frame)=>value>record.value?{value,frame}:record;
for(let frame=0;frame<frameCount;frame++){
 const time=frame/fps,state=stateAtTime(time),pose=world.cameraPose(state);
 if(![...pose.position.toArray(),...pose.target.toArray()].every(Number.isFinite))failures.push({frame,type:'nonfinite_pose'});
 const distance=pose.position.distanceTo(pose.target);
 if(distance<minimumDistance.value)minimumDistance={value:distance,frame};
 maximumDistance=maxRecord(maximumDistance,distance,frame);
 if(distance<limits.minimumCameraTargetDistanceM)failures.push({frame,type:'camera_target_collision',distance});
 let positionStep=0,targetStep=0,positionAcceleration=0,targetAcceleration=0,lookDirectionStepDegrees=0;
 if(previous){
  const delta=pose.position.clone().sub(previous.position),targetDelta=pose.target.clone().sub(previous.target);
  positionStep=delta.length();targetStep=targetDelta.length();
  positionAcceleration=previousDelta?delta.distanceTo(previousDelta):0;
  targetAcceleration=previousTargetDelta?targetDelta.distanceTo(previousTargetDelta):0;
  const lastDirection=previous.target.clone().sub(previous.position).normalize();
  const direction=pose.target.clone().sub(pose.position).normalize();
  lookDirectionStepDegrees=Math.acos(Math.max(-1,Math.min(1,lastDirection.dot(direction))))*180/Math.PI;
  maxPositionStep=maxRecord(maxPositionStep,positionStep,frame);maxTargetStep=maxRecord(maxTargetStep,targetStep,frame);
  maxPositionAcceleration=maxRecord(maxPositionAcceleration,positionAcceleration,frame);maxTargetAcceleration=maxRecord(maxTargetAcceleration,targetAcceleration,frame);
  maxLookDirectionStepDegrees=maxRecord(maxLookDirectionStepDegrees,lookDirectionStepDegrees,frame);
  if(positionStep>20||targetStep>20)failures.push({frame,scene:story.scenes[state.index].id,type:'instantaneous_jump',positionStep,targetStep});
  previousDelta=delta;previousTargetDelta=targetDelta;
 }
 samples.push({frame,timeS:time,scene:story.scenes[state.index].id,alias:state.id,...vecReport(pose),distance,positionStep,targetStep,positionAcceleration,targetAcceleration,lookDirectionStepDegrees});
 previous={position:pose.position.clone(),target:pose.target.clone()};
}
const derivativeCheck=(time,type,label)=>{
 const h=limits.derivativeProbeSeconds,left=poseAt(time-h),center=poseAt(time),right=poseAt(time+h);
 const result={timeS:time,type,label};
 for(const channel of ['position','target']){
  const vl=center[channel].clone().sub(left[channel]).divideScalar(h),vr=right[channel].clone().sub(center[channel]).divideScalar(h);
  const difference=vl.distanceTo(vr);
  result[channel]={leftVelocityMPerS:vl.toArray(),rightVelocityMPerS:vr.toArray(),differenceMPerS:difference,pass:difference<=limits.boundaryOneSidedVelocityDifferenceMPerS};
  if(difference>limits.boundaryOneSidedVelocityDifferenceMPerS)failures.push({type:'first_order_discontinuity',at:type,label,timeS:time,channel,differenceMPerS:difference});
 }
 return result;
};
const boundaries=story.scenes.slice(1).map((s,i)=>{
 const time=s.start/fps,leftAtBoundary=poseAt(time,i),rightAtBoundary=poseAt(time,i+1);
 const residual={positionM:leftAtBoundary.position.distanceTo(rightAtBoundary.position),targetM:leftAtBoundary.target.distanceTo(rightAtBoundary.target)};
 if(residual.positionM>limits.boundarySameTimePoseResidualM||residual.targetM>limits.boundarySameTimePoseResidualM)failures.push({type:'scene_state_camera_jump',scene:s.id,residual});
 return{scene:s.id,fromScene:story.scenes[i].id,startFrame:s.start,timeS:time,sameTimeStateResidual:residual,firstOrder:derivativeCheck(time,'scene_boundary',s.id),samples:[-2,-1,0,1,2].map(off=>samples[s.start+off]).filter(Boolean)};
});
const cameraBody=sourceBytes.toString('utf8').split('private launchCamera')[1]?.split('const idx=')[0]??'';
const splineTimes=[...cameraBody.matchAll(/\{t:([\d.]+),p:/g)].map(m=>Number(m[1]));
if(splineTimes.length<3)throw new Error('Cannot extract launchCamera spline times for derivative QA');
const splineKnots=splineTimes.filter(t=>t>0&&t<frameCount/fps).map(t=>derivativeCheck(t,'spline_knot',`t=${t}`));
const voicePlanPath=path.join(root,'research/launch-v4-voice-plan.json');
const voicePlan=JSON.parse(await fs.readFile(voicePlanPath,'utf8'));
const voiceRecords=[];
for(const row of voicePlan.shots){
 const take=JSON.parse(await fs.readFile(path.join(root,'audio/takes',row.id+'.json'),'utf8'));
 const asr=JSON.parse(await fs.readFile(path.join(root,'audio/asr',row.id+'.json'),'utf8'));
 const actual=sha(await fs.readFile(path.join(root,take.processed)));
 const pass=actual===take.sha256&&actual===asr.sourceSHA256&&row.ttsText===take.ttsText&&row.ttsText===asr.expected;
 voiceRecords.push({id:row.id,pass,actualSHA256:actual,asrRatio:asr.ratio,flags:asr.flags});
 if(!pass)failures.push({type:'voice_hash_or_expected_mismatch',id:row.id});
}
const sourceUnchanged=sha(sourceBytes)===sha(await fs.readFile(sourcePath))&&sha(storyBytes)===sha(await fs.readFile(storyPath));
if(!sourceUnchanged)failures.push({type:'source_changed_during_audit'});
const report={schema:'launch-v4-camera-continuity-qa-v1',checked:new Date().toISOString(),mode:'Object.create(CinematicWorld.prototype), launchMode=true; no WebGL/model initialization; cameraPose routes to actual launchCamera',storySHA256:sha(storyBytes),worldSHA256:sha(sourceBytes),sourceUnchanged,aliases,fps,frameCount,durationSeconds:frameCount/fps,limits,minimumDistance,maximumDistance,maxPositionStep,maxTargetStep,maxPositionAcceleration,maxTargetAcceleration,maxLookDirectionStepDegrees,boundaries,splineKnots,voiceValidation:{count:voiceRecords.length,pass:voiceRecords.every(r=>r.pass),records:voiceRecords},pass:failures.length===0,failures,limitation:'Numerical C0/C1 camera continuity does not certify occlusion, framing, object pop-in, typography, or aesthetic quality. Finite-difference derivative residual includes smooth curvature over 0.0001 s.'};
await fs.mkdir(path.join(root,'research/qa'),{recursive:true});
await fs.writeFile(path.join(root,'research/qa/launch-v4-camera.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,frameCount,minimumDistance,maxPositionStep,maxTargetStep,maxLookDirectionStepDegrees,boundaryCount:boundaries.length,splineKnotCount:splineKnots.length,voiceHashValidation:report.voiceValidation.pass,failures},null,2));
if(!report.pass)process.exitCode=1;
