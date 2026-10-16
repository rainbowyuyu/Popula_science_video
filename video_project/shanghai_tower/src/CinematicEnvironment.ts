import * as T from 'three';
import {Sky} from 'three/examples/jsm/objects/Sky.js';
import {HDRLoader} from 'three/examples/jsm/loaders/HDRLoader.js';
import {State,ramp} from './visual';

/** Stateless light-space fit. The sun's world direction is invariant; only its
 * orthographic shadow view translates. Snap by actual shadow-map texels rather
 * than integrating camera motion, so arbitrary Remotion seeks are identical. */
export function architecturalShadowFrame(cameraPosition:T.Vector3,focus:T.Vector3|undefined,sunDirection:T.Vector3,resolution=4096){
 const wholeTarget=new T.Vector3(0,2.8,0),distance=focus?cameraPosition.distanceTo(focus):Infinity;
 const localWeight=focus?1-ramp(2.8,7.5,distance):0;
 const halfWidth=T.MathUtils.lerp(5.4,T.MathUtils.clamp(distance*.82,.5,5.4),localWeight),halfHeight=halfWidth*6.2/5.4;
 const target=wholeTarget.clone();if(focus)target.lerp(focus,localWeight);
 const direction=sunDirection.clone().normalize(),right=new T.Vector3(0,1,0).cross(direction).normalize(),up=direction.clone().cross(right).normalize();
 const texelX=2*halfWidth/resolution,texelY=2*halfHeight/resolution,x=target.dot(right),y=target.dot(up);
 target.addScaledVector(right,Math.round(x/texelX)*texelX-x).addScaledVector(up,Math.round(y/texelY)*texelY-y);
 const normalBias=T.MathUtils.lerp(.0008,Math.max(.00012,Math.min(texelX,texelY)*.30),localWeight);
 return {target,position:target.clone().addScaledVector(direction,19),halfWidth,halfHeight,normalBias,localWeight,texelX,texelY};
}

/**
 * A continuous architectural daylight stage. Geometry uses the film's 1:100
 * metre scale. The distant background is a quiet atmospheric photography stage.
 * All animation is a pure function of film time: seeking never accumulates drift.
 */
export class CinematicEnvironment {
 readonly root=new T.Group();
 readonly sky=new Sky();
 // A broad, high-key daylight rig keeps the pale concrete and glass readable
 // during the close-up cuts.  The solver and camera paths are unchanged.
 readonly sun=new T.DirectionalLight('#fff0d7',2.45);
 readonly hemisphere=new T.HemisphereLight('#e9f5ff','#b8b5aa',.34);
 readonly fill=new T.DirectionalLight('#d9efff',.22);
 // A cool rim light gives the glass edge a readable silhouette when the camera
 // crosses the bright sky.  It is intentionally broad and low intensity so it
 // behaves like an architectural reflector, not a second sun.
 readonly rim=new T.DirectionalLight('#8ed4e6',.34);
 readonly horizonGlow:T.Mesh;
 readonly skyline:T.Group;
 readonly ready:Promise<void>;
 private environment?:T.WebGLRenderTarget;
 readonly ground:T.Mesh<T.PlaneGeometry,T.MeshStandardMaterial>;
 readonly clouds:T.Mesh<T.SphereGeometry,T.ShaderMaterial>;
 private readonly priorBackground:T.Scene['background'];
 private readonly priorEnvironment:T.Scene['environment'];
 private readonly priorFog:T.Scene['fog'];
 private readonly priorEnvironmentIntensity:number;
 private readonly priorEnvironmentRotation:T.Euler;
 private readonly sunDirection=new T.Vector3();
 private disposed=false;

