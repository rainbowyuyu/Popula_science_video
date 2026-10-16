import * as T from 'three';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {NativePlatformV5} from './NativePlatformV5';
import {sampleV5Camera} from './LaunchV5Camera';
import {projectAnchor} from './CinematicMotion';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const clamp=(n:number)=>Math.max(0,Math.min(1,n));
const smooth=(n:number)=>{const q=clamp(n);return q*q*q*(q*(6*q-15)+10)};
const ramp=(t:number,a:number,b:number)=>smooth((t-a)/(b-a));
type Anchor={x:number;y:number;visible:boolean;depth:number};
type Surface={mesh:T.Mesh<T.BufferGeometry,T.MeshStandardMaterial>;native:{iteration:number;solidVolumeFraction:number}};
export type ContinuousInfo={
 time:number;iteration:number;fraction:number;native:{time:number;surge:number;pitch:number;tension:number};
 fairlead:Anchor;platform:Anchor;towerTop:Anchor;beso:Anchor;lineTension:number;
 camera:{position:number[];target:number[]};
};

/** One persistent assembly, one ocean and one camera. Presentation surfaces
 * use saved evidence; none of them replace or impersonate the physical hull. */
export class ContinuousLaunchWorld{
 readonly renderer:T.WebGLRenderer;
 readonly scene=new T.Scene();
 readonly camera=new T.PerspectiveCamera(34,16/9,.35,5000);
 ready:Promise<void>;info!:ContinuousInfo;
 native!:NativePlatformV5;
 private environment!:T.WebGLRenderTarget;
 private sky!:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;
 private ocean!:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;
 private seabed!:T.Mesh;
 private evidence=new T.Group();
 private surfaces:Surface[]=[];
 private specimenBase=V(0,28,90);
 private specimenFrame!:T.LineSegments;
 private wind:T.Line<T.BufferGeometry,T.LineBasicMaterial>[]=[];
 private thrust!:T.ArrowHelper;
 private base:string;
 private disposed=false;

