import * as T from 'three';
import {C,BASE,ball,box,clamp,ease,glass,helix,letter,lerp,line,mat,plate,ring,rod,sequence,setOpacity,v,word} from './primitivesV6';
import {makeDroplet,gaussianCloud} from './Droplet';
import teaching from '../teaching-data.json';
import {MemoryArchiveV6} from './MemoryArchiveV6';
import {sceneNarrationV6 as narration} from '../TimelineV6';
import {ERROR_EVENTS_V6,FOUNTAIN_EVENTS_V6,LOSS_EVENTS_V6,MATRIX_EVENTS_V6,CONSTRAINT_EVENTS_V6,DROPOUT_EVENTS_V6,eventMotionProgressV6,eventActionProgressV6} from '../EventsV6';
const cue=(id:string,origin:number)=> (narration.cues.find(c=>c.id===id)?.startSec??origin)-origin;

const ALIGNMENT_PATH_V6=[[0,0],...teaching.smithWaterman.path];

export abstract class Station extends T.Group {
 abstract update(t:number):void;
 installAsset(_name:string,_asset:T.Group){}
 assets=new T.Group();
 constructor(public stationId:string){super();this.name=stationId;this.add(this.assets);}
}

export function fit(asset:T.Group,width:number,axis:'x'|'y'|'z'='x'){
 const b=new T.Box3().setFromObject(asset);const size=b.getSize(new T.Vector3());const center=b.getCenter(new T.Vector3());const group=new T.Group();asset.position.sub(center);group.add(asset);group.scale.setScalar(width/size[axis]);return group;
}

export class EncodeLine extends Station {
 dna=helix(22,6,1.0);pairs:T.Group[]=[];private beam:T.Mesh;private binary:T.Group[]=[];private carriers:T.Mesh[]=[];
 constructor(){super('encode');this.dna.position.set(2.75,.35,0);this.dna.rotation.z=-.22;this.add(this.dna);
  ['00','01','10','11'].forEach((str,i)=>{const g=new T.Group();const ob=box(1.25,.83,.24,C.dark);g.add(ob);const w=word(str,'#ffffff',.7);w.position.z=.16;g.add(w);g.position.set(-4,(1.5-i)*1.02,.3);this.add(g);this.binary.push(g);
   const l=letter('ACGT'[i],.77);l.position.set(-1.15,(1.5-i)*1.02,.3);this.add(l);this.pairs.push(l);this.add(line([[-3.28,(1.5-i)*1.02,0],[-2.5,(1.5-i)*1.02,0],[-1.7,(1.5-i)*1.02,0]],0xc7d8d7,.012));
  });
  const cap=word('00 → A','#173e48',.8);cap.position.set(-2.5,2.7,0);this.add(cap);
  this.beam=box(.035,5,.08,C.teal,.01);this.beam.position.set(-2.4,0,.25);this.add(this.beam);
  for(let i=0;i<24;i++){const b=ball(.06,BASE['ACGT'[i%4]]);this.carriers.push(b);this.add(b);}
 }
 update(t:number){this.dna.rotation.y=t*.065;const beamU=ease((t-2)/8);this.beam.position.x=-3.5+beamU*2;this.pairs.forEach((p,i)=>{const q=ease((t-1-i*.6)/3.3);p.position.x=lerp(-3.95,-1.15,q);p.position.z=.31+Math.sin(Math.PI*q)*.65;p.rotation.y=.05*Math.sin(t*.35+i);});this.carriers.forEach((b,i)=>{const u=.5+.5*Math.sin((t*.07+i/24)*Math.PI*2),a=i*2.399;const startY=(1.5-i%4)*1.02;const endY=(i/23-.5)*5.8;b.position.set(lerp(-1.1,2.75+Math.cos(a+t*.065)*.9,u),lerp(startY,endY,u)+Math.sin(u*Math.PI)*.28,lerp(.3,Math.sin(a+t*.065)*.9,u));});}
}

