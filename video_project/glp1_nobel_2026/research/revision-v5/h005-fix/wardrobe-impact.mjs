import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {build} from 'esbuild';

// CPU-only impact audit; no browser, GPU, render, or production-file writes.
const out='research/revision-v5/h005-fix';
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const locked=['src/V5World.ts','src/V5CameraPath.ts','src/V5Person.ts','src/timeline.json'];
const hashes=Object.fromEntries(locked.map(p=>[p,sha(p)]));
const world=fs.readFileSync('src/V5World.ts','utf8');
const helper=world.slice(world.indexOf('function anteriorInterior'),world.indexOf('/** Single atlas-coordinate'));
const viewWeight=world.slice(world.indexOf(' private viewWeight'),world.indexOf(' private contiguousProgress'));
const prefix=world.slice(world.indexOf(' update(s:FrameState){'),world.indexOf('  this.person?.update')).replace('this.handoff.update(s.frame,d,this.camera);','');
const generated=`import * as T from 'three';import {V,mat,smooth,clamp,stateAt} from './src/visual';import {V5CameraPath,viewOf} from './src/V5CameraPath';
export {V5CameraPath,viewOf,stateAt,smooth};export {V5CardioDetail} from './src/V5CardioDetail';export {V5Person} from './src/V5Person';export {V5Atrium} from './src/V5Atrium';
const closer=(d:number,near:number,far:number)=>1-smooth(Math.log(Math.max(d,1e-12)/near)/Math.log(far/near));${helper}export {anteriorInterior};
export class Audit {weightFrame=-1;weightCache=new Map();weights={};camera=new T.PerspectiveCamera(34,1920/1080);constructor(public anchors:any,public tl:any,public cameraPath:any){}${viewWeight}${prefix}
return {frame:s.frame,clip:s.clip.id,d,personWeight,personOptical,anatomy,mealRenderWeight,actionWeight,measurementWeight,seatedWeight:mealRenderWeight>0?mealRenderWeight:undefined,action,personActions,adiposity,oldAlpha:Math.max(personWeight,.12*anatomy)*personOptical,newAlpha:personWeight*personOptical};}}
`;
const bundle=await build({stdin:{contents:generated,resolveDir:process.cwd(),sourcefile:'wardrobe-impact-memory.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,external:['three']});
const compiled=path.resolve(out,'wardrobe-impact-compiled.mjs');
fs.writeFileSync(compiled,bundle.outputFiles[0].text);
const m=await import(pathToFileURL(compiled).href);
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
async function load(p){const b=fs.readFileSync(p);const g=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');g.scene.updateMatrixWorld(true);return g.scene;}
const [thigh,kidney,body,heart]=await Promise.all(['thighMuscles','leftKidney','body','heart'].map(name=>load(`public/models/${name}.glb`)));
const recorded=read('research/revision-v5/camera-audit/metrics.json').anchors;
const anchors=Object.fromEntries(Object.entries(recorded).map(([k,a])=>[k,V(...a)]));
const manifest=read('public/models/manifest.json');
for(const [name,data] of Object.entries(manifest.assets))anchors[name]=V(...data.center);
const person=new m.V5Person(body);Object.assign(anchors,person.anchors);
const rectus=thigh.getObjectByName('FJ1433M_Left_rectus_femoris');
anchors.muscle=m.anteriorInterior(rectus,new T.Box3().setFromObject(rectus).getCenter(V()),.004);
anchors.muscleCell=anchors.muscle.clone();
anchors.nephron=m.anteriorInterior(kidney,anchors.leftKidney.clone().add(V(.021,.012,0)),.0025);
const detail=new m.V5CardioDetail(),routes=read('public/models/anatomical-routes.json');
const route=routes.routes.find(r=>r.id==='descending_aorta'),arterialPoint=V(...route.points[Math.floor(route.points.length*.55)]);
detail.arteryRoot.position.copy(arterialPoint);detail.arteryRoot.rotation.z=-Math.PI/2;
detail.arterioleRoot.position.copy(arterialPoint).add(V(.014,-.004,.003));
detail.lipidRoot.position.copy(anchors.liver).add(V(.028,.009,.015));
detail.nephronRoot.position.copy(anchors.nephron);detail.root.updateMatrixWorld(true);Object.assign(anchors,detail.getAnchors());
detail.lipidWallRoot.position.copy(anchors.foamCell).add(V(0,0,20e-6));detail.root.updateMatrixWorld(true);Object.assign(anchors,detail.getAnchors());
anchors.clotDetail=anchors.thrombus.clone();anchors.kidney=anchors.leftKidney.clone();
Object.assign(anchors,new m.V5Atrium(heart).getAnchors());
const timeline=read('src/timeline.json'),cameraPath=new m.V5CameraPath(anchors,timeline),audit=new m.Audit(anchors,timeline,cameraPath);
const conservative=new T.Box3(V(-.30,.05,-.30),V(.30,1.10,.70));
const tightStanding=new T.Box3(V(-.24,.44,-.20),V(.24,1.04,.28));
const frustum=new T.Frustum(),projection=new T.Matrix4();
const all=[],alpha=[],renderedAlpha=[],inFrustum=[],tightFrustum=[];
for(let frame=0;frame<timeline.duration;frame++){
 const q=audit.update(m.stateAt(frame,timeline));
 q.alphaDelta=q.oldAlpha-q.newAlpha;
 q.oldVisible=q.oldAlpha>1e-5;q.newVisible=q.newAlpha>1e-5;
 projection.multiplyMatrices(audit.camera.projectionMatrix,audit.camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
 q.conservativeBBoxInFrustum=frustum.intersectsBox(conservative);q.tightBBoxInFrustum=frustum.intersectsBox(tightStanding);
 all.push(q);
 if(q.alphaDelta>1e-12)alpha.push(frame);
 if(q.alphaDelta>1e-12&&(q.oldVisible||q.newVisible)){
  renderedAlpha.push(frame);
  if(q.conservativeBBoxInFrustum)inFrustum.push(frame);
  if(q.tightBBoxInFrustum)tightFrustum.push(frame);
 }
}
function ranges(frames){const result=[];for(const frame of frames){const last=result.at(-1);if(last&&frame===last[1]+1)last[1]=frame;else result.push([frame,frame]);}return result;}
function padMerge(input,pad=60,gap=90){const result=[];for(const [a,b] of input){const start=Math.max(0,a-pad),end=Math.min(timeline.duration-1,b+pad),last=result.at(-1);if(last&&start<=last[1]+gap)last[1]=Math.max(last[1],end);else result.push([start,end]);}return result;}
const alphaRanges=ranges(alpha),visibleRanges=ranges(renderedAlpha),frustumRanges=ranges(inFrustum),tightRanges=ranges(tightFrustum);
const union=[...alpha,...Array.from({length:1545-1009+1},(_,i)=>1009+i)].sort((a,b)=>a-b).filter((v,i,a)=>!i||v!==a[i-1]);
const safeRanges=padMerge(ranges(union));
const samples=[565,680,857,1009,1137,1244,1314,1385,1440,1545,1661,...visibleRanges.flatMap(([a,b])=>[a,Math.floor((a+b)/2),b])].filter((f,i,a)=>a.indexOf(f)===i).sort((a,b)=>a-b).map(f=>all[f]);
const poseBounds=[];
for(const f of visibleRanges.flatMap(([a,b])=>[a,Math.floor((a+b)/2),b])){
 const q=all[f];person.update({time:f/timeline.fps,action:q.action,actionWeights:q.personActions,adiposity:q.adiposity,weight:1,seatedWeight:q.seatedWeight,measurementWeight:q.measurementWeight,opacity:q.newAlpha,wardrobeOpacity:q.oldAlpha});
 const box=new T.Box3().setFromObject(person.wardrobe);poseBounds.push({frame:f,bounds:[box.min.toArray(),box.max.toArray()],insideConservative:conservative.containsBox(box),insideTight:tightStanding.containsBox(box),measurementPoseNotApplied:q.measurementWeight>1e-6});
}
const result={createdAtUTC:new Date().toISOString(),method:'CPU only; exact current V5World gate prefix and viewWeight executed for every frame, actual current V5CameraPath, real atlas organ centers and reconstructed current procedural anchors. Actual garment geometry sampled at affected-range edges/midpoints; measurement deformation is not simulated here.',sourceSHA256:hashes,sourceStableDuringAudit:locked.every(p=>sha(p)===hashes[p]),timeline:{frames:timeline.duration,fps:timeline.fps},oldWardrobeExpression:'Math.max(personWeight,.12*anatomy)*personOptical',newWardrobeExpression:'personWeight*personOptical',alphaSupportFramesInclusive:alphaRanges,visibleAlphaSupportFramesInclusive:visibleRanges,conservativeBBox:{min:conservative.min.toArray(),max:conservative.max.toArray(),purpose:'Generous union of standing and seated body-attached shorts; includes non-visible space.'},conservativeFrustumImpactFramesInclusive:frustumRanges,tightStandingBBox:{min:tightStanding.min.toArray(),max:tightStanding.max.toArray(),purpose:'Secondary diagnostic only; measurement pose not guaranteed, not valid as sole render guard.'},tightFrustumImpactFramesInclusive:tightRanges,recommendedSafeRenderRangesInclusive:safeRanges,recommendedTotalFrames:safeRanges.reduce((sum,[a,b])=>sum+b-a+1,0),maxAlphaDelta:Math.max(...all.map(q=>q.alphaDelta)),poseBounds,samples,limitations:['Camera-frustum rejection does not rule out cast-shadow changes. Garment meshes have castShadow=true and current Three.js shadow behavior must be assessed before excluding offscreen geometry.','Use full visible-alpha support plus h005 camera support for conservative patch planning; do not silently omit frustum-excluded ranges.','These results do not certify frame aesthetics, transparency ordering, labels, or compositing seams.']};
fs.writeFileSync(`${out}/wardrobe-impact.json`,JSON.stringify(result,null,2));
console.log(JSON.stringify({sourceStableDuringAudit:result.sourceStableDuringAudit,alphaRanges,visibleRanges,frustumRanges,tightRanges,recommendedSafeRenderRangesInclusive:safeRanges,recommendedTotalFrames:result.recommendedTotalFrames,poseBoundsAllInsideConservative:poseBounds.every(q=>q.insideConservative),poseBoundsAllInsideTight:poseBounds.every(q=>q.insideTight),output:`${out}/wardrobe-impact.json`},null,2));
