// src/WorldV10.ts
import * as T8 from "three";

// src/RainbowAtmosphereV09.ts
import * as T from "three";
var VOLUME_NAME = "observer-centred-rainbow-rain-volume-v09";
var VOLUME_WEIGHTS = [0.17, 0.13, 0.08];
var CORE_WEIGHT = 0.62;
var vertexShader = (
  /* glsl */
  `
  attribute vec3 color;
  varying vec3 vSpectrum;
  varying vec2 vRibbon;
  varying float vOpticalDistance;
  varying float vWorldY;
  uniform vec3 uOpticalOrigin;
  uniform float uDistanceScale;
  void main() {
    vSpectrum = color;
    vRibbon = uv;
    // Moving along an observer ray retains every wavelength's exact angle.
    vec3 samplePosition = uOpticalOrigin + (position-uOpticalOrigin)*uDistanceScale;
    vOpticalDistance = length(samplePosition-uOpticalOrigin);
    vWorldY=(modelMatrix*vec4(samplePosition,1.0)).y;
    gl_Position = projectionMatrix*modelViewMatrix*vec4(samplePosition,1.0);
  }
`
);
var fragmentShader = (
  /* glsl */
  `
  varying vec3 vSpectrum;
  varying vec2 vRibbon;
  varying float vOpticalDistance;
  varying float vWorldY;
  uniform float uOpacity;
  uniform float uTime;
  uniform float uSecondary;
  uniform float uLayerWeight;
  uniform float uVeil;
  uniform float uPatch;
  void main() {
    float x = clamp(vRibbon.x,0.0,1.0);
    float feather = mix(.055,.115,uVeil);
    float edge = smoothstep(0.0,feather,x)*(1.0-smoothstep(1.0-feather,1.0,x));
    // Broad, seamless wet-air density. No random grain or sparkle.
    float phi = vRibbon.y*mix(6.28318530718,.35,uPatch);
    float density = .89 + .075*cos(2.0*phi+uTime*.014)
      + .035*sin(5.0*phi-uTime*.009);
    float radialDensity = .82 + .18*exp(-pow(abs((x-.23)/.50),2.0));
    float patchEnds = mix(smoothstep(0.0,1.5,vWorldY),
      smoothstep(0.0,.24,vRibbon.y)*(1.0-smoothstep(.76,1.0,vRibbon.y)),uPatch);
    float gain = mix(1.30,.84,uSecondary);
    float opticalDepth = max(0.0,uOpacity)*uLayerWeight*gain*edge*radialDensity*density*patchEnds;
    // An art-directed thin medium approximation, not a ray-marched volume.
    float extinction = exp(-min(vOpticalDistance*.0018,1.0));
    float alpha = (1.0-exp(-opticalDepth))*extinction;
    vec3 wetAir = vec3(.82,.90,.95);
    // Colour comes only from the computed, linear RGB geometry. In particular,
    // the secondary rainbow is reversed by its angles, never by this shader.
    vec3 radiance = mix(vSpectrum,wetAir,.16+.07*uSecondary+.055*uVeil)*1.08;
    gl_FragColor = vec4(radiance,alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`
);
function atmosphericRainbowMaterial(secondary = false) {
  const material = new T.ShaderMaterial({
    name: secondary ? "secondary-atmosphere-v09" : "primary-atmosphere-v09",
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: T.DoubleSide,
    vertexColors: false,
    blending: T.NormalBlending,
    premultipliedAlpha: false,
    uniforms: {
      uOpacity: { value: secondary ? 0.7 : 0.92 },
      uTime: { value: 0 },
      uSecondary: { value: secondary ? 1 : 0 },
      uLayerWeight: { value: 1 },
      uVeil: { value: 0 },
      uPatch: { value: 0 },
      uOpticalOrigin: { value: new T.Vector3() },
      uDistanceScale: { value: 1 }
    },
    vertexShader,
    fragmentShader
  });
  material.opacity = secondary ? 0.7 : 0.92;
  material.userData.rainbowAtmosphereV09 = true;
  return material;
}
function attachAtmosphericRainbowVolume(mesh, opticalOriginLocal, mode = "sky") {
  const source2 = mesh.material;
  if (!source2.uniforms?.uDistanceScale) throw new Error("Use the V09 atmospheric rainbow material before attaching its volume");
  const old = mesh.children.find((child) => child.name === VOLUME_NAME);
  const patch = mode === "sky" ? 0 : 1;
  source2.uniforms.uOpticalOrigin.value.copy(opticalOriginLocal);
  source2.uniforms.uPatch.value = patch;
  source2.uniforms.uLayerWeight.value = CORE_WEIGHT;
  if (old) {
    old.children.forEach((child) => {
      const material = child.material;
      material.uniforms.uOpticalOrigin.value.copy(opticalOriginLocal);
      material.uniforms.uPatch.value = patch;
    });
    return old;
  }
  const group = new T.Group();
  group.name = VOLUME_NAME;
  const scales = patch ? [0.994, 1.01, 1.024] : [0.984, 1.016, 1.043];
  VOLUME_WEIGHTS.forEach((weight, index) => {
    const material = source2.clone();
    material.name = `rainbow-atmosphere-depth-${index}`;
    material.uniforms.uLayerWeight.value = weight;
    material.uniforms.uVeil.value = 1;
    material.uniforms.uDistanceScale.value = scales[index];
    const layer = new T.Mesh(mesh.geometry, material);
    layer.frustumCulled = false;
    layer.name = `rainbow-depth-sample-${index}`;
    layer.renderOrder = mesh.renderOrder;
    group.add(layer);
  });
  mesh.add(group);
  return group;
}
function updateAtmosphericRainbow(mesh, frame) {
  const source2 = mesh.material;
  if (!source2.uniforms?.uTime) return;
  const time = frame / 30;
  source2.uniforms.uTime.value = time;
  source2.uniforms.uOpacity.value = source2.opacity;
  const volume = mesh.children.find((child) => child.name === VOLUME_NAME);
  volume?.children.forEach((child) => {
    const material = child.material;
    material.uniforms.uTime.value = time;
    material.uniforms.uOpacity.value = source2.opacity;
  });
}

// src/MacroLookV09.ts
import * as T3 from "three";

// src/SpectralRibbonV09.ts
import * as T2 from "three";
var unit = (n) => Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0;
var VERTEX = (
  /* glsl */
  `
attribute vec3 spectralColour;
varying vec2 vUv;
varying vec3 vColour;
void main(){vUv=uv;vColour=spectralColour;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}
`
);
var FRAGMENT = (
  /* glsl */
  `
uniform float uOpacity;
uniform float uPortion;
uniform float uColourLevel;
uniform float uTime;
uniform float uSeed;
uniform float uExit;
varying vec2 vUv;
varying vec3 vColour;
void main(){
  if(uPortion<=0.||vUv.x>uPortion)discard;
  float spectralEdge=smoothstep(0.,.065,vUv.y)*(1.-smoothstep(.935,1.,vUv.y));
  float ends=smoothstep(0.,.013,vUv.x)*(1.-smoothstep(max(0.,uPortion-.012),uPortion,vUv.x));
  float wave=fract(vUv.x*.65-uTime*.16+uSeed);
  float pulse=exp(-pow(abs((wave-.5)/.105),2.));
  float middle=.66+.34*exp(-pow(abs((vUv.y-.5)/.36),2.));
  float alpha=uOpacity*spectralEdge*ends*middle*(.90+.10*pulse)*mix(.48,.54,uExit);
  vec3 colour=mix(vec3(.96,.95,.90),vColour,uColourLevel);
  gl_FragColor=vec4(colour,alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`
);
var SpectralRibbonV09 = class {
  group = new T2.Group();
  fields = [];
  disposed = false;
  constructor(inputs) {
    this.group.name = "v09-continuous-spectrum-on-verified-Snell-segments";
    this.group.userData.provenance = "Locally authored by Codex; no incomplete Opus code integrated";
    for (const role of ["primary", "secondary"]) {
      const rows = inputs.filter((p2) => p2.role === role && p2.points.length >= 3 && p2.points.every((v2) => v2.toArray().every(Number.isFinite))).map((p2) => ({ points: p2.points.map((v2) => v2.clone()), colour: new T2.Color(p2.color) }));
      if (rows.length < 2) continue;
      const count = Math.min(...rows.map((p2) => p2.points.length)) - 1;
      for (let segment = 1; segment < count; segment++) {
        const positions = [], colours = [], uv = [], indices = [];
        const spectralSteps = (rows.length - 1) * 8, alongSteps = 16;
        for (let i = 0; i <= spectralSteps; i++) {
          const spectral = i / spectralSteps, inter = spectral * (rows.length - 1), a = Math.min(rows.length - 2, Math.floor(inter)), portion = inter - a;
          const start = rows[a].points[segment].clone().lerp(rows[a + 1].points[segment], portion), end = rows[a].points[segment + 1].clone().lerp(rows[a + 1].points[segment + 1], portion);
          const colour = rows[a].colour.clone().lerp(rows[a + 1].colour, portion);
          for (let j = 0; j <= alongSteps; j++) {
            const p2 = start.clone().lerp(end, j / alongSteps);
            positions.push(p2.x, p2.y, p2.z);
            colours.push(colour.r, colour.g, colour.b);
            uv.push(j / alongSteps, spectral);
            if (i < spectralSteps && j < alongSteps) {
              const n = i * (alongSteps + 1) + j;
              indices.push(n, n + 1, n + alongSteps + 1, n + 1, n + alongSteps + 2, n + alongSteps + 1);
            }
          }
        }
        const g = new T2.BufferGeometry();
        g.setAttribute("position", new T2.Float32BufferAttribute(positions, 3));
        g.setAttribute("spectralColour", new T2.Float32BufferAttribute(colours, 3));
        g.setAttribute("uv", new T2.Float32BufferAttribute(uv, 2));
        g.setIndex(indices);
        g.computeBoundingSphere();
        const m = new T2.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, side: T2.DoubleSide, toneMapped: false, blending: T2.NormalBlending, uniforms: { uOpacity: { value: 0 }, uPortion: { value: 0 }, uColourLevel: { value: 0 }, uTime: { value: 0 }, uSeed: { value: segment * 0.117 + (role === "secondary" ? 0.24 : 0) }, uExit: { value: segment === count - 1 ? 1 : 0 } }, vertexShader: VERTEX, fragmentShader: FRAGMENT });
        const mesh = new T2.Mesh(g, m);
        mesh.name = `continuous-${role}-spectrum-segment-${segment}`;
        mesh.renderOrder = 11;
        mesh.frustumCulled = false;
        this.group.add(mesh);
        this.fields.push({ mesh, segment, segmentCount: count, role });
      }
    }
  }
  update(frame, primaryReveal, primaryOpacity, secondaryReveal, secondaryOpacity, colourLevel) {
    if (this.disposed) return;
    const colour = unit(colourLevel), time = Number.isFinite(frame) ? Math.max(0, frame) / 30 : 0;
    for (const f2 of this.fields) {
      const opacity = unit(f2.role === "primary" ? primaryOpacity : secondaryOpacity), reveal = unit(f2.role === "primary" ? primaryReveal : secondaryReveal);
      const portion = unit(reveal * f2.segmentCount - f2.segment), u = f2.mesh.material.uniforms;
      u.uOpacity.value = opacity * (f2.role === "secondary" ? 1 : colour);
      u.uPortion.value = portion;
      u.uTime.value = time;
      u.uColourLevel.value = f2.role === "secondary" ? 1 : colour;
      f2.mesh.visible = opacity > 1e-4 && portion > 1e-4 && (f2.role === "secondary" || colour > 1e-4);
    }
    this.group.visible = this.fields.some((f2) => f2.mesh.visible);
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const f2 of this.fields) {
      f2.mesh.geometry.dispose();
      f2.mesh.material.dispose();
    }
    this.fields = [];
    this.group.clear();
  }
};

// src/MacroLookV09.ts
var bounded = (x) => Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0;
var ease = (x) => {
  const t = bounded(x);
  return t * t * (3 - 2 * t);
};
var SURFACE_VERTEX = (
  /* glsl */
  `
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocalNormal;
void main(){
  vec4 p=modelViewMatrix*vec4(position,1.0);
  vNormal=normalize(normalMatrix*normal);
  vView=normalize(-p.xyz);
  vLocalNormal=normal;
  gl_Position=projectionMatrix*p;
}`
);
var SURFACE_FRAGMENT = (
  /* glsl */
  `
uniform float uOpacity;
uniform float uReadability;
varying vec3 vNormal;
varying vec3 vView;
varying vec3 vLocalNormal;
void main(){
  vec3 n=normalize(vNormal),view=normalize(vView);
  float incidence=clamp(abs(dot(n,view)),0.,1.);
  // Schlick water-interface reflectance is cosmetic, not ray tracing.
  float fresnel=.02037+.97963*pow(1.-incidence,5.);
  float silhouette=pow(1.-incidence,2.5);
  float edge=pow(1.-incidence,12.);
  vec3 local=normalize(vLocalNormal);
  // Broad, quiet area-light response; no moving texture or spurious light path.
  float upper=pow(max(0.,dot(local,normalize(vec3(-.45,.67,.62)))),45.);
  float lower=pow(max(0.,dot(local,normalize(vec3(.58,-.31,-.73)))),65.);
  float stripe=exp(-pow(abs((local.x+.55)*13.),2.))*smoothstep(-.30,.42,local.y);
  vec3 shade=mix(vec3(.34,.61,.68),vec3(.88,.96,1.),clamp(upper+stripe*.25,0.,1.));
  shade=mix(shade,vec3(.94,.91,.78),lower*.40);
  float a=(fresnel*.115+silhouette*.10+edge*.075+upper*.125+lower*.055+stripe*.022)*uOpacity;
  a*=mix(1.,.75,uReadability);
  gl_FragColor=vec4(shade,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`
);
var MacroLookV09 = class {
  group = new T3.Group();
  context = new T3.Group();
  waterMaterial;
  spectrum;
  shell;
  body;
  originalMaterial;
  legacyRim;
  originalRimVisible;
  contextMaterials = /* @__PURE__ */ new Set();
  disposed = false;
  constructor(drop, rim, paths = []) {
    this.body = drop;
    this.legacyRim = rim;
    this.originalMaterial = drop.material;
    this.originalRimVisible = rim.visible;
    this.group.name = "v08-exact-water-interface-photographic-finish";
    this.waterMaterial = new T3.MeshPhysicalMaterial({
      color: "#eefaff",
      roughness: 0.036,
      metalness: 0,
      transmission: 0.978,
      ior: 1.333,
      thickness: 3.2,
      attenuationColor: new T3.Color("#bedfe7"),
      attenuationDistance: 12,
      envMapIntensity: 0.98,
      clearcoat: 0.18,
      clearcoatRoughness: 0.052,
      specularIntensity: 0.83,
      specularColor: new T3.Color("#f3fbff"),
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      depthTest: true,
      side: T3.FrontSide
    });
    drop.material = this.waterMaterial;
    drop.renderOrder = 4;
    const material = new T3.ShaderMaterial({
      transparent: true,
      depthTest: true,
      depthWrite: false,
      side: T3.FrontSide,
      blending: T3.NormalBlending,
      uniforms: { uOpacity: { value: 0 }, uReadability: { value: 0 } },
      vertexShader: SURFACE_VERTEX,
      fragmentShader: SURFACE_FRAGMENT
    });
    this.shell = new T3.Mesh(new T3.SphereGeometry(1.605, 192, 128), material);
    this.shell.name = "restrained-water-Fresnel-interface";
    this.shell.renderOrder = 9;
    this.context.name = "botanical-macro-reference-leaves-off-screen";
    this.context.visible = false;
    this.spectrum = new SpectralRibbonV09(paths);
    this.group.add(this.shell, this.context, this.spectrum.group);
  }
  /** Add the local Blender GLB. This method owns the hanging-drop placement. */
  attachContext(leaf) {
    if (this.disposed) return;
    leaf.rotation.set(-Math.PI / 2, 0, 0);
    const originalTipY = -1.705 + 0.1 * Math.cos(-4.7 * 0.43) + 0.045 * Math.sin(-4.7 * 0.88);
    leaf.position.set(4.7, 1.6 + originalTipY, 0);
    this.context.add(leaf);
    leaf.traverse((o) => {
      const mesh = o;
      if (!mesh.isMesh) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const clones = materials.map((m) => {
        const c = m.clone();
        c.userData.macroV08BaseOpacity = c.opacity;
        const surface = c;
        if (surface.isMeshStandardMaterial && surface.name.includes("botanical")) {
          surface.emissive.set("#183c25");
          surface.emissiveIntensity = 0.14;
          surface.side = T3.DoubleSide;
          surface.roughness = 0.39;
        }
        this.contextMaterials.add(c);
        return c;
      });
      mesh.material = Array.isArray(mesh.material) ? clones : clones[0];
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    });
  }
  update(frame, primaryReveal, primaryOpacity, secondaryReveal, secondaryOpacity, colourLevel, camera, contextPresence = 0) {
    if (this.disposed) return;
    const visible = Math.max(bounded(primaryOpacity), bounded(secondaryOpacity));
    const read = ease(Math.max(primaryReveal, secondaryReveal) * 2 - 0.63) * ease(colourLevel + 0.3);
    this.group.visible = visible > 1e-4;
    this.waterMaterial.opacity = visible * (0.82 - 0.19 * read);
    this.waterMaterial.envMapIntensity = 0.93 - 0.19 * read;
    this.waterMaterial.roughness = 0.033 + 0.012 * read;
    this.shell.material.uniforms.uOpacity.value = visible;
    this.shell.material.uniforms.uReadability.value = read;
    this.legacyRim.visible = false;
    this.spectrum.update(frame, primaryReveal, primaryOpacity, secondaryReveal, secondaryOpacity, colourLevel);
    const presence = bounded(contextPresence) * visible;
    const departure = 1 - ease(contextPresence);
    this.context.position.set(-departure * 17, -departure * 0.6, -departure * 0.5);
    this.context.rotation.y = -0.17 - departure * 0.07;
    this.context.rotation.z = 0.13;
    this.context.rotation.x = 0.12;
    this.context.visible = contextPresence > 1e-4 && visible > 1e-4;
    for (const m of this.contextMaterials) {
      m.opacity = (m.userData.macroV08BaseOpacity ?? 1) * presence;
      const isTransparent = m.opacity < 0.995;
      if (m.transparent !== isTransparent) {
        m.transparent = isTransparent;
        m.needsUpdate = true;
      }
      m.depthWrite = !isTransparent;
    }
    if (camera && Number.isFinite(frame)) this.shell.userData.lastCameraDistance = camera.position.distanceTo(this.body.getWorldPosition(new T3.Vector3()));
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.body.material === this.waterMaterial) this.body.material = this.originalMaterial;
    this.legacyRim.visible = this.originalRimVisible;
    this.shell.geometry.dispose();
    this.shell.material.dispose();
    this.waterMaterial.dispose();
    this.spectrum.dispose();
    this.contextMaterials.forEach((m) => m.dispose());
    this.contextMaterials.clear();
    this.context.traverse((o) => {
      const mesh = o;
      if (mesh.isMesh) mesh.geometry.dispose();
    });
    this.group.clear();
  }
};

