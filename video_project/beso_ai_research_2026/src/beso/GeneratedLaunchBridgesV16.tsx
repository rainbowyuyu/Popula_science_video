import React from 'react';
import {AbsoluteFill,Sequence,OffthreadVideo,Img,staticFile,useCurrentFrame} from 'remotion';
import manifest from '../../research/generation/launch-v16-bridges.json';

export type LaunchBridgeV16={
 id:string;asset:string;fromFrame:number;sourceDurationSeconds:number;
 selection:string;overlapFrames?:number;sourceFps?:number;role?:string;
};
export const bridgesV16=(manifest.bridges as LaunchBridgeV16[]).filter(b=>b.selection==='selected');
const smooth=(x:number)=>{const t=Math.max(0,Math.min(1,x));return t*t*t*(t*(6*t-15)+10)};
export const BRIDGE_PRELUDE_V16={fromFrame:990,revealFrames:30,holdFrames:24,asset:"generated/v16/anchors/blueprint-17s.png"} as const;
const paperBridge=()=>bridgesV16.find(b=>b.id==="v16-paper-to-platform");
export function bridgeCoverageV16(frame:number){
 const b=bridgesV16.find(clip=>frame>=clip.fromFrame&&frame<clip.fromFrame+Math.round(clip.sourceDurationSeconds*60));
 if(!b){if(paperBridge()&&frame>=990&&frame<1020)return smooth((frame-990)/29);return 0;}
 const local=frame-b.fromFrame,duration=Math.round(b.sourceDurationSeconds*60),overlap=b.overlapFrames??24;
 if(b.id==="v16-paper-to-platform"&&local<overlap)return 1;
 return smooth(local/overlap)*smooth((duration-1-local)/overlap);
}
function BridgeLayer({b}:{b:LaunchBridgeV16}){
 const local=useCurrentFrame(),duration=Math.round(b.sourceDurationSeconds*60),overlap=b.overlapFrames??24;
 // Full opacity between endpoint overlaps prevents two differently lit hulls
 // being visible at once. No screen drift or crop: preserve endpoint alignment.
 const alpha=smooth(local/overlap)*smooth((duration-1-local)/overlap);
 return <AbsoluteFill style={{zIndex:5,pointerEvents:'none',opacity:alpha}}>
  <OffthreadVideo src={staticFile(b.asset)} muted playbackRate={1} style={{width:1920,height:1080,objectFit:'cover'}}/>
 </AbsoluteFill>;
}
export function GeneratedLaunchBridgesV16(){return <>{bridgesV16.map(b=><Sequence key={b.id} from={b.fromFrame} durationInFrames={Math.round(b.sourceDurationSeconds*60)} layout="none"><BridgeLayer b={b}/></Sequence>)}</>;}

function BlueprintPreludeLayer(){
 const frame=useCurrentFrame(),progress=smooth(frame/29);
 // A soft ink boundary expands from the hub toward the edges. The exact
 // immutable input stays aligned and fully held beneath the first overlap;
 // removing it only when generated coverage reaches one prevents a flash
 // back to the native water at frame 1020.
 const radius=140*progress,inner=Math.max(0,radius-9);
 const mask=`radial-gradient(ellipse at 66% 68%,#000 0%,#000 ${inner}%,transparent ${radius}%)`;
 return <AbsoluteFill style={{zIndex:5,pointerEvents:'none',opacity:frame===0?0:1,maskImage:mask,WebkitMaskImage:mask}}>
  <Img src={staticFile(BRIDGE_PRELUDE_V16.asset)} style={{width:1920,height:1080,objectFit:'cover'}}/>
 </AbsoluteFill>;
}
/** Render immediately before GeneratedLaunchBridgesV16 in the layer tree. */
export function BridgePreludeV16(){return paperBridge()?<Sequence from={990} durationInFrames={54} layout="none"><BlueprintPreludeLayer/></Sequence>:null;}
