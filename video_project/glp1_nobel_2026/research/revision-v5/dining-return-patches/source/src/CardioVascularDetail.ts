// Adapted from the local hypertension V8 model; geometry remapped to physical metres.
import * as T from 'three';

/**
 * Anatomically anchored teaching details.  Local dimensions are deliberately
 * microscopic relative to the atlas.  These are mechanism illustrations, not
 * patient-specific CFD, a pressure measurement, or a molecular simulation.
 *
 * Both models are deterministic functions of their supplied time/progress.
 * The owner places their roots in the one atlas coordinate system, then moves
 * the camera toward them.  No model translates with, or is attached to, a lens.
 */
const TAU = Math.PI * 2;
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => { const t = clamp(v); return t * t * t * (t * (t * 6 - 15) + 10); };
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const phase = (x: number) => ((x % 1) + 1) % 1;
const col = {red: '#ad4944', inner: '#e8afa4', muscle: '#b8756b', adventitia: '#dbc7b4', teal: '#508e91', paleTeal: '#a6c9c5', gold: '#bba06a', cream: '#e8d9b9', ink: '#395b60'};

function material(color: T.ColorRepresentation, opacity = 1, roughness = .5) {
  return new T.MeshStandardMaterial({color, roughness, metalness: .025, transparent: true, opacity, depthWrite: opacity > .7});
}

function sphere(radius: number, mat: T.Material, detail = 16) {
  const m = new T.Mesh(new T.SphereGeometry(radius, detail, Math.max(10, Math.round(detail * .7))), mat);
  m.castShadow = false; return m;
}

function tube(points: T.Vector3[], radius: number, mat: T.Material, segments = 52) {
  return new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points), segments, radius, 8, false), mat);
}

function disposeTree(root: T.Object3D) {
  const geometries = new Set<T.BufferGeometry>(); const materials = new Set<T.Material>();
  root.traverse(o => {
    const mesh = o as T.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    if (mesh.material) (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => materials.add(m));
  });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
  root.removeFromParent();
}

