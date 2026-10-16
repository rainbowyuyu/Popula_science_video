// src/World.ts
import * as T6 from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// src/visual.ts
import * as T from "three";
var C = { paper: "#f3f1ec", ink: "#18303b", teal: "#27869a", gold: "#bd965a", red: "#ce654a", muted: "#52656e" };
var V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
var clamp = (v) => Math.max(0, Math.min(1, v));
var smooth = (v) => {
  const t = clamp(v);
  return t * t * t * (t * (t * 6 - 15) + 10);
};
var mix = (a, b, t) => a + (b - a) * t;
var stateAt = (frame, tl) => {
  const s = tl.sections.find((s2) => frame >= s2.start && frame < s2.end) ?? (frame < tl.sections[0].start ? tl.sections[0] : tl.sections.at(-1));
  const clip = tl.clips.filter((s2) => frame >= s2.start).at(-1) ?? tl.clips[0];
  return { frame, time: frame / tl.fps, section: s.id, p: clamp((frame - s.start) / (s.end - s.start)), clip, n: Number(clip.id.slice(1)), u: clamp((frame - clip.start) / (clip.end - clip.start)) };
};
var ramp = (a, b, v) => smooth((v - a) / (b - a));
var pulse = (a, b, c, d, v) => ramp(a, b, v) * (1 - ramp(c, d, v));
function channel(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) return mix(keys[i - 1][1], keys[i][1], smooth((t - keys[i - 1][0]) / (keys[i][0] - keys[i - 1][0])));
  return keys.at(-1)[1];
}

// src/CameraPath.ts
var columns = ["x", "y", "z", "r", "az", "el", "shift"];
function flowingCurve(times, values) {
  const slopes = values.slice(1).map((v, i) => (v - values[i]) / (times[i + 1] - times[i]));
  const derivatives = values.map((_, i) => {
    if (i === 0) return slopes[0];
    if (i === values.length - 1) return slopes.at(-1);
    const a = slopes[i - 1], b = slopes[i];
    if (a * b <= 0) return 0;
    const ha = times[i] - times[i - 1], hb = times[i + 1] - times[i];
    return 3 * (ha + hb) / ((2 * hb + ha) / a + (hb + 2 * ha) / b);
  });
  return (t) => {
    if (t <= times[0]) return values[0];
    if (t >= times.at(-1)) return values.at(-1);
    const i = times.findIndex((x, j) => j > 0 && t <= x) - 1, h = times[i + 1] - times[i];
    const s = clamp((t - times[i]) / h), d = values[i + 1] - values[i], v0 = derivatives[i] * h, v1 = derivatives[i + 1] * h;
    const a3 = 10 * d - 6 * v0 - 4 * v1, a4 = -15 * d + 8 * v0 + 7 * v1, a5 = 6 * d - 3 * v0 - 3 * v1;
    return values[i] + v0 * s + a3 * s ** 3 + a4 * s ** 4 + a5 * s ** 5;
  };
}
var CameraPath = class {
  constructor(tl) {
    this.tl = tl;
    this.rebuild();
  }
  tl;
  keys = [];
  curves = {};
  anchors = {};
  timeAt(u) {
    const n = Math.floor(u), clip = this.tl.clips.find((c) => Number(c.id.slice(1)) === n);
    if (!clip) return u < 1 ? 0 : this.tl.duration / this.tl.fps;
    return mix(clip.start, clip.end, u - n) / this.tl.fps;
  }
  setAnchors(anchors) {
    this.anchors = anchors;
    this.rebuild();
  }
  rebuild() {
    const tmdY = (this.anchors.TMD?.[1] ?? 583.5) * 0.01;
    const poses = [
      { u: 0, y: 3.05, r: 13.2, az: 0.3, el: -0.075, shift: -190 },
      { u: 1.15, y: 3.16, r: 13.6, az: 0.51, el: 0.035 },
      { u: 2, y: 3.38, r: 17.6, az: 0.87, el: 0.2 },
      { u: 3, y: 3.4, r: 16.8, az: 1.17, el: 0.26 },
      { u: 4, y: 2.9, r: 14.2, az: 1.36, el: 0.17 },
      { u: 5, y: -0.18, r: 3.7, az: 1.42, el: 0.2 },
      { u: 6.1, y: -0.46, r: 2.7, az: 1.57, el: 0.08, shift: -235 },
      { u: 7.2, y: -0.57, r: 2.4, az: 1.77, el: 0.08, x: 0.125, z: 0.25 },
      { u: 8.25, y: -0.28, r: 2.3, az: 1.98, el: 0.28 },
      { u: 9.1, y: -0.06, r: 3.2, az: 2.12, el: 0.26 },
      { u: 10.25, y: 1.2, r: 3.1, az: 2.29, el: 0.18 },
      { u: 11.15, y: 1.4, r: 1.55, az: 2.47, el: 0.36, focus: "coreInterior" },
      { u: 12.15, y: 1.7, r: 2.25, az: 2.61, el: 0.22, focus: "coreInterior" },
      { u: 13.3, y: 3, r: 11.7, az: 2.75, el: 0.025 },
      { u: 14.3, y: 2.32, r: 2.9, az: 2.93, el: 0.3, focus: "floorLoad" },
      { u: 15.1, y: 2.3, r: 1.85, az: 3.1, el: 0.34, focus: "outriggerColumn" },
      { u: 16.05, y: 2.37, r: 1.5, az: 3.27, el: 0.53, focus: "floorLoad", shift: -60 },
      { u: 16.78, y: 2.1, r: 2.45, az: 3.36, el: 0.28, focus: "columnBelow" },
      { u: 17.45, y: 2.31, r: 1.55, az: 3.47, el: 0.22, focus: "outriggerMid" },
      { u: 18.3, y: 2.31, r: 1.1, az: 3.6, el: 0.34, focus: "outriggerMid" },
      { u: 19.12, y: 2.31, r: 1.28, az: 3.73, el: 0.27, focus: "outriggerCore" },
      { u: 20.1, y: 2.31, r: 1.72, az: 3.88, el: 0.3, focus: "outriggerMid" },
      { u: 21.1, y: 2.32, r: 1.9, az: 4.02, el: 0.53, focus: "beltMid" },
      { u: 22.05, y: 2.62, r: 3.7, az: 4.13, el: 0.59, shift: -190 },
      { u: 23.25, y: 2.6, r: 2.8, az: 4.28, el: 0.58 },
      { u: 24.2, y: 2.58, r: 2.35, az: 4.43, el: 0.4 },
      { u: 25.3, y: 2.65, r: 2.65, az: 4.58, el: 0.32 },
      { u: 26.3, y: 2.68, r: 3.5, az: 4.73, el: 0.28 },
      { u: 27.3, y: 3.13, r: 14.2, az: 4.89, el: 0.12 },
      { u: 28.7, y: 3.15, r: 13.3, az: 5.03, el: -0.025 },
      { u: 29.6, y: 3.23, r: 13, az: 5.16, el: 0.22, shift: -110 },
      { u: 30.4, y: 3.3, r: 13.4, az: 5.31, el: 0.28 },
      { u: 31.5, y: 3.2, r: 13.3, az: 5.48, el: 0.32 },
      { u: 32.2, y: 2.65, r: 7.4, az: 5.6, el: 0.1 },
      { u: 33.1, y: 2.3, r: 3.25, az: 5.71, el: 0.08 },
      { u: 33.8, y: 4.4, r: 8.8, az: 5.8, el: 0.16 },
      { u: 34.8, y: tmdY + 0.065, r: 2.1, az: 5.94, el: 0.23, shift: -190 },
      { u: 35.5, y: tmdY + 0.06, r: 1.16, az: 6.1, el: 0.29 },
      { u: 36.2, y: tmdY + 0.042, r: 0.86, az: 6.32, el: 0.25, shift: -75 },
      { u: 37.3, y: tmdY - 0.015, r: 0.73, az: 6.6, el: 0.17 },
      { u: 38.2, y: tmdY + 0.07, r: 1.8, az: 6.78, el: 0.28 },
      { u: 39.1, y: 3.15, r: 14.8, az: 6.96, el: 0.13 },
      { u: 40.05, y: 0.7, r: 3.9, az: 7.1, el: 0.22 },
      { u: 41.1, y: 2, r: 3.6, az: 7.26, el: 0.35 },
      { u: 42.3, y: 3.65, r: 4.4, az: 7.43, el: 0.34 },
      { u: 43.3, y: 5.03, r: 5.5, az: 7.61, el: 0.25 },
      { u: 44.3, y: 3.14, r: 13.8, az: 7.78, el: 0.065 },
      { u: 45.5, y: 3.12, r: 13.2, az: 8.02, el: -0.035, shift: -190 },
      { u: 46.7, y: 3.1, r: 13.5, az: 8.27, el: -0.065 },
      { u: 47.8, y: 3.1, r: 14.1, az: 8.49, el: -0.025 },
      { u: 49, y: 3.1, r: 15.2, az: 8.76, el: 0.075 }
    ];
    let shift = -190;
    this.keys = poses.map((p) => {
      if (p.shift !== void 0) shift = p.shift;
      const anchor = p.focus ? this.anchors[p.focus] : void 0;
      return { t: this.timeAt(p.u), x: anchor ? anchor[0] * 0.01 : p.x ?? 0, y: anchor ? anchor[1] * 0.01 : p.y, z: anchor ? anchor[2] * 0.01 : p.z ?? 0, r: p.r, az: p.az, el: p.el, shift, focus: p.focus };
    });
    const times = this.keys.map((k) => k.t);
    for (const col of columns) this.curves[col] = flowingCurve(times, this.keys.map((k) => k[col]));
  }
  at(t) {
    const c = this.curves, plan = pulse(this.timeAt(10.1), this.timeAt(10.82), this.timeAt(11.92), this.timeAt(12.58), t);
    const r = mix(c.r(t), 0.97, plan), az = c.az(t), el = mix(c.el(t), 1.12, plan);
    const target = V(c.x(t), mix(c.y(t), 1.67, plan), c.z(t));
    const position = target.clone().add(V(Math.cos(az) * Math.cos(el) * r, Math.sin(el) * r, Math.sin(az) * Math.cos(el) * r));
    return { position, target, shift: c.shift(t) };
  }
  apply(camera, t) {
    const p = this.at(t);
    camera.position.copy(p.position);
    camera.lookAt(p.target);
    camera.setViewOffset(1920, 1080, p.shift, 0, 1920, 1080);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
  }
};

