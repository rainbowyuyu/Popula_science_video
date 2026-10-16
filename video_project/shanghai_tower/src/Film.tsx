import React,{useEffect,useLayoutEffect,useState,useRef,useCallback} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {World} from './World';
import {InventoryMark} from './PartsInventory';
import {RealSceneIntro} from './RealSceneIntro';
import {FlowAnalysisOverlay,PressureLegend} from './FlowAnalysisOverlay';
import {FlowSliceLegend} from './ComputedFlowSlices';
import {PileLegend} from './PileDynamicsVisualization';
import {PileAnalysisOverlay} from './PileAnalysisOverlay';
import {C,State,Timeline,stateAt,smooth,ramp,pulse,physicalTimeAt,clamp} from './visual';
import {WIND_MAGNIFICATION,STRESS_COLOR_POWER,CORE_STRESS_COLOR_POWER,DETAIL_WEB_STRESS_LIMIT} from './PhysicsPlayback';
import tlData from './timeline.json';
const tl=tlData as Timeline;
type StressRanges={member:number;shell:number|null;detail:number};
type ComponentValue={name:string;stressMPa:number;reveal:number};

type Mark={text:string;x:number;y:number;tx:number;ty:number;color:string;side:string;weight:number};
const TITLES:Record<string,[string,string]>={hook:['每天5分钟科普','上海中心'],foundation:['桩筏基础','把力交给大地'],core:['核心筒','九格，连成整体'],frame:['巨柱与伸臂','一起抵住风'],skin:['双层幕墙','把街区叠起来'],wind:['风与外形','让风错开节奏'],damper:['调谐质量阻尼器','牵住晃动'],assembly:['分步建造','一层层向上'],return:['上海中心','一路相连的力']};
// Sample the same nonlinear color transfer used by PhysicsPlayback. Tick values
// stay in the fixed physical range; only color contrast is enhanced.
const STRESS_GRADIENT=`linear-gradient(90deg,${Array.from({length:41},(_,i)=>{
 const value=1-i/20,amount=Math.pow(Math.abs(value),STRESS_COLOR_POWER);
 const color=new T.Color('#c6ccce').lerp(new T.Color(value>=0?'#087d9b':'#dd4e2b'),amount);
 return `${color.getStyle()} ${i*2.5}%`;
}).join(',')})`;
const CORE_STRESS_GRADIENT=`linear-gradient(90deg,${Array.from({length:21},(_,i)=>{
 const color=new T.Color('#dae2df').lerp(new T.Color('#df7949'),Math.pow(i/20,CORE_STRESS_COLOR_POWER));
 return `${color.getStyle()} ${i*5}%`;
}).join(',')})`;
function Stage({frame,onMarks,onRange,onFlow,onPressure,onSlices,onPile,onComponent,onInventory}:{frame:number;onInventory:(x:InventoryMark[])=>void;onMarks:(x:Mark[])=>void;onRange:(n:StressRanges)=>void;onFlow:(accepted:boolean)=>void;onPressure:(value:PressureLegend|null)=>void;onSlices:(value:FlowSliceLegend|null)=>void;onPile:(value:PileLegend|null)=>void;onComponent:(value:ComponentValue|null)=>void}){
 const {scene,camera,gl}=useThree();const w=useRef<World|null>(null),f=useRef(frame);f.current=frame;const [ready,setReady]=useState(false);const [h]=useState(()=>delayRender('Shanghai Tower semantic geometry',{timeoutInMilliseconds:120000}));
 const render=useCallback((frame:number)=>{const world=w.current;if(!world)return;const s=stateAt(frame,tl);world.update(s);onRange({member:world.physics?.stressLimit??0,shell:world.physics?.shells?.limit??null,detail:world.physics?.detailStressLimit??DETAIL_WEB_STRESS_LIMIT});onFlow(!!world.computedWind);onPressure(world.pressure?.getLegendMeta()??null);onSlices(world.flowSlices?.getLegendMeta()??null);onPile(world.pileDynamics?.getLegendMeta()??null);const labels:Mark[]=[];
  // Read from the exact high-resolution sample already driving the mesh and
  // force glyphs. Never substitute an unsigned, lower-rate history envelope.
  const selected=world.memberForces?.getReadout(),cue=s.n+s.u;
  let component:ComponentValue|null=selected?{name:selected.name,stressMPa:selected.stressMPa,reveal:selected.reveal}:null;
  // The close-up names this selected column. The later whole-frame comparison
  // describes both sides, so retain its signed colour scale without assigning
  // one arbitrary column's scalar to the side currently mentioned in speech.
  const columnReveal=pulse(20.63,20.74,21.00,21.14,cue);
  if(columnReveal>0&&world.physics){
   const axes=world.physics.byMesh.get('MEGACOL_Z04_C03')??[];
   const values=axes.map(a=>world.physics!.currentStress[a.index]).filter(Number.isFinite);
   if(values.length)component={name:'近侧巨柱 · 极值',stressMPa:values.reduce((a,b)=>Math.abs(a)>=Math.abs(b)?a:b),reveal:columnReveal};
  }
  onComponent(component);
  for(const l of world.labels(s)){const p=l.point.clone().project(camera);const x=(p.x+1)*960,y=(1-p.y)*540;if(p.z<0||p.z>1||x<350||x>1790||y<220||y>880)continue;const width=[...l.text].reduce((a,c)=>a+(c.charCodeAt(0)<128?23:38),0);let side=l.side??'right';if(side==='right'&&x+145+width>1810)side='left';if(side==='left'&&x<580)side='right';let tx=side==='right'?Math.max(1390,Math.min(1790-width,x+180)):610;let ty=Math.max(375,Math.min(670,y-60));for(const a of labels)if(Math.abs(a.ty-ty)<100&&Math.abs(a.tx-tx)<width+130)ty=ty+110<840?ty+110:ty-110;labels.push({text:l.text,x,y,tx,ty,color:l.color??C.teal,side,weight:(l.weight??1)*ramp(350,395,x)*(1-ramp(1745,1790,x))*ramp(220,250,y)*(1-ramp(850,880,y))});}onMarks([]);onInventory(world.inventory?.marks(camera as T.PerspectiveCamera,cue)??[]);gl.render(scene,camera);
 },[scene,camera,gl,onMarks,onRange,onFlow,onPressure,onSlices,onPile,onComponent,onInventory]);
 useLayoutEffect(()=>{let alive=true;const world=new World(scene,camera as T.PerspectiveCamera,gl,staticFile(''),tl);w.current=world;world.ready.then(()=>{if(alive){render(f.current);setReady(true);continueRender(h)}}).catch(cancelRender);return()=>{alive=false;world.dispose();w.current=null;continueRender(h)}},[scene,camera,gl,h,render]);
 useLayoutEffect(()=>{if(ready)render(frame)},[frame,ready,render]);return null;
}
function InventoryOverlay({marks}:{marks:InventoryMark[]}){
 return <>{marks.map(m=><React.Fragment key={m.id}>
  {m.anchor&&<svg width={1920} height={1080} style={{position:'absolute',inset:0,zIndex:4,pointerEvents:'none',opacity:m.weight}}>
   <path d={`M${m.anchor.x},${m.anchor.y} L${m.x+(m.x<m.anchor.x?140:-140)},${m.y+98} L${m.x},${m.y+98}`} fill="none" stroke={C.teal} strokeWidth={1.6}/>
   <circle cx={m.anchor.x} cy={m.anchor.y} r={4.5} fill={C.teal}/>
  </svg>}
  <div style={{position:'absolute',left:m.x-m.width/2,top:m.y,width:m.width,textAlign:'center',zIndex:5,pointerEvents:'none',opacity:m.weight,transform:`translateY(${8*(1-m.weight)}px)`,color:C.ink,textShadow:'0 1px 8px #f3f1ec,0 0 4px #f3f1ec',fontSize:44,fontWeight:600,lineHeight:1.22}}>
  {m.kind==='part'&&<div style={{width:2,height:13,background:C.teal,margin:'-17px auto 4px'}}/>}
  {m.lines.map((line,i)=><div key={i} style={{whiteSpace:'nowrap',fontWeight:i?450:650,color:i?C.muted:C.ink,fontSize:i?36:undefined,marginTop:i?4:0}}>{line}</div>)}
 </div></React.Fragment>)}</>;
}
function Titles({s}:{s:State}){const sec=tl.sections.find(x=>x.id===s.section)??tl.sections[0];const e=(s.frame-sec.start)/30,d=(sec.end-sec.start)/30;const [k,h]=TITLES[s.section]??TITLES.return;
 const x=s.section==='hook'?0:-1000*(1-ramp(0,1.3,e));const exit=-1100*ramp(Math.min(s.section==='hook'?3.6:6,d-2),Math.min(s.section==='hook'?4.8:7.2,d-.6),e);
 return <div style={{position:'absolute',left:80,top:190,transform:`translateX(${x+exit}px)`,width:760,zIndex:6,textShadow:`0 2px 18px rgba(255,255,255,.46)`}}><div style={{fontSize:36,fontWeight:500,color:C.muted,letterSpacing:1.4,marginBottom:20}}>{k}</div><div style={{fontFamily:'Rainbow Sans',fontSize:84,fontWeight:700,lineHeight:1.22,whiteSpace:'pre-line',letterSpacing:1}}>{h}</div></div>;
}
function Concept({s,flowAccepted,pressureAccepted}:{s:State;flowAccepted:boolean;pressureAccepted:boolean}){const u=s.n+s.u;let value='',note='',a=0,b=49;
 if(u>=11&&u<13){a=11;b=13;value='九格，连成整体';note='内墙与外墙共同受力'}
 if(u>=13&&u<14){a=13;b=14;value='越高，位移越明显';note=`计算位移 ×${WIND_MAGNIFICATION}`}
 if(u>=16&&u<17){a=16;b=17;value='重量，接力向下';note='重力荷载 · 竖向应力'}
 if(u>=25&&u<27){a=25;b=27;value='双层幕墙';note='九个竖向分区'}
 if(!flowAccepted&&!pressureAccepted&&u>=29&&u<31.8){a=29;b=31.8;value='转过 120°';const stateNote=pressureAccepted?' · 实算 Cp · 刚体外形':flowAccepted?' · 刚体外形':` · 形变 ×${WIND_MAGNIFICATION}`;note=`${flowAccepted?'三维求解流线':'风场机制示意'}${stateNote}`}
 if(u>=32.62&&u<32.98){a=32.62;b=32.98;value='计算位移';note=flowAccepted?'参考轮廓 · 位移 ×'+WIND_MAGNIFICATION:`参考轮廓 · 位移 ×${WIND_MAGNIFICATION}`}
 if(u>=35&&u<38.8){a=35;b=38.8;value='楼顶的配重';note='125层 · 相对摆动 1×'}
 if(u>=41.2&&u<44){a=41.2;b=44;value='一层层，接力向上';note='核心筒 → 楼面 → 幕墙'}
 if(!value)return null;const slide=-950*(1-ramp(a,a+.18,u))-950*ramp(b-.18,b,u);return <div style={{position:'absolute',left:80,top:740,width:630,color:C.ink,transform:`translateX(${slide}px)`,zIndex:6,textShadow:`0 2px 12px rgba(255,255,255,.44)`}}><div style={{fontSize:56,fontWeight:650,lineHeight:1.3}}>{value}</div><div style={{fontSize:38,color:C.muted,lineHeight:1.4,marginTop:16}}>{note}</div></div>;
}
function StressLegend({s,range}:{s:State;range:StressRanges}){
 const u=s.n+s.u;
 const outriggerShow=pulse(18.9,19.15,20.51,20.62,u),megacolShow=Math.max(pulse(20.63,20.74,21.00,21.14,u),pulse(32.98,33.08,33.75,33.95,u));
 const scales=[
  {id:'core',core:true,show:pulse(32.62,32.75,32.88,32.98,u)},
  {id:'outrigger',core:false,show:outriggerShow,maxLabel:String(range.detail),title:'斜腹杆轴向应力增量'},
  {id:'megacolumn',core:false,show:megacolShow,maxLabel:String(range.member),title:'巨柱轴向应力增量'},
 ];
 if(range.member<=0)return null;
 // Each scale is fixed across frames. Signed axial increments belong to the
 // role-specific member view; the core view shows a nonnegative section stress bound.
 // Each label retains its own identity while travelling completely offscreen.
 // The new scale enters only after the prior scale has left the picture.
 return <>{scales.filter(x=>x.show>=.001).map(({id,core,show,maxLabel,title})=><div key={id} style={{position:'absolute',left:80,top:445,width:460,transform:`translateX(${-680*(1-Math.min(1,show))}px)`,zIndex:6,textShadow:`0 2px 12px rgba(255,255,255,.44)`}}>
  <div style={{fontSize:38,fontWeight:600,marginBottom:22}}>{core?(range.shell!==null?'墙面纵向应力增量':'核心筒截面应力'):title}</div>
  <div style={{height:16,borderRadius:8,background:core&&range.shell===null?CORE_STRESS_GRADIENT:STRESS_GRADIENT}}/>
  {core?<>
   <div style={{display:'flex',justifyContent:'space-between',fontSize:38,fontWeight:600,marginTop:15,fontVariantNumeric:'tabular-nums'}}>{range.shell!==null?<><span>+{range.shell}</span><span>0</span><span>−{range.shell}</span></>:<><span>0</span><span>6</span></>}</div>
   <div style={{fontSize:36,color:C.muted,marginTop:17}}>{range.shell!==null?'壳单元 · 竖向膜应力 · MPa':'轴力 + 弯曲 · 上界 · MPa'}</div>
  </>:<>
   <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',fontSize:38,fontWeight:600,marginTop:15,fontVariantNumeric:'tabular-nums'}}><span>+{maxLabel}</span><span style={{textAlign:'center'}}>0</span><span style={{textAlign:'right'}}>−{maxLabel}</span></div>
   <div style={{display:'flex',justifyContent:'space-between',fontSize:38,marginTop:9,color:C.muted}}><span>拉向</span><span>压向</span></div>
   <div style={{fontSize:36,color:C.muted,marginTop:17}}>风致增量 · MPa</div>
   <div style={{fontSize:36,color:C.muted,marginTop:15}}>位移显示 ×{WIND_MAGNIFICATION}</div>
  </>}
 </div>)}</>;
}
/** One signed reading, in the existing clear left margin. The value and
 * colour share the same computed sample as the force arrows and mesh. */
