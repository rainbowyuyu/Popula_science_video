import * as T from 'three';
import {V,mat,visibility,smooth,clamp,Label} from './visual';
import {SCALE,BETA_RECEPTOR} from './Scale';
const phase=(v:number)=>((v%1)+1)%1;
/** Readable cell-level effect annotations. The beta cell remains at its SI
 * dimensions. Rings/arrows and transport dots are symbols, not molecules. */
export class V7BetaSignal{
 readonly root=new T.Group();private receptor=new T.Group();private signal:T.Mesh[]=[];private arrivals:T.Mesh[]=[];private release:T.Mesh[]=[];
 private path:T.CatmullRomCurve3;private weight=0;private id='';private strength=0;
 constructor(){
  this.root.name='beta-cell-effect-annotations';this.root.scale.setScalar(SCALE.betaUnit);
  this.root.userData={annotation:true,representation:'Cell-level receptor activity and secretion direction symbols; not molecular dimensions or quantitative drug kinetics'};
  const at=V(...BETA_RECEPTOR),normal=at.clone().normalize();this.receptor.position.copy(at).addScaledVector(normal,.035);
  const ring=new T.Mesh(new T.TorusGeometry(.16,.025,10,48),mat('#337f7a',.95));ring.quaternion.setFromUnitVectors(V(0,0,1),normal);this.receptor.add(ring);this.root.add(this.receptor);
  this.path=new T.CatmullRomCurve3([at.clone(),V(-.57,.06,.76),V(-.28,-.29,.79),V(.22,-.28,.79),V(.76,-.03,.80)]);
  for(let i=0;i<9;i++){const dot=new T.Mesh(new T.SphereGeometry(.056,18,12),mat('#39928a',.90));dot.userData.annotation=true;this.signal.push(dot);this.root.add(dot);}
  for(let i=0;i<4;i++){const dot=new T.Mesh(new T.OctahedronGeometry(.10),mat('#c49c55',.95));dot.userData.annotation=true;this.arrivals.push(dot);this.root.add(dot);}
  for(let i=0;i<8;i++){const dot=new T.Mesh(new T.SphereGeometry(.052,18,12),mat('#bd9355',.88));dot.userData.annotation=true;this.release.push(dot);this.root.add(dot);}
 }
 setAnchor(point:T.Vector3){this.root.position.copy(point);}
 update(time:number,id:string,p:number,weight:number){
  this.id=id;this.weight=['h022','h023','h026','h027'].includes(id)?weight:0;
  const short=id==='h026',long=id==='h027';
  this.strength=short?1-.87*smooth((p-.14)/.68):long?.15+.85*smooth(p/.20):id==='h022'?smooth(p/.30):1;
  visibility(this.root,this.weight);
  visibility(this.receptor,this.weight*(.35+.65*this.strength));
  const at=V(...BETA_RECEPTOR),normal=at.clone().normalize();
  this.arrivals.forEach((dot,i)=>{const q=phase(time*.10+i*.25);dot.position.copy(at).addScaledVector(normal,.08+.95*(1-q));dot.rotation.set(q,i+time*.2,0);visibility(dot,this.weight*this.strength*smooth(Math.min(q,1-q)/.13));});
  this.signal.forEach((dot,i)=>{const q=phase(time*.12+i/9);dot.position.copy(this.path.getPoint(q));visibility(dot,this.weight*this.strength*smooth(Math.min(q,1-q)/.12));});
  this.release.forEach((dot,i)=>{const q=phase(time*.08+i/8);dot.position.set(.72+q*.95,-.04+(i%3-1)*.12,.74+.08*q);visibility(dot,this.weight*this.strength*smooth(Math.min(q,1-q)/.16)*(id==='h022'?smooth((p-.35)/.5):1));});
 }
 labels():Label[]{
  if(this.weight<.45)return[];
  const point=(v:T.Vector3)=>this.root.localToWorld(v.clone());
  return[{text:this.id==='h026'?'天然信号逐渐消退':this.id==='h027'?'改造后作用更持久':'受体作用 · 示意',point:point(V(...BETA_RECEPTOR)),side:'left',weight:this.weight,color:'#337f7a'},{text:'胰岛素释放方向',point:point(V(1.05,-.04,.74)),side:'right',weight:this.weight}];
 }
}