// src/CinematicEnvironment.ts
import * as T2 from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
var CinematicEnvironment = class {
  constructor(scene, renderer, base = "") {
    this.scene = scene;
    this.renderer = renderer;
    this.root.name = "CinematicEnvironment";
    this.priorBackground = scene.background;
    this.priorEnvironment = scene.environment;
    this.priorFog = scene.fog;
    this.priorEnvironmentIntensity = scene.environmentIntensity;
    this.priorEnvironmentRotation = scene.environmentRotation.clone();
    scene.background = null;
    scene.fog = new T2.Fog("#dce6e8", 21, 72);
    renderer.outputColorSpace = T2.SRGBColorSpace;
    renderer.toneMapping = T2.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.96;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T2.PCFSoftShadowMap;
    const sunElevation = Math.PI * (0.5 - 119.5 / 512);
    const sunDirection = new T2.Vector3().setFromSphericalCoords(1, Math.PI / 2 - sunElevation, T2.MathUtils.degToRad(-52));
    const hdriSunLongitude = (609.5 / 1024 - 0.5) * Math.PI * 2;
    const environmentYaw = hdriSunLongitude - Math.atan2(sunDirection.z, sunDirection.x);
    this.sky.name = "PhysicalDaylightSky";
    this.sky.scale.setScalar(180);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1e3;
    const uniforms = this.sky.material.uniforms;
    uniforms.turbidity.value = 1.9;
    uniforms.rayleigh.value = 2.4;
    uniforms.mieCoefficient.value = 2e-3;
    uniforms.mieDirectionalG.value = 0.78;
    uniforms.sunPosition.value.copy(sunDirection);
    this.sky.material.fragmentShader = this.sky.material.fragmentShader.replace(
      "vec4( retColor, 1.0 )",
      "vec4( retColor * vec3( 0.82, 0.96, 1.12 ), 1.0 )"
    );
    this.clouds = this.makeClouds();
    const groundMaterial = new T2.MeshStandardMaterial({ color: "#d6d9d4", roughness: 0.96, metalness: 0, transparent: true, depthWrite: false });
    groundMaterial.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <opaque_fragment>",
        "#include <opaque_fragment>\n gl_FragColor.a *= 1.0 - smoothstep(32.0, 67.0, length(vViewPosition));"
      );
    };
    groundMaterial.customProgramCacheKey = () => "architectural-ground-haze-v3";
    this.ground = new T2.Mesh(new T2.PlaneGeometry(320, 320), groundMaterial);
    this.ground.name = "QuietArchitecturalGround";
    this.ground.renderOrder = -800;
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.y = -1.35;
    this.ground.receiveShadow = true;
    this.root.add(this.sky, this.clouds, this.ground, this.sun, this.sun.target, this.hemisphere, this.fill);
    this.sun.position.copy(sunDirection).multiplyScalar(19).add(new T2.Vector3(0, 2.8, 0));
    this.sun.target.position.set(0, 2.8, 0);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -5.4, right: 5.4, top: 6.2, bottom: -6.2, near: 0.1, far: 38 });
    this.sun.shadow.bias = -8e-5;
    this.sun.shadow.normalBias = 3e-3;
    this.sun.shadow.radius = 3;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.fill.position.set(7, 8, -9);
    this.ready = new HDRLoader().loadAsync(base + "environment/kloofendal_48d_partly_cloudy_puresky_1k.hdr").then((texture) => {
      if (this.disposed) {
        texture.dispose();
        return;
      }
      texture.mapping = T2.EquirectangularReflectionMapping;
      const pmrem = new T2.PMREMGenerator(renderer);
      this.environment = pmrem.fromEquirectangular(texture);
      pmrem.dispose();
      texture.dispose();
      scene.environment = this.environment.texture;
      scene.environmentIntensity = 0.7;
      scene.environmentRotation.set(0, environmentYaw, 0);
    });
    scene.add(this.root);
  }
  scene;
  renderer;
  root = new T2.Group();
  sky = new Sky();
  sun = new T2.DirectionalLight("#fff0d7", 2.85);
  hemisphere = new T2.HemisphereLight("#e4f1ff", "#a9a39b", 0.3);
  fill = new T2.DirectionalLight("#d6eaff", 0.15);
  ready;
  environment;
  ground;
  clouds;
  priorBackground;
  priorEnvironment;
  priorFog;
  priorEnvironmentIntensity;
  priorEnvironmentRotation;
  disposed = false;
  makeClouds() {
    const material = new T2.ShaderMaterial({
      uniforms: { filmTime: { value: 0 }, cloudOpacity: { value: 0.76 } },
      side: T2.BackSide,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      vertexShader: `
    varying vec3 skyDirection;
    void main(){
     skyDirection=position;
     gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);
     gl_Position.z=gl_Position.w*.999999;
    }`,
      fragmentShader: `
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
    }`
    });
    const mesh = new T2.Mesh(new T2.SphereGeometry(82, 32, 16), material);
    mesh.name = "ThinDeterministicCloudLayer";
    mesh.frustumCulled = false;
    mesh.renderOrder = -900;
    return mesh;
  }
  update(state, camera) {
    this.sky.position.copy(camera.position);
    this.clouds.position.copy(camera.position);
    this.clouds.material.uniforms.filmTime.value = state.time;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.scene.remove(this.root);
    if (this.environment && this.scene.environment === this.environment.texture) {
      this.scene.environment = this.priorEnvironment;
      this.scene.environmentIntensity = this.priorEnvironmentIntensity;
      this.scene.environmentRotation.copy(this.priorEnvironmentRotation);
    }
    this.scene.background = this.priorBackground;
    this.scene.fog = this.priorFog;
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.clouds.geometry.dispose();
    this.clouds.material.dispose();
    this.ground.geometry.dispose();
    this.ground.material.dispose();
    this.sun.shadow.map?.dispose();
    this.environment?.dispose();
    this.root.clear();
  }
};

