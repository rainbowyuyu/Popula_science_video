import fs from 'node:fs';
import * as T from 'three';
import {V16CameraRig} from '../../../src/v16/V16CameraRig';
import {CameraPath,towerCameraAnchors} from '../../../src/CameraPath';
import {openingCameraPose,applyOpeningCameraPose} from '../../../src/OpeningCamera';
import {stateAt,Timeline,V} from '../../../src/visual';
import timeline from '../../../src/timeline.json';
import manifest from '../../../public/models/shanghai-tower-manifest.json';
const tl=timeline as Timeline,path=new CameraPath(tl);
path.setAnchors(towerCameraAnchors(manifest));
const assert=(ok:boolean,msg:string)=>{if(!ok)throw new Error(msg);};
const report:any={status:'passed',scope:'Only newly added overview framing envelope, source frames 136–488.',aspects:{}};
for(const aspect of ['16:9','9:16'] as const){
 const camera=new T.PerspectiveCamera(34,16/9,.008,200),world:any={camera,path,physics:{displacementAt:()=>V()}},rig=new V16CameraRig(world,aspect);
 let photoError=0;
 for(const frame of [0,80,136]){
  const s=stateAt(frame,tl),legacy=new T.PerspectiveCamera(34,16/9,.008,200);
  applyOpeningCameraPose(legacy,openingCameraPose(s.time,path.at(s.time)));rig.apply(s);
  for(const point of [V(0,6.32,0),V(.25,2.3,.2),V(-.2,.25,-.1)]){
   const a=point.clone().project(legacy),b=point.clone().project(camera),ratio=(16/9)/(9/16);
   photoError=Math.max(photoError,Math.abs((aspect==='16:9'?a.x:ratio*a.x+.32*(1-ratio))-b.x),Math.abs(a.y-b.y));
  }
 }
 assert(photoError<1e-9,`photo registration changed ${aspect}: ${photoError}`);
 const joins=[];
 for(const frame of [136,294,418,488]){
  const h=.001,poses=[frame-2*h,frame-h,frame,frame+h,frame+2*h].map(f=>rig.pose(stateAt(f,tl)));
  const leftV=poses[2].position.clone().sub(poses[1].position).multiplyScalar(1/h),rightV=poses[3].position.clone().sub(poses[2].position).multiplyScalar(1/h);
  const leftA=poses[2].position.clone().addScaledVector(poses[1].position,-2).add(poses[0].position).multiplyScalar(1/(h*h));
  const rightA=poses[4].position.clone().addScaledVector(poses[3].position,-2).add(poses[2].position).multiplyScalar(1/(h*h));
  const velocityDifference=leftV.distanceTo(rightV),accelerationDifference=leftA.distanceTo(rightA);
  assert(velocityDifference<.0001,`velocity seam ${aspect} ${frame}: ${velocityDifference}`);
  assert(accelerationDifference<.0001,`acceleration seam ${aspect} ${frame}: ${accelerationDifference}`);
  joins.push({sourceFrame:frame,velocityDifference,accelerationDifference});
 }
 report.aspects[aspect]={photoRegistrationMaxNdcError:photoError,joins};
}
fs.writeFileSync('work/v16/camera/overview-seams-qa.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
