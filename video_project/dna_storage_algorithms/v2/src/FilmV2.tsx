import React, {useLayoutEffect, useRef} from 'react';
import {AbsoluteFill, Audio, useCurrentFrame} from 'remotion';
import {DNAWorldV2, DNAWorldStateV2} from './DNAWorldV2';
import timelineJson from './timeline.json';
import {TimelineV2} from './contracts';

const timeline = timelineJson as unknown as TimelineV2;
const ink = '#eff8f4';
const muted = '#a8c6c3';
const cyan = '#8de6dc';
const gold = '#e5b35f';
const paperAssets = [
  '/public/papers/goldman-2013-page.png',
  '/public/papers/dna-fountain-preprint-01.png',
  '/public/papers/nucleotide-transformer-2024-01.png',
];

function stateAt(frame: number): DNAWorldStateV2 {
  const time = frame / timeline.fps;
  const index = Math.max(0, timeline.shots.findIndex((shot) => time >= shot.startSec && time < shot.endSec));
  const shot = timeline.shots[index] ?? timeline.shots[timeline.shots.length - 1];
  const previous = timeline.shots[index - 1];
  return {
    frame,
    time,
    sceneId: shot.id,
    progress: Math.max(0, Math.min(1, (time - shot.startSec) / Math.max(0.001, shot.endSec - shot.startSec))),
    previousSceneId: previous?.id,
    elapsed: Math.max(0, time - shot.startSec),
  };
}

function Stage({state}: {state: DNAWorldStateV2}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const worldRef = useRef<DNAWorldV2 | null>(null);
  useLayoutEffect(() => {
    if (!canvasRef.current) return;
    worldRef.current = new DNAWorldV2(canvasRef.current, timeline, 1920, 1080, paperAssets);
    return () => { worldRef.current?.dispose(); worldRef.current = null; };
  }, []);
  useLayoutEffect(() => { worldRef.current?.render(state); }, [state]);
  return <canvas ref={canvasRef} width={1920} height={1080} style={{position: 'absolute', inset: 0, width: '100%', height: '100%'}} />;
}

function Brand() {
  return <div style={{position: 'absolute', left: 64, top: 48, zIndex: 10, display: 'flex', alignItems: 'center', gap: 20, color: ink, fontFamily: '"Microsoft YaHei", sans-serif', fontSize: 44, fontWeight: 700, letterSpacing: 0.4}}>
    <img src="/public/brand/logo.png" alt="rainbow鱼" style={{width: 76, height: 90, objectFit: 'contain'}} />
    <span>rainbow鱼</span>
  </div>;
}

function ShotTitle({state}: {state: DNAWorldStateV2}) {
  const shot = timeline.shots.find((item) => item.id === state.sceneId);
  if (!shot || state.sceneId === 's09-evidence' || state.elapsed > 4.2) return null;
  const q = Math.min(1, state.elapsed / 0.65);
  return <div style={{position: 'absolute', left: 112, top: 150, zIndex: 8, color: ink, opacity: q, transform: `translateY(${(1 - q) * 12}px)`, pointerEvents: 'none'}}>
    <div style={{fontSize: state.sceneId === 's01-hook' ? 78 : 58, lineHeight: 1.15, fontWeight: 760, letterSpacing: -1.3, textShadow: '0 3px 20px rgba(0,0,0,.25)'}}>{shot.title}</div>
    {state.sceneId === 's01-hook' && <div style={{fontSize: 36, color: cyan, marginTop: 14, letterSpacing: 1.2}}>每天5分钟科普</div>}
  </div>;
}

function Caption({state}: {state: DNAWorldStateV2}) {
  const cue = timeline.narration.find((item) => state.time >= item.startSec && state.time < item.endSec);
  if (!cue || !cue.text.trim()) return null;
  return <div style={{position: 'absolute', left: 112, right: 112, bottom: 42, zIndex: 9, pointerEvents: 'none'}}>
    <div style={{display: 'inline-block', maxWidth: 1420, padding: '12px 24px 13px', color: '#f4fbf8', background: 'linear-gradient(100deg, rgba(4,19,27,.92), rgba(4,19,27,.55))', borderLeft: `4px solid ${gold}`, borderRadius: 12, boxShadow: '0 16px 34px rgba(0,0,0,.25)', fontSize: 46, lineHeight: 1.3, letterSpacing: 0.2}}>{cue.text}</div>
  </div>;
}

