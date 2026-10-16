import React from 'react';
import {Img, staticFile, useCurrentFrame} from 'remotion';
import {ease, FrameState, timeline} from './Timeline';

/*
 * V03 editorial layer. It does not replace the optical world; it gives the
 * camera a visible baton to follow and keeps typography attached to the same
 * optical event. All motion is frame driven, so the Remotion render stays
 * deterministic and can be scrubbed without a live clock.
 */
const teal = '#2a7778';
const ink = '#183d42';
const warm = '#d6a450';
const cyan = '#83d5d2';
const clamp = (n:number)=>Math.max(0,Math.min(1,n));
const smooth = (n:number)=>{const x=clamp(n);return x*x*(3-2*x)};
const sceneAt=(id:string)=>timeline.scenes.find(s=>s.id===id)!;

function Baton({state}:{state:FrameState}){
  const f=state.frame;
  const enter=ease((f-480)/120), hold=smooth((f-600)/80)*(1-smooth((f-7600)/180)), exit=1-smooth((f-8200)/180);
  const visible=Math.min(1,enter)*Math.max(0,hold)*Math.max(0,exit);
  if(visible<.003)return null;
  const drop=['drop','dispersion','reflection'].includes(state.scene);
  const lift=drop?Math.sin((f-600)/170)*2.2:Math.sin((f-600)/230)*6;
  const x1=drop?49:18, y1=drop?48:72, x2=drop?78:89, y2=drop?28:18;
  return <svg viewBox="0 0 1920 1080" style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:6,pointerEvents:'none',opacity:visible}}>
    <defs><linearGradient id="v03-baton" x1="0" x2="1"><stop stopColor={warm} stopOpacity=".05"/><stop offset=".35" stopColor={warm}/><stop offset=".68" stopColor={cyan}/><stop offset="1" stopColor="#ffffff" stopOpacity=".08"/></linearGradient><filter id="v03-glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
    <path d={`M${x1*19.2},${y1*10.8+lift} C${x1*19.2+100},${y1*10.8-90+lift} ${x2*19.2-80},${y2*10.8+90+lift} ${x2*19.2},${y2*10.8+lift}`} stroke="url(#v03-baton)" strokeWidth="18" opacity=".16" filter="url(#v03-glow)" fill="none"/>
    <path d={`M${x1*19.2},${y1*10.8+lift} C${x1*19.2+100},${y1*10.8-90+lift} ${x2*19.2-80},${y2*10.8+90+lift} ${x2*19.2},${y2*10.8+lift}`} stroke="url(#v03-baton)" strokeWidth="3.2" opacity=".92" fill="none"/>
    <circle cx={x2*19.2} cy={y2*10.8+lift} r="10" fill={cyan} opacity=".75" filter="url(#v03-glow)"/>
  </svg>;
}

function WaterMotion({state}:{state:FrameState}){
  if(state.scene!=='street'&&state.scene!=='return')return null;
  const f=state.frame, phase=(f%240)/240;
  const rise=state.scene==='return'?smooth((f-sceneAt('return').start)/90):1;
  return <div style={{position:'absolute',inset:0,zIndex:5,pointerEvents:'none',opacity:.36*rise,mixBlendMode:'screen',overflow:'hidden'}}>
    <div style={{position:'absolute',left:'-10%',right:'-10%',bottom:'-23%',height:'68%',background:'radial-gradient(ellipse at 48% 22%,rgba(159,231,226,.22),transparent 48%),linear-gradient(8deg,rgba(19,78,77,.26),transparent 58%)',transform:`translateY(${Math.sin(phase*Math.PI*2)*7}px)`}}/>
    {[0,1,2,3].map(i=>{const p=(phase+i*.25)%1;const s=1+p*2.4;return <div key={i} style={{position:'absolute',left:`${43+i*4}%`,top:`${72-i*3}%`,width:120,height:40,borderRadius:'50%',border:'1px solid rgba(169,236,231,.55)',transform:`translate(-50%,-50%) scale(${s})`,opacity:(1-p)*.48,boxShadow:'0 0 25px rgba(132,222,218,.18)'}}/>})}
  </div>;
}

