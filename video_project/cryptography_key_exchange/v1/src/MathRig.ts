import * as T from 'three';
import evidence from './math-evidence.json';
import {cue, phase, ease, clamp} from './Timeline';
import {C, box, sphere, ring, line, key, pedestal, mat, mesh} from './Primitives';

type Step = {step:number; remainder:number};
type Label = {object:T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>; set:(s:string,color?:string)=>void; opacity:(n:number)=>void};

/** A canvas is redrawn only when its displayed value changes, not every frame. */
function label(parent:T.Object3D, value:string, p:[number,number,number], w:number,h=.9,color:string=C.ink):Label {
  const canvas=document.createElement('canvas');canvas.width=Math.min(2048,Math.max(256,Math.round(512*w/h)));canvas.height=Math.round(canvas.width*h/w);
  const ctx=canvas.getContext('2d')!;
  const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  const object=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,toneMapped:false}));
  object.position.set(...p);object.castShadow=false;parent.add(object);
  let last='',lastColor='';
  const set=(s:string,col:string=color)=>{if(s===last&&col===lastColor)return;last=s;lastColor=col;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle=col;ctx.textAlign='center';ctx.textBaseline='middle';let font=canvas.height*.68;ctx.font=`600 ${font}px "Microsoft YaHei", Arial, sans-serif`;const extent=ctx.measureText(s).width;if(extent>canvas.width*.95){font*=canvas.width*.95/extent;ctx.font=`600 ${font}px "Microsoft YaHei", Arial, sans-serif`;}ctx.fillText(s,canvas.width/2,canvas.height*.535);tex.needsUpdate=true;};
  set(value);return {object,set,opacity:n=>{object.material.opacity=clamp(n);}};
}
const sup=(v:number)=>String(v).split('').map(v=>'⁰¹²³⁴⁵⁶⁷⁸⁹'[Number(v)]).join('');
const angle=(v:number)=>v/23*Math.PI*2;
const window=(t:number,id:string)=>{const c=cue(id);return t>=c.startSec&&t<=c.endSec;};
const smoothWindow=(t:number,first:string,last=first)=>ease((t-cue(first).startSec)/.65)*(1-ease((t-cue(last).endSec)/.65));

/** Exact residues are read from the independently computed evidence file. */
export function residueState(steps:Step[],progress:number){
  const value=clamp(progress)*steps.length;
  const count=Math.min(steps.length,Math.floor(value));
  const previous=count===0?1:steps[count-1].remainder;
  const next=count>=steps.length?previous:steps[count].remainder;
  return {count,previous,next,blend:ease(clamp((value-count)/.72)),done:count===steps.length};
}

