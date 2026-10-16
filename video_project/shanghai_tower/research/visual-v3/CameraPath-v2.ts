import * as T from 'three';
import {V,Timeline,mix,clamp,pulse} from './visual';

type Pose={u:number;y:number;r:number;az:number;el:number;x?:number;z?:number;shift?:number;focus?:string};
type Key={t:number;y:number;r:number;az:number;el:number;x:number;z:number;shift:number;focus?:string};
type Scalar='x'|'y'|'z'|'r'|'az'|'el'|'shift';
const columns:Scalar[]=['x','y','z','r','az','el','shift'];

// Shared velocity and zero acceleration at each knot make these curves C2.
// Nonzero angular tangents let an orbit flow through the component close-ups.
export function flowingCurve(times:number[],values:number[]){
 const slopes=values.slice(1).map((v,i)=>(v-values[i])/(times[i+1]-times[i]));
 const derivatives=values.map((_,i)=>{
  if(i===0)return slopes[0];if(i===values.length-1)return slopes.at(-1)!;
  const a=slopes[i-1],b=slopes[i];if(a*b<=0)return 0;
  const ha=times[i]-times[i-1],hb=times[i+1]-times[i];
  return (3*(ha+hb))/((2*hb+ha)/a+(hb+2*ha)/b);
 });
 return (t:number)=>{
  if(t<=times[0])return values[0];if(t>=times.at(-1)!)return values.at(-1)!;
  const i=times.findIndex((x,j)=>j>0&&t<=x)-1,h=times[i+1]-times[i];
  const s=clamp((t-times[i])/h),d=values[i+1]-values[i],v0=derivatives[i]*h,v1=derivatives[i+1]*h;
  const a3=10*d-6*v0-4*v1,a4=-15*d+8*v0+7*v1,a5=6*d-3*v0-3*v1;
  return values[i]+v0*s+a3*s**3+a4*s**4+a5*s**5;
 };
}
export class CameraPath{
 keys:Key[]=[];curves={} as Record<Scalar,(t:number)=>number>;anchors:Record<string,number[]>={};
 constructor(public tl:Timeline){this.rebuild();}
 timeAt(u:number){const n=Math.floor(u),clip=this.tl.clips.find(c=>Number(c.id.slice(1))===n);if(!clip)return u<1?0:this.tl.duration/this.tl.fps;return mix(clip.start,clip.end,u-n)/this.tl.fps;}
 setAnchors(anchors:Record<string,number[]>){this.anchors=anchors;this.rebuild();}
 rebuild(){
  // Each cue follows the spoken object. Units are metres / 100, Y-up.
  const tmdY=(this.anchors.TMD?.[1]??583.5)*.01;
  const poses:Pose[]=[
   {u:0,y:3.05,r:14.4,az:.55,el:.065,shift:-190},
   {u:2,y:3.38,r:17.6,az:.88,el:.18},
   {u:3,y:3.40,r:16.8,az:1.16,el:.23},
   {u:4,y:2.9,r:14.2,az:1.36,el:.15},
   {u:5,y:-.18,r:3.7,az:1.42,el:.20},
   {u:6.1,y:-.46,r:2.7,az:1.57,el:.08,shift:-235},
   {u:7.2,y:-.57,r:2.4,az:1.77,el:.08,x:.125,z:.25},
   {u:8.25,y:-.28,r:2.3,az:1.98,el:.25},
   {u:9.1,y:-.06,r:3.2,az:2.12,el:.24},
   {u:10.25,y:1.20,r:3.1,az:2.29,el:.18},
   {u:11.15,y:1.40,r:1.55,az:2.47,el:.36,focus:'coreInterior'},
   {u:12.15,y:1.70,r:2.25,az:2.61,el:.22,focus:'coreInterior'},
   {u:13.3,y:3.0,r:11.7,az:2.75,el:.06},
   {u:14.3,y:2.32,r:2.9,az:2.93,el:.30,focus:'floorLoad'},
   {u:15.1,y:2.30,r:1.85,az:3.10,el:.31,focus:'outriggerColumn'},
   {u:16.05,y:2.37,r:1.50,az:3.27,el:.48,focus:'floorLoad',shift:-60},
   {u:16.78,y:2.10,r:2.45,az:3.36,el:.28,focus:'columnBelow'},
   {u:17.45,y:2.31,r:1.55,az:3.47,el:.22,focus:'outriggerMid'},
   {u:18.30,y:2.31,r:1.10,az:3.60,el:.29,focus:'outriggerMid'},
   {u:19.12,y:2.31,r:1.28,az:3.73,el:.27,focus:'outriggerCore'},
   {u:20.1,y:2.31,r:1.72,az:3.88,el:.30,focus:'outriggerMid'},
   {u:21.1,y:2.32,r:1.90,az:4.02,el:.48,focus:'beltMid'},
   {u:22.05,y:2.62,r:3.7,az:4.13,el:.55,shift:-190},
   {u:23.25,y:2.60,r:2.80,az:4.28,el:.56},
   {u:24.2,y:2.58,r:2.35,az:4.43,el:.40},
   {u:25.3,y:2.65,r:2.65,az:4.58,el:.32},
   {u:26.3,y:2.68,r:3.5,az:4.73,el:.28},
   {u:27.3,y:3.13,r:14.2,az:4.89,el:.14},
   {u:28.7,y:3.15,r:14.1,az:5.03,el:.12},
   {u:29.6,y:3.23,r:13.8,az:5.16,el:.10,shift:-110},
   {u:30.4,y:3.30,r:13.4,az:5.31,el:.13},
   {u:31.5,y:3.20,r:13.3,az:5.48,el:.16},
   {u:32.2,y:2.65,r:7.4,az:5.60,el:.10},
   {u:33.1,y:2.30,r:3.25,az:5.71,el:.08},
   {u:33.8,y:4.40,r:8.8,az:5.80,el:.16},
   {u:34.8,y:tmdY+.065,r:2.1,az:5.94,el:.23,shift:-190},
   {u:35.5,y:tmdY+.060,r:1.16,az:6.10,el:.25},
   {u:36.2,y:tmdY+.042,r:.86,az:6.32,el:.22,shift:-75},
   {u:37.3,y:tmdY-.015,r:.73,az:6.60,el:.14},
   {u:38.2,y:tmdY+.070,r:1.80,az:6.78,el:.28},
   {u:39.1,y:3.15,r:14.8,az:6.96,el:.13},
   {u:40.05,y:.7,r:3.9,az:7.10,el:.22},
   {u:41.1,y:2.00,r:3.6,az:7.26,el:.32},
   {u:42.3,y:3.65,r:4.4,az:7.43,el:.30},
   {u:43.3,y:5.03,r:5.5,az:7.61,el:.25},
   {u:44.3,y:3.14,r:14.1,az:7.78,el:.10},
   {u:45.5,y:3.12,r:14.3,az:7.96,el:.09,shift:-190},
   {u:46.7,y:3.10,r:13.9,az:8.15,el:.09},
   {u:47.8,y:3.10,r:14.8,az:8.32,el:.10},
   {u:49,y:3.10,r:15.5,az:8.50,el:.12},
  ];
  let shift=-190;
  this.keys=poses.map(p=>{if(p.shift!==undefined)shift=p.shift;const anchor=p.focus?this.anchors[p.focus]:undefined;return {t:this.timeAt(p.u),x:anchor?anchor[0]*.01:(p.x??0),y:anchor?anchor[1]*.01:p.y,z:anchor?anchor[2]*.01:(p.z??0),r:p.r,az:p.az,el:p.el,shift,focus:p.focus};});
  const times=this.keys.map(k=>k.t);for(const col of columns)this.curves[col]=flowingCurve(times,this.keys.map(k=>k[col]));
 }
 at(t:number){const c=this.curves,plan=pulse(this.timeAt(10.1),this.timeAt(10.82),this.timeAt(11.92),this.timeAt(12.58),t);const r=mix(c.r(t),.97,plan),az=c.az(t),el=mix(c.el(t),1.12,plan);const target=V(c.x(t),mix(c.y(t),1.67,plan),c.z(t));const position=target.clone().add(V(Math.cos(az)*Math.cos(el)*r,Math.sin(el)*r,Math.sin(az)*Math.cos(el)*r));return {position,target,shift:c.shift(t)};}
 apply(camera:T.PerspectiveCamera,t:number){const p=this.at(t);camera.position.copy(p.position);camera.lookAt(p.target);camera.setViewOffset(1920,1080,p.shift,0,1920,1080);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
}
