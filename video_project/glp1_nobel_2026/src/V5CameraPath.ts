import * as T from 'three';
import {V,Timeline,Clip,clamp,smooth} from './visual';
import {directedShot,directedView} from './V7Director';
import {molecularTiming} from './MolecularNarration';

export type V5View='meal'|'torso'|'stomach'|'gut'|'lcell'|'pancreas'|'islet'|'beta'|'receptor'|'secretion'|'liver'|'pressure'|'arteriole'|'kidney'|'nephron'|'autonomic'|'lipid_liver'|'lipoprotein'|'lipid_wall'|'plaque'|'thrombus'|'brainheart'|'drug'|'muscle'|'action_meal'|'homecheck'|'muscle_cell'|'clot_detail';
export type V5Clip=Clip&{view?:V5View;camera?:{anchor?:string;distance?:number;az?:number;el?:number};action?:string;phase?:number;mechanism?:string;heading?:string;note?:string;additionalPauseAfterSeconds?:number;voiceEndSeconds?:number;voiceDurationSeconds?:number;voiceParts?:{startSeconds:number;endSeconds:number}[]};
export type V5Pose={position:T.Vector3;target:T.Vector3;focus:T.Vector3;distance:number;az:number;el:number;roll?:number;up?:T.Vector3};
type Knot={frame:number;focus:T.Vector3;distance:number;az:number;el:number;roll?:number;basis?:T.Quaternion};
const defaults:Record<V5View,{anchor:string;distance:number;az:number;el:number}>={
 meal:{anchor:'mealPerson',distance:2.7,az:.46,el:.16},action_meal:{anchor:'mealPerson',distance:2.6,az:.37,el:.17},
 torso:{anchor:'torso',distance:1.17,az:.13,el:.06},homecheck:{anchor:'measurement',distance:2.6,az:.30,el:.12},
 stomach:{anchor:'stomach',distance:.51,az:.16,el:.11},gut:{anchor:'small_intestine',distance:.54,az:.12,el:.10},
 lcell:{anchor:'intestinal',distance:.00030,az:.13,el:.15},pancreas:{anchor:'pancreas',distance:.38,az:.13,el:.12},
 islet:{anchor:'islet',distance:.00045,az:.08,el:.12},beta:{anchor:'beta',distance:49e-6,az:.05,el:.09},
 receptor:{anchor:'receptor',distance:39e-9,az:.08,el:.14},secretion:{anchor:'secretion',distance:4.2e-6,az:.12,el:.08},
 liver:{anchor:'liver',distance:.60,az:-.13,el:.10},lipid_liver:{anchor:'liver',distance:.55,az:-.09,el:.10},
 pressure:{anchor:'artery',distance:.085,az:.48,el:.48},arteriole:{anchor:'arteriole',distance:.0045,az:.09,el:.12},
 kidney:{anchor:'kidney',distance:.55,az:.07,el:.12},nephron:{anchor:'nephron',distance:.0068,az:.07,el:.12},autonomic:{anchor:'autonomic',distance:1.12,az:-.12,el:.06},
 lipoprotein:{anchor:'lipid',distance:800e-9,az:.08,el:.12},lipid_wall:{anchor:'lipidWall',distance:3.5e-6,az:.08,el:.20},plaque:{anchor:'plaque',distance:.030,az:.80,el:.42},
 thrombus:{anchor:'thrombus',distance:.014,az:.95,el:.32},brainheart:{anchor:'brainheart',distance:1.28,az:.14,el:.07},
 drug:{anchor:'drug',distance:24e-9,az:.06,el:.13},muscle:{anchor:'personActivity',distance:3.35,az:.20,el:.10},
 muscle_cell:{anchor:'muscleCell',distance:1.8e-6,az:.10,el:.24},clot_detail:{anchor:'clotDetail',distance:75e-6,az:.16,el:.46},
};
export const viewOf=(clip:Clip):V5View=>directedView(clip);
// Constant optical speed through the middle, with 12% soft acceleration and
// braking at either end. A full-interval ease-in/out would almost double the
// peak magnification speed and make the middle of every zoom feel like a rush.
function opticalEase(t:number){const x=clamp(t),a=.12,area=(u:number)=>u*u*u-.5*u*u*u*u;if(x<a)return a*area(x/a)/(1-a);if(x>1-a)return 1-a*area((1-x)/a)/(1-a);return(x-a*.5)/(1-a);}

/** C2 camera route in one metre-based world. Objects never scale to fit a shot.
 * Each transition reserves a settling pause. Lateral travel happens only after
 * pulling out far enough to include both physical locations in the same view.
 */
