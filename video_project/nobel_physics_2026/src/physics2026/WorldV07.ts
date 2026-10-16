import timeline from './timeline-v10.json';

/**
 * A deterministic, WebGL-inspired renderer for the 2026 physics film.
 *
 * Physics invariant: IceCube never records a neutrino directly. Every light
 * pulse below comes from a charged secondary and its Cherenkov photons.
 *
 * This is intentionally Canvas 2D rather than a runtime WebGL scene: every
 * pixel is driven by the Remotion frame, which keeps renders reproducible on
 * both the preview and the 4K pass.  Depth, bloom, and perspective are drawn
 * as layered primitives so the scene still reads like a small film set.
 */
export type State={frame:number;time:number;clipId:string;scene:string;elapsed:number;progress:number};
const W=1920,H=1080;
const C={ink:'#e8f2f2',muted:'#8caeb6',cyan:'#61e2f2',ice:'#caeff3',blue:'#2a76b1',deep:'#061521',gold:'#e6b96b',rose:'#ff9c9c',violet:'#9ba7ff'};
const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=(v:number)=>{v=clamp(v);return v*v*(3-2*v)};
const ease=(a:number,b:number,t:number)=>a+(b-a)*smooth(t);
const lerp=(a:number,b:number,t:number)=>a+(b-a)*clamp(t);
const rnd=(i:number)=>{const x=Math.sin(i*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
const hex=(h:number,s:number,l:number)=>`hsl(${h} ${s}% ${l}%)`;
function line(c:CanvasRenderingContext2D,x1:number,y1:number,x2:number,y2:number,col:string,w=2,a=1){c.save();c.globalAlpha*=a;c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();c.restore();}
function path(c:CanvasRenderingContext2D,pts:{x:number;y:number}[],col:string,w=2,a=1){if(!pts.length)return;c.save();c.globalAlpha*=a;c.strokeStyle=col;c.lineWidth=w;c.lineJoin='round';c.lineCap='round';c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);c.stroke();c.restore();}
function dot(c:CanvasRenderingContext2D,x:number,y:number,r:number,col:string,a=1){c.save();c.globalAlpha*=a;c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.restore();}
function bloom(c:CanvasRenderingContext2D,x:number,y:number,r:number,col:string,a=.2){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,col);g.addColorStop(.2,col);g.addColorStop(1,'transparent');c.save();c.globalAlpha*=a;c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.restore();}
/** Draw a point with a soft, depth-aware core.  The old visuals used a flat
 * circle for every hit, which made the detector read like a diagram.  A
 * radial core plus rim gives the eye a stable front-to-back cue while keeping
 * every pixel deterministic. */
function orb(c:CanvasRenderingContext2D,x:number,y:number,r:number,col:string,a=1,depth=1){
 c.save();c.globalAlpha*=a;
 const g=c.createRadialGradient(x-r*.22,y-r*.24,Math.max(.5,r*.06),x,y,r);
 g.addColorStop(0,'rgba(255,255,255,.92)');g.addColorStop(.22,col);g.addColorStop(.72,col);g.addColorStop(1,'rgba(0,0,0,0)');
 c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();
 c.globalAlpha*=.28*depth;c.strokeStyle=C.ice;c.lineWidth=Math.max(.7,r*.12);c.beginPath();c.arc(x-r*.08,y-r*.08,r*.73,-2.5,-.35);c.stroke();c.restore();
}
function glowPath(c:CanvasRenderingContext2D,pts:{x:number;y:number}[],col:string,a=.7,w=2){
 path(c,pts,col,w*3,a*.12);path(c,pts,col,w,a*.8);path(c,pts,C.ice,w*.22,a*.65);
}
/** A depth-aware ribbon used for the blue-light demonstrations.  The old
 * paths were single strokes; the nested, tapered ribbons below preserve a
 * visible core while giving the eye a volume and motion direction. */
function volumeRibbon(c:CanvasRenderingContext2D,pts:{x:number;y:number}[],col:string,t:number,energy=1){
 if(pts.length<2)return;
 c.save();
 const g=c.createLinearGradient(pts[0].x,pts[0].y,pts[pts.length-1].x,pts[pts.length-1].y);
 g.addColorStop(0,'rgba(255,255,255,.04)');g.addColorStop(.22,col);g.addColorStop(1,'rgba(255,255,255,0)');
 c.strokeStyle=g;c.lineCap='round';c.lineJoin='round';c.lineWidth=15*energy;c.globalAlpha=.08;
 c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(const p of pts.slice(1))c.lineTo(p.x,p.y);c.stroke();
 c.globalAlpha=.4;c.strokeStyle=col;c.lineWidth=2.6*energy;c.setLineDash([11,17]);c.lineDashOffset=-t*44;c.stroke();
 c.restore();
}
function photonTrail(c:CanvasRenderingContext2D,from:{x:number;y:number},to:{x:number;y:number},t:number,col=C.cyan,seed=0){
 const dx=to.x-from.x,dy=to.y-from.y;
 for(let i=0;i<18;i++){
  const u=((t*.42+i*.071+seed*.13)%1+1)%1;
  const x=from.x+dx*u,y=from.y+dy*u;
  const q=.42+.58*(1-u),r=1.5+2.4*q;
  bloom(c,x,y,18*q,col,.06*q);orb(c,x,y,r,col,.34*q,.6);
 }
}
/** Soft, deterministic particle volume around a shower core.  The radial
 * falloff avoids the flat spray seen in the previous implementation and
 * keeps the title and subtitle bands free of accidental specks. */
function showerVolume(c:CanvasRenderingContext2D,cx:number,cy:number,t:number,seed=0,scale=1){
 for(let i=0;i<90;i++){
  const u=rnd(i+seed*19),v=rnd(i+seed*23),a=u*Math.PI*2;
  const r=(Math.pow(v,.55)*190+20)*scale;
  const drift=Math.sin(t*.55+i*1.71+seed)*7;
  const x=cx+Math.cos(a)*r+drift;
  const y=cy+Math.sin(a)*r*.42+Math.cos(t*.38+i)*6;
  const depth=.4+.6*rnd(i+seed*29);
  const col=i%9===0?C.gold:C.cyan;
  orb(c,x,y,(.9+1.8*depth)*scale,col,.2+.36*(1-r/240),depth);
 }
 bloom(c,cx,cy,180*scale,C.cyan,.12);
}
/** A low contrast volume of depth particles. Their motion is tied to the
 * absolute film clock, so the scene feels like one camera move instead of a
 * collection of restarted effects. */
function depthParticles(c:CanvasRenderingContext2D,t:number,seed=0,amount=72){
 for(let i=0;i<amount;i++){
   const z=90+rnd(i+seed*31)*720;
   const drift=Math.sin(t*.18+i*.71+seed)*18;
   const x=(rnd(i+seed*17)-.5)*1650+drift;
   const y=(rnd(i+seed*23)-.5)*760+Math.cos(t*.13+i)*11;
   const p=project(x,y,z,960,560,760);
   const pulse=.20+.22*(.5+.5*Math.sin(t*.9+i*1.37));
   bloom(c,p.x,p.y,12*p.q,C.cyan,pulse*.22);
   orb(c,p.x,p.y,.8+2.1*p.q,i%9===0?C.gold:C.ice,pulse*.52,p.q);
 }
}
function pulseRing(c:CanvasRenderingContext2D,x:number,y:number,t:number,col:string=C.cyan,scale=1){
 const q=(t%1+1)%1; c.save(); c.globalAlpha=.24*(1-q); c.strokeStyle=col; c.lineWidth=1.5;
 c.beginPath();c.ellipse(x,y,(18+100*q)*scale,(8+34*q)*scale,0,0,Math.PI*2);c.stroke();c.restore();
}
function spline(a:{x:number;y:number},b:{x:number;y:number},c0:{x:number;y:number},t:number){
 const u=1-t;return {x:u*u*a.x+2*u*t*b.x+t*t*c0.x,y:u*u*a.y+2*u*t*b.y+t*t*c0.y};
}
function rounded(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,col:string,a=.7,stroke?:string){c.save();c.globalAlpha*=a;c.fillStyle=col;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}c.restore();}
function project(x:number,y:number,z:number,cx=960,cy=540,f=720){const q=f/(f+z);return {x:cx+x*q,y:cy+y*q,q};}
function projectDepth(x:number,y:number,z:number,yaw:number,pitch:number,cx=960,cy=540,f=720){
 const cyaw=Math.cos(yaw),syaw=Math.sin(yaw); const xr=x*cyaw-z*syaw; let zr=x*syaw+z*cyaw;
 const cp=Math.cos(pitch),sp=Math.sin(pitch); const yr=y*cp-zr*sp; zr=y*sp+zr*cp;
 return project(xr,yr,zr,cx,cy,f);
}
function stars(c:CanvasRenderingContext2D,t:number){for(let i=0;i<180;i++){const z=40+rnd(i)*900;const x=(rnd(i+10)-.5)*2450;const y=(rnd(i+80)-.5)*1380;const p=project(x,y,z,960,545,780);const tw=.15+.18*Math.sin(t*.7+i*1.77);dot(c,p.x,p.y,Math.max(.5,2.4*p.q),i%8===0?C.cyan:C.ice,tw);}}
/** A restrained volumetric haze gives the deep-blue set a filmic, WebGL-like
 *  atmosphere without introducing a texture or a second moving background.
 *  The centres are driven by absolute time, so the light field remains
 *  continuous when the editorial scene changes. */
