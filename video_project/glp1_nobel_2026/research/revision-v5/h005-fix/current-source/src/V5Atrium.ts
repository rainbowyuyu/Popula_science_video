import * as T from 'three';
import {V,mat,smooth,visibility,Label} from './visual';
/** Source cavity FJ2425 is retained in shared atlas coordinates. Dots show
 * qualitatively slower local transport; no AF diagnostic/CFD claim. */
export class V5Atrium{
 root=new T.Group();center=V();private dots:T.Mesh[]=[];private curve?:T.CatmullRomCurve3;private clot=new T.Group();private weight=0;
 constructor(heart:T.Group){
  const cavity=heart.getObjectByName('FJ2425_Cavity_of_left_atrium');
  if(!cavity)throw Error('Reference left atrial cavity is missing');
  const bounds=new T.Box3().setFromObject(cavity),size=bounds.getSize(V());bounds.getCenter(this.center);
  const points=Array.from({length:32},(_,i)=>{const a=i/32*2*Math.PI;return this.center.clone().add(V(size.x*.23*Math.cos(a),size.y*.20*Math.sin(a),size.z*.11*Math.sin(a*2)));});
  this.curve=new T.CatmullRomCurve3(points,true);
  const wall=heart.getObjectByName('FJ2438_Wall_of_left_atrium');
  wall?.traverse(o=>{if(o instanceof T.Mesh){const clone=new T.Mesh(o.geometry,mat('#b37268',.30,.57));clone.matrix.copy(o.matrixWorld);clone.matrixAutoUpdate=false;this.root.add(clone);}});
  for(let i=0;i<18;i++){const dot=new T.Mesh(new T.SphereGeometry(.00055,12,8),mat('#6e9990',.85));dot.userData.annotation=true;dot.name='atrial-flow-reference-marker';this.root.add(dot);this.dots.push(dot);}
  this.clot.position.copy(this.center).add(V(size.x*.14,-size.y*.16,0));
  for(let i=0;i<9;i++){const cell=new T.Mesh(new T.SphereGeometry(.0009,16,12),mat('#b57c67',.85));cell.position.set(Math.cos(i*2.4)*.0015,(i%3)*.0005,Math.sin(i*2.4)*.0008);this.clot.add(cell);}this.root.add(this.clot);
  this.root.userData={source:'BodyParts3D FJ2425 cavity / FJ2438 wall',units:'metres',cavityBounds:[bounds.min.toArray(),bounds.max.toArray()],representation:'qualitative flow markers; illustrative clot, not a patient scan or CFD'};
 }
 getAnchors(){return{leftAtrium:this.center.clone(),atrialClot:this.clot.position.clone()};}
 update(time:number,weight:number,progress:number){
  this.weight=weight;visibility(this.root,weight);
  this.dots.forEach((d,i)=>{const q=((time*.035+i/18)%1+1)%1;d.position.copy(this.curve!.getPoint(q));});
  visibility(this.clot,weight*smooth(progress/.55));
 }
 labels():Label[]{return this.weight>.3?[{text:'左心房',point:this.center.clone(),side:'right',weight:this.weight},{text:'血流淤滞 · 机制示意',point:this.clot.position.clone(),side:'left',weight:this.weight}]:[];}
}
