import * as T from 'three';
import {V,mat,smooth,clamp,visibility,Label} from './visual';
import timeline from './timeline.json';
const phase=(x:number)=>((x%1)+1)%1;
const active:Record<number,string[]>={3:['glucose','energy'],5:['glucose'],6:['glucose','energy'],7:['insulin-muscle','insulin-liver'],17:['nutrition'],18:['satiety'],19:['glucose','incretin'],20:['incretin'],21:['incretin'],24:['satiety'],28:['satiety'],31:['nutrition'],32:['glucose'],33:['glucose'],75:['clinical-targets'],80:['satiety','nutrition'],81:['satiety'],82:['insulin-muscle','insulin-liver'],83:['energy','nutrition'],84:['fat-brain'],85:['energy','satiety']};
type Path={key:string;curve:T.CatmullRomCurve3;line:T.Line;dots:T.InstancedMesh;from:string;to:string};
/** Organ-level functional arrows on fixed atlas landmarks. These deliberately
 * dashed links explain signal/cargo destinations, not anatomical vessel paths. */
export class V7OrganNarrative{
 readonly root=new T.Group();private paths:Path[]=[];private a:Record<string,T.Vector3>={};private id='';private weight=0;private dummy=new T.Object3D();private progress=0;
 setAnchors(a:Record<string,T.Vector3>){
  this.a={gut:a.small_intestine.clone(),liver:a.liver.clone(),pancreas:a.pancreas.clone(),muscle:a.muscle.clone(),brain:a.brainstem.clone(),stomach:a.stomach.clone(),fat:a.small_intestine.clone().add(V(.02,-.05,.10)),heart:a.heart.clone(),vessel:a.artery.clone(),kidney:a.leftKidney.clone()};
  for(const [from,to,key] of [['gut','liver','glucose'],['liver','muscle','energy'],['pancreas','muscle','insulin-muscle'],['pancreas','liver','insulin-liver'],['gut','pancreas','incretin'],['gut','brain','satiety'],['gut','muscle','nutrition'],['fat','brain','fat-brain']] as string[][]){
   const start=this.a[from],end=this.a[to],mid=start.clone().lerp(end,.5).add(V(.02,.015,.085));
   const curve=new T.CatmullRomCurve3([start,mid,end],false,'catmullrom',.5),color=key.startsWith('insulin')?'#bc9157':key==='satiety'?'#65867d':'#397f7f';
   const line=new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(80)),new T.LineDashedMaterial({color,transparent:true,opacity:.45,dashSize:.008,gapSize:.012,depthWrite:false}));line.computeLineDistances();
   const dots=new T.InstancedMesh(new T.SphereGeometry(.0034,12,8),mat(color,.9),12);dots.frustumCulled=false;dots.name='direction-symbols-not-literal-molecule-size';
   this.paths.push({key,curve,line,dots,from,to});this.root.add(line,dots);
  }
  this.root.userData={representation:'organ-level functional destination links, not vessel centreline reconstruction; particles are direction symbols',units:'metres'};
 }
 update(time:number,id:string,progress:number,weight:number){
  this.id=id;this.progress=clamp(progress);const n=Number(id.slice(1));this.weight=weight;
  const weighted=timeline.clips.filter(c=>active[Number(c.id.slice(1))]).map(c=>({c,w:smooth((time-c.start/30+.4)/.8)*(1-smooth((time-c.end/30+.4)/.8))}));
  const weights:Record<string,number>={};for(const {c,w} of weighted)for(const key of active[Number(c.id.slice(1))])weights[key]=Math.max(weights[key]??0,w);
  const dominant=weighted.sort((a,b)=>b.w-a.w)[0];if(!(active[n]?.length)&&dominant?.w>.001){this.id=dominant.c.id;this.progress=clamp((time*30-dominant.c.start)/dominant.c.duration);}
  this.weight*=Math.max(0,...Object.values(weights));
  this.root.visible=this.weight>.001;
  for(const path of this.paths){
   const visible=(weights[path.key]??0)*weight,compare=n===19?1-.73*smooth((progress-.43)/.14):1;
   visibility(path.line,visible*.8);visibility(path.dots,visible);
   for(let i=0;i<12;i++){
    const q=phase(time*.09+i/12),edge=smooth(Math.min(q,1-q)/.10),amplitude=path.key==='incretin'?compare:n===32?1-.25*smooth(progress):1;
    this.dummy.position.copy(path.curve.getPoint(q));this.dummy.quaternion.setFromUnitVectors(V(0,1,0),path.curve.getTangent(q));this.dummy.scale.setScalar(edge*amplitude);this.dummy.scale.y*=1.7;this.dummy.updateMatrix();path.dots.setMatrixAt(i,this.dummy.matrix);
   }path.dots.instanceMatrix.needsUpdate=true;
  }
 }
 labels():Label[]{
  if(this.weight<.25)return[];const n=Number(this.id.slice(1)),w=this.weight;
  const l=(text:string,key:string,side:'left'|'right'='right'):Label=>({text,point:this.a[key].clone(),side,weight:w});
  if(n===5)return[l('小肠吸收糖','gut'),l('送往肝脏 · 方向示意','liver')];
  if(n===6)return[l('肝脏储存','liver'),l('肌肉利用','muscle','left')];
  if(n===7)return[l('胰岛素信号 · 示意','pancreas'),l('提醒肌肉接糖','muscle','left')];
  if(n===19)return[l(this.progress<.5?'口服 · 肠道额外发信号':'等血糖 · 静脉对照','gut'),l('胰腺响应','pancreas')];
  if(n===20||n===21)return[l('肠道释放 GLP-1','gut'),l('作用到胰腺 · 示意','pancreas')];
  if(n===18||n===24)return[l('肠脑信号 · 作用示意','gut'),l('参与饱足调节','brain')];
  if(n===28)return[l('GLP-1参与饱足信号','gut'),l('大脑收到饱足提示','brain')];
  if(n===17||n===31)return[l('营养供应 · 方向示意','gut'),l('留住肌肉','muscle','left')];
  if(n===75)return this.progress<.34?[l('降压 · 血管和肾脏','vessel')]:this.progress<.66?[l('降脂 · 肝脏回收','liver')]:[l('抗栓 · 血小板或凝血','heart')];
  if(n===80)return[l('饱足感支持长期坚持','gut'),l('营养供应','muscle','left')];
  if(n===81)return[l('睡眠与食欲 · 调节关联','brain'),l('饱足感的信号','gut')];
  if(n===82)return[l('胰岛素响应可能改善','muscle','left'),l('肝脏参与调节','liver')];
  if(n===83)return[l('肌肉活动与能量利用','muscle','left')];
  if(n===84)return[l('脂肪信号变化 · 示意','fat'),l('饥饿感可能增强','brain')];
  if(n===85)return[l('饮食、活动、睡眠相互配合','gut')];
  return[];
 }
}

