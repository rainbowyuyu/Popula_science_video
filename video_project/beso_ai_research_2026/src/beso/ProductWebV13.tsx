import React from 'react';
import {Img, staticFile} from 'remotion';
import checklist from '../../public/beso-research/web-live/v7/visual-data.json';
import replan from '../../public/beso-research/web-live/v7/replan-visual.json';

/**
 * Source-backed product promotion treatment, not a replacement product UI.
 * The data is replayed from saved local API records. No networking or solver
 * is invoked by the film. Captured UI pixels are never redrawn by this file.
 * All motion is a pure function of the supplied global frame.
 */
export type ProductWebSectionV13 = 'demand' | 'handoff' | 'feedback' | 'review' | 'delivery';
export type ProductWebModeV13 = 'film' | 'plain' | 'withoutBrand';
export interface ProductWebV13Props {
  /** Global film frame, at the supplied fps. */
  frame: number;
  fps: number;
  section?: ProductWebSectionV13 | 'auto';
  /** plain = stationary endpoint; withoutBrand = animated, no AI Engineer wordmark. */
  mode?: ProductWebModeV13;
  /** staticFile-relative paths to newly captured, unchanged product pixels. */
  assetOverrides?: {demand?: string; geometry?: string; report?: string};
  /** Optional local-time override for a parent-owned bridge window. */
  localSeconds?: number;
}

export const PRODUCT_WEB_V13_WINDOWS = {
  demand: {start: 11, end: 23},
  handoff: {start: 23, end: 31.5},
  feedback: {start: 53, end: 65},
  review: {start: 65, end: 79},
  delivery: {start: 79, end: 85.65},
} as const;

const C = {ink: '#153847', muted: '#58727f', blue: '#2166d1', blueSoft: '#e5efff', line: '#cbdbe3', paper: '#f8fbfd', warm: '#925021'};
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {const x = clamp(v); return x * x * x * (x * (6 * x - 15) + 10);};
const at = (t: number, start: number, duration = .82) => smooth((t - start) / duration);
const rail = (t: number, points: number[]) => points.reduce((sum, p) => sum + at(t, p), 0);
const label: React.CSSProperties = {fontSize: 36, lineHeight: 1.28, fontWeight: 550, color: C.muted};
const value: React.CSSProperties = {fontSize: 76, lineHeight: 1.14, fontWeight: 650, letterSpacing: -2.1, color: C.ink, fontVariantNumeric: 'tabular-nums'};

export function productWebSectionAtV13(time: number): ProductWebSectionV13 | null {
  return (Object.keys(PRODUCT_WEB_V13_WINDOWS) as ProductWebSectionV13[]).find(k => time >= PRODUCT_WEB_V13_WINDOWS[k].start && time < PRODUCT_WEB_V13_WINDOWS[k].end) ?? null;
}

/** Available clean frames for Qwen first/last-frame inputs. No Logo or captions. */
export const PRODUCT_WEB_V13_ENDPOINTS = [
  {id: 'demand-composer', section: 'demand', localSeconds: 2.5},
  {id: 'demand-written-back', section: 'demand', localSeconds: 9.6},
  {id: 'geometry-file', section: 'handoff', localSeconds: 1.8},
  {id: 'mesh-file', section: 'handoff', localSeconds: 4.3},
  {id: 'beso-file', section: 'handoff', localSeconds: 6.7},
  {id: 'failure-log', section: 'feedback', localSeconds: 2.1},
  {id: 'replan-record', section: 'feedback', localSeconds: 6.9},
  {id: 'review-viewer', section: 'review', localSeconds: 2.2},
  {id: 'new-geometry', section: 'review', localSeconds: 6.3},
  {id: 'delivery-evidence', section: 'delivery', localSeconds: 4.4},
] as const;

function Pointer({x, y, t, clickAt = Infinity}: {x: number; y: number; t: number; clickAt?: number}) {
  const click = at(t, clickAt, .12) * (1 - at(t, clickAt + .19, .36));
  return <div data-qa="v13-pointer" style={{position: 'absolute', left: x, top: y, zIndex: 5, transform: `scale(${1 - .1 * click})`, transformOrigin: '0 0', pointerEvents: 'none'}}>
    <svg width="50" height="60" viewBox="0 0 50 60"><path d="M5 3 L41 34 L25 35 L32 50 L24 54 L17 39 L6 50 Z" fill={C.ink} stroke="#fff" strokeWidth="3" strokeLinejoin="round"/></svg>
    <span style={{position: 'absolute', left: -21, top: -21, width: 42, height: 42, border: `3px solid ${C.blue}`, borderRadius: '50%', opacity: click, transform: `scale(${1 + .75 * click})`}}/>
  </div>;
}

