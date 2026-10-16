import {PhysicsWorldV11, stateAt, type State} from './WorldV11';
import {drawVisualPolishV12} from './VisualPolishV12';

const W = 1920;
const H = 1080;
const TAU = Math.PI * 2;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const smooth = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
const fract = (v: number) => v - Math.floor(v);
const rnd = (n: number) => fract(Math.sin(n * 91.17 + 17.3) * 43758.5453);
const rgba = (hex: string, alpha: number) => {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

function glow(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number) {
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(.25, rgba(color, alpha * .36));
  g.addColorStop(1, rgba(color, 0));
  c.fillStyle = g;
  c.fillRect(x - r, y - r, r * 2, r * 2);
}

function path(c: CanvasRenderingContext2D, points: Array<{x: number; y: number}>, stroke: string, width: number, alpha = 1, dash?: number[]) {
  if (!points.length) return;
  c.save();
  c.globalAlpha *= alpha;
  c.strokeStyle = stroke;
  c.lineWidth = width;
  c.lineCap = 'round';
  c.lineJoin = 'round';
  if (dash) c.setLineDash(dash);
  c.beginPath();
  c.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) c.lineTo(p.x, p.y);
  c.stroke();
  c.restore();
}

function disc(c: CanvasRenderingContext2D, x: number, y: number, r: number, fill: string, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.restore();
}

function rounded(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, stroke: string, fill?: string, alpha = 1) {
  c.save();
  c.globalAlpha *= alpha;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  if (fill) { c.fillStyle = fill; c.fill(); }
  c.strokeStyle = stroke;
  c.lineWidth = 1;
  c.stroke();
  c.restore();
}

function starfield(c: CanvasRenderingContext2D, s: State, alpha = .15) {
  c.save();
  c.globalCompositeOperation = 'screen';
  for (let i = 0; i < 96; i++) {
    const z = .35 + rnd(i + 22) * .8;
    const x = 45 + fract(rnd(i + 70) + s.time * (.0008 + i * .000003)) * 1830;
    const y = 290 + rnd(i + 340) * 600;
    const twinkle = .5 + .5 * Math.sin(s.time * (.7 + z) + i * 1.7);
    disc(c, x, y, .45 + 1.1 * z, '#c3f5ff', alpha * z * twinkle);
  }
  c.restore();
}

function depthGrid(c: CanvasRenderingContext2D, s: State, alpha = .14) {
  const t = s.time * .12;
  c.save();
  c.globalAlpha *= alpha;
  c.strokeStyle = '#55c9dc';
  c.lineWidth = 1;
  for (let i = -9; i <= 9; i++) {
    const x = 960 + i * 92 + Math.sin(t + i) * 4;
    path(c, [{x, y: 830}, {x: 960 + i * 18, y: 470}], '#55c9dc', 1, 1);
  }
  for (let j = 0; j < 7; j++) {
    const y = 500 + j * 58;
    path(c, [{x: 160, y}, {x: 1760, y: y + (y - 540) * .16}], '#55c9dc', 1, 1);
  }
  c.restore();
}

function ring(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, alpha: number, phase = 0) {
  c.save();
  c.globalAlpha *= alpha;
  c.strokeStyle = color;
  c.lineWidth = 1.2;
  c.beginPath();
  c.arc(x, y, r, phase, phase + Math.PI * 1.84);
  c.stroke();
  c.restore();
}

function wavefront(c: CanvasRenderingContext2D, s: State, x: number, y: number, color: string, alpha: number) {
  const q = (s.time * 110) % 420;
  for (let i = 0; i < 4; i++) ring(c, x, y, q + i * 90, color, alpha * (1 - i * .16), s.time * .3 + i);
}

function drawHookUpgrade(c: CanvasRenderingContext2D, s: State) {
  const q = smooth(clamp(s.elapsed / 10));
  const cx = 1020 + Math.sin(s.time * .2) * 26;
  const cy = 575 + Math.cos(s.time * .16) * 14;
  wavefront(c, s, cx, cy, '#62e1f1', .26 * q);
  glow(c, cx, cy, 260, '#1b98c8', .16 * q);
  path(c, [{x: 170, y: 710}, {x: 590, y: 640}, {x: 1030, y: 580}, {x: 1450, y: 520}, {x: 1780, y: 460}], '#8de9f5', 1.2, .24 * q);
  const p = clamp((s.elapsed - 2) / 8);
  disc(c, 165 + p * 1640, 710 - p * 250, 5 + 4 * Math.sin(s.time * 4) ** 2, '#f3e6bd', .85 * q);
}

