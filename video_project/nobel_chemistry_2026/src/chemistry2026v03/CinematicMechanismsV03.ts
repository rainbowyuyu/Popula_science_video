import * as M from './ChemistryMechanismsV03';
type Ctx=CanvasRenderingContext2D;
type V3=[number,number,number];
type P3={x:number;y:number;z:number;s:number};
const {C,ease,mix,sat,text,path,ball,cylinder,halo,cubic,pairBar,glass}=M;
const TAU=Math.PI*2;
const phase=(p:number,a:number,b:number)=>ease((p-a)/(b-a));
const TET:V3[]=[[1,1,1],[1,-1,-1],[-1,1,-1],[-1,-1,1]];
function proj(v:V3,x:number,y:number,scale:number,angle:number,tilt=-.2):P3{
 const rx=v[0]*Math.cos(angle)+v[2]*Math.sin(angle),rz=-v[0]*Math.sin(angle)+v[2]*Math.cos(angle);
 const ry=v[1]*Math.cos(tilt)-rz*Math.sin(tilt),zz=v[1]*Math.sin(tilt)+rz*Math.cos(tilt),k=7/(7+zz);
 return{x:x+rx*scale*k,y:y+ry*scale*k,z:zz,s:k};
}
function shadow(c:Ctx,x:number,y:number,w:number,h:number,alpha=.16){c.save();c.globalAlpha*=alpha;const g=c.createRadialGradient(x,y,2,x,y,w);g.addColorStop(0,'#00060b');g.addColorStop(1,'transparent');c.fillStyle=g;c.translate(x,y);c.scale(1,h/w);c.beginPath();c.arc(0,0,w,0,TAU);c.fill();c.restore();}

/** Abstract, explicitly color-coded ligand marker. It is not a chemical structure. */
function ligand(c:Ctx,x:number,y:number,s:number,hand:1|-1,t:number,alpha=1){
 c.save();c.globalAlpha*=alpha;
 const angle=.43+.08*Math.sin(t*.12),color=hand>0?C.gold:C.cyan;
 halo(c,x,y,s*2.1,color,.08);
 const nodes=TET.map((v,i)=>proj([v[0]*hand,v[1],v[2]],x,y,s,angle));
 const draw:Array<{z:number;fn:()=>void}>=[];
 const colors=[C.ink,C.gold,C.rose,C.cyan],radii=[.23,.18,.14,.2];
 nodes.forEach((n,i)=>{draw.push({z:n.z*.5,fn:()=>cylinder(c,[x,y],[n.x,n.y],Math.max(1.4,s*.105),C.muted)});draw.push({z:n.z,fn:()=>ball(c,n.x,n.y,s*radii[i]*n.s,colors[i])});});
 draw.push({z:0,fn:()=>ball(c,x,y,s*.25,color)});draw.sort((a,b)=>b.z-a.z).forEach(d=>d.fn());c.restore();
}
function complex(c:Ctx,x:number,y:number,s:number,type:'RR'|'RS'|'SS',t:number,alpha=1,spread=1){
 c.save();c.globalAlpha*=alpha;const tilt=.12*Math.sin(t*.07);const a:M.V2=[x-66*s*spread,y-13*s],b:M.V2=[x+66*s*spread,y+13*s];
 shadow(c,x,y+56*s,95*s,18*s,.25);cylinder(c,a,[x,y],7*s,C.violet);cylinder(c,[x,y],b,7*s,C.violet);
 ligand(c,a[0],a[1],22*s,type==='SS'?-1:1,t+tilt);ligand(c,b[0],b[1],22*s,type==='RR'?1:-1,t-tilt);
 ball(c,x,y,19*s,C.violet);text(c,'M',x,y+1,17*s,C.dark,'center',650);c.restore();
}
function bezierToken(c:Ctx,points:M.V2[],u:number,size:number,hand:1|-1,t:number,alpha=1){const q=cubic(points,sat(u));ligand(c,q[0],q[1],size,hand,t,alpha);}
function lineTrail(c:Ctx,points:M.V2[],end:number,col:string,opacity=.18){path(c,Array.from({length:45},(_,i)=>cubic(points,sat(end)*i/44)),col,1.8,opacity);}
function vessel(c:Ctx,x:number,y:number,w:number,h:number,amount:number,col:string=C.gold){
 glass(c,x,y,w,h,amount,col);const top=y-h;c.save();c.fillStyle='#172e38';c.strokeStyle='#91a8ad';c.lineWidth=1.3;c.beginPath();c.roundRect(x-w*.53,top-13,w*1.06,22,6);c.fill();c.stroke();c.fillStyle='#8d9693';c.beginPath();c.ellipse(x,top-12,w*.3,5,0,0,TAU);c.fill();c.restore();
}

