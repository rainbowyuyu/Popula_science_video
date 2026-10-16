import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import story from './launch-v15-story.json';
import captions from './launch-v15-captions.json';
import {ContinuousLaunchWorldV8,ContinuousInfoV8} from './beso/ContinuousLaunchWorldV8';
import {ProductWebV15} from './beso/ProductWebV15';
import {GeneratedLaunchBridgesV15} from './beso/GeneratedLaunchBridgesV15';

export const fps=60,durationInFrames=6300;
const ink='#143441',teal='#216471',gold='#a96535',paper='#edf3f3';
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const t=clamp(x);return t*t*t*(t*(6*t-15)+10)};
type Id='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
type Shot={id:Id;start:number;duration:number;title:string;time:number;local:number};
const shots=story.scenes as {id:Id;start:number;duration:number;title:string}[];
function shotAt(frame:number):Shot{const s=shots[Math.max(0,shots.findLastIndex(s=>frame>=s.start))];return{...s,time:frame/fps,local:(frame-s.start)/fps,duration:s.duration/fps}}

// Content stays inside its left reading lane throughout entry and exit.
export function panelTravel(time:number,start:number,end:number,entry=1,exit=1,distance=1120){
 return -distance*(1-ease((time-start)/entry))-distance*ease((time-end+exit)/exit);
}
const colour=(underwater:number,dark=ink,light='#f2f8f6')=>{
 const a=dark.match(/[a-f\d]{2}/gi)!.map(v=>parseInt(v,16)),b=light.match(/[a-f\d]{2}/gi)!.map(v=>parseInt(v,16));
 return `rgb(${a.map((v,i)=>Math.round(v+(b[i]-v)*clamp(underwater))).join(',')})`;
};
// Text stays legible while the photographic world moves from pale sky to deep water.
// The very small halo is intentional: it gives type a material edge without adding a card.
const readableText=(underwater:number,dark=ink,light='#f2f8f6'):React.CSSProperties=>({
 color:colour(underwater,dark,light),
 textShadow:underwater>.42
  ? '0 2px 2px rgba(3,22,32,.58), 0 0 14px rgba(3,30,42,.42)'
  : '0 1px 1px rgba(247,252,251,.70), 0 0 12px rgba(247,252,251,.30)',
 WebkitTextStroke:underwater>.42?'0.25px rgba(238,249,248,.25)':'0.22px rgba(15,52,65,.18)',
 textRendering:'geometricPrecision',
});
/** A single finishing pass shared by every shot.  The photographic world,
 * product UI and type are rendered by different layers; this restrained
 * grade makes them read as one camera take instead of stacked cards. */
