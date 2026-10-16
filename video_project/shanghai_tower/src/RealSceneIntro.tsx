import React from 'react';
import {Img,staticFile} from 'remotion';
import {ramp} from './visual';
import {OPENING_PHOTO_REVEAL} from './OpeningCamera';

/** CC0 photograph extended with Qwen for the establishing environment only.
 * Engineering geometry remains entirely in the registered Three.js model.
 * Every parameter is seek-safe and derived from frame. */
export function RealSceneIntro({frame,aspect='16:9'}:{frame:number;aspect?:'16:9'|'9:16'}){
 if(frame>=OPENING_PHOTO_REVEAL.end)return null;
 const reveal=ramp(OPENING_PHOTO_REVEAL.start,OPENING_PHOTO_REVEAL.end,frame);
 // The photographic plate settles before the reveal. The three-dimensional
 // camera holds a genuine low angle until the plate has completely cleared,
 // then cranes away into the whole-building decomposition in the same shot.
 const vertical=aspect==='9:16';
 const width=vertical?1080:1920,height=vertical?1920:1080;
 const scale=1,photoX=0;
 // Open the image along the tower's spiral rib, revealing the co-located CG
 // skin first and then the sky. The two boundaries bow out symmetrically;
 // the whole photograph never slides across the screen like a page.
 const center=width*.666,left=center-(vertical?width*.94:1810)*reveal,right=center+(vertical?width*.69:1330)*reveal;
 const curve=(x:number)=>`M ${x-(vertical?20:35)} -100 C ${x-(vertical?105:170)} ${height*.24} ${x+(vertical?42:70)} ${height*.5} ${x+(vertical?130:210)} ${height+100}`;
 const leftMask=`path('${curve(left)} L -300 ${height+100} L -300 -100 Z')`;
 const rightMask=`path('${curve(right)} L ${width+300} ${height+100} L ${width+300} -100 Z')`;
 const plate=<><Img src={staticFile('scene/qwen-shanghai-tower-opening.png')} style={{position:'absolute',left:photoX,top:0,width,height,objectFit:vertical?'cover':'contain',objectPosition:'66% 9%',transform:`scale(${scale})`,transformOrigin:'66% 9%',filter:'saturate(.88) contrast(.99) brightness(1.01)'}}/><div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(236,244,245,.08),transparent 39%)'}}/></>;
 return <div style={{position:'absolute',inset:0,overflow:'hidden',zIndex:2,pointerEvents:'none'}}>
  {reveal===0?<div style={{position:'absolute',inset:0}}>{plate}</div>:<><div style={{position:'absolute',inset:0,clipPath:leftMask}}>{plate}</div><div style={{position:'absolute',inset:0,clipPath:rightMask}}>{plate}</div></>}
  {reveal>0&&reveal<1&&<svg width={width} height={height} style={{position:'absolute',inset:0}}>
   <defs><filter id="glass-light"><feGaussianBlur stdDeviation="5"/></filter><linearGradient id="glass-edge" x1="0" x2="1"><stop stopColor="#d1e5eb"/><stop offset=".52" stopColor="#ffffff"/><stop offset="1" stopColor="#a8cbd7"/></linearGradient></defs>
   {[left,right].map((x,i)=><g key={i}><path d={curve(x)} fill="none" stroke="#f4ffff" strokeWidth={16} filter="url(#glass-light)" opacity={.32}/><path d={curve(x)} fill="none" stroke="url(#glass-edge)" strokeWidth={2} opacity={.72}/></g>)}
  </svg>}
 </div>;
}
