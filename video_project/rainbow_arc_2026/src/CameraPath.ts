import * as T from 'three';
import {timeline,ease} from './Timeline';
import {sampleOutdoorTransform} from './OpticsWorld';
type V=[number,number,number];
type Key={frame:number;position:V;target:V;fov:number};
const key=(frame:number,position:V,target:V,fov=42):Key=>({frame,position,target,fov});
const at=(id:string,offset=0)=>Math.max(0,(timeline.clips.find(c=>c.id===id)?.start??0)+offset*30);

// One camera in one world. Close-up and observation areas retain their world
// coordinates while the camera travels between them; no scene replacement.
export const cameraKeys:Key[]=[
 key(0,[.1,2.0,10.1],[0,3,-7],64),
 key(at('r003'),[1.2,2.25,9.0],[0,3.0,-7],62),
 key(at('r004'),[3.2,3.2,13],[0,2.8,-2],56),
 key(at('r005'),[10,7.2,19],[0,2.4,1],48),
 key(at('r006',1),[11.5,7.8,19.3],[.3,2.6,1],46),
 key(at('r007',1),[32.8,3.65,9.5],[30.7,2.55,0],40),
 key(at('r009'),[33.3,3.8,9.0],[30.7,2.55,0],39),
 key(at('r011'),[32.3,3.4,8.8],[30.7,2.45,0],39),
 key(at('r013'),[33.0,3.9,9.2],[30.8,2.55,0],38),
 key(at('r015'),[31.5,3.7,8.8],[30.55,2.4,0],40),
 key(at('r017'),[30.9,3.25,9.0],[30.5,2.4,0],42),
 key(at('r018'),[32.0,3.8,10.0],[30.6,2.45,0],43),
 key(at('r019',-.6),[32.3,3.9,10.3],[30.6,2.45,0],43),
 key(at('r019',3.1),[12.2,9.2,25],[0,2.8,1],45),
 key(at('r021'),[10,7.6,22],[0,2.8,1.0],43),
 key(at('r023'),[8.5,7.0,20],[0,2.8,.4],43),
 key(at('r024'),[9.6,8.4,21],[0,2.2,.0],44),
 key(at('r027'),[13.5,10.5,19],[0,2.5,0],46),
 key(at('r028'),[5,6.0,19],[0,2.8,-.4],47),
 key(at('r029'),[1.4,2.6,11.0],[0,3.0,-8],65),
 key(at('r030',2),[.2,2.3,10],[0,3.2,-8],65),
 key(at('r031'),[3.8,4.5,18.5],[0,3.0,-2],55),
 key(at('r032'),[5,4.8,23],[-2,-2.0,-3],57),
 key(at('r033'),[2.5,4.0,23],[-2,-2.0,-3],59),
 key(at('r034'),[9.5,7.6,23],[0,2.7,1],47),
 key(at('r036'),[12,7.8,22],[.4,2.6,1],47),
 key(at('r038'),[1.7,3.6,17],[0,3.1,-5],65),
 key(at('r039',-.4),[2.1,3.9,18],[0,3.2,-5],63),
 key(at('r039',3.0),[33.0,3.9,9.6],[30.8,2.6,0],42),
 key(at('r040',2),[31.5,3.6,9.4],[30.8,2.6,0],42),
 key(at('r041',-.4),[31.6,3.7,9.6],[30.8,2.6,0],42),
 key(at('r041',3.0),[3.4,4.5,20],[0,3.1,-3],62),
 key(at('r043'),[5,5.5,20.7],[0,3.3,-3],60),
 key(at('r045'),[1.2,4.1,19],[0,3.0,-4],63),
 key(at('r046'),[3.2,3.4,16],[0,3,-5],60),
 key(at('r048'),[.6,2.3,11.5],[0,3,-6],63),
 key(at('r050'),[.1,2.1,10],[0,3.0,-7],64),
 key(timeline.duration,[.15,2.2,10.5],[0,3.1,-7],64),
].sort((a,b)=>a.frame-b.frame).filter((k,i,a)=>i===0||k.frame>a[i-1].frame);

function slope(a:number,b:number,ta:number,tb:number){return (b-a)/Math.max(1,tb-ta)}
function interpolateValues(values:number[],i:number,f:number){
 const ts=cameraKeys.map(k=>k.frame),n=values.length;const span=ts[i+1]-ts[i];const x=(f-ts[i])/span;
 const d=slope(values[i],values[i+1],ts[i],ts[i+1]);
 const dp=i>0?slope(values[i-1],values[i],ts[i-1],ts[i]):d;
 const dn=i+2<n?slope(values[i+1],values[i+2],ts[i+1],ts[i+2]):d;
 const tangent=(a:number,b:number)=>a*b<=0?0:Math.sign(a)*Math.min(Math.abs((a+b)/2),3*Math.min(Math.abs(a),Math.abs(b)));
 const m0=tangent(dp,d)*span,m1=tangent(d,dn)*span;
 return (2*x*x*x-3*x*x+1)*values[i]+(x*x*x-2*x*x+x)*m0+(-2*x*x*x+3*x*x)*values[i+1]+(x*x*x-x*x)*m1;
}
export function sampleCamera(frame:number){
 let i=cameraKeys.findIndex((k,j)=>j<cameraKeys.length-1&&frame>=k.frame&&frame<cameraKeys[j+1].frame);
 if(i<0){const k=frame<=cameraKeys[0].frame?cameraKeys[0]:cameraKeys.at(-1)!;return {...k};}
 const val=(field:'position'|'target',axis:number)=>interpolateValues(cameraKeys.map(k=>k[field][axis]),i,frame);
 return {frame,position:[0,1,2].map(a=>val('position',a)) as V,target:[0,1,2].map(a=>val('target',a)) as V,fov:interpolateValues(cameraKeys.map(k=>k.fov),i,frame)};
}
export function applyCamera(camera:T.PerspectiveCamera,frame:number){const k=sampleCamera(frame),outdoor=sampleOutdoorTransform(frame);const subtitleClearance=1.9*ease((frame-5460)/55)*(1-ease((frame-5610)/65));camera.position.set(k.position[0]+outdoor.shift*.25,k.position[1]+outdoor.lift,k.position[2]);camera.fov=k.fov;camera.lookAt(new T.Vector3(k.target[0]+outdoor.shift*.7,k.target[1]+outdoor.lift-subtitleClearance,k.target[2]));camera.updateProjectionMatrix();return k;}
