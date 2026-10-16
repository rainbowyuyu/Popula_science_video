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

/** Mirrors WorldV10's optical close-up envelope, including the glass insert. */
export function microStrengthV10(frame:number){
  const drop=timeline.scenes.find(s=>s.id==='drop')?.start??1018;
  const primary=ease((frame-drop+45)/100)*(1-ease((frame-clipStart('r019',4045))/115));
  const secondary=ease((frame-(clipStart('r034',7704)-77))/130)*(1-ease((frame-clipStart('r035',7938))/95));
  return Math.max(primary,secondary);
}

/** Fixed typography, but not fixed screen placement. All placement and motion
 * are pure frame functions, including when Remotion seeks out of order. */
export function captionLinesV10(text:string):string[] {
  // The current longest authored spoken cue has 21 glyphs. Let those
  // sentences remain a single reading unit instead of a fragmented stack.
  const glyphs=[...text];
  if(glyphs.length<=22)return [text];
  const middle=Math.ceil(glyphs.length/2);
  const cuts=glyphs.flatMap((c,i)=>/[，。；：、!?！？]/.test(c)?[i+1]:[])
    .filter(n=>n>=glyphs.length-22&&n<=22&&n>=6&&glyphs.length-n>=6);
  const at=cuts.sort((a,b)=>Math.abs(a-middle)-Math.abs(b-middle))[0]??middle;
  return [glyphs.slice(0,at).join(''),glyphs.slice(at).join('')];
}

function rgb(hex:string):number[]{
  const h=hex.replace('#','');return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16));
}
function blend(a:string,b:string,t:number){
  const x=rgb(a),y=rgb(b);return `rgb(${x.map((v,i)=>Math.round(v+(y[i]-v)*t)).join(',')})`;
}

const TITLES:Record<string,string>={
  '光进水滴':'光进入水滴',
  '相对波长':'红更长 · 紫更短',
  '连续光谱':'连续的颜色',
  '眼睛是圆锥的顶点':'眼睛是顶点',
  '地面遮住了下半圈':'地面挡住下半圈',
  '完整的圆':'完整的圆 · 透视',
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
    // WorldV10 switches to the landscape anchor once the 95-frame optical
    // close-up falls below .3. Finish the label at the same smooth threshold.
    b=clipStart('r035',b)+95*EASE_SEVEN_TENTHS;
  }else if(text==='约51°'){
    // The earlier reveal invites viewers to notice a second bow first. The
    // number appears only when the narration actually names its angle.
    a=clipStart('r035',a)+62;b=clipStart('r037',b);
  }else if(text==='两道虹之间的暗带'){
    a=clipStart('r037',a);
  }else if(text==='相对波长'){
    a=clipStart('r042',a);b=clipEnd('r042',b);
  }else if(text==='连续光谱'){
    a=clipStart('r043',a);b=clipEnd('r043',b);
  }else if(text==='颜色分开'){
    const waveA=clipStart('r042',b),waveB=clipEnd('r042',b),continuousA=clipStart('r043',b);
    if(frame<waveA)b=waveA;else {a=waveB;b=continuousA;}
  }else if(text==='回头一次'){
    b=clipStart('r044',b);
  }else if(text==='出口方向错开'){
    a=clipStart('r044',a);b=clipEnd('r044',b);
  }
  const enter=ease((frame-a)/22),leave=ease((b-frame)/18);
  return {opacity:enter*leave,draw:ease((frame-a-4)/30)};
}

