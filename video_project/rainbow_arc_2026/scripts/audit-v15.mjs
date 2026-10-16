import {build} from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';

// Audit the actual V15 entry's current world/rail, titles and preserved bridge.
// This deliberately does not invoke check-world.mjs or audit-motion.ts: those
// older scripts import V06 and cannot validate the currently rendered movie.
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const diagnostic=process.argv.includes('--diagnostic');
const out=path.join(root,'research/qa-v15',...(diagnostic?['diagnostic']:[]));
fs.mkdirSync(out,{recursive:true});
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const errors=[],warnings=[];
const auxiliaryInputHashes=[];
const check=(condition,message)=>{if(!condition)errors.push(message);return Boolean(condition);};
const report={version:'V15',diagnosticOnly:diagnostic,createdUTC:new Date().toISOString(),projectRoot:root,
  scope:'Current source contracts, all-frame camera sampling, exact optics, loaded Blender sphere geometry, deterministic world seeks, and actual bridge source-frame mapping. This is not a subjective visual review, a GPU shader test, or an audio listening check.',
  implementation:{entry:'src/index.tsx',film:'src/V11RainbowArcFilm.tsx',world:'src/WorldV10.ts',camera:'src/CinematicRouteV10.ts',bridge:'src/RealityBridgeV11.tsx',titles:'src/TitlesV15.tsx',editorial:'src/EditorialOverlayV10.tsx',environment:'public/assets_v15/environment/rain_garden_v15.glb',fish:'src/FishObserverV15.ts',fishAsset:'public/assets_v15/characters/rainbow_fish_v15/rainbow_fish_v15.glb',macro:'src/MacroLookV15.ts',radiance:'src/OpticalRadianceV15.ts',lens:'src/CinematicLensV15.ts',renderer:'scripts/render-v15.mjs',audioFinalizer:'scripts/finalize-audio-v15.mjs'},errors,warnings};
