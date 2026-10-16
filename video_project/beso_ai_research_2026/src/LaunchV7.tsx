import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,OffthreadVideo,Sequence,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import story from './launch-v7-story.json';
import captions from './launch-v7-captions.json';
import {ContinuousLaunchWorldV7} from './beso/ContinuousLaunchWorldV7';
import {sampleV7Camera} from './beso/LaunchV7Camera';
import type {ContinuousInfo} from './beso/ContinuousLaunchWorld';
import {ProductValueV7} from './beso/ProductValueV7';
import response from '../public/beso-research/physics/zwind-response.json';
import {GeneratedLaunchBridgesV7,launchBridgeCoverageV7} from './beso/GeneratedLaunchBridgesV7';

const fps=60,durationInFrames=6300;
const ink='#102d3d',teal='#166f7c',copper='#b97147';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const q=clamp(x);return q*q*q*(q*(6*q-15)+10)};
// Typography follows the same camera immersion as the world, including the
// return above the waterline; a fixed time window left white type on sky.
// After the close inspection passes the light tower, select one opaque theme.
// Mixing white and dark glyphs made a low-contrast grey at 76.5 seconds.
const lightTypeWeight=(s:State)=>s.id==='physics'?1-ease((sampleV7Camera(s.time).position.y+.10)/1.40):s.id==='toolchain'?ease((s.local-.6)/.4)*(s.local<11.25?1:0):0;
const blendInk=(w:number)=>`rgb(${Math.round(16+232*w)},${Math.round(45+206*w)},${Math.round(61+188*w)})`;
type Id='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
type State={id:Id;start:number;time:number;local:number;duration:number;title:string};
const scenes=story.scenes as {id:Id;start:number;duration:number;title:string}[];
function stateAt(f:number):State{const s=scenes[Math.max(0,scenes.findLastIndex(s=>f>=s.start))];return{...s,time:f/fps,local:(f-s.start)/fps,duration:s.duration/fps}}
function Stage({time,onInfo,blueprint=false}:{time:number;onInfo:(i:ContinuousInfo)=>void;blueprint?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<ContinuousLaunchWorldV7|null>(null),ready=useRef(false),latest=useRef(time);latest.current=time;
 const [handle]=useState(()=>delayRender('Load launch v7 physical assets'));
 useLayoutEffect(()=>{const w=new ContinuousLaunchWorldV7(canvas.current!,staticFile(''));world.current=w;w.ready.then(()=>{ready.current=true;blueprint?w.renderBlueprint(latest.current):w.render(latest.current);onInfo(w.info);continueRender(handle)}).catch(cancelRender);return()=>{ready.current=false;w.dispose();world.current=null}},[]);
 useLayoutEffect(()=>{if(ready.current&&world.current){blueprint?world.current.renderBlueprint(time):world.current.render(time);onInfo(world.current.info)}},[time,blueprint]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}
function Heading({s}:{s:State}){
 const right=['brief','interaction','toolchain','proof'].includes(s.id),close=s.id==='close';
 const x=close?80:right?1035:80,y=close?205:s.id==='hero'?172:right?150:180;
 const enter=ease((s.local-.15)/.85),exit=close?0:ease((s.local-s.duration+.8)/.8);
 const title=s.title.split('\n'),underwater=lightTypeWeight(s);
 return <div data-qa="title" style={{position:'absolute',left:x+(right?1050:-950)*(1-enter+exit),top:y,width:close?1000:780,zIndex:82,color:blendInk(underwater),pointerEvents:'none',textShadow:underwater>.5?'0 1px 3px rgba(7,30,43,.4)':'0 1px 12px rgba(241,248,247,.45)'}}>
  <div style={{fontSize:29,letterSpacing:2.5,fontWeight:600,color:underwater>.5?'#cce9e6':teal,marginBottom:15}}>{s.id==='hero'?'AI Engineer · 工程任务':close?'工程任务，从这里开始':'AI Engineer'}</div>
  {title.map(line=><div key={line} style={{fontSize:close?108:s.id==='hero'?88:right?66:74,lineHeight:1.18,fontWeight:700,letterSpacing:close?-3:-1.5}}>{line}</div>)}
 </div>;
}
function Topology({s,info}:{s:State;info?:ContinuousInfo}){
 if(s.id!=='topology')return null;
 const enter=ease((s.local-.4)/1),exit=ease((s.local-s.duration+1)/1);
 return <div data-qa="beso-evidence" style={{position:'absolute',left:90-800*(1-enter+exit),top:425,width:610,zIndex:33,color:'#f8fbf9',textShadow:'0 1px 3px rgba(7,30,43,.5)',padding:'20px',lineHeight:1.18}}>
  <div style={{fontSize:35,fontWeight:580}}>BESO · 真实保存状态</div>
  <div style={{fontSize:90,fontWeight:700,letterSpacing:-3,marginTop:18,fontVariantNumeric:'tabular-nums'}}>{((info?.fraction??1)*100).toFixed(1)}<span style={{fontSize:45,marginLeft:8}}>%</span></div>
  <div style={{fontSize:34,marginTop:6}}>保留体积比例</div>
  <div style={{fontSize:33,marginTop:26}}>第 {info?.iteration??0} 次迭代 · 四个采样状态</div>
  <div style={{fontSize:30,marginTop:15}}>独立静力算例，保存回放</div>
  <div data-qa="task-file-handoff" style={{marginTop:24,transform:`translateX(${-760*(1-ease((s.local-7.6)/.8))}px)`}}>
   <svg width="555" height="81" viewBox="0 0 555 81">
    <path d="M20 56 H505" stroke="#a2bfca" strokeWidth="2" fill="none"/>
    {['建模','网格','BESO','尺寸'].map((name,i)=><g key={name} transform={`translate(${25+i*155},56)`}><circle r="6" fill="#f0cf9f"/><text y="-24" x="0" fill="#f4faf8" fontSize="33" textAnchor={i===0?'start':i===3?'end':'middle'}>{name}</text></g>)}
    <g transform={`translate(${25+465*ease((s.local-8.7)/5.8)},56)`}><path d="M-9 -11 H4 L10 -5 V11 H-9 Z" fill="#f0cf9f" stroke="#214c61" strokeWidth="1.5"/><path d="M3 -10 V-4 H9" fill="none" stroke="#214c61" strokeWidth="1.5"/></g>
   </svg>
   <div style={{fontSize:30,color:'#f0cf9f'}}>工具编排示意 · 文件沿任务传递</div>
  </div>
 </div>;
}
const rows=response.records.filter((_,i)=>i%8===0),lo=Math.min(...rows.map(r=>r.platform[0])),hi=Math.max(...rows.map(r=>r.platform[0]));
const px=(t:number)=>10+400*t/120,py=(v:number)=>108-82*(v-lo)/(hi-lo),wave=rows.map((r,i)=>`${i?'L':'M'}${px(r.t)} ${py(r.platform[0])}`).join(' ');
function Physics({s,info}:{s:State;info?:ContinuousInfo}){
 if(s.id!=='physics'||!info)return null;
 const tension=s.local>=4.5&&s.local<10.5,anchor=tension?info.fairlead:info.platform;
 const enter=ease((s.local-.55)/.8),exit=ease((s.local-s.duration+.75)/.75);
 const x=105,y=510,n=info.native;
 const constraints=s.local>=7.3;
 return <>
  <div data-qa="response" style={{position:'absolute',left:x-850*(1-enter+exit),top:y,width:565,zIndex:34,color:'#f8fbf9',padding:'27px 31px 30px',textShadow:'0 1px 3px rgba(7,30,43,.5)'}}>
   <div style={{fontSize:35,fontWeight:600}}>Z-wind · {tension?'系泊张力':'纵荡响应'}</div>
   <div style={{fontSize:83,fontWeight:700,letterSpacing:-3,marginTop:15,fontVariantNumeric:'tabular-nums'}}>{tension?(info.lineTension/1000).toFixed(0):n.surge.toFixed(2)}<span style={{fontSize:40,marginLeft:15,letterSpacing:0}}>{tension?'kN':'m'}</span></div>
   {!tension&&<svg width="428" height="132" viewBox="0 0 428 132" style={{marginTop:16}}><path d={wave} fill="none" stroke="#e6f2ed" strokeWidth="3.2"/><line x1={px(n.time)} x2={px(n.time)} y1="8" y2="114" stroke="#e9b777" strokeWidth="2"/><circle cx={px(n.time)} cy={py(n.surge)} r="6" fill="#e9b777"/></svg>}
   {tension&&<div style={{fontSize:36,lineHeight:1.55,marginTop:22}}>{constraints?<>运动 / 张力<br/>回到设计约束里检查</>:<>张力随保存响应变化<br/>绑定原有缆绳与连接点</>}</div>}
   <div style={{fontSize:30,marginTop:16}}>保存响应回放 · 视觉波面</div>
  </div>
  {anchor.visible&&s.local>1&&s.local<s.duration-1&&<svg data-qa="physical-anchor" width="1920" height="1080" style={{position:'absolute',inset:0,zIndex:27,pointerEvents:'none'}}><path d={`M 578 578 Q 678 575 ${anchor.x} ${anchor.y}`} fill="none" stroke={copper} strokeWidth="2.5"/><circle cx={anchor.x} cy={anchor.y} r="5" fill={copper}/></svg>}
 </>;
}
function Proof({s}:{s:State}){
 if(s.id!=='proof')return null;
 const enter=ease((s.local-.2)/1),exit=ease((s.local-s.duration+.9)/.9),handoff=ease((s.local-7.2)/.85);
 // The case result is fixed evidence. Reveal the whole result spatially;
 // counting from zero contradicts the simultaneously shown before/after pair.
 const reduction=(278-255.5)/278*100;
 const viewerEnter=ease((s.local-8.2)/.85),viewerExit=ease((s.local-s.duration+.9)/.9),viewerFrom=s.start+8.2*fps;
 return <><div data-qa="proof" style={{position:'absolute',left:1035+1100*(1-enter+exit+handoff),top:400,width:735,zIndex:35,color:'#f8fbf9',padding:'20px 10px',lineHeight:1.18,textShadow:'0 1px 3px rgba(7,30,43,.5)'}}>
  <div style={{fontSize:34}}>论文稿件案例 · 单位功率用钢量</div>
  <div style={{fontSize:102,fontWeight:700,letterSpacing:-4,marginTop:17,color:'#e9d1a9'}}>−{reduction.toFixed(1)}<span style={{fontSize:49,marginLeft:6}}>%</span></div>
  <div style={{display:'flex',gap:17,alignItems:'baseline',fontVariantNumeric:'tabular-nums',fontSize:53,marginTop:5,fontWeight:550}}><span>278</span><span style={{fontSize:36,color:'#e9d1a9'}}>→</span><span>255.5</span><span style={{fontSize:30,fontWeight:450}}>t/MW</span></div>
  <div style={{fontSize:32,marginTop:21}}>图强号参考值 → 案例方案</div>
  <div style={{marginTop:30,borderTop:'2px solid rgba(233,250,246,.5)',paddingTop:18,display:'flex',gap:25,fontSize:35,lineHeight:1.35,fontWeight:570}}>{['模型','输入','日志','报告'].map((w,i)=><span key={w} style={{transform:`translateX(${16*(1-ease((s.local-5.4-i*.35)/.6))}px)`}}>{w}</span>)}</div>
  <div style={{fontSize:30,lineHeight:1.35,marginTop:20}}>分别留档，按输入和工况复查</div>
 </div><div data-qa="real-viewer" style={{position:'absolute',left:1015+1100*(1-viewerEnter+viewerExit),top:395,width:770,zIndex:36,color:ink,perspective:1900,pointerEvents:'none'}}>
   <div style={{fontSize:32,fontWeight:600,color:teal,marginBottom:15,textShadow:'0 1px 8px #eff7f6'}}>保存模型 · 真实查看器操作</div>
   <div style={{width:770,height:413,overflow:'hidden',background:'#091c2b',transform:'rotateY(-2deg)',transformOrigin:'left center',boxShadow:'0 14px 27px rgba(16,40,53,.12)'}}>
    <Sequence from={Math.round(viewerFrom)} durationInFrames={Math.ceil((s.duration-8.2)*fps)} layout="none"><OffthreadVideo muted src={staticFile('beso-research/web-live/interaction-focused-v5.mp4')} style={{width:770,height:423.5,objectFit:'cover',transform:'scale(.91)',transformOrigin:'center'}}/></Sequence>
   </div>
   <div style={{fontSize:30,marginTop:18,fontWeight:550,color:'#f7faf8',textShadow:'0 1px 3px rgba(7,30,43,.5)'}}>已录制：导入参数 → 旋转查看</div>
  </div></>;
}
function Closing({s}:{s:State}){
 if(s.id!=='close')return null;
 return <div data-qa="cta" style={{position:'absolute',left:89,top:375,width:770,zIndex:35,color:ink}}><div style={{fontSize:51,lineHeight:1.4,fontWeight:600,transform:`translateX(${-1000*(1-ease((s.local-1.1)/.9))}px)`}}>带着你的设计目标<br/>让工程任务真正跑起来</div><div style={{fontSize:35,color:teal,marginTop:27,transform:`translateX(${-1000*(1-ease((s.local-2)/.9))}px)`}}>需求 → 模型 → 计算 → 复查</div></div>;
}
function InformationLight({s}:{s:State}){
 const left=s.id==='topology'||s.id==='physics',right=['brief','interaction','toolchain','proof'].includes(s.id);
 if(!left&&!right)return null;
 const v=ease((s.local-.25)/.8)*(1-ease((s.local-s.duration+.85)/.85));
 return <div style={{position:'absolute',left:0,right:0,top:385,bottom:124,zIndex:25,pointerEvents:'none',opacity:v,background:left?'linear-gradient(90deg,rgba(3,29,43,.61),rgba(3,29,43,.49) 22%,rgba(3,29,43,0) 43%)':'linear-gradient(90deg,transparent 45%,rgba(3,29,43,.53) 59%,rgba(3,29,43,.63) 94%,transparent)',maskImage:'linear-gradient(180deg,transparent,#000 11%,#000 88%,transparent)'}}/>;
}
function Brand({s}:{s:State}){
 const w=lightTypeWeight(s),style:React.CSSProperties={position:'absolute',right:54,top:35,width:310,height:77,objectFit:'contain',zIndex:85,pointerEvents:'none'};
 return <><Img data-qa="brand" src={staticFile('brand/zju-horizontal-mark.svg')} style={{...style,opacity:1-w,filter:'drop-shadow(0 0 5px rgba(243,250,250,.9))'}}/>{w>0&&<Img src={staticFile('brand/zju-horizontal-mark.svg')} style={{...style,opacity:w,filter:'brightness(0) invert(1) drop-shadow(0 1px 3px rgba(7,30,43,.4))'}}/>}</>;
}
function Caption(){const f=useCurrentFrame(),ms=f/fps*1000,c=(captions as {text:string;startMs:number;endMs:number}[]).find(c=>ms>=c.startMs&&ms<c.endMs);return c?<div data-qa="caption" style={{position:'absolute',bottom:0,left:0,right:0,height:133,zIndex:95,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 90px 26px',background:'linear-gradient(180deg,transparent,rgba(7,30,43,.14) 36%,rgba(7,30,43,.63))'}}><span style={{fontSize:43,fontWeight:500,color:'#fbfdfd',lineHeight:1.45,textShadow:'0 2px 4px rgba(5,22,31,.65)',textAlign:'center'}}>{c.text}</span></div>:null}
export const LaunchFilmV7:React.FC<{audio?:boolean;overlay?:boolean;qa?:boolean;blueprint?:boolean}>=({audio=true,overlay=true,qa=false,blueprint=false})=>{
 const frame=useCurrentFrame(),s=useMemo(()=>stateAt(frame),[frame]),[info,setInfo]=useState<ContinuousInfo>();
 useLayoutEffect(()=>{if(!qa||!info)return;const canvas=document.querySelector('canvas');if(!canvas)return;const c=canvas.getBoundingClientRect(),scale=1920/c.width;const boxes=Array.from(document.querySelectorAll('[data-qa]')).map(el=>{const r=el.getBoundingClientRect();return{role:el.getAttribute('data-qa'),text:el.textContent?.slice(0,180),x:(r.x-c.x)*scale,y:(r.y-c.y)*scale,width:r.width*scale,height:r.height*scale}});console.log('LAYOUT_QA '+JSON.stringify({frame,scene:s.id,boxes,camera:info.camera,native:info.native}))},[frame,info,qa]);
 return <AbsoluteFill style={{fontFamily:'Microsoft YaHei, Noto Sans CJK SC, sans-serif',background:'#e7eff1',overflow:'hidden'}}><Stage time={s.time} onInfo={setInfo} blueprint={blueprint}/>{overlay&&<><InformationLight s={s}/><GeneratedLaunchBridgesV7/><Brand s={s}/><Heading s={s}/>{s.id==='brief'&&<ProductValueV7 mode="brief" local={s.local} duration={s.duration}/>}<Topology s={s} info={info}/><Physics s={s} info={info}/>{s.id==='interaction'&&<ProductValueV7 mode="feedback" local={s.local} duration={s.duration}/>} {s.id==='toolchain'&&<ProductValueV7 mode="human" local={s.local} duration={s.duration}/>}<Proof s={s}/><Closing s={s}/><Caption/></>}{audio&&<Audio src={staticFile('audio/launch-v7-master.wav')}/>}</AbsoluteFill>;
};
export {fps,durationInFrames};