export function labelLayoutV10(state:FrameState,p:Projected){
  const text=TITLES[p.text]??p.text,numeric=/^约(42|51)°$/.test(text);
  const micro=microStrengthV10(state.frame);
  const right=['reflection','angle','observer','secondary'].includes(state.scene)
    ||p.text==='光在水里转弯'||p.text==='同一个方向';
  const fontSize=p.text==='相对波长'?56:62;
  const lines=text.includes('，')?text.split('，'):[text];
  const width=numeric?270:Math.max(248,Math.min(598,Math.max(...lines.map(s=>[...s].length))*fontSize+8));
  const height=numeric?126:lines.length*82;
  // The anchor owns placement. Offsets leave room for the current light
  // path; continuous clamps avoid side swaps during the moving camera.
  let x=right?p.x+100:p.x-width-100,y=p.y+30;
  if(state.scene==='dispersion'){
    x=between(p.x-width*.58,240,1070);y=p.y+170;
    if(p.text==='连续光谱'){x=between(p.x-width*.5,360,1250);y=p.y+150;}
  }
  if(state.scene==='drop'){x=p.text==='光在水里转弯'?p.x+92:p.x-width-118;y=p.y+110;}
  if(state.scene==='reflection')y=p.y-160;
  if(p.text==='出口方向错开'){x=p.x+118;y=p.y-154;}
  // The hand-painted angle bridge keeps the observer close to frame-right. Keep
  // the direction cue in the open sky at frame-left instead of letting the
  // leader cross the face or torso while the camera rises.
  if(state.scene==='angle'){x=180;y=238;}
  if(p.text==='背对太阳的方向'){x=180;y=238;}
  if(state.scene==='cone'){x=p.text==='同一个方向'?p.x+100:p.x-width-94;y=p.text==='同一个方向'?p.y-125:p.y-100;}
  if(state.scene==='circle'){
    x=p.x-width*.5;
    y=p.y-148;
    // The apex rises through the centre during the airplane reveal. Place
    // the ground label in the left sky while its leader follows the ground.
    // A bounded horizontal drift preserves the spatial anchor without
    // crossing the changing rainbow outline.
    if(p.text==='地面遮住了下半圈'){
      x=between(p.x-width*.5-560,124,170);y=214;
    }
  }
  if(state.scene==='observer'){x=p.x+130;y=p.y-122;}
  if(state.scene==='secondary'){x=p.x+112;y=micro>.3?p.y+88:p.y+172;}
  if(state.scene==='return'){x=p.x-width-100;y=p.y-160;}
  x=between(x,124,1796-width);y=between(y,214,822-height);
  const textEdge=right?x:x+width;
  const leaderEnd={x:textEdge+(right?-16:16),y:y+height*.52};
  const elbow={x:leaderEnd.x+(right?-34:34),y:leaderEnd.y};
  return {text,lines,numeric,right,width,height,x,y,leaderEnd,elbow,fontSize};
}

