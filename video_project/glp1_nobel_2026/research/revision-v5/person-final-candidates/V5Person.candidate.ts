import * as T from 'three';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import {V, smooth, mat} from './visual';
import rawWeights from './V5PersonWeights.json';
const bodyWeights=rawWeights.weights as Record<string,number>[];

export type PersonAction='stand'|'eat'|'walk'|'sitStand'|'resistance';
export type PersonState={time:number;action?:PersonAction;previousAction?:PersonAction;transition?:number;actionWeights?:Partial<Record<PersonAction,number>>;adiposity?:number;weight?:number;seatedWeight?:number;measurementWeight?:number;opacity?:number;propsOpacity?:number;wardrobeOpacity?:number;mealOffsetY?:number};
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

function armRig(side:number,target:T.Vector3,handDirection:T.Vector3):Rig{
 const {s,e,w}=baseArm(side),a=s.distanceTo(e),b=e.distanceTo(w);
 const d=target.clone().sub(s),length=Math.min(a+b-.004,Math.max(Math.abs(a-b)+.003,d.length()));d.normalize();
 const along=(a*a-b*b+length*length)/(2*length),height=Math.sqrt(Math.max(0,a*a-along*along));
 const pole=V(side*.31,-.95,-.08);pole.addScaledVector(d,-pole.dot(d)).normalize();
 const pe=s.clone().addScaledVector(d,along).addScaledVector(pole,height),pw=s.clone().addScaledVector(d,length);
 return {s,e,w,pe,pw,
  upper:new T.Quaternion().setFromUnitVectors(e.clone().sub(s).normalize(),pe.clone().sub(s).normalize()),
  forearm:new T.Quaternion().setFromUnitVectors(w.clone().sub(e).normalize(),pw.clone().sub(pe).normalize()),
  hand:new T.Quaternion().setFromUnitVectors(V(side*.023,-.104,.042).normalize(),handDirection.clone().normalize())};
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
 private chair=new T.Group();private utensil=new T.Group();private bite:T.Mesh;
 private posed=false;private lastKey='';private lastGeometryGuard:number[]=[];
 private adjacency:number[][]=[];private weld:number[][]=[];
 private clothSkin:T.BufferGeometry;private clothGeometry:T.BufferGeometry;private clothBindings:ClothBinding[]=[];
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
  const fitted=makeShorts(source);this.clothSkin=source;this.clothGeometry=fitted.geometry;this.clothBindings=fitted.bindings;
  const shorts=new T.Mesh(this.clothGeometry,shortsMaterial);shorts.name='skin-attached tailored teaching shorts';shorts.castShadow=true;shorts.receiveShadow=true;this.wardrobe.add(shorts);
  const box=(name:string,size:T.Vector3,p:T.Vector3,color:string)=>{const m=new T.Mesh(new RoundedBoxGeometry(size.x,size.y,size.z,3,.007),mat(color,1,.75));m.name=name;m.position.copy(p);m.castShadow=true;m.receiveShadow=true;this.chair.add(m);return m};
  box('dining chair — seat',V(.42,.044,.40),V(0,.314,-.018),'#b7ae9c');
  box('dining chair — back',V(.42,.62,.035),V(0,.645,-.155),'#b7ae9c');
  for(const x of [-.17,.17])for(const z of [-.16,.13])box('dining chair — legs',V(.024,.292,.024),V(x,.146,z),'#87918a');
  // Utensil stem extends from the fingertips toward its concave bowl.
  const steel=new T.MeshStandardMaterial({color:'#b4c0ba',metalness:.72,roughness:.26});
  const handle=new T.Mesh(new RoundedBoxGeometry(.009,.003,.145,3,.0015),steel);handle.position.z=-.072;this.utensil.add(handle);
  const scoop=new T.Mesh(new T.SphereGeometry(.015,32,16,0,Math.PI*2,0,Math.PI/2),steel);scoop.scale.set(.80,.22,1.4);scoop.rotation.x=Math.PI;scoop.position.z=-.163;this.utensil.add(scoop);
  this.bite=new T.Mesh(new T.SphereGeometry(.009,16,12),new T.MeshStandardMaterial({color:'#e7dfbf',roughness:.87}));this.bite.scale.set(.86,.48,1);this.bite.position.set(0,.004,-.16);this.utensil.add(this.bite);this.diningProps.add(this.utensil);
  this.metadata={units:'metres',identity:'same BodyParts3D skin mesh, modified only for neutral external appearance and poses',sourceHeight:1.719431,pose:'fixed-bone-length IK with topology-constrained harmonic weights; Blender bone-heat calculation refined after preview; no patient-specific rig',clothing:'continuous shorts with two leg openings; no external genital detail',wardrobeFit:'shorts cut from neutralized atlas skin triangles between 0.55 and 1.002 m, ending above the knee; barycentric attachment follows the final posed skin with 0.3 mm normal clearance and polygon depth bias; same garment through meal, exercise and measurement; no body or skeleton scaling',anatomy:'organ/skeleton coordinates are never scaled or deformed; hide static organs while seated, recover standing pose before anatomy handoff',weightChange:'adiposity 0–1 is a small schematic skin contour change, not kg prediction; no scaling of skeleton/organs or body height',diningTableOffsetY:-.225,diningAction:'seated natural spoon-to-food contact and small scoop; no fabricated swallow'};
  this.anchors={personTorso:V(0,1.18,0),personActivity:V(0,.88,0),mealMouth:V(0,1.084,.095),mealPerson:V(0,.71,.12),mealBowl:V(.055,.809,.43),mealHand:V(.15,.81,.30),personHip:V(0,.91,0),personFoot:V(.10,.025,.06)};
  this.update({time:0,action:'stand'});
 }
 private cache(geometry:T.BufferGeometry,clothing:boolean){this.records.push({geometry,position:Float32Array.from(geometry.getAttribute('position').array),normal:Float32Array.from(geometry.getAttribute('normal').array),clothing})}
 private alpha(object:T.Object3D,k:number){object.visible=k>0.00001;object.traverse(o=>{if(o instanceof T.Mesh){for(const m of Array.isArray(o.material)?o.material:[o.material]){m.opacity=k;m.transparent=true;m.depthWrite=k>=.998}}})}
 /** Call after the final skin writer (including measurement pose blending).
  * Fixed triangle attachments preserve both leg openings. Sub-millimetre
  * clearance avoids an artificial shell around flexed thighs and the waist. */
 syncWardrobeToSkin(){
  const skinP=this.clothSkin.getAttribute('position'),skinN=this.clothSkin.getAttribute('normal');
  const clothP=this.clothGeometry.getAttribute('position'),clothN=this.clothGeometry.getAttribute('normal');
  const position=V(),normal=V();
  for(let i=0;i<this.clothBindings.length;i++){
   const binding=this.clothBindings[i];position.set(0,0,0);normal.set(0,0,0);
   for(let j=0;j<3;j++){const id=binding.ids[j],weight=binding.weights[j];
    position.x+=skinP.getX(id)*weight;position.y+=skinP.getY(id)*weight;position.z+=skinP.getZ(id)*weight;
    normal.x+=skinN.getX(id)*weight;normal.y+=skinN.getY(id)*weight;normal.z+=skinN.getZ(id)*weight;
   }
   normal.normalize();position.addScaledVector(normal,.0003);
   clothP.setXYZ(i,position.x,position.y,position.z);clothN.setXYZ(i,normal.x,normal.y,normal.z);
  }
  clothP.needsUpdate=true;clothN.needsUpdate=true;this.clothGeometry.computeBoundingSphere();
 }
 resetPose(){
  if(this.posed)for(const r of this.records){r.geometry.getAttribute('position').array.set(r.position);r.geometry.getAttribute('normal').array.set(r.normal);r.geometry.getAttribute('position').needsUpdate=true;r.geometry.getAttribute('normal').needsUpdate=true;r.geometry.computeBoundingSphere()}
  this.posed=false;this.lastKey='';this.lastGeometryGuard=[];this.diningProps.visible=false;this.activityProps.visible=false;
  this.syncWardrobeToSkin();
 }
 update(state:PersonState){
  const time=state.time,action=state.action??'stand',weight=clamp(state.weight??1);
  const actions:Partial<Record<PersonAction,number>>=state.actionWeights??(state.previousAction?{[state.previousAction]:1-clamp(state.transition??1),[action]:clamp(state.transition??1)}:{[action]:1});
  const eatWeight=clamp(actions.eat??0)*weight,walkWeight=clamp(actions.walk??0)*weight,sitWeight=clamp(actions.sitStand??0)*weight,resistanceWeight=clamp(actions.resistance??0)*weight;
  const adiposity=clamp(state.adiposity??0),measurementWeight=clamp(state.measurementWeight??0);
  let seated=state.seatedWeight!==undefined?clamp(state.seatedWeight)*weight:eatWeight+sitWeight*(.5+.5*Math.cos(time*Math.PI/5))+.16*resistanceWeight*(.5+.5*Math.sin(time*Math.PI/2.8));seated=clamp(seated);
  const cycle=((time%9.6)+9.6)%9.6/9.6;
  const rise=.18*smooth((cycle-.21)/.27)*(1-smooth((cycle-.62)/.28));
  const bowl=V(.055,.809,.43),mouth=V(.001,1.084,.095);
  const spoonTip=bowl.clone().lerp(mouth,rise);spoonTip.x+=Math.sin(rise*Math.PI)*.045;spoonTip.z+=Math.sin(rise*Math.PI)*.058;
  const spoonDirection=V(-.19,-.15,.96).lerp(V(-.34,.22,.91),rise).normalize();
  // Wrist → palm → utensil handle → bowl: all lengths stay in metres.
  const grip=spoonTip.clone().addScaledVector(spoonDirection,-.162);
  const handDirection=V(-.20,-.08,.98).lerp(V(-.30,.06,.95),rise).normalize();
  const wrist=grip.clone().addScaledVector(handDirection,-.074).add(V(0,.45,0));
  const left=armRig(1,wrist,handDirection),right=armRig(-1,V(-.14,1.20,.35),V(.14,-.07,.98));
  const restingGrip=baseArm(1).w.clone().addScaledVector(V(.023,-.104,.042).normalize(),.074);
  const actualGrip=restingGrip.clone().lerp(grip.clone().add(V(0,.45,0)),eatWeight).add(V(0,-.45*seated,0));
  this.utensil.position.copy(actualGrip);this.utensil.quaternion.identity().slerp(new T.Quaternion().setFromUnitVectors(V(0,0,-1),spoonDirection),eatWeight);
  this.bite.scale.setScalar((1-smooth((cycle-.84)/.055))*smooth((cycle-.19)/.06));this.bite.scale.multiply(V(.86,.48,1));
  const walk=walkWeight,phase=time*Math.PI*1.12;
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
     if(seated>0&&clothingLeg>0){
      const thigh=V(original.x,.915+original.z,.885-original.y),shin=V(original.x,original.y+.45,original.z+.45);
      thigh.lerp(shin,smooth((.50-original.y)/.10));result.lerp(thigh,clothingLeg*seated);
     }
     if(eatWeight>0&&!record.clothing){
      const row=bodyWeights[i]??{};
      for(const [tag,r] of [['L',left],['R',right]] as const){
       const up=row['upper'+tag]??0,fore=row['forearm'+tag]??0,handWeight=row['hand'+tag]??0;
       if(up>0)result.addScaledVector(original.clone().sub(r.s).applyQuaternion(r.upper).add(r.s).sub(original),up*eatWeight);
       if(fore>0)result.addScaledVector(original.clone().sub(r.e).applyQuaternion(r.forearm).add(r.pe).sub(original),fore*eatWeight);
       if(handWeight>0)result.addScaledVector(original.clone().sub(r.w).applyQuaternion(r.hand).add(r.pw).sub(original),handWeight*eatWeight);
      }
     }
     if(walk>0){
      const side=original.x>0?1:-1,theta=Math.sin(phase)*side*.19*walk;
      if(leg>0){const hip=V(side*.086,.90,-.018),moved=original.clone().sub(hip).applyAxisAngle(axis,-theta).add(hip);result.addScaledVector(moved.sub(original),leg)}
      if(arm>0&&original.y<1.405){const shoulder=baseArm(side).s,moved=original.clone().sub(shoulder).applyAxisAngle(axis,theta*.66).add(shoulder);result.addScaledVector(moved.sub(original),arm)}
      result.y+=.014*Math.abs(Math.sin(phase))*walk;
     }
     // Cloth and skin use the same full hip bend. A reduced cloth bend causes
     // thigh skin to cut through the front panels during sit/stand blends.
     // Rest-pose sections already fit the thigh, so only millimetre clearance
     // is added at the hem and faded out before the waistband.
     if(record.clothing&&seated>0){
      const hem=1-smooth((original.y-.735)/.125);
      const legSide=Math.sign(original.x)||1;
      const sideSeparation=smooth((Math.abs(original.x)-.010)/.060)*hem;
      result.y+=.003*hem*seated;
      // Small anterior allowance preserves clearance during intermediate poses.
      result.z+=.002*hem*seated;
      result.x+=legSide*.001*sideSeparation*seated;
      // Keep the two leg openings close to the corresponding thighs during
      // the sit-down interpolation; the waistband remains centred on the
      // pelvis and therefore never shears across the abdomen.
      result.x*=1+.003*hem*seated;
     }
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
     result.y-=.45*seated;
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
    if(eatWeight>0&&!record.clothing){
     const temp=new Float32Array(p.array.length);
     for(let iteration=0;iteration<14;iteration++){
      temp.set(p.array);for(const group of this.weld){const i=group[0],y=record.position[i*3+1],row=bodyWeights[i]??{},influence=Object.values(row).reduce((a,b)=>a+b,0);
       const shoulder=smooth((y-1.19)/.09)*(1-smooth((y-1.39)/.07));const elbow=smooth((y-1.015)/.035)*(1-smooth((y-1.135)/.035));
       const strength=Math.max(shoulder,elbow)*smooth(influence/.25)*.52*eatWeight;if(strength<.001)continue;const neighbors=this.adjacency[i];if(!neighbors.length)continue;
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
  const propsOpacity=clamp(state.propsOpacity??(state.opacity??1))*(1-measurementWeight);
  this.alpha(this.diningProps,propsOpacity*Math.min(1,eatWeight+sitWeight));
  // Retire the dining utensil before measurement begins to move the hand.
  // The final measurement writer owns the arm; an unbound spoon must not
  // continue using the earlier dining grip while that hand travels away.
  const utensilHandoff=1-smooth(measurementWeight/.06);
  this.alpha(this.utensil,propsOpacity*eatWeight*utensilHandoff);this.chair.position.z=-.21*(1-seated);
  this.alpha(this.wardrobe,clamp(state.wardrobeOpacity??state.opacity??1));
  this.alpha(this.activityProps,0);
  this.anchors.mealHand.copy(actualGrip);this.anchors.mealMouth.set(0,1.534-.45*seated,.095);this.anchors.personTorso.set(0,1.18-.45*seated,0);this.anchors.personActivity.set(0,.88-.45*seated,.03);
  this.root.userData={...this.metadata,action,time,seated,measurementWeight,actionWeights:actions,adiposity,upperArmLength:left.s.distanceTo(left.pe),forearmLength:left.pe.distanceTo(left.pw),spoonTip:spoonTip.toArray(),mouth:mouth.toArray()};
  this.syncWardrobeToSkin();
 }
}

