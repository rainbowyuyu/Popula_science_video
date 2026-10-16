// @ts-nocheck
import * as T from 'three/webgpu';
import {pass} from 'three/tsl';
import {WaterSystem,Sky as WaterSky,getPresetParams} from '../../work/vendor/v16-waterpro-native/threejs-water-pro/build/index.js';
import {RGBELoader} from 'three/examples/jsm/loaders/RGBELoader.js';
import {RoomEnvironment} from 'three/examples/jsm/environments/RoomEnvironment.js';
import {toCreasedNormals} from 'three/examples/jsm/utils/BufferGeometryUtils.js';
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
export class LaunchWorldV16Runtime{
 readonly renderer:T.WebGPURenderer;
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
 private nativeWater:any;
 private post:any;
 private nativeSky:any;
 private waterObjects:{object:T.Object3D;visible:boolean}[]=[];
 private hdr:T.Texture;
 private water!:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;

 constructor(canvas:HTMLCanvasElement,base:string){
  this.base=base;
  this.renderer=new T.WebGPURenderer({canvas,antialias:true,forceWebGL:!!window.__V16_FORCE_WEBGL,powerPreference:'high-performance'});
  this.renderer.setSize(1920,1080,false);this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=.84;
  this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=T.PCFSoftShadowMap;this.renderer.localClippingEnabled=true;
  this.scene.background=new T.Color('#afc6cb');this.scene.fog=new T.Fog('#afc6cb',1250,4200);
  this.scene.add(new T.HemisphereLight('#d4e9ee','#173744',.48));
  const key=new T.DirectionalLight('#ffe4b4',3.25);key.position.copy(this.sun).multiplyScalar(480);key.castShadow=true;
  key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-180,right:180,top:310,bottom:-90,near:2,far:950});
  key.shadow.normalBias=.12;key.shadow.bias=-.00015;key.shadow.radius=4;this.scene.add(key);
  const rim=new T.DirectionalLight('#97d1df',.84);rim.position.set(230,140,170);this.scene.add(rim);
  const bounce=new T.DirectionalLight('#8aa8b5',.28);bounce.position.set(-80,-30,40);this.scene.add(bounce);
  this.evidence.name='Independent archived BESO specimen';this.scene.add(this.evidence);
  this.ready=this.load();
 }

 private async load(){
  await this.renderer.init();
  const json=async(path:string)=>{const response=await fetch(this.base+path);if(!response.ok)throw Error('Missing v8 evidence '+path);return response.json()};
  const [model,response,manifest]=await Promise.all([json('beso-research/physics/native-model.json'),json('beso-research/physics/zwind-response.json'),json('beso-research/geometry/manifest.json')]);
  this.native=new NativePlatformV16(model,response);this.native.group.name='Persistent native 20 MW assembly / v8 camera world';this.scene.add(this.native.group);this.native.sea.visible=false;
  this.native.setMooringFocus(1);
  this.native.platform.traverse(object=>{if(object instanceof T.Mesh){const material=object.material as T.MeshStandardMaterial;if(material.isMeshStandardMaterial){material.roughness=Math.max(material.roughness,.46);material.metalness=Math.min(material.metalness,.25);if(object.userData.role==='hub_radial_box_beam')material.color.set('#a4b4b3');if(object.userData.role==='inner_leg')material.color.set('#8a9ea1');if(object.userData.role==='outer_column')material.color.set('#526e78');}}});
  // Deliberate reuse of the existing Blender presentation shell; no claim
  // that v8 regenerated CAD or changed the response skeleton.
  await this.native.loadFabricatedHull(this.base+'assets/v16/connected-native-hull.glb');
  await this.native.loadPresentationNacelle(this.base+'assets/v16/nacelle-skin.glb');
  this.native.group.remove(this.native.sea);
  for(const o of [...this.native.group.children])if(o instanceof T.Mesh&&o.material instanceof T.ShaderMaterial)this.native.group.remove(o);
  this.native.tower.material.color.set('#d9e5df');this.native.tower.material.roughness=.44;this.native.tower.material.metalness=.18;
  this.native.rotor.traverse(object=>{if(object instanceof T.Mesh&&object.name.startsWith('Illustrative airfoil')){const material=object.material as T.MeshStandardMaterial;material.color.set('#dbe4e0');material.roughness=.46;material.metalness=.16;}});
  const shared=await json('beso-research/geometry/'+manifest.shared),points=new Float32Array(shared.positions);
  for(const record of manifest.iterations){
   const state=await json('beso-research/geometry/'+record.file),indexed=new T.BufferGeometry();indexed.setAttribute('position',new T.BufferAttribute(points,3));indexed.setIndex(state.indices);indexed.computeVertexNormals();
   const wire=new T.LineSegments(new T.WireframeGeometry(indexed),new T.LineBasicMaterial({color:'#d6a263',transparent:true,opacity:0,depthWrite:false}));
   const geometry=toCreasedNormals(indexed,Math.PI*.40);indexed.dispose();
   const colors=new Float32Array(geometry.getAttribute('position').count*3);
   // A restrained teal-to-amber scale keeps the archived BESO evidence
   // legible against the ocean while reserving amber for the high-response
   // faces. It is a visualization of saved faceHeat, not a fresh solve.
   for(let face=0;face<state.faceHeat.length;face++){const scalar=clamp(state.faceHeat[face]),color=new T.Color('#315c6c').lerp(new T.Color('#86b0b8'),scalar*.85);if(scalar>.90)color.lerp(new T.Color('#e0b97a'),(scalar-.90)/.10*.18);for(let corner=0;corner<3;corner++)color.toArray(colors,(face*3+corner)*3);}
   geometry.setAttribute('color',new T.BufferAttribute(colors,3));
   const heatUniform={value:0};
   const material=new T.MeshPhysicalMaterial({color:'#71969e',metalness:.18,roughness:.48,side:T.DoubleSide,transparent:true,opacity:0,clearcoat:.12,clearcoatRoughness:.55,vertexColors:false,flatShading:false});
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
  this.hdr=await new RGBELoader().loadAsync(this.base+'environment/v2-sky.hdr');this.hdr.mapping=T.EquirectangularReflectionMapping;this.scene.environment=this.hdr;this.scene.environmentIntensity=.4;
  await this.loadWaterPro();
  this.buildBlueprint();
  if(!this.disposed)await this.render(0);
 }

 private async loadWaterPro(){
  const before=new Set(this.scene.children);
  this.nativeWater=await WaterSystem.create(this.renderer,this.scene,this.camera,'high',{deterministic:true,seed:.164219,stepSize:1/60});
  const preset=getPresetParams('dusk');
  preset.color={absorptionColor:'#100804',transmissionColor:'#429295',waterColor:'#0c3d4f'};
  preset.fog={...preset.fog,color:'#afc6cb',enabled:true,fadeStart:1000,fadeEnd:9500};
  preset.waves.fft.windSpeed=8.2;preset.waves.fft.animationSpeed=.65;preset.waves.fft.amplitude=.42;preset.waves.fft.choppiness=.62;preset.waves.fft.standingWaveRatio=.12;
  preset.waves.gerstner.amplitude=.64;preset.waves.gerstner.wavelength=64;
  preset.waves.fft.cascades.waves.scale=150;preset.waves.fft.cascades.waves.amplitudeScale=.20;preset.waves.fft.cascades.ripples.scale=34;preset.waves.fft.cascades.ripples.amplitudeScale=.055;
  preset.sky.sun.elevation=26;preset.sky.sun.azimuth=225;preset.sky.sun.intensity=1.65;preset.sky.brightness=.7;
  preset.oceanFloor.enabled=false;preset.spray.enabled=false;preset.foam.waves.enabled=false;
  preset.foam.surface.size=6;preset.foam.surface.opacity=.1;preset.foam.surface.coverage=.78;
  preset.foam.shoreline.range=1.6;preset.foam.shoreline.size=3.5;preset.foam.shoreline.opacity=.34;
  preset.sparkle.intensity=.28;preset.ssr.strength=.6;preset.sss.intensity=.4;
  preset.postProcessing.underwaterParticles.enabled=false;preset.postProcessing.filmGrain.enabled=false;preset.postProcessing.rain.enabled=false;
  preset.postProcessing.underwater.distortionIntensity=.003;
  this.nativeWater.loadPreset(preset);this.nativeWater.rain.ripples.enabled=false;this.nativeWater.rain.ripples.strength=0;this.nativeWater.rain.ripples.density=0;
  if(this.nativeWater.backend!=='webgpu')throw Error('v16 requires the licensed native WaterPro WebGPU backend');
  window.__V16_WATER_QA={backend:this.nativeWater.backend,version:'3.1.1',seed:this.nativeWater.seed,deterministic:true,stepSize:1/60,params:preset};
  console.log('WATER_BACKEND',this.nativeWater.backend,'RAIN',this.nativeWater.rain.ripples.enabled);
  this.nativeSky=new WaterSky({equirect:this.hdr,brightness:.62,sunDirection:this.nativeWater.lighting.sun.direction,reflectionRoughness:.18,reflectionDistanceBlur:.4});
  this.nativeSky.getMeshes().forEach(o=>this.scene.add(o));this.nativeWater.setSky(this.nativeSky);
  this.waterObjects=this.scene.children.filter(o=>!before.has(o)).map(object=>({object,visible:object.visible}));
  this.post=new T.PostProcessing(this.renderer);const scenePass=pass(this.scene,this.camera);this.post.outputNode=this.nativeWater.postProcessing.buildNode(scenePass,scenePass.getTextureNode('output'));
  await this.renderer.compileAsync(this.scene,this.camera);
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
  this.waterObjects.forEach(({object,visible})=>object.visible=enabled?false:visible);
  this.scene.fog=enabled?null:new T.Fog('#afc6cb',1250,4200);
 }

 /** Clean 2-D first-frame reference for a WAN concept bridge. Normal film
  * rendering remains untouched unless the caller requests this anchor mode. */
 async renderBlueprint(time:number){await this.render(time,true);}

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

 async render(time:number,blueprint=false){
  if(!this.native||this.disposed)return;
  // Restore originals before NativePlatform updates its standard materials.
  this.setBlueprint(false);
  const pose=sampleV16Camera(time);this.camera.position.copy(pose.position);this.camera.fov=pose.fov;this.camera.setViewOffset(1920,1080,pose.viewOffsetX,0,1920,1080);this.camera.updateProjectionMatrix();this.camera.lookAt(pose.target);this.camera.updateMatrixWorld();
  // Once the eye is below the local surface, the entire view shares one
  // water medium. A slow 5 m blend left the sky/seabed substantially white
  // while the underside shader was already blue, producing a hard band.
  const underwater=1-ramp(this.camera.position.y,-.10,1.30);
  const inspect=Math.max(ramp(time,3.8,6.2)*(1-ramp(time,11,14)),ramp(time,16.1,17)*(1-ramp(time,22,22.8)),ramp(time,38.9,40.3)*(1-ramp(time,49,52)),ramp(time,54.1,55.2)*(1-ramp(time,63.6,64.8)),ramp(time,65,68.2)*(1-ramp(time,75.8,79)));
  const submerged=underwater>.999;
  this.scene.background=new T.Color('#afc6cb').lerp(new T.Color('#0e4b5f'),underwater);
  this.scene.fog=underwater>.01?new T.Fog('#0e4b5f',30,420):null;
  this.native.group.position.set(0,0,0);this.native.group.scale.setScalar(1);this.native.group.visible=true;
  this.native.setVisualOceanTime(time,0);
  // Keep a constant structural selection and interpolate only its visual
  // weight. Structural visibility never changes at a camera scene boundary.
  this.native.setTime(120*clamp((time-40)/13),false);this.native.sea.visible=false;
  const tensionFocus=ramp(time,43.0,44.1)*(1-ramp(time,48.5,50.0));
  this.native.structuralGroups.moorings.traverse(object=>{if(object instanceof T.Mesh&&object.userData.sourceLine===1){const material=object.material as T.MeshStandardMaterial,scalar=clamp(Number(object.userData.tensionVisual)||0),heat=scalar<.58?new T.Color('#198495').lerp(new T.Color('#e3b56a'),scalar/.58):new T.Color('#e3b56a').lerp(new T.Color('#d59457'),(scalar-.58)/.42);material.color.set('#526771').lerp(heat,tensionFocus);material.opacity=.64+.31*tensionFocus;}});
  this.native.group.traverse(object=>{if(object instanceof T.Mesh&&object.name.startsWith('Discontinuous water contact'))(object.material as T.ShaderMaterial).uniforms.alpha.value*=1-underwater;});
  this.native.group.updateMatrixWorld(true);
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
  if(blueprint){await this.renderer.renderAsync(this.scene,this.camera);}
  else{
   this.waterObjects.forEach(({object,visible})=>object.visible=visible);
   this.nativeWater.syncToTick(Math.max(0,Math.round(time*60)-1));
   await this.nativeWater.update(1/60);
   await this.post.renderAsync();
  }

 }

 dispose(){
  if(this.disposed)return;this.disposed=true;this.native?.dispose();
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();this.scene.traverse(object=>{if(object instanceof T.Mesh||object instanceof T.Line){geometries.add(object.geometry);for(const material of Array.isArray(object.material)?object.material:[object.material])materials.add(material);}});
  geometries.forEach(geometry=>geometry.dispose());materials.forEach(material=>material.dispose());this.nativeWater?.dispose();this.nativeSky?.dispose();this.hdr?.dispose();this.post?.dispose();this.renderer.dispose();
 }
}


window.LaunchWorldV16Runtime=LaunchWorldV16Runtime;

