import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import evidence from './crypto-evidence.json';
import {clamp, cue, ease, phase} from './Timeline';

const P={cream:'#fff1d3',paper:'#f8ddb0',blue:'#3667cf',deep:'#10274f',gold:'#dfa449',coral:'#f07861',silver:'#9cb6ca',mint:'#9ee0cc'};
type V=[number,number,number];
type Label={mesh:T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>;set:(text:string,color?:string)=>void;alpha:(v:number)=>void};
type Token={root:T.Group;face:Label;body:T.Mesh;home:T.Vector3};
const lerp=(a:number,b:number,p:number)=>a+(b-a)*p;
const smooth=(p:number,a:number,b:number)=>ease((p-a)/(b-a));
const curve=(points:V[])=>new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),false,'catmullrom',.5);
const bodyMaterial=(color:string,metal=.2)=>new T.MeshPhysicalMaterial({color,metalness:metal,roughness:.3,clearcoat:.42,clearcoatRoughness:.22});

function block(parent:T.Object3D,p:V,size:V,color:string,r=.08){
  const o=new T.Mesh(new RoundedBoxGeometry(...size,3,Math.min(r,...size.map(v=>v*.24))),bodyMaterial(color));
  o.position.set(...p);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;
}
function pipe(parent:T.Object3D,points:V[],color:string,r=.025){
  const o=new T.Mesh(new T.TubeGeometry(curve(points),72,r,8,false),bodyMaterial(color,.58));parent.add(o);return o;
}
function label(parent:T.Object3D,text:string,pos:V,width:number,height=.7,color:string=P.cream):Label{
  const canvas=document.createElement('canvas');canvas.width=1536;canvas.height=Math.max(128,Math.round(1536*height/width));
  const ctx=canvas.getContext('2d')!;const tex=new T.CanvasTexture(canvas);tex.colorSpace=T.SRGBColorSpace;
  const material=new T.MeshBasicMaterial({map:tex,transparent:true,depthWrite:false,toneMapped:false});
  const mesh=new T.Mesh(new T.PlaneGeometry(width,height),material);mesh.position.set(...pos);parent.add(mesh);
  let previous='',lastColor='';
  const set=(value:string,col:string=color)=>{
    if(value===previous&&col===lastColor)return;previous=value;lastColor=col;
    ctx.clearRect(0,0,canvas.width,canvas.height);ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=col;
    let font=canvas.height*.74;ctx.font=`600 ${font}px "Microsoft YaHei", Arial, sans-serif`;
    const extent=ctx.measureText(value).width;if(extent>canvas.width*.96){font*=canvas.width*.96/extent;ctx.font=`600 ${font}px "Microsoft YaHei", Arial, sans-serif`;}
    ctx.fillText(value,canvas.width/2,canvas.height*.535);tex.needsUpdate=true;
  };
  set(text);return{mesh,set,alpha:v=>material.opacity=clamp(v)};
}
function ribbon(parent:T.Object3D,path:T.CatmullRomCurve3,width:number,color:string){
  const n=110,position:number[]=[],uv:number[]=[],index:number[]=[];
  for(let i=0;i<=n;i++){
    const p=path.getPoint(i/n),t=path.getTangent(i/n);const across=new T.Vector3(-t.y,t.x,0).normalize();
    for(const side of [-1,1]){const v=p.clone().addScaledVector(across,width*.5*side);position.push(v.x,v.y,v.z);uv.push(i/n,(side+1)/2);}
    if(i<n){const b=i*2;index.push(b,b+1,b+2,b+1,b+3,b+2);}
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(position,3));geometry.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geometry.setIndex(index);geometry.computeVertexNormals();
  const m=bodyMaterial(color,.3);m.side=T.DoubleSide;const o=new T.Mesh(geometry,m);o.receiveShadow=true;parent.add(o);return o;
}
function gear(parent:T.Object3D,p:V,radius:number,teeth:number,color:string){
  const shape=new T.Shape();for(let i=0;i<teeth*4;i++){const a=i/(teeth*4)*Math.PI*2,r=radius*(i%4===0||i%4===3?.88:1);const x=Math.cos(a)*r,y=Math.sin(a)*r;if(i===0)shape.moveTo(x,y);else shape.lineTo(x,y);}shape.closePath();
  const hole=new T.Path();hole.absarc(0,0,radius*.44,0,Math.PI*2,true);shape.holes.push(hole);
  const geo=new T.ExtrudeGeometry(shape,{depth:.18,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.025,bevelThickness:.025});
  const o=new T.Mesh(geo,bodyMaterial(color,.72));o.position.set(...p);o.castShadow=true;parent.add(o);return o;
}
function key(parent:T.Object3D,color:string){
  const g=new T.Group();parent.add(g);
  const head=new T.Mesh(new T.TorusGeometry(.28,.085,12,36),bodyMaterial(color,.7));head.position.x=-.4;g.add(head);
  block(g,[.16,0,0],[.85,.14,.15],color,.035);block(g,[.45,-.15,0],[.16,.35,.16],color,.035);block(g,[.2,-.12,0],[.13,.28,.16],color,.03);return g;
}

