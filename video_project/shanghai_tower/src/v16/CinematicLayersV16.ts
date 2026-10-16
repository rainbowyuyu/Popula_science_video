import * as T from 'three';
import {GLTFLoader} from 'three/examples/jsm/loaders/GLTFLoader.js';
import {WorldV16} from './WorldV16';
import {State,pulse,ramp,V} from '../visual';

type WaterAPI={create:(p:T.Object3D,o:any)=>T.Mesh;update:(m:T.Mesh,t:number,o:any)=>void;reflection:(ctx:any,m:T.Mesh)=>void;dispose:(m:T.Mesh)=>void};
/** All added effects are environment/illustration. They never modify FE fields. */
export class CinematicLayersV16{
 readonly root=new T.Group();readonly ready:Promise<void>;
 private water?:T.Mesh;private api?:WaterAPI;private splats:T.Points;
 private blueprint:{source:T.Mesh;line:T.LineSegments}[]=[];
 private riverside?:T.Object3D;
 private soil?:T.Object3D;
 private disposed=false;
 private readonly riverGroundCut=new T.Plane(new T.Vector3(-1,0,0),1.65);
 constructor(private world:WorldV16,private renderer:T.WebGLRenderer,private base:string){
  world.scene.add(this.root);this.root.name='V16-environment-and-illustration';this.root.userData.dataMode='illustrative';
  // The legacy low-poly blocks distract from the actual tower silhouette.
  // Retain the photographic sky and reflections without toy-sized neighbours.
  world.environment.skyline.visible=false;
  const positions:number[]=[],seeds:number[]=[];
  world.tower.updateMatrixWorld(true);
  for(const p of world.parts){
   if(!/ENVELOPE.*GLASS|SPIRAL/.test(p.id))continue;
   for(const mesh of p.meshes){const pos=mesh.geometry.getAttribute('position');
    const step=Math.max(1,Math.floor(pos.count/180));
    for(let i=0;i<pos.count;i+=step){const v=V(pos.getX(i),pos.getY(i),pos.getZ(i)).applyMatrix4(mesh.matrixWorld);positions.push(...v.toArray());seeds.push(((i*73+p.id.length*131)%997)/997);}
   }
  }
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('seed',new T.Float32BufferAttribute(seeds,1));
  const shader=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,blending:T.AdditiveBlending,toneMapped:false,
   uniforms:{reveal:{value:0},opacity:{value:0},pixelHeight:{value:1080}},
   vertexShader:`attribute float seed;uniform float reveal,pixelHeight;varying float vSeed;void main(){vSeed=seed;vec3 p=position;float k=sin(reveal*3.14159265);p.x+=sin(seed*60.0+p.y*2.0)*.045*k;p.z+=cos(seed*47.0)*.045*k;vec4 mv=modelViewMatrix*vec4(p,1.0);gl_Position=projectionMatrix*mv;gl_PointSize=clamp(pixelHeight*.010*(.6+seed)/max(.25,-mv.z),1.4,13.0);}`,
   fragmentShader:`uniform float opacity;varying float vSeed;void main(){float r=length(gl_PointCoord-.5)*2.0;float a=exp(-r*r*4.8)*opacity;if(r>1.0||a<.015)discard;gl_FragColor=vec4(mix(vec3(.12,.50,.62),vec3(1.0,.81,.47),vSeed*.38),a);}`});
  this.splats=new T.Points(geometry,shader);this.splats.frustumCulled=false;this.splats.renderOrder=5;this.root.add(this.splats);
  for(const p of world.parts.filter(x=>/_Z04/.test(x.id)&&['core','floorbeams','outrigger','belt','megacolumn'].includes(x.role))){
   for(const mesh of p.meshes){const line=new T.LineSegments(new T.EdgesGeometry(mesh.geometry,24),new T.LineBasicMaterial({color:'#15617a',transparent:true,depthWrite:false,toneMapped:false,clippingPlanes:(mesh.material as T.Material).clippingPlanes}));line.matrixAutoUpdate=false;line.renderOrder=4;this.blueprint.push({source:mesh,line});this.root.add(line);}
  }
  this.ready=this.initialize();
 }
 private async initialize(){
  (window as any).THREE=T;
  // Licensed local compatibility adapter; not native FFT/SSR/WebGPU WaterPro.
  // @ts-ignore Local licensed JS supplied only to this private production bundle.
  await import('../../work/v16/vendor/waterpro-local.js');
  if(this.disposed)return;
  this.api=(window as any).WaterProCompat as WaterAPI;
  if(!this.api)throw new Error('WaterPro local adapter did not load');
  this.water=this.api.create(this.root,{size:320,worldScale:.01});
  // Keep the optical-depth attachment precise over the .008..200 camera range.
  // Moire is addressed separately by the scale-aware wave spectrum below.
  const refraction=this.water.userData.waterpro.refraction as T.WebGLRenderTarget;
  refraction.depthTexture?.dispose();refraction.depthTexture=new T.DepthTexture(1280,720,T.FloatType);
  (this.water.material as T.ShaderMaterial).uniforms.uDepth.value=refraction.depthTexture;
  this.water.name='WaterPro-illustrative-river';this.water.position.y=-.045;this.water.userData.dataMode='illustrative';
  const mat=this.water.material as T.ShaderMaterial;mat.uniforms.uLand.value.set(1,1.65,.15,0);
  mat.uniforms.uReflectionTexel={value:new T.Vector2(1/1280,1/720)};
  // Architectural shots resolve broad irregular ripples, not sub-metre
  // capillaries. Five reflection taps retain the actual mirrored silhouette.
  mat.fragmentShader=mat.fragmentShader
   .replace('vec3 w=ocean(vRest);',`vec3 w=vec3(0.);
    // Band-limit surface slopes at the delivered pixel footprint. Distant
    // subpixel waves must become roughness, not coherent moire stripes.
    for(int i=0;i<8;i++){if(i>=uWaveCount)break;vec4 wi=uWaves[i];
     float footprint=max(abs(dot(wi.xy,dFdx(vRest))),abs(dot(wi.xy,dFdy(vRest))));
     float resolved=1.-smoothstep(.35,1.9,footprint);
     float phase=dot(vRest,wi.xy)-uTime*wi.z+uPhases[i];
     w+=vec3(wi.w*cos(phase),-wi.w*wi.x*sin(phase),-wi.w*wi.y*sin(phase))*resolved;
    }`)
   .replace('uniform sampler2D uReflection,uRefraction,uDepth;','uniform vec2 uReflectionTexel;uniform sampler2D uReflection,uRefraction,uDepth;')
   .replace('small=capillary(p);',`small=vec2(0.);
    vec2 roughP=vRest*3.1+vec2(uTime*.018,-uTime*.011);
    float roughResolved=1.-smoothstep(.12,.8,max(length(dFdx(roughP)),length(dFdy(roughP))));
    small+=vec2(noise(roughP)-.5,noise(roughP*1.37+vec2(17.3,31.7))-.5)*.016*roughResolved;`)
   .replace('float detail=noise(p*.45-flow*uTime*.19)*.65+noise(p*1.23+flow*uTime*.13)*.35;', 'float detail=.5;')
   .replace('vec3 reflected=texture2D(uReflection,clamp(uv,.002,.998)).rgb;',`vec2 reflectedUV=clamp(uv,.008,.992),blur=uReflectionTexel*2.8;
    vec3 reflected=texture2D(uReflection,reflectedUV).rgb*.40;
    reflected+=(texture2D(uReflection,reflectedUV+vec2(blur.x,0.)).rgb+texture2D(uReflection,reflectedUV-vec2(blur.x,0.)).rgb+texture2D(uReflection,reflectedUV+vec2(0.,blur.y)).rgb+texture2D(uReflection,reflectedUV-vec2(0.,blur.y)).rgb)*.15;`)
   .replace('110.0);color+=vec3(1.,.92,.76)*spec*.35;','72.0);color+=vec3(1.,.92,.76)*spec*.14;');
  mat.needsUpdate=true;
  const result=await new GLTFLoader().loadAsync(this.base+'v16/riverfront-detail.glb');
  if(this.disposed){this.disposeObject(result.scene);return;}
  this.riverside=result.scene;this.riverside.name='Lux3D-Blender-riverfront';this.riverside.userData.dataMode='illustrative';this.riverside.scale.setScalar(.01);this.riverside.position.set(1.45,-.052,.25);this.root.add(this.riverside);
  const soil=await new GLTFLoader().loadAsync(this.base+'v16/soil-cutaway-rim.glb');
  if(this.disposed){this.disposeObject(soil.scene);return;}
  this.soil=soil.scene;this.soil.name='Blender-soil-context-illustration';this.soil.userData.dataMode='illustrative';this.soil.userData.geology='Generic texture layers; not site borehole strata or FE material boundaries';this.soil.scale.setScalar(.01);this.root.add(this.soil);
 }
 update(s:State,mediaFrame:number){
  const frame=s.frame,cue=s.n+s.u;
  const alpha=pulse(80,108,152,204,frame);
  this.splats.visible=alpha>.001;
  const m=this.splats.material as T.ShaderMaterial;m.uniforms.opacity.value=alpha*.9;m.uniforms.reveal.value=ramp(80,204,frame);m.uniforms.pixelHeight.value=this.renderer.domElement.height;
  const blue=pulse(1410,1460,1550,1610,frame)*.75;
  for(const {source,line}of this.blueprint){line.visible=blue>.001;line.matrix.copy(source.matrixWorld);const material=line.material as T.LineBasicMaterial;material.opacity=blue;material.clippingPlanes=(Array.isArray(source.material)?source.material[0]:source.material).clippingPlanes;}
  const waterWeight=(1-pulse(1.9,2.35,26.4,27.2,cue))*(1-pulse(28.8,29.15,38.8,39.5,cue));
  // The legacy stage lowers its far ground to expose foundations. Bring the
  // exterior grade back to the river before reflecting; otherwise water looks
  // like a rectangular sheet floating 130 metres above the city.
  const foundationCut=pulse(4.8,5.7,8.8,9.9,cue);
  this.world.environment.ground.position.y=T.MathUtils.lerp(-.052,-1.35,foundationCut);
  // The river replaces the far land on X>1.65. A coplanar floor only .007
  // world units beneath it causes distant depth-buffer striping and supplies
  // an implausibly shallow refraction sample. Keep opaque land on shore only.
  const groundMaterial=this.world.environment.ground.material;
  groundMaterial.clippingPlanes=waterWeight>.001?[this.riverGroundCut]:null;
  groundMaterial.clipShadows=true;
  // Establish the underground context, then withdraw it before the independent
  // FE pile study so generic decorative strata cannot be read as solver layers.
  if(this.soil){const amount=Math.max(pulse(5.08,5.4,5.9,6.3,cue),pulse(8.3,8.65,8.9,9.5,cue));this.soil.visible=amount>.001;this.soil.position.y=-1.3*(1-amount);}
  if(this.water&&this.api){
   // River occupies the real exterior ground; underground sections remain clear.
   this.water.visible=waterWeight>.001;(this.water.material as T.Material).opacity=.55*waterWeight;
   if(this.riverside){
    this.riverside.visible=waterWeight>.001;this.riverside.position.y=-.052-.02*(1-waterWeight);
    this.riverside.traverse(o=>{if(o instanceof T.Mesh)for(const mat of Array.isArray(o.material)?o.material:[o.material]){mat.transparent=true;mat.opacity=waterWeight;mat.depthWrite=waterWeight>.995;}});
   }
   {
    const waves=[{k:.039,omega:.619,amplitude:.18,phase:.2},{k:.067,omega:.811,amplitude:.11,phase:1.8},{k:.115,omega:1.062,amplitude:.055,phase:3.1},{k:.197,omega:1.390,amplitude:.028,phase:4.7},{k:.331,omega:1.802,amplitude:.014,phase:2.4}];
    this.api.update(this.water,mediaFrame/30,{worldScale:.01,displayScale:1,direction:.4,windSpeed:4.8,windDirection:.4,waves});
    // The licensed compatibility adapter supplies a single direction. Spread
    // the independent components here to avoid a regular washboard surface.
    const uniforms=(this.water.material as T.ShaderMaterial).uniforms,directions=[.31,1.07,-.59,1.92,-1.13];
    waves.forEach((wave,i)=>{uniforms.uWaves.value[i].x=wave.k/.01*Math.cos(directions[i]);uniforms.uWaves.value[i].y=wave.k/.01*Math.sin(directions[i]);});
    uniforms.uReflectionTexel.value.set(1/1280,1/Math.max(128,Math.round(1280/this.world.camera.aspect)));
   }
  }
 }
 reflect(){if(this.water?.visible)this.api?.reflection({renderer:this.renderer,scene:this.world.scene,camera:this.world.camera,mode:'reflection'},this.water);}
 private disposeObject(root:T.Object3D){
  const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
  root.traverse(o=>{if(o instanceof T.Mesh||o instanceof T.Line||o instanceof T.Points){geometries.add(o.geometry);for(const material of Array.isArray(o.material)?o.material:[o.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof T.Texture)textures.add(value);}}});
  for(const texture of textures)texture.dispose();for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();
 }
 dispose(){if(this.disposed)return;this.disposed=true;if(this.water)this.api?.dispose(this.water);this.root.removeFromParent();this.disposeObject(this.root);}
}
