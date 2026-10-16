import React from 'react';
import {EditorialOverlayV10} from './EditorialOverlayV10';
import {FrameState} from './Timeline';
import {bridgesV11,bridgeStartV11} from './RealityBridgeV11';

type Projected={x:number;y:number;text:string;color:string;visible:boolean};

export function EditorialOverlayV11({state,projected,realityStrength}:{state:FrameState;projected?:Projected;realityStrength:number}){
  // Lighting now comes from the world. One readable anchored concept
  // replaces the independent 30px spectral legend and full-frame tint.
  // The scientific callout settles into the live optical shot after a native
  // generated bridge. It must not appear fully drawn on the very first frame.
  const handoff=bridgesV11.reduce((value,bridge)=>{
    if(bridge.transition.kind!=='matched')return value;
    const elapsed=state.frame-bridgeStartV11(bridge)-bridge.frames;
    return elapsed>=0&&elapsed<24?Math.max(value,1-elapsed/24):value;
  },0);
  return <EditorialOverlayV10 state={state} projected={projected} realityStrength={Math.max(realityStrength,handoff)}/>;
}
