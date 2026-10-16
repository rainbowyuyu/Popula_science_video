import React, {useEffect, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {staticFile} from 'remotion';
import {FrameState, ease} from './Timeline';

type GaussianPoint = {
  x: number; y: number; z: number;
  r: number; g: number; b: number;
  alpha: number; radius: number;
};

const W = 1920;
const H = 1080;
const bridgeScenes = new Set(['street', 'drop', 'dispersion', 'reflection', 'secondary', 'return']);

/**
 * A small deterministic fallback keeps the bridge graceful if a preview render
 * is opened before the JSON sample has finished loading. The real points are
 * replaced in-place by the Lux3D sample as soon as it arrives.
 */
function fallbackPoints(): GaussianPoint[] {
  const points: GaussianPoint[] = [];
  let seed = 0x6d2b79f5;
  const rand = () => {
    seed = Math.imul(1664525, seed) + 1013904223;
    return ((seed >>> 0) / 4294967296);
  };
  for (let i = 0; i < 900; i++) {
    const a = rand() * Math.PI * 2;
    const rr = Math.sqrt(rand()) * .5;
    points.push({x: Math.cos(a) * rr, y: Math.sin(a) * rr * .9, z: (rand() - .5) * .34,
      r: .70, g: .90, b: .87, alpha: .38 + rand() * .42, radius: .35 + rand() * .55});
  }
  return points;
}

async function loadGaussianSample(): Promise<GaussianPoint[]> {
  const response = await fetch(staticFile('assets/lux3d/extracted/3dgs/gaussian-sampled.json'));
  if (!response.ok) throw new Error(`Gaussian sample HTTP ${response.status}`);
  const payload = await response.json() as {points?: number[][]};
  return (payload.points ?? []).map((row) => ({
    x: (row[0] ?? 0) / .05, y: (row[1] ?? 0) / .05, z: (row[2] ?? 0) / .05,
    r: row[3] ?? .7, g: row[4] ?? .9, b: row[5] ?? .87,
    alpha: Math.max(.04, Math.min(1, row[6] ?? .5)),
    radius: Math.max(.05, Math.min(1, (row[7] ?? .002) * 110)),
  }));
}

function scenePlacement(state: FrameState) {
  const s = state.scene;
  if (s === 'street') return {x: 1435, y: 470, scale: 510, tilt: -.06};
  if (s === 'drop' || s === 'dispersion' || s === 'reflection') return {x: 1370, y: 465, scale: 610, tilt: .04};
  if (s === 'secondary') return {x: 1510, y: 402, scale: 380, tilt: -.13};
  return {x: 1570, y: 410, scale: 310, tilt: .10};
}

/**
 * Lux3D Gaussian-splat bridge. This is intentionally a 2D compositor layer:
 * it keeps the authoritative optical geometry in OpticsWorld, while the
 * photographic/volumetric droplet asset provides tactile depth at scene joins.
 * The point cloud is softly composited and leaves the title/caption safe zones.
 */
export function GaussianBridge({state}: {state: FrameState}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [points, setPoints] = useState<GaussianPoint[]>(() => fallbackPoints());
  const fallback = useMemo(() => points.length === 900, [points]);

  useEffect(() => {
    let cancelled = false;
    loadGaussianSample().then((loaded) => { if (!cancelled && loaded.length) setPoints(loaded); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useLayoutEffect(() => {
    const target = canvas.current;
    if (!target) return;
    const ctx = target.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    if (!bridgeScenes.has(state.scene) || state.scene === 'references') return;
    const inA = ease((state.frame - state.sceneStart) / 28);
    const outA = ease((state.sceneEnd - state.frame) / 32);
    let alpha = Math.min(inA, outA) * (fallback ? .15 : .23);
    if (state.scene === 'street') alpha *= ease((state.time - 7.4) / 1.2);
    if (state.scene === 'return') alpha *= ease((state.time - 258) / 1.4);
    if (alpha < .002) return;
    const place = scenePlacement(state);
    const sweep = state.time * .22;
    const pulse = .94 + .06 * Math.sin(state.time * 2.2);
    const travel = ease((state.frame - state.sceneStart) / Math.max(1, state.sceneEnd - state.sceneStart));
    const zoom = state.scene === 'drop' || state.scene === 'dispersion' || state.scene === 'reflection'
      ? 1.0 + .055 * Math.sin(travel * Math.PI)
      : .92 + .08 * Math.sin(travel * Math.PI);
    ctx.save();
    ctx.translate(place.x, place.y);
    ctx.rotate(place.tilt + .018 * Math.sin(sweep));
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * pulse;
    const ordered = points.length > 5000 ? points : points;
    for (let i = 0; i < ordered.length; i++) {
      const p = ordered[i];
      const drift = Math.sin(sweep + p.z * 7 + i * .001) * 2.2;
      const px = (p.x + p.z * .08) * place.scale * zoom + drift;
      const py = p.y * place.scale * zoom + Math.cos(sweep * .72 + p.x * 8) * 1.5;
      const radius = Math.max(.55, (1.15 + p.radius * 2.25) * zoom);
      const a = Math.min(.92, Math.max(.08, p.alpha * (.42 + .38 * (1 + p.z))));
      ctx.fillStyle = `rgba(${Math.round(p.r * 255)},${Math.round(p.g * 255)},${Math.round(p.b * 255)},${a})`;
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // A narrow halo is kept outside the subtitle band and gives the cloud a
    // controlled handoff into the calculated droplet without a hard cut.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * .26;
    const halo = ctx.createRadialGradient(place.x, place.y, place.scale * .16, place.x, place.y, place.scale * .72);
    halo.addColorStop(0, 'rgba(193,241,237,.22)');
    halo.addColorStop(.56, 'rgba(126,201,198,.07)');
    halo.addColorStop(1, 'rgba(126,201,198,0)');
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(place.x, place.y, place.scale * .72, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }, [points, state, fallback]);

  return <canvas ref={canvas} width={W} height={H} style={{position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 5, pointerEvents: 'none'}} aria-hidden="true"/>;
}

