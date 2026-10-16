import React,{useEffect,useLayoutEffect,useRef,useState,useCallback} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame,delayRender,continueRender,cancelRender} from 'remotion';
import {ThreeCanvas} from '@remotion/three';
import {useThree} from '@react-three/fiber';
import * as T from 'three';
import {World} from './World';
import {TYPOGRAPHY} from './Scale';
import {Research} from './Research';
import {C,stateAt,smooth,Timeline,FrameState,Label} from './visual';
import {Evidence,PaperCoda} from './Evidence';
import tlData from './timeline.json';

const timeline=tlData as Timeline;
type Projected={text:string;x:number;y:number;tx:number;ty:number;color:string;opacity:number;right:boolean};
const chapters=[
 {a:1,b:2,kicker:'每天5分钟科普 · GLP-1',title:'诺奖热门背后\n一个吃饭的问题'},
 {a:3,b:5,kicker:'回到一顿晚饭',title:'明明饱了\n怎么还想吃？'},
 {a:6,b:6,kicker:'跟着身体里的消息走',title:'谁在告诉你\n吃够了？'},
 {a:7,b:9,kicker:'01  /  从差异里发现线索',title:'肠道先报个信'},
 {a:10,b:11,kicker:'01  /  口服与静脉的比较',title:'多出来的反应'},
 {a:12,b:13,kicker:'02  /  把镜头逐级推进',title:'找到接收消息的细胞'},
 {a:14,b:15,kicker:'02  /  1987 · 追问活性片段',title:'短一点，结果变了'},
 {a:16,b:18,kicker:'02  /  血糖调节',title:'需要时\n多帮一把'},
 {a:19,b:24,kicker:'03  /  从动物到人体',title:'吃多少，也会改变'},
 {a:25,b:26,kicker:'04  /  从信号到药物',title:'消息来得快\n消失得也快'},
 {a:27,b:31,kicker:'04  /  一步步改造分子',title:'保护，再延长停留'},
 {a:32,b:36,kicker:'05  /  随机对照试验',title:'疗效，到底多大？'},
 {a:37,b:39,kicker:'05  /  心血管结局',title:'获益有多大？'},
 {a:40,b:42,kicker:'05  /  治疗的另一面',title:'还要面对长期管理'},
 {a:43,b:46,kicker:'几十年的研究接力',title:'把问题，一步步问清'},
 {a:47,b:48,kicker:'再回到这顿晚饭',title:'身体的答案\n藏在对话里'},
];

function WorldLayer({frame,onLabels,onDistance}:{frame:number;onLabels:(x:Projected[])=>void;onDistance:(d:number)=>void}){
 const {scene,camera,gl}=useThree();const world=useRef<World|null>(null);const current=useRef(frame);current.current=frame;const [ready,setReady]=useState(false);
 const [handle]=useState(()=>delayRender('Loading real anatomy and GLP-1 receptor',{timeoutInMilliseconds:120000}));
 const render=useCallback((f:number)=>{
  const w=world.current;if(!w)return;const state=stateAt(f,timeline);w.update(state);onDistance(w.cameraPath.sample(f).distance);const output:Projected[]=[];const labels=w.labels(state);
  for(const label of labels){
   if((label.weight??1)<.035)continue;
   const p=label.point.clone().project(camera);if(p.z< -1||p.z>1)continue;const x=(p.x+1)*960,y=(1-p.y)*540;if(x<420||x>1850||y<175||y>900)continue;
   const albuminLabel=label.text.includes('白蛋白');const right=albuminLabel||label.side!=='left';const labelWidth=Array.from(label.text).length*36;let tx=right?Math.min(1830-labelWidth,Math.max(1430,x+155)):Math.max(775,x-260),ty=Math.max(315,Math.min(825,y));
   if(albuminLabel){tx=Math.min(1560,Math.max(1380,x+110));ty=Math.min(825,Math.max(650,y+105));}
   const desired=ty;
   for(const offset of [0,88,-88,176,-176,264,-264]){
    const candidate=desired+offset;
    if(candidate<315||candidate>825)continue;
    if(output.every(previous=>Math.abs(previous.ty-candidate)>=86||Math.abs(previous.tx-tx)>=320)){ty=candidate;break;}
   }
   output.push({text:label.text,x,y,tx,ty,color:label.color??C.teal,opacity:label.weight??1,right});
  }
  onLabels(output);gl.render(scene,camera);
 },[camera,gl,onLabels,onDistance,scene]);
 useLayoutEffect(()=>{
  const w=new World(scene,camera as T.PerspectiveCamera,gl,staticFile(''),timeline);world.current=w;let live=true;
  w.ready.then(()=>{if(!live)return;render(current.current);setReady(true);continueRender(handle)}).catch(cancelRender);
  return()=>{live=false;w.dispose();world.current=null;continueRender(handle)};
 },[scene,camera,gl,handle,render]);
 useLayoutEffect(()=>{if(ready)render(frame)},[frame,ready,render]);return null;
}

