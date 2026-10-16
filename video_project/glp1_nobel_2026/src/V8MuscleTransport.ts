import * as T from 'three';
import {V,mat,smooth,clamp,visibility,Label} from './visual';

const nm=1e-9;
const phase=(x:number)=>((x%1)+1)%1;
const bead=(r:number,c:string,a=1)=>new T.Mesh(new T.SphereGeometry(r*nm,18,12),mat(c,a,.47));

/** Representative membrane trafficking in metres. GLUT4 remains embedded in
 * the vesicle membrane until fusion. Twelve helices indicate the transporter;
 * alternating access is schematic, not an open ion channel or atomic model.
 * Reference: Bryant & Gould, Curr Opin Cell Biol (2020),
 * doi:10.1016/j.ceb.2020.02.006. Glucose dots are direction symbols. */
export class V8MuscleTransport {
 readonly root=new T.Group();
 private surface=new T.Group();private vesicles:T.Mesh[]=[];
 private fiberField:T.Mesh[]=[];private exerciseGlucose:T.Mesh[]=[];
 private gates:T.Group[]=[];private gateDomains:T.Group[][]=[];
 private dockCovers:T.Mesh[]=[];private sugars:T.Mesh[]=[];
 private receptor=new T.Group();private signalNodes:T.Mesh[]=[];private insulinArrivals:T.Mesh[]=[];
 private ligand:T.Mesh;private contraction:T.Mesh;
 private availability:number[]=[];private weight=0;private id='';private p=0;
 private lanes=[-125,0,125];private fused:number[]=[];
 constructor(){
  this.root.name='V8-continuous-GLUT4-membrane-trafficking';
  this.root.userData={units:'metres',vesicleDiameter:80*nm,transporterHeight:10*nm,membraneThickness:5*nm,representation:'Schematic membrane trafficking and alternating access; neither molecular dynamics nor relative uptake measurements.'};
  this.root.add(this.surface,this.receptor);
  // A single lipid membrane, with transporter-sized apertures filled until
  // a GLUT4-containing vesicle has actually fused at the corresponding site.
  const shape=new T.Shape();shape.moveTo(-230,-72);shape.lineTo(230,-72);shape.lineTo(230,92);shape.lineTo(-230,92);shape.closePath();
  for(const x of this.lanes){const h=new T.Path();h.absellipse(x,18,4.6,4.6,0,Math.PI*2,true);shape.holes.push(h);}
  const g=new T.ExtrudeGeometry(shape,{depth:5,bevelEnabled:false,curveSegments:16,steps:1});
  g.rotateX(-Math.PI/2);g.scale(nm,nm,nm);g.translate(0,-2.5*nm,0);
  this.surface.add(new T.Mesh(g,mat('#baa88d',.56,.7)));
  // A restrained myofibril field keeps the nanometre shot tied to the
  // muscle tissue that the previous camera just left.  These are thin,
  // low-opacity context fibres behind the membrane (not extra vessels or a
  // second membrane), and are shown only in the sustained activity hold.
  for(let i=0;i<6;i++){
   const z=(-58+i*23)*nm;
   const points=Array.from({length:9},(_,j)=>new T.Vector3((-220+j*55)*nm,(-11+1.5*Math.sin(j*.9+i))*nm,z+5.5*Math.sin(j*.78+i)*nm));
   const curve=new T.CatmullRomCurve3(points,false,'catmullrom',.5);
   const fibre=new T.Mesh(new T.TubeGeometry(curve,32,2.2*nm,6,false),mat('#bd9a91',.17,.78));
   fibre.name='low-opacity-myofibril-context';this.root.add(fibre);this.fiberField.push(fibre);
  }
  // A visible bilayer along the open near edge makes inside/outside legible.
  for(let row=0;row<2;row++)for(let i=0;i<116;i++){
   const h=bead(1.5,'#dbcbb2',.9);h.position.set((-228+i*4)*nm,(row?2.7:-2.7)*nm,72*nm);this.surface.add(h);
  }
  for(let i=0;i<3;i++){
   const cover=new T.Mesh(new T.CylinderGeometry(4.7*nm,4.7*nm,5*nm,24),mat('#baa88d',.62));
   cover.position.set(this.lanes[i]*nm,0,-18*nm);this.surface.add(cover);this.dockCovers.push(cover);
   const v=bead(40,'#55918b',.23);v.name='GLUT4-storage-vesicle-membrane-80nm';this.root.add(v);this.vesicles.push(v);
   // Rings on the vesicle are geometry, not an unrelated outline or overlay.
   const ring=new T.Mesh(new T.TorusGeometry(40*nm,.6*nm,5,64),mat('#72a49b',.45));ring.rotation.x=Math.PI/2;v.add(ring);
   // Geometry is already in metres, so cancel the parent's unit sphere scale.
   const gate=new T.Group(),domains:T.Group[]=[];
   for(const side of [-1,1]){
    const domain=new T.Group();
    for(let k=0;k<6;k++){
     const a=(k/5-.5)*Math.PI*.84+(side===1?0:Math.PI);
     const helix=new T.Mesh(new T.CylinderGeometry(.86*nm,.86*nm,10*nm,10),mat('#286f71',1,.35));
     helix.position.set(Math.cos(a)*3.1*nm,0,Math.sin(a)*3.1*nm);domain.add(helix);
    }
    gate.add(domain);domains.push(domain);
   }
   gate.name='GLUT4-12-helix-alternating-access-schematic';this.root.add(gate);this.gates.push(gate);this.gateDomains.push(domains);
  }
  // Insulin binds to a membrane receptor; a restrained intracellular trail
  // carries the signal towards the waiting vesicles instead of flying off it.
  for(const side of [-1,1]){
   const stem=new T.Mesh(new T.CylinderGeometry(1.4*nm,1.4*nm,17*nm,12),mat('#b88558'));
   stem.position.set(side*3.5*nm,3*nm,0);stem.rotation.z=side*.13;this.receptor.add(stem);
   const crown=bead(3.2,'#b88558');crown.position.set(side*5.0*nm,12*nm,0);this.receptor.add(crown);
  }
  this.receptor.position.set(-202*nm,0,-18*nm);
  this.ligand=bead(3,'#b87660');this.root.add(this.ligand);
  this.contraction=bead(4,'#678fac',.9);this.root.add(this.contraction);
  for(let i=0;i<9;i++){const dot=bead(1.5,'#b6884e',.88);dot.userData.annotation=true;this.root.add(dot);this.signalNodes.push(dot);}
  for(let i=0;i<8;i++){const dot=bead(3,'#b87660',.92);dot.userData.annotation=true;dot.name='compensating-insulin-signal-marker';this.root.add(dot);this.insulinArrivals.push(dot);}
  for(let i=0;i<21;i++){const sugar=bead(2.3,'#c39b43',.98);sugar.userData.annotation=true;sugar.name='glucose-transport-direction-symbol';this.root.add(sugar);this.sugars.push(sugar);}
  // A few smaller, softer glucose direction cues become visible during the
  // final exercise explanation.  Their radius is kept below the GLUT4
  // diameter so they read as particles in the same physical field.
  for(let i=0;i<14;i++){const dot=bead(1.25,'#d0ab58',.30);dot.userData.annotation=true;dot.name='exercise-glucose-direction-cue';this.root.add(dot);this.exerciseGlucose.push(dot);}
 }
 update(time:number,id:string,sp:number,p:number,weight:number,mechanism:string){
  this.id=id;this.p=sp;this.weight=weight;visibility(this.root,weight);
  const n=Number(id.slice(1)),sequence=n>=8&&n<=15,exercise=sequence?n>=13:/exercise|contraction|walk/.test(mechanism);
  // Keep the tissue context quiet while the insulin transport is introduced;
  // let it breathe in as h015 settles on the sustained activity mechanism.
  const fibreCue=n===15?(0.52+0.18*Math.sin(time*1.15)):0;
  this.fiberField.forEach((f,i)=>{f.position.z=(i%2?1:-1)*.7e-9*Math.sin(time*.8+i*.6);visibility(f,weight*fibreCue*(.78+.08*Math.sin(time*.7+i)));});
  const recovery=sequence&&n>=13?(n===13?.28*smooth(sp):n===14?.28+.72*smooth((sp-.12)/.42):1):0;
  const resistance=(sequence?n===8?0:n===9?smooth((sp-.12)/.66):1:mechanism==='insulin_resistance'?smooth(p):0)*(1-recovery);
  const recruit=sequence?n===8?smooth((sp-.23)/.29):1:smooth((p-.10)/.65);
  this.availability=[];this.fused=[];
  this.vesicles.forEach((v,i)=>{
   // Partial insulin resistance leaves some recruitment intact, while the
   // other vesicles recycle. The contraction pathway increases recruitment.
   const docking=clamp(recruit*(1-(i===0?.07:.86)*resistance));
   const fuse=smooth((docking-.71)/.29),approach=smooth(docking/.78);
   const cy=T.MathUtils.lerp(-140,-40,approach)*(1-fuse),ry=40*(1-fuse)+2.5*fuse;
   v.position.set(this.lanes[i]*nm,cy*nm,-18*nm);v.scale.set(1,ry/40,1);
   visibility(v,weight*(1-.95*smooth((fuse-.72)/.28)));
   const gate=this.gates[i];gate.position.set(this.lanes[i]*nm,(cy+ry-2.5)*nm,-18*nm);
   // GLU transporter is on the vesicle's upper membrane, never at its centre.
   gate.rotation.z=.07*(1-fuse);this.fused.push(fuse);
   const available=smooth((fuse-.88)/.10);this.availability.push(available);
   visibility(this.dockCovers[i],weight*(1-available));
   const cycle=phase(time*.15+i*.17),tilt=Math.sin(cycle*Math.PI*2)*.11*available;
   this.gateDomains[i][0].rotation.z=tilt;this.gateDomains[i][1].rotation.z=-tilt;
  });
  this.sugars.forEach((g,i)=>{
   const lane=i%3,q=phase(time*.095+Math.floor(i/3)/7+lane*.09),active=this.availability[lane];
   // Cross at the carrier centre only after fusion. Otherwise follow a
   // parallel extracellular stream and remain outside the membrane.
   const x=this.lanes[lane]+Math.sin(q*Math.PI*2)*10*(1-active);
   const blocked=42+22*Math.cos(q*Math.PI*2),transit=73-168*q;
   g.position.set(x*nm,T.MathUtils.lerp(blocked,transit,active)*nm,-18*nm);
   const input=sequence&&n>=12?(n===12?1-.35*smooth(sp):.65):1;
   visibility(g,weight*smooth(Math.min(q,1-q)/.12)*(i>12?input:1));
  });
  const binding=sequence&&n===8?smooth((sp-.15)/.08):1;
  this.ligand.position.set(-202*nm,(65-49*binding)*nm,-18*nm);
  const compensation=sequence&&n>=10?(n===10?smooth(sp):1):0;
  this.insulinArrivals.forEach((dot,i)=>{
   const q=phase(time*.10+i/8);
   dot.position.set((-218+16*q+(i%3-1)*10*(1-q))*nm,(93-76*q)*nm,(-18+(i%2?1:-1)*8*(1-q))*nm);
   visibility(dot,weight*compensation*smooth(Math.min(q,1-q)/.16)*(exercise?.25:1));
  });
  const signalStrength=exercise?.5:1-.66*resistance;
  this.signalNodes.forEach((g,i)=>{
   const q=phase(time*.16+i/9),u=smooth(q);
   g.position.set((-199+125*u)*nm,(-9-99*Math.sin(u*Math.PI*.5))*nm,-18*nm);
   (g.material as T.MeshStandardMaterial).color.set(exercise?'#7499b1':'#bc9057');
   visibility(g,weight*binding*signalStrength*smooth(Math.min(q,1-q)/.13));
  });
  const q=phase(time*.12);
  this.contraction.position.set((207-51*q)*nm,(-112+38*q)*nm,-18*nm);visibility(this.contraction,weight*(exercise?1:0));
  this.exerciseGlucose.forEach((g,i)=>{
   const lane=i%3,qg=phase(time*.075+i*.13),x=this.lanes[lane]+Math.sin(qg*Math.PI*2+i)*18;
   const y=54-30*qg+(i%2?4:-4)*Math.sin(qg*Math.PI);
   g.position.set(x*nm,y*nm,(-18+(i%4-1.5)*2.6)*nm);
   // The cue is an editorial direction marker, not a second quantitative
   // glucose population. It gently recedes after the sentence is spoken.
   visibility(g,weight*(n===15?(.32+.24*smooth(this.p)):.0)*smooth(Math.min(qg,1-qg)/.12));
  });
 }
 labels():Label[]{
  if(this.weight<.3)return[];
  const n=Number(this.id.slice(1));
  if(n===8&&this.p<.30)return[
   {text:'胰岛素信号',point:this.ligand.getWorldPosition(V()),side:'left',weight:this.weight},
   {text:'细胞膜',point:this.surface.localToWorld(V(165*nm,0,55*nm)),side:'right',weight:this.weight},
  ];
  return[
   {text:this.fused[1]>.9?'GLUT4 · 帮助摄糖':'GLUT4 · 小泡膜上',point:this.gates[1].getWorldPosition(V()),side:'right',weight:this.weight},
   {text:n===10?'信号增多 · 响应仍弱':n===11?'葡萄糖持续送来':n===12?'减少甜饮 · 减少输入':n>=13&&n<=15?'肌肉收缩 · 增加摄糖':n===9?'膜上转运体减少':'小泡膜与细胞膜融合',point:(n>=13&&n<=15?this.contraction:n===10?this.ligand:n===11||n===12?this.sugars[2]:this.vesicles[2]).getWorldPosition(V()),side:'left',weight:this.weight},
  ];
 }
}
