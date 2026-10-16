import {CameraKey,sampleCinematicCamera} from './CinematicMotion';

/** A single, absolute-time crane/orbit. Semantic chapters never reset it.
 * The turbine and waterline stay at the origin throughout the film. */
export const V5_CAMERA_KEYS:CameraKey[]=[
 {t:0,p:[600,175,520],q:[-70,115,70]},
 {t:4.5,p:[460,135,445],q:[-78,115,35]},
 {t:10,p:[225,84,335],q:[-66,38,0]},
 {t:17,p:[192,68,269],q:[-58,22,0]},
 {t:23,p:[151,71,262],q:[-50,24,48]},
 {t:28,p:[115,63,256],q:[-47,25,55]},
 {t:33,p:[69,63,239],q:[-49,16,25]},
 {t:38,p:[-28,54,218],q:[-42,12,0]},
 {t:42.5,p:[-88,35,153],q:[-58,9,4]},
 {t:46.5,p:[-117,10,116],q:[-79,0,4]},
 {t:50,p:[-153,32,159],q:[-63,10,0]},
 {t:56,p:[-186,67,259],q:[-18,28,0]},
 {t:62,p:[-226,83,297],q:[-13,31,0]},
 {t:69,p:[-270,104,349],q:[-10,39,0]},
 {t:76,p:[-281,122,439],q:[-22,58,0]},
 {t:84,p:[-460,165,525],q:[-75,131,-45]},
 {t:91,p:[-550,180,455],q:[-78,128,-70]},
 {t:97,p:[-610,185,405],q:[-76,126,-95]},
 {t:103,p:[-646,188,365],q:[-72,126,-108]},
 {t:105,p:[-650,188,360],q:[-70,125,-110]},
];
export const sampleV5Camera=(time:number)=>sampleCinematicCamera(V5_CAMERA_KEYS,time);
