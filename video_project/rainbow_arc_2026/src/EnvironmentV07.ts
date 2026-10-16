import * as T from 'three';

/**
 * A quiet, authored rain-after landscape around the original optical world.
 * Metres, Y up. It creates no observer, optical rays, rainbow or camera.
 * Frame-driven illustration: the wet ground uses an environment reflection
 * approximation, not a measured surface or a screen-space reflection solver.
 */
const clamp = (n: number) => Math.max(0, Math.min(1, n));
const smooth = (n: number) => { const x = clamp(n); return x * x * (3 - 2 * x); };
const hash = (i: number, salt = 0) => {
  let n = Math.imul(i + 1, 0x9e3779b1) ^ salt;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const ridge = (x: number, layer: number) =>
  3.6 + layer * .68 + Math.sin(x * .060 + layer * .93) * 2.5 +
  Math.sin(x * .115 + layer * 2.3) * 1.4 + Math.sin(x * .248 + layer) * .37;

const SKY_VERTEX = /* glsl */`
varying vec3 vSkyWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vSkyWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;
const SKY_FRAGMENT = /* glsl */`
varying vec3 vSkyWorld;
uniform float uMicro;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uLower;
float cloud(vec2 p) {
  return sin(p.x*.19+p.y*.23)*.42 + sin(p.x*.063-p.y*.17)*.24
       + sin(p.x*.36+p.y*.27)*.09;
}
void main() {
  vec3 d = normalize(vSkyWorld-cameraPosition);
  float elevation = clamp(d.y, -1.0, 1.0);
  float up = smoothstep(-.04, .68, elevation);
  vec3 c = mix(uHorizon, uZenith, up);
  c = mix(c, uLower, 1.-smoothstep(-.34, .03, elevation));
  float veil = smoothstep(.06, .37, elevation)*(1.-smoothstep(.42,.90,elevation));
  float broadCloud = smoothstep(.08,.57,cloud(d.xz/max(.09,d.y)*12.));
  c = mix(c, uHorizon*1.028, broadCloud*veil*.17);
  // Sun remains behind the viewer in the main rainbow views (+Z).
  float light = pow(max(0.,dot(d,normalize(vec3(-.25,.57,.78)))),12.);
  c += vec3(.066,.053,.030)*light;
  vec3 opticalStudio=mix(vec3(.018,.060,.085),vec3(.040,.110,.162),smoothstep(-.35,.75,elevation));
  c = mix(c,opticalStudio,uMicro);
  gl_FragColor = vec4(c,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const GROUND_NOISE = /* glsl */`
float terraceHash(vec2 p) {
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
}
float terraceNoise(vec2 p) {
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(terraceHash(i),terraceHash(i+vec2(1.,0.)),f.x),
             mix(terraceHash(i+vec2(0.,1.)),terraceHash(i+vec2(1.)),f.x),f.y);
}
`;

type GroundShader = { uniforms: Record<string, T.IUniform>; vertexShader: string; fragmentShader: string };

function mountainGeometry(layer: number) {
  const positions: number[] = [], colours: number[] = [], indices: number[] = [];
  const cTop = new T.Color(['#bdcec5', '#cbdcd2', '#dbe6d8', '#e9eedf'][layer]);
  const cBase = new T.Color('#eef2e5');
  const segments = 600, z = -55 - layer * 18;
  for (let j = 0; j <= segments; j++) {
    const x = -155 + j / segments * 310;
    const y = ridge(x, layer) + (layer === 3 ? 3.5 : 0);
    positions.push(x, -2, z, x, y, z - 2.0 * Math.sin(x * .022 + layer));
    colours.push(...cBase.toArray(), ...cTop.toArray());
    if (j < segments) { const n = j * 2; indices.push(n,n+1,n+3,n,n+3,n+2); }
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(positions,3));
  g.setAttribute('color', new T.Float32BufferAttribute(colours,3));
  g.setIndex(indices);g.computeVertexNormals();return g;
}

function treeLineGeometry(layer:number) {
  const positions:number[]=[],colours:number[]=[],indices:number[]=[];
  const top=new T.Color(layer?'#d4e1d5':'#c8d9cd'),base=new T.Color('#e7eddd');
  const segments=850,z=-44-layer*9;
  const trees=Array.from({length:110},(_,i)=>({x:-135+i*2.45+hash(i,54)*1.2,w:.8+hash(i,99)*.7,h:1.5+hash(i,21)*2.1}));
  for(let i=0;i<=segments;i++) {
    const x=-138+i/segments*276;
    let y=.52;
    for(const tree of trees) {
      const dx=Math.abs(x-tree.x)/tree.w;
      if(dx<1)y=Math.max(y,.52+tree.h*(1-Math.pow(dx,.70)));
    }
    // A quiet central opening keeps the rainbow's geometry easy to follow.
    const quiet=smooth((Math.abs(x)-8)/15);y=.52+(y-.52)*quiet;
    positions.push(x,-.3,z,x,y,z);
    colours.push(...base.toArray(),...top.toArray());
    if(i<segments){const n=i*2;indices.push(n,n+1,n+3,n,n+3,n+2);}
  }
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('color',new T.Float32BufferAttribute(colours,3));g.setIndex(indices);return g;
}

export class EnvironmentV07 {
  readonly group = new T.Group();
  readonly environment: T.WebGLRenderTarget;
  private readonly scene: T.Scene;
  private readonly skyMaterial: T.ShaderMaterial;
  private readonly vegetation = new T.Group();
  private readonly mountains = new T.Group();
  private readonly rain: T.LineSegments;
  private readonly rainPositions: T.BufferAttribute;
  private readonly rainSeeds: Float32Array;
  private readonly veilMaterials: T.ShaderMaterial[] = [];
  private readonly ground: T.Mesh<T.PlaneGeometry,T.MeshStandardMaterial>;
  private groundShader?: GroundShader;
  private readonly groundUniforms = { uTerraceTime:{value:0},uTerraceMicro:{value:0} };
  private readonly foliageMaterials: T.MeshBasicMaterial[] = [];
  private readonly mountainMaterials: T.MeshBasicMaterial[] = [];
  private readonly previousBackground: T.Scene['background'];

  constructor(renderer: T.WebGLRenderer, scene: T.Scene) {
    this.scene=scene;this.previousBackground=scene.background;
    this.group.name='rain-after-editorial-environment-v07';scene.add(this.group);
    this.skyMaterial=new T.ShaderMaterial({
      uniforms:{uMicro:{value:0},uZenith:{value:new T.Color('#c9e1e2')},
        uHorizon:{value:new T.Color('#f4f4e8')},uLower:{value:new T.Color('#f5f1e4')}},
      vertexShader:SKY_VERTEX,fragmentShader:SKY_FRAGMENT,side:T.BackSide,
      depthWrite:false,depthTest:true,fog:false,
    });
    const sky=new T.Mesh(new T.SphereGeometry(160,40,24),this.skyMaterial);
    sky.name='soft-teal-cream-gradient-sky';sky.renderOrder=-100;this.group.add(sky);
    scene.background=new T.Color('#f4f4e8');
    this.group.add(this.mountains,this.vegetation);

    for(let i=3;i>=0;i--) {
      const material=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.54,fog:false,depthWrite:false});
      const m=new T.Mesh(mountainGeometry(i),material);m.name=`atmospheric-ridge-${i}`;m.renderOrder=-40-i;
      this.mountains.add(m);this.mountainMaterials.push(material);
    }

    const groundMaterial=new T.MeshStandardMaterial({color:'#e5e8d8',roughness:.65,metalness:.01,envMapIntensity:.14,transparent:false});
    groundMaterial.onBeforeCompile=(shader: GroundShader)=>{
      Object.assign(shader.uniforms,this.groundUniforms);
      shader.vertexShader='varying vec3 vTerraceWorld;\n'+shader.vertexShader.replace('#include <project_vertex>',
        'vTerraceWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\n#include <project_vertex>');
      shader.fragmentShader='varying vec3 vTerraceWorld;\nuniform float uTerraceTime;\nuniform float uTerraceMicro;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\n'+GROUND_NOISE);
      shader.fragmentShader=shader.fragmentShader.replace('#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif(length(vTerraceWorld.xz-vec2(-3.,3.))<1.49)discard;');
      shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>', /* glsl */`
        #include <color_fragment>
        vec2 p=vTerraceWorld.xz;
        float groundMacro=terraceNoise(p*.21);
        float stoneGrain=terraceNoise(p*38.)*.57+terraceNoise(p*103.)*.43;
        float terrace=1.-smoothstep(14.,22.,length(vec2(p.x,p.y*.76)));
        float row=floor(p.y/1.60);
        vec2 tile=vec2(p.x/1.15+mod(row,2.)*.5,p.y/1.60);
        vec2 edge=min(fract(tile),1.-fract(tile));
        float grout=(1.-smoothstep(.0018,.0045,min(edge.x,edge.y)))*terrace;
        float stoneVariation=terraceHash(floor(tile));
        vec3 stone=vec3(.66,.67,.595)+(stoneVariation-.5)*.008+(groundMacro-.5)*.018;
        vec3 dampEarth=mix(vec3(.61,.66,.56),vec3(.69,.71,.60),groundMacro*.34);
        vec3 surface=mix(dampEarth,stone,terrace);
        surface+=(stoneGrain-.5)*.009;
        surface*=1.-grout*.035;
        float pooling=smoothstep(.51,.69,terraceNoise(p*.43+vec2(3.,6.)))*terrace;
        float distanceHaze=smoothstep(13.,70.,length(p));
        surface=mix(surface,vec3(.81,.84,.75),distanceHaze*.52);
        surface=mix(surface,vec3(.90,.91,.82),uTerraceMicro);
        diffuseColor.rgb=surface;
      `);
      shader.fragmentShader=shader.fragmentShader.replace('#include <roughnessmap_fragment>', /* glsl */`
        #include <roughnessmap_fragment>
        roughnessFactor=mix(.73,.63,pooling);
        roughnessFactor=mix(roughnessFactor,.61,uTerraceMicro);
      `);
      this.groundShader=shader;
    };
    groundMaterial.customProgramCacheKey=()=> 'rain-after-terrace-v07-20261011';
    this.ground=new T.Mesh(new T.PlaneGeometry(260,260),groundMaterial);
    this.ground.name='wet-stone-terrace-with-fountain-hole';this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.045;
    this.ground.receiveShadow=true;this.group.add(this.ground);

    // Only distant treeline silhouettes: no foreground grass or sphere crowns.
    for(let i=1;i>=0;i--) {
      const material=new T.MeshBasicMaterial({vertexColors:true,side:T.DoubleSide,transparent:true,opacity:.48,depthWrite:false,fog:false});
      const trees=new T.Mesh(treeLineGeometry(i),material);trees.name=`quiet-distant-tree-line-${i}`;trees.renderOrder=-32-i;
      this.foliageMaterials.push(material);this.vegetation.add(trees);
    }

    // Low haze strata sit behind the rainbow, never across the main waterdrop.
    for(let i=0;i<3;i++) {
      const material=new T.ShaderMaterial({
        transparent:true,depthWrite:false,side:T.DoubleSide,fog:false,
        uniforms:{uAlpha:{value:.16},uTime:{value:0},uPhase:{value:i*.73},uColour:{value:new T.Color('#dce6df')}},
        vertexShader:'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader:/* glsl */`varying vec2 vUv;uniform float uAlpha;uniform float uTime;uniform float uPhase;uniform vec3 uColour;
          void main(){float edge=sin(vUv.y*3.14159265);float broad=.77+.23*sin(vUv.x*14.+uTime*.03+uPhase);float a=pow(max(0.,edge),2.)*broad*uAlpha;gl_FragColor=vec4(uColour,a);#include <tonemapping_fragment>
          #include <colorspace_fragment>}`.replace(';#include',';\n#include'),
      });
      const veil=new T.Mesh(new T.PlaneGeometry(190,5.3),material);veil.position.set(0,2.3+i*.65,-35-i*15);veil.name=`thin-ground-haze-${i}`;veil.renderOrder=1+i;
      this.group.add(veil);this.veilMaterials.push(material);
    }

    const count=230,positions=new Float32Array(count*6);this.rainSeeds=new Float32Array(count*4);
    for(let i=0;i<count;i++) {
      this.rainSeeds[i*4]=hash(i,139)*48-24;
      this.rainSeeds[i*4+1]=hash(i,591)*21;
      this.rainSeeds[i*4+2]=-13-hash(i,276)*23;
      this.rainSeeds[i*4+3]=.13+hash(i,652)*.17;
    }
    const rainGeometry=new T.BufferGeometry();this.rainPositions=new T.BufferAttribute(positions,3);rainGeometry.setAttribute('position',this.rainPositions);
    const rainMaterial=new T.LineBasicMaterial({color:'#c4ddd8',transparent:true,opacity:.14,depthWrite:false});
    this.rain=new T.LineSegments(rainGeometry,rainMaterial);this.rain.name='fine-distant-rain-strata';this.group.add(this.rain);

    const hemi=new T.HemisphereLight('#f1f4e7','#9eae9d',1.38);hemi.name='v07-soft-open-sky';
    const key=new T.DirectionalLight('#fff0d3',2.45);key.position.set(-14,24,20);key.name='v07-after-rain-sun-behind-viewer';
    key.castShadow=true;key.shadow.mapSize.set(1536,1536);
    key.shadow.camera.left=-22;key.shadow.camera.right=22;key.shadow.camera.top=23;key.shadow.camera.bottom=-20;
    key.shadow.camera.near=.1;key.shadow.camera.far=90;key.shadow.bias=-.00012;key.shadow.normalBias=.025;key.shadow.radius=3;
    key.target.position.set(0,0,-4);this.group.add(key.target);
    const fill=new T.DirectionalLight('#d2e9ef',.66);fill.position.set(15,9,-17);fill.name='v07-cool-bounce';
    this.group.add(hemi,key,fill);

    // An actual PMREM of the authored sky provides coherent outdoor reflections.
    // It is generated once, not once per frame, and is reused by glass materials.
    const reflectionScene=new T.Scene();reflectionScene.background=new T.Color('#dfe9df');
    const reflectionSky=new T.Mesh(new T.SphereGeometry(100,32,20),this.skyMaterial.clone());
    reflectionScene.add(reflectionSky);
    const reflectionGround=new T.Mesh(new T.PlaneGeometry(240,240),new T.MeshBasicMaterial({color:'#536c60',side:T.DoubleSide}));
    reflectionGround.rotation.x=-Math.PI/2;reflectionGround.position.y=-3;reflectionScene.add(reflectionGround);
    const pmrem=new T.PMREMGenerator(renderer);this.environment=pmrem.fromScene(reflectionScene,.035,.1,170);pmrem.dispose();
    reflectionSky.geometry.dispose();reflectionSky.material.dispose();reflectionGround.geometry.dispose();reflectionGround.material.dispose();
    scene.environment=this.environment.texture;
    this.update(0,0);
  }

  update(frame:number,micro:number) {
    const time=Math.max(0,frame)/30,m=smooth(micro);
    this.skyMaterial.uniforms.uMicro.value=m;
    this.groundUniforms.uTerraceTime.value=time;this.groundUniforms.uTerraceMicro.value=m;
    // Shape remains continuous; only visual contrast retreats in macro close-ups.
    this.vegetation.visible=m<.999;
    this.ground.material.opacity=1-m;const transparent=m>.002;if(this.ground.material.transparent!==transparent){this.ground.material.transparent=transparent;this.ground.material.needsUpdate=true;}this.ground.material.depthWrite=m<.02;this.ground.visible=m<.999;
    this.foliageMaterials.forEach(mat=>{mat.opacity=.48*(1-m);});
    this.mountainMaterials.forEach(mat=>{mat.opacity=.54*(1-m*.95);});
    this.veilMaterials.forEach((mat,i)=>{mat.uniforms.uAlpha.value=(.13+i*.025)*(1-m*.96);mat.uniforms.uTime.value=time;});
    const rainAlpha=.135*(1-m);
    (this.rain.material as T.LineBasicMaterial).opacity=rainAlpha;this.rain.visible=rainAlpha>.001;
    for(let i=0;i<this.rainSeeds.length/4;i++) {
      const k=i*4,x=this.rainSeeds[k],phase=this.rainSeeds[k+1],z=this.rainSeeds[k+2],length=this.rainSeeds[k+3];
      const y=21-((phase+time*2.3)%21),drift=.09*Math.sin(time*.16+phase);
      this.rainPositions.setXYZ(i*2,x+drift,y,z);
      this.rainPositions.setXYZ(i*2+1,x+drift+.019,y-length,z-.006);
    }
    this.rainPositions.needsUpdate=true;
    this.group.updateMatrixWorld(true);
  }

  /** Caller keeps ownership of an optional, independently verified HDRI texture. */
  setReflectionEnvironment(texture:T.Texture) { this.scene.environment=texture; }

  dispose() {
    this.group.removeFromParent();
    const geometries=new Set<T.BufferGeometry>(),materials=new Set<T.Material>();
    this.group.traverse(object=>{
      const mesh=object as T.Mesh;
      if(mesh.geometry)geometries.add(mesh.geometry);
      if(mesh.material)(Array.isArray(mesh.material)?mesh.material:[mesh.material]).forEach(material=>materials.add(material));
    });
    geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
    if(this.scene.environment===this.environment.texture)this.scene.environment=null;
    this.environment.dispose();this.groundShader=undefined;
    this.scene.background=this.previousBackground;
  }
}
