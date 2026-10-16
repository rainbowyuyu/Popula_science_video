import React,{useEffect,useLayoutEffect,useState,useRef,useCallback} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {World} from './World';
import {C,State,Timeline,stateAt,smooth,ramp,pulse} from './visual';
import tlData from './timeline.json';
const tl=tlData as Timeline;
type Mark={text:string;x:number;y:number;tx:number;ty:number;color:string;side:string};
const TITLES:Record<string,[string,string]>={hook:['每天5分钟科普 · 上海中心','632米，\n怎样站稳？'],foundation:['从地下开始','先把根，\n扎进大地'],core:['顺着楼往上走','一根坚实的脊梁'],frame:['接上另一圈骨架','一起扛住风'],skin:['外墙与内墙之间','把城市叠起来'],wind:['越往高处，风越重要','转一个角度\n与风相处'],damper:['来到塔顶','让晃动\n慢慢停下来'],assembly:['从图纸，到天空','一层层，\n长向云端'],return:['再看一眼上海中心','每一层，\n都有来处']};
function Stage({frame,onMarks}:{frame:number;onMarks:(x:Mark[])=>void}){
 const {scene,camera,gl}=useThree();const w=useRef<World|null>(null),f=useRef(frame);f.current=frame;const [ready,setReady]=useState(false);const [h]=useState(()=>delayRender('Shanghai Tower semantic geometry',{timeoutInMilliseconds:120000}));
 const render=useCallback((frame:number)=>{const world=w.current;if(!world)return;const s=stateAt(frame,tl);world.update(s);const labels:Mark[]=[];
  for(const l of world.labels(s)){const p=l.point.clone().project(camera);const x=(p.x+1)*960,y=(1-p.y)*540;if(p.z<0||p.z>1||x<350||x>1790||y<220||y>880)continue;const side=l.side??'right';let tx=side==='right'?Math.min(1575,x+160):Math.max(620,x-150);let ty=Math.max(330,Math.min(820,y-45));for(const a of labels)if(Math.abs(a.ty-ty)<95)ty+=110;labels.push({text:l.text,x,y,tx,ty,color:l.color??C.teal,side});}onMarks(labels);gl.render(scene,camera);
 },[scene,camera,gl,onMarks]);
 useLayoutEffect(()=>{let alive=true;const world=new World(scene,camera as T.PerspectiveCamera,gl,staticFile(''),tl);w.current=world;world.ready.then(()=>{if(alive){render(f.current);setReady(true);continueRender(h)}}).catch(cancelRender);return()=>{alive=false;world.dispose();w.current=null;continueRender(h)}},[scene,camera,gl,h,render]);
 useLayoutEffect(()=>{if(ready)render(frame)},[frame,ready,render]);return null;
}
function Titles({s}:{s:State}){const sec=tl.sections.find(x=>x.id===s.section)??tl.sections[0];const e=(s.frame-sec.start)/30,d=(sec.end-sec.start)/30;const [k,h]=TITLES[s.section]??TITLES.return;
 const x=s.section==='hook'?0:-1000*(1-ramp(0,1.3,e));const exit=-1000*ramp(Math.min(6,d-2),Math.min(7.2,d-.6),e);
 return <div style={{position:'absolute',left:78,top:190,transform:`translateX(${x+exit}px)`,width:760}}><div style={{fontSize:35,fontWeight:500,color:C.muted,letterSpacing:2,marginBottom:22}}>{k}</div><div style={{fontFamily:'Rainbow Sans',fontSize:84,fontWeight:700,lineHeight:1.22,whiteSpace:'pre-line',letterSpacing:2}}>{h}</div></div>;
}
function Concept({s}:{s:State}){const u=s.n+s.u;let value='',note='',a=0,b=49;
 if(u>=6&&u<8){a=6;b=8;value='桩群 + 厚筏板';note='把重量送入深处'}
 if(u>=11&&u<13){a=11;b=13;value='核心筒';note='楼梯、电梯与结构骨架'}
 if(u>=13&&u<14){a=13;b=14;value='越往上，位移越明显';note='弯曲形态 · 夸大示意'}
 if(u>=16&&u<17){a=16;b=17;value='重量，接力向下';note='传力路径示意'}
 if(u>=19&&u<21){a=19;b=21;value='两侧一起工作';note='传力路径示意'}
 if(u>=25&&u<27){a=25;b=27;value='双层幕墙';note='九个竖向分区'}
 if(u>=30&&u<33){a=30;b=33;value='转过 120°';note='绕流与晃动 · 夸大示意'}
 if(u>=36&&u<38.8){a=36;b=38.8;value='跟随节奏，消耗能量';note='相对运动 · 放大示意'}
 if(u>=40.4&&u<44){a=40.4;b=44;value='核心筒 → 楼层 → 幕墙';note='施工先后关系示意'}
 if(!value)return null;const slide=-950*(1-ramp(a,a+.18,u))-950*ramp(b-.18,b,u);return <div style={{position:'absolute',left:78,top:690,maxWidth:610,color:C.ink,transform:`translateX(${slide}px)`}}><div style={{fontSize:value.length>12?43:57,fontWeight:650,lineHeight:1.35}}>{value}</div><div style={{fontSize:35,color:C.muted,marginTop:16}}>{note}</div></div>;
}
function Coda({frame}:{frame:number}){const start=tl.duration-270,t=(frame-start)/30;if(t<0)return null;const move=2000*(1-ramp(0,1.45,t));
 return <AbsoluteFill style={{transform:`translateX(${move}px)`,background:'linear-gradient(90deg,#f0f0e900,#f0f0e9 24%,#f0f0e9)',color:C.ink}}>
  <div style={{position:'absolute',left:80,top:200,fontSize:74,fontWeight:650}}>从图纸，读懂高楼</div>
  <div style={{position:'absolute',left:82,top:335,width:770,lineHeight:1.8,fontSize:39}}><div style={{color:C.muted}}>公开工程资料 · 教学重建</div><div style={{fontSize:48,marginTop:34}}>核心筒 + 巨型框架</div><div style={{fontSize:48}}>伸臂桁架 + 带状桁架</div><div style={{fontSize:48}}>双层幕墙 + 调谐阻尼</div><div style={{fontSize:36,color:C.muted,marginTop:38}}>Blender 建模 · Three.js 动画</div></div>
  <div style={{position:'absolute',left:950,top:295,width:860,height:620}}>
   <Img src={staticFile('papers/source2.jpg')} style={{position:'absolute',left:380,top:0,width:330,height:465,objectFit:'cover',objectPosition:'top',transform:`rotate(4deg) translateY(${70*(1-ramp(.7,1.6,t))}px)`,boxShadow:'0 24px 40px #24435024'}}/>
   <Img src={staticFile('papers/source1.jpg')} style={{position:'absolute',left:0,top:38,width:390,height:552,objectFit:'cover',objectPosition:'top',transform:`rotate(-3deg) translateY(${50*(1-ramp(.3,1.3,t))}px)`,boxShadow:'0 24px 40px #24435026'}}/>
   <div style={{position:'absolute',left:410,top:505,fontSize:34,lineHeight:1.55,color:C.muted}}>建造技术</div>
   <div style={{position:'absolute',left:0,top:626,fontSize:34,lineHeight:1.55,color:C.muted}}>Shanghai Tower · 龚剑 · 2017</div>
  </div>
 </AbsoluteFill>;
}
export function Film({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){
 const frame=useCurrentFrame(),s=stateAt(frame,tl),[marks,setMarks]=useState<Mark[]>([]);const cb=useCallback((x:Mark[])=>setMarks(x),[]);const coda=frame>=tl.duration-270;
 const [h]=useState(()=>delayRender('Chinese brand fonts'));useEffect(()=>{Promise.all([new FontFace('Rainbow Sans',`url(${staticFile('fonts/sans.woff2')})`,{weight:'100 900'}).load(),new FontFace('Rainbow Serif',`url(${staticFile('fonts/serif.woff2')})`,{weight:'100 900'}).load()]).then(f=>{for(const x of f)document.fonts.add(x);continueRender(h)}).catch(cancelRender)},[h]);
 const cap=tl.captions.find(c=>frame>=c.start&&frame<c.end);
 return <AbsoluteFill style={{background:C.paper,color:C.ink,fontFamily:'Rainbow Sans,Microsoft YaHei,sans-serif',overflow:'hidden'}}>
  <ThreeCanvas width={1920} height={1080} dpr={1} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} camera={{fov:34,near:.008,far:200}}><Stage frame={frame} onMarks={cb}/></ThreeCanvas>
  {!clean&&<>
   {!coda&&<><Titles s={s}/><Concept s={s}/>{marks.map((l,i)=><React.Fragment key={i}><svg width={1920} height={1080} style={{position:'absolute',inset:0}}><path d={`M${l.x},${l.y} L${l.tx},${l.ty} L${l.tx+(l.side==='right'?80:-80)},${l.ty}`} fill="none" stroke={l.color} strokeWidth={2.3}/><circle cx={l.x} cy={l.y} r={5.5} fill={l.color}/></svg><div style={{position:'absolute',left:l.tx+(l.side==='right'?8:-8),top:l.ty-53,transform:l.side==='left'?'translateX(-100%)':undefined,fontSize:36,fontWeight:600,color:C.ink,whiteSpace:'nowrap',textShadow:'0 2px 8px #f0f0e9,0 0 5px #f0f0e9'}}>{l.text}</div></React.Fragment>)}</>}
   <Coda frame={frame}/>
   <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:30}}><Img src={staticFile('brand/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span style={{fontSize:44,fontWeight:600}}>rainbow鱼</span></div>
   {!coda&&cap&&<div style={{position:'absolute',left:90,right:90,bottom:40,textAlign:'center'}}><span style={{display:'inline-block',fontSize:47,fontWeight:500,lineHeight:1.45,padding:'11px 30px 14px',borderRadius:10,background:'#193b49ed',color:'#fbfaf5',boxShadow:'0 8px 22px #173d4714'}}>{cap.text}</span></div>}
  </>}
  {audio&&<Audio src={staticFile('master.wav')}/>}
 </AbsoluteFill>;
}
