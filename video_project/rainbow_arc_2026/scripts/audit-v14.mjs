import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

// Audit the actual V14 entry's current world/rail, titles and preserved bridge.
// This deliberately does not invoke check-world.mjs or audit-motion.ts: those
// older scripts import V06 and cannot validate the currently rendered movie.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'research/qa-v14');
fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const errors=[],warnings=[];
const auxiliaryInputHashes=[];
const check=(condition,message)=>{if(!condition)errors.push(message);return Boolean(condition);};
const report={version:'V14',createdUTC:new Date().toISOString(),projectRoot:root,
  scope:'Current source contracts, all-frame camera sampling, exact optics, loaded Blender sphere geometry, deterministic world seeks, and actual bridge source-frame mapping. This is not a subjective visual review, a GPU shader test, or an audio listening check.',
  implementation:{entry:'src/index.tsx',film:'src/V11RainbowArcFilm.tsx',world:'src/WorldV10.ts',camera:'src/CinematicRouteV10.ts',bridge:'src/RealityBridgeV11.tsx',titles:'src/TitlesV13.tsx',editorial:'src/EditorialOverlayV10.tsx',environment:'public/assets_v13/environment/rain_garden_v13.glb',fish:'src/FishObserverV14.ts',fishAsset:'public/assets_v14/characters/rainbow_fish_v14/rainbow_fish_v14.glb',macro:'src/MacroLookV14.ts',radiance:'src/OpticalRadianceV14.ts',lens:'src/CinematicLensV14.ts',renderer:'scripts/render-v14.mjs',audioFinalizer:'scripts/finalize-audio-v14.mjs'},errors,warnings};