function ambientHaze(c:CanvasRenderingContext2D,t:number){
 c.save(); c.globalCompositeOperation='screen';
 const ribbons=[
   {x:500+180*Math.sin(t*.10),y:330+95*Math.cos(t*.13),r:420,col:'rgba(39,156,201,.075)'},
   {x:1260+160*Math.cos(t*.08),y:700+120*Math.sin(t*.11),r:520,col:'rgba(29,101,170,.055)'},
   {x:980+120*Math.sin(t*.06+1.5),y:290+70*Math.cos(t*.09),r:280,col:'rgba(109,220,226,.035)'},
 ];
 for(const q of ribbons){
   const g=c.createRadialGradient(q.x,q.y,0,q.x,q.y,q.r);
   g.addColorStop(0,q.col);g.addColorStop(.45,q.col.replace(/\.\d+\)/,'.018)'));g.addColorStop(1,'rgba(0,0,0,0)');
   c.fillStyle=g;c.beginPath();c.arc(q.x,q.y,q.r,0,Math.PI*2);c.fill();
 }
 // Two very soft arcs imply a distant ice horizon and add depth behind the
 // detector. They are intentionally below the star field and never cross text.
 c.globalAlpha=.09;c.strokeStyle=C.cyan;c.lineWidth=2;
 c.beginPath();c.ellipse(820+55*Math.sin(t*.07),720,920,255,-.08,Math.PI*1.05,Math.PI*1.95);c.stroke();
 c.globalAlpha=.05;c.strokeStyle=C.gold;c.lineWidth=1;
 c.beginPath();c.ellipse(1110+80*Math.cos(t*.06),390,700,190,.04,Math.PI*.05,Math.PI*.95);c.stroke();
 c.restore();
}
function parallaxDust(c:CanvasRenderingContext2D,t:number){
 // A small number of slowly drifting points supplies foreground depth while
 // the deterministic star field remains unchanged. No random state is used.
 for(let i=0;i<42;i++){
   const z=120+rnd(i+210)*520;
   const x=(rnd(i+300)-.5)*2050 + Math.sin(t*.06+i)*14;
   const y=(rnd(i+390)-.5)*1120 + Math.cos(t*.05+i*1.7)*10;
   const p=project(x,y,z,960,545,820);
   const a=.04+.06*(.5+.5*Math.sin(t*.35+i*2.2));
   bloom(c,p.x,p.y,10*p.q,C.cyan,a*.35);dot(c,p.x,p.y,.9+1.4*p.q,C.ice,a);
 }
}
function vignette(c:CanvasRenderingContext2D){const g=c.createRadialGradient(W*.52,H*.47,100,W*.52,H*.5,1000);g.addColorStop(0,'transparent');g.addColorStop(.62,'rgba(0,0,0,.06)');g.addColorStop(1,'rgba(0,0,0,.68)');c.fillStyle=g;c.fillRect(0,0,W,H);}
function bg(c:CanvasRenderingContext2D,t:number){const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,C.deep);g.addColorStop(.52,'#0a2435');g.addColorStop(1,'#07141f');c.fillStyle=g;c.fillRect(0,0,W,H);ambientHaze(c,t);stars(c,t);parallaxDust(c,t);}
/** IceCube context cues: horizontal firn/ice strata and a faint blue depth
 * falloff make the detector read as hardware embedded in real ice rather than
 * a floating wireframe. These marks are deliberately dim and kept below the
 * title band; they move with the absolute clock so a cut cannot pop. */
function iceStrata(c:CanvasRenderingContext2D,t:number,amount=9){
 const x0=270,x1=1670,top=300,bottom=940;
 c.save();c.globalCompositeOperation='screen';
 for(let i=0;i<amount;i++){
   const y=top+(i+.5)*(bottom-top)/amount;
   const pts:{x:number;y:number}[]=[];
   for(let j=0;j<=48;j++){const u=j/48;pts.push({x:x0+(x1-x0)*u,y:y+9*Math.sin(u*8+i*.7+t*.08)+3*Math.sin(u*21+i)});}
   const a=.045+.018*(i%3===0?1:0);
   path(c,pts,i%3===0?'#9ce9f1':C.ice,1.15,a);
   if(i%2===0){const p=pts[Math.floor(((t*.025+i*.13)%1)*48)];if(p){bloom(c,p.x,p.y,24,C.cyan,.045);}}
 }
 // A subtle vertical blue gradient approximates light attenuation through the
 // ice. It is a spatial cue, not a data plot, and stays behind all objects.
 const g=c.createLinearGradient(0,top,0,bottom);g.addColorStop(0,'rgba(210,249,255,.025)');g.addColorStop(.54,'rgba(26,145,187,.055)');g.addColorStop(1,'rgba(4,20,32,.14)');c.fillStyle=g;c.globalAlpha=.8;c.fillRect(x0,top,x1-x0,bottom-top);
 c.restore();
}

/** One optical module rendered as a small pressure sphere with a cable and a
 * lower-facing photocatode bloom. Reusing this primitive for every hit keeps
 * the geometry and the readout flash physically registered. */
function opticalModule(c:CanvasRenderingContext2D,x:number,y:number,r:number,pulse:number,depth=1){
 const rr=Math.max(2.2,r);
 c.save();c.globalAlpha=.3+.45*depth;
 line(c,x,y-rr*2.8,x,y-rr*.7,C.muted,Math.max(.7,rr*.18),.46);
 c.strokeStyle=C.ice;c.lineWidth=Math.max(.55,rr*.13);c.beginPath();c.arc(x,y,rr,0,Math.PI*2);c.stroke();
 const g=c.createRadialGradient(x-rr*.25,y-rr*.32,rr*.08,x,y,rr*1.15);g.addColorStop(0,'rgba(255,255,255,.9)');g.addColorStop(.28,C.ice);g.addColorStop(.7,C.cyan);g.addColorStop(1,'rgba(27,117,161,.05)');c.fillStyle=g;c.beginPath();c.arc(x,y,rr,0,Math.PI*2);c.fill();
 c.globalAlpha*=.36+.64*pulse;c.strokeStyle=C.cyan;c.lineWidth=Math.max(.8,rr*.2);c.beginPath();c.arc(x,y,rr*.72,-2.45,-.25);c.stroke();c.restore();
 bloom(c,x,y,rr*(4.5+5*pulse),C.cyan,(.05+.17*pulse)*depth);
}
function iceShaft(c:CanvasRenderingContext2D,t:number){
 // A small, offset surface opening and the descending cable bundle provide a
 // recognisable bridge from the Antarctic surface to the buried array.
 const cx=1040, y=315, rx=210+8*Math.sin(t*.14), ry=30;
 c.save();c.globalAlpha=.18;c.strokeStyle=C.ice;c.lineWidth=1.4;c.beginPath();c.ellipse(cx,y,rx,ry,0,0,Math.PI*2);c.stroke();
 c.globalAlpha=.07;c.fillStyle='rgba(117,215,231,.22)';c.beginPath();c.ellipse(cx,y,rx,ry,0,0,Math.PI*2);c.fill();
 for(let i=0;i<5;i++){const x=cx-rx*.65+i*rx*.32;line(c,x,y+4,x+(i-2)*8,825,C.muted,1,.14);}
 c.restore();
}
function source(c:CanvasRenderingContext2D,t:number,origin={x:420,y:540}){const cx=origin.x,cy=origin.y;
 // A compact accretion-like field: rings expand continuously, while the
 // small orbiting packets make the source feel volumetric rather than a
 // static target icon.
 for(let k=0;k<7;k++){const r=48+k*42+8*Math.sin(t*.4+k);c.save();c.globalAlpha=.22-k*.024;c.strokeStyle=k%2?C.gold:C.cyan;c.lineWidth=1.5;c.setLineDash([5,13]);c.lineDashOffset=-t*26-k*8;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke();c.restore();}
 for(let i=0;i<18;i++){const a=t*.32+i*Math.PI*2/18;const rr=82+18*Math.sin(t*.21+i*1.7);const x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr*.42;bloom(c,x,y,16,C.gold,.07);orb(c,x,y,2.3,C.gold,.54,.8);}
 bloom(c,cx,cy,250,C.gold,.17);orb(c,cx,cy,25,C.gold,.95,1);dot(c,cx,cy,9,C.ink,.9);
 // A very faint radial fan is a physical cue for the outgoing directions;
 // it sits behind the source and never crosses the subtitle band.
 for(let i=0;i<12;i++){const a=-Math.PI*.88+i*Math.PI*1.76/11;line(c,cx,cy,cx+Math.cos(a)*155,cy+Math.sin(a)*155,C.gold,1,.07+.03*Math.sin(t+i));}
}
function neutrino(c:CanvasRenderingContext2D,t:number,from={x:370,y:540},to={x:1530,y:390}){const p=clamp((t-.15)/3.6);const dx=to.x-from.x,dy=to.y-from.y;const x=from.x+dx*p,y=from.y+dy*p;bloom(c,x,y,72,C.cyan,.25);orb(c,x,y,6,C.cyan,.95,.95);line(c,x-44,y+24,x+43,y-24,C.cyan,2,.75);const pts=[];for(let i=0;i<=64;i++){const u=i/64;pts.push({x:from.x+dx*u,y:from.y+dy*u});}glowPath(c,pts,C.cyan,.28,1.5);
 // After the first arrival, keep a quiet sequence of readout pulses moving
 // along the same path. The trajectory stays fixed, so the extra motion reads
 // as repeated detections rather than a second object being introduced.
 for(let k=0;k<5;k++){const u=(t*.16+k*.23)%1;const q=pts[Math.floor(u*64)];if(q){bloom(c,q.x,q.y,24,C.cyan,.08);orb(c,q.x,q.y,2.8,C.ice,.45,.7);}}
}
/** Opening shot: the incoming messenger is staged as one continuous camera
 * move. A faint lens ring and trailing photons give the audience a physical
 * sense of scale before the detector appears. */
function cosmicArrival(c:CanvasRenderingContext2D,t:number){
 const p=clamp((t-.08)/3.2),from={x:250,y:745},to={x:1600,y:380};
 const pts=[];for(let i=0;i<=96;i++){const u=i/96;pts.push({x:lerp(from.x,to.x,u),y:lerp(from.y,to.y,u)-34*Math.sin(u*Math.PI)*smooth(p)});}
 volumeRibbon(c,pts,C.cyan,t,.95);
 photonTrail(c,from,to,t,C.cyan,4);
 const head=pts[Math.min(96,Math.floor(p*96))];
 if(head){for(let k=0;k<3;k++){const rr=28+k*21+20*smooth(p);c.save();c.globalAlpha=.12*(1-k*.18);c.strokeStyle=k===1?C.gold:C.cyan;c.lineWidth=1.6;c.setLineDash([5,12]);c.lineDashOffset=-t*22;c.beginPath();c.ellipse(head.x,head.y,rr,rr*.34,-.16,0,Math.PI*2);c.stroke();c.restore();}bloom(c,head.x,head.y,120,C.cyan,.3);orb(c,head.x,head.y,8,C.ice,.95,1);}
 // The detector is introduced as a light volume rather than a flat card.
 const reveal=smooth((t-1.1)/1.7);if(reveal>0){const cx=1110,cy=690;for(let i=0;i<6;i++){const rr=(150+i*55)*reveal;c.save();c.globalAlpha=.10*(1-i/8)*reveal;c.strokeStyle=i%2?C.ice:C.cyan;c.lineWidth=1.2;c.beginPath();c.ellipse(cx,cy,rr,rr*.32,-.08,0,Math.PI*2);c.stroke();c.restore();}bloom(c,cx,cy,250,C.cyan,.12*reveal);}
}

