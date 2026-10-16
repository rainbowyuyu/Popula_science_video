import React from 'react';
import {AbsoluteFill,OffthreadVideo,Sequence,staticFile,useCurrentFrame} from 'remotion';
import manifestData from '../../research/generation/launch-v7-bridges.json';

/** Generated footage conveys camera and material concepts. Real model,
 * response, results, logs and UI remain separate original evidence. */
export type LaunchBridgeV7={
 id:string;asset:string;fromFrame:number;sourceDurationSeconds:number;sourceFps:number;
 role:string;selection:'selected'|'rejected'|'pending_review';overlapFrames?:number;
 sha256:string;firstAnchor:string;lastAnchor:string;labelColour?:'light'|'dark';
};
type Manifest={version:number;compositionFps:number;compositionDurationFrames:number;
 normalPlayback:boolean;defaultOverlapFrames:number;bridges:LaunchBridgeV7[]};
export type PreparedLaunchBridgeV7=LaunchBridgeV7&{durationFrames:number;toFrame:number;overlapFrames:number};
const manifest=manifestData as Manifest;
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const ease=(v:number)=>{const t=clamp(v);return t*t*t*(t*(6*t-15)+10)};

export const launchBridgesV7:PreparedLaunchBridgeV7[]=manifest.bridges
 .filter(spec=>spec.selection==='selected')
 .map(spec=>{
  if(!manifest.normalPlayback||manifest.compositionFps!==60)throw Error('Launch v7 bridges require real-time playback on the 60fps timeline');
  if(!Number.isInteger(spec.fromFrame)||spec.fromFrame<0||!Number.isFinite(spec.sourceDurationSeconds)||spec.sourceDurationSeconds<=0)throw Error(`Invalid launch v7 bridge timeline: ${spec.id}`);
  if(!spec.asset.startsWith('generated/v7/')||!/^[a-f0-9]{64}$/.test(spec.sha256))throw Error(`Unreviewed or invalid v7 generated asset: ${spec.id}`);
  const durationFrames=Math.round(spec.sourceDurationSeconds*manifest.compositionFps);
  const overlapFrames=Math.min(24,Math.max(18,spec.overlapFrames??manifest.defaultOverlapFrames));
  const toFrame=spec.fromFrame+durationFrames;
  if(durationFrames<overlapFrames*2||toFrame>manifest.compositionDurationFrames)throw Error(`Out-of-bounds launch v7 bridge: ${spec.id}`);
  return{...spec,durationFrames,toFrame,overlapFrames};
 }).sort((a,b)=>a.fromFrame-b.fromFrame);
for(let i=1;i<launchBridgesV7.length;i++){
 if(launchBridgesV7[i].fromFrame<launchBridgesV7[i-1].toFrame)throw Error(`Overlapping full-screen v7 bridges: ${launchBridgesV7[i-1].id} / ${launchBridgesV7[i].id}`);
}
function coverage(local:number,spec:PreparedLaunchBridgeV7){
 return Math.min(ease(local/spec.overlapFrames),ease((spec.durationFrames-1-local)/spec.overlapFrames));
}
/** Main-film evidence overlays can follow their camera route outside the frame
 * while concept footage owns the view; captions and university Logo stay. */
export function launchBridgeCoverageV7(frame:number){
 const spec=launchBridgesV7.find(shot=>frame>=shot.fromFrame&&frame<shot.toFrame);
 return spec?coverage(frame-spec.fromFrame,spec):0;
}
export function launchBridgeAtV7(frame:number){
 return launchBridgesV7.find(shot=>frame>=shot.fromFrame&&frame<shot.toFrame);
}
function ConceptBridge({spec}:{spec:PreparedLaunchBridgeV7}){
 const local=useCurrentFrame(),weight=coverage(local,spec);
 // The label sits over sea in every selected shot. Only the first second of
 // the two paper-outline shots needs dark ink before water fills the frame.
 const paperStart=/drawing-emergence|joint-parametric/.test(spec.id)&&local<60;
 const light=spec.labelColour==='light'||!paperStart;
 return <AbsoluteFill data-qa="concept-bridge" style={{zIndex:80,pointerEvents:'none',opacity:weight}}>
  {/* No wipe, inset, sidebar, accelerated playback, or generated audio.
      Endpoint overlap is only acceptable after native / WAN outlines match. */}
  <OffthreadVideo src={staticFile(spec.asset)} muted playbackRate={1}
   style={{width:'100%',height:'100%',objectFit:'cover',display:'block'}}/>
  <div style={{position:'absolute',left:83,bottom:165,fontSize:26,fontWeight:550,
   lineHeight:1.35,letterSpacing:1.4,color:light?'#f4f9f7':'#173a45',
   textShadow:light?'0 1px 7px rgba(3,20,32,.7)':'0 1px 8px rgba(242,249,247,.95)',
   opacity:clamp(weight*2)}}>概念镜头</div>
 </AbsoluteFill>;
}
export function GeneratedLaunchBridgesV7(){
 return <>{launchBridgesV7.map(spec=><Sequence key={spec.id} from={spec.fromFrame}
  durationInFrames={spec.durationFrames} layout="none"><ConceptBridge spec={spec}/></Sequence>)}</>;
}