// src/FountainDetailV09.ts
import * as T4 from "three";
var hash = (i) => {
  let x = Math.imul(i + 9, 73244475);
  x = Math.imul(x ^ x >>> 16, 73244475);
  return ((x ^ x >>> 16) >>> 0) / 4294967296;
};
var FountainDetailV09 = class {
  group = new T4.Group();
  spray;
  tubes = [];
  constructor() {
    this.group.name = "v08-fine-ballistic-jets-and-spray";
    const count = 3600, seeds = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) {
      seeds[i * 4] = hash(i * 4);
      seeds[i * 4 + 1] = hash(i * 4 + 1);
      seeds[i * 4 + 2] = hash(i * 4 + 2);
      seeds[i * 4 + 3] = hash(i * 4 + 3);
    }
    const g = new T4.BufferGeometry();
    g.setAttribute("position", new T4.Float32BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute("aSeed", new T4.Float32BufferAttribute(seeds, 4));
    this.spray = new T4.Points(g, new T4.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: T4.NormalBlending,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uRainbow: { value: 0 } },
      vertexShader: `attribute vec4 aSeed;uniform float uTime;uniform float uOpacity;uniform float uRainbow;varying float vAlpha;varying vec3 vColour;
        void main(){float life=fract(aSeed.x+uTime*(.47+.16*aSeed.y));float t=life*1.18;
          float azimuth=aSeed.z*6.2831853;float speed=.34+aSeed.w*.69;
          vec3 p=vec3(-3.,.86,3.)+vec3(cos(azimuth)*speed*t,(5.15+.75*aSeed.y)*t-4.905*t*t,sin(azimuth)*speed*t-.16*t*t);
          vec4 view=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*view;
          float radius=.004+aSeed.w*.008;gl_PointSize=clamp(radius*1080./max(.1,-view.z),.65,5.5);
          float born=smoothstep(0.,.065,life);float death=1.-smoothstep(.81,1.,life);
          vAlpha=uOpacity*born*death*(p.y>0.?1.:0.)*(.24+.53*aSeed.w);
          vec3 eye=vec3(-2.1,1.55,5.);vec3 axis=normalize(vec3(.24,-.17,-.955));
          float theta=degrees(acos(clamp(dot(normalize(p-eye),axis),-1.,1.)));
          float selected=smoothstep(40.45,40.85,theta)*(1.-smoothstep(42.2,42.65,theta))*uRainbow;
          vec3 hue=.5+.5*cos(6.2831853*(clamp((42.43-theta)/1.73,0.,1.)+vec3(0.,.67,.33)));
          vColour=mix(vec3(.84,.95,1.),hue,selected*.72);
        }`,
      fragmentShader: `varying float vAlpha;varying vec3 vColour;void main(){vec2 p=gl_PointCoord-.5;float r=length(p);if(r>.5)discard;
        float soft=exp(-r*r*21.);float glint=exp(-dot(p+vec2(.13,-.15),p+vec2(.13,-.15))*160.);
        gl_FragColor=vec4(vColour+glint*.11,vAlpha*soft);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
    }));
    this.spray.frustumCulled = false;
    this.group.add(this.spray);
    for (let k = 0; k < 9; k++) {
      const phase = k * 2 * Math.PI / 8;
      const vertical = k === 8;
      const points = [];
      for (let i = 0; i <= 90; i++) {
        const t = i / 90 * (vertical ? 1.09 : 0.98);
        points.push(new T4.Vector3(-3 + Math.cos(phase) * (vertical ? 0.02 : 0.88) * t, 0.87 + (vertical ? 5.7 : 4.8) * t - 4.905 * t * t, 3 + Math.sin(phase) * (vertical ? 0.02 : 0.88) * t));
      }
      const geometry = new T4.TubeGeometry(new T4.CatmullRomCurve3(points), 90, vertical ? 0.016 : 0.0105, 8, false);
      const material = new T4.MeshPhysicalMaterial({ color: "#d5e8eb", roughness: 0.15, metalness: 0, transmission: 0.66, ior: 1.333, thickness: 0.03, transparent: true, opacity: 0.32, depthWrite: false, envMapIntensity: 0.52 });
      const mesh = new T4.Mesh(geometry, material);
      mesh.name = `thin-continuous-water-jet-${k}`;
      this.tubes.push({ mesh, phase });
      this.group.add(mesh);
    }
  }
  update(frame, opacity, rainbow) {
    this.group.visible = opacity > 1e-3;
    const t = frame / 30;
    this.spray.material.uniforms.uTime.value = t;
    this.spray.material.uniforms.uOpacity.value = opacity;
    this.spray.material.uniforms.uRainbow.value = rainbow;
    for (const { mesh, phase } of this.tubes) {
      mesh.material.opacity = opacity * (0.33 + 0.018 * Math.sin(t * 1.2 + phase));
    }
  }
  dispose() {
    this.spray.geometry.dispose();
    this.spray.material.dispose();
    this.tubes.forEach((t) => {
      t.mesh.geometry.dispose();
      t.mesh.material.dispose();
    });
  }
};

// src/EnvironmentV09.ts
import * as T5 from "three";
var clamp = (x) => Math.max(0, Math.min(1, x));
var ease2 = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
var hash2 = (i, s) => {
  let n = Math.imul(i + 1, 2654435761) ^ s;
  n = Math.imul(n ^ n >>> 16, 2246822507);
  n = Math.imul(n ^ n >>> 13, 3266489909);
  return ((n ^ n >>> 16) >>> 0) / 4294967296;
};
var SKY_VERTEX = (
  /*glsl*/
  `
varying vec3 vWorld;
void main(){vec4 w=modelMatrix*vec4(position,1.);vWorld=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}
`
);
var SKY_FRAGMENT = (
  /*glsl*/
  `
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
   photographed=mix(vec3(luminance),photographed,.92)*vec3(.985,1.008,1.022);
   photographed=mix(photographed,vec3(.35,.43,.48),rainSide*.10);
   photographed+=vec3(.019,.012,.004)*pow(max(0.,dot(d,uSolar)),3.)*smoothstep(-.1,.22,altitude);
   colour=photographed;
 }
 // Quiet micro studio replaces the entire outdoor set through the same sky dome.
 vec3 studio=mix(vec3(.025,.057,.074),vec3(.048,.102,.134),smoothstep(-.25,.72,altitude));
 studio+=vec3(.015,.024,.026)*pow(max(0.,dot(d,normalize(vec3(-.6,.3,.7)))),8.);
 colour=mix(colour,studio,uMicro);
 gl_FragColor=vec4(colour,1.);
 #include <tonemapping_fragment>
 #include <colorspace_fragment>
}
`
);
var EnvironmentV09 = class {
  group = new T5.Group();
  environment;
  assetGroup = new T5.Group();
  scene;
  previousBackground;
  skyMaterial;
  materials = [];
  key;
  hemisphere;
  fill;
  rain;
  rainPosition;
  rainSeed;
  lastMicro = 0;
  lastFrame = 0;
  disposed = false;
  solar = new T5.Vector3(0, Math.sin(T5.MathUtils.degToRad(12)), Math.cos(T5.MathUtils.degToRad(12)));
  fog = new T5.FogExp2("#b8c9ce", 6e-3);
  previousFog;
  previousEnvironment;
  previousEnvironmentIntensity;
  studioKey;
  studioFill;
  constructor(renderer, scene) {
    this.scene = scene;
    this.previousBackground = scene.background;
    this.previousFog = scene.fog;
    this.previousEnvironment = scene.environment;
    this.previousEnvironmentIntensity = scene.environmentIntensity;
    scene.fog = this.fog;
    this.group.name = "v09-grounded-rain-after-valley";
    scene.add(this.group);
    this.assetGroup.name = "v09-authored-blender-environment";
    this.group.add(this.assetGroup);
    this.skyMaterial = new T5.ShaderMaterial({
      uniforms: { uMicro: { value: 0 }, uLandscape: { value: null }, uHasLandscape: { value: 0 }, uLandscapeRotation: { value: -0.88 }, uSolar: { value: this.solar.clone() } },
      vertexShader: SKY_VERTEX,
      fragmentShader: SKY_FRAGMENT,
      side: T5.BackSide,
      depthWrite: false,
      fog: false
    });
    const sky = new T5.Mesh(new T5.SphereGeometry(174, 64, 36), this.skyMaterial);
    sky.name = "v09-after-rain-cloud-sky";
    sky.renderOrder = -200;
    this.group.add(sky);
    scene.background = new T5.Color("#d5e4de");
    this.hemisphere = new T5.HemisphereLight("#bfd8ee", "#7c7567", 0.6);
    this.hemisphere.name = "v09-soft-overcast-sky";
    this.key = new T5.DirectionalLight("#ffedcb", 2.7);
    this.key.position.set(0, 13.3, 66.6);
    this.key.name = "v09-real-sun-behind-observer";
    this.key.target.position.set(0, 0, 4);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    Object.assign(this.key.shadow.camera, { left: -18, right: 18, top: 20, bottom: -18, near: 0.2, far: 135 });
    this.key.shadow.bias = -45e-6;
    this.key.shadow.normalBias = 6e-3;
    this.key.shadow.radius = 2.5;
    this.fill = new T5.DirectionalLight("#c0d4e7", 0.22);
    this.fill.position.set(17, 8, -19);
    this.fill.name = "v09-valley-bounce";
    this.studioKey = new T5.DirectionalLight("#edf7ff", 0);
    this.studioKey.position.set(-5.5, 10, 8);
    this.studioKey.target.position.set(0, 4, 0);
    this.studioFill = new T5.DirectionalLight("#91b7cc", 0);
    this.studioFill.position.set(7, 6, -6);
    this.studioFill.target.position.set(0, 4, 0);
    this.group.add(this.hemisphere, this.key, this.key.target, this.fill, this.studioKey, this.studioKey.target, this.studioFill, this.studioFill.target);
    this.setSolarDirection(this.solar);
    const n = 120;
    this.rainSeed = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      this.rainSeed[i * 4] = hash2(i, 213) * 50 - 25;
      this.rainSeed[i * 4 + 1] = hash2(i, 513) * 23;
      this.rainSeed[i * 4 + 2] = -14 - hash2(i, 311) * 20;
      this.rainSeed[i * 4 + 3] = 0.04 + hash2(i, 754) * 0.052;
    }
    const geometry = new T5.BufferGeometry();
    this.rainPosition = new T5.BufferAttribute(new Float32Array(n * 6), 3);
    geometry.setAttribute("position", this.rainPosition);
    this.rain = new T5.LineSegments(geometry, new T5.LineBasicMaterial({ color: "#d1e7e1", transparent: true, opacity: 0.065, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.rain.name = "v09-distant-residual-rain";
    this.group.add(this.rain);
    const reflectionScene = new T5.Scene();
    reflectionScene.background = new T5.Color("#c7d9d1");
    const envSky = new T5.Mesh(new T5.SphereGeometry(100, 32, 20), this.skyMaterial.clone());
    reflectionScene.add(envSky);
    const ground = new T5.Mesh(new T5.PlaneGeometry(250, 250), new T5.MeshBasicMaterial({ color: "#405b50", side: T5.DoubleSide }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -2;
    reflectionScene.add(ground);
    const generator = new T5.PMREMGenerator(renderer);
    this.environment = generator.fromScene(reflectionScene, 0.035, 0.1, 170);
    generator.dispose();
    envSky.geometry.dispose();
    envSky.material.dispose();
    ground.geometry.dispose();
    ground.material.dispose();
    scene.environment = this.environment.texture;
    this.update(0, 0);
  }
  /** Call before continueRender: GLB geometry and embedded PBR maps are real assets. */
  attachAsset(root) {
    if (this.assetGroup.children.length) throw new Error("V09 environment GLB already attached");
    const seen = /* @__PURE__ */ new Set();
    root.traverse((o) => {
      const mesh = o;
      if (!mesh.isMesh) return;
      mesh.castShadow = !/^valley_layer/.test(mesh.name);
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((material) => {
        if (seen.has(material)) return;
        seen.add(material);
        const p2 = material;
        if (p2.isMeshStandardMaterial) {
          if (/wet_slate|v09_slate/.test(material.name)) {
            p2.normalScale.setScalar(0.19);
            p2.roughness = 0.59;
            p2.roughnessMap = null;
            p2.envMapIntensity = 0.4;
            p2.color.set("#d2d7d3");
          } else if (/limestone|v09_edge/.test(material.name)) {
            p2.color.set(/pale|edge/.test(material.name) ? "#c7c4b4" : "#b4b5a8");
            p2.envMapIntensity = 0.32;
            p2.roughness = 0.61;
            p2.normalScale.setScalar(0.19);
          } else if (/grass_ground/.test(material.name)) {
            p2.color.set("#edf3df");
            p2.roughness = 0.93;
            p2.envMapIntensity = 0.25;
            p2.normalScale.setScalar(0.28);
          } else if (/fern|grass_medium|shrub/.test(material.name)) {
            p2.color.multiplyScalar(0.93);
            p2.roughness = 0.8;
            p2.envMapIntensity = 0.21;
            p2.side = T5.DoubleSide;
            p2.alphaTest = 0.45;
            p2.transparent = false;
            p2.depthWrite = true;
            p2.emissive.set("#192411");
            p2.emissiveIntensity = 0.045;
          } else if (/bronze|drain/.test(material.name)) {
            p2.roughness = 0.44;
            p2.envMapIntensity = 0.52;
          } else if (/mountain|pine|bank/.test(material.name)) p2.envMapIntensity = 0.18;
          [p2.map, p2.normalMap, p2.roughnessMap, p2.metalnessMap].forEach((t) => {
            if (t) t.anisotropy = 8;
          });
        }
        this.materials.push({ material, baseOpacity: material.opacity, baseTransparent: material.transparent, baseDepthWrite: material.depthWrite });
      });
    });
    this.assetGroup.add(root);
    this.update(this.lastFrame, this.lastMicro);
  }
  /** Original HDR texture, not PMREM: this keeps the actual photographed vista. */
  attachLandscape(texture, rotation = -0.88) {
    texture.wrapS = T5.RepeatWrapping;
    texture.needsUpdate = true;
    this.skyMaterial.uniforms.uLandscape.value = texture;
    this.skyMaterial.uniforms.uHasLandscape.value = 1;
    this.skyMaterial.uniforms.uLandscapeRotation.value = rotation;
  }
  update(frame, micro = 0) {
    if (this.disposed) return;
    this.lastFrame = Number.isFinite(frame) ? Math.max(0, frame) : 0;
    this.lastMicro = Number.isFinite(micro) ? clamp(micro) : 0;
    const m = ease2(this.lastMicro), time = this.lastFrame / 30, outdoor = (1 - m) * (1 - m);
    this.key.intensity = 2.7 * outdoor;
    this.hemisphere.intensity = 0.6 * outdoor + 0.045 * m;
    this.fill.intensity = 0.22 * outdoor;
    this.studioKey.intensity = 1.85 * m;
    this.studioFill.intensity = 0.36 * m;
    this.scene.environmentIntensity = 0.64 * outdoor + 0.25 * m;
    this.fog.density = 6e-3 * outdoor;
    this.scene.fog = m > 0.9999 ? null : this.fog;
    this.skyMaterial.uniforms.uMicro.value = m;
    this.assetGroup.visible = m < 0.999;
    this.materials.forEach(({ material, baseOpacity, baseTransparent, baseDepthWrite }) => {
      material.opacity = baseOpacity * (1 - m);
      const transparent = baseTransparent || m > 1e-3;
      if (material.transparent !== transparent) {
        material.transparent = transparent;
        material.needsUpdate = true;
      }
      material.depthWrite = baseDepthWrite && !transparent;
    });
    this.rain.material.opacity = 0.06 * (1 - m);
    this.rain.visible = m < 0.999;
    for (let i = 0; i < this.rainSeed.length / 4; i++) {
      const k = i * 4, x = this.rainSeed[k], phase = this.rainSeed[k + 1], z = this.rainSeed[k + 2], length = this.rainSeed[k + 3];
      const y = 23 - (phase + time * 1.87) % 23, wind = 0.013 * Math.sin(time * 0.15 + phase);
      this.rainPosition.setXYZ(i * 2, x + wind, y, z);
      this.rainPosition.setXYZ(i * 2 + 1, x + wind + 0.01, y - length, z - 9e-3);
    }
    this.rainPosition.needsUpdate = true;
    this.group.updateMatrixWorld(true);
  }
  setReflectionEnvironment(texture) {
    if (!this.disposed) this.scene.environment = texture;
  }
  /** World ground -> sun direction, exactly -axisDir; updates real shadows. */
  setSolarDirection(direction) {
    if (this.disposed) return;
    if (![direction.x, direction.y, direction.z].every(Number.isFinite) || direction.lengthSq() < 1e-10) throw new Error("Finite non-zero solar direction required");
    this.solar.copy(direction).normalize();
    this.key.target.position.set(0, 0, 4);
    this.key.position.copy(this.key.target.position).addScaledVector(this.solar, 64);
    this.skyMaterial.uniforms.uSolar.value.copy(this.solar);
    this.key.shadow.needsUpdate = true;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.key.shadow.dispose();
    this.group.removeFromParent();
    const geometries = /* @__PURE__ */ new Set(), materials = /* @__PURE__ */ new Set(), textures = /* @__PURE__ */ new Set();
    this.group.traverse((o) => {
      const mesh = o;
      if (mesh.geometry) geometries.add(mesh.geometry);
      if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach((m) => materials.add(m));
    });
    materials.forEach((m) => {
      const p2 = m;
      [p2.map, p2.normalMap, p2.roughnessMap, p2.metalnessMap, p2.aoMap].forEach((t) => {
        if (t) textures.add(t);
      });
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    if (this.scene.environment === this.environment.texture) this.scene.environment = null;
    this.environment.dispose();
    this.scene.background = this.previousBackground;
    this.scene.fog = this.previousFog;
    this.scene.environment = this.previousEnvironment;
    this.scene.environmentIntensity = this.previousEnvironmentIntensity;
  }
};

// src/OpticalEnergyV09.ts
import * as T6 from "three";
var clamp2 = (n) => Math.max(0, Math.min(1, n));
var fract = (n) => n - Math.floor(n);
var smooth = (n) => {
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
float alpha=uAlpha*edge*endFeather*mix(.76+.24*pulse,.065+.075*pulse,uHalo);
gl_FragColor=vec4(uColour,alpha);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
var GLOW_FRAGMENT = `uniform vec3 uColour;uniform float uAlpha;varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){float f=max(0.0,dot(normalize(vN),normalize(vV)));gl_FragColor=vec4(uColour,uAlpha*pow(f,2.2));
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`;
var OpticalEnergyV09 = class {
  group = new T6.Group();
  paths = [];
  geometries = /* @__PURE__ */ new Set();
  materials = /* @__PURE__ */ new Set();
  white = new T6.Color("#fff5df");
  tempColour = new T6.Color();
  tangent = new T6.Vector3();
  up = new T6.Vector3(0, 1, 0);
  normal = new T6.Vector3();
  disposed = false;
  constructor(inputs) {
    this.group.name = "v09-optical-energy-on-verified-rays";
    const bead = new T6.SphereGeometry(1, 16, 10), ring = new T6.RingGeometry(0.63, 1, 48);
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
      const path = { source: source2, points, cumulative, length, colour: new T6.Color(source2.color), segments: [], photons: [], events: [], first, index };
      for (let i = 0; i < points.length - 1; i++) {
        const span = cumulative[i + 1] - cumulative[i];
        if (span < 1e-6 || i === 0 && !first) continue;
        const radius = source2.role === "primary" ? 0.0105 : 0.01;
        for (const halo of [true, false]) {
          const geometry = new T6.CylinderGeometry(halo ? radius * 3.6 : radius, halo ? radius * 3.6 : radius, span, 16, 1, true);
          this.geometries.add(geometry);
          const material = new T6.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: T6.NormalBlending, toneMapped: false, vertexShader: BEAM_VERTEX, fragmentShader: BEAM_FRAGMENT, uniforms: {
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
          const mesh = new T6.Mesh(geometry, material);
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
        const material = new T6.MeshBasicMaterial({ color: this.white, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
        this.materials.add(material);
        const core = new T6.Mesh(bead, material);
        core.scale.set(0.01, 0.036, 0.01);
        core.renderOrder = 17;
        const haloMaterial = new T6.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: T6.NormalBlending, toneMapped: false, vertexShader: BEAM_VERTEX, fragmentShader: GLOW_FRAGMENT, uniforms: { uColour: { value: this.white.clone() }, uAlpha: { value: 0 } } });
        this.materials.add(haloMaterial);
        const glow = new T6.Mesh(bead, haloMaterial);
        glow.scale.set(0.027, 0.066, 0.027);
        glow.renderOrder = 13;
        this.group.add(core, glow);
        path.photons.push({ core, glow, phase: i / 2 });
      }
      for (let i = 1; i < points.length - 1; i++) {
        if (i === 1 && !first) continue;
        const ringMaterial = new T6.MeshBasicMaterial({ color: this.white, transparent: true, opacity: 0, side: T6.DoubleSide, depthWrite: false, toneMapped: false });
        this.materials.add(ringMaterial);
        const disk = new T6.Mesh(ring, ringMaterial);
        disk.position.copy(points[i]);
        this.normal.copy(points[i]).normalize();
        disk.quaternion.setFromUnitVectors(new T6.Vector3(0, 0, 1), this.normal);
        disk.renderOrder = 15;
        const dotMaterial = new T6.MeshBasicMaterial({ color: this.white, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
        this.materials.add(dotMaterial);
        const dot = new T6.Mesh(bead, dotMaterial);
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
      const spectralOpacity = path.first ? base : base * smooth(colour);
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
        const a = inherited * smooth((reveal - segment - local) / 0.045) * smooth(d / 0.15) * smooth((path.length - d) / 0.18);
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
        const reached = smooth((reveal - event.index) / 0.055), a = (event.index === 1 ? base : spectralOpacity) * reached;
        const pulse = fract(time * 0.58 + event.phase);
        event.ring.scale.setScalar(0.05 + 0.066 * pulse);
        event.ring.visible = event.dot.visible = a > 1e-4;
        event.ring.material.opacity = a * 0.21 * (1 - pulse) ** 1.5;
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

// src/SpectrumDetailV10.ts
import * as T7 from "three";

// src/timeline.json
var timeline_default = {
  timeUnit: "seconds",
  fps: 30,
  duration: 10702,
  seconds: 356.733333,
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
      audioSHA256: "24b9c219bc3100282bd6f9f1995c974a77ae84eb12c9725b0db5de9b6e552345",
      startSample: 0,
      samples: 407040
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
      audioSHA256: "de09db1f44be79b8884838c5f302c30c0d45d5c41a6a2172c7353d3ddd1798b6",
      startSample: 412800,
      samples: 426240
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
      audioSHA256: "26d126f7c7f3be5575a2baf6a9a6ae4c0f9e885556de63a428585142045956c9",
      startSample: 844800,
      samples: 449280
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
      audioSHA256: "38f8f50b04b71e8ec9340757cec79aa4f4d5ac85f1c6b494bda9d6f2dacc7233",
      startSample: 1299840,
      samples: 322560
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
      audioSHA256: "486f99a67de71120c42bd480cd1d56b7f0c6fd7dd02f286aaa9069cb20fa0f54",
      startSample: 1628160,
      samples: 341760
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
      audioSHA256: "d5d028edf31726b7a70315222a9889f7553848208e6faacaf6937188ce018ea5",
      startSample: 1975680,
      samples: 288e3
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
      audioSHA256: "5d3a88947d0ec03c2034bf5d3f758dfd9a458d53ea2eaa6d86c214fbcc049b24",
      startSample: 2269440,
      samples: 414720
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
      audioSHA256: "f2be0523822f549d3774820402b62326915d0c376413efc05b9bdb963f385c05",
      startSample: 2689920,
      samples: 314880
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
      audioSHA256: "cdc456df0088c68579467652739d0d37f8dfbd36aa10781faad00df7b82a35a9",
      startSample: 3010560,
      samples: 372480
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
      audioSHA256: "06e1322bea3959cc195155469f56b7bcf105715ebbce61fa8d573eb07a824447",
      startSample: 3388800,
      samples: 311042
    },
    {
      id: "r042",
      scene: "dispersion",
      heading: "\u989C\u8272\u5206\u5F00",
      caption: "\u5149\u4E5F\u6709\u8D77\u4F0F\uFF0C\u6CE2\u957F\u5C31\u662F\u76F8\u90BB\u4E24\u6B21\u8D77\u4F0F\u4E4B\u95F4\u7684\u8DDD\u79BB\u3002",
      text: "\u5149\u4E5F\u6709\u8D77\u4F0F\uFF0C\u6CE2\u957F\u5C31\u662F\u76F8\u90BB\u4E24\u6B21\u8D77\u4F0F\u4E4B\u95F4\u7684\u8DDD\u79BB\u3002\u7EA2\u5149\u7684\u6CE2\u957F\u8F83\u957F\uFF0C\u7D2B\u5149\u8F83\u77ED\u3002\u6C34\u5BF9\u5B83\u4EEC\u7684\u6298\u5C04\u7A0B\u5EA6\u4E0D\u540C\uFF0C\u989C\u8272\u624D\u4F1A\u5206\u5F00\u3002",
      spoken: "\u5149\u4E5F\u6709\u8D77\u4F0F\uFF0C\u6CE2\u957F\u5C31\u662F\u76F8\u90BB\u4E24\u6B21\u8D77\u4F0F\u4E4B\u95F4\u7684\u8DDD\u79BB\u3002\u7EA2\u5149\u7684\u6CE2\u957F\u8F83\u957F\uFF0C\u7D2B\u5149\u8F83\u77ED\u3002\u6C34\u5BF9\u5B83\u4EEC\u7684\u6298\u5C04\u7A0B\u5EA6\u4E0D\u540C\uFF0C\u989C\u8272\u624D\u4F1A\u5206\u5F00\u3002",
      audio: "public/audio_v10/r042-a.wav",
      audioSHA256: "6a2e3dac6a4b717e303050aec8d4158ffa8e36b9cb81e0adcf8292022d82ad32",
      start: 77.200042,
      end: 88.400042,
      duration: 11.2,
      startSample: 3705602,
      samples: 537600
    },
    {
      id: "r011",
      scene: "dispersion",
      heading: "\u989C\u8272\u5206\u5F00",
      caption: "\u4E2D\u95F4\u8FD8\u6709\u6A59\u3001\u9EC4\u3001\u7EFF\u3001\u84DD\uFF0C\u4E00\u79CD\u63A5\u7740\u4E00\u79CD\u3002\u6C34\u6EF4\u505A",
      text: "\u4E2D\u95F4\u8FD8\u6709\u6A59\u3001\u9EC4\u3001\u7EFF\u3001\u84DD\uFF0C\u4E00\u79CD\u63A5\u7740\u4E00\u79CD\u3002\u6C34\u6EF4\u505A\u7684\u4E8B\uFF0C\u662F\u628A\u767D\u5149\u91CC\u539F\u6709\u7684\u989C\u8272\u5C55\u5F00\u3002",
      spoken: "\u4E2D\u95F4\u8FD8\u6709\u6A59\u3001\u9EC4\u3001\u7EFF\u3001\u84DD\uFF0C\u4E00\u79CD\u63A5\u7740\u4E00\u79CD\u3002\u6C34\u6EF4\u505A\u7684\u4E8B\uFF0C\u662F\u628A\u767D\u5149\u91CC\u539F\u6709\u7684\u989C\u8272\u5C55\u5F00\u3002",
      start: 88.520042,
      end: 97.560083,
      duration: 9.040042,
      audio: "public/audio/r011.wav",
      audioSHA256: "ce4d3e613c20e2581983b59ada2a9afffad75e15c52c32c7fcf93f8b78cc9475",
      startSample: 4248962,
      samples: 433922
    },
    {
      id: "r012",
      scene: "dispersion",
      heading: "\u989C\u8272\u5206\u5F00",
      caption: "\u989C\u8272\u4E4B\u95F4\u4E00\u76F4\u5728\u8FC7\u6E21\u3002\u6211\u4EEC\u5E38\u8BF4\u7684\u4E03\u8272\uFF0C\u662F\u65B9\u4FBF\u8BB0",
      text: "\u989C\u8272\u4E4B\u95F4\u4E00\u76F4\u5728\u8FC7\u6E21\u3002\u6211\u4EEC\u5E38\u8BF4\u7684\u4E03\u8272\uFF0C\u662F\u65B9\u4FBF\u8BB0\u5FC6\u7684\u540D\u5B57\uFF0C\u771F\u5B9E\u7684\u5149\u8C31\u8FDE\u6210\u4E00\u7247\u3002",
      spoken: "\u989C\u8272\u4E4B\u95F4\u4E00\u76F4\u5728\u8FC7\u6E21\u3002\u6211\u4EEC\u5E38\u8BF4\u7684\u4E03\u8272\uFF0C\u662F\u65B9\u4FBF\u8BB0\u5FC6\u7684\u540D\u5B57\uFF0C\u771F\u5B9E\u7684\u5149\u8C31\u8FDE\u6210\u4E00\u7247\u3002",
      start: 97.680083,
      end: 104.880125,
      duration: 7.200042,
      audio: "public/audio/r012.wav",
      audioSHA256: "45ea5171c219ed5c6a203604669c12f231660a8bf9ca46370109fc76f3567fd0",
      startSample: 4688644,
      samples: 345602
    },
    {
      id: "r043",
      scene: "dispersion",
      heading: "\u989C\u8272\u5206\u5F00",
      caption: "\u6CBF\u7740\u8FD9\u7247\u5149\u8C31\u6162\u6162\u79FB\u52A8\uFF0C\u7EA2\u8272\u5148\u504F\u6A59\uFF0C\u518D\u504F\u9EC4\u3002\u4E03",
      text: "\u6CBF\u7740\u8FD9\u7247\u5149\u8C31\u6162\u6162\u79FB\u52A8\uFF0C\u7EA2\u8272\u5148\u504F\u6A59\uFF0C\u518D\u504F\u9EC4\u3002\u4E03\u4E2A\u540D\u5B57\uFF0C\u50CF\u7ED9\u6E10\u53D8\u8272\u653E\u4E86\u51E0\u4E2A\u8DEF\u6807\uFF0C\u4E2D\u95F4\u8FD8\u6709\u8BB8\u591A\u7EC6\u5FAE\u7684\u989C\u8272\u3002",
      spoken: "\u6CBF\u7740\u8FD9\u7247\u5149\u8C31\u6162\u6162\u79FB\u52A8\uFF0C\u7EA2\u8272\u5148\u504F\u6A59\uFF0C\u518D\u504F\u9EC4\u3002\u4E03\u4E2A\u540D\u5B57\uFF0C\u50CF\u7ED9\u6E10\u53D8\u8272\u653E\u4E86\u51E0\u4E2A\u8DEF\u6807\uFF0C\u4E2D\u95F4\u8FD8\u6709\u8BB8\u591A\u7EC6\u5FAE\u7684\u989C\u8272\u3002",
      audio: "public/audio_v10/r043-a.wav",
      audioSHA256: "de5ae0f81344c13cdc5e8ac9b3f4c88a9bab62e0a8ae7e2a5a79aef25b4e440b",
      start: 105.000125,
      end: 115.160125,
      duration: 10.16,
      startSample: 5040006,
      samples: 487680
    },
    {
      id: "r013",
      scene: "reflection",
      heading: "\u56DE\u5934\u4E00\u6B21",
      caption: "\u7EE7\u7EED\u5F80\u91CC\u8D70\u3002\u5149\u5230\u8FBE\u6C34\u6EF4\u7684\u53E6\u4E00\u9762\uFF0C\u6709\u4E00\u90E8\u5206\u7A7F\u51FA",
      text: "\u7EE7\u7EED\u5F80\u91CC\u8D70\u3002\u5149\u5230\u8FBE\u6C34\u6EF4\u7684\u53E6\u4E00\u9762\uFF0C\u6709\u4E00\u90E8\u5206\u7A7F\u51FA\u53BB\uFF0C\u8FD8\u6709\u4E00\u90E8\u5206\u5728\u6C34\u91CC\u53CD\u5C04\uFF0C\u56DE\u8FC7\u5934\u6765\u3002",
      spoken: "\u7EE7\u7EED\u5F80\u91CC\u8D70\u3002\u5149\u5230\u8FBE\u6C34\u6EF4\u7684\u53E6\u4E00\u9762\uFF0C\u6709\u4E00\u90E8\u5206\u7A7F\u51FA\u53BB\uFF0C\u8FD8\u6709\u4E00\u90E8\u5206\u5728\u6C34\u91CC\u53CD\u5C04\uFF0C\u56DE\u8FC7\u5934\u6765\u3002",
      start: 115.280125,
      end: 123.120125,
      duration: 7.84,
      audio: "public/audio/r013.wav",
      audioSHA256: "ed5ee016a7ee6e13331e0b32e111c10c2d612b087b8c9f37134eaef6540d8e92",
      startSample: 5533446,
      samples: 376320
    },
    {
      id: "r014",
      scene: "reflection",
      heading: "\u56DE\u5934\u4E00\u6B21",
      caption: "\u8FD9\u4E00\u90E8\u5206\u5149\u518D\u6B21\u8D70\u5230\u6C34\u548C\u7A7A\u6C14\u7684\u4EA4\u754C\uFF0C\u51FA\u95E8\u65F6\u53C8\u6298",
      text: "\u8FD9\u4E00\u90E8\u5206\u5149\u518D\u6B21\u8D70\u5230\u6C34\u548C\u7A7A\u6C14\u7684\u4EA4\u754C\uFF0C\u51FA\u95E8\u65F6\u53C8\u6298\u5C04\u4E00\u6B21\u3002\u5B83\u5DF2\u7ECF\u671D\u7740\u9633\u5149\u6765\u65F6\u7684\u90A3\u4E00\u4FA7\u8FD4\u56DE\u3002",
      spoken: "\u8FD9\u4E00\u90E8\u5206\u5149\u518D\u6B21\u8D70\u5230\u6C34\u548C\u7A7A\u6C14\u7684\u4EA4\u754C\uFF0C\u51FA\u95E8\u65F6\u53C8\u6298\u5C04\u4E00\u6B21\u3002\u5B83\u5DF2\u7ECF\u671D\u7740\u9633\u5149\u6765\u65F6\u7684\u90A3\u4E00\u4FA7\u8FD4\u56DE\u3002",
      start: 123.240125,
      end: 131.400125,
      duration: 8.16,
      audio: "public/audio/r014.wav",
      audioSHA256: "b079b4e78c623290c693cbcd89d84010bc8b37f69b567c7a7b859d62fa166c25",
      startSample: 5915526,
      samples: 391680
    },
    {
      id: "r015",
      scene: "reflection",
      heading: "\u56DE\u5934\u4E00\u6B21",
      caption: "\u8FDB\u95E8\u8F6C\u4E00\u6B21\u5F2F\uFF0C\u91CC\u9762\u56DE\u4E00\u6B21\u5934\uFF0C\u51FA\u95E8\u518D\u8F6C\u4E00\u6B21\u5F2F\u3002",
      text: "\u8FDB\u95E8\u8F6C\u4E00\u6B21\u5F2F\uFF0C\u91CC\u9762\u56DE\u4E00\u6B21\u5934\uFF0C\u51FA\u95E8\u518D\u8F6C\u4E00\u6B21\u5F2F\u3002\u8FD9\u6761\u8DEF\u7EBF\uFF0C\u5C31\u662F\u6700\u5E38\u89C1\u7684\u4E3B\u8679\u3002",
      spoken: "\u8FDB\u95E8\u8F6C\u4E00\u6B21\u5F2F\uFF0C\u91CC\u9762\u56DE\u4E00\u6B21\u5934\uFF0C\u51FA\u95E8\u518D\u8F6C\u4E00\u6B21\u5F2F\u3002\u8FD9\u6761\u8DEF\u7EBF\uFF0C\u5C31\u662F\u6700\u5E38\u89C1\u7684\u4E3B\u8679\u3002",
      start: 131.520125,
      end: 138.720167,
      duration: 7.200042,
      audio: "public/audio/r015.wav",
      audioSHA256: "a4b1cb3321678dd32d56a96d79aef59cf7d57dc90632f3cf3c3b7fbb7766a383",
      startSample: 6312966,
      samples: 345602
    },
    {
      id: "r044",
      scene: "reflection",
      heading: "\u56DE\u5934\u4E00\u6B21",
      caption: "\u8FD9\u4E00\u6765\u4E00\u56DE\uFF0C\u7EA2\u5149\u548C\u7D2B\u5149\u7684\u51FA\u53E3\u5C31\u9519\u5F00\u4E86\u3002\u7B49\u8BB8\u591A",
      text: "\u8FD9\u4E00\u6765\u4E00\u56DE\uFF0C\u7EA2\u5149\u548C\u7D2B\u5149\u7684\u51FA\u53E3\u5C31\u9519\u5F00\u4E86\u3002\u7B49\u8BB8\u591A\u96E8\u6EF4\u540C\u65F6\u628A\u5149\u9001\u8FC7\u6765\uFF0C\u8FD9\u70B9\u65B9\u5411\u5DEE\u5F02\uFF0C\u624D\u4F1A\u5C55\u5F00\u6210\u5929\u7A7A\u4E2D\u6709\u5BBD\u5EA6\u7684\u4E00\u9053\u5F69\u5E26\u3002",
      spoken: "\u8FD9\u4E00\u6765\u4E00\u56DE\uFF0C\u7EA2\u5149\u548C\u7D2B\u5149\u7684\u51FA\u53E3\u5C31\u9519\u5F00\u4E86\u3002\u7B49\u8BB8\u591A\u96E8\u6EF4\u540C\u65F6\u628A\u5149\u9001\u8FC7\u6765\uFF0C\u8FD9\u70B9\u65B9\u5411\u5DEE\u5F02\uFF0C\u624D\u4F1A\u5C55\u5F00\u6210\u5929\u7A7A\u4E2D\u6709\u5BBD\u5EA6\u7684\u4E00\u9053\u5F69\u5E26\u3002",
      audio: "public/audio_v10/r044-a.wav",
      audioSHA256: "fbb2c2f8b3aa49308a4e66e59e6e974af6c793daca9d7efac0b8c67315d88f48",
      start: 138.840167,
      end: 149.560167,
      duration: 10.72,
      startSample: 6664328,
      samples: 514560
    },
    {
      id: "r017",
      scene: "angle",
      heading: "\u7EA642\xB0",
      caption: "\u8BA9\u66F4\u591A\u5149\u7EBF\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u5165\u3002\u4F60\u4F1A\u53D1\u73B0\uFF0C\u8BB8\u591A\u51FA\u5C04",
      text: "\u8BA9\u66F4\u591A\u5149\u7EBF\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u5165\u3002\u4F60\u4F1A\u53D1\u73B0\uFF0C\u8BB8\u591A\u51FA\u5C04\u5149\u6324\u5728\u76F8\u8FD1\u7684\u89D2\u5EA6\uFF0C\u5F62\u6210\u4E00\u5904\u660E\u4EAE\u7684\u96C6\u4E2D\u3002",
      spoken: "\u8BA9\u66F4\u591A\u5149\u7EBF\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u5165\u3002\u4F60\u4F1A\u53D1\u73B0\uFF0C\u8BB8\u591A\u51FA\u5C04\u5149\u6324\u5728\u76F8\u8FD1\u7684\u89D2\u5EA6\uFF0C\u5F62\u6210\u4E00\u5904\u660E\u4EAE\u7684\u96C6\u4E2D\u3002",
      start: 149.680167,
      end: 158.160167,
      duration: 8.48,
      audio: "public/audio/r017.wav",
      audioSHA256: "c117a62f7a4f5fe4500d6be0a20838ec393e92a2a05523818f27ad446754cdcc",
      startSample: 7184648,
      samples: 407040
    },
    {
      id: "r018",
      scene: "angle",
      heading: "\u7EA642\xB0",
      caption: "\u7EA2\u5149\u6700\u4EAE\u7684\u65B9\u5411\uFF0C\u5927\u7EA6\u5728\u56DB\u5341\u4E8C\u5EA6\uFF1B\u7D2B\u5149\u5927\u7EA6\u56DB\u5341",
      text: "\u7EA2\u5149\u6700\u4EAE\u7684\u65B9\u5411\uFF0C\u5927\u7EA6\u5728\u56DB\u5341\u4E8C\u5EA6\uFF1B\u7D2B\u5149\u5927\u7EA6\u56DB\u5341\u5EA6\u3002\u5DEE\u51FA\u6765\u7684\u8FD9\u70B9\u89D2\u5EA6\uFF0C\u628A\u5F69\u8272\u7684\u8FB9\u7F18\u62C9\u5F00\u4E86\u3002",
      spoken: "\u7EA2\u5149\u6700\u4EAE\u7684\u65B9\u5411\uFF0C\u5927\u7EA6\u5728\u56DB\u5341\u4E8C\u5EA6\uFF1B\u7D2B\u5149\u5927\u7EA6\u56DB\u5341\u5EA6\u3002\u5DEE\u51FA\u6765\u7684\u8FD9\u70B9\u89D2\u5EA6\uFF0C\u628A\u5F69\u8272\u7684\u8FB9\u7F18\u62C9\u5F00\u4E86\u3002",
      start: 158.280167,
      end: 167.160167,
      duration: 8.88,
      audio: "public/audio/r018.wav",
      audioSHA256: "14d8bc2fa658cc5ee486dbf6cd92eb9b77492d7e8393130959c78e047836dc25",
      startSample: 7597448,
      samples: 426240
    },
    {
      id: "r019",
      scene: "angle",
      heading: "\u7EA642\xB0",
      caption: "\u8FD9\u4E24\u4E2A\u89D2\uFF0C\u662F\u5BF9\u7740\u54EA\u91CC\u91CF\u7684\u5462\uFF1F\u4ECE\u592A\u9633\uFF0C\u7ECF\u8FC7\u4F60\u7684",
      text: "\u8FD9\u4E24\u4E2A\u89D2\uFF0C\u662F\u5BF9\u7740\u54EA\u91CC\u91CF\u7684\u5462\uFF1F\u4ECE\u592A\u9633\uFF0C\u7ECF\u8FC7\u4F60\u7684\u773C\u775B\uFF0C\u518D\u5411\u524D\u5EF6\u4F38\uFF0C\u5C31\u662F\u80CC\u5411\u592A\u9633\u7684\u65B9\u5411\u3002",
      spoken: "\u8FD9\u4E24\u4E2A\u89D2\uFF0C\u662F\u5BF9\u7740\u54EA\u91CC\u91CF\u7684\u5462\uFF1F\u4ECE\u592A\u9633\uFF0C\u7ECF\u8FC7\u4F60\u7684\u773C\u775B\uFF0C\u518D\u5411\u524D\u5EF6\u4F38\uFF0C\u5C31\u662F\u80CC\u5411\u592A\u9633\u7684\u65B9\u5411\u3002",
      start: 167.280167,
      end: 175.920167,
      duration: 8.64,
      audio: "public/audio/r019.wav",
      audioSHA256: "b72dd52a60677ef4f6e5bb26068c77fcf4a17d8089e8c87f9b396c7bcc7375bf",
      startSample: 8029448,
      samples: 414720
    },
    {
      id: "r020",
      scene: "angle",
      heading: "\u7EA642\xB0",
      caption: "\u4F60\u7684\u5F71\u5B50\u4E5F\u6307\u5411\u90A3\u8FB9\u3002\u4EE5\u8FD9\u6761\u65B9\u5411\u4E3A\u4E2D\u5FC3\uFF0C\u5F80\u5916\u504F",
      text: "\u4F60\u7684\u5F71\u5B50\u4E5F\u6307\u5411\u90A3\u8FB9\u3002\u4EE5\u8FD9\u6761\u65B9\u5411\u4E3A\u4E2D\u5FC3\uFF0C\u5F80\u5916\u504F\u56DB\u5341\u4E8C\u5EA6\uFF0C\u5C31\u627E\u5230\u4E86\u4E3B\u8679\u7684\u7EA2\u8272\u5916\u7F18\u3002",
      spoken: "\u4F60\u7684\u5F71\u5B50\u4E5F\u6307\u5411\u90A3\u8FB9\u3002\u4EE5\u8FD9\u6761\u65B9\u5411\u4E3A\u4E2D\u5FC3\uFF0C\u5F80\u5916\u504F\u56DB\u5341\u4E8C\u5EA6\uFF0C\u5C31\u627E\u5230\u4E86\u4E3B\u8679\u7684\u7EA2\u8272\u5916\u7F18\u3002",
      start: 176.040167,
      end: 183.640167,
      duration: 7.6,
      audio: "public/audio/r020.wav",
      audioSHA256: "a62da8ebba69ee1514eb47cea7b4906709102f61027a60aca0e65dd43d2ba922",
      startSample: 8449928,
      samples: 364800
    },
    {
      id: "r021",
      scene: "cone",
      heading: "\u773C\u775B\u662F\u5706\u9525\u5C16\u7AEF",
      caption: "\u73B0\u5728\u628A\u4E00\u6EF4\u6C34\uFF0C\u6362\u6210\u4E00\u6574\u7247\u96E8\u3002\u80FD\u628A\u7EA2\u5149\u9001\u8FDB\u4F60\u773C",
      text: "\u73B0\u5728\u628A\u4E00\u6EF4\u6C34\uFF0C\u6362\u6210\u4E00\u6574\u7247\u96E8\u3002\u80FD\u628A\u7EA2\u5149\u9001\u8FDB\u4F60\u773C\u775B\u7684\u6C34\u6EF4\uFF0C\u90FD\u843D\u5728\u8FD9\u7EC4\u65B9\u5411\u4E0A\u3002",
      spoken: "\u73B0\u5728\u628A\u4E00\u6EF4\u6C34\uFF0C\u6362\u6210\u4E00\u6574\u7247\u96E8\u3002\u80FD\u628A\u7EA2\u5149\u9001\u8FDB\u4F60\u773C\u775B\u7684\u6C34\u6EF4\uFF0C\u90FD\u843D\u5728\u8FD9\u7EC4\u65B9\u5411\u4E0A\u3002",
      start: 183.760167,
      end: 190.480167,
      duration: 6.72,
      audio: "public/audio/r021.wav",
      audioSHA256: "2c8ef057e2e0a30b4a322714eac0e0c8caabf7f0b246042890c62c59c18401fe",
      startSample: 8820488,
      samples: 322560
    },
    {
      id: "r022",
      scene: "cone",
      heading: "\u773C\u775B\u662F\u5706\u9525\u5C16\u7AEF",
      caption: "\u671D\u4E0A\u3001\u671D\u5DE6\u3001\u671D\u53F3\uFF0C\u53EA\u8981\u548C\u4E2D\u5FC3\u7EBF\u4FDD\u6301\u540C\u6837\u7684\u89D2\u5EA6",
      text: "\u671D\u4E0A\u3001\u671D\u5DE6\u3001\u671D\u53F3\uFF0C\u53EA\u8981\u548C\u4E2D\u5FC3\u7EBF\u4FDD\u6301\u540C\u6837\u7684\u89D2\u5EA6\uFF0C\u90FD\u6709\u673A\u4F1A\u51FA\u73B0\u7EA2\u5149\u3002\u7ED5\u4E00\u5708\uFF0C\u5C31\u56F4\u51FA\u4E00\u4E2A\u5706\u9525\u3002",
      spoken: "\u671D\u4E0A\u3001\u671D\u5DE6\u3001\u671D\u53F3\uFF0C\u53EA\u8981\u548C\u4E2D\u5FC3\u7EBF\u4FDD\u6301\u540C\u6837\u7684\u89D2\u5EA6\uFF0C\u90FD\u6709\u673A\u4F1A\u51FA\u73B0\u7EA2\u5149\u3002\u7ED5\u4E00\u5708\uFF0C\u5C31\u56F4\u51FA\u4E00\u4E2A\u5706\u9525\u3002",
      start: 190.600167,
      end: 199.560208,
      duration: 8.960042,
      audio: "public/audio/r022.wav",
      audioSHA256: "aa8aa1c607042a167498df210290817792806f5e2a33b334e26236a445624a31",
      startSample: 9148808,
      samples: 430082
    },
    {
      id: "r023",
      scene: "cone",
      heading: "\u773C\u775B\u662F\u5706\u9525\u5C16\u7AEF",
      caption: "\u4F60\u7684\u773C\u775B\u5728\u5C16\u7AEF\u3002\u90A3\u4E9B\u6C34\u6EF4\u53EF\u4EE5\u5F88\u8FD1\uFF0C\u4E5F\u53EF\u4EE5\u5F88\u8FDC",
      text: "\u4F60\u7684\u773C\u775B\u5728\u5C16\u7AEF\u3002\u90A3\u4E9B\u6C34\u6EF4\u53EF\u4EE5\u5F88\u8FD1\uFF0C\u4E5F\u53EF\u4EE5\u5F88\u8FDC\uFF0C\u91CD\u8981\u7684\u662F\uFF0C\u5B83\u4EEC\u6709\u6CA1\u6709\u843D\u5728\u5408\u9002\u7684\u65B9\u5411\u3002",
      spoken: "\u4F60\u7684\u773C\u775B\u5728\u5C16\u7AEF\u3002\u90A3\u4E9B\u6C34\u6EF4\u53EF\u4EE5\u5F88\u8FD1\uFF0C\u4E5F\u53EF\u4EE5\u5F88\u8FDC\uFF0C\u91CD\u8981\u7684\u662F\uFF0C\u5B83\u4EEC\u6709\u6CA1\u6709\u843D\u5728\u5408\u9002\u7684\u65B9\u5411\u3002",
      start: 199.680208,
      end: 207.600208,
      duration: 7.92,
      audio: "public/audio/r023.wav",
      audioSHA256: "acef653031626a5b3d11547055ed69fdaec7caf6f15c51d526c86e6a48271015",
      startSample: 9584650,
      samples: 380160
    },
    {
      id: "r024",
      scene: "cone",
      heading: "\u773C\u775B\u662F\u5706\u9525\u5C16\u7AEF",
      caption: "\u4ECE\u5C16\u7AEF\u671B\u51FA\u53BB\uFF0C\u8FD9\u4E9B\u65B9\u5411\u56F4\u6210\u4E00\u4E2A\u5706\u3002\u7EA2\u8272\u5728\u5916\uFF0C",
      text: "\u4ECE\u5C16\u7AEF\u671B\u51FA\u53BB\uFF0C\u8FD9\u4E9B\u65B9\u5411\u56F4\u6210\u4E00\u4E2A\u5706\u3002\u7EA2\u8272\u5728\u5916\uFF0C\u7D2B\u8272\u5728\u5185\u3002\u539F\u6765\u5F69\u8679\u7684\u5B8C\u6574\u5F62\u72B6\uFF0C\u662F\u5706\u7684\u3002",
      spoken: "\u4ECE\u5C16\u7AEF\u671B\u51FA\u53BB\uFF0C\u8FD9\u4E9B\u65B9\u5411\u56F4\u6210\u4E00\u4E2A\u5706\u3002\u7EA2\u8272\u5728\u5916\uFF0C\u7D2B\u8272\u5728\u5185\u3002\u539F\u6765\u5F69\u8679\u7684\u5B8C\u6574\u5F62\u72B6\uFF0C\u662F\u5706\u7684\u3002",
      start: 207.720208,
      end: 216.520208,
      duration: 8.8,
      audio: "public/audio/r024.wav",
      audioSHA256: "525819a2d5257cf737af8dcda8083d7b645b4d385042b2672870b717e4f247a2",
      startSample: 9970570,
      samples: 422400
    },
    {
      id: "r025",
      scene: "circle",
      heading: "\u5706\u88AB\u5730\u9762\u906E\u4F4F",
      caption: "\u6211\u4EEC\u7AD9\u5728\u5730\u9762\u4E0A\uFF0C\u5F80\u4E0B\u770B\u7684\u65B9\u5411\u88AB\u5730\u9762\u6321\u4F4F\uFF0C\u4E0B\u9762",
      text: "\u6211\u4EEC\u7AD9\u5728\u5730\u9762\u4E0A\uFF0C\u5F80\u4E0B\u770B\u7684\u65B9\u5411\u88AB\u5730\u9762\u6321\u4F4F\uFF0C\u4E0B\u9762\u4E5F\u5E38\u5E38\u7F3A\u5C11\u88AB\u9633\u5149\u7167\u5230\u7684\u96E8\u6EF4\u3002\u4E8E\u662F\u53EA\u5269\u5929\u7A7A\u91CC\u7684\u8FD9\u4E00\u6BB5\u5F27\u3002",
      spoken: "\u6211\u4EEC\u7AD9\u5728\u5730\u9762\u4E0A\uFF0C\u5F80\u4E0B\u770B\u7684\u65B9\u5411\u88AB\u5730\u9762\u6321\u4F4F\uFF0C\u4E0B\u9762\u4E5F\u5E38\u5E38\u7F3A\u5C11\u88AB\u9633\u5149\u7167\u5230\u7684\u96E8\u6EF4\u3002\u4E8E\u662F\u53EA\u5269\u5929\u7A7A\u91CC\u7684\u8FD9\u4E00\u6BB5\u5F27\u3002",
      start: 216.640208,
      end: 226.320208,
      duration: 9.68,
      audio: "public/audio/r025.wav",
      audioSHA256: "5115c05aec409fcbeecf338ec96e5b772da9fcf83dc9a1513601d71f0fa793c0",
      startSample: 10398730,
      samples: 464640
    },
    {
      id: "r026",
      scene: "circle",
      heading: "\u5706\u88AB\u5730\u9762\u906E\u4F4F",
      caption: "\u592A\u9633\u8D34\u8FD1\u5730\u5E73\u7EBF\u65F6\uFF0C\u5706\u5FC3\u4E5F\u63A5\u8FD1\u5730\u5E73\u7EBF\uFF0C\u5F69\u8679\u80FD\u9732",
      text: "\u592A\u9633\u8D34\u8FD1\u5730\u5E73\u7EBF\u65F6\uFF0C\u5706\u5FC3\u4E5F\u63A5\u8FD1\u5730\u5E73\u7EBF\uFF0C\u5F69\u8679\u80FD\u9732\u51FA\u8F83\u957F\u7684\u4E00\u6BB5\u3002\u592A\u9633\u5347\u9AD8\uFF0C\u5706\u5FC3\u4E0B\u6C89\uFF0C\u9732\u51FA\u7684\u5F27\u5C31\u77ED\u4E86\u3002",
      spoken: "\u592A\u9633\u8D34\u8FD1\u5730\u5E73\u7EBF\u65F6\uFF0C\u5706\u5FC3\u4E5F\u63A5\u8FD1\u5730\u5E73\u7EBF\uFF0C\u5F69\u8679\u80FD\u9732\u51FA\u8F83\u957F\u7684\u4E00\u6BB5\u3002\u592A\u9633\u5347\u9AD8\uFF0C\u5706\u5FC3\u4E0B\u6C89\uFF0C\u9732\u51FA\u7684\u5F27\u5C31\u77ED\u4E86\u3002",
      start: 226.440208,
      end: 236.120208,
      duration: 9.68,
      audio: "public/audio/r026.wav",
      audioSHA256: "428d36da97bd40adfdc46736a8b7272fa08e91f584f2a0443c944f827ed6fc9a",
      startSample: 10869130,
      samples: 464640
    },
    {
      id: "r027",
      scene: "circle",
      heading: "\u5706\u88AB\u5730\u9762\u906E\u4F4F",
      caption: "\u98DE\u673A\u65C1\u3001\u7011\u5E03\u4E0A\u65B9\uFF0C\u6709\u65F6\u80FD\u770B\u89C1\u6574\u5706\u3002\u6761\u4EF6\u662F\u811A\u4E0B",
      text: "\u98DE\u673A\u65C1\u3001\u7011\u5E03\u4E0A\u65B9\uFF0C\u6709\u65F6\u80FD\u770B\u89C1\u6574\u5706\u3002\u6761\u4EF6\u662F\u811A\u4E0B\u4E5F\u6709\u9633\u5149\u7167\u4EAE\u7684\u6C34\u96FE\uFF0C\u800C\u4E14\u89C6\u91CE\u8DB3\u591F\u5F00\u9614\u3002",
      spoken: "\u98DE\u673A\u65C1\u3001\u7011\u5E03\u4E0A\u65B9\uFF0C\u6709\u65F6\u80FD\u770B\u89C1\u6574\u5706\u3002\u6761\u4EF6\u662F\u811A\u4E0B\u4E5F\u6709\u9633\u5149\u7167\u4EAE\u7684\u6C34\u96FE\uFF0C\u800C\u4E14\u89C6\u91CE\u8DB3\u591F\u5F00\u9614\u3002",
      start: 236.240208,
      end: 244.480208,
      duration: 8.24,
      audio: "public/audio/r027.wav",
      audioSHA256: "893f482518a794f3328f9080b2adc4ce1d25ffc81d445be10bb3faec01710c0e",
      startSample: 11339530,
      samples: 395520
    },
    {
      id: "r028",
      scene: "circle",
      heading: "\u5706\u88AB\u5730\u9762\u906E\u4F4F",
      caption: "\u6240\u4EE5\uFF0C\u5F27\u5F62\u6765\u81EA\u6211\u4EEC\u7684\u4F4D\u7F6E\u548C\u5730\u9762\u7684\u906E\u6321\u3002\u6362\u4E00\u4E2A",
      text: "\u6240\u4EE5\uFF0C\u5F27\u5F62\u6765\u81EA\u6211\u4EEC\u7684\u4F4D\u7F6E\u548C\u5730\u9762\u7684\u906E\u6321\u3002\u6362\u4E00\u4E2A\u89C6\u91CE\uFF0C\u85CF\u8D77\u6765\u7684\u90A3\u4E00\u6BB5\uFF0C\u4E5F\u53EF\u80FD\u91CD\u65B0\u51FA\u73B0\u3002",
      spoken: "\u6240\u4EE5\uFF0C\u5F27\u5F62\u6765\u81EA\u6211\u4EEC\u7684\u4F4D\u7F6E\u548C\u5730\u9762\u7684\u906E\u6321\u3002\u6362\u4E00\u4E2A\u89C6\u91CE\uFF0C\u85CF\u8D77\u6765\u7684\u90A3\u4E00\u6BB5\uFF0C\u4E5F\u53EF\u80FD\u91CD\u65B0\u51FA\u73B0\u3002",
      start: 244.600208,
      end: 252.04025,
      duration: 7.440042,
      audio: "public/audio/r028.wav",
      audioSHA256: "99eb1df1940f9a1d1fd06cea42d94cf07ed75946835ba2acbbe2dd2bf1c58070",
      startSample: 11740810,
      samples: 357122
    },
    {
      id: "r029",
      scene: "observer",
      heading: "\u6C34\u6EF4\u6362\u4E86\u4E00\u6279",
      caption: "\u8FD8\u8BB0\u5F97\u5F00\u5934\u90A3\u5EA7\u8FFD\u4E0D\u5230\u7684\u6865\u5417\uFF1F\u8BA9\u6211\u4EEC\u6A2A\u7740\u8D70\u51E0\u6B65",
      text: "\u8FD8\u8BB0\u5F97\u5F00\u5934\u90A3\u5EA7\u8FFD\u4E0D\u5230\u7684\u6865\u5417\uFF1F\u8BA9\u6211\u4EEC\u6A2A\u7740\u8D70\u51E0\u6B65\uFF0C\u770B\u770B\u4F1A\u53D1\u751F\u4EC0\u4E48\u3002",
      spoken: "\u8FD8\u8BB0\u5F97\u5F00\u5934\u90A3\u5EA7\u8FFD\u4E0D\u5230\u7684\u6865\u5417\uFF1F\u8BA9\u6211\u4EEC\u6A2A\u7740\u8D70\u51E0\u6B65\uFF0C\u770B\u770B\u4F1A\u53D1\u751F\u4EC0\u4E48\u3002",
      start: 252.16025,
      end: 257.60025,
      duration: 5.44,
      audio: "public/audio/r029.wav",
      audioSHA256: "eb6e0be4eb8aaa031a43a8c0c8c29f9225168510deb881ece477b6df9df26965",
      startSample: 12103692,
      samples: 261120
    },
    {
      id: "r030",
      scene: "observer",
      heading: "\u6C34\u6EF4\u6362\u4E86\u4E00\u6279",
      caption: "\u773C\u775B\u6362\u4E86\u4F4D\u7F6E\uFF0C\u5706\u9525\u7684\u5C16\u7AEF\u4E5F\u8DDF\u7740\u79FB\u52A8\u3002\u539F\u5148\u9001\u6765",
      text: "\u773C\u775B\u6362\u4E86\u4F4D\u7F6E\uFF0C\u5706\u9525\u7684\u5C16\u7AEF\u4E5F\u8DDF\u7740\u79FB\u52A8\u3002\u539F\u5148\u9001\u6765\u7EA2\u5149\u7684\u6C34\u6EF4\u9000\u4E0B\uFF0C\u65C1\u8FB9\u53E6\u4E00\u6279\u6C34\u6EF4\u63A5\u4E0A\u3002",
      spoken: "\u773C\u775B\u6362\u4E86\u4F4D\u7F6E\uFF0C\u5706\u9525\u7684\u5C16\u7AEF\u4E5F\u8DDF\u7740\u79FB\u52A8\u3002\u539F\u5148\u9001\u6765\u7EA2\u5149\u7684\u6C34\u6EF4\u9000\u4E0B\uFF0C\u65C1\u8FB9\u53E6\u4E00\u6279\u6C34\u6EF4\u63A5\u4E0A\u3002",
      start: 257.72025,
      end: 265.48025,
      duration: 7.76,
      audio: "public/audio/r030.wav",
      audioSHA256: "f6cf088b9a7ac8f7709d645cf451662c7ae77dab97a4e587c7d15bbd9bafe36d",
      startSample: 12370572,
      samples: 372480
    },
    {
      id: "r031",
      scene: "observer",
      heading: "\u6C34\u6EF4\u6362\u4E86\u4E00\u6279",
      caption: "\u4E24\u4E2A\u4EBA\u80A9\u5E76\u80A9\uFF0C\u770B\u89C1\u7684\u5F69\u8679\u975E\u5E38\u76F8\u4F3C\u3002\u9001\u8FDB\u5404\u81EA\u773C",
      text: "\u4E24\u4E2A\u4EBA\u80A9\u5E76\u80A9\uFF0C\u770B\u89C1\u7684\u5F69\u8679\u975E\u5E38\u76F8\u4F3C\u3002\u9001\u8FDB\u5404\u81EA\u773C\u775B\u7684\u5149\uFF0C\u5374\u6765\u81EA\u4E0D\u540C\u7684\u6C34\u6EF4\u3002",
      spoken: "\u4E24\u4E2A\u4EBA\u80A9\u5E76\u80A9\uFF0C\u770B\u89C1\u7684\u5F69\u8679\u975E\u5E38\u76F8\u4F3C\u3002\u9001\u8FDB\u5404\u81EA\u773C\u775B\u7684\u5149\uFF0C\u5374\u6765\u81EA\u4E0D\u540C\u7684\u6C34\u6EF4\u3002",
      start: 265.60025,
      end: 272.88025,
      duration: 7.28,
      audio: "public/audio/r031.wav",
      audioSHA256: "45a88ecfd15fbd740080747b5087cbaa6686accecf295e535ea47afea0d79dde",
      startSample: 12748812,
      samples: 349440
    },
    {
      id: "r032",
      scene: "observer",
      heading: "\u6C34\u6EF4\u6362\u4E86\u4E00\u6279",
      caption: "\u8FD9\u5C31\u662F\u8FFD\u4E0D\u5230\u5F69\u8679\u7684\u539F\u56E0\u3002\u4F60\u5F80\u524D\u8D70\uFF0C\u6210\u8679\u7684\u6C34\u6EF4",
      text: "\u8FD9\u5C31\u662F\u8FFD\u4E0D\u5230\u5F69\u8679\u7684\u539F\u56E0\u3002\u4F60\u5F80\u524D\u8D70\uFF0C\u6210\u8679\u7684\u6C34\u6EF4\u4E5F\u5728\u6362\u3002\u6240\u8C13\u5F69\u8679\u7684\u5C3D\u5934\uFF0C\u662F\u89C6\u7EBF\u91CC\u7684\u4F4D\u7F6E\u3002",
      spoken: "\u8FD9\u5C31\u662F\u8FFD\u4E0D\u5230\u5F69\u8679\u7684\u539F\u56E0\u3002\u4F60\u5F80\u524D\u8D70\uFF0C\u6210\u8679\u7684\u6C34\u6EF4\u4E5F\u5728\u6362\u3002\u6240\u8C13\u5F69\u8679\u7684\u5C3D\u5934\uFF0C\u662F\u89C6\u7EBF\u91CC\u7684\u4F4D\u7F6E\u3002",
      start: 273.00025,
      end: 281.48025,
      duration: 8.48,
      audio: "public/audio/r032.wav",
      audioSHA256: "a5f7bee2874342b5fd238a42b621217ef5216d9ebd54036699a67b0e74893ce4",
      startSample: 13104012,
      samples: 407040
    },
    {
      id: "r033",
      scene: "secondary",
      heading: "\u591A\u4E00\u6B21\u53CD\u5C04",
      caption: "\u6709\u65F6\uFF0C\u5916\u9762\u8FD8\u4F1A\u51FA\u73B0\u4E00\u6761\u66F4\u6DE1\u7684\u5F27\u3002\u4ED4\u7EC6\u770B\uFF0C\u7EA2\u8272",
      text: "\u6709\u65F6\uFF0C\u5916\u9762\u8FD8\u4F1A\u51FA\u73B0\u4E00\u6761\u66F4\u6DE1\u7684\u5F27\u3002\u4ED4\u7EC6\u770B\uFF0C\u7EA2\u8272\u8DD1\u5230\u4E86\u91CC\u9762\uFF0C\u7D2B\u8272\u53CD\u800C\u5728\u5916\u9762\u3002",
      spoken: "\u6709\u65F6\uFF0C\u5916\u9762\u8FD8\u4F1A\u51FA\u73B0\u4E00\u6761\u66F4\u6DE1\u7684\u5F27\u3002\u4ED4\u7EC6\u770B\uFF0C\u7EA2\u8272\u8DD1\u5230\u4E86\u91CC\u9762\uFF0C\u7D2B\u8272\u53CD\u800C\u5728\u5916\u9762\u3002",
      start: 281.60025,
      end: 289.12025,
      duration: 7.52,
      audio: "public/audio/r033.wav",
      audioSHA256: "1d84bf66c17d5ea19d925f745817fd4aa60ffec179b6f81aa06e2a4705b16606",
      startSample: 13516812,
      samples: 360960
    },
    {
      id: "r034",
      scene: "secondary",
      heading: "\u591A\u4E00\u6B21\u53CD\u5C04",
      caption: "\u518D\u56DE\u5230\u6C34\u6EF4\u3002\u8FD9\u6B21\u5149\u5728\u91CC\u9762\u56DE\u5934\u4E24\u6B21\uFF0C\u624D\u79BB\u5F00\u3002\u591A",
      text: "\u518D\u56DE\u5230\u6C34\u6EF4\u3002\u8FD9\u6B21\u5149\u5728\u91CC\u9762\u56DE\u5934\u4E24\u6B21\uFF0C\u624D\u79BB\u5F00\u3002\u591A\u4E00\u6B21\u53CD\u5C04\uFF0C\u51FA\u53E3\u7684\u65B9\u5411\u5C31\u53D8\u4E86\u3002",
      spoken: "\u518D\u56DE\u5230\u6C34\u6EF4\u3002\u8FD9\u6B21\u5149\u5728\u91CC\u9762\u56DE\u5934\u4E24\u6B21\uFF0C\u624D\u79BB\u5F00\u3002\u591A\u4E00\u6B21\u53CD\u5C04\uFF0C\u51FA\u53E3\u7684\u65B9\u5411\u5C31\u53D8\u4E86\u3002",
      start: 289.24025,
      end: 296.92025,
      duration: 7.68,
      audio: "public/audio/r034.wav",
      audioSHA256: "c751edf75844a7df55ea3971c91b3a730ae3ec185b0f600b9e93c545f9f36343",
      startSample: 13883532,
      samples: 368640
    },
    {
      id: "r035",
      scene: "secondary",
      heading: "\u591A\u4E00\u6B21\u53CD\u5C04",
      caption: "\u526F\u8679\u5927\u7EA6\u5728\u4E94\u5341\u4E00\u5EA6\u9644\u8FD1\uFF0C\u7D2B\u5149\u66F4\u9760\u5916\u3002\u4E8E\u662F\u5B83\u56F4",
      text: "\u526F\u8679\u5927\u7EA6\u5728\u4E94\u5341\u4E00\u5EA6\u9644\u8FD1\uFF0C\u7D2B\u5149\u66F4\u9760\u5916\u3002\u4E8E\u662F\u5B83\u56F4\u5728\u4E3B\u8679\u5916\u9762\uFF0C\u989C\u8272\u987A\u5E8F\u4E5F\u5012\u8FC7\u6765\u3002",
      spoken: "\u526F\u8679\u5927\u7EA6\u5728\u4E94\u5341\u4E00\u5EA6\u9644\u8FD1\uFF0C\u7D2B\u5149\u66F4\u9760\u5916\u3002\u4E8E\u662F\u5B83\u56F4\u5728\u4E3B\u8679\u5916\u9762\uFF0C\u989C\u8272\u987A\u5E8F\u4E5F\u5012\u8FC7\u6765\u3002",
      start: 297.04025,
      end: 304.40025,
      duration: 7.36,
      audio: "public/audio/r035.wav",
      audioSHA256: "da7443e0195d4a722c67746d6d164dc7454ba172ac7ebfb5a3aa8aac6ae67646",
      startSample: 14257932,
      samples: 353280
    },
    {
      id: "r036",
      scene: "secondary",
      heading: "\u591A\u4E00\u6B21\u53CD\u5C04",
      caption: "\u6BCF\u6B21\u53CD\u5C04\uFF0C\u90FD\u6709\u4E00\u90E8\u5206\u5149\u79BB\u5F00\u539F\u6765\u7684\u8DEF\u7EBF\u3002\u591A\u7ED5\u4E00",
      text: "\u6BCF\u6B21\u53CD\u5C04\uFF0C\u90FD\u6709\u4E00\u90E8\u5206\u5149\u79BB\u5F00\u539F\u6765\u7684\u8DEF\u7EBF\u3002\u591A\u7ED5\u4E00\u5708\uFF0C\u9001\u5230\u773C\u775B\u91CC\u7684\u5149\u66F4\u5C11\uFF0C\u526F\u8679\u4E5F\u5C31\u663E\u5F97\u6DE1\u3002",
      spoken: "\u6BCF\u6B21\u53CD\u5C04\uFF0C\u90FD\u6709\u4E00\u90E8\u5206\u5149\u79BB\u5F00\u539F\u6765\u7684\u8DEF\u7EBF\u3002\u591A\u7ED5\u4E00\u5708\uFF0C\u9001\u5230\u773C\u775B\u91CC\u7684\u5149\u66F4\u5C11\uFF0C\u526F\u8679\u4E5F\u5C31\u663E\u5F97\u6DE1\u3002",
      start: 304.52025,
      end: 313.08025,
      duration: 8.56,
      audio: "public/audio/r036.wav",
      audioSHA256: "b3d015b5542c87f3ce13cfc3a74f85f28631c5df6643d0e349b846f48c7db620",
      startSample: 14616972,
      samples: 410880
    },
    {
      id: "r037",
      scene: "secondary",
      heading: "\u591A\u4E00\u6B21\u53CD\u5C04",
      caption: "\u4E24\u9053\u8679\u4E4B\u95F4\uFF0C\u5149\u7EBF\u6BD4\u8F83\u5C11\u96C6\u4E2D\u5230\u90A3\u91CC\uFF0C\u6240\u4EE5\u5E38\u6709\u4E00",
      text: "\u4E24\u9053\u8679\u4E4B\u95F4\uFF0C\u8FD9\u4E24\u7C7B\u5149\u8DEF\u9001\u5230\u773C\u775B\u91CC\u7684\u5149\u6BD4\u8F83\u5C11\u3002\u90A3\u4E00\u5708\u504F\u6697\u7684\u5929\u7A7A\uFF0C\u53EB\u4E9A\u5386\u5C71\u5927\u6697\u5E26\u3002\u7A7A\u6C14\u6563\u5C04\u7684\u5149\u4ECD\u5728\uFF0C\u6240\u4EE5\u5B83\u5E76\u6CA1\u6709\u53D8\u6210\u4E00\u7247\u6F06\u9ED1\u3002",
      spoken: "\u4E24\u9053\u8679\u4E4B\u95F4\uFF0C\u8FD9\u4E24\u7C7B\u5149\u8DEF\u9001\u5230\u773C\u775B\u91CC\u7684\u5149\u6BD4\u8F83\u5C11\u3002\u90A3\u4E00\u5708\u504F\u6697\u7684\u5929\u7A7A\uFF0C\u53EB\u4E9A\u5386\u5C71\u5927\u6697\u5E26\u3002\u7A7A\u6C14\u6563\u5C04\u7684\u5149\u4ECD\u5728\uFF0C\u6240\u4EE5\u5B83\u5E76\u6CA1\u6709\u53D8\u6210\u4E00\u7247\u6F06\u9ED1\u3002",
      start: 313.20025,
      end: 326.640292,
      duration: 13.440042,
      audio: "public/audio_v10/r037-a.wav",
      audioSHA256: "953b10f69953ffd56cac32828f6c041178c4376a7e41a1d92ed67f60b2e4b0ae",
      startSample: 15033612,
      samples: 645122
    },
    {
      id: "r038",
      scene: "return",
      heading: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE",
      caption: "\u4E0D\u5FC5\u7B49\u4E0B\u4E00\u573A\u96E8\u3002\u6674\u5929\u7684\u55B7\u6CC9\uFF0C\u6216\u8005\u6D12\u6C34\u65F6\u5F62\u6210\u7684",
      text: "\u4E0D\u5FC5\u7B49\u4E0B\u4E00\u573A\u96E8\u3002\u6674\u5929\u7684\u55B7\u6CC9\uFF0C\u6216\u8005\u6D12\u6C34\u65F6\u5F62\u6210\u7684\u7EC6\u6C34\u96FE\uFF0C\u5C31\u80FD\u505A\u4E00\u6B21\u5C0F\u5B9E\u9A8C\u3002",
      spoken: "\u4E0D\u5FC5\u7B49\u4E0B\u4E00\u573A\u96E8\u3002\u6674\u5929\u7684\u55B7\u6CC9\uFF0C\u6216\u8005\u6D12\u6C34\u65F6\u5F62\u6210\u7684\u7EC6\u6C34\u96FE\uFF0C\u5C31\u80FD\u505A\u4E00\u6B21\u5C0F\u5B9E\u9A8C\u3002",
      start: 326.760292,
      end: 333.960333,
      duration: 7.200042,
      audio: "public/audio/r038.wav",
      audioSHA256: "68576c719547cac3fec14a5d08a0f288407916e17e22028884ae8a4d33d671b2",
      startSample: 15684494,
      samples: 345602
    },
    {
      id: "r039",
      scene: "return",
      heading: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE",
      caption: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE\uFF0C\u6162\u6162\u8C03\u6574\u4F4D\u7F6E\u3002\u5408\u9002\u7684\u89D2\u5EA6",
      text: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE\uFF0C\u6162\u6162\u8C03\u6574\u4F4D\u7F6E\u3002\u5408\u9002\u7684\u89D2\u5EA6\u4E00\u5230\uFF0C\u51E0\u6EF4\u666E\u901A\u7684\u6C34\uFF0C\u5C31\u80FD\u4EAE\u51FA\u4E00\u5C0F\u6BB5\u5F69\u8679\u3002",
      spoken: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE\uFF0C\u6162\u6162\u8C03\u6574\u4F4D\u7F6E\u3002\u5408\u9002\u7684\u89D2\u5EA6\u4E00\u5230\uFF0C\u51E0\u6EF4\u666E\u901A\u7684\u6C34\uFF0C\u5C31\u80FD\u4EAE\u51FA\u4E00\u5C0F\u6BB5\u5F69\u8679\u3002",
      start: 334.080333,
      end: 342.800375,
      duration: 8.720042,
      audio: "public/audio/r039.wav",
      audioSHA256: "306aa6dc60194cd4b38b0a09a1202fafee4fb00d210fea0f548ab3881150c2ea",
      startSample: 16035856,
      samples: 418562
    },
    {
      id: "r041",
      scene: "return",
      heading: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE",
      caption: "\u4E0B\u6B21\u96E8\u540E\u62AC\u5934\uFF0C\u4F60\u53EF\u4EE5\u8BD5\u7740\u627E\u51FA\u592A\u9633\u3001\u5F71\u5B50\u548C\u96E8\u5E55",
      text: "\u4E0B\u6B21\u96E8\u540E\u62AC\u5934\uFF0C\u4F60\u53EF\u4EE5\u8BD5\u7740\u627E\u51FA\u592A\u9633\u3001\u5F71\u5B50\u548C\u96E8\u5E55\u3002\u90A3\u9053\u5F2F\u5F2F\u7684\u5F69\u8679\uFF0C\u662F\u5149\u548C\u4F60\u5171\u540C\u753B\u51FA\u7684\u5706\u3002",
      spoken: "\u4E0B\u6B21\u96E8\u540E\u62AC\u5934\uFF0C\u4F60\u53EF\u4EE5\u8BD5\u7740\u627E\u51FA\u592A\u9633\u3001\u5F71\u5B50\u548C\u96E8\u5E55\u3002\u90A3\u9053\u5F2F\u5F2F\u7684\u5F69\u8679\uFF0C\u662F\u5149\u548C\u4F60\u5171\u540C\u753B\u51FA\u7684\u5706\u3002",
      start: 342.920375,
      end: 351.720375,
      duration: 8.8,
      audio: "public/audio/r041.wav",
      audioSHA256: "eda44fed99fee8a7e6b4d88847cfe50e1271ce31e4885240fec56c44e10366d5",
      startSample: 16460178,
      samples: 422400
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
      end: 78.570042,
      text: "\u5149\u4E5F\u6709\u8D77\u4F0F\uFF0C",
      clipId: "r042"
    },
    {
      start: 78.900042,
      end: 81.840042,
      text: "\u6CE2\u957F\u5C31\u662F\u76F8\u90BB\u4E24\u6B21\u8D77\u4F0F\u4E4B\u95F4\u7684\u8DDD\u79BB\u3002",
      clipId: "r042"
    },
    {
      start: 81.840042,
      end: 84.330042,
      text: "\u7EA2\u5149\u7684\u6CE2\u957F\u8F83\u957F\uFF0C\u7D2B\u5149\u8F83\u77ED\u3002",
      clipId: "r042"
    },
    {
      start: 84.680042,
      end: 86.350042,
      text: "\u6C34\u5BF9\u5B83\u4EEC\u7684\u6298\u5C04\u7A0B\u5EA6\u4E0D\u540C\uFF0C",
      clipId: "r042"
    },
    {
      start: 86.660042,
      end: 87.830042,
      text: "\u989C\u8272\u624D\u4F1A\u5206\u5F00\u3002",
      clipId: "r042"
    },
    {
      start: 88.520042,
      end: 91.890042,
      text: "\u4E2D\u95F4\u8FD8\u6709\u6A59\u3001\u9EC4\u3001\u7EFF\u3001\u84DD\uFF0C",
      clipId: "r011"
    },
    {
      start: 92.160042,
      end: 93.250042,
      text: "\u4E00\u79CD\u63A5\u7740\u4E00\u79CD\u3002",
      clipId: "r011"
    },
    {
      start: 93.520042,
      end: 94.625042,
      text: "\u6C34\u6EF4\u505A\u7684\u4E8B\uFF0C",
      clipId: "r011"
    },
    {
      start: 94.720042,
      end: 96.870042,
      text: "\u662F\u628A\u767D\u5149\u91CC\u539F\u6709\u7684\u989C\u8272\u5C55\u5F00\u3002",
      clipId: "r011"
    },
    {
      start: 97.680083,
      end: 99.670083,
      text: "\u989C\u8272\u4E4B\u95F4\u4E00\u76F4\u5728\u8FC7\u6E21\u3002",
      clipId: "r012"
    },
    {
      start: 99.800083,
      end: 100.980083,
      text: "\u6211\u4EEC\u5E38\u8BF4\u7684\u4E03\u8272\uFF0C",
      clipId: "r012"
    },
    {
      start: 100.980083,
      end: 102.610083,
      text: "\u662F\u65B9\u4FBF\u8BB0\u5FC6\u7684\u540D\u5B57\uFF0C",
      clipId: "r012"
    },
    {
      start: 102.800083,
      end: 104.530083,
      text: "\u771F\u5B9E\u7684\u5149\u8C31\u8FDE\u6210\u4E00\u7247\u3002",
      clipId: "r012"
    },
    {
      start: 105.000125,
      end: 106.990125,
      text: "\u6CBF\u7740\u8FD9\u7247\u5149\u8C31\u6162\u6162\u79FB\u52A8\uFF0C",
      clipId: "r043"
    },
    {
      start: 107.340125,
      end: 109.270125,
      text: "\u7EA2\u8272\u5148\u504F\u6A59\uFF0C\u518D\u504F\u9EC4\u3002",
      clipId: "r043"
    },
    {
      start: 109.600125,
      end: 112.610125,
      text: "\u4E03\u4E2A\u540D\u5B57\uFF0C\u50CF\u7ED9\u6E10\u53D8\u8272\u653E\u4E86\u51E0\u4E2A\u8DEF\u6807\uFF0C",
      clipId: "r043"
    },
    {
      start: 113.140125,
      end: 114.970125,
      text: "\u4E2D\u95F4\u8FD8\u6709\u8BB8\u591A\u7EC6\u5FAE\u7684\u989C\u8272\u3002",
      clipId: "r043"
    },
    {
      start: 115.280125,
      end: 116.290125,
      text: "\u7EE7\u7EED\u5F80\u91CC\u8D70\u3002",
      clipId: "r013"
    },
    {
      start: 116.660125,
      end: 118.350125,
      text: "\u5149\u5230\u8FBE\u6C34\u6EF4\u7684\u53E6\u4E00\u9762\uFF0C",
      clipId: "r013"
    },
    {
      start: 118.580125,
      end: 119.630125,
      text: "\u6709\u4E00\u90E8\u5206\u7A7F\u51FA\u53BB\uFF0C",
      clipId: "r013"
    },
    {
      start: 119.880125,
      end: 122.570125,
      text: "\u8FD8\u6709\u4E00\u90E8\u5206\u5728\u6C34\u91CC\u53CD\u5C04\uFF0C\u56DE\u8FC7\u5934\u6765\u3002",
      clipId: "r013"
    },
    {
      start: 123.240125,
      end: 126.120125,
      text: "\u8FD9\u4E00\u90E8\u5206\u5149\u518D\u6B21\u8D70\u5230\u6C34\u548C\u7A7A\u6C14\u7684\u4EA4\u754C\uFF0C",
      clipId: "r014"
    },
    {
      start: 126.120125,
      end: 127.840125,
      text: "\u51FA\u95E8\u65F6\u53C8\u6298\u5C04\u4E00\u6B21\u3002",
      clipId: "r014"
    },
    {
      start: 127.840125,
      end: 130.810125,
      text: "\u5B83\u5DF2\u7ECF\u671D\u7740\u9633\u5149\u6765\u65F6\u7684\u90A3\u4E00\u4FA7\u8FD4\u56DE\u3002",
      clipId: "r014"
    },
    {
      start: 131.520125,
      end: 132.890125,
      text: "\u8FDB\u95E8\u8F6C\u4E00\u6B21\u5F2F\uFF0C",
      clipId: "r015"
    },
    {
      start: 133.160125,
      end: 134.170125,
      text: "\u91CC\u9762\u56DE\u4E00\u6B21\u5934\uFF0C",
      clipId: "r015"
    },
    {
      start: 134.480125,
      end: 136.620125,
      text: "\u51FA\u95E8\u518D\u8F6C\u4E00\u6B21\u5F2F\u3002\u8FD9\u6761\u8DEF\u7EBF\uFF0C",
      clipId: "r015"
    },
    {
      start: 136.620125,
      end: 138.090125,
      text: "\u5C31\u662F\u6700\u5E38\u89C1\u7684\u4E3B\u8679\u3002",
      clipId: "r015"
    },
    {
      start: 138.840167,
      end: 140.010167,
      text: "\u8FD9\u4E00\u6765\u4E00\u56DE\uFF0C",
      clipId: "r044"
    },
    {
      start: 140.300167,
      end: 142.200167,
      text: "\u7EA2\u5149\u548C\u7D2B\u5149\u7684\u51FA\u53E3\u5C31\u9519\u5F00\u4E86\u3002",
      clipId: "r044"
    },
    {
      start: 142.200167,
      end: 144.460167,
      text: "\u7B49\u8BB8\u591A\u96E8\u6EF4\u540C\u65F6\u628A\u5149\u9001\u8FC7\u6765\uFF0C",
      clipId: "r044"
    },
    {
      start: 144.460167,
      end: 145.870167,
      text: "\u8FD9\u70B9\u65B9\u5411\u5DEE\u5F02\uFF0C",
      clipId: "r044"
    },
    {
      start: 146.020167,
      end: 148.850167,
      text: "\u624D\u4F1A\u5C55\u5F00\u6210\u5929\u7A7A\u4E2D\u6709\u5BBD\u5EA6\u7684\u4E00\u9053\u5F69\u5E26\u3002",
      clipId: "r044"
    },
    {
      start: 149.680167,
      end: 153.000167,
      text: "\u8BA9\u66F4\u591A\u5149\u7EBF\u4ECE\u4E0D\u540C\u4F4D\u7F6E\u8FDB\u5165\u3002\u4F60\u4F1A\u53D1\u73B0\uFF0C",
      clipId: "r017"
    },
    {
      start: 153.000167,
      end: 155.640167,
      text: "\u8BB8\u591A\u51FA\u5C04\u5149\u6324\u5728\u76F8\u8FD1\u7684\u89D2\u5EA6\uFF0C",
      clipId: "r017"
    },
    {
      start: 155.640167,
      end: 157.530167,
      text: "\u5F62\u6210\u4E00\u5904\u660E\u4EAE\u7684\u96C6\u4E2D\u3002",
      clipId: "r017"
    },
    {
      start: 158.280167,
      end: 159.680167,
      text: "\u7EA2\u5149\u6700\u4EAE\u7684\u65B9\u5411\uFF0C",
      clipId: "r018"
    },
    {
      start: 159.680167,
      end: 161.090167,
      text: "\u5927\u7EA6\u5728\u56DB\u5341\u4E8C\u5EA6\uFF1B",
      clipId: "r018"
    },
    {
      start: 161.580167,
      end: 163.050167,
      text: "\u7D2B\u5149\u5927\u7EA6\u56DB\u5341\u5EA6\u3002",
      clipId: "r018"
    },
    {
      start: 163.300167,
      end: 164.600167,
      text: "\u5DEE\u51FA\u6765\u7684\u8FD9\u70B9\u89D2\u5EA6\uFF0C",
      clipId: "r018"
    },
    {
      start: 164.600167,
      end: 166.610167,
      text: "\u628A\u5F69\u8272\u7684\u8FB9\u7F18\u62C9\u5F00\u4E86\u3002",
      clipId: "r018"
    },
    {
      start: 167.280167,
      end: 168.180167,
      text: "\u8FD9\u4E24\u4E2A\u89D2\uFF0C",
      clipId: "r019"
    },
    {
      start: 168.180167,
      end: 171.120167,
      text: "\u662F\u5BF9\u7740\u54EA\u91CC\u91CF\u7684\u5462\uFF1F\u4ECE\u592A\u9633\uFF0C",
      clipId: "r019"
    },
    {
      start: 171.120167,
      end: 172.590167,
      text: "\u7ECF\u8FC7\u4F60\u7684\u773C\u775B\uFF0C",
      clipId: "r019"
    },
    {
      start: 172.660167,
      end: 173.630167,
      text: "\u518D\u5411\u524D\u5EF6\u4F38\uFF0C",
      clipId: "r019"
    },
    {
      start: 173.860167,
      end: 175.410167,
      text: "\u5C31\u662F\u80CC\u5411\u592A\u9633\u7684\u65B9\u5411\u3002",
      clipId: "r019"
    },
    {
      start: 176.040167,
      end: 177.870167,
      text: "\u4F60\u7684\u5F71\u5B50\u4E5F\u6307\u5411\u90A3\u8FB9\u3002",
      clipId: "r020"
    },
    {
      start: 178.060167,
      end: 179.410167,
      text: "\u4EE5\u8FD9\u6761\u65B9\u5411\u4E3A\u4E2D\u5FC3\uFF0C",
      clipId: "r020"
    },
    {
      start: 179.580167,
      end: 180.890167,
      text: "\u5F80\u5916\u504F\u56DB\u5341\u4E8C\u5EA6\uFF0C",
      clipId: "r020"
    },
    {
      start: 181.100167,
      end: 182.910167,
      text: "\u5C31\u627E\u5230\u4E86\u4E3B\u8679\u7684\u7EA2\u8272\u5916\u7F18\u3002",
      clipId: "r020"
    },
    {
      start: 183.760167,
      end: 185.000167,
      text: "\u73B0\u5728\u628A\u4E00\u6EF4\u6C34\uFF0C",
      clipId: "r021"
    },
    {
      start: 185.000167,
      end: 186.450167,
      text: "\u6362\u6210\u4E00\u6574\u7247\u96E8\u3002",
      clipId: "r021"
    },
    {
      start: 186.640167,
      end: 188.700167,
      text: "\u80FD\u628A\u7EA2\u5149\u9001\u8FDB\u4F60\u773C\u775B\u7684\u6C34\u6EF4\uFF0C",
      clipId: "r021"
    },
    {
      start: 188.700167,
      end: 190.290167,
      text: "\u90FD\u843D\u5728\u8FD9\u7EC4\u65B9\u5411\u4E0A\u3002",
      clipId: "r021"
    },
    {
      start: 190.600167,
      end: 192.770167,
      text: "\u671D\u4E0A\u3001\u671D\u5DE6\u3001\u671D\u53F3\uFF0C",
      clipId: "r022"
    },
    {
      start: 193.120167,
      end: 195.290167,
      text: "\u53EA\u8981\u548C\u4E2D\u5FC3\u7EBF\u4FDD\u6301\u540C\u6837\u7684\u89D2\u5EA6\uFF0C",
      clipId: "r022"
    },
    {
      start: 195.440167,
      end: 197.870167,
      text: "\u90FD\u6709\u673A\u4F1A\u51FA\u73B0\u7EA2\u5149\u3002\u7ED5\u4E00\u5708\uFF0C",
      clipId: "r022"
    },
    {
      start: 198.100167,
      end: 199.210167,
      text: "\u5C31\u56F4\u51FA\u4E00\u4E2A\u5706\u9525\u3002",
      clipId: "r022"
    },
    {
      start: 199.680208,
      end: 201.290208,
      text: "\u4F60\u7684\u773C\u775B\u5728\u5C16\u7AEF\u3002",
      clipId: "r023"
    },
    {
      start: 201.560208,
      end: 203.030208,
      text: "\u90A3\u4E9B\u6C34\u6EF4\u53EF\u4EE5\u5F88\u8FD1\uFF0C",
      clipId: "r023"
    },
    {
      start: 203.320208,
      end: 205.130208,
      text: "\u4E5F\u53EF\u4EE5\u5F88\u8FDC\uFF0C\u91CD\u8981\u7684\u662F\uFF0C",
      clipId: "r023"
    },
    {
      start: 205.460208,
      end: 207.310208,
      text: "\u5B83\u4EEC\u6709\u6CA1\u6709\u843D\u5728\u5408\u9002\u7684\u65B9\u5411\u3002",
      clipId: "r023"
    },
    {
      start: 207.720208,
      end: 209.250208,
      text: "\u4ECE\u5C16\u7AEF\u671B\u51FA\u53BB\uFF0C",
      clipId: "r024"
    },
    {
      start: 209.600208,
      end: 213.270208,
      text: "\u8FD9\u4E9B\u65B9\u5411\u56F4\u6210\u4E00\u4E2A\u5706\u3002\u7EA2\u8272\u5728\u5916\uFF0C\u7D2B\u8272\u5728\u5185\u3002",
      clipId: "r024"
    },
    {
      start: 213.580208,
      end: 215.990208,
      text: "\u539F\u6765\u5F69\u8679\u7684\u5B8C\u6574\u5F62\u72B6\uFF0C\u662F\u5706\u7684\u3002",
      clipId: "r024"
    },
    {
      start: 216.640208,
      end: 218.090208,
      text: "\u6211\u4EEC\u7AD9\u5728\u5730\u9762\u4E0A\uFF0C",
      clipId: "r025"
    },
    {
      start: 218.280208,
      end: 220.370208,
      text: "\u5F80\u4E0B\u770B\u7684\u65B9\u5411\u88AB\u5730\u9762\u6321\u4F4F\uFF0C",
      clipId: "r025"
    },
    {
      start: 220.620208,
      end: 223.450208,
      text: "\u4E0B\u9762\u4E5F\u5E38\u5E38\u7F3A\u5C11\u88AB\u9633\u5149\u7167\u5230\u7684\u96E8\u6EF4\u3002",
      clipId: "r025"
    },
    {
      start: 223.760208,
      end: 225.630208,
      text: "\u4E8E\u662F\u53EA\u5269\u5929\u7A7A\u91CC\u7684\u8FD9\u4E00\u6BB5\u5F27\u3002",
      clipId: "r025"
    },
    {
      start: 226.440208,
      end: 228.166875,
      text: "\u592A\u9633\u8D34\u8FD1\u5730\u5E73\u7EBF\u65F6\uFF0C",
      clipId: "r026"
    },
    {
      start: 228.166875,
      end: 229.930208,
      text: "\u5706\u5FC3\u4E5F\u63A5\u8FD1\u5730\u5E73\u7EBF\uFF0C",
      clipId: "r026"
    },
    {
      start: 230.180208,
      end: 234.130208,
      text: "\u5F69\u8679\u80FD\u9732\u51FA\u8F83\u957F\u7684\u4E00\u6BB5\u3002\u592A\u9633\u5347\u9AD8\uFF0C\u5706\u5FC3\u4E0B\u6C89\uFF0C",
      clipId: "r026"
    },
    {
      start: 234.380208,
      end: 235.670208,
      text: "\u9732\u51FA\u7684\u5F27\u5C31\u77ED\u4E86\u3002",
      clipId: "r026"
    },
    {
      start: 236.240208,
      end: 238.110208,
      text: "\u98DE\u673A\u65C1\u3001\u7011\u5E03\u4E0A\u65B9\uFF0C",
      clipId: "r027"
    },
    {
      start: 238.360208,
      end: 239.550208,
      text: "\u6709\u65F6\u80FD\u770B\u89C1\u6574\u5706\u3002",
      clipId: "r027"
    },
    {
      start: 239.860208,
      end: 242.365208,
      text: "\u6761\u4EF6\u662F\u811A\u4E0B\u4E5F\u6709\u9633\u5149\u7167\u4EAE\u7684\u6C34\u96FE\uFF0C",
      clipId: "r027"
    },
    {
      start: 242.500208,
      end: 243.850208,
      text: "\u800C\u4E14\u89C6\u91CE\u8DB3\u591F\u5F00\u9614\u3002",
      clipId: "r027"
    },
    {
      start: 244.600208,
      end: 245.246875,
      text: "\u6240\u4EE5\uFF0C",
      clipId: "r028"
    },
    {
      start: 245.246875,
      end: 247.990208,
      text: "\u5F27\u5F62\u6765\u81EA\u6211\u4EEC\u7684\u4F4D\u7F6E\u548C\u5730\u9762\u7684\u906E\u6321\u3002",
      clipId: "r028"
    },
    {
      start: 248.260208,
      end: 249.210208,
      text: "\u6362\u4E00\u4E2A\u89C6\u91CE\uFF0C",
      clipId: "r028"
    },
    {
      start: 249.460208,
      end: 250.380208,
      text: "\u85CF\u8D77\u6765\u7684\u90A3\u4E00\u6BB5\uFF0C",
      clipId: "r028"
    },
    {
      start: 250.380208,
      end: 251.810208,
      text: "\u4E5F\u53EF\u80FD\u91CD\u65B0\u51FA\u73B0\u3002",
      clipId: "r028"
    },
    {
      start: 252.16025,
      end: 254.25025,
      text: "\u8FD8\u8BB0\u5F97\u5F00\u5934\u90A3\u5EA7\u8FFD\u4E0D\u5230\u7684\u6865\u5417\uFF1F",
      clipId: "r029"
    },
    {
      start: 254.44025,
      end: 255.50025,
      text: "\u8BA9\u6211\u4EEC\u6A2A\u7740\u8D70\u51E0\u6B65\uFF0C",
      clipId: "r029"
    },
    {
      start: 255.50025,
      end: 256.93025,
      text: "\u770B\u770B\u4F1A\u53D1\u751F\u4EC0\u4E48\u3002",
      clipId: "r029"
    },
    {
      start: 257.72025,
      end: 259.09025,
      text: "\u773C\u775B\u6362\u4E86\u4F4D\u7F6E\uFF0C",
      clipId: "r030"
    },
    {
      start: 259.34025,
      end: 261.11025,
      text: "\u5706\u9525\u7684\u5C16\u7AEF\u4E5F\u8DDF\u7740\u79FB\u52A8\u3002",
      clipId: "r030"
    },
    {
      start: 261.14025,
      end: 263.47025,
      text: "\u539F\u5148\u9001\u6765\u7EA2\u5149\u7684\u6C34\u6EF4\u9000\u4E0B\uFF0C",
      clipId: "r030"
    },
    {
      start: 263.66025,
      end: 265.27025,
      text: "\u65C1\u8FB9\u53E6\u4E00\u6279\u6C34\u6EF4\u63A5\u4E0A\u3002",
      clipId: "r030"
    },
    {
      start: 265.60025,
      end: 267.09025,
      text: "\u4E24\u4E2A\u4EBA\u80A9\u5E76\u80A9\uFF0C",
      clipId: "r031"
    },
    {
      start: 267.32025,
      end: 269.05025,
      text: "\u770B\u89C1\u7684\u5F69\u8679\u975E\u5E38\u76F8\u4F3C\u3002",
      clipId: "r031"
    },
    {
      start: 269.26025,
      end: 270.62025,
      text: "\u9001\u8FDB\u5404\u81EA\u773C\u775B\u7684\u5149\uFF0C",
      clipId: "r031"
    },
    {
      start: 270.62025,
      end: 272.29025,
      text: "\u5374\u6765\u81EA\u4E0D\u540C\u7684\u6C34\u6EF4\u3002",
      clipId: "r031"
    },
    {
      start: 273.00025,
      end: 276.25025,
      text: "\u8FD9\u5C31\u662F\u8FFD\u4E0D\u5230\u5F69\u8679\u7684\u539F\u56E0\u3002\u4F60\u5F80\u524D\u8D70\uFF0C",
      clipId: "r032"
    },
    {
      start: 276.48025,
      end: 277.99025,
      text: "\u6210\u8679\u7684\u6C34\u6EF4\u4E5F\u5728\u6362\u3002",
      clipId: "r032"
    },
    {
      start: 278.38025,
      end: 279.50025,
      text: "\u6240\u8C13\u5F69\u8679\u7684\u5C3D\u5934\uFF0C",
      clipId: "r032"
    },
    {
      start: 279.50025,
      end: 280.99025,
      text: "\u662F\u89C6\u7EBF\u91CC\u7684\u4F4D\u7F6E\u3002",
      clipId: "r032"
    },
    {
      start: 281.60025,
      end: 282.47025,
      text: "\u6709\u65F6\uFF0C",
      clipId: "r033"
    },
    {
      start: 282.66025,
      end: 285.53025,
      text: "\u5916\u9762\u8FD8\u4F1A\u51FA\u73B0\u4E00\u6761\u66F4\u6DE1\u7684\u5F27\u3002\u4ED4\u7EC6\u770B\uFF0C",
      clipId: "r033"
    },
    {
      start: 285.80025,
      end: 287.01025,
      text: "\u7EA2\u8272\u8DD1\u5230\u4E86\u91CC\u9762\uFF0C",
      clipId: "r033"
    },
    {
      start: 287.14025,
      end: 288.73025,
      text: "\u7D2B\u8272\u53CD\u800C\u5728\u5916\u9762\u3002",
      clipId: "r033"
    },
    {
      start: 289.24025,
      end: 290.55025,
      text: "\u518D\u56DE\u5230\u6C34\u6EF4\u3002",
      clipId: "r034"
    },
    {
      start: 290.88025,
      end: 293.51025,
      text: "\u8FD9\u6B21\u5149\u5728\u91CC\u9762\u56DE\u5934\u4E24\u6B21\uFF0C\u624D\u79BB\u5F00\u3002",
      clipId: "r034"
    },
    {
      start: 293.72025,
      end: 294.73025,
      text: "\u591A\u4E00\u6B21\u53CD\u5C04\uFF0C",
      clipId: "r034"
    },
    {
      start: 294.94025,
      end: 296.45025,
      text: "\u51FA\u53E3\u7684\u65B9\u5411\u5C31\u53D8\u4E86\u3002",
      clipId: "r034"
    },
    {
      start: 297.80025,
      end: 299.29025,
      text: "\u526F\u8679\u5927\u7EA6\u5728\u4E94\u5341\u4E00\u5EA6\u9644\u8FD1\uFF0C",
      clipId: "r035"
    },
    {
      start: 299.62025,
      end: 300.67025,
      text: "\u7D2B\u5149\u66F4\u9760\u5916\u3002",
      clipId: "r035"
    },
    {
      start: 300.96025,
      end: 302.63025,
      text: "\u4E8E\u662F\u5B83\u56F4\u5728\u4E3B\u8679\u5916\u9762\uFF0C",
      clipId: "r035"
    },
    {
      start: 302.78025,
      end: 304.19025,
      text: "\u989C\u8272\u987A\u5E8F\u4E5F\u5012\u8FC7\u6765\u3002",
      clipId: "r035"
    },
    {
      start: 304.52025,
      end: 305.56025,
      text: "\u6BCF\u6B21\u53CD\u5C04\uFF0C",
      clipId: "r036"
    },
    {
      start: 305.56025,
      end: 309.01025,
      text: "\u90FD\u6709\u4E00\u90E8\u5206\u5149\u79BB\u5F00\u539F\u6765\u7684\u8DEF\u7EBF\u3002\u591A\u7ED5\u4E00\u5708\uFF0C",
      clipId: "r036"
    },
    {
      start: 309.24025,
      end: 310.953583,
      text: "\u9001\u5230\u773C\u775B\u91CC\u7684\u5149\u66F4\u5C11\uFF0C",
      clipId: "r036"
    },
    {
      start: 310.953583,
      end: 312.53025,
      text: "\u526F\u8679\u4E5F\u5C31\u663E\u5F97\u6DE1\u3002",
      clipId: "r036"
    },
    {
      start: 313.20025,
      end: 314.53025,
      text: "\u4E24\u9053\u8679\u4E4B\u95F4\uFF0C",
      clipId: "r037"
    },
    {
      start: 314.76025,
      end: 317.25025,
      text: "\u8FD9\u4E24\u7C7B\u5149\u8DEF\u9001\u5230\u773C\u775B\u91CC\u7684\u5149\u6BD4\u8F83\u5C11\u3002",
      clipId: "r037"
    },
    {
      start: 317.94025,
      end: 319.71025,
      text: "\u90A3\u4E00\u5708\u504F\u6697\u7684\u5929\u7A7A\uFF0C",
      clipId: "r037"
    },
    {
      start: 319.84025,
      end: 321.11025,
      text: "\u53EB\u4E9A\u5386\u5C71\u5927\u6697\u5E26\u3002",
      clipId: "r037"
    },
    {
      start: 322.06025,
      end: 323.89025,
      text: "\u7A7A\u6C14\u6563\u5C04\u7684\u5149\u4ECD\u5728\uFF0C",
      clipId: "r037"
    },
    {
      start: 324.26025,
      end: 325.97025,
      text: "\u6240\u4EE5\u5B83\u5E76\u6CA1\u6709\u53D8\u6210\u4E00\u7247\u6F06\u9ED1\u3002",
      clipId: "r037"
    },
    {
      start: 326.760292,
      end: 328.450292,
      text: "\u4E0D\u5FC5\u7B49\u4E0B\u4E00\u573A\u96E8\u3002",
      clipId: "r038"
    },
    {
      start: 328.820292,
      end: 329.620292,
      text: "\u6674\u5929\u7684\u55B7\u6CC9\uFF0C",
      clipId: "r038"
    },
    {
      start: 329.620292,
      end: 332.200292,
      text: "\u6216\u8005\u6D12\u6C34\u65F6\u5F62\u6210\u7684\u7EC6\u6C34\u96FE\uFF0C",
      clipId: "r038"
    },
    {
      start: 332.200292,
      end: 333.810292,
      text: "\u5C31\u80FD\u505A\u4E00\u6B21\u5C0F\u5B9E\u9A8C\u3002",
      clipId: "r038"
    },
    {
      start: 334.080333,
      end: 336.290333,
      text: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE\uFF0C",
      clipId: "r039"
    },
    {
      start: 336.340333,
      end: 337.630333,
      text: "\u6162\u6162\u8C03\u6574\u4F4D\u7F6E\u3002",
      clipId: "r039"
    },
    {
      start: 338.000333,
      end: 339.020333,
      text: "\u5408\u9002\u7684\u89D2\u5EA6\u4E00\u5230\uFF0C",
      clipId: "r039"
    },
    {
      start: 339.020333,
      end: 340.340333,
      text: "\u51E0\u6EF4\u666E\u901A\u7684\u6C34\uFF0C",
      clipId: "r039"
    },
    {
      start: 340.340333,
      end: 342.150333,
      text: "\u5C31\u80FD\u4EAE\u51FA\u4E00\u5C0F\u6BB5\u5F69\u8679\u3002",
      clipId: "r039"
    },
    {
      start: 342.920375,
      end: 344.570375,
      text: "\u4E0B\u6B21\u96E8\u540E\u62AC\u5934\uFF0C",
      clipId: "r041"
    },
    {
      start: 344.760375,
      end: 347.430375,
      text: "\u4F60\u53EF\u4EE5\u8BD5\u7740\u627E\u51FA\u592A\u9633\u3001\u5F71\u5B50\u548C\u96E8\u5E55\u3002",
      clipId: "r041"
    },
    {
      start: 347.720375,
      end: 348.930375,
      text: "\u90A3\u9053\u5F2F\u5F2F\u7684\u5F69\u8679\uFF0C",
      clipId: "r041"
    },
    {
      start: 349.160375,
      end: 350.950375,
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
      end: 115.160125
    },
    {
      id: "reflection",
      start: 115.280125,
      end: 149.560167
    },
    {
      id: "angle",
      start: 149.680167,
      end: 183.640167
    },
    {
      id: "cone",
      start: 183.760167,
      end: 216.520208
    },
    {
      id: "circle",
      start: 216.640208,
      end: 252.04025
    },
    {
      id: "observer",
      start: 252.16025,
      end: 281.48025
    },
    {
      id: "secondary",
      start: 281.60025,
      end: 326.640292
    },
    {
      id: "return",
      start: 326.760292,
      end: 351.720375
    },
    {
      id: "references",
      start: 351.720375,
      end: 356.733333
    }
  ],
  audio: {
    narration: "public/audio_v10/narration-v10.wav",
    master: "public/audio_v10/master-v10.wav",
    sampleRate: 48e3,
    referencesSeconds: 5,
    narrationSeconds: 351.720375,
    naturalTiming: true,
    noTimeStretch: true,
    noPhonemeSplice: true,
    captionAlignment: "V09 accepted timings retained; four new/repaired clips aligned using no-VAD ASR words with expected-character interpolation"
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
var ease3 = (x) => {
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

// src/SpectrumDetailV10.ts
var SpectrumDetailV10 = class {
  group = new T7.Group();
  rows = [];
  band;
  many = new T7.Group();
  disposed = false;
  constructor(paths) {
    this.group.name = "v10-relative-wavelength-on-refracted-beam";
    for (const index of [0, 3, 6]) {
      const points = paths[index].points;
      const geometry = new T7.BufferGeometry();
      geometry.setAttribute("position", new T7.Float32BufferAttribute(new Float32Array(97 * 3), 3));
      const line2 = new T7.Line(geometry, new T7.LineBasicMaterial({ color: SPECTRUM[index].color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      line2.frustumCulled = false;
      line2.renderOrder = 19;
      this.group.add(line2);
      this.rows.push({ line: line2, start: points[1].clone(), end: points[2].clone(), index });
    }
    const position = [], colour = [], uv = [], indices = [];
    for (let i = 0; i <= 128; i++) {
      const u = i / 128, s = u * 6, k = Math.min(5, Math.floor(s)), c = new T7.Color(SPECTRUM[k].color).lerp(new T7.Color(SPECTRUM[k + 1].color), s - k);
      for (let j = 0; j <= 4; j++) {
        const v2 = j / 4;
        position.push((u - 0.5) * 2.35, 0.3 + 0.07 * Math.sin(u * Math.PI) + 0.24 * (v2 - 0.5), 0.8 + 0.12 * Math.cos(u * Math.PI));
        colour.push(c.r, c.g, c.b);
        uv.push(u, v2);
        if (i < 128 && j < 4) {
          const n = i * 5 + j;
          indices.push(n, n + 5, n + 1, n + 1, n + 5, n + 6);
        }
      }
    }
    const g = new T7.BufferGeometry();
    g.setAttribute("position", new T7.Float32BufferAttribute(position, 3));
    g.setAttribute("colour", new T7.Float32BufferAttribute(colour, 3));
    g.setAttribute("uv", new T7.Float32BufferAttribute(uv, 2));
    g.setIndex(indices);
    const m = new T7.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: T7.DoubleSide,
      toneMapped: false,
      uniforms: { uAlpha: { value: 0 }, uScan: { value: 0 } },
      vertexShader: "attribute vec3 colour;varying vec3 c;varying vec2 q;void main(){c=colour;q=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
      fragmentShader: "varying vec3 c;varying vec2 q;uniform float uAlpha,uScan;void main(){float edge=smoothstep(0.,.06,q.y)*(1.-smoothstep(.94,1.,q.y))*smoothstep(0.,.025,q.x)*(1.-smoothstep(.975,1.,q.x));float marker=exp(-pow(abs((q.x-uScan)/.012),2.));gl_FragColor=vec4(c+vec3(.24)*marker,uAlpha*edge);}"
    });
    this.band = new T7.Mesh(g, m);
    this.band.renderOrder = 22;
    this.band.name = "magnified-continuous-spectral-sample";
    this.group.add(this.band);
    const water = new T7.MeshPhysicalMaterial({ color: "#e4f6ff", roughness: 0.025, transmission: 0.65, ior: 1.333, transparent: true, opacity: 0.45, depthWrite: false, envMapIntensity: 0.32 });
    for (const x of [-4.4, -3.1, 3.1, 4.4]) for (const y of [-0.8, 1.2]) {
      const drop = new T7.Group();
      drop.position.set(x, y, -0.75);
      const mesh = new T7.Mesh(new T7.SphereGeometry(0.29, 32, 20), water.clone());
      drop.add(mesh);
      for (const index of [0, 6]) {
        const p2 = paths[index].points.slice(1).map((p3) => p3.clone().multiplyScalar(0.18));
        const line2 = new T7.Line(new T7.BufferGeometry().setFromPoints(p2), new T7.LineBasicMaterial({ color: SPECTRUM[index].color, transparent: true, opacity: 0.5, depthWrite: false, toneMapped: false }));
        drop.add(line2);
      }
      drop.userData.baseX = x;
      this.many.add(drop);
    }
    water.dispose();
    this.group.add(this.many);
  }
  update(frame) {
    const c = timeline.clips.find((c2) => c2.id === "r042");
    const a = c ? ease3((frame - c.start + 15) / 45) * (1 - ease3((frame - c.end + 15) / 45)) : 0;
    const spectrum = timeline.clips.find((c2) => c2.id === "r043"), groupClip = timeline.clips.find((c2) => c2.id === "r044");
    const b = spectrum ? ease3((frame - spectrum.start + 15) / 45) * (1 - ease3((frame - spectrum.end + 15) / 45)) : 0;
    const many = groupClip ? ease3((frame - groupClip.start - groupClip.duration * 0.26) / 65) * (1 - ease3((frame - groupClip.end + 36) / 85)) : 0;
    this.group.visible = Math.max(a, b, many) > 1e-5;
    this.band.visible = b > 1e-5;
    this.band.material.uniforms.uAlpha.value = b * 0.88;
    this.band.material.uniforms.uScan.value = spectrum ? clamp3((frame - spectrum.start) / spectrum.duration) * 0.42 : 0;
    this.many.visible = many > 1e-5;
    this.many.children.forEach((o) => {
      const x = o.userData.baseX;
      o.position.x = x + Math.sign(x) * 6 * (1 - many);
      o.scale.setScalar(0.8 + 0.2 * many);
      o.traverse((n) => {
        const mat2 = n.material;
        if (mat2) mat2.opacity = (n.isMesh ? 0.45 : 0.5) * many;
      });
    });
    for (const row of this.rows) {
      const p2 = row.line.geometry.getAttribute("position");
      const d = row.end.clone().sub(row.start).normalize(), normal = new T7.Vector3(-d.y, d.x, 0);
      for (let i = 0; i <= 96; i++) {
        const q = i / 96, window = Math.sin(Math.PI * q) ** 2;
        const cycles = 3.5 * 650 / SPECTRUM[row.index].wavelengthNm;
        const wave = Math.sin((q - frame / 30 * 0.09) * cycles * Math.PI * 2) * 0.075 * window * a;
        const point = row.start.clone().lerp(row.end, q).addScaledVector(normal, wave);
        p2.setXYZ(i, point.x, point.y, point.z + 0.018);
      }
      p2.needsUpdate = true;
      row.line.material.opacity = 0.62 * a;
    }
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.group.traverse((o) => {
      const n = o;
      n.geometry?.dispose();
      if (n.material) (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) => m.dispose());
    });
    this.group.clear();
  }
};

// src/WorldV10.ts
var v = (x = 0, y = 0, z = 0) => new T8.Vector3(x, y, z);
var HERO = v(0, 4, 0);
var EYE = v(0, 1.55, 7);
var SPRAY_EYE = v(-2.1, 1.55, 5);
var SPRAY_AXIS = v(0.24, -0.17, -0.955).normalize();
var deg = T8.MathUtils.degToRad;
var INK = "#203d45";
var mix = (a, b, t) => a + (b - a) * t;
var fract2 = (x) => x - Math.floor(x);
var hash01 = (index, salt) => {
  let x = Math.imul(index + 1, 2654435761) ^ salt;
  x = Math.imul(x ^ x >>> 16, 2246822507);
  x = Math.imul(x ^ x >>> 13, 3266489909);
  return ((x ^ x >>> 16) >>> 0) / 4294967296;
};
var envelope = (frame, start, end, enter = 60, leave = 90) => ease3((frame - start) / Math.max(1, enter)) * (1 - ease3((frame - (end - leave)) / Math.max(1, leave)));
function sceneP(id, frame) {
  const s = timeline.scenes.find((s2) => s2.id === id);
  return s ? clamp3((frame - s.start) / Math.max(1, s.end - s.start)) : 0;
}
function clipP(id, frame) {
  const c = timeline.clips.find((c2) => c2.id === id);
  return c ? clamp3((frame - c.start) / Math.max(1, c.end - c.start)) : 0;
}
function mat(c, opacity = 1, roughness = 0.5) {
  return new T8.MeshStandardMaterial({ color: c, roughness, metalness: 0.04, transparent: opacity < 1, opacity, depthWrite: opacity > 0.8 });
}
function flat(c, a = 1) {
  return new T8.MeshBasicMaterial({ color: c, transparent: true, opacity: a, depthWrite: false, toneMapped: false });
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
  const o = new T8.Mesh(new T8.SphereGeometry(r, 36, 24), m);
  o.position.copy(p2);
  return o;
}
function rod(a, b, r, m) {
  const d = b.clone().sub(a);
  const o = new T8.Mesh(new T8.CylinderGeometry(r, r, d.length(), 12), m);
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
  const g = new T8.Group();
  for (let i = 0; i < points.length - 1; i++) g.add(rod(points[i], points[i + 1], width, flat(color, a)));
  return g;
}
function dashed(a, b, color, width = 0.012, opacity = 0.5, steps = 14) {
  const group = new T8.Group();
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
  group = new T8.Group();
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
      m.material.opacity = opacity * ease3(q2 / 0.035);
      m.visible = q2 > 1e-5;
    });
    const q = fract2(frame * 0.017 / n) * n, k = Math.min(n - 1, Math.floor(q));
    this.photon.position.copy(this.points[k]).lerp(this.points[k + 1], q - k);
    const photonMaterial = this.photon.material;
    photonMaterial.color.copy(this.meshes[k].material.color);
    photonMaterial.opacity = opacity * ease3(q / 0.12) * ease3((n - q) / 0.12) * ease3((progress * n - q) / 0.16);
    this.photon.visible = photonMaterial.opacity > 1e-5;
  }
};
var WorldV10 = class {
  spectrumDetail;
  group = new T8.Group();
  environment;
  cinema;
  energy;
  macroLook;
  fountain;
  nature = new T8.Group();
  micro = new T8.Group();
  outdoor = new T8.Group();
  ringRig = new T8.Group();
  coneRig = new T8.Group();
  observer = new T8.Group();
  sun = new T8.Group();
  spray = new T8.Group();
  coda = new T8.Group();
  glass = new T8.Group();
  friend = new T8.Group();
  friendRay;
  drop;
  rim;
  primary = [];
  secondary = [];
  fan = [];
  rays = new T8.Group();
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
  nearFar = new T8.Group();
  nearDrop;
  farDrop;
  distanceRay;
  glassRay;
  glassRayGuide;
  glassVirtual = new T8.Group();
  sprayRainbow;
  sprayLight;
  sprayObserver = new T8.Group();
  spraySunCue = new T8.Group();
  axisSunCue = new T8.Group();
  mainSunRay;
  anchor;
  primaryAngles = SPECTRUM.map((s) => findPrimaryExtremum(s.refractiveIndex, 300));
  secondaryAngles = SPECTRUM.map((s) => findSecondaryExtremum(s.refractiveIndex, 300));
  dummy = new T8.Object3D();
  eye = EYE.clone();
  axisDir = v(0, -Math.sin(deg(12)), -Math.cos(deg(12)));
  baseAxis = this.axisDir.clone();
  constructor(renderer, scene) {
    this.group.name = "rainbow-cinematic-world-v09";
    scene.add(this.group);
    if (renderer) {
      this.cinema = new EnvironmentV09(renderer, scene);
      this.environment = this.cinema.environment;
    } else {
      this.environment = new T8.WebGLRenderTarget(1, 1);
      scene.background = new T8.Color("#e9f0ec");
    }
    this.group.add(this.nature, this.micro, this.outdoor, this.spray, this.coda);
    this.micro.position.copy(HERO);
    this.waterMaterial = new T8.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.85 } }, vertexShader: `varying vec3 p;uniform float uTime;void main(){p=position;vec3 q=position;float r=length(q.xy);q.z+=.013*sin(q.x*5.+q.y*2.2-uTime*1.6)+.007*sin(q.x*9.-q.y*6.+uTime*2.1)+.004*sin(r*14.-uTime*2.4)*exp(-r);gl_Position=projectionMatrix*modelViewMatrix*vec4(q,1.);}`, fragmentShader: `varying vec3 p;uniform float uTime;uniform float uOpacity;void main(){float r=length(p.xy);if(r>1.5)discard;float crossing=sin(p.x*5.+p.y*2.2-uTime*1.6)+.45*sin(p.x*9.-p.y*6.+uTime*2.1);float ripple=.12*sin((r+.04*sin(p.x*3.))*14.-uTime*2.4)*exp(-r);float shimmer=clamp(.5+.16*crossing+ripple,0.,1.);float a=1.-smoothstep(1.34,1.5,r);vec3 c=mix(vec3(.38,.60,.62),vec3(.72,.87,.85),.10+.20*pow(shimmer,4.));gl_FragColor=vec4(c,uOpacity*a);}`, side: T8.DoubleSide });
    this.water = new T8.Mesh(new T8.PlaneGeometry(3, 3, 64, 64), this.waterMaterial);
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.set(-3, 0.025, 3);
    this.nature.add(this.water);
    const stone = new T8.Mesh(new T8.TorusGeometry(1.52, 0.075, 24, 192), mat("#c0cec5"));
    stone.rotation.x = Math.PI / 2;
    stone.position.copy(this.water.position);
    stone.geometry.dispose();
    stone.material.dispose();
    const physical = new T8.MeshPhysicalMaterial({ color: "#f6fcff", roughness: 9e-3, transmission: 0.985, envMapIntensity: 1.35, thickness: 3.1, ior: 1.333, clearcoat: 1, transparent: true, opacity: 0.94, depthWrite: false });
    this.drop = new T8.Mesh(new T8.SphereGeometry(1.6, 96, 64), physical);
    this.micro.add(this.drop);
    const cupPoints = [new T8.Vector2(0.76, -1.2), new T8.Vector2(0.82, -1.15), new T8.Vector2(0.83, 1.2), new T8.Vector2(0.8, 1.23), new T8.Vector2(0.77, 1.19), new T8.Vector2(0.75, -1.05), new T8.Vector2(0.76, -1.2)];
    const cup = new T8.Mesh(new T8.LatheGeometry(cupPoints, 80), new T8.MeshPhysicalMaterial({ color: "#f4fbf8", transmission: 0.98, roughness: 0.012, thickness: 0.055, ior: 1.5, transparent: true, opacity: 0.3, depthWrite: false, side: T8.DoubleSide }));
    this.glass.add(cup);
    const cupWater = new T8.Mesh(new T8.CylinderGeometry(0.76, 0.75, 1.72, 80), new T8.MeshPhysicalMaterial({ color: "#d6eeeb", transmission: 0.98, roughness: 0.014, thickness: 1.5, ior: 1.333, transparent: true, opacity: 0.26, depthWrite: false }));
    cupWater.position.y = -0.18;
    this.glass.add(cupWater);
    const stickBottom = v(-0.22, -1.05, 0.07), stickTop = v(0.49, 2, 0.07), waterTop = 0.68, stickSurface = stickBottom.clone().lerp(stickTop, (waterTop - stickBottom.y) / (stickTop.y - stickBottom.y));
    const waterline = new T8.Mesh(new T8.TorusGeometry(0.758, 95e-4, 8, 100), flat("#65b1b7", 0.49));
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
    const pupil = sphere(eye, 0.063, flat(INK, 0.82)), eyeOutline = new T8.Mesh(new T8.TorusGeometry(0.115, 0.01, 8, 40), flat("#496d73", 0.7));
    eyeOutline.position.copy(eye);
    eyeOutline.scale.y = 0.6;
    this.glassVirtual.add(pupil, eyeOutline);
    const incoming = pathA[1].clone().sub(source2).normalize(), outgoingCup = eye.clone().sub(pathA[1]).normalize(), computedCup = refractBoundary(incoming, v(0, 1, 0), 1.333, AIR.refractiveIndex);
    this.glass.userData.refraction = { model: "horizontal water-air surface; thin glass shell omitted from explanatory rays", realPoint: source2.toArray(), surfacePoint: pathA[1].toArray(), eye: eye.toArray(), virtualPoint: virtual.toArray(), directionResidual: computedCup.distanceTo(outgoingCup) };
    this.glass.position.set(9, 4, 0);
    this.group.add(this.glass);
    this.rim = new T8.Mesh(new T8.SphereGeometry(1.61, 72, 48), new T8.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uAlpha: { value: 0.7 } }, vertexShader: `varying vec3 N;varying vec3 V;void main(){vec4 p=modelViewMatrix*vec4(position,1.);N=normalize(normalMatrix*normal);V=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`, fragmentShader: `varying vec3 N;varying vec3 V;uniform float uAlpha;void main(){float f=pow(clamp(1.-abs(dot(normalize(N),normalize(V))),0.,1.),3.);float l=pow(max(0.,dot(normalize(N),normalize(vec3(-.5,.8,1.)))),30.);gl_FragColor=vec4(mix(vec3(.16,.52,.60),vec3(.95,.99,1.),l),f*.32*uAlpha+l*.30*uAlpha);}` }));
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
        const colour = new T8.Color(SPECTRUM[i].color);
        colours.push(...colour.toArray(), ...colour.toArray());
        if (i < 6) {
          const n = i * 2;
          indices.push(n, n + 1, n + 2, n + 2, n + 1, n + 3);
        }
      });
      const geometry = new T8.BufferGeometry();
      geometry.setAttribute("position", new T8.Float32BufferAttribute(positions, 3));
      geometry.setAttribute("color", new T8.Float32BufferAttribute(colours, 3));
      geometry.setIndex(indices);
      const ribbon = new T8.Mesh(geometry, new T8.MeshBasicMaterial({ vertexColors: true, side: T8.DoubleSide, transparent: true, opacity: 0.78, depthWrite: false, toneMapped: false }));
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
    this.angle = new T8.Group();
    this.angle.name = "rainbow-angle-on-actual-exit-side";
    this.angle.userData = { angleDegrees: T8.MathUtils.radToDeg(angle), backward: backward.toArray(), outgoing: outgoing.toArray() };
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
    this.cone = new T8.Mesh(new T8.ConeGeometry(rad, height, 128, 32, true), new T8.ShaderMaterial({ side: T8.DoubleSide, transparent: true, depthWrite: false, uniforms: { uTime: { value: 0 }, uAlpha: { value: 0 } }, vertexShader: `varying vec2 vUv;varying vec3 vN;varying vec3 vV;void main(){vUv=uv;vec4 p=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-p.xyz);gl_Position=projectionMatrix*p;}`, fragmentShader: `varying vec2 vUv;varying vec3 vN;varying vec3 vV;uniform float uTime;uniform float uAlpha;void main(){float fres=pow(clamp(1.-abs(dot(normalize(vN),normalize(vV))),0.,1.),2.5);float seam=pow(.5+.5*cos(vUv.x*6.28318*12.),35.);float front=exp(-pow(abs((fract(vUv.y+uTime*.10)-.48)/.06),2.));float a=(.025+.09*fres+.026*seam+.026*front)*uAlpha;gl_FragColor=vec4(mix(vec3(.24,.57,.61),vec3(.82,.95,.93),front*.4),a);}` }));
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
    this.axisSunCue.add(this.mainSunRay.group);
    const incomingTip = new T8.Mesh(new T8.ConeGeometry(0.09, 0.26, 14), flat("#cda45c", 0.78));
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
    this.rain = new T8.InstancedMesh(new T8.SphereGeometry(1, 8, 6), new T8.MeshPhysicalMaterial({ color: "#d9ebf2", roughness: 0.08, transmission: 0.63, ior: 1.333, transparent: true, opacity: 0.34, depthWrite: false, envMapIntensity: 0.7 }), 1600);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    this.mist = new T8.InstancedMesh(new T8.SphereGeometry(1, 12, 8), flat("#d9f1f4", 0.34), 640);
    this.mist.frustumCulled = false;
    this.spray.add(this.mist);
    const nozzle = rod(v(-3, 0.1, 3), v(-3, 0.9, 3), 0.055, mat("#809d98"));
    nozzle.geometry.dispose();
    nozzle.material.dispose();
    const localPositions = [], localColors = [], localUv = [], localIndices = [], localN = 64, localBands = 24;
    for (let i = 0; i <= localBands; i++) {
      const s = i / localBands * 6, k = Math.min(5, Math.floor(s)), f2 = s - k, theta2 = deg(mix(this.primaryAngles[k].rainbowAngleDeg, this.primaryAngles[k + 1].rainbowAngleDeg, f2)), c = new T8.Color(SPECTRUM[k].color).lerp(new T8.Color(SPECTRUM[k + 1].color), f2);
      for (let j = 0; j <= localN; j++) {
        const t = j / localN, p3 = this.sprayRingPoint(theta2, mix(2.41, 2.76, t), 3.15);
        localPositions.push(...p3.toArray());
        localColors.push(c.r, c.g, c.b);
        localUv.push(i / localBands, t);
      }
    }
    for (let i = 0; i < localBands; i++) for (let j = 0; j < localN; j++) {
      const a = i * (localN + 1) + j, b = a + localN + 1;
      localIndices.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const localGeometry = new T8.BufferGeometry();
    localGeometry.setAttribute("position", new T8.Float32BufferAttribute(localPositions, 3));
    localGeometry.setAttribute("color", new T8.Float32BufferAttribute(localColors, 3));
    localGeometry.setAttribute("uv", new T8.Float32BufferAttribute(localUv, 2));
    localGeometry.setIndex(localIndices);
    this.sprayRainbow = new T8.Mesh(localGeometry, atmosphericRainbowMaterial(false));
    this.sprayRainbow.name = "local-fountain-rainbow-on-real-view-cone";
    this.sprayRainbow.userData = { observer: SPRAY_EYE.toArray(), axis: SPRAY_AXIS.toArray(), distance: 3.15, phi: [2.41, 2.76], angles: this.primaryAngles.map((a) => a.rainbowAngleDeg) };
    attachAtmosphericRainbowVolume(this.sprayRainbow, SPRAY_EYE, "patch");
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
    const localSun = SPRAY_EYE.clone().addScaledVector(SPRAY_AXIS, -2.1);
    this.spraySunCue.name = "solar-direction-symbol-behind-fountain-observer";
    const sunIcon = new T8.Group();
    sunIcon.position.copy(localSun);
    sunIcon.add(new T8.Mesh(new T8.TorusGeometry(0.1, 8e-3, 8, 40), flat("#cda45c", 0.88)));
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      sunIcon.add(rod(v(Math.cos(a) * 0.145, Math.sin(a) * 0.145, 0), v(Math.cos(a) * 0.205, Math.sin(a) * 0.205, 0), 7e-3, flat("#cda45c", 0.75)));
    }
    this.spraySunCue.add(sunIcon);
    this.spray.add(this.spraySunCue);
    this.energy = new OpticalEnergyV09([...this.primary.map((r) => ({ points: r.points, color: r.meshes[1].material.color.getStyle(), role: "primary" })), ...this.secondary.map((r) => ({ points: r.points, color: r.meshes[1].material.color.getStyle(), role: "secondary" }))]);
    this.micro.add(this.energy.group);
    this.macroLook = new MacroLookV09(this.drop, this.rim, [...this.primary.map((r) => ({ points: r.points, color: r.meshes[1].material.color.getStyle(), role: "primary" })), ...this.secondary.map((r) => ({ points: r.points, color: r.meshes[1].material.color.getStyle(), role: "secondary" }))]);
    this.micro.add(this.macroLook.group);
    this.fountain = new FountainDetailV09();
    this.spray.add(this.fountain.group);
    this.spectrumDetail = new SpectrumDetailV10(this.primary);
    this.micro.add(this.spectrumDetail.group);
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
    const pos = [], col = [], uv = [], idx = [];
    const bands = 72, N = 384;
    for (let i = 0; i <= bands; i++) {
      const q = i / bands * 6, k = Math.min(5, Math.floor(q)), f2 = q - k, angle = mix(angles[k], angles[k + 1], f2), colour = new T8.Color(SPECTRUM[k].color).lerp(new T8.Color(SPECTRUM[k + 1].color), f2);
      for (let j = 0; j <= N; j++) {
        const p2 = this.ringPoint(angle, j / N * Math.PI * 2);
        pos.push(...p2.toArray());
        col.push(colour.r, colour.g, colour.b);
        uv.push(i / bands, j / N);
      }
    }
    for (let i = 0; i < bands; i++) for (let j = 0; j < N; j++) {
      const a = i * (N + 1) + j, b = a + N + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new T8.BufferGeometry();
    g.setAttribute("position", new T8.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new T8.Float32BufferAttribute(col, 3));
    g.setAttribute("uv", new T8.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    const m = atmosphericRainbowMaterial(secondary), mesh = new T8.Mesh(g, m);
    attachAtmosphericRainbowVolume(mesh, EYE, "sky");
    return mesh;
  }
  makeBand() {
    const pos = [], idx = [], N = 256;
    for (let i = 0; i < 2; i++) for (let j = 0; j <= N; j++) pos.push(...this.ringPoint(deg(i ? this.secondaryAngles[0].rainbowAngleDeg : this.primaryAngles[0].rainbowAngleDeg), j / N * 2 * Math.PI).toArray());
    for (let j = 0; j < N; j++) idx.push(j, j + N + 1, j + 1, j + 1, j + N + 1, j + N + 2);
    const g = new T8.BufferGeometry();
    g.setAttribute("position", new T8.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return new T8.Mesh(g, flat("#596c7d", 0.22));
  }
  update(s) {
    const frame = s.frame, sp = (id) => sceneP(id, frame);
    const start = (id) => timeline.scenes.find((s2) => s2.id === id)?.start ?? 0, end = (id) => timeline.scenes.find((s2) => s2.id === id)?.end ?? frame;
    const axisNarrative = timeline.clips.find((c) => c.id === "r019"), radialNarrative = timeline.clips.find((c) => c.id === "r020");
    const microIn = ease3((frame - start("drop") + 45) / 100), microOut = 1 - ease3((frame - (axisNarrative?.start ?? start("cone") - 10)) / 150), microLevel = microIn * microOut;
    const sec = timeline.clips.find((c) => c.id === "r034"), secEnd = timeline.clips.find((c) => c.id === "r035");
    const subMicro = s.scene === "secondary" ? ease3((frame - (sec?.start ?? start("secondary"))) / 85) * (1 - ease3((frame - (secEnd?.start ?? start("secondary") + 300)) / 95)) : 0;
    const microVis = Math.max(microLevel, subMicro);
    alpha(this.micro, microVis);
    this.micro.visible = microVis > 3e-3;
    alpha(this.nature, 1 - microVis * 0.94);
    this.cinema?.update(frame, microVis);
    const glassClip = timeline.clips.find((c) => c.id === "r007");
    const glassIn = glassClip ? ease3((frame - glassClip.start + 30) / 70) : 0, glassOut = glassClip ? 1 - ease3((frame - glassClip.end + 10) / 65) : 0, glassA = glassIn * glassOut * (s.scene === "drop" ? 1 : 0);
    this.glass.position.x = 4.3 + 4.7 * (1 - glassA);
    alpha(this.glass, glassA);
    this.glass.visible = glassA > 2e-3;
    const cupOptics = ease3((clipP("r007", frame) - 0.1) / 0.28);
    this.glassRay.update(cupOptics, glassA * 0.82, frame);
    this.glassRayGuide.update(cupOptics, glassA * 0.26, frame + 9);
    alpha(this.glassVirtual, glassA * ease3((clipP("r007", frame) - 0.26) / 0.24));
    const heroLevel = microLevel * (1 - glassA * 0.93);
    const macroLevel = 1 - microVis, macroExit = 1 - ease3((frame - start("return") + 45) / 140);
    alpha(this.primaryRing, macroLevel * macroExit);
    alpha(this.observer, macroLevel * macroExit);
    alpha(this.sun, macroLevel * 0.92 * macroExit);
    const rise = timeline.clips.find((c) => c.id === "r027"), fall = timeline.clips.find((c) => c.id === "r028");
    const lift = rise?.scene === "circle" && fall?.scene === "circle" ? 18 * ease3((frame - rise.start) / Math.max(24, Math.min(rise.duration, 160))) * (1 - ease3((frame - (fall.end - 120)) / Math.max(120, end("circle") + 55 - (fall.end - 120)))) : s.scene === "circle" ? 18 * ease3((sp("circle") - 0.32) / 0.23) * (1 - ease3((sp("circle") - 0.65) / 0.3)) : 0;
    const sunClip = timeline.clips.find((c) => c.id === "r026"), sunRiseCaption = timeline.captions.find((c) => c.text.includes("\u592A\u9633\u5347\u9AD8")), shortArcCaption = timeline.captions.find((c) => c.text.includes("\u9732\u51FA\u7684\u5F27\u5C31\u77ED\u4E86"));
    const sunRiseStart = sunRiseCaption ? sunRiseCaption.start + (sunRiseCaption.end - sunRiseCaption.start) * sunRiseCaption.text.indexOf("\u592A\u9633\u5347\u9AD8") / sunRiseCaption.text.length : (sunClip?.start ?? start("circle")) + (sunClip?.duration ?? 250) * 0.6, highSun = shortArcCaption?.start ?? (sunClip?.end ?? start("circle") + 250) - 10;
    const solar = 12 + 20 * ease3((frame - sunRiseStart) / Math.max(24, highSun - sunRiseStart)) * (1 - ease3((frame - (rise?.start ?? end("circle"))) / 75));
    this.axisDir.set(0, -Math.sin(deg(solar)), -Math.cos(deg(solar)));
    const q = new T8.Quaternion().setFromUnitVectors(this.baseAxis, this.axisDir);
    const walk = timeline.clips.find((c) => c.id === "r002");
    const introZ = -1.6 * ease3((frame - walk.start) / (walk.duration * 0.72)) * (1 - ease3((frame - start("drop") + 20) / 100));
    const shift = 2.8 * ease3((frame - start("observer")) / Math.max(90, (end("observer") - start("observer")) * 0.38)) * (1 - ease3((frame - (end("observer") - 45)) / 135));
    this.eye.copy(EYE).add(v(shift, lift, introZ));
    this.observer.position.set(shift, lift, 7 + introZ);
    const pivot = EYE.clone().sub(EYE.clone().applyQuaternion(q)).add(v(shift, lift, introZ));
    this.ringRig.position.copy(pivot);
    this.coneRig.position.copy(pivot);
    this.ringRig.quaternion.copy(q);
    this.coneRig.quaternion.copy(q);
    this.sun.position.copy(this.eye).addScaledVector(this.axisDir, -72);
    this.cinema?.setSolarDirection(this.axisDir.clone().negate());
    const coneWindow = envelope(frame, (axisNarrative?.start ?? start("cone")) - 15, end("observer") + 100, 100, 150), coneAlpha = coneWindow * (0.95 - 0.55 * ease3((frame - end("cone") + 45) / 120)) * macroLevel;
    alpha(this.coneRig, coneAlpha);
    this.cone.material.uniforms.uTime.value = frame / 30;
    this.cone.material.uniforms.uAlpha.value = coneAlpha;
    const radialReveal = ease3((frame - (radialNarrative?.start ?? start("cone")) + 15) / 90);
    for (const child of this.coneRig.children) if (child !== this.axis) alpha(child, coneAlpha * radialReveal);
    const incomingSun = envelope(frame, (axisNarrative?.start ?? start("cone")) - 15, end("cone") + 30, 85, 120) * macroLevel;
    this.axisSunCue.position.copy(pivot);
    this.axisSunCue.quaternion.copy(q);
    alpha(this.axisSunCue, incomingSun);
    this.mainSunRay.update(1, incomingSun * 0.72, frame);
    const secondaryAlpha = ease3((frame - start("secondary")) / 90) * (1 - 0.5 * ease3((frame - start("return")) / 100)) * (1 - ease3((frame - end("return") + 45) / 130));
    alpha(this.secondaryRing, secondaryAlpha * macroLevel * macroExit);
    const darkClip = timeline.clips.find((c) => c.id === "r037"), darkAlpha = envelope(frame, darkClip?.start ?? end("secondary") - 180, start("return") + 120, 75, 135);
    alpha(this.darkBand, darkAlpha * macroLevel);
    updateAtmosphericRainbow(this.primaryRing, frame);
    updateAtmosphericRainbow(this.secondaryRing, frame);
    let reveal = 0.25 + sp("drop") * 0.24;
    if (frame >= start("dispersion")) reveal = 0.5;
    if (frame >= start("reflection")) reveal = 0.5 + ease3(clipP("r013", frame) * 1.5) * 0.25 + ease3(clipP("r014", frame) * 1.3) * 0.25;
    if (frame >= start("angle")) reveal = 1;
    const colourLevel = ease3((frame - start("dispersion")) / 45), white = new T8.Color("#fff3d8");
    this.primary.forEach((r, i) => {
      r.meshes.forEach((m, k) => m.material.color.copy(white).lerp(new T8.Color(SPECTRUM[i].color), k === 0 ? 0 : colourLevel));
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
      ribbon.material.opacity = 0.55 * colourLevel * heroLevel * ease3(portion / 0.035);
      ribbon.visible = false;
    });
    this.secondary.forEach((r, i) => {
      r.meshes.forEach((m, k) => m.material.color.copy(k === 0 ? white : new T8.Color(SPECTRUM[i].color)));
      r.update(ease3(clipP("r034", frame) * 1.6), subMicro * (i === 0 ? 0.94 : 0.55), frame);
      if (i > 0) {
        r.meshes[0].visible = false;
        if (fract2(frame * 0.017 / r.meshes.length) * r.meshes.length < 1) r.photon.visible = false;
      }
    });
    this.energy.update(frame, reveal, heroLevel, ease3(clipP("r034", frame) * 1.6), subMicro, colourLevel);
    this.primary.forEach((r) => r.group.visible = false);
    this.secondary.forEach((r) => r.group.visible = false);
    const split = timeline.clips.find((c) => c.id === "r013"), splitEnd = timeline.clips.find((c) => c.id === "r016");
    const transmissionLevel = envelope(frame, split?.start ?? start("reflection"), (splitEnd?.start ?? end("reflection") - 90) + 90, 50, 100) * microLevel;
    this.transmitted.update(ease3(clipP("r013", frame) * 1.5), transmissionLevel * 0.76, frame);
    this.drop.material.opacity = 0.94 * microVis * (1 - transmissionLevel * 0.18) * (1 - glassA * 0.86);
    this.rim.material.uniforms.uAlpha.value = 0.7 * microVis * (1 - glassA * 0.86);
    this.drop.material.envMapIntensity = 1.35 - 0.87 * envelope(frame, start("dispersion"), end("reflection") + 75, 90, 110);
    const fanLevel = s.scene === "angle" ? ease3(sp("angle") * 7) * (1 - ease3((sp("angle") - 0.55) * 5)) * 0.32 : 0;
    const scan = clipP("r017", frame);
    this.fan.forEach((r, i) => {
      const reveal2 = ease3((scan * 1.7 - i / this.fan.length) / 0.3);
      r.update(reveal2, fanLevel * (0.24 + 0.6 * Math.exp(-(((i / this.fan.length - scan) / 0.14) ** 2))), frame + i * 5);
    });
    alpha(this.angle, ease3((frame - (timeline.clips.find((c) => c.id === "r018")?.start ?? start("angle")) + 18) / 55) * (1 - ease3((frame - end("angle") + 40) / 110)) * microLevel);
    const rainAlpha = this.rain.material;
    rainAlpha.opacity = 0.27 * (1 - microVis) * macroExit;
    const selection = Math.max(envelope(frame, start("cone"), end("cone") + 90, 90, 125), envelope(frame, start("observer"), end("observer") + 90, 90, 140));
    for (let i = 0; i < 1600; i++) {
      const x = i * 173 % 1601 / 1601 * 40 - 20, y = 20 - fract2(i * 83 % 1597 / 1597 + frame / 30 * 0.087) * 20, z = -4 - i * 127 % 1591 / 1591 * 29;
      const p2 = v(x, y, z), theta = T8.MathUtils.radToDeg(p2.clone().sub(this.eye).angleTo(this.axisDir)), selected = selection * Math.exp(-(((theta - 41.4) / 0.9) ** 2)), base = 0.033 + i % 4 * 0.01;
      this.dummy.position.copy(p2);
      this.dummy.scale.set(mix(base, 0.09, selected), mix(base, 0.09, selected) * 1.12, mix(base, 0.09, selected));
      this.dummy.updateMatrix();
      this.rain.setMatrixAt(i, this.dummy.matrix);
      this.rain.setColorAt(i, new T8.Color("#a9c7cf").lerp(new T8.Color("#ea925e"), selected));
    }
    this.rain.instanceMatrix.needsUpdate = true;
    if (this.rain.instanceColor) this.rain.instanceColor.needsUpdate = true;
    const phi = Math.PI / 2 + Math.sin(ease3(sp("cone")) * Math.PI) * 1.1 + Math.sin(ease3(sp("observer")) * Math.PI) * 0.65, to = this.ringPoint(deg(this.primaryAngles[0].rainbowAngleDeg), phi).sub(EYE).applyQuaternion(q).add(this.eye), direction = to.clone().sub(this.eye).normalize();
    moveRod(this.eyeRay, this.eye, to);
    alpha(this.eyeRay, selection * 0.88 * macroLevel);
    const nearClip = timeline.clips.find((c) => c.id === "r023"), nearAlpha = envelope(frame, nearClip?.start ?? start("cone") + 180, (nearClip?.end ?? end("cone")) + 100, 65, 100) * macroLevel;
    this.nearDrop.position.copy(this.eye).addScaledVector(direction, 8);
    this.farDrop.position.copy(this.eye).addScaledVector(direction, 24);
    moveRod(this.distanceRay, this.eye, this.farDrop.position);
    alpha(this.nearFar, nearAlpha);
    this.nearFar.visible = nearAlpha > 1e-5;
    const friendClip = timeline.clips.find((c) => c.id === "r031"), friendEntry = (friendClip?.start ?? start("observer") + 120) - 180;
    const friendPre = friendEntry - 240, friendQ = clamp3((frame - friendEntry) / 210), friendMicro = timeline.clips.find((c) => c.id === "r034");
    const friendVisible = frame >= friendPre && frame < (friendMicro?.start ?? end("observer") + 230) + 70;
    this.friend.position.set(shift - 6.8 + 5 * ease3(friendQ) - 18 * (1 - ease3((frame - friendPre) / 240)), lift, 7);
    alpha(this.friend, 1);
    this.friend.visible = friendVisible;
    const friendEye = this.friend.position.clone().add(v(0, 1.55, 0)), friendOffset = friendEye.clone().sub(this.eye);
    const friendRayA = ease3((frame - (friendClip?.start ?? friendEntry + 180) + 18) / 50) * macroLevel;
    alpha(this.friendRay, friendRayA);
    this.friendRay.visible = friendVisible && friendRayA > 1e-5;
    moveRod(this.friendRay, friendEye, to.clone().add(friendOffset));
    const sprayAlpha = Math.max(0.16 * envelope(frame, start("street") - 60, start("drop") + 70, 60, 110), envelope(frame, start("return"), end("return") + 80, 85, 110));
    alpha(this.spray, sprayAlpha);
    this.waterMaterial.uniforms.uTime.value = frame / 30;
    this.waterMaterial.uniforms.uOpacity.value = 0.78 * (1 - microVis * 0.9);
    const localRainbow = envelope(frame, start("return") + 30, end("return") + 45, 90, 115), localObserverClip = timeline.clips.find((c) => c.id === "r039"), localObserverAlpha = envelope(frame, (localObserverClip?.start ?? start("return") + 200) - 45, end("return") + 30, 75, 100) * sprayAlpha;
    alpha(this.sprayRainbow, localRainbow * sprayAlpha);
    updateAtmosphericRainbow(this.sprayRainbow, frame);
    this.sprayLight.update(ease3((frame - (localObserverClip?.start ?? start("return") + 200)) / 75), localRainbow * localObserverAlpha * 0.47, frame);
    const coda = timeline.scenes.find((x) => x.id === "references");
    const actorRetire = coda.start + Math.ceil((coda.end - coda.start) / 7.2) + 2;
    alpha(this.sprayObserver, 1);
    this.sprayObserver.visible = frame >= start("return") + 50 && frame < actorRetire;
    const closingClip = timeline.clips.find((x) => x.id === "r041");
    alpha(this.spraySunCue, localObserverAlpha);
    this.spraySunCue.visible = frame < (closingClip?.start ?? end("return")) + 50;
    const mistBase = new T8.Color("#d1eeeb"), mistColor = new T8.Color();
    for (let i = 0; i < 640; i++) {
      const life = fract2(frame / 30 * (0.3 + hash01(i, 2447445413) * 0.12) + hash01(i, 569420461)), t = life * 2.2, a = hash01(i, 1831565813) * Math.PI * 2, d = 0.2 + Math.sqrt(hash01(i, 1540483477)) * 0.74, drift = Math.sin(frame / 30 * 0.58 + hash01(i, 374761393) * Math.PI * 2) * 0.055 * t * t;
      this.dummy.position.set(-3 + Math.cos(a) * d * t + drift, 0.9 + 3 * t - 1.3 * t * t, 3 - Math.sin(a) * d * t - t * 0.45);
      const lifeAlpha = ease3(life / 0.1) * ease3((1 - life) / 0.15);
      this.dummy.scale.setScalar((0.01 + hash01(i, 2135587861) * 0.015) * lifeAlpha);
      this.dummy.updateMatrix();
      this.mist.setMatrixAt(i, this.dummy.matrix);
      const theta = T8.MathUtils.radToDeg(this.dummy.position.clone().sub(SPRAY_EYE).angleTo(SPRAY_AXIS)), red = this.primaryAngles[0].rainbowAngleDeg, violet = this.primaryAngles[6].rainbowAngleDeg, q2 = clamp3((red - theta) / (red - violet)) * 6, k = Math.min(5, Math.floor(q2)), color = new T8.Color(SPECTRUM[k].color).lerp(new T8.Color(SPECTRUM[k + 1].color), q2 - k), selected = ease3((theta - violet + 0.13) / 0.26) * (1 - ease3((theta - red + 0.13) / 0.26)) * localRainbow;
      mistColor.copy(mistBase).lerp(color, selected * 0.92);
      this.mist.setColorAt(i, mistColor);
    }
    this.mist.instanceMatrix.needsUpdate = true;
    if (this.mist.instanceColor) this.mist.instanceColor.needsUpdate = true;
    this.anchor = void 0;
    this.spectrumDetail.update(frame);
    if (s.scene === "drop") this.anchor = glassA > 0.6 ? { text: "\u5149\u5728\u6C34\u91CC\u8F6C\u5F2F", point: v(4.3, 4.6, 0), side: "right" } : { text: "\u5149\u8FDB\u6C34\u6EF4", point: HERO.clone().add(this.primaryAngles[0].path.entrance.clone().multiplyScalar(1.6)), side: "left" };
    if (s.scene === "dispersion") this.anchor = { text: s.clip?.id === "r043" ? "\u8FDE\u7EED\u5149\u8C31" : s.clip?.id === "r042" ? "\u76F8\u5BF9\u6CE2\u957F" : "\u989C\u8272\u5206\u5F00", point: s.clip?.id === "r043" ? HERO.clone().add(v(0.15, 0.3, 0.8)) : HERO.clone().add(this.primary[3].points[1].clone().lerp(this.primary[3].points[2], 0.72)), side: "right" };
    if (s.scene === "reflection") this.anchor = { text: "\u56DE\u5934\u4E00\u6B21", point: HERO.clone().add(this.primaryAngles[0].path.firstHit.clone().multiplyScalar(1.6)), side: "right" };
    if (s.scene === "reflection" && s.clip?.id === "r044") this.anchor = { text: "\u51FA\u53E3\u65B9\u5411\u9519\u5F00", point: HERO.clone().add(this.primary[3].points[3].clone().lerp(this.primary[3].points[4], 0.38)), side: "right" };
    if (s.scene === "angle" && frame >= (timeline.clips.find((c) => c.id === "r018")?.start ?? start("angle")) - 10) this.anchor = { text: "\u7EA642\xB0", point: HERO.clone().add(this.primaryAngles[0].path.exit.clone().multiplyScalar(1.6)), side: "right", color: "#c55d4a" };
    if (s.scene === "angle" && frame >= (axisNarrative?.start ?? start("cone")) + 45) this.anchor = { text: "\u80CC\u5BF9\u592A\u9633\u7684\u65B9\u5411", point: this.eye.clone().addScaledVector(this.axisDir, 3), side: "right" };
    if (s.scene === "cone") this.anchor = nearAlpha > 0.45 ? { text: "\u540C\u4E00\u4E2A\u65B9\u5411", point: this.nearDrop.position.clone().lerp(this.farDrop.position, 0.4), side: "right" } : { text: "\u773C\u775B\u662F\u5706\u9525\u7684\u9876\u70B9", point: this.eye.clone(), side: "left" };
    if (s.scene === "circle") this.anchor = { text: lift > 16.2 ? "\u5B8C\u6574\u7684\u5706" : "\u5730\u9762\u906E\u4F4F\u4E86\u4E0B\u534A\u5708", point: v(0, lift + 1, -8), side: "left" };
    if (s.scene === "observer") this.anchor = { text: "\u6C34\u6EF4\u6362\u4E00\u6279", point: this.eye.clone(), side: "right" };
    if (s.scene === "secondary") this.anchor = { text: subMicro > 0.3 ? "\u591A\u4E00\u6B21\u53CD\u5C04" : clipP("r037", frame) > 0 ? "\u4E24\u9053\u8679\u4E4B\u95F4\u7684\u6697\u5E26" : "\u7EA651\xB0", point: subMicro > 0.3 ? HERO.clone().add(this.secondaryAngles[0].path.secondHit.clone().multiplyScalar(1.6)) : this.ringPoint(deg(48), Math.PI / 2), side: "right", color: "#7968a8" };
    if (s.scene === "return") this.anchor = { text: "\u80CC\u5BF9\u592A\u9633\uFF0C\u770B\u5411\u6C34\u96FE", point: v(-3, 2, 3), side: "left" };
    this.mist.visible = false;
    this.fountain.update(frame, sprayAlpha, localRainbow);
    this.macroLook.update(frame, reveal, heroLevel, ease3(clipP("r034", frame) * 1.6), subMicro, colourLevel, void 0, 1 - ease3((frame - start("drop") - 105) / 100));
    this.group.updateMatrixWorld(true);
  }
  dispose() {
    this.spectrumDetail.dispose();
    this.group.traverse((o) => {
      const m = o;
      m.geometry?.dispose();
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((m2) => m2.dispose());
    });
    this.energy.dispose();
    this.macroLook.dispose();
    this.fountain.dispose();
    if (this.cinema) this.cinema.dispose();
    else this.environment.dispose();
  }
};

// src/CameraPathV06.ts
import * as T9 from "three";
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
  if (new T9.Vector3(...position).distanceToSquared(new T9.Vector3(...target)) < 1e-10) target = [position[0], position[1], position[2] - 1];
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
    const position = new T9.Vector3(...p2.position), target = new T9.Vector3(...p2.target);
    const matrix = new T9.Matrix4().lookAt(position, target, new T9.Vector3(0, 1, 0));
    const quaternion = new T9.Quaternion().setFromRotationMatrix(matrix).normalize();
    const scene = scenes.find((s) => frame >= s.start && frame < s.end) ?? (frame < scenes[0].start ? scenes[0] : scenes.at(-1));
    return { ...p2, frame, seconds: frame / fps, scene: scene.id, sceneProgress: clamp5((frame - scene.start) / (scene.end - scene.start)), quaternion };
  };
}
var defaultSampler = createCameraSamplerV06();

// src/CinematicRouteV10.ts
var p = (position, target, fov = 45) => ({ position, target, fov });
var hero = [0, 4, 0];
var posesV10 = {
  street: { start: p([-0.8, 2.45, 16.8], [0, 5, -8], 52), end: p([3.6, 3.5, 13.3], [0, 4.8, -6], 50) },
  drop: { start: p([1.8, 4.9, 7.55], [0, 4.05, 0], 45), end: p([0.4, 4.7, 7.15], [0, 4.05, 0], 45) },
  dispersion: { start: p([0.4, 4.7, 7.15], [0, 4.05, 0], 45), end: p([-0.8, 4.8, 7.5], [-0.1, 4, 0], 45) },
  reflection: { start: p([-0.8, 4.8, 7.5], hero, 45), end: p([-1.8, 5.2, 9.8], [-0.3, 3.05, 0], 50) },
  angle: { start: p([-1.8, 5.2, 9.8], [-0.3, 3.05, 0], 50), end: p([15.5, 8.9, 23.8], [0, 3.2, -3], 48) },
  cone: { start: p([15.5, 8.9, 23.8], [0, 3.2, -3], 48), end: p([-8, 6.8, 26.8], [0, 3.3, -3], 48) },
  circle: { start: p([-8, 6.8, 26.8], [0, 4, -6], 52), end: p([2.8, 5.6, 27.3], [0, 4, -6], 52) },
  observer: { start: p([3.3, 6.1, 27], [0.3, 3.3, -3], 49), end: p([10.4, 6.6, 25.8], [2.3, 3.3, -3], 49) },
  secondary: { start: p([1.4, 5, 8.2], hero, 45), end: p([1.8, 5.3, 27.3], [0, 5, -8], 51) },
  return: { start: p([-8, 4.5, 12.4], [-3, 2.05, 3], 49), end: p([-4.8, 3.15, 10.4], [-3, 1.25, 3], 47) },
  references: { start: p([-4.8, 3.15, 10.4], [-3, 1.25, 3], 47), end: p([-4.35, 3.05, 10.05], [-3, 1.25, 3], 47) }
};
function buildFilmCameraKeys() {
  const keys = [];
  const clip = (id) => timeline.clips.find((c) => c.id === id);
  const key = (f2, pose2) => keys.push({ ...pose2, frame: f2 });
  timeline.scenes.forEach((s, i) => {
    const duration = s.end - s.start, track = posesV10[s.id] ?? posesV10.street;
    const bridge = i === 0 ? 0 : Math.min(100, duration * 0.15);
    const tail = i === timeline.scenes.length - 1 ? 0 : Math.min(100, duration * 0.15);
    if (s.id === "street") {
      key(0, p([5.7, 2.55, 12.3], [0, 2.2, 4.2], 51));
      key(255, p([4.5, 2.55, 12], [0, 2.15, 3.8], 48));
      key(525, p([3.8, 3.4, 14.5], [0, 1.9, -3.2], 51));
      key(790, p([2.4, 3.9, 13], [0, 2.4, -3], 50));
      key(s.end - tail, p([1.8, 4.9, 7.55], [0, 4.05, 0], 45));
    } else if (s.id === "drop") {
      const cup = clip("r007");
      key(s.start + bridge, track.start);
      if (cup && cup.start > s.start && cup.end < s.end) {
        key(cup.start - 12, p([1.25, 4.9, 7.15], [0, 4.05, 0], 45));
        key(cup.start + 60, p([4.9, 4.8, 6.2], [4.3, 4.15, 0], 46));
        key(cup.end - 55, p([4.55, 4.7, 6.4], [4.3, 4.15, 0], 46));
        key(cup.end + 50, track.end);
      }
      key(s.end - tail, track.end);
    } else if (s.id === "dispersion") {
      const near = clip("r010"), hold = clip("r011"), wavelength = clip("r042"), continuum = clip("r043");
      key(s.start + bridge, track.start);
      if (near && hold) {
        key(near.start + Math.min(110, near.duration * 0.55), p([0.7, 4.92, 2.45], [0.7, 4.88, 0], 43));
        key(hold.end - 80, p([1.03, 4.72, 2.4], [0.88, 4.7, 0], 43));
      }
      if (wavelength) {
        key(wavelength.start + 55, p([0.66, 4.66, 2.1], [0.6, 4.6, 0], 43));
        key(wavelength.end - 35, p([0.4, 4.47, 2.1], [0.49, 4.47, 0], 43));
      }
      if (continuum) {
        key(continuum.start + 60, p([0.24, 4.46, 2.68], [0.35, 4.43, 0], 43));
        key(continuum.end - 35, p([-0.13, 4.42, 3.1], [0.2, 4.4, 0], 44));
      }
      if (!continuum) key(s.end - tail, track.end);
    } else if (s.id === "reflection") {
      const a = clip("r013"), b = clip("r014");
      key(s.start + bridge, track.start);
      if (a && b) {
        key(a.start + a.duration * 0.65, p([1.05, 5, 6.3], [0.5, 4.15, 0], 49));
        key(b.start + b.duration * 0.65, p([-0.8, 4.7, 8.6], [-0.35, 2.95, 0], 50));
      }
      key(s.end - tail, track.end);
    } else if (s.id === "angle") {
      const angle = clip("r018"), eye = clip("r019"), axis = clip("r020");
      key(s.start + bridge, track.start);
      if (angle && eye && axis) {
        key(angle.end - 35, p([-1.55, 5.3, 9.3], [0, 3.6, 0], 49));
        key(eye.start + 48, p([4.8, 4.3, 10.8], [0, 2.8, 5.7], 49));
        key(eye.end - 35, p([3.5, 2.2, 5.5], [0, 1.25, 7], 49));
        key(eye.end + 65, p([7.5, 3.3, 8], [0, 2.2, 5], 49));
        key(axis.end - 35, track.end);
      } else key(s.end - tail, track.end);
    } else if (s.id === "cone") {
      const ring = clip("r022"), near = clip("r023");
      key(s.start + bridge, track.start);
      if (ring) key(ring.end - 25, p([6.4, 8.2, 26.5], [0, 3.3, -3], 48));
      if (near) key(near.end - 25, p([-1.4, 7.6, 27.8], [0, 3.3, -3], 48));
      key(s.end - tail, track.end);
    } else if (s.id === "circle") {
      const rise = clip("r027"), hold = clip("r028");
      const up = rise?.start ?? s.start + duration * 0.32, down = hold?.end ?? s.start + duration * 0.94;
      key(s.start + bridge, track.start);
      key(Math.max(s.start + bridge + 1, up - 20), p([-0.3, 5.55, 27.3], [0, 4, -6], 52));
      key(up + Math.min(rise?.duration ?? duration * 0.23, 160), p([0.8, 24.7, 31.3], [0, 17, -7], 54));
      key(Math.max(up + 180, down - 120), p([2, 25, 31.1], [0, 17, -7], 54));
      key(s.end + 55, track.end);
    } else if (s.id === "observer") {
      key(s.start + bridge + 140, p([6.5, 3.8, 14.7], [0.3, 2.1, 4.8], 48));
      const movement = clip("r030");
      if (movement) key(movement.end - 45, p([8.1, 4, 17.3], [2, 2.4, 1], 49));
      const friend = clip("r031");
      if (friend) key(friend.start + friend.duration * 0.55, p([7.8, 4, 18.5], [1.5, 3, -3], 48));
      key(s.end - tail, track.end);
    } else if (s.id === "secondary") {
      const a = clip("r034"), b = clip("r035");
      key(s.start + Math.min(bridge, duration * 0.04), p([13.1, 7.4, 25.8], [0, 4, -5], 50));
      key((a?.start ?? s.start + duration * 0.2) + 60, track.start);
      key((b?.start ?? s.start + duration * 0.4) - 20, p([-0.5, 4.8, 8.8], hero, 45));
      key((b?.start ?? s.start + duration * 0.4) + Math.min(180, (b?.duration ?? 210) * 0.8), track.end);
      key(s.end - tail, p([-2.6, 5.6, 28.2], [0, 5, -8], 51));
    } else if (s.id === "return") {
      key(s.start + bridge, track.start);
      const experiment = clip("r039");
      if (experiment) {
        key(experiment.start - 40, p([-6.6, 3.45, 9.5], [-3, 1.04, 3], 44));
        key(experiment.end - 40, p([-5.65, 3.15, 9.1], [-3, 0.97, 3], 43));
      }
      key(s.end - tail, track.end);
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
  WorldV10,
  buildFilmCameraKeys,
  clamp3 as clamp,
  clipP,
  ease3 as ease,
  filmCameraKeys,
  posesV10,
  sampleFilmCamera,
  sceneP,
  stateAt,
  timeline
};
