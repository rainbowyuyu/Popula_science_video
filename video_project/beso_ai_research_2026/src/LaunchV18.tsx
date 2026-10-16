import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import captions from './launch-v18-captions.json';
import checklist from '../public/beso-research/web-live/v7/visual-data.json';
import replan from '../public/beso-research/web-live/v7/replan-visual.json';
import response from '../public/beso-research/physics/zwind-response.json';
import {LaunchWorldV18,ContinuousInfoV18} from './beso/LaunchWorldV18';

export const fps=60,durationInFrames=6300;
const ink='#163c43',teal='#196c70',muted='#536c70',amber='#9b612d',paper='#f4f3ed';
const clamp=(v:number)=>Math.min(1,Math.max(0,v));
const ease=(v:number)=>{v=clamp(v);return v*v*v*(v*(v*6-15)+10)};
const ramp=(t:number,a:number,b:number)=>ease((t-a)/(b-a));
const phases=[0,12,27,42,57,72,88,98,105];
const phaseAt=(t:number)=>Math.min(7,Math.max(0,phases.findLastIndex(a=>t>=a)));

function World({time,onInfo,blueprint}:{time:number;onInfo:(v:ContinuousInfoV18)=>void;blueprint:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<LaunchWorldV18|null>(null),queue=useRef<Promise<unknown>>(Promise.resolve());
 const [mount]=useState(()=>delayRender('v18 native ocean initialization'));
 useLayoutEffect(()=>{const w=new LaunchWorldV18(canvas.current!,staticFile(''));world.current=w;queue.current=w.ready.then(()=>continueRender(mount)).catch(cancelRender);return()=>{world.current=null;queue.current.finally(()=>w.dispose());}},[]);
 useLayoutEffect(()=>{const h=delayRender('v18 WebGPU frame '+time),w=world.current;if(!w){continueRender(h);return;}queue.current=queue.current.then(async()=>{await w.ready;await w.render(time,blueprint);onInfo({...w.info});continueRender(h)}).catch(cancelRender);},[time,blueprint]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}

/** A shared editorial rail: short masked reveals, gently moving baseline, no flying text slabs. */
function Rail({t,start,end,x=104,y=174,width=650,role,children}:{t:number;start:number;end:number;x?:number;y?:number;width?:number;role:string;children:React.ReactNode}){
 if(t<start||t>=end)return null;
 const a=ramp(t,start,start+.85),b=ramp(t,end-.6,end);
 return <div data-qa={role} style={{position:'absolute',zIndex:24,left:x,top:y,width,clipPath:`inset(${b*100}% 0 ${Math.max(0,(1-a)*100)}% 0)`,transform:`translate3d(${(1-a)*18-b*12}px,${(1-a)*22-b*28}px,0)`,pointerEvents:'none'}}>{children}</div>;
}
function Title({t,start,lines,light=false}:{t:number;start:number;lines:string[];light?:boolean}){
 return <div style={{color:light?'#fffaf0':ink,fontSize:72,fontWeight:620,lineHeight:1.2,letterSpacing:-2,textShadow:light?'0 2px 12px #123d4c66':undefined}}>{lines.map((line,i)=>{const a=ramp(t,start+i*.12,start+.8+i*.12);return <div key={line} style={{overflow:'hidden',paddingBottom:7}}><div style={{transform:`translateY(${(1-a)*110}%)`}}>{line}</div></div>})}</div>;
}
function Label({children,light=false}:{children:React.ReactNode;light?:boolean}){return <div style={{fontSize:36,lineHeight:1.4,fontWeight:480,color:light?'#f2f5ec':muted}}>{children}</div>}
function Rule({t,start,width=630,light=false}:{t:number;start:number;width?:number;light?:boolean}){return <div style={{width,height:2,background:light?'#eef5ec55':'#254d4c25',margin:'27px 0',transform:`scaleX(${ramp(t,start,start+.9)})`,transformOrigin:'left'}}/>}
function Dot({active=true,color=teal}:{active?:boolean;color?:string}){return <span style={{width:12,height:12,flexShrink:0,borderRadius:12,background:active?color:'transparent',border:`2px solid ${color}`,display:'inline-block'}}/>}
function Surface({children,style={}}:{children:React.ReactNode;style?:React.CSSProperties}){return <div style={{background:'linear-gradient(140deg,#fffef9f7,#eef3eef5)',border:'1px solid #ffffffc9',borderRadius:18,padding:'28px 30px',boxShadow:'0 18px 56px #153f4921, inset 0 1px 0 #ffffff',...style}}>{children}</div>}
function Row({name,value,color=ink}:{name:string;value:React.ReactNode;color?:string}){return <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:15,minHeight:82,borderBottom:'1px solid #2a55531d'}}><span style={{fontSize:36,color:muted}}>{name}</span><span style={{fontSize:44,color,fontWeight:600,fontVariantNumeric:'tabular-nums',whiteSpace:'nowrap'}}>{value}</span></div>}
function Roll({before,after,p}:{before:string;after:string;p:number}){return <span style={{display:'inline-block',height:'1.4em',width:`${Math.max(before.length,after.length)*.65}em`,overflow:'hidden',verticalAlign:'bottom',position:'relative'}}><span style={{display:'block',position:'absolute',inset:0,transform:`translateY(${-p*100}%)`}}>{before}</span><span style={{display:'block',position:'absolute',inset:0,transform:`translateY(${(1-p)*100}%)`}}>{after}</span></span>}

