import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,OffthreadVideo,Sequence,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import story from './launch-v5-story.json';
import captions from './launch-v5-captions.json';
import {ContinuousInfo,ContinuousLaunchWorld} from './beso/ContinuousLaunchWorld';
import response from '../public/beso-research/physics/zwind-response.json';
import {GeneratedLaunchBridgesV6,launchBridgeCoverageV6} from './beso/GeneratedLaunchBridgesV6';

const fps=60,durationInFrames=6300;
const ink='#102c3c',muted='#3e5b66',brass='#a66537';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const q=clamp(x);return q*q*q*(q*(6*q-15)+10)};
type Id='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
const scenes=story.scenes as {id:Id;start:number;duration:number}[];
type State={id:Id;time:number;local:number;duration:number;start:number};
const stateAt=(f:number):State=>{const s=scenes[Math.max(0,scenes.findLastIndex(s=>f>=s.start))];return{id:s.id,time:f/fps,local:(f-s.start)/fps,duration:s.duration/fps,start:s.start}};
const visibility=(s:State,delay=0)=>ease((s.local-delay)/.8)*(s.id==='close'?1:1-ease((s.local-s.duration+.5)/.5));

function Stage({time,onInfo}:{time:number;onInfo:(i:ContinuousInfo)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<ContinuousLaunchWorld|null>(null),ready=useRef(false),latest=useRef(time);latest.current=time;
 const [handle]=useState(()=>delayRender('Load continuous native engineering world'));
 useLayoutEffect(()=>{const w=new ContinuousLaunchWorld(canvas.current!,staticFile(''));world.current=w;w.ready.then(()=>{ready.current=true;w.render(latest.current);onInfo(w.info);continueRender(handle)}).catch(cancelRender);return()=>{ready.current=false;w.dispose();world.current=null}},[]);
 useLayoutEffect(()=>{if(ready.current&&world.current){world.current.render(time);onInfo(world.current.info)}},[time]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}
const heads:Record<Id,[string,string]>={
 hero:['AI Engineer','让工程需求，接上真实计算'],
 brief:['需求，成为任务','目标与约束 → 参数与工具'],
 topology:['材料的取舍\n交给计算','Geometry → Mesh → BESO'],
 physics:['把结构\n放回风浪中','Z-wind · 保存响应回放'],
 interaction:['失败，推动下一步','读取日志 → 调整任务'],
 toolchain:['连接工具\n也连接判断','AI Engineer'],
 proof:['方案，留得下依据','同工况 · 单位功率用钢量'],
 close:['AI Engineer','让智能连接工具，让计算提供依据'],
};
function Heading({s}:{s:State}){
 const [title,sub]=heads[s.id],v=visibility(s,.1),hero=s.id==='hero'||s.id==='close';
 return <div data-qa="title" style={{position:'absolute',left:90,top:245,width:680,color:ink,zIndex:30,pointerEvents:'none',opacity:v}}>
  {title.split('\n').map((line,i)=><div key={line} style={{overflow:'hidden'}}><div style={{fontSize:hero?102:74,lineHeight:1.2,fontWeight:740,letterSpacing:hero?-3:-1.4,transform:`translateY(${36*(1-ease((s.local-.1-i*.08)/.8))}px)`}}>{line}</div></div>)}
  <div style={{fontSize:36,fontWeight:500,lineHeight:1.45,marginTop:24,color:muted,maxWidth:630}}>{sub}</div>
 </div>;
}

function ActualInterface({s}:{s:State}){
 if(s.id!=='brief'&&s.id!=='interaction')return null;
 const intro=s.id==='brief',delay=intro?1.15:.7;
 const entry=ease((s.local-delay)/1.1),exit=ease((s.local-s.duration+1.6)/1.6);
 const width=990,teal='#126b79',videoStart=s.start+Math.round((intro?1.65:.9)*fps);
 // Pull back before the recorded orbit turns the long column toward the
 // viewport bottom. Keep end faces inside the crop throughout 59-64s.
 const viewerScale=1-.28*ease((s.local-6)/1.8);
 const parameterStart=[3.6,4.35,5.1,5.85];
 const parameters=[['目标','20 MW'],['海况','场址条件'],['材料','材料参数'],['约束','质量约束']];
 const tools=['Geometry','Mesh','BESO','Z-wind'];
 // This is one focused recording, not a fabricated product dashboard. The
 // real draft is typed in the local composer; no request is submitted. The
 // four terms and tool hand-off below are explicitly a narrative extraction.
 // Recorded viewer chrome/empty charts are cropped at capture time, leaving
 // only the existing imported geometry and real viewport controls.
 return <div data-qa="real-interface" style={{position:'absolute',left:82,top:intro?433:412,width,zIndex:29,transform:`translate3d(${-1250*(1-entry)-1250*exit}px,${10*(1-entry)-8*exit}px,0)`,perspective:2800,pointerEvents:'none'}}>
  <div style={{transform:`rotateY(${-2.3+1.1*entry-1.2*exit}deg) rotateX(.4deg)`,transformOrigin:'left center',overflow:'hidden',borderRadius:8,boxShadow:'9px 18px 37px rgba(17,51,66,.10)',border:'1px solid rgba(255,255,255,.82)',background:'#f7fafb',lineHeight:1.2}}>
   <div style={{height:54,display:'flex',alignItems:'center',justifyContent:'space-between',padding:'0 28px',borderBottom:'1px solid #dce7e9',color:ink}}>
    <span style={{fontSize:29,fontWeight:650,letterSpacing:-.5}}>{intro?'AI Engineer · 工程需求':'AI Engineer · 三维结果查看'}</span>
    <span style={{fontSize:25,color:muted}}>{intro?'真实输入 · 未提交':'保存模型 · 实际操作'}</span>
   </div>
   <div style={{height:intro?198:400,overflow:'hidden',position:'relative',background:intro?'#f8fbfc':'#071523'}}>
    {s.time<videoStart/fps&&<Img src={staticFile(`beso-research/web-live/${intro?'brief-focused-v5':'interaction-focused-v5'}-first.png`)} style={{display:'block',width,height:intro?198:545,objectFit:'cover',transform:intro?'none':`translateY(-72px) scale(${viewerScale})`,transformOrigin:'center center',filter:intro?'none':'saturate(.78) brightness(1.10)'}}/>}
    <Sequence from={videoStart} layout="none"><OffthreadVideo muted src={staticFile(`beso-research/web-live/${intro?'brief-focused-v5':'interaction-focused-v5'}.mp4`)} style={{display:'block',width,height:intro?198:545,objectFit:'cover',transform:intro?'none':`translateY(-72px) scale(${viewerScale})`,transformOrigin:'center center',filter:intro?'none':'saturate(.78) brightness(1.10)'}}/></Sequence>
   </div>
   {intro?<>
    <div style={{display:'flex',padding:'8px 27px 16px',gap:16,borderTop:'1px solid #e2ebed'}}>
     {parameters.map(([label,value],i)=>{const progress=ease((s.local-parameterStart[i])/.65),active=progress*(1-ease((s.local-parameterStart[i]-1.2)/.7));return <div key={label} style={{flex:1,minWidth:0,position:'relative',padding:'13px 12px 11px',color:ink,background:`rgba(18,107,121,${.025+.09*active})`}}>
      <div style={{fontSize:28,color:muted,marginBottom:8}}>{label}</div>
      <div style={{fontSize:32,fontWeight:600,whiteSpace:'nowrap'}}>{value}</div>
      <div style={{position:'absolute',left:12,right:12,bottom:0,height:3,background:'#d4e2e5'}}><div style={{height:3,width:`${progress*100}%`,background:teal}}/></div>
     </div>})}
    </div>
    <div style={{display:'flex',alignItems:'center',padding:'16px 28px 22px',gap:18,color:ink}}>
     <span style={{fontSize:25,color:muted,marginRight:5,whiteSpace:'nowrap'}}>工作流示意</span>
     {tools.map((tool,i)=>{const lit=ease((s.local-6.1-i*.35)/.5);return <React.Fragment key={tool}>{i>0&&<span style={{fontSize:27,color:'#8aa6ae'}}>→</span>}<span style={{fontSize:31,fontWeight:580,color:lit>.5?teal:'#748991',borderBottom:`2px solid rgba(18,107,121,${lit})`,paddingBottom:5}}>{tool}</span></React.Fragment>})}
    </div>
   </>:<div style={{height:59,display:'flex',alignItems:'center',padding:'0 28px',gap:22,color:muted,borderTop:'1px solid #dde8ea',fontSize:28}}><span style={{color:teal,fontWeight:600}}>输入文件</span><span style={{fontSize:29}}>parameters_summary.json</span><span style={{marginLeft:'auto',fontSize:25}}>模型回放</span></div>}
  </div>
 </div>;
}
function BESO({s,info}:{s:State;info?:ContinuousInfo}){
 const nativeWeight=1-launchBridgeCoverageV6(useCurrentFrame());
 if(s.id!=='topology')return null;const v=visibility(s,1.6)*nativeWeight;
 return <div data-qa="beso-stat" style={{position:'absolute',left:94,top:548,width:500,zIndex:32,color:ink,opacity:v}}>
  <div style={{fontSize:34,color:muted}}>设计域 · 保存状态回放</div>
  <div style={{display:'flex',alignItems:'baseline',gap:15,marginTop:18,fontVariantNumeric:'tabular-nums'}}><span style={{fontSize:104,fontWeight:700,letterSpacing:-3}}>{((info?.fraction??1)*100).toFixed(1)}</span><span style={{fontSize:42}}>%</span></div>
  <div style={{fontSize:36,color:muted,marginTop:4}}>实体保留体积</div>
  <div style={{height:3,width:400,background:'#bfcdd0',marginTop:24}}><div style={{height:3,width:`${(info?.fraction??1)*100}%`,background:brass}}/></div>
  <div style={{fontSize:34,color:muted,marginTop:24}}>第 {info?.iteration??0} 次迭代</div>
 </div>;
}
const rows=response.records.filter((_,i)=>i%8===0),lo=Math.min(...rows.map(r=>r.platform[0])),hi=Math.max(...rows.map(r=>r.platform[0]));
const px=(t:number)=>10+444*t/120,py=(v:number)=>118-90*(v-lo)/(hi-lo),wavePath=rows.map((r,i)=>`${i?'L':'M'}${px(r.t)} ${py(r.platform[0])}`).join(' ');
function Physics({s,info}:{s:State;info?:ContinuousInfo}){
 const nativeWeight=1-launchBridgeCoverageV6(useCurrentFrame());
 if(s.id!=='physics'||!info)return null;
 const n=info.native,v=visibility(s,1)*nativeWeight,tension=s.time>=42&&s.time<49.8;
 return <div data-qa="response" style={{position:'absolute',left:94,top:541,width:510,zIndex:32,color:ink,opacity:v}}>
  <div style={{fontSize:34,color:muted}}>{tension?'系泊张力 · 1 号线':'纵荡 · 时程响应'}</div>
  <div style={{display:'flex',gap:16,alignItems:'baseline',marginTop:16,fontVariantNumeric:'tabular-nums'}}><span style={{fontSize:94,fontWeight:700,letterSpacing:-3}}>{tension?(info.lineTension/1000).toFixed(0):n.surge.toFixed(2)}</span><span style={{fontSize:42}}>{tension?'kN':'m'}</span></div>
  {!tension&&<svg width="464" height="152" viewBox="0 0 464 152" style={{display:'block',marginTop:17}}><path d={wavePath} fill="none" stroke="#355c69" strokeWidth="3.5"/><line x1={px(n.time)} x2={px(n.time)} y1="10" y2="128" stroke={brass} strokeWidth="2"/><circle cx={px(n.time)} cy={py(n.surge)} r="6" fill={brass}/></svg>}
  {tension&&<div style={{fontSize:36,color:muted,lineHeight:1.6,marginTop:16}}>缆绳连接浮体与锚点</div>}
  <div style={{fontSize:30,color:muted,marginTop:tension?31:8}}>saved response / visual wave</div>
 </div>;
}
function TensionLeader({s,info}:{s:State;info?:ContinuousInfo}){
 const nativeWeight=1-launchBridgeCoverageV6(useCurrentFrame());
 if(s.id!=='physics'||s.time<42||s.time>=49.8||!info?.fairlead.visible)return null;
 const p=info.fairlead,v=ease((s.time-42)/.6)*(1-ease((s.time-49.2)/.6))*nativeWeight;
 return <svg data-qa="force-anchor" width="1920" height="1080" style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:26,opacity:v}}><path d={`M 590 631 L 716 631 L ${p.x} ${p.y}`} fill="none" stroke={brass} strokeWidth="2.5"/><circle cx={p.x} cy={p.y} r="5.5" fill={brass}/></svg>;
}
function Process({s}:{s:State}){
 if(s.id!=='toolchain')return null;
 const steps=['任务调度','结果读取','工程师复查'],index=Math.min(2,Math.floor(Math.max(0,s.local-1.2)/3.7));
 return <div data-qa="process" style={{position:'absolute',left:94,top:565,width:600,zIndex:32,opacity:visibility(s,1)}}>
  {steps.map((w,i)=><div key={w} style={{display:'flex',alignItems:'center',gap:22,marginTop:i?29:0,color:i===index?ink:'#6d838a',fontSize:43,fontWeight:i===index?680:450}}><div style={{width:5,height:38,background:i===index?brass:'#c0ced0'}}/>{w}</div>)}
 </div>;
}
function Comparison({s}:{s:State}){
 if(s.id!=='proof')return null;const v=visibility(s,.65),reduction=s.local>=8.5;
 return <div data-qa="comparison" style={{position:'absolute',left:94,top:514,width:565,zIndex:32,color:ink,opacity:v}}>
  {reduction?<><div style={{fontSize:34,color:muted}}>论文案例 · 同工况对照</div><div style={{fontSize:114,fontWeight:700,letterSpacing:-5,marginTop:22,color:brass}}>−8.1<span style={{fontSize:48,letterSpacing:0}}>%</span></div><div style={{fontSize:39,marginTop:14}}>单位功率用钢量</div></>:<>{[['图强号',278,'#7b9199'],['案例方案',255.5,ink]].map(([name,value,color])=><div key={name} style={{marginTop:31}}><div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',fontSize:35}}><span>{name}</span><span style={{fontSize:56,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{value}<span style={{fontSize:31,fontWeight:450}}> t/MW</span></span></div><div style={{height:10,background:'#d5dfe1',marginTop:17}}><div style={{height:10,width:`${Number(value)/278*100*ease((s.local-1)/1.6)}%`,background:String(color)}}/></div></div>)}</>}
 </div>;
}
function Endline({s}:{s:State}){
 if(s.id!=='close')return null;
 return <div data-qa="closing" style={{position:'absolute',left:94,top:602,color:muted,zIndex:32,fontSize:40,opacity:visibility(s,1.6)}}>需求 <span style={{color:brass,margin:'0 12px'}}>→</span> 模型 <span style={{color:brass,margin:'0 12px'}}>→</span> 计算 <span style={{color:brass,margin:'0 12px'}}>→</span> 复查</div>;
}
function Caption(){const f=useCurrentFrame(),ms=f/fps*1000,c=captions.find(c=>ms>=c.startMs&&ms<c.endMs);return c?<div data-qa="caption" style={{position:'absolute',bottom:0,left:0,right:0,height:128,zIndex:90,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 95px 24px',background:'linear-gradient(180deg,transparent,rgba(6,25,38,.12) 35%,rgba(6,25,38,.48))'}}><span style={{fontSize:44,fontWeight:500,color:'#fbfdfd',lineHeight:1.45,textShadow:'0 2px 4px rgba(5,22,31,.7)',textAlign:'center'}}>{c.text}</span></div>:null}

export const LaunchFilmV5:React.FC<{audio?:boolean;overlay?:boolean;qa?:boolean}>=({audio=true,overlay=true,qa=false})=>{
 const frame=useCurrentFrame(),s=useMemo(()=>stateAt(frame),[frame]),[info,setInfo]=useState<ContinuousInfo>();
 useLayoutEffect(()=>{if(!qa||!info)return;const canvas=document.querySelector('canvas');if(!canvas)return;const c=canvas.getBoundingClientRect(),scale=1920/c.width;const boxes=Array.from(document.querySelectorAll('[data-qa]')).map(el=>{const r=el.getBoundingClientRect();return {role:el.getAttribute('data-qa'),text:el.textContent?.slice(0,180),x:(r.x-c.x)*scale,y:(r.y-c.y)*scale,width:r.width*scale,height:r.height*scale}});console.log('LAYOUT_QA '+JSON.stringify({frame,scene:s.id,boxes,camera:info.camera,native:info.native}))},[frame,info,qa]);
 return <AbsoluteFill style={{fontFamily:'Microsoft YaHei, Noto Sans CJK SC, sans-serif',background:'#e7eff1',overflow:'hidden'}}><Stage time={s.time} onInfo={setInfo}/>{overlay&&<><GeneratedLaunchBridgesV6/>
  <div style={{position:'absolute',inset:0,zIndex:20,pointerEvents:'none',background:'linear-gradient(90deg,rgba(237,244,245,.98) 0%,rgba(237,244,245,.96) 26%,rgba(237,244,245,.62) 39%,rgba(237,244,245,0) 55%)'}}/>
  <Img data-qa="brand" src={staticFile('brand/zju-horizontal-mark.svg')} style={{position:'absolute',right:58,top:35,width:300,height:77,objectFit:'contain',zIndex:80,filter:'drop-shadow(0 0 4px rgba(242,249,250,.95))'}}/>
  <Heading s={s}/><ActualInterface s={s}/><BESO s={s} info={info}/><Physics s={s} info={info}/><TensionLeader s={s} info={info}/><Process s={s}/><Comparison s={s}/><Endline s={s}/><Caption/>
 </>}{audio&&<Audio src={staticFile('audio/launch-v5-master.wav')}/>}</AbsoluteFill>;
};
export {fps,durationInFrames};
