import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {CameraPath} from './CameraPath';
import {PhysicsPlayback,SolverResponse} from './PhysicsPlayback';
import {EnvironmentPlayback,EnvironmentData,TMD_RELATIVE_MAGNIFICATION} from './EnvironmentPlayback';
import {C,V,State,Timeline,channel,ramp,pulse,mix,Label,clamp} from './visual';

type Part={id:string;role:string;zone:number;root:T.Group;meshes:T.Mesh[];center:T.Vector3;offset:T.Vector3;materials:T.MeshStandardMaterial[];restVertices:Float32Array[]};
type Route={curve:T.CurvePath<T.Vector3>;line:T.Mesh;dots:T.Mesh[];kind:string;rest:Float32Array};
const color=(s:string)=>new T.Color(s);
export class World{
 ready:Promise<void>;parts:Part[]=[];tower=new T.Group();ground=new T.Group();routes:Route[]=[];flow=new T.Group();flowDots:T.Mesh[]=[];flowPaths:T.Vector3[][]=[];
 environment:T.WebGLRenderTarget;path:CameraPath;cut=new T.Plane(V(0,-1,0),100);state?:State;anchors:any;tmdAnchors:any;eddy=new T.Group();eddyDots:T.Mesh[]=[];platform=new T.Group();physics?:PhysicsPlayback;manifest:any;effects?:EnvironmentPlayback;flowTrails:T.Line[]=[];panelDirections=new Map<string,T.Vector3>();
 constructor(public scene:T.Scene,public camera:T.PerspectiveCamera,public renderer:T.WebGLRenderer,base:string,tl:Timeline){
  this.path=new CameraPath(tl);scene.background=color(C.paper);scene.fog=new T.Fog(C.paper,23,58);
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.87;
  renderer.localClippingEnabled=true;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const pm=new T.PMREMGenerator(renderer);this.environment=pm.fromScene(new RoomEnvironment(),.035);scene.environment=this.environment.texture;scene.environmentIntensity=.48;pm.dispose();
  scene.add(new T.HemisphereLight('#fff7e8','#647d87',1.25));
  const key=new T.DirectionalLight('#fff3dc',2.5);key.position.set(-5,10,7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-5,right:5,top:8,bottom:-4,near:.1,far:26});key.shadow.bias=-.00007;key.shadow.normalBias=.004;scene.add(key);
  const rim=new T.DirectionalLight('#bbdbea',2.2);rim.position.set(5,7,-6);scene.add(rim);
  const ground=new T.Mesh(new T.PlaneGeometry(160,160),new T.MeshStandardMaterial({color:'#e4e4df',roughness:.88}));ground.rotation.x=-Math.PI/2;ground.position.y=-1.35;ground.receiveShadow=true;scene.add(ground);
  scene.add(this.tower,this.ground,this.flow,this.eddy,this.platform);this.makeSite();this.makeFlow();this.makeEddy();this.makePlatform();
  this.ready=Promise.all([new GLTFLoader().loadAsync(base+'models/shanghai-tower.glb'),fetch(base+'models/shanghai-tower-manifest.json').then(r=>r.json()),fetch(base+'physics/response.json').then(r=>{if(!r.ok)throw new Error('Missing verified solver response');return r.json()}),fetch(base+'physics/environment-response.json').then(r=>{if(!r.ok)throw new Error('Missing environmental solver response');return r.json()})]).then(([gltf,manifest,response,environment])=>{
   this.manifest=manifest;this.physics=new PhysicsPlayback(response as SolverResponse,tl);this.path.setAnchors(manifest.cameraAnchorsThree);
   gltf.scene.updateMatrixWorld(true);
   // Export nodes are independent physical teaching groups. Baking their world
   // matrices once makes arbitrary-frame playback independent of previous frames.
   for(const info of manifest.parts){
    const source=gltf.scene.getObjectByName(info.id);if(!source)throw new Error('Missing part: '+info.id);
    if(!source.getObjectByProperty('type','Mesh')&&!(source instanceof T.Mesh))continue;
    const id=source.name;const root=new T.Group();root.name=id;this.tower.add(root);const meshes:T.Mesh[]=[],materials:T.MeshStandardMaterial[]=[];
    source.traverse(o=>{if(!(o instanceof T.Mesh))return;const geo=o.geometry.clone().applyMatrix4(o.matrixWorld).scale(.01,.01,.01);geo.computeBoundingSphere();
     const old=Array.isArray(o.material)?o.material[0]:o.material;const m=(old as T.MeshStandardMaterial).clone();
     m.clippingPlanes=[this.cut,new T.Plane(V(0,-1,0),100)];m.clipShadows=true;m.userData.originalColor=m.color.clone();m.userData.originalOpacity=m.opacity;
     this.physics!.bind(id,geo);m.vertexColors=true;
     const mesh=new T.Mesh(geo,m);mesh.castShadow=!/ENVELOPE|FACADE|GLASS/.test(id);mesh.receiveShadow=true;root.add(mesh);meshes.push(mesh);materials.push(m);
    });
    const center=new T.Box3().setFromObject(root).getCenter(V());const zone=Number(/_Z(\d+)/.exec(id)?.[1]??0);this.parts.push({id,role:info.role??id.split('_')[0],zone,root,meshes,center,offset:V(),materials,restVertices:meshes.map(m=>new Float32Array(m.geometry.getAttribute('position').array))});
   }
   if(!this.parts.length)throw new Error('No separable tower parts in GLB');
   this.anchors=manifest.forceAnchorsThree;this.tmdAnchors=manifest.tmdAnchorsThree;this.makeRoutes(manifest);this.effects=new EnvironmentPlayback(scene,environment as EnvironmentData,this.physics);
   for(const p of this.parts.filter(p=>/ENVELOPE.*GLASS/.test(p.id))){this.panelDirections.set(p.id.replace(/_GLASS$/,''),V(p.center.x,0,p.center.z).normalize());}
  });
 }
 makeSite(){
  const mat=new T.MeshStandardMaterial({color:'#ced6d1',roughness:.85,metalness:.03});
  const plinth=new T.Mesh(new T.CylinderGeometry(1.1,1.16,.035,96),mat);plinth.position.y=-.03;this.ground.add(plinth);
  for(let i=0;i<4;i++){const r=1.24+i*.09;const points=[];for(let k=0;k<=128;k++)points.push(V(Math.cos(k/128*Math.PI*2)*r,-.02,Math.sin(k/128*Math.PI*2)*r));const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#b4c7c4',transparent:true,opacity:.5}));this.ground.add(line);}
 }
 makeRoutes(manifest:any){
  const make=(points:T.Vector3[],kind:string,c:string,r=.012)=>{const curve=new T.CurvePath<T.Vector3>();for(let i=1;i<points.length;i++)if(points[i].distanceTo(points[i-1])>1e-7)curve.add(new T.LineCurve3(points[i-1],points[i]));const line=new T.Mesh(new T.TubeGeometry(curve,90,r,8,false),new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.17,roughness:.4,transparent:true,opacity:.8}));const dots=Array.from({length:4},()=>new T.Mesh(new T.ConeGeometry(r*2.1,r*6,12),new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.45})));this.scene.add(line,...dots);this.physics!.bind('force-route',line.geometry);this.routes.push({curve,line,dots,kind,rest:new Float32Array(line.geometry.getAttribute('position').array)});};
  const anchors=manifest.forceAnchorsThree;
  const point=(a:number[])=>V(a[0],a[1],a[2]).multiplyScalar(.01);
  const load=point(anchors.floorLoad.point),contact=point(anchors.floorCoreContact.point),column=point(anchors.outriggerColumn.point),core=point(anchors.outriggerCore.point);
  const down=(manifest.columnPathThree??anchors.columnPath).map(point) as T.Vector3[];
  const wallPath=(manifest.coreLoadPathThree??anchors.coreLoadPathThree).map(point) as T.Vector3[];
  make([load,contact,...wallPath],'gravity',C.red,.007);
  make([load,column.clone().setY(load.y),...down],'gravity',C.red,.007);
  make([core,column,column.clone().add(V(0,-.35,0))],'moment',C.red,.01);
  make([V(-column.x,column.y-.30,-column.z),V(-column.x,column.y,-column.z),V(-core.x,core.y,-core.z)],'moment',C.teal,.01);
  // Foundation arrows are supplied by the actual pile-spring solution.
 }
 makeFlow(){
  // Analytical circular-body stream-function contours are a flow-mechanism
  // illustration, never labelled as a computed CFD pressure field.
  for(let j=0;j<84;j++){
   const y=.35+Math.floor(j/7)*.49,z0=[-1.15,-.63,-.24,.10,.24,.63,1.15][j%7],pts:T.Vector3[]=[];
   const radius=.69-.19*y/6.32;
   for(let k=0;k<=180;k++){const x=-4.2+k/180*8.4,sgn=Math.sign(z0);let lo=Math.abs(z0),hi=2.8;for(let it=0;it<26;it++){const z=(lo+hi)/2,psi=z*(1-radius*radius/(x*x+z*z));if(psi<Math.abs(z0))lo=z;else hi=z;}const z=sgn*(lo+hi)/2;pts.push(V(x,y,z));}
   this.flowPaths.push(pts);const line=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:'#699aa8',transparent:true,opacity:.14}));this.flow.add(line);
   const trail=new T.Line(new T.BufferGeometry().setFromPoints(Array.from({length:18},()=>V())),new T.LineBasicMaterial({color:j%7===3?'#b89052':'#2e798f',transparent:true,opacity:.76}));this.flowTrails.push(trail);this.flow.add(trail);
  }
 }
 makeEddy(){
  for(let j=0;j<4;j++){const x=(j%2-.5)*.041,z=(Math.floor(j/2)-.5)*.041;const ring=new T.Mesh(new T.TorusGeometry(.017,.0014,8,48),new T.MeshStandardMaterial({color:'#ce7042',emissive:'#ce7042',emissiveIntensity:.4,roughness:.4}));ring.rotation.x=Math.PI/2;ring.position.set(x,5.731,z);this.eddy.add(ring);const dot=new T.Mesh(new T.SphereGeometry(.003,12,8),new T.MeshStandardMaterial({color:'#f4c575',emissive:'#e5a844',emissiveIntensity:.4}));dot.userData.center=[x,z];this.eddyDots.push(dot);this.eddy.add(dot);}
 }
 makePlatform(){
  const steel=new T.MeshStandardMaterial({color:'#c69454',metalness:.5,roughness:.4});
  const beam=(a:T.Vector3,b:T.Vector3,r=.005)=>{const d=b.clone().sub(a),m=new T.Mesh(new T.CylinderGeometry(r,r,d.length(),8),steel);m.position.copy(a).add(b).multiplyScalar(.5);m.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());this.platform.add(m);};
  for(let i=0;i<4;i++){const a=i*Math.PI/2;const wall=new T.Mesh(new T.BoxGeometry(.34,.06,.014),steel);wall.position.set(Math.sin(a)*.17,0,Math.cos(a)*.17);wall.rotation.y=a;this.platform.add(wall);for(let j=-2;j<=2;j++){const x=j*.07,z=.175;const xx=x*Math.cos(a)+z*Math.sin(a),zz=z*Math.cos(a)-x*Math.sin(a);beam(V(xx,.03,zz),V(xx,.07,zz),.002);}beam(V(-.175*Math.cos(a)+.175*Math.sin(a),.07,.175*Math.cos(a)+.175*Math.sin(a)),V(.175*Math.cos(a)+.175*Math.sin(a),.07,.175*Math.cos(a)-.175*Math.sin(a)),.002);}
  beam(V(.14,0,.08),V(.14,.7,.08),.009);beam(V(-.30,.67,.08),V(.75,.67,.08),.009);beam(V(.14,.7,.08),V(.70,.64,.08),.003);beam(V(.14,.7,.08),V(-.28,.64,.08),.003);beam(V(.59,.66,.08),V(.59,.31,.08),.0015);
  const member=new T.Mesh(new T.BoxGeometry(.20,.012,.02),steel);member.position.set(.59,.3,.08);this.platform.add(member);
 }
 update(s:State){
  this.state=s;const u=s.n+s.u,t=s.time;
  this.physics?.update(s);
  this.path.apply(this.camera,t);
  const cameraFollow=pulse(33.3,34.7,38.1,39.1,u),pose=this.path.at(t),follow=this.physics!.displacementAt(pose.target).multiplyScalar(cameraFollow);this.camera.position.add(follow);this.camera.lookAt(pose.target.clone().add(follow));this.camera.updateMatrixWorld();
  const hook=pulse(1.25,1.98,2.65,3.45,u);
  const reveal=channel([[1,0],[3.4,0],[4.8,1],[21,1],[22.8,.42],[26,.38],[28,0],[34.1,0],[35.2,.85],[38.3,.85],[39.7,0],[49,0]],u);
  // Descend a section plane to the published zone-3 boundary, exposing the
  // actual nine-cell mesh while the camera rises continuously above it.
  const corePlan=pulse(10.1,10.82,11.92,12.58,u);
  const coreSection=pulse(9.98,10.55,11.99,12.62,u);
  this.cut.constant=coreSection>0?mix(6.8,1.73701,coreSection):100;
  const openUpper=pulse(14.05,14.85,26.2,27.4,u);
  const skin=pulse(21.4,22.5,26.3,27.4,u);
  const construction=pulse(39.10,39.95,44.05,44.90,u),progress=ramp(39.75,44.10,u),builtHeight=.20+6.12*progress;
  const windSection=pulse(31.65,32.25,33.75,34.25,u);
  for(const p of this.parts){
   const id=p.id,c=p.center,z=p.zone;
   p.offset.set(0,0,0);
   const shell=/ENVELOPE|SPIRAL_RIBS|GLAZING|FACADE_OUTER/.test(id),inner=/INNER_FACADE/.test(id),slab=/FLOORS|FLOOR_INSPECTION/.test(id),beam=/FLOOR_BEAMS/.test(id),core=/CORE/.test(id),col=/MEGACOL|CORNER/.test(id),truss=/OUTRIGGER|BELT|CONNECTION_PLATES/.test(id)||['outrigger','belt'].includes(p.role),crown=/CROWN/.test(id);
   const radial=(this.panelDirections.get(id.replace(/_(GLASS|MULLIONS)$/, ''))??V(c.x,0,c.z)).clone();if(radial.length()<.005)radial.set(1,0,0);radial.normalize();
   const stagedHook=pulse(1.20+z*.038,1.82+z*.038,2.48+z*.025,3.18+z*.025,u);
   if(shell){
    const rib=/SPIRAL_RIBS/.test(id),facing=radial.dot(this.camera.position.clone().setY(0).normalize());
    // Glass and mullions share the exact same six-sector translation. The
    // surrounding rib ring travels vertically as one assembly, without shear.
    if(rib){p.offset.y=stagedHook*(1.0+z*.055)+reveal*15*(1-skin);}
    else{p.offset.addScaledVector(radial,stagedHook*(1.30+z*.04));p.offset.y=(z-4)*stagedHook*.10;p.offset.addScaledVector(radial,mix(reveal*20,.38*clamp((facing+.05)/.75),skin));p.offset.y+=reveal*38*(1-skin);}
   }else if(slab||beam||inner){p.offset.y+=(z-1)*stagedHook*.09;if(inner){p.offset.addScaledVector(radial,reveal*20*(1-skin));p.offset.y+=reveal*38*(1-skin);}}
   else if(core||col||truss){p.offset.y+=(z-1)*stagedHook*.075;if(col)p.offset.addScaledVector(radial,stagedHook*.40);}
   if(crown)p.offset.y+=hook*.9+pulse(34.1,35.1,38,39.6,u)*1.8;
   if(z>=6||crown)p.offset.y+=openUpper*(14+z*.2);
   if(z===5)p.offset.y+=pulse(14.05,14.85,21.5,22.5,u)*14;
   if(id==='GROUND_PLAZA')p.offset.x+=pulse(4.2,5.2,8.8,9.9,u)*12;
   // A rising construction section follows the climbing core and advancing work
   // fronts. No full-floor stacks or glass sleeves fall from the sky.
   p.root.position.copy(p.offset);p.root.visible=!/^SOIL/.test(id);
   for(const m of p.materials){
    const buildLevel=core?builtHeight+.35:col||truss?builtHeight:slab||beam?builtHeight-.25:shell||inner?builtHeight-.60:builtHeight;
    m.clippingPlanes![1].constant=Math.min(mix(6.8,Math.max(.02,buildLevel),construction),z>=4?mix(6.8,1.7368,coreSection):6.8)+p.offset.y;
    const original=m.userData.originalColor as T.Color;m.color.copy(original);
    let op=m.userData.originalOpacity as number;
    if(core){m.color.set('#aaa79e');m.roughness=.85;m.metalness=.03;}
    if(col||truss){m.color.set('#3b5969');m.roughness=.32;m.metalness=.64;}
    if(slab){m.color.set('#c7ccc9');m.roughness=.8;op*=1-.78*pulse(9.5,10.4,13.2,14,u);}
    if(slab&&z===4){op*=1-.91*pulse(14.3,15.0,21.0,21.8,u);}
    if(id==='FLOOR_INSPECTION_Z04')op=mix(op,.28,pulse(15.0,15.4,16.7,17.2,u));
    if(core&&/_W[23]$/.test(id)){op*=1-.65*pulse(17.2,17.8,20.6,21.3,u);}
    if(inner){op=/GLASS/.test(id)?.12:1;m.color.set(/GLASS/.test(id)?'#70a0ac':'#607f85');}
    if(shell){if(/GLASS/.test(id)){op=.84-.14*hook;m.color.set('#66909f');}else {op=1;m.color.set('#c2d0cf');}m.roughness=.18;m.metalness=.52;}
    if(shell&&/GLASS/.test(id))op=mix(op,.16,skin);
    if(shell)op*=1-.97*windSection;
    if(inner||slab)op*=1-.96*windSection;
    if(/PILES|RAFT|BASEMENT|DIAPHRAGM/.test(id)){m.color.set('#bab9af');m.roughness=.84;}
    if(/PILES/.test(id))op*=1-.97*pulse(6.2,6.65,7.95,8.45,u);
    if(/RAFT|BASEMENT|DIAPHRAGM/.test(id))op*=1-.68*pulse(6.4,6.95,7.85,8.45,u);
    if(core&&/_W[34]$/.test(id)){op*=1-.75*pulse(10.3,10.8,11.9,12.5,u)*(1-corePlan);}
    if(slab||beam||col||truss||p.role==='garden'||p.role==='sky_lobby'||p.role==='floorbeams'){op*=1-.985*corePlan;}
    if(z===9&&(core||slab||beam||col||truss))op*=1-.92*pulse(34.2,35.1,37.9,38.8,u);
    if(/TMD/.test(id)){m.color.set(/MASS/.test(id)?'#757e84':/MAGNET/.test(id)?'#374c59':'#aeb9b9');m.metalness=.76;m.roughness=.29;}
    m.transparent=op<.999;m.opacity=op;m.depthWrite=op>.94;
   }
   if(!/TMD/.test(id))p.meshes.forEach((mesh,j)=>this.physics?.deform(mesh.geometry,p.restVertices[j],p.materials[j]));
   const tm=this.effects!.tmd(s),tw=pulse(29.05,29.6,38.55,39.1,u),sway=tm.relative*.01*TMD_RELATIVE_MAGNIFICATION*tw;
   const support=this.physics!.displacementAt(V(...this.tmdAnchors.massCenter as [number,number,number]).multiplyScalar(.01));
   if(/TMD/.test(id))p.root.position.add(support);
   const suspensionLength=(this.tmdAnchors?.cableLength??25)*.01;
   const pendulumRise=suspensionLength-Math.sqrt(Math.max(0,suspensionLength*suspensionLength-sway*sway));
   if(/TMD.*MASS|TMD_MASS|TMD_MAGNET/.test(id)){p.root.position.x+=sway;p.root.position.y+=pendulumRise;}
   if(id==='TMD_DAMPER_PLATE'){for(const m of p.materials)m.color.set('#a96543');}
   if(id==='TMD_CABLES')p.meshes.forEach((mesh,j)=>{const rest=p.restVertices[j],attr=mesh.geometry.getAttribute('position') as T.BufferAttribute;let top=-Infinity,bottom=Infinity;for(let k=1;k<rest.length;k+=3){top=Math.max(top,rest[k]);bottom=Math.min(bottom,rest[k]);}for(let k=0;k<rest.length;k+=3){const w=(top-rest[k+1])/(top-bottom);attr.setXYZ(k/3,rest[k]+sway*w,rest[k+1]+pendulumRise*w,rest[k+2]);}attr.needsUpdate=true;});
  }
  this.ground.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.material.transparent=true;o.material.opacity=1-.94*pulse(4,4.8,8.8,9.8,u);o.material.depthWrite=false;}});
  this.ground.position.set(12*pulse(4.2,5.2,8.8,9.9,u),0,0);
  const platformWeight=pulse(39.55,40.25,42.7,43.5,u);this.platform.position.set(120*(1-platformWeight),Math.min(builtHeight+.27,5.81),0);this.platform.visible=platformWeight>.00001;
  const gravity=pulse(15.9,16.15,16.85,17.15,u)+pulse(32.9,33.2,33.7,34,u),moment=0,foundation=0;
  for(const r of this.routes){const weight=r.kind==='gravity'?gravity:r.kind==='foundation'?foundation:moment;r.line.visible=weight>.001;(r.line.material as T.Material & {opacity:number}).opacity=.85*weight;if(weight>.001)this.physics?.deform(r.line.geometry,r.rest,r.line.material as T.MeshStandardMaterial);for(let i=0;i<r.dots.length;i++){const d=r.dots[i];d.visible=weight>.001;d.position.copy(r.curve.getPoint((t*.15+i/4)%1));d.position.add(this.physics!.displacementAt(d.position));d.quaternion.setFromUnitVectors(V(0,1,0),r.curve.getTangent((t*.15+i/4)%1).normalize());d.scale.setScalar(weight);}}
  const flowWeight=pulse(29,29.5,38.0,38.8,u);this.flow.visible=flowWeight>.001;this.flow.position.x=-12*(1-flowWeight);
  for(let j=0;j<this.flowTrails.length;j++){const pts=this.flowPaths[j],attr=this.flowTrails[j].geometry.getAttribute('position') as T.BufferAttribute,phase=(t*.14+j*.071)%1;for(let k=0;k<18;k++){const a=clamp((phase*1.08-k*.003)/1.02)*(pts.length-1),i=Math.floor(a),p=pts[i].clone().lerp(pts[Math.min(i+1,pts.length-1)],a-i),d=this.physics!.displacementAt(V(0,p.y,0));p.add(d);attr.setXYZ(k,p.x,p.y,p.z);}attr.needsUpdate=true;}
  const eddy=pulse(36.7,37.1,37.8,38.2,u),plate=this.parts.find(p=>p.id==='TMD_DAMPER_PLATE'),plateY=plate?.center.y??5.73,support=plate?.root.position??V();this.eddy.position.copy(support).add(V(0,plateY-5.73+.004,0));this.eddy.visible=eddy>.001;this.eddy.traverse(o=>{if(o instanceof T.Mesh){o.material.transparent=true;o.material.opacity=eddy;}});for(let j=0;j<this.eddyDots.length;j++){const d=this.eddyDots[j],[x,z]=d.userData.center;d.position.set(x+.017*Math.cos(t*3+j),5.733,z+.017*Math.sin(t*3+j));}
  this.effects!.update(s);
  this.scene.updateMatrixWorld(true);
 }
 labels(s:State):Label[]{
  const u=s.n+s.u;const list:Label[]=[];
  const add=(text:string,id:string,fallback:T.Vector3,side:'left'|'right'='right')=>{const p=this.parts.find(x=>x.id===id)??this.parts.find(x=>x.id.startsWith(id));list.push({text,point:p?p.center.clone().add(p.offset):fallback,side});};
  if(u>=5.3&&u<6.6){list.push({text:'软黏土层',point:V(-.70,-.18,-.48),color:C.gold});add('筏板','RAFT',V(.3,-.07,0),'left');}
  if(u>=6.8&&u<7.9){list.push({text:'桩侧阻力',point:V(.149,-.55,.351),color:C.teal},{text:'桩端反力',point:V(.125,-.835,.343),color:C.gold,side:'left'});}
  if(u>=10.6&&u<12.5)list.push({text:'核心筒',point:V(...this.manifest.cameraAnchorsThree.coreInterior as [number,number,number]).multiplyScalar(.01)});
  if(u>=15.5&&u<17){const dir=this.camera.position.clone().setY(0).normalize();const col=this.parts.filter(x=>x.id.startsWith('MEGACOL_Z04')).sort((a,b)=>b.center.clone().setY(0).dot(dir)-a.center.clone().setY(0).dot(dir))[0];if(col)list.push({text:'巨柱',point:col.center.clone().addScaledVector(dir,.013)});}
  if(u>=18.0&&u<18.85){const a=this.anchors.outriggerCore.point,b=this.anchors.outriggerColumn.point;list.push({text:'伸臂桁架',point:V((a[0]+b[0])*.005,(a[1]+b[1])*.005,(a[2]+b[2])*.005)});}
  if(u>=19.8&&u<20.7)list.push({text:'轴力一增一减',point:V(...this.manifest.cameraAnchorsThree.outriggerColumn as [number,number,number]).multiplyScalar(.01),color:C.red});
  if(u>=23&&u<25.6){add('内层幕墙','INNER_FACADE_Z05',V(.32,2.6,0));const garden=this.parts.find(p=>p.id==='GARDEN_Z05'),front=this.camera.position.clone().setY(0).normalize();const platform=front.multiplyScalar(.385).setY(garden?garden.center.y+.003:2.405);if(garden)platform.add(garden.root.position);list.push({text:'空中花园',point:platform,side:'left'});}
  if(u>=35.3&&u<36.8){const p=this.parts.find(p=>p.id==='TMD_MASS');if(p)list.push({text:'千吨质量块',point:p.center.clone().add(p.root.position).sub(this.physics!.displacementAt(p.center))});}
  if(u>=37.1&&u<37.8){const p=this.parts.find(p=>p.id==='TMD_DAMPER_PLATE');if(p)list.push({text:'固定铜板',point:p.center.clone(),side:'left'});}
  for(const l of list)l.point.add(this.physics!.displacementAt(l.point));return list;
 }
 dispose(){this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.effects?.dispose();this.environment.dispose();}
}
