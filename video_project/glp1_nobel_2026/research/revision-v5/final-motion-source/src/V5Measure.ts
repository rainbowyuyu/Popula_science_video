import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {V,mat,tube,visibility,smooth} from './visual';
import skinRig from './V5PersonWeights.json';

type ArmPose={shoulder:T.Vector3;elbow:T.Vector3;wrist:T.Vector3;placedElbow:T.Vector3;placedWrist:T.Vector3;upper:T.Quaternion;forearm:T.Quaternion;hand:T.Quaternion};
type SkinSample={indices:number[];weights:number[]};
const armPose=(side:number):ArmPose=>{
 const shoulder=V(side*.174,1.403,-.040),elbow=V(side*.225,1.108,-.036),wrist=V(side*.250,.911,.008);
 const upperLength=shoulder.distanceTo(elbow),forearmLength=elbow.distanceTo(wrist);
 let placedElbow:T.Vector3,forearmDirection:T.Vector3,handDirection:T.Vector3;
 if(side>0){
  // Keep the elbow-to-wrist axis horizontal, rather than rotating about an
  // arbitrary world X axis (the atlas forearm already inclines anteriorly).
  const dy=1.180-shoulder.y,dx=.051;
  placedElbow=shoulder.clone().add(V(dx,dy,Math.sqrt(upperLength**2-dy**2-dx**2)));
  forearmDirection=V(.075,0,1).normalize();handDirection=V(.020,0,1).normalize();
 }else{
  placedElbow=shoulder.clone().addScaledVector(V(-.051,-.292,.070).normalize(),upperLength);
  forearmDirection=V(.105,-.126,.142).normalize();handDirection=V(.12,-.07,.990).normalize();
 }
 const placedWrist=placedElbow.clone().addScaledVector(forearmDirection,forearmLength);
 return {shoulder,elbow,wrist,placedElbow,placedWrist,
  upper:new T.Quaternion().setFromUnitVectors(elbow.clone().sub(shoulder).normalize(),placedElbow.clone().sub(shoulder).normalize()),
  forearm:new T.Quaternion().setFromUnitVectors(wrist.clone().sub(elbow).normalize(),forearmDirection),
  hand:new T.Quaternion().setFromUnitVectors(V(side*.023,-.104,.042).normalize(),handDirection)};
};

/** Measurement pose of the SAME BodyParts3D skin surface. Metres throughout.
 * The skin is posed about approximate hip/knee/elbow landmarks; it is a
 * teaching pose, not a measured person's skeletal rig or diagnostic capture. */