const DEST=[{x:875,y:478,type:'RR' as const,ratio:.5625,col:C.gold},{x:875,y:640,type:'RS' as const,ratio:.375,col:C.muted},{x:875,y:802,type:'SS' as const,ratio:.0625,col:C.cyan}];
function poolPoint(i:number):M.V2{return[200+(i%6)*62,435+Math.floor(i/6)*65];}

/** Persistent ligand pool feeds three complexes; no four-molecule finite-pool claim. */
export function kaganV02(c:Ctx,t:number,p:number){
 text(c,'大配体池',340,363,29,C.ink,'center');text(c,'两两配位',875,363,29,C.ink,'center');text(c,'组合的比例',1395,363,29,C.ink,'center');
 for(let i=0;i<36;i++){const a=poolPoint(i);const z=Math.sin(i*.9+t*.08)*3;ligand(c,a[0],a[1]+z,15,i<27?1:-1,t+i,.68);}
 pairBar(c,185,853,310,14,.75,false);text(c,'R 75%   S 25%',340,809,27,C.ink,'center');
 const sourceIndices=[[8,10],[20,30],[29,34]];
 DEST.forEach((d,k)=>{
  const load=phase(p,.16+k*.12,.38+k*.12),entered=phase(p,.3+k*.12,.39+k*.12),a=sourceIndices[k].map(poolPoint);
  const left:M.V2=[d.x-92,d.y-17],right:M.V2=[d.x+92,d.y+17];
  const handles:M.V2[][]=[[a[0],[610,a[0][1]-45],[710,d.y-110],left],[a[1],[620,a[1][1]+35],[1000,d.y-70],right]];
  shadow(c,d.x,d.y+70,120,16,.2);
  handles.forEach((track,j)=>{lineTrail(c,track,load,j===0?(k===2?C.cyan:C.gold):(k===0?C.gold:C.cyan),.16*(1-entered));const q=cubic(track,load);c.save();c.globalAlpha*=phase(p,.11+k*.12,.2+k*.12);cylinder(c,[mix(q[0],d.x,1-entered),mix(q[1],d.y,1-entered)],[d.x,d.y],8,C.violet);c.restore();bezierToken(c,track,load,29,(j===0?k===2:k!==0)?-1:1,t,phase(p,.1+k*.12,.16+k*.12));});
  ball(c,d.x,d.y,25,C.violet);text(c,'M',d.x,d.y,23,C.dark,'center',650);
  c.save();c.globalAlpha*=entered;text(c,d.type,1100,d.y-5,29,d.col,'center',650);const width=290*d.ratio/.5625;pairBar(c,1220,d.y-10,width,20,k===2?0:k===0?1:.5,false);text(c,`${(d.ratio*100).toFixed(2)}%`,1730,d.y,32,d.col,'right',650);c.restore();
 });
 const reveal=phase(p,.77,.9);c.save();c.globalAlpha*=reveal;path(c,[[1180,616],[1180,669]],C.muted,2,.6);text(c,'混合配对',1395,702,26,C.muted,'center');c.restore();
}

