import * as T from 'three';
import {ArterioleDetail} from './CardioVascularDetail';
import pressureModel from '../public/cardio/physics.json';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const q=clamp(x);return q*q*q*(q*(q*6-15)+10)};
const phase=(x:number)=>((x%1)+1)%1;
const TAU=Math.PI*2;
const ramp=(p:number,a:number,b:number)=>ease((p-a)/(b-a));
const C={wall:'#b7756d',inner:'#dba796',teal:'#377f7d',gold:'#bd9c59',red:'#a94e46',ink:'#466f73',tissue:'#c9af9b'};
function mat(color:string,opacity=1,roughness=.52){const m=new T.MeshStandardMaterial({color,roughness,metalness:.025,transparent:true,opacity,depthWrite:false,side:T.DoubleSide});m.userData.baseAlpha=opacity;return m;}
function ball(radius:number,color:string,alpha=1,detail=20){return new T.Mesh(new T.SphereGeometry(radius,detail,Math.max(12,Math.round(detail*.65))),mat(color,alpha));}
function tube(points:T.Vector3[],radius:number,color:string,alpha=1,segments=72){
 // Normalize before spline evaluation: Three's centripetal small-distance
 // guard otherwise bends a 15 nm receptor stem into a micrometre spike.
 const unit=Math.max(radius,...points.map(p=>p.length()),1e-12),curve=new T.CatmullRomCurve3(points.map(p=>p.clone().divideScalar(unit)),false,'catmullrom',.5);
 const geometry=new T.TubeGeometry(curve,segments,radius/unit,12,false);geometry.scale(unit,unit,unit);return new T.Mesh(geometry,mat(color,alpha));
}
function opacity(object:T.Object3D,value:number){object.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){for(const m of Array.isArray(o.material)?o.material:[o.material])m.opacity=(m.userData.baseAlpha??1)*clamp(value)}});}
function attach<TObject extends T.Object3D>(parent:T.Object3D,object:TObject,name:string,position?:T.Vector3){object.name=name;if(position)object.position.copy(position);parent.add(object);return object;}
function redCell(radius:number){
 const profile=[[0,.12],[.25,.17],[.56,.28],[.84,.23],[1,0],[.84,-.23],[.56,-.28],[.25,-.17],[0,-.12]];
 return new T.Mesh(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r*radius,y*radius)),24),mat(C.red));
}

export type CardioMode='pressure'|'resistance'|'salt'|'renal'|'nephron'|'lipid'|'clearance'|'lipid_wall'|'plaque'|'thrombus';
export type CardioVisibility={artery:number;arteriole:number;lipid:number;nephron:number;lipidWall:number};
export type CardioArterialContext={pressureWeight:number;plaqueProgress:number;clotProgress:number;lesionVisibility:number};
export type CardioLabel={text:string;point:T.Vector3;side:'left'|'right'};
export const CARDIO_SCALE={arteryLumenDiameter:.010,arterioleLumenDiameter:200e-6,redCellDiameter:7.5e-6,vldlDiameter:50e-9,ldlDiameter:22e-9,glomerulusDiameter:200e-6,nephronSegmentExtent:2.4e-3} as const;

/**
 * Four co-located teaching details in physical metres. Public roots have unit
 * scale; place each at its anatomical anchor, never resize it for composition.
 * Visibility belongs to the continuous camera hand-off, not clip boundaries.
 * These are mechanism animations; no patient CFD or molecular dynamics claim.
 */
