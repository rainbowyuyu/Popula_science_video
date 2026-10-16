import {drawEarthGlobeV11} from './DetectorRedrawV11';
/* =============================================================================
 * drawCosmicV11 — "cosmic messengers" plates for a science documentary
 * Clips: 002 (12.466s) · 003 (12.400s) · 014 (9.533s)   1920x1080 @ 30fps
 * Safe box: x 120..1800, y 325..860 (titles y<285, subtitles y>=915).
 *
 * Physics honoured: one distant source emits messengers. The proton is charged
 * and bends smoothly in the magnetic field; the gamma ray travels straight but
 * is absorbed inside an intervening dust/radiation volume (a soft cloud, not a
 * wall); the neutrino is neutral, goes straight, and is never drawn as a
 * glowing or curving object. All paths are explanatory, never measured data.
 * The source is always drawn as an unresolved luminous object, never labelled
 * as an identified counterpart. Nothing here is a claim about TXS / NGC.
 *
 * Determinism: every position is a pure function of t and an index hash. No
 * clocks, no RNG state, no dependencies. All coordinates are screen-space, so
 * the caller must render with the identity transform. Every helper saves and
 * restores state and multiplies (never replaces) the inherited globalAlpha.
 * ===========================================================================*/

type V3 = { x: number; y: number; z: number };
type P2 = { x: number; y: number; s: number };
type Cam = { dx: number; dy: number; dz: number; zoom: number };
type Anchors = { sx: number; sy: number; ex: number; ey: number };

const CX = 960, CY = 592, FOC = 1500, TAU = Math.PI * 2;
const FONT = "'Nobel Sans','Microsoft YaHei','PingFang SC',sans-serif";

const cl = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const sm = (v: number) => { const x = cl(v); return x * x * (3 - 2 * x); };
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const hsh = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const band = (t: number, a: number, b: number, ri = 0.8, ro = 0.8) =>
  sm((t - a) / ri) * (1 - sm((t - (b - ro)) / ro));

/* ---------------------------------------------------------------- camera ---*/
function makeCam(t: number, id: string): Cam {
  const ph = id === '003' ? 1.9 : id === '014' ? 3.4 : 0;
  const p = t * 0.055;                       // slow, continuous parallax
  return {
    dx: 26 * Math.sin(p * 2.0 + ph) + 9 * Math.sin(p * 5.3 + ph * 1.7),
    dy: 13 * Math.cos(p * 1.7 + ph) - 6 * Math.sin(p * 4.1),
    dz: 46 * Math.sin(p * 1.35 + ph * 0.8),
    zoom: 1 + 0.014 * Math.sin(p * 0.9 + ph),
  };
}

function proj(p: V3, cam: Cam): P2 {
  const k = (FOC / (FOC + p.z + cam.dz)) * cam.zoom;
  return { x: CX + (p.x - CX) * k + cam.dx * k, y: CY + (p.y - CY) * k + cam.dy * k, s: k };
}

/* ------------------------------------------------------------- primitives --*/
function rr(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
}

/** Soft elliptical volume of light. col = [core, mid, edge]. */
function blob(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number,
              rot: number, a: number, col: string[]) {
  if (a <= 0.004 || rx <= 0.2) return;
  const pa = c.globalAlpha;
  c.save();
  c.globalAlpha = pa * a;
  c.translate(x, y); c.rotate(rot); c.scale(rx, ry);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0, col[0]); g.addColorStop(0.5, col[1]); g.addColorStop(1, col[2]);
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill();
  c.restore();
}

function label(c: CanvasRenderingContext2D, cam: Cam, txt: string, w: V3, a: number,
               size = 27, align: CanvasTextAlign = 'left', col = '#e8f1fb') {
  if (a <= 0.004) return;
  const p = proj(w, cam);
  const pa = c.globalAlpha;
  c.save();
  c.globalAlpha = pa * a;
  c.font = `500 ${size}px ${FONT}`;
  c.textAlign = align; c.textBaseline = 'middle';
  const tw = c.measureText(txt).width;
  const x0 = align === 'center' ? p.x - tw / 2 : align === 'right' ? p.x - tw : p.x;
  c.fillStyle = 'rgba(7,14,30,0.42)';
  rr(c, x0 - 15, p.y - 21, tw + 30, 42, 11); c.fill();
  c.strokeStyle = 'rgba(150,200,245,0.16)'; c.lineWidth = 1;
  rr(c, x0 - 15, p.y - 21, tw + 30, 42, 11); c.stroke();
  c.fillStyle = col;
  c.fillText(txt, p.x, p.y + 1);
  c.restore();
}

