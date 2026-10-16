import * as T from 'three';
import {WorldV10} from './WorldV10';
import {loadWaterProV09} from './WaterProV09';

export {loadWaterProV09};
type Compat=Awaited<ReturnType<typeof loadWaterProV09>>;
type WaterBuffers={target:T.WebGLRenderTarget;refraction:T.WebGLRenderTarget};
type Surface={mesh:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;height:number;source?:T.Mesh};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));

// These optics are deterministic visual water. The licensed adapter provides
// the mesh, wave uniforms and resource lifecycle; this repair supplies a full
// scene reflection/refraction pass. No FFT, SSR or CFD solver is claimed.
const WAVES=/*glsl*/`
uniform float uTime;uniform vec4 uWaves[8];uniform float uPhases[8];uniform int uWaveCount;
uniform vec4 uNaturalPool;uniform float uIsCreek;
float naturalEdge(float a){return 1.+.083*sin(3.*a+.4)+.045*cos(5.*a-.6)+.026*sin(7.*a+1.3);}
float poolRatio(vec2 p){vec2 q=(p-uNaturalPool.xy)/uNaturalPool.zw;return length(q)/naturalEdge(atan(q.y,q.x));}
vec3 waveField(vec2 p){
 vec3 result=vec3(0.);
 for(int i=0;i<8;i++){if(i>=uWaveCount)break;vec4 w=uWaves[i];float phase=dot(p,w.xy)-uTime*w.z+uPhases[i];
 result+=vec3(w.w*cos(phase),-w.w*w.x*sin(phase),-w.w*w.y*sin(phase));}
 return result;
}
`;
const VERTEX=WAVES+/*glsl*/`
uniform mat4 textureMatrix;
varying vec3 vWorld;varying vec2 vRest,vUvWater;varying vec4 vReflection,vScreen;
#include <fog_pars_vertex>
void main(){
 vec4 world=modelMatrix*vec4(position,1.);vRest=world.xz;vUvWater=uv;
 float bank=mix(1.-smoothstep(.88,1.,poolRatio(world.xz)),smoothstep(0.,.08,uv.x)*smoothstep(0.,.08,1.-uv.x),uIsCreek);
 world.y+=waveField(world.xz).x*bank;
 vWorld=world.xyz;vReflection=textureMatrix*world;
 vec4 mvPosition=viewMatrix*world;vScreen=projectionMatrix*mvPosition;gl_Position=vScreen;
 #include <fog_vertex>
}`;
const FRAGMENT=WAVES+/*glsl*/`
uniform sampler2D uReflection,uRefraction,uDepth;
uniform float uAlpha;uniform vec3 uSun;uniform mat4 uRefractionInverse;
uniform vec2 uBufferPixel;
varying vec3 vWorld;varying vec2 vRest,vUvWater;varying vec4 vReflection,vScreen;
#include <fog_pars_fragment>
float hash21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float fresnelWater(float c){
 c=clamp(c,.001,1.);float eta=1.333,ct=sqrt(max(0.,1.-(1.-c*c)/(eta*eta)));
 float rs=(c-eta*ct)/(c+eta*ct),rp=(eta*c-ct)/(eta*c+ct);return .5*(rs*rs+rp*rp);
}
// Residual drops create expanding normal rings, not painted white circles.
// Each cycle starts and ends at zero amplitude, including random-access seeks.
vec2 rainGradient(vec2 p){
 vec2 grid=floor(p/1.25),g=vec2(0.);
 for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
  vec2 cell=grid+vec2(float(x),float(y));float seed=hash21(cell+12.4);
  vec2 centre=(cell+vec2(.15+.7*seed,.15+.7*hash21(cell+41.7)))*1.25;
  vec2 delta=p-centre;float d=max(.001,length(delta)),age=mod(uTime+seed*6.,6.);
  float radius=.48*age,q=d-radius,width=.026+.012*age;
  float env=exp(-q*q/(width*width))*exp(-age*1.3)*smoothstep(.03,.13,age)*(1.-smoothstep(2.1,2.7,age));
  float slope=.00052*env*(62.*cos(q*62.)-2.*q/(width*width)*sin(q*62.));
  g+=delta/d*slope;
 }
 return g;
}
vec2 capillaryGradient(vec2 p){
 vec2 slope=vec2(0.);float footprint=max(length(dFdx(p)),length(dFdy(p)));
 for(int i=0;i<4;i++){
  float j=float(i),k=21.*pow(1.72,j),angle=.48+j*.81;
  vec2 d=vec2(cos(angle),sin(angle));float resolved=1.-smoothstep(.5,2.4,k*footprint);
  slope+=d*cos(dot(p,d)*k-uTime*sqrt(9.81*k)+j*2.19)*.011*resolved;
 }
 return slope;
}
float depthAt(vec2 uv){
 float z=texture2D(uDepth,uv).r;vec4 p=uRefractionInverse*vec4(uv*2.-1.,z*2.-1.,1.);
 return max(0.,-p.z/max(.00001,p.w));
}
void main(){
 float ratio=poolRatio(vRest);if(uIsCreek<.5&&ratio>1.)discard;
 float shore=mix(1.-smoothstep(.982,1.,ratio),smoothstep(0.,.015,vUvWater.x)*smoothstep(0.,.015,1.-vUvWater.x),uIsCreek);
 float bank=mix(1.-smoothstep(.88,1.,ratio),smoothstep(0.,.08,vUvWater.x)*smoothstep(0.,.08,1.-vUvWater.x),uIsCreek);
 vec3 waves=waveField(vRest);vec2 gradient=(waves.yz+capillaryGradient(vRest)+rainGradient(vRest))*bank;
 vec3 n=normalize(vec3(-gradient.x,1.,-gradient.y)),view=normalize(cameraPosition-vWorld);
 float fresnel=fresnelWater(max(.001,dot(n,view)));
 vec2 reflectedUv=vReflection.xy/max(.001,vReflection.w)+n.xz*.012;
 reflectedUv=clamp(reflectedUv,uBufferPixel*2.,vec2(1.)-uBufferPixel*2.);
 // Three taps keep a readable actual tree/sky reflection while avoiding
 // sub-pixel foliage shimmer. No diffuse-sky surrogate replaces the scene.
 vec3 reflected=texture2D(uReflection,reflectedUv).rgb*.6;
 reflected+=texture2D(uReflection,reflectedUv+uBufferPixel*vec2(.8,.45)).rgb*.2;
 reflected+=texture2D(uReflection,reflectedUv-uBufferPixel*vec2(.8,.45)).rgb*.2;
 vec2 screen=vScreen.xy/vScreen.w*.5+.5;
 vec2 refractedUv=clamp(screen-n.xz*.010,.001,.999);
 float surfaceDepth=-(viewMatrix*vec4(vWorld,1.)).z;
 float thickness=clamp(depthAt(refractedUv)-surfaceDepth,0.,1.6);
 vec3 transmittance=exp(-vec3(.57,.23,.16)*thickness);
 vec3 transmitted=texture2D(uRefraction,refractedUv).rgb*transmittance+vec3(.015,.037,.031)*(1.-transmittance);
 vec3 colour=mix(transmitted,reflected,fresnel);
 // A small, directional reflected solar highlight; energy never comes from
 // a flat white overlay. Normal ripples carry and break up the highlight.
 float sunLobe=pow(max(0.,dot(reflect(-normalize(uSun),n),view)),360.);
 colour+=vec3(1.,.87,.65)*sunLobe*.54*fresnel;
 gl_FragColor=vec4(colour,uAlpha*shore);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
}`;

