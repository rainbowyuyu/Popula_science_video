import * as T from 'three';
import {C,V,State,mix,clamp,pulse,ramp} from './visual';
import {PhysicsPlayback} from './PhysicsPlayback';

export const PILE_MAGNIFICATION=80;
export const TMD_RELATIVE_MAGNIFICATION=1;
type PileStage={u_m:number[][];settlement_m:number[];sideReactionOnPile_N:number[][];toeReactionOnPile_N:number[];axialForce_N:number[]};
export type EnvironmentData={schema:string;tmd:{time:number[];relativeX_m:number[];supportX_m:number[];windFactor:number[];forceOnSupport_N:number[];damperForceOnSupport_N:number[]};pile:{nodes:{xyz_m:number[]}[];stages:PileStage[];loadFactor:number[];soilLayers:{name:string;depthRangeBelowGrade_m:number[]}[]};[key:string]:any};

export class ForceArrow{
 root=new T.Group();shaft:T.Mesh;head:T.Mesh;mat:T.MeshStandardMaterial;
 constructor(c:string,r=.006){this.mat=new T.MeshStandardMaterial({color:c,roughness:.32,metalness:.25,emissive:c,emissiveIntensity:.10});this.shaft=new T.Mesh(new T.CylinderGeometry(r,r,1,12),this.mat);this.head=new T.Mesh(new T.ConeGeometry(r*3.4,r*8,16),this.mat);this.head.userData.h=r*8;this.root.add(this.shaft,this.head);}
 set(a:T.Vector3,b:T.Vector3,weight=1){const d=b.clone().sub(a),length=d.length();this.root.visible=weight>.001&&length>.0001;if(!this.root.visible)return;this.root.position.copy(a);this.root.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());const h=Math.min(this.head.userData.h,length*.36),body=Math.max(.0001,length-h);this.shaft.scale.set(weight,body,weight);this.shaft.position.y=body/2;this.head.scale.set(weight,h/this.head.userData.h,weight);this.head.position.y=body+h/2;}
}

function earthTexture(){const n=256,bytes=new Uint8Array(n*n*4);let seed=98471;for(let y=0;y<n;y++)for(let x=0;x<n;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=170+((seed>>>24)-128)*.21+8*Math.sin(y*.38+Math.sin(x*.04));const k=(y*n+x)*4;bytes[k]=v;bytes[k+1]=v*.91;bytes[k+2]=v*.77;bytes[k+3]=255;}const tex=new T.DataTexture(bytes,n,n,T.RGBAFormat);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(4,1);tex.needsUpdate=true;tex.colorSpace=T.SRGBColorSpace;return tex;}

