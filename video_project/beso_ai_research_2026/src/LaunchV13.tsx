import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import story from './launch-v13-story.json';
import captions from './launch-v13-captions.json';
import {ContinuousLaunchWorldV8,ContinuousInfoV8} from './beso/ContinuousLaunchWorldV8';
import checklist from '../public/beso-research/web-live/v7/visual-data.json';
import replan from '../public/beso-research/web-live/v7/replan-visual.json';
import {ProductWebV13} from './beso/ProductWebV13';
import {GeneratedLaunchBridgesV13} from './beso/GeneratedLaunchBridgesV13';

export const fps=60,durationInFrames=6300;
const ink='#143441',teal='#216471',gold='#a96535',paper='#edf3f3';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const t=clamp(x);return t*t*t*(t*(6*t-15)+10)};
type Id='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
type Shot={id:Id;start:number;duration:number;title:string;time:number;local:number};
const shots=story.scenes as {id:Id;start:number;duration:number;title:string}[];
function shotAt(frame:number):Shot{const s=shots[Math.max(0,shots.findLastIndex(s=>frame>=s.start))];return{...s,time:frame/fps,local:(frame-s.start)/fps,duration:s.duration/fps}}

// Layers begin and finish entirely outside the frame. Width is invariant.
export function panelTravel(time:number,start:number,end:number,entry=1,exit=1){
 return 2120*(1-ease((time-start)/entry))-2120*ease((time-end+exit)/exit);
}
const colour=(underwater:number,dark=ink,light='#f2f8f6')=>{
 const a=dark.match(/[a-f\d]{2}/gi)!.map(v=>parseInt(v,16)),b=light.match(/[a-f\d]{2}/gi)!.map(v=>parseInt(v,16));
 return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*clamp(underwater))).join(',')})`;
};
function Stage({s,start=0,end=s.duration,top=355,width=740,role,children}:{s:Shot;start?:number;end?:number;top?:number;width?:number;role:string;children:React.ReactNode}){
 if(s.local<start||s.local>=end)return null;
 const travel=s.id==='close'?2120*(1-ease(s.local-start)):panelTravel(s.local,start,end);
 return <div data-qa={role} style={{position:'absolute',left:88,top,width,zIndex:32,transform:`translateX(${travel}px)`,pointerEvents:'none'}}>{children}</div>;
}
function World({time,onInfo,blueprint=false}:{time:number;onInfo:(info:ContinuousInfoV8)=>void;blueprint?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<ContinuousLaunchWorldV8|null>(null),ready=useRef(false),latest=useRef(time);latest.current=time;
 const [handle]=useState(()=>delayRender('Load original engineering assets'));
 useLayoutEffect(()=>{const w=new ContinuousLaunchWorldV8(canvas.current!,staticFile(''));world.current=w;w.ready.then(()=>{ready.current=true;blueprint?w.renderBlueprint(latest.current):w.render(latest.current);onInfo(w.info);continueRender(handle)}).catch(cancelRender);return()=>{ready.current=false;w.dispose();world.current=null}},[]);
 useLayoutEffect(()=>{if(world.current&&ready.current){blueprint?world.current.renderBlueprint(time):world.current.render(time);onInfo(world.current.info)}},[time,blueprint]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}
const headings:Record<Id,string[]>={hero:['少用一点钢','少一点重复操作'],brief:['改一次需求','更新同一份清单'],topology:['文件接力','工具继续'],physics:['响应回读','约束复查'],interaction:['计算卡住','下一步有依据'],toolchain:['你来判断','后续重新生成'],proof:['模型与依据','一起带走'],close:['AI Engineer']};
function Title({s,submersion}:{s:Shot;submersion:number}){
 const close=s.id==='close',hero=s.id==='hero',size=close?104:hero?88:68;
 const travel=close?2120*(1-ease((s.local+.2)/1.15)):panelTravel(s.local,-.2,s.duration,1.15,1);
 return <div data-qa="title" style={{position:'absolute',left:88,top:hero?174:close?245:112,width:880,zIndex:40,whiteSpace:'nowrap',color:colour(submersion),transform:`translateX(${travel}px)`}}>
  {!close&&<div style={{fontSize:36,fontWeight:550,letterSpacing:1.1,marginBottom:20,color:colour(submersion,teal,'#b8d8d8')}}>AI Engineer</div>}
  {headings[s.id].map(line=><div key={line} style={{fontSize:size,lineHeight:1.2,fontWeight:700,letterSpacing:-1.8}}>{line}</div>)}
 </div>;
}
// Original website pixels are opaque and readable. No generated controls.
function RealPage({asset,width,height,zoom=1,pan=0}:{asset:string;width:number;height:number;zoom?:number;pan?:number}){
 return <div data-qa="actual-ui-surface" style={{width,height,position:'relative',overflow:'hidden',background:'#fff',borderRadius:16,boxShadow:'0 14px 36px rgba(8,33,46,.12)',border:'1px solid #cddce0'}}>
  <Img src={staticFile(`beso-research/web-live/v12/${asset}`)} style={{width:width*zoom,height:'auto',display:'block',transform:`translateX(${-pan}px)`,transformOrigin:'left top'}}/>
 </div>;
}
function Demand({s}:{s:Shot}){
 const updated=ease((s.local-7.0)/.8),initial=checklist.steps[0],next=checklist.steps[1];
 return <>
  <Stage s={s} start={.15} end={5.5} top={398} width={1030} role="demand-ui">
   <div style={{fontSize:40,fontWeight:600,color:teal,marginBottom:26}}>真实网页 · 输入需求</div>
   <RealPage asset="demand-input.png" width={1030} height={184}/>
   <div style={{fontSize:36,color:teal,marginTop:28}}>本次演示：本地规则解析</div>
  </Stage>
  <Stage s={s} start={4.6} top={380} role="design-parameters">
   <div style={{fontSize:40,fontWeight:600,color:teal,marginBottom:24}}>同一份设计清单</div>
   {[
    {label:'额定功率',before:initial.capacityMW,after:next.capacityMW,unit:'MW'},
    {label:'单位功率用钢量',before:initial.steelTargetTperMW,after:next.steelTargetTperMW,unit:'t/MW'},
    {label:'水深',before:initial.waterDepthM,after:next.waterDepthM,unit:'m'}
   ].map((row,i)=><div key={row.label} style={{display:'flex',alignItems:'baseline',justifyContent:'space-between',width:740,padding:'19px 0',borderTop:i?'1px solid #adc4cd':'none',transform:`translateY(${14*(1-ease((s.local-5.1-i*.16)/.7))}px)`}}>
    <span style={{fontSize:36,color:ink}}>{row.label}</span>
    <div style={{display:'flex',alignItems:'baseline',gap:14,fontVariantNumeric:'tabular-nums'}}>
     {i>0&&updated>.5&&<span style={{fontSize:36,color:'#526f7d',opacity:updated}}>{row.before} →</span>}
     <span style={{fontSize:65,fontWeight:650,color:i>0&&updated>.5?gold:ink}}>{updated>.5?row.after:row.before}</span>
     <span style={{fontSize:35,fontWeight:500}}>{row.unit}</span>
    </div>
   </div>)}
   <div style={{fontSize:36,color:teal,marginTop:24}}>需求修改 → 清单更新</div>
  </Stage>
 </>;
}
function Handoff({s,info}:{s:Shot;info?:ContinuousInfoV8}){
 const p=clamp((s.local-1.5)/5.0),names=['几何','网格','BESO'],step=Math.min(2,Math.floor(p*3));
 return <Stage s={s} start={8.5} top={394} role="tool-handoff">
  <svg width="735" height="282" viewBox="0 0 735 282">
   <path d="M28 30 V252" stroke="#91acb3" strokeWidth="2"/>
   {names.map((name,i)=><g key={name} transform={`translate(28,${44+i*92})`}>
    <circle r={i===step?9:5} fill={i===step?'#e6ad6f':'#a4c4cb'}/>
    <text x="36" y="12" fontSize="43" fontWeight={i===step?700:500} fill={i===step?'#f8d8ae':'#dfebee'}>{name}</text>
    <text x="316" y="10" fontSize="36" fill={i===step?'#f8d8ae':'#bed2d7'}>{['STEP','INP','优化结果'][i]}</text>
   </g>)}
   <g transform={`translate(28,${44+184*ease(p)})`}><circle r="15" stroke="#e0b67d" strokeWidth="2" fill="#143946"/><circle r="6" fill="#f2ce99"/></g>
  </svg>
  <div style={{fontSize:36,color:'#bfd8dc',marginTop:4}}>工具流程示意</div>
  <div style={{display:'flex',alignItems:'baseline',gap:24,marginTop:33}}>
   <span style={{fontSize:80,fontWeight:700,fontVariantNumeric:'tabular-nums'}}>{((info?.fraction??1)*100).toFixed(1)}<span style={{fontSize:39,marginLeft:8}}>%</span></span>
   <span style={{fontSize:36}}>保留体积</span>
  </div>
  <div style={{fontSize:36,color:'#c5dadc',marginTop:12}}>独立 BESO 回放 · 第 {info?.iteration??0} 次迭代</div>
 </Stage>;
}
function Physics({s,info}:{s:Shot;info?:ContinuousInfoV8}){
 if(!info)return null;
 const water=info.underwater,fg=colour(water),accent=colour(water,teal,'#b9dada');
 const joint=ease((s.local-4.1)/1.0),anchor={x:info.platform.x+(info.fairlead.x-info.platform.x)*joint,y:info.platform.y+(info.fairlead.y-info.platform.y)*joint};
 const lineVisible=(joint<.5?info.platform:info.fairlead).visible,lineWeight=ease((s.local-1.0)/.8)*(1-ease((s.local-9.0)/.7));
 return <>
  <Stage s={s} start={.15} end={5.2} top={414} role="platform-response">
   <div style={{fontSize:42,fontWeight:600,color:accent}}>Zwind · 平台纵荡</div>
   <div style={{fontSize:94,fontWeight:700,marginTop:25,color:fg,fontVariantNumeric:'tabular-nums'}}>{info.native.surge.toFixed(2)}<span style={{fontSize:44,marginLeft:17}}>m</span></div>
   <div style={{fontSize:36,color:accent,marginTop:32}}>保存响应回放 · 视觉波面</div>
  </Stage>
  <Stage s={s} start={4.2} end={10.2} top={414} role="mooring-response">
   <div style={{fontSize:42,fontWeight:600,color:accent}}>Zwind · 系泊张力</div>
   <div style={{fontSize:94,fontWeight:700,marginTop:25,color:fg,fontVariantNumeric:'tabular-nums'}}>{(info.lineTension/1000).toFixed(0)}<span style={{fontSize:44,marginLeft:17}}>kN</span></div>
   <div style={{fontSize:36,color:accent,marginTop:32}}>保存响应回放 · 视觉波面</div>
  </Stage>
  <Stage s={s} start={9.2} top={438} role="response-to-constraint">
   <div style={{fontSize:52,fontWeight:650,color:fg,lineHeight:1.45}}>运动与张力<br/>回到设计约束</div>
   <div style={{fontSize:36,color:accent,marginTop:30}}>AI Engineer · 结果回读</div>
  </Stage>
  {lineVisible&&lineWeight>0&&<svg data-qa="response-anchor" width="1920" height="1080" style={{position:'absolute',inset:0,zIndex:25,pointerEvents:'none',opacity:lineWeight}}><path d={`M 580 580 C 730 580 800 ${anchor.y} ${anchor.x} ${anchor.y}`} fill="none" stroke={colour(water,'#a96535','#edba80')} strokeWidth="2.6"/><circle cx={anchor.x} cy={anchor.y} r="5.5" fill={colour(water,'#a96535','#edba80')}/></svg>}
 </>;
}
function Feedback({s}:{s:Shot}){
 return <>
  <Stage s={s} start={.15} end={5.0} top={408} role="failure-log">
   <div style={{fontSize:45,fontWeight:650,color:gold}}>静力求解未收敛</div>
   <div style={{fontFamily:'Consolas, monospace',fontSize:43,color:ink,marginTop:42,lineHeight:1.55}}>residual_norm<br/><span style={{fontSize:73,fontWeight:650}}>1.2e−3</span></div>
   <div style={{fontSize:37,color:teal,marginTop:32}}>保存日志 · 残差停滞</div>
  </Stage>
  <Stage s={s} start={4.0} end={9.0} top={408} role="replan-input">
   <div style={{fontSize:43,fontWeight:650}}>调整迭代上限</div>
   <div style={{fontSize:92,fontWeight:700,color:gold,marginTop:35,fontVariantNumeric:'tabular-nums'}}>{replan.iterationLimitBefore}<span style={{fontSize:48,color:teal,margin:'0 25px'}}>→</span>{replan.iterationLimitAfter}</div>
   <div style={{fontSize:37,color:teal,marginTop:37}}>根据失败记录，安排下一轮</div>
  </Stage>
  <Stage s={s} start={8.0} top={426} role="retry-status">
   <div style={{fontSize:54,fontWeight:650,lineHeight:1.5}}>修改有记录<br/>重试等待复查</div>
   <div style={{fontSize:36,color:teal,marginTop:30}}>保存重规划记录</div>
  </Stage>
 </>;
}
function Human({s}:{s:Shot}){
 return <>
  <Stage s={s} start={.15} end={4.0} top={445} role="human-review">
   <div style={{fontSize:53,fontWeight:650,lineHeight:1.45}}>需要判断的地方<br/>停下来，由你决定</div>
   <div style={{fontSize:37,color:teal,marginTop:32}}>几何节点 · 等待复查</div>
  </Stage>
  <Stage s={s} start={3.0} end={8.0} top={378} width={665} role="real-model-viewer">
   <div style={{fontSize:37,color:teal,fontWeight:600,marginBottom:20}}>真实查看器 · 保存画面</div>
   <RealPage asset="geometry-model.png" width={470} height={460}/>
  </Stage>
  <Stage s={s} start={7.0} top={418} role="geometry-invalidation">
   <div style={{fontSize:52,fontWeight:650}}>新几何，交回任务</div>
   <div style={{fontSize:42,color:'#526f7d',marginTop:38,textDecoration:'line-through',textDecorationThickness:2}}>旧网格 / 旧载荷</div>
   <div style={{fontSize:47,fontWeight:600,color:teal,marginTop:36,lineHeight:1.4}}>按新模型<br/>重新生成并继续</div>
   <div style={{fontSize:36,color:teal,marginTop:28}}>几何修改流程示意</div>
  </Stage>
 </>;
}
function Proof({s}:{s:Shot}){
 const reduction=ease((s.local-8.25)/.6),checks=ease((s.local-10.6)/.7);
 return <>
  <Stage s={s} start={6.15} top={362} role="manuscript-case">
   <div style={{fontSize:36,fontWeight:600,color:teal}}>论文稿件案例 · 单位功率用钢量</div>
   <div style={{fontSize:64,fontWeight:650,marginTop:24}}>278 <span style={{fontSize:40,color:teal}}>→</span> 255.5 <span style={{fontSize:35,fontWeight:500}}>t/MW</span></div>
   <div style={{fontSize:128,fontWeight:700,color:gold,letterSpacing:-4,marginTop:23,opacity:reduction,transform:`translateY(${32*(1-reduction)}px)`}}>−8.1<span style={{fontSize:60,letterSpacing:0}}>%</span></div>
   <div style={{fontSize:36,color:teal,marginTop:16}}>图强号参考 → 案例方案</div>
   <div style={{fontSize:44,fontWeight:600,marginTop:32,opacity:checks,transform:`translateY(${24*(1-checks)}px)`}}>强度 + 运动响应，一起检查</div>
  </Stage>
 </>;
}
function Caption(){
 const frame=useCurrentFrame(),ms=frame/fps*1000,c=(captions as {text:string;startMs:number;endMs:number}[]).find(c=>ms>=c.startMs&&ms<c.endMs);if(!c)return null;
 const alpha=Math.min(ease((ms-c.startMs)/130),ease((c.endMs-ms)/130));
 return <div data-qa="caption" style={{position:'absolute',bottom:0,left:0,right:0,height:130,zIndex:95,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 140px 23px',background:'linear-gradient(180deg,transparent,rgba(6,25,37,.03) 30%,rgba(6,25,37,.47))',opacity:alpha}}><span style={{fontSize:44,fontWeight:550,letterSpacing:.8,color:'#fbfdfd',lineHeight:1.28,textShadow:'0 2px 8px #06212e',textAlign:'center',maxWidth:1510}}>{c.text}</span></div>;
}
function Brand({info}:{info?:ContinuousInfoV8}){
 // Select contrast from the actual camera ray at the Logo, independently of
 // the left-hand text scrim. Above horizon: original blue. Sea: white.
 const white=info?.underwater??0;
 return <div data-qa="brand" style={{position:'absolute',right:54,top:35,width:310,height:77,zIndex:86}}>
  <Img src={staticFile('brand/zju-horizontal-mark.svg')} style={{position:'absolute',inset:0,width:310,height:77,objectFit:'contain',opacity:1-white,filter:'drop-shadow(0 0 3px #edf3f3)'}}/>
  <Img src={staticFile('brand/zju-horizontal-mark.svg')} style={{position:'absolute',inset:0,width:310,height:77,objectFit:'contain',opacity:white,filter:'brightness(0) invert(1) drop-shadow(0 1px 3px #082a38)'}}/>
 </div>;
}
export const LaunchFilmV13:React.FC<{audio?:boolean;overlay?:boolean;qa?:boolean;blueprint?:boolean}>=({audio=true,overlay=true,qa=false,blueprint=false})=>{
 const frame=useCurrentFrame(),s=shotAt(frame),[info,setInfo]=useState<ContinuousInfoV8>();
 const topologyShade=ease((s.time-22.3)/1.5)*(1-ease((s.time-38.7)/1.3));
 const submersion=Math.max(topologyShade,info?.underwater??0);
 useLayoutEffect(()=>{if(!qa||!info)return;const canvas=document.querySelector('canvas');if(!canvas)return;const c=canvas.getBoundingClientRect(),scale=1920/c.width;const boxes=Array.from(document.querySelectorAll('[data-qa]')).map(el=>{const r=el.getBoundingClientRect();return{role:el.getAttribute('data-qa'),text:el.textContent?.slice(0,180),x:(r.x-c.x)*scale,y:(r.y-c.y)*scale,width:r.width*scale,height:r.height*scale}});console.log('LAYOUT_QA '+JSON.stringify({frame,scene:s.id,boxes,camera:info.camera,native:info.native}))},[frame,info,qa]);
 return <AbsoluteFill style={{fontFamily:'Microsoft YaHei, Noto Sans CJK SC, sans-serif',background:paper,color:ink,overflow:'hidden'}}>
  <World time={s.time} onInfo={setInfo} blueprint={blueprint}/>
  {!blueprint&&overlay&&<GeneratedLaunchBridgesV13/>}
  {overlay&&<>
   <AbsoluteFill style={{zIndex:12,pointerEvents:'none',background:`linear-gradient(90deg,${colour(submersion,'#edf3f3','#0b2d3c')} 0%,${colour(submersion,'#edf3f3','#0b2d3c')} 31%,transparent 56%)`,opacity:.88}}/>
   {['brief','interaction','toolchain'].includes(s.id)&&<ProductWebV13 frame={frame} fps={fps} section="auto"/>}
   {s.id==='topology'&&<div style={{color:'#f2f8f6'}}>{s.local<8.5?<ProductWebV13 frame={frame} fps={fps} section="handoff"/>:<Handoff s={s} info={info}/>}</div>}
   {s.id==='physics'&&<Physics s={s} info={info}/>}
   {s.id==='proof'&&<>{s.local<6.7&&<ProductWebV13 frame={frame} fps={fps} section="delivery"/>}{s.local>=5.7&&<Proof s={s}/>}</>}
   <Title s={s} submersion={submersion}/><Brand info={info}/>
   {s.id==='close'&&<Stage s={s} start={.3} top={424} role="cta"><div style={{fontSize:51,fontWeight:600,lineHeight:1.5}}>让工具接力<br/>把时间用在设计判断上</div><div style={{fontSize:38,color:teal,marginTop:31}}>从你的工程目标，开始下一项任务</div></Stage>}
   <Caption/>
  </>}
  {audio&&<Audio src={staticFile('audio/launch-v8-master.wav')}/>}
 </AbsoluteFill>;
};
