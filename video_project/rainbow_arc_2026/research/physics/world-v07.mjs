// src/WorldV07.ts
import * as T3 from "three";

// src/EnvironmentV07.ts
import * as T from "three";
var clamp = (n) => Math.max(0, Math.min(1, n));
var smooth = (n) => {
  const x = clamp(n);
  return x * x * (3 - 2 * x);
};
var hash = (i, salt = 0) => {
  let n = Math.imul(i + 1, 2654435761) ^ salt;
  n = Math.imul(n ^ n >>> 16, 2246822507);
  n = Math.imul(n ^ n >>> 13, 3266489909);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};
var ridge = (x, layer) => 3.6 + layer * 0.68 + Math.sin(x * 0.06 + layer * 0.93) * 2.5 + Math.sin(x * 0.115 + layer * 2.3) * 1.4 + Math.sin(x * 0.248 + layer) * 0.37;
var SKY_VERTEX = (
  /* glsl */
  `
varying vec3 vSkyWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vSkyWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}`
);
var SKY_FRAGMENT = (
  /* glsl */
  `
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
}`
);
var GROUND_NOISE = (
  /* glsl */
  `
float terraceHash(vec2 p) {
  return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);
}
float terraceNoise(vec2 p) {
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(terraceHash(i),terraceHash(i+vec2(1.,0.)),f.x),
             mix(terraceHash(i+vec2(0.,1.)),terraceHash(i+vec2(1.)),f.x),f.y);
}
`
);
function mountainGeometry(layer) {
  const positions = [], colours = [], indices = [];
  const cTop = new T.Color(["#bdcec5", "#cbdcd2", "#dbe6d8", "#e9eedf"][layer]);
  const cBase = new T.Color("#eef2e5");
  const segments = 600, z = -55 - layer * 18;
  for (let j = 0; j <= segments; j++) {
    const x = -155 + j / segments * 310;
    const y = ridge(x, layer) + (layer === 3 ? 3.5 : 0);
    positions.push(x, -2, z, x, y, z - 2 * Math.sin(x * 0.022 + layer));
    colours.push(...cBase.toArray(), ...cTop.toArray());
    if (j < segments) {
      const n = j * 2;
      indices.push(n, n + 1, n + 3, n, n + 3, n + 2);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}
function treeLineGeometry(layer) {
  const positions = [], colours = [], indices = [];
  const top = new T.Color(layer ? "#d4e1d5" : "#c8d9cd"), base = new T.Color("#e7eddd");
  const segments = 850, z = -44 - layer * 9;
  const trees = Array.from({ length: 110 }, (_, i) => ({ x: -135 + i * 2.45 + hash(i, 54) * 1.2, w: 0.8 + hash(i, 99) * 0.7, h: 1.5 + hash(i, 21) * 2.1 }));
  for (let i = 0; i <= segments; i++) {
    const x = -138 + i / segments * 276;
    let y = 0.52;
    for (const tree of trees) {
      const dx = Math.abs(x - tree.x) / tree.w;
      if (dx < 1) y = Math.max(y, 0.52 + tree.h * (1 - Math.pow(dx, 0.7)));
    }
    const quiet = smooth((Math.abs(x) - 8) / 15);
    y = 0.52 + (y - 0.52) * quiet;
    positions.push(x, -0.3, z, x, y, z);
    colours.push(...base.toArray(), ...top.toArray());
    if (i < segments) {
      const n = i * 2;
      indices.push(n, n + 1, n + 3, n, n + 3, n + 2);
    }
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("color", new T.Float32BufferAttribute(colours, 3));
  g.setIndex(indices);
  return g;
}
var EnvironmentV07 = class {
  group = new T.Group();
  environment;
  scene;
  skyMaterial;
  vegetation = new T.Group();
  mountains = new T.Group();
  rain;
  rainPositions;
  rainSeeds;
  veilMaterials = [];
  ground;
  groundShader;
  groundUniforms = { uTerraceTime: { value: 0 }, uTerraceMicro: { value: 0 } };
  foliageMaterials = [];
  mountainMaterials = [];
  previousBackground;
  constructor(renderer, scene) {
    this.scene = scene;
    this.previousBackground = scene.background;
    this.group.name = "rain-after-editorial-environment-v07";
    scene.add(this.group);
    this.skyMaterial = new T.ShaderMaterial({
      uniforms: {
        uMicro: { value: 0 },
        uZenith: { value: new T.Color("#c9e1e2") },
        uHorizon: { value: new T.Color("#f4f4e8") },
        uLower: { value: new T.Color("#f5f1e4") }
      },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: T.BackSide,
      depthWrite: false,
      depthTest: true,
      fog: false
    });
    const sky = new T.Mesh(new T.SphereGeometry(160, 40, 24), this.skyMaterial);
    sky.name = "soft-teal-cream-gradient-sky";
    sky.renderOrder = -100;
    this.group.add(sky);
    scene.background = new T.Color("#f4f4e8");
    this.group.add(this.mountains, this.vegetation);
    for (let i = 3; i >= 0; i--) {
      const material = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, transparent: true, opacity: 0.54, fog: false, depthWrite: false });
      const m = new T.Mesh(mountainGeometry(i), material);
      m.name = `atmospheric-ridge-${i}`;
      m.renderOrder = -40 - i;
      this.mountains.add(m);
      this.mountainMaterials.push(material);
    }
    const groundMaterial = new T.MeshStandardMaterial({ color: "#e5e8d8", roughness: 0.65, metalness: 0.01, envMapIntensity: 0.14, transparent: false });
    groundMaterial.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.groundUniforms);
      shader.vertexShader = "varying vec3 vTerraceWorld;\n" + shader.vertexShader.replace(
        "#include <project_vertex>",
        "vTerraceWorld=(modelMatrix*vec4(transformed,1.0)).xyz;\n#include <project_vertex>"
      );
      shader.fragmentShader = "varying vec3 vTerraceWorld;\nuniform float uTerraceTime;\nuniform float uTerraceMicro;\n" + shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace("#include <common>", "#include <common>\n" + GROUND_NOISE);
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <clipping_planes_fragment>",
        "#include <clipping_planes_fragment>\nif(length(vTerraceWorld.xz-vec2(-3.,3.))<1.49)discard;"
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <color_fragment>",
        /* glsl */
        `
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
      `
      );
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <roughnessmap_fragment>",
        /* glsl */
        `
        #include <roughnessmap_fragment>
        roughnessFactor=mix(.73,.63,pooling);
        roughnessFactor=mix(roughnessFactor,.61,uTerraceMicro);
      `
      );
      this.groundShader = shader;
    };
    groundMaterial.customProgramCacheKey = () => "rain-after-terrace-v07-20261011";
    this.ground = new T.Mesh(new T.PlaneGeometry(260, 260), groundMaterial);
    this.ground.name = "wet-stone-terrace-with-fountain-hole";
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -0.045;
    this.ground.receiveShadow = true;
    this.group.add(this.ground);
    for (let i = 1; i >= 0; i--) {
      const material = new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, transparent: true, opacity: 0.48, depthWrite: false, fog: false });
      const trees = new T.Mesh(treeLineGeometry(i), material);
      trees.name = `quiet-distant-tree-line-${i}`;
      trees.renderOrder = -32 - i;
      this.foliageMaterials.push(material);
      this.vegetation.add(trees);
    }
    for (let i = 0; i < 3; i++) {
      const material = new T.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: T.DoubleSide,
        fog: false,
        uniforms: { uAlpha: { value: 0.16 }, uTime: { value: 0 }, uPhase: { value: i * 0.73 }, uColour: { value: new T.Color("#dce6df") } },
        vertexShader: "varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader: (
          /* glsl */
          `varying vec2 vUv;uniform float uAlpha;uniform float uTime;uniform float uPhase;uniform vec3 uColour;
          void main(){float edge=sin(vUv.y*3.14159265);float broad=.77+.23*sin(vUv.x*14.+uTime*.03+uPhase);float a=pow(max(0.,edge),2.)*broad*uAlpha;gl_FragColor=vec4(uColour,a);#include <tonemapping_fragment>
          #include <colorspace_fragment>}`.replace(";#include", ";\n#include")
        )
      });
      const veil = new T.Mesh(new T.PlaneGeometry(190, 5.3), material);
      veil.position.set(0, 2.3 + i * 0.65, -35 - i * 15);
      veil.name = `thin-ground-haze-${i}`;
      veil.renderOrder = 1 + i;
      this.group.add(veil);
      this.veilMaterials.push(material);
    }
    const count = 230, positions = new Float32Array(count * 6);
    this.rainSeeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      this.rainSeeds[i * 4] = hash(i, 139) * 48 - 24;
      this.rainSeeds[i * 4 + 1] = hash(i, 591) * 21;
      this.rainSeeds[i * 4 + 2] = -13 - hash(i, 276) * 23;
      this.rainSeeds[i * 4 + 3] = 0.13 + hash(i, 652) * 0.17;
    }
    const rainGeometry = new T.BufferGeometry();
    this.rainPositions = new T.BufferAttribute(positions, 3);
    rainGeometry.setAttribute("position", this.rainPositions);
    const rainMaterial = new T.LineBasicMaterial({ color: "#c4ddd8", transparent: true, opacity: 0.14, depthWrite: false });
    this.rain = new T.LineSegments(rainGeometry, rainMaterial);
    this.rain.name = "fine-distant-rain-strata";
    this.group.add(this.rain);
    const hemi = new T.HemisphereLight("#f1f4e7", "#9eae9d", 1.38);
    hemi.name = "v07-soft-open-sky";
    const key = new T.DirectionalLight("#fff0d3", 2.45);
    key.position.set(-14, 24, 20);
    key.name = "v07-after-rain-sun-behind-viewer";
    key.castShadow = true;
    key.shadow.mapSize.set(1536, 1536);
    key.shadow.camera.left = -22;
    key.shadow.camera.right = 22;
    key.shadow.camera.top = 23;
    key.shadow.camera.bottom = -20;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 90;
    key.shadow.bias = -12e-5;
    key.shadow.normalBias = 0.025;
    key.shadow.radius = 3;
    key.target.position.set(0, 0, -4);
    this.group.add(key.target);
    const fill = new T.DirectionalLight("#d2e9ef", 0.66);
    fill.position.set(15, 9, -17);
    fill.name = "v07-cool-bounce";
    this.group.add(hemi, key, fill);
    const reflectionScene = new T.Scene();
    reflectionScene.background = new T.Color("#dfe9df");
    const reflectionSky = new T.Mesh(new T.SphereGeometry(100, 32, 20), this.skyMaterial.clone());
    reflectionScene.add(reflectionSky);
    const reflectionGround = new T.Mesh(new T.PlaneGeometry(240, 240), new T.MeshBasicMaterial({ color: "#536c60", side: T.DoubleSide }));
    reflectionGround.rotation.x = -Math.PI / 2;
    reflectionGround.position.y = -3;
    reflectionScene.add(reflectionGround);
    const pmrem = new T.PMREMGenerator(renderer);
    this.environment = pmrem.fromScene(reflectionScene, 0.035, 0.1, 170);
    pmrem.dispose();
    reflectionSky.geometry.dispose();
    reflectionSky.material.dispose();
    reflectionGround.geometry.dispose();
    reflectionGround.material.dispose();
    scene.environment = this.environment.texture;
    this.update(0, 0);
  }
  update(frame, micro) {
    const time = Math.max(0, frame) / 30, m = smooth(micro);
    this.skyMaterial.uniforms.uMicro.value = m;
    this.groundUniforms.uTerraceTime.value = time;
    this.groundUniforms.uTerraceMicro.value = m;
    this.vegetation.visible = m < 0.999;
    this.ground.material.opacity = 1 - m;
    const transparent = m > 2e-3;
    if (this.ground.material.transparent !== transparent) {
      this.ground.material.transparent = transparent;
      this.ground.material.needsUpdate = true;
    }
    this.ground.material.depthWrite = m < 0.02;
    this.ground.visible = m < 0.999;
    this.foliageMaterials.forEach((mat2) => {
      mat2.opacity = 0.48 * (1 - m);
    });
    this.mountainMaterials.forEach((mat2) => {
      mat2.opacity = 0.54 * (1 - m * 0.95);
    });
    this.veilMaterials.forEach((mat2, i) => {
      mat2.uniforms.uAlpha.value = (0.13 + i * 0.025) * (1 - m * 0.96);
      mat2.uniforms.uTime.value = time;
    });
    const rainAlpha = 0.135 * (1 - m);
    this.rain.material.opacity = rainAlpha;
    this.rain.visible = rainAlpha > 1e-3;
    for (let i = 0; i < this.rainSeeds.length / 4; i++) {
      const k = i * 4, x = this.rainSeeds[k], phase = this.rainSeeds[k + 1], z = this.rainSeeds[k + 2], length = this.rainSeeds[k + 3];
      const y = 21 - (phase + time * 2.3) % 21, drift = 0.09 * Math.sin(time * 0.16 + phase);
      this.rainPositions.setXYZ(i * 2, x + drift, y, z);
      this.rainPositions.setXYZ(i * 2 + 1, x + drift + 0.019, y - length, z - 6e-3);
    }
    this.rainPositions.needsUpdate = true;
    this.group.updateMatrixWorld(true);
  }
  /** Caller keeps ownership of an optional, independently verified HDRI texture. */
  setReflectionEnvironment(texture) {
    this.scene.environment = texture;
  }
  dispose() {
    this.group.removeFromParent();
    const geometries = /* @__PURE__ */ new Set(), materials = /* @__PURE__ */ new Set();
    this.group.traverse((object) => {
      const mesh = object;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((material) => materials.add(material));
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    if (this.scene.environment === this.environment.texture) this.scene.environment = null;
    this.environment.dispose();
    this.groundShader = void 0;
    this.scene.background = this.previousBackground;
  }
};

// src/OpticalEnergyV07.ts
import * as T2 from "three";
var clamp2 = (n) => Math.max(0, Math.min(1, n));
var fract = (n) => n - Math.floor(n);
var smooth2 = (n) => {
  const t = clamp2(n);
  return t * t * (3 - 2 * t);
};
var BEAM_VERTEX = `varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.0);vN=normalize(normalMatrix*normal);vV=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`;
var BEAM_FRAGMENT = `uniform vec3 uColour;uniform float uAlpha;uniform float uReveal;uniform float uTime;
uniform float uSegment;uniform float uDistance;uniform float uLength;uniform float uHalo;uniform float uPhase;
varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){float end=clamp(uReveal-uSegment,0.0,1.0);if(vUv.y>end||end<=0.0)discard;
float facing=abs(dot(normalize(vN),normalize(vV)));float edge=pow(facing,mix(.45,1.4,uHalo));
float d=uDistance+vUv.y*uLength;float cycle=fract(d*.83-uTime*.65+uPhase);
float pulse=pow(max(0.0,1.0-abs(cycle-.5)*2.0),20.0);
float endFeather=1.0-smoothstep(max(0.0,end-.009),end,vUv.y);
float alpha=uAlpha*edge*endFeather*mix(.76+.24*pulse,.13+.13*pulse,uHalo);
gl_FragColor=vec4(uColour,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
var GLOW_FRAGMENT = `uniform vec3 uColour;uniform float uAlpha;varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){float f=max(0.0,dot(normalize(vN),normalize(vV)));gl_FragColor=vec4(uColour,uAlpha*pow(f,2.2));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
var OpticalEnergyV07 = class {
  group = new T2.Group();
  paths = [];
  geometries = /* @__PURE__ */ new Set();
  materials = /* @__PURE__ */ new Set();
  white = new T2.Color("#fff5df");
  tempColour = new T2.Color();
  tangent = new T2.Vector3();
  up = new T2.Vector3(0, 1, 0);
  normal = new T2.Vector3();
  disposed = false;
  constructor(inputs) {
    this.group.name = "v07-optical-energy-on-verified-rays";
    const bead = new T2.SphereGeometry(1, 16, 10), ring = new T2.RingGeometry(0.63, 1, 48);
    this.geometries.add(bead);
    this.geometries.add(ring);
    const seen = /* @__PURE__ */ new Set();
    inputs.forEach((source2, index) => {
      if (source2.points.length < 2) return;
      const points = source2.points.map((p2) => p2.clone()), cumulative = [0];
      for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1] + points[i].distanceTo(points[i - 1]));
      const length = cumulative[cumulative.length - 1];
      if (length < 1e-6) return;
      const first = !seen.has(source2.role);
      seen.add(source2.role);
      const path = { source: source2, points, cumulative, length, colour: new T2.Color(source2.color), segments: [], photons: [], events: [], first, index };
      for (let i = 0; i < points.length - 1; i++) {
        const span = cumulative[i + 1] - cumulative[i];
        if (span < 1e-6 || i === 0 && !first) continue;
        const radius = source2.role === "primary" ? 55e-4 : 6e-3;
        for (const halo of [true, false]) {
          const geometry = new T2.CylinderGeometry(halo ? radius * 3.6 : radius, halo ? radius * 3.6 : radius, span, 16, 1, true);
          this.geometries.add(geometry);
          const material = new T2.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: T2.NormalBlending, toneMapped: false, vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT, uniforms: {
            uColour: { value: this.white.clone() },
            uAlpha: { value: 0 },
            uReveal: { value: 0 },
            uTime: { value: 0 },
            uSegment: { value: i },
            uDistance: { value: cumulative[i] },
            uLength: { value: span },
            uHalo: { value: halo ? 1 : 0 },
            uPhase: { value: index * 0.037 }
          } });
          this.materials.add(material);
          const mesh = new T2.Mesh(geometry, material);
          mesh.position.copy(points[i]).lerp(points[i + 1], 0.5);
          this.tangent.subVectors(points[i + 1], points[i]).normalize();
          mesh.quaternion.setFromUnitVectors(this.up, this.tangent);
          mesh.renderOrder = halo ? 12 : 14;
          mesh.frustumCulled = false;
          this.group.add(mesh);
          path.segments.push({ mesh, index: i, input: i === 0 });
        }
      }
      for (let i = 0; i < 2; i++) {
        const material = new T2.MeshBasicMaterial({ color: this.white, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
        this.materials.add(material);
        const core = new T2.Mesh(bead, material);
        core.scale.set(0.011, 0.038, 0.011);
        core.renderOrder = 17;
        const haloMaterial = new T2.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: T2.NormalBlending, toneMapped: false, vertexShader: BEAM_VERTEX, fragmentShader: GLOW_FRAGMENT, uniforms: { uColour: { value: this.white.clone() }, uAlpha: { value: 0 } } });
        this.materials.add(haloMaterial);
        const glow = new T2.Mesh(bead, haloMaterial);
        glow.scale.set(0.03, 0.075, 0.03);
        glow.renderOrder = 13;
        this.group.add(core, glow);
        path.photons.push({ core, glow, phase: i / 2 });
      }
      for (let i = 1; i < points.length - 1; i++) {
        if (i === 1 && !first) continue;
        const ringMaterial = new T2.MeshBasicMaterial({ color: this.white, transparent: true, opacity: 0, side: T2.DoubleSide, depthWrite: false, toneMapped: false });
        this.materials.add(ringMaterial);
        const disk = new T2.Mesh(ring, ringMaterial);
        disk.position.copy(points[i]);
        this.normal.copy(points[i]).normalize();
        disk.quaternion.setFromUnitVectors(new T2.Vector3(0, 0, 1), this.normal);
        disk.renderOrder = 15;
        const dotMaterial = new T2.MeshBasicMaterial({ color: this.white, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
        this.materials.add(dotMaterial);
        const dot = new T2.Mesh(bead, dotMaterial);
        dot.position.copy(points[i]);
        dot.scale.setScalar(0.016);
        dot.renderOrder = 16;
        this.group.add(disk, dot);
        path.events.push({ ring: disk, dot, index: i, phase: i * 0.17 + index * 0.017 });
      }
      this.paths.push(path);
    });
  }
  update(frame, primaryReveal, primaryOpacity, secondaryReveal, secondaryOpacity, colourLevel) {
    if (this.disposed) return;
    const time = Math.max(0, frame) / 30, colour = clamp2(colourLevel);
    for (const path of this.paths) {
      const n = path.points.length - 1, reveal = clamp2(path.source.role === "primary" ? primaryReveal : secondaryReveal) * n;
      const base = clamp2(path.source.role === "primary" ? primaryOpacity : secondaryOpacity);
      const spectralOpacity = path.first ? base : base * smooth2(colour);
      for (const { mesh, input } of path.segments) {
        const a = input ? base : spectralOpacity;
        mesh.visible = a > 1e-4 && reveal > mesh.material.uniforms.uSegment.value;
        this.tempColour.copy(this.white);
        if (!input) this.tempColour.lerp(path.colour, colour);
        mesh.material.uniforms.uColour.value.copy(this.tempColour);
        mesh.material.uniforms.uAlpha.value = a;
        mesh.material.uniforms.uReveal.value = reveal;
        mesh.material.uniforms.uTime.value = time;
      }
      for (const photon of path.photons) {
        const d = fract(time * 0.19 + photon.phase) * path.length;
        let segment = 0;
        while (segment < n - 1 && d > path.cumulative[segment + 1]) segment++;
        const local = (d - path.cumulative[segment]) / Math.max(1e-8, path.cumulative[segment + 1] - path.cumulative[segment]);
        const inherited = segment === 0 ? path.first ? base : 0 : spectralOpacity;
        const a = inherited * smooth2((reveal - segment - local) / 0.045) * smooth2(d / 0.15) * smooth2((path.length - d) / 0.18);
        photon.core.visible = photon.glow.visible = a > 1e-4;
        photon.core.position.lerpVectors(path.points[segment], path.points[segment + 1], local);
        photon.glow.position.copy(photon.core.position);
        this.tangent.subVectors(path.points[segment + 1], path.points[segment]).normalize();
        photon.core.quaternion.setFromUnitVectors(this.up, this.tangent);
        photon.glow.quaternion.copy(photon.core.quaternion);
        this.tempColour.copy(this.white);
        if (segment > 0) this.tempColour.lerp(path.colour, colour);
        photon.core.material.color.copy(this.tempColour);
        photon.core.material.opacity = a * 0.88;
        photon.glow.material.uniforms.uColour.value.copy(this.tempColour);
        photon.glow.material.uniforms.uAlpha.value = a * 0.29;
      }
      for (const event of path.events) {
        const reached = smooth2((reveal - event.index) / 0.055), a = (event.index === 1 ? base : spectralOpacity) * reached;
        const pulse = fract(time * 0.58 + event.phase);
        event.ring.scale.setScalar(0.05 + 0.066 * pulse);
        event.ring.visible = event.dot.visible = a > 1e-4;
        event.ring.material.opacity = a * 0.32 * (1 - pulse) ** 1.5;
        event.dot.material.opacity = a * 0.61;
        this.tempColour.copy(this.white);
        if (event.index > 1) this.tempColour.lerp(path.colour, colour);
        event.ring.material.color.copy(this.tempColour);
        event.dot.material.color.copy(this.tempColour);
      }
    }
    this.group.visible = clamp2(primaryOpacity) + clamp2(secondaryOpacity) > 1e-4;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.geometries.forEach((g) => g.dispose());
    this.materials.forEach((m) => m.dispose());
    this.group.clear();
    this.paths.length = 0;
    this.geometries.clear();
    this.materials.clear();
  }
};

