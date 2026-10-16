import React,{useLayoutEffect,useRef} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame} from 'remotion';
import {NobelWorldV4,NobelState,clamp,smooth} from './WorldV4';
import {EvidenceFigureV4} from './EvidenceFigureV4';
import timeline from './timeline-v4.json';

const ink='#183746',muted='#5f7680',cyan='#168da8',gold='#d8943d',paper='#fffdf8';
const scenes=(timeline as any).scenes, clips=(timeline as any).clips;
function stateAt(frame:number):NobelState{const idx=Math.max(0,scenes.findIndex((s:any)=>frame>=s.start&&frame<s.end));const scene=scenes[idx]??scenes[scenes.length-1];const cs=clips.filter((c:any)=>c.scene===scene.id);const clip=cs.filter((c:any)=>frame>=c.start).at(-1)??cs[0];return {scene:scene.id,progress:clamp((frame-scene.start)/Math.max(1,scene.end-scene.start)),line:clip?cs.indexOf(clip):0,lineProgress:clip?clamp((frame-clip.start)/Math.max(1,clip.end-clip.start)):0,time:frame/30,previous:scenes[idx-1]?.id,elapsed:(frame-scene.start)/30};}
function Stage({state}:{state:NobelState}){const ref=useRef<HTMLCanvasElement>(null),world=useRef<NobelWorldV4|null>(null);useLayoutEffect(()=>{world.current=new NobelWorldV4(ref.current!);return()=>{world.current?.dispose();world.current=null}},[]);useLayoutEffect(()=>{world.current?.render(state)},[state]);
  // A barely perceptible camera drift keeps the continuous Three.js stage alive
  // while the editorial layer stays locked for legibility.  The easing is
  // deterministic, so stills and the final render use identical framing.
  const driftX=2.8*Math.sin(state.time*.21), driftY=1.8*Math.cos(state.time*.17);
  const scale=1.008+0.004*Math.sin(state.time*.13);
  return <canvas ref={ref} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%',transform:`translate3d(${driftX}px,${driftY}px,0) scale(${scale})`,transformOrigin:'50% 52%'}}/>;}
function Brand(){return <div style={{position:'absolute',left:58,top:42,zIndex:10,display:'flex',alignItems:'center',gap:16,color:ink,fontFamily:'"Microsoft YaHei",sans-serif',fontSize:39,fontWeight:700,letterSpacing:.5}}><img src={staticFile('nobel2026/logo.png')} alt="rainbow鱼" style={{width:62,height:74,objectFit:'contain'}}/><span>rainbow鱼</span></div>;}
const titles:Record<string,string>={hook:'如果只叫醒一小群细胞？',context:'从“相关”走到“因果”',algae:'答案先从一滴绿水里游来',channel:'让蛙卵长出一扇光控的门',neuron:'把这把门装进神经元',brain:'光纤伸进活体脑内',impact:'一束光，开始拆分神经回路',references:'一条可以反复验证的因果链'};
const titleSubs:Record<string,string>={hook:'2026 诺贝尔生理学或医学奖 · 光遗传学',context:'一整片亮起 ≠ 找到真正的起点',algae:'Chlamydomonas · 眼点 · 约 0.5 ms',channel:'Xenopus 卵母细胞 · ChR2 · 约 0.2 ms',neuron:'Boyden et al. · 2005 · 培养神经元',brain:'Aravanis et al. · 2007 · 活体小鼠实验',impact:'研究工具与临床探索的边界',references:'for their discoveries concerning light-gated ion channels and optogenetics'};
function SceneTitle({state}:{state:NobelState}){
 const q=smooth(clamp((state.elapsed??0)/1.0));
 const current=state.scene, previous=state.previous&&titles[state.previous]?state.previous:undefined;
 const label=(scene:string,enter:boolean)=><div style={{position:'absolute',inset:0,transform:`translate3d(${enter?900*(1-q):-900*q}px,${enter?12*(1-q):0}px,0)`,opacity:enter?q:1-q}}><div style={{fontSize:scene==='hook'?78:66,fontWeight:760,letterSpacing:-2,lineHeight:1.15}}>{titles[scene]}</div><div style={{fontSize:30,color:scene==='impact'?gold:cyan,marginTop:13,letterSpacing:.4}}>{titleSubs[scene]}</div></div>;
 return <div style={{position:'absolute',left:110,top:145,zIndex:7,color:ink,width:1540,height:155,overflow:'visible'}}>{previous&&label(previous,false)}{label(current,true)}</div>;
}
function Scientists({state}:{state:NobelState}){
 if(state.scene!=='hook'||state.line!==1)return null;
 const cue=clips.find((c:any)=>c.id==='001');
 const elapsed=state.time-cue.start/30;
 const names=['Karl Deisseroth','Peter Hegemann','Georg Nagel'];
 const q=smooth(clamp((state.elapsed??0)/.75));
 return <div style={{position:'absolute',right:104,top:315,zIndex:7,color:ink,width:600,
   transform:`translate3d(${36*(1-q)}px,0,0)`,opacity:q,textAlign:'right'}}>
   <div style={{fontSize:27,letterSpacing:1,color:cyan,fontWeight:700}}>2026 NOBEL LAUREATES</div>
   {names.map(name=>{const part=cue.subtitleParts.find((p:any)=>p.text===name);
     const spoken=part&&elapsed>=part.start&&elapsed<part.end;
     const seen=part&&elapsed>=part.start;
     return <div key={name} style={{fontSize:42,lineHeight:1.38,fontWeight:700,
       color:spoken?ink:muted,opacity:seen?1:.42,
       transform:`translate3d(${spoken?-8:0}px,0,0)`,
       textShadow:spoken?'0 3px 20px #fff9':'none'}}>{name}</div>})}
 </div>;
}
function parts(text:string){return text.match(/[^。！？；：]+[。！？；：]?/g)?.map(s=>s.trim()).filter(Boolean)??[text];}
type CaptionPart={text:string;start?:number;end?:number};
/**
 * Display the same sentence that was sent to TTS, at the relative time where
 * Whisper found it in the processed clip.  Older timelines without
 * `subtitleParts` still fall back to punctuation units, so previews remain
 * renderable while a new alignment audit is being produced.
 */
function Caption({text,progress,clip,bottom=46}:{text:string;progress:number;clip?:any;bottom?:number}){
 const fallback:CaptionPart[]=parts(text).map(x=>({text:x}));
 const ps:CaptionPart[]=Array.isArray(clip?.subtitleParts)&&clip.subtitleParts.length?clip.subtitleParts:fallback;
 const clipSeconds=clip?Math.max(.001,(clip.end-clip.start)/30):1;
 const elapsed=clamp(progress)*clipSeconds;
 // End captions shortly after the measured speech, rather than holding the
 // last sentence across a visual pause.
 const speechEnd=Number(clip?.asrSpeechEnd??clipSeconds);
 if(clip && elapsed>speechEnd+0.16)return null;
 let idx=ps.findIndex(p=>p.start!==undefined&&elapsed>=Number(p.start)&&elapsed<Number(p.end??Infinity));
 if(idx<0){
   // A measured pause is a pause on screen too. Only the final syllable gets
   // a brief visual hold; older behavior showed the last line through every
   // mid-sentence breath and made captions appear ahead of the voice.
   const last=ps.length-1;
   const lastEnd=Number(ps[last]?.end);
   if(Number.isFinite(lastEnd)&&elapsed>=lastEnd&&elapsed<=lastEnd+0.12)idx=last;
   else if(ps.some(p=>p.start===undefined))idx=Math.min(last,Math.floor(clamp(progress)*ps.length));
   else return null;
 }
 const current=ps[Math.max(0,idx)]??{text};
 const start=Number(current.start??(idx/Math.max(1,ps.length))*clipSeconds);
 const end=Number(current.end??((idx+1)/Math.max(1,ps.length))*clipSeconds);
 const local=clamp((elapsed-start)/Math.max(.001,end-start));
 return <div style={{position:'absolute',left:90,right:90,bottom,zIndex:9,display:'flex',justifyContent:'center',pointerEvents:'none'}}><div key={`${clip?.id??'caption'}-${idx}`} style={{fontFamily:'"Microsoft YaHei",sans-serif',fontSize:46,fontWeight:600,lineHeight:1.24,color:'#fffdf7',background:'rgba(24,55,70,.93)',borderRadius:15,padding:'13px 30px',maxWidth:1420,textAlign:'center',boxShadow:'0 14px 30px rgba(24,55,70,.2)',opacity:.84+.16*smooth(local/.18),transform:`translateY(${6*(1-smooth(local/.18))}px)`}}>{current.text}</div></div>;
}
type EvidenceSpec={src:string;title:string;kind:'official'|'rebuild'};
const evidenceByScene:Record<string,EvidenceSpec>={
 algae:{src:'nobel2026/POP_Fig_2.jpg',title:'衣藻眼点与趋光反应',kind:'official'},
 channel:{src:'nobel2026/POP_Fig_3_ENG_01.jpg',title:'基因进入蛙卵，膜上表达通道',kind:'official'},
 neuron:{src:'nobel2026/POP_Fig_4_ENG_01.jpg',title:'培养神经元的光刺激读出',kind:'official'},
 brain:{src:'nobel2026/POP_Fig_5_ENG_01.jpg',title:'活体小鼠运动皮层实验',kind:'official'}
};
function EvidenceCard({spec,state,enter}:{spec:EvidenceSpec;state:NobelState;enter:boolean}){
 const q=smooth(clamp((state.elapsed??0)/1.2));
 const drift=8*Math.sin((state.lineProgress??0)*Math.PI);
 const x=enter?560*(1-q)+drift:-560*q;
 const opacity=enter?.76+.24*q:1-q;
 return <div style={{position:'absolute',right:110,bottom:158,zIndex:6,width:500,padding:10,background:'rgba(255,253,248,.94)',boxShadow:'0 18px 40px rgba(24,55,70,.18)',opacity,transform:`translate3d(${x}px,0,0) rotate(1deg)`}}>
  <Img src={staticFile(spec.src)} alt={spec.title} style={{display:'block',width:'100%',height:270,objectFit:'cover',objectPosition:'top center'}}/>
  <div style={{fontSize:29,fontWeight:700,color:ink,marginTop:10,lineHeight:1.2}}>{spec.title}</div>
 </div>;
}
function Evidence({state}:{state:NobelState}){
 const current=evidenceByScene[state.scene];
 const previous=state.previous?evidenceByScene[state.previous]:undefined;
 return <>{previous&&<EvidenceCard spec={previous} state={state} enter={false}/>} {current&&<EvidenceCard spec={current} state={state} enter={true}/>}</>;
}
function Callout({state}:{state:NobelState}){
 const intro=smooth(clamp((state.elapsed??0)/.72));
 const cfg:Record<string,{head:string;color:string}>={
  context:{head:'相关 → 因果',color:cyan},
  algae:{head:'先看行为，再追电流',color:cyan},
  channel:{head:'蓝光 → 通道 → 离子流',color:gold},
  neuron:{head:'光脉冲 → 动作电位',color:cyan},
  brain:{head:'细光纤进入活体脑',color:gold},
  impact:{head:'研究工具 · 临床仍在探索',color:gold}
 };
 const x=cfg[state.scene],old=state.previous?cfg[state.previous]:undefined;
 if(!x&&!old)return null;
 const card=(item:{head:string;color:string},style:React.CSSProperties)=><div style={{position:'absolute',left:110,bottom:180,zIndex:7,maxWidth:680,padding:'17px 23px',background:'rgba(255,253,248,.88)',borderLeft:`5px solid ${item.color}`,boxShadow:'0 12px 25px rgba(24,55,70,.09)',color:item.color,fontSize:36,fontWeight:700,letterSpacing:.3,...style}}>{item.head}</div>;
 return <>{old&&old!==x&&card(old,{transform:`translate3d(${-760*intro}px,0,0)`,opacity:1-intro})}{x&&card(x,{transform:`translate3d(${760*(1-intro)}px,0,0)`,opacity:intro})}</>;
}
function MechanismLegend({state}:{state:NobelState}){
 const intro=smooth(clamp((state.elapsed??0)/.6));
 const motion={transform:`translate3d(${38*(1-intro)}px,0,0)`,opacity:intro};
 if(state.scene==='channel')return <div style={{position:'absolute',left:760,top:650,zIndex:7,display:'flex',alignItems:'center',gap:12,padding:'11px 18px',borderRadius:999,background:'rgba(255,253,248,.86)',boxShadow:'0 10px 22px rgba(24,55,70,.10)',color:ink,fontSize:29,fontWeight:700,...motion}}><span style={{color:cyan}}>细胞外</span><span style={{color:gold}}>→</span><span style={{color:cyan}}>细胞内</span></div>;
 if(state.scene==='neuron')return <div style={{position:'absolute',left:780,top:770,zIndex:7,display:'flex',gap:16,alignItems:'center',padding:'10px 17px',borderRadius:999,background:'rgba(255,253,248,.88)',boxShadow:'0 10px 22px rgba(24,55,70,.10)',fontSize:27,fontWeight:700,color:ink,...motion}}><span style={{color:cyan}}>蓝光</span><span style={{color:gold}}>电信号</span><span style={{color:'#648a9b'}}>对照</span></div>;
 if(state.scene==='brain')return <div style={{position:'absolute',left:840,top:690,zIndex:7,padding:'10px 17px',borderRadius:999,background:'rgba(255,253,248,.84)',boxShadow:'0 10px 22px rgba(24,55,70,.10)',fontSize:29,fontWeight:700,color:cyan,...motion}}>光纤定位</div>;
 return null;
}
function References({state}:{state:NobelState}){
 const entrance=smooth(clamp((state.elapsed??0)/1.25));
 const evidenceEntrance=smooth(clamp(((state.elapsed??0)-.75)/.9));
 return <AbsoluteFill style={{background:'#f4f0e5',fontFamily:'"Microsoft YaHei",sans-serif',color:ink,overflow:'hidden'}}>
  <Stage state={state}/>
  <AbsoluteFill style={{background:`rgba(231,238,240,${.91*entrance})`,pointerEvents:'none'}}/>
  <Brand/><SceneTitle state={state}/><Callout state={state}/>
  <div style={{position:'absolute',left:110,top:315,zIndex:5,display:'flex',gap:26,alignItems:'flex-start',opacity:.8+.2*entrance,transform:`translate3d(${1810*(1-entrance)}px,0,0)`}}>
   <Paper src="nobel2026/POP_Fig_3_ENG_01.jpg" title="基因进入蛙卵 · 光控通道" meta="NobelPrize.org Popular Information · 2026" rotate={-2}/>
   <Paper src="nobel2026/POP_Fig_4_ENG_01.jpg" title="透明容器神经元 · 2005" meta="Boyden et al. · Nature Neuroscience" rotate={1.2}/>
   <Paper src="nobel2026/POP_Fig_5_ENG_01.jpg" title="活体小鼠 · 2007" meta="Aravanis et al. · Journal of Neural Engineering" rotate={-1}/>
  </div>
  <div style={{position:'absolute',right:118,top:330,zIndex:7,width:430,opacity:.8+.2*evidenceEntrance,transform:`translate3d(${620*(1-evidenceEntrance)}px,0,0)`}}>
   <div style={{fontSize:21,color:cyan,letterSpacing:1}}>MECHANISM / EVIDENCE</div>
   <div style={{marginTop:10,padding:'20px 24px',background:'rgba(255,253,248,.94)',boxShadow:'0 18px 35px rgba(24,55,70,.13)',fontSize:30,lineHeight:1.42,fontWeight:680}}>蓝光<br/>↓<br/>光控阳离子通道<br/>↓<br/>膜电位改变<br/>↓<br/>神经信号与行为</div>
  </div>
  <div style={{position:'absolute',left:110,right:110,bottom:70,zIndex:8,display:'flex',justifyContent:'space-between',gap:30,alignItems:'flex-end',opacity:entrance,transform:`translate3d(0,${40*(1-entrance)}px,0)`}}>
   <div style={{fontSize:24,color:muted,lineHeight:1.4}}>关键论文：Nagel 2003 · Boyden 2005 · Aravanis 2007<br/>可视化：Three.js · Remotion</div>
   <div style={{fontSize:24,color:muted,textAlign:'right'}}>官方插图：NobelPrize.org<br/>Mattias Karlén</div>
  </div>
 </AbsoluteFill>;
}
function Paper({src,title,meta,rotate}:{src:string;title:string;meta:string;rotate:number}){return <div style={{width:330,transform:`rotate(${rotate}deg)`}}><div style={{padding:11,background:paper,boxShadow:'0 20px 42px rgba(24,55,70,.18)'}}><Img src={staticFile(src)} style={{display:'block',width:'100%',height:235,objectFit:'cover',objectPosition:'top center'}}/></div><div style={{marginTop:12,paddingLeft:4,color:ink}}><div style={{fontSize:26,fontWeight:700,lineHeight:1.18}}>{title}</div><div style={{fontSize:22,color:muted,lineHeight:1.25,marginTop:6}}>{meta}</div></div></div>;}
export function NobelFilmV4({audio=true}:{audio?:boolean}){const frame=useCurrentFrame(),state=stateAt(frame),cap=clips.find((c:any)=>frame>=c.start&&frame<c.end);if(state.scene==='references')return <><References state={state}/>{audio&&<Audio src={staticFile('nobel2026/audio-v4/master.wav')}/>}</>;return <AbsoluteFill style={{background:'#f4f0e5',fontFamily:'"Microsoft YaHei",sans-serif',overflow:'hidden'}}><Stage state={state}/><AbsoluteFill style={{background:'linear-gradient(90deg,rgba(244,240,229,.72) 0%,rgba(244,240,229,.24) 39%,rgba(244,240,229,0) 76%)',pointerEvents:'none'}}/><Brand/><SceneTitle state={state}/><Scientists state={state}/><EvidenceFigureV4 state={state}/><MechanismLegend state={state}/><Callout state={state}/>{cap&&<Caption clip={cap} text={cap.subtitle} progress={state.lineProgress}/>} {audio&&<Audio src={staticFile('nobel2026/audio-v4/master.wav')}/>}</AbsoluteFill>;}


