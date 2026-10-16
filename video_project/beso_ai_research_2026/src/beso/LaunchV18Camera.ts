import {CameraKey,sampleCinematicCamera} from './CinematicMotion';
export type V18Phase='hero'|'brief'|'topology'|'physics'|'interaction'|'toolchain'|'proof'|'close';
export const V18_PHASES=[{t:0,id:'hero'},{t:12,id:'brief'},{t:27,id:'topology'},{t:42,id:'physics'},{t:57,id:'interaction'},{t:72,id:'toolchain'},{t:88,id:'proof'},{t:98,id:'close'}] as const;
export const phaseV18At=(t:number):V18Phase=>V18_PHASES[Math.max(0,V18_PHASES.findLastIndex(k=>t>=k.t))].id;
// Metre-scale sea, then a tabletop at x=500. Full C1 route; no camera teleports.
export const V18_CAMERA_KEYS:CameraKey[]=[
 {t:0,p:[-82,16,23],q:[-56,1,3]},
 {t:2.8,p:[-83,14,38],q:[-44,8,0]},
 {t:6,p:[-125,55,100],q:[0,16,0]},
 {t:9.5,p:[-300.959,127,262.864],q:[0,145,0]},
 {t:12,p:[-230,105,220],q:[0,60,0]},
 {t:16,p:[-174,76,145],q:[0,19,0]},
 {t:21,p:[-158,72,122],q:[0,19,0]},
 {t:24,p:[-142,70,118],q:[0,19,0]},
 {t:27,p:[417,100,155],q:[500,12,0]},
 {t:30,p:[422,91,129],q:[500,13,0]},
 {t:35,p:[446,88,122],q:[500,13,0]},
 {t:39,p:[467,87,123],q:[500,13,0]},
 {t:42,p:[-110,33,67],q:[-45,5,0]},
 {t:46,p:[-89,18,38],q:[-51,2,0]},
 {t:50,p:[-83,17,28],q:[-54,1,2]},
 {t:54,p:[-110,25,78],q:[-38,8,0]},
 {t:57,p:[400,109,165],q:[500,8,0]},
 {t:62,p:[421,98,137],q:[500,12,0]},
 {t:65,p:[433,94,129],q:[500,12,0]},
 {t:68,p:[445,90,119],q:[500,12,0]},
 {t:72,p:[457,85,106],q:[500,13,0]},
 {t:76,p:[469,79,98],q:[500,14,0]},
 {t:80,p:[478,77,94],q:[500,14,0]},
 {t:85,p:[493,84,105],q:[500,14,0]},
 {t:88,p:[515,107,142],q:[500,12,0]},
 {t:93,p:[534,114,158],q:[500,16,0]},
 {t:96,p:[525,131,190],q:[500,22,0]},
 {t:98,p:[-302.669,124,287.543],q:[0,145,0]},
 {t:102,p:[-328.87,135,293.751],q:[0,143,0]},
 {t:105,p:[-349.031,143,304.023],q:[0,144,0]},
];
const lens:CameraKey[]=V18_CAMERA_KEYS.map(k=>({t:k.t,p:[k.t<3?49:k.t<7?46:k.t<27?43:k.t<42?42:k.t<57?48:k.t<98?43:42,0,0],q:[0,0,0]}));
const gate:CameraKey[]=V18_CAMERA_KEYS.map(k=>({t:k.t,p:[k.t<6?150:k.t<12?0:k.t<27?-170:k.t<42?230:k.t<57?-230:k.t<67?-440:k.t<72?-220:k.t<88?300:k.t<98?280:-180,0,0],q:[0,0,0]}));
export function sampleV18Camera(t:number){return {...sampleCinematicCamera(V18_CAMERA_KEYS,t),fov:sampleCinematicCamera(lens,t).position.x,viewOffsetX:sampleCinematicCamera(gate,t).position.x,phase:phaseV18At(t)};}
