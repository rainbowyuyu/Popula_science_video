import React,{useLayoutEffect,useRef,useState,useMemo} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {JoineryWorld,FrameState,clamp,smooth} from './World';
import rawTimeline from './timeline.json';
import rawAnnotations from './annotations.json';
import {FirstMentionAnnotations,AnnotationAnchor,AnnotationCue} from './Annotations';
const timeline=rawTimeline as {duration:number;scenes:{id:string;start:number;end:number}[];clips:{scene:string;start:number;duration:number;line:number}[];captions:{start:number;end:number;text:string}[]};

const ink='#293b32',pine='#446557',paper='#eee7d8',gold='#a87840';
const headings:Record<string,string>={intro:'亭子，怎样站住',straight:'榫头，怎样装进去',frame:'两榀，合成一座亭',bracket:'柱头的小桥',hip:'四角托起尖顶',assembly:'顺着工序，装回去',gravity:'重量往哪儿走',wind:'风来了，哪里受力',inverse:'从变形，找回力',return:'每一块，都有位置'};
export function stateAt(frame:number):FrameState{
 const i=Math.max(0,timeline.scenes.findIndex(s=>frame>=s.start&&frame<s.end));
 const s=timeline.scenes[i],clips=timeline.clips.filter(c=>c.scene===s.id);
 const c=clips.filter(c=>frame>=c.start).at(-1)??clips[0];
 return {scene:s.id,previous:timeline.scenes[i-1]?.id,elapsed:(frame-s.start)/30,duration:(s.end-s.start)/30,progress:clamp((frame-s.start)/(s.end-s.start)),time:frame/30,line:c?.line??0,lineProgress:c?clamp((frame-c.start)/c.duration):0};
}
type PhysicsOverlay={mode:'none'|'path'|'flow'|'signed'|'envelope'|'reaction'|'pressure';label:string;unit:string;min:number;max:number;parts:string[];displayGain:number;signed:boolean;flow:boolean;opacity:number;probe?:{topMPa:number;bottomMPa:number}};
function Stage({state,onAnchors,onOverlay}:{state:FrameState;onAnchors:(a:Record<string,AnnotationAnchor>)=>void;onOverlay:(o:PhysicsOverlay)=>void}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<JoineryWorld|null>(null),ready=useRef(false),latest=useRef(state);latest.current=state;
 const [handle]=useState(()=>delayRender('Loading repaired pavilion and native simulation results'));
 useLayoutEffect(()=>{const w=new JoineryWorld(canvas.current!,staticFile('episode3v7/'));world.current=w;w.ready.then(()=>{ready.current=true;w.render(latest.current);onAnchors(w.getAnnotationAnchors(latest.current));onOverlay(w.getPhysicsOverlay(latest.current));continueRender(handle)}).catch(cancelRender);return()=>{ready.current=false;w.dispose();world.current=null}},[]);
 useLayoutEffect(()=>{if(ready.current&&world.current){world.current.render(state);onAnchors(world.current.getAnnotationAnchors(state));onOverlay(world.current.getPhysicsOverlay(state))}},[state]);
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
function PhysicsKey({state:s,overlay:o}:{state:FrameState;overlay:PhysicsOverlay}){
 if(!['gravity','wind'].includes(s.scene)||o.mode==='none'||o.mode==='path')return null;
 const flow=o.mode==='flow',signed=o.mode==='signed';
 const enter=1980*(1-smooth(clamp((s.elapsed-3.2)/1.1))),leave=2100*smooth(clamp((s.elapsed-(s.duration-1.4))/1.2)),x=enter+leave;
 const display=(value:number)=>Math.abs(value)<1?value.toFixed(3):value.toFixed(1);
 return <><div style={{position:'absolute',right:68,top:75,transform:`translateX(${x}px)`,color:pine,fontSize:36,fontFamily:'Microsoft YaHei',fontWeight:600,letterSpacing:.5}}>{o.label}</div>
  <div style={{position:'absolute',left:68,bottom:153,transform:`translateX(${-x}px)`,width:380,color:pine,fontFamily:'Microsoft YaHei',fontSize:36,lineHeight:1.45}}>
   {flow?<div>二维绕流示意</div>:<>
    {['signed','envelope','pressure'].includes(o.mode)&&<>
     <div style={{height:9,background:'linear-gradient(90deg,#4b8f99,#e7d5a4,#bd4c39)',borderRadius:8}}/>
     <div style={{display:'flex',justifyContent:'space-between',marginTop:5}}><span>{display(o.min)}</span><span>{display(o.max)} {o.unit}</span></div>
    </>}
    {signed&&<div>受压 ← 0 → 受拉</div>}
    {o.mode==='reaction'&&<div>支承反力 · {display(o.max)} {o.unit}</div>}
    {s.scene==='wind'&&o.mode==='envelope'&&o.displayGain>1&&<div style={{marginTop:10}}>位移 ×{o.displayGain.toFixed(0)}</div>}
   </>}
  </div></>;
}
function References({state:s}:{state:FrameState}){
 const slide=2000*(1-smooth(clamp(s.elapsed/1.5)));
 const steps=[['结构','Zwind / ZDyn'],['建模','Blender + Three.js'],['绕流','二维 D2Q9'],['制作','Remotion']];
 return <AbsoluteFill style={{zIndex:8,transform:`translateX(${slide}px)`,background:'linear-gradient(90deg,#eee7d800,#eee7d8 5%,#eee7d8f7)',color:ink,pointerEvents:'none'}}>
  <div style={{position:'absolute',left:68,top:169,fontSize:72,fontFamily:'STSong,SimSun,serif',fontWeight:600,letterSpacing:3}}>木构背后的力学</div>
  <div style={{position:'absolute',left:72,top:286,width:740,fontFamily:'Microsoft YaHei'}}>
   {steps.map(([label,tool],i)=><div key={label} style={{height:89,display:'flex',alignItems:'center',gap:32,borderBottom:'1px solid #58726338',transform:`translateX(${150*(1-smooth(clamp((s.elapsed-.5-i*.1)/.85)))}px)`}}><span style={{fontSize:36,color:pine,width:80}}>{label}</span><span style={{fontSize:40,fontWeight:600}}>{tool}</span></div>)}
   <div style={{display:'flex',alignItems:'center',gap:20,marginTop:37}}><span style={{width:170,flexShrink:0,whiteSpace:'nowrap',fontSize:36,color:pine}}>结构平衡</span><Img src={staticFile('episode3v7/references/equilibrium.png')} style={{width:470,height:90,objectFit:'contain',mixBlendMode:'multiply'}}/></div>
   <div style={{display:'flex',alignItems:'center',gap:20,marginTop:16}}><span style={{width:170,flexShrink:0,whiteSpace:'nowrap',fontSize:36,color:pine}}>弯曲应力</span><Img src={staticFile('episode3v8/references/bending.png')} style={{width:470,height:90,objectFit:'contain',mixBlendMode:'multiply'}}/></div>
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
 const frame=useCurrentFrame(),s=useMemo(()=>stateAt(frame),[frame]),cap=timeline.captions.find(c=>frame>=c.start&&frame<c.end);
 const [anchors,setAnchors]=useState<Record<string,AnnotationAnchor>>({});
 const [overlay,setOverlay]=useState<PhysicsOverlay>({mode:'none',label:'',unit:'',min:0,max:0,parts:[],displayGain:1,signed:false,flow:false,opacity:0});
 return <AbsoluteFill style={{background:paper,overflow:'hidden'}}><Stage state={s} onAnchors={setAnchors} onOverlay={setOverlay}/><Title state={s}/><PhysicsKey state={s} overlay={overlay}/><FirstMentionAnnotations frame={frame} cues={rawAnnotations as AnnotationCue[]} anchors={anchors}/>{s.scene==='references'&&<References state={s}/>}<Brand/>{cap&&s.scene!=='references'&&<Caption text={cap.text}/>}<div style={{position:'absolute',inset:0,pointerEvents:'none',boxShadow:'inset 0 0 120px #fff8e80d'}}/>{audio&&<Audio src={staticFile('episode3v8/master.wav')}/>}</AbsoluteFill>;
}