/* --------------------------------------------------------- volume / stars --*/
function drawVolume(c: CanvasRenderingContext2D, t: number, cam: Cam) {
  const pa = c.globalAlpha;
  const wisps: number[][] = [
    [520, 430, 430, 190, -0.35], [1060, 745, 540, 205, 0.22],
    [1490, 440, 390, 175, -0.15], [860, 545, 320, 150, 0.40],
    [255, 785, 330, 150, 0.10],
  ];
  for (let i = 0; i < wisps.length; i++) {
    const w = wisps[i], ph = t * 0.05 + i * 1.31;
    blob(c, w[0] + Math.sin(ph) * 26, w[1] + Math.cos(ph * 0.8) * 16, w[2], w[3],
      w[4] + Math.sin(ph * 0.5) * 0.05, 0.75,
      ['rgba(74,92,168,0.30)', 'rgba(48,62,122,0.13)', 'rgba(14,20,50,0)']);
  }
  c.save();
  for (let i = 0; i < 104; i++) {
    const p = proj({ x: 130 + hsh(i) * 1660, y: 336 + hsh(i + 91) * 512, z: -110 + hsh(i + 173) * 250 }, cam);
    if (p.x < 118 || p.x > 1804 || p.y < 322 || p.y > 864) continue;
    const tw = 0.55 + 0.45 * Math.sin(t * (0.45 + hsh(i + 331) * 0.8) + i * 1.7);
    c.globalAlpha = pa * (0.08 + 0.24 * hsh(i + 407)) * tw;
    c.fillStyle = i % 7 === 0 ? 'rgba(255,226,198,1)' : 'rgba(206,230,255,1)';
    c.beginPath(); c.arc(p.x, p.y, (0.55 + hsh(i + 251) * 1.7) * p.s, 0, TAU); c.fill();
  }
  c.restore();
}

/* ------------------------------------------------------------- path model --*/
/** Shared origin/destination; the lane (o) and depth (z) separate the three
 *  messenger routes. Proton and charged-ray lanes bow smoothly; gamma, light
 *  and neutrino lanes stay geometrically straight. */
function pathAt(A: Anchors, kind: string, u: number): V3 {
  const dx = A.ex - A.sx, dy = A.ey - A.sy;
  const L = Math.sqrt(dx * dx + dy * dy);
  const nx = -dy / L, ny = dx / L;
  const uu = cl(u), w = Math.sin(Math.PI * uu);
  const bx = A.sx + dx * uu, by = A.sy + dy * uu;
  let o = 0, z = 0;
  if (kind === 'p') {                                   // proton, bent upward
    o = -168 * Math.pow(w, 1.12) + 16 * Math.sin(uu * Math.PI * 11) * w * w;
    z = -120 * w;
  } else if (kind === 'c') {                            // 014 charged ray, bent down
    o = 108 * w + 13 * Math.sin(uu * Math.PI * 9) * w * w;
    z = -92 * w;
  } else if (kind === 'g') { o = -46*uu; z = -58*uu; }  // shared origin, straight 3D ray
  else if (kind === 'l') { o = -118*uu; z = -30*uu; }
  else { o = 42*uu; z = 95*uu; }
  return { x: bx + nx * o, y: by + ny * o, z };
}

function strokePath(c: CanvasRenderingContext2D, cam: Cam, A: Anchors, kind: string,
                    alphaAt: (u: number) => number, colAt: (u: number) => string,
                    width: number, glow: number) {
  const N = 56;
  const pa = c.globalAlpha;
  let prev = proj(pathAt(A, kind, 0), cam);
  c.save();
  c.lineCap = 'round'; c.lineJoin = 'round';
  for (let i = 1; i <= N; i++) {
    const p = proj(pathAt(A, kind, i / N), cam);
    const a = alphaAt((i - 0.5) / N);
    if (a > 0.004) {
      const w = width * (prev.s + p.s) * 0.5;
      if (glow > 0) {
        c.save();
        c.globalAlpha = pa * a * 0.16 * glow;
        c.lineWidth = w * 4.6;
        c.beginPath(); c.moveTo(prev.x, prev.y); c.lineTo(p.x, p.y); c.stroke();
        c.restore();
      }
      c.globalAlpha = pa * a;
      c.lineWidth = w;
      c.strokeStyle = colAt(i / N);
      c.beginPath(); c.moveTo(prev.x, prev.y); c.lineTo(p.x, p.y); c.stroke();
    }
    prev = p;
  }
  c.restore();
}

function particle(c: CanvasRenderingContext2D, cam: Cam, A: Anchors, kind: string,
                  u: number, a: number, size: number, col: string[]) {
  if (a <= 0.004) return;
  const p = proj(pathAt(A, kind, u), cam);
  const r = size * p.s;
  blob(c, p.x, p.y, r, r, 0, a, col);
}