/** Exact 16 equally weighted combination cells become ten active cells: 9 R + 1 S. */
export function nonlinearV02(c:Ctx,t:number,p:number,events={ratio:5,ee:9,result:15}){
 const filter=phase(p,.02,.3),pack=phase(p,.22,.47),eePhase=phase(p,.47,.7),graphPhase=phase(p,.82,.95);
 const categories=Array.from({length:16},(_,i)=>i<9?'RR':i<15?'RS':'SS');
 c.save();c.globalAlpha*=1-eePhase;text(c,'配位组合',410,365,29,C.ink,'center');c.restore();
 categories.forEach((type,i)=>{
  const sx=205+i%4*133,sy=470+Math.floor(i/4)*94;
  const active=type!=='RS',rank=i===15?9:i;
  const tx=active?1000+(rank%5)*146:sx,ty=active?512+Math.floor(rank/5)*159:sy+44;
  const x=mix(sx,tx,pack),y=mix(sy,ty,pack),alpha=active?1:(1-filter*.82)*(1-eePhase);
  complex(c,x,y,mix(.43,.58,pack),type as 'RR'|'RS'|'SS',t,alpha);
  if(!active){c.save();c.globalAlpha*=filter*.9*(1-eePhase);path(c,[[x-38,y+29],[x+38,y+29]],C.rose,2,.8);c.restore();}
 });
 c.save();c.globalAlpha*=filter*(1-pack);text(c,'RS 通路关闭',413,858,28,C.muted,'center');c.restore();
 c.save();c.globalAlpha*=pack;text(c,'活性组合：9 份 RR + 1 份 SS',1285,384,30,C.gold,'center');pairBar(c,1010,755,592,23,.9);c.restore();
 // The original pool and new product are compared through paired cancellation.
 c.save();c.globalAlpha*=eePhase*(1-graphPhase);
 text(c,'配体',310,397,25,C.muted,'center');text(c,'产物',660,397,25,C.muted,'center');
 for(let i=0;i<4;i++)ball(c,265+i%2*85,475+Math.floor(i/2)*75,19,i<3?C.gold:C.cyan);
 for(let i=0;i<10;i++)ball(c,576+i%3*53,462+Math.floor(i/3)*51,14,i<9?C.gold:C.cyan);
 path(c,[[293,545],[322,545]],C.muted,3,.6);path(c,[[550,620],[700,620]],C.muted,2,.5);
 text(c,'差 2 份 / 共 4 份',310,678,25,C.muted,'center');text(c,'差 8 份 / 共 10 份',660,678,25,C.muted,'center');
 text(c,'50% ee',310,743,36,C.gold,'center',650);text(c,'80% ee',660,743,36,C.gold,'center',650);
 c.restore();
 // Time-based numeric cue is measured from the new spoken sentence.
 c.save();c.globalAlpha*=ease((t-events.result+.5)/.45);text(c,'90 − 10 = 80',1306,879,28,C.gold,'center',650);c.restore();
 c.save();c.globalAlpha*=graphPhase;
 const x=250,y=792,w=512,h=366;path(c,[[x,y-h],[x,y],[x+w,y]],C.muted,2,.7);c.save();c.setLineDash([8,10]);path(c,[[x,y],[x+w,y-h]],C.muted,2,.5);c.restore();
 const points:M.V2[]=Array.from({length:101},(_,i)=>{const u=i/100;return[x+w*u,y-h*2*u/(1+u*u)]});path(c,points,C.gold,4);
 const px=x+w*.5,py=y-h*.8;path(c,[[px,y],[px,py],[x,py]],C.gold,1.5,.5);ball(c,px,py,9,C.gold);text(c,'50',px,y+27,25,C.muted,'center');text(c,'80',x-24,py,25,C.gold,'right');text(c,'起始配体 ee / %',x+w*.5,859,26,C.muted,'center');text(c,'产物 ee / %',x-10,y-h-40,26,C.gold);c.restore();
}

