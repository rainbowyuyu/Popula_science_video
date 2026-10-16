/**
 * Opus generated the initial vector/projection/shaded primitives and molecular skeleton.
 * The project corrected atom-index/coordinate errors, chemical valence, alpha isolation,
 * and completed the three bounded renderers after an interrupted streaming response.
 * Adoption details: docs/v01/opus-code-audit-v01.md.
 */
/**
 * Molecular chirality · asymmetric catalysis · Soai autocatalysis.
 * Deterministic Canvas2D teaching models — motion is a pure function of (t, progress),
 * no RNG / Date / CSS / mutable module state. Conceptual diagrams, not experimental trajectories.
 */
const TAU = Math.PI * 2;
const IVORY = '#edf7f5', GOLD = '#e8bb72', CYAN = '#67d8e9', CORAL = '#df6157', SILVER = '#eef2f1';
const FONT = (s: number) => `${s}px "Nobel Sans", "Noto Sans SC", "Microsoft YaHei", sans-serif`;

/* ------------------------------------------------------------------ scalars */
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const smooth = (e0: number, e1: number, v: number) => { const u = clamp((v - e0) / (e1 - e0), 0, 1); return u * u * (3 - 2 * u); };
const hash = (i: number) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const frac = (v: number) => v - Math.floor(v);

/* ------------------------------------------------------------------ colour */
function rgba(hex: string, a: number) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function mix(a: string, b: string, k: number) {
  const p = parseInt(a.slice(1), 16), q = parseInt(b.slice(1), 16);
  return `rgb(${Math.round(lerp(p >> 16 & 255, q >> 16 & 255, k))},${Math.round(lerp(p >> 8 & 255, q >> 8 & 255, k))},${Math.round(lerp(p & 255, q & 255, k))})`;
}
const shade = (c: string, k: number) => (k >= 0 ? mix(c, '#ffffff', k) : mix(c, '#03131b', -k));

