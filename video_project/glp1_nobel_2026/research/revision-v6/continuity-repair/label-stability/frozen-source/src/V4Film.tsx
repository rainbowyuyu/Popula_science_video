import React,{useEffect,useLayoutEffect,useRef,useState,useCallback} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {V4World} from './V4World';
import {V4View,viewOf} from './V4CameraPath';
import {TYPOGRAPHY} from './Scale';
import {C,stateAt,smooth,Timeline,FrameState} from './visual';
import tlData from './timeline.json';

const timeline=tlData as Timeline;
type Projected={text:string;x:number;y:number;left:number;top:number;width:number;color:string;opacity:number};
const titles:[number,number,string][]=[
 [1,3,'科学减重\n读懂三高'],[4,6,'一顿饭\n怎样分给全身'],[7,9,'腰围变大以后'],
 [10,12,'肠道\n也会传消息'],[13,15,'胰腺里的小岛'],[16,17,'走近一颗细胞'],
 [18,20,'膜上的接收器'],[21,23,'从接收\n到释放'],[24,25,'肝脏\n还在运送脂肪'],
 [26,28,'血液里的\n运输颗粒'],[29,29,'送出去\n也要收回来'],[30,31,'血液\n怎样产生压力'],
 [32,34,'小动脉\n调节阻力'],[35,39,'水和盐\n也牵动血压'],[40,42,'调节\n牵动全身'],
 [43,45,'颗粒留在了\n管壁里面'],[46,48,'管壁里的\n变化'],[49,49,'供血一旦中断'],
 [50,50,'放在一起看\n分别处理'],[51,54,'下一顿饭\n怎样改'],[55,55,'适合自己\n再做选择'],
 [56,58,'减重时\n把肌肉留下'],[59,59,'也照顾好睡眠'],[60,61,'血压\n安静下来再测'],
 [62,65,'带着记录\n一起定计划'],[66,68,'食欲调节\n也是研究的问题'],[69,70,'照顾好自己\n及时求助'],
 [71,72,'从今天的一小步\n慢慢开始'],
];

function WorldLayer({frame,onLabels,onDistance}:{frame:number;onLabels:(x:Projected[])=>void;onDistance:(d:number)=>void}){
 const {scene,camera,gl}=useThree();const world=useRef<V4World|null>(null);const current=useRef(frame);current.current=frame;const [ready,setReady]=useState(false);
 const [handle]=useState(()=>delayRender('Loading shared metre-scale anatomy',{timeoutInMilliseconds:180000}));
 const render=useCallback((f:number)=>{
  const w=world.current;if(!w)return;const state=stateAt(f,timeline);w.update(state);onDistance(w.cameraPath.sample(f).distance);
  const output:Projected[]=[];
  for(const label of w.labels(state).slice(0,3)){
   if(!label.point||(label.weight??1)<.10)continue;
   const p=label.point.clone().project(camera);if(p.z< -1||p.z>1)continue;
   const x=(p.x+1)*960,y=(1-p.y)*540;if(x<660||x>1805||y<180||y>855)continue;
   const width=Array.from(label.text).reduce((sum,c)=>sum+(c.charCodeAt(0)<128?22:38),0)+12;
   const right=label.side!=='left';let left=right?Math.min(1825-width,Math.max(1410,x+115)):Math.max(790,Math.min(1070-width,x-width-100));
   let top=Math.max(380,Math.min(798,y-58));
   for(const offset of [0,94,-94,188,-188]){
    const candidate=Math.max(380,Math.min(798,top+offset));
    if(output.every(q=>Math.abs(q.top-candidate)>72||left+width+28<q.left||left>q.left+q.width+28)){top=candidate;break;}
   }
   output.push({text:label.text,x,y,left,top,width,color:label.color??C.teal,opacity:label.weight??1});
  }
  onLabels(output);gl.render(scene,camera);
 },[camera,gl,onLabels,onDistance,scene]);
 useLayoutEffect(()=>{
  const w=new V4World(scene,camera as T.PerspectiveCamera,gl,staticFile(''),timeline);world.current=w;let live=true;
  w.ready.then(()=>{if(!live)return;render(current.current);setReady(true);continueRender(handle)}).catch(cancelRender);
  return()=>{live=false;w.dispose();world.current=null;continueRender(handle)};
 },[scene,camera,gl,handle,render]);
 useLayoutEffect(()=>{if(ready)render(frame)},[frame,ready,render]);return null;
}