/** Opening scale beat inspired by short-form explainers: the audience sees
 * one concrete number at a time while the same camera keeps descending into
 * the ice.  The labels are part of the spatial scene (no card or HUD), and
 * every metric is tied to a visible geometric cue. */
function scaleJourney(c:CanvasRenderingContext2D,t:number){
 const items=[
   {at:.25,value:'1450 m',label:'冰面以下',x:1180,y:500,col:C.gold},
   {at:1.55,value:'5160',label:'光学模块',x:1285,y:650,col:C.cyan},
   {at:2.85,value:'1 km³',label:'透明冰体',x:1110,y:820,col:C.ice},
 ];
 for(const item of items){
   const q=smooth((t-item.at)/.42), hold=smooth((t-(item.at+.42))/.6);
   const a=clamp(q)*(.88-.18*hold); if(a<=0)continue;
   const drift=(1-q)*18;
   c.save();c.globalAlpha=.82*a;c.fillStyle=item.col;c.font='700 40px "Nobel Sans", "Microsoft YaHei", sans-serif';c.fillText(item.value,item.x,item.y-drift);
   c.globalAlpha=.66*a;c.fillStyle=C.muted;c.font='500 17px "Nobel Sans", "Microsoft YaHei", sans-serif';c.fillText(item.label,item.x+2,item.y+25-drift);
   c.globalAlpha=.36*a;c.strokeStyle=item.col;c.lineWidth=1.2;c.setLineDash([4,9]);c.lineDashOffset=-t*18;
   c.beginPath();c.moveTo(item.x-22,item.y+34-drift);c.lineTo(item.x-95,item.y+78-drift);c.stroke();
   c.restore();
 }
 // The modules resolve from an abstract plane into a volume as the last
 // number lands, giving the eye a single continuous reason for the cut.
 const reveal=smooth((t-1.3)/2.7),cx=1480,cy=635;
 for(let j=0;j<7;j++)for(let i=0;i<4;i++){
   const x=cx+(j-3)*30 + (i%2?8:-8), y=cy+(i-1.5)*42;
   const z=180+((j+i*7)%11)*35;const p=project(x-cx,y-cy,z,cx,cy,760);
   const pulse=.18+.42*smooth((reveal-(j+i*7)/55)*2.3);
   bloom(c,p.x,p.y,18*p.q,C.cyan,pulse*.16);orb(c,p.x,p.y,2.2+2.4*p.q,C.ice,pulse*.74,p.q);
 }
}

/** A restrained camera-orbit cue for the ice geometry.  It shares the same
 * anchor points as detector3D, so strings, scan plane and incoming photons
 * remain registered during the orbit. */
function iceOrbit(c:CanvasRenderingContext2D,t:number){
 const yaw=-.25+.18*smooth((t-.2)/2.8),pitch=.04+.06*smooth((t-.5)/2.4);
 const cx=1030,cy=580,depth=680,half=420;
 const near=[projectDepth(-half,-250,0,yaw,pitch,cx,cy,730),projectDepth(half,-250,0,yaw,pitch,cx,cy,730),projectDepth(half,250,0,yaw,pitch,cx,cy,730),projectDepth(-half,250,0,yaw,pitch,cx,cy,730)];
 const far=near.map((_,i)=>projectDepth(i===0||i===3?-half:half,i<2?-250:250,depth,yaw,pitch,cx,cy,730));
 const alpha=smooth((t-.25)/1.6);c.save();c.globalAlpha=.18+.22*alpha;c.strokeStyle=C.ice;c.lineWidth=2;c.beginPath();c.moveTo(near[0].x,near[0].y);for(const p of near.slice(1))c.lineTo(p.x,p.y);c.closePath();c.stroke();c.globalAlpha=.09+.10*alpha;c.fillStyle='rgba(55,190,214,.16)';c.beginPath();c.moveTo(near[0].x,near[0].y);for(const p of near.slice(1))c.lineTo(p.x,p.y);c.closePath();c.fill();for(let i=0;i<4;i++)line(c,near[i].x,near[i].y,far[i].x,far[i].y,C.muted,1.1,.18);c.restore();
 for(let j=0;j<8;j++){const u=(j+.5)/8;const x=-half+u*half*2,z=depth*(.16+.7*u);const a=projectDepth(x,-245,z,yaw,pitch,cx,cy,730),b=projectDepth(x,245,z,yaw,pitch,cx,cy,730);line(c,a.x,a.y,b.x,b.y,C.cyan,1.2,.25);for(let k=0;k<5;k++){const v=(k+.5)/5,q=((t*.3+j*.14+k*.09)%1+1)%1;const p=projectDepth(x,-245+490*v,z,yaw,pitch,cx,cy,730);const pulse=.2+.45*smooth((q-.55+1)%1);orb(c,p.x,p.y,3.4,C.ice,pulse,.55);}}
 const scan=smooth((t-.35)/2.3),sa=projectDepth(-half,-245+490*scan,0,yaw,pitch,cx,cy,730),sb=projectDepth(half,-245+490*scan,0,yaw,pitch,cx,cy,730);line(c,sa.x,sa.y,sb.x,sb.y,C.gold,2,.26+.35*scan);
}
function messengerSplit(c:CanvasRenderingContext2D,t:number){
 const cx=580,cy=505; source(c,t*.35,{x:cx,y:cy});
 // Three messengers leave the same source. The proton bends smoothly in a
 // magnetic field, gamma light fades through intervening dust, while the
 // neutrino keeps its bearing. Keeping one shared origin makes the visual
 // comparison read as a small experiment rather than three title cards.
 const branches=[
   {col:C.gold,dy:-160,bend:0,kind:'gamma'},
   // The charged cosmic-ray path is only gently deflected before its shower;
   // the large visual distinction is that it stops in the Earth, while the
   // neutrino continues on the same bearing.
   {col:C.rose,dy:15,bend:28,kind:'proton'},
   {col:C.cyan,dy:190,bend:0,kind:'neutrino'},
 ] as const;
 branches.forEach((b,j)=>{
   const p=clamp((t-.4-j*.16)/1.8); const pts=[];
   for(let i=0;i<=64;i++){
     const u=i/64, xx=cx+u*910;
     const bend=b.kind==='proton' ? Math.sin(u*Math.PI)*b.bend*(.8+.2*u) : Math.sin(u*Math.PI)*b.bend;
     const yy=cy+b.dy*u+bend;
     pts.push({x:xx,y:yy});
   }
   for(let k=0;k<4;k++){
     const tail=pts.slice(k*8);
     glowPath(c,tail,b.col,.16+.11*(3-k),2.8-k*.45);
   }
   if(b.kind==='proton'){
     for(let k=0;k<3;k++){
       const rr=90+k*52+9*Math.sin(t*.8+k);
       c.save(); c.globalAlpha*=.14; c.strokeStyle=C.rose; c.lineWidth=1.4;
       c.setLineDash([5,12]); c.lineDashOffset=-t*18;
       c.beginPath(); c.arc(cx+220,cy+20,rr,-.9,.7); c.stroke(); c.restore();
     }
   }
    const q=pts[Math.min(64,Math.floor(p*64))];
    if(q){
      const fade=b.kind==='gamma' ? 1-.62*clamp((q.x-cx)/910) : 1;
      bloom(c,q.x,q.y,46,b.col,.18*fade); orb(c,q.x,q.y,5,b.col,.9*fade,.9);
    }
    // A low-contrast runner keeps the three messengers alive during the
    // explanatory sentence after their paths have been drawn.
    const uLoop=(t*.12+j*.23)%1; const loop=pts[Math.floor(uLoop*64)];
    if(loop){bloom(c,loop.x,loop.y,22,b.col,.08);orb(c,loop.x,loop.y,2.6,b.col,.42,.65);}
  });
 // The split is caused by interaction in the source region.  A short-lived
 // shock ring and two bright fragments make that moment legible without a
 // title card or extra text.
 const hit=clamp((t-.25)/.9), hx=cx+128*hit, hy=cy;
 if(hit>0){for(let k=0;k<4;k++){const rr=18+k*18+hit*35;c.save();c.globalAlpha=.16*(1-.35*k)*hit;c.strokeStyle=k%2?C.cyan:C.gold;c.lineWidth=1.2;c.setLineDash([4,9]);c.lineDashOffset=-t*22;c.beginPath();c.arc(hx,hy,rr,0,Math.PI*2);c.stroke();c.restore();}orb(c,hx,hy,8,C.ice,.7,.8);}
 // Three dim after-images mark the causal order of the split.  Their shared
 // origin is deliberately visible, so the paths read as one interaction and
 // do not become three unrelated arrows.
 for(let k=0;k<3;k++){const q=clamp((t-.9-k*.16)/1.2),rr=26+k*24;c.save();c.globalAlpha=.11*(1-q);c.strokeStyle=k===1?C.rose:C.cyan;c.lineWidth=1;c.beginPath();c.ellipse(cx+100*q,cy,rr,rr*.4,0,0,Math.PI*2);c.stroke();c.restore();}
}

/** The significance build is drawn as evidence accumulating over time: a
 * measured event rises from the baseline, then a faint posterior curve
 * tightens around the high-energy tail.  This keeps the 4.1σ/5.7σ wording
 * tied to an actual visual change rather than a static number card. */