/* ------------------------------------------------------------------ 3D core */
type V3 = { x: number; y: number; z: number };
const V = (x: number, y: number, z: number): V3 => ({ x, y, z });
const add = (a: V3, b: V3) => V(a.x + b.x, a.y + b.y, a.z + b.z);
const sub = (a: V3, b: V3) => V(a.x - b.x, a.y - b.y, a.z - b.z);
const muls = (a: V3, s: number) => V(a.x * s, a.y * s, a.z * s);
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z;
const crs = (a: V3, b: V3) => V(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
const nrm = (a: V3) => { const m = Math.sqrt(dot(a, a)) || 1; return muls(a, 1 / m); };
type Cam = { rx: number; ry: number; f: number; s: number; cx: number; cy: number };
const rot = (p: V3, c: Cam): V3 => {
  const cy = Math.cos(c.ry), sy = Math.sin(c.ry), cx = Math.cos(c.rx), sx = Math.sin(c.rx);
  const x1 = p.x * cy + p.z * sy, z1 = p.z * cy - p.x * sy;
  return V(x1, p.y * cx - z1 * sx, p.y * sx + z1 * cx);
};
type PJ = { x: number; y: number; z: number; s: number };
const pj = (p: V3, c: Cam): PJ => { const r = rot(p, c), k = c.f / (c.f + r.z); return { x: c.cx + r.x * k * c.s, y: c.cy + r.y * k * c.s, z: r.z, s: k * c.s }; };

/* ------------------------------------------------------------------ painting */
function orb(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: string, a: number) {
  if (r < 0.4 || a < 0.02) return;
  const inheritedAlpha=ctx.globalAlpha;ctx.save();
  ctx.globalAlpha = inheritedAlpha*a;
  const g = ctx.createRadialGradient(x - r * 0.36, y - r * 0.40, r * 0.05, x, y, r * 1.08);
  g.addColorStop(0, shade(col, 0.70)); g.addColorStop(0.38, shade(col, 0.16));
  g.addColorStop(0.80, shade(col, -0.28)); g.addColorStop(1, shade(col, -0.62));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalAlpha = inheritedAlpha*a * 0.42; ctx.strokeStyle = rgba(CYAN, 0.55); ctx.lineWidth = Math.max(0.8, r * 0.13);
  ctx.beginPath(); ctx.arc(x, y, r * 0.90, Math.PI * 0.12, Math.PI * 0.72); ctx.stroke();
  ctx.globalAlpha = inheritedAlpha*a * 0.85;
  const s = ctx.createRadialGradient(x - r * 0.40, y - r * 0.46, 0, x - r * 0.40, y - r * 0.46, r * 0.36);
  s.addColorStop(0, 'rgba(255,255,255,0.95)'); s.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = s; ctx.beginPath(); ctx.arc(x - r * 0.40, y - r * 0.46, r * 0.36, 0, TAU); ctx.fill();
  ctx.restore();
}
function cyl(ctx: CanvasRenderingContext2D, a: PJ, b: PJ, w: number, col: string, alpha: number) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.sqrt(dx * dx + dy * dy); if (L < 0.5) return;
  const inheritedAlpha=ctx.globalAlpha;ctx.save();
  const nx = -dy / L, ny = dx / L, ra = w * a.s, rb = w * b.s;
  let lit = nx * -0.62 + ny * -0.78; if (Math.abs(lit) < 0.3) lit = 0.3;
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, rw = (ra + rb) / 2;
  ctx.globalAlpha = inheritedAlpha*alpha; ctx.beginPath();
  ctx.moveTo(a.x + nx * ra, a.y + ny * ra); ctx.lineTo(b.x + nx * rb, b.y + ny * rb);
  ctx.lineTo(b.x - nx * rb, b.y - ny * rb); ctx.lineTo(a.x - nx * ra, a.y - ny * ra); ctx.closePath();
  const g = ctx.createLinearGradient(mx + nx * rw * lit, my + ny * rw * lit, mx - nx * rw * lit, my - ny * rw * lit);
  g.addColorStop(0, shade(col, 0.52)); g.addColorStop(0.30, shade(col, 0.04)); g.addColorStop(1, shade(col, -0.66));
  ctx.fillStyle = g; ctx.fill();
  ctx.globalAlpha = inheritedAlpha*alpha * 0.45; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = Math.max(0.9, rw * 0.22);
  ctx.beginPath(); ctx.moveTo(a.x + nx * ra * 0.42, a.y + ny * ra * 0.42); ctx.lineTo(b.x + nx * rb * 0.42, b.y + ny * rb * 0.42); ctx.stroke();
  ctx.restore();
}
function txt(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, col: string, align: CanvasTextAlign, a: number) {
  if (a < 0.02) return;
  const inheritedAlpha=ctx.globalAlpha;ctx.save();
  ctx.globalAlpha = inheritedAlpha*a; ctx.font = FONT(size); ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = col; ctx.fillText(s, x, y);
  ctx.restore();
}
/* ------------------------------------------------------------------ lactic stereocentre */
type Atom = { p: V3; c: string; r: number }; type Bond = { a: number; b: number; w: number; order?: number };
const STICK = '#a9bcc2';
const TET = [nrm(V(1, 1, 1)), nrm(V(1, -1, -1)), nrm(V(-1, 1, -1)), nrm(V(-1, -1, 1))]; // H · OH · CH3 · COOH
const perp = (d: V3) => nrm(crs(d, Math.abs(d.y) < 0.8 ? V(0, 1, 0) : V(1, 0, 0)));
const MOL = (() => {
  const B = 1.02, A: Atom[] = [], Bn: Bond[] = [], put = (p: V3, c: string, r: number, from: number, w: number) => {
    A.push({ p, c, r }); if (from >= 0) Bn.push({ a: from, b: A.length - 1, w }); return A.length - 1;
  };
  put(V(0, 0, 0), '#667d89', 0.30, -1, 0);                                             // 0 C*
  put(muls(TET[0], B * 1.06), SILVER, 0.15, 0, 0.055);                             // 1 H
  const o = put(muls(TET[1], B * 1.04), CORAL, 0.24, 0, 0.075);                    // 2 O
  put(add(A[o].p, muls(nrm(add(perp(TET[1]), muls(TET[1], 0.6))), 0.50)), SILVER, 0.11, o, 0.05); // 3 O–H
  const c3 = put(muls(TET[2], B * 1.02), '#667d89', 0.24, 0, 0.085);                   // 4 CH3
  const u3 = perp(TET[2]), w3 = crs(TET[2], u3);
  for (let k = 0; k < 3; k++) put(add(A[c3].p, add(muls(TET[2], 0.40), muls(add(muls(u3, Math.cos(k * TAU / 3)), muls(w3, Math.sin(k * TAU / 3))), 0.34))), SILVER, 0.10, c3, 0.05);
  const c4 = put(muls(TET[3], B * 1.02), '#667d89', 0.24, 0, 0.085);                   // 8 COOH
  const u4 = perp(TET[3]);
  const o1 = put(add(A[c4].p, muls(nrm(add(muls(TET[3], 0.75), muls(u4, 0.66))), 0.70)), CORAL, 0.21, c4, 0.07); // 9 =O
  const o2 = put(add(A[c4].p, muls(nrm(add(muls(TET[3], 0.75), muls(u4, -0.66))), 0.72)), CORAL, 0.21, c4, 0.07); // 10 –OH
  put(add(A[o2].p, muls(nrm(add(muls(TET[3], 0.4), muls(u4, -1))), 0.45)), SILVER, 0.10, o2, 0.045);             // 11 H
  Bn.find(b => b.a === c4 && b.b === o1)!.order = 2;
  return { A, Bn, labels: [{ t: 'H', i: 1 }, { t: 'OH', i: 2 }, { t: 'CH3', i: 4 }, { t: 'COOH', i: 8 }] };
})();
// Proper rotation around the H/OH bisector. Combined with reflection in x,
// theta=pi aligns H and OH while CH3 and COOH exchange spatial positions.
const axis=nrm(V(0,1,1));
function turn(p:V3,theta:number):V3{const cs=Math.cos(theta),sn=Math.sin(theta);return add(add(muls(p,cs),muls(crs(axis,p),sn)),muls(axis,dot(axis,p)*(1-cs)));}
function bounded(ctx:CanvasRenderingContext2D,x:number,y:number,w:number,h:number,draw:()=>void){
 if(![x,y,w,h].every(Number.isFinite)||w<=0||h<=0)return;
 ctx.save();ctx.beginPath();ctx.rect(x,y,w,h);ctx.clip();ctx.translate(x,y);draw();ctx.restore();
}
function halo(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,col:string,a:number){ctx.save();ctx.globalAlpha*=a;const g=ctx.createRadialGradient(x,y,r*.07,x,y,r);g.addColorStop(0,rgba(col,.44));g.addColorStop(1,rgba(col,0));ctx.fillStyle=g;ctx.fillRect(x-r,y-r,2*r,2*r);ctx.restore();}
function stroke(ctx:CanvasRenderingContext2D,pts:{x:number;y:number}[],col:string,width:number,alpha=1){ctx.save();ctx.globalAlpha*=alpha;ctx.strokeStyle=col;ctx.lineWidth=width;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();for(let i=0;i<pts.length;i++){const p=pts[i];if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.restore();}
function molecule(ctx:CanvasRenderingContext2D,cam:Cam,mirror:boolean,theta:number,opacity:number,labelMode:'all'|'divergent'|'none',labelSize:number){
 const transform=(p:V3)=>turn(mirror?V(-p.x,p.y,p.z):p,mirror?theta:0);
 const points=MOL.A.map(a=>pj(transform(a.p),cam));
 const objects:Array<{z:number;paint:()=>void}>=[];
 for(const b of MOL.Bn){
  const a=transform(MOL.A[b.a].p),z=transform(MOL.A[b.b].p);
  for(let k=0;k<10;k++){
   const pa=pj(add(muls(a,1-k/10),muls(z,k/10)),cam),pb=pj(add(muls(a,1-(k+1)/10),muls(z,(k+1)/10)),cam);
   // Subpixel overlap removes antialias seams between depth-sorted cylinders.
   // Only interior joins extend; the first/last endpoints remain on the atoms.
   const segmentLength=Math.hypot(pb.x-pa.x,pb.y-pa.y)||1,ux=(pb.x-pa.x)/segmentLength,uy=(pb.y-pa.y)/segmentLength;
   if(k>0){pa.x-=ux*.7;pa.y-=uy*.7;}if(k<9){pb.x+=ux*.7;pb.y+=uy*.7;}
   objects.push({z:(pa.z+pb.z)/2,paint:()=>{
    if(b.order===2){const dx=pb.x-pa.x,dy=pb.y-pa.y,len=Math.hypot(dx,dy)||1;const d=cam.s*.033;
     for(const sign of [-1,1])cyl(ctx,{...pa,x:pa.x-dy/len*d*sign,y:pa.y+dx/len*d*sign},{...pb,x:pb.x-dy/len*d*sign,y:pb.y+dx/len*d*sign},b.w*.46,STICK,opacity);
    }else cyl(ctx,pa,pb,b.w,STICK,opacity);
   }});
  }
 }
 MOL.A.forEach((a,i)=>objects.push({z:points[i].z,paint:()=>orb(ctx,points[i].x,points[i].y,a.r*points[i].s,a.c,opacity)}));
 objects.sort((a,b)=>b.z-a.z).forEach(o=>o.paint());
 if(labelMode!=='none')for(const item of MOL.labels){
  if(labelMode==='divergent'&&(item.i===1||item.i===2))continue;
  const p=points[item.i],dx=p.x-cam.cx,dy=p.y-cam.cy,length=Math.hypot(dx,dy)||1;
  const gap=Math.max(28,points[item.i].s*.33);
  txt(ctx,item.t.replace('CH3','CH₃'),p.x+dx/length*gap,p.y+dy/length*gap,labelSize,IVORY,'center',opacity);
 }
}
function moleculeRail(ctx:CanvasRenderingContext2D,cam:Cam,mirror:boolean,theta:number,w:number,h:number,join:number,labelsOnly:boolean){
 const railX=clamp(cam.cx+(mirror?1:-1)*cam.s*2.58,w*.045,w*.955),ys=[.235,.405,.615,.785];
 for(let i=0;i<MOL.labels.length;i++){
  const item=MOL.labels[i],raw=MOL.A[item.i].p;
  const p=pj(turn(mirror?V(-raw.x,raw.y,raw.z):raw,mirror?theta:0),cam);
  const yy=h*ys[i],alpha=mirror&&i<2?1-smooth(.35,.8,join):1;
  if(labelsOnly){txt(ctx,item.t.replace('CH3','CH₃'),railX,yy,Math.max(21,Math.min(28,w*.017)),mirror?CYAN:GOLD,mirror?'right':'left',alpha);}
  else{
   const outer=railX+(mirror?-90:90),inner=railX+(mirror?-116:116);
   const dx=p.x-inner,dy=p.y-yy,length=Math.hypot(dx,dy)||1;
   const atomEdge={x:p.x-dx/length*29,y:p.y-dy/length*29};
   stroke(ctx,[{x:outer,y:yy},{x:inner,y:yy},atomEdge],mirror?CYAN:GOLD,1.3,alpha*.33);
  }
 }
}

/** Pair of lactic-acid stereocentres; no uncomputed CIP R/S assignment. */
export function drawChiralPair(ctx:CanvasRenderingContext2D,t:number,progress:number,x:number,y:number,w:number,h:number):void{
 bounded(ctx,x,y,w,h,()=>{
  const p=clamp(progress,0,1),join=smooth(.23,.61,p)*(1-smooth(.81,.99,p)),theta=Math.PI*smooth(.22,.61,p);
  const scale=Math.min(w*.12,h*.228),sep=w*.237*(1-join),cy=h*.48;
  const camera={rx:-.26+Math.sin(t*.18)*.025,ry:.32+Math.sin(t*.14)*.12,f:7,s:scale,cx:0,cy};
  const ca={...camera,cx:w*.5-sep},cb={...camera,cx:w*.5+sep};
  halo(ctx,ca.cx,cy,scale*1.75,GOLD,.22);halo(ctx,cb.cx,cy,scale*1.75,CYAN,.20);
  ctx.save();ctx.globalAlpha*=(1-join)*.42;const mg=ctx.createLinearGradient(w*.48,0,w*.52,h);mg.addColorStop(0,rgba(CYAN,0));mg.addColorStop(.5,rgba(IVORY,.32));mg.addColorStop(1,rgba(CYAN,0));ctx.fillStyle=mg;ctx.beginPath();ctx.moveTo(w*.488,h*.16);ctx.lineTo(w*.512,h*.19);ctx.lineTo(w*.512,h*.84);ctx.lineTo(w*.488,h*.81);ctx.closePath();ctx.fill();ctx.restore();
  moleculeRail(ctx,ca,false,0,w,h,join,false);moleculeRail(ctx,cb,true,theta,w,h,join,false);
  molecule(ctx,ca,false,0,1-join*.29,'none',26);
  molecule(ctx,cb,true,theta,1-join*.45,'none',26);
  moleculeRail(ctx,ca,false,0,w,h,join,true);moleculeRail(ctx,cb,true,theta,w,h,join,true);
  txt(ctx,'镜像 A',w*.25,h*.925,Math.max(22,Math.min(30,w*.021)),GOLD,'center',1-join*.45);
  txt(ctx,'镜像 B',w*.75,h*.925,Math.max(22,Math.min(30,w*.021)),CYAN,'center',1-join*.45);
  if(p>=.61&&p<=.81){const a=smooth(.61,.63,p)*(1-smooth(.785,.81,p));txt(ctx,'H / OH 的连接方向对齐',w*.5,h*.10,25,IVORY,'center',a);txt(ctx,'CH₃ / COOH 仍无法同时重合',w*.5,h*.965,25,GOLD,'center',a);}
 });
}

// Convex asymmetrically truncated crystal prism. Geometry is a teaching
// morphology, not a crystallographic lattice or measured tartrate structure.
const CRYSTAL=(()=>{
 const outline=[[-.62,-.78],[.15,-.78],[.62,-.22],[.62,.68],[-.62,.68]];
 const pts=([-1,1] as const).flatMap(z=>outline.map(([x,y])=>V(x,y,z*.36)));
 const faces=[[0,4,3,2,1],[5,6,7,8,9]];
 for(let i=0;i<5;i++)faces.push([i,(i+1)%5,(i+1)%5+5,i+5]);return{pts,faces};
})();
function crystal(ctx:CanvasRenderingContext2D,cx:number,cy:number,size:number,hand:number,angle:number,alpha=1){
 ctx.save();ctx.globalAlpha*=alpha;
 const cam:Cam={rx:-.31,ry:angle,f:6,s:size,cx,cy};
 const vertices=CRYSTAL.pts.map(p=>V(p.x*hand,p.y,p.z));
 const points=vertices.map(p=>pj(p,cam));
 const faces=CRYSTAL.faces.map(f=>({f,z:f.reduce((s,i)=>s+points[i].z,0)/f.length})).sort((a,b)=>b.z-a.z);
 for(const {f}of faces){const a=rot(vertices[f[0]],cam),b=rot(vertices[f[1]],cam),d=rot(vertices[f[2]],cam);const normal=nrm(crs(sub(b,a),sub(d,a)));const light=.34+.5*Math.abs(dot(normal,nrm(V(-.4,-.65,-1))));
  const tint=hand>0?'#c9c4ab':'#b4cdd1';const sheen=ctx.createLinearGradient(cx-size,cy-size,cx+size,cy+size);sheen.addColorStop(0,shade(tint,light*.42));sheen.addColorStop(.42,shade(tint,light*.38-.16));sheen.addColorStop(1,shade(tint,light*.28-.53));ctx.fillStyle=sheen;ctx.strokeStyle=rgba(hand>0?GOLD:CYAN,.55);ctx.lineWidth=1.1;ctx.beginPath();f.forEach((index,j)=>{const p=points[index];if(!j)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y)});ctx.closePath();ctx.fill();ctx.stroke();}
 ctx.restore();
}
function cuvette(ctx:CanvasRenderingContext2D,cx:number,cy:number,width:number,height:number,col:string){
 ctx.save();const left=cx-width/2,top=cy-height/2;
 const g=ctx.createLinearGradient(left,0,left+width,0);g.addColorStop(0,rgba(col,.13));g.addColorStop(.3,rgba(col,.025));g.addColorStop(.82,rgba(col,.065));g.addColorStop(1,rgba(IVORY,.22));ctx.fillStyle=g;ctx.fillRect(left,top,width,height);
 stroke(ctx,[{x:left,y:top},{x:left,y:top+height},{x:left+width,y:top+height},{x:left+width,y:top}],rgba(IVORY,.53),2);
 stroke(ctx,[{x:left+6,y:top+7},{x:left+6,y:top+height-7}],rgba(IVORY,.27),1);
 const fill=ctx.createLinearGradient(0,top+height*.27,0,top+height);fill.addColorStop(0,rgba(col,.045));fill.addColorStop(1,rgba(col,.12));ctx.fillStyle=fill;ctx.fillRect(left+4,top+height*.27,width-8,height*.7);
 ctx.strokeStyle=rgba(col,.42);ctx.lineWidth=1.4;ctx.beginPath();ctx.ellipse(cx,top+height*.27,width*.47,5,0,0,TAU);ctx.stroke();ctx.restore();
}
function polarization(ctx:CanvasRenderingContext2D,cx:number,cy:number,span:number,col:string,theta:number,t:number){
 // Propagation is horizontal. The transverse electric-field direction turns
 // in yz; perspective projects z diagonally. The beam itself never bends.
 const left=cx-span*.48,right=cx+span*.48,hw=span*.13;
 stroke(ctx,[{x:left,y:cy},{x:right,y:cy}],col,2,.35);
 for(let j=0;j<20;j++){
  const u=frac(t*.22+j/20),xx=lerp(left,right,u),angle=theta*clamp((xx-(cx-hw))/(2*hw),0,1);
  const ey=Math.cos(angle)*39,ez=Math.sin(angle)*39;
  stroke(ctx,[{x:xx-ez*.53,y:cy-ey+ez*.2},{x:xx+ez*.53,y:cy+ey-ez*.2}],col,1.7,.22+.46*Math.sin(u*Math.PI));
 }
 const ex=right-5,rad=71,ey=Math.cos(theta)*rad,ez=Math.sin(theta)*rad;
 ctx.save();ctx.strokeStyle=rgba(col,.30);ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(ex,cy,rad*.42,rad,0,0,TAU);ctx.stroke();ctx.restore();
 stroke(ctx,[{x:ex-ez*.53,y:cy-ey+ez*.2},{x:ex+ez*.53,y:cy+ey-ez*.2}],col,4,.96);
}