const built=await build({stdin:{contents:`export * from './src/Timeline';export * from './src/CinematicRouteV10';export * from './src/WorldV10';export * from './src/optics';export * from './src/RealityBridgeV11';export * from './src/V11RainbowArcFilm';export * from './src/TitlesV15';export * from './src/FishObserverV15';export * from './src/EditorialOverlayV10';export * from './src/GaussianSceneV15';export * from './src/GaussianDropletV15';export * from './src/CinematicLensV15';`,resolveDir:root,loader:'ts'},bundle:true,platform:'node',format:'esm',packages:'external',metafile:true,outfile:path.join(out,'active-runtime-v15.mjs')});
report.sourceHashes=Object.keys(built.metafile.inputs).filter(p=>!p.startsWith('<')).map(p=>path.isAbsolute(p)?p:path.join(root,p)).filter(p=>fs.existsSync(p)).map(p=>({file:path.relative(root,p).replaceAll('\\','/'),sha256:sha(fs.readFileSync(p))}));
for(const p of ['src/index.tsx','src/V11RainbowArcFilm.tsx','scripts/render-v15.mjs','scripts/finalize-audio-v15.mjs','scripts/audit-v15.mjs','scripts/audit-delivery-v15.py','scripts/package-v15.py'])report.sourceHashes.push({file:p,sha256:sha(fs.readFileSync(path.join(root,p)))});
report.sourceHashes=[...new Map(report.sourceHashes.map(x=>[x.file,x])).values()];
const m=await import(pathToFileURL(path.join(out,'active-runtime-v15.mjs')).href+'?audit='+Date.now());
const source=JSON.parse(read('src/timeline.json'));
const {timeline,stateAt,sampleFilmCamera,filmCameraKeys,WorldV10,HERO}=m;
check(read(report.implementation.entry).includes('V11RainbowArcFilm'),'Active entry does not reference the audited film');
const film=read(report.implementation.film);
for(const name of ['WorldV10','CinematicRouteV10','RealityBridgeV11'])check(film.includes(name),'Film no longer imports audited implementation '+name);
for(const name of ['FishObserverV15','CinematicLensV15','MacroLookV15','GaussianSceneV15','GaussianDropletV15','CupDetailV15'])check(film.includes(name),'Film no longer imports audited V15 implementation '+name);
check(film.includes("staticFile('assets_v15/characters/rainbow_fish_v15/rainbow_fish_v15.glb')"),'Film does not load the V15 fish asset');
const worldSource=read(report.implementation.world);
for(const file of ['MacroLookV15','OpticalRadianceV15','RainbowAtmosphereV15'])check(worldSource.includes(`'./${file}'`),'World no longer imports the audited V15 '+file);
const nondeterministicSource=[];
for(const row of report.sourceHashes.filter(x=>/\.tsx?$/.test(x.file)))if(/\b(?:Date\.now|Math\.random|requestAnimationFrame|performance\.now)\s*\(/.test(read(row.file)))nondeterministicSource.push(row.file);
check(nondeterministicSource.length===0,'Frame-driven sources contain realtime/nondeterministic calls: '+nondeterministicSource.join(', '));
report.nondeterministicSource=nondeterministicSource;
for(const name of ['IntroV15','CodaV15'])check(film.includes(`<${name} state={state}`),'Film does not render the new V15 '+name);
check(!/<(?:Intro|Coda)\s/.test(film),'Film still renders retired local titles');
check(film.includes("staticFile('assets_v15/environment/rain_garden_v15.glb')"),'Film does not load the new V15 Blender environment');
// Audit the actual two-complete-image handoff, rather than treating a
// partially opaque depth-writing mesh as a valid continuous transition.
// CPU doubles verify orchestration/state restoration, not GPU beauty.
const compactFilm=film.replace(/\s+/g,'');
check(compactFilm.includes('constgs=ease((frame-410)/40)*(1-ease((frame-732)/66));'),'Garden handoff weight no longer follows the audited continuous absolute-frame curve');
check(compactFilm.includes('opacity:gs>1e-7?1:0'),'Garden splat opacity must remain complete in its render branch');
check(compactFilm.includes('constprepareMesh=()=>{r.world.cinema?.setSurfaceVisibility(1);if(r.gardenSplats)r.gardenSplats.visible=false;r.water?.update(frame);};'),'Complete mesh branch changes camera or uses partial mesh opacity');
check(compactFilm.includes('constprepareSplat=()=>{r.world.cinema?.setSurfaceVisibility(0);if(r.gardenSplats)r.gardenSplats.visible=true;r.water?.update(frame);};'),'Complete splat branch changes camera or keeps a depth-writing garden mesh');
check(compactFilm.includes('r.lens?.renderGardenHandoff(frame,microStrengthV10(frame),newT.Vector3(...sampleFilmCamera(frame).target),gs,{mesh:prepareMesh,splat:prepareSplat});'),'Stage does not submit the current frame/camera focus and shared weight to the handoff');
check(typeof m.CinematicLensV15?.prototype.renderGardenHandoff==='function','Current lens handoff method is missing');
const gardenHandoffSamples=[];
if(typeof m.CinematicLensV15?.prototype.renderGardenHandoff==='function'){
  const method=m.CinematicLensV15.prototype.renderGardenHandoff;
  for(const weight of [0,.25,.5,.75,1,.5,0]){
    const trace=[],originalTarget={name:'original'},focus=new T.Vector3(1,2,3);
    let target=originalTarget;
    const copy={name:'copy',uniforms:{tPlate:{value:null}}},blend={name:'blend',uniforms:{uSplat:{value:null}}};
    const lens={disposed:false,renderer:{getRenderTarget:()=>target,setRenderTarget:t=>{target=t;trace.push('target:'+t.name);},clear:()=>trace.push('clear')},composer:{renderToScreen:true,readBuffer:{texture:{name:'completed-postprocessed-image'}}},copyMaterial:copy,blendMaterial:blend,splatPlate:{name:'splat'},meshPlate:{name:'mesh'},plateQuad:{material:copy,render:()=>trace.push('quad:'+lens.plateQuad.material.name)},render:(frame,micro,point,strength)=>{check(frame===765&&micro===.15&&point===focus,'Handoff render branch does not reuse identical frame/micro/focus');trace.push('render:'+strength);}};
    method.call(lens,765,.15,focus,weight,{mesh:()=>trace.push('prepare:mesh'),splat:()=>trace.push('prepare:splat')});
    const renders=trace.filter(x=>x.startsWith('render:'));
    const prepares=trace.filter(x=>x.startsWith('prepare:'));
    const expected=weight===0?['render:0']:weight===1?['render:1']:['render:1','render:0'];
    check(JSON.stringify(renders)===JSON.stringify(expected),'Garden handoff does not render the two complete branches in the audited order');
    check(JSON.stringify(prepares)===JSON.stringify(weight===0?['prepare:mesh']:weight===1?['prepare:splat']:['prepare:splat','prepare:mesh']),'Garden handoff surface visibility order changed');
    check(target===originalTarget&&lens.composer.renderToScreen===true,'Garden handoff does not restore render target/screen state');
    if(weight>0&&weight<1)check(blend.uniforms.uSplat.value===weight&&trace.includes('quad:blend'),'Garden handoff output is not blended with its actual continuous weight');
    gardenHandoffSamples.push({weight,renders,prepares,stateRestored:target===originalTarget&&lens.composer.renderToScreen===true});
  }
}
report.gardenHandoff={implementation:'src/CinematicLensV15.ts#renderGardenHandoff',completeImageBranches:true,sharedCameraAndFocus:true,sourceOpacityIsComplete:true,samples:gardenHandoffSamples,scope:'Actual compiled handoff method with CPU renderer doubles and exact current Stage callbacks. GPU depth/alpha/bokeh continuity and appearance require rendered inspection.'};
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
const finalCoda=m.codaPoseV15(stateAt(timeline.duration-1));
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
const environmentPath=path.join(root,report.implementation.environment),environmentProvenance=path.join(root,'public/assets_v15/environment/provenance-v15.json');
if(check(fs.existsSync(environmentPath),'V15 environment GLB is missing')){
 const raw=fs.readFileSync(environmentPath),cpuLoader=new GLTFLoader();
 // Keep geometry and hierarchy intact without pretending that Node can
 // render/decode the browser's embedded texture images.
 cpuLoader.register(()=>({name:'AUDIT_GEOMETRY_ONLY',loadMaterial:()=>Promise.resolve(new T.MeshStandardMaterial())}));
 const asset=await cpuLoader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
 let meshes=0,vertices=0,invalid=0,invalidVertices=0;const names=[];asset.scene.updateMatrixWorld(true);asset.scene.traverse(o=>{if(o.isMesh){meshes++;const position=o.geometry.getAttribute('position');vertices+=position?.count??0;if(position)for(let i=0;i<position.count;i++)if(![position.getX(i),position.getY(i),position.getZ(i)].every(Number.isFinite))invalidVertices++;names.push(o.name);if(o.matrixWorld.elements.some(x=>!Number.isFinite(x)))invalid++;}});
 check(meshes>0&&vertices>0&&invalid===0&&invalidVertices===0,'V15 environment has no finite mesh geometry');
 check(fs.existsSync(environmentProvenance),'V15 environment provenance is missing');
 if(fs.existsSync(environmentProvenance)){
  auxiliaryInputHashes.push({file:path.relative(root,environmentProvenance).replaceAll('\\','/'),sha256:sha(fs.readFileSync(environmentProvenance))});
  const provenance=JSON.parse(fs.readFileSync(environmentProvenance,'utf8')),frozen=provenance.files?.find(x=>x.file==='rain_garden_v15.glb');
  check(provenance.version==='V15'&&provenance.authored===true&&provenance.notPhotogrammetry===true,'New garden representation/provenance is incomplete');
  check(frozen?.sha256===sha(raw)&&frozen?.bytes===raw.length,'Garden bytes differ from frozen V15 provenance');
  const licenses=path.join(path.dirname(environmentPath),provenance.sourceLicenses??'source-licenses-v15.json');
  if(check(fs.existsSync(licenses),'V15 garden source/license manifest is missing'))auxiliaryInputHashes.push({file:path.relative(root,licenses).replaceAll('\\','/'),sha256:sha(fs.readFileSync(licenses))});
 }
 report.environment={file:report.implementation.environment,sha256:sha(raw),bytes:raw.length,meshes,vertices,invalidTransforms:invalid,invalidVertices,meshNames:names,provenanceSHA256:fs.existsSync(environmentProvenance)?sha(fs.readFileSync(environmentProvenance)):null,scope:'Original GLB parse and finite geometry/hierarchy only, with CPU audit materials substituted. Loaded shader, reflection, scale relation and camera visibility require rendered review.'};
}

// Inspect the actual V15 rig and its actual iris surface, not an arbitrary
// placeholder head centre. CPU materials preserve skin geometry and bones.
const fishAssetPath=path.join(root,report.implementation.fishAsset);
if(check(fs.existsSync(fishAssetPath),'V15 skinned fish GLB is missing')){
 const raw=fs.readFileSync(fishAssetPath),loader=new GLTFLoader();
 loader.register(()=>({name:'AUDIT_FISH_GEOMETRY_ONLY',loadMaterial:()=>Promise.resolve(new T.MeshStandardMaterial())}));
 const asset=await loader.parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'');
 asset.scene.updateMatrixWorld(true);
 const requiredBones=['Root','Head','Jaw','Spine0','Spine1','Spine2','Tail0','Tail1','Tail2','Tail3','PectoralL0','PectoralL1','PectoralR0','PectoralR1','Dorsal','PelvicL0','PelvicL1','PelvicR0','PelvicR1','Anal'];
 const sourceSkins=[],boneNames=[];let invalidWeights=0,invalidJoints=0,maxWeightSumError=0;
 asset.scene.traverse(o=>{if(o.isBone)boneNames.push(o.name);if(o.isSkinnedMesh)sourceSkins.push(o);});
 check(requiredBones.every(n=>boneNames.includes(n)),'V15 fish does not contain the complete required 20-bone skeleton');
 check(sourceSkins.length>0,'V15 fish has no genuinely skinned meshes');
 for(const mesh of sourceSkins){const w=mesh.geometry.getAttribute('skinWeight'),j=mesh.geometry.getAttribute('skinIndex'),p=mesh.geometry.getAttribute('position');
  if(!w||!j||!p||w.count!==p.count||j.count!==p.count){invalidWeights++;continue;}
  for(let i=0;i<w.count;i++){let sum=0;for(let k=0;k<4;k++){const weight=w.getComponent(i,k),joint=j.getComponent(i,k);if(!Number.isFinite(weight)||weight<0)invalidWeights++;if(!Number.isInteger(joint)||joint<0||joint>=mesh.skeleton.bones.length)invalidJoints++;sum+=weight;}maxWeightSumError=Math.max(maxWeightSumError,Math.abs(sum-1));}
 }
 check(invalidWeights===0&&invalidJoints===0&&maxWeightSumError<1e-5,'V15 skin attributes/weights/joint indices are invalid');
 const body=asset.scene.getObjectByName('ContinuousPearlBody'),weights=body?.geometry?.getAttribute('skinWeight');let multi=0;
 if(weights)for(let i=0;i<weights.count;i++)if([0,1,2,3].filter(k=>weights.getComponent(i,k)>1e-5).length>=2)multi++;
 check(Boolean(body?.isSkinnedMesh)&&Boolean(weights)&&multi>weights.count*.6,'V15 fish body lacks continuous multi-bone skin weighting');
 const poles=['L','R'].map(side=>{const mesh=asset.scene.getObjectByName(`EyeIris${side}`);check(Boolean(mesh?.isSkinnedMesh),'V15 fish is missing the actual skinned eye iris '+side);if(!mesh?.isSkinnedMesh)return null;let front=-Infinity,index=0;const p=new T.Vector3();for(let i=0;i<mesh.geometry.getAttribute('position').count;i++){mesh.getVertexPosition(i,p).applyMatrix4(mesh.matrixWorld);asset.scene.worldToLocal(p);if(p.z>front){front=p.z;index=i;}}return {name:mesh.name,index};}).filter(Boolean);
 const world={observer:new T.Group(),friend:new T.Group(),sprayObserver:new T.Group()};world.observer.position.set(1.6,18,7);world.friend.position.set(-.2,18,7);world.sprayObserver.position.set(-2.1,0,5);
 const groups=Object.values(world),roles=['observer','friend','spray'],parentPositions=groups.map(g=>g.position.toArray());
 const adapter=new m.FishObserverV15(asset.scene,asset.animations).attach(world),skins=groups.map(g=>{const a=[];g.traverse(o=>{if(o.isSkinnedMesh)a.push(o);});return a;});
 check(skins.every(a=>a.length===sourceSkins.length),'Cloned V15 fish loses skinned components');
 check(skins.every(a=>a.every(x=>requiredBones.every(n=>x.skeleton.bones.some(b=>b.name===n)))),'Cloned V15 fish loses required skeleton bones');
 check(skins[0][0].skeleton!==skins[1][0].skeleton&&skins[0][0].skeleton.bones[0]!==skins[1][0].skeleton.bones[0]&&skins[0][0].material!==skins[1][0].material,'V15 roles share mutable skeleton/bones/materials');
 let maxEyeError=0,maxActualLensError=0,maxHoverError=0,maxOneFrameBoneAngle=0,maxOneFrameFigureAngle=0,maxFigureTranslation=0,invalidTransforms=0,minimumActualSkinY=Infinity,bonePeakFrame=0,figurePeakFrame=0,clearanceSampleFrames=0,maxOneFrameSkinnedSurfaceTranslation=0,skinPeakFrame=0,skinPeakName='';
 const prior=new Map(),priorFigures=new Map(),priorSkin=new Map();
 const surfaceNames=new Set(['ContinuousPearlBody','V15CaudalFan','V15PectoralSilkL','V15PectoralSilkR']);
 const surfaceSamples=skins.map(list=>list.filter(mesh=>surfaceNames.has(mesh.name.replace(/[\s_]/g,''))).flatMap(mesh=>{const count=mesh.geometry.getAttribute('position').count;return Array.from({length:8},(_,i)=>({mesh,index:Math.floor(i*(count-1)/7)}));}));
 const poseHash=()=>{const a=[];for(const g of groups)g.traverse(o=>a.push(o.name,...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray()));return sha(JSON.stringify(a));};
 for(let frame=0;frame<timeline.duration;frame++){
  adapter.update(frame);
  for(let i=0;i<groups.length;i++){const group=groups[i];group.updateMatrixWorld(true);const reference=group.getObjectByName(`optical-eye-reference-${roles[i]}`),hover=group.getObjectByName(`hover-datum-${roles[i]}`);
   if(reference)maxEyeError=Math.max(maxEyeError,group.worldToLocal(reference.getWorldPosition(new T.Vector3())).distanceTo(new T.Vector3(0,1.55,0)));else invalidTransforms++;
   const actual=new T.Vector3();for(const pole of poles){const mesh=group.getObjectByName(pole.name);actual.add(group.worldToLocal(mesh.getVertexPosition(pole.index,new T.Vector3()).applyMatrix4(mesh.matrixWorld)));}actual.multiplyScalar(.5);maxActualLensError=Math.max(maxActualLensError,actual.distanceTo(new T.Vector3(0,1.55,0)));
   if(hover)maxHoverError=Math.max(maxHoverError,Math.abs(group.worldToLocal(hover.getWorldPosition(new T.Vector3())).y-.85));else invalidTransforms++;
   const figure=group.children[0],lastFigure=priorFigures.get(i);if(lastFigure){const angle=lastFigure.q.angleTo(figure.quaternion);if(angle>maxOneFrameFigureAngle){maxOneFrameFigureAngle=angle;figurePeakFrame=frame;}maxFigureTranslation=Math.max(maxFigureTranslation,lastFigure.p.distanceTo(figure.position));}priorFigures.set(i,{q:figure.quaternion.clone(),p:figure.position.clone()});
   group.traverse(o=>{if([...o.position.toArray(),...o.quaternion.toArray(),...o.scale.toArray(),...o.matrixWorld.elements].some(x=>!Number.isFinite(x)))invalidTransforms++;if(o.isBone){const key=`${i}/${o.name}`,old=prior.get(key);if(old){const angle=old.angleTo(o.quaternion);if(angle>maxOneFrameBoneAngle){maxOneFrameBoneAngle=angle;bonePeakFrame=frame;}}prior.set(key,o.quaternion.clone());}});
   // Independently measure actual weighted skin positions, including body,
   // tail and pectoral surfaces, rather than only tracking bone angles.
   const inverseSurface=group.matrixWorld.clone().invert();for(const sample of surfaceSamples[i]){const p=sample.mesh.getVertexPosition(sample.index,new T.Vector3()).applyMatrix4(sample.mesh.matrixWorld).applyMatrix4(inverseSurface),key=`${i}/${sample.mesh.name}/${sample.index}`,old=priorSkin.get(key);if(old){const delta=p.distanceTo(old);if(delta>maxOneFrameSkinnedSurfaceTranslation){maxOneFrameSkinnedSurfaceTranslation=delta;skinPeakFrame=frame;skinPeakName=key;}}priorSkin.set(key,p);}
   if(frame%30===0){if(i===0)clearanceSampleFrames++;const inverse=group.matrixWorld.clone().invert(),p=new T.Vector3();for(const mesh of skins[i]){const transform=inverse.clone().multiply(mesh.matrixWorld);for(let k=0;k<mesh.geometry.getAttribute('position').count;k++){mesh.getVertexPosition(k,p).applyMatrix4(transform);minimumActualSkinY=Math.min(minimumActualSkinY,p.y);}}}
  }
 }
 const seekFrames=[0,1,...timeline.scenes.flatMap(s=>[s.start,Math.round((s.start+s.end)/2),s.end-1])],saved=new Map();for(const f of seekFrames){adapter.update(f);saved.set(f,poseHash());}
 const nonSequentialChecks=[];for(const f of [...seekFrames].reverse()){adapter.update(timeline.duration-1);adapter.update(0);adapter.update(f);nonSequentialChecks.push({frame:f,deterministic:saved.get(f)===poseHash()});}
 check(invalidTransforms===0,'V15 rig contains nonfinite/absent optical reference transforms');
 check(maxEyeError<1e-6&&maxActualLensError<1e-5,'V15 light anchor fails to coincide with actual fish iris midpoint');
 check(maxHoverError<1e-6&&minimumActualSkinY>.50,'V15 fish hover datum or skin ground clearance is invalid');
 check(maxOneFrameBoneAngle<.055,'V15 fish skeletal step exceeds inherited 3.2-degree continuity limit');
 check(maxOneFrameFigureAngle<.055&&maxFigureTranslation<.05,'V15 whole-fish heading or position snaps in one frame');
 check(surfaceSamples.every(rows=>rows.length===32)&&maxOneFrameSkinnedSurfaceTranslation<.10,'V15 actual weighted body/tail/pectoral surface has an excessive one-frame displacement or missing sample mesh');
 check(nonSequentialChecks.every(x=>x.deterministic),'V15 fish pose depends on preceding frame/seek order');
 check(JSON.stringify(groups.map(g=>g.position.toArray()))===JSON.stringify(parentPositions),'V15 adapter mutates the optical observer parent translation');
 check(sha(fs.readFileSync(fishAssetPath))===sha(raw),'V15 fish asset changed during audit');
 const provenancePath=path.join(path.dirname(fishAssetPath),'provenance.json');check(fs.existsSync(provenancePath),'V15 fish provenance record is missing');
 if(fs.existsSync(provenancePath)){auxiliaryInputHashes.push({file:path.relative(root,provenancePath).replaceAll('\\','/'),sha256:sha(fs.readFileSync(provenancePath))});const provenance=JSON.parse(fs.readFileSync(provenancePath,'utf8'));check(provenance.version==='V15'&&provenance.boneCount===20&&(provenance.frozenGLBSHA256??provenance.glbSHA256)===sha(raw),'Fish provenance does not bind current 20-bone V15 GLB');}
 report.character={file:report.implementation.fishAsset,sha256:sha(raw),bytes:raw.length,requiredBones,boneNames,sourceSkinnedMeshes:sourceSkins.length,clones:3,skinnedMeshesPerClone:skins.map(x=>x.length),invalidWeights,invalidJoints,maxWeightSumError,bodyVertices:weights?.count??0,multiBoneBodyVertices:multi,normalization:adapter.normalization,sampledFrames:timeline.duration,invalidTransforms,maxEyeError,maxActualLensError,maxHoverError,minimumActualSkinY,clearanceSampleFrames,maxOneFrameBoneAngleRad:maxOneFrameBoneAngle,bonePeakFrame,maxOneFrameFigureAngleRad:maxOneFrameFigureAngle,figurePeakFrame,maxFigureTranslation,skinnedSurfaceSamplesPerClone:surfaceSamples.map(rows=>rows.length),maxOneFrameSkinnedSurfaceTranslation,skinPeakFrame,skinPeakName,nonSequentialChecks,provenanceSHA256:fs.existsSync(provenancePath)?sha(fs.readFileSync(provenancePath)):null,scope:'Actual skinned GLB attributes, eye-surface anchoring, all-frame bone/figure and sampled weighted-skin continuity and reverse/random seek only; not rendered beauty, silhouette readability, biomechanics or human playback.'};
 adapter.dispose();
}

