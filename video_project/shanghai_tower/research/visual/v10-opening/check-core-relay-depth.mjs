import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as T from 'three';
import {OBB} from 'three/examples/jsm/math/OBB.js';
import {loadCameraParts} from '../../../scripts/camera_geometry.mjs';
const out=`tmp/v10-depth-${process.pid}`;
await build({entryPoints:{inventory:'src/PartsInventory.ts'},outdir:out,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'error'});
const {PartsInventory}=await import(pathToFileURL(path.resolve(out,'inventory.mjs')));
const timeline=JSON.parse(fs.readFileSync('src/timeline.json'));
const manifest=JSON.parse(fs.readFileSync('public/models/shanghai-tower-manifest.json'));
const loaded=await loadCameraParts(manifest),inventory=new PartsInventory(loaded.parts,timeline);
const columns=inventory.studies.find(s=>s.key==='megacolumn').parts,core=inventory.studies.find(s=>s.key==='core').parts;
const meshes=parts=>parts.flatMap(p=>{const list=[];p.root.traverse(m=>{if(m instanceof T.Mesh){m.geometry.computeBoundingBox();list.push({id:p.id,mesh:m});}});return list;});
const ca=meshes(columns),co=meshes(core),samples=[];
const box=mesh=>new OBB().fromBox3(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
const tris=mesh=>{const geo=mesh.geometry,position=geo.attributes.position,index=geo.index,arr=[];for(let i=0;i<(index?index.count:position.count);i+=3){const vertices=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));arr.push(new T.Triangle(...vertices));}return arr;};
// Segment/triangle queries on both triangles test actual surface crossing.
const edgeHits=(a,b)=>{const vertices=[a.a,a.b,a.c];for(let i=0;i<3;i++){const p=vertices[i],q=vertices[(i+1)%3],dir=q.clone().sub(p),len=dir.length();if(len<1e-12)continue;const hit=new T.Ray(p,dir.multiplyScalar(1/len)).intersectTriangle(b.a,b.b,b.c,false,new T.Vector3());if(hit&&hit.distanceTo(p)<=len+1e-10)return true;}return false;};
const surfaceCrossings=(a,b)=>{const aa=tris(a),bb=tris(b);let hits=0;for(const ta of aa){const boxA=new T.Box3().setFromPoints([ta.a,ta.b,ta.c]);for(const tb of bb){if(!boxA.intersectsTriangle(tb))continue;if(edgeHits(ta,tb)||edgeHits(tb,ta))hits++;}}return hits;};
for(let frame=1395;frame<=1425;frame++){
 for(const p of loaded.parts){p.root.position.set(0,0,0);p.root.quaternion.identity();p.root.visible=true;}
 const clip=timeline.clips.find(c=>frame>=c.start&&frame<c.end),cue=Number(clip.id.slice(1))+(frame-clip.start)/(clip.end-clip.start);inventory.apply(cue);
 for(const p of [...columns,...core])p.root.updateMatrixWorld(true);
 const overlapping=[],meshSurfaceCrossings=[];
 for(const a of ca)for(const b of co)if(box(a.mesh).intersectsOBB(box(b.mesh))){overlapping.push([a.id,b.id]);meshSurfaceCrossings.push({ids:[a.id,b.id],triangleCrossings:surfaceCrossings(a.mesh,b.mesh)});}
 samples.push({frame,cue,overlappingMeshBoxes:overlapping,meshSurfaceCrossings,columnCenters:columns.map(p=>({id:p.id,center:p.center.clone().applyQuaternion(p.root.quaternion).add(p.root.position).toArray()})),coreCenters:core.map(p=>({id:p.id,center:p.center.clone().applyQuaternion(p.root.quaternion).add(p.root.position).toArray()}))});
}
const report={scope:'Original GLB mesh oriented-box separation at every frame1395–1425; no OBB overlap proves mesh separation, overlap would require triangle-level checks.',columnsMeshes:ca.length,coreMeshes:co.length,overlapFrames:samples.filter(s=>s.overlappingMeshBoxes.length).map(s=>s.frame),samples};
fs.writeFileSync('research/visual/v10-opening/core-relay-depth.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({columnsMeshes:ca.length,coreMeshes:co.length,overlapFrames:report.overlapFrames,samples:samples.filter(s=>[1407,1410,1413,1416].includes(s.frame))},null,2));loaded.dispose();
