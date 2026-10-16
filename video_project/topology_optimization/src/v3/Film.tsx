import React,{useRef,useLayoutEffect} from 'react';
import {AbsoluteFill,Audio,Img,staticFile,useCurrentFrame} from 'remotion';
import {World,smooth,clamp,State} from './World';
import timeline from './timeline.json';
import {LabPanel} from './LabPanel';
import {BrandLockup} from './Brand';
const ink='#193643',accent='#087f85';
export function stateAt(frame:number):State{
 const idx=Math.max(0,timeline.scenes.findIndex(s=>frame>=s.start&&frame<s.end));const scene=timeline.scenes[idx];
 if(scene.id==='references')return {scene:'return',progress:1,line:4,lineProgress:1,time:frame/30,elapsed:10};
 const clip=timeline.clips.filter(c=>c.scene===scene.id&&c.start<=frame).at(-1)??timeline.clips.find(c=>c.scene===scene.id)!;
 const lp=clamp((frame-clip.start)/clip.duration),l=clip.line;
 const iteration=l===0?50:l===1?Math.round(50*(1-smooth(lp))):l===2?Math.round(50*smooth(lp)):l===3?50:Math.round(50-42*smooth(lp));
 return {scene:scene.id,progress:clamp((frame-scene.start)/(scene.end-scene.start)),line:l,lineProgress:lp,time:frame/30,previous:timeline.scenes[Math.max(0,idx-1)].id,elapsed:(frame-scene.start)/30,...(scene.id==='lab'?{iteration}: {})};
}
export function Stage({state}:{state:State}){
 const canvas=useRef<HTMLCanvasElement>(null),world=useRef<World|null>(null);
 useLayoutEffect(()=>{world.current=new World(canvas.current!);return()=>{world.current?.dispose();world.current=null}},[]);
 useLayoutEffect(()=>{world.current?.render(state)},[state]);
 return <canvas ref={canvas} width={1920} height={1080} style={{position:'absolute',inset:0,width:'100%',height:'100%'}}/>;
}
export function Brand(){return <div style={{position:'absolute',left:64,top:48}}><BrandLockup src={staticFile('v3/logo.png')}/></div>}
function Word({children,left=110,top=325,size=46,style={}}:{children:React.ReactNode;left?:number;top?:number;size?:number;style?:React.CSSProperties}){return <div style={{position:'absolute',left,top,fontSize:size,fontWeight:500,color:ink,lineHeight:1.35,...style}}>{children}</div>}
function Metric({value,label,left=110,top=340}:{value:string;label:string;left?:number;top?:number}){return <div style={{position:'absolute',left,top,color:ink}}><div style={{fontFamily:'Bahnschrift,Arial',fontSize:112,fontWeight:500,letterSpacing:-3}}>{value}</div><div style={{fontSize:40,marginTop:8}}>{label}</div></div>}
const names:Record<string,string>={room:'这么空，\n撑得住？',solid:'同一摞书',strip:'先试试削薄',grid:'换个摆法',load:'哪里值得留？',density:'留多少，\n也能调',penalty:'撒开，不划算',optimize:'形状慢慢出现',lab:'还在变好吗？',compare:'同样多的材料',caveat:'空，\n不等于更强',manufacture:'真装上墙呢？',return:'把材料\n放对地方'};
export const FilmV3=({audio=true}:{audio?:boolean})=>{
 const f=useCurrentFrame(),s=stateAt(f),{scene,progress:p,line:l,lineProgress:lp}=s;
 const captions=(timeline as any).captions??timeline.clips;const sub=captions.find((c:any)=>f>=c.start&&f<c.end);
 const entrance=smooth((s.elapsed??2)/.7);const titleOpacity=scene==='room'?smooth((f-18)/22):1;
 const ending=timeline.scenes.find(s=>s.id==='references');
 if(ending&&f>=ending.start){
  const ep=clamp((f-ending.start)/150), appear=(at:number,dur:number)=>smooth(clamp((ep-at)/dur));
  const formulaRows=[
   {label:'目标',desc:'让同一份材料在受力后更不容易变形',src:'v3/papers/formula-objective.png'},
   {label:'材料插值',desc:'用密度 ρ 把“留 / 删”变成可计算的连续旋钮',src:'v3/papers/formula-simp.png'},
   {label:'约束',desc:'有限元平衡成立，同时把材料预算锁在 35%',src:'v3/papers/formula-constraint.png'},
  ];
  const paper=appear(.18,.38),citation=appear(.52,.26);
  return <AbsoluteFill style={{background:'#e7ecee',fontFamily:'"Microsoft YaHei",sans-serif',color:ink}}>
   <Stage state={s}/><AbsoluteFill style={{background:`rgba(231,236,238,${.80+.12*smooth(ep)})`}}/>
   <Brand/>
   <div style={{position:'absolute',inset:'150px 105px 52px',opacity:smooth(ep),transform:`translateY(${16*(1-smooth(ep))}px)`}}>
    <div style={{display:'flex',alignItems:'baseline',gap:28}}><div style={{fontSize:68,fontWeight:700}}>形状背后的计算</div><div style={{fontSize:28,color:'#087f85',letterSpacing:2}}>METHOD NOTES · 5 s</div></div>
    <div style={{fontSize:31,marginTop:10,color:'#56727b'}}>从一个支架，到三行可以复核的数学。</div>
    <div style={{display:'flex',gap:72,marginTop:42}}>
     <div style={{width:1010}}>
      {formulaRows.map((row,i)=>{const a=appear(.06+i*.12,.32);return <div key={row.label} style={{height:192,marginBottom:18,borderLeft:'5px solid #087f85',padding:'16px 28px 10px 30px',background:'rgba(255,255,255,.64)',borderRadius:'0 16px 16px 0',opacity:a,transform:`translateX(${24*(1-a)}px)`}}><div style={{display:'flex',alignItems:'baseline',gap:18}}><div style={{fontSize:35,fontWeight:700}}>{row.label}</div><div style={{fontSize:25,color:'#607982'}}>{row.desc}</div></div><Img src={staticFile(row.src)} style={{display:'block',height:92,maxWidth:900,objectFit:'contain',objectPosition:'left center',marginTop:10}}/></div>})}
     </div>
     <div style={{width:510,opacity:paper,transform:`translateY(${22*(1-paper)}px) rotate(${1.8*(1-paper)}deg)`}}>
      <div style={{fontSize:26,color:'#087f85',letterSpacing:1,marginBottom:12}}>真实论文页 · 公开存档预印本</div>
      <div style={{background:'#fff',padding:'14px 14px 18px',boxShadow:'0 18px 42px rgba(25,54,67,.18)',transform:'rotate(-1.8deg)'}}><Img src={staticFile('v3/papers/andreassen-2011-page1.png')} style={{width:'100%',height:350,objectFit:'cover',objectPosition:'top center',display:'block'}}/><div style={{fontSize:19,color:'#62777d',marginTop:10}}>首页截取：标题、作者与摘要</div></div>
      <div style={{marginTop:22,padding:'16px 20px',borderTop:'3px solid #af7f50',background:'rgba(255,255,255,.66)',opacity:citation,transform:`translateY(${14*(1-citation)}px)`}}><div style={{fontSize:28,fontWeight:700}}>Andreassen 等 · 2011</div><div style={{fontSize:22,lineHeight:1.35,marginTop:6}}>Efficient topology optimization in MATLAB using 88 lines of code</div><div style={{fontSize:19,color:'#61757c',marginTop:8}}>Structural and Multidisciplinary Optimization · DOI 10.1007/s00158-010-0594-7</div></div>
      <div style={{fontSize:21,color:'#61757c',marginTop:14,opacity:citation*.9}}>另参照：Sigmund · 2001 · 99 line code</div>
     </div>
    </div>
    <div style={{position:'absolute',left:0,right:0,bottom:-2,display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:22,color:'#61757c',opacity:citation}}><span>公式按 LaTeX 排版 · 论文元数据可追溯</span><span>rainbow鱼 · 每天5分钟知识</span></div>
   </div>{audio&&<Audio src={staticFile('v3/master.wav')}/>}
  </AbsoluteFill>;
 }
 const photo=scene==='room'?1-smooth((f-65)/70):0;
 const iter=Math.min(100,Math.floor(p*104/2)*2);const isDeform=['strip','load','compare'].includes(scene);
 return <AbsoluteFill style={{background:'#e7ecee',fontFamily:'"Microsoft YaHei",sans-serif',overflow:'hidden'}}>
 <Stage state={s}/>
 {photo>0&&<Img src={staticFile('v3/room.png')} style={{position:'absolute',inset:0,width:'100%',height:'100%',objectFit:'cover',opacity:photo,transform:`scale(${1+f*.00015})`}}/>}
 <Brand/>
 <div style={{position:'absolute',left:105,top:185,fontSize:scene==='room'||scene==='return'?84:68,fontWeight:700,lineHeight:1.24,color:ink,whiteSpace:'pre-line',letterSpacing:-2,opacity:titleOpacity,transform:`translateY(${(1-entrance)*12}px)`}}>{names[scene]}</div>
 {scene==='solid'&&l>=2&&<Metric value="≈ 10 kg" label="固定位置受力"/>}
 {scene==='strip'&&l>=1&&<Metric value="35%" label="材料留下来"/>}
 {scene==='grid'&&<Metric value={l<3?'3,200':'35%'} label={l<3?'个小格子':'材料预算'}/>}
 {scene==='load'&&l>=3&&<Word top={345}>有限元分析</Word>}
 {scene==='density'&&l>=1&&<div style={{position:'absolute',left:110,top:410}}><svg width="320" height="255" viewBox="0 0 320 255"><path d="M45 170A120 120 0 1 1 275 170" fill="none" stroke="#c4d4d8" strokeWidth="16" strokeLinecap="round"/><path d="M45 170A120 120 0 1 1 275 170" fill="none" stroke={accent} strokeWidth="16" strokeLinecap="round" pathLength="1" strokeDasharray={`${.15+.7*smooth((l-1+lp)/3)} 1`}/><text x="160" y="145" textAnchor="middle" fill={ink} fontSize="76" fontFamily="Bahnschrift">{(.15+.7*smooth((l-1+lp)/3)).toFixed(2)}</text><text x="38" y="232" fill={ink} fontSize="42">空</text><text x="251" y="232" fill={ink} fontSize="42">实</text></svg></div>}
 {scene==='penalty'&&l>=1&&<><Metric value="½" label="材料" left={525} top={285}/><Word left={887} top={330} size={90}>→</Word><Metric value="⅛" label="刚度" left={1230} top={285}/>{l>=4&&<Word top={390} size={66}>SIMP</Word>}</>}
 {scene==='optimize'&&<Metric value={String(iter)} label="轮计算"/>}
 {scene==='lab'&&<div style={{position:'absolute',right:70,top:310,opacity:smooth(((s.elapsed??2)-.7)/.6)}}><LabPanel index={s.iteration??50} playing/></div>}
 {scene==='compare'&&<><Word left={560} top={285}>直接削薄</Word><Word left={1240} top={285}>优化分配</Word>{l>=3&&<><Metric value="0.136" label="毫米" left={490} top={700}/><Metric value="0.019" label="毫米" left={1230} top={700}/></>}{l>=4&&<Word left={755} top={183} size={68}>少弯 86%</Word>}</>}
 {scene==='caveat'&&l>=1&&<Metric value={l===1?'0.0077':'−65%'} label={l===1?'毫米 · 实心板':'材料用量' } top={410}/>}
 {scene==='manufacture'&&<Word top={350} size={48}>{['再走几步','厚度 · 圆角','连接 · 偏载','形状会变','验证 · 试验'][Math.min(4,l)]}</Word>}
 {scene==='return'&&l>=3&&<Word top={425} size={56}>拓扑优化</Word>}
 {isDeform&&<Word left={1420} top={180} size={38}>变形放大 200×</Word>}
 <div style={{position:'absolute',left:115,right:115,bottom:48,display:'flex',justifyContent:'center',alignItems:'center',height:90}}>{sub&&<span style={{fontSize:48,lineHeight:1.3,color:'#fffdf6',background:'#193643f2',borderRadius:14,padding:'14px 30px',maxWidth:1650,textAlign:'center'}}>{sub.text}</span>}</div>
 {audio&&<Audio src={staticFile('v3/master.wav')}/>}
 </AbsoluteFill>
};
