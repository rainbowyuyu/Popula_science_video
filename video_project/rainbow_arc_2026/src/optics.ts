import * as THREE from 'three';

/**
 * Geometrical optics used by the rainbow scene.  Directions point in the
 * direction of travel.  Surface normals are outward normals of the sphere.
 * The boundary routine determines the incident side from the dot product and
 * then applies Snell's law with the two explicitly supplied media indices.
 */
export type OpticalMedium = {name: string; refractiveIndex: number};
export type OpticalPath = {
  points: THREE.Vector3[];
  entrance: THREE.Vector3;
  firstHit: THREE.Vector3;
  secondHit: THREE.Vector3;
  exit: THREE.Vector3;
  outgoing: THREE.Vector3;
  scatteringAngleDeg: number;
  rainbowAngleDeg: number;
  impactParameter: number;
  refractiveIndex: number;
  internalReflections: number;
};

export const AIR: OpticalMedium = {name: 'air', refractiveIndex: 1.0003};
export const WATER = (refractiveIndex: number): OpticalMedium => ({name: 'water', refractiveIndex});

const EPS = 1e-9;
const clamp = (x: number, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));

/** Refraction at a dielectric interface. Returns null for total internal reflection. */
export function refractBoundary(
  direction: THREE.Vector3,
  outwardNormal: THREE.Vector3,
  nFrom: number,
  nTo: number,
): THREE.Vector3 | null {
  if (!(nFrom > 0) || !(nTo > 0)) throw new Error('Refractive indices must be positive');
  const d = direction.clone().normalize();
  let normal = outwardNormal.clone().normalize();
  const etai = nFrom;
  const etat = nTo;
  let cosi = clamp(-d.dot(normal));
  // The media are explicit. At an outgoing boundary the normal only needs to
  // be reversed; swapping the media here would apply air→water a second time.
  if (cosi < 0) {
    cosi = -cosi;
    normal.negate();
  }
  const eta = etai / etat;
  const k = 1 - eta * eta * (1 - cosi * cosi);
  if (k < -EPS) return null;
  return d.multiplyScalar(eta)
    .add(normal.multiplyScalar(eta * cosi - Math.sqrt(Math.max(0, k))))
    .normalize();
}

export function reflect(direction: THREE.Vector3, outwardNormal: THREE.Vector3): THREE.Vector3 {
  return direction.clone().reflect(outwardNormal.clone().normalize()).normalize();
}

/** Return the forward intersection of a ray with a unit sphere. */
export function sphereHit(origin: THREE.Vector3, direction: THREE.Vector3, radius = 1): number | null {
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

function nextSphereHit(point: THREE.Vector3, direction: THREE.Vector3, radius: number): THREE.Vector3 | null {
  const t = sphereHit(point.clone().addScaledVector(direction, EPS * 20), direction, radius);
  return t === null ? null : point.clone().addScaledVector(direction, t + EPS * 20);
}

function hitAtImpact(impactParameter: number, radius: number): THREE.Vector3 | null {
  const q = clamp(impactParameter, -0.999999, 0.999999);
  return new THREE.Vector3(-Math.sqrt(1 - q * q) * radius, q * radius, 0);
}

function trace(impactParameter: number, radius: number, nWater: number, internalReflections: 1 | 2): OpticalPath | null {
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
  const points: THREE.Vector3[] = [entry.clone().addScaledVector(incoming, -radius * 1.65), entry.clone(), firstHit.clone()];
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
  // Scattering angle is measured from the original propagation direction.
  // The primary rainbow angle is measured from the backward/anti-solar axis.
  const scatteringAngleDeg = THREE.MathUtils.radToDeg(Math.acos(clamp(outgoing.clone().sub(exit).normalize().dot(incoming))));
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
    internalReflections,
  };
}

/** Primary bow: one internal reflection (entry → reflect → exit). */
export function tracePrimary(impactParameter: number, refractiveIndex: number, radius = 1): OpticalPath | null {
  return trace(impactParameter, radius, refractiveIndex, 1);
}

/** Secondary bow: two internal reflections (entry → reflect → reflect → exit). */
export function traceSecondary(impactParameter: number, refractiveIndex: number, radius = 1): OpticalPath | null {
  return trace(impactParameter, radius, refractiveIndex, 2);
}

