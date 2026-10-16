/** Geometry and interpolation for accepted CFD display samples. No sample is
 * extrapolated and no wall speed is fabricated. All coordinates are metres. */
import type {FlowSlice} from './ComputedFlowSlices';

export type V2=[number,number];
export type Segment2=[V2,V2];
export type FlowBodyBoundary={
 schema:string;coordinates:string;quality:{acceptedForFilm:boolean};
 provenance:{sourceSHA256:string};points_m:[number,number,number][];triangles:[number,number,number][];
};
export type SliceBodyMask={segments:Segment2[];bounds:[number,number,number,number];nx:number;ny:number;distance_m:Float32Array;supportDistance_m:Float32Array;interpolationErrorBound_m:number;foundationClosure:boolean;supportBoundaryInset_m:number;bodyAlignedSupportFade:boolean};
/**
 * Editorial crop for a registered section.  The crop only changes which
 * already-solved field samples are rasterised; it never changes the sample
 * coordinates or the CFD value.  Keeping the crop in solver metres avoids a
 * large empty rectangle around the tower while retaining a small, even wind
 * buffer for context.
 */
export type SliceDisplayCrop={u0:number;u1:number;v0:number;v1:number;marginU_m:number;marginV_m:number};

export function sliceDisplayCrop(s:FlowSlice,segments:Segment2[]):SliceDisplayCrop{
 if(!segments.length)return {u0:0,u1:1,v0:0,v1:1,marginU_m:s.width_m,marginV_m:s.height_m};
 const points=segments.flat(),minU=Math.min(...points.map(p=>p[0])),maxU=Math.max(...points.map(p=>p[0])),minV=Math.min(...points.map(p=>p[1])),maxV=Math.max(...points.map(p=>p[1]));
 // Horizontal panels need a little more room for the wake on either side;
 // vertical panels are long, so keep the crop tight across the facade and
 // only a short lead/exit buffer vertically.  Both margins are snapped to
 // field cells so the rendered edge never cuts through a partially sampled
 // cell (the shader still rejects every invalid triangle).
 const marginU=s.kind==='horizontal'?62:58,marginV=s.kind==='horizontal'?62:26;
 const dx=s.width_m/(s.nx-1),dy=s.height_m/(s.ny-1);
 const snapDown=(x:number,step:number)=>Math.floor(x/step)*step;
 const snapUp=(x:number,step:number)=>Math.ceil(x/step)*step;
 const loU=Math.max(0,snapDown(minU-marginU,dx)),hiU=Math.min(s.width_m,snapUp(maxU+marginU,dx));
 const loV=Math.max(0,snapDown(minV-marginV,dy)),hiV=Math.min(s.height_m,snapUp(maxV+marginV,dy));
 return {u0:loU/s.width_m,u1:hiU/s.width_m,v0:loV/s.height_m,v1:hiV/s.height_m,marginU_m:marginU,marginV_m:marginV};
}

export const isFluidSample=(s:FlowSlice,k:number)=>s.validMask[k]===1&&s.insideSolidMask[k]===0&&typeof s.speed_m_s[k]==='number'&&Number.isFinite(s.speed_m_s[k]);
/** Cell order is bottom-left, bottom-right, top-right, top-left. A cell with
 * three valid corners contributes their triangle, never the absent half. */
export function fluidCellTriangles(s:FlowSlice,i:number,j:number):number[][]{
 const ids=[j*s.nx+i,j*s.nx+i+1,(j+1)*s.nx+i+1,(j+1)*s.nx+i];
 const live=ids.map((k,n)=>isFluidSample(s,k)?n:-1).filter(n=>n>=0);
 return live.length===4?[[0,1,2],[0,2,3]]:live.length===3?[live]:[];
}
export function triangleWeights(a:number,b:number,triangle:number[]):number[]|null{
 const corners:V2[]=[[0,0],[1,0],[1,1],[0,1]],p=corners[triangle[0]],q=corners[triangle[1]],r=corners[triangle[2]];
 const den=(q[1]-r[1])*(p[0]-r[0])+(r[0]-q[0])*(p[1]-r[1]);
 const w0=((q[1]-r[1])*(a-r[0])+(r[0]-q[0])*(b-r[1]))/den;
 const w1=((r[1]-p[1])*(a-r[0])+(p[0]-r[0])*(b-r[1]))/den,w2=1-w0-w1;
 return Math.min(w0,w1,w2)>=-1e-10?[w0,w1,w2]:null;
}
export function sampleValidTriangle(s:FlowSlice,u:number,w:number):number|null{
 if(!Number.isFinite(u)||!Number.isFinite(w)||u<0||u>1||w<0||w>1)return null;
 const x=u*(s.nx-1),y=w*(s.ny-1),i=Math.min(s.nx-2,Math.floor(x)),j=Math.min(s.ny-2,Math.floor(y));
 const ids=[j*s.nx+i,j*s.nx+i+1,(j+1)*s.nx+i+1,(j+1)*s.nx+i];
 for(const t of fluidCellTriangles(s,i,j)){const weights=triangleWeights(x-i,y-j,t);if(weights)return t.reduce((sum,k,n)=>sum+(s.speed_m_s[ids[k]] as number)*Math.max(0,weights[n]),0);}
 return null;
}

