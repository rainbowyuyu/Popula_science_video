import main from './audio-timeline.json';
import vertical from './audio-timeline-vertical.json';
import original from '../timeline.json';
import {stateAt,smooth,Timeline,clamp} from '../visual';
export type EditAspect='16:9'|'9:16';
export const originalTimeline=original as Timeline;
export function editTimeline(aspect:EditAspect){return aspect==='9:16'?vertical:main;}
export type V16CameraTransition={
 mode:'travel'|'sky-whip'; startFrame:number; endFrame:number; progress:number;
 sourceFrom:number; sourceTo:number; hiddenCut:boolean; labelOpacity:number;
 /** Whole source ranges are NOT fast-forwarded during an editorial skip. */
 sourceSpeedup:number;
};

/** Integrate a nonnegative velocity, retaining unit velocity and zero
 * acceleration at both speech handles whenever distance permits. A long
 * observation with only a few source frames uses two short C2 speed ramps
 * and a middle hold; a quintic correction alone would run backwards. */
export function monotoneSourceBridge(a:number,b:number,elapsed:number,duration:number){
 const d=Math.max(0,b-a),g=Math.max(1,duration),f=Math.max(0,Math.min(g,elapsed));
 if(d===0)return a;
 if(d/g>=.5){const q=f/g;return a+f+(d-g)*smooth(q);}
 const h=d,integral=(q:number)=>q-q**6+3*q**5-2.5*q**4;
 if(f<h)return a+h*integral(f/h);
 if(f>g-h)return b-h*integral((g-f)/h);
 return a+d/2;
}

export function transitionAt(frame:number,aspect:EditAspect):V16CameraTransition|null{
 const tl=editTimeline(aspect),segments=tl.sceneSegments;
 const i=segments.findIndex(x=>frame>=x.voiceEnd&&frame<x.end);
 if(i<0||i>=segments.length-1)return null;
 const seg=segments[i],next=segments[i+1],startFrame=seg.voiceEnd,endFrame=next.start;
 const gap=Math.max(1,endFrame-startFrame);
 const sourceFrom=Math.min(seg.sourceEnd+1,seg.sourceStart+seg.voiceEnd-seg.start);
 const sourceTo=next.sourceStart,delta=Math.max(0,sourceTo-sourceFrom),progress=clamp((frame-startFrame)/gap);
 // Up to 6x is permitted only over short geometry changes. Larger edit gaps use
 // an explicit off-screen join rather than flashing every intervening cue.
 const mode=delta>Math.max(80,6*gap)?'sky-whip':'travel';
 const labelOpacity=mode==='sky-whip'?1-smooth(Math.min(progress/.18,(1-progress)/.18)):1;
 return {mode,startFrame,endFrame,progress,sourceFrom,sourceTo,hiddenCut:mode==='sky-whip'&&progress>=.5,
  labelOpacity,sourceSpeedup:delta/gap};
}

/** State is on the ORIGINAL narration/solver time axis. Unit-rate audio and
 * geometrical detail therefore agree. Big editorial jumps switch only while
 * the V16 camera has driven the old structure completely outside the frame.
 * Such joins are intentional hidden cuts, not claimed globally C2 motion. */
export function sourceFrameAt(frame:number,aspect:EditAspect){
 const tl=editTimeline(aspect),segments=tl.sceneSegments,first=segments[0];
 if(frame<first.start)return first.sourceStart*Math.max(0,frame)/Math.max(1,first.start);
 let i=segments.findIndex(x=>frame>=x.start&&frame<x.end);
 if(i<0)i=segments.length-1;
 const seg=segments[i],next=segments[i+1];
 if(frame<seg.voiceEnd)return Math.min(seg.sourceEnd+1,seg.sourceStart+frame-seg.start);
 const a=Math.min(seg.sourceEnd+1,seg.sourceStart+seg.voiceEnd-seg.start);
 const end=next?.start??tl.duration,gap=Math.max(1,end-seg.voiceEnd),b=next?.sourceStart??Math.min(original.duration-1,a+gap);
 const transition=transitionAt(frame,aspect);
 if(transition?.mode==='sky-whip')return transition.progress<.5?a:b;
 return monotoneSourceBridge(a,b,frame-seg.voiceEnd,gap);
}
export function sourceStateAt(frame:number,aspect:EditAspect){return stateAt(sourceFrameAt(frame,aspect),originalTimeline);}
