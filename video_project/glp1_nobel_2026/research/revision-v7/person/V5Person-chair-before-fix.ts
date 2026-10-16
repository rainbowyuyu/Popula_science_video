import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {V, smooth, mat} from './visual';
import rawWeights from './V5PersonWeights.json';
import {createV7Shorts} from './V7Shorts';
import {createV7GripHand} from './V7GripHand';
const bodyWeights=rawWeights.weights as Record<string,number>[];

export type PersonAction='stand'|'eat'|'walk'|'sitStand'|'resistance';
export type PersonState={time:number;anatomyBlend?:number;action?:PersonAction;previousAction?:PersonAction;transition?:number;actionWeights?:Partial<Record<PersonAction,number>>;adiposity?:number;weight?:number;seatedWeight?:number;measurementWeight?:number;opacity?:number;propsOpacity?:number;wardrobeOpacity?:number;mealOffsetY?:number};
type Rig={s:T.Vector3;e:T.Vector3;w:T.Vector3;pe:T.Vector3;pw:T.Vector3;upper:T.Quaternion;forearm:T.Quaternion;hand:T.Quaternion};
type GeometryRecord={geometry:T.BufferGeometry;position:Float32Array;normal:Float32Array;clothing:boolean};
type ClothBinding={ids:[number,number,number];weights:[number,number,number]};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const axis=V(1,0,0);
const baseArm=(side:number)=>({s:V(side*.174,1.403,-.040),e:V(side*.225,1.108,-.036),w:V(side*.250,.911,.008)});

/** Removes local external genital relief from the teaching skin, in metres.
 * Does not edit the original GLB, skeleton, organs, body scale, or torso.
 * Call once BEFORE constructing any pose cache (including V4Measure).
 * Shared depth/surface geometries are processed only once; repeat calls are safe. */
export function neutralizeBodyGeometry(body:T.Object3D):void{
 const unique=new Set<T.BufferGeometry>();body.traverse(o=>{if(o instanceof T.Mesh)unique.add(o.geometry)});
 for(const g of unique){
  if(g.userData.v5Neutralized)continue;
  const p=g.getAttribute('position');
  for(let i=0;i<p.count;i++){
   const x=p.getX(i),y=p.getY(i),z=p.getZ(i);
   const k=(1-smooth((Math.abs(x)-.038)/.039))*smooth((y-.731)/.031)*(1-smooth((y-.872)/.035))*smooth((z-.002)/.025);
   if(k<=0)continue;
   // Symmetric smooth pelvic envelope replaces protruding external relief.
   const envelope=.088*Math.sqrt(Math.max(.05,1-((y-.925)/.193)**2-(x/.177)**2))-.007;
   p.setZ(i,z+(envelope-z)*k);
  }
  p.needsUpdate=true;g.computeVertexNormals();g.computeBoundingBox();g.computeBoundingSphere();
  g.userData.v5Neutralized=true;
 }
 body.userData.v5Neutralized=true;
}

function armRig(side:number,target:T.Vector3,handDirection:T.Vector3,poleDirection?:T.Vector3):Rig{
 const {s,e,w}=baseArm(side),a=s.distanceTo(e),b=e.distanceTo(w);
 const d=target.clone().sub(s),length=Math.min(a+b-.004,Math.max(Math.abs(a-b)+.003,d.length()));d.normalize();
 const along=(a*a-b*b+length*length)/(2*length),height=Math.sqrt(Math.max(0,a*a-along*along));
 const pole=(poleDirection??V(side*.31,-.95,-.08)).clone();pole.addScaledVector(d,-pole.dot(d)).normalize();
 const pe=s.clone().addScaledVector(d,along).addScaledVector(pole,height),pw=s.clone().addScaledVector(d,length);
 return {s,e,w,pe,pw,
  upper:new T.Quaternion().setFromUnitVectors(e.clone().sub(s).normalize(),pe.clone().sub(s).normalize()),
  forearm:new T.Quaternion().setFromUnitVectors(w.clone().sub(e).normalize(),pw.clone().sub(pe).normalize()),
  hand:new T.Quaternion().setFromUnitVectors(V(side*.023,-.104,.042).normalize(),handDirection.clone().normalize())};
}

// A palm has a direction and a roll: a shortest-arc wrist rotation alone
// can turn an eating grip palm-up. Keep the dorsal surface directed upward.
function diningHandRotation(side:number,direction:T.Vector3,sourceDirection?:T.Vector3):T.Quaternion{
 const fromY=(sourceDirection??V(side*.023,-.104,.042)).clone().normalize();
 const fromZ=V(0,0,-1).addScaledVector(fromY,fromY.z).normalize();
 const fromX=new T.Vector3().crossVectors(fromY,fromZ).normalize();
 const toY=direction.clone().normalize();
 const toZ=V(.10,1,.04).addScaledVector(toY,-V(.10,1,.04).dot(toY)).normalize();
 const toX=new T.Vector3().crossVectors(toY,toZ).normalize();
 const from=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(fromX,fromY,fromZ));
 const to=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(toX,toY,toZ));
 return to.multiply(from.invert());
}
type DualPose={real:T.Quaternion;dual:T.Quaternion};
function dualPose(q:T.Quaternion,origin:T.Vector3,target:T.Vector3):DualPose{
 const t=target.clone().sub(origin.clone().applyQuaternion(q));
 const d=new T.Quaternion(t.x,t.y,t.z,0).multiply(q);
 d.set(d.x*.5,d.y*.5,d.z*.5,d.w*.5);return {real:q.clone(),dual:d};
}
const identityDual: DualPose={real:new T.Quaternion(),dual:new T.Quaternion(0,0,0,0)};
function dualDeform(point:T.Vector3,bones:[DualPose,number][]):T.Vector3{
 const reference=bones.reduce((a,b)=>b[1]>a[1]?b:a)[0].real;
 let rx=0,ry=0,rz=0,rw=0,dx=0,dy=0,dz=0,dw=0;
 for(const [bone,weight] of bones){const w=weight*(bone.real.dot(reference)<0?-1:1);
  rx+=bone.real.x*w;ry+=bone.real.y*w;rz+=bone.real.z*w;rw+=bone.real.w*w;
  dx+=bone.dual.x*w;dy+=bone.dual.y*w;dz+=bone.dual.z*w;dw+=bone.dual.w*w;
 }
 const norm=Math.hypot(rx,ry,rz,rw)||1;
 const q=new T.Quaternion(rx/norm,ry/norm,rz/norm,rw/norm),d=new T.Quaternion(dx/norm,dy/norm,dz/norm,dw/norm).multiply(q.clone().conjugate());
 return point.clone().applyQuaternion(q).add(V(2*d.x,2*d.y,2*d.z));
}