export class V5CameraPath{
 knots:Knot[]=[];
 constructor(public anchors:Record<string,T.Vector3>,public tl:Timeline,private localFrames:Record<string,T.Quaternion>={}){
  anchors.torso??=V(0,1.26,.02);
  anchors.autonomic??=V(0,1.40,.0);
  anchors.brainheart??=V(.01,1.43,.018);
  anchors.muscle??=V(.19,.86,.025);
  const groups:{clips:Clip[];entry:Omit<Knot,'frame'>;exit:Omit<Knot,'frame'>}[]=[];
  for(let i=0;i<tl.clips.length;i++){
   const clip=tl.clips[i],shot=directedShot(clip),last=groups.at(-1);
   if(last&&shot?.group===directedShot(last.clips[0])?.group){last.clips.push(clip);continue;}
   const entry=this.poseFor(clip,i),exit={...entry,focus:entry.focus.clone(),distance:entry.distance*.96,az:entry.az+.055,el:entry.el+.008};
   groups.push({clips:[clip],entry,exit});
  }
  const add=(frame:number,p:Omit<Knot,'frame'>)=>this.knots.push({frame,...p,focus:p.focus.clone()});
  if(!groups.length)throw new Error('V7 requires narration clips');
  add(0,groups[0].entry);let previousArrival=0;
  for(let i=1;i<groups.length;i++){
   const prev=groups[i-1],current=groups[i],a=prev.exit,b=current.entry;
   const pc=prev.clips.at(-1)!,nc=current.clips[0];
   const decades=Math.abs(Math.log10(a.distance/b.distance));
   const shift=a.focus.distanceTo(b.focus),separateSites=shift>Math.min(a.distance,b.distance)*.4;
   const deep=decades>2||separateSites&&Math.min(a.distance,b.distance)<.01;
   // Anticipation is bounded to the last sentence in the outgoing subject.
   // The same-scale group then gets a long observation arc, rather than a
   // new zoom and pause for each narration sentence.
   const molecularExit=pc.id==='h027',measurementExit=viewOf(pc)==='homecheck',airwayExit=pc.id==='h059',lifestyleExit=['muscle','meal','action_meal'].includes(viewOf(pc))&&!['muscle','meal','action_meal','homecheck'].includes(viewOf(nc));
   const spokenEnd=(pc as V5Clip).voiceEndSeconds!==undefined?(pc as V5Clip).voiceEndSeconds!*tl.fps:pc.start+pc.duration*.92;
   // A few clinical hand-offs carry a single mechanism through the final
   // clause. Hold the outgoing field until the recorded sentence ends, then
   // spend the same visual travel time on the next shot. This keeps the
   // explanation and the object being explained in the same frame without a
   // hard cut or a rushed zoom.
   // Hold the clot detail through the end of the bleeding-risk sentence.
   // Starting the brain/heart pull-out inside h076 left a brief near-empty
   // 140 µm field before the emergency cue appeared. The six-frame handoff
   // buffer keeps the existing clot readable and then begins one continuous
   // move toward h077.
   const semanticHold=pc.id==='h052'||pc.id==='h076'||pc.id==='h077'||pc.id==='h088';
   const depart=semanticHold?Math.max(pc.end+6,spokenEnd+8):molecularExit?Math.min(pc.end-3,spokenEnd+tl.fps):measurementExit?pc.end+60:lifestyleExit?pc.end+30:pc.start+pc.duration*(airwayExit?.88:.72);
   let start=Math.max(previousArrival+30,depart);
   const defaultEnd=nc.id==='h008'?nc.start+1.7*tl.fps:nc.id==='h026'?molecularTiming(tl).arrival:nc.start+nc.duration*(molecularExit?.60:measurementExit?.68:lifestyleExit?.60:nc.id==='h078'?.08:['muscle','homecheck','meal'].includes(viewOf(nc))?.18:airwayExit?.54:deep?.40:.30);
   const end=semanticHold?Math.max(defaultEnd,nc.start+nc.duration*(nc.id==='h078'?.42:.56)):defaultEnd;
   // Extremely deep microscopy needs more travel time than a two-decade
   // detail. Bound the optical velocity, preserving the existing narrative.
   if(decades>4.2&&!molecularExit&&!measurementExit&&!lifestyleExit)start=Math.max(previousArrival+30,pc.start+pc.duration*.36,Math.min(start,end-decades*30/(1.05*.88)));
   if(measurementExit&&['h068','h088'].includes(nc.id)){
    // The measurement rig restores standing height during these first
    // 40 frames. Track that rise before travelling toward fixed organs;
    // holding the seated framing until +60 used to crop the entire head.
    const standing={...a,focus:a.focus.clone().add(V(0,.31,0)),distance:3.22};
    add(pc.end,a);add(pc.end+40,standing);add(start,standing);
    add(start+32,{...standing,focus:b.focus.clone()});add(end,b);
    previousArrival=end;continue;
   }
   const span=Math.max(30,end-start);
   add(start,a);
   const transit:Omit<Knot,'frame'>[]=[a];
   if(separateSites){
    const bothMicro=Math.max(a.distance,b.distance)<.02&&shift>.02;
    const bridge=shift>.025?Math.max(a.distance,b.distance,Math.min(2.8,shift*2.8),bothMicro?.65:0):Math.max(Math.min(a.distance,b.distance),Math.min(shift*3.2,Math.max(a.distance,b.distance)*1.35));
    if(a.distance<bridge*.65)transit.push({...a,distance:bridge});
    if(b.distance<bridge*.65)transit.push({...b,distance:Math.max(bridge,b.distance)});
    else if(transit.length===1)transit.push({focus:a.focus.clone().lerp(b.focus,.5),distance:Math.max(a.distance,b.distance,bridge),az:(a.az+b.az)/2,el:(a.el+b.el)/2});
   }
   transit.push(b);
   const costs=transit.slice(1).map((p,j)=>{const q=transit[j];return .8+Math.abs(Math.log(p.distance/q.distance))+2.8*p.focus.distanceTo(q.focus)/Math.max(p.distance,q.distance)}),total=costs.reduce((x,y)=>x+y,0);let elapsed=0;
   for(let j=1;j<transit.length;j++){elapsed+=costs[j-1];add(start+span*elapsed/total,transit[j]);}
   previousArrival=start+span;
  }
  const last=groups.at(-1)!,lastClip=last.clips.at(-1)!;
  add(lastClip.end,last.exit);
  if(tl.duration>lastClip.end+30){const offset=last.exit.focus.clone().add(V(2.5,0,0));add(lastClip.end+Math.min(120,(tl.duration-lastClip.end)*.6),{...last.exit,focus:offset,distance:1.5});add(tl.duration,{...last.exit,focus:offset,distance:1.5});}
  this.knots.sort((a,b)=>a.frame-b.frame);
  this.knots=this.knots.filter((k,i,a)=>i===0||k.frame-a[i-1].frame>.001);
 }
 private poseFor(clip:Clip,index:number):Omit<Knot,'frame'>{
  const c=clip as V5Clip,shot=directedShot(clip),d={...defaults[viewOf(clip)],...(shot??{}),...(!shot?c.camera:{})};
  const focus=this.anchors[d.anchor]??this.anchors.torso??V(0,1.25,0);
  return{focus:focus.clone(),distance:d.distance,az:d.az,el:d.el,roll:d.roll??0,basis:d.distance<.08?this.localFrames[d.anchor]?.clone():undefined};
 }
 sample(frame:number):V5Pose{
  let i=this.knots.findIndex(k=>k.frame>frame)-1;
  if(i<0)i=frame<this.knots[0].frame?0:Math.max(0,this.knots.length-2);
  const a=this.knots[i],b=this.knots[Math.min(i+1,this.knots.length-1)];
  const t=(frame-a.frame)/Math.max(1,b.frame-a.frame),u=smooth(t);
  const focus=a.focus.clone().lerp(b.focus,u),distance=Math.exp(T.MathUtils.lerp(Math.log(a.distance),Math.log(b.distance),opticalEase(t)));
  const az=T.MathUtils.lerp(a.az,b.az,u),el=T.MathUtils.lerp(a.el,b.el,u);
  const basis=(a.basis??new T.Quaternion()).clone().slerp(b.basis??new T.Quaternion(),u);
  const position=focus.clone().add(V(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).applyQuaternion(basis).multiplyScalar(distance));
  // The horizontal artery cutaway is a local inspection composition. Keep
  // the anatomical overview upright until the camera is inside that region;
  // rolling a whole torso 90 degrees during the bridge obscures orientation.
  const detailRoll=1-smooth(Math.log(Math.max(distance,.065)/.065)/Math.log(.30/.065));
  const roll=T.MathUtils.lerp(a.roll??0,b.roll??0,u)*detailRoll;
  const up=V(Math.sin(roll),Math.cos(roll),0).applyQuaternion(new T.Quaternion().slerp(basis,detailRoll));
  const screenRight=focus.clone().sub(position).normalize().cross(up).normalize();
  const target=focus.clone().addScaledVector(screenRight,-distance*.105);
  return{position,target,focus,distance,az,el,roll,up};
 }
 apply(frame:number,camera:T.PerspectiveCamera){
  const p=this.sample(frame);camera.position.copy(p.position);camera.up.copy(p.up??V(0,1,0));camera.lookAt(p.target);camera.fov=34;
  camera.near=Math.max(1e-12,p.distance/500);camera.far=Math.max(p.distance*140,1e-7);camera.updateProjectionMatrix();camera.updateMatrixWorld();return p;
 }
}
