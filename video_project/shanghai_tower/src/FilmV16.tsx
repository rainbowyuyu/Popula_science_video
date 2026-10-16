import React,{useEffect,useLayoutEffect,useState,useRef,useCallback} from 'react';
import {AbsoluteFill,Audio,Img,OffthreadVideo,Sequence,Freeze,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {WorldV16} from './v16/WorldV16';
import {V16CameraRig,V16Aspect} from './v16/V16CameraRig';
import {CinematicLayersV16} from './v16/CinematicLayersV16';
import {editTimeline,sourceStateAt,originalTimeline,transitionAt} from './v16/timeline';
import {RealSceneIntro} from './RealSceneIntro';
import {InventoryMark} from './PartsInventory';
import {PressureLegend} from './FlowAnalysisOverlay';
import {FlowSliceLegend} from './ComputedFlowSlices';
import {PileLegend} from './PileDynamicsVisualization';
import {C,State,ramp,pulse} from './visual';
import {WIND_MAGNIFICATION} from './PhysicsPlayback';

type Meta={marks:InventoryMark[];pressure:PressureLegend|null;slices:FlowSliceLegend|null;pile:PileLegend|null;stressLimit:number;detailLimit:number;coreLimit:number|null};
const emptyMeta:Meta={marks:[],pressure:null,slices:null,pile:null,stressLimit:0,detailLimit:0,coreLimit:null};
function Stage({frame,aspect,onMeta}:{frame:number;aspect:V16Aspect;onMeta:(m:Meta)=>void}){
 const {scene,camera,gl}=useThree(),worldRef=useRef<WorldV16|null>(null),layersRef=useRef<CinematicLayersV16|null>(null),frameRef=useRef(frame);
 frameRef.current=frame;const [ready,setReady]=useState(false),[handle]=useState(()=>delayRender('V16 structural model and cinematic assets',{timeoutInMilliseconds:120000}));
 const render=useCallback((f:number)=>{
  const world=worldRef.current,layers=layersRef.current;if(!world||!layers)return;
  const s=sourceStateAt(f,aspect);world.update(s);const transition=transitionAt(f,aspect);if(transition&&transition.labelOpacity<.98){if(world.spatial)world.spatial.annotations.root.visible=false;}else if(world.spatial)world.spatial.annotations.root.visible=true;layers.update(s,f);layers.reflect();
  onMeta({marks:transition&&transition.labelOpacity<.98?[]:world.inventory?.marks(world.camera,s.n+s.u)??[],pressure:world.pressure?.getLegendMeta()??null,slices:world.flowSlices?.getLegendMeta()??null,pile:world.pileDynamics?.getLegendMeta()??null,stressLimit:world.physics?.stressLimit??0,detailLimit:world.physics?.detailStressLimit??0,coreLimit:world.physics?.shells?.limit??null});
  (window as any).__v16World=world;(window as any).__v16Frame={frame:f,sourceFrame:s.frame,cue:s.n+s.u,aspect};
  gl.render(scene,camera);
 },[aspect,scene,camera,gl,onMeta]);
 useLayoutEffect(()=>{let alive=true;const world=new WorldV16(scene,camera as T.PerspectiveCamera,gl,staticFile(''),originalTimeline);worldRef.current=world;
  const rig=new V16CameraRig(world,aspect);world.cameraOverride=s=>rig.apply(s,transitionAt(frameRef.current,aspect));
  world.ready.then(async()=>{if(!alive)return;const layers=new CinematicLayersV16(world,gl,staticFile(''));layersRef.current=layers;await layers.ready;if(alive){render(frameRef.current);setReady(true);continueRender(handle)}else{layers.dispose()}}).catch(cancelRender);
  return()=>{alive=false;layersRef.current?.dispose();world.dispose();worldRef.current=null;continueRender(handle)};
 },[scene,camera,gl,handle,render,aspect]);
 useLayoutEffect(()=>{if(ready)render(frame)},[frame,ready,render]);return null;
}

const TITLES:Record<string,[string,string]>={hook:['每天5分钟科普','上海中心'],foundation:['01 / 地下','先站稳，再长高'],core:['02 / 骨架','把一座楼连起来'],frame:['03 / 传力','重量怎样走到地面'],skin:['04 / 外衣','楼里还有一层城市'],wind:['05 / 风','风来了，谁在接力'],damper:['06 / 阻尼','让晃动慢下来'],assembly:['07 / 建造','一层层，接回整座楼'],return:['上海中心','看见一座楼里的力']};
function ChapterTitle({frame,aspect}:{frame:number;aspect:V16Aspect}){
 const tl=editTimeline(aspect),sec=tl.sections.find(x=>frame>=x.start&&frame<x.end);if(!sec)return null;
 const vertical=aspect==='9:16',t=(frame-sec.start)/30,[k,title]=TITLES[sec.id]??TITLES.return;
 if(t>4.5)return null;
 const enter=ramp(0,.8,t),leave=ramp(3.1,4.5,t),x=(vertical?1180:2070)*leave;
 return <div style={{position:'absolute',left:vertical?68:78,top:vertical?225:193,transform:`translate(${x}px,${38*(1-enter)}px)`,opacity:enter,zIndex:6,pointerEvents:'none',textShadow:'0 2px 18px #f1f2edcc'}}>
  <div style={{fontSize:36,color:C.teal,fontWeight:550,letterSpacing:3,marginBottom:12}}>{k}</div>
  <div style={{fontSize:vertical?78:84,fontWeight:680,letterSpacing:1,lineHeight:1.22}}>{title}</div>
  <div style={{marginTop:19,width:70+100*enter,height:3,background:C.gold,transformOrigin:'left'}}/>
 </div>;
}
function OpeningLabels({marks,aspect}:{marks:InventoryMark[];aspect:V16Aspect}){
 const vertical=aspect==='9:16',W=vertical?1080:1920,H=vertical?1920:1080;
 return <>{marks.map(m=>{const x=vertical?W*.5:m.x,y=vertical?(m.kind==='family'?244:1390):m.y,anchor=m.anchor?{x:m.anchor.x/1920*W,y:m.anchor.y/1080*H}:null;
  return <React.Fragment key={m.id}>{anchor&&<svg width={W} height={H} style={{position:'absolute',inset:0,opacity:m.weight,zIndex:5,pointerEvents:'none'}}><path d={`M${anchor.x} ${anchor.y} L${x} ${y-22}`} fill="none" stroke={C.teal} strokeWidth={1.6}/><circle cx={anchor.x} cy={anchor.y} r={4} fill={C.gold}/></svg>}
  <div style={{position:'absolute',left:x-340,top:y,width:680,textAlign:'center',zIndex:6,opacity:m.weight,transform:`translateY(${22*(1-m.weight)}px)`,textShadow:'0 0 14px #f5f3efff,0 0 4px #fff',fontSize:48,fontWeight:650}}>{m.lines[0]}</div>
 </React.Fragment>})}</>;
}

function DataKey({s,meta,aspect}:{s:State;meta:Meta;aspect:V16Aspect}){
 const cue=s.n+s.u,vertical=aspect==='9:16';let title='',note='',gradient='',ticks:string[]=[],weight=0;
 const pile=meta.pile,pressure=meta.pressure,slices=meta.slices;
 if(pile&&cue>6.3&&cue<8.36){title=`${pile.quantity} · ${pile.unit}`;weight=pulse(6.3,6.46,8.12,8.36,cue);note=`独立单桩算例 · 位移 ×${pile.displacementMagnification}`;gradient=`linear-gradient(90deg,${pile.palette.map(p=>`${p.color} ${p.at*100}%`).join(',')})`;ticks=pile.ticks.map(v=>String(v));if(pile.mode==='reaction'){gradient='';note='独立单桩 · 箭头长度表示土反力';}}
 if(cue>18.9&&cue<20.62){title='斜杆轴向应力增量 · MPa';note=`重建算例 · 位移 ×${WIND_MAGNIFICATION}`;weight=pulse(18.9,19.15,20.51,20.62,cue);ticks=[`+${meta.detailLimit}`,'0',`−${meta.detailLimit}`];gradient='linear-gradient(90deg,#087d9b,#c6ccce,#dd4e2b)';}
 if(cue>29&&cue<30.03&&pressure){title='风压系数 Cp · 无量纲';note=`定性算例 · 来流 ${pressure.referenceVelocity_m_s??30} m/s`;weight=pulse(29,29.18,29.8,30.03,cue);ticks=[String(pressure.range[0]),'0',String(pressure.range[1])];gradient='linear-gradient(90deg,#07869f,#e5e8e2,#d7653e)';}
 if(cue>30&&cue<32.16&&slices){title='平均流速 · m/s';note=`定性算例 · 来流 ${slices.referenceVelocity_m_s} m/s`;weight=pulse(30,30.15,31.9,32.16,cue);ticks=slices.ticks_m_s.map(String);gradient=`linear-gradient(90deg,${slices.palette.map(p=>`${p.color} ${p.at*100}%`).join(',')})`;}
 if(cue>32.62&&cue<33.95){const core=cue<32.98;title=core?'墙面纵向应力增量 · MPa':'巨柱轴向应力增量 · MPa';note=`重建算例 · 位移 ×${WIND_MAGNIFICATION}`;const lim=core?meta.coreLimit:meta.stressLimit;weight=core?pulse(32.62,32.75,32.88,32.98,cue):pulse(32.98,33.08,33.75,33.95,cue);ticks=[`+${lim}`,'0',`−${lim}`];gradient='linear-gradient(90deg,#087d9b,#c6ccce,#dd4e2b)';}
 if(cue>35&&cue<38.8){title='125层 · 调谐质量阻尼器';note='重建算例 · 相对摆动 1×';weight=pulse(35,35.25,38.5,38.8,cue);}
 if(weight<.001)return null;
 return <div style={{position:'absolute',left:vertical?100:80,top:vertical?1460:700,width:vertical?880:560,zIndex:6,transform:`translateX(${-1200*(1-weight)}px)`,textShadow:'0 0 10px #f4f3efff,0 0 5px #f4f3ef'}}>
  <div style={{fontSize:38,fontWeight:650,lineHeight:1.25}}>{title}</div>
  {gradient&&<><div style={{height:12,marginTop:17,borderRadius:6,background:gradient}}/><div style={{display:'flex',justifyContent:'space-between',fontSize:36,marginTop:9,fontVariantNumeric:'tabular-nums'}}>{ticks.map((t,i)=><span key={i} style={vertical&&pile&&cue>6.3&&cue<8.36?{background:'#e8edec',boxShadow:'0 0 0 6px #e8edec',borderRadius:4}:undefined}>{t}</span>)}</div></>}
  <div style={{fontSize:36,color:C.muted,marginTop:13,lineHeight:1.3}}>{note}</div>
 </div>;
}

function Coda({frame,aspect}:{frame:number;aspect:V16Aspect}){
 const tl=editTimeline(aspect),start=tl.duration-(aspect==='9:16'?150:175),t=(frame-start)/30;if(t<0)return null;
 const vertical=aspect==='9:16',progress=ramp(0,.9,t),W=vertical?1080:1920;
 const paperY=vertical?575:238,paperX=vertical?185:1130,paperW=vertical?420:370;
 return <AbsoluteFill style={{zIndex:9,pointerEvents:'none',transform:`translateX(${W*(1-progress)}px)`,background:vertical?'linear-gradient(90deg,#f3f1eceb,#eef3f2f8)':'linear-gradient(90deg,#f3f1ecf8 0%,#eef3f2ed 70%,#edf3f4ec)'}}>
  <div style={{position:'absolute',left:vertical?72:82,top:vertical?230:190,fontSize:vertical?70:78,fontWeight:680}}>从图纸，读懂高楼</div>
  <div style={{position:'absolute',left:vertical?76:86,top:vertical?350:310,fontSize:36,color:C.muted}}>公开资料重建 · 线弹性计算</div>
  <div style={{position:'absolute',left:paperX+paperW*.66,top:paperY-35,width:paperW,height:paperW*1.414,transform:`rotate(5deg) translateY(${80*(1-ramp(.3,1.1,t))}px)`}}><Img src={staticFile('papers/structural-system.jpg')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top',boxShadow:'0 22px 48px #18303b29'}}/></div>
  <div style={{position:'absolute',left:paperX,top:paperY,width:paperW,height:paperW*1.414,transform:`rotate(-3deg) translateY(${60*(1-ramp(.1,.9,t))}px)`}}><Img src={staticFile('papers/structural-title.jpg')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top',boxShadow:'0 24px 46px #18303b2b'}}/></div>
  <div style={{position:'absolute',left:vertical?160:1100,top:paperY+paperW*1.414+33,width:vertical?800:780,fontSize:36,color:C.muted}}>Su 等 · 2013 · 结构与监测</div>
  <div style={{position:'absolute',left:vertical?90:86,top:vertical?1310:415,width:vertical?890:830}}>
   <div style={{fontSize:36,fontWeight:600,marginBottom:18}}>结构动力响应</div><Img src={staticFile('physics/dynamic.svg')} style={{width:vertical?860:775,height:105,objectFit:'contain',objectPosition:'left'}}/>
   {!vertical&&<><div style={{fontSize:36,fontWeight:600,marginTop:34,marginBottom:16}}>轴向应力增量</div><Img src={staticFile('physics/axial.svg')} style={{width:620,height:95,objectFit:'contain',objectPosition:'left'}}/></>}
  </div>
  <div style={{position:'absolute',left:vertical?74:86,bottom:vertical?160:115,fontSize:38,fontWeight:650}}>结构搭建与计算工作流</div>
  <div style={{position:'absolute',left:vertical?74:86,right:70,bottom:vertical?70:49,fontSize:vertical?38:42,fontWeight:550,color:C.teal}}>Zwind + Diffusion + Iwind → AI engineer</div>
 </AbsoluteFill>;
}

export function FilmV16({audio=true,clean=false,aspect='16:9'}:{audio?:boolean;clean?:boolean;aspect?:V16Aspect}){
 const frame=useCurrentFrame(),tl=editTimeline(aspect),s=sourceStateAt(frame,aspect),vertical=aspect==='9:16',W=vertical?1080:1920,H=vertical?1920:1080;
 const [meta,setMeta]=useState<Meta>(emptyMeta),onMeta=useCallback((m:Meta)=>setMeta(m),[]);
 const [fontHandle]=useState(()=>delayRender('V16 brand typography'));useEffect(()=>{Promise.all([new FontFace('Rainbow Sans',`url(${staticFile('fonts/sans.woff2')})`,{weight:'100 900'}).load(),new FontFace('Rainbow Serif',`url(${staticFile('fonts/serif.woff2')})`,{weight:'100 900'}).load()]).then(fonts=>{for(const f of fonts)document.fonts.add(f);continueRender(fontHandle)}).catch(cancelRender)},[fontHandle]);
 const cap=tl.captions.find(c=>frame>=c.start&&frame<c.end),coda=frame>=tl.duration-(vertical?150:175),qwenStart=tl.duration-325;
 const waterReveal=ramp(qwenStart,qwenStart+36,frame),waterFeather=260,waterEdge=H+waterFeather-(H+2*waterFeather)*waterReveal;
 const whiteBrand=vertical?0:ramp(qwenStart+24,qwenStart+32,frame)*(1-ramp(tl.duration-175+17,tl.duration-175+24,frame));
 const brandColor=new T.Color(C.ink).lerp(new T.Color('#fff'),whiteBrand).getStyle();
 return <AbsoluteFill style={{background:C.paper,color:C.ink,fontFamily:'Rainbow Sans,Microsoft YaHei,sans-serif',overflow:'hidden'}}>
  <ThreeCanvas shadows="soft" width={W} height={H} dpr={2} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} camera={{fov:34,near:.008,far:200}}><Stage frame={frame} aspect={aspect} onMeta={onMeta}/></ThreeCanvas>
  {!clean&&<>
   <RealSceneIntro frame={s.frame} aspect={aspect}/>
   {!vertical&&frame>=qwenStart&&<Sequence from={qwenStart} durationInFrames={325}><div style={{position:'absolute',inset:0,zIndex:4,overflow:'hidden',maskImage:`linear-gradient(to bottom,transparent ${waterEdge-waterFeather}px,#000 ${waterEdge+waterFeather}px)`}}><Freeze frame={Math.min(149,frame-qwenStart)}><OffthreadVideo src={staticFile('v16/qwen-river-rise.mp4')} muted style={{width:W,height:H,objectFit:'cover',transform:`translateY(${12*(1-waterReveal)}px) scale(${1+.035*(1-waterReveal)})`,transformOrigin:'50% 74%'}}/></Freeze><div style={{position:'absolute',right:72,top:58,fontSize:36,color:'#fff',textShadow:'0 2px 8px #123'}}>城市环境示意</div></div></Sequence>}
   {s.n+s.u>5.3&&s.n+s.u<9.2&&<div style={{position:'absolute',right:vertical?60:72,top:vertical?195:64,fontSize:36,color:C.paper,background:'#284450f2',padding:'6px 14px 8px',borderRadius:6,boxShadow:'0 3px 14px #18303b12',zIndex:7}}>土层纹理示意</div>}
   {!coda&&<><ChapterTitle frame={frame} aspect={aspect}/><OpeningLabels marks={meta.marks} aspect={aspect}/>{!transitionAt(frame,aspect)&&<DataKey s={s} meta={meta} aspect={aspect}/>}</>}
   {s.frame>=80&&s.frame<204&&<div style={{position:'absolute',right:64,top:64,fontSize:36,color:C.muted,zIndex:7}}>点云转场示意</div>}
   <Coda frame={frame} aspect={aspect}/>
   <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:30}}><Img src={staticFile('brand/logo.png')} style={{width:76.17,height:90,objectFit:'contain',filter:whiteBrand>0?`brightness(${1-whiteBrand}) invert(${whiteBrand}) drop-shadow(0 1px 3px #102b3b55)`:'drop-shadow(0 0 5px #f5f5f0)'}}/><span style={{fontSize:44,fontWeight:600,color:brandColor,textShadow:whiteBrand>0?'0 1px 3px #102b3b55':'0 0 10px #f5f5f0,0 1px 2px #fff'}}>rainbow鱼</span></div>
   {!coda&&cap&&<div style={{position:'absolute',left:vertical?62:90,right:vertical?62:90,bottom:vertical?104:42,textAlign:'center',zIndex:12}}><span style={{display:'inline-block',fontSize:48,fontWeight:500,lineHeight:1.42,padding:'12px 24px 14px',borderRadius:8,background:'#18303beb',color:C.paper}}>{cap.text}</span></div>}
  </>}
  {audio&&<Audio src={staticFile(vertical?'v16/audio/vertical-master.wav':'v16/audio/master.wav')}/>}
 </AbsoluteFill>;
}
