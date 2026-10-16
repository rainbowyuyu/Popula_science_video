import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,delayRender,continueRender,cancelRender,useCurrentFrame} from 'remotion';
import timeline from './timeline-v11.json';
import {PhysicsWorldV11,stateAt,type State} from './WorldV11';
import {EvidenceFigureV11} from './EvidenceFigureV11';
import {BridgePlateV01, type BridgePlateId} from './BridgePlateV01';

const sans='"Nobel Sans", "Microsoft YaHei", sans-serif';
const serif='"Nobel Serif", "Noto Serif SC", serif';
const ink='#eaf2f2', muted='#9bb8bc', cyan='#5ed5ec', gold='#e7b866';
type Clip=typeof timeline.clips[number];
let fontsPromise:Promise<void>|undefined;
function useStableFonts(){
 const [handle]=useState(()=>delayRender('Load Nobel Physics editorial fonts'));
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  fontsPromise??=Promise.all([
   ['Nobel Sans','fonts/sans.woff2','400 700'],['Nobel Serif','fonts/serif.woff2','700'],
  ].map(async ([family,file,weight])=>{
   const face=new FontFace(family,`url(${staticFile(file)})`,{weight});
   await face.load(); document.fonts.add(face);
  })).then(()=>document.fonts.ready).then(()=>undefined);
  fontsPromise.then(()=>setReady(true)).catch((e)=>cancelRender(e));
 },[handle]);
 useLayoutEffect(()=>{if(ready)continueRender(handle);},[ready,handle]);
 return ready;
}
function Stage({state,opacity=1,background=false}:{state:State;opacity?:number;background?:boolean}){
 const ref=useRef<HTMLCanvasElement>(null),world=useRef<PhysicsWorldV11|null>(null);
 useLayoutEffect(()=>{if(!ref.current)return;world.current=new PhysicsWorldV11(ref.current);return()=>{world.current=null;};},[]);
 useLayoutEffect(()=>{if(background)world.current?.renderBackground(state);else world.current?.render(state);},[state,background]);
 return <canvas ref={ref} width={1920} height={1080} style={{position:'absolute',inset:0,width:1920,height:1080,opacity,zIndex:background?0:2}}/>;
}
const titles:Record<string,string>={
  hook:'一束蓝光，来自哪里？',award:'把看不见的来客变成证据',question:'为什么偏偏要找中微子？',messengers:'三种宇宙信使，三条不同的路',idea:'把南极冰变成一座望远镜',ice:'在两公里深的冰里排布传感器',interaction:'碰撞之后，蓝光才出现',formula:'一只光锥，给出速度的线索',track:'一条长径迹，指向来处',cascade:'一团亮斑，收住能量',background:'真正的难题：从背景里筛出信号',discovery:'从两次闪光，到 5.7σ 的证据链',sources:'中微子，成为新的宇宙信使',team:'一个人的方向，一支团队的观测站',meaning:'让宇宙拥有第二种叙述者',limits:'知道看见了什么，也知道还不能断言什么',coda:'一块南极冰，向宇宙倾听',
};
function Brand(){return <div style={{position:'absolute',left:100,top:44,zIndex:25,display:'flex',alignItems:'center',gap:13,height:58,fontFamily:sans,color:'#ffffff'}}><Img src={staticFile('brand/rainbow-white.svg')} style={{width:45,height:54,objectFit:'contain'}}/><span style={{fontSize:32,fontWeight:700,letterSpacing:.5}}>rainbow鱼</span></div>;}
function Header({state}:{state:State}){
 const clips=timeline.clips as Array<{id:string;scene:string}>;
 const idx=Math.max(0,clips.findIndex(c=>c.id===state.clipId));
 const title=titles[state.scene]??'2026 诺贝尔物理学奖';
 // Keep the chapter title present after the opening, but cross-fade it over
 // the first few frames of a new clip. The narration is continuous at these
 // boundaries; an instantaneous text replacement reads as a flash even when
 // the Canvas scene itself is blended.
 const opening=state.clipId==='000';
 const q=opening?Math.min(1,state.elapsed/.55):1;
 // A very short hand-off keeps the title readable. A long cross-fade makes
 // Chinese glyphs stack into a grey blur while the spoken sentence is still
 // clear; fading the old line first gives the eye a clean beat at the seam.
 const previousFade=opening?0:smooth(Math.min(1,state.elapsed/.16));
 const titleBlend=opening?1:smooth(Math.max(0,Math.min(1,(state.elapsed-.07)/.25)));
 const previous=idx>0?(titles[clips[idx-1].scene]??'2026 诺贝尔物理学奖'):undefined;
  return <div style={{position:'absolute',left:104,top:143,zIndex:15,color:ink,opacity:q,transform:`translateY(${opening?12*(1-q):0}px)`,fontFamily:serif,width:1650}}>
    <div style={{position:'relative',minHeight:78,fontSize:62,lineHeight:1.22,fontWeight:700,letterSpacing:1}}>
     {previous&&<div style={{position:'absolute',inset:0,opacity:1-previousFade,transform:`translateY(${-8*previousFade}px)`}}>{previous}</div>}
     <div style={{position:previous?'absolute':'relative',inset:previous?0:undefined,opacity:titleBlend,transform:`translateY(${8*(1-titleBlend)}px)`}}>{title}</div>
   </div>
    <div style={{fontFamily:sans,fontSize:27,lineHeight:1.5,color:cyan,marginTop:15}}>2026 诺贝尔物理学奖 · Francis Halzen 与 IceCube</div>
 </div>;
}
function smooth(v:number){v=Math.max(0,Math.min(1,v));return v*v*(3-2*v);}
/**
 * Wrap one already-timed caption without changing its audio clock.
 *
 * A fixed character count looked acceptable for Chinese-only captions but
 * split scientific names in the middle (`TXS 0506+056`, `IceCube`) and made
 * the second line visibly shorter.  Use a deterministic visual-width budget:
 * CJK glyphs occupy one unit, Latin/digits about half a unit and spaces less.
 * Break at punctuation/space whenever possible, then fall back to a glyph
 * boundary.  This keeps a caption to at most two calm lines while preserving
 * the exact subtitle start/end times from the measured TTS.
 */