/** Refine the original authored creek triangles without changing bank outline. */
function refineCreek(source:T.Mesh,relativeTo:T.Object3D){
 source.updateWorldMatrix(true,false);relativeTo.updateWorldMatrix(true,false);
 const transform=new T.Matrix4().copy(relativeTo.matrixWorld).invert().multiply(source.matrixWorld);
 const input=source.geometry.index?source.geometry.toNonIndexed():source.geometry.clone();input.applyMatrix4(transform);
 let position=Array.from(input.getAttribute('position').array as ArrayLike<number>);
 let uv=Array.from(input.getAttribute('uv').array as ArrayLike<number>);input.dispose();
 for(let pass=0;pass<2;pass++){
  const nextP:number[]=[],nextUv:number[]=[];
  for(let i=0;i<position.length/3;i+=3){
   const p=[0,1,2].map(j=>position.slice((i+j)*3,(i+j+1)*3));
   const t=[0,1,2].map(j=>uv.slice((i+j)*2,(i+j+1)*2));
   const mid=(a:number[],b:number[])=>a.map((x,k)=>(x+b[k])*.5);
   p.push(mid(p[0],p[1]),mid(p[1],p[2]),mid(p[2],p[0]));t.push(mid(t[0],t[1]),mid(t[1],t[2]),mid(t[2],t[0]));
   for(const indices of [[0,3,5],[3,1,4],[5,4,2],[3,4,5]])for(const k of indices){nextP.push(...p[k]);nextUv.push(...t[k]);}
  }
  position=nextP;uv=nextUv;
 }
 // A level surface is required for the actual planar reflection. The source
 // creek's +/-1.8 cm decorative height wobble is below the bank freeboard.
 for(let i=1;i<position.length;i+=3)position[i]=-.23;
 const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(position,3));
 result.setAttribute('uv',new T.Float32BufferAttribute(uv,2));result.computeVertexNormals();result.computeBoundingSphere();return result;
}

