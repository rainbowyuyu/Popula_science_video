/**
 * Deterministic 2-D visual language for the V5 Nobel short.
 *
 * V4 used a Three.js stage with small anatomical models.  V5 deliberately
 * replaces those objects with a flat, graphic language: light, paths, cells,
 * membranes and traces.  The evidence photographs remain in the editorial
 * layer, while this canvas explains the mechanism.  Every position is a
 * function of the current frame/state; there is no random or real-time CSS
 * animation, which keeps stills and final renders identical.
 */
export type NobelState={scene:string;progress:number;line:number;lineProgress:number;time:number;previous?:string;elapsed?:number};
export const clamp=(n:number)=>Math.max(0,Math.min(1,n));
export const smooth=(n:number)=>{const x=clamp(n);return x*x*x*(x*(x*6-15)+10)};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const TAU=Math.PI*2;

type Palette={ink:string;paper:string;cyan:string;gold:string;violet:string;coral:string;green:string;muted:string;white:string};
const C:Palette={ink:'#183746',paper:'#f4f0e5',cyan:'#168da8',gold:'#d8943d',violet:'#785ac7',coral:'#d96f64',green:'#369b76',muted:'#62808b',white:'#fffdf8'};

const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const ease=(v:number)=>{const t=clamp(v);return t*t*(3-2*t)};

function line(ctx:CanvasRenderingContext2D,points:[number,number][],color:string,width=3,alpha=1){
 ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle=color;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();
 points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.restore();
}
function dot(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill();ctx.restore();}
function glowDot(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha=1){ctx.save();ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(x,y,0,x,y,r*3.8);g.addColorStop(0,color);g.addColorStop(.2,color);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.beginPath();ctx.arc(x,y,r*3.8,0,TAU);ctx.fill();dot(ctx,x,y,r,color,alpha);ctx.restore();}
function arrow(ctx:CanvasRenderingContext2D,x1:number,y1:number,x2:number,y2:number,color:string,width=3,alpha=1){line(ctx,[[x1,y1],[x2,y2]],color,width,alpha);const a=Math.atan2(y2-y1,x2-x1);const s=10;line(ctx,[[x2,y2],[x2-s*Math.cos(a-.5),y2-s*Math.sin(a-.5)]],color,width,alpha);line(ctx,[[x2,y2],[x2-s*Math.cos(a+.5),y2-s*Math.sin(a+.5)]],color,width,alpha);}
function roundRect(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,fill:string,stroke?:string,alpha=1){ctx.save();ctx.globalAlpha=alpha;ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=2;ctx.stroke();}ctx.restore();}

