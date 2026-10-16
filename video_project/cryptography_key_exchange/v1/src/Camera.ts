import {groups,cue,timeline,clamp} from './Timeline';
export type V3=[number,number,number];
export type CameraPose={position:V3;target:V3;fov:number};
type Key={t:number;p:V3;q:V3};
const keys:Key[]=[];
function add(t:number,x:number,offset:V3,target:V3=[0,0,0]){keys.push({t,p:[x+offset[0],offset[1],offset[2]],q:[x+target[0],target[1],target[2]]});}
for(const g of groups){const x=g.x,d=g.end-g.start;
 if(g.id==='hook'){add(0,x,[1.9,3.6,16],[1,.3,0]);add(g.end-3.5,x,[-1.1,2.1,13.8],[.4,.2,0]);}
 else if(g.id==='math'){
  add(g.start+.65,x,[0,3.5,17]);
  const moves:[string,V3,V3][]=[['c11',[-.8,2.9,15.3],[0,0,0]],['c12',[-3.9,2.9,12.6],[-2.3,.3,0]],['c13',[3.7,2.7,12.6],[2.3,.3,0]],['c14',[0,3.8,18],[0,.1,0]],['c15',[-3.6,3.1,13.3],[-2.1,.1,0]],['c16',[3.5,2.7,13.3],[2.1,.1,0]],['c17',[1.5,3.8,18],[0,.2,0]],['c19',[-.8,3.5,16],[0,.2,0]],['c20',[-2.7,2.8,14],[-1.3,.1,0]],['c21',[.4,4.4,19.3],[0,.4,0]],['c23',[.5,3.4,16.5],[0,.1,0]]];
  for(const [id,p,q] of moves){const c=cue(id);add(c.startSec+Math.min(2,(c.endSec-c.startSec)*.35),x,p,q);}add(g.end-3.5,x,[1.2,3,17]);
 }else{add(g.start+(g.id==='auth'?3.1:g.id==='coda'?3.2:.65),x,[-1.5,3.5,17],[0,.2,0]);add(g.start+d*.48,x,[1.8,2.7,g.id==='mixing'?15.6:16.2],[.1,.2,0]);add(g.end-(g.id==='encryption'?.5:g.id==='attack'?.7:3.5),x,[.5,3.1,16.2],[0,.2,0]);}
}
add(timeline.durationSec,groups.at(-1)!.x,[2.4,4.6,18.8],[.3,.3,0]);
keys.sort((a,b)=>a.t-b.t);
export const cameraKeys=keys;
function tangent(i:number,k:'p'|'q',axis:number){const a=keys[Math.max(0,i-1)],b=keys[Math.min(keys.length-1,i+1)];return (b[k][axis]-a[k][axis])/Math.max(.01,b.t-a.t);}
export function sampleCamera(t:number):CameraPose{let i=keys.findIndex(k=>k.t>t)-1;if(i<0)i=t>=keys.at(-1)!.t?keys.length-2:0;const a=keys[i],b=keys[i+1],dt=b.t-a.t,u=clamp((t-a.t)/dt),u2=u*u,u3=u2*u;
 const interp=(k:'p'|'q')=>[0,1,2].map(axis=>{const ma=tangent(i,k,axis),mb=tangent(i+1,k,axis);return (2*u3-3*u2+1)*a[k][axis]+(u3-2*u2+u)*dt*ma+(-2*u3+3*u2)*b[k][axis]+(u3-u2)*dt*mb;}) as V3;
 return {position:interp('p'),target:interp('q'),fov:40};
}