/**
 * Frame-derived view of the saved X25519/HKDF/AES-GCM experiment.
 * The weaving machine is an illustrative metaphor; ciphertext is never random.
 * Parent places root at [8, 7, -102]. All narrative coordinates are local.
 */
export class DeliveryFlow{
  root=new T.Group();
  private loom=new T.Group();private receiver=new T.Group();private gears:T.Mesh[]=[];private needles:T.Mesh[]=[];private doors:T.Mesh[]=[];
  private labels:Label[]=[];private heading:Label;private sourceLabel:Label;private resultLine1:Label;private resultLine2:Label;private resultStatus:Label;
  private payload=new T.Group();private byteLabels:Label[]=[];private byteBodies:T.Mesh[]=[];private tagBand=new T.Group();private tagLabel:Label;
  private inputs:Token[]=[];private secretNodes:T.Mesh[]=[];private keys:T.Group[]=[];
  private streams:T.Mesh[]=[];private rejectTokens:T.Mesh[]=[];private retry=new T.Group();private missing=new T.Group();
  private inPath=curve([[-8,1.7,1.6],[-6.2,1.5,1.9],[-4.8,.9,1.5],[-3.1,.65,.15]]);
  private mainPath=curve([[-2.65,.65,.4],[-1.5,.8,1.4],[.25,1.2,1.8],[2.2,.9,1.1],[4.05,.55,.5],[4.35,.55,-.8]]);
  private rejectPath=curve([[3.65,.6,1.35],[3.9,-.8,1.9],[2.5,-2.1,2.1],[-2.5,-2.7,.9],[-17,-3.8,-.8]]);
  private retryPath=curve([[-7.5,2.55,-.9],[-4.5,3.3,-1.7],[.1,3.3,-2.1],[4.5,2.7,-1],[6.5,1.4,.1]]);

