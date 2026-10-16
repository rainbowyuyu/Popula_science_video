/** Purposeful, C2-continuous camera choreography. Input is 0–300 scene seconds,
 * not physical narration time. Film owns the measured narration→scene map. */
export type Vec3V6 = [number,number,number];
export type CameraPhaseV6 = 'establish'|'detail'|'handoff';
export type StationV6 = {id:string;start:number;end:number;origin:Vec3V6};
export type CameraSampleV6 = {
 position:Vec3V6;target:Vec3V6;fov:number;focusDistance:number;rollDeg:number;
 stationIndex:number;transition:number;shotId:string;phase:CameraPhaseV6;
};
export const STATIONS_V6:StationV6[]=[
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
type CameraKeyV6={time:number;position:Vec3V6;target:Vec3V6;fov:number;rollDeg:number;shotId:string;phase:CameraPhaseV6};
const k=(time:number,station:number,p:Vec3V6,target:Vec3V6,fov:number,shotId:string,phase:CameraPhaseV6,rollDeg=0):CameraKeyV6=>({
 time,position:[p[0]+station*20,p[1],p[2]],target:[target[0]+station*20,target[1],target[2]],fov,shotId,phase,rollDeg,
});

export const CAMERA_KEYS_V6:CameraKeyV6[]=[
 // The film starts on the object, not on an empty room. The first macro move
 // follows the very same data leaving the phone and approaching the droplet.
 k(0,0,[-3.7,1.5,9.5],[-1.95,.25,.25],39,'memory-establish','establish',-.25),
 k(3.6,0,[-2.7,1.45,9.4],[-1.75,.25,.25],39,'memory-breakup','detail',-.1),
 k(8.3,0,[2.3,1.55,7.1],[2.65,.45,0],39,'follow-data','detail',.15),
 k(11.2,0,[4.05,1.3,5.7],[3.0,.1,0],39,'droplet-macro','detail',.15),
 k(15,0,[4.4,3.35,14.8],[1.25,.4,0],41,'hook-release','handoff',.25),

 k(21,1,[-3.25,3.0,14.3],[-.45,.4,0],40.5,'encode-establish','establish',-.2),
 k(29,1,[-4.3,2.2,10.6],[-2.6,.45,.25],39,'two-bits-one-base','detail',0),
 k(33.5,1,[-2.0,2.0,11.3],[-1.8,.4,.1],40,'follow-base-transfer','detail',.1),
 k(37.8,1,[5.15,2.0,14.4],[2.75,.35,0],40.5,'helix-assembly','detail',.15),
 k(41,1,[3.3,3.2,14.7],[.5,.4,0],41,'encode-release','handoff',.25),

 k(47,2,[-3.1,3.2,14.3],[.0,.35,0],40.5,'constraint-establish','establish',-.2),
 k(52,2,[-1.2,2.1,12.8],[.3,.25,.1],39.5,'composition-check','detail',0),
 k(60.5,2,[4.15,3.0,12.8],[1.05,.5,0],40,'inspect-rejection-lane','detail',.15),
 k(67,2,[1.7,1.7,11.3],[-.4,.15,.25],40,'address-on-package','detail',0),
 k(72,2,[3.2,3.4,14.8],[.3,.4,0],41,'constraint-release','handoff',.2),

 // A diagram is never orbited from behind. Full graph nodes stay in frame
 // while recovery shifts the visual weight from the left source to the right.
 k(78,3,[-3.8,3.75,14.4],[.0,.5,0],41,'fountain-establish','establish',-.25),
 k(86,3,[-2.15,1.7,12.7],[.0,.55,0],40,'fountain-full-graph','detail',-.1),
 k(96,3,[.0,1.6,12.8],[.1,.6,0],39.5,'fountain-missing-links','detail',0),
 k(103,3,[1.35,2.0,12.95],[.2,.75,0],39.5,'recover-b-relationship','detail',.1),
 k(108.5,3,[3.15,2.55,13.3],[.45,.75,0],40,'recover-c-relationship','detail',.15),
 k(115,3,[4.15,4.0,14.9],[.4,.6,0],41,'fountain-release','handoff',.25),

 // The wet lab first shows the route, then looks along the nozzle, over the
 // flow cell, and at three read lanes. These are intentional scale changes.
 k(121,4,[-4.5,6.0,14.0],[-1.1,-.5,-.2],43,'wetlab-establish','establish',-.25),
 k(124,4,[-5.0,3.1,10.0],[-3.7,1.05,.1],39.5,'synthesis-nozzle','detail',-.1),
 k(130.4,4,[-5.3,2.4,10.6],[-3.2,.2,0],40,'stored-molecule','detail',0),
 k(138,4,[-1.35,5.25,11.0],[.0,-.65,-.3],42,'read-flowcell','detail',.1),
 k(143,4,[6.6,2.2,10.1],[4.3,.75,1],39,'read-error-lanes','detail',.05),
 k(153,4,[3.25,1.9,9.9],[4.3,.75,1],39,'read-error-comparison','detail',0),
 k(157,4,[3.6,4.4,14.8],[.6,.4,0],41,'wetlab-release','handoff',.25),

 // Calibrated to the measured 321.8 s narration on 2026-10-11. The
 // Chinese analogy stays whole until n21 ends; n25–26 retain the matrix.
 k(162.4,5,[-2.2,2.45,11.4],[.0,.3,.4],40.5,'consensus-establish','establish',-.2),
 k(168.1,5,[.5,1.7,10.0],[.0,.25,.4],40,'copying-analogy','detail',-.05),
 k(172.8,5,[-4.25,1.7,9.25],[-3.2,.45,.4],39,'read-bucket','detail',0),
 k(177.3,5,[-3.3,1.8,9.8],[-2.9,.45,.4],39.5,'compare-read-offsets','detail',.05),
 k(184.3,5,[-.35,2.0,11.9],[.3,.4,0],40,'alignment-full-context','detail',0),
 k(190.2,5,[1.65,2.4,11.2],[.15,.55,0],40,'matrix-backtrace','detail',.1),
 k(197.0,5,[.8,2.15,11.4],[.15,.55,0],40,'matrix-explanation','detail',.05),
 k(203.5,5,[1.3,2.2,12.2],[-.2,.2,0],40,'weighted-consensus','detail',0),
 k(208.2,5,[.25,2.5,12.3],[-.15,.3,0],40,'evidence-merged','detail',.05),
 k(213,5,[3.1,3.5,14.8],[.4,.5,0],41,'consensus-release','handoff',.2),

 k(219,6,[-3.2,3.4,14.4],[.25,.5,0],40.5,'model-establish','establish',-.2),
 k(228,6,[-2.6,2.0,10.6],[-1.65,1.1,0],39.5,'sequence-tokenization','detail',-.1),
 k(239,6,[3.2,2.3,12.9],[.85,.35,-.1],39,'network-candidate-score','detail',.1),
 k(249,6,[.0,3.0,12.8],[1.1,.45,0],40,'constraint-observation-loop','detail',.15),
 k(259,6,[3.25,3.5,14.8],[.5,.5,0],41,'model-release','handoff',.25),

 k(265,7,[-2.3,2.3,12.0],[-1.6,.25,.25],40,'return-establish','establish',-.15),
 k(270,7,[-3.5,1.5,9.55],[-1.95,.25,.25],39,'data-back-to-memory','detail',-.05),
 k(280,7,[-.7,1.6,9.6],[-1.8,.25,.25],39,'memory-restored','detail',.1),
 k(287,7,[3.2,3.4,14.9],[.5,.45,0],41,'return-release','handoff',.2),

 k(293,8,[-1.7,3.15,15.9],[-.1,.45,0],40.5,'evidence-settle','establish',-.1),
 k(296,8,[-1.45,3.10,15.75],[-.1,.45,0],40.5,'evidence-hold','detail',0),
 k(300,8,[-1.2,3.05,15.6],[-.05,.45,0],40.5,'evidence-end','detail',0),
];

const harmonicTangent=(before:number,after:number)=>{
 if(before*after<=0)return 0;
 const harmonic=2*before*after/(before+after);
 return Math.sign(harmonic)*Math.min(Math.abs(harmonic),1.4*Math.min(Math.abs(before),Math.abs(after)));
};
const tangent=(index:number,pick:(k:CameraKeyV6)=>number)=>{
 if(index===0)return (pick(CAMERA_KEYS_V6[1])-pick(CAMERA_KEYS_V6[0]))/(CAMERA_KEYS_V6[1].time-CAMERA_KEYS_V6[0].time)*.4;
 if(index===CAMERA_KEYS_V6.length-1)return 0;
 const a=CAMERA_KEYS_V6[index-1],b=CAMERA_KEYS_V6[index],c=CAMERA_KEYS_V6[index+1];
 return harmonicTangent((pick(b)-pick(a))/(b.time-a.time),(pick(c)-pick(b))/(c.time-b.time));
};
const quintic=(a:number,b:number,va:number,vb:number,u:number,span:number)=>{
 const u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
 return (1-10*u3+15*u4-6*u5)*a+(u-6*u3+8*u4-3*u5)*span*va+(10*u3-15*u4+6*u5)*b+(-4*u3+7*u4-3*u5)*span*vb;
};
const clamp=(n:number,lo:number,hi:number)=>Math.max(lo,Math.min(hi,n));
const sampleTrack=(i:number,u:number,span:number,pick:(k:CameraKeyV6)=>number)=>quintic(pick(CAMERA_KEYS_V6[i]),pick(CAMERA_KEYS_V6[i+1]),tangent(i,pick),tangent(i+1,pick),u,span);
/** Returns a pure pose; all key endpoints share velocity and zero acceleration. */
export function sampleCameraV6(sceneSeconds:number):CameraSampleV6{
 const t=Number.isFinite(sceneSeconds)?clamp(sceneSeconds,0,300):0;
 let i=0;while(i<CAMERA_KEYS_V6.length-2&&t>CAMERA_KEYS_V6[i+1].time)i++;
 const a=CAMERA_KEYS_V6[i],b=CAMERA_KEYS_V6[i+1],span=b.time-a.time,u=clamp((t-a.time)/span,0,1);
 const position=[0,1,2].map(axis=>sampleTrack(i,u,span,key=>key.position[axis])) as Vec3V6;
 const target=[0,1,2].map(axis=>sampleTrack(i,u,span,key=>key.target[axis])) as Vec3V6;
 const station=STATIONS_V6.findIndex(s=>t<s.end),stationIndex=station<0?8:station;
 const boundary=STATIONS_V6.slice(1).find(s=>t>=s.start-3&&t<=s.start+3);
 const transition=boundary?(()=>{const q=(t-boundary.start+3)/6;return q*q*q*(q*(q*6-15)+10);})():0;
 const active=u<.5?a:b;
 return {position,target,fov:sampleTrack(i,u,span,key=>key.fov),focusDistance:Math.hypot(...position.map((v,axis)=>v-target[axis])),rollDeg:sampleTrack(i,u,span,key=>key.rollDeg),stationIndex,transition,shotId:active.shotId,phase:boundary?'handoff':active.phase};
}

/** Explicit geometry envelopes for automated projection checks. Coordinates
 * are local to the given station. Full graph windows must preserve all nodes;
 * detail windows may crop contextual objects outside the named envelope. */
export const FOCUS_WINDOWS_V6={
 memory:{station:0,start:0,end:3.7,min:[-5.10,-1.78,.0],max:[1.10,1.98,.8],intent:'detail'},
 droplet:{station:0,start:10.4,end:11.8,min:[1.82,-.8,-1.18],max:[4.18,1.56,1.18],intent:'macro'} ,
 bitPairs:{station:1,start:27.2,end:30.4,min:[-4.75,-2.0,-.1],max:[-.55,2.95,.55],intent:'detail'},
 helix:{station:1,start:37.1,end:39,min:[1.3,-3.25,-1.1],max:[4.2,3.95,1.1],intent:'detail'},
 constraints:{station:2,start:51,end:54,min:[-4.7,-2.6,-.5],max:[5.0,3.5,1],intent:'full'},
 fountain:{station:3,start:83,end:111,min:[-4.7,-2.2,-1.2],max:[4.85,3.9,1],intent:'full'},
 errorLanes:{station:4,start:143,end:153.5,min:[.1,-1.2,.65],max:[4.9,2.95,1.35],intent:'detail'},
 analogy:{station:5,start:162.4,end:168.8,min:[-3.57,-1.85,.45],max:[3.57,2.15,.85],intent:'full'},
 reads:{station:5,start:171.5,end:178.5,min:[-5.4,-1.6,.15],max:[-1.0,2.45,.65],intent:'detail'},
 alignment:{station:5,start:183,end:185.5,min:[-5.5,-1.7,-.5],max:[4.9,2.8,.65],intent:'full'},
 matrix:{station:5,start:188.5,end:199.4,min:[-5.5,-1.7,-.5],max:[4.95,2.9,.65],intent:'full'},
 consensus:{station:5,start:202,end:209,min:[-5.5,-2.4,-1.7],max:[5,2.85,1.35],intent:'full'},
 model:{station:6,start:237,end:241,min:[-4.65,-2.25,-2.2],max:[5.15,3.4,.8],intent:'full'},
 memoryReturn:{station:7,start:265,end:283,min:[-5.10,-1.78,.0],max:[1.10,1.98,.8],intent:'detail'},
} satisfies Record<string,{station:number;start:number;end:number;min:Vec3V6;max:Vec3V6;intent:string}>;
export const sampleCamera=sampleCameraV6;
export const STATIONS=STATIONS_V6;