export class NobelWorldV5{
 private ctx:CanvasRenderingContext2D; private canvas:HTMLCanvasElement;
 constructor(canvas:HTMLCanvasElement){this.canvas=canvas;const c=canvas.getContext('2d');if(!c)throw new Error('2D canvas unavailable');this.ctx=c;canvas.width=1920;canvas.height=1080;}
 dispose(){/* Canvas has no external resources. */}
 render(s:NobelState){
  const ctx=this.ctx;const t=s.time;const p=clamp(s.progress);const lp=clamp(s.lineProgress);const scene=s.scene;
  ctx.clearRect(0,0,1920,1080);
  const bg=ctx.createLinearGradient(0,0,1920,1080);bg.addColorStop(0,'#f8f4ea');bg.addColorStop(.48,'#eef4f1');bg.addColorStop(1,'#dbe9e9');ctx.fillStyle=bg;ctx.fillRect(0,0,1920,1080);
  // A slow, deterministic paper grain substitute: three low-alpha halos tie
  // every station together without flicker or expensive filters.
  const halo=ctx.createRadialGradient(1460+80*Math.sin(t*.11),180+40*Math.cos(t*.09),0,1460,180,700);halo.addColorStop(0,'rgba(22,141,168,.15)');halo.addColorStop(1,'rgba(22,141,168,0)');ctx.fillStyle=halo;ctx.fillRect(0,0,1920,1080);
  ctx.save();ctx.translate(0,0);ctx.globalAlpha=.23;for(let i=0;i<9;i++){const x=130+i*260+20*Math.sin(t*.07+i),y=845+22*Math.cos(t*.09+i);line(ctx,[[x,y],[x+100,y-100]],C.cyan,1);}ctx.restore();
  if(scene==='hook')this.hook(t,p,lp);
  else if(scene==='context')this.context(t,p,lp);
  else if(scene==='algae')this.algae(t,p,lp);
  else if(scene==='channel')this.channel(t,p,lp);
  else if(scene==='neuron')this.neuron(t,p,lp);
  else if(scene==='brain')this.brain(t,p,lp);
  else if(scene==='impact')this.impact(t,p,lp);
 }
 private hook(t:number,p:number,lp:number){
  const ctx=this.ctx;const cx=1090,cy=560; // light enters a schematic cortex
  const beam=ctx.createLinearGradient(220,120,1250,520);beam.addColorStop(0,'rgba(216,148,61,0)');beam.addColorStop(.58,'rgba(216,148,61,.12)');beam.addColorStop(1,'rgba(216,148,61,.33)');ctx.fillStyle=beam;ctx.beginPath();ctx.moveTo(180,120);ctx.lineTo(420,70);ctx.lineTo(1340,430);ctx.lineTo(1260,650);ctx.closePath();ctx.fill();
  for(let i=0;i<7;i++){const a=i/7*TAU+t*.09;const x=cx+260*Math.cos(a),y=cy+155*Math.sin(a);line(ctx,[[cx,cy],[x,y]],i%2?C.cyan:C.violet,3,.38);glowDot(ctx,x,y,10,i%2?C.cyan:C.violet,.7);}
  ctx.save();ctx.strokeStyle=C.ink;ctx.globalAlpha=.85;ctx.lineWidth=5;ctx.beginPath();ctx.ellipse(cx,cy,270,180,-.16,0,TAU);ctx.stroke();ctx.restore();
  const q=ease((p+.15*Math.sin(t*.35))/1.1);const px=290+940*q,py=180+370*q;glowDot(ctx,px,py,16,C.gold,.9);arrow(ctx,px-130,py-70,px-22,py-12,C.gold,4,.75);
  const wave:[number,number][]=[];for(let i=0;i<170;i++){const x=240+i*7.8,y=865-42*Math.sin(i*.25+t*1.5)-90*Math.exp(-Math.pow((i-87)/9,2))*q;wave.push([x,y]);}line(ctx,wave,C.coral,4,.8);
  roundRect(ctx,128,770,640,150,22,'rgba(255,253,248,.68)',C.coral,.9);ctx.save();ctx.font='600 26px Microsoft YaHei';ctx.fillStyle=C.ink;ctx.fillText('一束光，能不能只叫醒一小群细胞？',164,820);ctx.font='24px Microsoft YaHei';ctx.fillStyle=C.muted;ctx.fillText('从光感受器到神经回路：一条可验证的因果链',164,865);ctx.restore();
 }
 private context(t:number,p:number,lp:number){
  const ctx=this.ctx;const xs=[260,650,1040,1430], labels=['光','通道','电信号','行为'];const active=ease((p*1.25)%1);
  for(let i=0;i<xs.length;i++){const x=xs[i],y=500+35*Math.sin(t*.45+i);if(i<xs.length-1)arrow(ctx,x+88,y,xs[i+1]-94,y,C.cyan,6,.5);glowDot(ctx,x,y,32,i===3?C.gold:C.cyan,.92);ctx.save();ctx.font='700 34px Microsoft YaHei';ctx.fillStyle=C.ink;ctx.textAlign='center';ctx.fillText(labels[i],x,y+98);ctx.restore();}
  const pulseX=xs[0]+(xs[3]-xs[0])*active;glowDot(ctx,pulseX,500+35*Math.sin(t*.45+(pulseX-xs[0])/390),13,C.gold,1);
  ctx.save();ctx.strokeStyle='rgba(24,55,70,.22)';ctx.lineWidth=2;for(let i=0;i<7;i++)ctx.strokeRect(200+i*230,275+i%2*35,150,420);ctx.restore();
 }
 private algae(t:number,p:number,lp:number){
  // Keep the explanatory cell in the open left stage.  The evidence card
  // occupies the right editorial column, so the cell must never slide
  // underneath it during the slow camera drift.
  const ctx=this.ctx;const x=650+105*Math.sin(t*.18),y=510+70*Math.cos(t*.21);ctx.save();ctx.translate(x,y);ctx.rotate(-.16+Math.sin(t*.5)*.03);ctx.fillStyle='rgba(54,155,118,.18)';ctx.strokeStyle=C.green;ctx.lineWidth=8;ctx.beginPath();ctx.ellipse(0,0,220,112,0,0,TAU);ctx.fill();ctx.stroke();ctx.fillStyle=C.gold;ctx.beginPath();ctx.ellipse(-108,-18,36,24,0,0,TAU);ctx.fill();ctx.strokeStyle=C.gold;ctx.lineWidth=4;for(let i=-2;i<=2;i++)line(ctx,[[155,20],[270+i*20,80+i*32]],C.green,4,.7);ctx.restore();
  const pts:[number,number][]=[];for(let i=0;i<=70;i++){const u=i/70;pts.push([280+u*510,650-170*Math.sin(u*Math.PI)*(.72+.16*Math.sin(t*.2))]);}line(ctx,pts,C.cyan,5,.55);const u=(t*.18+lp*.8)%1;glowDot(ctx,280+u*510,650-170*Math.sin(u*Math.PI),13,C.gold,1);
 }
  private channel(t:number,p:number,lp:number){
  // The membrane and channel live in the left teaching bay; the official
  // figure on the right remains a clean, unobstructed evidence window.
  const ctx=this.ctx;const cx=690,cy=520;for(const yy of [cy-70,cy+70]){line(ctx,[[220,yy],[900,yy]],C.muted,6,.52);for(let i=0;i<9;i++)dot(ctx,250+i*78,yy+(i%2?12:-12),8,C.green,.72);}
  const open=ease((p-.16)/.34);ctx.save();ctx.translate(cx,cy);ctx.rotate(.08*Math.sin(t*.25));ctx.strokeStyle=C.cyan;ctx.lineWidth=20;ctx.beginPath();ctx.ellipse(0,0,102,102,0,0,TAU);ctx.stroke();ctx.strokeStyle=C.ink;ctx.lineWidth=12*(1-open);ctx.beginPath();ctx.moveTo(0,-68*(1-open));ctx.lineTo(0,68*(1-open));ctx.stroke();ctx.restore();
  const light=ease((p-.05)/.23);for(let i=0;i<6;i++){const x=300+((t*.6+i*.18)%1)*430;glowDot(ctx,x,cy-100-i*12,7,C.gold,light*.85);}
  for(let i=0;i<11;i++){const phase=(t*.3+i/11)%1;const x=cx+Math.sin(i*2.4)*25;const y=cy-50+phase*250;glowDot(ctx,x,y,8,i%2?C.gold:C.cyan,open*.9);}
 }
 private neuron(t:number,p:number,lp:number){
  const ctx=this.ctx;const soma:[number,number]=[330,490];glowDot(ctx,soma[0],soma[1],55,C.coral,.94);const branches:[number,number][][]=[[[330,490],[250,405],[185,380]],[[330,490],[245,580],[170,640]],[[330,490],[430,405],[610,380]],[[330,490],[450,610],[620,680]]];branches.forEach(b=>line(ctx,b,C.violet,13,.85));const axon:[[number,number],[number,number],[number,number],[number,number]]=[[330,490],[500,495],[690,500],[900,500]];line(ctx,axon,C.violet,17,.9);
  const q=ease((p-.12)/.55);const x=330+(900-330)*q;glowDot(ctx,x,500,18,C.gold,.98);
  const trace:[number,number][]=[];for(let i=0;i<130;i++){const xx=520+i*3.05;const peak=Math.exp(-Math.pow((i-58)/8,2))*180*q;trace.push([xx,850-peak+16*Math.sin(i*.12+t)]);}line(ctx,trace,C.coral,5,.85);line(ctx,[[520,850],[916,850]],C.muted,2,.5);
 }
 private brain(t:number,p:number,lp:number){
  const ctx=this.ctx;const cx=520,cy=535;ctx.save();ctx.strokeStyle='rgba(22,141,168,.52)';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(250,430);ctx.bezierCurveTo(220,210,570,145,760,300);ctx.bezierCurveTo(880,420,780,730,500,790);ctx.bezierCurveTo(300,830,200,620,250,430);ctx.stroke();for(let i=0;i<11;i++){const a=i/11*TAU+t*.06;const x=cx+165*Math.cos(a),y=cy+125*Math.sin(a);line(ctx,[[cx,cy],[x,y]],C.cyan,3,.3);dot(ctx,x,y,10,C.coral,.8);}ctx.restore();
  const fiberX=930+14*Math.sin(t*.22),top=190,tip=600;line(ctx,[[fiberX,top],[fiberX,tip]],C.gold,12,.95);glowDot(ctx,fiberX,tip,20,C.gold,1);const pulse=ease((p-.2)/.5);for(let i=0;i<5;i++){const y=top+(tip-top)*((t*.38+i/5)%1);glowDot(ctx,fiberX,y,7,C.cyan,pulse);}
 }
 private impact(t:number,p:number,lp:number){
  const ctx=this.ctx;const cx=940,cy=520,r=220;for(let i=0;i<10;i++){const a=i/10*TAU+t*.12;const x=cx+r*Math.cos(a),y=cy+r*.62*Math.sin(a);dot(ctx,x,y,20,i%2?C.violet:C.coral,.94);arrow(ctx,x+25*Math.cos(a),y+16*Math.sin(a),cx+r*Math.cos(a+.24),cy+r*.62*Math.sin(a+.24),C.cyan,4,.55);}ctx.save();ctx.strokeStyle=C.coral;ctx.lineWidth=6;ctx.beginPath();ctx.ellipse(cx,cy,r,r*.62,0,0,TAU);ctx.stroke();ctx.restore();const u=(t*.22+p)%1;glowDot(ctx,cx+r*Math.cos(u*TAU),cy+r*.62*Math.sin(u*TAU),14,C.gold,1);roundRect(ctx,310,780,1260,125,22,'rgba(255,253,248,.76)',C.cyan,.8);ctx.save();ctx.font='700 32px Microsoft YaHei';ctx.fillStyle=C.ink;ctx.fillText('工具的价值：把“相关”变成可以反复开关的因果',360,835);ctx.font='23px Microsoft YaHei';ctx.fillStyle=C.muted;ctx.fillText('光遗传学让研究者按下开关，再观察回路与行为的变化',360,878);ctx.restore();
 }
}