const built=await build({stdin:{contents:`export * from './src/Timeline';export * from './src/CinematicRouteV10';export * from './src/WorldV10';export * from './src/optics';export * from './src/RealityBridgeV11';export * from './src/V11RainbowArcFilm';export * from './src/TitlesV13';export * from './src/FishObserverV14';export * from './src/EditorialOverlayV10';`,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,outfile:path.join(out,'active-runtime-v14.mjs')});
report.sourceHashes=Object.keys(built.metafile.inputs).filter(p=>!p.startsWith('<')).map(p=>path.isAbsolute(p)?p:path.join(root,p)).filter(p=>fs.existsSync(p)).map(p=>({file:path.relative(root,p).replaceAll('\\','/'),sha256:sha(fs.readFileSync(p))}));
for(const p of ['src/index.tsx','src/V11RainbowArcFilm.tsx','scripts/render-v14.mjs','scripts/finalize-audio-v14.mjs','scripts/audit-v14.mjs','scripts/audit-delivery-v14.py'])report.sourceHashes.push({file:p,sha256:sha(fs.readFileSync(path.join(root,p)))});
report.sourceHashes=[...new Map(report.sourceHashes.map(x=>[x.file,x])).values()];
const m=await import(pathToFileURL(path.join(out,'active-runtime-v14.mjs')).href+'?audit='+Date.now());
const source=JSON.parse(read('src/timeline.json'));
const {timeline,stateAt,sampleFilmCamera,filmCameraKeys,WorldV10,HERO}=m;
check(read(report.implementation.entry).includes('V11RainbowArcFilm'),'Active entry does not reference the audited film');
const film=read(report.implementation.film);
for(const name of ['WorldV10','CinematicRouteV10','RealityBridgeV11'])check(film.includes(name),'Film no longer imports audited implementation '+name);
for(const name of ['FishObserverV14','CinematicLensV14','MacroLookV14'])check(film.includes(name),'Film no longer imports audited V14 implementation '+name);
check(film.includes("staticFile('assets_v14/characters/rainbow_fish_v14/rainbow_fish_v14.glb')"),'Film does not load the V14 fish asset');
const worldSource=read(report.implementation.world);
for(const file of ['MacroLookV14','OpticalRadianceV14','RainbowAtmosphereV14'])check(worldSource.includes(`'./${file}'`),'World no longer imports the audited V14 '+file);
const nondeterministicSource=[];
for(const row of report.sourceHashes.filter(x=>/\.tsx?$/.test(x.file)))if(/\b(?:Date\.now|Math\.random|requestAnimationFrame|performance\.now)\s*\(/.test(read(row.file)))nondeterministicSource.push(row.file);
check(nondeterministicSource.length===0,'Frame-driven sources contain realtime/nondeterministic calls: '+nondeterministicSource.join(', '));
report.nondeterministicSource=nondeterministicSource;
for(const name of ['IntroV13','CodaV13'])check(film.includes(`<${name} state={state}`),'Film does not render the retained V13 '+name);
check(!/<(?:Intro|Coda)\s/.test(film),'Film still renders retired local titles');
check(film.includes("staticFile('assets_v13/environment/rain_garden_v13.glb')"),'Film does not load the retained V13 Blender environment');
check(!source.notFinal,'Audio timing remains provisional');
check(timeline.fps===30,'Runtime fps is not 30');
check(Math.abs(timeline.seconds-timeline.duration/timeline.fps)<1/timeline.fps,'Timeline seconds/duration mismatch');
check(timeline.scenes[0]?.start===0&&timeline.scenes.at(-1)?.end===timeline.duration,'Scene coverage misses film start or end');
let mappingMismatch=0,unassigned=0;
for(const [i,s] of timeline.scenes.entries()){
  check(s.end>s.start&&Number.isInteger(s.start)&&Number.isInteger(s.end),'Invalid runtime scene '+s.id);
  if(i)check(s.start===timeline.scenes[i-1].end,'Scene gap/overlap before '+s.id);
}
for(const c of timeline.clips){
  const raw=source.clips.find(x=>x.id===c.id);
  if(c.start!==Math.round(raw.start*timeline.fps)||c.end!==Math.round(raw.end*timeline.fps)||c.duration!==c.end-c.start)mappingMismatch++;
  check(c.end>c.start&&c.start>=0&&c.end<=timeline.duration,'Invalid clip time '+c.id);
  check(timeline.scenes.some(s=>s.id===c.scene),'Unknown scene for clip '+c.id);
}
check(mappingMismatch===0,'Seconds-to-frame mapping differs from Timeline.ts');
for(let f=0;f<timeline.duration;f++)if(!timeline.scenes.some(s=>f>=s.start&&f<s.end)||!stateAt(f).scene)unassigned++;
check(unassigned===0,'Unassigned runtime scene frames');
const invalidCaptions=timeline.captions.filter(c=>!(c.end>c.start&&c.start>=0&&c.end<=timeline.duration));
check(invalidCaptions.length===0,'Invalid caption intervals');
report.timeline={frames:timeline.duration,fps:timeline.fps,seconds:timeline.duration/timeline.fps,scenes:timeline.scenes,clips:timeline.clips.length,captions:timeline.captions.length,mappingMismatch,unassignedFrames:unassigned,maxCaptionCharacters:Math.max(...timeline.captions.map(c=>[...c.text].length)),lastCaptionEnd:timeline.captions.at(-1)?.end};
check(typeof m.captionLinesV10==='function','Current caption line-layout export is missing');
const captionLayouts=timeline.captions.map(c=>({start:c.start,end:c.end,text:c.text,lines:m.captionLinesV10(c.text)}));
check(captionLayouts.every(c=>c.lines.join('')===c.text),'Editorial wrapping changes the authored subtitle text');
check(captionLayouts.every(c=>c.lines.every(l=>[...l].length<=22)),'Subtitle rows exceed 22 glyphs');
check(captionLayouts.filter(c=>[...c.text].length<=22).every(c=>c.lines.length===1),'Short subtitle cue is unnecessarily split');
const editorial=read(report.implementation.editorial);
check(editorial.includes('fontSize:48')&&editorial.includes('width:1080'),'Subtitle typography contract changed; inspect layout');
const refs=timeline.scenes.find(s=>s.id==='references');
check(Boolean(refs)&&Math.abs((refs.end-refs.start)/30-5)<.05,'The references ending is not about five seconds');
const finalCoda=m.codaPoseV13(stateAt(timeline.duration-1));
check(['surface','settle','back'].every(k=>finalCoda[k]===1),'Coda does not reach its stable reading pose');
const labelFrames=[];
report.editorial={captions:captionLayouts.length,maxGlyphs:report.timeline.maxCaptionCharacters,fontSize:48,width:1080,singleLineCues:captionLayouts.filter(c=>c.lines.length===1).length,referencesFrames:refs?.end-refs?.start,finalCoda,labelBoundsChecked:0,labelBoundsFailures:0};

// Match the roll applied by Stage.applyCamera, not only the unbanked sampler.
const actualPose=frame=>{const p=sampleFilmCamera(frame),t=frame/30,bank=.0028*Math.sin(t*.17)+.0014*Math.sin(t*.053+1.2);return {...p,quaternion:p.quaternion.clone().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),bank))};};
check(film.includes('0.0028*Math.sin(t*.17)+0.0014*Math.sin(t*.053+1.2)'),'Stage bank formula changed; update audit to sample it exactly');
let prev,maxTranslation=0,maxRotation=0,maxFovStep=0,maxAcceleration=0,translationFrame=0,rotationFrame=0,invalidCamera=0,minForward=1,lastVelocity;
const cameraBoundarySamples=[];
for(let f=0;f<timeline.duration;f++){
  const s=actualPose(f),pos=new T.Vector3(...s.position),target=new T.Vector3(...s.target),forward=new T.Vector3(0,0,-1).applyQuaternion(s.quaternion);
  if(![...s.position,...s.target,...s.quaternion.toArray(),s.fov].every(Number.isFinite))invalidCamera++;
  minForward=Math.min(minForward,target.clone().sub(pos).normalize().dot(forward));
  check(pos.distanceToSquared(target)>1e-8,'Camera eye equals target at '+f);
  if(prev){
    const velocity=pos.clone().sub(prev.pos),dp=velocity.length(),dr=T.MathUtils.radToDeg(s.quaternion.angleTo(prev.q));
    if(dp>maxTranslation){maxTranslation=dp;translationFrame=f;}
    if(dr>maxRotation){maxRotation=dr;rotationFrame=f;}
    maxFovStep=Math.max(maxFovStep,Math.abs(s.fov-prev.fov));
    if(lastVelocity)maxAcceleration=Math.max(maxAcceleration,velocity.distanceTo(lastVelocity));
    lastVelocity=velocity;
  }
  if(timeline.scenes.some(x=>Math.abs(f-x.start)<=1))cameraBoundarySamples.push({frame:f,scene:s.scene,position:s.position,target:s.target,fov:s.fov});
  prev={pos,q:s.quaternion,fov:s.fov};
}
check(invalidCamera===0,'Camera has invalid coordinates');
check(minForward>.999999,'Camera quaternion does not face its target');
check(maxRotation<5,'Camera rotates more than 5 degrees in one frame');
check(maxTranslation<.75,'Camera translates more than .75 units in one frame');
check(maxFovStep<1.5,'Camera field-of-view jumps more than 1.5 degrees in one frame');
const sortedKeys=[...filmCameraKeys].sort((a,b)=>a.frame-b.frame);
check(sortedKeys.every((k,i,a)=>i===0||k.frame>a[i-1].frame),'Camera keys have duplicate times');
report.camera={sampledFrames:timeline.duration,invalidCoordinates:invalidCamera,minForwardAlignment:minForward,keyCount:filmCameraKeys.length,maxTranslationPerFrame:maxTranslation,maxTranslationUnitsPerSecond:maxTranslation*30,translationPeakFrame:translationFrame,maxRotationDegreesPerFrame:maxRotation,maxRotationDegreesPerSecond:maxRotation*30,rotationPeakFrame:rotationFrame,maxFovStepDegrees:maxFovStep,maxAccelerationUnitsPerFrameSquared:maxAcceleration,boundaries:cameraBoundarySamples};
if(maxTranslation*30>3||maxRotation*30>20)warnings.push('The camera has faster passages than the slow cinematic baseline; inspect the reported peak frames in continuous playback.');

