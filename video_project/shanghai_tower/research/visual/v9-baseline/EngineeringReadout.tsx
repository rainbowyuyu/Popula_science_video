import React from 'react';
import {C,State,Timeline,pulse,physicalTimeAt,clamp} from './visual';
import data from '../public/physics/engineering-readouts.json';

const sample=(values:number[],time:number)=>{
 const x=clamp(time/60)*(values.length-1),i=Math.min(values.length-2,Math.floor(x));
 return values[i]+(values[i+1]-values[i])*(x-i);
};
/** Inline, physical-value annotations. No independent dashboard or random trace. */
export function EngineeringReadout({s,timeline,separateCFD=false}:{s:State;timeline:Timeline;separateCFD?:boolean}){
 const u=s.n+s.u,t=physicalTimeAt(s,timeline),bend=pulse(12.95,13.12,13.65,13.87,u),
 wind=separateCFD?0:pulse(29.9,30.13,31.30,31.52,u),damper=pulse(36.05,36.3,37.65,37.95,u);
 const show=Math.max(bend,wind,damper);if(show<=0)return null;
 const key=wind>0?'netWindLoad_MN':damper>0?'tmdRelative_mm':'topDisplacement_mm';
 const values=data.series[key],value=sample(values,t),isWind=wind>0,isDamper=damper>0;
 const ink=isWind?'#b96936':C.teal;
 const max=isWind?40:Math.ceil(Math.max(...values.map(Math.abs))/100)*100;
 const min=isWind?0:-max;
 const X=(seconds:number)=>seconds/60*432+4,Y=(v:number)=>148-(v-min)/(max-min)*130;
 const points=[];
 // Save only computed times through the current cursor; reveal follows clock.
 for(let i=0;i<data.time.length&&data.time[i]<=t;i+=4)points.push(`${X(data.time[i])},${Y(values[i])}`);
 points.push(`${X(t)},${Y(value)}`);
 const label=isWind?'整楼横向风荷载':isDamper?'质量块相对位移':'顶层侧向位移';
 const secondary=isWind?'输入工况 · 500 m 处 30 m/s':isDamper?'阻尼耗能':'核心弦转角 · 等效模型';
 const secondaryValue=isDamper?`${sample(data.series.tmdDissipatedEnergy_kJ,t).toFixed(0)} kJ`:isWind?'':`${sample(data.series.coreChordAngle_mrad,t).toFixed(2)} mrad`;
 return <div style={{position:'absolute',left:80,top:250,width:460,transform:`translateX(${-650*(1-show)}px)`,color:C.ink,fontVariantNumeric:'tabular-nums'}}>
  <div style={{fontSize:40,fontWeight:600,letterSpacing:1}}>{label}</div>
  <div style={{fontSize:66,lineHeight:1.2,fontWeight:650,color:ink,marginTop:12}}>{value.toFixed(isWind?1:0)}<span style={{fontSize:36,fontWeight:500,marginLeft:14}}>{isWind?'MN':'mm'}</span></div>
  <svg width={448} height={135} viewBox="0 0 448 160" preserveAspectRatio="none" style={{display:'block',marginTop:10,overflow:'visible'}}>
   <line x1={4} y1={Y(0)} x2={438} y2={Y(0)} stroke={`${C.muted}65`} strokeWidth={1.5}/>
   <line x1={4} y1={148} x2={438} y2={148} stroke={`${C.muted}40`} strokeWidth={1}/>
   <polyline points={points.join(' ')} stroke={ink} strokeWidth={4} fill="none" strokeLinejoin="round" strokeLinecap="round"/>
   <line x1={X(t)} y1={12} x2={X(t)} y2={148} stroke={`${ink}50`} strokeWidth={1.5}/>
   <circle cx={X(t)} cy={Y(value)} r={6} fill={ink}/>
  </svg>
  <div style={{display:'flex',justifyContent:'space-between',fontSize:32,color:C.muted,marginTop:4}}><span>0 s</span><span>t = {t.toFixed(1)} s</span><span>60 s</span></div>
  <div style={{fontSize:32,lineHeight:1.4,marginTop:14,color:C.muted}}>{secondary}{secondaryValue&&<span style={{display:'block',fontSize:36,fontWeight:600,color:C.ink}}>{secondaryValue}</span>}</div>
 </div>;
}