function CameraAnchoredTitle({state}:{state:FrameState}){
  const f=state.frame, sc=sceneAt(state.scene), enter=ease((f-sc.start+24)/34), leave=ease((sc.end-f)/34);
  const a=Math.min(enter,leave); if(a<.01)return null;
  const copy:Record<string,[string,string]>={
    street:['雨停以后','为什么只剩一段弧？'],drop:['跟着一束光','走进一滴雨'],dispersion:['白光入水','颜色开始分开'],reflection:['光在水里','回头一次'],angle:['出口很窄','42° 是关键'],cone:['把镜头拉高','它其实是一只圆锥'],circle:['站得更高','你会看见整圈'],observer:['你移动一步','彩虹也换了一批水滴'],secondary:['再绕一圈','天空多一道淡虹'],return:['找一束阳光','用水雾做实验'],references:['最后留下','两条公式与一页论文']
  };
  const [kicker,title]=copy[state.scene]??copy.street;
  const right=['drop','dispersion','reflection','angle'].includes(state.scene);
  // Keep the title effectively locked during its hold; the camera already
  // supplies the motion. A tiny 4px drift avoids a static-card feel without
  // violating the subtitle clearance budget.
  // Leave a deliberate 18px breathing gap below the fixed brand lockup on
  // left-anchored scenes; right-anchored titles retain the higher horizon.
  const x=right?1390:76, y=right?128:(state.scene==='references'?150:156+4*Math.sin(f/130));
  return <div style={{position:'absolute',left:x,top:y,width:right?450:720,zIndex:12,pointerEvents:'none',transform:`translate3d(${(1-a)*(right?80:-60)}px,${(1-a)*18}px,0)`,opacity:a}}>
    <div style={{display:'inline-block',fontSize:24,fontWeight:700,letterSpacing:2,color:'#fff',background:teal,padding:'7px 16px',borderRadius:5,boxShadow:'0 8px 24px rgba(31,82,79,.14)'}}>{kicker}</div>
    <div style={{marginTop:15,fontSize:right?52:65,lineHeight:1.08,fontWeight:800,letterSpacing:-1.5,color:ink,textShadow:'0 3px 18px rgba(250,252,247,.9)'}}>{title}</div>
  </div>;
}

function OpticalOrbit({state}:{state:FrameState}){
  const active=['angle','cone','circle','observer','secondary'].includes(state.scene); if(!active)return null;
  const sc=sceneAt(state.scene),p=smooth((state.frame-sc.start)/Math.max(1,sc.end-sc.start));
  const rotation=(state.frame/26)%360, r=state.scene==='cone'?350:240+90*p;
  const cx=state.scene==='cone'?1470:1530, cy=state.scene==='cone'?610:470;
  const alpha=.3+.25*Math.sin(p*Math.PI);
  return <svg viewBox="0 0 1920 1080" style={{position:'absolute',inset:0,width:'100%',height:'100%',zIndex:7,pointerEvents:'none',opacity:alpha}}>
    <defs><linearGradient id="v03-arc" x1="0" x2="1"><stop stopColor={cyan} stopOpacity="0"/><stop offset=".5" stopColor={cyan}/><stop offset="1" stopColor={warm} stopOpacity="0"/></linearGradient></defs>
    <g transform={`translate(${cx} ${cy}) rotate(${rotation})`}>
      <ellipse rx={r} ry={r*.38} fill="none" stroke="url(#v03-arc)" strokeWidth="2" strokeDasharray="12 24"/>
      <ellipse rx={r*.78} ry={r*.22} fill="none" stroke="rgba(130,216,212,.32)" strokeWidth="1"/>
      {state.scene==='cone'&&<path d={`M0 0 L${r*.92} ${r*.42} M0 0 L${r*.92} ${-r*.42}`} stroke="rgba(224,189,112,.62)" strokeWidth="2"/>}
    </g>
    <text x={cx-r*.62} y={cy+r*.58} fill="rgba(34,82,84,.78)" fontSize="28" fontFamily="Microsoft YaHei">{state.scene==='secondary'?'副虹 ≈ 51°':'反太阳方向 · 主虹约 42°'}</text>
  </svg>;
}

function ReferencesRibbon({state}:{state:FrameState}){
  if(state.scene!=='references')return null;
  const p=smooth((state.frame-sceneAt('references').start)/120);
  return <div style={{position:'absolute',right:62,top:106,zIndex:30,width:300,height:42,overflow:'hidden',pointerEvents:'none',transform:`translateX(${(1-p)*330}px)`}}>
    <div style={{height:2,background:`linear-gradient(90deg,transparent,${teal},${warm})`,marginBottom:10}}/>
    <div style={{fontSize:22,color:'#47706f',letterSpacing:1}}>光学证据 · Snell · Gettelman 2023</div>
  </div>;
}

export function V03Cinematics({state}:{state:FrameState}){
  return <><WaterMotion state={state}/><Baton state={state}/><OpticalOrbit state={state}/><CameraAnchoredTitle state={state}/><ReferencesRibbon state={state}/><Img src={staticFile('brand/logo.png')} style={{position:'absolute',right:58,top:52,width:36,height:44,objectFit:'contain',opacity:.7,zIndex:30,pointerEvents:'none'}}/></>;
}