function FileMark({kind = 'file', active = true, size = 100}: {kind?: 'file' | 'folder'; active?: boolean; size?: number}) {
  return <svg width={size} height={size * 1.2} viewBox="0 0 100 120" style={{flexShrink: 0}}>
    {kind === 'folder'
      ? <path d="M5 32 V100 H95 V39 H48 L37 26 H5 Z" fill={active ? C.blueSoft : '#eef3f6'} stroke={active ? C.blue : '#a8beca'} strokeWidth="2.5"/>
      : <><path d="M15 6 H61 L88 33 V111 H15 Z" fill={active ? '#eef5ff' : '#f2f5f7'} stroke={active ? C.blue : '#a8beca'} strokeWidth="2.5"/><path d="M61 6 V33 H88 M32 58 H70 M32 75 H70 M32 92 H58" fill="none" stroke={active ? C.blue : '#a8beca'} strokeWidth="2.5" strokeLinejoin="round"/></>}
  </svg>;
}

/** One invariant workspace; the view translates along it instead of card cuts. */
function Rail({position, children}: {position: number; children: React.ReactNode[]}) {
  return <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
    <div style={{position: 'absolute', left: 0, top: 0, display: 'flex', gap: 160, transform: `translate3d(${-position * 1240}px,0,0)`, willChange: 'transform'}}>
      {children.map((child, i) => <div data-qa={`v13-workspace-step-${i}`} key={i} style={{width: 1080, height: 550, position: 'relative', flexShrink: 0, padding: '32px 32px', boxSizing: 'border-box'}}>{child}</div>)}
    </div>
  </div>;
}

function ExactPixels({path, width, height}: {path: string; width: number; height: number}) {
  return <div data-qa="v13-source-pixels" style={{width, height, overflow: 'hidden', borderRadius: 16, background: '#eef3f7'}}>
    <Img src={staticFile(path)} style={{width, height, objectFit: 'contain', display: 'block'}}/>
  </div>;
}

function Demand({t, pointer, assets}: {t: number; pointer: boolean; assets?: ProductWebV13Props['assetOverrides']}) {
  const p = rail(t, [3.8]), selected = t >= 7.45;
  const initial = checklist.steps[0], changed = checklist.steps[1];
  const before = [initial.capacityMW, initial.steelTargetTperMW, initial.waterDepthM];
  const after = [changed.capacityMW, changed.steelTargetTperMW, changed.waterDepthM];
  const names = ['额定功率', '单位功率用钢量', '场址水深'], units = ['MW', 't/MW', 'm'];
  return <Rail position={p}>{[
    <React.Fragment key="composer">
      <div style={label}>需求编辑</div>
      {assets?.demand ? <div style={{marginTop: 70}}><ExactPixels path={assets.demand} width={1016} height={255}/></div> : <>
        <div style={{...value, marginTop: 47}}>设计 <span style={{color: C.blue}}>20 MW</span></div>
        <div style={{...value, fontSize: 68, marginTop: 14}}>半潜式漂浮风机基础</div>
        <div style={{fontSize: 46, marginTop: 30, color: C.muted}}>水深 <b style={{color: C.ink, fontWeight: 650}}>45 m</b> · 钢耗 <b style={{color: C.ink, fontWeight: 650}}>300 t/MW</b></div>
      </>}
      <div style={{position: 'absolute', right: 36, bottom: 94, width: 86, height: 86, borderRadius: '50%', background: C.blue, display: 'grid', placeItems: 'center', boxShadow: '0 8px 20px #2166d12c', transform: `scale(${1 - .055 * (at(t, 2.9, .12) - at(t, 3.1, .25))})`}}><svg width="48" height="48" viewBox="0 0 48 48"><path d="M10 24 H36 M25 12 L37 24 L25 36" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"/></svg></div>
      {pointer && <Pointer x={850 + 152 * at(t, 1.9, .8)} y={390 + 23 * at(t, 1.9, .8)} t={t} clickAt={2.9}/>}
      <div style={{...label, position: 'absolute', left: 32, bottom: 26}}>真实数据重排 · 本地规则解析</div>
    </React.Fragment>,
    <React.Fragment key="parameters">
      <div style={label}>同一份设计清单 · 参数写回</div>
      {names.map((name, i) => <div key={name} data-qa={`v13-parameter-${i}`} style={{position: 'absolute', left: 32, right: 32, top: 95 + i * 119, display: 'flex', alignItems: 'center', height: 105, borderBottom: i < 2 ? `1px solid ${C.line}` : 'none'}}>
        <span style={{...label, color: C.ink, width: 383}}>{name}</span>
        <span style={{...value, fontSize: 68, color: selected && i > 0 ? C.blue : C.ink}}>{selected && i > 0 ? <><span style={{fontSize: 43, color: C.muted, marginRight: 22}}>{before[i]} →</span>{after[i]}</> : before[i]}<span style={{fontSize: 38, letterSpacing: 0, marginLeft: 16, fontWeight: 500}}>{units[i]}</span></span>
        {i > 0 && <span style={{position: 'absolute', left: 374, right: 0, height: 94, border: `2px solid ${C.blue}`, borderRadius: 13, opacity: at(t, i === 1 ? 6.95 : 8.05, .4) * (1 - at(t, i === 1 ? 8.0 : 9.6, .55)), pointerEvents: 'none'}}/>}
      </div>)}
      <div style={{...label, position: 'absolute', bottom: 26, left: 32}}>{selected ? '修改已保存 · 20 MW / 280 t/MW / 55 m' : '修改钢耗和水深，保持同一条任务'}</div>
      {pointer && <Pointer x={872} y={195 + 119 * at(t, 8.0, .65)} t={t} clickAt={7.35}/>}
    </React.Fragment>,
  ]}</Rail>;
}

