import React from 'react';
import {Img, staticFile} from 'remotion';
import timeline from './timeline-v06.json';
import type {State} from './WorldV03';

/**
 * Official illustrations are evidence references, not simulated detector output.
 * Each edit cross-fades the previous page into the next one so the paper window
 * never disappears for a single frame at a natural narration pause.
 */
const FIGURES: Record<string,{file:string;label:string;credit:string;position?:string}> = {
  '004': {file:'fig-main.jpg',label:'IceCube：把南极冰变成望远镜',credit:'© Johan Jarnestad / The Royal Swedish Academy of Sciences'},
  '005': {file:'fig-ice.jpg',label:'探测器串与深冰光学模块',credit:'© Johan Jarnestad / The Royal Swedish Academy of Sciences'},
  '006': {file:'fig-ice.jpg',label:'Cherenkov 光在冰中的读出',credit:'© Johan Jarnestad / The Royal Swedish Academy of Sciences'},
  '007': {file:'fig-ice.jpg',label:'速度阈值与光锥',credit:'© Johan Jarnestad / The Royal Swedish Academy of Sciences'},
  '008': {file:'fig-main.jpg',label:'Track：沿径迹读取方向',credit:'© Johan Jarnestad / The Royal Swedish Academy of Sciences'},
  '009': {file:'fig-main.jpg',label:'Cascade：局部簇射的能量',credit:'© Johan Jarnestad / The Royal Swedish Academy of Sciences'},
  '011': {file:'fig-messenger.jpg',label:'高能事件：从光到证据',credit:'© Johan Jarnestad / The Royal Swedish Academy of Sciences'},
  '012': {file:'fig-messenger.jpg',label:'宇宙信使与候选源',credit:'© Johan Jarnestad / The Royal Swedish Academy of Sciences'},
  '016': {file:'fig-main.jpg',label:'一束蓝光留下的回应',credit:'© Johan Jarnestad / The Royal Swedish Academy of Sciences'},
};
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(v:number)=>{const x=clamp(v);return x*x*(3-2*x);};

type Figure=typeof FIGURES[string];
function FigureCard({figure,opacity,progress}:{figure:Figure;opacity:number;progress:number}){
 const eased=smooth(progress);
 const zoom=1.01+.025*eased;
 const driftX=-5+10*eased;
 const sweep=-22+44*eased;
 return <div style={{position:'absolute',right:90,top:380,width:720,zIndex:7,opacity,pointerEvents:'none',transform:`translate3d(0,${-2+4*eased}px,0)`}}>
   <div style={{height:405,borderRadius:18,overflow:'hidden',background:'#0b2533',border:'1px solid rgba(139,221,232,.32)',boxShadow:'0 22px 70px rgba(0,0,0,.34)'}}>
    <div style={{height:350,display:'flex',alignItems:'center',justifyContent:'center',background:'rgba(7,25,37,.96)',overflow:'hidden',position:'relative'}}>
      <Img src={staticFile(figure.file)} style={{width:'100%',height:'100%',objectFit:'contain',objectPosition:figure.position??'center',transform:`translate3d(${driftX}px,0,0) scale(${zoom})`,filter:'saturate(.9) contrast(1.04)'}} />
      <div style={{position:'absolute',inset:0,pointerEvents:'none',background:`linear-gradient(108deg,transparent ${sweep-16}%,rgba(185,244,248,.075) ${sweep}%,transparent ${sweep+16}%)`,mixBlendMode:'screen'}} />
    </div>
    <div style={{position:'relative',height:55,padding:'9px 24px 0',background:'linear-gradient(180deg,rgba(3,17,26,.94),rgba(3,17,26,.99))',fontFamily:'"Nobel Sans", "Microsoft YaHei", sans-serif'}}>
      <div style={{fontSize:23,fontWeight:650,letterSpacing:.2,color:'#eaf2f2',lineHeight:1.1}}>{figure.label}</div>
      <div style={{fontSize:14,color:'#9bb8bc',marginTop:4,lineHeight:1}}>{figure.credit}</div>
    </div>
   </div>
 </div>;
}

export function EvidenceFigureV01({state}:{state:State}){
 const clips=timeline.clips as Array<{id:string;start:number;end:number}>;
 const idx=Math.max(0,clips.findIndex(c=>c.id===state.clipId));
 const current=FIGURES[state.clipId];
 const previous=idx>0?FIGURES[clips[idx-1].id]:undefined;
 if(!current && !previous)return null;
 const handoff=smooth(state.elapsed/.65);
 const currentOpacity=current?handoff:0;
 const previousOpacity=previous?1-handoff:0;
 return <>
   {previous&&<FigureCard figure={previous} opacity={previousOpacity} progress={1}/>} 
   {current&&<FigureCard figure={current} opacity={currentOpacity} progress={state.progress}/>} 
 </>;
}
