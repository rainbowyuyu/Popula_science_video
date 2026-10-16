import * as T from 'three';

/** V08: grounded, three-dimensional rain-after terrace.
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
uniform float uHasLandscape;uniform float uLandscapeRotation;
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
 vec3 sunDirection=normalize(vec3(-.34,.61,.72));
 float glow=pow(max(0.,dot(d,sunDirection)),18.);
 colour+=vec3(.105,.077,.034)*glow;
 if(uHasLandscape>.5){
   vec2 uv=vec2(atan(d.z,d.x)/6.283185307+.5+uLandscapeRotation/6.283185307,
     asin(clamp(d.y,-1.,1.))/3.141592654+.5);
   uv.x=fract(uv.x);
   vec3 photographed=texture2D(uLandscape,uv).rgb;
   // A gentle cooler rain-side veil on the photographed panorama. It carries
   // the weather story without inventing terrain meshes or measurement data.
   float rainSide=pow(max(0.,-d.z),2.)*smoothstep(-.05,.16,altitude);
   photographed=mix(photographed,vec3(.185,.26,.29),rainSide*.22);
   colour=photographed;
 }
 // Quiet micro studio replaces the entire outdoor set through the same sky dome.
 vec3 studio=mix(vec3(.013,.042,.058),vec3(.039,.091,.118),smoothstep(-.25,.72,altitude));
 studio+=vec3(.015,.024,.026)*pow(max(0.,dot(d,normalize(vec3(-.6,.3,.7)))),8.);
 colour=mix(colour,studio,uMicro);
 gl_FragColor=vec4(colour,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`;

type RegisteredMaterial={material:T.Material;baseOpacity:number;baseTransparent:boolean;baseDepthWrite:boolean};

export class EnvironmentV08 {
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

  constructor(renderer:T.WebGLRenderer,scene:T.Scene){
    this.scene=scene;this.previousBackground=scene.background;
    this.group.name='v08-grounded-rain-after-valley';scene.add(this.group);
    this.assetGroup.name='v08-authored-blender-environment';this.group.add(this.assetGroup);
    this.skyMaterial=new T.ShaderMaterial({uniforms:{uMicro:{value:0},uLandscape:{value:null},uHasLandscape:{value:0},uLandscapeRotation:{value:-.88}},vertexShader:SKY_VERTEX,
      fragmentShader:SKY_FRAGMENT,side:T.BackSide,depthWrite:false,fog:false});
    const sky=new T.Mesh(new T.SphereGeometry(174,64,36),this.skyMaterial);
    sky.name='v08-after-rain-cloud-sky';sky.renderOrder=-200;this.group.add(sky);
    scene.background=new T.Color('#d5e4de');

    // The photographed vista already has natural atmospheric depth. The rain-
    // side colour veil lives on the spherical panorama itself, not rectangular
    // haze planes that can reveal their edges during camera orbit.

    this.hemisphere=new T.HemisphereLight('#e7f1ed','#7a8a73',.85);
    this.hemisphere.name='v08-soft-overcast-sky';
    this.key=new T.DirectionalLight('#fff0d5',2.10);this.key.position.set(-14,24,20);
    this.key.name='v08-real-sun-behind-observer';this.key.target.position.set(0,0,-5);
    this.key.castShadow=true;this.key.shadow.mapSize.set(2048,2048);
    Object.assign(this.key.shadow.camera,{left:-25,right:25,top:24,bottom:-22,near:.2,far:100});
    this.key.shadow.bias=-.00010;this.key.shadow.normalBias=.018;this.key.shadow.radius=3;
    this.fill=new T.DirectionalLight('#bfd4dc',.28);this.fill.position.set(17,8,-19);
    this.fill.name='v08-valley-bounce';
    this.group.add(this.hemisphere,this.key,this.key.target,this.fill);

    // Fine distant residual rain, deterministic frame seeking; never foreground rods.
    const n=160;this.rainSeed=new Float32Array(n*4);
    for(let i=0;i<n;i++){this.rainSeed[i*4]=hash(i,213)*50-25;this.rainSeed[i*4+1]=hash(i,513)*23;
      this.rainSeed[i*4+2]=-14-hash(i,311)*20;this.rainSeed[i*4+3]=.055+hash(i,754)*.075;}
    const geometry=new T.BufferGeometry();this.rainPosition=new T.BufferAttribute(new Float32Array(n*6),3);
    geometry.setAttribute('position',this.rainPosition);
    this.rain=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#d1e7e1',transparent:true,opacity:.12,depthWrite:false}));
    this.rain.name='v08-distant-residual-rain';this.group.add(this.rain);

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
    if(this.assetGroup.children.length)throw new Error('V08 environment GLB already attached');
    const seen=new Set<T.Material>();
    root.traverse(o=>{
      const mesh=o as T.Mesh;
      if(!mesh.isMesh)return;
      mesh.castShadow=!/^valley_layer/.test(mesh.name);mesh.receiveShadow=true;
      const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
      mats.forEach(material=>{
        if(seen.has(material))return;seen.add(material);
        const p=material as T.MeshStandardMaterial;
        if(p.isMeshStandardMaterial){
          if(material.name==='wet_slate_pbr'){
            p.normalScale.setScalar(.38);p.roughness=.60;p.envMapIntensity=.19;
            p.color.set('#cad6d0');
          }else if(/limestone/.test(material.name)){p.envMapIntensity=.24;p.roughness=.63;}
          else if(/mountain|pine|bank/.test(material.name))p.envMapIntensity=.18;
          // Environment assets share a deliberately restrained reflection response.
          [p.map,p.normalMap,p.roughnessMap,p.metalnessMap].forEach(t=>{if(t)t.anisotropy=8;});
        }
        this.materials.push({material,baseOpacity:material.opacity,baseTransparent:material.transparent,baseDepthWrite:material.depthWrite});
      });
    });
    this.assetGroup.add(root);this.update(0,this.lastMicro);
  }

  /** Original HDR texture, not PMREM: this keeps the actual photographed vista. */
  attachLandscape(texture:T.Texture,rotation=-.88){
    texture.wrapS=T.RepeatWrapping;texture.needsUpdate=true;
    this.skyMaterial.uniforms.uLandscape.value=texture;
    this.skyMaterial.uniforms.uHasLandscape.value=1;
    this.skyMaterial.uniforms.uLandscapeRotation.value=rotation;
  }

  update(frame:number,micro:number){
    const m=ease(micro),time=Math.max(0,frame)/30;this.lastMicro=m;
    this.skyMaterial.uniforms.uMicro.value=m;
    this.assetGroup.visible=m<.999;
    this.materials.forEach(({material,baseOpacity,baseTransparent,baseDepthWrite})=>{
      material.opacity=baseOpacity*(1-m);
      const transparent=baseTransparent||m>.001;
      if(material.transparent!==transparent){material.transparent=transparent;material.needsUpdate=true;}
      material.depthWrite=baseDepthWrite&&!transparent;
    });
    this.rain.material.opacity=.10*(1-m);this.rain.visible=m<.999;
    for(let i=0;i<this.rainSeed.length/4;i++){
      const k=i*4,x=this.rainSeed[k],phase=this.rainSeed[k+1],z=this.rainSeed[k+2],length=this.rainSeed[k+3];
      const y=23-((phase+time*1.87)%23),wind=.013*Math.sin(time*.15+phase);
      this.rainPosition.setXYZ(i*2,x+wind,y,z);this.rainPosition.setXYZ(i*2+1,x+wind+.01,y-length,z-.009);
    }
    this.rainPosition.needsUpdate=true;
    this.group.updateMatrixWorld(true);
  }

  setReflectionEnvironment(texture:T.Texture){this.scene.environment=texture;}
  dispose(){
    this.group.removeFromParent();
    const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>(),textures=new Set<T.Texture>();
    this.group.traverse(o=>{const mesh=o as T.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);
      if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(m=>materials.add(m));});
    materials.forEach(m=>{const p=m as T.MeshStandardMaterial;[p.map,p.normalMap,p.roughnessMap,p.metalnessMap,p.aoMap].forEach(t=>{if(t)textures.add(t);});});
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
    if(this.scene.environment===this.environment.texture)this.scene.environment=null;
    this.environment.dispose();this.scene.background=this.previousBackground;
  }
}
