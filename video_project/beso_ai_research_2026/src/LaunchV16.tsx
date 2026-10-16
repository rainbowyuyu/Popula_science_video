import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import story from './launch-v16-story.json';
import captions from './launch-v16-captions.json';
import checklist from '../public/beso-research/web-live/v7/visual-data.json';
import replan from '../public/beso-research/web-live/v7/replan-visual.json';
import {LaunchWorldV16,ContinuousInfoV16} from './beso/LaunchWorldV16';
import {OceanTypographyV16,FilmPhaseV16,smoothV16 as ease,paperToneV16,blendInkV16} from './beso/OceanTypographyV16';
import {BridgePreludeV16,GeneratedLaunchBridgesV16,bridgeCoverageV16} from './beso/GeneratedLaunchBridgesV16';

export const fps=60,durationInFrames=6300;
const ink='#f2f2e5',muted='#c7dcdb',gold='#f1c78f',ivory='#f7f0df';
const shots=story.scenes as {id:FilmPhaseV16;start:number;duration:number;title:string}[];
type Shot=typeof shots[number]&{time:number;local:number;seconds:number};
const shotAt=(frame:number):Shot=>{const s=shots[Math.max(0,shots.findLastIndex(s=>frame>=s.start))];return{...s,time:frame/fps,local:(frame-s.start)/fps,seconds:s.duration/fps}};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));

/** The frame is not ready until WebGPU finishes rendering it. No old canvas
 * is allowed to slip into an offline capture during a camera move. */
