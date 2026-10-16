import * as T from 'three';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {Sky} from 'three/examples/jsm/objects/Sky.js';
import {NativePlatformV16} from './NativePlatformV16';
import {sampleV16Camera,V16Phase} from './LaunchV16Camera';
import {projectAnchor} from './CinematicMotion';
import type {ContinuousInfo as BaseContinuousInfo} from './ContinuousLaunchWorld';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const q=clamp(x);return q*q*q*(q*(6*q-15)+10)};
const ramp=(time:number,start:number,end:number)=>ease((time-start)/(end-start));
type Anchor=ReturnType<typeof projectAnchor>;
type Surface={mesh:T.Mesh<T.BufferGeometry,T.MeshPhysicalMaterial>;wire:T.LineSegments;native:{iteration:number;solidVolumeFraction:number};heatUniform:{value:number}};
type BlueprintSurface={mesh:T.Mesh;original:T.Material|T.Material[];paper:T.MeshBasicMaterial;outline:T.Mesh;edges:T.LineSegments};
export type ContinuousInfo=BaseContinuousInfo&{
 phase:V16Phase;anchors:Record<string,Anchor>;underwater:number;fov:number;
 specimenVisible:boolean;specimenScale:number;evidenceNote:string;
};
export type ContinuousInfoV16=ContinuousInfo;

/** Same native assembly for the whole film. Separate BESO evidence never
 * morphs into the native hull or claims that a joined solver run succeeded. */
export class LaunchWorldV16WebGL{
 readonly renderer:T.WebGLRenderer;
 readonly scene=new T.Scene();
 readonly camera=new T.PerspectiveCamera(43,16/9,.2,30000);
 ready:Promise<void>;info!:ContinuousInfo;native!:NativePlatformV16;
 private environment!:T.WebGLRenderTarget;
 private sky!:Sky;
 private ocean!:T.Mesh<T.PlaneGeometry,T.ShaderMaterial>;
 private seabed!:T.Mesh;
 private evidence=new T.Group();
 private surfaces:Surface[]=[];
 private specimenBase=V(-220,28,60);
 private wind:T.Line<T.BufferGeometry,T.LineBasicMaterial>[]=[];
 private sun=V(-.78,.42,-.47).normalize();
 private base:string;
 private disposed=false;
 private blueprintSurfaces:BlueprintSurface[]=[];
 private blueprintMode=false;
 private waterpro:any;
 private water!:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;

