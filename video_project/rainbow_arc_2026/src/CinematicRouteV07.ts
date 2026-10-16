import {timeline} from './Timeline';
import {CameraKeyV06,CameraPoseV06,createCameraSamplerV06} from './CameraPathV06';
const p=(position:[number,number,number],target:[number,number,number],fov=45):CameraPoseV06=>({position,target,fov});
const hero:[number,number,number]=[0,4.25,0];
export const posesV06:Record<string,{start:CameraPoseV06;end:CameraPoseV06}>={
 street:{start:p([0,2.4,16],[0,5,-8],52),end:p([4.4,3.8,13],[0,5,-6],50)},
 drop:{start:p([1.7,4.9,7.3],hero,45),end:p([.3,4.7,7.1],hero,45)},
 dispersion:{start:p([.3,4.7,7.1],hero,45),end:p([-.8,4.7,7.4],hero,45)},
 reflection:{start:p([-.8,4.7,7.4],hero,45),end:p([-1.8,5.2,9.8],[-.3,3.05,0],50)},
 angle:{start:p([-1.8,5,9.6],[0,3.20,0],50),end:p([3.7,6.5,13],[0,3.5,0],49)},
 cone:{start:p([18,10,23],[0,3,-3],48),end:p([-9,8,25],[0,3,-3],48)},
 circle:{start:p([0,5,25],[0,4,-6],52),end:p([2,5.5,25],[0,4,-6],52)},
 observer:{start:p([4,6.2,26],[0,3,-3],48),end:p([12,7.2,24],[2,3,-3],48)},
 secondary:{start:p([1.4,5,8.2],hero,45),end:p([0,4.5,25],[0,5,-8],51)},
 return:{start:p([-7,4.4,11],[-3,2,3],49),end:p([-4,2.7,9],[-3,1.7,3],47)},
 references:{start:p([-4,2.7,9],[-3,1.7,3],47),end:p([-3.5,2.7,8.7],[-3,1.7,3],47)}
};
export function buildFilmCameraKeys(){
 const keys:CameraKeyV06[]=[];
 timeline.scenes.forEach((s,i)=>{
   const duration=s.end-s.start,track=posesV06[s.id]??posesV06.street;
   const bridge=i===0?0:Math.min(100,duration*.15);
   const tail=i===timeline.scenes.length-1?0:Math.min(100,duration*.15);
   const key=(f:number,pose:CameraPoseV06)=>keys.push({...pose,frame:f});
   if(s.id==='drop'){
     const cup=timeline.clips.find(c=>c.id==='r007');
     key(s.start+bridge,track.start);
     if(cup&&cup.start>s.start&&cup.end<s.end){key(cup.start-12,track.start);key(cup.start+60,p([4.9,4.8,6.2],[4.3,4.15,0],46));key(cup.end-55,p([4.55,4.7,6.4],[4.3,4.15,0],46));key(cup.end+50,track.end);}
     key(s.end-tail,track.end);
   }else if(s.id==='dispersion'){
     const near=timeline.clips.find(c=>c.id==='r010'&&c.scene===s.id),hold=timeline.clips.find(c=>c.id==='r011'&&c.scene===s.id);
     key(s.start+bridge,track.start);
     if(near&&hold){key(near.start+Math.min(100,near.duration*.45),p([.8,4.95,5.7],[.1,4.25,0],42));key(hold.end-60,p([-.6,4.8,5.9],[-.15,4.10,0],42));}
     key(s.end-tail,track.end);
   }else if(s.id==='reflection'){
     const a=timeline.clips.find(c=>c.id==='r013'&&c.scene===s.id),b=timeline.clips.find(c=>c.id==='r014'&&c.scene===s.id);
     key(s.start+bridge,track.start);
     // Follow the return beam with a gradual pullback and lower aim. Its full
     // Snell direction stays unchanged while the lower exit clears captions.
     if(a&&b){key(a.start+a.duration*.65,p([1.05,5.0,6.3],[.5,4.15,0],49));key(b.start+b.duration*.65,p([-.8,4.7,8.6],[-.35,2.95,0],50));}
     key(s.end-tail,track.end);
   }else if(s.id==='angle'){
     const angle=timeline.clips.find(c=>c.id==='r018'),eye=timeline.clips.find(c=>c.id==='r019'),axis=timeline.clips.find(c=>c.id==='r020');
     key(s.start+bridge,track.start);
     if(angle&&eye&&axis){
       key(angle.end-35,p([-1.55,5.3,9.3],[0,3.6,0],49));
       key(eye.start+Math.min(150,eye.duration*.72),p([17,9.5,22],[0,3,-3],48));
       key(axis.end-35,p([18,10,23],[0,3,-3],48));
     }else{key(s.end-tail,track.end);}
   }else if(s.id==='circle'){
     const rise=timeline.clips.find(c=>c.id==='r027'&&c.scene===s.id),hold=timeline.clips.find(c=>c.id==='r028'&&c.scene===s.id);
     const up=rise?.start??s.start+duration*.32,down=hold?.end??s.start+duration*.94;
     key(s.start+bridge,track.start);key(Math.max(s.start+bridge+1,up-20),p([.4,5.2,25],[0,4,-6],52));
     key(up+Math.min(rise?.duration??duration*.23,160),p([.8,23.2,29],[0,15.5,-7],54));
     key(Math.max(up+180,down-120),p([1.2,23.2,29],[0,15.5,-7],54));
     key(s.end+55,track.end);
   }else if(s.id==='secondary'){
     const a=timeline.clips.find(c=>c.id==='r034'),b=timeline.clips.find(c=>c.id==='r035');
     key(s.start+Math.min(bridge,duration*.04),p([16,8,24],[0,4,-5],50));
     key((a?.start??s.start+duration*.2)+60,track.start);key((b?.start??s.start+duration*.4)-20,p([-.5,4.8,8.8],hero,45));key((b?.start??s.start+duration*.4)+Math.min(180,(b?.duration??210)*.8),track.end);key(s.end-tail,p([2,5,25],[0,5,-8],51));
   }else{key(s.start+bridge,track.start);key(s.end-tail,track.end);}
 });
 return keys;
}
export const filmCameraKeys=buildFilmCameraKeys();
export const sampleFilmCamera=createCameraSamplerV06({fps:30,scenes:timeline.scenes,keyframes:filmCameraKeys});
