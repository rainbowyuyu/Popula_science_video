import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Stage,Head,Gradient,Orb,Lift,flow} from '../design';

export const Spark=()=>{
 const f=useCurrentFrame();
 return <Stage>
  <div style={{position:'absolute',inset:0,transform:`scale(${flow(f,0,150,1.06,1)})`}}><Orb x={1180} y={250} size={480}/></div>
  <Head x={155} y={330} size={106} width={1100}>从一个<br/><Gradient>想法开始。</Gradient></Head>
  <Lift delay={150} style={{position:'absolute',left:163,top:635,fontSize:46,color:'#777d92',letterSpacing:1}}>让想象，开启工程设计。</Lift>
  <Lift delay={230} style={{position:'absolute',left:165,top:760,fontSize:23,color:'#9296a9',letterSpacing:5}}>构想 · 设计 · 验证</Lift>

 </Stage>;
};
