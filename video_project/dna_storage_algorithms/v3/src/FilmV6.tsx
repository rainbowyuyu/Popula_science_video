import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,cancelRender,continueRender,delayRender,staticFile,useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {WorldV6 as World} from './WorldV6';
import {sceneTimeV6,sceneNarrationV6 as narration} from './TimelineV6';
import {ERROR_EVENTS_V6,CONSTRAINT_EVENTS_V6,eventActionProgressV6} from './EventsV6';
import {STATIONS,sampleCamera} from './CameraPathV6';
import captions from './captions-v6.json';
import {clamp,ease} from './scene/primitivesV6';

const font='"Microsoft YaHei", "Arial", sans-serif';
function Scene({frame}:{frame:number}){
 const{scene,camera,gl}=useThree();const world=useRef<World|null>(null);const frameRef=useRef(frame);frameRef.current=frame;const[handle]=useState(()=>delayRender('Load verified GLB geometry', {timeoutInMilliseconds:120000}));
 useLayoutEffect(()=>{let active=true;const w=new World(scene,camera as T.PerspectiveCamera,gl);world.current=w;w.loadAssets(staticFile).then(()=>{if(active){w.render(frameRef.current/30);continueRender(handle);}}).catch(cancelRender);return()=>{active=false;w.dispose();world.current=null;};},[scene,camera,gl,handle]);
 useLayoutEffect(()=>{world.current?.render(frame/30,false);},[frame]);return null;
}
function Brand(){return<div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,color:'#173c46',fontSize:44,fontWeight:700,zIndex:10}}><Img src={staticFile('brand/logo.png')} style={{width:76,height:90,objectFit:'contain',mixBlendMode:'multiply'}}/><span>rainbow鱼</span></div>;}
function Caption({frame}:{frame:number}){const c=captions.find(c=>frame>=c.startFrame&&frame<c.endFrame);if(!c)return null;return<div style={{position:'absolute',bottom:42,left:90,right:90,display:'flex',justifyContent:'center',pointerEvents:'none',zIndex:12}}><div style={{fontSize:48,lineHeight:1.32,color:'#f8fcf8',padding:'11px 26px 14px',borderRadius:10,background:'rgba(18,48,54,.92)',boxShadow:'0 6px 26px #183b4414',fontWeight:500,maxWidth:1680,textAlign:'center'}}>{c.text}</div></div>;}
type Callout={text:string;station:number;from:number;to:number;point:[number,number,number];offset:[number,number];color?:string};
const callouts:Callout[]=[
 {text:'ATCG',station:1,from:27,to:39,point:[2.9,2,0],offset:[240,-30]},
 {text:'位置编号',station:2,from:47,to:54,point:[-3.3,1.2,.2],offset:[-120,-104]},
 {text:'连续重复 → 退回',station:2,from:58,to:67,point:[4,2,.7],offset:[-100,100],color:'#b5654c'},
 {text:'GC 占比 50%',station:2,from:64,to:71,point:[0,-1.9,.3],offset:[230,25]},
 {text:'原始片段',station:3,from:79,to:87,point:[-4,2,.2],offset:[-50,-150]},
 {text:'顺着关系，找回来',station:3,from:105,to:114,point:[0,2.5,.1],offset:[340,-80]},
 {text:'按顺序合成',station:4,from:122,to:132,point:[-3.9,1.4,0],offset:[100,-150]},
 {text:'替换',station:4,from:137,to:145,point:[2.16,1.4,1.16],offset:[-400,-100],color:'#b5654c'},
 {text:'插入',station:4,from:145,to:150,point:[2.5,.28,1.16],offset:[-350,100],color:'#b5654c'},
 {text:'缺失',station:4,from:150,to:156,point:[2.84,-.84,1.16],offset:[300,-50],color:'#b5654c'},
 {text:'同地址，先放一起',station:5,from:164,to:174,point:[-1,2.05,.4],offset:[130,-15]},
 {text:'局部对齐',station:5,from:178,to:188,point:[4.5,1.5,.1],offset:[100,-100]},
 {text:'共识序列',station:5,from:194,to:207,point:[0,-1.95,1.2],offset:[600,-50]},
 {text:'k-mer 或 BPE',station:6,from:221,to:230,point:[-3,1.2,0],offset:[-200,100]},
 {text:'预测 → 试验 → 反馈',station:6,from:235,to:248,point:[.8,.4,0],offset:[100,-100]},
 {text:'候选仍需实验检查',station:6,from:250,to:258,point:[3.6,1.5,.3],offset:[-100,-150]},
 {text:'校验一致',station:7,from:270,to:286,point:[-2,1.7,.1],offset:[650,-200]},
];
// Labels follow the recorded voice windows, not estimated speaking speed.
const voiceLabels:Record<string,string>={'同一段回忆':'n01','液滴里的文件':'n02','ATCG':'n05','位置编号':'n09','连续重复 → 退回':'n08','GC 占比 50%':'n07','原始片段':'n11','顺着关系，找回来':'n14','按顺序合成':'n16','同地址，先放一起':'n22','局部对齐':'n25','共识序列':'n27','k-mer 或 BPE':'n31','预测 → 试验 → 反馈':'n32','候选仍需实验检查':'n33','校验一致':'n35'};
for(const callout of callouts){const cueId=voiceLabels[callout.text];const cue=narration.cues.find(c=>c.id===cueId);if(cue){callout.from=cue.startSec;callout.to=cue.endSec;}}
for(const event of ERROR_EVENTS_V6){const callout=callouts.find(c=>c.text===event.label);if(callout){callout.from=event.sceneStartSec;callout.to=event.sceneEndSec;}}
function Callouts({time}:{time:number}){
 const pose=sampleCamera(time);const camera=new T.PerspectiveCamera(pose.fov,1920/1080,.05,250);camera.position.set(...pose.position);camera.lookAt(...pose.target);camera.rotateZ(T.MathUtils.degToRad(pose.rollDeg));camera.updateMatrixWorld(true);
 return<>{callouts.filter(c=>time>=c.from&&time<c.to).map(c=>{const point=[...c.point];if(c.text==='连续重复 → 退回'){const q=eventActionProgressV6(CONSTRAINT_EVENTS_V6[0],time,2.6);point[0]=3.4+5.4*q;point[1]=1.65+11.5*q;}const world=new T.Vector3(point[0]+STATIONS[c.station].origin[0],point[1],point[2]);const p=world.project(camera);if(Math.abs(p.x)>1||Math.abs(p.y)>1||p.z>1)return null;const x=(p.x*.5+.5)*1920,y=(.5-p.y*.5)*1080;const a=ease((time-c.from)/.7)*ease((c.to-time)/.6);const labelWidth=[...c.text].reduce((sum,ch)=>sum+(/[\u2e80-\u9fff\uff00-\uffef]/.test(ch)?44:30),24);const lx=Math.max(92,Math.min(1828-labelWidth,x+c.offset[0])),ly=Math.max(210,Math.min(875,y+c.offset[1]));return<React.Fragment key={c.text+c.from}><svg width={1920} height={1080} style={{position:'absolute',inset:0,opacity:a,pointerEvents:'none'}}><path d={`M${x},${y} L${lx+8},${ly+44}`} fill="none" stroke={c.color??'#547b79'} strokeWidth={1.6}/><circle cx={x} cy={y} r={4} fill={c.color??'#168e92'}/></svg><div style={{position:'absolute',left:lx,top:ly,opacity:a,color:c.color??'#17444b',fontSize:44,fontWeight:650,lineHeight:1.15,background:'rgba(237,241,234,.91)',padding:'5px 10px',borderRadius:5,whiteSpace:'nowrap',transform:`translateY(${(1-a)*6}px)`}}>{c.text}</div></React.Fragment>;})}</>;
}
function Titles({t}:{t:number}){if(t>6.8)return null;const q=ease((t-.25)/.85)*ease((6.8-t)/1.2);return<div style={{position:'absolute',left:90,top:145,opacity:q,color:'#17343e',transform:`translateY(${(1-q)*22}px)`,fontWeight:750,fontSize:82,lineHeight:1.15,letterSpacing:-2}}>一段回忆，存进DNA</div>;}
function Coda({t}:{t:number}){if(t<290)return null;const q=ease((t-290)/3);const slide=(1-q)*2100;
 return<div style={{position:'absolute',inset:0,transform:`translateX(${slide}px)`,color:'#173e48',pointerEvents:'none'}}>
  <div style={{position:'absolute',left:104,top:191,fontSize:66,fontWeight:750}}>把记忆找回来的科学</div>
  <div style={{position:'absolute',left:150,top:305,width:690,height:545,perspective:1400}}>
   <Img src={staticFile('papers/nucleotide-transformer-2024-01.png')} style={{position:'absolute',left:265,top:10,width:342,height:454,objectFit:'cover',objectPosition:'top',transform:'rotate(9deg)',boxShadow:'12px 18px 42px #24474528'}}/>
   <Img src={staticFile('papers/dna-fountain-preprint-01.png')} style={{position:'absolute',left:40,top:25,width:353,height:458,objectFit:'cover',objectPosition:'top',transform:'rotate(-7deg)',boxShadow:'12px 18px 42px #24474536'}}/>
  </div>
  <div style={{position:'absolute',left:142,top:815,fontSize:36,lineHeight:1.32,fontWeight:550}}><div>DNA Fountain · Erlich &amp; Zielinski</div><div style={{color:'#527b77',marginBottom:12}}>2017 · 展示预印本页</div><div>Nucleotide Transformer · Dalla-Torre 等</div><div style={{color:'#527b77'}}>2024 · 在线发表</div></div>
  <div style={{position:'absolute',left:965,top:355,width:820}}>
   {['gc','xor','consensus'].map((name,i)=><div key={name} style={{display:'flex',alignItems:'center',height:153,gap:32,borderBottom:'1px solid #b7cac0'}}><span style={{fontSize:38,width:168,flexShrink:0,whiteSpace:'nowrap'}}>{['序列质检','冗余恢复','共识恢复'][i]}</span><Img src={staticFile(`formulas/${name}.svg`)} style={{width:605,height:100,objectFit:'contain',objectPosition:'left center'}}/></div>)}
  </div>
  <div style={{position:'absolute',left:998,top:840,fontSize:36,color:'#39726f',letterSpacing:1}}>encode → synthesize → sequence → decode</div>
 </div>;
}
export function FilmV6({audio=false}:{audio?:boolean}){const frame=useCurrentFrame(),t=sceneTimeV6(frame/30);return<AbsoluteFill style={{background:'#edf1ea',overflow:'hidden',fontFamily:font}}>
 <ThreeCanvas width={1920} height={1080} camera={{position:[0,3,17],fov:40,near:.05,far:250}} gl={{antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'}}><Scene frame={t*30}/></ThreeCanvas>
 <AbsoluteFill style={{background:'linear-gradient(0deg,rgba(237,241,234,.42),rgba(237,241,234,0) 17%,rgba(237,241,234,0) 85%,rgba(237,241,234,.18))',pointerEvents:'none'}}/>
 <Brand/><Titles t={t}/><Callouts time={t}/><Coda t={t}/><Caption frame={frame}/>
 {audio&&<Audio src={staticFile('audio/v6/master.wav')}/>}
 </AbsoluteFill>;}