// src/WindVisualization.ts
import * as T3 from "three";
import { Line2 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
var POINTS = 161;
var TAIL = 36;
var TRAVEL = 9.6;
var INK = new T3.Color("#147f99");
var AMBER = new T3.Color("#b17833");
var WindVisualization = class {
  constructor(scene, physics) {
    this.scene = scene;
    this.physics = physics;
    this.root.name = "analytical-wind-illustration";
    scene.add(this.root);
    const d = physics.data.dynamic;
    this.times = [0, ...d.time];
    this.factor = [0, ...d.appliedForceFactors ?? d.time.map(() => 1)];
    this.integral = [0];
    for (let i = 1; i < this.times.length; i++) this.integral.push(this.integral[i - 1] + (this.times[i] - this.times[i - 1]) * (Math.sqrt(Math.abs(this.factor[i - 1])) + Math.sqrt(Math.abs(this.factor[i]))) * 0.5);
    const heights = [0.58, 1.69, 2.82, 4.03, 5.24], offsets = [-0.93, -0.17, 0.17, 0.93];
    for (let row = 0; row < heights.length; row++) for (let lane = 0; lane < offsets.length; lane++) {
      const height = heights[row], offset = offsets[lane], near = Math.abs(offset) < 0.3;
      const color = (near && row === 2 && lane === 2 ? AMBER : INK).clone();
      const radius = 0.78 - 0.255 * height / 6.32, points = [], lengths = [0];
      for (let k = 0; k < POINTS; k++) {
        const x = -TRAVEL / 2 + k / (POINTS - 1) * TRAVEL;
        let lo = Math.abs(offset), hi = 3;
        for (let n = 0; n < 25; n++) {
          const z = (lo + hi) * 0.5, psi = z * (1 - radius * radius / (x * x + z * z));
          if (psi < Math.abs(offset)) lo = z;
          else hi = z;
        }
        points.push(V(x, height, Math.sign(offset) * (lo + hi) * 0.5));
        if (k) lengths.push(lengths[k - 1] + points[k].distanceTo(points[k - 1]));
      }
      const gm = new LineMaterial({ color: color.getHex(), linewidth: near ? 2 : 1.1, transparent: true, opacity: near ? 0.34 : 0.12, depthWrite: false, worldUnits: false });
      gm.toneMapped = false;
      gm.resolution.set(1920, 1080);
      const guide = new Line2(new LineGeometry().setPositions(points.flatMap((p) => p.toArray())), gm);
      guide.geometry.getAttribute("instanceStart").data.setUsage(T3.DynamicDrawUsage);
      guide.frustumCulled = false;
      this.root.add(guide);
      const positions = new Float32Array(TAIL * 2 * 3), colors = new Float32Array(TAIL * 2 * 4), indices = [];
      for (let k = 0; k < TAIL - 1; k++) {
        const n = k * 2;
        indices.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
      }
      const geometry = new T3.BufferGeometry();
      geometry.setAttribute("position", new T3.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new T3.BufferAttribute(colors, 4));
      geometry.setIndex(indices);
      const material = new T3.MeshBasicMaterial({ color: "#ffffff", vertexColors: true, side: T3.DoubleSide, transparent: true, depthWrite: false, toneMapped: false });
      const ribbon = new T3.Mesh(geometry, material);
      ribbon.frustumCulled = false;
      this.root.add(ribbon);
      const head = new T3.Mesh(new T3.SphereGeometry(1, 12, 8), new T3.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false, toneMapped: false }));
      head.frustumCulled = false;
      this.root.add(head);
      this.streams.push({ height, offset, phase: (row * 0.183 + lane * 0.257) % 1, width: near ? 6.4 : 4.1, color, basePoints: points.map((p) => p.clone()), points, lengths, length: lengths.at(-1), guide, ribbon, positions, colors, head });
    }
  }
  scene;
  physics;
  root = new T3.Group();
  streams = [];
  integral = [];
  times = [];
  factor = [];
  pathAt(stream, distance) {
    const d = clamp(distance / stream.length) * stream.length;
    let lo = 0, hi = stream.lengths.length - 1;
    while (hi - lo > 1) {
      const k = lo + hi >> 1;
      if (stream.lengths[k] < d) lo = k;
      else hi = k;
    }
    return stream.points[lo].clone().lerp(stream.points[hi], clamp((d - stream.lengths[lo]) / (stream.lengths[hi] - stream.lengths[lo])));
  }
  travelAt(time) {
    let i = 0;
    while (i < this.times.length - 2 && this.times[i + 1] < time) i++;
    const t = clamp((time - this.times[i]) / (this.times[i + 1] - this.times[i]));
    return mix(this.integral[i], this.integral[i + 1], t);
  }
  updateWake(stream, time, u) {
    const separate = ramp(31, 31.85, u), heightPhase = separate * (stream.height - 0.58) * 1.12;
    const near = Math.abs(stream.offset) < 0.3, amplitude = near ? 0.255 : 0.052;
    stream.lengths[0] = 0;
    for (let k = 0; k < stream.points.length; k++) {
      const rest = stream.basePoints[k], p = stream.points[k];
      p.copy(rest);
      const envelope = ramp(0.82, 1.48, rest.x) * (1 - 0.32 * ramp(3.2, 4.8, rest.x));
      const phase = (rest.x - 0.82) * 3.65 - time * 1.16 - heightPhase;
      const turn = Math.sin(phase) + Math.sign(stream.offset) * 0.13 * Math.sin(phase * 2);
      p.z += envelope * amplitude * turn;
      p.y += envelope * (near ? 0.055 : 9e-3) * Math.cos(phase);
      if (k) stream.lengths[k] = stream.lengths[k - 1] + p.distanceTo(stream.points[k - 1]);
    }
    stream.length = stream.lengths.at(-1);
    const start = stream.guide.geometry.getAttribute("instanceStart"), end = stream.guide.geometry.getAttribute("instanceEnd");
    for (let k = 0; k < stream.points.length - 1; k++) {
      const a = stream.points[k], b = stream.points[k + 1];
      start.setXYZ(k, a.x, a.y, a.z);
      end.setXYZ(k, b.x, b.y, b.z);
    }
    start.data.needsUpdate = true;
  }
  update(state, camera) {
    const u = state.n + state.u, weight = pulse(28.85, 29.6, 34.05, 35.15, u);
    this.root.visible = weight > 1e-5;
    if (!this.root.visible) return;
    this.root.position.x = -14 * (1 - ramp(28.85, 29.6, u)) + 14 * ramp(34.05, 35.15, u);
    const time = this.physics.physicalTime(state), travel = this.travelAt(time) * 0.091;
    const focus = 1 - 0.62 * pulse(31.45, 31.95, 33.55, 34.15, u);
    const worldPerPixel = (p) => 2 * Math.tan(T3.MathUtils.degToRad(camera.fov) / 2) * camera.position.distanceTo(p) / 1080;
    for (const stream of this.streams) {
      this.updateWake(stream, time, u);
      const displacement = this.physics.displacementAt(V(0, stream.height, 0));
      stream.guide.position.copy(displacement);
      stream.guide.material.opacity = (Math.abs(stream.offset) < 0.3 ? 0.34 : 0.12) * focus;
      const phase = (travel + stream.phase) % 1, tailLength = Math.abs(stream.offset) < 0.3 ? 1.52 : 1.1;
      const leading = phase * (stream.length + tailLength);
      const visibility = ramp(0, 0.16, leading) * (1 - ramp(stream.length, stream.length + tailLength, leading));
      for (let k = 0; k < TAIL; k++) {
        const t = k / (TAIL - 1), distance = leading - tailLength * (1 - t), p = this.pathAt(stream, distance).add(displacement);
        const tangent = this.pathAt(stream, Math.min(stream.length, distance + 0.015)).sub(this.pathAt(stream, Math.max(0, distance - 0.015))).normalize();
        const view = camera.position.clone().sub(p).normalize(), side = new T3.Vector3().crossVectors(tangent, view).normalize();
        const half = worldPerPixel(p) * stream.width * 0.5 * Math.pow(t, 0.58) * focus;
        const alpha = visibility * (distance > 0 && distance < stream.length ? 1 : 0) * Math.pow(t, 0.7) * 0.9;
        for (let e = 0; e < 2; e++) {
          const v = p.clone().addScaledVector(side, (e ? 1 : -1) * half), vi = (k * 2 + e) * 3, ci = (k * 2 + e) * 4;
          stream.positions[vi] = v.x;
          stream.positions[vi + 1] = v.y;
          stream.positions[vi + 2] = v.z;
          stream.colors[ci] = stream.color.r;
          stream.colors[ci + 1] = stream.color.g;
          stream.colors[ci + 2] = stream.color.b;
          stream.colors[ci + 3] = alpha;
        }
      }
      stream.ribbon.geometry.getAttribute("position").needsUpdate = true;
      stream.ribbon.geometry.getAttribute("color").needsUpdate = true;
      const tip = this.pathAt(stream, leading).add(displacement);
      stream.head.position.copy(tip);
      stream.head.scale.setScalar(worldPerPixel(tip) * stream.width * 0.52 * focus);
      stream.head.visible = leading > 0 && leading < stream.length;
      stream.head.material.opacity = visibility * 0.96;
    }
  }
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof T3.Mesh) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.streams.length = 0;
  }
};

