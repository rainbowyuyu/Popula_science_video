import * as T from 'three';
import type {World} from '../World';
import {flowingCurve} from '../CameraPath';
import {openingCameraPose,OPENING_PHOTO_REVEAL} from '../OpeningCamera';
import {State,V,pulse,ramp,mix,clamp,smooth} from '../visual';
import type {V16CameraTransition} from './timeline';

export type V16Aspect='16:9'|'9:16';
export type V16CameraPose={
 position:T.Vector3; target:T.Vector3; fov:number; roll:number;
 /** Off-axis terms in a full-size perspective projection, NOT pixels. */
 projectionX:number; projectionY:number; sourceFrame:number; cue:number;
 follow:T.Vector3; radiusScale:number; focus:string;
};
export type V16CameraDiagnostic={
 sourceFrame:number; cue:number; aspect:V16Aspect; focus:string;
 position:number[]; target:number[]; targetScreen:[number,number];
 fov:number; radius:number; follow:number[]; finite:boolean; axisErrorPx:number;
};
/** Structural typing also accepts the isolated WorldV16 production copy. */
type CameraWorld=Pick<World,'camera'|'path'|'physics'>;

/** Focus-sensitive portrait framing. Values are authored against SOURCE cues,
 * so the 90 s edit keeps the correct field of view after editorial retiming. */
const portraitKeys=[
 [0,1],[1.45,1.04],[1.8,1.12],[2.04,1.75],[2.37,1.9],[2.7,1.75],
 [2.84,1.36],[3.1,1.62],[3.6,1.67],[3.95,1.52],[4.30,1.8],[4.7,1.06],
 [5.15,1.05],[5.65,1.85],[6.1,1.85],[6.75,1.46],[7.8,1.46],[8.6,1.65],
 [9.5,1.65],[10.5,1.75],[11.8,1.7],[12.8,1.08],[13.5,1.06],
 [14.3,1.63],[15.3,1.75],[16.1,1.8],[17.5,1.68],[18.5,1.63],
 [19.4,1.42],[20.2,1.46],[20.9,1.60],[22.5,1.70],[25.5,1.65],
 [27.0,1.14],[28.8,1.04],[29.6,1.07],[30.2,1.7],[30.9,1.65],[31.3,1.06],
 [32.4,1.07],[33.1,1.45],[34.2,1.14],[35.0,1.60],[36.3,1.74],
 [37.4,1.72],[38.2,1.63],[39.1,1.05],[40.1,1.40],[43.5,1.15],[44.8,1.05],[49,1.05],
];
const ASPECTS={'16:9':1920/1080,'9:16':1080/1920} as const;
const unitUp=V(0,1,0);

/** Only camera styling is new. The source cue path remains the authority for
 * WHAT is being shown: its tightly registered floor, piles, shell cuts and
 * TMD must never be replaced by a coarse full-film orbit registry.
 *
 * Install as WorldV16.cameraOverride AFTER physics.update and BEFORE offsets,
 * environment, force glyphs and spatial-label projection. It may also be used
 * after update if that update already used exactly this rig. apply is seek-safe.
 */
export class V16CameraRig{
 private readonly portraitRadius:(time:number)=>number;
 private readonly projectionProbe=V();
 lastProjectionDiagnostic={axisErrorPx:0,finite:true};
 constructor(public readonly world:CameraWorld,public readonly aspect:V16Aspect='16:9'){
  this.portraitRadius=flowingCurve(portraitKeys.map(k=>world.path.timeAt(k[0])),portraitKeys.map(k=>k[1]));
 }

