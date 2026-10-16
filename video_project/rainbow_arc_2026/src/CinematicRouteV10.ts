import {timeline,ease} from './Timeline';
import {CameraKeyV06,CameraPoseV06,createCameraSamplerV06} from './CameraPathV06';

const p=(position:[number,number,number],target:[number,number,number],fov=45):CameraPoseV06=>({position,target,fov});
const hero:[number,number,number]=[0,4,0];

/** V13: an observer-height landscape rail and a continuous optical track in
 * the SAME world. A wide view is reserved for the complete optical geometry,
 * rather than exposing the whole terrace in every shot. */
export const posesV10:Record<string,{start:CameraPoseV06;end:CameraPoseV06}>={
 street:{start:p([4.2,2.4,13.4],[0,3.25,-2],47),end:p([1.15,4.85,7.8],[0,4.08,0],42)},
 drop:{start:p([1.15,4.85,7.8],[0,4.08,0],42),end:p([.30,4.65,6.8],[.05,4.10,0],42)},
 dispersion:{start:p([.30,4.65,6.8],[.05,4.10,0],42),end:p([-.40,4.65,5.9],[.20,4.00,0],43)},
 reflection:{start:p([-.40,4.65,5.9],[.20,4.00,0],43),end:p([-1.1,4.9,9.5],[-.2,3.5,0],44)},
 angle:{start:p([-1.1,4.9,9.5],[-.2,3.5,0],44),end:p([11.2,5.4,19.0],[0,3.4,-1.5],46)},
 cone:{start:p([11.2,5.4,19.0],[0,3.4,-1.5],46),end:p([-6.8,5.3,23.0],[0,4.8,-6],49)},
 circle:{start:p([-6.8,5.3,23.0],[0,4.8,-6],49),end:p([5.0,4.0,18.5],[.3,2.7,-1],47)},
 observer:{start:p([5.0,4.0,18.5],[.3,2.7,-1],47),end:p([6.8,4.8,20.8],[1.1,4.2,-4],47)},
 secondary:{start:p([6.2,5.0,21.0],[0,5.3,-6],48),end:p([-3.0,5.4,22.8],[0,6.3,-8],48)},
 return:{start:p([-6.7,3.35,10.4],[-3,1.6,3],46),end:p([-4.5,2.7,9.6],[-2.8,1.7,3],45)},
 references:{start:p([-4.5,2.7,9.6],[-2.8,1.7,3],45),end:p([-4.2,2.68,9.45],[-2.8,1.7,3],45)},
};

