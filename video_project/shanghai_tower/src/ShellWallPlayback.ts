import * as T from 'three';
import type {SolverId,SolverResponse} from './PhysicsPlayback';
import {clamp,mix,V} from './visual';

export type SolverWall={id:SolverId;nodeIds:SolverId[];meshIds:string[];thickness_m:number;localAxes?:number[][]};
type Field={offsetBytes:number;length:number;shape:number[]};
type Metadata={schema:string;binary:string;bytes:number;wallIds:SolverId[];time:{start:number;dt:number;count:number};fields:{verticalMPa:Field};displayLimitMPa?:number;gravityDisplayLimitMPa?:number};
type Panel={index:number;nodes:number[];a:T.Vector3;h:T.Vector3;v:T.Vector3;hl:number;vl:number};
type Binding={nodes:Int32Array;weights:Float32Array;offset:Float32Array;wall:Int32Array;colors:Float32Array};

/** Four-node shell shape functions on the source-constrained wall mid-surfaces.
 * The display surface keeps its finite thickness. Offset rotations use the
 * same actual shell-node rotations. Stress is the signed vertical membrane
 * stress averaged over the four integration points, never beam axial stress.
 */
export class ShellWallPlayback{
 readonly panels:Panel[]=[];readonly byMesh=new Map<string,Panel[]>();
 readonly bindings=new WeakMap<T.BufferGeometry,Binding>();
 readonly current:Float32Array;readonly dynamic:Float32Array;readonly limit:number;readonly gravityLimit:number;private gravityMode=false;
 constructor(readonly data:SolverResponse,readonly meta:Metadata,buffer:ArrayBuffer){
  const walls=data.walls??[];
  if(meta.schema!=='rainbow.shell-response/10'||buffer.byteLength!==meta.bytes||meta.wallIds.length!==walls.length||walls.some((w,i)=>w.id!==meta.wallIds[i]))throw new Error('Shell response identity mismatch');
  const field=meta.fields.verticalMPa;
  if(field.length!==walls.length*meta.time.count||data.static.wallStress?.gravity.verticalMPa.length!==walls.length)throw new Error('Incomplete shell response');
  this.dynamic=new Float32Array(buffer,field.offsetBytes,field.length);this.current=new Float32Array(walls.length);this.limit=meta.displayLimitMPa??6;
  this.gravityLimit=meta.gravityDisplayLimitMPa??Math.max(1,...data.static.wallStress!.gravity.verticalMPa.map(Math.abs));
  if(!(this.limit>0&&this.gravityLimit>0)||!Number.isFinite(this.limit+this.gravityLimit))throw new Error('Invalid fixed wall stress range');
  const indices=new Map(data.nodes.map((n,i)=>[n.id,i]));
  walls.forEach((w,index)=>{
   if(w.nodeIds.length!==4)throw new Error('Only validated four-node wall shells are supported');
   const nodes=w.nodeIds.map(id=>{const i=indices.get(id);if(i===undefined)throw new Error('Missing shell node');return i;});
   const xyz=nodes.map(i=>V(...data.nodes[i].xyz as [number,number,number]));
   const h=xyz[1].clone().sub(xyz[0]),v=xyz[3].clone().sub(xyz[0]),hl=h.length(),vl=v.length();
   if(hl<=0||vl<=0||Math.abs(h.dot(v))>1e-6*hl*vl||xyz[2].distanceTo(xyz[0].clone().add(h).add(v))>1e-5)throw new Error('Wall mapping requires a rectangular shell');
   const p={index,nodes,a:xyz[0],h:h.divideScalar(hl),v:v.divideScalar(vl),hl,vl};this.panels.push(p);
   for(const id of w.meshIds){const list=this.byMesh.get(id)??[];list.push(p);this.byMesh.set(id,list);}
  });
 }
 static async load(base:string,data:SolverResponse){
  if(!data.walls?.length)return undefined;
  const r=await fetch(base+'physics/shell-response.json');if(!r.ok)throw new Error('Missing wall-shell response');
  const meta=await r.json() as Metadata,b=await fetch(base+meta.binary);if(!b.ok)throw new Error('Missing wall-shell history');
  return new ShellWallPlayback(data,meta,await b.arrayBuffer());
 }
 bind(id:string,geometry:T.BufferGeometry){
  const panels=this.byMesh.get(id);if(!panels?.length)return false;
  const pos=geometry.getAttribute('position'),n=pos.count,b:Binding={nodes:new Int32Array(n*4),weights:new Float32Array(n*4),offset:new Float32Array(n*3),wall:new Int32Array(n),colors:new Float32Array(n*3)};
  const point=V(),d=V(),nearest=V();let maxDistance=0;
  for(let k=0;k<n;k++){
   point.set(pos.getX(k)*100,pos.getY(k)*100,pos.getZ(k)*100);
   let best=Infinity,picked=panels[0],s=0,t=0;
   for(const p of panels){
    // Exact distance to the rectangular mid-surface; reject by vertical extent first.
    const dy=point.y<p.a.y?p.a.y-point.y:Math.max(0,point.y-(p.a.y+p.vl));if(dy*dy>best)continue;
    d.copy(point).sub(p.a);const u=clamp(d.dot(p.h)/p.hl),v=clamp(d.dot(p.v)/p.vl);
    nearest.copy(p.a).addScaledVector(p.h,u*p.hl).addScaledVector(p.v,v*p.vl);const distance=point.distanceToSquared(nearest);
    if(distance<best){best=distance;picked=p;s=u;t=v;}
   }
   const weights=[(1-s)*(1-t),s*(1-t),s*t,(1-s)*t];b.wall[k]=picked.index;
   for(let j=0;j<4;j++){b.nodes[k*4+j]=picked.nodes[j];b.weights[k*4+j]=weights[j];}
   nearest.copy(picked.a).addScaledVector(picked.h,s*picked.hl).addScaledVector(picked.v,t*picked.vl);d.copy(point).sub(nearest);
   d.toArray(b.offset,k*3);maxDistance=Math.max(maxDistance,Math.sqrt(best));
  }
  // The visual model and wall plan are both idealizations. Save geometric
  // distance independently from solver validation; never call it mesh accuracy.
  geometry.userData.shellMapping={vertices:n,maxDistance_m:maxDistance,method:'nearest rectangular mid-surface; bilinear shape functions'};
  if(!Number.isFinite(maxDistance)||maxDistance>4)throw new Error('Visual core geometry is too far from the solved wall surfaces: '+id+' '+maxDistance);
  b.colors.fill(1);geometry.setAttribute('color',new T.BufferAttribute(b.colors,3));this.bindings.set(geometry,b);return true;
 }
 sample(time:number,gravity:boolean){
  this.gravityMode=gravity;
  if(gravity){this.current.set(this.data.static.wallStress!.gravity.verticalMPa);return;}
  const {start,dt,count}=this.meta.time,x=clamp((time-start)/(dt*(count-1)))*(count-1),i=Math.min(count-2,Math.floor(x)),f=x-i,n=this.current.length;
  for(let k=0;k<n;k++)this.current[k]=mix(this.dynamic[i*n+k],this.dynamic[(i+1)*n+k],f);
 }
 displacementForMesh(id:string,point:T.Vector3,U:Float32Array,R:Float32Array,gain:number){
  const panels=this.byMesh.get(id);if(!panels?.length)return undefined;
  const m=point.clone().multiplyScalar(100),d=V(),projected=V();let best=Infinity,picked=panels[0],s=0,t=0;
  for(const p of panels){d.copy(m).sub(p.a);const a=clamp(d.dot(p.h)/p.hl),b=clamp(d.dot(p.v)/p.vl);projected.copy(p.a).addScaledVector(p.h,a*p.hl).addScaledVector(p.v,b*p.vl);const distance=m.distanceToSquared(projected);if(distance<best){best=distance;picked=p;s=a;t=b;}}
  const weights=[(1-s)*(1-t),s*(1-t),s*t,(1-s)*t],disp=V(),rot=V();
  for(let i=0;i<4;i++){const n=picked.nodes[i]*3,w=weights[i];disp.addScaledVector(V(U[n],U[n+1],U[n+2]),w);rot.addScaledVector(V(R[n],R[n+1],R[n+2]),w);}
  const offset=m.sub(picked.a.clone().addScaledVector(picked.h,s*picked.hl).addScaledVector(picked.v,t*picked.vl));return disp.add(rot.cross(offset)).multiplyScalar(gain);
 }
 deform(geometry:T.BufferGeometry,rest:Float32Array,material:T.MeshStandardMaterial,U:Float32Array,R:Float32Array,gain:number,tint:number,active:boolean){
  const b=this.bindings.get(geometry);if(!b)return false;
  const pos=geometry.getAttribute('position') as T.BufferAttribute;
  if(!active){if(geometry.userData.shellActive){pos.array.set(rest);pos.needsUpdate=true;b.colors.fill(1);geometry.getAttribute('color').needsUpdate=true;}geometry.userData.shellActive=false;return true;}
  geometry.userData.shellActive=true;const color=new T.Color(),zero=new T.Color('#c6ccce'),cool=new T.Color('#087d9b'),warm=new T.Color('#dd4e2b'),white=new T.Color('#ffffff');
  for(let k=0;k<pos.count;k++){
   let ux=0,uy=0,uz=0,rx=0,ry=0,rz=0;
   for(let j=0;j<4;j++){const idx=b.nodes[k*4+j]*3,w=b.weights[k*4+j];ux+=U[idx]*w;uy+=U[idx+1]*w;uz+=U[idx+2]*w;rx+=R[idx]*w;ry+=R[idx+1]*w;rz+=R[idx+2]*w;}
   const idx=k*3,ox=b.offset[idx],oy=b.offset[idx+1],oz=b.offset[idx+2];
   pos.setXYZ(k,rest[idx]+gain*(ux+ry*oz-rz*oy),rest[idx+1]+gain*(uy+rz*ox-rx*oz),rest[idx+2]+gain*(uz+rx*oy-ry*ox));
   const stress=this.current[b.wall[k]],amount=Math.pow(clamp(Math.abs(stress)/(this.gravityMode?this.gravityLimit:this.limit)),.45);color.copy(zero).lerp(stress>=0?cool:warm,amount).lerp(white,1-clamp(tint)).toArray(b.colors,idx);
  }
  pos.needsUpdate=true;geometry.getAttribute('color').needsUpdate=true;
  const base=(material.userData.physicsBaseColor as T.Color|undefined)??material.color.clone();material.userData.physicsBaseColor=base;material.color.copy(base).lerp(white,clamp(tint));
  if(!material.vertexColors){material.vertexColors=true;material.needsUpdate=true;}return true;
 }
}
