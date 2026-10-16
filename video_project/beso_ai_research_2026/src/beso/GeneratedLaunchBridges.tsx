import React, {CSSProperties} from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, staticFile, useCurrentFrame} from 'remotion';
import bridgeManifest from '../../research/generation/launch-v4-bridges.json';

/** Concept footage conveys environment / representation, never numerical
 * results or product execution. Opaque apertures replace v3 double silhouettes.
 */
export type BridgeSpec = {
  id: string; asset: string; fromFrame: number; durationFrames: number;
  toFrame: number; sourceFps: number; sourceDurationSeconds: number;
  overlapFrames: number; role: string; anchor: string; label: string;
  entryDirection?: 'left' | 'right';
  sourceTrimSeconds?: number;
};
type Manifest = {compositionFps:number;defaultOverlapFrames:number;
  bridges:Array<Omit<BridgeSpec,'durationFrames'|'toFrame'|'overlapFrames'>>};
const manifest=bridgeManifest as Manifest;
export const generatedBridges:BridgeSpec[]=manifest.bridges.map((entry)=>{
  const durationFrames=Math.max(1,Math.floor((entry.sourceDurationSeconds-(entry.sourceTrimSeconds??0))*manifest.compositionFps));
  return {...entry,durationFrames,toFrame:entry.fromFrame+durationFrames,
    overlapFrames:Math.min(24,Math.max(18,manifest.defaultOverlapFrames))};
});
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const t=clamp(v);return t*t*t*(t*(t*6-15)+10);};

// A fixed highlight-preserving RGB transfer matches concept water to the pale
// native camera corridor. Calibrated on real composite seam frames; originals
// are retained. This changes colour only, never global opacity or geometry.
const transferTable=(x:number[],y:number[])=>Array.from({length:256},(_,i)=>{
  let j=0;while(j<x.length-2&&i>x[j+1])j++;
  return ((y[j]+(y[j+1]-y[j])*(i-x[j])/(x[j+1]-x[j]))/255).toFixed(6);
}).join(' ');
const oceanGrades={
  corridor:[
    transferTable([0,37,118,220,255],[62,99,144,216,239]),
    transferTable([0,74,140,220,255],[68,134,162,223,240]),
    transferTable([0,91,152,220,255],[78,145,167,226,242]),
  ],
  close:[
    transferTable([0,44,115,220,255],[80,129,141,216,239]),
    transferTable([0,78,140,220,255],[90,152,160,223,240]),
    transferTable([0,95,155,220,255],[100,160,168,226,242]),
  ],
};
function OceanColourTransfers(){
  return <svg width={0} height={0} style={{position:'absolute',pointerEvents:'none'}} aria-hidden>
    <defs>{Object.entries(oceanGrades).map(([name,t])=><filter key={name}
      id={`launch-bridge-ocean-${name}`} colorInterpolationFilters="sRGB">
      <feComponentTransfer><feFuncR type="table" tableValues={t[0]}/>
        <feFuncG type="table" tableValues={t[1]}/><feFuncB type="table" tableValues={t[2]}/>
      </feComponentTransfer>
    </filter>)}</defs>
  </svg>;
}

/** Semantic HUD can yield to an opaque concept shot. Subtitles and Logo stay. */
export function generatedBridgeCoverageAt(frame:number):number{
  const spec=generatedBridges.find((b)=>frame>=b.fromFrame&&frame<b.toFrame);
  if(!spec)return 0;
  const local=frame-spec.fromFrame;
  return Math.min(smooth(local/spec.overlapFrames),smooth((spec.durationFrames-1-local)/spec.overlapFrames));
}

/** Interior pixels stay opaque; only a 4%-wide traveling shoulder overlaps
 * the native scene. The shared 3D camera keeps moving beneath the aperture. */
function aperture(local:number,spec:BridgeSpec):CSSProperties{
  const edge=spec.overlapFrames,right=spec.entryDirection==='right';
  let mask='linear-gradient(#000, #000)';
  if(local<edge){
    const x=-8+116*smooth(local/edge);
    mask=`linear-gradient(${right?260:100}deg,#000 0%,#000 ${x-2}%,transparent ${x+2}%,transparent 100%)`;
  }else if(local>=spec.durationFrames-edge){
    const x=-8+116*smooth((local-(spec.durationFrames-edge))/(edge-1));
    mask=`linear-gradient(${right?260:100}deg,transparent 0%,transparent ${x-2}%,#000 ${x+2}%,#000 100%)`;
  }
  return {maskImage:mask,WebkitMaskImage:mask};
}
const videoStyle:CSSProperties={width:'100%',height:'100%',objectFit:'cover',display:'block'};
function Bridge({spec}:{spec:BridgeSpec}){
  const local=useCurrentFrame();
  const coverage=Math.min(smooth(local/spec.overlapFrames),smooth((spec.durationFrames-1-local)/spec.overlapFrames));
  const colourGrade=spec.role==='close'?'close':spec.role==='hero'||spec.role==='physics'?'corridor':null;
  return <AbsoluteFill style={{...aperture(local,spec),zIndex:4,pointerEvents:'none'}}>
    <OffthreadVideo muted trimBefore={Math.round((spec.sourceTrimSeconds??0)*manifest.compositionFps)}
      src={staticFile(spec.asset)} style={{...videoStyle,filter:colourGrade?`url(#launch-bridge-ocean-${colourGrade})`:undefined}}/>
    <div style={{position:'absolute',left:82,top:86,color:'#f5faf7',fontSize:23,
      fontWeight:550,letterSpacing:1.2,lineHeight:1.3,padding:'7px 13px 8px',
      borderLeft:'2px solid #bcdbc9',background:'linear-gradient(90deg,rgba(17,44,52,.70),rgba(17,44,52,.12))',
      textShadow:'0 1px 7px rgba(5,28,34,.5)',opacity:coverage}}>概念画面</div>
  </AbsoluteFill>;
}
export function GeneratedLaunchBridges(){
  return <><OceanColourTransfers/>{generatedBridges.map((spec)=><Sequence key={spec.id} from={spec.fromFrame}
    durationInFrames={spec.durationFrames} layout="none"><Bridge spec={spec}/></Sequence>)}</>;
}