export class ConstraintStation extends Station {
 private packs:T.Group[]=[];private rejected:T.Group;private gc=new T.Group();private bars:T.Mesh[]=[];private scanner:T.Mesh;private gcHighlight=new T.Group();
 constructor(){super('constraints');
  const rails=[[-5,-1.7,0],[5,-1.7,0]];this.add(rod(rails[0],rails[1],.024,C.steel));this.add(line([[0,-1.7,0],[1,-.5,0],[3,1.7,0],[5,1.7,0]],C.coral,.026));
  ['ATGCGT','GCTAGT','TACGAC'].forEach((seq,i)=>{const g=sequence(seq,.59,.68);const address=box(.5,.59,.19,C.dark,.06);address.position.x=-2.4;g.add(address);const digit=word(String(i+1),'#ffffff',.53);digit.position.set(-2.4,0,.22);g.add(digit);g.position.set(-1.1,(1-i)*1.24,.3);this.add(g);this.packs.push(g);});
  this.rejected=sequence('AAAAAA',.59,.68);this.rejected.position.set(0,0,0);this.add(this.rejected);
  const arch=glass(.9,4.7,1.8,.11);arch.position.set(2,0,-.1);this.add(arch);
  this.scanner=box(.025,4.7,1.8,C.cyan,.008);this.scanner.position.copy(arch.position);this.add(this.scanner);
  for(let i=0;i<12;i++){const b=box(.23,.62+(i%3)*.18,.12,i<6?C.teal:0xd5dedb,.025);b.position.set((i-5.5)*.32,0,0);this.bars.push(b);this.gc.add(b);}this.gc.position.set(0,-2,.3);this.add(this.gc);const bracket=line([[-.52,.68,.05],[-.52,.87,.05],[.52,.87,.05],[.52,.68,.05]],C.teal,.018);this.gc.add(bracket);
  const g=letter('G',.93),c=letter('C',.93),plus=word('+','#173e48',.74);g.position.x=-.8;c.position.x=.8;this.gcHighlight.add(g,c,plus);this.gcHighlight.position.set(-1.1,2.95,.4);this.add(this.gcHighlight);
 }
 update(t:number){
  const inspect=cue('n07',44),address=cue('n09',44),reject=eventActionProgressV6(CONSTRAINT_EVENTS_V6[0],t+44,2.6);
  this.packs.forEach((p,i)=>{const arrival=ease((t-inspect+1-i*.25)/3);p.position.set(-1.1,lerp(-12,(1-i)*1.24,arrival),.3);});
  const park=ease((t-inspect+1)/2);
  this.rejected.position.set(-.2+3.6*park+5.4*reject,1.65+11.5*reject,.8);
  this.rejected.scale.setScalar(lerp(1.3,1,ease((t-inspect+1)/2)));
  this.scanner.position.x=lerp(-4.5,2,ease((t-1)/7));
  const gcQ=ease((t-inspect+.5)/2);this.gc.position.y=lerp(-12,-2,gcQ);
  this.gcHighlight.position.set(-1.1,lerp(14,2.95,gcQ),.4);
  this.bars.forEach((b,i)=>{b.scale.y=.75+.25*ease((t-inspect-i*.12)/1.2);});
 }

}

