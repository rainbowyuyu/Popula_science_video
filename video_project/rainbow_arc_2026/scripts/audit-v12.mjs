import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

// Audit the actual V12 entry's V10 world/rail and V12 bridge implementation.
// This deliberately does not invoke check-world.mjs or audit-motion.ts: those
// older scripts import V06 and cannot validate the currently rendered movie.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'research/qa-v12');
fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const errors=[],warnings=[];
const check=(condition,message)=>{if(!condition)errors.push(message);return Boolean(condition);};
const report={version:'V12',createdUTC:new Date().toISOString(),projectRoot:root,
  scope:'Current source contracts, all-frame camera sampling, exact optics, loaded Blender sphere geometry, deterministic world seeks, and actual bridge source-frame mapping. This is not a subjective visual review, a GPU shader test, or an audio listening check.',
  implementation:{entry:'src/index.tsx',film:'src/V11RainbowArcFilm.tsx',world:'src/WorldV10.ts',camera:'src/CinematicRouteV10.ts',bridge:'src/RealityBridgeV11.tsx'},errors,warnings};
const built=await build({stdin:{contents:`export * from './src/Timeline';export * from './src/CinematicRouteV10';export * from './src/WorldV10';export * from './src/optics';export * from './src/RealityBridgeV11';export * from './src/V11RainbowArcFilm';`,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,outfile:path.join(out,'active-runtime-v12.mjs')});
report.sourceHashes=Object.keys(built.metafile.inputs).filter(p=>!p.startsWith('<')).map(p=>path.isAbsolute(p)?p:path.join(root,p)).filter(p=>fs.existsSync(p)).map(p=>({file:path.relative(root,p).replaceAll('\\','/'),sha256:sha(fs.readFileSync(p))}));
for(const p of ['src/index.tsx','src/V11RainbowArcFilm.tsx','scripts/render-v12.mjs','scripts/finalize-audio-v12.mjs'])report.sourceHashes.push({file:p,sha256:sha(fs.readFileSync(path.join(root,p)))});
const m=await import(pathToFileURL(path.join(out,'active-runtime-v12.mjs')).href+'?audit='+Date.now());
const source=JSON.parse(read('src/timeline.json'));
const {timeline,stateAt,sampleFilmCamera,filmCameraKeys,WorldV10,HERO}=m;
check(read(report.implementation.entry).includes('V11RainbowArcFilm'),'Active entry does not reference the audited film');
const film=read(report.implementation.film);
for(const name of ['WorldV10','CinematicRouteV10','RealityBridgeV11'])check(film.includes(name),'Film no longer imports audited implementation '+name);
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
if(report.timeline.maxCaptionCharacters>24)warnings.push('Some caption rows exceed 24 characters; typography/line wrapping needs visual review.');

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
}
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
report.world={sampledFrames:frames.length,invalidTransforms,loadedGLB:glbPath,glbSHA256:sha(buffer),glbVertexCount:positions.count,glbRadiusRange:[Math.min(...radii),Math.max(...radii)],maxSurfaceAlignmentResidual,minMicroCameraClearance,seekChecks,contactChecks,sceneDiagnostics:worldDiagnostics,rendererAssetsExcluded:['HDR lighting, loaded environment and fish assets, WaterPro reflective pass, GPU shaders']};
world.dispose();

