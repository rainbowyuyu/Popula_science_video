import * as T from 'three';
import {BETA_RECEPTOR} from './Scale';
import {C,V,ball,tube,mat,smooth,clamp} from './visual';

const TAU=Math.PI*2;
const phase=(value:number)=>((value%1)+1)%1;
const interval=(value:number,start:number,end:number)=>clamp((value-start)/(end-start));
const envelope=(value:number,start:number,end:number,fade=.025)=>smooth((value-start)/fade)*(1-smooth((value-end)/fade));
const up=V(0,1,0);
function named<M extends T.Object3D>(object:M,name:string){object.name=name;return object;}
function rbc(){
 // Revolved biconcave disc, rather than a flattened solid sphere.
 const profile=[[0,.013],[.027,.018],[.058,.031],[.088,.026],[.105,0],[.088,-.026],[.058,-.031],[.027,-.018],[0,-.013]];
 return new T.Mesh(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),28),mat('#b75651',1,.49));
}
function peptide(color:string,r=.023){
 const group=new T.Group();
 for(let i=0;i<5;i++){const bead=ball(r,color);bead.position.set((i-2)*r*1.35,r*.65*Math.sin(i*1.7),r*.35*Math.cos(i*1.7));group.add(bead);}
 return group;
}
function rimAt(point:T.Vector3,normal:T.Vector3,radius:number,color:string,opacity=.85){
 const ring=new T.Mesh(new T.TorusGeometry(radius,.008,8,40),mat(color,opacity));
 ring.position.copy(point);ring.quaternion.setFromUnitVectors(V(0,0,1),normal.clone().normalize());return ring;
}

