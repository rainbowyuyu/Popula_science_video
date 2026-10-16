import React from 'react';
import apiResult from '../../public/beso-research/web-live/v7/visual-data.json';
import replan from '../../public/beso-research/web-live/v7/replan-visual.json';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const q=clamp(x);return q*q*q*(q*(6*q-15)+10)};
const ink='#f6faf8',teal='#cce9e6',copper='#f0cf9f';
export function ProductValueV7({mode,local,duration}:{mode:'brief'|'feedback'|'human';local:number;duration:number}){
 const enter=ease(local/.8),exit=ease((local-duration+1)/1);
 const position=1000+1100*(1-enter)+1100*exit;
 const p=ease((local-4.4)/1.8),edit=local>7.5;
 const source=apiResult.steps[edit?1:0];
 return <div data-qa="product-action" style={{position:'absolute',left:position,top:390,width:790,height:495,zIndex:30,color:ink,pointerEvents:'none',textShadow:'0 1px 3px rgba(7,30,43,.5)',padding:'12px 40px',boxSizing:'border-box'}}>
  {mode==='brief'?<>
   <div style={{fontSize:32,color:copper,letterSpacing:1,fontWeight:550}}>需求摘录 → 同一份设计清单</div>
   <div style={{fontSize:36,marginTop:18,lineHeight:1.35}}>{edit?'“钢耗改为280，水深55米”':'“设计一台20兆瓦的浮式风机”'}</div>
   <div style={{display:'flex',gap:35,marginTop:12,alignItems:'baseline'}}><span style={{fontSize:92,fontWeight:700,letterSpacing:-4}}>{source.capacityMW}<span style={{fontSize:44,letterSpacing:0,marginLeft:12}}>MW</span></span><span style={{fontSize:34,color:teal}}>目标功率</span></div>
   <div style={{display:'flex',gap:32,borderTop:'2px solid rgba(233,250,246,.5)',marginTop:15,paddingTop:18}}>
    <div style={{width:355}}><div style={{fontSize:32,color:ink}}>目标用钢量</div><div style={{fontSize:58,fontWeight:650,marginTop:7,fontVariantNumeric:'tabular-nums',color:edit?copper:ink}}>{edit&&<span style={{fontSize:32,marginRight:10}}>300 →</span>}{source.steelTargetTperMW}<span style={{fontSize:30,marginLeft:9,fontWeight:500}}>t/MW</span></div></div>
    <div><div style={{fontSize:32,color:ink}}>场址水深</div><div style={{fontSize:58,fontWeight:650,marginTop:7,color:edit?copper:ink}}>{edit&&<span style={{fontSize:32,marginRight:10}}>45 →</span>}{source.waterDepthM}<span style={{fontSize:30,marginLeft:9,fontWeight:500}}>m</span></div></div>
   </div>
   <div style={{fontSize:32,color:ink,marginTop:23}}>真实API · 规则解析 · {edit?'修改已写回，并读取复查':'参数已写入'}</div>
  </>:mode==='feedback'?<>
   <div style={{fontSize:32,color:copper,letterSpacing:2}}>保存重规划记录 · 过程示意</div>
   <div style={{fontSize:40,fontWeight:580,marginTop:26}}>静力求解未收敛</div>
   <svg width="675" height="145" style={{display:'block',marginTop:20}} viewBox="0 0 675 145">
    <path d="M28 42 H588 Q635 42 635 82 Q635 120 595 120 H100 Q28 120 28 72 V42" fill="none" stroke="#b6cfce" strokeWidth="2.5"/>
    <path d="M28 42 H588 Q635 42 635 82 Q635 120 595 120 H100" fill="none" stroke={teal} strokeWidth="4" pathLength="1" strokeDasharray="1" strokeDashoffset={1-ease((local-1.3)/5.5)}/>
    {['日志','原因','新任务'].map((w,i)=><g key={w} transform={`translate(${28+i*275},42)`}><circle r="8" fill={local>1.3+i*1.5?teal:'#9eb3b6'}/><text y="-20" fontSize="36" fill={ink} textAnchor={i===0?'start':'middle'}>{w}</text></g>)}
    <g transform={`translate(${28+550*ease((local-1.3)/4)},42)`}><path d="M-8 -10 H3 L9 -4 V10 H-8 Z" fill={copper}/></g>
   </svg>
   <div style={{fontSize:40,fontWeight:580,color:copper,marginTop:3,transform:`translateX(${850*(1-ease((local-4.8)/.7))}px)`}}>迭代上限 {replan.iterationLimitBefore} → {replan.iterationLimitAfter}</div>
   <div style={{fontSize:33,color:ink,marginTop:19}}>修改记录与输入文件一并保留</div>
   <div style={{fontSize:32,color:copper,marginTop:20}}>记录状态：重试等待复查</div>
  </>:<>
   <div style={{fontSize:32,color:teal,letterSpacing:2}}>人工介入流程示意</div>
   <div style={{display:'flex',gap:19,alignItems:'center',fontSize:39,marginTop:45}}>{['暂停','修改几何','提交继续'].map((w,i)=><React.Fragment key={w}>{i>0&&<span style={{color:'#769298'}}>→</span>}<span style={{color:local>1.5+i*1.8?teal:ink,borderBottom:`3px solid ${local>1.5+i*1.8?teal:'transparent'}`,paddingBottom:9}}>{w}</span></React.Fragment>)}</div>
   <div style={{height:140,marginTop:24,position:'relative',overflow:'hidden',borderBottom:'2px solid rgba(233,250,246,.5)'}}>
    <svg width="650" height="132" viewBox="0 0 650 132">
     <defs><linearGradient id="member-skin"><stop stopColor="#d6e6e5"/><stop offset=".45" stopColor="#f8faf6"/><stop offset="1" stopColor="#92b4bb"/></linearGradient></defs>
     <g transform={`translate(${720*ease((local-6.1)/1.2)},0)`}>
      <path d={`M30 36 L230 20 L230 ${66+17*p} L30 ${83+17*p} Z`} fill="url(#member-skin)"/><path d={`M230 20 L260 37 L260 ${83+17*p} L230 ${66+17*p} Z`} fill="#8ba6ad"/><path d="M30 36 L61 54 L260 37 L230 20 Z" fill="#e8f0eb"/>
      {Array.from({length:10},(_,i)=><path key={i} d={`M${35+i*20} ${36-i*1.5} v${49+17*p} M30 ${44+i*4} L230 ${28+i*4}`} fill="none" stroke="#247487" strokeWidth="1.5" opacity=".75"/>)}
      <text x="315" y="62" fontSize="37" fill={teal}>旧网格与载荷</text>
     </g>
     <g transform={`translate(${-720*(1-ease((local-6.0)/1.2))},0)`}>
      <path d="M30 30 L230 14 L230 88 L30 104 Z" fill="url(#member-skin)"/><path d="M230 14 L260 31 L260 104 L230 88 Z" fill="#8ba6ad"/><path d="M30 30 L61 47 L260 31 L230 14 Z" fill="#e8f0eb"/>
      <text x="315" y="62" fontSize="37" fill={copper}>提交新几何</text>
     </g>
    </svg>
   </div>
   <div style={{fontSize:33,color:ink,fontWeight:560,marginTop:14}}>截面编辑示意 · 旧网格与载荷失效</div>
   <div style={{fontSize:33,color:ink,marginTop:20}}>关键决定，工程师能介入</div>
  </>}
 </div>;
}