export class FountainGraph extends Station {
 private sources:T.Group[]=[];private droplets:T.Group[]=[];private paths:T.Mesh[]=[];private runners:T.Mesh[]=[];private recovered:T.Group;private recoveredC=new T.Group();
 constructor(){super('fountain');
  ['A','B','C'].forEach((l,i)=>{const s=box(1.05,.87,.52,[C.teal,C.gold,C.violet][i]);const g=new T.Group();g.add(s);const label=word(l,'#173e48',.8);label.position.z=.42;g.add(label);const cn=word(['甲','乙','丙'][i],'#356068',.55);cn.position.set(0,-.72,.2);g.add(cn);g.position.set(-3.95,2.05-i*1.85,.2);this.add(g);this.sources.push(g);});
  const defs=[{x:-.65,y:2.0,text:'A'},{x:2.5,y:1.35,text:'A ⊕ B'},{x:.5,y:-.9,text:'B ⊕ C'},{x:3.9,y:-1.45,text:'A ⊕ B ⊕ C'}];
  defs.forEach((d,i)=>{const g=new T.Group();const drop=makeDroplet(.65);g.add(drop);const center=ball(.15,[C.teal,C.gold,C.violet,C.coral][i]);g.add(center);const w=word(d.text,'#173e48',.65);w.position.set(0,-.83,.2);g.add(w);g.position.set(d.x,d.y+(i===3?.48:0),-.2+(i%2)*.5);this.add(g);this.droplets.push(g);});
  const edges=[[0,0],[0,1],[1,1],[1,2],[2,2],[0,3],[1,3],[2,3]];edges.forEach(([s,d],i)=>{const a=this.sources[s].position,b=this.droplets[d].position;const path=line([[a.x+.6,a.y,-.3],[-2,a.y,-1.1],[b.x-.5,b.y,-.3]],i<3?C.teal:C.steel,.019,.52);this.add(path);this.paths.push(path);path.userData={source:s,drop:d};const bead=ball(.045,i<3?C.gold:C.teal);this.add(bead);this.runners.push(bead);bead.userData={a:a.clone(),b:b.clone(),i};});
  this.recovered=new T.Group();const wb=word('B = A ⊕ (A ⊕ B)','#168e92',.85);this.recovered.add(wb);this.recovered.position.set(.3,16,0);this.add(this.recovered);
  const wc=word('C = B ⊕ (B ⊕ C)','#756ab0',.85);this.recoveredC.add(wc);this.recoveredC.position.set(.3,18,0);this.add(this.recoveredC);
 }
 update(t:number){const missing=eventActionProgressV6(LOSS_EVENTS_V6[0],t+75,3.2),restoreB=eventActionProgressV6(FOUNTAIN_EVENTS_V6[0],t+75,3.2),restoreC=eventActionProgressV6(FOUNTAIN_EVENTS_V6[1],t+75,3.2),leaveB=restoreC,leaveC=ease((t+75-(FOUNTAIN_EVENTS_V6[1]?.sceneEndSec??112)-1)/4);this.sources[1].position.x=lerp(-3.95,-16,missing*(1-restoreB));this.sources[2].position.x=lerp(-3.95,-16,missing*(1-restoreC));this.droplets.forEach((d,i)=>{d.position.z=(-.2+(i%2)*.5)+Math.sin(t*.35+i)*.16;(d.children[0] as T.Mesh<T.SphereGeometry,T.ShaderMaterial>).material.uniforms.uTime.value=t+i;});this.runners.forEach(b=>{const u=.5+.5*Math.sin((t*.11+b.userData.i*.13)*Math.PI*2);const a=b.userData.a as T.Vector3,c=b.userData.b as T.Vector3;b.position.lerpVectors(a,c,u);b.position.z-=Math.sin(u*Math.PI)*.9;});this.paths.forEach(p=>{const focus=ease(restoreB*2),active=p.userData.drop===1?1-restoreC:p.userData.drop===2?restoreC:0;const m=p.material as T.MeshStandardMaterial;m.opacity=lerp(.52,.12+.78*active,focus);m.transparent=true;m.depthWrite=false;m.color.set(C.steel).lerp(new T.Color(C.teal),lerp(.6,active,focus));});this.recovered.position.set(.3,lerp(16,3.35,eventMotionProgressV6(FOUNTAIN_EVENTS_V6[0],t+75))+16*leaveB,0);this.recoveredC.position.set(.3,lerp(18,2.55,eventMotionProgressV6(FOUNTAIN_EVENTS_V6[1],t+75))+18*leaveC,0);}
}

