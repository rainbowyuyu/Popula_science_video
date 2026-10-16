import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import * as T from 'three';

// CPU-only. This script does not launch a browser, render frames, or write production files.
const out=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(out,'../../..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,''));
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const guard=read('research/revision-v5/h005-fix/source-guard.json');
for(const [p,h] of Object.entries(guard.sourceSHA256))if(sha(p)!==h)throw new Error(`Frozen source changed: ${p}`);
const timeline=read('src/timeline.json');
const manifest=read('public/models/manifest.json');
const oldMetrics=read('research/revision-v5/camera-audit/metrics.json');
const anchors={...oldMetrics.anchors};
// These are the actual three organ targets; current World/V5World never replaces them.
for(const key of ['stomach','small_intestine','liver'])anchors[key]=manifest.assets[key].center;
anchors.torso=[0,1.26,.02];
const anchorObject=()=>Object.fromEntries(Object.entries(anchors).map(([k,v])=>[k,new T.Vector3(...v)]));
async function load(name){
 const source=fs.readFileSync(path.join(out,`V5CameraPath.${name}.ts`),'utf8');
 const target=path.join(out,`camera-${name}.mjs`);
 await build({stdin:{contents:source,resolveDir:path.join(root,'src'),sourcefile:`V5CameraPath.${name}.ts`,loader:'ts'},bundle:true,format:'esm',platform:'node',external:['three'],outfile:target,logLevel:'silent'});
 return import(pathToFileURL(target).href);
}
const [base,candidate]=await Promise.all([load('baseline'),load('candidate')]);
const a=new base.V5CameraPath(anchorObject(),timeline), b=new candidate.V5CameraPath(anchorObject(),timeline);
const smooth=x=>{const u=Math.max(0,Math.min(1,x));return u*u*u*(u*(u*6-15)+10);};
function viewWeight(frame,view,viewOf){
 let weight=0;
 timeline.clips.forEach((clip,i)=>{
  if(view!==viewOf(clip))return;
  const before=timeline.clips[i-1],after=timeline.clips[i+1];
  const start=clip.start-(before?.duration??120)*.38,end=clip.end+(after?.duration??120)*.58;
  const enter=i===0?1:smooth((frame-start)/Math.max(45,(before?.duration??120)*.35));
  const exit=1-smooth((frame-clip.end)/Math.max(75,end-clip.end));
  weight=Math.max(weight,enter*exit);
 });
 return weight;
}
const distance=(p,q)=>Math.max(p.position.distanceTo(q.position),p.target.distanceTo(q.target),p.focus.distanceTo(q.focus),Math.abs(p.distance-q.distance),Math.abs(p.az-q.az),Math.abs(p.el-q.el));
const changedCamera=[],changedWeight=[],changedLabels=[],details=[];
let peak={delta:0,frame:null};
for(let frame=0;frame<timeline.duration;frame++){
 const pa=a.sample(frame),pb=b.sample(frame),delta=distance(pa,pb);
 if(delta>1e-12)changedCamera.push(frame);
 if(delta>peak.delta)peak={delta,frame};
 const weightDelta=Math.max(...['stomach','gut'].map(v=>Math.abs(viewWeight(frame,v,base.viewOf)-viewWeight(frame,v,candidate.viewOf))));
 if(weightDelta>1e-12)changedWeight.push(frame);
 const clip=timeline.clips.find(c=>frame>=c.start&&frame<c.end);
 if(clip&&base.viewOf(clip)!==candidate.viewOf(clip))changedLabels.push(frame);
 if(frame>=900&&frame<=1650&&frame%15===0)details.push({frame,seconds:frame/timeline.fps,cameraDelta:delta,baseline:{focus:pa.focus.toArray(),distance:pa.distance},candidate:{focus:pb.focus.toArray(),distance:pb.distance},baselineGut:viewWeight(frame,'gut',base.viewOf),candidateGut:viewWeight(frame,'gut',candidate.viewOf)});
}
const bounds=frames=>frames.length?[frames[0],frames.at(-1)]:null;
const all=[...changedCamera,...changedWeight,...changedLabels];
const first=Math.min(...all),last=Math.max(...all);
const recommended=[Math.floor((first-60)/30)*30,Math.ceil((last+60)/30)*30];
const seamFrames=[recommended[0]-1,recommended[0],recommended[1],recommended[1]+1];
const seams=seamFrames.map(frame=>({frame,cameraDelta:distance(a.sample(frame),b.sample(frame)),viewWeightDelta:Math.max(...['stomach','gut'].map(v=>Math.abs(viewWeight(frame,v,base.viewOf)-viewWeight(frame,v,candidate.viewOf))))}));
const sourceChecks=Object.entries(guard.sourceSHA256).map(([p,h])=>({path:p,unchanged:sha(p)===h}));
const clip=timeline.clips.find(c=>c.id==='h005');
const expected=timeline.clips.filter(c=>base.viewOf(c)!==candidate.viewOf(c)).map(c=>c.id);
if(JSON.stringify(expected)!==JSON.stringify(['h005']))throw new Error(`Unexpected changed clip set: ${expected}`);
if(seams.some(s=>s.cameraDelta!==0||s.viewWeightDelta!==0))throw new Error('Nonzero seam difference');
if(sourceChecks.some(s=>!s.unchanged))throw new Error('Production modified during CPU audit');
const data={createdAtUTC:new Date().toISOString(),method:'CPU bundle and every-integer-frame comparison; production files unchanged; no renderer/browser/GPU.',timeline:{durationFrames:timeline.duration,fps:timeline.fps,sha256:sha('src/timeline.json')},changedClips:expected,clip:{id:clip.id,start:clip.start,endExclusive:clip.end,oldView:base.viewOf(clip),newView:candidate.viewOf(clip)},actualAffectedAnchors:Object.fromEntries(['torso','stomach','small_intestine','liver'].map(k=>[k,anchors[k]])),anchorScope:'Actual manifest organ centers plus current torso constant. Other anchors read from prior camera audit only to complete the unchanged route; they cannot change this isolated interval.',cameraChangeFramesInclusive:bounds(changedCamera),weightDependencyFramesInclusive:bounds(changedWeight),labelRoutingFramesInclusive:bounds(changedLabels),allDependencyFramesInclusive:[first,last],maxPoseDifference:peak,recommendedRenderFramesInclusive:recommended,recommendedDurationFrames:recommended[1]-recommended[0]+1,recommendedStartSeconds:recommended[0]/timeline.fps,recommendedEndExclusiveSeconds:(recommended[1]+1)/timeline.fps,seamChecks:seams,sourceChecks,limitations:['CPU audit does not certify rendered organ occupancy, transparency sorting, label overlap, or final edit seams.','Small-intestine camera uses real atlas organ center; it does not fabricate epithelial absorption microgeometry.'],passed:true};
fs.writeFileSync(path.join(out,'cpu-comparison.json'),JSON.stringify(data,null,2));
fs.writeFileSync(path.join(out,'camera-samples.json'),JSON.stringify(details,null,2));
console.log(JSON.stringify(data,null,2));