/** Spatial teaching models: no patient histology, CFD, electrophysiology or MD. */
export class IntestinalDetail{
 root=new T.Group();granules:T.Mesh[]=[];nutrients:T.Mesh[]=[];cells:T.Mesh[]=[];capillary:T.CatmullRomCurve3;
 private packets:T.Group[]=[];private granuleOrigins:T.Vector3[]=[];private apicalSignal:T.Mesh;
 private secretionRoutes:T.CatmullRomCurve3[]=[];private basalRims:T.Mesh[]=[];
 constructor(){
  this.root.name='intestinal-epithelium-schematic';
  // Lumen above, basal lamina and tissue below: these are cells, not small villi.
  const lamina=named(new T.Mesh(new T.BoxGeometry(5.6,.035,1.75),mat('#d3bfae',.62,.72)),'basal-lamina');
  lamina.position.set(0,-.635,-.04);this.root.add(lamina);
  const profile=[new T.Vector2(0,0),new T.Vector2(.20,.015),new T.Vector2(.26,.14),new T.Vector2(.255,.78),new T.Vector2(.22,1.12),new T.Vector2(0,1.14)];
  const cellGeometry=new T.LatheGeometry(profile,28);
  for(let row=0;row<2;row++)for(let i=0;i<9;i++){
   if(row===0&&i===5)continue;
   const x=(i-4)*.61,z=row===0?.42:-.40,height=.96+.045*Math.sin(i*1.4+row);
   const cell=named(new T.Mesh(cellGeometry,mat(row===0?'#d7aaa0':'#d3b3a7',row===0?.67:.48,.58)),`enterocyte-${row}-${i}`);
   cell.position.set(x,-.61,z);cell.scale.set(1,height,1.35);this.root.add(cell);
   const nucleus=ball(.105,'#a77c80',.76);nucleus.scale.set(.77,1.15,.70);nucleus.position.set(x,-.21,z+.16);this.root.add(nucleus);
   for(let j=0;j<7;j++){
    const u=(j-3)*.054,start=V(x+u,-.61+1.13*height,z+.16);
    this.root.add(tube([start,start.clone().add(V(.006*Math.sin(j),.09,0))],.011,'#be9182',.90));
   }
   if(i<8){const junction=ball(.022,'#e8d7bd',.85);junction.position.set(x+.29,.42,z+.20);this.root.add(junction);}
  }
  // Open-type L cell: narrow apical contact, wider basal body with granules.
  const lProfile=[[0,0],[.17,.015],[.235,.17],[.22,.39],[.145,.73],[.082,1.08],[.075,1.20],[0,1.21]];
  const lcell=named(new T.Mesh(new T.LatheGeometry(lProfile.map(([r,y])=>new T.Vector2(r,y)),40),mat('#68a29b',.45,.40)),'L-cell-membrane');
  lcell.position.set(.61,-.61,.48);lcell.scale.z=1.1;this.root.add(lcell);
  const nucleus=ball(.095,'#3c7478',.93);nucleus.scale.set(.80,1.12,.60);nucleus.position.set(.61,-.06,.66);this.root.add(nucleus);
  for(const side of [-1,1])this.root.add(tube([V(.61+side*.075,.59,.56),V(.61+side*.135,.18,.67),V(.61+side*.22,-.25,.64),V(.61+side*.17,-.59,.56)],.014,'#468d89',.88));
  for(let i=0;i<4;i++)this.root.add(tube([V(.565+i*.03,.575,.52),V(.565+i*.03,.685,.52)],.012,'#3d8380'));
  this.apicalSignal=ball(.066,'#e0be74',.9);this.apicalSignal.position.set(.61,.52,.64);this.root.add(this.apicalSignal);
  for(let i=0;i<5;i++)this.root.add(tube([V(-2.5,-.77-i*.035,-.50+i*.13),V(-.8,-.75-i*.037,-.43+i*.13),V(.9,-.80-i*.030,-.49+i*.13),V(2.6,-.78-i*.035,-.46+i*.13)],.007,'#d8b8a8',.40));
  this.capillary=new T.CatmullRomCurve3([V(-3,-1.06,.6),V(-1.6,-1,.70),V(.3,-.98,.62),V(1.4,-1.06,.52),V(3,-.98,.6)]);
  const vessel=named(new T.Mesh(new T.TubeGeometry(this.capillary,100,.165,18,false),mat('#d69a91',.27,.45)),'capillary-wall');this.root.add(vessel);
  for(let i=0;i<7;i++){
   const q=(i+.35)/7,point=this.capillary.getPoint(q),edge=point.clone().add(V(0,-.135,.04));
   const endothelial=ball(.036,'#b47878',.75);endothelial.position.copy(edge);endothelial.scale.set(1.7,.65,1);this.root.add(endothelial);
  }
  for(const q of [0,1])this.root.add(rimAt(this.capillary.getPoint(q),this.capillary.getTangent(q),.165,'#c5837c',.60));
  for(let i=0;i<8;i++){
   const angle=i*2.399,origin=V(.61+.10*Math.cos(angle),-.34-.13*(i%3)/2,.64+.045*Math.sin(angle));
   const granule=named(ball(.036,C.gold),`L-cell-secretory-granule-${i}`);granule.position.copy(origin);
   const shell=ball(.047,'#c9d3b2',.34);granule.add(shell);this.granules.push(granule);this.granuleOrigins.push(origin);this.root.add(granule);
   const packet=named(peptide(C.gold,.018),`extracellular-GLP1-${i}`);this.packets.push(packet);this.root.add(packet);
   const gate=V(.61+.09*Math.cos(angle),-.585,.63+.04*Math.sin(angle)),entry=.59+(i%3)*.012;
   this.secretionRoutes.push(new T.CatmullRomCurve3([gate,gate.clone().add(V(.045,-.12,.075)),V(.72,-.80,.68),this.capillary.getPoint(entry)]));
   if(i<3){const ring=rimAt(gate,V(0,-1,.18),.048,'#a6ba93',.8);this.basalRims.push(ring);this.root.add(ring);}
  }
  for(let i=0;i<18;i++){const nutrient=named(new T.Mesh(new T.IcosahedronGeometry(.044,1),mat(i%3?'#d7b66f':'#dec68d',1,.58)),`luminal-nutrient-${i}`);this.nutrients.push(nutrient);this.root.add(nutrient);}
  for(let i=0;i<10;i++){const cell=named(rbc(),`capillary-erythrocyte-${i}`);this.cells.push(cell);this.root.add(cell);}
  this.render(0,0);
 }
 render(t:number,p?:number){
  const q=p===undefined?phase(t/8.8):clamp(p);
  for(let i=0;i<this.nutrients.length;i++){
   const nutrient=this.nutrients[i];
   if(i<4){
    const u=smooth(interval(q,.02+i*.017,.25+i*.017));
    nutrient.position.copy(V(.35+.17*i,1.10+.06*Math.sin(i),.57).lerp(V(.61+.045*Math.cos(i),.67,.55),u));
    nutrient.scale.setScalar((1-smooth(interval(q,.27,.34)))*(.8+i*.06));
   }else{const u=phase(t*.05+i/18);nutrient.position.set(-2.8+5.6*u,.90+.13*Math.sin(i*2.4+u*2),.16+.48*Math.sin(i*1.2));nutrient.scale.setScalar(.68+.2*Math.sin(i)**2);}
   nutrient.rotation.set(i*.6+t*.13,i+t*.1,.2);
  }
  this.apicalSignal.scale.setScalar(envelope(q,.23,.37,.04));
  for(let i=0;i<this.granules.length;i++){
   const local=q-i*.012,granule=this.granules[i],route=this.secretionRoutes[i],packet=this.packets[i];
   const transport=smooth(interval(local,.32,.49)),fusion=smooth(interval(local,.49,.54));
   granule.position.copy(this.granuleOrigins[i]).lerp(route.getPoint(0),transport);
   granule.scale.set(.14*(1-fusion),.14*(1-fusion*.72),.14*(1-fusion));granule.visible=local<.545;
   packet.visible=local>=.52&&local<.98;
   if(local<.71)packet.position.copy(route.getPoint(smooth(interval(local,.52,.71))));
   else packet.position.copy(this.capillary.getPoint((.59+(i%3)*.012)+(1-(.59+(i%3)*.012))*interval(local,.71,.98)));
   packet.scale.setScalar(smooth(interval(local,.52,.55))*(1-smooth(interval(local,.945,.98))));
   packet.rotation.set(.1*Math.sin(i),0,.12*Math.sin(t+i));
  }
  this.basalRims.forEach((ring,i)=>ring.scale.setScalar(envelope(q-i*.012,.48,.59,.025)));
  for(let i=0;i<this.cells.length;i++){
   const u=phase(t*.105+i/this.cells.length),cell=this.cells[i];cell.position.copy(this.capillary.getPoint(u));
   cell.quaternion.setFromUnitVectors(up,this.capillary.getTangent(u));cell.rotateY(i*.63);cell.rotateX(.18*Math.sin(t*.45+i));
  }
 }
}

