import {timeline} from './Timeline';
import {CameraKeyV06,CameraPoseV06,createCameraSamplerV06} from './CameraPathV06';

const p=(position:[number,number,number],target:[number,number,number],fov=45):CameraPoseV06=>({position,target,fov});
const hero:[number,number,number]=[0,4,0];

/** One world-space rail. Every local close-up keeps the original light plane
 * in view; wide shots retain the observer, horizon and bow as scale anchors. */
export const posesV08:Record<string,{start:CameraPoseV06;end:CameraPoseV06}>={
 street:{start:p([-.8,2.45,16.8],[0,5.0,-8],52),end:p([3.6,3.5,13.3],[0,4.8,-6],50)},
 drop:{start:p([1.8,4.9,7.55],[0,4.05,0],45),end:p([.4,4.7,7.15],[0,4.05,0],45)},
 dispersion:{start:p([.4,4.7,7.15],[0,4.05,0],45),end:p([-.8,4.8,7.5],[-.1,4.0,0],45)},
 reflection:{start:p([-.8,4.8,7.5],hero,45),end:p([-1.8,5.2,9.8],[-.3,3.05,0],50)},
 angle:{start:p([-1.8,5.2,9.8],[-.3,3.05,0],50),end:p([15.5,8.9,23.8],[0,3.2,-3],48)},
 cone:{start:p([15.5,8.9,23.8],[0,3.2,-3],48),end:p([-8,6.8,26.8],[0,3.3,-3],48)},
 circle:{start:p([-8,6.8,26.8],[0,4.0,-6],52),end:p([2.8,5.6,27.3],[0,4.0,-6],52)},
 observer:{start:p([3.3,6.1,27.0],[.3,3.3,-3],49),end:p([10.4,6.6,25.8],[2.3,3.3,-3],49)},
 secondary:{start:p([1.4,5.0,8.2],hero,45),end:p([1.8,5.3,27.3],[0,5.0,-8],51)},
 return:{start:p([-8.0,4.5,12.4],[-3,2.05,3],49),end:p([-4.8,3.15,10.4],[-3,1.9,3],47)},
 references:{start:p([-4.8,3.15,10.4],[-3,1.9,3],47),end:p([-4.35,3.05,10.05],[-3,1.9,3],47)}
};

