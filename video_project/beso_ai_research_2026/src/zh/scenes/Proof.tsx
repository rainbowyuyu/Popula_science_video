import React from 'react';
import {useCurrentFrame,interpolate} from 'remotion';
import metrics from '../../en/case-metrics.json';
import {Stage,Head,Gradient,Page,Lift,Note,clamp} from '../design';

export const Proof=()=>{
 const f=useCurrentFrame();
 const steelReduction=(1-metrics.steel.ai/metrics.steel.baseline)*100;
 const costReduction=(1-metrics.cost.ai/metrics.cost.baseline)*100;
 const reduction=interpolate(f,[50,135],[0,steelReduction],clamp).toFixed(1);
 return <Stage label="论文案例 / 20 MW">
  <Page file="fig-platform" x={1010} y={220} width={890} ry={-16} rz={5} delay={45}/>
  <Head y={160} size={76} width={1020}>更少用钢，<br/><Gradient>更优经济性。</Gradient></Head>
  <Lift delay={40} style={{position:'absolute',left:120,top:382,width:840,zIndex:700}}>
   <div style={{display:'flex',gap:11,alignItems:'center',marginBottom:8}}><span style={{fontSize:20,letterSpacing:2,color:'#68718a',border:'1px solid #cfd4e4',borderRadius:99,padding:'8px 15px'}}>20 MW 级案例</span><span style={{fontSize:20,letterSpacing:1.2,color:'#68718a',border:'1px solid #cfd4e4',borderRadius:99,padding:'8px 15px'}}>AI 方案 对比 图强基准</span></div>
   {/* SVG provides explicit glyph bounds; mixed-size inline background clipping cut the numeral. */}
   <svg width={780} height={220} viewBox="0 0 780 220" style={{display:'block',overflow:'visible'}} aria-label={`${reduction} percent reduction`}>
    <defs><linearGradient id="proof-metric" x1="0" y1="0" x2="1" y2="0">
     <stop stopColor="#4285f4"/><stop offset=".48" stopColor="#8268d4"/><stop offset="1" stopColor="#d97891"/>
    </linearGradient></defs>
    <text x={16} y={176} fill="url(#proof-metric)" fontFamily="Segoe UI, Arial, sans-serif" fontSize={180} fontWeight={600} letterSpacing={-7}>
     −{reduction}<tspan fontSize={108} letterSpacing={0} dx={8}>%</tspan>
    </text>
   </svg>
   <div style={{fontSize:28,color:'#667087',marginLeft:15}}>用钢强度降低</div>
   <div style={{fontSize:24,color:'#9195a7',lineHeight:1.65,marginTop:18,marginLeft:15}}>{metrics.steel.baseline} → {metrics.steel.ai} t / MW<br/><span style={{fontSize:22}}>估算单位造价：{metrics.cost.baseline.toLocaleString('en-US')} → {metrics.cost.ai.toLocaleString('en-US')} 元 / kW (−{costReduction.toFixed(1)}%)</span></div>
  </Lift>
  <Note x={140} y={888}>造价按用钢量同比例估算 · 依据 2026 年 10 月 9 日论文</Note>
 </Stage>;
};