function confidenceBuild(c:CanvasRenderingContext2D,t:number,late=false,opacity=1){
 c.save();c.globalAlpha*=opacity;
 const x=350,y=775,w=1100,h=275,reveal=smooth((t-.25)/3.4),count=late?37:28;
 line(c,x,y,x+w,y,C.muted,2,.45);line(c,x,y-h,x,y,C.muted,2,.45);
 const bins=late?22:18;
 for(let i=0;i<bins;i++){
  const u=(i+.5)/bins,expected=Math.exp(-Math.pow((u-(late?.46:.36))/(late?.23:.2),2)*2.3);
  const n=Math.max(1,Math.round((late?5.2:4.0)*expected+(i%4===0?1:0)));
  for(let j=0;j<n;j++){
   const event=((i*n+j)/(bins*n))*count;const q=smooth(reveal*count-event);if(q<=0)continue;
   const xx=x+u*w+(j-(n-1)/2)*9,yy=y-(44+j*23)*q;
   const col=(late&&event>count*.7)?C.gold:C.cyan;
   line(c,xx,y,xx,yy,col,5,.16+.7*q);orb(c,xx,yy,3.5,col,.68,.7);bloom(c,xx,yy,18,col,.09*q);
  }
 }
 const tail=x+w*(late?.78:.64);const tailQ=smooth((t-2.3)/.7);line(c,tail,y-250,tail,y,C.gold,2,.16+.45*tailQ);bloom(c,tail,y-250,68,C.gold,.12*tailQ);dot(c,tail,y-250,5,C.ice,.55+.35*tailQ);
 // posterior envelope, kept low contrast so it does not compete with the
 // paper page on the right-hand side.
 const curve=[];for(let i=0;i<=80;i++){const u=i/80,mu=late?.46:.36,sig=late?.18:.22;curve.push({x:x+u*w,y:y-18-68*Math.exp(-Math.pow((u-mu)/sig,2))*reveal});}glowPath(c,curve,C.ice,.18,1.2);
 if(late&&reveal>.7){c.save();c.globalAlpha=.58*smooth((reveal-.7)/.3);c.fillStyle=C.rose;c.font='500 20px "Nobel Sans", "Microsoft YaHei", sans-serif';c.fillText('event 32  ·  偶然叠在一起的背景 μ 子',x+w*.62,y-205);c.restore();}
 c.restore();
}
function iceVolume(c:CanvasRenderingContext2D,t:number){const x0=380,y0=250,x1=1500,y1=860;const pulse=smooth((t-.15)/2);
 // A transparent volume with a moving caustic wash. The front edge remains
 // crisp while the inner haze makes the detector read as kilometres of ice.
 rounded(c,x0-70,y0-80,x1-x0+140,y1-y0+160,35,'#bce9ef',.055,C.ice);
 const wash=c.createLinearGradient(x0,y0,x1,y1);wash.addColorStop(0,'rgba(91,213,234,.02)');wash.addColorStop(.48,`rgba(91,213,234,${.025+.045*pulse})`);wash.addColorStop(1,'rgba(7,26,41,.02)');c.save();c.fillStyle=wash;c.fillRect(x0-40,y0-40,x1-x0+80,y1-y0+80);c.restore();
 for(let j=0;j<10;j++){const u=j/9;const x=x0+(x1-x0)*u;line(c,x,y0,x+(u-.5)*140,y1,C.ice,1.2,.17);}for(let i=0;i<7;i++){const v=i/6;const y=y0+(y1-y0)*v;line(c,x0,y,x1,y+(v-.5)*100,C.ice,1,.12);}
 const strings=7;for(let j=0;j<strings;j++){const u=(j+.8)/(strings+1);const bx=x0+(x1-x0)*u;const lean=(u-.48)*100;line(c,bx,y0+18,bx+lean,y1-18,C.muted,2,.35);for(let i=0;i<7;i++){const v=(i+.55)/7;const x=bx+lean*v,y=y0+(y1-y0)*v;const active=clamp((t-v*1.5-.4)/.8);const cycle=((t*.12+u*.35+v*.18)%1+1)%1;const shimmer=.5+.5*smooth(cycle);const depth=.6+.4*(1-v*.35);bloom(c,x,y,30,C.cyan,.10+active*.16+shimmer*.08);orb(c,x,y,5,C.ice,.60+.10*shimmer,depth);orb(c,x,y,2.3,C.cyan,.48*active+.24*shimmer,depth);}}
 // A sparse ray field crosses only the upper half of the detector, so it
 // demonstrates incoming information without colliding with subtitles.
 for(let k=0;k<9;k++){const u=((t*.08+k*.17)%1);const sx=x0-100,sy=y0+65+k*42;const ex=x0+200+u*860,ey=sy+115+Math.sin(k+t*.2)*28;const q=clamp((t-.35-k*.08)/1.4);line(c,sx,sy,sx+(ex-sx)*q,sy+(ey-sy)*q,C.cyan,1.4,.07+.18*q);if(q>0)orb(c,sx+(ex-sx)*q,sy+(ey-sy)*q,2.8,C.ice,.48,.8);}
 line(c,x0-48,y0-16,x1+55,y0-16,C.gold,2,.38);const scan=clamp((t-.2)/2.8);line(c,x0-35,y0+(y1-y0)*scan,x1+40,y0+(y1-y0)*scan,C.cyan,2,.4);const scanLoop=(t*.16)%1,sy2=y0+(y1-y0)*scanLoop;line(c,x0-28,sy2,x1+34,sy2,C.cyan,1.6,.20);}
function cone(c:CanvasRenderingContext2D,t:number){
 const cx=1050,cy=555,p=clamp((t-.2)/2.7);
 // For a relativistic charged particle in ice, cos(theta)=1/(n*beta).
 // Using n≈1.31 keeps the cone angle tied to the mechanism instead of an
 // arbitrary triangle while the reveal remains readable at film scale.
 const beta=.92+.075*smooth(p), n=1.319;
 const theta=Math.acos(Math.min(.995,1/(n*beta))), length=500*p;
 const radius=Math.min(350,Math.tan(theta)*length);
 const grad=c.createRadialGradient(cx,cy,0,cx+length*.38,cy,radius*1.15);
 grad.addColorStop(0,'rgba(97,226,242,.26)');grad.addColorStop(1,'transparent');
 c.fillStyle=grad;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+length,cy-radius);c.lineTo(cx+length,cy+radius);c.closePath();c.fill();
 // Perspective shell: two boundary generators and elliptical cross-sections
 // make the Cherenkov cone read as photons emitted on a real cone surface,
 // rather than a filled triangular arrow.
 glowPath(c,[{x:cx,y:cy},{x:cx+length,y:cy-radius}],C.cyan,.24,2.0);
 glowPath(c,[{x:cx,y:cy},{x:cx+length,y:cy+radius}],C.cyan,.24,2.0);
 for(let k=1;k<=4;k++){
   const u=k/5,xx=cx+length*u,rr=Math.max(4,radius*u);
   c.save();c.globalAlpha=.12+.08*p;c.strokeStyle=k%2?C.ice:C.cyan;c.lineWidth=1.15;c.setLineDash([4,9]);c.lineDashOffset=-t*18;
   c.beginPath();c.ellipse(xx,cy,rr*.11,rr*.62,0,0,Math.PI*2);c.stroke();c.restore();
 }
 for(let i=0;i<18;i++){
   const q=clamp((t-i*.045)/1.35), a=-theta+(2*theta*i/17), rr=32+q*length;
   line(c,cx,cy,cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,C.cyan,1.55,.18+.46*q);
   dot(c,cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,3.3,C.cyan,q);
 }
 // A small set of photons rides the cone surface with deterministic phase;
 // their radial position follows the same theta used by the formula.
 for(let i=0;i<26;i++){
   const u=((t*.34+i*.071)%1+1)%1, side=i%2?1:-1, xx=cx+length*(.12+.82*u);
   const yy=cy+side*Math.tan(theta)*(xx-cx)*(0.72+.18*Math.sin(i*2.1));
   bloom(c,xx,yy,11,C.cyan,.05);orb(c,xx,yy,1.5+1.6*(1-u),C.ice,.38,.72);
 }
 for(let k=0;k<5;k++){
   const q=clamp((t-.45-k*.18)/1.4), x=cx+length*(.35+.13*k);
   c.save();c.globalAlpha*=.12*q;c.strokeStyle=k%2?C.cyan:C.ice;c.lineWidth=1.4;c.setLineDash([6,12]);
   c.beginPath();c.ellipse(x,cy,radius*(.2+.15*k)*q,radius*(.06+.05*k)*q,0,0,Math.PI*2);c.stroke();c.restore();
 }
 const ripple=(t*.17)%1;
 const rx=cx+length*(.25+.55*ripple), rr=Math.max(8,radius*(.10+.30*ripple));
 c.save();c.globalAlpha=.14*(1-ripple);c.strokeStyle=C.ice;c.lineWidth=1.8;c.beginPath();c.ellipse(rx,cy,rr,rr*.26,-theta*.4,0,Math.PI*2);c.stroke();c.restore();
}
function detector3D(c:CanvasRenderingContext2D,t:number){
  const cx=1020,cy=555,depth=760,half=440;
  const yaw=-.18+.12*Math.sin(t*.34), pitch=.045+.025*Math.sin(t*.27);
  // Keep the near plane at z=0 and the far plane positive. A negative z
  // plane crosses the perspective camera and creates giant corner lines at
  // the edge of the frame when the detector yaw changes.
  const top=projectDepth(-half,-270,0,yaw,pitch,cx,cy,740);
  const tr=projectDepth(half,-270,0,yaw,pitch,cx,cy,740);
  const bl=projectDepth(-half,270,0,yaw,pitch,cx,cy,740);
  const br=projectDepth(half,270,0,yaw,pitch,cx,cy,740);
  const front=[top,tr,br,bl];
  path(c,[top,tr,br,bl,top],C.ice,2.2,.48);
  // Subtle front-plane shading gives the box a glass volume. It is clipped by
  // the scene's safe band, so it cannot tint the title or subtitles.
  const fg=c.createLinearGradient(top.x,top.y,br.x,br.y);fg.addColorStop(0,'rgba(120,230,240,.015)');fg.addColorStop(.52,'rgba(91,205,224,.06)');fg.addColorStop(1,'rgba(7,24,40,.02)');c.save();c.fillStyle=fg;c.globalAlpha=.9;c.beginPath();c.moveTo(top.x,top.y);c.lineTo(tr.x,tr.y);c.lineTo(br.x,br.y);c.lineTo(bl.x,bl.y);c.closePath();c.fill();c.restore();

  // A dim back plane makes the detector read as a volume instead of a flat HUD.
  const back=[
    projectDepth(-half,-270,depth/2,yaw,pitch,cx,cy,740),
    projectDepth(half,-270,depth/2,yaw,pitch,cx,cy,740),
    projectDepth(half,270,depth/2,yaw,pitch,cx,cy,740),
    projectDepth(-half,270,depth/2,yaw,pitch,cx,cy,740),
  ];
  path(c,back,C.muted,1.2,.18);
  for(let i=0;i<4;i++) line(c,front[i].x,front[i].y,back[i].x,back[i].y,C.muted,1,.16);

  // A translucent depth plane travels through the detector. Its projected
  // corners share the same yaw/pitch as the strings below, so the scan reads
  // as a real volume rather than a flat HUD overlay.
  const planeU=.18+.58*smooth((t*.075)%1);
  const planeZ=depth*planeU;
  const plane=[
    projectDepth(-half,-270,planeZ,yaw,pitch,cx,cy,740),
    projectDepth(half,-270,planeZ,yaw,pitch,cx,cy,740),
    projectDepth(half,270,planeZ,yaw,pitch,cx,cy,740),
    projectDepth(-half,270,planeZ,yaw,pitch,cx,cy,740),
  ];
  const pg=c.createLinearGradient(plane[0].x,plane[0].y,plane[2].x,plane[2].y);
  pg.addColorStop(0,'rgba(85,212,229,.015)');pg.addColorStop(.5,'rgba(85,212,229,.10)');pg.addColorStop(1,'rgba(85,212,229,.015)');
  c.save();c.fillStyle=pg;c.globalAlpha=.72;c.beginPath();c.moveTo(plane[0].x,plane[0].y);for(let i=1;i<plane.length;i++)c.lineTo(plane[i].x,plane[i].y);c.closePath();c.fill();
  c.globalAlpha=.25;c.strokeStyle=C.cyan;c.lineWidth=1.3;c.setLineDash([3,12]);c.lineDashOffset=-t*22;c.stroke();c.restore();

  const cols=9,rows=5;
  for(let j=0;j<cols;j++){
    const u=j/(cols-1), x=-half+u*half*2;
    // Each string is a vertical line at a fixed depth. The module dots use
    // exactly the same x/z anchor, so they cannot drift away from the string
    // when the detector rotates in perspective.
    const stringZ=depth*(.22+.56*u);
    const b=projectDepth(x,270,stringZ,yaw,pitch,cx,cy,740);
    const a=projectDepth(x,-270,stringZ,yaw,pitch,cx,cy,740);
    line(c,a.x,a.y,b.x,b.y,C.muted,1.5,.28);
    for(let i=0;i<rows;i++){
      const v=(i+.7)/rows;
      const p=projectDepth(x,-270+540*v,stringZ,yaw,pitch,cx,cy,740);
      const wave=clamp((t-u*.15-v*.08)/.7);
      // Once the first scan has crossed the array, a slower deterministic
      // shimmer keeps the module readout alive without changing its geometry.
      const cycle=((t*.12-u*.15-v*.08)%1+1)%1;
      const qe=.58+.34*rnd(j*97+i*13), pulse=qe*(.24+.42*wave+.34*smooth(cycle));
      bloom(c,p.x,p.y,27+10*qe,C.cyan,.08+.19*pulse);
      // Depth shrinks and dims the farther modules; this stabilises the
      // perspective cue when the camera yaws and keeps the detector alive.
      const depthFactor=.62+.38*(1-u);
      // Pressure sphere + cable, instead of a flat dot: the module now reads
      // as the optical hardware suspended in the ice. Keep the old glow as a
      // low-opacity halo so the visual language remains continuous with V09.
      opticalModule(c,p.x,p.y,(4.2+1.1*qe)*depthFactor,pulse,depthFactor);
      orb(c,p.x,p.y,(2.0+0.9*qe)*depthFactor,C.cyan,.42*pulse*depthFactor,depthFactor);
      if((i+j)%4===0){
        const prev=projectDepth(x,-270+540*Math.max(0,v-.18),stringZ,yaw,pitch,cx,cy,740);
        line(c,prev.x,prev.y,p.x,p.y,C.cyan,1,.12+.18*pulse);
      }
    }
  }

  // A slow scan plane supplies a clear input→readout beat while the camera drifts.
  const scan=clamp((t-.15)/2.6), sy=-270+540*scan;
  const sa=projectDepth(-half,sy,0,yaw,pitch,cx,cy,740);
  const sb=projectDepth(half,sy,0,yaw,pitch,cx,cy,740);
  line(c,sa.x,sa.y,sb.x,sb.y,C.cyan,2.5,.16+.28*smooth(scan));
}
/** A restrained IceCube reconstruction: the cube has visible depth, sparse
 * cable strings and DOMs whose size follows perspective. The geometry is a
 * teaching reconstruction of the real layout, so the scene reads as an
 * instrument in ice instead of a flat HUD grid. */