/** A planar carbonyl centre changes continuously into four substituent directions. */
const REACTION_TET:V3[]=[[-1.25,0,0],[1.25/3,-Math.sqrt(8/9)*1.25,0],[1.25/3,Math.sqrt(2/9)*1.25,-Math.sqrt(2/3)*1.25],[1.25/3,Math.sqrt(2/9)*1.25,Math.sqrt(2/3)*1.25]];
export function soaiV02(c:Ctx,t:number,p:number,resultAt=16){
 const addition=phase(p,.13,.36),hydrolysis=phase(p,.4,.49),feedback=phase(p,.53,.7),turn=.26+.075*Math.sin(t*.1);
 const center:M.V2=[875,560];const scale=118;
 const planar:V3[]=[[-1.24,0,0],[.62,-1.075,0],[.62,1.075,0],[2.9,.4,2]];
 const tetra=REACTION_TET;
 const pts=planar.map((a,i)=>proj(a.map((v,j)=>mix(v,tetra[i][j],addition)) as V3,center[0],center[1],scale,turn));
 const names=['嘧啶基',hydrolysis>.5?'OH':addition>.8?'O–Zn–i-Pr':'O','H','i-Pr'],cols=[C.cyan,C.rose,C.ink,C.gold];
 shadow(c,890,752,315,30,.4);
 const objects:Array<{z:number;fn:()=>void}>=[];
 pts.forEach((v,i)=>{
  const opacity=i===3?phase(p,.055,.13):1;
  objects.push({z:v.z*.5,fn:()=>{c.save();c.globalAlpha*=i===3?addition:opacity;if(i===1){cylinder(c,center,[v.x,v.y],7,C.muted);c.save();c.globalAlpha*=1-addition;cylinder(c,[center[0]+10,center[1]],[v.x+10,v.y],5,C.muted);c.restore();}else cylinder(c,center,[v.x,v.y],8,C.muted);c.restore();}});
  objects.push({z:v.z,fn:()=>{c.save();c.globalAlpha*=opacity;ball(c,v.x,v.y,(i===2?15:25)*v.s,cols[i]);c.restore();}});
 });
 objects.push({z:0,fn:()=>ball(c,...center,31,C.violet)});objects.sort((a,b)=>b.z-a.z).forEach(o=>o.fn());
 // Keep the real 1,3-diazine ring attached at C5 while the carbonyl centre changes.
 const ringAnchor=pts[0],ringRadius=64,ringX=ringAnchor.x-ringRadius;
 const ring=Array.from({length:6},(_,i)=>[ringX+Math.cos(i*Math.PI/3)*ringRadius,ringAnchor.y+Math.sin(i*Math.PI/3)*ringRadius] as M.V2);
 for(let i=0;i<6;i++){const a=ring[i],b=ring[(i+1)%6];path(c,[a,b],C.cyan,2.7,.9);if(i%2===0)path(c,[[mix(a[0],ringX,.2),mix(a[1],ringAnchor.y,.2)],[mix(b[0],ringX,.2),mix(b[1],ringAnchor.y,.2)]],C.cyan,1.7,.7);}
 for(const i of [2,4]){c.save();c.fillStyle=C.dark;c.beginPath();c.arc(ring[i][0],ring[i][1],15,0,TAU);c.fill();text(c,'N',ring[i][0],ring[i][1],25,C.cyan,'center');c.restore();}
 const labelSlots:M.V2[]=[[485,610],[1070,378],[780,760],[1180,720]];
 pts.forEach((v0,i)=>{const v=i===0?{...v0,x:ringX-ringRadius,y:ringAnchor.y}:v0;c.save();c.globalAlpha*=i===3?phase(p,.055,.13):1;const slot=labelSlots[i];const dx=slot[0]-v.x,dy=slot[1]-v.y,len=Math.hypot(dx,dy)||1;path(c,[[v.x+dx/len*32,v.y+dy/len*32],[slot[0]-Math.sign(dx)*35,slot[1]]],cols[i],1.2,.4);text(c,names[i],...slot,i===0?31:36,cols[i],'center',600);c.restore();});
 text(c,addition<.5?'羰基碳：三个方向在一个平面':'手性碳：四个方向伸向空间',868,839,31,C.ink,'center');
 c.save();c.globalAlpha*=hydrolysis;text(c,'水处理后的醇',868,886,25,C.muted,'center');c.restore();
 // Catalysis occurs through the zinc alkoxide before work-up, separately visualized.
 c.save();c.globalAlpha*=phase(p,.34,.41);
 const branch=phase(p,.34,.48),bx=mix(875,1512,branch),by=mix(560,565,branch),bs=mix(118,57,branch);
 const branchPoints=tetra.map(v=>proj(v,bx,by,bs,turn));
 branchPoints.forEach((v,i)=>{cylinder(c,[bx,by],[v.x,v.y],4.5,cols[i]);ball(c,v.x,v.y,i===2?8:12,cols[i]);});ball(c,bx,by,15,C.violet);
 const oxygen=branchPoints[1];cylinder(c,[oxygen.x,oxygen.y],[oxygen.x+40,oxygen.y-28],3.4,C.cyan);ball(c,oxygen.x+40,oxygen.y-28,10,C.cyan);text(c,'Zn',oxygen.x+60,oxygen.y-38,22,C.cyan,'center');
 c.save();c.globalAlpha*=branch;text(c,'锌醇盐',1512,405,31,C.cyan,'center');text(c,'留在反应体系中',1512,696,26,C.muted,'center');c.restore();
 const loop:M.V2[]=[[1512,656],[1772,822],[681,843],[612,683]];lineTrail(c,loop,feedback,C.cyan,.35);
 const q=cubic(loop,((t*.115)%1)*feedback);c.save();c.globalAlpha*=feedback;ligand(c,q[0],q[1],12,1,t);c.restore();
 c.restore();
 c.save();c.globalAlpha*=ease((t-resultAt+.5)/.45);text(c,'2% → 87% ee',410,825,36,C.gold,'center',650);c.restore();
}

