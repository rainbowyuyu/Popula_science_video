import React from 'react';
export type FilmPhaseV16='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
export const smoothV16=(x:number)=>{const q=Math.max(0,Math.min(1,x));return q*q*q*(q*(6*q-15)+10)};
// Readability follows the actual bright paper, not a phase name. Keep the
// change continuous while the same model returns from its blueprint.
export const paperToneV16=(time:number)=>smoothV16((time-16.62)/.12)*(1-smoothV16((time-18.38)/.12));
export const blendInkV16=(weight:number)=>`rgb(${[247,241,223].map((v,i)=>Math.round(v+([17,52,64][i]-v)*weight)).join(',')})`;
const copy:Record<FilmPhaseV16,[string,string]>={
 hero:['AI Engineer','让工程，接得起来'],brief:['需求变，任务跟着走','同一份上下文 · 接力每一步'],
 topology:['模型接力，工具协同',''],physics:['把响应带回设计','Zwind · 运动与系泊'],
 interaction:['读懂失败，接着迭代','保留问题，安排下一步'],toolchain:['工程判断，由你掌握','你的修改，进入后续任务'],
 proof:['交付方案，也交付依据','模型 · 输入 · 日志 · 报告'],close:['AI Engineer','让智能连接工具，让计算提供依据'],
};
/** Type has one quiet ocean-surface drift, a reflected underside and a large
 * stable reading zone. Motion is absolute-time based, never CSS animation. */
export function OceanTypographyV16({frame,phase,localSeconds,durationSeconds,underwater,anchor}:{
 frame:number;phase:FilmPhaseV16;localSeconds:number;durationSeconds:number;underwater:number;
 anchor?:{x:number;y:number;visible:boolean};
}){
 const hero=phase==='hero',close=phase==='close',time=frame/60;
 const enter=smoothV16(localSeconds/.95),exit=close?0:smoothV16((localSeconds-durationSeconds+.95)/.95);
 const ax=anchor?.visible?Math.max(-1,Math.min(1,(anchor.x-1350)/600))*12:0;
 const ay=anchor?.visible?Math.max(-1,Math.min(1,(anchor.y-550)/600))*8:0;
 const x=112+ax-1080*(1-enter)-1120*exit,y=(hero?495:close?265:165)+ay+2.4*Math.sin(time*.64);
 const brightSurface=smoothV16((time-44.35)/.5)*(1-smoothV16((time-49.15)/.6));
 const inkWeight=Math.max(paperToneV16(time),brightSurface);
 const colour=blendInkV16(inkWeight);
 const reflection='#99c4bf';
 const main=copy[phase][0],sub=copy[phase][1];
 const titleSize=close||hero?104:68;
 const material:React.CSSProperties={color:colour,textShadow:`0 2px 5px rgba(5,27,38,${.72*(1-inkWeight)}),0 0 18px rgba(5,27,38,${.24*(1-inkWeight)}),0 1px 3px rgba(250,251,245,${.3*inkWeight})`};
 return <div data-qa="ocean-title" style={{position:'absolute',zIndex:40,left:x,top:y,width:855,pointerEvents:'none',transform:`perspective(1700px) rotateX(${hero||close?14:5}deg) rotateZ(${.17*Math.sin(time*.45)}deg)`,transformOrigin:'left center',...material}}>
  <div style={{fontSize:hero?33:28,fontWeight:600,letterSpacing:hero?5:3,marginBottom:18,color:'#ead0a5',height:40,opacity:hero||close?1:1-smoothV16((localSeconds-2.7)/.6)}}>{hero?'从需求，到工程方案':close?'AI ENGINEER · RELEASE':'AI Engineer'}</div>
  <div style={{position:'relative',fontSize:titleSize,fontWeight:760,letterSpacing:close?-3:-1.8,lineHeight:1.22,whiteSpace:'nowrap'}}>{main}
   {(hero||close)&&<div aria-hidden style={{position:'absolute',inset:0,transform:'translateY(102%) scaleY(-.55)',transformOrigin:'center top',color:reflection,opacity:.09,filter:'blur(2.5px)',maskImage:'linear-gradient(to bottom,black,transparent 82%)',WebkitMaskImage:'linear-gradient(to bottom,black,transparent 82%)'}}>{main}</div>}
  </div>
  {sub&&<div style={{fontSize:hero?55:close?34:32,fontWeight:hero?620:500,letterSpacing:hero?0:.7,lineHeight:1.4,marginTop:hero?20:24,whiteSpace:'nowrap',opacity:.85}}>{sub}</div>}
  <svg width="690" height="15" viewBox="0 0 690 15" style={{display:'block',marginTop:22,opacity:.25}}><defs><linearGradient id="v16-water-rule"><stop stopColor={colour}/><stop offset="1" stopColor={colour} stopOpacity="0"/></linearGradient></defs><path d={`M0 8 Q170 ${5+2*Math.sin(time)} 320 8 T690 8`} fill="none" stroke="url(#v16-water-rule)" strokeWidth="1.5"/></svg>
 </div>;
}
