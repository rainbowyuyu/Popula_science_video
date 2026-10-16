import React from 'react';
import {AbsoluteFill,OffthreadVideo,Sequence,staticFile,useCurrentFrame} from 'remotion';
import accepted from '../../research/generation/launch-v6-bridges.json';

export type LaunchBridgeV6={
 id:string;asset:string;fromFrame:number;durationFrames:number;
 sourceFps:number;sourceDurationSeconds:number;sourceSHA256:string;
 overlapFrames:number;entryDirection:'left'|'right';reviewed:boolean;
};
export const launchBridgesV6=(accepted.bridges as LaunchBridgeV6[]).filter(b=>b.reviewed);
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const smooth=(x:number)=>{const q=clamp(x);return q*q*q*(q*(6*q-15)+10)};
export function launchBridgeCoverageV6(frame:number){
 const b=launchBridgesV6.find(b=>frame>=b.fromFrame&&frame<b.fromFrame+b.durationFrames);
 if(!b)return 0;
 const f=frame-b.fromFrame;
 return Math.min(smooth(f/b.overlapFrames),smooth((b.durationFrames-1-f)/b.overlapFrames));
}

/** The generated shot contains no UI, logo, labels or solver values. Real UI
 * and the native camera continue on their own frame timeline above/below it.
 * Only the matched endpoints overlap; source playback remains normal speed. */
function MatchedBridge({spec}:{spec:LaunchBridgeV6}){
 const f=useCurrentFrame(),n=spec.durationFrames,edge=spec.overlapFrames;
 const entry=smooth(f/edge),exit=smooth((n-1-f)/edge),coverage=Math.min(entry,exit);
 const direction=spec.entryDirection==='left'?100:260;
 let mask='linear-gradient(#000,#000)';
 if(f<edge){const x=-6+112*entry;mask=`linear-gradient(${direction}deg,#000 ${x-2}%,transparent ${x+2}%)`}
 else if(f>=n-edge){const x=-6+112*(1-exit);mask=`linear-gradient(${direction}deg,transparent ${x-2}%,#000 ${x+2}%)`}
 return <><AbsoluteFill data-qa="qwen-bridge" style={{zIndex:4,pointerEvents:'none',maskImage:mask,WebkitMaskImage:mask}}>
  <OffthreadVideo muted src={staticFile(spec.asset)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
 </AbsoluteFill><div data-qa="concept-label" style={{position:'absolute',left:92,top:145,zIndex:75,fontSize:28,fontWeight:500,color:'#173b4b',letterSpacing:.8,opacity:coverage,textShadow:'0 1px 8px rgba(238,246,247,.95)',pointerEvents:'none'}}>概念转场</div></>;
}
export function GeneratedLaunchBridgesV6(){
 return <>{launchBridgesV6.map(b=><Sequence key={b.id} from={b.fromFrame} durationInFrames={b.durationFrames} layout="none"><MatchedBridge spec={b}/></Sequence>)}</>;
}