function MechanismCaption({s,distance}:{s:FrameState;distance:number}){
 const n=Number(s.clip.id.slice(1));let text='';
 if([14,15,20,21].includes(n))return null;
 if(n===8||n===9)text='光点代表信号\n不表示分子大小';
 if(n>=12&&n<=16)text=distance>.025?'胰腺':distance>.001?'胰腺组织':distance>120e-6?'示意胰岛 · 150 μm':distance>8e-6?'示意 β 细胞 · 15 μm':n===16?'膜融合 · 亚微米细节':distance>150e-9?'继续看细胞膜':'膜上受体 · PDB 5VAI';
 
 if(n>=19&&n<=22)text='迷走神经路径示意\n非个体重建';
 if(n>=25&&n<=31)text='分子改造示意 · 非等比模型';
 return text?<div style={{position:'absolute',left:90,top:n>=25&&n<=26||n===16||n===8||n===9?485:420,fontSize:36,color:'#59716f',maxWidth:560,lineHeight:1.55,whiteSpace:'pre-line'}}>{text}</div>:null;
}

function ScaleBar({distance,s}:{distance:number;s:FrameState}){
 const n=Number(s.clip.id.slice(1));if(n<7||n>24)return null;
 const metresPerPixel=2*distance*Math.tan(17*Math.PI/180)/1080;
 const desired=metresPerPixel*165,power=10**Math.floor(Math.log10(desired));
 const length=[1,2,5,10].map(v=>v*power).reduce((a,b)=>Math.abs(a-desired)<Math.abs(b-desired)?a:b);
 const width=length/metresPerPixel;
 const unit=length>=.1?'m':length>=.01?'cm':length>=1e-3?'mm':length>=1e-6?'μm':'nm';
 const factor={m:1,cm:100,mm:1e3,'μm':1e6,nm:1e9}[unit];
 const value=Number((length*factor).toPrecision(3));
 return <div style={{position:'absolute',right:94,bottom:163,width:Math.max(width,200),textAlign:'right',color:'#567471',fontSize:36,fontWeight:500}}>
  <div style={{marginBottom:12}}>{value} {unit}</div>
  <div style={{height:12,width,marginLeft:'auto',borderBottom:'3px solid #567471',borderLeft:'3px solid #567471',borderRight:'3px solid #567471'}}/>
 </div>;
}

