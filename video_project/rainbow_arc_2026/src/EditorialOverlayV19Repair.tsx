import React from 'react';
import {EditorialOverlayV10} from './EditorialOverlayV10';
import {FrameState,timeline} from './Timeline';
import {bridgesV19Repair,bridgeStartV19Repair} from './RealityBridgeV19Repair';

type Projected={x:number;y:number;text:string;color:string;visible:boolean};

export function EditorialOverlayV19Repair({state,projected,realityStrength}:{state:FrameState;projected?:Projected;realityStrength:number}){
  // Lighting now comes from the world. One readable anchored concept
  // replaces the independent 30px spectral legend and full-frame tint.
  // The scientific callout settles into the live optical shot after a native
  // generated bridge. It must not appear fully drawn on the very first frame.
  const handoff=bridgesV19Repair.reduce((value,bridge)=>{
    if(bridge.transition.kind!=='matched')return value;
    const elapsed=state.frame-bridgeStartV19Repair(bridge)-bridge.frames;
    return elapsed>=0&&elapsed<24?Math.max(value,1-elapsed/24):value;
  },0);
  const overlay=<EditorialOverlayV10 state={state} projected={projected} realityStrength={Math.max(realityStrength,handoff)}/>;
  const caption=timeline.captions.find(c=>state.frame>=c.start&&state.frame<c.end);
  // Two low observer shots need an open band above the fish. Move whole
  // subtitle cues, keeping the inherited four-frame text entrance; never
  // slide a sentence through the character while it is being read.
  const lift=!!caption&&((caption.start>=5045&&caption.end<=5263)||(caption.start>=9029&&caption.end<=9780));
  if(!lift)return overlay;
  const clearance=caption!.start<5263?380:184;
  // Scope this override to the inherited caption layer (z-index 42).
  // Annotation and its world-anchored leader remain at their original position.
  return <div className="v19-caption-clearance" style={{position:'absolute',inset:0,pointerEvents:'none'}}>
    <style>{`.v19-caption-clearance > div[style*="z-index: 42"]{transform:translateY(-${clearance}px)}`}</style>
    {overlay}
  </div>;
}