 pose(s:State):V16CameraPose{
  const base=openingCameraPose(s.time,this.world.path.at(s.time));
  const target=base.target.clone(),delta=base.position.clone().sub(target);
  const cue=s.n+s.u,photo=ramp(OPENING_PHOTO_REVEAL.end,230,s.frame);
  const close=pulse(2.6,2.85,4.2,4.5,cue)+pulse(18.8,19.2,20.5,20.9,cue);
  // C2 envelopes preserve the calibrated photographic camera. Small banking
  // and logarithmic dolly changes enrich an already moving source rig without
  // losing the physically corresponding member or clipping-plane focus.
  const cinematic=ramp(230,440,s.frame);
  const amplitude=mix(.040,.013,clamp(close));
  const azimuth=amplitude*Math.sin(s.time*.125+.20)*cinematic;
  const elevation=.010*Math.sin(s.time*.095)*cinematic;
  let sourceRadius=delta.length();
  // Walk alongside the actual independent pile while narration explains
  // shaft/soil contact. Geometry and force scales stay at their true size;
  // only the lens moves in, so a one-metre pile is no longer a 7 px line.
  const pileClose=pulse(this.world.path.timeAt(5.88),this.world.path.timeAt(6.20),this.world.path.timeAt(6.58),this.world.path.timeAt(6.92),s.time);
  if(pileClose>0){target.lerp(V(.1248,-.62,.3432),pileClose);sourceRadius=mix(sourceRadius,.72,pileClose);}
  const spherical=new T.Spherical().setFromVector3(delta);
  if(pileClose>0){spherical.theta=mix(spherical.theta,.32+.035*Math.sin(s.time*.12),pileClose);spherical.phi=mix(spherical.phi,Math.PI/2-.09,pileClose);}
  spherical.theta+=azimuth;spherical.phi=T.MathUtils.clamp(spherical.phi-elevation,.07,Math.PI-.07);
  let radiusScale=Math.exp(.014*Math.sin(s.time*.16)*cinematic);
  // Full exploded tower now spans roughly -1.3 .. 6.8 in source coordinates.
  // Reserve enough head/foot room for all nine zones and the actual base.
  // Source-clock C2 handles preserve the photograph through frame 136 and
  // return to the unmodified one-storey close-up by source frame 488.
  const overviewFraming=pulse(136,294,418,488,s.frame);
  radiusScale*=1+(this.aspect==='16:9'?.36:.22)*overviewFraming;
  target.y-=(this.aspect==='16:9'?.28:.18)*overviewFraming;
  let fov=base.fov??34;
  let projectionX=2*base.shift/1920,projectionY=0;
  if(this.aspect==='9:16'){
   const portraitMix=photo;
   radiusScale*=mix(1,this.portraitRadius(s.time),portraitMix);
   fov=mix(fov,40,portraitMix);
   // Exact photographic crop registration before the crane. object-position
   // 66% in a portrait cover crop transforms x by ratio*x+(1-ratio)*.66.
   // The aspect change handles ratio*x; this term handles the asymmetric crop.
   const ratio=ASPECTS['16:9']/ASPECTS['9:16'];
   const photoProjectionX=projectionX*ratio+2*(.66-.5)*(ratio-1);
   projectionX=mix(photoProjectionX,-.015*Math.sin(s.time*.11),portraitMix);
   // Aim at y=.525 in image space, keeping both title and subtitle safe areas.
   projectionY=.05*portraitMix;
  }else{
   // Optical centre retains the original left title margin. Let the tower
   // breathe across a few pixels without arbitrary target or label jumps.
   projectionX+=.012*Math.sin(s.time*.12)*cinematic;
  }
  spherical.radius=sourceRadius*radiusScale;
  delta.setFromSpherical(spherical);
  const position=target.clone().add(delta);
  // Real FE displacement follows the close camera exactly once. Do not add a
  // separate procedural sway or restart the environmental response at a cut.
  const follow=this.world.physics?.displacementAt(target).multiplyScalar(pulse(33.3,34.7,38.1,39.1,cue))??V();
  position.add(follow);target.add(follow);
  const roll=base.roll+.004*Math.sin(s.time*.105)*cinematic;
  const focus=s.frame<1786?'opening-component':cue<9.5?'foundation':cue<13?'core':cue<22?'member-force':cue<28?'facade':cue<33.5?'wind':cue<39?'TMD':cue<44.8?'assembly':'tower';
  return {position,target,fov,roll,projectionX,projectionY,sourceFrame:s.frame,cue,follow,radiusScale,focus};
 }

