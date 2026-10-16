import React,{useLayoutEffect,useRef,useState} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import captions from './launch-v17-captions.json';
import checklist from '../public/beso-research/web-live/v7/visual-data.json';
import replan from '../public/beso-research/web-live/v7/replan-visual.json';
import {LaunchWorldV17,ContinuousInfoV17} from './beso/LaunchWorldV17';

export const fps=60,durationInFrames=6300;
const ink='#123b46',teal='#277580',muted='#5d777c',copper='#a16b3d',paper='#f4f1e9';
const clamp=(v:number)=>Math.min(1,Math.max(0,v));
const ease=(v:number)=>{v=clamp(v);return v*v*v*(v*(v*6-15)+10)};
const ramp=(t:number,a:number,b:number)=>ease((t-a)/(b-a));
const phases=[0,12,27,42,57,72,88,98,105];
const phaseAt=(t:number)=>Math.min(7,Math.max(0,phases.findLastIndex(a=>t>=a)));

/** Every captured frame waits for its own WebGPU command buffer. */
function World({time,onInfo,blueprint}:{time:number;onInfo:(v:ContinuousInfoV17)=>void;blueprint:boolean}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<LaunchWorldV17|null>(null),queue=useRef<Promise<unknown>>(Promise.resolve());
 const [mount]=useState(()=>delayRender('v17 native ocean initialization'));
 useLayoutEffect(()=>{const w=new LaunchWorldV17(canvas.current!,staticFile(''));world.current=w;queue.current=w.ready.then(()=>continueRender(mount)).catch(cancelRender);return()=>{world.current=null;queue.current.finally(()=>w.dispose());}},[]);
 useLayoutEffect(()=>{const h=delayRender('v17 WebGPU frame '+time),w=world.current;if(!w){continueRender(h);return;}queue.current=queue.current.then(async()=>{await w.ready;await w.render(time,blueprint);onInfo({...w.info});continueRender(h)}).catch(cancelRender);},[time,blueprint]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}

/** Text leaves the frame before unmounting. All animation is absolute-time driven. */
function Track({time,start,end,x=104,y=170,width=740,side='left',role,children}:{time:number;start:number;end:number;x?:number;y?:number;width?:number;side?:'left'|'right';role:string;children:React.ReactNode}){
 if(time<start||time>=end)return null;
 const a=ramp(time,start,start+.85),b=ramp(time,end-.7,end),sign=side==='left'?-1:1;
 const dx=sign*((1-a)*2100+b*2100);
 return <div data-qa={role} style={{position:'absolute',zIndex:24,left:x,top:y,width,transform:`translate3d(${dx}px,${2.5*Math.sin(time*.35)}px,0)`,pointerEvents:'none'}}>{children}</div>;
}
function Eyebrow({children,light=false}:{children:React.ReactNode;light?:boolean}){return <div style={{fontSize:27,fontWeight:600,letterSpacing:2.2,color:light?'#d6e4df':teal,marginBottom:20,display:'flex',alignItems:'center',gap:16}}><span style={{width:34,height:2,background:'currentColor'}}/>{children}</div>}
function Title({children,light=false,size=70}:{children:React.ReactNode;light?:boolean;size?:number}){return <div style={{fontSize:size,lineHeight:1.16,fontWeight:650,letterSpacing:-2.1,color:light?'#fff9ed':ink,whiteSpace:'pre-line',textShadow:light?'0 2px 14px #123d4c55':'0 1px 1px #ffffff55'}}>{children}</div>}
function Note({children,light=false}:{children:React.ReactNode;light?:boolean}){return <div style={{fontSize:29,lineHeight:1.55,color:light?'#e7eee6':muted,marginTop:22,letterSpacing:.5}}>{children}</div>}
function Hairline({width=580,light=false}:{width?:number;light?:boolean}){return <div style={{height:1,width,background:light?'#e2efe74d':'#184c492a',margin:'24px 0'}}/>}

function Hero({t}:{t:number}){return <>
 <Track time={t} start={.2} end={5.9} x={101} y={177} width={900} role="hero-name"><Eyebrow>ENGINEERING, CONNECTED.</Eyebrow><Title size={116}>AI Engineer</Title><div style={{fontSize:32,color:'#fff6e7',textShadow:'0 1px 9px #214955',marginTop:24}}>让工程设计，少一点重复操作。</div></Track>
 <Track time={t} start={5.8} end={11.9} x={110} y={240} width={700} role="hero-value"><Title size={77}>{'把需求\n接到计算。'}</Title><Hairline width={375}/><div style={{fontSize:34,color:ink}}>一个任务，贯穿设计全过程</div></Track>
 </>}

function Demand({t}:{t:number}){
 const updated=t>=20.2,step=checklist.steps[updated?1:0],u=ramp(t,20.2,21.1);
 return <>
 <Track time={t} start={12.1} end={25.0} x={104} y={159} width={730} role="brief-title"><Eyebrow>01 / DEFINE</Eyebrow><Title>{'改一次要求，\n任务跟着走。'}</Title></Track>
 <Track time={t} start={13.4} end={19.0} x={111} y={455} width={680} role="brief-capacity"><div style={{fontSize:136,lineHeight:1,color:'#fff7e9',fontWeight:600,letterSpacing:-6,textShadow:'0 3px 24px #1a3a4b55'}}>20<span style={{fontSize:56,letterSpacing:0,marginLeft:19}}>MW</span></div><Note light>浮式风机 · 减轻浮体，适应新水深</Note></Track>
 <Track time={t} start={18.2} end={25.2} x={108} y={435} width={585} role="real-demand"><div style={{background:'#fafcf9',height:194,overflow:'hidden',borderRadius:8,boxShadow:'0 24px 60px #0c354c27',transform:'perspective(1700px) rotateY(3deg)'}}><Img src={staticFile('beso-research/web-live/v17/demand-composer-vector.svg')} style={{display:'block',width:1722,position:'relative',left:-42-640*ramp(t,19.3,24.1),top:-18}}/></div><div style={{display:'flex',gap:42,marginTop:29,color:'#fff5e6',textShadow:'0 2px 10px #123541'}}><div><div style={{fontSize:25,letterSpacing:1}}>用钢目标 / t·MW⁻¹</div><div style={{fontSize:59,fontWeight:600,marginTop:7}}><span style={{opacity:.55,fontSize:33,marginRight:16}}>{updated?'300 →':''}</span>{step.steelTargetTperMW}</div></div><div style={{width:1,background:'#e5f0ea40'}}/><div><div style={{fontSize:25,letterSpacing:1}}>水深 / m</div><div style={{fontSize:59,fontWeight:600,marginTop:7}}><span style={{opacity:.55,fontSize:33,marginRight:16}}>{updated?'45 →':''}</span>{step.waterDepthM}</div></div></div><div style={{color:'#e9efe8',fontSize:25,marginTop:16,opacity:.8+u*.2}}>真实界面矢量重排 · 保存参数记录</div></Track>
 </>;
}

function Topology({t,info}:{t:number;info?:ContinuousInfoV17}){
 const local=t-27,selected=local<3?0:local<6?1:2;
 return <>
 <Track time={t} start={27.15} end={38.7} side="right" x={1190} y={173} width={635} role="topology-title"><Eyebrow>02 / CONNECT</Eyebrow><Title size={67}>{'文件在工具间\n自动接力。'}</Title>
 <div style={{display:'flex',gap:18,marginTop:35,alignItems:'center'}}>{['几何','网格','BESO'].map((name,i)=><React.Fragment key={name}>{i>0&&<span style={{fontSize:26,color:'#94a4a2'}}>›</span>}<div style={{fontSize:37,fontWeight:600,color:i===selected?teal:'#7b8b89',transform:`translateY(${i===selected?-3:0}px)`}}>{name}</div></React.Fragment>)}</div>
 <div style={{position:'relative',height:2,background:'#3a69662c',width:525,marginTop:23}}><div style={{position:'absolute',left:510*ramp(t,28,35),top:-4,width:10,height:10,borderRadius:10,background:copper,boxShadow:'0 0 14px #c7925680'}}/></div>
 <Note>{local<7?'前一步的输出，就是下一步的输入。':'材料沿着受力路径，逐步留下。'}</Note>
 <Hairline width={520}/><div style={{display:'flex',alignItems:'baseline',gap:16,color:teal}}><span style={{fontSize:77,fontWeight:550,fontVariantNumeric:'tabular-nums',letterSpacing:-2}}>{((info?.fraction??1)*100).toFixed(1)}<span style={{fontSize:39}}>%</span></span><span style={{fontSize:30}}>保留体积</span></div><div style={{fontSize:25,color:muted,marginTop:11}}>独立 BESO 案例 · 第 {info?.iteration??0} 次迭代</div>
 </Track>
 </>;
}

function Physics({t,info}:{t:number;info?:ContinuousInfoV17}){
 if(!info)return null;
 const tension=(info.lineTension/1000).toFixed(0);
 return <>
 <Track time={t} start={42.15} end={55.05} x={105} y={175} width={680} role="physics-title"><Eyebrow>03 / CHECK</Eyebrow><Title>{'少用材料，\n也要看稳不稳。'}</Title><Note light>Zwind · 保存响应回放</Note></Track>
 <Track time={t} start={44.2} end={54.9} x={111} y={505} width={580} role="physics-value"><div style={{fontSize:32,color:'#f1eee0',marginBottom:12,textShadow:'0 2px 9px #153d4b'}}>原算例 1 号缆 · 张力</div><div style={{fontSize:102,lineHeight:1.1,fontWeight:600,color:'#ffe1a9',letterSpacing:-3,textShadow:'0 2px 15px #1d3c4e66',fontVariantNumeric:'tabular-nums'}}>{tension}<span style={{fontSize:38,marginLeft:18,letterSpacing:0}}>kN</span></div><Hairline width={440} light/><div style={{fontSize:30,color:'#f3f1e8',textShadow:'0 2px 8px #163d4a'}}>纵荡 <b>{info.native.surge.toFixed(2)} m</b></div><Note light>原算例数据 / 新构型为示意</Note></Track>
 </>;
}

function Feedback({t}:{t:number}){
 const p=ramp(t,61.5,63.3),stage=t<62.3?0:t<64?1:2;
 return <>
 <Track time={t} start={57.2} end={71.7} x={104} y={170} width={745} role="feedback-title"><Eyebrow>04 / LEARN</Eyebrow><Title>{'失败也能\n成为下一步。'}</Title></Track>
 <Track time={t} start={58.1} end={66.0} x={111} y={410} width={720} role="failure-evidence"><div style={{fontSize:34,color:copper,fontWeight:600}}>求解未收敛</div><div style={{fontSize:29,color:muted,marginTop:17}}>残差停滞</div><div style={{fontSize:63,fontWeight:550,color:ink,marginTop:6}}>1.2 × 10⁻³</div><Hairline width={580}/><div style={{display:'flex',alignItems:'center',gap:26}}><span style={{fontSize:31,color:muted}}>迭代上限</span><span style={{fontSize:56,color:stage===0?ink:'#8e9d9d'}}>{replan.iterationLimitBefore}</span><span style={{fontSize:34,color:teal,transform:`translateX(${p*4}px)`}}>→</span><span style={{fontSize:69,fontWeight:650,color:teal,opacity:p}}>{replan.iterationLimitAfter}</span></div><div style={{marginTop:25,fontSize:34,color:stage===2?teal:muted,fontWeight:550}}>{stage===2?'下一轮已安排 · 等待复查':'读取日志 → 调整任务'}</div><div style={{fontSize:25,color:muted,marginTop:16}}>保存的失败与重规划记录</div></Track>
 </>;
}

function Review({t}:{t:number}){
 const rebuild=t>=78.0;
 return <>
 <Track time={t} start={72.2} end={87.7} side="right" x={1220} y={170} width={610} role="review-title"><Eyebrow>05 / HUMAN IN THE LOOP</Eyebrow><Title size={66}>{'关键判断，\n留给工程师。'}</Title></Track>
 <Track time={t} start={73.5} end={78.0} side="right" x={1225} y={414} width={587} role="review-action"><div style={{fontSize:36,fontWeight:550,color:ink}}>网格之前，工程师介入</div><div style={{marginTop:24,padding:'18px 20px',background:'#f9fbf6c7',borderTop:'1px solid #becbc870',boxShadow:'0 18px 38px #5a767815',borderRadius:8,maxHeight:352,overflow:'hidden'}}><Img src={staticFile('beso-research/web-live/v17/plan-start.png')} style={{width:'100%',display:'block',borderRadius:5,transform:`translateY(${-85*ramp(t,74,77)}px)`}}/></div><div style={{fontSize:25,color:muted,marginTop:14}}>真实执行计划 · 局部放大</div></Track>
 <Track time={t} start={77.7} end={87.8} side="right" x={1225} y={435} width={587} role="invalidate-evidence"><div style={{fontSize:34,color:'#899996',textDecoration:rebuild?'line-through':'none'}}>旧网格　旧载荷</div><div style={{height:70,width:1,background:'#3c7d7944',margin:'24px 0 24px 18px'}}/><div style={{fontSize:48,lineHeight:1.3,color:teal,fontWeight:600,opacity:ramp(t,79.4,80.2),transform:`translateY(${20*(1-ramp(t,79.4,80.2))}px)`}}>跟随新几何<br/>重新生成</div><Note>人的修改，回到同一个任务。</Note></Track>
 </>;
}

function Delivery({t}:{t:number}){return <Track time={t} start={88.2} end={96.9} side="right" x={1230} y={175} width={605} role="delivery"><Eyebrow>06 / DELIVER</Eyebrow><Title size={67}>{'交付方案，\n也交付依据。'}</Title><div style={{marginTop:35}}>{['模型','计算输入','日志','报告'].map((name,i)=>{const a=ramp(t,88.8+i*.65,89.5+i*.65);return <div key={name} style={{display:'flex',alignItems:'center',gap:27,padding:'15px 0',borderBottom:'1px solid #395e6024',transform:`translateX(${(1-a)*740}px)`,fontSize:38,color:ink}}><span style={{width:26,height:32,border:'1.5px solid #6c9894',borderRadius:2,display:'inline-block',position:'relative'}}><span style={{position:'absolute',left:6,right:6,top:12,height:1,background:'#6c9894'}}/><span style={{position:'absolute',left:6,right:6,top:18,height:1,background:'#6c9894'}}/></span>{name}</div>})}</div><Note>每个结果，都找得到来路。</Note></Track>}

function Close({t}:{t:number}){return <Track time={t} start={98.3} end={106} x={104} y={230} width={850} role="closing-title"><Eyebrow>AI ENGINEER</Eyebrow><Title size={85}>{'少忙着接软件。\n多花时间做设计。'}</Title><Hairline width={580}/><div style={{fontSize:33,color:ink}}>需求 → 工具 → 反馈 → 可验证交付</div></Track>}

function Brand(){return <div data-qa="brand" style={{position:'absolute',right:52,top:34,width:310,height:77,zIndex:86,pointerEvents:'none'}}><Img src={staticFile('brand/zju-horizontal-mark.svg')} style={{width:310,height:77,objectFit:'contain',filter:'drop-shadow(0 1px 2px #ffffffb0)'}}/></div>}
function Caption({frame,studio}:{frame:number;studio:number}){
 const ms=frame/fps*1000,c=captions.find(c=>ms>=c.startMs&&ms<c.endMs);if(!c)return null;
 const dark=studio>.7;return <div data-qa="caption" style={{position:'absolute',left:0,bottom:0,width:'100%',height:128,zIndex:90,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0 115px 29px',background:dark?'linear-gradient(transparent,#edf0ea55)':'linear-gradient(transparent,#0c2f3a77)',pointerEvents:'none'}}><span style={{fontSize:42,fontWeight:550,lineHeight:1.35,color:dark?ink:'#fff9ed',textAlign:'center',maxWidth:1630,letterSpacing:.6,textShadow:dark?'0 1px 1px #fff8':'0 2px 6px #0b2c3c,0 0 18px #0b2c3c66'}}>{c.text}</span></div>
}

export const LaunchFilmV17:React.FC<{audio?:boolean;overlay?:boolean;qa?:boolean;blueprint?:boolean}>=({audio=true,overlay=true,qa=false,blueprint=false})=>{
 const frame=useCurrentFrame(),t=frame/fps,[info,setInfo]=useState<ContinuousInfoV17>();
 useLayoutEffect(()=>{if(!qa||!info)return;const canvas=document.querySelector('canvas');if(!canvas)return;const c=canvas.getBoundingClientRect(),scale=1920/c.width;const boxes=Array.from(document.querySelectorAll('[data-qa]')).map(el=>{const r=el.getBoundingClientRect();return{role:el.getAttribute('data-qa'),text:el.textContent?.slice(0,150),x:(r.x-c.x)*scale,y:(r.y-c.y)*scale,width:r.width*scale,height:r.height*scale}});console.log('LAYOUT_QA '+JSON.stringify({frame,scene:phaseAt(t),boxes,camera:info.camera,native:info.native,studioMix:info.studioMix}));},[frame,info,qa]);
 return <AbsoluteFill style={{background:paper,fontFamily:'Microsoft YaHei, Noto Sans CJK SC, sans-serif',overflow:'hidden',color:ink}}><World time={t} onInfo={setInfo} blueprint={blueprint}/>
 {!blueprint&&<AbsoluteFill style={{zIndex:5,pointerEvents:'none',background:'radial-gradient(ellipse at 55% 45%,transparent 45%,rgba(15,52,65,.065) 100%)'}}/>}
 {overlay&&!blueprint&&<><Hero t={t}/><Demand t={t}/><Topology t={t} info={info}/><Physics t={t} info={info}/><Feedback t={t}/><Review t={t}/><Delivery t={t}/><Close t={t}/><Brand/><Caption frame={frame} studio={info?.studioMix??0}/></>}
 {audio&&<Audio src={staticFile('audio/launch-v17-master.wav')}/>}</AbsoluteFill>;
};
