import React from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {TransitionSeries} from '@remotion/transitions';
import type {Caption} from '@remotion/captions';
import timeline from './timeline.json';
import {scenes} from './scenes';

const captions: Caption[] = timeline.captions;

const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const ms = frame / 30 * 1000;
  const caption = captions.find(c => c.startMs <= ms && c.endMs > ms);
  return <div style={{position:'absolute',bottom:71,left:100,right:100,textAlign:'center',height:64,
    display:'flex',alignItems:'center',justifyContent:'center'}}>
    {caption && <span style={{fontSize:35,lineHeight:1.4,fontWeight:500,color:'#F1F5FD',
      background:'#0B1220',padding:'6px 25px',borderRadius:8}}>{caption.text}</span>}
  </div>;
};

export const Explainer: React.FC = () => {
  const frame = useCurrentFrame();
  const chapter = timeline.chapters.find(c => frame >= c.start && frame < c.start+c.frames) ?? timeline.chapters[0];
  return <AbsoluteFill style={{backgroundColor:'#0B1220',fontFamily:'"Microsoft YaHei", sans-serif',color:'#E9F1FF'}}>
    <TransitionSeries>
      {timeline.chapters.map((c,i) => {
        const Scene = scenes[i];
        return <TransitionSeries.Sequence key={c.id} durationInFrames={c.frames} name={`${i+1}. ${c.title}`}>
          <Scene/>
        </TransitionSeries.Sequence>;
      })}
    </TransitionSeries>
    <Sequence name="中文字幕"><Captions/></Sequence>
    <div style={{position:'absolute',bottom:31,left:84,fontSize:17,color:'#7890AE',letterSpacing:2}}>
      概率密度演化 × 大模型幻觉 / 理论讲解与教学仿真
    </div>
    <div style={{position:'absolute',bottom:31,right:84,fontSize:18,color:'#94A9C4',fontVariantNumeric:'tabular-nums'}}>
      {String(chapter.id+1).padStart(2,'0')} / 18  · {Math.floor(frame/30/60).toString().padStart(2,'0')}:{Math.floor(frame/30%60).toString().padStart(2,'0')}
    </div>
    <div style={{position:'absolute',bottom:0,height:4,left:0,width:`${100*frame/(timeline.frames-1)}%`,backgroundColor:'#56DDD3'}}/>
  </AbsoluteFill>;
};
