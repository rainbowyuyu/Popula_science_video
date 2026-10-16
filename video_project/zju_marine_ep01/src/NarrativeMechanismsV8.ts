import * as T from 'three';
import story from './story.json';

/** World-space explanatory cues, authored from geometry rather than a claimed
 * CFD/FE response. Metres, Y up; all animation is a pure function of film time. */
const V=(x:number,y:number,z:number)=>new T.Vector3(x,y,z);
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const S=(a:number,b:number,x:number)=>{const u=clamp((x-a)/(b-a));return u*u*(3-2*u);};
type Window={start:number;end:number};
const chapters=(story.scenes as {chapter:string;start:number;end:number}[]);
function windowFor(id:string,chapter:string,fallback:[number,number]):Window{
 const sentence=(story.sentences as {id:string;chapter:string;start?:number;end?:number}[]).find(x=>x.id===id&&x.chapter===chapter);
 if(sentence&&Number.isFinite(sentence.start)&&Number.isFinite(sentence.end))return {start:sentence.start!,end:sentence.end!};
 const ch=chapters.find(x=>x.chapter===chapter)!;
 return {start:ch.start+(ch.end-ch.start)*fallback[0],end:ch.start+(ch.end-ch.start)*fallback[1]};
}
const alpha=(w:Window,t:number,r=.7)=>S(w.start,w.start+r,t)*(1-S(w.end-r,w.end,t));
const phase=(w:Window,t:number)=>clamp((t-w.start)/(w.end-w.start));
const paint=(color:string)=>new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.18,roughness:.34,metalness:.18,transparent:true,opacity:0,depthWrite:false});
const tint=(root:T.Object3D,a:number)=>root.traverse(o=>{const m=(o as T.Mesh).material;if(m)for(const x of Array.isArray(m)?m:[m])x.opacity=a*(x.userData.maxOpacity??1);});
function tube(parent:T.Object3D,name:string,curve:T.Curve<T.Vector3>,radius:number,material:T.Material,segments=64){
 const m=new T.Mesh(new T.TubeGeometry(curve,segments,radius,8,false),material);m.name=name;parent.add(m);return m;
}
function arrow(parent:T.Object3D,name:string,a:T.Vector3,b:T.Vector3,width:number,material:T.Material){
 const g=new T.Group();g.name=name;parent.add(g);g.position.copy(a);
 const d=b.clone().sub(a),length=d.length();g.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());
 const head=Math.min(width*4,length*.28);
 const shaft=new T.Mesh(new T.CylinderGeometry(width*.28,width*.28,length-head,12),material);shaft.position.y=(length-head)/2;g.add(shaft);
 const tip=new T.Mesh(new T.ConeGeometry(width,head,16),material);tip.position.y=length-head/2;g.add(tip);
 return g;
}
function pulsePath(parent:T.Object3D,name:string,points:T.Vector3[],radius:number,color:string){
 const group=new T.Group();group.name=name;parent.add(group);
 const curve=new T.CatmullRomCurve3(points,false,'centripetal');
 const material=paint(color);material.userData.maxOpacity=.42;tube(group,name+'_Path',curve,radius,material,44);
 const moving=arrow(group,name+'_Travel',V(0,0,0),V(0,3,0),radius*3,paint(color));
 return {group,update(t:number,a:number,speed=.13){tint(group,a);const u=((t*speed)%1+1)%1;moving.position.copy(curve.getPointAt(u));moving.quaternion.setFromUnitVectors(V(0,1,0),curve.getTangentAt(u));moving.scale.setScalar(.8+.2*Math.sin(Math.PI*u));}};
}