// src/timeline.json
var timeline_default = {
  timeUnit: "seconds",
  fps: 30,
  duration: 9613,
  seconds: 320.440333,
  clips: [
    {
      id: "r001",
      scene: "street",
      heading: "\u8FFD\u4E0D\u5230\u7684\u6865",
      caption: "\u96E8\u521A\u505C\uFF0C\u8DEF\u4E0A\u8FD8\u6CDB\u7740\u6C34\u5149\u3002\u4E00\u9053\u5F69\u8679\u843D\u5728\u8857\u9053\u5C3D\u5934",
      text: "\u96E8\u521A\u505C\uFF0C\u8DEF\u4E0A\u8FD8\u6CDB\u7740\u6C34\u5149\u3002\u4E00\u9053\u5F69\u8679\u843D\u5728\u8857\u9053\u5C3D\u5934\u3002\u4F60\u6709\u6CA1\u6709\u60F3\u8FC7\uFF0C\u8D70\u5230\u90A3\u91CC\uFF0C\u80FD\u6478\u5230\u5F69\u8679\u5417\uFF1F",
      spoken: "\u96E8\u521A\u505C\uFF0C\u8DEF\u4E0A\u8FD8\u6CDB\u7740\u6C34\u5149\u3002\u4E00\u9053\u5F69\u8679\u843D\u5728\u8857\u9053\u5C3D\u5934\u3002\u4F60\u6709\u6CA1\u6709\u60F3\u8FC7\uFF0C\u8D70\u5230\u90A3\u91CC\uFF0C\u80FD\u6478\u5230\u5F69\u8679\u5417\uFF1F",
      start: 0,
      end: 8.48,
      duration: 8.48,
      audio: "public/audio/r001.wav",
      audioSHA256: "24b9c219bc3100282bd6f9f1995c974a77ae84eb12c9725b0db5de9b6e552345"
    },
    {
      id: "r002",
      scene: "street",
      heading: "\u8FFD\u4E0D\u5230\u7684\u6865",
      caption: "\u5F80\u524D\u8D70\u51E0\u6B65\uFF0C\u5B83\u8FD8\u5728\u8FDC\u5904\u3002\u660E\u660E\u50CF\u4E00\u5EA7\u6865\uFF0C\u5374\u59CB\u7EC8",
      text: "\u5F80\u524D\u8D70\u51E0\u6B65\uFF0C\u5B83\u8FD8\u5728\u8FDC\u5904\u3002\u660E\u660E\u50CF\u4E00\u5EA7\u6865\uFF0C\u5374\u59CB\u7EC8\u627E\u4E0D\u5230\u6865\u811A\u3002\u8FD8\u6709\u4E2A\u95EE\u9898\uFF0C\u5B83\u4E3A\u4EC0\u4E48\u603B\u662F\u5F2F\u7684\uFF1F",
      spoken: "\u5F80\u524D\u8D70\u51E0\u6B65\uFF0C\u5B83\u8FD8\u5728\u8FDC\u5904\u3002\u660E\u660E\u50CF\u4E00\u5EA7\u6865\uFF0C\u5374\u59CB\u7EC8\u627E\u4E0D\u5230\u6865\u811A\u3002\u8FD8\u6709\u4E2A\u95EE\u9898\uFF0C\u5B83\u4E3A\u4EC0\u4E48\u603B\u662F\u5F2F\u7684\uFF1F",
      start: 8.6,
      end: 17.48,
      duration: 8.88,
      audio: "public/audio/r002.wav",
      audioSHA256: "de09db1f44be79b8884838c5f302c30c0d45d5c41a6a2172c7353d3ddd1798b6"
    },
    {
      id: "r003",
      scene: "street",
      heading: "\u8FFD\u4E0D\u5230\u7684\u6865",
      caption: "\u56DE\u5934\u770B\u770B\uFF0C\u592A\u9633\u5728\u80CC\u540E\uFF1B\u524D\u65B9\u7684\u5929\u7A7A\u91CC\uFF0C\u8FD8\u6709\u4E00\u7247",
      text: "\u56DE\u5934\u770B\u770B\uFF0C\u592A\u9633\u5728\u80CC\u540E\uFF1B\u524D\u65B9\u7684\u5929\u7A7A\u91CC\uFF0C\u8FD8\u6709\u4E00\u7247\u96E8\u3002\u9633\u5149\u3001\u6C34\u6EF4\uFF0C\u518D\u52A0\u4E0A\u4F60\u7AD9\u7684\u4F4D\u7F6E\uFF0C\u7B54\u6848\u5C31\u85CF\u5728\u8FD9\u91CC\u3002",
      spoken: "\u56DE\u5934\u770B\u770B\uFF0C\u592A\u9633\u5728\u80CC\u540E\uFF1B\u524D\u65B9\u7684\u5929\u7A7A\u91CC\uFF0C\u8FD8\u6709\u4E00\u7247\u96E8\u3002\u9633\u5149\u3001\u6C34\u6EF4\uFF0C\u518D\u52A0\u4E0A\u4F60\u7AD9\u7684\u4F4D\u7F6E\uFF0C\u7B54\u6848\u5C31\u85CF\u5728\u8FD9\u91CC\u3002",
      start: 17.6,
      end: 26.96,
      duration: 9.36,
      audio: "public/audio/r003.wav",
      audioSHA256: "26d126f7c7f3be5575a2baf6a9a6ae4c0f9e885556de63a428585142045956c9"
    },
    {
      id: "r004",
      scene: "street",
      heading: "\u8FFD\u4E0D\u5230\u7684\u6865",
      caption: "\u6211\u4EEC\u4ECE\u8FD9\u7247\u96E8\u91CC\uFF0C\u6311\u51FA\u4E00\u6EF4\u6C34\u3002\u5929\u7A7A\u90A3\u4E48\u5927\u7684\u4E00\u9053",
      text: "\u6211\u4EEC\u4ECE\u8FD9\u7247\u96E8\u91CC\uFF0C\u6311\u51FA\u4E00\u6EF4\u6C34\u3002\u5929\u7A7A\u90A3\u4E48\u5927\u7684\u4E00\u9053\u5F69\u8679\uFF0C\u8981\u4ECE\u8FD9\u4E2A\u5C0F\u5730\u65B9\u8BF4\u8D77\u3002",
      spoken: "\u6211\u4EEC\u4ECE\u8FD9\u7247\u96E8\u91CC\uFF0C\u6311\u51FA\u4E00\u6EF4\u6C34\u3002\u5929\u7A7A\u90A3\u4E48\u5927\u7684\u4E00\u9053\u5F69\u8679\uFF0C\u8981\u4ECE\u8FD9\u4E2A\u5C0F\u5730\u65B9\u8BF4\u8D77\u3002",
      start: 27.08,
      end: 33.8,
      duration: 6.72,
      audio: "public/audio/r004.wav",
      audioSHA256: "38f8f50b04b71e8ec9340757cec79aa4f4d5ac85f1c6b494bda9d6f2dacc7233"
    },
    {
      id: "r005",
      scene: "drop",
      heading: "\u5149\u8FDB\u6C34\u6EF4",
      caption: "\u5F88\u5C0F\u7684\u96E8\u6EF4\uFF0C\u5F62\u72B6\u63A5\u8FD1\u4E00\u4E2A\u5706\u7403\u3002\u9633\u5149\u78B0\u5230\u5B83\uFF0C\u5148",
      text: "\u5F88\u5C0F\u7684\u96E8\u6EF4\uFF0C\u5F62\u72B6\u63A5\u8FD1\u4E00\u4E2A\u5706\u7403\u3002\u9633\u5149\u78B0\u5230\u5B83\uFF0C\u5148\u7ECF\u8FC7\u7A7A\u6C14\u548C\u6C34\u7684\u4EA4\u754C\u3002",
      spoken: "\u5F88\u5C0F\u7684\u96E8\u6EF4\uFF0C\u5F62\u72B6\u63A5\u8FD1\u4E00\u4E2A\u5706\u7403\u3002\u9633\u5149\u78B0\u5230\u5B83\uFF0C\u5148\u7ECF\u8FC7\u7A7A\u6C14\u548C\u6C34\u7684\u4EA4\u754C\u3002",
      start: 33.92,
      end: 41.04,
      duration: 7.12,
      audio: "public/audio/r005.wav",
      audioSHA256: "486f99a67de71120c42bd480cd1d56b7f0c6fd7dd02f286aaa9069cb20fa0f54"
    },
    {
      id: "r006",
      scene: "drop",
      heading: "\u5149\u8FDB\u6C34\u6EF4",
      caption: "\u5149\u5728\u6C34\u91CC\u4F20\u64AD\u5F97\u6162\u4E00\u4E9B\uFF0C\u659C\u7740\u8FDB\u5165\u65F6\uFF0C\u65B9\u5411\u4E5F\u4F1A\u8F6C",
      text: "\u5149\u5728\u6C34\u91CC\u4F20\u64AD\u5F97\u6162\u4E00\u4E9B\uFF0C\u659C\u7740\u8FDB\u5165\u65F6\uFF0C\u65B9\u5411\u4E5F\u4F1A\u8F6C\u5F2F\u3002\u8FD9\u5C31\u53EB\u6298\u5C04\u3002",
      spoken: "\u5149\u5728\u6C34\u91CC\u4F20\u64AD\u5F97\u6162\u4E00\u4E9B\uFF0C\u659C\u7740\u8FDB\u5165\u65F6\uFF0C\u65B9\u5411\u4E5F\u4F1A\u8F6C\u5F2F\u3002\u8FD9\u5C31\u53EB\u6298\u5C04\u3002",
      start: 41.16,
      end: 47.16,
      duration: 6,
      audio: "public/audio/r006.wav",
      audioSHA256: "d5d028edf31726b7a70315222a9889f7553848208e6faacaf6937188ce018ea5"
    },
    {
      id: "r007",
      scene: "drop",
      heading: "\u5149\u8FDB\u6C34\u6EF4",
      caption: "\u628A\u7B77\u5B50\u653E\u8FDB\u6C34\u676F\uFF0C\u770B\u7740\u50CF\u6298\u4E86\u4E00\u4E0B\uFF0C\u4E5F\u662F\u540C\u6837\u7684\u9053",
      text: "\u628A\u7B77\u5B50\u653E\u8FDB\u6C34\u676F\uFF0C\u770B\u7740\u50CF\u6298\u4E86\u4E00\u4E0B\uFF0C\u4E5F\u662F\u540C\u6837\u7684\u9053\u7406\u3002\u6C34\u6CA1\u6709\u628A\u7B77\u5B50\u6298\u65AD\uFF0C\u8F6C\u5F2F\u7684\u662F\u6765\u5230\u773C\u775B\u91CC\u7684\u5149\u3002",
      spoken: "\u628A\u7B77\u5B50\u653E\u8FDB\u6C34\u676F\uFF0C\u770B\u7740\u50CF\u6298\u4E86\u4E00\u4E0B\uFF0C\u4E5F\u662F\u540C\u6837\u7684\u9053\u7406\u3002\u6C34\u6CA1\u6709\u628A\u7B77\u5B50\u6298\u65AD\uFF0C\u8F6C\u5F2F\u7684\u662F\u6765\u5230\u773C\u775B\u91CC\u7684\u5149\u3002",
      start: 47.28,
      end: 55.92,
      duration: 8.64,
      audio: "public/audio/r007.wav",
      audioSHA256: "5d3a88947d0ec03c2034bf5d3f758dfd9a458d53ea2eaa6d86c214fbcc049b24"
    },
    {
      id: "r008",
      scene: "drop",
      heading: "\u5149\u8FDB\u6C34\u6EF4",
      caption: "\u4E00\u6EF4\u6C34\u7684\u8868\u9762\u662F\u5F2F\u7684\u3002\u5149\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u53BB\uFF0C\u5C31\u4F1A\u8D70",
      text: "\u4E00\u6EF4\u6C34\u7684\u8868\u9762\u662F\u5F2F\u7684\u3002\u5149\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u53BB\uFF0C\u5C31\u4F1A\u8D70\u4E0A\u4E0D\u540C\u7684\u8DEF\u7EBF\u3002\u6211\u4EEC\u8DDF\u4F4F\u5176\u4E2D\u4E00\u6761\u3002",
      spoken: "\u4E00\u6EF4\u6C34\u7684\u8868\u9762\u662F\u5F2F\u7684\u3002\u5149\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u53BB\uFF0C\u5C31\u4F1A\u8D70\u4E0A\u4E0D\u540C\u7684\u8DEF\u7EBF\u3002\u6211\u4EEC\u8DDF\u4F4F\u5176\u4E2D\u4E00\u6761\u3002",
      start: 56.04,
      end: 62.6,
      duration: 6.56,
      audio: "public/audio/r008.wav",
      audioSHA256: "f2be0523822f549d3774820402b62326915d0c376413efc05b9bdb963f385c05"
    },
    {
      id: "r009",
      scene: "dispersion",
      heading: "\u989C\u8272\u5206\u5F00",
      caption: "\u9633\u5149\u770B\u8D77\u6765\u662F\u767D\u8272\uFF0C\u91CC\u9762\u5374\u6DF7\u7740\u4E00\u6574\u6BB5\u989C\u8272\u3002\u8FDB\u5165",
      text: "\u9633\u5149\u770B\u8D77\u6765\u662F\u767D\u8272\uFF0C\u91CC\u9762\u5374\u6DF7\u7740\u4E00\u6574\u6BB5\u989C\u8272\u3002\u8FDB\u5165\u6C34\u6EF4\u65F6\uFF0C\u5404\u79CD\u989C\u8272\u8F6C\u5F2F\u7684\u7A0B\u5EA6\u7565\u6709\u4E0D\u540C\u3002",
      spoken: "\u9633\u5149\u770B\u8D77\u6765\u662F\u767D\u8272\uFF0C\u91CC\u9762\u5374\u6DF7\u7740\u4E00\u6574\u6BB5\u989C\u8272\u3002\u8FDB\u5165\u6C34\u6EF4\u65F6\uFF0C\u5404\u79CD\u989C\u8272\u8F6C\u5F2F\u7684\u7A0B\u5EA6\u7565\u6709\u4E0D\u540C\u3002",
      start: 62.72,
      end: 70.48,
      duration: 7.76,
      audio: "public/audio/r009.wav",
      audioSHA256: "cdc456df0088c68579467652739d0d37f8dfbd36aa10781faad00df7b82a35a9"
    },
    {
      id: "r010",
      scene: "dispersion",
      heading: "\u989C\u8272\u5206\u5F00",
      caption: "\u7EA2\u5149\u62D0\u5F97\u5C11\u4E00\u70B9\uFF0C\u7D2B\u5149\u62D0\u5F97\u591A\u4E00\u70B9\u3002\u539F\u672C\u6324\u5728\u4E00\u8D77",
      text: "\u7EA2\u5149\u62D0\u5F97\u5C11\u4E00\u70B9\uFF0C\u7D2B\u5149\u62D0\u5F97\u591A\u4E00\u70B9\u3002\u539F\u672C\u6324\u5728\u4E00\u8D77\u7684\u989C\u8272\uFF0C\u5F00\u59CB\u6162\u6162\u5206\u5F00\u3002",
      spoken: "\u7EA2\u5149\u62D0\u5F97\u5C11\u4E00\u70B9\uFF0C\u7D2B\u5149\u62D0\u5F97\u591A\u4E00\u70B9\u3002\u539F\u672C\u6324\u5728\u4E00\u8D77\u7684\u989C\u8272\uFF0C\u5F00\u59CB\u6162\u6162\u5206\u5F00\u3002",
      start: 70.6,
      end: 77.080042,
      duration: 6.480042,
      audio: "public/audio/r010.wav",
      audioSHA256: "06e1322bea3959cc195155469f56b7bcf105715ebbce61fa8d573eb07a824447"
    },
    {
      id: "r011",
      scene: "dispersion",
      heading: "\u989C\u8272\u5206\u5F00",
      caption: "\u4E2D\u95F4\u8FD8\u6709\u6A59\u3001\u9EC4\u3001\u7EFF\u3001\u84DD\uFF0C\u4E00\u79CD\u63A5\u7740\u4E00\u79CD\u3002\u6C34\u6EF4\u505A",
      text: "\u4E2D\u95F4\u8FD8\u6709\u6A59\u3001\u9EC4\u3001\u7EFF\u3001\u84DD\uFF0C\u4E00\u79CD\u63A5\u7740\u4E00\u79CD\u3002\u6C34\u6EF4\u505A\u7684\u4E8B\uFF0C\u662F\u628A\u767D\u5149\u91CC\u539F\u6709\u7684\u989C\u8272\u5C55\u5F00\u3002",
      spoken: "\u4E2D\u95F4\u8FD8\u6709\u6A59\u3001\u9EC4\u3001\u7EFF\u3001\u84DD\uFF0C\u4E00\u79CD\u63A5\u7740\u4E00\u79CD\u3002\u6C34\u6EF4\u505A\u7684\u4E8B\uFF0C\u662F\u628A\u767D\u5149\u91CC\u539F\u6709\u7684\u989C\u8272\u5C55\u5F00\u3002",
      start: 77.200042,
      end: 86.240083,
      duration: 9.040042,
      audio: "public/audio/r011.wav",
      audioSHA256: "ce4d3e613c20e2581983b59ada2a9afffad75e15c52c32c7fcf93f8b78cc9475"
    },
    {
      id: "r012",
      scene: "dispersion",
      heading: "\u989C\u8272\u5206\u5F00",
      caption: "\u989C\u8272\u4E4B\u95F4\u4E00\u76F4\u5728\u8FC7\u6E21\u3002\u6211\u4EEC\u5E38\u8BF4\u7684\u4E03\u8272\uFF0C\u662F\u65B9\u4FBF\u8BB0",
      text: "\u989C\u8272\u4E4B\u95F4\u4E00\u76F4\u5728\u8FC7\u6E21\u3002\u6211\u4EEC\u5E38\u8BF4\u7684\u4E03\u8272\uFF0C\u662F\u65B9\u4FBF\u8BB0\u5FC6\u7684\u540D\u5B57\uFF0C\u771F\u5B9E\u7684\u5149\u8C31\u8FDE\u6210\u4E00\u7247\u3002",
      spoken: "\u989C\u8272\u4E4B\u95F4\u4E00\u76F4\u5728\u8FC7\u6E21\u3002\u6211\u4EEC\u5E38\u8BF4\u7684\u4E03\u8272\uFF0C\u662F\u65B9\u4FBF\u8BB0\u5FC6\u7684\u540D\u5B57\uFF0C\u771F\u5B9E\u7684\u5149\u8C31\u8FDE\u6210\u4E00\u7247\u3002",
      start: 86.360083,
      end: 93.560125,
      duration: 7.200042,
      audio: "public/audio/r012.wav",
      audioSHA256: "45ea5171c219ed5c6a203604669c12f231660a8bf9ca46370109fc76f3567fd0"
    },
    {
      id: "r013",
      scene: "reflection",
      heading: "\u56DE\u5934\u4E00\u6B21",
      caption: "\u7EE7\u7EED\u5F80\u91CC\u8D70\u3002\u5149\u5230\u8FBE\u6C34\u6EF4\u7684\u53E6\u4E00\u9762\uFF0C\u6709\u4E00\u90E8\u5206\u7A7F\u51FA",
      text: "\u7EE7\u7EED\u5F80\u91CC\u8D70\u3002\u5149\u5230\u8FBE\u6C34\u6EF4\u7684\u53E6\u4E00\u9762\uFF0C\u6709\u4E00\u90E8\u5206\u7A7F\u51FA\u53BB\uFF0C\u8FD8\u6709\u4E00\u90E8\u5206\u5728\u6C34\u91CC\u53CD\u5C04\uFF0C\u56DE\u8FC7\u5934\u6765\u3002",
      spoken: "\u7EE7\u7EED\u5F80\u91CC\u8D70\u3002\u5149\u5230\u8FBE\u6C34\u6EF4\u7684\u53E6\u4E00\u9762\uFF0C\u6709\u4E00\u90E8\u5206\u7A7F\u51FA\u53BB\uFF0C\u8FD8\u6709\u4E00\u90E8\u5206\u5728\u6C34\u91CC\u53CD\u5C04\uFF0C\u56DE\u8FC7\u5934\u6765\u3002",
      start: 93.680125,
      end: 101.520125,
      duration: 7.84,
      audio: "public/audio/r013.wav",
      audioSHA256: "ed5ee016a7ee6e13331e0b32e111c10c2d612b087b8c9f37134eaef6540d8e92"
    },
    {
      id: "r014",
      scene: "reflection",
      heading: "\u56DE\u5934\u4E00\u6B21",
      caption: "\u8FD9\u4E00\u90E8\u5206\u5149\u518D\u6B21\u8D70\u5230\u6C34\u548C\u7A7A\u6C14\u7684\u4EA4\u754C\uFF0C\u51FA\u95E8\u65F6\u53C8\u6298",
      text: "\u8FD9\u4E00\u90E8\u5206\u5149\u518D\u6B21\u8D70\u5230\u6C34\u548C\u7A7A\u6C14\u7684\u4EA4\u754C\uFF0C\u51FA\u95E8\u65F6\u53C8\u6298\u5C04\u4E00\u6B21\u3002\u5B83\u5DF2\u7ECF\u671D\u7740\u9633\u5149\u6765\u65F6\u7684\u90A3\u4E00\u4FA7\u8FD4\u56DE\u3002",
      spoken: "\u8FD9\u4E00\u90E8\u5206\u5149\u518D\u6B21\u8D70\u5230\u6C34\u548C\u7A7A\u6C14\u7684\u4EA4\u754C\uFF0C\u51FA\u95E8\u65F6\u53C8\u6298\u5C04\u4E00\u6B21\u3002\u5B83\u5DF2\u7ECF\u671D\u7740\u9633\u5149\u6765\u65F6\u7684\u90A3\u4E00\u4FA7\u8FD4\u56DE\u3002",
      start: 101.640125,
      end: 109.800125,
      duration: 8.16,
      audio: "public/audio/r014.wav",
      audioSHA256: "b079b4e78c623290c693cbcd89d84010bc8b37f69b567c7a7b859d62fa166c25"
    },
    {
      id: "r015",
      scene: "reflection",
      heading: "\u56DE\u5934\u4E00\u6B21",
      caption: "\u8FDB\u95E8\u8F6C\u4E00\u6B21\u5F2F\uFF0C\u91CC\u9762\u56DE\u4E00\u6B21\u5934\uFF0C\u51FA\u95E8\u518D\u8F6C\u4E00\u6B21\u5F2F\u3002",
      text: "\u8FDB\u95E8\u8F6C\u4E00\u6B21\u5F2F\uFF0C\u91CC\u9762\u56DE\u4E00\u6B21\u5934\uFF0C\u51FA\u95E8\u518D\u8F6C\u4E00\u6B21\u5F2F\u3002\u8FD9\u6761\u8DEF\u7EBF\uFF0C\u5C31\u662F\u6700\u5E38\u89C1\u7684\u4E3B\u8679\u3002",
      spoken: "\u8FDB\u95E8\u8F6C\u4E00\u6B21\u5F2F\uFF0C\u91CC\u9762\u56DE\u4E00\u6B21\u5934\uFF0C\u51FA\u95E8\u518D\u8F6C\u4E00\u6B21\u5F2F\u3002\u8FD9\u6761\u8DEF\u7EBF\uFF0C\u5C31\u662F\u6700\u5E38\u89C1\u7684\u4E3B\u8679\u3002",
      start: 109.920125,
      end: 117.120167,
      duration: 7.200042,
      audio: "public/audio/r015.wav",
      audioSHA256: "a4b1cb3321678dd32d56a96d79aef59cf7d57dc90632f3cf3c3b7fbb7766a383"
    },
    {
      id: "r017",
      scene: "angle",
      heading: "\u7EA642\xB0",
      caption: "\u8BA9\u66F4\u591A\u5149\u7EBF\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u5165\u3002\u4F60\u4F1A\u53D1\u73B0\uFF0C\u8BB8\u591A\u51FA\u5C04",
      text: "\u8BA9\u66F4\u591A\u5149\u7EBF\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u5165\u3002\u4F60\u4F1A\u53D1\u73B0\uFF0C\u8BB8\u591A\u51FA\u5C04\u5149\u6324\u5728\u76F8\u8FD1\u7684\u89D2\u5EA6\uFF0C\u5F62\u6210\u4E00\u5904\u660E\u4EAE\u7684\u96C6\u4E2D\u3002",
      spoken: "\u8BA9\u66F4\u591A\u5149\u7EBF\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u5165\u3002\u4F60\u4F1A\u53D1\u73B0\uFF0C\u8BB8\u591A\u51FA\u5C04\u5149\u6324\u5728\u76F8\u8FD1\u7684\u89D2\u5EA6\uFF0C\u5F62\u6210\u4E00\u5904\u660E\u4EAE\u7684\u96C6\u4E2D\u3002",
      start: 117.240167,
      end: 125.720167,
      duration: 8.48,
      audio: "public/audio/r017.wav",
      audioSHA256: "c117a62f7a4f5fe4500d6be0a20838ec393e92a2a05523818f27ad446754cdcc"
    },
    {
      id: "r018",
      scene: "angle",
      heading: "\u7EA642\xB0",
      caption: "\u7EA2\u5149\u6700\u4EAE\u7684\u65B9\u5411\uFF0C\u5927\u7EA6\u5728\u56DB\u5341\u4E8C\u5EA6\uFF1B\u7D2B\u5149\u5927\u7EA6\u56DB\u5341",
      text: "\u7EA2\u5149\u6700\u4EAE\u7684\u65B9\u5411\uFF0C\u5927\u7EA6\u5728\u56DB\u5341\u4E8C\u5EA6\uFF1B\u7D2B\u5149\u5927\u7EA6\u56DB\u5341\u5EA6\u3002\u5DEE\u51FA\u6765\u7684\u8FD9\u70B9\u89D2\u5EA6\uFF0C\u628A\u5F69\u8272\u7684\u8FB9\u7F18\u62C9\u5F00\u4E86\u3002",
      spoken: "\u7EA2\u5149\u6700\u4EAE\u7684\u65B9\u5411\uFF0C\u5927\u7EA6\u5728\u56DB\u5341\u4E8C\u5EA6\uFF1B\u7D2B\u5149\u5927\u7EA6\u56DB\u5341\u5EA6\u3002\u5DEE\u51FA\u6765\u7684\u8FD9\u70B9\u89D2\u5EA6\uFF0C\u628A\u5F69\u8272\u7684\u8FB9\u7F18\u62C9\u5F00\u4E86\u3002",
      start: 125.840167,
      end: 134.720167,
      duration: 8.88,
      audio: "public/audio/r018.wav",
      audioSHA256: "14d8bc2fa658cc5ee486dbf6cd92eb9b77492d7e8393130959c78e047836dc25"
    },
    {
      id: "r019",
      scene: "angle",
      heading: "\u7EA642\xB0",
      caption: "\u8FD9\u4E24\u4E2A\u89D2\uFF0C\u662F\u5BF9\u7740\u54EA\u91CC\u91CF\u7684\u5462\uFF1F\u4ECE\u592A\u9633\uFF0C\u7ECF\u8FC7\u4F60\u7684",
      text: "\u8FD9\u4E24\u4E2A\u89D2\uFF0C\u662F\u5BF9\u7740\u54EA\u91CC\u91CF\u7684\u5462\uFF1F\u4ECE\u592A\u9633\uFF0C\u7ECF\u8FC7\u4F60\u7684\u773C\u775B\uFF0C\u518D\u5411\u524D\u5EF6\u4F38\uFF0C\u5C31\u662F\u80CC\u5411\u592A\u9633\u7684\u65B9\u5411\u3002",
      spoken: "\u8FD9\u4E24\u4E2A\u89D2\uFF0C\u662F\u5BF9\u7740\u54EA\u91CC\u91CF\u7684\u5462\uFF1F\u4ECE\u592A\u9633\uFF0C\u7ECF\u8FC7\u4F60\u7684\u773C\u775B\uFF0C\u518D\u5411\u524D\u5EF6\u4F38\uFF0C\u5C31\u662F\u80CC\u5411\u592A\u9633\u7684\u65B9\u5411\u3002",
      start: 134.840167,
      end: 143.480167,
      duration: 8.64,
      audio: "public/audio/r019.wav",
      audioSHA256: "b72dd52a60677ef4f6e5bb26068c77fcf4a17d8089e8c87f9b396c7bcc7375bf"
    },
    {
      id: "r020",
      scene: "angle",
      heading: "\u7EA642\xB0",
      caption: "\u4F60\u7684\u5F71\u5B50\u4E5F\u6307\u5411\u90A3\u8FB9\u3002\u4EE5\u8FD9\u6761\u65B9\u5411\u4E3A\u4E2D\u5FC3\uFF0C\u5F80\u5916\u504F",
      text: "\u4F60\u7684\u5F71\u5B50\u4E5F\u6307\u5411\u90A3\u8FB9\u3002\u4EE5\u8FD9\u6761\u65B9\u5411\u4E3A\u4E2D\u5FC3\uFF0C\u5F80\u5916\u504F\u56DB\u5341\u4E8C\u5EA6\uFF0C\u5C31\u627E\u5230\u4E86\u4E3B\u8679\u7684\u7EA2\u8272\u5916\u7F18\u3002",
      spoken: "\u4F60\u7684\u5F71\u5B50\u4E5F\u6307\u5411\u90A3\u8FB9\u3002\u4EE5\u8FD9\u6761\u65B9\u5411\u4E3A\u4E2D\u5FC3\uFF0C\u5F80\u5916\u504F\u56DB\u5341\u4E8C\u5EA6\uFF0C\u5C31\u627E\u5230\u4E86\u4E3B\u8679\u7684\u7EA2\u8272\u5916\u7F18\u3002",
      start: 143.600167,
      end: 151.200167,
      duration: 7.6,
      audio: "public/audio/r020.wav",
      audioSHA256: "a62da8ebba69ee1514eb47cea7b4906709102f61027a60aca0e65dd43d2ba922"
    },
    {
      id: "r021",
      scene: "cone",
      heading: "\u773C\u775B\u662F\u5706\u9525\u5C16\u7AEF",
      caption: "\u73B0\u5728\u628A\u4E00\u6EF4\u6C34\uFF0C\u6362\u6210\u4E00\u6574\u7247\u96E8\u3002\u80FD\u628A\u7EA2\u5149\u9001\u8FDB\u4F60\u773C",
      text: "\u73B0\u5728\u628A\u4E00\u6EF4\u6C34\uFF0C\u6362\u6210\u4E00\u6574\u7247\u96E8\u3002\u80FD\u628A\u7EA2\u5149\u9001\u8FDB\u4F60\u773C\u775B\u7684\u6C34\u6EF4\uFF0C\u90FD\u843D\u5728\u8FD9\u7EC4\u65B9\u5411\u4E0A\u3002",
      spoken: "\u73B0\u5728\u628A\u4E00\u6EF4\u6C34\uFF0C\u6362\u6210\u4E00\u6574\u7247\u96E8\u3002\u80FD\u628A\u7EA2\u5149\u9001\u8FDB\u4F60\u773C\u775B\u7684\u6C34\u6EF4\uFF0C\u90FD\u843D\u5728\u8FD9\u7EC4\u65B9\u5411\u4E0A\u3002",
      start: 151.320167,
      end: 158.040167,
      duration: 6.72,
      audio: "public/audio/r021.wav",
      audioSHA256: "2c8ef057e2e0a30b4a322714eac0e0c8caabf7f0b246042890c62c59c18401fe"
    },
    {
      id: "r022",
      scene: "cone",
      heading: "\u773C\u775B\u662F\u5706\u9525\u5C16\u7AEF",
      caption: "\u671D\u4E0A\u3001\u671D\u5DE6\u3001\u671D\u53F3\uFF0C\u53EA\u8981\u548C\u4E2D\u5FC3\u7EBF\u4FDD\u6301\u540C\u6837\u7684\u89D2\u5EA6",
      text: "\u671D\u4E0A\u3001\u671D\u5DE6\u3001\u671D\u53F3\uFF0C\u53EA\u8981\u548C\u4E2D\u5FC3\u7EBF\u4FDD\u6301\u540C\u6837\u7684\u89D2\u5EA6\uFF0C\u90FD\u6709\u673A\u4F1A\u51FA\u73B0\u7EA2\u5149\u3002\u7ED5\u4E00\u5708\uFF0C\u5C31\u56F4\u51FA\u4E00\u4E2A\u5706\u9525\u3002",
      spoken: "\u671D\u4E0A\u3001\u671D\u5DE6\u3001\u671D\u53F3\uFF0C\u53EA\u8981\u548C\u4E2D\u5FC3\u7EBF\u4FDD\u6301\u540C\u6837\u7684\u89D2\u5EA6\uFF0C\u90FD\u6709\u673A\u4F1A\u51FA\u73B0\u7EA2\u5149\u3002\u7ED5\u4E00\u5708\uFF0C\u5C31\u56F4\u51FA\u4E00\u4E2A\u5706\u9525\u3002",
      start: 158.160167,
      end: 167.120208,
      duration: 8.960042,
      audio: "public/audio/r022.wav",
      audioSHA256: "aa8aa1c607042a167498df210290817792806f5e2a33b334e26236a445624a31"
    },
    {
      id: "r023",
      scene: "cone",
      heading: "\u773C\u775B\u662F\u5706\u9525\u5C16\u7AEF",
      caption: "\u4F60\u7684\u773C\u775B\u5728\u5C16\u7AEF\u3002\u90A3\u4E9B\u6C34\u6EF4\u53EF\u4EE5\u5F88\u8FD1\uFF0C\u4E5F\u53EF\u4EE5\u5F88\u8FDC",
      text: "\u4F60\u7684\u773C\u775B\u5728\u5C16\u7AEF\u3002\u90A3\u4E9B\u6C34\u6EF4\u53EF\u4EE5\u5F88\u8FD1\uFF0C\u4E5F\u53EF\u4EE5\u5F88\u8FDC\uFF0C\u91CD\u8981\u7684\u662F\uFF0C\u5B83\u4EEC\u6709\u6CA1\u6709\u843D\u5728\u5408\u9002\u7684\u65B9\u5411\u3002",
      spoken: "\u4F60\u7684\u773C\u775B\u5728\u5C16\u7AEF\u3002\u90A3\u4E9B\u6C34\u6EF4\u53EF\u4EE5\u5F88\u8FD1\uFF0C\u4E5F\u53EF\u4EE5\u5F88\u8FDC\uFF0C\u91CD\u8981\u7684\u662F\uFF0C\u5B83\u4EEC\u6709\u6CA1\u6709\u843D\u5728\u5408\u9002\u7684\u65B9\u5411\u3002",
      start: 167.240208,
      end: 175.160208,
      duration: 7.92,
      audio: "public/audio/r023.wav",
      audioSHA256: "acef653031626a5b3d11547055ed69fdaec7caf6f15c51d526c86e6a48271015"
    },
    {
      id: "r024",
      scene: "cone",
      heading: "\u773C\u775B\u662F\u5706\u9525\u5C16\u7AEF",
      caption: "\u4ECE\u5C16\u7AEF\u671B\u51FA\u53BB\uFF0C\u8FD9\u4E9B\u65B9\u5411\u56F4\u6210\u4E00\u4E2A\u5706\u3002\u7EA2\u8272\u5728\u5916\uFF0C",
      text: "\u4ECE\u5C16\u7AEF\u671B\u51FA\u53BB\uFF0C\u8FD9\u4E9B\u65B9\u5411\u56F4\u6210\u4E00\u4E2A\u5706\u3002\u7EA2\u8272\u5728\u5916\uFF0C\u7D2B\u8272\u5728\u5185\u3002\u539F\u6765\u5F69\u8679\u7684\u5B8C\u6574\u5F62\u72B6\uFF0C\u662F\u5706\u7684\u3002",
      spoken: "\u4ECE\u5C16\u7AEF\u671B\u51FA\u53BB\uFF0C\u8FD9\u4E9B\u65B9\u5411\u56F4\u6210\u4E00\u4E2A\u5706\u3002\u7EA2\u8272\u5728\u5916\uFF0C\u7D2B\u8272\u5728\u5185\u3002\u539F\u6765\u5F69\u8679\u7684\u5B8C\u6574\u5F62\u72B6\uFF0C\u662F\u5706\u7684\u3002",
      start: 175.280208,
      end: 184.080208,
      duration: 8.8,
      audio: "public/audio/r024.wav",
      audioSHA256: "525819a2d5257cf737af8dcda8083d7b645b4d385042b2672870b717e4f247a2"
    },
    {
      id: "r025",
      scene: "circle",
      heading: "\u5706\u88AB\u5730\u9762\u906E\u4F4F",
      caption: "\u6211\u4EEC\u7AD9\u5728\u5730\u9762\u4E0A\uFF0C\u5F80\u4E0B\u770B\u7684\u65B9\u5411\u88AB\u5730\u9762\u6321\u4F4F\uFF0C\u4E0B\u9762",
      text: "\u6211\u4EEC\u7AD9\u5728\u5730\u9762\u4E0A\uFF0C\u5F80\u4E0B\u770B\u7684\u65B9\u5411\u88AB\u5730\u9762\u6321\u4F4F\uFF0C\u4E0B\u9762\u4E5F\u5E38\u5E38\u7F3A\u5C11\u88AB\u9633\u5149\u7167\u5230\u7684\u96E8\u6EF4\u3002\u4E8E\u662F\u53EA\u5269\u5929\u7A7A\u91CC\u7684\u8FD9\u4E00\u6BB5\u5F27\u3002",
      spoken: "\u6211\u4EEC\u7AD9\u5728\u5730\u9762\u4E0A\uFF0C\u5F80\u4E0B\u770B\u7684\u65B9\u5411\u88AB\u5730\u9762\u6321\u4F4F\uFF0C\u4E0B\u9762\u4E5F\u5E38\u5E38\u7F3A\u5C11\u88AB\u9633\u5149\u7167\u5230\u7684\u96E8\u6EF4\u3002\u4E8E\u662F\u53EA\u5269\u5929\u7A7A\u91CC\u7684\u8FD9\u4E00\u6BB5\u5F27\u3002",
      start: 184.200208,
      end: 193.880208,
      duration: 9.68,
      audio: "public/audio/r025.wav",
      audioSHA256: "5115c05aec409fcbeecf338ec96e5b772da9fcf83dc9a1513601d71f0fa793c0"
    },
    {
      id: "r026",
      scene: "circle",
      heading: "\u5706\u88AB\u5730\u9762\u906E\u4F4F",
      caption: "\u592A\u9633\u8D34\u8FD1\u5730\u5E73\u7EBF\u65F6\uFF0C\u5706\u5FC3\u4E5F\u63A5\u8FD1\u5730\u5E73\u7EBF\uFF0C\u5F69\u8679\u80FD\u9732",
      text: "\u592A\u9633\u8D34\u8FD1\u5730\u5E73\u7EBF\u65F6\uFF0C\u5706\u5FC3\u4E5F\u63A5\u8FD1\u5730\u5E73\u7EBF\uFF0C\u5F69\u8679\u80FD\u9732\u51FA\u8F83\u957F\u7684\u4E00\u6BB5\u3002\u592A\u9633\u5347\u9AD8\uFF0C\u5706\u5FC3\u4E0B\u6C89\uFF0C\u9732\u51FA\u7684\u5F27\u5C31\u77ED\u4E86\u3002",
      spoken: "\u592A\u9633\u8D34\u8FD1\u5730\u5E73\u7EBF\u65F6\uFF0C\u5706\u5FC3\u4E5F\u63A5\u8FD1\u5730\u5E73\u7EBF\uFF0C\u5F69\u8679\u80FD\u9732\u51FA\u8F83\u957F\u7684\u4E00\u6BB5\u3002\u592A\u9633\u5347\u9AD8\uFF0C\u5706\u5FC3\u4E0B\u6C89\uFF0C\u9732\u51FA\u7684\u5F27\u5C31\u77ED\u4E86\u3002",
      start: 194.000208,
      end: 203.680208,
      duration: 9.68,
      audio: "public/audio/r026.wav",
      audioSHA256: "428d36da97bd40adfdc46736a8b7272fa08e91f584f2a0443c944f827ed6fc9a"
    },
    {
      id: "r027",
      scene: "circle",
      heading: "\u5706\u88AB\u5730\u9762\u906E\u4F4F",
      caption: "\u98DE\u673A\u65C1\u3001\u7011\u5E03\u4E0A\u65B9\uFF0C\u6709\u65F6\u80FD\u770B\u89C1\u6574\u5706\u3002\u6761\u4EF6\u662F\u811A\u4E0B",
      text: "\u98DE\u673A\u65C1\u3001\u7011\u5E03\u4E0A\u65B9\uFF0C\u6709\u65F6\u80FD\u770B\u89C1\u6574\u5706\u3002\u6761\u4EF6\u662F\u811A\u4E0B\u4E5F\u6709\u9633\u5149\u7167\u4EAE\u7684\u6C34\u96FE\uFF0C\u800C\u4E14\u89C6\u91CE\u8DB3\u591F\u5F00\u9614\u3002",
      spoken: "\u98DE\u673A\u65C1\u3001\u7011\u5E03\u4E0A\u65B9\uFF0C\u6709\u65F6\u80FD\u770B\u89C1\u6574\u5706\u3002\u6761\u4EF6\u662F\u811A\u4E0B\u4E5F\u6709\u9633\u5149\u7167\u4EAE\u7684\u6C34\u96FE\uFF0C\u800C\u4E14\u89C6\u91CE\u8DB3\u591F\u5F00\u9614\u3002",
      start: 203.800208,
      end: 212.040208,
      duration: 8.24,
      audio: "public/audio/r027.wav",
      audioSHA256: "893f482518a794f3328f9080b2adc4ce1d25ffc81d445be10bb3faec01710c0e"
    },
    {
      id: "r028",
      scene: "circle",
      heading: "\u5706\u88AB\u5730\u9762\u906E\u4F4F",
      caption: "\u6240\u4EE5\uFF0C\u5F27\u5F62\u6765\u81EA\u6211\u4EEC\u7684\u4F4D\u7F6E\u548C\u5730\u9762\u7684\u906E\u6321\u3002\u6362\u4E00\u4E2A",
      text: "\u6240\u4EE5\uFF0C\u5F27\u5F62\u6765\u81EA\u6211\u4EEC\u7684\u4F4D\u7F6E\u548C\u5730\u9762\u7684\u906E\u6321\u3002\u6362\u4E00\u4E2A\u89C6\u91CE\uFF0C\u85CF\u8D77\u6765\u7684\u90A3\u4E00\u6BB5\uFF0C\u4E5F\u53EF\u80FD\u91CD\u65B0\u51FA\u73B0\u3002",
      spoken: "\u6240\u4EE5\uFF0C\u5F27\u5F62\u6765\u81EA\u6211\u4EEC\u7684\u4F4D\u7F6E\u548C\u5730\u9762\u7684\u906E\u6321\u3002\u6362\u4E00\u4E2A\u89C6\u91CE\uFF0C\u85CF\u8D77\u6765\u7684\u90A3\u4E00\u6BB5\uFF0C\u4E5F\u53EF\u80FD\u91CD\u65B0\u51FA\u73B0\u3002",
      start: 212.160208,
      end: 219.60025,
      duration: 7.440042,
      audio: "public/audio/r028.wav",
      audioSHA256: "99eb1df1940f9a1d1fd06cea42d94cf07ed75946835ba2acbbe2dd2bf1c58070"
    },
    {
      id: "r029",
      scene: "observer",
      heading: "\u6C34\u6EF4\u6362\u4E86\u4E00\u6279",
      caption: "\u8FD8\u8BB0\u5F97\u5F00\u5934\u90A3\u5EA7\u8FFD\u4E0D\u5230\u7684\u6865\u5417\uFF1F\u8BA9\u6211\u4EEC\u6A2A\u7740\u8D70\u51E0\u6B65",
      text: "\u8FD8\u8BB0\u5F97\u5F00\u5934\u90A3\u5EA7\u8FFD\u4E0D\u5230\u7684\u6865\u5417\uFF1F\u8BA9\u6211\u4EEC\u6A2A\u7740\u8D70\u51E0\u6B65\uFF0C\u770B\u770B\u4F1A\u53D1\u751F\u4EC0\u4E48\u3002",
      spoken: "\u8FD8\u8BB0\u5F97\u5F00\u5934\u90A3\u5EA7\u8FFD\u4E0D\u5230\u7684\u6865\u5417\uFF1F\u8BA9\u6211\u4EEC\u6A2A\u7740\u8D70\u51E0\u6B65\uFF0C\u770B\u770B\u4F1A\u53D1\u751F\u4EC0\u4E48\u3002",
      start: 219.72025,
      end: 225.16025,
      duration: 5.44,
      audio: "public/audio/r029.wav",
      audioSHA256: "eb6e0be4eb8aaa031a43a8c0c8c29f9225168510deb881ece477b6df9df26965"
    },
    {
      id: "r030",
      scene: "observer",
      heading: "\u6C34\u6EF4\u6362\u4E86\u4E00\u6279",
      caption: "\u773C\u775B\u6362\u4E86\u4F4D\u7F6E\uFF0C\u5706\u9525\u7684\u5C16\u7AEF\u4E5F\u8DDF\u7740\u79FB\u52A8\u3002\u539F\u5148\u9001\u6765",
      text: "\u773C\u775B\u6362\u4E86\u4F4D\u7F6E\uFF0C\u5706\u9525\u7684\u5C16\u7AEF\u4E5F\u8DDF\u7740\u79FB\u52A8\u3002\u539F\u5148\u9001\u6765\u7EA2\u5149\u7684\u6C34\u6EF4\u9000\u4E0B\uFF0C\u65C1\u8FB9\u53E6\u4E00\u6279\u6C34\u6EF4\u63A5\u4E0A\u3002",
      spoken: "\u773C\u775B\u6362\u4E86\u4F4D\u7F6E\uFF0C\u5706\u9525\u7684\u5C16\u7AEF\u4E5F\u8DDF\u7740\u79FB\u52A8\u3002\u539F\u5148\u9001\u6765\u7EA2\u5149\u7684\u6C34\u6EF4\u9000\u4E0B\uFF0C\u65C1\u8FB9\u53E6\u4E00\u6279\u6C34\u6EF4\u63A5\u4E0A\u3002",
      start: 225.28025,
      end: 233.04025,
      duration: 7.76,
      audio: "public/audio/r030.wav",
      audioSHA256: "f6cf088b9a7ac8f7709d645cf451662c7ae77dab97a4e587c7d15bbd9bafe36d"
    },
    {
      id: "r031",
      scene: "observer",
      heading: "\u6C34\u6EF4\u6362\u4E86\u4E00\u6279",
      caption: "\u4E24\u4E2A\u4EBA\u80A9\u5E76\u80A9\uFF0C\u770B\u89C1\u7684\u5F69\u8679\u975E\u5E38\u76F8\u4F3C\u3002\u9001\u8FDB\u5404\u81EA\u773C",
      text: "\u4E24\u4E2A\u4EBA\u80A9\u5E76\u80A9\uFF0C\u770B\u89C1\u7684\u5F69\u8679\u975E\u5E38\u76F8\u4F3C\u3002\u9001\u8FDB\u5404\u81EA\u773C\u775B\u7684\u5149\uFF0C\u5374\u6765\u81EA\u4E0D\u540C\u7684\u6C34\u6EF4\u3002",
      spoken: "\u4E24\u4E2A\u4EBA\u80A9\u5E76\u80A9\uFF0C\u770B\u89C1\u7684\u5F69\u8679\u975E\u5E38\u76F8\u4F3C\u3002\u9001\u8FDB\u5404\u81EA\u773C\u775B\u7684\u5149\uFF0C\u5374\u6765\u81EA\u4E0D\u540C\u7684\u6C34\u6EF4\u3002",
      start: 233.16025,
      end: 240.44025,
      duration: 7.28,
      audio: "public/audio/r031.wav",
      audioSHA256: "45a88ecfd15fbd740080747b5087cbaa6686accecf295e535ea47afea0d79dde"
    },
    {
      id: "r032",
      scene: "observer",
      heading: "\u6C34\u6EF4\u6362\u4E86\u4E00\u6279",
      caption: "\u8FD9\u5C31\u662F\u8FFD\u4E0D\u5230\u5F69\u8679\u7684\u539F\u56E0\u3002\u4F60\u5F80\u524D\u8D70\uFF0C\u6210\u8679\u7684\u6C34\u6EF4",
      text: "\u8FD9\u5C31\u662F\u8FFD\u4E0D\u5230\u5F69\u8679\u7684\u539F\u56E0\u3002\u4F60\u5F80\u524D\u8D70\uFF0C\u6210\u8679\u7684\u6C34\u6EF4\u4E5F\u5728\u6362\u3002\u6240\u8C13\u5F69\u8679\u7684\u5C3D\u5934\uFF0C\u662F\u89C6\u7EBF\u91CC\u7684\u4F4D\u7F6E\u3002",
      spoken: "\u8FD9\u5C31\u662F\u8FFD\u4E0D\u5230\u5F69\u8679\u7684\u539F\u56E0\u3002\u4F60\u5F80\u524D\u8D70\uFF0C\u6210\u8679\u7684\u6C34\u6EF4\u4E5F\u5728\u6362\u3002\u6240\u8C13\u5F69\u8679\u7684\u5C3D\u5934\uFF0C\u662F\u89C6\u7EBF\u91CC\u7684\u4F4D\u7F6E\u3002",
      start: 240.56025,
      end: 249.04025,
      duration: 8.48,
      audio: "public/audio/r032.wav",
      audioSHA256: "a5f7bee2874342b5fd238a42b621217ef5216d9ebd54036699a67b0e74893ce4"
    },
    {
      id: "r033",
      scene: "secondary",
      heading: "\u591A\u4E00\u6B21\u53CD\u5C04",
      caption: "\u6709\u65F6\uFF0C\u5916\u9762\u8FD8\u4F1A\u51FA\u73B0\u4E00\u6761\u66F4\u6DE1\u7684\u5F27\u3002\u4ED4\u7EC6\u770B\uFF0C\u7EA2\u8272",
      text: "\u6709\u65F6\uFF0C\u5916\u9762\u8FD8\u4F1A\u51FA\u73B0\u4E00\u6761\u66F4\u6DE1\u7684\u5F27\u3002\u4ED4\u7EC6\u770B\uFF0C\u7EA2\u8272\u8DD1\u5230\u4E86\u91CC\u9762\uFF0C\u7D2B\u8272\u53CD\u800C\u5728\u5916\u9762\u3002",
      spoken: "\u6709\u65F6\uFF0C\u5916\u9762\u8FD8\u4F1A\u51FA\u73B0\u4E00\u6761\u66F4\u6DE1\u7684\u5F27\u3002\u4ED4\u7EC6\u770B\uFF0C\u7EA2\u8272\u8DD1\u5230\u4E86\u91CC\u9762\uFF0C\u7D2B\u8272\u53CD\u800C\u5728\u5916\u9762\u3002",
      start: 249.16025,
      end: 256.68025,
      duration: 7.52,
      audio: "public/audio/r033.wav",
      audioSHA256: "1d84bf66c17d5ea19d925f745817fd4aa60ffec179b6f81aa06e2a4705b16606"
    },
    {
      id: "r034",
      scene: "secondary",
      heading: "\u591A\u4E00\u6B21\u53CD\u5C04",
      caption: "\u518D\u56DE\u5230\u6C34\u6EF4\u3002\u8FD9\u6B21\u5149\u5728\u91CC\u9762\u56DE\u5934\u4E24\u6B21\uFF0C\u624D\u79BB\u5F00\u3002\u591A",
      text: "\u518D\u56DE\u5230\u6C34\u6EF4\u3002\u8FD9\u6B21\u5149\u5728\u91CC\u9762\u56DE\u5934\u4E24\u6B21\uFF0C\u624D\u79BB\u5F00\u3002\u591A\u4E00\u6B21\u53CD\u5C04\uFF0C\u51FA\u53E3\u7684\u65B9\u5411\u5C31\u53D8\u4E86\u3002",
      spoken: "\u518D\u56DE\u5230\u6C34\u6EF4\u3002\u8FD9\u6B21\u5149\u5728\u91CC\u9762\u56DE\u5934\u4E24\u6B21\uFF0C\u624D\u79BB\u5F00\u3002\u591A\u4E00\u6B21\u53CD\u5C04\uFF0C\u51FA\u53E3\u7684\u65B9\u5411\u5C31\u53D8\u4E86\u3002",
      start: 256.80025,
      end: 264.48025,
      duration: 7.68,
      audio: "public/audio/r034.wav",
      audioSHA256: "c751edf75844a7df55ea3971c91b3a730ae3ec185b0f600b9e93c545f9f36343"
    },
    {
      id: "r035",
      scene: "secondary",
      heading: "\u591A\u4E00\u6B21\u53CD\u5C04",
      caption: "\u526F\u8679\u5927\u7EA6\u5728\u4E94\u5341\u4E00\u5EA6\u9644\u8FD1\uFF0C\u7D2B\u5149\u66F4\u9760\u5916\u3002\u4E8E\u662F\u5B83\u56F4",
      text: "\u526F\u8679\u5927\u7EA6\u5728\u4E94\u5341\u4E00\u5EA6\u9644\u8FD1\uFF0C\u7D2B\u5149\u66F4\u9760\u5916\u3002\u4E8E\u662F\u5B83\u56F4\u5728\u4E3B\u8679\u5916\u9762\uFF0C\u989C\u8272\u987A\u5E8F\u4E5F\u5012\u8FC7\u6765\u3002",
      spoken: "\u526F\u8679\u5927\u7EA6\u5728\u4E94\u5341\u4E00\u5EA6\u9644\u8FD1\uFF0C\u7D2B\u5149\u66F4\u9760\u5916\u3002\u4E8E\u662F\u5B83\u56F4\u5728\u4E3B\u8679\u5916\u9762\uFF0C\u989C\u8272\u987A\u5E8F\u4E5F\u5012\u8FC7\u6765\u3002",
      start: 264.60025,
      end: 271.96025,
      duration: 7.36,
      audio: "public/audio/r035.wav",
      audioSHA256: "da7443e0195d4a722c67746d6d164dc7454ba172ac7ebfb5a3aa8aac6ae67646"
    },
    {
      id: "r036",
      scene: "secondary",
      heading: "\u591A\u4E00\u6B21\u53CD\u5C04",
      caption: "\u6BCF\u6B21\u53CD\u5C04\uFF0C\u90FD\u6709\u4E00\u90E8\u5206\u5149\u79BB\u5F00\u539F\u6765\u7684\u8DEF\u7EBF\u3002\u591A\u7ED5\u4E00",
      text: "\u6BCF\u6B21\u53CD\u5C04\uFF0C\u90FD\u6709\u4E00\u90E8\u5206\u5149\u79BB\u5F00\u539F\u6765\u7684\u8DEF\u7EBF\u3002\u591A\u7ED5\u4E00\u5708\uFF0C\u9001\u5230\u773C\u775B\u91CC\u7684\u5149\u66F4\u5C11\uFF0C\u526F\u8679\u4E5F\u5C31\u663E\u5F97\u6DE1\u3002",
      spoken: "\u6BCF\u6B21\u53CD\u5C04\uFF0C\u90FD\u6709\u4E00\u90E8\u5206\u5149\u79BB\u5F00\u539F\u6765\u7684\u8DEF\u7EBF\u3002\u591A\u7ED5\u4E00\u5708\uFF0C\u9001\u5230\u773C\u775B\u91CC\u7684\u5149\u66F4\u5C11\uFF0C\u526F\u8679\u4E5F\u5C31\u663E\u5F97\u6DE1\u3002",
      start: 272.08025,
      end: 280.64025,
      duration: 8.56,
      audio: "public/audio/r036.wav",
      audioSHA256: "b3d015b5542c87f3ce13cfc3a74f85f28631c5df6643d0e349b846f48c7db620"
    },
    {
      id: "r037",
      scene: "secondary",
      heading: "\u591A\u4E00\u6B21\u53CD\u5C04",
      caption: "\u4E24\u9053\u8679\u4E4B\u95F4\uFF0C\u5149\u7EBF\u6BD4\u8F83\u5C11\u96C6\u4E2D\u5230\u90A3\u91CC\uFF0C\u6240\u4EE5\u5E38\u6709\u4E00",
      text: "\u4E24\u9053\u8679\u4E4B\u95F4\uFF0C\u5149\u7EBF\u6BD4\u8F83\u5C11\u96C6\u4E2D\u5230\u90A3\u91CC\uFF0C\u6240\u4EE5\u5E38\u6709\u4E00\u5708\u504F\u6697\u7684\u5929\u7A7A\u3002\u8FD9\u5C31\u662F\u4E9A\u5386\u5C71\u5927\u6697\u5E26\uFF0C\u5929\u7A7A\u672C\u8EAB\u7684\u6563\u5C04\u5149\u4ECD\u5728\u3002",
      spoken: "\u4E24\u9053\u8679\u4E4B\u95F4\uFF0C\u5149\u7EBF\u6BD4\u8F83\u5C11\u96C6\u4E2D\u5230\u90A3\u91CC\uFF0C\u6240\u4EE5\u5E38\u6709\u4E00\u5708\u504F\u6697\u7684\u5929\u7A7A\u3002\u8FD9\u5C31\u662F\u4E9A\u5386\u5C71\u5927\u6697\u5E26\uFF0C\u5929\u7A7A\u672C\u8EAB\u7684\u6563\u5C04\u5149\u4ECD\u5728\u3002",
      start: 280.76025,
      end: 290.36025,
      duration: 9.6,
      audio: "public/audio/r037.wav",
      audioSHA256: "60d3d27b061ed1a61ab8b56d108eae536b8b95700bc5a4924503c1a96a84437d"
    },
    {
      id: "r038",
      scene: "return",
      heading: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE",
      caption: "\u4E0D\u5FC5\u7B49\u4E0B\u4E00\u573A\u96E8\u3002\u6674\u5929\u7684\u55B7\u6CC9\uFF0C\u6216\u8005\u6D12\u6C34\u65F6\u5F62\u6210\u7684",
      text: "\u4E0D\u5FC5\u7B49\u4E0B\u4E00\u573A\u96E8\u3002\u6674\u5929\u7684\u55B7\u6CC9\uFF0C\u6216\u8005\u6D12\u6C34\u65F6\u5F62\u6210\u7684\u7EC6\u6C34\u96FE\uFF0C\u5C31\u80FD\u505A\u4E00\u6B21\u5C0F\u5B9E\u9A8C\u3002",
      spoken: "\u4E0D\u5FC5\u7B49\u4E0B\u4E00\u573A\u96E8\u3002\u6674\u5929\u7684\u55B7\u6CC9\uFF0C\u6216\u8005\u6D12\u6C34\u65F6\u5F62\u6210\u7684\u7EC6\u6C34\u96FE\uFF0C\u5C31\u80FD\u505A\u4E00\u6B21\u5C0F\u5B9E\u9A8C\u3002",
      start: 290.48025,
      end: 297.680292,
      duration: 7.200042,
      audio: "public/audio/r038.wav",
      audioSHA256: "68576c719547cac3fec14a5d08a0f288407916e17e22028884ae8a4d33d671b2"
    },
    {
      id: "r039",
      scene: "return",
      heading: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE",
      caption: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE\uFF0C\u6162\u6162\u8C03\u6574\u4F4D\u7F6E\u3002\u5408\u9002\u7684\u89D2\u5EA6",
      text: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE\uFF0C\u6162\u6162\u8C03\u6574\u4F4D\u7F6E\u3002\u5408\u9002\u7684\u89D2\u5EA6\u4E00\u5230\uFF0C\u51E0\u6EF4\u666E\u901A\u7684\u6C34\uFF0C\u5C31\u80FD\u4EAE\u51FA\u4E00\u5C0F\u6BB5\u5F69\u8679\u3002",
      spoken: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE\uFF0C\u6162\u6162\u8C03\u6574\u4F4D\u7F6E\u3002\u5408\u9002\u7684\u89D2\u5EA6\u4E00\u5230\uFF0C\u51E0\u6EF4\u666E\u901A\u7684\u6C34\uFF0C\u5C31\u80FD\u4EAE\u51FA\u4E00\u5C0F\u6BB5\u5F69\u8679\u3002",
      start: 297.800292,
      end: 306.520333,
      duration: 8.720042,
      audio: "public/audio/r039.wav",
      audioSHA256: "306aa6dc60194cd4b38b0a09a1202fafee4fb00d210fea0f548ab3881150c2ea"
    },
    {
      id: "r041",
      scene: "return",
      heading: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE",
      caption: "\u4E0B\u6B21\u96E8\u540E\u62AC\u5934\uFF0C\u4F60\u53EF\u4EE5\u8BD5\u7740\u627E\u51FA\u592A\u9633\u3001\u5F71\u5B50\u548C\u96E8\u5E55",
      text: "\u4E0B\u6B21\u96E8\u540E\u62AC\u5934\uFF0C\u4F60\u53EF\u4EE5\u8BD5\u7740\u627E\u51FA\u592A\u9633\u3001\u5F71\u5B50\u548C\u96E8\u5E55\u3002\u90A3\u9053\u5F2F\u5F2F\u7684\u5F69\u8679\uFF0C\u662F\u5149\u548C\u4F60\u5171\u540C\u753B\u51FA\u7684\u5706\u3002",
      spoken: "\u4E0B\u6B21\u96E8\u540E\u62AC\u5934\uFF0C\u4F60\u53EF\u4EE5\u8BD5\u7740\u627E\u51FA\u592A\u9633\u3001\u5F71\u5B50\u548C\u96E8\u5E55\u3002\u90A3\u9053\u5F2F\u5F2F\u7684\u5F69\u8679\uFF0C\u662F\u5149\u548C\u4F60\u5171\u540C\u753B\u51FA\u7684\u5706\u3002",
      start: 306.640333,
      end: 315.440333,
      duration: 8.8,
      audio: "public/audio/r041.wav",
      audioSHA256: "eda44fed99fee8a7e6b4d88847cfe50e1271ce31e4885240fec56c44e10366d5"
    }
  ],
  captions: [
    {
      start: 0,
      end: 0.97,
      text: "\u96E8\u521A\u505C\uFF0C",
      clipId: "r001"
    },
    {
      start: 1.28,
      end: 2.53,
      text: "\u8DEF\u4E0A\u8FD8\u6CDB\u7740\u6C34\u5149\u3002",
      clipId: "r001"
    },
    {
      start: 2.76,
      end: 4.57,
      text: "\u4E00\u9053\u5F69\u8679\u843D\u5728\u8857\u9053\u5C3D\u5934\u3002",
      clipId: "r001"
    },
    {
      start: 4.86,
      end: 6.64,
      text: "\u4F60\u6709\u6CA1\u6709\u60F3\u8FC7\uFF0C\u8D70\u5230\u90A3\u91CC\uFF0C",
      clipId: "r001"
    },
    {
      start: 6.64,
      end: 7.87,
      text: "\u80FD\u6478\u5230\u5F69\u8679\u5417\uFF1F",
      clipId: "r001"
    },
    {
      start: 8.6,
      end: 9.95,
      text: "\u5F80\u524D\u8D70\u51E0\u6B65\uFF0C",
      clipId: "r002"
    },
    {
      start: 10.16,
      end: 11.21,
      text: "\u5B83\u8FD8\u5728\u8FDC\u5904\u3002",
      clipId: "r002"
    },
    {
      start: 11.58,
      end: 12.57,
      text: "\u660E\u660E\u50CF\u4E00\u5EA7\u6865\uFF0C",
      clipId: "r002"
    },
    {
      start: 12.92,
      end: 14.39,
      text: "\u5374\u59CB\u7EC8\u627E\u4E0D\u5230\u6865\u811A\u3002",
      clipId: "r002"
    },
    {
      start: 14.78,
      end: 15.45,
      text: "\u8FD8\u6709\u4E2A\u95EE\u9898\uFF0C",
      clipId: "r002"
    },
    {
      start: 15.78,
      end: 17.01,
      text: "\u5B83\u4E3A\u4EC0\u4E48\u603B\u662F\u5F2F\u7684\uFF1F",
      clipId: "r002"
    },
    {
      start: 17.6,
      end: 18.39,
      text: "\u56DE\u5934\u770B\u770B\uFF0C",
      clipId: "r003"
    },
    {
      start: 18.74,
      end: 19.69,
      text: "\u592A\u9633\u5728\u80CC\u540E\uFF1B",
      clipId: "r003"
    },
    {
      start: 19.94,
      end: 20.97,
      text: "\u524D\u65B9\u7684\u5929\u7A7A\u91CC\uFF0C",
      clipId: "r003"
    },
    {
      start: 21.26,
      end: 21.99,
      text: "\u8FD8\u6709\u4E00\u7247\u96E8\u3002",
      clipId: "r003"
    },
    {
      start: 22.3,
      end: 23.53,
      text: "\u9633\u5149\u3001\u6C34\u6EF4\uFF0C",
      clipId: "r003"
    },
    {
      start: 23.82,
      end: 25.11,
      text: "\u518D\u52A0\u4E0A\u4F60\u7AD9\u7684\u4F4D\u7F6E\uFF0C",
      clipId: "r003"
    },
    {
      start: 25.34,
      end: 26.39,
      text: "\u7B54\u6848\u5C31\u85CF\u5728\u8FD9\u91CC\u3002",
      clipId: "r003"
    },
    {
      start: 27.08,
      end: 28.54,
      text: "\u6211\u4EEC\u4ECE\u8FD9\u7247\u96E8\u91CC\uFF0C",
      clipId: "r004"
    },
    {
      start: 28.54,
      end: 29.73,
      text: "\u6311\u51FA\u4E00\u6EF4\u6C34\u3002",
      clipId: "r004"
    },
    {
      start: 29.94,
      end: 31.61,
      text: "\u5929\u7A7A\u90A3\u4E48\u5927\u7684\u4E00\u9053\u5F69\u8679\uFF0C",
      clipId: "r004"
    },
    {
      start: 31.78,
      end: 33.29,
      text: "\u8981\u4ECE\u8FD9\u4E2A\u5C0F\u5730\u65B9\u8BF4\u8D77\u3002",
      clipId: "r004"
    },
    {
      start: 33.92,
      end: 35.25,
      text: "\u5F88\u5C0F\u7684\u96E8\u6EF4\uFF0C",
      clipId: "r005"
    },
    {
      start: 35.54,
      end: 37.07,
      text: "\u5F62\u72B6\u63A5\u8FD1\u4E00\u4E2A\u5706\u7403\u3002",
      clipId: "r005"
    },
    {
      start: 37.4,
      end: 38.41,
      text: "\u9633\u5149\u78B0\u5230\u5B83\uFF0C",
      clipId: "r005"
    },
    {
      start: 38.7,
      end: 40.49,
      text: "\u5148\u7ECF\u8FC7\u7A7A\u6C14\u548C\u6C34\u7684\u4EA4\u754C\u3002",
      clipId: "r005"
    },
    {
      start: 41.16,
      end: 42.97,
      text: "\u5149\u5728\u6C34\u91CC\u4F20\u64AD\u5F97\u6162\u4E00\u4E9B\uFF0C",
      clipId: "r006"
    },
    {
      start: 43.34,
      end: 44.23,
      text: "\u659C\u7740\u8FDB\u5165\u65F6\uFF0C",
      clipId: "r006"
    },
    {
      start: 44.38,
      end: 45.59,
      text: "\u65B9\u5411\u4E5F\u4F1A\u8F6C\u5F2F\u3002",
      clipId: "r006"
    },
    {
      start: 45.82,
      end: 46.79,
      text: "\u8FD9\u5C31\u53EB\u6298\u5C04\u3002",
      clipId: "r006"
    },
    {
      start: 47.28,
      end: 48.83,
      text: "\u628A\u7B77\u5B50\u653E\u8FDB\u6C34\u676F\uFF0C",
      clipId: "r007"
    },
    {
      start: 49.1,
      end: 50.27,
      text: "\u770B\u7740\u50CF\u6298\u4E86\u4E00\u4E0B\uFF0C",
      clipId: "r007"
    },
    {
      start: 50.46,
      end: 51.63,
      text: "\u4E5F\u662F\u540C\u6837\u7684\u9053\u7406\u3002",
      clipId: "r007"
    },
    {
      start: 51.88,
      end: 53.23,
      text: "\u6C34\u6CA1\u6709\u628A\u7B77\u5B50\u6298\u65AD\uFF0C",
      clipId: "r007"
    },
    {
      start: 53.4,
      end: 55.43,
      text: "\u8F6C\u5F2F\u7684\u662F\u6765\u5230\u773C\u775B\u91CC\u7684\u5149\u3002",
      clipId: "r007"
    },
    {
      start: 56.04,
      end: 57.69,
      text: "\u4E00\u6EF4\u6C34\u7684\u8868\u9762\u662F\u5F2F\u7684\u3002",
      clipId: "r008"
    },
    {
      start: 57.92,
      end: 59.35,
      text: "\u5149\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u53BB\uFF0C",
      clipId: "r008"
    },
    {
      start: 59.48,
      end: 60.87,
      text: "\u5C31\u4F1A\u8D70\u4E0A\u4E0D\u540C\u7684\u8DEF\u7EBF\u3002",
      clipId: "r008"
    },
    {
      start: 61.1,
      end: 62.33,
      text: "\u6211\u4EEC\u8DDF\u4F4F\u5176\u4E2D\u4E00\u6761\u3002",
      clipId: "r008"
    },
    {
      start: 62.72,
      end: 64.45,
      text: "\u9633\u5149\u770B\u8D77\u6765\u662F\u767D\u8272\uFF0C",
      clipId: "r009"
    },
    {
      start: 64.7,
      end: 66.49,
      text: "\u91CC\u9762\u5374\u6DF7\u7740\u4E00\u6574\u6BB5\u989C\u8272\u3002",
      clipId: "r009"
    },
    {
      start: 66.82,
      end: 67.81,
      text: "\u8FDB\u5165\u6C34\u6EF4\u65F6\uFF0C",
      clipId: "r009"
    },
    {
      start: 68.04,
      end: 70.09,
      text: "\u5404\u79CD\u989C\u8272\u8F6C\u5F2F\u7684\u7A0B\u5EA6\u7565\u6709\u4E0D\u540C\u3002",
      clipId: "r009"
    },
    {
      start: 70.6,
      end: 72.07,
      text: "\u7EA2\u5149\u62D0\u5F97\u5C11\u4E00\u70B9\uFF0C",
      clipId: "r010"
    },
    {
      start: 72.36,
      end: 73.59,
      text: "\u7D2B\u5149\u62D0\u5F97\u591A\u4E00\u70B9\u3002",
      clipId: "r010"
    },
    {
      start: 73.92,
      end: 75.26,
      text: "\u539F\u672C\u6324\u5728\u4E00\u8D77\u7684\u989C\u8272\uFF0C",
      clipId: "r010"
    },
    {
      start: 75.26,
      end: 76.63,
      text: "\u5F00\u59CB\u6162\u6162\u5206\u5F00\u3002",
      clipId: "r010"
    },
    {
      start: 77.200042,
      end: 80.570042,
      text: "\u4E2D\u95F4\u8FD8\u6709\u6A59\u3001\u9EC4\u3001\u7EFF\u3001\u84DD\uFF0C",
      clipId: "r011"
    },
    {
      start: 80.840042,
      end: 81.930042,
      text: "\u4E00\u79CD\u63A5\u7740\u4E00\u79CD\u3002",
      clipId: "r011"
    },
    {
      start: 82.200042,
      end: 83.305042,
      text: "\u6C34\u6EF4\u505A\u7684\u4E8B\uFF0C",
      clipId: "r011"
    },
    {
      start: 83.400042,
      end: 85.550042,
      text: "\u662F\u628A\u767D\u5149\u91CC\u539F\u6709\u7684\u989C\u8272\u5C55\u5F00\u3002",
      clipId: "r011"
    },
    {
      start: 86.360083,
      end: 88.350083,
      text: "\u989C\u8272\u4E4B\u95F4\u4E00\u76F4\u5728\u8FC7\u6E21\u3002",
      clipId: "r012"
    },
    {
      start: 88.480083,
      end: 89.660083,
      text: "\u6211\u4EEC\u5E38\u8BF4\u7684\u4E03\u8272\uFF0C",
      clipId: "r012"
    },
    {
      start: 89.660083,
      end: 91.290083,
      text: "\u662F\u65B9\u4FBF\u8BB0\u5FC6\u7684\u540D\u5B57\uFF0C",
      clipId: "r012"
    },
    {
      start: 91.480083,
      end: 93.210083,
      text: "\u771F\u5B9E\u7684\u5149\u8C31\u8FDE\u6210\u4E00\u7247\u3002",
      clipId: "r012"
    },
    {
      start: 93.680125,
      end: 94.690125,
      text: "\u7EE7\u7EED\u5F80\u91CC\u8D70\u3002",
      clipId: "r013"
    },
    {
      start: 95.060125,
      end: 96.750125,
      text: "\u5149\u5230\u8FBE\u6C34\u6EF4\u7684\u53E6\u4E00\u9762\uFF0C",
      clipId: "r013"
    },
    {
      start: 96.980125,
      end: 98.030125,
      text: "\u6709\u4E00\u90E8\u5206\u7A7F\u51FA\u53BB\uFF0C",
      clipId: "r013"
    },
    {
      start: 98.280125,
      end: 100.970125,
      text: "\u8FD8\u6709\u4E00\u90E8\u5206\u5728\u6C34\u91CC\u53CD\u5C04\uFF0C\u56DE\u8FC7\u5934\u6765\u3002",
      clipId: "r013"
    },
    {
      start: 101.640125,
      end: 104.520125,
      text: "\u8FD9\u4E00\u90E8\u5206\u5149\u518D\u6B21\u8D70\u5230\u6C34\u548C\u7A7A\u6C14\u7684\u4EA4\u754C\uFF0C",
      clipId: "r014"
    },
    {
      start: 104.520125,
      end: 106.240125,
      text: "\u51FA\u95E8\u65F6\u53C8\u6298\u5C04\u4E00\u6B21\u3002",
      clipId: "r014"
    },
    {
      start: 106.240125,
      end: 109.210125,
      text: "\u5B83\u5DF2\u7ECF\u671D\u7740\u9633\u5149\u6765\u65F6\u7684\u90A3\u4E00\u4FA7\u8FD4\u56DE\u3002",
      clipId: "r014"
    },
    {
      start: 109.920125,
      end: 111.290125,
      text: "\u8FDB\u95E8\u8F6C\u4E00\u6B21\u5F2F\uFF0C",
      clipId: "r015"
    },
    {
      start: 111.560125,
      end: 112.570125,
      text: "\u91CC\u9762\u56DE\u4E00\u6B21\u5934\uFF0C",
      clipId: "r015"
    },
    {
      start: 112.880125,
      end: 115.020125,
      text: "\u51FA\u95E8\u518D\u8F6C\u4E00\u6B21\u5F2F\u3002\u8FD9\u6761\u8DEF\u7EBF\uFF0C",
      clipId: "r015"
    },
    {
      start: 115.020125,
      end: 116.490125,
      text: "\u5C31\u662F\u6700\u5E38\u89C1\u7684\u4E3B\u8679\u3002",
      clipId: "r015"
    },
    {
      start: 117.240167,
      end: 120.560167,
      text: "\u8BA9\u66F4\u591A\u5149\u7EBF\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u5165\u3002\u4F60\u4F1A\u53D1\u73B0\uFF0C",
      clipId: "r017"
    },
    {
      start: 120.560167,
      end: 123.200167,
      text: "\u8BB8\u591A\u51FA\u5C04\u5149\u6324\u5728\u76F8\u8FD1\u7684\u89D2\u5EA6\uFF0C",
      clipId: "r017"
    },
    {
      start: 123.200167,
      end: 125.090167,
      text: "\u5F62\u6210\u4E00\u5904\u660E\u4EAE\u7684\u96C6\u4E2D\u3002",
      clipId: "r017"
    },
    {
      start: 125.840167,
      end: 127.240167,
      text: "\u7EA2\u5149\u6700\u4EAE\u7684\u65B9\u5411\uFF0C",
      clipId: "r018"
    },
    {
      start: 127.240167,
      end: 128.650167,
      text: "\u5927\u7EA6\u5728\u56DB\u5341\u4E8C\u5EA6\uFF1B",
      clipId: "r018"
    },
    {
      start: 129.140167,
      end: 130.610167,
      text: "\u7D2B\u5149\u5927\u7EA6\u56DB\u5341\u5EA6\u3002",
      clipId: "r018"
    },
    {
      start: 130.860167,
      end: 132.160167,
      text: "\u5DEE\u51FA\u6765\u7684\u8FD9\u70B9\u89D2\u5EA6\uFF0C",
      clipId: "r018"
    },
    {
      start: 132.160167,
      end: 134.170167,
      text: "\u628A\u5F69\u8272\u7684\u8FB9\u7F18\u62C9\u5F00\u4E86\u3002",
      clipId: "r018"
    },
    {
      start: 134.840167,
      end: 135.740167,
      text: "\u8FD9\u4E24\u4E2A\u89D2\uFF0C",
      clipId: "r019"
    },
    {
      start: 135.740167,
      end: 138.680167,
      text: "\u662F\u5BF9\u7740\u54EA\u91CC\u91CF\u7684\u5462\uFF1F\u4ECE\u592A\u9633\uFF0C",
      clipId: "r019"
    },
    {
      start: 138.680167,
      end: 140.150167,
      text: "\u7ECF\u8FC7\u4F60\u7684\u773C\u775B\uFF0C",
      clipId: "r019"
    },
    {
      start: 140.220167,
      end: 141.190167,
      text: "\u518D\u5411\u524D\u5EF6\u4F38\uFF0C",
      clipId: "r019"
    },
    {
      start: 141.420167,
      end: 142.970167,
      text: "\u5C31\u662F\u80CC\u5411\u592A\u9633\u7684\u65B9\u5411\u3002",
      clipId: "r019"
    },
    {
      start: 143.600167,
      end: 145.430167,
      text: "\u4F60\u7684\u5F71\u5B50\u4E5F\u6307\u5411\u90A3\u8FB9\u3002",
      clipId: "r020"
    },
    {
      start: 145.620167,
      end: 146.970167,
      text: "\u4EE5\u8FD9\u6761\u65B9\u5411\u4E3A\u4E2D\u5FC3\uFF0C",
      clipId: "r020"
    },
    {
      start: 147.140167,
      end: 148.450167,
      text: "\u5F80\u5916\u504F\u56DB\u5341\u4E8C\u5EA6\uFF0C",
      clipId: "r020"
    },
    {
      start: 148.660167,
      end: 150.470167,
      text: "\u5C31\u627E\u5230\u4E86\u4E3B\u8679\u7684\u7EA2\u8272\u5916\u7F18\u3002",
      clipId: "r020"
    },
    {
      start: 151.320167,
      end: 152.560167,
      text: "\u73B0\u5728\u628A\u4E00\u6EF4\u6C34\uFF0C",
      clipId: "r021"
    },
    {
      start: 152.560167,
      end: 154.010167,
      text: "\u6362\u6210\u4E00\u6574\u7247\u96E8\u3002",
      clipId: "r021"
    },
    {
      start: 154.200167,
      end: 156.260167,
      text: "\u80FD\u628A\u7EA2\u5149\u9001\u8FDB\u4F60\u773C\u775B\u7684\u6C34\u6EF4\uFF0C",
      clipId: "r021"
    },
    {
      start: 156.260167,
      end: 157.850167,
      text: "\u90FD\u843D\u5728\u8FD9\u7EC4\u65B9\u5411\u4E0A\u3002",
      clipId: "r021"
    },
    {
      start: 158.160167,
      end: 160.330167,
      text: "\u671D\u4E0A\u3001\u671D\u5DE6\u3001\u671D\u53F3\uFF0C",
      clipId: "r022"
    },
    {
      start: 160.680167,
      end: 162.850167,
      text: "\u53EA\u8981\u548C\u4E2D\u5FC3\u7EBF\u4FDD\u6301\u540C\u6837\u7684\u89D2\u5EA6\uFF0C",
      clipId: "r022"
    },
    {
      start: 163.000167,
      end: 165.430167,
      text: "\u90FD\u6709\u673A\u4F1A\u51FA\u73B0\u7EA2\u5149\u3002\u7ED5\u4E00\u5708\uFF0C",
      clipId: "r022"
    },
    {
      start: 165.660167,
      end: 166.770167,
      text: "\u5C31\u56F4\u51FA\u4E00\u4E2A\u5706\u9525\u3002",
      clipId: "r022"
    },
    {
      start: 167.240208,
      end: 168.850208,
      text: "\u4F60\u7684\u773C\u775B\u5728\u5C16\u7AEF\u3002",
      clipId: "r023"
    },
    {
      start: 169.120208,
      end: 170.590208,
      text: "\u90A3\u4E9B\u6C34\u6EF4\u53EF\u4EE5\u5F88\u8FD1\uFF0C",
      clipId: "r023"
    },
    {
      start: 170.880208,
      end: 172.690208,
      text: "\u4E5F\u53EF\u4EE5\u5F88\u8FDC\uFF0C\u91CD\u8981\u7684\u662F\uFF0C",
      clipId: "r023"
    },
    {
      start: 173.020208,
      end: 174.870208,
      text: "\u5B83\u4EEC\u6709\u6CA1\u6709\u843D\u5728\u5408\u9002\u7684\u65B9\u5411\u3002",
      clipId: "r023"
    },
    {
      start: 175.280208,
      end: 176.810208,
      text: "\u4ECE\u5C16\u7AEF\u671B\u51FA\u53BB\uFF0C",
      clipId: "r024"
    },
    {
      start: 177.160208,
      end: 180.830208,
      text: "\u8FD9\u4E9B\u65B9\u5411\u56F4\u6210\u4E00\u4E2A\u5706\u3002\u7EA2\u8272\u5728\u5916\uFF0C\u7D2B\u8272\u5728\u5185\u3002",
      clipId: "r024"
    },
    {
      start: 181.140208,
      end: 183.550208,
      text: "\u539F\u6765\u5F69\u8679\u7684\u5B8C\u6574\u5F62\u72B6\uFF0C\u662F\u5706\u7684\u3002",
      clipId: "r024"
    },
    {
      start: 184.200208,
      end: 185.650208,
      text: "\u6211\u4EEC\u7AD9\u5728\u5730\u9762\u4E0A\uFF0C",
      clipId: "r025"
    },
    {
      start: 185.840208,
      end: 187.930208,
      text: "\u5F80\u4E0B\u770B\u7684\u65B9\u5411\u88AB\u5730\u9762\u6321\u4F4F\uFF0C",
      clipId: "r025"
    },
    {
      start: 188.180208,
      end: 191.010208,
      text: "\u4E0B\u9762\u4E5F\u5E38\u5E38\u7F3A\u5C11\u88AB\u9633\u5149\u7167\u5230\u7684\u96E8\u6EF4\u3002",
      clipId: "r025"
    },
    {
      start: 191.320208,
      end: 193.190208,
      text: "\u4E8E\u662F\u53EA\u5269\u5929\u7A7A\u91CC\u7684\u8FD9\u4E00\u6BB5\u5F27\u3002",
      clipId: "r025"
    },
    {
      start: 194.000208,
      end: 195.726875,
      text: "\u592A\u9633\u8D34\u8FD1\u5730\u5E73\u7EBF\u65F6\uFF0C",
      clipId: "r026"
    },
    {
      start: 195.726875,
      end: 197.490208,
      text: "\u5706\u5FC3\u4E5F\u63A5\u8FD1\u5730\u5E73\u7EBF\uFF0C",
      clipId: "r026"
    },
    {
      start: 197.740208,
      end: 201.690208,
      text: "\u5F69\u8679\u80FD\u9732\u51FA\u8F83\u957F\u7684\u4E00\u6BB5\u3002\u592A\u9633\u5347\u9AD8\uFF0C\u5706\u5FC3\u4E0B\u6C89\uFF0C",
      clipId: "r026"
    },
    {
      start: 201.940208,
      end: 203.230208,
      text: "\u9732\u51FA\u7684\u5F27\u5C31\u77ED\u4E86\u3002",
      clipId: "r026"
    },
    {
      start: 203.800208,
      end: 205.670208,
      text: "\u98DE\u673A\u65C1\u3001\u7011\u5E03\u4E0A\u65B9\uFF0C",
      clipId: "r027"
    },
    {
      start: 205.920208,
      end: 207.110208,
      text: "\u6709\u65F6\u80FD\u770B\u89C1\u6574\u5706\u3002",
      clipId: "r027"
    },
    {
      start: 207.420208,
      end: 209.925208,
      text: "\u6761\u4EF6\u662F\u811A\u4E0B\u4E5F\u6709\u9633\u5149\u7167\u4EAE\u7684\u6C34\u96FE\uFF0C",
      clipId: "r027"
    },
    {
      start: 210.060208,
      end: 211.410208,
      text: "\u800C\u4E14\u89C6\u91CE\u8DB3\u591F\u5F00\u9614\u3002",
      clipId: "r027"
    },
    {
      start: 212.160208,
      end: 212.806875,
      text: "\u6240\u4EE5\uFF0C",
      clipId: "r028"
    },
    {
      start: 212.806875,
      end: 215.550208,
      text: "\u5F27\u5F62\u6765\u81EA\u6211\u4EEC\u7684\u4F4D\u7F6E\u548C\u5730\u9762\u7684\u906E\u6321\u3002",
      clipId: "r028"
    },
    {
      start: 215.820208,
      end: 216.770208,
      text: "\u6362\u4E00\u4E2A\u89C6\u91CE\uFF0C",
      clipId: "r028"
    },
    {
      start: 217.020208,
      end: 217.940208,
      text: "\u85CF\u8D77\u6765\u7684\u90A3\u4E00\u6BB5\uFF0C",
      clipId: "r028"
    },
    {
      start: 217.940208,
      end: 219.370208,
      text: "\u4E5F\u53EF\u80FD\u91CD\u65B0\u51FA\u73B0\u3002",
      clipId: "r028"
    },
    {
      start: 219.72025,
      end: 221.81025,
      text: "\u8FD8\u8BB0\u5F97\u5F00\u5934\u90A3\u5EA7\u8FFD\u4E0D\u5230\u7684\u6865\u5417\uFF1F",
      clipId: "r029"
    },
    {
      start: 222.00025,
      end: 223.06025,
      text: "\u8BA9\u6211\u4EEC\u6A2A\u7740\u8D70\u51E0\u6B65\uFF0C",
      clipId: "r029"
    },
    {
      start: 223.06025,
      end: 224.49025,
      text: "\u770B\u770B\u4F1A\u53D1\u751F\u4EC0\u4E48\u3002",
      clipId: "r029"
    },
    {
      start: 225.28025,
      end: 226.65025,
      text: "\u773C\u775B\u6362\u4E86\u4F4D\u7F6E\uFF0C",
      clipId: "r030"
    },
    {
      start: 226.90025,
      end: 228.67025,
      text: "\u5706\u9525\u7684\u5C16\u7AEF\u4E5F\u8DDF\u7740\u79FB\u52A8\u3002",
      clipId: "r030"
    },
    {
      start: 228.70025,
      end: 231.03025,
      text: "\u539F\u5148\u9001\u6765\u7EA2\u5149\u7684\u6C34\u6EF4\u9000\u4E0B\uFF0C",
      clipId: "r030"
    },
    {
      start: 231.22025,
      end: 232.83025,
      text: "\u65C1\u8FB9\u53E6\u4E00\u6279\u6C34\u6EF4\u63A5\u4E0A\u3002",
      clipId: "r030"
    },
    {
      start: 233.16025,
      end: 234.65025,
      text: "\u4E24\u4E2A\u4EBA\u80A9\u5E76\u80A9\uFF0C",
      clipId: "r031"
    },
    {
      start: 234.88025,
      end: 236.61025,
      text: "\u770B\u89C1\u7684\u5F69\u8679\u975E\u5E38\u76F8\u4F3C\u3002",
      clipId: "r031"
    },
    {
      start: 236.82025,
      end: 238.18025,
      text: "\u9001\u8FDB\u5404\u81EA\u773C\u775B\u7684\u5149\uFF0C",
      clipId: "r031"
    },
    {
      start: 238.18025,
      end: 239.85025,
      text: "\u5374\u6765\u81EA\u4E0D\u540C\u7684\u6C34\u6EF4\u3002",
      clipId: "r031"
    },
    {
      start: 240.56025,
      end: 243.81025,
      text: "\u8FD9\u5C31\u662F\u8FFD\u4E0D\u5230\u5F69\u8679\u7684\u539F\u56E0\u3002\u4F60\u5F80\u524D\u8D70\uFF0C",
      clipId: "r032"
    },
    {
      start: 244.04025,
      end: 245.55025,
      text: "\u6210\u8679\u7684\u6C34\u6EF4\u4E5F\u5728\u6362\u3002",
      clipId: "r032"
    },
    {
      start: 245.94025,
      end: 247.06025,
      text: "\u6240\u8C13\u5F69\u8679\u7684\u5C3D\u5934\uFF0C",
      clipId: "r032"
    },
    {
      start: 247.06025,
      end: 248.55025,
      text: "\u662F\u89C6\u7EBF\u91CC\u7684\u4F4D\u7F6E\u3002",
      clipId: "r032"
    },
    {
      start: 249.16025,
      end: 250.03025,
      text: "\u6709\u65F6\uFF0C",
      clipId: "r033"
    },
    {
      start: 250.22025,
      end: 253.09025,
      text: "\u5916\u9762\u8FD8\u4F1A\u51FA\u73B0\u4E00\u6761\u66F4\u6DE1\u7684\u5F27\u3002\u4ED4\u7EC6\u770B\uFF0C",
      clipId: "r033"
    },
    {
      start: 253.36025,
      end: 254.57025,
      text: "\u7EA2\u8272\u8DD1\u5230\u4E86\u91CC\u9762\uFF0C",
      clipId: "r033"
    },
    {
      start: 254.70025,
      end: 256.29025,
      text: "\u7D2B\u8272\u53CD\u800C\u5728\u5916\u9762\u3002",
      clipId: "r033"
    },
    {
      start: 256.80025,
      end: 258.11025,
      text: "\u518D\u56DE\u5230\u6C34\u6EF4\u3002",
      clipId: "r034"
    },
    {
      start: 258.44025,
      end: 261.07025,
      text: "\u8FD9\u6B21\u5149\u5728\u91CC\u9762\u56DE\u5934\u4E24\u6B21\uFF0C\u624D\u79BB\u5F00\u3002",
      clipId: "r034"
    },
    {
      start: 261.28025,
      end: 262.29025,
      text: "\u591A\u4E00\u6B21\u53CD\u5C04\uFF0C",
      clipId: "r034"
    },
    {
      start: 262.50025,
      end: 264.01025,
      text: "\u51FA\u53E3\u7684\u65B9\u5411\u5C31\u53D8\u4E86\u3002",
      clipId: "r034"
    },
    {
      start: 265.36025,
      end: 266.85025,
      text: "\u526F\u8679\u5927\u7EA6\u5728\u4E94\u5341\u4E00\u5EA6\u9644\u8FD1\uFF0C",
      clipId: "r035"
    },
    {
      start: 267.18025,
      end: 268.23025,
      text: "\u7D2B\u5149\u66F4\u9760\u5916\u3002",
      clipId: "r035"
    },
    {
      start: 268.52025,
      end: 270.19025,
      text: "\u4E8E\u662F\u5B83\u56F4\u5728\u4E3B\u8679\u5916\u9762\uFF0C",
      clipId: "r035"
    },
    {
      start: 270.34025,
      end: 271.75025,
      text: "\u989C\u8272\u987A\u5E8F\u4E5F\u5012\u8FC7\u6765\u3002",
      clipId: "r035"
    },
    {
      start: 272.08025,
      end: 273.12025,
      text: "\u6BCF\u6B21\u53CD\u5C04\uFF0C",
      clipId: "r036"
    },
    {
      start: 273.12025,
      end: 276.57025,
      text: "\u90FD\u6709\u4E00\u90E8\u5206\u5149\u79BB\u5F00\u539F\u6765\u7684\u8DEF\u7EBF\u3002\u591A\u7ED5\u4E00\u5708\uFF0C",
      clipId: "r036"
    },
    {
      start: 276.80025,
      end: 278.513583,
      text: "\u9001\u5230\u773C\u775B\u91CC\u7684\u5149\u66F4\u5C11\uFF0C",
      clipId: "r036"
    },
    {
      start: 278.513583,
      end: 280.09025,
      text: "\u526F\u8679\u4E5F\u5C31\u663E\u5F97\u6DE1\u3002",
      clipId: "r036"
    },
    {
      start: 280.76025,
      end: 281.85025,
      text: "\u4E24\u9053\u8679\u4E4B\u95F4\uFF0C",
      clipId: "r037"
    },
    {
      start: 282.12025,
      end: 284.01025,
      text: "\u5149\u7EBF\u6BD4\u8F83\u5C11\u96C6\u4E2D\u5230\u90A3\u91CC\uFF0C",
      clipId: "r037"
    },
    {
      start: 284.20025,
      end: 286.25025,
      text: "\u6240\u4EE5\u5E38\u6709\u4E00\u5708\u504F\u6697\u7684\u5929\u7A7A\u3002",
      clipId: "r037"
    },
    {
      start: 286.68025,
      end: 288.25025,
      text: "\u8FD9\u5C31\u662F\u4E9A\u5386\u5C71\u5927\u6697\u5E26\uFF0C",
      clipId: "r037"
    },
    {
      start: 288.48025,
      end: 290.29025,
      text: "\u5929\u7A7A\u672C\u8EAB\u7684\u6563\u5C04\u5149\u4ECD\u5728\u3002",
      clipId: "r037"
    },
    {
      start: 290.48025,
      end: 292.17025,
      text: "\u4E0D\u5FC5\u7B49\u4E0B\u4E00\u573A\u96E8\u3002",
      clipId: "r038"
    },
    {
      start: 292.54025,
      end: 293.34025,
      text: "\u6674\u5929\u7684\u55B7\u6CC9\uFF0C",
      clipId: "r038"
    },
    {
      start: 293.34025,
      end: 295.92025,
      text: "\u6216\u8005\u6D12\u6C34\u65F6\u5F62\u6210\u7684\u7EC6\u6C34\u96FE\uFF0C",
      clipId: "r038"
    },
    {
      start: 295.92025,
      end: 297.53025,
      text: "\u5C31\u80FD\u505A\u4E00\u6B21\u5C0F\u5B9E\u9A8C\u3002",
      clipId: "r038"
    },
    {
      start: 297.800292,
      end: 300.010292,
      text: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE\uFF0C",
      clipId: "r039"
    },
    {
      start: 300.060292,
      end: 301.350292,
      text: "\u6162\u6162\u8C03\u6574\u4F4D\u7F6E\u3002",
      clipId: "r039"
    },
    {
      start: 301.720292,
      end: 302.740292,
      text: "\u5408\u9002\u7684\u89D2\u5EA6\u4E00\u5230\uFF0C",
      clipId: "r039"
    },
    {
      start: 302.740292,
      end: 304.060292,
      text: "\u51E0\u6EF4\u666E\u901A\u7684\u6C34\uFF0C",
      clipId: "r039"
    },
    {
      start: 304.060292,
      end: 305.870292,
      text: "\u5C31\u80FD\u4EAE\u51FA\u4E00\u5C0F\u6BB5\u5F69\u8679\u3002",
      clipId: "r039"
    },
    {
      start: 306.640333,
      end: 308.290333,
      text: "\u4E0B\u6B21\u96E8\u540E\u62AC\u5934\uFF0C",
      clipId: "r041"
    },
    {
      start: 308.480333,
      end: 311.150333,
      text: "\u4F60\u53EF\u4EE5\u8BD5\u7740\u627E\u51FA\u592A\u9633\u3001\u5F71\u5B50\u548C\u96E8\u5E55\u3002",
      clipId: "r041"
    },
    {
      start: 311.440333,
      end: 312.650333,
      text: "\u90A3\u9053\u5F2F\u5F2F\u7684\u5F69\u8679\uFF0C",
      clipId: "r041"
    },
    {
      start: 312.880333,
      end: 314.670333,
      text: "\u662F\u5149\u548C\u4F60\u5171\u540C\u753B\u51FA\u7684\u5706\u3002",
      clipId: "r041"
    }
  ],
  scenes: [
    {
      id: "street",
      start: 0,
      end: 33.8
    },
    {
      id: "drop",
      start: 33.92,
      end: 62.6
    },
    {
      id: "dispersion",
      start: 62.72,
      end: 93.560125
    },
    {
      id: "reflection",
      start: 93.680125,
      end: 117.120167
    },
    {
      id: "angle",
      start: 117.240167,
      end: 151.200167
    },
    {
      id: "cone",
      start: 151.320167,
      end: 184.080208
    },
    {
      id: "circle",
      start: 184.200208,
      end: 219.60025
    },
    {
      id: "observer",
      start: 219.72025,
      end: 249.04025
    },
    {
      id: "secondary",
      start: 249.16025,
      end: 290.36025
    },
    {
      id: "return",
      start: 290.48025,
      end: 315.440333
    },
    {
      id: "references",
      start: 315.440333,
      end: 320.440333
    }
  ],
  audio: {
    narration: "public/audio/narration.wav",
    sampleRate: 48e3,
    referencesSeconds: 5,
    naturalTiming: true,
    noTimeStretch: true,
    captionAlignment: "ASR-word-times-with-character-interpolation"
  }
};

