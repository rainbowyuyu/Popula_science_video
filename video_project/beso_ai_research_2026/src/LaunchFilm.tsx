import React,{useLayoutEffect,useMemo,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender,OffthreadVideo,Sequence} from 'remotion';
import story from './launch-story.json';
import captions from './launch-captions.json';
import response from '../public/beso-research/physics/zwind-response.json';
import {CinematicWorld} from './beso/CinematicWorld';
import {GeneratedLaunchBridges} from './beso/GeneratedLaunchBridges';
import {FilmState,WorldInfo,clamp,smooth} from './beso/World';

type LaunchId='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
type LaunchScene={id:LaunchId;start:number;duration:number;title:string;claim:string;visual:string;camera:string;onScreen:string[];voice:string};
type LaunchState={id:LaunchId;index:number;local:number;progress:number;time:number;duration:number;sceneStart:number};
const fps=story.fps as number;
const launchScenes=story.scenes as LaunchScene[];
const durationInFrames=story.duration as number;
const alias:Record<LaunchId,string>={hero:'hook',brief:'brief',topology:'beso',physics:'zwind',interaction:'brief',toolchain:'rebuild',proof:'compare',close:'close'};
const baseTimings=launchScenes.map(s=>({id:alias[s.id],start:s.start,duration:s.duration}));
const ink='#103a53',teal='#0a8d91',coral='#d66f4c',mist='#edf4f4';
const sceneAt=(frame:number):LaunchState=>{const index=Math.max(0,launchScenes.findLastIndex(s=>frame>=s.start));const s=launchScenes[index]??launchScenes[0];const start=s.start,dur=Math.max(1,s.duration);return{id:s.id,index,local:(frame-start)/fps,progress:clamp((frame-start)/dur),time:frame/fps,duration:dur/fps,sceneStart:s.start/fps};};
const toBase=(s:LaunchState):FilmState=>({id:alias[s.id],index:s.index,local:s.local,progress:s.progress,time:s.time,duration:s.duration,sceneStart:s.sceneStart});

function Stage({s,onInfo}:{s:LaunchState;onInfo:(info:WorldInfo)=>void}){
  const canvas=useRef<HTMLCanvasElement>(null), world=useRef<CinematicWorld|null>(null), ready=useRef(false), latest=useRef(s);latest.current=s;
  const [handle]=useState(()=>delayRender('Load AI Engineer launch-film 3D world'));
  useLayoutEffect(()=>{const w=new CinematicWorld(canvas.current!,staticFile(''),baseTimings,fps,true);world.current=w;w.ready.then(()=>{ready.current=true;w.render(toBase(latest.current));onInfo(w.info);continueRender(handle)}).catch(cancelRender);return()=>{ready.current=false;w.dispose();world.current=null}},[]);
  useLayoutEffect(()=>{if(ready.current&&world.current){world.current.render(toBase(s));onInfo(world.current.info)}},[s]);
  return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}