function ComponentReadout({value}:{value:ComponentValue|null}){
 if(!value||value.reveal<=.001)return null;
 const rounded=Number(value.stressMPa.toFixed(2)),ink=rounded>0?'#087d9b':rounded<0?'#d75d37':C.muted;
 return <div style={{position:'absolute',left:80,top:258,width:460,transform:`translateX(${-650*(1-value.reveal)}px)`,zIndex:6,color:C.ink,fontVariantNumeric:'tabular-nums',textShadow:'0 2px 12px #f3f1ec88'}}>
  <div style={{fontSize:40,fontWeight:600}}>{value.name}</div>
  <div style={{fontSize:72,fontWeight:650,marginTop:13,lineHeight:1.25,color:ink}}>{rounded>0?'+':''}{rounded.toFixed(2)}<span style={{fontSize:36,fontWeight:500,marginLeft:16}}>MPa</span></div>
 </div>;
}
/** A compact visual key for the wind sequence.  It is deliberately anchored
 * in screen space so the audience never has to infer which way the animated
 * streamlines are moving while the camera orbits the tower. */
function WindOverlay({s}:{s:State}){
 const u=s.n+s.u;
 const show=pulse(28.92,29.28,31.32,31.72,u);
 if(show<=.001)return null;
 const slide=520*(1-show);
 return <div style={{position:'absolute',right:74,top:214,width:410,padding:'20px 24px 22px',borderRadius:18,background:'rgba(248,249,246,.88)',boxShadow:`0 18px 42px ${C.ink}18`,transform:`translateX(${slide}px)`,zIndex:6,color:C.ink}}>
  <div style={{display:'flex',alignItems:'center',gap:14,fontSize:34,fontWeight:650,letterSpacing:1}}><span style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:44,height:44,borderRadius:22,background:'#075b78',color:'#fff',fontSize:30}}>→</span><span>风向与绕流</span></div>
  <svg width="360" height="74" viewBox="0 0 360 74" style={{display:'block',marginTop:12,overflow:'visible'}}>
   <path d="M8 50 C62 8 112 66 166 29 S270 18 350 38" fill="none" stroke="#075b78" strokeWidth="7" strokeLinecap="round" opacity=".92"/>
   <path d="M304 24 L350 38 L306 50" fill="none" stroke="#075b78" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round"/>
   <path d="M8 66 C70 35 116 82 176 51 S275 44 350 58" fill="none" stroke="#b35b20" strokeWidth="4" strokeLinecap="round" opacity=".76"/>
  </svg>
  <div style={{fontSize:30,lineHeight:1.35,color:C.muted}}>U500 = 30 m/s · 机制示意</div>
  <div style={{display:'flex',gap:24,marginTop:10,fontSize:28,color:C.muted}}><span><i style={{display:'inline-block',width:16,height:16,borderRadius:8,background:'#075b78',marginRight:8}}/>主流线</span><span><i style={{display:'inline-block',width:16,height:16,borderRadius:8,background:'#b35b20',marginRight:8}}/>近体尾流</span></div>
 </div>;
}
function Coda({frame}:{frame:number}){const start=tl.duration-270,t=(frame-start)/30;if(t<0)return null;const move=2000*(1-ramp(0,1.45,t));
 return <AbsoluteFill style={{transform:`translateX(${move}px)`,background:`linear-gradient(90deg,${C.paper}00,${C.paper} 54px,${C.paper})`,color:C.ink}}>
  <div style={{position:'absolute',left:80,top:200,fontSize:74,fontWeight:650}}>从图纸，读懂高楼</div>
  <div style={{position:'absolute',left:82,top:312,width:850,fontSize:38,color:C.muted}}>公开资料重建 · 线弹性计算</div>
  <div style={{position:'absolute',left:82,top:396,fontSize:38,fontWeight:600}}>结构动力响应</div>
  <Img src={staticFile('physics/dynamic.svg')} style={{position:'absolute',left:80,top:452,width:740,height:100,objectFit:'contain',objectPosition:'left'}}/>
  <div style={{position:'absolute',left:82,top:590,fontSize:38,fontWeight:600}}>轴向应力增量</div>
  <Img src={staticFile('physics/axial.svg')} style={{position:'absolute',left:80,top:650,width:535,height:110,objectFit:'contain',objectPosition:'left'}}/>
  <div style={{position:'absolute',left:82,top:832,fontSize:38,fontWeight:500,color:C.muted}}>结构搭建与计算工作流</div>
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
 const [inventory,setInventory]=useState<InventoryMark[]>([]);const onInventory=useCallback((x:InventoryMark[])=>setInventory(x),[]);
 const [component,setComponent]=useState<ComponentValue|null>(null);const onComponent=useCallback((value:ComponentValue|null)=>setComponent(value?{...value}:null),[]);
 const [pile,setPile]=useState<PileLegend|null>(null);const onPile=useCallback((value:PileLegend|null)=>setPile(value?{...value}:null),[]);
 const [slices,setSlices]=useState<FlowSliceLegend|null>(null);const onSlices=useCallback((value:FlowSliceLegend|null)=>setSlices(value?{...value,slices:value.slices.map(x=>({...x}))}:null),[]);
 const frame=useCurrentFrame(),s=stateAt(frame,tl),[marks,setMarks]=useState<Mark[]>([]),[range,setRange]=useState<StressRanges>({member:0,shell:null,detail:DETAIL_WEB_STRESS_LIMIT}),[flowAccepted,setFlowAccepted]=useState(false),[pressureMeta,setPressureMeta]=useState<PressureLegend|null>(null);const cb=useCallback((x:Mark[])=>setMarks(x),[]),onRange=useCallback((n:StressRanges)=>setRange(n),[]),onFlow=useCallback((accepted:boolean)=>setFlowAccepted(accepted),[]),onPressure=useCallback((value:PressureLegend|null)=>setPressureMeta(value),[]);const pressureAccepted=!!pressureMeta,coda=frame>=tl.duration-270;
 const [h]=useState(()=>delayRender('Chinese brand fonts'));useEffect(()=>{Promise.all([new FontFace('Rainbow Sans',`url(${staticFile('fonts/sans.woff2')})`,{weight:'100 900'}).load(),new FontFace('Rainbow Serif',`url(${staticFile('fonts/serif.woff2')})`,{weight:'100 900'}).load()]).then(f=>{for(const x of f)document.fonts.add(x);continueRender(h)}).catch(cancelRender)},[h]);
 const cap=tl.captions.find(c=>frame>=c.start&&frame<c.end);
 return <AbsoluteFill style={{background:C.paper,color:C.ink,fontFamily:'Rainbow Sans,Microsoft YaHei,sans-serif',overflow:'hidden'}}>
  <ThreeCanvas shadows="soft" width={1920} height={1080} dpr={4} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} camera={{fov:34,near:.008,far:200}}><Stage frame={frame} onMarks={cb} onRange={onRange} onFlow={onFlow} onPressure={onPressure} onSlices={onSlices} onPile={onPile} onComponent={onComponent} onInventory={onInventory}/></ThreeCanvas>
  {!clean&&<RealSceneIntro frame={frame}/>}
  {!clean&&<InventoryOverlay marks={inventory}/>}
   {!clean&&<>
   {!coda&&<><Titles s={s}/>{(!pile||s.n+s.u<5.6||s.n+s.u>=9)&&<Concept s={s} flowAccepted={flowAccepted} pressureAccepted={pressureAccepted}/>}<PileAnalysisOverlay s={s} data={pile}/>{flowAccepted||pressureAccepted||slices?<FlowAnalysisOverlay s={s} slices={slices} pressure={pressureMeta}/>:<WindOverlay s={s}/>}<StressLegend s={s} range={range}/>{marks.map((l,i)=><React.Fragment key={i}><svg width={1920} height={1080} style={{position:'absolute',inset:0}}><path d={`M${l.x},${l.y} L${l.tx},${l.ty} L${l.tx+(l.side==='right'?80:-80)},${l.ty}`} fill="none" stroke={l.color} strokeWidth={2.3} pathLength={1} strokeDasharray={1} strokeDashoffset={1-l.weight}/><circle cx={l.x} cy={l.y} r={5.5*l.weight} fill={l.color}/></svg><div style={{position:'absolute',left:l.tx+(l.side==='right'?8:-8),top:l.ty-55,transform:l.side==='left'?'translateX(-100%)':undefined,fontSize:38,fontWeight:600,color:C.ink,whiteSpace:'nowrap',clipPath:`inset(0 ${(1-ramp(.18,.82,l.weight))*100}% 0 0)`,textShadow:`0 2px 8px ${C.paper},0 0 5px ${C.paper}`}}>{l.text}</div></React.Fragment>)}</>}
   <Coda frame={frame}/>
   <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:30}}><Img src={staticFile('brand/logo.png')} style={{width:76.17,height:90,objectFit:'contain',filter:'drop-shadow(0 0 3px #f5f5f0) drop-shadow(0 0 8px #f5f5f0)'}}/><span style={{fontSize:44,fontWeight:600,textShadow:'0 0 4px #f5f5f0,0 0 12px #f5f5f0,0 1px 2px #ffffff'}}>rainbow鱼</span></div>
   {!coda&&cap&&<div style={{position:'absolute',left:90,right:90,bottom:40,textAlign:'center',zIndex:8}}><span style={{display:'inline-block',fontSize:48,fontWeight:500,lineHeight:1.45,padding:'11px 30px 14px',borderRadius:10,background:`${C.ink}ed`,color:C.paper,boxShadow:`0 8px 22px ${C.ink}14`}}>{cap.text}</span></div>}
  </>}
  {audio&&<Audio src={staticFile('master.wav')}/>}
 </AbsoluteFill>;
}
