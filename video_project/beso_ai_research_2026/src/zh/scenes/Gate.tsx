import React from 'react';
import {Stage,Head,Gradient,Lift,Chip,Note} from '../design';
export const Gate=()=> <Stage tone="pearl" label="05 / 内部评审">
 <Head x={150} y={175} size={76} width={1620} center>标准清晰，<Gradient>决策有据。</Gradient></Head>
 <Lift delay={35} style={{position:'absolute',left:165,top:355,width:710,height:380,borderRadius:32,padding:'34px 40px',background:'#ffffffb8',border:'1px solid white'}}>
  <div style={{fontSize:23,letterSpacing:3,color:'#85869c'}}>内部候选方案筛选</div>
  <div style={{fontSize:132,fontWeight:600,letterSpacing:-5,lineHeight:1.5}}><Gradient>S ≥ 85</Gradient></div>
  <div style={{fontSize:34,color:'#5b6278'}}>每个维度 ≥ 60 分</div>
 </Lift>
 <Lift delay={85} style={{position:'absolute',left:955,top:365,width:805}}>
  <div style={{fontSize:25,color:'#737d96'}}>11 个参考项目 · 10 个用于一致性分析</div>
  <div style={{display:'flex',gap:45,marginTop:38}}>{[['0.612','Spearman ρ'],['4.0','平均绝对差 / 分'],['9 / 10','满足一致性规则']].map(([v,t])=><div key={t} style={{flex:1}}><div style={{fontSize:65,fontWeight:600,color:'#617ac3',whiteSpace:'nowrap'}}>{v}</div><div style={{fontSize:21,lineHeight:1.6,color:'#83899b',marginTop:14}}>{t}</div></div>)}</div>
  <div style={{fontSize:23,lineHeight:1.7,color:'#778096',marginTop:35}}>两个计算评分通道，在参考项目内比较。<br/>内部筛选与外部独立评审分开进行。</div>
 </Lift>
 <Lift delay={115} style={{position:'absolute',top:810,left:120,right:120,display:'flex',justifyContent:'center',gap:18}}>{['机组容量','用钢强度','单位造价','可建造性','疲劳寿命'].map(x=><Chip key={x}>{x}</Chip>)}</Lift>
 <Note x={165} y={902}>同时要求输入完整、异常已解决，且满足物理约束。</Note>
</Stage>;
