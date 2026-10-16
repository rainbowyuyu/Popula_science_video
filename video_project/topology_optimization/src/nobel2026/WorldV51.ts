import {drawBehaviorStudy,drawWhiskerReadout} from './BrainStudyV51';
/* Deterministic biomedical teaching visuals. Local primitives are reviewed
 * against absolute narration cues; the delivery provenance records external
 * model attempts separately. Shapes explain function, not atomic structure. */
export type P={x:number;y:number};
export type Curve={points:P[];lengths:number[];total:number};
export const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export const smooth=(n:number)=>{const q=clamp(n);return q*q*(3-2*q)};
const C={ink:'#183746',blue:'#168da8',blueLight:'#63bed1',gold:'#ce953f',green:'#438975',white:'#fffdf8',paper:'#f4f0e5',muted:'#64818b'};
export function bezier(a:P,b:P,c:P,d:P,steps=64):Curve{
 const points:P[]=[],lengths:number[]=[0];let total=0;
 for(let i=0;i<=steps;i++){const t=i/steps,u=1-t;const p={x:u*u*u*a.x+3*u*u*t*b.x+3*u*t*t*c.x+t*t*t*d.x,y:u*u*u*a.y+3*u*u*t*b.y+3*u*t*t*c.y+t*t*t*d.y};points.push(p);if(i){total+=Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y);lengths.push(total);}}
 return {points,lengths,total};
}
export function curvePoint(curve:Curve,progress:number):P{
 const distance=clamp(progress)*curve.total;let low=0,high=curve.lengths.length-1;
 while(low+1<high){const mid=(low+high)>>1;if(curve.lengths[mid]<distance)low=mid;else high=mid;}
 const k=(distance-curve.lengths[low])/Math.max(.0001,curve.lengths[high]-curve.lengths[low]);const a=curve.points[low],b=curve.points[high];return {x:a.x+(b.x-a.x)*k,y:a.y+(b.y-a.y)*k};
}
export function strokeCurve(ctx:CanvasRenderingContext2D,curve:Curve,color:string,width=3,q=1,alpha=1){
 ctx.save();ctx.globalAlpha*=alpha;ctx.lineWidth=width;ctx.strokeStyle=color;ctx.lineCap='round';ctx.beginPath();const distance=clamp(q)*curve.total;
 for(let i=0;i<curve.points.length;i++){const p=curve.points[i];if(curve.lengths[i]>distance){const end=curvePoint(curve,q);ctx.lineTo(end.x,end.y);break;}i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y);}ctx.stroke();ctx.restore();
}
export function disc(ctx:CanvasRenderingContext2D,p:P,r:number,color:string,alpha=1){ctx.save();ctx.globalAlpha*=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.restore();}
export function sharpLight(ctx:CanvasRenderingContext2D,p:P,r:number,color:string,alpha=1){ctx.save();const parentAlpha=ctx.globalAlpha;ctx.globalAlpha=parentAlpha*alpha*.12;ctx.fillStyle=color;ctx.beginPath();ctx.arc(p.x,p.y,r*2.4,0,Math.PI*2);ctx.fill();ctx.globalAlpha=parentAlpha*alpha;ctx.beginPath();ctx.arc(p.x,p.y,r,0,Math.PI*2);ctx.fill();ctx.restore();}
export function label(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,size=28,color=C.ink,align:CanvasTextAlign='left'){ctx.save();ctx.font=`600 ${size}px Nobel Sans`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();}
export function protein(ctx:CanvasRenderingContext2D,x:number,y:number,open:number,scale=1,color=C.blue){
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);const gap=5+17*clamp(open);
 for(const side of [-1,1]){ctx.save();ctx.scale(side,1);ctx.beginPath();ctx.moveTo(gap,-61);ctx.bezierCurveTo(gap+8,-74,44,-68,47,-46);ctx.bezierCurveTo(44,-26,37,-20,40,0);ctx.bezierCurveTo(43,27,47,49,36,64);ctx.bezierCurveTo(25,76,gap+1,69,gap,52);ctx.bezierCurveTo(gap-5,29,gap+5,14,gap+3,0);ctx.bezierCurveTo(gap,-18,gap-7,-42,gap,-61);ctx.closePath();const shade=ctx.createLinearGradient(4,-50,50,30);shade.addColorStop(0,'#fffdf5');shade.addColorStop(.5,color);shade.addColorStop(1,'#c5dedd');const parent=ctx.globalAlpha;ctx.fillStyle=shade;ctx.globalAlpha=parent*.73;ctx.fill();ctx.globalAlpha=parent*.9;ctx.strokeStyle=color;ctx.lineWidth=3;ctx.stroke();ctx.restore();}if(open<.98){ctx.save();ctx.globalAlpha*=1-clamp(open);ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(0,0,gap+4,9*(1-clamp(open)),0,0,Math.PI*2);ctx.fill();ctx.restore();}ctx.restore();
}
export function bilayer(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,poreX:number,poreWidth=100){
 for(let px=x;px<=x+w;px+=23){if(Math.abs(px-poreX)<poreWidth*.52)continue;for(const side of [-1,1]){const py=y+side*29;disc(ctx,{x:px,y:py},6.5,C.blue,.7);ctx.save();ctx.lineWidth=2.3;ctx.strokeStyle=C.muted;ctx.beginPath();ctx.moveTo(px-3,py-side*6);ctx.quadraticCurveTo(px-5,py-side*15,px-3,py-side*23);ctx.moveTo(px+3,py-side*6);ctx.quadraticCurveTo(px+5,py-side*15,px+3,py-side*23);ctx.stroke();ctx.restore();}}
}
export function neuron(ctx:CanvasRenderingContext2D,x:number,y:number,scale=1,active=0,expressed=0,draw=1){
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
 const branches=[[-28,-18,-52,-32,-75,-75,-115,-90],[-25,15,-75,24,-82,85,-124,96],[-7,-27,-13,-78,31,-75,19,-123],[14,-23,69,-48,100,-31,130,-71],[19,24,52,70,114,51,129,99]];
 branches.forEach((v,i)=>{const c=bezier({x:v[0],y:v[1]},{x:v[2],y:v[3]},{x:v[4],y:v[5]},{x:v[6],y:v[7]});strokeCurve(ctx,c,C.ink,5.5-i*.45,draw,.7);const p=curvePoint(c,.63),e=c.points.at(-1)!;strokeCurve(ctx,bezier(p,{x:p.x+(i%2?10:-16),y:p.y-20},{x:e.x-22,y:e.y-22},{x:e.x-40,y:e.y-20}),C.ink,2.4,clamp((draw-.63)/.37),.58);});
 const soma=ctx.createLinearGradient(-30,-35,40,40);soma.addColorStop(0,C.white);soma.addColorStop(1,active>.2?'#efd5a6':'#d1e5df');ctx.fillStyle=soma;ctx.strokeStyle=C.ink;ctx.lineWidth=3.5;ctx.beginPath();ctx.moveTo(-29,-13);ctx.bezierCurveTo(-37,-41,-4,-48,13,-29);ctx.bezierCurveTo(37,-32,53,-6,31,16);ctx.bezierCurveTo(22,37,-3,44,-17,26);ctx.bezierCurveTo(-43,26,-44,4,-29,-13);ctx.fill();ctx.stroke();disc(ctx,{x:0,y:0},12,C.blue,.2);ctx.strokeStyle=C.blue;ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,0,12,0,Math.PI*2);ctx.stroke();
 if(expressed>0){ctx.save();ctx.globalAlpha*=clamp(expressed);for(let i=0;i<5;i++){const a=i*Math.PI*.43+.3;ctx.save();ctx.translate(Math.cos(a)*32,Math.sin(a)*31);ctx.rotate(a+Math.PI/2);protein(ctx,0,0,active,.12,C.blue);ctx.restore();}ctx.restore();}
 const axon=bezier({x:28,y:8},{x:105,y:-7},{x:180,y:35},{x:260,y:17});strokeCurve(ctx,axon,C.ink,5,draw,.78);strokeCurve(ctx,bezier({x:248,y:19},{x:271,y:14},{x:282,y:-4},{x:300,y:-2}),C.ink,3,clamp((draw-.92)/.08),.75);strokeCurve(ctx,bezier({x:248,y:19},{x:269,y:23},{x:285,y:48},{x:305,y:47}),C.ink,3,clamp((draw-.92)/.08),.75);ctx.restore();return axon;
}
export function eye(ctx:CanvasRenderingContext2D,x:number,y:number,r=150,retina=0){
 ctx.save();const inheritedAlpha=ctx.globalAlpha;ctx.translate(x,y);ctx.fillStyle=C.white;ctx.strokeStyle=C.ink;ctx.lineWidth=4;ctx.beginPath();ctx.ellipse(0,0,r,r*.8,0,0,Math.PI*2);ctx.fill();ctx.stroke();
 ctx.beginPath();ctx.ellipse(-r*.48,0,r*.13,r*.45,0,0,Math.PI*2);ctx.fillStyle='#d9edee';ctx.fill();ctx.strokeStyle=C.blue;ctx.lineWidth=2.3;ctx.stroke();
 ctx.beginPath();ctx.ellipse(-r*.68,0,r*.025,r*.36,0,0,Math.PI*2);ctx.strokeStyle=C.blue;ctx.lineWidth=6;ctx.stroke();
 for(let k=0;k<3;k++){ctx.strokeStyle=k===1?C.gold:C.blue;ctx.lineWidth=k===1?4:2;ctx.globalAlpha=inheritedAlpha*(k===1?.4+.5*retina:.4);ctx.beginPath();ctx.ellipse(0,0,r-12-k*9,r*.8-12-k*8,0,-1.18,1.18);ctx.stroke();}
 ctx.globalAlpha=inheritedAlpha;ctx.strokeStyle=C.ink;ctx.lineWidth=14;ctx.beginPath();ctx.moveTo(r-5,24);ctx.bezierCurveTo(r+30,15,r+40,50,r+67,49);ctx.stroke();ctx.restore();
}

