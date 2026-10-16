import * as T from 'three';
import {V,clamp,mix,pulse,State,Timeline,physicalTimeAt} from './visual';
import {HighResolutionResponse} from './HighResolutionResponse';

export type SolverId=string|number;
export type SolverNode={id:SolverId;xyz:number[];meshIds:string[];level?:number;role:string};
export type SolverMember={id:SolverId;nodeIds:SolverId[];meshIds:string[];role:string;A_m2?:number;section?:{A:number;[key:string]:number};A?:number;Iy?:number;Iz?:number;E?:number};
type Result={u:number[][];r?:number[][];memberAxialMPa?:number[];axialMPa?:number[];memberExtremeMPa?:number[];loads?:number[][]};
export type SolverResponse={schema:string;units:{length:string;force:string;stress:string;time:string};coordinates:string;nodes:SolverNode[];members:SolverMember[];static:Record<string,Result>;dynamic:{dt:number;time:number[];nodeIds:SolverId[];memberIds:SolverId[];u:number[][][];r?:number[][][];axialMPa:number[][];extremeMPa:number[][]};provenance:unknown;validation:unknown};
type Axis={index:number;i:number;j:number;a:T.Vector3;b:T.Vector3;delta:T.Vector3;l2:number};
type Bind={i:Int32Array;j:Int32Array;w:Float32Array;offset:Float32Array;member:Int32Array;colors:Float32Array};
type Slice={u:number[][];r?:number[][];stress:number[]};
type Playback={a:Slice;b:Slice;f:number;weight:number;scale:number;stressWeight:number;kind:'gravity'|'wind'|'none'};
export const WIND_MAGNIFICATION=48;
export const STRESS_COLOR_POWER=.45;
export const CORE_STRESS_COLOR_POWER=.45;
// Fixed for the two explicitly selected Z04/C03 diagonal members over their
// complete 60 s response (absolute peak 12.323 MPa). This is a local detail
// view, never an automatically normalised scale for the whole building.
export const DETAIL_WEB_STRESS_LIMIT=15;
const cool=new T.Color('#087d9b'),zero=new T.Color('#c6ccce'),warm=new T.Color('#dd4e2b'),white=new T.Color('#ffffff'),tmpColor=new T.Color(),bendLow=new T.Color('#dae2df'),bendHigh=new T.Color('#df7949');

