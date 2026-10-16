import * as T from 'three';
import {Line2} from 'three/examples/jsm/lines/Line2.js';
import {LineGeometry} from 'three/examples/jsm/lines/LineGeometry.js';
import {LineMaterial} from 'three/examples/jsm/lines/LineMaterial.js';
import {C,V,State,mix,clamp,pulse,ramp} from './visual';
import {PhysicsPlayback} from './PhysicsPlayback';

export const PILE_MAGNIFICATION=80;
export const TMD_RELATIVE_MAGNIFICATION=1;
type PileStage={u_m:number[][];settlement_m:number[];sideReactionOnPile_N:number[][];toeReactionOnPile_N:number[];axialForce_N:number[]};
export type EnvironmentData={schema:string;tmd:{time:number[];relativeX_m:number[];supportX_m:number[];windFactor:number[];forceOnSupport_N:number[];damperForceOnSupport_N:number[]};pile:{nodes:{xyz_m:number[]}[];stages:PileStage[];loadFactor:number[];soilLayers:{name:string;depthRangeBelowGrade_m:number[]}[]};[key:string]:any};

export class ForceArrow{
 root=new T.Group();tip=V();shaft:T.Mesh;head:T.Mesh;bead:T.Mesh;mat:T.MeshStandardMaterial;
 constructor(c:string,public radius=.006){this.mat=new T.MeshStandardMaterial({color:c,roughness:.38,metalness:.12,emissive:c,emissiveIntensity:.16});this.shaft=new T.Mesh(new T.CylinderGeometry(1,1,1,12),this.mat);this.head=new T.Mesh(new T.ConeGeometry(1,1,20),this.mat);this.bead=new T.Mesh(new T.SphereGeometry(1,12,8),new T.MeshBasicMaterial({color:'#fff4d9',toneMapped:false}));this.root.add(this.shaft,this.head,this.bead);}
 set(a:T.Vector3,b:T.Vector3,weight=1,camera?:T.PerspectiveCamera,phase=0){this.tip.copy(b);const d=b.clone().sub(a),length=d.length();this.root.visible=weight>.001&&length>.0001;if(!this.root.visible)return;this.root.position.copy(a);this.root.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());const pixel=camera?2*Math.tan(T.MathUtils.degToRad(camera.fov)/2)*camera.position.distanceTo(a)/1080:0,r=Math.min(length*.075,Math.max(this.radius,pixel*2.2))*Math.max(.3,weight),h=Math.min(r*7.6,length*.32),body=Math.max(.0001,length-h);this.shaft.scale.set(r,body,r);this.shaft.position.y=body/2;this.head.scale.set(r*2.8,h,r*2.8);this.head.position.y=body+h/2;this.bead.scale.setScalar(r*1.22);this.bead.position.y=body*(phase%1);this.bead.visible=weight>.95&&length>r*12;}
}

function wideLine(points:T.Vector3[],color:string,width:number,dashed=false){const mat=new LineMaterial({color,linewidth:width,worldUnits:false,dashed,dashSize:.055,gapSize:.033,transparent:true,opacity:.88,depthWrite:false});mat.resolution.set(1920,1080);mat.toneMapped=false;const line=new Line2(new LineGeometry().setPositions(points.flatMap(p=>p.toArray())),mat);line.computeLineDistances();line.frustumCulled=false;return line;}

/** Continuous height reveal; endpoints always lie on the actual reference polyline. */
function setReferenceLine(line:Line2,points:T.Vector3[],progress=1){
 const count=points.length-1,limit=count*clamp(progress),shown=Math.min(count,Math.ceil(limit));
 const start=line.geometry.getAttribute('instanceStart') as T.InterleavedBufferAttribute,end=line.geometry.getAttribute('instanceEnd') as T.InterleavedBufferAttribute;
 const ds=line.geometry.getAttribute('instanceDistanceStart') as T.InterleavedBufferAttribute,de=line.geometry.getAttribute('instanceDistanceEnd') as T.InterleavedBufferAttribute;
 let distance=0;
 for(let k=0;k<count;k++){
  const a=points[k],fullEnd=points[k+1],b=k===shown-1?a.clone().lerp(fullEnd,clamp(limit-k)):fullEnd;
  start.setXYZ(k,a.x,a.y,a.z);end.setXYZ(k,b.x,b.y,b.z);ds.setX(k,distance);de.setX(k,distance+a.distanceTo(b));distance+=a.distanceTo(fullEnd);
 }
 start.data.needsUpdate=true;ds.data.needsUpdate=true;line.geometry.instanceCount=shown;line.visible=shown>0;
}