function Hero({t}:{t:number}){return <>
 <Rail t={t} start={.3} end={5.6} width={380} role="hero-opening">
  <Title t={t} start={.3} lines={['AI','Engineer']}/>
  <div style={{fontSize:40,lineHeight:1.55,color:ink,marginTop:30}}>改一个要求，<br/>重接一串软件？</div>
 </Rail>
 <Rail t={t} start={5.65} end={11.75} width={830} role="hero-title">
  <div style={{fontSize:104,lineHeight:1.1,fontWeight:610,color:ink,letterSpacing:-4,marginBottom:34}}>AI Engineer</div>
  <Title t={t} start={5.75} lines={['一个需求，','一条工程工作流。']}/>
  <Rule t={t} start={2.3} width={610}/>
  <div style={{fontSize:40,display:'flex',gap:24,color:ink,alignItems:'center'}}>{['需求','工具','反馈'].map((v,i)=><React.Fragment key={v}>{i>0&&<span style={{color:teal,transform:`scaleX(${ramp(t,3+i*.5,4+i*.5)})`}}>→</span>}<span style={{clipPath:`inset(0 ${(1-ramp(t,2.7+i*.55,3.5+i*.55))*100}% 0 0)`}}>{v}</span></React.Fragment>)}</div>
 </Rail>
 </>}

function Demand({t}:{t:number}){
 const a=ramp(t,20.1,20.85),before=checklist.steps[0],after=checklist.steps[1];
 return <Rail t={t} start={12.15} end={25.2} y={164} width={654} role="demand-workbench">
  <Title t={t} start={12.15} lines={['一句需求，','变成可执行任务。']}/>
  <div style={{marginTop:34,transform:`translateY(${(1-ramp(t,13,14))*24}px)`}}><Surface>
   <div style={{display:'flex',alignItems:'center',gap:15,color:teal,fontSize:36,fontWeight:600,marginBottom:20}}><Dot/>设计任务</div>
   <div style={{fontSize:40,color:ink,lineHeight:1.4,paddingBottom:22,borderBottom:'2px solid #22777b50'}}>更深的海，少用钢。</div>
   <Row name="额定功率" value={<>20 <span style={{fontSize:36}}>MW</span></>}/>
   <Row name="水深" value={<span><Roll before={String(before.waterDepthM)} after={String(after.waterDepthM)} p={a}/><span style={{fontSize:36,marginLeft:12}}>m</span></span>} color={teal}/>
   <Row name="用钢目标" value={<span><Roll before={String(before.steelTargetTperMW)} after={String(after.steelTargetTperMW)} p={a}/><span style={{fontSize:36,marginLeft:12}}>t/MW</span></span>} color={teal}/>
   <div style={{fontSize:36,color:teal,marginTop:20,display:'flex',gap:14,alignItems:'center'}}><Dot/>需求与参数，同步写回</div>
  </Surface></div>
 </Rail>;
}