// This class reads solver results only. It does not invent force or displacement
// samples. Time interpolation and displacement magnification are presentation.
export class PhysicsPlayback{
 axes:Axis[]=[];byMesh=new Map<string,Axis[]>();coreAxes:Axis[]=[];bindings=new WeakMap<T.BufferGeometry,Bind>();
 dynamicNodeIndex=new Map<SolverId,number>();dynamicMemberIndex=new Map<SolverId,number>();
 dynamicU:number[][][]=[];dynamicR:number[][][]=[];dynamicStress:number[][]=[];
  gravity:Slice;wind:Slice;stressLimit=1;gravityLimit=1;
  // Fixed role ranges come from the full 60 s environment response.  They
  // keep outrigger/belt colors legible without per-frame renormalization.
  // Values are MPa and deliberately remain presentation scales, not design
  // allowables.
  roleStressLimits:Record<string,number>={core:6,megacolumn:6,cornercolumn:3.79774,outrigger:109.83027,belt:54.71914};
  play?:Playback;
 coreBending?:{time:number[];memberIds:string[];extremeMPa:number[][]};coreSectionIndex=new Map<number,number>();currentBending:Float32Array;bendingMode=false;
 currentU:Float32Array;currentR:Float32Array;currentStress:Float32Array;
 rigidWeight=0;
 constructor(public data:SolverResponse,public timeline?:Timeline,public highResolution?:HighResolutionResponse){
  highResolution?.validate(data);
  if(data.schema!=='rainbow.shanghai-physics/1'||data.units.length!=='m'||data.units.stress!=='MPa')throw new Error('Unsupported solver output units/schema');
  const nodeMap=new Map(data.nodes.map((n,i)=>[n.id,i]));
  this.axes=data.members.map((m,index)=>{const i=nodeMap.get(m.nodeIds[0]),j=nodeMap.get(m.nodeIds[1]);if(i===undefined||j===undefined)throw new Error('Missing solver node');const a=V(...data.nodes[i].xyz as [number,number,number]),b=V(...data.nodes[j].xyz as [number,number,number]),delta=b.clone().sub(a);return {index,i,j,a,b,delta,l2:delta.lengthSq()};});
  for(const axis of this.axes){const m=data.members[axis.index];for(const id of m.meshIds){const list=this.byMesh.get(id)??[];list.push(axis);this.byMesh.set(id,list);}if(/core/i.test(m.role))this.coreAxes.push(axis);}
  if(!this.coreAxes.length)throw new Error('Solver has no core backbone for facade compatibility');
  const g=data.static.gravity,w=data.static.windOnly??data.static.windPlusGravity;
  if(!g||!w)throw new Error('Solver missing gravity/wind cases');
  const gStress=g.memberAxialMPa??g.axialMPa;if(!gStress)throw new Error('Gravity result missing axial stress array');
  this.gravity={u:g.u,r:g.r,stress:gStress};
  this.gravityLimit=Math.max(.01,...gStress.map((v:number)=>Math.abs(v)));
  this.currentU=new Float32Array(data.nodes.length*3);this.currentR=new Float32Array(data.nodes.length*3);this.currentStress=new Float32Array(data.members.length);this.currentBending=new Float32Array(data.members.length);
  const wStress=w.memberAxialMPa??w.axialMPa;if(!wStress)throw new Error('Wind result missing axial stress array');
  this.wind={u:w.u.map((v,i)=>v.map((x,k)=>x-(data.static.windOnly?0:g.u[i][k]))),r:w.r?.map((v,i)=>v.map((x,k)=>x-(data.static.windOnly?0:g.r?.[i]?.[k]??0))),stress:wStress.map((x:number,i:number)=>x-(data.static.windOnly?0:gStress[i]))};
  data.dynamic.nodeIds.forEach((id,i)=>this.dynamicNodeIndex.set(id,i));data.dynamic.memberIds.forEach((id,i)=>this.dynamicMemberIndex.set(id,i));
  // Resolve subset indices once; rendered vertex loops use only typed arrays.
  for(let f=0;f<data.dynamic.time.length;f++){
   this.dynamicU.push(data.nodes.map(n=>data.dynamic.u[f][this.dynamicNodeIndex.get(n.id)!]??[0,0,0]));
   this.dynamicR.push(data.nodes.map(n=>data.dynamic.r?.[f]?.[this.dynamicNodeIndex.get(n.id)!]??[0,0,0]));
   this.dynamicStress.push(data.members.map(m=>data.dynamic.axialMPa[f][this.dynamicMemberIndex.get(m.id)!]??0));
  }
  const stresses=this.dynamicStress.flat().map(Math.abs).filter(Number.isFinite).sort((a,b)=>a-b);
  // Fixed +/-6 MPa encompasses the full computed mega-column response.
  // Outriggers use different ranges and are not painted with this column scale.
  this.stressLimit=6;
 }
 setRigidWeight(weight:number){this.rigidWeight=clamp(weight);}
 setCoreBending(tmd:any){this.coreBending=tmd.coreWindSection;if(!this.coreBending)throw new Error('Missing computed core bending stress');const ids=new Map(this.coreBending.memberIds.map((id,i)=>[id,i]));this.data.members.forEach((m,i)=>{const k=ids.get(String(m.id));if(k!==undefined)this.coreSectionIndex.set(i,k);});}
 bind(id:string,geometry:T.BufferGeometry){
  const vertices=geometry.getAttribute('position'),n=vertices.count,bind:Bind={i:new Int32Array(n),j:new Int32Array(n),w:new Float32Array(n),offset:new Float32Array(n*3),member:new Int32Array(n),colors:new Float32Array(n*3)};
  const own=this.byMesh.get(id),axes=own?.length?own:this.coreAxes,point=V();
  for(let k=0;k<n;k++){
   point.set(vertices.getX(k)*100,vertices.getY(k)*100,vertices.getZ(k)*100);
   let best=Infinity,chosen=axes[0],weight=0;
   for(const axis of axes){const dx=point.x-axis.a.x,dy=point.y-axis.a.y,dz=point.z-axis.a.z;const w=clamp((dx*axis.delta.x+dy*axis.delta.y+dz*axis.delta.z)/axis.l2),distance=(dx-axis.delta.x*w)**2+(dy-axis.delta.y*w)**2+(dz-axis.delta.z*w)**2;if(distance<best){best=distance;chosen=axis;weight=w;}}
   bind.i[k]=chosen.i;bind.j[k]=chosen.j;bind.w[k]=weight;bind.member[k]=own?.length?chosen.index:-1;
   for(let q=0;q<3;q++)bind.offset[k*3+q]=point.getComponent(q)-mix(chosen.a.getComponent(q),chosen.b.getComponent(q),weight);
  }
  bind.colors.fill(1);this.bindings.set(geometry,bind);geometry.setAttribute('color',new T.BufferAttribute(bind.colors,3));return bind;
 }
 physicalTime(s:State){
  return physicalTimeAt(s,this.timeline,this.data.dynamic.time.at(-1)??60);
 }
 update(s:State){
  const u=s.n+s.u;const gravity=pulse(15.7,16.05,16.80,17.20,u);this.bendingMode=u>=31.2&&u<=32.96;
  const wind=pulse(12.8,13.15,13.75,14.1,u)+pulse(18.75,19.15,21.05,21.25,u)+pulse(29.05,29.6,38.55,39.1,u);
  if(wind>.00001){const times=this.data.dynamic.time,t=clamp(this.physicalTime(s)/(times.at(-1)??1))*(times.at(-1)??0);let i=Math.max(0,times.findIndex(x=>x>=t)-1);if(t>=times.at(-1)!)i=times.length-2;const j=Math.min(i+1,times.length-1);this.play={a:{u:this.dynamicU[i],r:this.dynamicR[i],stress:this.dynamicStress[i]},b:{u:this.dynamicU[j],r:this.dynamicR[j],stress:this.dynamicStress[j]},f:clamp((t-times[i])/(times[j]-times[i])),weight:Math.min(1,wind),scale:WIND_MAGNIFICATION,stressWeight:pulse(18.8,19.2,21.05,21.25,u)+pulse(31.2,31.8,32.75,32.95,u)+pulse(32.98,33.15,33.65,34.0,u),kind:'wind'};}
  else this.play={a:this.gravity,b:this.gravity,f:0,weight:gravity,scale:1,stressWeight:gravity,kind:gravity>.00001?'gravity':'none'};
  const p=this.play;
  if(p.weight>.00001){
   if(p.kind==='wind'&&this.highResolution)this.highResolution.sample(this.physicalTime(s),this.currentU,this.currentR,this.currentStress);
   else {for(let i=0;i<this.data.nodes.length;i++)for(let q=0;q<3;q++){this.currentU[i*3+q]=mix(p.a.u[i][q],p.b.u[i][q],p.f);this.currentR[i*3+q]=mix(p.a.r?.[i]?.[q]??0,p.b.r?.[i]?.[q]??0,p.f);}for(let i=0;i<this.currentStress.length;i++)this.currentStress[i]=mix(p.a.stress[i],p.b.stress[i],p.f);}
  }
  if(this.bendingMode&&this.coreBending){const b=this.coreBending,t=Math.min(b.time.at(-1)!,this.physicalTime(s)),i=Math.min(b.time.length-2,Math.floor(t)),f=clamp(t-i);for(const [member,k]of this.coreSectionIndex)this.currentBending[member]=mix(b.extremeMPa[i][k],b.extremeMPa[i+1][k],f);}
 }
 deform(geometry:T.BufferGeometry,rest:Float32Array,material:T.MeshStandardMaterial,rigidWeight=0,colorWeight=1,stressRangeOverride?:number){
  // A verified surface-pressure pass is registered to the undeformed CFD
  // shell. Blend continuously toward the exact rest vertices while that pass
  // enters/exits; a boolean reset would make the pressure readout jump from
  // the teaching magnification to the rest shell at one frame.
  const rigid=clamp(rigidWeight);
  const bind=this.bindings.get(geometry),p=this.play;if(!bind||!p)return;
  const pos=geometry.getAttribute('position') as T.BufferAttribute;
  if(p.weight<.00001){if(geometry.userData.physicsActive){pos.array.set(rest);pos.needsUpdate=true;bind.colors.fill(1);geometry.getAttribute('color').needsUpdate=true;}geometry.userData.physicsActive=false;return;}
  geometry.userData.physicsActive=true;
  const boundMember=bind.member[0],role=this.data.members[boundMember]?.role??'',
   eligible=p.kind==='gravity'||(this.bendingMode?role==='core':/megacolumn|cornercolumn|outrigger|belt|core/i.test(role));
  const tint=eligible?Math.min(1,p.stressWeight)*clamp(colorWeight):0,gain=p.weight*p.scale*.01*(1-rigid);
  const stressBound=p.kind==='gravity'?this.gravityLimit:(this.roleStressLimits[role]??this.stressLimit),U=this.currentU,R=this.currentR;
  for(let k=0;k<pos.count;k++){
   const i=bind.i[k]*3,j=bind.j[k]*3,w=bind.w[k],idx=k*3;
   const ux=mix(U[i],U[j],w),uy=mix(U[i+1],U[j+1],w),uz=mix(U[i+2],U[j+2],w),rx=mix(R[i],R[j],w),ry=mix(R[i+1],R[j+1],w),rz=mix(R[i+2],R[j+2],w);
   const ox=bind.offset[idx],oy=bind.offset[idx+1],oz=bind.offset[idx+2];
   pos.setXYZ(k,rest[idx]+gain*(ux+ry*oz-rz*oy),rest[idx+1]+gain*(uy+rz*ox-rx*oz),rest[idx+2]+gain*(uz+rx*oy-ry*ox));
   const m=bind.member[k],stress=m<0?0:this.currentStress[m],memberRole=m<0?'':this.data.members[m]?.role??role,
    memberBound=p.kind==='gravity'?this.gravityLimit:(stressRangeOverride??this.roleStressLimits[memberRole]??this.stressLimit),amount=Math.pow(clamp(Math.abs(stress)/memberBound),STRESS_COLOR_POWER);
   if(this.bendingMode&&this.coreSectionIndex.has(m)){tmpColor.copy(bendLow).lerp(bendHigh,Math.pow(clamp(this.currentBending[m]/6),CORE_STRESS_COLOR_POWER));}else tmpColor.copy(zero).lerp(stress>=0?cool:warm,amount);if(m<0)tmpColor.copy(white);else tmpColor.lerp(white,1-tint);tmpColor.toArray(bind.colors,idx);
  }
  pos.needsUpdate=true;geometry.getAttribute('color').needsUpdate=true;
  const vertexColors=bind.member[0]>=0;
  if(vertexColors){const base=(material.userData.physicsBaseColor as T.Color|undefined)??material.color.clone();material.userData.physicsBaseColor=base;material.color.copy(base).lerp(white,tint);}
  if(material.vertexColors!==vertexColors){material.vertexColors=vertexColors;material.needsUpdate=true;}
 }
 displacementAt(point:T.Vector3){
  const p=this.play;if(!p||p.weight<.00001)return V();const metres=point.clone().multiplyScalar(100);let best=Infinity,a=this.coreAxes[0],w=0;
  for(const axis of this.coreAxes){const f=clamp(metres.clone().sub(axis.a).dot(axis.delta)/axis.l2),d=metres.distanceToSquared(axis.a.clone().addScaledVector(axis.delta,f));if(d<best){a=axis;w=f;best=d;}}
  const result=V(),gain=(1-this.rigidWeight);for(let q=0;q<3;q++)result.setComponent(q,mix(this.currentU[a.i*3+q],this.currentU[a.j*3+q],w)*.01*p.weight*p.scale*gain);return result;
 }
 /** Same member interpolation and small-rotation offset as the mesh shader
  * binding. An annotation on a truss must not borrow the core's motion. */
 displacementForMesh(id:string,point:T.Vector3){
  const p=this.play,axes=this.byMesh.get(id);if(!axes?.length)return this.displacementAt(point);
  if(!p||p.weight<.00001)return V();
  const m=point.clone().multiplyScalar(100);let best=Infinity,a=axes[0],w=0;
  for(const axis of axes){const f=clamp(m.clone().sub(axis.a).dot(axis.delta)/axis.l2),d=m.distanceToSquared(axis.a.clone().addScaledVector(axis.delta,f));if(d<best){best=d;a=axis;w=f;}}
  const offset=m.sub(a.a.clone().addScaledVector(a.delta,w)),disp=V(),rot=V();
  for(let q=0;q<3;q++){disp.setComponent(q,mix(this.currentU[a.i*3+q],this.currentU[a.j*3+q],w));rot.setComponent(q,mix(this.currentR[a.i*3+q],this.currentR[a.j*3+q],w));}
  return disp.add(rot.cross(offset)).multiplyScalar(.01*p.weight*p.scale*(1-this.rigidWeight));
 }
}