 constructor(private scene:T.Scene,private renderer:T.WebGLRenderer,base=''){
  this.root.name='CinematicEnvironment';
  this.priorBackground=scene.background;
  this.priorEnvironment=scene.environment;
  this.priorFog=scene.fog;
  this.priorEnvironmentIntensity=scene.environmentIntensity;
  this.priorEnvironmentRotation=scene.environmentRotation.clone();
  scene.background=null;
  // The haze begins well beyond the 6.32-unit tower and close-up subjects.
  // Keep a blue-grey aerial perspective instead of a flat white void.  The
  // near tower stays crisp while the distant stage gains depth.
  scene.fog=new T.Fog('#dcebef',28,92);
  renderer.outputColorSpace=T.SRGBColorSpace;
  renderer.toneMapping=T.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.93;
  renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFSoftShadowMap;

  // Actual HDRI sun centre: brightest texel (609,119), 1024 x 512 Radiance.
  // Keep its real 47.99-degree elevation, yaw the map to the film's light azimuth.
  const sunElevation=Math.PI*(.5-119.5/512);
  const sunDirection=new T.Vector3().setFromSphericalCoords(1,Math.PI/2-sunElevation,T.MathUtils.degToRad(-52));
  this.sunDirection.copy(sunDirection);
  const hdriSunLongitude=(609.5/1024-.5)*Math.PI*2;
  const environmentYaw=hdriSunLongitude-Math.atan2(sunDirection.z,sunDirection.x);
  this.sky.name='PhysicalDaylightSky';
  this.sky.scale.setScalar(180);
  this.sky.frustumCulled=false;
  this.sky.renderOrder=-1000;
  const uniforms=this.sky.material.uniforms;
  uniforms.turbidity.value=1.7;
  uniforms.rayleigh.value=2.75;
  uniforms.mieCoefficient.value=.0014;
  uniforms.mieDirectionalG.value=.78;
  uniforms.sunPosition.value.copy(sunDirection);
  // A small cool photographic white-balance adjustment, still computed from
  // Sky's atmospheric scattering. Reflections use the separate real CC0 HDRI.
  this.sky.material.fragmentShader=this.sky.material.fragmentShader.replace(
   'vec4( retColor, 1.0 )','vec4( retColor * vec3( 0.60, 0.90, 1.10 ), 1.0 )');

  this.clouds=this.makeClouds();
  this.horizonGlow=this.makeHorizonGlow();
  this.skyline=this.makeSkyline();
  // A true opaque floor belongs in the transmission background. Ordinary
  // distance fog blends its horizon into the sky without alpha contour bands.
  const groundMaterial=new T.MeshStandardMaterial({color:'#d6d9d4',roughness:.96,metalness:0,transparent:false,depthWrite:true});
  this.ground=new T.Mesh(new T.PlaneGeometry(320,320),groundMaterial);
  this.ground.name='QuietArchitecturalGround';
  this.ground.renderOrder=-800;
  this.ground.rotation.x=-Math.PI/2;
  // Keep the existing below-grade section unobstructed. The model's own plaza
  // continues to define grade; this ground is the distant photography stage.
  this.ground.position.y=-1.35;
  this.ground.receiveShadow=true;

  this.root.add(this.sky,this.clouds,this.horizonGlow,this.skyline,this.ground,this.sun,this.sun.target,this.hemisphere,this.fill,this.rim,this.rim.target);
  this.sun.position.copy(sunDirection).multiplyScalar(19).add(new T.Vector3(0,2.8,0));
  this.sun.target.position.set(0,2.8,0);
  this.sun.castShadow=true;
  this.sun.shadow.mapSize.set(4096,4096);
  Object.assign(this.sun.shadow.camera,{left:-5.4,right:5.4,top:6.2,bottom:-6.2,near:.1,far:38});
  this.sun.shadow.bias=-.00003;
  this.sun.shadow.normalBias=.0008;
  this.sun.shadow.radius=3;
  this.sun.shadow.camera.updateProjectionMatrix();
  this.fill.position.set(7,8,-9);
  this.rim.position.set(-10,7,11);
  this.rim.target.position.set(0,2.2,0);
  this.rim.castShadow=false;

  // Real CC0 photograph supplies sky/cloud reflections; no artificial bright card.
  // The view still uses the continuous procedural Sky rather than a raster backdrop.
  // World must await ready before a frame can render, so no environment pops in.
  this.ready=new HDRLoader().loadAsync(base+'environment/kloofendal_48d_partly_cloudy_puresky_1k.hdr').then(texture=>{
   if(this.disposed){texture.dispose();return;}
   texture.mapping=T.EquirectangularReflectionMapping;
   const pmrem=new T.PMREMGenerator(renderer);
   this.environment=pmrem.fromEquirectangular(texture);
   pmrem.dispose();texture.dispose();
   scene.environment=this.environment.texture;
   scene.environmentIntensity=.84;
   // Three r180 negates environmentRotation before its lookup transform. With
   // yaw alone this maps the measured HDRI sun to the same world direction as Sky.
   scene.environmentRotation.set(0,environmentYaw,0);
  });
  scene.add(this.root);
 }

 private makeClouds(){
  const material=new T.ShaderMaterial({
   uniforms:{filmTime:{value:0},cloudOpacity:{value:.58}},
   side:T.BackSide,transparent:true,depthWrite:false,depthTest:true,
   vertexShader:`
    varying vec3 skyDirection;
    void main(){
     skyDirection=position;
     gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
     gl_Position.z=gl_Position.w*.999999;
    }`,
   fragmentShader:`
    uniform float filmTime;
    uniform float cloudOpacity;
    varying vec3 skyDirection;
    float hash21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123);}
    float noise2(vec2 p){
     vec2 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
     return mix(mix(hash21(i),hash21(i+vec2(1.,0.)),f.x),mix(hash21(i+vec2(0.,1.)),hash21(i+vec2(1.,1.)),f.x),f.y);
    }
    float cloudField(vec2 p){
     float n=0.,a=.58;
     mat2 turn=mat2(.80,-.60,.60,.80);
     for(int j=0;j<4;j++){n+=a*noise2(p);p=turn*p*2.03+vec2(5.7,2.1);a*=.47;}
     return n;
    }
    void main(){
     vec3 d=normalize(skyDirection);
     vec2 p=d.xz/max(.18,d.y)*1.5+vec2(filmTime*.0015,filmTime*.00055);
     float field=cloudField(p);
     float horizon=smoothstep(.0,.075,d.y);
     float alpha=smoothstep(.40,.68,field)*horizon*cloudOpacity;
     gl_FragColor=vec4(mix(vec3(.76,.89,.98),vec3(1.85,1.89,1.84),field),alpha);
     #include <tonemapping_fragment>
     #include <colorspace_fragment>
    }`,
  });
  const mesh=new T.Mesh(new T.SphereGeometry(82,32,16),material);
  mesh.name='ThinDeterministicCloudLayer';
  mesh.frustumCulled=false;
  mesh.renderOrder=-900;
  return mesh;
 }

