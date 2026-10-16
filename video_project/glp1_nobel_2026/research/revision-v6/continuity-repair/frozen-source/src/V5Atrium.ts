import * as T from 'three';
import {V,mat,smooth,visibility,Label} from './visual';
/** Source cavity FJ2425 is retained in shared atlas coordinates. Dots show
 * qualitatively slower local transport; no AF diagnostic/CFD claim. */
export class V5Atrium{
 root=new T.Group();center=V();private dots:T.Mesh[]=[];private curve?:T.CatmullRomCurve3;private clot=new T.Group();private weight=0;private reactionSignals:T.Mesh[]=[];private treatment=0;
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
  // These gold pulses encode reaction activity, not molecules or blood cells.
  // Their size is deliberately a diagram marker and has no anatomical claim.
  for(let i=0;i<12;i++){const pulse=new T.Mesh(new T.SphereGeometry(.00009,10,8),mat('#c09a54',.8));pulse.name='coagulation-reaction-activity-marker';pulse.userData.annotation=true;this.root.add(pulse);this.reactionSignals.push(pulse);}
  this.root.userData={source:'BodyParts3D FJ2425 cavity / FJ2438 wall',units:'metres',cavityBounds:[bounds.min.toArray(),bounds.max.toArray()],representation:'qualitative flow markers; illustrative clot, not a patient scan or CFD'};
 }
 getAnchors(){return{leftAtrium:this.center.clone(),atrialClot:this.clot.position.clone()};}
 update(time:number,weight:number,progress:number,markerWeight=weight,treatment=0){
  this.weight=weight;this.treatment=treatment;visibility(this.root,weight);this.root.visible=Math.max(weight,markerWeight)>.0001;
  this.dots.forEach((d,i)=>{const q=((time*.035+i/18)%1+1)%1;d.position.copy(this.curve!.getPoint(q));visibility(d,markerWeight);});
  // Millimetre clot markers must recede before the true micrometre layer.
  // Keep their formation progress through the following treatment sentence.
  visibility(this.clot,markerWeight*smooth(progress/.55));
  const inhibition=smooth((treatment-.10)/.70);
  this.reactionSignals.forEach((signal,i)=>{
   const q=(time*.19+i/12)%1,a=i*2.39996;
   const start=V(Math.cos(a)*.0035,(i%3-1)*.0025,Math.sin(a)*.0025);
   signal.position.copy(this.clot.position).add(start.multiplyScalar(1-.80*q));
   visibility(signal,markerWeight*smooth(progress/.55)*smooth(Math.min(q,1-q)/.10)*(1-.88*inhibition));
  });
 }
 labels():Label[]{return this.weight>.3?[{text:'左心房',point:this.center.clone(),side:'right',weight:this.weight},{text:this.treatment>.10?'凝血反应减少 · 示意':'血流淤滞 · 机制示意',point:this.clot.position.clone(),side:'left',weight:this.weight}]:[];}
}
