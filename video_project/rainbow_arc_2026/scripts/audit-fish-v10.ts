import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import * as T from 'three';import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {FishObserverV10} from '../src/FishObserverV10';
import {timeline} from '../src/Timeline';
const assetPath='public/assets_v10/characters/rainbow_fish.glb',bytes=fs.readFileSync(assetPath);
const sha256=createHash('sha256').update(bytes).digest('hex');
const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
gltf.scene.updateMatrixWorld(true);
const poles=['L','R'].map(side=>{const mesh=gltf.scene.getObjectByName(`EyeIris${side}`) as T.SkinnedMesh;
  let front=-Infinity,index=0;const p=new T.Vector3();
  for(let i=0;i<mesh.geometry.attributes.position.count;i++){
    mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);gltf.scene.worldToLocal(p);
    if(p.z>front){front=p.z;index=i;}
  }return {name:mesh.name,index};});
const world={observer:new T.Group(),friend:new T.Group(),sprayObserver:new T.Group()};
world.observer.position.set(1.6,18,7);world.friend.position.set(-.2,18,7);world.sprayObserver.position.set(-2.1,0,5);
const before=Object.values(world).map(o=>o.position.toArray());
const adapter=new FishObserverV10(gltf.scene,gltf.animations).attach(world);
const groups=Object.values(world),roles=['observer','friend','spray'];
function errors(group:T.Group,role:string){
  group.updateMatrixWorld(true);const anchor=group.getObjectByName(`optical-eye-reference-${role}`)!;
  const eye=group.worldToLocal(anchor.getWorldPosition(new T.Vector3()));
  const actual=new T.Vector3();for(const pole of poles){const m=group.getObjectByName(pole.name) as T.SkinnedMesh;
    const point=m.getVertexPosition(pole.index,new T.Vector3()).applyMatrix4(m.matrixWorld);actual.add(group.worldToLocal(point));}
  actual.multiplyScalar(.5);
  const hover=group.getObjectByName(`hover-datum-${role}`)!;
  const datum=group.worldToLocal(hover.getWorldPosition(new T.Vector3()));
  return {marker:eye.distanceTo(new T.Vector3(0,1.55,0)),actual:actual.distanceTo(new T.Vector3(0,1.55,0)),
    hover:Math.abs(datum.y-.85)};
}
function snapshot(){const out:number[]=[];for(const g of groups)g.traverse(o=>{out.push(...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray());});return out;}
const skins=groups.map(g=>{const meshes:T.SkinnedMesh[]=[];g.traverse(o=>{if((o as T.SkinnedMesh).isSkinnedMesh)meshes.push(o as T.SkinnedMesh);});return meshes;});
assert.ok(skins.every(a=>a.length===18),'weighted skinned fish meshes missing');
assert.ok(skins.every(a=>a.every(m=>m.skeleton.bones.length===19)),'complete skeleton missing');
assert.notEqual(skins[0][0].skeleton,skins[1][0].skeleton,'clone skeletons shared');
assert.notEqual(skins[0][0].skeleton.bones[0],skins[1][0].skeleton.bones[0],'clone bones shared');
assert.notEqual(skins[0][0].material,skins[1][0].material,'clone materials shared');
const body=world.observer.getObjectByName('ContinuousPearlBody') as T.SkinnedMesh;
const weights=body.geometry.attributes.skinWeight;let multi=0,maxWeightSumError=0;
for(let i=0;i<weights.count;i++){let n=0,sum=0;for(let k=0;k<4;k++){const w=weights.getComponent(i,k);sum+=w;if(w>1e-5)n++;}
  if(n>=2)multi++;maxWeightSumError=Math.max(maxWeightSumError,Math.abs(sum-1));}
assert.ok(multi>weights.count*.6,'body is rigid one-bone mesh instead of continuous weighted skin');
assert.ok(maxWeightSumError<1e-5,'skin weights not normalized');
const frames=[0,1,30,258,300,370,405,450,600,4589,4590,6630,6700,6815,6920,6980,7050,7160,7460,7520,8960,9100,9612];
const snapshots=new Map<number,number[]>(),results=[];let maxEyeError=0,maxActualLensError=0,maxHoverError=0;
for(const frame of frames){adapter.update(frame);snapshots.set(frame,snapshot());
  const e=groups.map((g,i)=>errors(g,roles[i]));maxEyeError=Math.max(maxEyeError,...e.map(x=>x.marker));
  maxActualLensError=Math.max(maxActualLensError,...e.map(x=>x.actual));maxHoverError=Math.max(maxHoverError,...e.map(x=>x.hover));
  results.push({frame,errors:e,swimWeights:groups.map(g=>g.children[0].userData.swimWeight),headings:groups.map(g=>g.children[0].userData.heading)});
}
let maxSeekDelta=0;
for(const frame of [...frames].reverse()){adapter.update(frame);const p=snapshot(),r=snapshots.get(frame)!;
  const d=Math.max(...p.map((v,i)=>Math.abs(v-r[i])));maxSeekDelta=Math.max(maxSeekDelta,d);assert.ok(d<1e-9,'reverse seek pose changed');}
