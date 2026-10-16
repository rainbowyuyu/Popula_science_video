import * as T from 'three';
import {timeline} from './Timeline';
import {sampleOutdoorTransform} from './OpticsWorld';

/**
 * Camera path for the V05 rainbow reconstruction.
 *
 * The path is deliberately kept in the same world as OpticsWorld: the
 * observer is near (0, 1.5, 7), the optical drop is near (32, 2.6, 0), and
 * every handoff travels between those locations instead of replacing a
 * scene.  This module is additive; CameraPath.ts remains the V04 renderer's
 * entry point until the V05 composition opts into this path.
 */

export type V05Vec3 = readonly [number, number, number];

export type V05HandoffId =
  | 'hook'
  | 'position'
  | 'gaussian-entry'
  | 'drop-hero'
  | 'ray-exit'
  | 'cone'
  | 'horizon'
  | 'observer'
  | 'secondary'
  | 'fountain'
  | 'return'
  | 'references';

export type V05CameraAnchor = {
  id: V05HandoffId;
  /** Intended time in the 300 second V05 master timeline. */
  seconds: number;
  position: V05Vec3;
  target: V05Vec3;
  fov: number;
};

export type V05CameraSample = {
  frame: number;
  seconds: number;
  segment: number;
  segmentProgress: number;
  position: V05Vec3;
  target: V05Vec3;
  /** Camera orientation produced by a shortest-path quaternion slerp. */
  quaternion: T.Quaternion;
  fov: number;
};

export type V05CameraOptions = {
  /** Total frame count of the active render; keeps 297.7s and 300s masters aligned. */
  totalFrames?: number;
  /** Keep the existing outdoor rig's observer lift/side shift when desired. */
  applyLegacyOutdoorTransform?: boolean;
  /** Match the V04 subtitle clearance during the elevated-circle passage. */
  subtitleClearance?: boolean;
};

export const V05_MASTER_SECONDS = 320.745;
export const V05_MAX_TRANSLATION_MPS = 2.4;
export const V05_MAX_YAW_DEGREES_PER_SECOND = 32;
export const V05_MAX_FOV_DEGREES_PER_SECOND = 10;

const FPS = timeline.fps || 30;
const WORLD_UP = new T.Vector3(0, 1, 0);

