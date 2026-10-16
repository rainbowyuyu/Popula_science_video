/** Camera coordinates use world units; tangents are world units per second. */
export type Vec3 = [number, number, number];
export type CameraSample = {
  position: Vec3; target: Vec3; fov: number; stationIndex: number; transition: number;
};
export type Station = {id:string;start:number;end:number;origin:Vec3};
export const STATIONS: Station[] = [
  {id:'hook',start:0,end:18,origin:[0,0,0]},
  {id:'encode',start:18,end:44,origin:[20,0,0]},
  {id:'constraints',start:44,end:75,origin:[40,0,0]},
  {id:'fountain',start:75,end:118,origin:[60,0,0]},
  {id:'wetlab',start:118,end:160,origin:[80,0,0]},
  {id:'consensus',start:160,end:216,origin:[100,0,0]},
  {id:'model',start:216,end:262,origin:[120,0,0]},
  {id:'return',start:262,end:290,origin:[140,0,0]},
  {id:'coda',start:290,end:300,origin:[160,0,0]},
];
export type CameraKey = {
  time:number;position:Vec3;target:Vec3;fov:number;
  velocity:Vec3;targetVelocity:Vec3;fovVelocity:number;
};
const key = (time:number,x:number,px:number,py:number,pz:number,tx:number,fov:number,velocity:Vec3):CameraKey=>({
  time,position:[x+px,py,pz],target:[x+tx,.4,0],fov,
  velocity,targetVelocity:[.02,0,0],fovVelocity:0,
});

// Shared endpoint tangents make every adjoining cubic C1. Transits run between
// the exit/entry keys of neighboring stations, six seconds in total.
export const CAMERA_KEYS:CameraKey[] = STATIONS.flatMap((station,i)=>{
  const x=station.origin[0],entry=i===0?0:station.start+3;
  if(station.id==='hook')return [
    key(0,x,-4.1,3.4,16.1,-.8,40.5,[.22,-.08,-.22]),
    key(7.5,x,-.4,2.35,14.2,0,40,[.26,0,.02]),
    key(15,x,2.8,2.8,15.7,.2,40.5,[.22,.03,.09]),
  ];
  if(station.id==='fountain')return [
    key(78,x,-4.7,3.5,15.8,-.2,41,[.15,-.06,-.035]),
    key(97,x,0,2.4,15.2,0,40,[.23,0,0]),
    key(115,x,4.7,3.4,15.8,.2,41,[.15,.04,.035]),
  ];
  if(station.id==='wetlab')return [
    key(121,x,-2.4,4.9,15.9,-1,41,[.1,-.1,-.07]),
    key(136,x,-.3,4.0,14.6,.4,40,[.12,-.06,0]),
    key(150,x,2.3,2.8,14.9,1.5,40,[.1,-.02,.04]),
    key(157,x,2.7,2.8,15.7,.2,40.5,[.12,.016,.035]),
  ];
  if(station.id==='coda')return [
    {...key(293,x,-1.8,2.8,15.7,-.2,40.5,[.12,0,0]),targetVelocity:[.02,0,0] as Vec3},
    {...key(295,x,-1.55,2.76,15.7,-.16,40.5,[.08,-.012,0]),targetVelocity:[.01,0,0] as Vec3},
    {...key(300,x,-1.2,2.7,15.7,-.11,40.5,[.04,-.005,0]),targetVelocity:[.01,0,0] as Vec3},
  ];
  if(station.id==='encode')return [
    key(21,x,-1.8,2.8,15.5,-1.5,40.5,[.12,-.016,-.035]),
    key(29,x,-1.2,2.6,14.4,-1,40,[.1,-.012,-.08]),
    {...key(35,x,.5,2.5,13.5,2,40,[.16,0,0]),target:[x+2,.35,0] as Vec3},
    key(41,x,2,2.8,15.7,2,40.5,[.12,.016,.035]),
  ];
  if(station.id==='consensus')return [
    key(163,x,-1.8,2.8,15.7,-.8,40.5,[.12,-.016,-.035]),
    {...key(180,x,-.2,2.5,14.5,1,40,[.1,0,0]),targetVelocity:[0,0,0] as Vec3},
    {...key(203,x,1,2.7,14.9,0,40,[.08,.01,.035]),targetVelocity:[0,0,0] as Vec3},
    key(213,x,2,2.8,15.7,.2,40.5,[.12,.016,.035]),
  ];
  const exit=station.end-3,mid=(entry+exit)/2;
  const distance=station.id==='fountain'?16:15.7;
  return [
    key(entry,x,-1.8,2.8,distance,-.2,40.5,[.12,-.016,-.035]),
    key(mid,x,.15,2.5,distance-.5,0,40,[.1,0,0]),
    key(exit,x,2,2.8,distance,.2,40.5,[.12,.016,.035]),
  ];
});

const cubic=(p0:number,p1:number,v0:number,v1:number,u:number,span:number)=>{
  const u2=u*u,u3=u2*u;
  return (2*u3-3*u2+1)*p0+(u3-2*u2+u)*span*v0+(-2*u3+3*u2)*p1+(u3-u2)*span*v1;
};
const vectorCubic=(a:Vec3,b:Vec3,va:Vec3,vb:Vec3,u:number,span:number):Vec3=>[
  cubic(a[0],b[0],va[0],vb[0],u,span),
  cubic(a[1],b[1],va[1],vb[1],u,span),
  cubic(a[2],b[2],va[2],vb[2],u,span),
];
/** Read-only pure frame sampling. Forward and reverse seeking give identical results. */
export function sampleCamera(timeSec:number):CameraSample {
  const time=Number.isFinite(timeSec)?Math.max(0,Math.min(300,timeSec)):0;
  let index=0;
  while(index<CAMERA_KEYS.length-2&&time>CAMERA_KEYS[index+1].time)index++;
  const a=CAMERA_KEYS[index],b=CAMERA_KEYS[index+1],span=b.time-a.time;
  const u=Math.max(0,Math.min(1,(time-a.time)/span));
  let stationIndex=STATIONS.findIndex(station=>time<station.end);
  if(stationIndex<0)stationIndex=STATIONS.length-1;
  let transition=0;
  for(const station of STATIONS.slice(1)){
    if(time>=station.start-3&&time<=station.start+3){
      const phase=(time-station.start+3)/6;
      transition=phase*phase*(3-2*phase);
      break;
    }
  }
  return {
    position:vectorCubic(a.position,b.position,a.velocity,b.velocity,u,span),
    target:vectorCubic(a.target,b.target,a.targetVelocity,b.targetVelocity,u,span),
    fov:cubic(a.fov,b.fov,a.fovVelocity,b.fovVelocity,u,span),stationIndex,transition,
  };
}
