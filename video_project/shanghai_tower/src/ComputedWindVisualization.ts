import * as T from 'three';
import {State,V,Timeline,clamp,mix,pulse,ramp} from './visual';
import {installWindScreenMask} from './WindScreenMask';

export type ComputedStreamline={
 points_m:[number,number,number][];
 speed_m_s:number[];
 travelTime_s:number[];
};
export type ComputedWindData={
 schema:'rainbow.computed-wind-paths/1';
 coordinates:'metres, Three.js XYZ, Y up';
 provenance:{solver:string;case:string;meaning:string;sourceSHA256:string};
 quality?:{acceptedForFilm?:boolean;acceptedForCoupling?:boolean;notes?:string};
 streamlines:ComputedStreamline[];
};
type Trail={data:ComputedStreamline;points:T.Vector3[];guideIndices:number[];guide:T.Mesh<T.BufferGeometry,T.MeshBasicMaterial>;ribbon:T.Mesh;head:T.Mesh;
 positions:Float32Array;colors:Float32Array;color:T.Color;duration:number;seedPhase:number;};
const TAIL=32;
const GUIDE_TOLERANCE_M=.025;

/** Remove redundant display vertices, retaining original solver points only.
 * The source polyline stays within tolerance of each retained chord. Exact
 * travel-clock clipping can move both chord ends onto the source polyline,
 * so its conservative partial-chord bound is twice this tolerance. Tracer
 * positions, tangents, speeds and travel times still use every source point.
 */
export function computedGuideIndices(points:ComputedStreamline['points_m'],toleranceM=GUIDE_TOLERANCE_M){
 if(!(toleranceM>0)||!Number.isFinite(toleranceM))throw new Error('Invalid CFD guide tolerance');
 const keep=new Set<number>([0,points.length-1]),stack:Array<[number,number]>=[[0,points.length-1]];
 const distanceSquared=(p:number[],a:number[],b:number[])=>{
  const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length=dx*dx+dy*dy+dz*dz;
  const f=length>0?clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy+(p[2]-a[2])*dz)/length):0;
  return (p[0]-a[0]-f*dx)**2+(p[1]-a[1]-f*dy)**2+(p[2]-a[2]-f*dz)**2;
 };
 while(stack.length){
  const [a,b]=stack.pop()!;let farthest=-1,error=toleranceM*toleranceM;
  for(let k=a+1;k<b;k++){const d=distanceSquared(points[k],points[a],points[b]);if(d>error){error=d;farthest=k;}}
  if(farthest>=0){keep.add(farthest);stack.push([a,farthest],[farthest,b]);}
 }
 return [...keep].sort((a,b)=>a-b);
}

/** Renders integrated CFD trajectories only. Shape and local advection speed
 * come from the solver export; there is no hand-oscillated downstream wake. */
