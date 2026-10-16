/**
 * Normal stress in the gross rectangular beam section solved by ZDyn.
 *
 * Units: geometry m, native end forces N / N m, returned stress Pa.
 * Positive = tension, negative = compression. This is NOT local mortise,
 * tenon, notch, pin-bearing, contact, fracture, or wood-grain stress analysis.
 * Mesh notches do not create a new section solution or stress concentration.
 * Feed REST/ASSEMBLED world vertices, before exploded-view offsets/deformation.
 */

export type Vec3Like = ReadonlyArray<number> | {readonly x:number;readonly y:number;readonly z:number};
export type Tuple3 = readonly [number,number,number];
export interface StressMember {
 id:number;
 part_id?:string;
 roll_vec?:Vec3Like;
 section:{b:number;h:number};
}
export interface SectionSample {s:number;normalMinPa:number;normalMaxPa:number}
export interface StressElementResponse {
 elementID:number;
 localEndForces?:ReadonlyArray<number>;
 sectionSamples?:ReadonlyArray<SectionSample>;
}
export interface StressPartResponse {elementResults:ReadonlyArray<StressElementResponse>}
export interface StressFrameResponse {members:Record<string,StressPartResponse>}
export type StressResponse = StressElementResponse | StressPartResponse | StressFrameResponse;

export interface StressCoordinate {
 /** Native element ID (IDs are unique within the frame). */
 element:number;
 partId?:string;
 /** Clamped interpolation coordinate; rawS also records any end overhang. */
 s:number;
 rawS:number;
 /** Local cross-section coordinates: b is along y, h is along z. */
 localY:number;
 localZ:number;
 axisXBlender:Tuple3;
 axisYBlender:Tuple3;
 axisZBlender:Tuple3;
 distanceToAxisSq:number;
 /** False means no valid signed fiber stress is assigned to this vertex. */
 withinGrossSection:boolean;
 axialCoordinateClamped:boolean;
 areaM2:number;
 iyM4:number;
 izM4:number;
 /** Precomputed fiber coefficients keep per-frame sampling inexpensive. */
 nCoefficient:number;
 myCoefficient:number;
 mzCoefficient:number;
}

const clamp=(v:number)=>Math.max(0,Math.min(1,v));
const dot=(a:Tuple3,b:Tuple3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Tuple3,b:Tuple3):Tuple3=>[
 a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0],
];
const subtract=(a:Tuple3,b:Tuple3):Tuple3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const length=(a:Tuple3)=>Math.hypot(a[0],a[1],a[2]);
const unit=(a:Tuple3):Tuple3=>{
 const n=length(a);if(n<1e-12)throw new Error('StressField: degenerate local axis');
 return [a[0]/n,a[1]/n,a[2]/n];
};
const tuple=(v:Vec3Like):Tuple3=>{
 const a='x' in v?[v.x,v.y,v.z]:[v[0],v[1],v[2]];
 if(a.some(q=>!Number.isFinite(q)))throw new Error('StressField: non-finite coordinate');
 return a as unknown as Tuple3;
};

/**
 * OpenSees LinearCrdTransf3d convention, identical to physics_v7_native.py:
 * local x = node i -> j; local y = vecxz cross x; local z = x cross y.
 * `roll_vec` is the solver's vecxz, NOT a local-y direction.
 */
