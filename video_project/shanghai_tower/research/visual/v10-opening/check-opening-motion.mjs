import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import * as T from 'three';
import {loadCameraParts} from '../../../scripts/camera_geometry.mjs';

const reportDir='research/visual/v10-opening';
const inputs=['src/PartsInventory.ts','src/CameraPath.ts','src/visual.ts','src/timeline.json','public/models/shanghai-tower.glb','public/models/shanghai-tower-manifest.json'];
const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const before=Object.fromEntries(inputs.map(file=>[file,hash(file)]));
const out=`tmp/v10-opening-cpu-${process.pid}`;
await build({entryPoints:{inventory:'src/PartsInventory.ts',camera:'src/CameraPath.ts'},outdir:out,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'error'});
const {PartsInventory}=await import(pathToFileURL(path.resolve(out,'inventory.mjs')));
const {CameraPath,towerCameraAnchors}=await import(pathToFileURL(path.resolve(out,'camera.mjs')));
const timeline=JSON.parse(fs.readFileSync('src/timeline.json','utf8'));
const manifest=JSON.parse(fs.readFileSync('public/models/shanghai-tower-manifest.json','utf8'));
const loaded=await loadCameraParts(manifest),inventory=new PartsInventory(loaded.parts,timeline),camera=new T.PerspectiveCamera(34,1920/1080,.008,200),route=new CameraPath(timeline);
route.setAnchors({...towerCameraAnchors(manifest),...inventory.anchors});
const boxes=new Map(loaded.parts.map(p=>[p.id,new T.Box3().setFromObject(p.root)]));
const cueAtTime=t=>{const f=t*timeline.fps,c=timeline.clips.find(c=>f>=c.start&&f<c.end)??(f<timeline.clips[0].start?timeline.clips[0]:timeline.clips.at(-1));return Number(c.id.slice(1))+Math.max(0,Math.min(1,(f-c.start)/(c.end-c.start)));};
const poseAt=t=>{for(const p of loaded.parts){p.root.position.set(0,0,0);p.root.quaternion.identity();p.root.visible=true;}inventory.apply(cueAtTime(t));return loaded.parts.map(p=>({id:p.id,position:p.root.position.clone(),quaternion:p.root.quaternion.clone(),scale:p.root.scale.clone(),center:p.center.clone().applyQuaternion(p.root.quaternion).add(p.root.position)}));};
const projectStudy=study=>{
 const screen=[];let inFront=true;
 for(const p of study.parts){
  p.root.updateMatrixWorld(true);const b=boxes.get(p.id);
  for(const x of [b.min.x,b.max.x])for(const y of [b.min.y,b.max.y])for(const z of [b.min.z,b.max.z]){const v=new T.Vector3(x,y,z).applyMatrix4(p.root.matrixWorld).project(camera);inFront&&=v.z>=0&&v.z<=1;screen.push([(v.x+1)*960,(1-v.y)*540]);}
 }
 const xs=screen.map(v=>v[0]),ys=screen.map(v=>v[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
 return {left,right,top,bottom,width:right-left,height:bottom-top,inFront};
};
const endFrame=Math.ceil(route.timeAt(5)*timeline.fps);
let allScaleOne=true,finite=true,maxReturnError=0;
const peaks=[],stableStudies=new Map(inventory.studies.map(s=>[s.key,[]])),handoverCoverage=[],brandIntersections=[];let previous;
for(let frame=0;frame<=endFrame;frame++){
 const t=frame/timeline.fps,cue=cueAtTime(t),poses=poseAt(t);route.apply(camera,t);let peak={frame,cue,id:'',centerStep:0,angularStepDegrees:0};
 for(let i=0;i<poses.length;i++){
  const p=poses[i];allScaleOne&&=p.scale.equals(new T.Vector3(1,1,1));finite&&=[...p.position,...p.quaternion].every(Number.isFinite);
  if(previous){const d=p.center.distanceTo(previous[i].center);if(d>peak.centerStep)peak={frame,cue,id:p.id,centerStep:d,angularStepDegrees:p.quaternion.angleTo(previous[i].quaternion)*180/Math.PI};}
  if(cue>=4.999)maxReturnError=Math.max(maxReturnError,p.position.length(),p.quaternion.angleTo(new T.Quaternion()));
 }
 previous=poses;peaks.push(peak);
 if(frame%3===0&&cue>=1.58&&cue<=4.28){
  const projected=inventory.studies.filter(s=>cue>=s.enter[0]&&cue<=s.leave[1]).map(s=>{const b=projectStudy(s),width=Math.max(0,Math.min(1880,b.right)-Math.max(40,b.left)),height=Math.max(0,Math.min(925,b.bottom)-Math.max(150,b.top));return {key:s.key,visibleBoxArea:b.inFront?width*height:0,box:b};}).sort((a,b)=>b.visibleBoxArea-a.visibleBoxArea);
  handoverCoverage.push({frame,cue,maxVisibleBoxArea:projected[0]?.visibleBoxArea??0,subjects:projected});
 }
 if(frame%3===0&&cue>=1.58&&cue<4.99)for(const s of inventory.studies){
  if(cue<s.enter[0])continue;const b=projectStudy(s),area=Math.max(0,Math.min(410,b.right)-Math.max(40,b.left))*Math.max(0,Math.min(145,b.bottom)-Math.max(35,b.top));
  if(b.inFront&&area>500)brandIntersections.push({frame,cue,key:s.key,area,box:b});
 }
 if(frame%3===0)for(const s of inventory.studies)if(cue>=s.enter[1]&&cue<=s.leave[0])stableStudies.get(s.key).push({frame,cue,...projectStudy(s)});
}
const boundaries=[...new Set([1,2,3,4,5,1.04,1.12,1.47,4.83,4.99,2.15,2.43,4.69,4.86,2.86,3.09,4.59,4.78,3.32,3.51,3.61,3.74,2.12,2.24,2.32,2.44,2.36,2.49,2.61,2.72,2.56,2.66,2.77,2.85,3.86,3.945,4.015,4.08,...inventory.studies.flatMap(s=>[...s.enter,...s.leave,...s.return])])].sort((a,b)=>a-b);
const joins=[];const e=.0001;
for(const cue of boundaries){
 const t=route.timeAt(cue),a2=poseAt(t-2*e),a=poseAt(t-e),b=poseAt(t),c=poseAt(t+e),c2=poseAt(t+2*e);
 let peak={cue,time:t,frame:t*timeline.fps,id:'',centerVelocityJump:0,centerStepAcrossBoundary:0,angularStepAcrossBoundary:0};
 for(let i=0;i<b.length;i++){
  const left=b[i].center.clone().multiplyScalar(3).addScaledVector(a[i].center,-4).add(a2[i].center).multiplyScalar(1/(2*e));
  const right=b[i].center.clone().multiplyScalar(-3).addScaledVector(c[i].center,4).sub(c2[i].center).multiplyScalar(1/(2*e));
  const jump=left.distanceTo(right);if(jump>peak.centerVelocityJump)peak={cue,time:t,frame:t*timeline.fps,id:b[i].id,centerVelocityJump:jump,centerStepAcrossBoundary:a[i].center.distanceTo(c[i].center),angularStepAcrossBoundary:a[i].quaternion.angleTo(c[i].quaternion)};
 }
 joins.push(peak);
}
const studyScale=Object.fromEntries([...stableStudies].map(([key,rows])=>[key,{sampleCount:rows.length,minHeight:Math.min(...rows.map(r=>r.height)),maxHeight:Math.max(...rows.map(r=>r.height)),minWidth:Math.min(...rows.map(r=>r.width)),maxWidth:Math.max(...rows.map(r=>r.width)),allInFront:rows.every(r=>r.inFront),allWithinSafeBounds:rows.every(r=>r.left>=40&&r.right<=1880&&r.top>=150&&r.bottom<=925),sampleRows:rows.filter((_,i)=>i===0||i===rows.length-1||i===Math.floor(rows.length/2))}]));
const after=Object.fromEntries(inputs.map(file=>[file,hash(file)]));
const report={generatedAt:new Date().toISOString(),scope:'Actual-GLB CPU check of opening transforms, true-time join velocities, camera-projected study boxes and handover. Does not simulate World transforms after cue5 or certify visibility, occlusion or beauty.',inputSHA256:before,inputsStable:inputs.every(f=>before[f]===after[f]),partCount:loaded.parts.length,studiedParts:new Set(inventory.studies.flatMap(s=>s.ids)).size,frames: endFrame+1,allScaleOne,finite,maxReturnError,transformValidityPass:allScaleOne&&finite&&maxReturnError<1e-6,topMotionFrames:peaks.sort((a,b)=>b.centerStep-a.centerStep).slice(0,20),maxCenterVelocityJump:Math.max(...joins.map(j=>j.centerVelocityJump)),joinRankings:[...joins].sort((a,b)=>b.centerVelocityJump-a.centerVelocityJump),studyScale,handoverCoverage:{scope:'Projected source bounding boxes, not actual raster coverage or occlusion. A small/absent box identifies potential blank staging that needs rendered inspection.',minimumVisibleBoxArea:Math.min(...handoverCoverage.map(r=>r.maxVisibleBoxArea)),smallSubjectFrames:handoverCoverage.filter(r=>r.maxVisibleBoxArea<7000)}};
report.brandBoundingBoxIntersections={scope:'Conservative projected bounds, requiring rendered verification of actual strokes.',count:brandIntersections.length,frames:brandIntersections};
const output=process.argv.find(v=>v.startsWith('--out='))?.slice(6)??`${reportDir}/opening-motion-current.json`;
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify({transformValidityPass:report.transformValidityPass,inputsStable:report.inputsStable,maxReturnError,maxCenterVelocityJump:report.maxCenterVelocityJump,largestJoins:report.joinRankings.slice(0,8),studyScale},null,2));loaded.dispose();
