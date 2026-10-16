import React, {useCallback, useLayoutEffect, useRef, useState} from 'react';
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  delayRender,
  continueRender,
  cancelRender,
} from 'remotion';
import * as T from 'three';
import {timeline, stateAt, ease, FrameState} from './Timeline';
import {OpticsWorld} from './OpticsWorld';
import {CinematicEnvironment} from './CinematicEnvironment';
import {applyV05Camera} from './CameraPathV05';
import {createGaussianBridgeV05FromUrl, GaussianBridgeV05Object} from './GaussianBridgeV05';

const INK = '#153d43';
const TEAL = '#168b91';
const GOLD = '#efb54c';
const FPS = timeline.fps;

function clamp(n: number, lo = 0, hi = 1) { return Math.max(lo, Math.min(hi, n)); }
function smooth(n: number) { const x = clamp(n); return x * x * (3 - 2 * x); }
function range(frame: number, a: number, b: number) { return smooth((frame - a * FPS) / Math.max(1, (b - a) * FPS)); }

type World = {renderer: T.WebGLRenderer; scene: T.Scene; camera: T.PerspectiveCamera; optics: OpticsWorld; env: CinematicEnvironment; gaussian?: GaussianBridgeV05Object};

function StageV05({frame, onLabels}: {frame: number; onLabels: (labels: string[]) => void}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const world = useRef<World | null>(null);
  const [handle] = useState(() => delayRender('Build V05 continuous optical world'));

  useLayoutEffect(() => {
    let alive = true;
    try {
      const renderer = new T.WebGLRenderer({canvas: canvas.current!, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance'});
      renderer.setSize(1920, 1080, false);
      renderer.setPixelRatio(1);
      renderer.outputColorSpace = T.SRGBColorSpace;
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = T.PCFSoftShadowMap;
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(42, 1920 / 1080, 0.025, 220);
      const env = new CinematicEnvironment(renderer, scene);
      const optics = new OpticsWorld();
      scene.add(optics.group);
      const holder: World = {renderer, scene, camera, optics, env};
      world.current = holder;
      createGaussianBridgeV05FromUrl(undefined, {center: new T.Vector3(32, 2.6, 0), scale: 1.45, opacity: .86, pointScale: .12, maxPoints: 1750})
        .then((gaussian) => {
          if (!alive) { gaussian.dispose(); return; }
          holder.gaussian = gaussian;
          scene.add(gaussian);
          continueRender(handle);
        })
        .catch((error) => { if (alive) { console.warn('Gaussian bridge unavailable; continuing with physical world', error); continueRender(handle); } });
    } catch (error) { cancelRender(error); }
    return () => {
      alive = false;
      const current = world.current;
      if (current) {
        current.gaussian?.dispose();
        current.optics.dispose();
        current.env.dispose();
        current.renderer.dispose();
        current.renderer.forceContextLoss();
      }
      world.current = null;
    };
  }, [handle]);

  useLayoutEffect(() => {
    const current = world.current;
    if (!current) return;
    const state = stateAt(frame) as FrameState;
    current.optics.update(state);
    applyV05Camera(current.camera, frame, {totalFrames: timeline.duration});
    current.camera.updateMatrixWorld(true);
    const cloudIn = range(frame, 34, 45);
    const cloudOut = 1 - range(frame, 62, 72);
    current.gaussian?.update({frame, camera: current.camera, bridgeProgress: cloudIn, opacity: .86 * cloudOut, center: new T.Vector3(32, 2.6, 0), scale: 1.45});
    current.renderer.render(current.scene, current.camera);
    // The optical SVG carries the angle and dark-band callouts in-scene. Do
    // not mirror them as floating pills on the right; one anchored label per
    // shot keeps the frame legible during the camera handoff.
    const labels = state.scene === 'angle' ? [] : state.scene === 'secondary' ? [] : state.scene === 'cone' ? ['一只看不见的圆锥'] : state.scene === 'return' ? ['背对太阳，看向水雾'] : [];
    onLabels(labels);
  }, [frame, onLabels]);

  return <canvas ref={canvas} width={1920} height={1080} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />;
}

function QwenBridges() {
  // The legacy Qwen bridge MP4 is retained in public/assets/qwen and in the
  // provenance record, but its encoder advertises an invalid random-access
  // frame table to Remotion's compositor.  The deterministic still plate
  // below is used for the final render so every frame remains seekable.
  return null;
}

function AtmospherePlate({state}: {state: FrameState}) {
  // Keep the rain-afterglow plate through the first handoff. The camera is
  // still crossing the shared world at 32–40 s, so dropping it exactly at
  // the scene boundary leaves an unintended white hole before the drop
  // comes into view.
  const inHook = state.time < 42;
  const inReturn = state.time >= 278 && state.time < 316;
  if (!inHook && !inReturn) return null;
  const local = inHook ? state.time : state.time - 278;
  const span = inHook ? 42 : 38;
  const a = Math.min(smooth(local / .8), 1 - smooth((local - span + 1.6) / 1.6));
  const mirrored = inReturn;
  return <div style={{position: 'absolute', inset: 0, zIndex: 3, overflow: 'hidden', opacity: .88 * Math.max(0, a), pointerEvents: 'none', background: '#173a38'}}>
    <Img src={staticFile('assets/qwen/qwen_rainbow_transition_reference.png')} style={{position: 'absolute', inset: '-5%', width: '110%', height: '110%', objectFit: 'cover', transform: `translateX(${(local / span - .5) * -5}%) scale(${1.04 + local / span * .045})${mirrored ? ' scaleX(-1)' : ''}`, filter: 'saturate(1.06) contrast(1.04)'}} />
    <div style={{position: 'absolute', inset: 0, background: 'linear-gradient(90deg,rgba(9,35,35,.28),transparent 48%,rgba(239,248,243,.08)),linear-gradient(0deg,rgba(10,37,38,.18),transparent 48%)'}} />
  </div>;
}

function BlenderHero({state}: {state: FrameState}) {
  // The angle rig enters from off-screen after the ray-exit handoff. Keep a
  // faint hero drop on that first angle beat so the travelling lens never
  // resolves to a blank frame while the geometry catches up.
  if (!['drop', 'dispersion', 'reflection', 'angle'].includes(state.scene)) return null;
  const enter = range(state.frame, 42, 48);
  // Hold the water-drop hero as the optical path takes over; the SVG/Three.js
  // light path then carries the same centre point into the angle shot.
  const leave = 1 - range(state.frame, 132, 142);
  const p = Math.min(enter, leave);
  return <div style={{position: 'absolute', inset: 0, zIndex: 5, pointerEvents: 'none', opacity: .94 * p}}>
    <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 54% 48%, rgba(196,239,237,.38), rgba(238,247,244,.12) 38%, rgba(12,55,60,.08) 76%, transparent 100%)'}} />
    <Img src={staticFile('assets_v05/blender/raindrop_v05_cutout.png')} style={{position: 'absolute', left: '53%', top: '48%', width: '54%', height: '86%', objectFit: 'contain', transform: `translate(-50%,-50%) scale(${.88 + .14 * p})`, filter: 'saturate(1.18) contrast(1.08) drop-shadow(0 18px 28px rgba(20,69,73,.22))'}} />
  </div>;
}

function WaterSurface({state}: {state: FrameState}) {
  if (!['street', 'return', 'references'].includes(state.scene)) return null;
  const p = (state.frame % 210) / 210;
  const lift = state.scene === 'return' ? smooth((state.frame - state.sceneStart) / 90) : .72;
  return <div style={{position: 'absolute', inset: 0, zIndex: 6, pointerEvents: 'none', opacity: .42 * lift, mixBlendMode: 'screen', overflow: 'hidden'}}>
    <div style={{position: 'absolute', left: '-8%', right: '-8%', bottom: '-28%', height: '62%', background: 'radial-gradient(ellipse at 52% 20%, rgba(167,234,231,.32), transparent 48%), linear-gradient(8deg, rgba(18,81,80,.34), transparent 60%)', transform: `translateY(${Math.sin(p * Math.PI * 2) * 5}px)`}} />
    {[0, 1, 2, 3, 4].map((i) => { const q = (p + i * .2) % 1; return <div key={i} style={{position: 'absolute', left: `${38 + i * 6}%`, top: `${72 - i * 2}%`, width: 150, height: 44, borderRadius: '50%', border: '1px solid rgba(194,245,239,.62)', transform: `translate(-50%,-50%) scale(${.45 + q * 2.6})`, opacity: (1 - q) * .44, boxShadow: '0 0 30px rgba(113,224,220,.24)'}} />; })}
  </div>;
}

function OpticsOverlay({state}: {state: FrameState}) {
  const modelScenes = ['drop', 'dispersion', 'reflection', 'angle', 'cone', 'circle', 'observer', 'secondary'];
  if (!modelScenes.includes(state.scene)) return null;
  // Keep the explanatory geometry present through the body of a scene. The
  // next scene owns the handoff, so fading at 86% of every scene would create
  // an unintentional white gap on long optical passages.
  const intro = smooth(state.progress * 7);
  const alpha = .92 * Math.max(.18, intro);
  const t = state.progress;
  const orbit = state.scene === 'observer' ? (t - .5) * 18 : state.scene === 'cone' ? (t - .5) * 8 : 0;
  const spectrum = ['#e85b54', '#ef9d55', '#e9d36a', '#62b97c', '#4f9ac2', '#656eb4', '#9969ae'];
  const showDrop = ['drop', 'dispersion', 'reflection'].includes(state.scene);
  const showAngle = state.scene === 'angle';
  const showCone = ['cone', 'circle', 'observer', 'secondary'].includes(state.scene);
  const showSecondary = state.scene === 'secondary';
  return <div style={{position: 'absolute', inset: 0, zIndex: 7, pointerEvents: 'none', opacity: alpha, overflow: 'hidden'}}>
    <div style={{position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 64% 51%, rgba(35,95,103,.13), transparent 44%), linear-gradient(115deg, transparent 30%, rgba(215,237,234,.22) 70%, rgba(160,208,208,.10))'}} />
    <svg viewBox="0 0 1000 560" preserveAspectRatio="xMidYMid slice" style={{position: 'absolute', inset: '-4%', width: '108%', height: '108%', transform: `translateX(${orbit}px) scale(${1 + Math.abs(orbit)*.0018})`}}>
      {showDrop && <g>
        <circle cx="665" cy="276" r="148" fill="rgba(31,107,119,.15)" stroke="rgba(28,102,111,.52)" strokeWidth="4" />
        <circle cx="665" cy="276" r="138" fill="none" stroke="rgba(211,246,242,.58)" strokeWidth="2" />
        <line x1="110" y1="276" x2="525" y2="276" stroke="#f2dca3" strokeWidth="7" strokeLinecap="round" opacity=".85" />
        <line x1="525" y1="276" x2="785" y2="165" stroke="#f3bbcc" strokeWidth="5" strokeLinecap="round" opacity={state.scene === 'reflection' ? .95 : .42} />
        <line x1="785" y1="165" x2="830" y2="360" stroke="#aee6df" strokeWidth="5" strokeLinecap="round" opacity={state.scene === 'reflection' ? .95 : .25} />
        {spectrum.map((color, i) => <line key={color} x1="520" y1="276" x2={782 + i * 4} y2={163 + i * 12} stroke={color} strokeWidth="3.5" strokeLinecap="round" opacity={state.scene === 'dispersion' ? .25 + i * .1 : .72} />)}
        <circle cx="525" cy="276" r="11" fill="#efb54c" />
        <text x="640" y="472" fill="#153d43" fontSize="25" fontWeight="700">水滴：一次折射</text>
      </g>}
      {showAngle && <g>
        <circle cx="690" cy="288" r="18" fill="#efb54c" />
        <line x1="690" y1="288" x2="690" y2="60" stroke="#e9d9a5" strokeWidth="7" strokeLinecap="round" />
        <line x1="690" y1="288" x2="922" y2="196" stroke="#e85b54" strokeWidth="7" strokeLinecap="round" />
        <path d="M690 126 A162 162 0 0 1 845 230" fill="none" stroke="#e85b54" strokeWidth="5" />
        <text x="800" y="155" fill="#b45743" fontSize="48" fontWeight="800">约 42°</text>
        <text x="556" y="474" fill="#153d43" fontSize="25" fontWeight="700">同一滴水，只有这个出口最亮</text>
      </g>}
      {showCone && <g>
        <circle cx="503" cy="315" r="17" fill="#153d43" />
        <circle cx="503" cy="315" r="31" fill="none" stroke="rgba(22,139,145,.34)" strokeWidth="3" />
        <path d="M503 315 L235 92 M503 315 L334 26 M503 315 L503 12 M503 315 L672 26 M503 315 L770 90" stroke="#efb54c" strokeWidth="5" strokeLinecap="round" opacity=".74" />
        <ellipse cx="503" cy="315" rx="325" ry="115" fill="none" stroke="#e85b54" strokeWidth="6" opacity=".9" />
        <ellipse cx="503" cy="315" rx="355" ry="136" fill="none" stroke="#5aafbe" strokeWidth="4" opacity=".45" />
        <line x1="125" y1="432" x2="880" y2="432" stroke="#153d43" strokeWidth="9" strokeLinecap="round" opacity=".55" />
        <rect x="95" y="432" width="810" height="110" fill="#eef5f2" opacity={state.scene === 'circle' ? .88 : .24} />
      </g>}
      {showSecondary && <g>
        <ellipse cx="510" cy="315" rx="333" ry="124" fill="none" stroke="#8c6ec1" strokeWidth="10" opacity=".82" />
        <ellipse cx="510" cy="315" rx="383" ry="156" fill="none" stroke="#e85b54" strokeWidth="7" opacity=".82" />
        <path d="M165 315 Q510 112 855 315" fill="none" stroke="#8c6ec1" strokeWidth="12" opacity=".68" />
        <path d="M112 315 Q510 78 908 315" fill="none" stroke="#e85b54" strokeWidth="8" opacity=".62" />
        <rect x="575" y="92" width="350" height="58" rx="12" fill="rgba(246,250,247,.94)" />
        <text x="602" y="130" fill="#765d93" fontSize="27" fontWeight="800">约 51° · 多一次反射</text>
        {/* A compact dark-band tag stays in the quiet left margin instead of
            sitting on top of the two arcs or the persistent subtitle. */}
        <rect x="72" y="344" width="118" height="48" rx="10" fill="rgba(246,250,247,.92)" />
        <text x="94" y="376" fill="#566d7c" fontSize="25" fontWeight="700">暗带</text>
      </g>}
    </svg>
  </div>;
}

const sceneTitle: Record<string, [string, string]> = {
  street: ['雨停以后', '为什么只剩一段弧？'],
  drop: ['沿着一束光', '走进一滴雨'],
  dispersion: ['白光入水', '颜色开始分开'],
  reflection: ['光在水滴里', '回头一次'],
  angle: ['亮光的出口', '出口很窄'],
  cone: ['把镜头拉远', '一只看不见的圆锥'],
  circle: ['地平线截掉了', '圆只剩一段'],
  observer: ['你移动一步', '换的是水滴'],
  secondary: ['再绕一圈', '天空多一道淡虹'],
  return: ['回到真实世界', '背对太阳，看向水雾'],
  references: ['最后留下', '一条光路和一页论文'],
};

function Brand() {
  return <div style={{position: 'absolute', left: 64, top: 48, display: 'flex', alignItems: 'center', gap: 20, zIndex: 50, pointerEvents: 'none'}}>
    <Img src={staticFile('brand/logo.png')} style={{width: 76, height: 90, objectFit: 'contain'}} />
    <span style={{fontSize: 44, fontWeight: 650, letterSpacing: 1, color: INK}}>rainbow鱼</span>
  </div>;
}

function Title({state}: {state: FrameState}) {
  const [kicker, title] = sceneTitle[state.scene] ?? sceneTitle.street;
  const entry = ease((state.frame - state.sceneStart) / 28);
  const exit = ease((state.sceneEnd - state.frame) / 30);
  // The angle diagram owns the right side of frame (including its 42°
  // callout); move that scene's heading to the quiet left margin to prevent
  // the heading from sitting on top of the geometric annotation.
  const right = ['drop', 'dispersion', 'reflection'].includes(state.scene);
  return <div style={{position: 'absolute', left: right ? 1390 : 88, top: state.scene === 'references' ? 150 : 142, width: right ? 440 : 760, zIndex: 20, pointerEvents: 'none', opacity: Math.min(entry, exit), transform: `translate3d(${(1 - entry) * (right ? 60 : -44)}px, ${(1 - entry) * 16}px,0)`}}>
    <div style={{display: 'inline-block', fontSize: 26, fontWeight: 700, letterSpacing: 2, color: '#fff', background: TEAL, padding: '8px 17px', borderRadius: 6, boxShadow: '0 8px 28px rgba(22,94,97,.18)'}}>{kicker}</div>
    <div style={{marginTop: 16, fontSize: right ? 54 : 70, lineHeight: 1.08, fontWeight: 800, letterSpacing: -1.8, color: INK, textShadow: '0 3px 18px rgba(250,252,247,.95)'}}>{title}</div>
  </div>;
}

function Labels({items}: {items: string[]}) {
  return <div style={{position: 'absolute', right: 82, top: 470, zIndex: 20, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10}}>{items.map((item) => <div key={item} style={{fontSize: 38, fontWeight: 700, color: item.includes('42') ? '#b45743' : item.includes('51') ? '#765d93' : TEAL, padding: '8px 16px', borderRadius: 9, background: 'rgba(246,250,247,.88)', boxShadow: '0 8px 24px rgba(26,74,75,.12)'}}>{item}</div>)}</div>;
}

function Caption({state}: {state: FrameState}) {
  const caption = timeline.captions.find((c) => state.frame >= c.start && state.frame < c.end);
  if (!caption) return null;
  return <div style={{position: 'absolute', left: 96, right: 96, bottom: 34, zIndex: 25, textAlign: 'center', pointerEvents: 'none'}}><span style={{display: 'inline-block', maxWidth: 'calc(100% - 120px)', fontSize: 46, fontWeight: 520, lineHeight: 1.3, color: INK, padding: '12px 28px', borderRadius: 14, background: 'rgba(251,253,249,.94)', boxShadow: '0 8px 30px rgba(28,72,70,.14)'}}>{caption.text}</span></div>;
}

function ReferencesV05({state}: {state: FrameState}) {
  if (state.scene !== 'references') return null;
  const p = ease((state.frame - state.sceneStart) / 34);
  const paper = (file: string, left: number, top: number, rotate: number, delay: number) => { const a = ease((state.frame - state.sceneStart - delay) / 28); return <div style={{position: 'absolute', left: left + (1 - a) * 110, top, width: 430, height: 540, transform: `rotate(${rotate}deg)`, opacity: a, background: '#fff', overflow: 'hidden', boxShadow: '0 20px 48px rgba(25,70,73,.20)'}}><Img src={staticFile(`sources/${file}`)} style={{width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top'}} /></div>; };
  return <div style={{position: 'absolute', inset: 0, zIndex: 30, background: 'linear-gradient(120deg,#eef6f3,#f5f6ef)', opacity: p, pointerEvents: 'none'}}>
    <div style={{position: 'absolute', left: 86, top: 172, fontSize: 68, fontWeight: 800, color: INK}}>一滴雨里的光学</div>
    <div style={{position: 'absolute', left: 94, top: 318, width: 640}}><div style={{fontSize: 38, fontWeight: 700, color: TEAL, marginBottom: 18}}>折射定律</div><Img src={staticFile('sources/formula-snell.svg')} style={{width: 560, height: 112, objectFit: 'contain', objectPosition: 'left center'}} /><div style={{fontSize: 38, fontWeight: 700, color: TEAL, marginTop: 30, marginBottom: 16}}>主虹几何</div><Img src={staticFile('sources/formula-angle.svg')} style={{width: 620, height: 112, objectFit: 'contain', objectPosition: 'left center'}} /><div style={{fontSize: 34, marginTop: 28, color: '#557471'}}>两次折射 × 一次内反射 → 约 42°</div></div>
    {paper('gettelman-2023-title-page.png', 840, 290, -4, 7)}
    {paper('gettelman-2023-rainbow-optics-page4939.png', 1165, 268, 3, 17)}
    <div style={{position: 'absolute', left: 870, top: 868, fontSize: 35, fontWeight: 700, color: INK}}>Gettelman · 2023 · GMD</div>
    <div style={{position: 'absolute', left: 870, top: 924, fontSize: 33, color: '#557471'}}>几何光学示意 · 论文页面与来源见交付说明</div>
  </div>;
}

export function V05RainbowArcFilm({audio = true}: {audio?: boolean}) {
  const frame = useCurrentFrame();
  const state = stateAt(frame) as FrameState;
  const [labels, setLabels] = useState<string[]>([]);
  const onLabels = useCallback((items: string[]) => setLabels(items), []);
  return <AbsoluteFill style={{background: '#f1f6f3', color: INK, fontFamily: '"Microsoft YaHei", Arial, sans-serif', overflow: 'hidden'}}>
    <StageV05 frame={frame} onLabels={onLabels} />
    <AtmospherePlate state={state} />
    <QwenBridges />
    <BlenderHero state={state} />
    <WaterSurface state={state} />
    <OpticsOverlay state={state} />
    <div style={{position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none', background: 'linear-gradient(100deg,rgba(246,250,246,.86),rgba(246,250,246,.30) 24%,transparent 48%)'}} />
    <Title state={state} />
    <Caption state={state} />
    <ReferencesV05 state={state} />
    <Brand />
    {audio && <Audio src={staticFile('audio/v05-master-final.wav')} volume={1} />}
  </AbsoluteFill>;
}
