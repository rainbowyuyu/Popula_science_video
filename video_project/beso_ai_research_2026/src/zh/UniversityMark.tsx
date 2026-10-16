import React from 'react';
import {interpolate,interpolateColors,useCurrentFrame} from 'remotion';
import zju from '../en/zju-paths.json';
import signature from '../en/horizontal-mark-paths.json';
import timeline from './timeline.json';
import {clamp,flow} from './design';

/** Every emblem and letter is an SVG path; one continuous clock spans all scenes. */
export const UniversityMark=()=>{
 const frame=useCurrentFrame();
 const dark=timeline.scenes.find(s=>s.id==='evolve')!;
 const end=dark.start+dark.duration-timeline.overlap;
 const color=interpolateColors(frame,[dark.start,dark.start+timeline.overlap,end,end+timeline.overlap],['#073b91','#e4edff','#e4edff','#073b91']);
 const emblemFill=flow(frame,88,132,0,1);
 return <svg aria-label="Zhejiang University, Ocean College" width={422} height={108} viewBox={signature.viewBox}
  style={{position:'absolute',right:88,top:23,zIndex:3000,color,pointerEvents:'none'}}>
  <svg x={0} y={1} width={103} height={103} viewBox={zju.viewBox}>
   <path d={zju.paths.map(p=>p.d).join(' ')} fill="currentColor" fillRule="evenodd" opacity={emblemFill}/>
   {frame<132&&zju.paths.map((p,i)=>{
    const start=10+Math.min(i,24);
    const progress=interpolate(frame,[start,start+78],[0,1],clamp);
    return <path key={i} d={p.d} fill="none" stroke="currentColor" strokeWidth={8}
     pathLength={1} strokeDasharray="1 1" strokeDashoffset={1-progress} opacity={progress>0?1-emblemFill:0}/>;
   })}
  </svg>
  <path d="M118 50.5H419" fill="none" stroke="currentColor" strokeWidth={.85} pathLength={1}
   strokeDasharray="1 1" strokeDashoffset={1-flow(frame,42,108,0,1)} opacity={flow(frame,40,50,0,.75)}/>
  {signature.groups.map((group,index)=>{
   const start=36+index*18;
   const fill=flow(frame,start+72,start+116,0,1);
   return <g key={group.name}>
    <path d={group.paths.map(p=>p.d).join(' ')} fill="currentColor" fillRule="evenodd" opacity={fill}/>
    {fill<1&&group.paths.map((p,i)=>{
     const at=start+(p.x-113)*.11;
     const progress=interpolate(frame,[at,at+58],[0,1],clamp);
     return <path key={i} d={p.d} fill="none" stroke="currentColor" strokeWidth={.42}
      strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1-progress}
      opacity={progress>0?1-fill:0}/>;
    })}
   </g>;
  })}
 </svg>;
};
