import * as T from 'three';
import {C,mat,mesh,box,sphere,line,ring,text,key,pedestal} from './Primitives';import {phase,ease,cue,clamp,after} from './Timeline';import evidence from './crypto-evidence.json';
export function buildCipherRig(g:T.Group):(t:number)=>void{
 const gates:T.Group[]=[];
 for(const x of [-3.4,3.4]){pedestal(g,x,2);const gate=new T.Group();gate.position.x=x;g.add(gate);gates.push(gate);const rim=ring(gate,1.4,C.teal,[0,.25,0],.12);rim.rotation.y=Math.PI/2;const rim2=ring(gate,1.4,C.gold,[.48,.25,0],.03);rim2.rotation.y=Math.PI/2;box(gate,.75,.35,2.3,'#bacbc1',[.2,-1.36,0]);for(let i=0;i<9;i++){const a=i/9*Math.PI*2;sphere(gate,.06,C.gold,[.2,.25+1.4*Math.cos(a),1.4*Math.sin(a)]);}text(g,x<0?'加密':'核验 · 解密',[x,2.2,.5],x<0?2:3.1,C.ink,.8);}
 line(g,[[-6,.1,.4],[-2,.1,.4],[2,.1,.4],[6,.1,.4]],C.metal,.035);line(g,[[3.4,.1,.4],[4.7,-1,1],[5.2,-4,1]],C.rose,.025);
 const keys=[key(g),key(g)];keys[0].position.set(-3.4,1.35,.1);keys[1].position.set(3.4,1.35,.1);
 const secret=[sphere(g,.23,C.gold,[-3.4,-6,.3]),sphere(g,.23,C.gold,[3.4,-6,.3])];
 const actual=evidence.ciphertextAndTagHex.slice(0,12).toUpperCase().match(/../g)!;
 function message(fail:boolean){const anchor=new T.Group();g.add(anchor);const plain=new T.Group(),cipher=new T.Group();anchor.add(plain,cipher);box(plain,2.75,1.25,.15,'#ede5cd');text(plain,evidence.plaintext,[0,0,.09],2.6,C.ink,.8);for(let i=0;i<6;i++){const tile=box(cipher,.75,.56,.17,C.teal,[(i%3-1)*.83,(i<3?.32:-.32),0],.07);text(tile,actual[i],[0,0,.11],.71,'#ffffff',.49);}const tag=box(cipher,.64,1.2,.2,C.teal,[1.8,0,0],.08);const yes=text(tag,'✓',[0,0,.13],.58,'#fffaf0',.8),no=text(tag,'×',[0,0,.14],.58,'#fffaf0',.8);return{anchor,plain,cipher,tag,yes,no,fail};}
 const regular=message(false),tamper=message(true),testGood=message(false),testBad=message(true);
 const changed=box(g,.75,.56,.17,C.rose,[-15,0,0]);text(changed,evidence.tamperedCiphertextAndTagHex.slice(0,2).toUpperCase(),[0,0,.11],.71,'#ffffff',.49);
 const status=text(g,'×',[5.2,-1.1,.8],1.4,C.rose,1.3);
 function setOpacity(o:T.Object3D,n:number){o.traverse(x=>{if(x instanceof T.Mesh){const m=x.material as T.Material;m.transparent=n<1||m instanceof T.MeshBasicMaterial;m.opacity=n;}});}
 function animateMessage(m:ReturnType<typeof message>,q:number){const travel=q;let x=q<.15?-14+10*ease(q/.15):q>.85?4+10*ease((q-.85)/.15):-4+8*ease((q-.15)/.7),y=q<.15?.25-8*(1-ease(q/.15)):q>.85?.25-8*ease((q-.85)/.15):.25;const between=x>-2.8&&x<2.7;
  if(m.fail&&x>2.7){const k=ease((x-2.7)/7);x=2.7+3*k;y=.25-7*k;}
  m.anchor.position.set(x,y,1);m.anchor.rotation.y=.035*Math.sin(q*Math.PI*2);const encrypt=ease((x+3.6)/.85);const decrypt=m.fail?0:ease((x-2.75)/.85);const enc=encrypt*(1-decrypt);
  setOpacity(m.plain,1-enc);setOpacity(m.cipher,enc);const bad=m.fail&&travel>.73;const damaged=m.fail&&travel>.5;const checked=travel>.73;(m.tag.material as T.MeshPhysicalMaterial).color.set(bad?C.rose:checked?C.teal:C.muted);(m.yes.material as T.MeshBasicMaterial).opacity=checked&&!bad?enc:0;(m.no.material as T.MeshBasicMaterial).opacity=bad?enc:0;
  return {x,y,bad,damaged};
 }
 return(t:number)=>{const p=phase('c32',t);keys.forEach((k,i)=>{const q=ease((p-.2)/.6);k.position.y=-5+6.35*q;k.rotation.z=.06*Math.sin(t*.3);secret[i].position.y=-5+6*ease(p*2)-6*ease((p-.4)*2);});
  animateMessage(regular,phase('c33',t));const tr=animateMessage(tamper,phase('c34',t));const test=phase('c35',t);animateMessage(testGood,clamp(test/.48));const bad=animateMessage(testBad,clamp((test-.5)/.5));const active=t>=cue('c35').startSec?bad:tr;changed.position.set(active.x-.83,active.y+.32,1.13);const changeVisible=active.damaged&&active.y>-6;changed.scale.setScalar(changeVisible?1:.001);status.position.y=active.bad?active.y-1:-10;
 };
}