function Discovery({s}:{s:FrameState}){
 const n=Number(s.clip.id.slice(1));if(n!==14&&n!==15)return null;
 const p=smooth(s.clipProgress*5);const source=n===14?'mojsov1987':'drucker1987';
 return <div style={{position:'absolute',left:90,top:525,width:440,transform:`translateX(${-600*(1-p)}px) rotate(-3deg)`,transformOrigin:'bottom left'}}>
  <Img src={staticFile(`papers/${source}_page1.jpg`)} style={{width:330,height:250,objectFit:'cover',objectPosition:'top',boxShadow:'0 12px 35px #4b574022',borderRadius:3}}/>
  <div style={{fontSize:36,marginTop:16,color:C.ink}}>{n===14?'Mojsov 等 · 1987':'Drucker 等 · 1987'}</div>
  <div style={{fontSize:36,marginTop:12,color:'#59716f'}}>{n===14?'离体大鼠胰腺实验':'大鼠胰岛细胞系实验'}</div>
 </div>;
}

function KeyIdea({s}:{s:FrameState}){
 const n=Number(s.clip.id.slice(1));let heading='',value='',note='';
 if(n===16){heading='葡萄糖依赖';value='血糖升高 → 响应增强';note='胰岛素释放 · 机制示意'}
 if(n===25||n===26){heading='天然 GLP-1 的半衰期';value='约 1–2 分钟'}
 if(n===27){heading='保护剪切点';value='换掉易被剪的位置';note='Ala8 → Aib8'}
 if(n===28){heading='延长停留';value='连接脂肪二酸侧链';note='借助白蛋白 · 可逆结合'}
 if(n===29){heading='逐一比较';value='停留时间 × 受体活性';note='链长 · 接点 · 连接臂'}
 if(n===30){heading='司美格鲁肽的设计';value='18 个碳的侧链';note='配合连接臂 · 保留受体作用'}
 if(n===31){heading='人体内的半衰期';value='约 1 周';note='支持每周一次皮下注射'}
 if(!heading)return null;
 return <div style={{position:'absolute',left:90,top:560,width:690}}><div style={{fontSize:36,color:'#637b76',lineHeight:1.4}}>{heading}</div><div style={{fontSize:[16,28,31].includes(n)?46:56,fontWeight:600,lineHeight:1.35,marginTop:18,color:C.teal}}>{value}</div>{note&&<div style={{fontSize:36,lineHeight:1.6,marginTop:22,color:'#637b76'}}>{note}</div>}</div>;
}

function NewsOpening({s}:{s:FrameState}){
 const n=Number(s.clip.id.slice(1));if(n>2)return null;
 const enter=smooth((s.frame-10)/32);
 return <div style={{position:'absolute',left:92,top:510,width:610,color:C.ink,opacity:enter,transform:`translateX(${-45*(1-enter)}px)`}}>
  <div style={{fontSize:36,lineHeight:1.65,color:'#547571'}}>开奖前，被看好的研究方向</div>
  <div style={{fontSize:36,lineHeight:1.6,marginTop:12,fontWeight:600}}>AFP 法新社 · 2026.10.05</div>
 </div>;
}

