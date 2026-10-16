import story from './launch-v20-story.json';
export const fps=60;
export const durationInFrames=story.duration;
export const clamp=(v:number)=>Math.min(1,Math.max(0,v));
export const ease=(v:number)=>{v=clamp(v);return v*v*v*(v*(v*6-15)+10)};
export const ramp=(t:number,a:number,b:number)=>ease((t-a)/Math.max(.001,b-a));
export const span=(id:string)=>{const s=story.scenes.find(s=>s.id===id);if(!s)throw Error('Missing v20 scene '+id);return {start:s.start/fps,end:(s.start+s.duration)/fps,duration:s.duration/fps};};
const nativeBoundaries=[0,12,25.5,31.5,34.5,36.3,38.2,40.5,55.5,62,65,68,72,88,97,105];
export const timeKeys=story.scenes.map((s,i)=>({x:s.start/fps,y:nativeBoundaries[i]})).concat([{x:story.duration/fps,y:105}]);
// Monotone cubic Hermite map: physical route is preserved, pauses are removed,
// and camera velocity is continuous at every narration boundary.
const slopes=timeKeys.slice(1).map((k,i)=>(k.y-timeKeys[i].y)/(k.x-timeKeys[i].x));
const tangents=timeKeys.map((_,i)=>i===0?slopes[0]:i===slopes.length?slopes.at(-1)!:2/(1/slopes[i-1]+1/slopes[i]));
export function worldTime(t:number){
 const i=Math.min(timeKeys.length-2,Math.max(0,timeKeys.findLastIndex(k=>t>=k.x))),a=timeKeys[i],b=timeKeys[i+1],h=b.x-a.x,u=clamp((t-a.x)/h);
 return (2*u*u*u-3*u*u+1)*a.y+(u*u*u-2*u*u+u)*h*tangents[i]+(-2*u*u*u+3*u*u)*b.y+(u*u*u-u*u)*h*tangents[i+1];
}
export function sheetCover(w:number){
 return Math.max(...[[24.4,26.6],[39.4,41.6],[54.4,56.6],[96.23,97.77]].map(([a,b])=>ramp(w,a-.35,a+.25)*(1-ramp(w,b-.25,b+.35))));
}