function Pipeline({t}:{t:number}){
 const p=ramp(t,28.4,34.7),labels=['几何','网格','BESO'];
 return <div style={{marginTop:34,position:'relative'}}>
  <svg width="620" height="250" style={{position:'absolute',left:0,top:0}}><path d="M25 36 V216" fill="none" stroke="#7eaaa54d" strokeWidth="2"/><path d="M25 36 V216" fill="none" stroke={teal} strokeWidth="3" strokeDasharray="180" strokeDashoffset={180*(1-p)}/><circle cx="25" cy={36+180*p} r="8" fill={teal}/></svg>
  {labels.map((name,i)=>{const active=p*2>=i,move=ramp(t,28.2+i*1.4,29+i*1.4);return <div key={name} style={{position:'relative',height:90,display:'flex',alignItems:'center',marginLeft:66,borderBottom:'1px solid #315b5b26',transform:`translateX(${(1-move)*24}px)`}}><span style={{fontSize:44,fontWeight:600,color:active?ink:muted,width:160}}>{name}</span><span style={{fontSize:36,color:active?teal:muted}}>{['建立几何','生成网格','材料优化'][i]}</span></div>})}
 </div>;
}
function Topology({t,info}:{t:number;info?:ContinuousInfoV18}){return <Rail t={t} start={27.15} end={39.9} x={1178} y={170} width={638} role="tool-pipeline">
 <Title t={t} start={27.15} lines={['工具接力，','方案不掉队。']}/><Pipeline t={t}/>
 <div style={{marginTop:28,display:'flex',alignItems:'baseline',gap:18}}><span style={{fontSize:56,color:teal,fontWeight:600,fontVariantNumeric:'tabular-nums'}}>{((info?.fraction??1)*100).toFixed(1)}%</span><Label>保留体积</Label></div>
 <div style={{marginTop:14}}><Label>流程演示 · 独立 BESO 案例</Label></div>
 </Rail>}

const responseSamples=response.records.filter((_,i)=>i%8===0);
const tensionMax=Math.max(...responseSamples.map(r=>r.mooringTensionN[0]));
const tensionPath=responseSamples.map((r,i)=>`${i===0?'M':'L'}${i/(responseSamples.length-1)*558},${98-r.mooringTensionN[0]/tensionMax*88}`).join(' ');
function Physics({t,info}:{t:number;info?:ContinuousInfoV18}){const progress=clamp((info?.native.time??0)/120);return <Rail t={t} start={42.2} end={55.1} y={165} width={654} role="physics-response">
 <Title t={t} start={42.2} lines={['让计算，','回答稳不稳。']} light/>
 <div style={{marginTop:30}}><Surface style={{background:'linear-gradient(145deg,#123843e8,#174957db)',border:'1px solid #eff5ef44',color:'#fff8ea'}}>
  <div style={{fontSize:40,fontWeight:600,marginBottom:14}}>Zwind · 响应回放</div>
  <div style={{fontSize:36,color:'#deebe4'}}>原算例 1 号锚链张力</div>
  <div style={{fontSize:56,fontWeight:600,fontVariantNumeric:'tabular-nums',marginTop:12,color:'#ffe0a3'}}>{((info?.lineTension??0)/1000).toFixed(0)} <span style={{fontSize:36}}>kN</span></div>
  <svg width="570" height="92" viewBox="-6 -12 570 132" preserveAspectRatio="none" style={{display:'block',marginTop:10}}><defs><clipPath id="response-history-v18"><rect x="-6" y="-12" width={6+558*progress} height="132"/></clipPath></defs><path d="M0 100 H558" stroke="#dce9e14f" fill="none"/><path d={tensionPath} stroke="#dce9e125" strokeWidth="2" fill="none"/><path d={tensionPath} stroke="#f5d899" strokeWidth="3" fill="none" clipPath="url(#response-history-v18)"/><circle cx={558*progress} cy={98-(info?.lineTension??0)/tensionMax*88} r="5" fill="#ffe0a3"/></svg>
  <div style={{fontSize:36,lineHeight:1.45,color:'#e6eee6',marginTop:12}}>独立算例 / 构型示意</div>
 </Surface></div>
 </Rail>}

