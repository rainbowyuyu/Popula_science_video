import React,{useEffect,useLayoutEffect,useState,useRef,useCallback} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {World} from './World';
import {C,State,Timeline,stateAt,smooth,ramp,pulse} from './visual';
import {WIND_MAGNIFICATION,STRESS_COLOR_POWER} from './PhysicsPlayback';
import tlData from './timeline.json';
const tl=tlData as Timeline;
type Mark={text:string;x:number;y:number;tx:number;ty:number;color:string;side:string};
const TITLES:Record<string,[string,string]>={hook:['每天5分钟科普','上海中心'],foundation:['桩筏基础','把力交给大地'],core:['核心筒','九格，连成整体'],frame:['巨柱与伸臂','一起抵住风'],skin:['双层幕墙','把街区叠起来'],wind:['风与外形','让风错开节奏'],damper:['调谐质量阻尼器','牵住晃动'],assembly:['分步建造','一层层向上'],return:['上海中心','一路相连的力']};
// Sample the same nonlinear color transfer used by PhysicsPlayback. Tick values
// stay in the fixed physical range; only color contrast is enhanced.
const STRESS_GRADIENT=`linear-gradient(90deg,${Array.from({length:41},(_,i)=>{
 const value=1-i/20,amount=Math.pow(Math.abs(value),STRESS_COLOR_POWER);
 const color=new T.Color('#c6ccce').lerp(new T.Color(value>=0?'#087d9b':'#dd4e2b'),amount);
 return `${color.getStyle()} ${i*2.5}%`;
}).join(',')})`;
const CORE_STRESS_GRADIENT=`linear-gradient(90deg,${Array.from({length:21},(_,i)=>{
 const color=new T.Color('#dae2df').lerp(new T.Color('#df7949'),i/20);
 return `${color.getStyle()} ${i*5}%`;
}).join(',')})`;
function Stage({frame,onMarks,onRange}:{frame:number;onMarks:(x:Mark[])=>void;onRange:(n:number)=>void}){
 const {scene,camera,gl}=useThree();const w=useRef<World|null>(null),f=useRef(frame);f.current=frame;const [ready,setReady]=useState(false);const [h]=useState(()=>delayRender('Shanghai Tower semantic geometry',{timeoutInMilliseconds:120000}));
 const render=useCallback((frame:number)=>{const world=w.current;if(!world)return;const s=stateAt(frame,tl);world.update(s);onRange(world.physics?.stressLimit??0);const labels:Mark[]=[];
  for(const l of world.labels(s)){const p=l.point.clone().project(camera);const x=(p.x+1)*960,y=(1-p.y)*540;if(p.z<0||p.z>1||x<350||x>1790||y<220||y>880)continue;const width=[...l.text].reduce((a,c)=>a+(c.charCodeAt(0)<128?23:38),0);let side=l.side??'right';if(side==='right'&&x+145+width>1810)side='left';if(side==='left'&&x-145-width<660)side='right';let tx=side==='right'?Math.min(1800-width,x+145):Math.max(670+width,x-145);let ty=Math.max(330,Math.min(820,y-45));for(const a of labels)if(Math.abs(a.ty-ty)<100&&Math.abs(a.tx-tx)<width+130)ty=ty+110<840?ty+110:ty-110;labels.push({text:l.text,x,y,tx,ty,color:l.color??C.teal,side});}onMarks(labels);gl.render(scene,camera);
 },[scene,camera,gl,onMarks,onRange]);
 useLayoutEffect(()=>{let alive=true;const world=new World(scene,camera as T.PerspectiveCamera,gl,staticFile(''),tl);w.current=world;world.ready.then(()=>{if(alive){render(f.current);setReady(true);continueRender(h)}}).catch(cancelRender);return()=>{alive=false;world.dispose();w.current=null;continueRender(h)}},[scene,camera,gl,h,render]);
 useLayoutEffect(()=>{if(ready)render(frame)},[frame,ready,render]);return null;
}
function Titles({s}:{s:State}){const sec=tl.sections.find(x=>x.id===s.section)??tl.sections[0];const e=(s.frame-sec.start)/30,d=(sec.end-sec.start)/30;const [k,h]=TITLES[s.section]??TITLES.return;
 const x=s.section==='hook'?0:-1000*(1-ramp(0,1.3,e));const exit=-1000*ramp(Math.min(6,d-2),Math.min(7.2,d-.6),e);
 return <div style={{position:'absolute',left:80,top:190,transform:`translateX(${x+exit}px)`,width:760}}><div style={{fontSize:36,fontWeight:500,color:C.muted,letterSpacing:1.4,marginBottom:20}}>{k}</div><div style={{fontFamily:'Rainbow Sans',fontSize:84,fontWeight:700,lineHeight:1.22,whiteSpace:'pre-line',letterSpacing:1}}>{h}</div></div>;
}
function Concept({s}:{s:State}){const u=s.n+s.u;let value='',note='',a=0,b=49;
 if(u>=5.6&&u<9){a=5.6;b=9;value='荷载 ↓  反力 ↑';note='桩侧 + 桩端 · 沉降 ×80'}
 if(u>=11&&u<13){a=11;b=13;value='九格，连成整体';note='内墙与外墙共同受力'}
 if(u>=13&&u<14){a=13;b=14;value='越高，位移越明显';note=`计算位移 ×${WIND_MAGNIFICATION}`}
 if(u>=16&&u<17){a=16;b=17;value='重量，接力向下';note='重力荷载 · 轴向应力'}
 if(u>=19&&u<21){a=19;b=21;value='两侧一起工作';note=`风致应力增量 · 变形 ×${WIND_MAGNIFICATION}`}
 if(u>=25&&u<27){a=25;b=27;value='双层幕墙';note='九个竖向分区'}
 if(u>=29&&u<31.8){a=29;b=31.8;value='转过 120°';note='绕流示意'}
 if(u>=31.8&&u<32.98){a=31.8;b=32.98;value='计算位移';note=`参考轮廓 · 位移 ×${WIND_MAGNIFICATION}`}
 if(u>=32.98&&u<33.95){a=32.98;b=33.95;value='两侧柱，接住风';note=`轴向应力增量 · 位移 ×${WIND_MAGNIFICATION}`}
 if(u>=35&&u<38.8){a=35;b=38.8;value='楼顶的配重';note='125层 · 实际相对摆动'}
 if(u>=41.2&&u<44){a=41.2;b=44;value='一层层，接力向上';note='核心筒 → 楼面 → 幕墙'}
 if(!value)return null;const slide=-950*(1-ramp(a,a+.18,u))-950*ramp(b-.18,b,u);return <div style={{position:'absolute',left:80,top:740,width:630,color:C.ink,transform:`translateX(${slide}px)`}}><div style={{fontSize:56,fontWeight:650,lineHeight:1.3}}>{value}</div><div style={{fontSize:38,color:C.muted,lineHeight:1.4,marginTop:16}}>{note}</div></div>;
}
function StressLegend({s,range}:{s:State;range:number}){
 const u=s.n+s.u;
 const scales=[
  {id:'core',core:true,show:pulse(31.8,32.05,32.88,32.98,u)},
  {id:'columns',core:false,show:Math.max(pulse(18.9,19.15,20.75,21,u),pulse(32.98,33.08,33.75,33.95,u))},
 ];
 if(range<=0)return null;
 // Both scales are fixed across frames. Signed axial increments belong to the
 // megacolumn view; the core view shows a nonnegative section stress bound.
 // Each label retains its own identity while travelling completely offscreen.
 // The new scale enters only after the prior scale has left the picture.
 return <>{scales.filter(x=>x.show>=.001).map(({id,core,show})=><div key={id} style={{position:'absolute',left:80,top:445,width:460,transform:`translateX(${-680*(1-Math.min(1,show))}px)`}}>
  <div style={{fontSize:38,fontWeight:600,marginBottom:22}}>{core?'核心筒弯曲应力':'巨柱轴向应力增量'}</div>
  <div style={{height:16,borderRadius:8,background:core?CORE_STRESS_GRADIENT:STRESS_GRADIENT}}/>
  {core?<>
   <div style={{display:'flex',justifyContent:'space-between',fontSize:38,fontWeight:600,marginTop:15,fontVariantNumeric:'tabular-nums'}}><span>0</span><span>6</span></div>
   <div style={{fontSize:36,color:C.muted,marginTop:17}}>截面上界 · MPa</div>
  </>:<>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',fontSize:38,fontWeight:600,marginTop:15,fontVariantNumeric:'tabular-nums'}}><span>+6</span><span style={{textAlign:'center'}}>0</span><span style={{textAlign:'right'}}>−6</span></div>
   <div style={{display:'flex',justifyContent:'space-between',fontSize:38,marginTop:9,color:C.muted}}><span>拉向</span><span>压向</span></div>
   <div style={{fontSize:36,color:C.muted,marginTop:17}}>MPa · 色彩增强</div>
  </>}
 </div>)}</>;
}
function Coda({frame}:{frame:number}){const start=tl.duration-270,t=(frame-start)/30;if(t<0)return null;const move=2000*(1-ramp(0,1.45,t));
 return <AbsoluteFill style={{transform:`translateX(${move}px)`,background:`linear-gradient(90deg,${C.paper}00,${C.paper} 54px,${C.paper})`,color:C.ink}}>
  <div style={{position:'absolute',left:80,top:200,fontSize:74,fontWeight:650}}>从图纸，读懂高楼</div>
  <div style={{position:'absolute',left:82,top:312,width:770,fontSize:38,color:C.muted}}>结构传力与动力响应</div>
  <div style={{position:'absolute',left:82,top:396,fontSize:38,fontWeight:600}}>结构动力响应</div>
  <Img src={staticFile('physics/dynamic.svg')} style={{position:'absolute',left:80,top:452,width:740,height:100,objectFit:'contain',objectPosition:'left'}}/>
  <div style={{position:'absolute',left:82,top:590,fontSize:38,fontWeight:600}}>轴向应力增量</div>
  <Img src={staticFile('physics/axial.svg')} style={{position:'absolute',left:80,top:650,width:535,height:110,objectFit:'contain',objectPosition:'left'}}/>
  <div style={{position:'absolute',left:82,top:832,fontSize:36,fontWeight:500,color:C.muted}}>工作流愿景</div>
  <div style={{position:'absolute',left:82,top:914,right:80,fontSize:42,fontWeight:600,whiteSpace:'nowrap',color:C.ink}}>Zwind + Diffusion + Iwind → AI engineer</div>
  <div style={{position:'absolute',left:1030,top:280,width:770,height:580}}>
   <Img src={staticFile('papers/structural-system.jpg')} style={{position:'absolute',left:330,top:0,width:325,height:460,objectFit:'cover',objectPosition:'top',transform:`rotate(4deg) translateY(${70*(1-ramp(.7,1.6,t))}px)`,boxShadow:`0 24px 40px ${C.ink}24`}}/>
   <Img src={staticFile('papers/structural-title.jpg')} style={{position:'absolute',left:0,top:38,width:365,height:516,objectFit:'cover',objectPosition:'top',transform:`rotate(-3deg) translateY(${50*(1-ramp(.3,1.3,t))}px)`,boxShadow:`0 24px 40px ${C.ink}26`}}/>
   <div style={{position:'absolute',left:390,top:493,fontSize:36,lineHeight:1.4,color:C.muted}}>结构体系原图</div>
   <div style={{position:'absolute',left:0,top:572,fontSize:36,lineHeight:1.4,color:C.muted}}>结构监测研究 · Su 等 · 2013</div>
  </div>
 </AbsoluteFill>;
}
export function Film({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){
 const frame=useCurrentFrame(),s=stateAt(frame,tl),[marks,setMarks]=useState<Mark[]>([]),[range,setRange]=useState(0);const cb=useCallback((x:Mark[])=>setMarks(x),[]),onRange=useCallback((n:number)=>setRange(n),[]);const coda=frame>=tl.duration-270;
 const [h]=useState(()=>delayRender('Chinese brand fonts'));useEffect(()=>{Promise.all([new FontFace('Rainbow Sans',`url(${staticFile('fonts/sans.woff2')})`,{weight:'100 900'}).load(),new FontFace('Rainbow Serif',`url(${staticFile('fonts/serif.woff2')})`,{weight:'100 900'}).load()]).then(f=>{for(const x of f)document.fonts.add(x);continueRender(h)}).catch(cancelRender)},[h]);
 const cap=tl.captions.find(c=>frame>=c.start&&frame<c.end);
 return <AbsoluteFill style={{background:C.paper,color:C.ink,fontFamily:'Rainbow Sans,Microsoft YaHei,sans-serif',overflow:'hidden'}}>
  <ThreeCanvas width={1920} height={1080} dpr={1} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} camera={{fov:34,near:.008,far:200}}><Stage frame={frame} onMarks={cb} onRange={onRange}/></ThreeCanvas>
  {!clean&&<>
   {!coda&&<><Titles s={s}/><Concept s={s}/><StressLegend s={s} range={range}/>{marks.map((l,i)=><React.Fragment key={i}><svg width={1920} height={1080} style={{position:'absolute',inset:0}}><path d={`M${l.x},${l.y} L${l.tx},${l.ty} L${l.tx+(l.side==='right'?80:-80)},${l.ty}`} fill="none" stroke={l.color} strokeWidth={2.3}/><circle cx={l.x} cy={l.y} r={5.5} fill={l.color}/></svg><div style={{position:'absolute',left:l.tx+(l.side==='right'?8:-8),top:l.ty-55,transform:l.side==='left'?'translateX(-100%)':undefined,fontSize:38,fontWeight:600,color:C.ink,whiteSpace:'nowrap',textShadow:`0 2px 8px ${C.paper},0 0 5px ${C.paper}`}}>{l.text}</div></React.Fragment>)}</>}
   <Coda frame={frame}/>
   <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:30}}><Img src={staticFile('brand/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span style={{fontSize:44,fontWeight:600}}>rainbow鱼</span></div>
   {!coda&&cap&&<div style={{position:'absolute',left:90,right:90,bottom:40,textAlign:'center'}}><span style={{display:'inline-block',fontSize:48,fontWeight:500,lineHeight:1.45,padding:'11px 30px 14px',borderRadius:10,background:`${C.ink}ed`,color:C.paper,boxShadow:`0 8px 22px ${C.ink}14`}}>{cap.text}</span></div>}
  </>}
  {audio&&<Audio src={staticFile('master.wav')}/>}
 </AbsoluteFill>;
}
