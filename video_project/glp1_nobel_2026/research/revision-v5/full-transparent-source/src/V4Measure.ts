import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {V,mat,tube,visibility,smooth} from './visual';

type ArmPose={shoulder:T.Vector3;elbow:T.Vector3;wrist:T.Vector3;placedElbow:T.Vector3;placedWrist:T.Vector3;upper:T.Quaternion;forearm:T.Quaternion;hand:T.Quaternion};
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
export class V4Measure{
 root=new T.Group();anchors:Record<string,T.Vector3>={};
 private geometries:{geometry:T.BufferGeometry;standing:Float32Array;seated:Float32Array;normalStanding:Float32Array;normalSeated:Float32Array}[]=[];
 private lastWeight=-1;
 private arms={left:armPose(-1),right:armPose(1)};
 constructor(body:T.Group){
  this.root.name='same-atlas-seated-home-measurement';
  const geometries=new Set<T.BufferGeometry>();body.traverse(o=>{if(o instanceof T.Mesh)geometries.add(o.geometry)});
  for(const geometry of geometries){
   const position=geometry.getAttribute('position'),standing=Float32Array.from(position.array),seated=new Float32Array(standing.length);
   const normalStanding=Float32Array.from(geometry.getAttribute('normal').array);
   for(let i=0;i<position.count;i++)this.pose(V().fromArray(standing,i*3)).toArray(seated,i*3);
   position.array.set(seated);geometry.computeVertexNormals();const normalSeated=Float32Array.from(geometry.getAttribute('normal').array);
   position.array.set(standing);geometry.getAttribute('normal').array.set(normalStanding);
   this.geometries.push({geometry,standing,seated,normalStanding,normalSeated});
  }
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
  const support=new T.Mesh(supportGeometry,mat('#e7dfcf',1,.82));support.name='soft-arm-support';support.position.set(.245,0,.350);support.castShadow=true;support.receiveShadow=true;this.root.add(support);
  const {shoulder,elbow,placedElbow}=this.arms.right,cuffCenter=shoulder.clone().lerp(elbow,.52);
  const cuff=new T.Group();cuff.name='cuff-fitted-to-original-upper-arm';cuff.position.copy(this.pose(cuffCenter));cuff.quaternion.setFromUnitVectors(V(0,1,0),shoulder.clone().sub(placedElbow).normalize());this.root.add(cuff);
  // A tapered cloth sleeve follows the upper-arm envelope without cutting
  // through the biceps or hanging as a large detached cylinder.
  const width=.112,r=.060;
  const wrap=new T.Mesh(new T.CylinderGeometry(.064,.055,width,64,1,true),mat('#4c7476',1,.58));wrap.material.side=T.DoubleSide;cuff.add(wrap);
  for(const [y,radius] of [[-width*.5,.055],[width*.5,.064]]){const seam=new T.Mesh(new T.TorusGeometry(radius,.0013,8,64),mat('#749795'));seam.rotation.x=Math.PI/2;seam.position.y=y;cuff.add(seam);}
  const label=new T.Mesh(new T.BoxGeometry(.025,.03,.002),mat('#a6bbb1'));label.position.set(0,0,r+.001);cuff.add(label);
  const monitor=box('blood-pressure-monitor',.14,.055,.105,V(.468,tableTop+.042,.34),'#e5e3d9',.012);monitor.rotation.x=.12;
  const screen=new T.Mesh(new RoundedBoxGeometry(.09,.032,.003,3,.004),mat('#638180'));screen.position.copy(monitor.position).add(V(0,.025,.049));screen.rotation.x=-.3;this.root.add(screen);
  // Blank dash marks communicate readiness; no patient result is fabricated.
  for(const row of [-1,1])for(const col of [-1,0,1])box('unmeasured-display-dash',.012,.002,.001,V(.468+col*.023,screen.position.y+row*.007,screen.position.z+.002),'#dce8d5',.0002);
  const port=V(.020,-.018,r*.95).applyQuaternion(cuff.quaternion).add(cuff.position);
  this.root.add(tube([port,port.clone().add(V(.05,-.055,.03)),V(.34,.69,.28),V(.40,.69,.37),V(.415,.71,.34)],.0025,'#567f80'));
  this.root.updateMatrixWorld(true);
  this.anchors={measurement:V(.18,.68,.13),measureCuff:cuff.position.clone(),measureForearm:this.arms.right.placedElbow.clone().lerp(this.arms.right.placedWrist,.52).add(V(0,-.45,0)),measureMonitor:monitor.position.clone()};
  this.root.userData={units:'metres',identity:'same BodyParts3D skin mesh; no separate figure',pose:'landmark-based articulated teaching pose; supported back, horizontal forearm on tapered cushion, other hand on thigh, feet on floor',display:'no fabricated blood-pressure reading',measuredElbow:this.arms.right.placedElbow.clone().add(V(0,-.45,0)).toArray(),measuredWrist:this.arms.right.placedWrist.clone().add(V(0,-.45,0)).toArray(),sourceUpperArmLength:shoulder.distanceTo(elbow),posedUpperArmLength:shoulder.distanceTo(placedElbow)};
 }
 private pose(p:T.Vector3){
  const arm=smooth((Math.abs(p.x)-.153)/.035)*smooth((p.y-.58)/.08);
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
 update(weight:number){
  const q=Math.max(0,Math.min(1,weight));
  if(Math.abs(q-this.lastWeight)<1e-8)return;this.lastWeight=q;
  for(const g of this.geometries){
   const p=g.geometry.getAttribute('position'),n=g.geometry.getAttribute('normal');
   for(let i=0;i<g.standing.length;i++){p.array[i]=g.standing[i]+(g.seated[i]-g.standing[i])*q;n.array[i]=g.normalStanding[i]+(g.normalSeated[i]-g.normalStanding[i])*q;}
   p.needsUpdate=true;n.needsUpdate=true;g.geometry.computeBoundingSphere();
  }
  visibility(this.root,q);
 }
}