// Validate the actual new textured 3-D Gaussian source and renderer's CPU
// depth ordering. Shader appearance and reconstruction fidelity are excluded.
const gaussianBin='public/assets_v15/gaussian/rain-garden-v15.splats.bin',gaussianMeta='public/assets_v15/gaussian/rain-garden-v15.splats.json';
if(check(fs.existsSync(path.join(root,gaussianBin))&&fs.existsSync(path.join(root,gaussianMeta)),'V15 scene Gaussian binary/metadata is missing')){
 const raw=fs.readFileSync(path.join(root,gaussianBin)),meta=JSON.parse(read(gaussianMeta));
 check(meta.version==='V15'&&meta.encoding==='float32-le'&&meta.stride===16&&raw.length===meta.count*16*4,'V15 Gaussian binary record/count contract failed');
 check(meta.binarySHA256===sha(raw)&&meta.sourceGLB===report.implementation.environment&&meta.sourceGLBSHA256===report.environment?.sha256&&meta.physicalAuthority===false,'V15 Gaussian provenance/hash/source relationship failed');
 const data=new Float32Array(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));let invalid=0,maxQuaternionError=0;
 for(let i=0;i<meta.count;i++){const o=i*16;for(let k=0;k<16;k++)if(!Number.isFinite(data[o+k]))invalid++;if(data[o+6]<0||data[o+6]>1||[7,8,9].some(k=>data[o+k]<=0))invalid++;maxQuaternionError=Math.max(maxQuaternionError,Math.abs(Math.hypot(...data.slice(o+10,o+14))-1));}
 check(invalid===0&&maxQuaternionError<1e-4,'V15 Gaussian attributes are nonfinite, invalid-alpha/sigma or unnormalized');
 const instance=new m.GaussianSceneV15(data.buffer,meta),camera=new T.PerspectiveCamera(45,1920/1080,.03,400);camera.position.set(8,5,12);camera.lookAt(0,2,0);camera.updateMatrixWorld(true);
 const evaluate=frame=>{instance.update(camera,frame,{opacity:.8,scatter:0,focus:[-3.5,1.1,1],radius:13,pointScale:1.12,focusDistance:13,aperturePixels:.15});return sha(Buffer.from(instance.geometry.getAttribute('aCenter').data.array.buffer));};
 const before=evaluate(600);evaluate(0);evaluate(700);const after=evaluate(600),centers=instance.geometry.getAttribute('aCenter');let orderingFailures=0,previous=-Infinity;
 const v=new T.Vector3();for(let i=0;i<meta.count;i++){v.set(centers.getX(i),centers.getY(i),centers.getZ(i)).applyMatrix4(camera.matrixWorldInverse);if(v.z<previous-1e-5)orderingFailures++;previous=v.z;}
 check(before===after&&orderingFailures===0,'Actual V15 Gaussian CPU depth-sort/seek contract failed');
 report.gaussian={file:gaussianBin,sha256:sha(raw),metadata:gaussianMeta,metadataSHA256:sha(fs.readFileSync(path.join(root,gaussianMeta))),count:meta.count,stride:meta.stride,invalidAttributes:invalid,maxQuaternionError,orderingFailures,deterministicSeek:before===after,representation:meta.representation,sourceGLB:meta.sourceGLB,sourceGLBSHA256:meta.sourceGLBSHA256,scope:'Frozen authored surface-splat bytes and actual CPU depth ordering/seek only; not trained photogrammetry, GPU covariance appearance or scientific simulation.'};instance.dispose();
}
const dropletPath='public/assets_v06/lux3d/splats-v06.json';
if(check(fs.existsSync(path.join(root,dropletPath)),'Original Lux3D droplet sample input missing')){const source=JSON.parse(read(dropletPath));check(String(source.meta?.taskId)==='4040282'&&Array.isArray(source.rows)&&source.rows.length>0&&source.rows.every(r=>r.length>=14&&r.every(Number.isFinite)),'Lux3D droplet input/task contract failed');report.luxDroplet={file:dropletPath,sha256:sha(fs.readFileSync(path.join(root,dropletPath))),taskId:source.meta?.taskId,count:source.rows?.length??0,renderer:'src/GaussianDropletV15.ts',scope:'Original Lux3D task sampled input and selected V15 renderer, not whole-film visibility approval'};}
const brandProvenance='public/assets_v15/brand/provenance.json';
if(check(fs.existsSync(path.join(root,brandProvenance)),'V15 adaptive brand provenance is missing')){const provenance=JSON.parse(read(brandProvenance)),sourcePath=provenance.source;check(typeof sourcePath==='string'&&fs.existsSync(path.join(root,sourcePath))&&sha(fs.readFileSync(path.join(root,sourcePath)))===provenance.sourceSHA256,'Adaptive brand does not bind existing user logo');auxiliaryInputHashes.push({file:brandProvenance,sha256:sha(fs.readFileSync(path.join(root,brandProvenance)))});report.brand={source:sourcePath,sourceSHA256:provenance.sourceSHA256,light:'public/assets_v15/brand/logo-light.png',lightSHA256:sha(fs.readFileSync(path.join(root,'public/assets_v15/brand/logo-light.png'))),position:[64,48],scope:'Actual logo source/derived bytes and fixed runtime top-left placement; alpha/design review remains visual'};}