// src/PhysicsPlayback.ts
import * as T4 from "three";
var WIND_MAGNIFICATION = 48;
var STRESS_COLOR_POWER = 0.45;
var CORE_STRESS_COLOR_POWER = 0.45;
var cool = new T4.Color("#087d9b");
var zero = new T4.Color("#c6ccce");
var warm = new T4.Color("#dd4e2b");
var white = new T4.Color("#ffffff");
var tmpColor = new T4.Color();
var bendLow = new T4.Color("#dae2df");
var bendHigh = new T4.Color("#df7949");
var PhysicsPlayback = class {
  constructor(data, timeline) {
    this.data = data;
    this.timeline = timeline;
    if (data.schema !== "rainbow.shanghai-physics/1" || data.units.length !== "m" || data.units.stress !== "MPa") throw new Error("Unsupported solver output units/schema");
    const nodeMap = new Map(data.nodes.map((n, i) => [n.id, i]));
    this.axes = data.members.map((m, index) => {
      const i = nodeMap.get(m.nodeIds[0]), j = nodeMap.get(m.nodeIds[1]);
      if (i === void 0 || j === void 0) throw new Error("Missing solver node");
      const a = V(...data.nodes[i].xyz), b = V(...data.nodes[j].xyz), delta = b.clone().sub(a);
      return { index, i, j, a, b, delta, l2: delta.lengthSq() };
    });
    for (const axis of this.axes) {
      const m = data.members[axis.index];
      for (const id of m.meshIds) {
        const list = this.byMesh.get(id) ?? [];
        list.push(axis);
        this.byMesh.set(id, list);
      }
      if (/core/i.test(m.role)) this.coreAxes.push(axis);
    }
    if (!this.coreAxes.length) throw new Error("Solver has no core backbone for facade compatibility");
    const g = data.static.gravity, w = data.static.windOnly ?? data.static.windPlusGravity;
    if (!g || !w) throw new Error("Solver missing gravity/wind cases");
    const gStress = g.memberAxialMPa ?? g.axialMPa;
    if (!gStress) throw new Error("Gravity result missing axial stress array");
    this.gravity = { u: g.u, r: g.r, stress: gStress };
    this.gravityLimit = Math.max(0.01, ...gStress.map((v) => Math.abs(v)));
    this.currentU = new Float32Array(data.nodes.length * 3);
    this.currentR = new Float32Array(data.nodes.length * 3);
    this.currentStress = new Float32Array(data.members.length);
    this.currentBending = new Float32Array(data.members.length);
    const wStress = w.memberAxialMPa ?? w.axialMPa;
    if (!wStress) throw new Error("Wind result missing axial stress array");
    this.wind = { u: w.u.map((v, i) => v.map((x, k) => x - (data.static.windOnly ? 0 : g.u[i][k]))), r: w.r?.map((v, i) => v.map((x, k) => x - (data.static.windOnly ? 0 : g.r?.[i]?.[k] ?? 0))), stress: wStress.map((x, i) => x - (data.static.windOnly ? 0 : gStress[i])) };
    data.dynamic.nodeIds.forEach((id, i) => this.dynamicNodeIndex.set(id, i));
    data.dynamic.memberIds.forEach((id, i) => this.dynamicMemberIndex.set(id, i));
    for (let f = 0; f < data.dynamic.time.length; f++) {
      this.dynamicU.push(data.nodes.map((n) => data.dynamic.u[f][this.dynamicNodeIndex.get(n.id)] ?? [0, 0, 0]));
      this.dynamicR.push(data.nodes.map((n) => data.dynamic.r?.[f]?.[this.dynamicNodeIndex.get(n.id)] ?? [0, 0, 0]));
      this.dynamicStress.push(data.members.map((m) => data.dynamic.axialMPa[f][this.dynamicMemberIndex.get(m.id)] ?? 0));
    }
    const stresses = this.dynamicStress.flat().map(Math.abs).filter(Number.isFinite).sort((a, b) => a - b);
    this.stressLimit = 6;
  }
  data;
  timeline;
  axes = [];
  byMesh = /* @__PURE__ */ new Map();
  coreAxes = [];
  bindings = /* @__PURE__ */ new WeakMap();
  dynamicNodeIndex = /* @__PURE__ */ new Map();
  dynamicMemberIndex = /* @__PURE__ */ new Map();
  dynamicU = [];
  dynamicR = [];
  dynamicStress = [];
  gravity;
  wind;
  stressLimit = 1;
  gravityLimit = 1;
  play;
  coreBending;
  coreSectionIndex = /* @__PURE__ */ new Map();
  currentBending;
  bendingMode = false;
  currentU;
  currentR;
  currentStress;
  setCoreBending(tmd) {
    this.coreBending = tmd.coreWindSection;
    if (!this.coreBending) throw new Error("Missing computed core bending stress");
    const ids = new Map(this.coreBending.memberIds.map((id, i) => [id, i]));
    this.data.members.forEach((m, i) => {
      const k = ids.get(String(m.id));
      if (k !== void 0) this.coreSectionIndex.set(i, k);
    });
  }
  bind(id, geometry) {
    const vertices = geometry.getAttribute("position"), n = vertices.count, bind = { i: new Int32Array(n), j: new Int32Array(n), w: new Float32Array(n), offset: new Float32Array(n * 3), member: new Int32Array(n), colors: new Float32Array(n * 3) };
    const own = this.byMesh.get(id), axes = own?.length ? own : this.coreAxes, point = V();
    for (let k = 0; k < n; k++) {
      point.set(vertices.getX(k) * 100, vertices.getY(k) * 100, vertices.getZ(k) * 100);
      let best = Infinity, chosen = axes[0], weight = 0;
      for (const axis of axes) {
        const dx = point.x - axis.a.x, dy = point.y - axis.a.y, dz = point.z - axis.a.z;
        const w = clamp((dx * axis.delta.x + dy * axis.delta.y + dz * axis.delta.z) / axis.l2), distance = (dx - axis.delta.x * w) ** 2 + (dy - axis.delta.y * w) ** 2 + (dz - axis.delta.z * w) ** 2;
        if (distance < best) {
          best = distance;
          chosen = axis;
          weight = w;
        }
      }
      bind.i[k] = chosen.i;
      bind.j[k] = chosen.j;
      bind.w[k] = weight;
      bind.member[k] = own?.length ? chosen.index : -1;
      for (let q = 0; q < 3; q++) bind.offset[k * 3 + q] = point.getComponent(q) - mix(chosen.a.getComponent(q), chosen.b.getComponent(q), weight);
    }
    bind.colors.fill(1);
    this.bindings.set(geometry, bind);
    geometry.setAttribute("color", new T4.BufferAttribute(bind.colors, 3));
    return bind;
  }
  physicalTime(s) {
    const section = this.timeline?.sections.find((c) => c.id === "wind"), end = this.timeline?.sections.find((c) => c.id === "damper");
    if (section && end && s.frame >= section.start && s.frame < end.end) {
      return clamp((s.frame - section.start) / (end.end - section.start)) * (this.data.dynamic.time.at(-1) ?? 59);
    }
    const clip = s.section === "frame" ? "s019" : "s013", start = (this.timeline?.clips.find((c) => c.id === clip)?.start ?? 0) / (this.timeline?.fps ?? 30);
    return Math.max(0, s.time - start);
  }
  update(s) {
    const u = s.n + s.u;
    const gravity = pulse(15.7, 16.05, 16.8, 17.2, u);
    this.bendingMode = u >= 31.2 && u <= 32.96;
    const wind = pulse(12.8, 13.15, 13.75, 14.1, u) + pulse(18.75, 19.15, 20.85, 21.25, u) + pulse(29.05, 29.6, 38.55, 39.1, u);
    if (wind > 1e-5) {
      const times = this.data.dynamic.time, t = clamp(this.physicalTime(s) / (times.at(-1) ?? 1)) * (times.at(-1) ?? 0);
      let i = Math.max(0, times.findIndex((x) => x >= t) - 1);
      if (t >= times.at(-1)) i = times.length - 2;
      const j = Math.min(i + 1, times.length - 1);
      this.play = { a: { u: this.dynamicU[i], r: this.dynamicR[i], stress: this.dynamicStress[i] }, b: { u: this.dynamicU[j], r: this.dynamicR[j], stress: this.dynamicStress[j] }, f: clamp((t - times[i]) / (times[j] - times[i])), weight: Math.min(1, wind), scale: WIND_MAGNIFICATION, stressWeight: pulse(18.8, 19.2, 20.8, 21.2, u) + pulse(31.2, 31.8, 32.75, 32.95, u) + pulse(32.98, 33.15, 33.65, 34, u), kind: "wind" };
    } else this.play = { a: this.gravity, b: this.gravity, f: 0, weight: gravity, scale: 1, stressWeight: gravity, kind: gravity > 1e-5 ? "gravity" : "none" };
    const p = this.play;
    if (p.weight > 1e-5) {
      for (let i = 0; i < this.data.nodes.length; i++) for (let q = 0; q < 3; q++) {
        this.currentU[i * 3 + q] = mix(p.a.u[i][q], p.b.u[i][q], p.f);
        this.currentR[i * 3 + q] = mix(p.a.r?.[i]?.[q] ?? 0, p.b.r?.[i]?.[q] ?? 0, p.f);
      }
      for (let i = 0; i < this.currentStress.length; i++) this.currentStress[i] = mix(p.a.stress[i], p.b.stress[i], p.f);
    }
    if (this.bendingMode && this.coreBending) {
      const b = this.coreBending, t = Math.min(b.time.at(-1), this.physicalTime(s)), i = Math.min(b.time.length - 2, Math.floor(t)), f = clamp(t - i);
      for (const [member, k] of this.coreSectionIndex) this.currentBending[member] = mix(b.extremeMPa[i][k], b.extremeMPa[i + 1][k], f);
    }
  }
  deform(geometry, rest, material) {
    const bind = this.bindings.get(geometry), p = this.play;
    if (!bind || !p) return;
    const pos = geometry.getAttribute("position");
    if (p.weight < 1e-5) {
      if (geometry.userData.physicsActive) {
        pos.array.set(rest);
        pos.needsUpdate = true;
        bind.colors.fill(1);
        geometry.getAttribute("color").needsUpdate = true;
      }
      geometry.userData.physicsActive = false;
      return;
    }
    geometry.userData.physicsActive = true;
    const boundMember = bind.member[0], role = this.data.members[boundMember]?.role ?? "", eligible = p.kind === "gravity" || (this.bendingMode ? role === "core" : /megacolumn|corner/i.test(role));
    const tint = eligible ? Math.min(1, p.stressWeight) : 0, gain = p.weight * p.scale * 0.01;
    const stressBound = p.kind === "gravity" ? this.gravityLimit : this.stressLimit, U = this.currentU, R = this.currentR;
    for (let k = 0; k < pos.count; k++) {
      const i = bind.i[k] * 3, j = bind.j[k] * 3, w = bind.w[k], idx = k * 3;
      const ux = mix(U[i], U[j], w), uy = mix(U[i + 1], U[j + 1], w), uz = mix(U[i + 2], U[j + 2], w), rx = mix(R[i], R[j], w), ry = mix(R[i + 1], R[j + 1], w), rz = mix(R[i + 2], R[j + 2], w);
      const ox = bind.offset[idx], oy = bind.offset[idx + 1], oz = bind.offset[idx + 2];
      pos.setXYZ(k, rest[idx] + gain * (ux + ry * oz - rz * oy), rest[idx + 1] + gain * (uy + rz * ox - rx * oz), rest[idx + 2] + gain * (uz + rx * oy - ry * ox));
      const m = bind.member[k], stress = m < 0 ? 0 : this.currentStress[m], amount = Math.pow(clamp(Math.abs(stress) / stressBound), STRESS_COLOR_POWER);
      if (this.bendingMode && this.coreSectionIndex.has(m)) {
        tmpColor.copy(bendLow).lerp(bendHigh, Math.pow(clamp(this.currentBending[m] / 6), CORE_STRESS_COLOR_POWER));
      } else tmpColor.copy(zero).lerp(stress >= 0 ? cool : warm, amount);
      if (m < 0) tmpColor.copy(white);
      else tmpColor.lerp(white, 1 - tint);
      tmpColor.toArray(bind.colors, idx);
    }
    pos.needsUpdate = true;
    geometry.getAttribute("color").needsUpdate = true;
    if (bind.member[0] >= 0) {
      const base = material.userData.physicsBaseColor ?? material.color.clone();
      material.userData.physicsBaseColor = base;
      material.color.copy(base).lerp(white, tint);
      material.vertexColors = true;
    } else material.vertexColors = false;
  }
  displacementAt(point) {
    const p = this.play;
    if (!p || p.weight < 1e-5) return V();
    const metres = point.clone().multiplyScalar(100);
    let best = Infinity, a = this.coreAxes[0], w = 0;
    for (const axis of this.coreAxes) {
      const f = clamp(metres.clone().sub(axis.a).dot(axis.delta) / axis.l2), d = metres.distanceToSquared(axis.a.clone().addScaledVector(axis.delta, f));
      if (d < best) {
        a = axis;
        w = f;
        best = d;
      }
    }
    const result = V();
    for (let q = 0; q < 3; q++) result.setComponent(q, mix(mix(p.a.u[a.i][q], p.a.u[a.j][q], w), mix(p.b.u[a.i][q], p.b.u[a.j][q], w), p.f) * 0.01 * p.weight * p.scale);
    return result;
  }
};

