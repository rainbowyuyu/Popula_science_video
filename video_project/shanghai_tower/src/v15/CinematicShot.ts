/**
 * V15's transport-neutral shot description.
 *
 * The registry intentionally contains only authored intent (timing, camera,
 * transition and data mode). Rendering code can consume this type from
 * Remotion, Three.js or Blender without importing the legacy V14 timeline.
 */
export type V15Aspect = '16:9' | '9:16';
export type CinematicAspect = V15Aspect | 'both';
export type CinematicTransition =
  | 'photo-model'
  | 'gaussian'
  | 'blueprint-3d'
  | 'orbit'
  | 'dive';
export type CinematicDataMode = 'solver' | 'illustrative';

export type Vec3 = [number, number, number];

export type CinematicCamera = {
  /** World-space position in the existing Shanghai Tower metre/100 rig. */
  position: Vec3;
  /** World-space look-at target in the same rig. */
  target: Vec3;
  /** Perspective vertical field of view in degrees. */
  fov: number;
  /** Optional renderer focus identifier (model anchor, not a screen pixel). */
  focus?: string;
  /** Optional bank angle for a drone-style move, in radians. */
  roll?: number;
};

export type CinematicShot = {
  id: string;
  /** Inclusive start frame at the registry's declared fps. */
  startFrame: number;
  /** Exclusive end frame at the registry's declared fps. */
  endFrame: number;
  camera: CinematicCamera;
  transition: CinematicTransition;
  /** A stable model/scene anchor used by labels and handoff code. */
  anchor?: string;
  aspect: CinematicAspect;
  dataMode?: CinematicDataMode;
  /** Human-readable chapter used by narration and editorial tooling. */
  chapter?: string;
  /** A short intent string for reviewers and preview overlays. */
  intent?: string;
};

export type V15ShotManifest = {
  version: 'v15';
  fps: number;
  durationFrames: number;
  durationSeconds: number;
  mainAspect: '16:9';
  verticalAspect: '9:16';
  shots: CinematicShot[];
};

export function assertCinematicShot(shot: CinematicShot): CinematicShot {
  if (!shot.id.trim()) throw new Error('V15 shot id cannot be empty');
  if (!Number.isInteger(shot.startFrame) || !Number.isInteger(shot.endFrame)) {
    throw new Error(`V15 shot ${shot.id} must use integer frame boundaries`);
  }
  if (shot.endFrame <= shot.startFrame) {
    throw new Error(`V15 shot ${shot.id} has an empty frame range`);
  }
  if (!Number.isFinite(shot.camera.fov) || shot.camera.fov <= 0 || shot.camera.fov >= 180) {
    throw new Error(`V15 shot ${shot.id} has an invalid camera FOV`);
  }
  return shot;
}

export function validateShotSequence(shots: CinematicShot[], expectedAspect?: CinematicAspect): void {
  if (shots.length === 0) throw new Error('V15 shot sequence cannot be empty');
  const ordered = [...shots].sort((a, b) => a.startFrame - b.startFrame);
  ordered.forEach(assertCinematicShot);
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    if (current.startFrame !== previous.endFrame) {
      throw new Error(
        `V15 shot gap/overlap between ${previous.id} and ${current.id}: ` +
        `${previous.endFrame} -> ${current.startFrame}`,
      );
    }
  }
  if (expectedAspect) {
    for (const shot of ordered) {
      if (shot.aspect !== expectedAspect && shot.aspect !== 'both') {
        throw new Error(`V15 shot ${shot.id} is ${shot.aspect}, expected ${expectedAspect}`);
      }
    }
  }
}
