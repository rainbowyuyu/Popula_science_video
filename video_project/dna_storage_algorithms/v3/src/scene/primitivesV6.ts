import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

export const C = {ink:0x173e48, teal:0x168e92, cyan:0x74cfc7, gold:0xd8a553, coral:0xd67360, violet:0x8c86c3, white:0xf6f8f3, steel:0xa3bcc1, dark:0x173440};
export const BASE:Record<string,number>={A:C.teal,T:C.gold,C:C.coral,G:C.violet,'-':0xcbd8d8};
export const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export const ease=(v:number)=>{const q=clamp(v);return q*q*q*(q*(q*6-15)+10);};
export const lerp=(a:number,b:number,q:number)=>a+(b-a)*q;
export const v=(p:number[])=>new T.Vector3(p[0],p[1],p[2]);
/** A restrained coated finish gives long highlights instead of toy-like white blobs. */
export const mat=(color:number,roughness=.31,metalness=.12)=>new T.MeshPhysicalMaterial({color,roughness,metalness,clearcoat:.23,clearcoatRoughness:.25});
export function box(w:number,h:number,d:number,color:number,r=.08){
 const m=new T.Mesh(new RoundedBoxGeometry(w,h,d,5,Math.min(r,w/3,h/3,d/3)),mat(color));m.castShadow=true;m.receiveShadow=true;return m;
}
export function ball(r:number,color:number){const m=new T.Mesh(new T.SphereGeometry(r,32,24),mat(color,.28,.16));m.castShadow=true;return m;}
export function line(points:number[][],color:number,r=.024,opacity=1){
 const curve=new T.CatmullRomCurve3(points.map(v));
 const mesh=new T.Mesh(new T.TubeGeometry(curve,Math.max(24,points.length*8),r,12,false),new T.MeshStandardMaterial({color,roughness:.32,transparent:opacity<1,opacity,depthWrite:opacity===1}));return mesh;
}
export function rod(a:number[],b:number[],r:number,color:number){
 const start=v(a),end=v(b),delta=end.clone().sub(start);
 const mesh=new T.Mesh(new T.CylinderGeometry(r,r,delta.length(),20),mat(color));
 mesh.position.copy(start.add(end).multiplyScalar(.5));mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),delta.normalize());return mesh;
}
const textTextures=new Map<string,T.CanvasTexture>();
export function word(text:string,color='#173e48',size=.55,weight=650){
 const key=text+color+weight;let tex=textTextures.get(key);let aspect=1;
 if(!tex){const c=document.createElement('canvas');const ctx=c.getContext('2d')!;ctx.font=`${weight} 96px "Microsoft YaHei", Arial`;const width=Math.ceil(ctx.measureText(text).width+36);c.width=width;c.height=144;ctx.font=`${weight} 96px "Microsoft YaHei", Arial`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillStyle=color;ctx.fillText(text,width/2,75);tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;textTextures.set(key,tex);}
 aspect=tex.image.width/tex.image.height;
 const sprite=new T.Sprite(new T.SpriteMaterial({map:tex,transparent:true,depthWrite:false,depthTest:true}));sprite.scale.set(size*aspect,size,1);return sprite;
}
export function letter(base:string,sz=.58){
 const g=new T.Group();
 // Retain children[0] body / children[1] glyph: the substitution and deletion
 // demonstrations animate exactly these two objects.
 const m=box(sz,sz,.16,BASE[base]??C.ink,Math.min(.075,sz*.13));
 m.material.roughness=.33;m.material.metalness=.07;m.material.clearcoat=.38;m.material.clearcoatRoughness=.29;g.add(m);
 const sprite=word(base,'#173e48',sz*.92,700);
 const txt=new T.Mesh(new T.PlaneGeometry(sprite.scale.x,sprite.scale.y),new T.MeshBasicMaterial({map:sprite.material.map,transparent:true,depthWrite:false}));txt.position.z=.091;g.add(txt);return g;
}
export function sequence(seq:string,sz=.52,spacing=.65){const g=new T.Group();[...seq].forEach((b,i)=>{const l=letter(b,sz);l.position.x=(i-(seq.length-1)/2)*spacing;g.add(l);});return g;}
export function glass(w:number,h:number,d:number,opacity=.15){const m=box(w,h,d,0xc8e7e6,Math.min(.12,Math.min(w,h,d)*.12));m.material=new T.MeshPhysicalMaterial({color:0xcbe4df,roughness:.13,metalness:0,transparent:true,opacity,side:T.FrontSide,depthWrite:false,ior:1.46,clearcoat:.65,clearcoatRoughness:.12});m.castShadow=false;return m;}
export function shadow(w:number,d:number){
 const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d')!;const gr=ctx.createRadialGradient(64,64,3,64,64,62);gr.addColorStop(0,'rgba(15,44,49,.28)');gr.addColorStop(1,'rgba(15,44,49,0)');ctx.fillStyle=gr;ctx.fillRect(0,0,128,128);
 const m=new T.Mesh(new T.PlaneGeometry(w,d),new T.MeshBasicMaterial({map:new T.CanvasTexture(c),transparent:true,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.y=-2.45;return m;
}
export function plate(w=12,d=6){const g=new T.Group();const p=box(w,.25,d,C.white,.1);p.position.y=-2.6;p.receiveShadow=true;g.add(p,shadow(w*.85,d*.95));return g;}
export function helix(pairs=30,height=7,radius=1.1){
 const g=new T.Group();g.name='B_DNA_structural_schematic';
 const seq='ATGCGACTATGCATCGACGTATCGAGCTATG',pitch=height/(pairs-1),turn=Math.PI*2/10.5;
 // The unequal groove angles distinguish a double helix from a twisted ladder.
 // This is a structural teaching model, not atomistic molecular coordinates.
 const groove=Math.PI*.80,complement:Record<string,string>={A:'T',T:'A',G:'C',C:'G'};
 const point=(step:number,phase:number)=>new T.Vector3(Math.cos(step*turn+phase)*radius,(step/(pairs-1)-.5)*height,Math.sin(step*turn+phase)*radius);
 for(const [side,phase] of [[0,0],[1,groove]]){
  const points=Array.from({length:(pairs-1)*12+1},(_,i)=>point(i/12,phase));
  const curve=new T.CatmullRomCurve3(points,false,'centripetal');
  const backbone=new T.Mesh(new T.TubeGeometry(curve,(pairs-1)*20,radius*.047,12,false),mat(side?C.gold:C.teal,.3,.24));
  backbone.name=side?'backbone_antiparallel_2':'backbone_1';backbone.castShadow=true;g.add(backbone);
 }
 for(let i=0;i<pairs;i++){
  const p=point(i,0),q=point(i,groove),axis=q.clone().sub(p).normalize(),mid=p.clone().add(q).multiplyScalar(.5),a=seq[i%seq.length];
  const thickness=Math.min(pitch*.18,radius*.056),depth=radius*.17;
  // Two flat base planes meet across short hydrogen bonds; one rung only.
  for(const [start,finish,base,side] of [[p,mid,a,0],[q,mid,complement[a],1]] as const){
   const dir=finish.clone().sub(start).normalize(),length=start.distanceTo(finish)-radius*.14;
   const plate=box(length,thickness,depth,BASE[base],thickness*.3);
   plate.name=`base_${i}_${base}`;plate.position.copy(start).addScaledVector(dir,length*.5+radius*.07);
   plate.quaternion.setFromUnitVectors(new T.Vector3(1,0,0),dir);g.add(plate);
   const sugar=ball(radius*.069,side?0xddbb78:0x4daaa2);sugar.name=`sugar_${i}_${side}`;sugar.position.copy(start);g.add(sugar);
  }
  const normal=new T.Vector3(-axis.z,0,axis.x),bondCount=a==='G'||a==='C'?3:2;
  for(let bond=0;bond<bondCount;bond++){
   const center=mid.clone().addScaledVector(normal,(bond-(bondCount-1)/2)*radius*.045);
   const link=rod(center.clone().addScaledVector(axis,-radius*.064).toArray(),center.clone().addScaledVector(axis,radius*.064).toArray(),radius*.010,0xd1dcd4);link.name=`hydrogen_bond_${i}_${bond}`;g.add(link);
  }
 }
 g.userData={representation:'B-DNA structural schematic; 10.5 base pairs/turn; unequal grooves; complementary pairing',pairs,height,radius};return g;
}
export function ring(r:number,color:number,tube=.015){return new T.Mesh(new T.TorusGeometry(r,tube,8,96),mat(color,.2,.2));}
export function setOpacity(root:T.Object3D,opacity:number){root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Sprite){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{m.transparent=opacity<1;m.opacity=opacity;m.depthWrite=opacity>=1;});}});}
