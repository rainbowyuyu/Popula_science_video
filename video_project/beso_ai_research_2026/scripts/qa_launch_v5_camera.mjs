/** Independent numerical QA of the exported continuous v5 camera route.
 * This does not construct WebGL, run solvers, or edit source/model files. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {Vector3,PerspectiveCamera} from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sourcePath=path.join(root,'src/beso/LaunchV5Camera.ts');
const modelPath=path.join(root,'public/beso-research/physics/native-model.json');
const worldPath=path.join(root,'src/beso/ContinuousLaunchWorld.ts');
const source=await fs.readFile(sourcePath),modelBytes=await fs.readFile(modelPath);
const worldSource=await fs.readFile(worldPath);
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const scratch=path.join(root,'tmp/launch-v5-camera-qa');
await fs.mkdir(scratch,{recursive:true});
const bundle=path.join(scratch,'camera.mjs');
await build({entryPoints:[sourcePath],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',logLevel:'silent'});
const {V5_CAMERA_KEYS:keys,sampleV5Camera:sample}=await import(pathToFileURL(bundle).href+'?audit='+Date.now());
if(!Array.isArray(keys)||keys.length<3||typeof sample!=='function')throw Error('Camera exports must include V5_CAMERA_KEYS and sampleV5Camera.');

const fps=60,frames=6300,duration=105;
const phases=[['hero',0],['brief',7],['topology',19],['physics',34],['interaction',52],['toolchain',65],['proof',78],['close',94]];
const limits={minimumCameraTargetDistanceM:1,maximumSingleFrameStepM:20,maximumLookDirectionStepDegrees:2,firstDerivativeResidualMPerS:.05,derivativeProbeSeconds:1e-4,minimumApproximateHullClearanceM:.5};
const model=JSON.parse(modelBytes.toString('utf8'));
const projectionConfig=/new T\.PerspectiveCamera\(\s*([\d.]+),\s*16\/9,\s*([\d.]+),\s*([\d.]+)\)/.exec(worldSource.toString('utf8'));
if(!projectionConfig)throw Error('Cannot verify ContinuousLaunchWorld perspective configuration.');
const projectionCamera=new PerspectiveCamera(Number(projectionConfig[1]),16/9,Number(projectionConfig[2]),Number(projectionConfig[3]));
const sourceVector=a=>new Vector3(a[0],a[2],-a[1]);
const hull=model.elements.map(el=>({id:`native-${el.id}`,role:el.role,a:sourceVector(model.nodes[String(el.from)]),b:sourceVector(model.nodes[String(el.to)]),radius:el.diameterM?el.diameterM/2:Math.hypot(el.widthM??1,el.heightM??1)/2}));
hull.push({id:'tower-envelope',role:'tower',a:new Vector3(0,model.tower.baseZM,0),b:new Vector3(0,model.tower.baseZM+model.tower.lengthM,0),radius:5.35});
const pointSegmentDistance=(p,a,b)=>{const ab=b.clone().sub(a),l=ab.lengthSq();const u=l?Math.max(0,Math.min(1,p.clone().sub(a).dot(ab)/l)):0;return p.distanceTo(a.clone().addScaledVector(ab,u));};
const finitePose=p=>[...p.position.toArray(),...p.target.toArray()].every(Number.isFinite);
const failures=[],samples=[];
const max=(old,value,frame)=>value>old.value?{value,frame}:old;
let minDistance={value:Infinity,frame:0},minHullClearance={value:Infinity,frame:0,member:''};
let maxPositionStep={value:0,frame:0},maxTargetStep={value:0,frame:0},maxLookDirectionStepDegrees={value:0,frame:0};
let maxPositionAcceleration={value:0,frame:0},maxTargetAcceleration={value:0,frame:0};
let previous,previousDelta,previousTargetDelta;
for(let frame=0;frame<frames;frame++){
 const time=frame/fps,pose=sample(time),scene=phases.findLast(p=>time>=p[1])[0];
 if(!finitePose(pose)){failures.push({type:'nonfinite_pose',frame});continue;}
 const distance=pose.position.distanceTo(pose.target);
 if(distance<minDistance.value)minDistance={value:distance,frame};
 if(distance<limits.minimumCameraTargetDistanceM)failures.push({type:'camera_target_collision',frame,distance});
 const nearest=hull.reduce((best,m)=>{const clearance=pointSegmentDistance(pose.position,m.a,m.b)-m.radius;return clearance<best.clearance?{clearance,member:m.id}:best;},{clearance:Infinity,member:''});
 if(nearest.clearance<minHullClearance.value)minHullClearance={value:nearest.clearance,frame,member:nearest.member};
 if(nearest.clearance<limits.minimumApproximateHullClearanceM)failures.push({type:'approximate_hull_intersection',frame,...nearest});
 let positionStep=0,targetStep=0,positionAcceleration=0,targetAcceleration=0,angle=0;
 if(previous){
  const delta=pose.position.clone().sub(previous.position),td=pose.target.clone().sub(previous.target);
  positionStep=delta.length();targetStep=td.length();
  positionAcceleration=previousDelta?delta.distanceTo(previousDelta):0;
  targetAcceleration=previousTargetDelta?td.distanceTo(previousTargetDelta):0;
  const a=previous.target.clone().sub(previous.position).normalize(),b=pose.target.clone().sub(pose.position).normalize();
  angle=Math.acos(Math.max(-1,Math.min(1,a.dot(b))))*180/Math.PI;
  maxPositionStep=max(maxPositionStep,positionStep,frame);maxTargetStep=max(maxTargetStep,targetStep,frame);
  maxPositionAcceleration=max(maxPositionAcceleration,positionAcceleration,frame);maxTargetAcceleration=max(maxTargetAcceleration,targetAcceleration,frame);
  maxLookDirectionStepDegrees=max(maxLookDirectionStepDegrees,angle,frame);
  if(positionStep>limits.maximumSingleFrameStepM||targetStep>limits.maximumSingleFrameStepM)failures.push({type:'frame_jump',frame,positionStep,targetStep});
  if(angle>limits.maximumLookDirectionStepDegrees)failures.push({type:'look_direction_jump',frame,degrees:angle});
  previousDelta=delta;previousTargetDelta=td;
 }
 samples.push({frame,time,scene,position:pose.position.toArray(),target:pose.target.toArray(),distance,positionStep,targetStep,positionAcceleration,targetAcceleration,lookDirectionStepDegrees:angle,hullClearance:nearest.clearance});
 previous={position:pose.position.clone(),target:pose.target.clone()};
}

const checkDerivative=(time,type)=>{
 const h=limits.derivativeProbeSeconds,left=sample(time-h),center=sample(time),right=sample(time+h),channels={};
 for(const k of ['position','target']){
  const vl=center[k].clone().sub(left[k]).divideScalar(h),vr=right[k].clone().sub(center[k]).divideScalar(h),residual=vl.distanceTo(vr);
  channels[k]={leftVelocityMPerS:vl.toArray(),rightVelocityMPerS:vr.toArray(),residualMPerS:residual,pass:residual<=limits.firstDerivativeResidualMPerS};
  if(!channels[k].pass)failures.push({type:'first_order_discontinuity',location:type,time,channel:k,residualMPerS:residual});
 }
 return {time,type,...channels};
};
const boundaries=phases.slice(1).map(([scene,t])=>({scene,...checkDerivative(t,'semantic-boundary'),frames:[-1,0,1].map(i=>samples[Math.round(t*fps)+i])}));
const knots=keys.filter(k=>k.t>0&&k.t<duration).map(k=>checkDerivative(k.t,'camera-knot'));
const projectAt=(time,point)=>{const p=sample(time);projectionCamera.position.copy(p.position);projectionCamera.lookAt(p.target);projectionCamera.updateMatrixWorld();const ndc=new Vector3(...point).project(projectionCamera);return {x:(ndc.x+1)*960,y:(1-ndc.y)*540,depth:ndc.z,inFrame:ndc.x>=-1&&ndc.x<=1&&ndc.y>=-1&&ndc.y<=1&&ndc.z>=-1&&ndc.z<=1};};
const rotorTips=[0,1,2].map(i=>{const a=i*Math.PI*2/3+.12;return[model.rotor.hubX,model.rotor.hubZM+model.rotor.bladeLengthM*Math.cos(a),model.rotor.bladeLengthM*Math.sin(a)];});
const framing=[0,4.5,7,12,19,23,28,33,38,43,46.5,50,57,65,78,87,94,100,(frames-1)/fps].map(time=>({time,base:projectAt(time,[0,model.tower.baseZM,0]),towerTop:projectAt(time,[0,model.tower.baseZM+model.tower.lengthM,0]),rotorTips:rotorTips.map(p=>projectAt(time,p)),fairlead1:projectAt(time,sourceVector(model.mooringPolylines[0].nativeXYZ.at(-1)).toArray()),specimenCenter:projectAt(time,[0,28,90])}));
const fullHeroChecks=framing.filter(f=>f.time===0||f.time>=94).map(f=>({time:f.time,pass:f.base.inFrame&&f.rotorTips.every(p=>p.inFrame)}));
for(const f of fullHeroChecks)if(!f.pass)failures.push({type:'opening_or_closing_turbine_envelope_cropped',time:f.time});
const ordering=keys.every((k,i)=>i===0||keys[i-1].t<k.t);
if(!ordering)failures.push({type:'non_increasing_camera_keys'});
if(keys[0].t!==0||keys.at(-1).t<duration)failures.push({type:'incomplete_time_coverage',first:keys[0].t,last:keys.at(-1).t});
const sourceUnchanged=sha(source)===sha(await fs.readFile(sourcePath))&&sha(modelBytes)===sha(await fs.readFile(modelPath))&&sha(worldSource)===sha(await fs.readFile(worldPath));
if(!sourceUnchanged)failures.push({type:'inputs_changed_during_audit'});
const report={schema:'launch-v5-camera-qa-v1',checked:new Date().toISOString(),sourceSHA256:sha(source),modelSHA256:sha(modelBytes),worldSHA256:sha(worldSource),sourceUnchanged,fps,frameCount:frames,durationSeconds:duration,limits,keyCount:keys.length,keyTimes:keys.map(k=>k.t),minDistance,minHullClearance,maxPositionStep,maxTargetStep,maxPositionAcceleration,maxTargetAcceleration,maxLookDirectionStepDegrees,boundaries,knots,projection:{fov:projectionCamera.fov,near:projectionCamera.near,far:projectionCamera.far,framing,fullHeroChecks},pass:failures.length===0,failures,limitation:'Approximate conservative capsules around static native source centerlines and tower skin; does not include animated saved motion, blades, small details, display panels, or occlusion. Framing uses native source blade-tip axes and unanimated anchors. Numerical C0/C1 does not certify composition, text contrast, subject continuity, or aesthetics.'};
const output=path.join(root,'research/qa');await fs.mkdir(output,{recursive:true});
await fs.writeFile(path.join(output,'launch-v5-camera.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(output,'launch-v5-camera-samples.json'),JSON.stringify({fps,frames,samples})+'\n');
console.log(JSON.stringify({pass:report.pass,frames,keyCount:keys.length,minDistance,minHullClearance,maxPositionStep,maxTargetStep,maxLookDirectionStepDegrees,failures:failures.slice(0,30),failureCount:failures.length},null,2));
if(!report.pass)process.exitCode=1;