function glyphWidth(ch:string){
 if(ch===' ')return .32;
 if(/[A-Za-z0-9]/.test(ch))return .56;
 if(/[.,!?;:'"()+\-\/]/.test(ch))return .48;
 if(/[，。！？；：、]/.test(ch))return .72;
 return 1;
}
function wrap(text:string,max=24){
 const value=text.trim();
 if(!value)return [];
 const lines:string[]=[];let rest=value;
 while(rest.length){
   let width=0,lastBreak=-1,lastBoundary=-1;
   for(let i=0;i<rest.length;i++){
     const ch=rest[i];
     width+=glyphWidth(ch);
     if(/[，。！？；：、]/.test(ch))lastBoundary=i+1;
     if(/\s/.test(ch))lastBreak=i+1;
     if(width>max){
       // Prefer a boundary only after the line has acquired enough content;
       // otherwise a leading year or unit would become a one-word line.
       const cut=lastBoundary>=Math.floor(i*.48)
         ?lastBoundary
         :(lastBreak>=Math.floor(i*.48)?lastBreak:i);
       lines.push(rest.slice(0,Math.max(1,cut)).trim());
       rest=rest.slice(Math.max(1,cut)).trimStart();
       break;
     }
     if(i===rest.length-1){lines.push(rest.trim());rest='';}
   }
 }
 return lines;
}
function Caption({clip,state}:{clip:Clip;state:State}){
 const elapsed=state.elapsed;
 const ps=clip.subtitleParts as Array<{start:number;end:number;text:string}>;
 const i=ps.findIndex((p,index)=>elapsed>=p.start && elapsed<Math.min(p.end+.06,ps[index+1]?.start??Infinity));
 const p=i>=0?ps[i]:undefined;
 if(!p)return null;
 const lines=wrap(p.text,28);
 const local=elapsed-p.start,span=Math.max(.1,p.end-p.start);
 const alpha=Math.min(1,Math.max(0,local/.12))*Math.min(1,Math.max(0,(span-local)/.12));
 const fontSize=lines.length>=4?31:35;
 return <div style={{position:'absolute',left:110,right:110,bottom:58,zIndex:30,display:'flex',justifyContent:'center',opacity:alpha,fontFamily:sans}}><div style={{maxWidth:1650,textAlign:'center',padding:'16px 30px 18px',borderRadius:15,background:'rgba(3,17,26,.80)',border:'1px solid rgba(155,184,188,.18)',boxShadow:'0 9px 28px rgba(0,0,0,.25)'}}>{lines.map((line,j)=><div key={j} style={{fontSize,lineHeight:1.35,fontWeight:540,color:ink,whiteSpace:'nowrap'}}>{line}</div>)}</div></div>;
}
function FormulaOverlay({state}:{state:State}){
 const show=state.clipId==='007';
 if(!show)return null;
 const q=smooth((state.elapsed-7.321)/.7);
 // The subtitle sits beneath the editorial title at roughly y=245.  Keeping
 // the equation below it gives the formula its own readable beat and leaves
 // a clean 15 px gap before the right-side evidence window at y=380.
 return <Img src={staticFile('formulas/cherenkov-threshold.svg')} style={{position:'absolute',left:1250,top:420,width:320,height:130,objectFit:'contain',zIndex:14,opacity:q,filter:'drop-shadow(0 7px 16px rgba(0,0,0,.28))'}}/>;
}
function Source({state}:{state:State}){const visible=['004','005','006','007','008','009','011','012','016'].includes(state.clipId);if(!visible)return null;const o=1-Math.max(0,Math.min(1,(state.elapsed-7)/.8));return <div style={{position:'absolute',right:96,top:96,zIndex:20,maxWidth:540,textAlign:'right',fontFamily:sans,fontSize:16,lineHeight:1.25,color:muted,opacity:o}}>来源：NobelPrize.org · IceCube 官方资料</div>;}

/** Four 5-second Qwen/Wan atmosphere plates centred on real scene seams. */
const BRIDGE_WINDOWS:Array<{id:BridgePlateId;start:number;end:number}>= [
 // Windows are tied to the natural-speed V04/V05 timeline. Every bridge is
 // exactly five seconds (150 frames) and begins at a real editorial seam.
 {id:'bridge-01-cosmic-arrival',start:381,end:531},
 {id:'bridge-02-ice-descent',start:1588,end:1738},
 {id:'bridge-04-source-return',start:5135,end:5285},
 {id:'bridge-05-night-coda',start:7033,end:7183},
];
function Bridges({frame}:{frame:number}){return <>{BRIDGE_WINDOWS.map((bridge)=><BridgePlateV01 key={bridge.id} {...bridge} frame={frame} zIndex={1} maxOpacity={0.18}/>)}</>;}
export function PhysicsFilmV11({audio=true}:{audio?:boolean}){const ready=useStableFonts();const frame=useCurrentFrame();const state=stateAt(frame);const current=(timeline.clips.find(c=>frame>=c.start&&frame<c.end)??timeline.clips.slice().reverse().find(c=>c.start<=frame)) as Clip|undefined;return <AbsoluteFill style={{background:'#071823',overflow:'hidden',fontFamily:sans}}>{ready&&<Stage state={state} background/>}<Bridges frame={frame}/>{ready&&<Stage state={state}/>}<div style={{position:'absolute',left:100,right:100,top:122,height:1,background:'linear-gradient(90deg,rgba(234,242,242,.22),rgba(234,242,242,.03))',zIndex:9,pointerEvents:'none'}}/><div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(2,12,20,.18),rgba(2,12,20,0) 74%)',zIndex:3,pointerEvents:'none'}}/><Brand/><Header state={state}/><FormulaOverlay state={state}/><EvidenceFigureV11 state={state}/><Source state={state}/>{current&&<Caption clip={current} state={state}/>}<div style={{position:'absolute',right:100,top:53,zIndex:20,color:gold,fontFamily:sans,fontSize:17,letterSpacing:1}}>PHYSICS · 2026</div>{audio&&<Audio src={staticFile('audio-v07/master.wav')}/>}</AbsoluteFill>;}