const bridges=m.bridgesV11;
const transitionManifest=JSON.parse(read('src/transitions-v11.json'));
check(transitionManifest.version==='V15'&&transitionManifest.fps===30,'Current bridge manifest is not V15 at native 30 fps');
check(new Set(bridges.map(x=>x.id)).size===bridges.length,'Bridge IDs are duplicated');
check(bridges.length>0,'V15 contains no generated scene bridges');
check(typeof m.bridgeLayersAtV12==='function','The bridge does not export its real V12 source-frame sampling function');
check(typeof m.bridgeStartV11==='function','The bridge does not export its actual nominal-start sampler');
check(bridges.filter(b=>m.bridgeStartV11(b)===0).length===1,'V15 must have exactly one native source bridge at film frame zero');
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
  check(provenance.version==='V15'&&provenance.providerStatus==='SUCCEEDED'&&provenance.status==='processed','Qwen provenance is not a completed processed V15 source for '+b.id);
  check(provenance.nativeFrames===b.frames&&provenance.frameCount===b.frames&&provenance.nativeFPS==='30/1'&&provenance.fps===30&&provenance.nativeWidth===1920&&provenance.nativeHeight===1080&&provenance.width===1920&&provenance.height===1080,'Qwen source is not the expected native 1920x1080 30fps sequence for '+b.id);
  check(Array.isArray(provenance.frameHashes)&&provenance.frameHashes.length===hashes.length&&hashes.every((h,i)=>h===provenance.frameHashes[i]),'Qwen frame bytes differ from generation provenance for '+b.id);
  check(provenance.scientificDataGenerated===false,'Qwen provenance improperly declares generated scientific data for '+b.id);
  const acceptancePath=path.join(dir,'..','visual-acceptance.json');
  check(fs.existsSync(acceptancePath),'Qwen source-sample review record is missing for '+b.id);
  const acceptance=fs.existsSync(acceptancePath)?JSON.parse(fs.readFileSync(acceptancePath,'utf8')):{};
  if(fs.existsSync(acceptancePath))auxiliaryInputHashes.push({file:path.relative(root,acceptancePath).replaceAll('\\','/'),sha256:sha(fs.readFileSync(acceptancePath))});
  check(acceptance.version==='V15'&&acceptance.id===b.id&&acceptance.taskId===b.taskId&&acceptance.status==='pass'&&acceptance.providerSHA256===provenance.providerSHA256&&(acceptance.sourceUnmodified===undefined||acceptance.sourceUnmodified===true)&&(acceptance.scientificAuthority===false||acceptance.scientificApproval===false),'Qwen sampled source review does not bind the current source for '+b.id);
  check(b.framePath.startsWith('assets_v15/qwen/'),'V15 film still references a retired Qwen sequence for '+b.id);
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
  bridgeReport.push({id:b.id,taskId:b.taskId,model:provenance.model,nativeFrames:b.frames,missingSourceFiles:missing.length,adjacentSourceDuplicates:duplicates,scheduledFrames:mapped.length,nominalStart:m.bridgeStartV11(b),first:mapped[0],last:mapped.at(-1),nonMonotonicFrames:nonMonotonic,sourceSkipFrames:sourceSkips,sourceSequenceHash:sha(hashes.join('\n')),sourceRange:mapped.length?[mapped[0].frame,mapped.at(-1).frame]:null,sourceSampleReview:{file:path.relative(root,acceptancePath).replaceAll('\\','/'),sha256:fs.existsSync(acceptancePath)?sha(fs.readFileSync(acceptancePath)):null,status:acceptance.status,scope:acceptance.reviewScope??acceptance.scope,fullNormalSpeedPlaybackChecked:acceptance.fullNormalSpeedPlaybackChecked===true,compositeSeamReviewApproved:acceptance.compositeSeamReviewApproved===true}});
}
report.qwen=bridgeReport;