export class SequencingFlow extends Station {
 private strands:T.Group[]=[];private drops:T.Mesh[]=[];private nozzle=new T.Group();private errors:T.Group[]=[];private liquid:T.Mesh<T.SphereGeometry,T.ShaderMaterial>;private originalRead=sequence('ATGCAT',.56,.68);private flowcellFallback=new T.Group();
 constructor(){super('wetlab');this.originalRead.position.set(2.5,2.6,1);this.add(this.originalRead);
  // A thin optical cartridge sits underneath the data. The old translucent box
  // and three oversized floating tubes duplicated the imported flow-cell.
  const bed=box(10.4,.3,5.9,0xe4e7df,.14);bed.position.set(0,-1.8,-.9);this.flowcellFallback.add(bed);
  const lid=glass(9.3,.07,4.8,.12);lid.position.set(0,-1.59,-.9);this.flowcellFallback.add(lid);
  for(let j=0;j<4;j++){const z=-2.35+j*.96;const channel=line([[-4.3,-1.58,z],[-3.7,-1.58,z-.08],[3.7,-1.58,z+.08],[4.3,-1.58,z]],0x408d8d,.043,.78);this.flowcellFallback.add(channel);}
  this.add(this.flowcellFallback);
  const cone=new T.Mesh(new T.CylinderGeometry(.42,.10,1.4,40),mat(C.steel,.13,.55));this.nozzle.add(cone);const nozzleCap=box(.95,.38,.95,C.white);nozzleCap.position.y=.8;this.nozzle.add(nozzleCap);this.nozzle.position.set(-3.9,2.5,0);this.add(this.nozzle);
  for(let i=0;i<7;i++){const drop=ball(.105,C.teal);this.drops.push(drop);this.add(drop);}
  for(let i=0;i<5;i++){const s=sequence(['ATGCAT','ATG-AT','ATCCAT','ATGGCAT','ATGCAT'][i],.40,.48);s.position.set(-2,1.1-i*.64,.6);this.strands.push(s);this.add(s);}
  this.liquid=makeDroplet(1.4);this.liquid.position.set(-3,-.1,0);this.add(this.liquid);
  const defs=[{s:'ATCCAT',y:1.4},{s:'ATGGCAT',y:.28},{s:'ATG-AT',y:-.84}];defs.forEach((d,i)=>{const g=sequence(d.s,.56,.68);g.userData.letters=[...g.children];if(i===0){const a=letter('G',.56);g.userData.sourceMap=(a.children[1] as T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>).material.map;g.userData.targetMap=(g.children[2].children[1] as T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>).material.map;}if(i===2){const removed=letter('C',.56);removed.position.x=.34;g.add(removed);g.userData.removed=removed;}const halo=ring(.42,C.coral,.035);halo.position.set(((i===0?2:3)-(d.s.length-1)/2)*.68,0,.16);g.add(halo);g.position.set(2.5,d.y,1);this.add(g);this.errors.push(g);});
 }
 update(t:number){this.liquid.material.uniforms.uTime.value=t;const err=cue('n19',118),reveal=ease((t-15)/5);this.nozzle.position.y=2.5+.07*Math.sin(t);this.drops.forEach((d,i)=>{const u=.5+.5*Math.sin((t*.4+i*.29)*Math.PI*2);d.position.set(-3.9,1.8-u*1.8,0);});this.strands.forEach((s,i)=>{s.position.x=lerp(-5.8,-2.8,ease((t-i)/8));s.position.y=1.1-i*.64-14*ease((t-(err-3))/6);s.position.z=lerp(.6,-.6,reveal);s.scale.setScalar(lerp(.9,.75,reveal));});this.originalRead.position.x=lerp(15,2.5,ease((t-err+2)/3));this.errors.forEach((g,i)=>{const action=eventActionProgressV6(ERROR_EVENTS_V6[i],t+118,1.5);const ls=g.userData.letters as T.Group[];if(i===0){const changed=ls[2];changed.rotation.y=action*Math.PI*2;(changed.children[1] as T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>).material.map=action<.5?g.userData.sourceMap:g.userData.targetMap;(changed.children[0] as T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>).material.color.set(action<.5?BASE.G:BASE.C);}if(i===1){ls.forEach((l,j)=>{l.position.x=(j-3)*.68+(j<3?.34:j>3?-.34:0)*(1-action);if(j===3){l.position.y=8*(1-action);l.rotation.z=(1-action)*.8;}});}if(i===2){g.userData.removed.position.y=9*action;ls[3].children.forEach((object,index)=>{const material=(object as T.Mesh).material as T.Material;material.opacity=action;material.transparent=index===1||action<1;material.depthWrite=index===0&&action>=1;});}const enter=eventMotionProgressV6(ERROR_EVENTS_V6[i],t+118);g.position.x=lerp(14,2.5,enter);g.position.y=[1.4,.28,-.84][i]+(i===0?14*eventActionProgressV6(DROPOUT_EVENTS_V6[0],t+118,3.2):0);});this.liquid.scale.setScalar(lerp(1,.65,reveal));}
 installAsset(name:string,asset:T.Group){if(name==='synthesis_nozzle'){this.nozzle.clear();this.nozzle.add(fit(asset,2.2,'y'));}if(name==='sequencing_flowcell'){this.flowcellFallback.visible=false;const g=fit(asset,10.4);g.position.set(0,-1.8,-.9);g.rotation.x=.28;this.assets.add(g);}if(name==='glass_vial'){const g=fit(asset,3.3,'y');g.position.set(-4.9,.1,-1.8);this.assets.add(g);}if(name==='lux_vial_holder'){const g=fit(asset,2.25,'y');g.position.set(-5,-1.05,-3);this.assets.add(g);}}
}