// src/EnvironmentPlayback.ts
import * as T5 from "three";
import { Line2 as Line22 } from "three/examples/jsm/lines/Line2.js";
import { LineGeometry as LineGeometry2 } from "three/examples/jsm/lines/LineGeometry.js";
import { LineMaterial as LineMaterial2 } from "three/examples/jsm/lines/LineMaterial.js";
var PILE_MAGNIFICATION = 80;
var TMD_RELATIVE_MAGNIFICATION = 1;
var ForceArrow = class {
  constructor(c, radius = 6e-3) {
    this.radius = radius;
    this.mat = new T5.MeshStandardMaterial({ color: c, roughness: 0.38, metalness: 0.12, emissive: c, emissiveIntensity: 0.16 });
    this.shaft = new T5.Mesh(new T5.CylinderGeometry(1, 1, 1, 12), this.mat);
    this.head = new T5.Mesh(new T5.ConeGeometry(1, 1, 20), this.mat);
    this.bead = new T5.Mesh(new T5.SphereGeometry(1, 12, 8), new T5.MeshBasicMaterial({ color: "#fff4d9", toneMapped: false }));
    this.root.add(this.shaft, this.head, this.bead);
  }
  radius;
  root = new T5.Group();
  shaft;
  head;
  bead;
  mat;
  set(a, b, weight = 1, camera, phase = 0) {
    const d = b.clone().sub(a), length = d.length();
    this.root.visible = weight > 1e-3 && length > 1e-4;
    if (!this.root.visible) return;
    this.root.position.copy(a);
    this.root.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
    const pixel = camera ? 2 * Math.tan(T5.MathUtils.degToRad(camera.fov) / 2) * camera.position.distanceTo(a) / 1080 : 0, r = Math.min(length * 0.075, Math.max(this.radius, pixel * 2.2)) * Math.max(0.3, weight), h = Math.min(r * 7.6, length * 0.32), body = Math.max(1e-4, length - h);
    this.shaft.scale.set(r, body, r);
    this.shaft.position.y = body / 2;
    this.head.scale.set(r * 2.8, h, r * 2.8);
    this.head.position.y = body + h / 2;
    this.bead.scale.setScalar(r * 1.22);
    this.bead.position.y = body * (phase % 1);
    this.bead.visible = weight > 0.95 && length > r * 12;
  }
};
function wideLine(points, color, width, dashed = false) {
  const mat = new LineMaterial2({ color, linewidth: width, worldUnits: false, dashed, dashSize: 0.055, gapSize: 0.033, transparent: true, opacity: 0.88, depthWrite: false });
  mat.resolution.set(1920, 1080);
  mat.toneMapped = false;
  const line = new Line22(new LineGeometry2().setPositions(points.flatMap((p) => p.toArray())), mat);
  line.computeLineDistances();
  line.frustumCulled = false;
  return line;
}
function earthTexture() {
  const n = 256, bytes = new Uint8Array(n * n * 4);
  let seed = 98471;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    seed = Math.imul(seed, 1664525) + 1013904223 >>> 0;
    const v = 170 + ((seed >>> 24) - 128) * 0.21 + 8 * Math.sin(y * 0.38 + Math.sin(x * 0.04));
    const k = (y * n + x) * 4;
    bytes[k] = v;
    bytes[k + 1] = v * 0.91;
    bytes[k + 2] = v * 0.77;
    bytes[k + 3] = 255;
  }
  const tex = new T5.DataTexture(bytes, n, n, T5.RGBAFormat);
  tex.wrapS = tex.wrapT = T5.RepeatWrapping;
  tex.repeat.set(4, 1);
  tex.needsUpdate = true;
  tex.colorSpace = T5.SRGBColorSpace;
  return tex;
}
var EnvironmentPlayback = class {
  constructor(scene, data, physics) {
    this.scene = scene;
    this.physics = physics;
    if (data.schema !== "rainbow.shanghai-environment/1") throw new Error("Missing verified environmental response");
    this.data = data;
    this.pileOrigin.y = -Number(data.pile.headDepthBelowGrade_m) * 0.01;
    scene.add(this.root);
    this.root.add(this.soil, this.pile, this.wind, this.reference);
    this.texture = earthTexture();
    const earthColors = ["#ac9275", "#afa084", "#959683", "#898e7b", "#a3a18a", "#b1a58d", "#aaa088", "#b9a47f", "#c1ab84", "#ac9c7d", "#b8a684", "#a39472"];
    const layers = data.pile.soilLayers.map((l, i) => [l.depthRangeBelowGrade_m[0] * 0.01, l.depthRangeBelowGrade_m[1] * 0.01, earthColors[i % earthColors.length]]);
    for (const [top, bottom, c] of layers) {
      const mat = new T5.MeshStandardMaterial({ color: c, map: this.texture, bumpMap: this.texture, bumpScale: 8e-3, roughness: 0.94 });
      const m = new T5.Mesh(new T5.BoxGeometry(1.6, bottom - top, 0.22), mat);
      m.position.set(0, -(top + bottom) / 2, -0.6);
      m.receiveShadow = true;
      this.soil.add(m);
    }
    const count = data.pile.nodes.length - 1;
    for (let i = 0; i < count; i++) {
      const m = new T5.Mesh(new T5.CylinderGeometry(75e-4, 75e-4, 1, 16), new T5.MeshStandardMaterial({ color: "#c9774f", metalness: 0.12, roughness: 0.46 }));
      this.pileSegments.push(m);
      this.pile.add(m);
    }
    for (let i = 0; i < 7; i++) {
      const a = new ForceArrow("#087b95", 42e-4);
      this.sideArrows.push(a);
      this.pile.add(a.root);
    }
    this.pile.add(this.toeArrow.root, this.loadArrow.root, this.lateralArrow.root);
    const guide = new T5.Line(new T5.BufferGeometry().setFromPoints([this.pileOrigin, this.pileOrigin.clone().add(V(0, -0.52, 0))]), new T5.LineDashedMaterial({ color: "#778984", dashSize: 0.013, gapSize: 0.011, transparent: true, opacity: 0.65 }));
    guide.computeLineDistances();
    this.pile.add(guide);
    const loads = data.tmd;
    for (const h of [45, 125, 205, 285, 365, 445, 535]) {
      const a = new ForceArrow("#bf613b", 0.011);
      a.mat.depthTest = false;
      a.mat.depthWrite = false;
      a.mat.transparent = true;
      a.root.children.forEach((o) => {
        o.renderOrder = 31;
        if (o instanceof T5.Mesh) {
          o.material.depthTest = false;
          o.material.transparent = true;
        }
      });
      this.windArrows.push(a);
      this.wind.add(a.root);
      let nearest = 0;
      for (let i = 1; i < loads.windLoads.nodeIds.length; i++) if (Math.abs(loads.windLoads.nodeXYZ_m[i][1] - h) < Math.abs(loads.windLoads.nodeXYZ_m[nearest][1] - h)) nearest = i;
      this.windIndices.push(nearest);
      const target = new T5.Mesh(new T5.RingGeometry(9e-3, 0.015, 24), new T5.MeshBasicMaterial({ color: "#c56b40", side: T5.DoubleSide, depthWrite: false, depthTest: false, toneMapped: false }));
      target.renderOrder = 32;
      this.windTargets.push(target);
      this.wind.add(target);
    }
    for (const side of [-1, 1]) {
      const indices = physics.data.members.map((m, i) => ({ m, i, a: physics.axes[i] })).filter((x) => x.m.meshIds.some((id) => id.startsWith("MEGACOL_Z04")) && x.a.a.x * side > 15);
      indices.sort((a, b) => Math.abs((a.a.a.y + a.a.b.y) * 0.5 - 230) - Math.abs((b.a.a.y + b.a.b.y) * 0.5 - 230) || b.a.a.z - a.a.a.z);
      if (indices.length) this.axialIndices.push(indices[0].i);
    }
    for (let i = 0; i < this.axialIndices.length * 2; i++) {
      const a = new ForceArrow(C.red, 9e-3);
      this.axialArrows.push(a);
      this.root.add(a.root);
    }
    const points = [];
    for (let i = 0; i <= 100; i++) points.push(V(-0.3 + 0.115 * i / 100, 5.8 * i / 100, 0));
    this.outline = wideLine(points, "#405b66", 2.8, true);
    this.currentReference = wideLine(points, "#107d96", 3.7);
    this.connector = wideLine([V(), V()], "#b57a32", 3.2, true);
    this.referenceDot = new T5.Mesh(new T5.SphereGeometry(0.027, 16, 12), new T5.MeshStandardMaterial({ color: "#107d96", emissive: "#107d96", emissiveIntensity: 0.2 }));
    this.reference.add(this.outline, this.currentReference, this.connector, this.referenceDot);
    physics.setCoreBending(data.tmd);
  }
  scene;
  physics;
  root = new T5.Group();
  soil = new T5.Group();
  pile = new T5.Group();
  wind = new T5.Group();
  reference = new T5.Group();
  pileOrigin = V(0.1248, -0.314, 0.3432);
  pileSegments = [];
  sideArrows = [];
  toeArrow = new ForceArrow("#b28031", 5e-3);
  loadArrow = new ForceArrow("#c24f34", 5e-3);
  lateralArrow = new ForceArrow("#087b95", 45e-4);
  windArrows = [];
  axialArrows = [];
  windTargets = [];
  connector;
  outline;
  currentReference;
  referenceDot;
  texture;
  data;
  axialIndices = [];
  windIndices = [];
  sample(field, time) {
    const d = this.data.tmd, times = d.time, n = times.length - 1, x = clamp(time / times[n]) * n, i = Math.min(n - 1, Math.floor(x));
    const values = d[field];
    if (!values) throw new Error("Missing TMD signal " + field);
    return mix(values[i], values[i + 1], x - i);
  }
  tmd(s) {
    const t = this.physics.physicalTime(s);
    return { relative: this.sample("relativeX_m", t), support: this.sample("supportX_m", t), windFactor: this.sample("windFactor", t), force: this.sample("forceOnSupport_N", t), damping: this.sample("damperForceOnSupport_N", t) };
  }
  update(s, camera) {
    const u = s.n + s.u, soil = pulse(4.15, 5, 8.8, 9.8, u);
    this.soil.position.y = -4 * (1 - soil);
    this.soil.visible = soil > 1e-5;
    const pw = pulse(6.2, 6.65, 7.95, 8.45, u), load = ramp(6.55, 7.72, u), stages = this.data.pile.stages, index = load * (stages.length - 1), i = Math.min(stages.length - 2, Math.floor(index)), a = stages[i], b = stages[i + 1], f = index - i;
    const point = (k) => {
      const rest = this.data.pile.nodes[k].xyz_m;
      return this.pileOrigin.clone().add(V(rest[0], rest[1], rest[2] ?? 0).multiplyScalar(0.01)).add(V(mix(a.u_m[k][0], b.u_m[k][0], f), mix(a.u_m[k][1], b.u_m[k][1], f), 0).multiplyScalar(0.01 * PILE_MAGNIFICATION * pw));
    };
    this.pile.visible = pw > 1e-3;
    this.pile.position.x = 3 * (1 - pw);
    this.pileSegments.forEach((m, k) => {
      const p2 = point(k), q2 = point(k + 1), v = q2.clone().sub(p2);
      m.position.copy(p2).add(q2).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), v.clone().normalize());
      m.scale.y = v.length();
      const force = Math.abs(mix(a.axialForce_N[k], b.axialForce_N[k], f));
      m.material.color.set("#d8caba").lerp(new T5.Color(C.red), clamp(force / 8e6) ** 0.6);
    });
    const head = point(0);
    this.loadArrow.set(head.clone().add(V(0, 0.145 * load, 0)), head, pw * load, camera, s.time * 0.75);
    this.lateralArrow.set(head.clone().add(V(-0.13 * load, 0, 0)), head, pw * load, camera, s.time * 0.75 + 0.3);
    this.sideArrows.forEach((ar, j) => {
      const k = Math.max(1, Math.round((j + 1) / 8 * (this.data.pile.nodes.length - 1))), p2 = point(k), reaction2 = mix(a.sideReactionOnPile_N[k][1], b.sideReactionOnPile_N[k][1], f), len = 0.015 + 0.065 * clamp(Math.abs(reaction2) / 6e5), q2 = p2.clone().add(V(0.012, 0, 7e-3));
      ar.set(q2.clone().add(V(0, -Math.sign(reaction2) * len, 0)), q2, pw * load, camera, s.time * 0.75 + j * 0.17);
    });
    const toe = point(this.data.pile.nodes.length - 1), reaction = mix(a.toeReactionOnPile_N[1], b.toeReactionOnPile_N[1], f);
    this.toeArrow.set(toe.clone().add(V(0, -0.025 - 0.1 * clamp(reaction / 8e6), 0)), toe, pw * load, camera, s.time * 0.75);
    const w = pulse(29.85, 30.5, 33.8, 34.6, u), tm = this.tmd(s);
    this.wind.visible = w > 1e-3;
    const wl = this.data.tmd.windLoads;
    this.windArrows.forEach((ar, j) => {
      const k = this.windIndices[j], xyz = wl.nodeXYZ_m[k], force = wl.baseForce_N[k], rest = V(...xyz).multiplyScalar(0.01), p2 = rest.clone().add(this.physics.displacementAt(rest)), vector = V(...force).multiplyScalar(tm.windFactor * 5e-6 * w);
      ar.set(p2.clone().sub(vector), p2, w, camera, this.physics.physicalTime(s) * 0.55 + j * 0.12);
      const target = this.windTargets[j];
      target.position.copy(p2);
      target.visible = ar.root.visible;
      target.scale.setScalar(w);
      if (camera) target.quaternion.copy(camera.quaternion);
    });
    const rw = pulse(12.8, 13.1, 13.75, 14.1, u) + pulse(31.55, 32.2, 33.55, 34.1, u);
    this.reference.visible = rw > 1e-3;
    this.reference.position.z = 0.4;
    const deformed = [];
    for (let k = 0; k <= 100; k++) {
      const p2 = V(-0.3 + 0.115 * k / 100, 5.8 * k / 100, 0);
      p2.add(this.physics.displacementAt(p2));
      deformed.push(p2.x, p2.y, p2.z);
    }
    this.currentReference.geometry.setPositions(deformed);
    const p = V(-0.185, 5.8, 0), q = p.clone().add(this.physics.displacementAt(p));
    this.connector.geometry.setPositions([...p.toArray(), ...q.toArray()]);
    this.connector.computeLineDistances();
    this.referenceDot.position.copy(q);
    const aw = Math.max(pulse(18.85, 19.25, 20.75, 21.15, u), pulse(32.95, 33.25, 33.72, 34.1, u));
    this.axialArrows.forEach((ar, j) => {
      const idx = this.axialIndices[Math.floor(j / 2)], axis = this.physics.axes[idx], node = j % 2 ? axis.j : axis.i, p2 = (j % 2 ? axis.b : axis.a).clone().multiplyScalar(0.01), gain = (this.physics.play?.scale ?? 1) * (this.physics.play?.weight ?? 0) * 0.01;
      p2.add(V(this.physics.currentU[node * 3], this.physics.currentU[node * 3 + 1], this.physics.currentU[node * 3 + 2]).multiplyScalar(gain));
      const stress = this.physics.currentStress[idx], member = this.physics.data.members[idx], area = member.A_m2 ?? member.section?.A ?? member.A;
      if (!(area > 0)) throw new Error("Missing actual mega-column section area");
      const axialForce = stress * 1e6 * area, outward = axis.delta.clone().normalize().multiplyScalar(j % 2 ? 1 : -1), length = Math.abs(axialForce) * 37e-10 * aw, outer = p2.clone().addScaledVector(outward, length);
      ar.mat.color.set(stress >= 0 ? "#087d9b" : "#d75d37");
      ar.mat.emissive.copy(ar.mat.color);
      ar.set(stress >= 0 ? p2 : outer, stress >= 0 ? outer : p2, aw, camera, s.time * 0.6 + j * 0.18);
    });
  }
  dispose() {
    this.root.removeFromParent();
    this.root.traverse((o) => {
      if (o instanceof T5.Mesh || o instanceof T5.Line) {
        o.geometry.dispose();
        const materials = Array.isArray(o.material) ? o.material : [o.material];
        materials.forEach((m) => m.dispose());
      }
    });
    this.texture.dispose();
  }
};