function detectorCubeReal(c:CanvasRenderingContext2D,t:number,activity=0){
 const cx=1000,cy=610,halfX=430,halfY=270,depth=780;
 const yaw=-.38+.10*Math.sin(t*.17),pitch=.13+.025*Math.sin(t*.11);
 const plane=(z:number)=>[
   projectDepth(-halfX,-halfY,z,yaw,pitch,cx,cy,760),projectDepth(halfX,-halfY,z,yaw,pitch,cx,cy,760),
   projectDepth(halfX,halfY,z,yaw,pitch,cx,cy,760),projectDepth(-halfX,halfY,z,yaw,pitch,cx,cy,760),
 ];
 const front=plane(0),back=plane(depth);
 path(c,[...front,front[0]],C.ice,2.2,.34);path(c,[...back,back[0]],C.muted,1.2,.16);
 for(let i=0;i<4;i++)line(c,front[i].x,front[i].y,back[i].x,back[i].y,C.muted,1.2,.14);
 for(let k=1;k<4;k++){const p=plane(depth*k/4);path(c,[...p,p[0]],C.cyan,1,.055);}
 const strings=14,rows=9;
 for(let s=0;s<strings;s++){
   const u=s/(strings-1), x=-halfX+u*halfX*2, z=depth*(.12+.74*((s*5)%strings)/(strings-1));
   const top=projectDepth(x,-halfY,z,yaw,pitch,cx,cy,760),bot=projectDepth(x,halfY,z,yaw,pitch,cx,cy,760);
   line(c,top.x,top.y,bot.x,bot.y,C.muted,1.3,.17+.08*(1-u));
   for(let r=0;r<rows;r++){
     const v=(r+.45)/rows, y=-halfY+v*halfY*2;
     const p=projectDepth(x,y,z,yaw,pitch,cx,cy,760);
     const wave=smooth((t-(s*.09+r*.075)-.15)/.38),cyc=.5+.5*Math.sin(t*.8+s*.33+r*.51);
     const hit=clamp(activity*.8+.15*wave+.09*cyc),q=.60+.40*p.q;
     bloom(c,p.x,p.y,24*q,C.cyan,.035+.12*hit);orb(c,p.x,p.y,(3.4+2.4*hit)*q,C.ice,.26+.50*hit,q);
     if(hit>.35){c.save();c.globalAlpha=.18*hit;c.strokeStyle=C.cyan;c.lineWidth=1;c.beginPath();c.arc(p.x,p.y,10+18*hit,0,Math.PI*2);c.stroke();c.restore();}
   }
 }
 const scan=smooth((t-.3)/2.8),sy=-halfY+2*halfY*scan;
 const a=projectDepth(-halfX,sy,0,yaw,pitch,cx,cy,760),b=projectDepth(halfX,sy,0,yaw,pitch,cx,cy,760);
 line(c,a.x,a.y,b.x,b.y,C.gold,1.8,.14+.24*scan);
}
/** A localized collision scene keeps the causal event grounded: the neutral
 * messenger stays visually quiet, the nucleus flashes briefly, and only then
 * does the charged secondary open the blue light cone. */
function collisionReal(c:CanvasRenderingContext2D,t:number){
 const cx=840,cy=585,entry={x:360,y:700},vertex={x:cx,y:cy},exit={x:1450,y:430};
 const approach=smooth((t-.18)/1.2),burst=smooth((t-1.02)/.34),travel=smooth((t-1.25)/1.45);
 const nx=entry.x+(vertex.x-entry.x)*approach,ny=entry.y+(vertex.y-entry.y)*approach;
 line(c,entry.x,entry.y,nx,ny,C.violet,1.4,.28+.34*approach);bloom(c,nx,ny,20,C.violet,.06*approach);orb(c,nx,ny,3.2,C.ice,.46,.7);
 if(burst>0){const rr=8+34*burst;c.save();c.globalAlpha=.26*(1-burst);c.strokeStyle=C.gold;c.lineWidth=1.8;c.beginPath();c.arc(cx,cy,rr,0,Math.PI*2);c.stroke();c.restore();bloom(c,cx,cy,42,C.gold,.20*(1-burst));orb(c,cx,cy,8,C.gold,.72,.9);}
 const ex=vertex.x+(exit.x-vertex.x)*travel,ey=vertex.y+(exit.y-vertex.y)*travel;
 line(c,vertex.x,vertex.y,ex,ey,C.ice,2.2,.18+.52*travel);bloom(c,ex,ey,30,C.cyan,.08*travel);orb(c,ex,ey,4.5,C.ice,.58,.8);
 if(travel>.15){const len=420*travel,theta=.70;for(let k=0;k<13;k++){const u=k/12,ang=-theta+2*theta*u,rr=len*(.42+.58*u);line(c,cx,cy,cx+Math.cos(ang)*rr,cy+Math.sin(ang)*rr,C.cyan,1.15,.12+.32*travel);}}
}
/** A structured cascade: elongated secondaries leave a compact vertex and
 * terminate in a small footprint, matching the local energy deposition seen
 * in IceCube event displays more closely than an isotropic particle cloud. */
