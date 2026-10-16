import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import timeline from './timeline.json';
import {AnatomyCameraPath} from './CameraPath';
import {ArterioleDetail,LipoproteinDetail} from './VascularDetail';

/**
 * BodyParts3D is a static anatomical reference. The pulse, red cells, nephron
 * and arterial-wall cutaway below are explanatory overlays anchored to that
 * one reference body; they are not patient-specific CFD or a diagnostic tool.
 */
export type FrameState={scene:string;previous?:string;elapsed:number;duration:number;progress:number;time:number;line:number;lineProgress:number};
export const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export const smooth=(x:number)=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const C={paper:'#f2eee7',red:'#af453d',coral:'#d77569',inner:'#e8a89c',dark:'#76372f',teal:'#4f9294',blue:'#78afb6',gold:'#c09a57',ink:'#344d50',bone:'#e3d7c8',skin:'#d2b39b'};
const material=(color:T.ColorRepresentation,roughness=.55)=>new T.MeshStandardMaterial({color,roughness,metalness:.03});
function sphere(radius:number,color:T.ColorRepresentation,detail=20){const o=new T.Mesh(new T.SphereGeometry(radius,detail,Math.max(10,Math.round(detail*.7))),material(color));o.castShadow=true;return o;}
function tube(points:T.Vector3[],radius:number,color:T.ColorRepresentation,segments=60){const curve=new T.CatmullRomCurve3(points);const o=new T.Mesh(new T.TubeGeometry(curve,segments,radius,10,false),material(color));o.castShadow=true;return o;}
function rod(a:T.Vector3,b:T.Vector3,radius:number,color:T.ColorRepresentation){const d=b.clone().sub(a),o=new T.Mesh(new T.CylinderGeometry(radius,radius,d.length(),14),material(color));o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());o.castShadow=true;return o;}
function rounded(w:number,h:number,d:number,r:number,color:T.ColorRepresentation){const o=new T.Mesh(new RoundedBoxGeometry(w,h,d,4,r),material(color));o.castShadow=true;o.receiveShadow=true;return o;}
function line(points:T.Vector3[],color:T.ColorRepresentation,opacity=1){return new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color,transparent:opacity<1,opacity}));}

type Pose={position:T.Vector3;target:T.Vector3;fov:number};
type PhysCase={period:number;systolic:number;diastolic:number;samples:{phase:number;pressure:number;inflow:number;outflow:number}[]};
type Vessel={root:T.Group;mesh:T.Mesh;geo:T.BufferGeometry;base:T.BufferGeometry;length:number;radius:number;thickness:number;rings:T.Mesh[];cells:T.InstancedMesh;count:number;flow:number;phase:number;stream:T.Line[]};
type Trace={line:T.Line;positions:Float32Array;kind:'pressure'|'pulse';width:number;phase:number;root:T.Group};
type Route={curve:T.CatmullRomCurve3;dots:T.Mesh[];root:T.Group;speed:number;phase:number;mode:string};
type Screen={canvas:HTMLCanvasElement;texture:T.CanvasTexture;last:string;mode?:string};

