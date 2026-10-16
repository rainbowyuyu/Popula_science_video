import * as T from 'three';
import {C,BASE,ball,box,clamp,ease,glass,helix,letter,lerp,line,mat,plate,ring,rod,sequence,setOpacity,v,word} from './primitives';
import {makeDroplet,gaussianCloud} from './Droplet';
import teaching from '../teaching-data.json';
import {sceneNarrationV4 as narration} from '../TimelineV4';
import {ERROR_EVENTS_V4,FOUNTAIN_EVENTS_V4,MATRIX_EVENTS_V4,CONSTRAINT_EVENTS_V4,DROPOUT_EVENTS_V4,eventMotionProgressV4,eventActionProgressV4} from '../EventsV4';
const cue=(id:string,origin:number)=> (narration.cues.find(c=>c.id===id)?.startSec??origin)-origin;

export abstract class Station extends T.Group {
 abstract update(t:number):void;
 installAsset(_name:string,_asset:T.Group){}
 assets=new T.Group();
 constructor(public stationId:string){super();this.name=stationId;this.add(this.assets);}
}

function memoryPicture(){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=576;const ctx=canvas.getContext('2d')!;const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;
 const draw=(t:number)=>{
  const sky=ctx.createLinearGradient(0,0,0,576);sky.addColorStop(0,'#b4d3ce');sky.addColorStop(.58,'#f4d7a9');sky.addColorStop(1,'#8dbea8');ctx.fillStyle=sky;ctx.fillRect(0,0,1024,576);
  ctx.fillStyle='#fff1c3';ctx.beginPath();ctx.arc(780,132,48,0,7);ctx.fill();
  for(let j=0;j<3;j++){ctx.fillStyle=['#5b9690','#83af9b','#a8c3a0'][j];ctx.beginPath();ctx.moveTo(0,350+j*55);for(let x=0;x<=1024;x+=8)ctx.lineTo(x,320+j*57+Math.sin(x*.006+j*2)*45);ctx.lineTo(1024,576);ctx.lineTo(0,576);ctx.fill();}
  ctx.fillStyle='#244c4b';const people=[{x:400,y:385,h:155},{x:548,y:397,h:145},{x:477,y:418,h:90}];
  people.forEach((p,i)=>{const sway=Math.sin(t*.9+i)*3;ctx.beginPath();ctx.arc(p.x+sway,p.y-p.h,15,0,7);ctx.fill();ctx.strokeStyle=i===2?'#d7a25d':'#244c4b';ctx.lineWidth=i===2?23:32;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(p.x+sway,p.y-p.h+26);ctx.lineTo(p.x,p.y-25);ctx.stroke();ctx.lineWidth=12;for(const sign of[-1,1]){ctx.beginPath();ctx.moveTo(p.x,p.y-30);ctx.lineTo(p.x+sign*15,p.y+25);ctx.stroke();ctx.beginPath();ctx.moveTo(p.x,p.y-p.h+40);ctx.lineTo(p.x+sign*48,p.y-p.h+80+Math.sin(t+i)*6);ctx.stroke();}});
  texture.needsUpdate=true;
 };draw(0);return{texture,draw};
}

