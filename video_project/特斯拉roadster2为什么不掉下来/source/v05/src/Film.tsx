import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Img,cancelRender,continueRender,delayRender,staticFile,useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {World} from './World';
import {cueAt,ease,getSection,section,timeline} from './Timeline';
import captions from './captions-data.json';
const INK='#243337',BLUE='#247b84',ORANGE='#b8613d';
let fonts:Promise<void>|undefined;
const readyFonts=()=>fonts??=(async()=>{const f=new FontFace('Noto Sans SC',`url(${staticFile('fonts/NotoSansSC-VF.ttf')})`,{weight:'100 900'});await f.load();document.fonts.add(f);await document.fonts.ready;})();
// Screen labels project from the updated world. Two separate lanes prevent collisions.
function syncLabels(w:World,t:number){
 const cue=(id:string)=>timeline.cues.find(c=>c.id===id)!;
 const spans=[['s05','s06'],['s08','s11'],['s15','s17'],['s19','s22'],['s25','s26']];
 const active=spans.find(([a,b])=>t>=cue(a).startSec&&t<=cue(b).endSec);
 let labels:Array<[string,string,string]>=[];
 if(active?.[0]==='s05')labels=[['fan','抽气风扇',BLUE],['pressure','低压区',BLUE]];
 if(active?.[0]==='s08')labels=[['weight','重力',ORANGE],['lift','压差力',BLUE]];
 if(active?.[0]==='s15')labels=[['weight','重力',ORANGE],['thrust',t>=cue('s17').startSec?'喷气停止':'气体喷出',BLUE]];
 if(active?.[0]==='s19')labels=[['car','重心',ORANGE]];
 if(active?.[0]==='s25')labels=[['tank','储气罐',BLUE]];
 const fade=active?ease((t-cue(active[0]).startSec)/.55)*ease((cue(active[1]).endSec-t)/.3):0;
 for(let i=0;i<2;i++){
  const el=document.getElementById('world-label-'+i),line=document.getElementById('label-line-'+i),dot=document.getElementById('label-dot-'+i);
  if(!el||!line||!dot)continue;const row=labels[i];
  if(!row){el.style.opacity='0';line.style.opacity='0';dot.style.opacity='0';continue;}
  const a=w.projectAnchor(row[0]),x=(a.x+1)*960,y=(1-a.y)*540,right=i===1||labels.length===1;
  const lx=right?Math.min(1570,Math.max(1300,x+185)):Math.max(105,Math.min(380,x-340));
  const ly=Math.min(730,Math.max(365,y+(right?-70:60)));
  const alpha=a.visible&&x>60&&x<1860&&y>290&&y<850?String(fade):'0';
  el.textContent=row[1];el.style.color=row[2];el.style.left=lx+'px';el.style.top=ly+'px';el.style.opacity=alpha;
  line.setAttribute('x1',String(x));line.setAttribute('y1',String(y));line.setAttribute('x2',String(right?lx:lx+155));line.setAttribute('y2',String(ly+30));line.setAttribute('stroke',row[2]);line.style.opacity=alpha;
  dot.setAttribute('cx',String(x));dot.setAttribute('cy',String(y));dot.setAttribute('fill',row[2]);dot.style.opacity=alpha;
 }
}
function Scene({frame}:{frame:number}){
 const {scene,camera,gl}=useThree();const ref=useRef<World|null>(null),current=useRef(frame);current.current=frame;
 const [handle]=useState(()=>delayRender('Roadster studio and fonts',{timeoutInMilliseconds:120000}));
 useLayoutEffect(()=>{let alive=true;let w:World|undefined;readyFonts().then(()=>{if(!alive)return;w=new World(scene,camera as T.PerspectiveCamera,gl);ref.current=w;w.update(current.current/30);syncLabels(w,current.current/30);gl.render(scene,camera);continueRender(handle);}).catch(cancelRender);return()=>{alive=false;w?.dispose();ref.current=null;};},[scene,camera,gl,handle]);
 useLayoutEffect(()=>{if(ref.current){ref.current.update(frame/30);syncLabels(ref.current,frame/30);gl.render(scene,camera);}},[frame,gl,scene,camera]);return null;
}
function Brand(){return <div style={{position:'absolute',left:62,top:39,display:'flex',alignItems:'center',gap:15,color:INK,fontSize:36,fontWeight:650}}><Img src={staticFile('brand/logo.png')} style={{height:72,width:62,objectFit:'contain'}}/>rainbow鱼</div>;}
const sectionTitles:Record<string,[string,string]>={hook:['倒挂不掉，还能翻滚？','特斯拉 Roadster · 发布演示背后的原理'],suction:['是谁把车压住了？','先从一只吸盘说起'],ceiling:['车翻了，重力没翻',''],release:['离开轨道，怎么办？',''],thrust:['把气喷出去，把车推起来',''],roll:['同样的力，换个位置',''],control:['转起来，还要刹得住',''],limits:['储气罐总有用完的时候',''],recap:['顺着空气，读懂这辆车','']};
function Titles({t}:{t:number}){const s=getSection(t);if(s.id==='coda')return null;const title=sectionTitles[s.id]??sectionTitles.hook,elapsed=t-s.start,hold=s.id==='hook'?10.5:6.2,a=ease((elapsed+.08)/.75)*ease((hold-elapsed)/.8);return <div style={{position:'absolute',left:105,top:166,color:INK,opacity:a,transform:`translateY(${(1-ease(elapsed/.75))*18}px)`}}><div style={{fontSize:s.id==='hook'?83:73,fontWeight:780,letterSpacing:-2,lineHeight:1.18}}>{title[0]}</div>{title[1]&&<div style={{fontSize:36,fontWeight:500,marginTop:20,color:'#687578',letterSpacing:1}}>{title[1]}</div>}</div>;}
const captionTime=(cueId:string,needle:string,fallback:number)=>{const c=captions.cues.find(x=>x.cueId===cueId&&x.text.includes(needle));return c?c.startFrame/30:fallback;};
function Mechanism({t}:{t:number}){const c=cueAt(t),s=getSection(t);if(!c)return null;let main='',sub='';
 if(c.id==='s09'){main='压差力 ＞ 重力';sub='留出余量，轮胎才压得紧';}
 if(c.id==='s10'||c.id==='s11'){main='压差 × 面积';sub='假设算例  1500 kg · 3 m² → 约 4.9 kPa';}
 if(c.id==='s16'){const brake=captionTime('s16','要悬停',c.startSec+3),hover=captionTime('s16','再让推力',c.startSec+6),jump=captionTime('s16','要跃起',c.endSec-4);if(t<brake){main='推力 ＞ 重力';sub='向上加速';}else if(t<hover){main='推力暂时小于重力';sub='仍在上升，速度逐渐减小';}else if(t<jump){main='悬停：速度为零，合力为零';sub='推力与重力平衡';}else{main='先积累向上的速度';sub='跃起和持续悬停，是两回事';}}
 if(c.id==='s17'){main='喷气停了，重力还在';sub='先减速上升，再向下落';}
 if(c.id==='s19'||c.id==='s20'){main='推力偏心 → 产生力矩';sub='合力管移动，力矩管转动';}
 if(c.id==='s22'){main='转起来 → 反向刹转';sub='反方向力矩，减慢翻转';}
 if(c.id==='s23'||(c.id==='s24'&&t<c.startSec+2.8)){main='喷嘴跟着车身转';sub='姿态示意 · 重力方向始终不变';}
 if(c.id==='s25'){main='每次喷气，都在消耗储备';sub='罐容与内部布置为原理示意';}
 if(!main)return null;const a=ease((t-c.startSec)/.65)*ease((c.endSec-t)/.35);
 return <div style={{position:'absolute',left:105,bottom:168,color:INK,opacity:a,transform:`translateX(${(1-a)*-18}px)`,borderLeft:`5px solid ${s.id==='roll'||s.id==='control'?ORANGE:BLUE}`,padding:'3px 23px',textShadow:'0 1px 14px #f5f4efff',background:'linear-gradient(90deg,#f3f2edc9,#f3f2ed00)'}}><div style={{fontSize:52,fontWeight:700,letterSpacing:-.5}}>{main}</div><div style={{fontSize:36,marginTop:8,fontWeight:450,color:'#57676a'}}>{sub}</div></div>;}
