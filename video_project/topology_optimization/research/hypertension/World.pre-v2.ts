import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {RoundedBoxGeometry} from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/** BodyParts3D anatomy is static reference geometry. Pulses, cells, nephron,
 * smooth-muscle narrowing and remodeling below are explanatory animation.
 * They are not patient-specific anatomy, CFD, or a diagnostic simulator. */
export type FrameState={scene:string;previous?:string;elapsed:number;duration:number;progress:number;time:number;line:number;lineProgress:number};
export const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export const smooth=(x:number)=>{const t=clamp(x);return t*t*t*(t*(t*6-15)+10)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const C={paper:'#f2eee7',red:'#af453d',coral:'#d77569',inner:'#e8a89c',dark:'#76372f',teal:'#4f9294',blue:'#78afb6',gold:'#c09a57',ink:'#344d50',bone:'#e3d7c8',skin:'#d2b39b'};
const ORDER=['intro','anatomy','pump','resistance','kidney','control','remodel','measure','references'];
const SPACING=22;
type Station={root:T.Group;center:T.Vector3};
type Vessel={root:T.Group;mesh:T.Mesh;geo:T.BufferGeometry;base:T.BufferGeometry;length:number;radius:number;thickness:number;rings:T.Mesh[];cells:T.InstancedMesh;count:number;flow:number;strength:number;phase:number;stream:T.Line[]};
type Trace={line:T.Line;positions:Float32Array;kind:'pressure'|'pulse';width:number;phase:number;root:T.Group};
type Route={curve:T.CatmullRomCurve3;dots:T.Mesh[];root:T.Group;speed:number;phase:number;mode:string};
type PulseOrgan={group:T.Group;baseScale:number;kind:string};
type Pose={position:T.Vector3;target:T.Vector3;fov:number};
type PhysCase={period:number;systolic:number;diastolic:number;samples:{phase:number;pressure:number;inflow:number;outflow:number}[]};
const material=(color:T.ColorRepresentation,roughness=.55)=>new T.MeshStandardMaterial({color,roughness,metalness:.03});
function sphere(radius:number,color:T.ColorRepresentation,detail=24){const o=new T.Mesh(new T.SphereGeometry(radius,detail,Math.round(detail*.7)),material(color));o.castShadow=true;return o;}
function tube(points:T.Vector3[],radius:number,color:T.ColorRepresentation,segments=70){const curve=new T.CatmullRomCurve3(points);const o=new T.Mesh(new T.TubeGeometry(curve,segments,radius,10,false),material(color));o.castShadow=true;return o;}
function rod(a:T.Vector3,b:T.Vector3,radius:number,color:T.ColorRepresentation){const d=b.clone().sub(a),o=new T.Mesh(new T.CylinderGeometry(radius,radius,d.length(),16),material(color));o.position.copy(a).add(b).multiplyScalar(.5);o.quaternion.setFromUnitVectors(V(0,1,0),d.normalize());o.castShadow=true;return o;}
function rounded(w:number,h:number,d:number,r:number,color:T.ColorRepresentation){const o=new T.Mesh(new RoundedBoxGeometry(w,h,d,4,r),material(color));o.castShadow=true;o.receiveShadow=true;return o;}
function line(points:T.Vector3[],color:T.ColorRepresentation,opacity=1){const o=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color,transparent:opacity<1,opacity}));return o;}
function pivotClone(source:T.Object3D,height:number,color?:T.ColorRepresentation){
 const root=new T.Group(),box=new T.Box3().setFromObject(source),center=box.getCenter(V()),size=box.getSize(V()),scale=height/Math.max(size.x,size.y,size.z);
 source.updateMatrixWorld(true);source.traverse(o=>{if(!(o instanceof T.Mesh))return;
  if(/Cavity_/i.test(o.name))return;
  const geo=o.geometry.clone().applyMatrix4(o.matrixWorld);geo.translate(-center.x,-center.y,-center.z);geo.scale(scale,scale,scale);
  const original=Array.isArray(o.material)?o.material[0]:o.material;const mat=(original as T.MeshStandardMaterial).clone();
  mat.roughness=.5;mat.metalness=.025;mat.transparent=false;mat.opacity=1;mat.depthWrite=true;if(color)mat.color.set(color);
  const mesh=new T.Mesh(geo,mat);mesh.name=o.name;mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
 });return root;
}