const walking=timeline.clips.find(c=>c.id==='r002')!,observerScene=timeline.scenes.find(s=>s.id==='observer')!;
const friendClip=timeline.clips.find(c=>c.id==='r031')!,returnScene=timeline.scenes.find(s=>s.id==='return')!;
const intervals=[[walking.start-25,walking.end+40],[observerScene.start-40,observerScene.end+160],
  [friendClip.start-450,friendClip.start+180],[returnScene.start,Math.min(timeline.duration-1,returnScene.end+30)]];
const denseFrameSet=new Set<number>();for(const [first,last] of intervals)for(let f=Math.max(0,first);f<=Math.min(timeline.duration-1,last);f++)denseFrameSet.add(f);
const sortedDense=[...denseFrameSet].sort((a,b)=>a-b);
let denseFrames=0,maxOneFrameBoneAngle=0,minimumActualSkinY=Infinity,clearanceSampleFrames=0;const prior=new Map<string,T.Quaternion>();
let previousFrame=-2;
for(const frame of sortedDense){
  if(frame!==previousFrame+1)prior.clear();previousFrame=frame;
    adapter.update(frame);const e=groups.map((g,i)=>errors(g,roles[i]));
    maxEyeError=Math.max(maxEyeError,...e.map(x=>x.marker));maxActualLensError=Math.max(maxActualLensError,...e.map(x=>x.actual));
    maxHoverError=Math.max(maxHoverError,...e.map(x=>x.hover));denseFrames++;
    if(frame%30===0){clearanceSampleFrames++;for(let role=0;role<groups.length;role++){
      const inverse=groups[role].matrixWorld.clone().invert(),p=new T.Vector3();
      for(const mesh of skins[role]){const transform=inverse.clone().multiply(mesh.matrixWorld);
        for(let i=0;i<mesh.geometry.attributes.position.count;i++){
          mesh.getVertexPosition(i,p).applyMatrix4(transform);minimumActualSkinY=Math.min(minimumActualSkinY,p.y);
        }
      }
    }}
    for(let i=0;i<groups.length;i++)groups[i].traverse(o=>{if(!(o as T.Bone).isBone)return;const k=`${i}/${o.name}`;
      if(prior.has(k))maxOneFrameBoneAngle=Math.max(maxOneFrameBoneAngle,prior.get(k)!.angleTo(o.quaternion));
      prior.set(k,o.quaternion.clone());});
}
assert.ok(maxEyeError<1e-6,'optical marker no longer at actual observer eye');
assert.ok(maxActualLensError<1e-6,'ray anchor enters cheek instead of actual iris midpoint');
assert.ok(maxHoverError<1e-6,'hover datum moved');
assert.ok(minimumActualSkinY>.50,'fish skin penetrates its parent ground plane');
assert.ok(maxOneFrameBoneAngle<.055,'one-frame skeletal snap exceeds 3.2 degrees');
assert.deepEqual(groups.map(g=>g.position.toArray()),before,'world translation changed');
// Verify body skin genuinely deforms while head remains optically anchored.
const sampleBody=500,pointA=new T.Vector3(),pointB=new T.Vector3();
adapter.update(300);body.getVertexPosition(sampleBody,pointA);
adapter.update(370);body.getVertexPosition(sampleBody,pointB);
const deformDistance=pointA.distanceTo(pointB);assert.ok(deformDistance>.003,'body skin did not deform');
assert.deepEqual(fs.readFileSync(assetPath),bytes,'authored GLB changed during audit');
const report={pass:true,sha256,assetPath,normalization:adapter.normalization,clones:3,bonesPerSkeleton:19,
 skinnedMeshesPerClone:skins.map(a=>a.length),bodyVertices:weights.count,multiBoneBodyVertices:multi,maxWeightSumError,
 denseFrames,denseIntervalsFromTimeline:intervals,timelineSHA256:createHash('sha256').update(fs.readFileSync('src/timeline.json')).digest('hex'),
 maxEyeError,maxActualLensError,maxHoverError,minimumActualSkinY,clearanceSampleFrames,maxSeekDelta,maxOneFrameBoneAngleRad:maxOneFrameBoneAngle,
 actualBodyDeformationM:deformDistance,reverseSeekFrames:frames.length,results,
 limitation:'Numeric rig audit; visual beauty/occlusion checked separately in standalone preview; not a fish biomechanics simulation'};
fs.mkdirSync('research/qa',{recursive:true});fs.writeFileSync('research/qa/fish-v10.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,results:undefined},null,2));adapter.dispose();
