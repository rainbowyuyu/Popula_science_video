import data from './timeline.json';
export type Clip={id:string;scene:string;text:string;spoken:string;start:number;end:number;duration:number};
export type Scene={id:string;start:number;end:number};
export type Timeline={fps:number;duration:number;seconds:number;clips:Clip[];captions:{start:number;end:number;text:string}[];scenes:Scene[]};
// Source timing is measured audio seconds. All runtime motion uses integer frames.
const source=data as unknown as Timeline;
const f=(seconds:number)=>Math.round(seconds*source.fps);
export const timeline:Timeline={...source,
 clips:source.clips.map(c=>({...c,start:f(c.start),end:f(c.end),duration:f(c.end)-f(c.start)})),
 captions:source.captions.map(c=>({...c,start:f(c.start),end:f(c.end)})),
 scenes:source.scenes.map((s,i,a)=>({...s,start:f(s.start),end:i<a.length-1?f(a[i+1].start):source.duration}))};
export const clamp=(x:number)=>Math.min(1,Math.max(0,x));
export const ease=(x:number)=>{x=clamp(x);return x*x*x*(x*(x*6-15)+10)};
export function stateAt(frame:number){
 const scenes=timeline.scenes??[];const sc=scenes.find(s=>frame>=s.start&&frame<s.end)??scenes.at(-1)??{id:'street',start:0,end:9000};
 const group=timeline.clips.filter(c=>c.scene===sc.id);const clip=group.filter(c=>frame>=c.start).at(-1)??group[0];
 return {scene:sc.id,progress:clamp((frame-sc.start)/(sc.end-sc.start)),time:frame/30,frame,sceneStart:sc.start,sceneEnd:sc.end,line:Math.max(0,group.findIndex(c=>c.id===clip?.id)),lineProgress:clip?clamp((frame-clip.start)/clip.duration):1,clip};
}
export type FrameState=ReturnType<typeof stateAt>;
