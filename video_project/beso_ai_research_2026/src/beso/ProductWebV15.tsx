import React from 'react';
import {Img, staticFile} from 'remotion';
import checklist from '../../public/beso-research/web-live/v7/visual-data.json';
import replan from '../../public/beso-research/web-live/v7/replan-visual.json';

/** Source-backed promotional layout. Saved data and original viewer pixels;
 * no live product operation, generated numerical result or new solve. */
export type ProductWebSectionV15 = 'demand' | 'handoff' | 'feedback' | 'review' | 'delivery';
export type ProductWebModeV15 = 'film' | 'plain' | 'withoutBrand';
export interface ProductWebV15Props {
  frame: number;
  fps: number;
  section?: ProductWebSectionV15 | 'auto';
  mode?: ProductWebModeV15;
  assetOverrides?: {demand?: string; geometry?: string; report?: string};
  localSeconds?: number;
}

export const PRODUCT_WEB_V15_WINDOWS = {
  demand: {start: 11, end: 23},
  handoff: {start: 23, end: 31.5},
  feedback: {start: 53, end: 65},
  review: {start: 65, end: 79},
  delivery: {start: 79, end: 85.65},
} as const;

/**
 * Fixed safe viewport.  The page is authored on a 1050×520 canvas so the
 * source-backed screenshots and SVGs keep their original coordinates.  It is
 * shown at 82% in the film; this gives the page room to breathe on a 16:9
 * frame and leaves the ocean/model camera visible around it.
 */
export const PRODUCT_WEB_V15_LAYOUT = {left: 88, top: 430, width: 1050, height: 520, padding: 36, pageGap: 100} as const;
export const PRODUCT_WEB_V15_SCALE = .82;
export const PRODUCT_WEB_V15_TYPE = {headline: 56, body: 42, label: 36, number: 64} as const;
const W = PRODUCT_WEB_V15_LAYOUT.width, H = PRODUCT_WEB_V15_LAYOUT.height, P = PRODUCT_WEB_V15_LAYOUT.padding;
// Product UI is a dark marine-glass trace rather than an opaque white card.
// Pale ink and a single aqua accent keep the saved pixels readable while
// allowing the moving sea/model to remain visible through the surface.
const C = {ink: '#edf8f7', muted: '#b5d1d4', blue: '#9fe0d9', blueSoft: 'rgba(151,224,219,.14)', line: 'rgba(171,224,224,.26)', warm: '#ffd09c'};
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smooth = (v: number) => {const x = clamp(v); return x*x*x*(x*(6*x-15)+10);};
const at = (t: number, start: number, duration = .72) => smooth((t-start)/duration);
const rail = (t: number, points: number[]) => points.reduce((sum, p) => sum+at(t,p),0);
const textDepth: React.CSSProperties = {textShadow:'0 1px 1px rgba(0,18,25,.76), 0 0 12px rgba(0,20,28,.42)', textRendering:'geometricPrecision'};
const label: React.CSSProperties = {fontSize: 36, lineHeight: 1.25, fontWeight: 550, color: C.muted, ...textDepth};
const body: React.CSSProperties = {fontSize: 42, lineHeight: 1.32, fontWeight: 500, color: C.ink, ...textDepth};
const headline: React.CSSProperties = {fontSize: 56, lineHeight: 1.18, fontWeight: 680, letterSpacing: -.7, color: C.ink, ...textDepth};
const number: React.CSSProperties = {fontSize: 64, lineHeight: 1.16, fontWeight: 680, letterSpacing: -1, color: C.ink, fontVariantNumeric: 'tabular-nums', ...textDepth};
// Keep the provenance line above the lower title lane in the wide film frame;
// it remains part of the panel, but no longer competes with the main shot title.
const footer: React.CSSProperties = {...label, position: 'absolute', left: P, right: P, bottom: 96};

