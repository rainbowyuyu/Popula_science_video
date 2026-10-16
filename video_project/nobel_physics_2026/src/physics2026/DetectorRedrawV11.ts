/** Literature-based, frame-driven detector reconstruction. All spatial
 * coordinates are explanatory geometry, never invented reconstructed events.
 * The deployed string geometry is represented by 86 fixed teaching positions,
 * each with 60 modules; this is not a survey of the actual string coordinates.
 */
type V3={x:number;y:number;z:number};
type P2={x:number;y:number;s:number;z:number};
type Cam={cx:number;cy:number;scale:number;yaw:number;pitch:number;origin?:V3};
const COL={white:'#e9f4f2',muted:'#93b8c6',cyan:'#78e7fa',blue:'#3998d0',gold:'#e7bd77',rose:'#e6a093'};
const TAU=Math.PI*2;
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(x:number)=>{x=clamp(x);return x*x*(3-2*x);};
const fract=(x:number)=>x-Math.floor(x);
const rand=(i:number)=>fract(Math.sin(i*127.13+31.77)*43758.5453);
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
const add=(a:V3,b:V3):V3=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const mul=(a:V3,s:number):V3=>({x:a.x*s,y:a.y*s,z:a.z*s});
const sub=(a:V3,b:V3):V3=>add(a,mul(b,-1));
const dot=(a:V3,b:V3)=>a.x*b.x+a.y*b.y+a.z*b.z;
const len=(a:V3)=>Math.sqrt(dot(a,a));
const norm=(a:V3)=>mul(a,1/Math.max(.0001,len(a)));
const cross=(a:V3,b:V3):V3=>({x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x});
function project(p:V3,m:Cam):P2{
 const q=m.origin?sub(p,m.origin):p;
 const x=q.x*Math.cos(m.yaw)+q.z*Math.sin(m.yaw), z=-q.x*Math.sin(m.yaw)+q.z*Math.cos(m.yaw);
 const y=q.y*Math.cos(m.pitch)-z*Math.sin(m.pitch), rz=q.y*Math.sin(m.pitch)+z*Math.cos(m.pitch);
 const s=m.scale*1250/(1250+rz);
 return{x:m.cx+x*s,y:m.cy-y*s,s,z:rz};
}
function stroke(c:CanvasRenderingContext2D,a:{x:number;y:number},b:{x:number;y:number},color:string,w=1,alpha=1){
 c.save();c.globalAlpha*=alpha;c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.restore();
}
function curve(c:CanvasRenderingContext2D,pts:{x:number;y:number}[],color:string,w=1,alpha=1,close=false,fill?:string){
 if(!pts.length)return;c.save();c.globalAlpha*=alpha;c.lineWidth=w;c.strokeStyle=color;c.lineJoin='round';c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(const p of pts.slice(1))c.lineTo(p.x,p.y);if(close)c.closePath();if(fill){c.fillStyle=fill;c.fill();}c.stroke();c.restore();
}
function disc(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha=1){
 if(r<=0||alpha<=0)return;c.save();c.globalAlpha*=alpha;c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.restore();
}
function halo(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,alpha=.2){
 if(r<=0||alpha<=0)return;c.save();c.globalAlpha*=alpha;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,color);g.addColorStop(.2,color);g.addColorStop(1,'transparent');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);c.restore();
}
function text(c:CanvasRenderingContext2D,value:string,x:number,y:number,size=28,color=COL.white,align:CanvasTextAlign='left',alpha=1){
 c.save();c.globalAlpha*=alpha;c.font=`500 ${size}px "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;c.fillStyle=color;c.textAlign=align;c.textBaseline='middle';c.shadowColor='#03131d';c.shadowBlur=9;c.fillText(value,x,y);c.restore();
}
function arrow(c:CanvasRenderingContext2D,a:{x:number;y:number},b:{x:number;y:number},color:string,w=2,alpha=1){
 stroke(c,a,b,color,w,alpha);const ang=Math.atan2(b.y-a.y,b.x-a.x);curve(c,[{x:b.x-10*Math.cos(ang-.45),y:b.y-10*Math.sin(ang-.45)},b,{x:b.x-10*Math.cos(ang+.45),y:b.y-10*Math.sin(ang+.45)}],color,w,alpha);
}
function line3(c:CanvasRenderingContext2D,a:V3,b:V3,m:Cam,color:string,w=1,alpha=1){stroke(c,project(a,m),project(b,m),color,w,alpha);}
function ring3(c:CanvasRenderingContext2D,center:V3,u:V3,v:V3,r:number,m:Cam,color:string,alpha=.4,w=1.3){
 curve(c,Array.from({length:65},(_,i)=>{const a=i/64*TAU;return project(add(center,add(mul(u,r*Math.cos(a)),mul(v,r*Math.sin(a)))),m);}),color,w,alpha);
}
function camera(cx:number,cy:number,t:number,scale=.9):Cam{return{cx,cy,scale,yaw:-.47+Math.sin(t*.075)*.11,pitch:.14+Math.sin(t*.045)*.035};}

// Stable triangular footprint. Every hit remains at its detector position.
const STRINGS:V3[]=Array.from({length:121},(_,i)=>{const row=Math.floor(i/11)-5,col=i%11-5;return{x:col*42+(row%2)*21,y:0,z:row*36.4};}).sort((a,b)=>(a.x*a.x+a.z*a.z)-(b.x*b.x+b.z*b.z)).slice(0,86);
const MODULES=STRINGS.flatMap((p,string)=>Array.from({length:60},(_,j)=>({x:p.x,y:220-j*440/59,z:p.z,string,j})));
const TRACK_START:V3={x:-230,y:126,z:42};
const TRACK_END:V3={x:230,y:-105,z:-36};
const AXIS=norm(sub(TRACK_END,TRACK_START));
const TRACK_LEN=len(sub(TRACK_END,TRACK_START));
const U=norm(cross(AXIS,{x:0,y:1,z:0}));
const V=norm(cross(AXIS,U));

/** The blue ice is a volume, with physically fixed ice strata, perspective
 * corners, transmitted edge light and a restrained volumetric falloff. */
function iceVolume(c:CanvasRenderingContext2D,m:Cam,t:number,alpha=1){
 c.save();c.globalAlpha*=alpha;
 const verts=[{x:-250,y:254,z:-228},{x:250,y:254,z:-228},{x:250,y:-254,z:-228},{x:-250,y:-254,z:-228},{x:-250,y:254,z:228},{x:250,y:254,z:228},{x:250,y:-254,z:228},{x:-250,y:-254,z:228}];
 const ps=verts.map(p=>project(p,m));
 const faces=[[0,1,5,4],[0,4,7,3],[4,5,6,7],[1,2,6,5]];
 for(let k=0;k<faces.length;k++){
  const f=faces[k].map(i=>ps[i]);const g=c.createLinearGradient(f[0].x,f[0].y,f[2].x,f[2].y);g.addColorStop(0,k===0?'rgba(153,220,234,.27)':'rgba(25,112,157,.2)');g.addColorStop(.55,'rgba(25,81,119,.17)');g.addColorStop(1,'rgba(6,31,55,.1)');
  c.fillStyle=g;c.beginPath();c.moveTo(f[0].x,f[0].y);for(const p of f.slice(1))c.lineTo(p.x,p.y);c.closePath();c.fill();c.strokeStyle='rgba(120,204,226,.23)';c.lineWidth=1;c.stroke();
 }
 // Very sparse and quiet depth texture; these are ice layers, not data tracks.
 for(let j=0;j<9;j++){const y=-225+j*55;curve(c,Array.from({length:18},(_,i)=>project({x:-250+i*500/17,y:y+Math.sin(i*.32+j)*3,z:228},m)),COL.blue,.6,.15);}
 for(let j=0;j<55;j++){const p=project({x:(rand(j+4)-.5)*480,y:(rand(j+119)-.5)*470,z:(rand(j+911)-.5)*440},m);disc(c,p.x,p.y,.6+.4*p.s,COL.white,.07+.03*Math.sin(t*.25+j));}
 const center=project({x:0,y:0,z:0},m);halo(c,center.x,center.y,265*m.scale,'#157ca9',.08);
 c.restore();
}

/** A pressure sphere, steel equator and downward-looking photomultiplier.
 * Large inset only; the small array modules retain physical fixed positions. */
function domCloseup(c:CanvasRenderingContext2D,x:number,y:number,r:number,pulse:number,t:number){
 c.save();
 stroke(c,{x:x+7,y:y-r*1.65},{x:x+7,y:y+r*1.65},'#273f4c',5);
 stroke(c,{x:x+5,y:y-r*1.65},{x:x+5,y:y+r*1.65},'#aac3cd',1,.65);
 const g=c.createRadialGradient(x-r*.36,y-r*.45,r*.02,x,y,r);g.addColorStop(0,'rgba(177,218,227,.58)');g.addColorStop(.38,'rgba(45,82,101,.8)');g.addColorStop(.75,'rgba(7,24,35,.96)');g.addColorStop(1,'rgba(134,188,205,.66)');
 c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();
 // Copper-colored electronics sit above the downward-facing PMT.
 c.fillStyle='#6a665c';c.fillRect(x-r*.55,y-r*.5,r*1.1,r*.19);c.fillStyle='#304654';c.fillRect(x-r*.36,y-r*.64,r*.73,r*.14);
 for(let i=0;i<7;i++)stroke(c,{x:x-r*.48+i*r*.16,y:y-r*.53},{x:x-r*.48+i*r*.16,y:y-r*.27},'#c5b69a',1,.7);
 c.fillStyle='#0a151e';c.beginPath();c.moveTo(x-r*.2,y-r*.16);c.lineTo(x-r*.68,y+r*.45);c.bezierCurveTo(x-r*.52,y+r*.82,x+r*.52,y+r*.82,x+r*.68,y+r*.45);c.lineTo(x+r*.2,y-r*.16);c.closePath();c.fill();
 const pm=c.createLinearGradient(x,y,x,y+r*.75);pm.addColorStop(0,'#455c67');pm.addColorStop(.5,'#112936');pm.addColorStop(1,'#9bb8be');c.fillStyle=pm;c.beginPath();c.ellipse(x,y+r*.47,r*.64,r*.26,0,0,TAU);c.fill();
 c.strokeStyle='rgba(187,226,233,.6)';c.lineWidth=1.8;c.beginPath();c.ellipse(x,y+r*.46,r*.62,r*.245,0,0,TAU);c.stroke();
 c.strokeStyle='#77919b';c.lineWidth=r*.055;c.beginPath();c.ellipse(x,y,r*.975,r*.12,0,0,TAU);c.stroke();
 c.strokeStyle='rgba(236,250,248,.73)';c.lineWidth=r*.025;c.beginPath();c.arc(x-r*.015,y-r*.02,r*.91,-2.9,-1.2);c.stroke();
 c.strokeStyle='rgba(126,211,232,.46)';c.lineWidth=1.1;c.beginPath();c.arc(x,y,r,-.4,1.3);c.stroke();
 halo(c,x,y+r*.47,r*1.5,COL.cyan,pulse*.32);disc(c,x,y+r*.47,r*.11,COL.white,pulse*.72);
 for(let i=0;i<5;i++){const q=fract(t*.42+i*.2);stroke(c,{x:x-r*(.92+.4*q),y:y+r*(1.28-.67*q)},{x:x-r*(.92+.4*q)+12,y:y+r*(1.28-.67*q)-8},COL.cyan,1.5,pulse*(1-q)*.55);}
 c.restore();
}

function eventArrival(p:V3,kind:'track'|'cascade'){
 const speed=125,light=speed/1.3193;
 if(kind==='track'){
  const d=sub(p,TRACK_START),a=dot(d,AXIS),b=Math.sqrt(Math.max(0,dot(d,d)-a*a));
  // Earliest direct light from a finite muon track. This is the same
  // geometry used for the DOM intensity, exposed here so the timing ribbon
  // cannot drift away from the displayed detector response.
  const emission=clamp(a-b/Math.sqrt(1.3193**2-1),0,TRACK_LEN);
  const from=add(TRACK_START,mul(AXIS,emission));
  return emission/speed+len(sub(p,from))/light;
 }
 return len(sub(p,{x:0,y:0,z:0}))/light;
}
function eventHit(p:V3,time:number,kind:'track'|'cascade'){
 const age=time-eventArrival(p,kind);
 return age<0?0:Math.exp(-age*.9);
}

/** A compact readout of the same fixed DOMs used by eventHit(). It is a
 * teaching view of arrival order, not a fitted waveform: each bead is placed
 * by its calculated first-light arrival, then brightens as the event reaches
 * that time. Keeping it in a small strip makes the timing-to-direction link
 * legible while leaving the detector itself unobstructed. */
function arrivalRibbon(c:CanvasRenderingContext2D,time:number,alpha=1){
 const chosen=[4,11,19,27,34,42,50,58,66,74,81,85].map((string)=>MODULES[string*60+29]);
 const arrivals=chosen.map(p=>eventArrival(p,'track'));
 const lo=Math.min(...arrivals),hi=Math.max(...arrivals),span=Math.max(.001,hi-lo);
 const x0=174,x1=884,y=891;
 c.save();c.globalAlpha*=alpha;
 stroke(c,{x:x0,y},{x:x1,y},COL.muted,1,.42);
 for(let i=0;i<5;i++){
  const x=x0+(x1-x0)*i/4;stroke(c,{x,y:y-5},{x,y:y+5},COL.muted,1,.45);
 }
 text(c,'DOM 到达时间',x0,y-24,20,COL.muted,'left',.82);
 text(c,'先',x0-18,y,18,COL.muted,'right',.62);
 text(c,'后',x1+18,y,18,COL.muted,'left',.62);
 chosen.forEach((p,i)=>{
  const u=(arrivals[i]-lo)/span,x=x0+(x1-x0)*u,q=eventHit(p,time,'track');
  halo(c,x,y,10,COL.cyan,.12+.26*q);disc(c,x,y,2.8,COL.cyan,.24+.66*q);
  if(q>.22)stroke(c,{x,y:y-7},{x,y:y-18-16*q},COL.cyan,1.2,.30+.46*q);
 });
 const now=clamp((time-lo)/span);const sx=x0+(x1-x0)*now;
 stroke(c,{x:sx,y:y-13},{x:sx,y:y+13},COL.gold,1.8,.76);halo(c,sx,y,16,COL.gold,.10);
 c.restore();
}
function detector(c:CanvasRenderingContext2D,m:Cam,t:number,kind?:'track'|'cascade',eventTime=0){
 // Cables and modules sorted back to front; positions never follow the event.
 const strings=STRINGS.map((p,i)=>({p,i,z:project(p,m).z})).sort((a,b)=>b.z-a.z);
 for(const {p} of strings)line3(c,{...p,y:240},{...p,y:-237},m,'#99bfca',.65,.16);
 const nodes=MODULES.map(p=>({p,q:project(p,m)})).sort((a,b)=>b.q.z-a.q.z);
 for(const {p,q} of nodes){
  const hit=kind?eventHit(p,eventTime,kind):0;
  const alpha=clamp(.18+(220-q.z)/1400,.13,.51);
  const r=Math.max(.56,1.15*q.s);
  disc(c,q.x,q.y,r,hit>.05?COL.cyan:'#87bccb',alpha+hit*.6);
  if(hit>.25&&p.j%3===0){halo(c,q.x,q.y,7*q.s,COL.cyan,hit*.12);disc(c,q.x,q.y,1.2*q.s,COL.white,hit*.7);}
 }
 // Anchor spheres establish glass scale without claiming a different layout.
 for(const i of [3,14,24]){const p=MODULES[i*60+24],q=project(p,m);disc(c,q.x,q.y,2.5*q.s,'#8bb0b9',.7);disc(c,q.x-.65,q.y-.8,.55,COL.white,.8);}
}
function cone(c:CanvasRenderingContext2D,m:Cam,tip:V3,trailLength:number,alpha=.5,axis:V3=AXIS,speedRatio=1.3193){
 const halfAngle=Math.asin(1/speedRatio),radius=trailLength*Math.tan(halfAngle),base=add(tip,mul(axis,-trailLength));
 const u=norm(cross(axis,{x:0,y:1,z:0})),v=norm(cross(axis,u));
 const points=Array.from({length:65},(_,j)=>{const a=j/64*TAU;return add(base,add(mul(u,radius*Math.cos(a)),mul(v,radius*Math.sin(a))));});
 const tip2=project(tip,m);
 // Smooth filled shell, never the distracting radial spokes of a wire fan.
 c.save();c.globalAlpha*=alpha;c.fillStyle='rgba(95,218,250,.048)';
 for(let i=0;i<64;i++){const a=project(points[i],m),b=project(points[i+1],m);c.beginPath();c.moveTo(tip2.x,tip2.y);c.lineTo(a.x,a.y);c.lineTo(b.x,b.y);c.closePath();c.fill();}c.restore();
 ring3(c,base,u,v,radius,m,COL.cyan,alpha*.32,1.2);
 for(const angle of [0,Math.PI])line3(c,tip,add(base,mul(u,radius*Math.cos(angle))),m,COL.cyan,1.15,alpha*.6);
}
function chargedTrack(c:CanvasRenderingContext2D,m:Cam,eventTime:number,opacity=1){
 const distance=clamp(eventTime*125,0,TRACK_LEN),tip=add(TRACK_START,mul(AXIS,distance));
 const end=project(tip,m),begin=project(TRACK_START,m);
 c.save();c.globalAlpha*=opacity;
 stroke(c,begin,end,COL.cyan,8,.09);stroke(c,begin,end,COL.cyan,2.5,.73);stroke(c,begin,end,COL.white,.75,.95);
 cone(c,m,tip,Math.min(115,distance),.54);
 halo(c,end.x,end.y,24,COL.cyan,.28);disc(c,end.x,end.y,2.6,COL.white,.9);
 // Distinct photons depart from earlier positions at theta to the axis.
 const theta=Math.acos(1/1.3193);
 for(let j=0;j<16;j++){
  const emit=j*TRACK_LEN/19,age=eventTime-emit/125;if(age<0||age>1.8)continue;
  const a=j*2.39996,dir=add(mul(AXIS,Math.cos(theta)),add(mul(U,Math.sin(theta)*Math.cos(a)),mul(V,Math.sin(theta)*Math.sin(a))));
  const at=add(add(TRACK_START,mul(AXIS,emit)),mul(dir,age*125/1.3193)),q=project(at,m),prev=project(add(at,mul(dir,-11)),m);
  stroke(c,prev,q,COL.cyan,1.4,(1-age/1.8)*.6);disc(c,q.x,q.y,1.5,COL.white,(1-age/1.8)*.7);
 }
 c.restore();
}
function cascade(c:CanvasRenderingContext2D,m:Cam,t:number){
 const age=Math.max(0,t),growth=1-Math.exp(-age*2.5),fade=Math.exp(-Math.max(0,age-1)*.18);
 for(let j=0;j<44;j++){
  const az=rand(j+451)*TAU,z=rand(j+56)*2-1,r=Math.sqrt(1-z*z),d={x:r*Math.cos(az),y:z,z:r*Math.sin(az)};
  // 440 world units span 1 km. The shower itself stays below 10 m;
  // large expanding rings below represent propagating photons, not matter.
  const reach=(1.1+rand(j+356)*2.7)*growth,mid=mul(d,reach*.55),tip=add(mul(d,reach),{x:Math.sin(j)*.3,y:Math.cos(j*4)*.25,z:0});
  curve(c,[project({x:0,y:0,z:0},m),project(mid,m),project(tip,m)],j%7===0?COL.white:COL.cyan,1.1,fade*(.28+rand(j)*.45));
  const p=project(tip,m);disc(c,p.x,p.y,.8,COL.white,fade*.4);
 }
 const origin=project({x:0,y:0,z:0},m);halo(c,origin.x,origin.y,42,COL.cyan,.2*fade);disc(c,origin.x,origin.y,2.2,COL.white,.9*fade);
 // The shower is a local hadronic/electromagnetic deposit. Give the compact
 // origin a restrained principal-axis highlight so it reads as a real local
 // interaction rather than a second large detector-scale object. The larger
 // rings below remain optical wavefronts, not matter branches.
 const localAxis=norm({x:.38,y:-.82,z:.18}),localU=norm(cross(localAxis,{x:0,y:0,z:1})),localV=norm(cross(localAxis,localU));
 for(let k=0;k<3;k++){
  const rr=(1.1+k*.75)*growth;
  ring3(c,{x:0,y:0,z:0},localU,localV,rr,m,k===1?COL.gold:COL.cyan,fade*(.22-k*.04),1.1);
 }
 for(let j=0;j<12;j++){
  const ang=TAU*j/12+.16*Math.sin(j*3.1),reach=(1.5+1.8*rand(j+900))*growth;
  const dir=add(mul(localAxis,Math.cos(ang)*.55),add(mul(localU,Math.sin(ang)*.85),mul(localV,(rand(j+950)-.5)*.55)));
  const p=project(add({x:0,y:0,z:0},mul(norm(dir),reach)),m),q=fade*(.3+.5*growth);
  stroke(c,origin,p,COL.gold,.8,q*.36);disc(c,p.x,p.y,1.1,COL.white,q*.7);
 }
 // Screen-space visibility pass: this is a soft focal magnification of the
 // compact deposit, not a claim about its physical detector scale. The
 // principal axis follows the same local 3-D direction as the rings above.
 const axisP=project(add({x:0,y:0,z:0},mul(localAxis,8)),m),angle=Math.atan2(axisP.y-origin.y,axisP.x-origin.x);
 c.save();c.translate(origin.x,origin.y);c.rotate(angle);c.globalAlpha*=fade*growth*.48;
 for(let k=0;k<3;k++){
  const rx=19-k*4,ry=8-k*1.5;c.strokeStyle=k===1?COL.gold:COL.cyan;c.lineWidth=k===1?1.7:1;
  c.beginPath();c.ellipse(0,0,rx,ry,0,0,TAU);c.stroke();
 }
 c.restore();
 for(let j=0;j<3;j++){const r=(age-j*.4)*125/1.3193;if(r>0&&r<340){ring3(c,{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:1,z:0},r,m,COL.cyan,.16*(1-r/340),1.4);ring3(c,{x:0,y:0,z:0},{x:1,y:0,z:0},{x:0,y:0,z:1},r,m,COL.cyan,.09*(1-r/340));}}
}
function depthScale(c:CanvasRenderingContext2D,m:Cam){
 const a=project({x:-288,y:220,z:228},m),b=project({x:-288,y:-220,z:228},m);stroke(c,a,b,COL.muted,1.2,.75);
 for(let j=0;j<=4;j++){const p=project({x:-288,y:220-j*110,z:228},m);stroke(c,{x:p.x-6,y:p.y},{x:p.x+6,y:p.y},COL.muted,1.2,.8);if(j===0||j===4)text(c,`${1450+j*250} m`,Math.max(128,p.x-110),p.y-19,22,COL.muted,'left');}
}
function smallLegend(c:CanvasRenderingContext2D,x:number,y:number){
 text(c,'86 条探测器串',x,y,27);text(c,'60 个光学模块 / 串',x,y+38,24,COL.muted);
}
function detectorScene(c:CanvasRenderingContext2D,clip:string,e:number,t:number){
 const zoom=clip==='005'?smooth((e-6.85)/1.65):clip==='006'?smooth((e-10.397)/1.4):0;
 const m=camera(mix(527,360,zoom),606,t,mix(.72,.55,zoom));
 iceVolume(c,m,t);
 const eventTime=clip==='008'?(e*.54):clip==='009'?(e*.45):Math.max(0,(e-3)*.56);
 const eventKind=clip==='009'?'cascade':(clip==='006'||clip==='008'||clip==='016')?'track':undefined;
 detector(c,m,t,eventKind,eventTime);
 if(eventKind==='track')chargedTrack(c,m,eventTime,clip==='016'?.8:1);
 if(eventKind==='cascade')cascade(c,m,eventTime);
 if(clip==='004'){
  // A bore hole descends visibly into the same fixed detector geometry.
  const descend=smooth(e/8),a=project({x:-35,y:290,z:10},m),b=project({x:-35,y:290-535*descend,z:10},m);
  stroke(c,a,b,COL.white,5,.3);stroke(c,a,b,COL.cyan,1.8,.7);halo(c,b.x,b.y,21,COL.cyan,.2);
  text(c,'让深冰成为探测介质',527,851,30,COL.white,'center');
 }else if(clip==='005'){
  c.save();c.globalAlpha*=1-zoom;depthScale(c,m);c.restore();
  domCloseup(c,mix(920,800,zoom),mix(588,590,zoom),mix(65,135,zoom),.25+.15*Math.sin(e),e);
  text(c,'朝下的光电倍增管',mix(917,800,zoom),mix(707,806,zoom),mix(25,28,zoom),COL.white,'center');
  text(c,'近 1 km³ 的深冰',mix(527,360,zoom),850,28,COL.white,'center');
 }else if(clip==='006'){
  const incoming=project(add(TRACK_START,mul(AXIS,-190)),m),at=project(TRACK_START,m),u=smooth(e/3);
  c.save();c.setLineDash([5,12]);stroke(c,incoming,{x:mix(incoming.x,at.x,u),y:mix(incoming.y,at.y,u)},COL.muted,1.6,.6);c.restore();
  text(c,'νμ',incoming.x-7,incoming.y-21,27,COL.muted,'left',1-zoom);if(e>3)text(c,'μ',at.x+60,at.y+45,30,COL.cyan,'left',1-zoom);
  domCloseup(c,mix(915,800,zoom),mix(584,590,zoom),mix(68,135,zoom),Math.max(eventHit({x:150,y:10,z:0},eventTime,'track'),zoom*(.34+.22*Math.sin(e*3))),e);
  text(c,'到达时间 · 亮度',mix(906,800,zoom),mix(712,806,zoom),mix(23,29,zoom),COL.white,'center');
  text(c,'碰撞 → 带电次级粒子 → 蓝光',527,850,28,COL.white,'center',1-zoom);
 }else if(clip==='008'){
  const p=project(TRACK_START,m);text(c,'μ 子径迹',p.x-4,p.y-36,27,COL.white);
  arrivalRibbon(c,eventTime,.92);
  text(c,'光学模块依次记录到达的光',527,850,28,COL.white,'center');
 }else if(clip==='009'){
  text(c,'能量沉积集中在碰撞点附近',527,850,28,COL.white,'center');
 }else if(clip==='016'){
  text(c,'用到达时间追溯宇宙方向',527,850,28,COL.white,'center');
 }
}

export function drawEarthGlobeV11(c:CanvasRenderingContext2D,x:number,y:number,r:number,t:number){
 c.save();const g=c.createRadialGradient(x-r*.4,y-r*.42,r*.05,x,y,r);g.addColorStop(0,'#457685');g.addColorStop(.35,'#1c5268');g.addColorStop(.72,'#123047');g.addColorStop(1,'#030e1b');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.save();c.beginPath();c.arc(x,y,r*.987,0,TAU);c.clip();
 for(let j=0;j<28;j++){const lat=-Math.PI/2+j*Math.PI/27,y1=y+Math.sin(lat)*r,rx=Math.cos(lat)*r;c.strokeStyle='rgba(133,189,199,.075)';c.lineWidth=1;c.beginPath();c.ellipse(x,y1,rx,rx*.14,0,0,TAU);c.stroke();}
 // Simplified geographic coastlines in longitude/latitude, projected onto
 // the sphere. They preserve continental shapes instead of floating blobs.
 const land:number[][][]=[
  [[-17,35],[-5,36],[10,37],[24,32],[33,31],[35,22],[43,12],[51,11],[43,-2],[40,-12],[33,-22],[25,-34],[17,-35],[11,-22],[11,-7],[8,4],[-1,5],[-10,6],[-17,15],[-17,25]],
  [[-10,36],[-10,44],[-6,50],[-3,58],[7,58],[15,70],[29,71],[35,64],[47,68],[60,72],[95,73],[135,67],[162,61],[180,66],[179,52],[155,49],[144,42],[135,34],[127,38],[122,30],[118,23],[109,19],[108,8],[104,1],[99,7],[97,19],[88,21],[80,9],[73,15],[68,25],[58,24],[52,30],[44,13],[39,16],[34,29],[28,41],[22,39],[17,43],[10,44],[3,42],[-1,36]],
  [[-168,70],[-148,71],[-139,62],[-126,69],[-110,73],[-90,70],[-74,60],[-58,53],[-62,47],[-72,44],[-79,33],[-80,26],[-89,29],[-97,23],[-87,16],[-82,9],[-88,13],[-104,20],[-114,30],[-122,38],[-126,48],[-137,58],[-155,58],[-168,62]],
  [[-81,12],[-72,11],[-63,9],[-52,4],[-48,-4],[-35,-8],[-40,-21],[-49,-30],[-59,-40],[-68,-55],[-75,-48],[-73,-33],[-76,-18],[-81,-5]],
  [[-52,60],[-43,60],[-20,72],[-27,82],[-49,83],[-63,77],[-59,67]],
  [[113,-22],[122,-15],[131,-12],[139,-17],[146,-13],[153,-25],[150,-37],[140,-40],[130,-33],[118,-35],[113,-28]],
  [[-180,-72],[-120,-73],[-65,-64],[-56,-72],[-10,-70],[40,-68],[90,-67],[135,-69],[180,-72],[180,-90],[-180,-90]],
 ];
 const longitude=(16+t*.11)*Math.PI/180;
 for(let k=0;k<land.length;k++){
  const coast=land[k],pts:{x:number;y:number}[]=[];
  for(let j=0;j<coast.length;j++){const a=coast[j],b=coast[(j+1)%coast.length];for(let step=0;step<5;step++){
   const lon=mix(a[0],b[0],step/5)*Math.PI/180-longitude,lat=mix(a[1],b[1],step/5)*Math.PI/180,z=Math.cos(lat)*Math.cos(lon);
   if(z>=-.015)pts.push({x:x+r*Math.cos(lat)*Math.sin(lon),y:y-r*Math.sin(lat)});
  }}
  if(pts.length>3)curve(c,pts,'rgba(174,196,175,.23)',.7,1,true,k===6?'rgba(186,215,217,.36)':'rgba(112,144,130,.35)');
 }
 c.restore();c.strokeStyle='rgba(150,224,238,.64)';c.lineWidth=1.6;c.beginPath();c.arc(x,y,r,-2.6,-.3);c.stroke();c.strokeStyle='rgba(74,163,206,.17)';c.lineWidth=9;c.beginPath();c.arc(x,y,r+3,0,TAU);c.stroke();c.restore();
}
function hook(c:CanvasRenderingContext2D,e:number,t:number){
 drawEarthGlobeV11(c,470,606,205,t);const reveal=smooth((e-5.5)/3),m=camera(1295,615,t,.74);
 c.save();c.globalAlpha*=.3+.7*reveal;iceVolume(c,m,t);detector(c,m,t,e>7?'track':undefined,Math.max(0,e-7)*.9);if(e>7)chargedTrack(c,m,(e-7)*.9);c.restore();
 const x=mix(175,1010,clamp(e/7));stroke(c,{x:175,y:683},{x,y:683-(x-175)*.165},COL.muted,1,.35);disc(c,x,683-(x-175)*.165,3,COL.white,.85);halo(c,x,683-(x-175)*.165,25,COL.cyan,.13);
 text(c,'几乎不与物质碰撞',470,868,29,COL.white,'center');text(c,'在深冰里寻找一次回应',1295,868,29,COL.white,'center',.3+.7*reveal);
}
function award(c:CanvasRenderingContext2D,e:number,t:number){
 const m=camera(1160,614,t,.74);iceVolume(c,m,t);detector(c,m,t,'track',e*.5);chargedTrack(c,m,e*.5,.75);
 text(c,'南极深冰',340,515,45,COL.white);text(c,'成为面向宇宙的望远镜',340,581,34,COL.muted);smallLegend(c,340,694);
 const end=project({x:0,y:260,z:0},m);for(let j=0;j<5;j++){const q=fract(e*.09+j/5),a={x:1530+130*Math.sin(j),y:330+j*35},b={x:mix(a.x,end.x,q),y:mix(a.y,end.y,q)};stroke(c,a,end,COL.cyan,.7,.12);disc(c,b.x,b.y,2,COL.cyan,.36);}
}

/** Wavefront envelope and photon direction use DIFFERENT physical angles:
 * trailing wavefront alpha = asin(1/(beta*n)); photon theta = acos(...). */
function aircraft(c:CanvasRenderingContext2D,p:P2,angle:number,opacity:number){
 c.save();c.globalAlpha*=opacity;c.translate(p.x,p.y);c.rotate(angle);c.scale(1.18,1.18);
 const outline=[{x:66,y:0},{x:39,y:-7},{x:13,y:-9},{x:-17,y:-51},{x:-32,y:-51},{x:-21,y:-10},{x:-43,y:-7},{x:-55,y:-23},{x:-64,y:-23},{x:-57,y:0},{x:-64,y:23},{x:-55,y:23},{x:-43,y:7},{x:-21,y:10},{x:-32,y:51},{x:-17,y:51},{x:13,y:9},{x:39,y:7}];
 c.save();c.translate(0,4);curve(c,outline,'#0b1d2a',1,1,true,'#102939');c.restore();
 const g=c.createLinearGradient(0,-54,0,54);g.addColorStop(0,'#607c8b');g.addColorStop(.37,'#d5e1e3');g.addColorStop(.52,'#f0f5f0');g.addColorStop(.66,'#668391');g.addColorStop(1,'#253d4d');c.fillStyle=g;c.beginPath();c.moveTo(outline[0].x,outline[0].y);for(const q of outline.slice(1))c.lineTo(q.x,q.y);c.closePath();c.fill();
 c.fillStyle='#14364b';c.beginPath();c.ellipse(25,0,17,5.5,0,0,TAU);c.fill();stroke(c,{x:-41,y:0},{x:9,y:0},COL.white,.8,.58);stroke(c,{x:-14,y:-43},{x:7,y:-9},COL.white,.65,.45);stroke(c,{x:-14,y:43},{x:7,y:9},COL.white,.65,.45);c.restore();
}
/** One laboratory trajectory for charge, emission history and follow camera.
 * Integral of smoothstep is u^3-u^4/2 on [0,1], continued with unit slope.
 * Thus d(position)/dt is exactly beta(t)*c throughout the acceleration. */
function formulaBetaAtV11(time:number){return mix(.68,.995,smooth((time-7.321)/1.1));}
function formulaChargeXV11(time:number){
 const u=(time-7.321)/1.1;
 const integral=u<=0?0:u>=1?u-.5:u*u*u-.5*u*u*u*u;
 return 81+105*(.68*(time-4)+(.995-.68)*1.1*integral);
}
function formula(c:CanvasRenderingContext2D,e:number,t:number){
 const n=1.3193,lightSpeed=105/n;
 const tip:V3={x:formulaChargeXV11(e),y:0,z:0};
 // The laboratory origin follows the charge. Every ice reference, wavefront,
 // emitted photon and particle is transformed through this SAME camera.
 const follow=tip.x-(45+Math.min(e,13.68)*9);
 const m:Cam={cx:611,cy:598,scale:1.16,yaw:-.14+Math.sin(t*.027)*.025,pitch:.09,origin:{x:follow,y:0,z:0}};
 const axis:V3={x:1,y:0,z:0},vertical:V3={x:0,y:1,z:0},depth:V3={x:0,y:0,z:1};
 const material=smooth((e-3.55)/.85);
 const p=project(tip,m),start=project({x:-310,y:0,z:0},m),ahead=project(add(tip,mul(axis,145)),m);
 c.save();c.beginPath();c.rect(120,330,950,550);c.clip();
 // A long piece of stationary ice rather than a cube attached to the camera.
 // Subtle fixed strata and inclusions make the camera's tracking observable.
 c.save();c.globalAlpha*=material;
 const slab=[{x:-430,y:150,z:-115},{x:1650,y:150,z:-115},{x:1650,y:-150,z:-115},{x:-430,y:-150,z:-115},{x:-430,y:150,z:115},{x:1650,y:150,z:115},{x:1650,y:-150,z:115},{x:-430,y:-150,z:115}];
 for(const face of [[0,1,5,4],[0,1,2,3],[4,5,6,7]]){
  curve(c,face.map(i=>project(slab[i],m)),'rgba(127,205,225,.14)',.7,1,true,'rgba(17,91,129,.045)');
 }
 for(let j=0;j<5;j++)line3(c,{x:-430,y:-116+j*58,z:115},{x:1650,y:-116+j*58,z:115},m,COL.blue,.7,.11);
 for(let j=0;j<22;j++){
  const fixed={x:-330+j*91,y:(rand(j+640)-.5)*240,z:(rand(j+781)-.5)*210},q=project(fixed,m);
  disc(c,q.x,q.y,1.15,COL.white,.11);line3(c,add(fixed,{x:-11,y:0,z:0}),add(fixed,{x:11,y:0,z:0}),m,COL.muted,.7,.10);
 }
 c.restore();
 stroke(c,start,p,COL.white,1.8,.6);arrow(c,p,ahead,COL.white,1.7,.68);
 if(material<1){
  c.save();c.globalAlpha*=1-material;
  const airHistory=Math.min(2.7,e+1.2),airExtent=(.68*105)*airHistory*(1-1/1.6**2);
  cone(c,m,tip,airExtent,.68,axis,1.6);
  for(let j=0;j<27;j++){const emitted=-1.2+j*.22,age=e-emitted;if(age<=0||age>2.7)continue;
   const center={x:formulaChargeXV11(emitted),y:0,z:0},radius=age*(.68*105/1.6);
   ring3(c,center,axis,vertical,radius,m,COL.white,Math.sin(age/2.7*Math.PI)*.16,1.2);
  }
  aircraft(c,p,Math.atan2(ahead.y-p.y,ahead.x-p.x),1);
  text(c,'飞机超过声速，波前形成音爆锥',630,846,32,COL.white,'center',1-smooth((e-3.4)/.3));
  c.restore();
 }
 if(material>0){
  c.save();c.globalAlpha*=material;
  const beta=formulaBetaAtV11(e),ratio=beta*n;
  // Finite history: every expanding wavefront remains centered where the
  // moving charge was when it was emitted, even while the speed changes.
  for(let j=0;j<37;j++){
   const emitted=4+j*.28,age=e-emitted;if(age<=0||age>2.55)continue;
   const center={x:formulaChargeXV11(emitted),y:0,z:0},radius=age*lightSpeed,opacity=Math.sin(age/2.55*Math.PI)*.24;
   ring3(c,center,axis,vertical,radius,m,COL.cyan,opacity,1.3);
   ring3(c,center,axis,depth,radius,m,COL.cyan,opacity*.42,1);
  }
  if(e>8.421){
   // Only the constant-speed portion has a straight Mach envelope. During
   // acceleration the historical spherical fronts themselves show its shape.
   const steadySpeed=.995*105,steadyRatio=.995*n,history=Math.min(2.55,e-8.421);
   const extent=history*(steadySpeed-lightSpeed*lightSpeed/steadySpeed);
   if(extent>0)cone(c,m,tip,extent,.72*smooth((e-8.421)/.7),axis,steadyRatio);
  }
  halo(c,p.x,p.y,29,COL.cyan,.34);disc(c,p.x,p.y,4,COL.white,.96);
  text(c,'带电粒子',p.x,p.y-54,29,COL.white,'center',smooth((e-4.05)/.3));
  const established=smooth((e-8.25)/.8);
  if(established>0){
   c.save();c.globalAlpha*=established;
   const theta=Math.acos(1/ratio),direction=add(mul(axis,Math.cos(theta)),mul(vertical,-Math.sin(theta))),end=add(tip,mul(direction,236));
   arrow(c,p,project(end,m),COL.gold,2.3,.9);
   curve(c,Array.from({length:25},(_,j)=>{const a=theta*j/24;return project(add(tip,add(mul(axis,Math.cos(a)*51),mul(vertical,-Math.sin(a)*51))),m);}),COL.gold,1.35,.8);
   for(let j=0;j<24;j++){
    const emitted=8.25+j*.26,age=e-emitted;if(age<=0||age>2.3)continue;
    const emittedTheta=Math.acos(1/(formulaBetaAtV11(emitted)*n));
    const origin={x:formulaChargeXV11(emitted),y:0,z:0},dir=add(mul(axis,Math.cos(emittedTheta)),mul(vertical,-Math.sin(emittedTheta)));
    const location=add(origin,mul(dir,age*lightSpeed)),photon=project(location,m),fade=Math.sin(age/2.3*Math.PI);
    line3(c,origin,location,m,COL.gold,1,.20*fade);disc(c,photon.x,photon.y,2.4,COL.white,.86*fade);halo(c,photon.x,photon.y,12,COL.gold,.13*fade);
   }
   c.restore();
   text(c,`光子出射角 ≈ ${Math.round(theta*180/Math.PI)}°`,792,845,29,COL.gold,'center',smooth((e-8.36)/.35));
  }
  // Keep complete captions at stable coordinates, with a clean handoff.
  text(c,ratio<=1?'粒子仍在波前之内':'粒子越过冰中光速，波前叠成锥面',527,846,ratio<=1?30:27,COL.white,'center',smooth((e-4.05)/.3)*(1-smooth((e-8.05)/.24)));
  c.restore();
 }
 c.restore();
 if(material<1){c.save();c.globalAlpha*=1-material;text(c,'传播速度',1370,616,32,COL.muted,'center');text(c,'声波追不上飞机',1370,678,34,COL.white,'center');c.restore();}
 // Right-side LaTeX reserve: x1250–1570, y420–550, intentionally empty.
 if(material>0){
  c.save();c.globalAlpha*=material;
  const compare=smooth((e-9.8)/.85);c.save();c.globalAlpha*=compare;
  text(c,'同一时刻发出的光',1420,595,29,COL.white,'center');
  const x0=1238,x1=1650,span=x1-x0,travel=fract((e-9.8)*.26),fade=smooth(travel/.08)*smooth((1-travel)/.1);
  for(const [yy,label,rate,color]of [[670,'真空',1,COL.white],[746,'冰中',1/n,COL.cyan]] as [number,string,number,string][]){
   text(c,label,1207,yy,26,COL.muted,'right');stroke(c,{x:x0,y:yy},{x:x1,y:yy},COL.muted,1,.28);
   stroke(c,{x:x0,y:yy},{x:x0+span*travel*rate,y:yy},color,2,.55*fade);halo(c,x0+span*travel*rate,yy,17,color,.22*fade);disc(c,x0+span*travel*rate,yy,4,color,fade);
  }
  text(c,'n 让光在冰里传播得更慢',1420,834,29,COL.white,'center');c.restore();
  c.restore();
 }
}

function background(c:CanvasRenderingContext2D,e:number,t:number){
 drawEarthGlobeV11(c,529,609,211,t);
 text(c,'地球吸收来自下方的大气 μ 子',529,875,28,COL.white,'center');
 const m=camera(1356,614,t,.73);iceVolume(c,m,t,.9);detector(c,m,t,'track',Math.max(0,e-5)*.61);
 if(e>5)chargedTrack(c,m,(e-5)*.61,.8);
 const detectorPos={x:543,y:410};disc(c,detectorPos.x,detectorPos.y,6,COL.gold,.9);halo(c,detectorPos.x,detectorPos.y,28,COL.gold,.22);
 for(let j=0;j<11;j++){
  const a={x:330+j*37,y:337},b={x:a.x+30,y:510};const q=fract(e*.22+j*.083);stroke(c,a,b,COL.rose,1.4,.16);disc(c,mix(a.x,b.x,q),mix(a.y,b.y,q),2,COL.rose,(1-q)*.7);
 }
 const a={x:378,y:830},b={x:543,y:410};c.save();c.setLineDash([3,10]);stroke(c,a,b,COL.cyan,1.4,.56);c.restore();const q=fract(e*.115);disc(c,mix(a.x,b.x,q),mix(a.y,b.y,q),3,COL.white,.9);
 text(c,'μ',756,467,31,COL.rose);text(c,'ν',348,809,33,COL.cyan);
 text(c,'方向  ·  能量  ·  时间',1356,875,28,COL.white,'center');
}

function drill(c:CanvasRenderingContext2D,x:number,y:number,e:number){
 // Physical ice cross-section and heated drill head.
 const g=c.createLinearGradient(x-140,y-190,x+160,y+160);g.addColorStop(0,'rgba(150,209,220,.27)');g.addColorStop(.4,'rgba(22,100,147,.26)');g.addColorStop(1,'rgba(7,33,54,.55)');c.fillStyle=g;c.fillRect(x-146,y-178,292,348);
 for(let j=0;j<8;j++)stroke(c,{x:x-146,y:y-168+j*44},{x:x+146,y:y-155+j*44},COL.muted,.7,.18);
 const down=y-115+smooth(clamp(e/8))*220;c.fillStyle='rgba(5,21,32,.9)';c.fillRect(x-16,y-187,32,down-y+187);stroke(c,{x,y:y-195},{x,y:down},'#7d9ba6',5,.9);c.fillStyle='#bdc2bb';c.fillRect(x-13,down-28,26,42);halo(c,x,down+12,24,COL.cyan,.33);
 for(let j=0;j<8;j++){const q=fract(e*.7+j/8);disc(c,x+(rand(j)-.5)*35,down+q*34,1.4,COL.white,.45*(1-q));}
}
function engineering(c:CanvasRenderingContext2D,e:number,t:number){
 const stage=clamp(e/14.64)*3.7;
 drill(c,339,609,e);
 const m=camera(797,610,t,.66);iceVolume(c,m,t,.85);detector(c,m,t,stage>1?'track':undefined,Math.max(0,e-4)*.55);if(stage>1)chargedTrack(c,m,(e-4)*.55,.7);
 domCloseup(c,1270,554,91,.35+.25*Math.sin(e*1.6),e);
 // Calibrated light pulses become a time trace, then a selected event.
 const baseline={x:1156,y:742};stroke(c,baseline,{x:1615,y:742},COL.muted,1,.4);
 const wave=Array.from({length:161},(_,i)=>{const z=i/160;let h=0;for(let j=0;j<4;j++){const mu=.18+j*.205;h+=(32+j*8)*Math.exp(-(((z-mu)/.018)**2));}return{x:baseline.x+z*450,y:742-h*(.55+.45*smooth((e-6)/4))};});curve(c,wave,COL.cyan,2,.9);
 const scan=fract(e*.1);stroke(c,{x:1156+scan*450,y:681},{x:1156+scan*450,y:755},COL.gold,1.1,.45);
 for(const p of [{x:339,s:'钻孔'},{x:797,s:'布线'},{x:1270,s:'校准与数据筛选'}])text(c,p.s,p.x,853,29,COL.white,'center');
 for(const [a,b]of [[493,580],[1020,1116]])arrow(c,{x:a,y:621},{x:b,y:621},COL.muted,1.4,.35);
}
function limits(c:CanvasRenderingContext2D,e:number,t:number){
 const left=camera(532,610,t,.71),right=camera(1321,610,t,.71);iceVolume(c,left,t,.85);iceVolume(c,right,t,.85);
 detector(c,left,t,'track',e*.5);chargedTrack(c,left,e*.5,.9);detector(c,right,t,'cascade',e*.44);cascade(c,right,e*.44);
 // Direction uncertainty is conveyed spatially; no invented measured angle.
 const origin={x:0,y:0,z:0};
 for(const [m,width]of [[left,.09],[right,.35]] as [Cam,number][]){
  const center=project(origin,m),back=project(mul(AXIS,-330),m);
  const dx=back.x-center.x,dy=back.y-center.y,norm2=Math.hypot(dx,dy)||1;
  const ux=dx/norm2,uy=dy/norm2,spread=245*width;
  const base={x:center.x+ux*252,y:center.y+uy*252};
  curve(c,[center,{x:base.x-uy*spread,y:base.y+ux*spread},{x:base.x+uy*spread,y:base.y-ux*spread}],COL.gold,1,.35,true,'rgba(231,189,119,.08)');
 }
 text(c,'track：长径迹约束方向',532,853,29,COL.white,'center');text(c,'cascade：局部能量沉积',1321,853,29,COL.white,'center');
}

/** Called in film coordinates, outside any legacy stage transform. */
export function drawDetectorSceneV11(c:CanvasRenderingContext2D,clipId:string,elapsed:number,absoluteTime:number):boolean{
 const handled=['000','001','004','005','006','007','008','009','010','013','015','016'];
 if(!handled.includes(clipId))return false;
 c.save();
 // A hard safe-region clip is only an emergency guard; geometry stays inside.
 c.beginPath();c.rect(104,314,['004','005','006','008','009','016'].includes(clipId)?925:1715,586);c.clip();
 if(clipId==='000')hook(c,elapsed,absoluteTime);
 else if(clipId==='001')award(c,elapsed,absoluteTime);
 else if(clipId==='007')formula(c,elapsed,absoluteTime);
 else if(clipId==='010')background(c,elapsed,absoluteTime);
 else if(clipId==='013')engineering(c,elapsed,absoluteTime);
 else if(clipId==='015')limits(c,elapsed,absoluteTime);
 else detectorScene(c,clipId,elapsed,absoluteTime);
 c.restore();return true;
}
