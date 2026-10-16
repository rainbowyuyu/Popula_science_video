/**
 * V12 visual polish primitives for Nobel Physics 2026.
 *
 * This file is intentionally independent from the deployed V11 world.  It is
 * a small Canvas2D layer that can be composited inside the same 104..1030 x
 * 314..900 teaching safe region.  The geometry follows the IceCube scientific
 * background (KVA, 2026, pp. 5, 8-10): a muon track is long and directional;
 * a cascade is compact and anisotropic; the optical response is a timed
 * photon arrival signal.  It does not claim to reproduce raw DOM coordinates.
 */

export type V12Point3 = {x:number; y:number; z:number};
export type V12Camera = {
  cx:number; cy:number; scale:number; yaw:number; pitch:number; origin?:V12Point3;
};

const TAU = Math.PI * 2;
const clamp = (x:number, a=0, b=1) => Math.max(a, Math.min(b, x));
const smooth = (x:number) => {x = clamp(x); return x*x*(3-2*x);};
const smoother = (x:number) => {x = clamp(x); return x*x*x*(x*(x*6-15)+10);};
const mix = (a:number, b:number, t:number) => a + (b-a)*t;
const fract = (x:number) => x - Math.floor(x);
const hash = (n:number) => fract(Math.sin(n*127.1 + 311.7)*43758.5453);

const WHITE = '#edf8f6';
const CYAN = '#7ce9fa';
const GOLD = '#efc981';
const MUTED = '#8ab4c0';

function add(a:V12Point3,b:V12Point3):V12Point3{return{x:a.x+b.x,y:a.y+b.y,z:a.z+b.z};}
function sub(a:V12Point3,b:V12Point3):V12Point3{return{x:a.x-b.x,y:a.y-b.y,z:a.z-b.z};}
function mul(a:V12Point3,s:number):V12Point3{return{x:a.x*s,y:a.y*s,z:a.z*s};}
function dot(a:V12Point3,b:V12Point3){return a.x*b.x+a.y*b.y+a.z*b.z;}
function len(a:V12Point3){return Math.sqrt(dot(a,a));}
function norm(a:V12Point3){return mul(a,1/Math.max(.0001,len(a)));}
function cross(a:V12Point3,b:V12Point3):V12Point3{return{x:a.y*b.z-a.z*b.y,y:a.z*b.x-a.x*b.z,z:a.x*b.y-a.y*b.x};}

/** Perspective projection shared by all V12 primitives. */
export function projectV12(p:V12Point3,cam:V12Camera){
  const q=cam.origin?sub(p,cam.origin):p;
  const x=q.x*Math.cos(cam.yaw)+q.z*Math.sin(cam.yaw);
  const z=-q.x*Math.sin(cam.yaw)+q.z*Math.cos(cam.yaw);
  const y=q.y*Math.cos(cam.pitch)-z*Math.sin(cam.pitch);
  const rz=q.y*Math.sin(cam.pitch)+z*Math.cos(cam.pitch);
  const s=cam.scale*1250/(1250+rz);
  return {x:cam.cx+x*s,y:cam.cy-y*s,s,z:rz};
}

function glow(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,a:number){
  if(r<=0||a<=0)return;
  c.save();c.globalAlpha*=a;
  const g=c.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,color);g.addColorStop(.12,color);g.addColorStop(1,'transparent');
  c.fillStyle=g;c.fillRect(x-r,y-r,2*r,2*r);c.restore();
}
function point(c:CanvasRenderingContext2D,x:number,y:number,r:number,color:string,a:number){
  if(r<=0||a<=0)return;
  c.save();c.globalAlpha*=a;c.fillStyle=color;c.beginPath();c.arc(x,y,r,0,TAU);c.fill();c.restore();
}
function line(c:CanvasRenderingContext2D,a:{x:number;y:number},b:{x:number;y:number},color:string,w:number,alpha:number){
  c.save();c.globalAlpha*=alpha;c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.restore();
}
function path(c:CanvasRenderingContext2D,ps:{x:number;y:number}[],color:string,w:number,alpha:number){
  if(ps.length<2)return;c.save();c.globalAlpha*=alpha;c.strokeStyle=color;c.lineWidth=w;c.lineCap='round';c.lineJoin='round';c.beginPath();c.moveTo(ps[0].x,ps[0].y);for(const p of ps.slice(1))c.lineTo(p.x,p.y);c.stroke();c.restore();
}
function label(c:CanvasRenderingContext2D,s:string,x:number,y:number,size:number,color=WHITE,a=1){
  c.save();c.globalAlpha*=a;c.font=`500 ${size}px "Nobel Sans", "Microsoft YaHei", sans-serif`;c.fillStyle=color;c.textAlign='center';c.textBaseline='middle';c.shadowColor='rgba(2,13,23,.9)';c.shadowBlur=10;c.fillText(s,x,y);c.restore();
}

/**
 * A compact, anisotropic cascade.  The particle cloud uses a deterministic
 * Gaussian-like radial profile, with the long axis aligned to the sampled
 * shower direction.  This replaces the V11 radial spoke impression while
 * preserving the pedagogical distinction between a local cascade and a
 * detector-scale optical wavefront.
 */
