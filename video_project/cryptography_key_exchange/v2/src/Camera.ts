import * as T from 'three';
import {group,timeline,clamp,cue} from './Timeline';
type V=[number,number,number];
export type Pose={position:V;target:V;fov:number;roll:number};
type Key=Pose&{t:number};
const keys:Key[]=[];
const add=(t:number,p:V,a:V,f=44,r=0)=>keys.push({t,position:p,target:a,fov:f,roll:r});
const within=(s:string,q:number)=>{const g=group(s);return g.start+(g.end-g.start)*q;};
// One connected route: letter -> rooftops -> brass mechanisms -> identity vault
// -> delivery tunnel -> the same street. Pauses retain a gentle parallax drift.
add(0,[-4.1,4.1,4.8],[-4.8,3.8,.2],41,-.025);
add(within('opening',.20),[-2.3,4.8,7.8],[-4.8,3.8,.1],43,.015);
add(within('opening',.43),[2,7.4,14],[-3.6,4,-2],46,.022);
add(within('opening',.70),[3,27,12],[0,14,-8],49,-.015);
add(group('secret').start-3,[2,29,-25],[0,10,-55],48,0);
add(group('secret').start+1.5,[3,11,-34],[0,7,-55],44,0);
add(within('secret',.20),[5,13,-31],[0,8,-55],47,-.025);
add(within('secret',.40),[8,11,-31],[0,7,-55],43,0);
add(within('secret',.75),[5,10,-33],[0,7,-55],43,.012);
add(group('exchange').start,[-4,10,-30],[0,7,-55],44,0);
add(within('exchange',.25),[-7,11,-32],[0,7,-55],43,-.012);
add(within('exchange',.55),[0,10,-31],[0,7,-55],42,.008);
add(within('exchange',.80),[7,9,-32],[0,7,-55],43,.015);
add(group('intruder').start,[9,12,-37],[0,7,-55],46,0);
add(within('intruder',.35),[6,10,-34],[0,7,-55],45,-.015);
add(within('intruder',.80),[-6,10,-35],[0,7,-55],44,.012);
add(group('identity').start,[-9,12,-39],[0,8,-55],46,0);
add(group('identity').start+1.5,[-1,13,-56],[24,8,-70],48,.035);
add(group('identity').start+3.7,[28,10,-48],[35,8,-70],43,0);
add(within('identity',.58),[40,9,-48],[35,8,-70],43,-.012);
add(within('identity',.86),[43,11,-49],[35,8,-70],44,.012);
add(group('delivery').start,[43,11,-49],[35,8,-70],44,0);
add(group('delivery').start+1.5,[47,14,-80],[22,8,-93],47,-.025);
add(group('delivery').start+3.5,[16,10,-81],[8,7,-102],45,0);
add(within('delivery',.46),[3,9,-81],[8,7,-102],43,-.012);
add(within('delivery',.73),[14,9,-80],[8,7,-102],43,.012);
add(cue('s29').startSec+2.6,[17,11,-79],[8,7,-102],46,0);
add(cue('s29').startSec+4.6,[10,29,-47],[4,24,-67],49,.01);
add(cue('s29').startSec+6.6,[1,28,-5],[5,24,-25],48,.01);
add(group('ending').start,[1,15,5],[7,8,-10],44,0);
add(within('ending',.37),[2,11,2],[7,8,-10],42,0);
add(within('ending',.65),[3,10,1],[7,8,-10],42,-.01);
add(within('ending',1),[4,9.5,-.5],[7,8,-10],42,0);
add(timeline.durationSec,[0,14,6],[7,8,-10],44,0);
keys.sort((a,b)=>a.t-b.t);
export const cameraKeys=keys;
function val(k:Key,c:number):number{return c<3?k.position[c]:c<6?k.target[c-3]:c===6?k.fov:k.roll;}
function slope(i:number,c:number){if(i===0||i===keys.length-1)return 0;return (val(keys[i+1],c)-val(keys[i-1],c))/(keys[i+1].t-keys[i-1].t);}
export function sampleCamera(t:number):Pose{
 let i=0;while(i<keys.length-2&&t>keys[i+1].t)i++;
 const a=keys[i],b=keys[i+1],dt=Math.max(.001,b.t-a.t),u=clamp((t-a.t)/dt),u2=u*u,u3=u2*u;
 const n=Array.from({length:8},(_,c)=>(2*u3-3*u2+1)*val(a,c)+(u3-2*u2+u)*dt*slope(i,c)+(-2*u3+3*u2)*val(b,c)+(u3-u2)*dt*slope(i+1,c));
 return{position:n.slice(0,3) as V,target:n.slice(3,6) as V,fov:n[6],roll:n[7]};
}
export function applyCamera(camera:T.PerspectiveCamera,t:number){const p=sampleCamera(t);camera.position.set(...p.position);camera.up.set(Math.sin(p.roll),Math.cos(p.roll),0);camera.lookAt(...p.target);camera.fov=p.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld();return p;}