export class WaterPoolV19Repair {
 readonly group=new T.Group();readonly mesh:T.Mesh<T.BufferGeometry,T.ShaderMaterial>;
 private readonly surfaces:Surface[]=[];
 private readonly solar=new T.Vector3(0,.21,.98).normalize();
 private readonly reflectedCamera=new T.PerspectiveCamera();
 private readonly refractedCamera=new T.PerspectiveCamera();
 private creekDiscovered=false;
 private disposed=false;
 constructor(private compat:Compat,private world:Pick<WorldV10,'nature'|'water'|'waterMaterial'>,
  private renderer:T.WebGLRenderer,private scene:T.Scene,private camera:T.PerspectiveCamera){
  this.group.name='v19-repair-reflective-pond-and-creek';world.nature.add(this.group);
  // The authored rim is around y=-.018. V16 placed its water at +.025,
  // several centimetres above the bank, so the surface read as a floating
  // patch. This level stays inside the real depressed bed and behind its lip.
  this.mesh=this.makeSurface(false);this.mesh.position.set(-3,-.041,3);
  this.mesh.name='v19-repair-natural-pond';this.surfaces.push({mesh:this.mesh,height:-.041});
 }
 private makeSurface(creek:boolean){
  const mesh=this.compat.create(this.group,{size:4.8,scale:.025,worldScale:1}) as T.Mesh<T.BufferGeometry,T.ShaderMaterial>;
  const material=mesh.material;
  material.vertexShader=VERTEX;material.fragmentShader=FRAGMENT;
  Object.assign(material.uniforms,T.UniformsUtils.clone(T.UniformsLib.fog),{
   uNaturalPool:{value:new T.Vector4(-3,3,1.57,1.34)},uIsCreek:{value:creek?1:0},
   uRefractionInverse:{value:new T.Matrix4()},uBufferPixel:{value:new T.Vector2(1/1024,1/576)},
  });
  // Refraction already contains the bed; additional alpha blending previously
  // added the pale bed a second time, wiping out reflection contrast.
  material.opacity=1;material.uniforms.uAlpha.value=1;material.fog=true;
  material.depthWrite=true;material.transparent=true;material.name=creek?'v19-repair-reflective-creek':'v19-repair-reflective-pond';
  material.needsUpdate=true;mesh.castShadow=false;mesh.receiveShadow=false;mesh.renderOrder=4;
  mesh.userData.v19WaterRepair={kind:creek?'creek':'pond',method:'planar scene reflection and clipped scene refraction; deterministic gravity-capillary normals'};
  const buffers=mesh.userData.waterpro as WaterBuffers;
  for(const target of [buffers.target,buffers.refraction]){
   target.texture.type=T.HalfFloatType;target.texture.colorSpace=T.LinearSRGBColorSpace;
   target.setSize(1024,576);target.samples=0;
  }
  return mesh;
 }
 private discoverCreek(){
  if(this.creekDiscovered)return;
  const originals:T.Mesh[]=[];
  this.scene.traverse(o=>{const m=o as T.Mesh;if(m.isMesh&&/^v15_winding_shallow_creek/.test(m.name))originals.push(m);});
  for(const source of originals){
   const mesh=this.makeSurface(true);mesh.geometry.dispose();mesh.geometry=refineCreek(source,this.group);
   mesh.rotation.set(0,0,0);mesh.name='v19-repair-original-creek-reflection';source.visible=false;
   this.surfaces.push({mesh,height:-.23,source});
  }
  this.creekDiscovered=originals.length>0;
 }
 setSolarDirection(direction:T.Vector3){
  if(direction.lengthSq()<1e-10||!direction.toArray().every(Number.isFinite))throw new Error('Water solar direction must be finite');
  this.solar.copy(direction).normalize();
 }
 /** Oblique near-plane clipping also works for custom GLSL that omits Three's
  * material clipping chunks. That was a source of above-water refraction. */
 private clipCamera(camera:T.PerspectiveCamera,height:number,above:boolean){
  const plane=new T.Plane(new T.Vector3(0,above?1:-1,0),above?-height:height).applyMatrix4(camera.matrixWorldInverse);
  const clip=new T.Vector4(plane.normal.x,plane.normal.y,plane.normal.z,plane.constant);
  const p=camera.projectionMatrix.elements;
  const q=new T.Vector4((Math.sign(clip.x)+p[8])/p[0],(Math.sign(clip.y)+p[9])/p[5],-1,(1+p[10])/p[14]);
  const denominator=clip.dot(q);if(Math.abs(denominator)<1e-7)return;
  clip.multiplyScalar(2/denominator);p[2]=clip.x;p[6]=clip.y;p[10]=clip.z+1;p[14]=clip.w;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
 }
 private capture(surface:Surface){
  const {mesh,height}=surface,buffers=mesh.userData.waterpro as WaterBuffers,material=mesh.material;
  this.scene.updateMatrixWorld(true);this.camera.updateMatrixWorld(true);
  const reflected=this.reflectedCamera,refracted=this.refractedCamera;
  const p=this.camera.getWorldPosition(new T.Vector3()),target=this.camera.getWorldDirection(new T.Vector3()).add(p);
  reflected.copy(this.camera);reflected.position.set(p.x,2*height-p.y,p.z);
  reflected.up.set(0,1,0).applyQuaternion(this.camera.getWorldQuaternion(new T.Quaternion())).reflect(new T.Vector3(0,1,0));
  reflected.lookAt(target.x,2*height-target.y,target.z);reflected.updateMatrixWorld(true);
  const textureMatrix=new T.Matrix4().set(.5,0,0,.5,0,.5,0,.5,0,0,.5,.5,0,0,0,1);
  material.uniforms.textureMatrix.value.copy(textureMatrix).multiply(reflected.projectionMatrix).multiply(reflected.matrixWorldInverse);
  this.clipCamera(reflected,height+.002,true);
  refracted.copy(this.camera);refracted.updateMatrixWorld(true);this.clipCamera(refracted,height-.003,false);
  material.uniforms.uRefractionInverse.value.copy(refracted.projectionMatrixInverse);
  const renderer=this.renderer,originalTarget=renderer.getRenderTarget(),originalViewport=renderer.getViewport(new T.Vector4());
  const originalScissor=renderer.getScissor(new T.Vector4()),originalScissorTest=renderer.getScissorTest();
  const originalXr=renderer.xr.enabled,originalShadow=renderer.shadowMap.autoUpdate,originalClip=renderer.clippingPlanes;
  const hidden:Array<{node:T.Object3D;visible:boolean}>=[];
  this.scene.traverse(node=>{
   if(node===this.group||node.userData.waterAnnotation||(node.renderOrder>=10&&node.type!=='Scene')){
    hidden.push({node,visible:node.visible});node.visible=false;
   }
  });
  const w=1024,h=Math.max(128,Math.round(w/this.camera.aspect));
  for(const rt of [buffers.target,buffers.refraction])if(rt.width!==w||rt.height!==h)rt.setSize(w,h);
  material.uniforms.uBufferPixel.value.set(1/w,1/h);
  try{
   renderer.xr.enabled=false;renderer.setScissorTest(false);renderer.clippingPlanes=[];
   renderer.shadowMap.autoUpdate=false;renderer.shadowMap.needsUpdate=true;
   renderer.setRenderTarget(buffers.target);renderer.clear();renderer.render(this.scene,reflected);
   renderer.setRenderTarget(buffers.refraction);renderer.clear();renderer.render(this.scene,refracted);
  }finally{
   hidden.forEach(({node,visible})=>node.visible=visible);
   renderer.setRenderTarget(originalTarget);renderer.setViewport(originalViewport);renderer.setScissor(originalScissor);renderer.setScissorTest(originalScissorTest);
   renderer.xr.enabled=originalXr;renderer.shadowMap.autoUpdate=originalShadow;renderer.clippingPlanes=originalClip;
  }
 }
 update(frame:number,layerKey='mesh'){
  if(this.disposed)return;if(!Number.isFinite(frame))throw new Error('Water needs an absolute finite frame');
  this.world.water.visible=false;this.discoverCreek();
  // Derive the exact existing world/micro handoff. All outdoor chapters keep
  // their water; V16 explicitly disabled it during cone/circle/observer.
  const outdoor=clamp((Number(this.world.waterMaterial.uniforms.uOpacity.value)/.78-.1)/.9);
  this.group.visible=outdoor>.001;
  for(const surface of this.surfaces){
   if(surface.source)surface.source.visible=false;
   const material=surface.mesh.material;material.opacity=outdoor;material.depthWrite=outdoor>.995;material.uniforms.uSun.value.copy(this.solar);
   surface.mesh.userData.layerKey=layerKey;
   this.compat.update(surface.mesh,frame/30,{worldScale:1,displayScale:1,windSpeed:2.0,windDirection:.52,direction:.37,
    waves:[{k:4.7,omega:Math.sqrt(9.81*4.7),amplitude:.0075,phase:.3},
     {k:8.9,omega:Math.sqrt(9.81*8.9),amplitude:.0031,phase:1.7},
     {k:16.1,omega:Math.sqrt(9.81*16.1),amplitude:.0011,phase:3.9}],bodies:[]});
   // The adapter intentionally accepts a shared wave direction; introduce a
   // second direction here so the pond does not look like combed corrugation.
   const waves=material.uniforms.uWaves.value as T.Vector4[];
   waves[1].x=8.9*Math.cos(1.67);waves[1].y=8.9*Math.sin(1.67);
   waves[2].x=16.1*Math.cos(-.70);waves[2].y=16.1*Math.sin(-.70);
   surface.mesh.visible=outdoor>.001;
  }
  if(this.group.visible){
   this.group.updateWorldMatrix(true,true);this.camera.updateMatrixWorld(true);
   const frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse));
   for(const surface of this.surfaces)if(frustum.intersectsObject(surface.mesh))this.capture(surface);
  }
 }
 dispose(){
  if(this.disposed)return;this.disposed=true;
  for(const surface of this.surfaces){if(surface.source)surface.source.visible=true;this.compat.dispose(surface.mesh);surface.mesh.geometry.dispose();surface.mesh.material.dispose();}
  this.group.removeFromParent();
 }
}
