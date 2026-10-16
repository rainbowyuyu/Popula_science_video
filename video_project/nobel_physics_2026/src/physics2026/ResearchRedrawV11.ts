import {withTextOpacityV11} from './TextOpacityV11';
/** Evidence-led count and source scenes. The only quantitative marks below
 * are published counts, direction separation and fitted confidence interval.
 * Real sky maps / spectra are displayed by EvidenceFigureV11, not invented. */
const P={white:'#edf6f6',muted:'#9dbcc8',blue:'#66d4f2',gold:'#efc57c',dark:'#061522',rose:'#deacbd'};
const sat=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{x=sat(x);return x*x*(3-2*x);};
const mix=(a:number,b:number,q:number)=>a+(b-a)*q;
const seed=(n:number)=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
type V={x:number;y:number};
function stroke(c:CanvasRenderingContext2D,ps:V[],color:string,width=2,opacity=1){if(ps.length<2)return;c.save();c.globalAlpha*=opacity;c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(ps[0].x,ps[0].y);for(const p of ps.slice(1))c.lineTo(p.x,p.y);c.stroke();c.restore();}
function text(c:CanvasRenderingContext2D,s:string,x:number,y:number,size=26,color=P.white,opacity=1){c.save();c.globalAlpha*=opacity;c.fillStyle=color;c.font=`600 ${size}px "Nobel Sans", "Microsoft YaHei", sans-serif`;c.fillText(s,x,y);c.restore();}
function glow(c:CanvasRenderingContext2D,x:number,y:number,r:number,col:string,opacity:number){c.save();c.globalAlpha*=opacity;const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,col);g.addColorStop(.12,col);g.addColorStop(1,'transparent');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.restore();}
function bead(c:CanvasRenderingContext2D,x:number,y:number,r:number,col:string,opacity=1){c.save();c.globalAlpha*=opacity;const g=c.createRadialGradient(x-r*.3,y-r*.3,0,x,y,r);g.addColorStop(0,'#f1fdff');g.addColorStop(.25,col);g.addColorStop(.77,col);g.addColorStop(1,'#173341');c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.restore();}
function orbitDisk(c:CanvasRenderingContext2D,x:number,y:number,r:number,t:number,jet=false){
 c.save();c.translate(x,y);c.rotate(-.28);glow(c,0,0,r*1.35,P.blue,.13);
 for(let k=0;k<5;k++){
  const a=t*.018+k*1.25,ps:V[]=[];
  for(let i=0;i<=110;i++){const u=i/110,th=a+u*7.6,rr=14+u*r;ps.push({x:Math.cos(th)*rr,y:Math.sin(th)*rr*.38});}
  stroke(c,ps,k%2?P.blue:P.gold,12-k,.06);stroke(c,ps,k%2?P.blue:P.white,1.7,.30);
 }
 for(let i=0;i<150;i++){const rr=(.09+seed(i+65)*.91)*r,th=i*2.39996+t*.022;bead(c,Math.cos(th)*rr,Math.sin(th)*rr*.38,.5+seed(i+76)*1.7,P.white,.18+.35*(1-rr/r));}
 if(jet){for(let side of [-1,1]){const g=c.createLinearGradient(0,0,20*side,-r*side);g.addColorStop(0,'rgba(200,242,255,.65)');g.addColorStop(1,'rgba(30,170,220,0)');c.fillStyle=g;c.beginPath();c.moveTo(-5,0);c.quadraticCurveTo(-20,-r*side,30,-r*side*1.38);c.lineTo(5,0);c.fill();}}
 glow(c,0,0,55,P.gold,.50);bead(c,0,0,8,P.white);c.restore();
}

function eventToken(c:CanvasRenderingContext2D,x:number,y:number,id:number,q:number,dim=false){
 if(q<=0)return;c.save();c.globalAlpha*=q;c.translate(x,y+18*(1-q));
 const col=dim?'#738c99':(id===14||id===20)?P.gold:P.blue;
 c.fillStyle=dim?'rgba(39,61,73,.7)':'rgba(31,78,102,.70)';c.strokeStyle=col;c.lineWidth=1.2;
 c.beginPath();c.ellipse(0,0,21,15,-.20,0,Math.PI*2);c.fill();c.stroke();
 if(!dim){glow(c,0,0,20,col,.18);bead(c,-2,-2,4,col);}
 else stroke(c,[{x:-8,y:-6},{x:8,y:6}],col,1.5);
 text(c,String(id).padStart(2,'0'),-9,32,16,dim?P.muted:col);c.restore();
}
function discovery(c:CanvasRenderingContext2D,t:number){
 const later=ease((t-13.794)/1.15);
 const shown=t<5.481?2:mix(2,28,ease((t-5.481)/2.5));
 const count=mix(shown,37,later);
 text(c,'从两次闪光，到可检验的证据',155,362,30);
 // Tokens encode event IDs/counts, not sky positions, energies or signal purity.
 const eventIds=[14,20,...Array.from({length:28},(_,i)=>i+1).filter(id=>id!==14&&id!==20),...Array.from({length:9},(_,i)=>i+29)];
 const positions=Array.from({length:37},(_,i)=>({x:188+(i%8)*97,y:461+Math.floor(i/8)*72}));
 for(let i=0;i<37;i++){
  const q=ease((count-i)*1.1),isBackground=eventIds[i]===32&&t>=17.409;
  eventToken(c,positions[i].x,positions[i].y,eventIds[i],q,isBackground);
 }
 if(t<5.481){const q=ease(t/1.4);for(let i=0;i<2;i++){const p=positions[i];for(let k=0;k<3;k++){const r=12+((t*.3+k/3)%1)*50;c.save();c.globalAlpha*=.13*(1-(r-12)/50)*q;c.strokeStyle=P.gold;c.lineWidth=2;c.beginPath();c.ellipse(p.x,p.y,r,r*.58,-.2,0,Math.PI*2);c.stroke();c.restore();}}text(c,'两次 PeV 级事件',400,462,25,P.gold,q);}
 const labels=ease((t-8.554)/.9),value=t<13.794?'28':'37';
 text(c,t<13.794?'2013 · 28 个事件':'988 天 · 37 个候选',155,817,27,P.white,ease((t-5.481)/1));
 text(c,t<13.794?'4.1σ':'5.7σ',830,415,54,P.gold,t<13.794?labels:ease((t-21.565)/1));
 if(t>=17.409){const p=positions[eventIds.indexOf(32)],q=ease((t-17.409)/.8);stroke(c,[{x:p.x+25,y:p.y},{x:988,y:p.y},{x:988,y:810}],P.muted,1.4,q*.6);text(c,'32：背景 μ 子叠加',598,853,23,P.muted,q);}
 // A short observed time span grows continuously. There is no synthetic
 // significance distribution behind the published reported value.
 stroke(c,[{x:160,y:386},{x:1000,y:386}],P.muted,1,.23);
 stroke(c,[{x:160,y:386},{x:160+840*ease(t/25.44),y:386}],P.gold,2,.65);
}