export function prepareCoordinate(
 member:StressMember,
 nodeEndpointsBlender:readonly [Vec3Like,Vec3Like],
 vertexThree:Vec3Like,
):StressCoordinate {
 const a=tuple(nodeEndpointsBlender[0]),b=tuple(nodeEndpointsBlender[1]);
 const ab=subtract(b,a),L=length(ab),axisX=unit(ab);
 let roll=tuple(member.roll_vec??[0,0,1]);
 if(length(cross(axisX,roll))<1e-8)roll=[0,1,0]; // Same fallback as native builder.
 const axisY=unit(cross(roll,axisX)),axisZ=unit(cross(axisX,axisY));
 const v=tuple(vertexThree);
 // Blender -> Three [x,z,-y], therefore Three -> Blender [x,-z,y].
 const p:Tuple3=[v[0],-v[2],v[1]],relative=subtract(p,a);
 const rawS=dot(relative,axisX)/L,s=clamp(rawS);
 const localY=dot(relative,axisY),localZ=dot(relative,axisZ);
 const width=member.section.b,height=member.section.h;
 if(!(width>0&&height>0&&Number.isFinite(width)&&Number.isFinite(height)))
  throw new Error('StressField: positive rectangular b/h section required');
 const area=width*height,iy=width*height**3/12,iz=height*width**3/12;
 // glTF positions are Float32. Permit only export roundoff, not arbitrary
 // widening or invented stress beyond the section used in the FE solve.
 const tolerance=1e-5;
 const within=Math.abs(localY)<=width/2+tolerance&&Math.abs(localZ)<=height/2+tolerance;
 const alongOutside=(rawS-s)*L;
 return {
  element:member.id,partId:member.part_id,s,rawS,localY,localZ,
  axisXBlender:axisX,axisYBlender:axisY,axisZBlender:axisZ,
  distanceToAxisSq:localY*localY+localZ*localZ+alongOutside*alongOutside,
  withinGrossSection:within,axialCoordinateClamped:rawS!==s,
  areaM2:area,iyM4:iy,izM4:iz,nCoefficient:1/area,
  myCoefficient:localZ/iy,mzCoefficient:-localY/iz,
 };
}

// Responses are immutable loaded JSON. Build an index once per snapshot;
// hundreds of thousands of surface vertices must not repeatedly scan members.
const elementCache=new WeakMap<object,Map<number,StressElementResponse>>();
function elementResponse(response:StressResponse,coord:StressCoordinate):StressElementResponse|undefined {
 if('elementID' in response)return response.elementID===coord.element?response:undefined;
 let map=elementCache.get(response);
 if(!map){
  map=new Map();
  const parts='members' in response?Object.values(response.members):[response];
  for(const part of parts)for(const element of part.elementResults)map.set(element.elementID,element);
  elementCache.set(response,map);
 }
 return map.get(coord.element);
}

/**
 * Actual signed beam-fiber normal stress, in Pa. For the +x cut face,
 * internal force/moment = -(1-s)*end_i + s*end_j, hence
 * sigma_x = N/A + My*z/Iy - Mz*y/Iz (tension positive).
 * No interior element loads exist in this model: distributed loads were
 * explicitly placed on nodes, so the force interpolation is exact for it.
 *
 * undefined: missing native force, wrong element, or vertex outside the gross
 * section. Render this as unsupported/neutral, not as a fabricated zero stress.
 * Axial overhangs use the nearest end section; inspect axialCoordinateClamped.
 */
export function sampleSigned(response:StressResponse,coord:StressCoordinate):number|undefined {
 if(!coord.withinGrossSection)return undefined;
 const f=elementResponse(response,coord)?.localEndForces;
 if(!f||f.length!==12)return undefined;
 const u=1-coord.s,s=coord.s;
 const N=-u*f[0]+s*f[6],My=-u*f[4]+s*f[10],Mz=-u*f[5]+s*f[11];
 const stress=N*coord.nCoefficient+My*coord.myCoefficient+Mz*coord.mzCoefficient;
 return Number.isFinite(stress)?stress:undefined;
}

/**
 * Piecewise-linear max(|normalMin|,|normalMax|) from saved sectionSamples.
 * This is a SECTION ENVELOPE in Pa, not the stress of the particular surface
 * fiber. Between saved samples interpolation can overestimate the exact
 * envelope across a bending sign change. Do not label it signed surface stress.
 */
export function sampleEnvelope(response:StressResponse,coord:StressCoordinate):number|undefined {
 const samples=elementResponse(response,coord)?.sectionSamples;
 if(!samples?.length)return undefined;
 const amplitude=(sample:SectionSample)=>Math.max(Math.abs(sample.normalMinPa),Math.abs(sample.normalMaxPa));
 if(coord.s<=samples[0].s)return amplitude(samples[0]);
 for(let i=1;i<samples.length;i++)if(coord.s<=samples[i].s){
  const a=samples[i-1],b=samples[i],span=b.s-a.s;
  if(!(span>0))return undefined; // A corrupt/non-monotone result is not hidden.
  const t=(coord.s-a.s)/span;return amplitude(a)*(1-t)+amplitude(b)*t;
 }
 return amplitude(samples[samples.length-1]);
}