type SecretoryUnit={shell:T.Mesh;origin:T.Vector3;gate:T.Vector3;fusion:T.Mesh;released:T.Group[];delay:number};

export class BetaCellDetail{
 root=new T.Group();vesicles:T.Mesh[]=[];glucose:T.Mesh[]=[];calcium:T.Mesh[]=[];
 private ligand:T.Group;private receptor:T.Group;private units:SecretoryUnit[]=[];
 private signal:T.Mesh[]=[];private signalPath:T.CatmullRomCurve3;private calciumRoutes:T.CatmullRomCurve3[]=[];
 constructor(){
  this.root.name='beta-cell-cutaway-schematic';
  // Remove a front cap: an explicit double rim exposes the cutaway.
  const radius=1.25,cut=.60,theta=Math.acos(cut/radius),rimRadius=Math.sqrt(radius*radius-cut*cut);
  const membrane=named(new T.Mesh(new T.SphereGeometry(radius,64,40,0,TAU,theta,Math.PI-theta),mat('#93b4ac',.63,.35)),'beta-plasma-membrane');
  membrane.rotation.x=Math.PI/2;(membrane.material as T.MeshStandardMaterial).side=T.DoubleSide;this.root.add(membrane);
  const inner=new T.Mesh(new T.SphereGeometry(radius-.00083,64,36,0,TAU,theta,Math.PI-theta),mat('#c8d3bc',.25,.56));inner.rotation.x=Math.PI/2;this.root.add(inner);
  for(const delta of [-.012,.012]){
   const rim=new T.Mesh(new T.TorusGeometry(rimRadius+delta,.013,10,96),mat(delta<0?'#abc5b4':'#578f89',.94,.42));rim.position.z=cut;this.root.add(rim);
  }
  const heads=new T.InstancedMesh(new T.SphereGeometry(.00030,10,8),mat('#c6d9c1',.95,.50),120),dummy=new T.Object3D();
  for(let i=0;i<60;i++)for(let row=0;row<2;row++){
   const a=i/60*TAU,r=rimRadius+(row? .023:-.023);dummy.position.set(Math.cos(a)*r,Math.sin(a)*r,cut);dummy.updateMatrix();heads.setMatrixAt(i*2+row,dummy.matrix);
  }
  this.root.add(named(heads,'membrane-cutaway-lipid-heads'));
  const nucleus=named(ball(.39,'#6c9395',.96),'beta-nucleus');nucleus.position.set(-.30,.08,-.15);nucleus.scale.set(1,.91,.76);this.root.add(nucleus);
  const nucleolus=ball(.105,'#4f747c');nucleolus.position.set(-.25,.15,.16);this.root.add(nucleolus);
  for(let i=0;i<5;i++){
   const points=[];for(let j=0;j<24;j++){const a=j/23*Math.PI*1.38;points.push(V(-.30+.52*Math.cos(a),.10+.37*Math.sin(a)-i*.07,-.27-i*.035));}
   this.root.add(tube(points,.018,'#7aaba2',.65));
  }
  for(let i=0;i<3;i++){
   const organelle=new T.Group(),outer=ball(.10,'#c6aa7d',.88);outer.scale.set(1.75,.72,.70);organelle.add(outer);
   organelle.add(tube([V(-.12,.00,.055),V(-.065,.038,.060),V(-.015,-.035,.060),V(.04,.034,.060),V(.11,-.008,.055)],.008,'#967950',.9));
   organelle.position.set(i===0?-.67:i===1?.36:.13,i===0?-.48:i===1?.58:-.71,.26);organelle.rotation.z=i*.8;this.root.add(organelle);
  }
  const receptorPoint=V(...BETA_RECEPTOR),normal=receptorPoint.clone().normalize();
  this.receptor=named(new T.Group(),'membrane-GLP1-receptor-symbol');this.receptor.position.copy(receptorPoint);
  // The real 5VAI structure is in a different shot. This receptor is a location cue.
  this.receptor.add(tube([normal.clone().multiplyScalar(-.11),V(),normal.clone().multiplyScalar(.09)],.034,C.teal));
  for(const side of [-1,1])this.receptor.add(tube([normal.clone().multiplyScalar(.055),normal.clone().multiplyScalar(.13).add(V(0,side*.058,0))],.022,C.teal));
  this.root.add(this.receptor);
  this.ligand=named(peptide(C.gold,.027),'extracellular-GLP1-ligand');this.root.add(this.ligand);
  this.signalPath=new T.CatmullRomCurve3([V(-.93,.14,.56),V(-.67,-.17,.57),V(-.18,-.40,.54),V(.40,-.30,.58),V(.80,-.03,.62)]);
  for(let i=0;i<7;i++){const signal=named(ball(.032,'#73babb'),`intracellular-signal-${i}`);this.signal.push(signal);this.root.add(signal);}
  const origins=[V(.38,-.48,.25),V(.52,.10,.22),V(.19,.43,.30),V(-.03,-.63,.23)];
  for(let i=0;i<12;i++){
   const a=i*2.399,origin=i<4?origins[i]:V(.71*Math.cos(a),.71*Math.sin(a),.18+.06*Math.sin(i));
   const shell=named(ball(.025,'#b2c8b4',.47),`insulin-secretory-vesicle-${i}`);shell.position.copy(origin);
   const core=ball(.015,'#c18b53',.98);shell.add(core);
   for(let j=0;j<3;j++){const bead=ball(.005,'#edc28b');bead.position.set(.008*Math.cos(j*TAU/3),.008*Math.sin(j*TAU/3),.008);shell.add(bead);}
   this.vesicles.push(shell);this.root.add(shell);
   if(i<4){
    const aGate=-.18+i*.12,gate=V(Math.cos(aGate)*rimRadius,Math.sin(aGate)*rimRadius,cut),fusion=rimAt(gate,gate,.025,'#c6b47d',.92);
    this.root.add(fusion);const released=[];
    for(let j=0;j<3;j++){const insulin=named(new T.Group(),`released-insulin-${i}-${j}`);
     // Paired beads distinguish insulin from the incoming GLP-1 chain.
     const chainA=ball(.026,'#c3874e'),chainB=ball(.022,'#e4b776');chainA.position.x=-.014;chainB.position.set(.020,.012,.007);insulin.add(chainA,chainB);released.push(insulin);this.root.add(insulin);
    }
    this.units.push({shell,origin,gate,fusion,released,delay:i*.021});
   }
  }
  for(let i=0;i<9;i++){
   const glucose=named(new T.Mesh(new T.IcosahedronGeometry(.045,0),mat('#dcc98e',1,.55)),`glucose-${i}`);this.glucose.push(glucose);this.root.add(glucose);
  }
  for(let i=0;i<10;i++){
   const ion=named(ball(.021,'#80c5c7'),`calcium-signal-${i}`);this.calcium.push(ion);this.root.add(ion);
   this.calciumRoutes.push(new T.CatmullRomCurve3([V(-.68,.862,.60),V(-.38,.58,.58),V(.18,.28,.62),V(.78,.08+(i%3)*.06,.62)]));
  }
  this.root.add(named(rimAt(V(-.68,.862,.60),V(-.68,.862,.60),.045,'#549493',.9),'membrane-calcium-channel-symbol'));
  this.render(0,0);
 }
 render(t:number,p?:number){
  const q=p===undefined?phase(t/8.6):clamp(p),binding=smooth(interval(q,.035,.21));
  const docking=V(...BETA_RECEPTOR).addScaledVector(V(...BETA_RECEPTOR).normalize(),.001);
  this.ligand.position.copy(V(-1.94,.57,.80)).lerp(docking,binding);this.ligand.rotation.z=-.38+.30*binding;
  this.ligand.scale.setScalar((.82+.12*binding)*.004); // It stays outside; it never becomes insulin.
  this.receptor.scale.setScalar(.004);
  for(let i=0;i<this.signal.length;i++){
   const u=interval(q-.009*i,.23,.49),signal=this.signal[i];signal.position.copy(this.signalPath.getPoint(u));
   signal.scale.setScalar(.17*envelope(q-.009*i,.23,.49,.025)*(1-i*.08));
  }
  for(let i=0;i<this.glucose.length;i++){
   const u=interval(q-i*.013,.005,.265),glucose=this.glucose[i];glucose.position.copy(V(-1.72,.65+(i%3)*.12,.50)).lerp(V(-.59,.43+(i%3)*.06,.53),smooth(u));
   glucose.scale.setScalar(.002*(1-smooth(interval(q-i*.013,.27,.33)))*(.66+(i%3)*.1));glucose.rotation.set(i+t*.1,i*.4,0);
  }
  for(let i=0;i<this.calcium.length;i++){
   const local=q-i*.007,ion=this.calcium[i];ion.position.copy(this.calciumRoutes[i].getPoint(interval(local,.34,.57)));
   ion.scale.setScalar(.002*envelope(local,.34,.57,.03));
  }
  for(const unit of this.units){
   const local=q-unit.delay,travel=smooth(interval(local,.46,.69)),fusion=smooth(interval(local,.72,.79));
   // A pre-existing insulin granule approaches from inside, docks, then fuses.
   const innerGate=unit.gate.clone().addScaledVector(unit.gate.clone().normalize(),-.077);
   unit.shell.position.copy(unit.origin).lerp(innerGate,travel);unit.shell.scale.setScalar(1-fusion);unit.shell.visible=local<.79;
   unit.fusion.scale.setScalar(envelope(local,.70,.88,.035));
   unit.released.forEach((insulin,j)=>{
    const u=interval(local-j*.014,.765,.98),direction=V(.83,.15*Math.sin(j*2.2+unit.delay*10),.18);
    insulin.position.copy(unit.gate).addScaledVector(direction,smooth(u));
    insulin.scale.setScalar(.018*smooth(interval(local-j*.014,.765,.80))*(1-smooth(interval(local-j*.014,.96,1.0))));
    insulin.rotation.set(0,u*.8,j+u*.5);
   });
  }
 }
}