export function buildMathRig(g:T.Group):(t:number)=>void {
  g.name='math-evidence-rig';
  const publicLabel=label(g,'公开  5 · 23',[0,2.5,.28],4.2,.78);
  const wheels:T.Group[]=[],dots:T.Mesh[]=[],numbers:Label[]=[],equations:Label[]=[],privateLabels:Label[]=[],status:Label[]=[];
  const markerR=1.72;
  for(let side=0;side<2;side++){
    const x=side?3.3:-3.3,col=side?C.blue:C.teal;
    pedestal(g,x,2.3);
    const wheel=new T.Group();wheel.position.set(x,.2,0);g.add(wheel);wheels.push(wheel);
    const disc=mesh(new T.CircleGeometry(1.63,96),new T.MeshPhysicalMaterial({color:'#e3ece6',roughness:.3,metalness:.1,transparent:false,opacity:1,side:T.DoubleSide,depthWrite:true}),wheel,[0,0,-.16]);disc.castShadow=false;
    ring(wheel,markerR,col,[0,0,0],.065);ring(wheel,1.59,C.metal,[0,0,-.08],.018);
    for(let n=0;n<23;n++){
      const a=angle(n);const tick=box(wheel,.025,n%5===0?.18:.09,.025,C.muted,[Math.sin(a)*markerR,Math.cos(a)*markerR,.03],.005);tick.rotation.z=-a;
      if(n%5===0)label(wheel,String(n),[Math.sin(a)*1.29,Math.cos(a)*1.29,.08],.7,.62,C.muted);
    }
    dots.push(sphere(wheel,.135,C.gold,[0,markerR,.16]));
    numbers.push(label(wheel,'',[0,.08,.26],1.75,1.55,col));
    // Reserve a clear band below the world-level transport rail for both rows.
    equations.push(label(g,'',[x,-1.54,2.25],3.8,.65,col));
    const privateLabel=label(g,side?'网站':'你',[x,-2.17,2.3],3.6,.6,col);
    // These are anchored captions: the decorative plinth must not clip their glyphs.
    privateLabel.object.material.depthTest=false;privateLabel.object.renderOrder=20;
    privateLabels.push(privateLabel);
    status.push(label(wheel,'',[0,-.65,.24],2,.6,C.muted));
  }
  const upperPath=new T.CatmullRomCurve3([new T.Vector3(-3.3,.5,.6),new T.Vector3(-1.2,2.2,.9),new T.Vector3(1.3,2.2,.9),new T.Vector3(1.05,.65,1.4)]);
  const lowerPath=new T.CatmullRomCurve3([new T.Vector3(3.3,.5,.6),new T.Vector3(1.2,-.95,1.3),new T.Vector3(-1.3,-.95,1.3),new T.Vector3(-1.05,-.65,1.4)]);
  function capsule(value:number,color:string){
    const root=new T.Group();g.add(root);const body=box(root,1.12,.72,.22,color,[0,0,0],.15);body.castShadow=true;
    label(root,String(value),[0,.01,.14],.86,.65,'#fff8eb');return root;
  }
  const aPacket=capsule(evidence.public.A,C.teal),bPacket=capsule(evidence.public.B,C.blue);
  const modBeads=new T.Group();wheels[0].add(modBeads);
  const beads:T.Mesh[]=[];
  for(let i=0;i<25;i++)beads.push(sphere(modBeads,i>=23?.09:.055,i>=23?C.gold:C.teal,[0,-10,0]));
  const equality=label(g,'',[0,2.5,.45],7.4,.8);
  const candidate=label(g,'',[0,2.5,.45],6,.8,C.rose);
  const trialMarks=new T.Group();g.add(trialMarks);trialMarks.position.set(0,-9,.9);
  const trialBeads=evidence.bruteforce.map((entry,i)=>{
    const item=new T.Group();trialMarks.add(item);item.position.set((i-2.5)*.68,0,0);sphere(item,.12,i===5?C.teal:C.metal);return item;
  });
  const guessResult=label(g,'',[0,.23,1.1],2.65,1.1,C.rose);
  const grid=new T.Group();g.add(grid);grid.position.set(0,-12,-3.5);
  for(let row=0;row<7;row++)for(let col=0;col<21;col++){
    const dot=sphere(grid,.045,C.metal,[(col-10)*.6,(row-3)*.48,-.12*Math.sin(col*.8)]);dot.castShadow=false;
  }
  const modern=label(g,'',[0,2.5,.45],7,.8,C.teal);

  function setDot(i:number,from:number,to:number,mix:number){
    const a=angle(from),delta=T.MathUtils.euclideanModulo(angle(to)-a+Math.PI,Math.PI*2)-Math.PI,at=a+delta*mix;
    dots[i].position.set(Math.sin(at)*markerR,Math.cos(at)*markerR,.18);
  }
  function compute(i:number,base:number,steps:Step[],p:number){
    const state=residueState(steps,p);setDot(i,state.previous,state.next,state.blend);numbers[i].set(String(state.previous));
    equations[i].set(`${base}${sup(state.count)} mod 23`);status[i].set('余数');
    return state;
  }
  function transport(root:T.Group,path:T.CatmullRomCurve3,phaseId:string,consumeId:string,t:number){
    const p=phase(phaseId,t),use=phase(consumeId,t);const progress=ease((p-.63)/.3);
    const start=path.getPoint(0),end=path.getPoint(1),receiver=new T.Vector3(phaseId==='c12'?3.3:-3.3,.3,.4);root.position.copy(path.getPoint(progress));
    // Public values dock between the dials, so they never cover the sender's local result.
    const enter=ease((p-.56)/.07),approach=ease(use/.14),sink=ease((use-.14)/.08);
    root.position.y-=8*(1-enter);
    if(use>0){root.position.copy(end).lerp(receiver,approach);root.position.z-=1.5*sink;}
    if(t<cue(phaseId).startSec){root.position.copy(start);root.position.y-=8;}
    root.rotation.y=.08*Math.sin(progress*Math.PI);root.scale.setScalar(1);
  }
  return(t:number)=>{
    const p10=phase('c10',t),p11=phase('c11',t),pa=phase('c12',t),pb=phase('c13',t),qa=phase('c15',t),qb=phase('c16',t);
    const late=ease((t-cue('c19').startSec)/1.6);
    const introTop=smoothWindow(t,'c10','c11'),publicRecord=smoothWindow(t,'c14');
    publicLabel.opacity(Math.max(introTop,publicRecord));
    publicLabel.set(window(t,'c11')?'25 mod 23 = 2':window(t,'c14')?'公开：5 · 23 · 8 · 19':'公开  5 · 23');
    privateLabels[0].set(t>=cue('c12').startSec?'你  ·  私数 6':'你');
    privateLabels[1].set(t>=cue('c13').startSec?'网站  ·  私数 15':'网站');
    privateLabels.forEach(l=>l.opacity(1-late*.65));
    const modulation=clamp((p11-.08)/.68),travelled=modulation*25;
    beads.forEach((o,i)=>{
      const a=angle((i+1)%23),come=ease((travelled-i)*2.4),leave=ease(pa/.12);
      o.position.set(Math.sin(a)*(i>=23?1.46:1.72),Math.cos(a)*(i>=23?1.46:1.72)-9*(1-come)-9*leave,i>=23?.33:.23);
      const m=o.material as T.MeshPhysicalMaterial;m.color.set(i>=23?C.gold:C.teal);
    });
    if(t<cue('c12').startSec){
      const at=travelled/23*Math.PI*2;dots[0].position.set(Math.sin(at)*markerR,Math.cos(at)*markerR,.18);
      numbers[0].set(p11>.08?String(Math.min(25,Math.floor(travelled))%23):'0');equations[0].set('');
      numbers[1].set('');equations[1].set('');status.forEach(l=>l.set(''));
      dots[1].position.set(0,markerR,.18);
    }else{
      if(t<cue('c15').startSec){compute(0,5,evidence.steps.alicePublic,clamp((pa-.08)/.5));if(pa<.08)setDot(0,2,1,ease(pa/.08));}
      else {compute(0,19,evidence.steps.aliceShared,clamp((qa-.22)/.60));if(qa<.22){setDot(0,8,1,ease(qa/.22));numbers[0].set('');equations[0].set('收到 19');status[0].set('');}}
      if(t<cue('c13').startSec){numbers[1].set('');equations[1].set('');status[1].set('');dots[1].position.set(0,markerR,.18);}
      else if(t<cue('c16').startSec){compute(1,5,evidence.steps.bobPublic,clamp((pb-.08)/.5));if(pb<.08)setDot(1,0,1,ease(pb/.08));}
      else {compute(1,8,evidence.steps.bobShared,clamp((qb-.22)/.60));if(qb<.22){setDot(1,19,1,ease(qb/.22));numbers[1].set('');equations[1].set('收到 8');status[1].set('');}}
    }
    transport(aPacket,upperPath,'c12','c16',t);transport(bPacket,lowerPath,'c13','c15',t);
    if(qa>=.82)status[0].set('秘密');
    if(qb>=.82)status[1].set('秘密');
    const p17=phase('c17',t);equality.opacity(smoothWindow(t,'c17'));
    equality.set(p17<.47?'(5¹⁵)⁶  =  (5⁶)¹⁵':'5⁹⁰ mod 23 = 2');
    equations.forEach(l=>l.opacity((t<cue('c12').startSec?0:1)*(1-late))); 
    numbers.forEach(l=>l.opacity(1-late*.52));status.forEach(l=>l.opacity(1-late));
    const trials=phase('c20',t),trialCount=Math.min(6,Math.floor(clamp((trials-.1)/.64)*6));
    const trialEntry=evidence.bruteforce[Math.max(0,trialCount-1)];
    candidate.opacity(smoothWindow(t,'c19','c20'));
    candidate.set(t<cue('c20').startSec?'公开结果：8  →  私数？':trialCount===6?'猜到 6  ·  算出 8 ✓':`试 ${Math.max(1,trialCount)}：5${sup(Math.max(1,trialCount))} mod 23`);
    guessResult.opacity(smoothWindow(t,'c20'));guessResult.set(trialCount?String(trialEntry.remainder):'开始尝试',trialCount===6?C.teal:C.rose);
    trialMarks.position.y=-9+8*ease((t-cue('c20').startSec)/.6)-8*ease((t-cue('c20').endSec)/.65);
    trialBeads.forEach((o,i)=>o.position.y=i<trialCount?.12:0);
    const gridIn=ease((t-cue('c21').startSec)/1.6),gridOut=ease((t-cue('c23').endSec)/.8);grid.position.y=-12+12*gridIn-12*gridOut;grid.rotation.y=.08*Math.sin(t*.11);grid.scale.setScalar(1+.2*phase('c21',t));
    modern.opacity(smoothWindow(t,'c21','c23'));
    modern.set(window(t,'c23')?'Diffie–Hellman · 1976':'正向容易   ·   逆向困难');
    // Solid items retire below the opaque floor; labels may fade as focus changes.
    wheels.forEach((w,i)=>{w.rotation.y=(i?-.04:.04)*late;});
  };
}