function sourcePanel(c:CanvasRenderingContext2D,t:number,absoluteTime:number,kind:'txs'|'ngc'){
 const ngc=kind==='ngc';
 // Galaxies are explanatory objects; empirical localization is in the real
 // Figure 2 directly alongside this scene. No made-up light or fit curves.
 orbitDisk(c,785,500,175,absoluteTime, !ngc);
 text(c,ngc?'NGC 1068':'TXS 0506+056',156,357,36,P.white);
 text(c,ngc?'2011—2020 · 九年数据中的方向过量':'2017 · IceCube-170922A',156,398,25,P.muted);
 if(!ngc){
  const q=ease((t-4.375)/1.5),arrival=ease((t-.8)/5.6);
  const from={x:750,y:525},to={x:243,y:650};
  stroke(c,[from,to],P.gold,2.2,.25+.4*q);
  for(let k=0;k<4;k++){const u=(t*.16+k*.25)%1;bead(c,mix(from.x,to.x,u),mix(from.y,to.y,u),2.2,P.gold,.7);}
  c.save();c.translate(to.x,to.y);c.rotate(.27);c.strokeStyle=P.blue;c.lineWidth=3;c.beginPath();c.ellipse(0,0,38,69,0,0,Math.PI*2);c.stroke();c.beginPath();c.ellipse(0,0,24,50,0,0,Math.PI*2);c.stroke();c.restore();
  text(c,'≈ 290',156,520,74,P.gold,q);text(c,'TeV',161,559,29,P.gold,q);
  const r=ease((t-11.239)/.6);text(c,'中心方向间隔',385,724,26,P.muted,r);text(c,'≈ 0.06°',385,796,64,P.white,r);
  // Offset marker only illustrates the meaning of a nonzero separation.
  // Actual 50/90% containment and axes are retained on the paper figure.
  if(arrival>0){glow(c,243,650,65,P.blue,.22*arrival);bead(c,243,650,5,P.blue,arrival);}
 }else{
  const local=t-14.181,q=ease(local/1.3);
  text(c,'拟合的天体物理中微子过量',155,465,27,P.muted,q);
  text(c,'79',157,592,108,P.gold,q);
  const uncertainty=ease((t-20.457)/.85);
  text(c,'+22',315,539,35,P.gold,uncertainty);text(c,'−20',315,580,35,P.gold,uncertainty);
  // Published interval [59,101], drawn on a truthful numeric axis. This is
  // an interval summary rather than an invented profile likelihood shape.
  const x0=164,x1=962,y=709,map=(n:number)=>x0+(x1-x0)*n/120;
  stroke(c,[{x:x0,y},{x:x1,y}],P.muted,2,q*.6);
  for(let n=0;n<=120;n+=20){stroke(c,[{x:map(n),y:y-6},{x:map(n),y:y+6}],P.muted,1,q);text(c,String(n),map(n)-12,y+32,20,P.muted,q);}
  const lo=mix(79,59,uncertainty),hi=mix(79,101,uncertainty);
  stroke(c,[{x:map(lo),y},{x:map(hi),y}],P.gold,14,q*.30);
  stroke(c,[{x:map(lo),y:y-18},{x:map(lo),y:y+18}],P.gold,2,q*uncertainty);
  stroke(c,[{x:map(hi),y:y-18},{x:map(hi),y:y+18}],P.gold,2,q*uncertainty);
  bead(c,map(79),y,8,P.gold,q);
  text(c,'约 4.2σ',155,823,42,P.white,uncertainty);
  text(c,'全局显著性',386,823,24,P.muted,uncertainty);
 }
}

export function drawResearchSceneV11(c:CanvasRenderingContext2D,id:string,t:number,absoluteTime:number){
 if(id!=='011'&&id!=='012')return false;
 c.save();c.beginPath();c.rect(120,319,910,557);c.clip();
 if(id==='011')discovery(c,t);
 else{
  const phase=sat((t-14.181)/.60),cross=ease(phase);
  if(cross<1){c.save();c.globalAlpha*=1-cross;withTextOpacityV11(c,1-ease(phase/.42),()=>sourcePanel(c,Math.min(t,14.181),absoluteTime,'txs'));c.restore();}
  if(cross>0){c.save();c.globalAlpha*=cross;withTextOpacityV11(c,ease((phase-.5)/.5),()=>sourcePanel(c,t,absoluteTime,'ngc'));c.restore();}
 }
 c.restore();return true;
}