/**
 * A short, depth-aware motion trace behind each messenger.
 *
 * The trail is sampled from the same `pathAt` geometry as the messenger
 * itself.  This keeps the visual and the physics explanation locked together:
 * a proton's trace follows the magnetic bend, while the neutral neutrino and
 * the gamma ray remain straight in the explanatory scene.  It is deliberately
 * short and soft so it reads as propagation, rather than as an invented
 * detector measurement or a second trajectory.
 */
function particleTrail(c: CanvasRenderingContext2D, cam: Cam, A: Anchors, kind: string,
                      u: number, a: number, size: number, col: string[]) {
  if (a <= 0.008) return;
  const pa = c.globalAlpha;
  const tail = kind === 'p' ? 0.065 : kind === 'g' ? 0.052 : 0.045;
  c.save();
  c.lineCap = 'round';
  c.lineJoin = 'round';
  for (let k = 20; k >= 1; k--) {
    const u0 = Math.max(0, u - tail * k / 20);
    const u1 = Math.max(0, u - tail * (k - 1) / 20);
    if (u1 <= u0) continue;
    const p0 = proj(pathAt(A, kind, u0), cam);
    const p1 = proj(pathAt(A, kind, u1), cam);
    const fade = a * Math.pow(1 - k / 21, 1.5) * 0.5;
    c.globalAlpha = pa * fade;
    c.strokeStyle = col[1] ?? col[0];
    c.lineWidth = Math.max(.65, size * (p0.s + p1.s) * .20 * (1 - k * .028));
    c.beginPath();
    c.moveTo(p0.x, p0.y);
    c.lineTo(p1.x, p1.y);
    c.stroke();
  }
  c.restore();
}

/* ----------------------------------------------------------- environment ---*/
/** Intervening dust / radiation volume — layered soft lobes, no hard edge. */
function drawCloud(c: CanvasRenderingContext2D, cam: Cam, t: number, a: number) {
  const p = proj({ x: 980, y: 590, z: -30 }, cam);
  const s = p.s;
  const lobes: number[][] = [
    [0, 0, 300, 195, 0.0], [-190, 55, 210, 150, 0.5],
    [170, -40, 235, 155, -0.4], [40, 95, 200, 120, 0.9],
  ];
  const col = ['rgba(152,134,170,0.30)', 'rgba(98,88,122,0.13)', 'rgba(30,28,52,0)'];
  for (let i = 0; i < lobes.length; i++) {
    const L = lobes[i];
    blob(c, p.x + L[0] * s + Math.sin(t * 0.09 + L[4]) * 14,
      p.y + L[1] * s + Math.cos(t * 0.07 + L[4]) * 10,
      L[2] * s, L[3] * s, L[4] * 0.5 + t * 0.02, a * 0.9, col);
  }
}

/** Broad local magnetic field arcs — soft, wide, slowly shearing. */
function drawFieldArcs(c: CanvasRenderingContext2D, cam: Cam, t: number, a: number) {
  if (a <= 0.005) return;
  const pc = proj({ x: 760, y: 545, z: -20 }, cam);
  const pa = c.globalAlpha;
  c.save();
  for (let i = 0; i < 5; i++) {
    const rad = (95 + i * 46) * pc.s;
    const ang = -0.35 + 0.16 * i + Math.sin(t * 0.13 + i) * 0.05;
    const a0 = 0.06 * Math.sin(t * 0.11 + i * 1.1) + i * 0.5;
    const a1 = a0 + 1.55 + 0.6 * Math.sin(t * 0.17 + i);
    c.save();
    c.translate(pc.x, pc.y); c.rotate(ang);
    c.strokeStyle = 'rgba(126,196,255,1)';
    c.globalAlpha = pa * a * (0.16 - i * 0.018); c.lineWidth = 15 * pc.s;
    c.beginPath(); c.ellipse(0, 0, rad, rad * 0.46, 0, a0, a1); c.stroke();
    c.globalAlpha = pa * a * (0.070 - i * 0.008); c.lineWidth = 46 * pc.s;
    c.beginPath(); c.ellipse(0, 0, rad, rad * 0.46, 0, a0, a1); c.stroke();
    c.restore();
  }
  c.restore();
}

