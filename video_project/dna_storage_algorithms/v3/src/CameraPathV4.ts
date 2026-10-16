/**
 * CameraPathV4
 *
 * A drop-in, read-only camera path for the DNA-storage film.  V3 already
 * passes the numeric continuity checks; V4 keeps the same 300 s station
 * contract while adding a restrained orbital drift, macro push-ins and a
 * wider pull-back for the return/coda.  It is deliberately isolated so the
 * existing V3 master remains a safe fallback.
 *
 * Coordinates are world units and velocities are world units per second.
 * All sampling is pure and deterministic: no wall clock, random state or
 * renderer state is consulted.
 */

export type Vec3 = [number, number, number];

export type CameraSampleV4 = {
  position: Vec3;
  target: Vec3;
  fov: number;
  focusDistance: number;
  rollDeg: number;
  stationIndex: number;
  transition: number;
};

export type StationV4 = {
  id: string;
  start: number;
  end: number;
  origin: Vec3;
};

export const STATIONS_V4: StationV4[] = [
  { id: 'hook', start: 0, end: 18, origin: [0, 0, 0] },
  { id: 'encode', start: 18, end: 44, origin: [20, 0, 0] },
  { id: 'constraints', start: 44, end: 75, origin: [40, 0, 0] },
  { id: 'fountain', start: 75, end: 118, origin: [60, 0, 0] },
  { id: 'wetlab', start: 118, end: 160, origin: [80, 0, 0] },
  { id: 'consensus', start: 160, end: 216, origin: [100, 0, 0] },
  { id: 'model', start: 216, end: 262, origin: [120, 0, 0] },
  { id: 'return', start: 262, end: 290, origin: [140, 0, 0] },
  { id: 'coda', start: 290, end: 300, origin: [160, 0, 0] },
];

type CameraKeyV4 = {
  time: number;
  position: Vec3;
  target: Vec3;
  fov: number;
  focusDistance: number;
  rollDeg: number;
  velocity: Vec3;
  targetVelocity: Vec3;
  fovVelocity: number;
  focusVelocity: number;
  rollVelocity: number;
};

const key = (
  time: number,
  stationX: number,
  px: number,
  py: number,
  pz: number,
  tx: number,
  ty: number,
  tz: number,
  fov: number,
  focusDistance: number,
  rollDeg: number,
  velocity: Vec3,
  targetVelocity: Vec3 = [0.02, 0, 0],
): CameraKeyV4 => ({
  time,
  position: [stationX + px, py, pz],
  target: [stationX + tx, ty, tz],
  fov,
  focusDistance,
  rollDeg,
  velocity,
  targetVelocity,
  fovVelocity: 0,
  focusVelocity: 0,
  rollVelocity: 0,
});

/**
 * The path uses 6 s shared corridors around station boundaries.  Each local
 * station is a shallow arc: the x travel keeps the data handoff moving while
 * y/z and target offsets give the renderer a gentle drone/orbit feel.
 */
