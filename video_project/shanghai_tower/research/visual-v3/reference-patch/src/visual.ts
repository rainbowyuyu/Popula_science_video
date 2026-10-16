import * as T from 'three';
export const C={paper:'#f3f1ec',ink:'#18303b',teal:'#27869a',gold:'#bd965a',red:'#ce654a',muted:'#52656e'};
export const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
export const clamp=(v:number)=>Math.max(0,Math.min(1,v));
export const smooth=(v:number)=>{const t=clamp(v);return t*t*t*(t*(t*6-15)+10)};
export const mix=(a:number,b:number,t:number)=>a+(b-a)*t;
export type Clip={id:string;section:string;text:string;caption:string;start:number;end:number;duration:number};
export type Timeline={fps:number;duration:number;clips:Clip[];sections:{id:string;start:number;end:number}[];captions:{text:string;start:number;end:number}[]};
export type State={frame:number;time:number;section:string;p:number;clip:Clip;n:number;u:number};
export const stateAt=(frame:number,tl:Timeline):State=>{const s=tl.sections.find(s=>frame>=s.start&&frame<s.end)??(frame<tl.sections[0].start?tl.sections[0]:tl.sections.at(-1)!);const clip=tl.clips.filter(s=>frame>=s.start).at(-1)??tl.clips[0];return {frame,time:frame/tl.fps,section:s.id,p:clamp((frame-s.start)/(s.end-s.start)),clip,n:Number(clip.id.slice(1)),u:clamp((frame-clip.start)/(clip.end-clip.start))}};
export const ramp=(a:number,b:number,v:number)=>smooth((v-a)/(b-a));
export const pulse=(a:number,b:number,c:number,d:number,v:number)=>ramp(a,b,v)*(1-ramp(c,d,v));
export function channel(keys:number[][],t:number){if(t<=keys[0][0])return keys[0][1];for(let i=1;i<keys.length;i++)if(t<=keys[i][0])return mix(keys[i-1][1],keys[i][1],smooth((t-keys[i-1][0])/(keys[i][0]-keys[i-1][0])));return keys.at(-1)![1]}
export type Label={text:string;point:T.Vector3;side?:'left'|'right';color?:string;weight?:number};