function GlassChrome({section,time}:{section:ProductWebSectionV15;time:number}){
  const pulse=.5+.5*Math.sin(time*2.2);
  const title={demand:'DEMAND / CONSTRAINTS',handoff:'MODEL HANDOFF',feedback:'FAILURE / FEEDBACK',review:'HUMAN REVIEW',delivery:'EVIDENCE / DELIVERY'}[section];
  const chapter={demand:'02',handoff:'03',feedback:'05',review:'06',delivery:'07'}[section];
  return <>
    <div data-qa="v15-glass-topline" style={{position:'absolute',left:0,right:0,top:0,height:30,zIndex:4,borderBottom:'1px solid rgba(171,224,224,.22)',background:'linear-gradient(180deg,rgba(168,228,225,.13),rgba(7,34,45,.08))',display:'flex',alignItems:'center',padding:'0 22px',boxSizing:'border-box',fontFamily:'Consolas,Microsoft YaHei,sans-serif',letterSpacing:1.4,fontSize:18,color:'#c5e4e4'}}>
      <span style={{fontSize:20,fontWeight:700,letterSpacing:1,color:'#e6bd88',marginRight:10}}>{chapter}</span>
      <span style={{width:8,height:8,borderRadius:'50%',background:'#c68c58',boxShadow:`0 0 ${7+7*pulse}px rgba(198,140,88,.55)`,marginRight:11}}/>
      <span style={{fontWeight:650}}>AI ENGINEER</span><span style={{opacity:.42,margin:'0 12px'}}>／</span><span style={{opacity:.74}}>{title}</span>
      <span style={{marginLeft:'auto',fontVariantNumeric:'tabular-nums',opacity:.5}}>LIVE TRACE&nbsp; {String(Math.max(0,Math.floor(time*10))).padStart(4,'0')}</span>
    </div>
    <div style={{position:'absolute',left:0,top:30,width:260,height:2,zIndex:5,background:'linear-gradient(90deg,#d19f69,#579fa7,transparent)',opacity:.82}}/>
    <div style={{position:'absolute',inset:0,zIndex:3,pointerEvents:'none',background:'radial-gradient(circle at 88% 5%,rgba(92,194,194,.18),transparent 28%),radial-gradient(circle at 12% 112%,rgba(210,161,107,.13),transparent 34%)',mixBlendMode:'screen'}}/>
    <div style={{position:'absolute',left:0,right:0,bottom:0,height:1,zIndex:4,background:'linear-gradient(90deg,transparent,rgba(105,157,173,.45),transparent)'}}/>
  </>;
}

export function productWebSectionAtV15(time: number): ProductWebSectionV15 | null {
  return (Object.keys(PRODUCT_WEB_V15_WINDOWS) as ProductWebSectionV15[]).find(k=>time>=PRODUCT_WEB_V15_WINDOWS[k].start&&time<PRODUCT_WEB_V15_WINDOWS[k].end)??null;
}

export const PRODUCT_WEB_V15_ENDPOINTS = [
  {id:'demand-composer',section:'demand',localSeconds:2.5},
  {id:'demand-written-back',section:'demand',localSeconds:9.6},
  {id:'geometry-file',section:'handoff',localSeconds:1.0},
  {id:'mesh-file',section:'handoff',localSeconds:2.3},
  {id:'beso-file',section:'handoff',localSeconds:4.0},
  {id:'failure-log',section:'feedback',localSeconds:2.1},
  {id:'replan-record',section:'feedback',localSeconds:6.9},
  {id:'review-viewer',section:'review',localSeconds:2.2},
  {id:'new-geometry',section:'review',localSeconds:6.3},
  {id:'delivery-evidence',section:'delivery',localSeconds:4.4},
] as const;

function Pointer({x,y,t,clickAt=Infinity}:{x:number;y:number;t:number;clickAt?:number}) {
  const click=at(t,clickAt,.12)*(1-at(t,clickAt+.19,.36));
  return <div data-qa="v15-pointer" style={{position:'absolute',left:x,top:y,zIndex:5,transform:`scale(${1-.08*click})`,transformOrigin:'0 0'}}>
    <svg width="44" height="54" viewBox="0 0 50 60"><path d="M5 3 L41 34 L25 35 L32 50 L24 54 L17 39 L6 50 Z" fill={C.ink} stroke="#fff" strokeWidth="3" strokeLinejoin="round"/></svg>
    <span style={{position:'absolute',left:-19,top:-19,width:38,height:38,border:`2px solid ${C.blue}`,borderRadius:'50%',opacity:click,transform:`scale(${1+.6*click})`}}/>
  </div>;
}