  constructor(){
    this.root.name='delivery-authenticated-weave';this.root.add(this.loom,this.receiver);
    this.loom.position.set(-3.3,.55,0);this.receiver.position.set(4.35,.55,0);
    // One asymmetric machine with layered combs, offset gears and copper buses.
    block(this.loom,[0,0,-1.45],[2.7,4.4,.55],P.deep,.2);
    block(this.loom,[-1.12,0,-.75],[.28,4.1,1.5],P.blue,.1);
    block(this.loom,[1.12,0,-.75],[.28,4.1,1.5],P.blue,.1);
    block(this.loom,[0,1.87,-.2],[2.8,.3,.45],P.cream,.08);
    block(this.loom,[0,-1.8,-.2],[2.8,.3,.45],P.blue,.08);
    this.gears.push(gear(this.loom,[-.66,.28,-.95],.93,18,P.gold),gear(this.loom,[.74,-.43,-.92],.64,14,P.silver),gear(this.loom,[.58,1,-.93],.46,12,P.coral));
    for(let i=0;i<9;i++){
      const x=-.92+i*.23;
      pipe(this.loom,[[x,-1.56,-.55],[x,-.62,-.14],[x,.62,-.14],[x,1.56,-.55]],i%3===0?P.gold:P.silver,.024);
      this.needles.push(block(this.loom,[x,.5,.06],[.095,1.7,.17],i%2?P.gold:P.cream,.03));
    }
    for(let i=0;i<4;i++){
      const z=-.7+i*.24;block(this.receiver,[-.92,0,z],[.17,3.9,.16],i%2?P.gold:P.blue,.04);block(this.receiver,[.92,0,z],[.17,3.9,.16],i%2?P.gold:P.blue,.04);
      block(this.receiver,[0,1.86,z],[2.15,.17,.16],P.cream,.04);block(this.receiver,[0,-1.86,z],[2.15,.17,.16],P.blue,.04);
    }
    this.doors.push(block(this.receiver,[-.44,0,.4],[.84,3.2,.22],P.blue,.1),block(this.receiver,[.44,0,.4],[.84,3.2,.22],P.blue,.1));
    // The receiver has a real dark back wall: valid packets retire into its depth.
    block(this.receiver,[0,0,-1.45],[3.15,3.65,.22],P.deep,.14);
    for(let i=0;i<6;i++)for(const x of[-.43,.43])block(this.receiver,[x,-1.12+i*.44,.54],[.62,.045,.035],i%2?P.gold:P.silver,.01);
    // The physical strip enters the loom, then a colder wire bus carries ciphertext.
    ribbon(this.root,this.inPath,.48,P.paper);
    ribbon(this.root,this.mainPath,.28,P.blue);
    pipe(this.root,[[-2.8,.19,.2],[-1,.35,.8],[1.4,.4,.7],[3.5,.13,-.1]],P.gold,.028);
    ribbon(this.root,this.rejectPath,.13,P.coral);
    pipe(this.root,[[-7.5,2.55,-.9],[-4.5,3.3,-1.7],[.1,3.3,-2.1],[4.5,2.7,-1],[6.5,1.4,.1]],P.silver,.018);
    // Strong names live above mechanisms. No baseline crosses geometry or subtitles.
    const add=(s:string,p:V,w:number,h=.7,col:string=P.cream)=>{const l=label(this.root,s,p,w,h,col);this.labels.push(l);return l;};
    this.heading=add('',[.1,3.7,2.8],9,.85);
    this.sourceLabel=add('加密',[-3.3,-2.15,1.8],2.8,.8);
    add('核验 · 解密',[4.35,-2.15,1.8],3.4,.8);
    this.resultLine1=add('今晚八点',[7.9,1.05,2.8],3.35,.85);
    this.resultLine2=add('老地方',[7.9,.13,2.8],3.1,.85);
    this.resultStatus=add('',[7.9,2.06,2.8],3.8,.75,P.mint);
    for(const l of[this.resultLine1,this.resultLine2,this.resultStatus]){l.mesh.renderOrder=12;l.mesh.material.depthTest=false;}
    // One moving packet: six leading ciphertext bytes from the actual 27-byte payload.
    this.root.add(this.payload);block(this.payload,[0,0,-.07],[3.25,1.9,.2],P.deep,.16);
    const bytes=evidence.ciphertextOnlyHex.match(/.{2}/g)!;
    for(let i=0;i<6;i++){
      const x=(i%3-1)*1.03,y=i<3?.4:-.4;
      this.byteBodies.push(block(this.payload,[x,y,.08],[.94,.69,.1],P.blue,.08));
      this.byteLabels.push(label(this.payload,bytes[i].toUpperCase(),[x,y,.15],.88,.72));
    }
    this.tagBand.position.set(0,-1.3,0);this.payload.add(this.tagBand);
    block(this.tagBand,[0,0,0],[3.2,.7,.15],P.gold,.08);
    this.tagLabel=label(this.tagBand,'认证标签',[0,0,.1],2.9,.7,P.deep);
    // The tiny embedded cells encode actual tag nibbles; no invented data texture.
    const tag=Array.from(evidence.tagHex,c=>parseInt(c,16));
    tag.forEach((v,i)=>block(this.tagBand,[(i-15.5)*.093,-.39,-.015],[.045,.05+v*.006,.035],i%2?P.gold:P.silver,.008));
    Array.from(evidence.plaintext).forEach((char,i)=>{
      const token=new T.Group();const b=block(token,[0,0,0],[.71,.93,.065],P.paper,.035);
      const f=label(token,char,[0,.015,.045],.65,.84,P.deep);this.root.add(token);this.inputs.push({root:token,face:f,body:b,home:new T.Vector3(-7.8,1.7,-1)});
    });
    // Each end derives its own key. No shared key is transported across the bus.
    for(const x of[-3.3,4.35]){
      const node=block(this.root,[x,3.2,-1],[.64,.64,.64],P.gold,.16);node.rotation.set(.25,0,.4);this.secretNodes.push(node);
      pipe(this.root,[[x,3.2,-1],[x-.6,2.6,-.6],[x,1.7,-.1]],P.gold,.028);
      this.keys.push(key(this.root,P.gold));
    }
    // Narrow, moving glints describe current flow without a false numerical overlay.
    for(let i=0;i<16;i++)this.streams.push(block(this.root,[0,-8,0],[.13,.055,.08],i%3===0?P.gold:P.silver,.01));
    for(let i=0;i<5;i++)this.rejectTokens.push(block(this.root,[0,-8,0],[.1,.08,.06],P.coral,.01));
    this.root.add(this.retry,this.missing);
    for(const env of [this.retry,this.missing]){
      block(env,[0,0,0],[1.03,.66,.07],P.paper,.045);
      pipe(env,[[-.48,.29,.06],[0,-.04,.07],[.48,.29,.06]],P.gold,.014);
      block(env,[0,-.03,.1],[.18,.18,.045],P.coral,.04);
    }
    this.update(0);
  }

