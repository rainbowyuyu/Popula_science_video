import * as T from 'three';
import {ForceArrow} from './EnvironmentPlayback';
import {PhysicsPlayback,SolverMember} from './PhysicsPlayback';
import {State,pulse} from './visual';

type CueWindow=readonly [number,number,number,number];
export type MemberForceSelection={meshId:string;name:string;window:CueWindow};
export type MemberForceOptions={
 selections?:MemberForceSelection[];
 /** One fixed linear scale for every selected member and both ends. */
 arrowLengthMetresPerMN?:number;
};
export type MemberForceReadout={
 meshId:string;memberId:string;name:string;quantity:'风致轴力增量';unit:'MN';
 signedForceMN:number;stressMPa:number;area_m2:number;
 sign:'tension'|'compression'|'zero';positiveMeaning:'拉';negativeMeaning:'压';
 arrowLengthMetresPerMN:number;reveal:number;physicalTime_s:number;
 endpoints:[number[],number[]];
};
type Selected={spec:MemberForceSelection;index:number;area:number;arrows:[ForceArrow,ForceArrow]};
export const WEB_FORCE_SELECTIONS:MemberForceSelection[]=[
 {meshId:'FE_M_Z04_C03_OX1',name:'斜腹杆 ①',window:[19.12,19.27,20.172,20.195]},
 {meshId:'FE_M_Z04_C03_OX2',name:'斜腹杆 ②',window:[20.195,20.235,20.51,20.62]},
];
const TENSION='#087d9b',COMPRESSION='#d75d37';

/** Areas must exist in the actual solver export. No nominal fallback section. */
export function solverAreaSquareMetres(member:SolverMember){
 const m=member as SolverMember&{A_m2?:number;section?:{A?:number}},a=m.A_m2,b=m.section?.A;
 if(a===undefined&&b===undefined)throw new Error(`Missing exported area: ${String(m.id)}`);
 for(const v of [a,b])if(v!==undefined&&(!Number.isFinite(v)||v<=0))throw new Error(`Invalid exported area: ${String(m.id)}`);
 if(a!==undefined&&b!==undefined&&Math.abs(a-b)>Math.max(a,b)*1e-8)throw new Error(`Conflicting exported areas: ${String(m.id)}`);
 return (a??b)!;
}

/** End forces are the signed solver axial-force INCREMENT, not wind pressure
 * or total gravity + wind force. Endpoint registration uses the same member
 * translation/rotation, display magnification, weight and rigid blend as its
 * rendered mesh. Zero forces have zero-length glyphs; none are fabricated.
 */
export class MemberForceVisualization{
 readonly root=new T.Group();readonly selected:Selected[]=[];
 readonly arrowLengthMetresPerMN:number;
 private readout:MemberForceReadout|null=null;private disposed=false;
 constructor(scene:T.Scene,readonly physics:PhysicsPlayback,options:MemberForceOptions={}){
  this.root.name='computed-member-axial-force-increments';this.root.visible=false;
  this.arrowLengthMetresPerMN=options.arrowLengthMetresPerMN??6;
  if(!(this.arrowLengthMetresPerMN>0)||!Number.isFinite(this.arrowLengthMetresPerMN))throw new Error('Invalid fixed member-force display scale');
  for(const spec of options.selections??WEB_FORCE_SELECTIONS){
   if(spec.window.length!==4||spec.window.some((v,i)=>!Number.isFinite(v)||(i>0&&v<=spec.window[i-1])))throw new Error('Member-force windows must increase strictly');
   const axes=physics.byMesh.get(spec.meshId);if(!axes||axes.length!==1)throw new Error(`Member-force selection must resolve to one solver member: ${spec.meshId}`);
   const index=axes[0].index,area=solverAreaSquareMetres(physics.data.members[index]);
   const arrows:[ForceArrow,ForceArrow]=[new ForceArrow(TENSION,.0006),new ForceArrow(TENSION,.0006)];
   arrows.forEach(a=>{a.mat.roughness=.46;a.mat.metalness=.08;a.mat.emissiveIntensity=.12;a.root.visible=false;this.root.add(a.root);});
   this.selected.push({spec,index,area,arrows});
  }
  scene.add(this.root);
 }
 update(state:State,camera:T.PerspectiveCamera){
  if(this.disposed)return;
  const cue=state.n+state.u,play=this.physics.play;this.readout=null;this.root.visible=false;
  for(const entry of this.selected){
   const reveal=pulse(...entry.spec.window,cue);
   if(reveal<=0||!play||play.kind!=='wind'||play.weight<.00001){entry.arrows.forEach(a=>a.root.visible=false);continue;}
   const stress=this.physics.currentStress[entry.index];if(!Number.isFinite(stress))throw new Error('Nonfinite computed member axial stress');
   // MPa × m² = MN, identically sigma_MPa * 1e6 * A_m2 in newtons.
   const forceMN=stress*entry.area,axis=this.physics.axes[entry.index],meshId=entry.spec.meshId;
   const a=axis.a.clone().multiplyScalar(.01),b=axis.b.clone().multiplyScalar(.01);
   a.add(this.physics.displacementForMesh(meshId,a));b.add(this.physics.displacementForMesh(meshId,b));
   const direction=b.clone().sub(a).normalize(),length=Math.abs(forceMN)*this.arrowLengthMetresPerMN*.01*reveal;
   const positive=forceMN>=0,c=positive?TENSION:COMPRESSION;
   entry.arrows.forEach((arrow,end)=>{
    const point=end?b:a,outward=direction.clone().multiplyScalar(end?1:-1),outer=point.clone().addScaledVector(outward,length);
    arrow.mat.color.set(c);arrow.mat.emissive.copy(arrow.mat.color);
    arrow.set(positive?point:outer,positive?outer:point,reveal,camera);
    // A moving bead would suggest transport. End-force arrows are static glyphs
    // whose length/direction change only with the actual computed time series.
    arrow.bead.visible=false;
   });
   this.root.visible=true;
   if(!this.readout||reveal>this.readout.reveal)this.readout={meshId,memberId:String(this.physics.data.members[entry.index].id),name:entry.spec.name,quantity:'风致轴力增量',unit:'MN',signedForceMN:forceMN,stressMPa:stress,area_m2:entry.area,sign:forceMN>0?'tension':forceMN<0?'compression':'zero',positiveMeaning:'拉',negativeMeaning:'压',arrowLengthMetresPerMN:this.arrowLengthMetresPerMN,reveal,physicalTime_s:this.physics.physicalTime(state),endpoints:[a.toArray(),b.toArray()]};
  }
 }
 getReadout(){return this.readout;}
 dispose(){
  if(this.disposed)return;this.disposed=true;this.root.removeFromParent();const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
  this.root.traverse(o=>{if(o instanceof T.Mesh){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);}});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.root.clear();this.readout=null;
 }
}