export class V5CardioDetail{
 readonly root=new T.Group();
 readonly arteryRoot=new T.Group();
 readonly arterioleRoot=new T.Group();
 readonly lipidRoot=new T.Group();
 readonly lipidWallRoot=new T.Group();
 readonly nephronRoot=new T.Group();
 readonly arteriole=new ArterioleDetail();
 private weights:CardioVisibility={artery:0,arteriole:0,lipid:0,nephron:0,lipidWall:0};
 private arteryShellWeight=1;
 private arterialPressure=90;
 private shell:T.Mesh[]=[];private shellBases:Float32Array[]=[];
 private pressureArrows:{root:T.Group;shaft:T.Mesh;tip:T.Mesh;angle:number;x:number}[]=[];
 private flow:T.InstancedMesh;private dummy=new T.Object3D();
 private particle=new T.Group();private lipidCore:T.Mesh;private lipidShell:T.Mesh;private lipidProtein:T.Mesh;
 private cargo:{mesh:T.Mesh;seed:number}[]=[];private receptor=new T.Group();private receptorArms:T.Group[]=[];private vesicle:T.Mesh;private membrane:T.Mesh;
 private lipidPath:T.CatmullRomCurve3;private lipidRadius=25e-9;
 private plaqueRoot=new T.Group();private plaqueCore:T.Mesh;private plaqueCap:T.Mesh;private thrombus:T.Group;private rupture:T.Mesh;
 private foam:{root:T.Group;lipid:T.InstancedMesh;index:number}[]=[];
 private retained:T.InstancedMesh;private platelets:T.InstancedMesh;private fibrin:T.Group;
 private nephronCurve:T.CatmullRomCurve3;private nephronBlood:T.CatmullRomCurve3;private filtrate:T.InstancedMesh;private renalCells:T.Mesh[]=[];private transfers:T.InstancedMesh;
 private corpuscle=new T.Group();private tubuleRoot=new T.Group();private lastMode:CardioMode='pressure';
 private crossing:T.Group[]=[];private crossingVesicles:T.Mesh[]=[];
 private calciumSignals:T.Mesh[]=[];private urinarySignals:T.Mesh[]=[];
 private recruitedReceptors:{receptor:T.Group;particle:T.Group;x:number}[]=[];
 constructor(){
  this.root.name='cardiometabolic-mechanisms-in-physical-metres';
  this.arteryRoot.name='arterial-wall-10mm-lumen';this.arterioleRoot.name='arteriole-200um-lumen';this.lipidRoot.name='lipoprotein-50nm-to-22nm';this.nephronRoot.name='nephron-segment-2mm';
  this.root.add(this.arteryRoot,this.arterioleRoot,this.lipidRoot,this.nephronRoot,this.lipidWallRoot);this.arterioleRoot.add(this.arteriole.root);
  this.lipidWallRoot.name='LDL-endothelial-transport-and-retention-microscopic-fragment';
  this.arteryRoot.userData={units:'metres',lumenDiameter:CARDIO_SCALE.arteryLumenDiameter};
  this.arterioleRoot.userData={units:'metres',lumenDiameter:CARDIO_SCALE.arterioleLumenDiameter};
  this.lipidRoot.userData={units:'metres',vldlDiameter:50e-9,ldlDiameter:22e-9,context:'Membrane fragment; no complete hepatocyte at nanometre scale.'};
  this.nephronRoot.userData={units:'metres',representative:true,context:'Schematic cortical nephron segment, not a patient reconstruction.'};
  this.buildArtery();
  this.flow=new T.InstancedMesh(new T.SphereGeometry(.000075,10,7),mat('#337e81',.76),64);this.flow.name='flow-markers-not-blood-cell-size';this.flow.frustumCulled=false;this.arteryRoot.add(this.flow);
  const lipid=this.buildLipid();this.lipidCore=lipid.core;this.lipidShell=lipid.shell;this.lipidProtein=lipid.protein;this.vesicle=lipid.vesicle;this.membrane=lipid.membrane;this.lipidPath=lipid.path;
  const plaque=this.buildPlaque();this.plaqueCore=plaque.core;this.plaqueCap=plaque.cap;this.thrombus=plaque.thrombus;this.rupture=plaque.rupture;this.retained=plaque.retained;this.platelets=plaque.platelets;this.fibrin=plaque.fibrin;
  const renal=this.buildNephron();this.nephronCurve=renal.curve;this.nephronBlood=renal.blood;this.filtrate=renal.filtrate;this.transfers=renal.transfers;
  this.buildLipidWall();
  for(let i=0;i<12;i++){const signal=new T.Mesh(new T.ConeGeometry(5e-6,18e-6,12),mat('#b08d53',.88));signal.rotation.z=Math.PI;signal.name='calcium-entry-direction-annotation';signal.userData.annotation=true;this.arterioleRoot.add(signal);this.calciumSignals.push(signal);}
  for(let i=0;i<24;i++){const signal=ball(2.5e-6,i%2?'#659a96':'#c09f63',.88,10);signal.name='water-sodium-excretion-direction-marker';signal.userData.annotation=true;this.nephronRoot.add(signal);this.urinarySignals.push(signal);}
  this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.userData.baseAlpha===undefined)m.userData.baseAlpha=m.opacity;m.userData.frameAlpha=m.opacity}}});
  this.update(0,'pressure',0);
 }
 private buildArtery(){
  const length=.040,nx=72,nt=72,start=Math.PI*.91,span=Math.PI*1.18;
  for(const [inner,outer,color,alpha] of [[.005,.00514,C.inner,.87],[.00514,.00575,C.wall,.82],[.00575,.0061,C.tissue,.32]] as [number,number,string,number][]){
   const p:number[]=[],ix:number[]=[];
   for(let side=0;side<2;side++)for(let i=0;i<=nx;i++)for(let j=0;j<=nt;j++){const theta=start+span*j/nt,r=side?inner:outer;p.push(length*(i/nx-.5),r*Math.cos(theta),r*Math.sin(theta));}
   const count=(nx+1)*(nt+1);
   for(let side=0;side<2;side++)for(let i=0;i<nx;i++)for(let j=0;j<nt;j++){const a=side*count+i*(nt+1)+j,b=a+1,c=a+nt+1,d=c+1;ix.push(...(side?[a,b,c,b,d,c]:[a,c,b,b,c,d]));}
   for(const end of [0,nx])for(let j=0;j<nt;j++){const a=end*(nt+1)+j;ix.push(a,a+1,a+count,a+1,a+count+1,a+count);}
   for(const j of [0,nt])for(let i=0;i<nx;i++){const a=i*(nt+1)+j,b=a+nt+1;ix.push(a,a+count,b,b,a+count,b+count);}
   const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(p,3));geo.setIndex(ix);geo.computeVertexNormals();
   const mesh=attach(this.arteryRoot,new T.Mesh(geo,mat(color,alpha)),['intima','media','adventitia'][this.shell.length]);this.shell.push(mesh);this.shellBases.push(Float32Array.from(p));
  }
  for(const x of [-.010,0,.010])for(let i=0;i<5;i++){
   const angle=Math.PI*(.98+i*.22),root=new T.Group(),m=mat(C.teal,.85),shaft=new T.Mesh(new T.CylinderGeometry(.000047,.000047,1,10),m),tip=new T.Mesh(new T.ConeGeometry(.00015,.00035,14),m);
   root.add(shaft,tip);root.quaternion.setFromUnitVectors(V(0,1,0),V(0,Math.cos(angle),Math.sin(angle)));root.name='pressure-normal-to-wall';this.arteryRoot.add(root);this.pressureArrows.push({root,shaft,tip,angle,x});
  }
 }
 private buildLipid(){
  // The entire particle is 50 nm; its outer lipid surface, retained apoB ribbon
  // and neutral-lipid core make this a lipoprotein rather than a large oil drop.
  const shell=attach(this.particle,ball(25e-9,C.gold,.39,36),'phospholipid-monolayer');
  const core=attach(this.particle,ball(20e-9,'#d3b47b',.56,28),'neutral-lipid-core');
  const heads=new T.InstancedMesh(new T.SphereGeometry(.66e-9,8,6),mat('#bfa779',.78),196);
  for(let i=0;i<heads.count;i++){const y=1-2*(i+.5)/heads.count,a=i*2.399963,r=Math.sqrt(1-y*y);this.dummy.position.set(25e-9*Math.cos(a)*r,25e-9*y,25e-9*Math.sin(a)*r);this.dummy.scale.setScalar(1);this.dummy.updateMatrix();heads.setMatrixAt(i,this.dummy.matrix);}attach(this.particle,heads,'surface-phospholipid-heads');
  const protein=attach(this.particle,tube(Array.from({length:141},(_,i)=>{const a=i/140*TAU*.96,b=.26*Math.sin(a*2);return V(Math.cos(a)*Math.cos(b),Math.sin(b),Math.sin(a)*Math.cos(b)).multiplyScalar(26e-9)}),1.2e-9,C.teal,.93,140),'retained-apoB100-schematic');
  attach(this.lipidRoot,this.particle,'same-lipoprotein-particle');
  const path=new T.CatmullRomCurve3([V(-115e-9,25e-9,0),V(-50e-9,32e-9,3e-9),V(5e-9,28e-9,0),V(85e-9,15e-9,0)],false,'catmullrom',.5);
  for(let i=0;i<24;i++){const mesh=attach(this.lipidRoot,ball(1.6e-9,'#dec593',.84,10),`fatty-acid-cargo-${i}`);this.cargo.push({mesh,seed:i/24});}
  const membrane=attach(this.lipidRoot,new T.Mesh(new T.BoxGeometry(330e-9,5e-9,85e-9,8,1,2),mat('#caa997',.44)),'membrane-fragment-5nm-thick',V(0,-34e-9,-15e-9));
  for(let j=0;j<2;j++)for(let i=0;i<31;i++){
   const bead=ball(1.1e-9,'#b89786',.48,8);bead.position.set((i-15)*10e-9,-34e-9+(j?2.5:-2.5)*1e-9,27e-9);this.lipidRoot.add(bead);
  }
  this.receptor.position.set(85e-9,-29e-9,0);this.receptor.name='LDL-receptor-schematic';this.lipidRoot.add(this.receptor);
  this.receptor.add(tube([V(0,-6e-9,0),V(0,0,0),V(0,10e-9,0)],1e-9,C.teal,.93,24));
  for(const sign of [-1,1]){const arm=new T.Group();arm.position.y=9e-9;arm.add(tube([V(),V(sign*4e-9,7e-9,0),V(sign*10e-9,13e-9,1e-9)],1e-9,C.teal,.93,24));this.receptor.add(arm);this.receptorArms.push(arm);}
  for(const x of [-105e-9,-40e-9,25e-9]){
   const receptor=this.receptor.clone(true);receptor.name='additional-surface-LDL-receptor';
   receptor.traverse(o=>{if(o instanceof T.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
   const particle=this.particle.clone(true);particle.scale.setScalar(.44);particle.name='additional-LDL-22nm';
   particle.traverse(o=>{if(o instanceof T.Mesh)o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();});
   this.lipidRoot.add(receptor,particle);this.recruitedReceptors.push({receptor,particle,x});
  }
  const vesicle=attach(this.lipidRoot,ball(20e-9,'#c89f90',.25,28),'receptor-mediated-endocytic-vesicle',V(85e-9,-52e-9,0));
  // A far background tint is a fragment of tissue, not a nanometre-sized cell.
  const under=attach(this.lipidRoot,new T.Mesh(new T.PlaneGeometry(420e-9,120e-9),mat('#d4bbaa',.10)),'cytoplasm-fragment',V(0,-72e-9,-42e-9));under.rotation.x=-Math.PI/2;
  return{core,shell,protein,vesicle,membrane,path};
 }
 private buildPlaque(){
  // A small aggregation in the wall. Individual LDL remains 22 nm, while the
  // millimetre lipid pool represents accumulated material over a long period.
  this.plaqueRoot.position.set(.002,-.0046,-.0018);this.plaqueRoot.rotation.x=-.18;this.plaqueRoot.name='atheroma-in-arterial-intima';this.arteryRoot.add(this.plaqueRoot);
  const core=attach(this.plaqueRoot,ball(.00085,'#bea269',.83,32),'aggregated-lipid-pool');core.scale.set(2.0,.34,.65);
  const cap=attach(this.plaqueRoot,ball(.0009,'#dbb7a5',.34,36),'fibrous-cap',V(0,.00024,0));cap.scale.set(2.1,.13,.68);
  for(let i=0;i<48;i++){
   const root=new T.Group(),a=i*2.39996,x=((i%12)-5.5)*.00016,y=.00015+.000028*Math.sin(a),z=.00042*Math.sin(a);
   root.position.set(x,y,z);const cell=attach(root,ball(10e-6,'#c6ac90',.44,24),'macrophage-20um');
   const vertex=cell.geometry.attributes.position as T.BufferAttribute;for(let j=0;j<vertex.count;j++){const vx=vertex.getX(j),vy=vertex.getY(j),vz=vertex.getZ(j),q=1+.035*Math.sin(vx*6e5+i*.37)*.5+.022*Math.cos(vz*9e5);vertex.setXYZ(j,vx*q,vy*q,vz*q);}cell.geometry.computeVertexNormals();
   const nucleus=attach(root,ball(3.2e-6,'#a396a0',.64,18),'macrophage-nucleus',V(-3e-6,2e-6,-3e-6));nucleus.scale.set(1.12,.82,.68);
   const droplets=new T.InstancedMesh(new T.SphereGeometry(1.8e-6,18,12),mat('#d3ba7d',.83),7);
   for(let j=0;j<7;j++){const b=j*2.4;this.dummy.position.set(5e-6*Math.cos(b),4e-6*Math.sin(b),3e-6*Math.sin(b*1.5));this.dummy.scale.setScalar(1);this.dummy.updateMatrix();droplets.setMatrixAt(j,this.dummy.matrix);}root.add(droplets);this.plaqueRoot.add(root);this.foam.push({root,lipid:droplets,index:i});
  }
  const retained=new T.InstancedMesh(new T.SphereGeometry(11e-9,8,6),mat(C.gold,.9),90);retained.name='retained-LDL-22nm-physical-size';retained.frustumCulled=false;this.plaqueRoot.add(retained);
  const rupture=attach(this.plaqueRoot,tube([V(-.00020,.00026,.00003),V(0,.00028,.00008),V(.00024,.00024,.00002)],.000014,'#975c50',.9,24),'cap-rupture');
  const thrombus=new T.Group();thrombus.name='wall-attached-thrombus';this.plaqueRoot.add(thrombus);
  const bulk=attach(thrombus,ball(.00046,'#96574c',.88,56),'contiguous-platelet-fibrin-clot',V(0,.00064,0));bulk.scale.set(1.10,.94,.69);
  const bp=bulk.geometry.attributes.position as T.BufferAttribute;for(let i=0;i<bp.count;i++){const x=bp.getX(i),y=bp.getY(i),z=bp.getZ(i),q=1+.055*Math.sin(x*16000+y*17000)*Math.cos(z*19000)+.035*Math.sin(y*33000-z*15000);bp.setXYZ(i,x*q,y*q,z*q);}bulk.geometry.computeVertexNormals();
  for(let i=0;i<48;i++){const a=i*2.39996,y=(i/47)**.7*.0007,rr=.00043*Math.sqrt(1-i/52);const lump=attach(thrombus,ball(.000085,'#a96759',.20,20),`thrombus-aggregate-texture-${i}`,V(rr*Math.cos(a),.00028+y,rr*.65*Math.sin(a)));lump.scale.set(1,.83,.74);}
  const platelets=new T.InstancedMesh(new T.SphereGeometry(1.5e-6,10,8),mat('#b78d76',.95),65);platelets.name='platelets-3um-physical-size';platelets.frustumCulled=false;this.plaqueRoot.add(platelets);
  const fibrin=new T.Group();fibrin.name='fibrin-network-over-thrombus';this.plaqueRoot.add(fibrin);
  for(let i=0;i<16;i++){const a=i*2.39996,p0=V(.00048*Math.cos(a),.00030,.00035*Math.sin(a)),p1=V(.00028*Math.cos(a+.9),.00085,.0002*Math.sin(a+.9)),p2=V(.00042*Math.cos(a+1.8),.00033,.00032*Math.sin(a+1.8));fibrin.add(tube([p0,p1,p2],.3e-6,'#d7c4a9',.74,28));}
  return{core,cap,thrombus,rupture,retained,platelets,fibrin};
 }
 private buildNephron(){
  // 200 µm glomerular tuft inside a 250 µm capsule; 45–60 µm lumen tubules.
  this.corpuscle.position.set(-.00065,.00055,0);this.corpuscle.name='renal-corpuscle';this.nephronRoot.add(this.corpuscle);
  const capsule=attach(this.corpuscle,ball(125e-6,'#c8ae92',.20,32),'bowman-capsule');capsule.scale.set(1,.97,.92);
  for(let i=0;i<7;i++){const rot=new T.Euler(.3+i*.31,i*.67,.2*i);this.corpuscle.add(tube(Array.from({length:65},(_,j)=>{const a=j/64*TAU;return V(92e-6*Math.cos(a),90e-6*Math.sin(a),16e-6*Math.sin(a*3)).applyEuler(rot)}),7e-6,i%2?C.red:'#bb746c',.86,64));}
  this.nephronRoot.add(tube([V(-.00110,.00065,0),V(-.00088,.00067,0),V(-.00071,.00062,0)],24e-6,C.red,.78));
  const points=[V(-.00065,.00043,0),V(-.00051,.00027,10e-6),V(-.00022,.00038,12e-6),V(-.00033,.00055,10e-6),V(-.00006,.00056,0),V(.00007,.00030,0),V(-.00004,-.00032,0),V(.00008,-.00070,0),V(.00031,-.00061,0),V(.00036,-.00006,0),V(.00040,.00033,0),V(.00062,.00041,0),V(.00078,.00025,0),V(.00100,.00029,0)];
  const curve=new T.CatmullRomCurve3(points);this.tubuleRoot.name='nephron-tubule-and-collecting-duct';this.nephronRoot.add(this.tubuleRoot);
  attach(this.tubuleRoot,new T.Mesh(new T.TubeGeometry(curve,260,32e-6,20,false),mat('#c5b197',.24)),'tubular-epithelial-wall');
  attach(this.tubuleRoot,new T.Mesh(new T.TubeGeometry(curve,260,23e-6,18,false),mat('#82b1a6',.27)),'tubular-lumen-filtrate');
  this.nephronRoot.add(tube([V(.001,.00070,0),V(.001,.00028,0),V(.001,-.00078,0)],42e-6,'#739d95',.37));
  for(let i=0;i<48;i++){const p=curve.getPoint((i+.5)/48),n=V(0,0,1);p.addScaledVector(n,32e-6);const nucleus=ball(4e-6,'#9c9b89',.63,10);nucleus.position.copy(p);this.tubuleRoot.add(nucleus);}
  const blood=new T.CatmullRomCurve3([V(-.00057,.00063,-65e-6),V(-.00021,.00075,-55e-6),V(.00036,.00065,-65e-6),V(.00080,.00008,-75e-6),V(.00061,-.00063,-65e-6),V(.00012,-.00086,-55e-6),V(-.00024,-.00042,-65e-6)]);
  this.nephronRoot.add(new T.Mesh(new T.TubeGeometry(blood,180,13e-6,16,false),mat('#c99688',.31)));
  for(let i=0;i<15;i++){const cell=redCell(3.75e-6);cell.name='renal-blood-cell-not-in-filtrate';this.renalCells.push(cell);this.nephronRoot.add(cell);}
  const filtrate=new T.InstancedMesh(new T.SphereGeometry(1.2e-6,7,5),mat('#709c9a',.76),70);filtrate.name='filtrate-transport-markers-not-molecule-size';filtrate.frustumCulled=false;this.nephronRoot.add(filtrate);
  const transfers=new T.InstancedMesh(new T.SphereGeometry(1.4e-6,7,5),mat('#93ad99',.88),18);transfers.name='water-sodium-reabsorption-direction-markers';transfers.frustumCulled=false;this.nephronRoot.add(transfers);
  return{curve,blood,filtrate,transfers};
 }
 private buildLipidWall(){
  // This is a 1.2 µm endothelial fragment, not an entire microscopic cell.
  const patch=(name:string,y:number,thickness:number,color:string,alpha:number)=>attach(this.lipidWallRoot,new T.Mesh(new T.BoxGeometry(1.2e-6,thickness,.42e-6,16,1,4),mat(color,alpha)),name,V(0,y,-.07e-6));
  patch('luminal-endothelial-membrane',.125e-6,5e-9,'#b7897f',.41);
  patch('endothelial-cytoplasm-fragment',0,.245e-6,'#d7afa1',.13);
  patch('basal-endothelial-membrane',-.125e-6,5e-9,'#ba9486',.30);
  patch('subendothelial-matrix-fragment',-.23e-6,.15e-6,'#d5c4a6',.12);
  for(let i=0;i<18;i++){
   const y=-.165e-6-(i%5)*21e-9,z=-.10e-6+(i%4)*55e-9;
   const points=Array.from({length:30},(_,j)=>{const x=-.57e-6+j/29*1.14e-6;return V(x,y+8e-9*Math.sin(j*.5+i),z+8e-9*Math.cos(j*.5+i))});
   this.lipidWallRoot.add(tube(points,1.6e-9,'#9caaa0',.50,36));
  }
  for(let i=0;i<9;i++){
   const g=new T.Group();g.name=`LDL-22nm-transcytosis-${i}`;g.add(ball(11e-9,'#d1b274',.73,20));
   g.add(tube(Array.from({length:49},(_,j)=>{const a=j/48*TAU*.93;return V(Math.cos(a)*11.8e-9,3e-9*Math.sin(a*2),Math.sin(a)*11.8e-9)}),.9e-9,C.teal,.86,48));
   this.lipidWallRoot.add(g);this.crossing.push(g);const vesicle=attach(this.lipidWallRoot,ball(20e-9,'#ba978b',.23,20),`transport-vesicle-${i}`);this.crossingVesicles.push(vesicle);
  }
  this.lipidWallRoot.userData={units:'metres',particleDiameter:22e-9,fragmentWidth:1.2e-6,representation:'Local endothelial transport and subendothelial retention mechanism; not all entry pathways or an individual scan.'};
 }
 /** Sets opacity multipliers without changing positions or physical sizes. */
 setVisibility(weights:Partial<CardioVisibility>){this.weights={...this.weights,...weights};this.applyVisibility();}
 /** Fade the large wall as the lens enters it, preserving the anchored plaque. */
 setArteryShellVisibility(weight:number){this.arteryShellWeight=clamp(weight);this.applyVisibility();}
 private applyVisibility(){for(const [key,root] of Object.entries({artery:this.arteryRoot,arteriole:this.arterioleRoot,lipid:this.lipidRoot,nephron:this.nephronRoot,lipidWall:this.lipidWallRoot})){const q=clamp(this.weights[key as keyof CardioVisibility]);root.visible=q>.000001;root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line)for(const m of Array.isArray(o.material)?o.material:[o.material])m.opacity=(m.userData.frameAlpha??m.userData.baseAlpha??1)*q});}for(const object of [...this.shell,this.flow,...this.pressureArrows.map(a=>a.root)])object.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line)for(const m of Array.isArray(o.material)?o.material:[o.material])m.opacity=(m.userData.frameAlpha??m.userData.baseAlpha??1)*this.weights.artery*this.arteryShellWeight;});}
 updateState(s:{view:CardioMode;time:number;progress:number;cameraDistance?:number}){this.update(s.time,s.view,s.progress);}
 update(time:number,mode:CardioMode,progress:number,treatment='',treatmentProgress=0,arterialContext?:CardioArterialContext){
  const p=clamp(progress);this.lastMode=mode;
  const pressureWeight=arterialContext?.pressureWeight??(mode==='pressure'?1:0);
  this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line)for(const m of Array.isArray(o.material)?o.material:[o.material])m.opacity=m.userData.baseAlpha??1;});
  // Samples come from the previously solved, volume-balanced 0D Windkessel
  // teaching experiment. They are a temporal pressure, not a local CFD field.
  const stiff=mode==='pressure'?ramp(p,.56,.93):0,base=pressureModel.cases.baseline,hard=pressureModel.cases.stiffer_artery;
  const sample=(c:typeof base)=>{const k=phase(time/c.period)*(c.samples.length-1),i=Math.floor(k),q=k-i;return c.samples[i].pressure*(1-q)+c.samples[Math.min(i+1,c.samples.length-1)].pressure*q;};
  const baselinePressure=sample(base);this.arterialPressure=baselinePressure*(1-stiff)+sample(hard)*stiff;
  const beat=clamp((baselinePressure-base.diastolic)/(base.systolic-base.diastolic)),expand=1+(.040*(1-stiff)+.009*stiff)*beat;
  this.shell.forEach((mesh,index)=>{const a=mesh.geometry.attributes.position as T.BufferAttribute,b=this.shellBases[index];for(let i=0;i<a.count;i++){a.setXYZ(i,b[i*3],b[i*3+1]*expand,b[i*3+2]*expand)}a.needsUpdate=true;mesh.geometry.computeVertexNormals();});
  for(const a of this.pressureArrows){const length=.0005+.0009*beat*(1+.4*stiff);a.root.position.set(a.x,.0036*Math.cos(a.angle)*expand,.0036*Math.sin(a.angle)*expand);a.shaft.scale.y=length;a.shaft.position.y=length*.5;a.tip.position.y=length+.00014;opacity(a.root,pressureWeight);}
  for(let i=0;i<this.flow.count;i++){const u=phase(time*.065+i/this.flow.count),angle=i*2.4,rr=.0028*Math.sqrt(phase(i*.618+.14)),edge=ease(Math.min(u,1-u)/.08);this.dummy.position.set(-.020+.040*u,rr*Math.cos(angle),rr*Math.sin(angle));this.dummy.rotation.set(0,0,Math.PI/2);this.dummy.scale.set(.55*edge,4.0*edge,.55*edge);this.dummy.updateMatrix();this.flow.setMatrixAt(i,this.dummy.matrix);}this.flow.instanceMatrix.needsUpdate=true;opacity(this.flow,pressureWeight);
  const relax=['ccb','arb'].includes(treatment)?ramp(treatmentProgress,.12,.78):0;
  const contract=mode==='resistance'?.60*(1-.78*relax):mode==='renal'?.30*ramp(p,.2,.75):0;
  this.arteriole.update({time,activation:1,constriction:contract,pressure:.25+.65*contract,pulse:beat,flowPhase:time*.041});
  this.updateLipid(time,mode==='clearance'?1:p,mode==='clearance'?p:0);
  this.recruitedReceptors.forEach(({receptor,particle,x},i)=>{
   const shown=treatment==='statin_receptor'?ramp(treatmentProgress,.13+i*.07,.45+i*.07):0;
   const uptake=ramp(treatmentProgress,.48+i*.055,.89+i*.02);
   receptor.position.set(x,-47e-9+18e-9*shown,-5e-9);
   particle.position.set(x-23e-9*(1-uptake),37e-9-88e-9*uptake,-5e-9);
   particle.rotation.y=time*.16+i;
   opacity(receptor,shown);opacity(particle,shown);
  });
  const plaqueP=arterialContext?.plaqueProgress??(mode==='plaque'?p:mode==='thrombus'?1:mode==='lipid_wall'?.28+.45*p:0);
  const clotP=arterialContext?.clotProgress??(mode==='thrombus'?p:0);this.updatePlaque(time,plaqueP,clotP);
  // Reveal an already formed, fixed-size lesion through the same wall. The
  // context blend changes visibility only; it does not resize tissue.
  if(arterialContext)this.plaqueRoot.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line)for(const m of Array.isArray(o.material)?o.material:[o.material])m.opacity*=clamp(arterialContext.lesionVisibility);});
  if(mode==='lipid_wall'){opacity(this.plaqueCore,0);opacity(this.plaqueCap,0);}
  this.updateRenal(time,p,mode==='salt',treatment==='diuretic'?ramp(treatmentProgress,.08,.74):0);
  this.calciumSignals.forEach((signal,i)=>{const q=phase(time*.16+i/12),stop=treatment==='ccb'?ramp(treatmentProgress,.12,.75):0;signal.position.set((i%6-2.5)*.00017,.00029-q*.00016*(1-.66*stop),i<6?-.00002:.000025);opacity(signal,treatment==='ccb'?ease(Math.min(q,1-q)/.14):0);});
  this.urinarySignals.forEach((signal,i)=>{const q=phase(time*.12+i/24),extra=treatment==='diuretic'?ramp(treatmentProgress,.10,.70):0;signal.position.set(.001+4e-6*Math.sin(i*2.4),.00065-.00143*q,8e-6*Math.cos(i*2.4));opacity(signal,mode==='renal'||mode==='salt'?(.22+.78*extra)*ease(Math.min(q,1-q)/.07):0);});
  this.crossing.forEach((g,i)=>{const q=clamp((p-i*.035)/.68),enter=ramp(q,.12,.75),x=(-.38+.09*i)*1e-6;g.position.set(x+24e-9*Math.sin(q*Math.PI),.22e-6-.43e-6*enter,(i%3-1)*65e-9+.12e-6);g.rotation.set(.1,time*.13,.15);const vesicle=this.crossingVesicles[i];vesicle.position.copy(g.position);opacity(vesicle,ramp(q,.10,.28)*(1-ramp(q,.67,.85)));});
  this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line)for(const m of Array.isArray(o.material)?o.material:[o.material])m.userData.frameAlpha=m.opacity;});this.applyVisibility();
 }
 private updateLipid(time:number,p:number,clearance:number){
  const idl=ramp(p,.24,.61),ldl=ramp(p,.61,.96),size=1-.28*idl-.28*ldl,bind=ramp(clearance,.05,.44),internalize=ramp(clearance,.43,.91);
  this.lipidRadius=25e-9*size;this.particle.scale.setScalar(size);this.particle.position.copy(this.lipidPath.getPoint(.03+.93*ease(p))).lerp(V(85e-9,-2e-9,0),bind);this.particle.position.y-=60e-9*internalize;
  this.particle.rotation.set(.16,time*.20,.08*Math.sin(time*.19));opacity(this.lipidCore,.86);opacity(this.lipidShell,.88);opacity(this.lipidProtein,1);
  this.cargo.forEach(({mesh,seed},i)=>{const begin=.15+seed*.47,q=clamp((p-begin)/.25),start=this.lipidPath.getPoint(.03+.93*ease(begin)).add(V(15e-9*Math.cos(i*2.4),5e-9,15e-9*Math.sin(i*2.4))),end=V(-55e-9+seed*100e-9,-28e-9,18e-9);mesh.position.copy(start).lerp(end,ease(q));mesh.position.z+=7e-9*Math.sin(q*Math.PI);opacity(mesh,ramp(p,begin,begin+.07)*(1-ramp(q,.73,1))*(1-clearance));});
  this.receptor.position.y=-29e-9-13e-9*internalize+13e-9*ramp(clearance,.83,1);this.receptorArms.forEach((arm,i)=>arm.rotation.z=(i?1:-1)*.26*bind*(1-.8*ramp(clearance,.82,1)));
  this.vesicle.position.set(85e-9,-35e-9-24e-9*internalize,0);opacity(this.vesicle,ramp(clearance,.33,.69));this.vesicle.scale.set(1,.75+.25*internalize,1);
  // Local membrane fades gently to expose the internalization, while the
  // receptor, particle and vesicle keep their coordinates throughout.
  opacity(this.membrane,1-.46*internalize);
 }
 private updatePlaque(time:number,p:number,clot:number){
  const aggregate=ramp(p,.28,.94),rupture=ramp(clot,.12,.39),growth=ramp(clot,.31,.95);
  opacity(this.plaqueCore,aggregate);this.plaqueCore.scale.set(2.0*Math.max(.002,aggregate),.34*Math.max(.002,aggregate),.65*Math.max(.002,aggregate));
  opacity(this.plaqueCap,aggregate);this.plaqueCap.scale.set(2.1*Math.max(.002,aggregate),.13,.68*Math.max(.002,aggregate));
  this.foam.forEach(({root,lipid,index})=>{const q=ramp(p,.08+index*.003,.44+index*.003);opacity(root,q);opacity(lipid,q*ramp(p,.24,.62));lipid.scale.setScalar(.20+.80*ramp(p,.20,.73));});
  for(let i=0;i<this.retained.count;i++){const u=phase(time*.036+i*.618),a=i*2.39996;this.dummy.position.set((phase(i*.73)-.5)*.0025,.00022+.00002*Math.sin(a),.00042*Math.sin(a));this.dummy.scale.setScalar(1);this.dummy.updateMatrix();this.retained.setMatrixAt(i,this.dummy.matrix);}this.retained.instanceMatrix.needsUpdate=true;opacity(this.retained,ramp(p,0,.38));
  opacity(this.rupture,rupture);opacity(this.thrombus,growth);this.thrombus.scale.set(1,Math.max(.002,growth),1);opacity(this.fibrin,growth);
  for(let i=0;i<this.platelets.count;i++){const u=phase(time*.028+i/this.platelets.count),q=ramp(clot,.10,.65),start=V(-.003+.006*u,.0007+.0002*Math.sin(i),.00045*Math.sin(i*2.4)),end=V(.00036*Math.cos(i*2.4),.00032+.00027*phase(i*.37),.0002*Math.sin(i*2.4));this.dummy.position.copy(start).lerp(end,q);this.dummy.rotation.set(.3,time*.07,0);this.dummy.scale.set(1,.4,1);this.dummy.updateMatrix();this.platelets.setMatrixAt(i,this.dummy.matrix);}this.platelets.instanceMatrix.needsUpdate=true;opacity(this.platelets,rupture);
 }
 private updateRenal(time:number,p:number,retention:boolean,diuresis=0){
  this.renalCells.forEach((cell,i)=>{const u=phase(time*.09+i/this.renalCells.length);cell.position.copy(this.nephronBlood.getPoint(u));cell.quaternion.setFromUnitVectors(V(0,1,0),this.nephronBlood.getTangent(u));});
  for(let i=0;i<this.filtrate.count;i++){const u=phase(time*.045+i/this.filtrate.count);this.dummy.position.copy(this.nephronCurve.getPoint(u));this.dummy.position.z+=8e-6*Math.sin(i*2.4);this.dummy.scale.setScalar(1);this.dummy.rotation.set(0,0,0);this.dummy.updateMatrix();this.filtrate.setMatrixAt(i,this.dummy.matrix);}this.filtrate.instanceMatrix.needsUpdate=true;
  for(let i=0;i<this.transfers.count;i++){const lane=i%3,u=phase(time*(retention?.20:.10)+i/this.transfers.count),a=this.nephronCurve.getPoint([.29,.52,.76][lane]),b=this.nephronBlood.getPoint([.34,.77,.53][lane]);this.dummy.position.copy(a).lerp(b,ease(u));this.dummy.scale.setScalar(ease(Math.min(u,1-u)/.12));this.dummy.updateMatrix();this.transfers.setMatrixAt(i,this.dummy.matrix);}this.transfers.instanceMatrix.needsUpdate=true;opacity(this.transfers,(.60+.40*ramp(p,.16,.56))*(1-.78*diuresis));
 }
 private point(root:T.Object3D,p:T.Vector3){root.updateWorldMatrix(true,false);return root.localToWorld(p);}
 getPhysicalState(){return{arterialPressureMmHg:this.arterialPressure,pressureSource:'0D two-element Windkessel teaching model',lipoproteinDiameterMetres:2*this.lipidRadius,patientSpecific:false};}
 getAnchors(){return{
  artery:this.point(this.arteryRoot,V()),arteryWall:this.point(this.arteryRoot,V(0,-.0048,-.0014)),
  arteriole:this.arteriole.focus,arterioleWall:this.arteriole.muscleFocus,
  lipid:this.point(this.lipidRoot,V()),lipidParticle:this.particle.getWorldPosition(V()),lipidSource:this.point(this.lipidRoot,V(-95e-9,25e-9,0)),lipidClearance:this.point(this.lipidRoot,V(85e-9,-20e-9,0)),
  lipidWall:this.point(this.lipidWallRoot,V()),lipidWallMembrane:this.point(this.lipidWallRoot,V(0,.125e-6,.1e-6)),lipidWallRetained:this.point(this.lipidWallRoot,V(0,-.22e-6,.1e-6)),
  nephron:this.point(this.nephronRoot,V(0,0,0)),glomerulus:this.corpuscle.getWorldPosition(V()),tubule:this.point(this.nephronRoot,V(.00037,.00006,0)),
  plaque:this.plaqueRoot.getWorldPosition(V()),thrombus:this.point(this.plaqueRoot,V(0,.00055,0))
  ,foamCell:this.foam[24].root.getWorldPosition(V())
 };}
 getLabels(mode:CardioMode=this.lastMode):CardioLabel[]{const a=this.getAnchors();const label=(text:string,point:T.Vector3,side:'left'|'right'):CardioLabel=>({text,point,side});
  if(mode==='pressure')return[label('弹性管壁',a.arteryWall,'left'),label('血液推向管壁',a.artery,'right')];
  if(mode==='resistance')return[label('小动脉',a.arteriole,'right'),label('平滑肌',a.arterioleWall,'left')];
  if(mode==='salt'||mode==='renal'||mode==='nephron')return[label('肾小球',a.glomerulus,'left'),label('肾小管',a.tubule,'right')];
  if(mode==='lipid')return[label(this.lipidRadius>19e-9?'VLDL · 运输脂肪':this.lipidRadius>12e-9?'IDL · 中间颗粒':'LDL · 富含胆固醇',a.lipidParticle,'left')];
  if(mode==='clearance')return[label('LDL',a.lipidParticle,'left'),label('LDL 受体',a.lipidClearance,'right')];
  if(mode==='lipid_wall')return[label('内皮 · 血管内侧',a.lipidWallMembrane,'left'),label('LDL 滞留在内膜',a.lipidWallRetained,'right')];
  if(mode==='plaque')return[label('脂质积在管壁里',a.plaque,'right')];
  return[label('斑块表面破裂',a.plaque,'left'),label('血栓',a.thrombus,'right')];
 }
 getFoamLabels():CardioLabel[]{const cell=this.foam[24];return[{text:'泡沫细胞',point:cell.root.getWorldPosition(V()),side:'left'},{text:'细胞内脂滴',point:this.point(cell.root,V(5e-6,0,3e-6)),side:'right'}];}
 dispose(){const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m)}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());this.root.removeFromParent();}
}