function cascadeReal(c:CanvasRenderingContext2D,t:number){
 const cx=910,cy=585,p=smooth((t-.12)/2.2);
 const parent=[{x:430,y:390},{x:670,y:480},{x:cx,y:cy}];
 const head=spline(parent[0],parent[1],parent[2],p);if(head){glowPath(c,parent,C.violet,.30,2.1);orb(c,head.x,head.y,5,C.ice,.76,.8);}
 for(let i=0;i<34;i++){
   const a=-1.12+i/33*2.24,length=(80+210*rnd(i+31))*p,bend=.34*Math.sin(i*1.7);
   const ex=cx+Math.cos(a)*length,ey=cy+Math.sin(a)*length*.56+bend*length*.13;
   line(c,cx,cy,ex,ey,i%7===0?C.gold:C.cyan,1.15,.12+.28*p);
   const u=(t*.13+i*.071)%1,q=smooth((u-.18+1)%1),px=cx+(ex-cx)*q,py=cy+(ey-cy)*q;
   bloom(c,px,py,14,C.cyan,.06*p);orb(c,px,py,1.8,C.ice,.28+.35*p,.6);
 }
 for(let k=0;k<4;k++){const rr=28+k*25+8*Math.sin(t*.7+k);c.save();c.globalAlpha=.15*(1-k/5)*p;c.strokeStyle=k%2?C.cyan:C.gold;c.lineWidth=1.2;c.beginPath();c.ellipse(cx,cy,rr,rr*.52,0,0,Math.PI*2);c.stroke();c.restore();}
 bloom(c,cx,cy,120,C.cyan,.12*p);orb(c,cx,cy,10,C.gold,.75,.95);
}
function track(c:CanvasRenderingContext2D,t:number){const p=clamp((t-.15)/2.2);const pts=[];for(let i=0;i<=120;i++){const u=i/120;pts.push({x:430+u*980,y:610-178*u-32*Math.sin(u*Math.PI)*u});}
 glowPath(c,pts,C.cyan,.58,2.6);
 // Charged secondaries peel away from the main track with a shallow cone;
 // their starts and directions stay tied to the same spline anchor.
 for(let j=0;j<8;j++){const u=.18+j*.085;const q=pts[Math.floor(u*120)];const q2=pts[Math.min(120,Math.floor((u+.13)*120))];if(!q||!q2)continue;const dx=q2.x-q.x,dy=q2.y-q.y;const n=Math.hypot(dx,dy)||1;const nx=-dy/n,ny=dx/n;const spread=(j%2?-1:1)*(18+18*Math.sin(t*.6+j));line(c,q.x,q.y,q.x+dx*.38+nx*spread,q.y+dy*.38+ny*spread,C.ice,1,.12+.08*smooth(p));}
 for(let i=0;i<34;i++){const u=clamp(p-i*.013);const q=spline(pts[0],pts[55],pts[120],u);if(q){const r=3.2+2.2*(1-i/34);bloom(c,q.x,q.y,34,C.cyan,.18);orb(c,q.x,q.y,r,C.cyan,.74,.8);}}
 const head=spline(pts[0],pts[55],pts[120],Math.min(1,p));if(head){bloom(c,head.x,head.y,96,C.cyan,.30);orb(c,head.x,head.y,7,C.ice,.96,1);}
 for(let k=0;k<5;k++){const u=(t*.14+k*.21)%1;const q=spline(pts[0],pts[55],pts[120],u);if(q){bloom(c,q.x,q.y,22,C.cyan,.07);orb(c,q.x,q.y,2.5,C.ice,.38,.65);}}
}
function cascade(c:CanvasRenderingContext2D,t:number){const p=clamp((t-.1)/2.2),cx=1060,cy=565;
 // Incoming track and a compact shower core establish scale before the
 // secondaries fan out. The parent remains visible for the whole explanation.
 const parent=[{x:520,y:380},{x:820,y:470},{x:cx,y:cy}];glowPath(c,parent,C.cyan,.26,2.2);const head=spline(parent[0],parent[1],parent[2],p);if(head){orb(c,head.x,head.y,6,C.ice,.9,.9);bloom(c,head.x,head.y,46,C.cyan,.18);}
 for(let i=0;i<115;i++){const a=rnd(i)*Math.PI*2,rad=(20+Math.pow(rnd(i+3),.45)*320)*p;const x=cx+Math.cos(a)*rad,y=cy+Math.sin(a)*rad*.55;const col=i%5===0?C.gold:C.cyan;bloom(c,x,y,16+8*rnd(i+7),col,.14*p);orb(c,x,y,1.7+1.2*rnd(i+11),col,.3+.55*p,.55+.45*(1-rad/340));}
 for(let k=0;k<6;k++){const r=44+k*30+12*Math.sin(t+k);c.save();c.globalAlpha=.20*(1-k/8)*p;c.strokeStyle=k%2?C.gold:C.cyan;c.lineWidth=1.5;c.setLineDash([4,10]);c.lineDashOffset=-t*18;c.beginPath();c.ellipse(cx,cy,r,r*.52,0,0,Math.PI*2);c.stroke();c.restore();}
 // Three visible branches give the shower a directional structure instead of
 // a uniformly random burst.
 for(let j=0;j<3;j++){const a=-.9+j*.9;const q=clamp((p-.18-j*.04)/.82);const ex=cx+Math.cos(a)*240*q,ey=cy+Math.sin(a)*130*q;line(c,cx,cy,ex,ey,j===1?C.gold:C.cyan,1.8,.3*q);}
 bloom(c,cx,cy,210,C.cyan,.18*p);orb(c,cx,cy,16,C.gold,.8,1);
}
function spectrum(c:CanvasRenderingContext2D,t:number,stage:'early'|'late'='early'){
 // The two dates are intentionally separate states. 2013 contributes 28
 // events at 4.1σ; the three-year 2014 analysis contains 37 candidates and
 // reaches 5.7σ. The chart never presents those values as one dataset.
 const x=380,y=780,w=1070,h=300;
 line(c,x,y,x+w,y,C.muted,2,.45);line(c,x,y-h,x,y,C.muted,2,.45);
 const early=[1,2,1,3,2,4,3,3,2,2,1,1,1,1,1];
 const late=[1,2,2,3,3,4,3,4,3,3,2,2,1,1,1,1,1];
 const counts=stage==='early'?early:late;
 const total=stage==='early'?28:37;
 const localT=stage==='early'?t:Math.max(0,t);
 const reveal=smooth((localT-.2)/3.0);const shown=reveal*total;
 let idx=0;
 for(let b=0;b<counts.length;b++){
   const u=(b+.5)/counts.length; const bh=38+counts[b]*34;
   for(let j=0;j<counts[b];j++){
     const eventProgress=clamp(shown-idx); const visible=eventProgress>0; idx++;
     const xx=x+u*w+(j-(counts[b]-1)/2)*12;
     const yy=y-(bh-12*j)*smooth(eventProgress);
     const special=stage==='late'&&idx===32;
     const col=special?C.rose:C.gold;
     const a=visible?(.24+.66*smooth(eventProgress)):0;
     line(c,xx,y,xx,yy,col,6,a);
     if(visible){orb(c,xx,yy,4.5,special?C.rose:C.ice,.78,.85);bloom(c,xx,yy,24,special?C.rose:C.cyan,.10);}
     if(special&&visible){dot(c,xx+8,yy-8,3.2,C.rose,.75);line(c,xx,yy,xx+8,yy-8,C.rose,1.2,.55);}
   }
 }
 // A soft expected-background curve turns the bars into a measurement rather
 // than a stack of decorative lines. It is a visual guide, not a new fitted
 // statistic; its amplitude remains deliberately low.
 const curve:{x:number;y:number}[]=[];for(let i=0;i<=80;i++){const u=i/80;const mu=stage==='early'?.36:.47;const sig=stage==='early'?.19:.22;const g=Math.exp(-((u-mu)*(u-mu))/(2*sig*sig));curve.push({x:x+u*w,y:y-22-78*g*reveal});}glowPath(c,curve,C.cyan,.22,1.35);
 const thresholdX=x+w*(stage==='early'?.64:.78);
 c.save();c.globalAlpha=.18+.48*reveal;c.strokeStyle=C.cyan;c.lineWidth=2;c.setLineDash([7,12]);c.beginPath();c.moveTo(thresholdX,y-265);c.lineTo(thresholdX,y);c.stroke();c.restore();
 const halo=smooth((localT-2.2)/.5);bloom(c,thresholdX,y-265,58,C.cyan,.12*halo);dot(c,thresholdX,y-265,5,C.ice,.55+.35*halo);
 c.save();c.globalAlpha=.74+.22*halo;c.fillStyle=C.ink;c.font='600 30px "Nobel Sans", "Microsoft YaHei", sans-serif';c.fillText(stage==='early'?'28  ·  4.1σ':'37  ·  5.7σ',thresholdX+18,y-232);if(stage==='late'){c.fillStyle=C.rose;c.font='500 20px "Nobel Sans", "Microsoft YaHei", sans-serif';c.fillText('event 32：背景双 μ 子',thresholdX+18,y-202);}c.restore();
}
function backgroundFilter(c:CanvasRenderingContext2D,t:number){
 const cx=770,ground=785;
 // Earth is the physical veto: the lower hemisphere blocks the downward
 // atmospheric shower, while a rare upward-going track survives the shield.
 const earth=c.createRadialGradient(cx,ground+110,30,cx,ground+110,430);
 earth.addColorStop(0,'rgba(44,108,145,.32)');earth.addColorStop(.72,'rgba(17,48,70,.58)');earth.addColorStop(1,'rgba(4,17,28,.94)');
 c.save();c.fillStyle=earth;c.beginPath();c.arc(cx,ground+110,430,Math.PI,Math.PI*2);c.fill();c.restore();
 // Atmospheric showers enter at a range of zenith angles. Their streaks
 // taper as they approach the Earth so the veto reads as a real volume.
 for(let i=0;i<14;i++){
   const sx=330+rnd(i+800)*880, sy=190+rnd(i+840)*130;
   const ex=cx+(sx-cx)*.42, ey=ground-30-rnd(i+860)*110;
   const q=clamp((t-.15-i*.045)/1.25);
   line(c,sx,sy,sx+(ex-sx)*q,sy+(ey-sy)*q,C.rose,2,.12+.30*q);
   if(q>0){const px=sx+(ex-sx)*q,py=sy+(ey-sy)*q;bloom(c,px,py,22,C.rose,.08);orb(c,px,py,3.2,C.rose,.55,.7);}
 }
 const up=clamp((t-.6)/1.8);const ux=cx+50,uy=ground+65;const topY=350;
 glowPath(c,[{x:ux,y:uy},{x:ux,y:topY}],C.cyan,.24,4.2);
 line(c,ux,uy,ux+(cx-ux)*up,uy+(topY-uy)*up,C.cyan,5,.16+.64*up);
 for(let i=0;i<10;i++){const q=clamp(up-i*.07);const py=uy+(topY-uy)*q;orb(c,ux,py,4,C.ice,.35+.45*q,.85);bloom(c,ux,py,28,C.cyan,.08*q);}
 c.save();c.globalAlpha=.24+.22*up;c.strokeStyle=C.cyan;c.lineWidth=2;c.setLineDash([5,10]);c.beginPath();c.arc(ux,uy,76,-Math.PI*.95,-Math.PI*.05);c.stroke();c.restore();
 // A narrow aperture indicates the selection step without turning it into a
 // dashboard: the accepted upward path passes, the shower fades at Earth.
 const gateY=ground-115;line(c,cx-170,gateY,cx+170,gateY,C.cyan,2,.18+.24*up);line(c,cx-165,gateY-18,cx-165,gateY+18,C.cyan,2,.16+.22*up);line(c,cx+165,gateY-18,cx+165,gateY+18,C.cyan,2,.16+.22*up);
 const gatePulse=(t*.18)%1;const gx=cx-160+gatePulse*320;line(c,gx,gateY-27,gx,gateY+27,C.ice,1.8,.18+.20*up);bloom(c,gx,gateY,26,C.cyan,.08);
}
function focusSources(c:CanvasRenderingContext2D,t:number){const p=smooth((t-.2)/1.5);const cx=1320,cy=505;
 // Three candidate directions emerge from a common detector anchor. A faint
 // parallax starfield behind the endpoints turns the rays into a spatial
 // pointing exercise instead of a flat fan.
 for(let i=0;i<18;i++){const a=i*2.4;const r=230+95*rnd(i+41);const sx=cx+Math.cos(a)*r,sy=cy+Math.sin(a)*r*.48;orb(c,sx,sy,1.4,C.ice,.2,.5);}
 for(let i=0;i<3;i++){const a=-.8+i*.8;const len=450*p;const col=i===1?C.gold:C.cyan;const end={x:cx+Math.cos(a)*len,y:cy+Math.sin(a)*len};glowPath(c,[{x:cx,y:cy},end],col,.32,2.5);orb(c,end.x,end.y,7,col,.8,1);bloom(c,end.x,end.y,60,col,.2);const u=(t*.16+i*.27)%1;const qx=cx+Math.cos(a)*len*u,qy=cy+Math.sin(a)*len*u;bloom(c,qx,qy,24,col,.10);orb(c,qx,qy,3,col,.6,.7);}
 // The central source breathes very slightly; this is a continuous light cue,
 // not a title-card pulse, and it remains below the safe header band.
 bloom(c,cx,cy,90,C.gold,.08+.04*Math.sin(t*.7));orb(c,cx,cy,5,C.ice,.68,.9);
 // Compact host-galaxy silhouettes at the ray endpoints.  They are a
 // visual metaphor for candidate directions, not a claim that the detector
 // has imaged the source; their low contrast keeps the measured tracks
 // dominant and gives the scene a cinematic depth cue.
 for(let i=0;i<3;i++){const a=-.8+i*.8,len=450*p,ex=cx+Math.cos(a)*len,ey=cy+Math.sin(a)*len;const rr=26+10*Math.sin(t*.4+i);c.save();c.globalAlpha=.22+.18*p;c.strokeStyle=i===1?C.gold:C.ice;c.lineWidth=1.4;c.beginPath();c.ellipse(ex,ey,rr*1.7,rr*.6,a*.4,0,Math.PI*2);c.stroke();for(let k=0;k<7;k++){const u=(t*.1+k*.17+i*.2)%1;const gx=ex+Math.cos(u*Math.PI*2)*rr*(.5+.5*rnd(k+41));const gy=ey+Math.sin(u*Math.PI*2)*rr*.34;bloom(c,gx,gy,10,C.gold,.06);dot(c,gx,gy,1.4,i===1?C.gold:C.ice,.28);}c.restore();}
}
/** Convert ordered DOM flashes into a pointing cue.  The hit positions stay
 * registered to one spline; only the readout pulse and the reconstructed ray
 * move, so the scene reads as measurement followed by inference. */