function FileMark({active=true,size=92}:{active?:boolean;size?:number}) {
  return <svg width={size} height={size*1.2} viewBox="0 0 100 120" style={{flexShrink:0,filter:'drop-shadow(0 2px 6px rgba(0,15,22,.35))'}}><path d="M15 6 H61 L88 33 V111 H15 Z" fill={active?'rgba(135,218,216,.17)':'rgba(220,245,243,.05)'} stroke={active?C.blue:'rgba(189,220,222,.56)'} strokeWidth="2.2"/><path d="M61 6 V33 H88 M32 58 H70 M32 75 H70 M32 92 H58" fill="none" stroke={active?C.blue:'rgba(189,220,222,.56)'} strokeWidth="2.2" strokeLinejoin="round"/></svg>;
}

/** One stationary viewport, with a frame-driven internal page rail. */
function Rail({position,children}:{position:number;children:React.ReactNode[]}) {
  return <div style={{position:'absolute',inset:0,overflow:'hidden'}}><div style={{position:'absolute',left:0,top:0,display:'flex',gap:PRODUCT_WEB_V15_LAYOUT.pageGap,transform:`translate3d(${-position*(W+PRODUCT_WEB_V15_LAYOUT.pageGap)}px,0,0)`}}>
    {children.map((child,i)=><div data-qa={`v15-workspace-step-${i}`} key={i} style={{width:W,height:H,position:'relative',flexShrink:0,padding:P,boxSizing:'border-box'}}>{child}</div>)}
  </div></div>;
}

/** Preserve the original pixels and aspect ratio. Micro-labels are not reading targets. */
function ExactPixels({path,width,height,connectionCrop=false}:{path:string;width:number;height:number;connectionCrop?:boolean}) {
  return <div data-qa="v15-source-pixels" style={{width,height,overflow:'hidden',borderRadius:12,background:'#081827',position:'relative'}}><Img src={staticFile(path)} style={connectionCrop?{position:'absolute',width:468,height:'auto',left:-40,top:-95,display:'block'}:{width,height,objectFit:'contain',display:'block'}}/></div>;
}

