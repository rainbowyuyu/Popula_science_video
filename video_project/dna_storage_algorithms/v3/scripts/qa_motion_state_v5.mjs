/** CPU state audit: does not create Chrome, WebGL, or render pixels. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url);
const previousHook=require.extensions['.ts'];
require.extensions['.ts']=(module,filename)=>{
 const source=fs.readFileSync(filename,'utf8');
 module._compile(ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText,filename);
};
// Canvas is a no-op geometry-construction dependency, not a font/raster test.
globalThis.document={createElement(tag){if(tag!=='canvas')throw new Error('Unexpected element '+tag);
 const context={measureText:text=>({width:[...text].length*96}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),fillRect(){},fillText(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){}};
 return {width:300,height:150,getContext:()=>context};
}};
const {makeStations}=require(path.join(root,'src/scene/StationsV5.ts'));
const {sampleCamera,STATIONS}=require(path.join(root,'src/CameraPathV5.ts'));
const {DataHandoffV5}=require(path.join(root,'src/scene/DataHandoffV5.ts'));
const modules=makeStations(),failures=[],jumps=[],seekChecks=[],moduleStats=[];
const camera=new THREE.PerspectiveCamera(40,16/9,.05,250),point=new THREE.Vector3();
const snapshot=(objects)=>objects.map(o=>[...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),Number(o.visible),...Object.entries(o.material?.uniforms??{}).sort().flatMap(([_,u])=>typeof u.value==='number'?[u.value]:[])]);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const project=(position,t)=>{const c=sampleCamera(t);camera.fov=c.fov;camera.position.set(...c.position);camera.lookAt(...c.target);camera.rotateZ(THREE.MathUtils.degToRad(c.rollDeg));camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return point.copy(position).project(camera).clone();};
for(let stationIndex=0;stationIndex<modules.length;stationIndex++){
 const module=modules[stationIndex],station=STATIONS[stationIndex];module.position.set(...station.origin);
 const objects=[];module.traverse(o=>objects.push(o));
 const names=new Map(objects.map((o,i)=>[o,`${station.id}/object-${i}/${o.type}`]));
 for(const[key,value]of Object.entries(module)){
  if(Array.isArray(value))value.forEach((o,i)=>{if(o?.isObject3D&&names.has(o))names.set(o,`${station.id}/${key}[${i}]`);});
  else if(value?.isObject3D&&names.has(value))names.set(value,`${station.id}/${key}`);
 }
 let previous=null,previousWorld=null,maxDisplacement=0,frameCount=0,visibilityToggles=0;
 const stationJumps=new Map();
 for(let frame=Math.max(0,Math.round((station.start-3)*30));frame<=Math.min(8999,Math.round((station.end+3)*30));frame++){
  const t=frame/30,local=Math.max(0,t-station.start);module.update(local);module.updateMatrixWorld(true);const state=snapshot(objects);
  const world=objects.map(o=>o.getWorldPosition(new THREE.Vector3()));
  for(let i=0;i<objects.length;i++){
   if(state[i].some(n=>!Number.isFinite(n)))failures.push({kind:'nonfinite',object:names.get(objects[i]),frame});
   if(previous){
    const delta=world[i].distanceTo(previousWorld[i]);maxDisplacement=Math.max(maxDisplacement,delta);
    if(state[i][10]!==previous[i][10])visibilityToggles++;
    if(delta>.5){
     const p=project(world[i],t),before=project(previousWorld[i],Math.max(0,t-1/30));
     const inView=q=>q.z>=-1&&q.z<=1&&Math.abs(q.x)<.98&&Math.abs(q.y)<.9;
     if(inView(p)||inView(before)){
      const name=names.get(objects[i]),entry={object:name,frame,timeSec:t,worldDisplacement:delta,screenBefore:before.toArray(),screenAfter:p.toArray(),count:1,scope:'Object center projected in frame before or after jump; no occlusion/raster visibility assertion.'};
      const existing=stationJumps.get(name);
      if(existing){existing.count++;if(delta>existing.worldDisplacement)Object.assign(existing,{...entry,count:existing.count});}
      else stationJumps.set(name,entry);
     }
    }
   }
  }
  previous=state;previousWorld=world;frameCount++;
 }
 const positions=[0,.1,.31,.68,.92,1].map(q=>q*(station.end-station.start));
 for(const local of positions){module.update(local);const expected=hash(snapshot(objects));module.update(Math.max(0,station.end-station.start-local));module.update(local);const actual=hash(snapshot(objects));seekChecks.push({station:station.id,timeSec:local,pass:expected===actual});if(expected!==actual)failures.push({kind:'stateful-update',station:station.id,timeSec:local});}
 jumps.push(...stationJumps.values());moduleStats.push({station:station.id,objects:objects.length,framesSampled:frameCount,maxFrameWorldDisplacement:maxDisplacement,visibilityToggles,projectedJumpObjectCount:stationJumps.size});
}
// Evaluate the single carrier used between stations from the authored formula.
let courierMaxStep=0,previousCourier=null;
for(let frame=0;frame<9000;frame++){
 const t=frame/30,c=sampleCamera(t),p=new THREE.Vector3(c.target[0]+.6,Math.sin(t*.4)*.06-2.43,2);
 if(previousCourier)courierMaxStep=Math.max(courierMaxStep,p.distanceTo(previousCourier));previousCourier=p;
}
const totalJumps=jumps.length;
const handoffs=[];
for(let i=0;i<STATIONS.length-1;i++){
 const boundary=STATIONS[i].end,model=new DataHandoffV5(boundary,STATIONS[i].origin[0]);
 let previous=null,maxStep=0;const objects=[];model.traverse(o=>objects.push(o));
 for(let frame=Math.round((boundary-3)*30);frame<=Math.round((boundary+3)*30);frame++){
  model.update(frame/30);model.updateMatrixWorld(true);const positions=objects.map(o=>o.getWorldPosition(new THREE.Vector3()));
  if(previous)positions.forEach((p,j)=>{maxStep=Math.max(maxStep,p.distanceTo(previous[j]));});
  previous=positions;
 }
 model.update(boundary);const expected=hash(snapshot(objects));model.update(boundary+3);model.update(boundary);const deterministic=expected===hash(snapshot(objects));
 if(maxStep>.5||!deterministic)failures.push({kind:'handoff-motion',boundary,maxStep,deterministic});
 handoffs.push({boundary,maxFrameWorldDisplacement:maxStep,deterministic});
}
const report={status:failures.length?'FAIL':totalJumps?'NUMERIC_DETERMINISM_PASS_WITH_PROJECTED_MOTION_JUMPS':'PASS',checkedAt:new Date().toISOString(),sourceSha256:hash(fs.readFileSync(path.join(root,'src/scene/StationsV5.ts'),'utf8')),method:'Run real StationsV5.update functions in Node with no-op Canvas solely for constructors; compare transforms at30fps across all scene windows plus3s margins. Project centers using actual V5 camera including roll. Imported GLB replacement assets, final raster/occlusion, font shapes and shader vertex displacement are not evaluated.',moduleStats,seekChecks,courier:{testedFrames:9000,maxFrameWorldDisplacement:courierMaxStep,note:'Continuous gold guide is a world navigation anchor; this does not prove the same molecular parcel is semantically tracked through every algorithm.'},projectedJumps:jumps.sort((a,b)=>b.worldDisplacement-a.worldDisplacement),failures,limits:['Deterministic does not mean continuous: modulo loops can teleport on exactly reproducible frames.','Center projection does not prove visible pixels; inspect representative transition clips.','No GLB asset replacement geometry or real WebGL render was instantiated by this lightweight test.']};
report.handoffs=handoffs;
fs.writeFileSync(path.join(root,'research/motion-state-qa-v5.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,modules:moduleStats,courier:report.courier,failures,topJumps:report.projectedJumps.slice(0,12)},null,2));
require.extensions['.ts']=previousHook;delete globalThis.document;
if(failures.length||totalJumps)process.exitCode=1;