function makeShorts(skin:T.BufferGeometry):{geometry:T.BufferGeometry;bindings:ClothBinding[]}{
 // The clothing pattern is cut from the actual neutralized teaching skin.
 // Every new boundary vertex retains its barycentric attachment to a skin
 // triangle, so the hem and waist follow all poses without a second rig.
 const source=skin.getAttribute('position'),index=skin.index;
 const bindings:ClothBinding[]=[];
 type CutVertex={y:number;weights:[number,number,number]};
 const clip=(input:CutVertex[],height:number,above:boolean)=>{
  const result:CutVertex[]=[];
  for(let i=0;i<input.length;i++){
   const a=input[i],b=input[(i+1)%input.length],aIn=above?a.y>=height:a.y<=height,bIn=above?b.y>=height:b.y<=height;
   if(aIn)result.push(a);
   if(aIn!==bIn){const k=(height-a.y)/(b.y-a.y);result.push({y:height,weights:a.weights.map((v,j)=>v+(b.weights[j]-v)*k) as [number,number,number]})}
  }
  return result;
 };
 for(let i=0;i<(index?.count??source.count);i+=3){
  const ids=[0,1,2].map(j=>index?index.getX(i+j):i+j) as [number,number,number];
  // Some unweighted finger tips share the garment's height range. They are
  // outside the hip/thigh envelope and must not become detached cloth flecks.
  if(ids.some(id=>Math.abs(source.getX(id))>.195))continue;
  if(ids.some(id=>Object.values(bodyWeights[id]??{}).reduce((a,b)=>a+b,0)>.20))continue;
  const polygon=ids.map((id,j)=>({y:source.getY(id),weights:[+(j===0),+(j===1),+(j===2)] as [number,number,number]}));
  if(Math.max(...polygon.map(p=>p.y))<.55||Math.min(...polygon.map(p=>p.y))>1.002)continue;
  const cut=clip(clip(polygon,.55,true),1.002,false);
  for(let j=1;j<cut.length-1;j++)for(const vertex of [cut[0],cut[j],cut[j+1]])bindings.push({ids,weights:vertex.weights});
 }
 const geometry=new T.BufferGeometry();
 geometry.setAttribute('position',new T.Float32BufferAttribute(new Float32Array(bindings.length*3),3));
 geometry.setAttribute('normal',new T.Float32BufferAttribute(new Float32Array(bindings.length*3),3));
 return {geometry,bindings};
}

/** Same atlas skin with deterministic, landmark-driven daily activities.
 * This is a teaching pose, not motion capture or a patient's body prediction.
 * V5Person and V4Measure must never both write the body in one frame. Call
 * resetPose() before handing the geometry to V4Measure or a static anatomy view. */