/** Sorting mirror crystals, then opposite optical rotation in two solutions. */
export function drawCrystalSorting(ctx:CanvasRenderingContext2D,t:number,progress:number,x:number,y:number,w:number,h:number):void{
 bounded(ctx,x,y,w,h,()=>{
  const p=clamp(progress,0,1),opt=smooth(.56,.76,p),size=Math.min(w*.038,h*.083),ground=h*.64;
  ctx.save();ctx.globalAlpha*=1-opt;
  ctx.strokeStyle=rgba(IVORY,.14);ctx.fillStyle=rgba(IVORY,.018);ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(w*.5,ground+50,w*.43,h*.18,0,0,TAU);ctx.fill();ctx.stroke();
  for(let i=0;i<10;i++){
   const hand=i%2===0?1:-1,step=smooth(.035+i*.047,.076+i*.047,p),sx=w*.35+(i%5)*w*.077,sy=ground-70+Math.floor(i/5)*80;
   const targetX=(hand>0?w*.18:w*.78)+(Math.floor(i/2)%3-1)*size*1.35,targetY=ground-40+Math.floor(i/6)*size*1.55;
   const cx=lerp(sx,targetX,step),cy=lerp(sy,targetY,step)-Math.sin(step*Math.PI)*h*.21;
   halo(ctx,cx,ground+40,size*1.15,hand>0?GOLD:CYAN,.10);
   crystal(ctx,cx,cy,size,hand,.55+Math.sin(t*.18+i)*.055);
   if(step>.02&&step<.98){const stem=Math.max(h*.23,cy-140);const jaw=size*.45;const a=1-smooth(.88,1,step);stroke(ctx,[{x:cx-14,y:stem},{x:cx-jaw,y:cy-18},{x:cx-jaw*.72,y:cy+5}],SILVER,3.7,a);stroke(ctx,[{x:cx+14,y:stem},{x:cx+jaw,y:cy-18},{x:cx+jaw*.72,y:cy+5}],SILVER,3.7,a);}
  }
  txt(ctx,'分开两种镜像晶体',w*.5,h*.055,29,IVORY,'center',1);
  txt(ctx,'镜像 A',w*.2,h*.91,27,GOLD,'center',1);txt(ctx,'镜像 B',w*.8,h*.91,27,CYAN,'center',1);
  ctx.restore();
  ctx.save();ctx.globalAlpha*=opt;
  for(let side=0;side<2;side++){
   const cx=w*(side?.75:.25),cy=h*.48,col=side?CYAN:GOLD,angle=(side?-1:1)*.77*smooth(.56,.96,p);
   halo(ctx,cx,cy,h*.35,col,.13);cuvette(ctx,cx,cy,w*.125,h*.49,col);polarization(ctx,cx,cy,w*.47,col,angle,t);
   txt(ctx,side?'偏振方向向左旋转':'偏振方向向右旋转',cx,h*.87,Math.min(27,w*.018),col,'center',1);
  }
  txt(ctx,'溶解后，偏振光的方向向相反两边旋转',w*.5,h*.09,Math.min(29,w*.02),IVORY,'center',1);
  ctx.restore();
 });
}

