import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {FishObserverV16} from '../../../src/FishObserverV16';

const dir='public/assets_v16/characters',path=`${dir}/rainbow_fish_v16.glb`;
const bytes=fs.readFileSync(path),sha=createHash('sha256').update(bytes).digest('hex');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const world={observer:new T.Group(),friend:new T.Group(),sprayObserver:new T.Group()};
world.observer.position.set(1.6,18,7);world.friend.position.set(-.2,18,7);world.sprayObserver.position.set(-2.1,0,5);
const parents=Object.values(world),before=parents.map(p=>p.position.toArray());
const adapter=new FishObserverV16(gltf.scene,gltf.animations).attach(world);
const camera=new T.PerspectiveCamera(45,16/9,.01,100);camera.position.set(3.4,20,13);camera.lookAt(0,19.55,7);camera.updateMatrixWorld(true);
const skins=parents.map(g=>{const out:T.SkinnedMesh[]=[];g.traverse(o=>{if((o as T.SkinnedMesh).isSkinnedMesh)out.push(o as T.SkinnedMesh)});return out});
assert.ok(skins.every(a=>a.length>=15),'base skin mesh set is incomplete');
assert.ok(skins.every(a=>a.every(m=>m.skeleton.bones.length===20)),'twenty named bones required');
assert.notEqual(skins[0][0].skeleton,skins[1][0].skeleton);
assert.notEqual(skins[0][0].skeleton.bones[0],skins[1][0].skeleton.bones[0]);
assert.notEqual(skins[0][0].material,skins[1][0].material);
const body=world.observer.getObjectByName('ContinuousPearlBody') as T.SkinnedMesh;
const weights=body.geometry.attributes.skinWeight;let multi=0,maxWeightError=0;
for(let i=0;i<weights.count;i++){
 let sum=0,n=0;for(let j=0;j<4;j++){const w=weights.getComponent(i,j);sum+=w;if(w>1e-5)n++}
 if(n>1)multi++;maxWeightError=Math.max(maxWeightError,Math.abs(sum-1));
}
assert.ok(multi>weights.count*.55);assert.ok(maxWeightError<1e-5);
const poles=['L','R'].map((side,i)=>{
 const mesh=world.observer.getObjectByName(`EyeIris${side}`) as T.SkinnedMesh;
 const p=mesh.geometry.attributes.position,goal=new T.Vector3((i===0?-1:1)*.242,1.572,.6163718298471632);
 let best=Infinity,index=0;for(let j=0;j<p.count;j++){const delta=new T.Vector3().fromBufferAttribute(p,j).distanceTo(goal);if(delta<best){best=delta;index=j}}
 assert.ok(best<1e-6,'actual central eye-patch pole not found');return {name:mesh.name,index};
});
const eyeNormals=poles.map(pole=>{
 const m=world.observer.getObjectByName(pole.name) as T.SkinnedMesh;
 const n=m.geometry.attributes.normal;let z=0,count=0;
 for(let i=0;i<n.count;i++){const v=new T.Vector3().fromBufferAttribute(n,i);if(v.length()>.5){z+=v.z;count++;}}
 const meanZ=z/count;assert.ok(meanZ>.72,'curved black eye normals face into the head');return {name:pole.name,meanNormalZ:meanZ};
});
const roles=['observer','friend','spray'];let maxEyeError=0,maxActualEyeError=0,maxBoneStep=0,minSkinY=Infinity,maxFacing=0;
function auditAnchor(){
 for(let k=0;k<parents.length;k++){
  const g=parents[k];g.updateMatrixWorld(true);const marker=g.getObjectByName(`optical-eye-reference-${roles[k]}`)!;
  const p=g.worldToLocal(marker.getWorldPosition(new T.Vector3()));maxEyeError=Math.max(maxEyeError,p.distanceTo(new T.Vector3(0,1.55,0)));
  const mean=new T.Vector3();for(const pole of poles){const m=g.getObjectByName(pole.name) as T.SkinnedMesh;mean.add(g.worldToLocal(m.getVertexPosition(pole.index,new T.Vector3()).applyMatrix4(m.matrixWorld)))}
  mean.multiplyScalar(.5);maxActualEyeError=Math.max(maxActualEyeError,mean.distanceTo(new T.Vector3(0,1.55,0)));
 }
}
function snapshot(){const out:number[]=[];for(const g of parents)g.traverse(o=>out.push(...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()));return out;}
const sparse=[0,1,30,300,405,450,600,810,1000,4590,6700,6980,7160,7520,9000,10270,10333,10460];
const saved=new Map<number,number[]>();
for(const frame of sparse){adapter.update(frame,camera);auditAnchor();saved.set(frame,snapshot());
 for(let k=0;k<parents.length;k++){
  const g=parents[k],figure=g.children[0];const c=g.worldToLocal(camera.getWorldPosition(new T.Vector3())).sub(new T.Vector3(0,1.55,0));
  const d=figure.userData.heading-Math.atan2(c.x,c.z);maxFacing=Math.max(maxFacing,Math.abs(Math.atan2(Math.sin(d),Math.cos(d))));
  for(const m of skins[k])for(let i=0;i<m.geometry.attributes.position.count;i+=4){
   const p=g.worldToLocal(m.getVertexPosition(i,new T.Vector3()).applyMatrix4(m.matrixWorld));minSkinY=Math.min(minSkinY,p.y);
  }
 }
}
let maxSeekDelta=0;
for(const frame of [...sparse].reverse()){adapter.update(frame,camera);const got=snapshot(),expected=saved.get(frame)!;maxSeekDelta=Math.max(maxSeekDelta,...got.map((x,i)=>Math.abs(x-expected[i])))}
assert.ok(maxSeekDelta<1e-9,'frame seeking accumulates pose state');
const intervals=[[250,640],[4500,4700],[6550,7580],[10200,10600]];let dense=0;
for(const [start,end] of intervals){const prior=new Map<T.Bone,T.Quaternion>();
 for(let frame=start;frame<=end;frame++){adapter.update(frame,camera);auditAnchor();dense++;
  for(const g of parents)g.traverse(o=>{if(!(o as T.Bone).isBone)return;const b=o as T.Bone;if(prior.has(b))maxBoneStep=Math.max(maxBoneStep,prior.get(b)!.angleTo(b.quaternion));prior.set(b,b.quaternion.clone())});
 }
}
assert.ok(maxEyeError<1e-6);assert.ok(maxActualEyeError<1e-6);assert.ok(minSkinY>.45,'ground intersection');assert.ok(maxBoneStep<.055,'bone discontinuity');assert.ok(maxFacing<.70,'camera face exceeds fixed three-quarter bound');
assert.deepEqual(parents.map(g=>g.position.toArray()),before,'world optical anchor moved');
const a=new T.Vector3(),b=new T.Vector3();adapter.update(300);body.getVertexPosition(4500,a);adapter.update(370);body.getVertexPosition(4500,b);
assert.ok(a.distanceTo(b)>.001,'skin does not deform');assert.deepEqual(fs.readFileSync(path),bytes);
const report={version:'V16',pass:true,asset:path,assetSHA256:sha,sourceSHA256:createHash('sha256').update(fs.readFileSync('src/FishObserverV16.ts')).digest('hex'),
 skeletonBones:20,skinMeshesPerClone:skins.map(a=>a.length),bodyVertexCount:weights.count,multiBoneBodyVertices:multi,maxWeightSumError:maxWeightError,eyeSurfaceNormals:eyeNormals,
 maxEyeMarkerError:maxEyeError,maxActualEyeCentreError:maxActualEyeError,eyePoleDefinition:'Exact centre vertex of each surface-conforming black lens, not the maximum-z bound of a curved eye',
 maxSeekDelta,maxOneFrameBoneStepRad:maxBoneStep,denseFrames:dense,denseIntervals:intervals,minimumSampledSkinY:minSkinY,maxCameraThreeQuarterAngleRad:maxFacing,
 bodyVertexDeformation:a.distanceTo(b),independentClones:true,normalization:adapter.normalization,
 limits:'Numeric structural/rig/anchor audit. Sampled skin clearance is not exhaustive collision detection. Visual quality requires actual preview and final-film review. No normal-speed preview playback or audio review is claimed.'};
fs.writeFileSync(`${dir}/rig-audit-v16.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));adapter.dispose();