export type Extremum = {impactParameter: number; rainbowAngleDeg: number; path: OpticalPath};

/** Scan the valid impact interval and refine the maximum primary bow radius. */
export function findPrimaryExtremum(refractiveIndex: number, samples = 768): Extremum {
  let best: Extremum | null = null;
  for (let i = 1; i < samples; i++) {
    const b = i / samples * .9998;
    const path = tracePrimary(b, refractiveIndex);
    if (!path) continue;
    if (!best || path.rainbowAngleDeg > best.rainbowAngleDeg) best = {impactParameter: b, rainbowAngleDeg: path.rainbowAngleDeg, path};
  }
  if (!best) throw new Error(`No primary rainbow path for n=${refractiveIndex}`);
  // A local ternary search removes the sampling stair-step while preserving
  // the actual ray geometry used by the renderer.
  let lo = Math.max(.0001, best.impactParameter - 2 / samples);
  let hi = Math.min(.9998, best.impactParameter + 2 / samples);
  for (let i = 0; i < 36; i++) {
    const m1 = lo + (hi - lo) / 3;
    const m2 = hi - (hi - lo) / 3;
    const p1 = tracePrimary(m1, refractiveIndex);
    const p2 = tracePrimary(m2, refractiveIndex);
    if (!p1 || !p2) { lo = m1; continue; }
    if (p1.rainbowAngleDeg > p2.rainbowAngleDeg) hi = m2; else lo = m1;
  }
  const b = (lo + hi) / 2;
  const path = tracePrimary(b, refractiveIndex);
  if (!path) throw new Error('Primary extremum refinement failed');
  return {impactParameter: b, rainbowAngleDeg: path.rainbowAngleDeg, path};
}

export function findSecondaryExtremum(refractiveIndex: number, samples = 768): Extremum {
  let best: Extremum | null = null;
  for (let i = 1; i < samples; i++) {
    const b = i / samples * .9998;
    const path = traceSecondary(b, refractiveIndex);
    if (path && (!best || path.rainbowAngleDeg < best.rainbowAngleDeg)) best = {impactParameter: b, rainbowAngleDeg: path.rainbowAngleDeg, path};
  }
  if (!best) throw new Error(`No secondary rainbow path for n=${refractiveIndex}`);
  let lo = Math.max(.0001, best.impactParameter - 2 / samples);
  let hi = Math.min(.9998, best.impactParameter + 2 / samples);
  for (let i = 0; i < 36; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    const p1 = traceSecondary(m1, refractiveIndex)!, p2 = traceSecondary(m2, refractiveIndex)!;
    if (p1.rainbowAngleDeg < p2.rainbowAngleDeg) hi = m2; else lo = m1;
  }
  const b = (lo + hi) / 2, path = traceSecondary(b, refractiveIndex)!;
  return {impactParameter: b, rainbowAngleDeg: path.rainbowAngleDeg, path};
}

export function verifyPath(path: OpticalPath, radius = 1) {
  const surface = [path.entrance, path.firstHit, path.secondHit, path.exit];
  const maxSurfaceResidual = Math.max(...surface.map(p => Math.abs(p.length() - radius)));
  const unitDirectionResidual = Math.abs(path.outgoing.length() - 1);
  const incoming = path.points[1].clone().sub(path.points[0]).normalize();
  const inside = path.points[2].clone().sub(path.points[1]).normalize();
  const exitInside = path.points.at(-2)!.clone().sub(path.points.at(-3)!).normalize();
  const sinToNormal = (d: THREE.Vector3, n: THREE.Vector3) => d.clone().cross(n.clone().normalize()).length();
  const entrySnellResidual = Math.abs(AIR.refractiveIndex * sinToNormal(incoming, path.entrance) - path.refractiveIndex * sinToNormal(inside, path.entrance));
  const exitSnellResidual = Math.abs(path.refractiveIndex * sinToNormal(exitInside, path.exit) - AIR.refractiveIndex * sinToNormal(path.outgoing, path.exit));
  const reflectionResiduals: number[] = [];
  for (let i = 2; i < path.points.length - 2; i++) {
    const before = path.points[i].clone().sub(path.points[i - 1]).normalize();
    const after = path.points[i + 1].clone().sub(path.points[i]).normalize();
    reflectionResiduals.push(reflect(before, path.points[i]).distanceTo(after));
  }
  return {maxSurfaceResidual, unitDirectionResidual, entrySnellResidual, exitSnellResidual, maxReflectionResidual: Math.max(0, ...reflectionResiduals)};
}

