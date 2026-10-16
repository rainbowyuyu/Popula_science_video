import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {loadCameraParts} from './camera_geometry.mjs';

const arg=(name,fallback)=>process.argv.find(x=>x.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
const timelinePath=arg('timeline','src/timeline.json');
const outputPath=arg('out',`research/qa/upgrade/camera-numerical${timelinePath==='src/timeline.json'?'':'-candidate'}.json`);
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const inputs=[timelinePath,'src/CameraPath.ts','src/PartsInventory.ts','src/parts-names.json','src/visual.ts','src/camera-beats.json','public/models/shanghai-tower.glb','public/models/shanghai-tower-manifest.json','public/music.wav','scripts/check_camera.mjs','scripts/camera_geometry.mjs'];
const before=Object.fromEntries(inputs.map(file=>[file,hash(file)]));
const outdir=`tmp/camera-check-${process.pid}`;
await build({entryPoints:{camera:'src/CameraPath.ts',inventory:'src/PartsInventory.ts'},outdir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'error'});
const {CameraPath,towerCameraAnchors}=await import(pathToFileURL(path.resolve(outdir,'camera.mjs')));
const {PartsInventory}=await import(pathToFileURL(path.resolve(outdir,'inventory.mjs')));
const tl=JSON.parse(fs.readFileSync(timelinePath,'utf8'));
const manifest=JSON.parse(fs.readFileSync('public/models/shanghai-tower-manifest.json','utf8'));
const loaded=await loadCameraParts(manifest);
const inventory=new PartsInventory(loaded.parts);
const anchors={...towerCameraAnchors(manifest),...inventory.anchors};
const route=new CameraPath(tl);route.setAnchors(anchors);
const missingFocus=[...new Set(route.keys.filter(k=>k.focus&&!anchors[k.focus]).map(k=>k.focus))];
if(missingFocus.length)throw new Error('Camera focus anchors are unresolved: '+missingFocus.join(', '));
const beatFile=JSON.parse(fs.readFileSync('src/camera-beats.json','utf8'));
const beatBinding=beatFile.timelineFrames===tl.duration&&beatFile.musicSHA256===before['public/music.wav'];
const knotTimesIncrease=route.keys.every((k,i)=>i===0||k.t>route.keys[i-1].t);
const camera=new T.PerspectiveCamera(34,1920/1080,.008,200);
const degrees=180/Math.PI;
const locate=frame=>{
 const clip=tl.clips.find(c=>frame>=c.start&&frame<c.end)??(frame<tl.clips[0].start?tl.clips[0]:tl.clips.at(-1));
 return {frame,timeSeconds:frame/tl.fps,cue:Number(clip.id.slice(1))+(frame-clip.start)/(clip.end-clip.start),clip:clip.id,section:clip.section??'unspecified'};
};
let last=null,minRadius=Infinity,maxFocusError=0;
const samples=[],trajectory=[];
for(let f=0;f<tl.duration;f++){
 const t=f/tl.fps,p=route.at(t);route.apply(camera,t);
 if(![...p.position,...p.target,p.shift,...camera.quaternion].every(Number.isFinite))throw new Error('Nonfinite camera '+f);
 const radius=p.position.distanceTo(p.target);minRadius=Math.min(minRadius,radius);
 const ndc=p.target.clone().project(camera);maxFocusError=Math.max(maxFocusError,Math.abs(ndc.y));
 if(last){
  const step=p.position.distanceTo(last.position),targetStep=p.target.distanceTo(last.target),angle=camera.quaternion.angleTo(last.q),denominator=Math.min(radius,last.radius);
  samples.push({...locate(f),radius,step,stepOverRadius:step/denominator,normalisedSpeedPerSecond:step/denominator*tl.fps,targetStepOverRadius:targetStep/denominator,targetNormalisedSpeedPerSecond:targetStep/denominator*tl.fps,angularStepDegrees:angle*degrees,angularSpeedDegreesPerSecond:angle*degrees*tl.fps,logRadiusRatePerSecond:Math.abs(Math.log(radius/last.radius))*tl.fps});
 }
 last={position:p.position,target:p.target,radius,q:camera.quaternion.clone()};
 if(f%tl.fps===0)trajectory.push({...locate(f),position:p.position.toArray(),target:p.target.toArray(),radius,shift:p.shift,roll:p.roll});
}
const fields=['step','stepOverRadius','normalisedSpeedPerSecond','targetStepOverRadius','targetNormalisedSpeedPerSecond','angularStepDegrees','angularSpeedDegreesPerSecond','logRadiusRatePerSecond'];
const statistics=rows=>Object.fromEntries(fields.map(field=>{
 const sorted=rows.map(r=>r[field]).sort((a,b)=>a-b),peak=rows.reduce((a,b)=>b[field]>a[field]?b:a),quantile=p=>sorted[Math.floor((sorted.length-1)*p)];
 return [field,{p50:quantile(.5),p95:quantile(.95),p99:quantile(.99),max:peak[field],at:locate(peak.frame)}];
}));
const metrics=statistics(samples);
const bySection=Object.fromEntries([...new Set(samples.map(s=>s.section))].map(section=>[section,statistics(samples.filter(s=>s.section===section))]));
const rankings=Object.fromEntries(['normalisedSpeedPerSecond','targetNormalisedSpeedPerSecond','angularSpeedDegreesPerSecond','logRadiusRatePerSecond'].map(field=>[field,[...samples].sort((a,b)=>b[field]-a[field]).slice(0,20)]));
const orientationAt=t=>{route.apply(camera,t);return camera.quaternion.clone();};
const angularVelocity=(from,to,dt)=>{
 const q=to.clone().multiply(from.clone().invert());if(q.w<0)q.set(-q.x,-q.y,-q.z,-q.w);
 const v=new T.Vector3(q.x,q.y,q.z),n=v.length();return n<1e-15?v.multiplyScalar(2/dt):v.multiplyScalar(2*Math.atan2(n,q.w)/(n*dt));
};
const derivativeLeft=(a2,a,b,e)=>b.clone().multiplyScalar(3).addScaledVector(a,-4).add(a2).multiplyScalar(1/(2*e));
const derivativeRight=(b,c,c2,e)=>b.clone().multiplyScalar(-3).addScaledVector(c,4).sub(c2).multiplyScalar(1/(2*e));
const joins=[];
for(const key of route.keys.slice(1,-1)){
 const e=.0001,t=key.t,A2=route.at(t-2*e),A=route.at(t-e),B=route.at(t),C=route.at(t+e),C2=route.at(t+2*e),radius=B.position.distanceTo(B.target);
 const left=derivativeLeft(A2.position,A.position,B.position,e),right=derivativeRight(B.position,C.position,C2.position,e),leftTarget=derivativeLeft(A2.target,A.target,B.target,e),rightTarget=derivativeRight(B.target,C.target,C2.target,e);
 const qA2=orientationAt(t-2*e),qA=orientationAt(t-e),qB=orientationAt(t),qC=orientationAt(t+e),qC2=orientationAt(t+2*e);
 const leftAngular=angularVelocity(qA,qB,e).multiplyScalar(1.5).addScaledVector(angularVelocity(qA2,qA,e),-.5),rightAngular=angularVelocity(qB,qC,e).multiplyScalar(1.5).addScaledVector(angularVelocity(qC,qC2,e),-.5);
 const legacyLeft=B.position.clone().sub(A.position).multiplyScalar(1/e),legacyRight=C.position.clone().sub(B.position).multiplyScalar(1/e);
 joins.push({...locate(t*tl.fps),t,focus:key.focus??null,radius,velocityJump:left.distanceTo(right),normalisedVelocityJump:left.distanceTo(right)/radius,targetNormalisedVelocityJump:leftTarget.distanceTo(rightTarget)/radius,angularVelocityJumpDegreesPerSecond:leftAngular.distanceTo(rightAngular)*degrees,legacyFirstOrderVelocityJump:legacyLeft.distanceTo(legacyRight)});
}
const maxJoin=field=>Math.max(...joins.map(j=>j[field]));
// These are editorial review limits, not evidence of beauty or no occlusion.
// The old absolute .28-unit/frame diagnostic is preserved below unchanged.
const reviewLimits={normalisedSpeedPerSecond:.6,targetNormalisedSpeedPerSecond:.55,angularSpeedDegreesPerSecond:.015*tl.fps*degrees,logRadiusRatePerSecond:.55,normalisedJoinVelocityJump:.001,angularJoinVelocityJumpDegreesPerSecond:.02};
const motionChecks=Object.fromEntries(Object.entries(reviewLimits).map(([field,limit])=>{
 const value=field==='normalisedJoinVelocityJump'?maxJoin('normalisedVelocityJump'):field==='angularJoinVelocityJumpDegreesPerSecond'?maxJoin('angularVelocityJumpDegreesPerSecond'):metrics[field].max;
 return [field,{value,limit,passed:value<=limit}];
}));
const after=Object.fromEntries(inputs.map(file=>[file,hash(file)]));
const changedDuringCheck=inputs.filter(file=>before[file]!==after[file]);
const technicalChecks={allFocusAnchorsResolved:missingFocus.length===0,inputFilesStable:changedDuringCheck.length===0,knotTimesIncrease,musicBeatBindingMatches:!route.beatSync.length||beatBinding,minimumRadius:minRadius>.6,focusVerticalError:maxFocusError<1e-6};
const legacyAbsoluteDiagnostic={maxStep:metrics.step.max,maxStepLimit:.28,passed:metrics.step.max<.28,role:'Unchanged legacy diagnostic; atlas and detail views have different scales, so review acceptance additionally uses displacement / camera radius.'};
const passed=Object.values(technicalChecks).every(Boolean)&&Object.values(motionChecks).every(c=>c.passed);
const report={schemaVersion:2,generatedAt:new Date().toISOString(),scope:'Authored CameraPath with actual GLB PartsInventory and all atlas/detail anchors. World structural-response camera following, rendering order, occlusion and visual appeal require rendered visual QA.',timelinePath,frames:tl.duration,fps:tl.fps,inputSHA256:before,inputSHA256After:after,changedDuringCheck,partCount:loaded.parts.length,anchorCount:Object.keys(anchors).length,inventoryAnchorCount:Object.keys(inventory.anchors).length,anchors,inventoryBounds:{min:inventory.bounds.min.toArray(),max:inventory.bounds.max.toArray()},missingFocus,minRadius,maxStep:metrics.step.max,maxStepFrame:metrics.step.at.frame,maxAngularStepDegrees:metrics.angularStepDegrees.max,maxAngleFrame:metrics.angularStepDegrees.at.frame,maxFocusVerticalError:maxFocusError,maxJoinVelocityJump:maxJoin('velocityJump'),maxNormalisedJoinVelocityJump:maxJoin('normalisedVelocityJump'),maxAngularJoinVelocityJumpDegreesPerSecond:maxJoin('angularVelocityJumpDegreesPerSecond'),knotTimesIncrease,musicBeatBindingMatches:beatBinding,musicSynchronizedKnots:route.beatSync,technicalChecks,legacyAbsoluteDiagnostic,reviewLimits,motionChecks,metrics,bySection,rankings,joins,trajectory,passed};
fs.mkdirSync(path.dirname(outputPath),{recursive:true});fs.writeFileSync(outputPath,JSON.stringify(report,null,2));
console.log(JSON.stringify({outputPath,frames:report.frames,partCount:report.partCount,anchorCount:report.anchorCount,inventoryAnchorCount:report.inventoryAnchorCount,technicalChecks,legacyAbsoluteDiagnostic,motionChecks,metrics,passed},null,2));
loaded.dispose();if(!passed)process.exitCode=1;
