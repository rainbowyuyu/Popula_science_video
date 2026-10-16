/** Frame-deterministic camera rail; metres, y-up. Pure, stateless, no external deps. */
export type SceneWindow = { id: string; start: number; end: number };
export type CameraSample = {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
};

type V = [number, number, number];
type Key = { t: number; p: V; q: V; f: number };
type Local = { u: number; p: V; q: V; f: number };

const H: V = [0, 150, 0];                 // hero framing target
const HUB: V = [14, 150, 0];              // tower axis -> rotor orbit centre
const GEN: V = [1, 150, 0];               // generator orbit centre
const CONVERTER: V = [-9.3, 148.65, 1.25];
const STATION: V = [-290, 22, -100];
const LAMP: V = [-940, 9, 55];

// Shared seam anchors: identical values on both sides of a boundary collapse to
// one key in the merged timeline, so the rail stays a single C1 curve (no cut).
// Arrive above the waterline before the rail reaches the large coastal slab;
// a negative-y seam would put the camera under the land mesh and fill the
// frame with its underside during the shore handoff.
const SHORE_IN: V = [-748, 18, 106];
const SHORE_IN_Q: V = [-818, 8, 58];
const SHORE_OUT: V = [-900, 82, 140];

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const key = (u: number, p: V, q: V, f: number): Local => ({ u, p, q, f });
/** Polar placement around a vertical axis: monotone azimuth, constant clearanceto the tower. */
const orbit = (u: number, cx: number, cz: number, r: number, deg: number, y: number, q: V, f: number): Local => {
  const a = (deg * Math.PI) / 180;
  return key(u, [cx + r * Math.cos(a), y, cz + r * Math.sin(a)], q, f);
};

const TRACKS: Record<string, Local[]> = {
  overview: [
    key(0, [-360, 22, 210], [0,110,0], 50),
    key(.12, [-170, 35, 210], [0,108,0], 49),
    key(.195,[65,36,84],[0,5,0],50),
    key(.24,[57,-22,61],[8,-23,-28],50),
    key(.30,[64,-28,38],[7,-43,6],50),
    key(.34,[87,-18,4],[26,-24,-35],51),
    key(.405,[160,24,-83],[250,8,-230],52),
    // Read the triangular float in a low three-quarter orbit before the
    // camera returns along the energy story. No detour to a catalogue board.
    key(.50,[364,48,-92],[250,1,-230],51),
    key(.62,[400,64,-222],[250,5,-230],50),
    key(.73,[378,74,-340],[250,24,-230],50),
    key(.86,[300,65,-95],[110,78,0],50),
    key(1,[250,22,180],[110,25,0],50),
  ],
  hook: [
    key(0,[250,22,180],[110,25,0],50),
    key(.4,[220,85,218],[0,95,0],48),
    key(.75,[160,140,238],H,47),
    key(1,[110,170,230],H,46),
  ],
  wind: [
    key(0, [110, 170, 230], H, 46),
    key(0.26, [124, 196, 150], [14, 196, 60], 46),
    key(0.55, [116, 172, 96], [14, 168, 40], 44),
    key(0.8, [100, 167, 64], [14, 158, 22], 43),
    key(1, [80, 165, 60], H, 43),
  ],
  rotor: [
    key(0, [80, 165, 60], H, 43),
    orbit(0.3, HUB[0], HUB[2], 62, 74, 162, [7, 150, 0], 43),
    orbit(0.64, HUB[0], HUB[2], 46, 105, 157, [-2, 150, 0], 44),
    key(1, [30, 158, 30], [1, 150, 0], 44),
  ],
  generator: [
    key(0,[30,158,30],[1,150,0],44),
    key(.32,[26,158,23],[1,150,0],43),
    key(.68,[31,160,17],[1,150,0],43),
    key(1,[28,158,26],[1,150,0],44),
  ],
  converter: [
    key(0,[28,158,26],[1,150,0],44),
    key(.5,[5,159,31],[-5,149,2],44),
    key(1,[-5,155,36],CONVERTER,43),
  ],
  transformer: [
    key(0, [-5, 155, 36], CONVERTER, 43),
    key(.20, [32, 29, 40], [0, 22, 0], 45),
    key(.35, [-50, 47, 15], [-120, 25, -35], 48),
    key(.58, [-263, 32, -68], [-278,22,-97], 47),
    key(.80, [-259, 31, -75], [-278,22,-97], 47),
    key(1, [-255, 35, -10], STATION, 48),
  ],
  cable: [
    key(0, [-255, 35, -10], STATION, 48),
    key(0.18, [-390, -23, -27], [-520, -41, -37], 49),
    key(0.32, [-509, -32, -3], [-538, -42, -34], 48),
    key(0.48, [-553, -33, 5], [-563, -42, -30], 48),
    key(0.64, [-602, -31, 30], [-622, -40, 5], 49),
    key(0.80, [-701, -13, 70], [-742, -9, 55], 50),
    key(0.91, [-732, 8, 96], [-792, 5, 55], 50),
    key(1, SHORE_IN, SHORE_IN_Q, 50),
  ],
  shore: [
    key(0, SHORE_IN, SHORE_IN_Q, 50),
    key(0.25, [-782, 10, 112], [-820, 8, 55], 50),
    key(0.6, [-846, 44, 116], [-895, 10, 55], 51),
    key(1, SHORE_OUT, LAMP, 52),
  ],
  ending: [
    key(0, SHORE_OUT, LAMP, 52),
    key(0.45, [-962, 86, 168], [-850, 18, 40], 52),
    key(1, [-1080, 112, 182], [-600, 55, -55], 54),
  ],
};