function Feedback({t}:{t:number}){
 const p=ramp(t,63.1,64.2);
 return <Rail t={t} start={57.15} end={71.7} y={168} width={650} role="feedback-workbench">
  <Title t={t} start={57.15} lines={['失败有原因。','下一步有依据。']}/>
  <div style={{marginTop:32,clipPath:`inset(0 0 ${100*ramp(t,65.7,66.5)}% 0)`,transform:`translateY(${-18*ramp(t,65.7,66.5)}px)`}}><Surface>
   <div style={{fontSize:40,color:amber,fontWeight:600,display:'flex',alignItems:'center',gap:15}}><Dot color={amber}/>重规划记录回放</div>
   <Row name="未收敛残差" value="1.2 × 10⁻³"/>
   <div style={{height:2,background:'#25717630',margin:'24px 0',position:'relative'}}><div style={{width:10,height:10,borderRadius:10,background:teal,position:'absolute',top:-4,left:574*ramp(t,60.2,62.2)}}/></div>
   <Label>调整迭代上限</Label>
   <div style={{display:'flex',alignItems:'center',gap:30,marginTop:12,fontSize:56,fontWeight:600,fontVariantNumeric:'tabular-nums'}}><span style={{color:muted}}>{replan.iterationLimitBefore}</span><span style={{color:teal,fontSize:40}}>→</span><span style={{color:teal,clipPath:`inset(${(1-p)*100}% 0 0 0)`,transform:`translateY(${(1-p)*14}px)`}}>{replan.iterationLimitAfter}</span></div>
   <div style={{marginTop:24,paddingTop:20,borderTop:'1px solid #2d686233',color:teal,fontSize:36,fontWeight:550}}>日志 → 调整 → 工程师复查</div>
  </Surface></div>
  <div style={{position:'absolute',top:218,left:0,width:420,fontSize:40,fontWeight:550,lineHeight:1.5,color:teal,clipPath:`inset(${100*ramp(t,68.3,69)}% ${100*(1-ramp(t,66.5,67.2))}% 0 0)`,transform:`translateY(${-20*ramp(t,68.3,69)}px)`}}>下一轮计划<br/>等待工程师复查</div>
 </Rail>;
}