export class ConsensusLab extends Station {
 private reads:T.Group[]=[];private cells:T.Mesh[]=[];private routes:T.Mesh[]=[];private matrixGroup=new T.Group();private consensus=sequence('GATTAC',.75,.95);private spot:T.Mesh;private readPlane=new T.Group();private votes:T.Mesh[]=[];private analogy=new T.Group();private analogyRows:T.Group[]=[];
 constructor(){super('consensus');
  ['今天我们去看海','今天我们看海','今天我们去看每'].forEach((text,row)=>{const g=new T.Group();[...text].forEach((char,i)=>{const tile=box(.87,.92,.10,row===2&&i===6?0xe7aa98:0xe5e9df,.10);tile.position.x=(i-3)*1.02;const w=word(char,'#173e48',.92,600);w.position.set(tile.position.x,0,.15);g.add(tile,w);});g.position.y=1.65-row*1.48;this.analogy.add(g);this.analogyRows.push(g);});this.analogy.position.z=.6;this.add(this.analogy);

  teaching.smithWaterman.reads.forEach((r,i)=>{const g=sequence(r.sequence,.56,.67);g.position.set(-3.2,2.05-i*1.12,.4);this.readPlane.add(g);this.reads.push(g);});this.add(this.readPlane);
  const matrix=teaching.smithWaterman.matrix;matrix.forEach((row,ri)=>row.forEach((score,ci)=>{const p=box(.57,.57,.12,score===8?C.gold:score>0?0xc5ddda:0xe2eae5,.06);p.position.set(ci*.66, -ri*.66,0);this.matrixGroup.add(p);this.cells.push(p);const w=word(String(score),'#173e48',.5);w.position.set(p.position.x,p.position.y,.32);this.matrixGroup.add(w);}));
  this.matrixGroup.position.set(.5,2.02,-.3);this.add(this.matrixGroup);
  [...teaching.smithWaterman.reference].forEach((char,i)=>{const w=word(char,'#173e48',.55);w.position.set((i+1)*.66,.63,.04);this.matrixGroup.add(w);});
  [...teaching.smithWaterman.query].forEach((char,i)=>{const w=word(char,'#173e48',.55);w.position.set(-.64,-(i+1)*.66,.04);this.matrixGroup.add(w);});
  const path=ALIGNMENT_PATH_V6;for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];const edge=rod([a[1]*.66,-a[0]*.66,.18],[b[1]*.66,-b[0]*.66,.18],.027,C.coral);this.matrixGroup.add(edge);this.routes.push(edge);}
  this.spot=ring(.28,C.coral,.03);this.matrixGroup.add(this.spot);this.consensus.position.set(.1,-1.8,1.2);this.add(this.consensus);
  for(let i=0;i<24;i++){const b=ball(.075,i%4===3?C.coral:C.teal);this.votes.push(b);this.add(b);}
 }
 update(t:number){const groupCue=cue('n22',160),gapCue=cue('n24',160);const q=ease((t-groupCue+.9)/2.2);this.readPlane.position.y=lerp(-17,0,q);this.analogy.position.y=17*q;const gap=ease((t-gapCue)/2);this.reads[1].children.forEach((child,j)=>{if(j===3)child.scale.setScalar(.001+.999*gap);if(j>3)child.position.x=(j-2.5)*.67-(1-gap)*.67;});this.matrixGroup.position.y=lerp(17,2.02,ease((t-gapCue)/3.2));const voteStart=cue('n27',160),backStart=(MATRIX_EVENTS_V6[0]?.sceneStartSec??160+cue('n25',160))-160;const focus=ease((t-voteStart+1.7)/3.2);this.matrixGroup.position.z=lerp(-.3,-1.2,focus);this.matrixGroup.rotation.y=lerp(0,-.2,focus);const p=ALIGNMENT_PATH_V6,steps=p.length-1;const forward=clamp((t-cue('n24',160))/Math.max(1,backStart-cue('n24',160)))*steps;const step=t<backStart?forward:steps-eventActionProgressV6(MATRIX_EVENTS_V6[0],t+160)*steps;const i=Math.min(steps-1,Math.floor(step)),f=step-i;const a=p[i],b=p[i+1];this.spot.position.set(lerp(a[1],b[1],f)*.66,-lerp(a[0],b[0],f)*.66,.24);this.cells.forEach((cell,j)=>{const ri=Math.floor(j/7),ci=j%7,score=teaching.smithWaterman.matrix[ri][ci];const computed=ease((forward/steps*12-ri-ci)*1.8);const material=cell.material as T.MeshStandardMaterial;material.color.set(0xe5e9e2).lerp(new T.Color(score===8?C.gold:score>0?0x8bc6bd:0xe5e9e2),computed);cell.position.z=score/8*.13*computed;});this.routes.forEach((r,j)=>{r.scale.setScalar(.002+.998*ease((forward-j)*1.5));});this.consensus.position.y=lerp(-7,-1.95,ease((t-voteStart+1.7)/3.2));this.reads.forEach((r,i)=>{r.position.x=-3.2+.04*Math.sin(t*.4+i);});this.votes.forEach((b,i)=>{const col=i%6,row=Math.floor(i/6);const u=clamp((t-voteStart-col*.28-row*.17)/4);b.position.set(lerp(-3.2+(col-2.5)*.67,(col-2.5)*.95,u),lerp(2.05-row*1.12,this.consensus.position.y,u),lerp(.7,1.2,u));b.scale.setScalar(.15+.85*Math.sin(u*Math.PI));});}
}