// src/Timeline.ts
var source = timeline_default;
var f = (seconds) => Math.round(seconds * source.fps);
var timeline = {
  ...source,
  clips: source.clips.map((c) => ({ ...c, start: f(c.start), end: f(c.end), duration: f(c.end) - f(c.start) })),
  captions: source.captions.map((c) => ({ ...c, start: f(c.start), end: f(c.end) })),
  scenes: source.scenes.map((s, i, a) => ({ ...s, start: f(s.start), end: i < a.length - 1 ? f(a[i + 1].start) : source.duration }))
};
var clamp3 = (x) => Math.min(1, Math.max(0, x));
var ease = (x) => {
  x = clamp3(x);
  return x * x * x * (x * (x * 6 - 15) + 10);
};
function stateAt(frame) {
  const scenes = timeline.scenes ?? [];
  const sc = scenes.find((s) => frame >= s.start && frame < s.end) ?? scenes.at(-1) ?? { id: "street", start: 0, end: 9e3 };
  const group = timeline.clips.filter((c) => c.scene === sc.id);
  const clip = group.filter((c) => frame >= c.start).at(-1) ?? group[0];
  return { scene: sc.id, progress: clamp3((frame - sc.start) / (sc.end - sc.start)), time: frame / 30, frame, sceneStart: sc.start, sceneEnd: sc.end, line: Math.max(0, group.findIndex((c) => c.id === clip?.id)), lineProgress: clip ? clamp3((frame - clip.start) / clip.duration) : 1, clip };
}