function bez(a:{x:number;y:number},b:{x:number;y:number},c:{x:number;y:number},d:{x:number;y:number},u:number){const v=1-u;return{x:v*v*v*a.x+3*v*v*u*b.x+3*v*u*u*c.x+u*u*u*d.x,y:v*v*v*a.y+3*v*v*u*b.y+3*v*u*u*c.y+u*u*u*d.y};}
function glyph(ctx:CanvasRenderingContext2D,x:number,y:number,r:number,col:string,a=1){
 for(let i=0;i<4;i++){const ang=i*TAU/4+.4,xx=x+Math.cos(ang)*r,yy=y+Math.sin(ang)*r*.68;stroke(ctx,[{x,y},{x:xx,y:yy}],col,1.4,a*.8);orb(ctx,xx,yy,2.4,col,a)}orb(ctx,x,y,3,col,a);
}
/** Optional beaker feedback teaching scene; quantities are illustrative. */
export function drawReactionVessel(ctx:CanvasRenderingContext2D,t:number,progress:number,x:number,y:number,w:number,h:number,ee:number):void{
 bounded(ctx,x,y,w,h,()=>{
  const cx=w*.45,cy=h*.59,vw=w*.40,vh=h*.52;halo(ctx,cx,cy,h*.40,CYAN,.14);cuvette(ctx,cx,cy,vw,vh,CYAN);
  const fraction=(1+clamp(ee,0,1))/2;
  for(let i=0;i<24;i++){const xx=cx+(hash(i+71)-.5)*vw*.81+Math.sin(t*.42+i)*vw*.019,yy=cy+(hash(i+41)-.34)*vh*.59+Math.cos(t*.32+i*.7)*vh*.019;
   const goldWeight=smooth(i/24-.03,i/24+.03,fraction);glyph(ctx,xx,yy,10,goldWeight>.5?GOLD:CYAN,.9);}
  const a={x:cx+vw*.38,y:cy-vh*.24},b={x:w*.96,y:h*.63},c={x:w*.91,y:h*.02},d={x:cx,y:h*.13};
  stroke(ctx,Array.from({length:81},(_,i)=>bez(a,b,c,d,i/80)),GOLD,2.1,.46);
  for(let i=0;i<5;i++){const u=frac(t*.095+i/5),p=bez(a,b,c,d,u);glyph(ctx,p.x,p.y,8,GOLD,.9)}
  stroke(ctx,[{x:cx,y:h*.12},{x:cx,y:h*.29}],SILVER,10,.68);
  const drop=frac(t*.65);orb(ctx,cx,lerp(h*.29,cy-vh*.19,drop),4.2,GOLD,Math.sin(drop*Math.PI));
  txt(ctx,'产物继续催化下一轮',w*.53,h*.95,Math.min(28,w*.035),IVORY,'center',smooth(0,.2,progress));
 });
}

/** Numerical checks are about constructed geometry, not experimental data. */
export function auditChiralGeometry(){
 const handed=(pts:V3[])=>dot(sub(pts[0],pts[3]),crs(sub(pts[1],pts[3]),sub(pts[2],pts[3])));
 const mirrored=TET.map(p=>V(-p.x,p.y,p.z));const aligned=mirrored.map(p=>turn(p,Math.PI));
 const distances=aligned.map((p,i)=>Math.sqrt(dot(sub(p,TET[i]),sub(p,TET[i]))));
 return{originalSignedVolume6:handed(TET),mirrorSignedVolume6:handed(mirrored),alignedSignedVolume6:handed(aligned),alignedSubstituentDistances:distances,
  atomCount:MOL.A.length,bondCount:MOL.Bn.length,bondOrderSum:MOL.Bn.reduce((sum,b)=>sum+(b.order??1),0),allCoordinatesFinite:MOL.A.every(a=>[a.p.x,a.p.y,a.p.z].every(Number.isFinite))};
}