/* ---------------------------------------------------------------- objects --*/
/** Tilted luminous accretion disk with bipolar jets and slow orbital motion. */
function drawSource(c: CanvasRenderingContext2D, cam: Cam, t: number, g: number, sx: number, sy: number) {
  if (g <= 0.005) return;
  const p = proj({ x: sx, y: sy, z: 0 }, cam);
  const s = p.s, pa = c.globalAlpha;
  blob(c, p.x, p.y, 205 * s, 96 * s, -0.42, g * 0.50,
    ['rgba(112,128,214,0.26)', 'rgba(64,78,150,0.12)', 'rgba(20,26,64,0)']);
  blob(c, p.x, p.y, 168 * s, 66 * s, -0.32, g * 0.55,
    ['rgba(255,178,98,0.22)', 'rgba(178,86,44,0.10)', 'rgba(0,0,0,0)']);

  c.save();
  c.translate(p.x, p.y); c.rotate(-0.32);

  const jet = (dir: number, len: number, wid: number, inner: number) => {
    c.save();
    c.globalAlpha = pa * g * 0.55;
    const gg = c.createLinearGradient(0, 0, 0, dir * len);
    gg.addColorStop(0, 'rgba(232,246,255,0.42)');
    gg.addColorStop(0.22, 'rgba(158,208,255,0.22)');
    gg.addColorStop(0.62, 'rgba(110,168,240,0.09)');
    gg.addColorStop(1, 'rgba(80,140,220,0)');
    c.fillStyle = gg;
    c.beginPath();
    c.moveTo(-inner, 0); c.lineTo(inner, 0);
    c.lineTo(wid, dir * len); c.lineTo(-wid, dir * len);
    c.closePath(); c.fill();
    const ky = dir * len * 0.34;
    const gk = c.createRadialGradient(0, ky, 0, 0, ky, inner * 2.4);
    gk.addColorStop(0, 'rgba(226,244,255,0.30)'); gk.addColorStop(1, 'rgba(120,190,255,0)');
    c.globalAlpha = pa * g * 0.5;
    c.fillStyle = gk;
    c.beginPath(); c.arc(0, ky, inner * 2.4, 0, TAU); c.fill();
    c.restore();
  };
  jet(-1, 172 * s, 62 * s, 13 * s);
  jet(1, 196 * s, 72 * s, 15 * s);

  c.save();
  c.globalAlpha = pa * g * 0.95;
  c.scale(120 * s, 39 * s);
  const gd = c.createRadialGradient(0, 0, 0, 0, 0, 1);
  gd.addColorStop(0, 'rgba(255,246,224,0.88)');
  gd.addColorStop(0.30, 'rgba(255,196,110,0.60)');
  gd.addColorStop(0.62, 'rgba(224,110,52,0.30)');
  gd.addColorStop(1, 'rgba(120,40,30,0)');
  c.fillStyle = gd;
  c.beginPath(); c.arc(0, 0, 1, 0, TAU); c.fill();
  c.restore();

  for (let i = 0; i < 160; i++) {                      // slow orbital motion
    const a0 = (i / 160) * TAU, a1 = a0 + (TAU / 160) * 1.15;
    const ph = 0.5 + 0.5 * Math.cos(a0 - t * 0.5);
    c.globalAlpha = pa * g * (0.10 + 0.55 * ph * ph);
    c.strokeStyle = i % 2 ? 'rgba(255,214,150,0.9)' : 'rgba(255,168,90,0.9)';
    c.lineWidth = 3.0 * s * (0.6 + 0.5 * ph);
    c.beginPath(); c.ellipse(0, 0, 120 * s, 39 * s, 0, a0, a1); c.stroke();
  }
  c.globalAlpha = pa * g * 0.75;
  c.fillStyle = 'rgba(255,250,238,0.92)';
  c.beginPath(); c.ellipse(0, 0, 17 * s, 9 * s, 0, 0, TAU); c.fill();
  c.restore();
}

/** Shaded planet with atmosphere and a sunlit limb (its own light, not the neutrino's). */
function drawEarth(c: CanvasRenderingContext2D, cam: Cam, t: number, g: number, ex: number, ey: number, R0: number) {
  if (g<=0.005)return;
  const pc=proj({x:ex,y:ey,z:0},cam);
  c.save();c.globalAlpha*=g;
  drawEarthGlobeV11(c,pc.x,pc.y,R0*pc.s,t);
  c.restore();
}

