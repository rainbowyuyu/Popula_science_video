import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** V09: low-angle solar light, cool sky fill and a grounded photographic terrace.
 * Solar light tracks the actual optical axis through setSolarDirection.
 * Outdoor direct light is removed during micro explanations; separate studio lights take over.
 * All dimensions are metres. Assets are authored in Blender with CC0 maps.
 * The owner loads the GLB once, then passes it to attachAsset before render.
 * No optical conclusion or ray geometry is created by this environment.
 */
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
const hash=(i:number,s:number)=>{let n=Math.imul(i+1,0x9e3779b1)^s;n=Math.imul(n^(n>>>16),0x85ebca6b);n=Math.imul(n^(n>>>13),0xc2b2ae35);return ((n^(n>>>16))>>>0)/4294967296;};

const SKY_VERTEX=/*glsl*/`
varying vec3 vWorld;
void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}
`;
const SKY_FRAGMENT=/*glsl*/`
varying vec3 vWorld;uniform float uMicro;uniform sampler2D uLandscape;
uniform float uHasLandscape;uniform float uLandscapeRotation;uniform vec3 uSolar;
float h(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
float noise3(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
 mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float n=0.;float a=.53;for(int i=0;i<5;i++){n+=a*noise3(p);p=p*2.03+vec3(9.1,3.7,2.4);a*=.48;}return n;}
void main(){
 vec3 d=normalize(vWorld-cameraPosition);
 float altitude=d.y;
 vec3 horizon=vec3(.765,.835,.815),blue=vec3(.365,.627,.705);
 vec3 colour=mix(horizon,blue,smoothstep(-.035,.80,altitude));
 colour=mix(vec3(.795,.83,.775),colour,smoothstep(-.17,.08,altitude));
 // Photographic broad cloud masses, only above the horizon; fixed in world space.
 vec3 cp=vec3(d.x*5.4,d.y*7.2,d.z*5.4)+vec3(4.1,.2,9.);
 float coarse=fbm(cp),fine=fbm(cp*2.7);
 float coverage=smoothstep(.46,.69,coarse*.82+fine*.18);
 coverage*=smoothstep(.035,.18,altitude)*(1.-smoothstep(.70,.97,altitude));
 float underside=smoothstep(.40,.68,coarse);
 vec3 cloud=mix(vec3(.66,.747,.737),vec3(.937,.948,.895),underside);
 colour=mix(colour,cloud,coverage*.66);
 vec3 sunDirection=normalize(uSolar);
 float glow=pow(max(0.,dot(d,sunDirection)),18.);
 colour+=vec3(.032,.021,.007)*glow;
 if(uHasLandscape>.5){
   vec2 uv=vec2(atan(d.z,d.x)/6.283185307+.5+uLandscapeRotation/6.283185307,
     asin(clamp(d.y,-1.,1.))/3.141592654+.5);
   uv.x=fract(uv.x);
   vec3 photographed=texture2D(uLandscape,uv).rgb;
   // A gentle cooler rain-side veil on the photographed panorama. It carries
   // the weather story without inventing terrain meshes or measurement data.
   float rainSide=pow(max(0.,dot(d,-uSolar)),2.)*smoothstep(-.05,.16,altitude);
   float luminance=dot(photographed,vec3(.2126,.7152,.0722));
   photographed=mix(vec3(luminance),photographed,.80)*vec3(.985,1.008,1.022);
   photographed=mix(photographed,vec3(.35,.43,.48),rainSide*.10);
   photographed+=vec3(.019,.012,.004)*pow(max(0.,dot(d,uSolar)),3.)*smoothstep(-.1,.22,altitude);
   colour=mix(photographed,colour,.38*smoothstep(-.025,.18,altitude));
 }
 // Quiet micro studio replaces the entire outdoor set through the same sky dome.
 // Linear-light values: these must stay low before the final display transform.
 // A gray-blue numeric RGB here becomes pale teal after the filmic/sRGB output.
 vec3 studio=mix(vec3(.003,.0075,.0105),vec3(.005,.012,.017),smoothstep(-.25,.72,altitude));
 studio+=vec3(.001,.002,.0025)*pow(max(0.,dot(d,normalize(vec3(-.6,.3,.7)))),8.);
 studio+=vec3(.001,.0015,.0020)*pow(max(0.,dot(d,normalize(vec3(.12,.06,-1.)))),5.);
 colour=mix(colour,studio,uMicro);
 gl_FragColor=vec4(colour,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;

type RegisteredMaterial={material:T.Material;baseOpacity:number;baseTransparent:boolean;baseDepthWrite:boolean};

const CREEK_VERTEX=/*glsl*/`
varying vec3 vWorld;varying vec2 vUV;
#include <fog_pars_vertex>
void main(){vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vUV=uv;
 vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
 #include <fog_vertex>
}`;
const CREEK_FRAGMENT=/*glsl*/`
uniform float uFrame;uniform float uOpacity;uniform sampler2D uLandscape;uniform float uHasLandscape;uniform float uLandscapeRotation;
uniform sampler2D uPebble;varying vec3 vWorld;varying vec2 vUV;
#include <fog_pars_fragment>
void main(){
 float time=uFrame/30.;vec2 p=vWorld.xz;
 float w1=sin(p.x*4.1+p.y*1.65-time*.71),w2=sin(p.x*1.8-p.y*7.8+time*.48),w3=sin(p.x*11.2+p.y*3.7-time*1.10);
 vec2 slope=vec2(cos(p.x*4.1+p.y*1.65-time*.71)*.033+cos(p.x*1.8-p.y*7.8+time*.48)*.008+cos(p.x*11.2+p.y*3.7-time*1.10)*.011,
 cos(p.x*4.1+p.y*1.65-time*.71)*.013-cos(p.x*1.8-p.y*7.8+time*.48)*.033+cos(p.x*11.2+p.y*3.7-time*1.10)*.004);
 vec3 normal=normalize(vec3(-slope.x,1.,-slope.y));vec3 toEye=normalize(cameraPosition-vWorld);vec3 reflected=reflect(-toEye,normal);
 float fresnel=.025+.77*pow(1.-max(0.,dot(normal,toEye)),4.5);
 vec3 sky=vec3(.48,.66,.71);if(uHasLandscape>.5){vec2 uv=vec2(fract(atan(reflected.z,reflected.x)/6.2831853+.5+uLandscapeRotation/6.2831853),asin(clamp(reflected.y,-1.,1.))/3.14159265+.5);sky=texture2D(uLandscape,uv).rgb;}
 vec3 pebbles=texture2D(uPebble,p*.42+slope*.18).rgb;
 float edge=pow(abs(vUV.x-.5)*2.,3.);vec3 bed=pebbles*vec3(.42,.53,.40);
 vec3 transmitted=mix(vec3(.035,.17,.15),bed,.36+edge*.24);
 float caustic=pow(max(0.,w1*w2*.5+w3*.22+.27),5.)*.09;
 vec3 colour=mix(transmitted,sky,fresnel)+vec3(.71,.83,.63)*caustic;
 gl_FragColor=vec4(colour,uOpacity);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
 #include <fog_fragment>
}`;

export class EnvironmentV09 {
  readonly group=new T.Group();
  readonly environment:T.WebGLRenderTarget;
  private readonly assetGroup=new T.Group();
  private readonly scene:T.Scene;
  private readonly previousBackground:T.Scene['background'];
  private readonly skyMaterial:T.ShaderMaterial;
  private readonly materials:RegisteredMaterial[]=[];
  private readonly key:T.DirectionalLight;
  private readonly hemisphere:T.HemisphereLight;
  private readonly fill:T.DirectionalLight;
  private readonly rain:T.LineSegments<T.BufferGeometry,T.LineBasicMaterial>;
  private readonly rainPosition:T.BufferAttribute;
  private readonly rainSeed:Float32Array;
  private lastMicro=0;
  private lastFrame=0;
  private disposed=false;
  private readonly solar=new T.Vector3(0,Math.sin(T.MathUtils.degToRad(12)),Math.cos(T.MathUtils.degToRad(12)));
  private readonly fog=new T.FogExp2('#b8c9ce',.0085);
  private readonly previousFog:T.Scene['fog'];
  private readonly previousEnvironment:T.Scene['environment'];
  private readonly previousEnvironmentIntensity:number;
  private readonly studioKey:T.DirectionalLight;
  private readonly studioFill:T.DirectionalLight;
  private creekMaterial?:T.ShaderMaterial;

  constructor(renderer:T.WebGLRenderer,scene:T.Scene){
    this.scene=scene;this.previousBackground=scene.background;this.previousFog=scene.fog;this.previousEnvironment=scene.environment;this.previousEnvironmentIntensity=scene.environmentIntensity;scene.fog=this.fog;
    this.group.name='v13-rain-garden-cinematic-environment';scene.add(this.group);
    this.assetGroup.name='v09-authored-blender-environment';this.group.add(this.assetGroup);
    this.skyMaterial=new T.ShaderMaterial({uniforms:{uMicro:{value:0},uLandscape:{value:null},uHasLandscape:{value:0},uLandscapeRotation:{value:-.88},uSolar:{value:this.solar.clone()}},vertexShader:SKY_VERTEX,
      fragmentShader:SKY_FRAGMENT,side:T.BackSide,depthWrite:false,fog:false});
    const sky=new T.Mesh(new T.SphereGeometry(174,64,36),this.skyMaterial);
    sky.name='v09-after-rain-cloud-sky';sky.renderOrder=-200;this.group.add(sky);
    scene.background=new T.Color('#d5e4de');

    // The photographed vista already has natural atmospheric depth. The rain-
    // side colour veil lives on the spherical panorama itself, not rectangular
    // haze planes that can reveal their edges during camera orbit.

    this.hemisphere=new T.HemisphereLight('#bfd8ee','#7c7567',.60);
    this.hemisphere.name='v09-soft-overcast-sky';
    this.key=new T.DirectionalLight('#ffedcb',2.70);this.key.position.set(0,13.3,66.6);
    this.key.name='v09-real-sun-behind-observer';this.key.target.position.set(0,0,4);
    this.key.castShadow=true;this.key.shadow.mapSize.set(2048,2048);
    Object.assign(this.key.shadow.camera,{left:-18,right:18,top:20,bottom:-18,near:.2,far:135});
    this.key.shadow.bias=-.000045;this.key.shadow.normalBias=.006;this.key.shadow.radius=2.5;
    this.fill=new T.DirectionalLight('#c0d4e7',.22);this.fill.position.set(17,8,-19);
    this.fill.name='v09-valley-bounce';
    this.studioKey=new T.DirectionalLight('#edf7ff',0);this.studioKey.position.set(-5.5,10,8);this.studioKey.target.position.set(0,4,0);
    this.studioFill=new T.DirectionalLight('#91b7cc',0);this.studioFill.position.set(7,6,-6);this.studioFill.target.position.set(0,4,0);
    this.group.add(this.hemisphere,this.key,this.key.target,this.fill,this.studioKey,this.studioKey.target,this.studioFill,this.studioFill.target);this.setSolarDirection(this.solar);

    // Fine distant residual rain, deterministic frame seeking; never foreground rods.
    const n=120;this.rainSeed=new Float32Array(n*4);
    for(let i=0;i<n;i++){this.rainSeed[i*4]=hash(i,213)*50-25;this.rainSeed[i*4+1]=hash(i,513)*23;
      this.rainSeed[i*4+2]=-14-hash(i,311)*20;this.rainSeed[i*4+3]=.040+hash(i,754)*.052;}
    const geometry=new T.BufferGeometry();this.rainPosition=new T.BufferAttribute(new Float32Array(n*6),3);
    geometry.setAttribute('position',this.rainPosition);
    this.rain=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#d1e7e1',transparent:true,opacity:.065,depthWrite:false}));
    this.rain.frustumCulled=false;this.rain.name='v09-distant-residual-rain';this.group.add(this.rain);

    const reflectionScene=new T.Scene();reflectionScene.background=new T.Color('#c7d9d1');
    const envSky=new T.Mesh(new T.SphereGeometry(100,32,20),this.skyMaterial.clone());reflectionScene.add(envSky);
    const ground=new T.Mesh(new T.PlaneGeometry(250,250),new T.MeshBasicMaterial({color:'#405b50',side:T.DoubleSide}));
    ground.rotation.x=-Math.PI/2;ground.position.y=-2;reflectionScene.add(ground);
    const generator=new T.PMREMGenerator(renderer);this.environment=generator.fromScene(reflectionScene,.035,.1,170);generator.dispose();
    envSky.geometry.dispose();envSky.material.dispose();ground.geometry.dispose();ground.material.dispose();
    scene.environment=this.environment.texture;this.update(0,0);
  }

  /** Call before continueRender: GLB geometry and embedded PBR maps are real assets. */
  attachAsset(root:T.Object3D){
    if(this.assetGroup.children.length)throw new Error('V09 environment GLB already attached');
    const seen=new Set<T.Material>();
    // The winding creek uses its actual authored bed/bank and the same HDR sky.
    // Waves are absolute-frame analytical ripples, so reverse seeks are exact.
    root.traverse(o=>{const mesh=o as T.Mesh;if(!mesh.isMesh||!/v15_winding_shallow_creek/.test(mesh.name))return;
      const original=(Array.isArray(mesh.material)?mesh.material[0]:mesh.material) as T.MeshStandardMaterial;
      const pebble=original.map!;if(!pebble)throw new Error('V15 shallow creek is missing its embedded pebble photo');pebble.wrapS=pebble.wrapT=T.RepeatWrapping;pebble.colorSpace=T.SRGBColorSpace;pebble.anisotropy=8;
      this.creekMaterial=new T.ShaderMaterial({vertexShader:CREEK_VERTEX,fragmentShader:CREEK_FRAGMENT,transparent:true,depthWrite:true,fog:true,side:T.DoubleSide,uniforms:{...T.UniformsUtils.clone(T.UniformsLib.fog),uFrame:{value:0},uOpacity:{value:1},uPebble:{value:pebble},uLandscape:this.skyMaterial.uniforms.uLandscape,uHasLandscape:this.skyMaterial.uniforms.uHasLandscape,uLandscapeRotation:this.skyMaterial.uniforms.uLandscapeRotation}});
      this.creekMaterial.name='v15_frame_driven_shallow_creek_fresnel';mesh.material=this.creekMaterial;
    });
    root.traverse(o=>{
      const mesh=o as T.Mesh;
      if(!mesh.isMesh)return;
      mesh.castShadow=!/^valley_layer/.test(mesh.name);mesh.receiveShadow=true;
      const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      mats.forEach(material=>{
        if(seen.has(material))return;seen.add(material);
        const p=material as T.MeshStandardMaterial;
        if(p.isMeshStandardMaterial){
          if(/v13_sandstone/.test(material.name)){
            p.color.set('#fff8ec');p.normalScale.setScalar(.13);p.roughness=.46;p.envMapIntensity=.48;
          }else if(/v13_pale_edge/.test(material.name)){p.color.set('#d8dad0');p.roughness=.53;p.envMapIntensity=.34;
          }else if(/v13_rain_washed/.test(material.name)){p.roughness=.50;p.envMapIntensity=.34;
          }else if(/wet_slate|v09_slate/.test(material.name)){
            p.normalScale.setScalar(.19);p.roughness=.59;p.roughnessMap=null;p.envMapIntensity=.40;
            p.color.set('#d2d7d3');
          }else if(/limestone|v09_edge/.test(material.name)){p.color.set(/pale|edge/.test(material.name)?'#c7c4b4':'#b4b5a8');p.envMapIntensity=.32;p.roughness=.61;p.normalScale.setScalar(.19);}
          else if(/grass_ground/.test(material.name)){p.color.set('#c5d0b5');p.roughness=.93;p.envMapIntensity=.25;p.normalScale.setScalar(.28);}
          else if(/fern|grass_medium|shrub|tree_small_02_leaves|flower_heliophila/.test(material.name)){p.color.multiplyScalar(.93);p.roughness=.86;p.envMapIntensity=.21;p.side=T.DoubleSide;p.alphaTest=.48;p.transparent=false;p.depthWrite=true;p.emissive.set('#192411');p.emissiveIntensity=.035;}
          else if(/v15_damp_slate/.test(material.name)){p.color.set('#bdc9c2');p.normalScale.setScalar(.30);p.roughness=.57;p.envMapIntensity=.42;}
          else if(/v15_photographed_meadow/.test(material.name)){p.roughness=.96;p.envMapIntensity=.19;}
          else if(/v15_living_meadow/.test(material.name)){p.side=T.DoubleSide;p.roughness=.92;p.envMapIntensity=.13;}
          else if(/bronze|drain/.test(material.name)){p.roughness=.44;p.envMapIntensity=.52;}
          else if(/mountain|pine|bank/.test(material.name))p.envMapIntensity=.18;
          // Environment assets share a deliberately restrained reflection response.
          [p.map,p.normalMap,p.roughnessMap,p.metalnessMap].forEach(t=>{if(t)t.anisotropy=8;});
        }
        this.materials.push({material,baseOpacity:material.opacity,baseTransparent:material.transparent,baseDepthWrite:material.depthWrite});
      });
    });
    // Bake only static, single-material meshes into material batches. Every
    // source world transform is preserved; the editable GLB remains unchanged.
    // This removes hundreds of repeated paver/shadow draw calls in long renders.
    root.updateMatrixWorld(true);
    // Source trees/shrubs share their original meshes. Hardware instancing
    // keeps every leaf and world transform without cloning millions of
    // triangles into a CPU merged mesh on every long-film render worker.
    const repeat=new Map<string,{geometry:T.BufferGeometry;material:T.Material;objects:T.Mesh[]}>();
    root.traverse(o=>{const m=o as T.Mesh;if(!m.isMesh||Array.isArray(m.material)||(m as T.SkinnedMesh).isSkinnedMesh||Object.keys(m.geometry.morphAttributes).length)return;
      const key=m.geometry.uuid+'|'+m.material.uuid;const g=repeat.get(key)??{geometry:m.geometry,material:m.material,objects:[]};g.objects.push(m);repeat.set(key,g);
    });
    let instancedCount=0;for(const {geometry,material,objects} of repeat.values()){
      if(objects.length<4)continue;const instanced=new T.InstancedMesh(geometry,material,objects.length);instanced.name='v15-instanced-original-'+material.name;
      objects.forEach((m,i)=>instanced.setMatrixAt(i,m.matrixWorld));instanced.castShadow=objects.some(m=>m.castShadow);instanced.receiveShadow=true;instanced.instanceMatrix.needsUpdate=true;instanced.computeBoundingSphere();root.add(instanced);objects.forEach(m=>m.removeFromParent());instancedCount+=objects.length;
    }
    const groups=new Map<string,{material:T.Material;objects:T.Mesh[]}>();
    root.traverse(o=>{const m=o as T.Mesh;if(!m.isMesh||(m as T.InstancedMesh).isInstancedMesh||Array.isArray(m.material)||(m as T.SkinnedMesh).isSkinnedMesh||Object.keys(m.geometry.morphAttributes).length)return;
      const schema=Object.entries(m.geometry.attributes).map(([k,a])=>`${k}:${a.itemSize}:${a.normalized}`).sort().join('|');
      const key=m.material.uuid+'|'+schema+'|'+Boolean(m.geometry.index);
      const g=groups.get(key)??{material:m.material,objects:[]};g.objects.push(m);groups.set(key,g);
    });
    let mergedCount=0,retiredCount=0;const retired=new Set<T.BufferGeometry>();
    for(const {material,objects} of groups.values()){
      if(objects.length<4)continue;
      const baked=objects.map(m=>m.geometry.clone().applyMatrix4(m.matrixWorld));
      const geometry=mergeGeometries(baked,false);baked.forEach(g=>g.dispose());
      if(!geometry)continue;
      geometry.computeBoundingSphere();geometry.computeBoundingBox();
      const merged=new T.Mesh(geometry,material);merged.name='v13-static-batch-'+material.name;
      merged.castShadow=objects.some(o=>o.castShadow);merged.receiveShadow=true;
      root.add(merged);objects.forEach(m=>{retired.add(m.geometry);m.removeFromParent();});
      mergedCount++;retiredCount+=objects.length;
    }
    // Dispose unreferenced imported buffers; shared buffers that remain on an
    // unbatched object must stay alive until the world is disposed.
    const live=new Set<T.BufferGeometry>();root.traverse(o=>{const m=o as T.Mesh;if(m.isMesh)live.add(m.geometry);});
    retired.forEach(g=>{if(!live.has(g))g.dispose();});
    root.userData.v13StaticBatching={mergedCount,retiredCount,instancedOriginalObjects:instancedCount,preservesSourceTransforms:true};
    this.assetGroup.add(root);this.update(this.lastFrame,this.lastMicro);
  }

  /** Original HDR texture, not PMREM: this keeps the actual photographed vista. */
  attachLandscape(texture:T.Texture,rotation=-.88){
    texture.wrapS=T.RepeatWrapping;texture.needsUpdate=true;
    this.skyMaterial.uniforms.uLandscape.value=texture;
    this.skyMaterial.uniforms.uHasLandscape.value=1;
    this.skyMaterial.uniforms.uLandscapeRotation.value=rotation;
  }

  update(frame:number,micro=0){
    if(this.disposed)return;
    this.lastFrame=Number.isFinite(frame)?Math.max(0,frame):0;this.lastMicro=Number.isFinite(micro)?clamp(micro):0;
    const m=ease(this.lastMicro),time=this.lastFrame/30,outdoor=(1-m)*(1-m);
    this.key.intensity=2.18*outdoor;this.hemisphere.intensity=.70*outdoor+.08*m;this.fill.intensity=.28*outdoor;
    this.studioKey.intensity=1.85*m;this.studioFill.intensity=.36*m;this.scene.environmentIntensity=.52*outdoor+.34*m;
    this.fog.density=.0085*outdoor;this.scene.fog=m>.9999?null:this.fog;
    this.skyMaterial.uniforms.uMicro.value=m;
    if(this.creekMaterial){this.creekMaterial.uniforms.uFrame.value=this.lastFrame;this.creekMaterial.uniforms.uOpacity.value=1-m;}
    this.assetGroup.visible=m<.999;
    this.materials.forEach(({material,baseOpacity,baseTransparent,baseDepthWrite})=>{
      material.opacity=baseOpacity*(1-m);
      // Keep the same rendering queue and solid-surface depth throughout a
      // micro/world handoff. Turning depthWrite off for the merged pavers made
      // hidden faces leak through, then snap back at m=.001 like a geometry LOD.
      const transparent=true;
      if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
      material.depthWrite=baseDepthWrite;
    });
    this.rain.material.opacity=.060*(1-m);this.rain.visible=m<.999;
    for(let i=0;i<this.rainSeed.length/4;i++){
      const k=i*4,x=this.rainSeed[k],phase=this.rainSeed[k+1],z=this.rainSeed[k+2],length=this.rainSeed[k+3];
      const y=23-((phase+time*1.87)%23),wind=.013*Math.sin(time*.15+phase);
      this.rainPosition.setXYZ(i*2,x+wind,y,z);this.rainPosition.setXYZ(i*2+1,x+wind+.01,y-length,z-.009);
    }
    this.rainPosition.needsUpdate=true;
    this.group.updateMatrixWorld(true);
  }

  /** Mesh/splat handoff is in the same world. Caller sets this after update(). */
  setSurfaceVisibility(visibility:number){
    const level=clamp(visibility),m=ease(this.lastMicro);
    this.assetGroup.visible=level>.002&&m<.999;
    if(this.creekMaterial)this.creekMaterial.uniforms.uOpacity.value=(1-m)*level;
    for(const {material,baseOpacity,baseDepthWrite} of this.materials){
      material.opacity=baseOpacity*(1-m)*level;
      // Keep solid depth during the entire reveal. A .995 threshold exposed
      // buried pool walls until one frame before the mesh reached full opacity.
      material.depthWrite=baseDepthWrite;
    }
  }

  setReflectionEnvironment(texture:T.Texture){if(!this.disposed)this.scene.environment=texture;}
  /** World ground -> sun direction, exactly -axisDir; updates real shadows. */
  setSolarDirection(direction:T.Vector3){
    if(this.disposed)return;
    if(![direction.x,direction.y,direction.z].every(Number.isFinite)||direction.lengthSq()<1e-10)throw new Error('Finite non-zero solar direction required');
    this.solar.copy(direction).normalize();this.key.target.position.set(0,0,4);this.key.position.copy(this.key.target.position).addScaledVector(this.solar,64);
    this.skyMaterial.uniforms.uSolar.value.copy(this.solar);this.key.shadow.needsUpdate=true;
  }
  dispose(){
    if(this.disposed)return;this.disposed=true;this.key.shadow.dispose();
    this.group.removeFromParent();
    const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
    this.group.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);
      if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>materials.add(m));});
    materials.forEach(m=>{const p=m as T.MeshStandardMaterial;[p.map,p.normalMap,p.roughnessMap,p.metalnessMap,p.aoMap].forEach(t=>{if(t)textures.add(t);});});
    if(this.creekMaterial)textures.add(this.creekMaterial.uniforms.uPebble.value);
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    if(this.scene.environment===this.environment.texture)this.scene.environment=null;
    this.environment.dispose();this.scene.background=this.previousBackground;this.scene.fog=this.previousFog;this.scene.environment=this.previousEnvironment;this.scene.environmentIntensity=this.previousEnvironmentIntensity;
  }
}
