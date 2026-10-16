import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {build} from 'esbuild';

// Read-only source audit. Run at project root; writes only its research JSON.
const reportPath='research/revision-v5/anatomical-route-fix/current-final-cpu-audit.json';
const files=['src/V5World.ts','src/V5CameraPath.ts','src/V5Person.ts','src/V5Measure.ts','src/V5CardioDetail.ts','src/V5Mechanisms.ts','src/World.ts','src/visual.ts','src/ScaleContext.ts','src/timeline.json','public/models/thighMuscles.glb','public/models/leftKidney.glb','public/models/manifest.json'];
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const startHashes=Object.fromEntries(files.map(p=>[p,sha(p)]));
const world=fs.readFileSync('src/V5World.ts','utf8');
const helper=world.slice(world.indexOf('function anteriorInterior'),world.indexOf('/** Single atlas-coordinate'));
const viewWeight=world.slice(world.indexOf(' private viewWeight'),world.indexOf(' private contiguousProgress'));
const prefix=world.slice(world.indexOf(' update(s:FrameState){'),world.indexOf('  this.person?.update')).replace('this.handoff.update(s.frame,d,this.camera);','');
const organs=world.slice(world.indexOf('  for(const [name,o] of Object.entries(this.organs))'),world.indexOf('  this.mealScene.update(s.time);'));
const bridge=world.slice(world.indexOf('  const profile=[[0,.16]'),world.indexOf('  this.ready=this.ready.then'));
const generated=`import * as T from 'three'; import {V,mat,smooth,clamp,stateAt} from './src/visual'; import {V5CameraPath,viewOf} from './src/V5CameraPath';
export {V5CameraPath,viewOf,stateAt,smooth}; export {V5CardioDetail} from './src/V5CardioDetail'; export {plasmaContext} from './src/ScaleContext';
const closer=(d:number,near:number,far:number)=>1-smooth(Math.log(Math.max(d,1e-12)/near)/Math.log(far/near)); export {closer};
${helper} export {anteriorInterior};
export class Audit {
 weightFrame=-1;weightCache=new Map();weights={};organs={leftKidney:new T.Group()};handoff={liverOpacity:(a:number)=>a};camera=new T.PerspectiveCamera(34,1920/1080);alpha=0;
 constructor(public anchors:any,public tl:any,public cameraPath:any){}
 setOpacity(o:any,a:number){this.alpha=a;}
 ${viewWeight}
 ${prefix}
 ${organs}
 return {frame:s.frame,clip:s.clip.id,d,focus:pose.focus.toArray(),measurementWeight,personWeight,personOptical,visiblePerson,anatomy,localMicro,nephron,macroExit,outgoingToMacro,kidneyAlpha:this.alpha,kidneyShift:this.organs.leftKidney.position.y,drugFamily,drug,drugBridgeWeight:drugFamily*near('drug',5),plasmaFieldWeight:Math.max(drugFamily*near('drug',5),lipidFamily*near('lipid',5))*closer(d,.004,.030)*(1-closer(d,12e-6,80e-6)),bloodContextWeight:Math.max(drugFamily*near('drug',5),lipidFamily*near('lipid',5))*closer(d,.0003,.006)*(1-closer(d,100e-9,1e-6))}; }
}
export class Bridge {root=new T.Group();plasmaField=new T.Group();drugPlasmaBridge=new T.Group();constructor(){const dummy=new T.Object3D();${bridge}}}
`;
const bundle=await build({stdin:{contents:generated,resolveDir:process.cwd(),sourcefile:'audit-memory.ts',loader:'ts'},bundle:true,platform:'node',format:'esm',write:false,external:['three']});
const url=pathToFileURL(path.resolve('node_modules/three/build/three.module.js')).href;
const code=bundle.outputFiles[0].text.replaceAll('from "three"',`from "${url}"`);
const m=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
async function load(p){const b=fs.readFileSync(p);const gltf=await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'');gltf.scene.updateMatrixWorld(true);return gltf.scene;}
const [thigh,kidney]=await Promise.all([load('public/models/thighMuscles.glb'),load('public/models/leftKidney.glb')]);
const previous=JSON.parse(fs.readFileSync('research/revision-v5/anatomical-route-fix/anchor-and-route-audit.json'));
const recorded=JSON.parse(fs.readFileSync('research/revision-v5/camera-audit/metrics.json')).anchors;
const anchors=Object.fromEntries(Object.entries(recorded).map(([k,a])=>[k,V(...a)]));
anchors.personActivity=V(0,.88,0);
const rectus=thigh.getObjectByName('FJ1433M_Left_rectus_femoris');
anchors.muscle=m.anteriorInterior(rectus,new T.Box3().setFromObject(rectus).getCenter(V()),.004);
anchors.muscleCell=anchors.muscle.clone();
anchors.nephron=m.anteriorInterior(kidney,anchors.leftKidney.clone().add(V(.021,.012,0)),.0025);
const detail=new m.V5CardioDetail();
const routes=JSON.parse(fs.readFileSync('public/models/anatomical-routes.json'));
const route=routes.routes.find(r=>r.id==='descending_aorta');
const arterialPoint=V(...route.points[Math.floor(route.points.length*.55)]);
detail.arteryRoot.position.copy(arterialPoint);detail.arteryRoot.rotation.z=-Math.PI/2;
detail.arterioleRoot.position.copy(arterialPoint).add(V(.014,-.004,.003));
detail.lipidRoot.position.copy(anchors.liver).add(V(.028,.009,.015));
detail.nephronRoot.position.copy(anchors.nephron);detail.root.updateMatrixWorld(true);
Object.assign(anchors,detail.getAnchors());
detail.lipidWallRoot.position.copy(anchors.foamCell).add(V(0,0,20e-6));detail.root.updateMatrixWorld(true);Object.assign(anchors,detail.getAnchors());
anchors.clotDetail=anchors.thrombus.clone();
const timeline=JSON.parse(fs.readFileSync('src/timeline.json'));
const cameraPath=new m.V5CameraPath(anchors,timeline),audit=new m.Audit(anchors,timeline,cameraPath);
const all=[],bad=[];let opticalMax={value:0},maxGateDelta={value:0},maxKidneyDriftInvisible={value:0},prev;
for(let frame=0;frame<timeline.duration;frame++){
 const q=audit.update(m.stateAt(frame,timeline));all.push(q);
 const pose=cameraPath.sample(frame);if(![...pose.position,...pose.target,...pose.focus,pose.distance,pose.az,pose.el,...Object.values(q).filter(x=>typeof x==='number')].every(Number.isFinite))bad.push(frame);
 if(prev){const optical=Math.abs(Math.log(q.d/prev.d))*timeline.fps;if(optical>opticalMax.value)opticalMax={value:optical,frame};const delta=Math.abs(q.visiblePerson-prev.visiblePerson);if(delta>maxGateDelta.value)maxGateDelta={value:delta,frame};}
 if(q.personOptical<.01&&q.kidneyAlpha>.05&&Math.abs(q.kidneyShift)>maxKidneyDriftInvisible.value)maxKidneyDriftInvisible={value:Math.abs(q.kidneyShift),...q};prev=q;
}
const knots=cameraPath.knots;
const invalidIntervals=knots.flatMap((k,i)=>i&&k.frame<=knots[i-1].frame?[{i,frame:k.frame}]:[]);
const samples=frames=>frames.map(f=>all[f]);
const h066=all.filter(q=>q.frame>=18270&&q.frame<=18520);
const h066Active=h066.filter(q=>q.measurementWeight>1e-6);
const boundaryGates=timeline.clips.slice(1).map(c=>{const a=audit.update(m.stateAt(c.start-1e-5,timeline)),b=audit.update(m.stateAt(c.start+1e-5,timeline));return {frame:c.start,from:a.clip,to:b.clip,d:b.d,visiblePersonBefore:a.visiblePerson,visiblePersonAfter:b.visiblePerson,kidneyAlphaBefore:a.kidneyAlpha,kidneyAlphaAfter:b.kidneyAlpha,kidneyAlphaJump:b.kidneyAlpha-a.kidneyAlpha,macroExitBefore:a.macroExit,macroExitAfter:b.macroExit};}).filter(x=>Math.abs(x.kidneyAlphaJump)>1e-6);
const projectedKidneyDrift=[18400,18402,18410,18415,18420,18430,19150,24760].map(frame=>{const q=all[frame];cameraPath.apply(frame,audit.camera);const start=anchors.leftKidney.clone().project(audit.camera),end=anchors.leftKidney.clone().add(V(0,q.kidneyShift,0)).project(audit.camera),gated=anchors.leftKidney.clone().add(V(0,q.kidneyShift*q.personOptical,0)).project(audit.camera);return {frame,d:q.d,personOptical:q.personOptical,visiblePerson:q.visiblePerson,kidneyAlpha:q.kidneyAlpha,currentShiftMetres:q.kidneyShift,currentProjectedDriftPixels:Math.hypot((end.x-start.x)*960,(end.y-start.y)*540),opticallyGatedShiftMetres:q.kidneyShift*q.personOptical,opticallyGatedProjectedDriftPixels:Math.hypot((gated.x-start.x)*960,(gated.y-start.y)*540),fixedAtlasShiftMetres:0};});
const bridgeObjects=new m.Bridge();const rbc=bridgeObjects.drugPlasmaBridge.children[0],proteins=bridgeObjects.drugPlasmaBridge.children[1];
const actualGeometryBounds=geometry=>{geometry.computeBoundingBox();return {min:geometry.boundingBox.min.toArray(),max:geometry.boundingBox.max.toArray(),size:geometry.boundingBox.getSize(V()).toArray()};};
const rbcBounds=actualGeometryBounds(rbc.geometry),proteinBounds=actualGeometryBounds(proteins.geometry);
const blood=m.plasmaContext();
const proteinPositions=[];const matrix=new T.Matrix4(),p=V(),rot=new T.Quaternion(),scale=V();
for(let i=0;i<proteins.count;i++){proteins.getMatrixAt(i,matrix);matrix.decompose(p,rot,scale);proteinPositions.push({position:p.toArray(),scale:scale.toArray()});}
const nanoranges=proteinPositions.map(x=>Math.hypot(x.position[0],x.position[1]));
function projected(root,camera,worldOrigin){
 root.position.copy(worldOrigin);root.updateMatrixWorld(true);const items=[];root.traverse(node=>{if(!(node instanceof T.Mesh))return;const positions=node.geometry.getAttribute('position');
 for(let instance=0;instance<(node.isInstancedMesh?node.count:1);instance++){
  const xform=node.matrixWorld.clone();if(node.isInstancedMesh){node.getMatrixAt(instance,matrix);xform.multiply(matrix);}
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity,front=false;
  for(let j=0;j<positions.count;j++){p.fromBufferAttribute(positions,j).applyMatrix4(xform).project(camera);if(p.z>=-1&&p.z<=1){front=true;minX=Math.min(minX,p.x);maxX=Math.max(maxX,p.x);minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}}
  if(front&&minX<1&&maxX>-1&&minY<1&&maxY>-1)items.push({widthPixels:(maxX-minX)*960,heightPixels:(maxY-minY)*540});
 }});return {countIntersectingViewportBounds:items.length,maxWidthPixels:Math.max(0,...items.map(x=>x.widthPixels)),maxHeightPixels:Math.max(0,...items.map(x=>x.heightPixels)),countAtLeastOnePixel:items.filter(x=>Math.max(x.widthPixels,x.heightPixels)>=1).length,countAtLeastTwoPixels:items.filter(x=>Math.max(x.widthPixels,x.heightPixels)>=2).length};
}
const drugGate=(d,k)=>({rbc:k*m.closer(d,35e-6,180e-6)*(1-m.closer(d,2e-6,10e-6)),proteins:k*m.closer(d,3e-6,20e-6)*(1-m.closer(d,40e-9,120e-9))});
const targetDistances=[180e-6,80e-6,35e-6,20e-6,10e-6,6e-6,3e-6,1e-6,500e-9,150e-9,120e-9,80e-9,40e-9,24e-9];
const drugApproach=all.filter(q=>q.frame>=6900&&q.frame<=7260&&q.drugBridgeWeight>.01);
const drugSamples=targetDistances.map(d=>drugApproach.reduce((a,b)=>Math.abs(Math.log(b.d/d))<Math.abs(Math.log(a.d/d))?b:a));
const drugProjection=drugSamples.map(q=>{cameraPath.apply(q.frame,audit.camera);const single=new T.Group();single.add(rbc.clone());const proteinGroup=new T.Group();proteinGroup.add(proteins.clone());return {...q,gate:drugGate(q.d,q.drugBridgeWeight),rbc:projected(single,audit.camera,anchors.drug),proteins:projected(proteinGroup,audit.camera,anchors.drug),existingBloodContext:projected(blood,audit.camera,anchors.drug),existingPlasmaField:projected(bridgeObjects.plasmaField,audit.camera,anchors.drug)};});
const endHashes=Object.fromEntries(files.map(p=>[p,sha(p)]));
const report={auditedAtUTC:new Date().toISOString(),method:'CPU only. In-memory esbuild compiles exact current camera module, current V5World anteriorInterior, viewWeight, gate prefix and organ-alpha loop; source/public files are never written. Local atlas triangles are decoded using GLTFLoader. Projection is bounding-box candidate visibility only, with no rasterization, lighting, occlusion, text or perceptual validation.',sourceSHA256:startHashes,sourceStableDuringAudit:files.every(p=>startHashes[p]===endHashes[p]),changedDuringAudit:files.filter(p=>startHashes[p]!==endHashes[p]),anchorProvenance:'Unchanged static anchors inherit previously CPU cross-checked metrics; personActivity restored to its constructor coordinate. Muscle and kidney anchors recomputed from current actual helper and GLBs, cardio anchors recomputed from current procedural geometry and aortic route.',anchors:{muscle:anchors.muscle.toArray(),nephron:anchors.nephron.toArray(),muscleMatchesPrior:anchors.muscle.distanceTo(V(...previous.anchors.muscle.current.point))<1e-12,nephronMatchesPrior:anchors.nephron.distanceTo(V(...previous.anchors.nephron.current.point))<1e-12,priorGeometryReport:'anchor-and-route-audit.json'},camera:{framesSampled:timeline.duration,fps:timeline.fps,finite:bad.length===0,invalidFrames:bad,nonpositiveKnotIntervals:invalidIntervals,maxLogDistanceSpeedPerSecond:opticalMax,maxVisiblePersonOneFrameDelta:maxGateDelta,h066Knots:knots.filter(k=>k.frame>18200&&k.frame<18700).map(k=>({...k,focus:k.focus.toArray()})),separateMicroSitePanSegments:knots.flatMap((k,i)=>{if(!i)return[];const a=knots[i-1],shift=a.focus.distanceTo(k.focus);return shift>.02&&Math.abs(k.distance-a.distance)<1e-9&&k.distance<.6?[{start:a.frame,end:k.frame,shiftMetres:shift,distanceMetres:k.distance,ratioDistanceToShift:k.distance/shift}]:[]})},measurementGates:{h066FirstNonzeroMeasurement:h066Active[0],h066MinimumPersonOpticalWhileMeasurementActive:Math.min(...h066Active.map(q=>q.personOptical)),samples:samples([18286,18300,18340,18360,18378,18385,18400,18430,18460,18487,18510,19050,19081,19100,19150,23991,24000,24060,24096,24680,24700,24760]),maximumOrganShiftWhilePersonOpticalBelowOnePercentAndKidneyAlphaAboveFivePercent:maxKidneyDriftInvisible},plasmaBridge:{rbc:{name:rbc.name,localPosition:rbc.position.toArray(),localScale:rbc.scale.toArray(),geometryBounds:rbcBounds,baseOpacity:rbc.material.opacity},proteins:{name:proteins.name,count:proteins.count,geometryBounds:proteinBounds,baseOpacity:proteins.material.opacity,minPlanarRadiusMetres:Math.min(...nanoranges),maxPlanarRadiusMetres:Math.max(...nanoranges),instanceScaleMin:Math.min(...proteinPositions.flatMap(x=>x.scale)),instanceScaleMax:Math.max(...proteinPositions.flatMap(x=>x.scale))},projectionSamples:drugProjection,projectionLimitations:'Counts use projected triangle-vertex bounding boxes, including offscreen partial objects. They do not establish useful visibility or absence of transparent sorting artifacts. Existing RBC contexts are included for overlap assessment.'},visualPassed:false,limitations:['No browser, WebGL, GPU, renderer, source edits or public edits.','CPU gate continuity is not raster/perceptual continuity.','Current-final report does not re-audit dynamic clothing or cuff deformation.','Source stability check detects edits during this run; later source edits invalidate corresponding claims.']};
report.measurementGates.projectedKidneyDrift=projectedKidneyDrift;
report.camera.clipBoundaryKidneyAlphaJumps=boundaryGates;
report.camera.lateralPanSegmentsUnder0_6Metres=report.camera.separateMicroSitePanSegments;
delete report.camera.separateMicroSitePanSegments;
report.anchors.previousGeometryProofStillApplicable={muscleSamePoint:report.anchors.muscleMatchesPrior,nephronSamePoint:report.anchors.nephronMatchesPrior,thighModelUnchanged:startHashes['public/models/thighMuscles.glb']===previous.modelSHA256['public/models/thighMuscles.glb'],kidneyModelUnchanged:startHashes['public/models/leftKidney.glb']===previous.modelSHA256['public/models/leftKidney.glb'],muscleDetailSourceUnchanged:startHashes['src/V5Mechanisms.ts']===previous.sourceSHA256['src/V5Mechanisms.ts'],renalDetailSourceUnchanged:startHashes['src/V5CardioDetail.ts']===previous.sourceSHA256['src/V5CardioDetail.ts'],priorMuscleInsideAllSevenRays:previous.anchors.muscle.current.insideAllRays,priorKidneyInsideAllSevenRays:previous.anchors.nephron.current.insideAllRays,priorNephronConservativeContainmentMarginMetres:previous.anchors.nephron.contextEnvelope.sphericalContainmentMarginMetres};
report.findings=maxKidneyDriftInvisible.value>.001?[{id:'organ-pre-roll-drift',severity:'P2',status:'reported to parent for fix',file:'src/V5World.ts',evidence:maxKidneyDriftInvisible,recommendation:'Keep atlas organs at fixed standing coordinates, consistent with fixed camera and teaching anchors. Multiplying the shift by personOptical alone retains residual projected drift during its ramp.',visualVerificationRequired:true}]:[];
const largeBoundaryJumps=boundaryGates.filter(x=>Math.abs(x.kidneyAlphaJump)>.03);
if(largeBoundaryJumps.length)report.findings.push({id:'macro-exit-boundary-opacity-reset',severity:'P2',status:'reported to parent for fix',file:'src/V5World.ts',evidence:largeBoundaryJumps,recommendation:'Use continuous visiblePerson to control extra organ dimming rather than the current-clip outgoingToMacro branch, which resets macroExit at the next clip.',visualVerificationRequired:true});
report.cpuChecks={cameraNumericallyFinite:bad.length===0,positiveKnotIntervals:invalidIntervals.length===0,fixedOrganCoordinates:maxKidneyDriftInvisible.value===0,noLargeKidneyAlphaBoundaryJump:largeBoundaryJumps.length===0};
fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({reportPath,stable:report.sourceStableDuringAudit,changed:report.changedDuringAudit,camera:report.camera,measurement:report.measurementGates,plasma:report.plasmaBridge.projectionSamples.map(q=>({frame:q.frame,d:q.d,gate:q.gate,rbc:q.rbc,proteins:q.proteins,blood:q.existingBloodContext,plasma:q.existingPlasmaField}))},null,2));