// src/optics.ts
import * as THREE from "three";
var AIR = { name: "air", refractiveIndex: 1.0003 };
var EPS = 1e-9;
var clamp4 = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
function refractBoundary(direction, outwardNormal, nFrom, nTo) {
  if (!(nFrom > 0) || !(nTo > 0)) throw new Error("Refractive indices must be positive");
  const d = direction.clone().normalize();
  let normal = outwardNormal.clone().normalize();
  const etai = nFrom;
  const etat = nTo;
  let cosi = clamp4(-d.dot(normal));
  if (cosi < 0) {
    cosi = -cosi;
    normal.negate();
  }
  const eta = etai / etat;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < -EPS) return null;
  return d.multiplyScalar(eta).add(normal.multiplyScalar(eta * cosi - Math.sqrt(Math.max(0, k)))).normalize();
}
function reflect(direction, outwardNormal) {
  return direction.clone().reflect(outwardNormal.clone().normalize()).normalize();
}
function sphereHit(origin, direction, radius = 1) {
  const d = direction.clone().normalize();
  const b = origin.dot(d);
  const c = origin.lengthSq() - radius * radius;
  const disc = b * b - c;
  if (disc < -EPS) return null;
  const root = Math.sqrt(Math.max(0, disc));
  const t0 = -b - root;
  const t1 = -b + root;
  if (t0 > EPS) return t0;
  if (t1 > EPS) return t1;
  return null;
}
function nextSphereHit(point, direction, radius) {
  const t = sphereHit(point.clone().addScaledVector(direction, EPS * 20), direction, radius);
  return t === null ? null : point.clone().addScaledVector(direction, t + EPS * 20);
}
function hitAtImpact(impactParameter, radius) {
  const q = clamp4(impactParameter, -0.999999, 0.999999);
  return new THREE.Vector3(-Math.sqrt(1 - q * q) * radius, q * radius, 0);
}
function trace(impactParameter, radius, nWater, internalReflections) {
  const incoming = new THREE.Vector3(1, 0, 0);
  const entry = hitAtImpact(impactParameter, radius);
  if (!entry) return null;
  const entryNormal = entry.clone().normalize();
  const inside = refractBoundary(incoming, entryNormal, AIR.refractiveIndex, nWater);
  if (!inside) return null;
  const firstHit = nextSphereHit(entry, inside, radius);
  if (!firstHit) return null;
  const firstNormal = firstHit.clone().normalize();
  let ray = reflect(inside, firstNormal);
  const points = [entry.clone().addScaledVector(incoming, -radius * 1.65), entry.clone(), firstHit.clone()];
  let secondHit = firstHit.clone();
  let exit = firstHit.clone();
  for (let i = 0; i < internalReflections - 1; i++) {
    const hit = nextSphereHit(secondHit, ray, radius);
    if (!hit) return null;
    secondHit = hit;
    points.push(hit.clone());
    ray = reflect(ray, hit.clone().normalize());
  }
  const finalHit = nextSphereHit(secondHit, ray, radius);
  if (!finalHit) return null;
  exit = finalHit;
  points.push(exit.clone());
  const exitDirection = refractBoundary(ray, exit.clone().normalize(), nWater, AIR.refractiveIndex);
  if (!exitDirection) return null;
  const outgoing = exit.clone().addScaledVector(exitDirection, radius * 2);
  points.push(outgoing);
  const scatteringAngleDeg = THREE.MathUtils.radToDeg(Math.acos(clamp4(outgoing.clone().sub(exit).normalize().dot(incoming))));
  const rainbowAngleDeg = 180 - scatteringAngleDeg;
  return {
    points,
    entrance: entry,
    firstHit,
    secondHit,
    exit,
    outgoing: exitDirection,
    scatteringAngleDeg,
    rainbowAngleDeg,
    impactParameter,
    refractiveIndex: nWater,
    internalReflections
  };
}
function tracePrimary(impactParameter, refractiveIndex, radius = 1) {
  return trace(impactParameter, radius, refractiveIndex, 1);
}
function traceSecondary(impactParameter, refractiveIndex, radius = 1) {
  return trace(impactParameter, radius, refractiveIndex, 2);
}
function findPrimaryExtremum(refractiveIndex, samples = 768) {
  let best = null;
  for (let i = 1; i < samples; i++) {
    const b2 = i / samples * 0.9998;
    const path2 = tracePrimary(b2, refractiveIndex);
    if (!path2) continue;
    if (!best || path2.rainbowAngleDeg > best.rainbowAngleDeg) best = { impactParameter: b2, rainbowAngleDeg: path2.rainbowAngleDeg, path: path2 };
  }
  if (!best) throw new Error(`No primary rainbow path for n=${refractiveIndex}`);
  let lo = Math.max(1e-4, best.impactParameter - 2 / samples);
  let hi = Math.min(0.9998, best.impactParameter + 2 / samples);
  for (let i = 0; i < 36; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const p1 = tracePrimary(m1, refractiveIndex);
    const p2 = tracePrimary(m2, refractiveIndex);
    if (!p1 || !p2) {
      lo = m1;
      continue;
    }
    if (p1.rainbowAngleDeg > p2.rainbowAngleDeg) hi = m2;
    else lo = m1;
  }
  const b = (lo + hi) / 2;
  const path = tracePrimary(b, refractiveIndex);
  if (!path) throw new Error("Primary extremum refinement failed");
  return { impactParameter: b, rainbowAngleDeg: path.rainbowAngleDeg, path };
}
function findSecondaryExtremum(refractiveIndex, samples = 768) {
  let best = null;
  for (let i = 1; i < samples; i++) {
    const b2 = i / samples * 0.9998;
    const path2 = traceSecondary(b2, refractiveIndex);
    if (path2 && (!best || path2.rainbowAngleDeg < best.rainbowAngleDeg)) best = { impactParameter: b2, rainbowAngleDeg: path2.rainbowAngleDeg, path: path2 };
  }
  if (!best) throw new Error(`No secondary rainbow path for n=${refractiveIndex}`);
  let lo = Math.max(1e-4, best.impactParameter - 2 / samples);
  let hi = Math.min(0.9998, best.impactParameter + 2 / samples);
  for (let i = 0; i < 36; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const p1 = traceSecondary(m1, refractiveIndex), p2 = traceSecondary(m2, refractiveIndex);
    if (p1.rainbowAngleDeg < p2.rainbowAngleDeg) hi = m2;
    else lo = m1;
  }
  const b = (lo + hi) / 2, path = traceSecondary(b, refractiveIndex);
  return { impactParameter: b, rainbowAngleDeg: path.rainbowAngleDeg, path };
}
var SPECTRUM = [
  { name: "red", wavelengthNm: 650, refractiveIndex: 1.331, color: "#ef4b3f" },
  { name: "orange", wavelengthNm: 600, refractiveIndex: 1.333, color: "#f39a3e" },
  { name: "yellow", wavelengthNm: 570, refractiveIndex: 1.334, color: "#e8c34b" },
  { name: "green", wavelengthNm: 530, refractiveIndex: 1.335, color: "#54a67c" },
  { name: "cyan", wavelengthNm: 500, refractiveIndex: 1.338, color: "#55b4bf" },
  { name: "blue", wavelengthNm: 460, refractiveIndex: 1.34, color: "#4b82c5" },
  { name: "violet", wavelengthNm: 410, refractiveIndex: 1.343, color: "#886bb4" }
];