import timeline from './timeline-v51.json';
export type NobelState={scene:string;progress:number;line:number;lineProgress:number;time:number;previous?:string;elapsed?:number;globalFrame?:number;clipId?:string;clipElapsed?:number;phraseIndex?:number;phraseProgress?:number};
const TL=timeline as {clips:{id:string;start:number;end:number;subtitleParts:{start:number;end:number;text:string}[]}[]};
function cue(id:string,index:number){const clip=TL.clips.find(c=>c.id===id);return clip?(clip.start/30+(clip.subtitleParts[index]?.start??0)):0;}
function advance(t:number,id:string,index:number,duration=1){return smooth((t-cue(id,index))/duration);}
function gate(t:number,start:number,end:number,ramp=.2){return smooth((t-start)/ramp)*(1-smooth((t-end)/ramp));}
function sampledPath(ctx:CanvasRenderingContext2D,c:Curve,color:string,progress:number,alpha=1){strokeCurve(ctx,c,color,3,1,alpha*.28);strokeCurve(ctx,c,color,4,progress,alpha);sharpLight(ctx,curvePoint(c,progress),6,color,alpha);}
function trace(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,t:number,on:number,kind:'current'|'voltage'){
 ctx.save();ctx.strokeStyle=C.muted;ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+w,y);ctx.stroke();
 const reveal=clamp((t-on)/2.1);ctx.strokeStyle=C.gold;ctx.lineWidth=3.3;ctx.beginPath();
 for(let i=0;i<=Math.ceil(reveal*160);i++){const u=Math.min(reveal,i/160);let v=0;
 if(kind==='current'){if(u>.17&&u<.74){const a=(u-.17)/.1;v=.42+.58*Math.exp(-Math.max(0,a-1)*1.7);v*=smooth(a);}else if(u>=.74)v=.42*Math.exp(-(u-.74)*23);}
 else v=Math.exp(-Math.pow((u-.42)/.043,2))-.23*Math.exp(-Math.pow((u-.54)/.074,2));
 i?ctx.lineTo(x+w*u,y-h*v):ctx.moveTo(x+w*u,y-h*v);
 }ctx.stroke();ctx.restore();
}
function beam(ctx:CanvasRenderingContext2D,a:P,b:P,width:number,alpha:number,color=C.blueLight){if(alpha<.001)return;ctx.save();const parent=ctx.globalAlpha;ctx.globalAlpha*=alpha;const d=Math.atan2(b.y-a.y,b.x-a.x),nx=-Math.sin(d),ny=Math.cos(d);ctx.fillStyle=color;ctx.globalAlpha*=.15;ctx.beginPath();ctx.moveTo(a.x+nx*3,a.y+ny*3);ctx.lineTo(b.x+nx*width,b.y+ny*width);ctx.lineTo(b.x-nx*width,b.y-ny*width);ctx.lineTo(a.x-nx*3,a.y-ny*3);ctx.closePath();ctx.fill();ctx.globalAlpha=parent*alpha*.8;ctx.strokeStyle=color;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();ctx.restore();}
function cup(ctx:CanvasRenderingContext2D,x:number,y:number,scale=1){ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);ctx.fillStyle=C.white;ctx.strokeStyle=C.ink;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-36,-49);ctx.lineTo(-29,26);ctx.quadraticCurveTo(0,42,29,26);ctx.lineTo(36,-49);ctx.closePath();ctx.fill();ctx.stroke();ctx.beginPath();ctx.ellipse(0,-49,36,10,0,0,Math.PI*2);ctx.stroke();ctx.beginPath();ctx.moveTo(35,-30);ctx.bezierCurveTo(78,-37,71,17,31,7);ctx.stroke();ctx.restore();}
function actionExamples(ctx:CanvasRenderingContext2D,t:number){
 const start=cue('000',1),alpha=gate(t,start,cue('000',2),.45);if(alpha<=0)return;
 const e=Math.max(0,t-start);ctx.save();ctx.globalAlpha*=alpha;
 // The three gestures are linked to the spoken sequence: hand, head, eyelid.
 ctx.save();ctx.translate(1305,590);ctx.rotate(-.25*smooth(e/.9));ctx.strokeStyle=C.ink;ctx.fillStyle='#e6eee7';ctx.lineWidth=3;
 ctx.beginPath();ctx.moveTo(-22,79);ctx.lineTo(-28,18);ctx.bezierCurveTo(-56,-6,-54,-30,-39,-22);ctx.lineTo(-21,-2);ctx.lineTo(-23,-66);ctx.bezierCurveTo(-23,-86,-9,-86,-9,-68);ctx.lineTo(-7,-24);ctx.lineTo(-5,-87);ctx.bezierCurveTo(-4,-107,10,-106,10,-86);ctx.lineTo(11,-23);ctx.lineTo(16,-80);ctx.bezierCurveTo(19,-96,33,-91,30,-76);ctx.lineTo(26,-16);ctx.lineTo(36,-54);ctx.bezierCurveTo(41,-69,54,-62,50,-47);ctx.lineTo(41,18);ctx.quadraticCurveTo(37,53,23,61);ctx.lineTo(24,80);ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
 ctx.save();ctx.translate(1505,574);const turn=smooth((e-.85)/.85);ctx.strokeStyle=C.ink;ctx.fillStyle='#e6eee7';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-33,91);ctx.lineTo(-30,61);ctx.bezierCurveTo(-87,34,-88,-53,-46,-77);ctx.bezierCurveTo(0,-112,57,-75,58,-31);ctx.lineTo(73+11*turn,-2);ctx.quadraticCurveTo(81+11*turn,5,61,11);ctx.lineTo(57,41);ctx.quadraticCurveTo(52,62,20,58);ctx.lineTo(20,90);ctx.closePath();ctx.fill();ctx.stroke();disc(ctx,{x:36+8*turn,y:-27},4,C.ink);ctx.beginPath();ctx.ellipse(-20+11*turn,-12,11,19,0,0,Math.PI*2);ctx.strokeStyle=C.muted;ctx.lineWidth=2;ctx.stroke();ctx.restore();
 ctx.save();ctx.translate(1720,568);const blink=1-.91*Math.pow(Math.sin(Math.PI*clamp((e-1.8)/.72)),2);ctx.strokeStyle=C.ink;ctx.fillStyle=C.white;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-71,0);ctx.bezierCurveTo(-28,-45*blink,24,-45*blink,71,0);ctx.bezierCurveTo(25,40*blink,-27,40*blink,-71,0);ctx.closePath();ctx.fill();ctx.stroke();ctx.save();ctx.clip();disc(ctx,{x:0,y:0},24,C.blue,.65);disc(ctx,{x:0,y:0},11,C.ink);disc(ctx,{x:7,y:-8},4,C.white);ctx.restore();ctx.restore();
 ['抬手','转头','眨眼'].forEach((text,i)=>label(ctx,text,1305+i*205,735,29,C.muted,'center'));ctx.restore();
}
export class NobelWorldV51{
 private ctx:CanvasRenderingContext2D;
 constructor(private canvas:HTMLCanvasElement){canvas.width=1920;canvas.height=1080;const c=canvas.getContext('2d');if(!c)throw new Error('Canvas 2D unavailable');this.ctx=c;}
 dispose(){}
 render(s:NobelState){const c=this.ctx,t=s.globalFrame!==undefined?s.globalFrame/30:s.time;c.clearRect(0,0,1920,1080);const g=c.createLinearGradient(0,0,1920,1080);g.addColorStop(0,'#f4f0e5');g.addColorStop(.65,'#eff3ed');g.addColorStop(1,'#dce9e7');c.fillStyle=g;c.fillRect(0,0,1920,1080);c.save();c.beginPath();c.rect(90,334,s.scene==='hook'||s.scene==='context'||s.scene==='impact'||s.scene==='algae'||(s.scene==='brain'&&(s.clipId==='016'||s.clipId==='017'))?1750:925,552);c.clip();if(s.scene==='hook')this.hook(t);else if(s.scene==='context')this.context(t);else if(s.scene==='algae')this.algae(t);else if(s.scene==='channel')this.channel(t);else if(s.scene==='neuron')this.neuronScene(t);else if(s.scene==='brain'){if(s.clipId==='016'||s.clipId==='017'){const entry=s.clipId==='016'?smooth((t-(TL.clips.find(x=>x.id==='016')!.start/30))/.85):1;if(entry<1){c.save();c.globalAlpha*=1-entry;this.brain(TL.clips.find(x=>x.id==='016')!.start/30-.01);c.restore();}c.save();c.globalAlpha*=entry;drawBehaviorStudy(c,t,s.clipId);c.restore();}else this.brain(t);}else if(s.scene==='impact')this.impact(t);c.restore();}
 private hook(t:number){const c=this.ctx;actionExamples(c,t);const names=advance(t,'001',0,1.5);const cx=720-210*names,cy=580,sc=1.15-.17*names;const input=advance(t,'000',3,2),lit=advance(t,'000',4,1.6);const cells=[[-180,-80,1],[65,-95,0],[-135,150,0],[155,150,1],[20,20,1]];
 c.save();c.translate(cx,cy);c.scale(sc,sc);cells.forEach(([x,y,e],i)=>{const act=lit?e*lit:Math.max(0,Math.sin(t*1.6-i));neuron(c,x,y,.7,act,e,1);if(act>.05){const p=bezier({x:x+18,y:y+4},{x:x+73,y:y-5},{x:x+127,y:y+25},{x:x+182,y:y+12});sampledPath(c,p,C.gold,(t*.36+i*.17)%1,act*.85);}});c.restore();beam(c,{x:cx-245,y:350},{x:cx+70,y:680},135,lit);if(input>0){label(c,'通道表达',cx-180,838,28);label(c,'＋',cx-35,838,28);label(c,'光照',cx+25,838,28,C.blue);label(c,'→ 电信号',cx+95,838,28,C.gold);}}
 private context(t:number){const c=this.ctx,intervention=advance(t,'002',2,1.6),response=advance(t,'002',3,1.4);const x=450,y=560;neuron(c,x,y,1.4,intervention,intervention);neuron(c,1120,560,1.1,response,0);const flow=bezier({x:825,y:583},{x:965,y:560},{x:955,y:552},{x:1110,y:560});strokeCurve(c,flow,C.ink,3,1,.25);if(response>0)sampledPath(c,flow,C.gold,(t-cue('002',3))*.37%1,response);beam(c,{x:230,y:350},{x:450,y:565},105,intervention);label(c,intervention>.4?'改变输入':'同时出现的活动',230,805,34);label(c,response>.4?'观察输出变化':'观察行为',1120,805,34,C.ink,'center');}
 private algae(t:number){const c=this.ctx,travel=advance(t,'004',1,2.7),focus=advance(t,'004',2,1.5),measure=advance(t,'005',0,1.5),pore=advance(t,'006',1,1.5);const path=bezier({x:665,y:590},{x:655,y:485},{x:465,y:435},{x:420,y:500});const pos=curvePoint(path,travel),size=1.05+.12*focus-.2*pore;
 if(t>=cue('004',0)){beam(c,{x:132,y:510},{x:760,y:570},185,.7);strokeCurve(c,path,C.green,2,travel,.35);}c.save();c.translate(pos.x,pos.y);c.rotate(-.22*travel);c.scale(size,size);const fill=c.createLinearGradient(-145,-75,130,75);fill.addColorStop(0,'#deece0');fill.addColorStop(.7,'#a2c9ae');fill.addColorStop(1,'#c6dfca');c.fillStyle=fill;c.strokeStyle=C.green;c.lineWidth=4;c.beginPath();c.ellipse(0,0,148,100,0,0,Math.PI*2);c.fill();c.stroke();c.fillStyle='#619f78';c.globalAlpha=.27;c.beginPath();c.moveTo(-60,-78);c.bezierCurveTo(165,-126,187,111,-55,79);c.bezierCurveTo(47,68,91,-74,-60,-78);c.fill();c.globalAlpha=1;disc(c,{x:20,y:8},24,'#edf4e4');disc(c,{x:20,y:8},9,C.green,.4);disc(c,{x:-80,y:-49},17,C.gold);for(const side of [-1,1]){c.strokeStyle=C.green;c.lineWidth=3;c.beginPath();for(let i=0;i<=50;i++){const u=i/50,x=-134-u*125,y=side*23+Math.sin(u*6+t*6+side)*17*u+side*24*u;i?c.lineTo(x,y):c.moveTo(x,y);}c.stroke();}c.restore();
 label(c,'眼点',pos.x-80, pos.y-132,29,C.ink,'center');
 if(measure>0){
  const electrode=bezier({x:880,y:370},{x:800,y:420},{x:650,y:440},{x:pos.x-80,y:pos.y-48});
  strokeCurve(c,electrode,C.ink,3,measure,.7);
  trace(c,200,820,580,60,t,cue('005',1),'current');label(c,'光电流',200,744,28);
  const compare=advance(t,'005',2,1),fast=advance(t,'005',1,1);
  if(compare>0&&pore<1){
   c.save();c.globalAlpha=compare*(1-pore);label(c,'同一时间尺度',1135,420,32);
   const x0=1180,w=570;
   c.strokeStyle='#c7d6d0';c.lineWidth=1.5;c.beginPath();c.moveTo(x0,460);c.lineTo(x0,746);c.stroke();
   for(const [y,v,color,name] of [[548,.05,C.green,'衣藻  约 0.5 ms'],[708,1,C.blue,'人眼  ≥ 10 ms']] as [number,number,string,string][]){
    c.strokeStyle='#c7d6d0';c.lineWidth=1.5;c.beginPath();c.moveTo(x0,y);c.lineTo(x0+w,y);c.stroke();
    const q=name.startsWith('衣藻')?fast:compare;c.fillStyle=color;c.beginPath();c.roundRect(x0,y-10,w*v*q,20,10);c.fill();
    label(c,name,x0,y-35,30,color);disc(c,{x:x0+w*v*q,y},6,color);
   }
   label(c,'从受光到相应电信号出现',1135,805,27,C.muted);c.restore();
  }
 }
 if(pore>0){c.save();c.globalAlpha=pore;const detach=advance(t,'006',3,1.8),inactive=advance(t,'006',4,1.2);bilayer(c,675,684,300,825,72);const py=684-108*detach;protein(c,825,py,advance(t,'006',2,.9)*(1-inactive),.72,inactive>.5?'#93a8a2':C.blue);if(detach>.01){c.setLineDash([5,8]);c.strokeStyle=C.muted;c.lineWidth=1.5;c.beginPath();c.moveTo(825,633);c.lineTo(825,py+42);c.stroke();c.setLineDash([]);}label(c,inactive>.5?'离开膜环境 · 活性降低':'感光蛋白',825,805,27,inactive>.5?C.muted:C.ink,'center');if(inactive<1&&detach>.05){sharpLight(c,{x:825,y:py},5,C.blue,1-inactive);}c.restore();}}
 private channel(t:number){const c=this.ctx,zoom=advance(t,'007',2,3),openA=advance(t,'008',1,.6),compare=advance(t,'009',0,1.2),returnMain=advance(t,'010',0,1.2);const open=(gate(t,cue('008',1),cue('009',0),.6)+gate(t,cue('009',2),cue('010',0),.5)+gate(t,cue('010',1),TL.clips.find(x=>x.id==='010')!.end/30,.4));
 if(zoom<1){
  c.save();c.globalAlpha=1-smooth((zoom-.58)/.42);
  // Follow the same upper-membrane patch of the ChR2 egg into the section.
  const k=1+3*zoom;
  c.translate(725-75*zoom,581+442*zoom);c.scale(k,k);c.translate(-725,-581);
  for(let i=0;i<2;i++){
   const x=337+i*388,y=581;
   const eggFill=c.createRadialGradient(x-30,y-45,12,x,y,116);eggFill.addColorStop(0,'#f5ecca');eggFill.addColorStop(1,'#d7c38d');
   c.fillStyle=eggFill;c.strokeStyle=C.ink;c.lineWidth=3/k;c.beginPath();c.arc(x,y,116,0,Math.PI*2);c.fill();c.stroke();
   if(zoom<.4){c.save();c.globalAlpha*=1-smooth(zoom/.4);
    label(c,i?'ChR2':'ChR1',x,765,31,C.ink,'center');label(c,'蛙卵',x,808,28,C.muted,'center');
    const gene=bezier({x:x-88,y:378},{x:x-70,y:410},{x:x+15,y:417},{x:x-4,y:470});sampledPath(c,gene,i?C.blue:C.green,advance(t,'007',1,1.8));c.restore();
   }
   if(zoom>.01)protein(c,x,y-116,0,.19,i?C.blue:C.green);
  }
  c.restore();
 }
 c.save();c.globalAlpha=smooth((zoom-.38)/.62);const switchAlpha=1-compare*(1-returnMain);c.globalAlpha*=switchAlpha;bilayer(c,180,559,760,650,110);protein(c,650,559,Math.min(1,open),1.25);beam(c,{x:395,y:365},{x:647,y:541},50,Math.min(1,open),C.blueLight);label(c,'细胞外',195,412,27);label(c,'细胞内',195,685,27);label(c,'ChR2',650,731,30,C.ink,'center');if(open>.75){
  const epochs=[[cue('008',1)+.60,cue('009',0)],[cue('009',2)+.60,cue('010',0)],[cue('010',1)+.60,TL.clips.find(x=>x.id==='010')!.end/30]];
  const epoch=epochs.find(([a,b])=>t>=a&&t<b);
  if(epoch)for(let i=0;i<7;i++){
   const elapsed=t-epoch[0]-i*.23;if(elapsed<0)continue;
   const u=(elapsed%2.05)/1.7;if(u>1)continue;
   const x=650+(i%3-1)*7;
   const flow=bezier({x,y:402},{x,y:477},{x,y:628},{x,y:693});const at=curvePoint(flow,u);
   const alpha=smooth(u/.07)*(1-smooth((u-.92)/.08))*smooth((open-.75)/.25);
   disc(c,at,6,C.gold,alpha);c.save();c.globalAlpha*=alpha;label(c,'+',at.x,at.y+4,14,C.white,'center');c.restore();
  }
 // Teaching time is slowed: the current trace rises as the first visible ion
 // enters the open pore (0.60 s emission delay + about 0.75 s travel).
 }trace(c,195,854,730,54,t,cue('008',1)+1,'current');c.restore();
 if(compare>0&&returnMain<1){
  c.save();c.globalAlpha=compare*(1-returnMain);
  const expressed=advance(t,'009',1,.8),active=advance(t,'009',2,.65);
  for(let i=0;i<2;i++){
   const x=350+i*430;c.fillStyle=i?'#dceae2':'#e8e7dc';c.strokeStyle=C.ink;c.lineWidth=3;
   c.beginPath();c.ellipse(x,570,145,99,0,0,Math.PI*2);c.fill();c.stroke();
   c.save();c.globalAlpha*=expressed;for(let k=0;k<4;k++)protein(c,x-88+k*58,483,active,.2);c.restore();
   beam(c,{x:x-70,y:356},{x,y:555},100,active);label(c,i?'仓鼠肾细胞':'人胚肾细胞',x,738,28,C.ink,'center');
   trace(c,x-118,830,236,53,t,cue('009',2),'current');
  }c.restore();
 }
 }