 apply(s:State,transition?:V16CameraTransition|null):V16CameraPose{
  const pose=this.pose(s);
  if(transition?.mode==='sky-whip'){
   const q=transition.progress,half=q<.5?q*2:(1-q)*2;
   // The lateral whip first carries the teaching subject out of view. A
   // short real crane/sky tilt then puts the lens ABOVE every tower member.
   // Pure off-axis projection used to reveal distant removed glass panels
   // at the opposite screen corner. No geometry is hidden to mask the cut.
   // Both sides share exactly one pose for .35..65, including lens/roll, so
   // the source-clock switch takes place over the same physical sky view.
   const sky=pulse(.12,.35,.65,.88,q);
   const distance=pose.position.distanceTo(pose.target);
   const forward=pose.target.clone().sub(pose.position).normalize();
   forward.lerp(V(.28,.91,-.30).normalize(),sky).normalize();
   // The upper structural study deliberately lifts its roof groups by 16
   // world units. 32 clears that presentation envelope as well as rest BIM.
   pose.position.lerp(V(0,32,0),sky);
   pose.target.copy(pose.position).addScaledVector(forward,mix(distance,12,sky));
   pose.fov=mix(pose.fov,38,sky);
   pose.projectionX=(pose.projectionX+(q<.5?1:-1)*12*smooth(half))*(1-sky);
   pose.projectionY*=1-sky;
   pose.roll=(pose.roll+(q<.5?1:-1)*.035*smooth(half))*(1-sky);
  }
  return this.applyPose(pose);
 }

 applyPose(pose:V16CameraPose):V16CameraPose{
  const camera=this.world.camera;
  camera.clearViewOffset();camera.aspect=ASPECTS[this.aspect];camera.fov=pose.fov;
  camera.zoom=1;camera.filmOffset=0;camera.up.copy(unitUp);
  camera.position.copy(pose.position);camera.rotation.set(0,0,0);
  camera.lookAt(pose.target);camera.rotateZ(pose.roll);
  camera.updateProjectionMatrix();
  // clip.w=-view.z, so an optical-axis target projects to (-m[8],-m[9]).
  // Resetting the projection first prevents repeated apply/seek accumulation.
  camera.projectionMatrix.elements[8]=pose.projectionX;
  camera.projectionMatrix.elements[9]=pose.projectionY;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  camera.updateMatrixWorld(true);
  // Adapted from the reviewed Claude Opus component (v16-camera-20261011-
  // 111435-bdbd7445): validate the REAL final projection against its optical
  // centre. A stale projection inverse or sign reversal fails explicitly.
  this.projectionProbe.copy(pose.target).project(camera);
  const W=this.aspect==='16:9'?1920:1080,H=this.aspect==='16:9'?1080:1920;
  const axisErrorPx=Math.max(Math.abs(this.projectionProbe.x+pose.projectionX)*W*.5,
   Math.abs(this.projectionProbe.y+pose.projectionY)*H*.5);
  const finite=Number.isFinite(axisErrorPx)&&camera.projectionMatrix.elements.every(Number.isFinite);
  this.lastProjectionDiagnostic={axisErrorPx,finite};
  if(!finite||axisErrorPx>.01)throw new Error('V16 camera projection registration failed: '+axisErrorPx);
  return pose;
 }

 diagnostics(s:State):V16CameraDiagnostic{
  const pose=this.apply(s),p=pose.target.clone().project(this.world.camera);
  return {sourceFrame:s.frame,cue:pose.cue,aspect:this.aspect,focus:pose.focus,
   position:pose.position.toArray(),target:pose.target.toArray(),
   targetScreen:[(p.x+1)/2,(1-p.y)/2],fov:pose.fov,
   radius:pose.position.distanceTo(pose.target),follow:pose.follow.toArray(),axisErrorPx:this.lastProjectionDiagnostic.axisErrorPx,
   finite:[...pose.position.toArray(),...pose.target.toArray(),p.x,p.y,p.z,pose.fov].every(Number.isFinite)};
 }
}