function Demand({t,pointer,assets}:{t:number;pointer:boolean;assets?:ProductWebV15Props['assetOverrides']}) {
  const selected=t>=7.45, initial=checklist.steps[0], changed=checklist.steps[1];
  const before=[initial.capacityMW,initial.steelTargetTperMW,initial.waterDepthM];
  const after=[changed.capacityMW,changed.steelTargetTperMW,changed.waterDepthM];
  const names=['额定功率','单位功率用钢量','场址水深'],units=['MW','t/MW','m'];
  return <Rail position={rail(t,[3.8])}>{[
    <React.Fragment key="composer">
      <div style={label}>工程目标</div>
      {assets?.demand?<div style={{marginTop:55}}><ExactPixels path={assets.demand} width={W-P*2} height={230}/></div>:<>
        <div style={{...headline,marginTop:47}}>设计 <span style={{...number,color:C.blue}}>20 MW</span></div>
        <div style={{...headline,marginTop:15}}>半潜式漂浮风机基础</div>
        <div style={{...body,marginTop:32,color:C.muted}}>水深 <b style={{color:C.ink,fontWeight:600}}>45 m</b> · 钢耗 <b style={{color:C.ink,fontWeight:600}}>300 t/MW</b></div>
      </>}
      <div style={{position:'absolute',right:40,bottom:90,width:76,height:76,borderRadius:'50%',background:C.blue,display:'grid',placeItems:'center',transform:`scale(${1-.045*(at(t,2.9,.12)-at(t,3.1,.25))})`}}><svg width="42" height="42" viewBox="0 0 48 48"><path d="M10 24 H36 M25 12 L37 24 L25 36" stroke="white" strokeWidth="3" strokeLinecap="round" fill="none"/></svg></div>
      {pointer&&<Pointer x={800+177*at(t,1.9,.8)} y={346+23*at(t,1.9,.8)} t={t} clickAt={2.9}/>}
      <div style={footer}>本地规则解析 · 保存数据重排</div>
    </React.Fragment>,
    <React.Fragment key="parameters">
      <div style={label}>写回同一份清单</div>
      {names.map((name,i)=><div key={name} data-qa={`v15-parameter-${i}`} style={{position:'absolute',left:P,right:P,top:106+i*109,height:96,display:'flex',alignItems:'center',borderBottom:i<2?`1px solid ${C.line}`:'none'}}>
        <span style={{...body,width:365,flexShrink:0}}>{name}</span>
        <span style={{...number,color:selected&&i>0?C.blue:C.ink,whiteSpace:'nowrap'}}>{selected&&i>0?<><span style={{...body,color:C.muted,marginRight:18}}>{before[i]} →</span>{after[i]}</>:before[i]}<span style={{...body,marginLeft:14,fontWeight:500}}>{units[i]}</span></span>
        {i>0&&<span style={{position:'absolute',left:355,right:0,height:86,border:`1.5px solid ${C.blue}`,borderRadius:9,opacity:at(t,i===1?6.95:8.05,.4)*(1-at(t,i===1?8.0:9.6,.55))}}/>}
      </div>)}
      <div style={footer}>{selected?'修改已保存 · 任务保持一致':'修改钢耗与水深'}</div>
      {pointer&&<Pointer x={880} y={213+109*at(t,8.0,.65)} t={t} clickAt={7.35}/>}
    </React.Fragment>,
  ]}</Rail>;
}

function Handoff({t}:{t:number}) {
  // BESO is fully readable by26.72s, before its spoken cue at26.77s.
  const entries=[{title:'几何',format:'STEP',subtitle:'模型交给下一步'},{title:'网格',format:'INP',subtitle:'传递节点、单元与载荷'},{title:'BESO',format:'VTK',subtitle:'读取保存的优化结果'}];
  return <Rail position={rail(t,[1.45,3.0])}>{entries.map((entry,i)=><React.Fragment key={entry.title}>
    <div style={label}>产品工作流示意</div>
    <div style={{position:'absolute',left:P,top:130,display:'flex',alignItems:'center',gap:35}}><FileMark size={104}/><div><div style={headline}>{entry.title}</div><div style={{...body,color:C.blue,fontWeight:600,marginTop:14}}>{entry.format}</div></div></div>
    <div style={{...body,position:'absolute',left:P,top:314}}>{entry.subtitle}</div>
    <div style={{...footer,display:'flex',gap:30,alignItems:'center'}}>{['几何','网格','BESO'].map((word,j)=><React.Fragment key={word}>{j>0&&<span style={{color:'#99b0bd'}}>→</span>}<span style={{color:i===j?C.blue:C.muted,fontWeight:i===j?600:500,borderBottom:i===j?`2px solid ${C.blue}`:'2px solid transparent',paddingBottom:8}}>{word}</span></React.Fragment>)}</div>
  </React.Fragment>)}</Rail>;
}