export function buildFilmCameraKeys(){
 const keys:CameraKeyV06[]=[];
 const clip=(id:string)=>timeline.clips.find(c=>c.id===id);
 const key=(f:number,pose:CameraPoseV06)=>keys.push({...pose,frame:f});
 timeline.scenes.forEach((s,i)=>{
  const duration=s.end-s.start,track=posesV08[s.id]??posesV08.street;
  const bridge=i===0?0:Math.min(100,duration*.15);
  const tail=i===timeline.scenes.length-1?0:Math.min(100,duration*.15);
  if(s.id==='drop'){
   const cup=clip('r007');key(s.start+bridge,track.start);
   if(cup&&cup.start>s.start&&cup.end<s.end){
    key(cup.start-12,p([1.25,4.9,7.15],[0,4.05,0],45));
    // The insert is reached by a small lateral track, not a new camera rig.
    key(cup.start+60,p([4.9,4.8,6.2],[4.3,4.15,0],46));
    key(cup.end-55,p([4.55,4.7,6.4],[4.3,4.15,0],46));
    key(cup.end+50,track.end);
   }key(s.end-tail,track.end);
  }else if(s.id==='dispersion'){
   const near=clip('r010'),hold=clip('r011');key(s.start+bridge,track.start);
   if(near&&hold){
    // Gentle lateral drift keeps the small red/violet separation legible.
    key(near.start+Math.min(100,near.duration*.45),p([.6,4.85,6.7],[.0,4.0,0],43));
    key(hold.end-60,p([-.45,4.8,6.9],[-.15,3.95,0],43));
   }key(s.end-tail,track.end);
  }else if(s.id==='reflection'){
   const a=clip('r013'),b=clip('r014');key(s.start+bridge,track.start);
   // The late pullback is deliberate: the complete exit ray stays above the
   // lower caption zone without shortening or rotating the physical ray.
   if(a&&b){
    key(a.start+a.duration*.65,p([1.05,5.0,6.3],[.5,4.15,0],49));
    key(b.start+b.duration*.65,p([-.8,4.7,8.6],[-.35,2.95,0],50));
   }key(s.end-tail,track.end);
  }else if(s.id==='angle'){
   const angle=clip('r018'),eye=clip('r019'),axis=clip('r020');key(s.start+bridge,track.start);
   if(angle&&eye&&axis){
    key(angle.end-35,p([-1.55,5.3,9.3],[0,3.6,0],49));
    // Pull back only when the narration introduces the eye and antisolar
    // axis. The same outgoing line is the spatial handoff into the cone.
    key(eye.start+Math.min(170,eye.duration*.72),p([13.3,8.1,21.8],[0,3.2,-3],48));
    key(axis.end-35,track.end);
   }else key(s.end-tail,track.end);
  }else if(s.id==='cone'){
   const ring=clip('r022'),near=clip('r023');key(s.start+bridge,track.start);
   if(ring)key(ring.end-25,p([6.4,8.2,26.5],[0,3.3,-3],48));
   if(near)key(near.end-25,p([-1.4,7.6,27.8],[0,3.3,-3],48));
   key(s.end-tail,track.end);
  }else if(s.id==='circle'){
   const rise=clip('r027'),hold=clip('r028');
   const up=rise?.start??s.start+duration*.32,down=hold?.end??s.start+duration*.94;
   key(s.start+bridge,track.start);
   key(Math.max(s.start+bridge+1,up-20),p([-.3,5.55,27.3],[0,4.0,-6],52));
   // Camera and observed cone rise together; the ground is kept in the
   // lower quarter instead of losing all depth in a blank aerial view.
   key(up+Math.min(rise?.duration??duration*.23,160),p([.8,24.7,31.3],[0,17.0,-7],54));
   key(Math.max(up+180,down-120),p([2.0,25.0,31.1],[0,17.0,-7],54));
   key(s.end+55,track.end);
  }else if(s.id==='observer'){
   key(s.start+bridge,track.start);
   const friend=clip('r031');
   if(friend)key(friend.start+friend.duration*.55,p([7.4,6.35,27.2],[1.45,3.3,-3],49));
   key(s.end-tail,track.end);
  }else if(s.id==='secondary'){
   const a=clip('r034'),b=clip('r035');
   key(s.start+Math.min(bridge,duration*.04),p([13.1,7.4,25.8],[0,4.0,-5],50));
   key((a?.start??s.start+duration*.2)+60,track.start);
   key((b?.start??s.start+duration*.4)-20,p([-.5,4.8,8.8],hero,45));
   key((b?.start??s.start+duration*.4)+Math.min(180,(b?.duration??210)*.8),track.end);
   // Long lateral landscape drift lets the dark band be observed as a
   // region of sky, rather than a static labelled flat graphic.
   key(s.end-tail,p([-2.6,5.6,28.2],[0,5.0,-8],51));
  }else if(s.id==='return'){
   key(s.start+bridge,track.start);
   const experiment=clip('r039');
   if(experiment){
    // Reach the spray close-up before the viewing experiment starts. The
    // lower target leaves room for the complete observer and basin beneath
    // the optical patch, rather than clipping the figure at the captions.
    key(experiment.start-40,p([-6.6,3.45,9.5],[-3,1.04,3],44));
    key(experiment.end-40,p([-5.65,3.15,9.1],[-3,.97,3],43));
   }
   key(s.end-tail,track.end);
  }else{key(s.start+bridge,track.start);key(s.end-tail,track.end);}
 });
 return keys;
}

export const filmCameraKeys=buildFilmCameraKeys();
export const sampleFilmCamera=createCameraSamplerV06({fps:30,scenes:timeline.scenes,keyframes:filmCameraKeys});