export class HeroLab extends Station {
 private phone=new T.Group();private drive=new T.Group();private drop=makeDroplet(1.13);private cloud=gaussianCloud(900);private photo=memoryPicture();private bits:T.Mesh[]=[];private end=false;private family?:T.Texture;
 constructor(end=false){super(end?'return':'hook');this.end=end;this.add(plate());
  const chassis=box(5.5,3.22,.24,C.dark,.12);this.phone.add(chassis);
  const screen=new T.Mesh(new T.PlaneGeometry(5.1,2.86),new T.MeshBasicMaterial({map:this.photo.texture}));screen.position.z=.132;this.phone.add(screen);
  const lens=ball(.038,0x586b6e);lens.position.set(-2.6,0,.16);this.phone.add(lens);this.phone.position.set(-2,0,0);this.phone.rotation.set(-.05,.16,.03);this.add(this.phone);
  const disk=box(2.3,.4,3,C.dark,.14);disk.rotation.x=.32;this.drive.add(disk);const notch=box(.64,.03,.02,C.cyan,.01);notch.position.set(0,.45,1.15);this.drive.add(notch);this.drive.position.set(-2.5,-1.65,1.1);this.add(this.drive);
  const dish=new T.Mesh(new T.CylinderGeometry(1.8,1.86,.15,64),mat(C.white));dish.position.set(3,-2.25,0);this.add(dish);this.drop.position.set(3,0,0);this.add(this.drop);this.cloud.position.copy(this.drop.position);this.cloud.scale.setScalar(.47);this.add(this.cloud);
  for(let i=0;i<64;i++){const b=box(.07,.07,.07,i%4===0?C.gold:C.teal,.015);this.bits.push(b);this.add(b);}
 }
 update(t:number){const q=clamp(t/(this.end?28:18));if(this.family){this.family.repeat.set(.995,.80);this.family.offset.set(.0025,.05+.02*Math.sin(t*.08));}else this.photo.draw(t);this.phone.rotation.y=.16+Math.sin(q*Math.PI)*.12;this.phone.rotation.z=.03-Math.sin(q*Math.PI)*.035;
  this.drop.material.uniforms.uTime.value=t;this.cloud.material instanceof T.ShaderMaterial&&(this.cloud.material.uniforms.uTime.value=t);
  for(let i=0;i<this.bits.length;i++){const phase=t*.08+i/this.bits.length;let u=.5+.5*Math.sin(phase*Math.PI*2);if(this.end)u=1-u;const spread=Math.sin(u*Math.PI);this.bits[i].position.set(lerp(-.4,3,u),.3+Math.sin(i*2.4)*spread*.7,lerp(.2,0,u)+Math.cos(i*1.9)*spread*.55);this.bits[i].rotation.set(t*.35+i,t*.2,0);}
 }
 installAsset(name:string,asset:T.Group){
  if(name==='phone_landscape'){asset.traverse(o=>{if(o instanceof T.Mesh&&o.name.includes('PHONE_SCREEN'))o.visible=false;});const screen=new T.Mesh(new T.PlaneGeometry(.150,.068),new T.MeshBasicMaterial({map:this.photo.texture}));screen.position.set(0,.041,.0059);asset.add(screen);this.phone.clear();this.phone.add(fit(asset,5.6));}
  if(name==='portable_drive'){this.drive.clear();this.drive.add(fit(asset,2.5));}
  if(name==='lux_vial_holder'){const m=fit(asset,2.45,'y');m.position.set(5.85,-.82,-2.8);this.assets.add(m);}
 }
 setFamilyTexture(texture:T.Texture){this.family=texture;this.phone.traverse(o=>{if(o instanceof T.Mesh&&o.material instanceof T.MeshBasicMaterial&&o.material.map===this.photo.texture){o.material.map=texture;o.material.needsUpdate=true;}});}
}

export function fit(asset:T.Group,width:number,axis:'x'|'y'|'z'='x'){
 const b=new T.Box3().setFromObject(asset);const size=b.getSize(new T.Vector3());const center=b.getCenter(new T.Vector3());const group=new T.Group();asset.position.sub(center);group.add(asset);group.scale.setScalar(width/size[axis]);return group;
}

