import * as T from'three';import beats from './beats.json';import{box,ring,sphere,line,text,key,padlock,mat}from'./Primitives';import{cue,phase,clamp,ease,group}from'./Timeline';
const ivory='#fff0cf',gold='#d7ac68',blue='#456de7',coral='#ed7259',mint='#8bd2b6',ink='#0b1635';
function card(parent:T.Object3D,value:string,color:string,w=1.6){const g=new T.Group();box(g,w,1.35,.17,color,[0,0,0],.14);text(g,value,[0,0,.11],w*.75,ivory,.9);parent.add(g);return g;}
function gear(parent:T.Object3D,r:number,color:string){const g=new T.Group();ring(g,r,color,[0,0,0],.16);ring(g,r-.35,color,[0,0,0],.06);for(let i=0;i<24;i++){const a=i*Math.PI/12;const b=box(g,.20,.35,.25,color,[Math.cos(a)*(r+.06),Math.sin(a)*(r+.06),0],.03);b.rotation.z=a-Math.PI/2;}for(let i=0;i<6;i++){const a=i*Math.PI/3;const b=box(g,r*.76,.08,.15,color,[Math.cos(a)*r*.5,Math.sin(a)*r*.5,0],.03);b.rotation.z=a;}parent.add(g);return g;}
export class ExchangeRoom{
 root=new T.Group();rotors:T.Group[]=[];privates:T.Group[]=[];covers:T.Mesh[]=[];pubs:T.Group[]=[];answers:T.Group[]=[];locals:T.Group[]=[];intruder=new T.Group();leftCopy:T.Group;rightCopy:T.Group;privateLabels:T.Mesh[]=[];badCards:T.Group[]=[];label:T.Mesh;publicLabel:T.Mesh;secretTokens:T.Group[]=[];secretAnswers:T.Group[]=[];middleKeys:T.Group[]=[];attackLetter=new T.Group();attackText:T.Mesh;attackShell:T.Mesh;progressDots:T.InstancedMesh;dummy=new T.Object3D();
 constructor(){
 this.root.name='exchange-kinetic-vault';
 box(this.root,4.3,4.6,.3,'#101b36',[0,0,-1.8],.5);ring(this.root,2.05,gold,[0,0,-1.57],.06);
 // A connected, floating mechanical span, not a lineup of exhibits.
 for(const x of[-5,5]){
 const side=x<0?blue:coral;box(this.root,3.3,6.5,1.4,'#14264a',[x,0,-1.1],.3);box(this.root,3.55,.16,1.7,gold,[x,-3.1,-1],.05);box(this.root,3.55,.16,1.7,gold,[x,3.1,-1],.05);
 for(const sx of[-1.55,1.55])box(this.root,.06,5.8,.18,gold,[x+sx,0,-.28],.02);
 const r=gear(this.root,1.3,gold);r.position.set(x,1,.05);this.rotors.push(r);
 const p=card(this.root,x<0?'6':'15',side,1.7);p.position.set(x,1,.25);this.privates.push(p);
 const cover=box(this.root,2.8,2.9,.22,'#21385c',[x,1,.50],.22);this.covers.push(cover);
 const lock=padlock(this.root,side);lock.g.scale.setScalar(.72);lock.g.position.set(x,1,.72);this.locals.push(lock.g);
 const result=card(this.root,'2',gold,1.7);result.position.set(x,-1.75,.05);this.answers.push(result);
 const l=text(this.root,x<0?'你':'朋友',[x+(x<0?-1.9:1.9),1.5,.2],2.1,ivory,.7);this.privateLabels.push(l);
 for(let k=0;k<6;k++)box(this.root,.22,.3,.15,side,[x-1.12+k*.45,-2.85,.12],.03);
 }
 line(this.root,[[-5,2,0],[-4,3.5,0],[0,3.9,-.1],[4,3.5,0],[5,2,0]],gold,.06);
 line(this.root,[[-5,-2,0],[-4,-3.7,0],[0,-4.1,.3],[4,-3.7,0],[5,-2,0]],'#4a73b7',.06);
 const publicCore=gear(this.root,1.65,gold);publicCore.position.set(0,0,-1);this.rotors.push(publicCore);this.label=text(this.root,'5 · 23',[0,0,-.65],2.7,ivory,.9);this.publicLabel=text(this.root,'公开',[0,0,-.64],2.7,ivory,.8);
 for(let i=0;i<2;i++){const tok=new T.Group();sphere(tok,.48,i===0?blue:coral);ring(tok,.68,gold,[0,0,0],.045);this.root.add(tok);this.secretTokens.push(tok);const k=key(this.root,gold);k.scale.setScalar(1.6);this.secretAnswers.push(k);}
 this.pubs=[card(this.root,'8',blue),card(this.root,'19',coral)];
 const hub=box(this.intruder,2.9,2.4,1.25,'#9e3e45',[0,0,0],.24);for(let i=0;i<3;i++)box(this.intruder,2.3,.12,.18,gold,[0,-.6+i*.6,.72],.03);
 const eye=ring(this.intruder,.45,coral,[0,1.45,0],.08);sphere(this.intruder,.18,ink,[0,1.45,.1]);text(this.intruder,'信使',[0,2.25,.25],2,coral,.65);
 this.root.add(this.intruder);this.leftCopy=key(this.root,mint);this.rightCopy=key(this.root,'#b59be7');
 this.middleKeys=[key(this.root,mint),key(this.root,'#b59be7')];
 box(this.attackLetter,2.6,1.2,.15,ivory);this.attackText=text(this.attackLetter,'今晚八点',[0,0,.13],2.25,ink,.48);this.attackShell=box(this.attackLetter,2.64,1.24,.17,blue,[0,0,.25],.12);ring(this.attackLetter,.18,gold,[0,0,.38],.05);this.root.add(this.attackLetter);
 this.badCards=[card(this.root,'21',mint),card(this.root,'17','#9274c4')];
 const geo=new T.SphereGeometry(.06,10,8);this.progressDots=new T.InstancedMesh(geo,new T.MeshBasicMaterial({color:'#ecd19a'}),70);this.root.add(this.progressDots);
 }
 update(t:number){const s=group('secret'),x=group('exchange'),at=group('intruder');const e=clamp((t-x.start)/(x.end-x.start));
 const secret=t<x.start;const attack=ease((t-at.start)/2.6);const reveal=ease((t-cue('s09').startSec)/2);
 const named=ease((t-cue('s08').startSec)/.7);this.label.scale.y=named;this.publicLabel.scale.y=1-named;
 for(let i=0;i<2;i++){const sign=i===0?-1:1,q=phase('s06',t),swap=ease((q-.25)/.7),leave=ease((t-cue('s08').startSec)/1.3);const tok=this.secretTokens[i];tok.position.set(sign*5*(1-2*swap),Math.sin(swap*Math.PI)*(i===0?2:-1),mix(-1.5,1.7,ease(q*4))-4*leave);tok.rotation.set(t*.2,t*.4,t*.15);const k=this.secretAnswers[i],appear=ease((t-cue('s07').startSec)/1.6);k.position.set(sign*5,-1.75,mix(-2,.4,appear)-5*leave);k.visible=appear>0&&leave<.6;tok.visible=t>=cue('s06').startSec&&leave<.8;}
 const bi=beats.reduce((last,b,i)=>b<=t?i:last,-1),bt=bi>=0?beats[Math.floor(bi/4)*4]:-9,dt=t-bt,pulse=dt>=0&&dt<.45?Math.sin(dt/.45*Math.PI)*Math.exp(-dt*4):0;this.rotors.forEach((r,i)=>r.rotation.z=t*(i%2?-.10:.12)+.025*pulse);
 for(let i=0;i<2;i++){
  const side=i===0?-1:1;this.covers[i].position.y=1-8.8*reveal;this.locals[i].position.y=1-8.8*reveal;
  this.privates[i].position.set(side*5,1,.25-3*attack);this.privateLabels[i].position.y=1.5;
  const ans=ease((t-cue('s10').startSec-(i===0?0:4))/1.5);this.answers[i].position.set(side*5,-1.75,mix(-1.45,.2,ans)-3*attack);this.answers[i].scale.setScalar(.85+.15*ans);
 }
 const showPub=ease((t-cue('s09').startSec)/1.3),swap=ease((phase('s09',t)-.66)/.31);const consume=ease((t-cue('s10').startSec)/2);
 for(let i=0;i<2;i++){
  const dir=i===0?1:-1;this.pubs[i].position.set(mix(-5*dir,5*dir,swap),-1.2+Math.sin(swap*Math.PI)*(i===0?2.5:-1.5),mix(-1.4,1.5,showPub)*(1-consume)-1.4*consume);
  this.pubs[i].rotation.z=Math.sin(swap*Math.PI)*dir*.25;
 }
 this.intruder.position.set(0,-12*(1-attack),2.6);this.intruder.rotation.y=.08*Math.sin(t*.4);
 [this.leftCopy,this.rightCopy].forEach((k,i)=>k.traverse(o=>{if(o instanceof T.Mesh&&(o.material as T.MeshPhysicalMaterial).isMeshPhysicalMaterial)(o.material as T.MeshPhysicalMaterial).color.set(t<cue('s06').startSec?gold:i===0?mint:'#b59be7');}));const kp=phase('s14',t);this.leftCopy.visible=this.rightCopy.visible=t<cue('s06').startSec?t>=s.start&&t<cue('s05').startSec+.55:t>=cue('s14').startSec;this.leftCopy.position.set(-3.7,1.6-10*(1-attack),1.9);this.rightCopy.position.set(3.7,1.6-10*(1-attack),1.9);this.leftCopy.scale.setScalar(1.3);this.rightCopy.scale.setScalar(1.3);
 const pairIn=ease((t-cue('s14').startSec)/1.2);this.leftCopy.position.y=this.rightCopy.position.y=1.6-12*(1-pairIn);
 if(t<cue('s06').startSec){const q=phase('s04',t),travel=ease((q-.1)/.55),out=ease((t-cue('s05').startSec)/1.2);this.leftCopy.position.set(-5+10*travel,-1,1.8-10*out);this.rightCopy.position.set(-5+6.5*travel,-.8,1.8-6*(1-ease((q-.4)/.2))-10*out);}
 this.middleKeys.forEach((k,i)=>{k.position.set(i===0?-1:1,1.7-12*(1-ease(kp*4)),3.5);k.scale.setScalar(.9);});
 const aq=phase('s15',t),started=ease((t-cue('s15').startSec)/.8);this.attackLetter.visible=started>0;this.attackLetter.position.set(mix(-5.2,5.2,ease(aq)),-1.7,3.7-8*(1-started));this.attackLetter.rotation.y=.08*Math.sin(t*.5);const reading=ease((aq-.28)/.12)*(1-ease((aq-.61)/.12));this.attackShell.position.y=2.3*reading;(this.attackShell.material as T.MeshPhysicalMaterial).color.set(aq>.65?'#9274c4':mint);
 const iq=phase('s13',t),release=ease((iq-.45)/.45);this.badCards[0].position.set(-1-4*release,.1-10*(1-attack),-2+4.7*release);this.badCards[1].position.set(1+4*release,.1-10*(1-attack),-2+4.7*release);
 if(t>=cue('s13').startSec){this.pubs.forEach((p,i)=>{const enter=ease((t-cue('s13').startSec)/1.2),q=ease((iq-.12)/.33);p.position.set((i===0?-5:5)*(1-q),mix(-1.2,.1,enter),mix(-1.4,1.6,enter)-5*ease((iq-.3)/.2));p.rotation.z=0;});}
 // Secret stages communicate hidden local ingredients by doors that physically
 // slide over the pockets; in later views these doors remain above the work area.
 for(let i=0;i<70;i++){const q=(i/70+t*.035)%1;const a=q*Math.PI*2;this.dummy.position.set(5.1*Math.cos(a),3.8*Math.sin(a),-.15);this.dummy.updateMatrix();this.progressDots.setMatrixAt(i,this.dummy.matrix);}this.progressDots.instanceMatrix.needsUpdate=true;
 }
 dispose(){this.root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.dispose());}});this.root.removeFromParent();}
}
function mix(a:number,b:number,t:number){return a+(b-a)*t;}