export class HypertensionWorld{
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(35,16/9,.08,70);ready:Promise<void>;
 stations:Record<string,Station>={};environment:T.WebGLRenderTarget;atlas?:T.Group;atlasGroups:Record<string,T.Object3D>={};organs:PulseOrgan[]=[];
 // A single, low-opacity atlas follows the camera corridor.  It keeps the
 // heart, vessels and kidneys in one anatomical coordinate system while the
 // camera makes close visits to their explanatory cutaways.
 continuityAtlas?:T.Group;
 vessels:Vessel[]=[];routes:Route[]=[];traces:Trace[]=[];screenTextures:{canvas:HTMLCanvasElement;texture:T.CanvasTexture;mode:string;last:string}[]=[];
 waterDrops:T.InstancedMesh[]=[];waterTank?:T.Mesh;renalShell?:T.Group;renalDiagram=new T.Group();signals:Route[]=[];
 controlHeart?:T.Group;controlBrain?:T.Group;controlKidneys?:T.Group;anatomyHeart?:T.Group;atlasScale=1;
  pressureWall?:T.Mesh;displayRings:T.Mesh[]=[];clockHand?:T.Mesh;anatomyEmphasis:T.Mesh[]=[];
  plaqueRoot?:T.Group;plaqueCore?:T.Mesh;plaqueCap?:T.Mesh;plaqueClot?:T.Mesh;plaqueParticles:T.Mesh[]=[];
  disposed=false;assetBase:string;
 physics?:{cases:Record<string,PhysCase>};riskOrgans:T.Group[]=[];
 private dummy=new T.Object3D();private white=new T.Color('#fff3df');private elapsed=0;
 constructor(canvas:HTMLCanvasElement,assetBase:string){
  this.assetBase=assetBase.endsWith('/')?assetBase:assetBase+'/';
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  this.renderer.setSize(1920,1080,false);this.renderer.setPixelRatio(1);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.04;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.localClippingEnabled=true;
  this.scene.background=new T.Color(C.paper);this.scene.fog=new T.Fog(C.paper,24,62);
  const pm=new T.PMREMGenerator(this.renderer);this.environment=pm.fromScene(new RoomEnvironment(),.05);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.32;pm.dispose();
  this.scene.add(new T.HemisphereLight('#fff8ed','#b0bdc0',2.15));
  // A camera-following light rig has fixed world-relative offsets. Its position
  // is re-derived every frame so independent Remotion frames remain identical.
  const key=new T.DirectionalLight('#fff2dc',3.15);key.name='key';key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-10,right:10,top:11,bottom:-9,near:1,far:42});key.shadow.bias=-.00012;key.shadow.normalBias=.025;key.shadow.radius=5;this.scene.add(key,key.target);
  const fill=new T.DirectionalLight('#c9e6ea',1.05);fill.name='fill';this.scene.add(fill,fill.target);
  const floor=new T.Mesh(new T.PlaneGeometry(270,100),material('#e9e3d9',.96));floor.rotation.x=-Math.PI/2;floor.position.set(88,-.42,-4);floor.receiveShadow=true;this.scene.add(floor);
  for(let i=0;i<ORDER.length;i++){
   // Extra space around the two within-chapter camera visits keeps adjacent
   // anatomy and measuring scenes fully outside each stable composition.
   const x=i*SPACING+(i>=2?5:0)+(i>=7?4:0);
   const root=new T.Group();root.position.set(x,0,0);this.scene.add(root);this.stations[ORDER[i]]={root,center:V(x,3.25,0)};
   // Two restrained floor lines bridge stations; no surrounding cards or UI.
   if(i<ORDER.length-1){const road=line([V(4,-.395,-2.7),V(SPACING-4,-.395,-2.7)],'#cfc6b7',.43);root.add(road);}
  }
  this.buildMonitor(this.stations.intro.root,false);this.buildResistance();this.buildKidneyDiagram();this.buildRemodel();this.buildMeasure();
  this.ready=this.loadAtlas();
 }
 private async loadAtlas(){
  const [gltf,physics]=await Promise.all([new GLTFLoader().loadAsync(this.assetBase+'models/human-atlas-hypertension.glb'),fetch(this.assetBase+'physics.json').then(r=>{if(!r.ok)throw Error('Required solved physics.json missing');return r.json()})]);this.physics=physics;
  if(this.disposed)return;const source=gltf.scene;source.updateMatrixWorld(true);
  for(const name of ['heart','leftKidney','rightKidney','brain','arteries','veins','aorta','bodySurface','thoraxSkeleton']){
   const o=source.getObjectByName(name);if(!o)throw Error('Human Atlas required anatomical group absent: '+name);this.atlasGroups[name]=o;
  }
  const box=new T.Box3().setFromObject(this.atlasGroups.bodySurface),size=box.getSize(V());this.atlasScale=7.9/size.y;
  const outer=new T.Group();outer.add(source);source.scale.setScalar(this.atlasScale);source.position.set(0,-box.min.y*this.atlasScale,0);outer.rotation.y=-.11;outer.position.x=.6;
  source.traverse(o=>{if(!(o instanceof T.Mesh))return;const mat=(Array.isArray(o.material)?o.material[0]:o.material).clone() as T.MeshStandardMaterial;o.material=mat;
   mat.roughness=.55;mat.metalness=.02;o.castShadow=false;o.receiveShadow=false;
   if(/Cavity_/i.test(o.name)){o.visible=false;return;}
   const category=o.parent?.name??'';
   if(category==='bodySurface'){mat.color.set('#c6b9a8');mat.transparent=true;mat.opacity=.075;mat.depthWrite=false;mat.side=T.FrontSide;}
   else if(category==='thoraxSkeleton'){mat.color.set('#b8b6a9');mat.transparent=true;mat.opacity=.06;mat.depthWrite=false;}
   else if(category==='arteries'||category==='aorta'){mat.color.set(C.red);mat.roughness=.4;}
   else if(category==='veins'){mat.color.set(C.teal);mat.transparent=true;mat.opacity=.30;mat.depthWrite=false;}
   else if(category==='heart'){mat.color.set(C.red);}
   else if(/Kidney/.test(category)){mat.color.set('#925644');}
   else if(category==='brain'){mat.color.set('#c3af98');mat.transparent=true;mat.opacity=.30;mat.depthWrite=false;}
  });
  this.stations.anatomy.root.add(outer);this.atlas=outer;
  // Keep one quiet anatomical locator travelling through the later stations.
  // It is intentionally translucent: it gives every close-up a parent body
  // without competing with the actual heart, vessel or kidney demonstration.
  const continuity=new T.Group();continuity.name='continuous-anatomy-context';
  const ghost=outer.clone(true);ghost.name='atlas-context-ghost';
  // The parent carries the animated azimuth below; avoid applying the
  // anatomy station's initial rotation twice to the cloned atlas.
  ghost.rotation.set(0,0,0);
  ghost.traverse(o=>{if(!(o instanceof T.Mesh))return;
   const base=Array.isArray(o.material)?o.material[0]:o.material;
   const mat=(base as T.MeshStandardMaterial).clone();o.material=mat;
   const group=o.parent?.name??'';mat.transparent=true;mat.depthWrite=false;mat.roughness=.68;
   const isArtery=group==='arteries'||group==='aorta',isOrgan=group==='heart'||/Kidney/.test(group);
   mat.opacity=group==='bodySurface'?.022:group==='thoraxSkeleton'?.018:isArtery?.085:
    group==='veins'?.045:isOrgan?.11:group==='brain'?.055:.028;
   if(group==='bodySurface')mat.color.set('#b8a99a');
   else if(group==='arteries'||group==='aorta'||group==='heart')mat.color.set('#c97669');
   else if(group==='veins')mat.color.set('#6e9d9f');
   else if(/Kidney/.test(group))mat.color.set('#9e6b5b');
   else mat.color.set('#b8b5aa');
   o.castShadow=false;o.receiveShadow=false;
  });
  continuity.add(ghost);continuity.position.copy(this.stations.anatomy.root.position);
  this.scene.add(continuity);this.continuityAtlas=continuity;
  const anatomySection=this.makeVessel(4.9,.76,.22);anatomySection.root.position.set(13,5.2,0);this.stations.anatomy.root.add(anatomySection.root);
  // Copies are created from the ORIGINAL physical geometry, with transforms
  // baked before centering, so contraction occurs around the organ itself.
  source.updateMatrixWorld(true);
  const heart=this.organ('heart',3.7,C.red);heart.position.set(-2.25,3.45,.1);heart.rotation.set(.02,.1,-.08);this.stations.pump.root.add(heart);this.organs.push({group:heart,baseScale:1,kind:'pump'});
  const pumpVessel=this.makeVessel(5.8,.65,.16);pumpVessel.root.position.set(2.6,2.65,0);pumpVessel.root.rotation.z=.06;this.stations.pump.root.add(pumpVessel.root);pumpVessel.phase=.2;
  this.stations.pump.root.add(tube([V(-1.3,4.65,.3),V(-.4,5.05,0),V(.15,4.5,0),V(-.25,2.65,0)],.27,C.red));
  this.makeTrace(this.stations.pump.root,V(-.2,1.02,1.2),7.5,'pressure');
  const kidney=this.organ('leftKidney',3.25,'#9d5746');kidney.position.set(-2.8,3.3,0);kidney.rotation.set(.08,-.28,-.12);this.stations.kidney.root.add(kidney);this.renalShell=kidney;
  this.buildControl();
  for(const [i,name] of ['heart','brain','leftKidney'].entries()){
   const organ=this.organ(name,name==='brain'?1.7:1.6,name==='brain'?'#baa78e':name==='heart'?C.red:'#9e6252');organ.position.set(11.5+(i===1?1.8:0),5.4-i*1.68,.12);this.stations.remodel.root.add(organ);this.riskOrgans.push(organ);
  }
  const ending=this.organ('heart',1.0,C.red);ending.position.set(3.1,2.55,.4);this.stations.references.root.add(ending);this.organs.push({group:ending,baseScale:1,kind:'references'});
  // Quiet display plinths are ground shadows, never a rectangular content card.
  this.render({scene:'intro',elapsed:0,duration:30,progress:0,time:0,line:0,lineProgress:0});
 }
 private organ(name:string,height:number,color?:T.ColorRepresentation){return pivotClone(this.atlasGroups[name],height,color);}
 private buildMonitor(root:T.Group,small:boolean){
  const g=new T.Group();g.position.set(small?1.9:.1,small?2.45:2.3,.0);g.rotation.y=small?-.05:-.18;root.add(g);
  const base=rounded(3.4,1.13,2.65,.21,'#e2e5dd');base.rotation.x=-.12;g.add(base);
  const rim=rounded(2.6,1.27,.11,.12,'#bfcac2');rim.position.set(0,.45,1.35);rim.rotation.x=-.2;g.add(rim);
  const canvas=document.createElement('canvas');canvas.width=768;canvas.height=448;const texture=new T.CanvasTexture(canvas);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=4;
  const screen=new T.Mesh(new T.PlaneGeometry(2.43,1.10),new T.MeshBasicMaterial({map:texture,toneMapped:false}));screen.position.set(0,.454,1.425);screen.rotation.x=-.2;g.add(screen);
  this.screenTextures.push({canvas,texture,mode:small?'measure':'intro',last:''});
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
  const root=new T.Group(),nx=48,nt=42,pos:number[]=[],normal:number[]=[],colors:number[]=[],uv:number[]=[],ids:number[]=[];
  const begin=.86*Math.PI,span=1.28*Math.PI;
  // One continuous double surface and two actual cut rims. No opaque cylinder
  // is placed across the lumen: cells remain visible through the cutaway.
  for(let surface=0;surface<2;surface++)for(let i=0;i<=nx;i++)for(let j=0;j<=nt;j++){
   const theta=begin+span*j/nt,r=surface?radius:radius+thickness;
   pos.push(length*(i/nx-.5),r*Math.cos(theta),r*Math.sin(theta));normal.push(0,(surface?-1:1)*Math.cos(theta),(surface?-1:1)*Math.sin(theta));uv.push(i/nx,j/nt);
   const col=new T.Color(surface?C.inner:C.red);colors.push(col.r,col.g,col.b);
  }
  const rows=(nx+1)*(nt+1);
  for(let s=0;s<2;s++)for(let i=0;i<nx;i++)for(let j=0;j<nt;j++){
   const a=s*rows+i*(nt+1)+j,b=a+1,c=a+nt+1,d=c+1;ids.push(...(s?[a,b,c,b,d,c]:[a,c,b,b,c,d]));
  }
  for(const i of [0,nx])for(let j=0;j<nt;j++){const a=i*(nt+1)+j,b=a+1,c=a+rows,d=c+1;ids.push(a,b,c,b,d,c);}
  for(const j of [0,nt])for(let i=0;i<nx;i++){const a=i*(nt+1)+j,b=a+nt+1,c=a+rows,d=b+rows;ids.push(a,c,b,b,c,d);}
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('normal',new T.Float32BufferAttribute(normal,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));geo.setIndex(ids);geo.computeVertexNormals();
  const mesh=new T.Mesh(geo,new T.MeshStandardMaterial({vertexColors:true,roughness:.58,metalness:.015,side:T.DoubleSide}));mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);
  const rings:T.Mesh[]=[];for(let i=0;i<13;i++){
   const ring=new T.Mesh(new T.TorusGeometry(radius+thickness+.032,.028,6,42,span),material('#a4594d'));ring.rotation.y=Math.PI/2;ring.rotation.z=begin+Math.PI/2;ring.position.x=length*(i/12-.5);rings.push(ring);root.add(ring);
  }
  const cellGeo=new T.SphereGeometry(.17,16,10);const cp=cellGeo.attributes.position;
  for(let i=0;i<cp.count;i++){const x=cp.getX(i),z=cp.getZ(i),r=Math.sqrt(x*x+z*z)/.17;cp.setY(i,cp.getY(i)*(.23+.25*Math.min(1,r*r)));}cellGeo.computeVertexNormals();
  const count=Math.max(12,Math.round(length*radius*radius*12)),cells=new T.InstancedMesh(cellGeo,material('#a32d2e',.43),count);cells.instanceMatrix.setUsage(T.DynamicDrawUsage);cells.frustumCulled=false;root.add(cells);
  const stream:T.Line[]=[];for(let i=0;i<5;i++){const geo=new T.BufferGeometry().setFromPoints(Array.from({length:49},(_,k)=>V(length*(k/48-.5),0,0)));const l=new T.Line(geo,new T.LineBasicMaterial({color:'#e8bfa7',transparent:true,opacity:.38}));root.add(l);stream.push(l);}
  const vessel={root,mesh,geo,base:geo.clone(),length,radius,thickness,rings,cells,count,flow:1,strength:0,phase:0,stream};this.vessels.push(vessel);return vessel;
 }
 private buildResistance(){
  const root=this.stations.resistance.root;
  const healthy=this.makeVessel(7.0,.70,.17);healthy.root.position.set(-.40,4.85,-.25);healthy.flow=.62;healthy.phase=.4;
  const narrow=this.makeVessel(7.0,.70,.22);narrow.root.position.set(-.40,2.45,.2);narrow.flow=.72;narrow.phase=.8;
  root.add(healthy.root,narrow.root);
  this.makeTrace(root,V(-3.45,.40,1.25),7.0,'pressure');
  // Large detached cross section behind the narrowed segment reveals the
  // relationship between muscular wall and lumen without a text-heavy chart.
  const cross=new T.Group();cross.position.set(5.2,1.80,-.3);cross.rotation.y=-.4;root.add(cross);
  const ring=new T.Mesh(new T.TorusGeometry(.94,.19,16,64),material(C.red));cross.add(ring);this.displayRings.push(ring);
  const rim=new T.Mesh(new T.TorusGeometry(.71,.035,10,64),material(C.inner));rim.position.z=.08;cross.add(rim);this.displayRings.push(rim);
  for(let i=0;i<3;i++){const th=i/3*Math.PI*2+.3;const cell=sphere(.105,C.red,16);cell.position.set(Math.cos(th)*.30,Math.sin(th)*.30,.02);cell.scale.set(1,.70,.36);cross.add(cell);}
 }
 private makeTrace(parent:T.Group,position:T.Vector3,width:number,kind:'pressure'|'pulse'){
  const root=new T.Group();root.position.copy(position);parent.add(root);
  const positions=new Float32Array(241*3);const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(positions,3));
  const l=new T.Line(geo,new T.LineBasicMaterial({color:C.red,transparent:true,opacity:.80}));root.add(l);
  root.add(line([V(0,-.11,0),V(width,-.11,0)],'#b0aaa0',.55));
  for(let i=0;i<9;i++)root.add(line([V(width*i/8,-.17,0),V(width*i/8,-.07,0)],'#b8afa1',.45));
  const trace={line:l,positions,kind,width,phase:0,root};this.traces.push(trace);return trace;
 }
 private addRoute(parent:T.Group,points:T.Vector3[],color:string,radius=.055,count=8,speed=.13,mode='generic'){
  const curve=new T.CatmullRomCurve3(points),root=new T.Group();parent.add(root);
  const path=new T.Mesh(new T.TubeGeometry(curve,90,radius,8,false),material(color,.62));root.add(path);
  const dots:T.Mesh[]=[];for(let i=0;i<count;i++){const dot=sphere(radius*(mode==='filtrate'?1.42:2.05),color,12);dot.material=new T.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.12,roughness:.25});root.add(dot);dots.push(dot);}
  const route={curve,root,dots,speed,phase:0,mode};this.routes.push(route);return route;
 }
 private buildKidneyDiagram(){
  const root=this.stations.kidney.root;this.renalDiagram.position.set(1.35,2.9,.2);root.add(this.renalDiagram);const d=this.renalDiagram;
  const outer=new T.Mesh(new T.SphereGeometry(.72,40,28),new T.MeshPhysicalMaterial({color:'#dab894',transparent:true,opacity:.18,roughness:.55,side:T.DoubleSide,depthWrite:false}));outer.position.set(-.9,1.18,0);d.add(outer);
  // Glomerulus loops retain red cells; the separate blue nephron is filtrate.
  for(let k=0;k<5;k++){
   const p:T.Vector3[]=[];for(let i=0;i<=70;i++){const a=i/70*Math.PI*2;p.push(V(-.9+.44*Math.cos(a),1.18+.43*Math.sin(a),.18*Math.sin(3*a+k)+.10*(k-2)));}
   d.add(tube(p,.052,k%2?C.coral:C.red));
  }
  this.addRoute(d,[V(-2.45,1.8,0),V(-1.8,1.8,.15),V(-1.3,1.55,.17),V(-.86,1.3,.2)],C.red,.065,5,.15,'blood');
  this.addRoute(d,[V(-.80,1.4,-.2),V(-.20,1.8,-.1),V(1.0,1.8,-.1),V(2.1,.9,-.25),V(2.2,-1.6,-.25)],C.red,.052,7,.13,'blood');
  const filtrate=[V(-.80,.55,.08),V(-.65,-.05,.08),V(.20,-.10,.1),V(.58,.50,.15),V(1.03,.38,.15),V(.80,-.6,.1),V(.20,-1.40,.08),V(.43,-1.96,.02),V(1.2,-1.89,.0),V(1.50,-.75,.0),V(1.8,.15,.0),V(2.15,-.15,.0),V(2.65,-2.0,.0)];
  this.addRoute(d,filtrate,C.teal,.086,15,.065,'filtrate');
  for(let i=0;i<4;i++)this.addRoute(d,[V(.60,-.5-i*.22,.30),V(1.04,-.38-i*.15,.50),V(1.63,.1-i*.15,.44),V(2.06,.34-i*.15,.12)],i%2?C.gold:C.blue,.017,3,.14,'reabsorb');
  const tank=rounded(.62,2.9,.62,.14,'#c0d4d2');tank.position.set(4.52,2.0,-.1);root.add(tank);
  const water=new T.Mesh(new RoundedBoxGeometry(.48,1.5,.48,3,.10),new T.MeshStandardMaterial({color:C.teal,transparent:true,opacity:.7,roughness:.3}));water.position.set(4.52,1.42,.04);root.add(water);this.waterTank=water;
  for(let i=0;i<6;i++)root.add(line([V(4.92,.64+i*.44,.2),V(5.09,.64+i*.44,.2)],'#809796',.55));
  root.add(tube([V(-2.3,4.6,-.1),V(-1.8,4.9,.1),V(-1.2,4.75,.15),V(-1.02,4.64,.2)],.035,C.gold));
 }
 private buildControl(){
  const root=this.stations.control.root;
  const brain=this.organ('brain',1.9,'#bdad94');brain.position.set(-2.6,5.5,-.25);brain.rotation.y=.28;root.add(brain);this.controlBrain=brain;
  const heart=this.organ('heart',1.65,C.red);heart.position.set(.15,3.5,.1);root.add(heart);this.controlHeart=heart;this.organs.push({group:heart,baseScale:1,kind:'control'});
  const kidney=new T.Group();const left=this.organ('leftKidney',1.12,'#a26952'),right=this.organ('rightKidney',1.10,'#a26952');left.position.x=-.58;right.position.x=.58;kidney.add(left,right);kidney.position.set(-2.30,1.25,.1);root.add(kidney);this.controlKidneys=kidney;
  const vessel=this.makeVessel(3.2,.47,.16);vessel.root.position.set(3.7,3.4,.1);root.add(vessel.root);vessel.phase=.35;
  const routes=[
   [V(-2.3,4.75,.10),V(-1.35,4.5,.65),V(-.4,4.03,.50),V(.12,3.88,.30)],
   [V(-2.55,4.7,.1),V(-3.35,3.6,.4),V(-3.2,2.3,.25),V(-2.5,1.65,.2)],
   [V(-2.05,5.0,.1),V(.55,5.25,.3),V(2.7,4.85,.25),V(3.9,4.1,.1)],
   [V(-1.6,1.48,.15),V(.10,1.20,.5),V(2.50,1.90,.65),V(3.72,2.88,.22)]
  ];
  routes.forEach((points,i)=>{const r=this.addRoute(root,points,i===3?C.teal:C.gold,.035,i===3?7:5,.09,i===3?'hormone':'nerve');r.phase=i*.17;this.signals.push(r)});
  const adrenal=sphere(.2,C.gold,18);adrenal.scale.set(1.65,.45,.8);adrenal.position.set(-2.9,1.84,.2);root.add(adrenal);
  this.addRoute(root,[V(-2.87,1.9,.26),V(-3.55,2.13,.4),V(-3.57,1.16,.4),V(-2.80,.98,.23)],C.gold,.027,5,.12,'aldosterone');
 }
 private buildRemodel(){
  const root=this.stations.remodel.root;
  const compliant=this.makeVessel(7.1,.67,.14);compliant.root.position.set(-.40,4.95,-.20);compliant.phase=.3;root.add(compliant.root);
  const stiff=this.makeVessel(7.1,.67,.34);stiff.root.position.set(-.40,2.18,.20);stiff.phase=.3;root.add(stiff.root);
  const lower=this.makeTrace(root,V(-3.40,.55,1.2),7.2,'pressure');lower.phase=.1;
  const upper=this.makeTrace(root,V(-3.40,6.15,0),7.2,'pressure');upper.phase=.1;
  // Outer collagen-like bands emphasize reduced compliance. The plaque insert
  // below is kept separate so ordinary hypertension is not misexplained as a
  // simple blocked-artery story.
  for(let i=0;i<12;i++){const band=new T.Mesh(new T.TorusGeometry(1.05,.026,7,50,Math.PI*1.28),material('#b8a084'));band.rotation.y=Math.PI/2;band.rotation.z=1.36*Math.PI;band.position.set(-3.80+i*.59,2.18,.2);root.add(band);}
  // A separate, deliberately small mechanism insert shows how LDL can enter
  // a damaged wall and how a plaque may narrow the lumen. It is a risk-factor
  // vignette, not a claim that every case of hypertension is an occlusion.
  const plaque=new T.Group();plaque.name='ldl-plaque-mechanism';plaque.position.set(.55,0,0);stiff.root.add(plaque);this.plaqueRoot=plaque;
  const lipidMat=new T.MeshPhysicalMaterial({color:'#d2a34e',roughness:.38,metalness:.02,clearcoat:.32,clearcoatRoughness:.22,transparent:true,opacity:.94});
  const capMat=new T.MeshPhysicalMaterial({color:'#cf7568',roughness:.42,metalness:.015,clearcoat:.24,transparent:true,opacity:.95});
  const core=new T.Mesh(new T.SphereGeometry(.34,28,18),lipidMat);core.name='lipid-core';core.position.set(.12,.06,.62);core.scale.set(1.24,.88,.42);plaque.add(core);this.plaqueCore=core;
  const cap=new T.Mesh(new T.SphereGeometry(.30,28,18),capMat);cap.name='fibrous-cap';cap.position.set(.12,.22,.69);cap.scale.set(1.35,.43,.22);plaque.add(cap);this.plaqueCap=cap;
  const clotMat=new T.MeshPhysicalMaterial({color:'#783b37',roughness:.5,metalness:.015,transparent:true,opacity:.0});
  const clot=new T.Mesh(new T.SphereGeometry(.24,24,16),clotMat);clot.name='downstream-clot-example';clot.position.set(1.15,-.05,.56);clot.scale.set(1.28,.78,.58);plaque.add(clot);this.plaqueClot=clot;
  // Gold LDL particles travel from the lumen toward the wall during the
  // mechanism line, then settle into the lipid core as the camera holds.
  for(let i=0;i<12;i++){
   const p=sphere(.062,C.gold,12);p.name=`ldl-particle-${i+1}`;p.userData.seed=i*.61803398875;
   p.position.set(-2.8+(i%4)*.9,-.32+((i*3)%5)*.16,.27+((i*7)%5)*.08);p.scale.setScalar(.72+.22*(i%3));plaque.add(p);this.plaqueParticles.push(p);
  }
  const halo=new T.Mesh(new T.TorusGeometry(.51,.018,8,48,Math.PI*1.15),new T.MeshBasicMaterial({color:'#e1bc65',transparent:true,opacity:.0}));
  halo.name='plaque-focus-ring';halo.rotation.y=Math.PI/2;halo.rotation.z=1.12*Math.PI;halo.position.set(.15,.02,.59);plaque.add(halo);
 }
 private buildMeasure(){
  const root=this.stations.measure.root;const body=new T.Group();body.position.set(-.85,0,-.4);root.add(body);
  // The seated mannequin explains supported back, feet and heart-level arm.
  // It is deliberately a smooth neutral teaching figure, distinct from atlas.
  const shirt=material('#b9c7c1',.86),skin=material(C.skin,.76),trouser=material('#576e70',.8);
  const torso=rounded(1.6,2.4,.8,.43,'#b9c7c1');torso.position.set(-.72,3.39,-.12);torso.rotation.z=-.025;body.add(torso);
  const head=sphere(.56,C.skin,32);head.scale.set(.85,1.07,.9);head.position.set(-.76,5.24,-.10);body.add(head);
  const neck=new T.Mesh(new T.CapsuleGeometry(.22,.28,8,16),skin);neck.position.set(-.75,4.56,-.1);body.add(neck);
  const limb=(a:T.Vector3,b:T.Vector3,r:number,mat:T.MeshStandardMaterial)=>{const mesh=rod(a,b,r,'#fff');mesh.material=mat;body.add(mesh);body.add(new T.Mesh(new T.SphereGeometry(r,18,12),mat).translateX(a.x).translateY(a.y).translateZ(a.z));return mesh;};
  limb(V(-.2,4.03,.0),V(.25,2.99,.48),.22,shirt);limb(V(.25,2.99,.48),V(2.13,3.00,.69),.19,skin);const hand=sphere(.24,C.skin,20);hand.position.set(2.20,3,.68);hand.scale.set(1.40,.47,.88);body.add(hand);
  limb(V(-1.28,4.03,0),V(-1.63,2.83,.28),.22,shirt);limb(V(-1.63,2.83,.28),V(-1.0,2.17,.67),.18,skin);
  for(const x of [-1.12,-.24]){limb(V(x,2.27,0),V(x,2.06,1.49),.29,trouser);limb(V(x,2.06,1.49),V(x,.29,1.72),.22,trouser);const shoe=rounded(.58,.33,1.10,.15,'#d5d2c8');shoe.position.set(x,.02,1.93);body.add(shoe);}
  const chair=rounded(2.2,.28,2.1,.18,'#bda784');chair.position.set(-.77,1.97,.30);body.add(chair);const back=rounded(2.13,2.1,.21,.21,'#bda784');back.position.set(-.77,3.0,-.68);back.rotation.x=-.07;body.add(back);
  for(const x of [-1.57,.05])for(const z of [-.43,1])body.add(rod(V(x,1.97,z),V(x,-.3,z+.1),.075,'#a28c6c'));
  const table=rounded(3.7,.20,2.5,.12,'#ddd6c9');table.position.set(2.55,2.74,.35);root.add(table);for(const x of [1.22,3.85])root.add(rod(V(x,2.64,.2),V(x,-.3,.2),.085,'#ae9e88'));
  const cuff=new T.Mesh(new T.CylinderGeometry(.30,.30,.7,36,1,true),material('#567677',.9));cuff.rotation.z=-.39;cuff.position.set(-.61,3.61,-.05);root.add(cuff);
  this.buildMonitor(root,true);
  root.add(tube([V(-.6,3.7,.12),V(.2,3.27,.7),V(1.8,2.91,1.02),V(2.6,2.92,1.1)],.039,'#567677'));
  root.add(line([V(-.8,3.65,.4),V(2.25,3.65,.4)],C.gold,.75));
  const clockRoot=new T.Group();clockRoot.position.set(3.53,5.2,-.7);root.add(clockRoot);
  const ring=new T.Mesh(new T.TorusGeometry(.62,.026,8,60),material('#869a94'));clockRoot.add(ring);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;clockRoot.add(rod(V(Math.sin(a)*.53,Math.cos(a)*.53,0),V(Math.sin(a)*.58,Math.cos(a)*.58,0),.012,'#869a94'));}
  const handClock=rod(V(),V(.0,.43,0),.021,C.gold);const pivot=new T.Group();pivot.add(handClock);clockRoot.add(pivot);this.clockHand=handClock;pivot.name='clockPivot';
 }
 private pulse(t:number){const phase=((t*1.2)%1+1)%1;return Math.exp(-(((phase-.18)/.11)**2))+.20*Math.exp(-(((phase-.42)/.15)**2));}
 private solvedPressure(name:string,time:number){const data=this.physics?.cases[name];if(!data)return .5;const phase=((time/data.period)%1+1)%1,index=phase*(data.samples.length-1),i=Math.floor(index);return mix(data.samples[i].pressure,data.samples[Math.min(i+1,data.samples.length-1)].pressure,index-i);}
 private solvedExpansion(name:string,time:number){const d=this.physics?.cases[name];if(!d)return this.pulse(time);return clamp((this.solvedPressure(name,time)-d.diastolic)/Math.max(1,d.systolic-d.diastolic));}
 private updateVessel(v:Vessel,time:number,constriction:number,compliance:number,thicknessGrowth=0){
  const positions=v.geo.attributes.position as T.BufferAttribute,original=v.base.attributes.position as T.BufferAttribute,nx=48,nt=42,rows=(nx+1)*(nt+1),beat=this.solvedExpansion(compliance<.012?'stiffer_artery':'baseline',time+v.phase);
  const lumen=(x:number)=>v.radius*(1-constriction*Math.exp(-((x/(v.length*.26))**4)))*(1+compliance*beat);
  // Advect cells in cumulative lumen volume, not a hand-drawn acceleration.
  // At fixed flow, dx/dt is proportional to 1/area. Particle population also
  // follows vessel volume, so narrowing does not invent a larger inflow.
  const volume=[0],samples=96;for(let i=1;i<=samples;i++){const x=v.length*((i-.5)/samples-.5);volume.push(volume[i-1]+(lumen(x)/v.radius)**2/samples);}const total=volume[samples];
  const xAt=(q:number)=>{const value=q*total;let lo=0,hi=samples;while(hi-lo>1){const mid=(lo+hi)>>1;if(volume[mid]<value)lo=mid;else hi=mid;}return ((lo+(value-volume[lo])/Math.max(1e-8,volume[hi]-volume[lo]))/samples-.5)*v.length;};
  for(let i=0;i<positions.count;i++){
   const x=original.getX(i),surface=i>=rows,originalR=surface?v.radius:v.radius+v.thickness;
   const radius=lumen(x)+(surface?0:v.thickness*(1+thicknessGrowth));positions.setXYZ(i,x,original.getY(i)*radius/originalR,original.getZ(i)*radius/originalR);
  }positions.needsUpdate=true;v.geo.computeVertexNormals();
  for(const ring of v.rings){const radius=lumen(ring.position.x)+v.thickness*(1+thicknessGrowth);ring.scale.setScalar((radius+.032)/(v.radius+v.thickness+.032));}
  for(let i=0;i<v.count;i++){
   const seed=(i*.61803398875)%1;const u=((i/v.count+time*v.flow*.13/total)%1+1)%1,x=xAt(u);
   const th=i*2.399963,r=lumen(x)*(.19+.51*((i*.317)%1));const edge=smooth(Math.min(u,1-u)/.055);
   this.dummy.position.set(x,Math.cos(th)*r,Math.sin(th)*r);this.dummy.rotation.set(.48*Math.sin(time*.55+i),.25+seed*1.7,time*.48+i);
   const population=smooth(clamp((Math.min(1,total)-((i*.41421356237)%1))/.08));this.dummy.scale.setScalar(edge*(.86+.30*seed)*population);this.dummy.updateMatrix();v.cells.setMatrixAt(i,this.dummy.matrix);
  }v.cells.instanceMatrix.needsUpdate=true;
  v.stream.forEach((l,i)=>{const p=l.geometry.attributes.position as T.BufferAttribute,th=.95+i*.7;for(let k=0;k<p.count;k++){const x=(k/(p.count-1)-.5)*v.length,r=lumen(x)*.46;p.setXYZ(k,x,Math.cos(th)*r,Math.sin(th)*r);}p.needsUpdate=true;});
 }
 private pose(scene:string,progress:number,lineIndex:number,lineProgress:number,time:number):Pose{
  const key=this.stations[scene]?scene:'intro',station=this.stations[key];const p=clamp(progress),u=lineIndex+lineProgress;let target=station.center.clone(),az=.12+.13*Math.sin((p-.5)*Math.PI),el=.16,dist=14.2,fov=35;
  if(key==='intro'){target.add(V(-.8,-.27,.2));az=.20-.25*p;el=.25;dist=12.1-1.10*smooth(clamp((u-1.0)/1.2));if(u>2.1){const reveal=smooth(clamp((u-2.1)/1.8));dist=mix(dist,14.6,reveal);az=mix(az,-.10,reveal);}}
  if(key==='anatomy'){
   // One anatomical take: settle on the chest, travel along the great vessel,
   // then push through the cutaway rather than replacing the body with a
   // detached diagram.
   target.y=3.92;az=-.18+.26*p;el=.045;dist=14.85;
   const heartFocus=1-smooth(clamp((u-.55)/.6));target.x+=-.95*heartFocus;target.y=mix(target.y,4.35,heartFocus);dist=mix(dist,11.35,heartFocus);fov=mix(35,31,heartFocus);
   const flowFocus=smooth(clamp((u-.78)/.52))*(1-smooth(clamp((u-1.92)/.54)));
   target.x=mix(target.x,station.center.x+1.65,flowFocus);target.y=mix(target.y,4.32,flowFocus);dist=mix(dist,12.4,flowFocus);fov=mix(fov,33,flowFocus);
   const wall=smooth(clamp((u-1.78)/.82));target.x=mix(target.x,station.center.x+12.55,wall);target.y=mix(target.y,5.18,wall);dist=mix(dist,9.25,wall);el=mix(el,.13,wall);fov=mix(fov,30,wall);
   const lumen=smooth(clamp((u-3.08)/.78));target.x+=.55*lumen;target.z+=.34*lumen;dist=mix(dist,8.55,lumen);fov=mix(fov,28.5,lumen);
  }
  if(key==='pump'){
   target.add(V(.15,.25,.1));az=.21-.40*p;el=.17;dist=14.9;
   const heart=smooth(clamp((1.25-u)/.75));target.x-=1.3*heart;dist-=1.15*heart;fov=mix(35,31,heart);
   const detail=smooth(clamp((u-1.2)/.6))*(1-smooth(clamp((u-2.9)/.6)));target.x+=1.35*detail;target.y+=.3*detail;dist-=1.0*detail;fov=mix(fov,30,detail);
  }
  if(key==='resistance'){target.add(V(.85,.13,.1));az=-.24+.60*p;el=.22;dist=15.5;const detail=smooth(clamp((u-1.25)/.9))*(1-smooth(clamp((u-3.5)/.75)));target.y-=.38*detail;target.x+=.18*detail;dist-=2.15*detail;}
  if(key==='kidney'){
   target.add(V(.20,-.10,.1));az=.20-.35*p;el=.12;dist=14.8;
   const kidneyEntry=1-smooth(clamp((u-.88)/.55));target.x-=.72*kidneyEntry;target.y+=.2*kidneyEntry;dist=mix(dist,12.7,kidneyEntry);fov=mix(35,31,kidneyEntry);
   const detail=smooth(clamp((u-1.0)/.7))*(1-smooth(clamp((u-4.2)/.7)));target.x+=1.65*detail;dist-=2.7*detail;fov=mix(fov,29,detail);
  }
  if(key==='control'){
   target.add(V(.25,.12,.0));az=-.12+.32*p;el=.10;dist=15.3;
   const brainFocus=1-smooth(clamp((u-.72)/.55));target.x-=.65*brainFocus;target.y+=.28*brainFocus;dist=mix(dist,13.2,brainFocus);fov=mix(35,31.5,brainFocus);
   const detail=smooth(clamp((u-1.0)/.6))*(1-smooth(clamp((u-3.5)/.8)));target.x+=.75*detail;dist-=.85*detail;fov=mix(fov,29.5,detail);
  }
  if(key==='remodel'){
   target.add(V(.15,.15,.1));az=-.17+.39*p;el=.18;dist=15.7;
   const vesselFocus=1-smooth(clamp((u-.72)/.56));target.x-=.95*vesselFocus;target.y-=.08*vesselFocus;dist=mix(dist,13.6,vesselFocus);fov=mix(35,32,vesselFocus);
   const detail=smooth(clamp((u-.65)/.65))*(1-smooth(clamp((u-3.0)/.6)));target.y-=.34*detail;dist-=1.20*detail;fov=mix(fov,29.5,detail);
   const risk=smooth(clamp((u-5.55)/1.0));target.x+=11.4*risk;target.y+=.2*risk;dist=mix(dist,10.3,risk);fov=mix(fov,31,risk);
  }
  if(key==='measure'){target.add(V(.45,-.15,.15));az=.40-.22*p;el=.17;dist=14.0;const close=smooth(clamp((u-3.10)/.8));target.x+=1.2*close;target.y-=.15*close;dist-=1.1*close;}
  if(key==='references'){target.add(V(-1.7,-.3,0));az=.10+.07*p;el=.12;dist=15;}
  const position=target.clone().add(V(Math.sin(az)*Math.cos(el),Math.sin(el),Math.cos(az)*Math.cos(el)).multiplyScalar(dist));
  // Looking slightly above the scene center keeps the floor below the subtitle
  // zone and reserves the upper-left brand without shrinking every object.
  return {position,target,fov};
 }
 private cameraAt(s:FrameState){
  const pose=this.pose(s.scene,s.progress,s.line,s.lineProgress,s.time);const travel=3.4;
  if(s.previous&&s.elapsed<travel){
   const old=this.pose(s.previous,1,100,1,s.time-s.elapsed),t=smooth(s.elapsed/travel);pose.position.lerpVectors(old.position,pose.position,t);pose.target.lerpVectors(old.target,pose.target,t);pose.fov=mix(old.fov,pose.fov,t);
   const arc=Math.sin(t*Math.PI);pose.position.y+=.46*arc;pose.position.z+=1.10*arc;pose.target.y+=.12*arc;
  }
  this.camera.position.copy(pose.position);this.camera.lookAt(pose.target);this.camera.fov=pose.fov;this.camera.updateProjectionMatrix();
  const key=this.scene.getObjectByName('key') as T.DirectionalLight;key.position.copy(pose.target).add(V(-6,10,7));key.target.position.copy(pose.target);
  const fill=this.scene.getObjectByName('fill') as T.DirectionalLight;fill.position.copy(pose.target).add(V(7,4,-5));fill.target.position.copy(pose.target);
 }
 private drawScreen(screen:typeof this.screenTextures[number],time:number){
  const mode=screen.mode,phase=mode==='intro'?clamp((time-1.5)/2):1;const sys=mode==='intro'?Math.round(mix(0,152,smooth(phase))):146,dia=mode==='intro'?Math.round(mix(0,94,smooth(phase))):92;
  const text=`${sys}/${dia}`;if(screen.last===text)return;screen.last=text;const ctx=screen.canvas.getContext('2d')!;ctx.fillStyle='#d6dfce';ctx.fillRect(0,0,768,448);
  ctx.fillStyle='#3c5550';ctx.font='600 204px Arial';ctx.textAlign='right';ctx.fillText(String(sys),608,209);ctx.font='600 159px Arial';ctx.fillText(String(dia),608,385);
  ctx.textAlign='left';ctx.font='600 41px Microsoft YaHei';ctx.fillText('高压',44,142);ctx.fillText('低压',44,324);ctx.font='35px Arial';ctx.fillText('mmHg',530,431);screen.texture.needsUpdate=true;
 }
 render(s:FrameState){
  if(this.disposed)return;this.elapsed=s.time;this.cameraAt(s);const u=s.line+s.lineProgress,beat=this.pulse(s.time);
  for(const screen of this.screenTextures)this.drawScreen(screen,s.time);
  for(const organ of this.organs){const contraction=organ.kind==='control'&&s.scene==='control'?.047:.028;organ.group.scale.set(1-contraction*beat,1-contraction*.65*beat,1-contraction*.55*beat);}
  if(this.atlas){
   this.atlas.rotation.y=-.10+.10*Math.sin(s.time*.065);
   const current=s.scene==='anatomy'?u:100;
   const anatomyReveal=s.scene==='anatomy'?smooth(clamp((u-1.65)/1.25)):0;
   this.atlasGroups.bodySurface.traverse(o=>{if(o instanceof T.Mesh){const m=o.material as T.MeshStandardMaterial;m.opacity=s.scene==='anatomy'?mix(.082,.032,anatomyReveal):.06+.025*(1-smooth(clamp(current)));}});
   this.atlasGroups.arteries.traverse(o=>{if(o instanceof T.Mesh){const m=o.material as T.MeshStandardMaterial;m.emissive.set(C.red);m.emissiveIntensity=.04+.06*beat;}});
  }
  if(this.continuityAtlas){
   const measureExit=s.scene==='measure'&&s.previous==='remodel'?smooth(clamp((s.elapsed-2.30)/1.05)):0;
   const visible=!['intro','measure','references'].includes(s.scene)||
    (s.scene==='anatomy'&&s.previous==='intro'&&s.elapsed<3.4)||
    (s.scene==='measure'&&s.previous==='remodel'&&s.elapsed<3.6);
   this.continuityAtlas.visible=visible;
   if(visible){
    const targetX=this.stations[s.scene]?.root.position.x??this.stations.anatomy.root.position.x;
    const oldX=s.previous&&this.stations[s.previous]?this.stations[s.previous].root.position.x:targetX;
    const travel=s.previous&&s.elapsed<3.4?smooth(s.elapsed/3.4):1;
    this.continuityAtlas.position.x=mix(oldX,targetX,travel)+13*measureExit;
    this.continuityAtlas.rotation.y=-.10+.10*Math.sin(s.time*.065)+.04*Math.sin(travel*Math.PI);
    // A subtle breathing-like scale keeps the ghost attached to the camera
    // corridor while preserving the atlas proportions.
    const scale=(1+.006*Math.sin(s.time*.9))*(1-.16*measureExit);this.continuityAtlas.scale.setScalar(scale);
   }
  }
  // Vessel order: resistance healthy/narrow, remodel compliant/stiff, then
  // pump and control are appended after atlas load. Semantic parent IDs avoid
  // assumptions about asynchronous asset-load ordering.
  for(const vessel of this.vessels){
   const station=ORDER.find(k=>vessel.root.parent===this.stations[k].root);let narrow=0,compliance=.04,growth=0;
   if(station==='resistance'){
    const active=s.scene==='resistance'?u:(s.previous==='resistance'?5:0);const lower=vessel.root.position.y<3;
    narrow=lower?.44*smooth(clamp((active-.7)/1.1)):0;compliance=.035;vessel.flow=.60;
   }
   if(station==='remodel'){
    const lower=vessel.root.position.y<3;const active=s.scene==='remodel'?u:(s.previous==='remodel'?5:0);const stiff=smooth(clamp((active-.55)/1.2));
    narrow=lower?.10*stiff:0;compliance=lower?mix(.075,.008,stiff):.075;growth=lower?.30*stiff:0;vessel.flow=.60;
   }
   if(station==='control'){const active=s.scene==='control'?u:ORDER.indexOf(s.scene)>ORDER.indexOf('control')?7:0;narrow=.18*smooth(clamp((active-.9)/1.5));compliance=.025;vessel.flow=.7;}
   if(station==='pump'){compliance=.13;vessel.flow=.8;}
   this.updateVessel(vessel,s.time,narrow,compliance,growth);
   if(station==='anatomy'){
    const reveal=s.scene==='anatomy'?smooth(clamp((u-2.0)/.8)):0;
    const m=vessel.mesh.material as T.MeshStandardMaterial;m.transparent=true;m.depthWrite=reveal<.2;m.opacity=mix(.96,.76,reveal);
   }
  }
  if(this.plaqueRoot){
   const active=s.scene==='remodel'?u:(ORDER.indexOf(s.scene)>ORDER.indexOf('remodel')?7:0);
   const plaqueQ=smooth(clamp((active-2.25)/.82));
   const clotQ=smooth(clamp((active-4.05)/.72));
   this.plaqueRoot.visible=plaqueQ>.001;this.plaqueRoot.scale.setScalar(.62+.38*plaqueQ);
   if(this.plaqueCore){const m=this.plaqueCore.material as T.MeshPhysicalMaterial;m.opacity=.94*plaqueQ;this.plaqueCore.scale.set(1.24, .88, .42+.10*plaqueQ);}
   if(this.plaqueCap){const m=this.plaqueCap.material as T.MeshPhysicalMaterial;m.opacity=.95*plaqueQ;this.plaqueCap.scale.set(1.35,.43,.22+.06*plaqueQ);}
   if(this.plaqueClot){const m=this.plaqueClot.material as T.MeshPhysicalMaterial;m.opacity=.82*clotQ;this.plaqueClot.scale.set(1.28*clotQ,.78*clotQ,.58*clotQ);}
   const halo=this.plaqueRoot.getObjectByName('plaque-focus-ring') as T.Mesh|undefined;
   if(halo){const m=halo.material as T.MeshBasicMaterial;m.opacity=.66*plaqueQ*(.62+.38*Math.sin(s.time*3.2)**2);halo.scale.setScalar(1+.08*Math.sin(s.time*2.4));}
   this.plaqueParticles.forEach((p,i)=>{
    const seed=(p.userData.seed as number)||0;const drift=((plaqueQ*1.35+seed)%1+1)%1;const arrive=smooth(clamp(drift/.72));
    const startX=-2.8+(i%4)*.9,startY=-.32+((i*3)%5)*.16,startZ=.27+((i*7)%5)*.08;
    p.position.set(mix(startX,.16,arrive),mix(startY,.09,arrive)+.045*Math.sin(s.time*2.0+i),mix(startZ,.64,arrive));
    const pm=p.material as T.MeshStandardMaterial;pm.emissive.set(C.gold);pm.emissiveIntensity=.16+.26*plaqueQ;pm.transparent=true;pm.opacity=.15+.82*plaqueQ;
    p.scale.setScalar((.72+.22*(i%3))*(.65+.35*plaqueQ));
   });
  }
  for(const route of this.routes){
   const active=route.mode==='reabsorb'?(s.scene==='kidney'?smooth(clamp((u-1.8)/.8)):1):route.mode==='nerve'?(s.scene==='control'?smooth(clamp((u-3.0)/.65)):1):1;
   route.dots.forEach((dot,i)=>{const x=((s.time*route.speed+route.phase+i/route.dots.length)%1+1)%1;dot.position.copy(route.curve.getPointAt(x));const edge=smooth(Math.min(x,1-x)/.06);dot.scale.setScalar(edge*(route.mode==='reabsorb'?.4+.8*active:route.mode==='nerve'?.2+.8*active:1));});
  }
  for(const trace of this.traces){
   const station=ORDER.find(k=>trace.root.parent===this.stations[k].root);const high=station==='remodel'&&trace.root.position.y<2;
   for(let i=0;i<trace.positions.length/3;i++){const x=i/(trace.positions.length/3-1),phase=((x*3.4-s.time*.40+trace.phase)%1+1)%1;
    const pulse=Math.exp(-(((phase-.22)/.10)**2))+.19*Math.exp(-(((phase-.47)/.14)**2));let amp=high?1.05:.52;
    if(station==='resistance'&&s.scene==='resistance')amp=.40+.38*smooth(clamp((u-1)/2));
    const resistanceRaised=station==='resistance'&&((s.scene==='resistance'&&u>1.6)||ORDER.indexOf(s.scene)>ORDER.indexOf('resistance'));const model=high?'stiffer_artery':resistanceRaised?'higher_resistance':'baseline';const realPressure=this.solvedPressure(model,s.time-2.7*(1-x));const y=this.physics?(realPressure-55)/75:pulse*amp;
    trace.positions[i*3]=x*trace.width;trace.positions[i*3+1]=y;trace.positions[i*3+2]=.0;
   }(trace.line.geometry.attributes.position as T.BufferAttribute).needsUpdate=true;
  }
  if(this.waterTank){const q=s.scene==='kidney'?smooth(clamp((u-1.85)/2.4)):ORDER.indexOf(s.scene)>ORDER.indexOf('kidney')?1:0;this.waterTank.scale.y=.65+q*.48;this.waterTank.position.y=1.15+.35*q;}
  if(this.renalShell){const q=s.scene==='kidney'?smooth(clamp((u-.65)/1.0))*(1-smooth(clamp((u-4.45)/.5))):0;this.renalShell.traverse(o=>{if(o instanceof T.Mesh){const m=o.material as T.MeshStandardMaterial;m.transparent=true;m.opacity=1-.46*q;m.depthWrite=q<.1;}});}
  if(this.clockHand?.parent){this.clockHand.parent.rotation.z=-s.time*.23;}
  for(const ring of this.displayRings){const q=s.scene==='resistance'?smooth(clamp((u-1.1)/1.1)):ORDER.indexOf(s.scene)>ORDER.indexOf('resistance')?1:0;ring.scale.setScalar(1-.19*q);}
  this.scene.updateMatrixWorld(true);this.renderer.render(this.scene,this.camera);
 }
 /** Lightweight projected positions for optional Film annotations. */
 getAnchors(){
  const result:Record<string,{x:number;y:number;visible:boolean}>={};
  const points:Record<string,T.Vector3>={heart:V(this.stations.pump.center.x-2.25,3.5,.3),arteriole:V(this.stations.resistance.center.x+.1,2.45,.7),kidney:V(this.stations.kidney.center.x-2.8,3.3,.25),nephron:V(this.stations.kidney.center.x+2.1,3.3,.3)};
  for(const [name,point] of Object.entries(points)){const p=point.project(this.camera);result[name]={x:(p.x+1)*960,y:(1-p.y)*540,visible:Math.abs(p.x)<.9&&Math.abs(p.y)<.8&&p.z>-1&&p.z<1};}return result;
 }
 dispose(){
  this.disposed=true;const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
  this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){geometries.add(o.geometry);for(const mat of Array.isArray(o.material)?o.material:[o.material]){materials.add(mat);for(const value of Object.values(mat))if(value instanceof T.Texture)textures.add(value);}}});
  for(const v of this.vessels)geometries.add(v.base);geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());this.environment.dispose();this.renderer.dispose();
 }
}