function Handoff({t}: {t: number}) {
  const p = rail(t, [2.45, 4.95]);
  const entries = [
    {title: '几何', format: 'STEP', subtitle: '三维模型进入下一步'},
    {title: '网格', format: 'INP', subtitle: '节点、单元与载荷一并传递'},
    {title: 'BESO', format: 'VTK', subtitle: '读取保存的优化结果'},
  ];
  return <Rail position={p}>{entries.map((entry, i) => <React.Fragment key={entry.title}>
    <div style={label}>文件接力 · 产品工作流示意</div>
    <div style={{display: 'flex', alignItems: 'center', gap: 38, marginTop: 62}}><FileMark size={138}/><div><div style={{...value, fontSize: 88}}>{entry.title}</div><div style={{fontSize: 48, color: C.blue, marginTop: 15, fontWeight: 600}}>{entry.format}</div></div></div>
    <div style={{fontSize: 42, color: C.ink, marginTop: 43}}>{entry.subtitle}</div>
    <div style={{position: 'absolute', left: 32, bottom: 40, display: 'flex', gap: 32, alignItems: 'center', fontSize: 36, color: C.muted}}>{['几何', '网格', 'BESO'].map((word, j) => <React.Fragment key={word}>{j > 0 && <span style={{color: '#9cb7c3'}}>→</span>}<span style={{color: i === j ? C.blue : C.muted, fontWeight: i === j ? 650 : 500, borderBottom: i === j ? `3px solid ${C.blue}` : '3px solid transparent', paddingBottom: 10}}>{word}</span></React.Fragment>)}</div>
  </React.Fragment>)}</Rail>;
}

function Feedback({t, pointer}: {t: number; pointer: boolean}) {
  return <Rail position={rail(t, [4.0, 8.1])}>{[
    <React.Fragment key="failure">
      <div style={label}>保存日志 · 静力求解</div>
      <div style={{...value, marginTop: 55, fontSize: 80, color: C.warm}}>未收敛</div>
      <div style={{display: 'flex', alignItems: 'baseline', gap: 32, marginTop: 35}}><span style={{...label, fontFamily: 'Consolas, monospace'}}>residual_norm</span><span style={{...value, fontSize: 80}}>1.2e−3</span></div>
      <svg width="945" height="100" viewBox="0 0 945 100" style={{marginTop: 25}}><path d="M1 88 C60 5 90 70 150 35 S220 64 300 49 S470 55 570 53 S820 54 944 53" fill="none" stroke={C.warm} strokeWidth="3.5" pathLength="1" strokeDasharray="1" strokeDashoffset={1 - at(t, .65, 1.4)}/><path d="M0 98 H945" stroke={C.line}/></svg>
      <div style={{...label, position: 'absolute', bottom: 26, left: 32}}>残差停滞 · 曲线形态示意</div>
    </React.Fragment>,
    <React.Fragment key="limit">
      <div style={label}>失败记录 → 下一轮任务</div>
      <div style={{fontSize: 48, fontWeight: 600, marginTop: 54}}>调整迭代上限</div>
      <div style={{...value, fontSize: 108, marginTop: 35}}>{replan.iterationLimitBefore}<span style={{fontSize: 60, color: C.muted, margin: '0 33px'}}>→</span><span style={{color: C.blue}}>{replan.iterationLimitAfter}</span></div>
      <div style={{fontSize: 43, color: C.ink, marginTop: 39}}>修改记录和输入文件一并保留</div>
      <div style={{...label, position: 'absolute', bottom: 26, left: 32}}>保存重规划记录 · 重试等待复查</div>
      {pointer && <Pointer x={630} y={268} t={t} clickAt={6.0}/>}
    </React.Fragment>,
    <React.Fragment key="awaiting">
      <div style={label}>重规划状态</div>
      <div style={{display: 'flex', alignItems: 'center', gap: 35, marginTop: 70}}><svg width="102" height="102" viewBox="0 0 102 102"><circle cx="51" cy="51" r="42" fill={C.blueSoft} stroke={C.blue} strokeWidth="2.5"/><path d="M51 23 V51 L70 62" stroke={C.blue} strokeWidth="4" strokeLinecap="round" fill="none"/></svg><span style={{...value, fontSize: 76}}>等待复查</span></div>
      <div style={{fontSize: 44, marginTop: 59, color: C.ink}}>输入、修改与失败原因都可追溯</div>
      <div style={{...label, position: 'absolute', bottom: 26, left: 32}}>保存状态：awaiting_post_check</div>
    </React.Fragment>,
  ]}</Rail>;
}

