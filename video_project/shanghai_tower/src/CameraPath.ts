import * as T from 'three';
import {V,Timeline,mix,clamp,pulse,ramp} from './visual';
import cameraBeats from './camera-beats.json';

type Pose={u:number;y:number;r:number;az:number;el:number;x?:number;z?:number;shift?:number;focus?:string};
type Key={t:number;y:number;r:number;az:number;el:number;x:number;z:number;shift:number;focus?:string};
type Scalar='x'|'y'|'z'|'r'|'az'|'el'|'shift';
const columns:Scalar[]=['x','y','z','r','az','el','shift'];
export function towerCameraAnchors(manifest:{cameraAnchorsThree:Record<string,number[]>;parts:{id:string;groupCenterThree:number[]}[]}){
 const web=manifest.parts.find(p=>p.id==='FE_M_Z04_C03_OX1')?.groupCenterThree;
 return {...manifest.cameraAnchorsThree,...(web?{outriggerWebCenter:web}:{})};
}

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
 beatSync:{cue:number;originalTime:number;beatTime:number;offset:number}[]=[];
 constructor(public tl:Timeline){this.rebuild();}
 timeAt(u:number){const n=Math.floor(u),clip=this.tl.clips.find(c=>Number(c.id.slice(1))===n);if(!clip)return u<1?0:this.tl.duration/this.tl.fps;return mix(clip.start,clip.end,u-n)/this.tl.fps;}
 setAnchors(anchors:Record<string,number[]>){this.anchors=anchors;this.rebuild();}
 rebuild(){
  // Each cue follows the spoken object. Units are metres / 100, Y-up.
  // Architectural fly-through: approach at a low elevation, arc around the
  // opening facade, then keep a measured orbit through each close-up. Lens and
  // physical response magnification are unchanged; there is no handheld jitter.
  const tmdY=(this.anchors.TMD?.[1]??583.5)*.01;
  const poses:Pose[]=[
   // The camera follows staged originals out of a coherent tower. A compact
   // focus bay replaces the distant all-parts table; every close-up retains
   // original scale and its predecessor exits sideways before handover.
   {u:0,y:3.10,r:13.8,az:1.59,el:.22,shift:-190},
   {u:1.15,y:3.10,r:13.4,az:1.55,el:.19,shift:-160},
   {u:1.30,y:2.90,r:10.9,az:1.50,el:.21,shift:-90},
   {u:1.56,y:2.10,r:3.25,az:1.46,el:.22,focus:'inventoryDetail_outerglass',shift:120},
   {u:1.72,y:2.10,r:2.60,az:1.48,el:.19,focus:'inventoryDetail_outerglass'},
   {u:2.17,y:2.10,r:2.45,az:1.52,el:.22,focus:'inventoryDetail_outerglass'},
   {u:2.34,y:2.16,r:2.28,az:1.58,el:.55,focus:'inventoryDetail_floors'},
   {u:2.50,y:2.13,r:2.50,az:1.64,el:.68,focus:'inventoryDetail_floorbeams'},
   {u:2.63,y:2.13,r:2.38,az:1.66,el:.40,focus:'inventoryDetail_floorbeams'},
   {u:2.74,y:2.13,r:2.05,az:1.60,el:.25,focus:'inventoryDetail_columnBridge'},
   // Hold enough headroom for the tall column until it begins its lateral
   // exit. Rising to the truss early pushed its foot into the subtitle band.
   {u:2.86,y:2.13,r:2.25,az:1.51,el:.22,focus:'inventoryDetail_columnBridge'},
   {u:3.09,y:2.32,r:.80,az:1.46,el:.30,focus:'inventoryDetail_outrigger'},
   {u:3.33,y:2.32,r:.62,az:1.61,el:.24,focus:'inventoryDetail_outrigger'},
   {u:3.52,y:2.32,r:.62,az:1.75,el:.31,focus:'inventoryDetail_outrigger'},
   {u:3.64,y:2.32,r:.73,az:1.78,el:.35,focus:'inventoryDetail_belt'},
   {u:3.88,y:2.14,r:1.95,az:1.70,el:.24,focus:'inventoryDetail_megacolumn'},
   {u:4.07,y:2.13,r:2.05,az:1.61,el:.36,focus:'inventoryDetail_core'},
   {u:4.20,y:2.13,r:3.40,az:1.54,el:.39,focus:'inventoryDetail_core'},
   // Reveal the whole return bay before parts regroup. A higher, wider
   // intermediate target keeps the facade crown out of the brand margin.
   {u:4.40,y:2.75,r:8.6,az:1.49,el:.26,x:.85,z:.45,shift:-60},
   {u:4.59,y:2.28,r:11.6,az:1.48,el:.16,shift:-100},
   {u:4.80,y:2.83,r:12.9,az:1.45,el:.12,shift:-150},
   {u:4.96,y:.45,r:9.5,az:1.43,el:.17,shift:-190},
   {u:5,y:-.18,r:8.0,az:1.42,el:.20},
   {u:5.50,y:-.18,r:3.7,az:1.48,el:.16},
   {u:6.1,y:-.46,r:2.7,az:1.57,el:.08,shift:-235},
   {u:6.80,y:-.59,r:1.50,az:1.44,el:.075,x:.18,z:.3432},
   {u:7.22,y:-.59,r:1.43,az:1.38,el:.09,x:.18,z:.3432},
   {u:7.82,y:-.59,r:1.40,az:1.28,el:.105,x:.18,z:.3432},
   {u:8.45,y:-.28,r:2.3,az:1.98,el:.28},
   {u:9.1,y:-.06,r:3.2,az:2.12,el:.26},
   {u:10.25,y:1.20,r:3.1,az:2.29,el:.18},
   {u:11.15,y:1.40,r:1.55,az:2.47,el:.36,focus:'coreInterior'},
   {u:12.15,y:1.70,r:2.25,az:2.61,el:.22,focus:'coreInterior'},
   {u:13.3,y:3.0,r:11.7,az:2.75,el:.025},
   {u:14.3,y:2.02,r:2.65,az:2.93,el:.30,focus:'columnBelow',shift:-100},
   {u:15.1,y:2.30,r:1.85,az:3.10,el:.34,focus:'outriggerColumn'},
   {u:16.05,y:2.37,r:1.50,az:3.27,el:.53,focus:'floorLoad',shift:-60},
   {u:16.78,y:2.10,r:2.45,az:3.36,el:.28,focus:'columnBelow'},
   {u:17.45,y:2.31,r:1.55,az:3.47,el:.22,focus:'outriggerMid'},
   {u:18.30,y:2.31,r:1.53,az:3.77,el:.34,focus:'outriggerMid'},
   {u:19.12,y:2.351,r:.82,az:3.73,el:.27,focus:'outriggerWebCenter'},
   {u:19.55,y:2.351,r:.74,az:3.83,el:.26,focus:'outriggerWebCenter'},
   {u:20.10,y:2.351,r:.93,az:3.98,el:.30,focus:'outriggerWebCenter'},
   {u:20.50,y:2.351,r:1.04,az:4.03,el:.32,focus:'outriggerWebCenter'},
   {u:20.74,y:2.31,r:1.55,az:4.06,el:.35,focus:'outriggerColumn'},
   {u:21.15,y:2.10,r:2.0,az:4.13,el:.40,x:-.1,z:-.20},
   {u:22.05,y:2.17,r:3.05,az:4.20,el:.48,shift:-100},
   {u:23.25,y:2.60,r:2.80,az:4.25,el:.58},
   {u:24.2,y:2.58,r:2.35,az:4.28,el:.40},
   {u:25.3,y:2.65,r:2.65,az:4.29,el:.32},
   {u:26.3,y:2.68,r:3.5,az:4.26,el:.28},
   // The rounded triangular footprint needs a view from above. Raise the
   // camera over the reassembled crown before returning to the long elevation.
   {u:27.3,y:4.30,r:11.0,az:4.20,el:.92,shift:-110},
   {u:27.78,y:3.85,r:11.9,az:4.15,el:.66,shift:-70},
   {u:28.7,y:3.15,r:13.3,az:4.08,el:-.025},
   // The solved inlet is on -X. Begin on its windward three-quarter side
   // to see positive Cp and side suction together, then orbit toward the
   // cross-wind view so the longitudinal wake section has a readable width.
   {u:29.6,y:3.23,r:13.0,az:4.02,el:.22,shift:-110},
   // Read each horizontal section from above at its actual elevation.
   // The camera climbs through the same tower instead of cutting to a
   // disconnected contour image, then withdraws to the vertical section.
   {u:30.10,y:1.0,r:4.65,az:4.10,el:.78,shift:-105},
   {u:30.354,y:1.0,r:4.35,az:4.24,el:.90},
   {u:30.46,y:3.0,r:4.45,az:4.38,el:.84},
   {u:30.678,y:3.0,r:4.25,az:4.52,el:.92},
   {u:30.785,y:5.0,r:4.40,az:4.66,el:.86},
   {u:30.96,y:5.0,r:4.55,az:4.80,el:.80},
   // Leave space above the crown for the actual vertical CFD section.
   // The roof sits near y=200 px, instead of against the old top mask.
   {u:31.2,y:3.65,r:12.5,az:4.88,el:.27,shift:-100},
   {u:31.5,y:3.65,r:12.3,az:5.02,el:.23},
   // Hold the full exterior through the first half of s032 while the line
   // "比较不同的外形" is spoken, then travel inward on the following clause.
   {u:32.2,y:3.05,r:11.5,az:5.2,el:.22},
   {u:32.62,y:2.78,r:8.9,az:5.44,el:.14},
   {u:33.1,y:2.30,r:3.25,az:5.71,el:.08},
   {u:33.8,y:4.40,r:8.8,az:5.80,el:.16},
   {u:34.8,y:tmdY+.065,r:2.1,az:5.94,el:.23,shift:-190},
   {u:35.5,y:tmdY+.060,r:1.16,az:6.10,el:.29},
   {u:36.2,y:tmdY+.042,r:.86,az:6.32,el:.25,shift:-75},
   {u:37.3,y:tmdY-.015,r:.73,az:6.60,el:.17},
   {u:38.2,y:tmdY+.070,r:2.80,az:6.78,el:.28},
   {u:38.60,y:4.3,r:7.4,az:6.86,el:.21},
   {u:39.1,y:3.15,r:14.8,az:6.96,el:.13},
   {u:40.05,y:.7,r:3.9,az:7.10,el:.22},
   {u:41.1,y:2.00,r:3.6,az:7.26,el:.35},
   {u:42.3,y:3.65,r:4.4,az:7.43,el:.34},
   {u:43.3,y:5.03,r:5.5,az:7.61,el:.25},
   {u:44.3,y:3.14,r:13.8,az:7.78,el:.015},
   {u:45.5,y:3.12,r:13.2,az:8.02,el:-.035,shift:-190},
   {u:46.7,y:3.10,r:13.5,az:8.27,el:-.065},
   {u:47.8,y:3.10,r:14.1,az:8.49,el:-.025},
   {u:49,y:3.10,r:15.2,az:8.76,el:.075},
  ];
  // A few scene arrivals may land on a measured musical beat. This adjusts
  // knot timing by at most 0.22 s and then rebuilds the same C2 path; there is
  // no per-beat zoom, shake, or force-data retiming. Stale music is ignored.
  const musicalCues=new Set([2.8,3.3,6.8,14.3,18.3,19.55,22.05,27.3,29.6,31.5,35.5,40.05,43.3,44.3,47.8]);
  const beats:number[]=cameraBeats.timelineFrames===this.tl.duration&&/^[a-f0-9]{64}$/i.test(cameraBeats.musicSHA256)?cameraBeats.beats.filter(Number.isFinite):[];
  this.beatSync=[];let shift=-190;
  this.keys=poses.map(p=>{if(p.shift!==undefined)shift=p.shift;const anchor=p.focus?this.anchors[p.focus]:undefined;let time=this.timeAt(p.u);
   if(musicalCues.has(p.u)&&beats.length){const beat=beats.reduce((a,b)=>Math.abs(b-time)<Math.abs(a-time)?b:a);if(Math.abs(beat-time)<=.22){this.beatSync.push({cue:p.u,originalTime:time,beatTime:beat,offset:beat-time});time=beat;}}
   return {t:time,x:anchor?anchor[0]*.01:(p.x??0),y:anchor?anchor[1]*.01:p.y,z:anchor?anchor[2]*.01:(p.z??0),r:p.r,az:p.az,el:p.el,shift,focus:p.focus};});
  const times=this.keys.map(k=>k.t);for(const col of columns)this.curves[col]=flowingCurve(times,this.keys.map(k=>k[col]));
  // In the opening's cross-scale table move, log-radius interpolation keeps
  // the apparent zoom speed even. Blend back before the established close-ups.
  const radius=this.curves.r,logRadius=flowingCurve(times,this.keys.map(k=>Math.log(k.r)));
  this.curves.r=t=>mix(radius(t),Math.exp(logRadius(t)),1-ramp(this.timeAt(4.97),this.timeAt(5.50),t));
 }
 at(t:number){const c=this.curves,plan=pulse(this.timeAt(10.1),this.timeAt(10.82),this.timeAt(11.78),this.timeAt(12.58),t);const r=mix(c.r(t),.97,plan),az=c.az(t),el=mix(c.el(t),1.12,plan);const target=V(c.x(t),mix(c.y(t),1.67,plan),c.z(t));const position=target.clone().add(V(Math.cos(az)*Math.cos(el)*r,Math.sin(el)*r,Math.sin(az)*Math.cos(el)*r));const roll=-.018*pulse(this.timeAt(1.1),this.timeAt(1.65),this.timeAt(3.85),this.timeAt(4.65),t);return {position,target,shift:c.shift(t),roll};}
 apply(camera:T.PerspectiveCamera,t:number){const p=this.at(t);camera.position.copy(p.position);camera.lookAt(p.target);camera.rotateZ(p.roll);camera.setViewOffset(1920,1080,p.shift,0,1920,1080);camera.updateProjectionMatrix();camera.updateMatrixWorld();}
}