/** Fixed-length ruler at the camera focus plane. Present in every anatomy shot. */
function Ruler({distance}:{distance:number}){
 const metres=2*distance*Math.tan(17*Math.PI/180)*190/1080;
 const [unit,factor]:[string,number]=metres>=1?['米',1]:metres>=.01?['厘米',100]:metres>=1e-3?['毫米',1000]:metres>=1e-6?['微米',1e6]:['纳米',1e9];
 const value=Number((metres*factor).toPrecision(2));
 return <div style={{position:'absolute',right:78,bottom:168,width:300,textAlign:'right',color:'#335955',fontSize:38,fontWeight:550,zIndex:20,padding:'14px 18px',borderRadius:12,background:'rgba(242,238,231,.78)'}}>
  <span style={{fontVariantNumeric:'tabular-nums'}}>{value}</span> {unit}
  <div style={{height:12,width:190,marginLeft:'auto',marginTop:10,borderBottom:'3px solid #52756d',borderLeft:'3px solid #52756d',borderRight:'3px solid #52756d'}}/>
 </div>;
}

function DetailNote({s,distance}:{s:FrameState;distance:number}){
 const view=viewOf(s.clip),n=Number(s.clip.id.slice(1));let text='';
 if(['islet','beta','receptor','secretion'].includes(view))text=distance>.01?'从同一个位置，逐层走近':distance>.00015?'示意胰岛 · 150 微米':distance>8e-6?'示意 β 细胞 · 15 微米':distance>200e-9?'继续走近这片细胞膜':'GLP-1R · 实验结构 5VAI';
 if(view==='lcell')text='从肠壁，走近发信的细胞';
 if(view==='lipoprotein')text='从血液，走近纳米级颗粒';
 if(view==='arteriole')text='管壁平滑肌收缩 → 阻力增加';
 if(view==='nephron')text='过滤 → 回收 → 排出';
 if(view==='lipid_wall')text='局部结构与过程为教学示意';
 if(view==='autonomic')text=n<=42?'交感调节 · 功能示意':'肠道与大脑 · 调节示意';
 if(n===27)text='LDL-C：颗粒携带的胆固醇';
 if(n===54)text='一般成人 · 每日食盐 < 5 克';
 if(n===58)text='按能力开始，逐步增加';
 if(n===70)text='疑似卒中或心梗 · 立即 120';
 if(!text)return null;
 return <div style={{position:'absolute',left:90,top:500,width:580,color:'#52716b',fontSize:38,lineHeight:1.55,fontWeight:500}}>{text}</div>;
}

function Experiment({s}:{s:FrameState}){
 const n=Number(s.clip.id.slice(1));if(n!==10&&n!==20)return null;
 const progress=smooth(s.clipProgress*2.2);
 return <div style={{position:'absolute',left:90,top:560,width:560,fontSize:38,lineHeight:1.6,color:C.ink}}>
  {n===10?<>
   <div>喝糖水　／　静脉输糖</div><div style={{marginTop:20,color:C.teal}}>让血糖水平相近</div>
   <div style={{marginTop:18,opacity:progress}}>再比较胰岛素反应</div>
  </>:<>
   <div>1987 · 活性片段实验</div><div style={{marginTop:24}}>37 残基　→　31 残基</div>
   <div style={{marginTop:20,color:C.teal,opacity:progress}}>短片段：促进胰岛素释放</div>
  </>}
 </div>;
}

function Coda({frame}:{frame:number}){
 const start=timeline.clips.at(-1)!.end;if(frame<start)return null;
 const elapsed=(frame-start)/30;
 const papers=[
  {file:'mojsov1987_page1.jpg',title:'Mojsov 等 · 1987',note:'GLP-1 活性片段研究'},
  {file:'salt-mechanism-paper-page.png',title:'Maaliki 等 · 2022',note:'盐敏感性高血压机制'},
  {file:'discovery2019_page1.jpg',title:'Knudsen、Lau · 2019',note:'从天然信号到药物设计'},
 ];
 const arrival=smooth(elapsed/1.65);
 return <div style={{position:'absolute',inset:0,background:C.paper,zIndex:15,transform:`translateX(${1920*(1-arrival)}px)`}}>
  <div style={{position:'absolute',left:90,top:185,fontSize:70,fontWeight:650,color:C.ink}}>从原理，走回生活</div>
  {papers.map((p,i)=>{const u=smooth((elapsed-i*.25)/2);return <div key={p.file} style={{position:'absolute',left:300+i*440+180*(1-u),top:310+i%2*20,width:430,opacity:u}}>
   <Img src={staticFile('papers/'+p.file)} style={{width:430,height:540,objectFit:'cover',objectPosition:'top',transform:`rotate(${(i-1)*2}deg)`,boxShadow:'0 18px 35px #40504624'}}/>
   <div style={{marginTop:24,fontSize:36,fontWeight:600}}>{p.title}</div><div style={{fontSize:36,marginTop:8,color:'#5d756f'}}>{p.note}</div>
  </div>})}
 </div>;
}

