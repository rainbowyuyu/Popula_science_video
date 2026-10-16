import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Img,cancelRender,continueRender,delayRender,staticFile,useCurrentFrame} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {World} from './World';
import {cueAt,ease,getSection,section,timeline} from './Timeline';
import captions from './captions-data.json';
const INK='#22353a',BLUE='#21838c',ORANGE='#c76840';
let fonts:Promise<void>|undefined;
const readyFonts=()=>fonts??=(async()=>{const f=new FontFace('Noto Sans SC',`url(${staticFile('fonts/NotoSansSC.woff2')})`,{weight:'100 900'});await f.load();document.fonts.add(f);await document.fonts.ready;})();
function syncLabels(w:World,t:number){
 const id=cueAt(t)?.id??'',s=getSection(t);let labels:Array<[string,string,string]>=[];
 if(['s05','s06'].includes(id))labels=[['fan','抽气风扇',BLUE],['pressure','低压区',BLUE]];
 if(['s08','s09','s10','s11'].includes(id))labels=[['weight','重力 ↓',ORANGE],['lift','压差力',BLUE]];
 if(['s15','s16','s17'].includes(id))labels=[['thrust',id==='s17'?'喷气停止':'气体喷出',BLUE],['weight','重力 ↓',ORANGE]];
 if(['s19','s20','s21','s22'].includes(id))labels=[['car','重心',ORANGE]];
 if(id==='s25'||id==='s26')labels=[['tank','储气罐',BLUE]];
 for(let i=0;i<2;i++){const el=document.getElementById('world-label-'+i);if(!el)continue;const row=labels[i];if(!row){el.style.opacity='0';continue;}const a=w.projectAnchor(row[0]);const x=(a.x+1)*960,y=(1-a.y)*540;
 el.textContent=row[1];el.style.color=row[2];el.style.borderColor=row[2];el.style.left=`${Math.min(1580,Math.max(110,x+(i?34:-155)))}px`;el.style.top=`${Math.min(820,Math.max(338,y+(i?34:-82)))}px`;el.style.opacity=a.visible?String(ease((t-(cueAt(t)?.startSec??s.start))/.5)): '0';}
}
function Scene({frame}:{frame:number}){
 const {scene,camera,gl}=useThree();const ref=useRef<World|null>(null),current=useRef(frame);current.current=frame;
 const [handle]=useState(()=>delayRender('Roadster studio and fonts',{timeoutInMilliseconds:120000}));
 useLayoutEffect(()=>{let alive=true;let w:World|undefined;readyFonts().then(()=>{if(!alive)return;w=new World(scene,camera as T.PerspectiveCamera,gl);ref.current=w;w.update(current.current/30);syncLabels(w,current.current/30);gl.render(scene,camera);continueRender(handle);}).catch(cancelRender);return()=>{alive=false;w?.dispose();ref.current=null;};},[scene,camera,gl,handle]);
 useLayoutEffect(()=>{if(ref.current){ref.current.update(frame/30);syncLabels(ref.current,frame/30);gl.render(scene,camera);}},[frame,gl,scene,camera]);return null;
}
function Brand(){return <div style={{position:'absolute',left:62,top:42,display:'flex',alignItems:'center',gap:16,color:INK,fontSize:37,fontWeight:700}}><Img src={staticFile('brand/logo.png')} style={{height:76,width:64,objectFit:'contain'}}/>rainbow鱼</div>;}
const sectionTitles:Record<string,[string,string]>={
 hook:['倒挂不掉，还能空中翻滚？','Roadster · 从力的方向看懂它'],suction:['把空气抽走，车就贴紧了','裙边限制漏气 · 风扇维持压差'],ceiling:['车翻了，重力没有翻','压差力朝向轨道 · 重力始终朝下'],release:['离开路面，吸盘就失效了','从贴住表面，到主动喷气'],thrust:['气往下喷，车向上受力','储气罐 → 阀门 → 喷嘴'],roll:['推力偏离重心，车就转起来','合力改变移动 · 力矩改变转动'],control:['先转起来，再刹住转动','测量姿态 → 调节喷气 → 再测量'],limits:['每一次喷气，都在消耗储气','压力、能量与安全余量'],recap:['沿着空气，找到力的方向','压差贴住 · 推力离地 · 力矩转身']};
function Titles({t}:{t:number}){const s=getSection(t);if(s.id==='coda')return null;const title=sectionTitles[s.id]??sectionTitles.hook;const a=ease((t-s.start)/.85),b=ease((s.end-t)/.65);
 return <div style={{position:'absolute',left:96,right:96,top:155,textAlign:'center',color:INK,opacity:a*b,transform:`translateY(${(1-a)*16}px)`}}><div style={{fontSize:s.id==='hook'?83:70,fontWeight:800,letterSpacing:-2,lineHeight:1.2}}>{title[0]}</div><div style={{fontSize:36,fontWeight:500,marginTop:20,color:'#5f7379',letterSpacing:2}}>{title[1]}</div></div>;}
