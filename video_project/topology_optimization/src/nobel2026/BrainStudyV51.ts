/**
 * Two frame-deterministic behavioral experiments, read from the actual V51 cues.
 * Coordinates are editorial enlargements, not anatomical measurements.
 * API: drawBehaviorStudy(ctx, absoluteSeconds, '016' | '017').
 * Local implementation developed while the isolated Opus design call runs.
 */
import timeline from './timeline-v51.json';

type Point={x:number;y:number};
const TAU=Math.PI*2;
const C={ink:'#183746',blue:'#168da8',light:'#63bed1',gold:'#ce953f',cream:'#fffdf8',muted:'#64818b',pink:'#dab8ad',green:'#438975'};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const u=clamp(x);return u*u*(3-2*u)};
const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
const clips=timeline.clips as {id:string;start:number;end:number;subtitleParts:{start:number;end:number;text:string}[]}[];
const clip=(id:string)=>clips.find(c=>c.id===id)!;
const cue=(id:string,n:number)=>clip(id).start/timeline.fps+clip(id).subtitleParts[n].start;
const advance=(t:number,id:string,n:number,duration=1)=>ease((t-cue(id,n))/duration);

function path(ctx:CanvasRenderingContext2D,d:string,fill:string|CanvasGradient|null,stroke:string|null,width=2,alpha=1){
 ctx.save();ctx.globalAlpha*=alpha;const p=new Path2D(d);if(fill){ctx.fillStyle=fill;ctx.fill(p);}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.stroke(p);}ctx.restore();
}
function ellipse(ctx:CanvasRenderingContext2D,x:number,y:number,rx:number,ry:number,fill:string|CanvasGradient,stroke?:string,width=2){
 ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,TAU);ctx.fillStyle=fill;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=width;ctx.stroke();}
}
function label(ctx:CanvasRenderingContext2D,text:string,x:number,y:number,size=29,color=C.ink,align:CanvasTextAlign='center'){
 ctx.save();ctx.font=`600 ${size}px "Nobel Sans", "Microsoft YaHei", sans-serif`;ctx.textAlign=align;ctx.fillStyle=color;ctx.fillText(text,x,y);ctx.restore();
}
function cubic(a:Point,b:Point,c:Point,d:Point,u:number):Point{const v=1-u;return{x:v*v*v*a.x+3*v*v*u*b.x+3*v*u*u*c.x+u*u*u*d.x,y:v*v*v*a.y+3*v*v*u*b.y+3*v*u*u*c.y+u*u*u*d.y};}
function quietGlow(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,alpha:number,color='99,190,209'){
 if(alpha<=0)return;ctx.save();const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(${color},${alpha*.25})`);g.addColorStop(1,`rgba(${color},0)`);ellipse(ctx,x,y,r,r,g);ctx.restore();
}

/** Smooth light footprint includes nearby unlabeled cells: specificity is opsin. */
function fiber(ctx:CanvasRenderingContext2D,tip:Point,amount:number,footprint:Point,width=130){
 const a={x:tip.x+170,y:387},b={x:tip.x+104,y:369},c={x:tip.x+2,y:440};
 ctx.save();ctx.strokeStyle=C.ink;ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.bezierCurveTo(b.x,b.y,c.x,c.y,tip.x,tip.y);ctx.stroke();
 ctx.strokeStyle='#fcf9ee';ctx.lineWidth=3.2;ctx.stroke();
 if(amount>0){const g=ctx.createLinearGradient(tip.x,tip.y,footprint.x,footprint.y+70);g.addColorStop(0,`rgba(71,167,193,${.31*amount})`);g.addColorStop(1,'rgba(71,167,193,0)');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(tip.x-4,tip.y);ctx.lineTo(footprint.x-width,footprint.y+65);ctx.quadraticCurveTo(footprint.x,footprint.y+112,footprint.x+width,footprint.y+65);ctx.lineTo(tip.x+4,tip.y);ctx.closePath();ctx.fill();quietGlow(ctx,footprint.x,footprint.y,125,amount);}
 ellipse(ctx,tip.x,tip.y,7,5,C.cream,C.blue,2);ctx.restore();
}

/** Organic soma, dendrites and membrane gates, not a point-network symbol. */
function cell(ctx:CanvasRenderingContext2D,x:number,y:number,scale:number,expressed:number,activation:number){
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
 const branches=['M-24-8 C-47-11-67-37-88-33 M-55-24 L-56-51 M-67-33 L-83-57',
 'M-11-26 C-18-53 0-68-8-91 M-10-57 L-35-73 M-8-79 L9-96',
 'M22-14 C45-33 63-26 83-55 M53-33 L53-59 M72-41 L93-37',
 'M-12 26 C-35 45-31 68-66 79 M-35 53 L-61 49 M-51 72 L-51 92'];
 branches.forEach(d=>path(ctx,d,null,C.ink,3.5,.62));
 const g=ctx.createLinearGradient(-25,-25,35,30);g.addColorStop(0,C.cream);g.addColorStop(1,activation>.1?'#ead0a0':'#d9e7df');
 path(ctx,'M-24-12 C-22-40 3-42 20-23 C45-15 37 8 19 24 C5 44-15 33-22 17 C-40 13-37-5-24-12 Z',g,C.ink,2.4);
 ellipse(ctx,-1,-1,10,11,'#edf5ed',C.muted,1.6);
 const axon='M23 13 C64 15 87 45 136 33';path(ctx,axon,null,C.ink,3.2,.7);
 if(activation>0){path(ctx,axon,null,C.gold,5,activation*.75);quietGlow(ctx,0,0,50,activation*.75,'206,149,63');}
 if(expressed>0){ctx.globalAlpha*=expressed;for(let k=0;k<5;k++){const a=.12+k*TAU/5;ctx.save();ctx.translate(29*Math.cos(a),29*Math.sin(a));ctx.rotate(a);ctx.strokeStyle=C.blue;ctx.lineWidth=3;const gap=3+2*activation;ctx.beginPath();ctx.moveTo(-9,-gap);ctx.lineTo(8,-gap);ctx.moveTo(-9,gap);ctx.lineTo(8,gap);ctx.stroke();ctx.restore();}}
 ctx.restore();
}

const BRAIN='M-258 8 C-281-63-230-130-170-136 C-130-186-63-188-12-159 C43-185 132-146 164-105 C235-106 266-31 231 31 C206 86 154 121 82 121 C26 153-47 141-83 118 C-176 154-252 96-258 8 Z';
function brain(ctx:CanvasRenderingContext2D,t:number,activation:number,expression:number,focus:number){
 ctx.save();ctx.translate(486,563);
 const g=ctx.createLinearGradient(-220,-150,195,130);g.addColorStop(0,'#f2e4d4');g.addColorStop(.62,'#e3d1bc');g.addColorStop(1,'#d3c7b7');
 ctx.shadowColor='rgba(24,55,70,.08)';ctx.shadowBlur=24;ctx.shadowOffsetY=12;path(ctx,BRAIN,g,C.ink,3.3);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 ['M-202-73 C-168-110-127-92-134-38 C-162 7-96 20-118 57',
 'M-112-128 C-72-103-72-73-93-40 M-45-139 C-2-117-10-85-43-61',
 'M43-128 C70-109 92-85 73-46 C55-15 95 11 120-8',
 'M136-80 C186-60 207-9 174 24 C145 64 191 80 174 89',
 'M-191 46 C-169 31-137 32-116 60 M-58 98 C-22 76 5 76 30 92'].forEach(d=>path(ctx,d,null,'#967f71',2.2,.32));
 path(ctx,'M-143 2 C-129-68-29-89 42-55 C86-34 92-7 61 3 C22-38-50-45-95-3 Z','#f8f3e7',C.muted,1.6,.8);
 path(ctx,'M15 92 C16 120 39 142 75 153 C88 163 107 167 119 155 C112 138 99 114 100 91', '#d8c6b0',C.ink,2,.8);
 ctx.save();ctx.beginPath();ctx.ellipse(31,68,112,67,-.1,0,TAU);ctx.fillStyle=`rgba(206,149,63,${.08+.08*focus})`;ctx.fill();ctx.restore();
 // These enlarged cells sit in a ventral hypothalamic region; neighboring gray
 // cells receive the same light footprint and deliberately remain unactivated.
 cell(ctx,-48,52,.40,expression,activation);
 cell(ctx,33,74,.42,expression,activation);
 cell(ctx,112,53,.34,0,0);
 cell(ctx,-145,-3,.30,0,0);
 ctx.restore();
 fiber(ctx,{x:516,y:504},activation,{x:518,y:626},130);
 label(ctx,'下丘脑',468,786,31);
 if(focus>.01){ctx.save();ctx.globalAlpha=focus;label(ctx,'表达通道',535,828,25,C.blue);ctx.restore();}
}

/** A mouse made from one stable silhouette and attached articulated parts. */
function mouse(ctx:CanvasRenderingContext2D,x:number,y:number,scale:number,t:number,awake:number,motion=0,phase=0,activity=1,whiskerGain=1){
 ctx.save();ctx.translate(x,y);ctx.scale(scale,scale);
 const shadow=ctx.createRadialGradient(-5,77,12,-5,77,172);shadow.addColorStop(0,'rgba(24,55,70,.15)');shadow.addColorStop(1,'rgba(24,55,70,0)');ellipse(ctx,-5,77,175,20,shadow);
 const tailWave=Math.sin(t*1.5)*3*(.25+.75*awake)*activity;
 path(ctx,`M-117 35 C-156 67-182 89-220 75 C-247 64-262 ${41+tailWave}-247 ${22+tailWave}`,null,'#d4ac9a',9,.8);
 path(ctx,`M-117 33 C-156 65-182 87-220 73 C-247 62-260 ${41+tailWave}-247 ${22+tailWave}`,null,'#f0d7c5',3,.8);
 const gait=Math.sin(phase)*6*motion, breath=Math.sin(t*2.0)*(.8-.32*motion);
 path(ctx,`M-88 35 C-113 40-111 63-89 71 L-57 72 Q-45 73-47 78 L-91 80 C-124 75-135 47-119 34`, '#e4dcd0',C.ink,2.1);
 path(ctx,`M60 20 C59 43 ${64+gait} 61 ${75+gait} 72 L${104+gait} 74 Q${119+gait} 78 ${106+gait} 80 L${76+gait} 80 C44 72 41 50 42 33`, '#ece6db',C.ink,2.1);
 const coat=ctx.createLinearGradient(-90,-67,58,64);coat.addColorStop(0,'#fffefa');coat.addColorStop(.45,'#eeeae1');coat.addColorStop(1,'#cfcfc6');
 ctx.save();ctx.translate(0,breath);path(ctx,'M108 17 C107-32 39-86-40-76 C-113-68-143-22-131 34 C-119 66-73 78-21 73 C30 80 95 62 108 17 Z',coat,C.ink,2.6);
 const belly=ctx.createLinearGradient(-30,14,0,66);belly.addColorStop(0,'rgba(255,253,248,0)');belly.addColorStop(1,'rgba(255,253,248,.65)');path(ctx,'M-113 22 C-94 57-9 73 61 39 C63 81-91 93-113 22 Z',belly,null);
 path(ctx,'M-78-57 C-57-69-12-70 13-61',null,'#fffdf8',5,.65);ctx.restore();
 // Head pivots around the neck; eyes, ears and whiskers share the transform.
 ctx.save();ctx.translate(66,8-15*awake+breath*.55);ctx.rotate(-.12*awake+.035*(1-awake));
 const earMove=Math.sin(t*1.3)*.035*awake*activity;ctx.save();ctx.translate(0,-65);ctx.rotate(-.14+earMove);ellipse(ctx,0,0,26,33,'#eee4d8',C.ink,2.4);ellipse(ctx,2,3,16,23,'#dcc0b6');ctx.restore();
 const face=ctx.createLinearGradient(-23,-47,91,29);face.addColorStop(0,'#fffdf7');face.addColorStop(1,'#dcd8cd');
 path(ctx,'M-26-10 C-28-48 6-66 33-48 C49-42 64-25 97-17 C110-13 108-2 94 3 C70 16 48 39 20 31 C-8 29-17 16-26-10 Z',face,C.ink,2.6);
 ctx.save();ctx.translate(-3,-63);ctx.rotate(.04+earMove);ellipse(ctx,0,0,25,31,'#f4eee2',C.ink,2.2);ellipse(ctx,2,2,15,21,'#e0c2b8');ctx.restore();
 const open=ease(awake);ctx.save();ctx.translate(40,-25);if(open>.01){ellipse(ctx,0,0,6,1+6*open,C.ink);ellipse(ctx,1.6,-1.7,1.5,1.5,C.cream);}ctx.strokeStyle=C.ink;ctx.lineWidth=2.8;ctx.beginPath();ctx.moveTo(-7,-1);ctx.quadraticCurveTo(0,3*(1-open),7,-1);ctx.stroke();ctx.restore();
 ellipse(ctx,100,-9,7,5,'#b98680',C.ink,1.4);path(ctx,'M96-1 Q82 9 72 9',null,C.muted,1.2,.7);
 for(const k of [-1,0,1]){const sway=Math.sin(t*2+k)*(.3+1.5*awake)*activity*whiskerGain;path(ctx,`M83 2 C105 ${k*7} 124 ${k*15+sway} 143 ${k*21+sway}`,null,C.muted,1.2,.75);}
 ctx.restore();
 path(ctx,'M-77 75 L-72 78 M-67 75 L-62 78 M84 76 L87 79 M93 76 L96 79',null,C.muted,1.1,.6);
 ctx.restore();
}

function causeBridge(ctx:CanvasRenderingContext2D,t:number,start:number,amount:number){
 const a={x:795,y:614},b={x:896,y:568},c={x:966,y:604},d={x:1066,y:602};
 path(ctx,'M795 614 C896 568 966 604 1066 602',null,C.blue,2,.18);
 const u=ease((t-start)/1.5),p=cubic(a,b,c,d,u);
 if(amount>0&&u<1){quietGlow(ctx,p.x,p.y,18,amount);ellipse(ctx,p.x,p.y,5,5,C.gold);}
 path(ctx,'M1056 594 L1066 602 L1055 610',null,C.blue,2.5,.32+.3*amount);
}

function wakeStudy(ctx:CanvasRenderingContext2D,t:number){
 const on=advance(t,'016',0,2.1),wake=advance(t,'016',1,1.5),focus=advance(t,'016',2,1.35);
 brain(ctx,t,on,.65+.35*focus,focus);
 causeBridge(ctx,t,cue('016',1)-.55,on);
 path(ctx,'M1080 750 Q1390 779 1713 750',null,C.muted,1.5,.25);
 mouse(ctx,1410,667,1.06,t,wake);
 // One fixed caption place; state changes once with the observed behavior.
 const switchLabel=wake>.58?'觉醒':'睡眠';label(ctx,switchLabel,1415,823,33,wake>.58?C.blue:C.muted);
}

const HIPPO='M-184 27 C-207-46-140-120-42-122 C64-135 165-81 167-12 C174 62 95 109 30 84 C-23 68-49 30-12 6 C14-12 45 1 60 3 C91 8 112-7 85-33 C44-79-44-84-91-48 C-119-27-135 5-125 28 C-111 55-159 73-184 27 Z';
const ENGRAM=[{x:-113,y:-31},{x:-35,y:-73},{x:48,y:-65}];
function hippocampus(ctx:CanvasRenderingContext2D,t:number,marked:number,recalled:number,training:number){
 ctx.save();ctx.translate(451,567);ctx.scale(1.35,1.35);
 const g=ctx.createLinearGradient(-170,-100,110,80);g.addColorStop(0,'#e9d8c7');g.addColorStop(.55,'#f3e7d9');g.addColorStop(1,'#c7bbaf');
 ctx.shadowColor='rgba(24,55,70,.09)';ctx.shadowBlur=17;ctx.shadowOffsetY=7;path(ctx,HIPPO,g,C.ink,2.5);ctx.shadowBlur=0;ctx.shadowOffsetY=0;
 path(ctx,'M-161 23 C-171-40-112-101-35-99 C46-106 128-60 143-13 C149 38 92 77 39 61',null,'#9e8b79',1.6,.38);
 ctx.save();ctx.clip(new Path2D(HIPPO));
 // The three marked cells retain their positions and identity through both contexts.
 ENGRAM.forEach((n,i)=>{const reveal=ease(marked*1.65-i*.22);cell(ctx,n.x,n.y,.40,reveal,Math.max(recalled,training*reveal));if(reveal>0){ctx.save();ctx.strokeStyle=C.gold;ctx.globalAlpha*=.75*reveal;ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(n.x,n.y,22,24,0,0,TAU);ctx.stroke();ctx.restore();}});
 cell(ctx,127,-8,.35,0,0);cell(ctx,83,66,.34,0,0);ctx.restore();ctx.restore();
 label(ctx,'海马中的同一群细胞',458,797,29);
 if(recalled>0)fiber(ctx,{x:483,y:429},recalled,{x:463,y:507},135);
}

function environment(ctx:CanvasRenderingContext2D,change:number){
 ctx.save();const x=1075,y=441,w=616,h=297;
 const far=lerp(35,59,change),corner=lerp(0,33,change);
 const wash=ctx.createLinearGradient(x,y,x+w,y+h);wash.addColorStop(0,`rgba(${Math.round(lerp(224,199,change))},${Math.round(lerp(216,226,change))},${Math.round(lerp(192,223,change))},.33)`);wash.addColorStop(1,'rgba(255,253,248,.10)');
 ctx.fillStyle=wash;ctx.beginPath();ctx.roundRect(x,y,w,h,corner);ctx.fill();
 path(ctx,`M${x} ${y+h} L${x+far} ${y+h-29} L${x+w-far} ${y+h-29} L${x+w} ${y+h}`,null,C.muted,1.8,.3);
 path(ctx,`M${x+far} ${y+h-29} L${x+far} ${y+24+change*30} M${x+w-far} ${y+h-29} L${x+w-far} ${y+24+change*30}`,null,C.muted,1.4,.28);
 // Walls change shape continuously to distinguish contexts without a card cut.
 for(let k=0;k<5;k++){const px=x+110+k*96;path(ctx,`M${px} ${y+29} L${px+12*change} ${y+103}`,null,C.muted,2,.14*(1-change));}
 path(ctx,`M${x+90} ${y+35} Q${x+w/2} ${y-5+38*change} ${x+w-90} ${y+35}`,null,C.blue,1.6,change*.25);
 ctx.restore();
}

function memoryStudy(ctx:CanvasRenderingContext2D,t:number){
 const start=clip('017').start/timeline.fps;
 const entry=ease((t-start)/1.2);
 const mark=advance(t,'017',0,2.8),context=advance(t,'017',1,1.25);
 const light=advance(t,'017',1,.85),again=advance(t,'017',2,1.25);
 if(entry<1){ctx.save();ctx.globalAlpha*=1-entry;brain(ctx,t,1,1,1);ctx.restore();}
 ctx.save();ctx.globalAlpha*=entry;hippocampus(ctx,t,mark,light,.65*(1-context));environment(ctx,context);ctx.restore();
 // Integrating a cubic velocity envelope gives continuous position and speed.
 const freezeAt=cue('017',1)+.65,duration=1.6;
 const before=Math.max(0,freezeAt-start),u=clamp((t-freezeAt)/duration);
 const elapsed=Math.max(0,t-start);
 const distance=18*(t<freezeAt?elapsed:before+duration*(u-u*u*u+.5*u*u*u*u));
 const speed=t<freezeAt?1:1-ease(u),mx=lerp(1410,1269+distance,entry);
 const gait=distance*.16;
 for(let i=0;i<Math.floor(distance/26);i++){const x=1140+i*26;ctx.save();ctx.globalAlpha=.14;ellipse(ctx,x,750+(i%2?6:-3),5,2.1,C.muted);ctx.restore();}
 mouse(ctx,mx,lerp(667,658+Math.sin(gait)*2.3*speed,entry),lerp(1.06,1.01,entry),t,1,speed*entry,gait,lerp(1,speed,entry));
 // An intentionally qualitative motion trace, with no invented numeric data.
 const traceX=1140,traceY=800,traceW=464;path(ctx,`M${traceX} ${traceY} L${traceX+traceW} ${traceY}`,null,C.muted,1.2,.23);
 const progress=clamp((t-start)/(clip('017').end/timeline.fps-start));ctx.save();ctx.strokeStyle=C.blue;ctx.lineWidth=3;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
 for(let i=0;i<=Math.ceil(progress*100);i++){const v=Math.min(progress,i/100),sample=start+v*(clip('017').end/timeline.fps-start),stop=1-ease((sample-freezeAt)/duration);const yy=traceY-14*(.6+.4*Math.sin(v*24))*stop;i?ctx.lineTo(traceX+traceW*v,yy):ctx.moveTo(traceX+traceW*v,yy);}ctx.stroke();ctx.restore();
 const stage=t<cue('017',1)?'训练时标记':t<cue('017',2)?'几天后 · 蓝光重激活':'再次出现恐惧反应';
 label(ctx,stage,1405,397,29,context>.4?C.blue:C.ink);
 label(ctx,u>.65?'运动停止':'活动',1380,846,26,u>.65?C.ink:C.muted);
 causeBridge(ctx,t,cue('017',1)+.25,light);
 if(again>0){quietGlow(ctx,451,567,175,again*.32,'206,149,63');}
}

export function drawBehaviorStudy(ctx:CanvasRenderingContext2D,time:number,clipId:string):void{
 if(clipId!=='016'&&clipId!=='017')return;
 ctx.save();ctx.beginPath();ctx.rect(120,365,1630,485);ctx.clip();
 if(clipId==='016')wakeStudy(ctx,time);else memoryStudy(ctx,time);
 ctx.restore();
}

export function drawWhiskerReadout(ctx:CanvasRenderingContext2D,x:number,y:number,scale:number,t:number,amount:number){
 mouse(ctx,x,y,scale,t,1,0,0,clamp(amount),4.5);
 label(ctx,'胡须',x+42,y+144,29,C.ink);
}
