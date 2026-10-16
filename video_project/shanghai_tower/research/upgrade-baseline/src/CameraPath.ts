import * as T from 'three';
import {V,channel,Timeline,mix,clamp} from './visual';
// All poses share one real-world building coordinate system, metres / 100.
// A quintic timing curve keeps acceleration continuous at each keyframe.
type Key={t:number;y:number;r:number;az:number;el:number;x?:number;z?:number;shift?:number};
export class CameraPath{
 keys:Key[]=[];
 constructor(tl:Timeline){
  const groups:Record<string,number[][]>={
   hook:[[0,3.05,16,.77,.12],[.23,3.3,18.6,.99,.22],[.48,3.3,17.7,1.19,.21],[.72,3.1,15.3,1.34,.15],[1,.3,4.3,1.45,.42]],
   foundation:[[0,.3,4.3,1.45,.42],[.24,-.42,4.6,1.62,.13],[.57,-.44,3.7,1.86,.2],[.8,-.28,3.2,2.10,.08],[1,1.05,5.7,2.23,.13]],
   core:[[0,1.05,5.7,2.23,.13],[.28,1.7,4.0,2.42,.16],[.57,2.5,3.2,2.60,.32],[.82,3.0,3.9,2.78,.14],[1,2.55,5.3,2.98,.10]],
   frame:[[0,2.55,5.3,2.98,.10],[.18,2.18,3.3,3.16,.32],[.40,2.04,2.5,3.38,.2],[.60,2.12,2.6,3.62,.36],[.82,2.24,3.6,3.83,.16],[1,2.6,3.4,4.03,.62]],
   skin:[[0,2.6,3.4,4.03,.62],[.23,2.46,2.55,4.26,.70],[.48,2.6,2.85,4.48,.38],[.72,3.0,6.9,4.70,.22],[1,3.1,14.2,4.98,.1]],
   wind:[[0,3.1,14.2,4.98,.1],[.22,3.3,12.7,5.16,.16],[.50,3.65,12.9,5.37,.12],[.73,2.0,10.7,5.60,.18],[.84,2.0,10.5,5.70,.19],[1,5.81,2.1,5.9,.37]],
   damper:[[0,5.81,2.1,5.9,.37],[.23,5.83,.87,6.10,.27],[.54,5.79,.74,6.37,.15],[.78,5.9,2.5,6.55,.2],[.9,3.0,15.3,6.66,.15],[1,.6,4.5,6.73,.2]],
   assembly:[[0,.6,4.5,6.73,.2],[.20,1.03,4.0,6.90,.2],[.47,4.15,6.2,7.10,.2],[.74,5.45,6.4,7.33,.17],[1,3.1,14.2,7.55,.09]],
   return:[[0,3.1,14.2,7.55,.09],[.4,3.1,13.8,7.76,.08],[.75,3.1,14.8,7.93,.1],[1,3.1,15.5,8.02,.13]],
  };
  for(const sec of tl.sections){const poses=groups[sec.id];if(!poses)continue;for(const [p,y,r,az,el] of poses){const t=mix(sec.start,sec.end,p)/tl.fps;if(this.keys.length&&Math.abs(this.keys.at(-1)!.t-t)<.01)continue;this.keys.push({t,y,r,az,el,shift:-190});}}
 }
 at(t:number){const col=(k:keyof Key)=>channel(this.keys.map(x=>[x.t,x[k]??0]),t);const y=col('y'),r=col('r'),az=col('az')+.008*Math.sin(t*.35),el=col('el')+.004*Math.sin(t*.29);const target=V(col('x'),y,col('z'));const position=target.clone().add(V(Math.cos(az)*Math.cos(el)*r,Math.sin(el)*r,Math.sin(az)*Math.cos(el)*r));return {position,target,shift:col('shift')};}
 apply(camera:T.PerspectiveCamera,t:number){const p=this.at(t);camera.position.copy(p.position);camera.lookAt(p.target);camera.setViewOffset(1920,1080,p.shift,0,1920,1080);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
}
