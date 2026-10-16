import {CameraKey,sampleCinematicCamera} from './CinematicMotion';

export type V16Phase='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
export const V16_CAMERA_SHOTS=[
 {start:0,end:11,phase:'hero',action:'Complete turbine at sea; crane toward the native three-column assembly and settle at its brace roots.'},
 {start:11,end:23,phase:'brief',action:'Slow lateral inspection, assembly in the right visual lane and concise evidence at left.'},
 {start:23,end:40,phase:'topology',action:'Travel to a separate saved BESO specimen; close orbit of four archived states, then return to the platform.'},
 {start:40,end:53,phase:'physics',action:'Orbit around the west side; descend below the visual surface with fairlead 1 and the selected cable at screen right; continue the orbit while rising.'},
 {start:53,end:65,phase:'interaction',action:'Return around the same beam-root assembly; leave space for real logs and replanning.'},
 {start:65,end:79,phase:'toolchain',action:'Overhead view of physical connections, then descend to a brace and hub for engineer review.'},
 {start:79,end:95,phase:'proof',action:'Crane out to the complete machine in the right visual lane, with evidence at left.'},
 {start:95,end:105,phase:'close',action:'Shift the complete turbine right while the title enters left; slow aerial retreat and final hold.'},
] as const;
export const phaseV16At=(time:number):V16Phase=>V16_CAMERA_SHOTS[Math.max(0,V16_CAMERA_SHOTS.findLastIndex(shot=>time>=shot.start))].phase;

/** One metre-scale world; the camera moves to the explanation rather than
 * parking a miniature turbine permanently to the right of an empty panel. */
export const V16_CAMERA_KEYS:CameraKey[]=[
 {t:0,p:[-270,91,430],q:[0,129,0]},
 {t:4,p:[-244,105,400],q:[0,124,0]},
 {t:8,p:[-173,94,278],q:[0,67,0]},
 {t:11,p:[-136,74,212],q:[0,22,0]},
 {t:16,p:[-123,72,221],q:[0,22,0]},
 {t:20,p:[-99,71,230],q:[0,22,0]},
 {t:23,p:[-182,80,240],q:[-86,29,30]},
 {t:26,p:[-285,75,248],q:[-220,28,60]},
 {t:30,p:[-265,73,246],q:[-220,28,60]},
 {t:34,p:[-239,71,241],q:[-220,28,60]},
 {t:37,p:[-205,67,234],q:[-220,28,60]},
 {t:40,p:[-113,57,197],q:[-9,19,0]},
 {t:42,p:[-125,40,145],q:[-20,12,0]},
 {t:44,p:[-173,13,12],q:[-15,3,0]},
 {t:46,p:[-180,-10,-65],q:[-15,-4,0]},
 {t:48,p:[-168,-14,-86],q:[-15,-4,0]},
 {t:50,p:[-115,12,-157],q:[-10,5,0]},
 {t:53,p:[-25,71,-220],q:[0,23,0]},
 {t:57,p:[70,83,-215],q:[0,22,0]},
 {t:61,p:[140,96,-155],q:[0,22,0]},
 {t:65,p:[170,128,-70],q:[0,12,0]},
 {t:69,p:[125,125,85],q:[0,10,0]},
 {t:73,p:[37,91,170],q:[5,10,-4]},
 {t:76,p:[34,80,177],q:[5,14,-4]},
 {t:79,p:[-18,101,200],q:[0,40,0]},
 {t:84,p:[-138,148,302],q:[0,94,0]},
 {t:89,p:[-234,184,397],q:[0,124,0]},
 {t:95,p:[-275,189,437],q:[0,131,0]},
 {t:100,p:[-294,193,444],q:[0,132,0]},
 {t:105,p:[-309,198,451],q:[0,132,0]},
];
const lensKeys:CameraKey[]=V16_CAMERA_KEYS.map(key=>({t:key.t,p:[key.t<8?43:key.t<23?42:key.t<40?43:key.t<53?45:key.t<79?43:42,0,0],q:[0,0,0]}));
const gateKeys:CameraKey[]=V16_CAMERA_KEYS.map(key=>({t:key.t,p:[key.t<8?-240:key.t<23?-325:key.t<40?-315:key.t<53?-260:key.t<79?-330:-295,0,0],q:[0,0,0]}));
export function sampleV16Camera(time:number){
 const pose=sampleCinematicCamera(V16_CAMERA_KEYS,time);
 return {...pose,fov:sampleCinematicCamera(lensKeys,time).position.x,phase:phaseV16At(time),viewOffsetX:sampleCinematicCamera(gateKeys,time).position.x};
}
