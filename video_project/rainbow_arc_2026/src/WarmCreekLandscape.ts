import * as THREE from 'three';

/**
 * Dense, reusable set dressing for the WarmCreek study. Geometry is generated
 * once, with deterministic seeds, and animated only through a pair of tiny
 * shader uniforms. The parent composition owns the camera, grade and post FX.
 */
export type WarmCreekLandscape = {
  water: THREE.Mesh;
  update: (timeSeconds: number, gold?: number, night?: number) => void;
  dispose: () => void;
};

const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
const hash = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const smooth = (n: number) => {
  const x = clamp(n);
  return x * x * (3 - 2 * x);
};

function bladeGeometry() {
  const segments = 5;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const y = i / segments;
    const width = .09 * (1 - y * .83);
    positions.push(-width, y, 0, width, y, 0);
    uvs.push(0, y, 1, y);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

function bladeMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {uTime: {value: 0}, uGold: {value: 0}, uNight: {value: 0}},
    vertexShader: `
      attribute float aPhase;
      attribute float aAmp;
      uniform float uTime;
      uniform float uGold;
      uniform float uNight;
      varying float vHeight;
      void main(){
        vHeight = uv.y;
        vec3 p = position;
        float h = uv.y;
        float sway = sin(uTime * 1.25 + aPhase) * aAmp * h * h;
        float swayZ = cos(uTime * 1.08 + aPhase * 1.7) * aAmp * .32 * h * h;
        p.x += sway;
        p.z += swayZ;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: `
      varying float vHeight;
      void main(){
        vec3 root = vec3(.12,.24,.12);
        vec3 tip = vec3(.36,.55,.27);
        gl_FragColor = vec4(mix(root, tip, vHeight), .95);
      }
    `,
    side: THREE.DoubleSide,
    transparent: true,
  });
}

function makeSlope(scene: THREE.Scene) {
  const points = 72;
  const segments: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const side of [-1, 1] as const) {
    const start = segments.length / 3;
    for (let i = 0; i <= points; i++) {
      const t = i / points;
      const z = 20 - t * 122;
      const innerX = side * 2.32;
      const outerX = side * (5.0 + .8 * Math.sin(t * 18 + side));
      const innerY = .02 + .05 * Math.sin(t * 11 + side);
      const outerY = 1.02 + .28 * Math.sin(t * 7 + side * 2.3) + .16 * Math.sin(t * 23);
      segments.push(innerX, innerY, z, outerX, outerY, z + .35 * Math.sin(t * 14));
      uvs.push(0, t, 1, t);
    }
    for (let i = 0; i < points; i++) {
      const a = start + i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(segments, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({color: '#4e5e45', roughness: 1});
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'warm-creek-sloped-banks'; scene.add(mesh);
  return mesh;
}

function makeWater(scene: THREE.Scene) {
  const material = new THREE.ShaderMaterial({
    uniforms: {uTime: {value: 0}},
    vertexShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main(){
        vUv = uv;
        vec3 p = position;
        p.z += sin(p.y * .58 + uTime * 1.8 + p.x * 2.5) * .035;
        p.z += sin(p.y * 1.42 - uTime * 1.1 + p.x * 5.1) * .018;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p,1.0);
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec2 vUv;
      void main(){
        float ripple = .5 + .5 * sin(vUv.y * 210.0 - uTime * 2.7 + sin(vUv.x * 18.0 + uTime) * 4.0);
        float glint = pow(max(0., sin(vUv.y * 94.0 + uTime * 2.4 + sin(vUv.x * 12.0) * 8.)), 22.);
        vec3 day = vec3(.025,.19,.22);
        vec3 gold = vec3(.12,.25,.23);
        vec3 night = vec3(.012,.07,.12);
        vec3 col = mix(mix(day,gold,uGold),night,uNight) + vec3(.018,.06,.07) * ripple + vec3(.56,.62,.48) * glint * (.18 + .18*uGold);
        gl_FragColor = vec4(col, .91);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(4.62, 126, 56, 300), material);
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0, -41); water.name = 'warm-creek-water'; scene.add(water);
  return water;
}

function makeGrass(scene: THREE.Scene, count: number) {
  const geometry = bladeGeometry();
  const material = bladeMaterial();
  const blades = new THREE.InstancedMesh(geometry, material, count);
  blades.name = 'warm-creek-thousands-of-grass-blades';
  const phases = new Float32Array(count); const amps = new Float32Array(count);
  const matrix = new THREE.Matrix4(); const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const side: -1 | 1 = i % 2 ? 1 : -1;
    const z = 20 - hash(i * 3.1) * 122;
    const x = side * (2.42 + hash(i * 7.2) * 2.3);
    const y = .08 + hash(i + 3) * .75;
    q.setFromEuler(new THREE.Euler(0, (hash(i + 9) - .5) * .8, (hash(i + 4) - .5) * .26));
    matrix.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(.62 + hash(i + 2) * .9, .6 + hash(i + 8) * 1.7, 1));
    blades.setMatrixAt(i, matrix); phases[i] = hash(i + 11) * Math.PI * 2; amps[i] = .08 + hash(i + 15) * .18;
  }
  blades.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  blades.geometry.setAttribute('aAmp', new THREE.InstancedBufferAttribute(amps, 1));
  blades.instanceMatrix.needsUpdate = true; scene.add(blades); return blades;
}

function makePebbles(scene: THREE.Scene) {
  const count = 520;
  const geometry = new THREE.IcosahedronGeometry(.12, 1);
  const material = new THREE.MeshStandardMaterial({color: '#918876', roughness: .94, vertexColors: true});
  const rocks = new THREE.InstancedMesh(geometry, material, count); rocks.name = 'warm-creek-egg-stone-bank';
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const side: -1 | 1 = i % 2 ? 1 : -1;
    const z = 20 - hash(i * 1.8) * 122;
    const x = side * (2.24 + hash(i * 5.3) * .45);
    const scale = .28 + hash(i * 4.7) * .78;
    m.compose(new THREE.Vector3(x, .05 + scale * .1, z + (hash(i + 2) - .5) * 1.4), q.setFromEuler(new THREE.Euler(hash(i) * 2, hash(i + 1) * 2, hash(i + 2) * 2)), new THREE.Vector3(scale * 1.25, scale * .55, scale));
    rocks.setMatrixAt(i, m); c.setHSL(.08 + hash(i + 7) * .06, .12 + hash(i + 8) * .12, .31 + hash(i + 9) * .2); rocks.setColorAt(i, c);
  }
  rocks.instanceMatrix.needsUpdate = true; if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true; scene.add(rocks); return rocks;
}

function makeTrees(scene: THREE.Scene) {
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.07, .14, 3.5, 7), new THREE.MeshStandardMaterial({color: '#49382d', roughness: 1}), 44);
  const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(.026, .075, 1.45, 6), new THREE.MeshStandardMaterial({color: '#49382d', roughness: 1}), 44 * 3);
  const leaves = new THREE.InstancedMesh(new THREE.SphereGeometry(.25, 7, 5), new THREE.MeshStandardMaterial({color: '#27492e', roughness: .96, vertexColors: true}), 44 * 24);
  trunk.name = 'warm-creek-fine-trunks'; branches.name = 'warm-creek-fine-branches'; leaves.name = 'warm-creek-layered-leaf-clusters';
  const m = new THREE.Matrix4(); const q = new THREE.Quaternion(); const col = new THREE.Color(); const up = new THREE.Vector3(0, 1, 0); let li = 0; let bi = 0;
  for (let i = 0; i < 44; i++) {
    const side: -1 | 1 = i % 2 ? 1 : -1; const z = 18 - hash(i * 2.7) * 117; const x = side * (4.7 + hash(i + 5) * 2.4);
    const h = 3.2 + hash(i + 8) * 3.5; m.compose(new THREE.Vector3(x, h / 2, z), q.setFromEuler(new THREE.Euler(0, hash(i) * 6.28, (hash(i + 2) - .5) * .05)), new THREE.Vector3(1, h / 3.5, 1)); trunk.setMatrixAt(i, m);
    for (let b = 0; b < 3; b++, bi++) {
      const a = hash(i * 17 + b) * Math.PI * 2; const yy = h * (.38 + b * .15) + hash(i + b) * .25;
      const dir = new THREE.Vector3(Math.cos(a) * .82, .3 + hash(i + b + 5) * .42, Math.sin(a) * .82).normalize();
      q.setFromUnitVectors(up, dir); m.compose(new THREE.Vector3(x + dir.x * .32, yy, z + dir.z * .32), q, new THREE.Vector3(1, 1, 1)); branches.setMatrixAt(bi, m);
    }
    for (let j = 0; j < 24; j++, li++) {
      const a = hash(i * 31 + j) * Math.PI * 2; const rad = .7 + hash(i * 37 + j) * 1.35; const yy = h + (hash(i * 41 + j) - .5) * 2.5;
      m.compose(new THREE.Vector3(x + Math.cos(a) * rad, yy, z + Math.sin(a) * rad * .72), q.setFromEuler(new THREE.Euler(hash(j) * 2, a, hash(j + 9) * 2)), new THREE.Vector3(.65 + hash(j + 2) * .7, .65 + hash(j + 3) * .7, .65 + hash(j + 4) * .7)); leaves.setMatrixAt(li, m); col.setHSL(.27 + hash(li + 2) * .08, .34 + hash(li + 1) * .2, .16 + hash(li + 4) * .17); leaves.setColorAt(li, col);
    }
  }
  trunk.instanceMatrix.needsUpdate = true; branches.instanceMatrix.needsUpdate = true; leaves.instanceMatrix.needsUpdate = true; if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true; scene.add(trunk, branches, leaves); return {trunk, branches, leaves};
}

export function createLandscape(scene: THREE.Scene): WarmCreekLandscape {
  const slope = makeSlope(scene); const water = makeWater(scene); const grass = makeGrass(scene, 3200); const pebbles = makePebbles(scene); const trees = makeTrees(scene);
  const animated = [grass.material, water.material].filter((m): m is THREE.ShaderMaterial => m instanceof THREE.ShaderMaterial);
  return {
    water,
    update(timeSeconds: number, gold = 0, night = 0) { for (const m of animated) { m.uniforms.uTime.value = timeSeconds; if (m.uniforms.uGold) m.uniforms.uGold.value = gold; if (m.uniforms.uNight) m.uniforms.uNight.value = night; } },
    dispose() {
      for (const obj of [slope, water, grass, pebbles, trees.trunk, trees.branches, trees.leaves]) { scene.remove(obj); obj.geometry.dispose(); if (Array.isArray(obj.material)) obj.material.forEach((m) => m.dispose()); else obj.material.dispose(); }
    },
  };
}

