import * as T from 'three';
import {cue, timeline, clamp} from './Timeline';

type V = [number, number, number];
export type Pose = {position: V; target: V; fov: number};
type K = Pose & {t: number};
const at = (id: string, fraction = 0) => {
  const c = cue(id);
  return c.startSec + (c.endSec - c.startSec) * fraction;
};
const key = (t: number, position: V, target: V, fov = 40): K => ({t, position, target, fov});

/** One physical table: close phone -> shared route -> cups -> certificate -> order. */
export function cameraKeys(): K[] {
  return [
    // Restrained product arc: readable screen, real bevel and glass.
    key(0, [-3.7, 9.6, 8.6], [-5.4, .55, 1.2], 37),
    key(at('s01', .65), [-4.8, 9.3, 8.2], [-5.45, .6, 1.2], 37),
    key(at('s02', .42), [-6.0, 9.2, 8.0], [-5.5, .6, 1.2], 38),
    // Reveal the other endpoint only after the narration introduces it.
    key(at('s03', .22), [-.4, 11.6, 17.5], [-2.0, 1.5, .5], 41),
    key(at('s04', .30), [1.2, 12.1, 22.2], [0, 2.1, .8], 42),
    // Documents share a foreground plane; preserve the whole comparison.
    key(at('s05', .30), [.8, 10.4, 20.3], [.5, 3.3, 5.8], 41),
    key(at('s06', .28), [.4, 10.0, 19.8], [.3, 3.4, 5.9], 41),
    key(at('s07', .44), [2.3, 10.2, 20.0], [1.5, 3.4, 5.9], 41),
    key(at('s08', .35), [1.0, 11.3, 21.4], [.2, 3.5, 3.6], 41),
    key(at('s09', .55), [.0, 11.1, 21.0], [0, 3.5, 3.6], 41),
    key(at('s10', .56), [-.8, 10.8, 20.5], [-.6, 3.5, 3.5], 41),
    key(at('s11', .55), [.0, 11.7, 20.4], [0, 2.2, 1.8], 41),
    // Bring both cups closer while keeping both private bottles in frame.
    key(at('s12', .55), [.1, 11.8, 14.8], [0, 1.7, .5], 41),
    key(at('s13', .55), [.2, 11.6, 14.4], [0, 1.8, .3], 41),
    key(at('s14', .50), [-1.7, 10.8, 13.7], [-1.35, 1.5, .7], 41),
    key(at('s15', .50), [1.7, 10.8, 13.7], [1.35, 1.5, .7], 41),
    key(at('s16', .35), [.3, 11.8, 14.2], [0, 1.6, .5], 41),
    // A small rise separates the crossing paths in depth, not a giant zoom.
    key(at('s17', .40), [0, 13.0, 14.4], [0, 1.7, .6], 41),
    key(at('s18', .48), [.4, 12.6, 15.1], [0, 1.5, 1.1], 41),
    key(at('s19', .47), [-1.7, 10.8, 13.7], [-1.35, 1.5, .7], 41),
    key(at('s20', .47), [1.7, 10.8, 13.7], [1.35, 1.5, .7], 41),
    key(at('s21', .38), [.15, 11.4, 14.5], [0, 1.6, .7], 41),
    key(at('s22', .50), [-.4, 10.9, 15.0], [0, 1.8, .8], 41),
    key(at('s23', .48), [.1, 11.4, 17.5], [0, 2.2, 1.7], 41),
    // Stable reading distance, only gentle side drift during certificate checks.
    key(at('s24', .40), [1.3, 10.7, 21.5], [.6, 3.7, 5.2], 41),
    key(at('s25', .30), [1.8, 9.7, 20.5], [1, 4.6, 6.2], 41),
    key(at('s26', .48), [1.0, 9.5, 20.3], [.7, 4.6, 6.2], 41),
    key(at('s27', .45), [1.6, 10.0, 21.2], [1.1, 4.4, 5.9], 41),
    key(at('s28', .42), [.5, 10.7, 22.0], [.3, 3.8, 5.4], 41),
    key(at('s29', .44), [1.0, 10.3, 21.5], [.7, 3.8, 5.7], 41),
    key(at('s30', .47), [2.0, 10.4, 22.1], [1.3, 3.8, 5.7], 41),
    key(at('s31', .44), [1.2, 11.0, 22.5], [.7, 3.8, 5.6], 41),
    key(at('s32', .48), [1.5, 11.6, 20.4], [1.0, 2.9, 3.0], 41),
    key(at('s33', .58), [-1.6, 11.5, 18.4], [-.8, 2.3, 2.0], 40),
    // A broad return arc settles on the original phone for the final line.
    key(at('s34', .40), [-5.1, 10.7, 10.5], [-5.1, 1.0, 1.3], 39),
    key(timeline.coda.startSec, [-5.8, 10.3, 9.7], [-5.35, .8, 1.2], 39),
    key(timeline.durationSec, [-5.9, 10.1, 9.5], [-5.35, .8, 1.2], 39),
  ];
}
const keys = cameraKeys();
const hermite = (a: number, b: number, m0: number, m1: number, t: number, dt: number) => {
  const t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * a + (t3 - 2 * t2 + t) * dt * m0
    + (-2 * t3 + 3 * t2) * b + (t3 - t2) * dt * m1;
};
/** Time-aware Hermite derivatives are shared at every knot: C1 continuity. */
export function sampleCamera(t: number): Pose {
  let i = keys.findIndex((k, n) => n < keys.length - 1 && t < keys[n + 1].t);
  if (i < 0) i = keys.length - 2;
  const a = keys[i], b = keys[i + 1];
  const prev = keys[Math.max(0, i - 1)], next = keys[Math.min(keys.length - 1, i + 2)];
  const dt = b.t - a.t, q = clamp((t - a.t) / dt);
  const scalar = (v: number, w: number, p: number, n: number) =>
    hermite(v, w, (w - p) / (b.t - prev.t), (n - v) / (next.t - a.t), q, dt);
  return {
    position: a.position.map((v, j) => scalar(v, b.position[j], prev.position[j], next.position[j])) as V,
    target: a.target.map((v, j) => scalar(v, b.target[j], prev.target[j], next.target[j])) as V,
    fov: scalar(a.fov, b.fov, prev.fov, next.fov),
  };
}
export function applyCamera(camera: T.PerspectiveCamera, t: number) {
  const p = sampleCamera(t);
  camera.position.set(...p.position);camera.up.set(0, 1, 0);camera.lookAt(...p.target);
  camera.fov = p.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
  return p;
}