export class EncodeLine extends Station {
 dna=helix(22,7,1.0);pairs:T.Group[]=[];private beam:T.Mesh;private binary:T.Group[]=[];private carriers:T.Mesh[]=[];
 constructor(){super('encode');this.add(plate());this.dna.position.set(2.75,.35,0);this.dna.rotation.z=-.35;this.add(this.dna);
  ['00','01','10','11'].forEach((str,i)=>{const g=new T.Group();const ob=box(1.25,.83,.24,C.dark);g.add(ob);const w=word(str,'#ffffff',.7);w.position.z=.16;g.add(w);g.position.set(-4,(1.5-i)*1.02,.3);this.add(g);this.binary.push(g);
   const l=letter('ATCG'[i],.77);l.position.set(-1.15,(1.5-i)*1.02,.3);this.add(l);this.pairs.push(l);this.add(line([[-3.28,(1.5-i)*1.02,0],[-2.5,(1.5-i)*1.02,0],[-1.7,(1.5-i)*1.02,0]],0xc7d8d7,.012));
  });
  const cap=word('两位 → 一个字母','#173e48',.63);cap.position.set(-2.5,2.7,0);this.add(cap);
  this.beam=box(.035,5,.08,C.teal,.01);this.beam.position.set(-2.4,0,.25);this.add(this.beam);
  for(let i=0;i<24;i++){const b=ball(.06,BASE['ATCG'[i%4]]);this.carriers.push(b);this.add(b);}
 }
 update(t:number){this.dna.rotation.y=t*.065;const beamU=.5+.5*Math.sin(t*.14*Math.PI*2);this.beam.position.x=-3.5+beamU*2;this.pairs.forEach((p,i)=>{p.position.x=-1.15+.14*Math.sin(t*.75-i);p.rotation.y=.15*Math.sin(t*.5+i);});this.carriers.forEach((b,i)=>{const u=.5+.5*Math.sin((t*.07+i/24)*Math.PI*2),a=i*2.399;const startY=(1.5-i%4)*1.02;const endY=(i/23-.5)*5.8;b.position.set(lerp(-1.1,2.75+Math.cos(a+t*.065)*.9,u),lerp(startY,endY,u)+Math.sin(u*Math.PI)*.28,lerp(.3,Math.sin(a+t*.065)*.9,u));});}
}

export class ConstraintStation extends Station {
 private packs:T.Group[]=[];private rejected:T.Group;private gc=new T.Group();private bars:T.Mesh[]=[];private scanner:T.Mesh;private gcHighlight=new T.Group();
 constructor(){super('constraints');this.add(plate());
  const rails=[[-5,-1.7,0],[5,-1.7,0]];this.add(rod(rails[0],rails[1],.024,C.steel));this.add(line([[0,-1.7,0],[1,-.5,0],[3,1.7,0],[5,1.7,0]],C.coral,.026));
  ['ATGCGT','GCTAGT','TACGAC'].forEach((seq,i)=>{const g=sequence(seq,.59,.68);const address=box(.5,.59,.19,C.dark,.06);address.position.x=-2.4;g.add(address);const digit=word(String(i+1),'#ffffff',.53);digit.position.set(-2.4,0,.22);g.add(digit);g.position.set(-1.1,(1-i)*1.24,.3);this.add(g);this.packs.push(g);});
  this.rejected=sequence('AAAAAA',.59,.68);this.rejected.position.set(0,0,0);this.add(this.rejected);
  const arch=glass(.9,4.7,1.8,.11);arch.position.set(2,0,-.1);this.add(arch);
  this.scanner=box(.025,4.7,1.8,C.cyan,.008);this.scanner.position.copy(arch.position);this.add(this.scanner);
  for(let i=0;i<12;i++){const b=box(.23,.62+(i%3)*.18,.12,i<6?C.teal:0xd5dedb,.025);b.position.set((i-5.5)*.32,0,0);this.bars.push(b);this.gc.add(b);}this.gc.position.set(0,-2,.3);this.add(this.gc);
  const g=letter('G',.93),c=letter('C',.93),plus=word('+','#173e48',.74);g.position.x=-.8;c.position.x=.8;this.gcHighlight.add(g,c,plus);this.gcHighlight.position.set(-1.1,2.95,.4);this.add(this.gcHighlight);
 }
 update(t:number){const phase=ease((t-8)/9);this.packs.forEach((p,i)=>{p.position.x=-1.9+phase*.75+.06*Math.sin(t*.4+i);});this.rejected.position.set(lerp(5.5,3.5,ease((t-2)/6)),lerp(16,2.8,ease((t-2)/6))+14*eventActionProgressV4(CONSTRAINT_EVENTS_V4[0],t+44,3.2),.8);this.scanner.position.x=2+Math.sin(t*.5)*.18;this.gc.scale.y=.95+Math.sin(t*.7)*.05;const q=ease((t-cue('n07',44)+.4)/2.2);this.gcHighlight.position.set(-1.1,lerp(16,2.95,q),.4);this.gcHighlight.scale.setScalar(1+.045*Math.sin(t*1.8)*q);}
}