// Exact separable squared Euclidean distance transform. This controls opacity
// only. It is never read as a velocity or used to fill an invalid triangle.
function edt1(f:Float64Array,spacing:number):Float64Array{
 const n=f.length,out=new Float64Array(n),v=new Int32Array(n),z=new Float64Array(n+1),weight=spacing*spacing;
 let k=0;v[0]=0;z[0]=-Infinity;z[1]=Infinity;
 for(let q=1;q<n;q++){
  let cut=((f[q]+weight*q*q)-(f[v[k]]+weight*v[k]*v[k]))/(2*weight*(q-v[k]));
  while(cut<=z[k]&&k>0){k--;cut=((f[q]+weight*q*q)-(f[v[k]]+weight*v[k]*v[k]))/(2*weight*(q-v[k]));}
  k++;v[k]=q;z[k]=cut;z[k+1]=Infinity;
 }
 k=0;for(let q=0;q<n;q++){while(z[k+1]<q)k++;out[q]=weight*(q-v[k])**2+f[v[k]];}return out;
}
export function sampleSupportClearance(s:FlowSlice):Float32Array{
 const dx=s.width_m/(s.nx-1),dy=s.height_m/(s.ny-1),tmp=new Float64Array(s.nx*s.ny),out=new Float32Array(tmp.length);
 if(s.validMask.every((_,k)=>isFluidSample(s,k))){out.fill(1e6);return out;}
 for(let j=0;j<s.ny;j++){const f=new Float64Array(s.nx);for(let i=0;i<s.nx;i++)f[i]=isFluidSample(s,j*s.nx+i)?1e20:0;tmp.set(edt1(f,dx),j*s.nx);}
 // Subtract the cell diagonal: every exposed triangle edge has zero opacity.
 // A narrow fade then lies wholly inside the reliable sample support.
 for(let i=0;i<s.nx;i++){const f=new Float64Array(s.ny);for(let j=0;j<s.ny;j++)f[j]=tmp[j*s.nx+i];const d=edt1(f,dy);for(let j=0;j<s.ny;j++)out[j*s.nx+i]=Math.max(0,Math.sqrt(d[j])-Math.hypot(dx,dy));}
 return out;
}
export function segmentDistance(p:V2,[a,b]:Segment2):number{
 const x=b[0]-a[0],y=b[1]-a[1],den=x*x+y*y,t=den>0?Math.max(0,Math.min(1,((p[0]-a[0])*x+(p[1]-a[1])*y)/den)):0;
 return Math.hypot(p[0]-a[0]-t*x,p[1]-a[1]-t*y);
}
export function bodySignedDistance(p:V2,segments:Segment2[]):number{
 let distance=Infinity,inside=false;
 for(const line of segments){distance=Math.min(distance,segmentDistance(p,line));const [a,b]=line;if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}
 return inside?-distance:distance;
}

/** Boundary of the actual valid-triangle union, excluding the outside display
 * rectangle. Array edge counts avoid a large mesh/string-key allocation. */