function Review({t}:{t:number}){
 const edit=ramp(t,73.7,74.5),rebuild=ramp(t,77,78.2);
 return <Rail t={t} start={72.15} end={87.7} x={1167} y={170} width={650} role="review-workbench">
  <Title t={t} start={72.15} lines={['你来判断。','版本跟着走。']}/>
  <div style={{marginTop:32}}><Surface>
   <div style={{fontSize:40,color:teal,fontWeight:600,marginBottom:22,display:'flex',gap:15,alignItems:'center'}}><Dot/>工程师修改几何</div>
   <div style={{fontSize:44,fontWeight:600,padding:'12px 0 24px',color:ink,borderBottom:'2px solid #347b7166'}}>几何 <Roll before="v1" after="v2" p={edit}/></div>
   {['网格','载荷'].map(name=><div key={name} style={{height:96,display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #2a55531d',fontSize:36}}><span style={{color:ink}}>{name}</span><span style={{height:52,width:285,position:'relative',overflow:'hidden',display:'inline-block'}}>{['关联几何 v1','旧版本失效','按新版本接续'].map((label,i)=><span key={label} style={{position:'absolute',inset:0,textAlign:'right',color:[muted,amber,teal][i],transform:`translateY(${[-edit*100,(1-edit-rebuild)*100,(1-rebuild)*100][i]}%)`}}>{label}</span>)}</span></div>)}
   <div style={{fontSize:36,color:teal,marginTop:24}}>每次修改，都有来路。</div>
  </Surface></div>
 </Rail>;
}

function Delivery({t}:{t:number}){return <Rail t={t} start={88.15} end={96.05} x={1178} y={168} width={638} role="delivery-evidence">
 <Title t={t} start={88.15} lines={['交付一个方案，','也交付依据。']}/>
 <div style={{marginTop:36}}>{['模型','计算输入','日志与报告'].map((name,i)=>{const a=ramp(t,88.8+i*.5,89.6+i*.5);return <div key={name} style={{display:'flex',alignItems:'center',gap:24,borderBottom:'1px solid #2a555330',height:92,clipPath:`inset(0 ${(1-a)*100}% 0 0)`}}><svg width="34" height="40" viewBox="0 0 34 40"><path d="M3 2H23L31 10V38H3Z M22 2V11H31 M10 21H24 M10 28H24" fill="none" stroke={teal} strokeWidth="2"/></svg><span style={{fontSize:40,color:ink,fontWeight:550}}>{name}</span></div>})}</div>
 <div style={{marginTop:32}}><Label>可复查，也能接着做。</Label></div>
 </Rail>}
function Close({t}:{t:number}){return <Rail t={t} start={98.15} end={106} y={210} width={850} role="closing-title">
 <div style={{fontSize:104,lineHeight:1.1,fontWeight:610,color:ink,letterSpacing:-4,marginBottom:38}}>AI Engineer</div>
 <Title t={t} start={98.3} lines={['让工具协同。','让工程经验积累。']}/>
 <Rule t={t} start={99.2} width={650}/><div style={{fontSize:36,color:ink}}>需求 → 执行 → 反馈 → 复查</div>
 </Rail>}

function Brand(){return <div data-qa="brand" style={{position:'absolute',right:52,top:34,width:310,height:77,zIndex:86,pointerEvents:'none'}}><Img src={staticFile('brand/zju-horizontal-mark.svg')} style={{width:310,height:77,objectFit:'contain',filter:'drop-shadow(0 1px 2px #ffffffc0)'}}/></div>}
function Caption({frame,studio}:{frame:number;studio:number}){
 const ms=frame/fps*1000,c=captions.find(c=>ms>=c.startMs&&ms<c.endMs);if(!c)return null;
 const dark=studio>.7;return <div data-qa="caption" style={{position:'absolute',left:0,bottom:0,width:'100%',height:126,zIndex:90,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 110px 28px',background:dark?'linear-gradient(transparent,#edf0ea99)':'linear-gradient(transparent,#0c2f3a88)',pointerEvents:'none'}}><span style={{fontSize:44,fontWeight:530,lineHeight:1.35,color:dark?ink:'#fff9ed',textAlign:'center',maxWidth:1630,letterSpacing:.5,textShadow:dark?'0 1px 1px #fff8':'0 2px 6px #0b2c3c,0 0 18px #0b2c3c66'}}>{c.text}</span></div>
}

export const LaunchFilmV18:React.FC<{audio?:boolean;overlay?:boolean;qa?:boolean;blueprint?:boolean}>=({audio=true,overlay=true,qa=false,blueprint=false})=>{
 const frame=useCurrentFrame(),t=frame/fps,[info,setInfo]=useState<ContinuousInfoV18>();
 const [fontReady]=useState(()=>delayRender('v18 typeface'));
 useLayoutEffect(()=>{const font=new FontFace('Launch Sans',`url(${staticFile('brand/launch-noto-sans-sc.ttf')})`,{weight:'100 900'});font.load().then(f=>{document.fonts.add(f);continueRender(fontReady)}).catch(cancelRender);},[]);
 useLayoutEffect(()=>{if(!qa||!info)return;const canvas=document.querySelector('canvas');if(!canvas)return;const c=canvas.getBoundingClientRect(),scale=1920/c.width;const boxes=Array.from(document.querySelectorAll('[data-qa]')).map(el=>{const r=el.getBoundingClientRect();return{role:el.getAttribute('data-qa'),text:el.textContent?.slice(0,180),x:(r.x-c.x)*scale,y:(r.y-c.y)*scale,width:r.width*scale,height:r.height*scale}});console.log('LAYOUT_QA '+JSON.stringify({frame,scene:phaseAt(t),boxes,camera:info.camera,native:info.native,studioMix:info.studioMix}));},[frame,info,qa]);
 return <AbsoluteFill style={{background:paper,fontFamily:'Launch Sans, Microsoft YaHei, sans-serif',overflow:'hidden',color:ink}}><World time={t} onInfo={setInfo} blueprint={blueprint}/>
 {!blueprint&&<AbsoluteFill style={{zIndex:5,pointerEvents:'none',background:'radial-gradient(ellipse at 55% 45%,transparent 40%,rgba(15,52,65,.055) 100%)'}}/>}
 {overlay&&!blueprint&&<><Hero t={t}/><Demand t={t}/><Topology t={t} info={info}/><Physics t={t} info={info}/><Feedback t={t}/><Review t={t}/><Delivery t={t}/><Close t={t}/><Brand/><Caption frame={frame} studio={info?.studioMix??0}/></>}
 {audio&&<Audio src={staticFile('audio/launch-v18-master.wav')}/>}</AbsoluteFill>;
};