const vec = (value: V05Vec3) => new T.Vector3(value[0], value[1], value[2]);
const tuple = (value: T.Vector3): V05Vec3 => [value.x, value.y, value.z];
const clamp = (x: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, x));
const smoother = (x: number) => {
  const t = clamp(x);
  // Quintic smoothstep keeps the handoff velocity at both anchors at zero.
  return t * t * t * (t * (t * 6 - 15) + 10);
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * Eleven bounded segments, represented by twelve anchors.  The times are
 * normalized to the actual timeline duration by handoffFrames(), so a 297.7s
 * preview and the 300s V05 master share exactly the same shot proportions.
 */
export const V05_HANDOFF_ANCHORS: readonly V05CameraAnchor[] = [
  {
    id: 'hook', seconds: 0,
    position: [0.15, 2.20, 10.50], target: [0, 3.05, -7], fov: 64,
  },
  {
    id: 'position', seconds: 31.99,
    position: [3.20, 3.25, 13.00], target: [0, 2.75, -2], fov: 57,
  },
  {
    id: 'gaussian-entry', seconds: 65.705,
    position: [29.80, 3.75, 9.20], target: [31.90, 2.60, 0], fov: 44,
  },
  {
    id: 'drop-hero', seconds: 98.065,
    position: [34.50, 3.25, 5.20], target: [32.00, 2.60, 0], fov: 38,
  },
  {
    id: 'ray-exit', seconds: 135.95,
    position: [27.80, 3.55, 8.10], target: [30.90, 2.60, 0], fov: 43,
  },
  {
    id: 'cone', seconds: 165.62,
    position: [11.00, 8.10, 22.00], target: [0, 2.65, 0], fov: 45,
  },
  {
    id: 'horizon', seconds: 195.325,
    position: [1.20, 2.60, 11.20], target: [0, 3.00, -8], fov: 64,
  },
  {
    id: 'observer', seconds: 208.665,
    position: [9.00, 6.00, 21.00], target: [0, 2.70, 1], fov: 49,
  },
  {
    id: 'secondary', seconds: 237.335,
    position: [2.00, 3.65, 17.20], target: [0, 3.10, -5], fov: 61,
  },
  {
    id: 'fountain', seconds: 277.885,
    position: [3.20, 3.45, 16.00], target: [0, 3.00, -5], fov: 59,
  },
  {
    id: 'return', seconds: 315.745,
    position: [0.60, 2.35, 11.50], target: [0, 3.00, -6], fov: 63,
  },
  {
    id: 'references', seconds: 320.745,
    position: [0.15, 2.20, 10.50], target: [0, 3.10, -7], fov: 64,
  },
] as const;

export const V05_SEGMENT_COUNT = V05_HANDOFF_ANCHORS.length - 1;

/** Frame anchors after fitting the nominal 300s path to the active timeline. */
export function handoffFrames(totalFrames = timeline.duration): readonly number[] {
  return V05_HANDOFF_ANCHORS.map((anchor) => Math.round(
    clamp(anchor.seconds / V05_MASTER_SECONDS) * totalFrames,
  ));
}

function lookQuaternion(position: T.Vector3, target: T.Vector3): T.Quaternion {
  // Object3D.lookAt handles the camera's -Z convention and keeps world-up
  // stable. The temporary object is allocation-only at module initialization.
  const object = new T.Object3D();
  object.position.copy(position);
  object.up.copy(WORLD_UP);
  object.lookAt(target);
  return object.quaternion.clone();
}

function segmentIndex(frame: number, frames: readonly number[]): number {
  if (frame <= frames[0]) return 0;
  for (let i = 0; i < frames.length - 1; i += 1) {
    if (frame < frames[i + 1]) return i;
  }
  return frames.length - 2;
}

function secant(a: T.Vector3, b: T.Vector3, dt: number): T.Vector3 {
  return b.clone().sub(a).multiplyScalar(1 / Math.max(1e-6, dt));
}

/** Monotone Hermite tangent: no axis can overshoot its neighboring anchors. */
function tangentAt(index: number, values: readonly T.Vector3[], times: readonly number[]): T.Vector3 {
  if (index === 0) return secant(values[0], values[1], times[1] - times[0]);
  if (index === values.length - 1) return secant(values[index - 1], values[index], times[index] - times[index - 1]);
  const before = secant(values[index - 1], values[index], times[index] - times[index - 1]);
  const after = secant(values[index], values[index + 1], times[index + 1] - times[index]);
  const result = new T.Vector3();
  for (const axis of ['x', 'y', 'z'] as const) {
    const a = before[axis];
    const b = after[axis];
    // A sign change means a local extremum; flatten its tangent there.
    result[axis] = a * b <= 0 ? 0 : Math.sign(a) * Math.min(Math.abs((a + b) * 0.5), 3 * Math.min(Math.abs(a), Math.abs(b)));
  }
  return result;
}

function hermite(p0: T.Vector3, p1: T.Vector3, m0: T.Vector3, m1: T.Vector3, dt: number, t: number): T.Vector3 {
  const u = smoother(t);
  // Tangents are in units/second; scale by the segment duration for Hermite.
  const h00 = 2 * u * u * u - 3 * u * u + 1;
  const h10 = u * u * u - 2 * u * u + u;
  const h01 = -2 * u * u * u + 3 * u * u;
  const h11 = u * u * u - u * u;
  return p0.clone().multiplyScalar(h00)
    .add(m0.clone().multiplyScalar(h10 * dt))
    .add(p1.clone().multiplyScalar(h01))
    .add(m1.clone().multiplyScalar(h11 * dt));
}

function boundedHermite(
  p0: T.Vector3,
  p1: T.Vector3,
  m0: T.Vector3,
  m1: T.Vector3,
  dt: number,
  t: number,
): T.Vector3 {
  const result = hermite(p0, p1, m0, m1, dt, t);
  // The tangent limiter above should prevent overshoot; this final clamp is a
  // guard against numerical drift and makes the bound explicit to callers.
  result.x = clamp(result.x, Math.min(p0.x, p1.x), Math.max(p0.x, p1.x));
  result.y = clamp(result.y, Math.min(p0.y, p1.y), Math.max(p0.y, p1.y));
  result.z = clamp(result.z, Math.min(p0.z, p1.z), Math.max(p0.z, p1.z));
  return result;
}

function boundedFov(a: number, b: number, segmentSeconds: number, t: number): number {
  const value = mix(a, b, smoother(t));
  const maxDelta = V05_MAX_FOV_DEGREES_PER_SECOND * segmentSeconds;
  return clamp(value, Math.min(a, b) - maxDelta, Math.max(a, b) + maxDelta);
}

function boundedQuaternionSlerp(q0: T.Quaternion, q1: T.Quaternion, segmentSeconds: number, t: number): T.Quaternion {
  const angle = q0.angleTo(q1);
  if (angle < 1e-7) return q0.clone();
  const maxProgress = (T.MathUtils.degToRad(V05_MAX_YAW_DEGREES_PER_SECOND) * segmentSeconds) / angle;
  // The linear cap is only active when an unusually large handoff would
  // otherwise exceed the angular budget. It starts at zero, so it cannot
  // introduce a rotational pop at the anchor.
  const easedProgress = smoother(t);
  const rateLimitedProgress = Math.min(easedProgress, maxProgress * clamp(t));
  return q0.clone().slerp(q1, clamp(rateLimitedProgress));
}

function applyTranslationLimit(value: T.Vector3, from: T.Vector3, dtSeconds: number): T.Vector3 {
  const delta = value.clone().sub(from);
  const maxDistance = V05_MAX_TRANSLATION_MPS * Math.max(0, dtSeconds);
  if (delta.lengthSq() <= maxDistance * maxDistance || maxDistance <= 0) return value;
  return from.clone().add(delta.normalize().multiplyScalar(maxDistance));
}

const anchorPositions = V05_HANDOFF_ANCHORS.map((anchor) => vec(anchor.position));
const anchorTargets = V05_HANDOFF_ANCHORS.map((anchor) => vec(anchor.target));
const anchorQuaternions = V05_HANDOFF_ANCHORS.map((anchor, index) => lookQuaternion(anchorPositions[index], anchorTargets[index]));

/**
 * Sample the V05 path at an integer frame. This is deterministic and safe for
 * random-access Remotion renders; no mutable previous-frame state is needed.
 */
export function sampleV05Camera(frame: number, totalFrames = timeline.duration): V05CameraSample {
  const frames = handoffFrames(totalFrames);
  const safeFrame = clamp(frame, 0, Math.max(0, totalFrames));
  const index = segmentIndex(safeFrame, frames);
  const startFrame = frames[index];
  const endFrame = Math.max(startFrame + 1, frames[index + 1]);
  const segmentFrames = endFrame - startFrame;
  const progress = clamp((safeFrame - startFrame) / segmentFrames);
  const segmentSeconds = segmentFrames / FPS;
  const times = V05_HANDOFF_ANCHORS.map((anchor) => anchor.seconds);
  const positionTangents = anchorPositions.map((_, i) => tangentAt(i, anchorPositions, times));
  const targetTangents = anchorTargets.map((_, i) => tangentAt(i, anchorTargets, times));
  const position = boundedHermite(anchorPositions[index], anchorPositions[index + 1], positionTangents[index], positionTangents[index + 1], times[index + 1] - times[index], progress);
  const target = boundedHermite(anchorTargets[index], anchorTargets[index + 1], targetTangents[index], targetTangents[index + 1], times[index + 1] - times[index], progress);
  const quaternion = boundedQuaternionSlerp(anchorQuaternions[index], anchorQuaternions[index + 1], segmentSeconds, progress);
  const fov = boundedFov(V05_HANDOFF_ANCHORS[index].fov, V05_HANDOFF_ANCHORS[index + 1].fov, segmentSeconds, progress);
  const previous = progress <= 0 ? position : boundedHermite(anchorPositions[index], anchorPositions[index + 1], positionTangents[index], positionTangents[index + 1], times[index + 1] - times[index], Math.max(0, progress - 1 / segmentFrames));
  const limitedPosition = applyTranslationLimit(position, previous, 1 / FPS);
  return {
    frame: safeFrame,
    seconds: safeFrame / FPS,
    segment: index,
    segmentProgress: progress,
    position: tuple(limitedPosition),
    target: tuple(target),
    quaternion,
    fov,
  };
}

/**
 * Apply the path to an existing Three.js camera. Legacy outdoor lift/shift is
 * opt-in because V05 anchors already include their own observer crane move.
 */
export function applyV05Camera(
  camera: T.PerspectiveCamera,
  frame: number,
  options: V05CameraOptions = {},
): V05CameraSample {
  const sample = sampleV05Camera(frame, options.totalFrames ?? timeline.duration);
  const position = new T.Vector3(...sample.position);
  const target = new T.Vector3(...sample.target);
  if (options.applyLegacyOutdoorTransform) {
    const outdoor = sampleOutdoorTransform(frame);
    position.x += outdoor.shift * 0.25;
    position.y += outdoor.lift;
    target.x += outdoor.shift * 0.7;
    target.y += outdoor.lift;
  }
  if (options.subtitleClearance) {
    const clearance = 1.9 * smoother((frame - 5460) / 55) * (1 - smoother((frame - 5610) / 65));
    target.y -= clearance;
  }
  camera.position.copy(position);
  camera.quaternion.copy(sample.quaternion);
  camera.fov = sample.fov;
  camera.updateProjectionMatrix();
  return {...sample, position: tuple(position), target: tuple(target)};
}

/** Simple static QA data for the V05 motion audit. */
export function v05CameraLimits() {
  return {
    segments: V05_SEGMENT_COUNT,
    maxTranslationMps: V05_MAX_TRANSLATION_MPS,
    maxYawDegreesPerSecond: V05_MAX_YAW_DEGREES_PER_SECOND,
    maxFovDegreesPerSecond: V05_MAX_FOV_DEGREES_PER_SECOND,
    handoffIds: V05_HANDOFF_ANCHORS.map((anchor) => anchor.id),
  } as const;
}