function Mechanism({t}:{t:number}){const c=cueAt(t),s=getSection(t);if(!c)return null;const a=ease((t-c.startSec)/.7);let main='',sub='';
 if(c.id==='s09'){main='F压差 ＞ mg';sub='多出来的力，把轮胎压紧';}
 if(c.id==='s10'||c.id==='s11'){main='Δp × A ≈ mg';sub='假设算例：1500 kg · 3 m² → 约 4.9 kPa';}
 if(c.id==='s16'){
  const hover=captions.cues.find(x=>x.id==='s16-3')!.startFrame/30;
  const jump=captions.cues.find(x=>x.id==='s16-5')!.startFrame/30;
  if(t<hover){main='推力 ＞ 重力';sub='向上加速';}
  else if(t<jump){main='推力 ＝ 重力';sub='速度接近零，才能悬停';}
  else{main='腾空 ≠ 持续悬停';sub='向上速度会被重力逐渐减小';}
 }
 if(c.id==='s17'){main='重力一直在';sub='没有持续推力，最终仍会下落';}
 if(c.id==='s19'||c.id==='s20'){main='τ = r × F';sub='力臂与方向，决定怎样转';}
 if(c.id==='s22'){main='加速旋转 → 反向刹转';sub='两次不同方向的力矩';}
 if(c.id==='s23'||(c.id==='s24'&&t<c.startSec+2.8)){main='方向回顾 · 姿态示意';sub='喷嘴跟着车身转，重力方向不变';}
 if(c.id==='s25'){main='储气有限，不能一直喷';sub='定性示意 · 不代表实车罐容';}
 if(!main)return null;
 return <div style={{position:'absolute',left:110,bottom:174,color:INK,opacity:a,transform:`translateX(${(1-a)*-30}px)`,borderLeft:`5px solid ${s.id==='roll'||s.id==='control'?ORANGE:BLUE}`,paddingLeft:24,textShadow:'0 2px 15px #f4f4efff'}}><div style={{fontSize:56,fontWeight:750,letterSpacing:1}}>{main}</div><div style={{fontSize:35,marginTop:9,fontWeight:500}}>{sub}</div></div>;
}
function Caption({frame}:{frame:number}){const c=captions.cues.find(c=>frame>=c.startFrame&&frame<c.endFrame);return c?<div style={{position:'absolute',bottom:42,left:90,right:90,textAlign:'center',fontSize:48,fontWeight:600,color:INK,lineHeight:1.35}}><span style={{padding:'9px 24px',background:'#fcfcf8ed',borderRadius:10,boxShadow:'0 4px 20px #29484b08'}}>{c.text.replace(/^[，。；：！？]+|[，。；：]$/g,'')}</span></div>:null;}
function Evidence({t}:{t:number}){const s=section('coda'),p=ease((t-s.start)/1.2);if(t<s.start)return null;return <div style={{position:'absolute',inset:0,background:'#edf0eb',transform:`translateX(${(1-p)*1960}px)`,color:INK}}>
 <div style={{position:'absolute',left:110,top:190,fontSize:76,fontWeight:800}}>从演示，回到可核对的原理</div>
 <div style={{position:'absolute',left:110,top:380,fontSize:43,lineHeight:2.05}}>{[['压差力','pressure'],['平动','translation'],['转动','torque']].map(([label,name])=><div key={name} style={{display:'flex',alignItems:'center',gap:35,height:100}}><span style={{width:150}}>{label}</span><Img src={staticFile('formulas/'+name+'.png')} style={{height:74,objectFit:'contain'}}/></div>)}</div>
 <div style={{position:'absolute',left:110,top:780,fontSize:33,lineHeight:1.7,color:'#536a70'}}>现象：Tesla · Roadster Event · 2026-10-15<br/>原理：NASA · 牛顿定律、推力与力矩<br/>三维原理示意与假设算例，不代表实车测试数据</div>
 <div style={{position:'absolute',left:1290,top:340,width:360,height:470,background:'#d7ded8',transform:'rotate(8deg)',boxShadow:'0 18px 40px #21393a17'}}/>
 <div style={{position:'absolute',left:1215,top:310,width:375,height:490,transform:`perspective(1600px) rotateY(-7deg) rotate(-4deg)`,background:'#fff',overflow:'hidden',boxShadow:'0 15px 45px #21393a27'}}><Img src={staticFile('papers/patent.png')} style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:'top'}}/></div>
 <div style={{position:'absolute',left:1155,top:848,width:520,textAlign:'center',fontSize:32,lineHeight:1.5}}>Crook 等 · Tesla · 2025<br/>US 12,377,920 B1 · 下压力专利</div>
 </div>;}
export function Film(){const frame=useCurrentFrame(),t=frame/30;return <AbsoluteFill style={{fontFamily:'"Noto Sans SC","Microsoft YaHei",sans-serif',background:'#eff1ed',overflow:'hidden'}}><ThreeCanvas width={1920} height={1080} camera={{near:.06,far:200,fov:42}} gl={{antialias:true,alpha:false,preserveDrawingBuffer:true}} shadows><Scene frame={frame}/></ThreeCanvas><AbsoluteFill style={{pointerEvents:'none',background:'linear-gradient(180deg,#eff1ed24,transparent 31%,transparent 82%,#eff1ed80)'}}/><Titles t={t}/>{[0,1].map(i=><div key={i} id={'world-label-'+i} style={{position:'absolute',opacity:0,fontSize:36,fontWeight:650,borderLeft:'3px solid',padding:'7px 14px',background:'#f8faf3d9',borderRadius:4,whiteSpace:'nowrap'}}/>)}<Mechanism t={t}/>{['thrust','roll','control'].includes(getSection(t).id)&&<div style={{position:'absolute',right:80,bottom:160,fontSize:32,color:'#667b80'}}>慢动作原理示意</div>}<Evidence t={t}/><Brand/><Caption frame={frame}/><div style={{position:'absolute',right:62,top:62,color:'#647b80',fontSize:29,fontWeight:550}}>每天5分钟科普 · 车辆力学</div></AbsoluteFill>;}
