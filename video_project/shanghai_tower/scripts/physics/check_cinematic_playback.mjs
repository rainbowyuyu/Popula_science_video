import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
const root=process.cwd(),out=path.join(root,'tmp/check-cinematic-playback.mjs');
await build({stdin:{contents:`export {PhysicsPlayback} from './src/PhysicsPlayback';export {HighResolutionResponse} from './src/HighResolutionResponse';export {stateAt,physicalTimeAt} from './src/visual';`,resolveDir:root},outfile:out,bundle:true,platform:'node',format:'esm',external:['three'],logLevel:'error'});
const {PhysicsPlayback,HighResolutionResponse,stateAt,physicalTimeAt}=await import(pathToFileURL(out));
const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const meta=json('public/physics/cinematic-response.json'),raw=fs.readFileSync('public/physics/cinematic-response.f32');
const high=new HighResolutionResponse(meta,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
const data=json('public/physics/response.json'),environment=json('public/physics/environment-response.json'),tl=json('src/timeline.json');
const physics=new PhysicsPlayback(data,tl,high);physics.setCoreBending(environment.tmd);
const ids=new Map(data.nodes.map((n,i)=>[n.id,i])),top=ids.get(environment.tmd.supportNodeId);
let maxDisplacementError=0,maxStressError=0,maxCoreError=0;
const U=new Float32Array(data.nodes.length*3),R=new Float32Array(U.length),A=new Float32Array(data.members.length);
for(let j=0;j<data.dynamic.time.length;j++){
 high.sample(data.dynamic.time[j],U,R,A);
 for(let i=0;i<U.length;i++)maxDisplacementError=Math.max(maxDisplacementError,Math.abs(U[i]-data.dynamic.u[j][Math.floor(i/3)][i%3]));
 for(let i=0;i<A.length;i++)maxStressError=Math.max(maxStressError,Math.abs(A[i]-data.dynamic.axialMPa[j][i]));
}
for(let j=0;j<environment.tmd.time.length;j++){
 high.sample(environment.tmd.time[j],U,R,A);maxCoreError=Math.max(maxCoreError,Math.abs(U[top*3]-environment.tmd.supportX_m[j]));
}
const wind=tl.sections.find(x=>x.id==='wind'),damper=tl.sections.find(x=>x.id==='damper');
let previous=-1,maxStep=0,maxRenderReadoutClockError=0,maxAnchorError=0;
for(let f=wind.start;f<damper.end;f++){
 const state=stateAt(f,tl),t=physicalTimeAt(state,tl);physics.update(state);
 if(t<previous)throw new Error('Physics clock reversed');if(previous>=0)maxStep=Math.max(maxStep,t-previous);previous=t;
 maxRenderReadoutClockError=Math.max(maxRenderReadoutClockError,Math.abs(t-physics.physicalTime(state)));
 const xyz=data.nodes[top].xyz;const p={clone:()=>null};
 // Anchor coordinates use the same current solver U as the mesh, tested below
 // with the genuine Three.js Vector3 from the bundled module dependency.
 const {Vector3}=await import('three');
 const actual=physics.displacementAt(new Vector3(...xyz).multiplyScalar(.01));
 const expected=physics.currentU[top*3]*.01*physics.play.weight*physics.play.scale;
 maxAnchorError=Math.max(maxAnchorError,Math.abs(actual.x-expected));
}
high.sample(0,U,R,A);const zero=Math.max(...U.map(Math.abs),...R.map(Math.abs),...A.map(Math.abs));
const checks={sourceDisplacement:maxDisplacementError<1e-7,sourceStress:maxStressError<2e-5,tmdAgreement:maxCoreError<1e-6,clockAgreement:maxRenderReadoutClockError===0,continuousClock:maxStep<.05,anchorAgreement:maxAnchorError<1e-8,initialZero:zero===0};
const report={passed:Object.values(checks).every(Boolean),checks,maxDisplacementError_m:maxDisplacementError,maxStressError_MPa:maxStressError,maxCoreError_m:maxCoreError,maxPhysicsTimeStep_s:maxStep,maxRenderReadoutClockError_s:maxRenderReadoutClockError,maxAnchorError_sceneUnits:maxAnchorError,renderFramesChecked:damper.end-wind.start,solverSamples:meta.time.count};
fs.writeFileSync('research/visual-v4/playback-verification.json',JSON.stringify(report,null,2));console.log(report);if(!report.passed)process.exit(1);