// src/WorldV07.ts
var v = (x = 0, y = 0, z = 0) => new T3.Vector3(x, y, z);
var HERO = v(0, 4, 0);
var EYE = v(0, 1.55, 7);
var SPRAY_EYE = v(-2.1, 1.55, 5);
var SPRAY_AXIS = v(0.24, -0.17, -0.955).normalize();
var deg = T3.MathUtils.degToRad;
var INK = "#203d45";
var mix = (a, b, t) => a + (b - a) * t;
var fract2 = (x) => x - Math.floor(x);
var hash01 = (index, salt) => {
  let x = Math.imul(index + 1, 2654435761) ^ salt;
  x = Math.imul(x ^ x >>> 16, 2246822507);
  x = Math.imul(x ^ x >>> 13, 3266489909);
  return ((x ^ x >>> 16) >>> 0) / 4294967296;
};
var envelope = (frame, start, end, enter = 60, leave = 90) => ease((frame - start) / Math.max(1, enter)) * (1 - ease((frame - (end - leave)) / Math.max(1, leave)));
function sceneP(id, frame) {
  const s = timeline.scenes.find((s2) => s2.id === id);
  return s ? clamp3((frame - s.start) / Math.max(1, s.end - s.start)) : 0;
}
function clipP(id, frame) {
  const c = timeline.clips.find((c2) => c2.id === id);
  return c ? clamp3((frame - c.start) / Math.max(1, c.end - c.start)) : 0;
}
function mat(c, opacity = 1, roughness = 0.5) {
  return new T3.MeshStandardMaterial({ color: c, roughness, metalness: 0.04, transparent: opacity < 1, opacity, depthWrite: opacity > 0.8 });
}
function flat(c, a = 1) {
  return new T3.MeshBasicMaterial({ color: c, transparent: true, opacity: a, depthWrite: false, toneMapped: false });
}
function alpha(o, a) {
  o.traverse((n) => {
    const m = n.material;
    if (!m) return;
    (Array.isArray(m) ? m : [m]).forEach((m2) => {
      if (m2.userData.a === void 0) {
        m2.userData.a = m2.opacity;
        m2.userData.transparent = m2.transparent;
        m2.userData.depthWrite = m2.depthWrite;
      }
      m2.opacity = m2.userData.a * a;
      const transparent = m2.userData.transparent || m2.opacity < 0.995;
      if (m2.transparent !== transparent) {
        m2.transparent = transparent;
        m2.needsUpdate = true;
      }
      m2.depthWrite = !!m2.userData.depthWrite && !transparent;
    });
  });
}
function sphere(p2, r, m) {
  const o = new T3.Mesh(new T3.SphereGeometry(r, 36, 24), m);
  o.position.copy(p2);
  return o;
}
function rod(a, b, r, m) {
  const d = b.clone().sub(a);
  const o = new T3.Mesh(new T3.CylinderGeometry(r, r, d.length(), 12), m);
  o.position.copy(a).lerp(b, 0.5);
  o.quaternion.setFromUnitVectors(v(0, 1, 0), d.normalize());
  return o;
}
function moveRod(o, a, b) {
  const d = b.clone().sub(a);
  o.position.copy(a).lerp(b, 0.5);
  o.quaternion.setFromUnitVectors(v(0, 1, 0), d.clone().normalize());
  o.scale.y = Math.max(1e-5, d.length() / o.geometry.parameters.height);
}
function line(points, color, width = 0.014, a = 0.8) {
  const g = new T3.Group();
  for (let i = 0; i < points.length - 1; i++) g.add(rod(points[i], points[i + 1], width, flat(color, a)));
  return g;
}
function dashed(a, b, color, width = 0.012, opacity = 0.5, steps = 14) {
  const group = new T3.Group();
  for (let i = 0; i < steps; i++) group.add(rod(a.clone().lerp(b, i / steps), a.clone().lerp(b, (i + 0.52) / steps), width, flat(color, opacity)));
  return group;
}
function waterToEye(source2, eye, height) {
  let lo = Math.min(source2.x, eye.x), hi = Math.max(source2.x, eye.x);
  for (let i = 0; i < 72; i++) {
    const x = (lo + hi) / 2, a = x - source2.x, b = eye.x - x, residual = 1.333 * a / Math.hypot(a, height - source2.y) - AIR.refractiveIndex * b / Math.hypot(b, eye.y - height);
    if (residual > 0) hi = x;
    else lo = x;
  }
  return [source2.clone(), v((lo + hi) / 2, height, source2.z), eye.clone()];
}
var Ray = class {
  group = new T3.Group();
  meshes = [];
  photon;
  points;
  constructor(points, color, width = 0.027) {
    this.points = points;
    for (let i = 0; i < points.length - 1; i++) {
      const m = rod(points[i], points[i + 1], width, flat(color, 0.9));
      this.group.add(m);
      this.meshes.push(m);
    }
    this.photon = sphere(points[0], width * 2.4, flat(color));
    this.group.add(this.photon);
  }
  update(progress, opacity, frame) {
    const n = this.meshes.length;
    this.meshes.forEach((m, i) => {
      const q2 = clamp3(progress * n - i);
      moveRod(m, this.points[i], this.points[i].clone().lerp(this.points[i + 1], q2));
      m.material.opacity = opacity * ease(q2 / 0.035);
      m.visible = q2 > 1e-5;
    });
    const q = fract2(frame * 0.017 / n) * n, k = Math.min(n - 1, Math.floor(q));
    this.photon.position.copy(this.points[k]).lerp(this.points[k + 1], q - k);
    const photonMaterial = this.photon.material;
    photonMaterial.color.copy(this.meshes[k].material.color);
    photonMaterial.opacity = opacity * ease(q / 0.12) * ease((n - q) / 0.12) * ease((progress * n - q) / 0.16);
    this.photon.visible = photonMaterial.opacity > 1e-5;
  }
};
var WorldV07 = class {
  group = new T3.Group();
  environment;
  cinema;
  energy;
  nature = new T3.Group();
  micro = new T3.Group();
  outdoor = new T3.Group();
  ringRig = new T3.Group();
  coneRig = new T3.Group();
  observer = new T3.Group();
  sun = new T3.Group();
  spray = new T3.Group();
  coda = new T3.Group();
  glass = new T3.Group();
  friend = new T3.Group();
  friendRay;
  drop;
  rim;
  primary = [];
  secondary = [];
  fan = [];
  rays = new T3.Group();
  transmitted;
  spectra = [];
  primaryRing;
  secondaryRing;
  darkBand;
  cone;
  axis;
  angle;
  eyeRay;
  rain;
  mist;
  water;
  waterMaterial;
  nearFar = new T3.Group();
  nearDrop;
  farDrop;
  distanceRay;
  glassRay;
  glassRayGuide;
  glassVirtual = new T3.Group();
  sprayRainbow;
  sprayLight;
  sprayObserver = new T3.Group();
  spraySunCue = new T3.Group();
  axisSunCue = new T3.Group();
  mainSunRay;
  anchor;
  primaryAngles = SPECTRUM.map((s) => findPrimaryExtremum(s.refractiveIndex, 300));
  secondaryAngles = SPECTRUM.map((s) => findSecondaryExtremum(s.refractiveIndex, 300));
  dummy = new T3.Object3D();
  eye = EYE.clone();
  axisDir = v(0, -Math.sin(deg(12)), -Math.cos(deg(12)));
  baseAxis = this.axisDir.clone();
  constructor(renderer, scene) {
    this.group.name = "rainbow-continuous-world-v06";
    scene.add(this.group);
    if (renderer) {
      this.cinema = new EnvironmentV07(renderer, scene);
      this.environment = this.cinema.environment;
    } else {
      this.environment = new T3.WebGLRenderTarget(1, 1);
      scene.background = new T3.Color("#e9f0ec");
    }
    this.group.add(this.nature, this.micro, this.outdoor, this.spray, this.coda);
    this.micro.position.copy(HERO);
    this.waterMaterial = new T3.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.85 } }, vertexShader: `varying vec3 p;uniform float uTime;void main(){p=position;vec3 q=position;float r=length(q.xy);q.z+=.013*sin(q.x*5.+q.y*2.2-uTime*1.6)+.007*sin(q.x*9.-q.y*6.+uTime*2.1)+.004*sin(r*14.-uTime*2.4)*exp(-r);gl_Position=projectionMatrix*modelViewMatrix*vec4(q,1.);}`, fragmentShader: `varying vec3 p;uniform float uTime;uniform float uOpacity;void main(){float r=length(p.xy);if(r>1.5)discard;float crossing=sin(p.x*5.+p.y*2.2-uTime*1.6)+.45*sin(p.x*9.-p.y*6.+uTime*2.1);float ripple=.12*sin((r+.04*sin(p.x*3.))*14.-uTime*2.4)*exp(-r);float shimmer=clamp(.5+.16*crossing+ripple,0.,1.);float a=1.-smoothstep(1.34,1.5,r);vec3 c=mix(vec3(.38,.60,.62),vec3(.72,.87,.85),.10+.20*pow(shimmer,4.));gl_FragColor=vec4(c,uOpacity*a);}`, side: T3.DoubleSide });
    this.water = new T3.Mesh(new T3.PlaneGeometry(3, 3, 64, 64), this.waterMaterial);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(-3, 0.025, 3);
    this.nature.add(this.water);
    const stone = new T3.Mesh(new T3.TorusGeometry(1.52, 0.075, 24, 192), mat("#c0cec5"));
    stone.rotation.x = Math.PI / 2;
    stone.position.copy(this.water.position);
    this.nature.add(stone);
    const physical = new T3.MeshPhysicalMaterial({ color: "#f6fcff", roughness: 9e-3, transmission: 0.985, envMapIntensity: 1.35, thickness: 3.1, ior: 1.333, clearcoat: 1, transparent: true, opacity: 0.94, depthWrite: false });
    this.drop = new T3.Mesh(new T3.SphereGeometry(1.6, 96, 64), physical);
    this.micro.add(this.drop);
    const cupPoints = [new T3.Vector2(0.76, -1.2), new T3.Vector2(0.82, -1.15), new T3.Vector2(0.83, 1.2), new T3.Vector2(0.8, 1.23), new T3.Vector2(0.77, 1.19), new T3.Vector2(0.75, -1.05), new T3.Vector2(0.76, -1.2)];
    const cup = new T3.Mesh(new T3.LatheGeometry(cupPoints, 80), new T3.MeshPhysicalMaterial({ color: "#f4fbf8", transmission: 0.98, roughness: 0.012, thickness: 0.055, ior: 1.5, transparent: true, opacity: 0.3, depthWrite: false, side: T3.DoubleSide }));
    this.glass.add(cup);
    const cupWater = new T3.Mesh(new T3.CylinderGeometry(0.76, 0.75, 1.72, 80), new T3.MeshPhysicalMaterial({ color: "#d6eeeb", transmission: 0.98, roughness: 0.014, thickness: 1.5, ior: 1.333, transparent: true, opacity: 0.26, depthWrite: false }));
    cupWater.position.y = -0.18;
    this.glass.add(cupWater);
    const stickBottom = v(-0.22, -1.05, 0.07), stickTop = v(0.49, 2, 0.07), waterTop = 0.68, stickSurface = stickBottom.clone().lerp(stickTop, (waterTop - stickBottom.y) / (stickTop.y - stickBottom.y));
    const waterline = new T3.Mesh(new T3.TorusGeometry(0.758, 95e-4, 8, 100), flat("#65b1b7", 0.49));
    waterline.name = "real-water-level-at-068";
    waterline.rotation.x = Math.PI / 2;
    waterline.position.y = waterTop;
    this.glass.add(waterline);
    const submerged = rod(stickBottom, stickSurface, 0.047, mat("#b77e50", 0.72)), dry = rod(stickSurface, stickTop, 0.047, mat("#b77e50"));
    submerged.name = "straight-real-stick-submerged";
    dry.name = "straight-real-stick-above-water";
    this.glass.add(submerged, dry);
    const source2 = stickBottom.clone().lerp(stickTop, (-0.8 - stickBottom.y) / (stickTop.y - stickBottom.y)), eye = v(1.55, 2.45, 0.07), eyeGuide = v(1.85, 2.45, 0.07), pathA = waterToEye(source2, eye, waterTop), pathB = waterToEye(source2, eyeGuide, waterTop);
    this.glassRay = new Ray(pathA, "#348e97", 0.022);
    this.glassRay.group.name = "surface-refraction-real-light";
    this.glassRayGuide = new Ray(pathB, "#72b2b4", 0.01);
    this.glass.add(this.glassRay.group, this.glassRayGuide.group);
    const refractionHalo = sphere(pathA[1], 0.082, flat("#79c5c6", 0.21)), refractionPoint = sphere(pathA[1], 0.026, flat("#348e97", 0.86));
    refractionHalo.name = "water-surface-refraction-halo";
    this.glassVirtual.add(refractionHalo, refractionPoint);
    const d1 = pathA[1].clone().sub(eye).normalize(), d2 = pathB[1].clone().sub(eyeGuide).normalize(), dp = pathB[1].clone().sub(pathA[1]), cross = (a, b) => a.x * b.y - a.y * b.x, virtual = pathA[1].clone().addScaledVector(d1, cross(dp, d2) / cross(d1, d2));
    this.glassVirtual.name = "apparent-stick-and-backward-ray-extensions";
    this.glassVirtual.add(dashed(pathA[1], virtual, "#579a9d", 0.01, 0.42), dashed(pathB[1], virtual, "#579a9d", 9e-3, 0.24), dashed(stickSurface, virtual, "#d18c52", 0.023, 0.76, 12), sphere(virtual, 0.045, flat("#d18c52", 0.64)));
    this.glass.add(this.glassVirtual);
    const pupil = sphere(eye, 0.063, flat(INK, 0.82)), eyeOutline = new T3.Mesh(new T3.TorusGeometry(0.115, 0.01, 8, 40), flat("#496d73", 0.7));
    eyeOutline.position.copy(eye);
    eyeOutline.scale.y = 0.6;
    this.glassVirtual.add(pupil, eyeOutline);
    const incoming = pathA[1].clone().sub(source2).normalize(), outgoingCup = eye.clone().sub(pathA[1]).normalize(), computedCup = refractBoundary(incoming, v(0, 1, 0), 1.333, AIR.refractiveIndex);
    this.glass.userData.refraction = { model: "horizontal water-air surface; thin glass shell omitted from explanatory rays", realPoint: source2.toArray(), surfacePoint: pathA[1].toArray(), eye: eye.toArray(), virtualPoint: virtual.toArray(), directionResidual: computedCup.distanceTo(outgoingCup) };
    this.glass.position.set(9, 4, 0);
    this.group.add(this.glass);
    this.rim = new T3.Mesh(new T3.SphereGeometry(1.61, 72, 48), new T3.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uAlpha: { value: 0.7 } }, vertexShader: `varying vec3 N;varying vec3 V;void main(){vec4 p=modelViewMatrix*vec4(position,1.);N=normalize(normalMatrix*normal);V=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`, fragmentShader: `varying vec3 N;varying vec3 V;uniform float uAlpha;void main(){float f=pow(1.-abs(dot(normalize(N),normalize(V))),3.);float l=pow(max(0.,dot(normalize(N),normalize(vec3(-.5,.8,1.)))),30.);gl_FragColor=vec4(mix(vec3(.16,.52,.60),vec3(.95,.99,1.),l),f*.32*uAlpha+l*.30*uAlpha);}` }));
    this.micro.add(this.rim, this.rays);
    const commonImpact = this.primaryAngles[0].impactParameter;
    SPECTRUM.forEach((s, i) => {
      const path = tracePrimary(commonImpact, s.refractiveIndex);
      const points = path.points.map((p3) => p3.clone().multiplyScalar(1.6));
      points[points.length - 1] = points[points.length - 2].clone().addScaledVector(path.outgoing, 3.4);
      const ray = new Ray(points, s.color, i === 0 || i === 6 ? 6e-3 : 48e-4);
      ray.group.userData = { commonImpact, internalReflections: 1 };
      this.primary.push(ray);
      this.rays.add(ray.group);
    });
    for (let segment = 1; segment < 4; segment++) {
      const positions = [], colours = [], indices = [];
      this.primary.forEach((ray, i) => {
        positions.push(...ray.points[segment].toArray(), ...ray.points[segment + 1].toArray());
        const colour = new T3.Color(SPECTRUM[i].color);
        colours.push(...colour.toArray(), ...colour.toArray());
        if (i < 6) {
          const n = i * 2;
          indices.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
        }
      });
      const geometry = new T3.BufferGeometry();
      geometry.setAttribute("position", new T3.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new T3.Float32BufferAttribute(colours, 3));
      geometry.setIndex(indices);
      const ribbon = new T3.Mesh(geometry, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false, toneMapped: false }));
      ribbon.name = `computed-spectrum-segment-${segment}`;
      ribbon.userData.segment = segment;
      ribbon.renderOrder = 8;
      this.spectra.push(ribbon);
      this.rays.add(ribbon);
    }
    this.secondaryAngles.forEach((p3, i) => {
      const ray = new Ray(p3.path.points.map((p4) => p4.clone().multiplyScalar(1.6)), SPECTRUM[i].color, i === 0 || i === 6 ? 0.017 : 0.0125);
      this.secondary.push(ray);
      this.rays.add(ray.group);
    });
    for (let i = 0; i < 19; i++) {
      const p3 = tracePrimary(0.15 + i * 0.043, 1.333);
      if (p3) {
        const points = p3.points.map((p4) => p4.clone().multiplyScalar(1.6));
        points[points.length - 1] = points[points.length - 2].clone().addScaledVector(p3.outgoing, 2.2);
        const ray = new Ray(points, "#d9b166", 9e-3);
        this.fan.push(ray);
        this.rays.add(ray.group);
      }
    }
    const tr = this.primaryAngles[0].path, inside = tr.firstHit.clone().sub(tr.entrance).normalize(), out = refractBoundary(inside, tr.firstHit, tr.refractiveIndex, AIR.refractiveIndex);
    this.transmitted = new Ray([tr.firstHit.clone().multiplyScalar(1.6), tr.firstHit.clone().multiplyScalar(1.6).addScaledVector(out, 3.8)], "#d5b276", 0.021);
    this.transmitted.group.name = "partial-transmission-at-first-hit";
    this.rays.add(this.transmitted.group);
    const p2 = tr.exit.clone().multiplyScalar(1.6), backward = tr.points[0].clone().sub(tr.points[1]).normalize(), outgoing = tr.outgoing.clone().normalize(), axis = backward.clone().cross(outgoing).normalize(), angle = backward.angleTo(outgoing);
    this.angle = new T3.Group();
    this.angle.name = "rainbow-angle-on-actual-exit-side";
    this.angle.userData = { angleDegrees: T3.MathUtils.radToDeg(angle), backward: backward.toArray(), outgoing: outgoing.toArray() };
    this.angle.add(line([p2.clone().addScaledVector(backward, 2.6), p2.clone()], "#496c71", 0.018, 0.65));
    const ps = [];
    for (let i = 0; i <= 70; i++) ps.push(p2.clone().addScaledVector(backward.clone().applyAxisAngle(axis, angle * i / 70), 0.74));
    this.angle.add(line(ps, "#d96350", 0.017));
    this.micro.add(this.angle);
    this.outdoor.add(this.observer, this.sun, this.ringRig, this.coneRig);
    this.observer.add(sphere(v(0, 1.55, 0), 0.14, mat(INK)), rod(v(0, 0.7, 0), v(0, 1.28, 0), 0.12, mat("#567b7c")));
    this.observer.add(rod(v(-0.055, 0.74, 0), v(-0.12, 0, 0), 0.05, mat(INK)), rod(v(0.055, 0.74, 0), v(0.14, 0, 0), 0.05, mat(INK)));
    this.observer.position.set(0, 0, 7);
    this.sun.add(sphere(v(), 1.1, flat("#efd7a1")));
    const halo = sphere(v(), 1.45, flat("#efd7a1", 0.12));
    this.sun.add(halo);
    this.sun.position.copy(EYE).addScaledVector(this.baseAxis, -72);
    this.primaryRing = this.makeRing(false);
    this.secondaryRing = this.makeRing(true);
    this.ringRig.add(this.primaryRing, this.secondaryRing);
    this.darkBand = this.makeBand();
    this.ringRig.add(this.darkBand);
    const length = 20, theta = deg(this.primaryAngles[0].rainbowAngleDeg), rad = length * Math.sin(theta), height = length * Math.cos(theta);
    this.cone = new T3.Mesh(new T3.ConeGeometry(rad, height, 128, 32, true), new T3.ShaderMaterial({ side: T3.DoubleSide, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } }, vertexShader: `varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`, fragmentShader: `varying vec2 vUv;varying vec3 vN;varying vec3 vV;uniform float uTime;uniform float uAlpha;void main(){float fres=pow(1.-abs(dot(normalize(vN),normalize(vV))),2.5);float seam=pow(.5+.5*cos(vUv.x*6.28318*12.),35.);float front=exp(-pow((fract(vUv.y+uTime*.10)-.48)/.06,2.));float a=(.025+.09*fres+.026*seam+.026*front)*uAlpha;gl_FragColor=vec4(mix(vec3(.24,.57,.61),vec3(.82,.95,.93),front*.4),a);}` }));
    this.cone.position.copy(EYE).addScaledVector(this.baseAxis, height * 0.5);
    this.cone.quaternion.setFromUnitVectors(v(0, -1, 0), this.baseAxis);
    this.coneRig.add(this.cone);
    this.axis = line([EYE, EYE.clone().addScaledVector(this.baseAxis, 20)], "#456c75", 0.017, 0.55);
    this.coneRig.add(this.axis);
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2;
      const end = this.ringPoint(theta, a);
      this.coneRig.add(line([EYE, end], i % 3 === 0 ? "#d67055" : "#4c9294", 0.016, i % 3 === 0 ? 0.65 : 0.25));
    }
    this.eyeRay = rod(EYE, this.ringPoint(theta, Math.PI / 2), 0.035, flat("#ed9362", 0.8));
    this.outdoor.add(this.eyeRay);
    const sunOrigin = EYE.clone().addScaledVector(this.baseAxis, -5.2);
    this.mainSunRay = new Ray([sunOrigin, EYE.clone()], "#d8b566", 0.026);
    this.mainSunRay.group.name = "sunlight-arrives-behind-observer";
    this.axisSunCue.add(this.mainSunRay.group, sphere(sunOrigin, 0.32, flat("#edd399", 0.78)), sphere(sunOrigin, 0.5, flat("#edd399", 0.12)));
    const incomingTip = new T3.Mesh(new T3.ConeGeometry(0.09, 0.26, 14), flat("#cda45c", 0.78));
    incomingTip.position.copy(EYE).addScaledVector(this.baseAxis, -0.78);
    incomingTip.quaternion.setFromUnitVectors(v(0, 1, 0), this.baseAxis);
    this.axisSunCue.add(incomingTip);
    const shadowStart = v(EYE.x, 0.015, EYE.z), shadowDirection = v(this.baseAxis.x, 0, this.baseAxis.z).normalize(), shadowLength = 1.55 / Math.tan(deg(12));
    this.axisSunCue.add(rod(shadowStart, shadowStart.clone().addScaledVector(shadowDirection, shadowLength), 0.024, flat("#34545c", 0.19)));
    this.axisSunCue.name = "sun-behind-eye-and-forward-shadow";
    this.outdoor.add(this.axisSunCue);
    this.friend.add(sphere(v(0, 1.55, 0), 0.14, mat("#417f94")), rod(v(0, 0.7, 0), v(0, 1.28, 0), 0.12, mat("#5d96a4")), rod(v(-0.055, 0.74, 0), v(-0.12, 0, 0), 0.05, mat("#417f94")), rod(v(0.055, 0.74, 0), v(0.14, 0, 0), 0.05, mat("#417f94")));
    this.friend.position.set(-1.8, 0, 7);
    this.outdoor.add(this.friend);
    this.friendRay = rod(EYE.clone().add(v(-1.8, 0, 0)), this.ringPoint(theta, Math.PI / 2).add(v(-1.8, 0, 0)), 0.033, flat("#4a9bad", 0.78));
    this.outdoor.add(this.friendRay);
    this.nearFar.name = "same-direction-near-and-far-rain";
    this.nearDrop = sphere(v(), 0.16, mat("#e3a074", 1, 0.18));
    this.farDrop = sphere(v(), 0.16, mat("#e3a074", 1, 0.18));
    this.nearDrop.name = "selected-drop-8m";
    this.farDrop.name = "selected-drop-24m";
    this.distanceRay = rod(EYE, this.ringPoint(theta, Math.PI / 2, 24), 0.018, flat("#d29366", 0.62));
    this.nearFar.add(this.nearDrop, this.farDrop, this.distanceRay);
    this.outdoor.add(this.nearFar);
    this.rain = new T3.InstancedMesh(new T3.SphereGeometry(1, 8, 6), mat("#a9ccd0", 0.35), 1600);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    this.mist = new T3.InstancedMesh(new T3.SphereGeometry(1, 12, 8), flat("#d9f1f4", 0.34), 640);
    this.mist.frustumCulled = false;
    this.spray.add(this.mist);
    const nozzle = rod(v(-3, 0.1, 3), v(-3, 0.9, 3), 0.055, mat("#809d98"));
    this.spray.add(nozzle);
    const localPositions = [], localColors = [], localIndices = [], localN = 64, localBands = 24;
    for (let i = 0; i <= localBands; i++) {
      const s = i / localBands * 6, k = Math.min(5, Math.floor(s)), f2 = s - k, theta2 = deg(mix(this.primaryAngles[k].rainbowAngleDeg, this.primaryAngles[k + 1].rainbowAngleDeg, f2)), c = new T3.Color(SPECTRUM[k].color).lerp(new T3.Color(SPECTRUM[k + 1].color), f2);
      for (let j = 0; j <= localN; j++) {
        const t = j / localN, p3 = this.sprayRingPoint(theta2, mix(2.41, 2.76, t), 3.15);
        localPositions.push(...p3.toArray());
        localColors.push(c.r, c.g, c.b, Math.sin(t * Math.PI) ** 1.5);
      }
    }
    for (let i = 0; i < localBands; i++) for (let j = 0; j < localN; j++) {
      const a = i * (localN + 1) + j, b = a + localN + 1;
      localIndices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const localGeometry = new T3.BufferGeometry();
    localGeometry.setAttribute("position", new T3.Float32BufferAttribute(localPositions, 3));
    localGeometry.setAttribute("color", new T3.Float32BufferAttribute(localColors, 4));
    localGeometry.setIndex(localIndices);
    this.sprayRainbow = new T3.Mesh(localGeometry, new T3.MeshBasicMaterial({ vertexColors: true, side: T3.DoubleSide, transparent: true, opacity: 0.72, depthWrite: false, toneMapped: false }));
    this.sprayRainbow.name = "local-fountain-rainbow-on-real-view-cone";
    this.sprayRainbow.userData = { observer: SPRAY_EYE.toArray(), axis: SPRAY_AXIS.toArray(), distance: 3.15, phi: [2.41, 2.76], angles: this.primaryAngles.map((a) => a.rainbowAngleDeg) };
    this.spray.add(this.sprayRainbow);
    const localDrop = this.sprayRingPoint(deg(this.primaryAngles[0].rainbowAngleDeg), 2.58, 3.15);
    this.sprayLight = new Ray([localDrop.clone().addScaledVector(SPRAY_AXIS, -0.7), localDrop, SPRAY_EYE.clone()], "#e99061", 0.012);
    this.sprayLight.group.name = "sunlight-to-local-spray-to-local-eye";
    this.sprayLight.meshes[0].material.color.set("#fff3d8");
    this.spray.add(this.sprayLight.group);
    this.sprayObserver.name = "fountain-observer-at-actual-optical-eye";
    this.sprayObserver.position.copy(SPRAY_EYE).sub(v(0, 1.55, 0));
    this.sprayObserver.add(sphere(v(0, 1.55, 0), 0.14, mat(INK)), sphere(v(0, 1.55, 0).addScaledVector(SPRAY_AXIS, 0.14), 0.032, mat("#507b81")), rod(v(0, 0.72, 0), v(0, 1.28, 0), 0.11, mat("#78a6a4")), rod(v(-0.045, 0.74, 0), v(-0.1, 0.03, 0), 0.047, mat(INK)), rod(v(0.045, 0.74, 0), v(0.12, 0.03, 0), 0.047, mat(INK)));
    this.spray.add(this.sprayObserver);
    const localSun = SPRAY_EYE.clone().addScaledVector(SPRAY_AXIS, -1.45), localSunRay = rod(localSun, SPRAY_EYE.clone().addScaledVector(SPRAY_AXIS, -0.15), 0.011, flat("#cda45c", 0.55)), localSunArrow = new T3.Mesh(new T3.ConeGeometry(0.038, 0.13, 12), flat("#cda45c", 0.72));
    localSunArrow.position.copy(SPRAY_EYE).addScaledVector(SPRAY_AXIS, -0.24);
    localSunArrow.quaternion.setFromUnitVectors(v(0, 1, 0), SPRAY_AXIS);
    this.spraySunCue.name = "solar-direction-symbol-behind-fountain-observer";
    const sunIcon = new T3.Group();
    sunIcon.position.copy(localSun);
    sunIcon.add(new T3.Mesh(new T3.TorusGeometry(0.1, 8e-3, 8, 40), flat("#cda45c", 0.88)));
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      sunIcon.add(rod(v(Math.cos(a) * 0.145, Math.sin(a) * 0.145, 0), v(Math.cos(a) * 0.205, Math.sin(a) * 0.205, 0), 7e-3, flat("#cda45c", 0.75)));
    }
    this.spraySunCue.add(sunIcon, localSunRay, localSunArrow);
    this.spray.add(this.spraySunCue);
    this.energy = new OpticalEnergyV07([...this.primary.map((r) => ({ points: r.points, color: r.meshes[1].material.color.getStyle(), role: "primary" })), ...this.secondary.map((r) => ({ points: r.points, color: r.meshes[1].material.color.getStyle(), role: "secondary" }))]);
    this.micro.add(this.energy.group);
  }
  ringPoint(theta, phi, distance = 20) {
    const u = v(1, 0, 0), w = u.clone().cross(this.baseAxis).normalize();
    return EYE.clone().addScaledVector(this.baseAxis, Math.cos(theta) * distance).addScaledVector(u, Math.cos(phi) * Math.sin(theta) * distance).addScaledVector(w, Math.sin(phi) * Math.sin(theta) * distance);
  }
  sprayRingPoint(theta, phi, distance = 3.15) {
    const u = v(1, 0, 0).addScaledVector(SPRAY_AXIS, -SPRAY_AXIS.x).normalize(), w = u.clone().cross(SPRAY_AXIS).normalize();
    return SPRAY_EYE.clone().addScaledVector(SPRAY_AXIS, Math.cos(theta) * distance).addScaledVector(u, Math.cos(phi) * Math.sin(theta) * distance).addScaledVector(w, Math.sin(phi) * Math.sin(theta) * distance);
  }
  makeRing(secondary) {
    const angles = (secondary ? this.secondaryAngles : this.primaryAngles).map((a) => deg(a.rainbowAngleDeg));
    const pos = [], col = [], idx = [];
    const bands = 40, N = 256;
    for (let i = 0; i <= bands; i++) {
      const q = i / bands * 6, k = Math.min(5, Math.floor(q)), f2 = q - k, angle = mix(angles[k], angles[k + 1], f2), colour = new T3.Color(SPECTRUM[k].color).lerp(new T3.Color(SPECTRUM[k + 1].color), f2);
      for (let j = 0; j <= N; j++) {
        const p2 = this.ringPoint(angle, j / N * Math.PI * 2);
        pos.push(...p2.toArray());
        col.push(colour.r, colour.g, colour.b);
      }
    }
    for (let i = 0; i < bands; i++) for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, b = a + N + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new T3.BufferGeometry();
    g.setAttribute("position", new T3.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new T3.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    const m = new T3.MeshBasicMaterial({ vertexColors: true, side: T3.DoubleSide, transparent: true, opacity: secondary ? 0.48 : 0.87, depthWrite: false, toneMapped: false });
    return new T3.Mesh(g, m);
  }
  makeBand() {
    const pos = [], idx = [], N = 256;
    for (let i = 0; i < 2; i++) for (let j = 0; j <= N; j++) pos.push(...this.ringPoint(deg(i ? this.secondaryAngles[0].rainbowAngleDeg : this.primaryAngles[0].rainbowAngleDeg), j / N * 2 * Math.PI).toArray());
    for (let j = 0; j < N; j++) idx.push(j, j + N + 1, j + 1, j + 1, j + N + 1, j + N + 2);
    const g = new T3.BufferGeometry();
    g.setAttribute("position", new T3.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return new T3.Mesh(g, flat("#596c7d", 0.22));
  }
  update(s) {
    const frame = s.frame, sp = (id) => sceneP(id, frame);
    const start = (id) => timeline.scenes.find((s2) => s2.id === id)?.start ?? 0, end = (id) => timeline.scenes.find((s2) => s2.id === id)?.end ?? frame;
    const axisNarrative = timeline.clips.find((c) => c.id === "r019"), radialNarrative = timeline.clips.find((c) => c.id === "r020");
    const microIn = ease((frame - start("drop") + 45) / 100), microOut = 1 - ease((frame - (axisNarrative?.start ?? start("cone") - 10)) / 150), microLevel = microIn * microOut;
    const sec = timeline.clips.find((c) => c.id === "r034"), secEnd = timeline.clips.find((c) => c.id === "r035");
    const subMicro = s.scene === "secondary" ? ease((frame - (sec?.start ?? start("secondary"))) / 85) * (1 - ease((frame - (secEnd?.start ?? start("secondary") + 300)) / 95)) : 0;
    const microVis = Math.max(microLevel, subMicro);
    alpha(this.micro, microVis);
    this.micro.visible = microVis > 3e-3;
    alpha(this.nature, 1 - microVis * 0.94);
    this.cinema?.update(frame, microVis);
    const glassClip = timeline.clips.find((c) => c.id === "r007");
    const glassIn = glassClip ? ease((frame - glassClip.start + 30) / 70) : 0, glassOut = glassClip ? 1 - ease((frame - glassClip.end + 10) / 65) : 0, glassA = glassIn * glassOut * (s.scene === "drop" ? 1 : 0);
    this.glass.position.x = 4.3 + 4.7 * (1 - glassA);
    alpha(this.glass, glassA);
    this.glass.visible = glassA > 2e-3;
    const cupOptics = ease((clipP("r007", frame) - 0.1) / 0.28);
    this.glassRay.update(cupOptics, glassA * 0.82, frame);
    this.glassRayGuide.update(cupOptics, glassA * 0.26, frame + 9);
    alpha(this.glassVirtual, glassA * ease((clipP("r007", frame) - 0.26) / 0.24));
    const heroLevel = microLevel * (1 - glassA * 0.93);
    const macroLevel = 1 - microVis * 0.98, macroExit = 1 - ease((frame - start("return") + 45) / 140);
    alpha(this.primaryRing, macroLevel * macroExit);
    alpha(this.observer, macroLevel * macroExit);
    alpha(this.sun, macroLevel * 0.92 * macroExit);
    const rise = timeline.clips.find((c) => c.id === "r027"), fall = timeline.clips.find((c) => c.id === "r028");
    const lift = rise?.scene === "circle" && fall?.scene === "circle" ? 18 * ease((frame - rise.start) / Math.max(24, Math.min(rise.duration, 160))) * (1 - ease((frame - (fall.end - 120)) / Math.max(120, end("circle") + 55 - (fall.end - 120)))) : s.scene === "circle" ? 18 * ease((sp("circle") - 0.32) / 0.23) * (1 - ease((sp("circle") - 0.65) / 0.3)) : 0;
    const sunClip = timeline.clips.find((c) => c.id === "r026"), sunRiseCaption = timeline.captions.find((c) => c.text.includes("\u592A\u9633\u5347\u9AD8")), shortArcCaption = timeline.captions.find((c) => c.text.includes("\u9732\u51FA\u7684\u5F27\u5C31\u77ED\u4E86"));
    const sunRiseStart = sunRiseCaption ? sunRiseCaption.start + (sunRiseCaption.end - sunRiseCaption.start) * sunRiseCaption.text.indexOf("\u592A\u9633\u5347\u9AD8") / sunRiseCaption.text.length : (sunClip?.start ?? start("circle")) + (sunClip?.duration ?? 250) * 0.6, highSun = shortArcCaption?.start ?? (sunClip?.end ?? start("circle") + 250) - 10;
    const solar = 12 + 20 * ease((frame - sunRiseStart) / Math.max(24, highSun - sunRiseStart)) * (1 - ease((frame - (rise?.start ?? end("circle"))) / 75));
    this.axisDir.set(0, -Math.sin(deg(solar)), -Math.cos(deg(solar)));
    const q = new T3.Quaternion().setFromUnitVectors(this.baseAxis, this.axisDir);
    const shift = 2.8 * ease((frame - start("observer")) / Math.max(90, (end("observer") - start("observer")) * 0.38)) * (1 - ease((frame - (end("observer") - 45)) / 135));
    this.eye.copy(EYE).add(v(shift, lift, 0));
    this.observer.position.set(shift, lift, 7);
    const pivot = EYE.clone().sub(EYE.clone().applyQuaternion(q)).add(v(shift, lift, 0));
    this.ringRig.position.copy(pivot);
    this.coneRig.position.copy(pivot);
    this.ringRig.quaternion.copy(q);
    this.coneRig.quaternion.copy(q);
    this.sun.position.copy(this.eye).addScaledVector(this.axisDir, -72);
    const coneWindow = envelope(frame, (axisNarrative?.start ?? start("cone")) - 15, end("observer") + 100, 100, 150), coneAlpha = coneWindow * (0.95 - 0.55 * ease((frame - end("cone") + 45) / 120)) * macroLevel;
    alpha(this.coneRig, coneAlpha);
    this.cone.material.uniforms.uTime.value = frame / 30;
    this.cone.material.uniforms.uAlpha.value = coneAlpha;
    const radialReveal = ease((frame - (radialNarrative?.start ?? start("cone")) + 15) / 90);
    for (const child of this.coneRig.children) if (child !== this.axis) alpha(child, coneAlpha * radialReveal);
    const incomingSun = envelope(frame, (axisNarrative?.start ?? start("cone")) - 15, end("cone") + 30, 85, 120) * macroLevel;
    this.axisSunCue.position.copy(pivot);
    this.axisSunCue.quaternion.copy(q);
    alpha(this.axisSunCue, incomingSun);
    this.mainSunRay.update(1, incomingSun * 0.72, frame);
    const secondaryAlpha = ease((frame - start("secondary")) / 90) * (1 - 0.5 * ease((frame - start("return")) / 100)) * (1 - ease((frame - end("return") + 45) / 130));
    alpha(this.secondaryRing, secondaryAlpha * macroLevel * macroExit);
    const darkClip = timeline.clips.find((c) => c.id === "r037"), darkAlpha = envelope(frame, darkClip?.start ?? end("secondary") - 180, start("return") + 120, 75, 135);
    alpha(this.darkBand, darkAlpha * macroLevel);
    let reveal = 0.25 + sp("drop") * 0.24;
    if (frame >= start("dispersion")) reveal = 0.5;
    if (frame >= start("reflection")) reveal = 0.5 + ease(clipP("r013", frame) * 1.5) * 0.25 + ease(clipP("r014", frame) * 1.3) * 0.25;
    if (frame >= start("angle")) reveal = 1;
    const colourLevel = ease((frame - start("dispersion")) / 45), white = new T3.Color("#fff3d8");
    this.primary.forEach((r, i) => {
      r.meshes.forEach((m, k) => m.material.color.copy(white).lerp(new T3.Color(SPECTRUM[i].color), k === 0 ? 0 : colourLevel));
      r.update(reveal, heroLevel * (i === 0 ? 0.9 : colourLevel * 0.76), frame);
      if (i > 0) {
        r.meshes[0].visible = false;
        if (fract2(frame * 0.017 / r.meshes.length) * r.meshes.length < 1) r.photon.visible = false;
      }
    });
    this.spectra.forEach((ribbon) => {
      const segment = ribbon.userData.segment, portion = clamp3(reveal * 4 - segment), positions = ribbon.geometry.attributes.position;
      this.primary.forEach((ray, i) => {
        const a = ray.points[segment], b = a.clone().lerp(ray.points[segment + 1], portion);
        positions.setXYZ(i * 2, a.x, a.y, a.z);
        positions.setXYZ(i * 2 + 1, b.x, b.y, b.z);
      });
      positions.needsUpdate = true;
      ribbon.material.opacity = 0.55 * colourLevel * heroLevel * ease(portion / 0.035);
      ribbon.visible = portion > 1e-5;
    });
    this.secondary.forEach((r, i) => {
      r.meshes.forEach((m, k) => m.material.color.copy(k === 0 ? white : new T3.Color(SPECTRUM[i].color)));
      r.update(ease(clipP("r034", frame) * 1.6), subMicro * (i === 0 ? 0.94 : 0.55), frame);
      if (i > 0) {
        r.meshes[0].visible = false;
        if (fract2(frame * 0.017 / r.meshes.length) * r.meshes.length < 1) r.photon.visible = false;
      }
    });
    this.energy.update(frame, reveal, heroLevel, ease(clipP("r034", frame) * 1.6), subMicro, colourLevel);
    this.primary.forEach((r) => r.group.visible = false);
    this.secondary.forEach((r) => r.group.visible = false);
    const split = timeline.clips.find((c) => c.id === "r013"), splitEnd = timeline.clips.find((c) => c.id === "r016");
    const transmissionLevel = envelope(frame, split?.start ?? start("reflection"), (splitEnd?.start ?? end("reflection") - 90) + 90, 50, 100) * microLevel;
    this.transmitted.update(ease(clipP("r013", frame) * 1.5), transmissionLevel * 0.76, frame);
    this.drop.material.opacity = 0.94 * microVis * (1 - transmissionLevel * 0.18) * (1 - glassA * 0.86);
    this.rim.material.uniforms.uAlpha.value = 0.7 * microVis * (1 - glassA * 0.86);
    this.drop.material.envMapIntensity = 1.35 - 0.87 * envelope(frame, start("dispersion"), end("reflection") + 75, 90, 110);
    const fanLevel = s.scene === "angle" ? ease(sp("angle") * 7) * (1 - ease((sp("angle") - 0.55) * 5)) * 0.32 : 0;
    const scan = clipP("r017", frame);
    this.fan.forEach((r, i) => {
      const reveal2 = ease((scan * 1.7 - i / this.fan.length) / 0.3);
      r.update(reveal2, fanLevel * (0.24 + 0.6 * Math.exp(-(((i / this.fan.length - scan) / 0.14) ** 2))), frame + i * 5);
    });
    alpha(this.angle, ease((frame - (timeline.clips.find((c) => c.id === "r018")?.start ?? start("angle")) + 18) / 55) * (1 - ease((frame - end("angle") + 40) / 110)) * microLevel);
    const rainAlpha = this.rain.material;
    rainAlpha.opacity = 0.27 * (1 - microVis * 0.92) * macroExit;
    const selection = Math.max(envelope(frame, start("cone"), end("cone") + 90, 90, 125), envelope(frame, start("observer"), end("observer") + 90, 90, 140));
    for (let i = 0; i < 1600; i++) {
      const x = i * 173 % 1601 / 1601 * 40 - 20, y = i * 83 % 1597 / 1597 * 20, z = -4 - i * 127 % 1591 / 1591 * 29;
      const p2 = v(x, y, z), theta = T3.MathUtils.radToDeg(p2.clone().sub(this.eye).angleTo(this.axisDir)), selected = selection * Math.exp(-(((theta - 41.4) / 0.9) ** 2)), base = 0.033 + i % 4 * 0.01;
      this.dummy.position.copy(p2);
      this.dummy.scale.setScalar(mix(base, 0.11, selected));
      this.dummy.updateMatrix();
      this.rain.setMatrixAt(i, this.dummy.matrix);
      this.rain.setColorAt(i, new T3.Color("#a9c7cf").lerp(new T3.Color("#ea925e"), selected));
    }
    this.rain.instanceMatrix.needsUpdate = true;
    if (this.rain.instanceColor) this.rain.instanceColor.needsUpdate = true;
    const phi = Math.PI / 2 + Math.sin(ease(sp("cone")) * Math.PI) * 1.1 + Math.sin(ease(sp("observer")) * Math.PI) * 0.65, to = this.ringPoint(deg(this.primaryAngles[0].rainbowAngleDeg), phi).sub(EYE).applyQuaternion(q).add(this.eye), direction = to.clone().sub(this.eye).normalize();
    moveRod(this.eyeRay, this.eye, to);
    alpha(this.eyeRay, selection * 0.88 * macroLevel);
    const nearClip = timeline.clips.find((c) => c.id === "r023"), nearAlpha = envelope(frame, nearClip?.start ?? start("cone") + 180, (nearClip?.end ?? end("cone")) + 100, 65, 100) * macroLevel;
    this.nearDrop.position.copy(this.eye).addScaledVector(direction, 8);
    this.farDrop.position.copy(this.eye).addScaledVector(direction, 24);
    moveRod(this.distanceRay, this.eye, this.farDrop.position);
    alpha(this.nearFar, nearAlpha);
    this.nearFar.visible = nearAlpha > 1e-5;
    const friendClip = timeline.clips.find((c) => c.id === "r031"), friendA = envelope(frame, friendClip?.start ?? start("observer") + 120, end("observer") + 100, 85, 130) * macroLevel;
    alpha(this.friend, friendA);
    alpha(this.friendRay, friendA);
    this.friend.visible = friendA > 1e-5;
    this.friendRay.visible = friendA > 1e-5;
    this.friend.position.set(shift - 1.8, lift, 7);
    moveRod(this.friendRay, this.eye.clone().add(v(-1.8, 0, 0)), to.clone().add(v(-1.8, 0, 0)));
    const sprayAlpha = Math.max(0.16 * envelope(frame, start("street") - 60, start("drop") + 70, 60, 110), envelope(frame, start("return"), end("return") + 80, 85, 110));
    alpha(this.spray, sprayAlpha);
    this.waterMaterial.uniforms.uTime.value = frame / 30;
    this.waterMaterial.uniforms.uOpacity.value = 0.78 * (1 - microVis * 0.9);
    const localRainbow = envelope(frame, start("return") + 30, end("return") + 45, 90, 115), localObserverClip = timeline.clips.find((c) => c.id === "r039"), localObserverAlpha = envelope(frame, (localObserverClip?.start ?? start("return") + 200) - 45, end("return") + 30, 75, 100) * sprayAlpha;
    alpha(this.sprayRainbow, localRainbow * sprayAlpha);
    this.sprayLight.update(ease((frame - (localObserverClip?.start ?? start("return") + 200)) / 75), localRainbow * localObserverAlpha * 0.47, frame);
    alpha(this.sprayObserver, localObserverAlpha);
    alpha(this.spraySunCue, localObserverAlpha);
    const mistBase = new T3.Color("#d1eeeb"), mistColor = new T3.Color();
    for (let i = 0; i < 640; i++) {
      const life = fract2(frame / 30 * (0.3 + hash01(i, 2447445413) * 0.12) + hash01(i, 569420461)), t = life * 2.2, a = hash01(i, 1831565813) * Math.PI * 2, d = 0.2 + Math.sqrt(hash01(i, 1540483477)) * 0.74, drift = Math.sin(frame / 30 * 0.58 + hash01(i, 374761393) * Math.PI * 2) * 0.055 * t * t;
      this.dummy.position.set(-3 + Math.cos(a) * d * t + drift, 0.9 + 3 * t - 1.3 * t * t, 3 - Math.sin(a) * d * t - t * 0.45);
      const lifeAlpha = ease(life / 0.1) * ease((1 - life) / 0.15);
      this.dummy.scale.setScalar((0.01 + hash01(i, 2135587861) * 0.015) * lifeAlpha);
      this.dummy.updateMatrix();
      this.mist.setMatrixAt(i, this.dummy.matrix);
      const theta = T3.MathUtils.radToDeg(this.dummy.position.clone().sub(SPRAY_EYE).angleTo(SPRAY_AXIS)), red = this.primaryAngles[0].rainbowAngleDeg, violet = this.primaryAngles[6].rainbowAngleDeg, q2 = clamp3((red - theta) / (red - violet)) * 6, k = Math.min(5, Math.floor(q2)), color = new T3.Color(SPECTRUM[k].color).lerp(new T3.Color(SPECTRUM[k + 1].color), q2 - k), selected = ease((theta - violet + 0.13) / 0.26) * (1 - ease((theta - red + 0.13) / 0.26)) * localRainbow;
      mistColor.copy(mistBase).lerp(color, selected * 0.92);
      this.mist.setColorAt(i, mistColor);
    }
    this.mist.instanceMatrix.needsUpdate = true;
    if (this.mist.instanceColor) this.mist.instanceColor.needsUpdate = true;
    this.anchor = void 0;
    if (s.scene === "drop") this.anchor = glassA > 0.6 ? { text: "\u5149\u5728\u6C34\u91CC\u8F6C\u5F2F", point: v(4.3, 4.6, 0), side: "right" } : { text: "\u5149\u8FDB\u6C34\u6EF4", point: HERO.clone().add(this.primaryAngles[0].path.entrance.clone().multiplyScalar(1.6)), side: "left" };
    if (s.scene === "dispersion") this.anchor = { text: "\u989C\u8272\u5206\u5F00", point: HERO.clone().add(this.primary[3].points[1].clone().lerp(this.primary[3].points[2], 0.72)), side: "right" };
    if (s.scene === "reflection") this.anchor = { text: "\u56DE\u5934\u4E00\u6B21", point: HERO.clone().add(this.primaryAngles[0].path.firstHit.clone().multiplyScalar(1.6)), side: "right" };
    if (s.scene === "angle" && frame >= (timeline.clips.find((c) => c.id === "r018")?.start ?? start("angle")) - 10) this.anchor = { text: "\u7EA642\xB0", point: HERO.clone().add(this.primaryAngles[0].path.exit.clone().multiplyScalar(1.6)), side: "right", color: "#c55d4a" };
    if (s.scene === "angle" && frame >= (axisNarrative?.start ?? start("cone")) + 45) this.anchor = { text: "\u80CC\u5BF9\u592A\u9633\u7684\u65B9\u5411", point: this.eye.clone().addScaledVector(this.axisDir, 3), side: "right" };
    if (s.scene === "cone") this.anchor = nearAlpha > 0.45 ? { text: "\u540C\u4E00\u4E2A\u65B9\u5411", point: this.nearDrop.position.clone().lerp(this.farDrop.position, 0.4), side: "right" } : { text: "\u773C\u775B\u662F\u5706\u9525\u7684\u9876\u70B9", point: this.eye.clone(), side: "left" };
    if (s.scene === "circle") this.anchor = { text: lift > 16.2 ? "\u5B8C\u6574\u7684\u5706" : "\u5730\u9762\u906E\u4F4F\u4E86\u4E0B\u534A\u5708", point: v(0, lift + 1, -8), side: "left" };
    if (s.scene === "observer") this.anchor = { text: "\u6C34\u6EF4\u6362\u4E00\u6279", point: this.eye.clone(), side: "right" };
    if (s.scene === "secondary") this.anchor = { text: subMicro > 0.3 ? "\u591A\u4E00\u6B21\u53CD\u5C04" : clipP("r037", frame) > 0 ? "\u4E24\u9053\u8679\u4E4B\u95F4\u7684\u6697\u5E26" : "\u7EA651\xB0", point: subMicro > 0.3 ? HERO.clone().add(this.secondaryAngles[0].path.secondHit.clone().multiplyScalar(1.6)) : this.ringPoint(deg(48), Math.PI / 2), side: "right", color: "#7968a8" };
    if (s.scene === "return") this.anchor = { text: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE", point: v(-3, 2, 3), side: "left" };
    this.group.updateMatrixWorld(true);
  }
  dispose() {
    this.group.traverse((o) => {
      const m = o;
      m.geometry?.dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((m2) => m2.dispose());
    });
    this.energy.dispose();
    if (this.cinema) this.cinema.dispose();
    else this.environment.dispose();
  }
};

// src/CameraPathV06.ts
import * as T4 from "three";
var clamp5 = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
var valid = (x, fallback) => Number.isFinite(x) ? x : fallback;
var pose = (position, target, fov) => ({ position, target, fov });
var shot = (start, end) => ({ start, end });
var defaultScenesV06 = [
  { id: "street", start: 0, end: 1020 },
  { id: "drop", start: 1020, end: 2100 },
  { id: "dispersion", start: 2100, end: 3180 },
  { id: "reflection", start: 3180, end: 4140 },
  { id: "angle", start: 4140, end: 4680 },
  { id: "cone", start: 4680, end: 5400 },
  { id: "circle", start: 5400, end: 6360 },
  { id: "observer", start: 6360, end: 7140 },
  { id: "secondary", start: 7140, end: 8100 },
  { id: "return", start: 8100, end: 8850 },
  { id: "coda", start: 8850, end: 9e3 }
];
var defaultPosesV06 = {
  street: shot(pose([0.15, 2.2, 10.5], [0, 3, -7], 64), pose([3.2, 3.25, 13], [0, 2.75, -2], 57)),
  drop: shot(pose([29.8, 3.75, 9.2], [32, 2.6, 0], 43), pose([34.5, 3.25, 5.2], [32, 2.6, 0], 38)),
  dispersion: shot(pose([34.5, 3.25, 5.2], [32, 2.6, 0], 38), pose([32.6, 3.15, 6.9], [31.3, 2.6, 0], 39)),
  reflection: shot(pose([32.6, 3.15, 6.9], [31.3, 2.6, 0], 39), pose([27.8, 3.55, 8.1], [30.9, 2.6, 0], 43)),
  angle: shot(pose([27.8, 3.55, 8.1], [30.9, 2.6, 0], 43), pose([29, 4.1, 10], [31, 2.6, 0], 44)),
  cone: shot(pose([11, 8.1, 22], [0, 2.65, 0], 45), pose([6.2, 6.9, 22], [0, 2.65, 0], 47)),
  circle: shot(pose([6.2, 6.9, 22], [0, 2.65, 0], 47), pose([1.2, 2.6, 11.2], [0, 3, -8], 64)),
  observer: shot(pose([1.2, 2.6, 11.2], [0, 3, -8], 64), pose([9, 6, 21], [0, 2.7, 1], 49)),
  secondary: shot(pose([2, 3.65, 17.2], [0, 3.1, -5], 61), pose([3.2, 3.45, 16], [0, 3, -5], 59)),
  return: shot(pose([3.2, 3.45, 16], [0, 3, -5], 59), pose([0.6, 2.35, 11.5], [0, 3, -6], 63)),
  coda: shot(pose([0.6, 2.35, 11.5], [0, 3, -6], 63), pose([0.15, 2.2, 10.5], [0, 3.1, -7], 64))
};
var sceneList = (options) => {
  const source2 = options.scenes?.length ? options.scenes : defaultScenesV06;
  const sorted = source2.filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start).map((s) => ({ ...s })).sort((a, b) => a.start - b.start);
  return sorted.length ? sorted : [{ ...defaultScenesV06[0] }];
};
function cleanPose(p2) {
  const triplet = (v2, fallback) => v2.map((x, i) => valid(x, fallback[i]));
  const position = triplet(p2.position, [0, 2, 10]);
  let target = triplet(p2.target, [0, 2, 0]);
  if (new T4.Vector3(...position).distanceToSquared(new T4.Vector3(...target)) < 1e-10) target = [position[0], position[1], position[2] - 1];
  return { position, target, fov: clamp5(valid(p2.fov, 45), 24, 75) };
}
function compileCameraKeysV06(options = {}) {
  if (options.keyframes?.length) {
    const result = options.keyframes.filter((k) => Number.isFinite(k.frame)).map((k) => ({ ...cleanPose(k), frame: k.frame })).sort((a, b) => a.frame - b.frame);
    const unique = result.filter((k, i, a) => i === a.length - 1 || k.frame !== a[i + 1].frame);
    if (unique.length) return unique;
  }
  const scenes = sceneList(options);
  const handoffs = scenes.map((scene, i) => {
    if (i === 0) return 0;
    const explicit = typeof options.handoffFrames === "number" ? options.handoffFrames : options.handoffFrames?.[scene.id];
    const standard = scene.id === "drop" || scene.id === "cone" ? 210 : 60;
    return Math.max(0, Math.min(valid(explicit ?? standard, 60), 0.8 * (scene.end - scene.start), 0.8 * (scenes[i - 1].end - scenes[i - 1].start)));
  });
  const keys = [];
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i], id = scene.id;
    const current = options.poses?.[id] ?? defaultPosesV06[id] ?? defaultPosesV06.street;
    const start = scene.start + handoffs[i] / 2;
    const end = scene.end - (handoffs[i + 1] ?? 0) / 2;
    keys.push({ ...cleanPose(current.start), frame: start }, { ...cleanPose(current.end), frame: Math.max(start + 1e-3, end) });
    if (i > 0) {
      const left = scenes[i - 1].end - handoffs[i] / 2, right = start;
      for (const bridge of options.bridgePoses?.[id] ?? []) {
        if (bridge.progress > 0 && bridge.progress < 1) keys.push({ ...cleanPose(bridge.pose), frame: left + (right - left) * bridge.progress });
      }
    }
  }
  keys.sort((a, b) => a.frame - b.frame);
  return keys.filter((k, i, a) => i === a.length - 1 || Math.abs(k.frame - a[i + 1].frame) > 1e-8);
}
function keyVelocity(keys, index, field, axis = 0) {
  const value = (i) => field === "fov" ? keys[i].fov : keys[i][field][axis];
  const slope = (a2, b2) => (value(b2) - value(a2)) / (keys[b2].frame - keys[a2].frame);
  if (keys.length < 2) return 0;
  if (index === 0) return slope(0, 1);
  if (index === keys.length - 1) return slope(index - 1, index);
  const a = slope(index - 1, index), b = slope(index, index + 1);
  if (a * b <= 0) return 0;
  const before = keys[index].frame - keys[index - 1].frame, after = keys[index + 1].frame - keys[index].frame;
  const w1 = 2 * after + before, w2 = after + 2 * before;
  const harmonic = (w1 + w2) / (w1 / a + w2 / b);
  return Math.sign(a) * Math.min(Math.abs(harmonic), 2 * Math.min(Math.abs(a), Math.abs(b)));
}
function quintic(a, b, va, vb, dt, u) {
  const d = b - a, v0 = va * dt, v1 = vb * dt;
  const c3 = 10 * d - 6 * v0 - 4 * v1, c4 = -15 * d + 8 * v0 + 7 * v1, c5 = 6 * d - 3 * v0 - 3 * v1;
  return a + v0 * u + c3 * u * u * u + c4 * u * u * u * u + c5 * u * u * u * u * u;
}
function createCameraSamplerV06(options = {}) {
  const keys = compileCameraKeysV06(options), scenes = sceneList(options), fps = Math.max(1, valid(options.fps ?? 30, 30));
  const velocities = keys.map((_, i) => ({ position: [0, 1, 2].map((axis) => keyVelocity(keys, i, "position", axis)), target: [0, 1, 2].map((axis) => keyVelocity(keys, i, "target", axis)), fov: keyVelocity(keys, i, "fov") }));
  return (input) => {
    const frame = clamp5(valid(input, keys[0]?.frame ?? 0), keys[0]?.frame ?? 0, keys.at(-1)?.frame ?? 0);
    let index = Math.max(0, keys.findIndex((k, i) => i < keys.length - 1 && frame < keys[i + 1].frame));
    if (frame >= keys.at(-1).frame) index = Math.max(0, keys.length - 2);
    const a = keys[index], b = keys[Math.min(index + 1, keys.length - 1)], dt = Math.max(1e-6, b.frame - a.frame), u = clamp5((frame - a.frame) / dt);
    const value = (field, axis = 0) => quintic(field === "fov" ? a.fov : a[field][axis], field === "fov" ? b.fov : b[field][axis], field === "fov" ? velocities[index].fov : velocities[index][field][axis], field === "fov" ? velocities[Math.min(index + 1, keys.length - 1)].fov : velocities[Math.min(index + 1, keys.length - 1)][field][axis], dt, u);
    const p2 = cleanPose({ position: [value("position", 0), value("position", 1), value("position", 2)], target: [value("target", 0), value("target", 1), value("target", 2)], fov: value("fov") });
    const position = new T4.Vector3(...p2.position), target = new T4.Vector3(...p2.target);
    const matrix = new T4.Matrix4().lookAt(position, target, new T4.Vector3(0, 1, 0));
    const quaternion = new T4.Quaternion().setFromRotationMatrix(matrix).normalize();
    const scene = scenes.find((s) => frame >= s.start && frame < s.end) ?? (frame < scenes[0].start ? scenes[0] : scenes.at(-1));
    return { ...p2, frame, seconds: frame / fps, scene: scene.id, sceneProgress: clamp5((frame - scene.start) / (scene.end - scene.start)), quaternion };
  };
}
var defaultSampler = createCameraSamplerV06();