export function validSupportBoundary(s:FlowSlice,includeDisplayEdges=false):Segment2[]{
 const n=s.nx*s.ny,h=new Uint8Array(n),v=new Uint8Array(n),up=new Uint8Array(n),down=new Uint8Array(n),result:Segment2[]=[];
 for(let j=0;j<s.ny-1;j++)for(let i=0;i<s.nx-1;i++){
  const ids=[j*s.nx+i,j*s.nx+i+1,(j+1)*s.nx+i+1,(j+1)*s.nx+i];
  for(const t of fluidCellTriangles(s,i,j))for(let e=0;e<3;e++){const a=ids[t[e]],b=ids[t[(e+1)%3]],lo=Math.min(a,b),delta=Math.abs(a-b);if(delta===1&&Math.floor(a/s.nx)===Math.floor(b/s.nx))h[lo]++;else if(delta===s.nx)v[lo]++;else if(delta===s.nx+1)up[j*s.nx+i]++;else down[j*s.nx+i]++;}
 }
 const point=(i:number,j:number):V2=>[i*s.width_m/(s.nx-1),j*s.height_m/(s.ny-1)];
 for(let j=0;j<s.ny;j++)for(let i=0;i<s.nx;i++){const k=j*s.nx+i;if(h[k]===1&&(includeDisplayEdges||(j>0&&j<s.ny-1)))result.push([point(i,j),point(i+1,j)]);if(v[k]===1&&(includeDisplayEdges||(i>0&&i<s.nx-1)))result.push([point(i,j),point(i,j+1)]);if(up[k]===1)result.push([point(i,j),point(i+1,j+1)]);if(down[k]===1)result.push([point(i+1,j),point(i,j+1)]);}
 return result;
}

/** Distance to the actual valid-triangle union. Used for opacity coverage,
 * never scalar interpolation. Missing near-wall samples remain missing. */
export function supportSignedDistance(s:FlowSlice,p:V2,edges=validSupportBoundary(s,true)):number{
 let distance=Infinity;for(const edge of edges)distance=Math.min(distance,segmentDistance(p,edge));
 return (sampleValidTriangle(s,p[0]/s.width_m,p[1]/s.height_m)===null?-1:1)*distance;
}

/** A Lipschitz bound on the farthest unsupported boundary from the body.
 * Past this band the near-body field has complete valid-triangle support.
 * Distant missing-data holes disable this cosmetic body-aligned fade; their
 * local mask remains authoritative. No scalar is synthesized in either case. */
export function nativeSupportInset(s:FlowSlice,segments:Segment2[]):{supportBoundaryInset_m:number;bodyAlignedSupportFade:boolean}{
 let max=0;const edges=validSupportBoundary(s);
 for(const edge of edges){const [a,b]=edge,length=Math.hypot(b[0]-a[0],b[1]-a[1]),steps=Math.max(1,Math.ceil(length/.125));let local=-Infinity;for(let k=0;k<=steps;k++){const t=k/steps;local=Math.max(local,bodySignedDistance([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])],segments));}max=Math.max(max,local+length/(2*steps));}
 const diagonal=Math.hypot(s.width_m/(s.nx-1),s.height_m/(s.ny-1));
 return {supportBoundaryInset_m:max,bodyAlignedSupportFade:edges.length>0&&max<=2*diagonal};
}

/** Intersect the native solved body skin, preserving its real polygon edges.
 * The pressure skin deliberately omits the planar foundation closure. For a
 * vertical section its two ground endpoints can be joined at that same datum;
 * no other open boundary is silently closed. */
export function sectionBodyBoundary(s:FlowSlice,b:FlowBodyBoundary):{segments:Segment2[];foundationClosure:boolean}{
 const u=s.uAxis,w=s.vAxis,n=[u[1]*w[2]-u[2]*w[1],u[2]*w[0]-u[0]*w[2],u[0]*w[1]-u[1]*w[0]],eps=1e-5;
 const dot=(p:number[],axis:number[])=>p.reduce((a,c,i)=>a+c*axis[i],0);
 const local=b.points_m.map(p=>p.map((q,i)=>q-s.origin_m[i])),dist=local.map(p=>dot(p,n));
 const projected=local.map(p=>[dot(p,u),dot(p,w)] as V2),segments:Segment2[]=[],seen=new Set<string>();
 const key=(p:V2)=>`${Math.round(p[0]/eps)},${Math.round(p[1]/eps)}`;
 const add=(a:V2,c:V2)=>{if(Math.hypot(a[0]-c[0],a[1]-c[1])<eps)return;const keys=[key(a),key(c)].sort().join('|');if(!seen.has(keys)){seen.add(keys);segments.push([a,c]);}};
 for(const triangle of b.triangles){
  const hits:V2[]=[];
  for(let e=0;e<3;e++){
   const a=triangle[e],c=triangle[(e+1)%3],da=dist[a],dc=dist[c];
   if(Math.abs(da)<eps)hits.push(projected[a]);
   if((da>eps&&dc< -eps)||(da< -eps&&dc>eps)){const t=da/(da-dc);hits.push([projected[a][0]+t*(projected[c][0]-projected[a][0]),projected[a][1]+t*(projected[c][1]-projected[a][1])]);}
  }
  const unique=[...new Map(hits.map(p=>[key(p),p])).values()];if(unique.length===2)add(unique[0],unique[1]);
 }
 if(!segments.length)throw new Error(`No native body section for ${s.id}`);
 const ends=new Map<string,{p:V2;count:number}>();for(const line of segments)for(const p of line){const k=key(p),old=ends.get(k);ends.set(k,{p,count:(old?.count??0)+1});}
 const open=[...ends.values()].filter(x=>x.count===1);let foundationClosure=false;
 if(open.length){
  const ground=Math.min(...b.points_m.map(p=>p[1])),worldY=(p:V2)=>s.origin_m[1]+p[0]*u[1]+p[1]*w[1];
  if(s.kind==='vertical'&&open.length===2&&open.every(x=>Math.abs(worldY(x.p)-ground)<1e-3)){add(open[0].p,open[1].p);foundationClosure=true;}
  else throw new Error(`Native body section ${s.id} has ${open.length} unclosed endpoints`);
 }
 if([...ends.values()].some(x=>x.count>2))throw new Error(`Nonmanifold native body section ${s.id}`);
 return {segments,foundationClosure};
}