export function buildFilmCameraKeys(){
 const keys:CameraKeyV06[]=[];
 const clip=(id:string)=>{const value=timeline.clips.find(c=>c.id===id);if(!value)throw new Error('V13 camera cue absent: '+id);return value;};
 const scene=(id:string)=>{const value=timeline.scenes.find(s=>s.id===id);if(!value)throw new Error('V13 camera scene absent: '+id);return value;};
 const key=(frame:number,pose:CameraPoseV06)=>keys.push({...pose,frame:Math.round(frame)});

 // Low shoulder-height drift: the guide and wet ground establish scale before
 // its attention carries the camera to the rain. Avoid a backside character orbit.
 key(0,posesV10.street.start);
 key(clip('r001').end,p([3.5,2.5,12.5],[0,2.8,-2.5],47));
 key(clip('r002').end,p([4.3,3.2,14.8],[0,3.4,-2],48));
 key(clip('r003').end-20,p([3.8,3.65,13.4],[0,3.2,-1.8],48));
 key(scene('drop').start,posesV10.drop.start);

 // Establish the whole sphere; the Qwen sphere uses this same camera sampler.
 // Then dolly towards the interface, keeping FOV a lens choice instead of a zoom.
 key(clip('r005').end,p([.85,4.73,7.2],[0,4.08,0],41));
 key(clip('r006').end-36,p([.55,4.65,6.8],[.20,4.10,0],42));
 const cup=clip('r007');
 key(cup.start+100,p([4.45,5.0,7.3],[4.3,4.3,0],43));
 key(cup.end-60,p([4.60,5.15,7.1],[4.32,4.2,0],43));
 key(clip('r008').end,posesV10.drop.end);

 // Follow the actual refracted segment with a legible spherical edge.
 // Its optical angle is never enlarged or modified for the close-up.
 key(clip('r009').end-24,p([.60,4.75,6.0],[.25,4.4,0],42));
 key(clip('r010').end-24,p([.70,4.82,3.85],[.50,4.65,0],40));
 key(clip('r042').start+44,p([.55,4.70,3.50],[.48,4.62,0],40));
 key(clip('r042').end-30,p([.40,4.58,3.40],[.50,4.45,0],40));
 key(clip('r011').end-30,p([.05,4.53,3.65],[.35,4.45,0],40));
 key(clip('r012').end-24,p([-.22,4.55,4.05],[.15,4.37,.2],40));
 key(clip('r043').start+52,p([-.42,4.56,4.1],[.10,4.35,.30],40));
 key(clip('r043').end-24,posesV10.dispersion.end);

 // Read reflection at a medium size, then reveal its complete returning path
 // in one pullback. Every move retains the previous illuminated vertex.
 key(clip('r013').end-42,p([.90,4.60,6.9],[.40,3.9,0],45));
 key(clip('r014').end-42,p([-.70,4.55,8.3],[-.25,3.25,0],46));
 key(clip('r015').end-25,p([-1.60,4.90,8.1],[-.20,3.5,0],44));
 key(clip('r044').end-16,posesV10.reflection.end);

 // Hold the conclusion before revealing the observer. Remove V12's immediate
 // eye close-up/reverse pullback: one long rail carries the light into the cone.
 key(clip('r017').end-20,p([-.70,5.0,9.8],[0,3.45,0],44));
 key(clip('r018').end-40,p([-.15,4.9,10.0],[0,3.42,0],44));
 key(5140,p([5.2,4.2,15.8],[0,2.35,2.5],46));
 key(clip('r019').end-28,p([5.6,4.2,16.4],[0,2.5,3.0],46));
 key(clip('r020').end-25,posesV10.angle.end);

 // Read the cone from three-quarter angles before the frontal circle reveal.
 key(clip('r021').end-15,p([12.8,6.4,21.2],[0,4.4,-3.2],46));
 key(clip('r022').end-25,p([7.3,5.9,24.0],[0,4.4,-4],46));
 key(clip('r023').end-25,p([-.50,5.5,24.0],[0,4.0,-3.2],47));
 key(clip('r024').end-25,posesV10.cone.end);

 // Low view makes ground occlusion visible. This intentional aerial rise is
 // the only rapid large scale change, and follows the world's actual lift.
 key(clip('r025').end-20,p([-4.3,3.55,20.8],[0,4.4,-7],48));
 const rise=clip('r027'),hold=clip('r028');
 key(rise.start-20,p([-1.5,5.1,24.0],[0,4.2,-7],48));
 key(rise.start+Math.min(rise.duration,160),p([.2,24.2,25.8],[0,16.2,-7],50));
 key(hold.end-120,p([2.3,24.5,25.7],[0,16.5,-7],50));
 // Track attention down ahead of the descending camera so the observer never
 // drops behind the caption zone as the world's full-circle lift settles.
 key(scene('circle').end+55,p([4.7,10.5,20.2],[.1,2.2,-1],49));
 // Give the descent nine seconds. The guide begins its lateral demonstration
 // while the camera is still descending, retaining an unbroken scale anchor.
 key(scene('circle').end+145,posesV10.circle.end);

 // Sideways motion stays at a natural guide height, rather than a plan view.
 key(clip('r030').end-24,p([7.9,3.65,18.0],[1.7,2.6,3],47));
 key(clip('r031').start+clip('r031').duration*.52,p([6.1,3.9,17.8],[1.6,2.9,-.5],46));
 key(clip('r032').end-25,posesV10.observer.end);

 // Establish the secondary bow before returning to the SAME sphere.
 key(clip('r033').start+35,posesV10.secondary.start);
 key(clip('r034').start+100,p([1.8,5.0,8.0],hero,46));
 key(clip('r034').end-22,p([-.10,4.8,7.8],hero,45));
 key(clip('r035').end-37,p([.80,5.2,20.8],[0,5.4,-7],49));
 key(clip('r036').end-22,p([3.0,5.4,22.0],[0,6.0,-8],48));
 key(clip('r037').end-90,posesV10.secondary.end);

 // Arrive at the experiment BEFORE the Qwen veil. Basin and observer coexist
 // at a three-quarter distance, rather than a giant character close-up.
 key(clip('r039').start-40,p([-6.15,3.05,9.9],[-3,1.55,3],45));
 key(clip('r039').end-50,p([-5.4,2.75,9.5],[-2.8,1.65,3],45));
 key(scene('references').start,posesV10.return.end);
 key(timeline.duration-1,posesV10.references.end);
 // Keep the finite white input below the fixed brand when the water interface
 // fills the frame. The same ray vertices and lens remain; a small C2 attention
 // rise gives the incoming beam breathing room above the spectral close-up.
 return keys.map(k=>({...k,target:[k.target[0],k.target[1]+.18*ease((k.frame-2140)/160)*(1-ease((k.frame-3420)/180)),k.target[2]] as [number,number,number]}));
}

export const filmCameraKeys=buildFilmCameraKeys();
export const sampleFilmCamera=createCameraSamplerV06({fps:30,scenes:timeline.scenes,keyframes:filmCameraKeys});

