import React from 'react';
import {Stage,Head,Gradient,Lift,Chip,Note} from '../design';
export const Gate=()=> <Stage tone="pearl" label="05 / REVIEW">
 <Head x={150} y={175} size={76} width={1620} center>Clear criteria. <Gradient>Traceable decisions.</Gradient></Head>
 <Lift delay={35} style={{position:'absolute',left:165,top:355,width:710,height:380,borderRadius:32,padding:'34px 40px',background:'#ffffffb8',border:'1px solid white'}}>
  <div style={{fontSize:23,letterSpacing:3,color:'#85869c'}}>INTERNAL CANDIDATE SCREENING</div>
  <div style={{fontSize:132,fontWeight:600,letterSpacing:-5,lineHeight:1.5}}><Gradient>S ≥ 85</Gradient></div>
  <div style={{fontSize:34,color:'#5b6278'}}>Every dimension ≥ 60</div>
 </Lift>
 <Lift delay={85} style={{position:'absolute',left:955,top:365,width:805}}>
  <div style={{fontSize:26,color:'#737d96'}}>11 reference projects · 10 in agreement analysis</div>
  <div style={{display:'flex',gap:45,marginTop:38}}>{[['0.612','Spearman ρ'],['4.0','Mean absolute difference'],['9 / 10','Agreement rule met']].map(([v,t])=><div key={t} style={{flex:1}}><div style={{fontSize:65,fontWeight:600,color:'#617ac3',whiteSpace:'nowrap'}}>{v}</div><div style={{fontSize:21,lineHeight:1.6,color:'#83899b',marginTop:14}}>{t}</div></div>)}</div>
  <div style={{fontSize:23,lineHeight:1.7,color:'#778096',marginTop:35}}>Two scoring channels, compared within the fleet.<br/>Internal screening and external appraisal are separate.</div>
 </Lift>
 <Lift delay={115} style={{position:'absolute',top:810,left:120,right:120,display:'flex',justifyContent:'center',gap:18}}>{['Capacity','Steel intensity','Unit cost','Constructability','Fatigue life'].map(x=><Chip key={x}>{x}</Chip>)}</Lift>
 <Note x={165} y={902}>Complete inputs, resolved recovery and physical constraints are also required.</Note>
</Stage>;