// src/CinematicRouteV07.ts
var p = (position, target, fov = 45) => ({ position, target, fov });
var hero = [0, 4.25, 0];
var posesV06 = {
  street: { start: p([0, 2.4, 16], [0, 5, -8], 52), end: p([4.4, 3.8, 13], [0, 5, -6], 50) },
  drop: { start: p([1.7, 4.9, 7.3], hero, 45), end: p([0.3, 4.7, 7.1], hero, 45) },
  dispersion: { start: p([0.3, 4.7, 7.1], hero, 45), end: p([-0.8, 4.7, 7.4], hero, 45) },
  reflection: { start: p([-0.8, 4.7, 7.4], hero, 45), end: p([-1.8, 5.2, 9.8], [-0.3, 3.05, 0], 50) },
  angle: { start: p([-1.8, 5, 9.6], [0, 3.2, 0], 50), end: p([3.7, 6.5, 13], [0, 3.5, 0], 49) },
  cone: { start: p([18, 10, 23], [0, 3, -3], 48), end: p([-9, 8, 25], [0, 3, -3], 48) },
  circle: { start: p([0, 5, 25], [0, 4, -6], 52), end: p([2, 5.5, 25], [0, 4, -6], 52) },
  observer: { start: p([4, 6.2, 26], [0, 3, -3], 48), end: p([12, 7.2, 24], [2, 3, -3], 48) },
  secondary: { start: p([1.4, 5, 8.2], hero, 45), end: p([0, 4.5, 25], [0, 5, -8], 51) },
  return: { start: p([-7, 4.4, 11], [-3, 2, 3], 49), end: p([-4, 2.7, 9], [-3, 1.7, 3], 47) },
  references: { start: p([-4, 2.7, 9], [-3, 1.7, 3], 47), end: p([-3.5, 2.7, 8.7], [-3, 1.7, 3], 47) }
};
function buildFilmCameraKeys() {
  const keys = [];
  timeline.scenes.forEach((s, i) => {
    const duration = s.end - s.start, track = posesV06[s.id] ?? posesV06.street;
    const bridge = i === 0 ? 0 : Math.min(100, duration * 0.15);
    const tail = i === timeline.scenes.length - 1 ? 0 : Math.min(100, duration * 0.15);
    const key = (f2, pose2) => keys.push({ ...pose2, frame: f2 });
    if (s.id === "drop") {
      const cup = timeline.clips.find((c) => c.id === "r007");
      key(s.start + bridge, track.start);
      if (cup && cup.start > s.start && cup.end < s.end) {
        key(cup.start - 12, track.start);
        key(cup.start + 60, p([4.9, 4.8, 6.2], [4.3, 4.15, 0], 46));
        key(cup.end - 55, p([4.55, 4.7, 6.4], [4.3, 4.15, 0], 46));
        key(cup.end + 50, track.end);
      }
      key(s.end - tail, track.end);
    } else if (s.id === "dispersion") {
      const near = timeline.clips.find((c) => c.id === "r010" && c.scene === s.id), hold = timeline.clips.find((c) => c.id === "r011" && c.scene === s.id);
      key(s.start + bridge, track.start);
      if (near && hold) {
        key(near.start + Math.min(100, near.duration * 0.45), p([0.8, 4.95, 5.7], [0.1, 4.25, 0], 42));
        key(hold.end - 60, p([-0.6, 4.8, 5.9], [-0.15, 4.1, 0], 42));
      }
      key(s.end - tail, track.end);
    } else if (s.id === "reflection") {
      const a = timeline.clips.find((c) => c.id === "r013" && c.scene === s.id), b = timeline.clips.find((c) => c.id === "r014" && c.scene === s.id);
      key(s.start + bridge, track.start);
      if (a && b) {
        key(a.start + a.duration * 0.65, p([1.05, 5, 6.3], [0.5, 4.15, 0], 49));
        key(b.start + b.duration * 0.65, p([-0.8, 4.7, 8.6], [-0.35, 2.95, 0], 50));
      }
      key(s.end - tail, track.end);
    } else if (s.id === "angle") {
      const angle = timeline.clips.find((c) => c.id === "r018"), eye = timeline.clips.find((c) => c.id === "r019"), axis = timeline.clips.find((c) => c.id === "r020");
      key(s.start + bridge, track.start);
      if (angle && eye && axis) {
        key(angle.end - 35, p([-1.55, 5.3, 9.3], [0, 3.6, 0], 49));
        key(eye.start + Math.min(150, eye.duration * 0.72), p([17, 9.5, 22], [0, 3, -3], 48));
        key(axis.end - 35, p([18, 10, 23], [0, 3, -3], 48));
      } else {
        key(s.end - tail, track.end);
      }
    } else if (s.id === "circle") {
      const rise = timeline.clips.find((c) => c.id === "r027" && c.scene === s.id), hold = timeline.clips.find((c) => c.id === "r028" && c.scene === s.id);
      const up = rise?.start ?? s.start + duration * 0.32, down = hold?.end ?? s.start + duration * 0.94;
      key(s.start + bridge, track.start);
      key(Math.max(s.start + bridge + 1, up - 20), p([0.4, 5.2, 25], [0, 4, -6], 52));
      key(up + Math.min(rise?.duration ?? duration * 0.23, 160), p([0.8, 23.2, 29], [0, 15.5, -7], 54));
      key(Math.max(up + 180, down - 120), p([1.2, 23.2, 29], [0, 15.5, -7], 54));
      key(s.end + 55, track.end);
    } else if (s.id === "secondary") {
      const a = timeline.clips.find((c) => c.id === "r034"), b = timeline.clips.find((c) => c.id === "r035");
      key(s.start + Math.min(bridge, duration * 0.04), p([16, 8, 24], [0, 4, -5], 50));
      key((a?.start ?? s.start + duration * 0.2) + 60, track.start);
      key((b?.start ?? s.start + duration * 0.4) - 20, p([-0.5, 4.8, 8.8], hero, 45));
      key((b?.start ?? s.start + duration * 0.4) + Math.min(180, (b?.duration ?? 210) * 0.8), track.end);
      key(s.end - tail, p([2, 5, 25], [0, 5, -8], 51));
    } else {
      key(s.start + bridge, track.start);
      key(s.end - tail, track.end);
    }
  });
  return keys;
}
var filmCameraKeys = buildFilmCameraKeys();
var sampleFilmCamera = createCameraSamplerV06({ fps: 30, scenes: timeline.scenes, keyframes: filmCameraKeys });
export {
  EYE,
  HERO,
  WorldV07,
  buildFilmCameraKeys,
  clamp3 as clamp,
  clipP,
  ease,
  filmCameraKeys,
  posesV06,
  sampleFilmCamera,
  sceneP,
  stateAt,
  timeline
};