export class V5Person{
 root=new T.Group();wardrobe=new T.Group();props=new T.Group();diningProps=new T.Group();activityProps=new T.Group();
 anchors:Record<string,T.Vector3>={};metadata:Record<string,unknown>;
 private records:GeometryRecord[]=[];
 private gripHand:T.Mesh;private chair=new T.Group();private chairSupport=new T.Group();private utensil=new T.Group();private bite:T.Mesh;
 private posed=false;private lastKey='';private lastGeometryGuard:number[]=[];
 private adjacency:number[][]=[];private weld:number[][]=[];
 private clothBoundaries=new Set<number>();private clothWeld:number[][]=[];private clothNeighbors:number[][]=[];private clothRest:Float32Array;private clothSkin:T.BufferGeometry;private clothGeometry:T.BufferGeometry;private clothBindings:ClothBinding[]=[];
 constructor(private body:T.Group){
  neutralizeBodyGeometry(body);
  this.root.name='V5 — same atlas person and daily activities';this.root.add(this.wardrobe,this.props);this.props.add(this.diningProps,this.activityProps);this.diningProps.add(this.chair);
  const unique=new Set<T.BufferGeometry>();body.traverse(o=>{if(o instanceof T.Mesh)unique.add(o.geometry)});
  for(const geometry of unique)this.cache(geometry,false);
  const source=[...unique][0],sourceP=source.getAttribute('position'),sourceI=source.index;
  const groups=new Map<string,number[]>();for(let i=0;i<sourceP.count;i++){const key=[sourceP.getX(i),sourceP.getY(i),sourceP.getZ(i)].map(v=>Math.round(v*1e5)).join(',');const list=groups.get(key)??[];list.push(i);groups.set(key,list)}
  this.weld=[...groups.values()];const representative=new Int32Array(sourceP.count);for(const group of this.weld)for(const i of group)representative[i]=group[0];
  const edgeSets=Array.from({length:sourceP.count},()=>new Set<number>());if(sourceI)for(let i=0;i<sourceI.count;i+=3){const ids=[0,1,2].map(j=>representative[sourceI.getX(i+j)]);for(const a of ids)for(const b of ids)if(a!==b)edgeSets[a].add(b)}
  this.adjacency=Array.from({length:sourceP.count},(_,i)=>[...edgeSets[representative[i]]]);
  const shortsMaterial=new T.MeshStandardMaterial({color:'#476c6e',roughness:.88,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
  this.clothSkin=source;this.clothGeometry=createV7Shorts();this.clothBindings=[];this.clothRest=Float32Array.from(this.clothGeometry.getAttribute('position').array);this.cache(this.clothGeometry,true);
  const shorts=new T.Mesh(this.clothGeometry,shortsMaterial);shorts.name='tailored woven shorts with ease and sewn hems';shorts.castShadow=true;shorts.receiveShadow=true;
  // Composite the fitted garment after the skin depth/surface passes (100/101).
  // Its alpha remains continuous when depthWrite retires near full opacity;
  // drawing it first would let the later skin pass cover it in a single frame.
  shorts.renderOrder=102;this.wardrobe.add(shorts);
  const box=(name:string,size:T.Vector3,p:T.Vector3,color:string)=>{const m=new T.Mesh(new RoundedBoxGeometry(size.x,size.y,size.z,3,.007),mat(color,1,.75));m.name=name;m.position.copy(p);m.castShadow=true;m.receiveShadow=true;this.chair.add(m);return m};
  box('dining chair — seat',V(.42,.044,.40),V(0,.314,-.018),'#b7ae9c');
  box('dining chair — back',V(.42,.62,.035),V(0,.645,-.155),'#b7ae9c');
  for(const x of [-.17,.17])for(const z of [-.16,.13])box('dining chair — legs',V(.024,.292,.024),V(x,.146,z),'#87918a');
  // Chair-rise support belongs to sitStand only. It does not alter the meal
  // chair, walking scene or the independent blood-pressure furniture.
  this.chairSupport.name='chair-rise armrests';this.chair.add(this.chairSupport);
  for(const side of [-1,1]){
   this.chairSupport.add(box('chair-rise padded armrest',V(.080,.034,.390),V(side*.245,.604,.050),'#b7ae9c'));
   for(const z of [-.105,.160])this.chairSupport.add(box('chair-rise armrest support',V(.024,.270,.024),V(side*.245,.469,z),'#87918a'));
  }
  // A four-tine dining fork is held under a pronated hand. Its origin is the grip.
  const steel=new T.MeshStandardMaterial({color:'#b4c0ba',metalness:.72,roughness:.26});
  const handle=new T.Mesh(new RoundedBoxGeometry(.009,.003,.125,3,.0015),steel);handle.position.z=-.012;this.utensil.add(handle);
  const neck=new T.Mesh(new RoundedBoxGeometry(.008,.003,.045,3,.001),steel);neck.position.z=-.091;this.utensil.add(neck);
  const head=new T.Mesh(new RoundedBoxGeometry(.024,.0025,.016,3,.001),steel);head.position.z=-.118;this.utensil.add(head);
  for(const x of [-.009,-.003,.003,.009]){const tine=new T.Mesh(new RoundedBoxGeometry(.0026,.0024,.037,3,.001),steel);tine.position.set(x,-.001,-.142);this.utensil.add(tine);}
  this.utensil.name='fork bound to pronated atlas grip';
  let skinMaterial:T.Material|undefined;body.traverse(o=>{if(o instanceof T.Mesh&&!skinMaterial)skinMaterial=(Array.isArray(o.material)?o.material[0]:o.material).clone()});
  this.gripHand=createV7GripHand(skinMaterial??mat('#d6c3b1',1,.63));this.gripHand.renderOrder=101;this.root.add(this.gripHand);
  this.bite=new T.Mesh(new T.SphereGeometry(.009,16,12),new T.MeshStandardMaterial({color:'#e7dfbf',roughness:.87}));this.bite.scale.set(.86,.48,1);this.bite.position.set(0,.004,-.16);this.utensil.add(this.bite);this.diningProps.add(this.utensil);
  this.metadata={units:'metres',identity:'same BodyParts3D body with neutral external appearance and fixed-length poses; wrist-scale connected grip hand during dining',sourceHeight:1.719431,pose:'fixed-bone-length IK, local-axis forearm pronation and pose-first dual-quaternion skinning; topology-constrained harmonic weights; no patient-specific rig',clothing:'continuous shorts with two leg openings; no external genital detail',wardrobeFit:'independent smooth connected hip-and-leg garment in metres; two leg openings, fabric ease and restrained folds; shared fixed-length leg pose and measurement pose; no skin-painted anatomical relief and no body scaling',anatomy:'organ/skeleton coordinates are never scaled or deformed; hide static organs while seated, recover standing pose before anatomy handoff',weightChange:'adiposity 0–1 is a small schematic skin contour change, not kg prediction; no scaling of skeleton/organs or body height',diningTableOffsetY:-.225,diningAction:'seated dorsal-up fork grip; coordinated fixed-length arm IK, forearm pronation, wrist and finger flexion; food pickup and moderate presentation lift above the bowl; a single restrained food pickup and return, with rigid constant-size food fixed to the fork; no fabricated swallow'};
  this.anchors={personTorso:V(0,1.18,0),personActivity:V(0,.88,0),mealMouth:V(0,1.084,.095),mealPerson:V(0,.71,.12),mealBowl:V(.055,.809,.43),mealHand:V(.15,.81,.30),personHip:V(0,.91,0),personFoot:V(.10,.025,.06)};
  this.update({time:0,action:'stand'});
 }
 private cache(geometry:T.BufferGeometry,clothing:boolean){this.records.push({geometry,position:Float32Array.from(geometry.getAttribute('position').array),normal:Float32Array.from(geometry.getAttribute('normal').array),clothing})}
 private alpha(object:T.Object3D,k:number){object.visible=k>0.00001;object.traverse(o=>{if(o instanceof T.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.opacity=k;m.transparent=true;m.depthWrite=k>=.998}}})}
 /** Call after the final skin writer (including measurement pose blending).
  * Fixed triangle attachments preserve both leg openings. Sub-millimetre
  * clearance avoids an artificial shell around flexed thighs and the waist. */
 syncWardrobeToSkin(){
  if(!this.clothBindings.length)return;
  const skinP=this.clothSkin.getAttribute('position'),skinN=this.clothSkin.getAttribute('normal');
  const clothP=this.clothGeometry.getAttribute('position'),clothN=this.clothGeometry.getAttribute('normal');
  const position=V(),normal=V();
  for(let i=0;i<this.clothBindings.length;i++){
   const binding=this.clothBindings[i];position.set(0,0,0);normal.set(0,0,0);
   for(let j=0;j<3;j++){const id=binding.ids[j],weight=binding.weights[j];
    position.x+=skinP.getX(id)*weight;position.y+=skinP.getY(id)*weight;position.z+=skinP.getZ(id)*weight;
    normal.x+=skinN.getX(id)*weight;normal.y+=skinN.getY(id)*weight;normal.z+=skinN.getZ(id)*weight;
   }
   normal.normalize();
   const rest=V();for(let j=0;j<3;j++)rest.addScaledVector(V().fromArray(this.clothRest,binding.ids[j]*3),binding.weights[j]);
   const waist=smooth((rest.y-.93)/.065),hem=1-smooth((rest.y-.55)/.028);
   const fold=.0018*Math.sin(rest.y*92+Math.abs(rest.x)*25)*Math.sin(rest.x*27+rest.z*31);
   // Woven fabric has ease, restrained folds and a raised sewn edge. The
   // ease is measured in millimetres; it never copies the skin as body paint.
   const clearance=.012+.014*(1-waist)+.002*hem+.002*Math.exp(-(((rest.y-.985)/.010)**2))+fold;
   position.addScaledVector(normal,clearance);
   const front=smooth((rest.z-.010)/.055)*(1-smooth((Math.abs(rest.x)-.028)/.05))*smooth((rest.y-.70)/.045)*(1-smooth((rest.y-.92)/.045));
   position.addScaledVector(normal,.020*front);
   clothP.setXYZ(i,position.x,position.y,position.z);clothN.setXYZ(i,normal.x,normal.y,normal.z);
  }
  const buffer=clothP.array as Float32Array,base=Float32Array.from(buffer),next=new Float32Array(buffer.length);
  for(let step=0;step<18;step++){next.set(buffer);for(const group of this.clothWeld){const i=group[0],nb=this.clothNeighbors[i];if(!nb.length||group.some(j=>this.clothBoundaries.has(j)))continue;const p=V().fromArray(buffer,i*3),avg=V();for(const j of nb)avg.add(V().fromArray(buffer,j*3));avg.multiplyScalar(1/nb.length);p.lerp(avg,.35);const n=V().fromBufferAttribute(clothN,i),delta=p.clone().sub(V().fromArray(base,i*3));const d=delta.dot(n);if(d<-.014)p.addScaledVector(n,-.014-d);for(const j of group)p.toArray(next,j*3)}buffer.set(next)}
  clothP.needsUpdate=true;this.clothGeometry.computeVertexNormals();
  for(const group of this.clothWeld){const n=V();for(const i of group)n.add(V().fromBufferAttribute(clothN,i));n.normalize();for(const i of group)clothN.setXYZ(i,n.x,n.y,n.z)}
  clothN.needsUpdate=true;this.clothGeometry.computeBoundingSphere();
 }
 resetPose(){
  if(this.posed)for(const r of this.records){r.geometry.getAttribute('position').array.set(r.position);r.geometry.getAttribute('normal').array.set(r.normal);r.geometry.getAttribute('position').needsUpdate=true;r.geometry.getAttribute('normal').needsUpdate=true;r.geometry.computeBoundingSphere()}
  this.posed=false;this.lastKey='';this.lastGeometryGuard=[];this.diningProps.visible=false;this.activityProps.visible=false;this.gripHand.visible=false;
  this.syncWardrobeToSkin();
 }
 update(state:PersonState){
  const time=state.time,action=state.action??'stand',neutralPoseWeight=clamp(state.anatomyBlend??0),weight=clamp(state.weight??1)*(1-neutralPoseWeight);
  const actions:Partial<Record<PersonAction,number>>=state.actionWeights??(state.previousAction?{[state.previousAction]:1-clamp(state.transition??1),[action]:clamp(state.transition??1)}:{[action]:1});
  const eatWeight=clamp(actions.eat??0)*weight,walkWeight=clamp(actions.walk??0)*weight,sitWeight=clamp(actions.sitStand??0)*weight,resistanceWeight=clamp(actions.resistance??0)*weight;
  const adiposity=clamp(state.adiposity??0)*(1-neutralPoseWeight),measurementWeight=clamp(state.measurementWeight??0)*(1-neutralPoseWeight);
  let seated=state.seatedWeight!==undefined?clamp(state.seatedWeight)*weight:eatWeight+sitWeight*(.5+.5*Math.cos(time*Math.PI/5))+.16*resistanceWeight*(.5+.5*Math.sin(time*Math.PI/2.8));seated=clamp(seated);
  // One quiet pickup follows a fixed grip orientation. No 140-degree fork
  // spin through the palm, no shrinking food and no false swallowing loop.
  const cycle=((time%12)+12)%12/12;
  const lift=smooth((cycle-.12)/.24)*(1-smooth((cycle-.69)/.24));
  const rise=.28*lift;
  const bowl=V(.055,.809,.515),mouth=V(.001,1.080,.137);
  const spoonTip=bowl.clone().add(V(-.018*lift,.105*lift,-.045*lift));
  const spoonDirection=V(-.57,-.10,.815).normalize();
  const grip=spoonTip.clone().addScaledVector(spoonDirection,-.162);
  const handDirection=V(-.30,.35,.887).normalize();
  const restForward=V(.023,-.104,.042).normalize(),restBack=V(0,0,-1).addScaledVector(restForward,restForward.z).normalize();
  const restWidth=new T.Vector3().crossVectors(restForward,restBack).normalize();
  const gripLocal=restForward.clone().multiplyScalar(.065).addScaledVector(restBack,-.031),gripInRest=baseArm(1).w.clone().add(gripLocal);
  const handRotation=new T.Quaternion(),wrist=V();let left!:Rig;
  for(let iteration=0;iteration<8;iteration++){
   handRotation.copy(diningHandRotation(1,handDirection));
   wrist.copy(grip).sub(gripLocal.clone().applyQuaternion(handRotation)).add(V(0,.45,0));
   left=armRig(1,wrist,handDirection,V(.31,-.95,-.08));
   handDirection.copy(left.pw.clone().sub(left.pe).normalize().lerp(spoonDirection,.18).normalize());
  }
  handRotation.copy(diningHandRotation(1,handDirection));
  wrist.copy(grip).sub(gripLocal.clone().applyQuaternion(handRotation)).add(V(0,.45,0));
  left=armRig(1,wrist,handDirection,V(.31,-.95,-.08));
  const right=armRig(-1,V(-.14,1.20,.35),V(.14,-.07,.98));
  left.hand.copy(handRotation);
  right.hand.copy(diningHandRotation(-1,V(.14,-.07,.98)));
  const forearmPronation=diningHandRotation(1,left.pw.clone().sub(left.pe),left.w.clone().sub(left.e)).multiply(left.forearm.clone().invert());
  const rightPronation=diningHandRotation(-1,right.pw.clone().sub(right.pe),right.w.clone().sub(right.e)).multiply(right.forearm.clone().invert());
  // Interpolate the skeleton before skinning. Per-vertex identity blending
  // through a large pronation produced ribbon-like intermediate forearms.
  const leftLocalRoll=left.forearm.clone().invert().multiply(forearmPronation).multiply(left.forearm),rightLocalRoll=right.forearm.clone().invert().multiply(rightPronation).multiply(right.forearm);
  const poseRig=(r:Rig,localRoll:T.Quaternion):Rig=>{
   const upper=new T.Quaternion().slerp(r.upper,eatWeight),forearm=new T.Quaternion().slerp(r.forearm,eatWeight);
   const wristRelative=r.forearm.clone().multiply(localRoll).invert().multiply(r.hand);
   const hand=forearm.clone().multiply(new T.Quaternion().slerp(localRoll,eatWeight)).multiply(new T.Quaternion().slerp(wristRelative,eatWeight));
   const pe=r.e.clone().sub(r.s).applyQuaternion(upper).add(r.s),pw=r.w.clone().sub(r.e).applyQuaternion(forearm).add(pe);
   return {...r,upper,forearm,hand,pe,pw};
  };
  const leftPose=poseRig(left,leftLocalRoll),rightPose=poseRig(right,rightLocalRoll),gripWeight=smooth((eatWeight-.12)/.15);
  const restingGrip=gripInRest.clone();
  const leftUpperDual=dualPose(leftPose.upper,left.s,left.s),leftHandDual=dualPose(leftPose.hand,left.w,leftPose.pw);
  const actualGrip=restingGrip.clone().lerp(grip.clone().add(V(0,.45,0)),eatWeight).add(V(0,-.45*seated,0));
  this.utensil.position.copy(actualGrip);
  // Use the same full palm basis: dorsal points up and fork follows the
  // index-finger direction. The shaft cannot turn independently through it.
  const forkZ=spoonDirection.clone().negate(),forkY=V(0,1,0).addScaledVector(forkZ,-forkZ.y).normalize();
  const forkX=new T.Vector3().crossVectors(forkY,forkZ).normalize();
  this.utensil.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(forkX,forkY,forkZ));
  this.bite.scale.set(.86,.48,1);
  const walk=walkWeight,phase=time*Math.PI*1.12;
  const legs=[1,-1].map(side=>{
   const hip=V(side*.086,.90,-.018),knee=V(side*.083,.49,.005),ankle=V(side*.083,.09,.018);
   const gait=phase+(side===1?0:Math.PI),swing=Math.max(0,Math.sin(gait));
   const ph=hip.clone().add(V(0,-.45*seated-.004*Math.sin(phase)**2*walk,0));
   const pa=ankle.clone().add(V(0,.038*swing*walk,.43*seated+.115*Math.cos(gait)*walk));
   const a=hip.distanceTo(knee),b=knee.distanceTo(ankle),d=pa.clone().sub(ph),l=Math.min(a+b-.0001,d.length());d.normalize();
   const along=(a*a-b*b+l*l)/(2*l),height=Math.sqrt(Math.max(0,a*a-along*along));
   const pole=V(0,0,1).addScaledVector(d,-d.z).normalize();
   const pk=ph.clone().addScaledVector(d,along).addScaledVector(pole,height);
   const q1=new T.Quaternion().setFromUnitVectors(knee.clone().sub(hip).normalize(),pk.clone().sub(ph).normalize());
   const q2=new T.Quaternion().setFromUnitVectors(ankle.clone().sub(knee).normalize(),pa.clone().sub(pk).normalize());
   return {thigh:dualPose(q1,hip,ph),shin:dualPose(q2,knee,pk),foot:dualPose(new T.Quaternion(),ankle,pa),hip:ph,knee:pk,ankle:pa};
  });
  const sitLean=.22*Math.sin(Math.PI*seated)*sitWeight,chairContact=smooth((seated-.42)/.38)*sitWeight;
  const sitPivot=V(0,.90-.45*seated,-.018),sitRotation=new T.Quaternion().setFromAxisAngle(axis,sitLean);
  const chairRigs=[1,-1].map(side=>{
   const r=baseArm(side),world=(p:T.Vector3)=>p.clone().add(V(0,-.45*seated,0)).sub(sitPivot).applyQuaternion(sitRotation).add(sitPivot);
   const ps=world(r.s),restW=world(r.w);
   restW.x+=side*.14*Math.sin(Math.PI*seated)*smooth((.90-seated)/.25);
   const target=restW.lerp(V(side*.245,.641,.087),chairContact);
   target.y+=.065*Math.sin(Math.PI*chairContact);
   const a=r.s.distanceTo(r.e),b=r.e.distanceTo(r.w),dir=target.clone().sub(ps),distance=Math.min(a+b-.0001,Math.max(Math.abs(a-b)+.001,dir.length()));dir.normalize();
   const pole=V(side*.31,-.95,-.08).addScaledVector(dir,-V(side*.31,-.95,-.08).dot(dir)).normalize();
   const along=(a*a-b*b+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,a*a-along*along));
   const pe=ps.clone().addScaledVector(dir,along).addScaledVector(pole,height),pw=ps.clone().addScaledVector(dir,distance);
   const upper=new T.Quaternion().setFromUnitVectors(r.e.clone().sub(r.s).normalize(),pe.clone().sub(ps).normalize());
   const forearm=new T.Quaternion().setFromUnitVectors(r.w.clone().sub(r.e).normalize(),pw.clone().sub(pe).normalize());
   const foreFacing=diningHandRotation(side,pw.clone().sub(pe),r.w.clone().sub(r.e));
   const localRoll=forearm.clone().invert().multiply(foreFacing),wristRelative=foreFacing.clone().invert().multiply(diningHandRotation(side,V(0,-.01,1)));
   const hand=forearm.clone().multiply(new T.Quaternion().slerp(localRoll,chairContact)).multiply(new T.Quaternion().slerp(wristRelative,chairContact));
   // Skin loop applies the common pelvis drop afterward, hence compensate
   // that translation in these transforms while retaining world-space IK.
   const shift=V(0,.45*seated,0),upperDual=dualPose(upper,r.s,ps.clone().add(shift)),handDual=dualPose(hand,r.w,pw.clone().add(shift));
   return {...r,side,ps,pe,pw,upper,forearm,localRoll,hand,upperDual,handDual,target};
  });
  const motionTime=eatWeight+walkWeight+sitWeight+resistanceWeight>0?time:0;
  const key=[motionTime,action,weight,seated,eatWeight,walkWeight,sitWeight,resistanceWeight,adiposity,measurementWeight].join('|');
  const guardIndices=[1,24001,42001,66001],bodyPosition=this.records[0].geometry.getAttribute('position').array;
  const externalPoseWrite=guardIndices.some((index,i)=>bodyPosition[index]!==this.lastGeometryGuard[i]);
  if(this.lastKey!==key||externalPoseWrite){
   for(const record of this.records){
    const p=record.geometry.getAttribute('position');
    for(let i=0;i<p.count;i++){
     const original=V().fromArray(record.position,i*3),result=original.clone();
     const arm=record.clothing?0:clamp(Object.values(bodyWeights[i]??{}).reduce((a,b)=>a+b,0));
     const leg=(1-smooth((original.y-.875)/.065))*(1-arm);
     const clothingLeg=leg;
     if((seated>0||walkWeight>0)&&clothingLeg>0){
      const side=original.x>0?1:-1,r=legs[side===1?0:1];
      const knee=smooth((.54-original.y)/.11),foot=smooth((.19-original.y)/.10);
      const deform=(rig:typeof r)=>dualDeform(original,[[rig.thigh,1-knee],[rig.shin,knee*(1-foot)],[rig.foot,knee*foot]]);
      const legPoint=record.clothing?deform(legs[1]).lerp(deform(legs[0]),smooth((original.x+.045)/.090)):deform(r);
      result.lerp(legPoint.add(V(0,.45*seated,0)),clothingLeg);
     }
     if(eatWeight>0&&!record.clothing){
      const row=bodyWeights[i]??{};
      for(const [tag,r] of [['L',leftPose],['R',rightPose]] as const){
       const up=row['upper'+tag]??0,fore=row['forearm'+tag]??0,handWeight=row['hand'+tag]??0;
       if(tag==='L'){
        const along=clamp(original.clone().sub(r.e).dot(r.w.clone().sub(r.e))/r.e.distanceToSquared(r.w));
        const roll=new T.Quaternion().slerp(leftLocalRoll,smooth((along-.05)/.90)*eatWeight);
        const foreQ=r.forearm.clone().multiply(roll),foreDual=dualPose(foreQ,r.e,r.pe);
        const deformed=dualDeform(original,[[identityDual,1-(up+fore+handWeight)],[leftUpperDual,up],[foreDual,fore],[leftHandDual,handWeight]]);
        
        result.add(deformed.sub(original));
       }else{
        const along=clamp(original.clone().sub(r.e).dot(r.w.clone().sub(r.e))/r.e.distanceToSquared(r.w));
        const roll=new T.Quaternion().slerp(rightLocalRoll,smooth((along-.05)/.90)*eatWeight);
        const foreQ=r.forearm.clone().multiply(roll),foreDual=dualPose(foreQ,r.e,r.pe);
        const deformed=dualDeform(original,[[identityDual,1-(up+fore+handWeight)],[dualPose(r.upper,r.s,r.s),up],[foreDual,fore],[dualPose(r.hand,r.w,r.pw),handWeight]]);
        result.add(deformed.sub(original));
       }
      }
     }
     if(sitWeight>0&&!record.clothing){
      const row=bodyWeights[i]??{};
      for(const r of chairRigs){
       const tag=r.side===1?'L':'R',up=row['upper'+tag]??0,fore=row['forearm'+tag]??0,hand=row['hand'+tag]??0;
       const along=clamp(original.clone().sub(r.e).dot(r.w.clone().sub(r.e))/r.e.distanceToSquared(r.w));
       const q=r.forearm.clone().multiply(new T.Quaternion().slerp(r.localRoll,smooth((along-.05)/.90)*chairContact));
       const foreDual=dualPose(q,r.e,r.pe.clone().add(V(0,.45*seated,0)));
       const deformed=dualDeform(original,[[identityDual,1-(up+fore+hand)],[r.upperDual,up],[foreDual,fore],[r.handDual,hand]]);
       result.addScaledVector(deformed.sub(original),sitWeight);
      }
     }
     if(walk>0){
      const side=original.x>0?1:-1,theta=Math.sin(phase)*side*.19*walk;
      
      if(arm>0&&original.y<1.405){const shoulder=baseArm(side).s,moved=original.clone().sub(shoulder).applyAxisAngle(axis,theta*.66).add(shoulder);result.addScaledVector(moved.sub(original),arm)}
      result.y-=.004*Math.sin(phase)**2*walk*(1-leg);
     }
     // Cloth and skin use the same full hip bend. A reduced cloth bend causes
     // thigh skin to cut through the front panels during sit/stand blends.
     // Rest-pose sections already fit the thigh, so only millimetre clearance
     // is added at the hem and faded out before the waistband.
     if(adiposity>0){const abdomen=smooth((original.y-.87)/.12)*(1-smooth((original.y-1.20)/.15))*(1-smooth((Math.abs(original.x)-.16)/.04));
      result.x+=Math.sign(original.x)*.026*smooth(Math.abs(original.x)/.08)*abdomen*adiposity;
      result.z+=.037*smooth((original.z+.016)/.10)*abdomen*adiposity;
      if(record.clothing){
       // Match the modest schematic abdomen change used by the skin.  This
       // prevents a visible gap opening at the waistband while the story
       // animates weight feedback; the garment never scales the skeleton.
       const waistband=smooth((original.y-.70)/.22);
       result.x+=Math.sign(original.x)*.006*waistband*adiposity;
       result.z+=.008*waistband*adiposity;
      }
     }
     if(!record.clothing){const hand=(bodyWeights[i]?.handL??0)*smooth((.905-original.y)/.025)*gripWeight;result.lerp(leftPose.pw,hand);}
     result.y-=.45*seated;
     if(sitWeight>0){
      // The trunk first shifts over the planted feet, then unfolds upright.
      // A modest hip hinge avoids a mechanically vertical chair lift.
      const leaned=result.clone().sub(sitPivot).applyQuaternion(sitRotation).add(sitPivot);
      result.lerp(leaned,smooth((original.y-.87)/.10)*(1-arm));
     }
     if(record.clothing&&measurementWeight>0){
      // Measurement owns the body's pose and furniture. Match its hip/knee
      // map for the garment only, including the 45 cm seated pelvis drop.
      // Do not add this to seatedWeight: that would move the skin twice and
      // bring in a second dining chair. No adiposity is added to Measure skin.
      const measured=original.clone(),measurementLeg=1-smooth((original.y-.875)/.065);
      const thigh=V(original.x,.915+original.z,.885-original.y),shin=V(original.x,original.y+.45,original.z+.45);
      thigh.lerp(shin,smooth((.50-original.y)/.10));measured.lerp(thigh,measurementLeg);measured.y-=.45;
      // Apply the same hem lift/forward clearance used by the meal pose.  The
      // measurement scene cross-fades from the current body pose, so keeping
      // one cloth correction here prevents a one-frame trouser jump at entry.
      const hem=1-smooth((original.y-.735)/.125),legSide=Math.sign(original.x)||1;
      const sideSeparation=smooth((Math.abs(original.x)-.010)/.060)*hem;
      measured.y+=.003*hem;
      measured.z+=.002*hem;
      measured.x+=legSide*.001*sideSeparation;
      measured.x*=1+.003*hem;
      result.lerp(measured,measurementWeight);
     }
     result.toArray(p.array as Float32Array,i*3);
    }
    if(eatWeight+sitWeight>0&&!record.clothing){
     const temp=new Float32Array(p.array.length);
     for(let iteration=0;iteration<28;iteration++){
      temp.set(p.array);for(const group of this.weld){const i=group[0],y=record.position[i*3+1],row=bodyWeights[i]??{},influence=Object.values(row).reduce((a,b)=>a+b,0);
       const shoulder=smooth((y-1.19)/.09)*(1-smooth((y-1.39)/.07));const elbow=smooth((y-1.015)/.035)*(1-smooth((y-1.135)/.035));
       const wrist=smooth((y-.858)/.035)*(1-smooth((y-.969)/.035));
       const armSurface=smooth((y-.855)/.035)*(1-smooth((y-1.425)/.060));
       const strength=Math.max(shoulder,elbow,wrist,armSurface*.82)*smooth(influence/.12)*.52*Math.max(eatWeight,sitWeight);if(strength<.001)continue;const neighbors=this.adjacency[i];if(!neighbors.length)continue;
       for(let axis=0;axis<3;axis++){let average=0;for(const j of neighbors)average+=p.array[j*3+axis];const next=p.array[i*3+axis]+(average/neighbors.length-p.array[i*3+axis])*strength;for(const j of group)temp[j*3+axis]=next}
      }p.array.set(temp);
     }
    }
    p.needsUpdate=true;record.geometry.computeVertexNormals();
    if(!record.clothing){const normals=record.geometry.getAttribute('normal');for(const group of this.weld){const sum=V();for(const i of group)sum.add(V().fromBufferAttribute(normals,i));sum.normalize();for(const i of group)normals.setXYZ(i,sum.x,sum.y,sum.z)}normals.needsUpdate=true}
    record.geometry.computeBoundingSphere();
   }
   this.lastKey=key;this.lastGeometryGuard=guardIndices.map(i=>this.records[0].geometry.getAttribute('position').array[i]);this.posed=eatWeight+walkWeight+sitWeight+resistanceWeight+adiposity>0||seated>0||measurementWeight>0;
  }
  const gripFrame=new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(restWidth,restForward,restBack));
  this.gripHand.quaternion.copy(leftPose.hand).multiply(gripFrame);
  this.gripHand.position.copy(leftPose.pw).add(V(0,-.45*seated,0));
  const boundGrip=V(0,.065,-.031).applyQuaternion(this.gripHand.quaternion).add(this.gripHand.position);
  actualGrip.copy(boundGrip);this.utensil.position.copy(actualGrip);
  this.utensil.quaternion.premultiply(left.hand.clone().invert()).premultiply(leftPose.hand);
  const propsOpacity=clamp(state.propsOpacity??(state.opacity??1))*(1-measurementWeight);
  this.alpha(this.diningProps,propsOpacity*Math.min(1,eatWeight+sitWeight));
  // Retire the dining utensil before measurement begins to move the hand.
  // The final measurement writer owns the arm; an unbound spoon must not
  // continue using the earlier dining grip while that hand travels away.
  const utensilHandoff=1-smooth(measurementWeight/.06);
  this.alpha(this.gripHand,propsOpacity*gripWeight*utensilHandoff);
  this.alpha(this.utensil,propsOpacity*gripWeight*utensilHandoff);this.chair.position.z=-.21*(1-seated)*(1-sitWeight);
  this.alpha(this.chairSupport,propsOpacity*sitWeight);
  this.alpha(this.wardrobe,clamp(state.wardrobeOpacity??state.opacity??1));
  this.alpha(this.activityProps,0);
  this.anchors.mealHand.copy(actualGrip);this.anchors.mealMouth.set(0,1.534-.45*seated,.095);this.anchors.personTorso.set(0,1.18-.45*seated,0);this.anchors.personActivity.set(0,.88-.45*seated,.03);
  this.root.userData={...this.metadata,action,time,seated,measurementWeight,neutralPoseWeight,poseResidual:Math.max(eatWeight,walkWeight,sitWeight,resistanceWeight,seated,measurementWeight,adiposity),actionWeights:actions,adiposity,chairSupport:{weight:chairContact,armrestTop:.621,wrists:chairRigs.map(r=>r.pw.toArray()),targets:chairRigs.map(r=>r.target.toArray()),upperLengths:chairRigs.map(r=>r.ps.distanceTo(r.pe)),forearmLengths:chairRigs.map(r=>r.pe.distanceTo(r.pw))},upperArmLength:left.s.distanceTo(left.pe),posedElbow:left.pe.toArray(),posedWrist:left.pw.toArray(),grip:actualGrip.toArray(),handDorsal:V(0,0,-1).applyQuaternion(left.hand).toArray(),wristDeflectionDegrees:T.MathUtils.radToDeg(Math.acos(T.MathUtils.clamp(left.pw.clone().sub(left.pe).normalize().dot(handDirection),-1,1))),forearmLength:left.pe.distanceTo(left.pw),spoonTip:spoonTip.toArray(),mouth:mouth.toArray()};
  this.syncWardrobeToSkin();
 }
}

