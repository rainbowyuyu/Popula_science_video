import React from 'react';
import {C,State,pulse} from './visual';
import {PileLegend} from './PileDynamicsVisualization';

export function PileAnalysisOverlay({s,data}:{s:State;data:PileLegend|null}){
 const u=s.n+s.u,show=pulse(6.30,6.46,8.12,8.36,u);if(!data||show<=0)return null;
 const reaction=data.mode==='reaction',axial=data.mode==='axial';
 const value=axial?-data.headDisplacement_mm[1]:data.headDisplacement_mm[0];
 return <div style={{position:'absolute',left:80,top:302,width:454,color:C.ink,transform:`translateX(${-650*(1-show)}px)`}}>
  <div style={{fontSize:35,color:C.muted}}>独立单桩算例</div>
  <div style={{fontSize:50,fontWeight:650,marginTop:18}}>{axial?'重量向下，土向上':reaction?'桩一弯，土来抵住':'哪一段更吃力'}</div>
  <div style={{fontSize:34,color:C.muted,marginTop:27}}>{axial?'桩头沉降':'桩头侧移'}</div>
  <div style={{fontSize:64,fontWeight:650,color:reaction?C.teal:'#b67143',fontVariantNumeric:'tabular-nums'}}>{value.toFixed(2)}<span style={{fontSize:36,marginLeft:15,color:C.ink}}>mm</span></div>
  <div style={{fontSize:34,fontWeight:600,marginTop:22}}>{data.quantity} · {data.unit}</div>
  {reaction?<div style={{fontSize:34,color:C.teal,marginTop:14}}>箭头长度表示反力大小</div>:<>
   <div style={{height:14,borderRadius:7,marginTop:18,background:`linear-gradient(90deg,${data.palette.map(c=>`${c.color} ${c.at*100}%`).join(',')})`}}/>
   <div style={{display:'flex',justifyContent:'space-between',fontSize:32,marginTop:9}}>{data.ticks.map((v,i)=><span key={i}>{Number.isInteger(v)?v:v.toFixed(2)}</span>)}</div>
  </>}
  <div style={{fontSize:33,color:C.muted,marginTop:30,lineHeight:1.55,fontVariantNumeric:'tabular-nums'}}>位移显示 ×{data.displacementMagnification}<br/>{data.time_s===null?`桩端支撑 ${(data.toeReaction_N/1e6).toFixed(3)} MN`:`计算时间 ${data.time_s.toFixed(1)} / 40 s`}</div>
 </div>;
}
