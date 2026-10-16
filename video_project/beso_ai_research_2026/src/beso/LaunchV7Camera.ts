import {CameraKey,sampleCinematicCamera} from './CinematicMotion';

export type V7Phase='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
export const V7_CAMERA_SHOTS=[
 {start:0,end:11,phase:'hero',action:'Waterline close-up of a real outer column; crane past the brace root to the three-column assembly.'},
 {start:11,end:23,phase:'brief',action:'Slow lateral inspection, assembly on the left for a large real interface on the right.'},
 {start:23,end:40,phase:'topology',action:'Travel to a separate saved BESO specimen; close orbit of four archived states, then return to the platform.'},
 {start:40,end:53,phase:'physics',action:'Move around the native platform; follow fairlead 1 below the visual surface and rise along its cable.'},
 {start:53,end:65,phase:'interaction',action:'Return around the same beam-root assembly; leave space for real logs and replanning.'},
 {start:65,end:79,phase:'toolchain',action:'Overhead view of physical connections, then descend to a brace and hub for engineer review.'},
 {start:79,end:95,phase:'proof',action:'Crane out to the complete machine, offset left so evidence and delivery sit on the right.'},
 {start:95,end:105,phase:'close',action:'Shift the complete turbine right while the title enters left; slow aerial retreat and final hold.'},
] as const;
export const phaseV7At=(time:number):V7Phase=>V7_CAMERA_SHOTS[Math.max(0,V7_CAMERA_SHOTS.findLastIndex(shot=>time>=shot.start))].phase;

/** One metre-scale world; the camera moves to the explanation rather than
 * parking a miniature turbine permanently to the right of an empty panel. */
export const V7_CAMERA_KEYS:CameraKey[]=[
 {t:0,p:[-120,12,80],q:[-54,3,3]},
 {t:3,p:[-116,18,65],q:[-38,7,0]},
 {t:7,p:[-104,42,97],q:[-8,13,2]},
 {t:11,p:[-124,67,164],q:[16,20,8]},
 {t:15.6154,p:[-110,76,174],q:[17,29,21]},
 {t:20.2308,p:[-89,75,159],q:[27,30,34]},
 {t:23,p:[-70,74,148],q:[35,28,37]},
 {t:25,p:[10,76,191],q:[111,28,57]},
 {t:27,p:[20,74,212],q:[109,27,63]},
 {t:30,p:[65,66,198],q:[107,28,62]},
 {t:34,p:[116,66,193],q:[101,28,58]},
 {t:37,p:[182,65,193],q:[93,22,44]},
 {t:40,p:[115,60,126],q:[11,18,4]},
 {t:41.7333,p:[26,54,131],q:[-27,15,5]},
 {t:43.4667,p:[-81,16,86],q:[-60,14,6]},
 {t:45.2,p:[-88,-3,67],q:[-39,-3,5]},
 {t:47.8,p:[-82,-11,63],q:[-30,-7,2]},
 {t:50.4,p:[-110,21,82],q:[-43,6,7]},
 {t:53,p:[-128,63,137],q:[-5,25,9]},
 {t:57.2857,p:[-101,80,166],q:[25,33,18]},
 {t:61.5714,p:[-58,95,177],q:[30,25,15]},
 {t:65,p:[-30,116,130],q:[24,16,-2]},
 {t:68.2308,p:[35,97,97],q:[30,17,-18]},
 {t:72.5385,p:[51,58,88],q:[34,14,-17]},
 {t:75.7692,p:[24,45,68],q:[28,12,-13]},
 {t:79,p:[-9,67,119],q:[-22,37,11]},
 {t:83.5714,p:[-142,152,288],q:[70,105,47]},
 {t:89.2857,p:[-272,205,404],q:[99,133,70]},
 {t:95,p:[-331,202,414],q:[98,133,69]},
 {t:98.3333,p:[-375,235,440],q:[-110,135,-90]},
 {t:101.6667,p:[-381,236,445],q:[-113,136,-94]},
 {t:105,p:[-387,237,449],q:[-115,137,-97]},
];
const lensKeys:CameraKey[]=V7_CAMERA_KEYS.map(key=>({t:key.t,p:[
 key.t<=3?43:key.t<=7?40:key.t<=15.7?39:key.t<=20.3?40:key.t<=34?42:key.t<=40?44:
 key.t<=41.8?43:key.t<=43.5?45:key.t<=45.3?44:key.t<=47.9?42:key.t<=50.5?44:key.t<=53?43:
 key.t<=61.6?42:key.t<=68.3?44:key.t<=72.6?42:key.t<=83.6?43:key.t<=95?40:43,0,0],q:[0,0,0]}));
export function sampleV7Camera(time:number){
 const pose=sampleCinematicCamera(V7_CAMERA_KEYS,time);
 return{...pose,fov:sampleCinematicCamera(lensKeys,time).position.x,phase:phaseV7At(time)};
}
