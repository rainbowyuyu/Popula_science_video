import * as T from 'three';
import {V,mat,clamp,smooth,visibility,Label} from './visual';

/** Frame-driven regional teaching overlays on the actual atlas surfaces.
 * They show qualitative tissue changes, not measured fat fractions. */
export class V7MacroActions{
 readonly root=new T.Group();private liver=new T.Group();private fat=new T.Group();private muscle=new T.Group();
 private a:Record<string,T.Vector3>={};private id='';private weight=0;
 setActors(a:Record<string,T.Vector3>,organs:Record<string,T.Object3D>){
  this.a=a;this.root.add(this.liver,this.fat,this.muscle);
  const overlay=(source:T.Object3D,target:T.Group,color:string,offset:number)=>{
   source.updateWorldMatrix(true,true);const center=new T.Box3().setFromObject(source).getCenter(V());
   source.traverse(o=>{if(!(o instanceof T.Mesh)||o.userData.skinDepth)return;const g=o.geometry.clone();g.applyMatrix4(o.matrixWorld);const p=g.getAttribute('position'),colors:number[]=[];
    for(let i=0;i<p.count;i++){const q=V().fromBufferAttribute(p,i),dir=q.clone().sub(center).normalize();q.addScaledVector(dir,offset);p.setXYZ(i,q.x,q.y,q.z);const c=new T.Color(color),speck=.5+.5*Math.sin(q.x*365+q.z*92)*Math.cos(q.y*287-q.x*74);c.lerp(new T.Color('#d9ad73'),speck*.55);colors.push(c.r,c.g,c.b);}g.computeVertexNormals();g.setAttribute('color',new T.Float32BufferAttribute(colors,3));const material=mat(color,.72,.7);material.vertexColors=true;material.color.set('#ffffff');material.polygonOffset=true;material.polygonOffsetFactor=-2;material.polygonOffsetUnits=-2;material.depthWrite=false;target.add(new T.Mesh(g,material));
   });return center;
  };
  overlay(organs.liver,this.liver,'#b38268',.0003);
  const rectus=organs.thighMuscles?.getObjectByName('FJ1433M_Left_rectus_femoris');if(rectus)overlay(rectus,this.muscle,'#bd9785',.0006);
  for(const name of ['leftKidney','rightKidney'])if(organs[name]){const region=new T.Group();const center=overlay(organs[name],region,'#d1bd85',.009);region.userData.center=center.toArray();this.fat.add(region);}
  this.root.userData={representation:'Qualitative surface map for liver fat; representative perirenal fat envelope; not patient measurement',units:'metres'};
 }
 update(time:number,id:string,p:number,weight:number){
  this.id=id;this.weight=weight;const n=Number(id.slice(1));
  const liverWeight=n===33?smooth((p-.1)/.72):n===34?1:0;
  visibility(this.liver,weight*.60*liverWeight);
  const fatWeight=n===56?smooth((p-.08)/.7):n===82?1-.80*smooth((p-.12)/.74):0;
  visibility(this.fat,weight*.34*fatWeight);
  visibility(this.muscle,weight*(n===43||n===44?.32+.06*Math.sin(time*1.4):0));
 }
 labels():Label[]{
  if(this.weight<.3)return[];const n=Number(this.id.slice(1)),l=(text:string,key:string):Label=>({text,point:this.a[key].clone(),weight:this.weight,side:'right'});
  if(n===33)return[l('肝内脂肪积累 · 示意','liver')];
  if(n===43||n===44)return[l('肌肉不适 · 位置示意','muscle')];
  if(n===56)return[l('肾周脂肪 · 示意','leftKidney')];
  if(n===82)return[l('多余脂肪逐渐减少','leftKidney')];
  return[];
 }
}

/** Contents stay inside World.gastricSafeRegion's verified convex route.
 * Symbols represent relative retained contents, not individual food parcels
 * passing through an uncut stomach wall. Emptying is shown by gradual inventory
 * reduction; slow-emptying keeps more content over the same schematic interval.
 */
export function updateGastricContents(food:T.Mesh[],points:T.Vector3[],time:number,id:string,p:number,weight:number){
 const n=Number(id.slice(1));
 const delayed=[25,28,29,30].includes(n);
 const amount=n===25?1-.32*smooth(p):n===28?.72:n===29?.66:n===30?.66-.23*smooth(p):n===32?.52:.65;
 const speed=delayed?.013:.033;
 food.forEach((m,i)=>{
  const q=((time*speed+i/food.length)%1+1)%1,at=q*points.length,k=Math.floor(at);
  if(points.length)m.position.copy(points[k]).lerp(points[(k+1)%points.length],at-k);
  const retained=1-smooth((i/food.length-amount+.06)/.12);
  visibility(m,weight*retained);
  m.userData.representation='relative gastric content marker; inventory teaching animation';
 });
}
