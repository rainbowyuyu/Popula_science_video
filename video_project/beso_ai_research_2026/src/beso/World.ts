import * as T from 'three';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import paperMetrics from '../../public/beso-research/physics/paper-metrics.json';
import {NativePlatform} from './NativePlatform';
import {comparisonStarts} from './ComparisonTiming';
export const clamp=(v:number)=>Math.min(1,Math.max(0,v));
export const smooth=(v:number)=>{const x=clamp(v);return x*x*x*(x*(x*6-15)+10)};
const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export type FilmState={id:string;index:number;local:number;progress:number;time:number;duration:number;sceneStart:number};
type SceneTiming={id:string;start:number;duration:number};
type NativeState={iteration:number;file:string;solidCount:number;solidVolumeFraction:number;surfaceTriangleCount:number;heatQuantileRange:number[]};
type Manifest={shared:string;iterations:NativeState[]};
type Surface={mesh:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>;wire:T.LineSegments;native:NativeState};
export type WorldInfo={iteration:number;fraction:number;triangles:number;section?:{diameter:number;thickness:number;x:number;y:number};load?:{x:number;y:number};moment?:{x:number;y:number};native?:{time:number;surge:number;pitch:number;tension:number};model:{x:number;y:number};volume:{x:number;y:number};screen:{x:number;y:number};bounds:{left:number;top:number;right:number;bottom:number}};
type Pose={position:T.Vector3;target:T.Vector3};
const poses:Record<string,number[][]>={hook:[[134,94,176],[-17,3,0]],brief:[[193,43,163],[123,9,0]],mesh:[[97,79,146],[-13,1,0]],beso:[[122,94,166],[-12,1,0]],rebuild:[[180,43,155],[112,6,0]],zwind:[[-137,65,168],[-116,2,-5]],compare:[[149,48,176],[117,2,-4]],review:[[-120,42,156],[-113,9,-3]],limits:[[-96,71,175],[-83,7,-6]],close:[[127,92,184],[-15,4,0]]};
/** Native surfaces share original points. Display transitions do not claim new solver states. */
export class BesoWorld{
 renderer:T.WebGLRenderer;scene=new T.Scene();camera=new T.PerspectiveCamera(34,16/9,.2,1800);ready:Promise<void>;environment:T.WebGLRenderTarget;
 model=new T.Group();screens=new T.Group();surfaces:Surface[]=[];ghost!:T.LineSegments;manifest!:Manifest;
 displayPlanes=new Map<string,T.Mesh<T.PlaneGeometry,T.MeshBasicMaterial>>();chartGroup=new T.Group();bars:T.Mesh[]=[];info!:WorldInfo;
 native?:NativePlatform;response:any;nativeModel:any;papers=new T.Group();loads=new T.Group();loadArrow?:T.ArrowHelper;momentLine?:T.Line;momentArrow?:T.ArrowHelper;
 tubeSection=new T.Group();tubeDiameter=9.4857;tubeThickness=.06;
 private timings:SceneTiming[];private fps:number;
 constructor(canvas:HTMLCanvasElement,base:string,timings:SceneTiming[],fps:number){
  this.timings=timings;this.fps=fps;this.renderer=new T.WebGLRenderer({canvas,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
  this.renderer.setSize(1920,1080,false);this.renderer.outputColorSpace=T.SRGBColorSpace;this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.0;this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.localClippingEnabled=true;
  this.scene.background=new T.Color('#f1f4f5');this.scene.fog=new T.Fog('#f1f4f5',490,1000);
  const pm=new T.PMREMGenerator(this.renderer);this.environment=pm.fromScene(new RoomEnvironment(),.035);this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.35;pm.dispose();
  this.scene.add(new T.HemisphereLight('#e0f2ff','#b9c7c5',1.1));const light=new T.DirectionalLight('#fff2dd',2.5);light.position.set(-100,200,120);light.castShadow=true;light.shadow.mapSize.set(2048,2048);Object.assign(light.shadow.camera,{left:-310,right:210,top:250,bottom:-190,near:2,far:800});light.shadow.normalBias=.13;light.shadow.bias=-.0003;light.shadow.radius=7;this.scene.add(light);
  const rim=new T.DirectionalLight('#bddcff',2.1);rim.position.set(140,70,-180);this.scene.add(rim);
  const floor=new T.Mesh(new T.PlaneGeometry(1800,1800),new T.MeshStandardMaterial({color:'#e8eef0',roughness:.72,metalness:.02}));floor.rotation.x=-Math.PI/2;floor.position.y=-25;floor.receiveShadow=true;this.scene.add(floor,this.model,this.screens,this.chartGroup);
  const grid=new T.GridHelper(1400,56,'#cad9dd','#d9e2e5');(grid.material as T.Material).transparent=true;(grid.material as T.Material).opacity=.32;grid.position.y=-24.95;this.scene.add(grid);this.ready=this.load(base);
 }
 async load(base:string){
  const json=async(p:string)=>{const r=await fetch(base+p);if(!r.ok)throw Error('Missing verified research asset '+p);return r.json()};
  this.manifest=await json('beso-research/geometry/manifest.json');const shared=await json('beso-research/geometry/'+this.manifest.shared);const points=new Float32Array(shared.positions);
  await Promise.all(this.manifest.iterations.map(async(native)=>{const data=await json('beso-research/geometry/'+native.file);const indexed=new T.BufferGeometry();indexed.setAttribute('position',new T.BufferAttribute(points,3));indexed.setIndex(data.indices);indexed.computeVertexNormals();const geometry=indexed.toNonIndexed();indexed.dispose();
   const colors=new Float32Array(geometry.getAttribute('position').count*3);const c=new T.Color();for(let i=0;i<colors.length/3;i++){const q=(data.faceHeat[Math.floor(i/3)]??0)/255;c.set('#153d78').lerp(new T.Color('#36b2ab'),clamp(q*1.7)).lerp(new T.Color('#f8bd67'),clamp((q-.55)*2.22)).lerp(new T.Color('#c55242'),clamp((q-.86)*7));colors.set([c.r,c.g,c.b],i*3)}geometry.setAttribute('color',new T.BufferAttribute(colors,3));
   const material=new T.MeshStandardMaterial({color:'#397e92',metalness:.26,roughness:.33,side:T.DoubleSide,transparent:true,opacity:1});const mesh=new T.Mesh(geometry,material);mesh.castShadow=true;mesh.receiveShadow=true;mesh.visible=false;this.model.add(mesh);const wire=new T.LineSegments(new T.WireframeGeometry(geometry),new T.LineBasicMaterial({color:'#b9e4e8',transparent:true,opacity:.1}));wire.visible=false;this.model.add(wire);this.surfaces.push({mesh,wire,native});}));this.surfaces.sort((a,b)=>a.native.iteration-b.native.iteration);
  this.ghost=new T.LineSegments(new T.EdgesGeometry(this.surfaces[0].mesh.geometry,18),new T.LineBasicMaterial({color:'#6092a6',transparent:true,opacity:.17}));this.model.add(this.ghost);
  // Native Fz and Mx act at the central source load node. The arrowhead stays at that point.
  this.loadArrow=new T.ArrowHelper(V(0,-1,0),V(0,51,10.464474),32,0xbc6550,5.8,3.2);this.loads.add(this.loadArrow);
  const arc=new T.EllipseCurve(0,0,13,13,-Math.PI*.65,Math.PI*.8,false,0).getPoints(64).map(p=>V(0,28+p.x,10.464474+p.y));this.momentLine=new T.Line(new T.BufferGeometry().setFromPoints(arc),new T.LineBasicMaterial({color:'#bc8550',linewidth:3}));this.loads.add(this.momentLine);const dir=arc[64].clone().sub(arc[63]).normalize();this.momentArrow=new T.ArrowHelper(dir,arc[62],4,0xbc8550,4.2,2.6);this.loads.add(this.momentArrow);this.loads.visible=false;this.model.add(this.loads);
  const items=[['brief','screens/prompt.png',145,18,-16],['rebuild','screens/analysis.png',145,18,-16],['review','screens/review.png',-137,18,-14],['mesh','screens/domain.png',145,18,-16]] as const;
  await Promise.all(items.map(async([id,url,x,y,z])=>{const texture=await new T.TextureLoader().loadAsync(base+url);texture.colorSpace=T.SRGBColorSpace;texture.anisotropy=8;if(id==='rebuild')texture.repeat.x=.264;const plane=new T.Mesh(new T.PlaneGeometry(id==='rebuild'?33.264:126,70.875),new T.MeshBasicMaterial({map:texture,toneMapped:false,side:T.DoubleSide}));plane.position.set(id==='rebuild'?98.632:x,y,z);plane.castShadow=true;plane.visible=false;this.displayPlanes.set(id,plane);this.screens.add(plane);}));
  const values=[255.5,278,paperMetrics.fig2e.max_mooring_tension_kn.ai/55,paperMetrics.fig2e.max_mooring_tension_kn.tuqiang/55,paperMetrics.fig2d.pitch_deg.ai*25,paperMetrics.fig2d.pitch_deg.tuqiang*25];for(let i=0;i<values.length;i++){const h=values[i]/7;const bar=new T.Mesh(new T.BoxGeometry(9,h,9),new T.MeshStandardMaterial({color:i%2?'#bd614d':'#08777f',roughness:.32,metalness:.25}));bar.position.set(97+Math.floor(i/2)*38+(i%2)*12,h/2-18,0);bar.castShadow=true;this.chartGroup.add(bar);this.bars.push(bar)}this.chartGroup.visible=false;
  this.response=await json('beso-research/physics/zwind-response.json');this.nativeModel=await json('beso-research/physics/native-model.json');this.native=new NativePlatform(this.nativeModel,this.response);this.scene.add(this.native.group);this.native.group.position.x=-260;
  // A dimensioned educational close-up of one native inner-leg section, not a PSO trajectory.
  this.tubeDiameter=this.nativeModel.elements.find((e:any)=>e.role==='inner_leg').diameterM;this.tubeThickness=this.nativeModel.wallThicknessM;const ro=this.tubeDiameter/2,ri=ro-this.tubeThickness;
  const shape=new T.Shape();shape.absarc(0,0,ro,0,Math.PI*2,false);const hole=new T.Path();hole.absarc(0,0,ri,0,Math.PI*2,true);shape.holes.push(hole);
  const tube=new T.Mesh(new T.ExtrudeGeometry(shape,{depth:9.5,bevelEnabled:false,curveSegments:96}),[new T.MeshStandardMaterial({color:'#dfa558',metalness:.32,roughness:.32,side:T.DoubleSide}),new T.MeshStandardMaterial({color:'#176d7d',metalness:.36,roughness:.31,side:T.DoubleSide})]);tube.position.z=-4.75;tube.castShadow=true;tube.receiveShadow=true;this.tubeSection.add(tube);
  const end=new T.LineLoop(new T.BufferGeometry().setFromPoints(new T.EllipseCurve(0,0,ro,ro,0,Math.PI*2,false,0).getPoints(128).map(p=>V(p.x,p.y,4.77))),new T.LineBasicMaterial({color:'#9c7138'}));this.tubeSection.add(end);
  const dimensionPoints=[V(-ro,-ro-1.2,5.1),V(ro,-ro-1.2,5.1),V(-ro,-ro-.7,5.1),V(-ro,-ro-1.7,5.1),V(ro,-ro-.7,5.1),V(ro,-ro-1.7,5.1)];// D and t are labelled outside the close-up to preserve the thin true wall proportion.
  this.tubeSection.visible=false;this.scene.add(this.tubeSection);
  await Promise.all(['manuscript-first-page.png','manuscript-methods-page.png'].map(async(url,i)=>{const texture=await new T.TextureLoader().loadAsync(base+'beso-research/papers/'+url);texture.colorSpace=T.SRGBColorSpace;const page=new T.Mesh(new T.PlaneGeometry(44,57),new T.MeshBasicMaterial({map:texture,toneMapped:false,side:T.DoubleSide}));page.position.set(91+i*24,24+i*2,-18-i*9);page.rotation.z=(i?-.06:.035);page.rotation.y=-.17;page.castShadow=true;this.papers.add(page)}));this.papers.visible=false;this.scene.add(this.papers);
 }
 cameraPose(state:FilmState):Pose{const get=(id:string,t:number)=>{
   let spec=poses[id]??poses.close;let p=V(...spec[0] as [number,number,number]),target=V(...spec[1] as [number,number,number]);
   if(id==='hook'){const elapsed=t*(this.timings.find(s=>s.id===id)?.duration??1800)/this.fps,q=smooth((elapsed-6)/14);p=V(360,190,615).lerp(V(150,90,220),q);target=V(-30,118,0).lerp(V(0,5,0),q)}
   if(id==='zwind'){const q=smooth((t-.7)/.24);p=V(100,198,615).lerp(V(-120,110,265),q);target=V(-290,118,0).lerp(V(-273,13,0),q)}
   if(id==='compare'){p=V(166,58,186);target=V(129,3,0)}
   if(id==='close'){p=V(166,87,224);target=V(25,15,0)}
   const elapsed=t*(this.timings.find(s=>s.id===id)?.duration??1800)/this.fps;
   const focus=smooth((elapsed-6)/4);const off=p.clone().sub(target);off.applyAxisAngle(V(0,1,0),(t-.5)*.18);
   if(['mesh','beso'].includes(id)){target.lerp(V(0,4,0),focus);off.multiplyScalar(1-.19*focus);const mid=focus*(1-smooth((t-.72)/.16));target.add(V(0,-9,14).multiplyScalar(mid))}
   if(['brief','rebuild','review'].includes(id))off.multiplyScalar(1-.13*focus);
   p.copy(target).add(off);p.y+=Math.sin(t*Math.PI)*5;return{position:p,target}};
  const current=get(state.id,state.progress);
  if(state.id==='rebuild'){const old=get('beso',.95),q=smooth((state.local-5.4)/2.7);current.position.copy(old.position.clone().lerp(current.position,q));current.target.copy(old.target.clone().lerp(current.target,q));return current}
  if(state.index>0&&state.local<2.7){const prev=get(this.timings[state.index-1].id,1),q=smooth(state.local/2.7);current.position.copy(prev.position.clone().lerp(current.position,q));current.target.copy(prev.target.clone().lerp(current.target,q))}return current;}
 stateWeights(s:FilmState){if(s.id==='beso'){const x=clamp((s.progress-.06)/.8)*3,lower=Math.min(3,Math.floor(x)),window=1.5/Math.max(5,s.duration),q=smooth(clamp((x-lower-(1-window))/window));return[0,1,2,3].map(i=>i===lower?1-q:i===lower+1?q:0)}if(['hook','brief','mesh'].includes(s.id))return[1,0,0,0];return[0,0,0,1];}
 project(p:T.Vector3){const v=p.clone().project(this.camera);return{x:(v.x+1)*960,y:(1-v.y)*540}}
 render(s:FilmState){
  const p=this.cameraPose(s);this.camera.position.copy(p.position);this.camera.lookAt(p.target);this.camera.updateMatrixWorld();let weights=this.stateWeights(s);if(s.index>0&&s.local<2.7){const prev=this.timings[s.index-1],old=this.stateWeights({...s,id:prev.id,progress:1,local:prev.duration/this.fps}),q=smooth(s.local/2.7);weights=weights.map((n,i)=>lerp(old[i],n,q))}
  // Heat is never called stress; it is native FI_max with per-state percentile normalization.
  const heat=s.id==='beso'?smooth((s.progress-.06)/.16)*(1-smooth((s.progress-.64)/.15)):0;
  for(let i=0;i<this.surfaces.length;i++){const surface=this.surfaces[i],w=weights[i];surface.mesh.visible=w>.001;surface.mesh.material.opacity=w;surface.mesh.material.depthWrite=w>.55;const vertexColors=heat>.05;if(surface.mesh.material.vertexColors!==vertexColors){surface.mesh.material.vertexColors=vertexColors;surface.mesh.material.needsUpdate=true}surface.mesh.material.color.set(vertexColors?'#ffffff':'#126076');surface.mesh.material.roughness=vertexColors?.52:.3;surface.wire.visible=s.id==='mesh'&&w>.5;(surface.wire.material as T.LineBasicMaterial).opacity=.12+.11*Math.sin(Math.PI*s.progress);}
  const modelSlot=(id:string)=>['zwind','compare','review','limits'].includes(id)?320:id==='close'?32:0;const destination=modelSlot(s.id),previous=modelSlot(this.timings[s.index-1]?.id??s.id);this.model.position.x=lerp(previous,destination,smooth(s.local/2.7));this.model.visible=s.id!=='hook'&&!(destination===320&&s.local>=2.7);this.model.position.y=s.id==='brief'?-140*(1-smooth(s.local/2.7)):0;
  if(this.native){const fromNative=this.timings[s.index-1]?.id==='zwind';const enteringHook=this.timings[s.index-1]?.id==='hook';const enteringZwind=s.id==='zwind';this.native.group.visible=s.id==='hook'||s.id==='zwind'||(enteringHook&&s.local<2.7)||(fromNative&&s.local<2.7);this.native.group.position.x=s.id==='hook'?0:enteringHook?-260*smooth(s.local/2.7):enteringZwind?-260+260*smooth(s.local/2.7):-260;this.native.setTime(s.id==='zwind'?clamp(s.progress)*120:s.id==='hook'?s.local*.72:fromNative?120:0);}
  const paperReveal=s.id==='close'?smooth((s.local-5)/2.7):0;this.papers.visible=paperReveal>.001;this.papers.position.y=140*(1-paperReveal);for(const page of this.papers.children)page.scale.setScalar(1.12);
  const tubeActive=s.id==='rebuild',tubeExiting=this.timings[s.index-1]?.id==='rebuild';const tubeShow=tubeActive?smooth((s.local-6.2)/3.4):tubeExiting?1-smooth(s.local/2.7):0;this.tubeSection.visible=tubeShow>.001;this.tubeSection.position.set(lerp(35,158,tubeShow),lerp(-26,12,tubeShow),14);this.tubeSection.scale.setScalar(4.1*tubeShow);const tubeClock=tubeActive?s.local:tubeExiting?(this.timings[s.index-1].duration/this.fps):0;this.tubeSection.rotation.set(.09+Math.sin(tubeClock*.08)*.035,-.32+Math.sin(tubeClock*.12)*.11,-.14);
  const loadReveal=s.id==='mesh'?smooth((s.local-11.7)/.8):this.timings[s.index-1]?.id==='mesh'?1-smooth(s.local/.8):0;this.loads.visible=loadReveal>.001;if(this.loadArrow){const length=22*loadReveal;this.loadArrow.position.y=18.95+length;this.loadArrow.setLength(Math.max(.01,length),Math.min(4.8,length*.25),2.8)}this.momentLine?.geometry.setDrawRange(0,Math.floor(65*loadReveal));if(this.momentArrow)this.momentArrow.visible=loadReveal>.97;
  (this.ghost.material as T.LineBasicMaterial).opacity=s.id==='beso'?.13:s.id==='mesh'?.22:.055;
  for(const[id,plane]of this.displayPlanes){let reveal=id===s.id?smooth((s.local-(id==='rebuild'?5.4:0))/2.8):0;if(this.timings[s.index-1]?.id===id&&s.local<2.8)reveal=1-smooth(s.local/2.8);plane.visible=reveal>.001;plane.position.y=18+(1-reveal)*135;plane.rotation.y=(1-reveal)*(plane.position.x>0?-.12:.12)}
  const fromCompare=this.timings[s.index-1]?.id==='compare';this.chartGroup.visible=s.id==='compare'||(fromCompare&&s.local<2.7);const reveal=s.id==='compare'?smooth(s.local/2.7):1-smooth(s.local/2.7);this.chartGroup.position.y=(1-reveal)*130;
  const compareState=s.id==='compare'?s:{...s,id:'compare',sceneStart:(this.timings[s.index-1]?.start??0)/this.fps,local:(this.timings[s.index-1]?.duration??0)/this.fps};const starts=comparisonStarts(compareState);
  for(let i=0;i<this.bars.length;i++){const group=Math.floor(i/2),start=starts[group],end=starts[group+1]??Infinity,t=compareState.local,entry=smooth((t-start)/.75),exit=smooth((t-end)/.75);this.bars[i].visible=t>=start&&t<end+.75;this.bars[i].position.x=140+(i%2)*18+240*(1-entry)-240*exit;const q=smooth((t-start)/1.8);this.bars[i].scale.y=.06+.94*q;const h=(this.bars[i].geometry as T.BoxGeometry).parameters.height;this.bars[i].position.y=-18+h/2*this.bars[i].scale.y;}
  const best=weights.indexOf(Math.max(...weights)),surface=this.surfaces[best],corners=[V(-44,-19,-38),V(44,-19,-38),V(-44,19,38),V(44,19,38)].map(v=>this.project(v));this.info={iteration:surface.native.iteration,fraction:surface.native.solidVolumeFraction,triangles:surface.native.surfaceTriangleCount,section:{diameter:this.tubeDiameter,thickness:this.tubeThickness,...this.project(V(158,12,14))},native:this.native?.info,load:this.project(V(0,55,10.464474)),moment:this.project(V(0,28,25)),model:this.project(V(0,13,0)),volume:this.project(V(31,-8,22)),screen:this.project(V(145,18,-16)),bounds:{left:Math.min(...corners.map(v=>v.x)),top:Math.min(...corners.map(v=>v.y)),right:Math.max(...corners.map(v=>v.x)),bottom:Math.max(...corners.map(v=>v.y))}};this.renderer.render(this.scene,this.camera);
 }
 dispose(){this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material]){(m as T.MeshStandardMaterial).map?.dispose();m.dispose()}}});this.environment.dispose();this.renderer.dispose()}
}


