import * as THREE from 'three';
import {CameraPose, Vec3} from './contracts';

export type RigPose = Pick<CameraPose, 'position' | 'target' | 'fovDeg' | 'focusDistance' | 'rollDeg'>;

const v = (x: Vec3) => new THREE.Vector3(x[0], x[1], x[2]);
const ease = (t: number) => {
  const x = THREE.MathUtils.clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

/**
 * Frame driven camera rig. The rig never reads wall clock time; callers provide
 * a normalized shot progress and an optional orbit amount for a deterministic
 * documentary style camera drift.
 */
export class CameraRigV2 {
  readonly camera: THREE.PerspectiveCamera;
  readonly focus = new THREE.Vector3();
  private readonly position = new THREE.Vector3();
  private readonly target = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
  }

  apply(inPose: CameraPose, outPose: CameraPose, progress: number, orbit = 0, focusPull = 0) {
    const q = ease(progress);
    const p0 = v(inPose.position), p1 = v(outPose.position);
    const t0 = v(inPose.target), t1 = v(outPose.target);
    this.position.lerpVectors(p0, p1, q);
    this.target.lerpVectors(t0, t1, q);

    // A shallow orbit makes the move feel filmed rather than slid. It is tied
    // to shot progress, so it stays reproducible in stills and renders.
    const radius = this.position.distanceTo(this.target);
    const theta = orbit * Math.sin(q * Math.PI);
    const offset = new THREE.Vector3(
      Math.sin(theta) * radius * 0.06,
      (1 - Math.cos(theta)) * radius * 0.025,
      (Math.cos(theta) - 1) * radius * 0.06,
    );
    this.position.add(offset);
    this.camera.position.copy(this.position);
    this.focus.lerpVectors(t0, t1, THREE.MathUtils.clamp(q + focusPull, 0, 1));
    this.camera.lookAt(this.focus);
    const fov = THREE.MathUtils.lerp(inPose.fovDeg ?? 36, outPose.fovDeg ?? 36, q);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();

    const roll = THREE.MathUtils.degToRad(
      THREE.MathUtils.lerp(inPose.rollDeg ?? 0, outPose.rollDeg ?? 0, q),
    );
    // `lookAt` resets the orientation every frame. Assign the roll instead of
    // accumulating it, otherwise a non-zero shot roll slowly drifts while the
    // same frame is rendered repeatedly by Remotion.
    this.camera.rotation.z = roll;
    return {position: this.camera.position.clone(), target: this.focus.clone(), fov};
  }
}
