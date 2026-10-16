import * as T from 'three';
import {V,Timeline,Clip,clamp,smooth} from './visual';

export type V4View='meal'|'torso'|'stomach'|'gut'|'lcell'|'pancreas'|'islet'|'beta'|'receptor'|'secretion'|'liver'|'pressure'|'arteriole'|'kidney'|'nephron'|'autonomic'|'lipid_liver'|'lipoprotein'|'lipid_wall'|'plaque'|'thrombus'|'brainheart'|'drug'|'muscle'|'action_meal'|'homecheck';
export type V4Clip=Clip&{view?:V4View;camera?:{anchor?:string;distance?:number;az?:number;el?:number};action?:string;phase?:number};
export type V4Pose={position:T.Vector3;target:T.Vector3;focus:T.Vector3;distance:number;az:number;el:number};
type Knot={frame:number;focus:T.Vector3;distance:number;az:number;el:number};
const defaults:Record<V4View,{anchor:string;distance:number;az:number;el:number}>={
 meal:{anchor:'meal',distance:.86,az:.23,el:.64},action_meal:{anchor:'meal',distance:.82,az:.17,el:.62},
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
 drug:{anchor:'drug',distance:24e-9,az:.06,el:.13},muscle:{anchor:'muscle',distance:1.1,az:.18,el:.08},
};
export const viewOf=(clip:Clip):V4View=>(clip as V4Clip).view??'torso';
// Constant optical speed through the middle, with 12% soft acceleration and
// braking at either end. A full-interval ease-in/out would almost double the
// peak magnification speed and make the middle of every zoom feel like a rush.
function opticalEase(t:number){const x=clamp(t),a=.12,area=(u:number)=>u*u*u-.5*u*u*u*u;if(x<a)return a*area(x/a)/(1-a);if(x>1-a)return 1-a*area((1-x)/a)/(1-a);return(x-a*.5)/(1-a);}

/** C2 camera route in one metre-based world. Objects never scale to fit a shot.
 * Each transition reserves a settling pause. Lateral travel happens only after
 * pulling out far enough to include both physical locations in the same view.
 */
