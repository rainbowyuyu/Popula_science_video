import fs from 'node:fs';
import {build} from 'esbuild';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
const out='research/qa-v19-repair/fish';
await build({stdin:{contents:"export * from './src/FishObserverV19Repair';export * from './src/WorldV10';export * from './src/Timeline';",resolveDir:process.cwd(),loader:'ts'},outfile:out+'/runtime.mjs',bundle:true,format:'esm',platform:'node',packages:'external'});
const {FishObserverV19Repair,WorldV10,timeline,stateAt}=await import(pathToFileURL(process.cwd()+'/'+out+'/runtime.mjs'));
const file='public/assets_v19_repair/characters/rainbow_fish_v19_repair.glb';
const data=fs.readFileSync(file);const gltf=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
const world=new WorldV10(undefined,new T.Scene());
const fish=new FishObserverV19Repair(gltf.scene,gltf.animations).attach(world);
const groups=[world.observer,world.friend,world.sprayObserver],roles=['observer','friend','spray'];
const figures=groups.map(g=>g.children[0]);
let maxEyeError=0,maxGazeError=0,maxVisibleGazeError=0,maxStep=0,maxBoneStep=0,maxLensError=0;
let peakFrame=0,peakGazeFrame=0,minGroundClearance=Infinity;
const previous=[],previousBones=new Map(),samples=[];
function capture(frame){world.update(stateAt(frame));world.group.updateMatrixWorld(true);fish.update(frame);world.group.updateMatrixWorld(true);return JSON.stringify(figures.map(fig=>{const a=[];fig.traverse(o=>a.push(o.name,...o.position.toArray(),...o.quaternion.toArray()));return a;}));}
for(let frame=0;frame<timeline.duration;frame++){
  capture(frame);
  figures.forEach((fig,i)=>{
    const d=fig.userData;maxEyeError=Math.max(maxEyeError,d.eyeAnchorError);
    if(d.gazeErrorDegrees>maxGazeError){maxGazeError=d.gazeErrorDegrees;peakGazeFrame=frame;}
    if(groups[i].visible)maxVisibleGazeError=Math.max(maxVisibleGazeError,d.gazeErrorDegrees);
    if(previous[i]){const step=fig.quaternion.angleTo(previous[i]);if(step>maxStep){maxStep=step;peakFrame=frame;}}
    previous[i]=fig.quaternion.clone();
    fig.traverse(o=>{if(o.isBone){const id=i+'/'+o.name;if(previousBones.has(id))maxBoneStep=Math.max(maxBoneStep,o.quaternion.angleTo(previousBones.get(id)));previousBones.set(id,o.quaternion.clone());}});
    if(frame%300===0){
      groups[i].traverse(m=>{if(!m.isSkinnedMesh||!m.visible)return;m.skeleton.update();
        for(let k=0;k<m.geometry.attributes.position.count;k+=6){const p=groups[i].worldToLocal(m.getVertexPosition(k,new T.Vector3()).applyMatrix4(m.matrixWorld));minGroundClearance=Math.min(minGroundClearance,p.y);}});
      const anchor=new T.Vector3();
      for(const side of ['L','R']){const m=groups[i].getObjectByName('EyeIris'+side);m.skeleton.update();anchor.add(m.getVertexPosition(0,new T.Vector3()).applyMatrix4(m.matrixWorld));}
      anchor.multiplyScalar(.5);const exact=groups[i].localToWorld(new T.Vector3(0,1.55,0));maxLensError=Math.max(maxLensError,anchor.distanceTo(exact));
    }
  });
  if(frame%900===0)samples.push({frame,roles:figures.map((f,i)=>({role:roles[i],...f.userData}))});
}
const poses=new Map();for(const frame of [0,600,5400,5618,7418,7717,8448,9900,10500])poses.set(frame,capture(frame));
const seek=Array.from(poses).reverse().map(([frame,snapshot])=>{capture(1);capture(10699);return {frame,exact:capture(frame)===snapshot};});
world.group.rotation.y=.713;world.group.position.set(2.3,-.6,1.2);world.group.scale.set(1.1,.9,1.05);
capture(5450);const transformed=figures.map(f=>({eye:f.userData.eyeAnchorError,gaze:f.userData.gazeErrorDegrees}));
const catchlights=[];figures[0].traverse(o=>{if(o.isMesh&&/catchlight/i.test(o.name))catchlights.push({name:o.name,color:o.material.color.getHexString(),roughness:o.material.roughness});});
const errors=[];
if(minGroundClearance<.10)errors.push('tail ground clearance');if(maxEyeError>1e-6)errors.push('eye anchor');if(maxLensError>1e-5)errors.push('actual iris midpoint');
if(maxVisibleGazeError>1)errors.push('actual gaze direction');if(maxStep>.055)errors.push('figure step');if(maxBoneStep>.055)errors.push('bone step');
if(!seek.every(x=>x.exact))errors.push('seek');if(transformed.some(x=>x.eye>1e-6||x.gaze>1))errors.push('transformed parent');
if(catchlights.some(x=>x.color==='071518'))errors.push('catchlights black');
for(const side of ['L','R'])if(groups[0].getObjectByName('EyeIris'+side).material.color.getHexString()!=='071518')errors.push('iris material overwritten');
const report={pass:!errors.length,errors,asset:file,assetSHA256:createHash('sha256').update(data).digest('hex'),adapterSHA256:createHash('sha256').update(fs.readFileSync('src/FishObserverV19Repair.ts')).digest('hex'),sampledFrames:timeline.duration,maxEyeError,maxLensError,minGroundClearance,maxGazeError,maxVisibleGazeError,maxStepRadians:maxStep,peakFrame,maxBoneStepRadians:maxBoneStep,peakGazeFrame,seek,transformed,catchlights,samples,scope:'Actual posed eye midpoint and bone-forward vector, all frames, arbitrary seek, camera-independent gaze at actual WorldV10 ray endpoints; physical motion stylized.'};
fs.writeFileSync(out+'/fish-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,samples:undefined},null,2));
fish.dispose();world.dispose();if(errors.length)process.exitCode=1;
