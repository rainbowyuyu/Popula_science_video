import React from 'react';
import {AbsoluteFill,Sequence,OffthreadVideo,staticFile,useCurrentFrame} from 'remotion';
import manifest from '../../research/generation/launch-v13-bridges.json';

type Bridge={id:string;asset:string;fromFrame:number;sourceDurationSeconds:number;selection:string};
export const bridgesV15=(manifest.bridges as Bridge[]).filter(b=>b.selection==='selected');
function BridgeLayer({b}:{b:Bridge}){
 // Original 30 fps footage is sampled on the 60 fps timeline at real time.
 // Keep the generated shot as a visual bridge, but let the native world breathe
 // through its edges. A short deterministic ramp prevents the Qwen/WAN frame
 // from landing as a hard rectangular cut over the persistent model.
 const local=useCurrentFrame()/60;
 const smooth=(v:number)=>{const x=Math.max(0,Math.min(1,v));return x*x*x*(x*(6*x-15)+10)};
 const fadeIn=smooth(local/.56),fadeOut=smooth((b.sourceDurationSeconds-local)/.68);
 const alpha=.74*fadeIn*fadeOut;
 const driftX=2.8*Math.sin(local*.52+b.fromFrame*.01),driftY=1.8*Math.sin(local*.77+b.fromFrame*.017);
 return <AbsoluteFill style={{zIndex:5,pointerEvents:'none',opacity:alpha,filter:'saturate(.92) contrast(1.035)',maskImage:'radial-gradient(ellipse at 50% 51%,#000 0%,#000 72%,transparent 100%)',WebkitMaskImage:'radial-gradient(ellipse at 50% 51%,#000 0%,#000 72%,transparent 100%)'}}>
   <OffthreadVideo src={staticFile(b.asset)} muted playbackRate={1} style={{width:1920,height:1080,objectFit:'cover',transform:`scale(1.018) translate3d(${driftX}px,${driftY}px,0)`}}/>
 </AbsoluteFill>;
}
export function GeneratedLaunchBridgesV15(){return <>{bridgesV15.map(b=><Sequence key={b.id} from={b.fromFrame} durationInFrames={Math.round(b.sourceDurationSeconds*60)} layout="none"><BridgeLayer b={b}/></Sequence>)}</>;}

