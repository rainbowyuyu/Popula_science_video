import React from 'react';
import {Img,staticFile} from 'remotion';
import data from './transitions-v10.json';
import {timeline,ease} from './Timeline';
type Bridge={id:string;anchor:{kind:'frame'|'scene'|'clip';id?:string;offsetFrames:number};frames:number;framePath:string;taskId:string};
export const bridgesV10=(data.clips as Bridge[]);
export function bridgeStartV10(bridge:Bridge){
 const base=bridge.anchor.kind==='frame'?0:bridge.anchor.kind==='scene'?timeline.scenes.find(s=>s.id===bridge.anchor.id)?.start:timeline.clips.find(c=>c.id===bridge.anchor.id)?.start;
 if(base===undefined)throw new Error('Unknown matched bridge anchor '+bridge.id);
 return base+bridge.anchor.offsetFrames;
}
export function realityWindowAt(frame:number){
 const active=bridgesV10.find(b=>frame>=bridgeStartV10(b)&&frame<bridgeStartV10(b)+b.frames);
 if(!active)return undefined;
 const start=bridgeStartV10(active),local=frame-start;
 // Adjacent photographic legs share a matched reference. Keep that space
 // visible across their join rather than exposing the model for 24 frames.
 const previous=bridgesV10.some(b=>b!==active&&bridgeStartV10(b)+b.frames===start);
 const following=bridgesV10.some(b=>b!==active&&bridgeStartV10(b)===start+active.frames);
 const enter=start===0||previous?1:ease(local/12),exit=following?0:ease((local-(active.frames-13))/12);
 return {...active,start,local,enter,exit,strength:enter*(1-exit)};
}
/** Full photographic frame with matched geometry at both endpoints.
 * The short overlap protects tiny endpoint colour differences only. There is
 * no decorative wipe, feather mask, time warp, or independently moving crop. */
export function RealityBridgeV10({frame}:{frame:number}){
 const active=realityWindowAt(frame);if(!active)return null;
 const previous=bridgesV10.find(b=>b.id!==active.id&&bridgeStartV10(b)+b.frames===active.start);
 const seam=previous&&active.local<6?1-ease((active.local+1)/6):0;
 return <div style={{position:'absolute',inset:0,zIndex:2,opacity:active.strength,pointerEvents:'none'}}>
  <Img src={staticFile(`${active.framePath}/frame_${String(active.local+1).padStart(4,'0')}.jpg`)} style={{width:'100%',height:'100%',objectFit:'cover'}}/>
  {previous&&seam>0&&<Img src={staticFile(`${previous.framePath}/frame_${String(previous.frames).padStart(4,'0')}.jpg`)} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:seam}}/>}
 </div>;
}
