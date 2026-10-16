import {PerspectiveCamera,Vector3} from 'three';

export type CameraKey={t:number;p:[number,number,number];q:[number,number,number]};
const clamp=(x:number)=>Math.max(0,Math.min(1,x));
const ease=(x:number)=>{const q=clamp(x);return q*q*q*(q*(q*6-15)+10);};

/** Time-weighted shape-preserving Hermite interpolation. Tangents belong to
 * knots rather than segments, so every scene and knot shares a C1 camera.
 * A sign change stops only that axis; it never overshoots an intended target. */
export function sampleCinematicCamera(keys:CameraKey[],time:number):{position:Vector3;target:Vector3}{
  const rows=keys.filter(k=>Number.isFinite(k.t)&&[...k.p,...k.q].every(Number.isFinite)).sort((a,b)=>a.t-b.t);
  const unique=rows.filter((k,i)=>i===rows.length-1||k.t<rows[i+1].t);
  if(!unique.length)return{position:new Vector3(0,0,1),target:new Vector3()};
  if(unique.length===1)return{position:new Vector3(...unique[0].p),target:new Vector3(...unique[0].q)};
  const t=Math.max(unique[0].t,Math.min(unique.at(-1)!.t,Number.isFinite(time)?time:unique[0].t));
  const i=Math.min(unique.length-2,Math.max(0,unique.findLastIndex(k=>k.t<=t))),a=unique[i],b=unique[i+1],dt=b.t-a.t,u=(t-a.t)/dt;
  const tangent=(n:number,kind:'p'|'q',axis:number)=>{
    if(n===0||n===unique.length-1)return 0;
    const before=unique[n-1],at=unique[n],after=unique[n+1],h0=at.t-before.t,h1=after.t-at.t;
    const d0=(at[kind][axis]-before[kind][axis])/h0,d1=(after[kind][axis]-at[kind][axis])/h1;
    if(d0*d1<=0)return 0;const w0=2*h1+h0,w1=h1+2*h0;
    return(w0+w1)/(w0/d0+w1/d1);
  };
  const h00=2*u*u*u-3*u*u+1,h10=u*u*u-2*u*u+u,h01=-2*u*u*u+3*u*u,h11=u*u*u-u*u;
  const channel=(kind:'p'|'q')=>new Vector3(...[0,1,2].map(axis=>h00*a[kind][axis]+h10*dt*tangent(i,kind,axis)+h01*b[kind][axis]+h11*dt*tangent(i+1,kind,axis)) as [number,number,number]);
  return{position:channel('p'),target:channel('q')};
}

export function corridorTravel(time:number,enter:[number,number],holdX:number,enterX:number,exit?:[number,number],exitX=enterX):{x:number;visible:boolean}{
  const inQ=ease((time-enter[0])/Math.max(.001,enter[1]-enter[0]));
  const outQ=exit?ease((time-exit[0])/Math.max(.001,exit[1]-exit[0])):0;
  return{x:enterX+(holdX-enterX)*inQ+(exitX-holdX)*outQ,visible:time>=enter[0]&&(!exit||time<=exit[1])};
}

export function projectAnchor(camera:PerspectiveCamera,world:Vector3,width=1920,height=1080):{x:number;y:number;depth:number;visible:boolean}{
  const local=world.clone().applyMatrix4(camera.matrixWorldInverse),ndc=world.clone().project(camera);
  const x=(ndc.x+1)*width/2,y=(1-ndc.y)*height/2;
  return{x,y,depth:ndc.z,visible:local.z<0&&ndc.z>=-1&&ndc.z<=1&&x>=64&&x<=width-64&&y>=64&&y<=height-64};
}
