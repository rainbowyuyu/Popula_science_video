import React from 'react';
import {FrameState, timeline, clamp, ease} from './Timeline';

const INK = '#183b45';
const PAPER = '#f4f8f6';
type Projected = {x:number;y:number;text:string;color:string;visible:boolean};
type Props = {state:FrameState;projected?:Projected;realityStrength:number};
const between = (x:number,a:number,b:number) => Math.max(a,Math.min(b,x));
const clipStart = (id:string,fallback:number) => timeline.clips.find(c=>c.id===id)?.start??fallback;
const clipEnd = (id:string,fallback:number) => timeline.clips.find(c=>c.id===id)?.end??fallback;

/** Mirrors WorldV07's optical close-up envelope, including the glass insert. */
export function microStrengthV07(frame:number){
  const drop=timeline.scenes.find(s=>s.id==='drop')?.start??1018;
  const primary=ease((frame-drop+45)/100)*(1-ease((frame-clipStart('r019',4045))/150));
  const secondary=ease((frame-clipStart('r034',7704))/85)*(1-ease((frame-clipStart('r035',7938))/95));
  return Math.max(primary,secondary);
}

/** Fixed typography, but not fixed screen placement. All placement and motion
 * are pure frame functions, including when Remotion seeks out of order. */
export function captionLinesV07(text:string):string[] {
  if(text.length<=14)return [text];
  const middle=Math.ceil(text.length/2);
  const cuts=[...text].flatMap((c,i)=>/[，。；：、!?！？]/.test(c)?[i+1]:[])
    .filter(n=>n>=Math.max(5,text.length-14)&&n<=14);
  const at=cuts.sort((a,b)=>Math.abs(a-middle)-Math.abs(b-middle))[0]??middle;
  return [text.slice(0,at),text.slice(at)];
}

function rgb(hex:string):number[]{
  const h=hex.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
}
function blend(a:string,b:string,t:number){
  const x=rgb(a),y=rgb(b);return `rgb(${x.map((v,i)=>Math.round(v+(y[i]-v)*t)).join(',')})`;
}

const TITLES:Record<string,string>={
  '眼睛是圆锥的顶点':'眼睛是顶点',
  '地面遮住了下半圈':'地面挡住下半圈',
  '两道虹之间的暗带':'两虹之间的暗带',
};

/** Semantic entries fade on the narration beat rather than popping as the
 * optical world's anchor changes. The projected point still owns placement. */
function labelEnvelope(state:FrameState,text:string){
  let a=state.sceneStart+8,b=state.sceneEnd-8;
  const frame=state.frame;
  if(text==='约42°'){
    a=clipStart('r018',a)-10;b=clipStart('r019',b)+45;
  }else if(text==='背对太阳的方向'){
    a=clipStart('r019',a)+45;
  }else if(text==='光在水里转弯'){
    a=clipStart('r007',a)+6;b=clipEnd('r007',b)+20;
  }else if(text==='光进水滴'){
    const cupA=clipStart('r007',b),cupB=clipEnd('r007',b);
    if(frame<cupA+6)b=cupA+6;else a=cupB+20;
  }else if(text==='同一个方向'){
    a=clipStart('r023',a)+25;b=clipEnd('r023',b)+55;
  }else if(text==='眼睛是圆锥的顶点'){
    const nearA=clipStart('r023',b)+25,nearB=clipEnd('r023',b)+55;
    if(frame<nearA)b=nearA;else a=nearB;
  }else if(text==='完整的圆'){
    a=clipStart('r027',a)+116;b=clipEnd('r028',b)-60;
  }else if(text==='地面遮住了下半圈'){
    const roundA=clipStart('r027',b)+116,roundB=clipEnd('r028',b)-60;
    if(frame<roundA)b=roundA;else a=roundB;
  }else if(text==='多一次反射'){
    a=clipStart('r034',a)+30;b=clipStart('r035',b)+68;
  }else if(text==='约51°'){
    // The earlier reveal invites viewers to notice a second bow first. The
    // number appears only when the narration actually names its angle.
    a=clipStart('r035',a)+62;b=clipStart('r037',b);
  }else if(text==='两道虹之间的暗带'){
    a=clipStart('r037',a);
  }
  const enter=ease((frame-a)/22),leave=ease((b-frame)/18);
  return {opacity:enter*leave,draw:ease((frame-a-4)/30)};
}

export function labelLayoutV07(state:FrameState,p:Projected){
  const text=TITLES[p.text]??p.text,numeric=/^约(42|51)°$/.test(text);
  const right=['reflection','angle','secondary','observer'].includes(state.scene)
    ||p.text==='光在水里转弯'||p.text==='同一个方向';
  const maxChars=text.length>8?Math.ceil(text.length/2):text.length;
  const width=numeric?310:Math.max(240,Math.min(570,maxChars*60+14));
  const lines=text.includes('，')?text.split('，'):text.length>8?
    [text.slice(0,Math.ceil(text.length/2)),text.slice(Math.ceil(text.length/2))]:[text];
  const height=numeric?116:lines.length*76;
  // Prefer the model's flank. Clamps are continuous, so a moving anchor never
  // causes a discrete left/right flip or a collision with the brand/captions.
  const x=text==='同一个方向'?1480:text==='两虹之间的暗带'?1260:numeric&&text==='约51°'?between(p.x+150,1460,1804-width):right?between(p.x+102,1260,1804-width):between(p.x-width-102,116,620-width);
  const y=text==='同一个方向'?218:text==='两虹之间的暗带'?760:state.scene==='dispersion'?164+between((p.y-420)*.11,0,64):state.scene==='circle'?
    218+between((p.y-420)*.14,0,104):between(p.y-height*.54,218,824-height);
  const textEdge=right?x:x+width;
  const leaderEnd={x:textEdge+(right?-18:18),y:y+height*.52};
  const elbow={x:leaderEnd.x+(right?-32:32),y:leaderEnd.y};
  return {text,lines,numeric,right,width,height,x,y,leaderEnd,elbow};
}