// One timeline built from real narration boundaries: shared anchors appear once,
// so speed and direction stay C1 across scene seams and across local keys.
function buildKeys(scenes: SceneWindow[]): Key[] {
  const valid = scenes
    .filter(s => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .slice()
    .sort((a, b) => a.start - b.start);
  const out: Key[] = [];
  const genericP: V[] = [[-460, 10, 215], [220, 220, 350], [110, 170, 230], [80, 165, 60], [-12, 154, 30], [12, 172, 45], [-255, 35, -10], [SHORE_IN[0], SHORE_IN[1], SHORE_IN[2]], SHORE_OUT, [-1080, 112, 182]];
  const genericQ: V[] = [H, H, H, H, [-4, 150, 0], [1, 150, 0], STATION, SHORE_IN_Q, LAMP, [-600, 55, -55]];
  for (let si = 0; si < valid.length; si++) {
    const s = valid[si];
    const fi = Math.min(si, genericP.length - 2);
    const authored = TRACKS[s.id];
    const local = authored ?? [key(0, genericP[fi], genericQ[fi], 48), key(1, genericP[fi + 1], genericQ[fi + 1], 48)];
    for (const k of local) {
      const t = s.start + k.u * (s.end - s.start);
      if (out.length && t <= out[out.length - 1].t + 1e-7) continue; // seam anchor already owned by previous scene
      // A narration breath is not a camera hold. Reusing a seam pose at both
      // sides of the 0.22 s audio gap used to insert a seven-frame standstill.
      // Keep the prior seam key and interpolate directly to the next shot key.
      const previous=out[out.length-1];
      if(k.u===0&&previous&&Math.abs(previous.f-k.f)<1e-8&&
        previous.p.every((v,i)=>Math.abs(v-k.p[i])<1e-8)&&
        previous.q.every((v,i)=>Math.abs(v-k.q[i])<1e-8))continue;
      out.push({ t, p: k.p, q: k.q, f: k.f });
    }
  }
  return out;
}

// Shape-preserving (Fritsch-Carlson style) Hermite tangents: no spline overshoot
// into the tower or the water floor, and shared derivatives at every boundary.
function slope(keys: Key[], i: number, value: (k: Key) => number): number {
  const n = keys.length;
  if (n < 2) return 0;
  if (i === 0) return (value(keys[1]) - value(keys[0])) / (keys[1].t - keys[0].t);
  if (i === n - 1) return (value(keys[i]) - value(keys[i - 1])) / (keys[i].t - keys[i - 1].t);
  const h0 = keys[i].t - keys[i - 1].t;
  const h1 = keys[i + 1].t - keys[i].t;
  const d0 = (value(keys[i]) - value(keys[i - 1])) / h0;
  const d1 = (value(keys[i + 1]) - value(keys[i])) / h1;
  if (d0 * d1 <= 0) return 0;
  const w0 = 2 * h1 + h0, w1 = h1 + 2 * h0;
  return (w0 + w1) / (w0 / d0 + w1 / d1);
}

function interpolate(keys: Key[], i: number, u: number, value: (k: Key) => number): number {
  const dt = keys[i + 1].t - keys[i].t;
  const a = value(keys[i]), b = value(keys[i + 1]);
  const m0 = slope(keys, i, value), m1 = slope(keys, i + 1, value);
  const u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * a + (u3 - 2 * u2 + u) * dt * m0 + (-2 * u3 + 3 * u2) * b + (u3 - u2) * dt * m1;
}

// Safety net only: authored tracks never enter the tower footprint, but a generic
// fallback could. Soft radial push-out below the hub, smoothstep-weighted so it
// fades in instead of snapping.
const TOWER_R = 11, TOWER_BOT = -3, TOWER_TOP = HUB[1] + 3;
function keepClear(p: V): void {
  if (p[1] < TOWER_BOT || p[1] > TOWER_TOP) return;
  const dx = p[0] - HUB[0], dz = p[2] - HUB[2];
  const r = Math.hypot(dx, dz);
  if (r >= TOWER_R) return;
  if (r < 1e-3) { p[0] = HUB[0] + TOWER_R; return; }
  const w = clamp((TOWER_R - r) / TOWER_R, 0, 1);
  const s = w * w * (3 - 2 * w);
  const k = 1 + (s * (TOWER_R - r)) / r;
  p[0] = HUB[0] + dx * k;
  p[2] = HUB[2] + dz * k;
}

export function sampleCamera(seconds: number, scenes: SceneWindow[]): CameraSample {
  const keys = buildKeys(scenes);
  if (!keys.length) return { position: [-940, 18, 120], target: [...LAMP], fov: 50 };
  if (keys.length === 1) {
    const k = keys[0];
    return { position: [...k.p], target: [...k.q], fov: clamp(k.f, 38, 58) };
  }
  const t = clamp(Number.isFinite(seconds) ? seconds : keys[0].t, keys[0].t, keys[keys.length - 1].t);
  let i = 0;
  while (i < keys.length - 2 && t > keys[i + 1].t) i++;
  const span = keys[i + 1].t - keys[i].t;
  const u = span > 0 ? clamp((t - keys[i].t) / span, 0, 1) : 0;
  const position: V = [0, 0, 0];
  const target: V = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    position[c] = interpolate(keys, i, u, k => k.p[c]);
    target[c] = interpolate(keys, i, u, k => k.q[c]);
  }
  keepClear(position);
  const dx = target[0] - position[0], dy = target[1] - position[1], dz = target[2] - position[2];
  if (dx * dx + dy * dy + dz * dz < 1e-4) target[2] = position[2] - 2;
  return { position, target, fov: clamp(interpolate(keys, i, u, k => k.f), 38, 58) };
}