function productGrid(c:Ctx,x:number,y:number,count:number,cols:number,scale:number,t:number,goldFraction=1){
 for(let i=0;i<count;i++){const z=Math.sin(i*.8+t*.1)*1.3;ligand(c,x+i%cols*scale*2.65,y+Math.floor(i/cols)*scale*2.3+z,scale,i<Math.round(count*goldFraction)?1:-1,t,.85);}
}

/** New products remain present as the catalysts that feed the next cycle. */
export function feedbackV02(c:Ctx,t:number,p:number){
 const cx=780,cy=622;
 text(c,'原料进入',339,371,30,C.muted,'center');text(c,'产物加入催化队伍',1225,371,30,C.gold,'center');
 vessel(c,cx,808,390,390,.74);shadow(c,cx,835,245,24,.24);
 productGrid(c,671,595,4,4,18,t);
 const input:M.V2[]=[[284,514],[439,427],[526,452],[687,585]];lineTrail(c,input,1,C.cyan,.34);
 for(let i=0;i<5;i++){const u=(t*.13+i/5)%1,q=cubic(input,u);ball(c,q[0],q[1],9,C.cyan);}
 const loop:M.V2[]=[[919,657],[1602,833],[1611,430],[909,521]];lineTrail(c,loop,1,C.gold,.38);
 for(let i=0;i<4;i++){const u=(t*.075+i/4)%1;bezierToken(c,loop,u,19,1,t,.94);}
 const seed:M.V2[]=[[900,650],[1210,637],[1295,535],[1417,531]];const merge=phase(p,.04,.23);bezierToken(c,seed,merge,28,1,t);
 for(let round=0;round<3;round++)for(let i=0;i<4;i++){
  const start:M.V2=[1300+i*67,622],end:M.V2=[671+i*47.7,595+(round+1)*41.4];
  const a=.2+round*.23+i*.016,u=phase(p,a+.025,a+.21),reveal=phase(p,a-.012,a+.04);
  const trajectory:M.V2[]=[start,[1210+i*26,735+round*12],[1000+i*13,767],end];
  const raw:M.V2[]=[[1705,450+i*35],[1600,445+i*27],[1520,578],[start[0],start[1]]],approach=phase(p,a-.12,a-.012),rq=cubic(raw,approach);
  c.save();c.globalAlpha*=phase(p,a-.15,a-.12)*(1-reveal);lineTrail(c,raw,approach,C.cyan,.15);ball(c,rq[0],rq[1],11,C.cyan);c.restore();
  path(c,[[1417,531],start],C.gold,1.4,.12*reveal*(1-u));
  c.save();c.globalAlpha*=reveal;lineTrail(c,trajectory,u,C.gold,.09*(1-u));bezierToken(c,trajectory,u,18,1,t);c.restore();
 }
 text(c,'催化剂留在体系中',780,371,31,C.ink,'center');text(c,'新产物补充新的催化力量',1353,780,29,C.gold,'center');
 text(c,'补加原料，产物继续留在体系中',783,865,27,C.muted,'center');
}