const optics={tolerance:1e-8,validPaths:0,maxResidual:0,extrema:[]};
for(const colour of m.SPECTRUM)for(const order of [1,2]){
  const e=order===1?m.findPrimaryExtremum(colour.refractiveIndex,1024):m.findSecondaryExtremum(colour.refractiveIndex,1024);
  optics.extrema.push({colour:colour.name,wavelengthNm:colour.wavelengthNm,reflections:order,angleDegrees:e.rainbowAngleDeg,impactParameter:e.impactParameter});
  for(let i=1;i<200;i++){
    const p=order===1?m.tracePrimary(.999*i/200,colour.refractiveIndex):m.traceSecondary(.999*i/200,colour.refractiveIndex);
    if(!p)continue;optics.validPaths++;
    optics.maxResidual=Math.max(optics.maxResidual,...Object.values(m.verifyPath(p)));
  }
}
check(optics.maxResidual<optics.tolerance,'Snell/surface/reflection geometry residual exceeds tolerance');
const ext=(name,order)=>optics.extrema.find(x=>x.colour===name&&x.reflections===order).angleDegrees;
check(ext('red',1)>41&&ext('red',1)<43,'Primary red angle is outside about 42 degrees');
check(ext('red',1)>ext('violet',1),'Primary colour order is incorrect');
check(ext('red',2)>ext('red',1)&&ext('red',2)<ext('violet',2),'Secondary angle/colour order is incorrect');
report.optics=optics;

