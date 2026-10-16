import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import ts from 'typescript';
import * as THREE from 'three';
const root=process.cwd();
const source=fs.readFileSync(path.join(root,'src/CameraPathV06.ts'),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,strict:true}});
const scratch=path.join(root,'work/camera-audit');
fs.mkdirSync(scratch,{recursive:true});
const moduleFile=path.join(scratch,'CameraPathV06.cjs');
fs.writeFileSync(moduleFile,compiled.outputText);
const {sampleCameraV06,applyCameraV06,compileCameraKeysV06,defaultScenesV06}=createRequire(import.meta.url)(moduleFile);
const vec=x=>new THREE.Vector3(...x);
const fps=30;
const options={fps};
const end=Math.max(...defaultScenesV06.map(s=>s.end));
let minForward=1,minDistance=Infinity,maxTranslation=0,maxAngular=0,maxFovRate=0;
let last=null;
for(let frame=0;frame<=end;frame++){
 const s=sampleCameraV06(frame,options);
 assert([...s.position,...s.target,s.fov,...s.quaternion.toArray()].every(Number.isFinite),`Nonfinite at ${frame}`);
 const desired=vec(s.target).sub(vec(s.position));
 minDistance=Math.min(minDistance,desired.length());
 const forward=vec([0,0,-1]).applyQuaternion(s.quaternion).normalize();
 const dot=forward.dot(desired.normalize());
 minForward=Math.min(minForward,dot);
 assert(dot>.999999,`Camera looks away at ${frame}: ${dot}`);
 assert(s.fov>=24&&s.fov<=75,`FOV outside allowed range at ${frame}`);
 if(last){maxTranslation=Math.max(maxTranslation,vec(s.position).distanceTo(vec(last.position))*fps);maxAngular=Math.max(maxAngular,THREE.MathUtils.radToDeg(s.quaternion.angleTo(last.quaternion))*fps);maxFovRate=Math.max(maxFovRate,Math.abs(s.fov-last.fov)*fps);}
 last=s;
}
// Random-access determinism without prior camera state.
for(const frame of [end-1,3,Math.floor(end*.66),0,120,end]){
 const a=sampleCameraV06(frame,options);sampleCameraV06(end-frame,options);const b=sampleCameraV06(frame,options);
 assert.deepEqual({...a,quaternion:a.quaternion.toArray()},{...b,quaternion:b.quaternion.toArray()});
}
// Direct keys permit safe root-designed routes around structures.
const custom={fps,scenes:[{id:'drop',start:0,end:120}],keyframes:[{frame:0,position:[0,1,8],target:[0,1,0],fov:40},{frame:60,position:[2,1.4,7],target:[0,1,0],fov:42},{frame:120,position:[3,2,6],target:[0,1,0],fov:41}]};
const camera=new THREE.PerspectiveCamera();
for(let frame=0;frame<=120;frame++){
 const s=applyCameraV06(camera,frame,custom);
 const actual=camera.getWorldDirection(new THREE.Vector3());
 assert(actual.dot(vec(s.target).sub(camera.position).normalize())>.999999);
 camera.updateMatrixWorld();
 const projected=vec(s.target).project(camera);
 assert(Math.abs(projected.x)<1e-6&&Math.abs(projected.y)<1e-6,`Target not centered at ${frame}`);
}
const keys=compileCameraKeysV06(options);
const epsilon=.001;
let maxVelocityJump=0,maxAccelerationJump=0;
const pos=f=>vec(sampleCameraV06(f,options).position);
for(const key of keys.slice(1,-1)){
 const f=key.frame;
 const a=pos(f-2*epsilon),b=pos(f-epsilon),c=pos(f),d=pos(f+epsilon),e=pos(f+2*epsilon);
 const leftVelocity=c.clone().sub(b).divideScalar(epsilon),rightVelocity=d.clone().sub(c).divideScalar(epsilon);
 const leftAcceleration=c.clone().add(a).addScaledVector(b,-2).divideScalar(epsilon*epsilon);
 const rightAcceleration=e.clone().add(c).addScaledVector(d,-2).divideScalar(epsilon*epsilon);
 maxVelocityJump=Math.max(maxVelocityJump,leftVelocity.distanceTo(rightVelocity));
 maxAccelerationJump=Math.max(maxAccelerationJump,leftAcceleration.distanceTo(rightAcceleration));
}
assert(maxVelocityJump<1e-4,`Velocity discontinuity ${maxVelocityJump}`);
assert(maxAccelerationJump<.01,`Acceleration discontinuity ${maxAccelerationJump}`);
const report={passed:true,frames:end+1,keys:keys.length,minForwardDot:minForward,minTargetDistance:minDistance,maxTranslationMps:maxTranslation,maxAngularDegreesPerSecond:maxAngular,maxFovDegreesPerSecond:maxFovRate,maxVelocityJumpWorldUnitsPerFrame:maxVelocityJump,maxAccelerationJumpWorldUnitsPerFrame2:maxAccelerationJump,scope:'Numerical camera-direction and continuity checks only; visual framing requires rendered review.'};
fs.mkdirSync(path.join(root,'research/qa'),{recursive:true});
fs.writeFileSync(path.join(root,'research/qa/camera-v06-numerical.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