// src/World.ts
var World = class {
  constructor(scene, camera, renderer, base, tl) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.path = new CameraPath(tl);
    renderer.localClippingEnabled = true;
    this.environment = new CinematicEnvironment(scene, renderer, base);
    scene.add(this.tower, this.ground, this.eddy, this.platform);
    this.makeSite();
    this.makeEddy();
    this.makePlatform();
    this.ready = Promise.all([new GLTFLoader().loadAsync(base + "models/shanghai-tower.glb"), fetch(base + "models/shanghai-tower-manifest.json").then((r) => r.json()), fetch(base + "physics/response.json").then((r) => {
      if (!r.ok) throw new Error("Missing verified solver response");
      return r.json();
    }), fetch(base + "physics/environment-response.json").then((r) => {
      if (!r.ok) throw new Error("Missing environmental solver response");
      return r.json();
    }), this.environment.ready]).then(([gltf, manifest, response, environment]) => {
      this.manifest = manifest;
      this.physics = new PhysicsPlayback(response, tl);
      this.path.setAnchors(manifest.cameraAnchorsThree);
      gltf.scene.updateMatrixWorld(true);
      for (const info of manifest.parts) {
        const source = gltf.scene.getObjectByName(info.id);
        if (!source) throw new Error("Missing part: " + info.id);
        if (!source.getObjectByProperty("type", "Mesh") && !(source instanceof T6.Mesh)) continue;
        const id = source.name;
        const root = new T6.Group();
        root.name = id;
        this.tower.add(root);
        const meshes = [], materials = [];
        source.traverse((o) => {
          if (!(o instanceof T6.Mesh)) return;
          const geo = o.geometry.clone().applyMatrix4(o.matrixWorld).scale(0.01, 0.01, 0.01);
          geo.computeBoundingSphere();
          const old = Array.isArray(o.material) ? o.material[0] : o.material;
          const m = /ENVELOPE.*GLASS/.test(id) ? new T6.MeshPhysicalMaterial({ color: "#6d96ad", roughness: 0.085, metalness: 0.4, clearcoat: 1, clearcoatRoughness: 0.1, ior: 1.5, envMapIntensity: 1.4, side: T6.DoubleSide }) : old.clone();
          m.clippingPlanes = [this.cut, new T6.Plane(V(0, -1, 0), 100)];
          m.clipShadows = true;
          m.userData.originalColor = m.color.clone();
          m.userData.originalOpacity = m.opacity;
          this.physics.bind(id, geo);
          m.vertexColors = true;
          const mesh = new T6.Mesh(geo, m);
          mesh.castShadow = !/ENVELOPE|FACADE|GLASS/.test(id);
          mesh.receiveShadow = true;
          root.add(mesh);
          meshes.push(mesh);
          materials.push(m);
        });
        const center = new T6.Box3().setFromObject(root).getCenter(V());
        const zone = Number(/_Z(\d+)/.exec(id)?.[1] ?? 0);
        this.parts.push({ id, role: info.role ?? id.split("_")[0], zone, root, meshes, center, offset: V(), materials, restVertices: meshes.map((m) => new Float32Array(m.geometry.getAttribute("position").array)) });
      }
      if (!this.parts.length) throw new Error("No separable tower parts in GLB");
      this.anchors = manifest.forceAnchorsThree;
      this.tmdAnchors = manifest.tmdAnchorsThree;
      this.makeRoutes(manifest);
      this.effects = new EnvironmentPlayback(scene, environment, this.physics);
      this.wind = new WindVisualization(scene, this.physics);
      for (const p of this.parts.filter((p2) => /ENVELOPE.*GLASS/.test(p2.id))) {
        this.panelDirections.set(p.id.replace(/_GLASS$/, ""), V(p.center.x, 0, p.center.z).normalize());
      }
    });
  }
  scene;
  camera;
  renderer;
  ready;
  parts = [];
  tower = new T6.Group();
  ground = new T6.Group();
  routes = [];
  flow = new T6.Group();
  flowDots = [];
  flowPaths = [];
  environment;
  wind;
  path;
  cut = new T6.Plane(V(0, -1, 0), 100);
  state;
  anchors;
  tmdAnchors;
  eddy = new T6.Group();
  eddyDots = [];
  platform = new T6.Group();
  physics;
  manifest;
  effects;
  flowTrails = [];
  panelDirections = /* @__PURE__ */ new Map();
  makeSite() {
    const mat = new T6.MeshStandardMaterial({ color: "#ced6d1", roughness: 0.85, metalness: 0.03 });
    const plinth = new T6.Mesh(new T6.CylinderGeometry(1.1, 1.16, 0.035, 96), mat);
    plinth.position.y = -0.03;
    this.ground.add(plinth);
    for (let i = 0; i < 4; i++) {
      const r = 1.24 + i * 0.09;
      const points = [];
      for (let k = 0; k <= 128; k++) points.push(V(Math.cos(k / 128 * Math.PI * 2) * r, -0.02, Math.sin(k / 128 * Math.PI * 2) * r));
      const line = new T6.Line(new T6.BufferGeometry().setFromPoints(points), new T6.LineBasicMaterial({ color: "#b4c7c4", transparent: true, opacity: 0.5 }));
      this.ground.add(line);
    }
  }
  makeRoutes(manifest) {
    const make = (points, kind, c, r = 0.012) => {
      const curve = new T6.CurvePath();
      for (let i = 1; i < points.length; i++) if (points[i].distanceTo(points[i - 1]) > 1e-7) curve.add(new T6.LineCurve3(points[i - 1], points[i]));
      const line = new T6.Mesh(new T6.TubeGeometry(curve, 90, r, 8, false), new T6.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.17, roughness: 0.4, transparent: true, opacity: 0.8 }));
      const dots = Array.from({ length: 4 }, () => new T6.Mesh(new T6.ConeGeometry(r * 2.1, r * 6, 12), new T6.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.45 })));
      this.scene.add(line, ...dots);
      this.physics.bind("force-route", line.geometry);
      this.routes.push({ curve, line, dots, kind, rest: new Float32Array(line.geometry.getAttribute("position").array) });
    };
    const anchors = manifest.forceAnchorsThree;
    const point = (a) => V(a[0], a[1], a[2]).multiplyScalar(0.01);
    const load = point(anchors.floorLoad.point), contact = point(anchors.floorCoreContact.point), column = point(anchors.outriggerColumn.point), core = point(anchors.outriggerCore.point);
    const down = (manifest.columnPathThree ?? anchors.columnPath).map(point);
    const wallPath = (manifest.coreLoadPathThree ?? anchors.coreLoadPathThree).map(point);
    make([load, contact, ...wallPath], "gravity", "#d87739", 0.01);
    make([load, column.clone().setY(load.y), ...down], "gravity", "#d87739", 0.01);
    make([core, column, column.clone().add(V(0, -0.35, 0))], "moment", C.red, 0.01);
    make([V(-column.x, column.y - 0.3, -column.z), V(-column.x, column.y, -column.z), V(-core.x, core.y, -core.z)], "moment", C.teal, 0.01);
  }
  makeEddy() {
    for (let j = 0; j < 4; j++) {
      const x = (j % 2 - 0.5) * 0.041, z = (Math.floor(j / 2) - 0.5) * 0.041;
      const ring = new T6.Mesh(new T6.TorusGeometry(0.017, 14e-4, 8, 48), new T6.MeshStandardMaterial({ color: "#ce7042", emissive: "#ce7042", emissiveIntensity: 0.4, roughness: 0.4 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(x, 5.731, z);
      this.eddy.add(ring);
      const dot = new T6.Mesh(new T6.SphereGeometry(3e-3, 12, 8), new T6.MeshStandardMaterial({ color: "#f4c575", emissive: "#e5a844", emissiveIntensity: 0.4 }));
      dot.userData.center = [x, z];
      this.eddyDots.push(dot);
      this.eddy.add(dot);
    }
  }
  makePlatform() {
    const steel = new T6.MeshStandardMaterial({ color: "#c69454", metalness: 0.5, roughness: 0.4 });
    const beam = (a, b, r = 5e-3) => {
      const d = b.clone().sub(a), m = new T6.Mesh(new T6.CylinderGeometry(r, r, d.length(), 8), steel);
      m.position.copy(a).add(b).multiplyScalar(0.5);
      m.quaternion.setFromUnitVectors(V(0, 1, 0), d.normalize());
      this.platform.add(m);
    };
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const wall = new T6.Mesh(new T6.BoxGeometry(0.34, 0.06, 0.014), steel);
      wall.position.set(Math.sin(a) * 0.17, 0, Math.cos(a) * 0.17);
      wall.rotation.y = a;
      this.platform.add(wall);
      for (let j = -2; j <= 2; j++) {
        const x = j * 0.07, z = 0.175;
        const xx = x * Math.cos(a) + z * Math.sin(a), zz = z * Math.cos(a) - x * Math.sin(a);
        beam(V(xx, 0.03, zz), V(xx, 0.07, zz), 2e-3);
      }
      beam(V(-0.175 * Math.cos(a) + 0.175 * Math.sin(a), 0.07, 0.175 * Math.cos(a) + 0.175 * Math.sin(a)), V(0.175 * Math.cos(a) + 0.175 * Math.sin(a), 0.07, 0.175 * Math.cos(a) - 0.175 * Math.sin(a)), 2e-3);
    }
    beam(V(0.14, 0, 0.08), V(0.14, 0.7, 0.08), 9e-3);
    beam(V(-0.3, 0.67, 0.08), V(0.75, 0.67, 0.08), 9e-3);
    beam(V(0.14, 0.7, 0.08), V(0.7, 0.64, 0.08), 3e-3);
    beam(V(0.14, 0.7, 0.08), V(-0.28, 0.64, 0.08), 3e-3);
    beam(V(0.59, 0.66, 0.08), V(0.59, 0.31, 0.08), 15e-4);
    const member = new T6.Mesh(new T6.BoxGeometry(0.2, 0.012, 0.02), steel);
    member.position.set(0.59, 0.3, 0.08);
    this.platform.add(member);
  }
  update(s) {
    this.state = s;
    const u = s.n + s.u, t = s.time;
    this.physics?.update(s);
    this.path.apply(this.camera, t);
    const cameraFollow = pulse(33.3, 34.7, 38.1, 39.1, u), pose = this.path.at(t), follow = this.physics.displacementAt(pose.target).multiplyScalar(cameraFollow);
    this.camera.position.add(follow);
    this.camera.lookAt(pose.target.clone().add(follow));
    this.camera.updateMatrixWorld();
    this.environment.update(s, this.camera);
    const hook = pulse(1.25, 1.98, 2.65, 3.45, u);
    const reveal = channel([[1, 0], [3.4, 0], [4.8, 1], [21, 1], [22.8, 0.42], [26, 0.38], [28, 0], [34.1, 0], [35.2, 0.85], [38.3, 0.85], [39.7, 0], [49, 0]], u);
    const corePlan = pulse(10.1, 10.82, 11.92, 12.58, u);
    const coreSection = pulse(9.98, 10.55, 11.99, 12.62, u);
    this.cut.constant = coreSection > 0 ? mix(6.8, 1.73701, coreSection) : 100;
    const openUpper = pulse(14.05, 14.85, 26.2, 27.4, u);
    const skin = pulse(21.4, 22.5, 26.3, 27.4, u);
    const construction = pulse(39.1, 39.95, 44.05, 44.9, u), progress = ramp(39.75, 44.1, u), builtHeight = 0.2 + 6.12 * progress;
    const windSection = pulse(31.65, 32.25, 33.75, 34.25, u);
    for (const p of this.parts) {
      const id = p.id, c = p.center, z = p.zone;
      p.offset.set(0, 0, 0);
      const shell = /ENVELOPE|SPIRAL_RIBS|GLAZING|FACADE_OUTER|FACADE_RADIAL_TRUSSES/.test(id), inner = /INNER_FACADE/.test(id), slab = /FLOORS|FLOOR_INSPECTION/.test(id), beam = /FLOOR_BEAMS/.test(id), core = /CORE/.test(id), col = /MEGACOL|CORNER/.test(id), truss = /OUTRIGGER|BELT|CONNECTION_PLATES/.test(id) || ["outrigger", "belt"].includes(p.role), crown = /CROWN/.test(id);
      const radial = (this.panelDirections.get(id.replace(/_(GLASS|MULLIONS)$/, "")) ?? V(c.x, 0, c.z)).clone();
      if (radial.length() < 5e-3) radial.set(1, 0, 0);
      radial.normalize();
      const sector = Number(/_S(\d+)/.exec(id)?.[1] ?? 1);
      const flap = this.panelDirections.get(`ENVELOPE_Z01_S${String(sector).padStart(2, "0")}`)?.clone() ?? radial.clone();
      const stagedHook = pulse(1.24, 1.92, 2.55, 3.26, u);
      if (shell) {
        const rib = /SPIRAL_RIBS|FACADE_RADIAL_TRUSSES/.test(id), exitDirection = V().setFromMatrixColumn(this.camera.matrixWorld, 0), side = flap.dot(V(-Math.sin(1.36), 0, Math.cos(1.36))) > 0 ? 1 : -1;
        if (rib) {
          p.offset.addScaledVector(exitDirection, reveal * 34 * (1 - skin));
        } else {
          p.offset.addScaledVector(flap, stagedHook * 0.64 + skin * 0.16);
          p.offset.addScaledVector(exitDirection, side * reveal * 34 * (1 - skin));
        }
      } else if (inner) {
        const half = Number(/_(\d)_(?:GLASS|FRAME)$/.exec(id)?.[1] ?? 1);
        p.offset.addScaledVector(V().setFromMatrixColumn(this.camera.matrixWorld, 0), (half === 1 ? 1 : -1) * reveal * 34 * (1 - skin));
      } else if (slab || beam) {
        p.offset.y += (z - 1) * stagedHook * 0.035;
      } else if (core || col || truss) {
        p.offset.y += (z - 1) * stagedHook * 0.035;
        if (col) p.offset.addScaledVector(radial, stagedHook * 0.12);
      }
      if (crown && !shell) p.offset.y += hook * 0.46 + pulse(34.1, 35.1, 38, 39.6, u) * 1.8;
      if ((z >= 6 || crown) && !shell && !inner) p.offset.y += openUpper * 16;
      if ((z >= 6 || crown) && (shell || inner)) p.offset.y += openUpper * 16;
      if (z === 5) p.offset.y += pulse(14.05, 14.85, 21.5, 22.5, u) * 14;
      if (id === "GROUND_PLAZA") p.offset.x += pulse(4.2, 5.2, 8.8, 9.9, u) * 12;
      p.root.position.copy(p.offset);
      p.root.visible = !/^SOIL/.test(id);
      for (const m of p.materials) {
        const buildLevel = core ? builtHeight + 0.35 : col || truss ? builtHeight : slab || beam ? builtHeight - 0.25 : shell || inner ? builtHeight - 0.6 : builtHeight;
        m.clippingPlanes[1].constant = Math.min(mix(6.8, Math.max(0.02, buildLevel), construction), z >= 4 ? mix(6.8, 1.7368, coreSection) : 6.8) + p.offset.y;
        const original = m.userData.originalColor;
        m.color.copy(original);
        let op = m.userData.originalOpacity;
        if (core) {
          m.color.set("#c4c0b5");
          m.roughness = 0.76;
          m.metalness = 0.025;
        }
        if (col || truss) {
          m.color.set("#5d7680");
          m.roughness = 0.29;
          m.metalness = 0.53;
        }
        if (slab) {
          m.color.set("#c7ccc9");
          m.roughness = 0.8;
          op *= 1 - 0.78 * pulse(9.5, 10.4, 13.2, 14, u);
        }
        if (beam) {
          m.color.set("#5b7480");
          op *= 1 - 0.74 * pulse(17.1, 17.65, 21.1, 21.7, u);
        }
        if (slab && z === 4) {
          op *= 1 - 0.91 * pulse(14.3, 15, 21, 21.8, u);
        }
        if (id === "FLOOR_INSPECTION_Z04") op = mix(op, 0.28, pulse(15, 15.4, 16.7, 17.2, u));
        if (core && /_W[23]$/.test(id)) {
          op *= 1 - 0.65 * pulse(17.2, 17.8, 20.6, 21.3, u);
        }
        if (inner) {
          op = /GLASS/.test(id) ? 0.12 : 1;
          m.color.set(/GLASS/.test(id) ? "#70a0ac" : "#607f85");
        }
        if (shell) {
          if (/GLASS/.test(id)) {
            op = 0.96 - 0.18 * hook;
            m.color.set("#6d96ad");
            m.roughness = 0.085;
            m.metalness = 0.4;
          } else {
            op = 1;
            m.color.set("#9cb1b9");
            m.roughness = 0.25;
            m.metalness = 0.58;
          }
        }
        if (shell && /GLASS/.test(id)) op = mix(op, 0.12, skin);
        if (shell) op *= 1 - 0.97 * windSection;
        if (inner || slab) op *= 1 - 0.96 * windSection;
        if (/PILES|RAFT|BASEMENT|DIAPHRAGM/.test(id)) {
          m.color.set("#bab9af");
          m.roughness = 0.84;
        }
        if (/PILES/.test(id)) op *= 1 - 0.97 * pulse(6.2, 6.65, 7.95, 8.45, u);
        if (/RAFT|BASEMENT|DIAPHRAGM/.test(id)) op *= 1 - 0.68 * pulse(6.4, 6.95, 7.85, 8.45, u);
        if (core && /_W[34]$/.test(id)) {
          op *= 1 - 0.75 * pulse(10.3, 10.8, 11.9, 12.5, u) * (1 - corePlan);
        }
        if (slab || beam || col || truss || p.role === "garden" || p.role === "sky_lobby" || p.role === "floorbeams") {
          op *= 1 - 0.9999 * corePlan;
        }
        if (z === 9 && (core || slab || beam || col || truss)) op *= 1 - 0.92 * pulse(34.2, 35.1, 37.9, 38.8, u);
        if (/TMD/.test(id)) {
          m.color.set(/MASS/.test(id) ? "#757e84" : /MAGNET/.test(id) ? "#374c59" : "#aeb9b9");
          m.metalness = 0.76;
          m.roughness = 0.29;
        }
        m.transparent = op < 0.999;
        m.opacity = op;
        m.depthWrite = op > 0.94;
      }
      p.meshes.forEach((mesh, j) => {
        mesh.castShadow = !/ENVELOPE|FACADE|GLASS/.test(id) && p.materials[j].opacity > 0.5;
      });
      if (!/TMD/.test(id)) p.meshes.forEach((mesh, j) => this.physics?.deform(mesh.geometry, p.restVertices[j], p.materials[j]));
      const tm = this.effects.tmd(s), tw = pulse(29.05, 29.6, 38.55, 39.1, u), sway = tm.relative * 0.01 * TMD_RELATIVE_MAGNIFICATION * tw;
      const support2 = this.physics.displacementAt(V(...this.tmdAnchors.massCenter).multiplyScalar(0.01));
      if (/TMD/.test(id)) p.root.position.add(support2);
      const suspensionLength = (this.tmdAnchors?.cableLength ?? 25) * 0.01;
      const pendulumRise = suspensionLength - Math.sqrt(Math.max(0, suspensionLength * suspensionLength - sway * sway));
      if (/TMD.*MASS|TMD_MASS|TMD_MAGNET/.test(id)) {
        p.root.position.x += sway;
        p.root.position.y += pendulumRise;
      }
      if (id === "TMD_DAMPER_PLATE") {
        for (const m of p.materials) m.color.set("#a96543");
      }
      if (id === "TMD_CABLES") p.meshes.forEach((mesh, j) => {
        const rest = p.restVertices[j], attr = mesh.geometry.getAttribute("position");
        let top = -Infinity, bottom = Infinity;
        for (let k = 1; k < rest.length; k += 3) {
          top = Math.max(top, rest[k]);
          bottom = Math.min(bottom, rest[k]);
        }
        for (let k = 0; k < rest.length; k += 3) {
          const w = (top - rest[k + 1]) / (top - bottom);
          attr.setXYZ(k / 3, rest[k] + sway * w, rest[k + 1] + pendulumRise * w, rest[k + 2]);
        }
        attr.needsUpdate = true;
      });
    }
    this.ground.traverse((o) => {
      if (o instanceof T6.Mesh || o instanceof T6.Line) {
        o.material.transparent = true;
        o.material.opacity = 1 - 0.94 * pulse(4, 4.8, 8.8, 9.8, u);
        o.material.depthWrite = false;
      }
    });
    this.ground.position.set(12 * pulse(4.2, 5.2, 8.8, 9.9, u), 0, 0);
    const platformWeight = pulse(39.55, 40.25, 42.7, 43.5, u);
    this.platform.position.set(120 * (1 - platformWeight), Math.min(builtHeight + 0.27, 5.81), 0);
    this.platform.visible = platformWeight > 1e-5;
    const gravity = pulse(15.9, 16.15, 16.85, 17.15, u) + pulse(32.9, 33.2, 33.7, 34, u), moment = 0, foundation = 0;
    for (const r of this.routes) {
      const weight = r.kind === "gravity" ? gravity : r.kind === "foundation" ? foundation : moment;
      r.line.visible = weight > 1e-3;
      r.line.material.opacity = 0.85 * weight;
      if (weight > 1e-3) this.physics?.deform(r.line.geometry, r.rest, r.line.material);
      for (let i = 0; i < r.dots.length; i++) {
        const d = r.dots[i];
        d.visible = weight > 1e-3;
        d.position.copy(r.curve.getPoint((t * 0.15 + i / 4) % 1));
        d.position.add(this.physics.displacementAt(d.position));
        d.quaternion.setFromUnitVectors(V(0, 1, 0), r.curve.getTangent((t * 0.15 + i / 4) % 1).normalize());
        d.scale.setScalar(weight);
      }
    }
    this.wind?.update(s, this.camera);
    const eddy = pulse(36.7, 37.1, 37.8, 38.2, u), plate = this.parts.find((p) => p.id === "TMD_DAMPER_PLATE"), plateY = plate?.center.y ?? 5.73, support = plate?.root.position ?? V();
    this.eddy.position.copy(support).add(V(0, plateY - 5.73 + 4e-3, 0));
    this.eddy.visible = eddy > 1e-3;
    this.eddy.traverse((o) => {
      if (o instanceof T6.Mesh) {
        o.material.transparent = true;
        o.material.opacity = eddy;
      }
    });
    for (let j = 0; j < this.eddyDots.length; j++) {
      const d = this.eddyDots[j], [x, z] = d.userData.center;
      d.position.set(x + 0.017 * Math.cos(t * 3 + j), 5.733, z + 0.017 * Math.sin(t * 3 + j));
    }
    this.effects.update(s, this.camera);
    this.scene.updateMatrixWorld(true);
  }
  labels(s) {
    const u = s.n + s.u;
    const list = [];
    const add = (text, id, fallback, side = "right") => {
      const p = this.parts.find((x) => x.id === id) ?? this.parts.find((x) => x.id.startsWith(id));
      list.push({ text, point: p ? p.center.clone().add(p.offset) : fallback, side });
    };
    if (u >= 5.3 && u < 6.6) {
      list.push({ text: "\u8F6F\u9ECF\u571F\u5C42", point: V(-0.7, -0.18, -0.48), color: C.gold });
      add("\u7B4F\u677F", "RAFT", V(0.3, -0.07, 0), "left");
    }
    if (u >= 6.8 && u < 7.9) {
      list.push({ text: "\u6869\u4FA7\u963B\u529B", point: V(0.149, -0.55, 0.351), color: C.teal }, { text: "\u6869\u7AEF\u53CD\u529B", point: V(0.125, -0.835, 0.343), color: C.gold, side: "left" });
    }
    if (u >= 10.6 && u < 12.5) list.push({ text: "\u6838\u5FC3\u7B52", point: V(...this.manifest.cameraAnchorsThree.coreInterior).multiplyScalar(0.01) });
    if (u >= 15.5 && u < 17) {
      const dir = this.camera.position.clone().setY(0).normalize();
      const col = this.parts.filter((x) => x.id.startsWith("MEGACOL_Z04")).sort((a, b) => b.center.clone().setY(0).dot(dir) - a.center.clone().setY(0).dot(dir))[0];
      if (col) list.push({ text: "\u5DE8\u67F1", point: col.center.clone().addScaledVector(dir, 0.013) });
    }
    if (u >= 18 && u < 18.85) {
      const a = this.anchors.outriggerCore.point, b = this.anchors.outriggerColumn.point;
      list.push({ text: "\u4F38\u81C2\u6841\u67B6", point: V((a[0] + b[0]) * 5e-3, (a[1] + b[1]) * 5e-3, (a[2] + b[2]) * 5e-3), side: "left" });
    }
    if (u >= 19.8 && u < 20.7) list.push({ text: "\u8F74\u529B\u4E00\u589E\u4E00\u51CF", point: V(...this.manifest.cameraAnchorsThree.outriggerColumn).multiplyScalar(0.01), color: C.red, side: "left" });
    if (u >= 23 && u < 25.6) {
      add("\u5185\u5C42\u5E55\u5899", "INNER_FACADE_Z05", V(0.32, 2.6, 0));
      const garden = this.parts.find((p) => p.id === "GARDEN_Z05"), front = this.camera.position.clone().setY(0).normalize();
      const platform = front.multiplyScalar(0.385).setY(garden ? garden.center.y + 3e-3 : 2.405);
      if (garden) platform.add(garden.root.position);
      list.push({ text: "\u7A7A\u4E2D\u82B1\u56ED", point: platform, side: "left" });
    }
    if (u >= 35.3 && u < 36.8) {
      const p = this.parts.find((p2) => p2.id === "TMD_MASS");
      if (p) list.push({ text: "\u5343\u5428\u8D28\u91CF\u5757", point: p.center.clone().add(p.root.position).sub(this.physics.displacementAt(p.center)) });
    }
    if (u >= 37.1 && u < 37.8) {
      const p = this.parts.find((p2) => p2.id === "TMD_DAMPER_PLATE");
      if (p) list.push({ text: "\u56FA\u5B9A\u94DC\u677F", point: p.center.clone(), side: "left" });
    }
    for (const l of list) l.point.add(this.physics.displacementAt(l.point));
    return list;
  }
  dispose() {
    this.scene.traverse((o) => {
      if (o instanceof T6.Mesh || o instanceof T6.Line) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
    this.effects?.dispose();
    this.wind?.dispose();
    this.environment.dispose();
  }
};
export {
  CameraPath,
  PhysicsPlayback,
  World,
  channel,
  pulse,
  stateAt
};
