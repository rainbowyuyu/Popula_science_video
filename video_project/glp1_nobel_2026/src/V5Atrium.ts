import * as T from 'three';
import {V,mat,smooth,visibility,Label} from './visual';
import timeline from './timeline.json';

const stasisClip=timeline.clips.find(c=>c.id==='h073');
if(!stasisClip)throw Error('The atrial stasis narration cue is missing');
const STASIS_START=stasisClip.start/timeline.fps;
const STASIS_DURATION=stasisClip.duration/timeline.fps;
const Y=V(0,1,0);
const cycle=(x:number)=>((x%1)+1)%1;
const clotSurface=(n:T.Vector3,r:number)=>{
 const lobes=1+.10*Math.sin(n.x*9+n.y*4)*Math.cos(n.z*8-n.x*3)+.045*Math.sin(n.y*17+n.z*5);
 return V(n.x*1.13,n.y*.72,n.z*.86).multiplyScalar(r*lobes);
};
// Integral of the clamped quintic smoothstep. Its phase derivative is a
// positive, gradually decreasing speed, including on random frame seeks.
const integratedSmooth=(u:number)=>u<=0?0:u>=1?u-.5:u**6-3*u**5+2.5*u**4;
const flowPhase=(time:number)=>{
 const elapsed=time-STASIS_START,span=STASIS_DURATION*.52;
 return .085*elapsed-(.085-.012)*span*integratedSmooth((elapsed-STASIS_DURATION*.10)/span);
};

/** The atlas FJ2425 cavity remains in the shared anatomical coordinates.
 * Teal arrows, gold reaction pulses and the clot are qualitative teaching
 * markers, not measured blood velocities, a patient thrombus or CFD output. */
export class V5Atrium{
 root=new T.Group();center=V();
 private arrows:T.Mesh[]=[];private curve:T.CatmullRomCurve3;
 private clot=new T.Group();private fibrin:T.Mesh[]=[];
 private reactionSignals:T.Mesh[]=[];private weight=0;private treatment=0;private formation=0;
 private clotRadius=.004;