function Annotation({state,projected:p,realityStrength}:Props){
  if(!p?.visible||state.scene==='references'||state.frame<370
    ||(state.scene==='return'&&state.clip?.id==='r041'))return null;
  const layout=labelLayoutV07(state,p),envelope=labelEnvelope(state,p.text);
  const edge= Math.min(p.x-12,1908-p.x,p.y-18,914-p.y);
  const brandGap=Math.max(p.x-455,p.y-166);
  const opacity=envelope.opacity*(1-ease(realityStrength/.75))*ease(edge/64)*ease(brandGap/48);
  const micro=microStrengthV07(state.frame);
  const accent=layout.numeric?blend(p.color,layout.text==='约51°'?'#c6b8ff':'#ffad89',micro):blend(INK,'#f3f9f8',micro);
  const distance=Math.hypot(layout.leaderEnd.x-p.x,layout.leaderEnd.y-p.y);
  const showLeader=distance>20&&distance<960;
  const shift=(1-envelope.draw)*(layout.right?14:-14);
  const angle=layout.text.match(/^约(42|51)°$/)?.[1];
  return <div style={{position:'absolute',inset:0,zIndex:20,pointerEvents:'none',opacity,fontFamily:'RainbowSans,sans-serif'}}>
    {showLeader&&<svg width={1920} height={1080} style={{position:'absolute',inset:0}}>
      <path d={`M${p.x.toFixed(2)} ${p.y.toFixed(2)} L${layout.elbow.x.toFixed(2)} ${layout.elbow.y.toFixed(2)} L${layout.leaderEnd.x.toFixed(2)} ${layout.leaderEnd.y.toFixed(2)}`}
        fill="none" stroke={accent} strokeOpacity={.42} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} strokeDasharray={1} strokeDashoffset={1-envelope.draw}/>
      <circle cx={p.x} cy={p.y} r={3.5} fill={accent} opacity={envelope.draw}/>
      <circle cx={p.x} cy={p.y} r={7} fill="none" stroke={accent} strokeWidth={1} opacity={envelope.draw*.3}/>
    </svg>}
    <div style={{position:'absolute',left:layout.x,top:layout.y,width:layout.width,height:layout.height,
      transform:`translateX(${shift}px)`,opacity:envelope.draw,textAlign:layout.right?'left':'right',
      color:accent,fontWeight:650,lineHeight:1.26,fontSize:60,letterSpacing:-.7,
      textShadow:`0 1px 8px ${blend(PAPER,'#052e3b',micro)},0 0 22px ${blend(PAPER,'#052e3b',micro)}`}}>
      {angle?<div style={{display:'flex',alignItems:'baseline',justifyContent:layout.right?'flex-start':'flex-end',gap:8,whiteSpace:'nowrap'}}>
        <span style={{fontSize:42,fontWeight:550}}>约</span><span style={{fontSize:108,fontWeight:680,letterSpacing:-5,fontVariantNumeric:'tabular-nums'}}>{angle}</span><span style={{fontSize:64,fontWeight:550}}>°</span>
      </div>:layout.lines.map((line,i)=><React.Fragment key={line}>{i>0&&<br/>}{line}</React.Fragment>)}
    </div>
  </div>;
}

function Subtitles({state,realityStrength}:Props){
  const caption=timeline.captions.find(c=>state.frame>=c.start&&state.frame<c.end);
  if(!caption)return null;
  const lines=captionLinesV07(caption.text),real=ease(Math.max(realityStrength,microStrengthV07(state.frame))),fadeIn=ease((state.frame-caption.start+1)/4);
  const textColor=blend(INK,'#ffffff',real);
  return <div style={{position:'absolute',left:610,bottom:48,width:700,zIndex:42,pointerEvents:'none',
    textAlign:'center',fontFamily:'RainbowSans,sans-serif',opacity:fadeIn}}>
    <div style={{position:'absolute',inset:'-30px -50px -18px',background:`radial-gradient(ellipse,rgba(10,30,35,${real*.65}),rgba(10,30,35,${real*.32}) 38%,transparent 72%)`,pointerEvents:'none'}}/>
    <div style={{position:'relative',fontSize:46,fontWeight:570,lineHeight:1.29,letterSpacing:0,color:textColor,
      textShadow:`0 2px 4px rgba(9,29,35,${real*.6}),0 0 14px rgba(245,250,248,${(1-real)*.92})`,
      transform:`translateY(${(1-fadeIn)*3}px)`}}>
      {lines.map((line,i)=><React.Fragment key={`${caption.start}-${i}`}>{i>0&&<br/>}{line}</React.Fragment>)}
    </div>
  </div>;
}

export function EditorialOverlayV07(props:Props){
  return <><Annotation {...props}/><Subtitles {...props}/></>;
}