export class ComputedWindVisualization{
 root=new T.Group();trails:Trail[]=[];
 readonly guideAudit:{sourcePoints:number;retainedPoints:number;fullChordBound_m:number;clippedChordBound_m:number}[]=[];
 private clockStartSec:number;
 constructor(scene:T.Scene,data:ComputedWindData,tl:Timeline){
  if(data.schema!=='rainbow.computed-wind-paths/1'||data.coordinates!=='metres, Three.js XYZ, Y up')throw new Error('Unsupported CFD path coordinates');
  if(!data.provenance.sourceSHA256||!data.streamlines.length)throw new Error('Computed wind paths lack solver provenance');
  if(data.quality?.acceptedForFilm!==true)throw new Error('Computed wind paths are not accepted for film');
  const n=Math.floor(28.85),clip=tl.clips.find(c=>Number(c.id.slice(1))===n);
  this.clockStartSec=clip?((clip.start+(28.85-n)*(clip.end-clip.start))/tl.fps):0;
  this.root.name='computed-cfd-streamlines';scene.add(this.root);
  data.streamlines.forEach((d,i)=>{
   const n=d.points_m.length;
   if(n<3||d.speed_m_s.length!==n||d.travelTime_s.length!==n)throw new Error('Invalid CFD path array lengths');
   for(let k=0;k<n;k++){
    if(d.points_m[k].some(v=>!Number.isFinite(v))||!Number.isFinite(d.speed_m_s[k])||d.speed_m_s[k]<0||!Number.isFinite(d.travelTime_s[k])||(k>0&&d.travelTime_s[k]<=d.travelTime_s[k-1]))throw new Error('Invalid CFD path value');
   }
   const points=d.points_m.map(p=>V(...p).multiplyScalar(.01));
   const guideIndices=computedGuideIndices(d.points_m);
   this.guideAudit.push({sourcePoints:n,retainedPoints:guideIndices.length,fullChordBound_m:GUIDE_TOLERANCE_M,clippedChordBound_m:2*GUIDE_TOLERANCE_M});
   const color=new T.Color('#08728c');
   const mat=new T.MeshBasicMaterial({color,transparent:true,opacity:.39,depthTest:true,depthWrite:false,side:T.DoubleSide,toneMapped:false});
   installWindScreenMask(mat);
   // One joined strip avoids alpha accumulating at every Line2 round cap.
   // Its centreline retains original solver samples within the bound above.
   const guideGeometry=new T.BufferGeometry(),guideTriangles:number[]=[];
   guideGeometry.setAttribute('position',new T.BufferAttribute(new Float32Array(guideIndices.length*6),3));
   for(let k=0;k<guideIndices.length-1;k++){const q=k*2;guideTriangles.push(q,q+1,q+2,q+1,q+3,q+2);}
   guideGeometry.setIndex(guideTriangles);guideGeometry.setDrawRange(0,0);
   const guide=new T.Mesh(guideGeometry,mat);guide.frustumCulled=false;
   const positions=new Float32Array(TAIL*6),colors=new Float32Array(TAIL*8),indices:number[]=[];
   for(let k=0;k<TAIL-1;k++){const q=k*2;indices.push(q,q+1,q+2,q+1,q+3,q+2);}
   const g=new T.BufferGeometry();g.setAttribute('position',new T.BufferAttribute(positions,3));g.setAttribute('color',new T.BufferAttribute(colors,4));g.setIndex(indices);
   const ribbonMaterial=new T.MeshBasicMaterial({color:'white',vertexColors:true,transparent:true,depthWrite:false,side:T.DoubleSide,toneMapped:false});installWindScreenMask(ribbonMaterial);
   const ribbon=new T.Mesh(g,ribbonMaterial);ribbon.frustumCulled=false;
   const headMaterial=new T.MeshBasicMaterial({color,transparent:true,depthWrite:false,toneMapped:false});installWindScreenMask(headMaterial);
   // A narrow direction head reads on a phone while remaining anchored to the
   // integrated path. The cone's +Y axis is aligned with the local CFD tangent.
   const head=new T.Mesh(new T.ConeGeometry(1,1,16),headMaterial);head.frustumCulled=false;
   this.root.add(guide,ribbon,head);
   const duration=d.travelTime_s.at(-1)!-d.travelTime_s[0];
   this.trails.push({data:d,points,guideIndices,guide,ribbon,head,positions,colors,color,duration,seedPhase:((i*.61803398875)%1)*duration});
  });
 }
 private at(tr:Trail,t:number){
  const times=tr.data.travelTime_s,time=Math.max(times[0],Math.min(times.at(-1)!,t+times[0]));let a=0,b=times.length-1;
  while(b-a>1){const k=(a+b)>>1;if(times[k]<=time)a=k;else b=k;}
  return tr.points[a].clone().lerp(tr.points[b],clamp((time-times[a])/(times[b]-times[a])));
 }
 update(s:State,camera:T.PerspectiveCamera){
  const u=s.n+s.u,weight=pulse(28.85,29.5,31.35,32.15,u);
  this.root.visible=weight>.00001;if(!this.root.visible)return;
  // Keep every streamline at its actual world coordinates even during the
  // transition. A downstream-moving reveal front draws/retracts the paths;
  // translating the whole field would falsely move the wake through the tower.
  const enter=ramp(28.85,29.5,u),leave=ramp(31.35,32.15,u);
  this.root.position.set(0,0,0);
  // Film `s.time` is the absolute timeline clock, while solver paths carry a
  // local travel clock. Start that clock at the registered entrance instant;
  // every streamline then advances by the same physical seconds, preserving
  // the solver's own speed differences without a clip-dependent reset.
  const localSeconds=Math.max(0,s.time-this.clockStartSec);
  for(const tr of this.trails){
   const startTime=leave*tr.duration,endTime=enter*tr.duration;
   const guidePoints:T.Vector3[]=[];
   for(let k=0;k<tr.guideIndices.length-1;k++){
    const i=tr.guideIndices[k],j=tr.guideIndices[k+1];
    const a=tr.data.travelTime_s[i]-tr.data.travelTime_s[0],b=tr.data.travelTime_s[j]-tr.data.travelTime_s[0];
    const lo=Math.max(a,startTime),hi=Math.min(b,endTime);if(hi<=lo)continue;
    // Cut on the original time-parameterized polyline, never interpolate
    // time linearly across the simplified chord and change local velocity.
    const p=lo===a?tr.points[i]:this.at(tr,lo),q=hi===b?tr.points[j]:this.at(tr,hi);
    if(!guidePoints.length)guidePoints.push(p);guidePoints.push(q);
   }
   const guideVertices=tr.guide.geometry.getAttribute('position') as T.BufferAttribute;
   for(let k=0;k<guidePoints.length;k++){
    const p=guidePoints[k],view=camera.position.clone().sub(p).normalize();
    const before=p.clone().sub(guidePoints[Math.max(0,k-1)]),after=guidePoints[Math.min(guidePoints.length-1,k+1)].clone().sub(p);
    if(before.lengthSq()<1e-20)before.copy(after);if(after.lengthSq()<1e-20)after.copy(before);
    const left=V().crossVectors(before.normalize(),view).normalize(),right=V().crossVectors(after.normalize(),view).normalize(),miter=left.clone().add(right).normalize();
    if(miter.lengthSq()<1e-12)miter.setFromMatrixColumn(camera.matrixWorld,0);
    const half=1.2*2*Math.tan(T.MathUtils.degToRad(camera.fov)/2)*camera.position.distanceTo(p)/1080/Math.max(.25,Math.abs(miter.dot(right)));
    for(let side=0;side<2;side++){const edge=p.clone().addScaledVector(miter,half*(side?1:-1));guideVertices.setXYZ(k*2+side,edge.x,edge.y,edge.z);}
   }
   guideVertices.needsUpdate=true;tr.guide.geometry.setDrawRange(0,Math.max(0,guidePoints.length-1)*6);tr.guide.visible=guidePoints.length>1;
   // A steady field permits continuous upstream seeding. Each new tracer
   // repeats the same integrated travel clock, never an invented oscillation.
   // Tail exits completely before replacement; deterministic phase only sets
   // injection time, not velocity. Avoid freezing after one transit.
   const tailSeconds=Math.min(2.6,tr.duration*.18),leading=(localSeconds+tr.seedPhase)%(tr.duration+tailSeconds);
   const sliceWeight=pulse(29.92,30.16,31.85,32.15,u);
   tr.guide.material.opacity=mix(.44,.24,sliceWeight);
   const point=this.at(tr,leading),view=camera.position.clone().sub(point).normalize();
   const wpp=2*Math.tan(T.MathUtils.degToRad(camera.fov)/2)*camera.position.distanceTo(point)/1080;
   const tangentTime=Math.max(.021,Math.min(tr.duration-.021,leading));
   const tangentStep=this.at(tr,tangentTime+.02).sub(this.at(tr,tangentTime-.02));
   const localSpeed=tangentStep.length()/.04;
   // Stop the ribbon one cone length upstream, using its actual travel clock.
   // Otherwise the broad ribbon paints over the direction head. Both remain
   // on the integrated path; no screen-space offset moves the flow field.
   const bodyLeading=leading-wpp*11/Math.max(localSpeed,1e-5);
   for(let k=0;k<TAIL;k++){
    const f=k/(TAIL-1),age=bodyLeading-tailSeconds*(1-f),p=this.at(tr,age);
    const tangent=this.at(tr,age+.012).sub(this.at(tr,age-.012)).normalize(),side=V().crossVectors(tangent,view).normalize();
    const half=wpp*2.25*Math.pow(f,.62),edge=ramp(0,.20,age)*(1-ramp(tr.duration-.20,tr.duration,age));
    const revealMask=ramp(startTime,startTime+.20,age)*(1-ramp(endTime-.20,endTime,age));
    const alpha=(age>0&&age<tr.duration?1:0)*edge*revealMask*Math.pow(f,.72)*mix(.92,.48,sliceWeight);
    for(let q=0;q<2;q++){
     const p3=p.clone().addScaledVector(side,(q?1:-1)*half),idx=(k*2+q)*3,ci=(k*2+q)*4;
     tr.positions.set(p3.toArray(),idx);tr.colors.set([tr.color.r,tr.color.g,tr.color.b,alpha],ci);
    }
   }
   tr.ribbon.geometry.getAttribute('position').needsUpdate=true;tr.ribbon.geometry.getAttribute('color').needsUpdate=true;
   const heading=tangentStep.normalize();
   tr.head.quaternion.setFromUnitVectors(V(0,1,0),heading);
   tr.head.position.copy(point).addScaledVector(heading,-wpp*5.5);
   tr.head.scale.set(wpp*4.2,wpp*11,wpp*4.2);tr.head.visible=leading>0&&leading<tr.duration;
   (tr.head.material as T.MeshBasicMaterial).opacity=ramp(startTime,startTime+.2,leading)*(1-ramp(endTime-.2,endTime,leading))*mix(1,.85,sliceWeight);
  }
 }
 dispose(){this.root.removeFromParent();this.root.traverse(o=>{if(o instanceof T.Mesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});}
}