export class HypertensionWorld{
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(35,16/9,.0001,70);ready:Promise<void>;
 introRoot=new T.Group();measureRoot=new T.Group();heartPivot?:T.Group;bodyRoot?:T.Group;atlas?:T.Group;atlasGroups:Record<string,T.Object3D>={};atlasScale=1;
 anchors:Record<string,T.Vector3>={};physics?:{cases:Record<string,PhysCase>};
 monitor?:T.Group;cuff?:T.Mesh;equipmentCable?:T.Object3D;screens:Screen[]=[];vessel?:Vessel;renalDiagram?:T.Group;signals:Route[]=[];traces:Trace[]=[];
 plaque?:T.Group;plaqueCore?:T.Mesh;plaqueCap?:T.Mesh;plaqueThrombus?:T.Mesh;ldlParticles:T.Mesh[]=[];
 clockHand?:T.Mesh;waterTank?:T.Mesh;disposed=false;assetBase:string;
 cameraPath?:AnatomyCameraPath;arteriole?:ArterioleDetail;lipoprotein?:LipoproteinDetail;renalBridge?:T.Mesh;renalParentContext?:T.Mesh;
 pressureVectors:T.ArrowHelper[]=[];pressureFronts:T.Mesh[]=[];wallCells:T.InstancedMesh|undefined;foamCells:T.Mesh[]=[];platelets:T.Mesh[]=[];
 private flowPhase=new Float64Array(timeline.duration+2);private arteriolePhase=new Float64Array(timeline.duration+2);private dummy=new T.Object3D();private environment:T.WebGLRenderTarget;private pulseTime=0;
 constructor(canvas:HTMLCanvasElement,assetBase:string){
  this.assetBase=assetBase.endsWith('/')?assetBase:assetBase+'/';
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  this.renderer.setSize(1920,1080,false);this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.04;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.localClippingEnabled=true;
  this.scene.background=new T.Color(C.paper);this.scene.fog=new T.Fog(C.paper,17,42);
  const pm=new T.PMREMGenerator(this.renderer);this.environment=pm.fromScene(new RoomEnvironment(),.04);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.30;pm.dispose();
  this.scene.add(new T.HemisphereLight('#fff8ed','#b0bdc0',2.25));
  const key=new T.DirectionalLight('#fff2dc',3.0);key.name='key';key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-9,right:9,top:10,bottom:-8,near:.1,far:45});key.shadow.bias=-.00012;key.shadow.normalBias=.025;key.shadow.radius=5;this.scene.add(key,key.target);
  const fill=new T.DirectionalLight('#c9e6ea',1.05);fill.name='fill';this.scene.add(fill,fill.target);
  const floor=new T.Mesh(new T.PlaneGeometry(80,52),material('#e9e3d9',.96));floor.rotation.x=-Math.PI/2;floor.position.set(0,-.34,-.5);floor.receiveShadow=true;this.scene.add(floor);
  this.ready=this.loadAtlas();
 }
 private async loadAtlas(){
  const loaded=await Promise.all([
   new GLTFLoader().loadAsync(this.assetBase+'models/human-atlas-hypertension.glb'),
   fetch(this.assetBase+'physics.json').then(r=>{if(!r.ok)throw Error('Required solved physics.json missing');return r.json()})
  ]);const gltf=loaded[0],physics=loaded[1];this.physics=physics;
  if(this.disposed)return;
  const source=gltf.scene;source.updateMatrixWorld(true);
  for(const name of ['heart','leftKidney','rightKidney','liver','brain','adrenals','arteries','veins','aorta','bodySurface','thoraxSkeleton']){
   const group=source.getObjectByName(name);if(!group)throw Error('Human Atlas required group absent: '+name);this.atlasGroups[name]=group;
  }
  const bodyBox=new T.Box3().setFromObject(this.atlasGroups.bodySurface),bodySize=bodyBox.getSize(V());this.atlasScale=6.85/bodySize.y;
  this.bodyRoot=new T.Group();this.bodyRoot.name='single-human-coordinate-system';this.scene.add(this.bodyRoot);
  source.scale.setScalar(this.atlasScale);source.position.set(0,-bodyBox.min.y*this.atlasScale+.08,0);this.bodyRoot.add(source);this.atlas=source;
  source.traverse(o=>{if(!(o instanceof T.Mesh))return;
   const base=Array.isArray(o.material)?o.material[0]:o.material;const mat=(base as T.MeshStandardMaterial).clone();o.material=mat;
   const parent=o.parent?.name??'';o.castShadow=false;o.receiveShadow=false;mat.roughness=.55;mat.metalness=.018;
   if(/Cavity_/i.test(o.name)){o.visible=false;return;}
   if(parent==='bodySurface'){mat.color.set('#c6b9a8');mat.transparent=true;mat.opacity=.07;mat.depthWrite=false;mat.side=T.FrontSide;}
   else if(parent==='thoraxSkeleton'){mat.color.set('#b8b6a9');mat.transparent=true;mat.opacity=.055;mat.depthWrite=false;}
   else if(parent==='arteries'||parent==='aorta'){mat.color.set(C.red);mat.roughness=.40;}
   else if(parent==='veins'){mat.color.set(C.teal);mat.transparent=true;mat.opacity=.25;mat.depthWrite=false;}
   else if(parent==='heart'){mat.color.set(C.red);}
   else if(/Kidney/.test(parent)){mat.color.set('#925644');}
   else if(parent==='liver'){mat.color.set('#966957');mat.transparent=true;mat.opacity=.2;mat.depthWrite=false;}
   else if(parent==='brain'){mat.color.set('#bca98f');mat.transparent=true;mat.opacity=.30;mat.depthWrite=false;}
  });
  source.updateMatrixWorld(true);this.cacheAnchors();
  this.anchors.vessel=V(.033008,4.80,.007975);
  // A sampled plane intersection of the atlas descending aorta defines the
  // actual local scale and centerline; the lens supplies the magnification.
  this.introRoot.position.x=-12;this.measureRoot.position.x=12;
  this.scene.add(this.introRoot,this.measureRoot);
  // Reuse the fitted seated mannequin for the opening measurement. The final
  // measurement scene is built from the same function and coordinates.
  this.buildMeasure(this.introRoot,true);
  this.buildMeasure(this.measureRoot,false);
  const heart=this.atlasGroups.heart,pivot=new T.Group(),hc=this.anchors.heart.clone();source.worldToLocal(hc);pivot.position.copy(hc);source.add(pivot);heart.removeFromParent();heart.position.sub(hc);pivot.add(heart);this.heartPivot=pivot;
  this.buildVessel();this.buildKidneyDiagram();this.buildSignals();this.buildVascularDetails();this.integrateFlow();
  this.cameraPath=new AnatomyCameraPath(this.anchors);
  this.render({scene:'intro',elapsed:0,duration:30,progress:0,time:0,line:0,lineProgress:0});
 }
 private cacheAnchors(){
  if(!this.bodyRoot)return;this.bodyRoot.updateMatrixWorld(true);
  for(const name of ['heart','leftKidney','rightKidney','liver','brain','aorta','arteries','bodySurface']){const group=this.atlasGroups[name];if(!group)continue;const box=new T.Box3().setFromObject(group);this.anchors[name]=box.getCenter(V());}
  const body=new T.Box3().setFromObject(this.atlasGroups.bodySurface);this.anchors.body=body.getCenter(V());
 }
 private anchor(name:string,offset?:T.Vector3){return (this.anchors[name]??this.anchors.body??V()).clone().add(offset??V());}
 private buildMonitor(root:T.Group,small:boolean){
  const g=new T.Group();g.position.set(small?1.9:.1,small?2.45:2.3,.0);g.rotation.y=small?-.05:-.18;root.add(g);
  const base=rounded(3.4,1.13,2.65,.21,'#e2e5dd');base.rotation.x=-.12;g.add(base);
  const rim=rounded(2.6,1.27,.11,.12,'#bfcac2');rim.position.set(0,.45,1.35);rim.rotation.x=-.2;g.add(rim);
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=448;const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  const screen=new T.Mesh(new T.PlaneGeometry(2.43,1.10),new T.MeshBasicMaterial({map:texture,toneMapped:false}));screen.position.set(0,.454,1.455);screen.rotation.x=-.2;g.add(screen);
  this.screens.push({canvas,texture,mode:small?'measure':'intro',last:''});
  const button=new T.Mesh(new T.CylinderGeometry(.20,.20,.07,32),material(C.teal));button.rotation.x=Math.PI/2;button.position.set(1.12,-.15,1.315);g.add(button);
  const cuff=new T.Group();cuff.position.set(-3.25,.45,-.05);cuff.rotation.z=.15;g.add(cuff);
  const arm=new T.Mesh(new T.CapsuleGeometry(.53,4.05,10,24),material(C.skin,.73));arm.rotation.z=Math.PI/2;arm.castShadow=true;cuff.add(arm);
  const cuffMat=material('#465c60',.91),wrap=new T.Mesh(new T.CylinderGeometry(.615,.615,1.28,48,1,true),cuffMat);wrap.rotation.z=Math.PI/2;cuff.add(wrap);
  for(const x of [-.61,.61]){const ring=new T.Mesh(new T.TorusGeometry(.60,.035,8,48),material('#839b9b'));ring.rotation.y=Math.PI/2;ring.position.x=x;cuff.add(ring);}
  const air=tube([V(-3.2,.08,.65),V(-3.1,-.85,1.1),V(-1.9,-.72,1.5),V(-1.65,-.12,.85)],.054,'#627e80');g.add(air);
  if(small){g.scale.setScalar(.47);g.position.set(2.75,3.10,1.02);cuff.visible=false;air.visible=false;}
  else{
   const table=rounded(10,.24,5.6,.14,'#dad5ca');table.position.set(-.7,1.31,-.55);root.add(table);
   const support=rounded(6.7,1.4,2.5,.3,'#e2dbce');support.position.set(-.7,.44,-1.2);root.add(support);
   const pulse=this.makeTrace(root,V(-3.7,5.15,-.25),7.3,'pressure');pulse.phase=.18;
   const lid=new T.Mesh(new T.TorusGeometry(.38,.021,8,60),material(C.gold));lid.rotation.x=-Math.PI/2;lid.position.set(-4.3,1.45,-1.4);root.add(lid);
  }
 }
 private makeVessel(length:number,radius:number,thickness:number):Vessel{
  const root=new T.Group();root.name='aorta-local-cutaway-same-anchor';const nx=52,nt=40,pos:number[]=[],normal:number[]=[],colors:number[]=[],uv:number[]=[],ids:number[]=[];const begin=.84*Math.PI,span=1.32*Math.PI;
  for(let surface=0;surface<2;surface++)for(let i=0;i<=nx;i++)for(let j=0;j<=nt;j++){const theta=begin+span*j/nt,r=surface?radius:radius+thickness;pos.push(length*(i/nx-.5),r*Math.cos(theta),r*Math.sin(theta));normal.push(0,(surface?-1:1)*Math.cos(theta),(surface?-1:1)*Math.sin(theta));uv.push(i/nx,j/nt);const col=new T.Color(surface?C.inner:C.red);colors.push(col.r,col.g,col.b);}
  const rows=(nx+1)*(nt+1);for(let s=0;s<2;s++)for(let i=0;i<nx;i++)for(let j=0;j<nt;j++){const a=s*rows+i*(nt+1)+j,b=a+1,c=a+nt+1,d=c+1;ids.push(...(s?[a,b,c,b,d,c]:[a,c,b,b,c,d]));}
  for(const i of [0,nx])for(let j=0;j<nt;j++){const a=i*(nt+1)+j,b=a+1,c=a+rows,d=c+1;ids.push(a,b,c,b,d,c);}for(const j of [0,nt])for(let i=0;i<nx;i++){const a=i*(nt+1)+j,b=a+nt+1,c=a+rows,d=b+rows;ids.push(a,c,b,b,c,d);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normal,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ids);geo.computeVertexNormals();
  const mesh=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.58,metalness:.015,side:T.DoubleSide,transparent:true,opacity:.92}));mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  // Elastic lamellae stay within the aortic wall. Separate external muscle
  // collars belong to the downstream arteriole model, not this aorta.
  const rings:T.Mesh[]=[];for(let i=0;i<19;i++){const ring=new T.Mesh(new T.TorusGeometry(radius+thickness*.5,.003,6,46,span),new T.MeshStandardMaterial({color:'#d7a38c',roughness:.6,transparent:true,opacity:.42}));ring.rotation.y=Math.PI/2;ring.rotation.z=begin+Math.PI/2;ring.position.x=length*(i/18-.5);rings.push(ring);root.add(ring);}
  const cellGeo=new T.SphereGeometry(.025,18,12),cp=cellGeo.attributes.position;for(let i=0;i<cp.count;i++){const x=cp.getX(i),z=cp.getZ(i),rr=Math.sqrt(x*x+z*z)/.025;cp.setY(i,cp.getY(i)*(.24+.28*Math.min(1,rr*rr)));}cellGeo.computeVertexNormals();
  const count=36,cells=new T.InstancedMesh(cellGeo,material('#a32d2e',.43),count);cells.instanceMatrix.setUsage(T.DynamicDrawUsage);cells.frustumCulled=false;root.add(cells);
  const stream:T.Line[]=[];for(let i=0;i<4;i++){const g=new T.BufferGeometry().setFromPoints(Array.from({length:45},(_,k)=>V(length*(k/44-.5),0,0)));const l=new T.Line(g,new T.LineBasicMaterial({color:'#e8bfa7',transparent:true,opacity:.33}));root.add(l);stream.push(l);}
  const vessel={root,mesh,geo,base:geo.clone(),length,radius,thickness,rings,cells,count,flow:1,phase:0,stream};
  this.vessel=vessel;return vessel;
 }
 private attachVessel(){
  if(!this.bodyRoot||!this.vessel)return;const v=this.vessel;v.root.position.copy(this.anchor('vessel'));v.root.scale.setScalar(.18);
  v.root.quaternion.setFromUnitVectors(V(1,0,0),V(.0595,.9689,-.2466).normalize());this.bodyRoot.add(v.root);this.buildPlaque(v);this.buildPressureDetail(v);
 }
 private buildVessel(){this.makeVessel(1.72,.171,.0278);this.attachVessel();}
 private buildVascularDetails(){
  if(!this.bodyRoot)return;
  this.arteriole=new ArterioleDetail();this.arteriole.root.position.copy(this.anchor('leftKidney',V(-.068,.026,.092)));this.arteriole.root.scale.setScalar(.006);this.arteriole.root.rotation.z=.16;this.bodyRoot.add(this.arteriole.root);
  this.lipoprotein=new LipoproteinDetail();this.lipoprotein.root.position.copy(this.anchor('liver',V(0,.012,.17)));this.lipoprotein.root.scale.setScalar(.025);this.lipoprotein.root.rotation.z=-.06;this.bodyRoot.add(this.lipoprotein.root);
  this.bodyRoot.updateMatrixWorld(true);this.anchors.arteriole=this.arteriole.focus;this.anchors.lipoprotein=this.lipoprotein.focus;
  this.buildRenalBridge();
 }
 private buildRenalBridge(){
  // FJ2046 nearest triangle surface supplies this small branch take-off.
  // The taper to the teaching arteriole is an explanatory branch continuation.
  const p0=V(.153874,4.542468,.008565),p1=V(.15830,4.54480,.00960),p2=V(.161985,4.547878,.011669),p3=V(.166938,4.548678,.011669);
  const path=new T.CubicBezierCurve3(p0,p1,p2,p3),geo=new T.TubeGeometry(path,56,1,20,false);
  this.renalBridge=new T.Mesh(geo,new T.MeshStandardMaterial({color:'#c7897b',transparent:true,opacity:.58,roughness:.58,side:T.DoubleSide,depthWrite:false}));this.renalBridge.name='sampled-renal-artery-to-microscopic-branch';this.bodyRoot!.add(this.renalBridge);
  const original=this.atlasGroups.arteries?.getObjectByName('arteriesMesh') as T.Mesh|undefined;
  const part=original?.userData.sourceParts?.find((entry:{id:string})=>entry.id==='FJ2046');
  if(original&&part){
   original.updateWorldMatrix(true,false);const source=original.geometry.attributes.position as T.BufferAttribute,positions:number[]=[],indices:number[]=[];
   for(let i=0;i<part.vertexCount;i++){const point=original.localToWorld(V().fromBufferAttribute(source,part.firstVertex+i));positions.push(point.x,point.y,point.z);}
   for(let i=0;i<part.indexCount;i++)indices.push(original.geometry.index!.getX(part.firstIndex+i)-part.firstVertex);
   const contextGeo=new T.BufferGeometry();contextGeo.setAttribute('position',new T.Float32BufferAttribute(positions,3));contextGeo.setIndex(indices);contextGeo.computeVertexNormals();
   this.renalParentContext=new T.Mesh(contextGeo,new T.MeshStandardMaterial({color:'#bf8175',roughness:.56,transparent:true,opacity:.20,depthWrite:false}));this.renalParentContext.name='FJ2046-original-local-context';this.bodyRoot!.add(this.renalParentContext);
  }
  this.updateRenalBridge(0);
 }
 private updateRenalBridge(active:number){
  if(!this.renalBridge||!this.arteriole)return;
  if(this.renalParentContext){this.renalParentContext.visible=active>.00001;(this.renalParentContext.material as T.Material).opacity=.20*active;}
  const part=this.arteriole.root.getObjectByName('parent-continuous-wall-2') as T.Mesh;
  if(!part)return;this.arteriole.root.updateWorldMatrix(true,true);
  const attr=part.geometry.attributes.position as T.BufferAttribute,points:T.Vector3[]=[];
  for(let j=0;j<48;j++)points.push(this.arteriole.root.localToWorld(V().fromBufferAttribute(attr,30*49+j)));
  const end=points.reduce((a,p)=>a.add(p),V()).multiplyScalar(1/48),endRadius=points.reduce((a,p)=>a+p.distanceTo(end),0)/48;
  const direction=V(1,0,0).applyQuaternion(this.arteriole.root.quaternion),p2=end.clone().addScaledVector(direction,-.005);
  const path=new T.CubicBezierCurve3(V(.153874,4.542468,.008565),V(.15830,4.54480,.00960),p2,end),frames=path.computeFrenetFrames(56,false),pos=this.renalBridge.geometry.attributes.position as T.BufferAttribute;
  for(let i=0;i<=56;i++){const u=i/56,center=path.getPointAt(u),radius=Math.exp(mix(Math.log(.0022),Math.log(Math.max(.0001,endRadius)),smooth(u)));for(let j=0;j<=20;j++){const angle=j/20*Math.PI*2,p=center.clone().addScaledVector(frames.normals[i],Math.cos(angle)*radius).addScaledVector(frames.binormals[i],Math.sin(angle)*radius);pos.setXYZ(i*21+j,p.x,p.y,p.z);}}
  pos.needsUpdate=true;this.renalBridge.geometry.computeVertexNormals();this.renalBridge.geometry.computeBoundingSphere();(this.renalBridge.material as T.Material).opacity=.58*active;this.renalBridge.visible=active>.00001;
 }
 private buildPressureDetail(v:Vessel){
  for(let axial=0;axial<3;axial++)for(let side=0;side<2;side++){
   const theta=Math.PI+side*Math.PI,arrow=new T.ArrowHelper(V(0,Math.cos(theta),Math.sin(theta)),V(),.12,C.teal,.025,.015);
   arrow.userData={x:v.length*(axial/2-.5)*.70,theta};arrow.line.material=new T.LineBasicMaterial({color:C.teal,transparent:true,opacity:.8});arrow.cone.material=new T.MeshStandardMaterial({color:C.teal,transparent:true,opacity:.8,roughness:.45});v.root.add(arrow);this.pressureVectors.push(arrow);
  }
  for(let i=0;i<3;i++){
   const wave=new T.Mesh(new T.TorusGeometry(v.radius*.88,.002,6,60,Math.PI*1.32),new T.MeshBasicMaterial({color:'#71a6a4',transparent:true,opacity:.2,depthWrite:false}));wave.rotation.y=Math.PI/2;wave.rotation.z=.84*Math.PI+Math.PI/2;v.root.add(wave);this.pressureFronts.push(wave);
  }
  const cells=new T.InstancedMesh(new T.SphereGeometry(.018,10,7),new T.MeshStandardMaterial({color:'#e7ada1',roughness:.7,transparent:true,opacity:.58}),120);
  cells.frustumCulled=false;v.root.add(cells);this.wallCells=cells;
 }
 private buildPlaque(v:Vessel){
  // Draw the wall cutaway before its subintimal teaching layer. Object-centre
  // transparent sorting otherwise paints the whole wall over this lesion;
  // depth testing stays enabled so foreground blood cells still occlude it.
  const root=new T.Group();root.name='subintimal-ldl-plaque-at-aortic-wall';root.position.set(.28,0,0);root.renderOrder=3;v.root.add(root);this.plaque=root;
  const lipidMat=new T.MeshPhysicalMaterial({color:'#c7a04c',roughness:.40,metalness:.01,clearcoat:.25,transparent:true,opacity:.95});
  const capMat=new T.MeshPhysicalMaterial({color:'#cb7369',roughness:.43,metalness:.01,clearcoat:.20,transparent:true,opacity:.96});
  const core=new T.Mesh(new T.SphereGeometry(.18,24,14),lipidMat);core.name='subintimal-lipid-pool';core.position.set(0,-.020,-v.radius-.002);core.scale.set(1.05,.43,.26);root.add(core);this.plaqueCore=core;
  const cap=new T.Mesh(new T.SphereGeometry(.18,24,14),capMat);cap.name='fibrous-cap-on-lumen-surface';cap.position.set(0,-.020,-v.radius+.049);cap.scale.set(1.15,.48,.08);root.add(cap);this.plaqueCap=cap;
  const thrombusMat=new T.MeshPhysicalMaterial({color:'#773a36',roughness:.48,metalness:.01,transparent:true,opacity:0});const thrombus=new T.Mesh(new T.SphereGeometry(.14,22,14),thrombusMat);thrombus.name='thrombus-growing-from-rupture';thrombus.position.set(.012,-.020,-v.radius+.092);thrombus.scale.set(.34,.28,.25);root.add(thrombus);this.plaqueThrombus=thrombus;
  const slit=sphere(.055,'#722c31',18);slit.name='fibrous-cap-rupture';slit.position.set(.01,-.02,-v.radius+.07);slit.scale.set(.14,1,.10);root.add(slit);
  for(let i=0;i<10;i++){const p=sphere(.026,C.gold,10);p.name='ldl-near-wall-'+i;p.userData.seed=i*.61803398875;p.position.set(-.55+(i%5)*.16,-.02,v.radius-.015);root.add(p);this.ldlParticles.push(p);}
  for(let i=0;i<8;i++){
   const foam=sphere(.026,'#e0b666',16);foam.name='intimal-foam-cell-'+i;foam.position.set((i%4-1.5)*.060,-.035+Math.floor(i/4)*.034,-v.radius-.006);root.add(foam);this.foamCells.push(foam);
   for(let j=0;j<3;j++){const drop=sphere(.006,'#cba151',8);drop.position.set(Math.sin(j*2.1+i)*.013,Math.cos(j*2.1+i)*.012,.018);foam.add(drop);}
  }
  for(let i=0;i<14;i++){const p=sphere(.014,'#873e4a',12);p.name='platelet-adhesion-'+i;root.add(p);this.platelets.push(p);}
 }
 private buildKidneyDiagram(){
  if(!this.bodyRoot||!this.anchors.leftKidney)return;
  // Compact spatial schematic of one nephron, placed in the renal cortex.
  // It is enlarged by the lens, never expanded to the size of the kidney.
  const root=new T.Group();root.name='cortical-nephron-continuous-detail';root.position.copy(this.anchors.leftKidney).add(V(.085,.025,.06));root.scale.setScalar(.012);root.rotation.y=-.12;this.bodyRoot.add(root);this.renalDiagram=root;
  const capsule=new T.Mesh(new T.SphereGeometry(.32,36,24),new T.MeshPhysicalMaterial({color:'#dbc7b2',transparent:true,opacity:.20,roughness:.45,side:T.DoubleSide,depthWrite:false}));capsule.name='bowman-capsule';capsule.position.set(-.70,.55,0);capsule.scale.set(1,1.06,.83);root.add(capsule);
  // A capillary tuft is distinct from the filtrate path; red cells remain in blood.
  for(let j=0;j<6;j++){
   const orientation=new T.Euler(.38+j*.49,j*.91,.20*j);const pts=Array.from({length:81},(_,i)=>{const a=i/80*Math.PI*2;return V(.18*Math.cos(a),.18*Math.sin(a),.055*Math.sin(a*3+j)).applyEuler(orientation).add(V(-.70,.55,0));});
   root.add(tube(pts,.019,j%2?C.coral:C.red,64));
  }
  this.addRoute(root,[V(-1.42,.78,-.025),V(-1.12,.74,0),V(-.86,.67,.015)],C.red,.048,5,.10,'blood');
  const peri=[V(-.79,.68,-.08),V(-.36,.78,-.08),V(.22,.61,-.08),V(.73,.35,-.07),V(.83,-.19,-.07),V(.70,-.66,-.08),V(.51,-1.03,-.07),V(.24,-.86,-.07),V(.09,-.45,-.07),V(-.07,-.10,-.07),V(-.12,.18,-.07)];
  this.addRoute(root,peri,'#bf8478',.029,15,.053,'blood');
  const filtrate=[V(-.71,.26,.03),V(-.53,.08,.05),V(-.24,.12,.06),V(-.32,.36,.05),V(.03,.36,.06),V(.18,.12,.04),V(.02,-.20,.04),V(.00,-.83,.02),V(.17,-1.15,.01),V(.39,-1.06,.01),V(.42,-.47,.02),V(.45,.04,.03),V(.69,.19,.04),V(.85,-.02,.03),V(1.04,.08,.02),V(1.25,-.13,0)];
  this.addRoute(root,filtrate,C.teal,.047,25,.042,'filtrate');
  this.addRoute(root,[V(1.25,.53,0),V(1.25,-.13,0),V(1.25,-.62,0),V(1.25,-1.30,0)],'#679999',.065,10,.061,'filtrate');
  // Short water/sodium transfers terminate at the adjacent capillary bed.
  const transfers:[[number,number,number],[number,number,number]][]=[[[.02,.35,.075],[.22,.60,-.07]],[[.07,-.22,.07],[.13,-.42,-.07]],[[.44,-.56,.055],[.72,-.60,-.08]]];
  transfers.forEach(([a,b],i)=>{const from=V(...a),to=V(...b),mid=from.clone().lerp(to,.5).add(V(.05,.01,.10));this.addRoute(root,[from,mid,to],i%2?C.gold:C.blue,.008,3,.15,'reabsorb');});
  root.updateWorldMatrix(true,true);
  const positions:Record<string,T.Vector3>={nephronFocus:V(.28,-.28,0),nephronFilter:V(-.70,.55,0),nephronTubule:V(.30,-.18,.03),nephronDrain:V(1.25,-.88,0)};
  for(const [name,point] of Object.entries(positions))this.anchors[name]=root.localToWorld(point);
 }
 private addRoute(parent:T.Group,points:T.Vector3[],color:string,radius=.03,count=5,speed=.1,mode='generic'){
  const curve=new T.CatmullRomCurve3(points),root=new T.Group();parent.add(root);
  const semantic=['nerve','hormone','aldosterone'].includes(mode);
  if(semantic){
   // Semantic routes read as one continuous conduit at atlas scale: a soft
   // halo, dark core, and restrained moving dashes share the exact same curve.
   const routeColor=mode==='hormone'?'#2f7c80':'#8a642f';
   const halo=new T.Mesh(new T.TubeGeometry(curve,110,Math.max(.008,radius*2.15),8,false),new T.MeshBasicMaterial({color:routeColor,transparent:true,opacity:.17,depthWrite:false}));
   halo.name=`${mode}-route-soft-halo`;root.add(halo);
   const core=new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(110)),new T.LineBasicMaterial({color:routeColor,transparent:true,opacity:.78,depthWrite:false}));
   core.name=`${mode}-route-continuous-core`;root.add(core);
   const guide=new T.Line(new T.BufferGeometry().setFromPoints(curve.getPoints(90)),new T.LineDashedMaterial({color:routeColor,transparent:true,opacity:.34,dashSize:.034,gapSize:.016,depthWrite:false}));guide.computeLineDistances();guide.name=`${mode}-route-flow-dashes`;root.add(guide);
  }
  else root.add(new T.Mesh(new T.TubeGeometry(curve,110,radius,12,false),new T.MeshStandardMaterial({color,transparent:true,opacity:mode==='reabsorb'?.28:.38,roughness:.42,depthWrite:false})));
  const particleColor=semantic?(mode==='hormone'?'#2f7c80':'#8a642f'):color;
  const dots:T.Mesh[]=[];const dotCount=semantic?Math.max(count,12):count;
  // Keep route particles readable without letting them read as oversized
  // organs at the aortic scale; the continuous halo/core carries the path.
  for(let i=0;i<dotCount;i++){const d=sphere(semantic?.008:radius*(mode==='reabsorb'?1.20:.58),particleColor,12);d.material=new T.MeshStandardMaterial({color:particleColor,emissive:particleColor,emissiveIntensity:semantic?.30:.10,roughness:.32,transparent:true,depthWrite:false});root.add(d);dots.push(d);}
  const r={curve,root,dots,speed,phase:0,mode};this.signals.push(r);return r;
 }
 private buildSignals(){
  if(!this.bodyRoot)return;const brain=this.anchor('brain'),heart=this.anchor('heart'),kidney=this.anchor('leftKidney'),adrenal=this.anchor('leftKidney',V(.04,.20,.02));
  const routes:[T.Vector3[],string,string][]=[
   [[brain,V(-.12,4.92,.24),heart],C.gold,'nerve'],
   [[brain,V(-.24,4.12,.22),kidney],C.gold,'nerve'],
   [[kidney,V(.08,3.25,.22),heart],C.teal,'hormone'],
   [[adrenal,adrenal.clone().add(V(.08,-.07,.04)),kidney],C.gold,'aldosterone']
  ];routes.forEach((r,i)=>{const route=this.addRoute(this.bodyRoot!,r[0],r[1],.0035,9,.065,r[2]);route.phase=i*.23;});
 }
 private makeTrace(parent:T.Group,position:T.Vector3,width:number,kind:'pressure'|'pulse'){
  const root=new T.Group();root.position.copy(position);parent.add(root);const positions=new Float32Array(181*3),geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(positions,3));const l=new T.Line(geo,new T.LineBasicMaterial({color:C.red,transparent:true,opacity:.70}));root.add(l);root.add(line([V(0,-.09,0),V(width,-.09,0)],'#b0aaa0',.45));for(let i=0;i<9;i++)root.add(line([V(width*i/8,-.14,0),V(width*i/8,-.04,0)],'#b8afa1',.35));const t={line:l,positions,kind,width,phase:0,root};this.traces.push(t);return t;
 }
 private buildMeasure(root=this.measureRoot,intro=false){
  const body=new T.Group();body.position.set(-.85,0,-.4);root.add(body);
  // The seated mannequin explains supported back, feet and heart-level arm.
  // It is deliberately a smooth neutral teaching figure, distinct from atlas.
  const shirt=material('#b9c7c1',.86),skin=material(C.skin,.76),trouser=material('#576e70',.8);
  const torso=rounded(1.6,2.4,.8,.43,'#b9c7c1');torso.position.set(-.72,3.39,-.12);torso.rotation.z=-.025;body.add(torso);
  const head=sphere(.56,C.skin,32);head.scale.set(.85,1.07,.9);head.position.set(-.76,5.24,-.10);body.add(head);
  const neck=new T.Mesh(new T.CapsuleGeometry(.22,.28,8,16),skin);neck.position.set(-.75,4.56,-.1);body.add(neck);
  const limb=(a:T.Vector3,b:T.Vector3,r:number,mat:T.MeshStandardMaterial)=>{const mesh=rod(a,b,r,'#fff');mesh.material=mat;body.add(mesh);body.add(new T.Mesh(new T.SphereGeometry(r,18,12),mat).translateX(a.x).translateY(a.y).translateZ(a.z));return mesh;};
  // One shared shoulder/elbow axis drives the exposed arm and fitted cuff.
  // The short sleeve ends above the cuff; the cuff is never placed over cloth.
  const shoulder=V(-.20,4.20,0),elbow=V(.03,3.03,.32),wrist=V(1.07,2.975,.49),upperRadius=.22,forearmRadius=.19,wristRadius=.135;
  const upperArm=limb(shoulder,elbow,upperRadius,skin);upperArm.name='measurement-upper-arm';
  const upperGeometry=new T.CylinderGeometry(upperRadius,upperRadius,shoulder.distanceTo(elbow),40,18),upperVertices=upperGeometry.attributes.position;
  for(let i=0;i<upperVertices.count;i++){const along=upperVertices.getY(i)/shoulder.distanceTo(elbow)+.5,taper=mix(1,forearmRadius/upperRadius,smooth((along-.88)/.12));upperVertices.setX(i,upperVertices.getX(i)*taper);upperVertices.setZ(i,upperVertices.getZ(i)*taper);}upperGeometry.computeVertexNormals();upperArm.geometry.dispose();upperArm.geometry=upperGeometry;
  const sleeveEnd=shoulder.clone().lerp(elbow,.22),sleeve=limb(shoulder,sleeveEnd,.243,shirt);sleeve.name='measurement-short-sleeve';
  // Adult teaching proportions: shoulder–elbow 1.234, elbow–wrist 1.055.
  // The forearm tapers toward the wrist instead of extending as a uniform rod.
  const foreDirection=wrist.clone().sub(elbow),forearm=new T.Mesh(new T.CylinderGeometry(wristRadius,forearmRadius,foreDirection.length(),40,6),skin);
  forearm.name='measurement-forearm';forearm.position.copy(elbow).lerp(wrist,.5);forearm.quaternion.setFromUnitVectors(V(0,1,0),foreDirection.clone().normalize());forearm.castShadow=true;body.add(forearm);
  forearm.userData={shoulderLocal:shoulder.toArray(),elbowLocal:elbow.toArray(),wristLocal:wrist.toArray(),elbowRadius:forearmRadius,wristRadius,upperArmLength:shoulder.distanceTo(elbow),forearmLength:foreDirection.length()};
  const elbowJoint=sphere(forearmRadius,C.skin,28);elbowJoint.position.copy(elbow);body.add(elbowJoint);
  const wristJoint=sphere(wristRadius,C.skin,28);wristJoint.position.copy(wrist);body.add(wristJoint);
  const hand=new T.Group();hand.name='measurement-hand';hand.position.copy(wrist);hand.quaternion.setFromUnitVectors(V(1,0,0),foreDirection.clone().normalize());body.add(hand);
  const palm=sphere(.20,C.skin,32);palm.position.set(.20,-.015,0);palm.scale.set(1.30,.51,.73);hand.add(palm);
  const thumb=sphere(.085,C.skin,24);thumb.position.set(.15,-.018,.13);thumb.scale.set(1.38,.72,.86);thumb.rotation.y=-.50;hand.add(thumb);
  hand.userData={wristLocal:wrist.toArray(),tipLocal:V(.46,-.015,0).toArray(),palmLength:.52};
  limb(V(-1.28,4.20,0),V(-1.61,2.99,.28),.22,shirt);limb(V(-1.61,2.99,.28),V(-1.0,2.17,.67),.18,skin);
  for(const x of [-1.12,-.24]){limb(V(x,2.27,0),V(x,2.06,1.49),.29,trouser);limb(V(x,2.06,1.49),V(x,.29,1.72),.22,trouser);const shoe=rounded(.58,.33,1.10,.15,'#d5d2c8');shoe.position.set(x,.02,1.93);body.add(shoe);}
  const chair=rounded(2.2,.28,2.1,.18,'#bda784');chair.position.set(-.77,1.97,.30);body.add(chair);const back=rounded(2.13,2.1,.21,.21,'#bda784');back.position.set(-.77,3.0,-.68);back.rotation.x=-.07;body.add(back);
  for(const x of [-1.57,.05])for(const z of [-.43,1])body.add(rod(V(x,1.97,z),V(x,-.3,z+.1),.075,'#a28c6c'));
  // The tabletop extends beneath the elbow as well as the wrist. A thin pad
  // meets the forearm's underside, so the arm is supported instead of floating.
  const padHeight=.045,padTop=elbow.y-forearmRadius,tableTop=padTop-padHeight;
  const table=rounded(4.90,.20,2.5,.10,'#ddd6c9');table.name='measurement-support-table';table.position.set(1.20,tableTop-.10,.35);root.add(table);
  for(const x of [-.72,3.20])root.add(rod(V(x,tableTop-.20,.2),V(x,-.3,.2),.085,'#ae9e88'));
  const support=rounded(1.86,padHeight,.70,.02,'#e6e0d3');support.name='measurement-forearm-support';support.position.copy(elbow).lerp(wrist,.5).add(body.position).add(V(.13,0,.015));support.position.y=tableTop+padHeight*.5;root.add(support);
  const cuffFraction=.65,upperAxis=shoulder.clone().sub(elbow).normalize(),cuffCenter=shoulder.clone().lerp(elbow,cuffFraction),cuffWidth=.57,cuffInner=.224,cuffOuter=.243;
  const cuffRoot=new T.Group();cuffRoot.name='measurement-upper-arm-cuff';cuffRoot.position.copy(cuffCenter);cuffRoot.quaternion.setFromUnitVectors(V(0,1,0),upperAxis);body.add(cuffRoot);
  const cuffMat=material('#526f72',.94);cuffMat.side=T.DoubleSide;
  const cuff=new T.Mesh(new T.CylinderGeometry(cuffOuter,cuffOuter,cuffWidth,64,1,true),cuffMat);cuff.name='measurement-cuff-outer-wrap';cuffRoot.add(cuff);this.cuff=cuff;
  const liner=new T.Mesh(new T.CylinderGeometry(cuffInner,cuffInner,cuffWidth,64,1,true),material('#425e62',.96));(liner.material as T.MeshStandardMaterial).side=T.DoubleSide;liner.name='measurement-cuff-inner-liner';cuffRoot.add(liner);
  for(const y of [-cuffWidth*.5,cuffWidth*.5]){const seam=new T.Mesh(new T.TorusGeometry((cuffInner+cuffOuter)*.5,(cuffOuter-cuffInner)*.5,10,64),material('#74918f',.96));seam.name='measurement-cuff-bound-edge';seam.rotation.x=Math.PI/2;seam.position.y=y;cuffRoot.add(seam);}
  // A subtle overlapping fabric panel and its stitch line describe a wrap,
  // without a large buckle or unsupported hollow cylinder around the arm.
  const flap=new T.Mesh(new T.CylinderGeometry(cuffOuter+.0015,cuffOuter+.0015,cuffWidth*.84,20,1,true,-.16,.53),material('#58777a',.96));flap.name='measurement-cuff-overlap';cuffRoot.add(flap);
  const stitchPoints=[V(Math.sin(.35)*(cuffOuter+.003),-cuffWidth*.40,Math.cos(.35)*(cuffOuter+.003)),V(Math.sin(.35)*(cuffOuter+.003),cuffWidth*.40,Math.cos(.35)*(cuffOuter+.003))];cuffRoot.add(tube(stitchPoints,.0028,'#829b95',12));
  const cuffPortStart=V(0,-cuffWidth*.26,cuffOuter-.005),cuffPortEnd=V(0,-cuffWidth*.26,cuffOuter+.076);
  const cuffPort=rod(cuffPortStart,cuffPortEnd,.025,'#38595e');cuffPort.name='measurement-cuff-air-connector';cuffRoot.add(cuffPort);
  const priorMonitorChildren=new Set(root.children);this.buildMonitor(root,true);const builtScreen=this.screens?.[this.screens.length-1];if(builtScreen)builtScreen.mode=intro?'intro':'measure';
  const monitor=root.children.find(o=>!priorMonitorChildren.has(o)&&o instanceof T.Group);
  let monitorEnd=V(1.88,3.25,1.20);
  if(monitor){monitor.name='measurement-monitor';monitor.position.x-=.48;monitor.position.y+=tableTop-2.84;const port=rod(V(-1.64,-.12,.47),V(-1.84,-.12,.47),.043,'#657f7e');port.name='measurement-monitor-air-port';monitor.add(port);root.updateWorldMatrix(true,true);monitorEnd=root.worldToLocal(monitor.localToWorld(V(-1.84,-.12,.47)));if(intro)this.anchors.introMonitor=monitor.getWorldPosition(V());}
  root.updateWorldMatrix(true,true);const cuffEnd=root.worldToLocal(cuffRoot.localToWorld(cuffPortEnd.clone()));
  const cable=tube([cuffEnd,cuffEnd.clone().add(V(.10,-.06,.18)),V(-.25,3.13,.82),V(.36,tableTop+.067,1.04),V(.88,tableTop+.072,1.18),monitorEnd],.023,'#587b7d',96);cable.name='measurement-connected-air-tube';root.add(cable);
  const heartHeight=cuffCenter.y,guide=line([V(-1.40,heartHeight,.22),V(.65,heartHeight,.22)],C.gold,.45);guide.name='measurement-heart-height-guide';root.add(guide);
  root.updateWorldMatrix(true,true);
  const cuffWorld=cuffRoot.getWorldPosition(V()),forearmWorld=body.localToWorld(elbow.clone().lerp(wrist,.48)),elbowWorld=body.localToWorld(elbow.clone()),supportWorld=support.getWorldPosition(V()),forearmSurfaceWorld=body.localToWorld(elbow.clone().lerp(wrist,.72).add(V(0,.148,0)));
  if(intro){
   this.anchors.introCuff=cuffWorld;this.anchors.introForearm=forearmWorld;this.anchors.introElbow=elbowWorld;this.anchors.introSupport=supportWorld;this.anchors.introForearmSurface=forearmSurfaceWorld;this.anchors.introBody=body.localToWorld(V(-.72,3.39,-.12));
  }else{
   this.anchors.measureCuff=cuffWorld;this.anchors.measureForearm=forearmWorld;this.anchors.measureElbow=elbowWorld;this.anchors.measureSupport=supportWorld;this.anchors.measureForearmSurface=forearmSurfaceWorld;
  }
  cuffRoot.userData={shoulderLocal:shoulder.toArray(),elbowLocal:elbow.toArray(),axisLocal:upperAxis.toArray(),innerRadius:cuffInner,armRadius:upperRadius,width:cuffWidth,centerFromShoulderFraction:cuffFraction,elbowGap:shoulder.distanceTo(elbow)*(1-cuffFraction)-cuffWidth*.5};
  const clockRoot=new T.Group();clockRoot.position.set(3.53,5.2,-.7);clockRoot.visible=!intro;root.add(clockRoot);
  const ring=new T.Mesh(new T.TorusGeometry(.62,.026,8,60),material('#869a94'));clockRoot.add(ring);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;clockRoot.add(rod(V(Math.sin(a)*.53,Math.cos(a)*.53,0),V(Math.sin(a)*.58,Math.cos(a)*.58,0),.012,'#869a94'));}
  const handClock=rod(V(),V(.0,.43,0),.021,C.gold);const pivot=new T.Group();pivot.add(handClock);clockRoot.add(pivot);this.clockHand=handClock;pivot.name='clockPivot';
 }
 private pulse(t:number){const p=((t*1.2)%1+1)%1;return Math.exp(-(((p-.18)/.11)**2))+.20*Math.exp(-(((p-.42)/.15)**2));}
 private solvedPressure(name:string,time:number){const d=this.physics?.cases[name];if(!d)return 90;const p=((time/d.period)%1+1)%1,index=p*(d.samples.length-1),i=Math.floor(index);return mix(d.samples[i].pressure,d.samples[Math.min(i+1,d.samples.length-1)].pressure,index-i);}
 private solvedExpansion(name:string,time:number){const d=this.physics?.cases[name];if(!d)return this.pulse(time);return clamp((this.solvedPressure(name,time)-d.diastolic)/Math.max(1,d.systolic-d.diastolic));}
 private vesselDynamics(time:number){
  const m=this.weight('remodel',time),stiffen=this.clipProgress('h040',time,1);
  return {constriction:0,compliance:mix(.065,.009,m*stiffen)};
 }
 private clipProgress(id:string,time:number,seconds?:number){const c=timeline.clips.find(c=>c.id===id);return c?smooth((time-c.start/30)/(seconds??c.duration/30)):0;}
 private integrateFlow(){
  // Integrate phase once. Dividing absolute time by a changing lumen volume
  // would produce particle jumps and even reversals during each pressure pulse.
  const v=this.vessel!;
  this.arteriolePhase=new Float64Array(timeline.duration+2);
  for(let f=1;f<this.flowPhase.length;f++){
   const time=(f-.5)/30,d=this.vesselDynamics(time),beat=this.solvedExpansion(d.compliance<.012?'stiffer_artery':'baseline',time);let total=0;
   for(let j=0;j<64;j++){const x=v.length*((j+.5)/64-.5),radius=(1-d.constriction*Math.exp(-((x/(v.length*.27))**4)))*(1+d.compliance*beat);total+=radius*radius/64;}
   this.flowPhase[f]=this.flowPhase[f-1]+.12/(30*total);
   const contract=this.arterioleContraction(time),smallBeat=this.solvedExpansion('baseline',time);let area=0;
   for(let j=0;j<96;j++){const x=2.12*((j+.5)/96-.5),envelope=.55+.45*Math.exp(-Math.pow(x/.81,6));const ratio=(1-contract*.39*envelope)*(1+.023*smallBeat*(1-.52*contract));area+=ratio*ratio/96;}
   this.arteriolePhase[f]=this.arteriolePhase[f-1]+.081/(30*area);
  }
 }
 private arterioleContraction(time:number){return (.30/.39)*this.clipProgress('h018',time,4)*(1-.92*this.clipProgress('h022',time,3.2));}
 private updateVessel(v:Vessel,time:number,constriction:number,compliance:number){
  const positions=v.geo.attributes.position as T.BufferAttribute,original=v.base.attributes.position as T.BufferAttribute,nx=52,nt=40,rows=(nx+1)*(nt+1),beat=this.solvedExpansion(compliance<.012?'stiffer_artery':'baseline',time+v.phase);
  const lumen=(x:number)=>v.radius*(1-constriction*Math.exp(-((x/(v.length*.27))**4)))*(1+compliance*beat);
  for(let i=0;i<positions.count;i++){const x=original.getX(i),surface=i>=rows,baseR=surface?v.radius:v.radius+v.thickness,r=lumen(x)+(surface?0:v.thickness);positions.setXYZ(i,x,original.getY(i)*r/baseR,original.getZ(i)*r/baseR);}positions.needsUpdate=true;v.geo.computeVertexNormals();
  for(const ring of v.rings){const r=lumen(ring.position.x)+v.thickness*.5;ring.scale.set(r/(v.radius+v.thickness*.5),r/(v.radius+v.thickness*.5),1);}
  const volume=[0],samples=96;for(let j=1;j<=samples;j++){const x=v.length*((j-.5)/samples-.5);volume.push(volume[j-1]+(lumen(x)/v.radius)**2/samples);}const total=volume[samples];const xAt=(q:number)=>{const wanted=q*total;let lo=0,hi=samples;while(hi-lo>1){const mid=(lo+hi)>>1;if(volume[mid]<wanted)lo=mid;else hi=mid;}return ((lo+(wanted-volume[lo])/Math.max(1e-8,volume[hi]-volume[lo]))/samples-.5)*v.length;};
  for(let i=0;i<v.count;i++){const u=((i/v.count+this.flowPhase[Math.min(this.flowPhase.length-1,Math.round(time*30))])%1+1)%1,x=xAt(1-u),th=i*2.399963,r=lumen(x)*(.18+.50*((i*.317)%1)),edge=smooth(Math.min(u,1-u)/.05);this.dummy.position.set(x,Math.cos(th)*r,Math.sin(th)*r);this.dummy.rotation.set(.48*Math.sin(time*.55+i),.25+(i%7)*.22,time*.48+i);this.dummy.scale.setScalar(edge*(.78+.30*((i*.618)%1)));this.dummy.updateMatrix();v.cells.setMatrixAt(i,this.dummy.matrix);}v.cells.instanceMatrix.needsUpdate=true;
  v.stream.forEach((l,i)=>{const p=l.geometry.attributes.position as T.BufferAttribute,th=.95+i*.8;for(let k=0;k<p.count;k++){const x=(k/(p.count-1)-.5)*v.length,r=lumen(x)*.46;p.setXYZ(k,x,Math.cos(th)*r,Math.sin(th)*r);}p.needsUpdate=true;});
  if(this.wallCells){let i=0;for(let axial=0;axial<20;axial++)for(let side=0;side<6;side++){
   const x=v.length*((axial+.5)/20-.5),th=.89*Math.PI+side*.228*Math.PI,r=lumen(x)-.001;
   this.dummy.position.set(x,r*Math.cos(th),r*Math.sin(th));this.dummy.rotation.set(th,0,0);this.dummy.scale.set(1.95,.68,.18);this.dummy.updateMatrix();this.wallCells.setMatrixAt(i++,this.dummy.matrix);
  }this.wallCells.instanceMatrix.needsUpdate=true;}
 }
 private sceneProgress(s:FrameState){return s.line+s.lineProgress;}
 private cameraAt(s:FrameState){
  if(!this.cameraPath)this.cameraPath=new AnatomyCameraPath(this.anchors);
  const pose=this.cameraPath.at(s.time),distance=pose.distance;
  this.camera.up.set(Math.sin(pose.roll),Math.cos(pose.roll),0);this.camera.position.copy(pose.position);this.camera.lookAt(pose.target);this.camera.fov=pose.fov;
  this.camera.near=Math.max(.00003,Math.min(.04,distance*.014));this.camera.updateProjectionMatrix();
  const key=this.scene.getObjectByName('key') as T.DirectionalLight;key.position.copy(pose.target).add(V(-5,8,6));key.target.position.copy(pose.target);
  const fill=this.scene.getObjectByName('fill') as T.DirectionalLight;fill.position.copy(pose.target).add(V(6,3,-4));fill.target.position.copy(pose.target);
 }
 private weight(id:string,time:number,ramp=2.2){const c=timeline.scenes.find(c=>c.id===id);if(!c)return 0;return smooth((time-c.start/30)/ramp)*(1-smooth((time-c.end/30)/ramp));}
  /**
   * A softly bounded semantic window used by the camera hand-offs.  Scene
   * weights are useful for broad chapter fades, but the regulation chapter
   * changes its visual subject several times (renal signal -> nerve -> system
   * level).  Keeping these windows in seconds makes those opacity hand-offs
   * line up with the spoken clips instead of waiting for a scene cut.
   */
  private clipWindow(first:string,last:string,time:number,ramp=.72,lead=0){
   const a=timeline.clips.find(c=>c.id===first),b=timeline.clips.find(c=>c.id===last);
   if(!a||!b)return 0;
   return smooth((time-(a.start/30-lead))/ramp)*(1-smooth((time-(b.end/30+lead))/ramp));
  }
  private clipProgressLead(id:string,time:number,seconds=1.4,lead=.30){
   const c=timeline.clips.find(c=>c.id===id);if(!c)return 0;
   return smooth((time-(c.start/30-lead))/seconds);
  }
 private reveal(root:T.Object3D,q:number){root.traverse(o=>{if(!(o instanceof T.Mesh||o instanceof T.Line))return;for(const m of Array.isArray(o.material)?o.material:[o.material]){if(m.userData.opacity===undefined)m.userData.opacity=m.opacity;m.transparent=true;m.opacity=m.userData.opacity*q;m.depthWrite=q>.98&&m.opacity>.98;}});}
 private drawScreen(screen:Screen,time:number,scene:string){
  const intro=screen.mode==='intro',sys=intro?Math.round(mix(0,152,smooth(clamp((time-1.5)/2)))):146,dia=intro?Math.round(mix(0,94,smooth(clamp((time-1.5)/2)))):92,text=String(sys)+'/'+String(dia);if(screen.last===scene+text)return;screen.last=scene+text;const ctx=screen.canvas.getContext('2d')!;ctx.fillStyle='#d6dfce';ctx.fillRect(0,0,768,448);ctx.fillStyle='#3c5550';ctx.font='600 204px Arial';ctx.textAlign='right';ctx.fillText(String(sys),608,209);ctx.font='600 159px Arial';ctx.fillText(String(dia),608,385);ctx.textAlign='left';ctx.font='600 41px Microsoft YaHei';ctx.fillText('高压',44,142);ctx.fillText('低压',44,324);ctx.font='35px Arial';ctx.fillText('mmHg',530,431);screen.texture.needsUpdate=true;
 }
  private setGroupOpacity(group:T.Object3D,opacity:number,depthThreshold=.15){group.traverse(o=>{if(!(o instanceof T.Mesh))return;const m=o.material as T.MeshStandardMaterial;m.transparent=opacity<.99;m.opacity=opacity;m.depthWrite=opacity>depthThreshold;});}
 private highlight(name:string,q:number,color:string){const group=this.atlasGroups[name];if(!group)return;group.traverse(o=>{if(!(o instanceof T.Mesh))return;const m=o.material as T.MeshStandardMaterial;m.emissive.set(color);m.emissiveIntensity=.015+.11*q;});}
 render(s:FrameState){
  if(this.disposed)return;this.pulseTime=s.time;this.cameraAt(s);const u=this.sceneProgress(s),beat=this.pulse(s.time);for(const screen of this.screens)this.drawScreen(screen,s.time,s.scene);
  const w=(id:string)=>this.weight(id,s.time),a=w('anatomy'),p=w('pump'),r=w('resistance'),k=w('kidney'),c=w('control'),m=w('remodel');
  const nearAorta=1-smooth((this.camera.position.distanceTo(this.anchor('vessel'))-.76)/1.1),nearMicro=1-smooth((this.camera.position.distanceTo(this.anchor('arteriole'))-.11)/.65),nearLipid=1-smooth((this.camera.position.distanceTo(this.anchor('lipoprotein'))-.35)/1.25),close=Math.min(1,a+p+r+k+c+m);
  const lipidScene=this.clipProgress('h040a',s.time,1)*(1-this.clipProgress('h041',s.time,.8));
  const nearRenal=1-smooth((this.camera.position.distanceTo(this.anchor('leftKidney'))-.62)/.55),nearNephron=1-smooth((this.camera.position.distanceTo(this.anchor('nephronFocus'))-.10)/.50);
  const microContext=Math.max(nearMicro*r,nearNephron*k,nearLipid*lipidScene);
  // Regulation is a visual hand-off: the atlas becomes a quiet translucent
  // context while the signal routes take the foreground.  These windows are
  // deliberately clip based so the opacity changes travel with the camera
  // between kidney, brain and heart instead of snapping at scene boundaries.
  const renalSignal=this.clipWindow('h031','h033',s.time,.74,.30),nerveSignal=this.clipWindow('h034','h035',s.time,.74,.30),systemSignal=this.clipWindow('h036','h037',s.time,.74,.26);
  const controlFocus=Math.max(renalSignal,nerveSignal,systemSignal);
  // Large nearby anatomical surfaces become a faint context layer before
  // the microscopic zoom, so the camera never drives through opaque vessels.
  let macro=Math.max(nearAorta*(1-.12*r)*(1-lipidScene),microContext,nearRenal*k);
  // Hand the lesion close-up back to its atlas context before the cutaway
  // closes. Keep this correction within the final organ pullback interval.
  if(s.time>=timeline.clips.find(c=>c.id==='h044')!.start/30&&s.time<timeline.scenes.find(c=>c.id==='measure')!.start/30){
   macro*=mix(1,this.aortaDetailVisibility(s.time,microContext),this.clipProgress('h044',s.time,.7));
  }
  if(this.heartPivot)this.heartPivot.scale.setScalar(1-.045*beat);
  if(this.atlas){
   const bodyContext=mix(mix(.06,.006,close),.001,microContext);
   const skeletonContext=mix(mix(.045,.005,close),.001,microContext);
   // A very light silhouette keeps orientation while leaving the gold neural
   // and teal renal routes readable through the body.  The fade is reversible
   // and continuous, so the pullback into the next organ never reveals a pop.
   this.setGroupOpacity(this.atlasGroups.bodySurface,mix(bodyContext,.012,controlFocus));
   this.setGroupOpacity(this.atlasGroups.thoraxSkeleton,mix(skeletonContext,.010,controlFocus));
   const arteryOpacity=mix(.38-.20*(a+p+k)-.25*c,.0004,macro);
   this.setGroupOpacity(this.atlasGroups.arteries,mix(arteryOpacity,.020,controlFocus));
   this.setGroupOpacity(this.atlasGroups.aorta,mix(mix(.55,.0008,macro),.030,controlFocus));
   // Context organs stay transparent to the active route.  A higher depth
   // threshold during the hand-off prevents the semi-transparent heart or
   // kidney shell from depth-occluding the signal line that is being shown.
   this.setGroupOpacity(this.atlasGroups.heart,mix(mix(.63,.0008,macro)*(1-.45*k),.13,controlFocus),controlFocus>.01?.70:.15);
   const leftKidneyOpacity=mix(mix(.58,.008,macro)*(1-.60*k)+.24*k,.003,nearNephron*k);
   this.setGroupOpacity(this.atlasGroups.leftKidney,mix(leftKidneyOpacity,.26,renalSignal),renalSignal>.01?.70:.15);
   this.setGroupOpacity(this.atlasGroups.rightKidney,mix(mix(.58,.008,macro),.10,renalSignal),renalSignal>.01?.70:.15);
   this.setGroupOpacity(this.atlasGroups.veins,mix(mix(.18-.08*(a+p+k)-.115*c,.0003,macro),.012,controlFocus));
   this.setGroupOpacity(this.atlasGroups.brain,mix(.30+.30*c,.40,nerveSignal),nerveSignal>.01?.70:.15);
   this.setGroupOpacity(this.atlasGroups.adrenals,mix(mix(.45,.005,macro),.19,renalSignal),renalSignal>.01?.70:.15);
   this.setGroupOpacity(this.atlasGroups.liver,mix(mix(.055+.58*lipidScene,.0008,macro),.018,controlFocus));
   this.highlight('heart',a+p,C.red);this.highlight('leftKidney',k+.8*c*(.65+.35*Math.sin(s.time*1.6)),'#c37b55');this.highlight('brain',c,'#b9a064');
  }
  if(this.vessel){const v=this.vessel,dynamics=this.vesselDynamics(s.time);this.updateVessel(v,s.time,dynamics.constriction,dynamics.compliance);const visible=this.aortaDetailVisibility(s.time,microContext);this.reveal(v.mesh,visible);for(const ring of v.rings)this.reveal(ring,visible*.65);this.reveal(v.cells,visible);if(this.wallCells)this.reveal(this.wallCells,visible);for(const path of v.stream)this.reveal(path,visible);this.updatePressureDetail(s,v);for(const arrow of this.pressureVectors)for(const object of [arrow.line,arrow.cone])(object.material as T.Material).opacity*=visible;for(const wave of this.pressureFronts)(wave.material as T.Material).opacity*=visible;}
  const constriction=this.arterioleContraction(s.time);
  this.arteriole?.update({time:s.time,activation:r*(1-nearNephron*k),constriction,pressure:.28+constriction*.5,pulse:this.solvedExpansion('baseline',s.time),flowPhase:this.arteriolePhase[Math.min(this.arteriolePhase.length-1,Math.round(s.time*30))]});
  this.updateRenalBridge(r*(1-nearNephron*k));
  const c0=timeline.clips.find(c=>c.id==='h040a'),c1=timeline.clips.find(c=>c.id==='h040b');
  const lipidProgress=c0&&c1?(s.time<c1.start/30?.15*smooth((s.time-(c0.start+c0.duration*.74)/30)/(c0.duration*.26/30)):.15+.85*clamp((s.time-c1.start/30)/(c1.duration/30))):0;
  const lipidReveal=1-smooth((this.camera.position.distanceTo(this.anchor('lipoprotein'))-.18)/.42);
  this.lipoprotein?.update({time:s.time,activation:lipidReveal*lipidScene,progress:lipidProgress,clearance:this.clipProgress('h040c',s.time)});
  this.updatePlaque(s,u);if(this.plaque){const visible=this.aortaDetailVisibility(s.time,microContext);this.plaque.traverse(o=>{if(o instanceof T.Mesh){for(const mat of Array.isArray(o.material)?o.material:[o.material]){mat.opacity*=visible;mat.depthWrite=false;}}});}this.updateRenal(s,u);this.updateSignals(s);this.updateTraces(s);
  const clock=this.measureRoot.getObjectByName('clockPivot');if(clock)clock.rotation.z=-s.time*.12;
  this.scene.updateMatrixWorld(true);this.renderer.render(this.scene,this.camera);
 }
 private aortaDetailVisibility(time:number,microContext:number){
  const teaching=this.clipProgress('h008',time,1.2)*(1-this.clipProgress('h014',time,1.4))+this.clipProgress('h038',time,1.0)*(1-this.clipProgress('h040a',time,.9))+this.clipProgress('h041',time,.8)*(1-this.clipProgress('h044',time,1.2));
  const focus=this.cameraPath!.at(time).target;
  return clamp(teaching)*(1-smooth((focus.distanceTo(this.anchor('vessel'))-.07)/.26))*(1-microContext);
 }
 private updatePressureDetail(s:FrameState,v:Vessel){
  const active=Math.min(1,this.weight('anatomy',s.time)+this.weight('pump',s.time)+this.weight('remodel',s.time)*(1-this.clipProgress('h040a',s.time,1)));
  const dynamics=this.vesselDynamics(s.time),kind=dynamics.compliance<.012?'stiffer_artery':'baseline',pulse=this.solvedExpansion(kind,s.time),pressure=this.solvedPressure(kind,s.time),q=clamp((pressure-55)/90),radius=v.radius*(1+dynamics.compliance*pulse);
  for(const arrow of this.pressureVectors){const {x,theta}=arrow.userData;arrow.position.set(x,radius*.40*Math.cos(theta),radius*.40*Math.sin(theta));arrow.setLength(radius*.60+.008+.022*q,.018+.006*q,.011);for(const object of [arrow.line,arrow.cone]){const mat=object.material as T.Material;mat.transparent=true;mat.opacity=active*.78;mat.depthWrite=false;}}
  this.pressureFronts.forEach((wave,i)=>{const phase=((s.time*.55+i/3)%1+1)%1;wave.position.x=v.length*(.5-phase);wave.scale.set(1+dynamics.compliance*pulse,1+dynamics.compliance*pulse,1);(wave.material as T.Material).opacity=active*.25*smooth(Math.min(phase,1-phase)/.10);});
 }
 private updatePlaque(s:FrameState,u:number){
  if(!this.plaque||!this.vessel)return;
  const frame=(id:string)=>timeline.clips.find(c=>c.id===id)?.start??0;
  const ldl=smooth((s.time-frame('h041')/30)/3.0),q=smooth((s.time-frame('h042')/30)/3.4),th=smooth((s.time-frame('h043')/30)/3.0),exit=1-smooth((s.time-(timeline.scenes.find(c=>c.id==='measure')!.start/30+2))/3.6);
  this.plaque.visible=true;this.plaque.scale.setScalar(1);const slit=this.plaque.getObjectByName('fibrous-cap-rupture');if(slit){slit.scale.set(.14*th,th,.10*th);this.reveal(slit,th*exit);}
  if(this.plaqueCore){(this.plaqueCore.material as T.Material).opacity=.78*q*exit;this.plaqueCore.scale.set(1.05*q,.43,.26*q);}
  if(this.plaqueCap){(this.plaqueCap.material as T.Material).opacity=(.40+.20*th)*q*exit;this.plaqueCap.scale.set(1.15*q,.48,.08);}
  if(this.plaqueThrombus){(this.plaqueThrombus.material as T.Material).opacity=.98*th*exit;this.plaqueThrombus.scale.set(.34*th,.28*th,.25*th);}
  this.ldlParticles.forEach((p,i)=>{const phase=((s.time*.16+i*.618)%1+1)%1,arrive=smooth(phase);p.position.set(mix(.55-(i%5)*.10,0,arrive),mix(.015,-.035,arrive),mix(.01,-this.vessel!.radius-.003,arrive));p.scale.setScalar(.38);const mat=p.material as T.MeshStandardMaterial;mat.transparent=true;mat.depthWrite=false;mat.opacity=.95*ldl*exit*smooth(Math.min(phase,1-phase)/.12);});
  this.foamCells.forEach((cell,i)=>{const growth=smooth((s.time-frame('h042')/30-i*.13)/2.4);cell.scale.setScalar(.15+.85*growth);cell.position.z=-this.vessel!.radius+.015*growth;this.reveal(cell,growth*exit);});
  this.platelets.forEach((cell,i)=>{const arrival=smooth((s.time-frame('h043')/30-i*.10)/2.7);const x=.35+(i%4)*.07,y=.035*Math.sin(i*2.3),z=-.030;
   cell.position.set(mix(x,.015+.036*Math.sin(i*2.4),arrival),mix(y,-.02+.024*Math.cos(i*1.9),arrival),mix(z,-this.vessel!.radius+.070+.033*((i*.618)%1),arrival));cell.scale.set(.8,.40+.18*arrival,.7);cell.rotation.set(i*.7,s.time*.17+i,i);this.reveal(cell,th*exit);
  });
 }
 private updateRenal(s:FrameState,u:number){if(!this.renalDiagram)return;const q=this.weight('kidney',s.time,3.2);this.reveal(this.renalDiagram,q);this.renalDiagram.scale.setScalar(.012);}
  private updateSignals(s:FrameState){
   const active=this.weight('control',s.time,3.2),renal=this.weight('kidney',s.time,3.2);
   // The route that is being narrated gets the cleanest line and particle
   // contrast.  The other routes remain as a quiet context so the viewer can
   // follow the hand-off without a hard pop or a second competing diagram.
   const renalSignal=this.clipWindow('h031','h033',s.time,.74,.30),nerveSignal=this.clipWindow('h034','h035',s.time,.74,.30);
   for(const route of this.signals){
    const microscopic=['filtrate','blood','reabsorb'].includes(route.mode);
    const gate=route.mode==='nerve'?this.clipProgressLead('h034',s.time,1.4,.30):route.mode==='aldosterone'?this.clipProgressLead('h032',s.time,1,.24):1;
    const semantic=route.mode==='nerve'?nerveSignal:route.mode==='hormone'||route.mode==='aldosterone'?renalSignal:0;
    const context=route.mode==='nerve'||route.mode==='hormone'||route.mode==='aldosterone' ? .34+.66*semantic : 1;
    const q=microscopic?renal:active*gate*context;
    this.reveal(route.root,q);
    route.dots.forEach((dot,i)=>{const x=((s.time*route.speed+route.phase+i/route.dots.length)%1+1)%1;dot.position.copy(route.curve.getPointAt(x));dot.scale.setScalar(smooth(Math.min(x,1-x)/.08));});
   }
  }
 private updateTraces(s:FrameState){for(const trace of this.traces){for(let i=0;i<trace.positions.length/3;i++){const x=i/(trace.positions.length/3-1),phase=((x*3.4-s.time*.4+trace.phase)%1+1)%1,pulse=Math.exp(-(((phase-.22)/.10)**2))+.19*Math.exp(-(((phase-.47)/.14)**2));const model=s.scene==='resistance'?'higher_resistance':s.scene==='remodel'?'stiffer_artery':'baseline',y=this.physics?(this.solvedPressure(model,s.time-2.7*(1-x))-55)/75:pulse*.5;trace.positions[i*3]=x*trace.width;trace.positions[i*3+1]=y;trace.positions[i*3+2]=0;}(trace.line.geometry.attributes.position as T.BufferAttribute).needsUpdate=true;}}
 getAnchors(){const result:Record<string,{x:number;y:number;visible:boolean}>={};for(const [name,p] of Object.entries(this.anchors)){const q=p.clone().project(this.camera);result[name]={x:(q.x+1)*960,y:(1-q.y)*540,visible:Math.abs(q.x)<.95&&Math.abs(q.y)<.9&&q.z>-1&&q.z<1};}return result;}
 dispose(){this.disposed=true;const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value instanceof T.Texture)textures.add(value);}}});for(const v of [this.vessel])if(v)geometries.add(v.base);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.environment.dispose();this.renderer.dispose();}
}
