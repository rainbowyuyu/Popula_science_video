import * as T from 'three';
import {cue,timeline,codaStart} from './Timeline';
type V=[number,number,number];
export type Pose={position:V;target:V;fov:number};
type Key=Pose&{t:number};
const at=(id:string,f=.3)=>{const c=cue(id);return c.startSec+(c.endSec-c.startSec)*f;};
const key=(t:number,p:V,g:V,fov=36):Key=>({t,position:p,target:g,fov});
/** Shared, physical workshop. Focus glides between original, pointer and copy;
 * the array is a real neighbouring bench, not a replacement backdrop. */
export function cameraKeys():Key[]{return[
 key(0,[-6.9,7.1,19.7],[-3.6,3.35,.1],35),
 key(at('s01',.72),[-.8,8.1,23.4],[-.1,3.30,.0],36),
 key(at('s02',.42),[2.3,7.8,22.8],[.7,3.35,0],36),
 key(at('s03',.55),[.7,7.5,22.7],[.1,3.25,.1],36),
 key(at('s04',.60),[-5.8,6.1,16.6],[-3.9,3.0,.15],35),
 key(at('s05',.42),[-7.6,7.1,17.1],[-4.05,3.05,0],35),
 key(at('s06',.65),[-5.7,6.1,16.2],[-4,2.9,.1],35),
 key(at('s07',.55),[-4.9,5.9,16.6],[-4,2.75,.3],35),
 key(at('s08',.65),[-5.4,6.4,17.4],[-4,2.85,.4],35),
 key(at('s09',.45),[-4.0,7.3,20.6],[-2.6,3.1,1.6],36),
 key(at('s10',.55),[-1.1,8.3,24.8],[-1.8,3.35,2.8],36),
 key(at('s11',.60),[.2,8.6,25.1],[-1.8,3.45,2.7],36),
 key(at('s12',.60),[-.9,8.0,23.3],[-1.8,3.35,2.7],36),
 key(at('s13',.65),[-3.1,7.6,22.3],[-2.6,3.2,2.2],35),
 key(at('s14',.55),[-4.8,7.9,22.8],[-2.7,3.25,2],35),
 key(at('s15',.60),[-5.7,7.1,20.9],[-3.0,3.15,1.8],35),
 key(at('s16',.55),[-8.4,9.5,27.8],[-5.1,3.7,1.6],36),
 key(at('s17',.60),[-10.0,9.0,26.1],[-5.3,3.6,1.0],36),
 key(at('s18',.42),[-.5,8.4,25.2],[.1,3.45,.7],36),
 key(at('s19',.45),[2.3,9.3,27.1],[.3,3.65,1.4],36),
 key(at('s20',.5),[2.9,9.6,27.9],[.3,3.6,1.7],36),
 key(at('s21',.50),[1.0,10.1,27.8],[-.3,3.75,1.9],36),
 key(at('s22',.58),[-.8,9.0,26.2],[-.7,3.5,1.6],36),
 key(at('s23',.55),[-2.7,8.3,23.4],[-1.7,3.3,1.1],36),
 key(at('s24',.45),[16.0,8.8,26.1],[17,3.5,1.4],36),
 key(at('s25',.55),[19.6,8.2,25.8],[17,3.35,2.0],36),
 key(at('s26',.55),[20.7,9.3,25.4],[17.0,3.4,2.1],36),
 key(at('s27',.55),[18.8,9.5,24.4],[17,3.4,1.7],36),
 key(at('s28',.50),[16.9,8.1,22.4],[17,3.15,1.5],36),
 key(at('s29',.5),[20.5,9.4,29.2],[18.2,3.45,2.1],36),
 key(at('s30',.55),[22.7,9.7,30.7],[19.5,3.6,1.8],36),
 key(at('s31',.50),[21.4,9.0,29.3],[18.6,3.45,1.7],36),
 key(at('s32',.40),[21.0,10.0,30.0],[19.0,3.7,1.6],36),
 key(at('s33',.35),[-.6,9.3,27.8],[-1.7,3.55,1.4],36),
 key(at('s34',.55),[-4.6,7.4,20.5],[-3.1,3.2,1.5],35),
 key(codaStart,[-5.6,7.1,20.2],[-3.3,3.1,1.4],35),
 key(timeline.durationSec,[-5.8,7.0,20.0],[-3.3,3.1,1.4],35),
];}
const h=(a:number,b:number,va:number,vb:number,u:number,dt:number)=>{const u2=u*u,u3=u2*u;return(2*u3-3*u2+1)*a+(u3-2*u2+u)*va*dt+(-2*u3+3*u2)*b+(u3-u2)*vb*dt;};
export function sampleCamera(t:number):Pose{const keys=cameraKeys();let i=keys.findIndex((k,n)=>n<keys.length-1&&t<keys[n+1].t);if(i<0)i=keys.length-2;const a=keys[i],b=keys[i+1],p=keys[Math.max(0,i-1)],n=keys[Math.min(keys.length-1,i+2)],dt=b.t-a.t,u=Math.max(0,Math.min(1,(t-a.t)/dt));const tangent=(left:number,right:number)=>left*right<=0?0:2*left*right/(left+right);const s=(av:number,bv:number,pv:number,nv:number)=>{const d=(bv-av)/dt,dp=(av-pv)/Math.max(.001,a.t-p.t),dn=(nv-bv)/Math.max(.001,n.t-b.t);return h(av,bv,i===0?0:tangent(dp,d),i===keys.length-2?0:tangent(d,dn),u,dt);};const target=a.target.map((v,j)=>s(v,b.target[j],p.target[j],n.target[j]))as V;const position=a.position.map((v,j)=>{const val=s(v,b.position[j],p.position[j],n.position[j]);return target[j]+.84*(val-target[j]);})as V;return{position,target,fov:s(a.fov,b.fov,p.fov,n.fov)};}
export function applyCamera(camera:T.PerspectiveCamera,t:number){const p=sampleCamera(t);camera.position.set(...p.position);camera.up.set(0,1,0);camera.lookAt(...p.target);camera.fov=p.fov;camera.updateProjectionMatrix();camera.updateMatrixWorld(true);return p;}