export class ModelStudio extends Station {
 private dna=sequence('ATGCATGC',.56,.68);private tokens:T.Group[]=[];private networkLayers:T.Group[]=[];private orbit:T.Mesh[]=[];private candidates:T.Group[]=[];private track:T.CatmullRomCurve3;private synapses:T.Mesh[]=[];
 constructor(){super('model');this.dna.position.set(-2.75,2.5,0);this.add(this.dna);
  ['ATG','CAT','GC'].forEach((s,i)=>{const tok=new T.Group();const b=box(1.34,.69,.25,[C.teal,C.gold,C.violet][i]);tok.add(b);const txt=word(s,'#ffffff',.61);txt.position.z=.2;tok.add(txt);tok.position.set(-4.3+i*1.75,1.22,.1);this.tokens.push(tok);this.add(tok);});
  for(let z=0;z<4;z++){const layer=new T.Group();for(let y=0;y<4;y++)for(let x=0;x<4;x++){const bead=ball(.12,(x+y+z)%3?C.teal:C.gold);bead.position.set((x-1.5)*.51,(y-1.5)*.5,0);layer.add(bead);}layer.position.set(-.2+z*.62,-.45,-z*.55);layer.rotation.y=0;this.networkLayers.push(layer);this.add(layer);}
  for(let z=0;z<3;z++)for(let i=0;i<8;i++){const a=this.networkLayers[z],b=this.networkLayers[z+1],ai=(i*7)%16,bi=(i*5+3)%16;const pa=a.children[ai].position.clone().add(a.position),pb=b.children[bi].position.clone().add(b.position);const edge=line([pa.toArray(),pa.clone().lerp(pb,.5).add(new T.Vector3(0,.09,.08)).toArray(),pb.toArray()],0x70aaa5,.014,.30);edge.userData={layer:z};this.synapses.push(edge);this.add(edge);}
  const sh=glass(3.25,3.15,2.8,.07);sh.position.set(.8,-.45,-.6);this.add(sh);
  ['ATGCAT','GCTAGC','AAAAAA'].forEach((s,i)=>{const row=sequence(s,.4,.46);row.position.set(3.95,1.7-i*1.32,.3);this.add(row);this.candidates.push(row);});
  this.track=new T.CatmullRomCurve3([new T.Vector3(-3,-1.8,0),new T.Vector3(.5,-2.25,1),new T.Vector3(4.6,-1.9,0),new T.Vector3(5,2.4,-1),new T.Vector3(.4,3.4,-2),new T.Vector3(-4,2.4,-1)],true,'catmullrom',.5);
  const tube=new T.Mesh(new T.TubeGeometry(this.track,110,.018,6,true),mat(0xc0d1cb));this.add(tube);
  for(let i=0;i<12;i++){const p=ball(.06,i%2?C.gold:C.teal);this.orbit.push(p);this.add(p);}
 }
 update(t:number){this.synapses.forEach((edge,i)=>{const m=edge.material as T.MeshStandardMaterial;const signal=.5+.5*Math.sin(t*1.5-edge.userData.layer*.8-i*.19);m.opacity=.12+.43*signal;m.emissive.set(C.teal);m.emissiveIntensity=signal*.18;});this.networkLayers.forEach((l,i)=>{l.rotation.y=0;});this.tokens.forEach((tok,i)=>{tok.position.y=1.22+.1*Math.sin(t*.55+i);});this.orbit.forEach((p,i)=>p.position.copy(this.track.getPoint((t*.032+i/12)%1)));const reject=ease((t-cue('n33',216))/4);this.candidates[2].position.set(3.95+3.2*reject,1.7-2*1.32+16*reject*reject,.3);}
}

export class CodaTable extends Station {constructor(){super('coda');}update(_t:number){}}

export const makeStations=()=>[new MemoryArchiveV6(),new EncodeLine(),new ConstraintStation(),new FountainGraph(),new SequencingFlow(),new ConsensusLab(),new ModelStudio(),new MemoryArchiveV6(true),new CodaTable()];