const bridges=m.bridgesV11;
check(typeof m.bridgeLayersAtV12==='function','The bridge does not export its real V12 source-frame sampling function');
const bridgeReport=[];
for(const b of bridges){
  const dir=path.join(root,'public',b.framePath),files=Array.from({length:b.frames},(_,i)=>path.join(dir,`frame_${String(i+1).padStart(4,'0')}.jpg`)),missing=files.filter(p=>!fs.existsSync(p));
  check(missing.length===0,'Missing Qwen source frames for '+b.id);
  const hashes=files.filter(p=>fs.existsSync(p)).map(p=>sha(fs.readFileSync(p)));
  const duplicates=hashes.flatMap((h,i)=>i&&h===hashes[i-1]?[i]:[]);
  check(duplicates.length===0,'Qwen source has duplicate adjacent frames for '+b.id);
  const provenancePath=path.join(dir,'..','provenance.json');
  check(fs.existsSync(provenancePath),'Missing Qwen provenance for '+b.id);
  const provenance=fs.existsSync(provenancePath)?JSON.parse(fs.readFileSync(provenancePath,'utf8')):{};
  check(provenance.taskId===b.taskId,'Qwen task ID/provenance mismatch for '+b.id);
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
  if(b.id==='opening_mist')check(mapped[0]?.frame===0&&mapped[0]?.alpha===1,'Opening does not directly show its first Qwen frame');
  bridgeReport.push({id:b.id,taskId:b.taskId,model:provenance.model,nativeFrames:b.frames,missingSourceFiles:missing.length,adjacentSourceDuplicates:duplicates,scheduledFrames:mapped.length,first:mapped[0],last:mapped.at(-1),nonMonotonicFrames:nonMonotonic,sourceSkipFrames:sourceSkips,sourceSequenceHash:sha(hashes.join('\n')),sourceRange:mapped.length?[mapped[0].frame,mapped.at(-1).frame]:null});
}
report.qwen=bridgeReport;

const staticAssets=[...new Set(report.sourceHashes.filter(x=>/\.tsx?$/.test(x.file)).flatMap(x=>[...read(x.file).matchAll(/staticFile\(['"]([^'"]+)['"]\)/g)].map(x=>x[1])))];
const missingStaticAssets=staticAssets.filter(p=>!fs.existsSync(path.join(root,'public',p)));
check(missingStaticAssets.length===0,'Missing film static assets: '+missingStaticAssets.join(', '));
const missingAudio=source.clips.filter(c=>c.audio&&!fs.existsSync(path.join(root,c.audio))).map(c=>c.id);
const audioHashMismatch=source.clips.filter(c=>c.audioSHA256&&fs.existsSync(path.join(root,c.audio))&&sha(fs.readFileSync(path.join(root,c.audio)))!==c.audioSHA256).map(c=>c.id);
check(missingAudio.length===0,'Missing source narration audio');
check(audioHashMismatch.length===0,'Narration audio hash differs from timeline provenance');
report.assets={staticAssetsChecked:staticAssets.length,missingStaticAssets,narrationFilesChecked:source.clips.filter(c=>c.audio).length,missingAudio,audioHashMismatch};
report.passed=errors.length===0;
fs.writeFileSync(path.join(out,'audit-v12.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'audit-v12.md'),`# V12 source audit\n\nStatus: ${report.passed?'PASS':'FAIL'}\n\n${report.scope}\n\n- Timeline: ${timeline.duration} frames at ${timeline.fps} fps.\n- Camera: ${timeline.duration} samples, peak translation ${maxTranslation.toFixed(5)} units/frame at ${translationFrame}, peak rotation ${maxRotation.toFixed(5)} degrees/frame at ${rotationFrame}.\n- Optics: ${optics.validPaths} paths, maximum residual ${optics.maxResidual}.\n- World: ${frames.length} sampled frames with the actual Blender geometry.\n- Qwen: ${bridgeReport.length} accepted source clips; source frames checked against the rendering sampler.\n\n${errors.length?'Errors:\n\n'+errors.map(x=>'- '+x).join('\n')+'\n\n':''}${warnings.length?'Review notes:\n\n'+warnings.map(x=>'- '+x).join('\n')+'\n\n':''}Source hashes and exact metrics: audit-v12.json.\n`);
console.log(JSON.stringify({passed:report.passed,errors,warnings,camera:{maxTranslationPerFrame:maxTranslation,translationPeakFrame:translationFrame,maxRotationDegreesPerFrame:maxRotation,rotationPeakFrame:rotationFrame},optics:{validPaths:optics.validPaths,maxResidual:optics.maxResidual},world:{sampledFrames:frames.length,maxSurfaceAlignmentResidual,seekChecks},qwen:bridgeReport.map(x=>({id:x.id,scheduledFrames:x.scheduledFrames,sourceRange:x.sourceRange})),report:path.join(out,'audit-v12.json')},null,2));
if(!report.passed)process.exitCode=1;
