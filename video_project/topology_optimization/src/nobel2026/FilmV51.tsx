import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
import {AbsoluteFill, Audio, Img, cancelRender, continueRender, delayRender, staticFile, useCurrentFrame} from 'remotion';
import {NobelWorldV51, NobelState, clamp, smooth} from './WorldV51';
import {EvidenceFigureV51} from './EvidenceFigureV51';
import timeline from './timeline-v51.json';

const ink='#163e48', muted='#657e81', cyan='#168ca5', gold='#b57d39';
const sans='"Nobel Sans", "Microsoft YaHei", sans-serif';
const serif='"Nobel Serif", "Noto Serif SC", serif';
const scenes=timeline.scenes, clips=timeline.clips;
type Clip=(typeof clips)[number];
type EditorialState=NobelState & {globalFrame:number;clipId:string;clipElapsed:number;phraseIndex:number;phraseProgress:number};
let fontsPromise:Promise<void>|undefined;
function useFonts(){
 const [handle]=useState(()=>delayRender('Load stable editorial fonts'));
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  fontsPromise??=Promise.all([
   ['Nobel Sans','sans.woff2','400 700'],['Nobel Serif','serif.woff2','700'],
  ].map(async ([family,file,weight])=>{
   const face=new FontFace(family,`url(${staticFile(`nobel2026/fonts/${file}`)})`,{weight});
   await face.load(); (document.fonts as unknown as {add:(font:FontFace)=>void}).add(face);
  })).then(()=>document.fonts.ready).then(()=>undefined);
  fontsPromise.then(()=>setReady(true)).catch(cancelRender);
 },[handle]);
 useLayoutEffect(()=>{if(ready)continueRender(handle);},[ready,handle]);
 return ready;
}
export function stateAtV51(frame:number):EditorialState{
 const n=Math.max(0,Math.min(timeline.duration-1,frame));
 const idx=scenes.findIndex(s=>n>=s.start&&n<s.end), scene=scenes[Math.max(0,idx)];
 const sceneClips=clips.filter(c=>c.scene===scene.id);
 const clip=sceneClips.filter(c=>n>=c.start).at(-1)??sceneClips[0];
 const elapsed=clip?(n-clip.start)/30:0;
 const phrases=clip?.subtitleParts??[];
 const phrase=phrases.reduce((last,p,i)=>elapsed>=p.start?i:last,0);
 const part=phrases[phrase];
 return {scene:scene.id,progress:clamp((n-scene.start)/(scene.end-scene.start)),line:clip?sceneClips.indexOf(clip):0,
  lineProgress:clip?clamp((n-clip.start)/(clip.end-clip.start)):0,time:n/30,previous:scenes[idx-1]?.id,elapsed:(n-scene.start)/30,
  globalFrame:n,clipId:clip?.id??'',clipElapsed:elapsed,phraseIndex:phrase,phraseProgress:part?clamp((elapsed-part.start)/Math.max(.01,part.end-part.start)):0};
}
function Stage({state,opacity=1,offset=0}:{state:EditorialState;opacity?:number;offset?:number}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<NobelWorldV51|null>(null);
 useLayoutEffect(()=>{world.current=new NobelWorldV51(canvas.current!);return()=>{world.current?.dispose();world.current=null;};},[]);
 useLayoutEffect(()=>{world.current?.render(state);},[state]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:1920,height:1080,opacity,transform:`translateX(${offset}px)`}}/>;
}
function Brand(){return <div style={{position:'absolute',left:100,top:44,zIndex:20,display:'flex',gap:13,alignItems:'center',height:58,color:ink,fontFamily:sans}}>
 <Img src={staticFile('nobel2026/logo.png')} style={{width:45,height:54,objectFit:'contain'}}/>
 <span style={{fontSize:32,fontWeight:650,letterSpacing:.5}}>rainbow鱼</span>
 </div>;}