export function amplificationV02(c:Ctx,t:number,p:number,ats=[5,9,10.3,12]){
 const ees=[.0000005,.57,.99,.9952],xs=[275,738,1200,1664],labels=['起始','第 1 轮','第 2 轮','第 3 轮'],values=['0.00005%','57%','99%','>99.5%'];
 const stages=ats.map(at=>ease((t-at+.7)/.65));
 for(let k=0;k<4;k++){
  const reveal=stages[k];c.save();c.globalAlpha*=.18+.82*reveal;
  text(c,labels[k],xs[k],371,29,C.muted,'center');shadow(c,xs[k],748,136,21,.28);vessel(c,xs[k],720,218,284,.68);
  productGrid(c,xs[k]-73,539,24,6,10,t,(1+ees[k])/2);
  pairBar(c,xs[k]-118,755,236,17,(1+ees[k])/2,false);
  c.save();c.globalAlpha*=reveal;text(c,values[k],xs[k],809,k?42:35,k?C.gold:C.ink,'center',650);c.restore();
  if(k>0){const input=phase(reveal,0,.75);const curve:M.V2[]=[[xs[k]-290,648],[xs[k]-250,561],[xs[k]-215,520],[xs[k]-107,537]];lineTrail(c,curve,1,C.cyan,.27);const pt=cubic(curve,input);ball(c,pt[0],pt[1],7,C.cyan);c.save();c.globalAlpha*=reveal;text(c,'补料',xs[k]-238,461,24,C.muted,'center');c.restore();}
  c.restore();
 }
 text(c,'对映体过量 ee',970,873,27,C.muted,'center');
}

/** Repeated trials reveal through liquid height and handedness, then join two totals. */
export function chanceV02(c:Ctx,t:number,p:number){
 const order=Array.from({length:37},(_,i)=>({i,key:M.rnd(i+55)})).sort((a,b)=>a.key-b.key),right=new Set(order.slice(0,18).map(v=>v.i));
 text(c,'37 次独立实验',292,366,31,C.ink);let rCount=0,sCount=0;
 for(let i=0;i<37;i++){
  const u=phase(p,.03+i*.012,.15+i*.012),isR=right.has(i),x=210+i%10*150,y=512+Math.floor(i/10)*93;
  if(u>.5){if(isR)rCount++;else sCount++;}
  shadow(c,x,y+12,30,6,.18);vessel(c,x,y,46,61,.12+.64*u,isR?C.gold:C.cyan);ligand(c,x,y-26,8,isR?1:-1,t,.95*u);
 }
 const reveal=phase(p,.53,.7);c.save();c.globalAlpha*=reveal;pairBar(c,982,858,586,15,18/37,false);text(c,`${rCount} 次 R`,1000,815,28,C.gold);text(c,`${sCount} 次 S`,1557,815,28,C.cyan,'right');c.restore();
}

