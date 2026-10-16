import * as T from 'three';
import {C,box,mesh,mat,line,ring,sphere,key,pedestal} from './Primitives';
import {phase,ease,clamp,cue} from './Timeline';
import evidence from '../research/toy-dh-calculation.json';

function label(parent:T.Object3D,value:string,pos:number[],width:number,color=C.ink){
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d')!;
  ctx.font='600 160px "Microsoft YaHei", Arial, sans-serif';canvas.width=Math.ceil(ctx.measureText(value).width+40);canvas.height=224;
  ctx.font='600 160px "Microsoft YaHei", Arial, sans-serif';ctx.fillStyle=color;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(value,canvas.width/2,116);
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  const o=mesh(new T.PlaneGeometry(width,width*224/canvas.width),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,toneMapped:false}),parent,pos);o.castShadow=false;return o;
}

/** Active interception in the saved tiny teaching group, not a real-system attack. */
export function buildAttackRig(g:T.Group):(t:number)=>void{
  const rig=new T.Group();rig.name='active-interception-rig';g.add(rig);
  pedestal(rig,0,4.9);
  const endpointGroups:T.Group[]=[];
  for(let side=0;side<2;side++){
    const end=new T.Group();end.name=side?'website-endpoint':'viewer-endpoint';end.position.x=side?3.7:-3.7;rig.add(end);endpointGroups.push(end);
    box(end,1.60,2.25,.56,'#e5e7d8',[0,-.22,0],.17);
    box(end,1.37,2.01,.055,'#f7f1df',[0,-.22,.30],.11);
    box(end,1.38,.23,.07,side?C.blue:C.teal,[0,.64,.33],.05);
    const port=ring(end,.40,side?C.blue:C.teal,[0,-.45,.37],.075);port.name='local-channel-port';
    for(let i=0;i<3;i++)box(end,.075,.15,.06,'#b4c4b9',[(i-1)*.20,-.99,.35],.014);
    label(end,side?'网站':'你',[0,1.52,.12],side?1.37:.65);
  }

  const center=new T.Group();center.name='interceptor-optical-vault';rig.add(center);
  box(center,2.0,1.45,.76,'#b99573',[0,-.42,-.23],.17);
  box(center,1.84,1.26,.10,'#d9c9aa',[0,-.42,.20],.11);
  box(center,1.42,.53,.07,'#526c68',[0,-.42,.28],.07);
  const lensFrame=ring(center,.62,C.gold,[0,.61,-.10],.105);
  const lens=mesh(new T.CylinderGeometry(.54,.54,.055,64),new T.MeshPhysicalMaterial({color:'#a9c9bd',metalness:.06,roughness:.10,transparent:true,opacity:.27,depthWrite:false,side:T.DoubleSide}),center,[0,.61,-.095]);lens.rotation.x=Math.PI/2;
  for(const x of [-.68,.68])box(center,.105,.50,.13,'#a4aaa0',[x,.11,-.10],.028);
  label(center,'中间人',[0,1.63,.11],2.03,C.rose);
  const leftRail=line(rig,[[-3.65,-1.22,.46],[-1.80,-1.18,.55],[0,-1.08,.60]],C.metal,.046);
  const rightRail=line(rig,[[0,-1.08,.60],[1.80,-1.18,.55],[3.65,-1.22,.46]],C.metal,.046);

  const token=(value:number,color:string,name:string)=>{
    const p=new T.Group();p.name=name;rig.add(p);
    box(p,1.10,.89,.17,color,[0,0,0],.10);
    box(p,.94,.74,.025,'#fff3d9',[0,0,.105],.07);
    label(p,String(value),[0,0,.128],String(value).length===1?.43:.69,C.ink);
    return p;
  };
  const originalA=token(evidence.public.A,C.teal,'actual-public-8');
  const originalB=token(evidence.public.B,C.blue,'actual-public-19');
  const fakeA=token(evidence.activeInterceptionExample.replaceATowardBobWith,C.blue,'substituted-public-17-toward-website');
  const fakeB=token(evidence.activeInterceptionExample.replaceBTowardAliceWith,C.teal,'substituted-public-21-toward-viewer');
  const pairs=[key(rig,C.teal),key(rig,C.teal),key(rig,C.blue),key(rig,C.blue)];
  pairs.forEach((p,i)=>{p.name=['viewer-secret','interceptor-viewer-secret','interceptor-website-secret','website-secret'][i];p.scale.setScalar(.72);});
  const pairX=[-3.70,-.92,.92,3.70];
  const leftMatch=line(rig,[[-3.70,1.11,-.12],[-2.35,1.32,-.18],[-.92,1.11,-.12]],C.teal,.026);
  const rightMatch=line(rig,[[.92,1.11,-.12],[2.35,1.32,-.18],[3.70,1.11,-.12]],C.blue,.026);
  // A physical front flap hides the paper before it reaches the interceptor.
  const message=new T.Group();message.name='single-order-anchor';rig.add(message);
  const messageBody=box(message,1.62,.95,.28,C.teal,[0,0,0],.09);
  box(message,1.43,.77,.035,'#fff2d9',[0,0,.165],.04);
  label(message,'订单',[0,0,.195],1.05,C.ink);
  const flap=new T.Group();flap.name='order-lid-pivot';flap.position.set(0,.46,.20);message.add(flap);
  const lid=box(flap,1.62,.92,.08,C.teal,[0,-.46,0],.08);
  line(flap,[[-.64,-.22,.055],[0,-.61,.055],[.64,-.22,.055]],'#e7e8d1',.024);
  const clasp=ring(flap,.12,C.gold,[0,-.66,.07],.035);
  const scan=line(message,[[-.57,-.21,.23],[-.57,.20,.23]],C.gold,.020);scan.name='interceptor-reading-cursor';
  const readLabel=label(rig,'打开 · 读完 · 重锁',[0,-1.91,.85],3.9,C.ink);
  const lerp=(a:number,b:number,u:number)=>a+(b-a)*ease(clamp(u));
  const color=(o:T.Mesh,c:string)=>{(o.material as T.MeshPhysicalMaterial).color.set(c);};

  return(t:number)=>{
    const p=phase('c24',t),q=phase('c25',t),r=phase('c26',t);
    const stageIn=ease((p-.02)/.23);center.position.set(lerp(9.4,0,stageIn),0,-.12);
    const arrive=ease((p-.24)/.26),replace=ease((p-.55)/.34),retire=ease(q/.21);
    // 8 travels right, 19 travels left. They enter the opaque central vault
    // before the adversary's 17 and 21 emerge toward the intended recipients.
    originalA.position.set(lerp(-3.70,-.16,arrive),lerp(.18,-.42,ease((arrive-.65)/.35)),lerp(.62,-.43,ease((arrive-.76)/.24)));
    originalB.position.set(lerp(3.70,.16,arrive),lerp(-.65,-.42,ease((arrive-.65)/.35)),lerp(.62,-.43,ease((arrive-.76)/.24)));
    fakeA.position.set(lerp(.15,3.70,replace)+center.position.x*(1-replace),lerp(-.42,.18,replace),lerp(-.43,.62,ease(replace/.35)));
    fakeB.position.set(lerp(-.15,-3.70,replace)+center.position.x*(1-replace),lerp(-.42,-.65,replace),lerp(-.43,.62,ease(replace/.35)));
    // Receiver-side values sink behind their own terminal, rather than vanish.
    fakeA.position.z=lerp(fakeA.position.z,-.43,retire);fakeB.position.z=lerp(fakeB.position.z,-.43,retire);
    fakeA.position.y=lerp(fakeA.position.y,-.45,retire);fakeB.position.y=lerp(fakeB.position.y,-.45,retire);
    const split=ease(q/.30),leftReady=ease(q/.29),rightReady=ease((q-.35)/.29);
    (leftRail.material as T.MeshPhysicalMaterial).color.set(C.metal).lerp(new T.Color(C.teal),split);
    (rightRail.material as T.MeshPhysicalMaterial).color.set(C.metal).lerp(new T.Color(C.blue),split);
    for(let i=0;i<4;i++){
      const ready=i<2?leftReady:rightReady;
      const use=i===1?Math.sin(Math.PI*ease((r-.25)/.17))*(1-ease((r-.43)/.13)):i===2?Math.sin(Math.PI*ease((r-.57)/.17))*(1-ease((r-.75)/.1)):0;
      pairs[i].position.set(pairX[i]+((i===1||i===2)?center.position.x*(1-ready):0),lerp(-.72,1.04,ready)-.70*use,lerp(-.50,.54,ready));
      pairs[i].rotation.z=-.34*use;
    }
    // Connecting lines lift from behind the terminal lids along with their pair.
    leftMatch.position.z=lerp(-.7,.15,leftReady);rightMatch.position.z=lerp(-.7,.15,rightReady);
    leftMatch.geometry.setDrawRange(0,Math.floor((leftMatch.geometry.index!.count*leftReady)/3)*3);
    rightMatch.geometry.setDrawRange(0,Math.floor((rightMatch.geometry.index!.count*rightReady)/3)*3);
    let mx=-3.70,my=-.43,mz=-.55;
    if(t>=cue('c26').startSec){
      const inbound=ease(r/.27),outbound=ease((r-.75)/.25);
      mx=lerp(-3.70,0,inbound);mx=lerp(mx,3.70,outbound);
      my=lerp(-.43,-.43,inbound);mz=lerp(-.55,.90,ease(r/.12));
      mz=lerp(mz,-.55,ease((r-.93)/.07));
    }
    message.position.set(mx,my,mz);
    const open=ease((r-.28)/.12)*(1-ease((r-.60)/.14));
    flap.rotation.x=2.30*open;
    const recolor=ease((r-.63)/.11);
    (messageBody.material as T.MeshPhysicalMaterial).color.set(C.teal).lerp(new T.Color(C.blue),recolor);
    (lid.material as T.MeshPhysicalMaterial).color.set(C.teal).lerp(new T.Color(C.blue),recolor);
    scan.position.x=1.13*ease((r-.40)/.18);scan.scale.y=.001+.999*open;
    // A readable explanatory label enters from below only while the box is open.
    const labelIn=ease(r/.18);readLabel.position.y=lerp(-5.0,-1.91,labelIn);
    lensFrame.rotation.z=0;clasp.rotation.z=0;
  };
}
