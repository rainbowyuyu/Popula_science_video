import React from 'react';
import {FilmState, WorldInfo, clamp, smooth} from './World';
import data from '../../public/beso-research/physics/zwind-response.json';
import paper from '../../public/beso-research/physics/paper-metrics.json';

const blue='#126088',ink='#183d53',muted='#597888',teal='#218f98';
const curve=data.records.filter((_,i)=>i%3===0||i===data.records.length-1);
const min=Math.min(0,...data.records.map(r=>r.platform[0]));
const max=Math.max(...data.records.map(r=>r.platform[0]));
const x=(t:number)=>36+t/120*572;
const y=(v:number)=>185-(v-min)/(max-min)*142;
const path=curve.map((r,i)=>`${i?'L':'M'}${x(r.t).toFixed(2)},${y(r.platform[0]).toFixed(2)}`).join(' ');

export function ResearchHUDShort({s,info}:{s:FilmState;info?:WorldInfo}){
 if(s.id!=='zwind')return null;
 const showFrequency=s.local>=7.8&&s.local<11.4;
 const activeStart=showFrequency?7.8:2.5;
 if(s.local<activeStart)return null;
 const enter=smooth((s.local-activeStart)/.65);
 const t=info?.native?.time??0;
 const i=Math.max(0,Math.min(data.records.length-2,Math.floor((t-data.records[0].t)/.1)));
 const a=data.records[i],b=data.records[i+1],q=clamp((t-a.t)/(b.t-a.t));
 const value=a.platform[0]+(b.platform[0]-a.platform[0])*q;
 return <div style={{position:'absolute',left:64,top:385,width:670,color:ink,transform:`translateX(${-800*(1-enter)}px)`,fontFamily:'Microsoft YaHei, sans-serif',pointerEvents:'none'}}>
  {showFrequency?<>
   <div style={{fontSize:38,fontWeight:650,marginBottom:20}}>避开旋转激励频带</div>
   <div style={{fontSize:29,color:muted,marginBottom:17}}>论文案例 · 频率检查</div>
   <svg width={660} height={290} viewBox="0 0 660 290" style={{overflow:'visible'}}>
    <line x1={28} y1={172} x2={632} y2={172} stroke="#8daab8" strokeWidth={2}/>
    {[['1P',paper.fig2b.tower_frequencies_hz.excitation_bands['1P'],'#abd5dc',80],['3P',paper.fig2b.tower_frequencies_hz.excitation_bands['3P'],'#d8cbae',118]].map(([label,band,color,row])=>{
     const v=band as {hz_min:number;hz_max:number};const left=28+v.hz_min/.55*604,right=28+v.hz_max/.55*604;
     return <g key={String(label)}><rect x={left} y={Number(row)} width={right-left} height={50} rx={6} fill={String(color)}/><text x={(left+right)/2} y={Number(row)+34} textAnchor="middle" fontSize={28} fill={ink}>{String(label)}</text></g>;
    })}
    {[{value:paper.fig2b.tower_frequencies_hz.ai['1st_ss'],label:'0.481 Hz',row:26},{value:paper.fig2b.tower_frequencies_hz.ai['1st_fa'],label:'0.487 Hz',row:226}].map((d,k)=>{
     const px=28+d.value/.55*604;
     return <g key={d.label}><line x1={px} y1={61} x2={px} y2={185} stroke={k?teal:blue} strokeWidth={3}/><circle cx={px} cy={172} r={6} fill={k?teal:blue}/><text x={px-4} y={d.row} textAnchor="end" fontSize={33} fontWeight={650} fill={k?teal:blue}>{d.label}</text></g>;
    })}
    <text x={28} y={218} fontSize={29} fill={muted}>0</text><text x={632} y={260} textAnchor="end" fontSize={29} fill={muted}>0.55 Hz</text>
   </svg>
   <div style={{fontSize:30,color:muted,lineHeight:1.55}}>1P：0.05–0.11 Hz<br/>3P：0.15–0.33 Hz</div>
  </>:<>
   <div style={{display:'flex',alignItems:'baseline',gap:24}}><span style={{fontSize:37,fontWeight:650}}>平台纵荡</span><span style={{fontSize:42,color:blue,fontWeight:650,fontVariantNumeric:'tabular-nums'}}>{value.toFixed(2)} m</span></div>
   <svg width={650} height={255} viewBox="0 0 650 255">
    <line x1={36} y1={185} x2={608} y2={185} stroke="#8daab8" strokeWidth={2}/>
    <line x1={36} y1={43} x2={36} y2={185} stroke="#8daab8" strokeWidth={2}/>
    <path d={`${path} L608,185 L36,185 Z`} fill="#8bcbd422"/>
    <path d={path} fill="none" stroke={teal} strokeWidth={4} strokeLinejoin="round"/>
    <line x1={x(t)} y1={26} x2={x(t)} y2={187} stroke={blue} strokeWidth={2} strokeDasharray="6 7"/>
    <circle cx={x(t)} cy={y(value)} r={9} fill="#f5fafb" stroke={blue} strokeWidth={4}/>
    <text x={31} y={224} fontSize={30} fill={muted}>0</text><text x={607} y={224} textAnchor="end" fontSize={30} fill={muted}>120 s</text>
    <text x={36} y={30} fontSize={28} fill={muted}>{max.toFixed(1)} m</text>
   </svg>
   <div style={{fontSize:32,color:blue,fontVariantNumeric:'tabular-nums'}}>回放时刻 {t.toFixed(1)} s</div>
   <div style={{fontSize:29,color:muted,marginTop:13}}>保存的原始输出 · 伺服关闭</div>
  </>}
 </div>;
}