/* --------------------------------------------------------- 002 / 003 plate --*/
function drawSceneJourney(c: CanvasRenderingContext2D, cam: Cam, t: number, recap: boolean) {
  const A: Anchors = { sx: 352, sy: 600, ex: 1510, ey: 634 };
  const srcOn = sm((t - 0.10) / 1.5);
  const earthOn = sm((t - 0.55) / 1.7);
  const pOn = sm((t - (recap ? 0.55 : 1.75)) / 1.35);
  const gOn = sm((t - (recap ? 1.15 : 2.35)) / 1.35);
  const nOn = sm((t - (recap ? 1.85 : 3.05)) / 1.35);

  const eP = 0.26 + 0.74 * band(t, recap ? 2.50 : 2.15, recap ? 6.50 : 5.70, 1.1, 1.0);
  const eG = 0.24 + 0.76 * band(t, recap ? 2.60 : 4.95, recap ? 6.40 : 9.10, 1.1, 1.2);
  const eN = 0.26 + 0.74 * sm((t - (recap ? 5.90 : 8.30)) / 1.0);
  const eFld = band(t, recap ? 2.40 : 2.00, recap ? 6.60 : 5.80, 1.2, 1.0);
  const eCloud = 0.55 + 0.45 * band(t, 4.90, 9.20, 1.2, 1.2);
  const eBack = recap ? sm((t - 8.35) / 1.0) : 0;
  const arr = recap ? sm((t - 6.0) / 1.0) : sm((t - 8.5) / 0.9);

  const cut0 = 0.30, cut1 = 0.64;                       // absorption window
  const absorb = (u: number) => (u < cut0 ? 1 : mix(1, 0.07, sm((u - cut0) / (cut1 - cut0))));
  const pa = c.globalAlpha;

  drawCloud(c, cam, t, 0.62 + 0.38 * eCloud);
  drawFieldArcs(c, cam, t, eFld * pOn);

  strokePath(c, cam, A, 'p', () => pOn * eP, () => 'rgba(150,214,255,0.95)', 3.4, 0.55);
  strokePath(c, cam, A, 'g', (u) => gOn * eG * absorb(u), () => 'rgba(255,214,138,0.95)', 3.0, 0.50);
  strokePath(c, cam, A, 'n', () => nOn * eN, () => 'rgba(255,178,104,0.95)', 2.0, 0.34);

  const ab = proj(pathAt(A, 'g', cut0), cam);           // softening where the gamma dies
  blob(c, ab.x, ab.y, 66 * ab.s, 48 * ab.s, 0.3, eG * gOn * 0.5,
    ['rgba(255,214,150,0.34)', 'rgba(200,150,110,0.13)', 'rgba(80,60,60,0)']);

  for (let i = 0; i < 9; i++) {
    const u = (((t * 0.135 + i / 9) % 1) + 1) % 1;
    particleTrail(c, cam, A, 'p', u, pOn * eP * 0.9, 8.5,
      ['rgba(226,246,255,0.95)', 'rgba(110,190,255,0.42)', 'rgba(60,120,220,0)']);
    particle(c, cam, A, 'p', u, pOn * eP * 0.9, 8.5,
      ['rgba(226,246,255,0.95)', 'rgba(110,190,255,0.42)', 'rgba(60,120,220,0)']);
  }
  for (let i = 0; i < 6; i++) {
    const u = (((t * 0.145 + i / 6) % 1) + 1) % 1;
    particleTrail(c, cam, A, 'g', u, gOn * eG * absorb(u) * 1.35, 7.5,
      ['rgba(255,244,208,0.95)', 'rgba(255,198,100,0.45)', 'rgba(255,150,40,0)']);
    particle(c, cam, A, 'g', u, gOn * eG * absorb(u) * 1.35, 7.5,
      ['rgba(255,244,208,0.95)', 'rgba(255,198,100,0.45)', 'rgba(255,150,40,0)']);
  }
  for (let i = 0; i < 5; i++) {
    const u = (((t * 0.21 + i / 5) % 1) + 1) % 1;
    particleTrail(c, cam, A, 'n', u, nOn * eN * 0.95, 5.4,
      ['rgba(255,242,220,0.95)', 'rgba(255,186,110,0.40)', 'rgba(255,140,50,0)']);
    particle(c, cam, A, 'n', u, nOn * eN * 0.95, 5.4,
      ['rgba(255,242,220,0.95)', 'rgba(255,186,110,0.40)', 'rgba(255,140,50,0)']);
  }

  drawSource(c, cam, t, srcOn, 330, 600);
  drawEarth(c, cam, t, earthOn, 1615, 640, 148);

  const ep = proj({ x: A.ex, y: A.ey, z: 0 }, cam);      // arrival ripple, outward side only
  for (let i = 0; i < 3; i++) {
    const rp = (((t * 0.30 + i / 3) % 1) + 1) % 1;
    const r = (16 + rp * 108) * ep.s, fall = (1 - rp) * (1 - rp);
    c.save();
    c.globalAlpha = pa * arr * fall * 0.42;
    c.strokeStyle = 'rgba(150,228,255,0.95)'; c.lineWidth = 2.4;
    c.beginPath(); c.arc(ep.x, ep.y, r, Math.PI * 0.45, Math.PI * 1.55); c.stroke();
    c.globalAlpha = pa * arr * fall * 0.10;
    c.lineWidth = 14;
    c.beginPath(); c.arc(ep.x, ep.y, r, Math.PI * 0.45, Math.PI * 1.55); c.stroke();
    c.restore();
  }

  if (eBack > 0.01) {                                    // calm direction back-projection
    const n0 = proj(pathAt(A, 'n', 1), cam);
    const n1 = proj(pathAt(A, 'n', 0.28), cam);
    c.save();
    c.lineCap = 'round'; c.lineJoin = 'round';
    c.strokeStyle = 'rgba(255,214,150,0.9)';
    c.globalAlpha = pa * eBack * 0.13; c.lineWidth = 16;
    c.beginPath(); c.moveTo(n0.x, n0.y); c.lineTo(n1.x, n1.y); c.stroke();
    c.globalAlpha = pa * eBack * 0.80; c.lineWidth = 2.8;
    c.beginPath(); c.moveTo(n0.x, n0.y); c.lineTo(n1.x, n1.y); c.stroke();
    const hp = mix(0.0, 1.0, 0.5 + 0.5 * Math.sin(t * 0.55 - 1.57));  // slow travelling hint
    const hx = mix(n0.x, n1.x, hp), hy = mix(n0.y, n1.y, hp);
    blob(c, hx, hy, 15, 15, 0, eBack * 0.7, ['rgba(255,236,198,0.5)', 'rgba(255,190,110,0.18)', 'rgba(255,150,60,0)']);
    c.globalAlpha = pa * eBack * 0.75;                   // arrow head near the source end
    const avx = n1.x - n0.x, avy = n1.y - n0.y, av = Math.sqrt(avx * avx + avy * avy) || 1;
    const ux = avx / av, uy = avy / av, hl = 26;
    c.lineWidth = 3.2;
    c.beginPath(); c.moveTo(n1.x, n1.y); c.lineTo(n1.x - ux * hl - uy * 13, n1.y - uy * hl + ux * 13);
    c.moveTo(n1.x, n1.y); c.lineTo(n1.x - ux * hl + uy * 13, n1.y - uy * hl - ux * 13);
    c.stroke();
    c.restore();

    const sp = proj({ x: 330, y: 600, z: 0 }, cam);      // focal source ring
    for (let i = 0; i < 3; i++) {
      const rp = (((t * 0.26 + i / 3) % 1) + 1) % 1;
      const r = (44 + rp * 150) * sp.s;
      c.save();
      c.globalAlpha = pa * eBack * (1 - rp) * 0.30;
      c.strokeStyle = 'rgba(255,222,170,0.95)'; c.lineWidth = 2.0;
      c.beginPath(); c.ellipse(sp.x, sp.y, r, r * 0.62, -0.32, 0, TAU); c.stroke();
      c.globalAlpha = pa * eBack * (1 - rp) * 0.07; c.lineWidth = 13;
      c.beginPath(); c.ellipse(sp.x, sp.y, r, r * 0.62, -0.32, 0, TAU); c.stroke();
      c.restore();
    }
  }

  /* ------------------------------------------------------------- labels ---*/
  if (!recap) {
    label(c, cam, '遥远源区', { x: 300, y: 800, z: 0 }, band(t, 0.6, 3.4, 0.7, 0.7), 27, 'center');
    label(c, cam, '地球', { x: 1660, y: 424, z: 0 }, band(t, 1.0, 4.2, 0.7, 0.7), 27, 'center');
    label(c, cam, '带电宇宙线', { x: 940, y: 390, z: -120 }, band(t, 2.5, 6.0, 0.6, 0.7));
    label(c, cam, '磁场偏转', { x: 620, y: 700, z: -20 }, band(t, 2.8, 5.6, 0.6, 0.7));
    label(c, cam, '伽马射线', { x: 600, y: 480, z: -58 }, band(t, 5.4, 8.4, 0.7, 0.7));
    label(c, cam, '尘埃与辐射场吸收', { x: 1180, y: 780, z: -20 }, band(t, 5.9, 8.7, 0.7, 0.7));
    label(c, cam, '中微子', { x: 960, y: 726, z: 95 }, band(t, 8.9, 12.3, 0.7, 0.5));
    label(c, cam, '直线传播 · 方向不变', { x: 1300, y: 745, z: 95 }, band(t, 9.4, 12.3, 0.7, 0.5));
  } else {
    label(c, cam, '带电宇宙线', { x: 940, y: 390, z: -120 }, band(t, 1.3, 3.0, 0.6, 0.5));
    label(c, cam, '伽马射线', { x: 600, y: 480, z: -58 }, band(t, 1.8, 3.0, 0.6, 0.5));
    label(c, cam, '中微子', { x: 960, y: 726, z: 95 }, band(t, 2.3, 3.0, 0.6, 0.5));
    label(c, cam, '带电粒子被磁场弯曲', { x: 620, y: 700, z: -20 }, band(t, 3.15, 6.4, 0.7, 0.6));
    label(c, cam, '伽马射线被削弱', { x: 1180, y: 780, z: -20 }, band(t, 3.7, 6.2, 0.7, 0.6));
    label(c, cam, '中微子：不偏转', { x: 960, y: 726, z: 95 }, band(t, 6.4, 8.8, 0.7, 0.6));
    label(c, cam, '穿过尘埃与辐射场', { x: 1300, y: 745, z: 95 }, band(t, 6.8, 8.7, 0.7, 0.6));
    label(c, cam, '方向回溯', { x: 1120, y: 700, z: 60 }, band(t, 8.9, 12.3, 0.8, 0.5));
    label(c, cam, '候选源区', { x: 300, y: 800, z: 0 }, band(t, 9.3, 12.3, 0.8, 0.5), 27, 'center');
  }
}

