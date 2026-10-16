import * as THREE from 'three';

type CupState = { fill: number; colorA: string; colorB: string; mix: number; t: number; finalColor?: string };

const R_OUT = 1.1, R_IN = 1.0, BASE = 0.12, H = 1.8, RIM_Y = 1.72;
const MENISCUS = 0.035;

const topVert = /* glsl */ `
uniform float uMen;
varying vec2 vP;
varying vec3 vN;
varying vec3 vView;
void main() {
  vec3 p = position;
  float r = length(p.xz);
  float e = smoothstep(0.82, 1.0, r);
  p.y += uMen * e * e;
  float d = uMen * 2.0 * e * (6.0 * (r - 0.82) / 0.18 * (1.0 - (r - 0.82) / 0.18)) / 0.18;
  d = r > 0.82 ? d : 0.0;
  vec3 n = normalize(vec3(-d * p.x / max(r, 1e-4), 1.0, -d * p.z / max(r, 1e-4)));
  vN = normalize(normalMatrix * n);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = -mv.xyz;
  vP = p.xz;
  gl_Position = projectionMatrix * mv;
}`;

const topFrag = /* glsl */ `
uniform vec3 uA; uniform vec3 uB; uniform vec3 uFinal; uniform float uMix; uniform float uT;
varying vec2 vP; varying vec3 vN; varying vec3 vView;
void main() {
  float r = length(vP);
  float a = atan(vP.y, vP.x);
  float s = 1.0 - uMix;
  // deterministic two-arm swirl, tightened & faded as mix -> 1
  float tw = a * 2.0 + r * (5.0 + 4.0 * uMix) * s - uT * 0.7 + 1.3 * sin(r * 3.0 + uT * 0.4);
  float band = sin(tw) + 0.35 * sin(tw * 2.0 + r * 4.0);
  float w = smoothstep(-0.55 * (1.0 + 2.0 * uMix), 0.55 * (1.0 + 2.0 * uMix), band);
  // At mix=0 the whole surface is exactly A. Incoming pigment grows continuously
  // from the pour footprint; switching the second-stage colors cannot pop a band.
  float ingress = smoothstep(0.0, 0.30, uMix);
  float spread = smoothstep(0.02, 0.58, uMix);
  float footprint = 1.0 - smoothstep(0.16 + 0.70 * spread, 0.40 + 0.75 * spread, r);
  vec3 swirl = mix(uA, uB, w * ingress * footprint);
  // Once distributed, the visual analogy relaxes to its chosen shared result.
  // This is an artistic pigment illustration, not an optical mixing solver.
  vec3 base = mix(swirl, uFinal, smoothstep(0.16, 1.0, uMix));
  vec3 n = normalize(vN);
  vec3 v = normalize(vView);
  vec3 l = normalize(vec3(0.35, 0.85, 0.45));
  float dif = 0.72 + 0.28 * max(dot(n, l), 0.0);
  float spec = pow(max(dot(n, normalize(l + v)), 0.0), 60.0) * 0.12;
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0) * 0.08;
  float edge = 1.0 - 0.18 * smoothstep(0.88, 1.0, r);  // soft contact shading at wall
  vec3 col = base * dif * edge + vec3(spec + fres);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function cupProfile(): THREE.Vector2[] {
  const p: [number, number][] = [
    [0, BASE], [0.9, BASE], [0.97, BASE + 0.02], [R_IN, BASE + 0.07],
    [R_IN, RIM_Y], [1.006, RIM_Y + 0.04], [1.025, RIM_Y + 0.066], [1.05, H - 0.004],
    [1.075, RIM_Y + 0.066], [1.094, RIM_Y + 0.04], [R_OUT, RIM_Y],
    [R_OUT, 0.08], [1.088, 0.025], [1.05, 0.0], [0, 0],
  ];
  return p.map(([x, y]) => new THREE.Vector2(x, y));
}

export class PigmentCup {
  root: THREE.Group;
  private cupGeo: THREE.LatheGeometry;
  private cupMat: THREE.MeshPhysicalMaterial;
  private topGeo: THREE.RingGeometry;
  private topMat: THREE.ShaderMaterial;
  private top: THREE.Mesh;
  private cA = new THREE.Color();
  private cB = new THREE.Color();

  constructor() {
    this.root = new THREE.Group();
    this.root.name = 'PigmentCup';

    this.cupGeo = new THREE.LatheGeometry(cupProfile(), 128);
    this.cupGeo.computeVertexNormals();
    this.cupMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color('#efe6d4'),
      roughness: 0.42,
      metalness: 0,
      clearcoat: 0.6,
      clearcoatRoughness: 0.18,
      sheen: 0.15,
      sheenColor: new THREE.Color('#fff6e8'),
      side: THREE.DoubleSide,
    });
    const cup = new THREE.Mesh(this.cupGeo, this.cupMat);
    cup.castShadow = true;
    cup.receiveShadow = true;
    this.root.add(cup);

    this.topGeo = new THREE.RingGeometry(0.0001, 1, 128, 28);
    this.topGeo.rotateX(-Math.PI / 2);
    this.topMat = new THREE.ShaderMaterial({
      vertexShader: topVert,
      fragmentShader: topFrag,
      uniforms: {
        uA: { value: new THREE.Color('#d8443a') },
        uB: { value: new THREE.Color('#2f6fc4') },
        uFinal: { value: new THREE.Color("#85715f") },
        uMix: { value: 0 },
        uT: { value: 0 },
        uMen: { value: MENISCUS },
      },
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    this.top = new THREE.Mesh(this.topGeo, this.topMat);
    this.top.renderOrder = 1;
    this.root.add(this.top);

    this.setState({ fill: 0.7, colorA: '#d8443a', colorB: '#2f6fc4', mix: 0, t: 0 });
  }

  setState({ fill, colorA, colorB, mix, t, finalColor }: CupState): void {
    const f = THREE.MathUtils.clamp(Number.isFinite(fill) ? fill : 0, 0, 1);
    this.top.visible = f > 0.001;
    const minY = BASE + 0.075, maxY = RIM_Y - 0.1;
    const y = THREE.MathUtils.lerp(minY, maxY, f);
    // inner radius near the floor fillet is slightly smaller
    const rad = (y < BASE + 0.07 ? 0.97 : R_IN) - 0.004;
    this.top.position.set(0, y, 0);
    this.top.scale.set(rad, 1, rad);

    this.cA.setStyle(colorA);
    this.cB.setStyle(colorB);
    const u = this.topMat.uniforms;
    (u.uFinal.value as THREE.Color).set(finalColor ?? colorB);
    (u.uA.value as THREE.Color).copy(this.cA);
    (u.uB.value as THREE.Color).copy(this.cB);
    u.uMix.value = THREE.MathUtils.clamp(Number.isFinite(mix) ? mix : 0, 0, 1);
    u.uT.value = Number.isFinite(t) ? t : 0; // pure function of t: random-access safe
    u.uMen.value = MENISCUS / Math.max(rad, 0.5);
  }

  dispose(): void {
    this.root.removeFromParent();
    this.cupGeo.dispose();
    this.cupMat.dispose();
    this.topGeo.dispose();
    this.topMat.dispose();
    this.root.clear();
  }
}