export const SPECTRUM = [
  {name: 'red', wavelengthNm: 650, refractiveIndex: 1.331, color: '#ef4b3f'},
  {name: 'orange', wavelengthNm: 600, refractiveIndex: 1.333, color: '#f39a3e'},
  {name: 'yellow', wavelengthNm: 570, refractiveIndex: 1.334, color: '#e8c34b'},
  {name: 'green', wavelengthNm: 530, refractiveIndex: 1.335, color: '#54a67c'},
  {name: 'cyan', wavelengthNm: 500, refractiveIndex: 1.338, color: '#55b4bf'},
  {name: 'blue', wavelengthNm: 460, refractiveIndex: 1.340, color: '#4b82c5'},
  {name: 'violet', wavelengthNm: 410, refractiveIndex: 1.343, color: '#886bb4'},
] as const;

/** Recover the dielectric index from an exact displayed entry segment. This is
 * used to fill a smooth spectral sheet with independently traced intermediate
 * wavelengths instead of warping a strip between seven decorative vertices. */
export function mediumFromDisplayedPath(points: THREE.Vector3[]): {radius: number; impactParameter: number; refractiveIndex: number; internalReflections: 1 | 2} {
  if (points.length !== 5 && points.length !== 6) throw new Error('Expected primary/secondary entry-reflection-exit sequence');
  const radius = points[1].length();
  const incoming = points[1].clone().sub(points[0]).normalize();
  const inside = points[2].clone().sub(points[1]).normalize();
  const normal = points[1].clone().normalize();
  const sinI = incoming.clone().cross(normal).length();
  const sinR = inside.clone().cross(normal).length();
  if (!(radius > 0) || sinR < 1e-8 || incoming.distanceTo(new THREE.Vector3(1, 0, 0)) > 1e-7) throw new Error('Unsupported optical slice coordinate frame');
  return {radius, impactParameter: points[1].y / radius, refractiveIndex: AIR.refractiveIndex * sinI / sinR, internalReflections: points.length === 5 ? 1 : 2};
}

/** Intermediate display rays obey Snell at their own contacts. The original
 * seven input paths remain exact at q=0/1; only endpoint display lengths vary. */
export function interpolateDisplayedSpectralPath(a: THREE.Vector3[], b: THREE.Vector3[], q: number): THREE.Vector3[] {
  const fraction = Math.max(0, Math.min(1, q));
  if (fraction === 0) return a.map(p => p.clone());
  if (fraction === 1) return b.map(p => p.clone());
  const am = mediumFromDisplayedPath(a), bm = mediumFromDisplayedPath(b);
  if (am.internalReflections !== bm.internalReflections || Math.abs(am.radius - bm.radius) > 1e-7) throw new Error('Incompatible spectral slice');
  const n = am.refractiveIndex + (bm.refractiveIndex - am.refractiveIndex) * fraction;
  const impact = am.impactParameter + (bm.impactParameter - am.impactParameter) * fraction;
  const path = am.internalReflections === 1 ? tracePrimary(impact, n, am.radius) : traceSecondary(impact, n, am.radius);
  if (!path) throw new Error('Intermediate spectral path cannot leave the water sphere');
  const incomingLength = a[0].distanceTo(a[1]) + (b[0].distanceTo(b[1]) - a[0].distanceTo(a[1])) * fraction;
  const outgoingLength = a.at(-1)!.distanceTo(a.at(-2)!) + (b.at(-1)!.distanceTo(b.at(-2)!) - a.at(-1)!.distanceTo(a.at(-2)!)) * fraction;
  path.points[0].copy(path.entrance).addScaledVector(new THREE.Vector3(1, 0, 0), -incomingLength);
  path.points.at(-1)!.copy(path.exit).addScaledVector(path.outgoing, outgoingLength);
  return path.points;
}

export function rainbowAngleFor(name: string): number {
  const sample = SPECTRUM.find(s => s.name === name);
  if (!sample) throw new Error(`Unknown spectrum colour: ${name}`);
  return findPrimaryExtremum(sample.refractiveIndex, 512).rainbowAngleDeg;
}

