import timeline from './timeline-v02.json';

/**
 * A deterministic, WebGL-inspired renderer for the 2026 physics film.
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
const rnd=(i:number)=>{const x=Math.sin(i*12.9898+78.233)*43758.5453;return x-Math.floor(x);};
const hex=(h:number,s:number,l:number)=>`hsl(${h} ${s}% ${l}%)`;
function line(c:CanvasRenderingContext2D,x1:number,y1:number,x2:number,y2:number,col:string,w=2,a=1){c.save();c.globalAlpha*=a;c.strokeStyle=col;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(x1,y1);c.lineTo(x2,y2);c.stroke();c.restore();}
function path(c:CanvasRenderingContext2D,pts:{x:number;y:number}[],col:string,w=2,a=1){if(!pts.length)return;c.save();c.globalAlpha*=a;c.strokeStyle=col;c.lineWidth=w;c.lineJoin='round';c.lineCap='round';c.beginPath();c.moveTo(pts[0].x,pts[0].y);for(let i=1;i<pts.length;i++)c.lineTo(pts[i].x,pts[i].y);c.stroke();c.restore();}
function dot(c:CanvasRenderingContext2D,x:number,y:number,r:number,col:string,a=1){c.save();c.globalAlpha*=a;c.fillStyle=col;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.restore();}
function bloom(c:CanvasRenderingContext2D,x:number,y:number,r:number,col:string,a=.2){const g=c.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,col);g.addColorStop(.2,col);g.addColorStop(1,'transparent');c.save();c.globalAlpha*=a;c.fillStyle=g;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.restore();}
function rounded(c:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,r:number,col:string,a=.7,stroke?:string){c.save();c.globalAlpha*=a;c.fillStyle=col;c.beginPath();c.roundRect(x,y,w,h,r);c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}c.restore();}
function project(x:number,y:number,z:number,cx=960,cy=540,f=720){const q=f/(f+z);return {x:cx+x*q,y:cy+y*q,q};}
function projectDepth(x:number,y:number,z:number,yaw:number,pitch:number,cx=960,cy=540,f=720){
 const cyaw=Math.cos(yaw),syaw=Math.sin(yaw); const xr=x*cyaw-z*syaw; let zr=x*syaw+z*cyaw;
 const cp=Math.cos(pitch),sp=Math.sin(pitch); const yr=y*cp-zr*sp; zr=y*sp+zr*cp;
 return project(xr,yr,zr,cx,cy,f);
}
function stars(c:CanvasRenderingContext2D,t:number){for(let i=0;i<180;i++){const z=40+rnd(i)*900;const x=(rnd(i+10)-.5)*2450;const y=(rnd(i+80)-.5)*1380;const p=project(x,y,z,960,545,780);const tw=.15+.18*Math.sin(t*.7+i*1.77);dot(c,p.x,p.y,Math.max(.5,2.4*p.q),i%8===0?C.cyan:C.ice,tw);}}
function vignette(c:CanvasRenderingContext2D){const g=c.createRadialGradient(W*.52,H*.47,100,W*.52,H*.5,1000);g.addColorStop(0,'transparent');g.addColorStop(.62,'rgba(0,0,0,.06)');g.addColorStop(1,'rgba(0,0,0,.68)');c.fillStyle=g;c.fillRect(0,0,W,H);}
function bg(c:CanvasRenderingContext2D,t:number){const g=c.createLinearGradient(0,0,W,H);g.addColorStop(0,C.deep);g.addColorStop(.52,'#0a2435');g.addColorStop(1,'#07141f');c.fillStyle=g;c.fillRect(0,0,W,H);stars(c,t);}
function source(c:CanvasRenderingContext2D,t:number){const cx=420,cy=540;for(let k=0;k<5;k++){const r=65+k*48+8*Math.sin(t*.4+k);c.save();c.globalAlpha=.22-k*.035;c.strokeStyle=k%2?C.gold:C.cyan;c.lineWidth=1.5;c.setLineDash([5,13]);c.lineDashOffset=-t*26-k*8;c.beginPath();c.arc(cx,cy,r,0,Math.PI*2);c.stroke();c.restore();}
 const orbit=1.5+0.35*Math.sin(t*.45);for(let i=0;i<10;i++){const a=t*.32+i*Math.PI*2/10;dot(c,cx+Math.cos(a)*105,cy+Math.sin(a)*34,2.2,C.gold,.45);}
 bloom(c,cx,cy,210,C.gold,.17);dot(c,cx,cy,24,C.gold,.95);dot(c,cx,cy,10,C.ink,.9);}
function neutrino(c:CanvasRenderingContext2D,t:number,from={x:370,y:540},to={x:1530,y:390}){const p=clamp((t-.15)/3.6);const dx=to.x-from.x,dy=to.y-from.y;const x=from.x+dx*p,y=from.y+dy*p;bloom(c,x,y,72,C.cyan,.25);dot(c,x,y,6,C.cyan,.95);line(c,x-44,y+24,x+43,y-24,C.cyan,2,.75);const pts=[];for(let i=0;i<=64;i++){const u=i/64;pts.push({x:from.x+dx*u,y:from.y+dy*u});}path(c,pts,C.cyan,1.5,.21);
 // After the first arrival, keep a quiet sequence of readout pulses moving
 // along the same path. The trajectory stays fixed, so the extra motion reads
 // as repeated detections rather than a second object being introduced.
 for(let k=0;k<3;k++){const u=(t*.16+k*.31)%1;const q=pts[Math.floor(u*64)];if(q){bloom(c,q.x,q.y,24,C.cyan,.08);dot(c,q.x,q.y,2.8,C.ice,.45);}}
}
function messengerSplit(c:CanvasRenderingContext2D,t:number){
 const cx=580,cy=505; source(c,t*.35);
 // Three messengers leave the same source. The proton bends smoothly in a
 // magnetic field, gamma light fades through intervening dust, while the
 // neutrino keeps its bearing. Keeping one shared origin makes the visual
 // comparison read as a small experiment rather than three title cards.
 const branches=[
   {col:C.gold,dy:-160,bend:90,kind:'gamma'},
   {col:C.rose,dy:15,bend:135,kind:'proton'},
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
     path(c,tail,b.col,2.8-k*.45,.12+.11*(3-k));
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
      bloom(c,q.x,q.y,46,b.col,.18*fade); dot(c,q.x,q.y,5,b.col,.9*fade);
    }
    // A low-contrast runner keeps the three messengers alive during the
    // explanatory sentence after their paths have been drawn.
    const uLoop=(t*.12+j*.23)%1; const loop=pts[Math.floor(uLoop*64)];
    if(loop){bloom(c,loop.x,loop.y,22,b.col,.08);dot(c,loop.x,loop.y,2.6,b.col,.42);}
  });
}
function iceVolume(c:CanvasRenderingContext2D,t:number){const x0=380,y0=250,x1=1500,y1=860;const pulse=smooth((t-.15)/2);rounded(c,x0-70,y0-80,x1-x0+140,y1-y0+160,35,'#bce9ef',.055,C.ice);for(let j=0;j<10;j++){const u=j/9;const x=x0+(x1-x0)*u;line(c,x,y0,x+(u-.5)*140,y1,C.ice,1.2,.17);}for(let i=0;i<7;i++){const v=i/6;const y=y0+(y1-y0)*v;line(c,x0,y,x1,y+(v-.5)*100,C.ice,1,.12);}const strings=7;for(let j=0;j<strings;j++){const u=(j+.8)/(strings+1);const bx=x0+(x1-x0)*u;const lean=(u-.48)*100;line(c,bx,y0+18,bx+lean,y1-18,C.muted,2,.35);for(let i=0;i<7;i++){const v=(i+.55)/7;const x=bx+lean*v,y=y0+(y1-y0)*v;const active=clamp((t-v*1.5-.4)/.8);const cycle=(t*.12+u*.35+v*.18)%1;const shimmer=.5+.5*smooth(cycle);bloom(c,x,y,30,C.cyan,.10+active*.16+shimmer*.08);dot(c,x,y,5,C.ice,.66+.08*shimmer);dot(c,x,y,2.3,C.cyan,.48*active+.24*shimmer);}}line(c,x0-48,y0-16,x1+55,y0-16,C.gold,2,.38);const scan=clamp((t-.2)/2.8);line(c,x0-35,y0+(y1-y0)*scan,x1+40,y0+(y1-y0)*scan,C.cyan,2,.4);const scanLoop=(t*.16)%1,sy2=y0+(y1-y0)*scanLoop;line(c,x0-28,sy2,x1+34,sy2,C.cyan,1.6,.20);}
function cone(c:CanvasRenderingContext2D,t:number){
 const cx=1050,cy=555,p=clamp((t-.2)/2.7);
 // For a relativistic charged particle in ice, cos(theta)=1/(n*beta).
 // Using n≈1.31 keeps the cone angle tied to the mechanism instead of an
 // arbitrary triangle while the reveal remains readable at film scale.
 const beta=.92+.075*smooth(p), n=1.31;
 const theta=Math.acos(Math.min(.995,1/(n*beta))), length=500*p;
 const radius=Math.min(350,Math.tan(theta)*length);
 const grad=c.createRadialGradient(cx,cy,0,cx+length*.38,cy,radius*1.15);
 grad.addColorStop(0,'rgba(97,226,242,.26)');grad.addColorStop(1,'transparent');
 c.fillStyle=grad;c.beginPath();c.moveTo(cx,cy);c.lineTo(cx+length,cy-radius);c.lineTo(cx+length,cy+radius);c.closePath();c.fill();
 for(let i=0;i<18;i++){
   const q=clamp((t-i*.045)/1.35), a=-theta+(2*theta*i/17), rr=32+q*length;
   line(c,cx,cy,cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,C.cyan,1.55,.18+.46*q);
   dot(c,cx+Math.cos(a)*rr,cy+Math.sin(a)*rr,3.3,C.cyan,q);
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

  // A dim back plane makes the detector read as a volume instead of a flat HUD.
  const back=[
    projectDepth(-half,-270,depth/2,yaw,pitch,cx,cy,740),
    projectDepth(half,-270,depth/2,yaw,pitch,cx,cy,740),
    projectDepth(half,270,depth/2,yaw,pitch,cx,cy,740),
    projectDepth(-half,270,depth/2,yaw,pitch,cx,cy,740),
  ];
  path(c,back,C.muted,1.2,.18);
  for(let i=0;i<4;i++) line(c,front[i].x,front[i].y,back[i].x,back[i].y,C.muted,1,.16);

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
      dot(c,p.x,p.y,5.2+1.4*qe,C.ice,.53+.27*qe);
      dot(c,p.x,p.y,2.2+1.1*qe,C.cyan,.65*pulse);
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
function track(c:CanvasRenderingContext2D,t:number){const p=clamp((t-.15)/2.2);const pts=[];for(let i=0;i<=96;i++){const u=i/96;pts.push({x:430+u*980,y:610-178*u});}path(c,pts,C.cyan,7,.10);path(c,pts,C.cyan,2.6,.72);for(let i=0;i<28;i++){const u=clamp(p-i*.018);const q=pts[Math.floor(u*96)];if(q){bloom(c,q.x,q.y,34,C.cyan,.22);dot(c,q.x,q.y,4.2,C.cyan,.88);}}const head=pts[Math.min(96,Math.floor(p*96))];if(head){bloom(c,head.x,head.y,86,C.cyan,.28);dot(c,head.x,head.y,7,C.ice,.95);}for(let k=0;k<3;k++){const u=(t*.14+k*.32)%1;const q=pts[Math.floor(u*96)];if(q){bloom(c,q.x,q.y,22,C.cyan,.07);dot(c,q.x,q.y,2.5,C.ice,.38);}}}
function cascade(c:CanvasRenderingContext2D,t:number){const p=clamp((t-.1)/2.2),cx=1060,cy=565;for(let i=0;i<115;i++){const a=rnd(i)*Math.PI*2,rad=(20+Math.pow(rnd(i+3),.45)*320)*p;const x=cx+Math.cos(a)*rad,y=cy+Math.sin(a)*rad*.55;const col=i%5===0?C.gold:C.cyan;bloom(c,x,y,16+8*rnd(i+7),col,.14*p);dot(c,x,y,2.2,col,.3+.55*p);}for(let k=0;k<6;k++){const r=44+k*30+12*Math.sin(t+k);c.save();c.globalAlpha=.20*(1-k/8)*p;c.strokeStyle=k%2?C.gold:C.cyan;c.lineWidth=1.5;c.setLineDash([4,10]);c.lineDashOffset=-t*18;c.beginPath();c.ellipse(cx,cy,r,r*.52,0,0,Math.PI*2);c.stroke();c.restore();}bloom(c,cx,cy,210,C.cyan,.18*p);dot(c,cx,cy,16,C.gold,.8);}
function spectrum(c:CanvasRenderingContext2D,t:number){const x=380,y=780,w=1070,h=300;line(c,x,y,x+w,y,C.muted,2,.45);line(c,x,y-h,x,y,C.muted,2,.45);for(let i=0;i<80;i++){const u=i/79;const h0=210*Math.pow(1-u,2.3)+8;const q=smooth((t-.15)/1.3);const breathe=.90+.10*Math.sin(t*.75+i*.11);line(c,x+u*w,y-h0*q*breathe,x+u*w,y,C.gold,5,.54);line(c,x+u*w,y-(60*Math.pow(1-u,3)+5)*breathe,x+u*w,y,C.muted,2,.24);}const marker=smooth((t-1.2)/.8);const scan=.16+.70*((Math.sin(t*.33)*.5+.5));line(c,x+w*scan,y-250,x+w*scan,y,C.cyan,4,.42+.35*marker);bloom(c,x+w*scan,y-250,66,C.cyan,.16+.10*marker);for(const u of [.62,.73]){const pulse=.55+.45*Math.sin(t*1.2+u*8);dot(c,x+w*u,y-210,5,C.ice,.45+.35*pulse);bloom(c,x+w*u,y-210,34,C.cyan,.09+.08*pulse);}}
function focusSources(c:CanvasRenderingContext2D,t:number){const p=smooth((t-.2)/1.5);const cx=1320,cy=505;for(let i=0;i<3;i++){const a=-.8+i*.8;const len=450*p;const col=i===1?C.gold:C.cyan;line(c,cx,cy,cx+Math.cos(a)*len,cy+Math.sin(a)*len,col,2.5,.55);dot(c,cx+Math.cos(a)*len,cy+Math.sin(a)*len,7,col,.8);bloom(c,cx+Math.cos(a)*len,cy+Math.sin(a)*len,60,col,.2);const u=(t*.16+i*.27)%1;const qx=cx+Math.cos(a)*len*u,qy=cy+Math.sin(a)*len*u;bloom(c,qx,qy,24,col,.10);dot(c,qx,qy,3,col,.6);}}
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
 if(clip==='000'){source(c,e*.5);neutrino(c,e*.85,{x:340,y:760},{x:1560,y:380});}
 else if(clip==='001'){source(c,e*.25);detector3D(c,e*.55);neutrino(c,e*.4,{x:240,y:700},{x:1460,y:330});}
 else if(clip==='002'||clip==='003'){messengerSplit(c,e);}
 else if(clip==='004'||clip==='005'){iceVolume(c,e);detector3D(c,e*.48);}
 else if(clip==='006'){detector3D(c,e*.28);cone(c,e);}
 else if(clip==='007'){detector3D(c,e*.22);cone(c,e*.74);const x=1270,y=315;rounded(c,x-220,y-58,440,116,20,'#102e3e',.75,C.cyan);c.save();c.font='italic 700 52px "Nobel Serif",serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle=C.ice;c.fillText('v  >  c / n',x,y);c.restore();}
 else if(clip==='008'){detector3D(c,e*.22);track(c,e);}
 else if(clip==='009'){detector3D(c,e*.16);cascade(c,e);}
 else if(clip==='010'){detector3D(c,e*.2);track(c,e*.55);cascade(c,e*.45);}
 else if(clip==='011'||clip==='012'){spectrum(c,e);focusSources(c,e*.8);}
 else if(clip==='013'||clip==='014'){detector3D(c,e*.22);focusSources(c,e);}
 else if(clip==='015'){messengerSplit(c,e*.5);spectrum(c,e*.45);}
 else {source(c,e*.25);detector3D(c,e*.18);neutrino(c,e*.35,{x:260,y:730},{x:1530,y:390});}
 c.restore();
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
export class PhysicsWorldV02{canvas:HTMLCanvasElement;ctx:CanvasRenderingContext2D;constructor(canvas:HTMLCanvasElement){this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false})!;}render(s:State){world(this.ctx,s);}}
export function stateAt(frame:number):State{const n=Math.max(0,Math.min((timeline as any).duration-1,frame));const clips=(timeline as any).clips;const clip=clips.find((c:any)=>n>=c.start&&n<c.end)||clips[clips.length-1];return {frame:n,time:n/30,clipId:clip.id,scene:clip.scene,elapsed:(n-clip.start)/30,progress:(n-clip.start)/(clip.end-clip.start)};}
