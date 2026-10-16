import React from 'react';
import {C,State,pulse} from './visual';
import {FlowSliceLegend} from './ComputedFlowSlices';
export type PressureLegend={range:[number,number];referenceVelocity_m_s:number|null;meaning:string};

/** Units and one fixed scale at a time; never calls velocity colours pressure. */
export function FlowAnalysisOverlay({s,slices,pressure}:{s:State;slices:FlowSliceLegend|null;pressure:PressureLegend|null}){
 const u=s.n+s.u,cp=pressure&&u<30.03;
 const heightTransition=u>=30.35&&u<30.54?'100 → 300 m':u>=30.675&&u<30.87?'300 → 500 m':null;
 const visible=slices?.slices.filter(x=>x.visible).reduce<FlowSliceLegend['slices'][number]|undefined>((best,x)=>!best||(x.visibleFraction??1)>(best.visibleFraction??1)?x:best,undefined),show=cp?pulse(29,29.18,29.8,30.03,u):pulse(30,30.15,31.9,32.16,u);
 if(show<=0||(!cp&&!visible&&!heightTransition))return null;
 const cpRange=pressure?.range??[-1,1],zeroFraction=-cpRange[0]/(cpRange[1]-cpRange[0]);
 const gradient=cp?`linear-gradient(90deg,#07869f 0%,#e5e8e2 ${100*zeroFraction}%,#d7653e 100%)`:`linear-gradient(90deg,${slices!.palette.map(c=>`${c.color} ${c.at*100}%`).join(',')})`;
 const title=cp?'表面风压':heightTransition||visible?.kind==='horizontal'?'水平流速剖面':'竖直流速剖面';
 const sub=cp?'迎风推入 · 背风吸出':heightTransition?`高度 ${heightTransition}`:visible?.kind==='horizontal'?`高度 ${visible.origin_m[1].toFixed(0)} m`:'沿高度观察绕流';
 return <div style={{position:'absolute',left:80,top:448,width:450,color:C.ink,transform:`translateX(${-650*(1-show)}px)`,textShadow:'0 2px 14px #f3f1ec88'}}>
  <div style={{fontSize:48,fontWeight:650,lineHeight:1.3}}>{title}</div>
  <div style={{fontSize:36,color:C.muted,marginTop:16}}>{sub}</div>
  <div style={{marginTop:34,fontSize:36,fontWeight:600}}>{cp?'表面推吸分布':'流速 · m/s'}</div>
  <div style={{height:16,borderRadius:8,marginTop:17,background:gradient,boxShadow:'0 2px 9px #18303b14'}}/>
  <div style={{height:56,position:'relative',marginTop:10,fontSize:34,fontVariantNumeric:'tabular-nums'}}>{(cp?[cpRange[0],0,cpRange[1]]:slices!.ticks_m_s).map((v,i)=>{
   const f=cp?(v-cpRange[0])/(cpRange[1]-cpRange[0]):i/2;
   return <span key={i} style={{position:'absolute',left:`${f*100}%`,whiteSpace:'nowrap',width:'max-content',transform:`translateX(${i===0?0:i===2?-100:-50}%)`}}>{cp?['负压','零','正压'][i]:v}</span>;
  })}</div>
  <div style={{fontSize:36,color:C.muted,lineHeight:1.35}}>{(cp?pressure?.referenceVelocity_m_s:slices?.referenceVelocity_m_s)!=null&&<>均匀来流 {cp?pressure?.referenceVelocity_m_s:slices?.referenceVelocity_m_s} m/s<br/></>}平均流场 · 定性观察</div>
 </div>;
}