 private makeHorizonGlow(){
  // A large, camera-facing atmospheric disc makes the horizon transition
  // legible during the long crane shots.  It never covers the tower because it
  // is depth-tested and sits well behind the structural stage.
  const material=new T.ShaderMaterial({
   transparent:true,depthWrite:false,depthTest:true,side:T.DoubleSide,
   uniforms:{},
   vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
   fragmentShader:`varying vec2 vUv;void main(){float d=distance(vUv,vec2(.5,.52));float a=smoothstep(.54,.08,d)*.12;vec3 c=mix(vec3(.56,.78,.88),vec3(.98,.86,.66),smoothstep(.15,.72,vUv.y));gl_FragColor=vec4(c,a);}`,
  });
  const mesh=new T.Mesh(new T.PlaneGeometry(145,62),material);
  mesh.name='SoftHorizonAtmosphere';
  mesh.position.set(0,7,-42);
  mesh.renderOrder=-895;
  return mesh;
 }

 private makeSkyline(){
  const root=new T.Group();root.name='DistantCitySilhouette';
  const mat=new T.MeshBasicMaterial({color:'#6b8790',transparent:true,opacity:.10,depthWrite:false,fog:true});
  // Sparse skyline blocks are kept low and distant; they ground the tower while
  // preserving the uncluttered editorial stage.  The fixed seed makes seeking
  // and frame-by-frame rendering deterministic.
  let seed=31;const rand=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/0xffffffff;};
  for(let i=0;i<34;i++){
   const w=.55+rand()*1.5,h=.18+rand()*.68,d=.25+rand()*.35;
   const x=-22+i*1.32+(rand()-.5)*.42,z=-24+(rand()-.5)*4;
   const b=new T.Mesh(new T.BoxGeometry(w,h,d),mat.clone());
   b.position.set(x,-1.15+h*.5,z);b.rotation.y=(rand()-.5)*.08;
   root.add(b);
  }
  root.renderOrder=-870;
  return root;
 }

 update(state:State,camera:T.Camera,focus?:T.Vector3){
  // The sky is effectively infinitely distant. Recentring it leaves its angular
  // lighting stable, including under arbitrary-frame Remotion renders.
  this.sky.position.copy(camera.position);
  this.clouds.position.copy(camera.position);
  this.clouds.material.uniforms.filmTime.value=state.time;
  // Missing focus retains the complete-building shadow coverage. The caller
  // can supply the exact post-response lookAt point used by its camera, never
  // an inferred core point or a previous frame's target.
  const shadow=architecturalShadowFrame(camera.position,focus,this.sunDirection,this.sun.shadow.mapSize.x);
  this.sun.position.copy(shadow.position);this.sun.target.position.copy(shadow.target);
  const shadowCamera=this.sun.shadow.camera;
  shadowCamera.left=-shadow.halfWidth;shadowCamera.right=shadow.halfWidth;shadowCamera.top=shadow.halfHeight;shadowCamera.bottom=-shadow.halfHeight;
  shadowCamera.updateProjectionMatrix();this.sun.shadow.normalBias=shadow.normalBias;
  // The glow and skyline are placed in world space so parallax is preserved;
  // the sky/cloud layers alone follow the camera.
 }

 dispose(){
  if(this.disposed)return;
  this.disposed=true;
  this.scene.remove(this.root);
  if(this.environment&&this.scene.environment===this.environment.texture){
   this.scene.environment=this.priorEnvironment;
   this.scene.environmentIntensity=this.priorEnvironmentIntensity;
   this.scene.environmentRotation.copy(this.priorEnvironmentRotation);
  }
  this.scene.background=this.priorBackground;
  this.scene.fog=this.priorFog;
  this.sky.geometry.dispose();this.sky.material.dispose();
  this.clouds.geometry.dispose();this.clouds.material.dispose();
  this.horizonGlow.geometry.dispose();
  (Array.isArray(this.horizonGlow.material)?this.horizonGlow.material:[this.horizonGlow.material]).forEach(m=>m.dispose());
  this.skyline.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();const m=Array.isArray(o.material)?o.material:[o.material];m.forEach(x=>x.dispose());}});
  this.ground.geometry.dispose();this.ground.material.dispose();
  this.sun.shadow.map?.dispose();
  this.environment?.dispose();
  this.root.clear();
 }
}