export function V4Film({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){
 const frame=useCurrentFrame(),s=stateAt(frame,timeline),n=Number(s.clip.id.slice(1));
 const [labels,setLabels]=useState<Projected[]>([]),[distance,setDistance]=useState(1);
 const onLabels=useCallback((v:Projected[])=>setLabels(v),[]),onDistance=useCallback((d:number)=>setDistance(d),[]);
 const group=titles.find(t=>n>=t[0]&&n<=t[1])??titles.at(-1)!;const groupStart=timeline.clips[group[0]-1].start;
 const reveal=smooth((frame-groupStart+8)/42),caption=timeline.captions.find(c=>frame>=c.start&&frame<c.end);
 const coda=frame>=timeline.clips.at(-1)!.end;
 const [fontHandle]=useState(()=>delayRender('Loading one shared type family'));
 useEffect(()=>{new FontFace('Rainbow Sans',`url(${staticFile('fonts/unified.woff2')})`,{weight:'100 900',style:'normal'}).load().then(font=>{document.fonts.add(font);continueRender(fontHandle)}).catch(cancelRender)},[fontHandle]);
 return <AbsoluteFill style={{background:C.paper,fontFamily:TYPOGRAPHY.family,color:C.ink}}>
  <ThreeCanvas width={1920} height={1080} dpr={1} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} camera={{fov:34,near:.00001,far:12}}><WorldLayer frame={frame} onLabels={onLabels} onDistance={onDistance}/></ThreeCanvas>
  {!clean&&<>
   {!coda&&<>
    <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'linear-gradient(90deg,rgba(242,238,231,.97),rgba(242,238,231,.90) 25%,rgba(242,238,231,0) 47%)'}}/>
    <div style={{position:'absolute',left:90,top:212,width:660,transform:`translateX(${-18*(1-reveal)}px)`,opacity:.25+.75*reveal}}>
     <div style={{fontSize:36,fontWeight:500,color:'#617b73',marginBottom:22}}>每天5分钟科普 · 特别篇</div>
     <div style={{fontSize:72,lineHeight:1.30,fontWeight:650,whiteSpace:'pre-line'}}>{group[2]}</div>
    </div>
    {n<=3?<div style={{position:'absolute',left:90,top:530,fontSize:38,lineHeight:1.65,color:'#52716b'}}>血糖 · 血压 · 血脂<br/>心脑血管健康：原理与管理</div>:<DetailNote s={s} distance={distance}/>}
    <Experiment s={s}/><Ruler distance={distance}/>
    {labels.map((l,i)=>{const targetX=l.x<l.left?l.left:l.x>l.left+l.width?l.left+l.width:l.left+l.width*.5;const targetY=l.top+52;return <React.Fragment key={i}>
     <svg width={1920} height={1080} style={{position:'absolute',inset:0,opacity:l.opacity,pointerEvents:'none'}}><path d={`M${l.x},${l.y} Q${(l.x+targetX)/2},${targetY} ${targetX},${targetY}`} stroke={l.color} fill="none" strokeWidth={2}/><circle cx={l.x} cy={l.y} r={4.5} fill={l.color}/></svg>
     <div style={{position:'absolute',left:l.left,top:l.top,fontSize:38,fontWeight:550,color:C.ink,whiteSpace:'nowrap',opacity:l.opacity,textShadow:'0 2px 8px #f2eee7,0 0 8px #f2eee7'}}>{l.text}</div>
    </React.Fragment>})}
    {caption&&<div style={{position:'absolute',bottom:38,left:90,right:90,textAlign:'center'}}><span style={{fontSize:48,lineHeight:1.45,fontWeight:500,display:'inline-block',padding:'10px 28px',borderRadius:16,background:'rgba(248,245,239,.94)',color:'#25413e',boxShadow:'0 4px 24px #21382d08'}}>{caption.text}</span></div>}
   </>}
   <Coda frame={frame}/>
   <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:30}}><Img src={staticFile('brand/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span style={{fontSize:44,fontWeight:600}}>rainbow鱼</span></div>
  </>}
  {audio&&<Audio src={staticFile('master.wav')}/>}
 </AbsoluteFill>;
}