// The final native source runs exactly once. After it ends, a separately
// identified moving image plate stays under the fully covering paper wipe for
// at most 25 frames. This is compositing continuity, never extra source-video
// playback, a scientific frame or evidence that the rendered seam looks good.
const closingCandidates=bridges.filter(b=>b.id.startsWith('fountain_to_painted')&&refs&&m.bridgeStartV11(b)+b.frames===refs.start);
check(closingCandidates.length<=1,'More than one closing bridge ends at the references scene');
check(bridges.filter(b=>b.id.startsWith('fountain_to_painted')).length===closingCandidates.length,'An active closing bridge does not end exactly at the references scene');
if(!diagnostic)check(closingCandidates.length===1,'Final V15 source has no accepted closing bridge ending at the references scene');
const closingBridge=closingCandidates[0];
const closingReport=bridgeReport.find(b=>b.id===closingBridge?.id);
if(closingBridge&&refs){
  const endpointRel=`public/${closingBridge.framePath}/frame_${String(closingBridge.frames).padStart(4,'0')}.jpg`;
  const endpointPath=path.join(root,endpointRel);
  const imageNodes=node=>{if(!node||typeof node!=='object')return [];const children=node.props?.children;return [...(typeof node.props?.src==='string'?[node]:[]),...(Array.isArray(children)?children:[children]).flatMap(imageNodes)];};
  const snapshots=[];
  for(let local=0;local<=25;local++){
    const state=stateAt(refs.start+local),pose=m.codaPoseV15(state);
    const endpoint=imageNodes(m.CodaV15({state})).find(n=>n.props.src.endsWith(endpointRel.replace(/^public\//,'')));
    check(Boolean(endpoint)===(local<25),'Closing compositing plate lifetime differs at local frame '+local);
    if(endpoint){
      check(endpoint.props.style?.zIndex===29&&endpoint.props.style?.objectFit==='cover','Closing source plate is not the intended full-size layer beneath the paper');
      const transform=endpoint.props.style?.transform??'';
      check(transform===`scale(${1+local*.00008}) translateX(${-local*.11}px)`,'Closing plate does not follow its bounded deterministic image motion');
      snapshots.push({local,frame:state.frame,transform,wipeX:pose.wipeX});
    }
    if(local>=24)check(pose.wipeX+135<=0,'Paper wipe is not fully opaque before the closing endpoint plate unloads');
    if(local>=0)check((m.bridgeLayersAtV12(refs.start+local)).every(x=>x.id!==closingBridge.id),'Closing native video replays under the references page');
  }
  check(closingReport?.last?.frame===refs.start-1,'Final Qwen source does not end immediately before the references scene');
  report.codaEndpoint={id:closingBridge.id,file:endpointRel,sha256:fs.existsSync(endpointPath)?sha(fs.readFileSync(endpointPath)):null,taskId:closingBridge.taskId,sourceFrame:closingBridge.frames-1,nativeSourceLastFilmFrame:closingReport?.last?.frame,firstCompositingFilmFrame:refs.start,plateFrames:25,snapshots,notSourcePlayback:true,scope:'Actual React layer/image bytes and deterministic paper-cover lifetime only. A moving static image plate under the paper wipe; no additional native frames and no GPU/composite aesthetic approval.'};
}else{
  report.codaEndpoint={present:false,scope:'No final fountain_to_painted bridge is active in this snapshot.'};
}

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
for(const [name,record] of [['character',report.character],['Gaussian scene',report.gaussian],['Lux3D droplet',report.luxDroplet]])if(record)check(staticAssetHashes.find(x=>x.file===record.file)?.sha256===record.sha256,name+' input changed between its CPU checks and final asset snapshot');
if(report.gaussian)check(staticAssetHashes.find(x=>x.file===report.gaussian.metadata)?.sha256===report.gaussian.metadataSHA256,'Gaussian metadata changed between its CPU checks and final snapshot');
if(report.brand)check(staticAssetHashes.find(x=>x.file===report.brand.light)?.sha256===report.brand.lightSHA256,'Adaptive logo input changed during audit');
const staticInputsChangedDuringAudit=staticAssetHashes.filter(x=>!fs.existsSync(path.join(root,x.file))||sha(fs.readFileSync(path.join(root,x.file)))!==x.sha256).map(x=>x.file);
check(staticInputsChangedDuringAudit.length===0,'Rendered static/frame/provenance inputs changed during this audit: '+staticInputsChangedDuringAudit.join(', '));
report.staticInputsChangedDuringAudit=staticInputsChangedDuringAudit;
report.passed=errors.length===0;
fs.writeFileSync(path.join(out,'audit-v15.json'),JSON.stringify(report,null,2));
fs.writeFileSync(path.join(out,'audit-v15.md'),`# V15 source audit\n\nStatus: ${report.passed?'PASS':'FAIL'}\n\n${report.scope}\n\n- Timeline: ${timeline.duration} frames at ${timeline.fps} fps.\n- Camera: ${timeline.duration} samples, peak translation ${maxTranslation.toFixed(5)} units/frame at ${translationFrame}, peak rotation ${maxRotation.toFixed(5)} degrees/frame at ${rotationFrame}.\n- Optics: ${optics.validPaths} paths, maximum residual ${optics.maxResidual}.\n- World: ${frames.length} sampled frames with the actual Blender geometry.\n- Editorial: ${report.editorial.captions} preserved cues, ${report.editorial.labelBoundsChecked} projected-label samples.\n- Environment: ${report.environment?.meshes??0} parsed meshes.\n- Qwen: ${bridgeReport.length} accepted source clips; source frames checked against the rendering sampler.\n\n${errors.length?'Errors:\n\n'+errors.map(x=>'- '+x).join('\n')+'\n\n':''}${warnings.length?'Review notes:\n\n'+warnings.map(x=>'- '+x).join('\n')+'\n\n':''}Source hashes and exact metrics: audit-v15.json.\n`);
console.log(JSON.stringify({passed:report.passed,errors,warnings,camera:{maxTranslationPerFrame:maxTranslation,translationPeakFrame:translationFrame,maxRotationDegreesPerFrame:maxRotation,rotationPeakFrame:rotationFrame},optics:{validPaths:optics.validPaths,maxResidual:optics.maxResidual},world:{sampledFrames:frames.length,maxSurfaceAlignmentResidual,seekChecks},editorial:{labelBoundsChecked:report.editorial.labelBoundsChecked,labelBoundsFailures:report.editorial.labelBoundsFailures},environment:{meshes:report.environment?.meshes,vertices:report.environment?.vertices},qwen:bridgeReport.map(x=>({id:x.id,scheduledFrames:x.scheduledFrames,sourceRange:x.sourceRange})),report:path.join(out,'audit-v15.json')},null,2));
if(!report.passed)process.exitCode=1;