function World({time,onInfo,blueprint}:{time:number;onInfo:(info:ContinuousInfoV16)=>void;blueprint:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<LaunchWorldV16|null>(null);
 const queue=useRef<Promise<unknown>>(Promise.resolve());
 const [mountHandle]=useState(()=>delayRender('Initialize v16 ocean and native model'));
 useLayoutEffect(()=>{
  const w=new LaunchWorldV16(canvas.current!,staticFile(''));world.current=w;
  queue.current=w.ready.then(()=>continueRender(mountHandle)).catch(cancelRender);
  return()=>{world.current=null;queue.current.finally(()=>w.dispose());};
 },[]);
 useLayoutEffect(()=>{
  const handle=delayRender('Render v16 deterministic frame '+time);
  const w=world.current;
  if(!w){continueRender(handle);return;}
  queue.current=queue.current.then(async()=>{await w.ready;await (blueprint?w.renderBlueprint(time):w.render(time));onInfo({...w.info});continueRender(handle);}).catch(cancelRender);
 },[time,blueprint]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}

function EvidenceLane({s,start=0,end=s.seconds,children,top=423,dark=false,role}:{s:Shot;start?:number;end?:number;children:React.ReactNode;top?:number;dark?:boolean;role:string}){
 if(s.local<start||s.local>=end)return null;
 const enter=ease((s.local-start)/.85),exit=ease((s.local-end+.85)/.85);
 return <div data-qa={role} style={{position:'absolute',zIndex:30,left:112,top,width:775,transform:`perspective(1800px) translate3d(${-1100*(1-enter)-1150*exit}px,${3*Math.sin(s.time*.45)}px,0) rotateY(-3deg)`,transformOrigin:'left center',color:dark?ivory:ink,textShadow:'0 2px 4px #042332b0',pointerEvents:'none'}}>{children}</div>;
}
const note:React.CSSProperties={fontSize:29,lineHeight:1.5,letterSpacing:.7,fontWeight:500};
const large:React.CSSProperties={fontSize:64,lineHeight:1.2,fontWeight:700,letterSpacing:-1.4,fontVariantNumeric:'tabular-nums'};
function SourceLine({children,dark=false}:{children:React.ReactNode;dark?:boolean}){return <div style={{...note,marginTop:25,color:dark?'#b5d7d9':muted}}>{children}</div>}

function Demand({s}:{s:Shot}){
 const next=checklist.steps[s.local>6?1:0],changing=ease((s.local-6)/.7);
 return <EvidenceLane s={s} start={.4} end={11.7} role="demand-source">
  <div style={{fontSize:34,color:muted,marginBottom:25}}>一句需求，写回同一份清单</div>
  <div style={{display:'flex',alignItems:'baseline',gap:23}}>
   <span style={{...large,fontSize:91}}>{next.capacityMW}</span><span style={{fontSize:37}}>MW</span>
   <span style={{height:61,width:1,background:'#3d737850',margin:'0 15px'}}/>
   <span style={{fontSize:48,fontWeight:650,color:gold}}>{next.steelTargetTperMW}</span><span style={{fontSize:31}}>t/MW</span>
  </div>
  <div style={{fontSize:37,marginTop:30}}>水深 <span style={{fontWeight:650,color:gold}}>{next.waterDepthM} m</span><span style={{marginLeft:30,color:muted,fontSize:30}}>设计目标{changing>.5?'已更新':'已写入'}</span></div>
  <SourceLine>已保存网页记录 · 需求解析与持久化</SourceLine>
 </EvidenceLane>;
}

function Handoff({s,info}:{s:Shot;info?:ContinuousInfoV16}){
 const current=Math.min(2,Math.floor(Math.max(0,s.local-.7)/1.5));
 return <>
  <EvidenceLane s={s} start={.3} end={8.6} dark role="file-handoff">
   <div style={{display:'flex',gap:24,alignItems:'center',marginTop:9}}>{['几何','网格','BESO'].map((name,i)=><React.Fragment key={name}>{i>0&&<span style={{fontSize:35,color:'#bfd6d1'}}>→</span>}<div style={{transform:`translateY(${i===current?-7:0}px)`,color:i===current?'#f2c691':'#e0ebe7'}}><div style={{fontSize:44,fontWeight:i===current?700:500}}>{name}</div><div style={{fontSize:28,marginTop:18,opacity:.73}}>{['STEP','INP','VTK'][i]}</div></div></React.Fragment>)}</div>
   <div style={{height:2,width:650,background:'#bad7d040',marginTop:30,position:'relative'}}><div style={{position:'absolute',top:-4,width:10,height:10,borderRadius:10,background:'#f6cd91',boxShadow:'0 0 20px #edb76c',left:640*ease((s.local-.7)/5)}}/></div>
   <SourceLine dark>文件接力 · 独立 BESO 保存案例</SourceLine>
  </EvidenceLane>
  <EvidenceLane s={s} start={8.6} dark role="beso-saved-evidence">
   <div style={{...note,color:'#bbd8d5'}}>材料沿着受力路径留下</div>
   <div style={{...large,fontSize:92,marginTop:22}}>{((info?.fraction??1)*100).toFixed(1)}<span style={{fontSize:42,marginLeft:8}}>%</span></div>
   <div style={{fontSize:37,marginTop:23}}>保留体积 · 第 {info?.iteration??0} 次迭代</div>
   <SourceLine dark>独立 BESO 保存结果</SourceLine>
  </EvidenceLane>
 </>;
}

function Physics({s,info}:{s:Shot;info?:ContinuousInfoV16}){
 if(!info)return null;
 const cable=s.local>=5.3,dark=info.underwater>.45,anchor=cable?info.fairlead:info.platform;
 const hasAnchor=info.underwater<.2&&anchor.visible&&anchor.x>990&&anchor.x<1810&&anchor.y>430&&anchor.y<900;
 const alpha=ease((s.local-.7)/.6)*(1-ease((s.local-8.15)/.6));
 return <>
  <EvidenceLane s={s} start={.2} end={8.8} dark={dark} role="physical-response">
   <div style={{fontSize:39,fontWeight:600}}>{cable?'1号缆张力':'平台纵荡'}</div>
   <div style={{...large,fontSize:100,marginTop:22,color:dark?'#f3ca93':gold}}>{cable?(info.lineTension/1000).toFixed(0):info.native.surge.toFixed(2)}<span style={{fontSize:42,marginLeft:18}}>{cable?'kN':'m'}</span></div>
   <SourceLine dark={dark}>独立 Zwind 回放 · 波面示意</SourceLine>
  </EvidenceLane>
  <EvidenceLane s={s} start={8.8} role="response-constraint"><div style={{fontSize:48,fontWeight:650,lineHeight:1.45}}>运动与张力<br/>一起回到设计约束</div></EvidenceLane>
  {hasAnchor&&alpha>0&&<svg data-qa="physics-anchor" width="1920" height="1080" style={{position:'absolute',inset:0,zIndex:29,opacity:alpha,pointerEvents:'none'}}><path d={`M740 570 Q 885 570 ${anchor.x} ${anchor.y}`} stroke={dark?'#eac690':'#ad713f'} strokeWidth="2.3" fill="none"/><circle cx={anchor.x} cy={anchor.y} r="6" fill={dark?'#ffe0aa':'#ad713f'}/></svg>}
 </>;
}

function Feedback({s}:{s:Shot}){
 return <>
  <EvidenceLane s={s} start={.3} end={4.1} role="failure-log">
   <div style={{fontSize:48,fontWeight:650,color:gold}}>求解未收敛</div>
   <div style={{fontSize:31,marginTop:25,color:muted}}>残差停滞 · 保存日志</div>
   <div style={{...large,marginTop:20}}>1.2 × 10⁻³</div>
   <SourceLine>读取失败原因，带回下一轮任务</SourceLine>
  </EvidenceLane>
  <EvidenceLane s={s} start={4.1} end={8.3} role="replan-source">
   <div style={{fontSize:36,color:muted}}>迭代上限</div>
   <div style={{...large,fontSize:84,marginTop:25}}>{replan.iterationLimitBefore}<span style={{fontSize:44,color:muted,margin:'0 25px'}}>→</span><span style={{color:gold}}>{replan.iterationLimitAfter}</span></div>
   <SourceLine>参数调整与失败原因，一并保留</SourceLine>
  </EvidenceLane>
  <EvidenceLane s={s} start={8.3} role="awaiting-review"><div style={{fontSize:56,fontWeight:650}}>下一轮 · 等待复查</div><SourceLine>保存的重规划状态</SourceLine></EvidenceLane>
 </>;
}

function Review({s}:{s:Shot}){
 return <>
  <EvidenceLane s={s} start={.3} end={8.4} role="actual-viewer" top={392}>
   <div style={{fontSize:29,color:muted,marginBottom:16}}>真实查看器 · 已保存画面</div>
   <div style={{width:680,height:316,overflow:'hidden',borderRadius:3,boxShadow:'0 25px 60px #102d3430',transform:'perspective(1500px) rotateY(-5deg) rotateX(3deg)',border:'1px solid #d3e3df90'}}><Img src={staticFile('beso-research/web-live/v12/geometry-model.png')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'center'}}/></div>
   <SourceLine>{s.local<5.1?'检查连接，调整关键截面':'修改梁截面，几何交回任务'}</SourceLine>
  </EvidenceLane>
  <EvidenceLane s={s} start={8.4} role="invalidate-inputs"><div style={{fontSize:39,color:muted,textDecoration:'line-through'}}>旧网格 · 旧载荷</div><div style={{fontSize:58,fontWeight:650,marginTop:24,color:gold}}>按新几何，重新生成</div><SourceLine>人的判断，交回同一个任务</SourceLine></EvidenceLane>
 </>;
}

function Proof({s}:{s:Shot}){
 return <>
  <EvidenceLane s={s} start={.3} end={6.7} role="delivery-files"><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'32px 24px',width:680}}>{['模型','计算输入','日志','报告'].map((name,i)=><div key={name} style={{fontSize:43,fontWeight:550,transform:`translateY(${24*(1-ease((s.local-.6-i*.55)/.7))}px)`,opacity:ease((s.local-.6-i*.55)/.7),borderBottom:'1px solid #42676f50',paddingBottom:19}}><span style={{color:gold,marginRight:19,fontSize:29}}>0{i+1}</span>{name}</div>)}</div><SourceLine>方案与依据，一起带走</SourceLine></EvidenceLane>
  <EvidenceLane s={s} start={6.7} role="manuscript-evidence"><div style={{fontSize:31,color:muted}}>稿件案例 · 单位功率用钢量</div><div style={{...large,fontSize:65,marginTop:25}}>278 <span style={{fontSize:35,color:muted}}>→</span> 255.5 <span style={{fontSize:30}}>t/MW</span></div><div style={{fontSize:98,fontWeight:730,color:gold,marginTop:12,letterSpacing:-3}}>−8.1<span style={{fontSize:48}}>%</span></div><SourceLine>图强号参考 → 案例方案</SourceLine></EvidenceLane>
 </>;
}