export function Film({audio=true,clean=false}:{audio?:boolean;clean?:boolean}){
 const frame=useCurrentFrame(),s=stateAt(frame,timeline),n=Number(s.clip.id.slice(1));const [labels,setLabels]=useState<Projected[]>([]);
 const onLabels=useCallback((v:Projected[])=>setLabels(v),[]);
 const [distance,setDistance]=useState(1);const onDistance=useCallback((d:number)=>setDistance(d),[]);
 const chapter=chapters.find(c=>n>=c.a&&n<=c.b)!;const chapterClip=timeline.clips[chapter.a-1];const enter=smooth((frame-chapterClip.start+6)/28);
 const caption=timeline.captions.find(c=>frame>=c.start&&frame<c.end);const coda=frame>=timeline.duration-270;
 const dessertHeadline=smooth((frame-timeline.clips[3].start+35)/55)*(1-smooth((frame-timeline.clips[4].start+20)/70));
 const [fontHandle]=useState(()=>delayRender('Loading episode fonts'));
 useEffect(()=>{Promise.all([new FontFace('Rainbow Sans',`url(${staticFile('fonts/unified.woff2')})`,{weight:'100 900',style:'normal'}).load()]).then(fs=>{for(const font of fs)document.fonts.add(font);continueRender(fontHandle)}).catch(cancelRender)},[fontHandle]);
 return <AbsoluteFill style={{background:C.paper,fontFamily:TYPOGRAPHY.family,color:C.ink}}>
  <ThreeCanvas width={1920} height={1080} dpr={1} gl={{antialias:true,alpha:false,powerPreference:'high-performance'}} camera={{fov:34,near:.0001,far:12}}><WorldLayer frame={frame} onLabels={onLabels} onDistance={onDistance}/></ThreeCanvas>
  {!clean&&<>
   {distance<.40&&!coda&&<div style={{position:'absolute',inset:0,pointerEvents:'none',opacity:1-smooth((distance-.02)/.38),background:'linear-gradient(90deg,rgba(242,238,231,.96) 0%,rgba(242,238,231,.87) 27%,rgba(242,238,231,0) 47%)'}}/>}
   {!coda&&<><div style={{position:'absolute',left:90+850*dessertHeadline,top:190,transform:`translateX(${-45*(1-enter)}px)`,opacity:enter}}>
    <div style={{fontSize:36,letterSpacing:3,color:'#6a827d',marginBottom:18}}>{chapter.kicker}</div>
    <div style={{fontFamily:TYPOGRAPHY.family,fontWeight:650,fontSize:72,lineHeight:1.28,whiteSpace:'pre-line',letterSpacing:1}}>{chapter.title}</div>
   </div><NewsOpening s={s}/><MechanismCaption s={s} distance={distance}/><ScaleBar distance={distance} s={s}/><Research s={s}/>{[14,15].includes(n)&&<div style={{position:'absolute',left:975,top:195,fontSize:36,lineHeight:1.5,color:'#647978'}}>2017 · 受体实测结构<br/>结合与信号响应为示意</div>}<KeyIdea s={s}/><Evidence state={s} timeline={timeline}/></>}
   {!coda&&labels.map((l,i)=><React.Fragment key={i}>
    <svg width={1920} height={1080} style={{position:'absolute',inset:0,opacity:l.opacity,pointerEvents:'none'}}>
     <path d={`M ${l.x} ${l.y} L ${l.tx} ${l.ty} L ${l.tx+(l.right?70:-70)} ${l.ty}`} stroke={l.color} fill="none" strokeWidth={2.1}/>
     <circle cx={l.x} cy={l.y} r={5} fill={l.color}/><circle cx={l.x} cy={l.y} r={10} fill="none" stroke={l.color} strokeOpacity={.3}/>
    </svg><div style={{position:'absolute',left:l.right?l.tx+10:l.tx-10,top:l.ty-54,transform:l.right?undefined:'translateX(-100%)',fontSize:36,fontWeight:500,color:C.ink,whiteSpace:'nowrap',opacity:l.opacity,textShadow:`0 2px 10px ${C.paper}, 0 0 5px ${C.paper}`}}>{l.text}</div>
   </React.Fragment>)}
   <PaperCoda frame={frame} timeline={timeline}/>
   <div style={{position:'absolute',left:64,top:48,display:'flex',alignItems:'center',gap:20,zIndex:30}}><Img src={staticFile('brand/logo.png')} style={{width:76.17,height:90,objectFit:'contain'}}/><span style={{fontSize:44,fontWeight:600,color:C.ink}}>rainbow鱼</span></div>
   {!coda&&caption&&<div style={{position:'absolute',bottom:42,left:110,right:110,textAlign:'center'}}><span style={{fontSize:46,fontWeight:500,lineHeight:1.5,display:'inline-block',padding:'12px 30px',borderRadius:20,background:'rgba(246,243,236,.90)',color:'#253f40',boxShadow:'0 5px 22px #263c3510'}}>{caption.text}</span></div>}
  </>}
  {audio&&<Audio src={staticFile('master.wav')}/>}
 </AbsoluteFill>;
}