export function drawCascadeV12(c:CanvasRenderingContext2D,cam:V12Camera,time:number,alpha=1){
  const age=clamp(time/3.2),grow=smoother(age),fade=1-smooth((time-3.15)/.55);
  if(alpha<=0||fade<=0)return;
  const origin:V12Point3={x:0,y:0,z:0};
  const axis=norm({x:.32,y:-.84,z:.21});
  const u=norm(cross(axis,{x:0,y:0,z:1}));
  const v=norm(cross(axis,u));
  const op=projectV12(origin,cam);
  glow(c,op.x,op.y,70*cam.scale,CYAN,alpha*.22*grow);
  // Soft isosurfaces give the viewer a volume cue without inventing a mesh.
  for(let shell=0;shell<3;shell++){
    const r=(18+shell*17)*grow;
    const pts=[];
    for(let i=0;i<=72;i++){
      const th=i/72*TAU;
      const p=add(origin,add(mul(axis,r*.94*Math.cos(th)),add(mul(u,r*.34*Math.sin(th)),mul(v,r*.22*Math.sin(th)))));
      const q=projectV12(p,cam);pts.push({x:q.x,y:q.y});
    }
    path(c,pts,shell===1?GOLD:CYAN,1.1,alpha*fade*(.22-shell*.04));
  }
  // Stable quasi-Gaussian packets: denser at the interaction core, elongated
  // along the shower axis, and depth-shaded by the same perspective camera.
  for(let i=0;i<96;i++){
    const radial=Math.sqrt(-2*Math.log(Math.max(.0001,hash(i+17))))*.17;
    const long=(hash(i+129)-.5)*2.25;
    const side=(hash(i+257)-.5)*2;
    const depth=(hash(i+389)-.5)*2;
    const p=add(origin,add(mul(axis,(long+.18*depth)*grow),add(mul(u,radial*side*grow),mul(v,radial*depth*grow))));
    const q=projectV12(p,cam);
    const d=clamp(1-q.z/1100,.35,1.25);
    const agePulse=.64+.36*Math.sin(time*4.8+i*.37);
    const col=i%7===0?GOLD:(i%3===0?WHITE:CYAN);
    glow(c,q.x,q.y,(4.8+2.2*hash(i+701))*q.s,col,alpha*fade*.09*d);
    point(c,q.x,q.y,(.8+1.4*hash(i+809))*q.s,col,alpha*fade*(.16+.22*agePulse)*d);
  }
  // A restrained photon-front pulse keeps the event alive after the cloud is
  // established.  Its radius is deliberately local (< 10 m teaching scale).
  for(let k=0;k<3;k++){
    const p=clamp((time-k*.56)/1.4),r=(20+p*105)*cam.scale;
    if(p<=0||p>=1)continue;
    c.save();c.globalAlpha*=alpha*(1-p)*.18;c.strokeStyle=CYAN;c.lineWidth=1.3;c.beginPath();c.ellipse(op.x,op.y,r,r*.54,-.24,0,TAU);c.stroke();c.restore();
  }
  // The baseline scene owns the explanatory caption.  This pass remains
  // geometric so its label cannot collide at a transition.
}

/**
 * Muon track and DOM arrival ribbon.  DOM points are generated from a single
 * direction vector and each light bead is placed by t_i = s_i/v_mu +
 * |r_DOM-r_emit|/(c/n).  The ribbon therefore follows the visible track and
 * cannot drift as a decorative independent chart.
 */