function Feedback({t,pointer}:{t:number;pointer:boolean}) {
  return <Rail position={rail(t,[4.0,8.1])}>{[
    <React.Fragment key="failure">
      <div style={label}>保存日志 · 静力求解</div>
      <div style={{...headline,position:'absolute',left:P,top:106,color:C.warm}}>未收敛</div>
      <div style={{position:'absolute',left:P,top:200,display:'flex',alignItems:'baseline',gap:30}}><span style={{...label,fontFamily:'Consolas, monospace'}}>residual_norm</span><span style={number}>1.2e−3</span></div>
      <svg width="974" height="92" viewBox="0 0 974 92" style={{position:'absolute',left:P,top:308}}><path d="M1 79 C60 5 90 62 150 31 S220 56 300 43 S470 49 570 47 S820 48 973 47" fill="none" stroke={C.warm} strokeWidth="3" pathLength="1" strokeDasharray="1" strokeDashoffset={1-at(t,.65,1.4)}/><path d="M0 90 H974" stroke={C.line}/></svg>
      <div style={footer}>残差停滞 · 曲线形态示意</div>
    </React.Fragment>,
    <React.Fragment key="limit">
      <div style={label}>保存重规划记录</div>
      <div style={{...headline,position:'absolute',left:P,top:112}}>调整迭代上限</div>
      <div style={{...number,position:'absolute',left:P,top:211}}>{replan.iterationLimitBefore}<span style={{...body,color:C.muted,margin:'0 28px'}}>→</span><span style={{color:C.blue}}>{replan.iterationLimitAfter}</span></div>
      <div style={{...body,position:'absolute',left:P,top:325}}>修改和输入一并保留</div>
      <div style={footer}>下一轮任务 · 等待复查</div>
      {pointer&&<Pointer x={426} y={232} t={t} clickAt={6.0}/>}
    </React.Fragment>,
    <React.Fragment key="awaiting">
      <div style={label}>重规划状态</div>
      <div style={{position:'absolute',left:P,top:143,display:'flex',alignItems:'center',gap:30}}><svg width="88" height="88" viewBox="0 0 102 102"><circle cx="51" cy="51" r="42" fill={C.blueSoft} stroke={C.blue} strokeWidth="2"/><path d="M51 23 V51 L70 62" stroke={C.blue} strokeWidth="3.5" strokeLinecap="round" fill="none"/></svg><span style={headline}>等待复查</span></div>
      <div style={{...body,position:'absolute',left:P,top:310}}>输入、修改与失败原因可追溯</div>
      <div style={footer}>保存状态：awaiting_post_check</div>
    </React.Fragment>,
  ]}</Rail>;
}

function BeamSection({t}:{t:number}) {
  const change=at(t,5.0,1.0),bottom=147+32*change;
  return <svg width="974" height="216" viewBox="0 0 974 216" style={{position:'absolute',left:P,top:195}}>
    <defs><linearGradient id="v15-beam-face" x1="0" y1="0" x2="1" y2="1"><stop stopColor="#dbe6ec"/><stop offset=".5" stopColor="#f1f6f9"/><stop offset="1" stopColor="#a6bdc8"/></linearGradient></defs>
    <g transform={`translate(${12-10*change},${7-5*change})`}>
      <path d={`M34 43 L536 7 L536 ${bottom-36} L34 ${bottom} Z`} fill="url(#v15-beam-face)" stroke="#a1b7c1" strokeWidth="1.4"/>
      <path d={`M536 7 L617 43 L617 ${bottom} L536 ${bottom-36} Z`} fill="#779eaf" stroke="#6e92a3" strokeWidth="1.4"/>
      <path d="M34 43 L115 79 L617 43 L536 7 Z" fill="#f7fafc" stroke="#a1b7c1" strokeWidth="1.4"/>
      <path d={`M536 7 L617 43 L617 ${bottom} L536 ${bottom-36} Z`} fill="#2569cb20" stroke={C.blue} strokeWidth="2.5"/>
      <path d={`M657 36 H685 V${bottom+7} H657`} stroke={C.blue} strokeWidth="2.5" fill="none"/>
      <text x="715" y="112" fill={C.blue} fontSize="36" fontWeight="600">新截面</text>
    </g>
  </svg>;
}

