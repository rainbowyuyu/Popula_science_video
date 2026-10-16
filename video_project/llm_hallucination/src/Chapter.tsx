import React from 'react';
import {AbsoluteFill, interpolate, Sequence, staticFile, useCurrentFrame} from 'remotion';
import {Audio, Video} from '@remotion/media';
import timeline from './timeline.json';

export const Chapter: React.FC<{id:number}> = ({id}) => {
  const frame=useCurrentFrame();
  const c=timeline.chapters[id];
  return <AbsoluteFill style={{backgroundColor:'#0B1220'}}>
    <Video src={staticFile(c.clip)} muted style={{position:'absolute',left:160,top:137,width:1600,height:800}}/>
    <div style={{position:'absolute',left:84,top:42,width:1752,display:'flex',alignItems:'center',gap:21,
      opacity:interpolate(frame,[0,18,c.frames-12,c.frames-1],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}}>
      <span style={{fontSize:20,color:'#56DDD3',border:'1px solid #315255',borderRadius:5,padding:'9px 15px',whiteSpace:'nowrap'}}>
        {String(id+1).padStart(2,'0')} {c.tag}
      </span>
      <span style={{fontSize:43,fontWeight:600,letterSpacing:-1}}>{c.title}</span>
    </div>
    <div style={{position:'absolute',left:86,top:111,fontSize:21,color:'#8CA2BE',
      opacity:interpolate(frame,[5,25],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}}>{c.subtitle}</div>
    {c.segments.map((s,i)=><Sequence key={s.file} from={s.from} durationInFrames={s.frames} name={`旁白 ${i+1}`}>
      <Audio src={staticFile(s.file)}/>
    </Sequence>)}
  </AbsoluteFill>;
};