function drawMessengersUpgrade(c: CanvasRenderingContext2D, s: State) {
  const q = smooth(clamp(s.elapsed / 8));
  const src = {x: 260, y: 640};
  const dst = {x: 1000, y: 555};
  glow(c, src.x, src.y, 150, '#f2b66c', .22 * q);
  disc(c, src.x, src.y, 13, '#f2c277', .9 * q);
  for (let i = 0; i < 3; i++) ring(c, src.x, src.y, 28 + i * 19 + (s.time * 9) % 19, '#f2c277', .2 * q, s.time + i);
  const proton = Array.from({length: 32}, (_, i) => { const u = i / 31; return {x: src.x + (dst.x - src.x) * u, y: src.y - 85 * Math.sin(u * Math.PI) + 42 * Math.sin(u * Math.PI * 2)}; });
  const gamma = Array.from({length: 32}, (_, i) => { const u = i / 31; return {x: src.x + (dst.x - src.x) * u, y: src.y - 16 - 120 * u}; });
  const neutrino = Array.from({length: 32}, (_, i) => { const u = i / 31; return {x: src.x + (dst.x - src.x) * u, y: src.y + 6 - 18 * u}; });
  path(c, proton, '#f39a79', 4, .78 * q);
  path(c, gamma, '#e6c87f', 3, .46 * q, [14, 16]);
  path(c, neutrino, '#77e1f0', 4, .9 * q);
  for (const [arr, color] of [[proton, '#f39a79'], [gamma, '#e6c87f'], [neutrino, '#77e1f0']] as const) {
    const u = (s.time * .18) % 1;
    const pt = arr[Math.min(arr.length - 1, Math.floor(u * arr.length))];
    disc(c, pt.x, pt.y, 6, color, .92 * q);
    glow(c, pt.x, pt.y, 36, color, .2 * q);
  }
}

function drawIceUpgrade(c: CanvasRenderingContext2D, s: State) {
  const q = smooth(clamp((s.elapsed - .25) / 10));
  const left = 220, top = 430, w = 860, h = 350;
  rounded(c, left, top, w, h, 16, 'rgba(123,224,241,.28)', 'rgba(19,86,112,.07)', q);
  for (let i = 0; i < 11; i++) {
    const x = left + 70 + i * 73 + Math.sin(s.time * .3 + i) * 3;
    path(c, [{x, y: top + 22}, {x: x - 16, y: top + h - 20}], '#7fdef0', 1, .32 * q);
    for (let j = 0; j < 6; j++) {
      const y = top + 50 + j * 51;
      const pulse = .35 + .65 * Math.pow(Math.max(0, Math.sin(s.time * 1.2 - j * .6 - i * .3)), 6);
      disc(c, x - 16 * (y - top) / h, y, 4.2, '#8de8ef', (.22 + .7 * pulse) * q);
      glow(c, x - 16 * (y - top) / h, y, 22, '#64d9ea', .08 * pulse * q);
    }
  }
  const beam = (s.time * 160) % 1040;
  path(c, [{x: left - 80 + beam, y: top + h + 35}, {x: left + 240 + beam, y: top + 100}, {x: left + 520 + beam, y: top - 60}], '#e3d7a0', 2, .45 * q);
}

function drawInteractionUpgrade(c: CanvasRenderingContext2D, s: State) {
  const q = smooth(clamp(s.elapsed / 8));
  const x = 770, y = 575;
  const angle = -.22 + Math.sin(s.time * .2) * .03;
  for (let i = 0; i < 5; i++) {
    const r = 70 + i * 42 + ((s.time * 42) % 42);
    c.save(); c.globalAlpha *= .19 * q * (1 - i * .1); c.strokeStyle = i % 2 ? '#8ce7f3' : '#f5d18b'; c.lineWidth = 1.6;
    c.beginPath(); c.ellipse(x + Math.cos(angle) * r * .3, y + Math.sin(angle) * r * .3, r * 1.18, r * .42, angle, 0, TAU); c.stroke(); c.restore();
  }
  path(c, [{x: 350, y: 745}, {x: 560, y: 655}, {x: 770, y: 575}, {x: 1110, y: 425}], '#9debf2', 2.4, .7 * q);
  disc(c, x, y, 8, '#f5d18b', q); glow(c, x, y, 80, '#64d9ea', .25 * q);
}