 constructor(canvas:HTMLCanvasElement,base:string){
  this.base=base;
  this.renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:true});
  this.renderer.setSize(1920,1080,false);this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.84;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.localClippingEnabled=true;
  this.scene.background=new T.Color('#afc6cb');this.scene.fog=new T.Fog('#afc6cb',1250,4200);
  const pm=new T.PMREMGenerator(this.renderer);this.environment=pm.fromScene(new RoomEnvironment(),.04);pm.dispose();
  this.scene.environment=this.environment.texture;this.scene.environmentIntensity=.44;
  this.scene.add(new T.HemisphereLight('#d4e9ee','#173744',.48));
  const key=new T.DirectionalLight('#ffe4b4',3.25);key.position.copy(this.sun).multiplyScalar(480);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-180,right:180,top:310,bottom:-90,near:2,far:950});
  key.shadow.normalBias=.12;key.shadow.bias=-.00015;key.shadow.radius=4;this.scene.add(key);
  const rim=new T.DirectionalLight('#97d1df',.84);rim.position.set(230,140,170);this.scene.add(rim);
  const bounce=new T.DirectionalLight('#8aa8b5',.28);bounce.position.set(-80,-30,40);this.scene.add(bounce);
  this.buildEnvironment();this.evidence.name='Independent archived BESO specimen';this.scene.add(this.evidence);
  this.ready=this.load();
 }

 private buildEnvironment(){
  this.sky=new Sky();this.sky.scale.setScalar(18000);this.sky.frustumCulled=false;this.sky.renderOrder=-100;
  const uniforms=this.sky.material.uniforms;uniforms.turbidity.value=3.8;uniforms.rayleigh.value=1.62;
  uniforms.mieCoefficient.value=.0045;uniforms.mieDirectionalG.value=.82;uniforms.sunPosition.value.copy(this.sun).multiplyScalar(1000);
  this.sky.material.transparent=true;this.sky.material.depthWrite=false;this.scene.add(this.sky);
  // Sky's shader does not read Material.opacity. Give submersion its own
  // uniform, so the background and the underside of the ocean agree.
  this.sky.material.uniforms.submersion={value:0};
  this.sky.material.fragmentShader='uniform float submersion;\n'+this.sky.material.fragmentShader.replace('gl_FragColor = vec4( retColor, 1.0 );','gl_FragColor = vec4( mix(retColor, vec3(.025,.16,.205), submersion), 1.0-submersion );');
  // The three low-frequency displacements exactly match NativePlatformV16's
  // CPU contact-foam mirror. Fine normals, light and wake are visual only.
  const geometry=new T.PlaneGeometry(2,2,432,432);geometry.rotateX(-Math.PI/2);
  const positions=geometry.getAttribute('position') as T.BufferAttribute;
  const stretch=(value:number)=>Math.sign(value)*Math.pow(Math.abs(value),2.5)*12000;
  for(let i=0;i<positions.count;i++)positions.setXYZ(i,stretch(positions.getX(i)),0,stretch(positions.getZ(i)));
  positions.needsUpdate=true;
  this.ocean=new T.Mesh(geometry,new T.ShaderMaterial({transparent:true,depthWrite:true,side:T.DoubleSide,
   uniforms:{clock:{value:0},inspect:{value:0},underwater:{value:0},sunDirection:{value:this.sun},
    contacts:{value:[V(26,0,-45),V(-52,0,0),V(26,0,45)]}},
   vertexShader:`uniform float clock;varying vec3 wpos;varying float crest;
    void main(){vec3 p=position;float a=.038*p.x+.025*p.z-clock*.72,b=.089*p.x-.065*p.z-clock*1.12,c=.24*p.x+.12*p.z-clock*1.94;
    p.y+=.94*sin(a)+.38*sin(b)+.12*sin(c);crest=p.y;wpos=(modelMatrix*vec4(p,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(wpos,1.);}`,
   fragmentShader:`uniform float clock,inspect,underwater;uniform vec3 sunDirection;uniform vec3 contacts[3];varying vec3 wpos;varying float crest;
    float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y);}
    float fbm(vec2 p){float v=0.,amp=.5;mat2 turn=mat2(.80,-.60,.60,.80);for(int i=0;i<4;i++){v+=amp*noise(p);p=turn*p*2.07+vec2(19.71,31.17);amp*=.49;}return v;}
    float microHeight(vec2 p){vec2 warp=vec2(noise(p*.31+vec2(7.1,clock*.025)),noise(p*.37+vec2(clock*.018,19.3)));return fbm(p+warp*.75+vec2(clock*.055,-clock*.028));}
    void main(){float a=.038*wpos.x+.025*wpos.z-clock*.72,b=.089*wpos.x-.065*wpos.z-clock*1.12,c=.24*wpos.x+.12*wpos.z-clock*1.94;
    vec2 grad=vec2(.0357*cos(a)+.0338*cos(b)+.0288*cos(c),.0235*cos(a)-.0247*cos(b)+.0144*cos(c));
    // Non-periodic, domain-warped finite-gradient detail avoids the regular
    // crosshatch and venetian-blind artefact of intersecting sine normals.
    vec2 uv=wpos.xz*.22;float eps=.045;
    vec2 micro=vec2(microHeight(uv+vec2(eps,0.))-microHeight(uv-vec2(eps,0.)),microHeight(uv+vec2(0.,eps))-microHeight(uv-vec2(0.,eps)))/(2.*eps);
    float distanceFade=1.-smoothstep(140.,1200.,length(wpos.xz-cameraPosition.xz));
    grad=grad*(.08+.37*distanceFade)+micro*.090*distanceFade;
    vec3 n=normalize(vec3(-grad.x,1.,-grad.y)),view=normalize(cameraPosition-wpos),reflected=reflect(-view,n);
    float fresnel=.035+.965*pow(1.-clamp(dot(n,view),0.,1.),5.);
    vec3 reflectedSky=mix(vec3(.42,.56,.62),vec3(.17,.34,.47),smoothstep(.02,.82,reflected.y));
    float sunlight=pow(max(dot(reflected,sunDirection),0.),270.);
    float broadLight=pow(max(dot(reflected,sunDirection),0.),28.);
    float detail=fbm(wpos.xz*.075+vec2(clock*.11,-clock*.06));
    vec3 depthColor=mix(vec3(.014,.073,.097),vec3(.027,.16,.20),.18+.30*detail);
    vec3 col=mix(depthColor,reflectedSky,fresnel*.76)+vec3(.92,.80,.65)*sunlight*.36+vec3(.81,.74,.60)*broadLight*.032;
    float foam=smoothstep(1.03,1.41,crest)*smoothstep(.66,.91,noise(wpos.xz*.7+clock*.11));
    col=mix(col,vec3(.72,.85,.85),foam*.17);
    for(int i=0;i<3;i++){float d=length(wpos.xz-contacts[i].xz);col*=1.-.14*exp(-pow(d/12.,4.));}
    float haze=smoothstep(900.,4500.,length(wpos.xz-cameraPosition.xz));col=mix(col,vec3(.38,.52,.58),haze*.75);
    if(!gl_FrontFacing){float ceiling=fbm(wpos.xz*.058+clock*.03);col=mix(vec3(.018,.11,.155),vec3(.048,.25,.285),ceiling*.58);fresnel=.0;}
    float local=1.-smoothstep(110.,190.,length(wpos.xz));float alpha=1.-inspect*local*.66;
    // At full submersion the camera reads the assembly through the uniform
    // water medium; a separately transparent ceiling slab would tint only
    // the upper image and look like an incorrectly pasted blue rectangle.
    if(!gl_FrontFacing)alpha*=1.-underwater;
    float underwaterDistance=smoothstep(42.,180.,length(wpos-cameraPosition));
    col=mix(col,vec3(.025,.16,.205),underwater*(.25+.75*underwaterDistance));gl_FragColor=vec4(col,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>}`
  }));this.ocean.name='Deterministic WaterPro-compatible visual ocean, not a fluid solve';this.ocean.renderOrder=3;this.ocean.frustumCulled=false;this.scene.add(this.ocean);
  this.seabed=new T.Mesh(new T.PlaneGeometry(7500,7500),new T.MeshStandardMaterial({color:'#567c84',roughness:.95,metalness:0,transparent:true}));
  this.seabed.rotation.x=-Math.PI/2;this.seabed.position.y=-74;this.seabed.receiveShadow=true;this.scene.add(this.seabed);
 }

 private async load(){
  const json=async(path:string)=>{const response=await fetch(this.base+path);if(!response.ok)throw Error('Missing v8 evidence '+path);return response.json()};
  const [model,response,manifest]=await Promise.all([json('beso-research/physics/native-model.json'),json('beso-research/physics/zwind-response.json'),json('beso-research/geometry/manifest.json')]);
  this.native=new NativePlatformV16(model,response);this.native.group.name='Persistent native 20 MW assembly / v8 camera world';this.scene.add(this.native.group);this.native.sea.visible=false;
  this.native.setMooringFocus(1);
  this.native.platform.traverse(object=>{if(object instanceof T.Mesh){const material=object.material as T.MeshStandardMaterial;if(material.isMeshStandardMaterial){material.roughness=Math.max(material.roughness,.46);material.metalness=Math.min(material.metalness,.25);if(object.userData.role==='hub_radial_box_beam')material.color.set('#a4b4b3');if(object.userData.role==='inner_leg')material.color.set('#8a9ea1');if(object.userData.role==='outer_column')material.color.set('#526e78');}}});
  // Deliberate reuse of the existing Blender presentation shell; no claim
  // that v8 regenerated CAD or changed the response skeleton.
  await this.native.loadFabricatedHull(this.base+'assets/v16/connected-native-hull.glb');
  await this.native.loadPresentationNacelle(this.base+'assets/v16/nacelle-skin.glb');
  await this.loadWaterPro();
  this.native.tower.material.color.set('#d9e5df');this.native.tower.material.roughness=.44;this.native.tower.material.metalness=.18;
  this.native.rotor.traverse(object=>{if(object instanceof T.Mesh&&object.name.startsWith('Illustrative airfoil')){const material=object.material as T.MeshStandardMaterial;material.color.set('#dbe4e0');material.roughness=.46;material.metalness=.16;}});
  const shared=await json('beso-research/geometry/'+manifest.shared),points=new Float32Array(shared.positions);
  for(const record of manifest.iterations){
   const state=await json('beso-research/geometry/'+record.file),indexed=new T.BufferGeometry();indexed.setAttribute('position',new T.BufferAttribute(points,3));indexed.setIndex(state.indices);indexed.computeVertexNormals();
   const wire=new T.LineSegments(new T.WireframeGeometry(indexed),new T.LineBasicMaterial({color:'#d6a263',transparent:true,opacity:0,depthWrite:false}));
   const geometry=indexed.toNonIndexed();indexed.dispose();
   const colors=new Float32Array(geometry.getAttribute('position').count*3);
   // A restrained teal-to-amber scale keeps the archived BESO evidence
   // legible against the ocean while reserving amber for the high-response
   // faces. It is a visualization of saved faceHeat, not a fresh solve.
   for(let face=0;face<state.faceHeat.length;face++){const scalar=clamp(state.faceHeat[face]),color=new T.Color('#315c6c').lerp(new T.Color('#86b0b8'),scalar*.85);if(scalar>.90)color.lerp(new T.Color('#e0b97a'),(scalar-.90)/.10*.18);for(let corner=0;corner<3;corner++)color.toArray(colors,(face*3+corner)*3);}
   geometry.setAttribute('color',new T.BufferAttribute(colors,3));
   const heatUniform={value:0};
   const material=new T.MeshPhysicalMaterial({color:'#ffffff',metalness:.10,roughness:.62,side:T.DoubleSide,transparent:true,opacity:0,clearcoat:.08,clearcoatRoughness:.60,vertexColors:true});
   // The saved heat field joins gradually on the spoken cue. Changing the
   // vertexColors shader define at one frame made the entire specimen flash.
   material.onBeforeCompile=shader=>{
    shader.uniforms.evidenceHeat=heatUniform;shader.uniforms.evidenceBaseColor={value:new T.Color('#6e9fa9')};
    shader.fragmentShader='uniform float evidenceHeat;\nuniform vec3 evidenceBaseColor;\n'+shader.fragmentShader;
    shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n#ifdef USE_COLOR\n diffuseColor.rgb=mix(evidenceBaseColor,diffuseColor.rgb,evidenceHeat);\n#endif');
   };
   material.customProgramCacheKey=()=> 'v12-continuous-saved-evidence-coating';
   const mesh=new T.Mesh(geometry,material);mesh.castShadow=false;mesh.receiveShadow=false;mesh.visible=wire.visible=false;mesh.name=`Saved BESO state ${record.iteration}`;
   mesh.userData={source:record.file,nativeFileSha256:record.nativeFileSha256,notHullGeometry:true,heatNote:manifest.heat};
   this.evidence.add(mesh,wire);this.surfaces.push({mesh,wire,native:record,heatUniform});
  }
  // The saved specimen is the focal evidence. A cage, plinth and full-mesh
  // wireframe added three unrelated silhouettes without explaining a step.
  this.evidence.scale.setScalar(.80);this.evidence.visible=false;this.buildWind();
  try{const hdr=await new RGBELoader().loadAsync(this.base+'environment/v2-sky.hdr');hdr.mapping=T.EquirectangularReflectionMapping;const pm=new T.PMREMGenerator(this.renderer),environment=pm.fromEquirectangular(hdr);this.environment.dispose();this.environment=environment;this.scene.environment=environment.texture;hdr.dispose();pm.dispose();}catch{ /* Deterministic room environment is already loaded. */ }
  this.buildBlueprint();
  if(!this.disposed)this.render(0);
 }

 private async loadWaterPro(){
  const scope=window as unknown as {THREE:typeof T;WaterProCompat:any};scope.THREE=T;
  if(!scope.WaterProCompat)await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=this.base+'assets/v16/waterpro-adapter.min.js';script.onload=()=>resolve();script.onerror=()=>reject(Error('Licensed WaterPro adapter failed to load'));document.head.appendChild(script)});
  this.waterpro=scope.WaterProCompat;
  this.water=this.waterpro.create(this.scene,{size:24000,scale:1,worldScale:1});
  this.water.name='WaterPro 3.1.1 licensed optical WebGL adapter / visual only';
  this.water.material.fragmentShader=this.water.material.fragmentShader.replace('#include <encodings_fragment>','#include <colorspace_fragment>');
  // The licensed adapter was graded for OVOW's small studio. Match its
  // radiance and haze to this 1:1 offshore scene without changing its optics.
  this.water.material.fragmentShader=this.water.material.fragmentShader
   .replace('vec3 reflected=texture2D(uReflection,clamp(uv,.002,.998)).rgb;','vec3 reflected=texture2D(uReflection,clamp(uv,.002,.998)).rgb; reflected=mix(reflected,vec3(.09,.25,.31),.34);')
   .replace('vec3(.60,.75,.81),haze*.40','vec3(.32,.49,.55),haze*.22');
  this.water.material.needsUpdate=true;
 }

 private buildBlueprint(){
  // This is a same-camera rendering of the actual mesh. It adds no CAD
  // dimensions and does not stand in for a generated or solved structure.
  const meshes:T.Mesh[]=[];
  this.native.group.traverse(object=>{if(object instanceof T.Mesh&&!(object.material instanceof T.ShaderMaterial)&&!object.name.startsWith('Native mooring')&&!object.name.startsWith('Mooring'))meshes.push(object);});
  for(const mesh of meshes){
   const paper=new T.MeshBasicMaterial({color:'#faf7ef',side:T.FrontSide,toneMapped:false});
   const outline=new T.Mesh(mesh.geometry,new T.MeshBasicMaterial({color:'#24475a',side:T.BackSide}));
   outline.scale.setScalar(1.002);outline.name='Blueprint silhouette / presentation only';outline.visible=false;mesh.add(outline);
   const edges=new T.LineSegments(new T.EdgesGeometry(mesh.geometry,28),new T.LineBasicMaterial({color:'#3b5b6b',transparent:true,opacity:.78}));
   edges.name='Blueprint section edges / actual mesh';edges.visible=false;mesh.add(edges);
   this.blueprintSurfaces.push({mesh,original:mesh.material,paper,outline,edges});
  }
 }

 private setBlueprint(enabled:boolean){
  if(enabled===this.blueprintMode)return;
  this.blueprintMode=enabled;
  for(const item of this.blueprintSurfaces){item.mesh.material=enabled?item.paper:item.original;item.outline.visible=item.edges.visible=enabled;}
  this.scene.background=new T.Color(enabled?'#faf7ef':'#afc6cb');
  this.native.structuralGroups.moorings.visible=!enabled;
  this.native.rotor.visible=true;
  this.ocean.visible=this.seabed.visible=this.sky.visible=!enabled;
  this.scene.fog=enabled?null:new T.Fog('#afc6cb',1250,4200);
 }

 /** Clean 2-D first-frame reference for a WAN concept bridge. Normal film
  * rendering remains untouched unless the caller requests this anchor mode. */
 renderBlueprint(time:number){this.render(time,true);}

 private buildWind(){
  // Sparse atmospheric streaks illustrate direction only. Their curvature
  // and speed do not claim to be the stored Z-wind solver's velocity field.
  for(let row=0;row<7;row++){
   const points:T.Vector3[]=[];
   for(let i=0;i<96;i++){const x=-110+i/95*235,z=(row-3)*15;points.push(V(x,24+Math.cos(row*.9)*5,z+Math.sign(z||1)*9*Math.exp(-((x/30)**2))));}
   const line=new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:'#d7ac71',transparent:true,opacity:0,depthWrite:false}));
   line.name='Illustrative wind direction, not computed flow';line.userData={illustrative:true,physicalField:false};line.visible=false;this.native.group.add(line);this.wind.push(line);
  }
 }

 render(time:number,blueprint=false){
  if(!this.native||this.disposed)return;
  // Restore originals before NativePlatform updates its standard materials.
  this.setBlueprint(false);
  const pose=sampleV16Camera(time);this.camera.position.copy(pose.position);this.camera.fov=pose.fov;this.camera.setViewOffset(1920,1080,pose.viewOffsetX,0,1920,1080);this.camera.updateProjectionMatrix();this.camera.lookAt(pose.target);this.camera.updateMatrixWorld();
  // Once the eye is below the local surface, the entire view shares one
  // water medium. A slow 5 m blend left the sky/seabed substantially white
  // while the underside shader was already blue, producing a hard band.
  const underwater=1-ramp(this.camera.position.y,-.10,1.30);
  const inspect=Math.max(ramp(time,3.8,6.2)*(1-ramp(time,11,14)),ramp(time,16.1,17)*(1-ramp(time,22,22.8)),ramp(time,38.9,40.3)*(1-ramp(time,49,52)),ramp(time,54.1,55.2)*(1-ramp(time,63.6,64.8)),ramp(time,65,68.2)*(1-ramp(time,75.8,79)));
  this.ocean.material.uniforms.clock.value=time;this.ocean.material.uniforms.inspect.value=inspect;this.ocean.material.uniforms.underwater.value=underwater;
  const fog=this.scene.fog as T.Fog;fog.color.set('#afc6cb').lerp(new T.Color('#0e4b5f'),underwater);fog.near=1250*(1-underwater)+28*underwater;fog.far=4200*(1-underwater)+300*underwater;
  this.sky.material.uniforms.submersion.value=underwater;this.renderer.toneMappingExposure=.84-.04*underwater;
  // A broad seabed plane and the atmospheric dome have different shader
  // fog/tone pipelines. Looking almost horizontally at both creates a false
  // split-screen horizon. At full immersion use one uniform water clear and
  // remove those distant presentation surfaces; retain the actual assembly.
  const submerged=underwater>.999;
  this.scene.background=new T.Color('#afc6cb').lerp(new T.Color('#0e4b5f'),underwater);
  this.sky.visible=this.seabed.visible=this.ocean.visible=!submerged;
  (this.seabed.material as T.MeshStandardMaterial).opacity=1-underwater;
  this.native.group.position.set(0,0,0);this.native.group.scale.setScalar(1);this.native.group.visible=true;
  this.native.setVisualOceanTime(time,0);
  // Keep a constant structural selection and interpolate only its visual
  // weight. Structural visibility never changes at a camera scene boundary.
  this.native.setTime(120*clamp((time-40)/13),false);this.native.sea.visible=false;
  const tensionFocus=ramp(time,43.0,44.1)*(1-ramp(time,48.5,50.0));
  this.native.structuralGroups.moorings.traverse(object=>{if(object instanceof T.Mesh&&object.userData.sourceLine===1){const material=object.material as T.MeshStandardMaterial,scalar=clamp(Number(object.userData.tensionVisual)||0),heat=scalar<.58?new T.Color('#198495').lerp(new T.Color('#e3b56a'),scalar/.58):new T.Color('#e3b56a').lerp(new T.Color('#d59457'),(scalar-.58)/.42);material.color.set('#526771').lerp(heat,tensionFocus);material.opacity=.64+.31*tensionFocus;}});
  this.native.group.traverse(object=>{if(object instanceof T.Mesh&&object.name.startsWith('Discontinuous water contact'))(object.material as T.ShaderMaterial).uniforms.alpha.value*=1-underwater;});
  this.native.group.updateMatrixWorld(true);
  const contacts=this.ocean.material.uniforms.contacts.value as T.Vector3[];
  for(const [index,id] of ['outer-column-101','outer-column-102','outer-column-103'].entries())this.native.getCalloutAnchors()[id]?.object.getWorldPosition(contacts[index]);
  const enter=ramp(time,22.2,24.7),exit=ramp(time,39,40.3),right=V(1,0,0).applyQuaternion(this.camera.quaternion);
  this.evidence.position.copy(this.specimenBase).addScaledVector(right,1100*(1-enter)+1100*exit);
  this.evidence.visible=time>=22.2&&time<=40.4;this.evidence.rotation.y=-.18-.34*ramp(time,25,36);
  // Keep the generated bridge's state-0 endpoint through 30 s. Start the
  // first archived-state handoff immediately after it, on the spoken cue.
  // These are crossfades between saved surfaces, never invented solver steps.
  const evolution=time<30?0:time<30.75?.62+.38*ramp(time,30,30.75):1+2*clamp((time-30.75)/6.25),lower=Math.min(this.surfaces.length-1,Math.floor(evolution)),blend=ramp(evolution-lower,.62,.97);
  for(const [index,surface] of this.surfaces.entries()){
   const weight=index===lower?1-blend:index===lower+1?blend:0;
   surface.mesh.visible=this.evidence.visible&&weight>.001;surface.mesh.material.opacity=weight;surface.mesh.material.depthWrite=weight>.55;
   // BESO is a saved geometry demonstration here, not a stress-field claim.
   // Retain faceHeat in the archive but show one quiet engineering coating.
   surface.heatUniform.value=0;
   surface.wire.visible=false;const wireMaterial=surface.wire.material as T.LineBasicMaterial;wireMaterial.opacity=0;
  }
  const windWeight=ramp(time,39.8,41.3)*(1-ramp(time,44,45.5));
  for(const [index,line] of this.wind.entries()){line.visible=windWeight>.001;line.material.opacity=.68*windWeight;line.geometry.setDrawRange(Math.floor(((time*.13+index*.10)%1)*28),58);}
  this.scene.updateMatrixWorld(true);
  const anchors:Record<string,Anchor>={};for(const [id,anchor] of Object.entries(this.native.getCalloutAnchors()))anchors[id]=projectAnchor(this.camera,anchor.object.getWorldPosition(V()));
  anchors['specimen']=projectAnchor(this.camera,this.evidence.position);
  anchors['response-point']=projectAnchor(this.camera,this.native.getTowerCenter(.65));
  anchors['brief-space']=projectAnchor(this.camera,V(52,47,24));
  const active=this.surfaces[Math.min(this.surfaces.length-1,lower+(blend>.5?1:0))];
  this.info={time,iteration:active.native.iteration,fraction:active.native.solidVolumeFraction,native:{...this.native.info},lineTension:this.native.getMooringTension(1),fairlead:anchors['fairlead-1'],platform:anchors['platform-center'],towerTop:anchors['tower-top'],beso:anchors['specimen'],camera:{position:pose.position.toArray(),target:pose.target.toArray()},phase:pose.phase,anchors,underwater,fov:pose.fov,specimenVisible:this.evidence.visible,specimenScale:.80,evidenceNote:'BESO specimen and saved Z-wind response are independent archived evidence; visual waves and streaks are not new CFD/solver results.'};
  if(blueprint){this.setBlueprint(true);if(pose.phase==='toolchain')this.native.rotor.visible=false;this.native.group.traverse(object=>{if(object instanceof T.Mesh&&object.material instanceof T.ShaderMaterial)object.visible=false;});this.evidence.visible=false;for(const line of this.wind)line.visible=false;}
  else this.native.group.traverse(object=>{if(object instanceof T.Mesh&&object.material instanceof T.ShaderMaterial&&!this.native.sea.children.includes(object))object.visible=true;});
  if(this.waterpro&&!blueprint){
   this.ocean.visible=false;this.water.visible=!submerged;
   const contacts=this.native.getCalloutAnchors();const bodies=['outer-column-101','outer-column-102','outer-column-103'].map(id=>{const p=contacts[id].object.getWorldPosition(V());return {x:p.x,z:p.z,radius:9.3,strength:.38,flowX:.8,flowZ:.22}});
   this.waterpro.update(this.water,time,{worldScale:1,windSpeed:7,windDirection:.3,bodies,cutaway:{x:0,z:0,radius:inspect*100}});
   const u=this.water.material.uniforms;u.uWaveCount.value=3;u.uWaves.value[0].set(.038,.025,.72,.94);u.uWaves.value[1].set(.089,-.065,1.12,.38);u.uWaves.value[2].set(.24,.12,1.94,.12);u.uPhases.value[0]=u.uPhases.value[1]=u.uPhases.value[2]=-Math.PI/2;
   u.uSun.value.copy(this.sun);this.water.material.opacity=.90;u.uAlpha.value=.90;
   this.waterpro.reflection(this,this.water);
  }else if(this.water)this.water.visible=false;
  this.renderer.render(this.scene,this.camera);
 }

 dispose(){
  if(this.disposed)return;this.disposed=true;this.native?.dispose();
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.scene.traverse(object=>{if(object instanceof T.Mesh||object instanceof T.Line){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());this.waterpro?.dispose(this.water);this.environment.dispose();this.renderer.dispose();
 }
}



