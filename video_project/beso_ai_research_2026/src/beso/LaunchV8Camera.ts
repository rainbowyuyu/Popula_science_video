import {CameraKey,sampleCinematicCamera} from './CinematicMotion';

export type V8Phase='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
export const V8_CAMERA_SHOTS=[
 {start:0,end:11,phase:'hero',action:'Waterline close-up of a real outer column; crane past the brace root to the three-column assembly.'},
 {start:11,end:23,phase:'brief',action:'Slow lateral inspection, assembly in the right visual lane and concise evidence at left.'},
 {start:23,end:40,phase:'topology',action:'Travel to a separate saved BESO specimen; close orbit of four archived states, then return to the platform.'},
 {start:40,end:53,phase:'physics',action:'Move around the native platform; follow fairlead 1 below the visual surface and rise along its cable.'},
 {start:53,end:65,phase:'interaction',action:'Return around the same beam-root assembly; leave space for real logs and replanning.'},
 {start:65,end:79,phase:'toolchain',action:'Overhead view of physical connections, then descend to a brace and hub for engineer review.'},
 {start:79,end:95,phase:'proof',action:'Crane out to the complete machine in the right visual lane, with evidence at left.'},
 {start:95,end:105,phase:'close',action:'Shift the complete turbine right while the title enters left; slow aerial retreat and final hold.'},
] as const;
export const phaseV8At=(time:number):V8Phase=>V8_CAMERA_SHOTS[Math.max(0,V8_CAMERA_SHOTS.findLastIndex(shot=>time>=shot.start))].phase;

/** One metre-scale world; the camera moves to the explanation rather than
 * parking a miniature turbine permanently to the right of an empty panel. */
export const V8_CAMERA_KEYS:CameraKey[]=[
 {t:0,p:[-133,22,89],q:[-52,5,0]},
 {t:3,p:[-137,31,107],q:[-39,9,0]},
 {t:7,p:[-147,68,166],q:[-8,20,0]},
 {t:11,p:[-158,89,228],q:[0,25,0]},
 {t:15.6154,p:[-149,92,239],q:[0,25,0]},
 {t:20.2308,p:[-128,90,237],q:[0,25,0]},
 {t:23,p:[-211,86,233],q:[-108,26,28]},
 {t:25,p:[-314,73,220],q:[-220,28,60]},
 {t:27,p:[-290,71,240],q:[-220,28,60]},
 {t:30,p:[-256,67,240],q:[-220,28,60]},
 {t:34,p:[-236,64,244],q:[-220,28,60]},
 {t:37,p:[-208,62,244],q:[-220,28,60]},
 {t:40,p:[-100,57,190],q:[0,18,0]},
 {t:41.7333,p:[-50,47,140],q:[-15,14,0]},
 {t:43.4667,p:[-105,20,110],q:[-60,12,5]},
 {t:45.2,p:[-110,-3,84],q:[-50,-2,4]},
 {t:47.8,p:[-108,-11,83],q:[-44,-7,3]},
 {t:50.4,p:[-133,30,130],q:[-40,10,0]},
 {t:53,p:[-157,73,218],q:[0,23,0]},
 {t:57.2857,p:[-141,84,231],q:[0,23,0]},
 {t:61.5714,p:[-114,100,219],q:[0,21,0]},
 {t:65,p:[-65,149,211],q:[0,8,0]},
 {t:68.2308,p:[12,138,194],q:[0,8,0]},
 {t:72.5385,p:[50,96,178],q:[8,9,-8]},
 {t:75.7692,p:[47,78,165],q:[8,11,-8]},
 {t:79,p:[-22,98,183],q:[0,34,0]},
 {t:83.5714,p:[-154,160,310],q:[0,89,0]},
 {t:89.2857,p:[-274,213,457],q:[0,128,0]},
 {t:95,p:[-322,219,487],q:[0,130,0]},
 {t:98.3333,p:[-336,224,497],q:[0,132,0]},
 {t:101.6667,p:[-343,226,506],q:[0,132,0]},
 {t:105,p:[-350,228,515],q:[0,132,0]},
];
const lensKeys:CameraKey[]=V8_CAMERA_KEYS.map(key=>({t:key.t,p:[
 key.t<=3?43:key.t<=7?40:key.t<=15.7?39:key.t<=20.3?40:key.t<=34?42:key.t<=40?44:
 key.t<=41.8?43:key.t<=43.5?45:key.t<=45.3?44:key.t<=47.9?42:key.t<=50.5?44:key.t<=53?43:
 key.t<=61.6?42:key.t<=68.3?44:key.t<=72.6?42:key.t<=83.6?43:key.t<=95?40:43,0,0],q:[0,0,0]}));
export function sampleV8Camera(time:number){
 const pose=sampleCinematicCamera(V8_CAMERA_KEYS,time);
 // A single asymmetric film gate is shared by geometry and callout
 // projections. Shifting the gate, rather than the geometry, preserves the
 // native coordinate frame and keeps the focal object clear of left copy.
 return{...pose,fov:sampleCinematicCamera(lensKeys,time).position.x,phase:phaseV8At(time),viewOffsetX:-380};
}