export const CAMERA_KEYS_V4: CameraKeyV4[] = [
  // 0:00–0:18 — reveal the phone/drive, then enter the data droplet.
  key(0, 0, -4.6, 3.6, 17.8, -1.2, 0.45, 0, 40.5, 17.1, -0.9, [0.18, -0.05, -0.18]),
  key(7.5, 0, -0.6, 2.55, 15.2, 0.3, 0.35, 0, 39.8, 15.0, -0.2, [0.26, 0.0, 0.02]),
  key(15, 0, 2.9, 3.5, 17.4, 1.1, 0.42, 0, 40.5, 16.7, 0.65, [0.18, 0.05, 0.18]),

  // 0:18–0:44 — a shorter push-in as bits become bases.
  key(21, 20, -2.7, 3.3, 17.3, -1.3, 0.34, 0, 40.5, 16.3, -0.6, [0.16, -0.04, -0.13]),
  key(29, 20, -0.2, 2.05, 14.9, 0.9, 0.36, 0, 39.2, 14.0, 0.0, [0.12, -0.01, -0.06]),
  key(41, 20, 2.7, 3.35, 17.2, 1.9, 0.40, 0, 40.5, 16.4, 0.6, [0.16, 0.04, 0.13]),

  // 0:44–1:15 — orbit the constraint station; the rejection lane remains in
  // the right third of frame instead of being viewed straight on.
  key(47, 40, -2.4, 3.25, 17.1, -1.0, 0.40, 0, 40.5, 16.2, -0.55, [0.15, -0.03, -0.10]),
  key(59.5, 40, 0.0, 2.35, 15.5, 0.8, 0.34, 0, 39.6, 14.8, 0.0, [0.11, 0.0, -0.02]),
  key(72, 40, 2.7, 3.35, 17.1, 1.7, 0.40, 0, 40.5, 16.2, 0.55, [0.15, 0.03, 0.10]),

  // 1:15–1:58 — the widest orbit, then a deliberate macro dive into the
  // missing droplet; the target leads the camera by a fraction of a second.
  key(78, 60, -5.1, 3.9, 18.0, -0.5, 0.50, 0, 40.8, 17.3, -0.9, [0.14, -0.05, -0.05]),
  key(97, 60, 0.0, 1.72, 14.1, 1.0, 0.32, 0, 39.0, 13.5, 0.0, [0.25, 0.0, 0.0]),
  key(115, 60, 5.1, 3.9, 18.0, 1.4, 0.50, 0, 40.8, 17.3, 0.9, [0.14, 0.05, 0.05]),

  // 1:58–2:40 — low, shallow macro pass along the synthesis/flow-cell line.
  key(121, 80, -2.9, 4.75, 16.9, -1.0, 0.35, 0, 41.0, 15.8, -0.55, [0.13, -0.08, -0.08]),
  key(136, 80, -0.35, 3.65, 14.1, 0.55, 0.30, 0, 39.1, 13.5, 0.0, [0.11, -0.03, 0.01]),
  key(150, 80, 2.35, 3.1, 14.8, 1.6, 0.33, 0, 39.5, 14.1, 0.35, [0.12, 0.0, 0.06]),
  key(157, 80, 3.0, 3.6, 17.1, 0.5, 0.40, 0, 40.5, 16.4, 0.65, [0.13, 0.04, 0.10]),

  // 2:40–3:36 — a slow arc around the alignment matrix, keeping the grid
  // readable while the focus distance eases in/out with the read segments.
  key(163, 100, -2.5, 3.45, 17.2, -0.8, 0.38, 0, 40.5, 16.4, -0.55, [0.13, -0.03, -0.10]),
  key(180, 100, -0.1, 2.15, 14.65, 0.95, 0.32, 0, 39.3, 13.9, -0.08, [0.11, 0.0, -0.01]),
  key(203, 100, 1.0, 2.5, 15.0, 0.05, 0.34, 0, 39.6, 14.3, 0.12, [0.08, 0.01, 0.03]),
  key(213, 100, 2.6, 3.4, 17.3, 0.3, 0.40, 0, 40.5, 16.5, 0.60, [0.13, 0.03, 0.10]),

  // 3:36–4:22 — model studio orbit.  Keep this calmer than Fountain so the
  // k-mer/BPE → score → check chain can be read without a whip-pan.
  key(219, 120, -2.5, 3.3, 17.2, -0.8, 0.40, 0, 40.5, 16.5, -0.55, [0.14, -0.03, -0.09]),
  key(239, 120, 0.0, 2.35, 15.6, 0.9, 0.34, 0, 39.5, 14.8, 0.0, [0.10, 0.0, 0.0]),
  key(259, 120, 2.65, 3.3, 17.3, 1.4, 0.40, 0, 40.5, 16.5, 0.55, [0.14, 0.03, 0.09]),

  // 4:22–4:50 — pull back to reveal the full corridor and hand the carrier
  // to the original phone frame.
  key(265, 140, -2.7, 3.6, 18.2, -0.7, 0.45, 0, 40.8, 17.4, -0.6, [0.15, -0.02, -0.10]),
  key(276, 140, 0.0, 3.15, 17.9, 1.0, 0.40, 0, 40.4, 17.0, 0.0, [0.13, 0.0, 0.01]),
  key(287, 140, 2.7, 3.6, 18.2, 1.6, 0.45, 0, 40.8, 17.4, 0.6, [0.15, 0.02, 0.10]),

  // 4:50–5:00 — hold the papers and formula table with a barely perceptible
  // forward drift; no end-of-film snap or frozen-camera cut.
  key(293, 160, -1.8, 3.45, 18.0, -0.2, 0.48, 0, 40.5, 17.2, -0.2, [0.09, 0.0, 0.0]),
  key(296.5, 160, -1.55, 3.40, 17.9, -0.16, 0.46, 0, 40.5, 17.1, -0.08, [0.06, -0.01, 0.0]),
  key(300, 160, -1.25, 3.34, 17.8, -0.10, 0.44, 0, 40.5, 17.0, 0.0, [0.04, -0.005, 0.0]),
];