type NervePulse={object:T.Mesh;curve:T.CatmullRomCurve3;start:number;end:number;lag:number};

export class BrainCircuit{
 root=new T.Group();nodes:T.Mesh[]=[];dots:{o:T.Mesh;c:T.CatmullRomCurve3;p:number}[]=[];
 private pulses:NervePulse[]=[];private synapses:{particles:T.Mesh[];from:T.Vector3;to:T.Vector3;start:number;end:number}[]=[];
 private centers=[V(-.7,-.10,.15),V(.25,.12,0),V(.65,-.35,.12),V(-.1,.6,-.1)];
 private activation=[.23,.62,.91,.91];private halos:T.Mesh[]=[];
 constructor(){
  this.root.name='illustrative-neural-network';
  for(let k=0;k<this.centers.length;k++){
   const center=this.centers[k],soma=named(ball(.115,k===0?'#b79f67':'#669b98',.96),`neuron-soma-${k}`);soma.position.copy(center);soma.scale.set(1,.9,.70);this.nodes.push(soma);this.root.add(soma);
   const nucleus=ball(.043,'#547c80');nucleus.position.copy(center).add(V(-.016,.005,.077));this.root.add(nucleus);
   const halo=new T.Mesh(new T.TorusGeometry(.135,.009,8,48),mat('#d3af5d',.85));halo.position.copy(center).add(V(0,0,.020));this.halos.push(halo);this.root.add(halo);
   // Unequal branched dendrites retain a clear soma and an identifiable axon.
   for(let j=0;j<5;j++){
    const a=(j/5*TAU)+k*.54+.30,length=.235+.06*Math.sin(j*2+k),radial=V(Math.cos(a),Math.sin(a),.15*Math.sin(j*1.4));
    const start=center.clone().addScaledVector(radial,.085),bend=center.clone().addScaledVector(radial,length*.67),tip=center.clone().addScaledVector(radial,length);
    bend.z+=.025*Math.sin(j);this.root.add(tube([start,bend,tip],.012,'#7ca6a0',.83));
    for(const side of [-1,1]){
     const fork=tip.clone().add(V(.102*Math.cos(a+side*.54),.086*Math.sin(a+side*.54),.02*Math.sin(j)));
     this.root.add(tube([tip,tip.clone().lerp(fork,.52).add(V(0,.012,0)),fork],.006,'#93b1a5',.79));
    }
    if(j%2===0){const spine=ball(.012,'#abc3ae',.84);spine.position.copy(bend).add(V(.02*Math.cos(a+.9),.023*Math.sin(a+.9),.018));this.root.add(spine);}
   }
  }
  this.path([V(-1.13,.16,.17),V(-1.00,.15,.18),V(-.88,.03,.19),this.centers[0]],.025,.22,.013,'#aeb894');
  this.connection(0,1,[V(-.59,-.12,.16),V(-.45,-.25,.22),V(-.27,-.15,.23),V(-.125,.015,.12)],V(-.087,.034,.09),.28,.48,.50,.54,.55,.62);
  // Branching output is schematic, without assigning a named brain nucleus.
  this.connection(1,2,[V(.31,.032,.025),V(.35,-.05,.11),V(.37,-.19,.17),V(.43,-.275,.19)],V(.468,-.294,.17),.68,.81,.815,.85,.855,.91);
  this.connection(1,3,[V(.205,.213,-.005),V(.20,.38,.01),V(.094,.454,.005),V(.013,.514,-.025)],V(-.014,.538,-.047),.68,.81,.815,.85,.855,.91);
  this.render(0);
 }
 private path(points:T.Vector3[],start:number,end:number,radius:number,color:string){
  const curve=new T.CatmullRomCurve3(points);this.root.add(new T.Mesh(new T.TubeGeometry(curve,48,radius,9,false),mat(color,.90)));
  for(let i=0;i<3;i++){
   const pulse=named(ball(.029-i*.004,'#d4ac58'),`neural-pulse-${this.pulses.length}`);this.root.add(pulse);
   this.pulses.push({object:pulse,curve,start,end,lag:i*.008});this.dots.push({o:pulse,c:curve,p:i*.008});
  }
  return curve;
 }
 private connection(from:number,to:number,axon:T.Vector3[],post:T.Vector3,axonStart:number,axonEnd:number,synStart:number,synEnd:number,dendriteStart:number,dendriteEnd:number){
  const start=this.centers[from].clone().lerp(axon[0],.72),end=axon[axon.length-1];
  this.path([start,...axon],axonStart,axonEnd,.017,'#578e8c');
  const bouton=named(ball(.022,'#9eb798',.90),`presynaptic-terminal-${from}-${to}`);bouton.position.copy(end);this.root.add(bouton);
  const receptor=ball(.014,'#73a29a',.94);receptor.position.copy(post);this.root.add(receptor);
  this.path([post,post.clone().lerp(this.centers[to],.52).add(V(.006,.019,.02)),this.centers[to]],dendriteStart,dendriteEnd,.012,'#83aaa0');
  const particles=[];for(let j=0;j<3;j++){const particle=named(ball(.010,'#d9b567'),`synaptic-signal-${from}-${to}-${j}`);particles.push(particle);this.root.add(particle);}
  this.synapses.push({particles,from:end,to:post,start:synStart,end:synEnd});
 }
 render(t:number,p?:number){
  const q=p===undefined?phase(t/7.6):clamp(p);
  for(const pulse of this.pulses){
   const local=q-pulse.lag,u=interval(local,pulse.start,pulse.end);pulse.object.position.copy(pulse.curve.getPoint(u));
   pulse.object.scale.setScalar(envelope(local,pulse.start,pulse.end,.009));
  }
  for(const synapse of this.synapses)synapse.particles.forEach((particle,j)=>{
   const local=q-j*.004,u=interval(local,synapse.start,synapse.end);particle.position.copy(synapse.from).lerp(synapse.to,smooth(u));
   particle.position.z+=.014*Math.sin(Math.PI*u)*(j-1);particle.scale.setScalar(envelope(local,synapse.start,synapse.end,.006));
  });
  this.nodes.forEach((node,i)=>{
   const active=envelope(q,this.activation[i],this.activation[i]+.058,.018);
   // Activity is a brief colour/rim change, not a physically inflating neuron.
   (node.material as T.MeshStandardMaterial).color.set(i===0?'#b79f67':'#669b98').lerp(new T.Color('#d5b86e'),active*.52);
   this.halos[i].scale.setScalar(active*(1+.06*active));
  });
 }
}
