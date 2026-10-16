/** Geometry for a spatial reading of an accepted mean CFD field.
 * Cropping changes opacity only. Vectors use the same valid triangles as the
 * scalar texture; no velocity is extended into the building or absent data. */
import * as T from 'three';
import type {FlowSlice} from './ComputedFlowSlices';
import {bodySignedDistance,fluidCellTriangles,sampleValidTriangle,triangleWeights,type Segment2,type V2} from './FlowSliceGeometry';

export type FlowSpatialWindow={center_m:V2;upstream_m:number;downstream_m:number;halfWidth_m:number;downstreamWidening_m:number};
export type FlowVelocityGlyph={anchor_m:V2;velocity_m_s:[number,number,number];projectedSpeed_m_s:number;speed_m_s:number;vertices_m:V2[]};
export type FlowSpatialAnnotation={text:string;point:T.Vector3;color?:string;weight?:number};
const smooth=(a:number,b:number,x:number)=>{const f=Math.max(0,Math.min(1,(x-a)/(b-a)));return f*f*(3-2*f);};

/** This window is an editorial crop in metres, not a new solution domain. */
export function makeFlowSpatialWindow(s:FlowSlice,segments:Segment2[]):FlowSpatialWindow{
 const points=segments.flat(),bounds=points.length?[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))]:[s.width_m*.2,0,s.width_m*.3,s.height_m];
 const centerU=(bounds[0]+bounds[2])*.5;
 return s.kind==='horizontal'
  ?{center_m:[centerU,(bounds[1]+bounds[3])*.5],upstream_m:145,downstream_m:345,halfWidth_m:132,downstreamWidening_m:38}
  :{center_m:[centerU,(bounds[1]+bounds[3])*.5+28],upstream_m:175,downstream_m:355,halfWidth_m:(bounds[3]-bounds[1])*.5+92,downstreamWidening_m:0};
}
export function flowSpatialAlpha(p:V2,window:FlowSpatialWindow):number{
 const x=p[0]-window.center_m[0],y=p[1]-window.center_m[1],radius=x<0?window.upstream_m:window.downstream_m;
 const width=window.halfWidth_m+window.downstreamWidening_m*Math.max(0,Math.min(1,x/window.downstream_m));
 return 1-smooth(.72,1,Math.hypot(x/radius,y/width));
}
export function sliceWorldPoint(s:FlowSlice,p:V2,scale:number):T.Vector3{
 return new T.Vector3(...s.origin_m).addScaledVector(new T.Vector3(...s.uAxis),p[0]).addScaledVector(new T.Vector3(...s.vAxis),p[1]).multiplyScalar(scale);
}

/** Barycentric interpolation of the exported vector, not a finite difference
 * of speed. Projection into a section is performed only by glyph geometry. */
export function sampleFlowVelocity(s:FlowSlice,u:number,w:number):[number,number,number]|null{
 if(!s.velocity_m_s||!Number.isFinite(u)||!Number.isFinite(w)||u<0||u>1||w<0||w>1)return null;
 const x=u*(s.nx-1),y=w*(s.ny-1),i=Math.min(s.nx-2,Math.floor(x)),j=Math.min(s.ny-2,Math.floor(y));
 const ids=[j*s.nx+i,j*s.nx+i+1,(j+1)*s.nx+i+1,(j+1)*s.nx+i];
 for(const triangle of fluidCellTriangles(s,i,j)){
  const weights=triangleWeights(x-i,y-j,triangle);if(!weights)continue;
  const result:[number,number,number]=[0,0,0];
  for(let k=0;k<3;k++){const velocity=s.velocity_m_s[ids[triangle[k]]];if(!Array.isArray(velocity)||velocity.length!==3||!velocity.every(Number.isFinite))return null;for(let axis=0;axis<3;axis++)result[axis]+=velocity[axis]*Math.max(0,weights[k]);}
  return result;
 }
 return null;
}

/** Sparse arrows measure projected mean velocity: length = |U_plane| × 0.68 s.
 * Their complete swept outline is checked in the valid fluid support. */
