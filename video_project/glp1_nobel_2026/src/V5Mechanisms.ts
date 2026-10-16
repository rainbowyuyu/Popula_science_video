import * as T from 'three';
import {V,mat,smooth,clamp,visibility,Label} from './visual';
import {V8MuscleTransport} from './V8MuscleTransport';

const phase=(x:number)=>((x%1)+1)%1;
const near=(d:number,a:number,b:number)=>1-smooth(Math.log(Math.max(d,1e-12)/a)/Math.log(b/a));
const sphere=(r:number,color:string,alpha=1)=>new T.Mesh(new T.SphereGeometry(r,20,14),mat(color,alpha,.57));
function tube(points:T.Vector3[],radius:number,color:string,alpha=1){const unit=Math.max(radius,...points.map(p=>p.length()),1e-12),curve=new T.CatmullRomCurve3(points.map(p=>p.clone().divideScalar(unit)),false,'catmullrom',.5),geo=new T.TubeGeometry(curve,28,radius/unit,8,false);geo.scale(unit,unit,unit);return new T.Mesh(geo,mat(color,alpha,.6));}

/** Fixed-coordinate, representative mechanism models. Transport dots are
 * labelled symbols, not glucose molecules rendered at an invented size.
 * Vesicle ~100 nm, GLUT4 ~10 nm, platelet ~3 µm, fibrin ~100 nm.
 * Motions illustrate pathways; they are not patient-specific simulations. */
export class V5Mechanisms{
 private transport=new V8MuscleTransport();
 root=new T.Group();muscle=this.transport.root;clot=new T.Group();muscleContext=new T.Group();private membraneContext=new T.Group();

 // Tissue-scale glucose markers bridge the 45 μm myofibre context and the
 // nanometre GLUT4 shot. They are direction cues, not molecular-size claims.
 private glucose:T.Mesh[]=[];private platelets:T.Group[]=[];private fibers:T.Mesh[]=[];private coagulationSignals:T.Mesh[]=[];

