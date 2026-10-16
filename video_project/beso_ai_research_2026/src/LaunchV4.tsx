import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender,OffthreadVideo,Sequence} from 'remotion';
import story from './launch-story.json';
import captions from './launch-captions.json';
import response from '../public/beso-research/physics/zwind-response.json';
import {CinematicWorld} from './beso/CinematicWorld';
import {GeneratedLaunchBridges,generatedBridges} from './beso/GeneratedLaunchBridges';
import {FilmState,WorldInfo,clamp,smooth} from './beso/World';

type Id='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
type Scene={id:Id;start:number;duration:number};
type State={id:Id;index:number;local:number;progress:number;time:number;duration:number;sceneStart:number};
type Anchor={id:string;label:string;x:number;y:number;visible:boolean;role?:string;value?:string};
type Info=WorldInfo&{callouts?:Anchor[];taskNodes?:{id:string;label:string;x:number;y:number;z:number;visible?:boolean;status:string}[]};
const fps=story.fps as number,scenes=story.scenes as Scene[],durationInFrames=story.duration as number;
const aliases:Record<Id,string>={hero:'hook',brief:'brief',topology:'beso',physics:'zwind',interaction:'brief',toolchain:'rebuild',proof:'compare',close:'close'};
const timings=scenes.map(s=>({...s,id:aliases[s.id]})),ink='#123a4b',teal='#167d86',gold='#e8ad76';
const at=(f:number):State=>{const index=Math.max(0,scenes.findLastIndex(s=>f>=s.start)),s=scenes[index];return {id:s.id,index,local:(f-s.start)/fps,progress:clamp((f-s.start)/s.duration),time:f/fps,duration:s.duration/fps,sceneStart:s.start/fps}};
const phase=(s:State,offset=0)=>smooth((s.local-offset)/.9);
const leave=(s:State,span=.9)=>s.id==='close'?0:smooth((s.local-s.duration+span)/span);
const slide=(s:State,delay=0)=>({transform:`translate3d(${2080*(1-phase(s,delay))-2220*leave(s)}px,0,0)`});
// Concept endpoints carry no numerical results. Main product callouts wait
// for native geometry, and all numerical labels read the original saved data.
const bridgeSpan=(s:State)=> (generatedBridges.find(b=>b.role===s.id)?.durationFrames??0)/fps;
const bridged=(s:State)=>bridgeSpan(s)>0&&s.local<bridgeSpan(s)+.1;
function Stage({s,onInfo}:{s:State;onInfo:(i:Info)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<CinematicWorld|null>(null),ready=useRef(false),latest=useRef(s);latest.current=s;
 const [handle]=useState(()=>delayRender('Load verified engineering world'));
 useLayoutEffect(()=>{const w=new CinematicWorld(canvas.current!,staticFile(''),timings,fps,true);world.current=w;w.ready.then(()=>{ready.current=true;w.render({...latest.current,id:aliases[latest.current.id]} as FilmState);onInfo(w.info);continueRender(handle)}).catch(cancelRender);return()=>{ready.current=false;w.dispose();world.current=null}},[]);
 useLayoutEffect(()=>{if(ready.current&&world.current){world.current.render({...s,id:aliases[s.id]} as FilmState);onInfo(world.current.info)}},[s]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}
function Logo({s}:{s:State}){
 const guard=smooth((s.time-46.7)/.6)*(1-smooth((s.time-49.5)/.6));
 // Only the close fairlead pass needs an opaque contour around the vector
 // glyphs. The mark stays transparent and retains its original layout.
 const filter=guard===0?'drop-shadow(0 2px 5px rgba(255,255,255,.8))':`drop-shadow(0 0 ${1.7*guard}px #f7fbfa) drop-shadow(0 0 ${1.7*guard}px #f7fbfa) drop-shadow(0 0 ${2.4*guard}px #f7fbfa) drop-shadow(0 2px ${5+3*guard}px rgba(255,255,255,.95))`;
 return <Img data-qa="brand" src={staticFile('brand/zju-horizontal-mark.svg')} style={{position:'absolute',right:58,top:34,width:300,height:77,objectFit:'contain',zIndex:80,filter}}/>;
}
const heads:Record<Id,[string,string,string]>={
 hero:['AI Engineer','从需求，到可复查的工程方案','ENGINEERING, CONNECTED'],
 brief:['一句需求\n成为可执行的任务','目标与约束，进入同一条工程链','01 / PLAN'],
 topology:['工具接力，让设计前进','Geometry → Mesh → BESO','02 / BUILD & OPTIMIZE'],
 physics:['把结果，放回风浪中','Z-wind · 平台运动与系泊响应','03 / COMPUTE'],
 interaction:['失败反馈\n推动下一步','日志回传 · 调整任务 · 再次检查','04 / FEEDBACK'],
 toolchain:['AI Engineer\n连接整个过程','任务调度 → 结果读取 → 工程师复查','05 / ORCHESTRATE'],
 proof:['每个方案，都有依据','同工况比较，保留复查证据','06 / VERIFY'],
 close:['AI Engineer','让智能连接工具，让计算提供依据','FROM REQUIREMENT TO EVIDENCE']
};
function Titles({s}:{s:State}){
 const hero=s.id==='hero'||s.id==='close',web=s.id==='brief'||s.id==='interaction',ocean=hero||s.id==='physics';
 const [title,sub,eyebrow]=heads[s.id],enter=phase(s,.12),exit=leave(s),top=hero?258:web?235:150;
 return <div data-qa="title" style={{position:'absolute',left:92,top,width:web?450:hero?1000:1400,zIndex:35,color:ocean?'#f3f8f7':ink,transform:`translate3d(${-155*(1-enter)-2220*exit}px,${12*(1-enter)}px,0)`,pointerEvents:'none',textShadow:ocean?'0 2px 18px rgba(4,30,43,.55)':'none'}}>
  <div style={{fontSize:24,fontWeight:650,letterSpacing:3.3,color:ocean?'#bfdddd':teal,marginBottom:23,overflow:'hidden'}}><div style={{transform:`translateY(${32*(1-enter)}px)`}}>{eyebrow}</div></div>
  {title.split('\n').map((line,i)=><div key={line} style={{overflow:'hidden'}}><div style={{fontFamily:hero?'Arial, Microsoft YaHei, sans-serif':undefined,fontSize:hero?106:web?57:68,fontWeight:760,lineHeight:1.16,letterSpacing:hero?-4:-1.5,transform:`translateY(${130*(1-phase(s,.12+i*.12))}px)`}}>{line}</div></div>)}
  <div style={{fontSize:hero?34:web?27:31,lineHeight:1.5,marginTop:20,color:ocean?'#e0ecec':'#47707a',maxWidth:web?430:1040,overflow:'hidden'}}><div style={{transform:`translateY(${70*(1-phase(s,.45))}px)`}}>{sub}</div></div>
  <div style={{width:hero?160:94,height:3,marginTop:26,background:`linear-gradient(90deg,${gold},${teal})`,transform:`scaleX(${phase(s,.55)})`,transformOrigin:'left'}}/>
 </div>;
}
function Browser({s}:{s:State}){
 if(s.id!=='brief'&&s.id!=='interaction')return null;
 const delay=s.id==='brief'?5.05:.15,entry=smooth((s.local-delay)/(s.id==='brief'?1.1:.9)),out=leave(s,1.1),q=clamp((s.local-delay)/Math.max(1,s.duration-delay));
 return <div data-qa="browser" style={{position:'absolute',left:555,top:247,width:1280,height:719,zIndex:25,perspective:3200,transform:`translate3d(${2110*(1-entry)-2320*out}px,${14*(1-entry)}px,0)`,transformOrigin:'center'}}>
  <div style={{width:'100%',height:'100%',overflow:'hidden',borderRadius:10,background:'#fafdfd',boxShadow:'0 32px 75px rgba(17,58,74,.14)',border:'1px solid rgba(125,161,172,.24)',transform:`rotateY(${-4+3*q-13*out}deg) rotateX(${1.3-1.1*q}deg) rotateZ(${-1*(1-entry)}deg)`}}>
   <div style={{height:36,display:'flex',alignItems:'center',padding:'0 20px',fontSize:22,color:'#315e70',background:'#edf4f4'}}><span>AI Engineer</span><span style={{marginLeft:'auto',fontSize:20,color:'#577986'}}>真实软件界面 · 录制回放</span></div>
   <Sequence from={Math.round(s.sceneStart*fps)} layout="none"><OffthreadVideo muted src={staticFile(`beso-research/web-live/${s.id==='brief'?'brief-live':'interaction-live'}.mp4`)} style={{width:'100%',height:683,objectFit:'contain',background:'#f3f8f8'}}/></Sequence>
  </div>
 </div>;
}
function WebCopy({s}:{s:State}){
 if(s.id!=='brief'&&s.id!=='interaction')return null;
 const words=s.id==='brief'?['20 兆瓦浮式风机','目标 / 海况 / 材料','约束进入参数包']:['读取结果与日志','定位失败原因','保留修改记录'],delay=s.id==='brief'?6.25:.8;
 const exit=s.id==='brief'?smooth((s.time-16)/.75):leave(s);
 return <div data-qa="web-copy" style={{position:'absolute',left:95,top:595,width:420,zIndex:32,color:ink,transform:`translate3d(${2080*(1-phase(s,delay))-2220*exit}px,0,0)`}}>{words.map((w,i)=><div key={w} style={{fontSize:i===0?34:30,fontWeight:i===0?680:500,lineHeight:1.5,marginTop:22,overflow:'hidden'}}><div style={{transform:`translateY(${58*(1-phase(s,delay+i*.22))}px)`}}>{w}</div></div>)}</div>;
}
function SpatialGraph({s,info}:{s:State;info?:Info}){
 if(s.id!=='toolchain'||bridged(s))return null;
 const nodes=info?.taskNodes??[],first=bridgeSpan(s)+.1;
 return <><div data-qa="graph-note" style={{position:'absolute',left:98,top:490,fontSize:25,color:teal,zIndex:30}}>任务与反馈链路 · 架构示意</div>{nodes.map((n,i)=>{
  if(n.visible===false||n.x<75||n.x>1840||n.y<200||n.y>865||!Number.isFinite(n.x+n.y))return null;
  const start=first+Math.floor(i/3)*2.35,entry=smooth((s.local-start)/.55),exit=smooth((s.local-start-1.8)/.55),travel=2160*(1-entry)-2400*exit;
  // A spacious three-label rail keeps text clear of the title and foreground
  // hull. Thin leaders still connect each label to its projected world node.
  const x=620+(i%3)*430,y=849,center=x+120,color=i>=6?'#ac704e':teal;
  return <React.Fragment key={n.id}><svg style={{position:'absolute',inset:0,zIndex:31,pointerEvents:'none',transform:`translateX(${travel}px)`}} width="1920" height="1080"><defs><mask id={`graph-safe-${n.id}`}><rect width="1920" height="1080" fill="white"/><rect width="755" height="535" fill="black"/></mask></defs><path d={`M ${n.x} ${n.y} L ${center} 812 L ${center} ${y-13}`} fill="none" stroke={color} strokeWidth="1.4" opacity=".65" mask={`url(#graph-safe-${n.id})`}/><circle cx={center} cy={y-13} r="3.2" fill={color}/></svg><div data-qa="graph-label" style={{position:'absolute',left:x,top:y,width:240,textAlign:'center',fontSize:33,fontWeight:650,color:ink,zIndex:32,textShadow:'0 1px 9px rgba(248,253,251,.98)',transform:`translate3d(${travel}px,0,0)`}}>{n.label}</div></React.Fragment>
 })}</>;
}
function Topology({s,info}:{s:State;info?:Info}){
 if(s.id!=='topology'||bridged(s))return null;const p=(info?.fraction??1)*100;
 const travel=2080*(1-phase(s,5.1))+640*smooth((s.time-32.3)/.6);
 const contour=smooth((s.time-31)/.4);
 return <div data-qa="topology-stats" style={{position:'absolute',right:92,top:438,width:352,zIndex:30,color:ink,transform:`translate3d(${travel}px,0,0)`,textShadow:contour===0?'none':`0 0 ${1.8*contour}px #f7fbfa, 0 0 ${1.8*contour}px #f7fbfa, 0 0 ${7*contour}px #f7fbfa`}}><div style={{fontSize:28,color:teal}}>BESO · 材料演化</div><div style={{fontSize:98,fontWeight:750,letterSpacing:-4,fontVariantNumeric:'tabular-nums',marginTop:12}}>{p.toFixed(1)}<span style={{fontSize:39,letterSpacing:0}}> %</span></div><div style={{fontSize:29,color:'#476d77'}}>实体保留体积</div><div style={{height:4,background:'#bcd2d4',margin:'28px 0 23px'}}><div style={{height:4,width:`${p}%`,background:teal}}/></div><div style={{fontSize:36,fontWeight:650}}>第 {info?.iteration??0} 次迭代</div><div style={{fontSize:25,color:'#5b7982',marginTop:14}}>44 个保存状态 · 结果回放</div></div>;
}
const sampled=response.records.filter((_,i)=>i%8===0),lo=Math.min(...sampled.map(r=>r.platform[0])),hi=Math.max(...sampled.map(r=>r.platform[0]));
const px=(t:number)=>12+400*t/120,py=(v:number)=>127-100*(v-lo)/(hi-lo),path=sampled.map((r,i)=>`${i?'L':'M'}${px(r.t)},${py(r.platform[0])}`).join(' ');
function Physics({s,info}:{s:State;info?:Info}){
 if(s.id!=='physics'||bridged(s)||!info?.native)return null;
 const n=info.native,read=smooth((s.local-5.05)/.8),exit=leave(s,1.1),anchors=(info.callouts??[]).filter(c=>c.id==='fairlead-1'&&c.visible&&c.x>60&&c.x<1720&&c.y>360&&c.y<845);
 return <><div data-qa="physics-readout" style={{position:'absolute',left:90,top:454,width:455,zIndex:32,color:'#eef8f7',transform:`translateX(${-2030*(1-read)-2220*exit}px)`,textShadow:'0 2px 12px #052a3b'}}><div style={{fontSize:26,color:'#aed7d8'}}>Z-wind / 保存响应回放</div><div style={{marginTop:20,fontSize:32}}>纵荡 <span style={{fontSize:64,fontWeight:700,color:'#b9e5e4',fontVariantNumeric:'tabular-nums'}}>{n.surge.toFixed(2)}</span> m</div><svg width="425" height="162" viewBox="0 0 425 162" style={{marginTop:10}}><path d={path} fill="none" stroke="#a9e4df" strokeWidth="3"/><line x1={px(n.time)} x2={px(n.time)} y1="15" y2="130" stroke={gold} strokeWidth="2"/><circle cx={px(n.time)} cy={py(n.surge)} r="6" fill={gold}/><text x="12" y="158" fontSize="23" fill="#d7eded">0 s</text><text x="414" y="158" fontSize="23" textAnchor="end" fill="#d7eded">120 s</text></svg><div style={{marginTop:14,fontSize:29}}>纵摇 {n.pitch.toFixed(2)}°</div><div style={{marginTop:16,fontSize:26,color:'#c0dada'}}>saved response / visual wave</div></div>{anchors.map((c,i)=>{const x=Math.max(580,Math.min(1530,c.x+26)),y=Math.max(395,Math.min(770,c.y-26));return <React.Fragment key={c.id}><svg style={{position:'absolute',inset:0,zIndex:31,pointerEvents:'none'}} width="1920" height="1080"><path d={`M ${c.x} ${c.y} L ${x-14} ${y+16} L ${x+180} ${y+16}`} fill="none" stroke={i?gold:'#a1e0dc'} strokeWidth="1.6"/><circle cx={c.x} cy={c.y} r="5" fill={i?gold:'#a1e0dc'}/></svg><div data-qa="physical-label" style={{position:'absolute',left:x,top:y-22,zIndex:33,color:'#f2faf7',fontSize:29,fontWeight:600,textShadow:'0 2px 9px #082c3c'}}>{c.label}<div style={{fontSize:31,fontWeight:500,color:i?gold:'#aae3df',marginTop:23}}>{c.value}</div></div></React.Fragment>})}</>;
}
function Proof({s}:{s:State}){
 if(s.id!=='proof')return null;const q=phase(s,.4),exit=leave(s,1.2);
 return <div data-qa="proof" style={{position:'absolute',left:1045,top:416,width:780,zIndex:32,color:ink,transform:`translateX(${2140*(1-q)-2200*exit}px)`}}><div style={{fontSize:30,color:'#527782'}}>单位功率用钢量</div><div style={{display:'flex',alignItems:'baseline',gap:22,marginTop:15}}><span style={{fontSize:111,fontWeight:760,letterSpacing:-5}}>255.5</span><span style={{fontSize:36,color:teal}}>t/MW</span></div><div style={{fontSize:29,color:'#55737e',marginTop:15}}>图强号 278 t/MW → 案例方案 255.5 t/MW</div><div style={{height:4,width:610,background:'#bcd0d3',marginTop:34}}><div style={{height:4,width:`${91.9*phase(s,1.1)}%`,background:teal}}/></div><div style={{fontSize:93,color:teal,fontWeight:700,letterSpacing:-4,marginTop:24}}>−8.1%<span style={{fontSize:28,letterSpacing:0,fontWeight:500,color:'#53757f',marginLeft:24}}>用钢量</span></div><div style={{fontSize:27,color:'#637e87',marginTop:22}}>论文案例 · 同工况对照</div></div>;
}
function Closing({s}:{s:State}){if(s.id!=='close'||bridged(s))return null;return <div data-qa="close-chain" style={{position:'absolute',left:98,top:673,zIndex:35,display:'flex',alignItems:'center',gap:24,color:'#e3f0ee',fontSize:33,textShadow:'0 2px 10px #073045'}}>{['需求','模型','计算','复查'].map((w,i)=><React.Fragment key={w}>{i>0&&<span style={{color:'#8abdc0',fontSize:26}}>→</span>}<div style={{overflow:'hidden'}}><div style={{transform:`translateY(${70*(1-phase(s,5.15+i*.17))}px)`}}>{w}</div></div></React.Fragment>)}</div>}
function Caption(){const f=useCurrentFrame(),ms=f/fps*1000,c=captions.find(c=>ms>=c.startMs&&ms<c.endMs);if(!c)return null;return <div data-qa="caption" style={{position:'absolute',left:0,right:0,bottom:0,height:136,zIndex:90,display:'flex',justifyContent:'center',alignItems:'flex-end',padding:'0 100px 28px',background:'linear-gradient(180deg,transparent,rgba(4,25,37,.22) 40%,rgba(4,25,37,.48))',pointerEvents:'none'}}><span style={{fontSize:39,fontWeight:500,lineHeight:1.4,color:'#f5faf7',textShadow:'0 2px 5px rgba(3,21,32,.8)',maxWidth:1700,textAlign:'center'}}>{c.text}</span></div>}
export const LaunchFilm:React.FC<{audio?:boolean;overlay?:boolean;qa?:boolean}>=({audio=true,overlay=true,qa=false})=>{
 const frame=useCurrentFrame(),s=useMemo(()=>at(frame),[frame]),[info,setInfo]=useState<Info>(),ocean=s.id==='hero'||s.id==='physics'||s.id==='close';
 useLayoutEffect(()=>{if(!qa)return;const boxes=Array.from(document.querySelectorAll('[data-qa]')).map(el=>{const r=el.getBoundingClientRect();return {role:el.getAttribute('data-qa'),text:el.textContent?.slice(0,140),x:r.x,y:r.y,width:r.width,height:r.height}});console.log('LAYOUT_QA '+JSON.stringify({frame,scene:s.id,local:s.local,boxes}))},[frame,info,qa]);
 return <AbsoluteFill style={{fontFamily:'Microsoft YaHei, Noto Sans CJK SC, sans-serif',background:'#e9f0f1',overflow:'hidden'}}><Stage s={s} onInfo={setInfo}/><GeneratedLaunchBridges/>{overlay&&<>{ocean&&<div style={{position:'absolute',inset:0,zIndex:20,pointerEvents:'none',background:'linear-gradient(90deg,rgba(2,25,39,.35),transparent 53%)'}}/>}<Logo s={s}/><Titles s={s}/><Browser s={s}/><WebCopy s={s}/><SpatialGraph s={s} info={info}/><Topology s={s} info={info}/><Physics s={s} info={info}/><Proof s={s}/><Closing s={s}/><Caption/></>}{audio&&<Audio src={staticFile('audio/launch-v4-master.wav')}/>}</AbsoluteFill>
};
export {durationInFrames,fps};