/** Replays stored solver values. Visual interpolation never creates new cases. */
export class EnvironmentPlayback{
 root=new T.Group();soil=new T.Group();pile=new T.Group();wind=new T.Group();reference=new T.Group();
 pileOrigin=V(.1248,-.314,.3432);pileSegments:T.Mesh[]=[];sideArrows:ForceArrow[]=[];toeArrow=new ForceArrow(C.gold,.004);loadArrow=new ForceArrow(C.red,.0045);lateralArrow=new ForceArrow(C.teal,.0035);windArrows:ForceArrow[]=[];axialArrows:ForceArrow[]=[];
 connector:T.Line;outline:T.Line;currentReference:T.Line;referenceDot:T.Mesh;texture:T.DataTexture;data:EnvironmentData;axialIndices:number[]=[];windIndices:number[]=[];
 constructor(public scene:T.Scene,data:EnvironmentData,public physics:PhysicsPlayback){
  if(data.schema!=='rainbow.shanghai-environment/1')throw new Error('Missing verified environmental response');this.data=data;this.pileOrigin.y=-Number((data.pile as any).headDepthBelowGrade_m)*.01;scene.add(this.root);this.root.add(this.soil,this.pile,this.wind,this.reference);this.texture=earthTexture();
  const earthColors=['#ac9275','#afa084','#959683','#898e7b','#a3a18a','#b1a58d','#aaa088','#b9a47f','#c1ab84','#ac9c7d','#b8a684','#a39472'];
  const layers=data.pile.soilLayers.map((l,i)=>[l.depthRangeBelowGrade_m[0]*.01,l.depthRangeBelowGrade_m[1]*.01,earthColors[i%earthColors.length]] as const);
  for(const [top,bottom,c]of layers){const mat=new T.MeshStandardMaterial({color:c,map:this.texture,bumpMap:this.texture,bumpScale:.008,roughness:.94});const m=new T.Mesh(new T.BoxGeometry(1.6,bottom-top,.22),mat);m.position.set(0,-(top+bottom)/2,-.60);m.receiveShadow=true;this.soil.add(m);}
  const count=data.pile.nodes.length-1;
  for(let i=0;i<count;i++){const m=new T.Mesh(new T.CylinderGeometry(.0075,.0075,1,16),new T.MeshStandardMaterial({color:'#c9774f',metalness:.12,roughness:.46}));this.pileSegments.push(m);this.pile.add(m);}
  for(let i=0;i<7;i++){const a=new ForceArrow(C.teal,.0032);this.sideArrows.push(a);this.pile.add(a.root);}
  this.pile.add(this.toeArrow.root,this.loadArrow.root,this.lateralArrow.root);
  const guide=new T.Line(new T.BufferGeometry().setFromPoints([this.pileOrigin,this.pileOrigin.clone().add(V(0,-.52,0))]),new T.LineDashedMaterial({color:'#778984',dashSize:.013,gapSize:.011,transparent:true,opacity:.65}));guide.computeLineDistances();this.pile.add(guide);
  const loads=data.tmd as any;for(let i=0;i<7;i++){const a=new ForceArrow(C.red,.008);this.windArrows.push(a);this.wind.add(a.root);this.windIndices.push(Math.round((i+1)/8*(loads.windLoads.nodeIds.length-1)));}
  for(const side of [-1,1]){const indices=physics.data.members.map((m,i)=>({m,i,a:physics.axes[i]})).filter(x=>x.m.meshIds.some(id=>id.startsWith('MEGACOL_Z04'))&&x.a.a.x*side>15);indices.sort((a,b)=>a.a.a.z-b.a.a.z);if(indices.length)this.axialIndices.push(indices[0].i);}
  for(let i=0;i<this.axialIndices.length*2;i++){const a=new ForceArrow(C.red,.004);this.axialArrows.push(a);this.root.add(a.root);}
  const points=[];for(let i=0;i<=100;i++)points.push(V(-.30+.115*i/100,5.80*i/100,0));
  this.outline=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineDashedMaterial({color:'#546e79',dashSize:.075,gapSize:.05,transparent:true,opacity:.7}));this.outline.computeLineDistances();
  this.currentReference=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:C.red,transparent:true,opacity:.82}));
  this.connector=new T.Line(new T.BufferGeometry().setFromPoints([V(),V()]),new T.LineDashedMaterial({color:C.red,dashSize:.018,gapSize:.012}));
  this.referenceDot=new T.Mesh(new T.SphereGeometry(.027,16,12),new T.MeshStandardMaterial({color:C.red,emissive:C.red,emissiveIntensity:.2}));
  this.reference.add(this.outline,this.currentReference,this.connector,this.referenceDot);physics.setCoreBending(data.tmd);
 }
 sample(field:string,time:number){const d=this.data.tmd,times=d.time,n=times.length-1,x=clamp(time/times[n])*n,i=Math.min(n-1,Math.floor(x));const values=(d as any)[field] as number[];if(!values)throw new Error('Missing TMD signal '+field);return mix(values[i],values[i+1],x-i);}
 tmd(s:State){const t=this.physics.physicalTime(s);return {relative:this.sample('relativeX_m',t),support:this.sample('supportX_m',t),windFactor:this.sample('windFactor',t),force:this.sample('forceOnSupport_N',t),damping:this.sample('damperForceOnSupport_N',t)};}
 update(s:State){
  const u=s.n+s.u,soil=pulse(4.15,5,8.8,9.8,u);this.soil.position.y=-4*(1-soil);this.soil.visible=soil>.00001;
  const pw=pulse(6.2,6.65,7.95,8.45,u),load=ramp(6.55,7.72,u),stages=this.data.pile.stages,index=load*(stages.length-1),i=Math.min(stages.length-2,Math.floor(index)),a=stages[i],b=stages[i+1],f=index-i;
  const point=(k:number)=>{const rest=this.data.pile.nodes[k].xyz_m;return this.pileOrigin.clone().add(V(rest[0],rest[1],rest[2]??0).multiplyScalar(.01)).add(V(mix(a.u_m[k][0],b.u_m[k][0],f),mix(a.u_m[k][1],b.u_m[k][1],f),0).multiplyScalar(.01*PILE_MAGNIFICATION*pw));};
  this.pile.visible=pw>.001;this.pile.position.x=3*(1-pw);
  this.pileSegments.forEach((m,k)=>{const p=point(k),q=point(k+1),v=q.clone().sub(p);m.position.copy(p).add(q).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),v.clone().normalize());m.scale.y=v.length();const force=Math.abs(mix(a.axialForce_N[k],b.axialForce_N[k],f));(m.material as T.MeshStandardMaterial).color.set('#d8caba').lerp(new T.Color(C.red),clamp(force/8e6)**.6);});
  const head=point(0);this.loadArrow.set(head.clone().add(V(0,.09*load+.025,0)),head,pw*load);
  this.lateralArrow.set(head.clone().add(V(-.10*load,0,0)),head,pw*load);
  this.sideArrows.forEach((ar,j)=>{const k=Math.max(1,Math.round((j+1)/8*(this.data.pile.nodes.length-1))),p=point(k),reaction=mix(a.sideReactionOnPile_N[k][1],b.sideReactionOnPile_N[k][1],f),len=.024+.055*clamp(Math.abs(reaction)/6e5),q=p.clone().add(V(.008,0,.003));ar.set(q.clone().add(V(0,-Math.sign(reaction)*len,0)),q,pw*load);});
  const toe=point(this.data.pile.nodes.length-1),reaction=mix(a.toeReactionOnPile_N[1],b.toeReactionOnPile_N[1],f);this.toeArrow.set(toe.clone().add(V(0,-.03-.10*clamp(reaction/8e6),0)),toe,pw*load);
  const w=pulse(31.15,31.7,38.2,39,u),tm=this.tmd(s);this.wind.visible=w>.001;const wl=(this.data.tmd as any).windLoads;
  this.windArrows.forEach((ar,j)=>{const k=this.windIndices[j],xyz=wl.nodeXYZ_m[k],force=wl.baseForce_N[k],rest=V(...xyz as [number,number,number]).multiplyScalar(.01),p=rest.clone().add(this.physics.displacementAt(rest)),vector=V(...force as [number,number,number]).multiplyScalar(tm.windFactor*7e-7*w);ar.set(p.clone().sub(vector),p,w);});
  const rw=pulse(12.8,13.1,13.75,14.1,u)+pulse(31.55,32.2,33.55,34.1,u);this.reference.visible=rw>.001;this.reference.position.z=.4;
  const attr=this.currentReference.geometry.getAttribute('position') as T.BufferAttribute;for(let k=0;k<=100;k++){const p=V(-.30+.115*k/100,5.8*k/100,0);p.add(this.physics.displacementAt(p));attr.setXYZ(k,p.x,p.y,p.z);}attr.needsUpdate=true;
  const p=V(-.185,5.80,0),q=p.clone().add(this.physics.displacementAt(p));this.connector.geometry.setFromPoints([p,q]);this.connector.computeLineDistances();this.referenceDot.position.copy(q);
  const aw=pulse(18.85,19.25,20.75,21.15,u);this.axialArrows.forEach((ar,j)=>{const idx=this.axialIndices[Math.floor(j/2)],axis=this.physics.axes[idx],node=j%2?axis.j:axis.i,p=(j%2?axis.b:axis.a).clone().multiplyScalar(.01),gain=(this.physics.play?.scale??1)*(this.physics.play?.weight??0)*.01;p.add(V(this.physics.currentU[node*3],this.physics.currentU[node*3+1],this.physics.currentU[node*3+2]).multiplyScalar(gain));const stress=this.physics.currentStress[idx],direction=axis.delta.clone().normalize().multiplyScalar((j%2?1:-1)*Math.sign(stress)),length=.15*clamp(Math.abs(stress)/6);ar.mat.color.set(stress>=0?'#087d9b':'#dd4e2b');ar.set(p,p.clone().addScaledVector(direction,length),aw);});
 }
 dispose(){this.texture.dispose();}
}