function Review({t,pointer,assets}:{t:number;pointer:boolean;assets?:ProductWebV15Props['assetOverrides']}) {
  return <Rail position={rail(t,[3.7,7.9])}>{[
    <React.Fragment key="viewer">
      <div style={label}>真实查看器 · 保存画面</div>
      <div style={{position:'absolute',left:P,top:112,display:'flex',gap:44,alignItems:'center'}}><ExactPixels path={assets?.geometry??'beso-research/web-live/v12/geometry-model.png'} width={396} height={332} connectionCrop={!assets?.geometry}/><div style={{width:440}}><div style={headline}>由你判断</div><div style={{...body,color:C.muted,marginTop:29,lineHeight:1.46}}>检查连接<br/>调整关键截面</div></div></div>
      <div style={footer}>人工操作进入记录</div>
    </React.Fragment>,
    <React.Fragment key="edit">
      <div style={label}>几何修改流程示意</div>
      <div style={{...headline,position:'absolute',left:P,top:111}}>改梁的截面</div>
      <BeamSection t={t}/>
      {pointer&&<Pointer x={715} y={282} t={t} clickAt={5.0}/>}
      <div style={footer}>提交新几何，重建网格与载荷</div>
    </React.Fragment>,
    <React.Fragment key="invalidated">
      <div style={label}>新几何交回任务</div>
      <div style={{...body,position:'absolute',left:P,top:128,color:C.muted,textDecoration:'line-through',textDecorationThickness:2}}>旧网格 / 旧载荷</div>
      <div style={{...headline,position:'absolute',left:P,top:228,color:C.blue}}>重新生成</div>
      <div style={{...body,position:'absolute',left:P,top:322}}>后续按新模型执行</div>
      <div style={footer}>几何修改流程示意 · 操作留痕</div>
    </React.Fragment>,
  ]}</Rail>;
}

function Delivery({t,pointer,assets}:{t:number;pointer:boolean;assets?:ProductWebV15Props['assetOverrides']}) {
  const cursorIndex=Math.min(3,Math.max(0,t-.8)/.8),index=Math.floor(cursorIndex),cursorRow=index+smooth(cursorIndex-index);
  const names=['模型','计算输入','日志','报告'];
  return <div style={{position:'absolute',inset:0,padding:P,boxSizing:'border-box'}}>
    <div style={label}>可验证交付 · 工作流示意</div>
    <div style={{position:'absolute',left:P,top:118,width:352}}>{names.map((name,i)=><div key={name} style={{display:'flex',alignItems:'center',gap:20,height:78,position:'relative',borderBottom:i<3?`1px solid ${C.line}`:'none',color:index===i?C.blue:C.muted}}><FileMark active={index===i} size={33}/><span style={{...body,color:'inherit',fontWeight:index===i?600:500}}>{name}</span><span style={{position:'absolute',left:-15,width:3,top:18,bottom:18,borderRadius:2,background:C.blue,opacity:index===i?1:0}}/></div>)}</div>
    <div style={{position:'absolute',left:455,top:132,width:530,height:290,transform:`translateY(${10*(1-at(t,.5,1))}px)`}}>{assets?.report?<ExactPixels path={assets.report} width={530} height={290}/>:<><FileMark size={96}/><div style={{...headline,marginTop:20}}>{names[index]}</div><div style={{...body,color:C.muted,marginTop:16}}>{['保留几何与参数','记录条件与单位','回看执行与修改','方案与依据一起带走'][index]}</div></>}</div>
    {pointer&&<Pointer x={348} y={148+cursorRow*78} t={t} clickAt={3.4}/>}
    <div style={footer}>保留输入、日志与结果出处</div>
  </div>;
}