export class FountainGraph extends Station {
 private sources:T.Group[]=[];private droplets:T.Group[]=[];private paths:T.Mesh[]=[];private runners:T.Mesh[]=[];private recovered:T.Group;private recoveredC=new T.Group();
 constructor(){super('fountain');this.add(plate());
  ['A','B','C'].forEach((l,i)=>{const s=box(1.05,.87,.52,[C.teal,C.gold,C.violet][i]);const g=new T.Group();g.add(s);const label=word(l,'#173e48',.8);label.position.z=.42;g.add(label);const cn=word(['甲','乙','丙'][i],'#356068',.55);cn.position.set(0,-.72,.2);g.add(cn);g.position.set(-3.95,2.05-i*1.85,.2);this.add(g);this.sources.push(g);});
  const defs=[{x:-.65,y:2.0,text:'A'},{x:2.5,y:1.35,text:'A ⊕ B'},{x:.5,y:-.9,text:'B ⊕ C'},{x:3.9,y:-1.45,text:'A ⊕ B ⊕ C'}];
  defs.forEach((d,i)=>{const g=new T.Group();const drop=makeDroplet(.65);g.add(drop);const center=ball(.15,[C.teal,C.gold,C.violet,C.coral][i]);g.add(center);const w=word(d.text,'#173e48',.65);w.position.set(0,-.83,.2);g.add(w);g.position.set(d.x,d.y+(i===3?.48:0),-.2+(i%2)*.5);this.add(g);this.droplets.push(g);});
  const edges=[[0,0],[0,1],[1,1],[1,2],[2,2],[0,3],[1,3],[2,3]];edges.forEach(([s,d],i)=>{const a=this.sources[s].position,b=this.droplets[d].position;const path=line([[a.x+.6,a.y,-.3],[-2,a.y,-1.1],[b.x-.5,b.y,-.3]],i<3?C.teal:C.steel,.019,.52);this.add(path);this.paths.push(path);const bead=ball(.045,i<3?C.gold:C.teal);this.add(bead);this.runners.push(bead);bead.userData={a:a.clone(),b:b.clone(),i};});
  this.recovered=new T.Group();const wb=word('B = A ⊕ (A ⊕ B)','#168e92',.85);this.recovered.add(wb);this.recovered.position.set(.3,16,0);this.add(this.recovered);
  const wc=word('C = B ⊕ (B ⊕ C)','#756ab0',.85);this.recoveredC.add(wc);this.recoveredC.position.set(.3,18,0);this.add(this.recoveredC);
 }
 update(t:number){const missing=ease((t-12)/3),restoreB=eventActionProgressV4(FOUNTAIN_EVENTS_V4[0],t+75),restoreC=eventActionProgressV4(FOUNTAIN_EVENTS_V4[1],t+75),leaveB=restoreC,leaveC=ease((t+75-(FOUNTAIN_EVENTS_V4[1]?.sceneEndSec??112)-1)/4);this.sources[1].position.x=lerp(-3.95,-16,missing*(1-restoreB));this.sources[2].position.x=lerp(-3.95,-16,missing*(1-restoreC));this.droplets.forEach((d,i)=>{d.position.z=(-.2+(i%2)*.5)+Math.sin(t*.35+i)*.16;(d.children[0] as T.Mesh<T.SphereGeometry,T.ShaderMaterial>).material.uniforms.uTime.value=t+i;});this.runners.forEach(b=>{const u=.5+.5*Math.sin((t*.11+b.userData.i*.13)*Math.PI*2);const a=b.userData.a as T.Vector3,c=b.userData.b as T.Vector3;b.position.lerpVectors(a,c,u);b.position.z-=Math.sin(u*Math.PI)*.9;});this.recovered.position.set(.3,lerp(16,3.35,eventMotionProgressV4(FOUNTAIN_EVENTS_V4[0],t+75))+16*leaveB,0);this.recoveredC.position.set(.3,lerp(18,2.55,eventMotionProgressV4(FOUNTAIN_EVENTS_V4[1],t+75))+18*leaveC,0);}
}