function Caption({frame}:{frame:number}){
 const ms=frame/fps*1000,c=captions.find(c=>ms>=c.startMs&&ms<c.endMs);if(!c)return null;
 const alpha=Math.min(ease((ms-c.startMs)/100),ease((c.endMs-ms)/100));
 const paper=paperToneV16(frame/fps);
 return <div data-qa="caption" style={{position:'absolute',bottom:0,left:0,right:0,height:136,zIndex:95,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 140px 25px',background:`linear-gradient(transparent,rgba(6,25,37,${.06*(1-paper)}) 20%,rgba(6,25,37,${.52*(1-paper)}))`,opacity:alpha}}><span style={{fontSize:43,fontWeight:550,letterSpacing:.7,color:blendInkV16(paper),lineHeight:1.3,textShadow:`0 2px 4px rgba(5,29,39,${1-paper}),0 0 14px rgba(5,41,52,${.5*(1-paper)}),0 1px 3px rgba(255,255,255,${paper*.45})`,textAlign:'center',maxWidth:1510}}>{c.text}</span></div>;
}
function Brand({white}:{white:number}){return <div data-qa="brand" style={{position:'absolute',right:54,top:35,width:310,height:77,zIndex:86,pointerEvents:'none'}}><div style={{position:'absolute',inset:'-10px -12px',background:'radial-gradient(ellipse,rgba(250,252,247,.38),transparent 72%)',opacity:1-white}}/><Img src={staticFile('brand/zju-horizontal-mark.svg')} style={{position:'absolute',inset:0,width:310,height:77,objectFit:'contain',opacity:1-white,filter:'drop-shadow(0 0 2px #ffffff)'}}/><Img src={staticFile('brand/zju-horizontal-mark.svg')} style={{position:'absolute',inset:0,width:310,height:77,objectFit:'contain',opacity:white,filter:'brightness(0) invert(1) drop-shadow(0 1px 2px #082a38)'}}/></div>}

export const LaunchFilmV16:React.FC<{audio?:boolean;overlay?:boolean;qa?:boolean;blueprint?:boolean}>=({audio=true,overlay=true,qa=false,blueprint=false})=>{
 const frame=useCurrentFrame(),s=shotAt(frame),[info,setInfo]=useState<ContinuousInfoV16>();
 const bridge=bridgeCoverageV16(frame),submersion=info?.underwater??0;
 const evidenceCover=s.id==='brief'?Math.max(bridge,ease((s.time-16.5)/.16))*(1-ease((s.time-19.9)/.4)):bridge;
 useLayoutEffect(()=>{if(!qa||!info)return;const canvas=document.querySelector('canvas');if(!canvas)return;const c=canvas.getBoundingClientRect(),scale=1920/c.width;const boxes=Array.from(document.querySelectorAll('[data-qa]')).map(el=>{const r=el.getBoundingClientRect();return{role:el.getAttribute('data-qa'),text:el.textContent?.slice(0,160),x:(r.x-c.x)*scale,y:(r.y-c.y)*scale,width:r.width*scale,height:r.height*scale}});console.log('LAYOUT_QA '+JSON.stringify({frame,scene:s.id,boxes,camera:info.camera,native:info.native}))},[frame,info,qa]);
 return <AbsoluteFill style={{fontFamily:'Microsoft YaHei, Noto Sans CJK SC, sans-serif',background:'#9ebbc4',color:ink,overflow:'hidden'}}>
  <World time={s.time} onInfo={setInfo} blueprint={blueprint}/>
  {!blueprint&&overlay&&<><BridgePreludeV16/><GeneratedLaunchBridgesV16/></>}
  {!blueprint&&<AbsoluteFill style={{zIndex:9,pointerEvents:'none',background:'radial-gradient(ellipse at 60% 43%,transparent 40%,rgba(8,29,39,.20) 100%)'}}/>}
  {overlay&&<>
   <div style={{position:'absolute',inset:0,zIndex:24,opacity:1-evidenceCover,pointerEvents:'none'}}>
    <div style={{position:'absolute',left:0,top:385,width:1010,height:565,background:'radial-gradient(ellipse at 30% 38%,rgba(6,31,42,.30),transparent 74%)',opacity:['hero','close'].includes(s.id)?0:1}}/>
    {s.id==='brief'&&<Demand s={s}/>}{s.id==='topology'&&<Handoff s={s} info={info}/>}{s.id==='physics'&&<Physics s={s} info={info}/>}{s.id==='interaction'&&<Feedback s={s}/>}{s.id==='toolchain'&&<Review s={s}/>}{s.id==='proof'&&<Proof s={s}/>}
   </div>
   <OceanTypographyV16 frame={frame} phase={s.id} localSeconds={s.local} durationSeconds={s.seconds} underwater={submersion} anchor={info?.platform}/>
   <Brand white={ease((s.time-59.5)/.5)*(1-ease((s.time-79)/.5))}/><Caption frame={frame}/>
  </>}
  {audio&&<Audio src={staticFile('audio/launch-v16-master.wav')}/>}
 </AbsoluteFill>;
};
