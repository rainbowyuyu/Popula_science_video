import * as T from 'three';
import { flowingCurve } from '../CameraPath';
import type { CinematicCamera, CinematicShot, V15Aspect, Vec3 } from './CinematicShot';
import { V15_FPS, V15_MAIN_SHOTS, V15_VERTICAL_SHOTS } from './v15Shots';

export type V15CameraPose = {
  position: T.Vector3;
  target: T.Vector3;
  fov: number;
  roll: number;
  shot: CinematicShot;
};

type NumericKey = { frame: number; position: Vec3; target: Vec3; fov: number; roll: number };
type Curve = (frame: number) => number;

/**
 * Standalone V15 camera evaluator. It uses the same C2 `flowingCurve` helper
 * as V14, but never instantiates the V14 CameraPath or reads its timeline.
 * That keeps this registry seekable and makes the 9:16 edit an independent
 * camera rather than a crop of the 16:9 frame.
 */
export class V15CameraPath {
  readonly fps = V15_FPS;
  readonly aspect: V15Aspect;
  readonly shots: readonly CinematicShot[];
  private readonly curves: Record<'px' | 'py' | 'pz' | 'tx' | 'ty' | 'tz' | 'fov' | 'roll', Curve>;

  constructor(aspect: V15Aspect = '16:9', shots?: readonly CinematicShot[]) {
    this.aspect = aspect;
    this.shots = shots ?? (aspect === '16:9' ? V15_MAIN_SHOTS : V15_VERTICAL_SHOTS);
    if (this.shots.length === 0) throw new Error('V15 camera path requires at least one shot');
    const keys: NumericKey[] = this.shots.map((shot) => ({
      frame: shot.startFrame,
      position: shot.camera.position,
      target: shot.camera.target,
      fov: shot.camera.fov,
      roll: shot.camera.roll ?? 0,
    }));
    const last = this.shots[this.shots.length - 1];
    keys.push({
      frame: last.endFrame,
      position: last.camera.position,
      target: last.camera.target,
      fov: last.camera.fov,
      roll: last.camera.roll ?? 0,
    });
    const times = keys.map((key) => key.frame);
    this.curves = {
      px: flowingCurve(times, keys.map((key) => key.position[0])),
      py: flowingCurve(times, keys.map((key) => key.position[1])),
      pz: flowingCurve(times, keys.map((key) => key.position[2])),
      tx: flowingCurve(times, keys.map((key) => key.target[0])),
      ty: flowingCurve(times, keys.map((key) => key.target[1])),
      tz: flowingCurve(times, keys.map((key) => key.target[2])),
      fov: flowingCurve(times, keys.map((key) => key.fov)),
      roll: flowingCurve(times, keys.map((key) => key.roll)),
    };
  }

  get durationFrames(): number {
    return this.shots[this.shots.length - 1].endFrame;
  }

  get durationSeconds(): number {
    return this.durationFrames / this.fps;
  }

  /** Return the shot owning a frame. End frames belong to the next shot. */
  shotAt(frame: number): CinematicShot {
    const bounded = Math.max(0, Math.min(this.durationFrames - 1, frame));
    return this.shots.find((shot) => bounded >= shot.startFrame && bounded < shot.endFrame) ?? this.shots[this.shots.length - 1];
  }

  /** Evaluate a C2 camera pose at a frame; fractional frames are supported. */
  at(frame: number): V15CameraPose {
    const c = this.curves;
    const shot = this.shotAt(frame);
    return {
      position: new T.Vector3(c.px(frame), c.py(frame), c.pz(frame)),
      target: new T.Vector3(c.tx(frame), c.ty(frame), c.tz(frame)),
      fov: c.fov(frame),
      roll: c.roll(frame),
      shot,
    };
  }

  atSeconds(seconds: number): V15CameraPose {
    return this.at(seconds * this.fps);
  }

  /** Apply a V15 pose to a Three.js perspective camera. */
  apply(camera: T.PerspectiveCamera, frame: number): V15CameraPose {
    const pose = this.at(frame);
    camera.clearViewOffset();
    camera.position.copy(pose.position);
    camera.rotation.set(0, 0, 0);
    camera.lookAt(pose.target);
    if (pose.roll) camera.rotateZ(pose.roll);
    camera.fov = pose.fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    return pose;
  }
}

export const V15_MAIN_CAMERA = new V15CameraPath('16:9');
export const V15_VERTICAL_CAMERA = new V15CameraPath('9:16');

export function v15CameraFor(aspect: V15Aspect = '16:9'): V15CameraPath {
  return aspect === '16:9' ? V15_MAIN_CAMERA : V15_VERTICAL_CAMERA;
}

/** Convert authored tuples to Three.js vectors without exposing mutable data. */
export function cameraPoseFromShot(camera: CinematicCamera): Omit<V15CameraPose, 'shot'> {
  return {
    position: new T.Vector3(...camera.position),
    target: new T.Vector3(...camera.target),
    fov: camera.fov,
    roll: camera.roll ?? 0,
  };
}
