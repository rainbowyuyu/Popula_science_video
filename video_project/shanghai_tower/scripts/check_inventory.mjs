import fs from 'node:fs';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import * as T from 'three';
await build({entryPoints:['src/PartsInventory.ts'],outfile:'tmp/parts-inventory-check.mjs',bundle:true,platform:'node',format:'esm',external:['three'],logLevel:'error'});
await build({entryPoints:['src/CameraPath.ts'],outfile:'tmp/inventory-camera-check.mjs',bundle:true,platform:'node',format:'esm',external:['three'],logLevel:'error'});
const {PartsInventory}=await import(pathToFileURL(path.resolve('tmp/parts-inventory-check.mjs')));
const {CameraPath,towerCameraAnchors}=await import(pathToFileURL(path.resolve('tmp/inventory-camera-check.mjs')));
const manifest=JSON.parse(fs.readFileSync('public/models/shanghai-tower-manifest.json','utf8'));
const timeline=JSON.parse(fs.readFileSync('src/timeline.json','utf8'));
const parts=manifest.parts.map(p=>{const min=new T.Vector3(...p.bboxThree[0]).multiplyScalar(.01),max=new T.Vector3(...p.bboxThree[1]).multiplyScalar(.01),size=max.clone().sub(min),center=min.clone().add(max).multiplyScalar(.5),root=new T.Group();root.add(new T.Mesh(new T.BoxGeometry(size.x,size.y,size.z).translate(...center.toArray())));return {id:p.id,role:p.role,root,center,offset:new T.Vector3()};});
const inventory=new PartsInventory(parts),collisions=[];
for(let i=0;i<inventory.items.length;i++)for(let j=0;j<i;j++){
 const a=inventory.items[i],b=inventory.items[j];
 if(Math.abs(a.target.x-b.target.x)<(a.size.x+b.size.x)/2-1e-7&&Math.abs(a.target.z-b.target.z)<(a.size.z+b.size.z)/2-1e-7)collisions.push([a.part.id,b.part.id]);
}
const camera=new T.PerspectiveCamera(34,1920/1080,.008,200),route=new CameraPath(timeline);route.setAnchors({...towerCameraAnchors(manifest),...inventory.anchors});
const cues=[1.8,2.2,2.53,2.88,3.2,3.54,3.85,4.13],views=cues.map(cue=>{route.apply(camera,route.timeAt(cue));return {cue,camera:camera.position.toArray(),target:route.at(route.timeAt(cue)).target.toArray(),labels:inventory.marks(camera,cue).map(x=>({id:x.id,x:x.x,y:x.y,weight:x.weight})),partsInView:inventory.items.filter(i=>{const p=i.target.clone().project(camera);return Math.abs(p.x)<1&&Math.abs(p.y)<1&&p.z>0&&p.z<1;}).length};});
const report={parts:parts.length,uniqueNames:new Set(inventory.items.map(i=>i.name.nameChinese)).size,bounds:inventory.bounds.getSize(new T.Vector3()).toArray(),collisions,blocks:inventory.blocks.map(b=>({role:b.role,origin:b.origin.toArray(),height:b.height,count:b.items.length})),views,passed:collisions.length===0&&parts.length===987};
fs.mkdirSync('research/qa/v8-inventory',{recursive:true});fs.writeFileSync('research/qa/v8-inventory/layout-check.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exit(1);
