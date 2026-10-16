import React from 'react';
import {FrameState, timeline, clamp, ease} from './Timeline';

const INK = '#253f42';
const PAPER = '#f4f8f6';
type Projected = {x:number;y:number;text:string;color:string;visible:boolean};
type Props = {state:FrameState;projected?:Projected;realityStrength:number};
const between = (x:number,a:number,b:number) => Math.max(a,Math.min(b,x));
const clipStart = (id:string,fallback:number) => timeline.clips.find(c=>c.id===id)?.start??fallback;
const clipEnd = (id:string,fallback:number) => timeline.clips.find(c=>c.id===id)?.end??fallback;
const inverseEase=(value:number)=>{
  let lo=0,hi=1;
  for(let i=0;i<36;i++){const mid=(lo+hi)*.5;if(ease(mid)<value)lo=mid;else hi=mid;}
  return (lo+hi)*.5;
};
const EASE_TENTH=inverseEase(.1),EASE_SEVEN_TENTHS=inverseEase(.7);

/** Mirrors WorldV09's optical close-up envelope, including the glass insert. */
export function microStrengthV09(frame:number){
  const drop=timeline.scenes.find(s=>s.id==='drop')?.start??1018;
  const primary=ease((frame-drop+45)/100)*(1-ease((frame-clipStart('r019',4045))/150));
  const secondary=ease((frame-clipStart('r034',7704))/85)*(1-ease((frame-clipStart('r035',7938))/95));
  return Math.max(primary,secondary);
}

/** Fixed typography, but not fixed screen placement. All placement and motion
 * are pure frame functions, including when Remotion seeks out of order. */
export function captionLinesV09(text:string):string[] {
  if(text.length<=20)return [text];
  const middle=Math.ceil(text.length/2);
  const cuts=[...text].flatMap((c,i)=>/[，。；：、!?！？]/.test(c)?[i+1]:[])
    .filter(n=>n>=Math.max(7,text.length-20)&&n<=20);
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
  '背对太阳，看向水雾':'背对太阳，看水雾',
  '两道虹之间的暗带':'两虹之间的暗带',
};

/** Semantic entries fade on the narration beat rather than popping as the
 * optical world's anchor changes. The projected point still owns placement. */