function BeamSection({t}: {t: number}) {
  const change = at(t, 5.0, 1.0);
  return <svg width="960" height="236" viewBox="0 0 960 236" style={{display: 'block', marginTop: 25}}>
    <defs><linearGradient id="v13-beam-face" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#d3e0e8"/><stop offset=".5" stopColor="#eef5f9"/><stop offset="1" stopColor="#97afbc"/></linearGradient></defs>
    <g transform={`translate(${12 - 18 * change},${18 - 8 * change})`}>
      <path d={`M70 43 L553 7 L553 ${124 + 35 * change} L70 ${160 + 35 * change} Z`} fill="url(#v13-beam-face)" stroke="#93aab5" strokeWidth="1.5"/>
      <path d={`M553 7 L635 43 L635 ${160 + 35 * change} L553 ${124 + 35 * change} Z`} fill="#789cad" stroke="#63869a" strokeWidth="1.5"/>
      <path d="M70 43 L152 79 L635 43 L553 7 Z" fill="#f6fafc" stroke="#9ab1bd" strokeWidth="1.5"/>
      <path d={`M553 7 L635 43 L635 ${160 + 35 * change} L553 ${124 + 35 * change} Z`} fill="#2166d126" stroke={C.blue} strokeWidth="3"/>
      <path d={`M674 38 H703 V${165 + 35 * change} H674`} stroke={C.blue} strokeWidth="3" fill="none"/>
      <text x="736" y="113" fill={C.blue} fontSize="42" fontWeight="600">新截面</text>
    </g>
  </svg>;
}

function Review({t, pointer, assets}: {t: number; pointer: boolean; assets?: ProductWebV13Props['assetOverrides']}) {
  return <Rail position={rail(t, [3.7, 7.9])}>{[
    <React.Fragment key="viewer">
      <div style={label}>暂停复查 · 真实查看器保存画面</div>
      <div style={{display: 'flex', gap: 45, alignItems: 'center', marginTop: 33}}>
        <ExactPixels path={assets?.geometry ?? 'beso-research/web-live/v12/geometry-model.png'} width={361} height={353}/>
        <div><div style={{...value, fontSize: 68}}>由你判断</div><div style={{fontSize: 43, lineHeight: 1.5, color: C.muted, marginTop: 20}}>检查连接<br/>调整关键截面</div></div>
      </div>
      <div style={{...label, position: 'absolute', bottom: 26, left: 32}}>人工操作进入记录</div>
    </React.Fragment>,
    <React.Fragment key="edit">
      <div style={label}>几何修改流程示意</div>
      <div style={{...value, fontSize: 70, marginTop: 33}}>改梁的截面</div>
      <BeamSection t={t}/>
      {pointer && <Pointer x={718} y={285} t={t} clickAt={5.0}/>}
      <div style={{...label, position: 'absolute', bottom: 26, left: 32}}>提交新几何，再建立网格与载荷</div>
    </React.Fragment>,
    <React.Fragment key="invalidated">
      <div style={label}>新几何交回同一条任务</div>
      <div style={{fontSize: 43, marginTop: 50, color: C.muted, textDecoration: 'line-through', textDecorationThickness: 2}}>旧网格 / 旧载荷</div>
      <div style={{...value, fontSize: 76, marginTop: 36, color: C.blue}}>重新生成</div>
      <div style={{fontSize: 47, color: C.ink, marginTop: 32}}>后续按新模型执行</div>
      <div style={{...label, position: 'absolute', bottom: 26, left: 32}}>运行重新执行 · 操作进入记录</div>
    </React.Fragment>,
  ]}</Rail>;
}

