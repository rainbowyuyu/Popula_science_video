import React from 'react';
import {Img, staticFile} from 'remotion';
import {timeline, ease} from './Timeline';
import data from './transitions-v20.json';
export type V20TransitionKind='matched';
export type V20Bridge={id:string;anchor:{kind:'frame';offsetFrames:number};frames:number;framePath:string;taskId:string;transition:{kind:V20TransitionKind;focus:[number,number];enterFrames:number;exitFrames:number;overlapFrames:number;maxBlurPx:number}};
export const bridgesV20=data.clips as V20Bridge[];
export function bridgeStartV20(b:V20Bridge){return b.anchor.offsetFrames;}
const predecessor=(b:V20Bridge)=>bridgesV20.find(a=>a!==b&&bridgeStartV20(a)+a.frames===bridgeStartV20(b));
const preRoll=(b:V20Bridge)=>predecessor(b)?Math.min(b.transition.overlapFrames,b.transition.enterFrames):0;
export type BridgeLayerV20={id:string;bridge:V20Bridge;sourceFrame:number;alpha:number};
export function bridgeLayersAtV20(frame:number):BridgeLayerV20[]{
 return bridgesV20.flatMap(b=>{const shift=preRoll(b),start=bridgeStartV20(b)-shift,local=frame-start;if(local<0||local>=b.frames)return [];const enter=(bridgeStartV20(b)===0)?1:ease(Math.min(1,local/Math.max(1,b.transition.enterFrames)));const alpha=enter;return [{id:b.id,bridge:b,sourceFrame:local,alpha}];});
}
export function realityWindowAtV20(frame:number){const layers=bridgeLayersAtV20(frame);const a=layers.at(-1);if(!a)return undefined;return {bridge:a.bridge,start:bridgeStartV20(a.bridge)-preRoll(a.bridge),local:a.sourceFrame,enter:a.alpha,exit:1,strength:a.alpha,previous:layers.length>1?layers[0].bridge:undefined};}
function plateStyle(layer:BridgeLayerV20):React.CSSProperties{return {position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:layer.alpha,pointerEvents:'none'};}
export function RealityBridgeV20({frame}:{frame:number}){const layers=bridgeLayersAtV20(frame);if(!layers.length)return null;return <div style={{position:'absolute',inset:0,zIndex:2,pointerEvents:'none',overflow:'hidden'}} data-v20-bridge={layers.at(-1)?.id}>{layers.map(layer=><Img key={layer.id} src={staticFile(`${layer.bridge.framePath}/frame_${String(layer.sourceFrame+1).padStart(4,'0')}.jpg`)} style={plateStyle(layer)}/>)}</div>;}