/* -------------------------------------------------------------- 014 plate --*/
/** Four translucent viewing planes, all aimed at the same source anchor. */
function drawPlanes(c: CanvasRenderingContext2D, cam: Cam, t: number, cx: number, cy: number,
                    conv: number, a: number) {
  if (a <= 0.005) return;
  const p = proj({ x: cx, y: cy, z: 0 }, cam);
  const base = [-168, -122, -58, -12];
  const tint = ['rgba(255,214,150,', 'rgba(140,200,255,', 'rgba(182,166,255,', 'rgba(255,166,96,'];
  const pa = c.globalAlpha;
  for (let i = 0; i < 4; i++) {
    const ang = (base[i] + (-90 - base[i]) * conv * 0.55) * Math.PI / 180;
    const d = (350 - 65 * conv) * p.s;
    const w = (392 + 40 * conv) * p.s, h = (232 + 34 * conv) * p.s, curl = h * 0.30;
    const x = p.x + Math.cos(ang) * d, y = p.y + Math.sin(ang) * d;
    c.save();
    c.globalAlpha = pa * a * (0.85 + 0.15 * Math.sin(t * 0.9 + i * 1.3));
    c.translate(x, y); c.rotate(ang);
    const g = c.createLinearGradient(-w / 2, 0, w / 2, 0);
    g.addColorStop(0, tint[i] + '0)');
    g.addColorStop(0.38, tint[i] + '0.65)');
    g.addColorStop(0.70, tint[i] + '0.45)');
    g.addColorStop(1, tint[i] + '0)');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(-w / 2, -h / 2);
    c.quadraticCurveTo(w * 0.16, -h / 2 + curl, w / 2, -h / 2);
    c.lineTo(w / 2, h / 2);
    c.quadraticCurveTo(w * 0.16, h / 2 + curl, -w / 2, h / 2);
    c.closePath(); c.fill();
    c.globalAlpha = pa * a * 0.55;
    c.strokeStyle = tint[i] + '0.55)'; c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(-w / 2, -h / 2);
    c.quadraticCurveTo(w * 0.16, -h / 2 + curl, w / 2, -h / 2);
    c.stroke();
    c.restore();
  }
}