export class SequencingFlow extends Station {
 private strands:T.Group[]=[];private drops:T.Mesh[]=[];private nozzle=new T.Group();private errors:T.Group[]=[];private liquid:T.Mesh<T.SphereGeometry,T.ShaderMaterial>;
 constructor(){super('wetlab');this.add(plate());
  const block=glass(10.5,2.0,2.6,.10);block.position.set(0,-.85,-.5);this.add(block);
  for(let j=0;j<3;j++){const y=.25-j*.77;this.add(line([[-5,y,0],[-3.5,y,0],[-2.7,y+.16,0],[0,y+.16,0],[2.7,y,0],[5,y,0]],0x87b9b9,.10,.4));}
  const cone=new T.Mesh(new T.CylinderGeometry(.42,.10,1.4,40),mat(C.steel,.13,.55));this.nozzle.add(cone);const nozzleCap=box(.95,.38,.95,C.white);nozzleCap.position.y=.8;this.nozzle.add(nozzleCap);this.nozzle.position.set(-3.9,2.5,0);this.add(this.nozzle);
  for(let i=0;i<7;i++){const drop=ball(.105,C.teal);this.drops.push(drop);this.add(drop);}
  for(let i=0;i<5;i++){const s=sequence(['ATGCAT','ATG-AT','ATCCAT','ATGGCAT','ATGCAT'][i],.40,.48);s.position.set(-2,1.1-i*.64,.6);this.strands.push(s);this.add(s);}
  this.liquid=makeDroplet(1.4);this.liquid.position.set(-3,-.1,0);this.add(this.liquid);
  const defs=[{s:'ATCCAT',y:1.4},{s:'ATGGCAT',y:.28},{s:'ATG-AT',y:-.84}];defs.forEach((d,i)=>{const g=sequence(d.s,.56,.68);const halo=ring(.42,C.coral,.035);halo.position.set(((i===0?2:3)-(d.s.length-1)/2)*.68,0,.16);g.add(halo);g.position.set(2.5,d.y,1);this.add(g);this.errors.push(g);});
 }
 update(t:number){this.liquid.material.uniforms.uTime.value=t;const err=cue('n19',118),reveal=ease((t-15)/5);this.nozzle.position.y=2.5+.07*Math.sin(t);this.drops.forEach((d,i)=>{const u=.5+.5*Math.sin((t*.4+i*.29)*Math.PI*2);d.position.set(-3.9,1.8-u*1.8,0);});this.strands.forEach((s,i)=>{s.position.x=lerp(-5.8,-2.8,ease((t-i)/8));s.position.y=1.1-i*.64-14*ease((t-(err-3))/6);s.position.z=lerp(.6,-.6,reveal);s.scale.setScalar(lerp(.9,.75,reveal));});this.errors.forEach((g,i)=>{const enter=eventMotionProgressV4(ERROR_EVENTS_V4[i],t+118);g.position.x=lerp(14,2.5,enter);g.position.y=[1.4,.28,-.84][i]+(i===0?14*eventActionProgressV4(DROPOUT_EVENTS_V4[0],t+118,3.2):0);});this.liquid.scale.setScalar(lerp(1,.65,reveal));}
 installAsset(name:string,asset:T.Group){if(name==='synthesis_nozzle'){this.nozzle.clear();this.nozzle.add(fit(asset,2.2,'y'));}if(name==='sequencing_flowcell'){const g=fit(asset,10.4);g.position.set(0,-1.8,-.9);g.rotation.x=.28;this.assets.add(g);}if(name==='glass_vial'){const g=fit(asset,3.3,'y');g.position.set(-4.9,.1,-1.8);this.assets.add(g);}if(name==='lux_vial_holder'){const g=fit(asset,2.25,'y');g.position.set(-5,-1.05,-3);this.assets.add(g);}}
}

