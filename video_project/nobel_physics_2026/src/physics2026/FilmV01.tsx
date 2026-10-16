import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,delayRender,continueRender,cancelRender,useCurrentFrame} from 'remotion';
import timeline from './timeline-v01.json';
import {PhysicsWorldV01,stateAt,type State} from './WorldV01';
import {EvidenceFigureV01} from './EvidenceFigureV01';

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
function Stage({state,opacity=1}:{state:State;opacity?:number}){
 const ref=useRef<HTMLCanvasElement>(null),world=useRef<PhysicsWorldV01|null>(null);
 useLayoutEffect(()=>{if(!ref.current)return;world.current=new PhysicsWorldV01(ref.current);return()=>{world.current=null;};},[]);
 useLayoutEffect(()=>{world.current?.render(state);},[state]);
 return <canvas ref={ref} width={1920} height={1080} style={{position:'absolute',inset:0,width:1920,height:1080,opacity}}/>;
}
const titles:Record<string,string>={
  hook:'一束蓝光，来自哪里？',award:'把看不见的来客变成证据',question:'为什么偏偏要找中微子？',messengers:'三种宇宙信使，三条不同的路',idea:'把南极冰变成一座望远镜',ice:'在两公里深的冰里排布传感器',interaction:'中微子不会发光，冰会',formula:'一只光锥，给出速度的线索',track:'一条长径迹，指向来处',cascade:'一团亮斑，收住能量',background:'真正的难题：从背景里筛出信号',discovery:'从两次闪光，到 5.7σ 的证据链',sources:'中微子，成为新的宇宙信使',team:'一个人的方向，一支团队的观测站',meaning:'让宇宙拥有第二种叙述者',limits:'知道看见了什么，也知道还不能断言什么',coda:'一块南极冰，向宇宙倾听',
};
function Brand(){return <div style={{position:'absolute',left:92,top:44,zIndex:25,display:'flex',alignItems:'center',gap:12,fontFamily:sans,color:ink}}><Img src={staticFile('logo.png')} style={{width:48,height:48,objectFit:'contain'}}/><span style={{fontSize:31,fontWeight:700,letterSpacing:.5}}>rainbow鱼</span></div>;}
function Header({state}:{state:State}){const title=titles[state.scene]??'2026 诺贝尔物理学奖';const q=Math.min(1,state.elapsed/.55);return <div style={{position:'absolute',left:95,top:120,zIndex:15,color:ink,opacity:q,transform:`translateY(${12*(1-q)}px)`,fontFamily:serif}}><div style={{fontSize:59,fontWeight:700,letterSpacing:.5}}>{title}</div><div style={{fontFamily:sans,fontSize:23,color:cyan,marginTop:10}}>2026 诺贝尔物理学奖 · Francis Halzen 与 IceCube</div></div>;}
function wrap(text:string,max=30){const parts=text.split(/(?<=[，。！？；：])/u);const lines:string[]=[];let line='';for(const p of parts){if((line+p).length>max&&line){lines.push(line);line=p;}else line+=p;}if(line)lines.push(line);return lines.slice(0,3);}
function Caption({clip,state}:{clip:Clip;state:State}){
 const elapsed=state.elapsed;
 const ps=clip.subtitleParts as Array<{start:number;end:number;text:string}>;
 const i=ps.findIndex((p,index)=>elapsed>=p.start && elapsed<Math.min(p.end+.06,ps[index+1]?.start??Infinity));
 const p=i>=0?ps[i]:undefined;
 if(!p)return null;
 const lines=wrap(p.text,30);
 const local=elapsed-p.start,span=Math.max(.1,p.end-p.start);
 const alpha=Math.min(1,Math.max(0,local/.12))*Math.min(1,Math.max(0,(span-local)/.12));
 return <div style={{position:'absolute',left:110,right:110,bottom:58,zIndex:30,display:'flex',justifyContent:'center',opacity:alpha,fontFamily:sans}}><div style={{maxWidth:1650,textAlign:'center',padding:'16px 30px 18px',borderRadius:15,background:'rgba(3,17,26,.80)',border:'1px solid rgba(155,184,188,.18)',boxShadow:'0 9px 28px rgba(0,0,0,.25)'}}>{lines.map((line,j)=><div key={j} style={{fontSize:35,lineHeight:1.35,fontWeight:540,color:ink,whiteSpace:'nowrap'}}>{line}</div>)}</div></div>;
}
function Source({state}:{state:State}){const visible=['004','005','006','007','008','009','011','012','016'].includes(state.clipId);if(!visible)return null;const o=1-Math.max(0,Math.min(1,(state.elapsed-7)/.8));return <div style={{position:'absolute',right:96,top:855,zIndex:20,fontFamily:sans,fontSize:16,color:muted,opacity:o}}>来源：NobelPrize.org · IceCube 官方资料</div>;}
export function PhysicsFilmV01({audio=true}:{audio?:boolean}){const ready=useStableFonts();const frame=useCurrentFrame();const state=stateAt(frame);const current=timeline.clips.find(c=>frame>=c.start&&frame<c.end) as Clip|undefined;return <AbsoluteFill style={{background:'#071823',overflow:'hidden',fontFamily:sans}}>{ready&&<Stage state={state}/>}<div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(2,12,20,.18),rgba(2,12,20,0) 74%)',zIndex:2,pointerEvents:'none'}}/><Brand/><Header state={state}/><EvidenceFigureV01 state={state}/><Source state={state}/>{current&&<Caption clip={current} state={state}/>}<div style={{position:'absolute',right:94,top:53,zIndex:20,color:gold,fontFamily:sans,fontSize:17,letterSpacing:1}}>PHYSICS · 2026</div>{audio&&<Audio src={staticFile('audio-v01/master.wav')}/>}</AbsoluteFill>;}
