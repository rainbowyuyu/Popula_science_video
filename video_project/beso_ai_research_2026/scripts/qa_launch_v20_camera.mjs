import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const storyPath=path.join(root,'src/launch-v20-story.json'),directionPath=path.join(root,'src/launch-v20-direction.ts');
for(const file of [storyPath,directionPath])if(!fs.existsSync(file))throw Error('v20 camera QA waits for '+path.relative(root,file));
const result=await build({stdin:{contents:"export * from './src/launch-v20-direction';export * from './src/beso/LaunchV18Camera';",resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const m=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const story=JSON.parse(fs.readFileSync(storyPath,'utf8'));
if(story.fps!==60||story.duration<6000||story.duration>6600||m.fps!==60||m.durationInFrames!==story.duration)throw Error('v20 camera and story metadata disagree');
if(!Array.isArray(m.timeKeys)||m.timeKeys.length!==story.scenes.length+1)throw Error('Every scene needs an explicit monotonic camera anchor');
const seconds=story.duration/story.fps;
const anchorOrder=m.timeKeys.every((k,i)=>Number.isFinite(k.x)&&Number.isFinite(k.y)&&(i===0||(k.x>m.timeKeys[i-1].x&&k.y>=m.timeKeys[i-1].y)));
const endpointRange=Math.abs(m.worldTime(0))<1e-8&&Math.abs(m.worldTime(seconds)-105)<1e-8;
let previous=null,maxPositionStep=0,maxTargetStep=0,maxFovStep=0,minTargetDistance=Infinity,monotone=true,finite=true;
const frameTravel=[];
for(let frame=0;frame<=story.duration;frame++){
 const t=frame/story.fps,w=m.worldTime(t),c=m.sampleV18Camera(w),cover=m.sheetCover(w);
 finite&&=[w,...c.position.toArray(),...c.target.toArray(),c.fov,c.viewOffsetX,cover].every(Number.isFinite);
 minTargetDistance=Math.min(minTargetDistance,c.position.distanceTo(c.target));
 if(previous){
  monotone&&=w>=previous.w-1e-10;
  const positionStep=c.position.distanceTo(previous.p),targetStep=c.target.distanceTo(previous.q),fovStep=Math.abs(c.fov-previous.fov);
  maxPositionStep=Math.max(maxPositionStep,positionStep);maxTargetStep=Math.max(maxTargetStep,targetStep);maxFovStep=Math.max(maxFovStep,fovStep);
  frameTravel.push({frame,seconds:t,worldTime:w,positionStep,targetStep,sheetCover:cover});
 }
 previous={w,p:c.position,q:c.target,fov:c.fov};
}
const boundaryAt=(id,t)=>{
 const h=1e-5,a=m.worldTime(t-h),b=m.worldTime(t),c=m.worldTime(t+h),ca=m.sampleV18Camera(a),cb=m.sampleV18Camera(b),cc=m.sampleV18Camera(c);
 const dpBefore=cb.position.clone().sub(ca.position).multiplyScalar(1/h),dpAfter=cc.position.clone().sub(cb.position).multiplyScalar(1/h);
 const dqBefore=cb.target.clone().sub(ca.target).multiplyScalar(1/h),dqAfter=cc.target.clone().sub(cb.target).multiplyScalar(1/h);
 return{id,time:t,worldTime:b,worldTimeVelocityBefore:(b-a)/h,worldTimeVelocityAfter:(c-b)/h,timeVelocityDifference:Math.abs((b-a)/h-(c-b)/h),positionDerivativeDifference:dpBefore.distanceTo(dpAfter),targetDerivativeDifference:dqBefore.distanceTo(dqAfter),fovDerivativeDifference:Math.abs((cb.fov-ca.fov)/h-(cc.fov-cb.fov)/h)};
};
const boundaries=story.scenes.slice(1).map(s=>boundaryAt(s.id,s.start/story.fps));
// Also test actual native route-key crossings, which can fall inside a narration scene.
const nativeCrossings=m.V18_CAMERA_KEYS.slice(1,-1).map(key=>{
 let a=0,b=seconds;for(let i=0;i<50;i++){const mid=(a+b)/2;if(m.worldTime(mid)<key.t)a=mid;else b=mid;}
 return boundaryAt('native-'+key.t,(a+b)/2);
});
const derivatives=[...boundaries,...nativeCrossings];
const passed=finite&&monotone&&anchorOrder&&endpointRange&&minTargetDistance>5&&derivatives.every(b=>b.timeVelocityDifference<.002&&b.positionDerivativeDifference<.1&&b.targetDerivativeDifference<.1&&b.fovDerivativeDifference<.02);
const hash=f=>crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const report={schema:'launch-v20-camera-continuity-v1',frames:story.duration,samples:story.duration+1,seconds,sceneCount:story.scenes.length,storySHA256:hash(storyPath),directionSHA256:hash(directionPath),nativeCameraSHA256:hash(path.join(root,'src/beso/LaunchV18Camera.ts')),finite,monotone,anchorOrder,endpointRange,minTargetDistance,maxFrameStep:maxPositionStep,maxTargetFrameStep:maxTargetStep,maxFovFrameStep:maxFovStep,boundaries,nativeCrossings,largestFrameTravel:frameTravel.sort((a,b)=>b.positionStep-a.positionStep).slice(0,10),passed,limitation:'Numerical finite/monotone/C1 checks only. Fast spatial travel is intentional between ocean and studio. Actual sheet coverage, model occlusion, typography, visual continuity and aesthetics still require rendered frames.'};
fs.mkdirSync(path.join(root,'research/qa'),{recursive:true});fs.writeFileSync(path.join(root,'research/qa/v20-camera-continuity.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed,frames:report.frames,sceneCount:report.sceneCount,finite,monotone,minTargetDistance,maxFrameStep:maxPositionStep,worstTimeDerivativeDifference:Math.max(...derivatives.map(x=>x.timeVelocityDifference)),worstPositionDerivativeDifference:Math.max(...derivatives.map(x=>x.positionDerivativeDifference)),worstTargetDerivativeDifference:Math.max(...derivatives.map(x=>x.targetDerivativeDifference))},null,2));if(!passed)process.exitCode=1;