function Delivery({t, pointer, assets}: {t: number; pointer: boolean; assets?: ProductWebV13Props['assetOverrides']}) {
  const cursorIndex = Math.min(3, Math.max(0, t - .8) / .8);
  const index = Math.floor(cursorIndex);
  const cursorRow = index + smooth(cursorIndex - index);
  return <div style={{position: 'absolute', inset: 0, padding: '32px', boxSizing: 'border-box'}}>
    <div style={label}>可验证交付 · 产品工作流示意</div>
    <div style={{position: 'absolute', left: 32, top: 115, width: 385}}>
      {['模型', '计算输入', '日志', '报告'].map((name, i) => <div key={name} style={{display: 'flex', alignItems: 'center', gap: 22, height: 91, position: 'relative', borderBottom: i < 3 ? `1px solid ${C.line}` : 'none', color: index === i ? C.blue : C.muted}}><FileMark active={index === i} size={39}/><span style={{fontSize: 46, fontWeight: index === i ? 650 : 500}}>{name}</span><span style={{position: 'absolute', left: -16, width: 4, top: 19, bottom: 19, borderRadius: 2, background: C.blue, opacity: index === i ? 1 : 0}}/></div>)}
    </div>
    <div style={{position: 'absolute', left: 460, top: 133, width: 515, height: 320, transform: `translateY(${14 * (1 - at(t, .5, 1))}px)`}}>
      {assets?.report ? <ExactPixels path={assets.report} width={515} height={320}/> : <>
        <FileMark size={135}/>
        <div style={{...value, fontSize: 68, marginTop: 11}}>{['模型', '计算输入', '日志', '报告'][index]}</div>
        <div style={{fontSize: 36, lineHeight: 1.4, color: C.muted, marginTop: 15}}>{['保留几何与参数', '记录条件与单位', '回看执行与修改', '方案和依据一起带走'][index]}</div>
      </>}
    </div>
    {pointer && <Pointer x={350} y={150 + cursorRow * 91} t={t} clickAt={3.4}/>}
    <div style={{...label, position: 'absolute', left: 32, bottom: 26}}>保留输入、工具日志与结果出处</div>
  </div>;
}

export const ProductWebV13: React.FC<ProductWebV13Props> = ({frame, fps, section = 'auto', mode = 'film', assetOverrides, localSeconds}) => {
  const time = frame / fps;
  const current = section === 'auto' ? productWebSectionAtV13(time) : section;
  if (!current || !Number.isFinite(frame) || !Number.isFinite(fps) || fps <= 0) return null;
  const window = PRODUCT_WEB_V13_WINDOWS[current];
  const t = localSeconds ?? time - window.start;
  const stationary = mode === 'plain';
  if (!stationary && (t < 0 || t >= window.end - window.start)) return null;
  const duration = window.end - window.start;
  const travel = stationary ? 0 : 2100 * (1 - at(t, 0, .8)) - 1400 * at(t, duration - .82, .82);
  const pointer = !stationary;
  return <div data-qa="v13-product-workspace" data-section={current} style={{position: 'absolute', left: 88, top: 354, width: 1080, height: 550, zIndex: 35, transform: `translate3d(${travel}px,0,0)`, fontFamily: 'Microsoft YaHei, Noto Sans CJK SC, sans-serif', color: C.ink, background: 'linear-gradient(125deg,rgba(255,255,255,.985),rgba(242,248,253,.975))', borderRadius: 24, border: `1px solid ${C.line}`, boxShadow: '0 12px 38px rgba(26,64,90,.065)', boxSizing: 'border-box', overflow: 'hidden', pointerEvents: 'none'}}>
    {current === 'demand' && <Demand t={t} pointer={pointer} assets={assetOverrides}/>}
    {current === 'handoff' && <Handoff t={t}/>}
    {current === 'feedback' && <Feedback t={t} pointer={pointer}/>}
    {current === 'review' && <Review t={t} pointer={pointer} assets={assetOverrides}/>}
    {current === 'delivery' && <Delivery t={t} pointer={pointer} assets={assetOverrides}/>}
  </div>;
};

export function ProductWebEndpointV13({section, localSeconds, assetOverrides}: {section: ProductWebSectionV13; localSeconds: number; assetOverrides?: ProductWebV13Props['assetOverrides']}) {
  return <ProductWebV13 frame={0} fps={60} section={section} localSeconds={localSeconds} mode="plain" assetOverrides={assetOverrides}/>;
}

export default ProductWebV13;