function timingReadout(c:CanvasRenderingContext2D,t:number){
 const anchors=[{x:360,y:710},{x:475,y:650},{x:590,y:608},{x:705,y:560},{x:820,y:520},{x:935,y:488}];
 const q=smooth((t-.25)/2.2);
 path(c,anchors,C.muted,1.2,.22);
 anchors.forEach((p,i)=>{
   const hit=smooth((q-(i/anchors.length)*.64)*2.2);
   const a=.25+.58*hit;
   bloom(c,p.x,p.y,32,C.cyan,a*.18);orb(c,p.x,p.y,4.2,C.ice,a,.84);
   if(hit>.02){const r=12+34*hit;c.save();c.globalAlpha=.28*(1-hit);c.strokeStyle=C.cyan;c.lineWidth=1.4;c.beginPath();c.arc(p.x,p.y,r,0,Math.PI*2);c.stroke();c.restore();}
 });
 const rayQ=smooth((t-1.65)/1.15), start=anchors[0], end=anchors[anchors.length-1];
 if(rayQ>0){const ex=lerp(end.x,end.x+190,rayQ),ey=lerp(end.y,end.y-115,rayQ);glowPath(c,[start,{x:680,y:590},{x:ex,y:ey}],C.gold,.38,2.3);bloom(c,ex,ey,48,C.gold,.18*rayQ);orb(c,ex,ey,6,C.gold,.86,.95);}
 const labelQ=smooth((t-2.35)/.5);if(labelQ>0){c.save();c.globalAlpha=.66*labelQ;c.fillStyle=C.gold;c.font='600 21px "Nobel Sans", "Microsoft YaHei", sans-serif';c.fillText('到达时间差 → 来向',520,785);c.restore();}
}

/**
 * V11 redraw primitives: a paper-faithful IceCube cutaway and event display.
 * The geometry is intentionally restrained: a finite ice volume, suspended
 * pressure spheres, a charged-particle vertex, and a measured light cone.
 * Every coordinate is deterministic and projected by the same camera, so the
 * objects read as one instrument rather than a collection of HUD strokes.
 */
function poly(c:CanvasRenderingContext2D,pts:{x:number;y:number}[],fill:string,a=1,stroke?:string,w=1){
 if(!pts.length)return;c.save();c.globalAlpha*=a;c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(const p of pts.slice(1))c.lineTo(p.x,p.y);c.closePath();if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=w;c.stroke();}c.restore();
}
function domV11(c:CanvasRenderingContext2D,x:number,y:number,r:number,pulse=0,depth=1){
 const rr=Math.max(2,r), halo=.04+.18*clamp(pulse);
 bloom(c,x,y,rr*(5.8+5*pulse),C.cyan,halo*depth);
 c.save();c.globalAlpha*=.68+.22*depth;c.strokeStyle='rgba(224,251,255,.84)';c.lineWidth=Math.max(.7,rr*.14);c.beginPath();c.arc(x,y,rr,0,Math.PI*2);c.stroke();
 const g=c.createRadialGradient(x-rr*.30,y-rr*.35,rr*.04,x,y,rr*1.12);g.addColorStop(0,'#ffffff');g.addColorStop(.18,C.ice);g.addColorStop(.56,C.cyan);g.addColorStop(1,'rgba(20,95,132,.12)');c.fillStyle=g;c.beginPath();c.arc(x,y,rr,0,Math.PI*2);c.fill();
 c.globalAlpha*=.62+.38*clamp(pulse);c.strokeStyle=C.gold;c.lineWidth=Math.max(.55,rr*.10);c.beginPath();c.arc(x,y,rr*.66,-2.45,-.62);c.stroke();c.restore();
}
function iceSurfaceV11(c:CanvasRenderingContext2D,t:number){
 const x0=280,x1=1670,y=320;
 const snow=[{x:x0,y:y+18},{x:x0+230,y:y-16},{x:x0+540,y:y+8},{x:x0+860,y:y-22},{x:x0+1120,y:y+10},{x:x1,y:y-10},{x:x1,y:y+55},{x:x0,y:y+55}];
 poly(c,snow,'rgba(184,230,238,.09)',1,'rgba(214,248,250,.30)',1.5);
 for(let i=1;i<8;i++){const yy=y+65+i*66+10*Math.sin(t*.11+i);const pts=[];for(let j=0;j<=40;j++){const u=j/40;pts.push({x:x0+(x1-x0)*u,y:yy+7*Math.sin(u*6.3+i*1.7+t*.025)+2*Math.sin(u*19+i)});}path(c,pts,i%3===0?'#94d9e2':'#c4eef1',1.15,.075-.006*i);}
 const holeX=1050,holeY=y+10; c.save();c.globalAlpha=.22;c.strokeStyle=C.ice;c.lineWidth=2;c.beginPath();c.ellipse(holeX,holeY,170,24,0,0,Math.PI*2);c.stroke();c.globalAlpha=.08;c.fillStyle=C.cyan;c.beginPath();c.ellipse(holeX,holeY,170,24,0,0,Math.PI*2);c.fill();c.restore();
}
function iceCubeV11(c:CanvasRenderingContext2D,t:number,activity=0){
 const cx=1040,cy=605,halfX=450,halfY=245,depth=760;
 const yaw=-.35+.07*Math.sin(t*.16),pitch=.12+.018*Math.sin(t*.12);
 const P=(x:number,y:number,z:number)=>projectDepth(x,y,z,yaw,pitch,cx,cy,780);
 const plane=(z:number)=>[P(-halfX,-halfY,z),P(halfX,-halfY,z),P(halfX,halfY,z),P(-halfX,halfY,z)];
 const front=plane(0),back=plane(depth);
 poly(c,back,'rgba(37,111,144,.045)',1,'rgba(166,229,237,.20)',1.1);poly(c,front,'rgba(80,191,211,.055)',1,'rgba(204,244,246,.48)',2);
 for(let i=0;i<4;i++)line(c,front[i].x,front[i].y,back[i].x,back[i].y,C.muted,1.2,.20);
 for(let k=1;k<5;k++){const q=plane(depth*k/5);path(c,[...q,q[0]],C.cyan,1,.035);}
 // Draw rear strings first, then front strings, giving a stable depth order.
 const strings=12,rows=8;const order=Array.from({length:strings},(_,i)=>i).sort((a,b)=>b-a);
 for(const si of order){const u=si/(strings-1),x=-halfX+u*halfX*2,z=depth*(.10+.78*u);const top=P(x,-halfY,z),bot=P(x,halfY,z);line(c,top.x,top.y,bot.x,bot.y,C.muted,1.25,.18+.06*(1-u));for(let ri=0;ri<rows;ri++){const v=(ri+.48)/rows,y=-halfY+v*halfY*2,p=P(x,y,z);const wave=smooth((t-(si*.12+ri*.065)-.1)/.48),cycle=.5+.5*Math.sin(t*.75+si*.31+ri*.53);const pulse=clamp(activity*.92+.13*wave+.08*cycle),q=.62+.38*p.q;domV11(c,p.x,p.y,(4.8+2.6*pulse)*q,pulse,q);}}
 // A scan sheet sweeps through the array; it shares the same projected plane.
 const scan=smooth((t-.25)/2.9),sy=-halfY+2*halfY*scan,a=P(-halfX,sy,0),b=P(halfX,sy,0);line(c,a.x,a.y,b.x,b.y,C.gold,2.1,.18+.32*scan);
 iceSurfaceV11(c,t*.7);
}
function cerenkovV11(c:CanvasRenderingContext2D,t:number){
 const cx=860,cy=585,entry={x:370,y:705},vertex={x:cx,y:cy};
 const approach=smooth((t-.10)/1.05),burst=smooth((t-.95)/.32),travel=smooth((t-1.16)/1.55);
 const nx=lerp(entry.x,vertex.x,approach),ny=lerp(entry.y,vertex.y,approach);line(c,entry.x,entry.y,nx,ny,C.violet,1.4,.18+.35*approach);orb(c,nx,ny,3.1,C.ice,.46,.75);
 if(burst>0){bloom(c,cx,cy,50,C.gold,.17*(1-burst));for(let k=0;k<3;k++){c.save();c.globalAlpha=.27*(1-burst);c.strokeStyle=k===1?C.gold:C.cyan;c.lineWidth=1.5;c.beginPath();c.arc(cx,cy,12+k*18+35*burst,0,Math.PI*2);c.stroke();c.restore();}}
 const ang=.68, length=540*travel, radius=Math.tan(ang)*length;
 // A translucent conical shell, with longitudinal generators and elliptical slices.
 const conePts=[{x:cx,y:cy-radius*.03},{x:cx+length,y:cy-radius},{x:cx+length,y:cy+radius},{x:cx,y:cy+radius*.03}];poly(c,conePts,'rgba(68,196,220,.035)',1,'rgba(113,227,238,.42)',1.6);
 for(let k=1;k<6;k++){const u=k/6,xx=cx+length*u,rr=radius*u;c.save();c.globalAlpha=.13+.12*travel;c.strokeStyle=k%2?C.ice:C.cyan;c.lineWidth=1.05;c.beginPath();c.ellipse(xx,cy,rr*.10,rr*.58,0,0,Math.PI*2);c.stroke();c.restore();}
 for(let i=0;i<18;i++){const phase=((t*.32+i*.083)%1+1)%1,xx=cx+length*(.08+.82*phase),side=i%2?1:-1,yy=cy+side*Math.tan(ang)*(xx-cx)*(.74+.17*Math.sin(i*1.77));bloom(c,xx,yy,12,C.cyan,.06);orb(c,xx,yy,1.4+1.5*(1-phase),C.ice,.30+.28*travel,.75);}
 const ex=vertex.x+820*travel,ey=vertex.y-165*travel;line(c,vertex.x,vertex.y,ex,ey,C.ice,2.1,.23+.46*travel);orb(c,ex,ey,4.4,C.ice,.55,.8);
}
function eventDisplayV11(c:CanvasRenderingContext2D,t:number,kind:'track'|'cascade'='track'){
 const cx=910,cy=585,p=smooth((t-.15)/2.45);const incoming=[{x:390,y:710},{x:635,y:525},{x:cx,y:cy}];const head=spline(incoming[0],incoming[1],incoming[2],p);glowPath(c,incoming,C.violet,.24,2.2);if(head)orb(c,head.x,head.y,5,C.ice,.78,.8);
 const branches=kind==='track'?10:34;
 for(let i=0;i<branches;i++){const a=kind==='track'?(-.56+(i%2?1:-1)*(.28+.06*(i%5))):-1.14+i/(branches-1)*2.28;const len=(kind==='track'?260:190+180*rnd(i+31))*p;const bend=.12*Math.sin(i*1.7+t*.12);const ex=cx+Math.cos(a)*len,ey=cy+Math.sin(a)*len*.58+bend*len*.10;line(c,cx,cy,ex,ey,i%8===0?C.gold:C.cyan,kind==='track'?1.2:1.0,.13+.30*p);for(let j=0;j<3;j++){const q=(t*.16+j*.22+i*.037)%1,px=cx+(ex-cx)*q,py=cy+(ey-cy)*q;bloom(c,px,py,10,C.cyan,.045*p);orb(c,px,py,1.5,C.ice,.25+.32*p,.65);}}
 bloom(c,cx,cy,120,C.cyan,.13*p);orb(c,cx,cy,9,C.gold,.75,.95);
}
function skyMapV11(c:CanvasRenderingContext2D,t:number){
 const cx=1360,cy=580,rx=360,ry=180,p=smooth((t-.2)/1.8);c.save();c.globalAlpha=.22;c.strokeStyle=C.ice;c.lineWidth=1.2;c.beginPath();c.ellipse(cx,cy,rx,ry,0,0,Math.PI*2);c.stroke();c.globalAlpha=.12;c.beginPath();c.ellipse(cx,cy,rx*.55,ry,0,0,Math.PI*2);c.stroke();c.beginPath();c.ellipse(cx,cy,rx,ry*.52,0,0,Math.PI*2);c.stroke();c.restore();
 for(let i=0;i<34;i++){const a=rnd(i+15)*Math.PI*2,rr=Math.sqrt(rnd(i+81))*rx*.92,x=cx+Math.cos(a)*rr,y=cy+Math.sin(a)*rr*.46;dot(c,x,y,1.2+1.5*rnd(i+41),i%7===0?C.gold:C.ice,.18+.18*p);}
 const sources=[{x:cx+230,y:cy-72,col:C.gold},{x:cx-74,y:cy+48,col:C.cyan},{x:cx+65,y:cy+13,col:C.cyan}];const origin={x:710,y:590};for(const s of sources){const ex=lerp(origin.x,s.x,p),ey=lerp(origin.y,s.y,p);glowPath(c,[origin,{x:1040,y:cy-18}, {x:ex,y:ey}],s.col,.28,2.2);bloom(c,s.x,s.y,45,s.col,.16*p);orb(c,s.x,s.y,5,s.col,.75,.9);}
}

