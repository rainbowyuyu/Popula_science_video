import {Timeline,clamp} from './visual';

type MolecularTiming={arrival:number;native:[number,number][];engineered:[number,number][]};
const cache=new WeakMap<Timeline,MolecularTiming>();

/** Recorded-word caption boundaries, rather than TTS file boundaries, drive
 * molecular events. A re-recording can put four clauses in a single file. */
export function molecularTiming(tl:Timeline):MolecularTiming{
 const cached=cache.get(tl);if(cached)return cached;
 const native=tl.clips.find(c=>c.id==='h026'),engineered=tl.clips.find(c=>c.id==='h027');
 if(!native||!engineered)throw new Error('Missing GLP-1 narration');
 const cue=(id:string,pattern:RegExp)=>{
  const clip=id==='h026'?native:engineered;
  const found=tl.captions.find(c=>c.start>=clip.start&&c.start<clip.end&&pattern.test(c.text));
  if(!found)throw new Error(`Missing molecular narration cue: ${id} ${pattern}`);
  return found;
 };
 const research=cue('h026',/研究者发现/),cut=cue('h026',/开头.*(切|剪)/),result=cue('h026',/少了这一小截/);
 const replacement=cue('h027',/容易被剪/),sidechain=cue('h027',/侧链/),persistence=cue('h027',/留在体内更久/),receptor=cue('h027',/原来的受体/),end=cue('h027',/作用时间/);
 const timing:MolecularTiming={
  arrival:research.start-Math.round(.2*tl.fps),
  native:[[native.start,0],[research.start-Math.round(.2*tl.fps),0],[research.start,.06],[cut.start,.20],[cut.end,.36],[result.end,.40],[native.end-1,.44]],
  engineered:[[engineered.start,.50],[replacement.start,.615],[replacement.end,.635],[sidechain.end,.84],[persistence.end,.90],[receptor.end,.94],[end.end,1],[engineered.end,1]],
 };
 for(const points of [timing.native,timing.engineered])for(let i=1;i<points.length;i++)if(points[i][0]<=points[i-1][0])throw new Error('Molecular cue order changed; realign narration before rendering');
 cache.set(tl,timing);return timing;
}

export function molecularProgress(tl:Timeline,frame:number,id:string):number|undefined{
 if(id!=='h026'&&id!=='h027')return undefined;
 const timing=molecularTiming(tl),points=id==='h026'?timing.native:timing.engineered;
 for(let i=1;i<points.length;i++)if(frame<=points[i][0]){
  const [a,x]=points[i-1],[b,y]=points[i];return x+(y-x)*clamp((frame-a)/(b-a));
 }
 return points.at(-1)![1];
}
