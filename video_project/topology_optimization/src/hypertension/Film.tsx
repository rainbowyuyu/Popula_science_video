import React,{useLayoutEffect,useRef,useState,useMemo} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {HypertensionWorld,FrameState,clamp,smooth} from './World';
import timeline from './timeline.json';
import physics from '../../public/hypertension/physics.json';
import {drawAnnotations} from './Annotations';

const ink='#263e43', muted='#557174', coral='#ad5147', teal='#38888d', paper='#f2eee7';
const face='Microsoft YaHei, sans-serif';
const headings:Record<string,string>={intro:'没感觉，为什么血压高？',anatomy:'跟着一次心跳',pump:'一高一低，从哪儿来',resistance:'小动脉，改变阻力',kidney:'水和盐，谁来调节',control:'身体里的升压信号',remodel:'主动脉的弹性，与血脂',measure:'看懂了，也记得量一量'};

export function stateAt(frame:number):FrameState{
 let i=timeline.scenes.findIndex(s=>frame>=s.start&&frame<s.end);if(i<0)i=timeline.scenes.length-1;
 const s=timeline.scenes[i],cs=timeline.clips.filter(c=>c.scene===s.id),c=cs.filter(c=>frame>=c.start).at(-1)??cs[0];
 return {scene:s.id,previous:timeline.scenes[i-1]?.id,elapsed:(frame-s.start)/30,duration:(s.end-s.start)/30,progress:clamp((frame-s.start)/(s.end-s.start)),time:frame/30,line:c?.line??0,lineProgress:c?clamp((frame-c.start)/c.duration):0};
}

function Stage({state,clean=false}:{state:FrameState;clean?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),labels=useRef<HTMLCanvasElement>(null),world=useRef<HypertensionWorld|null>(null),ready=useRef(false),latest=useRef(state);latest.current=state;
 const [handle]=useState(()=>delayRender('Loading BodyParts3D anatomy and simulated pressure traces'));
 useLayoutEffect(()=>{const w=new HypertensionWorld(canvas.current!,staticFile('hypertension/'));world.current=w;w.ready.then(()=>{ready.current=true;w.render(latest.current);drawAnnotations(labels.current!,w,latest.current);continueRender(handle)}).catch(cancelRender);return()=>{ready.current=false;w.dispose();world.current=null}},[]);
 useLayoutEffect(()=>{if(ready.current&&world.current){world.current.render(state);drawAnnotations(labels.current!,world.current,state)}},[state]);
 return <><canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/><canvas ref={labels} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',opacity:clean?0:1}}/></>;
}

