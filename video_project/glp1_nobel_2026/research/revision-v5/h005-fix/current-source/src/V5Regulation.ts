import * as T from 'three';
import {V,mat,smooth,visibility,Label} from './visual';
/** Dashed functional relationships between fixed atlas organ landmarks.
 * These are explicitly signalling diagrams, not invented nerves/vessels. */
export class V5Regulation{
 root=new T.Group();private paths:{line:T.Line;curve:T.CatmullRomCurve3;dot:T.Mesh;key:string}[]=[];
 private nodes:Record<string,T.Vector3>={};private weight=0;private mechanism='';
 setAnchors(a:Record<string,T.Vector3>){
  // The full aorta's bounding-box centre lies behind the heart. Use the
  // registered descending-aortic site so the vessel cue identifies a vessel.
  this.nodes={kidney:a.leftKidney.clone(),adrenals:a.adrenals.clone(),vessel:(a.artery??a.aorta).clone(),brain:a.brainstem.clone(),heart:a.heart.clone()};
  for(const [from,to,key] of [['kidney','vessel','raas'],['kidney','adrenals','raas'],['adrenals','kidney','raas'],['brain','heart','sympathetic'],['brain','kidney','sympathetic']]){
   const start=this.nodes[from],end=this.nodes[to],mid=start.clone().lerp(end,.5);mid.z+=.10;mid.x+=.045;
   const curve=new T.CatmullRomCurve3([start,mid,end]);
   const line=new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(64)),new T.LineDashedMaterial({color:key==='raas'?'#b59053':'#6f8e79',transparent:true,opacity:.72,dashSize:.009,gapSize:.009,depthWrite:false}));line.computeLineDistances();
   const dot=new T.Mesh(new T.SphereGeometry(.0045,16,10),mat(key==='raas'?'#b59053':'#6f8e79',.9));this.root.add(line,dot);this.paths.push({line,curve,dot,key});
  }
  this.root.userData={representation:'dashed functional relationships; not anatomical nerve or vascular centerlines',units:'metres'};
 }
 update(time:number,mechanism:string,weight:number,progress:number){
  this.mechanism=mechanism;this.weight=weight;const kind=mechanism==='sympathetic'?'sympathetic':'raas';
  for(const [i,p] of this.paths.entries()){
   const q=((time*.09+i*.27)%1+1)%1,blocked=mechanism==='arb'?smooth((progress-.18)/.55):0;
   visibility(p.line,p.key===kind?weight*.65:0);p.dot.position.copy(p.curve.getPoint(q));
   visibility(p.dot,p.key===kind?weight*(1-.8*blocked)*smooth(Math.min(q,1-q)/.1):0);
  }
 }
 labels():Label[]{if(this.weight<.45)return[];return this.mechanism==='sympathetic'?[
  {text:'交感调节 · 作用示意',point:this.nodes.brain,side:'right',weight:this.weight},
  {text:'心脏与肾脏响应',point:this.nodes.heart,side:'right',weight:this.weight},
 ]:[{text:'肾脏发出调节信号',point:this.nodes.kidney,side:'right',weight:this.weight},{text:'作用到血管',point:this.nodes.vessel,side:'left',weight:this.weight}];}
}