export function referenceTiming(u:number){
 return {
  draw:pulse(12.8,13.1,13.75,14.1,u)+pulse(31.55,32.2,33.55,34.1,u),
  connector:pulse(13.1,13.2,13.65,13.75,u)+pulse(32.2,32.3,33.45,33.55,u),
  marker:pulse(13.2,13.3,13.55,13.65,u)+pulse(32.3,32.4,33.35,33.45,u),
 };
}

function earthTexture(){const n=256,bytes=new Uint8Array(n*n*4);let seed=98471;for(let y=0;y<n;y++)for(let x=0;x<n;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const v=170+((seed>>>24)-128)*.21+8*Math.sin(y*.38+Math.sin(x*.04));const k=(y*n+x)*4;bytes[k]=v;bytes[k+1]=v*.91;bytes[k+2]=v*.77;bytes[k+3]=255;}const tex=new T.DataTexture(bytes,n,n,T.RGBAFormat);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.repeat.set(4,1);tex.needsUpdate=true;tex.colorSpace=T.SRGBColorSpace;return tex;}

/** Replays stored solver values. Visual interpolation never creates new cases. */
export class EnvironmentPlayback{
 root=new T.Group();soil=new T.Group();pile=new T.Group();wind=new T.Group();reference=new T.Group();
 pileOrigin=V(.1248,-.314,.3432);pileSegments:T.Mesh[]=[];sideArrows:ForceArrow[]=[];toeArrow=new ForceArrow('#b28031',.005);loadArrow=new ForceArrow('#c24f34',.005);lateralArrow=new ForceArrow('#087b95',.0045);windArrows:ForceArrow[]=[];axialArrows:ForceArrow[]=[];windTargets:T.Mesh[]=[];
 connector:Line2;outline:Line2;currentReference:Line2;referenceDot:T.Mesh;texture:T.DataTexture;data:EnvironmentData;axialIndices:number[]=[];windIndices:number[]=[];
 constructor(public scene:T.Scene,data:EnvironmentData,public physics:PhysicsPlayback){
  if(data.schema!=='rainbow.shanghai-environment/1')throw new Error('Missing verified environmental response');this.data=data;this.pileOrigin.y=-Number((data.pile as any).headDepthBelowGrade_m)*.01;scene.add(this.root);this.root.add(this.soil,this.pile,this.wind,this.reference);this.texture=earthTexture();
  const earthColors=['#ac9275','#afa084','#959683','#898e7b','#a3a18a','#b1a58d','#aaa088','#b9a47f','#c1ab84','#ac9c7d','#b8a684','#a39472'];
  const layers=data.pile.soilLayers.map((l,i)=>[l.depthRangeBelowGrade_m[0]*.01,l.depthRangeBelowGrade_m[1]*.01,earthColors[i%earthColors.length]] as const);
  for(const [top,bottom,c]of layers){const mat=new T.MeshStandardMaterial({color:c,map:this.texture,bumpMap:this.texture,bumpScale:.008,roughness:.94});const m=new T.Mesh(new T.BoxGeometry(1.6,bottom-top,.22),mat);m.position.set(0,-(top+bottom)/2,-.60);m.receiveShadow=true;this.soil.add(m);}
  const count=data.pile.nodes.length-1;
  for(let i=0;i<count;i++){const m=new T.Mesh(new T.CylinderGeometry(.0075,.0075,1,16),new T.MeshStandardMaterial({color:'#c9774f',metalness:.12,roughness:.46}));this.pileSegments.push(m);this.pile.add(m);}
  for(let i=0;i<7;i++){const a=new ForceArrow('#087b95',.0042);this.sideArrows.push(a);this.pile.add(a.root);}
  this.pile.add(this.toeArrow.root,this.loadArrow.root,this.lateralArrow.root);
  const guide=new T.Line(new T.BufferGeometry().setFromPoints([this.pileOrigin,this.pileOrigin.clone().add(V(0,-.52,0))]),new T.LineDashedMaterial({color:'#778984',dashSize:.013,gapSize:.011,transparent:true,opacity:.65}));guide.computeLineDistances();this.pile.add(guide);
  const loads=data.tmd as any;for(const h of [45,125,205,285,365,445,535]){const a=new ForceArrow('#d45f3d',.014);a.mat.emissive.set('#8f321f');a.mat.emissiveIntensity=.30;a.mat.depthTest=false;a.mat.depthWrite=false;a.mat.transparent=true;a.root.children.forEach(o=>{o.renderOrder=31;if(o instanceof T.Mesh){(o.material as T.Material).depthTest=false;(o.material as T.Material).transparent=true;}});this.windArrows.push(a);this.wind.add(a.root);let nearest=0;for(let i=1;i<loads.windLoads.nodeIds.length;i++)if(Math.abs(loads.windLoads.nodeXYZ_m[i][1]-h)<Math.abs(loads.windLoads.nodeXYZ_m[nearest][1]-h))nearest=i;this.windIndices.push(nearest);const target=new T.Mesh(new T.RingGeometry(.014,.024,24),new T.MeshBasicMaterial({color:'#de9b45',side:T.DoubleSide,depthWrite:false,depthTest:false,toneMapped:false,transparent:true,opacity:.92}));target.renderOrder=32;this.windTargets.push(target);this.wind.add(target);}
  // Two opposite mega-columns, one actual segment on each. The arrows below
  // depict signed axial-force increments N = sigma * A, not local wind suction.
  for(const side of [-1,1]){const indices=physics.data.members.map((m,i)=>({m,i,a:physics.axes[i]})).filter(x=>x.m.meshIds.some(id=>id.startsWith('MEGACOL_Z04'))&&x.a.a.x*side>15);indices.sort((a,b)=>Math.abs((a.a.a.y+a.a.b.y)*.5-230)-Math.abs((b.a.a.y+b.a.b.y)*.5-230)||b.a.a.z-a.a.a.z);if(indices.length)this.axialIndices.push(indices[0].i);}
  for(let i=0;i<this.axialIndices.length*2;i++){const a=new ForceArrow(C.red,.009);this.axialArrows.push(a);this.root.add(a.root);}
  const points=[];for(let i=0;i<=100;i++)points.push(V(-.30+.115*i/100,5.80*i/100,0));
  this.outline=wideLine(points,'#405b66',2.8,true);
  this.currentReference=wideLine(points,'#107d96',3.7);
  this.connector=wideLine([V(),V()],'#b57a32',3.2,true);
  this.referenceDot=new T.Mesh(new T.SphereGeometry(.027,16,12),new T.MeshStandardMaterial({color:'#107d96',emissive:'#107d96',emissiveIntensity:.2}));
  this.reference.add(this.outline,this.currentReference,this.connector,this.referenceDot);physics.setCoreBending(data.tmd);
 }
 sample(field:string,time:number){const d=this.data.tmd,times=d.time,n=times.length-1,x=clamp(time/times[n])*n,i=Math.min(n-1,Math.floor(x));const values=(d as any)[field] as number[];if(!values)throw new Error('Missing TMD signal '+field);return mix(values[i],values[i+1],x-i);}
 tmd(s:State){const t=this.physics.physicalTime(s);return {relative:this.sample('relativeX_m',t),support:this.sample('supportX_m',t),windFactor:this.sample('windFactor',t),force:this.sample('forceOnSupport_N',t),damping:this.sample('damperForceOnSupport_N',t)};}
 update(s:State,camera?:T.PerspectiveCamera,windReveal=1){
  const u=s.n+s.u,soil=pulse(4.15,5,8.8,9.8,u);this.soil.position.y=-4*(1-soil);this.soil.visible=soil>.00001;
  const pw=pulse(6.2,6.65,7.95,8.45,u),load=ramp(6.55,7.72,u),stages=this.data.pile.stages,index=load*(stages.length-1),i=Math.min(stages.length-2,Math.floor(index)),a=stages[i],b=stages[i+1],f=index-i;
  const point=(k:number)=>{const rest=this.data.pile.nodes[k].xyz_m;return this.pileOrigin.clone().add(V(rest[0],rest[1],rest[2]??0).multiplyScalar(.01)).add(V(mix(a.u_m[k][0],b.u_m[k][0],f),mix(a.u_m[k][1],b.u_m[k][1],f),0).multiplyScalar(.01*PILE_MAGNIFICATION*pw));};
  this.pile.visible=pw>.001;this.pile.position.x=3*(1-pw);
  this.pileSegments.forEach((m,k)=>{const p=point(k),q=point(k+1),v=q.clone().sub(p);m.position.copy(p).add(q).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),v.clone().normalize());m.scale.y=v.length();const force=Math.abs(mix(a.axialForce_N[k],b.axialForce_N[k],f));(m.material as T.MeshStandardMaterial).color.set('#d8caba').lerp(new T.Color(C.red),clamp(force/8e6)**.6);});
  const head=point(0);this.loadArrow.set(head.clone().add(V(0,.145*load,0)),head,pw*load,camera,s.time*.75);
  this.lateralArrow.set(head.clone().add(V(-.13*load,0,0)),head,pw*load,camera,s.time*.75+.3);
  this.sideArrows.forEach((ar,j)=>{const k=Math.max(1,Math.round((j+1)/8*(this.data.pile.nodes.length-1))),p=point(k),reaction=mix(a.sideReactionOnPile_N[k][1],b.sideReactionOnPile_N[k][1],f),len=.015+.065*clamp(Math.abs(reaction)/6e5),q=p.clone().add(V(.012,0,.007));ar.set(q.clone().add(V(0,-Math.sign(reaction)*len,0)),q,pw*load,camera,s.time*.75+j*.17);});
  const toe=point(this.data.pile.nodes.length-1),reaction=mix(a.toeReactionOnPile_N[1],b.toeReactionOnPile_N[1],f);this.toeArrow.set(toe.clone().add(V(0,-.025-.10*clamp(reaction/8e6),0)),toe,pw*load,camera,s.time*.75);
  // The caller can reveal the independent structural load case after the CFD
  // field leaves. One continuous weight drives shaft length/radius and targets;
  // toggling only group visibility would expose fully grown arrows at the seam.
  const w=pulse(29.85,30.5,33.8,34.6,u)*clamp(windReveal),tm=this.tmd(s);this.wind.visible=w>.001;const wl=(this.data.tmd as any).windLoads;
  this.windArrows.forEach((ar,j)=>{const k=this.windIndices[j],xyz=wl.nodeXYZ_m[k],force=wl.baseForce_N[k],rest=V(...xyz as [number,number,number]).multiplyScalar(.01),p=rest.clone().add(this.physics.displacementAt(rest)),vector=V(...force as [number,number,number]).multiplyScalar(tm.windFactor*6.5e-6*w);ar.set(p.clone().sub(vector),p,w,camera,this.physics.physicalTime(s)*.55+j*.12);const target=this.windTargets[j];target.position.copy(p);target.visible=ar.root.visible;target.scale.setScalar(w);if(camera)target.quaternion.copy(camera.quaternion);});
  const timing=referenceTiming(u);this.reference.visible=timing.draw>0;this.reference.position.set(0,0,.4);
  const rest:T.Vector3[]=[],deformed:T.Vector3[]=[];for(let k=0;k<=100;k++){const p=V(-.30+.115*k/100,5.8*k/100,0);rest.push(p);deformed.push(p.clone().add(this.physics.displacementAt(p)));}
  setReferenceLine(this.outline,rest,timing.draw);setReferenceLine(this.currentReference,deformed,timing.draw);
  const p=V(-.185,5.80,0),q=p.clone().add(this.physics.displacementAt(p));setReferenceLine(this.connector,[p,q]);
  // Both connector anchors stay exact. Grow stroke width after the height trace
  // is complete, then grow the marker at its true endpoint; reverse on exit.
  this.connector.material.linewidth=3.2*timing.connector;this.connector.visible=timing.connector>0;
  this.referenceDot.position.copy(q);this.referenceDot.scale.setScalar(timing.marker);this.referenceDot.visible=timing.marker>0;
  const aw=Math.max(pulse(18.85,19.25,20.75,21.15,u),pulse(32.95,33.25,33.72,34.1,u));this.axialArrows.forEach((ar,j)=>{const idx=this.axialIndices[Math.floor(j/2)],axis=this.physics.axes[idx],node=j%2?axis.j:axis.i,p=(j%2?axis.b:axis.a).clone().multiplyScalar(.01),gain=(this.physics.play?.scale??1)*(this.physics.play?.weight??0)*.01;p.add(V(this.physics.currentU[node*3],this.physics.currentU[node*3+1],this.physics.currentU[node*3+2]).multiplyScalar(gain));const stress=this.physics.currentStress[idx],member=this.physics.data.members[idx] as any,area=member.A_m2??member.section?.A??member.A;if(!(area>0))throw new Error('Missing actual mega-column section area');const axialForce=stress*1e6*area,outward=axis.delta.clone().normalize().multiplyScalar(j%2?1:-1),length=Math.abs(axialForce)*3.7e-9*aw,outer=p.clone().addScaledVector(outward,length);ar.mat.color.set(stress>=0?'#087d9b':'#d75d37');ar.mat.emissive.copy(ar.mat.color);ar.set(stress>=0?p:outer,stress>=0?outer:p,aw,camera,s.time*.6+j*.18);});
 }
 dispose(){this.root.removeFromParent();this.root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();const materials=Array.isArray(o.material)?o.material:[o.material];materials.forEach(m=>m.dispose());}});this.texture.dispose();}
}
