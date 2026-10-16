/** Numerical camera audit of the actual production Camera.ts, not a duplicated path. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import ts from 'typescript';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const src=path.join(root,'src'),out=path.join(root,'work','qa');
const compiled=path.join(out,'camera-compiled');
fs.mkdirSync(compiled,{recursive:true});
fs.writeFileSync(path.join(compiled,'package.json'),'{"type":"commonjs"}\n');
const snapshots={};
for(const name of ['Camera.ts','Timeline.ts']){
  const input=fs.readFileSync(path.join(src,name),'utf8');
  snapshots[name]=crypto.createHash('sha256').update(input).digest('hex');
  const result=ts.transpileModule(input,{fileName:name,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true},reportDiagnostics:true});
  const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length)throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCanonicalFileName:f=>f,getCurrentDirectory:()=>src,getNewLine:()=>"\n"}));
  fs.writeFileSync(path.join(compiled,name.replace(/\.ts$/,'.js')),result.outputText);
}
const timelineSource=fs.readFileSync(path.join(src,'timeline-data.json'));
snapshots['timeline-data.json']=crypto.createHash('sha256').update(timelineSource).digest('hex');
fs.writeFileSync(path.join(compiled,'timeline-data.json'),timelineSource);
const require=createRequire(import.meta.url);
const {sampleCamera,cameraKeys}=require(path.join(compiled,'Camera.js'));
const timeline=JSON.parse(timelineSource.toString('utf8'));
const fps=timeline.fps,dt=1/fps,total=timeline.durationFrames;
const finiteFailures=[],geometryFailures=[],keyFailures=[],c1Failures=[];
const norm=a=>Math.hypot(...a),sub=(a,b)=>a.map((v,i)=>v-b[i]),scale=(a,s)=>a.map(v=>v*s);
const poseVector=(p,k)=>k==='fov'?[p.fov]:p[k];
const sample=t=>sampleCamera(Math.min(timeline.durationSec,Math.max(0,t)));
const samples=[];
for(let frame=0;frame<=total;frame++){
  const t=Math.min(frame/fps,timeline.durationSec),p=sample(t);
  if(![...p.position,...p.target,p.fov].every(Number.isFinite))finiteFailures.push(frame);
  const distance=norm(sub(p.target,p.position));
  if(distance<=.05||p.fov<=0||p.fov>=179)geometryFailures.push({frame,distance,fov:p.fov});
  samples.push({...p,frame,t,distance});
}
for(let i=1;i<cameraKeys.length;i++)if(!(cameraKeys[i].t>cameraKeys[i-1].t))keyFailures.push({index:i,previous:cameraKeys[i-1].t,t:cameraKeys[i].t});

function peakStats(k){
  const velocities=[],accelerations=[],jerks=[];
  for(let i=1;i<samples.length;i++)velocities.push({frame:i,value:norm(scale(sub(poseVector(samples[i],k),poseVector(samples[i-1],k)),fps))});
  for(let i=1;i<samples.length-1;i++){
    const a=poseVector(samples[i-1],k),b=poseVector(samples[i],k),c=poseVector(samples[i+1],k);
    accelerations.push({frame:i,value:norm(c.map((v,j)=>(v-2*b[j]+a[j])*fps*fps))});
  }
  for(let i=2;i<samples.length-1;i++){
    const a=poseVector(samples[i-2],k),b=poseVector(samples[i-1],k),c=poseVector(samples[i],k),d=poseVector(samples[i+1],k);
    jerks.push({frame:i,value:norm(d.map((v,j)=>(v-3*c[j]+3*b[j]-a[j])*fps**3))});
  }
  const summarize=arr=>{const sorted=[...arr].sort((a,b)=>a.value-b.value);return {peak:sorted.at(-1),p95:sorted[Math.floor(sorted.length*.95)]?.value,p99:sorted[Math.floor(sorted.length*.99)]?.value,top10:sorted.slice(-10).reverse()};};
  return {speed:summarize(velocities),acceleration:summarize(accelerations),jerk:summarize(jerks)};
}

// Independent one-sided derivatives at each Hermite knot. Shrinking epsilon
// distinguishes a derivative jump from a finite second derivative.
const c1Knots=[];
for(let i=1;i<cameraKeys.length-1;i++){
  const t=cameraKeys[i].t,minGap=Math.min(t-cameraKeys[i-1].t,cameraKeys[i+1].t-t);
  const h=Math.min(1e-4,minGap*1e-4),fineH=h/10,entry={index:i,t,frame:Math.round(t*fps),channels:{}};
  for(const k of ['position','target','fov']){
    function derivatives(e){const p0=poseVector(sample(t),k),pm=poseVector(sample(t-e),k),pp=poseVector(sample(t+e),k);const left=scale(sub(p0,pm),1/e),right=scale(sub(pp,p0),1/e);return{left,right,mismatch:norm(sub(left,right))};}
    const coarse=derivatives(h),fine=derivatives(fineH),tolerance=.002+.001*Math.max(norm(fine.left),norm(fine.right));
    const pass=Number.isFinite(fine.mismatch)&&fine.mismatch<=tolerance;
    entry.channels[k]={epsilonSec:fineH,leftVelocity:fine.left,rightVelocity:fine.right,mismatch:fine.mismatch,coarseMismatch:coarse.mismatch,tolerance,pass};
    if(!pass)c1Failures.push({index:i,t,channel:k,mismatch:fine.mismatch,tolerance});
  }
  c1Knots.push(entry);
}

const angular=[];
for(let i=1;i<samples.length;i++){
  const a=sub(samples[i-1].target,samples[i-1].position),b=sub(samples[i].target,samples[i].position),d=a.reduce((s,v,j)=>s+v*b[j],0)/(norm(a)*norm(b));
  angular.push({frame:i,degreesPerSecond:Math.acos(Math.min(1,Math.max(-1,d)))*180/Math.PI*fps});
}
angular.sort((a,b)=>b.degreesPerSecond-a.degreesPerSecond);
const boundaries=timeline.groups.slice(1).map((g,index)=>{
  const frame=Math.round(g.start*fps),start=Math.max(0,frame-90),end=Math.min(total-1,frame+90);
  return {from:timeline.groups[index].id,to:g.id,t:g.start,frame,reviewRange:[start,end],allFrames:Array.from({length:end-start+1},(_,i)=>start+i),contactSheetFrames:Array.from({length:19},(_,i)=>Math.max(0,Math.min(total-1,frame-90+i*10))),boundaryPose:sample(g.start)};
});
const metrics={position:peakStats('position'),target:peakStats('target'),fov:peakStats('fov'),viewDirection:{top10AngularSpeed:angular.slice(0,10)},cameraTargetDistance:{min:Math.min(...samples.map(p=>p.distance)),max:Math.max(...samples.map(p=>p.distance))}};
const warnings=[];
if(metrics.position.speed.peak.value>10)warnings.push('Camera speed exceeds 10 world units/s: inspect station handoffs at the peak frames; this is a perceptual review threshold, not a mathematical failure.');
if(angular[0]?.degreesPerSecond>20)warnings.push('View direction exceeds 20 degrees/s: review the peak frames at normal playback speed.');
if(metrics.position.jerk.peak.value>300)warnings.push('Large finite-difference jerk near knots: path may be C1 but acceleration is not guaranteed continuous. Review peak frames.');
const pass=![finiteFailures,geometryFailures,keyFailures,c1Failures].some(a=>a.length);
const report={scope:'Actual production Camera.ts sampled every frame; numerical continuity only. Does not claim visual occlusion or full-playback QA.',pass,fps,durationFrames:total,durationSec:timeline.durationSec,samples:samples.length,sourceSha256:snapshots,coordinateUnit:'Production world units; teaching models are intentionally enlarged.',checks:{allFinite:!finiteFailures.length,validViewGeometry:!geometryFailures.length,strictlyOrderedKeys:!keyFailures.length,c1InteriorKnots:!c1Failures.length},failures:{finiteFailures,geometryFailures,keyFailures,c1Failures},metrics,c1Knots,sceneBoundaries:boundaries,warnings,visualQaStatus:'Pending representative frame and normal-speed playback review.'};
fs.writeFileSync(path.join(out,'camera-audit.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({pass,frames:total,keyCount:cameraKeys.length,c1Knots:c1Knots.length,sceneBoundaries:boundaries.length,maxPositionSpeed:metrics.position.speed.peak,maxTargetSpeed:metrics.target.speed.peak,maxPositionAcceleration:metrics.position.acceleration.peak,maxAngularSpeed:angular[0],warnings,report:path.join(out,'camera-audit.json')},null,2));
if(!pass)process.exitCode=1;
