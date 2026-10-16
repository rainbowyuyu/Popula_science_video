import * as T from 'three';
import {flowingCurve} from './CameraPath';
import {V,ramp,mix} from './visual';

/** Render-only opening override. Source camera and all legacy anchors resume
 * unchanged at frame 1786; no geometry or analysis coordinates are replaced. */
export type OpeningCameraPose={position:T.Vector3;target:T.Vector3;shift:number;roll:number;fov?:number};
export const OPENING_CAMERA_END_FRAME=1786;
export const OPENING_PHOTO_REVEAL={start:80,end:136} as const;
/** Measured from the exported Z04 geometry: one complete slab lies at
 * 2.29744..2.30084 and its beams at 2.29224..2.29764. The next beam starts
 * at 2.33967, outside this story. Upper truss chord ends at 2.398694. */
export const OPENING_FLOOR={minY:2.291,maxY:2.339,slabY:2.29914,centerY:2.315,strengthMaxY:2.400} as const;
type Key={f:number;x:number;y:number;z:number;r:number;az:number;el:number;shift:number;roll:number};
const key=(f:number,x:number,y:number,z:number,r:number,az:number,el:number,shift=0,roll=0):Key=>({f,x,y,z,r,az,el,shift,roll});
const keys:Key[]=[
 // Registered photographic handoff. Hold the low ground-level pose until
 // the photo has cleared; only then crane back to the complete tower.
 // The crown is near (1265,94) in the 1920x1080 establishing photograph.
 key(0,0,2.0917255702,0,2.4890969682,3.0148629656,-.98691430925,-352.18423129,-.09257263727),
 key(80,0,2.0917255702,0,2.4890969682,3.0148629656,-.98691430925,-352.18423129,-.09257263727),
 key(136,0,2.0917255702,0,2.4890969682,3.0148629656,-.98691430925,-352.18423129,-.09257263727),
 key(230,0,3.10,0,12.5,1.48,.21,-120),
 key(250,0,3.10,0,12.5,1.48,.21,-120),
 key(294,0,3.12,0,12.2,1.46,.23,-70),
 key(356,0,3.16,0,11.8,1.44,.25,-30),
 key(415,0,3.19,0,10.9,1.49,.28),
 key(488,-.03,2.315,.02,1.64,2.40,.65),
 key(550,-.24,2.319,.12,1.35,2.48,.54),
 key(612,-.17,2.315,.10,1.43,2.60,.61),
 key(654,0,2.348,.06,1.48,2.75,.87),
 key(703,0,2.34,.02,1.42,2.90,.86),
 key(754,0,2.289,0,1.33,3.04,.81),
 // A story-height column needs a genuine close push, not a tower-wide lens.
 key(804,-.40,2.317,.05,.40,3.13,.49),
 key(860,-.42,2.322,.05,.28,3.28,.37),
 // Open only the real two-story strengthening frame and show its web broadside.
 key(930,-.055,2.354,-.29,.93,3.50,.30),
 key(1015,-.055,2.354,-.36,.76,3.61,.25),
 key(1115,-.055,2.354,-.36,.74,3.80,.28),
 key(1190,-.08,2.348,-.29,.85,3.81,.36),
 key(1258,-.17,2.350,-.31,.78,3.60,.40),
 key(1325,-.08,2.352,-.34,.70,3.36,.48),
 key(1390,-.045,2.333,-.36,.45,3.12,.51),
 key(1468,0,2.319,0,1.12,2.88,.75),
 key(1538,0,2.319,0,1.00,2.58,.88),
 key(1600,0,2.315,0,1.24,2.20,.83),
 // Once the last core pieces are explained, pull away far enough for the
 // restored complete tower to read as one object before the foundation cut.
 key(1660,0,2.86,0,5.20,1.75,.42),
 key(1692,0,3.12,0,10.9,1.62,.22),
 key(1738,0,3.12,0,11.2,1.78,.22),
 key(1786,0,-.18,0,8.0,1.42,.20,-190),
];
const times=keys.map(k=>k.f/30);
const columns=['x','y','z','az','el','shift','roll'] as const;
const curves=Object.fromEntries(columns.map(c=>[c,flowingCurve(times,keys.map(k=>k[c]))])) as Record<(typeof columns)[number],(t:number)=>number>;
const logRadius=flowingCurve(times,keys.map(k=>Math.log(k.r)));
function rawOpeningCameraPose(timeSeconds:number):OpeningCameraPose{
 const target=V(curves.x(timeSeconds),curves.y(timeSeconds),curves.z(timeSeconds));
 const r=Math.exp(logRadius(timeSeconds)),az=curves.az(timeSeconds),el=curves.el(timeSeconds);
 // The establishing photograph uses a wider lens than the subsequent model
 // tour. Keep its calibrated perspective through the entire plate reveal.
 const fov=mix(55,34,ramp(136,230,timeSeconds*30));
 return {position:target.clone().add(V(Math.cos(az)*Math.cos(el)*r,Math.sin(el)*r,Math.sin(az)*Math.cos(el)*r)),target,shift:curves.shift(timeSeconds),roll:curves.roll(timeSeconds),fov};
}
/** Follow the same crown during the post-reveal crane. Interpolating orbit
 * radius and elevation alone sends the roof out of the upper frame midway.
 * Solve a vertical translation of the actual camera/target pair so that its
 * projected crown follows a C2 screen-space track between the two end poses. */
