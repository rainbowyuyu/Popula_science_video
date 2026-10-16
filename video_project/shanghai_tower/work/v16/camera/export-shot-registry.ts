/** Delivery inventory only. This script never changes production source/assets. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {PartsInventory} from '../../../src/v16/PartsInventoryV16';
import {V16CameraRig,type V16Aspect} from '../../../src/v16/V16CameraRig';
import {editTimeline,originalTimeline,sourceStateAt,transitionAt} from '../../../src/v16/timeline';
import {CameraPath,towerCameraAnchors} from '../../../src/CameraPath';
import {PhysicsPlayback,type SolverResponse} from '../../../src/PhysicsPlayback';
import {HighResolutionResponse} from '../../../src/HighResolutionResponse';
import {V,pulse} from '../../../src/visual';
import manifest from '../../../public/models/shanghai-tower-manifest.json';

type XYZ=[number,number,number];
type CinematicShot={
 id:string;startFrame:number;endFrame:number;
 camera:{position:XYZ;target:XYZ;fov:number;focus?:string};
 transition:'photo-model'|'gaussian'|'blueprint-3d'|'orbit'|'dive';
 anchor?:string;aspect:'16:9'|'9:16'|'both';dataMode?:'solver'|'illustrative';
};
const read=(p:string)=>JSON.parse(fs.readFileSync(p,'utf8'));
const arrayBuffer=(p:string)=>{const b=fs.readFileSync(p);return b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength) as ArrayBuffer;};
const hash=(p:string)=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const assert=(ok:boolean,msg:string)=>{if(!ok)throw new Error(msg);};
const evidence=[
 'src/CameraPath.ts','src/OpeningCamera.ts','src/camera-beats.json','src/timeline.json',
 'src/v16/V16CameraRig.ts','src/v16/PartsInventoryV16.ts','src/v16/timeline.ts',
 'src/v16/audio-timeline.json','src/v16/audio-timeline-vertical.json',
 'src/v16/WorldV16.ts','src/FilmV16.tsx','src/PhysicsPlayback.ts','src/HighResolutionResponse.ts',
 'public/models/shanghai-tower.glb','public/models/shanghai-tower-manifest.json',
 'public/physics/response.json','public/physics/cinematic-response.json','public/physics/cinematic-response.f32',
 'public/physics/computed-wind-paths.json','public/physics/computed-pressure.json','public/physics/computed-flow-slices.json',
];

async function main(){
 const baseline='research/qa/v16/shot-registry.json',baselineBefore=fs.existsSync(baseline)?hash(baseline):null;
 const sourceHashes=Object.fromEntries(evidence.map(p=>[p,hash(p)]));
 const gltf=await new GLTFLoader().parseAsync(arrayBuffer('public/models/shanghai-tower.glb'),'');
 gltf.scene.updateMatrixWorld(true);
 const parts:any[]=[];
 for(const info of manifest.parts){
  const source=gltf.scene.getObjectByName(info.id);
  assert(!!source,'Missing real GLB part '+info.id);
  if(!source!.getObjectByProperty('type','Mesh')&&!(source instanceof T.Mesh))continue;
  const root=new T.Group();root.name=info.id;
  source!.traverse(o=>{if(o instanceof T.Mesh)root.add(new T.Mesh(o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01),new T.MeshBasicMaterial()));});
  parts.push({id:info.id,role:(info as any).role??info.id.split('_')[0],root,center:new T.Box3().setFromObject(root).getCenter(V()),offset:V()});
 }
 const inventory=new PartsInventory(parts,originalTimeline),cameraPath=new CameraPath(originalTimeline);
 cameraPath.setAnchors({...towerCameraAnchors(manifest),...inventory.anchors});
 const metadata=read('public/physics/cinematic-response.json');
 const physics=new PhysicsPlayback(read('public/physics/response.json') as SolverResponse,originalTimeline,new HighResolutionResponse(metadata,arrayBuffer('public/'+metadata.binary)));
 const accepted={
  wind:read('public/physics/computed-wind-paths.json').quality?.acceptedForFilm===true,
  pressure:read('public/physics/computed-pressure.json').quality?.acceptedForFilm===true,
  slices:read('public/physics/computed-flow-slices.json').quality?.acceptedForFilm===true,
  piles:read('public/physics/pile-dynamics.json').acceptedForFilm===true&&read('public/physics/pile-dynamics-provenance.json').acceptedForFilm===true,
 };
 const shots:any[]=[],editions:any[]=[];
 for(const aspect of ['16:9','9:16'] as const){
  const tl=editTimeline(aspect),camera=new T.PerspectiveCamera(34,aspect==='16:9'?16/9:9/16,.008,200);
  const rig=new V16CameraRig({camera,path:cameraPath,physics},aspect);
  const sample=(frame:number,label:string)=>{
   const s=sourceStateAt(frame,aspect),cue=s.n+s.u,transition=transitionAt(frame,aspect);
   // Same order as WorldV16.update: solve playback -> rigid registered CFD
   // shell -> cameraOverride. Geometry material/shell sampling is irrelevant
   // to displacementAt, which reads actual diaphragm-node response arrays.
   physics.update(s);
   physics.setRigidWeight((accepted.wind||accepted.pressure||accepted.slices)?pulse(28.55,28.85,32.15,32.45,cue):0);
   const pose=rig.apply(s,transition),lastKey=[...cameraPath.keys].reverse().find(k=>k.t<=s.time);
   const channels:string[]=[];
   if(physics.play&&physics.play.weight>1e-5)channels.push('OpenSees '+physics.play.kind+' response');
   if(accepted.wind&&pulse(28.85,29.5,31.35,32.15,cue)>1e-5)channels.push('accepted CFD trajectories');
   if(accepted.pressure&&pulse(29,29.2,29.76,30.03,cue)>1e-5)channels.push('accepted surface Cp');
   if(accepted.slices&&cue>30&&cue<32.14)channels.push('accepted CFD section window');
   if(accepted.piles&&cue>5.85&&cue<9.2)channels.push('accepted pile response window');
   assert(rig.lastProjectionDiagnostic.finite,'Nonfinite camera '+aspect+' '+frame);
   return {label,frame,seconds:frame/tl.fps,sourceFrame:s.frame,sourceSeconds:s.time,sourceCue:cue,
    camera:{position:pose.position.toArray() as XYZ,target:pose.target.toArray() as XYZ,fov:pose.fov,focus:pose.focus},
    anchor:lastKey?.focus??null,roll:pose.roll,projection:{x:pose.projectionX,y:pose.projectionY,aspect:camera.aspect,near:camera.near,far:camera.far,axisErrorPx:rig.lastProjectionDiagnostic.axisErrorPx},
    solverFollow:pose.follow.toArray(),solverPhysicalSeconds:physics.physicalTime(s),solverDisplacementMagnification:physics.play?.scale??1,
    solverChannels:channels,transition:transition??null,
    compositing:{photo:s.frame<204,pointSpriteDissolve:s.frame>80&&s.frame<204,blueprintEdges:s.frame>1410&&s.frame<1610,
     qwenEnvironmentOverlay:aspect==='16:9'&&frame>=tl.duration-325,codaOverlay:frame>=tl.duration-(aspect==='9:16'?150:175)},
   };
  };
  let hiddenSeamCount=0;
  for(const seg of tl.sceneSegments){
   const clip=tl.clips.find(c=>c.id===seg.id)!;
   const frameStart=seg.start,frameEnd=seg.end-1,frameMiddle=Math.floor((frameStart+frameEnd)/2);
   const keyframes=[sample(frameStart,'start'),sample(frameMiddle,'mid'),sample(frameEnd,'end')];
   const sourceMin=Math.min(...keyframes.map(k=>k.sourceFrame)),sourceMax=Math.max(...keyframes.map(k=>k.sourceFrame));
   const bridge=transitionAt(seg.voiceEnd,aspect),hiddenSeams:any[]=[];
   if(bridge?.mode==='sky-whip'){
    const cutFrame=Math.ceil((bridge.startFrame+bridge.endFrame)/2);
    hiddenSeams.push({mode:'sky-whip',cutFrame,startFrame:bridge.startFrame,endFrame:bridge.endFrame,
     sourceFrom:bridge.sourceFrom,sourceTo:bridge.sourceTo,continuity:'intentional off-screen source cut; not global C2',
     mechanism:'lateral off-axis whip carries the subject out, then the camera cranes to [0,32,0] above even the lifted upper structural groups and tilts skyward; progress 0.35..0.65 shares position, direction, FOV38 and zero roll/projection. Source clock switches at progress >= 0.5 over this same sky view.',
     keyframes:[sample(cutFrame-1,'before-hidden-cut'),sample(cutFrame,'first-frame-after-hidden-cut'),sample(bridge.endFrame,'arrival-next-shot')]});
    hiddenSeamCount++;
   }
   const hasPhoto=sourceMin<204,hasBlueprint=sourceMin<1610&&sourceMax>1410;
   const transition:CinematicShot['transition']=hasPhoto?'photo-model':hasBlueprint?'blueprint-3d':seg.section==='foundation'?'dive':'orbit';
   const record:CinematicShot={id:`${aspect==='16:9'?'main':'portrait'}-${seg.id}`,startFrame:frameStart,endFrame:seg.end,
    camera:keyframes[0].camera,transition,anchor:keyframes[0].anchor??undefined,aspect,
    dataMode:keyframes.some(k=>k.solverChannels.length)?'solver':'illustrative'};
   shots.push({...record,sourceClipId:seg.sourceClipId,section:seg.section,narration:clip.text,explanationFocus:clip.focus,
    sourceMapping:{start:seg.sourceStart,voiceEndSource:Math.min(seg.sourceEnd+1,seg.sourceStart+seg.voiceEnd-seg.start),voiceStartFrame:seg.start,voiceEndFrame:seg.voiceEnd,voiceSpeed:1,
     implementation:'src/v16/timeline.ts: sourceFrameAt / transitionAt',bridge:bridge?{...bridge,progress:undefined,hiddenCut:undefined}:null},
    keyframes,hiddenSeams,
    actualTransitionDetails:[...(hasPhoto?['photograph registration followed by shader point-sprite dissolve; not reconstructed Gaussian splatting']:[]),
     ...(hasBlueprint?['EdgesGeometry attached to original component transforms and clipping planes; not a separately reconstructed 2D plan']:[]),
     ...(seg.section==='foundation'?['source-path descent and independently framed pile close-up']:[]),
     ...(hiddenSeams.length?['off-screen sky-whip editorial join']:['continuous source-cue camera travel through this segment'])],
    dataModeScope:'Describes solver channels present in recorded keyframes. Cinematic environment, displacement magnification and exploded assembly remain illustrative.',
   });
  }
  editions.push({aspect,fps:tl.fps,durationFrames:tl.duration,durationSeconds:tl.duration/tl.fps,shotCount:tl.sceneSegments.length,hiddenSeamCount,
   prelude:{startFrame:0,endFrame:tl.sceneSegments[0].start,keyframes:[sample(0,'prelude-start'),sample(tl.sceneSegments[0].start-1,'prelude-end')]},
   coda:{startFrame:tl.duration-(aspect==='9:16'?150:175),endFrame:tl.duration,keyframes:[sample(tl.duration-(aspect==='9:16'?150:175),'coda-start'),sample(tl.duration-1,'coda-end')],note:'Camera continues underneath final compositing; see per-keyframe overlays.'}});
 }
 assert(shots.length===41,'Expected actual 31 main + 10 portrait selections');
 assert(editions[0].hiddenSeamCount===9&&editions[1].hiddenSeamCount===8,'Unexpected hidden-cut inventory');
 for(const [p,before]of Object.entries(sourceHashes))assert(hash(p)===before,'Source changed during registry export: '+p);
 assert(baselineBefore===(fs.existsSync(baseline)?hash(baseline):null),'Basic frozen shot-registry unexpectedly changed');
 const out={schema:'rainbow.cinematic-shots/1',version:'v16',generatedAt:new Date().toISOString(),producer:'work/v16/camera/export-shot-registry.ts',
  coordinates:{space:'Three.js world XYZ, Y up',worldUnitsPerMetre:.01,cameraFov:'vertical degrees',frameConvention:'start inclusive; end exclusive; end keyframe is endFrame - 1',projection:'off-axis terms stored in projectionMatrix elements 8 and 9'},
  scope:'Actual V16 source rig + real GLB inventory anchors + high-resolution solver displacement follow. Registry records delivered shots; does not propose new shots or alter the frozen render.',
  continuity:'Source-cue curves use smooth envelopes. Editorial omissions contain 9 main and 8 portrait off-screen hidden cuts. This film is not claimed globally C2.',
  globalC2:false,sourceEvidence:sourceHashes,basicShotRegistrySHA256:baselineBefore,modelParts:parts.length,acceptedData:accepted,editions,shots,
  validation:{status:'passed',shotCount:shots.length,principalKeyframes:shots.flatMap(s=>s.keyframes).length,
   maxPrincipalProjectionErrorPx:Math.max(...shots.flatMap(s=>s.keyframes.map((k:any)=>k.projection.axisErrorPx))),
   keyframesWithNonzeroSolverFollow:shots.flatMap(s=>s.keyframes).filter(k=>k.solverFollow.some((v:number)=>Math.abs(v)>1e-10)).length,
   hiddenSeamsByAspect:Object.fromEntries(editions.map(e=>[e.aspect,e.hiddenSeamCount])),
   sourceHashesStableDuringExport:true,basicShotRegistryPreserved:true,scope:'Runtime camera extraction and metadata consistency; final aesthetic acceptance remains render-based.'},
  notes:['HighResolutionResponse is loaded from the same actual float32 export as the film; camera follow is not zeroed.',
   'Pure camera extraction does not instantiate a WebGL renderer. Material acceptance and final on-screen occlusion are covered by render QA.',
   'The transition enum is a concise dominant shot classification; source mapping, actualTransitionDetails and hiddenSeams record the actual mechanism.',
   'Compositing such as Qwen environment and the final papers can cover the 3D camera; these overlays are marked explicitly.']};
 const target='research/qa/v16/cinematic-shots.json';fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(out,null,2));
 console.log(JSON.stringify({output:target,shots:shots.length,modelParts:parts.length,editions:editions.map(e=>({aspect:e.aspect,shots:e.shotCount,hiddenSeams:e.hiddenSeamCount})),baselinePreserved:true},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