 constructor(heart:T.Group){
  const cavity=heart.getObjectByName('FJ2425_Cavity_of_left_atrium');
  if(!cavity)throw Error('Reference left atrial cavity is missing');
  const bounds=new T.Box3().setFromObject(cavity),size=bounds.getSize(V());
  bounds.getCenter(this.center);
  const points=Array.from({length:40},(_,i)=>{
   const a=i/40*2*Math.PI;
   return this.center.clone().add(V(size.x*.23*Math.cos(a),size.y*.20*Math.sin(a),size.z*.11*Math.sin(a*2)));
  });
  this.curve=new T.CatmullRomCurve3(points,true);

  // The main heart shell is independently retired by V5World. This light
  // duplicate supplies only the chamber's anatomical context.
  heart.getObjectByName('FJ2438_Wall_of_left_atrium')?.traverse(o=>{
   if(o instanceof T.Mesh){
    const shell=new T.Mesh(o.geometry,mat('#b37268',.085,.65));
    shell.name='atrial-wall-context';shell.matrix.copy(o.matrixWorld);
    shell.matrixAutoUpdate=false;this.root.add(shell);
   }
  });
  const guide=new T.Mesh(new T.TubeGeometry(this.curve,120,.00010,8,true),mat('#327e80',.15,.6));
  guide.name='qualitative-atrial-flow-path';guide.userData.annotation=true;this.root.add(guide);
  for(let i=0;i<12;i++){
   const arrow=new T.Mesh(new T.ConeGeometry(.00063,.00195,16),mat('#246f76',.94,.45));
   arrow.name='qualitative-atrial-flow-direction';arrow.userData.annotation=true;
   this.root.add(arrow);this.arrows.push(arrow);
  }

  this.clot.position.copy(this.center).add(V(size.x*.14,-size.y*.16,0));
  this.clotRadius=Math.min(.0046,Math.max(.0034,Math.min(size.x,size.y,size.z)*.18));
  const coreGeometry=new T.SphereGeometry(this.clotRadius,48,32);
  const positions=coreGeometry.attributes.position;
  for(let i=0;i<positions.count;i++){
   const n=V().fromBufferAttribute(positions,i).normalize(),p=clotSurface(n,this.clotRadius);
   positions.setXYZ(i,p.x,p.y,p.z);
  }
  coreGeometry.computeVertexNormals();
  const core=new T.Mesh(coreGeometry,mat('#853f3b',.98,.66));
  core.name='single-atrial-thrombus-illustration';this.clot.add(core);
  // Established threads remain after treatment. Anticoagulation lowers new
  // reaction activity; it does not make the existing clot dissolve here.
  for(let i=0;i<22;i++){
   const a=i*2.39996,z=-.87+1.74*(i+.5)/22;
   const axis=V(Math.sqrt(1-z*z)*Math.cos(a),z,Math.sqrt(1-z*z)*Math.sin(a));
   const tangent=V(Math.sin(a+.7),.43,Math.cos(a+.7)).cross(axis).normalize();
   const threadPoints=Array.from({length:30},(_,j)=>{
    const u=j/29,angle=-1.05+u*(1.6+.35*Math.sin(i));
    const n=axis.clone().multiplyScalar(Math.cos(angle)).addScaledVector(tangent,Math.sin(angle)).normalize();
    return clotSurface(n,this.clotRadius*1.026);
   });
   const thread=new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(threadPoints),44,.000044,7,false),mat('#d8bca4',.58,.8));
   thread.name='established-fibrin-schematic';thread.userData.annotation=true;
   this.clot.add(thread);this.fibrin.push(thread);
  }
  this.root.add(this.clot);
  for(let i=0;i<16;i++){
   const pulse=new T.Mesh(new T.SphereGeometry(.00040,14,10),mat('#b58b42',.86,.45));
   pulse.name='new-coagulation-reaction-marker';pulse.userData.annotation=true;
   this.root.add(pulse);this.reactionSignals.push(pulse);
  }
  this.root.userData={source:'BodyParts3D FJ2425 cavity / FJ2438 wall',units:'metres',cavityBounds:[bounds.min.toArray(),bounds.max.toArray()],representation:'Qualitative directional flow and reaction markers; one illustrative atrial clot, not a patient scan or CFD',flowPhase:'Analytic integral of decreasing quintic-smoothed speed; independent of update history',treatment:'Reduces new coagulation activity; existing clot and established fibrin remain'};
 }
 getAnchors(){return{leftAtrium:this.center.clone(),atrialClot:this.clot.position.clone()};}
 update(time:number,weight:number,progress:number,markerWeight=weight,treatment=0){
  this.weight=weight;this.treatment=treatment;
  visibility(this.root,weight);this.root.visible=Math.max(weight,markerWeight)>.0001;
  const phase=flowPhase(time);
  this.arrows.forEach((arrow,i)=>{
   const q=cycle(phase+i/this.arrows.length);
   arrow.position.copy(this.curve.getPointAt(q));
   arrow.quaternion.setFromUnitVectors(Y,this.curve.getTangentAt(q).normalize());
   visibility(arrow,markerWeight);
  });
  const formation=smooth((progress-.24)/.56);
  this.formation=formation;
  this.clot.scale.setScalar(.36+.64*formation);
  visibility(this.clot,markerWeight*formation);
  this.fibrin.forEach((thread,i)=>visibility(thread,markerWeight*formation*smooth((progress-.38-i*.012)/.24)));
  const inhibition=smooth((treatment-.10)/.70);
  this.reactionSignals.forEach((signal,i)=>{
   const q=cycle((time-STASIS_START)*.22+i/this.reactionSignals.length),a=i*2.39996;
   const radial=V(Math.cos(a)*1.13,Math.sin(a*.71)*.72,Math.sin(a)*.86).normalize();
   const distance=this.clotRadius*(2.25-1.12*q);
   signal.position.copy(this.clot.position).add(radial.multiplyScalar(distance));
   const arrival=smooth(q/.14)*(1-smooth((q-.76)/.24));
   const remaining=i<3?1-.55*inhibition:1-.98*inhibition;
   visibility(signal,markerWeight*formation*arrival*remaining);
  });
 }
 labels():Label[]{return this.weight>.3?[
  {text:'左心房',point:this.center.clone(),side:'right',weight:this.weight},
  {text:this.treatment>.10?'新增凝血反应减少 · 示意':'局部血流变缓 · 示意',point:this.center.clone().add(V(0,.004,0)),side:'left',weight:this.weight},
  {text:'心房内血栓 · 示意',point:this.clot.position.clone(),side:'right',weight:this.weight*this.formation},
 ]:[];}
}