 constructor(canvas:HTMLCanvasElement,base:string){
  this.base=base;
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  this.renderer.setSize(1920,1080,false);this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.0;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;
  this.renderer.localClippingEnabled=true;
  this.scene.background=new T.Color('#e7eff1');this.scene.fog=new T.Fog('#e7eff1',1200,3500);
  const pm=new T.PMREMGenerator(this.renderer);this.environment=pm.fromScene(new RoomEnvironment(),.05);pm.dispose();
  this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.45;
  this.scene.add(new T.HemisphereLight('#ecf6ff','#50727a',.95));
  const key=new T.DirectionalLight('#fff4e5',2.2);key.position.set(-240,310,230);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-175,right:175,top:305,bottom:-100,near:2,far:800});
  key.shadow.normalBias=.18;key.shadow.bias=-.0002;key.shadow.radius=5;this.scene.add(key);
  const rim=new T.DirectionalLight('#d5e9f0',1.0);rim.position.set(160,120,-210);this.scene.add(rim);
  this.buildEnvironment();this.scene.add(this.evidence);this.evidence.name='Separate BESO evidence surface';
  this.ready=this.load();
 }

 private buildEnvironment(){
  this.sky=new T.Mesh(new T.PlaneGeometry(5000,3100),new T.ShaderMaterial({depthWrite:false,depthTest:false,side:T.DoubleSide,
   uniforms:{underwater:{value:0}},vertexShader:`varying vec2 u;void main(){u=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
   fragmentShader:`varying vec2 u;uniform float underwater;void main(){vec3 c=mix(vec3(.88,.93,.94),vec3(.59,.76,.85),smoothstep(.38,1.,u.y));float cloud=sin(u.x*13.+u.y*4.)*sin(u.x*31.-u.y*9.);c+=.012*cloud*smoothstep(.55,1.,u.y);c=mix(c,vec3(.32,.59,.65),underwater*.45);gl_FragColor=vec4(c,1.);}`
  }));this.sky.renderOrder=-100;this.sky.frustumCulled=false;this.scene.add(this.sky);
  // Nonuniform world grid: dense near the hull, then progressively larger
  // cells into the atmospheric horizon. The visible sea never ends as a pool.
  const geom=new T.PlaneGeometry(2,2,640,640);geom.rotateX(-Math.PI/2);
  const positions=geom.getAttribute('position') as T.BufferAttribute;
  const stretch=(x:number)=>Math.sign(x)*Math.pow(Math.abs(x),2.5)*12000;
  for(let i=0;i<positions.count;i++)positions.setXYZ(i,stretch(positions.getX(i)),0,stretch(positions.getZ(i)));
  positions.needsUpdate=true;
  this.ocean=new T.Mesh(geom,new T.ShaderMaterial({transparent:true,depthWrite:true,side:T.DoubleSide,
   uniforms:{clock:{value:0},inspect:{value:0}},
   vertexShader:`uniform float clock;varying vec3 wpos;varying vec3 wn;varying float crest;void main(){vec3 p=position;float a=.038*p.x+.025*p.z-clock*.72;float b=.089*p.x-.065*p.z-clock*1.12;float c=.24*p.x+.12*p.z-clock*1.94;p.y+=.94*sin(a)+.38*sin(b)+.12*sin(c);vec2 g=vec2(.0357*cos(a)+.0338*cos(b)+.0288*cos(c),.0235*cos(a)-.0247*cos(b)+.0144*cos(c));wn=normalize(vec3(-g.x,1.,-g.y));wpos=(modelMatrix*vec4(p,1.)).xyz;crest=p.y;gl_Position=projectionMatrix*viewMatrix*vec4(wpos,1.);}`,
   fragmentShader:`uniform float clock;uniform float inspect;varying vec3 wpos;varying vec3 wn;varying float crest;void main(){float a=.038*wpos.x+.025*wpos.z-clock*.72,b=.089*wpos.x-.065*wpos.z-clock*1.12,c=.24*wpos.x+.12*wpos.z-clock*1.94;vec2 grad=vec2(.0357*cos(a)+.0338*cos(b)+.0288*cos(c),.0235*cos(a)-.0247*cos(b)+.0144*cos(c));grad+=vec2(.018*cos(wpos.x*1.4+clock*.4)*sin(wpos.z*.9),.014*sin(wpos.x*1.4+clock*.4)*cos(wpos.z*.9));vec3 n=normalize(vec3(-grad.x,1.,-grad.y)),v=normalize(cameraPosition-wpos),l=normalize(vec3(-.4,.8,.6));float f=pow(1.-max(dot(n,v),0.),3.5);vec3 col=mix(vec3(.025,.13,.19),vec3(.29,.48,.56),.13+.67*f);float spec=pow(max(dot(reflect(-l,n),v),0.),95.);col+=vec3(.9,.86,.75)*spec*.40;float foam=smoothstep(1.15,1.44,crest)*smoothstep(.1,.7,sin(wpos.x*.9+wpos.z*.71-clock*.6)*sin(wpos.z*1.31-wpos.x*.68));col=mix(col,vec3(.68,.79,.80),foam*.22);col=mix(col,vec3(.51,.66,.71),smoothstep(950.,2600.,length(wpos.xz-cameraPosition.xz)));float local=1.-smoothstep(85.,160.,length(wpos.xz));float alpha=1.-inspect*local*.70;gl_FragColor=vec4(col,alpha);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>}`
  }));this.ocean.frustumCulled=false;this.ocean.name='Visual wave / WaterPro-compatible deterministic ocean';this.ocean.renderOrder=3;this.scene.add(this.ocean);
  this.seabed=new T.Mesh(new T.PlaneGeometry(7000,7000),new T.MeshStandardMaterial({color:'#75969e',roughness:.92,metalness:0}));this.seabed.rotation.x=-Math.PI/2;this.seabed.position.y=-74;this.seabed.receiveShadow=true;this.scene.add(this.seabed);
 }

 private async load(){
  const json=async(p:string)=>{const r=await fetch(this.base+p);if(!r.ok)throw Error('Missing evidence '+p);return r.json()};
  const [model,response,manifest]=await Promise.all([json('beso-research/physics/native-model.json'),json('beso-research/physics/zwind-response.json'),json('beso-research/geometry/manifest.json')]);
  this.native=new NativePlatformV5(model,response);this.scene.add(this.native.group);this.native.sea.visible=false;
  await this.native.loadPresentationNacelle(this.base+'assets/v4/nacelle-skin.glb');
  this.native.tower.material.color.set('#a8bbc0');
  this.native.rotor.traverse(o=>{if(o instanceof T.Mesh&&o.name.startsWith('Illustrative airfoil')){const m=o.material as T.MeshStandardMaterial;m.color.set('#7c969f');m.roughness=.58;m.metalness=.02}});
  const shared=await json('beso-research/geometry/'+manifest.shared),points=new Float32Array(shared.positions);
  for(const record of manifest.iterations){
   const state=await json('beso-research/geometry/'+record.file),indexed=new T.BufferGeometry();indexed.setAttribute('position',new T.BufferAttribute(points,3));indexed.setIndex(state.indices);indexed.computeVertexNormals();
   const geo=indexed.toNonIndexed();indexed.dispose();
   const material=new T.MeshStandardMaterial({color:'#386877',metalness:.3,roughness:.39,side:T.DoubleSide,transparent:true,opacity:0});
   const mesh=new T.Mesh(geo,material);mesh.castShadow=mesh.receiveShadow=true;mesh.visible=false;this.evidence.add(mesh);this.surfaces.push({mesh,native:record});
  }
  const frameGeo=new T.EdgesGeometry(new T.BoxGeometry(90,41,79));this.specimenFrame=new T.LineSegments(frameGeo,new T.LineBasicMaterial({color:'#b0794d',transparent:true,opacity:.16}));this.evidence.add(this.specimenFrame);
  const tray=new T.Mesh(new T.BoxGeometry(100,.45,88),new T.MeshStandardMaterial({color:'#e3e9e7',roughness:.7,metalness:.08}));tray.position.y=-21;tray.receiveShadow=true;this.evidence.add(tray);this.evidence.scale.setScalar(.66);
  this.evidence.visible=false;this.buildWind();
  try{const hdr=await new RGBELoader().loadAsync(this.base+'environment/v2-sky.hdr');hdr.mapping=T.EquirectangularReflectionMapping;const pm=new T.PMREMGenerator(this.renderer),env=pm.fromEquirectangular(hdr);this.environment.dispose();this.environment=env;this.scene.environment=env.texture;hdr.dispose();pm.dispose()}catch{ /* Room lighting is already a valid environment. */ }
  if(!this.disposed)this.render(0);
 }

 private buildWind(){
  for(let row=0;row<5;row++){
   const points=[];for(let j=0;j<80;j++){const u=j/79,x=-85+u*175,z=(row-2)*9;points.push(V(x,28+row*8,z+Math.sign(z||1)*6*Math.exp(-((x/23)**2))))}
   const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#6a8992',transparent:true,opacity:.26,depthWrite:false}));line.visible=false;this.native.group.add(line);this.wind.push(line);
  }
  this.thrust=new T.ArrowHelper(V(-1,0,0),V(),16,0xb7794b,3.5,1.8);this.thrust.visible=false;this.native.group.add(this.thrust);
 }

 render(time:number){
  if(!this.native||this.disposed)return;
  const pose=sampleV5Camera(time);this.camera.position.copy(pose.position);this.camera.lookAt(pose.target);this.camera.updateMatrixWorld();
  const direction=V();this.camera.getWorldDirection(direction);this.sky.position.copy(this.camera.position).addScaledVector(direction,2400);this.sky.quaternion.copy(this.camera.quaternion);
  const inspect=Math.max(ramp(time,6,10)*(1-ramp(time,31,35)),ramp(time,40,44)*(1-ramp(time,50,54)));
  this.ocean.material.uniforms.clock.value=time;this.ocean.material.uniforms.inspect.value=inspect;
  this.sky.material.uniforms.underwater.value=ramp(time,43,46)*(1-ramp(time,48,51));
  this.native.group.position.set(0,0,0);this.native.group.scale.setScalar(1);this.native.group.visible=true;
  this.native.setVisualOceanTime(time,0);this.native.setTime(120*clamp((time-34)/18),time<34);this.native.sea.visible=false;
  this.native.setMooringFocus(time>=42&&time<50?1:null);
  // A restrained glass specimen comes from the near side, and exits beyond
  // the view. It is a separate saved design-domain example, not a hull swap.
  const enter=ramp(time,17.5,20),exit=ramp(time,31.5,35);
  const right=V(1,0,0).applyQuaternion(this.camera.quaternion);
  this.evidence.position.copy(this.specimenBase).addScaledVector(right,780*(1-enter)+780*exit);
  this.evidence.visible=time>=17.5&&time<=35;
  this.evidence.rotation.y=-.08-.16*ramp(time,20,32);
  const evolution=clamp((time-20)/10.2)*3,lower=Math.min(3,Math.floor(evolution));
  const blend=ramp(evolution-lower,.65,.97);
  for(const [i,s]of this.surfaces.entries()){const w=i===lower?1-blend:i===lower+1?blend:0;s.mesh.visible=this.evidence.visible&&w>.001;s.mesh.material.opacity=w;s.mesh.material.depthWrite=w>.6}
  const windWeight=ramp(time,34.5,37)*(1-ramp(time,40,43));
  for(const [i,line]of this.wind.entries()){line.visible=windWeight>.001;line.material.opacity=.32*windWeight;line.geometry.setDrawRange(Math.round(((time*.15+i*.17)%1)*25),55)}
  const thrustLength=16*windWeight;
  this.thrust.visible=windWeight>.001;this.thrust.position.copy(this.native.getTowerCenter(.26)).add(V(thrustLength,0,0));this.thrust.setLength(Math.max(.01,thrustLength),Math.min(3.5,thrustLength*.24),Math.min(1.8,thrustLength*.12));
  this.scene.updateMatrixWorld(true);
  const anchor=(id:string):Anchor=>{const a=this.native.getCalloutAnchors()[id];return a?projectAnchor(this.camera,a.object.getWorldPosition(V())):{x:0,y:0,visible:false,depth:0}};
  const active=this.surfaces[Math.min(3,lower+(blend>.5?1:0))];
  this.info={time,iteration:active.native.iteration,fraction:active.native.solidVolumeFraction,native:{...this.native.info},lineTension:this.native.getMooringTension(1),fairlead:anchor('fairlead-1'),platform:anchor('platform-center'),towerTop:anchor('tower-top'),beso:projectAnchor(this.camera,this.evidence.position),camera:{position:pose.position.toArray(),target:pose.target.toArray()}};
  this.renderer.render(this.scene,this.camera);
 }

 dispose(){this.disposed=true;this.native?.dispose();this.scene.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});this.environment.dispose();this.renderer.dispose()}
}
