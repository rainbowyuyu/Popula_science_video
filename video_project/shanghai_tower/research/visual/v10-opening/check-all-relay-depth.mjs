import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as T from 'three';
import {OBB} from 'three/examples/jsm/math/OBB.js';
import {loadCameraParts} from '../../../scripts/camera_geometry.mjs';
const out=`tmp/v10-all-depth-${process.pid}`;
await build({entryPoints:{inventory:'src/PartsInventory.ts'},outdir:out,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'error'});
const {PartsInventory}=await import(pathToFileURL(path.resolve(out,'inventory.mjs')));
const timeline=JSON.parse(fs.readFileSync('src/timeline.json'));
const manifest=JSON.parse(fs.readFileSync('public/models/shanghai-tower-manifest.json'));
const loaded=await loadCameraParts(manifest),inventory=new PartsInventory(loaded.parts,timeline),meshes=new Map();
for(const s of inventory.studies){const list=[];for(const p of s.parts)p.root.traverse(m=>{if(m instanceof T.Mesh){m.geometry.computeBoundingBox();list.push({id:p.id,mesh:m});}});meshes.set(s.key,list);}
const box=mesh=>new OBB().fromBox3(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
const tris=mesh=>{const geo=mesh.geometry,position=geo.attributes.position,index=geo.index,arr=[];for(let i=0;i<(index?index.count:position.count);i+=3){const vertices=[0,1,2].map(j=>new T.Vector3().fromBufferAttribute(position,index?index.getX(i+j):i+j).applyMatrix4(mesh.matrixWorld));const t=new T.Triangle(...vertices);arr.push({t,b:new T.Box3().setFromPoints(vertices)});}return arr;};
const edgeHits=(a,b)=>{const vertices=[a.a,a.b,a.c];for(let i=0;i<3;i++){const p=vertices[i],q=vertices[(i+1)%3],dir=q.clone().sub(p),len=dir.length();if(len<1e-12)continue;const hit=new T.Ray(p,dir.multiplyScalar(1/len)).intersectTriangle(b.a,b.b,b.c,false,new T.Vector3());if(hit&&hit.distanceTo(p)<len-1e-8&&hit.distanceTo(p)>1e-8)return true;}return false;};
const surfaceCrossing=(a,b)=>{const aa=tris(a),bb=tris(b);for(const ta of aa)for(const tb of bb){if(!ta.b.intersectsBox(tb.b)||!ta.b.intersectsTriangle(tb.t))continue;if(edgeHits(ta.t,tb.t)||edgeHits(tb.t,ta.t))return true;}return false;};
const atCue=cue=>{const c=timeline.clips.find(c=>Number(c.id.slice(1))===Math.floor(cue));return Math.round(c.start+(c.end-c.start)*(cue-Math.floor(cue)));};
const windows=[],step=Number(process.argv.find(v=>v.startsWith('--step='))?.slice(7)??1);
for(let i=1;i<inventory.studies.length;i++){
 const a=inventory.studies[i-1],b=inventory.studies[i],frames=[atCue(b.enter[0]),atCue(a.leave[1])],suspects=[],hits=[];
 for(let frame=frames[0];frame<=frames[1];frame+=step){
  for(const p of loaded.parts){p.root.position.set(0,0,0);p.root.quaternion.identity();p.root.visible=true;}
  const c=timeline.clips.find(c=>frame>=c.start&&frame<c.end),cue=Number(c.id.slice(1))+(frame-c.start)/(c.end-c.start);inventory.apply(cue);
  for(const p of [...a.parts,...b.parts])p.root.updateMatrixWorld(true);
  for(const ma of meshes.get(a.key))for(const mb of meshes.get(b.key))if(box(ma.mesh).intersectsOBB(box(mb.mesh))){suspects.push({frame,ids:[ma.id,mb.id]});if(surfaceCrossing(ma.mesh,mb.mesh))hits.push({frame,cue,ids:[ma.id,mb.id]});}
 }
 windows.push({pair:[a.key,b.key],frames,step,suspects,hits});console.log(JSON.stringify({pair:[a.key,b.key],frames,suspects:suspects.length,hits}));
 fs.writeFileSync('research/visual/v10-opening/all-relay-depth.json',JSON.stringify({scope:'Consecutive selected-study handover frames: mesh oriented-box screening, then actual non-endpoint triangle edge/surface crossing. Internal assembly pairs within one study are excluded. Does not certify all987 parts or return-to-tower contacts.',windows},null,2));
}
loaded.dispose();