// Match the actual Stage GLB replacement, including its 1.6 scale, before
// checking the world. Testing the procedural sphere alone misses scale bugs.
const world=new WorldV10(undefined,new T.Scene());
const glbPath='public/assets_v08/macro/spherical_raindrop_v08.glb',buffer=fs.readFileSync(path.join(root,glbPath));
const gltf=await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength),'');
let loadedMesh;gltf.scene.traverse(o=>{if(o.isMesh)loadedMesh=o;});
check(Boolean(loadedMesh),'Blender GLB has no mesh');
if(loadedMesh){world.drop.geometry.dispose();world.drop.geometry=loadedMesh.geometry.clone();world.drop.scale.setScalar(1.6);}
const sampleFrames=new Set([0,timeline.duration-1,...timeline.scenes.flatMap(s=>[s.start,s.start+1,s.start+30,s.end-2,s.end-1]),...timeline.clips.flatMap(c=>[c.start,Math.round((c.start+c.end)/2),c.end-1]),...filmCameraKeys.flatMap(k=>[Math.round(k.frame)-1,Math.round(k.frame),Math.round(k.frame)+1])]);
for(let f=0;f<timeline.duration;f+=30)sampleFrames.add(f);
const frames=[...sampleFrames].filter(f=>f>=0&&f<timeline.duration).sort((a,b)=>a-b);
let invalidTransforms=0,maxSurfaceAlignmentResidual=0,minMicroCameraClearance=Infinity;
const worldDiagnostics=[];
const radii=[];const positions=world.drop.geometry.getAttribute('position');
for(let i=0;i<positions.count;i++)radii.push(Math.hypot(positions.getX(i),positions.getY(i),positions.getZ(i)));
const glbRadius=(Math.max(...radii)+Math.min(...radii))/2;
for(const f of frames){
  const s=stateAt(f);world.update(s);world.group.updateMatrixWorld(true);
  world.group.traverse(o=>{if([...o.position.toArray(),...o.scale.toArray(),...o.quaternion.toArray(),...o.matrixWorld.elements].some(x=>!Number.isFinite(x)))invalidTransforms++;});
  const scaledRadius=glbRadius*(world.drop.scale.x+world.drop.scale.y+world.drop.scale.z)/3;
  if(['drop','dispersion','reflection','angle','secondary'].includes(s.scene)){
    maxSurfaceAlignmentResidual=Math.max(maxSurfaceAlignmentResidual,Math.abs(scaledRadius-1.6),Math.abs(world.drop.scale.x-world.drop.scale.y),Math.abs(world.drop.scale.x-world.drop.scale.z));
    const cam=actualPose(f);minMicroCameraClearance=Math.min(minMicroCameraClearance,new T.Vector3(...cam.position).distanceTo(HERO)-scaledRadius);
  }
  if(timeline.scenes.some(x=>x.start===f))worldDiagnostics.push({frame:f,scene:s.scene,dropScale:world.drop.scale.toArray(),effectiveDropRadius:scaledRadius,anchor:world.anchor?{text:world.anchor.text,point:world.anchor.point.toArray()}:null});
  if(world.anchor&&s.scene!=='references'){
    const cam=actualPose(f),view=new T.PerspectiveCamera(cam.fov,1920/1080,.03,400);view.position.set(...cam.position);view.quaternion.copy(cam.quaternion);view.updateMatrixWorld(true);
    const a=world.anchor.point.clone().project(view),p={x:(a.x*.5+.5)*1920,y:(.5-a.y*.5)*1080,text:world.anchor.text,color:world.anchor.color??'#193b43',visible:a.z>-1&&a.z<1&&Math.abs(a.x)<1.15&&Math.abs(a.y)<1.15};
    const l=m.labelLayoutV10(s,p),e=m.labelEnvelope(s,p.text);
    if(p.visible&&e.opacity>.01){report.editorial.labelBoundsChecked++;const valid=[l.x,l.y,l.width,l.height,e.opacity].every(Number.isFinite)&&l.x>=124&&l.x+l.width<=1796.00001&&l.y>=214&&l.y+l.height<=822.00001;if(!valid)report.editorial.labelBoundsFailures++;labelFrames.push({frame:f,text:l.text,opacity:e.opacity,anchor:[p.x,p.y],box:[l.x,l.y,l.width,l.height]});}
  }
}
check(report.editorial.labelBoundsFailures===0,'Current projected labels have non-finite or out-of-bounds layout');
report.editorial.labelSamples=labelFrames;
check(invalidTransforms===0,'Current WorldV10 contains invalid transforms');
check(maxSurfaceAlignmentResidual<.012,'Loaded Blender sphere no longer matches the exact 1.6 optical sphere');
check(minMicroCameraClearance>.03,'Camera enters/crosses the droplet surface during optical shots');
const snapshot=()=>{const a=[];world.group.traverse(o=>{a.push(o.name,o.visible,o.position.toArray(),o.quaternion.toArray(),o.scale.toArray());if(o.isInstancedMesh)a.push(Array.from(o.instanceMatrix.array),o.instanceColor?Array.from(o.instanceColor.array):null);const mats=o.material?(Array.isArray(o.material)?o.material:[o.material]):[];for(const mat of mats)a.push(mat.opacity,mat.transparent,mat.depthWrite,mat.color?.toArray(),Object.fromEntries(Object.entries(mat.uniforms??{}).filter(([,x])=>typeof x.value==='number').map(([k,x])=>[k,x.value])));});return sha(JSON.stringify(a));};
const seekFrames=[timeline.scenes.find(s=>s.id==='drop').start+100,timeline.scenes.find(s=>s.id==='dispersion').start+100,timeline.scenes.find(s=>s.id==='return').start+100];
const seekChecks=[];
for(const f of seekFrames){world.update(stateAt(f));world.group.updateMatrixWorld(true);const before=snapshot();world.update(stateAt(timeline.duration-1));world.update(stateAt(0));world.update(stateAt(f));world.group.updateMatrixWorld(true);seekChecks.push({frame:f,deterministic:before===snapshot()});}
check(seekChecks.every(x=>x.deterministic),'World seek is affected by previous rendered frames');
const contactChecks=[];
// TypeScript's private contacts are plain runtime data here. Read the exact
// integrated cues rather than duplicating the cue offsets in this audit.
for(const contact of world.contact?.contacts??[]){
  const cue=contact.cue,ray=(cue.role==='primary'?world.primary:world.secondary)[0];
  let minArrivalProgress=Infinity;
  for(let f=cue.arrivalFrame-cue.approachFrames;f<=cue.arrivalFrame;f++){
    world.update(stateAt(f));
    minArrivalProgress=Math.min(minArrivalProgress,ray.meshes[cue.pointIndex-1].scale.y);
  }
  check(minArrivalProgress>.99999,'Contact cue precedes the optical reveal at '+cue.arrivalFrame);
  contactChecks.push({role:cue.role,pointIndex:cue.pointIndex,arrivalFrame:cue.arrivalFrame,seconds:cue.arrivalFrame/30,approachFrames:cue.approachFrames,holdFrames:cue.holdFrames,releaseFrames:cue.releaseFrames,minPriorSegmentReveal:minArrivalProgress,patchAlphaAtArrival:contact.patch.material.uniforms.uAlpha.value,point:contact.point.toArray()});
}
check(contactChecks.length===3,'Expected the three integrated one-shot water-interface cues');
report.world={sampledFrames:frames.length,invalidTransforms,loadedGLB:glbPath,glbSHA256:sha(buffer),glbVertexCount:positions.count,glbRadiusRange:[Math.min(...radii),Math.max(...radii)],maxSurfaceAlignmentResidual,minMicroCameraClearance,seekChecks,contactChecks,sceneDiagnostics:worldDiagnostics,rendererAssetsExcluded:['HDR lighting, loaded environment material appearance, WaterPro reflective pass, GPU shaders and subjective fish appearance']};
world.dispose();

// Validate the actual new environment input, while leaving legacy macro,
// Qwen and Lux3D paths untouched. CPU parsing cannot establish final light.
const environmentPath=path.join(root,report.implementation.environment),environmentProvenance=path.join(root,'public/assets_v13/environment/provenance-v13.json');
if(check(fs.existsSync(environmentPath),'V14 environment GLB is missing')){
 const raw=fs.readFileSync(environmentPath),cpuLoader=new GLTFLoader();
 // Keep geometry and hierarchy intact without pretending that Node can
 // render/decode the browser's embedded texture images.
 cpuLoader.register(()=>({name:'AUDIT_GEOMETRY_ONLY',loadMaterial:()=>Promise.resolve(new T.MeshStandardMaterial())}));
 const asset=await cpuLoader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
 let meshes=0,vertices=0,invalid=0,invalidVertices=0;const names=[];asset.scene.updateMatrixWorld(true);asset.scene.traverse(o=>{if(o.isMesh){meshes++;const position=o.geometry.getAttribute('position');vertices+=position?.count??0;if(position)for(let i=0;i<position.count;i++)if(![position.getX(i),position.getY(i),position.getZ(i)].every(Number.isFinite))invalidVertices++;names.push(o.name);if(o.matrixWorld.elements.some(x=>!Number.isFinite(x)))invalid++;}});
 check(meshes>0&&vertices>0&&invalid===0&&invalidVertices===0,'V14 environment has no finite mesh geometry');
 check(fs.existsSync(environmentProvenance),'V14 environment provenance is missing');
 if(fs.existsSync(environmentProvenance))auxiliaryInputHashes.push({file:path.relative(root,environmentProvenance).replaceAll('\\','/'),sha256:sha(fs.readFileSync(environmentProvenance))});
 report.environment={file:report.implementation.environment,sha256:sha(raw),bytes:raw.length,meshes,vertices,invalidTransforms:invalid,invalidVertices,meshNames:names,provenanceSHA256:fs.existsSync(environmentProvenance)?sha(fs.readFileSync(environmentProvenance)):null,scope:'Original GLB parse and finite geometry/hierarchy only, with CPU audit materials substituted. Loaded shader, reflection, scale relation and camera visibility require rendered review.'};
}