export class V5Measure{
 root=new T.Group();anchors:Record<string,T.Vector3>={};
 private geometries:{geometry:T.BufferGeometry;standing:Float32Array;seated:Float32Array;normalStanding:Float32Array;normalSeated:Float32Array}[]=[];
 private cuff!:T.Group;private hose!:T.Mesh;private cuffWrap!:T.Mesh;private cuffLabel!:T.Mesh;
 private cuffSkin!:T.BufferGeometry;private cuffRings:SkinSample[][]=[];private cuffSeams:T.Mesh[]=[];private cuffEnvelope:number[][]=[];
 private furniture=new T.Group();private monitorPosition=V();
 private arms={left:armPose(-1),right:armPose(1)};
 constructor(body:T.Group){
  this.root.name='same-atlas-seated-home-measurement';
  const geometries=new Set<T.BufferGeometry>();body.traverse(o=>{if(o instanceof T.Mesh)geometries.add(o.geometry)});
  for(const geometry of geometries){
   const position=geometry.getAttribute('position'),standing=Float32Array.from(position.array),seated=new Float32Array(standing.length);
   const normalStanding=Float32Array.from(geometry.getAttribute('normal').array);
   for(let i=0;i<position.count;i++)this.pose(V().fromArray(standing,i*3),i).toArray(seated,i*3);
   position.array.set(seated);geometry.computeVertexNormals();const normalSeated=Float32Array.from(geometry.getAttribute('normal').array);
   position.array.set(standing);geometry.getAttribute('normal').array.set(normalStanding);
   this.geometries.push({geometry,standing,seated,normalStanding,normalSeated});
  }
  this.cuffSkin=this.geometries.reduce((a,b)=>a.standing.length>b.standing.length?a:b).geometry;
  this.cacheCuffSections();this.furniture.name='measurement-side-table-arrival';this.root.add(this.furniture);
  const box=(name:string,w:number,h:number,d:number,p:T.Vector3,color:string,r=.01)=>{
   const mesh=new T.Mesh(new RoundedBoxGeometry(w,h,d,3,r),mat(color,1,.68));mesh.name=name;mesh.position.copy(p);mesh.castShadow=true;mesh.receiveShadow=true;this.root.add(mesh);return mesh;
  };
  box('chair-seat',.41,.045,.39,V(0,.412,-.015),'#b0aaa0');
  box('supported-back',.40,.57,.04,V(0,.71,-.135),'#b5b3a9',.015);
  for(const x of [-.16,.16])for(const z of [-.14,.13])box('chair-leg',.025,.40,.025,V(x,.20,z),'#929d96',.005);
  const tableTop=.667;
  box('forearm-support-table',.57,.038,.62,V(.385,tableTop-.019,.35),'#d9d2c5');
  for(const x of [.16,.62])for(const z of [.09,.61])box('table-leg',.028,.64,.028,V(x,.32,z),'#aab6ac',.005);
  // One softly contoured support reaches from the elbow to the palm root.
  // Its top follows the taper of the forearm; both elbow and wrist are supported.
  const supportGeometry=new RoundedBoxGeometry(.16,.04,.44,4,.010),supportPosition=supportGeometry.getAttribute('position');
  for(let i=0;i<supportPosition.count;i++){
   const z=.350+supportPosition.getZ(i),height=.020+.022*smooth((z-.17)/.22),v=(supportPosition.getY(i)+.02)/.04;
   supportPosition.setY(i,tableTop+height*v);
  }
  supportGeometry.computeVertexNormals();
  const support=new T.Mesh(supportGeometry,mat('#e7dfcf',1,.82));support.name='soft-arm-support';support.position.set(.245,0,.350);support.castShadow=true;support.receiveShadow=true;this.furniture.add(support);
  const {shoulder,elbow,placedElbow}=this.arms.right,cuffCenter=shoulder.clone().lerp(elbow,.62);
  const cuff=new T.Group();cuff.name='cuff-fitted-to-original-upper-arm';cuff.position.copy(this.pose(cuffCenter));cuff.quaternion.setFromUnitVectors(V(0,1,0),shoulder.clone().sub(placedElbow).normalize());this.root.add(cuff);
  this.cuff=cuff;
  // A tapered cloth sleeve follows the upper-arm envelope without cutting
  // through the biceps or hanging as a large detached cylinder.
  const width=.112,r=.060;
  const sleeve=new T.BufferGeometry(),indices:number[]=[];
  sleeve.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(this.cuffRings.length*65*3),3));
  for(let ring=0;ring<this.cuffRings.length-1;ring++)for(let a=0;a<64;a++){const i=ring*65+a;indices.push(i,i+1,i+65,i+1,i+66,i+65)}
  sleeve.setIndex(indices);
  const wrap=new T.Mesh(sleeve,mat('#4c7476',1,.58));wrap.material.side=T.DoubleSide;cuff.add(wrap);this.cuffWrap=wrap;
  for(let edge=0;edge<2;edge++){const seam=new T.Mesh(new T.BufferGeometry(),mat('#749795'));cuff.add(seam);this.cuffSeams.push(seam)}
  const label=new T.Mesh(new T.BoxGeometry(.025,.03,.002),mat('#a6bbb1'));cuff.add(label);this.cuffLabel=label;
  const monitor=box('blood-pressure-monitor',.14,.055,.105,V(.468,tableTop+.042,.34),'#e5e3d9',.012);monitor.rotation.x=.12;
  const screen=new T.Mesh(new RoundedBoxGeometry(.09,.032,.003,3,.004),mat('#638180'));screen.position.copy(monitor.position).add(V(0,.025,.049));screen.rotation.x=-.3;this.furniture.add(screen);
  // Blank dash marks communicate readiness; no patient result is fabricated.
  for(const row of [-1,1])for(const col of [-1,0,1])box('unmeasured-display-dash',.012,.002,.001,V(.468+col*.023,screen.position.y+row*.007,screen.position.z+.002),'#dce8d5',.0002);
  for(const object of [...this.root.children])if(['forearm-support-table','table-leg','blood-pressure-monitor','unmeasured-display-dash'].includes(object.name))this.furniture.add(object);
  this.monitorPosition.copy(monitor.position);
  const port=V(.020,-.018,r*.95).applyQuaternion(cuff.quaternion).add(cuff.position);
  this.hose=tube([port,port.clone().add(V(.05,-.055,.03)),V(.34,.69,.28),V(.40,.69,.37),V(.415,.71,.34)],.0025,'#567f80');this.root.add(this.hose);
  this.root.updateMatrixWorld(true);
  this.anchors={measurement:V(.18,.68,.13),measureCuff:cuff.position.clone(),measureForearm:this.arms.right.placedElbow.clone().lerp(this.arms.right.placedWrist,.52).add(V(0,-.45,0)),measureMonitor:monitor.position.clone()};
  this.root.userData={units:'metres',identity:'same BodyParts3D skin mesh; no separate figure',pose:'landmark-based articulated teaching pose; supported back, horizontal forearm on tapered cushion, other hand on thigh, feet on floor',display:'no fabricated blood-pressure reading',measuredElbow:this.arms.right.placedElbow.clone().add(V(0,-.45,0)).toArray(),measuredWrist:this.arms.right.placedWrist.clone().add(V(0,-.45,0)).toArray(),sourceUpperArmLength:shoulder.distanceTo(elbow),posedUpperArmLength:shoulder.distanceTo(placedElbow)};
  this.fitCuffToSkin();this.updateHose();
 }
 /** Cache actual triangle/plane intersections once. Their barycentric samples
  * follow the same deformed skin in every pose, including a partly seated
  * dining pose; a standing-to-seated landmark interpolation cannot do that. */
 private cacheCuffSections(){
  const positions=this.cuffSkin.getAttribute('position'),index=this.cuffSkin.index;
  const {shoulder,elbow}=this.arms.right,centre=shoulder.clone().lerp(elbow,.62);
  const up=shoulder.clone().sub(elbow).normalize(),right=V().crossVectors(up,V(0,0,1)).normalize(),front=V().crossVectors(right,up).normalize();
  for(let ring=0;ring<17;ring++){
   const plane=centre.clone().addScaledVector(up,-.056+.112*ring/16);
   const envelope:number[]=[];
   for(let i=0;i<positions.count;i++){
    const point=V().fromBufferAttribute(positions,i),delta=point.clone().sub(plane),axial=delta.dot(up);
    delta.addScaledVector(up,-axial);
    if(Math.abs(axial)<.010&&point.x>.15&&delta.length()<.072&&((skinRig.weights as Record<string,number>[])[i]?.upperL??0)>.90)envelope.push(i);
   }
   this.cuffEnvelope.push(envelope);
   type Hit={sample:SkinSample;angle:number;point:T.Vector3;key:string};
   const nodes=new Map<string,Hit>(),edges=new Map<string,Set<string>>();
   for(let t=0;t<(index?.count??positions.count);t+=3){
    const ids=[0,1,2].map(j=>index?index.getX(t+j):t+j),points=ids.map(i=>V().fromBufferAttribute(positions,i));
    const triangle:Hit[]=[];
    for(let edge=0;edge<3;edge++){
     const next=(edge+1)%3,a=points[edge].clone().sub(plane).dot(up),b=points[next].clone().sub(plane).dot(up);
     if(a*b>0||Math.abs(a-b)<1e-10)continue;
     const mix=a/(a-b),point=points[edge].clone().lerp(points[next],mix),radial=point.clone().sub(plane);
     if(point.x<.125||radial.length()>.09)continue;
     const weights=skinRig.weights as Record<string,number>[],upperWeight=(weights[ids[edge]]?.upperL??0)*(1-mix)+(weights[ids[next]]?.upperL??0)*mix;
     if(upperWeight<.75)continue;
     const angle=(Math.atan2(radial.dot(front),radial.dot(right))+Math.PI*2)%(Math.PI*2);
     const key=point.toArray().map(v=>Math.round(v*1e6)).join(',');
     triangle.push({sample:{indices:[ids[edge],ids[next]],weights:[1-mix,mix]},angle,point,key});
    }
    if(triangle.length===2&&triangle[0].key!==triangle[1].key)for(let i=0;i<2;i++){
     const h=triangle[i],other=triangle[1-i];nodes.set(h.key,h);
     const neighbors=edges.get(h.key)??new Set<string>();neighbors.add(other.key);edges.set(h.key,neighbors);
    }
   }
   // The same cutting plane also intersects the nearby thorax. Its contour
   // must never enter the arm wrap: keep the connected contour nearest the
   // upper-arm centre before interpolating around its circumference.
   const remaining=new Set(nodes.keys()),components:Hit[][]=[];
   while(remaining.size){const pending=[remaining.values().next().value!],component:Hit[]=[];
    while(pending.length){const key=pending.pop()!;if(!remaining.delete(key))continue;component.push(nodes.get(key)!);for(const neighbor of edges.get(key)??[])if(remaining.has(neighbor))pending.push(neighbor)}
    if(component.length>=12)components.push(component);
   }
   components.sort((a,b)=>new T.Box3().setFromPoints(a.map(h=>h.point)).getCenter(V()).distanceToSquared(plane)-new T.Box3().setFromPoints(b.map(h=>h.point)).getCenter(V()).distanceToSquared(plane));
   const hits=components[0]??[];
   hits.sort((a,b)=>a.angle-b.angle);if(hits.length<12)throw new Error('Upper-arm cuff requires a closed atlas skin section');
   const samples:SkinSample[]=[];
   for(let a=0;a<64;a++){
    const angle=a*Math.PI*2/64;let hi=hits.findIndex(h=>h.angle>=angle);if(hi<0)hi=0;
    const lo=(hi+hits.length-1)%hits.length,left=hits[lo],rightHit=hits[hi];
    const span=(rightHit.angle-left.angle+Math.PI*2)%(Math.PI*2),delta=(angle-left.angle+Math.PI*2)%(Math.PI*2),mix=span>1e-9?Math.min(1,delta/span):0;
    samples.push({indices:[...left.sample.indices,...rightHit.sample.indices],weights:[...left.sample.weights.map(w=>w*(1-mix)),...rightHit.sample.weights.map(w=>w*mix)]});
   }
   this.cuffRings.push(samples);
  }
 }
 private fitCuffToSkin(){
  const positions=this.cuffSkin.getAttribute('position');
  const rings=this.cuffRings.map(samples=>samples.map(sample=>{const point=V();sample.indices.forEach((i,j)=>point.addScaledVector(V().fromBufferAttribute(positions,i),sample.weights[j]));return point}));
  const centres=rings.map(ring=>ring.reduce((sum,p)=>sum.add(p),V()).multiplyScalar(1/ring.length));
  const middle=Math.floor(centres.length/2),last=centres.length-1;
  const centre=centres[middle],up=centres[last].clone().sub(centres[0]).normalize();
  const front=rings[middle][16].clone().sub(centre);front.addScaledVector(up,-front.dot(up)).normalize();
  const right=V().crossVectors(up,front).normalize();front.crossVectors(right,up).normalize();
  this.cuff.position.copy(centre);this.cuff.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(right,up,front));
  const inverse=this.cuff.quaternion.clone().invert(),sleeve=this.cuffWrap.geometry.getAttribute('position');
  // A fabric cuff is a taut convex envelope, not a copy of a partly observed
  // skin contour. A hull fills missing medial samples without the excessive
  // padding needed to enclose a flattened arm in an axis-aligned ellipse.
  const ringCentres=centres.map(c=>c.clone().sub(centre).applyQuaternion(inverse));
  const radial=rings.map((ring,k)=>{
   const samples=[...ring,...this.cuffEnvelope[k].map(i=>V().fromBufferAttribute(positions,i))].map(p=>p.clone().sub(centre).applyQuaternion(inverse));
   const points=samples.map(p=>new T.Vector2(p.x,p.z)).sort((a,b)=>a.x-b.x||a.y-b.y);
   const cross=(a:T.Vector2,b:T.Vector2,c:T.Vector2)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
   const lower:T.Vector2[]=[],upper:T.Vector2[]=[];
   for(const p of points){while(lower.length>1&&cross(lower[lower.length-2],lower[lower.length-1],p)<=1e-12)lower.pop();lower.push(p)}
   for(const p of [...points].reverse()){while(upper.length>1&&cross(upper[upper.length-2],upper[upper.length-1],p)<=1e-12)upper.pop();upper.push(p)}
   const hull=[...lower.slice(0,-1),...upper.slice(0,-1)];
   if(hull.length<3)throw new Error('Upper-arm cloth envelope requires a nondegenerate section');
   const origin=hull.reduce((sum,p)=>sum.add(p),new T.Vector2()).multiplyScalar(1/hull.length);
   ringCentres[k].x=origin.x;ringCentres[k].z=origin.y;
   return Array.from({length:64},(_,a)=>{
    const dx=Math.cos(a*Math.PI/32),dz=Math.sin(a*Math.PI/32);let radius=Infinity;
    for(let j=0;j<hull.length;j++){
     const start=hull[j],end=hull[(j+1)%hull.length],ex=end.x-start.x,ez=end.y-start.y,denominator=dx*ez-dz*ex;
     if(Math.abs(denominator)<1e-12)continue;
     const ax=start.x-origin.x,az=start.y-origin.y,t=(ax*ez-az*ex)/denominator,u=(ax*dz-az*dx)/denominator;
     if(t>=0&&u>=-1e-7&&u<=1+1e-7)radius=Math.min(radius,t);
    }
    if(!Number.isFinite(radius))throw new Error('Upper-arm cloth ray did not meet its closed section');
    return radius+.0045;
   });
  });
  // Relax small sampling ridges outward only, preserving the skin clearance.
  for(let pass=0;pass<2;pass++){
   const next=radial.map((row,k)=>row.map((r,a)=>Math.max(r,(radial[Math.max(0,k-1)][a]+2*r+radial[Math.min(last,k+1)][a])/4,(row[(a+63)%64]+2*r+row[(a+1)%64])/4)));
   next.forEach((row,k)=>row.forEach((r,a)=>radial[k][a]=r));
  }
  const local=ringCentres.map((c,k)=>Array.from({length:64},(_,a)=>V(c.x+Math.cos(a*Math.PI/32)*radial[k][a],c.y,c.z+Math.sin(a*Math.PI/32)*radial[k][a])));
  for(let ring=0;ring<local.length;ring++)for(let a=0;a<=64;a++)sleeve.setXYZ(ring*65+a,...local[ring][a%64].toArray() as [number,number,number]);
  sleeve.needsUpdate=true;this.cuffWrap.geometry.computeVertexNormals();this.cuffWrap.geometry.computeBoundingSphere();
  for(let edge=0;edge<2;edge++){const seam=this.cuffSeams[edge];seam.geometry.dispose();seam.geometry=new T.TubeGeometry(new T.CatmullRomCurve3(local[edge?last:0],true),64,.0012,6,true)}
  this.cuffLabel.position.copy(local[middle][16]).add(V(0,0,.0015));
  this.anchors.measureCuff?.copy(centre);
  this.root.userData.cuffAttachment={source:'convex cloth envelope around seventeen deformed atlas skin sections',centre:centre.toArray(),axis:up.toArray(),radialClearanceMetres:.0045,sectionMaximumRadius:radial.map(row=>Math.max(...row))};
 }
 private updateHose(){
  const port=this.cuffLabel.position.clone().add(V(.020,-.018,0)).applyQuaternion(this.cuff.quaternion).add(this.cuff.position),shift=this.furniture.position.x;
  const curve=new T.CatmullRomCurve3([port,port.clone().add(V(.05,-.055,.03)),V(.34+shift,.69,.28),V(.40+shift,.69,.37),V(.415+shift,.71,.34)]);
  this.hose.geometry.dispose();this.hose.geometry=new T.TubeGeometry(curve,40,.0025,10,false);
 }
 setFurnitureArrival(arrival:number){
  this.furniture.position.x=2.2*(1-smooth((arrival-.30)/.65));
  this.anchors.measureMonitor.copy(this.monitorPosition).add(V(this.furniture.position.x,0,0));
  this.updateHose();
 }
 private pose(p:T.Vector3,vertexIndex?:number){
  // The lateral thigh is close to the resting hand in world coordinates.
  // Use anatomical rig membership for skin; an x/y heuristic mistakes the
  // outer thigh for an arm and leaves it standing through seated clothing.
  const arm=vertexIndex===undefined
   ?smooth((Math.abs(p.x)-.153)/.035)*smooth((p.y-.58)/.08)
   :Math.min(1,Object.values((skinRig.weights as Record<string,number>[])[vertexIndex]??{}).reduce((a,b)=>a+b,0));
  const result=p.clone(),leg=(1-smooth((p.y-.875)/.065))*(1-arm);
  if(leg>0){
   const thigh=V(p.x,.90+p.z+.015,.885-p.y),shin=V(p.x,p.y+.45,p.z+.45);
   const knee=smooth((.50-p.y)/.10);thigh.lerp(shin,knee);result.lerp(thigh,leg);
  }
  // Two rigid bone transforms share the same elbow; a small skin blend at
  // each joint keeps the original continuous surface connected. The wrist
  // has its own relaxed orientation, so the hand no longer points upward.
  if(arm>0&&p.y>.69&&p.y<1.44){
   const rig=p.x>0?this.arms.right:this.arms.left;
   const upper=p.clone().sub(rig.shoulder).applyQuaternion(rig.upper).add(rig.shoulder);
   const forearm=p.clone().sub(rig.elbow).applyQuaternion(rig.forearm).add(rig.placedElbow);
   const hand=p.clone().sub(rig.wrist).applyQuaternion(rig.hand).add(rig.placedWrist);
   forearm.lerp(hand,1-smooth((p.y-.882)/.055));
   upper.lerp(forearm,1-smooth((p.y-1.073)/.070));
   const shoulderBlend=1-smooth((p.y-1.355)/.075);
   result.lerp(upper,arm*shoulderBlend);
  }
  result.y-=.45;return result;
 }
 update(weight:number,blendFromCurrent=false){
  const q=Math.max(0,Math.min(1,weight));
  for(const g of this.geometries){
   const p=g.geometry.getAttribute('position'),n=g.geometry.getAttribute('normal');
   // World first writes the current dining/activity pose. Blend that SAME
   // pose into measurement, so an infinitesimal cuff weight cannot reset the
   // whole body to standing while its clothing remains seated.
   for(let i=0;i<g.standing.length;i++){
    const from=blendFromCurrent?p.array[i]:g.standing[i],normal=blendFromCurrent?n.array[i]:g.normalStanding[i];
    p.array[i]=from+(g.seated[i]-from)*q;n.array[i]=normal+(g.normalSeated[i]-normal)*q;
   }
   p.needsUpdate=true;n.needsUpdate=true;g.geometry.computeBoundingSphere();
  }
  this.fitCuffToSkin();this.updateHose();
  visibility(this.root,q);
 }
}