// Quintic Hermite with zero shared endpoint acceleration gives C2 position,
// target, lens and focus tracks.  It avoids the subtle acceleration kick of
// V3's C1 cubic at station keys without bringing the camera to a stop.
const quintic = (p0: number, p1: number, v0: number, v1: number, u: number, span: number) => {
  const u2 = u * u;
  const u3 = u2 * u;
  const u4 = u3 * u;
  const u5 = u4 * u;
  return (
    (1 - 10 * u3 + 15 * u4 - 6 * u5) * p0 +
    (u - 6 * u3 + 8 * u4 - 3 * u5) * span * v0 +
    (10 * u3 - 15 * u4 + 6 * u5) * p1 +
    (-4 * u3 + 7 * u4 - 3 * u5) * span * v1
  );
};

const vectorCubic = (a: Vec3, b: Vec3, va: Vec3, vb: Vec3, u: number, span: number): Vec3 => [
  quintic(a[0], b[0], va[0], vb[0], u, span),
  quintic(a[1], b[1], va[1], vb[1], u, span),
  quintic(a[2], b[2], va[2], vb[2], u, span),
];

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

/** Pure frame sample. Forward/reverse seeking produces identical poses. */
export function sampleCameraV4(timeSec: number): CameraSampleV4 {
  const time = Number.isFinite(timeSec) ? clamp(timeSec, 0, 300) : 0;
  let index = 0;
  while (index < CAMERA_KEYS_V4.length - 2 && time > CAMERA_KEYS_V4[index + 1].time) index += 1;
  const a = CAMERA_KEYS_V4[index];
  const b = CAMERA_KEYS_V4[Math.min(CAMERA_KEYS_V4.length - 1, index + 1)];
  const span = Math.max(1e-6, b.time - a.time);
  const u = clamp((time - a.time) / span, 0, 1);
  const position = vectorCubic(a.position, b.position, a.velocity, b.velocity, u, span);
  const target = vectorCubic(a.target, b.target, a.targetVelocity, b.targetVelocity, u, span);
  const fov = quintic(a.fov, b.fov, a.fovVelocity, b.fovVelocity, u, span);
  const focusDistance = quintic(a.focusDistance, b.focusDistance, a.focusVelocity, b.focusVelocity, u, span);
  const rollDeg = quintic(a.rollDeg, b.rollDeg, a.rollVelocity, b.rollVelocity, u, span);
  const foundStation = STATIONS_V4.findIndex(station => time < station.end);
  const stationIndex = foundStation < 0 ? STATIONS_V4.length - 1 : foundStation;
  let transition = 0;
  for (const station of STATIONS_V4.slice(1)) {
    if (time >= station.start - 3 && time <= station.start + 3) {
      const phase = (time - station.start + 3) / 6;
      transition = phase * phase * (3 - 2 * phase);
      break;
    }
  }
  return {
    position,
    target,
    fov: clamp(fov, 38.7, 41.1),
    focusDistance: clamp(focusDistance, 12.2, 18.8),
    rollDeg: clamp(rollDeg, -1.1, 1.1),
    stationIndex,
    transition,
  };
}

/** Alias for integrations that swap V3/V4 through a common camera import. */
export const sampleCamera = sampleCameraV4;
export const STATIONS = STATIONS_V4;