function drawEvidenceUpgrade(c: CanvasRenderingContext2D, s: State) {
  const q = smooth(clamp(s.elapsed / 18));
  const baseY = 790;
  path(c, [{x: 160, y: baseY}, {x: 1030, y: baseY}], '#7ddcea', 1.5, .34 * q);
  const count = s.elapsed < 13 ? 28 : 37;
  const visible = Math.min(count, Math.floor((s.elapsed % 13) / 13 * count) + 1);
  for (let i = 0; i < visible; i++) {
    const x = 180 + (i / Math.max(1, count - 1)) * 820;
    const h = 28 + (18 + (i * 17) % 86) * (i % 5 === 0 ? 1.5 : 1);
    const hot = i === 31 && count === 37;
    const color = hot ? '#f19f91' : '#e4be78';
    path(c, [{x, y: baseY}, {x, y: baseY - h}], color, hot ? 4 : 2.6, .72 * q);
    disc(c, x, baseY - h, hot ? 5 : 3.8, color, .9 * q);
  }
  const sigma = count === 28 ? '4.1σ' : '5.7σ';
  const sx = count === 28 ? 570 : 850;
  glow(c, sx, 560, 120, '#f0cb87', .12 * q);
  c.save(); c.globalAlpha *= .78 * q; c.font = '600 31px "Nobel Sans", sans-serif'; c.fillStyle = '#f0d499'; c.fillText(sigma, sx, 520); c.restore();
}

function drawSourcesUpgrade(c: CanvasRenderingContext2D, s: State) {
  const q = smooth(clamp(s.elapsed / 16));
  const cx = 720, cy = 610;
  for (let i = 0; i < 7; i++) {
    const a = s.time * .09 + i * TAU / 7;
    const r = 140 + i * 38;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r * .52;
    ring(c, cx, cy, r, '#65dbe8', .13 * q, a);
    disc(c, x, y, 4 + (i === 2 ? 4 : 0), i === 2 ? '#f2c177' : '#8ceaf2', .78 * q);
  }
  path(c, [{x: 280, y: 750}, {x: 470, y: 660}, {x: 690, y: 610}, {x: 920, y: 550}], '#78e4ef', 2.2, .7 * q);
  path(c, [{x: 300, y: 400}, {x: 520, y: 500}, {x: 740, y: 605}], '#e4c27e', 1.8, .46 * q, [8, 14]);
}

function drawTeamUpgrade(c: CanvasRenderingContext2D, s: State) {
  const q = smooth(clamp(s.elapsed / 11));
  const nodes = [{x:250,y:700},{x:470,y:560},{x:690,y:680},{x:910,y:520},{x:1130,y:650}];
  for (let i = 0; i < nodes.length - 1; i++) {
    path(c, [nodes[i], nodes[i + 1]], '#66dbe9', 2, .45 * q);
    const u = clamp((s.time * .16 - i * .16) % 1);
    disc(c, nodes[i].x + (nodes[i + 1].x - nodes[i].x) * u, nodes[i].y + (nodes[i + 1].y - nodes[i].y) * u, 5, '#e5d194', .9 * q);
  }
  for (const n of nodes) { disc(c, n.x, n.y, 12, '#0d3345', .95 * q); ring(c, n.x, n.y, 20, '#78deed', .56 * q, s.time); }
}

function drawMeaningUpgrade(c: CanvasRenderingContext2D, s: State) {
  const q = smooth(clamp(s.elapsed / 8));
  const cx = 950, cy = 590;
  const cols = ['#e8d18a','#e2a4a2','#79e1f0','#bda6e5'];
  for (let i = 0; i < 4; i++) {
    const a = s.time * .12 + i * TAU / 4;
    const x = cx + Math.cos(a) * 300, y = cy + Math.sin(a) * 140;
    path(c, [{x, y}, {x: cx, y: cy}], cols[i], 2.2, .56 * q);
    disc(c, x, y, 13, cols[i], .86 * q); glow(c, x, y, 60, cols[i], .16 * q);
  }
  disc(c, cx, cy, 25, '#eef5ef', .9 * q); glow(c, cx, cy, 100, '#76e4ee', .18 * q);
}

