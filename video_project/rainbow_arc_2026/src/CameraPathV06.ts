import * as T from 'three';

/** Pure, configurable camera rail. Perspective cameras face local -Z. */
export type SceneKeyV06 = 'street'|'drop'|'dispersion'|'reflection'|'angle'|'cone'|'circle'|'observer'|'secondary'|'return'|'coda';
export type Vec3V06 = readonly [number,number,number];
export type CameraPoseV06 = {position:Vec3V06;target:Vec3V06;fov:number};
export type CameraSceneV06 = {id:string;start:number;end:number};
export type CameraShotV06 = {start:CameraPoseV06;end:CameraPoseV06};
export type CameraKeyV06 = CameraPoseV06 & {frame:number};
export type CameraOptionsV06 = {
  fps?:number;
  scenes?:readonly CameraSceneV06[];
  poses?:Partial<Record<SceneKeyV06,CameraShotV06>>;
  handoffFrames?:number|Partial<Record<SceneKeyV06,number>>;
  bridgePoses?:Partial<Record<SceneKeyV06,readonly {progress:number;pose:CameraPoseV06}[]>>;
  keyframes?:readonly CameraKeyV06[];
};
export type CameraSampleV06 = CameraPoseV06 & {frame:number;seconds:number;scene:string;sceneProgress:number;quaternion:T.Quaternion};
const clamp=(x:number,a=0,b=1)=>Math.max(a,Math.min(b,x));
const valid=(x:number,fallback:number)=>Number.isFinite(x)?x:fallback;
const pose=(position:Vec3V06,target:Vec3V06,fov:number):CameraPoseV06=>({position,target,fov});
const shot=(start:CameraPoseV06,end:CameraPoseV06):CameraShotV06=>({start,end});