// Inspect the actual V14 rig and its actual iris surface, not an arbitrary
// placeholder head centre. CPU materials preserve skin geometry and bones.
const fishAssetPath=path.join(root,report.implementation.fishAsset);
if(check(fs.existsSync(fishAssetPath),'V14 skinned fish GLB is missing')){
 const raw=fs.readFileSync(fishAssetPath),loader=new GLTFLoader();
 loader.register(()=>({name:'AUDIT_FISH_GEOMETRY_ONLY',loadMaterial:()=>Promise.resolve(new T.MeshStandardMaterial())}));
 const asset=await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
 asset.scene.updateMatrixWorld(true);
 const requiredBones=['Root','Head','Jaw','Spine0','Spine1','Spine2','Tail0','Tail1','Tail2','Tail3','PectoralL0','PectoralL1','PectoralR0','PectoralR1','Dorsal','PelvicL0','PelvicL1','PelvicR0','PelvicR1','Anal'];
 const sourceSkins=[],boneNames=[];let invalidWeights=0,invalidJoints=0,maxWeightSumError=0;
 asset.scene.traverse(o=>{if(o.isBone)boneNames.push(o.name);if(o.isSkinnedMesh)sourceSkins.push(o);});
 check(requiredBones.every(n=>boneNames.includes(n)),'V14 fish does not contain the complete required 20-bone skeleton');
 check(sourceSkins.length>0,'V14 fish has no genuinely skinned meshes');
 for(const mesh of sourceSkins){const w=mesh.geometry.getAttribute('skinWeight'),j=mesh.geometry.getAttribute('skinIndex'),p=mesh.geometry.getAttribute('position');
  if(!w||!j||!p||w.count!==p.count||j.count!==p.count){invalidWeights++;continue;}
  for(let i=0;i<w.count;i++){let sum=0;for(let k=0;k<4;k++){const weight=w.getComponent(i,k),joint=j.getComponent(i,k);if(!Number.isFinite(weight)||weight<0)invalidWeights++;if(!Number.isInteger(joint)||joint<0||joint>=mesh.skeleton.bones.length)invalidJoints++;sum+=weight;}maxWeightSumError=Math.max(maxWeightSumError,Math.abs(sum-1));}
 }
 check(invalidWeights===0&&invalidJoints===0&&maxWeightSumError<1e-5,'V14 skin attributes/weights/joint indices are invalid');
 const body=asset.scene.getObjectByName('ContinuousPearlBody'),weights=body?.geometry?.getAttribute('skinWeight');let multi=0;
 if(weights)for(let i=0;i<weights.count;i++)if([0,1,2,3].filter(k=>weights.getComponent(i,k)>1e-5).length>=2)multi++;
 check(Boolean(body?.isSkinnedMesh)&&Boolean(weights)&&multi>weights.count*.6,'V14 fish body lacks continuous multi-bone skin weighting');
 const poles=['L','R'].map(side=>{const mesh=asset.scene.getObjectByName(`EyeIris${side}`);check(Boolean(mesh?.isSkinnedMesh),'V14 fish is missing the actual skinned eye iris '+side);if(!mesh?.isSkinnedMesh)return null;let front=-Infinity,index=0;const p=new T.Vector3();for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);asset.scene.worldToLocal(p);if(p.z>front){front=p.z;index=i;}}return {name:mesh.name,index};}).filter(Boolean);
 const world={observer:new T.Group(),friend:new T.Group(),sprayObserver:new T.Group()};world.observer.position.set(1.6,18,7);world.friend.position.set(-.2,18,7);world.sprayObserver.position.set(-2.1,0,5);
 const groups=Object.values(world),roles=['observer','friend','spray'],parentPositions=groups.map(g=>g.position.toArray());
 const adapter=new m.FishObserverV14(asset.scene,asset.animations).attach(world),skins=groups.map(g=>{const a=[];g.traverse(o=>{if(o.isSkinnedMesh)a.push(o);});return a;});
 check(skins.every(a=>a.length===sourceSkins.length),'Cloned V14 fish loses skinned components');
 check(skins.every(a=>a.every(x=>requiredBones.every(n=>x.skeleton.bones.some(b=>b.name===n)))),'Cloned V14 fish loses required skeleton bones');
 check(skins[0][0].skeleton!==skins[1][0].skeleton&&skins[0][0].skeleton.bones[0]!==skins[1][0].skeleton.bones[0]&&skins[0][0].material!==skins[1][0].material,'V14 roles share mutable skeleton/bones/materials');
 let maxEyeError=0,maxActualLensError=0,maxHoverError=0,maxOneFrameBoneAngle=0,maxOneFrameFigureAngle=0,maxFigureTranslation=0,invalidTransforms=0,minimumActualSkinY=Infinity,bonePeakFrame=0,figurePeakFrame=0,clearanceSampleFrames=0;
 const prior=new Map(),priorFigures=new Map();
 const poseHash=()=>{const a=[];for(const g of groups)g.traverse(o=>a.push(o.name,...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()));return sha(JSON.stringify(a));};
 for(let frame=0;frame<timeline.duration;frame++){
  adapter.update(frame);
  for(let i=0;i<groups.length;i++){const group=groups[i];group.updateMatrixWorld(true);const reference=group.getObjectByName(`optical-eye-reference-${roles[i]}`),hover=group.getObjectByName(`hover-datum-${roles[i]}`);
   if(reference)maxEyeError=Math.max(maxEyeError,group.worldToLocal(reference.getWorldPosition(new T.Vector3())).distanceTo(new T.Vector3(0,1.55,0)));else invalidTransforms++;
   const actual=new T.Vector3();for(const pole of poles){const mesh=group.getObjectByName(pole.name);actual.add(group.worldToLocal(mesh.getVertexPosition(pole.index,new T.Vector3()).applyMatrix4(mesh.matrixWorld)));}actual.multiplyScalar(.5);maxActualLensError=Math.max(maxActualLensError,actual.distanceTo(new T.Vector3(0,1.55,0)));
   if(hover)maxHoverError=Math.max(maxHoverError,Math.abs(group.worldToLocal(hover.getWorldPosition(new T.Vector3())).y-.85));else invalidTransforms++;
   const figure=group.children[0],lastFigure=priorFigures.get(i);if(lastFigure){const angle=lastFigure.q.angleTo(figure.quaternion);if(angle>maxOneFrameFigureAngle){maxOneFrameFigureAngle=angle;figurePeakFrame=frame;}maxFigureTranslation=Math.max(maxFigureTranslation,lastFigure.p.distanceTo(figure.position));}priorFigures.set(i,{q:figure.quaternion.clone(),p:figure.position.clone()});
   group.traverse(o=>{if([...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),...o.matrixWorld.elements].some(x=>!Number.isFinite(x)))invalidTransforms++;if(o.isBone){const key=`${i}/${o.name}`,old=prior.get(key);if(old){const angle=old.angleTo(o.quaternion);if(angle>maxOneFrameBoneAngle){maxOneFrameBoneAngle=angle;bonePeakFrame=frame;}}prior.set(key,o.quaternion.clone());}});
   if(frame%30===0){if(i===0)clearanceSampleFrames++;const inverse=group.matrixWorld.clone().invert(),p=new T.Vector3();for(const mesh of skins[i]){const transform=inverse.clone().multiply(mesh.matrixWorld);for(let k=0;k<mesh.geometry.getAttribute('position').count;k++){mesh.getVertexPosition(k,p).applyMatrix4(transform);minimumActualSkinY=Math.min(minimumActualSkinY,p.y);}}}
  }
 }
 const seekFrames=[0,1,...timeline.scenes.flatMap(s=>[s.start,Math.round((s.start+s.end)/2),s.end-1])],saved=new Map();for(const f of seekFrames){adapter.update(f);saved.set(f,poseHash());}
 const nonSequentialChecks=[];for(const f of [...seekFrames].reverse()){adapter.update(timeline.duration-1);adapter.update(0);adapter.update(f);nonSequentialChecks.push({frame:f,deterministic:saved.get(f)===poseHash()});}
 check(invalidTransforms===0,'V14 rig contains nonfinite/absent optical reference transforms');
 check(maxEyeError<1e-6&&maxActualLensError<1e-5,'V14 light anchor fails to coincide with actual fish iris midpoint');
 check(maxHoverError<1e-6&&minimumActualSkinY>.50,'V14 fish hover datum or skin ground clearance is invalid');
 check(maxOneFrameBoneAngle<.055,'V14 fish skeletal step exceeds inherited 3.2-degree continuity limit');
 check(maxOneFrameFigureAngle<.055&&maxFigureTranslation<.05,'V14 whole-fish heading or position snaps in one frame');
 check(nonSequentialChecks.every(x=>x.deterministic),'V14 fish pose depends on preceding frame/seek order');
 check(JSON.stringify(groups.map(g=>g.position.toArray()))===JSON.stringify(parentPositions),'V14 adapter mutates the optical observer parent translation');
 check(sha(fs.readFileSync(fishAssetPath))===sha(raw),'V14 fish asset changed during audit');
 const provenancePath=path.join(path.dirname(fishAssetPath),'provenance.json');check(fs.existsSync(provenancePath),'V14 fish provenance record is missing');
 if(fs.existsSync(provenancePath))auxiliaryInputHashes.push({file:path.relative(root,provenancePath).replaceAll('\\','/'),sha256:sha(fs.readFileSync(provenancePath))});
 report.character={file:report.implementation.fishAsset,sha256:sha(raw),bytes:raw.length,requiredBones,boneNames,sourceSkinnedMeshes:sourceSkins.length,clones:3,skinnedMeshesPerClone:skins.map(x=>x.length),invalidWeights,invalidJoints,maxWeightSumError,bodyVertices:weights?.count??0,multiBoneBodyVertices:multi,normalization:adapter.normalization,sampledFrames:timeline.duration,invalidTransforms,maxEyeError,maxActualLensError,maxHoverError,minimumActualSkinY,clearanceSampleFrames,maxOneFrameBoneAngleRad:maxOneFrameBoneAngle,bonePeakFrame,maxOneFrameFigureAngleRad:maxOneFrameFigureAngle,figurePeakFrame,maxFigureTranslation,nonSequentialChecks,provenanceSHA256:fs.existsSync(provenancePath)?sha(fs.readFileSync(provenancePath)):null,scope:'Actual skinned GLB attributes, eye-surface anchoring, all-frame numeric pose continuity and reverse/random seek only; not rendered beauty, silhouette readability, biomechanics or human playback.'};
 adapter.dispose();
}