export function makeFlowVelocityGlyphs(s:FlowSlice,segments:Segment2[],window:FlowSpatialWindow):FlowVelocityGlyph[]{
 const result:FlowVelocityGlyph[]=[],spacingU=s.kind==='horizontal'?44:49,spacingV=s.kind==='horizontal'?43:61,margin=6;
 const valid=(p:V2)=>flowSpatialAlpha(p,window)>.18&&sampleValidTriangle(s,p[0]/s.width_m,p[1]/s.height_m)!==null&&(!segments.length||bodySignedDistance(p,segments)>margin);
 const dot=(a:number[],b:number[])=>a.reduce((sum,n,k)=>sum+n*b[k],0);
 for(let row=-9;row<=9;row++)for(let column=-4;column<=7;column++){
  const anchor:V2=[window.center_m[0]+column*spacingU+(Math.abs(row)%2)*spacingU*.35,window.center_m[1]+row*spacingV];
  if(!valid(anchor))continue;
  const velocity=sampleFlowVelocity(s,anchor[0]/s.width_m,anchor[1]/s.height_m);if(!velocity)continue;
  const du=dot(velocity,s.uAxis),dv=dot(velocity,s.vAxis),projectedSpeed=Math.hypot(du,dv);if(projectedSpeed<3.5)continue;
  const length=projectedSpeed*.68,dx=du/projectedSpeed,dy=dv/projectedSpeed,halfWidth=.85,headWidth=2.9,headLength=Math.min(length*.36,6.4);
  const local=(forward:number,side:number):V2=>[anchor[0]+dx*forward-dy*side,anchor[1]+dy*forward+dx*side];
  const vertices=[local(-length*.5,-halfWidth),local(length*.5-headLength,-halfWidth),local(length*.5-headLength,-headWidth),local(length*.5,0),local(length*.5-headLength,headWidth),local(length*.5-headLength,halfWidth),local(-length*.5,halfWidth)];
  // Check the full thin polygon and its interior, not merely the arrow tip.
  let safe=vertices.every(valid);
  for(let longitudinal=0;safe&&longitudinal<=12;longitudinal++)for(const side of [-headWidth,0,headWidth])if(!valid(local(-length*.5+length*longitudinal/12,side))){safe=false;break;}
  if(!safe)continue;
  result.push({anchor_m:anchor,velocity_m_s:velocity,projectedSpeed_m_s:projectedSpeed,speed_m_s:sampleValidTriangle(s,anchor[0]/s.width_m,anchor[1]/s.height_m)!,vertices_m:vertices});
 }
 return result;
}
export function velocityGlyphGeometry(s:FlowSlice,glyphs:FlowVelocityGlyph[],scale:number):T.BufferGeometry{
 const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
 for(const glyph of glyphs){const start=positions.length/3;for(const p of glyph.vertices_m){positions.push(...sliceWorldPoint(s,p,scale).toArray());uvs.push(p[0]/s.width_m,p[1]/s.height_m);}for(const tri of [[0,1,5],[0,5,6],[2,3,4]])indices.push(...tri.map(n=>n+start));}
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('sliceUv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
}

/** A narrow geometric rim marks the native body/plane intersection. It is a
 * boundary annotation, not a velocity value placed inside the solid. */
export function sectionRimGeometry(s:FlowSlice,segments:Segment2[],scale:number,width_m=.85):T.BufferGeometry{
 const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
 for(const [a,b] of segments){const dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);if(length<1e-8)continue;const nx=-dy/length*width_m*.5,ny=dx/length*width_m*.5;
  const points:V2[]=[[a[0]-nx,a[1]-ny],[b[0]-nx,b[1]-ny],[b[0]+nx,b[1]+ny],[a[0]+nx,a[1]+ny]],start=positions.length/3;
  for(const p of points){positions.push(...sliceWorldPoint(s,p,scale).toArray());uvs.push(p[0]/s.width_m,p[1]/s.height_m);}indices.push(start,start+1,start+2,start,start+2,start+3);
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.setAttribute('sliceUv',new T.Float32BufferAttribute(uvs,2));geometry.setIndex(indices);geometry.computeBoundingSphere();return geometry;
}

/** Label one actual downstream sample. This is not an inferred wake minimum. */
export function findWakeSample(s:FlowSlice,window:FlowSpatialWindow,segments:Segment2[]):{point_m:V2;speed_m_s:number}|null{
 const offsets=s.kind==='horizontal'?[[112,0],[132,18],[94,-20]]:[[120,42],[140,-38],[98,95]];
 for(const [x,y] of offsets){const p:V2=[window.center_m[0]+x,window.center_m[1]+y],speed=sampleValidTriangle(s,p[0]/s.width_m,p[1]/s.height_m);if(speed!==null&&flowSpatialAlpha(p,window)>.6&&(!segments.length||bodySignedDistance(p,segments)>8))return {point_m:p,speed_m_s:speed};}
 return null;
}
