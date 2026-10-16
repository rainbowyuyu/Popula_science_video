import * as T from 'three';
import {box,ring,sphere,line,text,mat,key} from './Primitives';
import {group,phase,cue,clamp,ease} from './Timeline';
const cream='#fff0ce',coral='#f46d50',navy='#111f42';
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
function envelope(){const g=new T.Group();box(g,2.8,1.85,.10,cream,[0,0,0],.04);const shape=new T.Shape();shape.moveTo(-1.4,.9);shape.lineTo(0,-.12);shape.lineTo(1.4,.9);shape.closePath();const flap=new T.Mesh(new T.ShapeGeometry(shape),mat('#e3caa7',.06,.5));flap.position.z=.07;g.add(flap);line(g,[[-1.4,-.88],[0,.1],[1.4,-.88]].map(p=>[p[0],p[1],.08]),'#c3a579',.008);const seal=box(g,.48,.48,.09,coral,[0,-.12,.12],.13);seal.rotation.z=.78;return g;}
export class Courier{
 root=new T.Group();letter=new T.Group();sheet=new T.Group();eye=new T.Group();leftKey:T.Group;rightKey:T.Group;trail:T.Line;paperText:T.Mesh;wrongText:T.Mesh;
 constructor(){
  this.root.name='the-same-letter';this.letter.add(envelope());this.root.add(this.letter);this.letter.add(this.sheet);
  box(this.sheet,2.48,1.65,.035,'#fff4da',[0,.25,.08],.02);this.paperText=text(this.sheet,'今晚八点，老地方',[0,.35,.12],2.22,navy,.25);this.wrongText=text(this.sheet,'今晚九点，老地方',[0,.35,.125],2.22,coral,.25);
  const eyeWhite=sphere(this.eye,.74,'#122345');eyeWhite.scale.set(1.35,.62,.65);const lens=ring(this.eye,.31,coral,[0,0,.51],.07);sphere(this.eye,.17,'#050b19',[0,0,.54]);ring(this.eye,.07,'#ffe6ac',[0,0,.68],.015);box(this.eye,2.2,.09,.13,'#253f68',[0,.45,0],.035);for(const x of[-.96,.96]){const r=ring(this.eye,.28,'#9aafbc',[x,.45,0],.025);r.rotation.x=Math.PI/2;}this.root.add(this.eye);
  this.leftKey=key(this.root,'#f0b94d');this.rightKey=key(this.root,'#f46d50');
  const geo=new T.BufferGeometry().setFromPoints(Array.from({length:90},()=>new T.Vector3()));this.trail=new T.Line(geo,new T.LineBasicMaterial({color:'#eec780',transparent:true,opacity:.5}));this.root.add(this.trail);
 }
 position(t:number){const o=group('opening'),s=group('secret'),e=group('ending'),p=new T.Vector3(-5,3.8,0);
  if(t<o.end){const q=clamp(t/o.end);const u=ease((q-.48)/.52);p.set(-5+5*u,3.8+18*u,-30*u);}
  else if(t<s.start+3){const q=ease((t-o.end)/(s.start+3-o.end));p.set(0,mix(21.8,7,q),mix(-30,-59,q));}
  else if(t<cue('s29').startSec+2.6){p.set(0,7,-59);}
  else {const q=clamp((t-(cue('s29').startSec+2.6))/(e.start-(cue('s29').startSec+2.6)));const curve=new T.CatmullRomCurve3([new T.Vector3(8,7,-102),new T.Vector3(4,23,-67),new T.Vector3(5,24,-25),new T.Vector3(7,8.3,-8.7)]);p.copy(curve.getPoint(ease(q)));}
  return p;
 }
 update(t:number){const o=group('opening'),s=group('secret'),e=group('ending');const p=this.position(t);this.letter.position.copy(p);this.letter.rotation.set(.06*Math.sin(t*.8),-.16+.16*Math.sin(t*.5),.06*Math.sin(t*.9));
  this.letter.scale.setScalar(t<o.end?.8:1.1);
  const parked=t>s.start+3&&t<cue('s29').startSec+2.6;this.letter.visible=!parked;
  const open=t<o.end?1-ease((t-o.end*.55)/4):t>=e.start?ease((t-(e.start+(e.end-e.start)*.4))/2):0;
  this.sheet.position.y=open*.75;this.paperText.visible=!(t>cue('s01').startSec+(cue('s01').endSec-cue('s01').startSec)*.78&&t<cue('s02').startSec);this.wrongText.visible=!this.paperText.visible;
  const eyeExit=ease((t-o.end*.65)/2),eyeReturn=ease((t-(e.end-10))/3),farExit=ease((t-o.end)/4),farReturn=ease((t-(e.end-18))/6);this.eye.position.set(p.x+2.7+Math.sin(t*.6)*.22+30*eyeExit*(1-eyeReturn)+120*farExit*(1-farReturn),p.y+.5,p.z-.9);this.eye.lookAt(p);this.eye.visible=true;
  this.leftKey.visible=t>=s.start&&t<s.start+9;this.rightKey.visible=this.leftKey.visible;
  const k=ease((t-s.start)/5);this.leftKey.position.copy(p).add(new T.Vector3(-1+3*k,-1.5,1));this.rightKey.position.copy(p).add(new T.Vector3(3*k,-1.5,.6));this.leftKey.rotation.z=-.2;this.rightKey.rotation.z=.2;
  const a=this.trail.geometry.getAttribute('position') as T.BufferAttribute;for(let i=0;i<a.count;i++){const v=this.position(Math.max(0,t-i*.075));a.setXYZ(i,v.x,v.y,v.z);}a.needsUpdate=true;this.trail.visible=!parked;
 }
 dispose(){this.root.removeFromParent();}
}