export class V4CameraPath{
 knots:Knot[]=[];
 constructor(public anchors:Record<string,T.Vector3>,public tl:Timeline){
  anchors.torso??=V(0,1.26,.02);
  anchors.autonomic??=V(0,1.40,.0);
  anchors.brainheart??=V(.01,1.43,.018);
  anchors.muscle??=V(.19,.86,.025);
  const poses=tl.clips.map((c,i)=>this.poseFor(c,i));
  const add=(frame:number,p:Omit<Knot,'frame'>)=>this.knots.push({frame,...p,focus:p.focus.clone()});
  if(!poses.length)throw new Error('V4 requires at least one timeline clip');
  add(0,poses[0]);
  // Start with a legible still composition, followed by a very small dolly.
  add(tl.clips[0].start+tl.clips[0].duration*.60,poses[0]);
  let previousArrival=tl.clips[0].start+tl.clips[0].duration*.60;
  for(let i=1;i<poses.length;i++){
   const prev=tl.clips[i-1],current=tl.clips[i],a=poses[i-1],b=poses[i];
   const same=viewOf(prev)===viewOf(current)&&!(current as V4Clip).camera;
   const decades=Math.abs(Math.log10(a.distance/b.distance));
   const previouslyRepeated=i>1&&viewOf(this.tl.clips[i-2])===viewOf(prev);
   const nextRepeated=i+1<tl.clips.length&&viewOf(this.tl.clips[i+1])===viewOf(current);
   const depart=decades>3&&previouslyRepeated?.46:.69;
   const start=Math.max(prev.start+prev.duration*depart,previousArrival+prev.duration*.06);
   const arrive=decades>3?(nextRepeated?.80:.72):same?.30:.64;
   const end=current.start+current.duration*arrive,span=end-start;
   add(start,a);
   const shift=a.focus.distanceTo(b.focus),minDistance=Math.min(a.distance,b.distance);
   const lateral=shift>minDistance*.30;
   const transit:Omit<Knot,'frame'>[]=[a];
   if(lateral){
    const bridge=Math.max(minDistance,shift*3.8);
    // Never move a nanometre lens centimetres sideways. First restore the
    // parent region, carry it across the screen, then enter the new location.
    if(a.distance<bridge*.65){transit.push({...a,distance:bridge},{...b,distance:Math.max(bridge,b.distance)});}
    else if(b.distance<bridge*.65){transit.push({...b,distance:Math.max(bridge,a.distance*.52)});}
    else transit.push({focus:a.focus.clone().lerp(b.focus,.46),distance:Math.max(a.distance,b.distance,bridge),az:(a.az+b.az)*.5,el:(a.el+b.el)*.5});
   }
   transit.push(b);
   // Allocate time by the optical distance travelled, rather than giving a
   // six-decade pull-out an arbitrary 30% of the transition. A molecular exit
   // now gets most of the available narration, with the broad pan afterwards.
   const costs=transit.slice(1).map((p,j)=>{
    const q=transit[j];return .9+Math.abs(Math.log(p.distance/q.distance))+2.8*p.focus.distanceTo(q.focus)/Math.max(p.distance,q.distance)+.65*Math.abs(p.az-q.az);
   }),cost=costs.reduce((sum,x)=>sum+x,0);let elapsed=0;
   for(let j=1;j<transit.length;j++){
    elapsed+=costs[j-1];const u=elapsed/cost,turn=smooth(u);
    add(start+span*u,{...transit[j],az:T.MathUtils.lerp(a.az,b.az,turn),el:T.MathUtils.lerp(a.el,b.el,turn)});
   }
   // A two-second-or-more observation window is intentional: the viewer can
   // locate the organ or cell before the next movement begins.
   previousArrival=end;
  }
  const last=tl.clips.at(-1)!;
  add(last.end,poses.at(-1)!);
  if(tl.duration>last.end+30){
   const offset=poses.at(-1)!.focus.clone().add(V(2.5,0,0));
   add(last.end+Math.min(120,(tl.duration-last.end)*.6),{...poses.at(-1)!,focus:offset,distance:1.5});
   add(tl.duration,{...poses.at(-1)!,focus:offset,distance:1.5});
  }
  this.knots.sort((a,b)=>a.frame-b.frame);
  this.knots=this.knots.filter((k,i,a)=>i===0||k.frame-a[i-1].frame>.001);
 }
 private poseFor(clip:Clip,index:number):Omit<Knot,'frame'>{
  const c=clip as V4Clip,d={...defaults[viewOf(clip)],...c.camera};
  if(viewOf(clip)==='pressure'&&(index===0||viewOf(this.tl.clips[index-1])!=='pressure')&&!c.camera){d.anchor='heart';d.distance=.64;}
  if(viewOf(clip)==='lipid_wall'&&index>0&&viewOf(this.tl.clips[index-1])==='lipid_wall'&&!c.camera){d.anchor='foamCell';d.distance=80e-6;d.az=1.05;}
  if(viewOf(clip)==='lipoprotein'&&index>0&&viewOf(this.tl.clips[index-1])==='lipoprotein'&&!c.camera)d.distance=500e-9;
  const focus=this.anchors[d.anchor]??this.anchors.torso??V(0,1.25,0);
  // A tiny alternating arc adds parallax without a constant orbit or motion
  // underneath explanatory text. No object transform changes with this arc.
  const previous=index>0?viewOf(this.tl.clips[index-1]):null;
  const repeated=previous===viewOf(clip);
  return{focus:focus.clone(),distance:d.distance*(repeated?(1+.025*Math.sin(index*.8)):1),az:d.az+(repeated?.028*Math.sin(index*.8):0),el:d.el};
 }
 sample(frame:number):V4Pose{
  let i=this.knots.findIndex(k=>k.frame>frame)-1;
  if(i<0)i=frame<this.knots[0].frame?0:Math.max(0,this.knots.length-2);
  const a=this.knots[i],b=this.knots[Math.min(i+1,this.knots.length-1)];
  const t=(frame-a.frame)/Math.max(1,b.frame-a.frame),u=smooth(t);
  const focus=a.focus.clone().lerp(b.focus,u),distance=Math.exp(T.MathUtils.lerp(Math.log(a.distance),Math.log(b.distance),opticalEase(t)));
  const az=T.MathUtils.lerp(a.az,b.az,u),el=T.MathUtils.lerp(a.el,b.el,u);
  const position=focus.clone().add(V(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(distance));
  const target=focus.clone().addScaledVector(V(Math.cos(az),0,-Math.sin(az)),-distance*.105);
  return{position,target,focus,distance,az,el};
 }
 apply(frame:number,camera:T.PerspectiveCamera){
  const p=this.sample(frame);camera.position.copy(p.position);camera.up.set(0,1,0);camera.lookAt(p.target);camera.fov=34;
  camera.near=Math.max(1e-12,p.distance/500);camera.far=Math.max(p.distance*140,1e-7);camera.updateProjectionMatrix();camera.updateMatrixWorld();return p;
 }
}
