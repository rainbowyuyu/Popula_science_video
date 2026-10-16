/** Checks the composed narration-time to scene-time to camera path at delivery fps. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),require=createRequire(import.meta.url),oldHook=require.extensions['.ts'];
require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true,resolveJsonModule:true}}).outputText,filename);
const {sampleCameraV6}=require(path.join(root,'src/CameraPathV6.ts')),{sceneTimeV6,durationInFramesV6,timeMapKnots}=require(path.join(root,'src/TimelineV6.ts'));
const narration=JSON.parse(fs.readFileSync(path.join(root,'src/narration-v6.json'),'utf8'));
const dist=(a,b)=>Math.hypot(...a.map((x,i)=>x-b[i])),unit=a=>{const d=Math.hypot(...a);return a.map(v=>v/d);},view=p=>unit(p.target.map((v,i)=>v-p.position[i]));
const failures=[],stats={frames:durationInFramesV6+1,durationSec:durationInFramesV6/30,minSceneRate:Infinity,maxSceneRate:0,maxSpeed:0,maxTargetSpeed:0,maxAngularSpeedDeg:0,maxTargetStep:0,maxPositionStep:0};
let prev=null,prevScene=null;
for(let frame=0;frame<=durationInFramesV6;frame++){
 const t=frame/30,s=sceneTimeV6(t),p=sampleCameraV6(s);
 if(![s,...p.position,...p.target].every(Number.isFinite))failures.push({kind:'nonfinite',frame});
 if(prev){
  const rate=(s-prevScene)*30,dp=dist(p.position,prev.position),dt=dist(p.target,prev.target),a=view(p),b=view(prev),angle=Math.acos(Math.min(1,Math.max(-1,a.reduce((sum,v,i)=>sum+v*b[i],0))))*180/Math.PI*30;
  stats.minSceneRate=Math.min(stats.minSceneRate,rate);stats.maxSceneRate=Math.max(stats.maxSceneRate,rate);stats.maxSpeed=Math.max(stats.maxSpeed,dp*30);stats.maxTargetSpeed=Math.max(stats.maxTargetSpeed,dt*30);stats.maxAngularSpeedDeg=Math.max(stats.maxAngularSpeedDeg,angle);stats.maxTargetStep=Math.max(stats.maxTargetStep,dt);stats.maxPositionStep=Math.max(stats.maxPositionStep,dp);
  if(rate<0)failures.push({kind:'time-reversal',frame,rate});if(angle>22)failures.push({kind:'angular-speed',frame,angle});if(dp*30>12)failures.push({kind:'camera-speed',frame,speed:dp*30});if(dt*30>12)failures.push({kind:'target-speed',frame,speed:dt*30});
 }
 prev=p;prevScene=s;
}
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex');
const report={status:failures.length?'FAIL':'PASS',stats,sceneEnd:sceneTimeV6(narration.durationSec),knots:timeMapKnots,sourceHashes:{narration:sha('src/narration-v6.json'),camera:sha('src/CameraPathV6.ts'),timeline:sha('src/TimelineV6.ts')},failures:failures.slice(0,100),scope:'Actual duration metadata and chapter retiming combined with V6 camera at 30fps. No claim of measured audio accuracy or rendered picture QA.'};
fs.writeFileSync(path.join(root,'research/retimed-camera-qa-v6.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));require.extensions['.ts']=oldHook;if(failures.length)process.exitCode=1;
