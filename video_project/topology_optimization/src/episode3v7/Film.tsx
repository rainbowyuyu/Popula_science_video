import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {JoineryWorld,FrameState,clamp,smooth} from './World';
import rawTimeline from './timeline.json';
const timeline=rawTimeline as {duration:number;scenes:{id:string;start:number;end:number}[];clips:{scene:string;start:number;duration:number;line:number}[];captions:{start:number;end:number;text:string}[]};

const ink='#293b32',pine='#446557',paper='#eee7d8',gold='#a87840';
const headings:Record<string,string>={intro:'亭子，怎样站住',straight:'榫头，怎样装进去',frame:'两榀，合成一座亭',bracket:'柱头的小桥',hip:'四角托起尖顶',assembly:'顺着工序，装回去',gravity:'重量往哪儿走',wind:'风来了，哪里受力',inverse:'从变形，找回力',return:'每一块，都有位置'};
export function stateAt(frame:number):FrameState{
 const i=Math.max(0,timeline.scenes.findIndex(s=>frame>=s.start&&frame<s.end));
 const s=timeline.scenes[i],clips=timeline.clips.filter(c=>c.scene===s.id);
 const c=clips.filter(c=>frame>=c.start).at(-1)??clips[0];
 return {scene:s.id,previous:timeline.scenes[i-1]?.id,elapsed:(frame-s.start)/30,duration:(s.end-s.start)/30,progress:clamp((frame-s.start)/(s.end-s.start)),time:frame/30,line:c?.line??0,lineProgress:c?clamp((frame-c.start)/c.duration):0};
}
type Metrics={stressMPa:number;displayGain:number;inverseError:number;beamStressMPa:number};
function Stage({state,onMetrics}:{state:FrameState;onMetrics:(m:Metrics)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<JoineryWorld|null>(null),latest=useRef(state);latest.current=state;
 const [handle]=useState(()=>delayRender('Loading repaired pavilion and native simulation results'));
 useLayoutEffect(()=>{const w=new JoineryWorld(canvas.current!,staticFile('episode3v7/'));world.current=w;w.ready.then(()=>{onMetrics({stressMPa:w.maxStress/1e6,displayGain:w.displayGain,inverseError:w.inverseData.pressure_relative_recovery_error*100,beamStressMPa:w.staticData.cases.gravity.response.members.CROSS_FRONT.sigmaMaxAbsPa/1e6});w.render(latest.current);continueRender(handle)}).catch(cancelRender);return()=>{w.dispose();world.current=null}},[]);
 useLayoutEffect(()=>{world.current?.render(state)},[state]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}
function Brand(){return <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,fontFamily:'Microsoft YaHei',fontSize:44,fontWeight:600,color:ink,zIndex:20}}><Img src={staticFile('episode3v7/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span>rainbow鱼</span></div>}
function Title({state:s}:{state:FrameState}){
 if(s.scene==='references')return null;
 const straightStart=timeline.scenes.find(scene=>scene.id==='straight')!.start/30;
 const leadStraight=s.scene==='intro'&&s.time>=straightStart-2;
 const scene=leadStraight?'straight':s.scene;
 const elapsed=leadStraight?s.time-straightStart+2:s.elapsed+(scene==='straight'?2:0);
 // Read the joint heading in the wide shot, then clear the approaching timber.
 const hold=scene==='intro'?7:scene==='straight'?2.8:5;
 const enter=(s.previous||leadStraight)?1980*(1-smooth(clamp(elapsed/1.25))):0;
 const exit=1800*smooth(clamp((elapsed-hold)/(scene==='straight'?.8:1.1)));
 return <div style={{position:'absolute',left:64,top:169,transform:`translateX(${enter-exit}px)`,fontSize:72,fontFamily:'STSong,SimSun,serif',fontWeight:600,color:ink,letterSpacing:2,paddingLeft:25,borderLeft:`5px solid ${gold}`,textShadow:'0 2px 1px #fff8e8',whiteSpace:'nowrap'}}>{headings[scene]}</div>;
}
function Caption({text}:{text:string}){return <div style={{position:'absolute',bottom:32,left:80,right:80,textAlign:'center',zIndex:18}}><span style={{display:'inline-block',color:'#fffaf1',background:'rgba(40,58,47,.94)',fontFamily:'Microsoft YaHei',fontSize:48,lineHeight:1.35,padding:'10px 32px 13px',borderRadius:10,borderTop:`2px solid ${gold}`,boxShadow:'0 7px 24px #28392f1b',letterSpacing:.5}}>{text}</span></div>}
function PhysicsKey({state:s,metrics}:{state:FrameState;metrics:Metrics}){
 if(!['gravity','wind','inverse'].includes(s.scene))return null;
 const u=s.line+s.lineProgress,flow=s.scene==='wind'&&u<3.5,signed=s.scene==='gravity'&&u>=1.95&&u<3.1;
 const pressure=s.scene==='inverse'&&s.progress<.72;
 const label=s.scene==='inverse'?(pressure?'扩散反算 · 合成响应验证':'反算荷载 → 构件响应'):flow?'二维绕流 · 低雷诺数':signed?'前穿梁 · 拉压正应力':'梁截面应力幅值 · MPa';
 const enter=1980*(1-smooth(clamp((s.elapsed-3.2)/1.1))),leave=2100*smooth(clamp((s.elapsed-(s.duration-1.4))/1.2)),x=enter+leave;
 const number=metrics.stressMPa.toFixed(2),beam=metrics.beamStressMPa.toFixed(3);
 return <><div style={{position:'absolute',right:68,top:75,transform:`translateX(${x}px)`,color:pine,fontSize:36,fontFamily:'Microsoft YaHei',fontWeight:600,letterSpacing:.5}}>{label}</div>
  <div style={{position:'absolute',left:68,bottom:153,transform:`translateX(${-x}px)`,width:s.scene==='inverse'?470:360,color:pine,fontFamily:'Microsoft YaHei',fontSize:36,lineHeight:1.45}}>
   {flow?<div>{s.progress<.23?'前柱截面':'屋顶中央截面'}</div>:<>
    <div style={{height:9,background:pressure?'linear-gradient(90deg,#468a98,#bd563d)':'linear-gradient(90deg,#4b8f99,#e7d5a4,#bd4c39)',borderRadius:8}}/>
    <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}><span>{signed?`−${beam}`:pressure?'−0.65':'0'}</span><span>{signed?`+${beam}`:pressure?'+0.65 Cp':`${number} MPa`}</span></div>
    {signed&&<div>受压 ← 0 → 受拉</div>}
    {s.scene==='wind'&&<div style={{marginTop:10}}>位移 ×{metrics.displayGain.toFixed(0)}</div>}
    {s.scene==='inverse'&&u>=4&&<div style={{marginTop:10}}>风压恢复误差 {metrics.inverseError.toFixed(3)}%</div>}
   </>}
  </div></>;
}
function References({state:s}:{state:FrameState}){
 const slide=2000*(1-smooth(clamp(s.elapsed/1.5)));
 const steps=[['结构','Zwind / ZDyn'],['建模','Blender + Three.js'],['绕流','二维 D2Q9'],['反算','扩散正则 + 结构响应']];
 return <AbsoluteFill style={{zIndex:8,transform:`translateX(${slide}px)`,background:'linear-gradient(90deg,#eee7d800,#eee7d8 5%,#eee7d8f7)',color:ink,pointerEvents:'none'}}>
  <div style={{position:'absolute',left:68,top:169,fontSize:72,fontFamily:'STSong,SimSun,serif',fontWeight:600,letterSpacing:3}}>木构背后的力学</div>
  <div style={{position:'absolute',left:72,top:286,width:740,fontFamily:'Microsoft YaHei'}}>
   {steps.map(([label,tool],i)=><div key={label} style={{height:89,display:'flex',alignItems:'center',gap:32,borderBottom:'1px solid #58726338',transform:`translateX(${150*(1-smooth(clamp((s.elapsed-.5-i*.1)/.85)))}px)`}}><span style={{fontSize:36,color:pine,width:80}}>{label}</span><span style={{fontSize:40,fontWeight:600}}>{tool}</span></div>)}
   <div style={{display:'flex',alignItems:'center',gap:20,marginTop:37}}><span style={{width:170,flexShrink:0,whiteSpace:'nowrap',fontSize:36,color:pine}}>结构平衡</span><Img src={staticFile('episode3v7/references/equilibrium.png')} style={{width:470,height:90,objectFit:'contain',mixBlendMode:'multiply'}}/></div>
   <div style={{display:'flex',alignItems:'center',gap:20,marginTop:16}}><span style={{width:170,flexShrink:0,whiteSpace:'nowrap',fontSize:36,color:pine}}>扩散先验</span><Img src={staticFile('episode3v7/references/diffusion.png')} style={{width:470,height:90,objectFit:'contain',mixBlendMode:'multiply'}}/></div>
  </div>
  <div style={{position:'absolute',left:930,top:280,width:888,height:700}}>
   <Img src={staticFile('episode3v7/references/tenon-2024-page1.png')} style={{position:'absolute',left:432,top:16,width:348,height:494,objectFit:'contain',background:'#fff',transform:`rotate(3deg) translateY(${36*(1-smooth(clamp((s.elapsed-.7)/.9)))}px)`,boxShadow:'0 18px 35px #3c432d26'}}/>
   <Img src={staticFile('episode3v7/references/sha-2019-page1.png')} style={{position:'absolute',left:0,top:0,width:416,height:589,objectFit:'contain',background:'#fff',transform:`rotate(-2deg) translateY(${50*(1-smooth(clamp((s.elapsed-.3)/.9)))}px)`,boxShadow:'0 22px 48px #3c432d28'}}/>
   <div style={{position:'absolute',left:0,top:609,fontFamily:'Microsoft YaHei',fontSize:36,lineHeight:1.4}}><b>接头损伤与循环性能</b><div style={{color:pine}}>Sha 等 · 2019</div></div>
   <div style={{position:'absolute',left:462,top:544,fontFamily:'Microsoft YaHei',fontSize:36,lineHeight:1.4}}><b>拔榫与抗震性能</b><div style={{color:pine}}>Huan 等 · 2024</div></div>
  </div>
 </AbsoluteFill>;
}
export function JoineryFilm({audio=true}:{audio?:boolean}){
 const frame=useCurrentFrame(),s=stateAt(frame),cap=timeline.captions.find(c=>frame>=c.start&&frame<c.end);
 const [metrics,setMetrics]=useState<Metrics>({stressMPa:0,displayGain:1,inverseError:0,beamStressMPa:0});
 return <AbsoluteFill style={{background:paper,overflow:'hidden'}}><Stage state={s} onMetrics={setMetrics}/><Title state={s}/><PhysicsKey state={s} metrics={metrics}/>{s.scene==='references'&&<References state={s}/>}<Brand/>{cap&&s.scene!=='references'&&<Caption text={cap.text}/>}<div style={{position:'absolute',inset:0,pointerEvents:'none',boxShadow:'inset 0 0 120px #fff8e80d'}}/>{audio&&<Audio src={staticFile('episode3v7/master.wav')}/>}</AbsoluteFill>;
}
