import React from 'react';
import sim from './simulation.json';
export function LabPanel({index,onChange,onPlay,playing=false}:{index:number;onChange?:(v:number)=>void;onPlay?:()=>void;playing?:boolean}){
 const h=sim.history[index];const points=sim.history.slice(0,index+1).map((v,i)=>`${18+i*8},${190-165*(v.compliance-1.7)/(18-1.7)}`).join(' ');
 return <div style={{width:520,padding:'28px 34px',borderRadius:24,background:'#fcfdfbcf',boxShadow:'0 25px 70px #243d3f16',color:'#193643',fontFamily:'Microsoft YaHei,sans-serif'}}>
 <div style={{display:'flex',justifyContent:'space-between',alignItems:'baseline'}}><span style={{fontSize:38}}>计算回放</span><strong style={{fontSize:76,fontFamily:'Bahnschrift',fontWeight:500}}>{h.iteration}</strong></div>
 <input aria-label="计算轮次" type="range" min={0} max={50} value={index} onChange={e=>onChange?.(+e.target.value)} style={{width:'100%',height:30,accentColor:'#087f85',margin:'22px 0'}}/>
 <div style={{display:'flex',justifyContent:'space-between',fontSize:36}}><span>柔度 N·mm</span><b>{h.compliance.toFixed(2)}</b></div>
 <svg viewBox="0 0 440 225" style={{width:'100%',marginTop:16}}><path d="M18 10V192H425" stroke="#b7c7cd" strokeWidth="2" fill="none"/><path d="M18 95H425" stroke="#cfdbdf" strokeDasharray="6 8"/><polyline points={points} fill="none" stroke="#087f85" strokeWidth="5" strokeLinejoin="round"/></svg>
 <button onClick={onPlay} style={{background:'#193643',border:0,borderRadius:12,color:'#fffdf6',padding:'12px 26px',fontSize:36,cursor:'pointer'}}>{playing?'暂停':'回放'}</button>
 </div>
}