const titles:Record<string,string>={hook:'一束光，怎样叫醒神经元？',context:'看到一起发生，还不够',algae:'线索，藏在一滴绿水里',channel:'给细胞装上一扇光控的门',neuron:'让神经元跟上光的节拍',brain:'从一个细胞，走进活体大脑',impact:'沿着一束光，追问因果',references:'好奇心，把光变成了开关'};
const sub:Record<string,string>={hook:'2026 诺贝尔生理学或医学奖 · 光遗传学',context:'观察关联 → 主动干预 → 观察变化',algae:'感受光线 · 改变游动方向 · 测量光电流',channel:'感光基因 → 膜上的通道 → 电信号',neuron:'挑出哪类细胞，决定何时启动',brain:'光纤定位 · 选中细胞 · 观察行为',impact:'从研究工具，到早期临床探索',references:'衣藻感光 → 光控通道 → 神经回路'};
function SceneTitle({state}:{state:EditorialState}){
 const enter=smooth((state.elapsed??0)/.65);
 const brainSub=state.clipId==='016'?'睡眠与觉醒：让同一束光回答另一个问题':state.clipId==='017'?'重新激活记忆痕迹，观察恐惧反应':sub[state.scene];
 return <div style={{position:'absolute',left:104,top:143,zIndex:10,color:ink,width:1650,opacity:enter,transform:`translateY(${12*(1-enter)}px)`}}>
  <div style={{fontFamily:serif,fontSize:62,lineHeight:1.22,fontWeight:700,letterSpacing:1}}>{titles[state.scene]}</div>
  <div style={{fontFamily:sans,fontSize:27,lineHeight:1.5,marginTop:15,color:cyan}}>{brainSub}</div>
 </div>;
}
const credits:{from:string;to:string;team:string;study:string}[]=[
 {from:'003',to:'006',team:'Peter Hegemann · Hartmann Harz 团队',study:'衣藻光电流研究 · 1992'},
 {from:'007',to:'010',team:'Georg Nagel · Peter Hegemann · Ernst Bamberg 团队',study:'ChR1 / ChR2 · 2002–2003'},
 {from:'011',to:'013',team:'Edward Boyden · Feng Zhang · Karl Deisseroth 团队',study:'培养神经元的毫秒级光控 · 2005'},
 {from:'014',to:'014',team:'Karl Deisseroth · Guoping Feng 等',study:'光遗传学命名综述 · 2006'},
 {from:'015',to:'015',team:'Alexander Aravanis · Karl Deisseroth 团队',study:'活体运动皮层与胡须偏转 · 2007'},
 {from:'016',to:'016',team:'Antoine Adamantidis · Luis de Lecea 团队',study:'下丘脑食欲素神经元与觉醒 · 2007'},
 {from:'017',to:'017',team:'Xu Liu · Steve Ramirez · Susumu Tonegawa 团队',study:'光遗传学重激活恐惧记忆 · 2012'},
 {from:'019',to:'019',team:'José-Alain Sahel · Botond Roska 团队',study:'部分视觉功能恢复 · 早期临床研究 · 2021'},
];
function ResearchCredit({state}:{state:EditorialState}){
 const item=credits.find(c=>state.clipId>=c.from&&state.clipId<=c.to);if(!item)return null;
 const start=clips.find(c=>c.id===item.from)!.start;
 const elapsed=(state.globalFrame-start)/30;
 const alpha=smooth(elapsed/.6)*(1-smooth((elapsed-6.3)/.8));
 if(alpha<.002)return null;
 return <div style={{position:'absolute',right:100,top:272,width:710,zIndex:12,opacity:alpha,color:ink,fontFamily:sans,lineHeight:1.35}}>
  <div style={{fontSize:24,fontWeight:650}}>{item.team}</div>
  <div style={{fontSize:22,marginTop:7,color:muted}}>{item.study}</div>
 </div>;
}
function Scientists({state}:{state:EditorialState}){
 if(state.clipId!=='001')return null;
 const cue=clips.find(c=>c.id==='001')!;
 const alpha=smooth(state.clipElapsed/.65)*(1-smooth((state.clipElapsed-(cue.end-cue.start)/30+.6)/.6));
 return <div style={{position:'absolute',left:1190,top:390,width:630,zIndex:8,opacity:alpha,color:ink,fontFamily:sans}}>
  <div style={{fontSize:24,color:muted,marginBottom:35}}>2026 · 生理学或医学奖</div>
  {['Karl Deisseroth','Peter Hegemann','Georg Nagel'].map(name=>{
   const part=cue.subtitleParts.find(p=>p.text===name)!;
   const q=smooth((state.clipElapsed-part.start)/.4);
   return <div key={name} style={{height:109,borderBottom:'1px solid #163e4820',display:'flex',alignItems:'center',gap:22}}>
    <span style={{width:6,height:36,borderRadius:3,background:cyan,opacity:.15+.85*q}}/>
    <span style={{fontFamily:serif,fontSize:39,color:q>.01?ink:muted,opacity:.45+.55*q}}>{name}</span>
   </div>;
  })}
 </div>;
}
function Caption({clip,state}:{clip:Clip;state:EditorialState}){
 const elapsed=(state.globalFrame-clip.start)/30;
 const ps=clip.subtitleParts;
 const i=ps.findIndex((p,k)=>elapsed>=p.start&&elapsed<Math.min(p.end+.10,ps[k+1]?.start??Infinity));
 if(i<0)return null;
 const p=ps[i],opacity=.9+.1*smooth((elapsed-p.start)/.12);
 return <div style={{position:'absolute',left:100,right:100,top:952,height:76,zIndex:25,display:'flex',justifyContent:'center',alignItems:'center',pointerEvents:'none',fontFamily:sans}}>
  <div style={{fontSize:p.text.length>32?40:44,lineHeight:1.24,fontWeight:550,color:ink,opacity,whiteSpace:'nowrap',padding:'10px 25px',borderRadius:8,background:'rgba(248,247,240,.96)',boxShadow:'0 3px 20px rgba(26,64,72,.035)'}}>{p.text}</div>
 </div>;
}
const papers=[
 {image:'POP_Fig_3_ENG_01.jpg',focus:'60% 48%',title:'Channelrhodopsin-2',meta:'Nagel et al. · PNAS · 2003'},
 {image:'POP_Fig_4_ENG_01.jpg',focus:'52% 40%',title:'Optical control of neural activity',meta:'Boyden et al. · Nature Neuroscience · 2005'},
 {image:'POP_Fig_5_ENG_01.jpg',focus:'56% 45%',title:'An optical neural interface',meta:'Aravanis et al. · J. Neural Engineering · 2007'},
];
function References({state}:{state:EditorialState}){
 const t=state.elapsed??0,enter=smooth(t/1.05);
 return <>
  <div style={{position:'absolute',left:105,top:349,width:1710,display:'flex',gap:44,perspective:1700,zIndex:5}}>
   {papers.map((p,i)=>{const q=smooth((t-i*.16)/.9);return <div key={p.title} style={{width:540,opacity:q,transform:`translateY(${26*(1-q)}px) rotateY(${(i-1)*(4-3*q)}deg)`,transformOrigin:'50% 50%'}}>
    <div style={{height:300,padding:7,background:'#fffdf7',borderRadius:10,boxShadow:'0 20px 42px rgba(18,62,71,.13)',overflow:'hidden'}}><Img src={staticFile(`nobel2026/${p.image}`)} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:p.focus,borderRadius:5}}/></div>
    <div style={{fontFamily:serif,fontSize:27,color:ink,lineHeight:1.3,marginTop:23}}>{p.title}</div>
    <div style={{fontFamily:sans,fontSize:22,color:muted,lineHeight:1.4,marginTop:10}}>{p.meta}</div>
   </div>;})}
  </div>
  <div style={{position:'absolute',left:108,right:108,top:858,display:'flex',justifyContent:'space-between',fontFamily:sans,color:muted,fontSize:21,lineHeight:1.5,opacity:enter}}>
   <span>研究延伸：Liu et al. · 2012 ／ Sahel et al. · 2021</span>
   <span style={{textAlign:'right'}}>科普插图：NobelPrize.org · Mattias Karlén<br/>© The Nobel Committee for Physiology or Medicine</span>
  </div>
 </>;
}
export function NobelFilmV51({audio=true}:{audio?:boolean}){
 const fontsReady=useFonts();const frame=useCurrentFrame(),state=stateAtV51(frame);
 const scene=scenes.find(s=>s.id===state.scene)!;
 const transition=scene.start>0?smooth((frame-scene.start)/24):1;
 const previous=scene.start>0&&transition<1?stateAtV51(scene.start-1):null;
 const cap=clips.find(c=>frame>=c.start&&frame<c.end);
 return <AbsoluteFill style={{background:'#f4f0e5',overflow:'hidden',fontFamily:sans}}>
  {fontsReady&&<Stage state={state}/>}
  {fontsReady&&previous&&<Stage state={previous} opacity={1-transition} offset={-18*transition}/>}
  <div style={{position:'absolute',left:100,right:100,top:122,height:1,background:'linear-gradient(90deg,#163e482c,#163e4808)',zIndex:9}}/>
  <Brand/>
  <SceneTitle state={state}/>
  <ResearchCredit state={state}/>
  <Scientists state={state}/>
  <EvidenceFigureV51 state={state}/>
  {state.scene==='references'&&<References state={state}/>}
  {cap&&<Caption clip={cap} state={state}/>}
  {audio&&<Audio src={staticFile('nobel2026/audio-v51/master.wav')}/>}
 </AbsoluteFill>;
}
