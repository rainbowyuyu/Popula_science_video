import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as T from 'three';
import {loadCameraParts} from '../../../scripts/camera_geometry.mjs';
const out='tmp/v9-opening-geometry';
await build({entryPoints:{inventory:'src/PartsInventory.ts',camera:'src/CameraPath.ts'},outdir:out,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'error'});
const {PartsInventory}=await import(pathToFileURL(path.resolve(out,'inventory.mjs')));
const {CameraPath,towerCameraAnchors}=await import(pathToFileURL(path.resolve(out,'camera.mjs')));
const manifest=JSON.parse(fs.readFileSync('public/models/shanghai-tower-manifest.json','utf8'));
const timeline=JSON.parse(fs.readFileSync('src/timeline.json','utf8'));
const loaded=await loadCameraParts(manifest),inventory=new PartsInventory(loaded.parts),camera=new T.PerspectiveCamera(34,1920/1080,.008,200),route=new CameraPath(timeline);
route.setAnchors({...towerCameraAnchors(manifest),...inventory.anchors});
const snapshots=[];
let allScaleOne=true,finite=true,maxReturnError=0;
for(const cue of [1,1.2,1.4,1.60,1.75,2.12,2.38,2.59,2.77,3.15,3.37,3.69,3.88,4.10,4.30,4.52,4.65,4.78,4.90,4.99999]){
 for(const p of loaded.parts){p.root.position.set(0,0,0);p.root.quaternion.identity();p.root.visible=true;}
 inventory.apply(cue);route.apply(camera,route.timeAt(cue));
 const current=inventory.studies.filter(s=>cue>=s.enter[1]&&cue<=s.leave[0]);
 const studies=current.map(s=>{const box=new T.Box3();s.parts.forEach(p=>{p.root.updateMatrixWorld(true);box.union(new T.Box3().setFromObject(p.root));});
  const points=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){const q=new T.Vector3(x,y,z).project(camera);points.push([(q.x+1)*960,(1-q.y)*540]);}
  const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);return {key:s.key,pixels:{left:Math.min(...xs),right:Math.max(...xs),top:Math.min(...ys),bottom:Math.max(...ys)},center:box.getCenter(new T.Vector3()).toArray()};});
 const marks=inventory.marks(camera,cue);
 for(const p of loaded.parts){allScaleOne&&=p.root.scale.equals(new T.Vector3(1,1,1));finite&&=[...p.root.position,...p.root.quaternion].every(Number.isFinite);if(cue>4.999)maxReturnError=Math.max(maxReturnError,p.root.position.length(),p.root.quaternion.angleTo(new T.Quaternion()));}
 snapshots.push({cue,frame:Math.round(route.timeAt(cue)*30),studies,marks});
}
const report={scope:'CPU projection and transform QA using actual GLB; this does not certify rendered visibility or beauty.',partCount:loaded.parts.length,studyPartCount:new Set(inventory.studies.flatMap(s=>s.ids)).size,allScaleOne,finite,maxReturnError,pass:allScaleOne&&finite&&maxReturnError<1e-6,snapshots};
fs.writeFileSync('research/visual/v9-opening/staging-projection.json',JSON.stringify(report,null,2));console.log(JSON.stringify({pass:report.pass,studyPartCount:report.studyPartCount,maxReturnError}));loaded.dispose();