export const ProductWebV15:React.FC<ProductWebV15Props>=({frame,fps,section='auto',mode='film',assetOverrides,localSeconds})=>{
  if(!Number.isFinite(frame)||!Number.isFinite(fps)||fps<=0)return null;
  const time=frame/fps,current=section==='auto'?productWebSectionAtV15(time):section;
  if(!current)return null;
  const window=PRODUCT_WEB_V15_WINDOWS[current],t=localSeconds??time-window.start,stationary=mode==='plain',duration=window.end-window.start;
  // Keep the plain endpoint at its authored pixel size for QA/source review;
  // only the film presentation gets the smaller, sea-integrated footprint.
  const visualScale=mode==='plain'?1:PRODUCT_WEB_V15_SCALE;
  if(!stationary&&(t<0||t>=duration))return null;
  // Entry and exit share one camera rail.  Exit uses a longer runway so the
  // card clears the viewport completely; the former distance left a narrow
  // strip of text at x=0 during section handoffs.
  const exitDuration=1.15;
  const exitProgress=stationary?0:at(t,duration-exitDuration,exitDuration);
  // The card is wider than the reading lane.  Finish the pan before the
  // fade reaches zero so no pointer, chrome, or partial glyph can remain at
  // the left edge of the next shot.
  const travel=stationary?0:(W+P)*(1-at(t,0,.72))-(W+P)*1.9*exitProgress;
  // The page is a floating instrument surface.  A barely perceptible vertical
  // drift ties its type and chrome to the wave rhythm instead of making it
  // feel like a slide pasted over the ocean.  Keep the drift tiny so saved
  // screenshots and callout anchors remain stable.
  const waveBob=stationary?0:2.6*Math.sin(t*1.05+.55)+1.1*Math.sin(t*1.85);
  const waveTilt=stationary?0:.16*Math.sin(t*.78+.3);
  const pointer=!stationary;
  return <div data-qa="v15-product-viewport" data-section={current} style={{position:'absolute',left:PRODUCT_WEB_V15_LAYOUT.left,top:PRODUCT_WEB_V15_LAYOUT.top,width:W*visualScale,height:H*visualScale,zIndex:35,overflow:'visible',pointerEvents:'none',filter:'drop-shadow(0 12px 26px rgba(2,24,34,.22))',transform:`translate3d(0,${waveBob}px,0) rotateZ(${waveTilt}deg)`,transformOrigin:'18% 50%',perspective:2200,transformStyle:'preserve-3d'}}>
    {/* The source-backed page is an evidence plane in the scene.  Its old
        rounded opaque rectangle read as a slide deck; this soft local wash
        keeps the saved pixels readable while letting the sea and platform
        continue through the edges. */}
    <div aria-hidden="true" style={{position:'absolute',left:-90,top:H*visualScale*.26,width:W*visualScale*1.06,height:H*visualScale*.76,background:'radial-gradient(ellipse 52% 70% at 36% 62%,rgba(4,25,35,.30),rgba(4,25,35,.12) 54%,transparent 84%)',filter:'blur(23px)',opacity:stationary?1:.88,pointerEvents:'none',zIndex:0}}/>
    <div data-qa="v15-product-workspace" style={{position:'absolute',left:0,top:0,width:W,height:H,transform:`translate3d(${travel}px,0,0) scale(${visualScale})`,transformOrigin:'top left',opacity:stationary?1:Math.max(0,1-1.8*exitProgress),maskImage:'none',WebkitMaskImage:'none',fontFamily:'Microsoft YaHei, Noto Sans CJK SC, sans-serif',color:C.ink,background:'transparent',backdropFilter:'none',WebkitBackdropFilter:'none',borderRadius:0,border:'none',boxShadow:'none',boxSizing:'border-box',overflow:'hidden',transformStyle:'preserve-3d'}}>
      <GlassChrome section={current} time={t}/>
      {current==='demand'&&<Demand t={t} pointer={pointer} assets={assetOverrides}/>}
      {current==='handoff'&&<Handoff t={t}/>}
      {current==='feedback'&&<Feedback t={t} pointer={pointer}/>}
      {current==='review'&&<Review t={t} pointer={pointer} assets={assetOverrides}/>}
      {current==='delivery'&&<Delivery t={t} pointer={pointer} assets={assetOverrides}/>}
    </div>
    {exitProgress>0&&<div aria-hidden="true" style={{position:'absolute',inset:0,zIndex:20,pointerEvents:'none',opacity:exitProgress,background:'linear-gradient(90deg,rgba(236,246,249,.98) 0%,rgba(236,246,249,.82) 5%,rgba(236,246,249,0) 18%,transparent 100%)'}}/>}
  </div>;
};

export function ProductWebEndpointV15({section,localSeconds,assetOverrides}:{section:ProductWebSectionV15;localSeconds:number;assetOverrides?:ProductWebV15Props['assetOverrides']}) {
  return <ProductWebV15 frame={0} fps={60} section={section} localSeconds={localSeconds} mode="plain" assetOverrides={assetOverrides}/>;
}

export default ProductWebV15;