  update(t:number){
    const ids=['s22','s23','s24','s25','s26','s27','s28','s29'];
    let n=22;for(let i=0;i<ids.length;i++)if(t>=cue(ids[i]).startSec)n=22+i;
    const id=`s${n}`,p=phase(id,t),start=cue('s22').startSec,end=cue('s29').endSec;
    const active=t>=start-3&&t<=end+3;
    const entry=ease((t-start)/1.2),exit=1-ease((t-end)/1.7),a=entry*exit;
    // Mechanism always exists in the world. Only labels fade as focus changes.
    this.gears.forEach((g,i)=>g.rotation.z=(i%2?-1:1)*(t*.29+i*.6));
    this.needles.forEach((v,i)=>v.position.y=.18+.36*Math.sin(t*2.1+i*Math.PI));
    this.loom.rotation.y=-.09;this.receiver.rotation.y=.08;
    const titles:Record<number,string>={22:'共同秘密 → 会话钥匙',23:'字句进入，密文出发',24:'动一个位置，会怎样？',25:'内容与标签，一起核验',26:'缺了钥匙，重做也不行',27:'正常接收 · 原文完整',28:`${evidence.originalByteHex.toUpperCase()} → ${evidence.modifiedByteHex.toUpperCase()} · 只改一位`,29:'保护内容 ≠ 保证送达'};
    // Film owns the three editorial callouts. Avoid duplicating them in 3D.
    this.heading.set(titles[n],n===28?P.coral:P.cream);this.heading.alpha([22,25,29].includes(n)?0:a);
    this.labels.forEach(l=>{if(![this.heading,this.resultLine1,this.resultLine2,this.resultStatus].includes(l))l.alpha(a);});
    this.sourceLabel.set(n===22?'密钥派生':'加密');

    const inputRun=n===23?clamp(p/.68):n===27?clamp(p/.6):0;
    this.inputs.forEach((token,i)=>{
      const q=inputRun*2.8-i*.18;
      const u=clamp(q);const pt=this.inPath.getPoint(u);
      token.root.position.copy(pt);token.root.rotation.set(0,-.10,.055*Math.sin(i*.7+u*3));
      // Blank cards are physically stored in an input slot, and sink behind the comb.
      token.root.position.z-=1.8*(1-ease(q/.08))+1.5*smooth(q,.84,1);
      token.root.position.x-=20*(1-ease(q/.075));
      const fade=ease(q/.06)*(1-smooth(q,.82,1));token.face.alpha(fade*a);
      if(!active||!(n===23||n===27||n===22))token.root.position.set(-7.8,-30,-1);
    });

    this.keys.forEach((k,i)=>{
      const local=phase('s22',t),kp=smooth(local,.15,.65),x=i?4.35:-3.3;
      k.position.set(x+.1,lerp(3.3,2.02,kp),lerp(-1.4,.95,kp));k.rotation.set(0,.1*Math.sin(t*.3+i),-.2);
      const consumed=smooth(local,.52,.84);
      this.secretNodes[i].position.y=lerp(3.2,1.5,consumed);this.secretNodes[i].position.z=lerp(-1,-3,consumed);this.secretNodes[i].rotation.y=t*.4;
    });
    let packetProgress=.32,packetEntry=1,packetOut=0,open=0,reject=0,restore=0,lost=0;
    const tamper=n===24||n===25||n===26||n===28;
    if(n===22){packetEntry=0;packetProgress=.015;}
    if(n===23){packetEntry=smooth(p,.19,.32);packetProgress=smooth(p,.32,.88);open=smooth(p,.66,.78);restore=smooth(p,.83,.94);packetOut=smooth(p,.81,.91);}
    if(n===24){packetProgress=lerp(.03,.43,smooth(p,.03,.6));packetEntry=smooth(p,0,.08);}
    if(n===25){packetProgress=lerp(.43,.72,smooth(p,0,.5));reject=smooth(p,.55,.94);}
    if(n===26){packetProgress=lerp(.25,.72,smooth(p,.05,.56));packetEntry=smooth(p,0,.12);reject=smooth(p,.58,.96);}
    if(n===27){packetEntry=smooth(p,.12,.24);packetProgress=smooth(p,.22,.72);open=smooth(p,.53,.68);restore=smooth(p,.68,.8);packetOut=smooth(p,.68,.79);}
    if(n===28){packetEntry=smooth(p,0,.1);packetProgress=lerp(.3,.72,smooth(p,.22,.6));reject=smooth(p,.64,.96);}
    if(n===29){packetProgress=.45;packetOut=1;lost=smooth(p,.08,.35);}
    this.payload.position.copy(this.mainPath.getPoint(clamp(packetProgress)));
    this.payload.rotation.set(0,-.05+.1*Math.sin(t*.25),-.025*Math.sin(t*.6));
    this.payload.scale.setScalar(n===24||n===28?1.22:1.15);
    // Suspend the legible packet in front of its transport ribbon, then feed it
    // through the receiver shutter into the opaque housing instead of dropping it
    // into the lower caption zone.
    this.payload.position.y-=28*(1-packetEntry);this.payload.position.z+=1.65;
    if(packetOut>0){
      this.payload.position.x=lerp(this.payload.position.x,4.35,packetOut);
      this.payload.position.y=lerp(this.payload.position.y,.55,packetOut);
      this.payload.position.z=lerp(this.payload.position.z,-8,packetOut);
      this.payload.scale.setScalar(1.15*(1-.55*packetOut));
    }
    if(reject>0){this.payload.position.copy(this.rejectPath.getPoint(reject));this.payload.position.z+=1.3;this.payload.rotation.z=-.14*reject;this.payload.scale.setScalar(1.15-.22*reject);}
    if(n===29)this.payload.position.set(4.35,.55,-8);
    if(!active)this.payload.position.set(0,-30,-4);
    const changed=tamper&&(n!==24||p>.28)&&(n!==28||p>.22);
    this.byteLabels[0].set((changed?evidence.modifiedByteHex:evidence.originalByteHex).toUpperCase());
    (this.byteBodies[0].material as T.MeshPhysicalMaterial).color.set(changed?P.coral:P.blue);
    this.tagBand.position.y=-1.3-.12*Math.sin(t*.85);
    this.tagLabel.set(n===26?'标签不符':n===28?'标签未变':'认证标签');
    // Failures keep the receiving shutter shut. A fresh valid packet reopens it.
    this.doors[0].position.x=-.44-1.02*open;this.doors[1].position.x=.44+1.02*open;
    this.doors.forEach(d=>(d.material as T.MeshPhysicalMaterial).color.set(reject>0?P.coral:P.blue));
    const textFade=(n===23||n===27)?restore:0;
    this.resultLine1.alpha(textFade*a);this.resultLine2.alpha(textFade*a);
    this.resultLine1.mesh.position.y=1.05+.2*(1-restore);this.resultLine2.mesh.position.y=.13-.2*(1-restore);
    const failed=(n===25||n===26||n===28)?smooth(p,n===28?.58:.5,n===28?.69:.65):0;
    this.resultStatus.set(failed>0?'验证失败 ×':'完整恢复 ✓',failed>0?P.coral:P.mint);
    this.resultStatus.alpha(Math.max(textFade,failed)*a);
    this.resultStatus.mesh.position.x=failed>0?7.2:7.9;
    this.resultStatus.mesh.position.y=failed>0?2.65:2.06;

    this.streams.forEach((v,i)=>{
      const q=((t*.12+i/this.streams.length)%1+1)%1;v.position.copy(this.mainPath.getPoint(q));v.position.z-=.12;const tangent=this.mainPath.getTangent(q);v.rotation.z=Math.atan2(tangent.y,tangent.x);
      v.scale.setScalar(active?1:0);
    });
    this.rejectTokens.forEach((v,i)=>{const q=clamp(reject*1.3-i*.065);v.position.copy(this.rejectPath.getPoint(q));v.position.z+=.14;if(reject===0)v.position.y=-9;});
    const heldApproach=smooth(p,0,.16);
    this.missing.position.set(lerp(-8.4,.3,heldApproach),lerp(2.6,-1.3,heldApproach)-4*lost,.2);this.missing.rotation.set(.1,.3,-.3*lost);
    const retryProgress=smooth(p,.52,.95);this.retry.position.copy(this.retryPath.getPoint(retryProgress));this.retry.rotation.z=.1*Math.sin(retryProgress*6);
    if(n!==29||!active){this.missing.position.y=-9;this.retry.position.y=-9;}
    else {this.missing.position.z-=1.7*(1-smooth(p,0,.08));this.retry.position.y-=7*(1-smooth(p,.46,.54));}
  }

  dispose(){
    const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
    this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);const map=(m as T.MeshBasicMaterial).map;if(map)textures.add(map);}}});
    geometries.forEach(g=>g.dispose());textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());this.root.removeFromParent();
  }
}