function Brand(){return <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,color:ink,fontSize:44,fontFamily:face,fontWeight:600,zIndex:30}}><Img src={staticFile('hypertension/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span>rainbow鱼</span></div>}

function Heading({s}:{s:FrameState}){
 if(s.scene==='references')return null;
 const arrival=s.scene==='intro'?smooth(s.elapsed/1.2):smooth((s.elapsed-.6)/1.5);
 // Keep the opening title readable through the cuff close-up.  The previous
 // 5.7 s exit began while the camera was still settling on the arm, leaving
 // the heading clipped against the left edge in an otherwise steady shot.
 // Let it travel off during the hand-off to the monitor instead.
 const exit=smooth((s.elapsed-(s.scene==='intro'?7.2:5.7))/1.5);
 const x=(1-arrival)*2050-exit*2050;
 return <div style={{position:'absolute',left:64,top:182,transform:`translateX(${x}px)`,fontFamily:face,color:ink,fontSize:s.scene==='intro'?76:72,fontWeight:700,letterSpacing:1}}>{headings[s.scene]}</div>;
}

function Caption({text}:{text:string}){return <div style={{position:'absolute',left:120,right:120,bottom:34,textAlign:'center',zIndex:25,fontFamily:face,fontSize:46,fontWeight:500,lineHeight:1.4}}><span style={{display:'inline-block',padding:'10px 27px 12px',background:'rgba(34,57,61,.93)',color:'#fffdf6',borderRadius:12,boxShadow:'0 8px 28px #263e4312'}}>{text}</span></div>}

function clipAt(s:FrameState){return timeline.clips.filter(c=>c.start<=s.time*30).at(-1);}
function LearningCue({s}:{s:FrameState}){
 const id=clipAt(s)?.id??'';
 const labels:Record<string,string>={
  h008:'压强 = 力 ÷ 面积',h009:'主动脉 · 弹性管壁',h011:'收缩 · 管壁扩张',h012:'舒张 · 弹性回缩',
  h014:'活动后，循环加快',h015:'安静状态 · 反复测量',h018:'平滑肌收缩',
  h021:'许多小动脉，持续偏紧',h022:'肌肉松弛 · 阻力下降',h026:'水与钠 · 回收与排出',h027:'水钠潴留',
  h031:'肾素信号',h032:'血管紧张素 II · 醛固酮',h034:'交感神经',h035:'心脏、血管与肾脏',
  h038:'主动脉 · 弹性减弱',h040a:'肝脏释放 VLDL',h040b:'VLDL → IDL → LDL',h040c:'肝脏受体 · 回收 LDL',
  h041:'LDL 滞留内膜',h042:'泡沫细胞 → 斑块',h043:'斑块破裂 · 血栓风险',h044:'心、脑、肾',
  h045:'少盐 · 活动 · 管理体重',h046:'按医嘱管理',h047:'安静坐 5 分钟',h048:'合适袖带 · 不说话',h049:'反复偏高，及时就医'
 };
 const label=labels[id];if(!label)return null;
 const shift=-(1-smooth(s.lineProgress/.14))*1400-1400*smooth((s.lineProgress-.86)/.14);
 return <div style={{position:'absolute',left:70,top:787,transform:`translateX(${shift}px)`,fontFamily:face,color:ink,fontSize:46,fontWeight:600,padding:'11px 22px',background:'#f2eee7ed',borderLeft:`5px solid ${teal}`,borderRadius:4}}>{label}</div>;
}

function PressurePlot({s}:{s:FrameState}){
 const id=clipAt(s)?.id;const show=['h013','h019','h020','h039','h040'].includes(id??'');
 if(!show)return null;
 if(s.scene==='resistance'){
  const start=timeline.clips.find(c=>c.id==='h018')!.start/30,constriction=.30*smooth((s.time-start)/4),ratio=1/Math.pow(1-constriction,4);
  const offset=2040*(1-smooth(s.lineProgress/.14))+2040*smooth((s.lineProgress-.88)/.12);
  return <div style={{position:'absolute',right:75,top:180,color:ink,fontFamily:face,transform:`translateX(${offset}px)`,background:'#f2eee7e8',padding:'20px 26px',borderRadius:16}}>
   <div style={{fontSize:38,color:muted}}>维持同样流量</div><div style={{fontSize:64,fontWeight:650,marginTop:8}}>压差 {ratio.toFixed(1)} 倍</div>
   <div style={{fontSize:36,color:muted,marginTop:10}}>理想圆管 · 半径变化示意</div>
  </div>;
 }
 const base=physics.cases.baseline,second=s.scene==='remodel'?physics.cases.stiffer_artery:physics.cases.higher_resistance;
 const isPump=s.scene==='pump';const w=570,h=148;
 const curve=(rows:typeof base.samples)=>rows.map((p,i)=>`${i?'L':'M'}${(p.phase*w).toFixed(2)},${(h-(p.pressure-40)/125*h).toFixed(2)}`).join(' ');
 const phase=(s.time%base.period)/base.period;
 const p=base.samples[Math.floor(phase*300)];
 const offset=2040*(1-smooth(s.lineProgress/.16))+2040*smooth((s.lineProgress-.86)/.14);
 return <div style={{position:'absolute',right:65,top:155,width:590,padding:'18px 22px',background:'#f2eee7ee',borderRadius:14,fontFamily:face,transform:`translateX(${offset}px)`,color:ink}}>
  <div style={{fontSize:36,fontWeight:600,display:'flex',justifyContent:'space-between'}}><span>{isPump?'一次心跳的压力':s.scene==='remodel'?'弹性减弱':'阻力增加'}</span><span style={{fontSize:36,color:muted}}>mmHg</span></div>
  <svg width={580} height={164} viewBox={`0 0 ${580} 164`} style={{overflow:'visible',marginTop:13}}>
   {[60,100,140].map(value=><line key={value} x1={0} x2={w} y1={h-(value-40)/125*h} y2={h-(value-40)/125*h} stroke='#51777b22' strokeWidth={1}/>)}
   <path d={curve(base.samples)} fill='none' stroke={teal} strokeWidth={5} strokeLinecap='round'/>
   {!isPump&&<path d={curve(second.samples)} fill='none' stroke={coral} strokeWidth={5} strokeLinecap='round'/>}
   <line x1={phase*w} x2={phase*w} y1={0} y2={h} stroke='#263e4333' strokeWidth={2}/>
   <circle cx={phase*w} cy={h-(p.pressure-40)/125*h} r={7} fill={teal}/>
  </svg>
  <div style={{fontSize:34,display:'flex',gap:25}}><span style={{color:teal}}>{isPump?'收缩 / 舒张':'弹性正常'} {Math.round(base.systolic)}/{Math.round(base.diastolic)}</span>{!isPump&&<span style={{color:coral}}>{Math.round(second.systolic)}/{Math.round(second.diastolic)}</span>}</div>
  <div style={{fontSize:36,color:muted,marginTop:6}}>教学简化模型 · 非诊断数值</div>
 </div>;
}

function References({s}:{s:FrameState}){
 const x=2100*(1-smooth(s.elapsed/1.8));
 const mainLift=50*(1-smooth((s.elapsed-.5)/1.7)),guideLift=70*(1-smooth((s.elapsed-1)/1.7));
 return <AbsoluteFill style={{transform:`translateX(${x}px)`,background:paper,color:ink,fontFamily:face}}>
  <div style={{position:'absolute',left:68,top:180,fontSize:72,fontWeight:700}}>从身体，到模型</div>
  <div style={{position:'absolute',left:73,top:315,width:750}}>
   <div style={{fontSize:36,color:muted,marginBottom:10}}>压力与流量</div>
   <Img src={staticFile('hypertension/references/pressure-law.png')} style={{width:700,height:100,objectFit:'contain',objectPosition:'left',mixBlendMode:'multiply'}}/>
   <div style={{fontSize:36,color:muted,marginTop:28}}>动脉储能 · Windkessel</div>
   <Img src={staticFile('hypertension/references/windkessel.png')} style={{width:730,height:105,objectFit:'contain',objectPosition:'left',mixBlendMode:'multiply'}}/>
   <div style={{fontSize:36,color:muted,marginTop:42,lineHeight:1.65}}>人体 · BodyParts3D / human-atlas<br/>动画 · Three.js + Remotion<br/>计算 · SciPy 集总参数模型</div>
  </div>
  <div style={{position:'absolute',left:980,top:220,width:810,height:790}}>
   <div style={{position:'absolute',left:440,top:40,transform:`translateY(${guideLift}px)`}}><Img src={staticFile('hypertension/references/measurement-page.png')} style={{width:330,height:427,objectFit:'cover',transform:'rotate(3deg)',boxShadow:'0 16px 44px #263e4324'}}/><div style={{fontSize:36,lineHeight:1.4,marginTop:45}}>家庭血压测量<br/><span style={{color:muted}}>NHLBI · 2023</span></div></div>
   <div style={{position:'absolute',left:0,top:0,transform:`translateY(${mainLift}px)`}}><Img src={staticFile('hypertension/references/salt-mechanism-paper-page.png')} style={{width:408,height:558,objectFit:'cover',transform:'rotate(-2deg)',boxShadow:'0 22px 46px #263e4330'}}/><div style={{fontSize:36,lineHeight:1.4,marginTop:40}}>盐敏感与血压机制<br/><span style={{color:muted}}>Maaliki 等 · 2022</span></div></div>
  </div>
  <div style={{position:'absolute',left:73,bottom:55,fontSize:36,color:muted}}>解剖素材：DBCLS · CC BY 4.0　｜　完整来源见随片说明</div>
 </AbsoluteFill>;
}

export function HypertensionFilm({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){
 const f=useCurrentFrame(),s=useMemo(()=>stateAt(f),[f]),cap=timeline.captions.find(c=>f>=c.start&&f<c.end);
 return <AbsoluteFill style={{background:paper,overflow:'hidden'}}><Stage state={s} clean={clean}/>{!clean&&<><Heading s={s}/><LearningCue s={s}/><PressurePlot s={s}/>{s.scene==='references'&&<References s={s}/>}<Brand/>{['anatomy','pump','resistance','kidney','control','remodel'].includes(s.scene)&&<div style={{position:'absolute',left:65,bottom:155,fontFamily:face,fontSize:34,color:muted}}>{s.scene==='resistance'?'小动脉 · 微观放大示意':['h025','h026','h027','h028'].includes(clipAt(s)?.id??'')?'肾单位 · 微观放大示意':['h040a','h040b','h040c'].includes(clipAt(s)?.id??'')?'脂蛋白运输示意':'机制示意'}</div>}{cap&&s.scene!=='references'&&<Caption text={cap.text}/>}</>}{!clean&&<div style={{position:'absolute',inset:0,boxShadow:'inset 0 0 120px #faf8f315',pointerEvents:'none'}}/>}{audio&&!clean&&<Audio src={staticFile('hypertension/master.wav')}/>}</AbsoluteFill>;
}
