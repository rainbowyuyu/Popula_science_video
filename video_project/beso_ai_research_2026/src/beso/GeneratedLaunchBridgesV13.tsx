import React from 'react';
import {AbsoluteFill,Sequence,OffthreadVideo,staticFile,useCurrentFrame} from 'remotion';
import manifest from '../../research/generation/launch-v13-bridges.json';

type Bridge={id:string;asset:string;fromFrame:number;sourceDurationSeconds:number;sourceFps:number;overlapFrames:number;role:string;selection:string;sha256:string};
export const bridgesV13=(manifest.bridges as Bridge[]).filter(b=>b.selection==='selected');
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const x=clamp(v);return x*x*x*(x*(6*x-15)+10)};

function BridgeLayer({b}:{b:Bridge}){
 const frame=useCurrentFrame(),total=Math.round(b.sourceDurationSeconds*60);
 const labelAlpha=Math.min(ease(frame/b.overlapFrames),ease((total-1-frame)/b.overlapFrames));
 // The source clock is real time. The 60 fps film interpolates the supplied
 // footage on the film timeline; playbackRate remains exactly 1. Source
 // frames are sampled, not described as newly rendered solver frames.
 // Both endpoints already match the native corridor. Keep a single opaque
 // body during the shot; whole-frame crossfades produced double tower edges
 // when the generated camera accelerated differently from the native camera.
 // The native corridor continues beneath the clip, and the 20-frame handle
 // remains for the concept marker and endpoint seam review.
 return <AbsoluteFill style={{zIndex:5,pointerEvents:'none'}}>
  <OffthreadVideo src={staticFile(b.asset)} muted playbackRate={1} style={{width:1920,height:1080,objectFit:'cover'}}/>
  <div style={{position:'absolute',right:56,bottom:158,fontSize:36,fontWeight:550,color:'#fff',textShadow:'0 1px 8px #123847',padding:'8px 18px',borderRadius:12,background:'rgba(12,43,60,.68)',opacity:labelAlpha}}>AI 生成转场</div>
 </AbsoluteFill>;
}
export function GeneratedLaunchBridgesV13(){return <>{bridgesV13.map(b=><Sequence key={b.id} from={b.fromFrame} durationInFrames={Math.round(b.sourceDurationSeconds*60)} layout="none"><BridgeLayer b={b}/></Sequence>)}</>;}