function Caption({frame}:{frame:number}){const c=captions.cues.find(c=>frame>=c.startFrame&&frame<c.endFrame);return c?<div style={{position:'absolute',bottom:39,left:90,right:90,textAlign:'center',fontSize:49,fontWeight:550,color:INK,lineHeight:1.35}}><span style={{padding:'9px 25px 12px',background:'#fbfaf5f2',border:'1px solid #ffffffa0',borderRadius:11,boxShadow:'0 4px 24px #283c3c0b'}}>{c.text.replace(/^[，。；：！？]+|[，。；：]$/g,'')}</span></div>:null;}
function Evidence({t}:{t:number}){const s=section('coda'),p=ease((t-s.start)/1.3);if(t<s.start)return null;return <div style={{position:'absolute',inset:0,background:'linear-gradient(115deg,#f2f1ec,#e4e9e5)',transform:`translateX(${(1-p)*1960}px)`,color:INK}}>
 <div style={{position:'absolute',left:105,top:178,fontSize:73,fontWeight:750,letterSpacing:-2}}>惊奇的动作，熟悉的物理</div>
 <div style={{position:'absolute',left:110,top:370}}>{[['贴住表面','pressure'],['改变速度','translation'],['改变转动','torque']].map(([label,name],i)=><div key={name} style={{display:'flex',alignItems:'center',gap:30,height:112,transform:`translateX(${(1-ease((t-s.start-.2*i)/1.1))*-70}px)`,opacity:ease((t-s.start-.2*i)/1.1)}}><span style={{width:195,fontSize:43,fontWeight:550}}>{label}</span><Img src={staticFile('formulas/'+name+'.png')} style={{height:70,maxWidth:650,objectFit:'contain'}}/></div>)}</div>
 <div style={{position:'absolute',left:110,top:790,fontSize:34,lineHeight:1.65,color:'#617174'}}>Tesla · Roadster Event · 2026-10-15<br/>NASA · 牛顿定律、推力与力矩<br/>三维原理示意 · 算例不代表实车参数</div>
 <div style={{position:'absolute',left:1330,top:345,width:338,height:446,background:'#cdd8d2',transform:`rotate(${7+2*p}deg)`,boxShadow:'0 16px 45px #21393a18'}}/>
 <div style={{position:'absolute',left:1245,top:320,width:350,height:458,transform:`perspective(1600px) rotateY(${-9+4*p}deg) rotate(-4deg) translateY(${(1-p)*60}px)`,background:'#fff',overflow:'hidden',boxShadow:'0 20px 48px #21393a28'}}><Img src={staticFile('papers/patent.png')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top'}}/></div>
 <div style={{position:'absolute',left:1150,top:825,width:560,textAlign:'center',fontSize:34,lineHeight:1.5}}>Crook 等 · Tesla · 2025<br/>US 12,377,920 B1<br/>自适应下压力专利</div>
 </div>;}
export function Film(){const frame=useCurrentFrame(),t=frame/30;return <AbsoluteFill style={{fontFamily:'"Noto Sans SC",sans-serif',background:'#f0f0ea',overflow:'hidden'}}><ThreeCanvas width={1920} height={1080} camera={{near:.06,far:200,fov:42}} gl={{antialias:true,alpha:false,preserveDrawingBuffer:true}} shadows><Scene frame={frame}/></ThreeCanvas><AbsoluteFill style={{pointerEvents:'none',background:'linear-gradient(180deg,#f0f0ea12,transparent 31%,transparent 82%,#f0f0ea80)'}}/><Titles t={t}/><svg width={1920} height={1080} style={{position:'absolute',inset:0,pointerEvents:'none'}}>{[0,1].map(i=><g key={i}><line id={'label-line-'+i} strokeWidth={1.8} opacity={0}/><circle id={'label-dot-'+i} r={5} opacity={0}/></g>)}</svg>{[0,1].map(i=><div key={i} id={'world-label-'+i} style={{position:'absolute',opacity:0,fontSize:38,fontWeight:600,padding:'7px 14px',background:'#fafaf1e8',borderRadius:6,whiteSpace:'nowrap',boxShadow:'0 4px 22px #2433350a'}}/>)}<Mechanism t={t}/>{['thrust','roll','control'].includes(getSection(t).id)&&<div style={{position:'absolute',right:83,bottom:170,fontSize:32,color:'#718083'}}>慢动作原理示意</div>}<Evidence t={t}/><Brand/><Caption frame={frame}/><div style={{position:'absolute',right:65,top:60,color:'#6c7a7d',fontSize:30,fontWeight:500,letterSpacing:1}}>每天5分钟科普 · 车辆力学</div></AbsoluteFill>;}
