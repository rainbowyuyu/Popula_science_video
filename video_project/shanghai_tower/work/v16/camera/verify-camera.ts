import fs from 'node:fs';
import * as T from 'three';
import {V16CameraRig} from '../../../src/v16/V16CameraRig';
import {CameraPath,towerCameraAnchors} from '../../../src/CameraPath';
import {openingCameraPose,applyOpeningCameraPose} from '../../../src/OpeningCamera';
import {stateAt,Timeline,V} from '../../../src/visual';
import timeline from '../../../src/timeline.json';
import manifest from '../../../public/models/shanghai-tower-manifest.json';
const tl=timeline as Timeline;
const path=new CameraPath(tl);path.setAnchors(towerCameraAnchors(manifest));
const assert=(ok:boolean,msg:string)=>{if(!ok)throw new Error(msg);};
const results:any={generatedAt:new Date().toISOString(),sourceTimeline:'src/timeline.json',sourceFrames:tl.duration,aspects:{}};
for(const aspect of ['16:9','9:16'] as const){
 const camera=new T.PerspectiveCamera(34,16/9,.008,200);
 const world:any={camera,path,physics:{displacementAt:()=>V()}};
 const rig=new V16CameraRig(world,aspect);
 let finite=0,maxPositionStep=0,maxTargetStep=0,maxFovStep=0,prev:any=null;
 const samples:any[]=[];
 for(let frame=0;frame<tl.duration;frame++){
  const s=stateAt(frame,tl),d=rig.diagnostics(s);
  assert(d.finite,`nonfinite ${aspect} ${frame}`);finite++;
  assert(camera.view===null||!camera.view.enabled,`viewoffset ${aspect} ${frame}`);
  assert(Math.abs(camera.aspect-(aspect==='16:9'?16/9:9/16))<1e-12,'aspect');
  assert(d.radius>.15&&d.radius<30,`radius ${aspect} ${frame} ${d.radius}`);
  if(prev){maxPositionStep=Math.max(maxPositionStep,new T.Vector3(...d.position).distanceTo(new T.Vector3(...prev.position)));maxTargetStep=Math.max(maxTargetStep,new T.Vector3(...d.target).distanceTo(new T.Vector3(...prev.target)));maxFovStep=Math.max(maxFovStep,Math.abs(d.fov-prev.fov));}
  if(frame%150===0||[80,136,230,488,900,1500,1785,1786].includes(frame))samples.push(d);
  prev=d;
 }
 let photoError=0;
 const projectionPoints=[V(0,6.32,0),V(.25,2.3,.2),V(-.2,.25,-.1)];
 for(const frame of [0,40,80,100,136]){
  const s=stateAt(frame,tl),legacy=new T.PerspectiveCamera(34,16/9,.008,200);
  applyOpeningCameraPose(legacy,openingCameraPose(s.time,path.at(s.time)));rig.apply(s);
  for(const point of projectionPoints){
   const a=point.clone().project(legacy),b=point.clone().project(camera);
   const ratio=(16/9)/(9/16),expectedX=aspect==='16:9'?a.x:ratio*a.x+.32*(1-ratio);
   photoError=Math.max(photoError,Math.abs(expectedX-b.x),Math.abs(a.y-b.y));
  }
 }
 assert(photoError<1e-9,`photo mismatch ${aspect} ${photoError}`);
 const snapshot=(frame:number)=>{rig.apply(stateAt(frame,tl));return [...camera.matrixWorld.elements,...camera.projectionMatrix.elements];};
 for(const frame of [0,500,912,1760,1800,2600,4562,7000,11215,15700]){
  const a=snapshot(frame);snapshot((frame*3+311)%tl.duration);const b=snapshot(frame);
  assert(a.every((value,i)=>Math.abs(value-b[i])<1e-12),`seek nondeterminism ${frame}`);
 }
 // A structural translation must transfer 1:1 to the camera at the TMD hold.
 const t=path.timeAt(36.5),s=stateAt(t*tl.fps,tl),plain=rig.pose(s);
 const displacement=V(.031,-.006,.018);world.physics.displacementAt=()=>displacement.clone();
 const followed=rig.pose(s);
 assert(followed.position.clone().sub(plain.position).distanceTo(displacement)<1e-10,'TMD camera follow');
 assert(followed.target.clone().sub(plain.target).distanceTo(displacement)<1e-10,'TMD target follow');
 results.aspects[aspect]={finite,photoRegistrationMaxNdcError:photoError,randomSeek:'passed',tmdFollow:'passed',maxSourceFramePositionStep:maxPositionStep,maxSourceFrameTargetStep:maxTargetStep,maxSourceFrameFovStep:maxFovStep,samples};
}
results.status='passed';
fs.writeFileSync('work/v16/camera/qa.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({status:results.status,aspects:Object.fromEntries(Object.entries(results.aspects).map(([k,v]:any)=>[k,{...v,samples:v.samples.length}]))},null,2));
