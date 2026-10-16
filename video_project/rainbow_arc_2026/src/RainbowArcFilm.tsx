import React,{useLayoutEffect,useRef,useState,useCallback} from 'react';
import {AbsoluteFill,Audio,Img,OffthreadVideo,Sequence,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import * as T from 'three';
import {OpticsWorld} from './OpticsWorld';
import {applyCamera} from './CameraPath';
import {CinematicEnvironment} from './CinematicEnvironment';
import {timeline,stateAt,FrameState,ease} from './Timeline';
import {V03Cinematics} from './V03Cinematics';
import {GaussianBridge} from './GaussianBridge';
const ink='#193c43',teal='#367d7b';
// 1920×1080 editorial safe zones. Keep dynamic annotations clear of the
// title rails and reserve the lower band for the timed narration caption.
const UI_SAFE={left:64,right:1856,top:92,bottom:860,captionTop:900};
const TITLE_SAFE_LEFT={left:54,right:820,top:170,bottom:470};
const TITLE_SAFE_RIGHT={left:1360,right:1866,top:104,bottom:360};
const intersects=(a:{left:number;top:number;right:number;bottom:number},b:{left:number;top:number;right:number;bottom:number})=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
const headings:Record<string,[string,string]>={street:['彩虹为什么','总是弯的？'],drop:['让阳光','走进一滴雨'],dispersion:['白光里','藏着多少颜色'],reflection:['光线回头','颜色分开'],angle:['为什么','偏偏是 42°'],cone:['一圈视线','围成一个圆锥'],circle:['完整的圆','为何只见一段'],observer:['走几步','彩虹也换了位置'],secondary:['再反射一次','天空多一道虹'],return:['一滴水','画出天空的圆'],references:['从画面','回到光学']};
type Label={text:string;x:number;y:number;left:number;top:number;color:string;opacity:number};
function labelsFor(state:FrameState,camera:T.PerspectiveCamera,optics:OpticsWorld){
 const s=state.scene,id=state.clip?.id,rows:{text:string;p:T.Vector3;color:string}[]=[];const a=optics.labelAnchors;
 if(['drop','dispersion','reflection'].includes(s)||['r039','r040'].includes(id??'')){
  rows.push({text:'水滴',p:a['Drop.center'].clone().add(new T.Vector3(.8,1.3,0)),color:teal});
  if(s==='reflection')rows.push({text:state.line===0?'一部分穿出':state.line===1?'内部反射':'再次折射',p:a[state.line<2?'Drop.reflect1':'Drop.exit'],color:'#b36d4c'});
 }
 if(['cone','angle','observer'].includes(s)&&id!=='r018')rows.push({text:'眼睛',p:a.Eye,color:'#3c746b'});
 if(s==='angle'&&['r019','r020','r023'].includes(id??''))rows.push({text:'反太阳方向',p:a.AntiAxis,color:'#658f9d'});
 const result:Label[]=[];
 for(const [i,row] of rows.entries()){
  const p=row.p.clone().project(camera),x=(p.x+1)*960,y=(1-p.y)*540;if(p.z>1||p.z< -1||x<430||x>1790||y<250||y>825)continue;
  // Labels use a compact box and are nudged away from both title rails and
  // the subtitle band. If the projected anchor has no clean landing zone, it
  // is omitted for this frame instead of crossing text.
  const boxW=row.text.length>6?238:164,boxH=58;
  let left=x<1400?Math.min(UI_SAFE.right-boxW,x+110):Math.max(UI_SAFE.left,x-boxW-110);
  let top=Math.max(UI_SAFE.top,Math.min(UI_SAFE.captionTop-boxH-24,y-75-i*10));
  let box={left,top,right:left+boxW,bottom:top+boxH};
  if(intersects(box,TITLE_SAFE_LEFT)||intersects(box,TITLE_SAFE_RIGHT)){
   const down=Math.max(TITLE_SAFE_LEFT.bottom,TITLE_SAFE_RIGHT.bottom)+22;
   const up=Math.min(TITLE_SAFE_LEFT.top,TITLE_SAFE_RIGHT.top)-boxH-22;
   const candidate=top<down?down:up;
   if(candidate>=UI_SAFE.top&&candidate+boxH<=UI_SAFE.captionTop-24){top=candidate;box={left,top,right:left+boxW,bottom:top+boxH};}
   else continue;
  }
  // Avoid stacking two labels in the same landing column.
  if(result.some(prev=>intersects(box,{left:prev.left,top:prev.top,right:prev.left+(prev.text.length>6?238:164),bottom:prev.top+boxH}))) continue;
  result.push({text:row.text,x,y,left,top,color:row.color,opacity:1});
 }
 return result;
}
function Stage({frame,onLabels}:{frame:number;onLabels:(l:Label[])=>void}){
 const canvas=useRef<HTMLCanvasElement>(null);const world=useRef<{renderer:T.WebGLRenderer;scene:T.Scene;camera:T.PerspectiveCamera;optics:OpticsWorld;env:CinematicEnvironment}|null>(null);
 const [handle]=useState(()=>delayRender('Build the continuous rainbow world'));
 useLayoutEffect(()=>{
  try{
   const renderer=new T.WebGLRenderer({canvas:canvas.current!,antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});renderer.setSize(1920,1080,false);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1;renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
   const scene=new T.Scene(),camera=new T.PerspectiveCamera(42,1920/1080,.025,180);const env=new CinematicEnvironment(renderer,scene);const optics=new OpticsWorld();scene.add(optics.group);world.current={renderer,scene,camera,optics,env};continueRender(handle);
  }catch(e){cancelRender(e)}
  return()=>{const w=world.current;if(w){w.optics.dispose();w.env.dispose();w.renderer.dispose();w.renderer.forceContextLoss()}world.current=null;};
 },[handle]);
 useLayoutEffect(()=>{const w=world.current;if(!w)return;const state=stateAt(frame);w.optics.update(state);w.env.update(frame/30);applyCamera(w.camera,frame);w.camera.updateMatrixWorld();w.renderer.render(w.scene,w.camera);onLabels(labelsFor(state,w.camera,w.optics));},[frame,onLabels]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}
function Brand(){return <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:40}}><Img src={staticFile('brand/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span style={{fontSize:44,fontWeight:600}}>rainbow鱼</span></div>}
// Photographic bridge: atmosphere only, then the calculated Three.js droplet takes over.
function RealRainBridge({state}:{state:FrameState}){
 const t=state.time,ts=(id:string)=>(timeline.clips.find(c=>c.id===id)?.start??0)/30;
 const bridgeStart=ts('r004'),dropStart=ts('r005'),returnStart=ts('r046'),returnEnd=ts('r050');
 const enter=ease((t-(bridgeStart+.2))/.9),leave=1-ease((t-(dropStart-2.7))/2.7),close=enter*leave;
 const returnIn=ease((t-(returnStart+1.0))/1.1),returnOut=1-ease((t-(returnEnd-1.5))/2.0),endPlate=returnIn*returnOut;
 const alpha=Math.max(close,endPlate); if(alpha<.002)return null;
 const p=close>0?ease((t-(bridgeStart+.2))/Math.max(.1,dropStart-bridgeStart-.2)):ease((t-(returnStart+1.0))/Math.max(.1,returnEnd-returnStart-1.0)),scale=1.025+.055*p,x=close>0?-.8+1.8*p:-1.2+1.0*p;
 const qwenStart=bridgeStart, qwenEnd=bridgeStart+5.0;
 const qwenAlpha=ease((t-qwenStart)/.55)*(1-ease((t-(qwenEnd-.8))/.8));
 const qwenReturnStart=returnStart+.55, qwenReturnEnd=qwenReturnStart+5.0;
 const qwenReturnAlpha=ease((t-qwenReturnStart)/.65)*(1-ease((t-(qwenReturnEnd-.85))/.85));
 return <div style={{position:'absolute',inset:0,zIndex:4,pointerEvents:'none',opacity:alpha,overflow:'hidden',background:'#182f2b'}}>
  <Img src={staticFile('assets/qwen/qwen_rainbow_transition_reference.png')} style={{position:'absolute',inset:'-4%',width:'108%',height:'108%',objectFit:'cover',objectPosition:'center',transform:`translateX(${x}%) scale(${scale})`,filter:'saturate(1.08) contrast(1.04)'}}/>
  {qwenAlpha>.002&&<Sequence from={Math.round(qwenStart*30)} durationInFrames={Math.round((qwenEnd-qwenStart)*30)} layout="none"><OffthreadVideo src={staticFile('assets/qwen/qwen_rainbow_bridge_v03.mp4')} muted volume={0} style={{position:'absolute',inset:'-4%',width:'108%',height:'108%',objectFit:'cover',objectPosition:'center',opacity:qwenAlpha,filter:'saturate(1.06) contrast(1.03)'}}/></Sequence>}
  {qwenReturnAlpha>.002&&<Sequence from={Math.round(qwenReturnStart*30)} durationInFrames={Math.round((qwenReturnEnd-qwenReturnStart)*30)} layout="none"><OffthreadVideo src={staticFile('assets/qwen/qwen_rainbow_bridge_v03.mp4')} muted volume={0} style={{position:'absolute',inset:'-5%',width:'110%',height:'110%',objectFit:'cover',objectPosition:'center',opacity:qwenReturnAlpha,transform:'scaleX(-1) scale(1.02)',filter:'saturate(1.12) contrast(1.05) hue-rotate(-4deg)'}}/></Sequence>}
  {/* A restrained prism sweep makes the photograph-to-model handoff read as
      one optical event.  It is driven by the same eased progress as the
      camera travel, so no new cut or opaque card is introduced. */}
  <div style={{position:'absolute',inset:'-12%',transform:`translateX(${(p*2-1)*38}%) rotate(-7deg)`,background:'linear-gradient(104deg,transparent 35%,rgba(255,255,255,.04) 43%,rgba(255,244,206,.30) 48%,rgba(205,248,246,.22) 52%,rgba(255,255,255,.04) 57%,transparent 65%)',mixBlendMode:'screen',opacity:.72*alpha,filter:'blur(3px)'}}/>
  <div style={{position:'absolute',left:'4%',right:'4%',top:'19%',height:'1px',background:'linear-gradient(90deg,transparent,rgba(255,246,207,.0) 15%,rgba(255,246,207,.62) 50%,rgba(194,242,240,.0) 85%,transparent)',transform:`translateX(${(p-.5)*22}%)`,opacity:.55*alpha}}/>
  <div style={{position:'absolute',inset:0,background:'linear-gradient(90deg,rgba(9,32,31,.26),transparent 48%,rgba(245,248,242,.08)),linear-gradient(0deg,rgba(9,32,31,.15),transparent 42%)'}}/>
  <div style={{position:'absolute',left:'7%',top:'47%',width:'28%',height:'17%',border:'1px solid rgba(182,235,232,.55)',borderRadius:'50%',transform:'rotate(-4deg)',boxShadow:'0 0 34px rgba(167,235,231,.22)',opacity:.55*close}}/>
 </div>;
}
// A restrained grade keeps the real photograph and the calculated world in the
// same visual space. It is intentionally a soft light/vignette, not a full
// screen card, so the camera move remains the transition.
function FilmGrade({state}:{state:FrameState}){
 const t=state.time,real=state.scene==='street'&&t>16.0||state.scene==='return'&&t>258;
 const modelAlpha=state.scene==='references'?0:real?.08:.15;
 return <div style={{position:'absolute',inset:0,pointerEvents:'none',zIndex:7,opacity:modelAlpha,mixBlendMode:'multiply',background:'radial-gradient(ellipse at 58% 45%,rgba(255,255,255,0) 0%,rgba(102,142,143,.10) 56%,rgba(17,45,49,.18) 100%)'}}/>;
}
// A glass-like focus ring follows the projected drop anchor. It gives the
// viewer a physical handoff point while the camera enters the model, without
// adding another panel or competing with the caption.
function FocusLens({state,labels}:{state:FrameState;labels:Label[]}){
 if(!['drop','dispersion','reflection'].includes(state.scene))return null;
 const a=labels.find(x=>x.text==='水滴'); if(!a)return null;
 const enter=ease((state.frame-state.sceneStart)/38),leave=ease((state.sceneEnd-state.frame)/34),alpha=Math.min(enter,leave)*.34;
 const size=190+28*ease(state.lineProgress*1.5),glint=(state.frame%150)/150;
 return <div style={{position:'absolute',left:a.x,top:a.y,width:size,height:size,transform:'translate(-50%,-50%)',borderRadius:'50%',border:'1px solid rgba(182,235,232,.62)',boxShadow:'0 0 0 10px rgba(182,235,232,.06),inset 0 0 30px rgba(193,241,237,.13),0 12px 42px rgba(30,79,79,.09)',background:'radial-gradient(circle at 35% 30%,rgba(255,255,255,.24),transparent 32%,rgba(113,196,194,.05) 62%,transparent 72%)',opacity:alpha,zIndex:8,pointerEvents:'none',overflow:'hidden'}}><div style={{position:'absolute',top:0,bottom:0,width:'26%',left:`${-26+glint*126}%`,background:'linear-gradient(90deg,transparent,rgba(255,255,255,.34),transparent)',transform:'skewX(-18deg)',filter:'blur(3px)'}}/><div style={{position:'absolute',inset:18,borderRadius:'50%',border:'1px dashed rgba(182,235,232,.38)',opacity:.65}}/></div>;
}
function Title({state}:{state:FrameState}){
 const heading=headings[state.scene]??headings.street;const entry=ease((state.frame-state.sceneStart)/36),outro=ease((state.sceneEnd-state.frame)/30),y=(1-entry)*38-(1-outro)*38;
 return <div style={{position:'absolute',left:72,top:190,width:675,maxWidth:'42vw',transform:`translateY(${y}px)`,opacity:Math.min(entry,outro),pointerEvents:'none',zIndex:11}}><div style={{fontSize:32,fontWeight:600,color:'#fff',background:teal,display:'inline-block',padding:'9px 18px',borderRadius:7}}>每天5分钟 · 彩虹的秘密</div><div style={{fontSize:state.scene==='street'?83:69,fontWeight:700,lineHeight:1.23,letterSpacing:-2,marginTop:25,textShadow:'0 2px 20px #f3f6f3'}}>{heading.map((t,i)=><div key={i}>{t}</div>)}</div></div>;
}
function KeyFact({state}:{state:FrameState}){
 const id=state.clip?.id;let value='',label='',color=teal;
 if(['r021','r023'].includes(id??'')){value='42°';label='从反太阳方向量起';color='#b45743'}
 if(id==='r022'){value='红 42°　紫 40°';label='主虹外红内紫';color='#775d91'}
 if(id==='r026'){value='360°';label='转一圈，角度不变'}
 if(id==='r041'){value='约 51°';label='副虹的观察角';color='#876991'}
 if(id==='r045'){value='亚历山大暗带';label='两道虹之间，光较少';color='#6c7483'}
 if(!value)return null;const a=ease(state.lineProgress*7);return <div style={{position:'absolute',left:75,top:515,maxWidth:690,pointerEvents:'none',opacity:a,transform:`translateY(${18*(1-a)}px)`,zIndex:11}}><div style={{fontSize:value.length>7?56:77,fontWeight:650,color}}>{value}</div><div style={{fontSize:36,marginTop:15,color:'#577472'}}>{label}</div></div>;
}
function References({state}:{state:FrameState}){
 const u=ease((state.frame-state.sceneStart)/34);return <div style={{position:'absolute',inset:0,transform:`translateY(${1080*(1-u)}px)`,background:'linear-gradient(110deg,#f0f5f2,#edf2f0)',zIndex:25}}><div style={{position:'absolute',left:80,top:187,fontSize:69,fontWeight:700}}>一滴雨里的光学</div><div style={{position:'absolute',left:88,top:320,width:620}}><div style={{fontSize:37,color:teal,marginBottom:20}}>折射定律</div><Img src={staticFile('sources/formula-snell.svg')} style={{width:550,height:112,objectFit:'contain',objectPosition:'left center'}}/><div style={{fontSize:37,color:teal,marginTop:35,marginBottom:20}}>主虹的几何</div><Img src={staticFile('sources/formula-angle.svg')} style={{width:610,height:112,objectFit:'contain',objectPosition:'left center'}}/><div style={{fontSize:34,color:'#5a7775',marginTop:30}}>折射 × 一次内反射 → 约 42°</div></div>
  {[{file:'gettelman-2023-title-page.png',left:830,top:310,rot:-4},{file:'gettelman-2023-rainbow-optics-page4939.png',left:1160,top:285,rot:3}].map((p,i)=>{const a=ease((state.frame-state.sceneStart-i*8)/38);return <div key={p.file} style={{position:'absolute',left:p.left+100*(1-a),top:p.top,width:465,height:548,transform:`rotate(${p.rot}deg)`,boxShadow:'0 18px 46px #30585a29',background:'#fff',overflow:'hidden'}}><Img src={staticFile('sources/'+p.file)} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top'}}/></div>})}
  <div style={{position:'absolute',left:850,top:865,fontSize:36,fontWeight:600}}>Gettelman · 2023 · GMD</div><div style={{position:'absolute',left:850,top:922,fontSize:36,color:'#5a7775'}}>彩虹光学与气象建模　CC BY 4.0</div></div>;
}
export function RainbowArcFilm({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){
 const frame=useCurrentFrame(),state=stateAt(frame);const [labels,setLabels]=useState<Label[]>([]);const onLabels=useCallback((l:Label[])=>setLabels(l),[]),caption=timeline.captions?.find(c=>frame>=c.start&&frame<c.end);
 return <AbsoluteFill style={{background:'#f1f5f4',color:ink,fontFamily:'"Microsoft YaHei",Arial,sans-serif',overflow:'hidden'}}><Stage frame={frame} onLabels={onLabels}/>{!clean&&<><RealRainBridge state={state}/><FilmGrade state={state}/> <div style={{position:'absolute',inset:0,zIndex:5,pointerEvents:'none',background:'linear-gradient(100deg,rgba(243,247,244,.91) 0%,rgba(243,247,244,.40) 22%,transparent 43%)'}}/><GaussianBridge state={state}/><V03Cinematics state={state}/><FocusLens state={state} labels={labels}/><KeyFact state={state}/>
 {labels.map(l=><React.Fragment key={l.text}><svg viewBox="0 0 1920 1080" style={{position:'absolute',inset:0,width:'100%',height:'100%',pointerEvents:'none',zIndex:9}}><path d={`M${l.x},${l.y} L${l.left+12},${l.top+28}`} stroke={l.color} strokeWidth={2} fill="none" opacity={.65}/><circle cx={l.x} cy={l.y} r={4} fill={l.color}/></svg><div style={{position:'absolute',left:l.left,top:l.top,maxWidth:238,whiteSpace:'nowrap',fontSize:34,lineHeight:1.25,fontWeight:650,color:l.color,zIndex:11,padding:'8px 14px',borderRadius:8,background:'rgba(243,247,240,.93)',boxShadow:'0 7px 22px rgba(34,72,70,.10)',textShadow:'0 1px 0 rgba(255,255,255,.45)'}}>{l.text}</div></React.Fragment>)}
 {caption&&<div style={{position:'absolute',bottom:38,left:96,right:96,textAlign:'center',zIndex:13,pointerEvents:'none'}}><span style={{display:'inline-block',maxWidth:'calc(100% - 120px)',fontSize:45,fontWeight:500,lineHeight:1.30,padding:'12px 28px',color:ink,background:'rgba(252,252,247,.95)',borderRadius:14,boxShadow:'0 8px 28px rgba(37,74,66,.10)',textShadow:'0 1px 0 rgba(255,255,255,.6)'}}>{caption.text}</span></div>}{state.scene==='references'&&<References state={state}/>}<Brand/></>}{audio&&<Audio src={staticFile('audio/rainbow-arc-master.wav')}/>}</AbsoluteFill>;
}