export const defaultScenesV06:readonly CameraSceneV06[]=[
 {id:'street',start:0,end:1020},{id:'drop',start:1020,end:2100},
 {id:'dispersion',start:2100,end:3180},{id:'reflection',start:3180,end:4140},
 {id:'angle',start:4140,end:4680},{id:'cone',start:4680,end:5400},
 {id:'circle',start:5400,end:6360},{id:'observer',start:6360,end:7140},
 {id:'secondary',start:7140,end:8100},{id:'return',start:8100,end:8850},
 {id:'coda',start:8850,end:9000},
];
export const defaultPosesV06:Record<SceneKeyV06,CameraShotV06>={
 street:shot(pose([.15,2.2,10.5],[0,3,-7],64),pose([3.2,3.25,13],[0,2.75,-2],57)),
 drop:shot(pose([29.8,3.75,9.2],[32,2.6,0],43),pose([34.5,3.25,5.2],[32,2.6,0],38)),
 dispersion:shot(pose([34.5,3.25,5.2],[32,2.6,0],38),pose([32.6,3.15,6.9],[31.3,2.6,0],39)),
 reflection:shot(pose([32.6,3.15,6.9],[31.3,2.6,0],39),pose([27.8,3.55,8.1],[30.9,2.6,0],43)),
 angle:shot(pose([27.8,3.55,8.1],[30.9,2.6,0],43),pose([29,4.1,10],[31,2.6,0],44)),
 cone:shot(pose([11,8.1,22],[0,2.65,0],45),pose([6.2,6.9,22],[0,2.65,0],47)),
 circle:shot(pose([6.2,6.9,22],[0,2.65,0],47),pose([1.2,2.6,11.2],[0,3,-8],64)),
 observer:shot(pose([1.2,2.6,11.2],[0,3,-8],64),pose([9,6,21],[0,2.7,1],49)),
 secondary:shot(pose([2,3.65,17.2],[0,3.1,-5],61),pose([3.2,3.45,16],[0,3,-5],59)),
 return:shot(pose([3.2,3.45,16],[0,3,-5],59),pose([.6,2.35,11.5],[0,3,-6],63)),
 coda:shot(pose([.6,2.35,11.5],[0,3,-6],63),pose([.15,2.2,10.5],[0,3.1,-7],64)),
};
const sceneList=(options:CameraOptionsV06):CameraSceneV06[]=>{
 const source=options.scenes?.length?options.scenes:defaultScenesV06;
 const sorted=source.filter(s=>Number.isFinite(s.start)&&Number.isFinite(s.end)&&s.end>s.start).map(s=>({...s})).sort((a,b)=>a.start-b.start);
 return sorted.length?sorted:[{...defaultScenesV06[0]}];
};
function cleanPose(p:CameraPoseV06):CameraPoseV06{
 const triplet=(v:Vec3V06,fallback:Vec3V06):Vec3V06=>v.map((x,i)=>valid(x,fallback[i])) as unknown as Vec3V06;
 const position=triplet(p.position,[0,2,10]);
 let target=triplet(p.target,[0,2,0]);
 if(new T.Vector3(...position).distanceToSquared(new T.Vector3(...target))<1e-10)target=[position[0],position[1],position[2]-1];
 return {position,target,fov:clamp(valid(p.fov,45),24,75)};
}
/** Compile once for large renders; keys expose actual camera route for audits. */
export function compileCameraKeysV06(options:CameraOptionsV06={}):CameraKeyV06[]{
 if(options.keyframes?.length){
  const result=options.keyframes.filter(k=>Number.isFinite(k.frame)).map(k=>({...cleanPose(k),frame:k.frame})).sort((a,b)=>a.frame-b.frame);
  const unique=result.filter((k,i,a)=>i===a.length-1||k.frame!==a[i+1].frame);
  if(unique.length)return unique;
 }
 const scenes=sceneList(options);
 const handoffs=scenes.map((scene,i)=>{
  if(i===0)return 0;
  const explicit=typeof options.handoffFrames==='number'?options.handoffFrames:options.handoffFrames?.[scene.id as SceneKeyV06];
  const standard=scene.id==='drop'||scene.id==='cone'?210:60;
  // Each half-handoff takes at most 40% of its neighboring scene.
  return Math.max(0,Math.min(valid(explicit??standard,60),.8*(scene.end-scene.start),.8*(scenes[i-1].end-scenes[i-1].start)));
 });
 const keys:CameraKeyV06[]=[];
 for(let i=0;i<scenes.length;i++){
  const scene=scenes[i],id=scene.id as SceneKeyV06;
  const current=options.poses?.[id]??defaultPosesV06[id]??defaultPosesV06.street;
  const start=scene.start+handoffs[i]/2;
  const end=scene.end-(handoffs[i+1]??0)/2;
  keys.push({...cleanPose(current.start),frame:start},{...cleanPose(current.end),frame:Math.max(start+1e-3,end)});
  if(i>0){
   const left=scenes[i-1].end-handoffs[i]/2,right=start;
   for(const bridge of options.bridgePoses?.[id]??[]){
    if(bridge.progress>0&&bridge.progress<1)keys.push({...cleanPose(bridge.pose),frame:left+(right-left)*bridge.progress});
   }
  }
 }
 keys.sort((a,b)=>a.frame-b.frame);
 return keys.filter((k,i,a)=>i===a.length-1||Math.abs(k.frame-a[i+1].frame)>1e-8);
}
function keyVelocity(keys:readonly CameraKeyV06[],index:number,field:'position'|'target'|'fov',axis=0):number{
 const value=(i:number)=>field==='fov'?keys[i].fov:keys[i][field][axis];
 const slope=(a:number,b:number)=>(value(b)-value(a))/(keys[b].frame-keys[a].frame);
 if(keys.length<2)return 0;
 if(index===0)return slope(0,1);
 if(index===keys.length-1)return slope(index-1,index);
 const a=slope(index-1,index),b=slope(index,index+1);
 if(a*b<=0)return 0;
 const before=keys[index].frame-keys[index-1].frame,after=keys[index+1].frame-keys[index].frame;
 const w1=2*after+before,w2=after+2*before;
 const harmonic=(w1+w2)/(w1/a+w2/b);
 return Math.sign(a)*Math.min(Math.abs(harmonic),2*Math.min(Math.abs(a),Math.abs(b)));
}
/** Quintic Hermite has shared endpoint velocity and zero shared acceleration. */
function quintic(a:number,b:number,va:number,vb:number,dt:number,u:number):number{
 const d=b-a,v0=va*dt,v1=vb*dt;
 const c3=10*d-6*v0-4*v1,c4=-15*d+8*v0+7*v1,c5=6*d-3*v0-3*v1;
 return a+v0*u+c3*u*u*u+c4*u*u*u*u+c5*u*u*u*u*u;
}
/** Precomputed immutable track; no prior-frame state, safe in parallel renders. */
export function createCameraSamplerV06(options:CameraOptionsV06={}){
 const keys=compileCameraKeysV06(options),scenes=sceneList(options),fps=Math.max(1,valid(options.fps??30,30));
 const velocities=keys.map((_,i)=>({position:[0,1,2].map(axis=>keyVelocity(keys,i,'position',axis)),target:[0,1,2].map(axis=>keyVelocity(keys,i,'target',axis)),fov:keyVelocity(keys,i,'fov')}));
 return (input:number):CameraSampleV06=>{
  const frame=clamp(valid(input,keys[0]?.frame??0),keys[0]?.frame??0,keys.at(-1)?.frame??0);
  let index=Math.max(0,keys.findIndex((k,i)=>i<keys.length-1&&frame<keys[i+1].frame));
  if(frame>=keys.at(-1)!.frame)index=Math.max(0,keys.length-2);
  const a=keys[index],b=keys[Math.min(index+1,keys.length-1)],dt=Math.max(1e-6,b.frame-a.frame),u=clamp((frame-a.frame)/dt);
  const value=(field:'position'|'target'|'fov',axis=0)=>quintic(field==='fov'?a.fov:a[field][axis],field==='fov'?b.fov:b[field][axis],field==='fov'?velocities[index].fov:velocities[index][field][axis],field==='fov'?velocities[Math.min(index+1,keys.length-1)].fov:velocities[Math.min(index+1,keys.length-1)][field][axis],dt,u);
  const p=cleanPose({position:[value('position',0),value('position',1),value('position',2)],target:[value('target',0),value('target',1),value('target',2)],fov:value('fov')});
  const position=new T.Vector3(...p.position),target=new T.Vector3(...p.target);
  // Matrix4.lookAt builds camera basis: local +Z is eye-target, so -Z faces target.
  const matrix=new T.Matrix4().lookAt(position,target,new T.Vector3(0,1,0));
  const quaternion=new T.Quaternion().setFromRotationMatrix(matrix).normalize();
  const scene=scenes.find(s=>frame>=s.start&&frame<s.end)??(frame<scenes[0].start?scenes[0]:scenes.at(-1)!);
  return {...p,frame,seconds:frame/fps,scene:scene.id,sceneProgress:clamp((frame-scene.start)/(scene.end-scene.start)),quaternion};
 };
}
const defaultSampler=createCameraSamplerV06();
export function sampleCameraV06(frame:number,options?:CameraOptionsV06):CameraSampleV06{return options?createCameraSamplerV06(options)(frame):defaultSampler(frame);}
export function applyCameraV06(camera:T.PerspectiveCamera,frame:number,options?:CameraOptionsV06):CameraSampleV06{
 const sample=sampleCameraV06(frame,options);
 camera.position.set(...sample.position);camera.quaternion.copy(sample.quaternion);camera.fov=sample.fov;
 camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
 return sample;
}