function Annotation({state,projected:p,realityStrength}:Props){
  if(!p?.visible||state.scene==='references'||state.frame<370
    ||(state.scene==='return'&&state.clip?.id==='r041'))return null;
  const layout=labelLayoutV10(state,p),envelope=labelEnvelope(state,p.text);
  const edge= Math.min(p.x-12,1908-p.x,p.y-18,914-p.y);
  const brandGap=Math.max(p.x-455,p.y-166);
  const opacity=envelope.opacity*(1-ease(realityStrength/.75))*ease(edge/64)*ease(brandGap/48);
  const micro=microStrengthV10(state.frame);
  const lightText=micro>.3||layout.y>570||state.scene==='return'||p.text==='完整的圆';
  const accent=layout.numeric?blend(layout.text==='约51°'?'#69549d':'#a84728',layout.text==='约51°'?'#d8ccff':'#ffd5a8',micro):lightText?'#fbfcf5':INK;
  const distance=Math.hypot(layout.leaderEnd.x-p.x,layout.leaderEnd.y-p.y);
  const leaderStrength=ease((distance-38)/45)*(1-ease((distance-480)/180));
  const shift=(1-envelope.draw)*(layout.right?8:-8);
  const angle=layout.text.match(/^约(42|51)°$/)?.[1];
  return <div style={{position:'absolute',inset:0,zIndex:20,pointerEvents:'none',opacity,fontFamily:'RainbowSans,sans-serif'}}>
    {leaderStrength>0&&<svg width={1920} height={1080} style={{position:'absolute',inset:0,opacity:leaderStrength}}>
      <path d={`M${p.x.toFixed(2)} ${p.y.toFixed(2)} C${(p.x+(layout.elbow.x-p.x)*.54).toFixed(2)} ${p.y.toFixed(2)},${layout.elbow.x.toFixed(2)} ${layout.elbow.y.toFixed(2)},${layout.leaderEnd.x.toFixed(2)} ${layout.leaderEnd.y.toFixed(2)}`}
        fill="none" stroke={accent} strokeOpacity={.46} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"
        pathLength={1} strokeDasharray={1} strokeDashoffset={1-envelope.draw}/>
      <circle cx={p.x} cy={p.y} r={3.2} fill={accent} opacity={envelope.draw*.9}/>
    </svg>}
    <div style={{position:'absolute',left:layout.x,top:layout.y,width:layout.width,height:layout.height,
      transform:`translateX(${shift}px)`,opacity:envelope.draw,textAlign:layout.right?'left':'right',
      color:accent,fontWeight:620,lineHeight:1.23,fontSize:layout.fontSize,letterSpacing:-.7,
      textShadow:lightText?'0 2px 5px rgba(4,24,29,.60),0 0 18px rgba(4,24,29,.18)':`0 1px 9px ${PAPER},0 0 20px ${PAPER}`}}>
      {angle?<div style={{display:'flex',alignItems:'baseline',justifyContent:layout.right?'flex-start':'flex-end',gap:8,whiteSpace:'nowrap'}}>
        <span style={{fontSize:44,fontWeight:500}}>约</span><span style={{fontSize:112,fontWeight:650,letterSpacing:-5,fontVariantNumeric:'tabular-nums'}}>{angle}</span><span style={{fontSize:64,fontWeight:500}}>°</span>
      </div>:layout.lines.map((line,i)=><React.Fragment key={line}>{i>0&&<br/>}{line}</React.Fragment>)}
    </div>
  </div>;
}

function Subtitles({state,realityStrength}:Props){
  const caption=timeline.captions.find(c=>state.frame>=c.start&&state.frame<c.end);
  if(!caption)return null;
  const lines=captionLinesV10(caption.text),fadeIn=ease((state.frame-caption.start+1)/4);
  // The new photographic valley and its wet foreground contain both light
  // and dark patches. Constant white captions with a soft local shadow stay
  // readable as the camera crosses them, without a boxed subtitle card.
  // Keep the closing sentence white with its dark local shadow until it ends;
  // blending toward dark ink mid-sentence made the letters gray on wet stone.
  // Switch the painted/3-D subtitle treatment in the inter-cue pause. A
  // continuous mid-sentence ink blend produces gray letters on a white halo.
  const paperStrength=caption.start<443?1:0;const textColor=blend('#ffffff','#234743',paperStrength);
  return <div style={{position:'absolute',left:420,bottom:54,width:1080,zIndex:42,pointerEvents:'none',
    textAlign:'center',fontFamily:'RainbowSans,sans-serif',opacity:fadeIn}}>
    <div style={{position:'absolute',inset:'-16px -45px -14px',background:paperStrength>.5?'radial-gradient(ellipse,rgba(255,250,233,.90),rgba(255,250,233,.45) 45%,transparent 76%)':'radial-gradient(ellipse,rgba(10,30,35,.30),rgba(10,30,35,.12) 40%,transparent 76%)',pointerEvents:'none'}}/>
    <div style={{position:'relative',fontSize:48,fontWeight:560,lineHeight:1.24,letterSpacing:0,color:textColor,
      textShadow:paperStrength>.5?'0 1px 7px rgba(255,253,239,.65)':'0 2px 4px rgba(5,20,25,.86),0 0 16px rgba(5,20,25,.24)'}}>
      {lines.map((line,i)=><React.Fragment key={`${caption.start}-${i}`}>{i>0&&<br/>}{line}</React.Fragment>)}
    </div>
  </div>;
}

export function EditorialOverlayV10(props:Props){
  return <><Annotation {...props}/><Subtitles {...props}/></>;
}
