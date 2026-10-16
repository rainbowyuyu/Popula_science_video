import React from 'react';
import {EditorialOverlayV10} from './EditorialOverlayV10';
import {FrameState} from './Timeline';
import {bridgesV20,bridgeStartV20} from './RealityBridgeV20';

type Projected={x:number;y:number;text:string;color:string;visible:boolean};

export function EditorialOverlayV20({state,projected,realityStrength}:{state:FrameState;projected?:Projected;realityStrength:number}){
  // Lighting now comes from the world. One readable anchored concept
  // replaces the independent 30px spectral legend and full-frame tint.
  // The scientific callout settles into the live optical shot after a native
  // generated bridge. It must not appear fully drawn on the very first frame.
  const handoff=bridgesV20.reduce((value,bridge)=>{
    if(bridge.transition.kind!=='matched')return value;
    const elapsed=state.frame-bridgeStartV20(bridge)-bridge.frames;
    return elapsed>=0&&elapsed<24?Math.max(value,1-elapsed/24):value;
  },0);
  return <EditorialOverlayV10 state={state} projected={projected} realityStrength={Math.max(realityStrength,handoff)}/>;
}