/** Compact signed-distance raster for clipping, not field sampling. It covers
 * only the native building footprint. Manual bilinear sampling plus a strict
 * Lipschitz error bound keeps the mask conservative on the fluid side. */
export function buildSliceBodyMask(s:FlowSlice,b:FlowBodyBoundary):SliceBodyMask{
 const section=sectionBodyBoundary(s,b),support=nativeSupportInset(s,section.segments),points=section.segments.flat(),grid=Math.max(s.width_m/(s.nx-1),s.height_m/(s.ny-1)),pad=Math.max(2*grid,support.bodyAlignedSupportFade?support.supportBoundaryInset_m+2.5*grid:0);
 const bounds:[number,number,number,number]=[Math.min(...points.map(p=>p[0]))-pad,Math.min(...points.map(p=>p[1]))-pad,Math.max(...points.map(p=>p[0]))+pad,Math.max(...points.map(p=>p[1]))+pad];
 const width=bounds[2]-bounds[0],height=bounds[3]-bounds[1],spacing=Math.max(.25,width/1023,height/2047),nx=Math.ceil(width/spacing)+1,ny=Math.ceil(height/spacing)+1;
 const dx=width/(nx-1),dy=height/(ny-1),distance_m=new Float32Array(nx*ny),supportDistance_m=new Float32Array(nx*ny);
 // Precompute segment coefficients: this identical geometric query avoids
 // allocating vectors and evaluating a square root for every segment/pixel.
 const edges=section.segments.map(([a,b])=>{const x=b[0]-a[0],y=b[1]-a[1];return [a[0],a[1],x,y,1/(x*x+y*y),b[1]];});
 const supportEdges=validSupportBoundary(s,true).map(([a,b])=>{const x=b[0]-a[0],y=b[1]-a[1];return [a[0],a[1],x,y,1/(x*x+y*y)];});
 for(let j=0;j<ny;j++)for(let i=0;i<nx;i++){
  const x=bounds[0]+i*dx,y=bounds[1]+j*dy;let nearest=Infinity,inside=false;
  for(let k=0;k<edges.length;k++){const e=edges[k],px=x-e[0],py=y-e[1],t=Math.max(0,Math.min(1,(px*e[2]+py*e[3])*e[4])),ex=px-t*e[2],ey=py-t*e[3];nearest=Math.min(nearest,ex*ex+ey*ey);if((e[1]>y)!==(e[5]>y)&&x<e[2]*(y-e[1])/e[3]+e[0])inside=!inside;}
  distance_m[j*nx+i]=(inside?-1:1)*Math.sqrt(nearest);
  let supportNearest=Infinity;
  for(const e of supportEdges){const px=x-e[0],py=y-e[1],t=Math.max(0,Math.min(1,(px*e[2]+py*e[3])*e[4])),ex=px-t*e[2],ey=py-t*e[3];supportNearest=Math.min(supportNearest,ex*ex+ey*ey);}
  // This is a local mask. The previous maximum unsupported distance was
  // applied to the whole wall and erased valid fluid as a broad white halo.
  // The valid-triangle sampler remains the authoritative gate in the shader.
  supportDistance_m[j*nx+i]=supportEdges.length?(sampleValidTriangle(s,x/s.width_m,y/s.height_m)===null?-1:1)*Math.sqrt(supportNearest):1e6;
 }
 return {...section,...support,bounds,nx,ny,distance_m,supportDistance_m,interpolationErrorBound_m:Math.hypot(dx,dy)*.5};
}
