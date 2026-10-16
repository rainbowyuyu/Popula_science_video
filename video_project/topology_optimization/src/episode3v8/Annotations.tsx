import React from 'react';
import {clamp,smooth} from './World';

export type AnnotationAnchor={x:number;y:number;visible:boolean;partId?:string;occluded?:boolean;groupBounds?:{left:number;top:number;right:number;bottom:number}};
export type AnnotationCue={term:string;anchor?:string;label?:string;kind?:'group';color?:string;start:number;end:number;side?:'left'|'right';dy?:number;dx?:number};

/** Deterministic side notes. Lines retract; names travel offscreen before unmount.
 * Occlusion is audited as a scheduling error, never hidden by a visible toggle. */
export function FirstMentionAnnotations({frame,cues,anchors}:{frame:number;cues:AnnotationCue[];anchors:Record<string,AnnotationAnchor>}){
 const active=cues.filter(c=>frame>=c.start&&frame<c.end).slice(0,2);
 const placed:{x:number;y:number;width:number}[]=[];
 return <svg viewBox="0 0 1920 1080" style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:12,pointerEvents:'none'}}>
  <defs><filter id="label-paper"><feGaussianBlur stdDeviation="9"/></filter></defs>
  {active.map((cue,index)=>{
   const a=anchors[cue.anchor??cue.term];if(!a||!Number.isFinite(a.x+a.y))return null;
   const enter=smooth(clamp((frame-cue.start)/12)),remaining=cue.end-frame;
   const retract=smooth(clamp((remaining-18)/12)),exit=smooth(clamp((18-remaining)/18));
   const show=enter*retract,label=cue.label??cue.term,side=cue.side??'right';
   const width=label.length*52+6,color=cue.color??'#293b32',lineColor=cue.color??'#967044';
   const bound=cue.kind==='group'?a.groupBounds:undefined;
   const ax=bound?(side==='left'?bound.left:bound.right):a.x;
   const ay=bound?(bound.top+bound.bottom)/2:a.y;
   const gap=cue.dx??95;
   let x=side==='left'?ax-gap-width:ax+gap;
   x=Math.max(72,Math.min(1848-width,x));
   let y=Math.max(298,Math.min(812,ay+(cue.dy??-65)));
   for(const other of placed)if(Math.abs(y-other.y)<88&&x<other.x+other.width+24&&x+width+24>other.x)y=Math.min(812,other.y+104);
   placed.push({x,y,width});
   const endX=side==='left'?x+width:x,elbowX=endX+(side==='left'?28:-28),endY=y+9;
   const path=`M ${ax} ${ay} L ${elbowX} ${endY} L ${endX} ${endY}`;
   const slide=(side==='left'?-2200:2200)*exit+(side==='left'?-12:12)*(1-enter);
   return <g key={cue.term}>
    {bound&&<path d={`M ${ax+(side==='left'?16:-16)} ${Math.max(270,bound.top)} H ${ax} V ${Math.min(850,bound.bottom)} H ${ax+(side==='left'?16:-16)}`} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-show}/>}
    <path d={path} fill="none" stroke={lineColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" pathLength="1" strokeDasharray="1" strokeDashoffset={1-show}/>
    {!bound&&<circle cx={ax} cy={ay} r={4.5*show} fill={lineColor} stroke="#fff9e9" strokeWidth="1.8"/>}
    <g transform={`translate(${slide},0)`}>
     <defs><clipPath id={`label-reveal-${index}`}><rect x={x-22} y={y-61} width={(width+44)*enter} height="91"/></clipPath></defs>
     <g clipPath={`url(#label-reveal-${index})`}>
      <rect x={x-12} y={y-50} width={width+24} height="68" rx="22" fill="#eee7d8" fillOpacity=".88" filter="url(#label-paper)"/>
      <text x={x} y={y} fill={color} fontFamily="STSong, SimSun, serif" fontSize="50" fontWeight="600" letterSpacing="2">{label}</text>
      <path d={`M ${x} ${y+13} H ${x+width}`} stroke={lineColor} strokeWidth="2"/>
     </g>
    </g>
   </g>;
  })}
 </svg>;
}