/** Illustrative spacetime-fabric distortion: broad warped bands, no grid, no data. */
function drawFabric(c: CanvasRenderingContext2D, cam: Cam, t: number, cx: number, cy: number, a: number) {
  if (a <= 0.005) return;
  const p = proj({ x: cx, y: cy, z: 0 }, cam);
  const pa = c.globalAlpha;
  c.save();
  c.translate(p.x, p.y);
  c.scale(p.s, p.s * 0.66);
  for (let k = 0; k < 5; k++) {
    const rp = (((t * 0.13 + k / 5) % 1) + 1) % 1;
    const R = 80 + rp * 740;
    const fall = Math.pow(1 - rp, 1.4);
    for (let pass = 0; pass < 2; pass++) {
      c.globalAlpha = pa * a * fall * (pass ? 0.055 : 0.16);
      c.lineWidth = (pass ? 30 : 12) / p.s;
      c.strokeStyle = 'rgba(178,168,255,1)';
      c.beginPath();
      for (let i = 0; i <= 160; i++) {
        const th = (i / 160) * TAU;
        const r = R * (1 + 0.055 * Math.cos(3 * th + t * 0.25) + 0.03 * Math.cos(5 * th - t * 0.18));
        const xx = Math.cos(th) * r, yy = Math.sin(th) * r;
        if (i) c.lineTo(xx, yy); else c.moveTo(xx, yy);
      }
      c.closePath(); c.stroke();
    }
  }
  c.restore();
}

