import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {CameraPath} from './CameraPath';
import {C,V,State,Timeline,channel,ramp,pulse,mix,Label,clamp} from './visual';

type Part={id:string;role:string;zone:number;root:T.Group;meshes:T.Mesh[];center:T.Vector3;offset:T.Vector3;materials:T.MeshStandardMaterial[];restVertices:Float32Array[]};
type Route={curve:T.CurvePath<T.Vector3>;line:T.Mesh;dots:T.Mesh[];kind:string};
const color=(s:string)=>new T.Color(s);
export class World{
 ready:Promise<void>;parts:Part[]=[];tower=new T.Group();ground=new T.Group();routes:Route[]=[];flow=new T.Group();flowDots:T.Mesh[]=[];flowPaths:T.Vector3[][]=[];
 environment:T.WebGLRenderTarget;path:CameraPath;cut=new T.Plane(V(0,-1,0),100);state?:State;anchors:any;tmdAnchors:any;eddy=new T.Group();eddyDots:T.Mesh[]=[];platform=new T.Group();
 constructor(public scene:T.Scene,public camera:T.PerspectiveCamera,public renderer:T.WebGLRenderer,base:string,tl:Timeline){
  this.path=new CameraPath(tl);scene.background=color(C.paper);scene.fog=new T.Fog(C.paper,23,58);
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=.87;
  renderer.localClippingEnabled=true;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  const pm=new T.PMREMGenerator(renderer);this.environment=pm.fromScene(new RoomEnvironment(),.035);scene.environment=this.environment.texture;scene.environmentIntensity=.48;pm.dispose();
  scene.add(new T.HemisphereLight('#fff7e8','#647d87',1.25));
  const key=new T.DirectionalLight('#fff3dc',2.5);key.position.set(-5,10,7);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-5,right:5,top:8,bottom:-4,near:.1,far:26});key.shadow.bias=-.00007;key.shadow.normalBias=.004;scene.add(key);
  const rim=new T.DirectionalLight('#bbdbea',2.2);rim.position.set(5,7,-6);scene.add(rim);
  const ground=new T.Mesh(new T.PlaneGeometry(160,160),new T.MeshStandardMaterial({color:'#e6e8e2',roughness:.85}));ground.rotation.x=-Math.PI/2;ground.position.y=-1.35;ground.receiveShadow=true;scene.add(ground);
  scene.add(this.tower,this.ground,this.flow,this.eddy,this.platform);this.makeSite();this.makeFlow();this.makeEddy();this.makePlatform();
  this.ready=Promise.all([new GLTFLoader().loadAsync(base+'models/shanghai-tower.glb'),fetch(base+'models/shanghai-tower-manifest.json').then(r=>r.json())]).then(([gltf,manifest])=>{
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
     const mesh=new T.Mesh(geo,m);mesh.castShadow=!/ENVELOPE|FACADE|GLASS/.test(id);mesh.receiveShadow=true;root.add(mesh);meshes.push(mesh);materials.push(m);
    });
    const center=new T.Box3().setFromObject(root).getCenter(V());const zone=Number(/_Z(\d+)/.exec(id)?.[1]??0);this.parts.push({id,role:id.split('_')[0],zone,root,meshes,center,offset:V(),materials,restVertices:meshes.map(m=>new Float32Array(m.geometry.getAttribute('position').array))});
   }
   if(!this.parts.length)throw new Error('No separable tower parts in GLB');
   this.anchors=manifest.forceAnchorsThree;this.tmdAnchors=manifest.tmdAnchorsThree;this.makeRoutes(this.anchors);
  });
 }
 makeSite(){
  const mat=new T.MeshStandardMaterial({color:'#ced6d1',roughness:.85,metalness:.03});
  const plinth=new T.Mesh(new T.CylinderGeometry(1.1,1.16,.035,96),mat);plinth.position.y=-.03;this.ground.add(plinth);
  for(let i=0;i<4;i++){const r=1.24+i*.09;const points=[];for(let k=0;k<=128;k++)points.push(V(Math.cos(k/128*Math.PI*2)*r,-.02,Math.sin(k/128*Math.PI*2)*r));const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#b4c7c4',transparent:true,opacity:.5}));this.ground.add(line);}
 }
 makeRoutes(anchors:any){
  const make=(points:T.Vector3[],kind:string,c:string,r=.012)=>{const curve=new T.CurvePath<T.Vector3>();for(let i=1;i<points.length;i++)if(points[i].distanceTo(points[i-1])>1e-7)curve.add(new T.LineCurve3(points[i-1],points[i]));const line=new T.Mesh(new T.TubeGeometry(curve,90,r,8,false),new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.17,roughness:.4,transparent:true,opacity:.8}));const dots=Array.from({length:4},()=>new T.Mesh(new T.SphereGeometry(r*2.1,12,10),new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:.45})));this.scene.add(line,...dots);this.routes.push({curve,line,dots,kind});};
  const point=(a:number[])=>V(-a[0],a[1],-a[2]).multiplyScalar(.01);
  const load=point(anchors.floorLoad.point),contact=point(anchors.floorCoreContact.point),column=point(anchors.outriggerColumn.point),core=point(anchors.outriggerCore.point);
  const down=anchors.columnPath.map(point) as T.Vector3[];
  // Sample the actual baked wall vertices. A fixed x/z line would leave the
  // tapering wall and descend through the hollow lift shaft near its base.
  const wallId=Math.abs(contact.x)>Math.abs(contact.z)?(contact.x>0?'W1':'W3'):(contact.z>0?'W4':'W2');
  const axis=Math.abs(contact.x)>Math.abs(contact.z)?0:2;
  const walls=this.parts.filter(p=>new RegExp('^CORE_Z\\d+_'+wallId+'$').test(p.id));
  const wallRows=walls.map(p=>{const a=p.meshes[0].geometry.getAttribute('position');let lo=Infinity,hi=-Infinity;for(let i=0;i<a.count;i++){lo=Math.min(lo,a.getY(i));hi=Math.max(hi,a.getY(i));}const center=(y:number)=>{let mn=Infinity,mx=-Infinity;for(let i=0;i<a.count;i++)if(Math.abs(a.getY(i)-y)<1e-5){const v=axis===0?a.getX(i):a.getZ(i);mn=Math.min(mn,v);mx=Math.max(mx,v);}return (mn+mx)/2;};return {lo,hi,a:center(lo),b:center(hi)};});
  const wallPoint=(y:number)=>{const row=wallRows.find(w=>y>=w.lo-1e-5&&y<=w.hi+1e-5);if(!row)throw new Error('No core wall at '+y);const v=mix(row.a,row.b,clamp((y-row.lo)/(row.hi-row.lo)));const p=contact.clone().multiplyScalar(v/contact.getComponent(axis));p.y=y;p.setComponent(axis,v);return p;};
  const wallHeights=[contact.y,...wallRows.map(w=>w.lo).filter(y=>y<contact.y-1e-5)].sort((a,b)=>b-a);
  const wallPath=wallHeights.map(wallPoint);const raft=this.parts.find(p=>p.id==='RAFT')!;const raftTop=new T.Box3().setFromObject(raft.root).max.y;
  wallPath.push(wallPath[wallPath.length-1].clone().setY(raftTop-.01));
  make([load,contact,...wallPath],'gravity',C.red,.007);
  make([load,column.clone().setY(load.y),...down],'gravity',C.red,.007);
  make([core,column,column.clone().add(V(0,-.35,0))],'moment',C.red,.01);
  make([V(-column.x,column.y-.30,-column.z),V(-column.x,column.y,-column.z),V(-core.x,core.y,-core.z)],'moment',C.teal,.01);
  // Frozen model pile centres, taken from its 3.12 m construction grid.
  for(const [x,z] of [[.2808,.1872],[.1248,.3432],[-.0936,.2808]]){
   make([V(x,-.27,z),V(x,-.36,z),V(x,-.58,z),V(x,-.80,z)],'foundation',C.red,.007);
   make([V(x,-.53,z),V(x+.07,-.58,z),V(x+.13,-.60,z)],'foundation',C.gold,.006);
  }
 }
 makeFlow(){
  for(let j=0;j<24;j++){
   const y=.5+(j%8)*.72,z0=(Math.floor(j/8)-1)*.68;const pts=[];
   for(let k=0;k<=120;k++){const x=-4+k/120*8;const radius=.67-.17*y/6.32;const sign=z0>=0?1:-1;const deflection=sign*Math.exp(-x*x/1.0)*Math.max(0,radius-Math.abs(z0));pts.push(V(x,y+.04*Math.sin(x*.8+j),z0+deflection+Math.max(0,x)*.02*Math.sin(x*2-j)));}
   this.flowPaths.push(pts);const line=new T.Line(new T.BufferGeometry().setFromPoints(pts),new T.LineBasicMaterial({color:j%3===0?C.gold:'#4b8b9b',transparent:true,opacity:.44}));this.flow.add(line);
   const dot=new T.Mesh(new T.SphereGeometry(.023,10,8),new T.MeshStandardMaterial({color:'#367486',emissive:'#4b8294',emissiveIntensity:.3}));this.flow.add(dot);this.flowDots.push(dot);
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
  this.state=s;const u=s.n+s.u,t=s.time;this.path.apply(this.camera,t);
  const hook=pulse(1.2,1.8,2.35,3.1,u);
  const reveal=channel([[1,0],[3.4,0],[4.8,1],[21,1],[22.8,.42],[26,.38],[28,0],[34.1,0],[35.2,.85],[38.3,.85],[39.7,0],[49,0]],u);
  this.cut.constant=100;
  const openUpper=pulse(14.05,14.85,26.2,27.4,u);
  const skin=pulse(21.4,22.5,26.3,27.4,u);
  const construction=pulse(39.10,39.95,44.05,44.90,u),progress=ramp(39.75,44.10,u),builtHeight=.20+6.12*progress;
  for(const p of this.parts){
   const id=p.id,c=p.center,z=p.zone;
   p.offset.set(0,0,0);
   const shell=/ENVELOPE|SPIRAL_RIBS|GLAZING|FACADE_OUTER/.test(id),inner=/INNER_FACADE/.test(id),slab=/FLOOR/.test(id),core=/CORE/.test(id),col=/MEGACOL/.test(id),truss=/OUTRIGGER|BELT/.test(id),crown=/CROWN/.test(id);
   const radial=V(c.x,0,c.z);if(radial.length()<.005)radial.set(1,0,0);radial.normalize();
   if(shell){p.offset.addScaledVector(radial,hook*1.55);p.offset.y+=(z-4)*hook*.13;
    // Panels leave on their outward normals, never disappear in the frame.
    const facing=radial.dot(this.camera.position.clone().setY(0).normalize());
    p.offset.addScaledVector(radial,mix(reveal*28,.72*clamp((facing-.15)/.65),skin));p.offset.y+=reveal*11*(1-skin);
   }else if(slab||inner){p.offset.y+=(z-1)*hook*.12;if(inner){p.offset.addScaledVector(radial,reveal*24*(1-skin));p.offset.y+=reveal*10*(1-skin);}}
   else if(core||col||truss){p.offset.y+=(z-1)*hook*.08;if(col)p.offset.addScaledVector(radial,hook*.65);}
   if(crown)p.offset.y+=hook*.9+pulse(34.1,35.1,38,39.6,u)*1.8;
   if(z>=6||crown)p.offset.y+=openUpper*(14+z*.2);
   if(z===5)p.offset.y+=pulse(14.05,14.85,21.5,22.5,u)*14;
   // A rising construction section follows the climbing core and advancing work
   // fronts. No full-floor stacks or glass sleeves fall from the sky.
   p.root.position.copy(p.offset);
   for(const m of p.materials){
    const buildLevel=core?builtHeight+.28:col||truss?builtHeight+.09:slab?builtHeight-.13:shell||inner?builtHeight-.48:builtHeight;
    m.clippingPlanes![1].constant=mix(6.8,Math.max(.02,buildLevel),construction);
    const original=m.userData.originalColor as T.Color;m.color.copy(original);
    let op=m.userData.originalOpacity as number;
    if(core){m.color.set('#a18a69');}
    if(col||truss){m.color.set('#476976');if(u>=17&&u<21)m.color.lerp(color(C.red),.32*pulse(17,17.3,20.3,21,u));}
    if(slab){m.color.set('#bfcac8');op*=1-.78*pulse(9.5,10.4,13.2,14,u);}
    if(slab&&z===4){op*=1-.85*pulse(17,17.8,20.8,21.6,u);}
    if(inner){op=/GLASS/.test(id)?.12:1;m.color.set(/GLASS/.test(id)?'#70a0ac':'#607f85');}
    if(shell){if(/GLASS/.test(id)){op=.88-.12*hook;m.color.set('#7ea3ae');}else {op=1;m.color.set('#779399');}m.roughness=.26;m.metalness=.43;}
    if(shell&&/GLASS/.test(id))op=mix(op,.2,skin);
    if(/PILES|RAFT|BASEMENT|DIAPHRAGM/.test(id)){m.color.set('#c3b9a5');m.roughness=.78;}
    if(core&&/_W[34]$/.test(id)){op*=1-.75*pulse(10.3,10.8,11.9,12.5,u);}
    if(z===9&&(core||slab))op*=1-.91*pulse(35.1,35.8,37.8,38.7,u);
    if(/TMD/.test(id)){m.color.set('#b58e4c');m.metalness=.7;m.roughness=.27;}
    m.transparent=op<.999;m.opacity=op;m.depthWrite=op>.94;
   }
   const bend=.15*Math.sin(t*1.8)*pulse(12.95,13.25,13.75,14,u)+.075*Math.sin(t*1.3)*pulse(29.6,30.15,31.6,32.2,u);
   if(!/TMD_CABLES/.test(id))p.meshes.forEach((mesh,j)=>{if((mesh.userData.lastBend??0)===bend)return;mesh.userData.lastBend=bend;const rest=p.restVertices[j],attr=mesh.geometry.getAttribute('position') as T.BufferAttribute;for(let k=0;k<rest.length;k+=3){const h=Math.max(0,Math.min(1,rest[k+1]/6.32));attr.setXYZ(k/3,rest[k]+bend*h*h*(3-h)/2,rest[k+1],rest[k+2]);}attr.needsUpdate=true;});
   const sway=.028*Math.sin(t*2.15)*pulse(36,36.5,37.8,38.5,u);
   const suspensionLength=(this.tmdAnchors?.cableLength??14.2)*.01;
   const pendulumRise=suspensionLength-Math.sqrt(Math.max(0,suspensionLength*suspensionLength-sway*sway));
   if(/TMD.*MASS|TMD_MASS|TMD_MAGNET/.test(id)){p.root.position.x+=sway;p.root.position.y+=pendulumRise;}
   if(id==='TMD_DAMPER_PLATE'){for(const m of p.materials)m.color.set('#a96543');}
   if(id==='TMD_CABLES')p.meshes.forEach((mesh,j)=>{const rest=p.restVertices[j],attr=mesh.geometry.getAttribute('position') as T.BufferAttribute;let top=-Infinity,bottom=Infinity;for(let k=1;k<rest.length;k+=3){top=Math.max(top,rest[k]);bottom=Math.min(bottom,rest[k]);}for(let k=0;k<rest.length;k+=3){const w=(top-rest[k+1])/(top-bottom);attr.setXYZ(k/3,rest[k]+sway*w,rest[k+1]+pendulumRise*w,rest[k+2]);}attr.needsUpdate=true;});
  }
  this.ground.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.material.transparent=true;o.material.opacity=1-.94*pulse(4,4.8,8.8,9.8,u);o.material.depthWrite=false;}});
  const platformWeight=pulse(39.55,40.25,42.7,43.5,u);this.platform.position.set(28*(1-platformWeight),Math.min(builtHeight+.27,5.81),0);
  const gravity=pulse(15.9,16.15,16.85,17.15,u)+pulse(32.9,33.2,33.7,34,u),moment=pulse(18.8,19.2,20.6,21,u),foundation=pulse(6.8,7.15,7.9,8.3,u);
  for(const r of this.routes){const weight=r.kind==='gravity'?gravity:r.kind==='foundation'?foundation:moment;r.line.visible=weight>.001;(r.line.material as T.Material & {opacity:number}).opacity=.85*weight;for(let i=0;i<r.dots.length;i++){const d=r.dots[i];d.visible=weight>.001;d.position.copy(r.curve.getPoint((t*.15+i/4)%1));d.scale.setScalar(weight);}}
  const flowWeight=pulse(29,29.5,33.5,34.1,u);this.flow.visible=flowWeight>.001;this.flow.scale.z=.7+.3*flowWeight;
  for(let j=0;j<this.flowDots.length;j++){const pts=this.flowPaths[j],a=((t*.19+j*.12)%1)*(pts.length-1);const k=Math.floor(a);this.flowDots[j].position.copy(pts[k]).lerp(pts[Math.min(k+1,pts.length-1)],a-k);}
  const eddy=pulse(36.7,37.1,37.8,38.2,u);this.eddy.visible=eddy>.001;this.eddy.traverse(o=>{if(o instanceof T.Mesh){o.material.transparent=true;o.material.opacity=eddy;}});for(let j=0;j<this.eddyDots.length;j++){const d=this.eddyDots[j],[x,z]=d.userData.center;d.position.set(x+.017*Math.cos(t*3+j),5.733,z+.017*Math.sin(t*3+j));}
  this.scene.updateMatrixWorld(true);
 }
 labels(s:State):Label[]{
  const u=s.n+s.u;const list:Label[]=[];
  const add=(text:string,id:string,fallback:T.Vector3,side:'left'|'right'='right')=>{const p=this.parts.find(x=>x.id===id)??this.parts.find(x=>x.id.startsWith(id));list.push({text,point:p?p.center.clone().add(p.offset):fallback,side});};
  if(u>=5.8&&u<7.9){add('桩群','PILES_Q1',V(.3,-.5,0));add('筏板','RAFT',V(.3,-.07,0),'left');}
  if(u>=10.6&&u<12.5)list.push({text:'核心筒',point:V(-.139,1.49,.03)});
  if(u>=15.5&&u<17){const dir=this.camera.position.clone().setY(0).normalize();const col=this.parts.filter(x=>x.id.startsWith('MEGACOL_Z04')).sort((a,b)=>b.center.clone().setY(0).dot(dir)-a.center.clone().setY(0).dot(dir))[0];if(col)list.push({text:'巨柱',point:col.center.clone().addScaledVector(dir,.013)});}
  if(u>=18.0&&u<18.85){const a=this.anchors.outriggerCore.point,b=this.anchors.outriggerColumn.point;list.push({text:'伸臂桁架',point:V(-(a[0]+b[0])*.005,(a[1]+b[1])*.005,-(a[2]+b[2])*.005)});}
  if(u>=19.8&&u<20.7)list.push({text:'两侧轴力，一增一减',point:V(-.18,2.30,-.26),color:C.red});
  if(u>=23&&u<25.6){add('内层幕墙','INNER_FACADE_Z05',V(.32,2.6,0));list.push({text:'空中花园',point:V(.43,2.43,.15),side:'left'});}
  if(u>=35.5&&u<37.8)add('调谐质量阻尼器','TMD_MASS',V(0,5.8,0));
  if(u>=37.1&&u<37.8)list.push({text:'固定铜板',point:V(.05,5.73,0),side:'left'});
  return list;
 }
 dispose(){this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.environment.dispose();}
}