function CinematicFinish({time,submersion}:{time:number;submersion:number}){
 const sweep=18+((time%9)/9)*140;
 const deep=clamp(submersion);
 return <AbsoluteFill data-qa="cinematic-finish" style={{zIndex:18,pointerEvents:'none',mixBlendMode:'normal'}}>
  <div style={{position:'absolute',inset:0,background:`radial-gradient(ellipse at 52% 43%,transparent 38%,rgba(2,18,28,${.08+.19*deep}) 100%)`,opacity:.92}}/>
  <div style={{position:'absolute',inset:0,opacity:.12+.05*deep,background:'repeating-linear-gradient(0deg,rgba(255,255,255,.055) 0px,rgba(255,255,255,.055) 1px,transparent 1px,transparent 5px)',mixBlendMode:'soft-light'}}/>
  <div style={{position:'absolute',inset:0,opacity:.065,background:'repeating-linear-gradient(115deg,transparent 0px,transparent 67px,rgba(187,229,231,.32) 68px,transparent 70px)',transform:`translateX(${sweep-78}px)`,mixBlendMode:'screen'}}/>
  <div style={{position:'absolute',left:56,top:44,width:430,height:2,background:'linear-gradient(90deg,rgba(229,191,130,.0),rgba(229,191,130,.65),rgba(229,191,130,0))',opacity:.36+.18*Math.sin(time*.6)**2}}/>
  <div style={{position:'absolute',right:0,bottom:0,width:'42%',height:240,background:'radial-gradient(ellipse at 100% 100%,rgba(70,153,163,.16),transparent 70%)',opacity:1-deep*.35}}/>
 </AbsoluteFill>;
}
function Stage({s,start=0,end=s.duration,top=414,width=740,role,children}:{s:Shot;start?:number;end?:number;top?:number;width?:number;role:string;children:React.ReactNode}){
 if(s.local<start||s.local>=end)return null;
 const exitDuration=1.15;
 const entering=ease((s.local-start)/.75),leaving=s.id==='close'?0:ease((s.local-end+exitDuration)/exitDuration);
 // Give the outgoing layer enough runway to clear the full 1920px viewport.
 // The previous distance left the last 40–60px of a glyph visible at the
 // screen edge during handoffs, which read as clipped text.  The extra
 // distance keeps the same eased camera move while completing the exit off
 // screen before the next shot takes the reading lane.
 const travel=-(width+140)*1.55*leaving;
 // Let the layer travel beyond the reading lane first, then finish with a
 // short edge fade.  A shallow opacity reduction left half glyphs visible at
 // the left edge during topology → physics handoffs.
 const exitAlpha=1-ease(clamp(leaving*1.45));
 return <div style={{position:'absolute',left:0,top,width:width+88,zIndex:32,overflow:'visible',pointerEvents:'none'}}><div data-qa={role} style={{position:'relative',marginLeft:88,width,transform:`translate3d(${travel}px,${20*(1-entering)}px,0)`,opacity:entering*exitAlpha,filter:'drop-shadow(0 3px 7px rgba(4,28,39,.12))'}}>{children}</div></div>;
}
function World({time,onInfo,blueprint=false}:{time:number;onInfo:(info:ContinuousInfoV8)=>void;blueprint?:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<ContinuousLaunchWorldV8|null>(null),ready=useRef(false),latest=useRef(time);latest.current=time;
 const [handle]=useState(()=>delayRender('Load original engineering assets'));
 useLayoutEffect(()=>{const w=new ContinuousLaunchWorldV8(canvas.current!,staticFile(''));world.current=w;w.ready.then(()=>{ready.current=true;blueprint?w.renderBlueprint(latest.current):w.render(latest.current);onInfo(w.info);continueRender(handle)}).catch(cancelRender);return()=>{ready.current=false;w.dispose();world.current=null}},[]);
 useLayoutEffect(()=>{if(world.current&&ready.current){blueprint?world.current.renderBlueprint(time):world.current.render(time);onInfo(world.current.info)}},[time,blueprint]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}
const headings:Record<Id,string[]>={hero:['一句需求','直达可执行工程链'],brief:['自然语言需求','变成任务图'],topology:['几何到BESO','文件自动接力'],physics:['响应回到约束',''],interaction:['失败有反馈','下一轮有依据'],toolchain:['人做工程判断','AI Engineer接力'],proof:['模型、日志、报告','可验证交付'],close:['AI Engineer']};
/**
 * The chapter title used to live in a pale, fixed left reading lane.  That
 * lane covered the water and made the wide composition feel like a slide
 * deck.  SurfaceTitle is deliberately a small piece of type projected from
 * the same 3-D anchors as the model.  Its position follows the camera's
 * projected platform/fairlead point while a deterministic, low-amplitude
 * wave motion gives the impression that the ink is floating on the sea.
 * There is no opaque card: a hairline, a soft edge and a restrained shadow
 * are enough to keep the title readable over the moving wave shader.
 */
function Title({s,submersion,info}:{s:Shot;submersion:number;info?:ContinuousInfoV8}){
 const frame=useCurrentFrame(),time=frame/fps;
 const close=s.id==='close',hero=s.id==='hero';
 const leaving=close?0:ease((s.local-s.duration+.65)/.65);
 const reveal=(i:number)=>{const entering=ease((s.local-i*.055)/(close?.46:.70));const alpha=clamp(entering)*(1-.62*leaving);return {transform:`translate3d(0,${18*(1-entering)-11*leaving}px,0)`,opacity:alpha};};
 const revealStyle=(i:number,weight=1):React.CSSProperties=>{const r=reveal(i);return {...r,opacity:(r.opacity??1)*weight};};
 // The sea is pale in the geometry handoff and review shots. Keep those
 // chapter labels in deep marine ink so they remain legible while still
 // carrying the same soft wave shadow; only the dark physics pass inverts.
 const titleTone=s.id==='physics'?clamp((s.local-3.1)/1.25):.08;
 const titleInk=titleTone>.42?'#f3fbf9':'#123747';
 const titleMaterial:React.CSSProperties={...readableText(titleTone,titleInk,'#f2fbf9'),filter:titleTone>.42?'drop-shadow(0 3px 5px rgba(2,24,35,.48))':'drop-shadow(0 1px 3px rgba(245,251,249,.52))'};
 const shotNo=Math.max(1,shots.findIndex(item=>item.id===s.id)+1);
 // The labels are tied to the projected physical object, then shifted over
 // open water so the lettering never sits on top of the tower.  If the
 // anchor leaves frame during a bridge, its last safe reading lane remains
 // stable instead of snapping to the viewport edge.
 const anchorKey:Record<Id,string>={hero:'platform-center',brief:'platform-center',topology:'specimen',physics:'fairlead-1',interaction:'platform-center',toolchain:'brief-space',proof:'platform-center',close:'platform-center'};
 const fallback:Record<Id,{x:number;y:number}>={hero:{x:520,y:580},brief:{x:440,y:630},topology:{x:390,y:570},physics:{x:360,y:560},interaction:{x:420,y:570},toolchain:{x:420,y:560},proof:{x:430,y:580},close:{x:490,y:590}};
 const anchor=info?.anchors?.[anchorKey[s.id]]??info?.platform;
 const safeAnchor=anchor&&Number.isFinite(anchor.x)&&Number.isFinite(anchor.y)?anchor:fallback[s.id];
 const shift:Record<Id,{x:number;y:number}>={hero:{x:-1080,y:156},brief:{x:-900,y:145},topology:{x:-880,y:138},physics:{x:-880,y:130},interaction:{x:-900,y:135},toolchain:{x:-900,y:130},proof:{x:-900,y:142},close:{x:-1080,y:122}};
 const fit=(value:number,min:number,max:number)=>Math.max(min,Math.min(max,value));
 const productViewportVisible=(s.id==='brief'||s.id==='interaction'||s.id==='toolchain')||(s.id==='topology'&&s.local<8.5)||(s.id==='proof'&&s.local<6.7);
 const leftContentVisible=productViewportVisible||['topology','physics','proof','close'].includes(s.id);
 // Keep chapter type in open air above a source-backed web/physics panel. The
 // panel remains the detailed instrument; the sea label identifies the scene
 // without colliding with its footer or saved pixels. A consistent dock point
 // also keeps the wide composition from becoming a stack of competing cards.
 // Dock chapter type on the open water band instead of the pale sky.  The
 // product surface begins around y=430, so 258 leaves a breathing gap while
 // making the deterministic wave drift read as part of the sea composition.
 const dockX=90,dockY=close?205:220;
 const targetX=leftContentVisible?dockX:fit(safeAnchor.x+shift[s.id].x,74,1140);
 const targetY=leftContentVisible?dockY:fit(safeAnchor.y+shift[s.id].y,390,785);
 // Two very slow components avoid a mechanical bob while staying small
 // enough that the type remains attached to the surface rather than wobbling
 // like a floating sticker.
 const phase=shotNo*.73;
 const waveX=7*Math.sin(time*.72+phase)+2.5*Math.sin(time*1.57+phase*1.7);
 const waveY=8*Math.sin(time*.96+phase*1.4)+2*Math.sin(time*1.91+phase);
 const waveAngle=.72*Math.sin(time*.68+phase)+.16*Math.sin(time*1.45+phase*.4);
 const size=close?90:hero?82:58;
 const label=close?'从工程目标开始下一项任务':s.id==='hero'?'需求 → 模型 → 结果':s.id==='physics'?'Zwind · 风浪与系泊':s.id==='topology'?'同一份上下文，接力每一步':s.id==='interaction'?'失败原因，也成为下一步输入':s.id==='proof'?'每一步，都留下复查证据':'';
 return <div style={{position:'absolute',inset:0,zIndex:40,overflow:'visible',pointerEvents:'none'}}>
  <div data-qa="title" style={{position:'absolute',left:targetX,top:targetY,width:920,whiteSpace:'nowrap',...titleMaterial,transform:`translate3d(${waveX}px,${waveY}px,0) rotate(${waveAngle}deg)`,transformOrigin:'left center',perspective:900}}>
   <div style={{display:'flex',alignItems:'center',gap:15,height:16,marginBottom:15,...revealStyle(0,.90)}}>
    <span style={{width:46,height:2,borderRadius:2,background:'linear-gradient(90deg,#d7aa70,#74b5b7)',boxShadow:'0 0 14px rgba(116,190,192,.38)'}}/>
    {!close&&<span style={{fontSize:28,fontWeight:650,letterSpacing:2}}>AI Engineer</span>}
    <span style={{fontSize:18,letterSpacing:2.8,opacity:.62}}>0{shotNo}</span>
   </div>
   <div style={{fontSize:size,lineHeight:1.14,fontWeight:760,letterSpacing:-1.2,...reveal(1)}}>{headings[s.id][0]}</div>
   {headings[s.id][1]&&<div style={{fontSize:size,lineHeight:1.14,fontWeight:760,letterSpacing:-1.2,...reveal(2)}}>{headings[s.id][1]}</div>}
   {!!label&&<div style={{display:'flex',alignItems:'center',gap:16,marginTop:16,fontSize:24,letterSpacing:.8,fontWeight:550,...revealStyle(3,.84)}}>
    <span style={{height:1,width:Math.min(180,112+shotNo*8),background:'currentColor',opacity:.48}}/>{label}
   </div>}
   {!productViewportVisible&&<div style={{height:1,width:256,marginTop:17,background:'linear-gradient(90deg,currentColor,transparent)',...revealStyle(4,.27)}}/>}
  </div>
 </div>;
}
function Handoff({s,info}:{s:Shot;info?:ContinuousInfoV8}){
 const p=clamp((s.local-1.5)/5.0),names=['几何','网格','BESO'],step=Math.min(2,Math.floor(p*3));
 return <Stage s={s} start={8.5} top={394} role="tool-handoff">
  <svg width="735" height="282" viewBox="0 0 735 282">
   <path d="M28 30 V252" stroke="#91acb3" strokeWidth="2"/>
   {names.map((name,i)=><g key={name} transform={`translate(28,${44+i*92})`}>
    <circle r={i===step?9:5} fill={i===step?'#e6ad6f':'#a4c4cb'}/>
    <text x="36" y="12" fontSize="43" fontWeight={i===step?700:500} fill={i===step?'#f8d8ae':'#e6f1f2'} stroke="#143441" strokeOpacity=".32" strokeWidth=".65" paintOrder="stroke">{name}</text>
    <text x="316" y="10" fontSize="36" fill={i===step?'#f8d8ae':'#cde0e3'} stroke="#143441" strokeOpacity=".28" strokeWidth=".55" paintOrder="stroke">{['STEP','INP','优化结果'][i]}</text>
   </g>)}
   <g transform={`translate(28,${44+184*ease(p)})`}><circle r="15" stroke="#e0b67d" strokeWidth="2" fill="#143946"/><circle r="6" fill="#f2ce99"/></g>
  </svg>
  <div style={{fontSize:36,color:'#bfd8dc',marginTop:4}}>一条任务，贯穿全链路</div>
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
 const first=s.local<4.8;
 const anchor=first?info.platform:info.fairlead;
 const lineWeight=first?ease((s.local-1.0)/.7)*(1-ease((s.local-3.8)/.55)):ease((s.local-5.0)/.7)*(1-ease((s.local-8.85)/.65));
 const lineVisible=anchor.visible&&anchor.x>855&&anchor.x<1840&&anchor.y>155&&anchor.y<915;
 return <>
  <Stage s={s} start={.15} end={4.7} top={414} role="platform-response">
   <div style={{fontSize:42,fontWeight:600,color:accent}}>Zwind · 平台纵荡</div>
   <div style={{fontSize:88,fontWeight:700,marginTop:25,color:fg,fontVariantNumeric:'tabular-nums'}}>{info.native.surge.toFixed(2)}<span style={{fontSize:42,marginLeft:17}}>m</span></div>
   <div style={{fontSize:36,color:accent,marginTop:32}}>保存响应回放 · 视觉波面</div>
  </Stage>
  <Stage s={s} start={4.7} end={9.6} top={414} role="mooring-response">
   <div style={{fontSize:42,fontWeight:600,color:accent}}>Zwind · 系泊张力</div>
   <div style={{fontSize:88,fontWeight:700,marginTop:25,color:fg,fontVariantNumeric:'tabular-nums'}}>{(info.lineTension/1000).toFixed(0)}<span style={{fontSize:42,marginLeft:17}}>kN</span></div>
   <div style={{fontSize:36,color:accent,marginTop:32}}>保存响应回放 · 视觉波面</div>
  </Stage>
  <Stage s={s} start={9.6} top={438} role="response-to-constraint">
   <div style={{fontSize:52,fontWeight:650,color:fg,lineHeight:1.45}}>运动与张力<br/>回到设计约束</div>
   <div style={{fontSize:36,color:accent,marginTop:30}}>AI Engineer · 结果回读</div>
  </Stage>
  {lineVisible&&lineWeight>0&&<svg data-qa="response-anchor" width="1920" height="1080" style={{position:'absolute',inset:0,zIndex:25,pointerEvents:'none',opacity:lineWeight}}><path d={`M 765 566 C 825 566 835 ${anchor.y} ${anchor.x} ${anchor.y}`} fill="none" stroke={colour(water,'#a96535','#edba80')} strokeWidth="8" opacity=".16"/><path d={`M 765 566 C 825 566 835 ${anchor.y} ${anchor.x} ${anchor.y}`} fill="none" stroke={colour(water,'#a96535','#edba80')} strokeWidth="4" strokeLinecap="round"/><circle cx={anchor.x} cy={anchor.y} r="7" fill={colour(water,'#a96535','#edba80')} stroke="#f5d39b" strokeWidth="1.2"/></svg>}
 </>;
}
function Proof({s}:{s:Shot}){
 const reduction=ease((s.local-8.25)/.6),checks=ease((s.local-10.6)/.7);
 return <>
  <Stage s={s} start={6.7} top={376} role="manuscript-case">
   <div style={{fontSize:36,fontWeight:600,color:teal}}>稿件案例 · 单位功率用钢量</div>
   <div style={{fontSize:64,fontWeight:650,marginTop:24}}>278 <span style={{fontSize:42,color:teal}}>→</span> 255.5 <span style={{fontSize:36,fontWeight:500}}>t/MW</span></div>
   <div style={{fontSize:112,fontWeight:700,color:gold,letterSpacing:-4,marginTop:23,opacity:reduction,transform:`translateY(${32*(1-reduction)}px)`}}>−8.1<span style={{fontSize:56,letterSpacing:0}}>%</span></div>
   <div style={{fontSize:36,color:teal,marginTop:16}}>图强号参考 → 案例方案</div>
   <div style={{fontSize:44,fontWeight:600,marginTop:32,opacity:checks,transform:`translateY(${24*(1-checks)}px)`}}>强度 + 运动响应，一起检查</div>
  </Stage>
 </>;
}
function Caption(){
 const frame=useCurrentFrame(),ms=frame/fps*1000,c=(captions as {text:string;startMs:number;endMs:number}[]).find(c=>ms>=c.startMs&&ms<c.endMs);if(!c)return null;
 const alpha=Math.min(ease((ms-c.startMs)/130),ease((c.endMs-ms)/130));
 return <div data-qa="caption" style={{position:'absolute',bottom:0,left:0,right:0,height:142,zIndex:95,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 140px 22px',background:'linear-gradient(180deg,transparent,rgba(6,25,37,.06) 30%,rgba(6,25,37,.53))',opacity:alpha}}><span style={{fontSize:44,fontWeight:600,letterSpacing:.8,color:'#fbfdfd',lineHeight:1.28,textShadow:'0 2px 3px rgba(3,20,29,.95), 0 0 13px rgba(3,22,31,.7)',WebkitTextStroke:'0.28px rgba(255,255,255,.28)',textAlign:'center',maxWidth:1510,textRendering:'geometricPrecision'}}>{c.text}</span></div>;
}
function Brand({info}:{info?:ContinuousInfoV8}){
 const white=info?.underwater??0;
 return <div data-qa="brand" style={{position:'absolute',right:54,top:35,width:310,height:77,zIndex:86,pointerEvents:'none'}}>
  <div style={{position:'absolute',inset:'-16px -24px',background:'radial-gradient(ellipse at center,rgba(244,248,246,.90) 22%,rgba(244,248,246,.62) 55%,transparent 77%)',filter:'blur(8px)',opacity:1-white}}/>
  <Img src={staticFile('brand/zju-horizontal-mark.svg')} style={{position:'absolute',inset:0,width:310,height:77,objectFit:'contain',opacity:1-white,filter:'drop-shadow(0 0 1px #f4f8f6)'}}/>
  <Img src={staticFile('brand/zju-horizontal-mark.svg')} style={{position:'absolute',inset:0,width:310,height:77,objectFit:'contain',opacity:white,filter:'brightness(0) invert(1) drop-shadow(0 1px 3px #082a38)'}}/>
 </div>;
}
export const LaunchFilmV15:React.FC<{audio?:boolean;overlay?:boolean;qa?:boolean;blueprint?:boolean}>=({audio=true,overlay=true,qa=false,blueprint=false})=>{
 const frame=useCurrentFrame(),s=shotAt(frame),[info,setInfo]=useState<ContinuousInfoV8>();
 const topologyShade=ease((s.time-22.3)/1.5)*(1-ease((s.time-38.7)/1.3));
 const submersion=Math.max(topologyShade,info?.underwater??0);
 useLayoutEffect(()=>{if(!qa||!info)return;const canvas=document.querySelector('canvas');if(!canvas)return;const c=canvas.getBoundingClientRect(),scale=1920/c.width;const boxes=Array.from(document.querySelectorAll('[data-qa]')).map(el=>{const r=el.getBoundingClientRect();return{role:el.getAttribute('data-qa'),text:el.textContent?.slice(0,180),x:(r.x-c.x)*scale,y:(r.y-c.y)*scale,width:r.width*scale,height:r.height*scale}});console.log('LAYOUT_QA '+JSON.stringify({frame,scene:s.id,boxes,camera:info.camera,native:info.native}))},[frame,info,qa]);
 return <AbsoluteFill style={{fontFamily:'Microsoft YaHei, Noto Sans CJK SC, sans-serif',background:paper,color:ink,overflow:'hidden'}}>
  <World time={s.time} onInfo={setInfo} blueprint={blueprint}/>
  {!blueprint&&<CinematicFinish time={s.time} submersion={submersion}/>}
  {!blueprint&&overlay&&<GeneratedLaunchBridgesV15/>}
  {overlay&&<>
   {/* A narrow atmospheric wash keeps web panels readable without recreating
       the old full-height left card.  Chapter type now lives on the sea. */}
   <AbsoluteFill style={{zIndex:12,pointerEvents:'none',background:`linear-gradient(90deg,${colour(submersion,'#edf3f3','#0b2d3c')} 0%,${colour(submersion,'#edf3f3','#0b2d3c')} 19%,transparent 43%)`,opacity:.18}}/>
   {['brief','interaction','toolchain'].includes(s.id)&&<ProductWebV15 frame={frame} fps={fps} section="auto"/>}
   {s.id==='topology'&&<div style={{color:'#f2f8f6'}}>{s.local<8.5?<ProductWebV15 frame={frame} fps={fps} section="handoff"/>:<Handoff s={s} info={info}/>}</div>}
   {s.id==='physics'&&<Physics s={s} info={info}/>}
   {s.id==='proof'&&<>{s.local<6.7&&<ProductWebV15 frame={frame} fps={fps} section="delivery"/>}{s.local>=5.7&&<Proof s={s}/>}</>}
   <Title s={s} submersion={submersion} info={info}/><Brand info={info}/>
   {s.id==='close'&&<Stage s={s} start={.3} top={424} role="cta"><div style={{fontSize:52,fontWeight:600,lineHeight:1.5}}>把需求接到模型<br/>把结果带回判断</div><div style={{fontSize:36,color:teal,marginTop:31}}>AI Engineer · 从工程目标开始下一项任务</div></Stage>}
   <Caption/>
  </>}
  {audio&&<Audio src={staticFile('audio/launch-v15-voice-forward.wav')}/>}
 </AbsoluteFill>;
};