function drawLimitsUpgrade(c: CanvasRenderingContext2D, s: State) {
  const q = smooth(clamp(s.elapsed / 8));
  const x0 = 300, y0 = 720, w = 1140;
  path(c, [{x: x0, y: y0}, {x: x0 + w, y: y0}], '#89dae6', 1.4, .35 * q);
  const t = clamp((s.time * .16) % 1);
  const x = x0 + t * w;
  path(c, [{x, y: y0 - 170}, {x, y: y0 + 170}], '#e3c681', 2, .68 * q);
  for (let i = 0; i < 9; i++) ring(c, x, y0, 42 + i * 28, '#82e6ef', .10 * q, s.time + i);
  rounded(c, x0 + 30, y0 - 125, 380, 62, 14, 'rgba(132,230,240,.24)', 'rgba(5,27,40,.22)', .76 * q);
}

function drawCodaUpgrade(c: CanvasRenderingContext2D, s: State) {
  const q = smooth(clamp(s.elapsed / 10));
  const cx = 1040, cy = 640;
  wavefront(c, s, cx, cy, '#75e3ee', .2 * q);
  glow(c, cx, cy, 270, '#1f8dbd', .13 * q);
  path(c, [{x: 230, y: 760}, {x: 670, y: 690}, {x: 1050, y: 640}, {x: 1450, y: 570}, {x: 1810, y: 500}], '#9cecf4', 1.5, .42 * q);
  const u = (s.time * .12) % 1;
  disc(c, 230 + u * 1580, 760 - u * 260, 5.5, '#f1d292', .86 * q);
}

function backgroundUpgrade(c: CanvasRenderingContext2D, s: State) {
  starfield(c, s, .13);
  depthGrid(c, s, .08);
  const pulse = .55 + .45 * Math.sin(s.time * .23);
  glow(c, 950, 530, 650, '#12617f', .08 + .02 * pulse);
  // A soft horizon keeps the procedural canvas and paper windows in one optical space.
  const g = c.createLinearGradient(0, 420, 0, 940);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(1,10,17,.20)');
  c.fillStyle = g; c.fillRect(0, 420, W, 520);
}

function foregroundUpgrade(c: CanvasRenderingContext2D, s: State) {
  // These three clips use the paper-faithful V12 primitives.  They share the
  // same anchors as the detector canvas: the source/earth line, the DOM
  // arrival ribbon, and the compact anisotropic cascade.  Returning early
  // prevents the older decorative duplicate from being drawn underneath.
  if (s.clipId === '003' || s.clipId === '008' || s.clipId === '009') {
    drawVisualPolishV12(c, s.clipId, s.elapsed, 1);
    return;
  }
  const map: Record<string, (ctx: CanvasRenderingContext2D, state: State) => void> = {
    hook: drawHookUpgrade,
    question: drawMessengersUpgrade,
    messengers: drawMessengersUpgrade,
    idea: drawIceUpgrade,
    ice: drawIceUpgrade,
    interaction: drawInteractionUpgrade,
    formula: drawInteractionUpgrade,
    discovery: drawEvidenceUpgrade,
    sources: drawSourcesUpgrade,
    team: drawTeamUpgrade,
    meaning: drawMeaningUpgrade,
    limits: drawLimitsUpgrade,
    coda: drawCodaUpgrade,
  };
  map[s.scene]?.(c, s);
}

export class PhysicsWorldV12 {
  private base: PhysicsWorldV11;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', {alpha: true})!;
    this.base = new PhysicsWorldV11(canvas);
  }
  renderBackground(s: State) {
    this.base.renderBackground(s);
    backgroundUpgrade(this.ctx, s);
  }
  render(s: State) {
    this.base.render(s);
    foregroundUpgrade(this.ctx, s);
  }
}

export {stateAt};
// Re-export the timeline state type so V12 film/evidence layers can share the
// exact measured V11 clock without importing the baseline module directly.
export type {State};