const bridges=m.bridgesV11;
const transitionManifest=JSON.parse(read('src/transitions-v11.json'));
check(transitionManifest.version==='V14'&&transitionManifest.fps===30,'Current bridge manifest is not V14 at native 30 fps');
check(new Set(bridges.map(x=>x.id)).size===bridges.length,'Bridge IDs are duplicated');
check(bridges.length>0,'V14 contains no generated scene bridges');
check(typeof m.bridgeLayersAtV12==='function','The bridge does not export its real V12 source-frame sampling function');
check(typeof m.bridgeStartV11==='function','The bridge does not export its actual nominal-start sampler');
check(bridges.filter(b=>m.bridgeStartV11(b)===0).length===1,'V14 must have exactly one native source bridge at film frame zero');
const bridgeReport=[];
for(const b of bridges){
  const dir=path.join(root,'public',b.framePath),files=Array.from({length:b.frames},(_,i)=>path.join(dir,`frame_${String(i+1).padStart(4,'0')}.jpg`)),missing=files.filter(p=>!fs.existsSync(p));
  check(missing.length===0,'Missing Qwen source frames for '+b.id);
  const hashes=files.filter(p=>fs.existsSync(p)).map(p=>sha(fs.readFileSync(p)));
  files.filter(p=>fs.existsSync(p)).forEach((p,i)=>auxiliaryInputHashes.push({file:path.relative(root,p).replaceAll('\\','/'),sha256:hashes[i]}));
  const duplicates=hashes.flatMap((h,i)=>i&&h===hashes[i-1]?[i]:[]);
  check(duplicates.length===0,'Qwen source has duplicate adjacent frames for '+b.id);
  const provenancePath=path.join(dir,'..','provenance.json');
  check(fs.existsSync(provenancePath),'Missing Qwen provenance for '+b.id);
  const provenance=fs.existsSync(provenancePath)?JSON.parse(fs.readFileSync(provenancePath,'utf8')):{};
  if(fs.existsSync(provenancePath))auxiliaryInputHashes.push({file:path.relative(root,provenancePath).replaceAll('\\','/'),sha256:sha(fs.readFileSync(provenancePath))});
  check(provenance.taskId===b.taskId,'Qwen task ID/provenance mismatch for '+b.id);
  check(provenance.version==='V14'&&provenance.providerStatus==='SUCCEEDED'&&provenance.status==='processed','Qwen provenance is not a completed processed V14 source for '+b.id);
  check(provenance.nativeFrames===b.frames&&provenance.frameCount===b.frames&&provenance.nativeFPS==='30/1'&&provenance.fps===30&&provenance.nativeWidth===1920&&provenance.nativeHeight===1080&&provenance.width===1920&&provenance.height===1080,'Qwen source is not the expected native 1920x1080 30fps sequence for '+b.id);
  check(Array.isArray(provenance.frameHashes)&&provenance.frameHashes.length===hashes.length&&hashes.every((h,i)=>h===provenance.frameHashes[i]),'Qwen frame bytes differ from generation provenance for '+b.id);
  check(provenance.scientificDataGenerated===false,'Qwen provenance improperly declares generated scientific data for '+b.id);
  const acceptancePath=path.join(dir,'..','visual-acceptance.json');
  check(fs.existsSync(acceptancePath),'Qwen source-sample review record is missing for '+b.id);
  const acceptance=fs.existsSync(acceptancePath)?JSON.parse(fs.readFileSync(acceptancePath,'utf8')):{};
  if(fs.existsSync(acceptancePath))auxiliaryInputHashes.push({file:path.relative(root,acceptancePath).replaceAll('\\','/'),sha256:sha(fs.readFileSync(acceptancePath))});
  check(acceptance.version==='V14'&&acceptance.id===b.id&&acceptance.status==='pass'&&acceptance.providerSHA256===provenance.providerSHA256&&acceptance.sourceUnmodified===true&&acceptance.scientificAuthority===false,'Qwen sampled source review does not bind the current source for '+b.id);
  check(b.framePath.startsWith('assets_v14/qwen/'),'V14 film still references a retired Qwen sequence for '+b.id);
  check(Number.isInteger(b.frames)&&b.frames>0,'Invalid bridge native-frame count for '+b.id);
  check(b.transition.enterFrames>0&&b.transition.exitFrames>0&&b.transition.enterFrames<b.frames&&b.transition.exitFrames<b.frames,'Invalid bridge entry/exit duration for '+b.id);
  check(b.transition.focus.every(x=>Number.isFinite(x)&&x>=0&&x<=1),'Bridge focus is outside normalized image bounds for '+b.id);
  const mapped=[];
  if(typeof m.bridgeLayersAtV12==='function')for(let f=0;f<timeline.duration;f++)for(const layer of m.bridgeLayersAtV12(f))if(layer.id===b.id){
    check(Number.isInteger(layer.sourceFrame)&&layer.sourceFrame>=0&&layer.sourceFrame<b.frames,'Bridge references out-of-range source frame '+b.id+' at '+f);
    check(Number.isFinite(layer.alpha)&&layer.alpha>=0&&layer.alpha<=1,'Invalid bridge alpha '+b.id+' at '+f);
    mapped.push({frame:f,sourceFrame:layer.sourceFrame,alpha:layer.alpha});
  }
  const nonMonotonic=mapped.flatMap((x,i)=>i&&x.sourceFrame<=mapped[i-1].sourceFrame?[x.frame]:[]);
  const sourceSkips=mapped.flatMap((x,i)=>i&&x.sourceFrame!==mapped[i-1].sourceFrame+1?[x.frame]:[]);
  check(nonMonotonic.length===0,'Source frames freeze, reverse or replay for '+b.id);
  check(sourceSkips.length===0,'Source frame discontinuity for '+b.id);
  check(mapped.length===b.frames,'Not all native source frames are scheduled exactly once for '+b.id);
  check(mapped[0]?.sourceFrame===0&&mapped.at(-1)?.sourceFrame===b.frames-1,'Bridge omits source endpoints for '+b.id);
  if(m.bridgeStartV11(b)===0)check(mapped[0]?.frame===0&&mapped[0]?.alpha===1,'Opening does not directly show its first Qwen frame');
  bridgeReport.push({id:b.id,taskId:b.taskId,model:provenance.model,nativeFrames:b.frames,missingSourceFiles:missing.length,adjacentSourceDuplicates:duplicates,scheduledFrames:mapped.length,nominalStart:m.bridgeStartV11(b),first:mapped[0],last:mapped.at(-1),nonMonotonicFrames:nonMonotonic,sourceSkipFrames:sourceSkips,sourceSequenceHash:sha(hashes.join('\n')),sourceRange:mapped.length?[mapped[0].frame,mapped.at(-1).frame]:null,sourceSampleReview:{file:path.relative(root,acceptancePath).replaceAll('\\','/'),sha256:fs.existsSync(acceptancePath)?sha(fs.readFileSync(acceptancePath)):null,status:acceptance.status,scope:acceptance.reviewScope,fullNormalSpeedPlaybackChecked:false,compositeSeamReviewApproved:false}});
}
report.qwen=bridgeReport;