export function labelEnvelope(state:FrameState,text:string){
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
    a=clipStart('r027',a)+116;
    // The world changes this anchor when its 18m lift descends below 16.2m.
    // Complete the text's exit before that threshold, rather than letting a
    // nearly opaque label be replaced by the ground-occlusion annotation.
    const fallBegin=clipEnd('r028',b)-120;
    b=Math.min(clipEnd('r028',b)-60,fallBegin+Math.max(120,state.sceneEnd+55-fallBegin)*EASE_TENTH);
  }else if(text==='地面遮住了下半圈'){
    const roundA=clipStart('r027',b)+116,roundB=clipEnd('r028',b)-60;
    if(frame<roundA)b=roundA;else a=roundB;
  }else if(text==='多一次反射'){
    a=clipStart('r034',a)+30;
    // WorldV09 switches to the landscape anchor once the 95-frame optical
    // close-up falls below .3. Finish the label at the same smooth threshold.
    b=clipStart('r035',b)+95*EASE_SEVEN_TENTHS;
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

export function labelLayoutV09(state:FrameState,p:Projected){
  const text=TITLES[p.text]??p.text,numeric=/^约(42|51)°$/.test(text);
  const macroSecondary=state.scene==='secondary'&&microStrengthV09(state.frame)<.3;
  const right=['reflection','angle','observer'].includes(state.scene)
    ||p.text==='光在水里转弯'||p.text==='同一个方向'||state.scene==='secondary';
  const lines=text.includes('，')?text.split('，'):text.length>8?
    [text.slice(0,Math.ceil(text.length/2)),text.slice(Math.ceil(text.length/2))]:[text];
  const maxChars=Math.max(...lines.map(s=>s.length));
  const width=numeric?300:Math.max(256,Math.min(576,maxChars*64+8));
  const height=numeric?120:lines.length*80;
  // The image has one clear subject and one quiet margin. Labels gently
  // track the projected anchor within that margin; they never swap sides.
  const nudgeX=between((p.x-960)*.025,-14,14),nudgeY=between((p.y-480)*.06,-18,18);
  let x=right?1802-width:150,y=290;
  // The incoming white ray occupies the upper-left horizontal. Put the
  // explanatory label below it so the physical beam never crosses a glyph.
  if(state.scene==='dispersion'){
    const close=ease((state.frame-clipStart('r010',2118)+40)/110)
      *(1-ease((state.frame-clipStart('r012',2591)-10)/130));
    y=336+328*close;
  }
  if(state.scene==='reflection')y=426;
  if(state.scene==='drop'&&p.text==='光进水滴')y=600;
  if(state.scene==='angle')y=numeric?555:660;
  if(p.text==='光在水里转弯')y=306;
  if(state.scene==='cone'){
    if(p.text==='同一个方向'){x=1802-width;y=235;}
    else{x=150;y=660;}
  }
  if(state.scene==='circle')y=256;
  if(state.scene==='observer')y=652;
  if(state.scene==='secondary')y=macroSecondary?(numeric?230:754):560;
  if(state.scene==='return')y=318;
  x=between(x+nudgeX,112,1808-width);y=between(y+nudgeY,218,866-height);
  const textEdge=right?x:x+width;
  const leaderEnd={x:textEdge+(right?-20:20),y:y+height*.52};
  const elbow={x:leaderEnd.x+(right?-28:28),y:leaderEnd.y};
  return {text,lines,numeric,right,width,height,x,y,leaderEnd,elbow};
}

function Annotation({state,projected:p,realityStrength}:Props){
  if(!p?.visible||state.scene==='references'||state.frame<370
    ||(state.scene==='return'&&state.clip?.id==='r041'))return null;
  const layout=labelLayoutV09(state,p),envelope=labelEnvelope(state,p.text);
  const edge= Math.min(p.x-12,1908-p.x,p.y-18,914-p.y);
  const brandGap=Math.max(p.x-455,p.y-166);
  const opacity=envelope.opacity*(1-ease(realityStrength/.75))*ease(edge/64)*ease(brandGap/48);
  const micro=microStrengthV09(state.frame);
  const lightText=micro>.3||layout.y>550;
  const accent=layout.numeric?blend(p.color,layout.text==='约51°'?'#c6b8ff':'#ffad89',micro):lightText?'#f3f9f8':INK;
  const distance=Math.hypot(layout.leaderEnd.x-p.x,layout.leaderEnd.y-p.y);
  const showLeader=distance>35&&distance<430&&(micro>.3||state.scene==='observer');
  const shift=(1-envelope.draw)*(layout.right?14:-14);
  const angle=layout.text.match(/^约(42|51)°$/)?.[1];
  return <div style={{position:'absolute',inset:0,zIndex:20,pointerEvents:'none',opacity,fontFamily:'RainbowSans,sans-serif'}}>
    {showLeader&&<svg width={1920} height={1080} style={{position:'absolute',inset:0}}>
      <path d={`M${p.x.toFixed(2)} ${p.y.toFixed(2)} L${layout.elbow.x.toFixed(2)} ${layout.elbow.y.toFixed(2)} L${layout.leaderEnd.x.toFixed(2)} ${layout.leaderEnd.y.toFixed(2)}`}
        fill="none" stroke={accent} strokeOpacity={.34} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} strokeDasharray={1} strokeDashoffset={1-envelope.draw}/>
      <circle cx={p.x} cy={p.y} r={3.5} fill={accent} opacity={envelope.draw}/>
      <circle cx={p.x} cy={p.y} r={7} fill="none" stroke={accent} strokeWidth={1} opacity={envelope.draw*.3}/>
    </svg>}
    <div style={{position:'absolute',left:layout.x,top:layout.y,width:layout.width,height:layout.height,
      transform:`translateX(${shift}px)`,opacity:envelope.draw,textAlign:layout.right?'left':'right',
      color:accent,fontWeight:650,lineHeight:1.26,fontSize:64,letterSpacing:-.7,
      textShadow:lightText?'0 2px 5px rgba(4,24,29,.78),0 0 20px rgba(4,24,29,.3)':`0 1px 8px ${PAPER},0 0 22px ${PAPER}`}}>
      {angle?<div style={{display:'flex',alignItems:'baseline',justifyContent:layout.right?'flex-start':'flex-end',gap:8,whiteSpace:'nowrap'}}>
        <span style={{fontSize:42,fontWeight:550}}>约</span><span style={{fontSize:112,fontWeight:680,letterSpacing:-5,fontVariantNumeric:'tabular-nums'}}>{angle}</span><span style={{fontSize:64,fontWeight:550}}>°</span>
      </div>:layout.lines.map((line,i)=><React.Fragment key={line}>{i>0&&<br/>}{line}</React.Fragment>)}
    </div>
  </div>;
}

function Subtitles({state,realityStrength}:Props){
  const caption=timeline.captions.find(c=>state.frame>=c.start&&state.frame<c.end);
  if(!caption)return null;
  const lines=captionLinesV09(caption.text),fadeIn=ease((state.frame-caption.start+1)/4);
  // The new photographic valley and its wet foreground contain both light
  // and dark patches. Constant white captions with a soft local shadow stay
  // readable as the camera crosses them, without a boxed subtitle card.
  const textColor='#ffffff';
  return <div style={{position:'absolute',left:420,bottom:50,width:1080,zIndex:42,pointerEvents:'none',
    textAlign:'center',fontFamily:'RainbowSans,sans-serif',opacity:fadeIn}}>
    <div style={{position:'absolute',inset:'-30px -50px -18px',background:'radial-gradient(ellipse,rgba(10,30,35,.44),rgba(10,30,35,.20) 38%,transparent 72%)',pointerEvents:'none'}}/>
    <div style={{position:'relative',fontSize:48,fontWeight:570,lineHeight:1.29,letterSpacing:0,color:textColor,
      textShadow:'0 2px 4px rgba(5,20,25,.78),0 0 16px rgba(5,20,25,.30)',
      transform:`translateY(${(1-fadeIn)*3}px)`}}>
      {lines.map((line,i)=><React.Fragment key={`${caption.start}-${i}`}>{i>0&&<br/>}{line}</React.Fragment>)}
    </div>
  </div>;
}

export function EditorialOverlayV09(props:Props){
  return <><Annotation {...props}/><Subtitles {...props}/></>;
}
