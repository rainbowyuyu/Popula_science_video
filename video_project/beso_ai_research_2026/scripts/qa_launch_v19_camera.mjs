import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{build}=require('esbuild');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const result=await build({stdin:{contents:"export * from './src/launch-v19-direction';export * from './src/beso/LaunchV18Camera';",resolveDir:root,loader:'ts'},bundle:true,write:false,platform:'node',format:'esm'});
const m=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
const story=JSON.parse(fs.readFileSync(path.join(root,'src/launch-v19-story.json'),'utf8'));
let previous=null,maxStep=0,minTargetDistance=Infinity,monotone=true,finite=true;
for(let frame=0;frame<=story.duration;frame++){
 const t=frame/60,w=m.worldTime(t),c=m.sampleV18Camera(w);
 finite&&=[w,...c.position.toArray(),...c.target.toArray(),c.fov,c.viewOffsetX].every(Number.isFinite);
 minTargetDistance=Math.min(minTargetDistance,c.position.distanceTo(c.target));
 if(previous){monotone&&=w>=previous.w;maxStep=Math.max(maxStep,c.position.distanceTo(previous.p));}
 previous={w,p:c.position};
}
const boundaries=story.scenes.slice(1).map(s=>{
 const t=s.start/60,h=1e-5,a=m.worldTime(t-h),b=m.worldTime(t),c=m.worldTime(t+h);
 return{id:s.id,time:t,worldTime:b,velocityBefore:(b-a)/h,velocityAfter:(c-b)/h,difference:Math.abs((b-a)/h-(c-b)/h)};
});
const report={schema:'launch-v19-camera-continuity-v1',frames:story.duration,finite,monotone,minTargetDistance,maxFrameStep:maxStep,boundaries,
 passed:finite&&monotone&&minTargetDistance>5&&boundaries.every(b=>b.difference<.002),
 limitation:'Numerical route checks only. The physical sheet intentionally masks fast travel between the sea and studio; visibility, typography and aesthetic QA require rendered frames.'};
fs.writeFileSync(path.join(root,'research/qa/v19-camera-continuity.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));if(!report.passed)process.exitCode=1;
