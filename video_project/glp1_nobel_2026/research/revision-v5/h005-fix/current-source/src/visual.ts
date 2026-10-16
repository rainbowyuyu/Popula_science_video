import * as T from 'three';
export const C={paper:'#f2eee7',ink:'#29484a',teal:'#367f83',aqua:'#8cbdba',red:'#b44f48',rose:'#d49389',pale:'#eac6b5',gold:'#c9a151',bone:'#eee5d6'};
export const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export const clamp=(x:number)=>Math.max(0,Math.min(1,x));
export const smooth=(x:number)=>{const u=clamp(x);return u*u*u*(u*(u*6-15)+10)};
export const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
export function mat(color:T.ColorRepresentation,opacity=1,roughness=.40){const m=new T.MeshStandardMaterial({color,roughness,metalness:.05,transparent:true,opacity,depthWrite:opacity>.9});m.userData.baseOpacity=opacity;return m;}
export function ball(r:number,color:T.ColorRepresentation,opacity=1){return new T.Mesh(new T.SphereGeometry(r,28,20),mat(color,opacity));}
export function tube(points:T.Vector3[],radius:number,color:T.ColorRepresentation,opacity=1){const curve=new T.CatmullRomCurve3(points);return new T.Mesh(new T.TubeGeometry(curve,Math.max(40,points.length*6),radius,10,false),mat(color,opacity));}
export function cylinder(r:number,h:number,color:T.ColorRepresentation){return new T.Mesh(new T.CylinderGeometry(r,r,h,48),mat(color));}
export function visibility(o:T.Object3D,k:number){o.visible=k>.0001;o.traverse(n=>{if(n instanceof T.Mesh||n instanceof T.Line){const ms=Array.isArray(n.material)?n.material:[n.material];for(const m of ms){if(m.userData.baseOpacity===undefined)m.userData.baseOpacity=m.opacity;m.opacity=k*m.userData.baseOpacity;m.transparent=true;m.depthWrite=m.opacity>.96}}});}
export type Section={id:string;start:number;end:number};
export type Clip={id:string;section:string;text:string;caption:string;start:number;end:number;duration:number};
export type Timeline={fps:number;duration:number;clips:Clip[];sections:Section[];captions:{text:string;start:number;end:number}[]};
export type FrameState={frame:number;time:number;section:string;progress:number;elapsed:number;clip:Clip;clipProgress:number};
export function stateAt(frame:number,tl:Timeline):FrameState{const s=tl.sections.find(s=>frame>=s.start&&frame<s.end)??(frame<tl.sections[0].start?tl.sections[0]:tl.sections[tl.sections.length-1]);const c=tl.clips.filter(c=>c.start<=frame).at(-1)??tl.clips[0];return{frame,time:frame/tl.fps,section:s.id,progress:clamp((frame-s.start)/(s.end-s.start)),elapsed:(frame-s.start)/tl.fps,clip:c,clipProgress:clamp((frame-c.start)/(c.end-c.start))};}
export function sectionWeight(frame:number,id:string,tl:Timeline,ramp=60){return Math.max(0,...tl.sections.filter(s=>s.id===id).map(s=>smooth((frame-s.start+ramp)/ramp)*(1-smooth((frame-s.end)/ramp))));}
export type Label={text:string;point:T.Vector3;color?:string;side?:'left'|'right';weight?:number};