function Logo(){return <div style={{position:'absolute',right:58,top:30,padding:'8px 10px',borderRadius:12,background:'rgba(249,252,251,.34)',border:'1px solid rgba(255,255,255,.55)',boxShadow:'0 8px 24px rgba(10,40,55,.12)',zIndex:50}}><Img src={staticFile('brand/zju-horizontal-mark.svg')} style={{width:300,height:77,objectFit:'contain'}}/></div>}
// Enter from the adjoining camera space; once settled, keep the label anchored
// so it never clips the safe area during a long shot.
const slide=(s:LaunchState,delay=0)=> 2240*(1-smooth((s.local-delay)/1.15));
const depart=(s:LaunchState,span=1.1)=>s.id==='close'?0:smooth((s.local-s.duration+span)/span);
const heads:Record<LaunchId,[string,string]>={hero:['AI ENGINEER','从需求，到工程方案'],brief:['从一句话\n到任务图','目标 → 参数 → 工具'],topology:['让材料，沿着力留下','每一次取舍，都能回看'],physics:['让设计，经受风浪','几何 · 载荷 · 响应'],interaction:['让结果\n带回反馈','导入 → 记录 → 复查'],toolchain:['工具之间，有来有回','建议 → 计算 → 复查'],proof:['结果，放回条件里看','用钢量 · 强度 · 运动 · 系泊'],close:['AI ENGINEER','让智能连接工具，让计算提供依据']};
function KineticCopy({s}:{s:LaunchState}){
 const hero=s.id==='hero'||s.id==='close',ocean=s.id==='hero'||s.id==='physics'||s.id==='close';
 const [title,sub]=heads[s.id],revealOffset=(s.id==='close'||s.id==='topology'||s.id==='toolchain')?.02:.12,revealDuration=s.id==='close'?.72:1.35,enter=s.id==='close'?smooth((s.local-.02)/.72):smooth((s.local-revealOffset)/1.35),out=depart(s),drift=Math.sin(s.time*.17)*3;
 const earlyClose=s.id==='close'&&s.local<3.2;
 const titleColor=earlyClose?ink:ocean?'#f2f8f7':ink,subColor=earlyClose?'#245e73':ocean?'#eff8f8':'#3b8190';
 const web=s.id==='brief'||s.id==='interaction';
 const rightAligned=s.id==='topology',left=rightAligned?790:94,top=web?250:s.id==='proof'?158:hero?235:152,width=rightAligned?1040:web?460:hero?1100:1330;
 return <div style={{position:'absolute',left,top,width,textAlign:rightAligned?'right':'left',zIndex:25,transform:`translate3d(${-110*(1-enter)-2200*out+drift}px,${16*(1-enter)}px,0)`,color:titleColor,pointerEvents:'none'}}>
 <div style={{overflow:'hidden',height:35,marginBottom:22}}><div style={{fontSize:26,letterSpacing:web?2.6:4.1,color:ocean?'#d4f0ee':teal,fontWeight:600,transform:`translateY(${38*(1-smooth((s.local-.1)/.8))}px)`}}>{hero?'DESIGN WITH EVIDENCE':web?'AI ENGINEER':`AI ENGINEER  /  0${s.index+1}`}</div></div>
 <div style={{paddingBottom:4}}>{title.split('\n').map((line,i)=>{const reveal=smooth((s.local-revealOffset-i*.16)/revealDuration);return <div key={line} style={{overflow:'hidden'}}><div style={{fontSize:hero?102:72,fontWeight:780,letterSpacing:hero?-2.2:-1.8,lineHeight:web?1.28:1.15,textShadow:ocean?'0 2px 20px rgba(8,34,48,.46)':'none',transform:`translateY(${126*(1-reveal)}px) rotate(${-.8*(1-reveal)}deg)`,transformOrigin:'0 100%'}}>{line}</div></div>})}</div>
 <div style={{overflow:'hidden',height:56,marginTop:17}}><div style={{fontSize:hero?35:web?28:30,color:subColor,letterSpacing:web?0:.8,textShadow:ocean?'0 2px 12px rgba(8,36,52,.55)':'none',transform:`translateY(${57*(1-smooth((s.local-.45)/1.2))}px)`}}>{sub}</div></div>
 <div style={{height:3,width:98,marginTop:18,marginLeft:rightAligned?'auto':0,transform:`scaleX(${smooth((s.local-.5)/1.1)})`,transformOrigin:'left',background:`linear-gradient(90deg,${coral},${teal})`}}/></div>
}
function BrowserPane({s}:{s:LaunchState}){
 if(s.id!=='brief'&&s.id!=='interaction')return null;
 const enter=smooth((s.local-.08)/1.75),exit=smooth((s.local-s.duration+1.8)/1.8);
 const p=clamp(s.local/s.duration),tracking=Math.sin(p*Math.PI)*8;
 const x=1510*(1-enter)-2200*exit+tracking;
 return <div style={{position:'absolute',left:600,top:230,width:1240,height:738,zIndex:18,perspective:2800,transform:`translate3d(${x}px,${44*(1-enter)-34*exit-4*Math.sin(p*Math.PI)}px,0)`,transformOrigin:'center'}}>
 <div style={{height:'100%',width:'100%',borderRadius:20,overflow:'hidden',boxShadow:'0 30px 75px #173d5126,0 3px 10px #173d5112',background:'#f8fbfc',border:'1px solid #d7e3e5',transform:`rotateY(${-11*(1-enter)-2.5+4.5*p+10*exit}deg) rotateX(${5*(1-enter)+1-1.7*p+15*exit}deg) rotateZ(${-1.4*(1-enter)-2*exit}deg) scale(${.965+.035*enter-.05*exit})`}}>
 <div style={{height:40,background:'linear-gradient(90deg,#e7efef,#f4f8f7)',display:'flex',alignItems:'center',padding:'0 21px',gap:12,color:'#275b6e',fontSize:26}}><span style={{width:8,height:8,borderRadius:8,background:teal}}/><span>AI Engineer</span><span style={{marginLeft:'auto',fontSize:24,color:'#5a7e88'}}>{s.id==='interaction'?'参数导入与结果查看 · 回放':'真实界面回放'}</span></div>
 <Sequence from={Math.round(s.sceneStart*fps)} layout="none"><OffthreadVideo muted src={staticFile(`beso-research/web-live/${s.id==='brief'?'brief-live':'interaction-live'}.mp4`)} style={{width:'100%',height:697.5,objectFit:'contain',objectPosition:'center',background:'#f4f8f8'}}/></Sequence>
 </div></div>
}
function BriefTokens({s}:{s:LaunchState}){
 if(s.id!=='brief'&&s.id!=='interaction')return null;
 const words=s.id==='brief'?['工程目标','约束参数','专家工具']:['导入结果','记录状态','人工复查'];
 return <div style={{position:'absolute',left:98,top:667,width:420,zIndex:24,color:ink,transform:`translateX(${-2140*depart(s,1.8)}px)`}}>{words.map((w,i)=>{const q=smooth((s.local-1.2-i*.28)/1.15);return <div key={w} style={{overflow:'hidden',marginBottom:23}}><div style={{fontSize:34,fontWeight:580,letterSpacing:.3,transform:`translate3d(${24*(1-q)}px,${70*(1-q)}px,0)`}}><span style={{display:'inline-block',width:24,height:2,background:teal,verticalAlign:'middle',marginRight:17,opacity:.55}}/>{w}</div></div>})}</div>
}
type GraphNode={label:string;short:string;color:string};
const graphNodes:GraphNode[]=[
 {label:'目标与约束',short:'BRIEF',color:'#d69463'},
 {label:'Geometry',short:'CAD',color:'#2f9fa3'},
 {label:'Mesh',short:'MESH',color:'#56b8b5'},
 {label:'BESO',short:'BESO',color:'#e3b06f'},
 {label:'Z-wind',short:'Z-WIND',color:'#8cc9dc'},
 {label:'反馈',short:'LOG',color:'#d67b63'},
];
function TaskGraphOverlay({s}:{s:LaunchState}){
  if(!['brief','topology','physics','interaction','toolchain','proof'].includes(s.id))return null;
  const active=s.id==='brief'?0:s.id==='topology'?3:s.id==='physics'?4:s.id==='interaction'?5:s.id==='toolchain'?3:5;
  const local=s.local,enter=smooth((local-.35)/1.1),exit=s.id==='proof'?smooth((local-s.duration+1.8)/1.8):0;
  const packet=smooth(((local*.36)%1+.01));
  const left=s.id==='toolchain'?560:92,top=s.id==='toolchain'?690:910,width=s.id==='toolchain'?1280:840;
  return <div style={{position:'absolute',left,top,width,height:92,zIndex:29,opacity:enter*(1-exit),transform:`translate3d(${80*(1-enter)-2300*exit}px,${18*(1-enter)}px,0)`,pointerEvents:'none'}}>
    <svg width={width} height="92" viewBox={`0 0 ${width} 92`} style={{position:'absolute',inset:0,overflow:'visible'}}>
      <path d={`M 28 36 C ${width*.25} 6,${width*.55} 70,${width-28} 36`} fill="none" stroke="rgba(91,160,170,.42)" strokeWidth="2" strokeDasharray="6 10"/>
      {graphNodes.map((n,i)=>{const x=28+(width-56)*i/(graphNodes.length-1), y=36+Math.sin(i*.8)*18;const q=smooth((local-.25-i*.16)/.7);const selected=i===active;return <g key={n.short} opacity={q}>
        <circle cx={x} cy={y} r={selected?15:11} fill={selected?n.color:'rgba(236,248,247,.92)'} stroke={n.color} strokeWidth={selected?3:2}/>
        <circle cx={x} cy={y} r={3.4} fill={selected?'#fff':'rgba(35,103,114,.7)'}/>
        <text x={x} y={y+34} textAnchor="middle" fill={selected?'#174d60':'#3d6673'} fontSize={selected?22:18} fontWeight={selected?700:560}>{n.label}</text>
      </g>})}
      <circle cx={28+(width-56)*packet} cy={36+Math.sin(packet*5.03)*18} r="6" fill="#fff4d5" stroke="#d78b5d" strokeWidth="2"/>
    </svg>
    <div style={{position:'absolute',right:0,top:-32,fontSize:19,letterSpacing:2,color:'#50808b'}}>AI ENGINEER · TASK GRAPH</div>
  </div>;
}
function TopologyRibbon({s,info}:{s:LaunchState;info?:WorldInfo}){
 if(s.id!=='topology'||s.time>=32.5)return null;
 return <div style={{position:'absolute',right:90,top:365,width:285,zIndex:26,color:ink,transform:`translateX(${slide(s,.55)-2240*depart(s)}px)`}}>
 <div style={{fontSize:24,color:teal,letterSpacing:3}}>MATERIAL EVOLUTION</div><div style={{fontSize:90,fontWeight:750,marginTop:20,fontVariantNumeric:'tabular-nums'}}>{((info?.fraction??1)*100).toFixed(1)}<span style={{fontSize:36}}>%</span></div><div style={{fontSize:29,color:'#4b6d7b'}}>实体保留体积</div>
 <div style={{height:4,background:'#adcacf',margin:'28px 0',overflow:'hidden'}}><div style={{width:`${(info?.fraction??1)*100}%`,height:4,background:teal}}/></div><div style={{fontSize:34}}>迭代 {String(info?.iteration??0).padStart(2,'0')}</div><div style={{fontSize:24,color:'#587585',marginTop:16}}>44 状态 · 关键帧回放</div></div>
}
const records=response.records.filter((_,i)=>i%8===0);
const low=Math.min(...records.map(r=>r.platform[0])),high=Math.max(...records.map(r=>r.platform[0]));
const cx=(t:number)=>20+430*t/120,cy=(v:number)=>164-132*(v-low)/(high-low);
const trace=records.map((r,i)=>`${i?'L':'M'}${cx(r.t)},${cy(r.platform[0])}`).join(' ');
function PhysicsReadout({s,info}:{s:LaunchState;info?:WorldInfo}){
 if(s.id!=='physics'||s.time<38||!info?.native)return null;
  const n=info.native;return <div style={{position:'absolute',left:90,top:445,width:490,zIndex:27,color:'#effbff',padding:'24px 26px 20px',borderRadius:16,background:'linear-gradient(125deg,rgba(8,40,56,.86),rgba(8,40,56,.58))',border:'1px solid #9dcbd84a',boxShadow:'0 18px 50px rgba(5,28,41,.12)',transform:`translateX(${-slide(s,4)-2240*depart(s,1.8)}px)`}}>
  <div style={{display:'flex',alignItems:'baseline',justifyContent:'space-between'}}><span style={{fontSize:29}}>Z-wind · 平台纵荡</span><span style={{fontSize:42,fontVariantNumeric:'tabular-nums',color:'#9ddfdf'}}>{n.surge.toFixed(2)} m</span></div>
 <svg width="460" height="208" viewBox="0 0 460 208"><path d={trace} fill="none" stroke="#76d7d1" strokeWidth="3"/><line x1={cx(n.time)} x2={cx(n.time)} y1={15} y2={172} stroke="#f2bb80" strokeWidth={2}/><circle cx={cx(n.time)} cy={cy(n.surge)} r={7} fill="#ffd69f"/><text x={20} y={199} fill="#bcd9df" fontSize={24}>0 s</text><text x={450} y={199} textAnchor="end" fill="#bcd9df" fontSize={24}>120 s</text></svg>
  <div style={{display:'flex',justifyContent:'space-between',fontSize:27,marginTop:6}}><span>纵摇 {n.pitch.toFixed(2)}°</span><span>系泊 {(n.tension/1000).toFixed(0)} kN</span></div><div style={{fontSize:22,color:'#b3d0d8',marginTop:18}}>saved response · visual wave</div></div>
}
function PhysicalCallouts({s,info}:{s:LaunchState;info?:WorldInfo}){
  if(s.id!=='physics'||!info?.native)return null;
  const n=info.native;
  const callouts=[
    {x:info.model.x,y:info.model.y-36,label:'平台质心',value:`surge ${n.surge.toFixed(2)} m`,tone:'#9be0dc'},
    {x:info.volume.x,y:info.volume.y+12,label:'fairlead',value:`tension ${(n.tension/1000).toFixed(0)} kN`,tone:'#f3c081'},
  ];
  return <>{callouts.map((c,i)=>{const x=Math.max(34,Math.min(1760,c.x)),y=Math.max(170,Math.min(820,c.y));return <div key={c.label} style={{position:'absolute',left:x,top:y,zIndex:28,transform:`translate3d(${i?'0':'-5'}px,0,0)`,color:'#ecfbfa',pointerEvents:'none'}}>
    <div style={{display:'flex',alignItems:'center',gap:9}}><span style={{width:11,height:11,borderRadius:11,background:c.tone,boxShadow:`0 0 0 5px ${c.tone}22`}}/><span style={{fontSize:22,fontWeight:650,letterSpacing:.4,textShadow:'0 2px 12px rgba(2,28,40,.7)'}}>{c.label}</span></div>
    <div style={{marginLeft:20,marginTop:4,fontSize:25,color:c.tone,fontVariantNumeric:'tabular-nums',textShadow:'0 2px 12px rgba(2,28,40,.7)'}}>{c.value}</div>
  </div>})}</>;
}
function Toolchain({s}:{s:LaunchState}){
 if(s.id!=='toolchain')return null;
 const growth=smooth((s.local-1.3)/3.5),exit=depart(s,1.8);
 return <><div style={{position:'absolute',left:96,top:565,width:325,color:ink,zIndex:24,transform:`translateX(${-slide(s,1.3)-2140*exit}px)`}}>
   <div style={{fontSize:26,letterSpacing:1.5,color:teal}}>可检查的模型</div>
   <div style={{fontSize:43,lineHeight:1.38,fontWeight:680,marginTop:20,letterSpacing:-1}}>智能体建议<br/>计算反馈</div>
   <div style={{height:3,width:212,background:'#bfd2d5',marginTop:26}}><div style={{height:3,width:`${100*growth}%`,background:teal}}/></div>
 </div><div style={{position:'absolute',right:90,top:705,width:245,zIndex:24,transform:`translateX(${slide(s,4.1)+2140*exit}px)`}}>
   {['几何与网格','优化与求解','反馈与复查'].map((name,i)=><div key={name} style={{fontSize:28,color:i===2?teal:'#496e7b',padding:'16px 0',borderBottom:'1px solid #aac3c844',transform:`translateX(${45*(1-smooth((s.local-4.1-i*.25)/.8))}px)`}}>{name}<span style={{float:'right',color:teal}}>↗</span></div>)}
 </div></>
}
function Proof({s}:{s:LaunchState}){
 if(s.id!=='proof')return null;
 const progress=smooth((s.local-1)/4),v=278-22.5*progress;
 return <div style={{position:'absolute',left:990,top:420,width:770,zIndex:27,color:ink,transform:`translateX(${slide(s,.4)-2240*depart(s,1.5)}px)`}}>
 <div style={{fontSize:30,color:'#587785'}}>单位功率用钢量</div><div style={{display:'flex',alignItems:'baseline',gap:24,marginTop:15}}><span style={{fontSize:108,fontWeight:780,fontVariantNumeric:'tabular-nums',letterSpacing:-5}}>{v.toFixed(1)}</span><span style={{fontSize:35,color:teal}}>t/MW</span></div>
 <div style={{height:10,width:660,background:'#e2b9a6',borderRadius:10,marginTop:20}}><div style={{height:10,width:`${(v/278)*100}%`,background:teal,borderRadius:10}}/></div><div style={{display:'flex',justifyContent:'space-between',width:660,marginTop:18,fontSize:27}}><span style={{color:teal}}>AI Engineer</span><span style={{color:'#ac705a'}}>图强号 278 t/MW</span></div>
 <div style={{fontSize:70,color:teal,fontWeight:750,marginTop:26}}>−{(8.1*progress).toFixed(1)}%<span style={{fontSize:29,fontWeight:500,color:'#567785',marginLeft:30}}>用钢量</span></div><div style={{fontSize:26,color:'#6c8490',marginTop:20}}>论文稿案例 · 同工况对照</div></div>
}
function Closing({s}:{s:LaunchState}){
 if(s.id!=='close')return null;
 const draw=smooth((s.local-1)/2.3);
 return <div style={{position:'absolute',left:100,top:665,width:615,height:140,zIndex:26}}>
   <svg width="615" height="85" style={{position:'absolute',left:0,top:0,overflow:'visible'}}><path d="M 10 53 C 120 53 110 47 192 47 S 330 53 374 53 S 495 47 556 47" fill="none" stroke="#bcd9de" strokeWidth="2" strokeDasharray={570} strokeDashoffset={570*(1-draw)}/></svg>
   {['需求','模型','计算','复查'].map((word,i)=>{const q=smooth((s.local-1-i*.5)/.95);return <div key={word} style={{position:'absolute',left:i*182,top:i%2?-6:0,width:122,paddingBottom:8,overflow:'hidden'}}><div style={{transform:`translateY(${112*(1-q)}px)`,fontSize:34,fontWeight:620,color:'#f1fafb',textShadow:'0 2px 12px rgba(7,35,47,.55)'}}>{word}<div style={{width:10,height:10,borderRadius:10,marginLeft:5,marginTop:13,background:i===3?'#edaa79':'#76c3c6',boxShadow:'0 0 0 4px rgba(239,247,245,.38)'}}/></div></div>})}
 </div>
}
function Caption(){const frame=useCurrentFrame(),ms=frame/fps*1000,cap=captions.find(c=>ms>=c.startMs&&ms<c.endMs);if(!cap)return null;return <div style={{position:'absolute',left:120,right:120,bottom:34,textAlign:'center',zIndex:60,pointerEvents:'none'}}><span style={{display:'inline-block',padding:'12px 30px 14px',borderRadius:9,color:'#f5fafc',background:'linear-gradient(180deg,rgba(8,39,54,.18),rgba(8,39,54,.78) 42%,rgba(8,39,54,.64))',fontSize:44,lineHeight:1.36,fontWeight:500,maxWidth:1580,textShadow:'0 2px 9px rgba(0,0,0,.35)'}}>{cap.text}</span></div>}
export const LaunchFilm:React.FC<{audio?:boolean;overlay?:boolean}>=({audio=true,overlay=true})=>{
 const frame=useCurrentFrame(),s=useMemo(()=>sceneAt(frame),[frame]),[info,setInfo]=useState<WorldInfo>();
  return <AbsoluteFill style={{fontFamily:'Microsoft YaHei, Noto Sans CJK SC, sans-serif',background:mist,overflow:'hidden'}}><Stage s={s} onInfo={setInfo}/><GeneratedLaunchBridges/>{overlay&&<><Logo/><KineticCopy s={s}/><BrowserPane s={s}/><BriefTokens s={s}/><TaskGraphOverlay s={s}/><TopologyRibbon s={s} info={info}/><PhysicalCallouts s={s} info={info}/><PhysicsReadout s={s} info={info}/><Toolchain s={s}/><Proof s={s}/><Closing s={s}/><Caption/></>}{audio&&<Audio src={staticFile('audio/launch-v3-master.wav')}/>}</AbsoluteFill>
};
export {durationInFrames,fps};
