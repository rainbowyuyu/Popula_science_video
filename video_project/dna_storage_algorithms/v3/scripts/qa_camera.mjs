import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import * as THREE from 'three';
import crypto from 'node:crypto';

// These checks establish numeric camera safety, not a claim of visual approval.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const sourcePath = path.join(root, 'src/CameraPathV3.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {target:ts.ScriptTarget.ES2022, module:ts.ModuleKind.ES2022},
  reportDiagnostics:true,
});
const diagnostics = (compiled.diagnostics ?? []).filter(d=>d.category===ts.DiagnosticCategory.Error);
if (diagnostics.length) throw new Error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
  getCanonicalFileName:x=>x, getCurrentDirectory:()=>root, getNewLine:()=> '\n',
}));
const {sampleCamera,STATIONS,CAMERA_KEYS} = await import(
  `data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`
);
const errors = [];
const failures = (condition, text) => {if (!condition && errors.length<100) errors.push(text);};
const distance = (a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const diff = (a,b,step)=>a.map((v,i)=>(v-b[i])/step);
const dot = (a,b)=>a.reduce((sum,x,i)=>sum+x*b[i],0);
const unit = a=>a.map(v=>v/Math.hypot(...a));
const look = s=>unit(s.target.map((v,i)=>v-s.position[i]));
const keyTime = key=>key.time ?? key.t ?? key.timeSec ?? key.at;
failures(!/\b(?:Date\.now|Math\.random|performance\.now|requestAnimationFrame)\s*\(/.test(source),'Nondeterministic camera source');
failures(STATIONS[0].start===0&&STATIONS.at(-1).end===300,'Station duration is not300 seconds');
for(let i=0;i<STATIONS.length;i++){
  failures(STATIONS[i].end>STATIONS[i].start,`Empty station ${i}`);
  if(i)failures(STATIONS[i].start===STATIONS[i-1].end,`Station timeline gap ${i}`);
}
for(let i=1;i<CAMERA_KEYS.length;i++)failures(keyTime(CAMERA_KEYS[i])>keyTime(CAMERA_KEYS[i-1]),`Unsorted/duplicate camera key ${i}`);
const stats = {
  samples:9001, minDistance:Infinity, maxDistance:0, minFov:Infinity,
  maxFov:-Infinity, minZ:Infinity, maxZ:-Infinity, maxSpeed:0,
  maxTargetSpeed:0, maxAngularSpeedDeg:0, maxFovSpeed:0,
  maxPositionDerivativeDiscontinuity:0, maxTargetDerivativeDiscontinuity:0,
  maxFovDerivativeDiscontinuity:0, conservativeSafeFrameChecks:0,
};
const safeProjection = [];
const camera = new THREE.PerspectiveCamera(40,16/9,.1,500);
const assertSample = (s,t)=>{
  failures([...s.position,...s.target,s.fov,s.transition,s.stationIndex].every(Number.isFinite),`Nonfinite sample ${t}`);
  const d=distance(s.position,s.target);
  stats.minDistance=Math.min(stats.minDistance,d);stats.maxDistance=Math.max(stats.maxDistance,d);
  stats.minFov=Math.min(stats.minFov,s.fov);stats.maxFov=Math.max(stats.maxFov,s.fov);
  stats.minZ=Math.min(stats.minZ,s.position[2]);stats.maxZ=Math.max(stats.maxZ,s.position[2]);
  failures(d>=12 && d<=24,`Look distance ${d} at ${t}`);
  failures(s.fov>=37.99 && s.fov<=42.01,`FOV ${s.fov} at ${t}`);
  failures(s.position[2]>=12.99 && s.position[2]<=18.61,`Camera z ${s.position[2]} at ${t}`);
  failures(s.target[2]<s.position[2]-12,`Camera does not face mechanisms at ${t}`);
  failures(Number.isInteger(s.stationIndex) && s.stationIndex>=0 && s.stationIndex<STATIONS.length,`Station index at ${t}`);
  failures(s.transition>=0 && s.transition<=1,`Transition outside0..1 at ${t}`);
};
let previous = sampleCamera(0);
for(let frame=0;frame<=9000;frame++) {
  const t=frame/30,s=sampleCamera(t);assertSample(s,t);
  if(frame>0){
    stats.maxSpeed=Math.max(stats.maxSpeed,30*distance(previous.position,s.position));
    stats.maxTargetSpeed=Math.max(stats.maxTargetSpeed,30*distance(previous.target,s.target));
    const angle=Math.acos(Math.max(-1,Math.min(1,dot(look(previous),look(s)))))*180/Math.PI*30;
    stats.maxAngularSpeedDeg=Math.max(stats.maxAngularSpeedDeg,angle);
    stats.maxFovSpeed=Math.max(stats.maxFovSpeed,Math.abs(previous.fov-s.fov)*30);
    failures(distance(previous.position,s.position)<.5,`Frame jump at ${frame}`);
  }
  previous=s;
  const station=STATIONS[s.stationIndex];
  const stable=t>=station.start+3 && t<=station.end-3;
  // Check 1 Hz during explanatory dwell; transitions intentionally share two stations.
  if(stable && frame%30===0){
    camera.fov=s.fov;camera.position.set(...s.position);camera.lookAt(...s.target);
    camera.updateProjectionMatrix();camera.updateMatrixWorld(true);
    let left=1,right=-1,top=-1,bottom=1;
    for(const x of [-5,5])for(const y of [-2,3])for(const z of [-2.5,2.5]){
      const p=new THREE.Vector3(station.origin[0]+x,station.origin[1]+y,station.origin[2]+z).project(camera);
      left=Math.min(left,p.x);right=Math.max(right,p.x);bottom=Math.min(bottom,p.y);top=Math.max(top,p.y);
    }
    // The authored framing may crop secondary mechanisms. This is diagnostic,
    // never a fake guarantee that the actual art, labels or captions are clear.
    const secondaryEnvelopeCropped=left<-.98||right>.98||top>.98||bottom<-.98;
    safeProjection.push({t,station:station.id,left,right,top,bottom,secondaryEnvelopeCropped});
    stats.conservativeSafeFrameChecks++;
  }
}
const times=[...new Set([...CAMERA_KEYS.map(keyTime),...STATIONS.slice(1).map(s=>s.start)])];
const epsilon=1e-5;
for(const t of times){
  if(!(t>0&&t<300)) continue;
  const a=sampleCamera(t-epsilon),b=sampleCamera(t),c=sampleCamera(t+epsilon);
  const pv=distance(diff(b.position,a.position,epsilon),diff(c.position,b.position,epsilon));
  const tv=distance(diff(b.target,a.target,epsilon),diff(c.target,b.target,epsilon));
  const fv=Math.abs((b.fov-a.fov)/epsilon-(c.fov-b.fov)/epsilon);
  stats.maxPositionDerivativeDiscontinuity=Math.max(stats.maxPositionDerivativeDiscontinuity,pv);
  stats.maxTargetDerivativeDiscontinuity=Math.max(stats.maxTargetDerivativeDiscontinuity,tv);
  stats.maxFovDerivativeDiscontinuity=Math.max(stats.maxFovDerivativeDiscontinuity,fv);
  failures(pv<.01&&tv<.01&&fv<.01,`C1 discontinuity at ${t}: ${[pv,tv,fv]}`);
}
for(const station of STATIONS.slice(1)){
  let previousX=sampleCamera(station.start-3).position[0];
  for(let k=1;k<=180;k++){
    const x=sampleCamera(station.start-3+k/30).position[0];
    failures(x>=previousX-1e-7,`Reverse corridor travel at ${station.start-3+k/30}`);
    previousX=x;
  }
}
for(const t of [NaN,Infinity,-Infinity,-100,400]) {
  const s=sampleCamera(t);failures([...s.position,...s.target,s.fov].every(Number.isFinite),`Invalid input handling ${t}`);
}
// A renderer may seek backward or render chunks concurrently. Seek order must
// not change a pose; this catches accidental mutable spline state.
for(let frame=0;frame<=9000;frame+=137){
  const expected=JSON.stringify(sampleCamera(frame/30));
  sampleCamera(((frame*7919)%9001)/30);
  failures(JSON.stringify(sampleCamera(frame/30))===expected,`Stateful sampling at ${frame}`);
}
failures(stats.maxSpeed<10,'Camera exceeds10 world units/second');
failures(stats.maxAngularSpeedDeg<12,'Camera angular rate exceeds12 degrees/second');
const report={status:errors.length?'FAIL':'PASS',sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),scope:'Numeric full-frame camera continuity and orientation. Mechanism envelope projections are diagnostics only; secondary geometry may intentionally crop. No rendered appearance or occlusion assertion.',stats,keys:times,errors,safeProjection};
fs.mkdirSync(path.join(root,'research'),{recursive:true});
fs.writeFileSync(path.join(root,'research/camera-qa-v3.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({status:report.status,stats,errors},null,2));
if(errors.length)process.exitCode=1;
