import React from 'react';
import {AbsoluteFill, Audio, Img, staticFile, useCurrentFrame} from 'remotion';
import {VehicleStage, State} from './VehicleStage';
import timeline from '../timeline-crosschecked.json';
import data from '../physics/preview-frames-v4.json';

const cyan='#4cf2d0', amber='#ffbd69';
const titles:Record<string,string>={hover:'翻滚 ≠ 悬停',ballistic:'车身在转，质心沿原轨迹运动',couple:'能转起来，不等于能托住',fixed:'喷口翻过去，推力也转向'};
const numbers:Record<string,string>={hover:'01',ballistic:'02',couple:'03',fixed:'04'};
const label:Record<string,string>={hover:'理想悬停 · 初始静止',ballistic:'无推进 · 慢放轨迹',couple:'力偶演示 · 独立回放',fixed:'锁定位置，仅看推力方向'};
const Info:React.FC<{s:State}>=({s})=>{
 const deg=Math.round(s.phi*180/Math.PI),z=Math.cos(s.phi),y=-Math.sin(s.phi);
 const head={fontSize:23,letterSpacing:3,color:'#90a9bc'};
 const big={fontSize:58,fontWeight:650,letterSpacing:-2,lineHeight:1.3};
 return <div style={{width:450,position:'absolute',right:72,top:312,borderTop:'1px solid #3b5062',paddingTop:28}}>
  <div style={head}>机制笔记 / {numbers[s.scene]}</div>
  {s.scene==='hover'&&<>
   <div style={{...big,marginTop:30}}>保持高度<br/><span style={{color:cyan}}>要同时满足</span></div>
   <div style={{fontSize:43,marginTop:34}}>vᶻ = 0</div><div style={{fontSize:43,marginTop:10}}>Tᶻ − mg = 0</div>
   <div style={{fontSize:26,lineHeight:1.65,color:'#a4b8ca',marginTop:28}}>合力为零，只代表不再加速。<br/>已有下落速度，仍会往下走。</div>
  </>}
  {s.scene==='ballistic'&&<>
   <div style={{...big,marginTop:30}}>轨迹由<span style={{color:amber}}>合力</span><br/>决定如何改变</div>
   <div style={{fontSize:42,marginTop:30}}>z = z₀ + v₀ᶻt − ½gt²</div>
   <div style={{fontSize:26,lineHeight:1.65,color:'#a4b8ca',marginTop:28}}>旋转不抵消重力。<br/>图中仅受重力，忽略空气作用。</div>
   <div style={{fontSize:25,color:amber,marginTop:24}}>物理时间 {s.simTime.toFixed(2)} s / 1.20 s</div>
  </>}
  {s.scene==='couple'&&<>
   <div style={{...big,marginTop:30}}>推力<span style={{color:cyan}}>相互抵消</span><br/>力矩可以相加</div>
   <div style={{fontSize:41,marginTop:32}}>ΣF喷口 = 0</div><div style={{fontSize:41,marginTop:10}}>τ = r × F</div>
   <div style={{fontSize:26,lineHeight:1.65,color:'#a4b8ca',marginTop:24}}>先加速转动 → 关喷口续转<br/>反向力矩制动；质心仍下落。</div>
   <div style={{fontSize:25,color:cyan,marginTop:20}}>{s.phase==='accelerate'?'① 推力力偶启动转动':s.phase==='coast'?'② 关喷口，转动继续':s.phase==='brake'?'③ 反向力矩制动':'④ 已停转，仍在下落'}</div>
  </>}
  {s.scene==='fixed'&&<>
   <div style={{display:'flex',alignItems:'baseline',gap:18,marginTop:17}}><span style={{fontSize:106,fontWeight:650,color:cyan,lineHeight:1.2}}>{deg}°</span><span style={{fontSize:27,color:'#9bb0c3'}}>侧滚角 φ</span></div>
   <div style={{fontSize:35,marginTop:28,color:amber}}>竖直分量　T cos φ</div>
   <div style={{height:9,background:'#24323c',marginTop:17,position:'relative'}}><div style={{height:9,width:`${Math.abs(z)*100}%`,background:amber}}/></div>
   <div style={{fontSize:26,marginTop:12,color:amber}}>{Math.abs(z)<.001?'0 · 失去竖直托举':`${Math.abs(z).toFixed(2)} T · ${z>0?'向上':'向下'}`}</div>
   <div style={{fontSize:29,marginTop:26,color:'#8ca5ff'}}>横向分量　{Math.abs(y).toFixed(2)} T</div>
   <div style={{fontSize:25,lineHeight:1.65,color:'#a4b8ca',marginTop:25}}>这是受力方向拆解，<br/>不是保持高度的飞行预测。</div>
  </>}
 </div>;
};
export const Preview:React.FC=()=>{
 const frame=useCurrentFrame();const s=data[Math.min(frame,data.length-1)] as State;
 const scene=timeline.scenes.find(x=>x.id===s.scene)!;const cap=scene.captions.find(c=>frame>=c.from&&frame<c.to);
 const ease=(t:number)=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
 const inA=ease(s.local/8),inB=ease((s.local-4)/9),capIn=ease((frame-(cap?.from??0))/5);
 const capOut=Math.min(1,((cap?.to??frame)-frame)/5);
 const drift=0;
 const resetIn=scene.from===0?1:Math.min(1,s.local/6);
 const resetOut=scene.id==='fixed'?1:Math.min(1,(scene.durationInFrames-1-s.local)/6);
 const stageOpacity=Math.min(resetIn,resetOut);
 const showReset=scene.from>0&&s.local<18;
 return <AbsoluteFill style={{background:'radial-gradient(ellipse at 33% 46%, #183347 0%, #0b1725 42%, #050c16 100%)',color:'#f1f6fa',fontFamily:'"Microsoft YaHei", "Noto Sans CJK SC", sans-serif'}}>
  <Audio src={staticFile(timeline.audioFile)}/>
  <div style={{position:'absolute',top:43,left:65,display:'flex',alignItems:'center',gap:15}}><Img src={staticFile('brand-original.png')} style={{width:48,height:48,objectFit:'contain'}}/><span style={{fontSize:28,letterSpacing:1}}>rainbow鱼</span><span style={{fontSize:21,color:'#7e97ab',marginLeft:24}}>飞车镜头调查 / 机制样片</span></div>
  <div style={{position:'absolute',right:65,top:46,fontSize:23,color:amber,padding:'10px 20px',border:'1px solid #72573c',borderRadius:4}}>自制教学示意 · 非车辆实测</div>
  <div style={{position:'absolute',top:145,left:73,opacity:inA,transform:`translateY(${(1-inA)*14}px)`,fontSize:66,fontWeight:700,letterSpacing:1}}>{titles[s.scene]}</div>
  <div style={{position:'absolute',top:243,left:76,opacity:inA*.9,fontSize:24,color:'#90a8bd',letterSpacing:1}}>{label[s.scene]}</div>
  <div style={{position:'absolute',top:228,left:-drift,opacity:stageOpacity}}><VehicleStage state={s}/></div>
  {showReset&&<div style={{position:'absolute',left:450,top:790,fontSize:25,color:'#ffbd69',background:'#07131f',padding:'10px 20px',border:'1px solid #6c573b'}}>重设初始条件 · 独立示意</div>}
  <div style={{opacity:inB,transform:`translateY(${(1-inB)*12}px)`}}><Info s={s}/></div>
  <div style={{position:'absolute',left:78,bottom:151,color:'#758da3',fontSize:22}}>简化车体与假设喷口布局 · 不代表 Tesla 官方设计</div>
  <div style={{position:'absolute',left:80,right:80,bottom:51,display:'flex',justifyContent:'center',alignItems:'center'}}>
   <div style={{opacity:capIn*capOut,transform:`translateY(${(1-capIn)*10}px)`,maxWidth:1400,padding:'12px 30px 14px',borderRadius:10,background:'rgba(4,14,24,.72)',border:'1px solid rgba(120,160,190,.28)',fontSize:37,fontWeight:500,textShadow:'0 2px 8px #000',textAlign:'center'}}>{cap?.text??''}</div>
  </div>
  <div style={{position:'absolute',left:0,bottom:0,height:4,width:`${(frame+1)/timeline.durationInFrames*100}%`,background:cyan}}/>
 </AbsoluteFill>;
};
