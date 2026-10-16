// src/optics.ts
import * as THREE from "three";
var AIR = { name: "air", refractiveIndex: 1.0003 };
var WATER = (refractiveIndex) => ({ name: "water", refractiveIndex });
var EPS = 1e-9;
var clamp = (x, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, x));
function refractBoundary(direction, outwardNormal, nFrom, nTo) {
  if (!(nFrom > 0) || !(nTo > 0)) throw new Error("Refractive indices must be positive");
  const d = direction.clone().normalize();
  let normal = outwardNormal.clone().normalize();
  const etai = nFrom;
  const etat = nTo;
  let cosi = clamp(-d.dot(normal));
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
  const q = clamp(impactParameter, -0.999999, 0.999999);
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
function verifyPath(path, radius = 1) {
  const surface = [path.entrance, path.firstHit, path.secondHit, path.exit];
  const maxSurfaceResidual = Math.max(...surface.map((p) => Math.abs(p.length() - radius)));
  const unitDirectionResidual = Math.abs(path.outgoing.length() - 1);
  const incoming = path.points[1].clone().sub(path.points[0]).normalize();
  const inside = path.points[2].clone().sub(path.points[1]).normalize();
  const exitInside = path.points.at(-2).clone().sub(path.points.at(-3)).normalize();
  const sinToNormal = (d, n) => d.clone().cross(n.clone().normalize()).length();
  const entrySnellResidual = Math.abs(AIR.refractiveIndex * sinToNormal(incoming, path.entrance) - path.refractiveIndex * sinToNormal(inside, path.entrance));
  const exitSnellResidual = Math.abs(path.refractiveIndex * sinToNormal(exitInside, path.exit) - AIR.refractiveIndex * sinToNormal(path.outgoing, path.exit));
  const reflectionResiduals = [];
  for (let i = 2; i < path.points.length - 2; i++) {
    const before = path.points[i].clone().sub(path.points[i - 1]).normalize();
    const after = path.points[i + 1].clone().sub(path.points[i]).normalize();
    reflectionResiduals.push(reflect(before, path.points[i]).distanceTo(after));
  }
  return { maxSurfaceResidual, unitDirectionResidual, entrySnellResidual, exitSnellResidual, maxReflectionResidual: Math.max(0, ...reflectionResiduals) };
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
function rainbowAngleFor(name) {
  const sample = SPECTRUM.find((s) => s.name === name);
  if (!sample) throw new Error(`Unknown spectrum colour: ${name}`);
  return findPrimaryExtremum(sample.refractiveIndex, 512).rainbowAngleDeg;
}
export {
  AIR,
  SPECTRUM,
  WATER,
  findPrimaryExtremum,
  findSecondaryExtremum,
  rainbowAngleFor,
  reflect,
  refractBoundary,
  sphereHit,
  tracePrimary,
  traceSecondary,
  verifyPath
};