const registrationCamera=new T.PerspectiveCamera(34,1920/1080,.008,200);
const crown=V(0,6.32,0);
function crownScreenY(pose:OpeningCameraPose){
 applyOpeningCameraPose(registrationCamera,pose);
 return (1-crown.clone().project(registrationCamera).y)*540;
}
const craneCrownStart=crownScreenY(rawOpeningCameraPose(136/30));
const craneCrownEnd=crownScreenY(rawOpeningCameraPose(230/30));
export function authoredOpeningCameraPose(timeSeconds:number):OpeningCameraPose{
 const pose=rawOpeningCameraPose(timeSeconds),frame=timeSeconds*30;
 if(frame<=136||frame>=230)return pose;
 const screenY=mix(craneCrownStart,craneCrownEnd,ramp(136,230,frame));
 applyOpeningCameraPose(registrationCamera,pose);
 const up=V().setFromMatrixColumn(registrationCamera.matrixWorld,1);
 const back=V().setFromMatrixColumn(registrationCamera.matrixWorld,2);
 const q=(1-screenY/540)*Math.tan((pose.fov??34)*Math.PI/360),delta=crown.clone().sub(pose.position);
 const lift=(up.dot(delta)+q*back.dot(delta))/(up.y+q*back.y);
 pose.target.y+=lift;pose.position.y+=lift;
 return pose;
}
export function openingCameraPose(timeSeconds:number,baseline:OpeningCameraPose):OpeningCameraPose{
 if(timeSeconds>=OPENING_CAMERA_END_FRAME/30)return baseline;
 const authored=authoredOpeningCameraPose(timeSeconds),back=ramp(1692/30,OPENING_CAMERA_END_FRAME/30,timeSeconds);
 return back===0?authored:{position:authored.position.lerp(baseline.position,back),target:authored.target.lerp(baseline.target,back),shift:mix(authored.shift,baseline.shift,back),roll:mix(authored.roll,baseline.roll,back)};
}
export function applyOpeningCameraPose(camera:T.PerspectiveCamera,pose:OpeningCameraPose){
 camera.fov=pose.fov??34;
 camera.position.copy(pose.position);camera.lookAt(pose.target);camera.rotateZ(pose.roll);
 camera.setViewOffset(1920,1080,pose.shift,0,1920,1080);
 camera.updateProjectionMatrix();camera.updateMatrixWorld();
}
export type OpeningStudyKey='outerglass'|'floors'|'floorbeams'|'columnBridge'|'outrigger'|'belt'|'megacolumn'|'core';
/** Local study centre retained as an API for diagnostic tools. Each original
 * assembly remains next to its source slot, at its original physical scale. */
export function openingStudyTarget(key:OpeningStudyKey):T.Vector3{
 const targets:Record<OpeningStudyKey,[number,number,number]>={
  outerglass:[-.39,2.333,.20],floors:[0,2.41414,.065],floorbeams:[0,2.23994,0],
  columnBridge:[-.4238,2.335,.05],outrigger:[-.05,2.359,-.374],belt:[-.20065,2.357,-.33554],
  megacolumn:[0,2.323,-.374],core:[0,2.347,0],
 };
 return V(...targets[key]);
}
