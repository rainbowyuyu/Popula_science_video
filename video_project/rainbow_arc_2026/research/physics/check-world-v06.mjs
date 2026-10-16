import {build} from 'esbuild';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import * as T from 'three';
import assert from 'node:assert/strict';
await build({stdin:{contents:"export * from './src/WorldV06';export * from './src/Timeline';export * from './src/CinematicRouteV06';",resolveDir:process.cwd(),loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',outfile:'research/physics/world-v06.mjs'});
const {WorldV06,stateAt,timeline,sampleFilmCamera}=await import(pathToFileURL(process.cwd()+'/research/physics/world-v06.mjs'));
const world=new WorldV06(undefined,new T.Scene());
const frames=[...timeline.scenes.flatMap(s=>[s.start+1,s.start+Math.round((s.end-s.start)*.56),s.end-1]),...timeline.clips.map(c=>Math.round((c.start+c.end)/2))];
const report={version:'V06',passed:true,frames:[],minCircleY:null,invalidTransforms:0,deterministicSeek:false,minForward:1,groundOcclusion:true};
const snapshot=()=>{const a=[];world.group.traverse(o=>{a.push(o.position.toArray(),o.quaternion.toArray(),o.scale.toArray());if(o.isInstancedMesh)a.push(Array.from(o.instanceMatrix.array));});return JSON.stringify(a);};
for(const f of [...new Set(frames)].sort((a,b)=>a-b)){
 const s=stateAt(f);world.update(s);world.group.updateMatrixWorld(true);report.frames.push(f);
 world.group.traverse(o=>{if([...o.position.toArray(),...o.scale.toArray(),...o.quaternion.toArray(),...o.matrixWorld.elements].some(x=>!Number.isFinite(x)))report.invalidTransforms++;});
 const camera=sampleFilmCamera(f),d=new T.Vector3(...camera.target).sub(new T.Vector3(...camera.position)).normalize(),forward=new T.Vector3(0,0,-1).applyQuaternion(camera.quaternion);report.minForward=Math.min(report.minForward,d.dot(forward));
 if(s.scene==='circle'&&s.progress>.55&&s.progress<.58){
   const a=world.primaryRing.geometry.attributes.position;let minY=Infinity;for(let i=0;i<a.count;i++){const p=new T.Vector3(a.getX(i),a.getY(i),a.getZ(i)).applyMatrix4(world.primaryRing.matrixWorld);minY=Math.min(minY,p.y);}report.minCircleY=minY;assert(minY>0,'Full circle is still below opaque ground');
 }
}
world.update(stateAt(frames[4]));const first=snapshot();world.update(stateAt(frames.at(-1)));world.update(stateAt(0));world.update(stateAt(frames[4]));report.deterministicSeek=first===snapshot();
assert.equal(report.invalidTransforms,0);assert(report.minForward>.999999);assert(report.deterministicSeek);
const primary=world.primaryAngles,secondary=world.secondaryAngles;assert(primary[0].rainbowAngleDeg>primary[6].rainbowAngleDeg);assert(secondary[0].rainbowAngleDeg<secondary[6].rainbowAngleDeg);assert(secondary[0].rainbowAngleDeg>primary[0].rainbowAngleDeg);
report.primaryAngles=primary.map(x=>x.rainbowAngleDeg);report.secondaryAngles=secondary.map(x=>x.rainbowAngleDeg);world.dispose();
fs.writeFileSync('research/physics/world-geometry-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
