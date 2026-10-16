import * as T from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** A hand-built timber cottage over a real open stone arch, facing the creek (+Z). */
export type CreekCabin = {update: (seconds: number, night: number) => void; dispose: () => void};

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const rand = (v: number) => {const n = Math.sin(v * 127.1 + 311.7) * 43758.5453123; return n - Math.floor(n);};

export function createCabin(scene: T.Scene): CreekCabin {
  const root = new T.Group();
  root.name = 'creek-cottage-and-open-masonry-arch';
  root.position.set(0, 0, -46);
  scene.add(root);

  const geometries = new Set<T.BufferGeometry>();
  const materials = new Set<T.Material>();
  const textures = new Set<T.Texture>();
  const batches = new Map<T.Material, T.BufferGeometry[]>();
  const mat = (color: T.ColorRepresentation, roughness = .82) => {
    const m = new T.MeshStandardMaterial({color, roughness}); materials.add(m); return m;
  };
  const timber = mat('#614631');
  const timberLight = mat('#806449');
  const timberDark = mat('#302a22');
  const timberMid = mat('#4b3b2e');
  const plaster = mat('#b6ac8b');
  const stoneMortar = mat('#4c5148');
  const stoneMats = ['#6e7264', '#808274', '#74766a', '#62695e', '#949381'].map(c => mat(c, .96));
  const slateMats = ['#344444', '#3c4b49', '#45514c', '#536056', '#394845'].map(c => mat(c, .89));
  const moss = mat('#55643f', 1);
  const metal = new T.MeshStandardMaterial({color: '#332e25', metalness: .5, roughness: .58}); materials.add(metal);
  const glass = new T.MeshStandardMaterial({color: '#bba779', emissive: '#ffb352', emissiveIntensity: .16, roughness: .21, metalness: .06}); materials.add(glass);
  const lamp = new T.MeshStandardMaterial({color: '#fff0b2', emissive: '#ffb44e', emissiveIntensity: .15, roughness: .45}); materials.add(lamp);

  const batch = (g: T.BufferGeometry, m: T.Material) => {const gs = batches.get(m) ?? []; gs.push(g); batches.set(m, gs);};
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: T.Material, rz = 0, ry = 0) => {
    const g = new T.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z); batch(g, m);
  };
  const beam = (a: T.Vector3, b: T.Vector3, w: number, d: number, m: T.Material) => {
    const g = new T.BoxGeometry(w, a.distanceTo(b), d);
    const matrix = new T.Matrix4().compose(a.clone().add(b).multiplyScalar(.5), new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), b.clone().sub(a).normalize()), new T.Vector3(1, 1, 1));
    g.applyMatrix4(matrix); batch(g, m);
  };

  // The dark backing is an actual horseshoe-shaped extruded wall, not a black
  // semicircle pasted on a solid box. Water and the far bank remain visible.
  const archRadius = 2.57, springY = .38, archHeight = 2.11, deckY = 3.12;
  const bridge = new T.Shape();
  bridge.moveTo(-5.65, .12); bridge.lineTo(-5.65, deckY); bridge.lineTo(5.65, deckY); bridge.lineTo(5.65, .12);
  bridge.lineTo(archRadius, .12); bridge.lineTo(archRadius, springY);
  for (let i = 1; i <= 40; i++) {const a = i / 40 * Math.PI; bridge.lineTo(archRadius * Math.cos(a), springY + archHeight * Math.sin(a));}
  bridge.lineTo(-archRadius, .12); bridge.closePath();
  const bridgeGeo = new T.ExtrudeGeometry(bridge, {depth: 6.8, bevelEnabled: false, curveSegments: 32});
  bridgeGeo.translate(0, 0, -4.8); batch(bridgeGeo, stoneMortar);

  // Slightly uneven stone courses leave fine mortar joints and catch grazing light.
  for (const faceZ of [2.06, -4.86]) {
    for (let row = 0; row < 9; row++) {
      const y0 = .13 + row * .326, y = y0 + .15;
      const yy = clamp((y0 - springY) / archHeight);
      const edge = y0 <= springY ? archRadius : (y0 < springY + archHeight ? archRadius * Math.sqrt(1 - yy * yy) : 0);
      for (let col = 0; col < 14; col++) {
        const left = -5.62 + col * .827 + (row % 2 ? .39 : 0), right = Math.min(5.62, left + .794);
        if (left >= 5.62) continue;
        for (const side of [-1, 1]) {
          const a = side < 0 ? left : Math.max(left, edge + .05);
          const b = side < 0 ? Math.min(right, -edge - .05) : right;
          if (b - a < .17) continue;
          box(b - a, .292 + rand(row * 41 + col) * .012, .13, (a + b) / 2, y, faceZ, stoneMats[Math.floor(rand(row * 43 + col + side * 7) * stoneMats.length)]);
        }
      }
    }
  }
  // Radial voussoirs explicitly express how the arch is assembled.
  for (const z of [2.14, -4.95]) {
    for (let i = 0; i < 21; i++) {
      const a0 = i / 21 * Math.PI + .007, a1 = (i + 1) / 21 * Math.PI - .007;
      const wedge = new T.Shape();
      wedge.moveTo(archRadius * Math.cos(a0), springY + archHeight * Math.sin(a0));
      for (let j = 1; j <= 3; j++) {const a = T.MathUtils.lerp(a0, a1, j / 3); wedge.lineTo(archRadius * Math.cos(a), springY + archHeight * Math.sin(a));}
      for (let j = 3; j >= 0; j--) {const a = T.MathUtils.lerp(a0, a1, j / 3); wedge.lineTo((archRadius + .37) * Math.cos(a), springY + (archHeight + .37) * Math.sin(a));}
      wedge.closePath();
      const g = new T.ExtrudeGeometry(wedge, {depth: .14, bevelEnabled: true, bevelSize: .015, bevelThickness: .009, bevelSegments: 1}); g.translate(0, 0, z); batch(g, stoneMats[(i * 3) % stoneMats.length]);
    }
  }
  for (let i = 0; i < 17; i++) box(.66, .19, 7.1, -5.47 + i * .683, 3.19, -1.42, stoneMats[i % stoneMats.length]);
  // Low end parapets and soft moss, leaving the front of the cottage readable.
  for (const side of [-1, 1]) {
    for (let i = 0; i < 5; i++) box(.9, .48, .38, side * (3.15 + i * .51), 3.47, 1.8, stoneMats[(i + 2) % 5]);
    box(2.9, .12, .53, side * 4.3, 3.75, 1.8, stoneMats[4]);
    for (let i = 0; i < 8; i++) box(.22 + rand(i + side) * .41, .018, .18, side * (3.0 + rand(i + 18) * 2.55), 3.82, 1.8, moss, 0, rand(i) * .3);
  }

  // The house has a shallow exposed ground-floor porch and a fully articulated
  // timber front. One common world scale keeps it architectural at every distance.
  const floor = 3.35, wallTop = 7.08, ridge = 9.03, halfW = 2.33;
  const front = -.55, back = -4.17;
  box(4.93, .2, 4.24, 0, floor - .1, -2.23, timberDark);
  // Horizontal clapboard courses: dark core and individual narrow overlapping boards.
  box(4.61, wallTop - floor, 3.6, 0, (floor + wallTop) / 2, -2.35, timberMid);
  for (let i = 0; i < 23; i++) {
    const y = floor + .095 + i * .158;
    box(4.67, .147, .083, 0, y, front + .015, i % 5 === 0 ? timberLight : timber);
    box(4.65, .147, .067, 0, y, back - .025, timber);
    box(.065, .147, 3.63, -halfW - .009, y, -2.35, i % 4 === 0 ? timberLight : timber);
    box(.065, .147, 3.63, halfW + .009, y, -2.35, i % 4 === 0 ? timberLight : timber);
  }
  const gableShape = new T.Shape(); gableShape.moveTo(-halfW, wallTop); gableShape.lineTo(halfW, wallTop); gableShape.lineTo(0, ridge); gableShape.closePath();
  for (const z of [front, back]) {const g = new T.ExtrudeGeometry(gableShape, {depth: .10, bevelEnabled: false}); g.translate(0, 0, z); batch(g, plaster);}
  // Gable board grain is geometry so that fine lines survive both day and dusk.
  for (let i = -12; i <= 12; i++) {
    const x = i * .182, h = (ridge - wallTop) * (1 - Math.abs(x) / halfW);
    if (h > .08) box(.166, h, .025, x, wallTop + h / 2, front + .12, i % 4 === 0 ? timberLight : timber);
  }
  for (const x of [-halfW + .05, 0, halfW - .05]) box(.19, wallTop - floor + .05, .22, x, (wallTop + floor) / 2, front + .145, timberDark);
  for (const y of [floor + .12, floor + 2.12, wallTop]) box(4.78, .19, .25, 0, y, front + .16, timberDark);
  for (const side of [-1, 1]) {
    box(.18, wallTop - floor + .06, .2, side * halfW, (wallTop + floor) / 2, back, timberDark);
    box(.20, .19, 3.83, side * halfW, floor + 2.12, -2.31, timberDark);
    beam(new T.Vector3(side * halfW, wallTop, front + .16), new T.Vector3(0, ridge, front + .16), .18, .21, timberDark);
    beam(new T.Vector3(side * halfW, wallTop, back), new T.Vector3(0, ridge, back), .18, .21, timberDark);
  }
  box(.17, ridge - wallTop, .19, 0, (ridge + wallTop) / 2, front + .17, timberDark);

  const window = (x: number, bottom: number, w: number, h: number, z = front + .18) => {
    box(w + .17, h + .18, .07, x, bottom + h / 2, z, timberDark);
    box(w, h, .018, x, bottom + h / 2, z + .043, glass);
    for (const side of [-1, 1]) box(.065, h + .10, .12, x + side * (w / 2 + .01), bottom + h / 2, z + .075, timberLight);
    for (const y of [bottom - .018, bottom + h + .018]) box(w + .13, .065, .12, x, y, z + .075, timberLight);
    box(.05, h, .085, x, bottom + h / 2, z + .10, timberDark);
    box(w, .043, .087, x, bottom + h * .54, z + .10, timberDark);
    box(w + .24, .073, .23, x, bottom - .087, z + .10, timberLight);
    // Two calm interior curtain slivers give the light something to illuminate.
    for (const side of [-1, 1]) box(.13, h * .92, .026, x + side * (w / 2 - .13), bottom + h * .51, z + .060, plaster);
  };
  window(-1.22, floor + .55, 1.28, 1.18);
  window(1.22, floor + .55, 1.28, 1.18);
  window(-1.12, floor + 2.45, 1.28, .93);
  window(1.12, floor + 2.45, 1.28, .93);
  window(0, wallTop + .35, .68, .77);
  // Narrow centre entrance with individually framed glazed panels.
  box(.81, 1.94, .15, 0, floor + .98, front + .24, timberDark);
  box(.57, 1.13, .026, 0, floor + 1.24, front + .335, glass);
  box(.57, .48, .052, 0, floor + .38, front + .355, timber);
  box(.035, 1.1, .055, 0, floor + 1.24, front + .365, timberLight);
  box(.6, .045, .06, 0, floor + 1.26, front + .365, timberLight);
  box(.036, .1, .045, .27, floor + .84, front + .4, metal);

  // Roof is a pair of pitched planes with overlapping, subtly irregular slate
  // shingles and scalloped rows. There is no cone / four-sided pyramid roof.
  const roofHalfW = 2.79, roofEave = 6.91, roofRidge = 9.20;
  const roofSlope = Math.atan2(roofRidge - roofEave, roofHalfW), slopeLength = Math.hypot(roofHalfW, roofRidge - roofEave);
  for (const side of [-1, 1]) {
    box(slopeLength + .10, .16, 4.65, side * roofHalfW / 2, (roofEave + roofRidge) / 2, -2.27, timberDark, -side * roofSlope);
    for (let row = 0; row < 12; row++) {
      const u = (row + .42) / 12, x = side * roofHalfW * (1 - u), y = roofEave + (roofRidge - roofEave) * u + .12;
      for (let col = 0; col < 15; col++) {
        const z = .006 - col * .309 + (row % 2 ? .08 : -.01);
        box(slopeLength / 12 + .085, .054 + rand(row * 31 + col) * .012, .294, x, y, z, slateMats[Math.floor(rand(row * 33 + col * 5 + side) * slateMats.length)], -side * roofSlope);
      }
    }
    // Projecting fascia, exposed rafter tails and narrow copper gutters.
    for (const z of [.12, -4.69]) beam(new T.Vector3(0, roofRidge + .015, z), new T.Vector3(side * (roofHalfW + .035), roofEave, z), .15, .13, timberLight);
    box(.16, .19, 4.90, side * (roofHalfW + .025), roofEave - .05, -2.26, timberDark);
    for (let i = 0; i < 11; i++) box(.38, .12, .095, side * 2.61, roofEave - .13, -.12 - i * .423, timberMid, -side * roofSlope);
  }
  for (let i = 0; i < 18; i++) box(.26, .14, .295, 0, roofRidge + .105, .21 - i * .284, slateMats[i % 5]);

  // A generous front porch overhang gives a believable threshold / shadow depth.
  box(4.80, .13, .9, 0, floor + 2.27, front + .51, timberDark);
  for (let i = 0; i < 18; i++) box(.24, .058, .96, -2.21 + i * .26, floor + 2.37, front + .52, slateMats[i % 5], -.06);
  for (const x of [-2.14, 2.14]) {
    box(.13, 2.13, .14, x, floor + 1.04, front + .85, timberDark);
    beam(new T.Vector3(x, floor + 1.66, front + .85), new T.Vector3(x + Math.sign(x) * -.42, floor + 2.20, front + .85), .09, .10, timberLight);
  }
  for (let i = 0; i < 18; i++) box(.27, .07, 1.0, -2.28 + i * .27, floor + .04, front + .56, i % 4 ? timber : timberLight);
  // Small hanging lanterns, with glass panes and caps.
  for (const x of [-2.01, 2.01]) {
    box(.024, .28, .024, x, floor + 2.10, front + .59, metal);
    box(.15, .22, .13, x, floor + 1.86, front + .59, lamp);
    for (const y of [floor + 1.725, floor + 1.995]) box(.21, .042, .20, x, y, front + .59, metal);
    for (const dx of [-.08, .08]) for (const dz of [-.075, .075]) box(.014, .25, .014, x + dx, floor + 1.86, front + .59 + dz, metal);
  }
  // Stacked masonry chimney with a tapered weather cap and metal flue.
  const chimneyX = 1.32, chimneyZ = -3.23;
  box(.59, 2.6, .62, chimneyX, 8.28, chimneyZ, stoneMortar);
  for (let row = 0; row < 10; row++) {
    const cy = 7.12 + row * .245;
    for (let i = 0; i < 2; i++) box(.285, .222, .065, chimneyX - .15 + i * .30, cy, chimneyZ + .34, stoneMats[(row + i) % 5]);
    box(.07, .224, .59, chimneyX + .34, cy, chimneyZ, stoneMats[(row + 1) % 5]);
  }
  box(.78, .12, .83, chimneyX, 9.67, chimneyZ, stoneMats[4]);
  box(.40, .2, .42, chimneyX, 9.8, chimneyZ, timberDark);
  box(.55, .065, .55, chimneyX, 9.91, chimneyZ, metal);

  // Merge static craftsmanship into material batches instead of hundreds of draw calls.
  for (const [material, gs] of batches) {
    const merged = mergeGeometries(gs, false);
    for (const g of gs) g.dispose();
    if (!merged) continue;
    merged.computeBoundingSphere(); geometries.add(merged);
    const mesh = new T.Mesh(merged, material); mesh.castShadow = true; mesh.receiveShadow = true; root.add(mesh);
  }
  batches.clear();

  const porchLight = new T.PointLight('#ffc66c', .12, 12, 2); porchLight.position.set(0, floor + 1.3, front + 1.0); root.add(porchLight);
  const upperLight = new T.PointLight('#ffd18c', .04, 7, 2); upperLight.position.set(0, wallTop + .52, front + .6); root.add(upperLight);

  // Soft chimney wisps made with a tiny procedural texture: no external assets,
  // continuous absolute-time drift, no incremental per-frame state.
  const size = 32, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const d = Math.hypot((x + .5) / size * 2 - 1, (y + .5) / size * 2 - 1), i = (y * size + x) * 4;
    pixels[i] = 198; pixels[i + 1] = 202; pixels[i + 2] = 198; pixels[i + 3] = Math.round(Math.pow(Math.max(0, 1 - d), 2.2) * 255);
  }
  const smokeTexture = new T.DataTexture(pixels, size, size); smokeTexture.needsUpdate = true; smokeTexture.magFilter = T.LinearFilter; smokeTexture.minFilter = T.LinearFilter; textures.add(smokeTexture);
  const smoke: T.Sprite[] = [];
  for (let i = 0; i < 7; i++) {const m = new T.SpriteMaterial({map: smokeTexture, transparent: true, opacity: 0, depthWrite: false, color: '#aebbc0'}); materials.add(m); const s = new T.Sprite(m); s.renderOrder = 8; root.add(s); smoke.push(s);}

  return {
    update(seconds, night) {
      const n = clamp(night), glow = n * n * (3 - 2 * n);
      glass.emissiveIntensity = .14 + glow * 2.3;
      glass.color.setRGB(.48 + glow * .16, .36 + glow * .13, .19 + glow * .04);
      lamp.emissiveIntensity = .15 + glow * 3.1;
      porchLight.intensity = .06 + glow * 6.8;
      upperLight.intensity = glow * 2.4;
      for (let i = 0; i < smoke.length; i++) {
        const phase = ((seconds * .072 + i / smoke.length) % 1 + 1) % 1;
        const s = smoke[i]; s.position.set(chimneyX + phase * .66 + Math.sin(seconds * .22 + i * 1.3) * phase * .10, 10 + phase * 2.65, chimneyZ - phase * .22);
        const spread = .27 + phase * 1.65; s.scale.set(spread, spread * 1.22, 1);
        (s.material as T.SpriteMaterial).opacity = Math.sin(phase * Math.PI) * (.095 + glow * .06);
      }
    },
    dispose() {
      root.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
    },
  };
}