function drawScene(c:CanvasRenderingContext2D,s:State,opacity=1){
 const e=s.elapsed,clip=s.clipId;
 // EvidenceFigureV01 occupies a deliberate right-hand editorial window.
 // Keep the deterministic teaching scene inside a left safe area while the
 // official illustration is on screen; this avoids drawing detector strings
 // or tracks through the paper image and also gives the page a calmer depth
 // hierarchy. The transform is frame-stable, so there is no per-frame jump.
 const evidence=['004','005','006','007','008','009','011','012','016'].includes(clip);
 c.save();
 c.globalAlpha*=opacity;
 if(evidence){
   // Hard editorial boundary under the paper window. It prevents a future
   // perspective stroke or bloom from leaking through the figure's rounded
   // card while preserving the glow inside the teaching area.
   c.beginPath();c.rect(0,0,1050,H);c.clip();
   c.translate(-190,34);c.scale(.82,.82);
 }
 // A continuous, frame-driven camera rig adds a barely perceptible push and
 // lateral drift. It is based on absolute time rather than clip progress, so
 // scene transitions do not reset the camera or create a jump at the seam.
 const camX=4.8*Math.sin(s.time*.19)+1.8*Math.sin(s.time*.047+1.1);
 const camY=2.8*Math.cos(s.time*.17+0.6);
 const camScale=1+.006*Math.sin(s.time*.11)+.0025*Math.sin(s.time*.31+1.4);
 c.translate(W/2+camX,H/2+camY);c.scale(camScale,camScale);c.translate(-W/2,-H/2);
 c.save();c.beginPath();c.rect(0,285,W,H-285);c.clip();
 // Establish the physical setting first: subtle horizontal ice strata remain
 // visible behind the animated detector and event, so every later abstraction
 // has a concrete South-Pole depth cue.
 iceStrata(c,s.time*.72,10);
 if(['000','001','004','005','006','007','008','009','010'].includes(clip)) iceShaft(c,s.time);
 // V11 redraw: scenes share a single physical camera language. The same
 // ice volume, DOM hardware and event vertex persist across cuts; only the
 // measured process changes.
 if(clip==='000'){depthParticles(c,s.time*.40,20,48);iceSurfaceV11(c,s.time);cerenkovV11(c,e*.72);}
 else if(clip==='001'){depthParticles(c,s.time*.38,21,38);iceCubeV11(c,e,.26);}
 else if(clip==='002'||clip==='003'){depthParticles(c,s.time*.36,22,38);cerenkovV11(c,e);eventDisplayV11(c,e,'track');}
 else if(clip==='004'||clip==='005'){depthParticles(c,s.time*.30,23,35);iceCubeV11(c,e,.34);}
 else if(clip==='006'||clip==='007'){depthParticles(c,s.time*.28,24,30);iceCubeV11(c,e,.24);cerenkovV11(c,e);}
 else if(clip==='008'){depthParticles(c,s.time*.26,25,26);eventDisplayV11(c,e,'track');}
 else if(clip==='009'){depthParticles(c,s.time*.24,26,26);eventDisplayV11(c,e,'cascade');}
 else if(clip==='010'){depthParticles(c,s.time*.22,27,24);backgroundFilter(c,e);}
 else if(clip==='011'||clip==='012'){depthParticles(c,s.time*.20,28,24);eventDisplayV11(c,e,'track');skyMapV11(c,e);}
 else if(clip==='013'||clip==='014'){depthParticles(c,s.time*.20,29,28);skyMapV11(c,e);}
 else if(clip==='015'){depthParticles(c,s.time*.24,30,26);eventDisplayV11(c,e,'cascade');}
 else {depthParticles(c,s.time*.28,31,32);iceCubeV11(c,e,.17);skyMapV11(c,e*.72);}
 c.restore();c.restore();
}
function world(c:CanvasRenderingContext2D,s:State){
 bg(c,s.time*.4);
 const clips=(timeline as any).clips as Array<{id:string;scene:string;start:number;end:number}>;
 const index=Math.max(0,clips.findIndex(clip=>clip.id===s.clipId));
 const transition=.72;
 const blend=index>0?smooth(s.elapsed/transition):1;
 // Cross-fade the final pose of the previous scene into the opening pose of
 // the next scene. The background stays continuous, so a seam never flashes
 // or exposes a half-cleared canvas while the narration keeps flowing.
 if(index>0 && s.elapsed<transition){
   const previous=clips[index-1];
   const duration=Math.max(.01,(previous.end-previous.start)/30);
   const previousState:State={
     ...s,
     clipId:previous.id,
     scene:previous.scene,
     elapsed:Math.max(0,duration-.18+(s.elapsed*.18/transition)),
     progress:1,
   };
   drawScene(c,previousState,1-blend);
 }
 drawScene(c,s,blend);
 vignette(c);
}
export class PhysicsWorldV07{canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;constructor(canvas:HTMLCanvasElement){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false})!;}render(s:State){world(this.ctx,s);}}
export function stateAt(frame:number):State{
 const n=Math.max(0,Math.min((timeline as any).duration-1,frame));
 const clips=(timeline as any).clips as Array<{id:string;scene:string;start:number;end:number}>;
 // A measured narration pause sits between two clips. During that pause the
 // previous scene must hold its last pose; falling back to clips[clips.length-1]
 // briefly showed the coda title and detector at every edit point.
 let clip=clips[0];
 for(const candidate of clips){
   if(candidate.start<=n) clip=candidate;
   else break;
 }
 const elapsedFrames=Math.max(0,n-clip.start);
 const clipFrames=Math.max(1,clip.end-clip.start);
 return {frame:n,time:n/30,clipId:clip.id,scene:clip.scene,elapsed:elapsedFrames/30,progress:Math.min(1,elapsedFrames/clipFrames)};
}





