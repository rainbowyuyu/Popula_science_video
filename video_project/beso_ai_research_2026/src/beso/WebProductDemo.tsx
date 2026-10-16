import React from 'react';
import {Img, staticFile, useCurrentFrame, interpolate, Easing} from 'remotion';

/**
 * A launch-film treatment for the real AI Engineer web UI.
 *
 * The images are Playwright captures from the local FastAPI app (see
 * scripts/capture-live-web.cjs). The component adds camera motion and a
 * restrained pointer/status layer so a still UI reads as a continuous product
 * interaction when cut into a film. It intentionally never fakes a solver
 * result or submits a remote request.
 */
export type WebProductPhase = 'home' | 'prompt' | 'domain' | 'topology' | 'analysis' | 'review';

type Props = {
  phase: WebProductPhase;
  width?: number;
  height?: number;
  left?: number;
  top?: number;
  /** local phase progress, 0..1; defaults to the current frame over 180f */
  progress?: number;
  /** small label shown above the browser frame */
  label?: string;
  /** optionally hide the browser chrome for a clean full-bleed cut */
  chrome?: boolean;
};

const files: Record<WebProductPhase, string> = {
  home: 'beso-research/web-live/01-home.png',
  prompt: 'beso-research/web-live/02-prompt.png',
  domain: 'screens/domain.png',
  // The route shell is useful as an establishing shot, but the saved
  // evolution viewer carries the actual BESO geometry and curves.
  topology: 'screens/evolution-2.png',
  analysis: 'screens/analysis.png',
  review: 'screens/review.png',
};

const labels: Record<WebProductPhase, string> = {
  home: 'AI ENGINEER  /  工作台',
  prompt: 'AI ENGINEER  /  自然语言需求',
  domain: 'AI ENGINEER  /  设计域',
  topology: 'AI ENGINEER  /  构型优化编排',
  analysis: 'AI ENGINEER  /  尺寸时域分析',
  review: 'AI ENGINEER  /  AI REVIEW',
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export const WebProductDemo: React.FC<Props> = ({
  phase,
  width = 1420,
  height = 790,
  left = 250,
  top = 130,
  progress,
  label,
  chrome = true,
}) => {
  const frame = useCurrentFrame();
  const p = clamp01(progress ?? ((frame % 180) / 180));
  const glide = interpolate(p, [0, 1], [0, 1], {easing: Easing.bezier(0.2, 0.85, 0.22, 1)});
  const driftX = interpolate(glide, [0, 1], [8, -8]);
  const driftY = interpolate(glide, [0, 1], [4, -5]);
  const scale = interpolate(glide, [0, 1], [1.015, 1.035]);
  const browserH = chrome ? 52 : 0;
  const title = label ?? labels[phase];
  const cursorPath: Record<WebProductPhase, [number, number, number, number]> = {
    home: [0.76, 0.86, 0.84, 0.88],
    prompt: [0.56, 0.83, 0.87, 0.84],
    domain: [0.72, 0.15, 0.58, 0.22],
    topology: [0.88, 0.86, 0.77, 0.86],
    analysis: [0.2, 0.4, 0.34, 0.46],
    review: [0.86, 0.17, 0.76, 0.25],
  };
  const [x0, y0, x1, y1] = cursorPath[phase];
  const cx = interpolate(glide, [0, 1], [x0, x1]) * width;
  const cy = browserH + interpolate(glide, [0, 1], [y0, y1]) * (height - browserH);
  return (
    <div
      style={{
        position: 'absolute', left, top, width, height, overflow: 'visible',
        borderRadius: 26, filter: 'drop-shadow(0 36px 55px rgba(9,35,55,.2))',
      }}
    >
      {chrome && (
        <div style={{
          position: 'absolute', inset: '0 0 auto 0', height: browserH,
          display: 'flex', alignItems: 'center', padding: '0 20px', gap: 9,
          borderRadius: '26px 26px 0 0', color: '#d4e6ec', background: '#112c3b',
          zIndex: 4, fontFamily: 'Consolas, Microsoft YaHei, sans-serif', fontSize: 18,
          letterSpacing: 1.1,
        }}>
          {['#f1a69a', '#e7cf8c', '#8acbb8'].map(c => <span key={c} style={{width: 11, height: 11, borderRadius: 12, background: c}} />)}
          <span style={{marginLeft: 18, opacity: .92}}>{title}</span>
          <span style={{marginLeft: 'auto', color: '#8ed0ce', fontSize: 15}}>LOCAL · LIVE UI</span>
        </div>
      )}
      <div style={{
        position: 'absolute', left: 0, top: browserH, width: '100%', height: height - browserH,
        overflow: 'hidden', borderRadius: chrome ? '0 0 26px 26px' : 26,
        background: '#f2f6f8', border: '1px solid rgba(57,110,128,.26)',
      }}>
        <Img
          src={staticFile(files[phase])}
          style={{
            width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top',
            transform: `translate3d(${driftX}px,${driftY}px,0) scale(${scale})`,
            transformOrigin: 'center center',
          }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(120deg, rgba(255,255,255,.08), transparent 33%, rgba(52,179,182,.06))',
          pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', left: cx, top: cy - browserH, width: 19, height: 19,
          borderRadius: '50%', background: '#07519a',
          boxShadow: '0 0 0 8px rgba(7,81,154,.16), 0 0 0 16px rgba(7,81,154,.07), 0 4px 12px rgba(3,36,64,.34)',
          transform: 'translate(-50%,-50%)', pointerEvents: 'none', zIndex: 5,
        }} />
      </div>
      <div style={{
        position: 'absolute', right: 22, bottom: -44, padding: '8px 14px', borderRadius: 99,
        color: '#496b79', background: 'rgba(246,251,252,.88)', border: '1px solid rgba(62,118,133,.16)',
        fontSize: 18, letterSpacing: 1.2, fontFamily: 'Microsoft YaHei, sans-serif',
      }}>{title}</div>
    </div>
  );
};

export default WebProductDemo;
