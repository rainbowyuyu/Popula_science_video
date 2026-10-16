import React from 'react';
import {Img, staticFile} from 'remotion';
import timeline from './timeline-v11.json';
import type {State} from './WorldV11';

/** Literal crops of the source papers. Data points, contours and axes stay intact. */
type Figure = {file:string; label:string; credit:string; dark?:boolean};
type Cue = {at:number; figure:Figure};
const paper=(file:string,label:string,credit:string,dark=false):Figure=>({file:`papers-v11/${file}.png`,label,credit,dark});
const geometry=paper('icecube-geometry','真实探测器布局 · 86 条探测串','IceCube Collaboration · Figure 3');
const dom=paper('dom-module','玻璃压力球中的光学模块','J. Jarnestad / Royal Swedish Academy of Sciences');
const interaction=paper('interaction-ccnc','带电流与中性流 · 相互作用分支','Royal Swedish Academy of Sciences · Figure 2');
const track=paper('track-event','长径迹 · 沉积能量 2.6 PeV','IceCube Collaboration · Figure 4',true);
const cascade=paper('cascade-event','局部级联 · 1.14 PeV 事件','IceCube Collaboration · Figure 4',true);
const txs=paper('2018-txs-confidence','TXS 0506+056 · 原始方向置信区','IceCube et al. · Science 2018 · Figure 2A');
const ngc=paper('2022-ngc-evidence','NGC 1068 · 天区与背景之上的过量','R. Abbasi et al. · Science 2022 · Figure 2');
const likelihood=paper('2022-ngc-likelihood','通量与能谱斜率 · 似然置信区','R. Abbasi et al. · Science 2022 · Figure 3');
const FIGURES:Record<string,Cue[]>={
 '004':[{at:0,figure:geometry}],
 '005':[{at:0,figure:geometry},{at:6.85,figure:dom}],
 '006':[{at:0,figure:interaction},{at:10.397,figure:paper('2018-track-event','光到达时间 · IceCube-170922A','IceCube et al. · Science 2018 · Figure 1')}],
 '008':[{at:0,figure:track}],
 '009':[{at:0,figure:cascade}],
 '011':[
  {at:0,figure:paper('2013-event-evidence','28 个事件 · 能量与到达方向','M. G. Aartsen et al. · Science 2013 · Figure 2')},
  {at:13.794,figure:paper('2014-energy-evidence','988 天 · 数据与背景模型的比较','M. G. Aartsen et al. · PRL 2014 · Figure 2')},
 ],
 '012':[{at:0,figure:txs},{at:14.181,figure:ngc},{at:21.3,figure:likelihood}],
 '016':[{at:0,figure:geometry}],
};
const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const smooth=(v:number)=>{const x=clamp(v);return x*x*(3-2*x);};

function FigureCard({figure,opacity,progress,reveal=1,captionOpacity=1}:{figure:Figure;opacity:number;progress:number;reveal?:number;captionOpacity?:number}){
 if(opacity<=0)return null;
 // The paper has a fixed mount: camera movement never shakes labels or clips axes.
 const imageScale=1+.006*smooth(progress);
 return <div style={{position:'absolute',left:1100,top:332,width:720,height:516,zIndex:7,opacity,pointerEvents:'none',borderRadius:16,overflow:'hidden',border:'1px solid rgba(167,203,210,.25)',boxShadow:reveal>=1?'0 24px 72px rgba(0,0,0,.38)':undefined}}>
  <div style={{position:'relative',height:432,padding:16,boxSizing:'border-box',background:figure.dark?'#272727':'#f8f8f6',overflow:'hidden',clipPath:`inset(0 ${100*(1-reveal)}% 0 0)`}}>
   <Img src={staticFile(figure.file)} style={{display:'block',width:'100%',height:'100%',objectFit:'contain',transform:`scale(${imageScale})`,transformOrigin:'center'}}/>
  </div>
  <div style={{height:84,padding:'15px 22px 0',boxSizing:'border-box',background:'linear-gradient(180deg,#102d3b,#09202c)',fontFamily:'"Nobel Sans", "Microsoft YaHei", sans-serif'}}>
   <div style={{opacity:captionOpacity}}>
    <div style={{fontSize:24,fontWeight:650,lineHeight:'29px',color:'#eaf2f2',whiteSpace:'nowrap'}}>{figure.label}</div>
    <div style={{fontSize:17,lineHeight:'23px',marginTop:2,color:'#a9c3ca',whiteSpace:'nowrap'}}>{figure.credit}</div>
   </div>
  </div>
 </div>;
}

export function EvidenceFigureV11({state}:{state:State}){
 const clips=timeline.clips as Array<{id:string;start:number;end:number}>;
 const idx=clips.findIndex(c=>c.id===state.clipId);
 const cues=FIGURES[state.clipId]??[];
 let cueIndex=-1;
 for(let i=0;i<cues.length;i++)if(state.elapsed>=cues[i].at)cueIndex=i;
 const cue=cues[cueIndex];
 const previousClip=idx>0?FIGURES[clips[idx-1].id]:undefined;
 const previous=cueIndex>0?cues[cueIndex-1].figure:previousClip?.[previousClip.length-1]?.figure;
 const current=cue?.figure;
 if(!current)return null;
 const next=clips[idx+1];
 const exit=next&&!FIGURES[next.id]?smooth((next.start-state.frame)/21):1;
 if(previous?.file===current.file)return <FigureCard figure={current} opacity={exit} progress={state.progress}/>;
 const phase=clamp((state.elapsed-(cue?.at??0))/.72);
 const handoff=smooth(phase);
 // Wipe only the image. The opaque caption mount keeps complete phrases
 // intact: old text fades out before new text fades in, never word splicing.
 const outgoing=1-smooth(phase/.42);
 const incoming=smooth((phase-.5)/.5);
 return <>
  {previous&&handoff<1&&<FigureCard key={`out-${previous.file}`} figure={previous} opacity={exit} progress={1} captionOpacity={0}/>}
  <FigureCard key={`in-${current.file}`} figure={current} opacity={previous?exit:handoff*exit} reveal={previous?handoff:1} progress={state.progress} captionOpacity={previous?incoming:1}/>
  {previous&&outgoing>0&&<div style={{position:'absolute',left:1123,top:780,zIndex:8,opacity:exit*outgoing,fontFamily:'"Nobel Sans", "Microsoft YaHei", sans-serif',pointerEvents:'none'}}>
   <div style={{fontSize:24,fontWeight:650,lineHeight:'29px',color:'#eaf2f2',whiteSpace:'nowrap'}}>{previous.label}</div>
   <div style={{fontSize:17,lineHeight:'23px',marginTop:2,color:'#a9c3ca',whiteSpace:'nowrap'}}>{previous.credit}</div>
  </div>}
 </>;
}