export function createNarrativeMechanismsV8(scene:T.Scene,model:T.Group,floatingGroup:T.Group){
 const root=new T.Group();root.name='NarrativeMechanismsV8';scene.add(root);
 root.userData={purpose:'Explanatory force paths and section geometry; not solver output',units:'m',time:'absolute seconds'};
 const loadWindow=windowFor('o02','overview',[.17,.35]);
 // Legacy V7 used o03 in hook; fall back to the float camera interval until the
 // measured V8 story is installed, never pick that unrelated hook cue.
 const floatWindow=windowFor('o03','overview',[.35,.58]);
 const couplingWindow=windowFor('o04','overview',[.58,.72]);
 const torqueWindow=windowFor('g02','generator',[.34,.72]);
 const cableWindow=windowFor('k01','cable',[0,.53]);
 const sensorWindow=windowFor('k02','cable',[.53,1]);
 const pressureWindow=windowFor('w01','wind',[0,.30]);
 const leverWindow=windowFor('w02','wind',[.30,.60]);
 const bladeSensorWindow=windowFor('w03','wind',[.60,.85]);

 // Sample actual exported blade vertices and normals. These marks are children
 // of the blade meshes, so rigid rotation and per-blade pitch cannot detach them.
 // Colours indicate a pressure-side/suction-side comparison, never computed Cp.
 const rotor=model.getObjectByName('RotorAssembly');
 const bladeOverlays:T.Group[]=[];
 type BladeCue={blade:T.Mesh;pressure:T.Group;sensors:T.Group;force:T.Group;lever:T.Mesh;anchor:T.Vector3;surfaceNormal:T.Vector3;halos:T.Mesh[]};
 const bladeCues:BladeCue[]=[];
 if(rotor){
  model.updateWorldMatrix(true,true);
  const inverseRotor=rotor.matrixWorld.clone().invert();
  for(let bi=1;bi<=3;bi++){
   const blade=model.getObjectByName('Blade_'+bi) as T.Mesh|undefined;if(!blade?.isMesh)continue;
   const positions=blade.geometry.attributes.position,normals=blade.geometry.attributes.normal;
   const toRotor=inverseRotor.clone().multiply(blade.matrixWorld),toRotorNormal=new T.Matrix3().getNormalMatrix(toRotor);
   const samples:{position:T.Vector3;normal:T.Vector3;radial:number;side:number;tangential:number}[]=[];
   for(let i=0;i<positions.count;i++){
    const p=new T.Vector3().fromBufferAttribute(positions,i),n=new T.Vector3().fromBufferAttribute(normals,i).normalize(),r=p.clone().applyMatrix4(toRotor),rn=n.clone().applyMatrix3(toRotorNormal).normalize(),radial=Math.hypot(r.y,r.z);
    const dir=V(0,r.y,r.z).normalize(),tangent=new T.Vector3().crossVectors(V(1,0,0),dir);
    samples.push({position:p,normal:n,radial,side:rn.x,tangential:r.dot(tangent)});
   }
   const sample=(radius:number,side=1)=>samples.reduce((best,p)=>{
    const score=(x:typeof p)=>Math.abs(x.radial-radius)*2+Math.max(0,.65-x.side*side)*7;
    return score(p)<score(best)?p:best;
   });
   const pressure=new T.Group();pressure.name='BladePressureDifference_'+bi;blade.add(pressure);bladeOverlays.push(pressure);
   for(const side of [-1,1])for(const radius of [35,43,51,59,67]){
    const s=sample(radius,side),material=paint(side>0?'#e7b963':'#69c7c0');
    const dot=new T.Mesh(new T.SphereGeometry(side>0?1.12:.86,12,8),material);dot.name=side>0?'PressureSideMarker':'SuctionSideMarker';dot.position.copy(s.position).addScaledVector(s.normal,.80);pressure.add(dot);
    // Short real surface-normal ticks make the distinction visible without a
    // floating rectangular heatmap or an invented numerical pressure scale.
    const tick=arrow(pressure,'SurfacePressureTick',s.position.clone().addScaledVector(s.normal,side>0?5.4:4.1),s.position.clone().addScaledVector(s.normal,1),.48,material);tick.userData.pressureIllustration=true;
   }
   const anchorSample=sample(57,1),sensors=new T.Group();sensors.name='BladeDeformationSensors_'+bi;blade.add(sensors);bladeOverlays.push(sensors);const halos:T.Mesh[]=[];
   for(const [si,radius] of [18,58,102].entries()){
    const s=sample(radius,1),m=paint('#73c8be');const dot=new T.Mesh(new T.SphereGeometry(.74,12,8),m);dot.name=['BladeRootSensor','BladeMiddleSensor','BladeTipSensor'][si];dot.position.copy(s.position).addScaledVector(s.normal,.45);sensors.add(dot);
    const halo=new T.Mesh(new T.TorusGeometry(1.45,.095,7,28),m);halo.position.copy(dot.position);halo.quaternion.setFromUnitVectors(V(0,0,1),s.normal);halo.name=dot.name+'_Halo';sensors.add(halo);halos.push(halo);
   }
   const force=arrow(root,'BladeTangentialForce_'+bi,V(0,0,0),V(0,14,0),.85,paint('#e7b963'));
   const leverMat=paint('#9dd5ce');leverMat.userData.maxOpacity=.6;
   const lever=new T.Mesh(new T.CylinderGeometry(.12,.12,1,10),leverMat);lever.name='BladeMomentArm_'+bi;root.add(lever);
   bladeCues.push({blade,pressure,sensors,force,lever,anchor:anchorSample.position.clone(),surfaceNormal:anchorSample.normal.clone(),halos});
  }
 }

 // Same centre-lines and mudline as createJacketFoundation. Warm travelling
 // arrows mark load transfer; cool upward arrows mark soil reaction on piles.
 const jacket=new T.Group();jacket.name='JacketToPileLoadPath';root.add(jacket);
 const spread=(y:number)=>7+(10.6-7)*(10-y)/55;
 const paths:ReturnType<typeof pulsePath>[]=[];
 for(const side of [-1,1]){
  const p=(y:number)=>V(side*spread(y),y,spread(y)+1.03);
  paths.push(pulsePath(jacket,'LoadToFrontLeg_'+side,[V(side*3.6,12.4,4.63),p(10),p(-12),p(-29),p(-44.5),V(side*10.6,-53,11.63)],.15,'#e9b85d'));
  arrow(jacket,'SoilReaction_'+side,V(side*13.7,-52,14.1),V(side*13.7,-43,14.1),.65,paint('#64c8bd'));
  // Discrete surrounding soil particles grow into a shallow foundation halo,
  // no ring or heat colour is presented as a calculated stress magnitude.
  for(let i=0;i<9;i++){
   const theta=i*Math.PI*2/9;const m=paint('#70b8a5');m.userData.maxOpacity=.33;
   const q=new T.Mesh(new T.SphereGeometry(.42,10,7),m);q.name='SoilLoadDistributionMarker';q.position.set(side*10.6+Math.cos(theta)*4.3,-44.5,10.6+Math.sin(theta)*4.3);jacket.add(q);
  }
 }

 // Position follows the actual semisub transform; force vectors retain world
 // vertical even when the platform heels. Offset the graphics towards its
 // centre so hulls do not hide the force arrow shaft behind solid steel.
 const floatForces=new T.Group();floatForces.name='SemisubBuoyancyWeightMooring';root.add(floatForces);
 const buoyancy:T.Group[]=[];const buoyancyLocal:T.Vector3[]=[];const tensions:ReturnType<typeof pulsePath>[]=[];
 for(let i=0;i<3;i++){
  const a=i*2*Math.PI/3;
  const p=V(Math.cos(a)*42.7,-13,Math.sin(a)*42.7);buoyancyLocal.push(p);
  buoyancy.push(arrow(floatForces,'BuoyancyUp_'+i,V(0,0,0),V(0,25,0),1.4,paint('#69c8bf')));
  const fairlead=V(Math.cos(a)*58.05,-8,Math.sin(a)*58.05);
  const mooring=new T.CatmullRomCurve3([fairlead,V(Math.cos(a)*87.975,-39,Math.sin(a)*87.975),V(Math.cos(a)*150.075,-68,Math.sin(a)*150.075),V(Math.cos(a)*196.65,-70,Math.sin(a)*196.65)]);
  const g=new T.Group();g.name='MooringTensionLocal_'+i;floatingGroup.add(g);
  tensions.push(pulsePath(g,'TensionTowardsAnchor_'+i,Array.from({length:16},(_,j)=>mooring.getPoint(j/15*.28)),.18,'#85c7c1'));
 }
 const weight=arrow(floatForces,'WeightDown',V(0,0,0),V(0,-24,0),1.8,paint('#e6ae60'));
 const ballastMarks=new T.Group();ballastMarks.name='BallastLowInColumns';floatingGroup.add(ballastMarks);
 for(let i=0;i<3;i++){
  const a=i*2*Math.PI/3,m=paint('#6ec0b9');m.userData.maxOpacity=.72;
  const ring=new T.Mesh(new T.TorusGeometry(6.36,.18,8,64),m);ring.rotation.x=Math.PI/2;ring.position.set(Math.cos(a)*51.75,-18.8,Math.sin(a)*51.75);ballastMarks.add(ring);
 }

 // Actual shaft axis is +X. Aerodynamic torque follows rotor +X rotation;
 // electrical generator load opposes it. Keep the two arcs distinct from flux.
 const torque=new T.Group();torque.name='AerodynamicAndElectricalTorque';model.add(torque);
 const arcs: {group:T.Group;direction:number}[]=[];
 for(const [i,direction] of [1,-1].entries()){
  const g=new T.Group();g.name=direction===1?'AerodynamicTorque':'OpposingElectromagneticTorque';g.position.set(3.1+i*.8,150,0);torque.add(g);
  const radius=6.7+i*1.55,start=direction===1?-.4:2.2;const points=[];
  for(let j=0;j<=48;j++){const a=start+direction*j/48*Math.PI*1.12;points.push(V(0,Math.cos(a)*radius,Math.sin(a)*radius));}
  const mat=paint(i===0?'#e5b65b':'#6ecac0');tube(g,g.name+'_Arc',new T.CatmullRomCurve3(points),.085,mat,52);
  const b=points.at(-1)!,a=points.at(-3)!;arrow(g,g.name+'_Tip',b,b.clone().add(b.clone().sub(a).normalize().multiplyScalar(.75)),.24,mat);arcs.push({group:g,direction});
 }

 // Reuse the exact route from MarineWorld so the teaching section never
 // becomes a disconnected object. Cross-section diameter is optically enlarged
 // in place for readability; distances along the sea cable remain unchanged.
 const route=new T.CatmullRomCurve3([V(1,149,0),V(0,140,0),V(0,15,0),V(8,-40,0),V(-115,-43,-28),V(-285,-43,-100),V(-300,17,-100),V(-310,-40.8,-100),V(-580,-40.8,-25),V(-643,-40.8,20),V(-680,-32.5,39),V(-720,-19.5,50),V(-755,-8.3,54),V(-780,-.8,55),V(-790,1,55),V(-798,1,55),V(-835,1,55),V(-900,1,55),V(-940,1,55)],false,'centripetal');
 function nearestX(x:number){let best=0,dist=Infinity;for(let i=370;i<600;i++){const u=i/1000,p=route.getPoint(u),d=Math.abs(p.x-x);if(d<dist){dist=d;best=u;}}return best;}
 const ua=nearestX(-510),ub=nearestX(-565);
 const section=new T.Group();section.name='SeaCableInPlaceCutaway';root.add(section);section.userData={centreLine:'MarineWorld cablePoints',sectionRadiusScale:4.5,reason:'Illustrative enlarged section in place; not cable manufacturing specification'};
 function sweptShell(name:string,u0:number,u1:number,outer:number,inner:number,color:string){
  const positions:number[]=[],uv:number[]=[],indices:number[]=[];const seg=40,sides=32,opening=Math.PI*.42;
  // Local normal points up; binormal to the shore-facing side. Missing sector
  // opens towards +Z, the camera's side of this cable route.
  for(let end=0;end<2;end++)for(let j=0;j<=seg;j++){
   const f=j/seg,u=u0+(u1-u0)*f,c=route.getPoint(u),t=route.getTangent(u).normalize(),b=new T.Vector3().crossVectors(V(0,1,0),t).normalize(),n=new T.Vector3().crossVectors(t,b).normalize();
   for(let k=0;k<=sides;k++){const theta=opening/2+(2*Math.PI-opening)*k/sides;const r=end===0?outer:inner;const p=c.clone().addScaledVector(b,Math.cos(theta)*r).addScaledVector(n,Math.sin(theta)*r);positions.push(p.x,p.y,p.z);uv.push(k/sides,f);}
  }
  const layer=(seg+1)*(sides+1);
  for(let e=0;e<2;e++)for(let j=0;j<seg;j++)for(let k=0;k<sides;k++){const a=e*layer+j*(sides+1)+k,b=a+sides+1;indices.push(a,b,a+1,b,b+1,a+1);}
  for(let j=0;j<seg;j++)for(const k of [0,sides]){const a=j*(sides+1)+k,b=a+sides+1;indices.push(a,a+layer,b,b,a+layer,b+layer);}
  for(const j of [0,seg])for(let k=0;k<sides;k++){const a=j*(sides+1)+k;indices.push(a,a+1,a+layer,a+1,a+layer+1,a+layer);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(indices);geo.computeVertexNormals();
  const material=paint(color);material.side=T.DoubleSide;material.metalness=name.includes('Armour')?.7:.06;material.roughness=.48;
  const mesh=new T.Mesh(geo,material);mesh.name=name;section.add(mesh);return mesh;
 }
 const sheath=sweptShell('CableOuterSheath',ua,ub,1.35,1.15,'#405b65');
 const armour=sweptShell('CableArmour',ua+(ub-ua)*.08,ub,1.13,1.00,'#a3b4b6');
 const insulation=sweptShell('CableInsulation',ua+(ub-ua)*.18,ub,.98,.78,'#e4e8cc');
 const cores:T.Mesh[]=[];
 for(let c=0;c<3;c++){
  const pts=[];for(let i=0;i<=40;i++){const u=ua+(ub-ua)*i/40,base=route.getPoint(u),a=c*Math.PI*2/3+.5;pts.push(base.add(V(0,Math.cos(a)*.45,Math.sin(a)*.45)));}
  const mat=paint('#e4a75d');mat.metalness=.55;mat.roughness=.26;cores.push(tube(section,'CopperConductor_'+c,new T.CatmullRomCurve3(pts),.24,mat,44));
 }
 // Teaching cutaway retains modest local emissive fill under blue absorption;
 // this improves layer reading, it is not an assertion of underwater luminescence.
 section.traverse(o=>{const m=(o as T.Mesh).material as T.MeshStandardMaterial;if(m?.isMeshStandardMaterial)m.emissiveIntensity=.7;});
 const sensors=new T.Group();sensors.name='CableDeformationMonitoringPoints';root.add(sensors);const sensorMeshes:T.Mesh[]=[];
 for(let i=0;i<11;i++){
  const u=ua+(nearestX(-640)-ua)*i/10,c=route.getPoint(u),t=route.getTangent(u);const m=paint('#72c9bf');
  const q=new T.Mesh(new T.TorusGeometry(.66,.09,8,28),m);q.position.copy(c);q.quaternion.setFromUnitVectors(V(0,0,1),t);q.name='CableSensor_'+i;sensors.add(q);sensorMeshes.push(q);
 }
 const surfaceAnchors={jacket:V(8,-23,11),buoyancy:V(250,0,-230),torque:V(4,150,0),cable:route.getPoint((ua+ub)/2)};
 root.userData.anchors=Object.fromEntries(Object.entries(surfaceAnchors).map(([k,p])=>[k,p.toArray()]));
 root.userData.cueWindows={loadWindow,floatWindow,couplingWindow,torqueWindow,cableWindow,sensorWindow,pressureWindow,leverWindow,bladeSensorWindow};
 root.userData.bladeGeometry={nodes:bladeCues.map(b=>b.blade.name),pressure:'Surface vertex/normal samples at 35/43/51/59/67m radial stations',sensors:'Surface samples at 18/58/102m',torque:'Cross product of world rotor axis and blade radial direction',boundary:'Qualitative pressure-side markers; no CFD or sensor measurement claim'};

 const update=(t:number)=>{
  if(rotor){
   model.updateWorldMatrix(true,true);
   const hub=rotor.getWorldPosition(new T.Vector3()),axis=V(1,0,0).transformDirection(rotor.matrixWorld),preferred=V(0,.60,.80).normalize();
   for(const cue of bladeCues){
    const at=cue.blade.localToWorld(cue.anchor.clone()),radial=at.clone().sub(hub).addScaledVector(axis,-at.clone().sub(hub).dot(axis)).normalize(),tangent=new T.Vector3().crossVectors(axis,radial).normalize();
    const emphasis=S(-.12,.70,radial.dot(preferred));
    tint(cue.pressure,alpha(pressureWindow,t)*emphasis*.85);tint(cue.sensors,alpha(bladeSensorWindow,t)*emphasis);
    cue.halos.forEach((h,i)=>h.scale.setScalar(1+.12*Math.sin(t*1.6-i*.7)));
    const a=at.clone().addScaledVector(axis,3.0),start=hub.clone().addScaledVector(axis,a.clone().sub(hub).dot(axis));
    cue.force.position.copy(a);cue.force.quaternion.setFromUnitVectors(V(0,1,0),tangent);tint(cue.force,Math.max(alpha(pressureWindow,t)*S(.42,.62,phase(pressureWindow,t)),alpha(leverWindow,t))*emphasis);
    const length=a.distanceTo(start);cue.lever.position.copy(start).lerp(a,.5);cue.lever.quaternion.setFromUnitVectors(V(0,1,0),a.clone().sub(start).normalize());cue.lever.scale.y=length;tint(cue.lever,alpha(leverWindow,t)*emphasis*.6);
   }
  }
  const loadA=alpha(loadWindow,t),loadP=phase(loadWindow,t);tint(jacket,loadA*S(.05,.22,loadP));
  paths.forEach((p,i)=>p.update(t,loadA*S(.04+i*.08,.20+i*.08,loadP),.18));
  floatingGroup.updateWorldMatrix(true,false);
  const floatP=phase(floatWindow,t),floatA=alpha(floatWindow,t);tint(floatForces,floatA);
  buoyancy.forEach((g,i)=>{g.position.copy(floatingGroup.localToWorld(buoyancyLocal[i].clone()));g.quaternion.identity();g.scale.y=.90+.10*Math.sin(t*.5+i*.4);tint(g,floatA*S(.05,.24,floatP));});
  weight.position.copy(floatingGroup.localToWorld(V(0,39,0)));weight.quaternion.setFromUnitVectors(V(0,1,0),V(0,-1,0));tint(weight,floatA*S(.15,.33,floatP));
  tensions.forEach((p,i)=>p.update(t,floatA*S(.55,.75,floatP),.1+i*.007));tint(ballastMarks,floatA*S(.34,.54,floatP));
  // Torque cues remain anchored to the stationary shaft frame; they show
  // opposing directions, not a second free-running decorative rotor.
  const torqueA=alpha(torqueWindow,t),tp=phase(torqueWindow,t);tint(torque,torqueA);arcs[0].group.rotation.x=.07*Math.sin(t*.35);arcs[1].group.rotation.x=-.07*Math.sin(t*.35);tint(arcs[1].group,torqueA*S(.12,.30,tp));
  const ca=alpha(cableWindow,t,.85),cp=phase(cableWindow,t);tint(section,ca);
  (sheath.material as T.Material).opacity=ca*(.30+.70*(1-S(.12,.36,cp)));
  (armour.material as T.Material).opacity=ca*S(.07,.20,cp)*.85;
  (insulation.material as T.Material).opacity=ca*S(.18,.35,cp)*.78;
  cores.forEach(q=>(q.material as T.Material).opacity=ca*S(.25,.45,cp));
  const sa=alpha(sensorWindow,t,.9),sp=phase(sensorWindow,t);tint(sensors,sa);
  sensorMeshes.forEach((q,i)=>{const a=sa*S(i/14,i/14+.14,sp);(q.material as T.Material).opacity=a*(.65+.2*Math.sin(t*1.4-i*.5));});
 };
 const owned=[root,torque,ballastMarks,...tensions.map(p=>p.group.parent!),...bladeOverlays];
 const dispose=()=>{const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();for(const g of owned){g.traverse(o=>{const m=o as T.Mesh;if(m.geometry)geometries.add(m.geometry);if(m.material)for(const a of Array.isArray(m.material)?m.material:[m.material])materials.add(a);});g.removeFromParent();}geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());};
 update(0);return {update,dispose};
}