export class ConsensusLab extends Station {
 private reads:T.Group[]=[];private cells:T.Mesh[]=[];private routes:T.Mesh[]=[];private matrixGroup=new T.Group();private consensus=sequence('GATTAC',.75,.95);private spot:T.Mesh;private readPlane=new T.Group();private votes:T.Mesh[]=[];
 constructor(){super('consensus');this.add(plate());
  teaching.smithWaterman.reads.forEach((r,i)=>{const g=sequence(r.sequence,.56,.67);g.position.set(-3.2,2.05-i*1.12,.4);this.readPlane.add(g);this.reads.push(g);});this.add(this.readPlane);
  const matrix=teaching.smithWaterman.matrix;matrix.forEach((row,ri)=>row.forEach((score,ci)=>{const p=box(.57,.57,.12,score===8?C.gold:score>0?0xc5ddda:0xe2eae5,.06);p.position.set(ci*.66, -ri*.66,0);this.matrixGroup.add(p);this.cells.push(p);const w=word(String(score),'#173e48',.5);w.position.set(p.position.x,p.position.y,.32);this.matrixGroup.add(w);}));
  this.matrixGroup.position.set(.5,2.02,-.3);this.add(this.matrixGroup);
  [...teaching.smithWaterman.reference].forEach((char,i)=>{const w=word(char,'#173e48',.55);w.position.set((i+1)*.66,.63,.04);this.matrixGroup.add(w);});
  [...teaching.smithWaterman.query].forEach((char,i)=>{const w=word(char,'#173e48',.55);w.position.set(-.64,-(i+1)*.66,.04);this.matrixGroup.add(w);});
  const path=teaching.smithWaterman.path;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];const edge=rod([a[1]*.66,-a[0]*.66,.18],[b[1]*.66,-b[0]*.66,.18],.027,C.coral);this.matrixGroup.add(edge);this.routes.push(edge);}
  this.spot=ring(.28,C.coral,.03);this.matrixGroup.add(this.spot);this.consensus.position.set(.1,-1.8,1.2);this.add(this.consensus);
  for(let i=0;i<24;i++){const b=ball(.045,i%4===3?C.coral:C.teal);this.votes.push(b);this.add(b);}
 }
 update(t:number){const q=ease((t-3)/12);this.readPlane.position.x=lerp(-.7,0,q);const voteStart=cue('n27',160),backStart=(MATRIX_EVENTS_V4[0]?.sceneStartSec??160+cue('n25',160))-160;const focus=ease((t-voteStart)/4);this.matrixGroup.position.z=lerp(-.3,-2,focus);this.matrixGroup.rotation.y=lerp(0,-.2,focus);const forward=clamp((t-cue('n24',160))/Math.max(1,backStart-cue('n24',160)))*5;const step=t<backStart?forward:5-eventActionProgressV4(MATRIX_EVENTS_V4[0],t+160)*5;const i=Math.min(4,Math.floor(step)),f=step-i,p=teaching.smithWaterman.path;const a=p[i],b=p[i+1];this.spot.position.set(lerp(a[1],b[1],f)*.66,-lerp(a[0],b[0],f)*.66,.24);this.routes.forEach((r,j)=>{r.scale.setScalar(.002+.998*ease((forward-j)*1.5));});this.consensus.position.y=lerp(-7,-1.95,ease((t-voteStart)/4));this.reads.forEach((r,i)=>{r.position.x=-3.2+.04*Math.sin(t*.4+i);});this.votes.forEach((b,i)=>{const col=i%6,row=Math.floor(i/6);const u=clamp((t-voteStart-col*.28-row*.17)/4);b.position.set(lerp(-3.2+(col-2.5)*.67,(col-2.5)*.95,u),lerp(2.05-row*1.12,this.consensus.position.y,u),lerp(.7,1.2,u));b.scale.setScalar(.15+.85*Math.sin(u*Math.PI));});}
}

