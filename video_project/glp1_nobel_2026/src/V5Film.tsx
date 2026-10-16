import React,{useEffect,useLayoutEffect,useRef,useState,useCallback} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {V5World} from './V5World';
import {V5View,V5Clip,viewOf} from './V5CameraPath';
import {TYPOGRAPHY} from './Scale';
import {C,stateAt,smooth,Timeline,FrameState} from './visual';
import tlData from './timeline.json';

const timeline=tlData as Timeline;
// Keep the series strip identical in the opening, every anatomy shot, and
// any re-rendered section.  Older splice-based deliveries used a legacy
// spaced version in the tail, which made the typography jump at the splice.
const SERIES_LABEL='5分钟科普 · 血压血糖血脂';
type Projected={text:string;x:number;y:number;left:number;top:number;width:number;color:string;opacity:number};


function WorldLayer({frame,onLabels,onDistance}:{frame:number;onLabels:(x:Projected[])=>void;onDistance:(d:number)=>void}){
 const {scene,camera,gl}=useThree();const world=useRef<V5World|null>(null);const current=useRef(frame);current.current=frame;const [ready,setReady]=useState(false);
 const [handle]=useState(()=>delayRender('Loading shared metre-scale anatomy',{timeoutInMilliseconds:180000}));
 const render=useCallback((f:number)=>{
  const w=world.current;if(!w)return;const state=stateAt(f,timeline);w.update(state);onDistance(w.cameraPath.sample(f).distance);
  const output:Projected[]=[];
  // A cross-scale handoff can briefly expose the same annotation from the
  // departing and arriving layers. Keep one label per phrase in the frame so
  // the LDL clearance close-up reads once instead of showing two competing
  // leaders while the camera is still moving.
  const uniqueLabels=[] as ReturnType<V5World['labels']>;
  for(const label of w.labels(state)){
   if(uniqueLabels.some(previous=>previous.text===label.text))continue;
   uniqueLabels.push(label);
  }
  for(const label of uniqueLabels.slice(0,3)){
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
  const w=new V5World(scene,camera as T.PerspectiveCamera,gl,staticFile(''),timeline);world.current=w;let live=true;
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
 const clip=s.clip as V5Clip;let text=clip.note??'';
 if(!text||clip.id==='h001')return null;
 const introArrival=clip.id==='h002'?smooth((s.frame-clip.start)/24):1;
 return <div style={{position:'absolute',left:90,top:524,width:590,color:'#52716b',fontSize:40,lineHeight:1.60,fontWeight:500,whiteSpace:'pre-line',transform:`translateY(${24*(1-introArrival)}px)`,clipPath:introArrival<1?`inset(0 0 ${100*(1-introArrival)}% 0)`:undefined}}>{text}</div>;
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
  <div style={{position:'absolute',left:90,top:185,fontSize:70,fontWeight:650,color:C.ink}}>理解调节，让改变更容易</div>
  {papers.map((p,i)=>{const u=smooth((elapsed-i*.25)/2);return <div key={p.file} style={{position:'absolute',left:300+i*440+180*(1-u),top:310+i%2*20,width:430,opacity:u}}>
   <Img src={staticFile('papers/'+p.file)} style={{width:430,height:540,objectFit:'cover',objectPosition:'top',transform:`rotate(${(i-1)*2}deg)`,boxShadow:'0 18px 35px #40504624'}}/>
   <div style={{marginTop:24,fontSize:36,fontWeight:600}}>{p.title}</div><div style={{fontSize:36,marginTop:8,color:'#5d756f'}}>{p.note}</div>
  </div>})}
 </div>;
}

export function V5Film({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){
 const frame=useCurrentFrame(),s=stateAt(frame,timeline),clip=s.clip as V5Clip;
 const [labels,setLabels]=useState<Projected[]>([]),[distance,setDistance]=useState(1);
 const onLabels=useCallback((v:Projected[])=>setLabels(v),[]),onDistance=useCallback((d:number)=>setDistance(d),[]);
 const heading=clip.id==='h001'?'一顿饭后\n身体在忙什么？':clip.id==='h077'?'识别急症\n及时求助':clip.heading??'看懂身体调节\n科学减重';let groupIndex=timeline.clips.findIndex(c=>c.id===clip.id);while(groupIndex>0&&(timeline.clips[groupIndex-1] as V5Clip).heading===clip.heading)groupIndex--;const groupStart=timeline.clips[groupIndex].start;
 // Carry the opening question upward into the first chapter while the same
 // camera keeps moving. Both strings share one clipped window, so neither
 // replaces the other abruptly at the narration boundary.
 const introHandoff=frame>=280&&frame<322;
 const introTravel=smooth((frame-280)/42);
 const nextIntroHeading=(timeline.clips[1] as V5Clip).heading??'减重与三高';
 const reveal=smooth((frame-groupStart+8)/42),alignedCaption=timeline.captions.find(c=>frame>=c.start&&frame<c.end);
 // A paraphrased connective can align to only one frame after a re-recording.
 // Let the immediately following readable caption cover that tiny interval,
 // rather than flashing an unreadable fragment between complete sentences.
 const caption=alignedCaption&&alignedCaption.end-alignedCaption.start<=3
  ?timeline.captions.find(c=>c.start===alignedCaption.end&&c.end-c.start>3)
  :alignedCaption;
 const coda=frame>=timeline.clips.at(-1)!.end;
 const [fontHandle]=useState(()=>delayRender('Loading one shared type family'));
 useEffect(()=>{new FontFace('Rainbow Sans',`url(${staticFile('fonts/unified.woff2')})`,{weight:'100 900',style:'normal'}).load().then(font=>{document.fonts.add(font);continueRender(fontHandle)}).catch(cancelRender)},[fontHandle]);
 return <AbsoluteFill style={{background:C.paper,fontFamily:TYPOGRAPHY.family,color:C.ink}}>
  <ThreeCanvas width={1920} height={1080} dpr={1} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} camera={{fov:34,near:.00001,far:12}}><WorldLayer frame={frame} onLabels={onLabels} onDistance={onDistance}/></ThreeCanvas>
  {!clean&&<>
   {!coda&&<>
    <div style={{position:'absolute',inset:0,pointerEvents:'none',background:'linear-gradient(90deg,rgba(242,238,231,.97),rgba(242,238,231,.90) 25%,rgba(242,238,231,0) 47%)'}}/>
    <div style={{position:'absolute',left:90,top:212,width:660,transform:`translateX(${-18*(1-reveal)}px)`,opacity:.88+.12*reveal}}>
     <div style={{fontSize:36,fontWeight:550,color:'#ffffff',background:'#3c746f',display:'inline-block',padding:'10px 18px',borderRadius:9,marginBottom:22}}>{SERIES_LABEL}</div>
     <div style={{fontSize:72,lineHeight:1.30,fontWeight:650,whiteSpace:'pre-line',...(introHandoff?{position:'relative' as const,height:188,overflow:'hidden'}:{})}}>
      {introHandoff?<>
       <div style={{position:'absolute',top:0,left:0,transform:`translateY(${-188*introTravel}px)`}}>{'一顿饭后\n身体在忙什么？'}</div>
       <div style={{position:'absolute',top:0,left:0,transform:`translateY(${188*(1-introTravel)}px)`}}>{nextIntroHeading}</div>
      </>:heading}
     </div>
    </div>
    <DetailNote s={s} distance={distance}/>
    <Ruler distance={distance}/>
    {labels.map((l,i)=>{const targetX=l.x<l.left?l.left:l.x>l.left+l.width?l.left+l.width:l.left+l.width*.5;const targetY=l.top+52;return <React.Fragment key={i}>
     <svg width={1920} height={1080} style={{position:'absolute',inset:0,opacity:l.opacity,pointerEvents:'none'}}><path d={`M${l.x},${l.y} Q${(l.x+targetX)/2},${targetY} ${targetX},${targetY}`} stroke={l.color} fill="none" strokeWidth={2}/><circle cx={l.x} cy={l.y} r={4.5} fill={l.color}/></svg>
     <div style={{position:'absolute',left:l.left,top:l.top,fontSize:38,fontWeight:550,color:C.ink,whiteSpace:'nowrap',opacity:l.opacity,textShadow:'0 2px 8px #f2eee7,0 0 8px #f2eee7'}}>{l.text}</div>
    </React.Fragment>})}
    {caption&&<div style={{position:'absolute',bottom:38,left:90,right:90,textAlign:'center'}}><span style={{fontSize:48,lineHeight:1.45,fontWeight:500,display:'inline-block',padding:'10px 28px',borderRadius:16,background:'rgba(248,245,239,.94)',color:'#25413e',boxShadow:'0 4px 24px #21382d08'}}>{caption.text}</span></div>}
   </>}
   <Coda frame={frame}/>
   <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:30}}><Img src={staticFile('brand/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span style={{fontSize:44,fontWeight:600}}>rainbow鱼</span></div>
  </>}
  {audio&&<Audio src={staticFile('master-v20.wav')}/>}
 </AbsoluteFill>;
}
