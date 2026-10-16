/** Read-only numerical camera QA; never creates a WebGL context. */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {build} from 'esbuild';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const story=JSON.parse(await fs.readFile(path.join(root,'src/beso-story.json'),'utf8'));
const tmp=path.join(root,'tmp/camera-qa');await fs.mkdir(tmp,{recursive:true});
const bundle=path.join(tmp,'world-for-qa.mjs');
await build({entryPoints:[path.join(root,'src/beso/World.ts')],outfile:bundle,bundle:true,platform:'node',format:'esm',target:'node22',packages:'external',logLevel:'silent'});
const {BesoWorld}=await import(pathToFileURL(bundle).href+'?audit='+Date.now());
const world=Object.create(BesoWorld.prototype);
world.timings=story.scenes;world.fps=story.fps;
const fps=story.fps,frameCount=story.duration;
const state=(frame)=>{const index=Math.max(0,story.scenes.findLastIndex(s=>s.start<=frame)),scene=story.scenes[index];return{id:scene.id,index,local:(frame-scene.start)/fps,progress:Math.max(0,Math.min(1,(frame-scene.start)/scene.duration)),time:frame/fps,duration:scene.duration/fps,sceneStart:scene.start/fps};};
const samples=[];
let previous=null,previousDelta=null,maxPositionStep={value:0,frame:0},maxTargetStep={value:0,frame:0},maxAcceleration={value:0,frame:0};
const failures=[];
for(let f=0;f<frameCount;f++){
  const s=state(f),pose=world.cameraPose(s);
  const values=[...pose.position.toArray(),...pose.target.toArray()];
  if(!values.every(Number.isFinite))failures.push({frame:f,type:'nonfinite_pose'});
  if(pose.position.distanceTo(pose.target)<1)failures.push({frame:f,type:'camera_target_collision'});
  let positionStep=0,targetStep=0,acceleration=0;
  if(previous){
    const delta=pose.position.clone().sub(previous.position);
    positionStep=delta.length();targetStep=pose.target.distanceTo(previous.target);
    acceleration=previousDelta?delta.distanceTo(previousDelta):0;previousDelta=delta;
    if(positionStep>maxPositionStep.value)maxPositionStep={value:positionStep,frame:f};
    if(targetStep>maxTargetStep.value)maxTargetStep={value:targetStep,frame:f};
    if(acceleration>maxAcceleration.value)maxAcceleration={value:acceleration,frame:f};
    // A 20 metre single-frame jump at 60 fps is a robust regression signal for
    // the former copy(prev).lerp(current) self-overwrite bug (~hundreds of m).
    if(positionStep>20||targetStep>20)failures.push({frame:f,scene:s.id,type:'instantaneous_jump',positionStep,targetStep});
  }
  samples.push({frame:f,timeS:f/fps,scene:s.id,localS:s.local,position:pose.position.toArray(),target:pose.target.toArray(),positionStep,targetStep,acceleration});
  previous={position:pose.position.clone(),target:pose.target.clone()};
}
const boundaries=story.scenes.slice(1).map(scene=>{
  const offsets=[-1,0,1,Math.round(2.7*fps)-1,Math.round(2.7*fps),Math.round(2.7*fps)+1];
  return{scene:scene.id,startFrame:scene.start,samples:offsets.map(offset=>samples[scene.start+offset]).filter(Boolean)};
});
const report={schema:'beso-camera-continuity-qa-v1',checked:new Date().toISOString(),mode:'Full frame numerical cameraPose evaluation, no WebGL, no media writes',storySha256:crypto.createHash('sha256').update(await fs.readFile(path.join(root,'src/beso-story.json'))).digest('hex'),worldSha256:crypto.createHash('sha256').update(await fs.readFile(path.join(root,'src/beso/World.ts'))).digest('hex'),fps,frameCount,durationS:frameCount/fps,limits:{maxSingleFramePositionOrTargetStepM:20,note:'Numerical continuity gate catches hard camera jumps; aesthetic speed/occlusion still requires image and video inspection.'},maxPositionStep,maxTargetStep,maxAcceleration,pass:failures.length===0,failures,boundaries};
await fs.writeFile(path.join(root,'research/camera-qa.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass:report.pass,frameCount,maxPositionStep,maxTargetStep,maxAcceleration,failures:failures.length},null,2));
if(!report.pass)process.exitCode=1;