const staticAssets=[...new Set(report.sourceHashes.filter(x=>/\.tsx?$/.test(x.file)).flatMap(x=>[...read(x.file).matchAll(/staticFile\(['"]([^'"]+)['"]\)/g)].map(x=>x[1])))];
const missingStaticAssets=staticAssets.filter(p=>!fs.existsSync(path.join(root,'public',p)));
const literalStaticHashes=staticAssets.filter(p=>fs.existsSync(path.join(root,'public',p))&&fs.statSync(path.join(root,'public',p)).isFile()).map(file=>({file:'public/'+file,sha256:sha(fs.readFileSync(path.join(root,'public',file)))}));
const staticAssetHashes=[...new Map([...literalStaticHashes,...auxiliaryInputHashes].map(x=>[x.file,x])).values()];
check(missingStaticAssets.length===0,'Missing film static assets: '+missingStaticAssets.join(', '));
const missingAudio=source.clips.filter(c=>c.audio&&!fs.existsSync(path.join(root,c.audio))).map(c=>c.id);
const audioHashMismatch=source.clips.filter(c=>c.audioSHA256&&fs.existsSync(path.join(root,c.audio))&&sha(fs.readFileSync(path.join(root,c.audio)))!==c.audioSHA256).map(c=>c.id);
check(missingAudio.length===0,'Missing source narration audio');
check(audioHashMismatch.length===0,'Narration audio hash differs from timeline provenance');
report.assets={staticAssetsChecked:staticAssets.length,missingStaticAssets,staticAssetHashes,narrationFilesChecked:source.clips.filter(c=>c.audio).length,missingAudio,audioHashMismatch};
const sourceChangedDuringAudit=report.sourceHashes.filter(x=>!fs.existsSync(path.join(root,x.file))||sha(fs.readFileSync(path.join(root,x.file)))!==x.sha256).map(x=>x.file);
check(sourceChangedDuringAudit.length===0,'Active source changed during this audit: '+sourceChangedDuringAudit.join(', '));
report.sourceChangedDuringAudit=sourceChangedDuringAudit;
const environmentHashAtEnd=staticAssetHashes.find(x=>x.file===report.implementation.environment)?.sha256;
check(!report.environment||environmentHashAtEnd===report.environment.sha256,'Environment input changed during this audit');
const staticInputsChangedDuringAudit=staticAssetHashes.filter(x=>!fs.existsSync(path.join(root,x.file))||sha(fs.readFileSync(path.join(root,x.file)))!==x.sha256).map(x=>x.file);
check(staticInputsChangedDuringAudit.length===0,'Rendered static/frame/provenance inputs changed during this audit: '+staticInputsChangedDuringAudit.join(', '));
report.staticInputsChangedDuringAudit=staticInputsChangedDuringAudit;
report.passed=errors.length===0;
fs.writeFileSync(path.join(out,'audit-v14.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'audit-v14.md'),`# V14 source audit\n\nStatus: ${report.passed?'PASS':'FAIL'}\n\n${report.scope}\n\n- Timeline: ${timeline.duration} frames at ${timeline.fps} fps.\n- Camera: ${timeline.duration} samples, peak translation ${maxTranslation.toFixed(5)} units/frame at ${translationFrame}, peak rotation ${maxRotation.toFixed(5)} degrees/frame at ${rotationFrame}.\n- Optics: ${optics.validPaths} paths, maximum residual ${optics.maxResidual}.\n- World: ${frames.length} sampled frames with the actual Blender geometry.\n- Editorial: ${report.editorial.captions} preserved cues, ${report.editorial.labelBoundsChecked} projected-label samples.\n- Environment: ${report.environment?.meshes??0} parsed meshes.\n- Qwen: ${bridgeReport.length} accepted source clips; source frames checked against the rendering sampler.\n\n${errors.length?'Errors:\n\n'+errors.map(x=>'- '+x).join('\n')+'\n\n':''}${warnings.length?'Review notes:\n\n'+warnings.map(x=>'- '+x).join('\n')+'\n\n':''}Source hashes and exact metrics: audit-v14.json.\n`);
console.log(JSON.stringify({passed:report.passed,errors,warnings,camera:{maxTranslationPerFrame:maxTranslation,translationPeakFrame:translationFrame,maxRotationDegreesPerFrame:maxRotation,rotationPeakFrame:rotationFrame},optics:{validPaths:optics.validPaths,maxResidual:optics.maxResidual},world:{sampledFrames:frames.length,maxSurfaceAlignmentResidual,seekChecks},editorial:{labelBoundsChecked:report.editorial.labelBoundsChecked,labelBoundsFailures:report.editorial.labelBoundsFailures},environment:{meshes:report.environment?.meshes,vertices:report.environment?.vertices},qwen:bridgeReport.map(x=>({id:x.id,scheduledFrames:x.scheduledFrames,sourceRange:x.sourceRange})),report:path.join(out,'audit-v14.json')},null,2));
if(!report.passed)process.exitCode=1;
