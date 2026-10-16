import fs from 'node:fs';
import crypto from 'node:crypto';
import * as T from 'three';
import {V16CameraRig} from '../../../src/v16/V16CameraRig';
import {sourceStateAt,sourceFrameAt,transitionAt,editTimeline,monotoneSourceBridge} from '../../../src/v16/timeline';
import {CameraPath,towerCameraAnchors} from '../../../src/CameraPath';
import {Timeline,V} from '../../../src/visual';
import original from '../../../src/timeline.json';
import manifest from '../../../public/models/shanghai-tower-manifest.json';
const assert=(ok:boolean,msg:string)=>{if(!ok)throw new Error(msg);};
const path=new CameraPath(original as Timeline);path.setAnchors(towerCameraAnchors(manifest));
const modelTop=Math.max(...manifest.parts.map(p=>p.bboxThree[1][1]))*.01;
const results:any={generatedAt:new Date().toISOString(),source:'original V14 cue axis',rigSHA256:crypto.createHash('sha256').update(fs.readFileSync('src/v16/V16CameraRig.ts')).digest('hex'),modelTop,aspects:{}};
// Covers the exact mathematical bug: unit endpoint velocity plus too long a
// quintic observation previously introduced negative source-time velocity.
for(const gap of [1,5,15,30,60,120,500])for(const distance of [0,1,4,15,60,120,900]){
 let previous=-Infinity;
 for(let f=0;f<=gap;f+=.25){const value=monotoneSourceBridge(50,50+distance,f,gap);assert(value>=previous-1e-9,`bridge reverse d${distance} g${gap}`);assert(value<=50+distance+1e-9,`bridge overshoot d${distance} g${gap}`);previous=value;}
}
for(const aspect of ['16:9','9:16'] as const){
 const tl=editTimeline(aspect),camera=new T.PerspectiveCamera(34,16/9,.008,200);
 const world:any={camera,path,physics:{displacementAt:()=>V()}},rig=new V16CameraRig(world,aspect);
 let previous=-Infinity,visibleMaxDelta=0,finite=0;const joins:any[]=[];
 for(let frame=0;frame<tl.duration;frame++){
  const source=sourceFrameAt(frame,aspect),transition=transitionAt(frame,aspect);
  assert(source>=previous-1e-8,`edit reverse ${aspect} ${frame} ${previous}->${source}`);
  const pose=rig.apply(sourceStateAt(frame,aspect),transition),point=pose.target.clone().project(camera);
  assert([...camera.matrixWorld.elements,...camera.projectionMatrix.elements].every(Number.isFinite),`camera invalid ${aspect} ${frame}`);finite++;
  const delta=source-previous;
  if(previous>-Infinity&&delta>30){
   assert(transition?.mode==='sky-whip',`unmasked source jump ${aspect} ${frame}: ${delta}`);
   const forward=pose.target.clone().sub(pose.position).normalize(),expected=V(.28,.91,-.30).normalize();
   assert(pose.position.distanceTo(V(0,32,0))<1e-10,`hidden cut position differs ${aspect} ${frame}`);
   assert(forward.distanceTo(expected)<1e-10,`hidden cut direction differs ${aspect} ${frame}`);
   assert(Math.abs(pose.fov-38)<1e-10&&Math.abs(pose.projectionX)+Math.abs(pose.projectionY)+Math.abs(pose.roll)<1e-10,'hidden cut lens differs');
   const rays=[[-1,-1],[-1,1],[1,-1],[1,1]].map(([x,y])=>V(x,y,.5).unproject(camera).sub(pose.position).normalize());
   const minRayY=Math.min(...rays.map(v=>v.y));
   assert(minRayY>0,`hidden cut sees below skyline ${aspect} ${frame}`);
   assert(pose.position.y>modelTop+20,`insufficient vertical clearance over lifted upper groups ${aspect} ${frame}`);
   const subject=rig.pose(sourceStateAt(frame,aspect)).target,frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
   assert(!frustum.containsPoint(subject),'original teaching focus visible at hidden cut');
   assert(transition.labelOpacity===0,'labels visible at hidden cut');
   joins.push({frame,sourceBefore:previous,sourceAfter:source,sourceDelta:delta,targetNdcX:point.x,position:pose.position.toArray(),forward:forward.toArray(),fov:pose.fov,minCornerRayY:minRayY,aboveRestModelBy:pose.position.y-modelTop,teachingFocusOutsideFrustum:true,transition});
  }else if(previous>-Infinity)visibleMaxDelta=Math.max(visibleMaxDelta,delta);
  previous=source;
 }
 results.aspects[aspect]={frames:finite,monotoneSource:'passed',finiteProjection:'passed',largestVisibleSourceStep:visibleMaxDelta,joins};
}
results.status='passed-with-intentional-hidden-cuts';
assert(results.aspects['16:9'].joins.length===9&&results.aspects['9:16'].joins.length===8,'Hidden-cut inventory changed');
results.scope='Numerical source mapping, finite projection, shared physical sky pose and upward view-frustum rays at each editorial source switch. Manifest clearance is against the rest model and is not a dynamic mesh occlusion proof; rendered quarter/mid frames are reviewed separately. Sky-whip joins are explicitly not global C2 camera curves.';
fs.writeFileSync('work/v16/camera/edit-qa.json',JSON.stringify(results,null,2));
console.log(JSON.stringify({status:results.status,aspects:Object.fromEntries(Object.entries(results.aspects).map(([k,v]:any)=>[k,{...v,joins:v.joins.length}]))},null,2));