export function toolsV02(c:Ctx,t:number,p:number){
 const scan=phase(p,.03,.55),x0=190,y0=781,w=655,h=332;
 text(c,'用非线性效应，追踪催化剂',500,366,31,C.gold,'center');text(c,'用自催化，研究微小偏差',1417,366,31,C.cyan,'center');
 path(c,[[x0,y0-h],[x0,y0],[x0+w,y0]],C.muted,2,.6);
 const pts:M.V2[]=Array.from({length:100},(_,i)=>{const u=i/99;return[x0+u*w,y0-h*2*u/(1+u*u)]});path(c,pts,C.gold,4);
 const u=.1+.72*scan,px=x0+u*w,py=y0-h*2*u/(1+u*u);path(c,[[px,y0],[px,py]],C.gold,1.6,.45);ball(c,px,py,10,C.gold);
 complex(c,488,555,.7,'RR',t);complex(c,711,630,.65,'RS',t,.45);
 const loop:M.V2[]=[[1330,473],[1725,418],[1725,803],[1320,752]];lineTrail(c,loop,1,C.cyan,.35);for(let i=0;i<4;i++)bezierToken(c,loop,(t*.07+i/4)%1,19,1,t,.9);
 vessel(c,1404,731,221,256,.71,C.cyan);productGrid(c,1338,590,16,4,12,t,1);
 text(c,'配体组成 → 催化剂组合 → 产物',518,864,27,C.muted,'center');text(c,'人工反应体系 → 生命起源的开放问题',1400,864,27,C.muted,'center');
}

export function catalystV02(c:Ctx,t:number,p:number){
 const approach=phase(p,.32,.6),selection=phase(p,.66,.9);
 const x=205,y=761,w=650,h=362;
 c.save();c.globalAlpha*=1-approach*.7;
 path(c,[[x,y-h],[x,y],[x+w,y]],C.muted,1.6,.5);text(c,'反应进程',x+w*.5,829,27,C.muted,'center');text(c,'能量',x-32,y-h,27,C.muted,'center');
 const raw:M.V2[]=[[x+30,y-58],[x+w*.33,y-h*1.37],[x+w*.59,y-h*1.28],[x+w-30,y-92]];
 const low:M.V2[]=[[x+30,y-58],[x+w*.32,y-h*.66],[x+w*.66,y-h*.57],[x+w-30,y-92]];
 lineTrail(c,raw,1,C.muted,.46);lineTrail(c,low,1,C.gold,.96);
 const u=phase(p,.02,.38),point=cubic(low,u);ball(c,point[0],point[1],14,C.gold);
 text(c,'能垒降低',x+328,y-246,29,C.gold,'center');c.restore();
 const mx=mix(1315,1050,approach),my=576,scale=mix(.96,1.5,approach);
 shadow(c,mx,my+151,250,28,.32);halo(c,mx,my,216,C.violet,.1);ball(c,mx,my,39*scale,C.violet);text(c,'M',mx,my,28*scale,C.dark,'center',650);
 const positions:V3[]=[[-1,-.65,.6],[1,-.65,-.6],[-1,.65,-.6],[1,.65,.6]];
 const projected=positions.map(v=>proj(v,mx,my,121*scale,.12+approach*.33));
 projected.sort((a,b)=>b.z-a.z).forEach((q,i)=>{cylinder(c,[mx,my],[q.x,q.y],9,C.violet);ligand(c,q.x,q.y,26*scale,1,t,phase(p,.33,.59));});
 c.save();c.globalAlpha*=1-approach;const loop:M.V2[]=[[mx+52,my+82],[mx+263,my+155],[mx+263,my-156],[mx+52,my-83]];lineTrail(c,loop,1,C.gold,.35);const q=cubic(loop,(t*.16)%1);ball(c,q[0],q[1],8,C.gold);text(c,'完成一轮，继续参与下一轮',1316,823,29,C.ink,'center');c.restore();
 const paths:M.V2[][]=[[[mx+177,my-48],[1350,400],[1480,406],[1636,483]],[[mx+177,my+48],[1350,720],[1477,777],[1636,731]]];
 paths.forEach((trajectory,i)=>{c.save();c.globalAlpha*=selection;lineTrail(c,trajectory,1,i?C.cyan:C.gold,i?.15:.62);for(let j=0;j<(i?1:4);j++){const u=(t*.12+j/4)%1;bezierToken(c,trajectory,u,13,i?-1:1,t,(i?.38:.85)*Math.sin(u*Math.PI));}ligand(c,trajectory[3][0],trajectory[3][1],30,i?-1:1,t);c.restore();});
 c.save();c.globalAlpha*=selection;text(c,'有方向的环境',mx,372,31,C.ink,'center');text(c,'更容易生成的一侧',1579,416,27,C.gold,'center');c.restore();
}