function drawScene014(c: CanvasRenderingContext2D, cam: Cam, t: number) {
  const A: Anchors = { sx: 640, sy: 600, ex: 1502, ey: 648 };
  const srcOn = sm((t - 0.10) / 1.4);
  const earthOn = sm((t - 0.50) / 1.6);
  const eL = sm((t - 0.35) / 1.3);
  const eC = sm((t - 1.25) / 1.4);
  const eW = sm((t - 2.25) / 1.4);
  const eN = sm((t - 3.25) / 1.4);
  const conv = sm((t - 4.0) / 2.8);
  const p3 = sm((t - 7.356) / 1.1);
  const pulse = 0.86 + 0.14 * Math.sin(t * 1.15);
  const ck = 1 - 0.20 * p3 * (0.5 + 0.5 * Math.sin(t * 1.15));   // shared "mutual check" beat
  const pa = c.globalAlpha;

  drawFabric(c, cam, t, A.sx, A.sy, eW * (0.55 + 0.45 * conv));
  drawPlanes(c, cam, t, A.sx, A.sy, conv, sm((t - 4.1) / 1.4) * (0.55 + 0.45 * pulse) * 0.11);

  strokePath(c, cam, A, 'l', () => eL * ck, () => 'rgba(255,232,190,0.95)', 3.0, 0.65);
  strokePath(c, cam, A, 'c', () => eC * ck, () => 'rgba(168,222,255,0.95)', 3.2, 0.60);
  strokePath(c, cam, A, 'n', () => eN * ck, () => 'rgba(255,178,104,0.95)', 2.0, 0.34);

  for (let i = 0; i < 3; i++) {
    const u = (((t * 0.19 + i / 3) % 1) + 1) % 1;
    particle(c, cam, A, 'l', u, eL * ck, 11,
      ['rgba(255,248,228,0.95)', 'rgba(255,214,140,0.42)', 'rgba(255,180,80,0)']);
  }
  for (let i = 0; i < 8; i++) {
    const u = (((t * 0.14 + i / 8) % 1) + 1) % 1;
    particle(c, cam, A, 'c', u, eC * ck * 0.85, 8,
      ['rgba(226,246,255,0.95)', 'rgba(110,190,255,0.42)', 'rgba(60,120,220,0)']);
  }
  for (let i = 0; i < 4; i++) {
    const u = (((t * 0.20 + i / 4) % 1) + 1) % 1;
    particle(c, cam, A, 'n', u, eN * ck * 0.9, 5.2,
      ['rgba(255,242,220,0.95)', 'rgba(255,186,110,0.40)', 'rgba(255,140,50,0)']);
  }

  const sp = proj({ x: A.sx, y: A.sy, z: 0 }, cam);      // shared beat at the source
  if (p3 > 0.01) {
    for (let i = 0; i < 3; i++) {
      const rp = (((t * 0.32 + i / 3) % 1) + 1) % 1;
      const r = (44 + rp * 250) * sp.s;
      c.save();
      c.globalAlpha = pa * p3 * (1 - rp) * 0.26;
      c.strokeStyle = 'rgba(214,232,255,0.95)'; c.lineWidth = 2.0;
      c.beginPath(); c.ellipse(sp.x, sp.y, r, r * 0.66, -0.3, 0, TAU); c.stroke();
      c.globalAlpha = pa * p3 * (1 - rp) * 0.06; c.lineWidth = 14;
      c.beginPath(); c.ellipse(sp.x, sp.y, r, r * 0.66, -0.3, 0, TAU); c.stroke();
      c.restore();
    }
  }

  drawSource(c, cam, t, srcOn, A.sx, A.sy);
  drawEarth(c, cam, t, earthOn, 1607, 650, 147);

  label(c, cam, '光', { x: 1150, y: 452, z: -30 }, sm((t - 0.9) / 0.8) * (1 - sm((t - 9.0) / 0.4)), 27, 'center', '#ffe9c2');
  label(c, cam, '宇宙线', { x: 880, y: 786, z: -92 }, sm((t - 1.9) / 0.8) * (1 - sm((t - 9.0) / 0.4)), 27, 'center', '#cfe6ff');
  label(c, cam, '引力波', { x: 300, y: 760, z: -40 }, sm((t - 2.9) / 0.8) * (1 - sm((t - 9.0) / 0.4)), 27, 'center', '#d8d2ff');
  label(c, cam, '中微子', { x: 1230, y: 607, z: 0 }, sm((t - 3.8) / 0.8) * (1 - sm((t - 9.0) / 0.4)), 27, 'center', '#ffd6ac');
}

/* ------------------------------------------------------------------ entry --*/
export function drawCosmicV11(c: CanvasRenderingContext2D, clipId: string,
                              t: number, absoluteTime: number): boolean {
  const dur = clipId === '002' ? 12.466 : clipId === '003' ? 12.4 : clipId === '014' ? 9.533 : -1;
  if (dur < 0) return false;
  void absoluteTime;
  const tt = t < 0 ? 0 : t > dur ? dur : t;
  const cam = makeCam(tt, clipId);

  c.save();
  c.beginPath();
  c.rect(120, 325, 1680, 535);
  c.clip();

  drawVolume(c, tt, cam);
  if (clipId === '014') drawScene014(c, cam, tt);
  else drawSceneJourney(c, cam, tt, clipId === '003');

  c.restore();
  return true;
}
