import React from 'react';
import {AbsoluteFill} from 'remotion';
import timeline from './timeline.json';

export const HeaderOverlay: React.FC<{chapterId:number}> = ({chapterId}) => {
  const c=timeline.chapters[chapterId];
  return <AbsoluteFill style={{fontFamily:'"Microsoft YaHei", sans-serif',color:'#E9F1FF'}}>
    <div style={{position:'absolute',left:84,top:42,width:1752,display:'flex',alignItems:'center',gap:21}}>
      <span style={{fontSize:20,color:'#56DDD3',border:'1px solid #315255',borderRadius:5,padding:'9px 15px',whiteSpace:'nowrap'}}>
        {String(chapterId+1).padStart(2,'0')} {c.tag}
      </span>
      <span style={{fontSize:43,fontWeight:600,letterSpacing:-1}}>{c.title}</span>
    </div>
    <div style={{position:'absolute',left:86,top:111,fontSize:21,color:'#8CA2BE'}}>{c.subtitle}</div>
    <div style={{position:'absolute',bottom:31,left:84,fontSize:17,color:'#7890AE',letterSpacing:2}}>
      概率密度演化 × 大模型幻觉 / 理论讲解与教学仿真
    </div>
    <div style={{position:'absolute',bottom:31,right:84,fontSize:18,color:'#94A9C4'}}>
      {String(chapterId+1).padStart(2,'0')} / 18
    </div>
  </AbsoluteFill>;
};