export function drawMuonTrackV12(c:CanvasRenderingContext2D,cam:V12Camera,time:number,alpha=1){
  const start:V12Point3={x:-250,y:120,z:36};
  const end:V12Point3={x:240,y:-112,z:-42};
  const axis=norm(sub(end,start));
  const trackLength=len(sub(end,start));
  const beta=.995, cIce=105/1.3193;
  const distance=clamp(time*beta*105/trackLength)*trackLength;
  const tip=add(start,mul(axis,distance));
  const p0=projectV12(start,cam),p1=projectV12(tip,cam);
  line(c,p0,p1,CYAN,10,alpha*.08);line(c,p0,p1,CYAN,2.5,alpha*.8);line(c,p0,p1,WHITE,.75,alpha*.85);
  glow(c,p1.x,p1.y,22,CYAN,alpha*.27);point(c,p1.x,p1.y,3,WHITE,alpha*.9);

  const doms=Array.from({length:18},(_,i)=>{
    const s=(i+1)/19*trackLength;
    const p=add(start,mul(axis,s));
    // Fixed offsets mimic strings around the track while preserving a single
    // explanatory detector volume. They are not claimed to be raw positions.
    return add(p,{x:(hash(i+4)-.5)*110,y:(hash(i+41)-.5)*260,z:(hash(i+74)-.5)*110});
  });
  let min=Infinity,max=-Infinity;
  const arrivals=doms.map((p,i)=>{
    const s=(i+1)/19*trackLength;
    const emit=add(start,mul(axis,s));
    const tau=s/(beta*105)+len(sub(p,emit))/cIce;
    min=Math.min(min,tau);max=Math.max(max,tau);return tau;
  });
  const now=(time-min)/Math.max(.001,max-min);
  // Leave a clean optical gap above the baseline detector caption.
  const ribbonY=925,r0=155,r1=865;
  line(c,{x:r0,y:ribbonY},{x:r1,y:ribbonY},MUTED,1,alpha*.43);
  for(let i=0;i<doms.length;i++){
    const q=projectV12(doms[i],cam),arrival=arrivals[i],u=(arrival-min)/Math.max(.001,max-min),x=mix(r0,r1,u),hit=smooth((time-arrival+.12)/.34);
    // The same DOM is shown spatially and on the timing ribbon; the link is
    // intentionally thin and only appears while that module is active.
    point(c,q.x,q.y,1.5,CYAN,alpha*.34);
    if(hit>0){glow(c,q.x,q.y,9,CYAN,alpha*hit*.22);point(c,q.x,q.y,2.8,WHITE,alpha*hit*.82);}
    point(c,x,ribbonY,2.5,CYAN,alpha*(.23+.62*hit));
    if(hit>.15)line(c,{x,y:ribbonY-6},{x,y:ribbonY-18-12*hit},CYAN,1.2,alpha*hit*.58);
  }
  const cursor=mix(r0,r1,clamp(now));line(c,{x:cursor,y:ribbonY-14},{x:cursor,y:ribbonY+14},GOLD,2,alpha*.8);glow(c,cursor,ribbonY,16,GOLD,alpha*.1);
  // The baseline scene owns the timing-ribbon caption; keep this layer clean.
}

/**
 * A source-to-Earth three-messenger plate.  All paths share source and Earth
 * anchors, so the camera can glide between them without a jump or an
 * unrelated line appearing in the middle of the handoff.
 */
export function drawMessengerPlateV12(c:CanvasRenderingContext2D,time:number,alpha=1){
  const src={x:255,y:598},earth={x:890,y:598};
  const reveal=smoother(time/2.3);
  const paths:{name:string;color:string;pts:{x:number;y:number}[];delay:number}[]=[
    {name:'质子',color:'#e9b778',delay:.1,pts:[src,{x:450,y:530},{x:620,y:666},earth]},
    {name:'伽马射线',color:'#8cdff4',delay:.55,pts:[src,{x:505,y:598},{x:700,y:586},earth]},
    {name:'中微子',color:'#f4ddd0',delay:1.0,pts:[src,earth]},
  ];
  const pulse=(x:number,d:number)=>smoother((x-d)/1.2);
  for(const entry of paths){
    const q=pulse(time,entry.delay)*reveal;
    if(q<=0)continue;
    const visible=entry.pts.slice(0,Math.max(2,Math.floor(2+q*(entry.pts.length-1))));
    path(c,visible,entry.color,entry.name==='中微子'?3.1:2.2,alpha*.78*q);
    const u=fract(Math.max(0,time-entry.delay)*.22);const seg=Math.min(entry.pts.length-2,Math.floor(u*(entry.pts.length-1))),local=u*(entry.pts.length-1)-seg;
    const a=entry.pts[seg],b=entry.pts[seg+1],x=mix(a.x,b.x,local),y=mix(a.y,b.y,local);
    glow(c,x,y,18,entry.color,alpha*.20*q);point(c,x,y,3.2,WHITE,alpha*.86*q);
    const labelPos:Record<string,{x:number;y:number}>={
      '质子':{x:520,y:704},
      '伽马射线':{x:555,y:548},
      '中微子':{x:620,y:612},
    };
    const lp=labelPos[entry.name]??{x,y:y-28};
    label(c,entry.name,lp.x,lp.y,22,entry.color,alpha*.75*q);
  }
  glow(c,src.x,src.y,56,GOLD,alpha*.18*reveal);point(c,src.x,src.y,8,GOLD,alpha*.92*reveal);
  glow(c,earth.x,earth.y,80,CYAN,alpha*.16*reveal);point(c,earth.x,earth.y,7,CYAN,alpha*.92*reveal);
  label(c,'源区',src.x,src.y+48,22,MUTED,alpha*.82*reveal);label(c,'地球',earth.x,earth.y+52,22,MUTED,alpha*.82*reveal);
}

/**
 * Optional entry point for V12 integration.  It intentionally draws only
 * content clips handled here; callers should continue to V11 for all other
 * clips.  Keep this function below source/evidence overlays so captions remain
 * in the safe area.
 */
export function drawVisualPolishV12(c:CanvasRenderingContext2D,clipId:string,t:number,alpha=1){
  if(clipId==='003') {drawMessengerPlateV12(c,t,alpha);return true;}
  if(clipId==='008') {drawMuonTrackV12(c,{cx:560,cy:580,scale:.74,yaw:-.47,pitch:.14},t,alpha);return true;}
  if(clipId==='009') {drawCascadeV12(c,{cx:560,cy:580,scale:.74,yaw:-.47,pitch:.14},t,alpha);return true;}
  return false;
}