/** Closed, layered vessel with one persistent longitudinal viewing window. */
function cutawayGeometry(length: number, inner: number, outer: number, nx = 64, nt = 36) {
  // The retained posterior 210 degrees exposes the lumen to a camera at +Z.
  const start = Math.PI * .915, span = Math.PI * 1.17;
  const positions: number[] = [], indices: number[] = [];
  for (let surface = 0; surface < 2; surface++) {
    for (let i = 0; i <= nx; i++) for (let j = 0; j <= nt; j++) {
      const a = start + span * j / nt, r = surface ? inner : outer;
      positions.push(length * (i / nx - .5), Math.cos(a) * r, Math.sin(a) * r);
    }
  }
  const n = (nx + 1) * (nt + 1);
  for (let s = 0; s < 2; s++) for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
    const a = s * n + i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1;
    indices.push(...(s ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
  }
  for (const i of [0, nx]) for (let j = 0; j < nt; j++) {
    const a = i * (nt + 1) + j, b = a + 1; indices.push(a, b, a + n, b, b + n, a + n);
  }
  for (const j of [0, nt]) for (let i = 0; i < nx; i++) {
    const a = i * (nt + 1) + j, b = a + nt + 1; indices.push(a, a + n, b, b, a + n, b + n);
  }
  const geometry = new T.BufferGeometry();
  geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return {geometry, base: Float32Array.from(positions), outer, inner, nx, nt, n, length, start, span};
}

type Shell = ReturnType<typeof cutawayGeometry>;
type VesselContinuation = {
  mesh: T.Mesh;
  base: Float32Array;
  centers: Float32Array;
  /** End wall follows exactly the same deformation as the exposed lumen. */
  anchorX: number;
  referenceRadius: number;
};
type PressureArrow = {root: T.Group; shaft: T.Mesh; tip: T.Mesh; angle: number; x: number; upstream: boolean};

export type ArterioleState = {
  time: number;
  /** Fade only while outside the camera view; scene motion belongs to owner. */
  activation?: number;
  /** Smooth-muscle contraction: 0 resting to 1 strongly narrowed. */
  constriction?: number;
  /** Normalized teaching pressure; intentionally has no clinical units. */
  pressure?: number;
  /** Optional externally solved pulse, 0 to 1. */
  pulse?: number;
  /** Integrated transit phase supplied by the owner for constant volume flux. */
  flowPhase?: number;
  /** 0 tissue context, 1 cutaway close-up; changes transparency, never position. */
  detail?: number;
};

export class ArterioleDetail {
  readonly root = new T.Group();
  private shells: Shell[] = [];
  private shellMeshes: T.Mesh[] = [];
  private muscleRings: {root: T.Group; x: number; band: T.Mesh}[] = [];
  private continuations: VesselContinuation[] = [];
  private cellMesh: T.InstancedMesh;
  private plasmaMesh: T.InstancedMesh;
  /** Small, phase-locked tracers make the direction of the lumen flow legible
   * without adding a second, unrelated vessel. Their positions use the same
   * cumulative-volume map as the red cells below. */
  private flowTracers: T.InstancedMesh;
  private arrows: PressureArrow[] = [];
  private streams: T.Line[] = [];
  private pulseRings: {mesh: T.Mesh; offset: number}[] = [];
  private fixedMaterials = new Map<T.Material, number>();
  private dummy = new T.Object3D();
  private radius = .158;
  private length = 2.12;

  constructor() {
    this.root.name = 'representative-200um-arteriole';
    this.root.scale.setScalar(100e-6 / .158);
    this.root.userData = {lumenDiameterMetres:200e-6,redCellDiameterMetres:7.5e-6,representative:true};
    const wallLayers: [number, number, string, number][] = [
      [.158, .170, col.inner, .96],
      [.172, .212, col.muscle, .94],
      [.214, .235, col.adventitia, .28],
    ];
    for (const [inner, outer, color, opacity] of wallLayers) {
      const shell = cutawayGeometry(this.length, inner, outer);
      const mat = material(color, opacity, .52); mat.side = T.DoubleSide;
      const mesh = new T.Mesh(shell.geometry, mat); mesh.name = ['endothelial-lining', 'smooth-muscle-wall', 'outer-connective-tissue'][this.shells.length];
      this.shells.push(shell); this.shellMeshes.push(mesh); this.root.add(mesh);
    }
    // The parent and daughter walls share the exposed vessel's end radii.
    // A rounded, progressively closing cutaway replaces the abrupt red cuff.
    // These are illustrative continuations of this arteriole, not another organ.
    for (const side of [-1, 1]) for (let layer = 0; layer < wallLayers.length; layer++) {
      const [inner, outer, color] = wallLayers[layer];
      const mat = material(color, layer === 2 ? .22 : .96, .57); mat.side = T.DoubleSide;
      const nx = 30, nt = 48, positions: number[] = [], centers: number[] = [], indices: number[] = [];
      const endX = side * this.length * .5;
      for (let surface = 0; surface < 2; surface++) for (let i = 0; i <= nx; i++) {
        const u = i / nx, close = ease(u / .82), x = endX + side * u * (side < 0 ? .71 : .28);
        const cy = side < 0 ? .025 * u * u : 0, cz = -.035 * u * u;
        const taper = side < 0 ? lerp(1, 1.07, ease(u)) : lerp(1, .77, ease(u));
        const start = lerp(this.shells[0].start, Math.PI * .5, close);
        const span = lerp(this.shells[0].span, TAU, close);
        for (let j = 0; j <= nt; j++) {
          const a = start + span * j / nt, r = (surface ? inner : outer) * taper;
          positions.push(x, cy + Math.cos(a) * r, cz + Math.sin(a) * r); centers.push(x, cy, cz);
        }
      }
      const n = (nx + 1) * (nt + 1);
      for (let s = 0; s < 2; s++) for (let i = 0; i < nx; i++) for (let j = 0; j < nt; j++) {
        const a = s * n + i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1;
        indices.push(...(s ? [a, b, c, b, d, c] : [a, c, b, b, c, d]));
      }
      for (const i of [0, nx]) for (let j = 0; j < nt; j++) {
        const a = i * (nt + 1) + j, b = a + 1; indices.push(a, b, a + n, b, b + n, a + n);
      }
      for (const j of [0, nt]) for (let i = 0; i < nx; i++) {
        const a = i * (nt + 1) + j, b = a + nt + 1; indices.push(a, a + n, b, b, a + n, b + n);
      }
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, mat); mesh.name = `${side < 0 ? 'parent' : 'daughter'}-continuous-wall-${layer}`; this.root.add(mesh);
      this.continuations.push({mesh, base: Float32Array.from(positions), centers: Float32Array.from(centers), anchorX: endX, referenceRadius: outer});
    }
    const branchMat = material(col.muscle, .96, .56); branchMat.side = T.DoubleSide;
    const addBranch = (points: T.Vector3[], radii: number[], anchorX: number, name: string) => {
      const curve = new T.CatmullRomCurve3(points), ns = 44, nt = 24, frames = curve.computeFrenetFrames(ns, false);
      const positions: number[] = [], centers: number[] = [], indices: number[] = [];
      for (let i = 0; i <= ns; i++) {
        const u = i / ns, p = curve.getPointAt(u), radius = lerp(radii[0], radii[1], ease(u));
        for (let j = 0; j <= nt; j++) {
          const a = j / nt * TAU;
          const q = p.clone().addScaledVector(frames.normals[i], Math.cos(a) * radius).addScaledVector(frames.binormals[i], Math.sin(a) * radius);
          positions.push(q.x, q.y, q.z); centers.push(p.x, p.y, p.z);
        }
      }
      for (let i = 0; i < ns; i++) for (let j = 0; j < nt; j++) {
        const a = i * (nt + 1) + j, b = a + 1, c = a + nt + 1, d = c + 1; indices.push(a, c, b, b, c, d);
      }
      const geometry = new T.BufferGeometry(); geometry.setAttribute('position', new T.Float32BufferAttribute(positions, 3));
      geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, branchMat); mesh.name = name; this.root.add(mesh);
      this.continuations.push({mesh, base: Float32Array.from(positions), centers: Float32Array.from(centers), anchorX, referenceRadius: .235});
    };
    // Oblique, tapering branches continue downstream; all roots remain buried
    // in the matching parent wall during the full contraction cycle.
    for (const side of [-1, 1]) {
      addBranch([V(-1.57, side * .12, -.045), V(-1.46, side * .27, -.055), V(-1.30, side * .47, -.07), V(-1.12, side * .58, -.10)], [.089, .051], -1.06, `upstream-side-branch-${side}`);
      addBranch([V(1.28, side * .065, -.031), V(1.39, side * .15, -.046), V(1.56, side * .29, -.07), V(1.78, side * .36, -.105)], [.127, .077], 1.06, `downstream-tapered-branch-${side}`);
    }

    // Individual circumferential muscle bundles follow the vessel wall.
    for (let i = 0; i < 14; i++) {
      const x = -1.0 + i / 13 * 2.0, ring = new T.Group(); ring.position.x = x;
      const muscle = cutawayGeometry(.053, .204, .221, 3, 48);
      const bandMat = material(i % 2 ? '#b98076' : '#b5776d', .94, .64); bandMat.side = T.DoubleSide;
      const band = new T.Mesh(muscle.geometry, bandMat); band.name = 'embedded-circumferential-muscle-bundle'; ring.add(band);
      this.root.add(ring); this.muscleRings.push({root: ring, x, band});
    }

    const cells = new T.SphereGeometry(.005925, 16, 10), cp = cells.attributes.position as T.BufferAttribute;
    for (let i = 0; i < cp.count; i++) {
      const rr = Math.hypot(cp.getX(i), cp.getZ(i)) / .005925;
      cp.setY(i, cp.getY(i) * (.24 + .32 * Math.min(1, rr * rr)));
    }
    cells.computeVertexNormals();
    this.cellMesh = new T.InstancedMesh(cells, material('#a94140', 1, .4), 58);
    this.cellMesh.name = 'red-cells-move-downstream-continuously'; this.cellMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.cellMesh.frustumCulled = false; this.root.add(this.cellMesh);
    this.plasmaMesh = new T.InstancedMesh(new T.SphereGeometry(.0042, 7, 5), material('#d9bda6', .55, .7), 76);
    this.plasmaMesh.instanceMatrix.setUsage(T.DynamicDrawUsage); this.plasmaMesh.frustumCulled = false; this.root.add(this.plasmaMesh);
    // Pale teal tracers sit just inside the endothelial lining. They are not
    // extra blood cells: each is a short, soft marker for the local velocity
    // direction, so the viewer can follow transport while the lumen narrows.
    this.flowTracers = new T.InstancedMesh(new T.SphereGeometry(.0065, 8, 5), material('#77aaa4', .66, .62), 24);
    this.flowTracers.name = 'phase-locked-lumen-flow-tracers'; this.flowTracers.instanceMatrix.setUsage(T.DynamicDrawUsage); this.flowTracers.frustumCulled = false; this.root.add(this.flowTracers);
    for (let j = 0; j < 6; j++) {
      const g = new T.BufferGeometry().setFromPoints(Array.from({length: 65}, () => V()));
      const l = new T.Line(g, new T.LineBasicMaterial({color: j % 2 ? '#caa68a' : col.paleTeal, transparent: true, opacity: .30, depthWrite: false}));
      this.root.add(l); this.streams.push(l);
    }

    // Pressure acts normal to the wall, on every side. Paired upstream/downstream
    // arrow coronas reveal the gradient without an unconnected floating gauge.
    for (const x of [-.74, .76]) for (let j = 0; j < 5; j++) {
      const a = .97 * Math.PI + j / 4 * 1.06 * Math.PI;
      const root = new T.Group(), arrowMat = material(x < 0 ? '#ad6553' : col.teal, .85, .42);
      const shaft = new T.Mesh(new T.CylinderGeometry(.0065, .0065, 1, 12), arrowMat);
      const tip = new T.Mesh(new T.ConeGeometry(.018, .038, 16), arrowMat);
      root.add(shaft, tip); root.quaternion.setFromUnitVectors(V(0, 1, 0), V(0, Math.cos(a), Math.sin(a))); this.root.add(root);
      this.arrows.push({root, shaft, tip, angle: a, x, upstream: x < 0});
    }
    for (let i = 0; i < 3; i++) {
      const arc = Array.from({length: 49}, (_, j) => {
        const a = Math.PI * .90 + Math.PI * 1.2 * j / 48; return V(0, Math.cos(a), Math.sin(a));
      });
      const mesh = tube(arc, .015, material('#c69373', .16, .65), 48); this.root.add(mesh); this.pulseRings.push({mesh, offset: i / 3});
    }
    this.root.traverse(o => {
      const mesh = o as T.Mesh; if (!mesh.material) return;
      (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(m => this.fixedMaterials.set(m, m.opacity));
    });
    this.update({time: 0, activation: 0});
  }

  private point(p: T.Vector3) { this.root.updateWorldMatrix(true, false); return this.root.localToWorld(p); }
  get focus() { return this.point(V(.08, 0, 0)); }
  get branchFocus() { return this.point(V(-1.22, .02, -.03)); }
  get muscleFocus() { return this.point(V(.15, -.15, -.04)); }
  get inletFocus() { return this.point(V(-.74, 0, 0)); }
  get outletFocus() { return this.point(V(.76, 0, 0)); }
  get localExtent() { return V(3.50, 1.65, .85); }

  update(state: ArterioleState) {
    const time = state.time, active = clamp(state.activation ?? 1), contract = clamp(state.constriction ?? 0), pressure = clamp(state.pressure ?? .5), detail = clamp(state.detail ?? 1);
    const beat = clamp(state.pulse ?? Math.exp(-Math.pow((phase(time * 1.16) - .19) / .13, 2)));
    this.root.visible = active > .00001;
    this.fixedMaterials.forEach((opacity, mat) => { mat.opacity = opacity * active; });
    const lumen = (x: number) => {
      const envelope = .55 + .45 * Math.exp(-Math.pow(x / .81, 6));
      return this.radius * (1 - contract * .39 * envelope) * (1 + .023 * beat * (1 - .52 * contract));
    };
    const outer = (x: number, baseRadius: number) => Math.sqrt(lumen(x) ** 2 + baseRadius ** 2 - this.radius ** 2);
    this.shells.forEach((shell, index) => {
      const attr = shell.geometry.attributes.position as T.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const x = shell.base[i * 3], originalRadius = i >= shell.n ? shell.inner : shell.outer;
        const r = outer(x, originalRadius), f = r / originalRadius;
        attr.setXYZ(i, x, shell.base[i * 3 + 1] * f, shell.base[i * 3 + 2] * f);
      }
      attr.needsUpdate = true; shell.geometry.computeVertexNormals();
      if (index === 2) (this.shellMeshes[index].material as T.Material).opacity = active * lerp(.42, .14, detail);
    });
    this.muscleRings.forEach(ring => {
      const r = outer(ring.x, .219) / .219;
      // The contraction travels as a gentle proximal-to-distal wave. The
      // bundles remain in their measured axial positions; only their radial
      // thickness and restrained warm highlight change with the teaching
      // constriction, so the cause and the narrowed lumen stay co-located.
      const localWave = contract * (.55 + .45 * Math.exp(-Math.pow((ring.x / .81), 6))) *
        (.72 + .28 * Math.sin(time * 2.2 - ring.x * .9));
      ring.root.scale.set(1 + contract * .15, r * (1 - .045 * localWave), r * (1 - .045 * localWave));
      const bandMaterial = ring.band.material as T.MeshStandardMaterial;
      bandMaterial.emissive.set(localWave > .02 ? '#8f4d46' : '#000000');
      bandMaterial.emissiveIntensity = .04 + .10 * localWave;
      bandMaterial.opacity = active * (.82 + .12 * localWave);
    });
    this.continuations.forEach(part => {
      const attr = part.mesh.geometry.attributes.position as T.BufferAttribute;
      for (let i = 0; i < attr.count; i++) {
        const x = part.base[i * 3], cy = part.centers[i * 3 + 1], cz = part.centers[i * 3 + 2];
        // Recompute each shell radius separately: the connector's cut edge then
        // matches the central intima/media/adventitia, including at peak pulse.
        const radial = Math.hypot(part.base[i * 3 + 1] - cy, part.base[i * 3 + 2] - cz);
        const endRadius = part.referenceRadius;
        const scale = outer(part.anchorX, endRadius) / endRadius;
        const isWall = part.mesh.name.includes('continuous-wall');
        const u = Math.abs(x - part.anchorX) / (part.anchorX < 0 ? .71 : .28);
        const taper = part.anchorX < 0 ? lerp(1, 1.07, ease(u)) : lerp(1, .77, ease(u));
        const normalizedRadius = radial / (isWall ? taper : 1);
        const f = isWall ? outer(part.anchorX, normalizedRadius) / Math.max(1e-8, normalizedRadius) : scale;
        attr.setXYZ(i, x, cy * scale + (part.base[i * 3 + 1] - cy) * f, cz * scale + (part.base[i * 3 + 2] - cz) * f);
      }
      attr.needsUpdate = true; part.mesh.geometry.computeVertexNormals();
      if (part.mesh.name.endsWith('continuous-wall-2')) (part.mesh.material as T.Material).opacity = active * lerp(.42, .14, detail);
    });
    // A cumulative volume map keeps the flux uniform along the narrowed region.
    // For equal flow across changing conditions, the owner integrates the phase
    // rate inversely with this segment's mean normalized cross-sectional area.
    // Reading an integrated phase, instead of dividing absolute time by changing
    // volume, prevents discontinuities and backward motion during constriction.
    const cumulative = [0], n = 96;
    for (let i = 1; i <= n; i++) { const x = this.length * ((i - .5) / n - .5); cumulative.push(cumulative[i - 1] + lumen(x) ** 2 / n); }
    const volume = cumulative[n];
    const xAt = (u: number) => {
      const wanted = u * volume; let lo = 0, hi = n;
      while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (cumulative[mid] < wanted) lo = mid; else hi = mid; }
      return this.length * ((lo + (wanted - cumulative[lo]) / Math.max(1e-9, cumulative[hi] - cumulative[lo])) / n - .5);
    };
    const particles = (mesh: T.InstancedMesh, offset: number, speed: number, radial: number) => {
      for (let i = 0; i < mesh.count; i++) {
        const u = phase(i / mesh.count + (state.flowPhase ?? time * .081) * speed / .081 + offset), x = xAt(u), a = i * 2.39996323;
        const r = lumen(x) * radial * Math.sqrt(.07 + .89 * phase(i * .754877666));
        this.dummy.position.set(x, Math.cos(a) * r, Math.sin(a) * r);
        this.dummy.rotation.set(.4 * Math.sin(time * .4 + i), i * .723 + time * .3, i * .25 + time * .17);
        const scale = ease(Math.min(u, 1 - u) / .035) * (.79 + .25 * phase(i * .618033989));
        this.dummy.scale.setScalar(scale); this.dummy.updateMatrix(); mesh.setMatrixAt(i, this.dummy.matrix);
      }
      mesh.instanceMatrix.needsUpdate = true;
    };
    particles(this.cellMesh, .09, .081, .76); particles(this.plasmaMesh, .31, .094, .84);
    for (let i = 0; i < this.flowTracers.count; i++) {
      // The tracer phase is driven by the integrated flow phase, not wall
      // clock time. The +x direction is therefore preserved through a
      // constriction and at the frame wrap.
      const u = phase(i / this.flowTracers.count + (state.flowPhase ?? time * .081) * .081 / .081 + .18);
      const x = xAt(u), a = i * 2.39996323 + .34;
      const r = lumen(x) * (.78 + .08 * phase(i * .754877666));
      this.dummy.position.set(x, Math.cos(a) * r, Math.sin(a) * r);
      this.dummy.rotation.set(0, 0, Math.atan2(Math.sin(a), Math.cos(a)));
      this.dummy.scale.set(.75 + .25 * Math.sin(Math.PI * u), .75, .75);
      this.dummy.updateMatrix(); this.flowTracers.setMatrixAt(i, this.dummy.matrix);
    }
    this.flowTracers.instanceMatrix.needsUpdate = true;
    this.streams.forEach((stream, j) => {
      const attr = stream.geometry.attributes.position as T.BufferAttribute, a = j / this.streams.length * TAU + .2;
      for (let i = 0; i < attr.count; i++) {
        const u = i / (attr.count - 1), x = this.length * (u - .5);
        // A small helical offset reveals axial direction and keeps the six
        // streamlines from reading as frozen rings. The path remains inside
        // the actual lumen and follows its pressure-driven radius.
        const sweep = .010 * Math.sin(TAU * (u + (state.flowPhase ?? 0) * .11) + j * .8);
        const r = lumen(x) * (.46 + sweep);
        attr.setXYZ(i, x, Math.cos(a + sweep) * r, Math.sin(a + sweep) * r);
      }
      attr.needsUpdate = true;
    });
    this.arrows.forEach(arrow => {
      const magnitude = arrow.upstream ? .50 + pressure * .22 + contract * .45 : .40 + pressure * .14 - contract * .16;
      const len = .055 + .15 * magnitude + .019 * beat, radius = outer(arrow.x, .24);
      arrow.root.position.set(arrow.x, Math.cos(arrow.angle) * radius, Math.sin(arrow.angle) * radius);
      arrow.shaft.scale.set(1, len, 1); arrow.shaft.position.y = len * .5; arrow.tip.position.y = len + .012;
    });
    this.pulseRings.forEach(({mesh, offset}) => {
      const u = phase(time * .38 + offset), x = -.93 + u * 1.86, radius = outer(x, .253) + .012 * Math.sin(Math.PI * u);
      mesh.position.x = x; mesh.scale.set(1, radius, radius);
      (mesh.material as T.Material).opacity = active * .27 * Math.sin(Math.PI * u) ** 2;
    });
  }

  dispose() { disposeTree(this.root); }
}

