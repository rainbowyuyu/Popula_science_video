import fs from 'node:fs';
import * as T from 'three';
import {sampleV18Camera} from './v18-world-camera-qa-module.mjs';
const glb=path=>{const b=fs.readFileSync(path);return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString())};
const hull=glb('public/assets/v18/reference-platform.glb'),upper=glb('public/assets/v18/turbine-upper.glb');
const objects=[...hull.nodes.filter(n=>n.name?.startsWith('OuterColumn_')).map(n=>({name:n.name,position:new T.Vector3(...n.translation)})),{name:'hub',position:new T.Vector3(0,24.15,0)}];
const report=[];
for(const t of [9.5,12,98,102,105]){
 const pose=sampleV18Camera(t),camera=new T.PerspectiveCamera(pose.fov,1920/1080,.15,30000);camera.position.copy(pose.position);camera.lookAt(pose.target);camera.setViewOffset(1920,1080,pose.viewOffsetX,0,1920,1080);camera.updateMatrixWorld();
 const project=p=>{const q=p.clone().project(camera);return {x:960*(q.x+1),y:540*(1-q.y)}};
 const cols=objects.map(o=>({name:o.name,...project(o.position)}));
 report.push({t,centres:cols});
}
fs.writeFileSync('research/v18-world-side-camera-projection.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
