import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {AnimatedObserverV09} from '../src/AnimatedObserverV09';
const bytes=fs.readFileSync('public/assets_v09/characters/robot_expressive/RobotExpressive-original.glb');
assert.equal(createHash('sha256').update(bytes).digest('hex'),'047f5e5fb3bb6d378bd1df16ca6137f2a596c99b3a1b5690b4020c05aaf6f319','verified upstream original changed');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
const world={observer:new T.Group(),friend:new T.Group(),sprayObserver:new T.Group()};
world.observer.position.set(1.6,18,7);world.friend.position.set(-.2,18,7);world.sprayObserver.position.set(-2.1,0,5);
const before=Object.values(world).map(o=>o.position.toArray());const adapter=new AnimatedObserverV09(gltf.scene,gltf.animations).attach(world);
const frames=[0,258,300,370,400,450,600,4590,5670,6630,6700,6790,6815,6920,6980,7010,7050,7160,7460,7520,8960,9100];
const snapshots=new Map<number,number[]>(),results=[];
const sourceHash=fs.readFileSync('public/assets_v09/characters/robot_expressive/RobotExpressive-original.glb');
function snapshot(){const values:number[]=[];for(const group of Object.values(world))group.traverse(o=>{values.push(...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray());const mesh=o as T.Mesh;if(mesh.morphTargetInfluences)values.push(...mesh.morphTargetInfluences);});return values;}
function eyeError(group:T.Group){const anchor=group.getObjectByName(`optical-lens-reference-${group===world.observer?'observer':group===world.friend?'friend':'spray'}`)!;
  group.updateMatrixWorld(true);const eye=group.worldToLocal(anchor.getWorldPosition(new T.Vector3()));return eye.distanceTo(new T.Vector3(0,1.55,0));}
function footError(group:T.Group){group.updateMatrixWorld(true);const inv=group.matrixWorld.clone().invert(),p=new T.Vector3();let min=Infinity;
  group.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh||!/^Foot[LR]_/.test(o.name))return;const transform=inv.clone().multiply(o.matrixWorld);
    for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,p);min=Math.min(min,p.applyMatrix4(transform).y);}});return Math.abs(min);}
for(const frame of frames){adapter.update(frame);snapshots.set(frame,snapshot());const eyes=Object.values(world).map(eyeError),feet=Object.values(world).map(footError);
  assert.ok(Math.max(...eyes)<1e-6,`optical eye error at ${frame}: ${eyes}`);assert.ok(Math.max(...feet)<1e-6,`floor error at ${frame}: ${feet}`);
  assert.deepEqual(Object.values(world).map(o=>o.position.toArray()),before,'parent world translations changed');
  results.push({frame,eyeErrorM:eyes,footErrorM:feet,gaitWeights:Object.values(world).map(o=>o.children[0].userData.gaitWeight),headings:Object.values(world).map(o=>o.children[0].userData.heading)});}
assert.ok(results.find(r=>r.frame===6980)!.gaitWeights[1]>.1,'friend is not walking during its independent entrance');
for(const frame of [7050,7160]){const r=results.find(r=>r.frame===frame)!;
  assert.equal(r.gaitWeights[1],0,`friend gait did not settle at ${frame}`);assert.equal(r.headings[1],Math.PI,`friend is not facing the rainbow at ${frame}`);}
let maxSeekDelta=0;
for(const frame of [...frames].reverse()){adapter.update(frame);const pose=snapshot(),reference=snapshots.get(frame)!;
  const delta=Math.max(...pose.map((v,i)=>Math.abs(v-reference[i])));maxSeekDelta=Math.max(maxSeekDelta,delta);assert.ok(delta<1e-9,`non-sequential pose changed at ${frame}; max delta ${delta}`);}
const hands=Object.values(world).map(g=>{const meshes:T.SkinnedMesh[]=[];g.traverse(o=>{if((o as T.SkinnedMesh).isSkinnedMesh)meshes.push(o as T.SkinnedMesh);});return meshes;});
assert.ok(hands.every(a=>a.length===4),'actual skinned hands not present');
assert.notEqual(hands[0][0].skeleton,hands[1][0].skeleton,'skeletons are shared');assert.notEqual(hands[0][0].skeleton.bones[0],hands[1][0].skeleton.bones[0],'bones are shared');
assert.notEqual(hands[0][0].material,hands[1][0].material,'materials are shared');
assert.deepEqual(fs.readFileSync('public/assets_v09/characters/robot_expressive/RobotExpressive-original.glb'),sourceHash,'original GLB changed');
let denseFrames=0,maximumEyeErrorM=0,maximumFootErrorM=0;
for(const [first,last] of [[240,470],[6580,7600],[8890,9290]])for(let frame=first;frame<=last;frame++){
  adapter.update(frame);const eyes=Object.values(world).map(eyeError),feet=Object.values(world).map(footError);
  maximumEyeErrorM=Math.max(maximumEyeErrorM,...eyes);maximumFootErrorM=Math.max(maximumFootErrorM,...feet);denseFrames++;
}
assert.ok(maximumEyeErrorM<1e-6&&maximumFootErrorM<1e-6,'dense locomotion alignment failed');
fs.mkdirSync('research/qa',{recursive:true});const report={pass:true,asset:'RobotExpressive CC0',normalization:adapter.normalization,
  deterministicSeeking:`${frames.length} forward/reverse sampled frames; tolerance 1e-9`,maxSeekDelta,denseFrames,maximumEyeErrorM,maximumFootErrorM,
  clones:3,skinnedMeshesPerClone:hands.map(a=>a.length),results};
fs.writeFileSync('research/qa/observer-v09.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:true,denseFrames,maximumEyeErrorM,maximumFootErrorM,maxSeekDelta,clones:3}));adapter.dispose();