export class ModelStudio extends Station {
 private dna=sequence('ATGCATGC',.56,.68);private tokens:T.Group[]=[];private networkLayers:T.Group[]=[];private orbit:T.Mesh[]=[];private candidates:T.Group[]=[];private track:T.CatmullRomCurve3;
 constructor(){super('model');this.add(plate());this.dna.position.set(-2.75,2.5,0);this.add(this.dna);
  ['ATG','CAT','GC'].forEach((s,i)=>{const tok=new T.Group();const b=box(1.34,.69,.25,[C.teal,C.gold,C.violet][i]);tok.add(b);const txt=word(s,'#ffffff',.61);txt.position.z=.2;tok.add(txt);tok.position.set(-4.3+i*1.75,1.22,.1);this.tokens.push(tok);this.add(tok);});
  for(let z=0;z<4;z++){const layer=new T.Group();for(let y=0;y<4;y++)for(let x=0;x<4;x++){const bead=ball(.12,(x+y+z)%3?C.teal:C.gold);bead.position.set((x-1.5)*.51,(y-1.5)*.5,0);layer.add(bead);}layer.position.set(-.2+z*.62,-.45,-z*.55);layer.rotation.y=-.17;this.networkLayers.push(layer);this.add(layer);}
  const sh=glass(3.25,3.15,2.8,.07);sh.position.set(.8,-.45,-.6);this.add(sh);
  ['ATGCAT','GCTAGC','AAAAAA'].forEach((s,i)=>{const row=sequence(s,.4,.46);row.position.set(3.95,1.7-i*1.32,.3);this.add(row);this.candidates.push(row);});
  this.track=new T.CatmullRomCurve3([new T.Vector3(-3,-1.8,0),new T.Vector3(.5,-2.25,1),new T.Vector3(4.6,-1.9,0),new T.Vector3(5,2.4,-1),new T.Vector3(.4,3.4,-2),new T.Vector3(-4,2.4,-1)],true,'catmullrom',.5);
  const tube=new T.Mesh(new T.TubeGeometry(this.track,110,.018,6,true),mat(0xc0d1cb));this.add(tube);
  for(let i=0;i<12;i++){const p=ball(.06,i%2?C.gold:C.teal);this.orbit.push(p);this.add(p);}
 }
 update(t:number){this.networkLayers.forEach((l,i)=>{l.rotation.y=-.17+Math.sin(t*.22+i*.3)*.15;});this.tokens.forEach((tok,i)=>{tok.position.y=1.22+.1*Math.sin(t*.55+i);});this.orbit.forEach((p,i)=>p.position.copy(this.track.getPoint((t*.032+i/12)%1)));const reject=ease((t-cue('n33',216))/4);this.candidates[2].position.set(3.95+3.2*reject,1.7-2*1.32+16*reject*reject,.3);}
}

export class CodaTable extends Station {constructor(){super('coda');this.add(plate());}update(_t:number){}}

export const makeStations=()=>[new HeroLab(),new EncodeLine(),new ConstraintStation(),new FountainGraph(),new SequencingFlow(),new ConsensusLab(),new ModelStudio(),new HeroLab(true),new CodaTable()];


