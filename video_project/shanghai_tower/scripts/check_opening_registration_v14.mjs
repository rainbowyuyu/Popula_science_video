import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as T from 'three';
import {loadCameraParts} from './camera_geometry.mjs';

const outdir='tmp/v14-opening-registration-numerical';
fs.mkdirSync(outdir,{recursive:true});
await build({entryPoints:{opening:'src/OpeningCamera.ts',intro:'src/RealSceneIntro.tsx'},outdir,outExtension:{'.js':'.mjs'},bundle:true,platform:'node',format:'esm',packages:'external',logLevel:'error'});
const {authoredOpeningCameraPose,applyOpeningCameraPose,OPENING_PHOTO_REVEAL}=await import(pathToFileURL(path.resolve(outdir,'opening.mjs')));
const {RealSceneIntro}=await import(pathToFileURL(path.resolve(outdir,'intro.mjs')));
const manifest=JSON.parse(fs.readFileSync('public/models/shanghai-tower-manifest.json','utf8'));
const geometry=await loadCameraParts(manifest),camera=new T.PerspectiveCamera(34,1920/1080,.008,200);
const crown=new T.Vector3(0,6.32,0),silhouetteRows=[100,200,300,450,600,750,900,1050];
const facadeTriangles=[];
for(const p of geometry.parts.filter(p=>['outerglass','mullions','spiralrib'].includes(p.role))){
 p.root.traverse(o=>{if(!(o instanceof T.Mesh))return;const a=o.geometry.getAttribute('position'),index=o.geometry.getIndex(),count=index?index.count:a.count;
  for(let i=0;i<count;i+=3)facadeTriangles.push([0,1,2].map(k=>new T.Vector3().fromBufferAttribute(a,index?index.getX(i+k):i+k)));
 });
}
const photoPlateElements=element=>{
 if(!element||typeof element!=='object')return [];
 if(Array.isArray(element))return element.flatMap(photoPlateElements);
 const props=element.props??{},own=typeof props.src==='string'&&props.src.endsWith('qwen-shanghai-tower-opening.png')?[{src:props.src,style:props.style}]:[];
 return [...own,...photoPlateElements(props.children)];
};
function project(v){const p=v.clone().project(camera);return {x:(p.x+1)*960,y:(1-p.y)*540,z:p.z};}
function poseArray(pose){return [...pose.position,...pose.target,pose.shift,pose.roll,pose.fov??34];}
function sample(f,includeSilhouette=false){
 const pose=authoredOpeningCameraPose(f/30);applyOpeningCameraPose(camera,pose);
 const result={frame:f,pose:poseArray(pose),declaredFov:pose.fov??34,effectiveFov:camera.fov,projectionMatrix:camera.projectionMatrix.toArray(),rotation:camera.quaternion.toArray(),crown:project(crown),base:project(new T.Vector3()),radius:pose.position.distanceTo(pose.target)};
 if(includeSilhouette){
  const rows=silhouetteRows.map(y=>({y,xMin:Infinity,xMax:-Infinity}));let xMin=Infinity,xMax=-Infinity,yMin=Infinity,yMax=-Infinity;
  for(const vertices of facadeTriangles){const p=vertices.map(project);if(p.some(v=>v.z<0||v.z>1))continue;
   for(const v of p){xMin=Math.min(xMin,v.x);xMax=Math.max(xMax,v.x);yMin=Math.min(yMin,v.y);yMax=Math.max(yMax,v.y);}
   for(const row of rows)for(let i=0;i<3;i++){const a=p[i],b=p[(i+1)%3];if((a.y<=row.y&&b.y>=row.y)||(a.y>=row.y&&b.y<=row.y)){if(Math.abs(b.y-a.y)<1e-9)continue;const x=a.x+(b.x-a.x)*(row.y-a.y)/(b.y-a.y);row.xMin=Math.min(row.xMin,x);row.xMax=Math.max(row.xMax,x);}}
  }
  result.facadeSilhouette={bounds:{xMin,xMax,yMin,yMax},scanlines:rows.filter(r=>Number.isFinite(r.xMin))};
 }
 return result;
}
const errors=[],held=sample(OPENING_PHOTO_REVEAL.start),photoReference=JSON.stringify(photoPlateElements(RealSceneIntro({frame:80}))[0]);
let maxHoldDelta=0,maxHoldFovDelta=0,maxHoldProjectionDelta=0;
for(let f=80;f<=136;f++){
 const a=sample(f);maxHoldDelta=Math.max(maxHoldDelta,...a.pose.map((v,i)=>Math.abs(v-held.pose[i])));
 maxHoldFovDelta=Math.max(maxHoldFovDelta,Math.abs(a.effectiveFov-held.effectiveFov));
 maxHoldProjectionDelta=Math.max(maxHoldProjectionDelta,...a.projectionMatrix.map((v,i)=>Math.abs(v-held.projectionMatrix[i])));
 if(Math.abs(a.effectiveFov-a.declaredFov)>1e-10)errors.push('Applied FOV differs from declared FOV '+f);
 if(f<136){const photos=photoPlateElements(RealSceneIntro({frame:f}));if(!photos.length||photos.some(p=>JSON.stringify(p)!==photoReference))errors.push('Photo transform changes at '+f);}
}
if(maxHoldDelta>1e-12)errors.push('Camera moves while photographic plate is revealing');
if(maxHoldFovDelta>1e-12||maxHoldProjectionDelta>1e-12)errors.push('FOV or projection changes while photographic plate is revealing');
if(RealSceneIntro({frame:136})!==null)errors.push('Photo remains after registration handoff');
const samples=[];
for(let f=136;f<=260;f++){
 const value=sample(f);samples.push(value);
 if(![...value.pose,...value.projectionMatrix,...Object.values(value.crown),value.radius,value.effectiveFov].every(Number.isFinite))errors.push('Non-finite camera or crown '+f);
 if(Math.abs(value.effectiveFov-value.declaredFov)>1e-10)errors.push('Applied FOV differs from declared FOV '+f);
 if(f<=230&&(value.crown.x<0||value.crown.x>1920||value.crown.y<0||value.crown.y>1080||value.crown.z<0||value.crown.z>1))errors.push('Crown leaves image '+f);
}
// Ground is Y=0 in the actual GLB. Quarter-frame sampling also detects a
// spline dipping under the ground between two apparently safe frame poses.
let minGroundClearance=Infinity,minGroundFrame=null;
for(let q=136*4;q<=230*4;q++){
 const f=q/4,s=sample(f),clearance=s.pose[1];
 if(clearance<minGroundClearance){minGroundClearance=clearance;minGroundFrame=f;}
 if(clearance<0)errors.push('Camera crosses ground at '+f);
 if(Math.abs(s.effectiveFov-s.declaredFov)>1e-10)errors.push('Applied FOV differs from declared FOV '+f);
}
// Start this pass from the wide lens before seeking to the tail; an apply
// routine that only sets FOV when the property is present must fail here.
sample(80);let maxRestoredFovError=0;
for(let f=230;f<1786;f++){
 const s=sample(f);maxRestoredFovError=Math.max(maxRestoredFovError,Math.abs(s.effectiveFov-34));
}
if(maxRestoredFovError>1e-10)errors.push('FOV does not restore to 34 degrees after F230');
const steps=samples.slice(1).map((s,i)=>{const p=samples[i];return {frame:s.frame,crownPx:Math.hypot(s.crown.x-p.crown.x,s.crown.y-p.crown.y),worldPosition:new T.Vector3(...s.pose.slice(0,3)).distanceTo(new T.Vector3(...p.pose.slice(0,3))),angleDeg:new T.Quaternion(...s.rotation).angleTo(new T.Quaternion(...p.rotation))*180/Math.PI,zoomLog:Math.abs(Math.log(s.radius/p.radius)),fovDeg:Math.abs(s.effectiveFov-p.effectiveFov)};});
const acceleration=steps.slice(1).map((s,i)=>{const p=steps[i];return {frame:s.frame,crownSpeedDelta:Math.abs(s.crownPx-p.crownPx),worldSpeedDelta:Math.abs(s.worldPosition-p.worldPosition),angleSpeedDelta:Math.abs(s.angleDeg-p.angleDeg)};});
// Measure both sides at a subframe resolution to distinguish a very fast
// continuous move from a discontinuity at a branch boundary.
const seamChecks=[136,230,250].map(f=>{const before=sample(f-.001),at=sample(f),after=sample(f+.001),maxStep=Math.max(...at.pose.map((v,i)=>Math.abs(v-before.pose[i])),...after.pose.map((v,i)=>Math.abs(v-at.pose[i])));return {frame:f,deltaAtOneThousandthFrame:maxStep,fovBefore:before.effectiveFov,fovAt:at.effectiveFov,fovAfter:after.effectiveFov,crownBefore:before.crown,crownAt:at.crown,crownAfter:after.crown};});
if(seamChecks.some(s=>s.deltaAtOneThousandthFrame>.01))errors.push('Camera branch seam exceeds continuous tolerance');
const referenceFrames=[80,108,136,137,140,148,160,176,192,208,224,229,230,231,250,260,294];
const snapshots=referenceFrames.map(f=>sample(f,true));
// The shared scratch camera in the crown solver must still be seek-safe.
for(const s of [...samples].reverse())if(JSON.stringify(sample(s.frame))!==JSON.stringify(s))errors.push('Seek-dependent camera at '+s.frame);
const sourceFiles=['src/OpeningCamera.ts','src/RealSceneIntro.tsx','public/models/shanghai-tower.glb','public/scene/qwen-shanghai-tower-opening.png','scripts/check_opening_registration_v14.mjs'];
const report={passed:errors.length===0,errors,sourceSHA256:Object.fromEntries(sourceFiles.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),photoPoseStatic:errors.every(e=>!e.startsWith('Photo transform')),holdFrames:[80,136],maxHoldDelta,maxHoldFovDelta,maxHoldProjectionDelta,holdFov:held.effectiveFov,ground:{datumY:0,minimumClearanceThreeUnits:minGroundClearance,minimumClearanceMetres:minGroundClearance*100,frame:minGroundFrame,sampleStepFrames:.25,passed:minGroundClearance>=0},restoredFov:{frames:[230,1785],degrees:34,maxError:maxRestoredFovError},crownInFrame:errors.every(e=>!e.startsWith('Crown')),reverseSeekIdentical:errors.every(e=>!e.startsWith('Seek')),photoReference:JSON.parse(photoReference),silhouetteTriangleCount:facadeTriangles.length,seamChecks,motionPeaks:Object.fromEntries(['crownPx','worldPosition','angleDeg','zoomLog','fovDeg'].map(key=>[key,[...steps].sort((a,b)=>b[key]-a[key]).slice(0,8)])),accelerationPeaks:Object.fromEntries(['crownSpeedDelta','worldSpeedDelta','angleSpeedDelta'].map(key=>[key,[...acceleration].sort((a,b)=>b[key]-a[key]).slice(0,8)])),snapshots,scope:'Rendered camera/plate transforms, actual applied FOV, above-ground position and true GLB facade projections. Ground check is against Y=0, not general mesh-collision certification. Scanline silhouettes include all facade triangles without illumination. Photograph registration fit and aesthetic quality require visual image comparison; numerical continuity alone does not certify them.'};
const out='research/qa/v14-opening/registration-numerical.json';fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));geometry.dispose();
console.log(JSON.stringify({out,passed:report.passed,errors,maxHoldDelta,maxHoldFovDelta,maxHoldProjectionDelta,holdFov:report.holdFov,ground:report.ground,restoredFov:report.restoredFov,crownInFrame:report.crownInFrame,seamChecks,peaks:Object.fromEntries(Object.entries(report.motionPeaks).map(([k,v])=>[k,v[0]])),silhouetteTriangleCount:facadeTriangles.length},null,2));
if(!report.passed)process.exitCode=1;
