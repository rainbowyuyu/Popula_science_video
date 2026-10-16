/** CPU only: catch authored offscreen animations intruding into other stations. */
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(import.meta.url),previousHook=require.extensions['.ts'];
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText,filename);
globalThis.document={createElement(tag){if(tag!=='canvas')throw new Error('Unexpected element '+tag);const context={measureText:text=>({width:[...text].length*96}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}}),fillRect(){},fillText(){},beginPath(){},arc(){},fill(){},moveTo(){},lineTo(){},stroke(){}};return {width:300,height:150,getContext:()=>context};}};
const {makeStations}=require(path.join(root,'src/scene/StationsV6.ts'));
const {sampleCamera,STATIONS}=require(path.join(root,'src/CameraPathV6.ts'));
const modules=makeStations();
const camera=new THREE.PerspectiveCamera(40,16/9,.05,250);
const point=new THREE.Vector3(),local=new THREE.Vector3();
const intrusions=new Map();
let samples=0,centersChecked=0;
for(let frame=0;frame<9000;frame+=15){
 const t=frame/30,pose=sampleCamera(t),current=STATIONS[pose.stationIndex];
 // Adjacent stations share the frame intentionally during the 6 s handoff.
 if(t<current.start+4||t>current.end-4)continue;
 camera.fov=pose.fov;camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.rotateZ(THREE.MathUtils.degToRad(pose.rollDeg));camera.updateProjectionMatrix();camera.updateMatrixWorld(true);samples++;
 modules.forEach((module,i)=>{
  module.position.set(...STATIONS[i].origin);module.update(Math.max(0,t-STATIONS[i].start));module.updateMatrixWorld(true);
  if(i===pose.stationIndex)return;
  let objectIndex=0;
  module.traverse(object=>{
   const n=objectIndex++;
   if(!(object.isMesh||object.isSprite))return;
   object.getWorldPosition(point);local.copy(point).sub(module.position);centersChecked++;
   // Normal adjacent exhibit edges may remain in the wide frame.  This gate
   // isolates animated objects that have escaped their own 20-unit domain.
   if(Math.abs(local.x)<=10)return;
   const p=point.clone().project(camera);
   if(p.z<-1||p.z>1||Math.abs(p.x)>.98||Math.abs(p.y)>.9)return;
   const key=`${STATIONS[i].id}/${n}`;
   const first=intrusions.get(key);
   if(first){first.count++;first.lastTimeSec=t;}
   else intrusions.set(key,{sourceStation:STATIONS[i].id,visibleIn:current.id,objectIndex:n,objectName:object.name||object.type,firstTimeSec:t,lastTimeSec:t,count:1,local:local.toArray(),screen:p.toArray()});
  });
 });
}
const report={status:intrusions.size||centersChecked===0?'FAIL':'PASS',samples,centersChecked,intrusionCount:intrusions.size,intrusions:[...intrusions.values()],scope:'Mesh/sprite centers of animations that escape their local x domain and project into another station during stable dwell. No WebGL, final raster, alpha, GLB or large-surface bounds assertion.'};
fs.writeFileSync(path.join(root,'research/cross-station-qa-v6.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
require.extensions['.ts']=previousHook;delete globalThis.document;
if(intrusions.size)process.exitCode=1;
