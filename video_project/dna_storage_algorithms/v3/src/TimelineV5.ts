import narration from './narration-v5.json';
import legacy from './narration.json';

/** Physical audio time and scene time are separate. Audio is never stretched.
 * A C2 monotone map retimes camera/model choreography to measured chapter
 * lengths, retaining shared speed and zero acceleration at chapter joins. */
const groups=narration.groups;
const oldGroups=legacy.groups;
const points=groups.map(g=>({x:g.startSec,y:oldGroups.find(o=>o.id===g.id)!.startSec}));
const last=groups[groups.length-1];
points.push({x:last.endSec,y:290});
points.push({x:narration.durationSec,y:300});
const rates=points.slice(0,-1).map((p,i)=>(points[i+1].y-p.y)/(points[i+1].x-p.x));
const slopes=points.map((_,i)=>i===0?rates[0]:i===points.length-1?rates[rates.length-1]:2/(1/rates[i-1]+1/rates[i]));
export const durationInFramesV5=Math.round(narration.durationSec*30);
export const durationSecondsV5=durationInFramesV5/30;
export const timeMapKnots=points;
export function sceneTimeV5(seconds:number):number {
 const t=Math.max(0,Math.min(narration.durationSec,Number.isFinite(seconds)?seconds:0));
 let i=0;while(i<points.length-2&&t>points[i+1].x)i++;
 const a=points[i],b=points[i+1],span=b.x-a.x,u=(t-a.x)/span;
 const u2=u*u,u3=u2*u,u4=u3*u,u5=u4*u;
 return (1-10*u3+15*u4-6*u5)*a.y+(u-6*u3+8*u4-3*u5)*span*slopes[i]
  +(10*u3-15*u4+6*u5)*b.y+(-4*u3+7*u4-3*u5)*span*slopes[i+1];
}
export const sceneNarrationV5={...narration,cues:narration.cues.map(c=>({...c,
 startSec:sceneTimeV5(c.startSec),endSec:sceneTimeV5(c.endSec)}))};
