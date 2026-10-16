import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {JoineryWorld,JoineryState,clamp,smooth} from './World';
import timeline from './timeline.json';
const ink='#26382f',muted='#68756b',paper='#eee7d8',gold='#a5763b',pine='#3d5b4f';
const headings:Record<string,string>={intro:'一座亭子，怎样站住',straight:'闌额：梁端怎样入柱',dovetail:'枓栱：一层层把檐托出去',lap:'攒尖：四根大角樑汇到中心',pin:'木销：给节点最后一道锁',assembly:'按顺序，把亭子装起来',load:'重量，沿哪条路走',stress:'构件里面，也在受力',wind:'Zwind：风从屋面绕过',moisture:'雨水，怎样进入木材',repair:'可拆，才有修缮余地',return:'再看一遍这座亭子'};
function Brand(){return <div style={{position:'absolute',left:64,top:48,zIndex:10,display:'flex',alignItems:'center',gap:20,color:ink,fontFamily:'Microsoft YaHei',fontSize:44,fontWeight:600,letterSpacing:1,pointerEvents:'none'}}><Img src={staticFile('episode3v6/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span>rainbow鱼</span></div>}
export function stateAt(frame:number):JoineryState{const ss=timeline.scenes;const index=ss.findIndex(s=>frame>=s.start&&frame<s.end);const i=index<0?ss.length-1:index;const s=ss[i];const clips=timeline.clips.filter(c=>c.scene===s.id);const c=clips.filter(c=>frame>=c.start).at(-1)??clips[0];return {scene:s.id,progress:clamp((frame-s.start)/(s.end-s.start)),line:(c as any)?.line??Math.max(0,clips.indexOf(c)),lineProgress:c?clamp((frame-c.start)/c.duration):0,time:frame/30,previous:ss[i-1]?.id,elapsed:(frame-s.start)/30,clip:c?.id};}
function Stage({state}:{state:JoineryState}){const ref=useRef<HTMLCanvasElement>(null),world=useRef<JoineryWorld|null>(null),last=useRef(state);last.current=state;const [handle]=useState(()=>delayRender('Loading Blender scene geometry'));useLayoutEffect(()=>{const w=new JoineryWorld(ref.current!,staticFile('episode3v6/models/'));world.current=w;w.ready.then(()=>{w.render(last.current);continueRender(handle)}).catch(cancelRender);return()=>{w.dispose();world.current=null}},[]);useLayoutEffect(()=>{world.current?.render(state)},[state]);return <canvas ref={ref} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;}
function HeaderCard({scene}:{scene:string}){return <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',fontFamily:'STSong,SimSun,serif',color:ink,pointerEvents:'none'}}><div style={{width:5,height:56,marginRight:24,background:gold,borderRadius:2}}/><div style={{fontSize:72,fontWeight:600,lineHeight:1.15,letterSpacing:2,whiteSpace:'nowrap',textShadow:'0 2px 0 rgba(255,250,240,.86)'}}>{headings[scene]}</div></div>}
function chapterTitleMotion(scene:string,elapsed:number,hasPrevious:boolean){
 const enterEnd=hasPrevious?1.28:0;
 const hold=scene==='intro'?6:4;
 const exitStart=enterEnd+hold,exitEnd=exitStart+.8;
 const entry=hasPrevious?1920*(1-smooth(clamp((elapsed-.48)/.8))):0;
 const departure=1360*smooth(clamp((elapsed-exitStart)/.8));
 return {x:entry-departure,visible:scene!=='references'&&elapsed<exitEnd};
}
function SceneHeader({scene,previous,elapsed}:{scene:string;previous?:string;elapsed:number}){
 const change=Boolean(previous&&previous!==scene),out=smooth(clamp(elapsed/.65)),incoming=smooth(clamp((elapsed-.48)/.8));
 const title=chapterTitleMotion(scene,elapsed,change);
 const previousScene=timeline.scenes.find(s=>s.id===previous);
 const previousElapsed=previousScene?(previousScene.end-previousScene.start)/30+elapsed:0;
 const oldTitle=previous?chapterTitleMotion(previous,previousElapsed,previous!=='intro'):null;
 const noteFor=(id?:string)=>id==='wind'?'Zwind 基准工况 · 载荷映射':id==='stress'?'响应量可视化 · 非材料应力':'';
 const note=noteFor(scene),previousNote=noteFor(previous);
 // Titles introduce a chapter, then move completely offscreen before close-ups.
 // The previous title uses its full scene age so an expired heading cannot
 // reappear at the next scene boundary. Short physical-quantity notes remain.
 return <div style={{position:'absolute',inset:0,zIndex:8,pointerEvents:'none'}}>
  {change&&oldTitle?.visible&&elapsed<.75&&<div style={{position:'absolute',left:66,top:143,width:1180,height:88,transform:`translateX(${Math.min(oldTitle.x,-1360*out)}px)`}}><HeaderCard scene={previous!}/></div>}
  {title.visible&&<div style={{position:'absolute',left:66,top:143,width:1180,height:88,transform:`translateX(${title.x}px)`}}><HeaderCard scene={scene}/></div>}
  {change&&previousNote&&elapsed<.75&&<div style={{position:'absolute',right:72,top:171,fontFamily:'Microsoft YaHei',fontSize:36,fontWeight:500,color:pine,transform:`translateX(${-1980*out}px)`}}>{previousNote}</div>}
  {note&&<div style={{position:'absolute',right:72,top:171,fontFamily:'Microsoft YaHei',fontSize:36,fontWeight:500,color:pine,transform:`translateX(${change?1920*(1-incoming):0}px)`}}>{note}</div>}
 </div>
}
function Caption({text}:{text:string}){return <div style={{position:'absolute',left:'50%',bottom:34,transform:'translateX(-50%)',width:'calc(100% - 180px)',zIndex:9,textAlign:'center',pointerEvents:'none'}}><span style={{display:'inline-block',fontFamily:'Microsoft YaHei',fontSize:48,lineHeight:1.2,color:'#fffaf1',background:'linear-gradient(90deg,rgba(39,55,45,.91),rgba(39,55,45,.98),rgba(39,55,45,.91))',borderTop:`3px solid ${gold}`,borderRadius:12,padding:'13px 38px 15px',maxWidth:1550,boxShadow:'0 8px 26px rgba(45,57,48,.20)',letterSpacing:.5}}>{text}</span></div>}

function SceneGuide({scene,elapsed}:{scene:string;elapsed:number}){
 const guides:Record<string,{label:string;color:string}>= {
  straight:{label:'梁端水平滑入  →  柱卯',color:'#b54f3f'},
  dovetail:{label:'柱头  →  櫨枓  →  栱  →  檐栿',color:'#2a7f7b'},
  lap:{label:'四角  →  大角樑  →  中央棖杆',color:'#b54f3f'},
  pin:{label:'木销横向锁住梁端',color:'#2a7f7b'},
  load:{label:'屋面  →  椽条  →  梁  →  柱脚',color:'#a56e33'},
  wind:{label:'Zwind 12 m/s 基准工况 · 部件载荷映射',color:'#3d5b4f'},
  moisture:{label:'表面  →  木材内部    纵向 ≠ 横向',color:'#3d5b4f'}
 };
 const g=guides[scene]; if(!g)return null; const a=smooth(clamp((elapsed-.75)/.7));
 return <div style={{position:'absolute',right:72,bottom:132,zIndex:9,pointerEvents:'none',fontFamily:'Microsoft YaHei',fontSize:36,fontWeight:600,letterSpacing:1,color:g.color,opacity:a,transform:`translateX(${46*(1-a)}px)`,textShadow:'0 2px 0 rgba(255,250,240,.8)'}}>{g.label}</div>;
}
function References({state}:{state:JoineryState}){
 const e=state.elapsed,arrival=smooth(clamp((e-.58)/1.15));
 const cards=[
  {src:'yingzao_fashi_bracket_1.jpg',title:'《营造法式》卷四：材、枓栱',meta:'宋式材分制 · Commons',width:278,rotation:-.8},
  {src:'yingzao_fashi_volume5_29.jpg',title:'《营造法式》卷五：梁、闌额',meta:'宋式构造规则 · Commons',width:300,rotation:.8},
  {src:'cai_fen_representation.png',title:'材分制重建参数',meta:'本片教育性工程重建',width:278,rotation:.5}
 ];
 // Keep the engineering flow reference first on the end card.
 const steps=[['流场','Zwind · ZDyn · 12 m/s'],['建模','Blender · Three.js'],['反算','面积/高度权重 · 反力平衡'],['含水','各向异性扩散代理'],['合成','Remotion · Qwen TTS']];
 // This is the same paper-coloured workspace sliding through the camera.
 // Stage lives in JoineryFilm, so entering the coda cannot recreate WebGL.
 return <AbsoluteFill style={{zIndex:5,color:ink,fontFamily:'Microsoft YaHei',pointerEvents:'none',transform:`translateX(${1980*(1-arrival)}px)`}}>
  <AbsoluteFill style={{background:'linear-gradient(90deg,rgba(239,232,217,0),rgba(239,232,217,.96) 8%,rgba(239,232,217,.98) 92%,rgba(239,232,217,.94))'}}/>
  <div style={{position:'absolute',inset:'146px 86px 24px'}}>
   <div style={{fontFamily:'STSong,SimSun,serif',fontSize:72,fontWeight:600,letterSpacing:3,lineHeight:1.15,borderBottom:'2px solid rgba(165,118,59,.4)',paddingBottom:18}}>形状背后的力学</div>
   <div style={{display:'flex',gap:70,marginTop:26}}>
    <div style={{width:754,flex:'0 0 auto'}}>
     <div style={{fontSize:36,color:pine,letterSpacing:3,marginBottom:22,fontWeight:700}}>技术路线</div>
     {steps.map(([label,tool],i)=>{const a=smooth(clamp((e-.85-i*.12)/.9));return <div key={label} style={{height:99,display:'flex',alignItems:'center',gap:34,borderBottom:'1px solid rgba(91,111,96,.19)',transform:`translateX(${190*(1-a)}px)`}}>
      <div style={{width:6,height:39,background:i===0?gold:pine,borderRadius:3,flex:'0 0 auto'}}/>
      <div style={{width:98,fontSize:36,color:pine,fontWeight:600}}>{label}</div>
      <div style={{fontSize:40,color:ink,fontWeight:600,whiteSpace:'nowrap'}}>{tool}</div>
     </div>})}
     <div style={{display:'flex',gap:42,marginTop:28,paddingTop:16}}>
      <div style={{width:300}}><div style={{fontSize:36,fontWeight:600,marginBottom:6}}>平均承压</div><Img src={staticFile('episode3v6/references/formula-bearing.png')} style={{width:200,height:127,objectFit:'contain',mixBlendMode:'multiply'}}/></div>
      <div style={{width:340}}><div style={{fontSize:36,fontWeight:600,marginBottom:6}}>摩擦上限</div><Img src={staticFile('episode3v6/references/formula-friction.png')} style={{width:290,height:127,objectFit:'contain',mixBlendMode:'multiply'}}/></div>
     </div>
    </div>
    <div style={{width:924,flex:'0 0 auto'}}>
     <div style={{fontSize:36,color:pine,letterSpacing:3,marginBottom:22,fontWeight:700}}>图纸与依据</div>
     <div style={{display:'flex',gap:24,alignItems:'flex-start'}}>{cards.map((c,i)=>{const settle=smooth(clamp((e-1-i*.12)/1.1));return <div key={c.src} style={{width:c.width,flex:'0 0 auto',transform:`translateY(${70*(1-settle)}px)`,transformOrigin:'top center'}}>
      <div style={{width:c.width,height:500,background:'#fff',boxShadow:'0 18px 34px rgba(74,61,42,.20)',transform:`rotate(${c.rotation*(.5+.5*settle)}deg)`,transformOrigin:'center'}}><Img src={staticFile('episode3v6/references/'+c.src)} style={{display:'block',width:'100%',height:'100%',objectFit:'fill'}}/></div>
      <div style={{marginTop:15,color:ink}}><div style={{fontSize:28,fontWeight:600,lineHeight:1.25,whiteSpace:'nowrap'}}>{c.title}</div><div style={{fontSize:25,color:muted,marginTop:6,lineHeight:1.2,whiteSpace:'nowrap'}}>{c.meta}</div></div>
     </div>})}</div>
    </div>
   </div>
  </div>
 </AbsoluteFill>
}
export function JoineryFilm({audio=true}:{audio?:boolean}){
 const frame=useCurrentFrame(),s=stateAt(frame),cap=timeline.captions.find(c=>frame>=c.start&&frame<c.end);
 return <AbsoluteFill style={{background:paper,fontFamily:'Microsoft YaHei',overflow:'hidden',color:ink}}>
  <Stage state={s}/>
  {s.scene==='references'&&<References state={s}/>}
  <Brand/>
  <SceneHeader scene={s.scene} previous={s.previous} elapsed={s.elapsed}/>
  {s.scene!=='references'&&<SceneGuide scene={s.scene} elapsed={s.elapsed}/>}
  {cap&&s.scene!=='references'&&<Caption text={cap.text}/>}
  {audio&&<Audio src={staticFile('episode3v6/master.wav')}/>}
 </AbsoluteFill>
}

