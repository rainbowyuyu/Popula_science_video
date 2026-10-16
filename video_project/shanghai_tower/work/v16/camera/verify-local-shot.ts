import fs from 'node:fs';
import * as T from 'three';
import {V16CameraRig} from '../../../src/v16/V16CameraRig';
import {sourceStateAt,originalTimeline} from '../../../src/v16/timeline';
import {CameraPath,towerCameraAnchors} from '../../../src/CameraPath';
import {openingCameraPose,applyOpeningCameraPose} from '../../../src/OpeningCamera';
import {V,stateAt} from '../../../src/visual';
import manifest from '../../../public/models/shanghai-tower-manifest.json';
const path=new CameraPath(originalTimeline);path.setAnchors(towerCameraAnchors(manifest));
const camera=new T.PerspectiveCamera(34,16/9,.008,200),world:any={camera,path,physics:{displacementAt:()=>V()}},rig=new V16CameraRig(world,'16:9');
const rows:any[]=[];
for(const frame of [2070,2100,2160,2250,2390,3210,8300,8610,9000]){
 const s=sourceStateAt(frame,'16:9'),pose=rig.apply(s);
 const c=V(.1248,-.62,.3432),right=V().setFromMatrixColumn(camera.matrixWorld,0),a=c.clone().addScaledVector(right,-.005).project(camera),b=c.clone().addScaledVector(right,.005).project(camera);
 const pixelWidth=Math.abs(b.x-a.x)*960;
 const old=new T.PerspectiveCamera(34,16/9,.008,200);applyOpeningCameraPose(old,openingCameraPose(s.time,path.at(s.time)));
 const oldRight=V().setFromMatrixColumn(old.matrixWorld,0),oa=c.clone().addScaledVector(oldRight,-.005).project(old),ob=c.clone().addScaledVector(oldRight,.005).project(old);
 rows.push({mediaFrame:frame,sourceFrame:s.frame,cue:s.n+s.u,focus:pose.focus,target:pose.target.toArray(),radius:pose.position.distanceTo(pose.target),projectionErrorPixels:rig.lastProjectionDiagnostic.axisErrorPx,pileWidthPixels:pixelWidth,baselinePileWidthPixels:Math.abs(ob.x-oa.x)*960});
}
const joins=[];
for(const cue of [5.88,6.20,6.58,6.92]){
 const frame=path.timeAt(cue)*30,h=.001;
 const poses=[frame-h,frame,frame+h].map(f=>rig.pose(stateAt(f,originalTimeline)));
 const left=poses[1].position.clone().sub(poses[0].position).multiplyScalar(1/h),right=poses[2].position.clone().sub(poses[1].position).multiplyScalar(1/h);
 const error=left.distanceTo(right);if(error>.0001)throw new Error('Local camera velocity seam '+cue+': '+error);
 joins.push({cue,sourceFrame:frame,velocityDifferenceAcrossKnot:error});
}
const pile=rows.find(r=>r.mediaFrame===2160);if(!(pile.pileWidthPixels>20))throw new Error('Pile remains too small');
const out={status:'passed',rows,joins,scope:'Only newly changed local shaft camera and TMD/core sample poses; structural visibility must be accepted from fresh rendered frames.'};
fs.writeFileSync('work/v16/camera/local-shot-qa.json',JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));