 private lastMuscle=0;private lastClot=0;private mechanism='';
 private narrationId='';private narrationProgress=0;
 private insulinArrivals:T.Mesh[]=[];
 constructor(){
  this.root.name='v5-linked-treatment-and-activity-mechanisms';this.root.add(this.muscle,this.muscleContext,this.membraneContext,this.clot);
  this.muscle.name='muscle-membrane-GLUT4-vesicle-recruitment';
  this.clot.name='platelet-plug-and-fibrin-formation-reference';
  // Fibres occupy the same anatomical patch as the membrane, at every scale.
  for(let i=-8;i<=8;i++){
   const fibre=new T.Mesh(new T.CylinderGeometry(24e-6,24e-6,.006,24,1,true),mat('#b78878',.36,.72));
   fibre.rotation.z=Math.PI/2;fibre.position.set(0,i*50e-6,-25e-6);this.muscleContext.add(fibre);
   for(let j=-9;j<=9;j++){const line=new T.Mesh(new T.TorusGeometry(24.3e-6,.25e-6,4,24),mat('#cfae99',.24));line.rotation.y=Math.PI/2;line.position.set(j*14e-6,i*50e-6,-25e-6);this.muscleContext.add(line);}
  }
  // A restrained stream of larger teaching markers makes the spoken
  // “肌肉把糖当燃料” clause legible before the camera enters the
  // nanometre membrane. Their radius is intentionally tissue-scale and is
  // recorded as such, so they do not masquerade as literal glucose size.
  for(let i=0;i<14;i++){
   const marker=sphere(1.8e-6,'#bd9c59',.68);marker.name='tissue-scale-glucose-direction-marker';marker.userData.annotation=true;this.muscleContext.add(marker);this.glucose.push(marker);
  }
  const contextPlane=new T.Mesh(new T.PlaneGeometry(14e-6,10e-6,16,12),mat('#c7ae98',.22));contextPlane.position.z=-.26e-6;this.membraneContext.add(contextPlane);
  for(let i=0;i<65;i++){const a=i*2.39996,r=.55e-6+Math.sqrt((i+.5)/65)*6e-6;const v=sphere(45e-9,'#71a099',.35);v.position.set(Math.cos(a)*r,Math.sin(a)*r,-.18e-6);this.membraneContext.add(v);}
  // A persistent platelet base remains during treatment; only NEW recruitment
  // is reduced. Neither antiplatelets nor anticoagulants dissolve this base.
  const tissue=new T.PlaneGeometry(240e-6,150e-6,36,28);tissue.rotateX(-Math.PI/2);const tp=tissue.getAttribute('position');
  for(let i=0;i<tp.count;i++){const x=tp.getX(i),z=tp.getZ(i);tp.setY(i,1.2e-6*Math.sin(x/17e-6)*Math.cos(z/19e-6)+x*x/.002);}
  tissue.computeVertexNormals();const wall=new T.Mesh(tissue,mat('#cea495',.46,.78));wall.position.set(0,-7e-6,-4e-6);this.clot.add(wall);
  for(let i=0;i<26;i++){
   const p=new T.Group(),cell=sphere(1.5e-6,'#ba9479',.94);cell.scale.y=.34;p.add(cell);
   for(let k=0;k<5;k++){const a=k*Math.PI*.4;p.add(tube([V(0,0,0),V(1.2e-6*Math.cos(a),.2e-6,1.2e-6*Math.sin(a)),V(2e-6*Math.cos(a),.4e-6,2e-6*Math.sin(a))],.13e-6,'#b89680',.8));}
   this.clot.add(p);this.platelets.push(p);
  }
  for(let i=0;i<38;i++){
   const a=V((phase(i*.618)-.5)*28e-6,-3e-6+phase(i*.71)*8e-6,(phase(i*.37)-.5)*14e-6);
   const b=V((phase(i*.413+.3)-.5)*28e-6,-3e-6+phase(i*.63)*8e-6,(phase(i*.57)-.5)*14e-6);
   const strand=tube([a,a.clone().lerp(b,.5).add(V(0,.8e-6,0)),b],.06e-6,'#65928d',.87);this.clot.add(strand);this.fibers.push(strand);
  }
  for(let i=0;i<14;i++){const dot=sphere(.38e-6,'#c4a15d',.9);dot.name='coagulation-activity-indicator-not-molecule-size';dot.userData.annotation=true;this.clot.add(dot);this.coagulationSignals.push(dot);}
  this.root.userData={units:'metres',referenceVesicleDiameter:90e-9,referenceGlut4Height:10e-9,plateletDiameter:3e-6,fibrinDiameter:120e-9,tissueScaleGlucoseMarkerRadius:1.8e-6,representation:'Mechanism animation; not quantitative therapeutic prediction; glucose dots are direction markers. Tissue-scale markers are visual bridges, not molecular-size glucose.'};
 }
 setAnchors(muscle:T.Vector3,clot:T.Vector3){this.muscle.position.copy(muscle);this.muscleContext.position.copy(muscle);this.membraneContext.position.copy(muscle);this.clot.position.copy(clot);}
 getAnchors(){return{muscleCell:this.muscle.position.clone(),clotDetail:this.clot.position.clone()};}
 setNarrationContext(id:string,progress:number){this.narrationId=id;this.narrationProgress=clamp(progress);}
 update(time:number,mechanism:string,progress:number,distance:number,muscleWeight:number,clotWeight:number,continuityProgress=progress){
  this.mechanism=mechanism;const p=clamp(progress);
  this.lastMuscle=muscleWeight*near(distance,2e-6,35e-6);this.lastClot=clotWeight*near(distance,.0003,.002);
  visibility(this.muscleContext,muscleWeight*near(distance,.004,.08)*(1-near(distance,1e-6,20e-6)));
  visibility(this.membraneContext,muscleWeight*near(distance,15e-6,80e-6)*(1-near(distance,1.8e-6,5e-6)));
  visibility(this.muscle,this.lastMuscle);visibility(this.clot,this.lastClot);
  this.transport.update(time,this.narrationId,this.narrationProgress,continuityProgress,this.lastMuscle,mechanism);
  const n=Number(this.narrationId.slice(1));
  // Keep the fuel cue in the fibre context for both contraction clauses. It
  // eases in with the measured narration rather than blinking at the clip
  // boundary, then retires before the membrane-scale handoff.
  const fuelCue=(n===14||n===15) ? .20+.46*smooth(continuityProgress) : 0;
  this.glucose.forEach((marker,i)=>{
   const u=phase(time*.055+i*.071);
   const row=(i%7)-3;
   // Stay inside the representative 200 μm field seen by the 45 μm shot;
   // a millimetre-long path would sit outside the lens and read as missing.
   marker.position.set((-100e-6+200e-6*u),row*50e-6,-25e-6+(i%2?3e-6:-3e-6));
   const pulse=.84+.12*Math.sin(time*1.7+i);
   const material=marker.material as T.MeshStandardMaterial;
   material.opacity=.68*pulse;
   visibility(marker,muscleWeight*near(distance,.004,.08)*(1-near(distance,1e-6,20e-6))*fuelCue);
  });
  // Formation scene names must never activate medication branches.
  const antiplatelet=mechanism==='antiplatelet',anticoagulant=mechanism==='anticoagulant';
  const inhibition=smooth((p-.16)/.62);
  this.platelets.forEach((cell,i)=>{
   const stable=i<8,a=i*2.3999,r=(stable?3:9)*1e-6;
   const rest=V(Math.cos(a)*r,-3e-6+(i%4)*1.35e-6,Math.sin(a)*r*.5);
   const u=phase(time*.045+i*.13),flow=V(-35e-6+70e-6*u,9e-6+(i%3)*2e-6,Math.sin(a)*5e-6);
   // Recruitment is visualized at a new site beside the established plug.
   // Incoming platelets remain in transit; the existing eight never detach.
   const approach=Math.sin(Math.PI*u)**6;
   const binding=stable?1:.62*approach*(antiplatelet?1-inhibition:1);
   cell.position.copy(flow).lerp(rest,binding);cell.rotation.set(.2*Math.sin(a),time*.07,.12*Math.sin(time*.4+i));
   visibility(cell,this.lastClot*(stable?1:smooth(Math.min(u,1-u)/.06)));
  });
  this.fibers.forEach((f,i)=>{
   const stable=i<9,established=antiplatelet||anticoagulant||mechanism==='bleeding_risk';
   const formation=established?1:smooth((continuityProgress-.03-i*.001)/.22);
   visibility(f,this.lastClot*(stable?.78:formation));
  });
  this.coagulationSignals.forEach((dot,i)=>{
   const u=phase(time*.10+i/14),block=anticoagulant?inhibition:0;
   // The existing fibrin scaffold remains. With anticoagulation, fewer new
   // reaction cues arrive at it; the stream continues past the formation site.
   dot.position.set(-24e-6+48e-6*u,12e-6-(1-block)*10e-6*Math.sin(Math.PI*u)**4,(i%4-1.5)*3e-6);
   (dot.material as T.MeshStandardMaterial).color.set('#c4a15d').lerp(new T.Color('#96a7a0'),block*.72);
   visibility(dot,this.lastClot*smooth(Math.min(u,1-u)/.1));
  });
 }
 labels():Label[]{
  if(this.lastMuscle>.3)return this.transport.labels();
  if(this.lastClot>.3)return[
   {text:/anticoag/.test(this.mechanism)?'减少新增凝血网':/antiplatelet/.test(this.mechanism)?'减少新增血小板聚集':'血小板聚集',point:this.clot.position.clone().add(V(8e-6,3e-6,0)),side:'right',weight:this.lastClot},
   {text:/anticoag|antiplatelet/.test(this.mechanism)?'已形成部分仍保留':'纤维蛋白网',point:this.clot.position.clone().add(V(-3e-6,-3e-6,0)),side:'left',weight:this.lastClot},
  ];return[];
 }
}
