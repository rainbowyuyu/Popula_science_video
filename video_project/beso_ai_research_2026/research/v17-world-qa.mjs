import fs from 'node:fs';
import crypto from 'node:crypto';
import {build} from 'esbuild';
await build({entryPoints:['src/beso/LaunchV17Camera.ts'],outfile:'research/v17-world-camera-qa-module.mjs',bundle:true,platform:'node',format:'esm',minify:true});
const {sampleV17Camera,V17_CAMERA_KEYS}=await import('./v17-world-camera-qa-module.mjs?'+Date.now());
let previous=null,maxStep=0,maxTargetStep=0,minTargetDistance=Infinity,minHeight=Infinity;
for(let frame=0;frame<=6300;frame++){
 const p=sampleV17Camera(frame/60);
 if(![...p.position.toArray(),...p.target.toArray(),p.fov,p.viewOffsetX].every(Number.isFinite))throw Error('Nonfinite frame '+frame);
 if(previous){maxStep=Math.max(maxStep,p.position.distanceTo(previous.position));maxTargetStep=Math.max(maxTargetStep,p.target.distanceTo(previous.target));}
 minTargetDistance=Math.min(minTargetDistance,p.position.distanceTo(p.target));minHeight=Math.min(minHeight,p.position.y);previous=p;
}
const continuity=V17_CAMERA_KEYS.slice(1,-1).map(k=>{const dt=.00001,a=sampleV17Camera(k.t-dt),b=sampleV17Camera(k.t),c=sampleV17Camera(k.t+dt),v0=b.position.clone().sub(a.position).divideScalar(dt),v1=c.position.clone().sub(b.position).divideScalar(dt);return{time:k.t,velocityDifference:v0.distanceTo(v1),pass:v0.distanceTo(v1)<.1};});
const report={framesSampled:6301,finite:true,maxCameraStepMPerFrame:maxStep,maxTargetStepMPerFrame:maxTargetStep,minCameraTargetDistanceM:minTargetDistance,minCameraHeightM:minHeight,continuity,pass:continuity.every(x=>x.pass)&&minTargetDistance>25&&minHeight>10,limitations:'Camera-coordinate continuity and above-water clearance. Visibility, composition, and intentional foreground occlusion are separately reviewed in world-preview contact sheets.'};
fs.writeFileSync('research/v17-world-camera-qa.json',JSON.stringify(report,null,2));
const paths=['src/beso/LaunchWorldV17.ts','src/beso/LaunchWorldV17Runtime.ts','src/beso/LaunchV17Camera.ts','src/beso/NativePlatformV17.ts','scripts/blender_v17_native.py','public/assets/v17/world-webgpu.js','public/assets/v17/reference-platform.glb','public/assets/v17/turbine-upper.glb','public/assets/v17/visual-layout.json','public/assets/v17/clear-blue-sky.hdr','public/beso-research/physics/native-model.json','public/beso-research/physics/zwind-response.json'];
const provenance={version:'v17',model:'Blender-authored reference visual layout. Three level circular ballast bases, slightly inclined columns, continuous radial box braces, 12 lines attached to outboard base eyes. The archived solver model is unchanged; no archived displacement is applied to the revised visual layout.',water:{package:'WaterPro 3.1.1',three:'0.183.0',backend:'webgpu',seed:.1741,stepSize:1/60,claim:'Optical FFT/Gerstner wave visualization, not a new coupled calculation.',clipPlaneDistanceM:.4},evidence:'Saved original BESO and Zwind arrays. Scalars and curves remain independent archived evidence.',camera:'Single C1 route. Opaque near-camera drafting sheet crosses lens at 25.5, 40.5, 55.5, 97 seconds and covers stage visibility switches.',files:paths.map(path=>({path,sha256:crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex'),bytes:fs.statSync(path).size}))};
fs.writeFileSync('research/v17-world-provenance.json',JSON.stringify(provenance,null,2));
console.log(JSON.stringify({pass:report.pass,frames:report.framesSampled,maxStep,minTargetDistance,minHeight,failedKnots:continuity.filter(x=>!x.pass)},null,2));
if(!report.pass)process.exitCode=1;