 private neuronScene(t:number){
  const c=this.ctx,intro=advance(t,'011',0,1.2),expression=advance(t,'011',1,1.5),series=advance(t,'013',0,1.0),select=advance(t,'014',0,1.3);
  const first=cue('012',1),base=cue('013',1),elapsed=Math.max(0,t-base),interval=.8;
  const trainOn=t>=base&&t<base+7*interval;
  const flash=Math.max(gate(t,cue('014',1),cue('014',1)+.65,.1),t<cue('013',0)?gate(t,first,first+.55,.12):trainOn?gate(elapsed%interval,0,.18,.045):0);
  const scale=1.4-.2*select,x=325,y=548;
  neuron(c,x,y,scale,flash,expression,intro);
  const axon=bezier({x:x+28*scale,y:y+8*scale},{x:x+105*scale,y:y-7*scale},{x:x+180*scale,y:y+35*scale},{x:x+260*scale,y:y+17*scale});
  if(t>first&&series<1)sampledPath(c,axon,C.gold,clamp((t-first)/1.6),1-series);
  if(t>cue('014',1)&&t<cue('014',1)+1.6)sampledPath(c,axon,C.gold,clamp((t-cue('014',1))/1.3),.9);
  if(trainOn)sampledPath(c,axon,C.gold,clamp((elapsed%interval)/.66),.9);
  beam(c,{x:180,y:345},{x:325,y:540},97,flash);
  if(series<1){c.save();c.globalAlpha=1-series;trace(c,200,835,690,76,t,first,'voltage');label(c,'动作电位',200,724,28);c.restore();}
  if(series>0){
   c.save();c.globalAlpha=series*(1-select);
   label(c,'光脉冲',154,777,27,C.blue);label(c,'电信号',154,837,27,C.gold);
   c.strokeStyle='#c1d3ce';c.lineWidth=1.2;c.beginPath();c.moveTo(294,776);c.lineTo(970,776);c.moveTo(294,835);c.lineTo(970,835);c.stroke();
   for(let i=0;i<7;i++){
    const px=323+i*91,dt=t-base-i*interval,light=smooth(dt/.08);if(dt<0)continue;
    c.fillStyle=C.blue;c.fillRect(px,776-22*light,13,22*light);
    const q=clamp((dt-.035)/.55);if(q<=0)continue;c.strokeStyle=C.gold;c.lineWidth=2.7;c.beginPath();
    for(let j=0;j<=Math.ceil(q*50);j++){const u=Math.min(q,j/50),v=Math.exp(-Math.pow((u-.3)/.065,2))-.2*Math.exp(-Math.pow((u-.49)/.11,2));j?c.lineTo(px-10+u*70,835-46*v):c.moveTo(px-10+u*70,835-46*v);}c.stroke();
   }
   c.restore();
  }
  if(select>0){
   c.save();c.globalAlpha=select;neuron(c,750,650,.4,0,0);
   label(c,'光脉冲',154,777,27,C.blue);label(c,'电信号',154,837,27,C.gold);
   const q=advance(t,'014',1,.15);c.fillStyle=C.blue;c.fillRect(575,776-22*q,13,22*q);
   trace(c,330,835,600,52,t,cue('014',1),'voltage');c.restore();
  }
 }
 private brain(t:number){const c=this.ctx,fiber=advance(t,'015',0,2.2),expression=advance(t,'015',1,1.2),stim=advance(t,'015',2,.5),wake=advance(t,'016',0,1.5),memory=advance(t,'017',0,1.6);c.fillStyle='#e1e8df';c.strokeStyle=C.ink;c.lineWidth=3.7;c.beginPath();c.moveTo(221,573);c.bezierCurveTo(145,426,291,368,406,389);c.bezierCurveTo(438,342,575,358,604,398);c.bezierCurveTo(784,402,805,576,703,678);c.bezierCurveTo(661,739,574,767,486,719);c.bezierCurveTo(343,764,216,704,221,573);c.fill();c.stroke();for(let i=0;i<5;i++){const x=310+i*75;strokeCurve(c,bezier({x,y:420},{x:x-40,y:485},{x:x+60,y:514},{x:x+30,y:565}),C.blue,2.2,1,.3);}
 const optic=bezier({x:860,y:345},{x:844,y:349},{x:611,y:355},{x:572,y:503});strokeCurve(c,optic,C.blue,7,fiber,.75);const tip=curvePoint(optic,fiber);disc(c,tip,7,C.white);if(stim>0)beam(c,tip,{x:544,y:605},87,stim*.7);
 const neurons=[{x:552,y:553,e:1},{x:590,y:600,e:0},{x:524,y:601,e:1}];neurons.forEach((n,i)=>neuron(c,n.x,n.y,.33,stim*n.e,n.e*expression,1));
 const readout=bezier({x:553,y:640},{x:692,y:651},{x:648,y:732},{x:766,y:730});strokeCurve(c,readout,C.gold,3,stim,.6);if(stim>0)sampledPath(c,readout,C.gold,(t-cue('015',2))*.24%1,.9);
 c.save();c.translate(827,734);c.fillStyle=C.white;c.strokeStyle=C.ink;c.lineWidth=3;c.beginPath();c.ellipse(0,0,48,38,0,0,Math.PI*2);c.fill();c.stroke();disc(c,{x:-28,y:-12},5,C.ink);for(const k of [-1,0,1]){const sway=Math.sin(t*4.5+k)*6*stim;strokeCurve(c,bezier({x:27,y:0},{x:47,y:k*14},{x:73,y:k*30+sway},{x:100,y:k*36+sway}),C.ink,1.8,1,.8);}c.restore();
 if(wake>0){label(c,memory>.3?'标记并重新激活记忆群体':'选择特定细胞群',225,831,29);if(memory>.1){for(let i=0;i<3;i++)disc(c,{x:420+i*56,y:587+(i%2)*40},10,C.gold,memory*.8);}}
 }
 private impact(t:number){const c=this.ctx,clinical=advance(t,'019',0,1.4),recall=advance(t,'020',0,1.4),final=advance(t,'021',0,1.8);
 const overviewAlpha=1-clinical;if(overviewAlpha>.01){c.save();c.globalAlpha=overviewAlpha;['疼痛','进食','奖赏','社交','注意'].forEach((text,i)=>{const x=235+i*330,y=550;neuron(c,x,y,.63,.6,1);label(c,text,x+42,757,34,C.ink,'center');const q=advance(t,'018',1,1+i*.7);beam(c,{x:x-75,y:365},{x,y:y},48,q*.8);});c.restore();}
 const eyeAlpha=clinical*(1-recall);if(eyeAlpha>.01){c.save();c.globalAlpha=eyeAlpha;cup(c,255,638,1.3);label(c,'物体',255,796,30,C.ink,'center');c.strokeStyle=C.ink;c.lineWidth=5;for(let i=0;i<2;i++){c.beginPath();c.roundRect(524+i*174,536,150,99,26);c.stroke();}c.beginPath();c.moveTo(674,574);c.quadraticCurveTo(686,559,698,574);c.stroke();c.beginPath();c.moveTo(524,558);c.lineTo(483,541);c.moveTo(848,558);c.lineTo(891,536);c.stroke();label(c,'专用眼镜',688,796,30,C.ink,'center');const retinal=advance(t,'019',2,1.7);eye(c,1320,587,176,retinal);label(c,'视网膜',1470,796,30,C.ink,'center');const objectRay=bezier({x:300,y:590},{x:392,y:546},{x:443,y:577},{x:536,y:577});strokeCurve(c,objectRay,C.ink,2,advance(t,'019',3,1.5),.55);beam(c,{x:852,y:580},{x:1430,y:589},15,advance(t,'019',3,1.6),C.gold);if(retinal>.2)for(let i=0;i<5;i++){const a=-.8+i*.4;protein(c,1320+Math.cos(a)*140,587+Math.sin(a)*107,advance(t,'019',3,.8),.14,C.gold);}label(c,'ChrimsonR',1470,842,28,C.gold,'center');c.restore();}
 if(recall>.01){
  c.save();c.globalAlpha*=recall;
  const x=650+380*final,y=570,sc=1.4-.5*final;
  const active=Math.min(1,gate(t,cue('020',3),cue('021',2),.3));
  neuron(c,x,y,sc,active,advance(t,'020',2,1.4));
  const optic=bezier({x:x-160,y:357},{x:x-30,y:360},{x:x+10,y:445},{x,y:535});
  strokeCurve(c,optic,C.blue,6,1,.6);strokeCurve(c,optic,C.white,2,1,.8);
  beam(c,{x,y:535},{x,y:y+32},57,active);
  const motion=Math.min(1,active+gate(t,cue('020',1)+.2,cue('020',1)+1.9,.25));
  drawWhiskerReadout(c,1510+70*final,662,.90-.10*final,t,motion);
  const output=bezier({x:x+305*sc,y:598},{x:x+365*sc,y:594},{x:1310,y:628},{x:1372,y:638});
  strokeCurve(c,output,C.ink,2,1,.2);if(active>0)sampledPath(c,output,C.gold,(t-cue('020',3))*.34%1,.8*active);
  if(final>.01){
   c.save();c.globalAlpha*=smooth((final-.2)/.8);
   c.fillStyle='#c5dfcc';c.strokeStyle=C.green;c.lineWidth=3;c.beginPath();c.ellipse(270,560,100,68,-.15,0,Math.PI*2);c.fill();c.stroke();disc(c,{x:221,y:533},11,C.gold);
   for(const k of [-1,1])strokeCurve(c,bezier({x:178,y:548+k*11},{x:144,y:524+k*34},{x:128,y:564+k*25},{x:111,y:550+k*42+Math.sin(t*4)*7}),C.green,2.5,1,.8);
   protein(c,580,560,active,.9);
   const p=bezier({x:375,y:560},{x:442,y:544},{x:469,y:568},{x:520,y:560});sampledPath(c,p,C.gold,final,.85);
   const p2=bezier({x:630,y:560},{x:775,y:563},{x:830,y:549},{x:980,y:570});sampledPath(c,p2,C.gold,final,.85);
   label(c,'眼点',270,797,29,C.ink,'center');label(c,'光控通道',580,797,29,C.ink,'center');label(c,'神经细胞',1040,797,29,C.ink,'center');c.restore();
  }
  c.restore();
 }
 }
}