export function frankV02(c:Ctx,t:number,p:number){
 const generate=phase(p,.06,.27),self=phase(p,.24,.57),inhibit=phase(p,.53,.81);
 const centers=[360,949,1516];['前体生成产物','同类促进生成','异类相互抑制'].forEach((v,i)=>text(c,v,centers[i],374,31,i===1?C.gold:C.ink,'center'));
 for(let side=0;side<2;side++){
  const source:M.V2=[208,538+side*148],end:M.V2=[463,538+side*148],track:M.V2[]=[source,[278,source[1]-36],[387,end[1]-36],end];
  lineTrail(c,track,1,side?C.cyan:C.gold,.25);const q=cubic(track,generate);ball(c,208,source[1],15,C.muted);ligand(c,q[0],q[1],26,side?-1:1,t,generate);
 }
 const seed:M.V2=[919,498];ligand(c,...seed,35,1,t,self);
 for(let i=0;i<6;i++){
  const destination:M.V2=[816+i%3*121,645+Math.floor(i/3)*111],u=phase(self,i*.065,.5+i*.065);
  const track:M.V2[]=[seed,[seed[0]-25,568],[destination[0],576],destination];lineTrail(c,track,u,C.gold,.2);bezierToken(c,track,u,21,1,t,u);
  const input:M.V2[]=[[688,580+i*22],[733,582+i*22],[780,599+i*22],destination];const q=cubic(input,u);c.save();c.globalAlpha*=self*(1-u);ball(c,q[0],q[1],6,C.muted);c.restore();
 }
 const left:M.V2=[mix(1370,1459,inhibit),590],right:M.V2=[mix(1662,1573,inhibit),625];ligand(c,...left,29,1,t,inhibit);ligand(c,...right,29,-1,t,inhibit);path(c,[left,right],C.muted,5,.4*inhibit);c.save();c.globalAlpha*=inhibit;path(c,[[1450,742],[1582,742]],C.rose,5,.8);text(c,'通路减弱',1516,795,28,C.muted,'center');c.restore();
 text(c,'Charles Frank · 1953',949,869,27,C.muted,'center');
}

export function auditMechanismQuantitiesV02(){
 const R=.75,S=.25,rr=R*R,rs=2*R*S,ss=S*S,active=rr+ss;
 const reactionCosines=REACTION_TET.flatMap((a,i)=>REACTION_TET.slice(i+1).map(b=>a.reduce((s,v,j)=>s+v*b[j],0)/(Math.hypot(...a)*Math.hypot(...b))));
 return{probabilities:{RR:rr,RS:rs,SS:ss,sum:rr+rs+ss},activeRatio:rr/ss,productR:rr/active,productS:ss/active,ligandEE:R-S,productEE:(rr-ss)/active,trialCount:37,rightTrials:18,leftTrials:19,initialEE:.0000005,initialRightFraction:(1+.0000005)/2,thirdRoundEEBound:.995,thirdRoundMajorityBound:(1+.995)/2,reactionTetrahedralCosines:reactionCosines};
}