function EvidenceOverlay({state}: {state: DNAWorldStateV2}) {
  if (state.sceneId !== 's09-evidence') return null;
  const q = Math.min(1, Math.max(0, state.progress * 1.4));
  const show = (delay: number) => Math.max(0, Math.min(1, (q - delay) / 0.35));
  const evidencePapers = [
    {src: paperAssets[0], left: 356, top: 300, rotate: -3.2, delay: 0.03},
    {src: paperAssets[1], left: 780, top: 276, rotate: 1.8, delay: 0.25},
    {src: paperAssets[2], left: 1204, top: 304, rotate: -1.2, delay: 0.47},
  ];
  return <div style={{position: 'absolute', inset: 0, zIndex: 8, pointerEvents: 'none', color: '#e4f2ed', fontFamily: '"Microsoft YaHei", sans-serif', textShadow: '0 2px 16px rgba(0,0,0,.65)'}}>
    <div style={{position: 'absolute', left: 112, top: 112, fontSize: 56, fontWeight: 760, opacity: show(0), letterSpacing: -0.8}}>公式留下，证据也留下</div>
    {evidencePapers.map((paper, i) => <div key={paper.src} style={{position: 'absolute', left: paper.left, top: paper.top, width: 360, height: 470, padding: 8, boxSizing: 'border-box', background: '#f7f4eb', borderRadius: 4, boxShadow: '0 20px 46px rgba(0,0,0,.34)', opacity: show(paper.delay), transform: `rotate(${paper.rotate}deg) translateY(${(1 - show(paper.delay)) * 24}px)`, transformOrigin: '50% 100%', transition: 'none'}}>
      <img src={paper.src} alt={i === 0 ? 'Goldman 2013 论文首页' : i === 1 ? 'DNA Fountain 论文首页' : 'Nucleotide Transformer 论文首页'} style={{display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'top center', background: '#fff'}} />
    </div>)}
    <div style={{position: 'absolute', left: 180, bottom: 125, opacity: show(0.08), fontSize: 21, lineHeight: 1.35, color: '#d2e6df'}}>Goldman et al. · Nature · 2013<br/>10.1038/nature11875</div>
    <div style={{position: 'absolute', left: 610, bottom: 125, opacity: show(0.28), fontSize: 21, lineHeight: 1.35, color: '#d2e6df'}}>Erlich &amp; Zielinski · Science · 2017<br/>10.1126/science.aaj2038</div>
    <div style={{position: 'absolute', left: 1050, bottom: 125, opacity: show(0.52), fontSize: 21, lineHeight: 1.35, color: '#d2e6df'}}>Dalla-Torre et al. · Nature Methods · 2024<br/>10.1038/s41592-024-02523-z</div>
    <div style={{position: 'absolute', right: 64, top: 150, width: 300, opacity: show(0.1), fontFamily: 'Georgia, serif', fontSize: 25, lineHeight: 1.52, color: '#cce6de'}}>
      <div style={{borderLeft: `3px solid ${gold}`, paddingLeft: 18}}>GC = (G + C) / L</div>
      <div style={{borderLeft: `3px solid ${cyan}`, paddingLeft: 18}}>yᵢ = ⊕ xⱼ</div>
      <div style={{borderLeft: `3px solid #a68fe8`, paddingLeft: 18}}>consensus = argmax Σ quality</div>
    </div>
    <div style={{position: 'absolute', left: 112, bottom: 42, color: '#a9d0c7', fontSize: 23, letterSpacing: 1.1, opacity: show(0.65)}}>encode → synthesize → sequence → decode</div>
  </div>;
}

export function DNAFilmV2({audio = false}: {audio?: boolean}) {
  const state = stateAt(useCurrentFrame());
  return <AbsoluteFill style={{background: '#071c26', overflow: 'hidden', fontFamily: '"Microsoft YaHei", sans-serif'}}>
    <Stage state={state} />
    <AbsoluteFill style={{background: 'linear-gradient(90deg, rgba(4,18,26,.42), rgba(4,18,26,0) 58%), linear-gradient(0deg, rgba(3,14,19,.38), transparent 34%)', pointerEvents: 'none'}} />
    <Brand />
    <ShotTitle state={state} />
    <Caption state={state} />
    <EvidenceOverlay state={state} />
    {audio && <Audio src="/public/audio/master.wav" volume={1} />}
  </AbsoluteFill>;
}

export {timeline};
