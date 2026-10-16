import React from 'react';
import {Img, staticFile} from 'remotion';
import * as T from 'three';
import data from './transitions-v19-motion.json';
import {timeline, ease} from './Timeline';
import {sampleFilmCamera} from './CinematicRouteV10';

export type V19MotionTransitionKind = 'veil' | 'radial' | 'matched';
export type V19MotionBridge = {
  id: string;
  anchor: {kind: 'frame' | 'scene' | 'clip'; id?: string; offsetFrames: number};
  frames: number; framePath: string; taskId: string;
  transition: {kind: V19MotionTransitionKind; focus: [number, number]; enterFrames: number; exitFrames: number; overlapFrames: number; maxBlurPx: number};
};
export const bridgesV19Motion = data.clips as unknown as V19MotionBridge[];
export function bridgeStartV19Motion(b: V19MotionBridge): number {
  const base=b.anchor.kind==='frame'?0:b.anchor.kind==='scene'?timeline.scenes.find(s=>s.id===b.anchor.id)?.start:timeline.clips.find(c=>c.id===b.anchor.id)?.start;
  if(base===undefined)throw new Error('Unknown Qwen anchor '+b.id);
  return base+b.anchor.offsetFrames;
}
const predecessor=(b:V19MotionBridge)=>bridgesV19Motion.find(a=>a!==b&&bridgeStartV19Motion(a)+a.frames===bridgeStartV19Motion(b));
const preRoll=(b:V19MotionBridge)=>predecessor(b)?Math.min(b.transition.overlapFrames,b.transition.enterFrames):0;
export type BridgeLayerV19Motion={id:string;bridge:V19MotionBridge;sourceFrame:number;alpha:number};
/** A single native clock per source. Incoming heads begin BEFORE the join,
 * then keep advancing. No outgoing endpoint is replayed or held. */
export function bridgeLayersAtV19Motion(frame:number):BridgeLayerV19Motion[]{
  return bridgesV19Motion.flatMap(b=>{
    const shift=preRoll(b),start=bridgeStartV19Motion(b)-shift,local=frame-start;
    if(local<0||local>=b.frames)return [];
    const incoming=(bridgeStartV19Motion(b)===0||b.transition.kind==='matched')?1:ease(local/b.transition.enterFrames);
    const following=bridgesV19Motion.some(n=>predecessor(n)===b);
    const outgoing=(following||b.transition.kind==='matched')?1:1-ease((local-(b.frames-b.transition.exitFrames))/b.transition.exitFrames);
    const alpha=incoming*outgoing;
    return [{id:b.id,bridge:b,sourceFrame:local,alpha}];
  });
}
export function activeBridgeV19Motion(frame:number){
  const a=bridgeLayersAtV19Motion(frame).at(-1);
  return a?{bridge:a.bridge,start:bridgeStartV19Motion(a.bridge)-preRoll(a.bridge),local:a.sourceFrame}:undefined;
}
export function realityWindowAtV19Motion(frame:number){
  const layers=bridgeLayersAtV19Motion(frame);const a=layers.at(-1);if(!a)return undefined;
  const strength=1-layers.reduce((x,l)=>x*(1-l.alpha),1);
  return {bridge:a.bridge,start:bridgeStartV19Motion(a.bridge)-preRoll(a.bridge),local:a.sourceFrame,enter:a.alpha,exit:1,strength,previous:layers.length>1?layers[0].bridge:undefined};
}
/** Exact projected tangent circle of the metric radius-1.6 sphere. */
export function macroScreenFrameV19Motion(frame:number){
  const s=sampleFilmCamera(frame),camera=new T.PerspectiveCamera(s.fov,1920/1080,.03,400);
  camera.position.set(...s.position);camera.quaternion.copy(s.quaternion);
  const t=frame/30,bank=.0028*Math.sin(t*.17)+.0014*Math.sin(t*.053+1.2);
  camera.quaternion.multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),bank));camera.updateMatrixWorld(true);
  const center=new T.Vector3(0,4,0),toEye=camera.position.clone().sub(center),d=toEye.length(),r=1.6,n=toEye.normalize();
  const ringCenter=center.clone().addScaledVector(n,r*r/d),rr=r*Math.sqrt(1-r*r/(d*d));
  const u=new T.Vector3(0,1,0).cross(n).normalize(),v=n.clone().cross(u).normalize();
  let minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
  for(let i=0;i<96;i++){const a=i/96*Math.PI*2,p=ringCenter.clone().addScaledVector(u,Math.cos(a)*rr).addScaledVector(v,Math.sin(a)*rr).project(camera),x=(p.x*.5+.5)*1920,y=(.5-p.y*.5)*1080;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);}
  return {x:(minX+maxX)/2,y:(minY+maxY)/2,radius:(maxX-minX+maxY-minY)/4};
}
function plateStyle(layer:BridgeLayerV19Motion,frame:number):React.CSSProperties{
  // V15 matched clips use actual source tails and rendered endpoint frames.
  // All native frames advance once. No independent duplicate camera or fade
  // back to the old V14 garden is placed under the handoff.
  return {position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:layer.alpha,pointerEvents:'none'};
}
export function RealityBridgeV19Motion({frame}:{frame:number}){
 const layers=bridgeLayersAtV19Motion(frame);if(!layers.length)return null;
 return <div style={{position:'absolute',inset:0,zIndex:2,pointerEvents:'none',overflow:'hidden'}} data-v12-bridge={layers.at(-1)?.id}>
  {layers.map(layer=><Img key={layer.id} src={staticFile(`${layer.bridge.framePath}/frame_${String(layer.sourceFrame+1).padStart(4,'0')}.jpg`)} style={plateStyle(layer,frame)}/>)}
 </div>;
}
